import { useEffect, useRef, useState } from 'react'
import {
  listLLMConfigs, createLLMConfig, updateLLMConfig, deleteLLMConfig, testLLMConfig, getLLMConfigApiKey,
  type LLMConfig, type CreateLLMConfigBody, type UpdateLLMConfigBody,
} from '../api/models'
import styles from './ModelsPage.module.css'

// ── Provider icon data ─────────────────────────────────────────────────────
const PROVIDERS_LIST = [
  { value: 'openai',     label: 'OpenAI' },
  { value: 'anthropic',  label: 'Anthropic' },
  { value: 'gemini',     label: 'Gemini (Google)' },
  { value: 'deepseek',   label: 'DeepSeek' },
  { value: 'qwen',       label: '通义千问 (Qwen)' },
  { value: 'zhipu',      label: '智谱 GLM' },
  { value: 'minimax',    label: 'MiniMax' },
  { value: 'moonshot',   label: '月之暗面 (Moonshot)' },
  { value: 'yi',         label: '零一万物 (Yi)' },
  { value: 'groq',       label: 'Groq' },
  { value: 'mistral',    label: 'Mistral' },
  { value: 'xai',        label: 'xAI (Grok)' },
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'ollama',     label: 'Ollama' },
  { value: 'custom',     label: '自定义' },
]

const PROVIDER_ICON_META: Record<string, { abbr: string; bg: string }> = {
  openai:     { abbr: 'OA', bg: '#10a37f' },
  anthropic:  { abbr: 'AN', bg: '#d97757' },
  gemini:     { abbr: 'G',  bg: '#4285F4' },
  deepseek:   { abbr: 'DS', bg: '#5786FE' },
  qwen:       { abbr: 'QW', bg: '#6950EF' },
  zhipu:      { abbr: 'GL', bg: '#2563EB' },
  minimax:    { abbr: 'MM', bg: '#E73562' },
  moonshot:   { abbr: 'KI', bg: '#0F172A' },
  yi:         { abbr: 'Yi', bg: '#0EA5E9' },
  groq:       { abbr: 'GQ', bg: '#F55036' },
  mistral:    { abbr: 'MI', bg: '#FF7000' },
  xai:        { abbr: 'xI', bg: '#111111' },
  openrouter: { abbr: 'OR', bg: '#8B5CF6' },
  ollama:     { abbr: 'OL', bg: '#3B3B3B' },
  custom:     { abbr: '··', bg: '#64748B' },
}

// Simple Icons CDN slugs for providers that have official icons
const SIMPLE_ICONS: Record<string, string> = {
  openai:     'openai',
  anthropic:  'anthropic',
  gemini:     'googlegemini',
  deepseek:   'deepseek',
  qwen:       'qwen',
  minimax:    'minimax',
  groq:       'groq',
  mistral:    'mistralai',
  xai:        'xai',
  openrouter: 'openrouter',
  ollama:     'ollama',
}

function ProviderIcon({ value, size = 20 }: { value: string; size?: number }) {
  const meta = PROVIDER_ICON_META[value] ?? { abbr: '?', bg: '#888' }
  const slug = SIMPLE_ICONS[value]
  const iconSize = Math.round(size * 0.72)
  if (slug) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: size, height: size, borderRadius: 4,
        background: meta.bg, flexShrink: 0, overflow: 'hidden',
      }}>
        <img
          src={`https://cdn.simpleicons.org/${slug}/FFFFFF`}
          width={iconSize} height={iconSize}
          alt={value}
          style={{ display: 'block' }}
        />
      </span>
    )
  }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: size, height: size, borderRadius: 4,
      background: meta.bg, color: '#fff',
      fontSize: Math.round(size * 0.42), fontWeight: 700,
      fontFamily: 'system-ui, monospace', letterSpacing: '-0.5px', flexShrink: 0,
    }}>{meta.abbr}</span>
  )
}

function ProviderSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = PROVIDERS_LIST.find(p => p.value === value) ?? PROVIDERS_LIST[0]

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  return (
    <div ref={ref} className={styles.providerSelect}>
      <div className={styles.providerSelectTrigger} onClick={() => setOpen(o => !o)}>
        <ProviderIcon value={value} size={18} />
        <span style={{ flex: 1 }}>{selected.label}</span>
        <svg className={styles.providerChevron} viewBox="0 0 24 24">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
      {open && (
        <div className={styles.providerDropdown}>
          {PROVIDERS_LIST.map(p => (
            <div
              key={p.value}
              className={`${styles.providerOption} ${p.value === value ? styles.providerOptionActive : ''}`}
              onClick={() => { onChange(p.value); setOpen(false) }}
            >
              <ProviderIcon value={p.value} size={16} />
              <span>{p.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const BLANK: CreateLLMConfigBody = {
  name: '',
  provider: 'openai',
  model: '',
  api_key: '',
  base_url: '',
  is_default: false,
  context_limit: 128000,
}

function ConfigModal({
  initial,
  onSave,
  onClose,
}: {
  initial?: LLMConfig
  onSave: (body: CreateLLMConfigBody | UpdateLLMConfigBody) => Promise<void>
  onClose: () => void
}) {
  const [form, setForm] = useState<CreateLLMConfigBody>(initial ? {
    name: initial.name,
    provider: initial.provider,
    model: initial.model,
    api_key: initial.api_key ?? '',
    base_url: initial.base_url ?? '',
    is_default: initial.is_default,
    context_limit: initial.context_limit,
  } : { ...BLANK })
  const [contextLimitK, setContextLimitK] = useState<number>(
    initial ? Math.max(1, Math.round(initial.context_limit / 1000)) : 128
  )
  const isEditing = Boolean(initial)
  const [showApiKey, setShowApiKey] = useState(false)
  const [loadingApiKey, setLoadingApiKey] = useState(Boolean(initial))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; latency_ms: number | null; error?: string } | null>(null)

  useEffect(() => {
    if (!initial) return
    let cancelled = false
    setLoadingApiKey(true)
    getLLMConfigApiKey(initial.id)
      .then((apiKey) => {
        if (cancelled) return
        setForm((f) => ({ ...f, api_key: apiKey }))
      })
      .catch(() => {
        if (cancelled) return
        setError('加载 API Key 失败，请重试')
      })
      .finally(() => {
        if (!cancelled) setLoadingApiKey(false)
      })
    return () => {
      cancelled = true
    }
  }, [initial?.id])

  function field<K extends keyof CreateLLMConfigBody>(k: K) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const v = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value
      setForm(f => ({ ...f, [k]: v }))
    }
  }

  async function handleTest() {
    const apiKey = (form.api_key ?? '').trim()
    if (!apiKey) {
      setTestResult({ ok: false, latency_ms: null, error: '测试连接需要填写 API Key（留空仅表示保存时不修改）' })
      return
    }
    setTesting(true)
    setTestResult(null)
    try {
      const res = await testLLMConfig({ provider: form.provider, model: form.model, api_key: apiKey, base_url: form.base_url })
      setTestResult(res)
    } catch {
      setTestResult({ ok: false, latency_ms: null, error: '请求失败' })
    } finally {
      setTesting(false)
    }
  }

  async function handleSave() {
    const apiKey = (form.api_key ?? '').trim()
    if (!isEditing && !apiKey) {
      setError('API Key 不能为空')
      return
    }

    setSaving(true)
    setError('')
    try {
      const payload: CreateLLMConfigBody | UpdateLLMConfigBody = {
        ...form,
        context_limit: Math.max(1, Math.round(contextLimitK)) * 1000,
      }
      // Editing: empty API key means keep existing key unchanged.
      if (apiKey) payload.api_key = apiKey
      else delete payload.api_key

      await onSave(payload)
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.modal}>
      <div className={styles.modalCard}>
        <div className={styles.modalTitle}>{initial ? '编辑模型配置' : '添加模型配置'}</div>
        <label className={styles.label}>
          名称
          <input className={styles.input} value={form.name} onChange={field('name')} />
        </label>
        <label className={styles.label}>
          提供商
          <ProviderSelect value={form.provider} onChange={v => setForm(f => ({ ...f, provider: v }))} />
        </label>
        <label className={styles.label}>
          模型 ID
          <input className={styles.input} value={form.model} onChange={field('model')} placeholder="gpt-4o" />
        </label>
        <label className={styles.label}>
          最大 Token（k）
          <div className={styles.inputWithUnit}>
            <input
              className={styles.input}
              type="number"
              min={1}
              step={1}
              value={contextLimitK}
              onChange={(e) => {
                const k = Number(e.target.value)
                setContextLimitK(Number.isFinite(k) && k > 0 ? k : 1)
              }}
            />
            <span className={styles.inputUnit}>k</span>
          </div>
        </label>
        <label className={styles.label}>
          API Key
          <div className={styles.apiKeyField}>
            <input
              className={`${styles.input} ${styles.apiKeyInput}`}
              type={showApiKey ? 'text' : 'password'}
              value={form.api_key ?? ''}
              onChange={field('api_key')}
              placeholder={loadingApiKey ? 'API Key 加载中…' : (isEditing ? '留空表示保持原 API Key 不变' : 'sk-...')}
              disabled={loadingApiKey}
            />
            <button
              type="button"
              className={styles.eyeBtn}
              onClick={() => setShowApiKey(v => !v)}
              disabled={loadingApiKey}
              aria-label={showApiKey ? '隐藏 API Key' : '显示 API Key'}
            >
              {showApiKey ? (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M1.5 12s3.5-7 10.5-7 10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12z" />
                  <circle cx="12" cy="12" r="3.5" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M1.5 12s3.5-7 10.5-7 10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12z" />
                  <circle cx="12" cy="12" r="3.5" />
                  <path d="M4 20L20 4" />
                </svg>
              )}
            </button>
          </div>
        </label>
        <label className={styles.label}>
          Base URL（可选）
          <input className={styles.input} value={form.base_url ?? ''} onChange={field('base_url')} placeholder="https://api.openai.com/v1" />
        </label>
        <label className={styles.checkboxLabel}>
          <input type="checkbox" checked={form.is_default ?? false} onChange={field('is_default')} />
          设为默认模型
        </label>
        {error && <div className={styles.error}>{error}</div>}
        {testResult && (
          <div className={testResult.ok ? styles.testOk : styles.testFail}>
            {testResult.ok
              ? `✓ 连接成功（${testResult.latency_ms}ms）`
              : `✗ 连接失败：${testResult.error}`}
          </div>
        )}
        <div className={styles.modalActions}>
          <button className={styles.btnSecondary} onClick={onClose}>取消</button>
          <button className={styles.btnSecondary} onClick={handleTest} disabled={testing || !form.model || loadingApiKey}>
            {testing ? '测试中…' : '测试连接'}
          </button>
          <button className={styles.btnPrimary} onClick={handleSave} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ModelsPage() {
  const [configs, setConfigs] = useState<LLMConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editTarget, setEditTarget] = useState<LLMConfig | null | 'new'>(null)

  async function load() {
    try {
      setConfigs(await listLLMConfigs())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleSave(body: CreateLLMConfigBody | UpdateLLMConfigBody) {
    if (editTarget === 'new') {
      await createLLMConfig(body as CreateLLMConfigBody)
    } else {
      await updateLLMConfig((editTarget as LLMConfig).id, body as UpdateLLMConfigBody)
    }
    await load()
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`确定删除模型配置 "${name}"？`)) return
    try {
      await deleteLLMConfig(id)
      setConfigs(c => c.filter(x => x.id !== id))
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : '删除失败')
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>模型配置</h1>
        <button className={styles.btnPrimary} onClick={() => setEditTarget('new')}>+ 添加配置</button>
      </div>
      {error && <div className={styles.error}>{error}</div>}
      {loading ? (
        <div className={styles.loading}>加载中…</div>
      ) : (
        <div className={styles.grid}>
          {configs.map(c => (
            <div key={c.id} className={`${styles.card} ${c.is_default ? styles.cardDefault : ''}`}>
              <div className={styles.cardHead}>
                <span className={styles.cardName}>{c.name}</span>
                {c.is_default && <span className={styles.tagDefault}>默认</span>}
              </div>
              <div className={styles.cardMeta}>
                <span>{c.provider}</span>
                <span>·</span>
                <span>{c.model}</span>
                <span>·</span>
                <span>{Math.round(c.context_limit / 1000)}k</span>
              </div>
              {c.base_url && <div className={styles.cardUrl}>{c.base_url}</div>}
              <div className={styles.cardActions}>
                <button className={styles.btnAction} onClick={() => setEditTarget(c)}>编辑</button>
                <button className={styles.btnDanger} onClick={() => handleDelete(c.id, c.name)}>删除</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {editTarget !== null && (
        <ConfigModal
          initial={editTarget === 'new' ? undefined : editTarget}
          onSave={handleSave}
          onClose={() => setEditTarget(null)}
        />
      )}
    </div>
  )
}
