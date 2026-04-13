import { useState } from 'react'
import { Sidebar } from './components/Sidebar/Sidebar'
import { ChatArea } from './components/Chat/ChatArea'
import { useAppStore } from './store/app'
import styles from './App.module.css'

export default function App() {
  const { token } = useAppStore()

  if (!token) {
    return <LoginForm />
  }

  return (
    <div className={styles.layout}>
      <Sidebar />
      <ChatArea />
    </div>
  )
}

function LoginForm() {
  const { setAuth, serverUrl, setServerUrl } = useAppStore()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${serverUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || '登录失败')
      }
      const data = await res.json()
      setAuth(data.access_token, data.user_id)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.login}>
      <div className={styles.loginCard}>
        <div className={styles.loginLogo}>🐾 NekoClaw</div>
        <form onSubmit={handleSubmit} className={styles.loginForm}>
          <input
            className={styles.loginInput}
            placeholder="服务器地址"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
          />
          <input
            className={styles.loginInput}
            placeholder="用户名"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />
          <input
            className={styles.loginInput}
            type="password"
            placeholder="密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
          {error && <div className={styles.loginError}>{error}</div>}
          <button type="submit" className={styles.loginBtn} disabled={loading}>
            {loading ? '登录中…' : '登录'}
          </button>
        </form>
      </div>
    </div>
  )
}
