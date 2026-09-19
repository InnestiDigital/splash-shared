// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { useInteractivePositioning } from '../../../../shared/features/layout-interaction/use-interactive-positioning'

function mockAdapter() {
  return {
    hydrate: vi.fn((authored: any[]) => authored),
    preview: vi.fn(),
    commit: vi.fn(),
    revert: vi.fn(),
    clearOverrides: vi.fn(),
  }
}

function makeCanvas() {
  const c = document.createElement('div')
  Object.defineProperty(c, 'getBoundingClientRect', {
    value: () => ({ width: 500, height: 500, left: 0, top: 0, right: 500, bottom: 500, x: 0, y: 0, toJSON: () => ({}) }),
  })
  return c
}

function setup(adapter = mockAdapter()) {
  const canvas = makeCanvas()
  const items = ref([
    { id: 'a', positionX: 10, positionY: 10, width: 20, height: 20, rotation: 0, zIndex: 1 },
    { id: 'b', positionX: 40, positionY: 40, width: 20, height: 20, rotation: 0, zIndex: 2 },
  ])
  const api = useInteractivePositioning({
    items,
    adapter,
    capabilities: { drag: true, resize: true, rotate: true, selection: true },
    context: { blockId: 'blk', configVersion: 'cv', authoredItems: items.value, layoutFingerprint: 'fp' },
    canvasEl: ref(canvas),
  })
  return { api, items, adapter, canvas }
}

function fire(target: EventTarget, type: string, opts: Partial<PointerEvent> = {}) {
  target.dispatchEvent(new PointerEvent(type, { pointerId: 1, bubbles: true, ...opts }))
}

describe('useInteractivePositioning — hydration, selection, threshold', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('positionedItems returns adapter.hydrate result', () => {
    const { api, adapter } = setup()
    expect(api.positionedItems.value).toHaveLength(2)
    expect(adapter.hydrate).toHaveBeenCalled()
  })

  it('selectItem mutates selection', () => {
    const { api } = setup()
    api.selectItem('a')
    expect(api.selectedItemId.value).toBe('a')
    api.selectItem(null)
    expect(api.selectedItemId.value).toBeNull()
  })

  it('pointer down → up (no move) selects item', () => {
    const { api } = setup()
    api.onPointerDownItem(new PointerEvent('pointerdown', { clientX: 100, clientY: 100, pointerId: 1 }), 'a')
    fire(window, 'pointerup', { clientX: 100, clientY: 100 })
    expect(api.selectedItemId.value).toBe('a')
  })

  it('movement past 4px threshold prevents selection', () => {
    const { api } = setup()
    api.onPointerDownItem(new PointerEvent('pointerdown', { clientX: 100, clientY: 100, pointerId: 1 }), 'a')
    fire(window, 'pointermove', { clientX: 120, clientY: 120 })
    fire(window, 'pointerup', { clientX: 120, clientY: 120 })
    expect(api.selectedItemId.value).toBeNull()
  })

  it('clicking canvas background deselects', () => {
    const { api, canvas } = setup()
    api.selectItem('a')
    const ev = new PointerEvent('pointerdown', { clientX: 10, clientY: 10 })
    Object.defineProperty(ev, 'target', { value: canvas })
    Object.defineProperty(ev, 'currentTarget', { value: canvas })
    api.onPointerDownCanvas(ev)
    expect(api.selectedItemId.value).toBeNull()
  })

  it('interactive-descendant opt-out (broad list including role/data attrs)', () => {
    const { api, adapter } = setup()
    for (const selector of ['button', 'a', 'input', '[role="button"]', '[data-interactive]', '[draggable="true"]', '[data-no-drag]']) {
      const el = document.createElement(selector.startsWith('[') ? 'div' : selector)
      if (selector === '[role="button"]') el.setAttribute('role', 'button')
      if (selector === '[data-interactive]') el.setAttribute('data-interactive', 'true')
      if (selector === '[draggable="true"]') el.setAttribute('draggable', 'true')
      if (selector === '[data-no-drag]') el.setAttribute('data-no-drag', '')
      document.body.appendChild(el)
      const ev = new PointerEvent('pointerdown', { pointerId: 1 })
      Object.defineProperty(ev, 'target', { value: el })
      api.onPointerDownItem(ev, 'a')
      fire(window, 'pointermove', { clientX: 200, clientY: 200 })
      fire(window, 'pointerup', { clientX: 200, clientY: 200 })
    }
    expect(adapter.commit).not.toHaveBeenCalled()
  })
})

