import { describe, it, expect } from 'vitest'
import { generateJSON } from '@tiptap/html'
import { createRichTextExtensions } from '~/shared/tiptap/extensions'
import { isTipTapDocument } from '~/shared/tiptap/types'

const extensions = createRichTextExtensions()

describe('HTML → JSON migration logic', () => {
  it('converts simple HTML paragraph to TipTap JSON', () => {
    const html = '<p>Hello world</p>'
    const json = generateJSON(html, extensions)
    expect(json.type).toBe('doc')
    expect(json.content[0].type).toBe('paragraph')
    expect(json.content[0].content[0].text).toBe('Hello world')
  })

  it('converts HTML with bold/italic to JSON with marks', () => {
    const html = '<p>Hello <strong>bold</strong> and <em>italic</em></p>'
    const json = generateJSON(html, extensions)
    const content = json.content[0].content
    expect(content[1].marks[0].type).toBe('bold')
    expect(content[3].marks[0].type).toBe('italic')
  })

  it('converts HTML with link to JSON', () => {
    const html = '<p><a href="https://example.com">link</a></p>'
    const json = generateJSON(html, extensions)
    const linkNode = json.content[0].content[0]
    expect(linkNode.marks[0].type).toBe('link')
    expect(linkNode.marks[0].attrs.href).toBe('https://example.com')
  })

  it('converts empty string to empty doc', () => {
    const html = ''
    const json = generateJSON(html, extensions)
    expect(json.type).toBe('doc')
    expect(isTipTapDocument(json)).toBe(true)
  })

  it('converts HTML list to JSON', () => {
    const html = '<ul><li><p>item 1</p></li><li><p>item 2</p></li></ul>'
    const json = generateJSON(html, extensions)
    expect(json.content[0].type).toBe('bulletList')
  })

  it('isTipTapDocument detects already-converted values', () => {
    const json = generateJSON('<p>hello</p>', extensions)
    expect(isTipTapDocument(json)).toBe(true)
  })

  it('isTipTapDocument rejects HTML strings', () => {
    expect(isTipTapDocument('<p>hello</p>')).toBe(false)
  })

  it('handles translatable locale map pattern', () => {
    const localeMap = {
      'en-US': '<p>Hello</p>',
      'fr-CA': '<p>Bonjour</p>',
    }

    const converted: Record<string, any> = {}
    for (const [locale, html] of Object.entries(localeMap)) {
      if (typeof html === 'string') {
        converted[locale] = generateJSON(html, extensions)
      }
    }

    expect(isTipTapDocument(converted['en-US'])).toBe(true)
    expect(isTipTapDocument(converted['fr-CA'])).toBe(true)
    expect(converted['en-US'].content[0].content[0].text).toBe('Hello')
    expect(converted['fr-CA'].content[0].content[0].text).toBe('Bonjour')
  })
})
