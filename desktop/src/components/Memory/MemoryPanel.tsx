import { useEffect, useState, useCallback } from 'react'
import styles from './MemoryPanel.module.css'
import { useToast } from '../../hooks/useToast'
import { useAppStore } from '../../store/app'
import Toast from '../Toast/Toast'
import { apiFetch } from '../../api/apiFetch'


interface MemoryFile {
  name: string
  modifiedAt: number
}

interface DbMemory {
  id: string
  category: string
  content: string
  created_at: string
}

export default function MemoryPanel() {
  const [files, setFiles] = useState<MemoryFile[]>([])
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState('')
  const [editing, setEditing] = useState(false)
  const [editBuffer, setEditBuffer] = useState('')
  const [loading, setLoading] = useState(false)
  const [dbMemories, setDbMemories] = useState<DbMemory[]>([])
  const [selectedDbMemory, setSelectedDbMemory] = useState<DbMemory | null>(null)
  const { toast, showToast, dismissToast } = useToast()
  const { token, serverUrl, serverConnected } = useAppStore()

  // ── Load file list ────────────────────────────────────────────────────
  const loadFiles = useCallback(async () => {
    if (!token || !serverUrl) return
    setLoading(true)
    try {
      const resp = await apiFetch(`${serverUrl}/api/memory/files`)
      if (!resp.ok) { setFiles([]); return }
      const result = await resp.json() as Array<{ name: string; modifiedAt?: number }>
      const items: MemoryFile[] = result.map((f) => ({
        name: f.name,
        modifiedAt: f.modifiedAt ?? 0,
      }))
      // Sort: pinned files first (SOUL > USER > AGENTS > MEMORY), then by modifiedAt desc
      const PIN_ORDER: Record<string, number> = {
        'SOUL.md': 0, 'USER.md': 1, 'AGENTS.md': 2, 'MEMORY.md': 3
      }
      items.sort((a, b) => {
        const pa = PIN_ORDER[a.name] ?? 999
        const pb = PIN_ORDER[b.name] ?? 999
        if (pa !== pb) return pa - pb
        return b.modifiedAt - a.modifiedAt
      })
      setFiles(items)
    } catch {
      setFiles([])
    } finally {
      setLoading(false)
    }
  }, [token, serverUrl])

  useEffect(() => {
    if (serverConnected && token) loadFiles()
    else setFiles([])
  }, [loadFiles, serverConnected, token])

  // ── Load server DB memories ──────────────────────────────────────
  const loadDbMemories = useCallback(async () => {
    if (!token || !serverUrl) return
    try {
      const resp = await apiFetch(`${serverUrl}/api/memory`)
      if (!resp.ok) return
      setDbMemories(await resp.json())
    } catch {
      setDbMemories([])
    }
  }, [token, serverUrl])

  useEffect(() => {
    if (serverConnected && token) loadDbMemories()
    else setDbMemories([])
  }, [loadDbMemories, serverConnected, token])



  // ── Read file content ─────────────────────────────────────────────────
  const readFile = useCallback(async (name: string) => {
    if (!token || !serverUrl) return
    try {
      const resp = await apiFetch(`${serverUrl}/api/memory/files/${encodeURIComponent(name)}`)
      if (!resp.ok) { setFileContent(''); return }
      const data = await resp.json() as { content?: string }
      setFileContent(data.content ?? '')
    } catch {
      setFileContent('')
    }
  }, [token, serverUrl])

  const handleSelectFile = useCallback((name: string) => {
    setEditing(false)
    setSelectedFile(name)
    setSelectedDbMemory(null)
    readFile(name)
  }, [readFile])

  // ── Delete MD file ───────────────────────────────────────────
  const deleteFile = useCallback(async (e: React.MouseEvent, name: string) => {
    e.stopPropagation()
    if (!token || !serverUrl) return
    try {
      const resp = await apiFetch(`${serverUrl}/api/memory/files/${encodeURIComponent(name)}`, {
        method: 'DELETE',
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      showToast(`${name} 已删除`)
      if (selectedFile === name) {
        setSelectedFile(null)
        setFileContent('')
        setEditing(false)
      }
      loadFiles()
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : '删除失败')
    }
  }, [token, serverUrl, selectedFile, loadFiles, showToast])

  // ── Delete server DB memory ───────────────────────────────────
  const deleteDbMemory = useCallback(async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (!token || !serverUrl) return
    try {
      const resp = await apiFetch(`${serverUrl}/api/memory/${id}`, {
        method: 'DELETE',
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      setDbMemories(prev => prev.filter(m => m.id !== id))
      if (selectedDbMemory?.id === id) setSelectedDbMemory(null)
      showToast('已删除')
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : '删除失败')
    }
  }, [token, serverUrl, selectedDbMemory, showToast])

  // ── Edit ──────────────────────────────────────────────────────────────
  const startEditing = () => {
    setEditBuffer(fileContent)
    setEditing(true)
  }

  const cancelEditing = () => {
    setEditing(false)
  }

  const saveEdit = async () => {
    if (!selectedFile || !token || !serverUrl) return
    try {
      const resp = await apiFetch(`${serverUrl}/api/memory/files/${encodeURIComponent(selectedFile)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/plain' },
        body: editBuffer,
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      setFileContent(editBuffer)
      setEditing(false)
      showToast('已保存')
      loadFiles()
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '保存失败')
    }
  }

  // ── Create today note ─────────────────────────────────────────────────
  const createTodayNote = async () => {
    if (!token || !serverUrl) return
    const today = new Date().toISOString().slice(0, 10)
    const fileName = `${today}.md`
    // Check if it already exists
    const existing = files.find(f => f.name === fileName)
    if (existing) {
      handleSelectFile(fileName)
      return
    }
    try {
      const resp = await apiFetch(`${serverUrl}/api/memory/files/${encodeURIComponent(fileName)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/plain' },
        body: `# ${today}\n\n`,
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      await loadFiles()
      setSelectedFile(fileName)
      setFileContent(`# ${today}\n\n`)
      setEditBuffer(`# ${today}\n\n`)
      setEditing(true)
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '创建失败')
    }
  }

  // ── Simple Markdown rendering (lightweight, no external deps) ─────────
  const renderMarkdown = (md: string) => {
    // Basic: headings, bold, italic, code blocks, inline code, lists, links
    const lines = md.split('\n')
    const html: string[] = []
    let inCodeBlock = false

    for (const line of lines) {
      if (line.startsWith('```')) {
        if (inCodeBlock) {
          html.push('</code></pre>')
          inCodeBlock = false
        } else {
          html.push('<pre><code>')
          inCodeBlock = true
        }
        continue
      }
      if (inCodeBlock) {
        html.push(escapeHtml(line))
        html.push('\n')
        continue
      }

      let processed = escapeHtml(line)
      // Headings
      const headingMatch = processed.match(/^(#{1,6})\s+(.+)$/)
      if (headingMatch) {
        const level = headingMatch[1].length
        html.push(`<h${level}>${inlineFormat(headingMatch[2])}</h${level}>`)
        continue
      }
      // List items
      if (/^\s*[-*]\s+/.test(processed)) {
        processed = processed.replace(/^\s*[-*]\s+/, '')
        html.push(`<li>${inlineFormat(processed)}</li>`)
        continue
      }
      // Paragraph / empty
      if (processed.trim() === '') {
        html.push('<br/>')
      } else {
        html.push(`<p>${inlineFormat(processed)}</p>`)
      }
    }
    if (inCodeBlock) html.push('</code></pre>')
    return html.join('\n')
  }

  const escapeHtml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

  const inlineFormat = (s: string) =>
    s
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')

  return (
    <div className={styles.panel}>
      <Toast message={toast} onClose={dismissToast} />

      <div className={styles.header}>
        <span className={styles.title}>记忆库</span>
        <div className={styles.actions}>
          <button className={styles.btnSecondary} onClick={createTodayNote}>
            + 今日笔记
          </button>
        </div>
      </div>

      <div className={styles.body}>
        {/* ── Not connected state ───────────────────────────────────── */}
        {(!serverConnected || !token) ? (
          <div className={styles.placeholder}>请先连接服务器并登录后查看记忆文件</div>
        ) : (<>
        {/* ── Left: File list ────────────────────────────────────────── */}
        <div className={styles.fileList}>
          {loading ? (
            <div className={styles.empty}>加载中…</div>
          ) : files.length === 0 ? (
            <div className={styles.empty}>暂无记忆文件，与猫咪对话时会自动创建</div>
          ) : (
            <ul className={styles.list}>
              {files.map(f => (
                <li
                  key={f.name}
                  className={`${styles.fileItem} ${selectedFile === f.name ? styles.fileItemActive : ''}`}
                  onClick={() => handleSelectFile(f.name)}
                >
                  <div className={styles.fileItemRow}>
                    <div className={styles.fileName}>
                      {f.name === 'MEMORY.md' ? '📌 ' : '📝 '}
                      {f.name}
                    </div>
                    <button
                      className={styles.fileDeleteBtn}
                      onClick={(e) => deleteFile(e, f.name)}
                      title="删除文件"
                    >×</button>
                  </div>
                  {f.modifiedAt > 0 && (
                    <div className={styles.fileMeta}>
                      {new Date(f.modifiedAt * 1000).toLocaleDateString('zh-CN')}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {/* 服务端 DB 记忆条目 */}
          {serverConnected && token && dbMemories.length > 0 && (
            <>
              <div className={styles.dbSectionLabel}>🧠 云端记忆条目</div>
              <ul className={styles.list}>
                {dbMemories.map(m => (
                  <li
                    key={m.id}
                    className={`${styles.fileItem} ${selectedDbMemory?.id === m.id ? styles.fileItemActive : ''}`}
                    onClick={() => { setSelectedDbMemory(m); setSelectedFile(null); setEditing(false) }}
                  >
                    <div className={styles.fileItemRow}>
                      <div className={styles.fileName}>{m.category}</div>
                      <button
                        className={styles.fileDeleteBtn}
                        onClick={(e) => deleteDbMemory(e, m.id)}
                        title="删除记忆"
                      >×</button>
                    </div>
                    <div className={styles.fileMeta}>
                      {m.content.length > 36 ? m.content.slice(0, 36) + '…' : m.content}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {/* ── Right: Content view / editor ───────────────────────────── */}
        <div className={styles.contentArea}>
          {!selectedFile && !selectedDbMemory ? (
            <div className={styles.placeholder}>← 选择一个文件查看</div>
          ) : selectedDbMemory ? (
            <>
              <div className={styles.editorToolbar}>
                <span className={styles.editorLabel}>🧠 {selectedDbMemory.category}</span>
                <span className={styles.fileMeta}>{new Date(selectedDbMemory.created_at).toLocaleString('zh-CN')}</span>
              </div>
              <div className={styles.rendered}>
                <p>{selectedDbMemory.content}</p>
              </div>
            </>
          ) : editing ? (
            <>
              <div className={styles.editorToolbar}>
                <span className={styles.editorLabel}>编辑: {selectedFile}</span>
                <div className={styles.actions}>
                  <button className={styles.btnPrimary} onClick={saveEdit}>保存</button>
                  <button className={styles.btnSecondary} onClick={cancelEditing}>取消</button>
                </div>
              </div>
              <textarea
                className={styles.editor}
                value={editBuffer}
                onChange={e => setEditBuffer(e.target.value)}
                autoFocus
              />
            </>
          ) : (
            <>
              <div className={styles.editorToolbar}>
                <span className={styles.editorLabel}>{selectedFile}</span>
                <button className={styles.btnSecondary} onClick={startEditing}>编辑</button>
              </div>
              <div
                className={styles.rendered}
                dangerouslySetInnerHTML={{ __html: renderMarkdown(fileContent) }}
              />
            </>
          )}
        </div>
        </>)}
      </div>
    </div>
  )
}
