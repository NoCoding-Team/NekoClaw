import { useState, useCallback } from 'react'
import styles from './PersonalizationPanel.module.css'
import { useAppStore, PersonalizationConfig } from '../../store/app'

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
  const { personalizationConfig, setPersonalizationConfig } = useAppStore()
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

  const toggleTrait = (t: string) =>
    setTraits((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t])

  const handleGenerate = useCallback(() => {
    const newCfg: PersonalizationConfig = {
      userName, timezone, notes, catName, bioType, vibe, catEmoji,
      traits, replyStyle, customPrompt, systemPrompt: '',
    }
    newCfg.systemPrompt = buildSystemPrompt(newCfg)
    setPersonalizationConfig(newCfg)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }, [userName, timezone, notes, catName, bioType, vibe, catEmoji,
      traits, replyStyle, customPrompt, setPersonalizationConfig])

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
                <div className={styles.cardDesc}>填写你的基本信息，让螃蟹更懂你。</div>
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

          {/* 螃蟹身份 */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.cardIcon}>🦀</span>
              <div>
                <div className={styles.cardTitle}>螃蟹身份</div>
                <div className={styles.cardDesc}>定义螃蟹的名字和形象。</div>
              </div>
            </div>
            <div className={styles.fields}>
              <label className={styles.label}>螃蟹昵称</label>
              <input className={styles.input} placeholder="例如：小蟹、蟹老板" value={catName} onChange={e => setCatName(e.target.value)} />
              <label className={styles.label}>生物类型</label>
              <input className={styles.input} placeholder="例如：AI、robot、familiar" value={bioType} onChange={e => setBioType(e.target.value)} />
              <label className={styles.label}>气质风格</label>
              <input className={styles.input} placeholder="例如：sharp、warm、chaotic、calm" value={vibe} onChange={e => setVibe(e.target.value)} />
              <label className={styles.label}>代表 Emoji</label>
              <input className={styles.input} placeholder="选一个代表螃蟹的 emoji" value={catEmoji} onChange={e => setCatEmoji(e.target.value)} />
            </div>
          </div>
        </div>

        {/* 性格与行为 */}
        <div className={`${styles.card} ${styles.cardFull}`}>
          <div className={styles.cardHeader}>
            <span className={styles.cardIcon}>✨</span>
            <div>
              <div className={styles.cardTitle}>性格与行为</div>
              <div className={styles.cardDesc}>定义螃蟹的性格和回复方式。</div>
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
              placeholder="自由描述你希望螃蟹的性格、说话方式、工作逻辑。"
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
