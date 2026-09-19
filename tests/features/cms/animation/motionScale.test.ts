import { describe, it, expect } from 'vitest'
import { applyMotionScale } from '~/shared/features/cms/animation/sceneResolver'
import type { Keyframe } from '~/shared/types/animation'

describe('applyMotionScale', () => {
  it('motionScale=1.0 returns keyframes unchanged', () => {
    const keyframes: Keyframe[] = [
      { offset: 0, opacity: 0, transform: { y: '40px' } },
      { offset: 1, opacity: 1, transform: { y: '0px' } },
    ]
    const result = applyMotionScale(keyframes, 1.0)
    expect(result).toEqual(keyframes)
  })

  it('motionScale=0.5 halves pixel transform distances', () => {
    const keyframes: Keyframe[] = [
      { offset: 0, transform: { y: '40px' } },
      { offset: 1, transform: { y: '0px' } },
    ]
    const result = applyMotionScale(keyframes, 0.5)
    expect(result[0].transform?.y).toBe('20px')
    expect(result[1].transform?.y).toBe('0px')
  })

  it('motionScale=0.5 halves percentage transform distances', () => {
    const keyframes: Keyframe[] = [
      { offset: 0, transform: { y: '-15%' } },
      { offset: 1, transform: { y: '0%' } },
    ]
    const result = applyMotionScale(keyframes, 0.5)
    expect(result[0].transform?.y).toBe('-7.5%')
    expect(result[1].transform?.y).toBe('0%')
  })

  it('motionScale=0 collapses transforms to zero', () => {
    const keyframes: Keyframe[] = [
      { offset: 0, transform: { y: '40px', x: '-20px' } },
      { offset: 1, transform: { y: '0px', x: '0px' } },
    ]
    const result = applyMotionScale(keyframes, 0)
    expect(result[0].transform?.y).toBe('0px')
    expect(result[0].transform?.x).toBe('0px')
  })

  it('motionScale=0 preserves opacity transitions', () => {
    const keyframes: Keyframe[] = [
      { offset: 0, opacity: 0, transform: { y: '40px' } },
      { offset: 1, opacity: 1, transform: { y: '0px' } },
    ]
    const result = applyMotionScale(keyframes, 0)
    expect(result[0].opacity).toBe(0)
    expect(result[1].opacity).toBe(1)
  })

  it('motionScale=0 preserves clipPath', () => {
    const keyframes: Keyframe[] = [
      { offset: 0, clipPath: 'inset(0 100% 0 0)', transform: { y: '20px' } },
      { offset: 1, clipPath: 'inset(0 0 0 0)', transform: { y: '0px' } },
    ]
    const result = applyMotionScale(keyframes, 0)
    expect(result[0].clipPath).toBe('inset(0 100% 0 0)')
    expect(result[1].clipPath).toBe('inset(0 0 0 0)')
  })

  it('motionScale=2.0 doubles distances', () => {
    const keyframes: Keyframe[] = [
      { offset: 0, transform: { y: '40px', x: '-10px' } },
      { offset: 1, transform: { y: '0px', x: '0px' } },
    ]
    const result = applyMotionScale(keyframes, 2.0)
    expect(result[0].transform?.y).toBe('80px')
    expect(result[0].transform?.x).toBe('-20px')
  })

  it('motionScale handles scale property (deviation from 1)', () => {
    const keyframes: Keyframe[] = [
      { offset: 0, transform: { scale: 0.85 } },
      { offset: 1, transform: { scale: 1 } },
    ]
    // scale: 0.85 → deviation = -0.15, at 0.5 → -0.075 → 0.925
    const result = applyMotionScale(keyframes, 0.5)
    expect(result[0].transform?.scale).toBeCloseTo(0.925)
    expect(result[1].transform?.scale).toBeCloseTo(1)
  })

  it('motionScale handles rotate', () => {
    const keyframes: Keyframe[] = [
      { offset: 0, transform: { rotate: '-3deg' } },
      { offset: 1, transform: { rotate: '0deg' } },
    ]
    const result = applyMotionScale(keyframes, 0.5)
    expect(result[0].transform?.rotate).toBe('-1.5deg')
    expect(result[1].transform?.rotate).toBe('0deg')
  })

  it('motionScale handles blur', () => {
    const keyframes: Keyframe[] = [
      { offset: 0, blur: '12px' },
      { offset: 1, blur: '0px' },
    ]
    const result = applyMotionScale(keyframes, 0.5)
    expect(result[0].blur).toBe('6px')
    expect(result[1].blur).toBe('0px')
  })

  it('keyframes without transforms pass through unchanged', () => {
    const keyframes: Keyframe[] = [
      { offset: 0, opacity: 0 },
      { offset: 1, opacity: 1 },
    ]
    const result = applyMotionScale(keyframes, 0.5)
    expect(result).toEqual(keyframes)
  })
})
