import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import CatStateAvatar from '@/components/shared/CatStateAvatar.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: {
    'zh-CN': {
      cat_state: {
        sleeping: '睡觉中',
        idle: '发呆中',
        working: '工作中',
        error: '生病了',
        unknown: '未知',
      },
    },
  },
})

function mountAvatar(props: Record<string, unknown> = {}) {
  return mount(CatStateAvatar, {
    props: { state: 'running', size: 'md', ...props },
    global: { plugins: [i18n] },
  })
}

describe('CatStateAvatar', () => {
  it('renders without errors', () => {
    const wrapper = mountAvatar()
    expect(wrapper.exists()).toBe(true)
  })

  it('applies size class', () => {
    const wrapper = mountAvatar({ size: 'lg' })
    expect(wrapper.html()).toBeTruthy()
  })

  it('renders different states', () => {
    const states = ['running', 'learning', 'failed', 'creating', 'idle']
    for (const state of states) {
      const wrapper = mountAvatar({ state })
      expect(wrapper.exists()).toBe(true)
    }
  })
})
