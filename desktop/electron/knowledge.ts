/**
 * Knowledge base indexing & search module for Electron main process.
 *
 * Tech stack: better-sqlite3 + FTS5 (BM25) + sqlite-vec (vector search)
 * File watchers: chokidar
 * Parsers: pdf-parse (PDF), fs (MD/TXT)
 */

import path from 'path'
import fs from 'fs'
import fsPromises from 'fs/promises'
import { app } from 'electron'

type BetterSqlite3Database = import('better-sqlite3').Database

// ── Types ──────────────────────────────────────────────────────────────────

export interface EmbeddingConfig {
  baseUrl: string
  model: string
  apiKey: string
}

interface ChunkRow {
  id: number
  file_path: string
  chunk_index: number
  content: string
  embedding: Buffer | null
}

interface SearchResult {
  filePath: string
  chunkIndex: number
  content: string
  score: number
}

// ── Constants ──────────────────────────────────────────────────────────────

const CHUNK_TOKENS = 512
const CHUNK_OVERLAP = 128
const APPROX_CHARS_PER_TOKEN = 4
const CHUNK_CHARS = CHUNK_TOKENS * APPROX_CHARS_PER_TOKEN
const OVERLAP_CHARS = CHUNK_OVERLAP * APPROX_CHARS_PER_TOKEN
const SUPPORTED_EXTS = new Set(['.md', '.txt', '.pdf'])

// ── State ──────────────────────────────────────────────────────────────────

let _kdb: BetterSqlite3Database | null = null
let _knowledgeDir: string | null = null
let _embeddingConfig: EmbeddingConfig | null = null
let _watcher: import('chokidar').FSWatcher | null = null
let _vecEnabled = false

// ── DB Initialization ──────────────────────────────────────────────────────

function getKnowledgeDb(): BetterSqlite3Database {
  if (_kdb) return _kdb

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3')
  const dbPath = path.join(app.getPath('userData'), 'knowledge.db')
  _kdb = new BetterSqlite3(dbPath)
  _kdb.pragma('journal_mode = WAL')

  // Try to load sqlite-vec extension
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const sqliteVec = require('sqlite-vec')
    sqliteVec.load(_kdb)
    _vecEnabled = true
  } catch {
    console.warn('[knowledge] sqlite-vec not available, vector search disabled')
    _vecEnabled = false
  }

  // FTS5 table for keyword search
  _kdb.exec(`
    CREATE TABLE IF NOT EXISTS kb_chunks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path   TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      content     TEXT NOT NULL,
      embedding   BLOB,
      mtime       INTEGER NOT NULL DEFAULT 0,
      UNIQUE(file_path, chunk_index)
    );
    CREATE INDEX IF NOT EXISTS idx_kb_chunks_file ON kb_chunks(file_path);
  `)

  // FTS5 for BM25 search
  _kdb.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS kb_fts USING fts5(
      content,
      content_rowid='id',
      content='kb_chunks'
    );
  `)

  // Triggers to keep FTS in sync
  _kdb.exec(`
    CREATE TRIGGER IF NOT EXISTS kb_fts_ai AFTER INSERT ON kb_chunks BEGIN
      INSERT INTO kb_fts(rowid, content) VALUES (new.id, new.content);
    END;
    CREATE TRIGGER IF NOT EXISTS kb_fts_ad AFTER DELETE ON kb_chunks BEGIN
      INSERT INTO kb_fts(kb_fts, rowid, content) VALUES('delete', old.id, old.content);
    END;
    CREATE TRIGGER IF NOT EXISTS kb_fts_au AFTER UPDATE ON kb_chunks BEGIN
      INSERT INTO kb_fts(kb_fts, rowid, content) VALUES('delete', old.id, old.content);
      INSERT INTO kb_fts(rowid, content) VALUES (new.id, new.content);
    END;
  `)

  // Virtual table for vector search (only if sqlite-vec is available)
  if (_vecEnabled) {
    try {
      _kdb.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS kb_vec USING vec0(
          chunk_id INTEGER PRIMARY KEY,
          embedding float[1536]
        );
      `)
    } catch (e) {
      console.warn('[knowledge] Failed to create vec table:', e)
      _vecEnabled = false
    }
  }

  return _kdb
}

// ── File Parsing ───────────────────────────────────────────────────────────

async function parseFile(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase()

  if (ext === '.md' || ext === '.txt') {
    return await fsPromises.readFile(filePath, 'utf-8')
  }

  if (ext === '.pdf') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pdfParse = require('pdf-parse')
      const buffer = await fsPromises.readFile(filePath)
      const data = await (pdfParse.default ?? pdfParse)(buffer) as { text: string }
      return data.text
    } catch (e) {
      console.warn(`[knowledge] Failed to parse PDF: ${filePath}`, e)
      return ''
    }
  }

  return '' // unsupported
}

// ── Text Chunking ──────────────────────────────────────────────────────────

