import type { CompositionTemplate } from '../types'
import { DEFAULT_EMPHASIS_SCALE } from '../types'

export const offsetMediaStack: CompositionTemplate = {
  id: 'offset-media-stack',
  label: { 'en-US': 'Offset Media Stack' },
  description: { 'en-US': 'Two overlapping images with text alongside — ideal for artifact and portfolio presentations' },
  defaultHeight: 'large',
  roles: {
    'primary-media': { required: true, min: 1, max: 1, contentType: 'media', defaultEmphasis: 'lg' },
    'secondary-media': { required: true, min: 1, max: 1, contentType: 'media', defaultEmphasis: 'md' },
    'headline': { required: false, min: 0, max: 1, contentType: 'text', defaultEmphasis: 'md' },
    'body': { required: false, min: 0, max: 1, contentType: 'text', defaultEmphasis: 'md' },
    'caption': { required: false, min: 0, max: 1, contentType: 'text', defaultEmphasis: 'sm' },
    'meta': { required: false, min: 0, max: 1, contentType: 'text', defaultEmphasis: 'sm' },
  },
  groups: [
    {
      id: 'media-cluster',
      anchor: 'canvas', region: 'left',
      baseSize: { w: 0.50 },
      roles: ['primary-media', 'secondary-media'],
      layer: 1, overflowPolicy: 'clamp',
      emphasisScale: DEFAULT_EMPHASIS_SCALE,
    },
    {
      id: 'text-stack',
      anchor: 'canvas', region: 'right',
      baseSize: { w: 0.42 },
      roles: ['headline', 'body'],
      layer: 3, overflowPolicy: 'clamp',
      emphasisScale: DEFAULT_EMPHASIS_SCALE,
    },
  ],
  floaters: {
    'caption': {
      anchor: 'media-cluster', region: 'bottom',
      sizeMode: 'intrinsic-text', baseSize: { w: 0.40 },
      overlap: { x: 0, y: 0 },
      layer: 2, emphasisScale: DEFAULT_EMPHASIS_SCALE, overflowPolicy: 'clamp',
    },
    'meta': {
      anchor: 'text-stack', region: 'bottom',
      sizeMode: 'intrinsic-text', baseSize: { w: 0.35 },
      overlap: { x: 0, y: 0 },
      layer: 3, emphasisScale: DEFAULT_EMPHASIS_SCALE, overflowPolicy: 'clamp',
    },
  },
  responsive: {
    stackBelow: 768,
    tablet: {
      'media-cluster': { scaleSize: 0.9 },
    },
    stackOrder: ['headline', 'primary-media', 'secondary-media', 'body', 'caption', 'meta'],
  },
  defaultKnobs: { dominance: 'balanced', overlap: 'normal', alignment: 'balanced', density: 'normal' },
  defaultTypographySlots: { headline: 'display', body: 'body', caption: 'caption', meta: 'caption' },
  defaultMediaAspect: { 'primary-media': 3 / 4, 'secondary-media': 1 },
}
