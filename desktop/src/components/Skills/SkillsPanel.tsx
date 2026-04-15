import React, { useEffect, useState, useCallback } from 'react'
import styles from './SkillsPanel.module.css'
import { useAppStore } from '../../store/app'
import { useToast, throwIfError } from '../../hooks/useToast'
import Toast from '../Toast/Toast'

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

interface LocalSkill {
  id: string
  name: string
  icon: string
  system_prompt: string
  allowed_tools: string[]
  sandbox_level: string
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
  const [localSkills, setLocalSkills] = useState<LocalSkill[]>([])
  const [dataPath, setDataPath] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingLocalId, setEditingLocalId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [isLocalForm, setIsLocalForm] = useState(false)
  const [form, setForm] = useState({ ...DEFAULT_FORM })
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [deleteLocalTarget, setDeleteLocalTarget] = useState<string | null>(null)
  const { toast, showToast, dismissToast } = useToast()
  const [saving, setSaving] = useState(false)

  // Load userData path for local file storage
  useEffect(() => {
    window.nekoBridge?.app?.getDataPath()
      .then(p => setDataPath(p))
      .catch(() => {})
  }, [])

  const localSkillPath = dataPath
    ? dataPath.replace(/\\/g, '/') + '/neko_local_skills.json'
    : null

  const loadLocalSkills = useCallback(async () => {
    if (!localSkillPath) return
    try {
      const res = await window.nekoBridge.file.read(localSkillPath)
      if (res.content) setLocalSkills(JSON.parse(res.content))
    } catch { setLocalSkills([]) }
  }, [localSkillPath])

  useEffect(() => { loadLocalSkills() }, [loadLocalSkills])

  const saveLocalSkills = async (updated: LocalSkill[]) => {
    if (!localSkillPath) return
    setLocalSkills(updated)
    await window.nekoBridge.file.write(localSkillPath, JSON.stringify(updated, null, 2))
  }

  const fetchSkills = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const res = await fetch(`${serverUrl}/api/skills`, { headers: { Authorization: `Bearer ${token}` } })
      await throwIfError(res)
      setSkills(await res.json())
    } catch (e: any) {
      showToast(e.message)
    } finally {
      setLoading(false)
    }
  }, [token, serverUrl])

  useEffect(() => { fetchSkills() }, [fetchSkills])

  function openCreate() {
    setEditingId(null)
    setEditingLocalId(null)
    setIsLocalForm(false)
    setForm({ ...DEFAULT_FORM })
    setShowForm(true)
  }

  function openCreateLocal() {
    setEditingId(null)
    setEditingLocalId(null)
    setIsLocalForm(true)
    setForm({ ...DEFAULT_FORM })
    setShowForm(true)
  }

  function openEdit(skill: Skill) {
    if (skill.is_builtin) return
    setEditingLocalId(null)
    setEditingId(skill.id)
    setIsLocalForm(false)
    setForm({
      name: skill.name,
      icon: skill.icon,
      system_prompt: skill.system_prompt,
      allowed_tools: skill.allowed_tools,
      sandbox_level: skill.sandbox_level,
    })
    setShowForm(true)
  }

  function openEditLocal(skill: LocalSkill) {
    setEditingId(null)
    setEditingLocalId(skill.id)
    setIsLocalForm(true)
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
      showToast('名称和系统提示不能为空')
      return
    }
    setSaving(true)
    try {
      if (isLocalForm) {
        // Save to local file
        if (editingLocalId) {
          await saveLocalSkills(localSkills.map(s =>
            s.id === editingLocalId ? { ...s, ...form } : s
          ))
        } else {
          const newSkill: LocalSkill = {
            id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            ...form,
            created_at: new Date().toISOString(),
          }
          await saveLocalSkills([...localSkills, newSkill])
        }
      } else {
        const url = editingId
          ? `${serverUrl}/api/skills/${editingId}`
          : `${serverUrl}/api/skills`
        const method = editingId ? 'PUT' : 'POST'
        const res = await fetch(url, {
          method,
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        await throwIfError(res)
        fetchSkills()
      }
      setShowForm(false)
    } catch (e: any) {
      showToast(e.message)
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
      await throwIfError(res)
      setSkills(prev => prev.filter(s => s.id !== id))
      setDeleteTarget(null)
      if (activeSkillId === id) setActiveSkillId(null)
    } catch (e: any) {
      showToast(e.message)
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
      <Toast message={toast} onClose={dismissToast} />
      <div className={styles.header}>
        <span className={styles.title}>技能库</span>
        <div className={styles.headerActions}>
          <button className={styles.btnSecondary} onClick={openCreateLocal}>+ 本地技能</button>
          <button className={styles.btnPrimary} onClick={openCreate}>+ 新建技能</button>
        </div>
      </div>

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

          {localSkills.length > 0 && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>本地技能</div>
              <div className={styles.cards}>
                {localSkills.map(skill => (
                  <SkillCard
                    key={skill.id}
                    skill={{ ...skill, is_builtin: false, owner_id: null }}
                    active={activeSkillId === skill.id}
                    onSelect={() => setActiveSkillId(skill.id)}
                    onEdit={() => openEditLocal(skill)}
                    onDelete={() => setDeleteLocalTarget(skill.id)}
                    isLocal
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 本地技能删除确认 */}
      {deleteLocalTarget && (
        <div className={styles.overlay}>
          <div className={styles.deleteDialog}>
            <p>确认删除这个本地技能？</p>
            <div className={styles.dialogActions}>
              <button className={styles.btnDanger} onClick={async () => {
                await saveLocalSkills(localSkills.filter(s => s.id !== deleteLocalTarget))
                setDeleteLocalTarget(null)
                if (activeSkillId === deleteLocalTarget) setActiveSkillId(null)
              }}>删除</button>
              <button className={styles.btnSecondary} onClick={() => setDeleteLocalTarget(null)}>取消</button>
            </div>
          </div>
        </div>
      )}

      {/* 创建/编辑表单 */}
      {showForm && (
        <div className={styles.overlay}>
          <div className={styles.formDialog}>
            <div className={styles.formHeader}>
              <span>{isLocalForm ? (editingLocalId ? '编辑本地技能' : '新建本地技能') : (editingId ? '编辑技能' : '新建技能')}</span>
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
  skill, active, onSelect, onEdit, onDelete, isBuiltin = false, isLocal = false,
}: {
  skill: Skill
  active: boolean
  onSelect: () => void
  onEdit: () => void
  onDelete: () => void
  isBuiltin?: boolean
  isLocal?: boolean
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
          {isLocal && <span className={styles.localBadge}>本地</span>}
        </div>
      </div>
      {!isBuiltin && (
        <div className={styles.cardActions} onClick={e => e.stopPropagation()}>
          <button className={styles.icnBtn} onClick={onEdit} title="编辑">✏️</button>
          <button className={styles.icnBtn} onClick={onDelete} title="删除">🗑</button>
        </div>
      )}
    </div>
  )
}
