/**
 * ChatMessage — Renders user/assistant/tool messages.
 * Supports markdown + syntax highlighting for assistant,
 * and an interactive tool call card with risk level badge.
 */
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
        <div className={styles.userBubble + ' selectable'}>{message.content}</div>
        {avatarData
          ? <img src={avatarData} className={styles.userAvatar} alt="me" />
          : <div className={styles.userAvatarDefault}>🐾</div>
        }
      </div>
    )
  }

  if (message.role === 'tool' && message.toolCalls?.length) {
    return (
      <div className={styles.row}>
        {message.toolCalls.map((tc) => (
          <ToolCallCard key={tc.callId} tc={tc} />
        ))}
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
  const riskColor = RISK_COLOR[tc.riskLevel] || 'var(--text-muted)'
  const statusLabel = {
    pending: '等待确认',
    confirmed: '已确认',
    denied: '已拒绝',
    executing: '执行中…',
    done: '完成',
    error: '出错',
  }[tc.status]

  return (
    <div className={styles.toolCard}>
      <div className={styles.toolHeader}>
        <span className={styles.toolIcon}>🔧</span>
        <span className={styles.toolName}>{tc.tool}</span>
        <span className={styles.riskBadge} style={{ color: riskColor }}>
          {tc.riskLevel}
        </span>
        <span className={styles.toolStatus}>{statusLabel}</span>
      </div>

      <pre className={styles.toolArgs}>{JSON.stringify(tc.args, null, 2)}</pre>

      {tc.reason && (
        <div className={styles.toolReason}>⚠️ {tc.reason}</div>
      )}

      {(tc.riskLevel === 'MEDIUM' || tc.riskLevel === 'HIGH') && tc.status === 'pending' && (
        <div className={styles.toolActions}>
          <button
            className={styles.denyBtn}
            onClick={() => denyTool(tc.callId)}
          >
            拒绝
          </button>
          <button
            className={styles.confirmBtn}
            onClick={() => confirmTool(tc.callId, tc.tool, tc.args)}
          >
            {tc.riskLevel === 'HIGH' ? '确认执行（高风险）' : '确认'}
          </button>
        </div>
      )}

      {tc.result && (
        <pre className={styles.toolResult}>{tc.result}</pre>
      )}
    </div>
  )
}
