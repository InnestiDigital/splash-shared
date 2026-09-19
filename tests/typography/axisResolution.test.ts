import { describe, it, expect } from 'vitest'
import type {
  ThemeAxisDef,
  ThemeVariant,
  ResolvedAxis,
} from '~/shared/typography/axisResolution'
import { inferStep, validateAxisDef, findVariant, resolveAxes, formatFontVariationSettings, axisToLegacyProperties, collectAxisDiagnostics, diffResolvedAxes } from '~/shared/typography/axisResolution'

describe('axisResolution types', () => {
  it('exports the public type surface', () => {
    const _axis: ThemeAxisDef = { min: 0, max: 100, default: 50 }
    const _variant: ThemeVariant = { name: 'x', file: 'x.woff2' }
    const _resolved: ResolvedAxis = { tag: 'wght', value: 400, storedValue: 400, order: 0, outOfRange: false }
    expect(_axis.default).toBe(50)
    expect(_variant.name).toBe('x')
    expect(_resolved.tag).toBe('wght')
  })
})

describe('inferStep', () => {
  it('returns explicit step when provided', () => {
    expect(inferStep({ min: 0, max: 100, default: 50, step: 5 })).toBe(5)
  })
  it('integer-only range → 1', () => {
    expect(inferStep({ min: 100, max: 900, default: 400 })).toBe(1)
    expect(inferStep({ min: 0, max: 1, default: 0 })).toBe(1)
  })
  it('non-integer min → 0.1', () => {
    expect(inferStep({ min: -15, max: 0, default: -2.5 })).toBe(0.1)
  })
  it('non-integer max → 0.1', () => {
    expect(inferStep({ min: 0, max: 1.5, default: 0 })).toBe(0.1)
  })
  it('non-integer default → 0.1', () => {
    expect(inferStep({ min: 0, max: 10, default: 5.5 })).toBe(0.1)
  })
})

describe('validateAxisDef', () => {
  it('accepts a well-formed axis', () => {
    expect(validateAxisDef('wght', { min: 100, max: 900, default: 400 })).toBeNull()
  })
  it('rejects min > max', () => {
    const err = validateAxisDef('wght', { min: 900, max: 100, default: 400 })
    expect(err).toMatch(/min/i)
    expect(err).toMatch(/max/i)
  })
  it('rejects default outside [min, max]', () => {
    expect(validateAxisDef('wght', { min: 100, max: 900, default: 1000 }))
      .toMatch(/default/i)
  })
  it('rejects step ≤ 0', () => {
    expect(validateAxisDef('wght', { min: 0, max: 1, default: 0, step: 0 }))
      .toMatch(/step/i)
  })
  it('rejects missing default', () => {
    expect(validateAxisDef('wght', { min: 0, max: 1 } as any)).toMatch(/default/i)
  })
})

describe('findVariant', () => {
  const variants: ThemeVariant[] = [
    { name: 'inter-regular', family: 'Inter', file: 'Inter-Regular' },
    { name: 'fraunces-vf', family: 'Fraunces', file: 'Fraunces-VF.woff2', variable: true,
      axes: { wght: { min: 100, max: 900, default: 400 } } },
  ]
  it('matches by canonical family', () => {
    expect(findVariant('Fraunces', variants)?.name).toBe('fraunces-vf')
  })
  it('matches by slug name when family absent on a variant', () => {
    expect(findVariant('inter-regular', variants)?.name).toBe('inter-regular')
  })
  it('returns null on no match', () => {
    expect(findVariant('Comic Sans', variants)).toBeNull()
  })
  it('returns null on null/undefined input', () => {
    expect(findVariant(null, variants)).toBeNull()
    expect(findVariant(undefined, variants)).toBeNull()
  })
})

const fraunces: ThemeVariant = {
  name: 'fraunces-vf', family: 'Fraunces', file: 'Fraunces-VF.woff2',
  variable: true,
  axes: {
    wght: { min: 100, max: 900, default: 400, order: 1 },
    opsz: { min: 9, max: 144, default: 14, order: 2 },
    SOFT: { min: 0, max: 100, default: 0, order: 3 },
    WONK: { min: 0, max: 1, default: 0, order: 4, experimental: true },
  },
}
const inter: ThemeVariant = { name: 'inter', family: 'Inter', file: 'Inter.woff2' }

