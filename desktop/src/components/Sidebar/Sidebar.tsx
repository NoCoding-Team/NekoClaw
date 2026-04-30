import { useState } from 'react'
import styles from './Sidebar.module.css'
import { useAppStore } from '../../store/app'
import { apiFetch } from '../../api/apiFetch'

import { MessageSquare, Clock, Brain, Puzzle, Palette, Zap, Settings, PawPrint, Plus, MoreHorizontal, X, ArrowLeftFromLine, ArrowRightFromLine } from 'lucide-react'

type Tab = 'sessions' | 'tasks' | 'memory' | 'personalization' | 'settings' | 'abilities' | 'skills'

const RAIL_ITEMS: { id: Exclude<Tab, 'settings'>; icon: React.ReactNode; label: string }[] = [
  { id: 'sessions',        icon: <MessageSquare size={18} strokeWidth={2} />, label: '会话'   },
  { id: 'tasks',           icon: <Clock size={18} strokeWidth={2} />,         label: '猫钟'   },
  { id: 'memory',          icon: <Brain size={18} strokeWidth={2} />,         label: '猫脑'   },
  { id: 'skills',          icon: <Puzzle size={18} strokeWidth={2} />,        label: '猫技'   },
  { id: 'personalization', icon: <Palette size={18} strokeWidth={2} />,       label: '猫样'   },
  { id: 'abilities',       icon: <Zap size={18} strokeWidth={2} />,           label: '爪力'   },
]

const SECTION_LABEL_MAP: Record<Tab, string> = {
  sessions: '聊天列表',
  tasks: '猫钟 · 定时任务',
  memory: '猫脑 · 记忆库',
  personalization: '猫样 · 个性化',
  settings: '猫档 · 设置',
  abilities: '爪力 · 能力',
  skills: '猫技 · 技能库',
}

export function Sidebar() {
  const { sidebarTab, setSidebarTab, sessions, activeSessionId, setActiveSession, removeSession, setSettingsOpen, serverUrl } = useAppStore()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [userCollapsed, setUserCollapsed] = useState(false)

  // Automatically collapse the pane if we are not in the 'sessions' tab.
  const isCollapsed = userCollapsed || sidebarTab !== 'sessions'

  const deleteSession = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (deletingId) return
    setDeletingId(id)
    try {
      if (!id.startsWith('local-')) {
        await apiFetch(`${serverUrl}/api/sessions/${id}`, {
          method: 'DELETE',
        })
      }
      removeSession(id)
    } finally {
      setDeletingId(null)
    }
  }

  const createNewSession = () => {
    // 不立即创建会话，只清空选中态回到欢迎页；发送第一条消息时再创建
    setActiveSession(null)
    setSidebarTab('sessions')
  }

  return (
    <aside className={`${styles.sidebar} ${isCollapsed ? styles.sidebarCollapsed : ''}`}>
      <div className={styles.iconRail}>
        <div className={styles.railTop}>
          {RAIL_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`${styles.railBtn} ${sidebarTab === item.id ? styles.railBtnActive : ''}`}
              onClick={() => setSidebarTab(item.id)}
              title={item.label}
            >
              <span>{item.icon}</span>
            </button>
          ))}
          <button
            className={styles.railBtn}
            onClick={() => setSettingsOpen(true)}
            title="猫档"
          >
            <span><Settings size={18} strokeWidth={2} /></span>
          </button>
        </div>
        <div className={styles.railBottom}>
          <button 
            className={styles.foldBtn} 
            onClick={() => setUserCollapsed(!userCollapsed)} 
            disabled={sidebarTab !== 'sessions'}
            style={{ opacity: sidebarTab !== 'sessions' ? 0.3 : 1, cursor: sidebarTab !== 'sessions' ? 'not-allowed' : 'pointer' }}
            title={isCollapsed ? "展开" : "收起轨"}
          >
            {isCollapsed ? <ArrowRightFromLine size={12} strokeWidth={2} color="#6b5b7e" /> : <ArrowLeftFromLine size={12} strokeWidth={2} color="#6b5b7e" />}
          </button>
          <span className={styles.foldHint}>{isCollapsed ? "展开" : "收起轨"}</span>
        </div>
      </div>

      <div className={`${styles.pane} ${isCollapsed ? styles.paneCollapsed : ''}`}>
        <div className={styles.logo}>
          <span className={styles.logoIcon}><PawPrint size={18} strokeWidth={2.5} color="#C45B7A" /></span>
          <span className={styles.logoText}>NekoClaw</span>
        </div>

        <div className={styles.topActions}>
          <button className={styles.newBtn} onClick={createNewSession}>
            <Plus size={16} strokeWidth={2.5} className={styles.newBtnPlus} />
            <span>开一条新生</span>
          </button>
        </div>

        <div className={styles.sectionLabel}>{SECTION_LABEL_MAP[sidebarTab]}</div>

        <div className={styles.sessionList}>
          {sidebarTab === 'sessions' ? (
            sessions.filter(s => s.source !== 'scheduled_task').length === 0 ? (
              <div className={styles.emptyHint}>暂无对话</div>
            ) : (
              sessions.filter(s => s.source !== 'scheduled_task').map((s) => (
                <div
                  key={s.id}
                  className={`${styles.sessionItem} ${activeSessionId === s.id ? styles.sessionActive : ''}`}
                  onClick={() => { setActiveSession(s.id); setSidebarTab('sessions') }}
                >
                  <span className={styles.sessionTitle}>{s.title}</span>
                  <button
                    className={styles.sessionDeleteBtn}
                    onClick={(e) => deleteSession(e, s.id)}
                    disabled={deletingId === s.id}
                    title="删除对话"
                  >
                    {deletingId === s.id ? <MoreHorizontal size={14} strokeWidth={2} /> : <X size={14} strokeWidth={2} />}
                  </button>
                </div>
              ))
            )
          ) : (
            <div className={styles.emptyHint} style={{ marginTop: '20px', lineHeight: 1.6, padding: '0 10px', fontSize: '13px' }}>
              {sidebarTab === 'tasks' && '在这个页面管理小猫的定时任务和提醒。'}
              {sidebarTab === 'memory' && '记忆库，存放着小猫记住的所有重要事情。'}
              {sidebarTab === 'personalization' && '个性化设置，调整小猫的外观和性格。'}
              {sidebarTab === 'abilities' && '爪力面板，管理小猫的工具和接口能力。'}
              {sidebarTab === 'skills' && '技能库，赋予小猫解决特定问题的魔法。'}
            </div>
          )}
        </div>

        <div className={styles.bottomBar}>
          <div className={styles.bottomBarInner}>
            <button
              className={styles.bottomBtn}
              onClick={() => setSettingsOpen(true)}
              title="猫档"
            >
              <span className={styles.bottomIcon}><Settings size={14} strokeWidth={2} /></span>
              <span className={styles.bottomLabel}>猫档</span>
            </button>

            <div className={styles.bottomActions}>
              <button
                className={`${styles.iconBtn} ${sidebarTab === 'abilities' ? styles.bottomBtnActive : ''}`}
                onClick={() => setSidebarTab('abilities')}
                title="爪力"
              >
                <Zap size={14} strokeWidth={2} />
              </button>
              <button
                className={`${styles.iconBtn} ${sidebarTab === 'skills' ? styles.bottomBtnActive : ''}`}
                onClick={() => setSidebarTab('skills')}
                title="猫技"
              >
                <Puzzle size={14} strokeWidth={2} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}
