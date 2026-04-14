import { useState, useEffect } from 'react'
import { useAppStore } from '../../store/app'
import styles from './SettingsPanel.module.css'
import {
  LLMConfig,
  fetchLLMConfigs,
  createLLMConfig,
  updateLLMConfig,
  deleteLLMConfig,
} from '../../api/llmConfigs'

type Tab = 'account' | 'general' | 'models' | 'mcp' | 'im-bot' | 'security' | 'feedback' | 'about'

const APP_VERSION = '0.1.0'

const PROVIDERS = [
  { value: 'openai',    label: 'OpenAI',     placeholder: 'https://api.openai.com/v1' },
  { value: 'anthropic', label: 'Anthropic',  placeholder: 'https://api.anthropic.com' },
  { value: 'gemini',    label: 'Google Gemini', placeholder: '' },
  { value: 'custom',    label: '自定义 (Compatible)', placeholder: 'http://localhost:11434/v1' },
]

const DEFAULT_MODELS: Record<string, string[]> = {
  openai:    ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  anthropic: ['claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-3-5'],
  gemini:    ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
  custom:    [],
}

// ── Add/Edit dialog ────────────────────────────────────────────────────────────
interface ModelFormProps {
  initial?: LLMConfig
  onSave: (data: {
    provider: string; name: string; model: string; api_key: string;
    base_url?: string; is_default: boolean; context_limit: number
  }) => Promise<void>
  onCancel: () => void
}

