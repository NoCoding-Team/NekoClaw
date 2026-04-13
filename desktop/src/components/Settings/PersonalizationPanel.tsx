import styles from './PersonalizationPanel.module.css'

export function PersonalizationPanel() {
  return (
    <div className={styles.panel}>
      {/* Title bar */}
      <div className={styles.topBar}>
        <span className={styles.topTitle}>个性化设置</span>
        <div className={styles.windowControls}>
          <button onClick={() => window.nekoBridge?.window.minimize()}>─</button>
          <button onClick={() => window.nekoBridge?.window.maximize()}>□</button>
          <button className={styles.closeBtn} onClick={() => window.nekoBridge?.window.close()}>✕</button>
        </div>
      </div>

      <div className={styles.body}>
        <h2 className={styles.sectionTitle}>个性化设置</h2>
        <p className={styles.placeholder}>🎨 主题、语言、AI 偏好等设置即将推出</p>
      </div>
    </div>
  )
}
