import { describe, it, expect } from 'vitest'
import {
  buildEntrancePreset,
  validateEntrancePreset,
  type EntrancePresetData,
} from '~/shared/features/cms/animation/presets/buildEntrancePreset'

const baseRow: EntrancePresetData = {
  presetId: 'fade-up',
  presetVersion: '1.0',
  name: 'Fade Up',
  group: 'safe',
  keyframes: [
    { offset: 0, opacity: 0, transform: { y: '40px' } },
    { offset: 1, opacity: 1, transform: { y: '0px' } },
  ],
}

describe('buildEntrancePreset', () => {
  it('returns PresetOutput with required fields when given a minimal row', () => {
    const out = buildEntrancePreset(baseRow)
    expect(out.presetId).toBe('fade-up')
    expect(out.presetVersion).toBe('1.0')
    expect(out.keyframes).toHaveLength(2)
  })

  it('omits absent optional fields from output (no undefined keys)', () => {
    const out = buildEntrancePreset(baseRow)
    expect(Object.prototype.hasOwnProperty.call(out, 'duration')).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(out, 'easing')).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(out, 'reducedMotion')).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(out, 'channels')).toBe(false)
  })

  it('forwards optional fields when present', () => {
    const out = buildEntrancePreset({
      ...baseRow,
      duration: 600,
      easing: 'cubic-bezier(.25,.1,.25,1)',
      reducedMotion: 'fade-only',
      channels: ['opacity', 'transform'],
    })
    expect(out.duration).toBe(600)
    expect(out.easing).toBe('cubic-bezier(.25,.1,.25,1)')
    expect(out.reducedMotion).toBe('fade-only')
    expect(out.channels).toEqual(['opacity', 'transform'])
  })
})

describe('validateEntrancePreset', () => {
  it('accepts a valid row', () => {
    expect(() => validateEntrancePreset(baseRow)).not.toThrow()
    const v = validateEntrancePreset(baseRow)
    expect(v.presetId).toBe('fade-up')
  })

  it('throws when keyframes is empty', () => {
    expect(() =>
      validateEntrancePreset({ ...baseRow, keyframes: [] }),
    ).toThrow(/keyframes/)
  })

  it('throws when keyframes is missing', () => {
    const { keyframes: _k, ...row } = baseRow
    expect(() => validateEntrancePreset(row)).toThrow(/keyframes/)
  })

  it('throws when offset is non-numeric', () => {
    expect(() =>
      validateEntrancePreset({
        ...baseRow,
        keyframes: [{ offset: 'bad' as any, opacity: 0 }, { offset: 1, opacity: 1 }],
      }),
    ).toThrow(/offset/)
  })

  it('throws when offset is outside [0,1]', () => {
    expect(() =>
      validateEntrancePreset({
        ...baseRow,
        keyframes: [{ offset: -0.1, opacity: 0 }, { offset: 1, opacity: 1 }],
      }),
    ).toThrow(/offset/)
  })

  it('throws when reducedMotion is not in enum', () => {
    expect(() =>
      validateEntrancePreset({ ...baseRow, reducedMotion: 'wobble' as any }),
    ).toThrow(/reducedMotion/)
  })

  it('throws when group is not safe|expressive', () => {
    expect(() =>
      validateEntrancePreset({ ...baseRow, group: 'risky' as any }),
    ).toThrow(/group/)
  })

  it('throws when name is empty', () => {
    expect(() =>
      validateEntrancePreset({ ...baseRow, name: '' }),
    ).toThrow(/name/)
  })
})
