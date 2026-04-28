import { useEffect, useState, useRef } from 'react'
import {
  listUsers, createUser, updateUser, deleteUser, updateQuota, resetQuota,
  type AdminUser, type CreateUserBody, type UpdateUserBody, type QuotaBody,
} from '../api/users'
import styles from './UsersPage.module.css'

function formatLimit(v: number) {
  return v === -1 ? '不限' : String(v)
}

function QuotaEditor({
  user,
  onSave,
  onClose,
}: {
  user: AdminUser
  onSave: (body: QuotaBody) => Promise<void>
  onClose: () => void
}) {
  const [msgLimit, setMsgLimit] = useState(String(user.daily_message_limit))
  const [createLimit, setCreateLimit] = useState(String(user.daily_creation_limit))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      await onSave({
        daily_message_limit: parseInt(msgLimit) || -1,
        daily_creation_limit: parseInt(createLimit) || -1,
      })
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
        <div className={styles.modalTitle}>配额设置 — {user.username}</div>
        <label className={styles.label}>
          每日消息次数上限（-1 表示不限）
          <input
            className={styles.input}
            type="number"
            value={msgLimit}
            onChange={e => setMsgLimit(e.target.value)}
          />
        </label>
        <label className={styles.label}>
          每日创作点上限（-1 表示不限）
          <input
            className={styles.input}
            type="number"
            value={createLimit}
            onChange={e => setCreateLimit(e.target.value)}
          />
        </label>
        {error && <div className={styles.error}>{error}</div>}
        <div className={styles.modalActions}>
          <button className={styles.btnSecondary} onClick={onClose}>取消</button>
          <button className={styles.btnPrimary} onClick={handleSave} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

function CreateUserModal({
  onSave,
  onClose,
}: {
  onSave: (body: CreateUserBody) => Promise<void>
  onClose: () => void
}) {
  const [form, setForm] = useState<CreateUserBody>({ username: '', password: '', nickname: '', is_admin: false })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      await onSave(form)
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '创建失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.modal}>
      <div className={styles.modalCard}>
        <div className={styles.modalTitle}>创建用户</div>
        <label className={styles.label}>
          用户名
          <input className={styles.input} value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
        </label>
        <label className={styles.label}>
          密码
          <input className={styles.input} type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
        </label>
        <label className={styles.label}>
          昵称（可选）
          <input className={styles.input} value={form.nickname ?? ''} onChange={e => setForm(f => ({ ...f, nickname: e.target.value }))} />
        </label>
        <label className={styles.checkboxLabel}>
          <input type="checkbox" checked={form.is_admin ?? false} onChange={e => setForm(f => ({ ...f, is_admin: e.target.checked }))} />
          设为管理员
        </label>
        {error && <div className={styles.error}>{error}</div>}
        <div className={styles.modalActions}>
          <button className={styles.btnSecondary} onClick={onClose}>取消</button>
          <button className={styles.btnPrimary} onClick={handleSave} disabled={saving}>
            {saving ? '创建中…' : '创建'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function UsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [quotaTarget, setQuotaTarget] = useState<AdminUser | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  async function load() {
    try {
      setUsers(await listUsers())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleDelete(id: string, username: string) {
    if (!confirm(`确定删除用户 "${username}"？`)) return
    try {
      await deleteUser(id)
      setUsers(u => u.filter(x => x.id !== id))
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : '删除失败')
    }
  }

  async function handleResetQuota(id: string) {
    try {
      await resetQuota(id)
      await load()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : '重置失败')
    }
  }

  async function handleUpdateQuota(body: QuotaBody) {
    await updateQuota(quotaTarget!.id, body)
    await load()
  }

  async function handleCreateUser(body: CreateUserBody) {
    await createUser(body)
    await load()
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>用户管理</h1>
        <button className={styles.btnPrimary} onClick={() => setShowCreate(true)}>+ 创建用户</button>
      </div>
      {error && <div className={styles.error}>{error}</div>}
      {loading ? (
        <div className={styles.loading}>加载中…</div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>用户名</th>
                <th>昵称</th>
                <th>角色</th>
                <th>消息配额</th>
                <th>今日消息</th>
                <th>创作配额</th>
                <th>今日创作</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td>{u.username}</td>
                  <td>{u.nickname || '—'}</td>
                  <td>
                    <span className={u.is_admin ? styles.tagAdmin : styles.tagUser}>
                      {u.is_admin ? '管理员' : '用户'}
                    </span>
                  </td>
                  <td>{formatLimit(u.daily_message_limit)}</td>
                  <td>{u.messages_used_today}</td>
                  <td>{formatLimit(u.daily_creation_limit)}</td>
                  <td>{u.creation_used_today}</td>
                  <td>
                    <div className={styles.actions}>
                      <button className={styles.btnAction} onClick={() => setQuotaTarget(u)}>配额</button>
                      <button className={styles.btnAction} onClick={() => handleResetQuota(u.id)}>重置今日</button>
                      <button className={styles.btnDanger} onClick={() => handleDelete(u.id, u.username)}>删除</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {quotaTarget && (
        <QuotaEditor
          user={quotaTarget}
          onSave={handleUpdateQuota}
          onClose={() => setQuotaTarget(null)}
        />
      )}
      {showCreate && (
        <CreateUserModal
          onSave={handleCreateUser}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  )
}
