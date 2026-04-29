import { useEffect, useState } from 'react'
import { listTools, updateTool, checkTool, type ToolConfig } from '../api/tools'
import styles from './ToolsPage.module.css'

const CATEGORY_LABELS: Record<string, string> = {
  network: '网络工具',
  execution: '执行工具',
  memory: '记忆工具',
  file: '文件工具',
  browser: '浏览器工具',
  internal: '内部工具',
}

function StatusBadge({ tool }: { tool: ToolConfig }) {
  if (!tool.requires) return null
  const { status } = tool
  if (status.ready) return <span className={`${styles.statusRow} ${styles.statusReady}`}>✅ 就绪</span>
  if (!status.credentials_configured) return <span className={`${styles.statusRow} ${styles.statusWarn}`}>⚠️ 凭证未配置</span>
  if (!status.services_available) return <span className={`${styles.statusRow} ${styles.statusError}`}>❌ 服务不可用</span>
  return null
}

function ToolCard({ tool, onUpdate }: { tool: ToolConfig; onUpdate: (t: ToolConfig) => void }) {
  const [expanded, setExpanded] = useState(false)
  const [creds, setCreds] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  async function handleToggle() {
    try {
      const updated = await updateTool(tool.name, { enabled: !tool.enabled })
      onUpdate(updated)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : '操作失败')
    }
  }

  async function handleSaveCreds() {
    const nonEmpty = Object.fromEntries(Object.entries(creds).filter(([, v]) => v.trim()))
    if (Object.keys(nonEmpty).length === 0) return
    setSaving(true)
    try {
      const updated = await updateTool(tool.name, { credentials: nonEmpty })
      onUpdate(updated)
      setCreds({})
      setExpanded(false)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  async function handleRefresh() {
    try {
      const status = await checkTool(tool.name)
      onUpdate({ ...tool, status })
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : '检测失败')
    }
  }

  const hasCredentials = tool.requires && tool.requires.credentials.length > 0
  const hasServices = tool.requires && tool.requires.services.length > 0

  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <span className={styles.cardName}>{tool.name}</span>
        <button
          className={`${styles.toggle} ${tool.enabled ? styles.toggleOn : styles.toggleOff}`}
          onClick={handleToggle}
        >
          {tool.enabled ? '已启用' : '已禁用'}
        </button>
      </div>
      <div className={styles.cardDesc}>{tool.description}</div>

      {tool.requires && <StatusBadge tool={tool} />}

      {hasServices && (
        <div className={styles.statusRow}>
          依赖服务：{tool.requires!.services.join(', ')}
        </div>
      )}

      {hasCredentials && (
        <>
          {!expanded ? (
            <div className={styles.credActions}>
              <button className={styles.btnRefresh} onClick={() => setExpanded(true)}>
                配置凭证
              </button>
              <button className={styles.btnRefresh} onClick={handleRefresh}>
                刷新状态
              </button>
            </div>
          ) : (
            <div className={styles.credSection}>
              {tool.requires!.credentials.map(c => (
                <div key={c.key} className={styles.credField}>
                  <label className={styles.credLabel}>{c.label}</label>
                  <input
                    className={styles.credInput}
                    type="password"
                    placeholder={tool.status.credentials_configured ? '••••••••（已配置，留空不修改）' : c.hint}
                    value={creds[c.key] || ''}
                    onChange={e => setCreds(prev => ({ ...prev, [c.key]: e.target.value }))}
                  />
                </div>
              ))}
              <div className={styles.credActions}>
                <button className={styles.btnSave} onClick={handleSaveCreds} disabled={saving}>
                  {saving ? '保存中…' : '保存'}
                </button>
                <button className={styles.btnRefresh} onClick={() => { setExpanded(false); setCreds({}) }}>
                  取消
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {!hasCredentials && tool.requires && (
        <div className={styles.credActions}>
          <button className={styles.btnRefresh} onClick={handleRefresh}>
            刷新状态
          </button>
        </div>
      )}
    </div>
  )
}

export default function ToolsPage() {
  const [tools, setTools] = useState<ToolConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    try {
      setTools(await listTools())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function handleUpdate(updated: ToolConfig) {
    setTools(prev => prev.map(t => t.name === updated.name ? updated : t))
  }

  // Group by category
  const grouped = tools.reduce<Record<string, ToolConfig[]>>((acc, t) => {
    const cat = t.category || 'other'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(t)
    return acc
  }, {})

  // Category display order
  const categoryOrder = ['network', 'execution', 'memory', 'file', 'browser', 'internal']
  const sortedCategories = Object.keys(grouped).sort(
    (a, b) => (categoryOrder.indexOf(a) === -1 ? 99 : categoryOrder.indexOf(a)) - (categoryOrder.indexOf(b) === -1 ? 99 : categoryOrder.indexOf(b)),
  )

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>工具管理</h1>
      </div>
      {error && <div className={styles.error}>{error}</div>}
      {loading ? (
        <div className={styles.loading}>加载中…</div>
      ) : (
        sortedCategories.map(cat => (
          <div key={cat} className={styles.categoryGroup}>
            <div className={styles.categoryTitle}>
              {CATEGORY_LABELS[cat] || cat}
            </div>
            <div className={styles.grid}>
              {grouped[cat].map(t => (
                <ToolCard key={t.name} tool={t} onUpdate={handleUpdate} />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
