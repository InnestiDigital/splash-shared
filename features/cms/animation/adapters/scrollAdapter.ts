import type {
  MotionAdapter,
  AnimationScene,
  AnimationEntry,
  EntrySidecar,
  ResolvedTargets,
  AdapterInstance,
  ScrollTrigger,
  ScrollAnchor,
  TargetRef,
} from '~/shared/types/animation'
import type { CompiledEntry } from '../compileScene'
import { toWAAPIKeyframes } from './keyframeUtils'
import { resolveEntryDefaults, SYSTEM_DEFAULTS } from '../sceneResolver'
import { computeStaggerDelays } from '../presets/stagger'
import { getEntryProgress } from '../entryProgress'
import { createVarSidecar } from '../varAnimator'

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

export interface ScrollEntryState {
  source: CompiledEntry
  animation: Animation | null  // null for vars-only entries (no WAAPI properties)
  sidecars: EntrySidecar[]
}

interface ScrollAdapterState {
  scene: AnimationScene
  targets: ResolvedTargets
  entries: ScrollEntryState[]
  scrollHandler: (() => void) | null
  rafId: number | null
  nativeTimeline: unknown | null // ScrollTimeline when available
  progress: number
  destroyed: boolean
  pinCleanup: (() => void) | null
}

const stateMap = new Map<string, ScrollAdapterState>()

// ---------------------------------------------------------------------------
// Progress calculation
// ---------------------------------------------------------------------------

/**
 * Compute pixel threshold from a ScrollAnchor and element rect.
 * Returns the viewport-Y position at which the anchor condition is met.
 *
 * `edge` selects the element edge: top / center / bottom.
 * `viewport` is a 0-1 fraction of the viewport height where that edge triggers.
 *
 * The "trigger line" in viewport coordinates is `viewport * viewportHeight`.
 * The element edge in viewport coordinates comes from `getBoundingClientRect()`.
 *
 * Returned value: the scroll position (pixels from document top) at which
 * the element edge aligns with the viewport fraction.
 */
export function computeScrollThreshold(
  rect: DOMRect,
  scrollY: number,
  viewportHeight: number,
  anchor: ScrollAnchor,
): number {
  let elementEdge: number
  switch (anchor.edge) {
    case 'top':
      elementEdge = rect.top + scrollY
      break
    case 'center':
      elementEdge = rect.top + scrollY + rect.height / 2
      break
    case 'bottom':
      elementEdge = rect.top + scrollY + rect.height
      break
  }

  // The trigger fires when that edge reaches `anchor.viewport` fraction of viewport.
  // So the scroll position at which that happens:
  return elementEdge - anchor.viewport * viewportHeight
}

/**
 * Compute normalized 0-1 progress for an element between start and end scroll anchors.
 */
export function computeScrollProgress(
  rect: DOMRect,
  scrollY: number,
  viewportHeight: number,
  start: ScrollAnchor,
  end: ScrollAnchor,
): number {
  const startThreshold = computeScrollThreshold(rect, scrollY, viewportHeight, start)
  const endThreshold = computeScrollThreshold(rect, scrollY, viewportHeight, end)

  if (endThreshold === startThreshold) return scrollY >= startThreshold ? 1 : 0

  const raw = (scrollY - startThreshold) / (endThreshold - startThreshold)
  return Math.max(0, Math.min(1, raw))
}

/**
 * Default end anchor: element bottom at viewport top (0).
 */
