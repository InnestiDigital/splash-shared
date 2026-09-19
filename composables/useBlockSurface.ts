import type { ComputedRef } from 'vue'
import type { BackgroundRole, BackgroundRoleToken, TextRole } from '~/shared/types/placement'
import { computed } from 'vue'
import { resolveBackgroundRole, resolveTextRole } from '~/shared/features/cms/placement/placementTokenMaps'

/**
 * The `color-roles` fragment's two settings, as a block receives them.
 *
 * `{ custom }` is in the type because the C2 data migration writes it for an
 * authored hex that no role could carry (see `docs/architecture/color-roles-phase-f.md`
 * §2.4). It is readable here and deliberately not offered in the editor picker.
 */
export interface BlockSurfaceProps {
  background?: BackgroundRole
  textTone?: TextRole
}

export interface BlockSurfaceOptions {
  /**
   * The role to paint when the block carries no `background` value at all —
   * a row written before the block adopted the fragment, or a block whose
   * schema omits the control. Mirrors the per-block schema default.
   */
  fallbackBackground?: BackgroundRoleToken
}

/**
 * A block's surface treatment as a ready-to-bind style object.
 *
 * Replaces the `bgMode` chain that was copy-pasted across 23 blocks. It returns
 * the style rather than a resolved mode string on purpose: it was the mode
 * string that got duplicated, because every call site then had to re-implement
 * the mode→style branch too.
 *
 * Two absences are meaningful and are preserved:
 * - `transparent` emits no `backgroundColor` key, so the parent shows through
 *   rather than being painted with the keyword;
 * - a block whose schema omits `textTone` gets no `color` key, so it keeps
 *   inheriting exactly as it did before. `props.textTone` is defined for every
 *   adopter (the fragment declares a default) and undefined for every
 *   non-adopter, which is the distinction we want.
 *
 * Callable more than once per component — `HeroBlock` needs a root surface and
 * a media-column surface — because it holds no shared state.
 */
export function useBlockSurface(
  props: BlockSurfaceProps,
  options: BlockSurfaceOptions = {},
): { surfaceStyle: ComputedRef<Record<string, string>> } {
  const surfaceStyle = computed<Record<string, string>>(() => {
    const styles: Record<string, string> = {}

    const background = props.background ?? options.fallbackBackground ?? 'section'
    if (background !== 'transparent') {
      styles.backgroundColor = resolveBackgroundRole(background)
    }

    if (props.textTone !== undefined) {
      styles.color = resolveTextRole(props.textTone)
    }

    return styles
  })

  return { surfaceStyle }
}