describe('useInteractivePositioning — drag dispatch', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('drag mutates positionX/Y via applyPatch', () => {
    const { api } = setup()
    api.onPointerDownItem(new PointerEvent('pointerdown', { clientX: 100, clientY: 100, pointerId: 1 }), 'a')
    fire(window, 'pointermove', { clientX: 150, clientY: 150 }) // 50px = 10% of 500px canvas
    fire(window, 'pointerup', { clientX: 150, clientY: 150 })
    const a = api.positionedItems.value.find(i => i.id === 'a')!
    expect(a.positionX).toBeCloseTo(20, 5) // 10 + 10
    expect(a.positionY).toBeCloseTo(20, 5)
  })
})

describe('useInteractivePositioning — resize dispatch', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('resize SE dispatch updates width/height and shifts center to keep NW pinned', () => {
    const { api } = setup()
    // item b at (40,40), w/h 20. SE corner at (50,50) in %-space = (250,250)px.
    api.onPointerDownHandle(new PointerEvent('pointerdown', { clientX: 250, clientY: 250, pointerId: 1 }), 'b', 'resize-se')
    fire(window, 'pointermove', { clientX: 300, clientY: 300 }) // +10% each axis
    fire(window, 'pointerup', { clientX: 300, clientY: 300 })
    const b = api.positionedItems.value.find(i => i.id === 'b')!
    expect(b.width).toBeCloseTo(30, 5)
    expect(b.height).toBeCloseTo(30, 5)
    expect(b.positionX).toBeCloseTo(45, 5)
    expect(b.positionY).toBeCloseTo(45, 5)
  })

  it('starts resize from a role=button handle instead of treating it as nested content', () => {
    const { api, adapter } = setup()
    const handle = document.createElement('span')
    handle.setAttribute('role', 'button')
    const down = new PointerEvent('pointerdown', {
      clientX: 250, clientY: 250, pointerId: 1,
    })
    Object.defineProperty(down, 'target', { value: handle })
    Object.defineProperty(down, 'currentTarget', { value: handle })

    api.onPointerDownHandle(down, 'b', 'resize-se')
    fire(window, 'pointermove', { clientX: 300, clientY: 300 })
    fire(window, 'pointerup', { clientX: 300, clientY: 300 })

    expect(adapter.commit).toHaveBeenCalledTimes(1)
    expect(adapter.commit.mock.calls[0][0]).toMatchObject({ id: 'b', width: 30, height: 30 })
  })
})

describe('useInteractivePositioning — rotate dispatch', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('rotate dispatch updates rotation based on center-origin angle delta', () => {
    const { api } = setup()
    // b at (40,40) = (200,200)px. Pointer down at (200,100) = 12 o'clock. Move to (300,200) = 3 o'clock.
    api.onPointerDownHandle(new PointerEvent('pointerdown', { clientX: 200, clientY: 100, pointerId: 1 }), 'b', 'rotate')
    fire(window, 'pointermove', { clientX: 300, clientY: 200 })
    fire(window, 'pointerup', { clientX: 300, clientY: 200 })
    expect(api.positionedItems.value.find(i => i.id === 'b')!.rotation).toBeCloseTo(90, 0)
  })

  it('starts rotation from a role=button handle', () => {
    const { api, adapter } = setup()
    const handle = document.createElement('span')
    handle.setAttribute('role', 'button')
    const down = new PointerEvent('pointerdown', {
      clientX: 200, clientY: 100, pointerId: 1,
    })
    Object.defineProperty(down, 'target', { value: handle })
    Object.defineProperty(down, 'currentTarget', { value: handle })

    api.onPointerDownHandle(down, 'b', 'rotate')
    fire(window, 'pointermove', { clientX: 300, clientY: 200 })
    fire(window, 'pointerup', { clientX: 300, clientY: 200 })

    expect(adapter.commit).toHaveBeenCalledTimes(1)
    expect(adapter.commit.mock.calls[0][0]).toMatchObject({ id: 'b', rotation: 90 })
  })
})

