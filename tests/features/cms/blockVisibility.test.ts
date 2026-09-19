import { describe, it, expect } from 'vitest'
import { resolveBlockVisibility } from '~/shared/features/cms/blockVisibility'

describe('resolveBlockVisibility', () => {
  describe('viewport', () => {
    it('is visible with no placement at all', () => {
      expect(resolveBlockVisibility(undefined, 'desktop', false)).toBe(true)
    })

    it('is visible when hiddenViewports is empty', () => {
      expect(resolveBlockVisibility({ hiddenViewports: [] }, 'desktop', false)).toBe(true)
    })

    it('is hidden at a listed viewport', () => {
      expect(resolveBlockVisibility({ hiddenViewports: ['mobile'] }, 'mobile', false)).toBe(false)
    })

    it('is visible at an unlisted viewport', () => {
      expect(resolveBlockVisibility({ hiddenViewports: ['mobile'] }, 'desktop', false)).toBe(true)
    })

    it('ignores a non-array hiddenViewports', () => {
      expect(resolveBlockVisibility({ hiddenViewports: 'mobile' as any }, 'mobile', false)).toBe(true)
    })
  })

  describe('auth state', () => {
    it('treats absent visibleTo as everyone', () => {
      expect(resolveBlockVisibility({}, 'desktop', false)).toBe(true)
      expect(resolveBlockVisibility({}, 'desktop', true)).toBe(true)
    })

    it("treats explicit 'everyone' as everyone", () => {
      expect(resolveBlockVisibility({ visibleTo: 'everyone' }, 'desktop', false)).toBe(true)
      expect(resolveBlockVisibility({ visibleTo: 'everyone' }, 'desktop', true)).toBe(true)
    })

    it("shows 'auth' only to authenticated visitors", () => {
      expect(resolveBlockVisibility({ visibleTo: 'auth' }, 'desktop', true)).toBe(true)
      expect(resolveBlockVisibility({ visibleTo: 'auth' }, 'desktop', false)).toBe(false)
    })

    it("shows 'guest' only to unauthenticated visitors", () => {
      expect(resolveBlockVisibility({ visibleTo: 'guest' }, 'desktop', false)).toBe(true)
      expect(resolveBlockVisibility({ visibleTo: 'guest' }, 'desktop', true)).toBe(false)
    })

    it('treats an unrecognized visibleTo as everyone', () => {
      expect(resolveBlockVisibility({ visibleTo: 'members-only' as any }, 'desktop', false)).toBe(true)
    })
  })

  describe('both axes', () => {
    it('hides when the viewport hides it even if auth state matches', () => {
      expect(
        resolveBlockVisibility({ visibleTo: 'auth', hiddenViewports: ['mobile'] }, 'mobile', true),
      ).toBe(false)
    })

    it('hides when auth state mismatches even if the viewport allows it', () => {
      expect(
        resolveBlockVisibility({ visibleTo: 'auth', hiddenViewports: ['mobile'] }, 'desktop', false),
      ).toBe(false)
    })

    it('shows only when both axes allow it', () => {
      expect(
        resolveBlockVisibility({ visibleTo: 'auth', hiddenViewports: ['mobile'] }, 'desktop', true),
      ).toBe(true)
    })
  })
})
