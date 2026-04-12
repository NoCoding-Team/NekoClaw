import { createI18n } from 'vue-i18n'
import zhCN from './zh-CN.json'
import enUS from './en-US.json'

const LOCALE_KEY = 'nekoclaw-locale'

export function getCurrentLocale(): string {
  return localStorage.getItem(LOCALE_KEY) || 'zh-CN'
}

export function setCurrentLocale(locale: string): string {
  localStorage.setItem(LOCALE_KEY, locale)
  i18n.global.locale.value = locale as 'zh-CN' | 'en-US'
  return locale
}

export const i18n = createI18n({
  legacy: false,
  locale: getCurrentLocale(),
  fallbackLocale: 'en-US',
  messages: {
    'zh-CN': zhCN,
    'en-US': enUS,
  },
})