describe('useInteractivePositioning — layer order, commit, revert', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('does not rewrite persistent layer order when a drag crosses the threshold', () => {
    const { api } = setup()
    api.onPointerDownItem(new PointerEvent('pointerdown', { clientX: 100, clientY: 100, pointerId: 1 }), 'a')
    fire(window, 'pointermove', { clientX: 120, clientY: 120 })
    expect(api.activeGestureItemId.value).toBe('a')
    expect(api.positionedItems.value.find(i => i.id === 'a')!.zIndex).toBe(1)
  })

  it('commits aggregated patch exactly once on pointer-up', () => {
    const { api, adapter } = setup()
    api.onPointerDownItem(new PointerEvent('pointerdown', { clientX: 100, clientY: 100, pointerId: 1 }), 'a')
    fire(window, 'pointermove', { clientX: 150, clientY: 150 })
    fire(window, 'pointermove', { clientX: 160, clientY: 160 })
    fire(window, 'pointerup', { clientX: 160, clientY: 160 })
    expect(adapter.commit).toHaveBeenCalledTimes(1)
    const patch = adapter.commit.mock.calls[0][0]
    expect(patch.id).toBe('a')
    expect(typeof patch.positionX).toBe('number')
    expect(typeof patch.positionY).toBe('number')
    expect(patch.zIndex).toBeUndefined()
  })

  it('commits on pointercancel if threshold was exceeded (browsers spuriously cancel fast drags)', () => {
    const { api, adapter } = setup()
    api.onPointerDownItem(new PointerEvent('pointerdown', { clientX: 100, clientY: 100, pointerId: 1 }), 'a')
    fire(window, 'pointermove', { clientX: 200, clientY: 200 })  // past threshold
    fire(window, 'pointercancel', { clientX: 200, clientY: 200 })
    // Gesture had real intent — commit the in-flight patch, don't snap back.
    expect(adapter.commit).toHaveBeenCalled()
    expect(adapter.revert).not.toHaveBeenCalled()
  })

  it('reverts on pointercancel BEFORE threshold exceeded', () => {
    const { api, adapter } = setup()
    const before = api.positionedItems.value.find(i => i.id === 'a')!.positionX
    api.onPointerDownItem(new PointerEvent('pointerdown', { clientX: 100, clientY: 100, pointerId: 1 }), 'a')
    // No pointermove — threshold not exceeded
    fire(window, 'pointercancel', { clientX: 100, clientY: 100 })
    expect(api.positionedItems.value.find(i => i.id === 'a')!.positionX).toBe(before)
    expect(adapter.commit).not.toHaveBeenCalled()
    expect(adapter.revert).toHaveBeenCalled()
  })

  it('preserves selection across pointercancel', () => {
    const { api } = setup()
    api.selectItem('a')
    api.onPointerDownItem(new PointerEvent('pointerdown', { clientX: 100, clientY: 100, pointerId: 2 }), 'a')
    fire(window, 'pointermove', { clientX: 200, clientY: 200 })
    fire(window, 'pointercancel', { clientX: 200, clientY: 200 })
    expect(api.selectedItemId.value).toBe('a')
  })

  it('lostpointercapture after threshold also commits (symmetric with pointercancel)', () => {
    const { api, adapter } = setup()
    api.onPointerDownItem(new PointerEvent('pointerdown', { clientX: 100, clientY: 100, pointerId: 1 }), 'a')
    fire(window, 'pointermove', { clientX: 200, clientY: 200 })
    fire(window, 'lostpointercapture', { clientX: 200, clientY: 200 })
    expect(adapter.commit).toHaveBeenCalled()
  })
})

