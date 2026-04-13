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
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (mode === 'register' && password !== confirm) {
      setError('两次密码不一致')
      return
    }
    setLoading(true)
    try {
      if (mode === 'login') {
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
      } else {
        const res = await fetch(`${serverUrl}/api/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.detail || '注册失败')
        }
        // 注册成功后自动登录
        const loginRes = await fetch(`${serverUrl}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        })
        const loginData = await loginRes.json()
        setAuth(loginData.access_token, loginData.user_id)
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const switchMode = () => {
    setMode(m => m === 'login' ? 'register' : 'login')
    setError('')
    setPassword('')
    setConfirm('')
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
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
          {mode === 'register' && (
            <input
              className={styles.loginInput}
              type="password"
              placeholder="确认密码"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          )}
          {error && <div className={styles.loginError}>{error}</div>}
          <button type="submit" className={styles.loginBtn} disabled={loading}>
            {loading ? (mode === 'login' ? '登录中…' : '注册中…') : (mode === 'login' ? '登录' : '注册')}
          </button>
        </form>
        <div className={styles.loginSwitch}>
          {mode === 'login' ? '没有账号？' : '已有账号？'}
          <button className={styles.loginSwitchBtn} onClick={switchMode}>
            {mode === 'login' ? '去注册' : '去登录'}
          </button>
        </div>
      </div>
    </div>
  )
}
