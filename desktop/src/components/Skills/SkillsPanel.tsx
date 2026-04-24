import { useState, useEffect, useRef } from 'react'
import styles from './SkillsPanel.module.css'
import { fetchSkills, toggleSkill, installSkill, deleteSkill, type SkillInfo } from '../../api/skills'

export default function SkillsPanel() {
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [installing, setInstalling] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = async () => {
    try {
      setLoading(true)
      const list = await fetchSkills()
      setSkills(list)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleToggle = async (skill: SkillInfo) => {
    const next = !skill.enabled
    // Optimistic update
    setSkills(prev => prev.map(s => s.key === skill.key ? { ...s, enabled: next } : s))
    try {
      await toggleSkill(skill.key, next)
    } catch {
      // Revert on error
      setSkills(prev => prev.map(s => s.key === skill.key ? { ...s, enabled: !next } : s))
    }
  }

  const handleDelete = async (skill: SkillInfo) => {
    if (!confirm(`确定要删除技能「${skill.name}」吗？`)) return
    try {
      await deleteSkill(skill.key)
      setSkills(prev => prev.filter(s => s.key !== skill.key))
    } catch {
      // silent
    }
  }

  const handleInstall = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      setInstalling(true)
      await installSkill(file)
      await load()
    } catch (err: any) {
      alert(err?.message || '安装失败')
    } finally {
      setInstalling(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <h2 className={styles.title}>技能库</h2>
          <button
            className={styles.installBtn}
            onClick={() => fileRef.current?.click()}
            disabled={installing}
          >
            {installing ? '安装中…' : '＋ 安装技能'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".zip"
            style={{ display: 'none' }}
            onChange={handleInstall}
          />
        </div>
        <p className={styles.subtitle}>技能教会 Agent 如何使用工具完成特定任务，开启的技能会在对话中自动提供给 Agent</p>
      </div>

      {loading ? (
        <div className={styles.loading}>加载中…</div>
      ) : skills.length === 0 ? (
        <div className={styles.empty}>暂无技能，点击「安装技能」上传 .zip 文件</div>
      ) : (
        <div className={styles.list}>
          {skills.map(skill => (
            <div key={skill.key} className={`${styles.card} ${skill.enabled ? styles.cardActive : ''}`}>
              <div className={styles.cardBody}>
                <div className={styles.cardHead}>
                  <span className={styles.cardName}>{skill.name}</span>
                  <span className={`${styles.sourceBadge} ${skill.source === 'builtin' ? styles.badgeBuiltin : styles.badgeUser}`}>
                    {skill.source === 'builtin' ? '内置' : '用户'}
                  </span>
                  <span className={styles.versionTag}>v{skill.version}</span>
                </div>
                <p className={styles.cardDesc}>{skill.description}</p>
                {skill.triggers.length > 0 && (
                  <div className={styles.triggerChips}>
                    {skill.triggers.map(t => (
                      <span key={t} className={styles.chip}>{t}</span>
                    ))}
                  </div>
                )}
              </div>

              <div className={styles.cardRight}>
                <span className={styles.statusLabel}>{skill.enabled ? '已开启' : '未开启'}</span>
                <button
                  role="switch"
                  aria-checked={skill.enabled}
                  className={`${styles.toggle} ${skill.enabled ? styles.toggleOn : ''}`}
                  onClick={() => handleToggle(skill)}
                  title={skill.enabled ? '关闭此技能' : '开启此技能'}
                >
                  <span className={styles.toggleThumb} />
                </button>
                {skill.source === 'user' && (
                  <button
                    className={styles.deleteBtn}
                    onClick={() => handleDelete(skill)}
                    title="删除此技能"
                  >
                    🗑️ 删除
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className={styles.footer}>
        <span className={styles.footerHint}>
          💡 开启的技能会在每次对话中自动提供给 Agent。技能与「能力」不同——能力控制底层工具权限，技能教会 Agent 如何用这些工具完成任务。
        </span>
      </div>
    </div>
  )
}