function ModelForm({ initial, onSave, onCancel }: ModelFormProps) {
  const [provider, setProvider] = useState(initial?.provider ?? 'openai')
  const [name, setName]         = useState(initial?.name ?? '')
  const [model, setModel]       = useState(initial?.model ?? '')
  const [apiKey, setApiKey]     = useState('')
  const [baseUrl, setBaseUrl]   = useState(initial?.base_url ?? '')
  const [isDefault, setIsDefault] = useState(initial?.is_default ?? false)
  const [ctxLimit, setCtxLimit] = useState(String(initial?.context_limit ?? 128000))
  const [saving, setSaving]     = useState(false)
  const [err, setErr]           = useState('')

  const provMeta = PROVIDERS.find(p => p.value === provider)!
  const modelList = DEFAULT_MODELS[provider] ?? []

  const handleSave = async () => {
    if (!name.trim() || !model.trim()) { setErr('名称和模型不能为空'); return }
    if (!initial && !apiKey.trim())    { setErr('API Key 不能为空'); return }
    setSaving(true); setErr('')
    try {
      await onSave({
        provider, name: name.trim(), model: model.trim(),
        api_key: apiKey.trim(),
        base_url: baseUrl.trim() || undefined,
        is_default: isDefault,
        context_limit: parseInt(ctxLimit) || 128000,
      })
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : '保存失败')
      setSaving(false)
    }
  }

  return (
    <div className={styles.formOverlay} onClick={onCancel}>
      <div className={styles.formDialog} onClick={e => e.stopPropagation()}>
        <div className={styles.formTitle}>{initial ? '编辑模型' : '添加模型'}</div>

        <label className={styles.fieldLabel}>供应商</label>
        <div className={styles.providerGrid}>
          {PROVIDERS.map(p => (
            <button key={p.value}
              className={`${styles.providerBtn} ${provider === p.value ? styles.providerBtnActive : ''}`}
              onClick={() => { setProvider(p.value); setBaseUrl('') }}>
              {p.label}
            </button>
          ))}
        </div>

        <label className={styles.fieldLabel}>配置名称</label>
        <input className={styles.input} value={name}
          onChange={e => setName(e.target.value)} placeholder="例：GPT-4o 主力" />

        <label className={styles.fieldLabel}>模型 ID</label>
        {modelList.length > 0 ? (
          <div className={styles.modelChips}>
            {modelList.map(m => (
              <button key={m}
                className={`${styles.chip} ${model === m ? styles.chipActive : ''}`}
                onClick={() => setModel(m)}>{m}</button>
            ))}
            <input className={`${styles.input} ${styles.modelInput}`}
              value={model} onChange={e => setModel(e.target.value)}
              placeholder="或手动输入 Model ID" />
          </div>
        ) : (
          <input className={styles.input} value={model}
            onChange={e => setModel(e.target.value)} placeholder="例：llama3.2" />
        )}

        <label className={styles.fieldLabel}>
          API Key {initial && <span className={styles.optionalHint}>（留空则不修改）</span>}
        </label>
        <input className={styles.input} type="password" value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          placeholder={initial ? '••••••• (不修改)' : '输入 API Key'} />

        <label className={styles.fieldLabel}>
          Base URL <span className={styles.optionalHint}>（可选）</span>
        </label>
        <input className={styles.input} value={baseUrl}
          onChange={e => setBaseUrl(e.target.value)}
          placeholder={provMeta.placeholder || '留空使用默认'} />

        <label className={styles.fieldLabel}>上下文长度</label>
        <input className={styles.input} value={ctxLimit}
          onChange={e => setCtxLimit(e.target.value)} placeholder="128000" />

        <label className={styles.checkboxRow}>
          <input type="checkbox" checked={isDefault} onChange={e => setIsDefault(e.target.checked)} />
          设为默认模型
        </label>

        {err && <div className={styles.errMsg}>{err}</div>}

        <div className={styles.formActions}>
          <button className={styles.cancelBtn} onClick={onCancel}>取消</button>
          <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── ModelCenter tab ────────────────────────────────────────────────────────────
function ModelCenterTab() {
  const [configs, setConfigs]   = useState<LLMConfig[]>([])
  const [loading, setLoading]   = useState(true)
  const [editTarget, setEdit]   = useState<LLMConfig | 'new' | null>(null)
  const [err, setErr]           = useState('')

  const load = async () => {
    try { setConfigs(await fetchLLMConfigs()) } catch (e: unknown) { setErr(String(e)) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const handleSave = async (data: Parameters<ModelFormProps['onSave']>[0]) => {
    if (editTarget === 'new') {
      await createLLMConfig(data)
    } else if (editTarget) {
      const patch: Parameters<typeof updateLLMConfig>[1] = {
        name: data.name, model: data.model, base_url: data.base_url, is_default: data.is_default,
      }
      if (data.api_key) patch.api_key = data.api_key
      await updateLLMConfig(editTarget.id, patch)
    }
    setEdit(null)
    await load()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确认删除此模型配置？')) return
    await deleteLLMConfig(id)
    await load()
  }

  const handleSetDefault = async (cfg: LLMConfig) => {
    await updateLLMConfig(cfg.id, { is_default: true })
    await load()
  }

  return (
    <div>
      <div className={styles.modelHeader}>
        <h2 className={styles.sectionTitle}>模型中心</h2>
        <button className={styles.addBtn} onClick={() => setEdit('new')}>＋ 添加模型</button>
      </div>

      {err && <div className={styles.errMsg}>{err}</div>}
      {loading && <p className={styles.comingSoon}>加载中…</p>}

      {!loading && configs.length === 0 && (
        <div className={styles.emptyModel}>
          <div className={styles.emptyModelIcon}>🤖</div>
          <div className={styles.emptyModelText}>还没有配置任何模型</div>
          <button className={styles.addBtn} onClick={() => setEdit('new')}>添加第一个模型</button>
        </div>
      )}

      <div className={styles.configList}>
        {configs.map(cfg => (
          <div key={cfg.id} className={`${styles.configCard} ${cfg.is_default ? styles.configCardDefault : ''}`}>
            <div className={styles.configCardLeft}>
              <div className={styles.configName}>
                {cfg.name}
                {cfg.is_default && <span className={styles.defaultBadge}>默认</span>}
              </div>
              <div className={styles.configMeta}>
                <span className={styles.providerTag}>{cfg.provider}</span>
                <span className={styles.modelTag}>{cfg.model}</span>
                {cfg.base_url && <span className={styles.urlTag}>{cfg.base_url}</span>}
              </div>
            </div>
            <div className={styles.configCardActions}>
              {!cfg.is_default && (
                <button className={styles.ghostBtn} onClick={() => handleSetDefault(cfg)}>设为默认</button>
              )}
              <button className={styles.ghostBtn} onClick={() => setEdit(cfg)}>编辑</button>
              <button className={styles.deleteBtn} onClick={() => handleDelete(cfg.id)}>删除</button>
            </div>
          </div>
        ))}
      </div>

      {editTarget && (
        <ModelForm
          initial={editTarget === 'new' ? undefined : editTarget}
          onSave={handleSave}
          onCancel={() => setEdit(null)}
        />
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
