// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h, type Component } from 'vue'
import {
  buildPageEndpointParams,
  buildTemplatePageProp,
  describeFetchError,
  isTemplatedPageType,
  makeTemplateErrorPlaceholder,
  mergeTemplateSettings,
  pickPageTitle,
  resolveTemplateComponent,
  toPreviewState,
  type PreviewTemplateDescriptor,
  type TemplatedPageResponse,
} from '~/shared/pages/__preview/templatedPagePreview'

function descriptor(overrides: Partial<PreviewTemplateDescriptor> = {}): PreviewTemplateDescriptor {
  return {
    id: 'article-editorial',
    label: 'Editorial article',
    component: 'templates/article-editorial.vue',
    version: '1.0.0',
    schemaVersion: '1',
    settings: { showMeta: true, showRelated: false, relatedTitle: { 'en-US': 'More' } },
    ...overrides,
  }
}

/**
 * VTU cannot mount an async component as the root wrapper (its root node is
 * null until the loader settles), so render it inside a tiny host — which is
 * also how the preview route uses it.
 */
function host(component: Component, props: Record<string, unknown> = {}) {
  return defineComponent({ render: () => h(component, props) })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('isTemplatedPageType', () => {
  it('accepts the two page types that render through a template', () => {
    expect(isTemplatedPageType('article')).toBe(true)
    expect(isTemplatedPageType('blog-index')).toBe(true)
  })

  it('rejects block-rendered and unknown page types', () => {
    // A static page must keep the DynamicPage block path untouched.
    expect(isTemplatedPageType('static')).toBe(false)
    expect(isTemplatedPageType('brand-canvas')).toBe(false)
    expect(isTemplatedPageType(undefined)).toBe(false)
    expect(isTemplatedPageType(null)).toBe(false)
  })
})

describe('toPreviewState', () => {
  it('mounts the template for an article payload', () => {
    const res: TemplatedPageResponse = {
      blocks: [],
      template: descriptor(),
      contentData: { title: { 'en-US': 'Hello' } },
      media: { 'm-1': { url: '/api/media/m-1' } as never },
      relatedArticles: [{ id: 'a-2' }],
      publishedAt: '2026-01-02T00:00:00.000Z',
      author: { userId: 'u-1', name: 'Ada', displayName: 'Ada L.' },
    }

    const state = toPreviewState('article', res)

    expect(state.status).toBe('template')
    if (state.status !== 'template') throw new Error('unreachable')
    expect(state.render.template.component).toBe('templates/article-editorial.vue')
    expect(state.render.related).toHaveLength(1)
    expect(state.render.author.displayName).toBe('Ada L.')
    expect(state.render.publishedAt).toBe('2026-01-02T00:00:00.000Z')
  })

  it('mounts the template for a structured blog-index payload', () => {
    const state = toPreviewState('blog-index', {
      template: descriptor({ id: 'blog-index-editorial-grid', component: 'templates/blog-index-editorial-grid.vue' }),
      contentData: { title: 'Journal' },
    })

    expect(state.status).toBe('template')
    if (state.status !== 'template') throw new Error('unreachable')
    expect(state.render.media).toEqual({})
    expect(state.render.related).toEqual([])
    expect(state.render.author).toEqual({ userId: null, name: null, displayName: null })
  })

  it('falls back to the block render for a legacy block-authored blog-index', () => {
    const state = toPreviewState('blog-index', { blocks: [{ type: 'hero' }], template: null, contentData: null })

    expect(state).toEqual({ status: 'blocks' })
  })

  it('fails loud for an article that resolved without a template', () => {
    // Articles are structured-only. A blank frame here used to look like an
    // empty page instead of a malformed row.
    const state = toPreviewState('article', { blocks: [], template: null, contentData: null })

    expect(state.status).toBe('error')
    if (state.status !== 'error') throw new Error('unreachable')
    expect(state.message).toMatch(/template/i)
  })

  it('fails loud when contentData is missing even though a template resolved', () => {
    const state = toPreviewState('article', { template: descriptor(), contentData: null })

    expect(state.status).toBe('error')
  })
})

describe('mergeTemplateSettings', () => {
  it('layers unsaved editor settings over the server-resolved ones', () => {
    const merged = mergeTemplateSettings(
      { showMeta: true, showRelated: false, relatedTitle: { 'en-US': 'More' } },
      { showRelated: true },
    )

    expect(merged).toEqual({ showMeta: true, showRelated: true, relatedTitle: { 'en-US': 'More' } })
  })

  it('keeps a falsy override — false is an author decision, not an absence', () => {
    expect(mergeTemplateSettings({ showMeta: true }, { showMeta: false })).toEqual({ showMeta: false })
  })

  it('ignores undefined fields and non-object drafts', () => {
    expect(mergeTemplateSettings({ showMeta: true }, { showMeta: undefined })).toEqual({ showMeta: true })
    expect(mergeTemplateSettings({ showMeta: true }, null)).toEqual({ showMeta: true })
    expect(mergeTemplateSettings({ showMeta: true }, ['nope'])).toEqual({ showMeta: true })
  })

  it('does not mutate the resolved settings it was given', () => {
    const resolved = { showMeta: true }
    mergeTemplateSettings(resolved, { showMeta: false })
    expect(resolved).toEqual({ showMeta: true })
  })
})

describe('buildTemplatePageProp', () => {
  const render = {
    template: descriptor(),
    contentData: {},
    media: {},
    related: [],
    seo: null,
    publishedAt: '2026-03-04T00:00:00.000Z',
    author: { userId: 'u-1', name: 'Ada', displayName: null },
  }

  it('mirrors the shape DynamicPage passes on the public surface', () => {
    expect(buildTemplatePageProp({
      pageSlug: 'journal/first-post',
      pageCfg: { id: 'p-1', slug: 'first-post', parentId: 'p-0', pageType: 'article' },
      render,
      locale: 'it',
      title: 'First post',
    })).toEqual({
      id: 'p-1',
      slug: 'first-post',
      title: 'First post',
      publishedAt: '2026-03-04T00:00:00.000Z',
      author: { userId: 'u-1', name: 'Ada', displayName: null },
      seo: null,
      parentId: 'p-0',
      pageType: 'article',
      locale: 'it',
    })
  })

  it('falls back to the slug path when the config page carries no identity', () => {
    const page = buildTemplatePageProp({
      pageSlug: 'journal/first-post',
      pageCfg: null,
      render,
      locale: 'en-US',
      title: '',
    })

    expect(page.id).toBe('journal/first-post')
    expect(page.slug).toBe('journal/first-post')
    expect(page.parentId).toBeNull()
    expect(page.pageType).toBe('static')
  })
})

describe('pickPageTitle', () => {
  it('prefers the content locale, then en-US, then any value', () => {
    expect(pickPageTitle({ it: 'Ciao', 'en-US': 'Hi' }, 'it')).toBe('Ciao')
    expect(pickPageTitle({ 'en-US': 'Hi', de: 'Hallo' }, 'it')).toBe('Hi')
    expect(pickPageTitle({ de: 'Hallo' }, 'it')).toBe('Hallo')
  })

  it('passes plain strings through and degrades to empty', () => {
    expect(pickPageTitle('Plain', 'it')).toBe('Plain')
    expect(pickPageTitle(null, 'it')).toBe('')
    expect(pickPageTitle({}, 'it')).toBe('')
  })
})

describe('buildPageEndpointParams', () => {
  it('forwards the admin site id and content locale', () => {
    expect(buildPageEndpointParams({ path: 'journal/post', siteId: 'site-1', locale: 'it' }))
      .toEqual({ path: 'journal/post', site: 'site-1', locale: 'it' })
  })

  it('omits empty optionals rather than sending blanks', () => {
    expect(buildPageEndpointParams({ path: 'journal', siteId: '', locale: null }))
      .toEqual({ path: 'journal' })
  })
})

describe('describeFetchError', () => {
  it('prefers the h3 statusMessage', () => {
    expect(describeFetchError({ data: { statusMessage: 'Page not found: x' } })).toBe('Page not found: x')
    expect(describeFetchError({ statusMessage: 'Unauthorized' })).toBe('Unauthorized')
    expect(describeFetchError(new Error('boom'))).toBe('boom')
  })

  it('never returns an empty string', () => {
    expect(describeFetchError(undefined)).toMatch(/preview/i)
  })
})

describe('resolveTemplateComponent', () => {
  it('mounts the resolved template component', async () => {
    const Template = defineComponent({
      props: { settings: { type: Object, required: true } },
      render() {
        return h('article', { class: 'tpl' }, String(this.settings.showRelated))
      },
    })
    const component = resolveTemplateComponent('standalone', 'templates/article-editorial.vue', async () => Template)

    const wrapper = mount(host(component, { settings: { showRelated: true } }))
    await flushPromises()

    expect(wrapper.find('.tpl').exists()).toBe(true)
    expect(wrapper.text()).toBe('true')
  })

  it('renders a visible red placeholder and logs when the theme cannot resolve the template', async () => {
    // Fail-loud contract: an unknown template id must never render as nothing.
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const component = resolveTemplateComponent('standalone', 'templates/does-not-exist.vue', async () => {
      throw new Error('templateLoader: component templates/does-not-exist.vue not found in theme standalone')
    })

    const wrapper = mount(host(component))
    await flushPromises()

    expect(wrapper.text()).toContain('templates/does-not-exist.vue')
    expect(wrapper.find('.templated-preview-error').exists()).toBe(true)
    expect(error).toHaveBeenCalled()
  })
})

describe('makeTemplateErrorPlaceholder', () => {
  it('is visibly styled, not an invisible node', () => {
    const wrapper = mount(host(makeTemplateErrorPlaceholder('nope')))

    expect(wrapper.text()).toBe('nope')
    expect(wrapper.attributes('style')).toContain('#d93025')
  })
})
