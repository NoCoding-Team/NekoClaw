import { useState } from 'react'
import { useAppStore } from '../../store/app'
import styles from './SettingsPanel.module.css'

type Tab = 'account' | 'server'

export function SettingsPanel() {
  const [tab, setTab] = useState<Tab>('account')
  const { userId, serverUrl, clearAuth, setServerConnected } = useAppStore()

  const handleLogout = () => {
    clearAuth()
  }

  const handleSwitchServer = () => {
    setServerConnected(false)
  }

  return (
    <div className={styles.settings}>
      {/* Title bar */}
      <div className={styles.topBar}>
        <span className={styles.topTitle}>设置</span>
        <div className={styles.windowControls}>
          <button onClick={() => window.nekoBridge?.window.minimize()}>─</button>
          <button onClick={() => window.nekoBridge?.window.maximize()}>□</button>
          <button className={styles.closeBtn} onClick={() => window.nekoBridge?.window.close()}>✕</button>
        </div>
      </div>

      {/* Body */}
      <div className={styles.body}>
        {/* Left nav */}
        <nav className={styles.nav}>
          <div className={styles.navGroup}>
            <div className={styles.navGroupLabel}>账户与连接</div>
            <button
              className={`${styles.navItem} ${tab === 'account' ? styles.active : ''}`}
              onClick={() => setTab('account')}
            >
              👤 我的账户
            </button>
            <button
              className={`${styles.navItem} ${tab === 'server' ? styles.active : ''}`}
              onClick={() => setTab('server')}
            >
              🌐 服务器
            </button>
          </div>
        </nav>

        {/* Right content */}
        <div className={styles.content}>
          {tab === 'account' && (
            <div>
              <h2 className={styles.sectionTitle}>我的账户</h2>
              <div className={styles.accountCard}>
                <div className={styles.accountAvatar}>🐾</div>
                <div className={styles.accountInfo}>
                  <div className={styles.accountName}>用户 #{userId ?? '—'}</div>
                  <div className={styles.accountSub}>已登录</div>
                </div>
                <button className={styles.dangerBtn} onClick={handleLogout}>
                  退出登录
                </button>
              </div>
            </div>
          )}

          {tab === 'server' && (
            <div>
              <h2 className={styles.sectionTitle}>服务器配置</h2>
              <div className={styles.fieldCard}>
                <div className={styles.fieldLabel}>当前服务器地址</div>
                <div className={styles.fieldValue}>{serverUrl ?? '—'}</div>
              </div>
              <button className={styles.primaryBtn} onClick={handleSwitchServer}>
                切换到其他服务器
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
