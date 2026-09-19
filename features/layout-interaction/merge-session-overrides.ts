import type { PositionedItemAuthored, SessionLayoutOverride } from './types'
import { SCHEMA_VERSION } from './constants'

export type MergeContext = { configVersion: string | number; layoutFingerprint: string }

export function mergeSessionOverrides<T extends PositionedItemAuthored>(
  authored: readonly T[],
  override: SessionLayoutOverride | null,
  context: MergeContext,
): T[] {
  const usable =
    override !== null &&
    override.schemaVersion === SCHEMA_VERSION &&
    override.configVersion === context.configVersion &&
    override.layoutFingerprint === context.layoutFingerprint

  if (!usable) return [...authored]

  const by = new Map<string, { positionX: number; positionY: number }>()
  for (const row of override!.items) by.set(row.id, { positionX: row.positionX, positionY: row.positionY })

  return authored.map(item => {
    const ov = by.get(item.id)
    return ov ? { ...item, positionX: ov.positionX, positionY: ov.positionY } : item
  })
}
