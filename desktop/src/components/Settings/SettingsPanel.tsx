import React, { useState, useRef, useEffect, KeyboardEvent } from 'react'
import { useAppStore, SecurityConfig, FallbackLLMConfig } from '../../store/app'
import styles from './SettingsPanel.module.css'
import { apiFetch } from '../../api/apiFetch'
import {
  LLMConfig,
  fetchLLMConfigs,
  testLLMConfig,
} from '../../api/llmConfigs'

type Tab = 'account' | 'general' | 'models' | 'mcp' | 'im-bot' | 'security' | 'feedback' | 'about'

const APP_VERSION = '0.1.0'


// ── ModelCenterTab ────────────────────────────────────────────────────────────
const PROVIDERS = [
  { value: 'openai',     label: 'OpenAI',      abbr: 'OA', url: 'https://api.openai.com/v1' },
  { value: 'anthropic',  label: 'Claude',      abbr: 'AN', url: 'https://api.anthropic.com' },
  { value: 'gemini',     label: 'Gemini',      abbr: 'G',  url: '' },
  { value: 'deepseek',   label: 'DeepSeek',    abbr: 'DS', url: 'https://api.deepseek.com/v1' },
  { value: 'qwen',       label: 'Qwen',        abbr: 'QW', url: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { value: 'zhipu',      label: 'GLM',         abbr: 'GL', url: 'https://open.bigmodel.cn/api/paas/v4' },
  { value: 'minimax',    label: 'MiniMax',     abbr: 'MM', url: 'https://api.minimax.chat/v1' },
  { value: 'moonshot',   label: 'Moonshot',    abbr: 'KI', url: 'https://api.moonshot.cn/v1' },
  { value: 'yi',         label: 'Yi',          abbr: 'Yi', url: 'https://api.lingyiwanwu.com/v1' },
  { value: 'groq',       label: 'Groq',        abbr: 'GQ', url: 'https://api.groq.com/openai/v1' },
  { value: 'mistral',    label: 'Mistral',     abbr: 'MI', url: 'https://api.mistral.ai/v1' },
  { value: 'xai',        label: 'Grok',        abbr: 'xI', url: 'https://api.x.ai/v1' },
  { value: 'openrouter', label: 'OpenRouter',  abbr: 'OR', url: 'https://openrouter.ai/api/v1' },
  { value: 'ollama',     label: 'Ollama',      abbr: 'OL', url: 'http://localhost:11434/v1' },
  { value: 'custom',     label: '自定义',      abbr: '··', url: '' },
]

const PROVIDER_ICON_META: Record<string, { bg: string }> = {
  openai:     { bg: '#10a37f' },
  anthropic:  { bg: '#d97757' },
  gemini:     { bg: '#4285F4' },
  deepseek:   { bg: '#5786FE' },
  qwen:       { bg: '#6950EF' },
  zhipu:      { bg: '#2563EB' },
  minimax:    { bg: '#E73562' },
  moonshot:   { bg: '#0F172A' },
  yi:         { bg: '#0EA5E9' },
  groq:       { bg: '#F55036' },
  mistral:    { bg: '#FF7000' },
  xai:        { bg: '#111111' },
  openrouter: { bg: '#8B5CF6' },
  ollama:     { bg: '#3B3B3B' },
  custom:     { bg: '#64748B' },
}

// Simple Icons CDN slugs for providers that have official icons
const LOBE_ICONS: Record<string, string> = {
  openai:     'openai',
  anthropic:  'claude',
  gemini:     'gemini',
  deepseek:   'deepseek',
  qwen:       'qwen',
  zhipu:      'zhipu',
  minimax:    'minimax',
  moonshot:   'moonshot',
  yi:         'yi',
  groq:       'groq',
  mistral:    'mistral',
  xai:        'grok',
  openrouter: 'openrouter',
  ollama:     'ollama',
}

function ProviderIcon({ value, size = 18 }: { value: string; size?: number }) {
  const p = PROVIDERS.find(x => x.value === value)
  const meta = PROVIDER_ICON_META[value] ?? { bg: '#888' }
  const slug = LOBE_ICONS[value]
  if (slug) {
    return (
      <img
        src={`https://registry.npmmirror.com/@lobehub/icons-static-png/latest/files/dark/${slug}.png`}
        width={size} height={size}
        alt={p?.label ?? value}
        style={{ display: 'block', borderRadius: 3, flexShrink: 0 }}
      />
    )
  }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: size, height: size, borderRadius: 3,
      background: meta.bg, color: '#fff',
      fontSize: Math.round(size * 0.42), fontWeight: 700,
      fontFamily: 'system-ui, monospace', letterSpacing: '-0.5px', flexShrink: 0,
    }}>{p?.abbr ?? '?'}</span>
  )
}

