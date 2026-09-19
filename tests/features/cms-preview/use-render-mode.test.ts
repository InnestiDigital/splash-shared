import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'

describe('useRenderMode', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns public-render when preview is not ready (editor not connected)', async () => {
    vi.doMock('~/shared/composables/useCmsPreview', () => ({
      useCmsPreview: () => ({ isPreviewReady: ref(false) }),
    }))
    const { useRenderMode } = await import('~/shared/features/cms-preview/use-render-mode')
    expect(useRenderMode().value).toBe('public-render')
  })

  it('returns editor-preview when preview is ready (editor connected)', async () => {
    vi.doMock('~/shared/composables/useCmsPreview', () => ({
      useCmsPreview: () => ({ isPreviewReady: ref(true) }),
    }))
    const { useRenderMode } = await import('~/shared/features/cms-preview/use-render-mode')
    expect(useRenderMode().value).toBe('editor-preview')
  })

  it('reacts to isPreviewReady changes', async () => {
    const flag = ref(false)
    vi.doMock('~/shared/composables/useCmsPreview', () => ({
      useCmsPreview: () => ({ isPreviewReady: flag }),
    }))
    const { useRenderMode } = await import('~/shared/features/cms-preview/use-render-mode')
    const mode = useRenderMode()
    expect(mode.value).toBe('public-render')
    flag.value = true
    expect(mode.value).toBe('editor-preview')
  })
})
