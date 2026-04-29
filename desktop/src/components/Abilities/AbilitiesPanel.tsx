import { useAppStore } from '../../store/app'
import styles from './AbilitiesPanel.module.css'

interface Ability {
  id: string
  icon: string
  name: string
  desc: string
  executor: 'client' | 'server' | 'memory' | 'skill'
  executorLabel: string
  tools: string[]
  alwaysOn?: boolean
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
    id: 'python',
    icon: '🐍',
    name: 'Python 执行',
    desc: '在安全沙盒容器中运行 Python 代码，预装 numpy、pandas、matplotlib 等科学计算库',
    executor: 'server',
    executorLabel: '服务端执行',
    tools: ['python_repl'],
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
    id: 'http',
    icon: '🔌',
    name: 'HTTP 请求',
    desc: '发送 HTTP 请求，支持自定义方法/Header/Body 和 REST API 调用；parse_html=true 时自动清洗网页为 Markdown',
    executor: 'server',
    executorLabel: '服务端执行',
    tools: ['http_request'],
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
    id: 'knowledge',
    icon: '🧠',
    name: '记忆管理',
    desc: '读取、写入和检索个人记忆文件，让 Agent 把长期记忆保存到记忆库面板可见的位置',
    executor: 'memory',
    executorLabel: '记忆系统',
    tools: ['memory_read', 'memory_write', 'search_memory'],
    alwaysOn: true,
  },
  {
    id: 'skill_read',
    icon: '🧩',
    name: '技能读取',
    desc: '读取猫技库中的技能文件（SKILL.md），让 Agent 按需加载完整的任务操作指南',
    executor: 'skill',
    executorLabel: '技能系统',
    tools: ['read_skill'],
    alwaysOn: true,
  },
]

export default function AbilitiesPanel() {
  const { securityConfig, setSecurityConfig } = useAppStore()

  const isEnabled = (ability: Ability) =>
    ability.alwaysOn || ability.tools.every(t => securityConfig.toolWhitelist.includes(t))

  const isSomeEnabled = (ability: Ability) =>
    ability.tools.some(t => securityConfig.toolWhitelist.includes(t))

  const toggleAbility = (ability: Ability) => {
    const all = isEnabled(ability)
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
        <h2 className={styles.title}>爪力</h2>
        <p className={styles.subtitle}>猫咪可使用的工具爪力，开启"自动施展"后无需每次确认</p>
      </div>

      <div className={styles.list}>
        {ABILITIES.map((ability) => {
          const enabled = isEnabled(ability)
          const partial = !enabled && isSomeEnabled(ability)

          return (
            <div key={ability.id} className={`${styles.card} ${enabled ? styles.cardActive : ''}`}>
              <div className={styles.cardLeft}>
                <span className={styles.cardIcon}>{ability.icon}</span>
              </div>

              <div className={styles.cardBody}>
                <div className={styles.cardHead}>
                  <span className={styles.cardName}>{ability.name}</span>
                  <span className={`${styles.executorBadge} ${ability.executor === 'client' ? styles.badgeClient : ability.executor === 'memory' ? styles.badgeMemory : ability.executor === 'skill' ? styles.badgeSkill : styles.badgeServer}`}>
                    {ability.executorLabel}
                  </span>
                </div>
                <p className={styles.cardDesc}>{ability.desc}</p>
                <div className={styles.toolChips}>
                  {ability.tools.map(t => (
                    <span key={t} className={`${styles.chip} ${ability.alwaysOn || securityConfig.toolWhitelist.includes(t) ? styles.chipOn : ''}`}>
                      {t}
                    </span>
                  ))}
                </div>
              </div>

              <div className={styles.cardRight}>
                {ability.alwaysOn ? (
                  <span className={styles.alwaysOnLabel}>常驻</span>
                ) : (
                  <>
                    <span className={styles.autoLabel}>{enabled ? '已开启' : partial ? '部分' : '未开启'}</span>
                    <button
                      role="switch"
                      aria-checked={enabled}
                      className={`${styles.toggle} ${enabled ? styles.toggleOn : ''}`}
                      onClick={() => toggleAbility(ability)}
                      title={enabled ? '关闭此能力' : '开启此能力'}
                    >
                      <span className={styles.toggleThumb} />
                    </button>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className={styles.footer}>
        <span className={styles.footerHint}>
          💡 开启的爪力会在每次对话中自动提供给猫咪，同时无需手动确认。未开启的爪力猫咪不会看到。
        </span>
      </div>
    </div>
  )
}
