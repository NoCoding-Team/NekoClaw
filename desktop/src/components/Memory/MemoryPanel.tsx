import { X, Brain, Zap, Sparkles, User, VenetianMask, Bot, Pin } from 'lucide-react'
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

const PINNED_FILES = ['SOUL.md', 'USER.md', 'IDENTITY.md', 'AGENTS.md', 'MEMORY.md', 'SKILLS_SNAPSHOT.md']
const PIN_ORDER: Record<string, number> = {
  'SOUL.md': 0, 'USER.md': 1, 'IDENTITY.md': 2, 'AGENTS.md': 3, 'MEMORY.md': 4, 'SKILLS_SNAPSHOT.md': 5,
}
const PIN_ICONS: Record<string, React.ReactNode> = {
  'SOUL.md': <Sparkles size={14} strokeWidth={2} />, 'USER.md': <User size={14} strokeWidth={2} />, 'IDENTITY.md': <VenetianMask size={14} strokeWidth={2} />, 'AGENTS.md': <Bot size={14} strokeWidth={2} />, 'MEMORY.md': <Pin size={14} strokeWidth={2} />, 'SKILLS_SNAPSHOT.md': <Zap size={14} strokeWidth={2} />,
}
const isDateFile = (n: string) => /^(notes\/)\d{4}-\d{2}-\d{2}\.md$/.test(n)
function displayName(name: string) {
  if (isDateFile(name)) return name.replace(/^notes\//, '').replace('.md', '')
  return name
}
function fileIcon(name: string) {
  if (PIN_ICONS[name]) return PIN_ICONS[name]
  if (isDateFile(name)) return <Pin size={14} strokeWidth={2} />
  return <Bot size={14} strokeWidth={2} />
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
  const { token, serverUrl, serverConnected, skillsVersion, customLLMConfig } = useAppStore()

  // ── Load file list ────────────────────────────────────────────────────
  const loadFiles = useCallback(async () => {
    if (!token || !serverUrl) return
    setLoading(true)
    try {
      const resp = await apiFetch(`${serverUrl}/api/memory/files`)
      if (!resp.ok) { setFiles([]); return }
      const result = await resp.json() as Array<{ name: string; modifiedAt?: number }>
      const serverNames = new Set(result.map(f => f.name))
      // Always include pinned stubs even if they don't exist on server yet
      const stubs: MemoryFile[] = PINNED_FILES
        .filter(n => !serverNames.has(n))
        .map(n => ({ name: n, modifiedAt: 0 }))
      const items: MemoryFile[] = [
        ...result.map((f) => ({ name: f.name, modifiedAt: f.modifiedAt ?? 0 })),
        ...stubs,
      ]
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
    if (serverConnected && token) {
      loadFiles()
      // Auto-generate SKILLS_SNAPSHOT.md if it doesn't exist on server
      generateSkillsSnapshot()
    } else {
      setFiles([])
    }
  }, [loadFiles, serverConnected, token])

  // ── Auto-generate SKILLS_SNAPSHOT.md from skills API ─────────────
  const generateSkillsSnapshot = useCallback(async () => {
    if (!token || !serverUrl) return
    try {
      // Check if file already exists
      const checkResp = await apiFetch(`${serverUrl}/api/memory/files/SKILLS_SNAPSHOT.md`)
      if (checkResp.ok) return // already exists, skip

      // Fetch skills list
      const skillsResp = await apiFetch(`${serverUrl}/api/skills`)
      if (!skillsResp.ok) return
      const skills = await skillsResp.json() as Array<{ name: string; description: string; triggers?: string[]; enabled: boolean }>
      const enabled = skills.filter(s => s.enabled)
      if (enabled.length === 0) return

      // Build XML snapshot
      const xmlLines = ['<available_skills>']
      for (const s of enabled) {
        xmlLines.push('  <skill>')
        xmlLines.push(`    <name>${s.name}</name>`)
        xmlLines.push(`    <description>${s.description}</description>`)
        if (s.triggers?.length) xmlLines.push(`    <triggers>${s.triggers.join(', ')}</triggers>`)
        xmlLines.push('  </skill>')
      }
      xmlLines.push('</available_skills>')

      const content = [
        '# 可用技能列表（Skills Snapshot）',
        '',
        '> 此文件由系统自动生成，列出了当前启用的全部技能。',
        '> 手动编辑此文件不会生效——技能的启用/禁用请通过「技能库」页面管理。',
        '',
        xmlLines.join('\n'),
      ].join('\n')

      await apiFetch(`${serverUrl}/api/memory/files/SKILLS_SNAPSHOT.md`, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/plain' },
        body: content,
      })
      // Refresh file list to show the new file
      loadFiles()
    } catch { /* ignore */ }
  }, [token, serverUrl, loadFiles])

  // ── Re-read SKILLS_SNAPSHOT.md when skills change ─────────────────
  useEffect(() => {
    if (!skillsVersion || !token || !serverUrl) return
    // Slight delay to let backend finish writing the file
    const t = setTimeout(async () => {
      try {
        const resp = await apiFetch(`${serverUrl}/api/memory/files/SKILLS_SNAPSHOT.md`)
        if (!resp.ok) return
        const data = await resp.json() as { content?: string }
        if (selectedFile === 'SKILLS_SNAPSHOT.md') {
          setFileContent(data.content ?? '')
        }
        loadFiles()
      } catch { /* ignore */ }
    }, 500)
    return () => clearTimeout(t)
  }, [skillsVersion, token, serverUrl, selectedFile, loadFiles])

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



  const handleSelectFile = useCallback(async (name: string) => {
    setSelectedFile(name)
    setSelectedDbMemory(null)
    setEditing(false)
    if (!token || !serverUrl) return
    try {
      const resp = await apiFetch(`${serverUrl}/api/memory/files/${encodeURIComponent(name)}`)
      if (resp.status === 404) {
        // File doesn't exist yet — open blank editor so user can create it
        const defaultContent = `# ${name.replace('.md', '')}\n\n`
        setFileContent(defaultContent)
        setEditBuffer(defaultContent)
        setEditing(true)
      } else if (resp.ok) {
        const data = await resp.json() as { content?: string }
        setFileContent(data.content ?? '')
        setEditing(false)
      } else {
        setFileContent('')
      }
    } catch {
      setFileContent('')
    }
  }, [token, serverUrl])

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

  const [generatingNote, setGeneratingNote] = useState(false)

  // ── Create today note (AI-generated or blank fallback) ───────────────
  const createTodayNote = async () => {
    if (!token || !serverUrl) return
    const today = new Date().toISOString().slice(0, 10)
    const fileName = `notes/${today}.md`
    // Always try AI generation first
    setGeneratingNote(true)
    showToast('正在用 AI 整理今日对话…')
    let genReason: string | undefined
    try {
      const resp = await apiFetch(`${serverUrl}/api/memory/generate-daily-note`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ custom_llm_config: customLLMConfig?.enabled ? customLLMConfig : null }),
      })
      if (resp.ok) {
        const data = await resp.json() as { ok: boolean; reason?: string; path?: string }
        genReason = data.reason
        if (data.ok) {
          await loadFiles()
          setSelectedFile(fileName)
          setEditing(false)
          const contentResp = await apiFetch(`${serverUrl}/api/memory/files/${encodeURIComponent(fileName)}`)
          if (contentResp.ok) {
            const cd = await contentResp.json() as { content?: string }
            setFileContent(cd.content ?? '')
            setEditBuffer(cd.content ?? '')
          }
          showToast('今日笔记已生成')
          return
        }
      }
    } catch { /* fall through */ } finally {
      setGeneratingNote(false)
    }
    // Fallback: open existing file or create blank note
    const existing = files.find(f => f.name === fileName)
    if (existing) {
      handleSelectFile(fileName)
      if (genReason === 'no_llm_config') showToast('未配置 AI 模型，无法自动生成')
      else if (genReason === 'llm_error') showToast('AI 生成失败，请检查模型配置')
      else showToast('今日暂无对话记录，已打开笔记')
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

  // ── Categorise files ───────────────────────────────────────────────────
  const pinnedFiles = files.filter(f => f.name in PIN_ORDER)
  const dateFiles   = files.filter(f => isDateFile(f.name))
  const otherFiles  = files.filter(f => !(f.name in PIN_ORDER) && !isDateFile(f.name))

  const renderFileItem = (f: MemoryFile) => {
    const isStub = f.modifiedAt === 0 && PINNED_FILES.includes(f.name)
    return (
      <div
        key={f.name}
        className={`${styles.fileItem} ${isStub ? styles.fileItemStub : ''} ${selectedFile === f.name ? styles.fileItemActive : ''}`}
        onClick={() => handleSelectFile(f.name)}
      >
        <span className={styles.fileIcon}>{fileIcon(f.name)}</span>
        <div className={styles.fileInfo}>
          <span className={styles.fileName}>
            {displayName(f.name)}
          </span>
          {f.modifiedAt > 0 ? (
            <span className={styles.fileMeta}>
              {new Date(f.modifiedAt * 1000).toLocaleDateString('zh-CN')}
            </span>
          ) : isStub ? (
            <span className={styles.fileMeta}>点击创建</span>
          ) : null}
        </div>
        {!isStub && (
          <button
            className={styles.deleteBtn}
            onClick={(e) => deleteFile(e, f.name)}
            title="删除"
          >✕</button>
        )}
      </div>
    )
  }

  return (
    <div className={styles.panel}>
      <Toast message={toast} onClose={dismissToast} />

      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.headerIcon}><Brain size={14} strokeWidth={2} /></span>
          <span className={styles.title}>猫脑</span>
        </div>
        <button className={styles.btnToday} onClick={createTodayNote} disabled={generatingNote}>
          {generatingNote ? '生成中…' : '＋ 今日笔记'}
        </button>
      </div>

      <div className={styles.body}>
        {(!serverConnected || !token) ? (
          <div className={styles.fullPlaceholder}>
            <div className={styles.placeholderEmoji}>🔌</div>
            <div className={styles.placeholderTitle}>未连接服务器</div>
            <div className={styles.placeholderSub}>请先登录后查看记忆文件</div>
          </div>
        ) : (
          <>
            {/* ── Sidebar ──────────────────────────────────────────── */}
            <div className={styles.sidebar}>
              {loading ? (
                <div className={styles.sidebarMsg}>加载中…</div>
              ) : files.length === 0 && dbMemories.length === 0 && !serverConnected ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyEmoji}>🌱</div>
                  <div className={styles.emptyText}>暂无记忆文件</div>
                  <div className={styles.emptySub}>与猫咪对话时会自动创建</div>
                </div>
              ) : (
                <>
                  {pinnedFiles.length > 0 && (
                    <div className={styles.section}>
                      <div className={styles.sectionLabel}>核心文件</div>
                      {pinnedFiles.map(renderFileItem)}
                    </div>
                  )}
                  {dateFiles.length > 0 && (
                    <div className={styles.section}>
                      <div className={styles.sectionLabel}>笔记</div>
                      {dateFiles.map(renderFileItem)}
                    </div>
                  )}
                  {otherFiles.length > 0 && (
                    <div className={styles.section}>
                      <div className={styles.sectionLabel}>其他</div>
                      {otherFiles.map(renderFileItem)}
                    </div>
                  )}
                  {dbMemories.length > 0 && (
                    <div className={styles.section}>
                      <div className={styles.sectionLabel}>云端记忆</div>
                      {dbMemories.map(m => (
                        <div
                          key={m.id}
                          className={`${styles.fileItem} ${selectedDbMemory?.id === m.id ? styles.fileItemActive : ''}`}
                          onClick={() => { setSelectedDbMemory(m); setSelectedFile(null); setEditing(false) }}
                        >
                          <span className={styles.fileIcon}><Brain size={14} strokeWidth={2} /></span>
                          <div className={styles.fileInfo}>
                            <span className={styles.fileName}>{m.category}</span>
                            <span className={styles.fileMeta}>
                              {m.content.length > 30 ? m.content.slice(0, 30) + '…' : m.content}
                            </span>
                          </div>
                          <button
                            className={styles.deleteBtn}
                            onClick={(e) => deleteDbMemory(e, m.id)}
                            title="删除"
                          >✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* ── Content area ─────────────────────────────────────── */}
            <div className={styles.content}>
              {!selectedFile && !selectedDbMemory ? (
                <div className={styles.contentPlaceholder}>
                  <div className={styles.placeholderEmoji}>📖</div>
                  <div className={styles.placeholderTitle}>选择文件查看</div>
                  <div className={styles.placeholderSub}>从左侧选择一个记忆文件</div>
                </div>
              ) : selectedDbMemory ? (
                <>
                  <div className={styles.contentToolbar}>
                    <div className={styles.toolbarTitle}>
                      <span className={styles.toolbarIcon}><Brain size={14} strokeWidth={2} /></span>
                      {selectedDbMemory.category}
                    </div>
                    <span className={styles.toolbarMeta}>
                      {new Date(selectedDbMemory.created_at).toLocaleString('zh-CN')}
                    </span>
                  </div>
                  <div className={styles.rendered}>
                    <p>{selectedDbMemory.content}</p>
                  </div>
                </>
              ) : editing ? (
                <>
                  <div className={styles.contentToolbar}>
                    <div className={styles.toolbarTitle}>
                      <span className={styles.toolbarIcon}>{fileIcon(selectedFile!)}</span>
                      {selectedFile}
                      <span className={styles.editingBadge}>编辑中</span>
                    </div>
                    <div className={styles.toolbarActions}>
                      <button className={styles.btnSave} onClick={saveEdit}>保存</button>
                      <button className={styles.btnCancel} onClick={cancelEditing}>取消</button>
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
                  <div className={styles.contentToolbar}>
                    <div className={styles.toolbarTitle}>
                      <span className={styles.toolbarIcon}>{fileIcon(selectedFile!)}</span>
                      {selectedFile}
                    </div>
                    <button className={styles.btnEdit} onClick={startEditing}>编辑</button>
                  </div>
                  <div
                    className={styles.rendered}
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(fileContent) }}
                  />
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
