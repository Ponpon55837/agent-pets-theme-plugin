export const SUPPORTED_LOCALES = ['zh-TW', 'en-US'] as const

export type AppLocale = typeof SUPPORTED_LOCALES[number]

export const DEFAULT_LOCALE: AppLocale = 'zh-TW'

const SUPPORTED_LOCALE_SET: ReadonlySet<string> = new Set(SUPPORTED_LOCALES)

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === 'string' && SUPPORTED_LOCALE_SET.has(value)
}
