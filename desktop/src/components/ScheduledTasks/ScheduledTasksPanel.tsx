import { useEffect, useState, useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'
import styles from './ScheduledTasksPanel.module.css'
import { useAppStore } from '../../store/app'
import { useToast, throwIfError } from '../../hooks/useToast'
import Toast from '../Toast/Toast'
import { apiFetch } from '../../api/apiFetch'
import { sendMessageExternal } from '../../hooks/useWebSocket'

interface ScheduledTask {
  id: string
  title: string
  description: string
  schedule_type: 'once' | 'cron'
  cron_expr: string | null
  run_at: string | null
  timezone: string
  skill_id: string | null
  allowed_tools: string[]
  is_enabled: boolean
  status: string
  last_status: string | null
  last_run_at: string | null
  next_run_at: string | null
  run_count: number
  missed_count: number
  created_at: string
}

interface ScheduledTaskRun {
  id: string
  task_id: string
  scheduled_for: string | null
  started_at: string | null
  finished_at: string | null
  status: string
  trigger_type: string
  session_id: string | null
  error_message: string | null
  summary: string | null
}

type RepeatPreset = 'daily' | 'workdays' | 'weekly' | 'monthly' | 'custom'

const WEEKDAYS = [
  { value: '1', label: '周一' },
  { value: '2', label: '周二' },
  { value: '3', label: '周三' },
  { value: '4', label: '周四' },
  { value: '5', label: '周五' },
  { value: '6', label: '周六' },
  { value: '0', label: '周日' },
]

const DEFAULT_FORM = {
  title: '',
  description: '',
  type: 'once' as 'once' | 'cron',
  run_at: '',
  cron_expr: '',
  repeatPreset: 'daily' as RepeatPreset,
  repeatTime: '09:00',
  weekday: '1',
  monthDay: '1',
  skill_id: null as string | null,
  is_enabled: true,
}

export default function ScheduledTasksPanel() {
  const {
    token,
    serverUrl,
    securityConfig,
    addSession,
    setActiveSession,
    appendMessage,
    setCatState,
    setSidebarTab,
  } = useAppStore()
  const [tasks, setTasks] = useState<ScheduledTask[]>([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ ...DEFAULT_FORM })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [historyTask, setHistoryTask] = useState<ScheduledTask | null>(null)
  const [runs, setRuns] = useState<ScheduledTaskRun[]>([])
  const { toast, showToast, dismissToast } = useToast()
  const [saving, setSaving] = useState(false)
  const [inferring, setInferring] = useState(false)
  const [inferredTools, setInferredTools] = useState<string[] | null>(null)
  const [inferReason, setInferReason] = useState('')
  const [emptyToolsTarget, setEmptyToolsTarget] = useState<{ task: Pick<ScheduledTask, 'id' | 'title' | 'description' | 'allowed_tools'>; runId: string } | null>(null)

  const fetchTasks = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const res = await apiFetch(`${serverUrl}/api/scheduled-tasks`)
      await throwIfError(res)
      const data: ScheduledTask[] = await res.json()
      setTasks(data)
      await window.nekoBridge?.scheduler?.sync(data.filter(t => t.is_enabled && t.status !== 'completed'))
    } catch (e: any) {
      showToast(e.message)
    } finally {
      setLoading(false)
    }
  }, [token, serverUrl])

  useEffect(() => { fetchTasks() }, [fetchTasks])

  const executeTask = useCallback(async (
    task: Pick<ScheduledTask, 'id' | 'title' | 'description' | 'allowed_tools'>,
    runId: string,
    isManual = false,
  ) => {
    if (isManual && task.allowed_tools.length === 0) {
      setEmptyToolsTarget({ task, runId })
      return
    }
    const localId = `local-task-${task.id}-${Date.now()}`
    addSession({ id: localId, title: task.title || '猫钟任务', source: 'scheduled_task' })
    setActiveSession(localId)
    appendMessage(localId, { id: uuidv4(), role: 'user', content: task.description })
    setCatState('thinking')
    setTimeout(() => {
      sendMessageExternal(task.description, {
        allowedTools: task.allowed_tools ?? [],
        taskRun: { taskId: task.id, runId },
        source: 'scheduled_task',
        memoryPolicy: 'read_only',
      })
    }, 0)
  }, [addSession, setActiveSession, appendMessage, setCatState, setSidebarTab])

  const createRun = useCallback(async (
    task: Pick<ScheduledTask, 'id'>,
    body: { scheduled_for?: string | null; trigger_type: 'auto' | 'manual' | 'missed'; status?: 'running' | 'missed' },
  ): Promise<ScheduledTaskRun> => {
    const res = await apiFetch(`${serverUrl}/api/scheduled-tasks/${task.id}/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scheduled_for: body.scheduled_for ?? null,
        trigger_type: body.trigger_type,
        status: body.status ?? 'running',
      }),
    })
    await throwIfError(res)
    return res.json()
  }, [serverUrl])

  // 桌面端本地调度触发后，由渲染进程创建 run 并发送 Agent 消息。
  useEffect(() => {
    const off = window.nekoBridge?.scheduler?.onFired(async (task) => {
      try {
        const run = await createRun(
          { id: task.id },
          { scheduled_for: task.scheduled_for, trigger_type: 'auto', status: 'running' },
        )
        await executeTask({ ...task, allowed_tools: task.allowed_tools ?? [] }, run.id)
        fetchTasks()
      } catch (e: any) {
        showToast(e.message ?? String(e))
      }
    })
    return () => { off?.() }
  }, [createRun, executeTask, fetchTasks])

  // 启动/同步时检查错过的任务：一次性提示补跑，周期任务只记录 missed。
  useEffect(() => {
    const now = new Date()
    const missedOnce = tasks.filter(t => (
      t.is_enabled
      && t.schedule_type === 'once'
      && t.run_at
      && new Date(t.run_at) < now
      && t.run_count === 0
      && t.last_status !== 'missed'
    ))
    const missedCron = tasks.filter(t => (
      t.is_enabled
      && t.schedule_type === 'cron'
      && t.next_run_at
      && new Date(t.next_run_at) < now
      && t.last_status !== 'missed'
    ))
    if (missedOnce.length > 0) {
      showToast(`检测到 ${missedOnce.length} 个错过的一次性任务，可点击立即执行补跑`)
      missedOnce.forEach(t => createRun(t, { scheduled_for: t.run_at, trigger_type: 'missed', status: 'missed' }).catch(() => {}))
    }
    if (missedCron.length > 0) {
      missedCron.forEach(t => createRun(t, { scheduled_for: t.next_run_at, trigger_type: 'missed', status: 'missed' }).catch(() => {}))
    }
  }, [tasks, createRun])

  function openCreate() {
    setEditingId(null)
    setForm({ ...DEFAULT_FORM })
    setInferredTools(null)
    setInferReason('')
    setShowForm(true)
  }

  function openEdit(task: ScheduledTask) {
    const cronParts = parseCronToForm(task.cron_expr)
    setEditingId(task.id)
    setForm({
      title: task.title,
      description: task.description,
      type: task.schedule_type ?? (task.cron_expr ? 'cron' : 'once'),
      run_at: task.run_at ? task.run_at.slice(0, 16) : '',
      cron_expr: task.cron_expr ?? cronParts.cron_expr,
      repeatPreset: cronParts.repeatPreset,
      repeatTime: cronParts.repeatTime,
      weekday: cronParts.weekday,
      monthDay: cronParts.monthDay,
      skill_id: task.skill_id,
      is_enabled: task.is_enabled,
    })
    setInferredTools(null)
    setInferReason('')
    setShowForm(true)
  }

  async function handleInferTools() {
    if (!form.description.trim()) return
    setInferring(true)
    try {
      const res = await apiFetch(`${serverUrl}/api/scheduled-tasks/infer-tools`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: form.description }),
      })
      await throwIfError(res)
      const data: { allowed_tools: string[]; skill_id: string | null; reasoning: string } = await res.json()
      setInferredTools(data.allowed_tools)
      setInferReason(data.reasoning)
      setForm(p => ({ ...p, skill_id: data.skill_id }))
    } catch (e: any) {
      showToast('工具推断失败，请手动配置')
    } finally {
      setInferring(false)
    }
  }

  async function handleSave() {
    if (!form.title.trim() || !form.description.trim()) {
      showToast('标题和描述不能为空')
      return
    }
    if (form.type === 'once' && !form.run_at) {
      showToast('请选择执行时间')
      return
    }
    if (form.type === 'cron' && !form.cron_expr.trim()) {
      const generated = buildCronExpr(form)
      if (!generated) {
        showToast('请选择周期时间')
        return
      }
    }

    setSaving(true)
    try {
      const cronExpr = form.type === 'cron' ? buildCronExpr(form) : null
      const body = {
        title: form.title,
        description: form.description,
        schedule_type: form.type,
        cron_expr: cronExpr,
        run_at: form.type === 'once' ? new Date(form.run_at).toISOString() : null,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        skill_id: form.skill_id,
        allowed_tools: inferredTools ?? securityConfig.toolWhitelist,
        is_enabled: form.is_enabled,
      }
      const url = editingId
        ? `${serverUrl}/api/scheduled-tasks/${editingId}`
        : `${serverUrl}/api/scheduled-tasks`
      const res = await apiFetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  async function handleDelete(id: string) {
    try {
      const res = await apiFetch(`${serverUrl}/api/scheduled-tasks/${id}`, {
        method: 'DELETE',
      })
      await throwIfError(res)
      setTasks(prev => prev.filter(t => t.id !== id))
      setDeleteTarget(null)
    } catch (e: any) {
      showToast(e.message)
    }
  }

  async function handleTrigger(task: ScheduledTask) {
    try {
      const res = await apiFetch(`${serverUrl}/api/scheduled-tasks/${task.id}/trigger`, {
        method: 'POST',
      })
      await throwIfError(res)
      const run: ScheduledTaskRun = await res.json()
      await executeTask(task, run.id, true)
      fetchTasks()
    } catch (e: any) {
      showToast(e.message)
    }
  }

  async function handleToggle(task: ScheduledTask) {
    try {
      const res = await apiFetch(`${serverUrl}/api/scheduled-tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_enabled: !task.is_enabled }),
      })
      await throwIfError(res)
      fetchTasks()
    } catch (e: any) {
      showToast(e.message)
    }
  }

  async function openHistory(task: ScheduledTask) {
    setHistoryTask(task)
    try {
      const res = await apiFetch(`${serverUrl}/api/scheduled-tasks/${task.id}/runs`)
      await throwIfError(res)
      setRuns(await res.json())
    } catch (e: any) {
      showToast(e.message)
    }
  }

  function statusLabel(status: string) {
    return ({
      running: '运行中',
      success: '成功',
      failed: '失败',
      missed: '已错过',
      ignored: '已忽略',
      cancelled: '已取消',
    } as Record<string, string>)[status] ?? status
  }

  function buildCronExpr(value: typeof form): string | null {
    if (value.repeatPreset === 'custom') return value.cron_expr.trim() || null
    if (!value.repeatTime) return null
    const [hour, minute] = value.repeatTime.split(':')
    if (!hour || !minute) return null
    switch (value.repeatPreset) {
      case 'daily':
        return `${Number(minute)} ${Number(hour)} * * *`
      case 'workdays':
        return `${Number(minute)} ${Number(hour)} * * 1-5`
      case 'weekly':
        return `${Number(minute)} ${Number(hour)} * * ${value.weekday}`
      case 'monthly':
        return `${Number(minute)} ${Number(hour)} ${value.monthDay} * *`
      default:
        return null
    }
  }

  function parseCronToForm(expr: string | null): Pick<typeof DEFAULT_FORM, 'repeatPreset' | 'repeatTime' | 'weekday' | 'monthDay' | 'cron_expr'> {
    const fallback = {
      repeatPreset: 'daily' as RepeatPreset,
      repeatTime: '09:00',
      weekday: '1',
      monthDay: '1',
      cron_expr: expr ?? '',
    }
    if (!expr) return fallback
    const parts = expr.trim().split(/\s+/)
    if (parts.length !== 5) return { ...fallback, repeatPreset: 'custom', cron_expr: expr }
    const [minute, hour, day, month, week] = parts
    const repeatTime = `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`
    if (day === '*' && month === '*' && week === '*') {
      return { ...fallback, repeatPreset: 'daily', repeatTime, cron_expr: expr }
    }
    if (day === '*' && month === '*' && week === '1-5') {
      return { ...fallback, repeatPreset: 'workdays', repeatTime, cron_expr: expr }
    }
    if (day === '*' && month === '*' && WEEKDAYS.some(d => d.value === week)) {
      return { ...fallback, repeatPreset: 'weekly', repeatTime, weekday: week, cron_expr: expr }
    }
    if (/^\d+$/.test(day) && month === '*' && week === '*') {
      return { ...fallback, repeatPreset: 'monthly', repeatTime, monthDay: day, cron_expr: expr }
    }
    return { ...fallback, repeatPreset: 'custom', cron_expr: expr }
  }

  return (
    <div className={styles.panel}>
      <Toast message={toast} onClose={dismissToast} />
      <div className={styles.header}>
        <span className={styles.title}>猫钟</span>
        <button className={styles.btnPrimary} onClick={openCreate}>+ 新建</button>
      </div>

      {loading ? (
        <div className={styles.loading}>加载中…</div>
      ) : tasks.length === 0 ? (
        <div className={styles.empty}>暂无猫钟任务</div>
      ) : (
        <ul className={styles.list}>
          {tasks.map(t => (
            <li key={t.id} className={`${styles.item} ${!t.is_enabled ? styles.disabled : ''}`}>
              <div className={styles.itemHeader}>
                <span className={styles.itemTitle}>{t.title}</span>
                <div className={styles.itemActions}>
                  <button className={styles.icnBtn} onClick={() => handleTrigger(t)} title="立即执行">⚡</button>
                  <button className={styles.icnBtn} onClick={() => handleToggle(t)} title={t.is_enabled ? '暂停' : '启用'}>
                    {t.is_enabled ? '⏸️' : '▶️'}
                  </button>
                  <button className={styles.icnBtn} onClick={() => openHistory(t)} title="执行历史">📜</button>
                  <button className={styles.icnBtn} onClick={() => openEdit(t)} title="编辑">✏️</button>
                  <button className={styles.icnBtn} onClick={() => setDeleteTarget(t.id)} title="删除">🗑</button>
                </div>
              </div>
              <div className={styles.itemDesc}>{t.description}</div>
              <div className={styles.itemMeta}>
                {t.cron_expr && <span className={styles.cronTag}>{t.cron_expr}</span>}
                {t.run_at && <span className={styles.cronTag}>一次性 {new Date(t.run_at).toLocaleString('zh-CN')}</span>}
                {t.next_run_at && <span className={styles.metaItem}>下次: {new Date(t.next_run_at).toLocaleString('zh-CN')}</span>}
                {t.last_status && <span className={styles.metaItem}>状态: {statusLabel(t.last_status)}</span>}
                <span className={styles.metaItem}>执行 {t.run_count} 次</span>
                {t.missed_count > 0 && <span className={styles.metaItem}>错过 {t.missed_count} 次</span>}
                <span className={styles.metaItem}>工具 {t.allowed_tools?.length ?? 0} 个</span>
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
              <span>{editingId ? '编辑猫钟' : '新建猫钟'}</span>
              <button className={styles.closeBtn} onClick={() => setShowForm(false)}>✕</button>
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
                  placeholder="请帮我总结今天的工作进展…"
                  rows={3}
                />
                <button
                  type="button"
                  className={styles.btnSecondary}
                  style={{ marginTop: 6, fontSize: 12 }}
                  disabled={!form.description.trim() || inferring}
                  onClick={handleInferTools}
                >
                  {inferring ? '分析中…' : '✨ 分析所需工具'}
                </button>
                {inferReason && (
                  <small className={styles.hint} style={{ marginTop: 4, display: 'block' }}>
                    推断说明：{inferReason}
                  </small>
                )}
              </div>
              <div className={styles.field}>
                <label>任务类型</label>
                <div className={styles.typeToggle}>
                  <button
                    className={`${styles.typeBtn} ${form.type === 'once' ? styles.typeBtnActive : ''}`}
                    onClick={() => setForm(p => ({ ...p, type: 'once' }))}
                  >一次性</button>
                  <button
                    className={`${styles.typeBtn} ${form.type === 'cron' ? styles.typeBtnActive : ''}`}
                    onClick={() => setForm(p => ({ ...p, type: 'cron' }))}
                  >周期性</button>
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
                <div className={styles.scheduleBox}>
                  <div className={styles.field}>
                    <label>重复频率</label>
                    <div className={styles.presetGrid}>
                      {[
                        ['daily', '每天'],
                        ['workdays', '工作日'],
                        ['weekly', '每周'],
                        ['monthly', '每月'],
                        ['custom', '自定义'],
                      ].map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          className={`${styles.presetBtn} ${form.repeatPreset === value ? styles.presetBtnActive : ''}`}
                          onClick={() => setForm(p => ({ ...p, repeatPreset: value as RepeatPreset }))}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {form.repeatPreset !== 'custom' ? (
                    <>
                      <div className={styles.inlineFields}>
                        <div className={styles.field}>
                          <label>执行时间</label>
                          <input
                            type="time"
                            className={styles.input}
                            value={form.repeatTime}
                            onChange={e => setForm(p => ({ ...p, repeatTime: e.target.value }))}
                          />
                        </div>
                        {form.repeatPreset === 'weekly' && (
                          <div className={styles.field}>
                            <label>星期</label>
                            <select
                              className={styles.input}
                              value={form.weekday}
                              onChange={e => setForm(p => ({ ...p, weekday: e.target.value }))}
                            >
                              {WEEKDAYS.map(day => (
                                <option key={day.value} value={day.value}>{day.label}</option>
                              ))}
                            </select>
                          </div>
                        )}
                        {form.repeatPreset === 'monthly' && (
                          <div className={styles.field}>
                            <label>每月几号</label>
                            <select
                              className={styles.input}
                              value={form.monthDay}
                              onChange={e => setForm(p => ({ ...p, monthDay: e.target.value }))}
                            >
                              {Array.from({ length: 31 }, (_, i) => String(i + 1)).map(day => (
                                <option key={day} value={day}>{day} 号</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                      <small className={styles.hint}>
                        将保存为 Cron：{buildCronExpr(form) ?? '请选择时间'}
                      </small>
                    </>
                  ) : (
                    <div className={styles.field}>
                      <label>高级 Cron 表达式</label>
                      <input
                        className={styles.input}
                        value={form.cron_expr}
                        onChange={e => setForm(p => ({ ...p, cron_expr: e.target.value }))}
                        placeholder="0 9 * * 1-5"
                      />
                      <small className={styles.hint}>格式：分 时 日 月 周，例如 0 9 * * 1-5 表示工作日 9:00</small>
                    </div>
                  )}
                </div>
              )}
              <div className={styles.field}>
                <label>允许工具快照</label>
                <small className={styles.hint}>
                  {inferredTools
                    ? `已推断 ${inferredTools.length} 个工具：${inferredTools.join('、') || '无'}`
                    : `保存时会固化当前爪力配置：${securityConfig.toolWhitelist.length} 个工具`}
                </small>
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

      {historyTask && (
        <div className={styles.overlay}>
          <div className={styles.formDialog}>
            <div className={styles.formHeader}>
              <span>执行历史：{historyTask.title}</span>
              <button className={styles.closeBtn} onClick={() => setHistoryTask(null)}>✕</button>
            </div>
            <div className={styles.formBody}>
              {runs.length === 0 ? (
                <div className={styles.empty}>暂无执行记录</div>
              ) : (
                <ul className={styles.list}>
                  {runs.map(run => (
                    <li key={run.id} className={styles.item}>
                      <div className={styles.itemHeader}>
                        <span className={styles.itemTitle}>{statusLabel(run.status)}</span>
                      </div>
                      <div className={styles.itemMeta}>
                        {run.scheduled_for && <span className={styles.metaItem}>计划: {new Date(run.scheduled_for).toLocaleString('zh-CN')}</span>}
                        {run.started_at && <span className={styles.metaItem}>开始: {new Date(run.started_at).toLocaleString('zh-CN')}</span>}
                        {run.finished_at && <span className={styles.metaItem}>结束: {new Date(run.finished_at).toLocaleString('zh-CN')}</span>}
                        <span className={styles.metaItem}>来源: {run.trigger_type}</span>
                      </div>
                      {run.summary && <div className={styles.itemDesc} style={{ whiteSpace: 'pre-wrap' }}>{run.summary}</div>}
                      {run.error_message && <div className={styles.itemDesc}>{run.error_message}</div>}
                    </li>
                  ))}
                </ul>
              )}
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

      {/* 工具列表为空警告 */}
      {emptyToolsTarget !== null && (
        <div className={styles.overlay}>
          <div className={styles.deleteDialog}>
            <p>⚠️ 该任务未配置允许工具，执行时 Agent 可能无法完成相关操作。</p>
            <div className={styles.dialogActions}>
              <button
                className={styles.btnPrimary}
                onClick={() => {
                  const t = emptyToolsTarget
                  setEmptyToolsTarget(null)
                  executeTask(t.task, t.runId, false)
                }}
              >付款执行</button>
              <button
                className={styles.btnSecondary}
                onClick={() => {
                  const t = emptyToolsTarget
                  setEmptyToolsTarget(null)
                  const fullTask = tasks.find(tk => tk.id === t.task.id)
                  if (fullTask) openEdit(fullTask)
                }}
              >去编辑</button>
              <button className={styles.btnSecondary} onClick={() => setEmptyToolsTarget(null)}>取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
