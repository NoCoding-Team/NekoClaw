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
import { ChatMessage as ChatMsg, ToolCall, TurnSegment, useAppStore } from '../../store/app'
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

  // 混合轮次：按 segments 顺序渲染文本和工具卡片
  if (message.role === 'assistant' && message.segments?.length) {
    return (
      <div className={styles.row}>
        <img src="/avatar.png" className={styles.catAvatar} alt="NekoClaw" />
        <div className={styles.aiBubble + ' selectable'}>
          {message.segments.map((seg, idx) => (
            <SegmentBlock key={idx} segment={seg} isLast={idx === message.segments!.length - 1} />
          ))}
          {message.streaming && !message.content?.trim() && (
            <div className={styles.toolResponse}>
              <ThinkingDots />
            </div>
          )}
        </div>
      </div>
    )
  }

  // 有 toolCalls 但没有 segments（兼容旧数据/服务端加载）
  if (message.role === 'assistant' && message.toolCalls?.length) {
    return (
      <div className={styles.row}>
        <img src="/avatar.png" className={styles.catAvatar} alt="NekoClaw" />
        <div className={styles.aiBubble + ' selectable'}>
          <div className={styles.toolCardListInline}>
            {message.toolCalls.map((tc) => (
              <ToolCallCard key={tc.callId} tc={tc} />
            ))}
          </div>
          {(message.content || message.streaming) && (
            <div className={styles.toolResponse}>
              {message.streaming && !message.content
                ? <ThinkingDots />
                : <AiMarkdown content={message.content || ''} />
              }
            </div>
          )}
        </div>
      </div>
    )
  }

  // 独立 tool 消息（合并后一般不会出现，兼容敏管）
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

  // Assistant 纯文本——跳过空内容非流式消息
  if (!message.content && !message.streaming) return null

  return (
    <div className={styles.row}>
      <img src="/avatar.png" className={styles.catAvatar} alt="NekoClaw" />
      <div className={styles.aiBubble + ' selectable'}>
        {message.streaming && !message.content
          ? <ThinkingDots />
          : <AiMarkdown content={message.content || (message.streaming ? '▋' : '')} />
        }
      </div>
    </div>
  )
}

function SegmentBlock({ segment, isLast }: { segment: TurnSegment; isLast: boolean }) {
  if (segment.type === 'text') {
    return (
      <div className={isLast ? undefined : styles.segmentText}>
        <AiMarkdown content={segment.content} />
      </div>
    )
  }
  return (
    <div className={styles.toolCardListInline}>
      {segment.toolCalls.map((tc) => (
        <ToolCallCard key={tc.callId} tc={tc} />
      ))}
    </div>
  )
}

function AiMarkdown({ content }: { content: string }) {
  return (
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
      {content}
    </ReactMarkdown>
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

/** 内联三点动画（用于 AI 气泡内部） */
function ThinkingDots() {
  return (
    <div className={styles.thinkingDots}>
      <span className={styles.thinkingDot} />
      <span className={styles.thinkingDot} />
      <span className={styles.thinkingDot} />
    </div>
  )
}

/** AI 思考中气泡——三个跳动圆点 */
export function ThinkingBubble() {
  return (
    <div className={styles.row}>
      <img src="/avatar.png" className={styles.catAvatar} alt="NekoClaw" />
      <div className={styles.thinkingBubble}>
        <span className={styles.thinkingDot} />
        <span className={styles.thinkingDot} />
        <span className={styles.thinkingDot} />
      </div>
    </div>
  )
}
