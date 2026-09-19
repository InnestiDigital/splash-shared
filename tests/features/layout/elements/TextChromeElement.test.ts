/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi } from 'vitest'
import { computed } from 'vue'
import { mount } from '@vue/test-utils'

// Stub the typography composable so the test does not pull in Nuxt's
// useState / useClientConfig (which are unavailable in unit tests).
vi.mock('~/shared/composables/useTypographySlotStyle', () => ({
  useTypographySlotStyle: () => computed(() => ({})),
}))

import TextChromeElement from '~/shared/features/layout/elements/TextChromeElement.vue'

describe('TextChromeElement', () => {
  it('renders the given text', () => {
    const w = mount(TextChromeElement, {
      props: {
        element: {
          id: 't1',
          type: 'text',
          text: 'Hello',
          enabled: true,
          position: 'absolute',
          anchor: 'top-left',
          offsetX: '0',
          offsetY: '0',
          zIndex: 1,
        },
      },
    })
    const el = w.find('[data-chrome-element="text"]').element as HTMLElement
    expect(el.textContent?.trim()).toBe('Hello')
  })

  it('applies color when provided', () => {
    const w = mount(TextChromeElement, {
      props: {
        element: {
          id: 't1',
          type: 'text',
          text: 'X',
          enabled: true,
          position: 'absolute',
          anchor: 'top-left',
          offsetX: '0',
          offsetY: '0',
          zIndex: 1,
          color: '#ff0000',
        },
      },
    })
    const el = w.find('[data-chrome-element="text"]').element as HTMLElement
    // happy-dom keeps hex; jsdom would normalize to rgb()
    expect(el.style.color.toLowerCase()).toMatch(/^(#ff0000|rgb\(255, 0, 0\))$/)
  })
})
