import type { AnimationEntry } from '~/shared/types/animation'
import { MAX_STAGGER_ITEMS } from '../constants'

// ---------------------------------------------------------------------------
// Stagger configuration
// ---------------------------------------------------------------------------

interface StaggerConfig {
  group: string
  delay: number
  label: string
}

export const staggerSequential: StaggerConfig = {
  group: 'sequential',
  delay: 100,
  label: 'Sequential (100ms)',
}

export const staggerCascade: StaggerConfig = {
  group: 'cascade',
  delay: 80,
  label: 'Cascade (80ms)',
}

export const staggerQuick: StaggerConfig = {
  group: 'quick',
  delay: 50,
  label: 'Quick (50ms)',
}

export const staggerWave: StaggerConfig = {
  group: 'wave',
  delay: 120,
  label: 'Wave (120ms)',
}

export const staggerConfigs: StaggerConfig[] = [staggerSequential, staggerCascade, staggerQuick, staggerWave]

// ---------------------------------------------------------------------------
// Variant derivation — maps a raw delay value back to a named preset
// ---------------------------------------------------------------------------

const delayToVariant = new Map<number, string>(
  staggerConfigs.map(c => [c.delay, c.group]),
)

export function deriveStaggerVariant(delay: number): string {
  return delayToVariant.get(delay) ?? 'custom'
}

// ---------------------------------------------------------------------------
// Stagger delay computation
// ---------------------------------------------------------------------------

/**
 * Compute stagger delays for a list of entries.
 * Entries sharing the same `staggerGroup` get incremental delays based on
 * their index within that group: entry[i].delay = i * staggerDelay.
 * Entries without a staggerGroup get delay 0.
 *
 * Returns a Map from entry.id to computed delay in ms.
 */
export function computeStaggerDelays(entries: AnimationEntry[]): Map<string, number> {
  const result = new Map<string, number>()
  const groupIndexes = new Map<string, number>()

  for (const entry of entries) {
    if (entry.staggerGroup && entry.staggerDelay != null) {
      const idx = groupIndexes.get(entry.staggerGroup) ?? 0
      // Guardrail: truncate stagger groups exceeding MAX_STAGGER_ITEMS
      if (idx >= MAX_STAGGER_ITEMS) {
        // Beyond the cap — assign same delay as the last allowed item
        result.set(entry.id, (MAX_STAGGER_ITEMS - 1) * entry.staggerDelay)
      } else {
        result.set(entry.id, idx * entry.staggerDelay)
      }
      groupIndexes.set(entry.staggerGroup, idx + 1)
    } else {
      result.set(entry.id, 0)
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// Wave stagger delay computation
// ---------------------------------------------------------------------------

/**
 * Compute wave-shaped stagger delays for a list of entries.
 * Uses a sine curve so middle items are slightly more delayed than edges,
 * producing a wave-like timing pattern.
 *
 * delay = baseDelay + sin(index * PI / totalItems) * waveAmplitude
 *
 * @param entries - entries sharing the wave stagger group
 * @param baseDelay - base delay between items (default 120ms)
 * @param waveAmplitude - peak additional delay from sine offset (default 80ms)
 * @returns Map from entry.id to computed delay in ms
 */
export function computeWaveDelays(
  entries: AnimationEntry[],
  baseDelay: number = 120,
  waveAmplitude: number = 80,
): Map<string, number> {
  const result = new Map<string, number>()
  const total = entries.length

  for (let i = 0; i < total; i++) {
    const sineOffset = Math.sin((i * Math.PI) / total) * waveAmplitude
    result.set(entries[i].id, Math.round(baseDelay + sineOffset))
  }

  return result
}
