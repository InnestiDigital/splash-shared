import type { CompositionTemplate } from '../types'
import { DEFAULT_EMPHASIS_SCALE } from '../types'

export const captionedEditorialSpread: CompositionTemplate = {
  id: 'captioned-editorial-spread',
  label: { 'en-US': 'Captioned Editorial Spread' },
  description: { 'en-US': 'Text-led composition with headline, body text, and offset supporting image' },
  defaultHeight: 'large',
  roles: {
    'headline': { required: true, min: 1, max: 1, contentType: 'text', defaultEmphasis: 'lg' },
    'body': { required: true, min: 1, max: 1, contentType: 'text', defaultEmphasis: 'md' },
    'primary-media': { required: true, min: 1, max: 1, contentType: 'media', defaultEmphasis: 'md' },
    'caption': { required: false, min: 0, max: 1, contentType: 'text', defaultEmphasis: 'sm' },
    'eyebrow': { required: false, min: 0, max: 1, contentType: 'text', defaultEmphasis: 'sm' },
    'meta': { required: false, min: 0, max: 1, contentType: 'text', defaultEmphasis: 'sm' },
  },
  groups: [
    {
      id: 'text-column',
      anchor: 'canvas', region: 'left',
      baseSize: { w: 0.55 },
      roles: ['eyebrow', 'headline', 'body'],
      layer: 2, overflowPolicy: 'clamp',
      emphasisScale: DEFAULT_EMPHASIS_SCALE,
    },
    {
      id: 'media-accent',
      anchor: 'canvas', region: 'right',
      baseSize: { w: 0.40 },
      roles: ['primary-media'],
      layer: 1, overflowPolicy: 'allow',
      emphasisScale: DEFAULT_EMPHASIS_SCALE,
    },
  ],
  floaters: {
    'caption': {
      anchor: 'media-accent', region: 'bottom-left',
      sizeMode: 'intrinsic-text', baseSize: { w: 0.35 },
      overlap: { x: 0.10, y: 0.05 },
      layer: 3, emphasisScale: DEFAULT_EMPHASIS_SCALE, overflowPolicy: 'clamp',
    },
    'meta': {
      anchor: 'text-column', region: 'bottom',
      sizeMode: 'intrinsic-text', baseSize: { w: 0.30 },
      overlap: { x: 0, y: 0 },
      layer: 2, emphasisScale: DEFAULT_EMPHASIS_SCALE, overflowPolicy: 'clamp',
    },
  },
  responsive: {
    stackBelow: 768,
    tablet: {
      'media-accent': { scaleSize: 0.85 },
      'text-column': { scaleSize: 0.9 },
    },
    stackOrder: ['eyebrow', 'headline', 'primary-media', 'caption', 'body', 'meta'],
  },
  defaultKnobs: { dominance: 'text', overlap: 'normal', alignment: 'balanced', density: 'normal' },
  defaultTypographySlots: { headline: 'display', body: 'body', eyebrow: 'eyebrow', caption: 'caption', meta: 'caption' },
  defaultMediaAspect: { 'primary-media': 3 / 4 },
}
