import React, { useEffect, useState, useRef } from 'react'
import { useAppStore } from '../../store/app'
import styles from './SkillSelector.module.css'

interface SkillOption {
  id: string
  name: string
  icon: string
}

export function SkillSelector() {
  const { token, serverUrl, activeSkillId, setActiveSkillId } = useAppStore()
  const [skills, setSkills] = useState<SkillOption[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!token) return
    fetch(`${serverUrl}/api/skills`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then((data: SkillOption[]) => setSkills(data))
      .catch(() => {})
  }, [token, serverUrl])

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const active = skills.find(s => s.id === activeSkillId)

  return (
    <div className={styles.wrapper} ref={ref}>
      <button className={styles.trigger} onClick={() => setOpen(o => !o)}>
        <span className={styles.icon}>{active?.icon ?? '⚡'}</span>
        <span className={styles.name}>{active?.name ?? '选择技能'}</span>
        <span className={styles.arrow}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className={styles.dropdown}>
          <button
            className={`${styles.option} ${!activeSkillId ? styles.activeOpt : ''}`}
            onClick={() => { setActiveSkillId(null); setOpen(false) }}
          >
            <span className={styles.icon}>✨</span>
            <span>默认（无技能）</span>
          </button>
          {skills.map(s => (
            <button
              key={s.id}
              className={`${styles.option} ${activeSkillId === s.id ? styles.activeOpt : ''}`}
              onClick={() => { setActiveSkillId(s.id); setOpen(false) }}
            >
              <span className={styles.icon}>{s.icon}</span>
              <span>{s.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
