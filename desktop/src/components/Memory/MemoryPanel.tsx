import { useEffect, useState, useCallback } from 'react'
import styles from './MemoryPanel.module.css'
import { useAppStore } from '../../store/app'
import { useToast, throwIfError } from '../../hooks/useToast'
import Toast from '../Toast/Toast'

interface Memory {
  id: number
  category: string
  content: string
  source_session_id: number | null
  created_at: string
}

interface LocalSession {
  id: string
  title: string
  messageCount: number
  createdAt: number
}

const CATEGORIES = ['all', 'preference', 'fact', 'instruction', 'history', 'other']

export default function MemoryPanel() {
  const { token, serverUrl, syncEnabled } = useAppStore()
  const [memories, setMemories] = useState<Memory[]>([])
  const [activeTab, setActiveTab] = useState('all')
  const [panel, setPanel] = useState<'memories' | 'local'>('memories')
  const [loading, setLoading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null)
  const [importText, setImportText] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [localSessions, setLocalSessions] = useState<LocalSession[]>([])
  const [syncingId, setSyncingId] = useState<string | null>(null)
  const { toast, showToast, dismissToast } = useToast()

  const fetchMemories = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const url = activeTab === 'all'
        ? `${serverUrl}/api/memory`
        : `${serverUrl}/api/memory?category=${activeTab}`
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      await throwIfError(res)
      const data = await res.json()
      setMemories(data)
    } catch (e: any) {
      showToast(e.message)
    } finally {
      setLoading(false)
    }
  }, [token, serverUrl, activeTab])

  useEffect(() => { fetchMemories() }, [fetchMemories])

  const loadLocalSessions = useCallback(async () => {
    const db = window.nekoBridge?.db
    if (!db) return
    try {
      const result = await db.getSessions({ onlyUnsynced: true })
      const sessions = result.sessions ?? []
      const items: LocalSession[] = []
      for (const s of sessions) {
        const msgs = await db.getMessages(s.id)
        items.push({ id: s.id, title: s.title, messageCount: msgs.length, createdAt: s.createdAt })
      }
      setLocalSessions(items)
    } catch { setLocalSessions([]) }
  }, [])

  useEffect(() => {
    if (panel === 'local') loadLocalSessions()
  }, [panel, loadLocalSessions])

  async function handleDelete(id: number) {
    try {
      const res = await fetch(`${serverUrl}/api/memory/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      await throwIfError(res)
      setMemories(prev => prev.filter(m => m.id !== id))
      setDeleteTarget(null)
    } catch (e: any) {
      showToast(e.message)
    }
  }

  async function handleSyncSession(ls: LocalSession) {
    if (!token) return
    setSyncingId(ls.id)
    try {
      const resSession = await fetch(`${serverUrl}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: ls.title || '本地会话' }),
      })
      if (!resSession.ok) throw new Error('创建会话失败')
      const serverSession = await resSession.json()

      const db = window.nekoBridge?.db
      if (db) {
        const msgs = await db.getMessages(ls.id)
        const batch = msgs
          .filter(m => m.role === 'user' || m.role === 'assistant')
          .map(m => ({ role: m.role, content: m.content }))
        if (batch.length > 0) {
          await fetch(`${serverUrl}/api/sessions/${serverSession.id}/messages/batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(batch),
          })
        }
        await db.markSynced(ls.id)
      }

      setLocalSessions(prev => prev.filter(s => s.id !== ls.id))
      showToast('已同步到服务器')
    } catch (e: any) {
      showToast(e.message || '同步失败')
    } finally {
      setSyncingId(null)
    }
  }

  async function handleExport() {
    try {
      const res = await fetch(`${serverUrl}/api/memory/export`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      await throwIfError(res)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'memories.md'
      a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      showToast(e.message)
    }
  }

  async function handleImport() {
    if (!importText.trim()) return
    const lines = importText.split('\n').filter(l => l.trim().startsWith('-'))
    const items = lines.map(line => {
      const match = line.match(/^-\s*\[(\w+)\]\s*(.+)$/)
      if (match) return { category: match[1], content: match[2].trim() }
      return { category: 'other', content: line.replace(/^-\s*/, '').trim() }
    }).filter(i => i.content)

    for (const item of items) {
      const duplicate = memories.some(m => m.content === item.content)
      if (duplicate) continue
      await fetch(`${serverUrl}/api/memory`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      })
    }
    setShowImport(false)
    setImportText('')
    fetchMemories()
  }

  const filtered = activeTab === 'all' ? memories : memories.filter(m => m.category === activeTab)

  return (
    <div className={styles.panel}>
      <Toast message={toast} onClose={dismissToast} />
      <div className={styles.header}>
        <span className={styles.title}>记忆库</span>
        <div className={styles.actions}>
          <button className={styles.btnSecondary} onClick={() => setShowImport(true)}>导入</button>
          <button className={styles.btnSecondary} onClick={handleExport}>导出 MD</button>
        </div>
      </div>

      {/* Panel toggle */}
      <div className={styles.sourceTabs}>
        <button
          className={`${styles.sourceTab} ${panel === 'memories' ? styles.sourceTabActive : ''}`}
          onClick={() => setPanel('memories')}
        >
          记忆
        </button>
        <button
          className={`${styles.sourceTab} ${panel === 'local' ? styles.sourceTabActive : ''}`}
          onClick={() => setPanel('local')}
        >
          本地会话
          {localSessions.length > 0 && <span className={styles.badge}>{localSessions.length}</span>}
        </button>
      </div>

      {panel === 'memories' ? (
        <>
          <div className={styles.tabs}>
            {CATEGORIES.map(cat => {
              const count = cat === 'all' ? memories.length : memories.filter(m => m.category === cat).length
              return (
                <button
                  key={cat}
                  className={`${styles.tab} ${activeTab === cat ? styles.tabActive : ''}`}
                  onClick={() => setActiveTab(cat)}
                >
                  {cat === 'all' ? '全部' : cat}
                  {cat !== 'all' && <span className={styles.badge}>{count}</span>}
                </button>
              )
            })}
          </div>

          {loading ? (
            <div className={styles.loading}>加载中…</div>
          ) : filtered.length === 0 ? (
            <div className={styles.empty}>暂无记忆条目</div>
          ) : (
            <ul className={styles.list}>
              {filtered.map(m => (
                <li key={m.id} className={styles.item}>
                  <div className={styles.itemContent}>{m.content}</div>
                  <div className={styles.itemMeta}>
                    <span className={styles.catTag}>{m.category}</span>
                    <span className={styles.time}>{new Date(m.created_at).toLocaleDateString('zh-CN')}</span>
                    {m.source_session_id && (
                      <span className={styles.sessionTag}>会话 #{m.source_session_id}</span>
                    )}
                  </div>
                  <button
                    className={styles.deleteBtn}
                    onClick={() => setDeleteTarget(m.id)}
                    title="删除"
                  >✕</button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <>
          {!syncEnabled && (
            <div className={styles.syncBanner}>
              本地优先模式已开启，对话默认仅存储在本机
            </div>
          )}
          {localSessions.length === 0 ? (
            <div className={styles.empty}>没有未同步的本地会话</div>
          ) : (
            <ul className={styles.list}>
              {localSessions.map(ls => (
                <li key={ls.id} className={styles.item} style={{ position: 'relative' }}>
                  <div className={styles.itemContent}>{ls.title || '未命名会话'}</div>
                  <div className={styles.itemMeta}>
                    <span className={styles.catTag}>{ls.messageCount} 条消息</span>
                    <span className={styles.time}>{new Date(ls.createdAt).toLocaleDateString('zh-CN')}</span>
                  </div>
                  <button
                    className={styles.btnSecondary}
                    onClick={() => handleSyncSession(ls)}
                    disabled={syncingId === ls.id || !token}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)' }}
                  >
                    {syncingId === ls.id ? '同步中…' : '同步'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {/* Delete confirm */}
      {deleteTarget !== null && (
        <div className={styles.overlay}>
          <div className={styles.dialog}>
            <p>确认删除这条记忆？此操作不可撤销。</p>
            <div className={styles.dialogActions}>
              <button className={styles.btnDanger} onClick={() => handleDelete(deleteTarget)}>删除</button>
              <button className={styles.btnSecondary} onClick={() => setDeleteTarget(null)}>取消</button>
            </div>
          </div>
        </div>
      )}

      {/* Import dialog */}
      {showImport && (
        <div className={styles.overlay}>
          <div className={styles.dialog}>
            <p className={styles.dialogTitle}>导入记忆（MD 格式）</p>
            <p className={styles.dialogHint}>每行格式：<code>- [category] content</code>，重复内容自动跳过</p>
            <textarea
              className={styles.importArea}
              value={importText}
              onChange={e => setImportText(e.target.value)}
              placeholder={`- [preference] 我喜欢简洁的代码风格\n- [fact] 我的主要语言是 TypeScript`}
              rows={8}
            />
            <div className={styles.dialogActions}>
              <button className={styles.btnPrimary} onClick={handleImport}>导入</button>
              <button className={styles.btnSecondary} onClick={() => setShowImport(false)}>取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
