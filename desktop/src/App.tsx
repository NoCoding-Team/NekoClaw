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
import AbilitiesPanel from './components/Abilities/AbilitiesPanel'
import { apiFetch } from './api/apiFetch'

export default function App() {
  const { token, serverConnected, serverUrl, setSessions, setActiveSession, setProfile } = useAppStore()

  // 旧版本地记忆迁移弹窗状态
  const [migrateEntries, setMigrateEntries] = useState<Array<{ id: string; category: string; content: string; created_at: string }> | null>(null)
  const [migrating, setMigrating] = useState(false)

  // 登录状态恢复时拉取用户信息
  useEffect(() => {
    if (!token) return
    apiFetch(`${serverUrl}/api/auth/me`)
      .then(r => r.ok ? r.json() : null)
      .then(me => { if (me) setProfile(me.id, me.username, me.nickname ?? null, me.avatar_data ?? null) })
      .catch(() => {})
  }, [token]) // eslint-disable-line

  // 检测旧版 neko_local_memories.json，有则弹出迁移提示
  useEffect(() => {
    if (!token) return
    ;(async () => {
      try {
        const db = window.nekoBridge?.db
        if (!db) return
        const result = await db.readLegacyLocalMemories()
        if (result.entries.length > 0) {
          setMigrateEntries(result.entries)
        }
      } catch {}
    })()
  }, [token]) // eslint-disable-line

  async function handleMigrateConfirm() {
    if (!migrateEntries || !token) return
    setMigrating(true)
    try {
      await Promise.allSettled(
        migrateEntries.map((e) =>
          apiFetch(`${serverUrl}/api/memory`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: e.content, category: e.category ?? 'other' }),
          }),
        ),
      )
    } catch {}
    await window.nekoBridge?.db?.deleteLegacyLocalMemories()
    setMigrateEntries(null)
    setMigrating(false)
  }

  async function handleMigrateDecline() {
    await window.nekoBridge?.db?.deleteLegacyLocalMemories()
    setMigrateEntries(null)
  }

  // 登录后自动从服务器拉取 sessions，并合并本地 SQLite 中的 local-* 会话
  useEffect(() => {
    if (!token) return
    ;(async () => {
      // 1. 先从本地 SQLite 读取 local-* 会话（Mode B 未同步的会话）
      const dbBridge = window.nekoBridge?.db
      const localOnlySessions: Array<{ id: string; title: string }> = []
      if (dbBridge) {
        try {
          const result = await dbBridge.getSessions()
          ;(result.sessions ?? [])
            .filter((s) => s.id.startsWith('local-'))
            .forEach((s) => localOnlySessions.push({ id: s.id, title: s.title }))
        } catch {}
      }

      // 2. 从服务器拉取会话
      try {
        const res = await apiFetch(`${serverUrl}/api/sessions`)
        if (!res.ok) {
          // 服务器异常时仅展示本地会话
          if (localOnlySessions.length > 0) {
            setSessions(localOnlySessions)
            const lastId = localStorage.getItem('neko_active_session')
            const restored = lastId && localOnlySessions.find((s) => s.id === lastId)
            setActiveSession(restored ? lastId! : localOnlySessions[0].id)
          }
          return
        }
        const data: Array<{ id: string; title: string; skill_id: string | null }> = await res.json()
        const serverSessions = data.map((s) => ({ id: s.id, title: s.title, skillId: s.skill_id ?? undefined }))
        // local-* 会话排在前面（最近使用），server 会话紧随其后
        const allSessions = [...localOnlySessions, ...serverSessions]
        if (allSessions.length > 0) {
          setSessions(allSessions)
          // 优先恢复上次打开的对话，否则用最新一条
          const lastId = localStorage.getItem('neko_active_session')
          const restored = lastId && allSessions.find((s) => s.id === lastId)
          setActiveSession(restored ? lastId! : allSessions[0].id)
        } else {
          const newRes = await apiFetch(`${serverUrl}/api/sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: '新对话' }),
          })
          if (newRes.ok) {
            const s: { id: string; title: string; skill_id: string | null } = await newRes.json()
            setSessions([{ id: s.id, title: s.title, skillId: s.skill_id ?? undefined }])
            setActiveSession(s.id)
          }
        }
      } catch {
        // 网络异常时展示本地会话
        if (localOnlySessions.length > 0) {
          setSessions(localOnlySessions)
          const lastId = localStorage.getItem('neko_active_session')
          const restored = lastId && localOnlySessions.find((s) => s.id === lastId)
          setActiveSession(restored ? lastId! : localOnlySessions[0].id)
        }
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
      {migrateEntries && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: '#1e1e2a', border: '1px solid #333', borderRadius: 12, padding: '24px 28px', width: 360, color: '#e0e0e0' }}>
            <p style={{ margin: '0 0 8px', fontWeight: 600 }}>发现旧版本地记忆</p>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: '#aaa' }}>
              检测到 {migrateEntries.length} 条旧版本地记忆（neko_local_memories.json）。是否将它们导入到服务器记忆库？
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={handleMigrateDecline}
                disabled={migrating}
                style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #555', background: 'transparent', color: '#ccc', cursor: 'pointer' }}
              >
                跳过
              </button>
              <button
                onClick={handleMigrateConfirm}
                disabled={migrating}
                style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: '#7b5ea7', color: '#fff', cursor: 'pointer' }}
              >
                {migrating ? '导入中…' : '导入'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── 主内容区路由 ──────────────────────────────────────────────────────────────

function MainContent() {
  const { sidebarTab } = useAppStore()
  if (sidebarTab === 'tasks')           return <PanelView title="定时任务"><ScheduledTasksPanel /></PanelView>
  if (sidebarTab === 'skills')          return <PanelView title="技能库"><WipPlaceholder name="技能库" icon="🛠️" /></PanelView>
  if (sidebarTab === 'memory')          return <PanelView title="记忆库"><MemoryPanel /></PanelView>
  if (sidebarTab === 'personalization') return <PersonalizationPanel />
  if (sidebarTab === 'abilities')       return <PanelView title="能力"><AbilitiesPanel /></PanelView>
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

function WipPlaceholder({ name, icon }: { name: string; icon: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16, color: 'var(--text-muted)' }}>
      <span style={{ fontSize: 48, filter: 'grayscale(0.4)' }}>{icon}</span>
      <span style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>{name}</span>
      <span style={{ fontSize: 13 }}>🚧 待开发</span>
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
      // Use 'no-cors' so Chromium skips CORS enforcement for this health check.
      // The response will be opaque (status 0) but a successful fetch means the
      // server is reachable. Any network error still throws and is caught below.
      await fetch(`${trimmed}/`, { signal: ctrl.signal, mode: 'no-cors' })
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
  const { setAuth, setProfile, serverUrl, setServerConnected } = useAppStore()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [nickname, setNickname] = useState('')
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const avatarInputRef = React.useRef<HTMLInputElement>(null)

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setAvatarPreview(reader.result as string)
    reader.readAsDataURL(file)
  }

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
        setAuth(data.access_token, '', username, data.refresh_token)
        // 获取完整用户信息
        const meRes = await fetch(`${serverUrl}/api/auth/me`, {
          headers: { Authorization: `Bearer ${data.access_token}` },
        })
        if (meRes.ok) {
          const me = await meRes.json()
          setProfile(me.id, me.username, me.nickname ?? null, me.avatar_data ?? null)
        }
      } else {
        const res = await fetch(`${serverUrl}/api/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password, nickname: nickname.trim() || null }),
        })
        if (!res.ok) throw new Error((await res.json()).detail || '注册失败')
        const loginRes = await fetch(`${serverUrl}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        })
        const loginData = await loginRes.json()
        setAuth(loginData.access_token, '', username, loginData.refresh_token)
        // 上传头像（如有）并获取完整用户信息
        let token = loginData.access_token
        if (avatarPreview) {
          await fetch(`${serverUrl}/api/auth/me`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ avatar_data: avatarPreview }),
          })
        }
        const meRes = await fetch(`${serverUrl}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (meRes.ok) {
          const me = await meRes.json()
          setProfile(me.id, me.username, me.nickname ?? null, me.avatar_data ?? null)
        }
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const switchMode = () => {
    setMode((m) => (m === 'login' ? 'register' : 'login'))
    setError(''); setPassword(''); setConfirm(''); setNickname(''); setAvatarPreview(null)
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
        {mode === 'register' && (
          <div className={styles.loginAvatarPicker} onClick={() => avatarInputRef.current?.click()}>
            {avatarPreview
              ? <img src={avatarPreview} className={styles.loginAvatarImg} alt="头像预览" />
              : <span className={styles.loginAvatarPlaceholder}>🐾</span>
            }
            <span className={styles.loginAvatarHint}>点击上传头像</span>
            <input ref={avatarInputRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={handleAvatarChange} />
          </div>
        )}
        <form onSubmit={handleSubmit} className={styles.loginForm}>
          <input className={styles.loginInput} placeholder="用户名" value={username}
            onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
          {mode === 'register' && (
            <input className={styles.loginInput} placeholder="昵称（可选）" value={nickname}
              onChange={(e) => setNickname(e.target.value)} autoComplete="nickname" />
          )}
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
