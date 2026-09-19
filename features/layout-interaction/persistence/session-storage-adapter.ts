import type { PositionedItemAuthored, SessionLayoutOverride } from '../types'
import type { LayoutPersistenceAdapter } from './adapter'
import { SCHEMA_VERSION } from '../constants'
import { composeSessionKey } from '../session-key'
import { mergeSessionOverrides } from '../merge-session-overrides'

export function createSessionStorageAdapter<T extends PositionedItemAuthored>(
  opts: { namespace: string },
): LayoutPersistenceAdapter<T> {
  function getStore(): Storage | null {
    return typeof window !== 'undefined' ? window.sessionStorage : null
  }
  function key(ctx: { blockId: string; configVersion: string | number; layoutFingerprint: string }) {
    return composeSessionKey({
      namespace: opts.namespace,
      blockId: ctx.blockId,
      configVersion: ctx.configVersion,
      layoutFingerprint: ctx.layoutFingerprint,
    })
  }

  // Sweep overrides belonging to a *previous* published version. After a
  // republish the active configVersion advances AND every block is re-minted
  // with a fresh instance id in the new snapshot, so the prior key (old
  // configVersion AND old blockId) is never read again. Keying the sweep on the
  // blockId would miss it — the blockId churned too. Scope by namespace +
  // configVersion instead: drop any override for this namespace whose embedded
  // configVersion differs from the one being hydrated. Sibling blocks in the
  // SAME version share the current configVersion, so they survive. This keeps
  // sessionStorage bounded AND makes "override cleared after a configVersion
  // bump" observable (no stale-version key lingers).
  function keyConfigVersion(k: string): string | null {
    const m = k.match(/:v:(.*?):h:/)
    return m ? m[1] : null
  }
  function sweepStaleVersions(store: Storage, currentConfigVersion: string | number) {
    const prefix = `${opts.namespace}:`
    const current = String(currentConfigVersion)
    const stale: string[] = []
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i)
      if (!k || !k.startsWith(prefix)) continue
      const cv = keyConfigVersion(k)
      if (cv !== null && cv !== current) stale.push(k)
    }
    for (const k of stale) store.removeItem(k)
  }

  return {
    hydrate(authored, context) {
      const store = getStore()
      if (!store) return [...authored]
      const k = key(context)
      sweepStaleVersions(store, context.configVersion)
      const raw = store.getItem(k)
      if (raw == null) return mergeSessionOverrides(authored, null, context) as T[]
      let parsed: SessionLayoutOverride | null = null
      try {
        parsed = JSON.parse(raw) as SessionLayoutOverride
      } catch {
        store.removeItem(k)
        console.warn('[layout-interaction] invalid session payload cleared')
        return mergeSessionOverrides(authored, null, context) as T[]
      }
      const usable =
        parsed.schemaVersion === SCHEMA_VERSION &&
        parsed.configVersion === context.configVersion &&
        parsed.layoutFingerprint === context.layoutFingerprint
      if (!usable) {
        store.removeItem(k)
        return mergeSessionOverrides(authored, null, context) as T[]
      }
      return mergeSessionOverrides(authored, parsed, context) as T[]
    },
    commit(patch, context) {
      const store = getStore()
      if (!store) return
      if (patch.positionX === undefined && patch.positionY === undefined) return
      const k = key(context)
      const existingAuthored = context.authoredItems.find(i => i.id === patch.id)
      const x = patch.positionX ?? existingAuthored?.positionX ?? 0
      const y = patch.positionY ?? existingAuthored?.positionY ?? 0
      let payload: SessionLayoutOverride | null = null
      const raw = store.getItem(k)
      if (raw) {
        try {
          payload = JSON.parse(raw) as SessionLayoutOverride
        } catch {
          payload = null
        }
      }
      const ok =
        payload?.schemaVersion === SCHEMA_VERSION &&
        payload?.configVersion === context.configVersion &&
        payload?.layoutFingerprint === context.layoutFingerprint
      const cur: SessionLayoutOverride = ok
        ? payload!
        : {
            schemaVersion: SCHEMA_VERSION,
            configVersion: context.configVersion,
            layoutFingerprint: context.layoutFingerprint,
            items: [],
          }
      const idx = cur.items.findIndex(r => r.id === patch.id)
      const row = { id: patch.id, positionX: x, positionY: y }
      const items = idx >= 0 ? cur.items.map((r, i) => (i === idx ? row : r)) : [...cur.items, row]
      store.setItem(k, JSON.stringify({ ...cur, items }))
    },
    clearOverrides(context) {
      const store = getStore()
      if (!store) return
      store.removeItem(key(context))
    },
  }
}
