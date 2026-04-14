import { useState } from 'react'
import { useAppStore } from '../../store/app'
import styles from './SettingsPanel.module.css'
import { encryptKey } from '../../hooks/useLocalLLM'

type Tab = 'account' | 'general' | 'models' | 'mcp' | 'im-bot' | 'security' | 'feedback' | 'about'

const APP_VERSION = '0.1.0'

const PROVIDERS = [
  { value: 'openai',    label: 'OpenAI',     placeholder: 'https://api.openai.com/v1' },
  { value: 'anthropic', label: 'Anthropic',  placeholder: 'https://api.anthropic.com' },
  { value: 'custom',    label: '自定义',      placeholder: 'http://localhost:11434/v1' },
]

// ── ModelCenter tab ────────────────────────────────────────────────────────────
function ModelCenterTab() {
  const { localLLMConfig, setLocalLLMConfig } = useAppStore()
  const [mode, setMode] = useState<'default' | 'custom'>('custom')

  // custom config state — pre-fill from persisted local config
  const [provider, setProvider] = useState(localLLMConfig?.provider ?? 'openai')
  const [baseUrl, setBaseUrl]   = useState(localLLMConfig?.baseUrl ?? '')
  const [model, setModel]       = useState(localLLMConfig?.model ?? '')
  const [apiKey, setApiKey]     = useState('')
  const [showKey, setShowKey]   = useState(false)
  const [maxTokens, setMaxTokens] = useState(String(localLLMConfig?.maxTokens ?? 8192))
  const [temperature, setTemperature] = useState(String(localLLMConfig?.temperature ?? 0.7))
  interface FallbackItem { id: number; name: string; provider: string; baseUrl: string; model: string; apiKey: string }
  const [fallbacks, setFallbacks] = useState<FallbackItem[]>([])
  const [fbIdSeq, setFbIdSeq]     = useState(0)
  const [saving, setSaving]       = useState(false)

  const addFallback = () => {
    const id = fbIdSeq + 1
    setFbIdSeq(id)
    setFallbacks(prev => [...prev, { id, name: '', provider: 'openai', baseUrl: 'https://api.openai.com/v1', model: '', apiKey: '' }])
  }
  const removeFallback = (id: number) => setFallbacks(prev => prev.filter(f => f.id !== id))
  const updateFallback = (id: number, patch: Partial<FallbackItem>) =>
    setFallbacks(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f))
  const [err, setErr]           = useState('')
  const [ok, setOk]             = useState('')

  const provMeta = PROVIDERS.find(p => p.value === provider) ?? PROVIDERS[0]

  const handleSave = async () => {
    if (!model.trim()) { setErr('模型 ID 不能为空'); return }
    // API key is required if not already configured locally
    if (!localLLMConfig && !apiKey.trim()) { setErr('API Key 不能为空'); return }
    setSaving(true); setErr(''); setOk('')
    try {
      // Encrypt and persist API key locally (Electron safeStorage or base64 fallback)
      const keyToStore = apiKey.trim()
        ? await encryptKey(apiKey.trim())
        : localLLMConfig?.apiKeyB64 ?? ''

      setLocalLLMConfig({
        provider,
        baseUrl: baseUrl.trim() || (PROVIDERS.find(p => p.value === provider)?.placeholder ?? ''),
        model: model.trim(),
        apiKeyB64: keyToStore,
        maxTokens: parseInt(maxTokens) || 8192,
        temperature: parseFloat(temperature) || 0.7,
      })
      setOk('已保存并连接 ✓')
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.modelCenter}>
      {/* Tab switcher */}
      <div className={styles.modeTabs}>
        <button
          className={`${styles.modeTab} ${mode === 'default' ? styles.modeTabActive : ''}`}
          onClick={() => setMode('default')}>
          默认配置
        </button>
        <button
          className={`${styles.modeTab} ${mode === 'custom' ? styles.modeTabActive : ''}`}
          onClick={() => setMode('custom')}>
          自定义配置
        </button>
      </div>

      {/* 默认配置 - 开发中 */}
      {mode === 'default' && (
        <div className={styles.devNotice}>
          <span className={styles.devNoticeIcon}>🚧</span>
          <span>默认配置功能开发中，请先使用<strong className={styles.devNoticeLink} onClick={() => setMode('custom')}>自定义配置</strong></span>
        </div>
      )}

      {/* 自定义配置 */}
      {mode === 'custom' && (
        <div className={styles.customForm}>
          {/* API Base URL */}
          <div className={styles.formRow}>
            <label className={styles.formLabel}>API Base URL</label>
            <div className={styles.urlQuickBtns}>
              {PROVIDERS.map(p => (
                <button key={p.value}
                  className={`${styles.quickBtn} ${provider === p.value ? styles.quickBtnActive : ''}`}
                  onClick={() => { setProvider(p.value); setBaseUrl(p.placeholder) }}>
                  {p.label}
                </button>
              ))}
            </div>
            <input className={styles.formInput} value={baseUrl}
              onChange={e => setBaseUrl(e.target.value)}
              placeholder={provMeta.placeholder} />
          </div>

          {/* 模型 */}
          <div className={styles.formRow}>
            <label className={styles.formLabel}>模型</label>
            <input className={styles.formInput} value={model}
              onChange={e => setModel(e.target.value)}
              placeholder="gpt-4o" />
          </div>

          {/* API Key */}
          <div className={styles.formRow}>
            <label className={styles.formLabel}>API Key</label>
            <div className={styles.apiKeyWrap}>
              <input className={styles.formInput} type={showKey ? 'text' : 'password'}
                value={apiKey} onChange={e => setApiKey(e.target.value)}
                placeholder={localLLMConfig ? '••••••• (留空不修改)' : 'sk-...'} />
              <button className={styles.eyeBtn} onClick={() => setShowKey(v => !v)}>
                {showKey ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {/* 最大 Tokens + Temperature */}
          <div className={styles.formRowDouble}>
            <div className={styles.formCol}>
              <label className={styles.formLabel}>最大 Tokens</label>
              <input className={styles.formInput} value={maxTokens}
                onChange={e => setMaxTokens(e.target.value)} placeholder="8192" />
              <span className={styles.formHint}>单次回复最大 Token 数</span>
            </div>
            <div className={styles.formCol}>
              <label className={styles.formLabel}>Temperature</label>
              <input className={styles.formInput} value={temperature}
                onChange={e => setTemperature(e.target.value)} placeholder="0.7" />
              <span className={styles.formHint}>值越高回复越随机，越低越确定</span>
            </div>
          </div>

          {/* 备用模型 */}
          <div className={styles.fallbackSection}>
            <div className={styles.fallbackHeader}>
              <span className={styles.formLabel}>备用模型</span>
              <span className={styles.formHint}>主模型调用失败时，按顺序尝试备用模型</span>
            </div>

            {/* 备用模型卡片列表 */}
            {fallbacks.map((fb, idx) => (
              <div key={fb.id} className={styles.fallbackCard}>
                {/* 卡片头 */}
                <div className={styles.fallbackCardHead}>
                  <span className={styles.fallbackIdx}>{idx + 1}</span>
                  <input
                    className={styles.fallbackNameInput}
                    value={fb.name}
                    onChange={e => updateFallback(fb.id, { name: e.target.value })}
                    placeholder="输入模型名称"
                  />
                  <span className={styles.fallbackProviderBadge}>
                    {fb.provider === 'openai' ? 'OpenAI' : fb.provider === 'anthropic' ? 'Anthropic' : '自定义'}
                  </span>
                  <button className={styles.fallbackCardRemove} onClick={() => removeFallback(fb.id)}>×</button>
                </div>

                {/* API URL 切换 */}
                <div className={styles.fallbackApiRow}>
                  <span className={styles.fallbackFieldLabel}>API URL</span>
                  <div className={styles.fallbackProvTabs}>
                    {[{ v: 'openai', l: 'OpenAI', url: 'https://api.openai.com/v1' },
                      { v: 'anthropic', l: 'Anthropic', url: 'https://api.anthropic.com' },
                      { v: 'custom', l: '自定义', url: 'http://localhost:11434/v1' }].map(p => (
                      <button key={p.v}
                        className={`${styles.fallbackProvTab} ${fb.provider === p.v ? styles.fallbackProvTabActive : ''}`}
                        onClick={() => updateFallback(fb.id, { provider: p.v, baseUrl: p.url })}>
                        {p.l}
                      </button>
                    ))}
                  </div>
                </div>
                <input className={styles.fallbackInput} value={fb.baseUrl}
                  onChange={e => updateFallback(fb.id, { baseUrl: e.target.value })}
                  placeholder="https://api.openai.com/v1" />

                {/* 模型 */}
                <span className={styles.fallbackFieldLabel}>模型</span>
                <input className={styles.fallbackInput} value={fb.model}
                  onChange={e => updateFallback(fb.id, { model: e.target.value })}
                  placeholder="gpt-4o" />

                {/* API Key */}
                <span className={styles.fallbackFieldLabel}>API Key</span>
                <input className={styles.fallbackInput} type="password" value={fb.apiKey}
                  onChange={e => updateFallback(fb.id, { apiKey: e.target.value })}
                  placeholder="sk-..." />
              </div>
            ))}

            <button className={styles.addFallbackBtn} onClick={addFallback}>
              ＋ 添加备用模型
            </button>
          </div>

          {err && <div className={styles.errMsg}>{err}</div>}
          {ok  && <div className={styles.okMsg}>{ok}</div>}

          <div className={styles.saveRow}>
            <button className={styles.saveConnectBtn} onClick={handleSave} disabled={saving}>
              {saving ? '保存中…' : '保存并连接'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function SettingsPanel() {
  const [tab, setTab] = useState<Tab>('account')
  const { userId, username, serverUrl, clearAuth, setServerConnected, settingsOpen, setSettingsOpen } = useAppStore()

  if (!settingsOpen) return null

  const close = () => setSettingsOpen(false)

  const handleLogout = () => {
    clearAuth()
    close()
  }

  const handleSwitchServer = () => {
    setServerConnected(false)
    close()
  }

  const nav = (id: Tab) => `${styles.navItem} ${tab === id ? styles.active : ''}`

  return (
    <div className={styles.overlay} onClick={close}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        {/* Title row */}
        <div className={styles.titleRow}>
          <span className={styles.titleText}>设置</span>
          <button className={styles.closeBtn} onClick={close}>✕</button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {/* Left nav */}
          <nav className={styles.nav}>
            <button className={nav('account')} onClick={() => setTab('account')}>
              <span className={styles.navIcon}>👤</span><span>我的账户</span>
            </button>
            <button className={nav('general')} onClick={() => setTab('general')}>
              <span className={styles.navIcon}>⚙️</span><span>通用</span>
            </button>
            <button className={nav('models')} onClick={() => setTab('models')}>
              <span className={styles.navIcon}>🤖</span><span>模型中心</span>
            </button>
            <button className={nav('mcp')} onClick={() => setTab('mcp')}>
              <span className={styles.navIcon}>🔌</span><span>MCP</span>
            </button>
            <button className={nav('im-bot')} onClick={() => setTab('im-bot')}>
              <span className={styles.navIcon}>💬</span><span>IM 机器人</span>
            </button>
            <button className={nav('security')} onClick={() => setTab('security')}>
              <span className={styles.navIcon}>🛡️</span><span>安全</span>
              <span className={styles.betaBadge}>BETA</span>
            </button>
            <div className={styles.navDivider} />
            <button className={nav('feedback')} onClick={() => setTab('feedback')}>
              <span className={styles.navIcon}>❓</span><span>帮助与反馈</span>
            </button>
            <button className={nav('about')} onClick={() => setTab('about')}>
              <span className={styles.navIcon}>🖥️</span><span>版本 {APP_VERSION}</span>
              <span className={styles.betaBadge}>BETA</span>
            </button>
          </nav>

          {/* Right content */}
          <div className={styles.content}>
            {tab === 'account' && (
              <div>
                <div className={styles.userHeader}>
                  <div className={styles.userHeaderLeft}>
                    <div className={styles.accountAvatar}>🐾</div>
                    <span className={styles.userDisplayName}>
                      {username ?? `用户 #${userId ?? '—'}`}
                    </span>
                  </div>
                  <button className={styles.dangerBtn} onClick={handleLogout}>
                    ↪ 退出登录
                  </button>
                </div>
                <div className={styles.infoTable}>
                  <div className={styles.infoRow}>
                    <span className={styles.infoKey}>用户 ID</span>
                    <span className={styles.infoVal}>{userId ?? '—'}</span>
                  </div>
                  <div className={styles.infoRow}>
                    <span className={styles.infoKey}>服务器</span>
                    <span className={styles.infoVal}>{serverUrl ?? '—'}</span>
                  </div>
                  <div className={styles.infoRow}>
                    <span className={styles.infoKey}>积分</span>
                    <span className={`${styles.infoVal} ${styles.highlight}`}>—</span>
                  </div>
                  <div className={styles.infoRow}>
                    <span className={styles.infoKey}>创作点</span>
                    <span className={`${styles.infoVal} ${styles.highlight}`}>—</span>
                  </div>
                </div>
              </div>
            )}

            {tab === 'general' && (
              <div>
                <h2 className={styles.sectionTitle}>通用</h2>
                <p className={styles.comingSoon}>功能开发中…</p>
              </div>
            )}

            {tab === 'models' && <ModelCenterTab />}

            {tab === 'mcp' && (
              <div>
                <h2 className={styles.sectionTitle}>MCP</h2>
                <div className={styles.fieldCard}>
                  <div className={styles.fieldLabel}>当前服务器地址</div>
                  <div className={styles.fieldValue}>{serverUrl ?? '—'}</div>
                </div>
                <button className={styles.primaryBtn} onClick={handleSwitchServer}>
                  切换到其他服务器
                </button>
              </div>
            )}

            {tab === 'im-bot' && (
              <div>
                <h2 className={styles.sectionTitle}>IM 机器人</h2>
                <p className={styles.comingSoon}>功能开发中…</p>
              </div>
            )}

            {tab === 'security' && (
              <div>
                <h2 className={styles.sectionTitle}>安全</h2>
                <p className={styles.comingSoon}>功能开发中…</p>
              </div>
            )}

            {tab === 'feedback' && (
              <div>
                <h2 className={styles.sectionTitle}>帮助与反馈</h2>
                <p className={styles.comingSoon}>如有问题请联系开发者。</p>
              </div>
            )}

            {tab === 'about' && (
              <div>
                <h2 className={styles.sectionTitle}>关于 NekoClaw</h2>
                <div className={styles.fieldCard}>
                  <div className={styles.fieldLabel}>当前版本</div>
                  <div className={styles.fieldValue}>v{APP_VERSION} BETA</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
