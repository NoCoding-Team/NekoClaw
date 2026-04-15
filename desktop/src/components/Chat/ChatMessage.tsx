/**
 * ChatMessage — Renders user/assistant/tool messages.
 * Supports markdown + syntax highlighting for assistant,
 * and an interactive tool call card with risk level badge.
 */
import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { ChatMessage as ChatMsg, ToolCall, useAppStore } from '../../store/app'
import { confirmTool, denyTool } from '../../hooks/useWebSocket'
import styles from './ChatMessage.module.css'

interface Props {
  message: ChatMsg
}

const RISK_COLOR: Record<string, string> = {
  LOW: 'var(--success)',
  MEDIUM: 'var(--warn)',
  HIGH: 'var(--danger)',
  DENY: 'var(--danger)',
}

export function ChatMessage({ message }: Props) {
  const avatarData = useAppStore((s) => s.avatarData)

  if (message.role === 'user') {
    return (
      <div className={styles.row + ' ' + styles.userRow}>
        {avatarData
          ? <img src={avatarData} className={styles.userAvatar} alt="me" />
          : <div className={styles.userAvatarDefault}>🐾</div>
        }
        <div className={styles.userBubble + ' selectable'}>{message.content}</div>
      </div>
    )
  }

  if (message.role === 'tool' && message.toolCalls?.length) {
    return (
      <div className={styles.row}>
        <img src="/avatar.png" className={styles.catAvatar} alt="NekoClaw" />
        <div className={styles.toolCardList}>
          {message.toolCalls.map((tc) => (
            <ToolCallCard key={tc.callId} tc={tc} />
          ))}
        </div>
      </div>
    )
  }

  // Assistant
  return (
    <div className={styles.row}>
      <img src="/avatar.png" className={styles.catAvatar} alt="NekoClaw" />
      <div className={styles.aiBubble + ' selectable'}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            code({ className, children, ...props }) {
              const match = /language-(\w+)/.exec(className || '')
              if (match) {
                return (
                  <SyntaxHighlighter
                    style={oneDark}
                    language={match[1]}
                    PreTag="div"
                  >
                    {String(children).replace(/\n$/, '')}
                  </SyntaxHighlighter>
                )
              }
              return <code className={styles.inlineCode} {...props}>{children}</code>
            },
          }}
        >
          {message.content || (message.streaming ? '▋' : '')}
        </ReactMarkdown>
      </div>
    </div>
  )
}

function ToolCallCard({ tc }: { tc: ToolCall }) {
  const [argsOpen, setArgsOpen] = useState(false)
  const riskColor = RISK_COLOR[tc.riskLevel] || 'var(--text-muted)'
  const isDone = tc.status === 'done' || tc.status === 'error'
  const statusMeta: Record<string, { label: string; dim?: boolean }> = {
    pending:   { label: '等待确认' },
    confirmed: { label: '已确认', dim: true },
    denied:    { label: '已拒绝', dim: true },
    executing: { label: '执行中…' },
    done:      { label: '完成', dim: true },
    error:     { label: '出错' },
  }
  const { label, dim } = statusMeta[tc.status] ?? { label: tc.status }

  // 尝试解析结果 JSON 显示简洁提示
  let resultSummary: string | null = null
  if (tc.result) {
    try {
      const parsed = JSON.parse(tc.result)
      if (parsed && typeof parsed === 'object' && 'success' in parsed) {
        resultSummary = parsed.success ? '✓ 成功' : `✗ ${parsed.error ?? '失败'}`
      } else {
        resultSummary = tc.result.length > 60 ? tc.result.slice(0, 60) + '…' : tc.result
      }
    } catch {
      resultSummary = tc.result.length > 60 ? tc.result.slice(0, 60) + '…' : tc.result
    }
  }

  return (
    <div className={`${styles.toolCard} ${isDone ? styles.toolCardDone : ''}`}>
      <div className={styles.toolHeader}>
        <span className={styles.toolIconWrap}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M9.5 1a.5.5 0 0 1 .5.5v1h1.5A1.5 1.5 0 0 1 13 4v8a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 12V4a1.5 1.5 0 0 1 1.5-1.5H6v-1a.5.5 0 0 1 1 0v1h2v-1a.5.5 0 0 1 .5-.5z"/>
          </svg>
        </span>
        <span className={styles.toolName}>{tc.tool}</span>
        <span className={styles.riskBadge} style={{ color: riskColor }}>{tc.riskLevel}</span>
        <button
          className={styles.toolArgsToggle}
          onClick={() => setArgsOpen(v => !v)}
          title="查看参数"
        >
          {argsOpen ? '▴' : '▾'}
        </button>
        {resultSummary && (
          <span className={`${styles.toolResultChip} ${tc.status === 'error' ? styles.toolResultChipErr : ''}`}>
            {resultSummary}
          </span>
        )}
        <span className={`${styles.toolStatus} ${dim ? styles.toolStatusDim : ''}`}>{label}</span>
      </div>

      {argsOpen && (
        <pre className={styles.toolArgs}>{JSON.stringify(tc.args, null, 2)}</pre>
      )}

      {tc.reason && (
        <div className={styles.toolReason}>⚠️ {tc.reason}</div>
      )}

      {(tc.riskLevel === 'MEDIUM' || tc.riskLevel === 'HIGH') && tc.status === 'pending' && (
        <div className={styles.toolActions}>
          <button className={styles.denyBtn} onClick={() => denyTool(tc.callId)}>拒绝</button>
          <button className={styles.confirmBtn} onClick={() => confirmTool(tc.callId, tc.tool, tc.args)}>
            {tc.riskLevel === 'HIGH' ? '确认执行（高风险）' : '确认'}
          </button>
        </div>
      )}
    </div>
  )
}
