import { useI18n } from 'vue-i18n'

export function useLocalized() {
  const { locale } = useI18n()

  function getLocalizedValue(value: string | Record<string, string> | undefined, fallback = ''): string {
    if (!value) return fallback
    if (typeof value === 'string') return value
    return value[locale.value] || value['en-US'] || Object.values(value)[0] || fallback
  }

  function getLocalizedPlain(value: string | Record<string, string> | undefined, fallback = ''): string {
    return getLocalizedValue(value, fallback).replace(/<[^>]*>/g, '')
  }

  return { getLocalizedValue, getLocalizedPlain }
}
