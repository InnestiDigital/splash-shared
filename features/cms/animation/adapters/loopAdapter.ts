import type {
  AnimationScene,
  AnimationEntry,
  MotionAdapter,
  AdapterInstance,
  ResolvedTargets,
  MotionHints,
} from '~/shared/types/animation'
import { presetRegistry } from '~/shared/features/cms/animation/presets'
import { loopPresets } from '~/shared/features/cms/animation/presets/loop'
import { toWAAPIKeyframes } from './keyframeUtils'

export interface LoopAdapterDeps {
  subscribeTarget: (blockId: string, part: string, handler: (el: Element | null) => void, itemIndex?: number) => () => void
  subscribeTargetAll: (blockId: string, part: string, handler: (els: Element[]) => void) => () => void
  subscribeEntranceActive: (blockId: string, part: string, handler: (active: boolean) => void) => () => void
}

interface EntryState {
  entryId: string
  blockId: string
  targetPart: string
  itemIndex?: number
  currentElement: Element | null
  animation: Animation | null
  visible: boolean
  entranceActive: boolean
  unsubscribeTarget: () => void
  unsubscribeEntrance: () => void
}

interface AllEntryState {
  unsubAll: () => void
  unsubEntrance: () => void
  perElementStates: Map<Element, EntryState>
}

interface LoopAdapterState {
  io: IntersectionObserver | null
  byElement: Map<Element, EntryState[]>
  byEntry: Map<string, EntryState>
  byEntryAll: Map<string, AllEntryState>
}

const LOOP_PRESET_IDS = new Set(loopPresets.map(p => p.id))
const stateMap = new Map<string, LoopAdapterState>()

