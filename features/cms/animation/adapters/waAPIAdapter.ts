import type {
  MotionAdapter,
  AnimationScene,
  ResolvedTargets,
  AdapterInstance,
  EventTrigger,
  TargetRef,
} from '~/shared/types/animation'
import type { CompiledEntry } from '../compileScene'
import { toWAAPIKeyframes } from './keyframeUtils'
import { resolveEntryDefaults, SYSTEM_DEFAULTS } from '../sceneResolver'
import { computeStaggerDelays } from '../presets/stagger'
import { applyFinalVarState } from '../varAnimator'

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

interface StoredListener {
  element: EventTarget
  event: string
  handler: EventListener
}

interface WAAPIState {
  animations: Animation[]
  eventListeners: StoredListener[]
  scene: AnimationScene
  isCoarsePointer: boolean
  compiledEntries?: CompiledEntry[]
  targets: ResolvedTargets
}

const stateMap = new Map<string, WAAPIState>()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveSourceElement(
  source: TargetRef | 'page',
  targets: ResolvedTargets,
): EventTarget | null {
  if (source === 'page') return typeof document !== 'undefined' ? document : null

  const key = `${source.entityId}:${source.part}`
  const el = targets[key]
  if (Array.isArray(el)) return el[0] ?? null
  return el ?? null
}

function resolveTargetElements(targets: ResolvedTargets, scene: AnimationScene): HTMLElement[] {
  const elements: HTMLElement[] = []
  for (const entry of scene.entries) {
    const key = `${entry.target.entityId}:${entry.target.part}`
    const el = targets[key]
    if (Array.isArray(el)) {
      elements.push(...el)
    } else if (el) {
      elements.push(el)
    }
  }
  return elements
}

function playAnimations(state: WAAPIState, targets: ResolvedTargets): void {
  // Cancel any previously running animations
  for (const anim of state.animations) {
    anim.cancel()
  }
  state.animations = []

  const staggerDelays = computeStaggerDelays(state.scene.entries)

  for (const entry of state.scene.entries) {
    const key = `${entry.target.entityId}:${entry.target.part}`
    const el = targets[key]
    const elements = Array.isArray(el) ? el : el ? [el] : []

    const { duration, easing } = resolveEntryDefaults(entry, state.scene, {})
    const wapiKeyframes = toWAAPIKeyframes(entry.keyframes)
    const staggerDelay = staggerDelays.get(entry.id) ?? 0

    for (const element of elements) {
      const anim = element.animate(wapiKeyframes, {
        duration,
        easing,
        fill: 'forwards',
        delay: staggerDelay,
      })
      state.animations.push(anim)

      // Snap CSS custom properties to final state (fire-and-forget)
      if (state.compiledEntries) {
        const compiled = state.compiledEntries.find(ce => ce.source.id === entry.id)
        if (compiled?.compiled.varTracks) {
          applyFinalVarState(element, compiled.compiled.varTracks)
        }
      }
    }
  }
}

function playAnimationsReverse(state: WAAPIState, targets: ResolvedTargets): void {
  for (const anim of state.animations) {
    anim.cancel()
  }
  state.animations = []

  const staggerDelays = computeStaggerDelays(state.scene.entries)

  for (const entry of state.scene.entries) {
    const key = `${entry.target.entityId}:${entry.target.part}`
    const el = targets[key]
    const elements = Array.isArray(el) ? el : el ? [el] : []

    const { duration, easing } = resolveEntryDefaults(entry, state.scene, {})
    const wapiKeyframes = toWAAPIKeyframes(entry.keyframes)
    const staggerDelay = staggerDelays.get(entry.id) ?? 0

    for (const element of elements) {
      const anim = element.animate(wapiKeyframes, {
        duration,
        easing,
        fill: 'forwards',
        direction: 'reverse',
        delay: staggerDelay,
      })
      state.animations.push(anim)
    }
  }
}

function addListener(state: WAAPIState, element: EventTarget, event: string, handler: EventListener): void {
  element.addEventListener(event, handler)
  state.eventListeners.push({ element, event, handler })
}

function isInteractiveElement(el: EventTarget): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName.toLowerCase()
  if (['a', 'button', 'input', 'select', 'textarea'].includes(tag)) return true
  return el.hasAttribute('tabindex')
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export function createWAAPIAdapter(): MotionAdapter {
  return {
    name: 'waapi',

    canHandle(scene: AnimationScene): boolean {
      return scene.trigger.type === 'event'
    },

    setup(scene: AnimationScene, targets: ResolvedTargets, _motionHints?: unknown, compiledEntries?: CompiledEntry[]): AdapterInstance {
      const trigger = scene.trigger as EventTrigger
      const instanceId = `waapi-${scene.id}`

      const isCoarse =
        typeof window !== 'undefined' && window.matchMedia
          ? window.matchMedia('(pointer: coarse)').matches
          : false

      const state: WAAPIState = {
        animations: [],
        eventListeners: [],
        scene,
        isCoarsePointer: isCoarse,
        compiledEntries,
        targets,
      }
      stateMap.set(instanceId, state)

      switch (trigger.event) {
        case 'load': {
          playAnimations(state, targets)
          break
        }

        case 'click': {
          const source = resolveSourceElement(trigger.source, targets)
          if (source) {
            let fired = false
            const handler: EventListener = () => {
              if (trigger.once && fired) return
              fired = true
              playAnimations(state, targets)
              if (trigger.once) {
                source.removeEventListener('click', handler)
              }
            }
            addListener(state, source, 'click', handler)
          }
          break
        }

        case 'hover': {
          // Disable hover animations on coarse pointer devices
          if (isCoarse) break

          const source = resolveSourceElement(trigger.source, targets)
          if (source) {
            addListener(state, source, 'mouseenter', () => {
              playAnimations(state, targets)
            })
            addListener(state, source, 'mouseleave', () => {
              playAnimationsReverse(state, targets)
            })

            // Mirror focus-visible for accessibility on interactive elements
            if (isInteractiveElement(source)) {
              addListener(state, source, 'focusin', () => {
                playAnimations(state, targets)
              })
              addListener(state, source, 'focusout', () => {
                playAnimationsReverse(state, targets)
              })
            }
          }
          break
        }
      }

      return { id: instanceId, adapterName: 'waapi' }
    },

    destroy(instance: AdapterInstance): void {
      const state = stateMap.get(instance.id)
      if (!state) return

      for (const { element, event, handler } of state.eventListeners) {
        element.removeEventListener(event, handler)
      }
      for (const anim of state.animations) {
        anim.cancel()
      }

      stateMap.delete(instance.id)
    },

    play(instance: AdapterInstance): void {
      const state = stateMap.get(instance.id)
      if (!state) return

      for (const anim of state.animations) {
        anim.play()
      }
    },

    pause(instance: AdapterInstance): void {
      const state = stateMap.get(instance.id)
      if (!state) return

      for (const anim of state.animations) {
        anim.pause()
      }
    },

    scrub(instance: AdapterInstance, progress: number): void {
      const state = stateMap.get(instance.id)
      if (!state) return

      for (const anim of state.animations) {
        const duration = anim.effect?.getComputedTiming().duration
        if (typeof duration === 'number') {
          anim.pause()
          anim.currentTime = progress * duration
        }
      }
    },
  }
}
