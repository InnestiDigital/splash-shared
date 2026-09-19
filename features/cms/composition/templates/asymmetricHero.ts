import type { CompositionTemplate } from '../types'
import { DEFAULT_EMPHASIS_SCALE } from '../types'

export const asymmetricHero: CompositionTemplate = {
  id: 'asymmetric-hero',
  label: { 'en-US': 'Asymmetric Hero' },
  description: { 'en-US': 'Full-viewport hero — large image right, display headline overlaps left' },
  defaultHeight: 'viewport',
  roles: {
    'primary-media': { required: true, min: 1, max: 1, contentType: 'media', defaultEmphasis: 'lg' },
    'headline': { required: true, min: 1, max: 1, contentType: 'text', defaultEmphasis: 'lg' },
    'eyebrow': { required: false, min: 0, max: 1, contentType: 'text', defaultEmphasis: 'sm' },
    'caption': { required: false, min: 0, max: 1, contentType: 'text', defaultEmphasis: 'sm' },
    'ornament': { required: false, min: 0, max: 2, contentType: 'media', defaultEmphasis: 'sm' },
  },
  groups: [
    {
      id: 'media',
      anchor: 'canvas', region: 'right',
      baseSize: { w: 0.58 },
      roles: ['primary-media'],
      layer: 1, overflowPolicy: 'allow',
      emphasisScale: DEFAULT_EMPHASIS_SCALE,
    },
    {
      id: 'text-stack',
      anchor: 'canvas', region: 'left',
      baseSize: { w: 0.50 },
      roles: ['eyebrow', 'headline'],
      layer: 3, overflowPolicy: 'clamp',
      emphasisScale: DEFAULT_EMPHASIS_SCALE,
    },
  ],
  floaters: {
    'caption': {
      anchor: 'media', region: 'bottom-left',
      sizeMode: 'intrinsic-text', baseSize: { w: 0.30 },
      overlap: { x: 0.20, y: 0.1 },
      layer: 2, emphasisScale: DEFAULT_EMPHASIS_SCALE, overflowPolicy: 'clamp',
    },
    'ornament': {
      anchor: 'text-stack', region: 'bottom-right',
      sizeMode: 'fixed', baseSize: { w: 0.06, h: 0.06 },
      overlap: { x: 0, y: 0 },
      layer: 4, emphasisScale: DEFAULT_EMPHASIS_SCALE, overflowPolicy: 'clamp',
    },
  },
  responsive: {
    stackBelow: 768,
    tablet: { 'media': { scaleSize: 0.9 }, 'text-stack': { shiftRegion: 'center' } },
    stackOrder: ['eyebrow', 'headline', 'primary-media', 'caption'],
    hideOnStack: ['ornament'],
  },
  defaultKnobs: { dominance: 'media', overlap: 'normal', alignment: 'balanced', density: 'normal' },
  defaultTypographySlots: { headline: 'display', eyebrow: 'eyebrow', caption: 'caption' },
  defaultMediaAspect: { 'primary-media': 4 / 3 },
}
