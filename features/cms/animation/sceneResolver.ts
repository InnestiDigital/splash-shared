import type {
  AnimationScene,
  AnimationEntry,
  ChoreographyMeta,
  Keyframe,
  MotionAdapter,
  ReducedMotionMode,
} from '~/shared/types/animation'

// Theme-level motion defaults
export interface ThemeMotionDefaults {
  defaultDuration?: number
  defaultEasing?: string
  reducedMotion?: ReducedMotionMode
  defaultEntrance?: string
  motionScale?: number
  scrollOffset?: { edge: string; viewport: number }
}

// System defaults (hardcoded fallbacks)
export const SYSTEM_DEFAULTS = {
  duration: 500,
  easing: 'cubic-bezier(.25,.1,.25,1)', // "Gentle" — spec Section 6
} as const

/**
 * Step 1.5: Apply section-level choreography delays to animation entries.
 *
 * Given a section's `choreographyMeta` config and the visual block order,
 * writes absolute start delays (via `entry.position = { type: 'absolute', ms }`)
 * so that blocks in the section reveal as a coordinated sequence.
 *
 * Absolute `position.ms` is consumed by the adapters as the per-entry start
 * delay (added to any explicit stagger). Choreography uses this channel
 * (rather than `staggerGroup`/`staggerDelay`) because `computeStaggerDelays`
 * multiplies by group-index — only suitable for linear patterns — whereas
 * wave mode requires a sinusoidal curve expressible only as absolute offsets.
 *
 * Precedence: entries with explicit stagger or non-zero `position.ms` are
 * never overridden — choreography only fills in entries with no explicit
 * timing.
 */
export function applyChoreographyDelays(
  entries: AnimationEntry[],
  choreography: ChoreographyMeta | null | undefined,
  sectionId: string,
  orderedBlockIds: string[],
): AnimationEntry[] {
  if (!choreography || choreography.mode === 'none') return entries
  void sectionId // reserved for future per-section grouping
  if (entries.length === 0) return entries

  const total = orderedBlockIds.length
  if (total === 0) return entries

  // Reverse for bottom-up so index 0 = last visual block
  const effectiveOrder = choreography.order === 'bottom-up'
    ? [...orderedBlockIds].reverse()
    : orderedBlockIds

  const blockIndex = new Map<string, number>()
  for (let i = 0; i < effectiveOrder.length; i++) {
    blockIndex.set(effectiveOrder[i], i)
  }

  const { mode, baseDelay } = choreography

  const hasExplicitTiming = (entry: AnimationEntry): boolean => {
    if (entry.staggerGroup != null && entry.staggerDelay != null) return true
    if (entry.position.type === 'absolute' && entry.position.ms !== 0) return true
    if (entry.position.type === 'after-entry') return true
    return false
  }

  const computeDelayFor = (index: number): number => {
    switch (mode) {
      case 'simultaneous':
        return 0
      case 'stagger':
        return Math.max(0, Math.round(index * baseDelay))
      case 'wave': {
        // Sinusoidal curve: peaks near center of sequence.
        // delay(i) = baseDelay * i + sin(i * PI / total) * amplitude
        if (total <= 1) return 0
        const amplitude = Math.max(1, Math.round(baseDelay * 0.75))
        const sineOffset = Math.sin((index * Math.PI) / total) * amplitude
        return Math.max(0, Math.round(index * baseDelay + sineOffset))
      }
      default:
        return 0
    }
  }

  for (const entry of entries) {
    if (entry.target.entityType !== 'block') continue
    const idx = blockIndex.get(entry.target.entityId)
    if (idx === undefined) continue // entry targets a block outside the section
    if (hasExplicitTiming(entry)) continue
    entry.position = { type: 'absolute', ms: computeDelayFor(idx) }
  }

  return entries
}

/**
 * Step 2: Resolve inherited defaults.
 * Cascade: entry → scene.defaults → theme → system.
 */
export function resolveEntryDefaults(
  entry: AnimationEntry,
  scene: AnimationScene,
  theme: ThemeMotionDefaults,
): { duration: number; easing: string } {
  return {
    duration:
      entry.duration ??
      scene.defaults?.duration ??
      theme.defaultDuration ??
      SYSTEM_DEFAULTS.duration,
    easing:
      entry.easing ??
      scene.defaults?.easing ??
      theme.defaultEasing ??
      SYSTEM_DEFAULTS.easing,
  }
}

/**
 * Step 3: Resolve reduced-motion substitutions.
 * Given resolved reduced-motion mode, transform entry keyframes accordingly.
 */
