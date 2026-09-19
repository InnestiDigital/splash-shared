import { describe, it, expect } from 'vitest'
import { toWAAPIKeyframes, composeTransform } from '~/shared/features/cms/animation/adapters/keyframeUtils'
import type { Keyframe } from '~/shared/types/animation'

describe('composeTransform', () => {
  it('composes translate + scale + rotate', () => {
    const result = composeTransform({ x: '10px', y: '20px', scale: 1.5, rotate: '45deg' })
    expect(result).toBe('translate(10px, 20px) scale(1.5) rotate(45deg)')
  })

  it('defaults missing translate axis to 0', () => {
    const result = composeTransform({ x: '10px' })
    expect(result).toBe('translate(10px, 0)')
  })
})

describe('toWAAPIKeyframes', () => {
  it('maps opacity and transform', () => {
    const kfs: Keyframe[] = [
      { offset: 0, opacity: 0, transform: { x: '0px', y: '0px' } },
      { offset: 1, opacity: 1, transform: { x: '100px', y: '50px' } },
    ]
    const result = toWAAPIKeyframes(kfs)

    expect(result).toHaveLength(2)
    expect(result[0].offset).toBe(0)
    expect(result[0].opacity).toBe(0)
    expect(result[0].transform).toBe('translate(0px, 0px)')
    expect(result[1].opacity).toBe(1)
  })

  it('maps blur to filter', () => {
    const result = toWAAPIKeyframes([{ offset: 0, blur: '5px' }])
    expect(result[0].filter).toBe('blur(5px)')
  })

  it('maps clipPath', () => {
    const result = toWAAPIKeyframes([{ offset: 0, clipPath: 'circle(50%)' }])
    expect(result[0].clipPath).toBe('circle(50%)')
  })

  // ---- New: color ----

  it('passes color through to WAAPI keyframe', () => {
    const result = toWAAPIKeyframes([
      { offset: 0, color: '#ff0000' },
      { offset: 1, color: '#0000ff' },
    ])
    expect(result[0].color).toBe('#ff0000')
    expect(result[1].color).toBe('#0000ff')
  })

  // ---- New: backgroundColor ----

  it('passes backgroundColor through to WAAPI keyframe', () => {
    const result = toWAAPIKeyframes([
      { offset: 0, backgroundColor: 'rgb(255,0,0)' },
      { offset: 1, backgroundColor: 'rgb(0,0,255)' },
    ])
    expect(result[0].backgroundColor).toBe('rgb(255,0,0)')
    expect(result[1].backgroundColor).toBe('rgb(0,0,255)')
  })

  // ---- New: vars stripped ----

  it('strips vars from WAAPI output', () => {
    const result = toWAAPIKeyframes([
      {
        offset: 0,
        opacity: 0,
        vars: { '--motion-x': { type: 'number', value: 0 } },
      },
    ])
    expect(result[0].opacity).toBe(0)
    expect(result[0]).not.toHaveProperty('vars')
  })

  // ---- Regression: empty keyframe ----

  it('handles keyframe with only offset', () => {
    const result = toWAAPIKeyframes([{ offset: 0.5 }])
    expect(result[0]).toEqual({ offset: 0.5 })
  })
})
