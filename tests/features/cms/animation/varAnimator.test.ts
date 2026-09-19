import { describe, it, expect, beforeEach } from 'vitest'
import { createVarSidecar, applyFinalVarState } from '~/shared/features/cms/animation/varAnimator'
import type { CompiledVarTrack } from '~/shared/features/cms/animation/varAnimator'
import { parseToOklch, formatOklch } from '~/shared/features/cms/animation/oklch'

// ---------------------------------------------------------------------------
// Track builder helpers
// ---------------------------------------------------------------------------

function numTrack(name: string, stops: Array<{ offset: number; num: number }>): CompiledVarTrack {
  return { name, type: 'number', stops: stops.map(s => ({ ...s, type: 'number' as const })) }
}

function lenTrack(name: string, stops: Array<{ offset: number; num: number; unit: string }>): CompiledVarTrack {
  return { name, type: 'length', stops: stops.map(s => ({ ...s, type: 'length' as const })) }
}

function pctTrack(name: string, stops: Array<{ offset: number; num: number }>): CompiledVarTrack {
  return { name, type: 'percentage', stops: stops.map(s => ({ ...s, type: 'percentage' as const })) }
}

function angTrack(name: string, stops: Array<{ offset: number; num: number; unit: string }>): CompiledVarTrack {
  return { name, type: 'angle', stops: stops.map(s => ({ ...s, type: 'angle' as const })) }
}

function colorTrack(name: string, stops: Array<{ offset: number; color: string }>): CompiledVarTrack {
  return {
    name,
    type: 'color',
    stops: stops.map(s => ({
      offset: s.offset,
      type: 'color' as const,
      oklch: parseToOklch(s.color)!,
    })),
  }
}

// ---------------------------------------------------------------------------
// Mock element
// ---------------------------------------------------------------------------

