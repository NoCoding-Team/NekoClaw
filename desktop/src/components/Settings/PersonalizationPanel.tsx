import { useState, useCallback, useEffect } from 'react'
import styles from './PersonalizationPanel.module.css'
import { useAppStore, PersonalizationConfig } from '../../store/app'
import { apiFetch } from '../../api/apiFetch'

const TRAIT_OPTIONS = ['活泼开朗', '沉稳专业', '幽默风趣', '严谨细致', '温暖贴心']
const REPLY_STYLES = [
  { value: '',     label: '-- 不指定 --' },
  { value: '简洁直接', label: '简洁直接' },
  { value: '详尽全面', label: '详尽全面' },
  { value: '友好亲切', label: '友好亲切' },
  { value: '专业正式', label: '专业正式' },
]

export function buildSystemPrompt(cfg: PersonalizationConfig): string {
  const parts: string[] = []
  if (cfg.catName)  parts.push(`你的名字是「${cfg.catName}」。`)
  if (cfg.bioType)  parts.push(`你的生物类型是 ${cfg.bioType}。`)
  if (cfg.vibe)     parts.push(`你的气质风格：${cfg.vibe}。`)
  if (cfg.catEmoji) parts.push(`你的代表符号是 ${cfg.catEmoji}。`)
  if (cfg.traits.length) parts.push(`性格特质：${cfg.traits.join('、')}。`)
  if (cfg.replyStyle) parts.push(`请以「${cfg.replyStyle}」的风格回复。`)
  if (cfg.customPrompt.trim()) parts.push(cfg.customPrompt.trim())
  if (cfg.userName) parts.push(`\n用户姓名：${cfg.userName}。`)
  if (cfg.timezone) parts.push(`用户所在时区：${cfg.timezone}。`)
  if (cfg.notes.trim()) parts.push(`关于用户：${cfg.notes.trim()}`)
  return parts.join('\n')
}

