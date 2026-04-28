import { useEffect, useState } from 'react'
import { getStats, type AdminStats } from '../api/users'
import styles from './DashboardPage.module.css'

function StatCard({ label, value, icon }: { label: string; value: number | undefined; icon: string }) {
  return (
    <div className={styles.card}>
      <div className={styles.cardIcon}>{icon}</div>
      <div className={styles.cardValue}>{value ?? '—'}</div>
      <div className={styles.cardLabel}>{label}</div>
    </div>
  )
}

export default function DashboardPage() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getStats()
      .then(setStats)
      .catch(e => setError(e.message))
  }, [])

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>系统概览</h1>
      {error && <div className={styles.error}>{error}</div>}
      <div className={styles.grid}>
        <StatCard label="总用户数" value={stats?.total_users} icon="◉" />
        <StatCard label="今日活跃用户" value={stats?.active_users_today} icon="◈" />
        <StatCard label="今日消息次数" value={stats?.total_messages_today} icon="💬" />
        <StatCard label="今日创作点消耗" value={stats?.total_creation_today} icon="✦" />
      </div>
    </div>
  )
}
