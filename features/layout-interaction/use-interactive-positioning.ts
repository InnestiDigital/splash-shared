import { ref, watchEffect, onScopeDispose, type Ref } from 'vue'
import type { PositionedItemAuthored, PositionedItemPatch } from './types'
import type { LayoutPersistenceAdapter, AdapterContext } from './persistence/adapter'
import { THRESHOLD_PX } from './constants'
import { computeDragPatch } from './geometry/drag'
import { computeResizePatch, type ResizeKind } from './geometry/resize'
import { computeRotatePatch } from './geometry/rotate'

export type HandleKind = 'resize-nw' | 'resize-ne' | 'resize-sw' | 'resize-se' | 'rotate'

export type InteractiveCapabilities = {
  drag: boolean
  resize: boolean
  rotate: boolean
  selection: boolean
}

export type UseInteractivePositioningArgs<T extends PositionedItemAuthored> = {
  items: Ref<T[]>
  adapter: LayoutPersistenceAdapter<T>
  capabilities: InteractiveCapabilities
  context: AdapterContext
  canvasEl: Ref<HTMLElement | null>
}

export type UseInteractivePositioningReturn<T extends PositionedItemAuthored> = {
  positionedItems: Ref<T[]>
  selectedItemId: Ref<string | null>
  activeGestureItemId: Ref<string | null>
  applyPatch: (patch: PositionedItemPatch, options: { commit: boolean }) => void
  selectItem: (id: string | null) => void
  onPointerDownItem: (e: PointerEvent, itemId: string) => void
  onPointerDownHandle: (e: PointerEvent, itemId: string, kind: HandleKind) => void
  onPointerDownCanvas: (e: PointerEvent) => void
  teardown: () => void
}

const INTERACTIVE_SELECTOR = [
  'a', 'button', 'input', 'select', 'textarea', '[contenteditable]',
  '[draggable="true"]', '[role="button"]', '[data-interactive]', '[data-no-drag]',
].join(', ')

function isInteractiveDescendant(el: Element | null): boolean {
  if (!el || typeof (el as any).closest !== 'function') return false
  return !!el.closest(INTERACTIVE_SELECTOR)
}

function stripUndef<O extends Record<string, any>>(o: O): Partial<O> {
  const out: Partial<O> = {}
  for (const k of Object.keys(o) as (keyof O)[]) if (o[k] !== undefined) out[k] = o[k]
  return out
}

