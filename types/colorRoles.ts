/**
 * Semantic color roles (Phase F / C1).
 *
 * The tier between the theme palette (`--color-*`, the only place hex lives)
 * and the section color schemes (`--section-*`). A role binds one scheme slot
 * to a palette entry; `SectionRenderer` reads `var(--role-<name>, <the palette
 * var that slot used to hardcode>)`, so a site with zero bindings renders
 * exactly what it rendered before this tier existed.
 *
 * See `docs/architecture/color-roles-phase-f.md`.
 */

/**
 * Section color schemes. Mirrors the `.section-renderer--<scheme>` modifiers in
 * `shared/features/cms/SectionRenderer.vue`; adding a scheme there means adding
 * it here (the role-vocabulary test asserts the two agree).
 */
export const COLOR_ROLE_SCHEMES = ['light', 'dark', 'accent', 'custom', 'transparent'] as const
export type ColorRoleScheme = typeof COLOR_ROLE_SCHEMES[number]

/**
 * Slots a scheme paints. The first seven are the vars every scheme already
 * emitted; `inverse-bg` / `inverse-text` are new in C1 and back the `inverse`
 * background/text roles blocks will select in C2.
 */
export const COLOR_ROLE_SLOTS = [
  'bg',
  'text',
  'border',
  'accent',
  'surface',
  'text-muted',
  'text-faint',
  'inverse-bg',
  'inverse-text',
] as const
export type ColorRoleSlot = typeof COLOR_ROLE_SLOTS[number]

/**
 * Role names are scheme-qualified (`light-bg`, `dark-inverse-text`).
 *
 * Qualification is load-bearing: `light`'s background hardcodes
 * `--color-background` while `dark`'s hardcodes `--color-dark-bg`. A shared
 * `--role-bg` would collapse the two, so binding one scheme's background would
 * silently repaint the other's. (The design doc's §2.3 snippet spells the
 * inverse vars unqualified; that would have that exact collapse, so C1 spells
 * every role — inverse included — scheme-first.)
 */
export const COLOR_ROLES: readonly string[] = COLOR_ROLE_SCHEMES.flatMap(
  scheme => COLOR_ROLE_SLOTS.map(slot => `${scheme}-${slot}`),
)

const COLOR_ROLE_SET: ReadonlySet<string> = new Set(COLOR_ROLES)

export function isColorRole(value: unknown): value is string {
  return typeof value === 'string' && COLOR_ROLE_SET.has(value)
}

/** The CSS custom property a role emits into. */
export function colorRoleCssVar(role: string): string {
  return `--role-${role}`
}

/**
 * Snapshot shape: role name → theme-manifest color setting id. Never a hex.
 * Mirrors `TypographySnapshotRoles`.
 */
export type ColorRoleBindings = Record<string, string>

/**
 * The bindings that reproduce today's hardcoded scheme vars.
 *
 * Deliberately NOT seeded into the database: the C1 exit criterion is that a
 * site with zero `color_roles` rows renders byte-identical CSS, and the
 * fallback baked into each `--section-*` declaration already supplies these
 * values. This map exists so the admin surface can show an author what a slot
 * currently resolves to, and so `resetToDefaults` can materialise it on
 * explicit request.
 *
 * Slots absent here resolve to a literal today (`rgba(0,0,0,0.04)` for
 * `light-surface`, `#fff` for `accent-text`, `transparent` for
 * `transparent-bg`, `rgba(0,0,0,0.12)` for `custom-border`) or to a CSS var
 * the standalone theme never declares (`--color-dark-border`), so there is no
 * palette entry to point at. A default that named one anyway would repaint the
 * slot the moment an author reset to defaults — the drift test in
 * `tests/shared/types/colorRoles.test.ts` checks each default against the
 * fallback its slot actually carries.
 *
 * **Naming trap:** every `*-accent` slot here (`light-accent`, `dark-accent`,
 * `accent-accent`, `custom-accent`, `transparent-accent`) binds `primaryColor`,
 * NOT the separate, frozen `accentColor` block setting — same word, unrelated
 * value. This is intentional: `SectionRenderer.vue`'s `--section-accent`
 * fallback chain already hardcoded `--color-primary` before this tier
 * existed, so the default has to match it for the "zero rows ⇒ byte-identical
 * CSS" exit criterion to hold. It does NOT mean `accentColor` is unreachable —
 * a site can bind any `*-accent` role to `accentColor` explicitly via
 * `PUT /api/admin/s/[siteId]/colors/roles`; that per-site opt-in is the
 * intended way to make a role live up to its name. See
 * docs/architecture/color-roles-phase-f.md, "Known naming collision" section.
 */
export const DEFAULT_COLOR_ROLE_BINDINGS: ColorRoleBindings = {
  'light-bg': 'backgroundColor',
  'light-text': 'textColor',
  'light-border': 'borderColor',
  'light-accent': 'primaryColor',
  'light-inverse-bg': 'darkBgColor',
  'light-inverse-text': 'darkTextColor',

  'dark-bg': 'darkBgColor',
  'dark-text': 'darkTextColor',
  'dark-accent': 'primaryColor',
  'dark-inverse-bg': 'backgroundColor',
  'dark-inverse-text': 'textColor',

  'accent-bg': 'primaryColor',
  'accent-inverse-bg': 'backgroundColor',
  'accent-inverse-text': 'textColor',

  'custom-bg': 'backgroundColor',
  'custom-text': 'textColor',
  'custom-accent': 'primaryColor',
  'custom-inverse-bg': 'darkBgColor',
  'custom-inverse-text': 'darkTextColor',

  'transparent-text': 'textColor',
  'transparent-accent': 'primaryColor',
  'transparent-inverse-bg': 'darkBgColor',
  'transparent-inverse-text': 'darkTextColor',
}
