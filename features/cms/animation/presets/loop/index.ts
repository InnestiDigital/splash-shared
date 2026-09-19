import type { PresetMeta } from '~/shared/features/cms/animation/presets/types'
import { floatLoop } from './floatLoop'
import { swingLoop } from './swingLoop'
import { breatheLoop } from './breatheLoop'
import { pulseLoop } from './pulseLoop'

export { floatLoop, swingLoop, breatheLoop, pulseLoop }

export const loopPresets: PresetMeta[] = [
  { id: 'float',   name: 'Float',   group: 'safe', category: 'loop', factory: floatLoop },
  { id: 'swing',   name: 'Swing',   group: 'safe', category: 'loop', factory: swingLoop },
  { id: 'breathe', name: 'Breathe', group: 'safe', category: 'loop', factory: breatheLoop },
  { id: 'pulse',   name: 'Pulse',   group: 'safe', category: 'loop', factory: pulseLoop },
]
