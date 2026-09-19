import { describe, it, expect } from 'vitest'
import { renderTipTapToHtml } from '~/shared/tiptap/renderTipTapToHtml'
import type { TipTapDocument } from '~/shared/tiptap/types'

const validKeys = new Set(['body-large', 'small-caps'])

describe('renderTipTapToHtml — strike mark', () => {
  it('renders strike as <s>', () => {
    const doc: TipTapDocument = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{ type: 'text', marks: [{ type: 'strike' }], text: 'gone' }],
      }],
    }
    expect(renderTipTapToHtml(doc, validKeys)).toBe('<p><s>gone</s></p>')
  })

  it('renders strike + bold together (deterministic order)', () => {
    const doc: TipTapDocument = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{
          type: 'text',
          marks: [{ type: 'bold' }, { type: 'strike' }],
          text: 'x',
        }],
      }],
    }
    const html = renderTipTapToHtml(doc, validKeys)
    expect(html).toBe('<p><strong><s>x</s></strong></p>')
  })
})

describe('renderTipTapToHtml — inline style override marks', () => {
  it('renders textColor as <span style="color: ...">', () => {
    const doc: TipTapDocument = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{
          type: 'text',
          marks: [{ type: 'textColor', attrs: { color: '#ff0000' } }],
          text: 'red',
        }],
      }],
    }
    expect(renderTipTapToHtml(doc, validKeys)).toBe(
      '<p><span style="color: #ff0000">red</span></p>',
    )
  })

  it('renders fontWeight as <span style="font-weight: ...">', () => {
    const doc: TipTapDocument = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{
          type: 'text',
          marks: [{ type: 'fontWeight', attrs: { weight: '700' } }],
          text: 'bold-ish',
        }],
      }],
    }
    expect(renderTipTapToHtml(doc, validKeys)).toBe(
      '<p><span style="font-weight: 700">bold-ish</span></p>',
    )
  })

  it('renders fontSize as <span style="font-size: ...">', () => {
    const doc: TipTapDocument = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{
          type: 'text',
          marks: [{ type: 'fontSize', attrs: { size: '1.5rem' } }],
          text: 'big',
        }],
      }],
    }
    expect(renderTipTapToHtml(doc, validKeys)).toBe(
      '<p><span style="font-size: 1.5rem">big</span></p>',
    )
  })

  it('coalesces color + weight + size into one span', () => {
    const doc: TipTapDocument = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{
          type: 'text',
          marks: [
            { type: 'textColor', attrs: { color: '#112233' } },
            { type: 'fontWeight', attrs: { weight: '600' } },
            { type: 'fontSize', attrs: { size: '1.25rem' } },
          ],
          text: 'all',
        }],
      }],
    }
    // Property order: color, font-weight, font-size (matches mark registration order)
    expect(renderTipTapToHtml(doc, validKeys)).toBe(
      '<p><span style="color: #112233; font-weight: 600; font-size: 1.25rem">all</span></p>',
    )
  })

  it('coalesces overrides regardless of mark order in the input', () => {
    const doc: TipTapDocument = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{
          type: 'text',
          marks: [
            { type: 'fontSize', attrs: { size: '1.25rem' } },
            { type: 'textColor', attrs: { color: '#112233' } },
            { type: 'fontWeight', attrs: { weight: '600' } },
          ],
          text: 'all',
        }],
      }],
    }
    expect(renderTipTapToHtml(doc, validKeys)).toBe(
      '<p><span style="color: #112233; font-weight: 600; font-size: 1.25rem">all</span></p>',
    )
  })

  it('stacks override span INSIDE preset span (preset class outermost of inline-override layer)', () => {
    const doc: TipTapDocument = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{
          type: 'text',
          marks: [
            { type: 'inlineTypographyPreset', attrs: { presetKey: 'small-caps' } },
            { type: 'textColor', attrs: { color: '#000000' } },
          ],
          text: 'x',
        }],
      }],
    }
    // Preset span wraps the override span — inline overrides win via CSS
    // specificity (style > class) regardless of nesting, so the order is
    // chosen for predictable DOM not visual precedence.
    expect(renderTipTapToHtml(doc, validKeys)).toBe(
      '<p><span class="rt-preset-small-caps"><span style="color: #000000">x</span></span></p>',
    )
  })

  it('combines override span with bold and strike', () => {
    const doc: TipTapDocument = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{
          type: 'text',
          marks: [
            { type: 'bold' },
            { type: 'strike' },
            { type: 'textColor', attrs: { color: '#fff' } },
          ],
          text: 'x',
        }],
      }],
    }
    // Order: bold > strike > inline override span (bold/italic/u/strike all
    // outside the inline-override span so the override wins on the inner
    // run only).
    expect(renderTipTapToHtml(doc, validKeys)).toBe(
      '<p><strong><s><span style="color: #fff">x</span></s></strong></p>',
    )
  })

  it('renders text with no marks unchanged (regression — empty mark stack)', () => {
    const doc: TipTapDocument = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'plain' }] }],
    }
    expect(renderTipTapToHtml(doc, validKeys)).toBe('<p>plain</p>')
  })

  // Defense-in-depth: the renderer trusts no input, including its own
  // mark attrs. A manually-tampered JSON document with an invalid color
  // or out-of-range weight must NOT produce a span carrying that value.
  it('drops textColor mark with invalid color attr (does not emit unsafe style)', () => {
    const doc: TipTapDocument = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{
          type: 'text',
          marks: [{ type: 'textColor', attrs: { color: 'expression(alert(1))' } }],
          text: 'x',
        }],
      }],
    }
    const html = renderTipTapToHtml(doc, validKeys)
    expect(html).not.toContain('style=')
    expect(html).not.toContain('expression')
    expect(html).toBe('<p>x</p>')
  })

  it('drops fontWeight mark with non-allowlist value', () => {
    const doc: TipTapDocument = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{
          type: 'text',
          marks: [{ type: 'fontWeight', attrs: { weight: '450' } }],
          text: 'x',
        }],
      }],
    }
    expect(renderTipTapToHtml(doc, validKeys)).toBe('<p>x</p>')
  })

  it('drops fontSize mark with non-allowlist value (e.g. 12px)', () => {
    const doc: TipTapDocument = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{
          type: 'text',
          marks: [{ type: 'fontSize', attrs: { size: '12px' } }],
          text: 'x',
        }],
      }],
    }
    expect(renderTipTapToHtml(doc, validKeys)).toBe('<p>x</p>')
  })

  it('keeps valid override marks while dropping the invalid one in the same mark stack', () => {
    const doc: TipTapDocument = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{
          type: 'text',
          marks: [
            { type: 'textColor', attrs: { color: '#ff0000' } },
            { type: 'fontWeight', attrs: { weight: '450' } }, // invalid
          ],
          text: 'x',
        }],
      }],
    }
    expect(renderTipTapToHtml(doc, validKeys)).toBe(
      '<p><span style="color: #ff0000">x</span></p>',
    )
  })
})
