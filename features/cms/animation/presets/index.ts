// Bespoke (code) — kept as functions because they need real logic
import { hoverLift, hoverScale, hoverColorShift, hoverPresets } from './hover'
import {
  parallaxSlow, parallaxFast,
  driftLeft, driftRight,
  scaleOnScroll, fadeThrough, scrollFadeIn,
  rotateSubtle, colorShift, bgFade, tintThrough,
  scrollReveal, bodyReveal, accentShift,
  heroCompress, titleDock, mediaDriftScale, fadeShift,
  scrollPresets,
} from './scroll'
import { floatLoop, swingLoop, breatheLoop, pulseLoop, loopPresets } from './loop'
import { pathArc, pathWave, pathSCurve, pathDiagonalDrift, pathPresets } from './path'
import { staggerSequential, staggerCascade, staggerQuick } from './stagger'
import {
  EASING_BOUNCY, EASING_SPRING_BACK, EASING_ELASTIC, easingPresets,
} from './easings'

// Data-driven entrance loader
import { getThemeConfig, AVAILABLE_THEMES } from '~/shared/features/cms/themeData'
import { buildEntrancePreset } from './buildEntrancePreset'
import { validateEntrancePreset, type EntrancePresetData } from './presetSchema'
import type { PresetOutput, PresetMeta } from '~/shared/types/animation'

export type { PresetOutput, PresetMeta } from './types'

// Re-export bespoke factories (preserve existing public API)
export {
  hoverLift, hoverScale, hoverColorShift, hoverPresets,
  parallaxSlow, parallaxFast,
  driftLeft, driftRight,
  scaleOnScroll, fadeThrough, scrollFadeIn,
  rotateSubtle, colorShift, bgFade, tintThrough,
  scrollReveal, bodyReveal, accentShift,
  heroCompress, titleDock, mediaDriftScale, fadeShift,
  scrollPresets,
  floatLoop, swingLoop, breatheLoop, pulseLoop, loopPresets,
  pathArc, pathWave, pathSCurve, pathDiagonalDrift, pathPresets,
  staggerSequential, staggerCascade, staggerQuick,
  EASING_BOUNCY, EASING_SPRING_BACK, EASING_ELASTIC, easingPresets,
}

// ---------------------------------------------------------------------------
// Entrance preset loader (data-driven via theme.json)
// ---------------------------------------------------------------------------

interface LoadedEntrance {
  data: EntrancePresetData
  factory: () => PresetOutput
}

function loadEntrancePresets(): Record<string, LoadedEntrance> {
  const out: Record<string, LoadedEntrance> = {}
  for (const theme of AVAILABLE_THEMES) {
    const cfg = getThemeConfig(theme)
    const raw = (cfg as any).motion?.entrancePresets
    if (!raw || typeof raw !== 'object') continue
    for (const [id, rawRow] of Object.entries(raw)) {
      try {
        const data = validateEntrancePreset({ ...(rawRow as object), presetId: id })
        if (out[data.presetId]) continue
        out[data.presetId] = { data, factory: () => buildEntrancePreset(data) }
      } catch (e) {
        console.warn(
          `[animation] entrance preset "${id}" in theme "${theme}":`,
          (e as Error).message,
        )
      }
    }
  }
  return out
}

const loadedEntrances = loadEntrancePresets()

export const presetRegistry: Record<string, () => PresetOutput> = {
  ...Object.fromEntries(
    Object.entries(loadedEntrances).map(([id, e]) => [id, e.factory]),
  ),
  'hover-lift': hoverLift,
  'hover-scale': hoverScale,
  'hover-color-shift': hoverColorShift,
  'parallax-slow': parallaxSlow,
  'parallax-fast': parallaxFast,
  'drift-left': driftLeft,
  'drift-right': driftRight,
  'scale-on-scroll': scaleOnScroll,
  'fade-through': fadeThrough,
  'scroll-fade-in': scrollFadeIn,
  'rotate-subtle': rotateSubtle,
  'color-shift': colorShift,
  'bg-fade': bgFade,
  'tint-through': tintThrough,
  'scroll-reveal': scrollReveal,
  'body-reveal': bodyReveal,
  'accent-shift': accentShift,
  'hero-compress': heroCompress,
  'title-dock': titleDock,
  'media-drift-scale': mediaDriftScale,
  'fade-shift': fadeShift,
  'float': floatLoop,
  'swing': swingLoop,
  'breathe': breatheLoop,
  'pulse': pulseLoop,
  'path-arc': pathArc,
  'path-wave': pathWave,
  'path-s-curve': pathSCurve,
  'path-diagonal-drift': pathDiagonalDrift,
}

export const entrancePresets: PresetMeta[] = Object.entries(loadedEntrances).map(
  ([id, { data, factory }]) => ({
    id,
    name: data.name,
    group: data.group,
    category: 'entrance' as const,
    factory,
  }),
)
