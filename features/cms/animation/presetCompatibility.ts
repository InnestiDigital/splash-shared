import type { PresetMeta } from '~/shared/types/animation'

export type TargetKind = 'media' | 'decorative' | 'text' | 'root'
type AmplitudeTier = 'sm' | 'md' | 'lg'

const VALID_KINDS = new Set<TargetKind>(['media', 'decorative', 'text', 'root'])
const TIER_ORDER: AmplitudeTier[] = ['sm', 'md', 'lg']

export interface TargetMeta {
  kind: TargetKind
  animatable: string[]
  targetPart: string
  declaredVars?: string[]  // from motionSupport.animatableVars
}

export interface PresetCompatibility {
  status: 'enabled' | 'disabled' | 'hidden'
  reasons: string[]
  warnings: string[]
  allowedKnobOptions: Record<string, Array<string | number>>
  knobWarnings: Record<string, string>
}

export function normalizedTargetKind(targetSchema: { kind?: string }): TargetKind {
  if (!targetSchema.kind) return 'root'
  if (VALID_KINDS.has(targetSchema.kind as TargetKind)) return targetSchema.kind as TargetKind
  console.warn(`[presetCompatibility] Unknown target kind "${targetSchema.kind}", falling back to "root"`)
  return 'root'
}

export function evaluatePresetCompatibility(
  preset: PresetMeta,
  target: TargetMeta,
  existingKnobs?: Record<string, string | number>,
): PresetCompatibility {
  const result: PresetCompatibility = {
    status: 'enabled',
    reasons: [],
    warnings: [],
    allowedKnobOptions: {},
    knobWarnings: {},
  }

  // --- Stage 0: Var-only preset gate ---
  const output = preset.factory()
  const requiredChannels = output.channels ?? []
  const varChannels = requiredChannels.filter(ch => ch.startsWith('--'))
  const standardChannels = requiredChannels.filter(ch => !ch.startsWith('--'))

  const isVarOnly = standardChannels.length === 0 && varChannels.length > 0
  if (isVarOnly && target.targetPart !== 'root') {
    result.status = 'hidden'
    result.reasons = ['Var-only presets only work on root target']
    return result
  }
  if (varChannels.length > 0 && target.declaredVars) {
    const missingVars = varChannels.filter(ch => !target.declaredVars!.includes(ch))
    if (missingVars.length > 0) {
      result.status = 'disabled'
      result.reasons = missingVars.map(v => `Component does not declare ${v}`)
      return result
    }
  }

  // --- Stage 1: Capability gate (standard channels) ---
  const missingChannels = standardChannels.filter(ch => !target.animatable.includes(ch))
  if (missingChannels.length > 0) {
    result.status = 'disabled'
    result.reasons = missingChannels.map(ch => `Target does not support ${ch}`)
    return result
  }

  // --- Stage 2: Kind suitability ---
  if (preset.targetKinds && !preset.targetKinds.includes(target.kind)) {
    result.status = 'hidden'
    result.reasons = [`Preset not available for ${target.kind} targets`]
    return result
  }

  // --- Stage 3: Knob options ---
  if (preset.knobs) {
    for (const knob of preset.knobs) {
      let options = [...knob.options] as Array<string | number>

      if (knob.id === 'amplitude' && preset.maxAmplitude?.[target.kind]) {
        const maxTier = preset.maxAmplitude[target.kind]!
        const maxIndex = TIER_ORDER.indexOf(maxTier)
        if (maxIndex >= 0) {
          options = options.filter(opt => {
            const tierIndex = TIER_ORDER.indexOf(opt as AmplitudeTier)
            return tierIndex === -1 || tierIndex <= maxIndex
          })
        }

        if (existingKnobs?.amplitude) {
          const existingIndex = TIER_ORDER.indexOf(existingKnobs.amplitude as AmplitudeTier)
          if (existingIndex > maxIndex) {
            result.knobWarnings.amplitude =
              `${existingKnobs.amplitude} exceeds recommended max (${maxTier}) for ${target.kind} targets`
          }
        }
      }

      result.allowedKnobOptions[knob.id] = options
    }
  }

  return result
}
