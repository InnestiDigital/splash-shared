import { describe, it, expect } from 'vitest'
import { validateTemplate, validateItems } from '~/shared/features/cms/composition/validation'
import type { CompositionTemplate, CompositionItem } from '~/shared/features/cms/composition/types'
import { DEFAULT_EMPHASIS_SCALE, DEFAULT_KNOBS } from '~/shared/features/cms/composition/types'

function makeTemplate(overrides: Partial<CompositionTemplate> = {}): CompositionTemplate {
  return {
    id: 'test',
    label: { 'en-US': 'Test' },
    description: { 'en-US': '' },
    defaultHeight: 'large',
    roles: {
      'primary-media': { required: true, contentType: 'media', defaultEmphasis: 'lg' },
      'headline': { required: true, contentType: 'text', defaultEmphasis: 'lg' },
    },
    groups: [
      { id: 'media', anchor: 'canvas', region: 'right', baseSize: { w: 0.55 }, roles: ['primary-media'], layer: 1, overflowPolicy: 'allow', emphasisScale: DEFAULT_EMPHASIS_SCALE },
      { id: 'text', anchor: 'canvas', region: 'left', baseSize: { w: 0.45 }, roles: ['headline'], layer: 2, overflowPolicy: 'clamp', emphasisScale: DEFAULT_EMPHASIS_SCALE },
    ],
    floaters: {},
    responsive: { stackBelow: 768, stackOrder: ['headline', 'primary-media'] },
    defaultKnobs: DEFAULT_KNOBS,
    ...overrides,
  }
}

describe('validateTemplate', () => {
  it('accepts valid template', () => {
    expect(validateTemplate(makeTemplate())).toEqual([])
  })

  it('detects role not in any group or floater', () => {
    const t = makeTemplate({
      roles: {
        'primary-media': { required: true, contentType: 'media', defaultEmphasis: 'lg' },
        'headline': { required: true, contentType: 'text', defaultEmphasis: 'lg' },
        'caption': { required: false, contentType: 'text', defaultEmphasis: 'sm' },
      },
    })
    const errors = validateTemplate(t)
    expect(errors).toContainEqual(expect.objectContaining({ code: 'role-unplaced' }))
  })

  it('detects group anchor cycle', () => {
    const t = makeTemplate({
      groups: [
        { id: 'a', anchor: 'b', region: 'left', baseSize: { w: 0.5 }, roles: ['primary-media'], layer: 1, overflowPolicy: 'clamp', emphasisScale: DEFAULT_EMPHASIS_SCALE },
        { id: 'b', anchor: 'a', region: 'right', baseSize: { w: 0.5 }, roles: ['headline'], layer: 2, overflowPolicy: 'clamp', emphasisScale: DEFAULT_EMPHASIS_SCALE },
      ],
    })
    expect(validateTemplate(t)).toContainEqual(expect.objectContaining({ code: 'anchor-cycle' }))
  })

  it('detects floater anchoring to undefined group', () => {
    const t = makeTemplate({
      roles: {
        'primary-media': { required: true, contentType: 'media', defaultEmphasis: 'lg' },
        'headline': { required: true, contentType: 'text', defaultEmphasis: 'lg' },
        'caption': { required: false, contentType: 'text', defaultEmphasis: 'sm' },
      },
      floaters: {
        'caption': { anchor: 'nonexistent', region: 'bottom', sizeMode: 'intrinsic-text', baseSize: { w: 0.3 }, overlap: { x: 0, y: 0 }, layer: 3, emphasisScale: DEFAULT_EMPHASIS_SCALE, overflowPolicy: 'clamp' },
      },
    })
    expect(validateTemplate(t)).toContainEqual(expect.objectContaining({ code: 'floater-anchor-undefined' }))
  })

  it('detects stackOrder missing non-hidden role', () => {
    const t = makeTemplate({
      responsive: { stackBelow: 768, stackOrder: ['headline'] },
    })
    expect(validateTemplate(t)).toContainEqual(expect.objectContaining({ code: 'stackorder-incomplete' }))
  })
})

describe('validateItems', () => {
  const template = makeTemplate()

  it('accepts valid items', () => {
    const items: CompositionItem[] = [
      { id: '1', role: 'primary-media', visible: true, emphasis: 'lg', media: { src: '/a.jpg' } },
      { id: '2', role: 'headline', visible: true, emphasis: 'lg', textContent: { 'en-US': 'Hi' } },
    ]
    expect(validateItems(items, template)).toEqual([])
  })

  it('detects missing required role', () => {
    const items: CompositionItem[] = [
      { id: '1', role: 'primary-media', visible: true, emphasis: 'lg', media: { src: '/a.jpg' } },
    ]
    expect(validateItems(items, template)).toContainEqual(expect.objectContaining({ code: 'missing-required' }))
  })

  it('detects duplicate IDs', () => {
    const items: CompositionItem[] = [
      { id: 'dup', role: 'primary-media', visible: true, emphasis: 'lg', media: { src: '/a.jpg' } },
      { id: 'dup', role: 'headline', visible: true, emphasis: 'lg', textContent: { 'en-US': 'Hi' } },
    ]
    expect(validateItems(items, template)).toContainEqual(expect.objectContaining({ code: 'duplicate-id' }))
  })

  it('detects required role set invisible', () => {
    const items: CompositionItem[] = [
      { id: '1', role: 'primary-media', visible: false, emphasis: 'lg', media: { src: '/a.jpg' } },
      { id: '2', role: 'headline', visible: true, emphasis: 'lg', textContent: { 'en-US': 'Hi' } },
    ]
    expect(validateItems(items, template)).toContainEqual(expect.objectContaining({ code: 'required-invisible' }))
  })

  it('detects exceeding max cardinality', () => {
    const t = makeTemplate({ roles: { ...makeTemplate().roles, 'primary-media': { required: true, max: 1, contentType: 'media', defaultEmphasis: 'lg' } } })
    const items: CompositionItem[] = [
      { id: '1', role: 'primary-media', visible: true, emphasis: 'lg', media: { src: '/a.jpg' } },
      { id: '2', role: 'primary-media', visible: true, emphasis: 'lg', media: { src: '/b.jpg' } },
      { id: '3', role: 'headline', visible: true, emphasis: 'lg', textContent: { 'en-US': 'Hi' } },
    ]
    expect(validateItems(items, t)).toContainEqual(expect.objectContaining({ code: 'exceeds-max' }))
  })
})
