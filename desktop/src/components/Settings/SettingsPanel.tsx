import { useState, useEffect } from 'react'
import { useAppStore } from '../../store/app'
import styles from './SettingsPanel.module.css'
import {
  LLMConfig,
  fetchLLMConfigs,
  createLLMConfig,
  updateLLMConfig,
} from '../../api/llmConfigs'

type Tab = 'account' | 'general' | 'models' | 'mcp' | 'im-bot' | 'security' | 'feedback' | 'about'

const APP_VERSION = '0.1.0'

const PROVIDERS = [
  { value: 'openai',    label: 'OpenAI',     placeholder: 'https://api.openai.com/v1' },
  { value: 'anthropic', label: 'Anthropic',  placeholder: 'https://api.anthropic.com' },
  { value: 'custom',    label: '自定义',      placeholder: 'http://localhost:11434/v1' },
]

// ── ModelCenter tab ────────────────────────────────────────────────────────────
function ModelCenterTab() {
  const [mode, setMode] = useState<'default' | 'custom'>('default')

  // custom config state
  const [configs, setConfigs]   = useState<LLMConfig[]>([])
  const [existing, setExisting] = useState<LLMConfig | null>(null)
  const [provider, setProvider] = useState('openai')
  const [baseUrl, setBaseUrl]   = useState('')
  const [model, setModel]       = useState('')
  const [apiKey, setApiKey]     = useState('')
  const [showKey, setShowKey]   = useState(false)
  const [maxTokens, setMaxTokens] = useState('8192')
  const [temperature, setTemperature] = useState('0.7')
  const [saving, setSaving]     = useState(false)
  const [err, setErr]           = useState('')
  const [ok, setOk]             = useState('')

  useEffect(() => {
    fetchLLMConfigs().then(cfgs => {
      setConfigs(cfgs)
      // pre-fill with first existing config
      const first = cfgs[0]
      if (first) {
        setExisting(first)
        setProvider(first.provider)
        setBaseUrl(first.base_url ?? '')
        setModel(first.model)
        setMaxTokens(String(first.context_limit))
        setTemperature(String(first.temperature))
      }
    }).catch(() => {})
  }, [])

  const provMeta = PROVIDERS.find(p => p.value === provider) ?? PROVIDERS[0]

  const handleSave = async () => {
    if (!model.trim()) { setErr('模型 ID 不能为空'); return }
    if (!existing && !apiKey.trim()) { setErr('API Key 不能为空'); return }
    setSaving(true); setErr(''); setOk('')
    try {
      if (existing) {
        const patch: Parameters<typeof updateLLMConfig>[1] = {
          model: model.trim(),
          base_url: baseUrl.trim() || undefined,
          context_limit: parseInt(maxTokens) || 8192,
          temperature: parseFloat(temperature) || 0.7,
          is_default: true,
        }
        if (apiKey.trim()) patch.api_key = apiKey.trim()
        await updateLLMConfig(existing.id, patch)
      } else {
        await createLLMConfig({
          provider,
          name: `${provider} 自定义`,
          model: model.trim(),
          api_key: apiKey.trim(),
          base_url: baseUrl.trim() || undefined,
          context_limit: parseInt(maxTokens) || 8192,
          temperature: parseFloat(temperature) || 0.7,
          is_default: true,
        })
      }
      const cfgs = await fetchLLMConfigs()
      setConfigs(cfgs)
      setExisting(cfgs[0] ?? null)
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
                placeholder={existing ? '••••••• (留空不修改)' : 'sk-...'} />
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
            <button className={styles.addFallbackBtn}>
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
