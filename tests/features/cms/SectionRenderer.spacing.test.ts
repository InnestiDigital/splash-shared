/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed } from 'vue'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

vi.stubGlobal('computed', computed)

// Stub sectionSchemas — SectionRenderer imports getSectionTypeSchema
vi.mock('~/shared/features/cms/sectionSchemas', () => ({
  getSectionTypeSchema: () => null,
}))

// Stub useSectionReveal — requires IntersectionObserver
vi.mock('~/shared/composables/useSectionReveal', () => ({
  useSectionReveal: () => {},
}))

import SectionRenderer from '~/shared/features/cms/SectionRenderer.vue'

function makeSection(overrides: Record<string, any> = {}) {
  return {
    id: 'sec-1',
    name: 'Test',
    anchor: null,
    isHidden: false,
    colorScheme: 'light',
    sectionRole: null,
    sectionType: 'stacked',
    containerMode: 'measure',
    position: 0,
    sectionSpaceY: 'md',
    containerInsetX: 'md',
    revealPreset: null,
    revealOverrides: null,
    defaultBlockEntrance: null,
    layoutConfig: null,
    ...overrides,
  }
}

describe('SectionRenderer spacing', () => {
  it('sets --section-space-y CSS var from sectionSpaceY prop', () => {
    const wrapper = mount(SectionRenderer, {
      props: {
        section: makeSection({ sectionSpaceY: 'lg' }),
        blocksByRole: {},
        themeName: 'standalone',
      },
    })
    const style = wrapper.find('.section-renderer').attributes('style') ?? ''
    expect(style).toContain('--section-space-y: var(--section-space-y-lg)')
  })

  it('sets --container-inset-x CSS var from containerInsetX prop', () => {
    const wrapper = mount(SectionRenderer, {
      props: {
        section: makeSection({ containerInsetX: 'sm' }),
        blocksByRole: {},
        themeName: 'standalone',
      },
    })
    const style = wrapper.find('.section-renderer').attributes('style') ?? ''
    expect(style).toContain('--container-inset-x: var(--container-inset-x-sm)')
  })

  it('falls back to the layout frame space-y when the section has none', () => {
    const section = makeSection()
    delete (section as any).sectionSpaceY
    const wrapper = mount(SectionRenderer, {
      props: { section, blocksByRole: {}, themeName: 'standalone' },
    })
    const style = wrapper.find('.section-renderer').attributes('style') ?? ''
    expect(style).toContain('--section-space-y: var(--layout-space-y, var(--section-space-y-md))')
  })

  it('full-bleed + default inset = none (no horizontal padding)', () => {
    const section = makeSection({ containerMode: 'full-bleed' })
    delete (section as any).containerInsetX
    const wrapper = mount(SectionRenderer, {
      props: { section, blocksByRole: {}, themeName: 'standalone' },
    })
    const style = wrapper.find('.section-renderer').attributes('style') ?? ''
    expect(style).toContain('--container-inset-x: var(--container-inset-x-none)')
  })

  it('content mode + no section inset = layout frame inset', () => {
    const section = makeSection({ containerMode: 'content' })
    delete (section as any).containerInsetX
    const wrapper = mount(SectionRenderer, {
      props: { section, blocksByRole: {}, themeName: 'standalone' },
    })
    const style = wrapper.find('.section-renderer').attributes('style') ?? ''
    expect(style).toContain('--container-inset-x: var(--layout-inset-x, var(--container-inset-x-md))')
  })

  it('wide mode + no section inset = layout frame inset', () => {
    const section = makeSection({ containerMode: 'wide' })
    delete (section as any).containerInsetX
    const wrapper = mount(SectionRenderer, {
      props: { section, blocksByRole: {}, themeName: 'standalone' },
    })
    const style = wrapper.find('.section-renderer').attributes('style') ?? ''
    expect(style).toContain('--container-inset-x: var(--layout-inset-x, var(--container-inset-x-md))')
  })

  it('measure mode + no section inset = layout frame inset', () => {
    const section = makeSection({ containerMode: 'measure' })
    delete (section as any).containerInsetX
    const wrapper = mount(SectionRenderer, {
      props: { section, blocksByRole: {}, themeName: 'standalone' },
    })
    const style = wrapper.find('.section-renderer').attributes('style') ?? ''
    expect(style).toContain('--container-inset-x: var(--layout-inset-x, var(--container-inset-x-md))')
  })

  it('explicit inset overrides default for full-bleed', () => {
    const wrapper = mount(SectionRenderer, {
      props: {
        section: makeSection({ containerMode: 'full-bleed', containerInsetX: 'lg' }),
        blocksByRole: {},
        themeName: 'standalone',
      },
    })
    const style = wrapper.find('.section-renderer').attributes('style') ?? ''
    expect(style).toContain('--container-inset-x: var(--container-inset-x-lg)')
  })

  it('explicit inset overrides default for content mode', () => {
    const wrapper = mount(SectionRenderer, {
      props: {
        section: makeSection({ containerMode: 'content', containerInsetX: 'xl' }),
        blocksByRole: {},
        themeName: 'standalone',
      },
    })
    const style = wrapper.find('.section-renderer').attributes('style') ?? ''
    expect(style).toContain('--container-inset-x: var(--container-inset-x-xl)')
  })

  it('container modes set max-width class without padding classes', () => {
    const wrapper = mount(SectionRenderer, {
      props: {
        section: makeSection({ containerMode: 'measure' }),
        blocksByRole: {},
        themeName: 'standalone',
      },
    })
    const container = wrapper.find('.section-renderer__container--measure')
    expect(container.exists()).toBe(true)
  })

  it('applies none for sectionSpaceY', () => {
    const wrapper = mount(SectionRenderer, {
      props: {
        section: makeSection({ sectionSpaceY: 'none' }),
        blocksByRole: {},
        themeName: 'standalone',
      },
    })
    const style = wrapper.find('.section-renderer').attributes('style') ?? ''
    expect(style).toContain('--section-space-y: var(--section-space-y-none)')
  })

  it('applies xl for sectionSpaceY', () => {
    const wrapper = mount(SectionRenderer, {
      props: {
        section: makeSection({ sectionSpaceY: 'xl' }),
        blocksByRole: {},
        themeName: 'standalone',
      },
    })
    const style = wrapper.find('.section-renderer').attributes('style') ?? ''
    expect(style).toContain('--section-space-y: var(--section-space-y-xl)')
  })

  it('does not apply old spacing classes', () => {
    const wrapper = mount(SectionRenderer, {
      props: {
        section: makeSection({ sectionSpaceY: 'md' }),
        blocksByRole: {},
        themeName: 'standalone',
      },
    })
    const classes = wrapper.find('.section-renderer').classes()
    expect(classes.every(c => !c.includes('spacing-compact'))).toBe(true)
    expect(classes.every(c => !c.includes('spacing-normal'))).toBe(true)
    expect(classes.every(c => !c.includes('spacing-spacious'))).toBe(true)
  })
})

