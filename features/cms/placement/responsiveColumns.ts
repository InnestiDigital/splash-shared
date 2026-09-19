/**
 * How an authored per-viewport grid value resolves.
 *
 * The `responsive-columns` fragment gives every grid the same four controls
 * (`columnsTablet`, `columnsMobile`, `gapTablet`, `gapMobile`) with the same
 * option vocabulary, `auto` included. This is the other half of that contract:
 * `auto` — and anything that is not a usable number — resolves to "emit no
 * custom property", so the stylesheet's own reduction stands. Three blocks
 * spelling that guard three ways is how the same authored value ended up
 * meaning different things per grid.
 */

const AUTO = 'auto'

/** The authored value as a finite number, or null when it names no number. */
function finite(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === AUTO) return null
  if (typeof value === 'string' && value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Authored column count for one viewport, or null for `auto` — in which case
 * the caller emits nothing and the desktop value's automatic reduction applies.
 */
export function resolveColumnOverride(value: string | number | null | undefined): number | null {
  const parsed = finite(value)
  return parsed !== null && parsed >= 1 ? Math.round(parsed) : null
}

/**
 * Authored gap for one viewport in px, or null for `auto`. Zero is a value an
 * author can mean (edge-to-edge), so it is kept, not treated as absent.
 */
export function resolveGapOverride(value: string | number | null | undefined): number | null {
  const parsed = finite(value)
  return parsed !== null && parsed >= 0 ? parsed : null
}
