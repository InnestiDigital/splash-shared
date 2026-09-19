/**
 * Shared URL allowlist for Tiptap rich-text links.
 *
 * Used by:
 *  - shared/tiptap/extensions/index.ts (isAllowedUri — blocks mark creation)
 *  - shared/tiptap/renderTipTapToHtml.ts (sanitizeHref — defense-in-depth at render)
 *  - admin/components/fields/TRichTextEditor.vue (promptLink — user-facing validation)
 *
 * Allowed schemes: https, http, mailto, tel, root-relative (/), fragment (#).
 * Everything else (javascript:, data:, vbscript:, file:, …) is rejected.
 */
export const SAFE_URL_PATTERN = /^(https?:\/\/|mailto:|tel:|\/|#)/i

export function isSafeUrl(href: string | null | undefined): boolean {
  if (!href) return false
  return SAFE_URL_PATTERN.test(href.trim())
}

export function sanitizeHref(href: string): string {
  const trimmed = href.trim()
  return isSafeUrl(trimmed) ? trimmed : ''
}
