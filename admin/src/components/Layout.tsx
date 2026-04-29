import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { logout } from '../api/auth'
import styles from './Layout.module.css'

const NAV_ITEMS = [
  { to: '/dashboard', label: '概览', icon: '◈' },
  { to: '/users', label: '用户管理', icon: '◉' },
  { to: '/models', label: '模型配置', icon: '◆' },
  { to: '/skills', label: 'Skills 管理', icon: '◇' },
  { to: '/tools', label: '工具管理', icon: '⚙' },
]

export default function Layout() {
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.logo}>
          <span className={styles.logoIcon}>🐾</span>
          <span>NekoClaw 管理</span>
        </div>
        <nav className={styles.nav}>
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `${styles.navItem} ${isActive ? styles.navItemActive : ''}`
              }
            >
              <span className={styles.navIcon}>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button className={styles.logoutBtn} onClick={handleLogout}>
          退出登录
        </button>
      </aside>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  )
}
