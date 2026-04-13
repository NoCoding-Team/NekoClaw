import styles from './Sidebar.module.css'
import { useAppStore } from '../../store/app'

type Tab = 'sessions' | 'tasks' | 'skills' | 'memory' | 'personalization' | 'settings'

const PANEL_ITEMS: { id: Tab; icon: string; label: string }[] = [
  { id: 'tasks',           icon: '⏰', label: '定时任务'   },
  { id: 'skills',          icon: '⚡', label: '技能库'     },
  { id: 'memory',          icon: '🧠', label: '记忆'       },
  { id: 'personalization', icon: '🎨', label: '个性化设置' },
]

export function Sidebar() {
  const { sidebarTab, setSidebarTab, sessions, activeSessionId, setActiveSession, addSession } = useAppStore()

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
            <span>{item.label}</span>
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
            <button
              key={s.id}
              className={`${styles.sessionItem} ${activeSessionId === s.id && sidebarTab === 'sessions' ? styles.sessionActive : ''}`}
              onClick={() => { setActiveSession(s.id); setSidebarTab('sessions') }}
            >
              <span className={styles.sessionIcon}>🗨</span>
              <span className={styles.sessionTitle}>{s.title}</span>
            </button>
          ))
        )}
      </div>

      {/* Bottom bar */}
      <div className={styles.bottomBar}>
        <button
          className={`${styles.bottomBtn} ${sidebarTab === 'settings' ? styles.bottomBtnActive : ''}`}
          onClick={() => setSidebarTab('settings')}
        >
          ⚙ 设置
        </button>
      </div>
    </aside>
  )
}
