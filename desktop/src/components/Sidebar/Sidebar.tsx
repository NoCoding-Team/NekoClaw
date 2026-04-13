import styles from './Sidebar.module.css'
import { useAppStore } from '../../store/app'
import MemoryPanel from '../Memory/MemoryPanel'
import SkillsPanel from '../Skills/SkillsPanel'
import ScheduledTasksPanel from '../ScheduledTasks/ScheduledTasksPanel'

const NAV_ITEMS = [
  { id: 'sessions', icon: '💬', label: '对话' },
  { id: 'tasks', icon: '⏰', label: '定时' },
  { id: 'skills', icon: '⚡', label: '技能库' },
  { id: 'memory', icon: '🧠', label: '记忆' },
  { id: 'settings', icon: '⚙️', label: '设置' },
] as const

export function Sidebar() {
  const { sidebarTab, setSidebarTab, sessions, activeSessionId, setActiveSession, addSession } = useAppStore()

  const createNewSession = async () => {
    const id = `local-${Date.now()}`
    addSession({ id, title: '新对话' })
    setActiveSession(id)
  }

  return (
    <aside className={styles.sidebar}>
      <div className={styles.logo}>
        <span className={styles.logoIcon}>🐾</span>
        <span className={styles.logoText}>NekoClaw</span>
      </div>

      <nav className={styles.nav}>
        {NAV_ITEMS.map((item) => (
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

      {sidebarTab === 'sessions' && (
        <div className={styles.sessionList}>
          <button className={styles.newBtn} onClick={createNewSession}>
            <span>＋</span> 新建对话
          </button>
          {sessions.map((s) => (
            <button
              key={s.id}
              className={`${styles.sessionItem} ${activeSessionId === s.id ? styles.sessionActive : ''}`}
              onClick={() => setActiveSession(s.id)}
            >
              <span className={styles.sessionTitle}>{s.title}</span>
            </button>
          ))}
        </div>
      )}

      {sidebarTab === 'tasks' && (
        <div className={styles.panelContainer}>
          <ScheduledTasksPanel />
        </div>
      )}

      {sidebarTab === 'memory' && (
        <div className={styles.panelContainer}>
          <MemoryPanel />
        </div>
      )}

      {sidebarTab === 'skills' && (
        <div className={styles.panelContainer}>
          <SkillsPanel />
        </div>
      )}

      {sidebarTab === 'settings' && (
        <div className={styles.settingsPlaceholder}>
          <span>⚙️</span>
          <p>设置页面</p>
          <small>即将推出</small>
        </div>
      )}
    </aside>
  )
}
