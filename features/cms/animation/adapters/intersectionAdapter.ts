import type {
  MotionAdapter,
  AnimationScene,
  AnimationEntry,
  ResolvedTargets,
  AdapterInstance,
  Keyframe,
  MotionHints,
} from '~/shared/types/animation'
import type { CompiledEntry } from '../compileScene'
import { computeStaggerDelays } from '../presets/stagger'
import { applyFinalVarState } from '../varAnimator'

// ---------------------------------------------------------------------------
// Entry chaining: topological sort + delay resolution
// ---------------------------------------------------------------------------

interface ResolvedEntryOrder {
  order: AnimationEntry[]
  delays: Map<string, number>
  warnings: string[]
}

/**
 * Resolve entry play order and cumulative delays from after-entry positions.
 *
 * Builds a dependency graph from after-entry references, topologically sorts,
 * and computes cumulative delays. Cycles are broken by treating the back-edge
 * entry as { type: 'absolute', ms: 0 }. Non-existent entry references are
 * treated the same way.
 */
export function resolveEntryOrder(
  entries: AnimationEntry[],
  sceneDuration?: number,
): ResolvedEntryOrder {
  const warnings: string[] = []
  const delays = new Map<string, number>()
  const entryMap = new Map<string, AnimationEntry>()

  for (const entry of entries) {
    entryMap.set(entry.id, entry)
  }

  // Build adjacency: dependencyOf[entryId] = id of entry it depends on
  const dependsOn = new Map<string, string>()

  for (const entry of entries) {
    if (entry.position.type === 'after-entry') {
      const depId = entry.position.entryId
      if (!entryMap.has(depId)) {
        warnings.push(
          `Entry "${entry.id}" references non-existent entry "${depId}" — treating as absolute 0`,
        )
        // Will be treated as absolute 0 below
      } else {
        dependsOn.set(entry.id, depId)
      }
    }
  }

  // Detect cycles using DFS coloring (white=unvisited, gray=in-stack, black=done)
  const WHITE = 0, GRAY = 1, BLACK = 2
  const color = new Map<string, number>()
  for (const entry of entries) {
    color.set(entry.id, WHITE)
  }

  const cycleBreaks = new Set<string>()

  function dfs(id: string): void {
    color.set(id, GRAY)
    const dep = dependsOn.get(id)
    if (dep) {
      const depColor = color.get(dep) ?? BLACK
      if (depColor === GRAY) {
        // Back edge — cycle detected; break it at the current entry
        warnings.push(
          `Circular dependency detected: entry "${id}" → "${dep}" — breaking cycle, treating "${id}" as absolute 0`,
        )
        cycleBreaks.add(id)
        dependsOn.delete(id)
      } else if (depColor === WHITE) {
        dfs(dep)
      }
    }
    color.set(id, BLACK)
  }

  for (const entry of entries) {
    if (color.get(entry.id) === WHITE) {
      dfs(entry.id)
    }
  }

  // Topological sort via Kahn's algorithm
  const inDegree = new Map<string, number>()
  for (const entry of entries) {
    inDegree.set(entry.id, 0)
  }
  for (const [childId, parentId] of dependsOn) {
    inDegree.set(childId, (inDegree.get(childId) ?? 0) + 1)
  }

  const queue: string[] = []
  for (const entry of entries) {
    if ((inDegree.get(entry.id) ?? 0) === 0) {
      queue.push(entry.id)
    }
  }

  const sorted: string[] = []
  while (queue.length > 0) {
    const id = queue.shift()!
    sorted.push(id)

    // Find entries that depend on this one
    for (const [childId, parentId] of dependsOn) {
      if (parentId === id) {
        const deg = (inDegree.get(childId) ?? 1) - 1
        inDegree.set(childId, deg)
        if (deg === 0) {
          queue.push(childId)
        }
      }
    }
  }

  // Compute delays
  const defaultDuration = sceneDuration ?? 500

  for (const id of sorted) {
    const entry = entryMap.get(id)!
    const pos = entry.position

    if (pos.type === 'absolute') {
      delays.set(id, pos.ms)
    } else if (pos.type === 'after-entry') {
      if (cycleBreaks.has(id) || !entryMap.has(pos.entryId)) {
        // Cycle-broken or non-existent ref — treat as absolute 0
        delays.set(id, 0)
      } else {
        const depDelay = delays.get(pos.entryId) ?? 0
        const depEntry = entryMap.get(pos.entryId)!
        const depDuration = depEntry.duration ?? defaultDuration
        delays.set(id, depDelay + depDuration + pos.offsetMs)
      }
    }
  }

  // Build ordered entry list
  const order = sorted.map((id) => entryMap.get(id)!)

  return { order, delays, warnings }
}

