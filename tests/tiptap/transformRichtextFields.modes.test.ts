import { describe, it, expect } from 'vitest'
import { transformRichtextFields } from '~/shared/tiptap/transformRichtextFields'

const validKeys = new Set(['body'])

const docTwoParas = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'a' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'b' }] },
  ],
}

describe('transformRichtextFields — per-mode rendering', () => {
  it('field.type=richtext-single renders without <p>', () => {
    const schema = { settings: [{ id: 'heading', type: 'richtext-single' }] }
    const out = transformRichtextFields({ heading: docTwoParas }, schema, validKeys)
    expect(out.heading).toBe('ab')
  })
  it('field.type=richtext-inline joins paragraphs with <br>', () => {
    const schema = { settings: [{ id: 'caption', type: 'richtext-inline' }] }
    const out = transformRichtextFields({ caption: docTwoParas }, schema, validKeys)
    expect(out.caption).toBe('a<br>b')
  })
  it('field.type=richtext-block keeps <p> per paragraph (back-compat)', () => {
    const schema = { settings: [{ id: 'body', type: 'richtext-block' }] }
    const out = transformRichtextFields({ body: docTwoParas }, schema, validKeys)
    expect(out.body).toBe('<p>a</p><p>b</p>')
  })
  it('field.type=richtext (legacy) behaves as block (back-compat)', () => {
    const schema = { settings: [{ id: 'body', type: 'richtext' }] }
    const out = transformRichtextFields({ body: docTwoParas }, schema, validKeys)
    expect(out.body).toBe('<p>a</p><p>b</p>')
  })
})
