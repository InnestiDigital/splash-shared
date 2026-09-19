import { describe, it, expect } from 'vitest'
import type { TypedValue, EntrySidecar, Keyframe, AnimationEntry } from '~/shared/types/animation'
import { getEntryProgress } from '~/shared/features/cms/animation/entryProgress'

describe('A1 type extensions', () => {
  it('Keyframe accepts color and backgroundColor', () => {
    const kf: Keyframe = { offset: 0, color: '#ff0000', backgroundColor: 'rgb(0,0,0)' }
    expect(kf.color).toBe('#ff0000')
    expect(kf.backgroundColor).toBe('rgb(0,0,0)')
  })

  it('Keyframe accepts vars with TypedValue', () => {
    const kf: Keyframe = {
      offset: 0.5,
      vars: {
        '--motion-tint': { type: 'color', value: '#ff8614' },
        '--motion-x': { type: 'number', value: 42 },
        '--motion-size': { type: 'length', value: '100px' },
        '--motion-angle': { type: 'angle', value: '45deg' },
        '--motion-pct': { type: 'percentage', value: '50%' },
      },
    }
    expect(kf.vars!['--motion-tint'].type).toBe('color')
  })

  it('AnimationEntry accepts scrollRange', () => {
    const entry = { scrollRange: { start: 0.2, end: 0.8 } } as Partial<AnimationEntry>
    expect(entry.scrollRange!.start).toBe(0.2)
  })

  it('EntrySidecar has update and destroy', () => {
    const sidecar: EntrySidecar = { update: (_p: number) => {}, destroy: () => {} }
    expect(typeof sidecar.update).toBe('function')
    expect(typeof sidecar.destroy).toBe('function')
  })
})

describe('getEntryProgress', () => {
  it('passes through when no scrollRange', () => {
    expect(getEntryProgress(0.5, {})).toBe(0.5)
    expect(getEntryProgress(0, {})).toBe(0)
    expect(getEntryProgress(1, {})).toBe(1)
  })

  it('clamps to 0 before start', () => {
    expect(getEntryProgress(0.1, { scrollRange: { start: 0.3, end: 0.7 } })).toBe(0)
    expect(getEntryProgress(0, { scrollRange: { start: 0.3, end: 0.7 } })).toBe(0)
    expect(getEntryProgress(0.3, { scrollRange: { start: 0.3, end: 0.7 } })).toBe(0)
  })

  it('clamps to 1 after end', () => {
    expect(getEntryProgress(0.7, { scrollRange: { start: 0.3, end: 0.7 } })).toBe(1)
    expect(getEntryProgress(0.9, { scrollRange: { start: 0.3, end: 0.7 } })).toBe(1)
    expect(getEntryProgress(1, { scrollRange: { start: 0.3, end: 0.7 } })).toBe(1)
  })

  it('linearly remaps within range', () => {
    const r = { scrollRange: { start: 0.2, end: 0.8 } }
    expect(getEntryProgress(0.2, r)).toBe(0)
    expect(getEntryProgress(0.5, r)).toBeCloseTo(0.5)
    expect(getEntryProgress(0.8, r)).toBe(1)
    expect(getEntryProgress(0.35, r)).toBeCloseTo(0.25)
  })

  it('handles full-range scrollRange as passthrough', () => {
    const r = { scrollRange: { start: 0, end: 1 } }
    expect(getEntryProgress(0.5, r)).toBeCloseTo(0.5)
  })

  it('handles narrow range', () => {
    const r = { scrollRange: { start: 0.49, end: 0.51 } }
    expect(getEntryProgress(0.5, r)).toBeCloseTo(0.5)
  })
})
