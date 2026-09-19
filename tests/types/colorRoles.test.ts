import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  COLOR_ROLES,
  COLOR_ROLE_SCHEMES,
  COLOR_ROLE_SLOTS,
  DEFAULT_COLOR_ROLE_BINDINGS,
  colorRoleCssVar,
  isColorRole,
} from '~/shared/types/colorRoles'
import { resolvePaletteCssVar } from '~/shared/color/colorPalette'

const ROOT = resolve(__dirname, '../../..')

function readSectionRendererScss(): string {
  return readFileSync(resolve(ROOT, 'shared/features/cms/SectionRenderer.vue'), 'utf8')
}

function readStandaloneThemeSettings() {
  const manifest = JSON.parse(readFileSync(resolve(ROOT, 'themes/standalone/theme.json'), 'utf8'))
  return manifest.settings as Array<{ id: string; type?: string; cssVar?: boolean | string }>
}

describe('color role vocabulary', () => {
  it('is the full scheme × slot product', () => {
    expect(COLOR_ROLES).toHaveLength(COLOR_ROLE_SCHEMES.length * COLOR_ROLE_SLOTS.length)
    expect(new Set(COLOR_ROLES).size).toBe(COLOR_ROLES.length)
  })

  it('recognizes vocabulary members and rejects everything else', () => {
    expect(isColorRole('light-bg')).toBe(true)
    expect(isColorRole('transparent-inverse-text')).toBe(true)
    expect(isColorRole('bg')).toBe(false)
    expect(isColorRole('light-nope')).toBe(false)
    expect(isColorRole('')).toBe(false)
    expect(isColorRole(null)).toBe(false)
    expect(isColorRole(42)).toBe(false)
  })

  it('fits the role column (varchar 50)', () => {
    for (const role of COLOR_ROLES) {
      expect(role.length).toBeLessThanOrEqual(50)
    }
  })

  it('maps a role to its css custom property', () => {
    expect(colorRoleCssVar('dark-inverse-bg')).toBe('--role-dark-inverse-bg')
  })
})

// Drift guard. The vocabulary is only meaningful because SectionRenderer
// consumes exactly these var names; a role nothing reads is dead, and a var
// the renderer reads but the vocabulary rejects can never be bound (the
// service refuses the write and the emitter skips it).
describe('SectionRenderer var consumption', () => {
  const scss = readSectionRendererScss()
  const consumed = new Set(
    [...scss.matchAll(/var\(\s*(--role-[a-z-]+)/g)].map(m => m[1]),
  )

  it('reads a --role-* var for every declared role', () => {
    const missing = COLOR_ROLES.filter(role => !consumed.has(colorRoleCssVar(role)))
    expect(missing).toEqual([])
  })

  it('reads no --role-* var outside the vocabulary', () => {
    const known = new Set(COLOR_ROLES.map(colorRoleCssVar))
    expect([...consumed].filter(v => !known.has(v))).toEqual([])
  })

  it('gives every --role-* read a fallback, so an unbound site is unchanged', () => {
    // `var(--role-x, <fallback>)` — never a bare `var(--role-x)`, which would
    // render the slot invalid rather than falling back to the palette.
    const bare = [...scss.matchAll(/var\(\s*--role-[a-z-]+\s*\)/g)].map(m => m[0])
    expect(bare).toEqual([])
  })
})

describe('DEFAULT_COLOR_ROLE_BINDINGS', () => {
  const settings = readStandaloneThemeSettings()

  it('names only roles in the vocabulary', () => {
    const unknown = Object.keys(DEFAULT_COLOR_ROLE_BINDINGS).filter(role => !isColorRole(role))
    expect(unknown).toEqual([])
  })

  it('names only palette entries the standalone theme actually declares', () => {
    const unresolvable = Object.entries(DEFAULT_COLOR_ROLE_BINDINGS)
      .filter(([, key]) => resolvePaletteCssVar(settings, key) === null)
      .map(([role, key]) => `${role} -> ${key}`)
    expect(unresolvable).toEqual([])
  })

  // Each default must name the palette entry that slot's SectionRenderer
  // fallback already points at, or binding the defaults would repaint the site.
  it('reproduces the fallback each slot hardcodes', () => {
    const scss = readSectionRendererScss()
    for (const [role, paletteKey] of Object.entries(DEFAULT_COLOR_ROLE_BINDINGS)) {
      const cssVar = resolvePaletteCssVar(settings, paletteKey)
      const declaration = scss.match(
        new RegExp(`var\\(${colorRoleCssVar(role)},([^\\n]*)`),
      )
      expect(declaration, `no declaration reads ${colorRoleCssVar(role)}`).not.toBeNull()
      expect(declaration![1], `${role} default disagrees with its fallback`).toContain(`--${cssVar}`)
    }
  })
})
