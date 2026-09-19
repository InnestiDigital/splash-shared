// tests/shared/features/layout/validateLayoutConfig.test.ts
import { describe, it, expect } from 'vitest'
import { validateLayoutConfig } from '~/shared/features/layout/validateLayoutConfig'

describe('validateLayoutConfig', () => {
  it('accepts a minimal valid layout', () => {
    const result = validateLayoutConfig({
      id: 'default',
      label: { 'en-US': 'Default' },
      allowedBlocks: [],
    })
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('rejects missing id', () => {
    const result = validateLayoutConfig({ label: { 'en-US': 'X' }, allowedBlocks: [] } as any)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('layout.id is required')
  })

  it('rejects chrome element with missing required fields', () => {
    const result = validateLayoutConfig({
      id: 'x',
      label: { 'en-US': 'X' },
      allowedBlocks: [],
      chrome: { elements: [{ id: 'missing-type', enabled: true } as any] },
    })
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('chrome element'))).toBe(true)
  })

  it('rejects duplicate chrome element ids', () => {
    const result = validateLayoutConfig({
      id: 'x',
      label: { 'en-US': 'X' },
      allowedBlocks: [],
      chrome: {
        elements: [
          { id: 'a', type: 'line', enabled: true, position: 'fixed', anchor: 'top-left', orientation: 'vertical', color: '#000', thickness: '1px', length: '100vh', offsetX: '0', offsetY: '0', zIndex: 1 },
          { id: 'a', type: 'line', enabled: true, position: 'fixed', anchor: 'top-left', orientation: 'vertical', color: '#000', thickness: '1px', length: '100vh', offsetX: '0', offsetY: '0', zIndex: 1 },
        ] as any,
      },
    })
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('duplicate'))).toBe(true)
  })

  it('warns (not errors) on unknown allowedBlocks types', () => {
    const known = new Set(['hero-block', 'grid-block'])
    const result = validateLayoutConfig({
      id: 'x', label: { 'en-US': 'X' }, allowedBlocks: ['hero-block', 'unknown-block'],
    }, known)
    expect(result.valid).toBe(true)
    expect(result.warnings).toContain('layout "x" allowedBlocks contains unknown type: "unknown-block"')
  })

  it('rejects invalid responsiveMode', () => {
    const result = validateLayoutConfig({
      id: 'x', label: { 'en-US': 'X' }, allowedBlocks: [],
      frame: { containerMode: 'content', insetX: 'md', overflowX: 'visible', responsiveMode: 'fluid' as any },
    })
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('responsiveMode'))).toBe(true)
  })

  it('rejects invalid scaleOrigin', () => {
    const result = validateLayoutConfig({
      id: 'x', label: { 'en-US': 'X' }, allowedBlocks: [],
      frame: { containerMode: 'content', insetX: 'md', overflowX: 'visible', scaleOrigin: 'middle' as any },
    })
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('scaleOrigin'))).toBe(true)
  })

  it('warns when minScale > maxScale (still valid)', () => {
    const result = validateLayoutConfig({
      id: 'x', label: { 'en-US': 'X' }, allowedBlocks: [],
      frame: {
        containerMode: 'content', insetX: 'md', overflowX: 'visible',
        responsiveMode: 'scale', minScale: 1.5, maxScale: 1,
      },
    })
    expect(result.valid).toBe(true)
    expect(result.warnings.some(w => w.includes('minScale') && w.includes('maxScale'))).toBe(true)
  })

  it('accepts a complete canvasPreset marker', () => {
    const result = validateLayoutConfig({
      id: 'blank', label: { 'en-US': 'Blank' }, allowedBlocks: [],
      canvasPreset: {
        label: { 'en-US': 'Plain sheet' },
        hint: { 'en-US': 'Your blocks and nothing else.' },
        order: 1,
        default: true,
        initialSection: { containerMode: 'full-bleed', containerInsetX: 'none', sectionSpaceY: 'none' },
      },
    })
    expect(result.valid).toBe(true)
  })

  it('rejects a half-declared canvasPreset instead of letting the option vanish', () => {
    // Everything else reads an incomplete marker as "no preset at all", so an
    // author editing a layout has to be told HERE or nowhere.
    const noHint = validateLayoutConfig({
      id: 'blank', label: { 'en-US': 'Blank' }, allowedBlocks: [],
      canvasPreset: {
        initialSection: { containerMode: 'full-bleed', containerInsetX: 'none', sectionSpaceY: 'none' },
      } as never,
    })
    expect(noHint.valid).toBe(false)
    expect(noHint.errors.some(e => e.includes('canvasPreset'))).toBe(true)

    const partialSection = validateLayoutConfig({
      id: 'blank', label: { 'en-US': 'Blank' }, allowedBlocks: [],
      canvasPreset: {
        hint: { 'en-US': 'Plain' },
        initialSection: { containerMode: 'full-bleed' },
      } as never,
    })
    expect(partialSection.valid).toBe(false)
  })

  it('rejects a frame containerMode outside the section vocabulary', () => {
    const result = validateLayoutConfig({
      id: 'x', label: { 'en-US': 'X' }, allowedBlocks: [],
      frame: { containerMode: 'narrow', insetX: 'md', overflowX: 'visible' } as never,
    })
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('frame.containerMode'))).toBe(true)
  })

  it('accepts every legal frame containerMode', () => {
    for (const containerMode of ['measure', 'content', 'wide', 'full-bleed'] as const) {
      const result = validateLayoutConfig({
        id: 'x', label: { 'en-US': 'X' }, allowedBlocks: [],
        frame: { containerMode, insetX: 'md', overflowX: 'visible' },
      })
      expect(result.errors).toEqual([])
    }
  })

  it('rejects a frame sectionSpacingDefault outside the spacing tiers', () => {
    const result = validateLayoutConfig({
      id: 'x', label: { 'en-US': 'X' }, allowedBlocks: [],
      frame: {
        containerMode: 'content', insetX: 'md', overflowX: 'visible',
        sectionSpacingDefault: 'huge',
      } as never,
    })
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('frame.sectionSpacingDefault'))).toBe(true)
  })

  it('rejects non-positive designWidth', () => {
    const result = validateLayoutConfig({
      id: 'x', label: { 'en-US': 'X' }, allowedBlocks: [],
      frame: {
        containerMode: 'content', insetX: 'md', overflowX: 'visible',
        responsiveMode: 'scale', designWidth: 0,
      },
    })
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('designWidth'))).toBe(true)
  })
})
