import { useState } from 'react'
import styles from './Sidebar.module.css'
import { useAppStore } from '../../store/app'
import { apiFetch } from '../../api/apiFetch'

type Tab = 'sessions' | 'tasks' | 'memory' | 'personalization' | 'settings' | 'abilities' | 'skills'

const PANEL_ITEMS: { id: Tab; icon: string; label: string }[] = [
  { id: 'tasks',           icon: '⏰', label: '猫钟'   },
  { id: 'memory',          icon: '🧠', label: '猫脑'   },
  { id: 'skills',          icon: '🧩', label: '猫技'   },
  { id: 'personalization', icon: '🎨', label: '猫样'   },
  { id: 'abilities',       icon: '⚡', label: '爪力'   },
]

export function Sidebar() {
  const { sidebarTab, setSidebarTab, sessions, activeSessionId, setActiveSession, removeSession, setSettingsOpen, serverUrl } = useAppStore()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const deleteSession = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (deletingId) return
    setDeletingId(id)
    try {
      if (!id.startsWith('local-')) {
        await apiFetch(`${serverUrl}/api/sessions/${id}`, {
          method: 'DELETE',
        })
      }
      removeSession(id)
    } finally {
      setDeletingId(null)
    }
  }

  const createNewSession = () => {
    // 不立即创建会话，只清空选中态回到欢迎页；发送第一条消息时再创建
    setActiveSession(null)
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
          <span>喵一声</span>
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
      <div className={styles.sectionLabel}>猫话录</div>
      <div className={styles.sessionList}>
        {sessions.filter(s => s.source !== 'scheduled_task').length === 0 ? (
          <div className={styles.emptyHint}>暂无对话</div>
        ) : (
          sessions.filter(s => s.source !== 'scheduled_task').map((s) => (
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
            title="猫档"
          >
            <span className={styles.bottomIcon}>⚙️</span>
            <span className={styles.bottomLabel}>猫档</span>
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
