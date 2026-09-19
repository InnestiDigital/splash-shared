import type {
  AnimationScene,
  AnimationEntry,
  ReducedMotionMode,
  IntersectionTrigger,
  ScrollTrigger,
} from '~/shared/types/animation'
import { applyReducedMotion } from './sceneResolver'

/**
 * Downgrade an entire scene for reduced-motion preferences.
 *
 * Scene-level downgrades go beyond per-entry keyframe substitution:
 * - Scrubbed parallax (scroll + scrub) → intersection entrance reveal
 * - Pinned sequences (scroll + pin) → unpinned with instant/minimal-fade entries
 * - Hover events → stripped (empty entries)
 * - Other scenes → per-entry applyReducedMotion treatment
 */
export function downgradeScene(
  scene: AnimationScene,
  mode: ReducedMotionMode,
): AnimationScene {
  const trigger = scene.trigger

  // Hover scenes: always strip all entries under any reduced-motion mode
  if (trigger.type === 'event' && trigger.event === 'hover') {
    return { ...scene, entries: [] }
  }

  // Scrubbed parallax: scroll trigger with scrub enabled
  if (trigger.type === 'scroll' && trigger.scrub) {
    return downgradeScrubbedParallax(scene, trigger, mode)
  }

  // Pinned sequence: scroll trigger with pin enabled
  if (trigger.type === 'scroll' && trigger.pin) {
    return downgradePinnedScene(scene, trigger, mode)
  }

  // All other scenes: apply per-entry reduced-motion substitution
  return downgradeEntries(scene, mode)
}

/**
 * Scrubbed parallax → intersection entrance reveal.
 * Replace scroll trigger with intersection, strip scrub/pin, replace keyframes.
 */
function downgradeScrubbedParallax(
  scene: AnimationScene,
  scrollTrigger: ScrollTrigger,
  mode: ReducedMotionMode,
): AnimationScene {
  if (mode === 'skip') {
    return { ...scene, entries: [] }
  }

  // Build intersection trigger from scroll anchor
  const anchor =
    scrollTrigger.anchor === 'viewport'
      ? scene.entries[0]?.target ?? { entityType: 'block' as const, entityId: 'unknown', part: 'root' }
      : scrollTrigger.anchor

  const intersectionTrigger: IntersectionTrigger = {
    type: 'intersection',
    anchor,
    once: true,
  }

  // Replace entry keyframes with simple fade-in
  // Preserve color and backgroundColor from last original keyframe for end-state correctness
  const entries: AnimationEntry[] = scene.entries.map((entry) => {
    const lastKf = entry.keyframes[entry.keyframes.length - 1]
    const endFrame: AnimationEntry['keyframes'][0] = { offset: 1, opacity: 1 }
    if (lastKf?.color !== undefined) endFrame.color = lastKf.color
    if (lastKf?.backgroundColor !== undefined) endFrame.backgroundColor = lastKf.backgroundColor
    return {
      ...entry,
      keyframes: [
        { offset: 0, opacity: 0 },
        endFrame,
      ],
      duration: 200,
    }
  })

  return {
    ...scene,
    trigger: intersectionTrigger,
    entries,
  }
}

/**
 * Pinned sequence → unpinned with instant final states or minimal fades.
 */
function downgradePinnedScene(
  scene: AnimationScene,
  scrollTrigger: ScrollTrigger,
  mode: ReducedMotionMode,
): AnimationScene {
  // Remove pin flag from trigger
  const unpinnedTrigger: ScrollTrigger = {
    ...scrollTrigger,
    pin: false,
  }

  // Apply per-entry reduced-motion treatment
  const entries: AnimationEntry[] = scene.entries.map((entry) => {
    const result = applyReducedMotion(
      entry,
      { duration: entry.duration ?? 500, easing: entry.easing ?? 'ease' },
      mode,
    )
    return {
      ...entry,
      keyframes: result.keyframes,
      duration: result.duration,
    }
  })

  return {
    ...scene,
    trigger: unpinnedTrigger,
    entries,
  }
}

/**
 * Generic per-entry downgrade for non-scroll, non-hover scenes.
 */
function downgradeEntries(
  scene: AnimationScene,
  mode: ReducedMotionMode,
): AnimationScene {
  // In skip mode, filter out entries that have ONLY vars (no visual properties)
  const filteredEntries = mode === 'skip'
    ? scene.entries.filter((entry) => !isVarsOnlyEntry(entry))
    : scene.entries

  const entries: AnimationEntry[] = filteredEntries.map((entry) => {
    const result = applyReducedMotion(
      entry,
      { duration: entry.duration ?? 500, easing: entry.easing ?? 'ease' },
      mode,
    )
    return {
      ...entry,
      keyframes: result.keyframes,
      duration: result.duration,
    }
  })

  return { ...scene, entries }
}

/**
 * Check if an entry's keyframes contain ONLY vars (no opacity, transform, blur, clipPath, color, backgroundColor).
 */
function isVarsOnlyEntry(entry: AnimationEntry): boolean {
  if (entry.keyframes.length === 0) return false
  return entry.keyframes.every((kf) => {
    const hasVisual =
      kf.opacity !== undefined ||
      kf.transform !== undefined ||
      kf.blur !== undefined ||
      kf.clipPath !== undefined ||
      kf.color !== undefined ||
      kf.backgroundColor !== undefined
    return !hasVisual && kf.vars !== undefined
  })
}
