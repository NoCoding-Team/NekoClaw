"""
Memory RAG index: per-user SQLite FTS5 index for MEMORY.md.
When MEMORY.md exceeds 4000 chars, build_system_prompt uses this index
for RAG-based injection instead of full-text injection.

Reuses chunking and embedding patterns from knowledge.py but with a
physically separate DB at {STORAGE_ROOT}/{user_id}/memory_index.db.
"""
import math
import os
import re
import sqlite3
import struct
from typing import Any

import httpx

STORAGE_ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "storage")
CHUNK_TOKENS = 256
CHUNK_OVERLAP = 64


def _user_memory_db_path(user_id: str) -> str:
    d = os.path.join(STORAGE_ROOT, user_id)
    os.makedirs(d, exist_ok=True)
    return os.path.join(d, "memory_index.db")


def _init_db(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS mem_chunks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_path TEXT NOT NULL,
            chunk_index INTEGER NOT NULL,
            content TEXT NOT NULL,
            embedding BLOB
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_mem_chunks_file ON mem_chunks(file_path)")
    conn.execute("""
        CREATE VIRTUAL TABLE IF NOT EXISTS mem_fts USING fts5(
            content, content=mem_chunks, content_rowid=id
        )
    """)
    conn.execute("""
        CREATE TRIGGER IF NOT EXISTS mem_fts_ai AFTER INSERT ON mem_chunks BEGIN
            INSERT INTO mem_fts(rowid, content) VALUES (new.id, new.content);
        END
    """)
    conn.execute("""
        CREATE TRIGGER IF NOT EXISTS mem_fts_ad AFTER DELETE ON mem_chunks BEGIN
            INSERT INTO mem_fts(mem_fts, rowid, content) VALUES ('delete', old.id, old.content);
        END
    """)
    conn.execute("""
        CREATE TRIGGER IF NOT EXISTS mem_fts_au AFTER UPDATE ON mem_chunks BEGIN
            INSERT INTO mem_fts(mem_fts, rowid, content) VALUES ('delete', old.id, old.content);
            INSERT INTO mem_fts(rowid, content) VALUES (new.id, new.content);
        END
    """)
    conn.commit()
    return conn


# ── Chunking ────────────────────────────────────────────────────────────

def _approx_tokens(text: str) -> int:
    return len(text) // 3


def _chunk_text(text: str) -> list[str]:
    paragraphs = re.split(r"\n{2,}", text.strip())
    chunks: list[str] = []
    buf = ""
    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        candidate = (buf + "\n\n" + para).strip() if buf else para
        if _approx_tokens(candidate) <= CHUNK_TOKENS:
            buf = candidate
        else:
            if buf:
                chunks.append(buf)
            if _approx_tokens(para) > CHUNK_TOKENS:
                words = para
                start = 0
                while start < len(words):
                    end = min(start + CHUNK_TOKENS * 3, len(words))
                    chunks.append(words[start:end])
                    start = end - CHUNK_OVERLAP * 3
                    if start < 0:
                        break
                buf = ""
            else:
                buf = para
    if buf:
        chunks.append(buf)
    return chunks if chunks else [text[:CHUNK_TOKENS * 3]] if text.strip() else []


# ── Embedding helpers ───────────────────────────────────────────────────

async def _get_embedding(texts: list[str], config: dict[str, str]) -> list[list[float]] | None:
    base_url = config.get("base_url", "").rstrip("/")
    model = config.get("model", "")
    api_key = config.get("api_key", "")
    if not base_url or not model or not api_key:
        return None
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{base_url}/embeddings",
                json={"input": texts, "model": model},
                headers={"Authorization": f"Bearer {api_key}"},
            )
            resp.raise_for_status()
            data = resp.json()
            return [item["embedding"] for item in data["data"]]
    except Exception:
        return None


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def _pack_embedding(vec: list[float]) -> bytes:
    return struct.pack(f"{len(vec)}f", *vec)


def _unpack_embedding(blob: bytes) -> list[float]:
    n = len(blob) // 4
    return list(struct.unpack(f"{n}f", blob))


