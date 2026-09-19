import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { BACKGROUND_ROLES, TEXT_ROLES } from '~/shared/types/placement'

/**
 * Phase F / C2: block color controls are semantic roles.
 *
 * This replaces the SPL-029 `backgroundMode` conventions suite, which pinned
 * the two-field `backgroundMode` + freeform `backgroundColor` pattern that the
 * Color Override Freeze existed to contain. The contract it guards is the
 * inverse one: no block declares a freeform color on the background/text axes,
 * both axes come from the one `color-roles` fragment, and the `{ custom }`
 * escape is reachable only by the data migration — never by an author.
 *
 * See `docs/architecture/color-roles-phase-f.md`.
 */

const THEME_DIR = resolve(__dirname, '../../themes/standalone')
const COMPONENTS_DIR = resolve(THEME_DIR, 'components')

const RETIRED_IDS = ['backgroundMode', 'backgroundColor', 'textColor']

function loadJson(path: string): any {
  return JSON.parse(readFileSync(path, 'utf-8'))
}

function loadAllBlockSchemas(): Array<[string, any]> {
  return readdirSync(COMPONENTS_DIR)
    .filter(f => f.endsWith('.settings.json'))
    .map(f => [f, loadJson(resolve(COMPONENTS_DIR, f))] as [string, any])
}

const schemas = loadAllBlockSchemas()
const fragment = loadJson(resolve(THEME_DIR, 'settings-fragments/color-roles.json'))
const adopters = schemas.filter(([, s]) => (s.$fragments ?? []).includes('color-roles'))

function fragmentSetting(id: string): any {
  return fragment.settings.find((s: any) => s.id === id)
}

function optionValues(setting: any): string[] {
  return (setting.options ?? []).map((o: any) => o.value)
}

describe('the color-roles fragment', () => {
  it('is the single declaration of both axes, and every block reaches it', () => {
    expect(adopters.length).toBeGreaterThan(0)
    for (const [file, schema] of adopters) {
      const localIds = (schema.settings ?? []).map((s: any) => s.id)
      expect(localIds, `${file} redefines a fragment-owned id locally`)
        .not.toContain('background')
      expect(localIds, `${file} redefines a fragment-owned id locally`)
        .not.toContain('textTone')
    }
  })

  it('spells exactly the role vocabularies the renderer resolves', () => {
    expect(optionValues(fragmentSetting('background'))).toEqual([...BACKGROUND_ROLES])
    expect(optionValues(fragmentSetting('textTone'))).toEqual([...TEXT_ROLES])
  })

  it('offers no "custom" option — the escape is migration-only, not authorable', () => {
    for (const id of ['background', 'textTone']) {
      expect(optionValues(fragmentSetting(id)), `${id} must not offer custom`)
        .not.toContain('custom')
    }
  })

  it('places both axes in the style group, not layout', () => {
    for (const id of ['background', 'textTone']) {
      expect(fragmentSetting(id).group, id).toBe('style')
    }
  })
})

describe('block schemas after the freeze lift', () => {
  it('declares none of the retired freeform color settings', () => {
    const offenders: string[] = []
    for (const [file, schema] of schemas) {
      for (const setting of schema.settings ?? []) {
        if (RETIRED_IDS.includes(setting.id)) offenders.push(`${file}:${setting.id}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('overrides only the per-block default, never the vocabulary', () => {
    for (const [file, schema] of adopters) {
      const patch = schema.$fragmentOverrides?.background
      if (!patch) continue
      expect(optionValues(fragmentSetting('background')), `${file} background default`)
        .toContain(patch.default)
      expect(Object.keys(patch), `${file} may not re-spell fragment-owned keys`)
        .not.toContain('options')
    }
  })

  it('omits an axis rather than shipping a control the block cannot render', () => {
    for (const [file, schema] of adopters) {
      for (const omitted of schema.$fragmentOmit ?? []) {
        if (omitted === 'background' || omitted === 'textTone') {
          expect(schema.$fragmentOverrides?.[omitted], `${file} overrides an omitted ${omitted}`)
            .toBeUndefined()
        }
      }
    }
  })
})

describe('presets and theme defaults carry role values only', () => {
  it('writes no retired color id into any preset', () => {
    const offenders: string[] = []
    for (const [file, schema] of schemas) {
      for (const preset of schema.presets ?? []) {
        for (const key of Object.keys(preset.settings ?? {})) {
          if (RETIRED_IDS.includes(key)) offenders.push(`${file}:${key}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('writes only in-vocabulary role values into presets', () => {
    const offenders: string[] = []
    for (const [file, schema] of schemas) {
      for (const preset of schema.presets ?? []) {
        const settings = preset.settings ?? {}
        if (settings.background !== undefined && !BACKGROUND_ROLES.includes(settings.background)) {
          offenders.push(`${file}: background=${JSON.stringify(settings.background)}`)
        }
        if (settings.textTone !== undefined && !TEXT_ROLES.includes(settings.textTone)) {
          offenders.push(`${file}: textTone=${JSON.stringify(settings.textTone)}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('writes only in-vocabulary role values into theme.json blockDefaults', () => {
    const blockDefaults = loadJson(resolve(THEME_DIR, 'theme.json')).blockDefaults ?? {}
    const offenders: string[] = []

    for (const [blockType, defaults] of Object.entries<any>(blockDefaults)) {
      for (const id of RETIRED_IDS) {
        if (id in defaults) offenders.push(`${blockType}: retired ${id}`)
      }
      if (defaults.background !== undefined && !BACKGROUND_ROLES.includes(defaults.background)) {
        offenders.push(`${blockType}: background=${JSON.stringify(defaults.background)}`)
      }
      if (defaults.textTone !== undefined && !TEXT_ROLES.includes(defaults.textTone)) {
        offenders.push(`${blockType}: textTone=${JSON.stringify(defaults.textTone)}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
