export default defineNuxtPlugin((nuxtApp) => {
    const getLocaleISO = () => {
        const i18n: any = nuxtApp.$i18n
        const code = i18n.locale.value
        const locales = (i18n.locales.value || []) as Array<{ code: string; iso?: string; isoCode?: string }>
        const m = locales.find(l => l.code === code)
        return m?.iso ?? m?.isoCode ?? code
    }

    const goLocale = (path: string) => {
        const localePath: any = nuxtApp.$localePath
            ? nuxtApp.$localePath
            : (p: string) => p

        const localized = localePath(path)
        return navigateTo(localized)
    }

    const t = (key: string, params?: Record<string, any>) => {
        const i18n: any = nuxtApp.$i18n
        if (!i18n?.t) {
            console.warn('[i18n-bridge] $i18n not initialized')
            return key
        }
        if (i18n.te && !i18n.te(key)) {
            // puoi decidere cosa fare:
            // - tornare la chiave
            // - tornare stringa vuota
            // - tornare una fallback custom
            return key
        }

        return i18n.t(key, params)
    }

    return {
        provide: {
            localeISO: getLocaleISO,
            goLocale,
            t,
        }
    }
})
