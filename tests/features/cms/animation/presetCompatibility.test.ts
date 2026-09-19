import { describe, it, expect, vi } from 'vitest'
import { evaluatePresetCompatibility, normalizedTargetKind } from '~/shared/features/cms/animation/presetCompatibility'
import type { PresetMeta } from '~/shared/types/animation'

// Targets
const mediaTarget = { kind: 'media' as const, animatable: ['opacity', 'transform', 'motion-path'], targetPart: 'media' }
const textTarget = { kind: 'text' as const, animatable: ['opacity', 'transform', 'motion-path'], targetPart: 'heading' }
const textNoPathTarget = { kind: 'text' as const, animatable: ['opacity', 'transform'], targetPart: 'heading' }
const rootWithVars = { kind: 'root' as const, animatable: ['motion-path'], targetPart: 'root', declaredVars: ['--motion-tint', '--motion-content-opacity'] }
const rootNoVars = { kind: 'root' as const, animatable: ['motion-path'], targetPart: 'root', declaredVars: [] as string[] }
const nonRootTarget = { kind: 'text' as const, animatable: ['opacity', 'transform'], targetPart: 'heading' }

// Presets
const pathArcMeta: PresetMeta = {
  id: 'path-arc', name: 'Path — Arc', group: 'safe', category: 'scroll',
  factory: () => ({ keyframes: [], presetId: 'path-arc', presetVersion: '1.0', channels: ['motion-path'], reducedMotion: 'skip' }),
  targetKinds: ['media', 'decorative', 'text', 'root'],
  maxAmplitude: { text: 'md' },
  knobs: [
    { id: 'direction', type: 'enum', options: ['up', 'down', 'left', 'right'], default: 'up' },
    { id: 'amplitude', type: 'enum', options: ['sm', 'md', 'lg'], default: 'md' },
  ] as any,
}

const pathWaveMeta: PresetMeta = {
  id: 'path-wave', name: 'Path — Wave', group: 'safe', category: 'scroll',
  factory: () => ({ keyframes: [], presetId: 'path-wave', presetVersion: '1.0', channels: ['motion-path'], reducedMotion: 'skip' }),
  targetKinds: ['media', 'decorative'],
  knobs: [{ id: 'amplitude', type: 'enum', options: ['sm', 'md', 'lg'], default: 'md' }] as any,
}

const fadeInMeta: PresetMeta = {
  id: 'fade-in', name: 'Fade In', group: 'safe', category: 'entrance',
  factory: () => ({ keyframes: [], presetId: 'fade-in', presetVersion: '1.0', channels: ['opacity'], reducedMotion: 'fade-only' }),
}

const tintThroughMeta: PresetMeta = {
  id: 'tint-through', name: 'Tint Through', group: 'expressive', category: 'scroll',
  factory: () => ({ keyframes: [], presetId: 'tint-through', presetVersion: '1.0', channels: ['--motion-tint'], reducedMotion: 'skip' }),
}

