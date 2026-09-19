// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, nextTick } from 'vue'
import { createSessionStorageAdapter } from '../../../../../shared/features/layout-interaction/persistence/session-storage-adapter'
import { createEditorPreviewAdapter } from '../../../../../shared/features/layout-interaction/persistence/editor-preview-adapter'
import { useInteractivePositioning } from '../../../../../shared/features/layout-interaction/use-interactive-positioning'
import { useKeyboardPositioning } from '../../../../../shared/features/layout-interaction/controllers/use-keyboard-positioning'

describe('chunk C invariants', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    document.body.innerHTML = ''
  })

  it('session adapter commit() never persists width/height/rotation/zIndex', () => {
    const adapter = createSessionStorageAdapter({ namespace: 'scatter' })
    const authoredItems = [
      { id: 'a', positionX: 10, positionY: 10, width: 20, height: 20, rotation: 0, zIndex: 1 },
    ]
    const ctx = { blockId: 'blk', configVersion: 'cv', authoredItems, layoutFingerprint: 'fp' }
    adapter.commit(
      { id: 'a', positionX: 1, positionY: 2, width: 99, height: 99, rotation: 99, zIndex: 99 },
      ctx,
    )
    const key = 'scatter:blk:v:cv:h:fp:s:1'
    const payload = JSON.parse(window.sessionStorage.getItem(key) as string)
    const row = payload.items.find((r: any) => r.id === 'a')
    expect(Object.keys(row).sort()).toEqual(['id', 'positionX', 'positionY'])
  })

  it('editor adapter commit() preserves every patch field', () => {
    const sent: any[] = []
    const adapter = createEditorPreviewAdapter((patch, context) => sent.push({ patch, context }))
    const ctx = { blockId: 'b', configVersion: 'v', authoredItems: [], layoutFingerprint: 'fp' }
    adapter.commit(
      { id: 'a', positionX: 1, positionY: 2, width: 3, height: 4, rotation: 5, zIndex: 6 },
      ctx,
    )
    expect(sent[0].patch).toEqual({
      id: 'a', positionX: 1, positionY: 2, width: 3, height: 4, rotation: 5, zIndex: 6,
    })
  })

  it('pointer and keyboard produce equivalent adapter.commit shapes for the same patch', async () => {
    const canvas = document.createElement('div')
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({
        width: 500, height: 500, left: 0, top: 0, right: 500, bottom: 500, x: 0, y: 0,
        toJSON: () => ({}),
      }),
    })

    // --- Pointer side ---
    const adapterForPointer = {
      hydrate: (a: any) => [...a],
      preview: vi.fn(),
      commit: vi.fn(),
      revert: vi.fn(),
      clearOverrides: vi.fn(),
    }
    const items = ref([
      { id: 'a', positionX: 50, positionY: 50, width: 20, height: 20, rotation: 0, zIndex: 1 },
    ])
    const ptr = useInteractivePositioning({
      items,
      adapter: adapterForPointer as any,
      capabilities: { drag: true, resize: true, rotate: true, selection: true },
      context: { blockId: 'blk', configVersion: 'cv', authoredItems: items.value, layoutFingerprint: 'fp' },
      canvasEl: ref(canvas),
    })
    // Drag item 'a' from canvas center (250px) 5px right — canvas is 500x500,
    // so 5px maps to 1% of width. Expected positionX = 50 + 1 = 51.
    ptr.onPointerDownItem(new PointerEvent('pointerdown', { clientX: 250, clientY: 250, pointerId: 1 }), 'a')
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 255, clientY: 250, pointerId: 1 }))
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: 255, clientY: 250, pointerId: 1 }))
    expect(adapterForPointer.commit).toHaveBeenCalledTimes(1)
    const pointerPatch = adapterForPointer.commit.mock.calls[0][0]
    expect(pointerPatch.positionX).toBeCloseTo(51, 5)

    // --- Keyboard side ---
    // Use a second substrate instance so applyPatch flows through the same
    // adapter.commit path as the pointer (proving equivalence).
    const adapterForKeyboard = {
      hydrate: (a: any) => [...a],
      preview: vi.fn(),
      commit: vi.fn(),
      revert: vi.fn(),
      clearOverrides: vi.fn(),
    }
    const items2 = ref([
      { id: 'a', positionX: 50, positionY: 50, width: 20, height: 20, rotation: 0, zIndex: 1 },
    ])
    const substrate2 = useInteractivePositioning({
      items: items2,
      adapter: adapterForKeyboard as any,
      capabilities: { drag: true, resize: true, rotate: true, selection: true },
      context: { blockId: 'blk', configVersion: 'cv', authoredItems: items2.value, layoutFingerprint: 'fp' },
      canvasEl: ref(canvas),
    })
    substrate2.selectItem('a')
    const blockRoot = document.createElement('div')
    document.body.appendChild(blockRoot)
    useKeyboardPositioning({
      selectedItemId: substrate2.selectedItemId,
      items: substrate2.positionedItems,
      applyPatch: substrate2.applyPatch,
      blockRootEl: ref(blockRoot),
    })
    await nextTick()
    blockRoot.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    expect(adapterForKeyboard.commit).toHaveBeenCalledTimes(1)
    const keyboardPatch = adapterForKeyboard.commit.mock.calls[0][0]
    expect(keyboardPatch.positionX).toBe(51)

    // Invariant: both input modalities route through applyPatch and produce the
    // same committed positionX for equivalent intent.
    expect(Math.round(pointerPatch.positionX)).toBe(keyboardPatch.positionX)
  })
})
