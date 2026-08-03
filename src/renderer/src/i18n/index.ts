import { createI18n } from 'vue-i18n'
import en from '../locales/en.yaml'
import zhCN from '../locales/zh-CN.yaml'

export const SUPPORTED_LOCALES = ['zh-CN', 'en'] as const
export type AppLocale = (typeof SUPPORTED_LOCALES)[number]

const LOCALE_STORAGE_KEY = 'lepus.locale'

function isAppLocale(locale: string | null): locale is AppLocale {
  return locale !== null && SUPPORTED_LOCALES.includes(locale as AppLocale)
}

function detectLocale(): AppLocale {
  const storedLocale = localStorage.getItem(LOCALE_STORAGE_KEY)
  if (isAppLocale(storedLocale)) return storedLocale
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en'
}

export const i18n = createI18n({
  legacy: false as const,
  locale: detectLocale(),
  fallbackLocale: 'en',
  messages: {
    'zh-CN': zhCN,
    en
  }
})

export function setAppLocale(locale: AppLocale): void {
  i18n.global.locale.value = locale
  localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  document.documentElement.lang = locale
}

export function initializeLocale(): void {
  setAppLocale(i18n.global.locale.value)
}
