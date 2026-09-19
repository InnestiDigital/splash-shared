// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PlacementWrapper from '~/shared/features/cms/placement/PlacementWrapper.vue'

describe('PlacementWrapper', () => {
  it('renders block-placement div with no classes/vars when placement is undefined', () => {
    const wrapper = mount(PlacementWrapper, {
      slots: { default: '<div class="test-block">content</div>' },
    })
    const placement = wrapper.find('.block-placement')
    expect(placement.exists()).toBe(true)
    expect(placement.classes()).toEqual(['block-placement'])
    expect(placement.attributes('style')).toBeUndefined()
  })

  it('does not render block-frame when placement is undefined', () => {
    const wrapper = mount(PlacementWrapper, {
      slots: { default: '<div>content</div>' },
    })
    expect(wrapper.find('.block-frame').exists()).toBe(false)
  })

  it('does not render block-frame when wrapperStyle is none', () => {
    const wrapper = mount(PlacementWrapper, {
      props: { placement: { wrapperStyle: 'none' } },
      slots: { default: '<div>content</div>' },
    })
    expect(wrapper.find('.block-frame').exists()).toBe(false)
  })

  it('renders block-frame when wrapperStyle is card', () => {
    const wrapper = mount(PlacementWrapper, {
      props: { placement: { wrapperStyle: 'card' } },
      slots: { default: '<div>content</div>' },
    })
    const frame = wrapper.find('.block-frame')
    expect(frame.exists()).toBe(true)
    expect(frame.classes()).toContain('block-frame--card')
  })

  it('slot content renders inside placement div', () => {
    const wrapper = mount(PlacementWrapper, {
      slots: { default: '<div class="test-block">content</div>' },
    })
    expect(wrapper.find('.block-placement .test-block').exists()).toBe(true)
  })
})
