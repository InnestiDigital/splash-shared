import { describe, it, expect, vi } from 'vitest'
import type {
  AnimationScene,
  AnimationEntry,
  Keyframe,
  MotionAdapter,
} from '~/shared/types/animation'
import {
  resolveEntryDefaults,
  applyReducedMotion,
  normalizeKeyframes,
  chooseAdapter,
  SYSTEM_DEFAULTS,
  type ThemeMotionDefaults,
} from '~/shared/features/cms/animation/sceneResolver'

// ---------------------------------------------------------------------------
// Helpers
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

function makeScene(overrides: Partial<AnimationScene> = {}): AnimationScene {
  return {
    id: 'scene-1',
    pageId: 'page-1',
    versionId: 'v-1',
    trigger: {
      type: 'intersection',
      anchor: { entityType: 'block', entityId: 'b1', part: 'root' },
    },
    entries: [],
    ...overrides,
  }
}

function makeAdapter(
  name: string,
  handles: boolean,
): MotionAdapter {
  return {
    name,
    canHandle: vi.fn(() => handles),
    setup: vi.fn() as any,
    destroy: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    scrub: vi.fn(),
  }
}

// ---------------------------------------------------------------------------
// resolveEntryDefaults
// ---------------------------------------------------------------------------

describe('resolveEntryDefaults', () => {
  const emptyTheme: ThemeMotionDefaults = {}

  it('entry-level duration/easing wins', () => {
    const entry = makeEntry({ duration: 300, easing: 'ease-in' })
    const scene = makeScene({ defaults: { duration: 800, easing: 'linear' } })
    const theme: ThemeMotionDefaults = { defaultDuration: 600, defaultEasing: 'ease-out' }

    const result = resolveEntryDefaults(entry, scene, theme)
    expect(result).toEqual({ duration: 300, easing: 'ease-in' })
  })

  it('falls through to scene defaults', () => {
    const entry = makeEntry()
    const scene = makeScene({ defaults: { duration: 800, easing: 'linear' } })

    const result = resolveEntryDefaults(entry, scene, emptyTheme)
    expect(result).toEqual({ duration: 800, easing: 'linear' })
  })

  it('falls through to theme defaults', () => {
    const entry = makeEntry()
    const scene = makeScene()
    const theme: ThemeMotionDefaults = { defaultDuration: 600, defaultEasing: 'ease-out' }

    const result = resolveEntryDefaults(entry, scene, theme)
    expect(result).toEqual({ duration: 600, easing: 'ease-out' })
  })

  it('falls through to system defaults (500ms, Gentle easing)', () => {
    const entry = makeEntry()
    const scene = makeScene()

    const result = resolveEntryDefaults(entry, scene, emptyTheme)
    expect(result).toEqual({
      duration: SYSTEM_DEFAULTS.duration,
      easing: SYSTEM_DEFAULTS.easing,
    })
    expect(result.duration).toBe(500)
  })

  it('mixed: entry has duration but no easing, scene has easing', () => {
    const entry = makeEntry({ duration: 250 })
    const scene = makeScene({ defaults: { easing: 'ease-in-out' } })

    const result = resolveEntryDefaults(entry, scene, emptyTheme)
    expect(result).toEqual({ duration: 250, easing: 'ease-in-out' })
  })
})

// ---------------------------------------------------------------------------
// Theme motion defaults wiring (P2A.4)
// ---------------------------------------------------------------------------

describe('resolveEntryDefaults — theme motion defaults wiring', () => {
  const standaloneTheme: ThemeMotionDefaults = {
    defaultDuration: 600,
    defaultEasing: 'cubic-bezier(.25,.1,.25,1)',
  }

  it('theme defaults (600ms, Gentle easing) flow through when entry and scene are null', () => {
    const entry = makeEntry() // no duration/easing
    const scene = makeScene() // no defaults

    const result = resolveEntryDefaults(entry, scene, standaloneTheme)
    expect(result).toEqual({
      duration: 600,
      easing: 'cubic-bezier(.25,.1,.25,1)',
    })
  })

  it('system defaults (500ms, Gentle easing) used when theme is also empty', () => {
    const entry = makeEntry()
    const scene = makeScene()
    const emptyTheme: ThemeMotionDefaults = {}

    const result = resolveEntryDefaults(entry, scene, emptyTheme)
    expect(result).toEqual({
      duration: 500,
      easing: 'cubic-bezier(.25,.1,.25,1)',
    })
  })

  it('entry override wins over theme defaults', () => {
    const entry = makeEntry({ duration: 300, easing: 'linear' })
    const scene = makeScene()

    const result = resolveEntryDefaults(entry, scene, standaloneTheme)
    expect(result).toEqual({ duration: 300, easing: 'linear' })
  })

  it('scene defaults win over theme defaults', () => {
    const entry = makeEntry()
    const scene = makeScene({ defaults: { duration: 800, easing: 'ease-in' } })

    const result = resolveEntryDefaults(entry, scene, standaloneTheme)
    expect(result).toEqual({ duration: 800, easing: 'ease-in' })
  })

  it('partial theme defaults: duration from theme, easing from system', () => {
    const entry = makeEntry()
    const scene = makeScene()
    const partialTheme: ThemeMotionDefaults = { defaultDuration: 700 }

    const result = resolveEntryDefaults(entry, scene, partialTheme)
    expect(result).toEqual({
      duration: 700,
      easing: SYSTEM_DEFAULTS.easing,
    })
  })

  it('partial override: entry has duration, easing falls through to theme', () => {
    const entry = makeEntry({ duration: 400 })
    const scene = makeScene()

    const result = resolveEntryDefaults(entry, scene, standaloneTheme)
    expect(result).toEqual({
      duration: 400,
      easing: 'cubic-bezier(.25,.1,.25,1)',
    })
  })
})

