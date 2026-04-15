import { useState } from 'react'
import styles from './Sidebar.module.css'
import { useAppStore } from '../../store/app'

type Tab = 'sessions' | 'tasks' | 'skills' | 'memory' | 'personalization' | 'settings' | 'abilities'

const PANEL_ITEMS: { id: Tab; icon: string; label: string }[] = [
  { id: 'tasks',           icon: '⏰', label: '定时任务'   },
  { id: 'skills',          icon: '🛠️', label: '技能库'     },
  { id: 'memory',          icon: '🧠', label: '记忆'       },
  { id: 'personalization', icon: '🎨', label: '个性化设置' },
  { id: 'abilities',       icon: '⚡', label: '能力'       },
]

export function Sidebar() {
  const { sidebarTab, setSidebarTab, sessions, activeSessionId, setActiveSession, addSession, removeSession, setSettingsOpen, serverUrl, token } = useAppStore()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const deleteSession = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (deletingId) return
    setDeletingId(id)
    try {
      if (id.startsWith('local-')) {
        // 本地会话：硬删除 SQLite 记录
        await window.nekoBridge?.db?.deleteSession(id)
      } else {
        // 服务端会话：软删除
        await fetch(`${serverUrl}/api/sessions/${id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        })
      }
      removeSession(id)
    } finally {
      setDeletingId(null)
    }
  }

  const createNewSession = () => {
    const id = `local-${Date.now()}`
    addSession({ id, title: '新对话' })
    setActiveSession(id)
    setSidebarTab('sessions')
  }

  return (
    <aside className={styles.sidebar}>
      {/* Logo */}
      <div className={styles.logo}>
        <span className={styles.logoIcon}>🐾</span>
        <span className={styles.logoText}>NekoClaw</span>
      </div>

      {/* New session */}
      <div className={styles.topActions}>
        <button className={styles.newBtn} onClick={createNewSession}>
          <span className={styles.newBtnPlus}>＋</span>
          <span>新建对话</span>
        </button>
      </div>

      {/* Panel nav */}
      <nav className={styles.nav}>
        {PANEL_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`${styles.navItem} ${sidebarTab === item.id ? styles.active : ''}`}
            onClick={() => setSidebarTab(item.id)}
          >
            <span className={styles.navIcon}>{item.icon}</span>
            <span className={styles.navLabel}>{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Divider */}
      <div className={styles.divider} />

      {/* Session list */}
      <div className={styles.sectionLabel}>所有对话</div>
      <div className={styles.sessionList}>
        {sessions.length === 0 ? (
          <div className={styles.emptyHint}>暂无对话</div>
        ) : (
          sessions.map((s) => (
            <div
              key={s.id}
              className={`${styles.sessionItem} ${activeSessionId === s.id && sidebarTab === 'sessions' ? styles.sessionActive : ''}`}
              onClick={() => { setActiveSession(s.id); setSidebarTab('sessions') }}
            >
              <span className={styles.sessionIcon}>💬</span>
              <span className={styles.sessionTitle}>{s.title}</span>
              <button
                className={styles.sessionDeleteBtn}
                onClick={(e) => deleteSession(e, s.id)}
                disabled={deletingId === s.id}
                title="删除对话"
              >
                {deletingId === s.id ? '…' : '×'}
              </button>
            </div>
          ))
        )}
      </div>

      {/* Bottom bar */}
      <div className={styles.bottomBar}>
        <div className={styles.bottomBarInner}>
          <button
            className={styles.bottomBtn}
            onClick={() => setSettingsOpen(true)}
            title="设置"
          >
            <span className={styles.bottomIcon}>⚙️</span>
            <span className={styles.bottomLabel}>设置</span>
          </button>
          
          <div className={styles.bottomActions}>
            <button className={styles.iconBtn} title="切换主题">
              🌙
            </button>
            <button className={styles.iconBtn} title="切换语言">
              🌐
            </button>
          </div>
        </div>
      </div>
    </aside>
  )
}
