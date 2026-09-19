export { hoverLift } from './lift'
export { hoverScale } from './scaleHover'
export { hoverColorShift } from './colorShift'

import { hoverLift } from './lift'
import { hoverScale } from './scaleHover'
import { hoverColorShift } from './colorShift'
import type { PresetMeta } from '../types'

/**
 * Registry of all hover preset metadata.
 * Hover presets differ from entrance presets: they set explicit
 * duration/easing because quick response is semantically required.
 */
export const hoverPresets: PresetMeta[] = [
  {
    id: 'hover-lift',
    name: 'Lift',
    group: 'safe',
    category: 'hover',
    factory: hoverLift,
  },
  {
    id: 'hover-scale',
    name: 'Scale',
    group: 'safe',
    category: 'hover',
    factory: hoverScale,
  },
  {
    id: 'hover-color-shift',
    name: 'Color Shift',
    group: 'safe',
    category: 'hover',
    factory: hoverColorShift,
  },
]
