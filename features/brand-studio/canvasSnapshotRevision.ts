import type { BrandCanvasSnapshot } from '~/shared/types/brandCanvas'

/**
 * Canonical JSON for optimistic approval checks. Snapshot settings are JSON,
 * but object insertion order can differ between a browser response and a DB
 * read, so every object key is sorted recursively before hashing.
 */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const entry = (value as Record<string, unknown>)[key]
      if (entry !== undefined) result[key] = canonicalize(entry)
    }
    return result
  }
  return value
}

export async function computeCanvasSnapshotRevision(snapshot: BrandCanvasSnapshot): Promise<string> {
  const canonical = JSON.stringify(canonicalize(snapshot))
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

export function isCanvasSnapshotRevision(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
}
