import { describe, it, expect } from 'vitest'
import { seedDefaultDoc } from '~/shared/tiptap/seedDefaultDoc'

describe('seedDefaultDoc — block mode only (single/inline return null)', () => {
  it('returns null when defaultPresetKey is missing', () => {
    expect(seedDefaultDoc({ mode: 'block', defaultPresetKey: undefined })).toBeNull()
    expect(seedDefaultDoc({ mode: 'block', defaultPresetKey: '' })).toBeNull()
  })

  it('block mode → empty paragraph carrying presetKey attr', () => {
    expect(seedDefaultDoc({ mode: 'block', defaultPresetKey: 'body' })).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph', attrs: { presetKey: 'body' }, content: [] }],
    })
  })

  it('single mode → null (no first-keystroke automation; role cascade applies until author picks)', () => {
    expect(seedDefaultDoc({ mode: 'single', defaultPresetKey: 'eyebrow' })).toBeNull()
  })

  it('inline mode → null (same reasoning as single)', () => {
    expect(seedDefaultDoc({ mode: 'inline', defaultPresetKey: 'caption' })).toBeNull()
  })
})
