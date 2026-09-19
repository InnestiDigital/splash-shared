import { describe, it, expect } from 'vitest'
import { floatLoop } from '~/shared/features/cms/animation/presets/loop/floatLoop'
import { swingLoop } from '~/shared/features/cms/animation/presets/loop/swingLoop'
import { breatheLoop } from '~/shared/features/cms/animation/presets/loop/breatheLoop'
import { pulseLoop } from '~/shared/features/cms/animation/presets/loop/pulseLoop'
import { loopPresets } from '~/shared/features/cms/animation/presets/loop'
import { presetRegistry } from '~/shared/features/cms/animation/presets'

describe('floatLoop', () => {
  it('returns a valid PresetOutput with loop category channels', () => {
    const out = floatLoop()
    expect(out.presetId).toBe('float')
    expect(out.presetVersion).toBe('1.0')
    expect(out.duration).toBe(2500)
    expect(out.easing).toBe('ease-in-out')
    expect(out.reducedMotion).toBe('skip')
    expect(out.channels).toEqual(['transform'])
  })

  it('keyframe at offset 0 is the resting state (no transform)', () => {
    const { keyframes } = floatLoop()
    const rest = keyframes.find(k => k.offset === 0)
    expect(rest).toBeDefined()
    expect(rest?.transform?.y).toBeUndefined()
  })

  it('has exactly 3 keyframes: 0, 0.5, 1', () => {
    const { keyframes } = floatLoop()
    expect(keyframes.map(k => k.offset)).toEqual([0, 0.5, 1])
  })
})

describe('swingLoop', () => {
  it('returns a valid PresetOutput', () => {
    const out = swingLoop()
    expect(out.presetId).toBe('swing')
    expect(out.duration).toBe(1800)
    expect(out.easing).toBe('ease-in-out')
    expect(out.reducedMotion).toBe('skip')
    expect(out.channels).toEqual(['transform'])
  })

  it('resting state at offset 0 has no rotation', () => {
    const { keyframes } = swingLoop()
    const rest = keyframes.find(k => k.offset === 0)
    expect(rest?.transform?.rotate).toBeUndefined()
  })

  it('has 5 keyframes at offsets 0, 0.25, 0.5, 0.75, 1', () => {
    const { keyframes } = swingLoop()
    expect(keyframes.map(k => k.offset)).toEqual([0, 0.25, 0.5, 0.75, 1])
  })
})

describe('breatheLoop', () => {
  it('returns a valid PresetOutput', () => {
    const out = breatheLoop()
    expect(out.presetId).toBe('breathe')
    expect(out.duration).toBe(3200)
    expect(out.easing).toBe('cubic-bezier(.4,0,.6,1)')
    expect(out.reducedMotion).toBe('skip')
    expect(out.channels?.sort()).toEqual(['opacity', 'transform'])
  })

  it('resting state at offset 0 is opacity 1, no scale transform', () => {
    const { keyframes } = breatheLoop()
    const rest = keyframes.find(k => k.offset === 0)
    expect(rest?.opacity).toBe(1)
    expect(rest?.transform?.scale).toBeUndefined()
  })
})

describe('pulseLoop', () => {
  it('returns a valid PresetOutput with color channel', () => {
    const out = pulseLoop()
    expect(out.presetId).toBe('pulse')
    expect(out.duration).toBe(1500)
    expect(out.easing).toBe('ease-in-out')
    expect(out.reducedMotion).toBe('skip')
    expect(out.channels).toEqual(['color'])
  })

  it('uses direct color keyframes (not --motion-pulse vars)', () => {
    const { keyframes } = pulseLoop()
    for (const kf of keyframes) {
      expect(kf.vars).toBeUndefined()
      expect(kf.transform).toBeUndefined()
      expect(kf.opacity).toBeUndefined()
      expect(kf.backgroundColor).toBeUndefined()
    }
    for (const kf of keyframes) {
      expect(kf.color).toBeDefined()
    }
  })

  it('offset 0 and offset 1 use the same resting color (loop returns to rest)', () => {
    const { keyframes } = pulseLoop()
    const rest0 = keyframes.find(k => k.offset === 0)
    const rest1 = keyframes.find(k => k.offset === 1)
    expect(rest0?.color).toBe(rest1?.color)
  })
})

describe('loop presets registry', () => {
  it('exports an array of 4 PresetMeta entries', () => {
    expect(loopPresets).toHaveLength(4)
    expect(loopPresets.map(p => p.id).sort()).toEqual(['breathe', 'float', 'pulse', 'swing'])
  })

  it('all loop presets have category === "loop"', () => {
    for (const p of loopPresets) {
      expect(p.category).toBe('loop')
    }
  })

  it('registers all 4 loop factories in presetRegistry', () => {
    expect(typeof presetRegistry['float']).toBe('function')
    expect(typeof presetRegistry['swing']).toBe('function')
    expect(typeof presetRegistry['breathe']).toBe('function')
    expect(typeof presetRegistry['pulse']).toBe('function')
  })
})