export function PersonalizationPanel() {
  const { personalizationConfig, setPersonalizationConfig, serverUrl } = useAppStore()
  const cfg = personalizationConfig

  const [userName,     setUserName]     = useState(cfg?.userName     ?? '')
  const [timezone,     setTimezone]     = useState(cfg?.timezone     ?? '')
  const [notes,        setNotes]        = useState(cfg?.notes        ?? '')
  const [catName,      setCatName]      = useState(cfg?.catName      ?? '')
  const [bioType,      setBioType]      = useState(cfg?.bioType      ?? '')
  const [vibe,         setVibe]         = useState(cfg?.vibe         ?? '')
  const [catEmoji,     setCatEmoji]     = useState(cfg?.catEmoji     ?? '')
  const [traits,       setTraits]       = useState<string[]>(cfg?.traits ?? [])
  const [replyStyle,   setReplyStyle]   = useState(cfg?.replyStyle   ?? '')
  const [customPrompt, setCustomPrompt] = useState(cfg?.customPrompt ?? '')
  const [saved,        setSaved]        = useState(false)

  // ── 从记忆文件加载配置 ─────────────────────────────────────────────────
  useEffect(() => {
    if (!serverUrl) return
    const load = async () => {
      try {
        const res = await apiFetch(`${serverUrl}/api/memory/files/USER.md`)
        if (res.ok) {
          const { content } = await res.json() as { content: string }
          const name = content.match(/^- Name: (.+)$/m)?.[1]?.trim()
          const tz   = content.match(/^- Timezone: (.+)$/m)?.[1]?.trim()
          const notesMatch = content.match(/^## Notes\n([\s\S]*)$/m)
          const notes = notesMatch ? notesMatch[1].trim() : content.match(/^- Notes: (.+)$/m)?.[1]?.trim()
          if (name)  setUserName(name)
          if (tz)    setTimezone(tz)
          if (notes) setNotes(notes)
        }
      } catch { /* ignore */ }
      try {
        const res = await apiFetch(`${serverUrl}/api/memory/files/IDENTITY.md`)
        if (res.ok) {
          const { content } = await res.json() as { content: string }
          const name     = content.match(/^- Name: (.+)$/m)?.[1]?.trim()
          const creature = content.match(/^- Creature: (.+)$/m)?.[1]?.trim()
          const vibe     = content.match(/^- Vibe: (.+)$/m)?.[1]?.trim()
          const emoji    = content.match(/^- Emoji: (.+)$/m)?.[1]?.trim()
          if (name)     setCatName(name)
          if (creature) setBioType(creature)
          if (vibe)     setVibe(vibe)
          if (emoji)    setCatEmoji(emoji)
        }
      } catch { /* ignore */ }
      try {
        const res = await apiFetch(`${serverUrl}/api/memory/files/SOUL.md`)
        if (res.ok) {
          const { content } = await res.json() as { content: string }
          const traitsStr  = content.match(/^- Traits: (.+)$/m)?.[1]?.trim()
          const replyStr   = content.match(/^- Reply style: (.+)$/m)?.[1]?.trim()
          const customMatch = content.match(/^## Custom Instructions\n([\s\S]*)$/m)
          const custom = customMatch ? customMatch[1].trim() : undefined
          if (traitsStr) setTraits(traitsStr.split('、').filter(Boolean))
          if (replyStr)  setReplyStyle(replyStr)
          if (custom)    setCustomPrompt(custom)
        }
      } catch { /* ignore */ }
    }
    load()
  }, [serverUrl])

  const toggleTrait = (t: string) =>
    setTraits((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t])

  const handleGenerate = useCallback(async () => {
    const newCfg: PersonalizationConfig = {
      userName, timezone, notes, catName, bioType, vibe, catEmoji,
      traits, replyStyle, customPrompt, systemPrompt: '',
    }
    newCfg.systemPrompt = buildSystemPrompt(newCfg)
    setPersonalizationConfig(newCfg)

    // 同步写入记忆文件
    if (serverUrl) {
      const userLines = ['# USER.md']
      if (userName) userLines.push(`- Name: ${userName}`)
      if (timezone) userLines.push(`- Timezone: ${timezone}`)
      if (notes.trim()) { userLines.push(''); userLines.push('## Notes'); userLines.push(notes.trim()) }
      const userContent = userLines.join('\n')

      const idLines = ['# IDENTITY.md']
      if (catName)  idLines.push(`- Name: ${catName}`)
      if (bioType)  idLines.push(`- Creature: ${bioType}`)
      if (vibe)     idLines.push(`- Vibe: ${vibe}`)
      if (catEmoji) idLines.push(`- Emoji: ${catEmoji}`)
      const identityContent = idLines.join('\n')

      const soulLines = ['# SOUL.md']
      if (traits.length) soulLines.push(`- Traits: ${traits.join('、')}`)
      if (replyStyle)    soulLines.push(`- Reply style: ${replyStyle}`)
      if (customPrompt.trim()) { soulLines.push(''); soulLines.push('## Custom Instructions'); soulLines.push(customPrompt.trim()) }
      const soulContent = soulLines.join('\n')

      await Promise.allSettled([
        apiFetch(`${serverUrl}/api/memory/files/USER.md`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: userContent }),
        }),
        apiFetch(`${serverUrl}/api/memory/files/IDENTITY.md`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: identityContent }),
        }),
        apiFetch(`${serverUrl}/api/memory/files/SOUL.md`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: soulContent }),
        }),
      ])
    }

    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }, [userName, timezone, notes, catName, bioType, vibe, catEmoji,
      traits, replyStyle, customPrompt, setPersonalizationConfig, serverUrl])

  return (
    <div className={styles.panel}>
      <div className={styles.topBar}>
        <span className={styles.topTitle}>个性化设置</span>
        <div className={styles.windowControls}>
          <button onClick={() => window.nekoBridge?.window.minimize()}>─</button>
          <button onClick={() => window.nekoBridge?.window.maximize()}>□</button>
          <button className={styles.closeBtn} onClick={() => window.nekoBridge?.window.close()}>✕</button>
        </div>
      </div>

      <div className={styles.body}>
        <div className={styles.grid2}>

          {/* 关于你 */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.cardIcon}>💜</span>
              <div>
                <div className={styles.cardTitle}>关于你</div>
                <div className={styles.cardDesc}>填写你的基本信息，让猫咪更懂你。</div>
              </div>
            </div>
            <div className={styles.fields}>
              <label className={styles.label}>你的姓名</label>
              <input className={styles.input} placeholder="例如：小明" value={userName} onChange={e => setUserName(e.target.value)} />
              <label className={styles.label}>时区</label>
              <input className={styles.input} placeholder="例如：Asia/Shanghai" value={timezone} onChange={e => setTimezone(e.target.value)} />
              <label className={styles.label}>备注</label>
              <textarea className={styles.textarea} placeholder="你关心什么、在做什么项目、有什么偏好…" value={notes} onChange={e => setNotes(e.target.value)} rows={4} />
            </div>
          </div>

          {/* 猫咪身份 */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.cardIcon}>🐱</span>
              <div>
                <div className={styles.cardTitle}>猫咪身份</div>
                <div className={styles.cardDesc}>定义猫咪助手的名字和形象。</div>
              </div>
            </div>
            <div className={styles.fields}>
              <label className={styles.label}>猫咪昵称</label>
              <input className={styles.input} placeholder="例如：小蟹、蟹老板" value={catName} onChange={e => setCatName(e.target.value)} />
              <label className={styles.label}>生物类型</label>
              <input className={styles.input} placeholder="例如：AI、robot、familiar" value={bioType} onChange={e => setBioType(e.target.value)} />
              <label className={styles.label}>气质风格</label>
              <input className={styles.input} placeholder="例如：sharp、warm、chaotic、calm" value={vibe} onChange={e => setVibe(e.target.value)} />
              <label className={styles.label}>代表 Emoji</label>
              <input className={styles.input} placeholder="选一个代表猫咪的 emoji 🐾" value={catEmoji} onChange={e => setCatEmoji(e.target.value)} />
            </div>
          </div>
        </div>

        {/* 性格与行为 */}
        <div className={`${styles.card} ${styles.cardFull}`}>
          <div className={styles.cardHeader}>
            <span className={styles.cardIcon}>🐾</span>
            <div>
              <div className={styles.cardTitle}>性格与行为</div>
              <div className={styles.cardDesc}>定义猫咪的性格和回复方式。</div>
            </div>
          </div>
          <div className={styles.fields}>
            <label className={styles.label}>性格特质</label>
            <div className={styles.chips}>
              {TRAIT_OPTIONS.map((t) => (
                <button
                  key={t}
                  className={`${styles.chip} ${traits.includes(t) ? styles.chipActive : ''}`}
                  onClick={() => toggleTrait(t)}
                >
                  {t}
                </button>
              ))}
            </div>
            <label className={styles.label}>回复风格</label>
            <select className={styles.select} value={replyStyle} onChange={e => setReplyStyle(e.target.value)}>
              {REPLY_STYLES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <label className={styles.label}>自定义指令</label>
            <textarea
              className={`${styles.textarea} ${styles.textareaLg}`}
              placeholder="自由描述你希望猫咪的性格、说话方式、工作逻辑。"
              value={customPrompt}
              onChange={e => setCustomPrompt(e.target.value)}
              rows={5}
            />
          </div>
        </div>
      </div>

      {/* 生成配置 footer */}
      <div className={styles.footer}>
        <div className={styles.footerMeta}>
          <span className={styles.footerTitle}>生成配置</span>
          <span className={styles.footerDesc}>AI 会将你的偏好智能合并到配置文件中</span>
        </div>
        <button
          className={`${styles.generateBtn} ${saved ? styles.generateBtnOk : ''}`}
          onClick={handleGenerate}
        >
          {saved ? '已保存 ✓' : '生成配置'}
        </button>
      </div>
    </div>
  )
}