describe('useInteractivePositioning — teardown / capability gating', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('teardown during active gesture reverts via adapter and does not commit', () => {
    const { api, adapter } = setup()
    const beforeX = api.positionedItems.value.find(i => i.id === 'a')!.positionX
    api.onPointerDownItem(new PointerEvent('pointerdown', { clientX: 100, clientY: 100, pointerId: 1 }), 'a')
    fire(window, 'pointermove', { clientX: 200, clientY: 200 })
    api.teardown()
    expect(adapter.revert).toHaveBeenCalled()
    expect(adapter.commit).not.toHaveBeenCalled()
    expect(api.positionedItems.value.find(i => i.id === 'a')!.positionX).toBe(beforeX)
  })

  it('teardown without active session is a no-op', () => {
    const { api, adapter } = setup()
    expect(() => api.teardown()).not.toThrow()
    expect(adapter.revert).not.toHaveBeenCalled()
  })

  it('selects a locked item but never starts or commits a gesture', () => {
    const { api, adapter } = setup()
    api.positionedItems.value[0] = { ...api.positionedItems.value[0], locked: true }
    api.onPointerDownItem(new PointerEvent('pointerdown', {
      clientX: 100, clientY: 100, pointerId: 1,
    }), 'a')
    fire(window, 'pointermove', { clientX: 200, clientY: 200 })
    fire(window, 'pointerup', { clientX: 200, clientY: 200 })
    expect(api.selectedItemId.value).toBe('a')
    expect(adapter.commit).not.toHaveBeenCalled()
  })

  it('onPointerDownHandle is gated on resize capability', () => {
    const adapter = mockAdapter()
    const canvas = makeCanvas()
    const items = ref([{ id: 'a', positionX: 10, positionY: 10, width: 20, height: 20, rotation: 0, zIndex: 1 }])
    const api = useInteractivePositioning({
      items,
      adapter,
      capabilities: { drag: true, resize: false, rotate: true, selection: true },
      context: { blockId: 'blk', configVersion: 'cv', authoredItems: items.value, layoutFingerprint: 'fp' },
      canvasEl: ref(canvas),
    })
    api.onPointerDownHandle(new PointerEvent('pointerdown', { clientX: 100, clientY: 100, pointerId: 1 }), 'a', 'resize-se')
    fire(window, 'pointermove', { clientX: 200, clientY: 200 })
    fire(window, 'pointerup', { clientX: 200, clientY: 200 })
    expect(adapter.commit).not.toHaveBeenCalled()
  })

  it('onPointerDownHandle is gated on rotate capability', () => {
    const adapter = mockAdapter()
    const canvas = makeCanvas()
    const items = ref([{ id: 'a', positionX: 10, positionY: 10, width: 20, height: 20, rotation: 0, zIndex: 1 }])
    const api = useInteractivePositioning({
      items,
      adapter,
      capabilities: { drag: true, resize: true, rotate: false, selection: true },
      context: { blockId: 'blk', configVersion: 'cv', authoredItems: items.value, layoutFingerprint: 'fp' },
      canvasEl: ref(canvas),
    })
    api.onPointerDownHandle(new PointerEvent('pointerdown', { clientX: 100, clientY: 100, pointerId: 1 }), 'a', 'rotate')
    fire(window, 'pointermove', { clientX: 200, clientY: 200 })
    fire(window, 'pointerup', { clientX: 200, clientY: 200 })
    expect(adapter.commit).not.toHaveBeenCalled()
  })

  it('onPointerDownItem is gated when neither drag nor selection are enabled', () => {
    const adapter = mockAdapter()
    const canvas = makeCanvas()
    const items = ref([{ id: 'a', positionX: 10, positionY: 10, width: 20, height: 20, rotation: 0, zIndex: 1 }])
    const api = useInteractivePositioning({
      items,
      adapter,
      capabilities: { drag: false, resize: true, rotate: true, selection: false },
      context: { blockId: 'blk', configVersion: 'cv', authoredItems: items.value, layoutFingerprint: 'fp' },
      canvasEl: ref(canvas),
    })
    api.onPointerDownItem(new PointerEvent('pointerdown', { clientX: 100, clientY: 100, pointerId: 1 }), 'a')
    fire(window, 'pointerup', { clientX: 100, clientY: 100 })
    expect(api.selectedItemId.value).toBeNull()
    expect(adapter.commit).not.toHaveBeenCalled()
  })
})

describe('useInteractivePositioning — RAF coalescence', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('emits at most one adapter.preview per frame per gesture', () => {
    const rafQ: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => { rafQ.push(cb); return rafQ.length })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    const { api, adapter } = setup()
    api.onPointerDownItem(new PointerEvent('pointerdown', { clientX: 100, clientY: 100, pointerId: 1 }), 'a')
    fire(window, 'pointermove', { clientX: 150, clientY: 150 })
    fire(window, 'pointermove', { clientX: 160, clientY: 160 })
    fire(window, 'pointermove', { clientX: 170, clientY: 170 })
    expect(adapter.preview).not.toHaveBeenCalled()
    rafQ.shift()?.(performance.now())
    expect(adapter.preview).toHaveBeenCalledTimes(1)
    fire(window, 'pointermove', { clientX: 180, clientY: 180 })
    rafQ.shift()?.(performance.now())
    expect(adapter.preview).toHaveBeenCalledTimes(2)
  })
})
