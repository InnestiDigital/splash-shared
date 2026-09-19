import { describe, it, expect } from 'vitest'
import { renderTipTapToHtml } from '~/shared/tiptap/renderTipTapToHtml'
import type { TipTapDocument } from '~/shared/tiptap/types'

const validKeys = new Set(['body', 'fraunces-soft-display'])

const docOneParaPlain: TipTapDocument = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }],
}
const docOneParaWithMarks: TipTapDocument = {
  type: 'doc',
  content: [{
    type: 'paragraph',
    content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'bold' }],
  }],
}
const docTwoParas: TipTapDocument = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'a' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'b' }] },
  ],
}
const docHardBreak: TipTapDocument = {
  type: 'doc',
  content: [{
    type: 'paragraph',
    content: [
      { type: 'text', text: 'a' },
      { type: 'hardBreak' },
      { type: 'text', text: 'b' },
    ],
  }],
}

describe('renderTipTapToHtml — single mode', () => {
  it('emits inner text WITHOUT <p> wrapper', () => {
    expect(renderTipTapToHtml(docOneParaPlain, validKeys, { mode: 'single' })).toBe('hello')
  })
  it('keeps inline marks but no <p>', () => {
    expect(renderTipTapToHtml(docOneParaWithMarks, validKeys, { mode: 'single' }))
      .toBe('<strong>bold</strong>')
  })
  it('joins multiple paragraphs WITHOUT <br> (single = one line)', () => {
    expect(renderTipTapToHtml(docTwoParas, validKeys, { mode: 'single' })).toBe('ab')
  })
  it('strips hardBreak in single mode', () => {
    expect(renderTipTapToHtml(docHardBreak, validKeys, { mode: 'single' })).toBe('ab')
  })
})

describe('renderTipTapToHtml — inline mode', () => {
  it('emits inner text WITHOUT <p> wrapper', () => {
    expect(renderTipTapToHtml(docOneParaPlain, validKeys, { mode: 'inline' })).toBe('hello')
  })
  it('joins paragraphs with <br>', () => {
    expect(renderTipTapToHtml(docTwoParas, validKeys, { mode: 'inline' })).toBe('a<br>b')
  })
  it('keeps hardBreak as <br>', () => {
    expect(renderTipTapToHtml(docHardBreak, validKeys, { mode: 'inline' })).toBe('a<br>b')
  })
})

describe('renderTipTapToHtml — block mode (default, back-compat)', () => {
  it('emits <p> wrapper', () => {
    expect(renderTipTapToHtml(docOneParaPlain, validKeys, { mode: 'block' })).toBe('<p>hello</p>')
  })
  it('emits one <p> per paragraph', () => {
    expect(renderTipTapToHtml(docTwoParas, validKeys, { mode: 'block' })).toBe('<p>a</p><p>b</p>')
  })
  it('defaults to block mode when no options arg', () => {
    expect(renderTipTapToHtml(docOneParaPlain, validKeys)).toBe('<p>hello</p>')
  })
})
