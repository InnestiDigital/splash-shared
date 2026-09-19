// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'

const useHeadMock = vi.fn()
vi.mock('#imports', () => ({
  useHead: (factory: any) => useHeadMock(typeof factory === 'function' ? factory() : factory),
}))

import PageHead from '~/shared/features/cms/PageHead.vue'

const baseSeo = {
  title: 'Page Title',
  description: 'Description text',
  ogImageUrl: 'https://example.test/og.png',
  noIndex: false,
  canonicalUrl: 'https://example.test/path',
  extra: {},
}

function lastHead() {
  return useHeadMock.mock.calls.at(-1)?.[0]
}

describe('PageHead', () => {
  it('sets <title>', () => {
    useHeadMock.mockReset()
    mount(PageHead, { props: { seo: baseSeo } })
    expect(lastHead()?.title).toBe('Page Title')
  })

  it('emits description meta when present', () => {
    useHeadMock.mockReset()
    mount(PageHead, { props: { seo: baseSeo } })
    const meta = lastHead()?.meta as any[]
    expect(meta.find((m) => m.name === 'description')).toEqual({
      name: 'description',
      content: 'Description text',
    })
  })

  it('omits description meta when null', () => {
    useHeadMock.mockReset()
    mount(PageHead, { props: { seo: { ...baseSeo, description: null } } })
    const meta = lastHead()?.meta as any[]
    expect(meta.find((m) => m.name === 'description')).toBeUndefined()
  })

  it('emits robots noindex,nofollow when noIndex=true', () => {
    useHeadMock.mockReset()
    mount(PageHead, { props: { seo: { ...baseSeo, noIndex: true } } })
    const meta = lastHead()?.meta as any[]
    expect(meta.find((m) => m.name === 'robots')).toEqual({
      name: 'robots',
      content: 'noindex,nofollow',
    })
  })

  it('omits robots meta when noIndex=false', () => {
    useHeadMock.mockReset()
    mount(PageHead, { props: { seo: baseSeo } })
    const meta = lastHead()?.meta as any[]
    expect(meta.find((m) => m.name === 'robots')).toBeUndefined()
  })

  it('emits og:title, og:description, og:image', () => {
    useHeadMock.mockReset()
    mount(PageHead, { props: { seo: baseSeo } })
    const meta = lastHead()?.meta as any[]
    expect(meta.find((m) => m.property === 'og:title')).toEqual({
      property: 'og:title',
      content: 'Page Title',
    })
    expect(meta.find((m) => m.property === 'og:description')).toEqual({
      property: 'og:description',
      content: 'Description text',
    })
    expect(meta.find((m) => m.property === 'og:image')).toEqual({
      property: 'og:image',
      content: 'https://example.test/og.png',
    })
  })

  it('omits og:image when ogImageUrl is null', () => {
    useHeadMock.mockReset()
    mount(PageHead, { props: { seo: { ...baseSeo, ogImageUrl: null } } })
    const meta = lastHead()?.meta as any[]
    expect(meta.find((m) => m.property === 'og:image')).toBeUndefined()
  })

  it('emits rel=canonical link', () => {
    useHeadMock.mockReset()
    mount(PageHead, { props: { seo: baseSeo } })
    expect(lastHead()?.link).toEqual([{ rel: 'canonical', href: 'https://example.test/path' }])
  })

  it('emits og:type=website and og:url from the canonical', () => {
    useHeadMock.mockReset()
    mount(PageHead, { props: { seo: baseSeo } })
    const meta = lastHead()?.meta as any[]
    expect(meta.find((m) => m.property === 'og:type')).toEqual({
      property: 'og:type',
      content: 'website',
    })
    expect(meta.find((m) => m.property === 'og:url')).toEqual({
      property: 'og:url',
      content: 'https://example.test/path',
    })
  })

  it('emits og:site_name when siteName is provided, omits otherwise', () => {
    useHeadMock.mockReset()
    mount(PageHead, { props: { seo: baseSeo, siteName: 'Archiplan' } })
    expect((lastHead()?.meta as any[]).find((m) => m.property === 'og:site_name')).toEqual({
      property: 'og:site_name',
      content: 'Archiplan',
    })
    useHeadMock.mockReset()
    mount(PageHead, { props: { seo: baseSeo } })
    expect((lastHead()?.meta as any[]).find((m) => m.property === 'og:site_name')).toBeUndefined()
  })

  it('normalises locale to og:locale underscore form', () => {
    useHeadMock.mockReset()
    mount(PageHead, { props: { seo: baseSeo, locale: 'en-US' } })
    expect((lastHead()?.meta as any[]).find((m) => m.property === 'og:locale')).toEqual({
      property: 'og:locale',
      content: 'en_US',
    })
  })

  it('omits og:locale when locale is absent', () => {
    useHeadMock.mockReset()
    mount(PageHead, { props: { seo: baseSeo } })
    expect((lastHead()?.meta as any[]).find((m) => m.property === 'og:locale')).toBeUndefined()
  })

  it('emits a summary_large_image twitter card when an image exists', () => {
    useHeadMock.mockReset()
    mount(PageHead, { props: { seo: baseSeo } })
    const meta = lastHead()?.meta as any[]
    expect(meta.find((m) => m.name === 'twitter:card')).toEqual({
      name: 'twitter:card',
      content: 'summary_large_image',
    })
    expect(meta.find((m) => m.name === 'twitter:title')).toEqual({
      name: 'twitter:title',
      content: 'Page Title',
    })
    expect(meta.find((m) => m.name === 'twitter:description')).toEqual({
      name: 'twitter:description',
      content: 'Description text',
    })
    expect(meta.find((m) => m.name === 'twitter:image')).toEqual({
      name: 'twitter:image',
      content: 'https://example.test/og.png',
    })
  })

  it('falls back to a plain summary twitter card without an image', () => {
    useHeadMock.mockReset()
    mount(PageHead, { props: { seo: { ...baseSeo, ogImageUrl: null } } })
    const meta = lastHead()?.meta as any[]
    expect(meta.find((m) => m.name === 'twitter:card')).toEqual({
      name: 'twitter:card',
      content: 'summary',
    })
    expect(meta.find((m) => m.name === 'twitter:image')).toBeUndefined()
  })
})

describe('PageHead — tenant favicon', () => {
  const icons = () => ((lastHead()?.link as any[]) ?? []).filter(l => l.rel === 'icon')

  it('emits no icon link when the tenant has not set one', () => {
    useHeadMock.mockReset()
    mount(PageHead, { props: { seo: baseSeo } })
    // nuxt.config.ts owns the platform default; PageHead must stay silent so
    // that default survives rather than being replaced by an empty href.
    expect(icons()).toHaveLength(0)
  })

  it('emits the tenant icon, keyed so it REPLACES the platform default', () => {
    useHeadMock.mockReset()
    mount(PageHead, { props: { seo: baseSeo, faviconUrl: '/api/blueprint-assets/acme/icon.png' } })
    // The key must match nuxt.config.ts's icon link. Without it both tags ship
    // and the browser chooses which icon the tab shows.
    expect(icons()).toEqual([
      { rel: 'icon', href: '/api/blueprint-assets/acme/icon.png', key: 'favicon' },
    ])
  })

  it('keeps the canonical link alongside the icon', () => {
    useHeadMock.mockReset()
    mount(PageHead, { props: { seo: baseSeo, faviconUrl: '/icon.png' } })
    const link = (lastHead()?.link as any[]) ?? []
    expect(link.find(l => l.rel === 'canonical')?.href).toBe('https://example.test/path')
  })
})
