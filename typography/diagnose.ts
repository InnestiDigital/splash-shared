import type { TypographyPreset, TypographyRoleMapping } from '~/server/services/typography/typographyTypes'
import type { PresetUsageIndex } from './usageIndex'
import { getKeyUsage } from './usageIndex'

/**
 * Severity levels for typography diagnostics.
 *
 * - `error`: reference to a preset key that does not exist anywhere in the
 *   site's presets. The renderer will fall back to browser defaults, which
 *   is almost certainly not what the author intended. Block publish? No —
 *   the site still ships — but surface loudly.
 * - `warning`: reference to a deactivated preset, or a role mapped to an
 *   inactive/missing preset. The rendered output will fall back to role
 *   defaults or browser defaults; authors should either re-activate the
 *   preset or update the reference.
 * - `info`: non-blocking observations like "preset X is unused" that help
 *   keep the catalog tidy but don't indicate breakage.
 */
export type DiagnosticSeverity = 'error' | 'warning' | 'info'

export type DiagnosticCode =
  | 'invalid-block-slot-ref'
  | 'invalid-richtext-paragraph-ref'
  | 'invalid-richtext-inline-ref'
  | 'inactive-block-slot-ref'
  | 'inactive-richtext-paragraph-ref'
  | 'inactive-richtext-inline-ref'
  | 'dangling-role-ref'
  | 'inactive-role-ref'
  | 'unused-preset'

export interface TypographyDiagnostic {
  code: DiagnosticCode
  severity: DiagnosticSeverity
  /** The preset key (or role name for role diagnostics) at the center of the diagnostic. */
  key: string
  /** Human-readable message describing the problem and implication. */
  message: string
  /** Count of affected references where applicable. */
  count?: number
}

/**
 * Analyze a site's typography configuration + usage index and return a
 * flat list of diagnostics. Callers can filter by severity, format for
 * logs, or render in an admin panel.
 *
 * This function is pure: it doesn't read from storage. Pass in the
 * presets (full or snapshot shape), roles, and a pre-built usage index.
 *
 * @param presets  Full TypographyPreset[] from the draft (includes isActive)
 * @param roles    Role mappings as { role: presetKey } — matches the shape
 *                 used by the publish snapshot and by editorStore.
 * @param usage    Pre-built usage index from buildUsageIndex()
 */