export function applyReducedMotion(
  entry: AnimationEntry,
  resolvedDefaults: { duration: number; easing: string },
  mode: ReducedMotionMode,
): { keyframes: Keyframe[]; duration: number } {
  switch (mode) {
    case 'skip':
      // Empty keyframes — entry won't play
      return { keyframes: [], duration: 0 }

    case 'instant': {
      // Apply final keyframe state immediately, strip vars (no interpolation)
      if (entry.keyframes.length === 0) return { keyframes: [], duration: 0 }
      const finalFrame = entry.keyframes[entry.keyframes.length - 1]
      const { vars: _vars, ...finalNoVars } = finalFrame
      return {
        keyframes: [
          { ...finalNoVars, offset: 0 },
          { ...finalNoVars, offset: 1 },
        ],
        duration: 0,
      }
    }

    case 'fade-only': {
      // Replace with simple opacity 0→1, 200ms
      // Preserve color and backgroundColor from last keyframe for end-state correctness
      // Vars are removed (no interpolation in reduced motion)
      const lastKf = entry.keyframes[entry.keyframes.length - 1]
      const endFrame: Keyframe = { offset: 1, opacity: 1 }
      if (lastKf?.color !== undefined) endFrame.color = lastKf.color
      if (lastKf?.backgroundColor !== undefined) endFrame.backgroundColor = lastKf.backgroundColor
      return {
        keyframes: [
          { offset: 0, opacity: 0 },
          endFrame,
        ],
        duration: 200,
      }
    }
  }
}

/**
 * Step 4: Apply motionScale to keyframes.
 * Scales transform distances (x, y, scale deviation from 1, rotate), and blur amounts.
 * Does NOT affect opacity or clipPath.
 * motionScale=1.0 → no change. motionScale=0.5 → halves distances.
 * motionScale=0 → collapses transforms to identity but keeps opacity transitions.
 */
export function applyMotionScale(keyframes: Keyframe[], scale: number): Keyframe[] {
  if (scale === 1) return keyframes

  return keyframes.map((kf) => {
    const result: Keyframe = { offset: kf.offset }

    // Preserve opacity unchanged
    if (kf.opacity !== undefined) {
      result.opacity = kf.opacity
    }

    // Preserve clipPath unchanged
    if (kf.clipPath !== undefined) {
      result.clipPath = kf.clipPath
    }

    // Scale transform properties
    if (kf.transform) {
      const t = kf.transform
      const scaled: Keyframe['transform'] = {}

      if (t.x !== undefined) {
        scaled.x = scaleDistanceValue(t.x, scale)
      }
      if (t.y !== undefined) {
        scaled.y = scaleDistanceValue(t.y, scale)
      }
      if (t.scale !== undefined) {
        // scale property = deviation from 1.0
        const deviation = t.scale - 1
        scaled.scale = 1 + deviation * scale
      }
      if (t.rotate !== undefined) {
        scaled.rotate = scaleDistanceValue(t.rotate, scale)
      }

      result.transform = scaled
    }

    // Scale blur
    if (kf.blur !== undefined) {
      result.blur = scaleDistanceValue(kf.blur, scale)
    }

    return result
  })
}

/**
 * Scale a CSS distance value (e.g. '40px', '-15%', '-3deg') by a factor.
 * Returns the scaled string with the same unit.
 */
function scaleDistanceValue(value: string, scale: number): string {
  const match = value.match(/^(-?[\d.]+)(.*)$/)
  if (!match) return value
  const num = parseFloat(match[1])
  const unit = match[2]
  const scaled = num * scale
  // Avoid -0
  const result = Object.is(scaled, -0) ? 0 : scaled
  return `${result}${unit}`
}

/**
 * Step 5: Normalize keyframes.
 * Ensures keyframes are sorted by offset and have 0/1 endpoints.
 */
export function normalizeKeyframes(keyframes: Keyframe[]): Keyframe[] {
  if (keyframes.length === 0) return []

  const sorted = [...keyframes].sort((a, b) => a.offset - b.offset)

  // Ensure offset 0 exists
  if (sorted[0].offset !== 0) {
    sorted.unshift({ offset: 0 })
  }
  // Ensure offset 1 exists
  if (sorted[sorted.length - 1].offset !== 1) {
    sorted.push({ offset: 1 })
  }

  return sorted
}

/**
 * Step 6: Choose adapter.
 * Checks adapters in priority order, returns first that canHandle.
 */
export function chooseAdapter(
  scene: AnimationScene,
  adapters: MotionAdapter[],
): MotionAdapter | null {
  for (const adapter of adapters) {
    if (adapter.canHandle(scene)) return adapter
  }
  return null
}
