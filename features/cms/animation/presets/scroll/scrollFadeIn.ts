import type { PresetOutput } from '../types'

/**
 * Scroll Fade In — monotonic scrub-driven opacity 0 → 1.
 *
 * Sibling of `fadeThrough` (0 → 1 → 0) but without the trailing fade-out.
 * As the element scrolls into range, opacity rises from 0 to 1. Scrolling
 * back up reverses it (0-to-1 → 1-to-0) because scrub position follows
 * scroll. Once past the range on the way down, opacity stays at 1.
 *
 * Trade-off inherited from the scroll adapter: offset:0 applies at mount,
 * so the element is rendered with opacity:0 until the scrub range begins.
 * This is the intended "reveal-on-scroll-in-that-rewinds-on-scroll-back"
 * behaviour; the top-of-page visibility cost is explicit.
 */
export function scrollFadeIn(): PresetOutput {
  return {
    keyframes: [
      { offset: 0, opacity: 0 },
      { offset: 1, opacity: 1 },
    ],
    presetId: 'scroll-fade-in',
    presetVersion: '1.0',
  }
}
