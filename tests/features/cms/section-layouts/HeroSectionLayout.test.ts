/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed } from 'vue'

// Stub Nuxt auto-imports
vi.stubGlobal('computed', computed)

import HeroSectionLayout from '~/shared/features/cms/section-layouts/HeroSectionLayout.vue'

// Minimal props factory
function mountHero(layoutConfig: Record<string, any> = {}) {
  return mount(HeroSectionLayout, {
    props: {
      section: { id: 'sec-1', type: 'hero' },
      layoutConfig,
      blocksByRole: { _default: [] },
    },
  })
}

describe('HeroSectionLayout', () => {
  // --- Height class tests ---

  it('defaults to hero-layout--height-viewport when no height set', () => {
    const wrapper = mountHero({})
    const root = wrapper.find('.hero-layout')

    expect(root.classes()).toContain('hero-layout--height-viewport')
  })

  it('applies hero-layout--height-viewport for explicit viewport height', () => {
    const wrapper = mountHero({ height: 'viewport' })
    const root = wrapper.find('.hero-layout')

    expect(root.classes()).toContain('hero-layout--height-viewport')
  })

  it('applies hero-layout--height-large for large height', () => {
    const wrapper = mountHero({ height: 'large' })
    const root = wrapper.find('.hero-layout')

    expect(root.classes()).toContain('hero-layout--height-large')
    expect(root.classes()).not.toContain('hero-layout--height-viewport')
  })

  it('applies hero-layout--height-medium for medium height', () => {
    const wrapper = mountHero({ height: 'medium' })
    const root = wrapper.find('.hero-layout')

    expect(root.classes()).toContain('hero-layout--height-medium')
    expect(root.classes()).not.toContain('hero-layout--height-viewport')
  })

  it('applies hero-layout--height-auto for auto height', () => {
    const wrapper = mountHero({ height: 'auto' })
    const root = wrapper.find('.hero-layout')

    expect(root.classes()).toContain('hero-layout--height-auto')
    expect(root.classes()).not.toContain('hero-layout--height-viewport')
  })

  // --- Content alignment class tests (SPL-021) ---

  it('defaults to hero-layout--align-center when no contentAlign set', () => {
    const wrapper = mountHero({})
    const root = wrapper.find('.hero-layout')

    expect(root.classes()).toContain('hero-layout--align-center')
  })

  it('applies hero-layout--align-center for explicit center', () => {
    const wrapper = mountHero({ contentAlign: 'center' })
    const root = wrapper.find('.hero-layout')

    expect(root.classes()).toContain('hero-layout--align-center')
  })

  it('applies hero-layout--align-bottom-left for bottom-left', () => {
    const wrapper = mountHero({ contentAlign: 'bottom-left' })
    const root = wrapper.find('.hero-layout')

    expect(root.classes()).toContain('hero-layout--align-bottom-left')
    expect(root.classes()).not.toContain('hero-layout--align-center')
  })

  it('applies hero-layout--align-bottom-center for bottom-center', () => {
    const wrapper = mountHero({ contentAlign: 'bottom-center' })
    const root = wrapper.find('.hero-layout')

    expect(root.classes()).toContain('hero-layout--align-bottom-center')
    expect(root.classes()).not.toContain('hero-layout--align-center')
  })

  it('applies hero-layout--align-bottom-right for bottom-right', () => {
    const wrapper = mountHero({ contentAlign: 'bottom-right' })
    const root = wrapper.find('.hero-layout')

    expect(root.classes()).toContain('hero-layout--align-bottom-right')
    expect(root.classes()).not.toContain('hero-layout--align-center')
  })

  it('applies hero-layout--align-top-left for top-left', () => {
    const wrapper = mountHero({ contentAlign: 'top-left' })
    const root = wrapper.find('.hero-layout')

    expect(root.classes()).toContain('hero-layout--align-top-left')
    expect(root.classes()).not.toContain('hero-layout--align-center')
  })

  it('applies hero-layout--align-top-center for top-center', () => {
    const wrapper = mountHero({ contentAlign: 'top-center' })
    const root = wrapper.find('.hero-layout')

    expect(root.classes()).toContain('hero-layout--align-top-center')
    expect(root.classes()).not.toContain('hero-layout--align-center')
  })

  it('applies hero-layout--align-top-right for top-right', () => {
    const wrapper = mountHero({ contentAlign: 'top-right' })
    const root = wrapper.find('.hero-layout')

    expect(root.classes()).toContain('hero-layout--align-top-right')
    expect(root.classes()).not.toContain('hero-layout--align-center')
  })

  it('combines alignment with height classes', () => {
    const wrapper = mountHero({
      contentAlign: 'bottom-left',
      height: 'large',
    })
    const root = wrapper.find('.hero-layout')

    expect(root.classes()).toContain('hero-layout--align-bottom-left')
    expect(root.classes()).toContain('hero-layout--height-large')
  })

  // --- Block role rendering tests (SPL-034) ---

  it('renders media-gallery block in hero-layout__media slot', () => {
    const mockBlock = {
      component: 'div',
      props: { id: 'test-media' },
      block: { id: 'block-1', type: 'image-banner' }
    }

    const wrapper = mount(HeroSectionLayout, {
      props: {
        section: { id: 'sec-1', type: 'hero' },
        layoutConfig: {},
        blocksByRole: {
          'media-gallery': [mockBlock],
          _default: []
        },
      },
    })

    const mediaSlot = wrapper.find('.hero-layout__media')
    expect(mediaSlot.exists()).toBe(true)
  })

  it('does not render hero-layout__media when no media-gallery blocks', () => {
    const wrapper = mountHero({ blocksByRole: { _default: [] } })
    const mediaSlot = wrapper.find('.hero-layout__media')
    expect(mediaSlot.exists()).toBe(false)
  })

  it('renders section-heading block in hero-layout__heading slot', () => {
    const mockBlock = {
      component: 'div',
      props: { id: 'test-heading' },
      block: { id: 'block-1', type: 'page-header' }
    }

    const wrapper = mount(HeroSectionLayout, {
      props: {
        section: { id: 'sec-1', type: 'hero' },
        layoutConfig: {},
        blocksByRole: {
          'section-heading': [mockBlock],
          _default: []
        },
      },
    })

    const headingSlot = wrapper.find('.hero-layout__heading')
    expect(headingSlot.exists()).toBe(true)
  })

  // --- mediaPosition → CSS custom property bridge (SPL-077) ---

  it('sets --hero-media-position on hero-layout__media from layoutConfig.mediaPosition', () => {
    const mockBlock = {
      component: 'div',
      props: { id: 'test-media' },
      block: { id: 'block-1', type: 'hero-block' }
    }

    const wrapper = mount(HeroSectionLayout, {
      props: {
        section: { id: 'sec-1', type: 'hero' },
        layoutConfig: { mediaPosition: 'top' },
        blocksByRole: {
          'media-gallery': [mockBlock],
          _default: []
        },
      },
    })

    const mediaSlot = wrapper.find('.hero-layout__media')
    const style = mediaSlot.attributes('style') || ''
    // heroMediaPositionCss maps the 'top' token to the CSS position value
    // 'center top' (see shared/features/cms/section-layouts/heroMediaPosition.ts).
    expect(style).toContain('--hero-media-position: center top')
  })

  it('sets --hero-media-position to "bottom" when layoutConfig.mediaPosition is "bottom"', () => {
    const mockBlock = {
      component: 'div',
      props: {},
      block: { id: 'block-1', type: 'hero-block' }
    }

    const wrapper = mount(HeroSectionLayout, {
      props: {
        section: { id: 'sec-1', type: 'hero' },
        layoutConfig: { mediaPosition: 'bottom' },
        blocksByRole: { 'media-gallery': [mockBlock], _default: [] },
      },
    })

    const style = wrapper.find('.hero-layout__media').attributes('style') || ''
    // 'bottom' token maps to CSS position value 'center bottom'.
    expect(style).toContain('--hero-media-position: center bottom')
  })

  it('defaults --hero-media-position to "center" when layoutConfig.mediaPosition is unset', () => {
    const mockBlock = {
      component: 'div',
      props: {},
      block: { id: 'block-1', type: 'hero-block' }
    }

    const wrapper = mount(HeroSectionLayout, {
      props: {
        section: { id: 'sec-1', type: 'hero' },
        layoutConfig: {},
        blocksByRole: { 'media-gallery': [mockBlock], _default: [] },
      },
    })

    const style = wrapper.find('.hero-layout__media').attributes('style') || ''
    expect(style).toContain('--hero-media-position: center')
  })

})
