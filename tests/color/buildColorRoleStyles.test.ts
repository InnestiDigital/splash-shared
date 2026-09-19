import { describe, it, expect } from 'vitest'
import { buildColorRoleStyles } from '~/shared/color/buildColorRoleStyles'
import { listPaletteEntries, resolvePaletteCssVar } from '~/shared/color/colorPalette'
import type { PaletteSettingField } from '~/shared/color/colorPalette'

const SETTINGS: PaletteSettingField[] = [
  { id: 'primaryColor', type: 'color', cssVar: 'color-primary', default: '#108A00', label: 'Primary' },
  { id: 'backgroundColor', type: 'color', cssVar: 'color-background', default: '#FFFFFF' },
  { id: 'darkBgColor', type: 'color', cssVar: 'color-dark-bg', default: '#1a1a1a' },
  // cssVar: true → the var name is kebab-cased from the id, exactly as
  // splitThemeSettingsByCssVar does when it puts the value on the page.
  { id: 'brandTintColor', type: 'color', cssVar: true, default: '#abcdef' },
  // A color with no cssVar has nothing for a role to point at.
  { id: 'swatchOnly', type: 'color', default: '#123456' },
  // A cssVar that is not a color is not a palette entry.
  { id: 'containerMaxWidth', type: 'number', cssVar: 'container-max-width', default: 1200 },
]

describe('resolvePaletteCssVar', () => {
  it('returns the declared css var name', () => {
    expect(resolvePaletteCssVar(SETTINGS, 'primaryColor')).toBe('color-primary')
  })

  it('kebab-cases the setting id when cssVar is true', () => {
    expect(resolvePaletteCssVar(SETTINGS, 'brandTintColor')).toBe('brand-tint-color')
  })

  it('returns null for a color with no css var', () => {
    expect(resolvePaletteCssVar(SETTINGS, 'swatchOnly')).toBeNull()
  })

  it('returns null for a non-color setting even when it has a css var', () => {
    expect(resolvePaletteCssVar(SETTINGS, 'containerMaxWidth')).toBeNull()
  })

  it('returns null for an id the manifest does not declare', () => {
    expect(resolvePaletteCssVar(SETTINGS, 'nopeColor')).toBeNull()
  })

  it('returns null when there are no settings at all', () => {
    expect(resolvePaletteCssVar(undefined, 'primaryColor')).toBeNull()
  })
})

describe('listPaletteEntries', () => {
  it('keeps only colors that carry a css var, in manifest order', () => {
    expect(listPaletteEntries(SETTINGS).map(e => e.id)).toEqual([
      'primaryColor', 'backgroundColor', 'darkBgColor', 'brandTintColor',
    ])
  })

  it('carries the declared default through for display', () => {
    expect(listPaletteEntries(SETTINGS)[0]).toMatchObject({
      id: 'primaryColor', cssVar: 'color-primary', default: '#108A00', label: 'Primary',
    })
  })

  it('returns an empty list when the manifest declares no settings', () => {
    expect(listPaletteEntries(undefined)).toEqual([])
  })
})

describe('buildColorRoleStyles', () => {
  it('emits one --role-* declaration per bound role, pointing at the palette var', () => {
    const css = buildColorRoleStyles({ 'light-bg': 'backgroundColor' }, SETTINGS)
    expect(css).toBe(':root {\n  --role-light-bg: var(--color-background);\n}')
  })

  it('applies the given scope selector', () => {
    const css = buildColorRoleStyles({ 'dark-bg': 'darkBgColor' }, SETTINGS, '[data-site-root]')
    expect(css.startsWith('[data-site-root] {')).toBe(true)
  })

  it('emits every bound role in one rule', () => {
    const css = buildColorRoleStyles({
      'light-bg': 'backgroundColor',
      'light-accent': 'primaryColor',
      'dark-bg': 'darkBgColor',
    }, SETTINGS)
    expect(css).toContain('--role-light-bg: var(--color-background);')
    expect(css).toContain('--role-light-accent: var(--color-primary);')
    expect(css).toContain('--role-dark-bg: var(--color-dark-bg);')
    expect(css.match(/:root \{/g)).toHaveLength(1)
  })

  // Fail-soft is the contract: the section scheme's own fallback then supplies
  // the historical value, so an unresolvable role is a no-op rather than a
  // wrong color.
  it('skips a role whose palette key the theme does not declare', () => {
    const css = buildColorRoleStyles({
      'light-bg': 'colorFromSomeOtherTheme',
      'light-accent': 'primaryColor',
    }, SETTINGS)
    expect(css).not.toContain('--role-light-bg')
    expect(css).toContain('--role-light-accent: var(--color-primary);')
  })

  it('skips a role bound to a non-color setting', () => {
    expect(buildColorRoleStyles({ 'light-bg': 'containerMaxWidth' }, SETTINGS)).toBe('')
  })

  it('skips a role name outside the vocabulary', () => {
    expect(buildColorRoleStyles({ 'made-up-role': 'primaryColor' }, SETTINGS)).toBe('')
  })

  it('skips a role with an empty palette key', () => {
    expect(buildColorRoleStyles({ 'light-bg': '' }, SETTINGS)).toBe('')
  })

  // The C1 exit criterion: a site that has bound nothing emits nothing, so its
  // rendered CSS is byte-identical to before the tier existed.
  it('emits nothing for an unbound site', () => {
    expect(buildColorRoleStyles({}, SETTINGS)).toBe('')
    expect(buildColorRoleStyles(undefined, SETTINGS)).toBe('')
  })

  it('emits nothing when the theme manifest has no settings', () => {
    expect(buildColorRoleStyles({ 'light-bg': 'backgroundColor' }, undefined)).toBe('')
  })
})
