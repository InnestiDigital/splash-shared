// shared/types/seo.ts
export interface ResolvedSeo {
  title: string
  description: string | null
  ogImageUrl: string | null
  noIndex: boolean
  canonicalUrl: string
  extra: Record<string, unknown>
}

export interface PageMeta {
  layoutOverrides?: Record<string, unknown>
  localizedSlugs?: Record<string, string>
  seo?: { extra?: Record<string, unknown> }
}
