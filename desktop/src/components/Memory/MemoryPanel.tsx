import { useEffect, useState, useCallback } from 'react'
import styles from './MemoryPanel.module.css'
import { useToast } from '../../hooks/useToast'
import { useAppStore } from '../../store/app'
import Toast from '../Toast/Toast'


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
  const [localSessions, setLocalSessions] = useState<LocalDBSession[]>([])
  const [selectedLocalSession, setSelectedLocalSession] = useState<LocalDBSession | null>(null)
  const [localSessionMsgs, setLocalSessionMsgs] = useState<LocalDBMessage[]>([])
  const [syncingSessionId, setSyncingSessionId] = useState<string | null>(null)
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

  // ── Load server DB memories ──────────────────────────────────────
  const loadDbMemories = useCallback(async () => {
    if (!token || !serverUrl) return
    try {
      const resp = await fetch(`${serverUrl}/api/memory`, {
        headers: { Authorization: `Bearer ${token}` },
      })
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

  // ── Load local SQLite sessions ────────────────────────────────────────
  const loadLocalSessions = useCallback(async () => {
    const db = window.nekoBridge?.db
    if (!db) return
    const result = await db.getSessions()
    setLocalSessions(result.sessions ?? [])
  }, [])

  useEffect(() => { loadLocalSessions() }, [loadLocalSessions])

  // ── Select local session → load messages ─────────────────────────────
  const selectLocalSession = useCallback(async (session: LocalDBSession) => {
    setSelectedLocalSession(session)
    setSelectedFile(null)
    setSelectedDbMemory(null)
    setEditing(false)
    const db = window.nekoBridge?.db
    if (!db) return
    const msgs = await db.getMessages(session.id)
    setLocalSessionMsgs(msgs)
  }, [])

  // ── Sync local session to server ──────────────────────────────────────
  const syncSessionToServer = useCallback(async (session: LocalDBSession) => {
    if (!token || !serverUrl) { showToast('请先连接服务器'); return }
    setSyncingSessionId(session.id)
    try {
      const db = window.nekoBridge?.db
      if (!db) throw new Error('DB不可用')

      const localMsgs = await db.getMessages(session.id)
      const msgs = localMsgs.filter(m => m.role === 'user' || m.role === 'assistant')

      const createRes = await fetch(`${serverUrl}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: session.title || '新对话' }),
      })
      if (!createRes.ok) throw new Error(`创建会话失败 ${createRes.status}`)
      const serverSession: { id: string; title: string; skill_id?: string | null } = await createRes.json()

      if (msgs.length > 0) {
        const batchRes = await fetch(`${serverUrl}/api/sessions/${serverSession.id}/messages/batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(msgs.map(m => ({ role: m.role, content: m.content }))),
        })
        if (!batchRes.ok) throw new Error(`上传消息失败 ${batchRes.status}`)
      }

      const store = useAppStore.getState()
      const cachedMsgs = store.messagesBySession[session.id] ?? []
      store.setMessages(serverSession.id, cachedMsgs)
      store.replaceSession(session.id, { id: serverSession.id, title: serverSession.title, skillId: serverSession.skill_id ?? undefined })

      await db.deleteSession(session.id)

      setLocalSessions(prev => prev.filter(s => s.id !== session.id))
      if (selectedLocalSession?.id === session.id) {
        setSelectedLocalSession(null)
        setLocalSessionMsgs([])
      }
      showToast(`「${session.title || '对话'}」已同步到服务器`)
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : '同步失败')
    } finally {
      setSyncingSessionId(null)
    }
  }, [token, serverUrl, selectedLocalSession, showToast])

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
    setSelectedDbMemory(null)
    readFile(name)
  }, [readFile])

  // ── Delete MD file ───────────────────────────────────────────
  const deleteFile = useCallback(async (e: React.MouseEvent, name: string) => {
    e.stopPropagation()
    const mem = window.nekoBridge?.memory
    if (!mem) return
    try {
      await mem.delete(name)
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
  }, [selectedFile, loadFiles, showToast])

  // ── Delete server DB memory ───────────────────────────────────
  const deleteDbMemory = useCallback(async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (!token || !serverUrl) return
    try {
      const resp = await fetch(`${serverUrl}/api/memory/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
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
                      {new Date(f.modifiedAt).toLocaleDateString('zh-CN')}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {/* 本地 SQLite 会话 */}
          {localSessions.length > 0 && (
            <>
              <div className={styles.dbSectionLabel}>💬 本地会话</div>
              <ul className={styles.list}>
                {localSessions.map(s => (
                  <li
                    key={s.id}
                    className={`${styles.fileItem} ${selectedLocalSession?.id === s.id ? styles.fileItemActive : ''}`}
                    onClick={() => selectLocalSession(s)}
                  >
                    <div className={styles.fileItemRow}>
                      <div className={styles.fileName}>{s.title || '(无标题)'}</div>
                      {serverConnected && token && (
                        <button
                          className={styles.sessionSyncBtn}
                          onClick={(e) => { e.stopPropagation(); void syncSessionToServer(s) }}
                          disabled={syncingSessionId === s.id}
                          title="同步到服务器"
                        >
                          {syncingSessionId === s.id ? '…' : '↑'}
                        </button>
                      )}
                    </div>
                    <div className={styles.fileMeta}>
                      {new Date(s.createdAt).toLocaleDateString('zh-CN')}
                    </div>
                  </li>
                ))}
              </ul>
            </>
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
          {!selectedFile && !selectedDbMemory && !selectedLocalSession ? (
            <div className={styles.placeholder}>← 选择一个文件查看</div>
          ) : selectedLocalSession ? (
            <>
              <div className={styles.editorToolbar}>
                <span className={styles.editorLabel}>💬 {selectedLocalSession.title || '本地对话'}</span>
                {serverConnected && token && (
                  <button
                    className={styles.btnPrimary}
                    onClick={() => void syncSessionToServer(selectedLocalSession)}
                    disabled={syncingSessionId === selectedLocalSession.id}
                  >
                    {syncingSessionId === selectedLocalSession.id ? '同步中…' : '↑ 同步到服务器'}
                  </button>
                )}
              </div>
              <div className={styles.sessionMsgs}>
                {localSessionMsgs.length === 0 ? (
                  <div className={styles.placeholder}>暂无消息</div>
                ) : (
                  localSessionMsgs.map(m => (
                    <div
                      key={m.id}
                      className={`${styles.sessionMsg} ${m.role === 'user' ? styles.sessionMsgUser : styles.sessionMsgAssistant}`}
                    >
                      <span className={styles.sessionMsgRole}>{m.role === 'user' ? '你' : '猫咪'}</span>
                      <pre className={styles.sessionMsgContent}>{m.content}</pre>
                    </div>
                  ))
                )}
              </div>
            </>
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
      </div>
    </div>
  )
}
