/**
 * WebSocketManager — App 级 WebSocket 生命周期管理器。
 *
 * 作为一个无渲染组件挂载在 App 根部，确保 WebSocket 连接
 * 在用户切换侧栏 tab 时不受影响，ChatArea 可以自由挂载/卸载。
 */
import { useAppStore } from '../store/app'
import { useWebSocket } from '../hooks/useWebSocket'

export function WebSocketManager() {
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  useWebSocket(activeSessionId)
  return null
}
