// ---------------------------------------------------------------------------
// Named easing curves
// ---------------------------------------------------------------------------

/** Standard Material-style easing — smooth deceleration. */
const EASING_GENTLE = 'cubic-bezier(.25,.1,.25,1)'

/** Snappy easing for clip-path reveals — crisp timing. */
const EASING_SNAPPY = 'cubic-bezier(.77,0,.18,1)'

/** Smooth easing for mask reveals — controlled deceleration. */
const EASING_SMOOTH = 'cubic-bezier(0.4, 0, 0.2, 1)'

/**
 * Bouncy easing — overshoots target then settles.
 * Creates a subtle bounce/spring effect on entrance animations.
 */
export const EASING_BOUNCY = 'cubic-bezier(0.34, 1.56, 0.64, 1)'

/**
 * Spring-Back easing — pulls back slightly before settling forward.
 * Approximates CSS `back` timing (Penner back.inOut). Adds anticipation
 * before the target value, useful for hover + attention-drawing entrances.
 */
export const EASING_SPRING_BACK = 'cubic-bezier(0.68, -0.55, 0.265, 1.55)'

/**
 * Elastic easing — overshoots at both ends with a pronounced wobble.
 * Good for playful, attention-grabbing entrances on editorial blocks.
 * Larger y amplitudes than Bouncy for more dramatic feel.
 */
export const EASING_ELASTIC = 'cubic-bezier(0.68, -0.6, 0.32, 1.6)'

/** All named easings with labels for editor consumption. */
export const easingPresets = [
  { id: 'gentle', value: EASING_GENTLE, label: 'Gentle' },
  { id: 'snappy', value: EASING_SNAPPY, label: 'Snappy' },
  { id: 'smooth', value: EASING_SMOOTH, label: 'Smooth' },
  { id: 'bouncy', value: EASING_BOUNCY, label: 'Bouncy' },
  { id: 'spring-back', value: EASING_SPRING_BACK, label: 'Spring Back' },
  { id: 'elastic', value: EASING_ELASTIC, label: 'Elastic' },
] as const
