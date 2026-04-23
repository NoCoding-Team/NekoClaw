"""
LlamaIndex-powered hybrid memory search service.

Replaces the hand-written SQLite FTS5 + cosine similarity implementation
(memory_index.py) with LlamaIndex PGVectorStore + BM25Retriever backed
by PostgreSQL (pgvector extension).

Hybrid scoring: 30% BM25 (jieba Chinese tokeniser) + 70% vector cosine.
"""
from __future__ import annotations

import json
import logging
import os
import re
from typing import Any
from urllib.parse import urlparse

import jieba
from sqlalchemy import text as sa_text

from app.core.config import settings

logger = logging.getLogger(__name__)

# ── BM25 node cache (per-user, process-local) ──────────────────────────────

_bm25_cache: dict[str, list[Any]] = {}  # user_id -> list[TextNode]

# ── Lazy singletons ────────────────────────────────────────────────────────

_vector_store: Any | None = None
_embed_model: Any | None = None
_pgvector_ok: bool | None = None  # None = not checked yet


def _parse_pg_url(url: str) -> dict[str, Any]:
    """Parse DATABASE_URL (asyncpg format) into PGVectorStore params."""
    # Convert postgresql+asyncpg:// → postgresql://
    clean = re.sub(r"^postgresql\+asyncpg", "postgresql", url)
    p = urlparse(clean)
    return {
        "host": p.hostname or "localhost",
        "port": str(p.port or 5432),
        "database": (p.path or "/nekoclaw").lstrip("/"),
        "user": p.username or "postgres",
        "password": p.password or "",
    }


def _get_embed_model() -> Any | None:
    """Return OpenAI-compatible embedding model or None if not configured."""
    global _embed_model
    if _embed_model is not None:
        return _embed_model
    if not (settings.EMBEDDING_BASE_URL and settings.EMBEDDING_MODEL and settings.EMBEDDING_API_KEY):
        return None
    try:
        from llama_index.embeddings.openai import OpenAIEmbedding
        _embed_model = OpenAIEmbedding(
            api_base=settings.EMBEDDING_BASE_URL,
            api_key=settings.EMBEDDING_API_KEY,
            model_name=settings.EMBEDDING_MODEL,
        )
        return _embed_model
    except Exception:
        logger.warning("Failed to initialize embedding model", exc_info=True)
        return None


async def _check_pgvector() -> bool:
    """Check if pgvector extension is available in PostgreSQL."""
    global _pgvector_ok
    if _pgvector_ok is not None:
        return _pgvector_ok
    try:
        from app.models.base import engine
        async with engine.connect() as conn:
            result = await conn.execute(sa_text("SELECT 1 FROM pg_extension WHERE extname = 'vector'"))
            _pgvector_ok = result.scalar() is not None
    except Exception:
        _pgvector_ok = False
    if not _pgvector_ok:
        logger.warning("pgvector extension not available — falling back to BM25-only search")
    return _pgvector_ok


def _get_vector_store() -> Any | None:
    """Return PGVectorStore singleton or None if pgvector/embedding unavailable."""
    global _vector_store
    if _vector_store is not None:
        return _vector_store
    if _get_embed_model() is None:
        return None
    try:
        from llama_index.vector_stores.postgres import PGVectorStore
        pg = _parse_pg_url(settings.DATABASE_URL)
        _vector_store = PGVectorStore.from_params(
            host=pg["host"],
            port=pg["port"],
            database=pg["database"],
            user=pg["user"],
            password=pg["password"],
            table_name="memory_vectors",
            embed_dim=1536,
        )
        return _vector_store
    except Exception:
        logger.warning("Failed to initialize PGVectorStore", exc_info=True)
        return None


# ── Chunking ───────────────────────────────────────────────────────────────