export function diagnoseTypography(
  presets: Pick<TypographyPreset, 'key' | 'name' | 'isActive'>[],
  roles: Record<string, string | null | undefined>,
  usage: PresetUsageIndex,
): TypographyDiagnostic[] {
  const diagnostics: TypographyDiagnostic[] = []

  // Index presets by key for O(1) lookup. Track active keys separately so
  // we can distinguish "missing" from "inactive" references.
  const presetByKey = new Map<string, Pick<TypographyPreset, 'key' | 'name' | 'isActive'>>()
  for (const preset of presets) {
    presetByKey.set(preset.key, preset)
  }

  // ── Block slot references ──────────────────────────────────────────────
  for (const [key, count] of Object.entries(usage.blockSlot)) {
    const preset = presetByKey.get(key)
    if (!preset) {
      diagnostics.push({
        code: 'invalid-block-slot-ref',
        severity: 'error',
        key,
        count,
        message: `Preset "${key}" is referenced by ${count} block slot override(s) but does not exist. `
          + 'Block(s) will fall back to role defaults or browser defaults.',
      })
    } else if (!preset.isActive) {
      diagnostics.push({
        code: 'inactive-block-slot-ref',
        severity: 'warning',
        key,
        count,
        message: `Preset "${preset.name}" (${key}) is deactivated but still referenced by `
          + `${count} block slot override(s). Re-activate or clear the overrides.`,
      })
    }
  }

  // ── Richtext paragraph references ──────────────────────────────────────
  for (const [key, count] of Object.entries(usage.richTextParagraph)) {
    const preset = presetByKey.get(key)
    if (!preset) {
      diagnostics.push({
        code: 'invalid-richtext-paragraph-ref',
        severity: 'error',
        key,
        count,
        message: `Preset "${key}" is referenced by ${count} rich text paragraph(s) but does not exist. `
          + 'Paragraphs will render without the preset styling.',
      })
    } else if (!preset.isActive) {
      diagnostics.push({
        code: 'inactive-richtext-paragraph-ref',
        severity: 'warning',
        key,
        count,
        message: `Preset "${preset.name}" (${key}) is deactivated but still referenced by `
          + `${count} rich text paragraph(s).`,
      })
    }
  }

  // ── Richtext inline mark references ────────────────────────────────────
  for (const [key, count] of Object.entries(usage.richTextInline)) {
    const preset = presetByKey.get(key)
    if (!preset) {
      diagnostics.push({
        code: 'invalid-richtext-inline-ref',
        severity: 'error',
        key,
        count,
        message: `Preset "${key}" is referenced by ${count} inline text mark(s) but does not exist. `
          + 'Marks will render without the preset styling.',
      })
    } else if (!preset.isActive) {
      diagnostics.push({
        code: 'inactive-richtext-inline-ref',
        severity: 'warning',
        key,
        count,
        message: `Preset "${preset.name}" (${key}) is deactivated but still referenced by `
          + `${count} inline text mark(s).`,
      })
    }
  }

  // ── Role mapping validation ────────────────────────────────────────────
  for (const [role, presetKey] of Object.entries(roles)) {
    if (!presetKey) continue
    const preset = presetByKey.get(presetKey)
    if (!preset) {
      diagnostics.push({
        code: 'dangling-role-ref',
        severity: 'error',
        key: role,
        message: `Role "${role}" is mapped to preset "${presetKey}" which does not exist. `
          + 'Blocks using this role will fall back to browser defaults.',
      })
    } else if (!preset.isActive) {
      diagnostics.push({
        code: 'inactive-role-ref',
        severity: 'warning',
        key: role,
        message: `Role "${role}" is mapped to preset "${preset.name}" (${presetKey}) which is deactivated. `
          + 'Blocks using this role will fall back to browser defaults.',
      })
    }
  }

  // ── Unused active presets ──────────────────────────────────────────────
  // A preset is "unused" when no role maps to it AND no block slot, TipTap
  // paragraph, or TipTap inline mark references it. This is informational
  // only — authors may intentionally keep presets around for future use.
  const referencedKeys = new Set<string>()
  for (const key of Object.keys(usage.blockSlot)) referencedKeys.add(key)
  for (const key of Object.keys(usage.richTextParagraph)) referencedKeys.add(key)
  for (const key of Object.keys(usage.richTextInline)) referencedKeys.add(key)
  for (const key of Object.values(roles)) {
    if (typeof key === 'string') referencedKeys.add(key)
  }

  for (const preset of presets) {
    if (!preset.isActive) continue // deactivated presets already flagged or intentional
    if (referencedKeys.has(preset.key)) continue
    diagnostics.push({
      code: 'unused-preset',
      severity: 'info',
      key: preset.key,
      message: `Preset "${preset.name}" (${preset.key}) is active but not used by any role, block slot, or rich text.`,
    })
  }

  return diagnostics
}

/**
 * Filter diagnostics by minimum severity. Useful for publish-time guards
 * that want to surface only warnings-and-above.
 */
export function filterBySeverity(
  diagnostics: TypographyDiagnostic[],
  minSeverity: DiagnosticSeverity,
): TypographyDiagnostic[] {
  const order: Record<DiagnosticSeverity, number> = { info: 0, warning: 1, error: 2 }
  const threshold = order[minSeverity]
  return diagnostics.filter(d => order[d.severity] >= threshold)
}

/**
 * Format a diagnostic list for log output. One line per diagnostic.
 */
export function formatDiagnostics(diagnostics: TypographyDiagnostic[]): string {
  if (diagnostics.length === 0) return '(none)'
  return diagnostics
    .map(d => `[${d.severity.toUpperCase()}] ${d.code}: ${d.message}`)
    .join('\n')
}
