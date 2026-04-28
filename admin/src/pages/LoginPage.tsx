import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login, getMe } from '../api/auth'
import { setToken, setServerUrl, getServerUrl } from '../api/base'
import styles from './LoginPage.module.css'

export default function LoginPage() {
  const navigate = useNavigate()
  const [serverUrl, setServerUrlState] = useState(getServerUrl() || 'http://localhost:8000')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      setServerUrl(serverUrl.trim())
      const result = await login(username.trim(), password)
      setToken(result.access_token)
      const me = await getMe()
      if (!me.is_admin) {
        setToken('')
        setError('该账号不是管理员，无权访问管理控制台')
        return
      }
      navigate('/dashboard', { replace: true })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '登录失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.page}>
      <form className={styles.card} onSubmit={handleSubmit}>
        <div className={styles.title}>
          <span>🐾</span>
          <span>NekoClaw 管理控制台</span>
        </div>
        <label className={styles.label}>
          服务器地址
          <input
            className={styles.input}
            type="text"
            value={serverUrl}
            onChange={e => setServerUrlState(e.target.value)}
            placeholder="http://localhost:8000"
            required
          />
        </label>
        <label className={styles.label}>
          用户名
          <input
            className={styles.input}
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="admin"
            required
          />
        </label>
        <label className={styles.label}>
          密码
          <input
            className={styles.input}
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <div className={styles.error}>{error}</div>}
        <button className={styles.btn} type="submit" disabled={loading}>
          {loading ? '登录中…' : '登录'}
        </button>
      </form>
    </div>
  )
}
