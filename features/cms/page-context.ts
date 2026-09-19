// shared/features/cms/page-context.ts
import type { InjectionKey, Ref } from 'vue'
import type { PageType } from '~/shared/types/templates'

export interface PageContext {
  pageId: string
  pageType: PageType
  parentId: string | null
  blogId: string | null
  templateId: string | null
  locale: string
}

export const PAGE_CONTEXT_KEY: InjectionKey<Ref<PageContext>> = Symbol('PAGE_CONTEXT')

/**
 * Runtime members of the `PageType` union. `satisfies` makes the compiler fail
 * here the moment a variant is added to the union, so the guard below cannot
 * silently fall behind.
 */
export const PAGE_TYPES = ['static', 'blog-index', 'article', 'brand-canvas'] as const satisfies readonly PageType[]

export function isPageType(value: unknown): value is PageType {
  return typeof value === 'string' && (PAGE_TYPES as readonly string[]).includes(value)
}

/**
 * Narrow an untrusted `pageType` (config JSON, an API payload) to the union.
 *
 * Unknown values fall back to `'static'` — the same default the snapshot
 * deserializer applies for configs written before `pageType` existed. Use this
 * instead of an `as PageType` assertion: a cast would let a typo'd or
 * future-version value flow into `resolveBlogId` and the template resolver.
 */
export function toPageType(value: unknown): PageType {
  return isPageType(value) ? value : 'static'
}

export function resolveBlogId(pageType: PageType, pageId: string, parentId: string | null): string | null {
  if (pageType === 'blog-index') return pageId
  if (pageType === 'article') return parentId
  return null
}
