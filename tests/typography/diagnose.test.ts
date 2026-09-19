import { describe, it, expect } from 'vitest'
import {
  diagnoseTypography,
  filterBySeverity,
  formatDiagnostics,
  type TypographyDiagnostic,
} from '~/shared/typography/diagnose'
import { createEmptyUsageIndex } from '~/shared/typography/usageIndex'

function preset(key: string, name: string, isActive = true) {
  return { key, name, isActive }
}

describe('diagnoseTypography — block slot references', () => {
  it('flags an invalid block slot reference as error', () => {
    const index = createEmptyUsageIndex()
    index.blockSlot['ghost'] = 3

    const results = diagnoseTypography(
      [preset('body', 'Body')],
      {},
      index,
    )
    // The 'body' preset is also unused → info diagnostic, so just assert
    // the specific error we care about is present.
    const err = results.find(d => d.code === 'invalid-block-slot-ref')
    expect(err).toBeDefined()
    expect(err!.severity).toBe('error')
    expect(err!.key).toBe('ghost')
    expect(err!.count).toBe(3)
  })

  it('flags an inactive block slot reference as warning', () => {
    const index = createEmptyUsageIndex()
    index.blockSlot['old'] = 2

    const results = diagnoseTypography(
      [preset('old', 'Old', false)],
      {},
      index,
    )
    const warning = results.find(d => d.code === 'inactive-block-slot-ref')
    expect(warning).toBeDefined()
    expect(warning!.severity).toBe('warning')
    expect(warning!.count).toBe(2)
  })

  it('does not flag valid active block slot references', () => {
    const index = createEmptyUsageIndex()
    index.blockSlot['body'] = 5

    const results = diagnoseTypography(
      [preset('body', 'Body')],
      {},
      index,
    )
    // Body is referenced → not unused. And valid active → no error/warning.
    expect(results.filter(d => d.severity !== 'info')).toEqual([])
  })
})

describe('diagnoseTypography — richtext references', () => {
  it('flags invalid paragraph references as error', () => {
    const index = createEmptyUsageIndex()
    index.richTextParagraph['missing'] = 4

    const results = diagnoseTypography([], {}, index)
    expect(results[0].code).toBe('invalid-richtext-paragraph-ref')
    expect(results[0].count).toBe(4)
  })

  it('flags inactive paragraph references as warning', () => {
    const index = createEmptyUsageIndex()
    index.richTextParagraph['stale'] = 1

    const results = diagnoseTypography(
      [preset('stale', 'Stale', false)],
      {},
      index,
    )
    expect(results.some(d => d.code === 'inactive-richtext-paragraph-ref')).toBe(true)
  })

  it('flags invalid inline mark references as error', () => {
    const index = createEmptyUsageIndex()
    index.richTextInline['gone'] = 2

    const results = diagnoseTypography([], {}, index)
    expect(results[0].code).toBe('invalid-richtext-inline-ref')
    expect(results[0].count).toBe(2)
  })
})

describe('diagnoseTypography — role mappings', () => {
  it('flags a role mapped to a missing preset as error', () => {
    const index = createEmptyUsageIndex()
    const results = diagnoseTypography(
      [preset('body', 'Body')],
      { heading1: 'nope' },
      index,
    )
    const err = results.find(d => d.code === 'dangling-role-ref')
    expect(err).toBeDefined()
    expect(err!.severity).toBe('error')
    expect(err!.key).toBe('heading1')
  })

  it('flags a role mapped to an inactive preset as warning', () => {
    const index = createEmptyUsageIndex()
    const results = diagnoseTypography(
      [preset('body', 'Body', false)],
      { body: 'body' },
      index,
    )
    const warn = results.find(d => d.code === 'inactive-role-ref')
    expect(warn).toBeDefined()
    expect(warn!.severity).toBe('warning')
    expect(warn!.key).toBe('body')
  })

  it('ignores role mappings where the preset key is null/undefined', () => {
    const index = createEmptyUsageIndex()
    const results = diagnoseTypography(
      [preset('body', 'Body')],
      { heading1: null, heading2: undefined } as any,
      index,
    )
    expect(results.filter(d => d.code.includes('role'))).toEqual([])
  })
})

describe('diagnoseTypography — unused presets', () => {
  it('flags active presets with zero references as info', () => {
    const index = createEmptyUsageIndex()
    const results = diagnoseTypography(
      [preset('body', 'Body'), preset('unused', 'Unused')],
      { body: 'body' },
      index,
    )
    const unused = results.filter(d => d.code === 'unused-preset')
    expect(unused).toHaveLength(1)
    expect(unused[0].key).toBe('unused')
    expect(unused[0].severity).toBe('info')
  })

  it('does not flag inactive presets as unused', () => {
    const index = createEmptyUsageIndex()
    const results = diagnoseTypography(
      [preset('old', 'Old', false)],
      {},
      index,
    )
    expect(results.filter(d => d.code === 'unused-preset')).toEqual([])
  })

  it('counts a preset as used if it appears in any reference type', () => {
    const index = createEmptyUsageIndex()
    index.richTextInline['rare'] = 1
    const results = diagnoseTypography(
      [preset('rare', 'Rare')],
      {},
      index,
    )
    expect(results.filter(d => d.code === 'unused-preset')).toEqual([])
  })
})

describe('filterBySeverity', () => {
  const results: TypographyDiagnostic[] = [
    { code: 'unused-preset', severity: 'info', key: 'a', message: 'i' },
    { code: 'inactive-role-ref', severity: 'warning', key: 'b', message: 'w' },
    { code: 'dangling-role-ref', severity: 'error', key: 'c', message: 'e' },
  ]

  it('returns all when threshold is info', () => {
    expect(filterBySeverity(results, 'info')).toHaveLength(3)
  })

  it('drops info when threshold is warning', () => {
    const filtered = filterBySeverity(results, 'warning')
    expect(filtered).toHaveLength(2)
    expect(filtered.every(d => d.severity !== 'info')).toBe(true)
  })

  it('returns only errors when threshold is error', () => {
    const filtered = filterBySeverity(results, 'error')
    expect(filtered).toHaveLength(1)
    expect(filtered[0].severity).toBe('error')
  })
})

describe('formatDiagnostics', () => {
  it('returns "(none)" for empty input', () => {
    expect(formatDiagnostics([])).toBe('(none)')
  })

  it('formats each diagnostic on its own line with severity prefix', () => {
    const out = formatDiagnostics([
      { code: 'dangling-role-ref', severity: 'error', key: 'body', message: 'missing' },
      { code: 'unused-preset', severity: 'info', key: 'x', message: 'unused' },
    ])
    expect(out).toContain('[ERROR] dangling-role-ref: missing')
    expect(out).toContain('[INFO] unused-preset: unused')
    expect(out.split('\n')).toHaveLength(2)
  })
})
