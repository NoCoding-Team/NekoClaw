import { describe, it, expect, vi, beforeEach } from 'vitest'
import { translateError } from '@/composables/useErrorTranslation'

vi.mock('@/i18n', () => ({
  i18n: {
    global: {
      t: (key: string, params?: Record<string, string>) => {
        const messages: Record<string, string> = {
          'errors.common.not_found': '资源不存在',
          'errors.common.forbidden': '无权限',
          'errors.common.unknown': '未知错误',
          'errors.instance.not_found': '猫咪不存在',
        }
        return messages[key] ?? key
      },
      te: (key: string) => {
        const known = [
          'errors.common.not_found',
          'errors.common.forbidden',
          'errors.common.unknown',
          'errors.instance.not_found',
        ]
        return known.includes(key)
      },
    },
  },
}))

describe('translateError', () => {
  it('translates known message_key', () => {
    const error = {
      response: {
        data: {
          code: 40400,
          error_code: 40400,
          message_key: 'errors.common.not_found',
          message: 'Not Found',
        },
      },
    }
    expect(translateError(error)).toBe('资源不存在')
  })

  it('falls back to message when key not in i18n', () => {
    const error = {
      response: {
        data: {
          code: 40000,
          message_key: 'errors.something.unknown_key',
          message: 'Backend fallback message',
        },
      },
    }
    expect(translateError(error)).toBe('Backend fallback message')
  })

  it('returns message when no message_key', () => {
    const error = {
      response: {
        data: {
          code: 50000,
          message: 'Server error',
        },
      },
    }
    expect(translateError(error)).toBe('Server error')
  })

  it('returns unknown error for empty response', () => {
    expect(translateError({})).toBe('未知错误')
  })
})