describe('SectionRenderer layout-frame fallback', () => {
  it('ignores the frame vars when the section declares its own spacing', () => {
    const wrapper = mount(SectionRenderer, {
      props: {
        section: makeSection({ sectionSpaceY: 'lg', containerInsetX: 'sm' }),
        blocksByRole: {},
        themeName: 'standalone',
      },
    })
    const style = wrapper.find('.section-renderer').attributes('style') ?? ''
    expect(style).toContain('--section-space-y: var(--section-space-y-lg)')
    expect(style).toContain('--container-inset-x: var(--container-inset-x-sm)')
    expect(style).not.toContain('--layout-space-y')
    expect(style).not.toContain('--layout-inset-x')
  })

  it('keeps full-bleed sections flush regardless of the frame inset', () => {
    const section = makeSection({ containerMode: 'full-bleed' })
    delete (section as any).containerInsetX
    const wrapper = mount(SectionRenderer, {
      props: { section, blocksByRole: {}, themeName: 'standalone' },
    })
    const style = wrapper.find('.section-renderer').attributes('style') ?? ''
    expect(style).toContain('--container-inset-x: var(--container-inset-x-none)')
    expect(style).not.toContain('--layout-inset-x')
  })

  it('still emits the container-mode modifier class that overrides the frame width', () => {
    const wrapper = mount(SectionRenderer, {
      props: {
        section: makeSection({ containerMode: 'content' }),
        blocksByRole: {},
        themeName: 'standalone',
      },
    })
    expect(wrapper.find('.section-renderer__container--content').exists()).toBe(true)
  })
})

// happy-dom does not do layout, so the source is the only place the cascade
// order between the frame default and the section's container mode can be
// asserted: the frame var must be declared BEFORE the mode modifiers, which are
// rules of equal specificity and therefore win.
describe('SectionRenderer container width cascade', () => {
  const source = readFileSync(
    resolve(__dirname, '../../../../shared/features/cms/SectionRenderer.vue'),
    'utf8',
  )

  it('uses the layout frame width as the container default', () => {
    expect(source).toMatch(/max-width:\s*var\(--layout-max-width, none\)/)
  })

  it('declares the frame default before the container-mode modifiers', () => {
    const frameDefault = source.indexOf('var(--layout-max-width, none)')
    const firstModifier = source.indexOf('&--measure')
    expect(frameDefault).toBeGreaterThan(-1)
    expect(firstModifier).toBeGreaterThan(frameDefault)
  })
})

// happy-dom does not do layout, so the @container rules cannot be asserted by
// measurement — guard the source instead (same pattern as the DynamicPage
// height-reservation tests). Both axes must carry a narrow-container cap: the
// vertical lg/xl tiers stack 128px+ paddings, and the horizontal md tier
// (4.8rem) alone costs 96px of a 360px phone. The caps must stay @container
// (not @media) so they fire in admin FULL-preview and stay inert in scale mode.
describe('SectionRenderer narrow-container spacing caps', () => {
  const source = readFileSync(
    resolve(__dirname, '../../../../shared/features/cms/SectionRenderer.vue'),
    'utf8',
  )

  it('caps vertical section spacing inside a container query', () => {
    expect(source).toMatch(/@container \(max-width: 768px\)[\s\S]*?padding-top:\s*min\(var\(--section-space-y\),\s*6\.4rem\)/)
  })

  it('caps the horizontal container inset at the point of use inside a container query', () => {
    // Point-of-use min(), NOT a --container-inset-x redefinition: the var is
    // set inline by spacingStyle, and inline style beats any stylesheet rule.
    expect(source).toMatch(/@container \(max-width: 768px\)\s*\{\s*padding:\s*0\s+min\(var\(--container-inset-x\),\s*2rem\)/)
    expect(source).not.toMatch(/--container-inset-x:\s*min\(var\(--container-inset-x\)/)
  })
})