def _chunk_document(user_id: str, file_path: str, text: str) -> list[Any]:
    """Split a memory file into TextNodes with metadata."""
    from llama_index.core.schema import TextNode, Document
    from llama_index.core.node_parser import SentenceSplitter

    doc = Document(text=text, metadata={"user_id": user_id, "file_path": file_path})
    splitter = SentenceSplitter(chunk_size=256, chunk_overlap=64)
    nodes = splitter.get_nodes_from_documents([doc])
    # Ensure metadata is set on each node
    for i, node in enumerate(nodes):
        node.metadata["user_id"] = user_id
        node.metadata["file_path"] = file_path
        node.metadata["chunk_index"] = i
    return nodes


# ── Index rebuild ──────────────────────────────────────────────────────────


async def rebuild_memory_index(user_id: str, file_path: str | None = None) -> None:
    """Rebuild the memory index for a specific file or all files.

    - Deletes old chunks for the file from PG
    - Re-chunks the file
    - Writes chunks + embeddings to PG memory_chunks table
    - Updates BM25 in-memory cache
    """
    from app.models.base import AsyncSessionLocal

    memory_dir = os.path.join(settings.MEMORY_FILES_DIR, user_id)
    if not os.path.isdir(memory_dir):
        return

    # Determine which files to index
    if file_path:
        files = [file_path]
    else:
        files = [f for f in os.listdir(memory_dir)
                 if f.endswith(".md") and f not in ("SOUL.md", "IDENTITY.md", "USER.md", "AGENTS.md", "SKILLS_SNAPSHOT.md")]

    for fname in files:
        fpath = os.path.join(memory_dir, fname)
        if not os.path.isfile(fpath):
            continue
        with open(fpath, "r", encoding="utf-8") as f:
            content = f.read().strip()
        if not content:
            continue

        nodes = _chunk_document(user_id, fname, content)

        # Delete old chunks for this file
        async with AsyncSessionLocal() as db:
            await db.execute(
                sa_text("DELETE FROM memory_chunks WHERE user_id = :uid AND file_path = :fp"),
                {"uid": user_id, "fp": fname},
            )
            await db.commit()

        # Compute embeddings if available
        embed_model = _get_embed_model()
        embeddings: list[list[float] | None] = [None] * len(nodes)
        if embed_model and await _check_pgvector():
            try:
                texts = [n.get_content() for n in nodes]
                emb_results = await embed_model.aget_text_embedding_batch(texts)
                embeddings = emb_results
            except Exception:
                logger.warning("Embedding generation failed, storing without vectors", exc_info=True)

        # Insert new chunks
        async with AsyncSessionLocal() as db:
            for i, node in enumerate(nodes):
                emb = embeddings[i]
                emb_str = f"[{','.join(str(x) for x in emb)}]" if emb else None
                if emb_str:
                    await db.execute(
                        sa_text("""
                            INSERT INTO memory_chunks (user_id, file_path, chunk_index, content, embedding)
                            VALUES (:uid, :fp, :ci, :content, :emb::vector)
                        """),
                        {"uid": user_id, "fp": fname, "ci": i, "content": node.get_content(), "emb": emb_str},
                    )
                else:
                    await db.execute(
                        sa_text("""
                            INSERT INTO memory_chunks (user_id, file_path, chunk_index, content)
                            VALUES (:uid, :fp, :ci, :content)
                        """),
                        {"uid": user_id, "fp": fname, "ci": i, "content": node.get_content()},
                    )
            await db.commit()

    # Update BM25 cache
    await _refresh_bm25_cache(user_id)


async def _refresh_bm25_cache(user_id: str) -> list[Any]:
    """Load all chunks for a user from PG and rebuild BM25 node cache."""
    from llama_index.core.schema import TextNode
    from app.models.base import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            sa_text("SELECT content, file_path, chunk_index FROM memory_chunks WHERE user_id = :uid ORDER BY file_path, chunk_index"),
            {"uid": user_id},
        )
        rows = result.fetchall()

    nodes = []
    for row in rows:
        node = TextNode(
            text=row[0],
            metadata={"user_id": user_id, "file_path": row[1], "chunk_index": row[2]},
        )
        nodes.append(node)

    _bm25_cache[user_id] = nodes
    return nodes


