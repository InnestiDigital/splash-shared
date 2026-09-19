// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, nextTick } from 'vue'
import { useKeyboardPositioning } from '../../../../../shared/features/layout-interaction/controllers/use-keyboard-positioning'

function setup() {
  const selectedItemId = ref<string | null>('a')
  const items = ref([{ id: 'a', positionX: 50, positionY: 50, width: 20, height: 20, rotation: 0, zIndex: 1 }])
  const applyPatch = vi.fn()
  const blockRootEl = ref(document.createElement('div'))
  document.body.appendChild(blockRootEl.value)
  useKeyboardPositioning({ selectedItemId, items, applyPatch, blockRootEl })
  return { selectedItemId, items, applyPatch, blockRootEl }
}

const key = (el: EventTarget, k: string, o: KeyboardEventInit = {}) =>
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...o }))

describe('useKeyboardPositioning', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('arrow moves by 1, shift by 5, routed through applyPatch commit:true', () => {
    const { applyPatch, blockRootEl } = setup()
    key(blockRootEl.value, 'ArrowRight')
    expect(applyPatch).toHaveBeenCalledWith({ id: 'a', positionX: 51 }, { commit: true })
    key(blockRootEl.value, 'ArrowLeft', { shiftKey: true })
    // Items ref is unchanged by the mock applyPatch, so the controller reads
    // positionX=50 for the next step. 50 - 5 = 45.
    expect(applyPatch).toHaveBeenLastCalledWith({ id: 'a', positionX: 45 }, { commit: true })
  })

  it('ArrowUp / ArrowDown adjust positionY', () => {
    const { applyPatch, blockRootEl } = setup()
    key(blockRootEl.value, 'ArrowUp')
    expect(applyPatch).toHaveBeenLastCalledWith({ id: 'a', positionY: 49 }, { commit: true })
    key(blockRootEl.value, 'ArrowDown', { shiftKey: true })
    expect(applyPatch).toHaveBeenLastCalledWith({ id: 'a', positionY: 55 }, { commit: true })
  })

  it('R / shift+R rotate via applyPatch', () => {
    const { applyPatch, blockRootEl } = setup()
    key(blockRootEl.value, 'r')
    expect(applyPatch).toHaveBeenLastCalledWith({ id: 'a', rotation: 1 }, { commit: true })
    key(blockRootEl.value, 'R', { shiftKey: true })
    expect(applyPatch).toHaveBeenLastCalledWith({ id: 'a', rotation: 15 }, { commit: true })
  })

  it('[ / ] adjust size via applyPatch', () => {
    const { applyPatch, blockRootEl } = setup()
    key(blockRootEl.value, '[')
    expect(applyPatch).toHaveBeenLastCalledWith({ id: 'a', width: 19, height: 19 }, { commit: true })
    key(blockRootEl.value, ']')
    expect(applyPatch).toHaveBeenLastCalledWith({ id: 'a', width: 21, height: 21 }, { commit: true })
  })

  it('Esc clears selection without emitting a patch', () => {
    const { selectedItemId, applyPatch, blockRootEl } = setup()
    key(blockRootEl.value, 'Escape')
    expect(selectedItemId.value).toBeNull()
    expect(applyPatch).not.toHaveBeenCalled()
  })

  it('no-op when selectedItemId is null', () => {
    const { selectedItemId, applyPatch, blockRootEl } = setup()
    selectedItemId.value = null
    key(blockRootEl.value, 'ArrowRight')
    expect(applyPatch).not.toHaveBeenCalled()
  })

  it('keydown on window (outside blockRootEl) does not fire', () => {
    const { applyPatch } = setup()
    key(window as any, 'ArrowRight')
    expect(applyPatch).not.toHaveBeenCalled()
  })

  it('each keypress emits exactly one commit patch', () => {
    const { applyPatch, blockRootEl } = setup()
    key(blockRootEl.value, 'ArrowRight')
    expect(applyPatch).toHaveBeenCalledTimes(1)
    key(blockRootEl.value, 'ArrowRight')
    expect(applyPatch).toHaveBeenCalledTimes(2)
  })

  it('on selection, focus moves to blockRootEl', async () => {
    const { selectedItemId, blockRootEl } = setup()
    selectedItemId.value = null
    await nextTick()
    const spy = vi.spyOn(blockRootEl.value, 'focus')
    selectedItemId.value = 'a'
    await nextTick()
    expect(spy).toHaveBeenCalled()
  })
})
