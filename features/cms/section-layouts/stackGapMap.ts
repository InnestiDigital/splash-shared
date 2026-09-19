/**
 * Inter-block gap values for the hand-written layout components.
 *
 * Carries BOTH vocabularies on purpose (L3). The `2026_08_25_000003` migration
 * rewrote every authored `stackGap` / `gap` to the spacing tiers the engine and
 * the `.v2.json` schemas speak — `tight → sm`, `normal → md`, `spacious` and
 * `loose → lg`, per contract §5.5. These components are now the kill-switch
 * path (`NUXT_PUBLIC_LAYOUT_ENGINE_DISABLED`), so they read migrated content;
 * dropping the legacy keys would make the emergency fallback silently render
 * every gap at its default, which is the one moment that must not happen.
 *
 * The tier values match `sectionGapTokens.scss`.
 */
export const STACK_GAP_MAP: Record<string, string> = {
  none: '0',
  sm: '0.5rem',
  md: '1.5rem',
  lg: '3rem',
  xl: '4.8rem',
  // Pre-migration vocabulary.
  tight: '0.5rem',
  normal: '1.5rem',
  spacious: '3rem',
  loose: '3rem',
}

/**
 * Legacy → tier, per contract §5.5. The value migration that was supposed to
 * rewrite stored rows was collapsed away with the single-baseline migration
 * rebuild, so seeds and live rows still carry `normal` / `spacious` — and the
 * write gate correctly refuses anything outside the `.v2.json` options,
 * 422-ing every save of a seeded section. Write paths normalize BEFORE
 * validation; the renderer keeps reading both vocabularies via STACK_GAP_MAP.
 */
export const LEGACY_GAP_VALUE_MAP: Readonly<Record<string, string>> = Object.freeze({
  tight: 'sm',
  normal: 'md',
  spacious: 'lg',
  loose: 'lg',
})

/** Gap-shaped layoutConfig keys that may carry the legacy vocabulary. */
const GAP_SETTING_IDS = new Set(['stackGap', 'gap'])

export function normalizeLegacyGapValue(key: string, value: unknown): unknown {
  if (typeof value !== 'string' || !GAP_SETTING_IDS.has(key)) return value
  return LEGACY_GAP_VALUE_MAP[value] ?? value
}

/** Rewrite legacy gap values inside a whole layoutConfig object (in place). */
export function normalizeLegacyGapConfig(config: Record<string, unknown> | null | undefined): void {
  if (!config) return
  for (const key of Object.keys(config)) {
    if (!GAP_SETTING_IDS.has(key)) continue
    const mapped = LEGACY_GAP_VALUE_MAP[config[key] as string]
    if (mapped) config[key] = mapped
  }
}
