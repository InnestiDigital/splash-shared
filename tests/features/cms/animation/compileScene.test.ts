import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { compileSceneEntries } from '~/shared/features/cms/animation/compileScene'
import type { AnimationEntry, Keyframe, TypedValue } from '~/shared/types/animation'

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<AnimationEntry> = {}): AnimationEntry {
  return {
    id: 'entry-1',
    sceneId: 'scene-1',
    target: { entityType: 'block', entityId: 'b1', part: 'root' },
    keyframes: [
      { offset: 0, opacity: 0 },
      { offset: 1, opacity: 1 },
    ],
    position: { type: 'absolute', ms: 0 },
    ...overrides,
  }
}

function kfWithVars(offset: number, vars: Record<string, TypedValue>): Keyframe {
  return { offset, vars }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('compileSceneEntries', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  // ---- Passthrough (no scrollRange, no vars) ----

  it('passes through entries with no scrollRange or vars', () => {
    const entries = [makeEntry()]
    const result = compileSceneEntries(entries)

    expect(result).toHaveLength(1)
    expect(result[0].source).toBe(entries[0])
    expect(result[0].compiled.scrollRange).toBeNull()
    expect(result[0].compiled.varTracks).toBeNull()
  })

  // ---- scrollRange validation ----

  it('preserves valid scrollRange', () => {
    const entry = makeEntry({ scrollRange: { start: 0.2, end: 0.8 } })
    const [result] = compileSceneEntries([entry])

    expect(result.compiled.scrollRange).toEqual({ start: 0.2, end: 0.8 })
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('drops scrollRange when start >= end and warns', () => {
    const entry = makeEntry({ scrollRange: { start: 0.8, end: 0.2 } })
    const [result] = compileSceneEntries([entry])

    expect(result.compiled.scrollRange).toBeNull()
    expect(warnSpy).toHaveBeenCalledOnce()
  })

  it('drops scrollRange when start === end and warns', () => {
    const entry = makeEntry({ scrollRange: { start: 0.5, end: 0.5 } })
    const [result] = compileSceneEntries([entry])

    expect(result.compiled.scrollRange).toBeNull()
    expect(warnSpy).toHaveBeenCalledOnce()
  })

  it('clamps out-of-bounds scrollRange and warns', () => {
    const entry = makeEntry({ scrollRange: { start: -0.5, end: 1.5 } })
    const [result] = compileSceneEntries([entry])

    expect(result.compiled.scrollRange).toEqual({ start: 0, end: 1 })
    expect(warnSpy).toHaveBeenCalled()
  })

  // ---- var tracks: number ----

  it('pre-parses number var tracks', () => {
    const entry = makeEntry({
      keyframes: [
        kfWithVars(0, { '--motion-opacity': { type: 'number', value: 0 } }),
        kfWithVars(1, { '--motion-opacity': { type: 'number', value: 1 } }),
      ],
    })
    const [result] = compileSceneEntries([entry])

    expect(result.compiled.varTracks).toHaveLength(1)
    const track = result.compiled.varTracks![0]
    expect(track.name).toBe('--motion-opacity')
    expect(track.type).toBe('number')
    expect(track.stops).toEqual([
      { offset: 0, type: 'number', num: 0 },
      { offset: 1, type: 'number', num: 1 },
    ])
  })

  // ---- var tracks: color ----

  it('pre-parses color var tracks to OKLCH', () => {
    const entry = makeEntry({
      keyframes: [
        kfWithVars(0, { '--motion-tint': { type: 'color', value: '#ff0000' } }),
        kfWithVars(1, { '--motion-tint': { type: 'color', value: '#0000ff' } }),
      ],
    })
    const [result] = compileSceneEntries([entry])

    expect(result.compiled.varTracks).toHaveLength(1)
    const track = result.compiled.varTracks![0]
    expect(track.name).toBe('--motion-tint')
    expect(track.type).toBe('color')
    expect(track.stops[0].type).toBe('color')
    expect(track.stops[0]).toHaveProperty('oklch')
  })

  // ---- var tracks: length ----

  it('pre-parses length var tracks', () => {
    const entry = makeEntry({
      keyframes: [
        kfWithVars(0, { '--motion-x': { type: 'length', value: '0px' } }),
        kfWithVars(1, { '--motion-x': { type: 'length', value: '100px' } }),
      ],
    })
    const [result] = compileSceneEntries([entry])

    expect(result.compiled.varTracks).toHaveLength(1)
    const track = result.compiled.varTracks![0]
    expect(track.name).toBe('--motion-x')
    expect(track.type).toBe('length')
    expect(track.stops).toEqual([
      { offset: 0, type: 'length', num: 0, unit: 'px' },
      { offset: 1, type: 'length', num: 100, unit: 'px' },
    ])
  })

  // ---- var tracks: percentage ----

  it('pre-parses percentage var tracks', () => {
    const entry = makeEntry({
      keyframes: [
        kfWithVars(0, { '--motion-w': { type: 'percentage', value: '0%' } }),
        kfWithVars(1, { '--motion-w': { type: 'percentage', value: '100%' } }),
      ],
    })
    const [result] = compileSceneEntries([entry])

    expect(result.compiled.varTracks).toHaveLength(1)
    const track = result.compiled.varTracks![0]
    expect(track.name).toBe('--motion-w')
    expect(track.type).toBe('percentage')
    expect(track.stops).toEqual([
      { offset: 0, type: 'percentage', num: 0 },
      { offset: 1, type: 'percentage', num: 100 },
    ])
  })

  // ---- var tracks: angle ----

  it('pre-parses angle var tracks', () => {
    const entry = makeEntry({
      keyframes: [
        kfWithVars(0, { '--motion-rot': { type: 'angle', value: '0deg' } }),
        kfWithVars(1, { '--motion-rot': { type: 'angle', value: '180deg' } }),
      ],
    })
    const [result] = compileSceneEntries([entry])

    expect(result.compiled.varTracks).toHaveLength(1)
    const track = result.compiled.varTracks![0]
    expect(track.name).toBe('--motion-rot')
    expect(track.type).toBe('angle')
    expect(track.stops).toEqual([
      { offset: 0, type: 'angle', num: 0, unit: 'deg' },
      { offset: 1, type: 'angle', num: 180, unit: 'deg' },
    ])
  })

  // ---- unit mismatch ----

  it('drops track with unit mismatch and warns', () => {
    const entry = makeEntry({
      keyframes: [
        kfWithVars(0, { '--motion-x': { type: 'length', value: '0px' } }),
        kfWithVars(1, { '--motion-x': { type: 'length', value: '10rem' } }),
      ],
    })
    const [result] = compileSceneEntries([entry])

    expect(result.compiled.varTracks).toBeNull()
    expect(warnSpy).toHaveBeenCalled()
  })

  // ---- unparseable color ----

  it('drops track with unparseable color and warns', () => {
    const entry = makeEntry({
      keyframes: [
        kfWithVars(0, { '--motion-tint': { type: 'color', value: '#ff0000' } }),
        kfWithVars(1, { '--motion-tint': { type: 'color', value: 'not-a-color' } }),
      ],
    })
    const [result] = compileSceneEntries([entry])

    expect(result.compiled.varTracks).toBeNull()
    expect(warnSpy).toHaveBeenCalled()
  })

  // ---- type inconsistency across keyframes ----

  it('drops track with inconsistent types across keyframes and warns', () => {
    const entry = makeEntry({
      keyframes: [
        kfWithVars(0, { '--motion-x': { type: 'number', value: 0 } }),
        kfWithVars(1, { '--motion-x': { type: 'length', value: '10px' } }),
      ],
    })
    const [result] = compileSceneEntries([entry])

    expect(result.compiled.varTracks).toBeNull()
    expect(warnSpy).toHaveBeenCalled()
  })

  // ---- stops sorted by offset ----

  it('sorts stops by offset', () => {
    const entry = makeEntry({
      keyframes: [
        kfWithVars(1, { '--motion-v': { type: 'number', value: 100 } }),
        kfWithVars(0, { '--motion-v': { type: 'number', value: 0 } }),
        kfWithVars(0.5, { '--motion-v': { type: 'number', value: 50 } }),
      ],
    })
    const [result] = compileSceneEntries([entry])

    const offsets = result.compiled.varTracks![0].stops.map(s => s.offset)
    expect(offsets).toEqual([0, 0.5, 1])
  })

  // ---- naming convention warning ----

  it('warns on non-standard var name prefix but keeps track', () => {
    const entry = makeEntry({
      keyframes: [
        kfWithVars(0, { '--custom-foo': { type: 'number', value: 0 } }),
        kfWithVars(1, { '--custom-foo': { type: 'number', value: 1 } }),
      ],
    })
    const [result] = compileSceneEntries([entry])

    expect(result.compiled.varTracks).toHaveLength(1)
    expect(warnSpy).toHaveBeenCalled()
  })

  // ---- multiple entries ----

  it('compiles multiple entries independently', () => {
    const entries = [
      makeEntry({ id: 'a', scrollRange: { start: 0, end: 0.5 } }),
      makeEntry({ id: 'b', scrollRange: { start: 0.5, end: 1 } }),
    ]
    const result = compileSceneEntries(entries)

    expect(result).toHaveLength(2)
    expect(result[0].compiled.scrollRange).toEqual({ start: 0, end: 0.5 })
    expect(result[1].compiled.scrollRange).toEqual({ start: 0.5, end: 1 })
  })
})
