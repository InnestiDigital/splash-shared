import type { PositionedItemAuthored } from './types'

export function computeLayoutFingerprint(items: PositionedItemAuthored[]): string {
  const canonical = [...items]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map(i => [i.id, i.positionX, i.positionY, i.width, i.height, i.rotation, i.zIndex].join(','))
    .join('|')
  return fnv1aBase36(canonical)
}

function fnv1aBase36(input: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = (h * 0x01000193) >>> 0
  }
  return h.toString(36)
}
