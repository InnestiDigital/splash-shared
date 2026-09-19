// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { evaluateConditions } from '~/shared/features/cms/animation/sceneConditions'
import type { SceneConditions } from '~/shared/types/animation'

describe('evaluateConditions', () => {
  let originalInnerWidth: number
  let matchMediaMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    originalInnerWidth = window.innerWidth
    matchMediaMock = vi.fn().mockReturnValue({ matches: true })
    vi.stubGlobal('matchMedia', matchMediaMock)
  })

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      value: originalInnerWidth,
      writable: true,
      configurable: true,
    })
    vi.unstubAllGlobals()
  })

  function setWidth(w: number) {
    Object.defineProperty(window, 'innerWidth', {
      value: w,
      writable: true,
      configurable: true,
    })
  }

  it('returns true when conditions are undefined', () => {
    expect(evaluateConditions(undefined)).toBe(true)
  })

  it('returns true when conditions are an empty object', () => {
    expect(evaluateConditions({})).toBe(true)
  })

  describe('minBreakpoint', () => {
    it('passes when width meets minimum', () => {
      setWidth(1024)
      expect(evaluateConditions({ minBreakpoint: 'lg' })).toBe(true)
    })

    it('passes when width exceeds minimum', () => {
      setWidth(1400)
      expect(evaluateConditions({ minBreakpoint: 'lg' })).toBe(true)
    })

    it('fails when width is below minimum', () => {
      setWidth(600)
      expect(evaluateConditions({ minBreakpoint: 'lg' })).toBe(false)
    })

    it('sm threshold is 640', () => {
      setWidth(639)
      expect(evaluateConditions({ minBreakpoint: 'sm' })).toBe(false)
      setWidth(640)
      expect(evaluateConditions({ minBreakpoint: 'sm' })).toBe(true)
    })

    it('xl threshold is 1280', () => {
      setWidth(1279)
      expect(evaluateConditions({ minBreakpoint: 'xl' })).toBe(false)
      setWidth(1280)
      expect(evaluateConditions({ minBreakpoint: 'xl' })).toBe(true)
    })
  })

  describe('maxBreakpoint', () => {
    it('passes when width is below max', () => {
      setWidth(600)
      expect(evaluateConditions({ maxBreakpoint: 'md' })).toBe(true)
    })

    it('fails when width meets or exceeds max', () => {
      setWidth(768)
      expect(evaluateConditions({ maxBreakpoint: 'md' })).toBe(false)
    })

    it('fails when width exceeds max', () => {
      setWidth(1000)
      expect(evaluateConditions({ maxBreakpoint: 'md' })).toBe(false)
    })
  })

  describe('min + max range', () => {
    it('passes when width is within range', () => {
      setWidth(800)
      expect(evaluateConditions({ minBreakpoint: 'md', maxBreakpoint: 'lg' })).toBe(true)
    })

    it('fails when width is below range', () => {
      setWidth(600)
      expect(evaluateConditions({ minBreakpoint: 'md', maxBreakpoint: 'lg' })).toBe(false)
    })

    it('fails when width is above range', () => {
      setWidth(1100)
      expect(evaluateConditions({ minBreakpoint: 'md', maxBreakpoint: 'lg' })).toBe(false)
    })
  })

  describe('pointer', () => {
    it('pointer: fine passes when matchMedia returns fine', () => {
      matchMediaMock.mockReturnValue({ matches: true })
      setWidth(1200)
      expect(evaluateConditions({ pointer: 'fine' })).toBe(true)
      expect(matchMediaMock).toHaveBeenCalledWith('(pointer: fine)')
    })

    it('pointer: fine fails when matchMedia returns coarse', () => {
      matchMediaMock.mockReturnValue({ matches: false })
      setWidth(1200)
      expect(evaluateConditions({ pointer: 'fine' })).toBe(false)
    })

    it('pointer: coarse passes when matchMedia returns coarse (not fine)', () => {
      matchMediaMock.mockReturnValue({ matches: false })
      setWidth(1200)
      expect(evaluateConditions({ pointer: 'coarse' })).toBe(true)
    })

    it('pointer: coarse fails when matchMedia returns fine', () => {
      matchMediaMock.mockReturnValue({ matches: true })
      setWidth(1200)
      expect(evaluateConditions({ pointer: 'coarse' })).toBe(false)
    })
  })

  describe('AND logic — all conditions must pass', () => {
    it('fails when breakpoint passes but pointer fails', () => {
      setWidth(1200)
      matchMediaMock.mockReturnValue({ matches: true }) // fine pointer
      expect(evaluateConditions({ minBreakpoint: 'lg', pointer: 'coarse' })).toBe(false)
    })

    it('fails when pointer passes but breakpoint fails', () => {
      setWidth(600)
      matchMediaMock.mockReturnValue({ matches: true })
      expect(evaluateConditions({ minBreakpoint: 'lg', pointer: 'fine' })).toBe(false)
    })

    it('passes when all conditions pass', () => {
      setWidth(1200)
      matchMediaMock.mockReturnValue({ matches: true })
      expect(evaluateConditions({ minBreakpoint: 'lg', pointer: 'fine' })).toBe(true)
    })
  })
})
