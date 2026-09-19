import { describe, it, expect } from 'vitest'
import enUS from '~/shared/i18n/locales/en-US.json'
import enCA from '~/shared/i18n/locales/en-CA.json'
import itLocale from '~/shared/i18n/locales/it.json'

/**
 * en-US is the reference catalog: every theme `t('ns.key', 'English default')`
 * call is only genuinely localized when the key exists in the OTHER locale's
 * bundle too — otherwise vue-i18n silently renders the literal default param,
 * in English, regardless of the resolved locale (this is exactly what let
 * "No pages in this section yet." and 20 other strings render in English on
 * an Italian-default site: `childPageList.empty` etc. had no catalog entry
 * in ANY locale, so the English literal fallback always won).
 *
 * en-CA and fr-CA are deliberately NOT asserted for full parity here — both
 * are known, much larger, pre-existing incomplete catalogs (630 and 671
 * missing keys respectively, almost entirely the `admin.*` namespace)
 * unrelated to this fix. Only the specific keys this fix added are checked
 * against en-CA below, to guard against regressing those without taking on
 * the pre-existing admin-namespace gap as new scope.
 */
function flatten(obj: Record<string, unknown>, prefix = ''): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(out, flatten(value as Record<string, unknown>, path))
    } else {
      out[path] = value
    }
  }
  return out
}

describe('locale catalog parity', () => {
  const en = flatten(enUS as Record<string, unknown>)

  it('it.json has every key en-US.json declares', () => {
    const it_ = flatten(itLocale as Record<string, unknown>)
    const missing = Object.keys(en).filter(k => !(k in it_))
    expect(missing).toEqual([])
  })

  it('en-CA.json carries the theme-i18n keys this fix added', () => {
    const ca = flatten(enCA as Record<string, unknown>)
    const addedByThisFix = [
      'articles.empty', 'articles.loadError', 'articles.placeInBlog', 'articles.undated',
      'audioPlaylist.empty', 'childPageList.empty', 'documentList.empty',
      'gallery.close', 'gallery.next', 'gallery.previous', 'gallery.viewer', 'gallery.zoom',
      'hero.scrollToNext', 'login.error', 'login.signedIn', 'login.signOut', 'login.submit',
      'materialsBoard.all', 'materialsBoard.filtersLabel',
      'videoBlock.addFile', 'videoBlock.playVideo',
    ]
    const missing = addedByThisFix.filter(k => !(k in ca))
    expect(missing).toEqual([])
  })

  describe('representative strings resolve to real translations, not English fallback', () => {
    it.each([
      ['childPageList.empty', 'No pages in this section yet.', 'Ancora nessuna pagina in questa sezione.'],
      ['eventCalendar.empty', 'No upcoming events.', 'Nessun appuntamento in programma.'],
      ['gallery.close', 'Close', 'Chiudi'],
      ['hero.scrollToNext', 'Scroll to next section', 'Scorri alla sezione successiva'],
    ])('%s', (path, expectedEn, expectedIt) => {
      const key = path.split('.')
      const readPath = (bundle: Record<string, unknown>) =>
        key.reduce<unknown>((acc, k) => (acc as Record<string, unknown> | undefined)?.[k], bundle)

      expect(readPath(enUS as Record<string, unknown>)).toBe(expectedEn)
      const italian = readPath(itLocale as Record<string, unknown>)
      expect(italian).toBe(expectedIt)
      // The whole point: the Italian value must differ from the English
      // default the component would otherwise silently fall back to.
      expect(italian).not.toBe(expectedEn)
    })
  })
})
