"""
LlamaIndex-powered hybrid memory search service.

Vector storage: Milvus (external, pymilvus)
BM25 storage:   PostgreSQL memory_chunks table (text only, no vector column)
Hybrid scoring: 30% BM25 (jieba Chinese tokeniser) + 70% vector cosine.
"""
from __future__ import annotations

import logging
import os
from typing import Any

import jieba
from sqlalchemy import text as sa_text

from app.core.config import settings

logger = logging.getLogger(__name__)

# ── BM25 node cache (per-user, process-local) ──────────────────────────────

_bm25_cache: dict[str, list[Any]] = {}  # user_id -> list[TextNode]

# ── Lazy singletons ────────────────────────────────────────────────────────

_embed_model: Any | None = None
_milvus_client: Any | None = None


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


def _get_milvus_client() -> Any | None:
    """Return pymilvus MilvusClient singleton or None if not configured."""
    global _milvus_client
    if _milvus_client is not None:
        return _milvus_client
    uri = getattr(settings, "MILVUS_URI", None)
    if not uri:
        return None
    try:
        from pymilvus import MilvusClient
        _milvus_client = MilvusClient(uri=uri)
        _ensure_milvus_collection(_milvus_client)
        return _milvus_client
    except Exception:
        logger.warning("Failed to connect to Milvus", exc_info=True)
        return None


def _ensure_milvus_collection(client: Any) -> None:
    """Create the memory_vectors collection if it does not exist."""
    collection = getattr(settings, "MILVUS_COLLECTION", "memory_vectors")
    if client.has_collection(collection):
        return
    from pymilvus import DataType
    schema = client.create_schema(auto_id=True, enable_dynamic_field=True)
    schema.add_field("id", DataType.INT64, is_primary=True)
    schema.add_field("user_id", DataType.VARCHAR, max_length=128)
    schema.add_field("file_path", DataType.VARCHAR, max_length=512)
    schema.add_field("chunk_index", DataType.INT32)
    schema.add_field("content", DataType.VARCHAR, max_length=4096)
    schema.add_field("embedding", DataType.FLOAT_VECTOR, dim=1536)
    index_params = client.prepare_index_params()
    index_params.add_index("embedding", metric_type="COSINE", index_type="IVF_FLAT", params={"nlist": 128})
    client.create_collection(collection, schema=schema, index_params=index_params)
    logger.info(f"Milvus collection '{collection}' created")


# ── Chunking ───────────────────────────────────────────────────────────────


def _chunk_document(user_id: str, file_path: str, text: str) -> list[Any]:
    """Split a memory file into TextNodes with metadata."""
    from llama_index.core.schema import TextNode, Document
    from llama_index.core.node_parser import SentenceSplitter

    doc = Document(text=text, metadata={"user_id": user_id, "file_path": file_path})
    splitter = SentenceSplitter(chunk_size=256, chunk_overlap=64)
    nodes = splitter.get_nodes_from_documents([doc])
    for i, node in enumerate(nodes):
        node.metadata["user_id"] = user_id
        node.metadata["file_path"] = file_path
        node.metadata["chunk_index"] = i
    return nodes


# ── Index rebuild ──────────────────────────────────────────────────────────


