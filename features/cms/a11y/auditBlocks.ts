/**
 * Schema-driven accessibility linter for page blocks.
 *
 * Pure, dependency-free, and framework-agnostic so it can run in the editor
 * (over `editorStore.blocks` + `editorStore.schemas`), in a node harness, and
 * in CI unit tests without a browser or a store.
 *
 * The checks are derived from each block type's `*.settings.json` schema — the
 * same schemas that drive the whole CMS — so they stay correct as blocks are
 * added or reshaped, with no per-block-type wiring:
 *
 *   • image-no-alt-field  — a block renders an image but its schema exposes no
 *                           companion alt-text field, so an author *cannot*
 *                           describe it (e.g. HeroBlock's backgroundImage).
 *   • image-alt-empty     — a block has an image + a companion alt field, the
 *                           image is set, but the alt text is left blank.
 *   • link-text           — a link/url field is set but its visible text is
 *                           empty or a non-descriptive phrase ("click here").
 *
 * No rule inspects rendered DOM or computed colours — every finding is
 * derivable from structured content, which keeps it deterministic and fast.
 */

export type A11yRule = 'image-no-alt-field' | 'image-alt-empty' | 'link-text'
export type A11ySeverity = 'error' | 'warning'

export interface A11yFinding {
  readonly rule: A11yRule
  readonly severity: A11ySeverity
  readonly blockId: string
  readonly blockType: string
  readonly blockLabel: string
  /** The schema field the finding points at (image field or link field). */
  readonly fieldId: string
  readonly message: string
}

/** Minimal shape of a settings-schema field (from `*.settings.json`). */
export interface SchemaField {
  readonly id: string
  readonly type: string
  readonly group?: string
  readonly label?: string | Record<string, string>
}

/** Minimal shape of a block type's schema. */
export interface BlockSchema {
  readonly settings?: readonly SchemaField[]
  readonly label?: string | Record<string, string>
}

/** Minimal shape of a block instance. */
export interface AuditBlock {
  readonly id: string
  readonly type: string
  readonly settings?: Record<string, unknown> | null
}

export interface AuditOptions {
  /** Active editing locale, e.g. `en-US`. */
  readonly locale?: string
  /** Fallback locale used when the active locale has no value. */
  readonly fallbackLocale?: string
}

const IMAGE_FIELD_TYPES = new Set(['image', 'media'])
const LINK_FIELD_TYPES = new Set(['url', 'link'])
const TEXT_FIELD_TYPES = new Set([
  'text',
  'string',
  'richtext-inline',
  'richtext-single',
])

/**
 * Visible link text that tells a screen-reader user nothing about the target.
 * Kept deliberately conservative — only phrases that are unambiguously bad.
 */
const GENERIC_LINK_TEXT = new Set([
  'click here',
  'click',
  'here',
  'read more',
  'learn more',
  'more',
  'link',
  'this',
  'this page',
  'go',
  'read',
])

const LOCALE_KEY = /^[a-z]{2}(-[a-z0-9]+)?$/i

/** Resolve a possibly-localized field value to a single string. */
function resolveLocalized(
  value: unknown,
  locale: string,
  fallback: string,
): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (Array.isArray(value)) return ''
  if (typeof value === 'object') {
    const map = value as Record<string, unknown>
    const keys = Object.keys(map)
    const looksLocalized = keys.length > 0 && keys.every((k) => LOCALE_KEY.test(k))
    if (looksLocalized) {
      const picked = map[locale] ?? map[fallback] ?? map[keys[0]]
      return typeof picked === 'string' ? picked : ''
    }
    // A media object (e.g. { src, alt }) — treat a truthy `src`/`url` as set.
    const src = map.src ?? map.url ?? map.path ?? map.id
    return typeof src === 'string' ? src : ''
  }
  return ''
}

/** Is a (possibly localized/object) field value meaningfully populated? */
function isSet(
  value: unknown,
  locale: string,
  fallback: string,
): boolean {
  return resolveLocalized(value, locale, fallback).trim().length > 0
}