function defaultEndAnchor(): ScrollAnchor {
  return { edge: 'bottom', viewport: 0 }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Pin utilities
// ---------------------------------------------------------------------------

/**
 * Apply sticky positioning to an element for pinning during scroll.
 * Sets position:sticky, top:0, and a z-index on the element.
 * Sets min-height on the element's parent to accommodate the scroll range.
 * Returns a cleanup function that restores original styles.
 */
export function applyPinStyles(el: HTMLElement, scrollRange: number): () => void {
  // Save original styles
  const origPosition = el.style.position
  const origTop = el.style.top
  const origZIndex = el.style.zIndex
  const parent = el.parentElement
  const origParentMinHeight = parent?.style.minHeight ?? ''

  // Apply pin styles
  el.style.position = 'sticky'
  el.style.top = '0px'
  el.style.zIndex = '10'

  // Set parent min-height to accommodate pin duration
  if (parent) {
    const elHeight = el.getBoundingClientRect().height
    parent.style.minHeight = `${elHeight + scrollRange}px`
  }

  // Return cleanup
  return () => {
    el.style.position = origPosition
    el.style.top = origTop
    el.style.zIndex = origZIndex
    if (parent) {
      parent.style.minHeight = origParentMinHeight
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveAnchorElement(
  scene: AnimationScene,
  targets: ResolvedTargets,
): HTMLElement | null {
  const trigger = scene.trigger as ScrollTrigger
  if (trigger.anchor === 'viewport') return null

  const anchor = trigger.anchor as TargetRef
  const resolved = targets[anchor.part]
  if (!resolved) return null
  if (Array.isArray(resolved)) return resolved[0] ?? null
  return resolved
}

function resolveTargetElement(
  entry: AnimationEntry,
  targets: ResolvedTargets,
): HTMLElement | null {
  // Try composite key first (choreography: multiple blocks with same part name)
  const compositeKey = `${entry.target.entityId}:${entry.target.part}`
  const resolved = targets[compositeKey] ?? targets[entry.target.part]
  if (!resolved) return null
  if (Array.isArray(resolved)) {
    const idx = entry.target.itemIndex ?? 0
    return resolved[idx] ?? null
  }
  return resolved
}

function buildEntryStates(
  scene: AnimationScene,
  targets: ResolvedTargets,
  compiledEntries?: CompiledEntry[],
): ScrollEntryState[] {
  const states: ScrollEntryState[] = []
  const staggerDelays = computeStaggerDelays(scene.entries)

  // Build a lookup from entry id → CompiledEntry when provided
  const compiledMap = new Map<string, CompiledEntry>()
  if (compiledEntries) {
    for (const ce of compiledEntries) {
      compiledMap.set(ce.source.id, ce)
    }
  }

  for (const entry of scene.entries) {
    const el = resolveTargetElement(entry, targets)
    if (!el) continue

    const wapiKeyframes = toWAAPIKeyframes(entry.keyframes)
    if (wapiKeyframes.length === 0) continue

    const { duration, easing } = resolveEntryDefaults(entry, scene, {})
    const staggerDelay = staggerDelays.get(entry.id) ?? 0

    // Check if keyframes have any visual WAAPI properties (not just offsets)
    const hasWaapiProps = wapiKeyframes.some(kf =>
      Object.keys(kf).some(k => k !== 'offset'),
    )

    let animation: Animation | null = null
    if (hasWaapiProps) {
      animation = el.animate(wapiKeyframes, {
        duration,
        easing,
        fill: 'forwards',
        delay: staggerDelay,
      })
      animation.pause()
    }

    // Resolve compiled entry (or create a passthrough wrapper)
    const compiled: CompiledEntry = compiledMap.get(entry.id) ?? {
      source: entry,
      compiled: { scrollRange: null, varTracks: null },
    }

    // Create sidecars from compiled var tracks
    const sidecars: EntrySidecar[] = []
    if (compiled.compiled.varTracks) {
      const sidecar = createVarSidecar(el, compiled.compiled.varTracks)
      if (sidecar) sidecars.push(sidecar)
    }

    states.push({ source: compiled, animation, sidecars })
  }

  return states
}

function setEntriesProgress(entries: ScrollEntryState[], sceneProgress: number): void {
  for (const entry of entries) {
    const p = getEntryProgress(sceneProgress, entry.source.compiled)
    // Update WAAPI animation if it exists (null for vars-only entries)
    const duration = entry.animation?.effect?.getComputedTiming().duration
    if (entry.animation && typeof duration === 'number' && isFinite(duration)) {
      const time = p * duration
      if (isFinite(time)) {
        entry.animation.currentTime = time
      }
    }
    for (const sidecar of entry.sidecars) {
      sidecar.update(p)
    }
  }
}

/**
 * Check if native ScrollTimeline API is available (Chromium 115+).
 */
function hasNativeScrollTimeline(): boolean {
  return typeof globalThis !== 'undefined' && 'ScrollTimeline' in globalThis
}

// ---------------------------------------------------------------------------
// Fallback: JS scroll listener + RAF
// ---------------------------------------------------------------------------

function setupFallbackScroll(
  state: ScrollAdapterState,
  anchorEl: HTMLElement | null,
): void {
  const trigger = state.scene.trigger as ScrollTrigger
  const start = parseScrollAnchor(trigger.start as any)
  const end = trigger.end ? parseScrollAnchor(trigger.end as any) : defaultEndAnchor()
  const scrubSmoothing = typeof trigger.scrub === 'number' ? trigger.scrub : 0

  let targetProgress = 0

  const updateProgress = () => {
    if (state.destroyed) return

    const viewportHeight = window.innerHeight
    const scrollY = window.scrollY

    let rect: DOMRect

    if (anchorEl) {
      rect = anchorEl.getBoundingClientRect()
    } else {
      // anchor='viewport' — use document body as reference
      rect = new DOMRect(0, 0, window.innerWidth, document.documentElement.scrollHeight)
    }

    targetProgress = computeScrollProgress(rect, scrollY, viewportHeight, start, end)

    if (scrubSmoothing > 0) {
      // Smooth interpolation
      const diff = targetProgress - state.progress
      state.progress += diff / Math.max(1, scrubSmoothing)
      // Snap when close enough
      if (Math.abs(diff) < 0.001) {
        state.progress = targetProgress
      }
    } else {
      state.progress = targetProgress
    }

    setEntriesProgress(state.entries, state.progress)

    if (scrubSmoothing > 0 && Math.abs(targetProgress - state.progress) > 0.001) {
      state.rafId = requestAnimationFrame(updateProgress)
    }
  }

  const onScroll = () => {
    if (state.destroyed) return
    if (state.rafId !== null) {
      cancelAnimationFrame(state.rafId)
    }
    state.rafId = requestAnimationFrame(updateProgress)
  }

  window.addEventListener('scroll', onScroll, { passive: true })
  state.scrollHandler = onScroll

  // Initial progress calculation
  updateProgress()
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export function createScrollAdapter(): MotionAdapter {
  return {
    name: 'scroll',

    canHandle(scene: AnimationScene): boolean {
      return scene.trigger.type === 'scroll'
    },

    setup(scene: AnimationScene, targets: ResolvedTargets, _motionHints?: unknown, compiledEntries?: CompiledEntry[]): AdapterInstance {
      const instanceId = `scroll-${scene.id}`

      const state: ScrollAdapterState = {
        scene,
        targets,
        entries: [],
        scrollHandler: null,
        rafId: null,
        nativeTimeline: null,
        progress: 0,
        destroyed: false,
        pinCleanup: null,
      }

      stateMap.set(instanceId, state)

      // Build per-entry states (WAAPI animations + sidecars)
      state.entries = buildEntryStates(scene, targets, compiledEntries)

      if (state.entries.length === 0) {
        return { id: instanceId, adapterName: 'scroll' }
      }

      const anchorEl = resolveAnchorElement(scene, targets)

      // Pin support: apply sticky positioning when pin: true
      const trigger = scene.trigger as ScrollTrigger
      if (trigger.pin && anchorEl) {
        // Compute scroll range from start/end anchors to determine pin duration
        const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800
        const scrollRange = viewportHeight // default pin duration = one viewport height
        state.pinCleanup = applyPinStyles(anchorEl, scrollRange)
      }

      if (typeof window !== 'undefined') {
        setupFallbackScroll(state, anchorEl)
      }

      return { id: instanceId, adapterName: 'scroll' }
    },

    destroy(instance: AdapterInstance): void {
      const state = stateMap.get(instance.id)
      if (!state) return

      state.destroyed = true

      // Clean up pin styles
      if (state.pinCleanup) {
        state.pinCleanup()
        state.pinCleanup = null
      }

      if (state.scrollHandler && typeof window !== 'undefined') {
        window.removeEventListener('scroll', state.scrollHandler)
        state.scrollHandler = null
      }

      if (state.rafId !== null) {
        cancelAnimationFrame(state.rafId)
        state.rafId = null
      }

      for (const entry of state.entries) {
        entry.animation?.cancel()
        for (const sidecar of entry.sidecars) {
          sidecar.destroy()
        }
      }
      state.entries = []

      stateMap.delete(instance.id)
    },

    play(instance: AdapterInstance): void {
      const state = stateMap.get(instance.id)
      if (!state) return

      for (const entry of state.entries) {
        entry.animation?.play()
      }
    },

    pause(instance: AdapterInstance): void {
      const state = stateMap.get(instance.id)
      if (!state) return

      for (const entry of state.entries) {
        entry.animation?.pause()
      }
    },

    scrub(instance: AdapterInstance, progress: number): void {
      const state = stateMap.get(instance.id)
      if (!state) return

      const clamped = Math.max(0, Math.min(1, progress))
      state.progress = clamped
      setEntriesProgress(state.entries, clamped)
    },
  }
}

// ---------------------------------------------------------------------------
// ScrollAnchor parsing — converts GSAP-style shorthand to structured format
// ---------------------------------------------------------------------------

/**
 * Parse a ScrollAnchor value that may be either:
 * - A structured object: { edge: 'top', viewport: 0.85 }
 * - A GSAP-style shorthand string: "top top", "bottom 20%", "center 80%"
 *
 * Shorthand format: "<element-edge> <viewport-position>"
 * Element edge: top | center | bottom
 * Viewport position: top (=0) | center (=0.5) | bottom (=1) | N% (=N/100)
 */
export function parseScrollAnchor(input: ScrollAnchor | string): ScrollAnchor {
  if (typeof input === 'object' && input !== null && 'edge' in input) {
    return input as ScrollAnchor
  }
  if (typeof input !== 'string') {
    return { edge: 'top', viewport: 0 }
  }
  const parts = input.trim().split(/\s+/)
  const edgePart = (parts[0] || 'top').toLowerCase()
  const vpPart = (parts[1] || 'top').toLowerCase()

  const edge: ScrollAnchor['edge'] =
    edgePart === 'center' ? 'center' :
    edgePart === 'bottom' ? 'bottom' : 'top'

  let viewport: number
  if (vpPart === 'top') viewport = 0
  else if (vpPart === 'center') viewport = 0.5
  else if (vpPart === 'bottom') viewport = 1
  else if (vpPart.endsWith('%')) viewport = parseFloat(vpPart) / 100
  else viewport = parseFloat(vpPart) || 0

  return { edge, viewport }
}
