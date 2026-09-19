/**
 * CSS injection prevention utilities for @font-face rule generation.
 *
 * escapeCssString  — escapes a value for inclusion inside a single-quoted CSS
 *                    string literal. Used for font-family names in @font-face rules.
 *
 * isSafeFontUrl    — validates a font src URL against an allowlist so a hostile
 *                    value cannot pivot mid-declaration via url() injection.
 */

/**
 * Regex matching every character that must be escaped inside a CSS
 * single-quoted string:
 *   - backslash (escape introducer)
 *   - single quote (string terminator)
 *   - U+0000–U+001F control characters (including \n, \r, \t, \f, \v)
 *   - U+007F DEL
 *   - U+2028 LINE SEPARATOR and U+2029 PARAGRAPH SEPARATOR (CSS newlines)
 */
const CSS_STRING_ESCAPE_RE = /[\\\x00-\x1f\x7f\u2028\u2029']/g

function escapeCssChar(ch: string): string {
  if (ch === '\\') return '\\\\'
  if (ch === "'") return "\\'"
  // Control chars and CSS line separators → CSS unicode escape followed by
  // a trailing space (the space terminates the escape without being emitted).
  const code = ch.codePointAt(0)!
  return `\\${code.toString(16).padStart(6, '0')} `
}

/**
 * Escape `value` so it can be safely embedded inside a CSS single-quoted string.
 *
 * Example:
 *   escapeCssString("My Font\nEvil}")  →  "My Font\\00000a }Evil\\00007d "
 *
 * The caller is responsible for supplying the surrounding quotes:
 *   `font-family: '${escapeCssString(name)}';`
 */
export function escapeCssString(value: string): string {
  return value.replace(CSS_STRING_ESCAPE_RE, escapeCssChar)
}

/**
 * Returns true when `url` is safe to interpolate into a CSS `url()` token.
 *
 * Two shapes are accepted:
 *   - /api/fonts/{uuid}/{uuid}   — uploaded-font API endpoint (strict UUID check)
 *   - /fonts/<path>              — theme-bundled font file (path chars restricted)
 *
 * Anything else (absolute URLs, data URIs, paths with `'`, `)`, `\n`, etc.)
 * is rejected.  On mismatch the renderer should skip the rule rather than emit
 * potentially-injectable CSS.
 */
const UPLOADED_FONT_URL_RE = /^\/api\/fonts\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/i
const THEME_FONT_URL_RE = /^\/fonts\/[\w.\-/]+$/

export function isSafeFontUrl(url: string): boolean {
  return UPLOADED_FONT_URL_RE.test(url) || THEME_FONT_URL_RE.test(url)
}
