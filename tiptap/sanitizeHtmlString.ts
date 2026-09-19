import { sanitizeHref } from './urlPolicy'
import { STYLE_VALIDATORS, ALLOWED_STYLE_PROPS } from './inlineStyleAllowlist'
import type { RichtextMode } from './richtextModes'

const TAGS_BLOCK = new Set([
  'p', 'ul', 'ol', 'li', 'br', 'strong', 'em', 'u', 's', 'a', 'span',
  // Data tables (block mode only). Structural tags carry no attributes
  // except td/th colspan/rowspan — see ALLOWED_ATTRS.
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
  // Section headings. Long-form body copy is subdivided by headings, and
  // stripping them kept the words but destroyed the document outline: the
  // text rendered as an unstyled run-on, screen readers lost their navigation
  // landmarks, and the page shipped no heading structure at all.
  //
  // h1 is deliberately NOT allowed. The page template owns the single h1; a
  // body-authored one would give the document two competing top-level
  // headings. An imported h1 degrades to text, which is the safe direction.
  'h2', 'h3', 'h4', 'h5', 'h6',
])
const TAGS_INLINE = new Set(['br', 'strong', 'em', 'u', 's', 'span'])
const TAGS_SINGLE = new Set(['strong', 'em', 'u', 's', 'span'])

function tagsForMode(mode: RichtextMode): Set<string> {
  if (mode === 'single') return TAGS_SINGLE
  if (mode === 'inline') return TAGS_INLINE
  return TAGS_BLOCK
}

export interface SanitizeOptions {
  mode?: RichtextMode
  /**
   * Called once per sanitize pass with the unique disallowed tag names that
   * were removed (their text content is kept, the tags themselves dropped).
   * Stripping must never be silent — when no handler is injected, the
   * default logs a console.warn so the loss is observable in ingress and
   * render pipelines alike.
   */
  onStripped?: (tags: ReadonlyArray<string>) => void
}

function defaultOnStripped(tags: ReadonlyArray<string>): void {
  console.warn(`[sanitizeHtmlString] stripped disallowed tags: ${tags.join(', ')}`)
}

/**
 * Per-tag allowed attributes. `style` is allowed ONLY on <span>; its
 * value passes through `sanitizeStyleAttr` which parses each
 * declaration and re-emits ONLY allowlisted property:value pairs (see
 * shared/tiptap/inlineStyleAllowlist.ts).
 *
 * <s> is allowlisted as a tag (Phase 1 strikethrough) but carries NO
 * attributes — strike is purely structural. A second style carrier
 * would double the sanitizer surface for no authoring win.
 */
const ALLOWED_ATTRS: Readonly<Partial<Record<string, ReadonlyArray<string>>>> = {
  a: ['href'],
  p: ['class'],
  span: ['class', 'style'],
  td: ['colspan', 'rowspan'],
  th: ['colspan', 'rowspan'],
}

/** colspan/rowspan must be a plain positive integer (1–999). */
const SPAN_ATTR_RE = /^[1-9]\d{0,2}$/

/**
 * Only `rt-preset-<name>` class names are allowed on `<p>` and `<span>`.
 * These are the typography-preset decoration classes emitted by
 * renderTipTapToHtml.
 */
const PRESET_CLASS_RE = /^rt-preset-[\w-]+$/

export function sanitizeHtmlString(html: string, options: SanitizeOptions = {}): string {
  const allowed = tagsForMode(options.mode ?? 'block')
  const strippedTags = new Set<string>()
  const sanitized = html.replace(
    /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*?)(\s*\/?)>/g,
    (_match, slash: string, rawTag: string, attrStr: string, selfClose: string) => {
      const tag = rawTag.toLowerCase()
      if (!allowed.has(tag)) {
        strippedTags.add(tag)
        return ''
      }
      if (slash) return `</${tag}>`
      const attrAllow = ALLOWED_ATTRS[tag]
      if (!attrAllow || attrAllow.length === 0) {
        return selfClose.trim() === '/' ? `<${tag} />` : `<${tag}>`
      }
      const sanitizedAttrs = buildSafeAttrs(attrStr, attrAllow)
      const suffix = sanitizedAttrs ? ` ${sanitizedAttrs}` : ''
      return selfClose.trim() === '/' ? `<${tag}${suffix} />` : `<${tag}${suffix}>`
    },
  )
  if (strippedTags.size > 0) {
    (options.onStripped ?? defaultOnStripped)([...strippedTags])
  }
  return sanitized
}

function buildSafeAttrs(attrStr: string, allowed: ReadonlyArray<string>): string {
  const parts: string[] = []
  const re = /([a-zA-Z][\w-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]*)))?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(attrStr)) !== null) {
    const name = m[1].toLowerCase()
    if (!allowed.includes(name)) continue
    const value = (m[2] ?? m[3] ?? m[4] ?? '').trim()

    if (name === 'href') {
      const safe = sanitizeHref(value)
      if (safe) parts.push(`href="${escapeAttr(safe)}"`)
    } else if (name === 'class') {
      const classes = value.split(/\s+/).filter(c => PRESET_CLASS_RE.test(c))
      if (classes.length > 0) parts.push(`class="${classes.join(' ')}"`)
    } else if (name === 'style') {
      const safe = sanitizeStyleAttr(value)
      if (safe) parts.push(`style="${safe}"`)
    } else if (name === 'colspan' || name === 'rowspan') {
      if (SPAN_ATTR_RE.test(value)) parts.push(`${name}="${value}"`)
    }
  }
  return parts.join(' ')
}

/**
 * Parse an inline `style="..."` attribute value into individual
 * declarations, validate each per the property allowlist, and re-emit
 * only those that pass. The output is a canonical, semicolon-separated
 * `prop: value` list with NO escape sequences, NO !important, NO url(),
 * NO comments. Returns empty string when nothing survives — caller drops
 * the attribute entirely.
 *
 * Defense-in-depth notes:
 *  - Reject values containing CSS escape sequences (\\xx). These are a
 *    common bypass vector and never appear in output we generate.
 *  - Reject values containing !important — declaration noise we never
 *    emit and that often signals tampering.
 *  - Reject values containing parentheses unless explicitly allowed by
 *    the per-property validator (only color's rgb()/hsl() functions).
 *  - Validators handle their own internal regex; the sanitizer only
 *    splits declarations and dispatches.
 */
function sanitizeStyleAttr(input: string): string {
  if (!input) return ''
  // Reject obviously hostile content before per-declaration parsing —
  // catches escape-sequence smuggling and !important noise. The
  // per-validator regexes below would also catch most of these but a
  // pre-check is cheaper and clearer.
  if (/\\[0-9a-fA-F]/.test(input)) return ''
  if (/!\s*important/i.test(input)) return ''
  if (/\/\*/.test(input)) return ''

  const declarations = input.split(';')
  const out: string[] = []

  for (const decl of declarations) {
    const colonIdx = decl.indexOf(':')
    if (colonIdx === -1) continue
    const propRaw = decl.slice(0, colonIdx).trim().toLowerCase()
    const valueRaw = decl.slice(colonIdx + 1).trim()
    if (!propRaw || !valueRaw) continue
    if (!ALLOWED_STYLE_PROPS.includes(propRaw)) continue

    const validator = STYLE_VALIDATORS[propRaw]
    const validated = validator(valueRaw)
    if (validated === null) continue
    out.push(`${propRaw}: ${validated}`)
  }

  return out.join('; ')
}

function escapeAttr(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
