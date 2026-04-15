import React, { useEffect, useState, useCallback } from 'react'
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

interface LocalMemory {
  id: string
  category: string
  content: string
  created_at: string
}

const CATEGORIES = ['all', 'preference', 'fact', 'instruction', 'history', 'other']

export default function MemoryPanel() {
  const { token, serverUrl } = useAppStore()
  const [memories, setMemories] = useState<Memory[]>([])
  const [localMemories, setLocalMemories] = useState<LocalMemory[]>([])
  const [dataPath, setDataPath] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('all')
  const [source, setSource] = useState<'all' | 'server' | 'local'>('all')
  const [loading, setLoading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null)
  const [deleteLocalTarget, setDeleteLocalTarget] = useState<string | null>(null)
  const [importText, setImportText] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [showAddLocal, setShowAddLocal] = useState(false)
  const [localForm, setLocalForm] = useState({ category: 'general', content: '' })
  const { toast, showToast, dismissToast } = useToast()

  // Get userData path for local file storage
  useEffect(() => {
    window.nekoBridge?.app?.getDataPath()
      .then(p => setDataPath(p))
      .catch(() => {})
  }, [])

  const localMemPath = dataPath
    ? dataPath.replace(/\\/g, '/') + '/neko_local_memories.json'
    : null

  const loadLocalMemories = useCallback(async () => {
    if (!localMemPath) return
    try {
      const res = await window.nekoBridge.file.read(localMemPath)
      if (res.content) setLocalMemories(JSON.parse(res.content))
    } catch { setLocalMemories([]) }
  }, [localMemPath])

  useEffect(() => { loadLocalMemories() }, [loadLocalMemories])

  const saveLocalMemories = async (updated: LocalMemory[]) => {
    if (!localMemPath) return
    setLocalMemories(updated)
    await window.nekoBridge.file.write(localMemPath, JSON.stringify(updated, null, 2))
  }

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

  async function handleDeleteLocal(id: string) {
    await saveLocalMemories(localMemories.filter(m => m.id !== id))
    setDeleteLocalTarget(null)
  }

  async function handleAddLocal() {
    if (!localForm.content.trim()) return
    const newMem: LocalMemory = {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      category: localForm.category,
      content: localForm.content.trim(),
      created_at: new Date().toISOString(),
    }
    await saveLocalMemories([...localMemories, newMem])
    setLocalForm({ category: 'general', content: '' })
    setShowAddLocal(false)
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

  // Merge and filter
  const filteredServer = (source === 'local') ? [] :
    (activeTab === 'all' ? memories : memories.filter(m => m.category === activeTab))
  const filteredLocal = (source === 'server') ? [] :
    (activeTab === 'all' ? localMemories : localMemories.filter(m => m.category === activeTab))

  return (
    <div className={styles.panel}>
      <Toast message={toast} onClose={dismissToast} />
      <div className={styles.header}>
        <span className={styles.title}>记忆库</span>
        <div className={styles.actions}>
          {source !== 'server' && (
            <button className={styles.btnSecondary} onClick={() => setShowAddLocal(true)}>+ 本地记忆</button>
          )}
          <button className={styles.btnSecondary} onClick={() => setShowImport(true)}>导入</button>
          <button className={styles.btnSecondary} onClick={handleExport}>导出 MD</button>
        </div>
      </div>

      {/* Source tabs */}
      <div className={styles.sourceTabs}>
        {(['all', 'server', 'local'] as const).map(s => {
          const labels = { all: '全部', server: '服务端', local: '仅本机' }
          return (
            <button
              key={s}
              className={`${styles.sourceTab} ${source === s ? styles.sourceTabActive : ''}`}
              onClick={() => setSource(s)}
            >
              {labels[s]}
            </button>
          )
        })}
      </div>

      <div className={styles.tabs}>
        {CATEGORIES.map(cat => {
          const count = cat === 'all'
            ? filteredServer.length + filteredLocal.length
            : [...filteredServer, ...filteredLocal].filter(m => m.category === cat).length
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
      ) : filteredServer.length === 0 && filteredLocal.length === 0 ? (
        <div className={styles.empty}>暂无记忆条目</div>
      ) : (
        <ul className={styles.list}>
          {filteredServer.map(m => (
            <li key={`s-${m.id}`} className={styles.item}>
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
          {filteredLocal.map(m => (
            <li key={`l-${m.id}`} className={styles.item}>
              <div className={styles.itemContent}>{m.content}</div>
              <div className={styles.itemMeta}>
                <span className={styles.catTag}>{m.category}</span>
                <span className={styles.localTag}>仅本机</span>
                <span className={styles.time}>{new Date(m.created_at).toLocaleDateString('zh-CN')}</span>
              </div>
              <button
                className={styles.deleteBtn}
                onClick={() => setDeleteLocalTarget(m.id)}
                title="删除"
              >✕</button>
            </li>
          ))}
        </ul>
      )}

      {/* Server delete confirm */}
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

      {/* Local delete confirm */}
      {deleteLocalTarget !== null && (
        <div className={styles.overlay}>
          <div className={styles.dialog}>
            <p>确认删除这条本地记忆？</p>
            <div className={styles.dialogActions}>
              <button className={styles.btnDanger} onClick={() => handleDeleteLocal(deleteLocalTarget)}>删除</button>
              <button className={styles.btnSecondary} onClick={() => setDeleteLocalTarget(null)}>取消</button>
            </div>
          </div>
        </div>
      )}

      {/* 添加本地记忆 dialog */}
      {showAddLocal && (
        <div className={styles.overlay}>
          <div className={styles.dialog}>
            <p className={styles.dialogTitle}>添加本地记忆</p>
            <p className={styles.dialogHint}>记忆仅存储在本机，不上传到服务器</p>
            <select
              className={styles.categorySelect}
              value={localForm.category}
              onChange={e => setLocalForm(p => ({ ...p, category: e.target.value }))}
            >
              {CATEGORIES.filter(c => c !== 'all').map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <textarea
              className={styles.importArea}
              value={localForm.content}
              onChange={e => setLocalForm(p => ({ ...p, content: e.target.value }))}
              placeholder="输入记忆内容…"
              rows={4}
            />
            <div className={styles.dialogActions}>
              <button className={styles.btnPrimary} onClick={handleAddLocal}>添加</button>
              <button className={styles.btnSecondary} onClick={() => setShowAddLocal(false)}>取消</button>
            </div>
          </div>
        </div>
      )}

      {/* 导入对话框 */}
      {showImport && (
        <div className={styles.overlay}>
          <div className={styles.dialog}>
            <p className={styles.dialogTitle}>导入记忆（MD 格式）</p>
            <p className={styles.dialogHint}>每行格式：<code>- [category] content</code>，重复内容自动跳过</p>
            <textarea
              className={styles.importArea}
              value={importText}
              onChange={e => setImportText(e.target.value)}
              placeholder="- [preference] 我喜欢简洁的代码风格&#10;- [fact] 我的主要语言是 TypeScript"
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

