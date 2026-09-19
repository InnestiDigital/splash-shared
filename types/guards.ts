/**
 * Structural guards shared by the brand wire contracts. One definition —
 * the ten per-file copies this replaces had drifted: one dropped the
 * Array.isArray exclusion, letting an array default-export pass as a record.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isNullableRecord(value: unknown): value is Record<string, unknown> | null {
  return value === null || isRecord(value)
}

export function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}