export function useInteractivePositioning<T extends PositionedItemAuthored>(
  args: UseInteractivePositioningArgs<T>,
): UseInteractivePositioningReturn<T> {
  const positionedItems = ref<T[]>([]) as Ref<T[]>
  watchEffect(() => {
    positionedItems.value = args.adapter.hydrate(args.items.value, args.context)
  })

  const selectedItemId = ref<string | null>(null)
  const activeGestureItemId = ref<string | null>(null)

  function selectItem(id: string | null) {
    selectedItemId.value = id
  }

  type PointerSession = {
    itemId: string
    handleKind: HandleKind | null
    startPx: { x: number; y: number }
    startItem: T
    exceededThreshold: boolean
    patch: PositionedItemPatch
    rafId: number | null
  }
  let session: PointerSession | null = null
  let pendingPatch: PositionedItemPatch | null = null

  function startSession(e: PointerEvent, itemId: string, handleKind: HandleKind | null) {
    // Item-body drags yield to links/buttons/form controls inside the block.
    // A resize/rotate handle is itself role="button", so applying the same
    // descendant guard to handle sessions would make every handle inert.
    if (handleKind === null && isInteractiveDescendant(e.target as Element)) return
    const start = positionedItems.value.find(i => i.id === itemId)
    if (!start) return
    if (start.locked) {
      if (args.capabilities.selection) selectItem(itemId)
      return
    }
    const capEl = (e.currentTarget as Element) || (e.target as Element)
    capEl?.setPointerCapture?.(e.pointerId)
    session = {
      itemId,
      handleKind,
      startPx: { x: e.clientX, y: e.clientY },
      startItem: { ...start },
      exceededThreshold: false,
      patch: { id: itemId },
      rafId: null,
    }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerCancel)
    window.addEventListener('lostpointercapture', onPointerCancel)
  }

  function onPointerDownItem(e: PointerEvent, itemId: string) {
    if (!args.capabilities.selection && !args.capabilities.drag) return
    startSession(e, itemId, null)
  }

  function onPointerDownHandle(e: PointerEvent, itemId: string, kind: HandleKind) {
    if (!(kind === 'rotate' ? args.capabilities.rotate : args.capabilities.resize)) return
    e.stopPropagation() // hit-target priority: handle wins over item body
    startSession(e, itemId, kind)
  }

  function onPointerDownCanvas(e: PointerEvent) {
    if (e.target !== e.currentTarget) return
    selectItem(null)
  }

  function scheduleRafPreview(patch: PositionedItemPatch) {
    pendingPatch = { ...pendingPatch, ...patch, id: patch.id }
    if (!session || session.rafId != null) return
    session.rafId = requestAnimationFrame(() => {
      if (session) session.rafId = null
      if (pendingPatch && args.adapter.preview) args.adapter.preview(pendingPatch, args.context)
      pendingPatch = null
    })
  }

  function applyPatch(patch: PositionedItemPatch, options: { commit: boolean }) {
    const idx = positionedItems.value.findIndex(i => i.id === patch.id)
    if (idx >= 0) {
      positionedItems.value[idx] = { ...positionedItems.value[idx], ...stripUndef(patch) }
    }
    if (options.commit) {
      args.adapter.commit(patch, args.context)
    } else if (args.adapter.preview) {
      scheduleRafPreview(patch)
    }
  }

  function onPointerMove(e: PointerEvent) {
    if (!session) return
    const dx = e.clientX - session.startPx.x
    const dy = e.clientY - session.startPx.y
    if (!session.exceededThreshold && Math.hypot(dx, dy) > THRESHOLD_PX) {
      session.exceededThreshold = true
      activeGestureItemId.value = session.itemId
    }
    if (!session.exceededThreshold) return
    if (session.handleKind === null && args.capabilities.drag) {
      const canvas = args.canvasEl.value
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const patch = computeDragPatch({
        id: session.itemId,
        startItem: session.startItem,
        deltaPx: { x: dx, y: dy },
        canvasRect: { width: rect.width, height: rect.height },
      })
      session.patch = { ...session.patch, ...patch }
      applyPatch(patch, { commit: false })
    } else if (session.handleKind?.startsWith('resize-') && args.capabilities.resize) {
      const canvas = args.canvasEl.value
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const pointerPctNow = {
        x: ((e.clientX - rect.left) / rect.width) * 100,
        y: ((e.clientY - rect.top) / rect.height) * 100,
      }
      const patch = computeResizePatch({
        id: session.itemId,
        kind: session.handleKind as ResizeKind,
        startItem: session.startItem,
        pointerPctNow,
      })
      session.patch = { ...session.patch, ...patch }
      applyPatch(patch, { commit: false })
    } else if (session.handleKind === 'rotate' && args.capabilities.rotate) {
      const canvas = args.canvasEl.value
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const centerPx = {
        x: rect.left + (session.startItem.positionX / 100) * rect.width,
        y: rect.top + (session.startItem.positionY / 100) * rect.height,
      }
      const patch = computeRotatePatch({
        id: session.itemId,
        startItem: session.startItem,
        centerPx,
        startPointerPx: session.startPx,
        pointerPxNow: { x: e.clientX, y: e.clientY },
      })
      session.patch = { ...session.patch, ...patch }
      applyPatch(patch, { commit: false })
    }
  }

  function onPointerUp(_e: PointerEvent) {
    if (!session) return
    if (!session.exceededThreshold) {
      if (args.capabilities.selection) selectItem(session.itemId)
    } else {
      applyPatch(session.patch, { commit: true })
    }
    closeSession()
  }

  function cancelSession(reason: 'pointer-cancel' | 'teardown') {
    if (!session) return
    // Pointer-cancel from the browser (pointercancel / lostpointercapture)
    // during an active drag often happens spuriously on fast gestures — the
    // user signalled real intent by exceeding threshold, so preserve the
    // work and commit. Teardown (component unmount / scope disposal) always
    // reverts: there's no save window, and the component is going away.
    if (session.exceededThreshold && reason === 'pointer-cancel') {
      applyPatch(session.patch, { commit: true })
    } else {
      const idx = positionedItems.value.findIndex(i => i.id === session.itemId)
      if (idx >= 0) positionedItems.value[idx] = session.startItem
      args.adapter.revert?.(args.context)
    }
    // Do NOT clear selectedItemId — selection persists.
    closeSession()
  }

  function onPointerCancel() {
    cancelSession('pointer-cancel')
  }

  function closeSession() {
    if (!session) return
    if (session.rafId != null) cancelAnimationFrame(session.rafId)
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('pointercancel', onPointerCancel)
    window.removeEventListener('lostpointercapture', onPointerCancel)
    session = null
    pendingPatch = null
    activeGestureItemId.value = null
  }

  function teardown() {
    if (session) cancelSession('teardown')
  }

  onScopeDispose(teardown)

  return {
    positionedItems,
    selectedItemId,
    activeGestureItemId,
    applyPatch,
    selectItem,
    onPointerDownItem,
    onPointerDownHandle,
    onPointerDownCanvas,
    teardown,
  }
}