# ── Hybrid search ──────────────────────────────────────────────────────────


async def search_memory(
    user_id: str,
    query: str,
    top_k: int = 5,
) -> list[dict[str, Any]]:
    """Hybrid search over memory chunks: 30% BM25 + 70% vector.

    Falls back to BM25-only when embedding is not configured or pgvector unavailable.
    """
    if not query.strip():
        return []

    # ── BM25 retrieval ──────────────────────────────────────────────────
    bm25_results: list[dict] = []
    nodes = _bm25_cache.get(user_id)
    if nodes is None:
        nodes = await _refresh_bm25_cache(user_id)

    if nodes:
        try:
            from llama_index.retrievers.bm25 import BM25Retriever
            bm25_retriever = BM25Retriever.from_defaults(
                nodes=nodes,
                similarity_top_k=top_k * 3,
                tokenizer=lambda text: list(jieba.cut_for_search(text)),
            )
            bm25_nodes = bm25_retriever.retrieve(query)
            for sn in bm25_nodes:
                bm25_results.append({
                    "content": sn.node.get_content(),
                    "score": sn.score or 0.0,
                    "file_path": sn.node.metadata.get("file_path", ""),
                })
        except Exception:
            logger.warning("BM25 retrieval failed", exc_info=True)

    # ── Vector retrieval ────────────────────────────────────────────────
    vec_results: list[dict] = []
    embed_model = _get_embed_model()
    if embed_model and await _check_pgvector():
        try:
            query_emb = await embed_model.aget_text_embedding(query)
            from app.models.base import AsyncSessionLocal
            emb_str = f"[{','.join(str(x) for x in query_emb)}]"
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    sa_text("""
                        SELECT content, file_path, 1 - (embedding <=> :qvec::vector) as similarity
                        FROM memory_chunks
                        WHERE user_id = :uid AND embedding IS NOT NULL
                        ORDER BY embedding <=> :qvec::vector
                        LIMIT :lim
                    """),
                    {"uid": user_id, "qvec": emb_str, "lim": top_k * 3},
                )
                rows = result.fetchall()
                for row in rows:
                    vec_results.append({
                        "content": row[0],
                        "score": float(row[2]) if row[2] else 0.0,
                        "file_path": row[1],
                    })
        except Exception:
            logger.warning("Vector retrieval failed", exc_info=True)

    # ── Hybrid fusion ───────────────────────────────────────────────────
    return _weighted_fusion(bm25_results, vec_results, bm25_weight=0.3, vec_weight=0.7, top_k=top_k)


def _weighted_fusion(
    bm25_results: list[dict],
    vec_results: list[dict],
    bm25_weight: float,
    vec_weight: float,
    top_k: int,
) -> list[dict]:
    """Merge and score results from BM25 and vector retrieval."""
    if not bm25_results and not vec_results:
        return []

    # Only BM25
    if not vec_results:
        bm25_results.sort(key=lambda x: x["score"], reverse=True)
        return bm25_results[:top_k]

    # Only vector
    if not bm25_results:
        vec_results.sort(key=lambda x: x["score"], reverse=True)
        return vec_results[:top_k]

    # Normalize scores
    def _normalize(results: list[dict]) -> dict[str, float]:
        if not results:
            return {}
        max_s = max(r["score"] for r in results) or 1.0
        return {r["content"]: r["score"] / max_s for r in results}

    bm25_norm = _normalize(bm25_results)
    vec_norm = _normalize(vec_results)

    # Merge
    all_contents: dict[str, dict] = {}
    for r in bm25_results + vec_results:
        c = r["content"]
        if c not in all_contents:
            all_contents[c] = {"content": c, "file_path": r.get("file_path", "")}

    scored = []
    for c, info in all_contents.items():
        b = bm25_norm.get(c, 0.0)
        v = vec_norm.get(c, 0.0)
        info["score"] = bm25_weight * b + vec_weight * v
        scored.append(info)

    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored[:top_k]
