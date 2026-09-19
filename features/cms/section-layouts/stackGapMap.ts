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