describe('evaluatePresetCompatibility', () => {
  describe('capability gate', () => {
    it('disables when target lacks required channel', () => {
      const result = evaluatePresetCompatibility(pathArcMeta, textNoPathTarget)
      expect(result.status).toBe('disabled')
      expect(result.reasons).toContain('Target does not support motion-path')
    })

    it('enables when target has all required channels', () => {
      const result = evaluatePresetCompatibility(pathArcMeta, mediaTarget)
      expect(result.status).toBe('enabled')
      expect(result.reasons).toHaveLength(0)
    })

    it('enables fade-in for target with opacity', () => {
      const result = evaluatePresetCompatibility(fadeInMeta, textNoPathTarget)
      expect(result.status).toBe('enabled')
    })

    it('disables fade-in when target lacks opacity', () => {
      const opacitylessTarget = { kind: 'root' as const, animatable: ['motion-path'], targetPart: 'root' }
      const result = evaluatePresetCompatibility(fadeInMeta, opacitylessTarget)
      expect(result.status).toBe('disabled')
      expect(result.reasons).toContain('Target does not support opacity')
    })
  })

  describe('kind suitability', () => {
    it('hides when target kind not in targetKinds', () => {
      const result = evaluatePresetCompatibility(pathWaveMeta, textTarget)
      expect(result.status).toBe('hidden')
      expect(result.reasons).toContain('Preset not available for text targets')
    })

    it('enables for unrestricted presets (no targetKinds)', () => {
      const result = evaluatePresetCompatibility(fadeInMeta, textNoPathTarget)
      expect(result.status).toBe('enabled')
    })

    it('enables when kind is in targetKinds', () => {
      const result = evaluatePresetCompatibility(pathWaveMeta, mediaTarget)
      expect(result.status).toBe('enabled')
    })
  })

  describe('var-only presets', () => {
    it('hides var-only preset on non-root target', () => {
      const result = evaluatePresetCompatibility(tintThroughMeta, nonRootTarget)
      expect(result.status).toBe('hidden')
      expect(result.reasons).toContain('Var-only presets only work on root target')
    })

    it('enables var-only preset on root target with declared var', () => {
      const result = evaluatePresetCompatibility(tintThroughMeta, rootWithVars)
      expect(result.status).toBe('enabled')
    })

    it('disables var-only preset when var is missing from declaredVars', () => {
      const result = evaluatePresetCompatibility(tintThroughMeta, rootNoVars)
      expect(result.status).toBe('disabled')
      expect(result.reasons).toContain('Component does not declare --motion-tint')
    })
  })

  describe('knob clamping', () => {
    it('clamps amplitude options for text targets with maxAmplitude', () => {
      const result = evaluatePresetCompatibility(pathArcMeta, textTarget)
      expect(result.status).toBe('enabled')
      expect(result.allowedKnobOptions.amplitude).toEqual(['sm', 'md'])
    })

    it('provides full amplitude options for media targets (no maxAmplitude)', () => {
      const result = evaluatePresetCompatibility(pathArcMeta, mediaTarget)
      expect(result.allowedKnobOptions.amplitude).toEqual(['sm', 'md', 'lg'])
    })

    it('warns when existing knob exceeds max amplitude for target kind', () => {
      const result = evaluatePresetCompatibility(pathArcMeta, textTarget, { amplitude: 'lg' })
      expect(result.status).toBe('enabled')
      expect(result.knobWarnings.amplitude).toMatch(/lg/)
      expect(result.knobWarnings.amplitude).toMatch(/md/)
    })

    it('does not warn when existing knob is within max amplitude', () => {
      const result = evaluatePresetCompatibility(pathArcMeta, textTarget, { amplitude: 'sm' })
      expect(result.knobWarnings.amplitude).toBeUndefined()
    })

    it('does not warn when existing knob equals max amplitude', () => {
      const result = evaluatePresetCompatibility(pathArcMeta, textTarget, { amplitude: 'md' })
      expect(result.knobWarnings.amplitude).toBeUndefined()
    })
  })

  describe('full knob options', () => {
    it('returns all knobs even for unclamped ones', () => {
      const result = evaluatePresetCompatibility(pathArcMeta, mediaTarget)
      expect(result.allowedKnobOptions.direction).toEqual(['up', 'down', 'left', 'right'])
      expect(result.allowedKnobOptions.amplitude).toEqual(['sm', 'md', 'lg'])
    })

    it('returns empty allowedKnobOptions for presets without knobs', () => {
      const result = evaluatePresetCompatibility(fadeInMeta, textNoPathTarget)
      expect(result.allowedKnobOptions).toEqual({})
    })
  })
})

describe('normalizedTargetKind', () => {
  it('returns kind when present and valid', () => {
    expect(normalizedTargetKind({ kind: 'media' })).toBe('media')
    expect(normalizedTargetKind({ kind: 'text' })).toBe('text')
    expect(normalizedTargetKind({ kind: 'decorative' })).toBe('decorative')
    expect(normalizedTargetKind({ kind: 'root' })).toBe('root')
  })

  it('falls back to root when kind is missing', () => {
    expect(normalizedTargetKind({})).toBe('root')
  })

  it('warns and falls back to root for unknown kind', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(normalizedTargetKind({ kind: 'unknown' })).toBe('root')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('unknown'))
    warn.mockRestore()
  })
})