// ---------------------------------------------------------------------------
// Internal state management
// ---------------------------------------------------------------------------

interface IntersectionAdapterState {
  observer: IntersectionObserver | null
  animations: Animation[]
  scene: AnimationScene
  targets: ResolvedTargets
  compiledEntries?: CompiledEntry[]
  /** Entrance targets pre-hidden at setup (inline first-keyframe styles). */
  preStyled: Array<{ el: HTMLElement; props: string[] }>
}

/**
 * Remove the inline pre-hide styles applied at setup. Called when the
 * animations take over (they own the visuals from time 0 via fill:'both')
 * and on destroy (so a removed scene never leaves targets invisible).
 */
function clearPreStyles(state: IntersectionAdapterState): void {
  for (const { el, props } of state.preStyled) {
    for (const prop of props) {
      el.style.removeProperty(prop === 'clipPath' ? 'clip-path' : prop)
    }
  }
  state.preStyled = []
}

const stateMap = new Map<string, IntersectionAdapterState>()

// ---------------------------------------------------------------------------
// WAAPI keyframe conversion
// ---------------------------------------------------------------------------

/**
 * Convert a spec Keyframe to a WAAPI-compatible PropertyIndexedKeyframes entry.
 * - transform.x/y/scale/rotate → composed `transform` string
 * - blur → `filter: blur(X)`
 * - clipPath → `clipPath`
 * - opacity → `opacity`
 */
export function toWaapiKeyframe(kf: Keyframe): globalThis.Keyframe {
  const result: globalThis.Keyframe = { offset: kf.offset }

  if (kf.opacity !== undefined) {
    result.opacity = kf.opacity
  }

  if (kf.transform) {
    const parts: string[] = []
    if (kf.transform.x !== undefined) parts.push(`translateX(${kf.transform.x})`)
    if (kf.transform.y !== undefined) parts.push(`translateY(${kf.transform.y})`)
    if (kf.transform.scale !== undefined) parts.push(`scale(${kf.transform.scale})`)
    if (kf.transform.rotate !== undefined) parts.push(`rotate(${kf.transform.rotate})`)
    if (parts.length > 0) {
      result.transform = parts.join(' ')
    }
  }

  if (kf.blur !== undefined) {
    result.filter = `blur(${kf.blur})`
  }

  if (kf.clipPath !== undefined) {
    result.clipPath = kf.clipPath
  }

  return result
}

/**
 * Convert an array of spec Keyframes to WAAPI format.
 */