describe('resolveAxes', () => {
  it('returns [] for non-variable font', () => {
    expect(resolveAxes('Inter', null, [inter, fraunces])).toEqual([])
  })
  it('returns [] when fontFamily missing from registry', () => {
    expect(resolveAxes('Comic Sans', { wght: 700 }, [fraunces])).toEqual([])
  })
  it('default merge: no overrides → all theme defaults', () => {
    const out = resolveAxes('Fraunces', null, [fraunces])
    expect(out.map(a => [a.tag, a.value])).toEqual([
      ['wght', 400], ['opsz', 14], ['SOFT', 0], ['WONK', 0],
    ])
    expect(out.every(a => !a.outOfRange)).toBe(true)
  })
  it('preset override of single axis; others default', () => {
    const out = resolveAxes('Fraunces', { wght: 700 }, [fraunces])
    expect(out.find(a => a.tag === 'wght')!.value).toBe(700)
    expect(out.find(a => a.tag === 'opsz')!.value).toBe(14)
  })
  it('drops preset axes the variant does not declare', () => {
    const out = resolveAxes('Fraunces', { wght: 700, GRAD: 100 }, [fraunces])
    expect(out.find(a => a.tag === 'GRAD')).toBeUndefined()
  })
  it('orders by axis.order, alphabetical fallback', () => {
    const noOrder: ThemeVariant = {
      name: 'nv', family: 'NV', file: 'x', variable: true,
      axes: { ZZZ: { min: 0, max: 1, default: 0 }, AAA: { min: 0, max: 1, default: 0 } },
    }
    expect(resolveAxes('NV', null, [noOrder]).map(a => a.tag)).toEqual(['AAA', 'ZZZ'])
  })
  it('clamps out-of-range stored value at emit; storedValue retained', () => {
    const out = resolveAxes('Fraunces', { wght: 950 }, [fraunces])
    const wght = out.find(a => a.tag === 'wght')!
    expect(wght.value).toBe(900)
    expect(wght.storedValue).toBe(950)
    expect(wght.outOfRange).toBe(true)
  })
  it('does not mutate the input presetAxes object (recoverability)', () => {
    const stored = { wght: 950 }
    resolveAxes('Fraunces', stored, [fraunces])
    expect(stored.wght).toBe(950)
  })
  it('drops malformed axes; valid siblings still resolve', () => {
    const broken: ThemeVariant = {
      name: 'b', family: 'B', file: 'x', variable: true,
      axes: {
        wght: { min: 900, max: 100, default: 400 }, // malformed: min > max
        opsz: { min: 9, max: 144, default: 14 },     // valid
      },
    }
    const out = resolveAxes('B', null, [broken])
    expect(out.map(a => a.tag)).toEqual(['opsz'])
  })
  it('variable variant with empty axes:{} → empty result', () => {
    const v: ThemeVariant = { name: 'v', family: 'V', file: 'x', variable: true, axes: {} }
    expect(resolveAxes('V', { wght: 400 }, [v])).toEqual([])
  })
  it('variable variant with no axes key → empty result', () => {
    const v: ThemeVariant = { name: 'v', family: 'V', file: 'x', variable: true }
    expect(resolveAxes('V', { wght: 400 }, [v])).toEqual([])
  })
})

describe('formatFontVariationSettings', () => {
  it('formats axes in resolved order', () => {
    const axes: ResolvedAxis[] = [
      { tag: 'wght', value: 550, storedValue: 550, order: 1, outOfRange: false },
      { tag: 'opsz', value: 72,  storedValue: 72,  order: 2, outOfRange: false },
      { tag: 'SOFT', value: 30,  storedValue: 30,  order: 3, outOfRange: false },
    ]
    expect(formatFontVariationSettings(axes))
      .toBe('"wght" 550, "opsz" 72, "SOFT" 30')
  })
  it('emits zero values (needed for axis interpolation)', () => {
    const axes: ResolvedAxis[] = [
      { tag: 'ital', value: 0, storedValue: 0, order: 1, outOfRange: false },
      { tag: 'slnt', value: 0, storedValue: 0, order: 2, outOfRange: false },
    ]
    expect(formatFontVariationSettings(axes)).toBe('"ital" 0, "slnt" 0')
  })
  it('returns empty string on empty input', () => {
    expect(formatFontVariationSettings([])).toBe('')
  })
})

const axis = (tag: string, value: number, order = 0): ResolvedAxis => ({
  tag, value, storedValue: value, order, outOfRange: false,
})