function ConfigSelect({ configs, value, onChange }: {
  configs: LLMConfig[]
  value: string | null
  onChange: (id: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = configs.find(c => c.id === value) ?? configs[0]

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  if (!selected) return null

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '9px 12px', borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border)', background: 'var(--bg-surface)',
          color: 'var(--text-primary)', fontSize: 13, cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <ProviderIcon value={selected.provider} size={18} />
        <span style={{ flex: 1 }}>{selected.name}</span>
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
          marginTop: 4, background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)', overflow: 'hidden',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}>
          {configs.map(cfg => (
            <div
              key={cfg.id}
              onClick={() => { onChange(cfg.id); setOpen(false) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 12px', cursor: 'pointer', fontSize: 13,
                background: cfg.id === value ? 'var(--bg-hover)' : 'transparent',
                color: 'var(--text-primary)',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = cfg.id === value ? 'var(--bg-hover)' : 'transparent')}
            >
              <ProviderIcon value={cfg.provider} size={16} />
              <span>{cfg.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface FallbackFormRow extends FallbackLLMConfig {
  showKey: boolean
}

function ModelCenterTab() {
  const { customLLMConfig, setCustomLLMConfig, selectedServerConfigId, setSelectedServerConfigId } = useAppStore()
  const [modelSubTab, setModelSubTab] = useState<'default' | 'custom'>('default')

  // ── 默认配置 state
  const [serverConfigs, setServerConfigs] = useState<LLMConfig[]>([])
  const [loadingConfigs, setLoadingConfigs] = useState(true)
  const [pendingConfigId, setPendingConfigId] = useState<string | null>(selectedServerConfigId)
  const [savedMsg, setSavedMsg] = useState('')

  // ── 自定义配置 form state（与 store 同步，编辑后点保存才写入）
  const [provider, setProvider] = useState(customLLMConfig.provider)
  const [model, setModel] = useState(customLLMConfig.model)
  const [apiKey, setApiKey] = useState(customLLMConfig.api_key)
  const [baseUrl, setBaseUrl] = useState(customLLMConfig.base_url)
  const [contextLimit, setContextLimit] = useState(customLLMConfig.context_limit)
  const [temperature, setTemperature] = useState(customLLMConfig.temperature)
  const [showKey, setShowKey] = useState(false)
  const [fallbacks, setFallbacks] = useState<FallbackFormRow[]>(
    customLLMConfig.fallbacks.map(f => ({ ...f, showKey: false }))
  )
  const [saving, setSaving] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; latency_ms?: number | null; error?: string } | null>(null)

  useEffect(() => {
    fetchLLMConfigs()
      .then(cfgs => {
        setServerConfigs(cfgs)
        // If no selection saved yet, auto-pick the default config
        if (!selectedServerConfigId && cfgs.length > 0) {
          const def = cfgs.find(c => c.is_default) ?? cfgs[0]
          setPendingConfigId(def.id)
        }
      })
      .catch(() => {})
      .finally(() => setLoadingConfigs(false))
  }, []) // eslint-disable-line

  const addFallback = () =>
    setFallbacks(prev => [...prev, { provider: 'openai', model: '', api_key: '', base_url: '', showKey: false }])

  const removeFallback = (i: number) =>
    setFallbacks(prev => prev.filter((_, idx) => idx !== i))

  const updateFallback = (i: number, patch: Partial<FallbackFormRow>) =>
    setFallbacks(prev => prev.map((f, idx) => idx === i ? { ...f, ...patch } : f))

  const handleSaveAndConnect = async () => {
    if (!model.trim() || !apiKey.trim()) {
      setTestResult({ ok: false, error: '模型 ID 和 API Key 为必填项' })
      return
    }
    setSaving(true)
    setTestResult(null)
    try {
      const result = await testLLMConfig({
        provider,
        model: model.trim(),
        api_key: apiKey.trim(),
        base_url: baseUrl.trim() || undefined,
      })
      setTestResult(result)
      if (result.ok) {
        // Save to store/localStorage on success
        setCustomLLMConfig({
          enabled: true,
          provider,
          model: model.trim(),
          api_key: apiKey.trim(),
          base_url: baseUrl.trim(),
          context_limit: contextLimit,
          temperature,
          fallbacks: fallbacks.map(({ showKey: _sk, ...rest }) => rest),
        })
      }
    } catch (e: any) {
      setTestResult({ ok: false, error: e.message })
    }
    setSaving(false)
  }

  const handleDisable = () => {
    setCustomLLMConfig({ enabled: false })
    setTestResult(null)
  }

  const providerLabel = (p: string) => PROVIDERS.find(x => x.value === p)?.label ?? p

  return (
    <div className={styles.modelCenter}>
      {/* Sub-tab switcher */}
      <div className={styles.modeTabs}>
        <button
          className={`${styles.modeTab} ${modelSubTab === 'default' ? styles.modeTabActive : ''}`}
          onClick={() => setModelSubTab('default')}>
          云端配置
          {!customLLMConfig.enabled && (
            <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--accent)' }}>● 启用中</span>
          )}
        </button>
        <button
          className={`${styles.modeTab} ${modelSubTab === 'custom' ? styles.modeTabActive : ''}`}
          onClick={() => setModelSubTab('custom')}>
          自定义配置
          {customLLMConfig.enabled && (
            <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--accent)' }}>● 启用中</span>
          )}
        </button>
      </div>

      {/* ── 默认配置 ── */}
      {modelSubTab === 'default' && (
        <div className={styles.customForm}>
          {loadingConfigs ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>加载中…</p>
          ) : serverConfigs.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>暂无服务端模型配置，请联系管理员添加。</p>
          ) : (
            <>
              <div className={styles.formRow}>
                <label className={styles.formLabel}>模型</label>
                <ConfigSelect
                  configs={serverConfigs}
                  value={pendingConfigId}
                  onChange={setPendingConfigId}
                />
              </div>
              {pendingConfigId && (() => {
                const cfg = serverConfigs.find(c => c.id === pendingConfigId)
                return cfg ? (
                  <p className={styles.formHint}>
                    {cfg.model}{cfg.context_limit ? ` · ${(cfg.context_limit / 1000).toFixed(0)}k ctx` : ''}
                    {cfg.base_url ? ` · ${cfg.base_url}` : ''}
                  </p>
                ) : null
              })()}
              {savedMsg && <p style={{ color: 'var(--accent)', fontSize: 12, marginBottom: 8 }}>{savedMsg}</p>}
              <div className={styles.saveRow}>
                <button
                  className={styles.saveConnectBtn}
                  onClick={() => {
                    setSelectedServerConfigId(pendingConfigId)
                    setSavedMsg('✓ 已保存')
                    setTimeout(() => setSavedMsg(''), 2000)
                  }}
                >
                  保存
                </button>
              </div>
              <p className={styles.formHint} style={{ marginTop: 8 }}>
                服务端管理员配置的模型，连接账号后即可使用，无需填写 API Key。
              </p>
            </>
          )}
        </div>
      )}

      {/* ── 自定义配置 ── */}
      {modelSubTab === 'custom' && (
        <div className={styles.customForm}>
          {/* API Base URL */}
          <div className={styles.formRow}>
            <label className={styles.formLabel}>API Base URL</label>
            <input
              className={styles.formInput}
              placeholder="https://api.openai.com/v1"
              value={baseUrl}
              onChange={e => setBaseUrl(e.target.value)}
            />
          </div>

          {/* 模型 */}
          <div className={styles.formRow}>
            <label className={styles.formLabel}>模型</label>
            <input
              className={styles.formInput}
              placeholder="gpt-4o"
              value={model}
              onChange={e => setModel(e.target.value)}
            />
          </div>

          {/* API Key */}
          <div className={styles.formRow}>
            <label className={styles.formLabel}>API Key</label>
            <div className={styles.apiKeyWrap}>
              <input
                className={styles.formInput}
                type={showKey ? 'text' : 'password'}
                placeholder="sk-..."
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
              />
              <button className={styles.eyeBtn} onClick={() => setShowKey(!showKey)}>
                {showKey ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {/* 最大 Tokens + Temperature */}
          <div className={styles.formRowDouble}>
            <div className={styles.formCol}>
              <label className={styles.formLabel}>最大 Tokens（k）</label>
              <div className={styles.inputWithUnit}>
                <input
                  className={styles.formInput}
                  type="number"
                  min={1}
                  step={1}
                  value={Math.round(contextLimit / 1000)}
                  onChange={e => {
                    const k = Number(e.target.value)
                    setContextLimit((Number.isFinite(k) && k > 0 ? k : 1) * 1000)
                  }}
                />
                <span className={styles.inputUnit}>k</span>
              </div>
            </div>
            <div className={styles.formCol}>
              <label className={styles.formLabel}>Temperature</label>
              <input
                className={styles.formInput}
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={temperature}
                onChange={e => setTemperature(Number(e.target.value))}
              />
            </div>
          </div>

          {/* 备用模型 */}
          <div className={styles.fallbackSection}>
            <div className={styles.fallbackHeader}>
              <span className={styles.formLabel}>备用模型</span>
              <span className={styles.formHint}>主模型调用失败时，按顺序尝试备用模型</span>
            </div>

            {fallbacks.map((fb, i) => (
              <div key={i} className={styles.fallbackCard}>
                <div className={styles.fallbackCardHead}>
                  <span className={styles.fallbackIdx}>{i + 1}</span>
                  <button className={styles.fallbackCardRemove} onClick={() => removeFallback(i)}>×</button>
                </div>

                <div className={styles.fallbackApiRow}>
                  <span className={styles.fallbackFieldLabel}>API URL</span>
                  <input
                    className={styles.fallbackInput}
                    placeholder="https://api.openai.com/v1"
                    value={fb.base_url}
                    onChange={e => updateFallback(i, { base_url: e.target.value })}
                  />
                </div>
                <div className={styles.fallbackApiRow}>
                  <span className={styles.fallbackFieldLabel}>模型</span>
                  <input
                    className={styles.fallbackInput}
                    placeholder="gpt-4o"
                    value={fb.model}
                    onChange={e => updateFallback(i, { model: e.target.value })}
                  />
                </div>
                <div className={styles.fallbackApiRow}>
                  <span className={styles.fallbackFieldLabel}>API Key</span>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <input
                      className={styles.fallbackInput}
                      type={fb.showKey ? 'text' : 'password'}
                      placeholder="sk-..."
                      value={fb.api_key}
                      onChange={e => updateFallback(i, { api_key: e.target.value })}
                      style={{ paddingRight: 32 }}
                    />
                    <button
                      style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: 'var(--text-muted)' }}
                      onClick={() => updateFallback(i, { showKey: !fb.showKey })}>
                      {fb.showKey ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>
              </div>
            ))}

            <button className={styles.addFallbackBtn} onClick={addFallback}>
              + 添加备用模型
            </button>
          </div>

          {/* 状态消息 */}
          {testResult && (
            <div className={testResult.ok ? styles.okMsg : styles.errMsg}>
              {testResult.ok
                ? `✓ 连接成功，延迟 ${testResult.latency_ms} ms，配置已保存`
                : `✗ 连接失败：${testResult.error ?? '未知错误'}`}
            </div>
          )}

          {/* 底部操作 */}
          <div className={styles.saveRow} style={{ gap: 8 }}>
            <button
              className={styles.saveConnectBtn}
              onClick={handleSaveAndConnect}
              disabled={saving}>
              {saving ? '测试中…' : '保存并连接'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── GeneralTab ─────────────────────────────────────────────────────────────────
interface DailyNoteConfig {
  auto_generate: boolean
  note_time: string
  max_retries: number
  timezone: string
}

// Common timezone options
const TIMEZONE_OPTIONS = [
  { value: 'Asia/Shanghai', label: 'UTC+8 中国标准时间' },
  { value: 'Asia/Tokyo', label: 'UTC+9 日本标准时间' },
  { value: 'Asia/Kolkata', label: 'UTC+5:30 印度标准时间' },
  { value: 'Europe/London', label: 'UTC+0 伦敦' },
  { value: 'Europe/Berlin', label: 'UTC+1 柏林' },
  { value: 'America/New_York', label: 'UTC-5 纽约' },
  { value: 'America/Los_Angeles', label: 'UTC-8 洛杉矶' },
  { value: 'UTC', label: 'UTC' },
]

const detectTimezone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return 'Asia/Shanghai'
  }
}

const DEFAULT_DAILY_NOTE_CONFIG: DailyNoteConfig = {
  auto_generate: true,
  note_time: '23:50',
  max_retries: 2,
  timezone: detectTimezone(),
}

function GeneralTab() {
  const { token, serverUrl, customLLMConfig, setAppTimezone, setCustomLLMConfig } = useAppStore()
  const [config, setConfig] = useState<DailyNoteConfig>(DEFAULT_DAILY_NOTE_CONFIG)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  useEffect(() => {
    if (!token || !serverUrl) { setLoading(false); return }
    apiFetch(`${serverUrl}/api/memory/daily-note-config`)
      .then(r => r.json())
      .then((d: DailyNoteConfig) => {
        const merged = { ...DEFAULT_DAILY_NOTE_CONFIG, ...d }
        setConfig(merged)
        if (merged.timezone) setAppTimezone(merged.timezone)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [token, serverUrl])

  const save = async () => {
    if (!token || !serverUrl || saving) return
    setSaving(true)
    setSaveMsg('')
    try {
      const resp = await apiFetch(`${serverUrl}/api/memory/daily-note-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...config,
          // Store enabled custom LLM config server-side so cron can use it
          llm_config: customLLMConfig?.enabled ? {
            enabled: true,
            provider: customLLMConfig.provider,
            model: customLLMConfig.model,
            api_key: customLLMConfig.api_key,
            base_url: customLLMConfig.base_url,
            temperature: customLLMConfig.temperature,
          } : null,
        }),
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      setAppTimezone(config.timezone)
      setSaveMsg('已保存')
    } catch {
      setSaveMsg('保存失败')
    } finally {
      setSaving(false)
      setTimeout(() => setSaveMsg(''), 2500)
    }
  }

  if (loading) return <div className={styles.saveMsg} style={{ padding: '24px 0' }}>加载中…</div>

  return (
    <div className={styles.securityPage}>

      {/* 自动生成 */}
      <div className={styles.secRow}>
        <div className={styles.secRowLeft}>
          <div className={styles.secRowTitle}>自动生成日记</div>
          <div className={styles.secRowDesc}>每天定时用 AI 整理当天的对话，自动写入笔记文件</div>
        </div>
        <button
          className={`${styles.toggle} ${config.auto_generate ? styles.toggleOn : ''}`}
          onClick={() => setConfig(c => ({ ...c, auto_generate: !c.auto_generate }))}
          role="switch"
          aria-checked={config.auto_generate}
        />
      </div>

      {/* 定时时间（仅自动开启时显示） */}
      {config.auto_generate && (
        <>
        {/* 时区 */}
        <div className={styles.secRow}>
          <div className={styles.secRowLeft}>
            <div className={styles.secRowTitle}>时区</div>
            <div className={styles.secRowDesc}>笔记生成时间使用的时区</div>
          </div>
          <select
            className={styles.limitInput}
            style={{ width: 200 }}
            value={config.timezone}
            onChange={e => setConfig(c => ({ ...c, timezone: e.target.value }))}
          >
            {TIMEZONE_OPTIONS.map(tz => (
              <option key={tz.value} value={tz.value}>{tz.label}</option>
            ))}
            {/* If user's timezone is not in the list, show it too */}
            {!TIMEZONE_OPTIONS.some(tz => tz.value === config.timezone) && (
              <option value={config.timezone}>{config.timezone}</option>
            )}
          </select>
        </div>

        {/* 生成时间 */}
        <div className={styles.secRow}>
          <div className={styles.secRowLeft}>
            <div className={styles.secRowTitle}>生成时间</div>
            <div className={styles.secRowDesc}>每天在此时间自动生成笔记</div>
          </div>
          <input
            type="time"
            className={styles.limitInput}
            style={{ width: 96 }}
            value={config.note_time}
            onChange={e => setConfig(c => ({ ...c, note_time: e.target.value }))}
          />
        </div>
        </>
      )}

      {/* 重试次数 */}
      <div className={styles.secRow}>
        <div className={styles.secRowLeft}>
          <div className={styles.secRowTitle}>重试次数</div>
          <div className={styles.secRowDesc}>AI 生成失败时自动重试的最大次数（0–5）</div>
        </div>
        <div className={styles.limitRow}>
          <input
            type="number"
            className={styles.limitInput}
            min={0}
            max={5}
            value={config.max_retries}
            onChange={e =>
              setConfig(c => ({ ...c, max_retries: Math.min(5, Math.max(0, Number(e.target.value) || 0)) }))
            }
          />
          <span className={styles.secRowDesc}>次</span>
        </div>
      </div>

      {/* 默认模型来源 */}
      <div className={styles.secRow}>
        <div className={styles.secRowLeft}>
          <div className={styles.secRowTitle}>默认模型</div>
          <div className={styles.secRowDesc}>对话默认使用云端配置的模型还是自定义配置的模型</div>
        </div>
        <select
          className={styles.limitInput}
          style={{ width: 120 }}
          value={customLLMConfig.enabled ? 'custom' : 'server'}
          onChange={e => setCustomLLMConfig({ enabled: e.target.value === 'custom' })}
        >
          <option value="server">云端配置</option>
          <option value="custom">自定义配置</option>
        </select>
      </div>

      {/* 保存 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 16 }}>
        <button className={styles.nickSaveBtn} onClick={save} disabled={saving}>
          {saving ? '保存中…' : '保存设置'}
        </button>
        {saveMsg && <span className={styles.saveMsg}>{saveMsg}</span>}
      </div>

    </div>
  )
}

// ── SecurityTab ────────────────────────────────────────────────────────────────
function SecurityTab() {
  const { securityConfig, setSecurityConfig } = useAppStore()
  const cfg = securityConfig

  // Tag input state
  const [cmdInput, setCmdInput] = useState('')
  const [toolInput, setToolInput] = useState('')

  const addTag = (field: 'commandWhitelist' | 'toolWhitelist', value: string) => {
    const v = value.trim()
    if (!v || cfg[field].includes(v)) return
    setSecurityConfig({ [field]: [...cfg[field], v] })
  }
  const removeTag = (field: 'commandWhitelist' | 'toolWhitelist', tag: string) => {
    setSecurityConfig({ [field]: cfg[field].filter((t) => t !== tag) })
  }
  const handleTagKeyDown = (
    field: 'commandWhitelist' | 'toolWhitelist',
    e: KeyboardEvent<HTMLInputElement>,
    val: string,
    setVal: (v: string) => void,
  ) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag(field, val)
      setVal('')
    } else if (e.key === 'Backspace' && !val) {
      const list = cfg[field]
      if (list.length) setSecurityConfig({ [field]: list.slice(0, -1) })
    }
  }

  return (
    <div className={styles.securityPage}>

      {/* Bot 控制权 */}
      <div className={styles.secRow}>
        <div className={styles.secRowLeft}>
          <div className={styles.secRowTitle}>Bot 控制权</div>
          <div className={styles.secRowDesc}>允许 Bot 通过 MCP 修改沙箱模式、网络配置和循环守卫设置</div>
        </div>
        <button
          className={`${styles.toggle} ${cfg.botControlPermission ? styles.toggleOn : ''}`}
          onClick={() => setSecurityConfig({ botControlPermission: !cfg.botControlPermission })}
          aria-checked={cfg.botControlPermission}
          role="switch"
        />
      </div>

      {/* 完全访问模式 */}
      <div className={styles.secRow}>
        <div className={styles.secRowLeft}>
          <div className={styles.secRowTitle}>完全访问模式</div>
          <div className={styles.secRowDesc}>信任所有工具调用，跳过审批确认弹窗</div>
        </div>
        <button
          className={`${styles.toggle} ${cfg.fullAccessMode ? styles.toggleOn : ''}`}
          onClick={() => setSecurityConfig({ fullAccessMode: !cfg.fullAccessMode })}
          aria-checked={cfg.fullAccessMode}
          role="switch"
        />
      </div>

      {/* 循环守卫 */}
      <div className={styles.secRow}>
        <div className={styles.secRowLeft}>
          <div className={styles.secRowTitle}>循环守卫</div>
          <div className={styles.secRowDesc}>检测并阻止 Bot 陷入死循环（重复调用、连续失败）</div>
        </div>
        <button
          className={`${styles.toggle} ${cfg.loopGuard ? styles.toggleOn : ''}`}
          onClick={() => setSecurityConfig({ loopGuard: !cfg.loopGuard })}
          aria-checked={cfg.loopGuard}
          role="switch"
        />
      </div>

      {/* 循环守卫灵敏度 */}
      {cfg.loopGuard && (
        <div className={styles.secSubRow}>
          <span className={styles.secSubLabel}>灵敏度</span>
          <div className={styles.segControl}>
            {(['strict', 'default', 'loose'] as SecurityConfig['loopGuardSensitivity'][]).map((v) => {
              const labels = { strict: '保守', default: '默认', loose: '宽松' }
              return (
                <button
                  key={v}
                  className={`${styles.segBtn} ${cfg.loopGuardSensitivity === v ? styles.segBtnActive : ''}`}
                  onClick={() => setSecurityConfig({ loopGuardSensitivity: v })}
                >
                  {labels[v]}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className={styles.secDivider} />

      {/* 单轮工具调用上限 */}
      <div className={styles.secBlock}>
        <div className={styles.secBlockHeader}>
          <span className={styles.secBlockTitle}>单轮工具调用上限</span>
          <span className={styles.secBlockDesc}>Agent 每轮对话中最多可执行的工具调用次数</span>
        </div>
        <div className={styles.limitRow}>
          <input
            className={styles.limitInput}
            type="number"
            min={1}
            max={500}
            value={cfg.maxToolCallsPerRound}
            onChange={(e) => {
              const v = Math.max(1, Math.min(500, parseInt(e.target.value) || 1))
              setSecurityConfig({ maxToolCallsPerRound: v })
            }}
          />
          <span className={styles.secBlockDesc}>范围 1–500，建议设置在 200 以内</span>
        </div>
      </div>

      <div className={styles.secDivider} />

      {/* 命令白名单 */}
      <div className={`${styles.secBlock} ${cfg.fullAccessMode ? styles.secBlockDisabled : ''}`}>
        {cfg.fullAccessMode && <span className={styles.fullAccessBadge}>🔓 完全访问模式已开启，此策略暂时跳过</span>}
        <div className={styles.secBlockHeader}>
          <span className={styles.secBlockTitle}>命令白名单</span>
          <span className={styles.secBlockDesc}>可自动执行的终端命令</span>
        </div>
        <div className={styles.tagBox}>
          {cfg.commandWhitelist.map((tag) => (
            <span key={tag} className={styles.tag}>
              {tag}
              <button className={styles.tagRemove} onClick={() => removeTag('commandWhitelist', tag)}>×</button>
            </span>
          ))}
          <input
            className={styles.tagInput}
            value={cmdInput}
            onChange={(e) => setCmdInput(e.target.value)}
            onKeyDown={(e) => handleTagKeyDown('commandWhitelist', e, cmdInput, setCmdInput)}
            onBlur={() => { if (cmdInput.trim()) { addTag('commandWhitelist', cmdInput); setCmdInput('') } }}
            placeholder="输入命令名，如 npm、git push，回车添加"
          />
        </div>
      </div>

      {/* 工具白名单 */}
      <div className={styles.secBlock}>
        <div className={styles.secBlockHeader}>
          <span className={styles.secBlockTitle}>工具白名单</span>
          <span className={styles.secBlockDesc}>可自动放行的工具（内置工具、MCP 等）</span>
        </div>
        <div className={styles.tagBox}>
          {cfg.toolWhitelist.map((tag) => (
            <span key={tag} className={styles.tag}>
              {tag}
              <button className={styles.tagRemove} onClick={() => removeTag('toolWhitelist', tag)}>×</button>
            </span>
          ))}
          <input
            className={styles.tagInput}
            value={toolInput}
            onChange={(e) => setToolInput(e.target.value)}
            onKeyDown={(e) => handleTagKeyDown('toolWhitelist', e, toolInput, setToolInput)}
            onBlur={() => { if (toolInput.trim()) { addTag('toolWhitelist', toolInput); setToolInput('') } }}
            placeholder="输入工具名，如 web_fetch、file_read，回车添加"
          />
        </div>
      </div>

      <div className={styles.secDivider} />

      {/* 执行环境 */}
      <div className={styles.secBlock}>
        <div className={styles.secBlockHeader}>
          <span className={styles.secBlockTitle}>执行环境</span>
        </div>
        <div className={styles.envTabs}>
          <button
            className={`${styles.envTab} ${cfg.execEnvironment === 'transparent' ? styles.envTabActive : ''}`}
            onClick={() => setSecurityConfig({ execEnvironment: 'transparent' })}
          >
            透明模式
          </button>
          <button
            className={`${styles.envTab} ${cfg.execEnvironment === 'container' ? styles.envTabActive : ''}`}
            onClick={() => setSecurityConfig({ execEnvironment: 'container' })}
          >
            容器隔离
          </button>
        </div>

        {cfg.execEnvironment === 'transparent' ? (
          <div className={styles.envDesc}>
            <div className={styles.envDescTitle}>透明模式</div>
            <div className={styles.envDescText}>所有命令在宿主机执行，通过审批和策略保护</div>
          </div>
        ) : (
          <ContainerEnvPanel cfg={cfg} setSecurityConfig={setSecurityConfig} />
        )}
      </div>

      <div className={styles.secDivider} />

      {/* 工具审批策略 */}
      <SandboxThresholdBlock cfg={cfg} setSecurityConfig={setSecurityConfig} disabled={cfg.fullAccessMode} />

    </div>
  )
}

// ── SandboxThresholdBlock ──────────────────────────────────────────────────────
function SandboxThresholdBlock({
  cfg,
  setSecurityConfig,
  disabled = false,
}: {
  cfg: SecurityConfig
  setSecurityConfig: (patch: Partial<SecurityConfig>) => void
  disabled?: boolean
}) {
  const [confirmOff, setConfirmOff] = useState(false)

  type Level = SecurityConfig['sandboxThreshold']
  const levels: { value: Level; label: string; desc: string }[] = [
    { value: 'LOW',    label: '全部确认',    desc: 'LOW 及以上均需确认' },
    { value: 'MEDIUM', label: '中等以上',    desc: 'MEDIUM / HIGH 需要确认（默认）' },
    { value: 'HIGH',   label: '仅高风险',    desc: '仅 HIGH 需要确认，MEDIUM 自动放行' },
    { value: 'off',    label: '关闭审批',    desc: '所有工具调用自动执行，无需确认' },
  ]

  const handleSelect = (v: Level) => {
    if (v === 'off') { setConfirmOff(true); return }
    setSecurityConfig({ sandboxThreshold: v })
  }

  return (
    <div className={`${styles.secBlock} ${disabled ? styles.secBlockDisabled : ''}`}>
      {disabled && <span className={styles.fullAccessBadge}>🔓 完全访问模式已开启，此策略暂时跳过</span>}
      <div className={styles.secBlockHeader}>
        <span className={styles.secBlockTitle}>工具审批策略</span>
        <span className={styles.secBlockDesc}>达到该风险级别的工具调用会弹出确认对话框</span>
      </div>
      <div className={styles.thresholdGrid}>
        {levels.map(lv => (
          <button
            key={lv.value}
            className={`${styles.thresholdCard} ${cfg.sandboxThreshold === lv.value ? styles.thresholdCardActive : ''} ${lv.value === 'off' ? styles.thresholdCardDanger : ''}`}
            onClick={() => handleSelect(lv.value)}
          >
            <span className={styles.thresholdLabel}>{lv.label}</span>
            <span className={styles.thresholdDesc}>{lv.desc}</span>
          </button>
        ))}
      </div>

      {/* 关闭审批二次确认 */}
      {confirmOff && (
        <div className={styles.overlay}>
          <div className={styles.confirmDialog}>
            <div className={styles.confirmTitle}>⚠️ 确认关闭审批？</div>
            <div className={styles.confirmText}>
              关闭审批后，所有工具调用将<strong>自动执行</strong>，无需确认弹窗。
              HIGH 风险操作（删除文件、执行系统命令等）也会直接运行。
            </div>
            <div className={styles.confirmActions}>
              <button
                className={styles.btnDanger}
                onClick={() => { setSecurityConfig({ sandboxThreshold: 'off' }); setConfirmOff(false) }}
              >
                我已知晓，关闭审批
              </button>
              <button className={styles.btnSecondary} onClick={() => setConfirmOff(false)}>取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── ContainerEnvPanel ──────────────────────────────────────────────────────────
type ContainerEnvPanelProps = {
  cfg: SecurityConfig
  setSecurityConfig: (patch: Partial<SecurityConfig>) => void
}

type DockerStatus = 'idle' | 'checking' | 'ok' | 'not_installed' | 'not_running'
type ImageStatus  = 'idle' | 'checking' | 'installed' | 'not_installed'

function ContainerEnvPanel({ cfg, setSecurityConfig }: ContainerEnvPanelProps) {
  const [dockerStatus, setDockerStatus]   = useState<DockerStatus>('idle')
  const [dockerVersion, setDockerVersion] = useState('')
  const [dockerWarning, setDockerWarning] = useState('')
  const [imageStatus, setImageStatus]     = useState<ImageStatus>('idle')

  const checkDocker = async () => {
    setDockerStatus('checking')
    setDockerVersion('')
    setDockerWarning('')
    try {
      const res = await window.nekoBridge.shell.exec('docker --version')
      const out = (res.stdout ?? '').trim()
      if (res.error || !out) { setDockerStatus('not_installed'); return }
      const match = out.match(/Docker version ([\d.]+)/i)
      setDockerVersion(match ? match[1] : out)
      const ping = await window.nekoBridge.shell.exec('docker info --format "{{.ServerVersion}}"')
      if (ping.error || (ping.stderr ?? '').toLowerCase().includes('cannot connect')) {
        setDockerStatus('not_running')
        setDockerWarning('Docker 已安装，但 Docker Desktop 未启动。请先启动 Docker Desktop 再操作。')
      } else {
        setDockerStatus('ok')
      }
    } catch { setDockerStatus('not_installed') }
  }

  const checkImage = async () => {
    setImageStatus('checking')
    try {
      const res = await window.nekoBridge.shell.exec('docker images -q nekoclaw-sandbox 2>/dev/null')
      setImageStatus((res.stdout ?? '').trim() ? 'installed' : 'not_installed')
    } catch { setImageStatus('not_installed') }
  }

  useEffect(() => { checkDocker(); checkImage() }, [])

  const networkOptions: { value: SecurityConfig['containerNetwork']; label: string; desc: string }[] = [
    { value: 'none',   label: '禁用网络',   desc: '容器内无法访问外部网络，最安全' },
    { value: 'host',   label: '宿主机网络', desc: '共享宿主机网络栈，Agent 可自由访问网络' },
    { value: 'custom', label: '自定义网络', desc: '高级选项，对应 docker run --network 参数' },
  ]

  return (
    <div className={styles.containerPanel}>

      {/* 容器描述 */}
      <div className={styles.envDesc}>
        <div className={styles.envDescTitle}>容器隔离</div>
        <div className={styles.envDescText}>Agent 的 shell 命令在独立容器中执行，文件系统仅可见工作目录，网络完全隔离</div>
      </div>

      {/* 容器运行时 */}
      <div className={styles.containerSection}>
        <div className={styles.containerSectionHead}>
          <span className={styles.containerSectionTitle}>容器运行时</span>
          <button
            className={styles.redetectBtn}
            onClick={checkDocker}
            disabled={dockerStatus === 'checking'}
          >
            {dockerStatus === 'checking' ? '检测中…' : '重新检测'}
          </button>
        </div>

        {(dockerStatus === 'idle' || dockerStatus === 'checking') && (
          <div className={styles.containerStatusRow}>
            <span className={styles.containerStatusNeutral}>检测中…</span>
          </div>
        )}
        {(dockerStatus === 'ok' || dockerStatus === 'not_running') && (
          <div className={`${styles.containerStatusRow} ${styles.containerOkRow}`}>
            <span className={styles.containerStatusOk}>✓ 已检测到: docker {dockerVersion}</span>
          </div>
        )}
        {dockerStatus === 'not_running' && dockerWarning && (
          <div className={`${styles.containerStatusRow} ${styles.containerWarnRow}`}>
            <span className={styles.containerWarnIcon}>⚠</span>
            <span className={styles.containerStatusWarn}>{dockerWarning}</span>
          </div>
        )}
        {dockerStatus === 'not_installed' && (
          <div className={`${styles.containerStatusRow} ${styles.containerErrRow}`}>
            <span className={styles.containerStatusErr}>✗ 未检测到 Docker，请先安装</span>
          </div>
        )}

        {dockerStatus === 'not_installed' && (
          <button className={styles.containerActionBtn}
            onClick={() => window.nekoBridge.shell.openExternal('https://www.docker.com/products/docker-desktop/')}>
            前往安装 Docker
          </button>
        )}
        {dockerStatus === 'not_running' && (
          <button className={styles.containerActionBtn} onClick={checkDocker}>
            我已启动，重新检测
          </button>
        )}
      </div>

      <div className={styles.containerDivider} />

      {/* 沙箱镜像 */}
      <div className={styles.containerSection}>
        <div className={styles.containerSectionHead}>
          <span className={styles.containerSectionTitle}>沙箱镜像</span>
        </div>
        {(imageStatus === 'idle' || imageStatus === 'checking') && (
          <div className={styles.containerStatusRow}>
            <span className={styles.containerStatusNeutral}>检测中…</span>
          </div>
        )}
        {imageStatus === 'installed' && (
          <div className={`${styles.containerStatusRow} ${styles.containerOkRow}`}>
            <span className={styles.containerStatusOk}>✓ 已安装</span>
          </div>
        )}
        {imageStatus === 'not_installed' && (
          <>
            <div className={`${styles.containerStatusRow} ${styles.containerErrRow}`}>
              <span className={styles.containerStatusErr}>✗ 未安装</span>
            </div>
            <button
              className={styles.containerActionBtn}
              disabled={dockerStatus !== 'ok'}
              onClick={async () => {
                setImageStatus('checking')
                await window.nekoBridge.shell.exec('docker pull nekoclaw/sandbox:latest')
                checkImage()
              }}
            >
              下载沙箱镜像
            </button>
          </>
        )}
      </div>

      <div className={styles.containerDivider} />

      {/* 容器网络 */}
      <div className={styles.containerSection}>
        <div className={styles.containerSectionHead}>
          <span className={styles.containerSectionTitle}>容器网络</span>
        </div>
        <div className={styles.networkOptions}>
          {networkOptions.map((opt) => (
            <label key={opt.value}
              className={`${styles.networkOption} ${cfg.containerNetwork === opt.value ? styles.networkOptionActive : ''}`}
            >
              <input
                type="radio"
                name="containerNetwork"
                value={opt.value}
                checked={cfg.containerNetwork === opt.value}
                onChange={() => setSecurityConfig({ containerNetwork: opt.value })}
                className={styles.networkRadio}
              />
              <div className={styles.networkOptionBody}>
                <span className={styles.networkOptionLabel}>{opt.label}</span>
                <span className={styles.networkOptionDesc}>{opt.desc}</span>
              </div>
            </label>
          ))}
        </div>
        <button
          className={styles.containerActionBtn}
          disabled={dockerStatus !== 'ok'}
          onClick={() => window.nekoBridge.shell.exec('docker restart nekoclaw-sandbox 2>/dev/null || true')}
        >
          重启容器
        </button>
        <div className={styles.containerFootnote}>网络变更将在下次启动沙箱容器时生效</div>
      </div>

    </div>
  )
}

// ── Account Tab ────────────────────────────────────────────────────────────────
interface AccountTabProps {
  userId: string | null
  username: string | null
  nickname: string | null
  avatarData: string | null
  serverUrl: string
  token: string | null
  setProfile: (userId: string, username: string, nickname: string | null, avatarData: string | null) => void
  onLogout: () => void
}

function AccountTab({ userId, username, nickname, avatarData, serverUrl, token, setProfile, onLogout }: AccountTabProps) {
  const [editingNick, setEditingNick] = useState(false)
  const [nickInput, setNickInput] = useState(nickname ?? '')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [quota, setQuota] = useState<{ msgLimit: number; msgUsed: number; createLimit: number; createUsed: number } | null>(null)

  useEffect(() => {
    if (!token || !serverUrl) return
    apiFetch(`${serverUrl}/api/auth/me/quota`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) setQuota({ msgLimit: data.daily_message_limit, msgUsed: data.messages_used_today, createLimit: data.daily_creation_limit, createUsed: data.creation_used_today })
      })
      .catch(() => {})
  }, [token, serverUrl]) // eslint-disable-line

  function formatQuota(used: number, limit: number) {
    if (limit === -1) return `${used} / 不限`
    return `${used} / ${limit}`
  }

  const shortId = userId ? userId.replace(/-/g, '').slice(0, 8) : '—'
  const displayName = nickname || username || '—'

  const patchProfile = async (patch: { nickname?: string | null; avatar_data?: string | null }) => {
    if (!token) return
    setSaving(true); setSaveMsg('')
    try {
      const res = await apiFetch(`${serverUrl}/api/auth/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error('保存失败')
      const me = await res.json()
      setProfile(me.id, me.username, me.nickname ?? null, me.avatar_data ?? null)
      setSaveMsg('已保存 ✓')
      setTimeout(() => setSaveMsg(''), 2000)
    } catch {
      setSaveMsg('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => patchProfile({ avatar_data: reader.result as string })
    reader.readAsDataURL(file)
  }

  const handleSaveNick = () => {
    patchProfile({ nickname: nickInput.trim() || null })
    setEditingNick(false)
  }

  return (
    <div>
      <div className={styles.userHeader}>
        <div className={styles.userHeaderLeft}>
          <div className={styles.accountAvatarWrap} onClick={() => avatarInputRef.current?.click()} title="点击修改头像">
            {avatarData
              ? <img src={avatarData} className={styles.accountAvatarImg} alt="头像" />
              : <div className={styles.accountAvatar}>🐾</div>
            }
            <div className={styles.accountAvatarEdit}>📷</div>
          </div>
          <input ref={avatarInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarChange} />
          <div>
            {editingNick ? (
              <div className={styles.nickEditRow}>
                <input
                  className={styles.nickInput}
                  value={nickInput}
                  onChange={(e) => setNickInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveNick() }}
                  autoFocus
                  maxLength={32}
                  placeholder="输入昵称"
                />
                <button className={styles.nickSaveBtn} onClick={handleSaveNick} disabled={saving}>保存</button>
                <button className={styles.nickCancelBtn} onClick={() => { setEditingNick(false); setNickInput(nickname ?? '') }}>取消</button>
              </div>
            ) : (
              <div className={styles.nickRow}>
                <span className={styles.userDisplayName}>{displayName}</span>
                <button className={styles.editNickBtn} onClick={() => { setEditingNick(true); setNickInput(nickname ?? '') }} title="修改昵称">✏️</button>
              </div>
            )}
            {saveMsg && <span className={styles.saveMsg}>{saveMsg}</span>}
          </div>
        </div>
        <button className={styles.dangerBtn} onClick={onLogout}>
          ↪ 退出登录
        </button>
      </div>
      <div className={styles.infoTable}>
        <div className={styles.infoRow}>
          <span className={styles.infoKey}>用户 ID</span>
          <span className={styles.infoVal}>{shortId}</span>
        </div>
        <div className={styles.infoRow}>
          <span className={styles.infoKey}>用户名</span>
          <span className={styles.infoVal}>{username ?? '—'}</span>
        </div>
        <div className={styles.infoRow}>
          <span className={styles.infoKey}>服务器</span>
          <span className={styles.infoVal}>{serverUrl ?? '—'}</span>
        </div>
        <div className={styles.infoRow}>
          <span className={styles.infoKey}>积分</span>
          <span className={`${styles.infoVal} ${styles.highlight}`}>
            {quota ? formatQuota(quota.msgUsed, quota.msgLimit) : '—'}
          </span>
        </div>
        <div className={styles.infoRow}>
          <span className={styles.infoKey}>创作点</span>
          <span className={`${styles.infoVal} ${styles.highlight}`}>
            {quota ? formatQuota(quota.createUsed, quota.createLimit) : '—'}
          </span>
        </div>
      </div>
    </div>
  )
}

export function SettingsPanel() {
  const [tab, setTab] = useState<Tab>('account')
  const { userId, username, nickname, avatarData, serverUrl, token, clearAuth, setServerConnected, settingsOpen, setSettingsOpen, setProfile } = useAppStore()

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
          <span className={styles.titleText}>猫档</span>
          <button className={styles.closeBtn} onClick={close}>✕</button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {/* Left nav */}
          <nav className={styles.nav}>
            <button className={nav('account')} onClick={() => setTab('account')}>
              <span className={styles.navIcon}>👤</span><span>猫主档案</span>
            </button>
            <button className={nav('general')} onClick={() => setTab('general')}>
              <span className={styles.navIcon}>⚙️</span><span>猫窝设置</span>
            </button>
            <button className={nav('models')} onClick={() => setTab('models')}>
              <span className={styles.navIcon}>🤖</span><span>猫粮站</span>
            </button>
            <button className={nav('mcp')} onClick={() => setTab('mcp')}>
              <span className={styles.navIcon}>🔌</span><span>MCP</span>
            </button>
            <button className={nav('im-bot')} onClick={() => setTab('im-bot')}>
              <span className={styles.navIcon}>💬</span><span>猫道</span>
            </button>
            <button className={nav('security')} onClick={() => setTab('security')}>
              <span className={styles.navIcon}>🛡️</span><span>铃铛</span>
              <span className={styles.betaBadge}>BETA</span>
            </button>
            <div className={styles.navDivider} />
            <button className={nav('feedback')} onClick={() => setTab('feedback')}>
              <span className={styles.navIcon}>❓</span><span>猫言猫语</span>
            </button>
            <button className={nav('about')} onClick={() => setTab('about')}>
              <span className={styles.navIcon}>🖥️</span><span>版本 {APP_VERSION}</span>
              <span className={styles.betaBadge}>BETA</span>
            </button>
          </nav>

          {/* Right content */}
          <div className={styles.content}>
            {tab === 'account' && (
              <AccountTab
                userId={userId}
                username={username}
                nickname={nickname}
                avatarData={avatarData}
                serverUrl={serverUrl}
                token={token}
                setProfile={setProfile}
                onLogout={handleLogout}
              />
            )}

            {tab === 'general' && (
              <div>
                <h2 className={styles.sectionTitle}>猫窝设置</h2>
                <GeneralTab />
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
                <h2 className={styles.sectionTitle}>猫道</h2>
                <p className={styles.comingSoon}>功能开发中…</p>
              </div>
            )}

            {tab === 'security' && <SecurityTab />}

            {tab === 'feedback' && (
              <div>
                <h2 className={styles.sectionTitle}>猫言猫语</h2>
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