function isLoopEntry(entry: AnimationEntry): boolean {
  return entry.presetId ? LOOP_PRESET_IDS.has(entry.presetId) : false
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Adapter-scoped test accessor — internal. */
export function _getLoopAdapterState(instanceId: string): LoopAdapterState | undefined {
  return stateMap.get(instanceId)
}

export function createLoopAdapter(deps: LoopAdapterDeps): MotionAdapter {
  return {
    name: 'loop',

    canHandle(scene: AnimationScene): boolean {
      return scene.entries.some(isLoopEntry)
    },

    setup(scene: AnimationScene, _targets: ResolvedTargets, _hints?: MotionHints): AdapterInstance {
      const instanceId = `loop-${scene.id}`
      const state: LoopAdapterState = {
        io: null,
        byElement: new Map(),
        byEntry: new Map(),
        byEntryAll: new Map(),
      }
      stateMap.set(instanceId, state)

      if (prefersReducedMotion()) {
        return { id: instanceId, adapterName: 'loop' }
      }

      const io = new IntersectionObserver((ioEntries) => {
        for (const ioEntry of ioEntries) {
          const list = state.byElement.get(ioEntry.target)
          if (!list) continue
          for (const s of list) {
            s.visible = ioEntry.isIntersecting
            reconcile(s)
          }
        }
      }, { threshold: 0.01 })
      state.io = io

      function reconcile(s: EntryState): void {
        if (!s.currentElement || !s.animation) return
        const shouldPlay = s.visible && !s.entranceActive
        if (shouldPlay) {
          if (s.animation.playState !== 'running') {
            s.animation.currentTime = 0
            s.animation.play()
          }
        } else {
          if (s.animation.playState === 'running') {
            s.animation.pause()
          }
        }
      }

      function attach(s: EntryState, element: Element): void {
        if (s.currentElement) detach(s)
        s.currentElement = element

        const entry = scene.entries.find(e => e.id === s.entryId)!
        const factory = presetRegistry[entry.presetId!]
        const preset = factory()
        const kf = toWAAPIKeyframes(preset.keyframes)
        const effect = new KeyframeEffect(element, kf, {
          duration: preset.duration ?? 2000,
          easing: preset.easing ?? 'ease-in-out',
          iterations: Infinity,
          fill: 'none',
        })
        s.animation = new Animation(effect)

        io.observe(element)
        let arr = state.byElement.get(element)
        if (!arr) { arr = []; state.byElement.set(element, arr) }
        arr.push(s)

        reconcile(s)
      }

      function detach(s: EntryState): void {
        if (s.currentElement) {
          const arr = state.byElement.get(s.currentElement)
          if (arr) {
            const idx = arr.indexOf(s)
            if (idx >= 0) arr.splice(idx, 1)
            if (arr.length === 0) {
              state.byElement.delete(s.currentElement)
              io.unobserve(s.currentElement)
            }
          } else {
            io.unobserve(s.currentElement)
          }
        }
        s.animation?.cancel()
        s.animation = null
        s.currentElement = null
      }

      // Wire per loop entry (entrance subscribe BEFORE target subscribe per spec)
      for (const entry of scene.entries) {
        if (!isLoopEntry(entry)) continue
        if (entry.target.entityType !== 'block') continue

        const blockId = entry.target.entityId
        const targetPart = entry.target.part
        const hasItemIndex = entry.target.itemIndex !== undefined

        if (hasItemIndex) {
          // Per-index path: single element subscription (existing behavior)
          const s: EntryState = {
            entryId: entry.id,
            blockId,
            targetPart,
            itemIndex: entry.target.itemIndex,
            currentElement: null,
            animation: null,
            visible: false,
            entranceActive: false,
            unsubscribeTarget: () => {},
            unsubscribeEntrance: () => {},
          }

          // Subscribe entrance FIRST so initial reconcile has correct entranceActive
          s.unsubscribeEntrance = deps.subscribeEntranceActive(blockId, targetPart, (active) => {
            s.entranceActive = active
            reconcile(s)
          })

          s.unsubscribeTarget = deps.subscribeTarget(blockId, targetPart, (el) => {
            if (el) attach(s, el)
            else detach(s)
          }, s.itemIndex)

          state.byEntry.set(entry.id, s)
        } else {
          // All-items path: subscribe to full element array, manage per-element states
          const perElementStates = new Map<Element, EntryState>()
          // Track current entrance state so new elements inherit it on attach
          let currentEntranceActive = false

          const unsubEntrance = deps.subscribeEntranceActive(blockId, targetPart, (active) => {
            currentEntranceActive = active
            for (const s of perElementStates.values()) {
              s.entranceActive = active
              reconcile(s)
            }
          })

          const unsubAll = deps.subscribeTargetAll(blockId, targetPart, (els) => {
            // Detach states whose element is no longer in the new array
            for (const [el, s] of perElementStates) {
              if (!els.includes(el)) {
                detach(s)
                perElementStates.delete(el)
              }
            }
            // Attach states for newly appearing elements
            for (const el of els) {
              if (!perElementStates.has(el)) {
                const s: EntryState = {
                  entryId: entry.id,
                  blockId,
                  targetPart,
                  itemIndex: undefined,
                  currentElement: null,
                  animation: null,
                  visible: false,
                  entranceActive: currentEntranceActive,
                  unsubscribeTarget: () => {},
                  unsubscribeEntrance: () => {},
                }
                attach(s, el)
                perElementStates.set(el, s)
              }
            }
          })

          state.byEntryAll.set(entry.id, { unsubAll, unsubEntrance, perElementStates })
        }
      }

      return { id: instanceId, adapterName: 'loop' }
    },

    destroy(instance: AdapterInstance): void {
      const state = stateMap.get(instance.id)
      if (!state) return
      for (const entryState of state.byEntry.values()) {
        entryState.unsubscribeTarget()
        entryState.unsubscribeEntrance()
        entryState.animation?.cancel()
      }
      for (const allState of state.byEntryAll.values()) {
        allState.unsubAll()
        allState.unsubEntrance()
        for (const s of allState.perElementStates.values()) {
          s.animation?.cancel()
        }
        allState.perElementStates.clear()
      }
      state.io?.disconnect()
      state.byElement.clear()
      state.byEntry.clear()
      state.byEntryAll.clear()
      stateMap.delete(instance.id)
    },

    play(_instance: AdapterInstance): void {},
    pause(_instance: AdapterInstance): void {},
    scrub(_instance: AdapterInstance, _progress: number): void {},
  }
}
