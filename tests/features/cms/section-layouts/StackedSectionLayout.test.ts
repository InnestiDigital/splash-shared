/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed } from 'vue'

// Stub Nuxt auto-imports
vi.stubGlobal('computed', computed)

import StackedSectionLayout from '~/shared/features/cms/section-layouts/StackedSectionLayout.vue'

// Minimal props factory
function mountStacked(layoutConfig: Record<string, any> = {}) {
  return mount(StackedSectionLayout, {
    props: {
      section: { id: 'sec-1', sectionType: 'stacked' },
      layoutConfig,
      blocksByRole: { _default: [] },
    },
  })
}

describe('StackedSectionLayout', () => {
  // --- shellLayout class tests ---

  it('applies no shellLayout class when shellLayout is absent', () => {
    const wrapper = mountStacked({})
    const root = wrapper.find('.stacked-layout')

    expect(root.classes()).not.toContain('stacked-layout--stacked')
    expect(root.classes()).not.toContain('stacked-layout--centered')
    expect(root.classes()).not.toContain('stacked-layout--none')
  })

  it('applies stacked-layout--stacked for shellLayout stacked', () => {
    const wrapper = mountStacked({ shellLayout: 'stacked' })
    const root = wrapper.find('.stacked-layout')

    expect(root.classes()).toContain('stacked-layout--stacked')
  })

  it('applies stacked-layout--centered for shellLayout centered (legacy)', () => {
    const wrapper = mountStacked({ shellLayout: 'centered' })
    const root = wrapper.find('.stacked-layout')

    expect(root.classes()).toContain('stacked-layout--centered')
  })

  it('applies stacked-layout--none for shellLayout none', () => {
    const wrapper = mountStacked({ shellLayout: 'none' })
    const root = wrapper.find('.stacked-layout')

    expect(root.classes()).toContain('stacked-layout--none')
  })

  // --- contentAlignment class tests (SPL-060) ---

  it('applies no contentAlignment class when contentAlignment is absent', () => {
    const wrapper = mountStacked({})
    const root = wrapper.find('.stacked-layout')

    expect(root.classes()).not.toContain('stacked-layout--content-left')
    expect(root.classes()).not.toContain('stacked-layout--content-center')
    expect(root.classes()).not.toContain('stacked-layout--content-full')
  })

  it('applies stacked-layout--content-left for contentAlignment left', () => {
    const wrapper = mountStacked({ contentAlignment: 'left' })
    const root = wrapper.find('.stacked-layout')

    expect(root.classes()).toContain('stacked-layout--content-left')
    expect(root.classes()).not.toContain('stacked-layout--content-center')
    expect(root.classes()).not.toContain('stacked-layout--content-full')
  })

  it('applies stacked-layout--content-center for contentAlignment center', () => {
    const wrapper = mountStacked({ contentAlignment: 'center' })
    const root = wrapper.find('.stacked-layout')

    expect(root.classes()).toContain('stacked-layout--content-center')
    expect(root.classes()).not.toContain('stacked-layout--content-left')
    expect(root.classes()).not.toContain('stacked-layout--content-full')
  })

  it('applies stacked-layout--content-full for contentAlignment full', () => {
    const wrapper = mountStacked({ contentAlignment: 'full' })
    const root = wrapper.find('.stacked-layout')

    expect(root.classes()).toContain('stacked-layout--content-full')
    expect(root.classes()).not.toContain('stacked-layout--content-left')
    expect(root.classes()).not.toContain('stacked-layout--content-center')
  })

  // --- stackGap style tests ---

  it('uses the schema default normal gap when stackGap is absent', () => {
    const wrapper = mountStacked({})
    const root = wrapper.find('.stacked-layout')

    expect(root.attributes('style')).toContain('--block-gap: 1.5rem')
  })

  it('applies none block gap', () => {
    const wrapper = mountStacked({ stackGap: 'none' })
    const root = wrapper.find('.stacked-layout')

    expect(root.attributes('style')).toContain('--block-gap: 0')
  })

  it('applies tight block gap', () => {
    const wrapper = mountStacked({ stackGap: 'tight' })
    const root = wrapper.find('.stacked-layout')

    expect(root.attributes('style')).toContain('--block-gap: 0.5rem')
  })

  it('applies normal block gap', () => {
    const wrapper = mountStacked({ stackGap: 'normal' })
    const root = wrapper.find('.stacked-layout')

    expect(root.attributes('style')).toContain('--block-gap: 1.5rem')
  })

  it('applies spacious block gap', () => {
    const wrapper = mountStacked({ stackGap: 'spacious' })
    const root = wrapper.find('.stacked-layout')

    expect(root.attributes('style')).toContain('--block-gap: 3rem')
  })

  // --- Combination tests ---

  it('combines shellLayout stacked with contentAlignment center', () => {
    const wrapper = mountStacked({ shellLayout: 'stacked', contentAlignment: 'center' })
    const root = wrapper.find('.stacked-layout')

    expect(root.classes()).toContain('stacked-layout--stacked')
    expect(root.classes()).toContain('stacked-layout--content-center')
  })

  it('combines shellLayout stacked with contentAlignment full and spacious gap', () => {
    const wrapper = mountStacked({
      shellLayout: 'stacked',
      contentAlignment: 'full',
      stackGap: 'spacious',
    })
    const root = wrapper.find('.stacked-layout')

    expect(root.classes()).toContain('stacked-layout--stacked')
    expect(root.classes()).toContain('stacked-layout--content-full')
    expect(root.attributes('style')).toContain('--block-gap: 3rem')
  })

  it('legacy shellLayout centered works independently of contentAlignment', () => {
    const wrapper = mountStacked({ shellLayout: 'centered' })
    const root = wrapper.find('.stacked-layout')

    expect(root.classes()).toContain('stacked-layout--centered')
    expect(root.classes()).not.toContain('stacked-layout--content-center')
    expect(root.classes()).not.toContain('stacked-layout--content-left')
  })

  it('renders slot content inside stacked-layout__body', () => {
    const wrapper = mount(StackedSectionLayout, {
      props: {
        section: { id: 'sec-1', sectionType: 'stacked' },
        layoutConfig: {},
        blocksByRole: { _default: [] },
      },
      slots: {
        default: '<div class="test-block">block</div>',
      },
    })

    expect(wrapper.find('.stacked-layout__body').exists()).toBe(true)
    expect(wrapper.find('.test-block').exists()).toBe(true)
  })
})
