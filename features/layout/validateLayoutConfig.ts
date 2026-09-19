import { isLayoutCanvasPreset } from './canvasPresets'
import {
  LAYOUT_CONTAINER_MODES,
  LAYOUT_SPACING_TIERS,
  isLayoutContainerMode,
  isLayoutSpacingTier,
} from './frameTokens'
import type { ThemeLayout, LayoutChromeElement } from '~/shared/types/layout'

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

const VALID_ELEMENT_TYPES = new Set(['line', 'shape', 'image', 'text', 'progress'])

function validateChromeElement(
  elem: Partial<LayoutChromeElement>,
  index: number,
  errors: string[],
): void {
  if (!elem.id) errors.push(`chrome element [${index}] missing id`)
  if (!elem.type || !VALID_ELEMENT_TYPES.has(elem.type)) {
    errors.push(`chrome element [${index}] invalid or missing type`)
  }
  if (typeof elem.enabled !== 'boolean') {
    errors.push(`chrome element [${index}] missing 'enabled' boolean`)
  }
  if (!elem.position || (elem.position !== 'fixed' && elem.position !== 'absolute')) {
    errors.push(`chrome element [${index}] invalid position`)
  }
  if (elem.coordSpace !== undefined && elem.coordSpace !== 'viewport' && elem.coordSpace !== 'design') {
    errors.push(`chrome element [${index}] coordSpace must be 'viewport' or 'design' (got ${String(elem.coordSpace)})`)
  }
  if (elem.type === 'line') {
    if (!elem.color) errors.push(`line chrome element [${index}] missing color`)
    if (!elem.thickness) errors.push(`line chrome element [${index}] missing thickness`)
    if (!elem.length) errors.push(`line chrome element [${index}] missing length`)
  }
  if (elem.type === 'progress') {
    if (!elem.color) errors.push(`progress chrome element [${index}] missing color`)
    if (elem.indicator !== undefined && elem.indicator !== 'bar' && elem.indicator !== 'ring') {
      errors.push(`progress chrome element [${index}] indicator must be 'bar' or 'ring' (got ${String(elem.indicator)})`)
    }
    if (elem.edge !== undefined && elem.edge !== 'top' && elem.edge !== 'bottom') {
      errors.push(`progress chrome element [${index}] edge must be 'top' or 'bottom' (got ${String(elem.edge)})`)
    }
  }
}

export function validateLayoutConfig(
  layout: ThemeLayout,
  knownBlockTypes?: Set<string>,
): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  if (!layout.id) errors.push('layout.id is required')
  if (!layout.label || typeof layout.label !== 'object') errors.push('layout.label is required')
  if (!Array.isArray(layout.allowedBlocks)) errors.push('layout.allowedBlocks must be an array')

  if (layout.chrome?.elements) {
    const seen = new Set<string>()
    layout.chrome.elements.forEach((elem: LayoutChromeElement, i: number) => {
      validateChromeElement(elem, i, errors)
      if (elem.id) {
        if (seen.has(elem.id)) errors.push(`duplicate chrome element id: ${elem.id}`)
        seen.add(elem.id)
      }
    })
  }

  // Warn (not error) on unknown allowedBlocks. Theme still loads — surfaces stale lists.
  if (knownBlockTypes && Array.isArray(layout.allowedBlocks)) {
    for (const block of layout.allowedBlocks) {
      if (!knownBlockTypes.has(block)) {
        warnings.push(`layout "${layout.id}" allowedBlocks contains unknown type: "${block}"`)
      }
    }
  }

  if (layout.frame) {
    const f = layout.frame
    if (f.responsiveMode !== undefined && f.responsiveMode !== 'breakpoint' && f.responsiveMode !== 'scale') {
      errors.push(`frame.responsiveMode must be 'breakpoint' or 'scale' (got ${String(f.responsiveMode)})`)
    }
    if (f.scaleOrigin !== undefined && f.scaleOrigin !== 'top-left' && f.scaleOrigin !== 'top-center') {
      errors.push(`frame.scaleOrigin must be 'top-left' or 'top-center' (got ${String(f.scaleOrigin)})`)
    }
    // The frame is now rendered (LayoutShell → --layout-max-width /
    // --layout-space-y), so an illegal value silently falls back to the frame
    // default instead of throwing mid-render — the author has to be told here.
    if (f.containerMode !== undefined && !isLayoutContainerMode(f.containerMode)) {
      errors.push(
        `frame.containerMode must be one of ${LAYOUT_CONTAINER_MODES.join(', ')} (got ${String(f.containerMode)})`,
      )
    }
    if (f.sectionSpacingDefault !== undefined && !isLayoutSpacingTier(f.sectionSpacingDefault)) {
      errors.push(
        `frame.sectionSpacingDefault must be one of ${LAYOUT_SPACING_TIERS.join(', ')} (got ${String(f.sectionSpacingDefault)})`,
      )
    }
    if (f.designWidth !== undefined && (typeof f.designWidth !== 'number' || f.designWidth <= 0)) {
      errors.push(`frame.designWidth must be a positive number (got ${String(f.designWidth)})`)
    }
    if (
      typeof f.minScale === 'number'
      && typeof f.maxScale === 'number'
      && f.minScale > f.maxScale
    ) {
      warnings.push(`frame.minScale (${f.minScale}) is greater than frame.maxScale (${f.maxScale}); the scale will be clamped to maxScale`)
    }
  }

  // A half-declared `canvasPreset` is read as "no preset" everywhere else
  // (see `canvasPresets.ts`), so an author editing a layout has to be told
  // here — otherwise the option simply vanishes from the New-canvas form with
  // nothing anywhere saying why.
  if (layout.canvasPreset !== undefined && !isLayoutCanvasPreset(layout.canvasPreset)) {
    errors.push(
      'canvasPreset must declare a localized "hint" and a complete "initialSection" '
      + '({ containerMode, containerInsetX, sectionSpaceY }) with legal values',
    )
  }

  return { valid: errors.length === 0, errors, warnings }
}