function chunkText(text: string): string[] {
  if (!text.trim()) return []

  // Split by paragraphs first
  const paragraphs = text.split(/\n{2,}/).filter(p => p.trim())
  const chunks: string[] = []
  let buffer = ''

  for (const para of paragraphs) {
    if (buffer.length + para.length > CHUNK_CHARS && buffer.length > 0) {
      chunks.push(buffer.trim())
      // Overlap: keep trailing portion of buffer
      buffer = buffer.slice(-OVERLAP_CHARS) + '\n\n' + para
    } else {
      buffer = buffer ? buffer + '\n\n' + para : para
    }
  }

  if (buffer.trim()) {
    chunks.push(buffer.trim())
  }

  // If no paragraph splits produced reasonable chunks, do fixed-window
  if (chunks.length === 0 && text.length > 0) {
    for (let i = 0; i < text.length; i += CHUNK_CHARS - OVERLAP_CHARS) {
      chunks.push(text.slice(i, i + CHUNK_CHARS).trim())
    }
  }

  return chunks.filter(c => c.length > 0)
}

// ── Embedding ──────────────────────────────────────────────────────────────

async function getEmbedding(texts: string[]): Promise<Float32Array[]> {
  if (!_embeddingConfig) {
    throw new Error('未配置 embedding 模型')
  }

  const { baseUrl, model, apiKey } = _embeddingConfig

  // Call OpenAI-compatible embedding API
  const response = await fetch(`${baseUrl}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, input: texts }),
  })

  if (!response.ok) {
    throw new Error(`Embedding API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json() as {
    data: Array<{ embedding: number[] }>
  }

  return data.data.map(d => new Float32Array(d.embedding))
}

// ── Index Operations ───────────────────────────────────────────────────────

async function indexFile(filePath: string): Promise<void> {
  const db = getKnowledgeDb()
  const stat = fs.statSync(filePath)
  const mtime = stat.mtimeMs

  // Check if already indexed with same mtime
  const existing = db.prepare(
    'SELECT mtime FROM kb_chunks WHERE file_path = ? LIMIT 1'
  ).get(filePath) as { mtime: number } | undefined

  if (existing && existing.mtime >= mtime) {
    return // already up to date
  }

  const text = await parseFile(filePath)
  if (!text.trim()) return

  const chunks = chunkText(text)

  // Remove old chunks for this file
  db.prepare('DELETE FROM kb_chunks WHERE file_path = ?').run(filePath)
  if (_vecEnabled) {
    db.prepare('DELETE FROM kb_vec WHERE chunk_id IN (SELECT id FROM kb_chunks WHERE file_path = ?)').run(filePath)
  }

  // Insert new chunks
  const insertChunk = db.prepare(
    'INSERT INTO kb_chunks (file_path, chunk_index, content, mtime) VALUES (?, ?, ?, ?)'
  )

  const insertMany = db.transaction((items: Array<{ index: number; content: string }>) => {
    for (const item of items) {
      insertChunk.run(filePath, item.index, item.content, mtime)
    }
  })

  insertMany(chunks.map((content, index) => ({ index, content })))

  // Generate embeddings if configured
  if (_embeddingConfig && _vecEnabled) {
    try {
      const embeddings = await getEmbedding(chunks)
      const rows = db.prepare(
        'SELECT id, chunk_index FROM kb_chunks WHERE file_path = ? ORDER BY chunk_index'
      ).all(filePath) as Array<{ id: number; chunk_index: number }>

      const insertVec = db.prepare(
        'INSERT OR REPLACE INTO kb_vec (chunk_id, embedding) VALUES (?, ?)'
      )
      const insertVecMany = db.transaction((pairs: Array<{ id: number; embedding: Float32Array }>) => {
        for (const pair of pairs) {
          insertVec.run(pair.id, Buffer.from(pair.embedding.buffer))
        }
      })

      insertVecMany(rows.map((row, i) => ({
        id: row.id,
        embedding: embeddings[i],
      })))
    } catch (e) {
      console.warn(`[knowledge] Embedding failed for ${filePath}:`, e)
    }
  }
}

async function removeFileIndex(filePath: string): Promise<void> {
  const db = getKnowledgeDb()
  if (_vecEnabled) {
    db.prepare(
      'DELETE FROM kb_vec WHERE chunk_id IN (SELECT id FROM kb_chunks WHERE file_path = ?)'
    ).run(filePath)
  }
  db.prepare('DELETE FROM kb_chunks WHERE file_path = ?').run(filePath)
}

async function buildFullIndex(): Promise<void> {
  if (!_knowledgeDir) return

  const dir = _knowledgeDir
  if (!fs.existsSync(dir)) {
    await fsPromises.mkdir(dir, { recursive: true })
    return
  }

  const files = await collectFiles(dir)
  for (const file of files) {
    try {
      await indexFile(file)
    } catch (e) {
      console.warn(`[knowledge] Failed to index: ${file}`, e)
    }
  }
}

async function collectFiles(dir: string): Promise<string[]> {
  const results: string[] = []
  const entries = await fsPromises.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...await collectFiles(fullPath))
    } else if (SUPPORTED_EXTS.has(path.extname(entry.name).toLowerCase())) {
      results.push(fullPath)
    }
  }
  return results
}