export function toWaapiKeyframes(keyframes: Keyframe[]): globalThis.Keyframe[] {
  return keyframes.map(toWaapiKeyframe)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function resolveAnchorElement(
  scene: AnimationScene,
  targets: ResolvedTargets,
): HTMLElement | null {
  if (scene.trigger.type !== 'intersection') return null
  const anchor = scene.trigger.anchor
  const resolved = targets[anchor.part]
  if (!resolved) return null
  if (Array.isArray(resolved)) return resolved[0] ?? null
  return resolved
}

function playEntry(
  entry: AnimationEntry,
  targets: ResolvedTargets,
  scene: AnimationScene,
  staggerDelay: number = 0,
): Animation | null {
  const el = resolveTargetElement(entry, targets)
  if (!el) return null

  const waapiKeyframes = toWaapiKeyframes(entry.keyframes)
  if (waapiKeyframes.length === 0) return null

  const duration = entry.duration ?? scene.defaults?.duration ?? 500
  const easing = entry.easing ?? scene.defaults?.easing ?? 'cubic-bezier(.25,.1,.25,1)'

  const animation = el.animate(waapiKeyframes, {
    duration,
    easing,
    // 'both', not 'forwards': with a stagger/chaining delay the element must
    // hold the FIRST keyframe (e.g. opacity 0) during the delay. fill:
    // 'forwards' left it at its natural fully-visible state until the delay
    // elapsed, producing a visible → blink-out → fade-in flash on every
    // staggered entrance (SPL-117).
    fill: 'both',
    delay: staggerDelay,
  })

  return animation
}

// ---------------------------------------------------------------------------
// Adapter deps
// ---------------------------------------------------------------------------

export interface IntersectionAdapterDeps {
  onEntryStarted:  (sceneId: string, entryId: string) => void
  onEntryFinished: (sceneId: string, entryId: string) => void
  onEntryCanceled: (sceneId: string, entryId: string) => void
  isEntrancePreset: (presetId: string | undefined) => boolean
}

const noopDeps: IntersectionAdapterDeps = {
  onEntryStarted:  () => {},
  onEntryFinished: () => {},
  onEntryCanceled: () => {},
  isEntrancePreset: () => false,
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export function createIntersectionAdapter(deps: IntersectionAdapterDeps = noopDeps): MotionAdapter {
  return {
    name: 'intersection',

    canHandle(scene: AnimationScene): boolean {
      return scene.trigger.type === 'intersection'
    },

    setup(scene: AnimationScene, targets: ResolvedTargets, motionHints?: MotionHints, compiledEntries?: CompiledEntry[]): AdapterInstance {
      const instance: AdapterInstance = {
        id: `intersection-${scene.id}`,
        adapterName: 'intersection',
      }

      const state: IntersectionAdapterState = {
        observer: null,
        animations: [],
        scene,
        targets,
        compiledEntries,
        preStyled: [],
      }

      const anchorEl = resolveAnchorElement(scene, targets)
      if (!anchorEl) {
        stateMap.set(instance.id, state)
        return instance
      }

      const trigger = scene.trigger
      const threshold = trigger.type === 'intersection' ? (trigger.threshold ?? 0) : 0
      const once = trigger.type === 'intersection' ? (trigger.once ?? false) : false

      // Pre-hide entrance targets: from mount until the IntersectionObserver
      // fires, hold each entry's FIRST keyframe as inline style. Without this,
      // targets render at their natural (fully visible) state and then re-run
      // their entrance when the observer triggers — visible → flash → fade,
      // most obvious for blocks inside the initial viewport. Mirrors what the
      // legacy useSectionReveal did with setInitialState. Entrance-preset,
      // once-triggered entries only — anything else must not be pre-hidden.
      if (once) {
        for (const entry of scene.entries) {
          if (!deps.isEntrancePreset(entry.presetId)) continue
          const el = resolveTargetElement(entry, targets)
          if (!el) continue
          const first = toWaapiKeyframes(entry.keyframes)[0]
          if (!first) continue
          const props: string[] = []
          for (const key of ['opacity', 'transform', 'filter', 'clipPath'] as const) {
            if (first[key] !== undefined) {
              el.style.setProperty(key === 'clipPath' ? 'clip-path' : key, String(first[key]))
              props.push(key)
            }
          }
          if (props.length) state.preStyled.push({ el, props })
        }
      }

      // Ratio-based thresholds are unreachable for anchors taller than the
      // viewport: their max intersectionRatio (vh / anchorHeight) can stay
      // below `threshold`, so a single-threshold observer never fires and the
      // scene's entrance targets are stranded pre-hidden (entrance-tall-sections).
      // Observe at [0, threshold] and let a very tall anchor (> 70% of the
      // viewport) trigger on any intersection; normal anchors keep firing at
      // the configured threshold, so their timing is unchanged.
      const thresholds = threshold > 0 ? [0, threshold] : [0]
      const ioOptions: IntersectionObserverInit = { threshold: thresholds }
      if (motionHints?.intersectionRoot) {
        ioOptions.root = motionHints.intersectionRoot
      }

      const observer = new IntersectionObserver(
        (entries) => {
          const vh = typeof window !== 'undefined'
            ? (window.innerHeight || document.documentElement.clientHeight || 0)
            : 0
          for (const ioEntry of entries) {
            if (!ioEntry.isIntersecting) continue
            // Tall anchors reveal on any intersection; normal anchors wait for
            // the configured ratio (the observer also reports the 0 crossing).
            const isTall = vh > 0 && ioEntry.boundingClientRect.height > vh * 0.7
            if (!isTall && threshold > 0 && ioEntry.intersectionRatio < threshold) continue

            // Resolve entry order (topological sort for after-entry chaining)
            const defaultDuration = scene.defaults?.duration ?? 500
            const entranceDelay = scene.defaults?.entranceDelay ?? 0
            const { order, delays: chainingDelays, warnings } = resolveEntryOrder(scene.entries, defaultDuration)

            // Log any cycle/reference warnings
            for (const w of warnings) {
              console.warn(`[animation] ${w}`)
            }

            // Compute stagger delays for all entries
            const staggerDelays = computeStaggerDelays(order)

            // Play entries in resolved order with combined delays
            for (const animEntry of order) {
              const chainDelay = chainingDelays.get(animEntry.id) ?? 0
              const staggerDelay = staggerDelays.get(animEntry.id) ?? 0
              const anim = playEntry(animEntry, targets, scene, entranceDelay + chainDelay + staggerDelay)
              if (anim) {
                state.animations.push(anim)
                if (deps.isEntrancePreset(animEntry.presetId)) {
                  deps.onEntryStarted(scene.id, animEntry.id)
                  anim.addEventListener('finish', () => deps.onEntryFinished(scene.id, animEntry.id), { once: true })
                  anim.addEventListener('cancel', () => deps.onEntryCanceled(scene.id, animEntry.id), { once: true })
                }
              }

              // Snap CSS custom properties to final state (fire-and-forget)
              if (state.compiledEntries) {
                const compiled = state.compiledEntries.find(ce => ce.source.id === animEntry.id)
                if (compiled?.compiled.varTracks) {
                  const el = resolveTargetElement(animEntry, targets)
                  if (el) applyFinalVarState(el, compiled.compiled.varTracks)
                }
              }
            }

            // Animations own the visuals from time 0 (fill:'both' covers
            // stagger delays) — drop the setup pre-hide styles.
            clearPreStyles(state)

            if (once) {
              observer.unobserve(anchorEl)
            }
          }
        },
        ioOptions,
      )

      observer.observe(anchorEl)
      state.observer = observer

      stateMap.set(instance.id, state)
      return instance
    },

    destroy(instance: AdapterInstance): void {
      const state = stateMap.get(instance.id)
      if (!state) return

      if (state.observer) {
        state.observer.disconnect()
        state.observer = null
      }

      for (const anim of state.animations) {
        anim.cancel()
      }
      state.animations = []

      // Never leave targets pre-hidden after the scene is gone.
      clearPreStyles(state)

      stateMap.delete(instance.id)
    },

    play(instance: AdapterInstance): void {
      const state = stateMap.get(instance.id)
      if (!state) return

      // If animations already exist, replay them
      if (state.animations.length > 0) {
        for (const anim of state.animations) {
          anim.play()
        }
        return
      }

      // Otherwise trigger fresh playback with entry chaining
      clearPreStyles(state)
      const defaultDuration = state.scene.defaults?.duration ?? 500
      const entranceDelay = state.scene.defaults?.entranceDelay ?? 0
      const { order, delays: chainingDelays } = resolveEntryOrder(state.scene.entries, defaultDuration)
      const staggerDelays = computeStaggerDelays(order)
      for (const entry of order) {
        const chainDelay = chainingDelays.get(entry.id) ?? 0
        const staggerDelay = staggerDelays.get(entry.id) ?? 0
        const anim = playEntry(entry, state.targets, state.scene, entranceDelay + chainDelay + staggerDelay)
        if (anim) {
          state.animations.push(anim)
          if (deps.isEntrancePreset(entry.presetId)) {
            deps.onEntryStarted(state.scene.id, entry.id)
            anim.addEventListener('finish', () => deps.onEntryFinished(state.scene.id, entry.id), { once: true })
            anim.addEventListener('cancel', () => deps.onEntryCanceled(state.scene.id, entry.id), { once: true })
          }
        }

        // Snap CSS custom properties to final state (fire-and-forget)
        if (state.compiledEntries) {
          const compiled = state.compiledEntries.find(ce => ce.source.id === entry.id)
          if (compiled?.compiled.varTracks) {
            const el = resolveTargetElement(entry, state.targets)
            if (el) applyFinalVarState(el, compiled.compiled.varTracks)
          }
        }
      }
    },

    pause(instance: AdapterInstance): void {
      const state = stateMap.get(instance.id)
      if (!state) return

      for (const anim of state.animations) {
        anim.pause()
      }
    },

    scrub(_instance: AdapterInstance, _progress: number): void {
      // No-op: scrubbing not meaningful for intersection-triggered animations
    },
  }
}
