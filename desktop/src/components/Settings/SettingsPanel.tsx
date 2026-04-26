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
  { value: 'openai', label: 'OpenAI', url: 'https://api.openai.com/v1' },
  { value: 'anthropic', label: 'Anthropic', url: 'https://api.anthropic.com' },
  { value: 'gemini', label: 'Gemini', url: '' },
  { value: 'custom', label: '自定义', url: '' },
]

interface FallbackFormRow extends FallbackLLMConfig {
  showKey: boolean
}

function ModelCenterTab() {
  const { customLLMConfig, setCustomLLMConfig } = useAppStore()
  const [modelSubTab, setModelSubTab] = useState<'default' | 'custom'>('default')

  // ── 默认配置 state
  const [serverConfigs, setServerConfigs] = useState<LLMConfig[]>([])
  const [loadingConfigs, setLoadingConfigs] = useState(true)

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
      .then(setServerConfigs)
      .catch(() => {})
      .finally(() => setLoadingConfigs(false))
  }, [])

  // Quick-select provider and auto-fill base URL
  const selectProvider = (val: string) => {
    setProvider(val)
    const preset = PROVIDERS.find(p => p.value === val)
    if (preset?.url) setBaseUrl(preset.url)
    else if (val !== 'custom') setBaseUrl('')
  }

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
          默认配置
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
        <div>
          {loadingConfigs ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>加载中…</p>
          ) : serverConfigs.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>暂无服务端模型配置，请联系管理员添加。</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {serverConfigs.map(cfg => (
                <div key={cfg.id} className={styles.fallbackCard}>
                  <div className={styles.fallbackCardHead}>
                    <span className={styles.fallbackProviderBadge}>{providerLabel(cfg.provider)}</span>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
                      {cfg.name}
                    </span>
                    {cfg.is_default && (
                      <span style={{
                        fontSize: 11, padding: '2px 8px', borderRadius: 999,
                        background: 'rgba(82,200,120,0.12)', color: '#52c878',
                        border: '1px solid rgba(82,200,120,0.3)',
                      }}>默认</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {cfg.model}{cfg.context_limit ? ` · ${(cfg.context_limit / 1000).toFixed(0)}k ctx` : ''}
                    {cfg.base_url ? ` · ${cfg.base_url}` : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className={styles.formHint} style={{ marginTop: 14 }}>
            以上模型由服务端管理员统一配置，连接账号后即可使用，无需填写 API Key。
            若需使用自己的密钥，请切换到「自定义配置」标签页。
          </p>
        </div>
      )}

      {/* ── 自定义配置 ── */}
      {modelSubTab === 'custom' && (
        <div className={styles.customForm}>
          {/* Provider 快捷选择 */}
          <div className={styles.formRow}>
            <label className={styles.formLabel}>API Base URL</label>
            <div className={styles.urlQuickBtns} style={{ marginBottom: 6 }}>
              {PROVIDERS.filter(p => p.url).map(p => (
                <button
                  key={p.value}
                  className={`${styles.quickBtn} ${provider === p.value ? styles.quickBtnActive : ''}`}
                  onClick={() => selectProvider(p.value)}>
                  {p.label}
                </button>
              ))}
              <button
                className={`${styles.quickBtn} ${provider === 'custom' ? styles.quickBtnActive : ''}`}
                onClick={() => selectProvider('custom')}>
                自定义
              </button>
            </div>
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
              <label className={styles.formLabel}>最大 Tokens</label>
              <input
                className={styles.formInput}
                type="number"
                min={1024}
                step={1024}
                value={contextLimit}
                onChange={e => setContextLimit(Number(e.target.value))}
              />
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
                  <div className={styles.fallbackProvTabs}>
                    {PROVIDERS.map(p => (
                      <button
                        key={p.value}
                        className={`${styles.fallbackProvTab} ${fb.provider === p.value ? styles.fallbackProvTabActive : ''}`}
                        onClick={() => updateFallback(i, {
                          provider: p.value,
                          base_url: p.url || fb.base_url,
                        })}>
                        {p.label}
                      </button>
                    ))}
                  </div>
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
            {customLLMConfig.enabled && (
              <button
                style={{ padding: '9px 16px', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                onClick={handleDisable}>
                停用自定义
              </button>
            )}
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
  const { token, serverUrl, customLLMConfig, setAppTimezone } = useAppStore()
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
          <span className={`${styles.infoVal} ${styles.highlight}`}>—</span>
        </div>
        <div className={styles.infoRow}>
          <span className={styles.infoKey}>创作点</span>
          <span className={`${styles.infoVal} ${styles.highlight}`}>—</span>
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
