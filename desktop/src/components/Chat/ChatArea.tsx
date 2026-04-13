import { useRef, useEffect, KeyboardEvent } from 'react'
import { useAppStore } from '../../store/app'
import { CatAvatar } from '../CatAvatar/CatAvatar'
import { ChatMessage } from './ChatMessage'
import { useWebSocket } from '../../hooks/useWebSocket'
import styles from './ChatArea.module.css'
import { useState } from 'react'

export function ChatArea() {
  const {
    activeSessionId,
    messagesBySession,
    catState,
    wsStatus,
    activeSkillId,
  } = useAppStore()

  const messages = activeSessionId ? (messagesBySession[activeSessionId] ?? []) : []
  const { sendMessage } = useWebSocket(activeSessionId)

  const [input, setInput] = useState('')
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

  if (!activeSessionId) {
    return (
      <div className={styles.emptyState}>
        <CatAvatar state="idle" size={160} />
        <p className={styles.emptyText}>选择一个对话，或新建一个开始吧 ฅ^•ﻌ•^ฅ</p>
      </div>
    )
  }

  return (
    <div className={styles.chatArea}>
      {/* Top bar */}
      <div className={styles.topBar}>
        <WsStatusPill status={wsStatus} />
        <div className={styles.windowControls}>
          <button onClick={() => window.nekoBridge?.window.minimize()}>─</button>
          <button onClick={() => window.nekoBridge?.window.maximize()}>□</button>
          <button className={styles.closeBtn} onClick={() => window.nekoBridge?.window.close()}>✕</button>
        </div>
      </div>

      {/* Cat avatar area */}
      <div className={styles.catZone}>
        <CatAvatar state={catState} size={120} />
      </div>

      {/* Messages */}
      <div className={styles.messages}>
        {messages.map((m) => (
          <ChatMessage key={m.id} message={m} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className={styles.inputArea}>
        <textarea
          className={styles.textarea}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="有什么我可以帮你的？（Ctrl+Enter 发送）"
          rows={3}
        />
        <button
          className={styles.sendBtn}
          onClick={handleSend}
          disabled={!input.trim()}
        >
          ➤
        </button>
      </div>
    </div>
  )
}

function WsStatusPill({ status }: { status: string }) {
  const label = { connected: '已连接', connecting: '连接中…', disconnected: '未连接' }[status] || '未知'
  return (
    <div className={`${styles.wsPill} ${styles['ws_' + status]}`}>
      <span className={styles.wsDot} />
      {label}
    </div>
  )
}
