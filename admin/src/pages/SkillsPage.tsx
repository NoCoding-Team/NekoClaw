import { useEffect, useRef, useState } from 'react'
import { listSkills, updateSkill, deleteSkill, uploadSkill, type AdminSkill } from '../api/skills'
import styles from './SkillsPage.module.css'

export default function SkillsPage() {
  const [skills, setSkills] = useState<AdminSkill[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function load() {
    try {
      setSkills(await listSkills())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleToggle(s: AdminSkill) {
    try {
      const updated = await updateSkill(s.name, !s.default_enabled)
      setSkills(prev => prev.map(x => x.name === s.name ? updated : x))
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : '操作失败')
    }
  }

  async function handleDelete(name: string) {
    if (!confirm(`确定删除 Skill "${name}"？此操作会清理所有用户的该 Skill 配置。`)) return
    try {
      await deleteSkill(name)
      setSkills(prev => prev.filter(x => x.name !== name))
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : '删除失败')
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const s = await uploadSkill(file)
      setSkills(prev => {
        const idx = prev.findIndex(x => x.name === s.name)
        if (idx >= 0) {
          const copy = [...prev]
          copy[idx] = s
          return copy
        }
        return [...prev, s]
      })
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : '上传失败')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Skills 管理</h1>
        <button className={styles.btnPrimary} onClick={() => fileRef.current?.click()}>
          上传 Skill
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".zip,.md"
          style={{ display: 'none' }}
          onChange={handleUpload}
        />
      </div>
      {error && <div className={styles.error}>{error}</div>}
      {loading ? (
        <div className={styles.loading}>加载中…</div>
      ) : skills.length === 0 ? (
        <div className={styles.empty}>暂无内置 Skill</div>
      ) : (
        <div className={styles.grid}>
          {skills.map(s => (
            <div key={s.name} className={styles.card}>
              <div className={styles.cardHead}>
                <span className={styles.cardName}>{s.name}</span>
                <button
                  className={`${styles.toggle} ${s.default_enabled ? styles.toggleOn : styles.toggleOff}`}
                  onClick={() => handleToggle(s)}
                  title={s.default_enabled ? '新用户默认开启' : '新用户默认关闭'}
                >
                  {s.default_enabled ? '默认开启' : '默认关闭'}
                </button>
              </div>
              {s.description && <div className={styles.cardDesc}>{s.description}</div>}
              <div className={styles.cardMeta}>
                <span>v{s.version}</span>
                {s.author && <span>· {s.author}</span>}
              </div>
              {s.triggers.length > 0 && (
                <div className={styles.tags}>
                  {s.triggers.map(t => (
                    <span key={t} className={styles.tag}>{t}</span>
                  ))}
                </div>
              )}
              <div className={styles.cardActions}>
                <button className={styles.btnDanger} onClick={() => handleDelete(s.name)}>删除</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
