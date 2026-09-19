import { isTipTapDocument } from './types'
import { renderTipTapToHtml } from './renderTipTapToHtml'
import { sanitizeHtmlString } from './sanitizeHtmlString'
import { modeFromFieldType } from './richtextModes'
import type { RichtextMode } from './richtextModes'

/**
 * Minimal structural type for a block schema as used by this transform.
 * Narrower than the full BlockSchema (server/storage/types) so this
 * module can be shared between admin and server without cross-importing
 * server-only types.
 */
export interface RichtextTransformSchema {
  settings: Array<{
    id: string
    type: string
    fields?: Array<{ id: string; type: string }>
  }>
}

/**
 * Resolve a child block type to its schema. Required when the parent has
 * `type: "blocks"` fields containing nested children whose richtext fields
 * need conversion against THEIR own schema (e.g. GridBlock -> info-card).
 * Without this lookup, nested blocks would ship raw TipTap JSON to the
 * renderer and v-html would receive an object — defensive asHtml gates
 * then drop it, making the content disappear from preview/publish.
 *
 * Server uses ctx.schemas[type]; admin uses editorStore.schemas[type].
 */
export type SchemaResolver = (blockType: string) => RichtextTransformSchema | null

/**
 * Convert richtext fields (type:"richtext") in block settings from TipTap
 * JSON to HTML strings. Single source of truth for the admin preview
 * transform and the server publish transform — both paths call this
 * function to guarantee preview/publish parity.
 *
 * Handles:
 *  - direct TipTap docs (non-translatable fields)
 *  - locale maps (translatable fields) with per-locale TipTap docs
 *  - repeater sub-fields containing richtext
 *  - nested children inside `type: "blocks"` fields (when resolveSchema is
 *    provided) — recurses with the child's own schema.
 *
 * When validPresetKeys is empty, richtext is still converted but preset
 * classes are skipped. This avoids shipping raw TipTap JSON when a site
 * has no typography presets defined.
 */
export function transformRichtextFields(
  settings: Record<string, any>,
  schema: RichtextTransformSchema | null,
  validPresetKeys: Set<string>,
  resolveSchema?: SchemaResolver,
): Record<string, any> {
  if (!schema) return settings

  const result = { ...settings }

  for (const field of schema.settings) {
    const mode = modeFromFieldType(field.type)
    if (mode === null) continue
    const value = result[field.id]
    if (value === null || value === undefined) continue

    if (isTipTapDocument(value)) {
      result[field.id] = renderTipTapToHtml(value, validPresetKeys, { mode })
    } else if (typeof value === 'string') {
      // Defense-in-depth: a richtext field stored as a raw HTML string
      // (e.g. via direct API write or seed JSON) bypasses TipTap JSON
      // serialization. Sanitize it to the same allowlist renderTipTapToHtml
      // produces before it reaches v-html in theme components.
      result[field.id] = sanitizeHtmlString(value, { mode })
    } else if (typeof value === 'object' && !Array.isArray(value)) {
      const localeMap: Record<string, any> = {}
      for (const [locale, localeValue] of Object.entries(value)) {
        if (isTipTapDocument(localeValue)) {
          localeMap[locale] = renderTipTapToHtml(localeValue, validPresetKeys, { mode })
        } else if (typeof localeValue === 'string') {
          localeMap[locale] = sanitizeHtmlString(localeValue, { mode })
        } else {
          localeMap[locale] = localeValue
        }
      }
      result[field.id] = localeMap
    }
  }

  // Walk nested-block fields. GridBlock-style: parent has `type: "blocks"`
  // field whose value is an array of `{ type, settings }` child blocks.
  // Each child resolves its own schema via resolveSchema and recurses.
  // Without resolveSchema we cannot convert nested children — the caller
  // must arrange recursion separately (server's transformNestedBlock does
  // this for legacy reasons; admin's preview pipeline relies on the
  // resolveSchema branch here).
  if (resolveSchema) {
    for (const field of schema.settings) {
      if (field.type !== 'blocks') continue
      const children = result[field.id]
      if (!Array.isArray(children)) continue

      result[field.id] = children.map((child: any) => {
        if (!child || typeof child !== 'object' || typeof child.type !== 'string') return child
        const childSchema = resolveSchema(child.type)
        if (!childSchema) return child
        const childSettings = child.settings ?? {}
        const transformed = transformRichtextFields(childSettings, childSchema, validPresetKeys, resolveSchema)
        return { ...child, settings: transformed }
      })
    }
  }

  // Walk repeater fields (flat items, not {type, settings} wrappers)
  for (const field of schema.settings) {
    if (field.type !== 'repeater' || !field.fields) continue
    const items = result[field.id]
    if (!Array.isArray(items)) continue

    const richtextSubFields = field.fields
      .map(f => ({ field: f, mode: modeFromFieldType(f.type) }))
      .filter((entry): entry is { field: typeof entry.field; mode: RichtextMode } => entry.mode !== null)
    if (richtextSubFields.length === 0) continue

    result[field.id] = items.map((item: any) => {
      if (!item || typeof item !== 'object') return item
      const updated = { ...item }
      for (const { field: subField, mode } of richtextSubFields) {
        const value = updated[subField.id]
        if (value === null || value === undefined) continue

        if (isTipTapDocument(value)) {
          updated[subField.id] = renderTipTapToHtml(value, validPresetKeys, { mode })
        } else if (typeof value === 'string') {
          updated[subField.id] = sanitizeHtmlString(value, { mode })
        } else if (typeof value === 'object' && !Array.isArray(value)) {
          const localeMap: Record<string, any> = {}
          for (const [locale, localeValue] of Object.entries(value)) {
            if (isTipTapDocument(localeValue)) {
              localeMap[locale] = renderTipTapToHtml(localeValue, validPresetKeys, { mode })
            } else if (typeof localeValue === 'string') {
              localeMap[locale] = sanitizeHtmlString(localeValue, { mode })
            } else {
              localeMap[locale] = localeValue
            }
          }
          updated[subField.id] = localeMap
        }
      }
      return updated
    })
  }

  return result
}
