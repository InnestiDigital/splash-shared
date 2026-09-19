/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed } from 'vue'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

vi.stubGlobal('computed', computed)

vi.mock('~/shared/features/cms/sectionSchemas', () => ({
  getSectionTypeSchema: () => null,
}))

vi.mock('~/shared/composables/useSectionReveal', () => ({
  useSectionReveal: () => {},
}))

import SectionRenderer from '~/shared/features/cms/SectionRenderer.vue'

/** Every custom color field, with the `--custom-section-*` var it drives. */
const CUSTOM_COLOR_FIELDS = {
  customBgColor: '--custom-section-bg',
  customTextColor: '--custom-section-text',
  customAccentColor: '--custom-section-accent',
  customBorderColor: '--custom-section-border',
  customSurfaceColor: '--custom-section-surface',
  customTextMuted: '--custom-section-text-muted',
  customTextFaint: '--custom-section-text-faint',
} as const

const SAMPLE_VALUES: Record<keyof typeof CUSTOM_COLOR_FIELDS, string> = {
  customBgColor: '#101010',
  customTextColor: '#202020',
  customAccentColor: '#303030',
  customBorderColor: '#404040',
  customSurfaceColor: '#505050',
  customTextMuted: '#606060',
  customTextFaint: '#707070',
}

function makeSection(overrides: Record<string, any> = {}) {
  return {
    id: 'sec-1',
    name: 'Test',
    anchor: null,
    isHidden: false,
    colorScheme: 'custom',
    sectionRole: null,
    sectionType: 'stacked',
    containerMode: 'measure',
    position: 0,
    sectionSpaceY: 'md',
    containerInsetX: 'md',
    revealPreset: null,
    revealOverrides: null,
    defaultBlockEntrance: null,
    layoutConfig: null,
    ...overrides,
  }
}

function styleOf(section: Record<string, any>): string {
  const wrapper = mount(SectionRenderer, {
    props: { section, blocksByRole: {}, themeName: 'standalone' },
  })
  return wrapper.find('.section-renderer').attributes('style') ?? ''
}

/** `--custom-section-*` names the scoped `&--custom` SCSS rule actually reads. */
function customVarsReadBySCSS(): Set<string> {
  const source = readFileSync(
    resolve(__dirname, '../../../../shared/features/cms/SectionRenderer.vue'),
    'utf-8',
  )
  const block = source.match(/&--custom\s*\{([\s\S]*?)\n {2}\}/)
  if (!block) throw new Error('Could not locate the &--custom SCSS rule in SectionRenderer.vue')
  const names = block[1].match(/var\(\s*(--custom-section-[a-z-]+)/g) ?? []
  return new Set(names.map(n => n.replace(/^var\(\s*/, '')))
}

describe('SectionRenderer custom color scheme', () => {
  it('emits nothing for a non-custom scheme even when the fields are set', () => {
    const style = styleOf(makeSection({
      colorScheme: 'light',
      layoutConfig: { ...SAMPLE_VALUES },
    }))
    expect(style).not.toContain('--custom-section-')
  })

  it.each(Object.entries(CUSTOM_COLOR_FIELDS))(
    'maps %s to %s',
    (field, cssVar) => {
      const value = SAMPLE_VALUES[field as keyof typeof SAMPLE_VALUES]
      const style = styleOf(makeSection({ layoutConfig: { [field]: value } }))
      expect(style).toContain(`${cssVar}: ${value}`)
    },
  )

  it('omits the var for a field left unset', () => {
    const style = styleOf(makeSection({ layoutConfig: { customBgColor: '#101010' } }))
    expect(style).toContain('--custom-section-bg: #101010')
    expect(style).not.toContain('--custom-section-surface')
    expect(style).not.toContain('--custom-section-text-muted')
  })

  // The bug this guards: the computed and the SCSS drifted apart in both
  // directions at once — it wrote text-muted/text-faint that the type never
  // declared, while never emitting the surface var the SCSS reads.
  it('emits exactly the set of vars the custom SCSS rule reads', () => {
    const style = styleOf(makeSection({ layoutConfig: { ...SAMPLE_VALUES } }))
    const emitted = new Set(
      (style.match(/--custom-section-[a-z-]+/g) ?? []),
    )
    expect(emitted).toEqual(customVarsReadBySCSS())
  })
})

describe('SectionCustomColorFields type coverage', () => {
  it('declares one field per emitted var', () => {
    const source = readFileSync(
      resolve(__dirname, '../../../../shared/types/sectionTypes.ts'),
      'utf-8',
    )
    const block = source.match(/interface SectionCustomColorFields \{([\s\S]*?)\n\}/)
    if (!block) throw new Error('Could not locate SectionCustomColorFields in sectionTypes.ts')
    const declared = new Set(
      (block[1].match(/^\s{2}(\w+)\?:/gm) ?? []).map(l => l.trim().replace(/\?:$/, '')),
    )
    expect(declared).toEqual(new Set(Object.keys(CUSTOM_COLOR_FIELDS)))
  })
})
