/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed, ref } from 'vue'

// Stub Nuxt auto-imports
vi.stubGlobal('computed', computed)

import EditorialSplitSectionLayout from '~/shared/features/cms/section-layouts/EditorialSplitSectionLayout.vue'

// Minimal props factory
function mountEditorialSplit(
  layoutConfig: Record<string, any> = {},
  opts: {
    sectionId?: string
    editorialSplitIndexMap?: Record<string, number>
  } = {},
) {
  const sectionId = opts.sectionId ?? 'sec-1'
  const indexMap = opts.editorialSplitIndexMap ?? {}

  return mount(EditorialSplitSectionLayout, {
    props: {
      section: { id: sectionId, sectionType: 'editorial-split' },
      layoutConfig,
      blocksByRole: { _default: [] },
    },
    global: {
      provide: {
        editorialSplitIndexMap: computed(() => indexMap),
      },
    },
  })
}

describe('EditorialSplitSectionLayout', () => {
  // --- shellSide class tests ---

  it('defaults to editorial-split--side-right when no shellSide set', () => {
    const wrapper = mountEditorialSplit({})
    const root = wrapper.find('.editorial-split')

    expect(root.classes()).toContain('editorial-split--side-right')
    expect(root.classes()).not.toContain('editorial-split--side-left')
  })

  it('applies editorial-split--side-right for explicit right', () => {
    const wrapper = mountEditorialSplit({ shellSide: 'right' })
    const root = wrapper.find('.editorial-split')

    expect(root.classes()).toContain('editorial-split--side-right')
  })

  it('applies editorial-split--side-left for explicit left', () => {
    const wrapper = mountEditorialSplit({ shellSide: 'left' })
    const root = wrapper.find('.editorial-split')

    expect(root.classes()).toContain('editorial-split--side-left')
    expect(root.classes()).not.toContain('editorial-split--side-right')
  })

  // --- alternate mode tests ---

  it('applies editorial-split--side-right for alternate at even index (0)', () => {
    const wrapper = mountEditorialSplit(
      { shellSide: 'alternate' },
      { sectionId: 'sec-a', editorialSplitIndexMap: { 'sec-a': 0 } },
    )
    const root = wrapper.find('.editorial-split')

    expect(root.classes()).toContain('editorial-split--side-right')
    expect(root.classes()).not.toContain('editorial-split--side-left')
  })

  it('applies editorial-split--side-left for alternate at odd index (1)', () => {
    const wrapper = mountEditorialSplit(
      { shellSide: 'alternate' },
      { sectionId: 'sec-b', editorialSplitIndexMap: { 'sec-a': 0, 'sec-b': 1 } },
    )
    const root = wrapper.find('.editorial-split')

    expect(root.classes()).toContain('editorial-split--side-left')
    expect(root.classes()).not.toContain('editorial-split--side-right')
  })

  it('applies editorial-split--side-right for alternate at even index (2)', () => {
    const wrapper = mountEditorialSplit(
      { shellSide: 'alternate' },
      { sectionId: 'sec-c', editorialSplitIndexMap: { 'sec-a': 0, 'sec-b': 1, 'sec-c': 2 } },
    )
    const root = wrapper.find('.editorial-split')

    expect(root.classes()).toContain('editorial-split--side-right')
  })

  it('applies editorial-split--side-left for alternate at odd index (3)', () => {
    const wrapper = mountEditorialSplit(
      { shellSide: 'alternate' },
      { sectionId: 'sec-d', editorialSplitIndexMap: { 'sec-a': 0, 'sec-b': 1, 'sec-c': 2, 'sec-d': 3 } },
    )
    const root = wrapper.find('.editorial-split')

    expect(root.classes()).toContain('editorial-split--side-left')
  })

  it('falls back to right (index 0) when alternate but section not in index map', () => {
    const wrapper = mountEditorialSplit(
      { shellSide: 'alternate' },
      { sectionId: 'unknown-section', editorialSplitIndexMap: {} },
    )
    const root = wrapper.find('.editorial-split')

    // Missing section defaults to index 0 → right
    expect(root.classes()).toContain('editorial-split--side-right')
  })

  it('falls back to right when alternate and no index map provided', () => {
    // Mount without providing editorialSplitIndexMap at all
    const wrapper = mount(EditorialSplitSectionLayout, {
      props: {
        section: { id: 'sec-1', sectionType: 'editorial-split' },
        layoutConfig: { shellSide: 'alternate' },
        blocksByRole: { _default: [] },
      },
    })
    const root = wrapper.find('.editorial-split')

    expect(root.classes()).toContain('editorial-split--side-right')
  })

  // --- contentWidthRatio class tests ---

  it('defaults to editorial-split--ratio-wide-left when no ratio set', () => {
    const wrapper = mountEditorialSplit({})
    const root = wrapper.find('.editorial-split')

    expect(root.classes()).toContain('editorial-split--ratio-wide-left')
  })

  it('applies editorial-split--ratio-equal for equal ratio', () => {
    const wrapper = mountEditorialSplit({ contentWidthRatio: 'equal' })
    const root = wrapper.find('.editorial-split')

    expect(root.classes()).toContain('editorial-split--ratio-equal')
  })

  it('applies editorial-split--ratio-wide-right for wide-right ratio', () => {
    const wrapper = mountEditorialSplit({ contentWidthRatio: 'wide-right' })
    const root = wrapper.find('.editorial-split')

    expect(root.classes()).toContain('editorial-split--ratio-wide-right')
  })

  it('applies editorial-split--ratio-sidebar-left for sidebar-left ratio', () => {
    const wrapper = mountEditorialSplit({ contentWidthRatio: 'sidebar-left' })
    const root = wrapper.find('.editorial-split')

    expect(root.classes()).toContain('editorial-split--ratio-sidebar-left')
  })

  it('applies editorial-split--ratio-sidebar-right for sidebar-right ratio', () => {
    const wrapper = mountEditorialSplit({ contentWidthRatio: 'sidebar-right' })
    const root = wrapper.find('.editorial-split')

    expect(root.classes()).toContain('editorial-split--ratio-sidebar-right')
  })

  it('applies editorial-split--ratio-narrow-left for narrow-left ratio', () => {
    const wrapper = mountEditorialSplit({ contentWidthRatio: 'narrow-left' })
    const root = wrapper.find('.editorial-split')

    expect(root.classes()).toContain('editorial-split--ratio-narrow-left')
  })

  // --- contentSurface class tests ---

  it('applies editorial-split--surface-outlined when contentSurface is outlined', () => {
    const wrapper = mountEditorialSplit({ contentSurface: 'outlined' })
    const root = wrapper.find('.editorial-split')

    expect(root.classes()).toContain('editorial-split--surface-outlined')
  })

  it('does not apply editorial-split--surface-outlined when contentSurface is none', () => {
    const wrapper = mountEditorialSplit({ contentSurface: 'none' })
    const root = wrapper.find('.editorial-split')

    expect(root.classes()).not.toContain('editorial-split--surface-outlined')
  })

  it('does not apply editorial-split--surface-outlined when contentSurface is not set', () => {
    const wrapper = mountEditorialSplit({})
    const root = wrapper.find('.editorial-split')

    expect(root.classes()).not.toContain('editorial-split--surface-outlined')
  })

  // --- stackGap style tests ---

  it('applies default block gap when none specified', () => {
    const wrapper = mountEditorialSplit({})
    const root = wrapper.find('.editorial-split')

    expect(root.attributes('style')).toContain('--block-gap: 1.5rem')
  })

  it('applies none block gap (0)', () => {
    const wrapper = mountEditorialSplit({ stackGap: 'none' })
    const root = wrapper.find('.editorial-split')

    expect(root.attributes('style')).toContain('--block-gap: 0')
  })

  it('applies tight block gap', () => {
    const wrapper = mountEditorialSplit({ stackGap: 'tight' })
    const root = wrapper.find('.editorial-split')

    expect(root.attributes('style')).toContain('--block-gap: 0.5rem')
  })

  it('applies spacious block gap', () => {
    const wrapper = mountEditorialSplit({ stackGap: 'spacious' })
    const root = wrapper.find('.editorial-split')

    expect(root.attributes('style')).toContain('--block-gap: 3rem')
  })

  // --- separator tests ---

  it('adds editorial-split--show-separator modifier class when showSeparators is true', () => {
    const wrapper = mountEditorialSplit({ showSeparators: true })
    const root = wrapper.find('.editorial-split')

    expect(root.classes()).toContain('editorial-split--show-separator')
    expect(wrapper.find('hr').exists()).toBe(false)
  })

  it('does not add editorial-split--show-separator modifier class when showSeparators is false', () => {
    const wrapper = mountEditorialSplit({ showSeparators: false })
    const root = wrapper.find('.editorial-split')

    expect(root.classes()).not.toContain('editorial-split--show-separator')
  })

  it('does not add editorial-split--show-separator when showSeparators is not set', () => {
    const wrapper = mountEditorialSplit({})
    const root = wrapper.find('.editorial-split')

    expect(root.classes()).not.toContain('editorial-split--show-separator')
  })

  // --- combination tests ---

  it('combines alternate side with ratio and gap', () => {
    const wrapper = mountEditorialSplit(
      { shellSide: 'alternate', contentWidthRatio: 'equal', stackGap: 'spacious' },
      { sectionId: 'sec-b', editorialSplitIndexMap: { 'sec-a': 0, 'sec-b': 1 } },
    )
    const root = wrapper.find('.editorial-split')

    expect(root.classes()).toContain('editorial-split--side-left') // odd index
    expect(root.classes()).toContain('editorial-split--ratio-equal')
    expect(root.attributes('style')).toContain('--block-gap: 3rem')
  })

  it('explicit left/right ignores index map', () => {
    const wrapper = mountEditorialSplit(
      { shellSide: 'left' },
      { sectionId: 'sec-a', editorialSplitIndexMap: { 'sec-a': 0 } },
    )
    const root = wrapper.find('.editorial-split')

    // Even though index 0 would give right, explicit left wins
    expect(root.classes()).toContain('editorial-split--side-left')
    expect(root.classes()).not.toContain('editorial-split--side-right')
  })

  // --- chromeAlign class tests ---

  it('defaults to editorial-split--chrome-sticky-top when no chromeAlign set', () => {
    const wrapper = mountEditorialSplit({})
    const root = wrapper.find('.editorial-split')

    expect(root.classes()).toContain('editorial-split--chrome-sticky-top')
  })

  it('applies editorial-split--chrome-sticky-top for explicit sticky-top', () => {
    const wrapper = mountEditorialSplit({ chromeAlign: 'sticky-top' })
    const root = wrapper.find('.editorial-split')

    expect(root.classes()).toContain('editorial-split--chrome-sticky-top')
  })

  it('applies editorial-split--chrome-center for center alignment', () => {
    const wrapper = mountEditorialSplit({ chromeAlign: 'center' })
    const root = wrapper.find('.editorial-split')

    expect(root.classes()).toContain('editorial-split--chrome-center')
    expect(root.classes()).not.toContain('editorial-split--chrome-sticky-top')
  })

  it('applies editorial-split--chrome-top for top alignment', () => {
    const wrapper = mountEditorialSplit({ chromeAlign: 'top' })
    const root = wrapper.find('.editorial-split')

    expect(root.classes()).toContain('editorial-split--chrome-top')
  })

  it('applies editorial-split--chrome-bottom for bottom alignment', () => {
    const wrapper = mountEditorialSplit({ chromeAlign: 'bottom' })
    const root = wrapper.find('.editorial-split')

    expect(root.classes()).toContain('editorial-split--chrome-bottom')
  })

  it('combines chromeAlign with other layout settings', () => {
    const wrapper = mountEditorialSplit({
      chromeAlign: 'center',
      shellSide: 'left',
      contentWidthRatio: 'equal',
      stackGap: 'tight',
    })
    const root = wrapper.find('.editorial-split')

    expect(root.classes()).toContain('editorial-split--chrome-center')
    expect(root.classes()).toContain('editorial-split--side-left')
    expect(root.classes()).toContain('editorial-split--ratio-equal')
    expect(root.attributes('style')).toContain('--block-gap: 0.5rem')
  })
})
