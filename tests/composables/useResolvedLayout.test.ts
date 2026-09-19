import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { useResolvedLayout } from '~/shared/composables/useResolvedLayout'

describe('useResolvedLayout', () => {
  it('returns a fully-populated layout from theme + page meta', () => {
    const themeManifest = {
      layout: {
        layouts: [
          { id: 'default', label: { 'en-US': 'X' }, allowedBlocks: [] },
        ],
      },
    }
    const page = { layout: 'default', meta: {} }
    const resolved = useResolvedLayout(themeManifest, page).value
    expect(resolved.id).toBe('default')
    expect(resolved.chrome.elements).toEqual([])
  })

  it('applies meta.layoutOverrides', () => {
    const themeManifest = {
      layout: {
        layouts: [
          {
            id: 'default',
            label: { 'en-US': 'X' },
            allowedBlocks: [],
            chrome: {
              elements: [
                { id: 'l', type: 'line', enabled: true, position: 'fixed', anchor: 'top-left', orientation: 'vertical', color: '#000', thickness: '1px', length: '10px', offsetX: '0', offsetY: '0', zIndex: 1 },
              ],
            },
          },
        ],
      },
    }
    const page = { layout: 'default', meta: { layoutOverrides: { chrome: { l: { color: '#ff0000' } } } } }
    const resolved = useResolvedLayout(themeManifest, page).value
    const elem = resolved.chrome.elements[0] as any
    expect(elem.color).toBe('#ff0000')
  })

  it('falls back to first layout when page.layout is missing', () => {
    const themeManifest = {
      layout: { layouts: [{ id: 'fallback', label: { 'en-US': 'F' }, allowedBlocks: [] }] },
    }
    const resolved = useResolvedLayout(themeManifest, { layout: 'unknown', meta: {} }).value
    expect(resolved.id).toBe('fallback')
  })

  it('reacts when page meta override changes (ref input)', async () => {
    const themeManifest = {
      layout: {
        layouts: [
          {
            id: 'd',
            label: { 'en-US': 'D' },
            allowedBlocks: [],
            chrome: {
              elements: [
                { id: 'l', type: 'line', enabled: true, position: 'fixed', anchor: 'top-left', orientation: 'vertical', color: '#000', thickness: '1px', length: '10px', offsetX: '0', offsetY: '0', zIndex: 1 },
              ],
            },
          },
        ],
      },
    }
    const page = ref({ layout: 'd', meta: { layoutOverrides: { chrome: { l: { color: '#000' } } } } })
    const resolved = useResolvedLayout(themeManifest, page)
    expect((resolved.value.chrome.elements[0] as any).color).toBe('#000')
    page.value = { ...page.value, meta: { layoutOverrides: { chrome: { l: { color: '#ff0000' } } } } }
    expect((resolved.value.chrome.elements[0] as any).color).toBe('#ff0000')
  })
})
