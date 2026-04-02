import { ref } from 'vue'

export interface ToastItem {
  id: number
  message: string
  type: 'info' | 'success' | 'warning' | 'error'
  duration: number
}

const toasts = ref<ToastItem[]>([])
let nextId = 0

function addToast(message: string, type: ToastItem['type'] = 'info', duration = 3000) {
  const id = nextId++
  toasts.value.push({ id, message, type, duration })
  if (duration > 0) {
    setTimeout(() => removeToast(id), duration)
  }
}

function removeToast(id: number) {
  toasts.value = toasts.value.filter(t => t.id !== id)
}

export function useToast() {
  return {
    toasts,
    info: (msg: string, opts?: { duration?: number }) => addToast(msg, 'info', opts?.duration),
    success: (msg: string, opts?: { duration?: number }) => addToast(msg, 'success', opts?.duration),
    warning: (msg: string, opts?: { duration?: number }) => addToast(msg, 'warning', opts?.duration),
    error: (msg: string, opts?: { duration?: number }) => addToast(msg, 'error', opts?.duration),
    remove: removeToast,
  }
}
