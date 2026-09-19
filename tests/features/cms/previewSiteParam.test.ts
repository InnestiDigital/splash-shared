// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest'
import { readSiteParam, usePreviewSiteParam } from '~/shared/features/cms/previewSiteParam'

const VALID = '00000000-0000-4000-8000-000000000012'

function setSearch(search: string) {
  window.history.replaceState({}, '', `/__preview${search}`)
}

afterEach(() => setSearch(''))

describe('readSiteParam', () => {
  it('accepts a well-formed uuid', () => {
    expect(readSiteParam(VALID)).toBe(VALID)
  })

  it('accepts a seeded deterministic id whose version nibble is not 4', () => {
    expect(readSiteParam('00000000-0000-0000-0000-000000000012')).toBe(
      '00000000-0000-0000-0000-000000000012',
    )
  })

  it('takes the first entry of a repeated param rather than serialising an array', () => {
    expect(readSiteParam([VALID, 'other'])).toBe(VALID)
  })

  it('rejects non-uuid values so the request falls back to hostname resolution', () => {
    for (const bad of ['', 'not-a-uuid', '../etc', 42, null, undefined, {}]) {
      expect(readSiteParam(bad)).toBeNull()
    }
  })
})

describe('usePreviewSiteParam', () => {
  it('returns an empty object on the public site — the request must not change', () => {
    setSearch('')
    expect(usePreviewSiteParam()()).toEqual({})
  })

  it('scopes the request inside the admin preview iframe', () => {
    // The failure this exists to prevent: on the platform domain the hostname
    // names no tenant, so an unscoped call 404s "Site not found for hostname".
    setSearch(`?site=${VALID}`)
    expect(usePreviewSiteParam()()).toEqual({ site: VALID })
  })

  it('re-reads on each call, so re-pointing the iframe does not need a remount', () => {
    const param = usePreviewSiteParam()
    setSearch('')
    expect(param()).toEqual({})
    setSearch(`?site=${VALID}`)
    expect(param()).toEqual({ site: VALID })
  })

  it('ignores a malformed site param instead of forwarding it', () => {
    setSearch('?site=bogus')
    expect(usePreviewSiteParam()()).toEqual({})
  })
})
