import { describe, it, expect } from 'vitest'
import { anchorStyles, baseChromeStyles, rotationTransform, hideBelowAttr } from '~/shared/features/layout/chromeStyle'

describe('chromeStyle helpers', () => {
  it('anchorStyles handles top-left', () => {
    expect(anchorStyles('top-left', '10px', '20px')).toEqual({ top: '20px', left: '10px' })
  })
  it('anchorStyles handles bottom-right', () => {
    expect(anchorStyles('bottom-right', '10px', '20px')).toEqual({ bottom: '20px', right: '10px' })
  })
  it('anchorStyles handles center with translate', () => {
    const styles = anchorStyles('center', '10px', '20px')
    expect(styles.top).toBe('50%')
    expect(styles.left).toBe('50%')
    expect(styles.transform).toContain('translate(-50%, -50%)')
    expect(styles.transform).toContain('translate(10px, 20px)')
  })
  it('rotationTransform composes with existing transform', () => {
    expect(rotationTransform('45deg')).toBe('rotate(45deg)')
    expect(rotationTransform('45deg', 'translate(-50%, -50%)')).toBe('translate(-50%, -50%) rotate(45deg)')
    expect(rotationTransform(undefined, 'translate(-50%, -50%)')).toBe('translate(-50%, -50%)')
  })
  it('baseChromeStyles emits position/zIndex/pointerEvents', () => {
    // baseChromeStyles only reads BaseChromeElement props; cast a richer
    // LineChromeElement-shaped fixture down to the base type.
    const result = baseChromeStyles({
      id: 'x',
      enabled: true,
      position: 'fixed' as const,
      anchor: 'top-left' as const,
      offsetX: '0',
      offsetY: '0',
      zIndex: 50,
      opacity: 0.8,
    })
    expect(result.position).toBe('fixed')
    expect(result.zIndex).toBe('50')
    expect(result.pointerEvents).toBe('none')
    expect(result.opacity).toBe('0.8')
  })
  it('hideBelowAttr returns the breakpoint string or undefined', () => {
    expect(hideBelowAttr('md')).toBe('md')
    expect(hideBelowAttr(null)).toBeUndefined()
    expect(hideBelowAttr(undefined)).toBeUndefined()
  })
})
