import { watch, type Ref } from 'vue'
import type { PositionedItemAuthored, PositionedItemPatch } from '../types'
import { clampPosition, clampSize } from '../geometry/clamp'

export type UseKeyboardPositioningArgs<T extends PositionedItemAuthored> = {
  selectedItemId: Ref<string | null>
  items: Ref<T[]>
  applyPatch: (patch: PositionedItemPatch, options: { commit: boolean }) => void
  blockRootEl: Ref<HTMLElement | null>
}

export function useKeyboardPositioning<T extends PositionedItemAuthored>(
  args: UseKeyboardPositioningArgs<T>,
) {
  // Focus the block root when an item becomes selected. Keyboard listener is
  // attached to the block root (not window), so focus must be inside it for
  // keydown events to fire.
  watch(args.selectedItemId, id => {
    if (id && args.blockRootEl.value) {
      if (args.blockRootEl.value.tabIndex < 0) {
        args.blockRootEl.value.setAttribute('tabindex', '-1')
      }
      args.blockRootEl.value.focus()
    }
  })

  function onKeydown(e: KeyboardEvent) {
    const id = args.selectedItemId.value
    if (!id) return
    const item = args.items.value.find(i => i.id === id)
    if (!item) return
    if (e.key === 'Escape') {
      args.selectedItemId.value = null
      e.preventDefault()
      return
    }
    if (item.locked) return
    const step = e.shiftKey ? 5 : 1
    let patch: PositionedItemPatch | null = null
    switch (e.key) {
      case 'ArrowLeft':  patch = { id, positionX: clampPosition(item.positionX - step) }; break
      case 'ArrowRight': patch = { id, positionX: clampPosition(item.positionX + step) }; break
      case 'ArrowUp':    patch = { id, positionY: clampPosition(item.positionY - step) }; break
      case 'ArrowDown':  patch = { id, positionY: clampPosition(item.positionY + step) }; break
      case 'r': case 'R': patch = { id, rotation: item.rotation + (e.shiftKey ? 15 : 1) }; break
      case '[': patch = { id, width: clampSize(item.width - 1), height: clampSize(item.height - 1) }; break
      case ']': patch = { id, width: clampSize(item.width + 1), height: clampSize(item.height + 1) }; break
    }
    if (patch) {
      e.preventDefault()
      args.applyPatch(patch, { commit: true })
    }
  }

  // Re-attach listener when blockRootEl ref changes (covers mount/unmount and
  // template-ref transitions). `immediate: true` wires the listener on setup.
  watch(args.blockRootEl, (el, prev) => {
    prev?.removeEventListener('keydown', onKeydown)
    el?.addEventListener('keydown', onKeydown)
  }, { immediate: true })
}
