const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype'])
const MAX_ARRAY_INDEX = 9999

/**
 * Set a value at a deep path in an object.
 * Supports bracket notation for arrays: "tiles[2].settings.title"
 *
 * @param obj - The object to modify
 * @param path - Dot-separated path (with optional bracket notation for arrays)
 * @param value - The value to set
 * @returns The modified object (mutates in place)
 */
export function deepSet<T extends Record<string, any>>(
  obj: T,
  path: string,
  value: any
): T {
  const keys = parsePath(path)
  let current: any = obj

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]

    // If the next key is a number, we need an array
    const nextKey = keys[i + 1]
    const nextIsArray = typeof nextKey === 'number'

    if (!(key in current)) {
      current[key] = nextIsArray ? [] : {}
    } else if (typeof current[key] !== 'object' || current[key] === null) {
      // Overwrite non-object values
      current[key] = nextIsArray ? [] : {}
    }

    current = current[key]
  }

  const lastKey = keys[keys.length - 1]
  current[lastKey] = value

  return obj
}

/**
 * Parse a path string into an array of keys (strings and numbers).
 * Example: "tiles[2].settings.title" -> ["tiles", 2, "settings", "title"]
 */
function parsePath(path: string): (string | number)[] {
  const keys: (string | number)[] = []
  let current = ''
  let inBracket = false

  for (let i = 0; i < path.length; i++) {
    const char = path[i]

    if (char === '[') {
      if (current) {
        if (FORBIDDEN_KEYS.has(current)) {
          throw new Error(`Forbidden path segment: "${current}"`)
        }
        keys.push(current)
        current = ''
      }
      inBracket = true
    } else if (char === ']') {
      if (inBracket && current) {
        const index = parseInt(current, 10)
        if (isNaN(index)) {
          throw new Error(`Invalid array index in path: ${path}`)
        }
        if (index < 0 || index > MAX_ARRAY_INDEX) {
          throw new Error(`Array index out of bounds in path: ${path}`)
        }
        keys.push(index)
        current = ''
      }
      inBracket = false
    } else if (char === '.' && !inBracket) {
      if (current) {
        if (FORBIDDEN_KEYS.has(current)) {
          throw new Error(`Forbidden path segment: "${current}"`)
        }
        keys.push(current)
        current = ''
      }
    } else {
      current += char
    }
  }

  if (current) {
    if (FORBIDDEN_KEYS.has(current)) {
      throw new Error(`Forbidden path segment: "${current}"`)
    }
    keys.push(current)
  }

  return keys
}

/**
 * Read the value at a deep path, using the same parser `deepSet` writes with.
 *
 * Returns `undefined` for a path that does not resolve — a missing key and a
 * key holding `undefined` are the same thing to every caller here.
 */
export function deepGet(obj: Record<string, any>, path: string): any {
  const keys = parsePath(path)
  let current: any = obj
  for (const key of keys) {
    if (current === null || typeof current !== 'object') return undefined
    current = current[key]
  }
  return current
}
