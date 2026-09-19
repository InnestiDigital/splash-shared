import type { Keyframe, ReducedMotionMode } from '~/shared/types/animation'

export interface EntrancePresetData {
  presetId: string
  presetVersion: string
  name: string
  group: 'safe' | 'expressive'
  keyframes: Keyframe[]
  duration?: number
  easing?: string
  reducedMotion?: ReducedMotionMode
  channels?: string[]
}

const REDUCED_MOTION_MODES = ['skip', 'fade-only', 'instant'] as const
const GROUP_VALUES = ['safe', 'expressive'] as const

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function validateEntrancePreset(input: unknown): EntrancePresetData {
  if (!isObject(input)) throw new Error('entrance preset must be an object')

  const presetId = input.presetId
  if (typeof presetId !== 'string' || presetId.length === 0) {
    throw new Error('entrance preset: presetId must be a non-empty string')
  }

  const presetVersion = input.presetVersion
  if (typeof presetVersion !== 'string' || presetVersion.length === 0) {
    throw new Error(`entrance preset "${presetId}": presetVersion must be a non-empty string`)
  }

  const name = input.name
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error(`entrance preset "${presetId}": name must be a non-empty string`)
  }

  const group = input.group
  if (!GROUP_VALUES.includes(group as any)) {
    throw new Error(`entrance preset "${presetId}": group must be 'safe' or 'expressive'`)
  }

  const keyframes = input.keyframes
  if (!Array.isArray(keyframes) || keyframes.length === 0) {
    throw new Error(`entrance preset "${presetId}": keyframes must be a non-empty array`)
  }
  for (const [i, kf] of keyframes.entries()) {
    if (!isObject(kf)) {
      throw new Error(`entrance preset "${presetId}": keyframes[${i}] must be an object`)
    }
    const offset = (kf as any).offset
    if (typeof offset !== 'number' || offset < 0 || offset > 1) {
      throw new Error(`entrance preset "${presetId}": keyframes[${i}].offset must be a number in [0,1]`)
    }
  }

  if (input.duration !== undefined) {
    if (typeof input.duration !== 'number' || input.duration <= 0) {
      throw new Error(`entrance preset "${presetId}": duration must be a positive number`)
    }
  }
  if (input.easing !== undefined && typeof input.easing !== 'string') {
    throw new Error(`entrance preset "${presetId}": easing must be a string`)
  }
  if (input.reducedMotion !== undefined && !REDUCED_MOTION_MODES.includes(input.reducedMotion as any)) {
    throw new Error(`entrance preset "${presetId}": reducedMotion must be 'skip', 'fade-only', or 'instant'`)
  }
  if (input.channels !== undefined) {
    if (!Array.isArray(input.channels) || input.channels.some(c => typeof c !== 'string')) {
      throw new Error(`entrance preset "${presetId}": channels must be an array of strings`)
    }
  }

  return input as EntrancePresetData
}
