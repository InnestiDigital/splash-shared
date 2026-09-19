<script setup lang="ts">
import { useHead } from '#imports'
import type { ResolvedSeo } from '~/shared/types/seo'
import { buildStructuredData } from './structuredData'
import type { FaqEntry } from './faqStructuredData'

const props = defineProps<{
  seo: ResolvedSeo
  locale?: string
  siteName?: string
  faq?: FaqEntry[]
  /**
   * Resolved URL of the tenant's favicon (`themeSettings.favicon`). Optional:
   * `nuxt.config.ts` declares a platform-wide `/favicon.ico`, which is the only
   * icon every tenant had — one browser-tab identity shared across every site
   * the platform serves. When a tenant sets its own, the link below overrides
   * that default for this site.
   */
  faviconUrl?: string | null
}>()

useHead(() => {
  const meta: Array<Record<string, string>> = []
  if (props.seo.description) {
    meta.push({ name: 'description', content: props.seo.description })
  }
  if (props.seo.noIndex) {
    meta.push({ name: 'robots', content: 'noindex,nofollow' })
  }

  // Open Graph — the card social platforms (Facebook, LinkedIn, WhatsApp,
  // Slack, Telegram) read when the page is shared. og:title/description/image
  // describe the content; og:type + og:url + og:site_name anchor it as a page
  // on this brand's site so the preview renders with a proper header + link.
  meta.push({ property: 'og:type', content: 'website' })
  meta.push({ property: 'og:title', content: props.seo.title })
  if (props.seo.description) {
    meta.push({ property: 'og:description', content: props.seo.description })
  }
  if (props.seo.canonicalUrl) {
    meta.push({ property: 'og:url', content: props.seo.canonicalUrl })
  }
  if (props.siteName) {
    meta.push({ property: 'og:site_name', content: props.siteName })
  }
  if (props.locale) {
    // og:locale wants an underscore locale (e.g. it_IT). Normalise the BCP-47
    // tag we carry ("it", "en-US") to that shape; a bare language stays bare.
    meta.push({ property: 'og:locale', content: props.locale.replace('-', '_') })
  }
  if (props.seo.ogImageUrl) {
    meta.push({ property: 'og:image', content: props.seo.ogImageUrl })
  }

  // Twitter/X card — X ignores most og:* and needs its own namespace. A card
  // with an image renders large; without one it falls back to a text summary.
  meta.push({
    name: 'twitter:card',
    content: props.seo.ogImageUrl ? 'summary_large_image' : 'summary',
  })
  meta.push({ name: 'twitter:title', content: props.seo.title })
  if (props.seo.description) {
    meta.push({ name: 'twitter:description', content: props.seo.description })
  }
  if (props.seo.ogImageUrl) {
    meta.push({ name: 'twitter:image', content: props.seo.ogImageUrl })
  }

  // schema.org structured data (JSON-LD). Where og:*/twitter:* drive social
  // share previews, this @graph is what search engines parse to build rich
  // results and connect the page to the brand entity. Null (page is noIndex or
  // has no absolute canonical) → emit no <script>, never an empty one.
  const structuredData = buildStructuredData({
    seo: props.seo,
    siteName: props.siteName,
    locale: props.locale,
    faq: props.faq,
  })
  const script = structuredData
    ? [{ type: 'application/ld+json', innerHTML: JSON.stringify(structuredData) }]
    : []

  return {
    // Declare the document language for the public page (WCAG 3.1.1, Level A).
    // Sourced from the site's content locale (theme `defaultLocale`, e.g. "it")
    // so screen readers pronounce content correctly and search engines detect
    // the language. Omitted when locale is unknown to avoid asserting a wrong tag.
    htmlAttrs: props.locale ? { lang: props.locale } : {},
    title: props.seo.title,
    meta,
    // `key` lets Nuxt replace the config-level icon rather than append a second
    // one — two <link rel="icon"> tags leave the browser to pick, which is not
    // a decision to hand to the browser.
    link: [
      { rel: 'canonical', href: props.seo.canonicalUrl },
      ...(props.faviconUrl ? [{ rel: 'icon', href: props.faviconUrl, key: 'favicon' }] : []),
    ],
    script,
  }
})
</script>

<template>
  <!-- head-only component; no template output -->
</template>