/** Strip HTML tags + collapse whitespace so richtext link labels compare cleanly. */
function toPlainText(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function localize(
  label: string | Record<string, string> | undefined,
  locale: string,
  fallback: string,
): string | undefined {
  if (label == null) return undefined
  if (typeof label === 'string') return label
  return label[locale] ?? label[fallback] ?? Object.values(label)[0]
}

/** Turn a block type like `hero-block` into `Hero Block` for display. */
function humanizeType(type: string): string {
  return type
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/**
 * Find the alt-text field that describes a given image field, if any.
 *
 * Pairing heuristic (precise to avoid false pairs on multi-image blocks):
 *  1. a text field in the SAME group whose id contains "alt", or
 *  2. a text field whose id starts with the image field's id (e.g.
 *     `heroImage` → `heroImageAlt`), or
 *  3. when the block has exactly one image field, any text field whose id
 *     contains "alt".
 */
function findAltField(
  imageField: SchemaField,
  fields: readonly SchemaField[],
  imageFieldCount: number,
): SchemaField | undefined {
  const textAltFields = fields.filter(
    (f) => TEXT_FIELD_TYPES.has(f.type) && f.id.toLowerCase().includes('alt'),
  )
  if (textAltFields.length === 0) return undefined

  const sameGroup = textAltFields.find((f) => f.group === imageField.group)
  if (sameGroup) return sameGroup

  const byPrefix = textAltFields.find((f) =>
    f.id.toLowerCase().startsWith(imageField.id.toLowerCase()),
  )
  if (byPrefix) return byPrefix

  return imageFieldCount === 1 ? textAltFields[0] : undefined
}

/**
 * Find the visible-text field paired with a link/url field, if any.
 * Looks for a text field in the same group whose id hints at a label.
 */
const LINK_TEXT_HINT = /(text|label|title|cta|caption|name)/i

function findLinkTextField(
  linkField: SchemaField,
  fields: readonly SchemaField[],
): SchemaField | undefined {
  const candidates = fields.filter(
    (f) => TEXT_FIELD_TYPES.has(f.type) && LINK_TEXT_HINT.test(f.id),
  )
  const sameGroup = candidates.find((f) => f.group === linkField.group)
  if (sameGroup) return sameGroup
  // e.g. ctaUrl ⇢ ctaText: shared prefix before the "url"/"link" suffix.
  const base = linkField.id.toLowerCase().replace(/(url|link|href)$/i, '')
  if (base) {
    const byPrefix = candidates.find((f) => f.id.toLowerCase().startsWith(base))
    if (byPrefix) return byPrefix
  }
  return candidates[0]
}

/**
 * Audit a page's blocks for schema-derivable accessibility issues.
 * Returns findings ordered errors-first, then in block order.
 */
export function auditBlocks(
  blocks: readonly AuditBlock[],
  schemas: Record<string, BlockSchema | undefined>,
  options: AuditOptions = {},
): A11yFinding[] {
  const locale = options.locale ?? 'en-US'
  const fallback = options.fallbackLocale ?? locale
  const findings: A11yFinding[] = []

  for (const block of blocks) {
    const schema = schemas[block.type]
    const fields = schema?.settings
    if (!fields || fields.length === 0) continue

    const settings = block.settings ?? {}
    const blockLabel =
      localize(schema?.label, locale, fallback) ?? humanizeType(block.type)

    const imageFields = fields.filter((f) => IMAGE_FIELD_TYPES.has(f.type))
    const imageFieldCount = imageFields.length

    for (const imageField of imageFields) {
      if (!isSet(settings[imageField.id], locale, fallback)) continue

      const altField = findAltField(imageField, fields, imageFieldCount)
      if (!altField) {
        findings.push({
          rule: 'image-no-alt-field',
          severity: 'warning',
          blockId: block.id,
          blockType: block.type,
          blockLabel,
          fieldId: imageField.id,
          message: `"${blockLabel}" shows an image but has no alt-text field, so it can't be described for screen readers.`,
        })
        continue
      }
      if (!isSet(settings[altField.id], locale, fallback)) {
        findings.push({
          rule: 'image-alt-empty',
          severity: 'error',
          blockId: block.id,
          blockType: block.type,
          blockLabel,
          fieldId: altField.id,
          message: `"${blockLabel}" has an image with empty alt text. Describe the image or mark it decorative.`,
        })
      }
    }

    const linkFields = fields.filter((f) => LINK_FIELD_TYPES.has(f.type))
    for (const linkField of linkFields) {
      if (!isSet(settings[linkField.id], locale, fallback)) continue
      const textField = findLinkTextField(linkField, fields)
      if (!textField) continue
      const raw = resolveLocalized(settings[textField.id], locale, fallback)
      const text = toPlainText(raw)
      const isGeneric = GENERIC_LINK_TEXT.has(text.toLowerCase())
      if (text.length === 0 || isGeneric) {
        findings.push({
          rule: 'link-text',
          severity: 'warning',
          blockId: block.id,
          blockType: block.type,
          blockLabel,
          fieldId: textField.id,
          message:
            text.length === 0
              ? `A link in "${blockLabel}" has no visible text. Screen readers will announce only the URL.`
              : `A link in "${blockLabel}" reads "${text}" — write text that describes where it goes.`,
        })
      }
    }
  }

  // Errors first, otherwise preserve block order (stable sort).
  return findings
    .map((f, i) => ({ f, i }))
    .sort((a, b) => {
      if (a.f.severity !== b.f.severity) return a.f.severity === 'error' ? -1 : 1
      return a.i - b.i
    })
    .map(({ f }) => f)
}

export function summarize(findings: readonly A11yFinding[]): {
  errors: number
  warnings: number
  total: number
} {
  let errors = 0
  let warnings = 0
  for (const f of findings) {
    if (f.severity === 'error') errors++
    else warnings++
  }
  return { errors, warnings, total: findings.length }
}
