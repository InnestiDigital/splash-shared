import type { PresetOutput } from '~/shared/types/animation'
import { validateEntrancePreset, type EntrancePresetData } from './presetSchema'

export type { EntrancePresetData }
export { validateEntrancePreset }

/**
 * Build a PresetOutput from a validated data row. Pure. No defaults applied —
 * defaults live in the engine's resolution chain (scene > theme > preset > engine).
 */
export function buildEntrancePreset(data: EntrancePresetData): PresetOutput {
  const out: PresetOutput = {
    presetId: data.presetId,
    presetVersion: data.presetVersion,
    keyframes: data.keyframes,
  }
  if (data.duration !== undefined) out.duration = data.duration
  if (data.easing !== undefined) out.easing = data.easing
  if (data.reducedMotion !== undefined) out.reducedMotion = data.reducedMotion
  if (data.channels !== undefined) out.channels = data.channels
  return out
}
