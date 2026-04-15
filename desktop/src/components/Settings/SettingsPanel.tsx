import React, { useState, useRef, useEffect, KeyboardEvent } from 'react'
import { useAppStore, SecurityConfig } from '../../store/app'
import styles from './SettingsPanel.module.css'
import { encryptKey } from '../../hooks/useLocalLLM'

type Tab = 'account' | 'general' | 'models' | 'mcp' | 'im-bot' | 'security' | 'feedback' | 'about'

const APP_VERSION = '0.1.0'

const PROVIDERS = [
  { value: 'openai',    label: 'OpenAI',     placeholder: 'https://api.openai.com/v1' },
  { value: 'anthropic', label: 'Anthropic',  placeholder: 'https://api.anthropic.com' },
  { value: 'custom',    label: '自定义',      placeholder: 'http://localhost:11434/v1' },
]

// ── SecurityTab ────────────────────────────────────────────────────────────────
function SecurityTab() {
  const { securityConfig, setSecurityConfig, toolCallCounts } = useAppStore()
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
      <div className={styles.secBlock}>
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
              {toolCallCounts[tag] ? <span className={styles.tagCount}>{toolCallCounts[tag]}</span> : null}
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

      {/* 沙盒确认阈值 */}
      <SandboxThresholdBlock cfg={cfg} setSecurityConfig={setSecurityConfig} />

    </div>
  )
}

// ── SandboxThresholdBlock ──────────────────────────────────────────────────────
function SandboxThresholdBlock({
  cfg,
  setSecurityConfig,
}: {
  cfg: SecurityConfig
  setSecurityConfig: (patch: Partial<SecurityConfig>) => void
}) {
  const [confirmOff, setConfirmOff] = useState(false)

  type Level = SecurityConfig['sandboxThreshold']
  const levels: { value: Level; label: string; desc: string }[] = [
    { value: 'LOW',    label: '全部确认',    desc: 'LOW 及以上均需确认' },
    { value: 'MEDIUM', label: '中等以上',    desc: 'MEDIUM / HIGH 需要确认（默认）' },
    { value: 'HIGH',   label: '仅高风险',    desc: '仅 HIGH 需要确认，MEDIUM 自动放行' },
    { value: 'off',    label: '关闭沙盒',    desc: '所有工具调用自动执行，无需确认' },
  ]

  const handleSelect = (v: Level) => {
    if (v === 'off') { setConfirmOff(true); return }
    setSecurityConfig({ sandboxThreshold: v })
  }

  return (
    <div className={styles.secBlock}>
      <div className={styles.secBlockHeader}>
        <span className={styles.secBlockTitle}>沙盒确认阈值</span>
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

      {/* 关闭沙盒二次确认 */}
      {confirmOff && (
        <div className={styles.overlay}>
          <div className={styles.confirmDialog}>
            <div className={styles.confirmTitle}>⚠️ 确认关闭沙盒？</div>
            <div className={styles.confirmText}>
              关闭沙盒后，所有工具调用将<strong>自动执行</strong>，无需确认弹窗。
              HIGH 风险操作（删除文件、执行系统命令等）也会直接运行。
            </div>
            <div className={styles.confirmActions}>
              <button
                className={styles.btnDanger}
                onClick={() => { setSecurityConfig({ sandboxThreshold: 'off' }); setConfirmOff(false) }}
              >
                我已知晓，关闭沙盒
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
    if (!localLLMConfig && !apiKey.trim()) { setErr('API Key 不能为空'); return }
    setSaving(true); setErr(''); setOk('')
    try {
      const keyToStore = apiKey.trim()
        ? await encryptKey(apiKey.trim())
        : localLLMConfig?.apiKeyB64 ?? ''

      // Real connectivity test using the plain-text key from input (skip if not re-entering key)
      const testKey = apiKey.trim()
      if (testKey) {
        const resolvedBase = (baseUrl.trim() || (PROVIDERS.find(p => p.value === provider)?.placeholder ?? '')).replace(/\/$/, '')
        const isAnthropic = provider === 'anthropic'
        const testUrl = isAnthropic
          ? resolvedBase + '/v1/messages'
          : resolvedBase + '/chat/completions'
        const testHeaders: Record<string, string> = isAnthropic
          ? { 'Content-Type': 'application/json', 'x-api-key': testKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }
          : { 'Content-Type': 'application/json', 'Authorization': `Bearer ${testKey}` }
        const testBody = JSON.stringify(isAnthropic
          ? { model: model.trim(), max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }
          : { model: model.trim(), max_tokens: 1, messages: [{ role: 'user', content: 'hi' }], stream: false })
        const testRes = await fetch(testUrl, { method: 'POST', headers: testHeaders, body: testBody })
        // 400/422 means server understood the request (auth/format issue), not a network issue
        if (!testRes.ok && testRes.status < 400) {
          throw new Error(`无法连接到 ${resolvedBase}\n请检查 Base URL 和网络`)
        }
        if (testRes.status === 401 || testRes.status === 403) {
          const txt = await testRes.text().catch(() => '')
          throw new Error(`API Key 验证失败 (${testRes.status})：${txt.slice(0, 120)}`)
        }
      }

      setLocalLLMConfig({
        provider,
        baseUrl: baseUrl.trim() || (PROVIDERS.find(p => p.value === provider)?.placeholder ?? ''),
        model: model.trim(),
        apiKeyB64: keyToStore,
        maxTokens: parseInt(maxTokens) || 8192,
        temperature: parseFloat(temperature) || 0.7,
      })
      setOk(testKey ? '连接测试通过，已保存 ✓' : '已保存 ✓')
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
      const res = await fetch(`${serverUrl}/api/auth/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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

            {tab === 'security' && <SecurityTab />}

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