// ── File Watcher ───────────────────────────────────────────────────────────

async function startWatcher(): Promise<void> {
  if (_watcher) {
    await _watcher.close()
    _watcher = null
  }

  if (!_knowledgeDir || !fs.existsSync(_knowledgeDir)) return

  const chokidar = await import('chokidar')
  _watcher = chokidar.watch(_knowledgeDir, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 500 },
  })

  const isSupported = (p: string) => SUPPORTED_EXTS.has(path.extname(p).toLowerCase())

  _watcher.on('add', (p: string) => {
    if (isSupported(p)) indexFile(p).catch(e => console.warn('[knowledge] watch add error:', e))
  })
  _watcher.on('change', (p: string) => {
    if (isSupported(p)) indexFile(p).catch(e => console.warn('[knowledge] watch change error:', e))
  })
  _watcher.on('unlink', (p: string) => {
    if (isSupported(p)) removeFileIndex(p).catch(e => console.warn('[knowledge] watch unlink error:', e))
  })
}

// ── Search ─────────────────────────────────────────────────────────────────

export async function searchKnowledge(query: string, topK = 5): Promise<SearchResult[]> {
  const db = getKnowledgeDb()

  // FTS5 BM25 search
  const ftsResults = db.prepare(`
    SELECT kb_chunks.id, kb_chunks.file_path, kb_chunks.chunk_index, kb_chunks.content,
           bm25(kb_fts) AS score
    FROM kb_fts
    JOIN kb_chunks ON kb_chunks.id = kb_fts.rowid
    WHERE kb_fts MATCH ?
    ORDER BY score ASC
    LIMIT ?
  `).all(query, topK * 2) as Array<ChunkRow & { score: number }>

  // Vector search (if embedding config available)
  let vecResults: Array<{ chunk_id: number; distance: number }> = []
  if (_vecEnabled && _embeddingConfig) {
    try {
      const [queryVec] = await getEmbedding([query])
      vecResults = db.prepare(`
        SELECT chunk_id, distance
        FROM kb_vec
        WHERE embedding MATCH ?
        ORDER BY distance ASC
        LIMIT ?
      `).all(Buffer.from(queryVec.buffer), topK * 2) as Array<{ chunk_id: number; distance: number }>
    } catch {
      // Vector search failed, fall back to FTS only
    }
  }

  // Merge results (dedup by chunk id, combine scores)
  const scoreMap = new Map<number, { filePath: string; chunkIndex: number; content: string; score: number }>()

  for (const r of ftsResults) {
    scoreMap.set(r.id, {
      filePath: r.file_path,
      chunkIndex: r.chunk_index,
      content: r.content,
      score: -r.score, // BM25 returns negative scores in FTS5 (lower = better)
    })
  }

  if (vecResults.length > 0) {
    for (const v of vecResults) {
      const existing = scoreMap.get(v.chunk_id)
      if (existing) {
        // Boost score if found in both
        existing.score += (1 - v.distance)
      } else {
        // Fetch chunk data
        const chunk = db.prepare(
          'SELECT file_path, chunk_index, content FROM kb_chunks WHERE id = ?'
        ).get(v.chunk_id) as ChunkRow | undefined
        if (chunk) {
          scoreMap.set(v.chunk_id, {
            filePath: chunk.file_path,
            chunkIndex: chunk.chunk_index,
            content: chunk.content,
            score: 1 - v.distance,
          })
        }
      }
    }
  }

  // Sort by score descending, return top-K
  return Array.from(scoreMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
}

// ── Public API ─────────────────────────────────────────────────────────────

export function hasIndex(): boolean {
  try {
    const db = getKnowledgeDb()
    const row = db.prepare('SELECT COUNT(*) as cnt FROM kb_chunks').get() as { cnt: number }
    return row.cnt > 0
  } catch {
    return false
  }
}

export function setEmbeddingConfig(config: EmbeddingConfig | null): void {
  _embeddingConfig = config
}

export async function setKnowledgeDir(dir: string | null): Promise<void> {
  _knowledgeDir = dir
  if (dir) {
    await buildFullIndex()
    await startWatcher()
  } else if (_watcher) {
    await _watcher.close()
    _watcher = null
  }
}

export function getKnowledgeDir(): string | null {
  return _knowledgeDir
}

export async function initKnowledge(dir: string | null, embeddingConfig: EmbeddingConfig | null): Promise<void> {
  _embeddingConfig = embeddingConfig
  _knowledgeDir = dir
  if (dir) {
    await buildFullIndex()
    await startWatcher()
  }
}

export async function shutdownKnowledge(): Promise<void> {
  if (_watcher) {
    await _watcher.close()
    _watcher = null
  }
  if (_kdb) {
    _kdb.close()
    _kdb = null
  }
}
