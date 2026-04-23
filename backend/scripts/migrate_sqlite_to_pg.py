"""
One-time migration script: reads existing SQLite memory_index.db
and rebuilds the PG memory_chunks table via memory_search.rebuild_memory_index.

Usage:
    cd backend
    python -m scripts.migrate_sqlite_to_pg

This does NOT copy SQLite vectors — it re-indexes all memory .md files
from disk into PostgreSQL using the new LlamaIndex pipeline.
"""
import asyncio
import os
import sys

# Add parent to path so app modules are importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


async def main():
    from app.core.config import settings
    from app.services.memory_search import rebuild_memory_index

    memory_dir = settings.MEMORY_FILES_DIR
    if not os.path.isdir(memory_dir):
        print(f"Memory directory not found: {memory_dir}")
        return

    user_dirs = [
        d for d in os.listdir(memory_dir)
        if os.path.isdir(os.path.join(memory_dir, d))
    ]

    if not user_dirs:
        print("No user directories found in memory dir.")
        return

    print(f"Found {len(user_dirs)} user(s) to migrate.")

    for user_id in user_dirs:
        user_path = os.path.join(memory_dir, user_id)
        md_files = [f for f in os.listdir(user_path) if f.endswith(".md")]
        print(f"\n  User {user_id}: {len(md_files)} .md files")

        for fname in md_files:
            try:
                await rebuild_memory_index(user_id, fname)
                print(f"    ✓ {fname}")
            except Exception as e:
                print(f"    ✗ {fname}: {e}")

    print("\nMigration complete.")


if __name__ == "__main__":
    asyncio.run(main())
