import { useRef, useEffect, KeyboardEvent, useState } from 'react'
import { useAppStore } from '../../store/app'
import { CatAvatar } from '../CatAvatar/CatAvatar'
import { ChatMessage } from './ChatMessage'
import { useWebSocket } from '../../hooks/useWebSocket'
import { useLocalLLM } from '../../hooks/useLocalLLM'
import styles from './ChatArea.module.css'
import { SkillSelector } from './SkillSelector'
import { AssetsPanel } from './AssetsPanel'

const WindowControls = () => (
  <div className={styles.windowControls}>
    <button onClick={() => window.nekoBridge?.window.minimize()}>─</button>
    <button onClick={() => window.nekoBridge?.window.maximize()}>□</button>
    <button className={styles.closeBtn} onClick={() => window.nekoBridge?.window.close()}>✕</button>
  </div>
)

export function ChatArea() {
  const {
    activeSessionId,
    messagesBySession,
    catState,
    wsStatus,
    activeSkillId,
    localLLMConfig,
    serverUrl,
    token,
    serverConnected,
    setMessages,
    replaceSession,
    setActiveSession,
  } = useAppStore()

  const messages = activeSessionId ? (messagesBySession[activeSessionId] ?? []) : []
  const { sendMessage: wsSend } = useWebSocket(localLLMConfig ? null : activeSessionId)
  const { sendMessage: localSend } = useLocalLLM(activeSessionId)

  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)

  // 同步本地会话到服务器
  const syncToServer = async () => {
    if (!activeSessionId?.startsWith('local-') || !token || !serverUrl) return
    setIsSyncing(true)
    setSyncError(null)
    try {
      const db = window.nekoBridge?.db
      if (!db) throw new Error('DB不可用')

      // 1. 获取所有本地消息
      const localMsgs = await db.getMessages(activeSessionId)
      const msgs = localMsgs.filter((m: any) => m.role === 'user' || m.role === 'assistant')

      // 2. 在服务器创建会话
      const sessionTitle = useAppStore.getState().sessions.find(s => s.id === activeSessionId)?.title ?? '新对话'
      const createRes = await fetch(`${serverUrl}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: sessionTitle }),
      })
      if (!createRes.ok) throw new Error(`创建会话失败 ${createRes.status}`)
      const serverSession: { id: string; title: string; skill_id: string | null } = await createRes.json()

      // 3. 批量上传消息
      if (msgs.length > 0) {
        const batchRes = await fetch(`${serverUrl}/api/sessions/${serverSession.id}/messages/batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(msgs.map((m: any) => ({ role: m.role, content: m.content }))),
        })
        if (!batchRes.ok) throw new Error(`上传消息失败 ${batchRes.status}`)
      }

      // 4. 转移内存中的消息到新 ID
      const currentMsgs = messagesBySession[activeSessionId] ?? []
      setMessages(serverSession.id, currentMsgs)

      // 5. 替换 store 中的会话，切换活跃会话
      replaceSession(activeSessionId, { id: serverSession.id, title: serverSession.title, skillId: serverSession.skill_id ?? undefined })
      setActiveSession(serverSession.id)

      // 6. 硬删除本地 SQLite 记录
      await db.deleteSession(activeSessionId)
    } catch (err: unknown) {
      setSyncError(err instanceof Error ? err.message : '同步失败')
      setTimeout(() => setSyncError(null), 4000)
    } finally {
      setIsSyncing(false)
    }
  }

  const isLocalSession = activeSessionId?.startsWith('local-') ?? false

  // Load history messages when switching to a session
  useEffect(() => {
    if (!activeSessionId) return

    // For local- sessions, load from SQLite
    if (activeSessionId.startsWith('local-')) {
      if (messagesBySession[activeSessionId]?.length) return
      ;(async () => {
        const db = window.nekoBridge?.db
        if (!db) return
        try {
          const localMsgs = await db.getMessages(activeSessionId)
          setMessages(
            activeSessionId,
            localMsgs
              .filter((m) => m.role === 'user' || m.role === 'assistant')
              .map((m) => ({ id: m.id, role: m.role as 'user' | 'assistant', content: m.content })),
          )
        } catch {}
      })()
      return
    }

    if (messagesBySession[activeSessionId]?.length) return   // already loaded
    setIsLoadingHistory(true)
    ;(async () => {
      try {
        const res = await fetch(`${serverUrl}/api/sessions/${activeSessionId}/messages`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return
        const data: Array<{ id: string; role: string; content: string | null; tool_calls: null }> = await res.json()
        setMessages(
          activeSessionId,
          data.map((m) => ({
            id: m.id,
            role: m.role as 'user' | 'assistant' | 'tool',
            content: m.content ?? '',
          })),
        )
      } catch {
        // silently ignore — user can still chat
      } finally {
        setIsLoadingHistory(false)
      }
    })()
  }, [activeSessionId])

  // Route to local LLM or backend WebSocket based on config
  const sendMessage = localLLMConfig
    ? (text: string, _skillId?: string | null) => localSend(text)
    : wsSend

  const [input, setInput] = useState('')
  const [showAssets, setShowAssets] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const handleSend = () => {
    const text = input.trim()
    if (!text || !activeSessionId) return
    sendMessage(text, activeSkillId)
    setInput('')
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // ── 无会话选中 ──────────────────────────────────────────────────────────────
  if (!activeSessionId) {
    return (
      <div className={styles.emptyWrap}>
        <div className={styles.topBar}>
          <WindowControls />
        </div>
        <div className={styles.emptyState}>
          <CatAvatar state="idle" size={120} />
          <p className={styles.emptyText}>选择一个对话，或新建一个开始吧 ฅ^•ﻌ•^ฅ</p>
        </div>
      </div>
    )
  }

  // ── 历史消息加载中 ────────────────────────────────────────────────────────────
  if (isLoadingHistory) {
    return (
      <div className={styles.chatArea}>
        <div className={styles.topBar}>
          <WsStatusPill status={wsStatus} isLocal={!!localLLMConfig} />
          <span className={styles.topBarSpacer} />
          <WindowControls />
        </div>
        <div className={styles.loadingWrap}>
          <div className={styles.skeletonList}>
            <div className={`${styles.skeletonRow} ${styles.skeletonRight}`}>
              <div className={`${styles.skeletonBubble} ${styles.skeletonShort}`} />
            </div>
            <div className={styles.skeletonRow}>
              <div className={styles.skeletonAvatar} />
              <div className={`${styles.skeletonBubble} ${styles.skeletonLong}`} />
            </div>
            <div className={`${styles.skeletonRow} ${styles.skeletonRight}`}>
              <div className={`${styles.skeletonBubble} ${styles.skeletonMedium}`} />
            </div>
            <div className={styles.skeletonRow}>
              <div className={styles.skeletonAvatar} />
              <div className={styles.skeletonLines}>
                <div className={`${styles.skeletonLine} ${styles.skeletonLineFull}`} />
                <div className={`${styles.skeletonLine} ${styles.skeletonLineWide}`} />
                <div className={`${styles.skeletonLine} ${styles.skeletonLineShort}`} />
              </div>
            </div>
            <div className={`${styles.skeletonRow} ${styles.skeletonRight}`}>
              <div className={`${styles.skeletonBubble} ${styles.skeletonLong}`} />
            </div>
          </div>
          <div className={styles.loadingLabel}>加载消息中…</div>
        </div>
      </div>
    )
  }

  // ── 会话已选，无消息（居中欢迎 + 浮动输入框）─────────────────────────────────
  if (messages.length === 0) {
    return (
      <div className={styles.chatArea}>
        <div className={styles.topBar}>
          <WsStatusPill status={wsStatus} isLocal={!!localLLMConfig} />
          <span className={styles.topBarSpacer} />
          {isLocalSession && serverConnected && token && (
            <button
              className={`${styles.syncBtn} ${isSyncing ? styles.syncBtnBusy : ''}`}
              onClick={syncToServer}
              disabled={isSyncing}
              title="将此对话同步到服务器"
            >
              {isSyncing ? '同步中…' : syncError ? `⚠ ${syncError}` : '↑ 同步到服务器'}
            </button>
          )}
          <button
            className={`${styles.assetsBtn} ${showAssets ? styles.assetsBtnActive : ''}`}
            onClick={() => setShowAssets(v => !v)}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M2 2h5v5H2zm7 0h5v5H9zm-7 7h5v5H2zm7 0h5v5H9z" opacity=".85"/>
            </svg>
            资产
          </button>
          <WindowControls />
        </div>
        {showAssets && <AssetsPanel onClose={() => setShowAssets(false)} />
        }
        <div className={styles.welcomeCenter}>
          <CatAvatar state={catState} size={100} />
          <h2 className={styles.welcomeGreeting}>嗯，有什么需要我帮忙的？</h2>
          <div className={styles.welcomeInput}>
            <div className={styles.welcomeToolbar}><SkillSelector /></div>
            <div className={styles.inputRow}>
              <textarea
                className={styles.textarea}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="有什么我可以帮你的？（Enter 发送）"
                rows={2}
              />
              <button className={styles.sendBtn} onClick={handleSend} disabled={!input.trim()}>➤</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── 正常对话 ────────────────────────────────────────────────────────────────
  return (
    <div className={styles.chatArea}>
      <div className={styles.topBar}>
        <WsStatusPill status={wsStatus} isLocal={!!localLLMConfig} />
        <span className={styles.topBarSpacer} />
        {isLocalSession && serverConnected && token && (
          <button
            className={`${styles.syncBtn} ${isSyncing ? styles.syncBtnBusy : ''}`}
            onClick={syncToServer}
            disabled={isSyncing}
            title="将此对话同步到服务器"
          >
            {isSyncing ? '同步中…' : syncError ? `⚠ ${syncError}` : '↑ 同步到服务器'}
          </button>
        )}
        <button
          className={`${styles.assetsBtn} ${showAssets ? styles.assetsBtnActive : ''}`}
          onClick={() => setShowAssets(v => !v)}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M2 2h5v5H2zm7 0h5v5H9zm-7 7h5v5H2zm7 0h5v5H9z" opacity=".85"/>
          </svg>
          资产
        </button>
        <WindowControls />
      </div>
      {showAssets && <AssetsPanel onClose={() => setShowAssets(false)} />}
      <div className={styles.messages}>
        {messages.map((m) => (
          <ChatMessage key={m.id} message={m} />
        ))}
        <div ref={bottomRef} />
      </div>
      <div className={styles.inputArea}>
        <div className={styles.inputToolbar}><SkillSelector /></div>
        <div className={styles.inputRow}>
          <textarea
            className={styles.textarea}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="有什么我可以帮你的？（Enter 发送）"
            rows={3}
          />
          <button className={styles.sendBtn} onClick={handleSend} disabled={!input.trim()}>➤</button>
        </div>
      </div>
    </div>
  )
}

function WsStatusPill({ status, isLocal }: { status: string; isLocal?: boolean }) {
  if (isLocal) {
    return (
      <div className={`${styles.wsPill} ${styles['ws_connected']}`}>
        <span className={styles.wsDot} />
        本地直连
      </div>
    )
  }
  const label = { connected: '已连接', connecting: '连接中…', disconnected: '未连接' }[status] || '未知'
  return (
    <div className={`${styles.wsPill} ${styles['ws_' + status]}`}>
      <span className={styles.wsDot} />
      {label}
    </div>
  )
}
