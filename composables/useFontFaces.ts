import { useHead } from '#imports'
import { computed } from 'vue'
import { useClientConfig } from '~/shared/composables/useClientConfig'
import type { FontFaceDeclaration } from '~/shared/types/fontAssets'
import { escapeCssString, isSafeFontUrl } from '~/shared/utils/cssEscape'

type TypographyDefault = {
    fontFamily?: string
    fontSize?: string
    lineHeight?: number | string
    fontWeight?: number | string
}

type TypographyVariant = {
    name: string
    family?: string
    file: string
    weight?: number
    style?: string
}

/**
 * Derive the CSS `format()` hint from a URL or explicit mime.
 * Falls back to `woff2` which is the default for modern uploads.
 */
function guessFontFormat(src: string): string {
    const lower = src.toLowerCase()
    if (lower.includes('.woff2') || lower.endsWith('woff2')) return 'woff2'
    if (lower.includes('.woff') || lower.endsWith('woff')) return 'woff'
    if (lower.includes('.ttf')) return 'truetype'
    if (lower.includes('.otf')) return 'opentype'
    return 'woff2'
}

export function useFontFaces() {
    const { config } = useClientConfig()

    const css = computed(() => {
        const cfg = config.value as any
        if (!cfg) return ''

        const typography = cfg?.typography as {
            variants?: TypographyVariant[]
            defaults?: Record<string, TypographyDefault>
            fontFaces?: FontFaceDeclaration[]
        } | undefined

        const variants = typography?.variants ?? []
        const defaults = typography?.defaults
        const fontFaces = typography?.fontFaces ?? []

        let result = ''

        if (variants.length) {
            result += variants.map((v: any) => {
                const family = v.family ?? v.name
                const style = v.style ?? 'normal'
                const display = 'swap'

                if (v.variable && v.axes) {
                    // Variable font: emit range descriptors derived from declared axes.
                    // Single woff2-variations source so the browser doesn't fall back to
                    // a static instance.
                    const wght = v.axes.wght
                    const wghtRange = wght ? `${wght.min} ${wght.max}` : '100 900'
                    const slnt = v.axes.slnt
                    const styleDecl = slnt
                        ? `font-style: oblique ${slnt.min}deg ${slnt.max}deg;`
                        : `font-style: ${style};`
                    return `
@font-face {
  font-family: '${escapeCssString(family)}';
  src: url('/fonts/${v.file}.woff2') format('woff2-variations');
  font-weight: ${wghtRange};
  ${styleDecl}
  font-display: ${display};
}`
                }

                const weight = v.weight ?? 400
                return `
@font-face {
  font-family: '${escapeCssString(family)}';
  src: url('/fonts/${v.file}.woff2') format('woff2'),
       url('/fonts/${v.file}.woff') format('woff');
  font-weight: ${weight};
  font-style: ${style};
  font-display: swap;
}`
            }).join('\n')
        }

        // Editor-uploaded @font-face declarations (SPL-115). `src` is already
        // a fully-qualified snapshot URL pointing at /api/fonts/{siteId}/{id}
        // — we do not prepend /fonts/ like the theme-bundled variants.
        if (fontFaces.length) {
            result += fontFaces.flatMap((f) => {
                if (!isSafeFontUrl(f.src)) return []
                const weight = f.weight ?? 400
                const style = f.style ?? 'normal'
                const display = f.display ?? 'swap'
                const format = guessFontFormat(f.src)
                return [`
@font-face {
  font-family: '${escapeCssString(f.name)}';
  src: url('${f.src}') format('${format}');
  font-weight: ${weight};
  font-style: ${style};
  font-display: ${display};
}`]
            }).join('\n')
        }

        if (defaults && Object.keys(defaults).length) {
            const lines: string[] = []
            for (const [token, rule] of Object.entries(defaults)) {
                if (rule.fontFamily) lines.push(`  --${token}-font-family: ${rule.fontFamily};`)
                if (rule.fontSize) lines.push(`  --${token}-font-size: ${rule.fontSize};`)
                if (rule.lineHeight !== undefined) lines.push(`  --${token}-line-height: ${rule.lineHeight};`)
                if (rule.fontWeight !== undefined) lines.push(`  --${token}-font-weight: ${rule.fontWeight};`)
            }
            if (lines.length) result += `\n:root {\n${lines.join('\n')}\n}\n`
        }

        return result
    })

    // No `rel="preload"` links. A theme declares every face it might use, but a
    // given page renders a handful; preloading the whole set fetched all 10
    // variants of the standalone theme (758KB, all High priority) on a page
    // where `document.fonts` reported exactly two families in use — 655KB of
    // wasted bandwidth contending with the LCP image. Emitting the @font-face
    // rules alone lets the browser fetch only the faces its own text actually
    // matches. `font-display: swap` above covers the paint in the meantime.
    // Preload only ever pays off for a face known to render above the fold, and
    // nothing in the config records that.
    //
    // useHead must be called in setup() context — passing computed keeps it reactive
    // without re-calling useHead on every config update.
    useHead(computed(() => ({
        style: css.value.trim() ? [{ key: 'client-config-font-faces-and-typography', innerHTML: css.value }] : [],
    })))
}