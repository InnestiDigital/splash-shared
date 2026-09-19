/**
 * Amplitude tiers for path presets, in pixels.
 * Fixed values (not responsive) — documented in the B2 spec.
 * Tune centrally if motion feels off; do NOT add per-preset knobs.
 */
export const AMPLITUDE = {
  sm: 24,
  md: 60,
  lg: 120,
} as const

export type AmplitudeTier = keyof typeof AMPLITUDE
