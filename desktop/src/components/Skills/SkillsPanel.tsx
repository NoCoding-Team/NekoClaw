import React, { useEffect, useState, useCallback } from 'react'
import styles from './SkillsPanel.module.css'
import { useAppStore } from '../../store/app'

interface Skill {
  id: string
  name: string
  icon: string
  system_prompt: string
  allowed_tools: string[]
  sandbox_level: string
  is_builtin: boolean
  owner_id: number | null
  created_at: string
}

const ALL_TOOLS = [
  'file_read', 'file_write', 'file_list', 'file_delete',
  'shell_exec', 'browser_navigate', 'browser_screenshot', 'browser_click', 'browser_type',
  'web_search', 'http_request',
]

const SANDBOX_LEVELS = ['HIGH', 'MEDIUM', 'LOW']

const DEFAULT_FORM = {
  name: '',
  icon: '🤖',
  system_prompt: '',
  allowed_tools: [] as string[],
  sandbox_level: 'MEDIUM',
}

export default function SkillsPanel() {
  const { token, serverUrl, activeSkillId, setActiveSkillId } = useAppStore()
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ ...DEFAULT_FORM })
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchSkills = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${serverUrl}/api/skills`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error(await res.text())
      setSkills(await res.json())
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [token, serverUrl])

  useEffect(() => { fetchSkills() }, [fetchSkills])

  function openCreate() {
    setEditingId(null)
    setForm({ ...DEFAULT_FORM })
    setShowForm(true)
  }

  function openEdit(skill: Skill) {
    if (skill.is_builtin) return
    setEditingId(skill.id)
    setForm({
      name: skill.name,
      icon: skill.icon,
      system_prompt: skill.system_prompt,
      allowed_tools: skill.allowed_tools,
      sandbox_level: skill.sandbox_level,
    })
    setShowForm(true)
  }

  async function handleSave() {
    if (!form.name.trim() || !form.system_prompt.trim()) {
      setError('名称和系统提示不能为空')
      return
    }
    setSaving(true)
    setError('')
    try {
      const url = editingId
        ? `${serverUrl}/api/skills/${editingId}`
        : `${serverUrl}/api/skills`
      const method = editingId ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error(await res.text())
      setShowForm(false)
      fetchSkills()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`${serverUrl}/api/skills/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(await res.text())
      setSkills(prev => prev.filter(s => s.id !== id))
      setDeleteTarget(null)
      if (activeSkillId === id) setActiveSkillId(null)
    } catch (e: any) {
      setError(e.message)
    }
  }

  function toggleTool(tool: string) {
    setForm(prev => ({
      ...prev,
      allowed_tools: prev.allowed_tools.includes(tool)
        ? prev.allowed_tools.filter(t => t !== tool)
        : [...prev.allowed_tools, tool],
    }))
  }

  const builtins = skills.filter(s => s.is_builtin)
  const custom = skills.filter(s => !s.is_builtin)

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>技能库</span>
        <button className={styles.btnPrimary} onClick={openCreate}>+ 新建技能</button>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {loading ? (
        <div className={styles.loading}>加载中…</div>
      ) : (
        <div className={styles.skillList}>
          {builtins.length > 0 && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>内置技能</div>
              <div className={styles.cards}>
                {builtins.map(skill => (
                  <SkillCard
                    key={skill.id}
                    skill={skill}
                    active={activeSkillId === skill.id}
                    onSelect={() => setActiveSkillId(skill.id)}
                    onEdit={() => {}}
                    onDelete={() => {}}
                    isBuiltin
                  />
                ))}
              </div>
            </div>
          )}

          <div className={styles.section}>
            <div className={styles.sectionTitle}>自定义技能</div>
            {custom.length === 0 ? (
              <div className={styles.empty}>暂无自定义技能，点击「新建技能」创建</div>
            ) : (
              <div className={styles.cards}>
                {custom.map(skill => (
                  <SkillCard
                    key={skill.id}
                    skill={skill}
                    active={activeSkillId === skill.id}
                    onSelect={() => setActiveSkillId(skill.id)}
                    onEdit={() => openEdit(skill)}
                    onDelete={() => setDeleteTarget(skill.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 创建/编辑表单 */}
      {showForm && (
        <div className={styles.overlay}>
          <div className={styles.formDialog}>
            <div className={styles.formHeader}>
              <span>{editingId ? '编辑技能' : '新建技能'}</span>
              <button className={styles.closeBtn} onClick={() => setShowForm(false)}>✕</button>
            </div>

            <div className={styles.formBody}>
              <div className={styles.row}>
                <label>图标</label>
                <input
                  className={styles.iconInput}
                  value={form.icon}
                  onChange={e => setForm(p => ({ ...p, icon: e.target.value }))}
                  maxLength={2}
                />
                <input
                  className={styles.nameInput}
                  placeholder="技能名称"
                  value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                />
              </div>

              <div className={styles.field}>
                <label>系统提示词</label>
                <textarea
                  className={styles.promptArea}
                  value={form.system_prompt}
                  onChange={e => setForm(p => ({ ...p, system_prompt: e.target.value }))}
                  placeholder="你是一位专业的…"
                  rows={6}
                />
              </div>

              <div className={styles.field}>
                <label>允许使用的工具</label>
                <div className={styles.toolGrid}>
                  {ALL_TOOLS.map(tool => (
                    <label key={tool} className={styles.toolLabel}>
                      <input
                        type="checkbox"
                        checked={form.allowed_tools.includes(tool)}
                        onChange={() => toggleTool(tool)}
                      />
                      <span>{tool}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className={styles.field}>
                <label>沙盒级别</label>
                <div className={styles.radioGroup}>
                  {SANDBOX_LEVELS.map(level => (
                    <label key={level} className={styles.radioLabel}>
                      <input
                        type="radio"
                        name="sandbox"
                        value={level}
                        checked={form.sandbox_level === level}
                        onChange={() => setForm(p => ({ ...p, sandbox_level: level }))}
                      />
                      <span className={styles[`sandbox${level}` as keyof typeof styles]}>{level}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {error && <div className={styles.formError}>{error}</div>}

            <div className={styles.formFooter}>
              <button className={styles.btnPrimary} onClick={handleSave} disabled={saving}>
                {saving ? '保存中…' : '保存'}
              </button>
              <button className={styles.btnSecondary} onClick={() => setShowForm(false)}>取消</button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认 */}
      {deleteTarget && (
        <div className={styles.overlay}>
          <div className={styles.deleteDialog}>
            <p>确认删除这个技能？</p>
            <div className={styles.dialogActions}>
              <button className={styles.btnDanger} onClick={() => handleDelete(deleteTarget)}>删除</button>
              <button className={styles.btnSecondary} onClick={() => setDeleteTarget(null)}>取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SkillCard({
  skill, active, onSelect, onEdit, onDelete, isBuiltin = false,
}: {
  skill: Skill
  active: boolean
  onSelect: () => void
  onEdit: () => void
  onDelete: () => void
  isBuiltin?: boolean
}) {
  return (
    <div className={`${styles.card} ${active ? styles.cardActive : ''}`} onClick={onSelect}>
      <div className={styles.cardIcon}>{skill.icon}</div>
      <div className={styles.cardBody}>
        <div className={styles.cardName}>{skill.name}</div>
        <div className={styles.cardMeta}>
          <span className={styles.sandboxBadge} data-level={skill.sandbox_level}>
            {skill.sandbox_level}
          </span>
          <span className={styles.toolCount}>{skill.allowed_tools.length} 工具</span>
          {isBuiltin && <span className={styles.builtinBadge}>内置</span>}
        </div>
      </div>
      {!isBuiltin && (
        <div className={styles.cardActions} onClick={e => e.stopPropagation()}>
          <button className={styles.icnBtn} onClick={onEdit} title="编辑">✏</button>
          <button className={styles.icnBtn} onClick={onDelete} title="删除">🗑</button>
        </div>
      )}
    </div>
  )
}
