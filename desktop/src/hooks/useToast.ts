import { useState, useCallback, useRef } from 'react'

const HTTP_STATUS_ZH: Record<number, string> = {
  400: '请求参数错误',
  401: '未登录或登录已过期',
  403: '无权限访问',
  404: '资源不存在',
  405: '请求方法不允许',
  409: '数据冲突',
  422: '参数校验失败',
  429: '请求过于频繁',
  500: '服务器内部错误',
  502: '网关错误',
  503: '服务暂不可用',
}

/** 把 res.text() + 状态码封装成可读错误信息 */
export async function throwIfError(res: Response) {
  if (!res.ok) {
    const body = await res.text()
    let detail = ''
    try {
      const obj = JSON.parse(body)
      if (typeof obj?.detail === 'string') {
        detail = obj.detail
      } else if (Array.isArray(obj?.detail)) {
        detail = obj.detail.map((d: any) => d.msg ?? String(d)).join('; ')
      } else if (typeof obj?.detail?.message === 'string') {
        detail = obj.detail.message
      }
    } catch {}
    const statusText = HTTP_STATUS_ZH[res.status] ?? `HTTP ${res.status}`
    const msg = detail ? `${statusText} — ${detail}` : statusText
    throw new Error(msg)
  }
}

export function useToast(duration = 4000) {
  const [toast, setToast] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((raw: string) => {
    setToast(raw)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setToast(null), duration)
  }, [duration])

  const dismissToast = useCallback(() => {
    setToast(null)
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  return { toast, showToast, dismissToast }
}
