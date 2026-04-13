import { useState, useCallback, useRef } from 'react'

/** 把 res.text() + 状态码封装成可读错误信息 */
export async function throwIfError(res: Response) {
  if (!res.ok) {
    const body = await res.text()
    let detail = body
    try {
      const obj = JSON.parse(body)
      if (typeof obj?.detail === 'string') detail = obj.detail
      else if (Array.isArray(obj?.detail))
        detail = obj.detail.map((d: any) => d.msg ?? String(d)).join('; ')
    } catch {}
    throw new Error(`${res.status} ${res.statusText} — ${detail}`)
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
