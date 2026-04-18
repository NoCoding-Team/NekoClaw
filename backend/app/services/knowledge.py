"""
Server-side knowledge base: per-user file storage, SQLite FTS5 indexing, hybrid search.
Files stored at storage/{user_id}/knowledge/, index at storage/{user_id}/knowledge.db
"""
import json
import math
import os
import re
import sqlite3
import struct
from asyncio import get_event_loop
from functools import partial
from pathlib import Path
from typing import Any

import httpx

STORAGE_ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "storage")
CHUNK_TOKENS = 512
CHUNK_OVERLAP = 128
SUPPORTED_EXTS = {".md", ".txt", ".pdf"}


def _user_kb_dir(user_id: str) -> str:
    d = os.path.join(STORAGE_ROOT, user_id, "knowledge")
    os.makedirs(d, exist_ok=True)
    return d


def _user_kb_db_path(user_id: str) -> str:
    d = os.path.join(STORAGE_ROOT, user_id)
    os.makedirs(d, exist_ok=True)
    return os.path.join(d, "knowledge.db")


def _init_db(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS kb_chunks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_path TEXT NOT NULL,
            chunk_index INTEGER NOT NULL,
            content TEXT NOT NULL,
            mtime REAL NOT NULL,
            embedding BLOB
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_kb_chunks_file ON kb_chunks(file_path)")
    # FTS5 virtual table
    conn.execute("""
        CREATE VIRTUAL TABLE IF NOT EXISTS kb_fts USING fts5(
            content, content=kb_chunks, content_rowid=id
        )
    """)
    # Triggers to keep FTS in sync
    conn.execute("""
        CREATE TRIGGER IF NOT EXISTS kb_fts_ai AFTER INSERT ON kb_chunks BEGIN
            INSERT INTO kb_fts(rowid, content) VALUES (new.id, new.content);
        END
    """)
    conn.execute("""
        CREATE TRIGGER IF NOT EXISTS kb_fts_ad AFTER DELETE ON kb_chunks BEGIN
            INSERT INTO kb_fts(kb_fts, rowid, content) VALUES ('delete', old.id, old.content);
        END
    """)
    conn.execute("""
        CREATE TRIGGER IF NOT EXISTS kb_fts_au AFTER UPDATE ON kb_chunks BEGIN
            INSERT INTO kb_fts(kb_fts, rowid, content) VALUES ('delete', old.id, old.content);
            INSERT INTO kb_fts(rowid, content) VALUES (new.id, new.content);
        END
    """)
    conn.commit()
    return conn


# ── Text chunking ──────────────────────────────────────────────────────

def _approx_tokens(text: str) -> int:
    return len(text) // 3  # rough CJK-friendly estimate


def chunk_text(text: str) -> list[str]:
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
                # Split long paragraph by fixed window
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


# ── File parsing ───────────────────────────────────────────────────────

def _parse_file(file_path: str) -> str | None:
    ext = os.path.splitext(file_path)[1].lower()
    if ext in (".md", ".txt"):
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            return f.read()
    elif ext == ".pdf":
        try:
            import fitz  # PyMuPDF
            doc = fitz.open(file_path)
            text = "\n".join(page.get_text() for page in doc)
            doc.close()
            return text
        except ImportError:
            return None
    return None


# ── Embedding ──────────────────────────────────────────────────────────

async def _get_embedding(texts: list[str], config: dict[str, str]) -> list[list[float]] | None:
    """Call OpenAI-compatible embedding API. config: {base_url, model, api_key}"""
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


# ── Indexing ───────────────────────────────────────────────────────────

def _index_file_sync(db_path: str, file_path: str, base_dir: str, embedding_config: dict | None = None) -> int:
    """Index a single file. Returns number of chunks created."""
    conn = _init_db(db_path)
    rel = os.path.relpath(file_path, base_dir)
    mtime = os.path.getmtime(file_path)

    # Check if already indexed at same mtime
    row = conn.execute(
        "SELECT mtime FROM kb_chunks WHERE file_path = ? LIMIT 1", (rel,)
    ).fetchone()
    if row and abs(row[0] - mtime) < 0.01:
        conn.close()
        return 0

    # Remove old chunks
    conn.execute("DELETE FROM kb_chunks WHERE file_path = ?", (rel,))

    text = _parse_file(file_path)
    if not text or not text.strip():
        conn.commit()
        conn.close()
        return 0

    chunks = chunk_text(text)
    for i, chunk in enumerate(chunks):
        conn.execute(
            "INSERT INTO kb_chunks (file_path, chunk_index, content, mtime) VALUES (?, ?, ?, ?)",
            (rel, i, chunk, mtime),
        )
    conn.commit()
    conn.close()
    return len(chunks)


async def index_file(user_id: str, file_path: str, embedding_config: dict | None = None) -> int:
    db_path = _user_kb_db_path(user_id)
    base_dir = _user_kb_dir(user_id)
    loop = get_event_loop()
    count = await loop.run_in_executor(None, partial(_index_file_sync, db_path, file_path, base_dir, embedding_config))

    # If embedding config provided, update embeddings
    if embedding_config and count > 0:
        await _update_embeddings(user_id, embedding_config)

    return count


async def _update_embeddings(user_id: str, config: dict) -> None:
    db_path = _user_kb_db_path(user_id)
    conn = _init_db(db_path)
    rows = conn.execute(
        "SELECT id, content FROM kb_chunks WHERE embedding IS NULL"
    ).fetchall()
    conn.close()
    if not rows:
        return

    batch_size = 50
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        texts = [r[1] for r in batch]
        embeddings = await _get_embedding(texts, config)
        if not embeddings:
            break
        conn = _init_db(db_path)
        for (row_id, _), emb in zip(batch, embeddings):
            conn.execute(
                "UPDATE kb_chunks SET embedding = ? WHERE id = ?",
                (_pack_embedding(emb), row_id),
            )
        conn.commit()
        conn.close()


async def build_full_index(user_id: str, embedding_config: dict | None = None) -> int:
    """Scan knowledge directory and index all supported files. Returns total chunks."""
    kb_dir = _user_kb_dir(user_id)
    total = 0
    for root, _, files in os.walk(kb_dir):
        for fname in files:
            ext = os.path.splitext(fname)[1].lower()
            if ext not in SUPPORTED_EXTS:
                continue
            fpath = os.path.join(root, fname)
            total += await index_file(user_id, fpath, None)

    if embedding_config and total > 0:
        await _update_embeddings(user_id, embedding_config)
    return total


def remove_file_index(user_id: str, rel_path: str) -> None:
    db_path = _user_kb_db_path(user_id)
    if not os.path.exists(db_path):
        return
    conn = _init_db(db_path)
    conn.execute("DELETE FROM kb_chunks WHERE file_path = ?", (rel_path,))
    conn.commit()
    conn.close()


# ── Search ─────────────────────────────────────────────────────────────

async def search_knowledge(
    user_id: str,
    query: str,
    top_k: int = 5,
    embedding_config: dict | None = None,
) -> list[dict[str, Any]]:
    db_path = _user_kb_db_path(user_id)
    if not os.path.exists(db_path):
        return []

    conn = _init_db(db_path)

    # FTS5 BM25 search
    fts_results: dict[int, float] = {}
    try:
        rows = conn.execute(
            "SELECT rowid, rank FROM kb_fts WHERE kb_fts MATCH ? ORDER BY rank LIMIT ?",
            (query, top_k * 3),
        ).fetchall()
        for row_id, rank in rows:
            fts_results[row_id] = -rank  # FTS5 rank is negative, lower = better
    except Exception:
        pass

    # Vector search (if embeddings available and config provided)
    vec_results: dict[int, float] = {}
    if embedding_config:
        query_emb = await _get_embedding([query], embedding_config)
        if query_emb:
            q_vec = query_emb[0]
            emb_rows = conn.execute(
                "SELECT id, embedding FROM kb_chunks WHERE embedding IS NOT NULL"
            ).fetchall()
            for row_id, emb_blob in emb_rows:
                vec = _unpack_embedding(emb_blob)
                sim = _cosine_similarity(q_vec, vec)
                vec_results[row_id] = sim

    # Merge scores
    all_ids = set(fts_results.keys()) | set(vec_results.keys())
    scored: list[tuple[int, float]] = []

    if fts_results and vec_results:
        # Normalize both to 0-1
        max_fts = max(fts_results.values()) if fts_results else 1.0
        max_vec = max(vec_results.values()) if vec_results else 1.0
        for rid in all_ids:
            fts_score = fts_results.get(rid, 0.0) / max_fts if max_fts else 0
            vec_score = vec_results.get(rid, 0.0) / max_vec if max_vec else 0
            scored.append((rid, 0.5 * fts_score + 0.5 * vec_score))
    elif fts_results:
        for rid, s in fts_results.items():
            scored.append((rid, s))
    elif vec_results:
        for rid, s in vec_results.items():
            scored.append((rid, s))

    scored.sort(key=lambda x: x[1], reverse=True)
    top_ids = [rid for rid, _ in scored[:top_k]]

    if not top_ids:
        conn.close()
        return []

    placeholders = ",".join("?" * len(top_ids))
    rows = conn.execute(
        f"SELECT id, file_path, chunk_index, content FROM kb_chunks WHERE id IN ({placeholders})",
        top_ids,
    ).fetchall()
    conn.close()

    row_map = {r[0]: r for r in rows}
    results = []
    for rid, score in scored[:top_k]:
        if rid in row_map:
            _, fp, ci, content = row_map[rid]
            results.append({
                "filePath": fp,
                "chunkIndex": ci,
                "content": content,
                "score": round(score, 4),
            })
    return results


def has_index(user_id: str) -> bool:
    db_path = _user_kb_db_path(user_id)
    if not os.path.exists(db_path):
        return False
    try:
        conn = sqlite3.connect(db_path)
        row = conn.execute("SELECT COUNT(*) FROM kb_chunks").fetchone()
        conn.close()
        return row is not None and row[0] > 0
    except Exception:
        return False


def list_files(user_id: str) -> list[str]:
    kb_dir = _user_kb_dir(user_id)
    files = []
    for root, _, fnames in os.walk(kb_dir):
        for fname in fnames:
            ext = os.path.splitext(fname)[1].lower()
            if ext in SUPPORTED_EXTS:
                files.append(os.path.relpath(os.path.join(root, fname), kb_dir))
    return files
