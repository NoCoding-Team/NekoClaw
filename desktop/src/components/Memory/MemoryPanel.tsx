import React, { useEffect, useState, useCallback } from 'react'
import styles from './MemoryPanel.module.css'
import { useAppStore } from '../../store/app'

interface Memory {
  id: number
  category: string
  content: string
  source_session_id: number | null
  created_at: string
}

const CATEGORIES = ['all', 'preference', 'fact', 'instruction', 'history', 'other']

export default function MemoryPanel() {
  const { token, serverUrl } = useAppStore()
  const [memories, setMemories] = useState<Memory[]>([])
  const [activeTab, setActiveTab] = useState('all')
  const [loading, setLoading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null)
  const [importText, setImportText] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [error, setError] = useState('')

  const fetchMemories = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const url = activeTab === 'all'
        ? `${serverUrl}/api/memory`
        : `${serverUrl}/api/memory?category=${activeTab}`
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setMemories(data)
    } catch (e: any) {
      setError(e.message)
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
      if (!res.ok) throw new Error(await res.text())
      setMemories(prev => prev.filter(m => m.id !== id))
      setDeleteTarget(null)
    } catch (e: any) {
      setError(e.message)
    }
  }

  async function handleExport() {
    try {
      const res = await fetch(`${serverUrl}/api/memory/export`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(await res.text())
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'memories.md'
      a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      setError(e.message)
    }
  }

  async function handleImport() {
    if (!importText.trim()) return
    // 解析 MD 格式：每行 "- [category] content"
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
      <div className={styles.header}>
        <span className={styles.title}>记忆库</span>
        <div className={styles.actions}>
          <button className={styles.btnSecondary} onClick={() => setShowImport(true)}>导入</button>
          <button className={styles.btnSecondary} onClick={handleExport}>导出 MD</button>
        </div>
      </div>

      <div className={styles.tabs}>
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            className={`${styles.tab} ${activeTab === cat ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(cat)}
          >
            {cat === 'all' ? '全部' : cat}
            {cat !== 'all' && (
              <span className={styles.badge}>
                {memories.filter(m => m.category === cat).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {error && <div className={styles.error}>{error}</div>}

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

      {/* 删除确认对话框 */}
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
