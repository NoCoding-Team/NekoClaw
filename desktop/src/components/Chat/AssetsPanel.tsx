import { useState } from 'react'
import styles from './AssetsPanel.module.css'

interface Props {
  onClose: () => void
}

export function AssetsPanel({ onClose }: Props) {
  const [tab, setTab] = useState<'materials' | 'output'>('materials')
  const [search, setSearch] = useState('')

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M2 2h5v5H2zm7 0h5v5H9zm-7 7h5v5H2zm7 0h5v5H9z" opacity=".8"/>
          </svg>
          资产
        </span>
        <button className={styles.closeBtn} onClick={onClose}>✕</button>
      </div>

      <div className={styles.tabs}>
        <button
          className={tab === 'materials' ? styles.tabActive : styles.tab}
          onClick={() => setTab('materials')}
        >素材</button>
        <button
          className={tab === 'output' ? styles.tabActive : styles.tab}
          onClick={() => setTab('output')}
        >产出</button>
      </div>

      <div className={styles.searchWrap}>
        <svg className={styles.searchIcon} width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398l3.85 3.85a1 1 0 0 0 1.415-1.415l-3.868-3.833zm-5.242 1.156a5 5 0 1 1 0-10 5 5 0 0 1 0 10z"/>
        </svg>
        <input
          className={styles.searchInput}
          placeholder="搜索会话中的文件"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <button className={styles.uploadBtn}>
        <span>+</span> 加载素材
      </button>

      <div className={styles.content}>
        <div className={styles.emptyState}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          <span>暂无素材</span>
        </div>
      </div>
    </div>
  )
}
