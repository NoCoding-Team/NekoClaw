import { useEffect, useState, useCallback } from 'react'
import styles from './MemoryPanel.module.css'
import { useToast } from '../../hooks/useToast'
import { useAppStore } from '../../store/app'
import Toast from '../Toast/Toast'

interface MemoryFile {
  name: string
  modifiedAt: number
}

export default function MemoryPanel() {
  const [files, setFiles] = useState<MemoryFile[]>([])
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState('')
  const [editing, setEditing] = useState(false)
  const [editBuffer, setEditBuffer] = useState('')
  const [loading, setLoading] = useState(false)
  const { toast, showToast, dismissToast } = useToast()
  const { token, serverUrl, serverConnected } = useAppStore()

  // ── Load file list ────────────────────────────────────────────────────
  const loadFiles = useCallback(async () => {
    const mem = window.nekoBridge?.memory
    if (!mem) return
    setLoading(true)
    try {
      const result = await mem.list()
      const items: MemoryFile[] = (result.files ?? []).map((f: { name: string; mtime?: number; modifiedAt?: number }) => ({
        name: f.name,
        modifiedAt: f.mtime ?? f.modifiedAt ?? 0,
      }))
      // Sort: MEMORY.md first, then by modifiedAt desc
      items.sort((a, b) => {
        if (a.name === 'MEMORY.md') return -1
        if (b.name === 'MEMORY.md') return 1
        return b.modifiedAt - a.modifiedAt
      })
      setFiles(items)
    } catch {
      setFiles([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadFiles() }, [loadFiles])

  // ── Read file content ─────────────────────────────────────────────────
  const readFile = useCallback(async (name: string) => {
    const mem = window.nekoBridge?.memory
    if (!mem) return
    try {
      const result = await mem.read(name)
      setFileContent((result as { content?: string }).content ?? '')
    } catch {
      setFileContent('')
    }
  }, [])

  const handleSelectFile = useCallback((name: string) => {
    setEditing(false)
    setSelectedFile(name)
    readFile(name)
  }, [readFile])

  // ── Edit ──────────────────────────────────────────────────────────────
  const startEditing = () => {
    setEditBuffer(fileContent)
    setEditing(true)
  }

  const cancelEditing = () => {
    setEditing(false)
  }

  const saveEdit = async () => {
    if (!selectedFile) return
    const mem = window.nekoBridge?.memory
    if (!mem) return
    try {
      await mem.write(selectedFile, editBuffer)
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
    const mem = window.nekoBridge?.memory
    if (!mem) return
    const today = new Date().toISOString().slice(0, 10)
    const fileName = `${today}.md`
    // Check if it already exists
    const existing = files.find(f => f.name === fileName)
    if (existing) {
      handleSelectFile(fileName)
      return
    }
    try {
      await mem.write(fileName, `# ${today}\n\n`)
      await loadFiles()
      setSelectedFile(fileName)
      setFileContent(`# ${today}\n\n`)
      setEditBuffer(`# ${today}\n\n`)
      setEditing(true)
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '创建失败')
    }
  }

  // ── Cloud sync ────────────────────────────────────────────────────────
  const uploadToCloud = async () => {
    if (!selectedFile || !token || !serverUrl) {
      showToast('请先登录服务器')
      return
    }
    const mem = window.nekoBridge?.memory
    if (!mem) return
    try {
      const result = await mem.read(selectedFile)
      const content = (result as { content?: string }).content ?? ''
      const resp = await fetch(`${serverUrl}/api/memory/files/${encodeURIComponent(selectedFile)}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' },
        body: content,
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      showToast(`${selectedFile} 已上传到云端`)
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '上传失败')
    }
  }

  const pullFromCloud = async () => {
    if (!token || !serverUrl) {
      showToast('请先登录服务器')
      return
    }
    try {
      const resp = await fetch(`${serverUrl}/api/memory/files`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const cloudFiles = await resp.json() as Array<{ name: string }>
      if (cloudFiles.length === 0) {
        showToast('云端无记忆文件')
        return
      }
      const mem = window.nekoBridge?.memory
      if (!mem) return
      let count = 0
      for (const cf of cloudFiles) {
        const fileResp = await fetch(`${serverUrl}/api/memory/files/${encodeURIComponent(cf.name)}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!fileResp.ok) continue
        const data = await fileResp.json() as { content: string }
        await mem.write(cf.name, data.content)
        count++
      }
      showToast(`已从云端拉取 ${count} 个文件`)
      loadFiles()
      if (selectedFile) readFile(selectedFile)
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '拉取失败')
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
          {serverConnected && token && (
            <>
              <button className={styles.btnSecondary} onClick={pullFromCloud} title="从云端拉取所有记忆文件">
                ↓ 拉取
              </button>
              {selectedFile && (
                <button className={styles.btnSecondary} onClick={uploadToCloud} title="上传当前文件到云端">
                  ↑ 上传
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className={styles.body}>
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
                  <div className={styles.fileName}>
                    {f.name === 'MEMORY.md' ? '📌 ' : '📝 '}
                    {f.name}
                  </div>
                  {f.modifiedAt > 0 && (
                    <div className={styles.fileMeta}>
                      {new Date(f.modifiedAt).toLocaleDateString('zh-CN')}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ── Right: Content view / editor ───────────────────────────── */}
        <div className={styles.contentArea}>
          {!selectedFile ? (
            <div className={styles.placeholder}>← 选择一个文件查看</div>
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
      </div>
    </div>
  )
}
