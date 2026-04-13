import { useState } from 'react'
import { Sidebar } from './components/Sidebar/Sidebar'
import { ChatArea } from './components/Chat/ChatArea'
import { useAppStore } from './store/app'
import styles from './App.module.css'

export default function App() {
  const { token, serverConnected } = useAppStore()

  if (!serverConnected) return <ConnectForm />
  if (!token) return <LoginForm />

  return (
    <div className={styles.layout}>
      <Sidebar />
      <ChatArea />
    </div>
  )
}

// ─── 连接服务器 ────────────────────────────────────────────────────────────────

function ConnectForm() {
  const { serverUrl, setServerUrl, setServerConnected, recentServers, addRecentServer } = useAppStore()
  const [url, setUrl] = useState(serverUrl)
  const [status, setStatus] = useState<'idle' | 'checking' | 'error'>('idle')
  const [errMsg, setErrMsg] = useState('')

  const tryConnect = async (targetUrl: string) => {
    const trimmed = targetUrl.trim().replace(/\/+$/, '')
    if (!trimmed) return
    setUrl(trimmed)
    setStatus('checking')
    setErrMsg('')
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 6000)
      await fetch(`${trimmed}/`, { signal: ctrl.signal })
      clearTimeout(timer)
      setServerUrl(trimmed)
      addRecentServer(trimmed)
      setServerConnected(true)
    } catch {
      setStatus('error')
      setErrMsg('无法连接到服务器，请检查地址是否正确')
    }
  }

  return (
    <div className={styles.login}>
      <div className={styles.loginCard}>
        <div className={styles.loginLogo}>🐾 NekoClaw</div>
        <p className={styles.connectSubtitle}>连接到后端服务器后，即可登录使用</p>
        <form onSubmit={(e) => { e.preventDefault(); tryConnect(url) }} className={styles.loginForm}>
          <input
            className={styles.loginInput}
            placeholder="http://localhost:8000"
            value={url}
            onChange={(e) => { setUrl(e.target.value); setStatus('idle'); setErrMsg('') }}
            autoComplete="url"
            spellCheck={false}
          />
          {errMsg && <div className={styles.loginError}>{errMsg}</div>}
          <button type="submit" className={styles.loginBtn} disabled={status === 'checking'}>
            {status === 'checking' ? '连接中…' : '连接'}
          </button>
        </form>
        {recentServers.length > 0 && (
          <div className={styles.recentServers}>
            <div className={styles.recentLabel}>最近连接</div>
            <div className={styles.recentList}>
              {recentServers.map((s) => (
                <button key={s} className={styles.recentItem} onClick={() => tryConnect(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── 登录 / 注册 ───────────────────────────────────────────────────────────────

function LoginForm() {
  const { setAuth, serverUrl, setServerConnected } = useAppStore()
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
    setMode((m) => (m === 'login' ? 'register' : 'login'))
    setError('')
    setPassword('')
    setConfirm('')
  }

  return (
    <div className={styles.login}>
      <div className={styles.loginCard}>
        <div className={styles.loginLogo}>🐾 NekoClaw</div>
        <div className={styles.serverBadge}>
          <span className={styles.serverBadgeUrl}>{serverUrl}</span>
          <button className={styles.serverSwitchBtn} onClick={() => setServerConnected(false)}>
            切换
          </button>
        </div>
        <form onSubmit={handleSubmit} className={styles.loginForm}>
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
            {loading
              ? mode === 'login' ? '登录中…' : '注册中…'
              : mode === 'login' ? '登录' : '注册'}
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
