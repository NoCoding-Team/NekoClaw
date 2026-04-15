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
    setMessages,
  } = useAppStore()

  const messages = activeSessionId ? (messagesBySession[activeSessionId] ?? []) : []
  const { sendMessage: wsSend } = useWebSocket(localLLMConfig ? null : activeSessionId)
  const { sendMessage: localSend } = useLocalLLM(activeSessionId)

  const [isLoadingHistory, setIsLoadingHistory] = useState(false)

  // Load history messages from server when switching to a session that has none cached
  useEffect(() => {
    if (!activeSessionId || activeSessionId.startsWith('local-')) return
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
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
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
                placeholder="有什么我可以帮你的？（Ctrl+Enter 发送）"
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
            placeholder="有什么我可以帮你的？（Ctrl+Enter 发送）"
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
