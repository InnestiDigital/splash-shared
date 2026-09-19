/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, it, expect, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { computed, ref, type Ref } from 'vue'
import { VIEWPORT_OVERRIDE } from '~/shared/composables/useViewport'

// Stub Nuxt auto-imports
vi.stubGlobal('computed', computed)

import GallerySectionLayout from '~/shared/features/cms/section-layouts/GallerySectionLayout.vue'

function makeBlock(id: string, type = 'rich-text') {
  return {
    component: 'div',
    props: { 'data-block-id': id },
    block: { id, type },
  }
}

function mountGallery(
  blocksByRole: Record<string, any[]> = { _default: [] },
  layoutConfig: Record<string, any> = {},
  viewport: Ref<number> = ref(1280),
) {
  return mount(GallerySectionLayout, {
    props: {
      section: { id: 'sec-1', sectionType: 'gallery' },
      layoutConfig,
      blocksByRole,
    },
    global: {
      provide: {
        [VIEWPORT_OVERRIDE as symbol]: viewport,
      },
    },
  })
}

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    value(options: ScrollToOptions) {
      this.scrollLeft = Number(options.left ?? 0)
      this.dispatchEvent(new Event('scroll'))
    },
  })
})

describe('GallerySectionLayout — editorial-body rendering', () => {
  it('renders a single editorial-body block inside .gallery-layout__intro', () => {
    const wrapper = mountGallery({
      'editorial-body': [makeBlock('body-1')],
      _default: [],
    })

    const intro = wrapper.find('.gallery-layout__intro')
    expect(intro.exists()).toBe(true)
    expect(intro.findAll('[data-block-id]')).toHaveLength(1)
    expect(intro.find('[data-block-id="body-1"]').exists()).toBe(true)
  })

  it('renders all editorial-body blocks when multiple assigned (SPL-079)', () => {
    const wrapper = mountGallery({
      'editorial-body': [makeBlock('body-1'), makeBlock('body-2'), makeBlock('body-3')],
      _default: [],
    })

    const intro = wrapper.find('.gallery-layout__intro')
    expect(intro.exists()).toBe(true)
    const rendered = intro.findAll('[data-block-id]')
    expect(rendered).toHaveLength(3)
    expect(intro.find('[data-block-id="body-1"]').exists()).toBe(true)
    expect(intro.find('[data-block-id="body-2"]').exists()).toBe(true)
    expect(intro.find('[data-block-id="body-3"]').exists()).toBe(true)
  })

  it('omits .gallery-layout__intro when no editorial-body blocks', () => {
    const wrapper = mountGallery({ _default: [] })
    expect(wrapper.find('.gallery-layout__intro').exists()).toBe(false)
  })
})

describe('GallerySectionLayout — section-cta rendering', () => {
  it('renders a single section-cta block inside .gallery-layout__cta', () => {
    const wrapper = mountGallery({
      'section-cta': [makeBlock('cta-1', 'cta-section')],
      _default: [],
    })

    const cta = wrapper.find('.gallery-layout__cta')
    expect(cta.exists()).toBe(true)
    expect(cta.findAll('[data-block-id]')).toHaveLength(1)
    expect(cta.find('[data-block-id="cta-1"]').exists()).toBe(true)
  })

  it('renders all section-cta blocks when multiple assigned (SPL-079)', () => {
    const wrapper = mountGallery({
      'section-cta': [
        makeBlock('cta-1', 'cta-section'),
        makeBlock('cta-2', 'cta-section'),
      ],
      _default: [],
    })

    const cta = wrapper.find('.gallery-layout__cta')
    expect(cta.exists()).toBe(true)
    const rendered = cta.findAll('[data-block-id]')
    expect(rendered).toHaveLength(2)
    expect(cta.find('[data-block-id="cta-1"]').exists()).toBe(true)
    expect(cta.find('[data-block-id="cta-2"]').exists()).toBe(true)
  })

  it('omits .gallery-layout__cta when no section-cta blocks', () => {
    const wrapper = mountGallery({ _default: [] })
    expect(wrapper.find('.gallery-layout__cta').exists()).toBe(false)
  })
})

describe('GallerySectionLayout — section-heading remains single-slot (spec rule 6)', () => {
  it('renders only the first section-heading block even when multiple assigned', () => {
    const wrapper = mountGallery({
      'section-heading': [makeBlock('h-1', 'page-header'), makeBlock('h-2', 'page-header')],
      _default: [],
    })

    const heading = wrapper.find('.gallery-layout__heading')
    expect(heading.exists()).toBe(true)
    expect(heading.findAll('[data-block-id]')).toHaveLength(1)
    expect(heading.find('[data-block-id="h-1"]').exists()).toBe(true)
    expect(heading.find('[data-block-id="h-2"]').exists()).toBe(false)
  })
})

describe('GallerySectionLayout — carousel consistency', () => {
  it('accounts for inter-item gaps while fitting the configured items per page', () => {
    const wrapper = mountGallery({
      'media-gallery': [makeBlock('m-1'), makeBlock('m-2'), makeBlock('m-3')],
      _default: [],
    }, { layout: 'carousel', carouselColumns: '3', gap: 'normal' })

    const style = wrapper.find('.gallery-layout__carousel-item').attributes('style')
    expect(style).toContain('calc(33.333333% - 1rem)')
  })

  it('hides navigation when all items fit on one page', () => {
    const wrapper = mountGallery({
      'media-gallery': [makeBlock('m-1'), makeBlock('m-2')],
      _default: [],
    }, { layout: 'carousel', carouselColumns: '3', showArrows: true })

    expect(wrapper.find('.gallery-layout__carousel-nav').exists()).toBe(false)
    expect(wrapper.find('.gallery-layout__carousel-pagination').exists()).toBe(false)
  })

  it('updates navigation state and exposes pagination as navigation, not tabs', async () => {
    const wrapper = mountGallery({
      'media-gallery': [makeBlock('m-1'), makeBlock('m-2'), makeBlock('m-3'), makeBlock('m-4')],
      _default: [],
    }, { layout: 'carousel', carouselColumns: '2', showArrows: true, showDots: true })
    await flushPromises()
    const items = wrapper.findAll('.gallery-layout__carousel-item')
    items.forEach((item, index) => {
      Object.defineProperty(item.element, 'offsetLeft', { configurable: true, value: index * 120 })
    })

    await wrapper.find('.gallery-layout__carousel-nav--next').trigger('click')

    expect(wrapper.find('.gallery-layout__carousel-nav--next').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.gallery-layout__carousel-pagination').attributes('role')).toBe('navigation')
    const secondDot = wrapper.findAll('.gallery-layout__carousel-pagination-dot')[1]
    expect(secondDot).toBeDefined()
    expect(secondDot!.attributes('aria-current')).toBe('page')
  })

  it('recomputes item count from the shared reactive viewport source', async () => {
    const viewport = ref(1280)
    const wrapper = mountGallery({
      'media-gallery': [makeBlock('m-1'), makeBlock('m-2'), makeBlock('m-3')],
      _default: [],
    }, { layout: 'carousel', carouselColumns: '3' }, viewport)

    expect(wrapper.find('.gallery-layout__carousel-item').attributes('style')).toContain('33.333333%')
    viewport.value = 600
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.gallery-layout__carousel-item').attributes('style')).toContain('flex-basis: 100%')
  })
})
