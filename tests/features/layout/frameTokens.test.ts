import { describe, it, expect } from 'vitest'
import {
  LAYOUT_FRAME_VARS,
  containerModeWidth,
  isLayoutContainerMode,
  isLayoutSpacingTier,
  resolveFrameTokens,
} from '~/shared/features/layout/frameTokens'
import { DEFAULT_FRAME } from '~/shared/features/layout/layoutDefaults'
import type { LayoutFrameConfig } from '~/shared/types/layout'

function frame(overrides: Partial<LayoutFrameConfig> = {}): LayoutFrameConfig {
  return { ...DEFAULT_FRAME, ...overrides }
}

describe('containerModeWidth', () => {
  it('maps measure to the theme width token', () => {
    expect(containerModeWidth('measure')).toBe('var(--container-max-width, 1200px)')
  })

  it('maps content to the reading measure capped by the theme token', () => {
    expect(containerModeWidth('content')).toBe('min(720px, var(--container-max-width, 1200px))')
  })

  it('maps wide to at least 1400px', () => {
    expect(containerModeWidth('wide')).toBe('max(var(--container-max-width, 1200px), 1400px)')
  })

  it('maps full-bleed to no width limit', () => {
    expect(containerModeWidth('full-bleed')).toBe('none')
  })
})

describe('resolveFrameTokens', () => {
  it('emits the three frame custom properties', () => {
    expect(Object.keys(resolveFrameTokens(frame())).sort()).toEqual(
      [LAYOUT_FRAME_VARS.insetX, LAYOUT_FRAME_VARS.maxWidth, LAYOUT_FRAME_VARS.spaceY].sort(),
    )
  })

  it('derives max width from the container mode', () => {
    const tokens = resolveFrameTokens(frame({ containerMode: 'wide' }))
    expect(tokens['--layout-max-width']).toBe('max(var(--container-max-width, 1200px), 1400px)')
  })

  it('lets an explicit maxWidth win over the container mode', () => {
    const tokens = resolveFrameTokens(frame({ containerMode: 'content', maxWidth: '960px' }))
    expect(tokens['--layout-max-width']).toBe('960px')
  })

  it('resolves a spacing tier insetX to its theme token', () => {
    expect(resolveFrameTokens(frame({ insetX: 'lg' }))['--layout-inset-x'])
      .toBe('var(--container-inset-x-lg)')
  })

  it('passes an authored CSS length insetX through untouched', () => {
    expect(resolveFrameTokens(frame({ insetX: '7vw' }))['--layout-inset-x']).toBe('7vw')
  })

  it('resolves sectionSpacingDefault to its theme token', () => {
    expect(resolveFrameTokens(frame({ sectionSpacingDefault: 'xl' }))['--layout-space-y'])
      .toBe('var(--section-space-y-xl)')
  })

  it('falls back to the frame defaults when the frame is unset', () => {
    expect(resolveFrameTokens(frame())).toEqual({
      '--layout-max-width': 'var(--container-max-width, 1200px)',
      '--layout-inset-x': 'var(--container-inset-x-md)',
      '--layout-space-y': 'var(--section-space-y-md)',
    })
  })

  it('falls back rather than throwing on an illegal authored value', () => {
    const drifted = frame()
    Object.assign(drifted, { containerMode: 'gigantic', sectionSpacingDefault: 'huge' })
    const tokens = resolveFrameTokens(drifted)
    expect(tokens['--layout-max-width']).toBe('var(--container-max-width, 1200px)')
    expect(tokens['--layout-space-y']).toBe('var(--section-space-y-md)')
  })
})

describe('frame vocabulary guards', () => {
  it('accepts the section container-mode vocabulary', () => {
    expect(['measure', 'content', 'wide', 'full-bleed'].every(isLayoutContainerMode)).toBe(true)
    expect(isLayoutContainerMode('narrow')).toBe(false)
    expect(isLayoutContainerMode(undefined)).toBe(false)
  })

  it('accepts the spacing tier vocabulary', () => {
    expect(['none', 'sm', 'md', 'lg', 'xl'].every(isLayoutSpacingTier)).toBe(true)
    expect(isLayoutSpacingTier('huge')).toBe(false)
  })
})
