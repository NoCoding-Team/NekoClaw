import React, { useState, useEffect } from 'react'
import { Sidebar } from './components/Sidebar/Sidebar'
import { ChatArea } from './components/Chat/ChatArea'
import { useAppStore } from './store/app'
import styles from './App.module.css'
import ScheduledTasksPanel from './components/ScheduledTasks/ScheduledTasksPanel'
import SkillsPanel from './components/Skills/SkillsPanel'
import MemoryPanel from './components/Memory/MemoryPanel'
import { SettingsPanel } from './components/Settings/SettingsPanel'
import { PersonalizationPanel } from './components/Settings/PersonalizationPanel'

export default function App() {
  const { token, serverConnected, serverUrl, setSessions, setActiveSession } = useAppStore()

  // 登录后自动从服务器拉取 sessions，并选中最新的一条
  useEffect(() => {
    if (!token) return
    ;(async () => {
      try {
        const res = await fetch(`${serverUrl}/api/sessions`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return
        const data: Array<{ id: string; title: string; skill_id: string | null }> = await res.json()
        if (data.length > 0) {
          setSessions(data.map((s) => ({ id: s.id, title: s.title, skillId: s.skill_id ?? undefined })))
          setActiveSession(data[0].id)
        } else {
          const newRes = await fetch(`${serverUrl}/api/sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ title: '新对话' }),
          })
          if (newRes.ok) {
            const s: { id: string; title: string; skill_id: string | null } = await newRes.json()
            setSessions([{ id: s.id, title: s.title, skillId: s.skill_id ?? undefined }])
            setActiveSession(s.id)
          }
        }
      } catch {
        // 网络异常时静默忽略，用户可手动创建
      }
    })()
  }, [token])

  if (!serverConnected) return <ConnectForm />
  if (!token) return <LoginForm />
  return (
    <div className={styles.layout}>
      <Sidebar />
      <MainContent />
      <SettingsPanel />
    </div>
  )
}

// ─── 主内容区路由 ──────────────────────────────────────────────────────────────

function MainContent() {
  const { sidebarTab } = useAppStore()
  if (sidebarTab === 'tasks')           return <PanelView title="定时任务"><ScheduledTasksPanel /></PanelView>
  if (sidebarTab === 'skills')          return <PanelView title="技能库"><SkillsPanel /></PanelView>
  if (sidebarTab === 'memory')          return <PanelView title="记忆库"><MemoryPanel /></PanelView>
  if (sidebarTab === 'personalization') return <PersonalizationPanel />
  return <ChatArea />
}

function PanelView({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={styles.panelView}>
      <div className={styles.panelTopBar}>
        <span className={styles.panelTitle}>{title}</span>
        <div className={styles.panelControls}>
          <button onClick={() => window.nekoBridge?.window.minimize()}>─</button>
          <button onClick={() => window.nekoBridge?.window.maximize()}>□</button>
          <button className={styles.panelCloseBtn} onClick={() => window.nekoBridge?.window.close()}>✕</button>
        </div>
      </div>
      <div className={styles.panelBody}>{children}</div>
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

  const TitleBar = () => (
    <div className={styles.loginTitleBar}>
      <div className={styles.loginWindowControls}>
        <button onClick={() => window.nekoBridge?.window.minimize()}>─</button>
        <button onClick={() => window.nekoBridge?.window.maximize()}>□</button>
        <button className={styles.loginCloseBtn} onClick={() => window.nekoBridge?.window.close()}>✕</button>
      </div>
    </div>
  )

  if (status === 'checking') {
    return (
      <div className={styles.login}>
        <TitleBar />
        <div className={styles.connectingFull}>
          <div className={styles.connectingLogo}>🐾</div>
          <div className={styles.connectingAppName}>NekoClaw</div>
          <div className={styles.connectingMsg}>
            <span className={styles.spinner} />
            正在连接服务器…
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.login}>
      <TitleBar />
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
          <button type="submit" className={styles.loginBtn}>连接</button>
        </form>
        {recentServers.length > 0 && (
          <div className={styles.recentServers}>
            <div className={styles.recentLabel}>最近连接</div>
            <div className={styles.recentList}>
              {recentServers.map((s) => (
                <button key={s} className={styles.recentItem} onClick={() => tryConnect(s)}>{s}</button>
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
    if (mode === 'register' && password !== confirm) { setError('两次密码不一致'); return }
    setLoading(true)
    try {
      if (mode === 'login') {
        const res = await fetch(`${serverUrl}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        })
        if (!res.ok) throw new Error((await res.json()).detail || '登录失败')
        const data = await res.json()
        setAuth(data.access_token, data.user_id, username)
      } else {
        const res = await fetch(`${serverUrl}/api/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        })
        if (!res.ok) throw new Error((await res.json()).detail || '注册失败')
        const loginRes = await fetch(`${serverUrl}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        })
        const loginData = await loginRes.json()
        setAuth(loginData.access_token, loginData.user_id, username)
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const switchMode = () => {
    setMode((m) => (m === 'login' ? 'register' : 'login'))
    setError(''); setPassword(''); setConfirm('')
  }

  return (
    <div className={styles.login}>
      <div className={styles.loginTitleBar}>
        <div className={styles.loginWindowControls}>
          <button onClick={() => window.nekoBridge?.window.minimize()}>─</button>
          <button onClick={() => window.nekoBridge?.window.maximize()}>□</button>
          <button className={styles.loginCloseBtn} onClick={() => window.nekoBridge?.window.close()}>✕</button>
        </div>
      </div>
      <div className={styles.loginCard}>
        <div className={styles.loginLogo}>🐾 NekoClaw</div>
        <div className={styles.serverBadge}>
          <span className={styles.serverBadgeUrl}>{serverUrl}</span>
          <button className={styles.serverSwitchBtn} onClick={() => setServerConnected(false)}>切换</button>
        </div>
        <form onSubmit={handleSubmit} className={styles.loginForm}>
          <input className={styles.loginInput} placeholder="用户名" value={username}
            onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
          <input className={styles.loginInput} type="password" placeholder="密码" value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          {mode === 'register' && (
            <input className={styles.loginInput} type="password" placeholder="确认密码" value={confirm}
              onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
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