describe('axisToLegacyProperties', () => {
  it('wght → font-weight', () => {
    expect(axisToLegacyProperties([axis('wght', 550)]))
      .toEqual({ 'font-weight': '550' })
  })
  it('wdth → font-stretch (with %)', () => {
    expect(axisToLegacyProperties([axis('wdth', 120)]))
      .toEqual({ 'font-stretch': '120%' })
  })
  it('opsz present → font-optical-sizing: none', () => {
    expect(axisToLegacyProperties([axis('opsz', 72)]))
      .toEqual({ 'font-optical-sizing': 'none' })
  })
  it('ital=1 wins font-style as italic', () => {
    expect(axisToLegacyProperties([axis('ital', 1), axis('slnt', -10)]))
      .toMatchObject({ 'font-style': 'italic' })
  })
  it('ital=0 + slnt non-zero → oblique Ndeg', () => {
    expect(axisToLegacyProperties([axis('ital', 0), axis('slnt', -10)]))
      .toMatchObject({ 'font-style': 'oblique -10deg' })
  })
  it('ital=0 + slnt=0 → no font-style emitted', () => {
    const out = axisToLegacyProperties([axis('ital', 0), axis('slnt', 0)])
    expect(out['font-style']).toBeUndefined()
  })
  it('non-mapped tags emit nothing', () => {
    expect(axisToLegacyProperties([axis('SOFT', 30)])).toEqual({})
  })
  it('combines multiple mappings', () => {
    const out = axisToLegacyProperties([
      axis('wght', 550), axis('opsz', 72), axis('SOFT', 30),
    ])
    expect(out).toEqual({
      'font-weight': '550',
      'font-optical-sizing': 'none',
    })
  })
})

describe('diffResolvedAxes', () => {
  const openSans: ThemeVariant = { name: 'open-sans', family: 'Open Sans', file: 'OpenSans.woff2' }

  it('variable → static: all variable axes reported as lost', () => {
    const diff = diffResolvedAxes('Fraunces', 'Open Sans', { wght: 700, opsz: 96 }, [fraunces, openSans])
    expect(diff.lostTags).toEqual(expect.arrayContaining(['wght', 'opsz', 'SOFT', 'WONK']))
    expect(diff.gainedTags).toHaveLength(0)
  })

  it('variable → variable with no axis overlap: loses previous, gains next', () => {
    const other: ThemeVariant = {
      name: 'other-vf', family: 'Other', file: 'Other.woff2', variable: true,
      axes: { GRAD: { min: -200, max: 150, default: 0 } },
    }
    const diff = diffResolvedAxes('Fraunces', 'Other', null, [fraunces, other])
    expect(diff.lostTags).toContain('wght')
    expect(diff.gainedTags).toContain('GRAD')
  })

  it('no-op (same family): empty lostTags and gainedTags', () => {
    const diff = diffResolvedAxes('Fraunces', 'Fraunces', null, [fraunces])
    expect(diff.lostTags).toHaveLength(0)
    expect(diff.gainedTags).toHaveLength(0)
  })

  it('static → static: both empty', () => {
    const diff = diffResolvedAxes('Open Sans', 'Open Sans', null, [openSans])
    expect(diff.lostTags).toHaveLength(0)
    expect(diff.gainedTags).toHaveLength(0)
  })

  it('previousAxes contains the resolved axes for the old family', () => {
    const diff = diffResolvedAxes('Fraunces', 'Open Sans', null, [fraunces, openSans])
    expect(diff.previousAxes.map(a => a.tag)).toEqual(['wght', 'opsz', 'SOFT', 'WONK'])
    expect(diff.nextAxes).toHaveLength(0)
  })

  it('null/undefined families handled gracefully', () => {
    const diff = diffResolvedAxes(null, undefined, null, [fraunces])
    expect(diff.lostTags).toHaveLength(0)
    expect(diff.gainedTags).toHaveLength(0)
  })
})

describe('collectAxisDiagnostics', () => {
  it('reports malformed axes per variant', () => {
    const variants: ThemeVariant[] = [
      { name: 'b', family: 'B', file: 'x', variable: true,
        axes: { wght: { min: 900, max: 100, default: 400 } } },
    ]
    const diags = collectAxisDiagnostics(variants)
    expect(diags).toHaveLength(1)
    expect(diags[0]!.variantName).toBe('b')
    expect(diags[0]!.tag).toBe('wght')
    expect(diags[0]!.message).toMatch(/min/i)
  })
  it('returns [] for clean registry', () => {
    expect(collectAxisDiagnostics([
      { name: 'g', family: 'G', file: 'x', variable: true,
        axes: { wght: { min: 100, max: 900, default: 400 } } },
    ])).toEqual([])
  })
  it('ignores non-variable variants', () => {
    expect(collectAxisDiagnostics([
      { name: 's', family: 'S', file: 'x' },
    ])).toEqual([])
  })
})
