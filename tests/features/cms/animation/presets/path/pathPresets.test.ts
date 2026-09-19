import { describe, it, expect } from 'vitest'
import { AMPLITUDE } from '~/shared/features/cms/animation/presets/path/constants'
import { pathArc } from '~/shared/features/cms/animation/presets/path/pathArc'
import { pathWave } from '~/shared/features/cms/animation/presets/path/pathWave'
import { pathSCurve } from '~/shared/features/cms/animation/presets/path/pathSCurve'
import { pathDiagonalDrift } from '~/shared/features/cms/animation/presets/path/pathDiagonalDrift'

describe('path preset constants', () => {
  it('AMPLITUDE tiers are fixed pixel values', () => {
    expect(AMPLITUDE.sm).toBe(24)
    expect(AMPLITUDE.md).toBe(60)
    expect(AMPLITUDE.lg).toBe(120)
  })
})

describe('pathArc', () => {
  it('default knobs produce up/md shape', () => {
    const out = pathArc()
    expect(out.presetId).toBe('path-arc')
    expect(out.presetVersion).toBe('1.0')
    expect(out.channels).toEqual(['motion-path'])
    expect(out.reducedMotion).toBe('skip')
    expect(out.duration).toBeUndefined()
    expect(out.easing).toBeUndefined()
    expect(out.keyframes).toHaveLength(2)
    expect(out.keyframes[0]!.offsetPath).toBe("path('M 0 0 Q 60 -60 120 0')")
  })

  it('explicit up/md matches default', () => {
    const a = pathArc()
    const b = pathArc({ direction: 'up', amplitude: 'md' })
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('down/md bulges below baseline', () => {
    const out = pathArc({ direction: 'down', amplitude: 'md' })
    expect(out.keyframes[0]!.offsetPath).toBe("path('M 0 0 Q 60 60 120 0')")
  })

  it('left/md travels vertical with bow to the left', () => {
    const out = pathArc({ direction: 'left', amplitude: 'md' })
    expect(out.keyframes[0]!.offsetPath).toBe("path('M 0 0 Q -60 60 0 120')")
  })

  it('right/md travels vertical with bow to the right', () => {
    const out = pathArc({ direction: 'right', amplitude: 'md' })
    expect(out.keyframes[0]!.offsetPath).toBe("path('M 0 0 Q 60 60 0 120')")
  })

  it('amplitude sm and lg scale correctly', () => {
    expect(pathArc({ direction: 'up', amplitude: 'sm' }).keyframes[0]!.offsetPath)
      .toBe("path('M 0 0 Q 24 -24 48 0')")
    expect(pathArc({ direction: 'up', amplitude: 'lg' }).keyframes[0]!.offsetPath)
      .toBe("path('M 0 0 Q 120 -120 240 0')")
  })

  it('every keyframe has offsetAnchor=auto and offsetRotate=0deg', () => {
    const { keyframes } = pathArc()
    for (const kf of keyframes) {
      expect(kf.offsetAnchor).toBe('auto')
      expect(kf.offsetRotate).toBe('0deg')
    }
  })

  it('offsetDistance animates 0% → 100%', () => {
    const { keyframes } = pathArc()
    expect(keyframes[0]!.offsetDistance).toBe('0%')
    expect(keyframes[1]!.offsetDistance).toBe('100%')
  })

  it('offsetPath is identical across keyframes', () => {
    const { keyframes } = pathArc()
    expect(keyframes[0]!.offsetPath).toBe(keyframes[1]!.offsetPath)
  })

  it('no-jump contract: offset 0 at 0%, path starts at M 0 0', () => {
    const { keyframes } = pathArc()
    expect(keyframes[0]!.offsetDistance).toBe('0%')
    expect(keyframes[0]!.offsetPath).toMatch(/^path\('M 0 0 /)
  })
})

describe('pathWave', () => {
  it('default horizontal/md/cycles=1 shape', () => {
    const out = pathWave()
    expect(out.presetId).toBe('path-wave')
    expect(out.channels).toEqual(['motion-path'])
    expect(out.reducedMotion).toBe('skip')
    // 1 cycle = 2 segments, A=60 → travel 240px
    expect(out.keyframes[0]!.offsetPath).toBe("path('M 0 0 C 30 -60 90 -60 120 0 C 150 60 210 60 240 0')")
  })

  it('horizontal/md/cycles=2 → 4 segments, 480px', () => {
    const out = pathWave({ direction: 'horizontal', amplitude: 'md', cycles: 2 })
    expect(out.keyframes[0]!.offsetPath).toBe(
      "path('M 0 0 C 30 -60 90 -60 120 0 C 150 60 210 60 240 0 C 270 -60 330 -60 360 0 C 390 60 450 60 480 0')"
    )
  })

  it('horizontal/md/cycles=3 → 6 segments, 720px', () => {
    const out = pathWave({ direction: 'horizontal', amplitude: 'md', cycles: 3 })
    const path = out.keyframes[0]!.offsetPath!
    expect((path.match(/ C /g) || []).length).toBe(6)
    expect(path.endsWith("720 0')")).toBe(true)
  })

  it('vertical variant transposes axes', () => {
    const out = pathWave({ direction: 'vertical', amplitude: 'md', cycles: 1 })
    expect(out.keyframes[0]!.offsetPath).toBe("path('M 0 0 C -60 30 -60 90 0 120 C 60 150 60 210 0 240')")
  })

  it('every keyframe has offsetRotate=auto', () => {
    const { keyframes } = pathWave()
    for (const kf of keyframes) expect(kf.offsetRotate).toBe('auto')
  })

  it('determinism: same knobs → byte-identical output', () => {
    expect(JSON.stringify(pathWave({ direction: 'horizontal', amplitude: 'md', cycles: 2 })))
      .toBe(JSON.stringify(pathWave({ direction: 'horizontal', amplitude: 'md', cycles: 2 })))
  })
})

describe('pathSCurve', () => {
  it('default horizontal/md true S via two cubics', () => {
    const out = pathSCurve()
    expect(out.presetId).toBe('path-s-curve')
    expect(out.channels).toEqual(['motion-path'])
    expect(out.keyframes[0]!.offsetPath).toBe("path('M 0 0 C 45 0 45 -60 90 -60 S 135 0 180 0')")
  })

  it('vertical/md transposes axes', () => {
    const out = pathSCurve({ direction: 'vertical', amplitude: 'md' })
    expect(out.keyframes[0]!.offsetPath).toBe("path('M 0 0 C 0 45 -60 45 -60 90 S 0 135 0 180')")
  })

  it('amplitude sm=24 scales all coordinates', () => {
    // 0.75*24=18, 1.5*24=36, 2.25*24=54, 3*24=72
    const out = pathSCurve({ direction: 'horizontal', amplitude: 'sm' })
    expect(out.keyframes[0]!.offsetPath).toBe("path('M 0 0 C 18 0 18 -24 36 -24 S 54 0 72 0')")
  })

  it('every keyframe has offsetRotate=0deg', () => {
    const { keyframes } = pathSCurve()
    for (const kf of keyframes) expect(kf.offsetRotate).toBe('0deg')
  })
})

describe('pathDiagonalDrift', () => {
  it('default up-right/md produces expected bow', () => {
    const out = pathDiagonalDrift()
    expect(out.presetId).toBe('path-diagonal-drift')
    expect(out.channels).toEqual(['motion-path'])
    expect(out.keyframes[0]!.offsetPath).toBe("path('M 0 0 Q 40 -20 60 -60')")
  })

  it('down-right flips y sign', () => {
    expect(pathDiagonalDrift({ direction: 'down-right', amplitude: 'md' }).keyframes[0]!.offsetPath)
      .toBe("path('M 0 0 Q 40 20 60 60')")
  })

  it('up-left flips x sign', () => {
    expect(pathDiagonalDrift({ direction: 'up-left', amplitude: 'md' }).keyframes[0]!.offsetPath)
      .toBe("path('M 0 0 Q -40 -20 -60 -60')")
  })

  it('down-left flips both signs', () => {
    expect(pathDiagonalDrift({ direction: 'down-left', amplitude: 'md' }).keyframes[0]!.offsetPath)
      .toBe("path('M 0 0 Q -40 20 -60 60')")
  })

  it('amplitude sm rounds: A=24 → 0.66·24=15.84→16, 0.33·24=7.92→8', () => {
    expect(pathDiagonalDrift({ direction: 'up-right', amplitude: 'sm' }).keyframes[0]!.offsetPath)
      .toBe("path('M 0 0 Q 16 -8 24 -24')")
  })

  it('amplitude lg rounds: A=120 → 0.66·120=79.2→79, 0.33·120=39.6→40', () => {
    expect(pathDiagonalDrift({ direction: 'up-right', amplitude: 'lg' }).keyframes[0]!.offsetPath)
      .toBe("path('M 0 0 Q 79 -40 120 -120')")
  })

  it('every keyframe has offsetRotate=0deg', () => {
    const { keyframes } = pathDiagonalDrift()
    for (const kf of keyframes) expect(kf.offsetRotate).toBe('0deg')
  })
})

describe('path presets registry', async () => {
  const { pathPresets } = await import('~/shared/features/cms/animation/presets/path')
  const { presetRegistry } = await import('~/shared/features/cms/animation/presets')

  it('exports 4 PresetMeta entries', () => {
    expect(pathPresets).toHaveLength(4)
    expect(pathPresets.map(p => p.id).sort()).toEqual([
      'path-arc', 'path-diagonal-drift', 'path-s-curve', 'path-wave',
    ])
  })

  it('all path presets are category=scroll', () => {
    for (const p of pathPresets) expect(p.category).toBe('scroll')
  })

  it('every path preset declares knobs schema', () => {
    for (const p of pathPresets) {
      expect(p.knobs).toBeDefined()
      expect(p.knobs!.length).toBeGreaterThan(0)
      for (const knob of p.knobs!) {
        expect(knob.type).toBe('enum')
        expect(knob.default).toBeDefined()
        expect(knob.options.length).toBeGreaterThan(0)
      }
    }
  })

  it('registers all 4 factories in presetRegistry', async () => {
    expect(typeof presetRegistry['path-arc']).toBe('function')
    expect(typeof presetRegistry['path-wave']).toBe('function')
    expect(typeof presetRegistry['path-s-curve']).toBe('function')
    expect(typeof presetRegistry['path-diagonal-drift']).toBe('function')
  })

  it('every path preset starts its path at M 0 0 with offsetDistance 0% and offsetAnchor auto', () => {
    for (const meta of pathPresets) {
      const out = meta.factory()
      for (const kf of out.keyframes) {
        expect(kf.offsetAnchor, `${meta.id} offsetAnchor`).toBe('auto')
        expect(kf.offsetPath, `${meta.id} offsetPath starts at M 0 0`).toMatch(/^path\('M 0 0 /)
      }
      expect(out.keyframes[0]!.offsetDistance, `${meta.id} start distance`).toBe('0%')
      expect(out.keyframes[1]!.offsetDistance, `${meta.id} end distance`).toBe('100%')
    }
  })
})
