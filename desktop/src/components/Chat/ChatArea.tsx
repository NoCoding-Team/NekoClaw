import { useRef, useEffect, KeyboardEvent, useState } from 'react'
import { useAppStore, ChatMessage as ChatMsg, ToolCall } from '../../store/app'
import { CatAvatar } from '../CatAvatar/CatAvatar'
import { ChatMessage } from './ChatMessage'
import { useWebSocket } from '../../hooks/useWebSocket'
import { useLocalLLM } from '../../hooks/useLocalLLM'
import styles from './ChatArea.module.css'
import { SkillSelector } from './SkillSelector'
import { AssetsPanel } from './AssetsPanel'
import { apiFetch } from '../../api/apiFetch'

/**
 * 将同一 agent 轮次（两条 user 消息之间）的所有工具调用合并为单一气泡。
 *
 * 根因：多轮工具调用时，每轮 LLM 迭代都会在 store 里插入一条新的空 assistant
 * 占位消息，把连续 tool 消息链打断，简单的"连续合并"无法覆盖此场景。
 * 正确做法：以 user 消息为分割点划分 agent turn，将 turn 内全部 toolCalls
 * 收集到一条 assistant 消息里，取最后一条 assistant 的 content/streaming 作为回复。
 */
function groupToolMessages(msgs: ChatMsg[]): ChatMsg[] {
  const result: ChatMsg[] = []
  let i = 0

  while (i < msgs.length) {
    const msg = msgs[i]

    if (msg.role === 'user') {
      result.push(msg)
      i++
      continue
    }

    // 收集从 i 开始直到下一条 user 消息（不含）的整个 agent turn
    const turnStart = i
    while (i < msgs.length && msgs[i].role !== 'user') {
      i++
    }
    const turnMsgs = msgs.slice(turnStart, i)

    // 汇总该 turn 内所有 toolCalls
    const allToolCalls: ToolCall[] = []
    for (const m of turnMsgs) {
      if (m.role === 'tool') allToolCalls.push(...(m.toolCalls ?? []))
    }

    if (allToolCalls.length === 0) {
      // 无工具调用：逐条推入，ChatMessage 内部会过滤空消息
      result.push(...turnMsgs)
      continue
    }

    // 取最后一条 assistant 消息作为最终回复
    let finalContent = ''
    let isStreaming: boolean | undefined
    for (let k = turnMsgs.length - 1; k >= 0; k--) {
      if (turnMsgs[k].role === 'assistant') {
        finalContent = turnMsgs[k].content
        isStreaming = turnMsgs[k].streaming
        break
      }
    }

    result.push({
      id: turnMsgs[0].id,
      role: 'assistant',
      toolCalls: allToolCalls,
      content: finalContent,
      streaming: isStreaming,
    })
  }

  return result
}

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
  } = useAppStore()

  const messages = activeSessionId ? (messagesBySession[activeSessionId] ?? []) : []
  const { sendMessage: wsSend } = useWebSocket(localLLMConfig ? null : activeSessionId)
  const { sendMessage: localSend } = useLocalLLM(activeSessionId)

  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [syncSuccess, setSyncSuccess] = useState(false)

  // 同步完成后阻止 useEffect 从服务器重新加载消息（防止覆盖内存中的正确数据）
  const justSyncedIdRef = useRef<string | null>(null)

  // 同步本地会话到服务器
  const syncToServer = async () => {
    if (!activeSessionId?.startsWith('local-') || !token || !serverUrl) return
    setIsSyncing(true)
    setSyncError(null)
    try {
      const db = window.nekoBridge?.db
      if (!db) throw new Error('DB不可用')

      // 1. 获取所有本地消息（包含 tool 消息，保留工具调用卡片）
      const localMsgs = await db.getMessages(activeSessionId)
      const msgs = localMsgs

      // 2. 在服务器创建会话
      const sessionTitle = useAppStore.getState().sessions.find(s => s.id === activeSessionId)?.title ?? '新对话'
      const createRes = await apiFetch(`${serverUrl}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: sessionTitle }),
      })
      if (!createRes.ok) throw new Error(`创建会话失败 ${createRes.status}`)
      const serverSession: { id: string; title: string; skill_id: string | null } = await createRes.json()

      // 3. 逐条上传消息（保证服务端 created_at 严格递增，避免批量上传时时间戳相同导致乱序）
      for (const m of msgs) {
        let tool_calls = null
        if ((m as any).toolCalls) {
          try { tool_calls = typeof (m as any).toolCalls === 'string' ? JSON.parse((m as any).toolCalls) : (m as any).toolCalls } catch { /* ignore */ }
        }
        const created_at = (m as any).createdAt ? new Date((m as any).createdAt).toISOString() : undefined
        const singleRes = await apiFetch(`${serverUrl}/api/sessions/${serverSession.id}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: (m as any).role, content: (m as any).content, tool_calls, created_at }),
        })
        if (!singleRes.ok) throw new Error(`上传消息失败 ${singleRes.status}`)
      }

      // 4. 迁移消息到新会话 ID
      // 先读取内存中的完整消息（含 toolCalls 对象），再原子迁移
      const currentMsgs = useAppStore.getState().messagesBySession[activeSessionId] ?? []
      // 设置 ref 阻止 useEffect 在 activeSessionId 切换时从服务器重新加载
      justSyncedIdRef.current = serverSession.id
      replaceSession(activeSessionId, { id: serverSession.id, title: serverSession.title, skillId: serverSession.skill_id ?? undefined })
      // 兜底：确保消息一定在 store 里（防止 replaceSession 内部取到空数组）
      if (currentMsgs.length > 0) {
        setMessages(serverSession.id, currentMsgs)
      }

      // 6. 硬删除本地 SQLite 记录
      await db.deleteSession(activeSessionId)
      setSyncSuccess(true)
      setTimeout(() => setSyncSuccess(false), 3000)
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

    // 同步刚完成，内存中已经有正确的消息，跳过从服务器/SQLite 重新加载
    if (justSyncedIdRef.current === activeSessionId) {
      justSyncedIdRef.current = null
      return
    }

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
            localMsgs.map((m) => {
              let toolCalls
              if (m.toolCalls) {
                try { toolCalls = JSON.parse(m.toolCalls) } catch { /* malformed, skip */ }
              }
              return { id: m.id, role: m.role as 'user' | 'assistant' | 'tool', content: m.content, toolCalls }
            }),
          )
        } catch {}
      })()
      return
    }

    if (messagesBySession[activeSessionId]?.length) return   // already loaded
    setIsLoadingHistory(true)
    ;(async () => {
      try {
        const res = await apiFetch(`${serverUrl}/api/sessions/${activeSessionId}/messages`)
        if (!res.ok) return
        const data: Array<{ id: string; role: string; content: string | null; tool_calls: ToolCall[] | null; created_at: string }> = await res.json()
        // 服务端已按 seq, created_at 排序，无需客户端重排
        setMessages(
          activeSessionId,
          data.map((m) => ({
            id: m.id,
            role: m.role as 'user' | 'assistant' | 'tool',
            content: m.content ?? '',
            toolCalls: m.tool_calls ?? undefined,
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
          {syncSuccess && <span className={styles.syncSuccessLabel}>✓ 同步成功</span>}
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
        {syncSuccess && <span className={styles.syncSuccessLabel}>✓ 同步成功</span>}
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
        {groupToolMessages(messages).map((m) => (
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
