// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import { PREVIEW_INTERACTION_KEY } from '~/shared/features/cms/previewInteraction'

const mocks = vi.hoisted(() => ({
  mode: 'public-render' as 'public-render' | 'editor-preview',
  notifyPlacement: vi.fn(),
}))

vi.mock('~/shared/features/cms-preview/use-render-mode', () => ({
  useRenderMode: () => ({ get value() { return mocks.mode } }),
}))

vi.mock('~/shared/composables/useCmsPreview', () => ({
  useCmsPreview: () => ({ notifyCanvasBlockPlacementPatch: mocks.notifyPlacement }),
}))

import CanvasSectionLayout from '~/shared/features/cms/section-layouts/CanvasSectionLayout.vue'

function resolvedBlock(id: string, position: number, canvas?: Record<string, unknown>) {
  return {
    block: {
      id,
      position,
      placement: canvas ? { canvas } : undefined,
    },
    component: 'div',
    props: { class: `primitive-${id}` },
  }
}

function mountLayout(blocks: ReturnType<typeof resolvedBlock>[], selectedId = ref<string | null>(null)) {
  return mount(CanvasSectionLayout, {
    props: {
      section: { id: 'section-1' },
      layoutConfig: {},
      blocksByRole: { _default: blocks },
    },
    global: {
      provide: {
        [PREVIEW_INTERACTION_KEY as symbol]: {
          selectedId,
          onRegionClick: vi.fn(),
        },
      },
    },
  })
}

describe('CanvasSectionLayout', () => {
  beforeEach(() => {
    mocks.mode = 'public-render'
    mocks.notifyPlacement.mockReset()
  })

  it('renders top-level blocks as stable absolute layers when geometry is missing', () => {
    const wrapper = mountLayout([
      resolvedBlock('first', 0),
      resolvedBlock('second', 1),
    ])

    const layers = wrapper.findAll('.block-placement--canvas-layer')
    expect(layers).toHaveLength(2)
    expect(layers[0].attributes('style')).toContain('width: 60%')
    expect(layers[1].attributes('style')).toContain('width: 60%')
    expect(layers[0].attributes('style')).not.toBe(layers[1].attributes('style'))
  })

  it('maps persisted geometry while deriving stacking from block order', () => {
    const wrapper = mountLayout([
      resolvedBlock('first', 0, {
        x: 20, y: 30, width: 40, height: 50, rotation: 10, zIndex: 7, locked: false,
      }),
    ])

    const style = wrapper.get('[data-canvas-block-id="first"]').attributes('style')
    expect(style).toContain('width: 40%')
    expect(style).toContain('height: 50%')
    expect(style).toContain('translate(0%, 10%) rotate(10deg)')
    expect(style).toContain('z-index: 1')
  })

  it('persists the complete normalized geometry after an editor drag', () => {
    mocks.mode = 'editor-preview'
    const wrapper = mountLayout([
      resolvedBlock('first', 0, {
        x: 20, y: 30, width: 40, height: 50, rotation: 10, zIndex: 7, locked: false,
      }),
    ])
    const host = wrapper.get('[data-canvas-layer-host]').element as HTMLElement
    Object.defineProperty(host, 'getBoundingClientRect', {
      value: () => ({ width: 500, height: 500, left: 0, top: 0, right: 500, bottom: 500 }),
    })
    const layer = wrapper.get('[data-canvas-block-id="first"]').element

    layer.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, pointerId: 1, clientX: 100, clientY: 100,
    }))
    window.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true, pointerId: 1, clientX: 150, clientY: 150,
    }))
    window.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true, pointerId: 1, clientX: 150, clientY: 150,
    }))

    expect(mocks.notifyPlacement).toHaveBeenCalledTimes(1)
    expect(mocks.notifyPlacement).toHaveBeenCalledWith('first', {
      x: 30,
      y: 40,
      width: 40,
      height: 50,
      rotation: 10,
      zIndex: 1,
      locked: false,
    })
  })

  it('syncs handles to NavigationTree selection and clears them on non-layer selection', async () => {
    mocks.mode = 'editor-preview'
    const selectedId = ref<string | null>('second')
    const wrapper = mountLayout([
      resolvedBlock('first', 0),
      resolvedBlock('second', 1),
    ], selectedId)

    expect(wrapper.get('[data-canvas-block-id="second"]').classes()).toContain('is-selected')
    expect(wrapper.get('[data-canvas-block-id="second"]').findAll('.canvas-layer-handle')).toHaveLength(5)

    selectedId.value = 'first'
    await nextTick()
    expect(wrapper.get('[data-canvas-block-id="first"]').classes()).toContain('is-selected')
    expect(wrapper.get('[data-canvas-block-id="second"]').classes()).not.toContain('is-selected')

    selectedId.value = 'section-1'
    await nextTick()
    expect(wrapper.findAll('.canvas-layer-handle')).toHaveLength(0)
  })
})
