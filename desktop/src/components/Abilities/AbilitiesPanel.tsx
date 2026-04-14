import { useAppStore } from '../../store/app'
import styles from './AbilitiesPanel.module.css'

interface Ability {
  id: string
  icon: string
  name: string
  desc: string
  executor: 'client' | 'server'
  executorLabel: string
  tools: string[]
}

const ABILITIES: Ability[] = [
  {
    id: 'file',
    icon: '📁',
    name: '文件操作',
    desc: '读取、写入、列举和删除本机文件与目录，让 Agent 直接操作你的本地文件系统',
    executor: 'client',
    executorLabel: '本机执行',
    tools: ['file_read', 'file_write', 'file_list', 'file_delete'],
  },
  {
    id: 'shell',
    icon: '💻',
    name: '命令行执行',
    desc: '在宿主机或沙箱容器中运行 Shell 命令，支持脚本、包管理器、系统操作等',
    executor: 'client',
    executorLabel: '本机执行',
    tools: ['shell_exec'],
  },
  {
    id: 'search',
    icon: '🌐',
    name: '网页搜索',
    desc: '通过 Tavily 搜索引擎获取互联网实时信息，支持新闻、文档、技术内容等',
    executor: 'server',
    executorLabel: '服务端执行',
    tools: ['web_search'],
  },
  {
    id: 'browser',
    icon: '🖥️',
    name: '浏览器自动化',
    desc: '控制本地浏览器进行页面导航、截图、元素点击和文字输入，可操作任意网页',
    executor: 'client',
    executorLabel: '本机执行',
    tools: ['browser_navigate', 'browser_screenshot', 'browser_click', 'browser_type'],
  },
  {
    id: 'http',
    icon: '🔌',
    name: 'HTTP 请求',
    desc: '向任意外部接口发送 GET、POST 等 HTTP 请求，可用于调用 API、获取数据',
    executor: 'server',
    executorLabel: '服务端执行',
    tools: ['http_request'],
  },
]

export default function AbilitiesPanel() {
  const { securityConfig, setSecurityConfig } = useAppStore()

  const isAutoApproved = (ability: Ability) =>
    ability.tools.every(t => securityConfig.toolWhitelist.includes(t))

  const isSomeApproved = (ability: Ability) =>
    ability.tools.some(t => securityConfig.toolWhitelist.includes(t))

  const toggleAutoApprove = (ability: Ability) => {
    const all = isAutoApproved(ability)
    const current = securityConfig.toolWhitelist
    let next: string[]
    if (all) {
      next = current.filter(t => !ability.tools.includes(t))
    } else {
      next = Array.from(new Set([...current, ...ability.tools]))
    }
    setSecurityConfig({ toolWhitelist: next })
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h2 className={styles.title}>能力</h2>
        <p className={styles.subtitle}>Agent 可使用的工具能力，开启"自动执行"后无需每次确认</p>
      </div>

      <div className={styles.list}>
        {ABILITIES.map((ability) => {
          const auto = isAutoApproved(ability)
          const partial = !auto && isSomeApproved(ability)

          return (
            <div key={ability.id} className={`${styles.card} ${auto ? styles.cardActive : ''}`}>
              <div className={styles.cardLeft}>
                <span className={styles.cardIcon}>{ability.icon}</span>
              </div>

              <div className={styles.cardBody}>
                <div className={styles.cardHead}>
                  <span className={styles.cardName}>{ability.name}</span>
                  <span className={`${styles.executorBadge} ${ability.executor === 'client' ? styles.badgeClient : styles.badgeServer}`}>
                    {ability.executorLabel}
                  </span>
                </div>
                <p className={styles.cardDesc}>{ability.desc}</p>
                <div className={styles.toolChips}>
                  {ability.tools.map(t => (
                    <span key={t} className={`${styles.chip} ${securityConfig.toolWhitelist.includes(t) ? styles.chipOn : ''}`}>
                      {t}
                    </span>
                  ))}
                </div>
              </div>

              <div className={styles.cardRight}>
                <span className={styles.autoLabel}>{auto ? '自动执行' : partial ? '部分' : '需确认'}</span>
                <button
                  role="switch"
                  aria-checked={auto}
                  className={`${styles.toggle} ${auto ? styles.toggleOn : ''}`}
                  onClick={() => toggleAutoApprove(ability)}
                  title={auto ? '关闭自动执行' : '开启自动执行'}
                >
                  <span className={styles.toggleThumb} />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <div className={styles.footer}>
        <span className={styles.footerHint}>
          💡 "自动执行"等同于将工具加入安全设置的工具白名单，可在设置中精细管理
        </span>
      </div>
    </div>
  )
}
