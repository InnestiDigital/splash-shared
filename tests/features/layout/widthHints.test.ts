import { describe, expect, it } from 'vitest'
import { crossScopeWidthHint } from '~/shared/features/layout/widthHints'
import type { MaxWidthValue, WidthModeValue } from '~/shared/types/placement'

const CONTAINER_MODES = ['measure', 'content', 'wide', 'full-bleed'] as const
const WIDTH_MODES: readonly (WidthModeValue | undefined)[] = ['auto', 'content', 'full', undefined]
const CAP: MaxWidthValue = { mode: 'token', value: 'lg' }

describe('crossScopeWidthHint', () => {
  it('explains that the block decides the width inside a full-bleed section', () => {
    expect(crossScopeWidthHint('full-bleed', 'content', undefined)).toBe('constrained-in-full-bleed')
    expect(crossScopeWidthHint('full-bleed', 'auto', CAP)).toBe('constrained-in-full-bleed')
    expect(crossScopeWidthHint('full-bleed', 'full', CAP)).toBe('constrained-in-full-bleed')
  })

  it('stays quiet when a full-bleed section carries no block-level constraint', () => {
    expect(crossScopeWidthHint('full-bleed', 'auto', undefined)).toBe('none')
    expect(crossScopeWidthHint('full-bleed', 'full', undefined)).toBe('none')
    expect(crossScopeWidthHint('full-bleed', undefined, undefined)).toBe('none')
  })

  it('explains that Full Width stops at the container in a narrowed section', () => {
    expect(crossScopeWidthHint('content', 'full', undefined)).toBe('full-in-narrow')
    expect(crossScopeWidthHint('content', 'full', CAP)).toBe('full-in-narrow')
  })

  it('leaves the ordinary reading widths unannotated', () => {
    expect(crossScopeWidthHint('measure', 'full', undefined)).toBe('none')
    expect(crossScopeWidthHint('wide', 'full', undefined)).toBe('none')
    expect(crossScopeWidthHint('content', 'content', CAP)).toBe('none')
  })

  it('treats a missing section container as no cross-scope conflict', () => {
    for (const widthMode of WIDTH_MODES) {
      expect(crossScopeWidthHint(null, widthMode, CAP)).toBe('none')
      expect(crossScopeWidthHint(undefined, widthMode, undefined)).toBe('none')
    }
  })

  it('answers every container-mode / width-mode / cap combination the same way twice', () => {
    const table = CONTAINER_MODES.flatMap(mode =>
      WIDTH_MODES.flatMap(widthMode =>
        [undefined, CAP].map(cap => [
          `${mode}/${widthMode}/${cap ? 'cap' : 'no-cap'}`,
          crossScopeWidthHint(mode, widthMode, cap),
        ] as const),
      ),
    )

    expect(Object.fromEntries(table)).toEqual({
      'measure/auto/no-cap': 'none',
      'measure/auto/cap': 'none',
      'measure/content/no-cap': 'none',
      'measure/content/cap': 'none',
      'measure/full/no-cap': 'none',
      'measure/full/cap': 'none',
      'measure/undefined/no-cap': 'none',
      'measure/undefined/cap': 'none',
      'content/auto/no-cap': 'none',
      'content/auto/cap': 'none',
      'content/content/no-cap': 'none',
      'content/content/cap': 'none',
      'content/full/no-cap': 'full-in-narrow',
      'content/full/cap': 'full-in-narrow',
      'content/undefined/no-cap': 'none',
      'content/undefined/cap': 'none',
      'wide/auto/no-cap': 'none',
      'wide/auto/cap': 'none',
      'wide/content/no-cap': 'none',
      'wide/content/cap': 'none',
      'wide/full/no-cap': 'none',
      'wide/full/cap': 'none',
      'wide/undefined/no-cap': 'none',
      'wide/undefined/cap': 'none',
      'full-bleed/auto/no-cap': 'none',
      'full-bleed/auto/cap': 'constrained-in-full-bleed',
      'full-bleed/content/no-cap': 'constrained-in-full-bleed',
      'full-bleed/content/cap': 'constrained-in-full-bleed',
      'full-bleed/full/no-cap': 'none',
      'full-bleed/full/cap': 'constrained-in-full-bleed',
      'full-bleed/undefined/no-cap': 'none',
      'full-bleed/undefined/cap': 'constrained-in-full-bleed',
    })
  })
})