function mockElement(): HTMLElement {
  const props = new Map<string, string>()
  return {
    style: {
      setProperty(name: string, value: string) { props.set(name, value) },
      removeProperty(name: string) { props.delete(name); return '' },
      getPropertyValue(name: string) { return props.get(name) ?? '' },
    },
    _props: props, // test-only access
  } as unknown as HTMLElement & { _props: Map<string, string> }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createVarSidecar', () => {
  let el: HTMLElement & { _props: Map<string, string> }

  beforeEach(() => {
    el = mockElement() as HTMLElement & { _props: Map<string, string> }
  })

  it('returns null for empty tracks', () => {
    expect(createVarSidecar(el, [])).toBeNull()
  })

  describe('number interpolation', () => {
    it('lerps and formats as unitless', () => {
      const sidecar = createVarSidecar(el, [
        numTrack('--opacity', [{ offset: 0, num: 0 }, { offset: 1, num: 1 }]),
      ])!
      sidecar.update(0.5)
      expect(el._props.get('--opacity')).toBe('0.5')
    })
  })

  describe('length interpolation', () => {
    it('lerps numeric part and preserves unit', () => {
      const sidecar = createVarSidecar(el, [
        lenTrack('--x', [
          { offset: 0, num: 0, unit: 'px' },
          { offset: 1, num: 100, unit: 'px' },
        ]),
      ])!
      sidecar.update(0.5)
      expect(el._props.get('--x')).toBe('50px')
    })
  })

  describe('percentage interpolation', () => {
    it('lerps and formats with %', () => {
      const sidecar = createVarSidecar(el, [
        pctTrack('--w', [{ offset: 0, num: 0 }, { offset: 1, num: 100 }]),
      ])!
      sidecar.update(0.75)
      expect(el._props.get('--w')).toBe('75%')
    })
  })

  describe('angle interpolation', () => {
    it('lerps and formats with unit', () => {
      const sidecar = createVarSidecar(el, [
        angTrack('--rot', [
          { offset: 0, num: 0, unit: 'deg' },
          { offset: 1, num: 180, unit: 'deg' },
        ]),
      ])!
      sidecar.update(0.5)
      expect(el._props.get('--rot')).toBe('90deg')
    })
  })

  describe('color interpolation', () => {
    it('lerps in OKLCH and outputs oklch() format', () => {
      const sidecar = createVarSidecar(el, [
        colorTrack('--tint', [
          { offset: 0, color: '#000000' },
          { offset: 1, color: '#ffffff' },
        ]),
      ])!
      sidecar.update(0.5)
      const val = el._props.get('--tint')!
      expect(val).toMatch(/^oklch\(/)
    })
  })

  describe('clamping', () => {
    it('holds first value before first stop', () => {
      const sidecar = createVarSidecar(el, [
        numTrack('--v', [{ offset: 0.3, num: 10 }, { offset: 0.7, num: 20 }]),
      ])!
      sidecar.update(0) // before offset 0.3
      expect(el._props.get('--v')).toBe('10')
    })

    it('holds last value after last stop', () => {
      const sidecar = createVarSidecar(el, [
        numTrack('--v', [{ offset: 0.3, num: 10 }, { offset: 0.7, num: 20 }]),
      ])!
      sidecar.update(1) // after offset 0.7
      expect(el._props.get('--v')).toBe('20')
    })
  })

  describe('constant track (1 stop)', () => {
    it('applies same value regardless of progress', () => {
      const sidecar = createVarSidecar(el, [
        numTrack('--fixed', [{ offset: 0.5, num: 42 }]),
      ])!
      sidecar.update(0)
      expect(el._props.get('--fixed')).toBe('42')
      sidecar.update(0.5)
      expect(el._props.get('--fixed')).toBe('42')
      sidecar.update(1)
      expect(el._props.get('--fixed')).toBe('42')
    })
  })

  describe('multi-stop', () => {
    it('interpolates between correct adjacent stops', () => {
      const sidecar = createVarSidecar(el, [
        numTrack('--v', [
          { offset: 0, num: 0 },
          { offset: 0.5, num: 100 },
          { offset: 1, num: 50 },
        ]),
      ])!

      sidecar.update(0.25) // between stops 0 and 0.5 → lerp 0→100 at 50%
      expect(el._props.get('--v')).toBe('50')

      sidecar.update(0.75) // between stops 0.5 and 1 → lerp 100→50 at 50%
      expect(el._props.get('--v')).toBe('75')
    })
  })

  describe('destroy', () => {
    it('removes only its own custom properties', () => {
      // Pre-set an unrelated property
      el.style.setProperty('--unrelated', '99')

      const sidecar = createVarSidecar(el, [
        numTrack('--a', [{ offset: 0, num: 1 }, { offset: 1, num: 2 }]),
        numTrack('--b', [{ offset: 0, num: 3 }, { offset: 1, num: 4 }]),
      ])!
      sidecar.update(0.5)

      expect(el._props.has('--a')).toBe(true)
      expect(el._props.has('--b')).toBe(true)

      sidecar.destroy()

      expect(el._props.has('--a')).toBe(false)
      expect(el._props.has('--b')).toBe(false)
      expect(el._props.get('--unrelated')).toBe('99')
    })
  })
})

describe('applyFinalVarState', () => {
  it('sets vars to final values on element', () => {
    const el = mockElement() as HTMLElement & { _props: Map<string, string> }
    applyFinalVarState(el, [
      numTrack('--opacity', [{ offset: 0, num: 0 }, { offset: 1, num: 1 }]),
      lenTrack('--x', [{ offset: 0, num: 0, unit: 'px' }, { offset: 1, num: 200, unit: 'px' }]),
    ])
    expect(el._props.get('--opacity')).toBe('1')
    expect(el._props.get('--x')).toBe('200px')
  })

  it('does nothing for empty tracks', () => {
    const el = mockElement() as HTMLElement & { _props: Map<string, string> }
    applyFinalVarState(el, [])
    expect(el._props.size).toBe(0)
  })
})
