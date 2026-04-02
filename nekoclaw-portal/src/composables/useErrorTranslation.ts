import { i18n } from '@/i18n'

interface BackendError {
  code?: number
  error_code?: number
  message_key?: string
  message?: string
  message_params?: Record<string, string>
}

export function translateError(error: unknown): string {
  const { t, te } = i18n.global

  const axiosError = error as { response?: { data?: BackendError } }
  const data = axiosError?.response?.data

  if (data?.message_key) {
    if (te(data.message_key)) {
      return t(data.message_key, data.message_params || {}) as string
    }
    if (data.message) {
      return data.message
    }
  }

  if (data?.message) {
    return data.message
  }

  return t('errors.common.unknown') as string
}
