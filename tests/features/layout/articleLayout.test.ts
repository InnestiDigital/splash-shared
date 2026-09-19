import { describe, it, expect } from 'vitest'
import {
  DEFAULT_LAYOUT_ID,
  mergeLayoutOverrides,
  readLayoutOverrides,
  resolveArticleLayoutId,
  resolveArticleShellLayout,
  type ArticleLayoutSource,
} from '~/shared/features/layout/articleLayout'

function source(partial: Partial<ArticleLayoutSource>): ArticleLayoutSource {
  return { ownLayoutId: null, templateLayoutId: null, overrides: null, ...partial }
}

describe('resolveArticleLayoutId', () => {
  it('prefers the layout authored on the article row', () => {
    const id = resolveArticleLayoutId(
      source({ ownLayoutId: 'scale-canvas', templateLayoutId: 'editorial' }),
      'blank',
    )
    expect(id).toBe('scale-canvas')
  })

  it('falls back to the template layout when the row carries the legacy default', () => {
    const id = resolveArticleLayoutId(
      source({ ownLayoutId: 'default', templateLayoutId: 'editorial' }),
      'blank',
    )
    expect(id).toBe('editorial')
  })

  it('falls back to the parent blog-index when neither row nor template declares one', () => {
    expect(resolveArticleLayoutId(source({ ownLayoutId: 'default' }), 'editorial')).toBe('editorial')
    expect(resolveArticleLayoutId(source({}), 'editorial')).toBe('editorial')
  })

  it('falls back to the parent before the article payload has arrived', () => {
    expect(resolveArticleLayoutId(null, 'editorial')).toBe('editorial')
  })

  it('ends on the default layout when nothing declares one', () => {
    expect(resolveArticleLayoutId(null, null)).toBe(DEFAULT_LAYOUT_ID)
    expect(resolveArticleLayoutId(source({ ownLayoutId: '' }), undefined)).toBe(DEFAULT_LAYOUT_ID)
  })

  it('keeps the template layout for an article with no parent layout', () => {
    expect(resolveArticleLayoutId(source({ templateLayoutId: 'editorial' }), null)).toBe('editorial')
  })
})

describe('readLayoutOverrides', () => {
  it('returns null when meta has no usable overrides', () => {
    expect(readLayoutOverrides(null)).toBeNull()
    expect(readLayoutOverrides({})).toBeNull()
    expect(readLayoutOverrides({ layoutOverrides: 'nope' })).toBeNull()
    expect(readLayoutOverrides({ layoutOverrides: { header: 'nope' } })).toBeNull()
  })

  it('keeps only the known object-shaped sections', () => {
    const overrides = readLayoutOverrides({
      layoutOverrides: {
        header: { enabled: false },
        bogus: { enabled: true },
        footer: 42,
      },
    })
    expect(overrides).toEqual({ header: { enabled: false } })
  })
})

describe('mergeLayoutOverrides', () => {
  it('returns the other side when one is absent', () => {
    expect(mergeLayoutOverrides(null, { header: { enabled: false } })).toEqual({ header: { enabled: false } })
    expect(mergeLayoutOverrides({ header: { enabled: false } }, null)).toEqual({ header: { enabled: false } })
    expect(mergeLayoutOverrides(null, null)).toBeUndefined()
  })

  it('lets the article win key by key over the parent blog-index', () => {
    const merged = mergeLayoutOverrides(
      { header: { enabled: true, morphStyle: 'glass-pill' } },
      { header: { enabled: false } },
    )
    expect(merged?.header).toEqual({ enabled: false, morphStyle: 'glass-pill' })
  })

  it('keeps the parent palette entries the article does not restate', () => {
    const merged = mergeLayoutOverrides(
      { header: { palette: { bgColor: '#fff', textColor: '#000' } } },
      { header: { palette: { textColor: '#111' } } },
    )
    expect(merged?.header?.palette).toEqual({ bgColor: '#fff', textColor: '#111' })
  })

  it('merges nested background groups instead of replacing them', () => {
    const merged = mergeLayoutOverrides(
      { background: { color: '#fff', image: { url: '/a.jpg', opacity: 0.5 } } },
      { background: { image: { opacity: 1 } } },
    )
    expect(merged?.background).toEqual({ color: '#fff', image: { url: '/a.jpg', opacity: 1 } })
  })

  it('merges chrome patches per element id', () => {
    const merged = mergeLayoutOverrides(
      { chrome: { 'reading-progress': { enabled: true, color: '#f00' }, line: { enabled: false } } },
      { chrome: { 'reading-progress': { color: '#00f' } } },
    )
    expect(merged?.chrome).toEqual({
      'reading-progress': { enabled: true, color: '#00f' },
      line: { enabled: false },
    })
  })

  it('merges scroll overrides shallowly', () => {
    const merged = mergeLayoutOverrides({ scroll: { mode: 'normal', smoothScroll: true } }, { scroll: { mode: 'snap' } })
    expect(merged?.scroll).toEqual({ mode: 'snap', smoothScroll: true })
  })
})

describe('resolveArticleShellLayout', () => {
  it('frames an article in its own layout with its own overrides on top of the section\u2019s', () => {
    const shell = resolveArticleShellLayout({
      article: source({
        ownLayoutId: 'editorial',
        overrides: { header: { palette: { textColor: '#111' } } },
      }),
      parentLayoutId: 'scale-canvas',
      parentMeta: { layoutOverrides: { header: { palette: { bgColor: '#fff' } }, footer: { enabled: false } } },
    })

    expect(shell).toEqual({
      id: 'editorial',
      overrides: {
        header: { palette: { bgColor: '#fff', textColor: '#111' } },
        footer: { enabled: false },
      },
    })
  })

  it('inherits the parent blog section when the article declares nothing', () => {
    const shell = resolveArticleShellLayout({
      article: source({ ownLayoutId: DEFAULT_LAYOUT_ID }),
      parentLayoutId: 'scale-canvas',
      parentMeta: { layoutOverrides: { scroll: { mode: 'snap' } } },
    })

    expect(shell).toEqual({ id: 'scale-canvas', overrides: { scroll: { mode: 'snap' } } })
  })

  it('reports no overrides rather than an empty object when neither side declares any', () => {
    const shell = resolveArticleShellLayout({
      article: source({ templateLayoutId: 'editorial' }),
      parentLayoutId: null,
      parentMeta: { title: 'not a layout override' },
    })

    expect(shell).toEqual({ id: 'editorial', overrides: null })
  })

  it('falls back to the default layout with no article at all', () => {
    expect(resolveArticleShellLayout({ article: null, parentLayoutId: null, parentMeta: null }))
      .toEqual({ id: DEFAULT_LAYOUT_ID, overrides: null })
  })
})