// ---------------------------------------------------------------------------
// applyReducedMotion
// ---------------------------------------------------------------------------

describe('applyReducedMotion', () => {
  const defaults = { duration: 500, easing: 'ease' }

  it("'skip' → empty keyframes, duration 0", () => {
    const entry = makeEntry()
    const result = applyReducedMotion(entry, defaults, 'skip')
    expect(result).toEqual({ keyframes: [], duration: 0 })
  })

  it("'instant' → final frame at offset 0 and 1, duration 0", () => {
    const entry = makeEntry({
      keyframes: [
        { offset: 0, opacity: 0, transform: { y: '20px' } },
        { offset: 1, opacity: 1, transform: { y: '0px' } },
      ],
    })
    const result = applyReducedMotion(entry, defaults, 'instant')
    expect(result.duration).toBe(0)
    expect(result.keyframes).toHaveLength(2)
    expect(result.keyframes[0]).toEqual({
      offset: 0,
      opacity: 1,
      transform: { y: '0px' },
    })
    expect(result.keyframes[1]).toEqual({
      offset: 1,
      opacity: 1,
      transform: { y: '0px' },
    })
  })

  it("'fade-only' → opacity 0→1 keyframes, duration 200", () => {
    const entry = makeEntry({
      keyframes: [
        { offset: 0, opacity: 0, transform: { scale: 0.5 } },
        { offset: 1, opacity: 1, transform: { scale: 1 } },
      ],
    })
    const result = applyReducedMotion(entry, defaults, 'fade-only')
    expect(result.duration).toBe(200)
    expect(result.keyframes).toEqual([
      { offset: 0, opacity: 0 },
      { offset: 1, opacity: 1 },
    ])
  })

  it("edge case: empty keyframes array with 'instant'", () => {
    const entry = makeEntry({ keyframes: [] })
    const result = applyReducedMotion(entry, defaults, 'instant')
    expect(result).toEqual({ keyframes: [], duration: 0 })
  })
})

// ---------------------------------------------------------------------------
// normalizeKeyframes
// ---------------------------------------------------------------------------

describe('normalizeKeyframes', () => {
  it('already normalized → unchanged', () => {
    const kf: Keyframe[] = [
      { offset: 0, opacity: 0 },
      { offset: 0.5, opacity: 0.5 },
      { offset: 1, opacity: 1 },
    ]
    expect(normalizeKeyframes(kf)).toEqual(kf)
  })

  it('missing offset 0 → prepended', () => {
    const kf: Keyframe[] = [
      { offset: 0.5, opacity: 0.5 },
      { offset: 1, opacity: 1 },
    ]
    const result = normalizeKeyframes(kf)
    expect(result[0]).toEqual({ offset: 0 })
    expect(result).toHaveLength(3)
  })

  it('missing offset 1 → appended', () => {
    const kf: Keyframe[] = [
      { offset: 0, opacity: 0 },
      { offset: 0.5, opacity: 0.5 },
    ]
    const result = normalizeKeyframes(kf)
    expect(result[result.length - 1]).toEqual({ offset: 1 })
    expect(result).toHaveLength(3)
  })

  it('unsorted → sorted by offset', () => {
    const kf: Keyframe[] = [
      { offset: 1, opacity: 1 },
      { offset: 0, opacity: 0 },
      { offset: 0.5, opacity: 0.5 },
    ]
    const result = normalizeKeyframes(kf)
    expect(result.map((k) => k.offset)).toEqual([0, 0.5, 1])
  })

  it('empty array → empty array', () => {
    expect(normalizeKeyframes([])).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// chooseAdapter
// ---------------------------------------------------------------------------

describe('chooseAdapter', () => {
  const scene = makeScene()

  it('returns first adapter that canHandle', () => {
    const a1 = makeAdapter('css', false)
    const a2 = makeAdapter('waapi', true)
    const a3 = makeAdapter('gsap', true)

    const result = chooseAdapter(scene, [a1, a2, a3])
    expect(result).toBe(a2)
    expect(a1.canHandle).toHaveBeenCalledWith(scene)
    expect(a2.canHandle).toHaveBeenCalledWith(scene)
    // a3 should not be checked since a2 matched
    expect(a3.canHandle).not.toHaveBeenCalled()
  })

  it('returns null when no adapter matches', () => {
    const a1 = makeAdapter('css', false)
    const a2 = makeAdapter('waapi', false)

    expect(chooseAdapter(scene, [a1, a2])).toBeNull()
  })

  it('priority order matters (first match wins)', () => {
    const a1 = makeAdapter('gsap', true)
    const a2 = makeAdapter('waapi', true)

    expect(chooseAdapter(scene, [a1, a2])).toBe(a1)
    expect(chooseAdapter(scene, [a2, a1])).toBe(a2)
  })
})
