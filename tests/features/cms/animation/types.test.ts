import { describe, it, expect, expectTypeOf } from 'vitest'
import type { PresetCategory, PresetOutput, Keyframe, KnobDef, PresetMeta, AnimationEntry } from '~/shared/types/animation'

describe('animation types — loop category', () => {
  it('PresetCategory includes loop', () => {
    expectTypeOf<PresetCategory>().extract<'loop'>().not.toBeNever()
  })

  it('PresetOutput has optional channels field', () => {
    const output: PresetOutput = {
      keyframes: [],
      presetId: 'x',
      presetVersion: '1.0',
      channels: ['transform', 'opacity'],
    }
    expect(output.channels).toEqual(['transform', 'opacity'])
  })
})

describe('animation types — motion path fields', () => {
  it('Keyframe supports optional offset-path fields', () => {
    const kf: Keyframe = {
      offset: 0,
      offsetPath: "path('M 0 0 L 100 0')",
      offsetDistance: '0%',
      offsetRotate: '0deg',
      offsetAnchor: 'auto',
    }
    expect(kf.offsetPath).toBeDefined()
    expect(kf.offsetDistance).toBe('0%')
    expect(kf.offsetRotate).toBe('0deg')
    expect(kf.offsetAnchor).toBe('auto')
  })

  it('KnobDef supports enum-type knobs', () => {
    const knob: KnobDef = {
      id: 'direction',
      type: 'enum',
      options: ['up', 'down', 'left', 'right'],
      default: 'up',
    }
    expect(knob.options).toHaveLength(4)
  })

  it('PresetMeta supports optional knobs field', () => {
    const meta: PresetMeta = {
      id: 'test',
      name: 'Test',
      group: 'safe',
      category: 'scroll',
      factory: () => ({ keyframes: [], presetId: 'test', presetVersion: '1.0' }),
      knobs: [
        { id: 'direction', type: 'enum', options: ['up', 'down'], default: 'up' },
      ],
    }
    expect(meta.knobs).toHaveLength(1)
  })

  it('AnimationEntry supports optional presetKnobs', () => {
    const entry: AnimationEntry = {
      id: 'e1', sceneId: 's1',
      target: { entityType: 'block', entityId: 'b1', part: 'root' },
      keyframes: [],
      position: { type: 'absolute', ms: 0 },
      presetKnobs: { direction: 'up', amplitude: 'md' },
    }
    expect(entry.presetKnobs?.direction).toBe('up')
  })
})
