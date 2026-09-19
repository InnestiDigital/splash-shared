import { describe, it, expect } from 'vitest'
import { generateHTML, generateJSON } from '@tiptap/html'
import { createRichTextExtensions } from '~/shared/tiptap/extensions'

describe('createRichTextExtensions — mode option', () => {
  it('block mode (default) registers paragraph + lists + link + all marks', () => {
    const exts = createRichTextExtensions()
    const names = exts.map((e: any) => e.name).filter(Boolean)
    expect(names).toContain('paragraph')
    expect(names).toContain('bulletList')
    expect(names).toContain('orderedList')
    expect(names).toContain('listItem')
    expect(names).toContain('link')
    expect(names).toContain('textColor')
    expect(names).toContain('fontWeight')
    expect(names).toContain('fontSize')
  })

  it('inline mode drops paragraph + lists + link, keeps inline marks + hardBreak', () => {
    const exts = createRichTextExtensions({ mode: 'inline' })
    const names = exts.map((e: any) => e.name).filter(Boolean)
    expect(names).not.toContain('bulletList')
    expect(names).not.toContain('orderedList')
    expect(names).not.toContain('listItem')
    expect(names).not.toContain('link')
    expect(names).toContain('hardBreak')
    expect(names).toContain('textColor')
    expect(names).toContain('inlineTypographyPreset')
  })

  it('single mode drops paragraph + lists + link + hardBreak', () => {
    const exts = createRichTextExtensions({ mode: 'single' })
    const names = exts.map((e: any) => e.name).filter(Boolean)
    expect(names).not.toContain('bulletList')
    expect(names).not.toContain('orderedList')
    expect(names).not.toContain('listItem')
    expect(names).not.toContain('link')
    expect(names).not.toContain('hardBreak')
    expect(names).toContain('textColor')
    expect(names).toContain('inlineTypographyPreset')
  })

  it('inline mode parses <br> as hardBreak', () => {
    const exts = createRichTextExtensions({ mode: 'inline' })
    const json = generateJSON('a<br>b', exts)
    const flat = JSON.stringify(json)
    expect(flat).toContain('"hardBreak"')
  })

  it('single mode rejects <br> at parse (no hardBreak extension)', () => {
    const exts = createRichTextExtensions({ mode: 'single' })
    const json = generateJSON('a<br>b', exts)
    const flat = JSON.stringify(json)
    expect(flat).not.toContain('"hardBreak"')
  })
})
