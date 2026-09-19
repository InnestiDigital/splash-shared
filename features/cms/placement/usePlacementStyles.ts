// shared/features/cms/placement/usePlacementStyles.ts
import { computed, toValue, type MaybeRef } from 'vue'
import type { AlignSelfValue, BlockPlacementConfig, WidthModeValue } from '~/shared/types/placement'
import {
  resolveSpacing,
  resolveMaxWidth,
  resolveBorderRadius,
  resolveShadow,
  resolveSemanticColor,
} from './placementTokenMaps'

/**
 * Inline-margin pair the measure-constrained inner element of a block adopts,
 * so the generic alignment control reaches every `measureWidth` block through
 * one inherited custom property instead of per-block settings. `stretch` fills
 * the row, so it leaves the var unset and the block keeps its own default.
 */
type MeasureAlignable = Exclude<AlignSelfValue, 'stretch'>

function measureAlign(align: MeasureAlignable): string {
  switch (align) {
    case 'start': return '0 auto'
    case 'center': return 'auto'
    case 'end': return 'auto 0'
    default: {
      const exhaustive: never = align
      return exhaustive
    }
  }
}

interface LayoutConstraints {
  forceWidth?: boolean
  ignoreAlign?: boolean
}

// Accepts MaybeRef — works with plain objects (tests, non-reactive contexts)
// and with refs/computed (Vue components). Use toValue() to unwrap.
export function usePlacementStyles(
  placement: MaybeRef<BlockPlacementConfig | undefined>,
  constraints?: LayoutConstraints,
) {
  // Single source of truth for "what alignment / width is actually in force",
  // shared by the class list and the emitted vars so they cannot disagree.
  const effective = computed(() => {
    const p = toValue(placement)
    return {
      align: constraints?.ignoreAlign ? undefined : p?.alignSelf,
      width: constraints?.forceWidth ? ('full' as WidthModeValue) : p?.widthMode,
    }
  })

  const placementClasses = computed(() => {
    const p = toValue(placement)
    if (!p) return {}

    const { align, width } = effective.value

    const classes: Record<string, boolean> = {}
    if (align) classes[`block-placement--align-${align}`] = true
    if (width) classes[`block-placement--width-${width}`] = true
    return classes
  })

  const placementVars = computed(() => {
    const p = toValue(placement)
    if (!p) return {}

    const vars: Record<string, string> = {}
    if (p.marginTop) vars['--placement-margin-top'] = resolveSpacing(p.marginTop)
    if (p.marginBottom) vars['--placement-margin-bottom'] = resolveSpacing(p.marginBottom)
    if (p.maxWidth) vars['--placement-max-width'] = resolveMaxWidth(p.maxWidth)

    const { align, width } = effective.value
    if (align && align !== 'stretch') {
      vars['--block-measure-align'] = measureAlign(align)
      // Alignment is margin-based, so it only moves a box narrower than its
      // container. Without any width constraint the block fills the row and
      // the control looks dead — shrink to content so it always shows.
      if (width !== 'content' && width !== 'full' && !p.maxWidth) {
        vars.width = 'fit-content'
      }
    }
    return vars
  })

  const hasFrame = computed(() => {
    const p = toValue(placement)
    if (!p) return false
    if (p.wrapperStyle && p.wrapperStyle !== 'none') return true
    if (p.wrapperOverrides) {
      return Object.values(p.wrapperOverrides).some(v => v != null)
    }
    return false
  })

  const frameVars = computed(() => {
    const p = toValue(placement)
    if (!hasFrame.value || !p) return {}

    const vars: Record<string, string> = {}

    // Preset-derived defaults applied via CSS class, overrides via vars
    const overrides = p.wrapperOverrides
    if (overrides?.backgroundColor)
      vars['--frame-bg'] = resolveSemanticColor(overrides.backgroundColor)
    if (overrides?.borderColor)
      vars['--frame-border-color'] = resolveSemanticColor(overrides.borderColor)
    if (overrides?.borderRadius)
      vars['--frame-border-radius'] = resolveBorderRadius(overrides.borderRadius)
    if (overrides?.shadow)
      vars['--frame-shadow'] = resolveShadow(overrides.shadow)

    return vars
  })

  return { placementClasses, placementVars, hasFrame, frameVars }
}
