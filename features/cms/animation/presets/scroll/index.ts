/**
 * Scroll preset authoring rule
 * ----------------------------
 * Scroll-triggered animations apply their offset:0 keyframe to the element
 * from mount time, even when it sits far above the viewport — the engine
 * has no "before-range" / initial-state concept today. A scroll preset
 * whose first keyframe hides the element (`opacity: 0`, `clip-path` to 0%,
 * `visibility: hidden`) will render the block invisible at scrollY=0 until
 * the user scrolls into the range.
 *
 * DO NOT add scroll presets with a hiding offset:0 keyframe. Use an
 * `intersection` trigger for reveal-style entrances, or design scroll
 * effects with transform-only keyframes. Revisit once the engine gains
 * an initial-state schema.
 */

export { parallaxSlow } from './parallaxSlow'
export { parallaxFast } from './parallaxFast'
export { driftLeft } from './driftLeft'
export { driftRight } from './driftRight'
export { scaleOnScroll } from './scaleOnScroll'
export { fadeThrough } from './fadeThrough'
export { scrollFadeIn } from './scrollFadeIn'
export { rotateSubtle } from './rotateSubtle'
export { colorShift } from './colorShift'
export { bgFade } from './bgFade'
export { tintThrough } from './tintThrough'
export { scrollReveal } from './scrollReveal'
export { bodyReveal } from './bodyReveal'
export { accentShift } from './accentShift'
export { heroCompress } from './heroCompress'
export { titleDock } from './titleDock'
export { mediaDriftScale } from './mediaDriftScale'
export { fadeShift } from './fadeShift'

import { parallaxSlow } from './parallaxSlow'
import { parallaxFast } from './parallaxFast'
import { driftLeft } from './driftLeft'
import { driftRight } from './driftRight'
import { scaleOnScroll } from './scaleOnScroll'
import { fadeThrough } from './fadeThrough'
import { scrollFadeIn } from './scrollFadeIn'
import { rotateSubtle } from './rotateSubtle'
import { colorShift } from './colorShift'
import { bgFade } from './bgFade'
import { tintThrough } from './tintThrough'
import { scrollReveal } from './scrollReveal'
import { bodyReveal } from './bodyReveal'
import { accentShift } from './accentShift'
import { heroCompress } from './heroCompress'
import { titleDock } from './titleDock'
import { mediaDriftScale } from './mediaDriftScale'
import { fadeShift } from './fadeShift'
import type { PresetMeta } from '../types'

/**
 * Registry of all scroll preset metadata.
 * Scroll presets are scrub-driven (no duration/easing) and produce
 * continuous animations tied to scroll position.
 */
export const scrollPresets: PresetMeta[] = [
  {
    id: 'parallax-slow',
    name: 'Parallax Slow',
    group: 'safe',
    category: 'scroll',
    factory: parallaxSlow,
  },
  {
    id: 'parallax-fast',
    name: 'Parallax Fast',
    group: 'expressive',
    category: 'scroll',
    factory: parallaxFast,
  },
  {
    id: 'drift-left',
    name: 'Drift Left',
    group: 'expressive',
    category: 'scroll',
    factory: driftLeft,
  },
  {
    id: 'drift-right',
    name: 'Drift Right',
    group: 'expressive',
    category: 'scroll',
    factory: driftRight,
  },
  {
    id: 'scale-on-scroll',
    name: 'Scale On Scroll',
    group: 'safe',
    category: 'scroll',
    factory: scaleOnScroll,
  },
  {
    id: 'fade-through',
    name: 'Fade Through',
    group: 'safe',
    category: 'scroll',
    factory: fadeThrough,
  },
  {
    id: 'scroll-fade-in',
    name: 'Scroll Fade In',
    group: 'safe',
    category: 'scroll',
    factory: scrollFadeIn,
  },
  {
    id: 'rotate-subtle',
    name: 'Rotate Subtle',
    group: 'expressive',
    category: 'scroll',
    factory: rotateSubtle,
  },
  {
    id: 'color-shift',
    name: 'Color Shift',
    group: 'expressive',
    category: 'scroll',
    factory: colorShift,
  },
  {
    id: 'bg-fade',
    name: 'Background Fade',
    group: 'expressive',
    category: 'scroll',
    factory: bgFade,
  },
  {
    id: 'tint-through',
    name: 'Tint Through',
    group: 'expressive',
    category: 'scroll',
    factory: tintThrough,
  },
  {
    id: 'scroll-reveal',
    name: 'Scroll Reveal',
    group: 'safe',
    category: 'scroll',
    factory: scrollReveal,
  },
  {
    id: 'body-reveal',
    name: 'Body Reveal',
    group: 'expressive',
    category: 'scroll',
    factory: bodyReveal,
  },
  {
    id: 'accent-shift',
    name: 'Accent Shift',
    group: 'expressive',
    category: 'scroll',
    factory: accentShift,
  },
  {
    id: 'hero-compress',
    name: 'Hero Compress',
    group: 'expressive',
    category: 'scroll',
    factory: heroCompress,
  },
  {
    id: 'title-dock',
    name: 'Title Dock',
    group: 'expressive',
    category: 'scroll',
    factory: titleDock,
  },
  {
    id: 'media-drift-scale',
    name: 'Media Drift Scale',
    group: 'expressive',
    category: 'scroll',
    factory: mediaDriftScale,
  },
  {
    id: 'fade-shift',
    name: 'Fade Shift',
    group: 'expressive',
    category: 'scroll',
    factory: fadeShift,
  },
]
