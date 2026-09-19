import type { ProgramSummary, SiteSummary } from '~/server/storage/types'

/**
 * `GET /api/admin/me/context` — the admin shell's caller-scoped bootstrap.
 *
 * The shell used to resolve "which program / which site am I looking at?" from
 * `GET /api/admin/programs` + `GET /api/admin/sites`. Both are in
 * `ADMIN_ONLY_PATTERNS`, so the 'client' role 403s on both and never gets an
 * `activeSiteId` — every site-scoped store then short-circuits on its
 * "no site selected" guard and the Brand Studio opens as an empty shell.
 *
 * This endpoint answers the same question WITHOUT a tenant collection: it
 * reports only what the calling session may already reach. Widening the two
 * collection endpoints was the alternative and was rejected — a collection
 * response can carry another tenant's records, and no filter on it is as
 * self-evidently safe as never assembling one.
 *
 * The two variants are the two honest answers, chosen by role rather than
 * invented: a session scoped to one program gets that program, an admin (whose
 * context IS the whole install) is told to use the collections it already owns.
 */

/**
 * The session is scoped to a single program. `sites` is the intersection of
 * that program and the caller's explicit site assignments — the same pair of
 * checks `adminAuth` enforces for site-scoped API calls. An empty list is an
 * intentional deny-by-default state, never shorthand for "all program sites".
 */
export interface AdminContextScoped {
  scope: 'program'
  program: ProgramSummary
  sites: SiteSummary[]
  /**
   * Client role: the brand preset an admin pinned to this account, the only
   * one it may generate within (`resolvePresetScope`). `null` for every role
   * that is not pinned, and for a client an admin has not assigned one to yet.
   */
  pinnedPresetId: string | null
}

/**
 * The caller is an admin. Its context is every program and every site in the
 * install, which is precisely what `GET /api/admin/programs` and
 * `GET /api/admin/sites` already return — so this variant deliberately carries
 * no records. Answering with "the first program" would be an invention, and
 * duplicating the collections here would be a second source of truth.
 */
export interface AdminContextInstallWide {
  scope: 'install'
  pinnedPresetId: string | null
}

export type AdminContextResponse = AdminContextScoped | AdminContextInstallWide
