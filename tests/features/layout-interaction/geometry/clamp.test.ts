import { describe, it, expect } from 'vitest'
import { clampPosition, clampSize } from '../../../../../shared/features/layout-interaction/geometry/clamp'

describe('clamp helpers', () => {
  it('clampPosition allows soft bleed (-25..125)', () => {
    expect(clampPosition(-30)).toBe(-25)
    expect(clampPosition(130)).toBe(125)
    expect(clampPosition(50)).toBe(50)
  })

  it('clampSize keeps positive and bounded (5..150)', () => {
    expect(clampSize(0)).toBe(5)
    expect(clampSize(200)).toBe(150)
    expect(clampSize(30)).toBe(30)
  })
})
