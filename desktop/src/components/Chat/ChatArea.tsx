import { ArrowUp, ImagePlus } from 'lucide-react';
import { useRef, useEffect, KeyboardEvent, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useAppStore, ChatMessage as ChatMsg, ToolCall, TurnSegment } from '../../store/app'
import { CatAvatar } from '../CatAvatar/CatAvatar'
import { ChatMessage, ThinkingBubble } from './ChatMessage'
import { sendMessageExternal } from '../../hooks/useWebSocket'
import styles from './ChatArea.module.css'
import { AssetsPanel } from './AssetsPanel'
import { apiFetch } from '../../api/apiFetch'
import { useToast } from '../../hooks/useToast'
import Toast from '../Toast/Toast'

/**
 * 将同一 agent 轮次（两条 user 消息之间）的消息合并为单一气泡，
 * 按时间顺序保留所有文本和工具段落：文本 → 工具 → 文本 → 工具 → …
 *
 * @param agentBusy  当 catState 为 thinking/working 时传 true，
 *                   让最后一个含工具的轮次显示内嵌加载动画。
 */
function groupToolMessages(msgs: ChatMsg[], agentBusy = false): ChatMsg[] {
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
      // 无工具调用：合并同一轮次的多条 assistant 消息为一条
      const assistantMsgs = turnMsgs.filter(m => m.role === 'assistant')
      if (assistantMsgs.length <= 1) {
        result.push(...turnMsgs)
      } else {
        const merged = assistantMsgs.filter(m => m.content.trim()).map(m => m.content).join('\n\n')
        const lastA = [...assistantMsgs].reverse().find(m => m.content.trim()) ?? assistantMsgs[assistantMsgs.length - 1]
        result.push({
          id: assistantMsgs[0].id,
          role: 'assistant',
          content: merged || lastA.content,
          streaming: lastA.streaming,
        })
      }
      continue
    }

    // 构建 segments：按消息原始顺序，相邻同类型段合并
    const segments: TurnSegment[] = []
    for (const m of turnMsgs) {
      if (m.role === 'assistant' && m.content.trim()) {
        segments.push({ type: 'text', content: m.content })
      } else if (m.role === 'tool' && m.toolCalls?.length) {
        const last = segments[segments.length - 1]
        if (last?.type === 'tools') {
          last.toolCalls.push(...m.toolCalls)
        } else {
          segments.push({ type: 'tools', toolCalls: [...m.toolCalls] })
        }
      }
    }

    // 最后一条 assistant 可能正在 streaming（content 还是空的）
    const lastAssistant = [...turnMsgs].reverse().find(m => m.role === 'assistant')
    let isStreaming = lastAssistant?.streaming

    // 若本 turn 是最后一个且 agent 仍在忙（thinking/working），
    // 标记为 streaming 以在气泡内部显示加载动画，而非单独一行
    const isLastTurn = i >= msgs.length
    if (isLastTurn && agentBusy && !lastAssistant?.content?.trim()) {
      isStreaming = true
    }

    result.push({
      id: turnMsgs[0].id,
      role: 'assistant',
      toolCalls: allToolCalls,
      content: lastAssistant?.content ?? '',
      streaming: isStreaming,
      segments,
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
    serverUrl,
    setMessages,
    addSession,
    setActiveSession,
    appendMessage,
    setCatState,
  } = useAppStore()

  const messages = activeSessionId ? (messagesBySession[activeSessionId] ?? []) : []
  // WebSocket 连接由 App 级别的 WebSocketManager 统一管理
  // ChatArea 只需调用模块级的 sendMessageExternal

  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const { toast, dismissToast } = useToast()

  // 切换会话时重置加载状态
  useEffect(() => {
    setLoadFailed(false)
  }, [activeSessionId])

  // Load history messages when switching to a session
  useEffect(() => {
    if (!activeSessionId) return

    // local- sessions have no persisted messages (transient until first send)
    if (activeSessionId.startsWith('local-')) return

    if (messagesBySession[activeSessionId]?.length) return   // already loaded
    setIsLoadingHistory(true)
    setLoadFailed(false)
    ;(async () => {
      try {
        const res = await apiFetch(`${serverUrl}/api/sessions/${activeSessionId}/messages`)
        if (!res.ok) {
          setLoadFailed(true)
          return
        }
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
        setLoadFailed(true)
      } finally {
        setIsLoadingHistory(false)
      }
    })()
  }, [activeSessionId, reloadKey])

  // Always route through backend WebSocket
  const sendMessage = sendMessageExternal

  const [input, setInput] = useState('')
  const [showAssets, setShowAssets] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const tx = document.querySelectorAll('textarea');
    tx.forEach(t => {
      t.style.height = 'auto';
      t.style.height = Math.min(t.scrollHeight, 200) + 'px';
    });
  }, [input])

  // 延迟发送：新建对话时先创建 session，等 activeSessionId 更新后再发
  const pendingMsgRef = useRef<string | null>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  // 进入思考状态时滚动到底部，让三点气泡可见
  useEffect(() => {
    if (catState === 'thinking') {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [catState])

  // 当 activeSessionId 刚切换过来，且有待发消息时触发
  useEffect(() => {
    if (pendingMsgRef.current && activeSessionId) {
      const text = pendingMsgRef.current
      pendingMsgRef.current = null
      sendMessage(text)
    }
  }, [activeSessionId])

  const handleSend = () => {
    const text = input.trim()
    if (!text || catState === 'thinking') return
    if (!activeSessionId) {
      // 第一条消息时才真正创建 session（内存态 local-，Branch A 会在发送时迁移到服务器）
      const newId = `local-${Date.now()}`
      addSession({ id: newId, title: '新对话' })
      setActiveSession(newId)
      // 立刻写入用户消息，避免欢迎屏闪烁；并进入思考态让三点气泡立即出现
      appendMessage(newId, { id: uuidv4(), role: 'user', content: text })
      setCatState('thinking')
      pendingMsgRef.current = text
      setInput('')
      return
    }
    sendMessage(text)
    setInput('')
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // ── 无会话选中（无 activeSessionId）→ 直接展示欢迎输入界面，命中下方 messages.length===0 分支 ──

  // ── 历史消息加载中 ────────────────────────────────────────────────────────────
  if (isLoadingHistory) {
    return (
      <div className={styles.chatArea}>
        <div className={styles.topBar}>
          <WsStatusPill status={wsStatus} />
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
          <WsStatusPill status={wsStatus} />
          <span className={styles.topBarSpacer} />
          <WindowControls />
        </div>
        {showAssets && <AssetsPanel onClose={() => setShowAssets(false)} />
        }
        {loadFailed ? (
          <div className={styles.loadErrorWrap}>
            <CatAvatar state="idle" size={80} />
            <p className={styles.loadErrorText}>消息加载失败，可能是网络问题或会话已不存在</p>
            <button
              className={styles.retryBtn}
              onClick={() => { setLoadFailed(false); setReloadKey(k => k + 1) }}
            >
              重新加载
            </button>
          </div>
        ) : (
        <div className={styles.welcomeCenter}>
          <CatAvatar state={catState} size={100} />
          <h2 className={styles.welcomeGreeting}>嗯，有什么需要我帮忙的？</h2>
          <div className={styles.composer}>
            <button 
              className={styles.attBtn} 
              onClick={() => setShowAssets(v => !v)}
              title="资产和图片"
            >
              <ImagePlus size={18} strokeWidth={2.2} />
            </button>
            <div className={styles.textareaContainer}>
              <textarea
                className={styles.textarea}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="想说什么，慢慢打字也没关系…"
                rows={1}
              />
            </div>
            <button className={styles.sendBtn} onClick={handleSend} disabled={!input.trim() || catState === 'thinking'}><ArrowUp size={22} strokeWidth={2.5} /></button>
          </div>
        </div>
        )}
        <Toast message={toast} onClose={dismissToast} />
      </div>
    )
  }

  // ── 正常对话 ────────────────────────────────────────────────────────────────
  return (
    <div className={styles.chatArea}>
      <div className={styles.topBar}>
        <WsStatusPill status={wsStatus} />
        <span className={styles.topBarSpacer} />
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
      <div className={styles.mainContainer}>
        <div className={styles.chatCard}>
          <div className={styles.messages}>
            {(() => {
              const agentBusy = catState === 'thinking' || catState === 'working'
              const grouped = groupToolMessages(messages, agentBusy)
              const lastHasTools = grouped.length > 0 && (grouped[grouped.length - 1].toolCalls?.length ?? 0) > 0
              return (
                <>
                  {grouped.map((m) => (
                    <ChatMessage key={m.id} message={m} />
                  ))}
                  {agentBusy && !messages.some(m => m.streaming) && !lastHasTools && <ThinkingBubble />}
                </>
              )
            })()}
            <div ref={bottomRef} />
          </div>
        </div>
        <div className={styles.composer}>
          <button 
            className={styles.attBtn} 
            onClick={() => setShowAssets(v => !v)}
            title="资产和图片"
          >
            <ImagePlus size={18} strokeWidth={2.2} />
          </button>
          <div className={styles.textareaContainer}>
            <textarea
              className={styles.textarea}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="想说什么，慢慢打字也没关系…"
              rows={1}
            />
          </div>
          <button className={styles.sendBtn} onClick={handleSend} disabled={!input.trim() || catState === 'thinking'}><ArrowUp size={22} strokeWidth={2.5} /></button>
        </div>
      </div>
      <Toast message={toast} onClose={dismissToast} />
    </div>
  )
}

function WsStatusPill({ status }: { status: string }) {
  const token = useAppStore((s) => s.token)
  // 有 token 即视为已连接服务器；仅在 WS 正在握手时显示"连接中"
  const effective = status === 'connecting' ? 'connecting' : token ? 'connected' : 'disconnected'
  const label = { connected: '已连接', connecting: '连接中…', disconnected: '未连接' }[effective] || '未知'
  return (
    <div className={`${styles.wsPill} ${styles['ws_' + effective]}`}>
      <span className={styles.wsDot} />
      {label}
    </div>
  )
}
