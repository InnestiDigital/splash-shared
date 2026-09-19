import { describe, it, expect } from 'vitest'
import { extractFaqEntries } from '~/shared/features/cms/faqStructuredData'

// A localizer that mirrors DynamicPage's: strings pass through, locale maps
// prefer 'it' then 'en-US' then any value.
const localize = (v: unknown): string => {
  if (!v) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'object') {
    const m = v as Record<string, string>
    return m.it || m['en-US'] || Object.values(m)[0] || ''
  }
  return ''
}

const faqBlock = (items: unknown[]) => ({ type: 'faq-accordion', settings: { items } })

describe('extractFaqEntries', () => {
  it('collects question/answer pairs from faq-accordion blocks', () => {
    const blocks = [
      { type: 'section-heading', settings: { heading: 'Domande frequenti' } },
      faqBlock([
        { type: 'faq-item', settings: { question: 'Q1', answer: '<p>A1</p>' } },
        { type: 'faq-item', settings: { question: 'Q2', answer: '<p>A2</p>' } },
      ]),
    ]
    expect(extractFaqEntries(blocks, localize)).toEqual([
      { question: 'Q1', answer: 'A1' },
      { question: 'Q2', answer: 'A2' },
    ])
  })

  it('strips HTML and collapses whitespace in answers', () => {
    const blocks = [
      faqBlock([
        { settings: { question: 'Q', answer: '<p>First.</p>\n<p>Second.</p>' } },
      ]),
    ]
    expect(extractFaqEntries(blocks, localize)).toEqual([
      { question: 'Q', answer: 'First. Second.' },
    ])
  })

  it('skips items missing either side', () => {
    const blocks = [
      faqBlock([
        { settings: { question: 'Q only', answer: '' } },
        { settings: { question: '', answer: 'A only' } },
        { settings: { question: 'Q', answer: 'A' } },
      ]),
    ]
    expect(extractFaqEntries(blocks, localize)).toEqual([{ question: 'Q', answer: 'A' }])
  })

  it('resolves locale maps via the injected localizer', () => {
    const blocks = [
      faqBlock([
        { settings: { question: { it: 'Come?', 'en-US': 'How?' }, answer: { it: 'Così.' } } },
      ]),
    ]
    expect(extractFaqEntries(blocks, localize)).toEqual([{ question: 'Come?', answer: 'Così.' }])
  })

  it('accepts the flat {question, answer} item shape as well as nested settings', () => {
    const blocks = [faqBlock([{ question: 'Flat?', answer: 'Yes.' }])]
    expect(extractFaqEntries(blocks, localize)).toEqual([{ question: 'Flat?', answer: 'Yes.' }])
  })

  it('returns [] for pages with no faq-accordion block or bad input', () => {
    expect(extractFaqEntries([{ type: 'grid-block', settings: {} }], localize)).toEqual([])
    expect(extractFaqEntries(null, localize)).toEqual([])
    expect(extractFaqEntries([faqBlock('nope' as unknown as unknown[])], localize)).toEqual([])
  })
})
