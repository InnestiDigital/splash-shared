import type { TypographySnapshotPreset } from '~/server/services/typography/typographyTypes'

const SLOT_PROPS = [
  'family',
  'size',
  'weight',
  'line-height',
  'letter-spacing',
  'text-transform',
  // Phase C: variable-font axis-derived properties. Even when the underlying
  // preset has no axes (static font), the resolved values fall back via the
  // var() chain so emitting these keys is harmless. Block CSS reads them via
  // `var(--rt-slot-{slot}-font-variation-settings, …)`.
  'font-variation-settings',
  'font-optical-sizing',
  'font-stretch',
  'font-style',
] as const

/**
 * Builds per-instance inline style CSS vars for typography slot overrides.
 *
 * Callers must only pass slot names declared in the block's typographySlots schema.
 * This function does not validate slot names — it emits vars for any key passed in.
 * The contract is enforced by the composable/component, not the helper.
 *
 * @param slotOverrides - Map of slot name → preset key (null/undefined = inherit from role)
 * @param presets - Available typography presets (from client config)
 * @returns Flat style object: `{ '--rt-slot-heading-family': 'var(--rt-preset-display-serif-xl-family)' }`
 */
export function buildTypographySlotStyle(
  slotOverrides: Record<string, string | null | undefined>,
  presets: TypographySnapshotPreset[],
): Record<string, string> {
  const style: Record<string, string> = {}
  const presetMap = new Map(presets.map(p => [p.key, p]))

  for (const [slot, presetKey] of Object.entries(slotOverrides)) {
    if (!presetKey) continue

    const preset = presetMap.get(presetKey)
    if (!preset) continue

    for (const prop of SLOT_PROPS) {
      style[`--rt-slot-${slot}-${prop}`] = `var(--rt-preset-${presetKey}-${prop})`
    }

    if (preset.color != null) {
      style[`--rt-slot-${slot}-color`] = `var(--rt-preset-${presetKey}-color)`
    }
  }

  return style
}