async def rebuild_memory_index(user_id: str, file_path: str | None = None) -> None:
    """Rebuild the memory index for a specific file or all files."""
    from app.models.base import AsyncSessionLocal

    memory_dir = os.path.join(settings.MEMORY_FILES_DIR, user_id)
    if not os.path.isdir(memory_dir):
        return

    skip = {"SOUL.md", "IDENTITY.md", "USER.md", "AGENTS.md", "SKILLS_SNAPSHOT.md"}
    files = [file_path] if file_path else [
        f for f in os.listdir(memory_dir) if f.endswith(".md") and f not in skip
    ]

    milvus = _get_milvus_client()
    embed_model = _get_embed_model()
    collection = getattr(settings, "MILVUS_COLLECTION", "memory_vectors")

    for fname in files:
        fpath = os.path.join(memory_dir, fname)
        if not os.path.isfile(fpath):
            continue
        with open(fpath, "r", encoding="utf-8") as f:
            content = f.read().strip()
        if not content:
            continue

        nodes = _chunk_document(user_id, fname, content)

        # ── Delete old PG chunks ────────────────────────────────────────
        async with AsyncSessionLocal() as db:
            await db.execute(
                sa_text("DELETE FROM memory_chunks WHERE user_id = :uid AND file_path = :fp"),
                {"uid": user_id, "fp": fname},
            )
            await db.commit()

        # ── Delete old Milvus vectors ───────────────────────────────────
        if milvus:
            try:
                milvus.delete(
                    collection_name=collection,
                    filter=f'user_id == "{user_id}" and file_path == "{fname}"',
                )
            except Exception:
                logger.warning("Milvus delete failed", exc_info=True)

        # ── Compute embeddings ──────────────────────────────────────────
        embeddings: list[list[float] | None] = [None] * len(nodes)
        if embed_model and milvus:
            try:
                texts = [n.get_content() for n in nodes]
                embeddings = await embed_model.aget_text_embedding_batch(texts)
            except Exception:
                logger.warning("Embedding generation failed", exc_info=True)

        # ── Insert PG chunks (text only) ────────────────────────────────
        async with AsyncSessionLocal() as db:
            for i, node in enumerate(nodes):
                await db.execute(
                    sa_text("""
                        INSERT INTO memory_chunks (user_id, file_path, chunk_index, content)
                        VALUES (:uid, :fp, :ci, :content)
                    """),
                    {"uid": user_id, "fp": fname, "ci": i, "content": node.get_content()},
                )
            await db.commit()

        # ── Insert Milvus vectors ───────────────────────────────────────
        if milvus and any(e is not None for e in embeddings):
            try:
                rows = []
                for i, node in enumerate(nodes):
                    if embeddings[i] is not None:
                        rows.append({
                            "user_id": user_id,
                            "file_path": fname,
                            "chunk_index": i,
                            "content": node.get_content()[:4096],
                            "embedding": embeddings[i],
                        })
                if rows:
                    milvus.insert(collection_name=collection, data=rows)
            except Exception:
                logger.warning("Milvus insert failed", exc_info=True)

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

    nodes = [
        TextNode(text=r[0], metadata={"user_id": user_id, "file_path": r[1], "chunk_index": r[2]})
        for r in rows
    ]
    _bm25_cache[user_id] = nodes
    return nodes


# ── Hybrid search ──────────────────────────────────────────────────────────


async def search_memory(
    user_id: str,
    query: str,
    top_k: int = 5,
) -> list[dict[str, Any]]:
    """Hybrid search: 30% BM25 + 70% Milvus vector. Falls back to BM25-only."""
    if not query.strip():
        return []

    # ── BM25 ────────────────────────────────────────────────────────────
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
            for sn in bm25_retriever.retrieve(query):
                bm25_results.append({
                    "content": sn.node.get_content(),
                    "score": sn.score or 0.0,
                    "file_path": sn.node.metadata.get("file_path", ""),
                })
        except Exception:
            logger.warning("BM25 retrieval failed", exc_info=True)

    # ── Milvus vector search ─────────────────────────────────────────────
    vec_results: list[dict] = []
    embed_model = _get_embed_model()
    milvus = _get_milvus_client()
    if embed_model and milvus:
        try:
            collection = getattr(settings, "MILVUS_COLLECTION", "memory_vectors")
            query_emb = await embed_model.aget_text_embedding(query)
            hits = milvus.search(
                collection_name=collection,
                data=[query_emb],
                filter=f'user_id == "{user_id}"',
                limit=top_k * 3,
                output_fields=["content", "file_path"],
            )
            for hit in hits[0]:
                vec_results.append({
                    "content": hit["entity"]["content"],
                    "score": float(hit["distance"]),
                    "file_path": hit["entity"].get("file_path", ""),
                })
        except Exception:
            logger.warning("Milvus vector retrieval failed", exc_info=True)

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
    if not vec_results:
        bm25_results.sort(key=lambda x: x["score"], reverse=True)
        return bm25_results[:top_k]
    if not bm25_results:
        vec_results.sort(key=lambda x: x["score"], reverse=True)
        return vec_results[:top_k]

    def _normalize(results: list[dict]) -> dict[str, float]:
        max_s = max(r["score"] for r in results) or 1.0
        return {r["content"]: r["score"] / max_s for r in results}

    bm25_norm = _normalize(bm25_results)
    vec_norm = _normalize(vec_results)

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
