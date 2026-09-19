import { describe, it, expect } from 'vitest'
import {
  hoverLift,
  hoverScale,
  hoverColorShift,
  hoverPresets,
} from '~/shared/features/cms/animation/presets/hover'
import { presetRegistry } from '~/shared/features/cms/animation/presets'

// ---------------------------------------------------------------------------
// hoverLift
// ---------------------------------------------------------------------------

describe('hoverLift preset', () => {
  const result = hoverLift()

  it('returns two keyframes with correct offsets', () => {
    expect(result.keyframes).toHaveLength(2)
    expect(result.keyframes[0].offset).toBe(0)
    expect(result.keyframes[1].offset).toBe(1)
  })

  it('translates y from 0px to -8px', () => {
    expect(result.keyframes[0].transform).toEqual({ y: '0px' })
    expect(result.keyframes[1].transform).toEqual({ y: '-8px' })
  })

  it('sets presetId and presetVersion', () => {
    expect(result.presetId).toBe('hover-lift')
    expect(result.presetVersion).toBe('1.0')
  })

  it('sets explicit duration (hover presets are exceptions)', () => {
    expect(result.duration).toBe(300)
  })

  it('sets easing to ease-out', () => {
    expect(result.easing).toBe('ease-out')
  })
})

// ---------------------------------------------------------------------------
// hoverScale
// ---------------------------------------------------------------------------

describe('hoverScale preset', () => {
  const result = hoverScale()

  it('returns two keyframes with correct offsets', () => {
    expect(result.keyframes).toHaveLength(2)
    expect(result.keyframes[0].offset).toBe(0)
    expect(result.keyframes[1].offset).toBe(1)
  })

  it('scales from 1 to 1.04', () => {
    expect(result.keyframes[0].transform).toEqual({ scale: 1 })
    expect(result.keyframes[1].transform).toEqual({ scale: 1.04 })
  })

  it('sets presetId and presetVersion', () => {
    expect(result.presetId).toBe('hover-scale')
    expect(result.presetVersion).toBe('1.0')
  })

  it('sets explicit duration (hover presets are exceptions)', () => {
    expect(result.duration).toBe(250)
  })

  it('sets easing to ease-out', () => {
    expect(result.easing).toBe('ease-out')
  })
})

// ---------------------------------------------------------------------------
// hoverColorShift
// ---------------------------------------------------------------------------

describe('hoverColorShift preset', () => {
  const result = hoverColorShift()

  it('returns two keyframes with correct offsets', () => {
    expect(result.keyframes).toHaveLength(2)
    expect(result.keyframes[0].offset).toBe(0)
    expect(result.keyframes[1].offset).toBe(1)
  })

  it('fades opacity from 0 to 0.15', () => {
    expect(result.keyframes[0].opacity).toBe(0)
    expect(result.keyframes[1].opacity).toBe(0.15)
  })

  it('sets presetId and presetVersion', () => {
    expect(result.presetId).toBe('hover-color-shift')
    expect(result.presetVersion).toBe('1.0')
  })

  it('sets explicit duration (hover presets are exceptions)', () => {
    expect(result.duration).toBe(200)
  })

  it('sets easing to ease-out', () => {
    expect(result.easing).toBe('ease-out')
  })
})

// ---------------------------------------------------------------------------
// hoverPresets metadata array
// ---------------------------------------------------------------------------

describe('hoverPresets', () => {
  it('contains three hover presets', () => {
    expect(hoverPresets).toHaveLength(3)
  })

  it('all have category hover', () => {
    for (const meta of hoverPresets) {
      expect(meta.category).toBe('hover')
    }
  })

  it('all have group safe', () => {
    for (const meta of hoverPresets) {
      expect(meta.group).toBe('safe')
    }
  })

  it('each factory produces matching presetId', () => {
    for (const meta of hoverPresets) {
      const output = meta.factory()
      expect(output.presetId).toBe(meta.id)
    }
  })

  it('each factory sets presetVersion', () => {
    for (const meta of hoverPresets) {
      const output = meta.factory()
      expect(output.presetVersion).toBeTruthy()
    }
  })

  it('each factory sets explicit duration', () => {
    for (const meta of hoverPresets) {
      const output = meta.factory()
      expect(output.duration).toBeGreaterThan(0)
    }
  })
})

// ---------------------------------------------------------------------------
// presetRegistry integration
// ---------------------------------------------------------------------------

describe('presetRegistry includes hover presets', () => {
  it('contains hover-lift', () => {
    const factory = presetRegistry['hover-lift']
    expect(factory).toBeDefined()
    expect(factory().presetId).toBe('hover-lift')
  })

  it('contains hover-scale', () => {
    const factory = presetRegistry['hover-scale']
    expect(factory).toBeDefined()
    expect(factory().presetId).toBe('hover-scale')
  })

  it('contains hover-color-shift', () => {
    const factory = presetRegistry['hover-color-shift']
    expect(factory).toBeDefined()
    expect(factory().presetId).toBe('hover-color-shift')
  })
})
