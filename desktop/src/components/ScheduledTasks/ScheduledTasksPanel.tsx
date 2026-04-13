import React, { useEffect, useState, useCallback } from 'react'
import styles from './ScheduledTasksPanel.module.css'
import { useAppStore } from '../../store/app'
import { useToast, throwIfError } from '../../hooks/useToast'
import Toast from '../Toast/Toast'

interface ScheduledTask {
  id: number
  title: string
  description: string
  cron_expr: string | null
  run_at: string | null
  skill_id: string | null
  is_enabled: boolean
  last_run_at: string | null
  next_run_at: string | null
  run_count: number
  created_at: string
}

const DEFAULT_FORM = {
  title: '',
  description: '',
  type: 'once' as 'once' | 'cron',
  run_at: '',
  cron_expr: '',
  skill_id: null as string | null,
  is_enabled: true,
}

export default function ScheduledTasksPanel() {
  const { token, serverUrl } = useAppStore()
  const [tasks, setTasks] = useState<ScheduledTask[]>([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ ...DEFAULT_FORM })
  const [editingId, setEditingId] = useState<number | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null)
  const { toast, showToast, dismissToast } = useToast()
  const [saving, setSaving] = useState(false)

  const fetchTasks = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const res = await fetch(`${serverUrl}/api/scheduled-tasks`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      await throwIfError(res)
      setTasks(await res.json())
    } catch (e: any) {
      showToast(e.message)
    } finally {
      setLoading(false)
    }
  }, [token, serverUrl])

  useEffect(() => { fetchTasks() }, [fetchTasks])

  // 启动时检查错过的任务
  useEffect(() => {
    const now = new Date()
    const missed = tasks.filter(t => {
      if (!t.is_enabled || !t.run_at) return false
      const runAt = new Date(t.run_at)
      return runAt < now && t.run_count === 0
    })
    if (missed.length > 0) {
      showToast(`检测到 ${missed.length} 个错过的任务，请手动检查或立即执行`)
    }
  }, [tasks])

  function openCreate() {
    setEditingId(null)
    setForm({ ...DEFAULT_FORM })
    setShowForm(true)
  }

  function openEdit(task: ScheduledTask) {
    setEditingId(task.id)
    setForm({
      title: task.title,
      description: task.description,
      type: task.cron_expr ? 'cron' : 'once',
      run_at: task.run_at ? task.run_at.slice(0, 16) : '',
      cron_expr: task.cron_expr ?? '',
      skill_id: task.skill_id,
      is_enabled: task.is_enabled,
    })
    setShowForm(true)
  }

  async function handleSave() {
    if (!form.title.trim() || !form.description.trim()) {
      showToast('标题和描述不能为�?)
      return
    }
    if (form.type === 'once' && !form.run_at) {
      showToast('请选择执行时间')
      return
    }
    if (form.type === 'cron' && !form.cron_expr.trim()) {
      showToast('请输�?Cron 表达�?)
      return
    }

    setSaving(true)
    try {
      const body = {
        title: form.title,
        description: form.description,
        cron_expr: form.type === 'cron' ? form.cron_expr : null,
        run_at: form.type === 'once' ? new Date(form.run_at).toISOString() : null,
        skill_id: form.skill_id,
        is_enabled: form.is_enabled,
      }
      const url = editingId
        ? `${serverUrl}/api/scheduled-tasks/${editingId}`
        : `${serverUrl}/api/scheduled-tasks`
      const res = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      await throwIfError(res)
      setShowForm(false)
      fetchTasks()
    } catch (e: any) {
      showToast(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number) {
    try {
      const res = await fetch(`${serverUrl}/api/scheduled-tasks/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      await throwIfError(res)
      setTasks(prev => prev.filter(t => t.id !== id))
      setDeleteTarget(null)
    } catch (e: any) {
      showToast(e.message)
    }
  }

  async function handleTrigger(id: number) {
    try {
      const res = await fetch(`${serverUrl}/api/scheduled-tasks/${id}/trigger`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      await throwIfError(res)
      fetchTasks()
    } catch (e: any) {
      showToast(e.message)
    }
  }

  async function handleToggle(task: ScheduledTask) {
    try {
      const res = await fetch(`${serverUrl}/api/scheduled-tasks/${task.id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_enabled: !task.is_enabled }),
      })
      await throwIfError(res)
      fetchTasks()
    } catch (e: any) {
      showToast(e.message)
    }
  }

  return (
    <div className={styles.panel}>
      <Toast message={toast} onClose={dismissToast} />
      <div className={styles.header}>
        <span className={styles.title}>定时任务</span>
        <button className={styles.btnPrimary} onClick={openCreate}>+ 新建</button>
      </div>

      {loading ? (
        <div className={styles.loading}>加载中�?/div>
      ) : tasks.length === 0 ? (
        <div className={styles.empty}>暂无定时任务</div>
      ) : (
        <ul className={styles.list}>
          {tasks.map(t => (
            <li key={t.id} className={`${styles.item} ${!t.is_enabled ? styles.disabled : ''}`}>
              <div className={styles.itemHeader}>
                <span className={styles.itemTitle}>{t.title}</span>
                <div className={styles.itemActions}>
                  <button className={styles.icnBtn} onClick={() => handleTrigger(t.id)} title="立即执行">�?/button>
                  <button className={styles.icnBtn} onClick={() => handleToggle(t)} title={t.is_enabled ? '暂停' : '启用'}>
                    {t.is_enabled ? '�? : '▶️'}
                  </button>
                  <button className={styles.icnBtn} onClick={() => openEdit(t)} title="编辑">�?/button>
                  <button className={styles.icnBtn} onClick={() => setDeleteTarget(t.id)} title="删除">🗑</button>
                </div>
              </div>
              <div className={styles.itemDesc}>{t.description}</div>
              <div className={styles.itemMeta}>
                {t.cron_expr && <span className={styles.cronTag}>{t.cron_expr}</span>}
                {t.run_at && <span className={styles.cronTag}>一次�? {new Date(t.run_at).toLocaleString('zh-CN')}</span>}
                <span className={styles.metaItem}>执行 {t.run_count} �?/span>
                {t.last_run_at && (
                  <span className={styles.metaItem}>
                    上次: {new Date(t.last_run_at).toLocaleString('zh-CN')}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* 创建/编辑表单 */}
      {showForm && (
        <div className={styles.overlay}>
          <div className={styles.formDialog}>
            <div className={styles.formHeader}>
              <span>{editingId ? '编辑任务' : '新建定时任务'}</span>
              <button className={styles.closeBtn} onClick={() => setShowForm(false)}>�?/button>
            </div>
            <div className={styles.formBody}>
              <div className={styles.field}>
                <label>任务标题</label>
                <input
                  className={styles.input}
                  value={form.title}
                  onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                  placeholder="每日总结"
                />
              </div>
              <div className={styles.field}>
                <label>触发时发送的消息</label>
                <textarea
                  className={styles.textarea}
                  value={form.description}
                  onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="请帮我总结今天的工作进展�?
                  rows={3}
                />
              </div>
              <div className={styles.field}>
                <label>任务类型</label>
                <div className={styles.typeToggle}>
                  <button
                    className={`${styles.typeBtn} ${form.type === 'once' ? styles.typeBtnActive : ''}`}
                    onClick={() => setForm(p => ({ ...p, type: 'once' }))}
                  >一次�?/button>
                  <button
                    className={`${styles.typeBtn} ${form.type === 'cron' ? styles.typeBtnActive : ''}`}
                    onClick={() => setForm(p => ({ ...p, type: 'cron' }))}
                  >周期�?(Cron)</button>
                </div>
              </div>
              {form.type === 'once' ? (
                <div className={styles.field}>
                  <label>执行时间</label>
                  <input
                    type="datetime-local"
                    className={styles.input}
                    value={form.run_at}
                    onChange={e => setForm(p => ({ ...p, run_at: e.target.value }))}
                  />
                </div>
              ) : (
                <div className={styles.field}>
                  <label>Cron 表达�?/label>
                  <input
                    className={styles.input}
                    value={form.cron_expr}
                    onChange={e => setForm(p => ({ ...p, cron_expr: e.target.value }))}
                    placeholder="0 9 * * 1-5  (每工作日 9:00)"
                  />
                  <small className={styles.hint}>�?�?�?�?�?/small>
                </div>
              )}
            </div>
            <div className={styles.formFooter}>
              <button className={styles.btnPrimary} onClick={handleSave} disabled={saving}>
                {saving ? '保存中�? : '保存'}
              </button>
              <button className={styles.btnSecondary} onClick={() => setShowForm(false)}>取消</button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认 */}
      {deleteTarget !== null && (
        <div className={styles.overlay}>
          <div className={styles.deleteDialog}>
            <p>确认删除此定时任务？</p>
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
