import { useEffect, useState } from 'react'
import {
  listLLMConfigs, createLLMConfig, updateLLMConfig, deleteLLMConfig, testLLMConfig, getLLMConfigApiKey,
  type LLMConfig, type CreateLLMConfigBody, type UpdateLLMConfigBody,
} from '../api/models'
import styles from './ModelsPage.module.css'

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
          <select className={styles.input} value={form.provider} onChange={field('provider')}>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="gemini">Gemini (Google)</option>
            <option value="deepseek">DeepSeek</option>
            <option value="qwen">通义千问 (Qwen)</option>
            <option value="zhipu">智谱 GLM</option>
            <option value="minimax">MiniMax</option>
            <option value="moonshot">月之暗面 (Moonshot)</option>
            <option value="yi">零一万物 (Yi)</option>
            <option value="groq">Groq</option>
            <option value="mistral">Mistral</option>
            <option value="xai">xAI (Grok)</option>
            <option value="openrouter">OpenRouter</option>
            <option value="ollama">Ollama</option>
            <option value="custom">自定义</option>
          </select>
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
