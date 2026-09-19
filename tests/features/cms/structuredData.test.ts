import { describe, it, expect } from 'vitest'
import { buildStructuredData } from '~/shared/features/cms/structuredData'

const baseSeo = {
  title: 'Lavori',
  description: 'Progetti di restauro nel cuore di Roma',
  ogImageUrl: 'https://archiplan.test/media/og.png',
  noIndex: false,
  canonicalUrl: 'https://archiplan.test/lavori',
}

function graphOf(result: Record<string, unknown> | null) {
  return (result?.['@graph'] ?? []) as Record<string, unknown>[]
}
function node(result: Record<string, unknown> | null, type: string) {
  return graphOf(result).find((n) => n['@type'] === type)
}

describe('buildStructuredData', () => {
  it('emits an Organization + WebSite + WebPage @graph', () => {
    const data = buildStructuredData({ seo: baseSeo, siteName: 'Archiplan', locale: 'it' })
    expect(data?.['@context']).toBe('https://schema.org')
    expect(graphOf(data).map((n) => n['@type'])).toEqual([
      'Organization',
      'WebSite',
      'WebPage',
    ])
  })

  it('anchors Organization + WebSite at the canonical origin', () => {
    const data = buildStructuredData({ seo: baseSeo, siteName: 'Archiplan', locale: 'it' })
    expect(node(data, 'Organization')).toMatchObject({
      '@id': 'https://archiplan.test/#organization',
      url: 'https://archiplan.test',
      name: 'Archiplan',
    })
    expect(node(data, 'WebSite')).toMatchObject({
      '@id': 'https://archiplan.test/#website',
      publisher: { '@id': 'https://archiplan.test/#organization' },
      inLanguage: 'it',
    })
  })

  it('links the WebPage to the WebSite and carries page-level fields', () => {
    const data = buildStructuredData({ seo: baseSeo, siteName: 'Archiplan', locale: 'it' })
    expect(node(data, 'WebPage')).toMatchObject({
      '@id': 'https://archiplan.test/lavori#webpage',
      url: 'https://archiplan.test/lavori',
      name: 'Lavori',
      description: 'Progetti di restauro nel cuore di Roma',
      isPartOf: { '@id': 'https://archiplan.test/#website' },
      inLanguage: 'it',
      primaryImageOfPage: { '@type': 'ImageObject', url: 'https://archiplan.test/media/og.png' },
    })
  })

  it('returns null for a noIndex page (do not advertise skipped pages)', () => {
    expect(buildStructuredData({ seo: { ...baseSeo, noIndex: true }, siteName: 'Archiplan' })).toBeNull()
  })

  it('returns null when the canonical URL is missing or not absolute', () => {
    expect(buildStructuredData({ seo: { ...baseSeo, canonicalUrl: '' } })).toBeNull()
    expect(buildStructuredData({ seo: { ...baseSeo, canonicalUrl: '/lavori' } })).toBeNull()
  })

  it('omits fields rather than emitting empty ones', () => {
    const data = buildStructuredData({
      seo: { ...baseSeo, description: null, ogImageUrl: null, title: '' },
      siteName: '',
      locale: null,
    })
    const org = node(data, 'Organization')!
    const page = node(data, 'WebPage')!
    expect(org).not.toHaveProperty('name')
    expect(page).not.toHaveProperty('name')
    expect(page).not.toHaveProperty('description')
    expect(page).not.toHaveProperty('primaryImageOfPage')
    expect(page).not.toHaveProperty('inLanguage')
  })

  it('appends a FAQPage node when faq entries are supplied', () => {
    const data = buildStructuredData({
      seo: baseSeo,
      siteName: 'Archiplan',
      locale: 'it',
      faq: [
        { question: 'Lavorate con la Soprintendenza?', answer: 'Sì, sempre.' },
        { question: 'Quanto dura?', answer: 'Dipende dal cantiere.' },
      ],
    })
    const faq = node(data, 'FAQPage') as any
    expect(faq).toMatchObject({
      '@id': 'https://archiplan.test/lavori#faq',
      isPartOf: { '@id': 'https://archiplan.test/lavori#webpage' },
    })
    expect(faq.mainEntity).toHaveLength(2)
    expect(faq.mainEntity[0]).toEqual({
      '@type': 'Question',
      name: 'Lavorate con la Soprintendenza?',
      acceptedAnswer: { '@type': 'Answer', text: 'Sì, sempre.' },
    })
  })

  it('omits the FAQPage node when no usable faq entries exist', () => {
    expect(node(buildStructuredData({ seo: baseSeo }), 'FAQPage')).toBeUndefined()
    expect(
      node(
        buildStructuredData({ seo: baseSeo, faq: [{ question: ' ', answer: 'x' }] }),
        'FAQPage',
      ),
    ).toBeUndefined()
  })
})