# ── Index build ─────────────────────────────────────────────────────────

async def rebuild_memory_index(user_id: str, embedding_config: dict | None = None) -> int:
    """Rebuild the FTS5 index for MEMORY.md. Returns number of chunks."""
    from app.core.config import settings

    memory_path = os.path.join(settings.MEMORY_FILES_DIR, user_id, "MEMORY.md")
    if not os.path.isfile(memory_path):
        return 0

    with open(memory_path, "r", encoding="utf-8") as f:
        content = f.read().strip()
    if not content:
        return 0

    chunks = _chunk_text(content)

    # Get embeddings if config available
    embeddings: list[list[float]] | None = None
    if embedding_config:
        embeddings = await _get_embedding(chunks, embedding_config)

    db_path = _user_memory_db_path(user_id)
    conn = _init_db(db_path)
    try:
        # Clear existing MEMORY.md chunks
        conn.execute("DELETE FROM mem_chunks WHERE file_path = ?", ("MEMORY.md",))
        for i, chunk in enumerate(chunks):
            emb_blob = _pack_embedding(embeddings[i]) if embeddings and i < len(embeddings) else None
            conn.execute(
                "INSERT INTO mem_chunks (file_path, chunk_index, content, embedding) VALUES (?, ?, ?, ?)",
                ("MEMORY.md", i, chunk, emb_blob),
            )
        conn.commit()
    finally:
        conn.close()

    return len(chunks)


# ── Search ──────────────────────────────────────────────────────────────

async def search_memory_index(
    user_id: str,
    query: str,
    top_k: int = 10,
    embedding_config: dict | None = None,
) -> list[dict[str, Any]]:
    """Search memory index using FTS5 + optional vector hybrid. Returns list of {content, score}."""
    db_path = _user_memory_db_path(user_id)
    if not os.path.isfile(db_path):
        return []

    conn = _init_db(db_path)
    results: dict[int, dict] = {}

    try:
        # FTS5 keyword search
        try:
            # Escape special FTS5 characters
            fts_query = re.sub(r'[^\w\s]', ' ', query)
            fts_query = ' OR '.join(w for w in fts_query.split() if w)
            if fts_query:
                rows = conn.execute(
                    "SELECT mc.id, mc.content, mc.embedding, rank "
                    "FROM mem_fts "
                    "JOIN mem_chunks mc ON mc.id = mem_fts.rowid "
                    "WHERE mem_fts MATCH ? "
                    "ORDER BY rank "
                    "LIMIT ?",
                    (fts_query, top_k * 2),
                ).fetchall()
                for row_id, content, emb_blob, rank in rows:
                    # FTS5 rank is negative (more negative = more relevant)
                    fts_score = 1.0 / (1.0 + abs(rank))
                    results[row_id] = {"content": content, "score": fts_score, "embedding": emb_blob}
        except Exception:
            pass  # FTS query might fail on edge cases

        # Vector search if embedding available
        if embedding_config:
            query_emb_list = await _get_embedding([query], embedding_config)
            if query_emb_list:
                query_emb = query_emb_list[0]
                rows = conn.execute(
                    "SELECT id, content, embedding FROM mem_chunks WHERE embedding IS NOT NULL"
                ).fetchall()
                for row_id, content, emb_blob in rows:
                    if not emb_blob:
                        continue
                    vec = _unpack_embedding(emb_blob)
                    sim = _cosine_similarity(query_emb, vec)
                    if row_id in results:
                        # Hybrid: 30% keyword + 70% vector
                        results[row_id]["score"] = 0.3 * results[row_id]["score"] + 0.7 * sim
                    else:
                        results[row_id] = {"content": content, "score": 0.7 * sim, "embedding": emb_blob}
    finally:
        conn.close()

    # Sort by score descending, return top_k
    sorted_results = sorted(results.values(), key=lambda x: x["score"], reverse=True)[:top_k]
    return [{"content": r["content"], "score": r["score"]} for r in sorted_results]
