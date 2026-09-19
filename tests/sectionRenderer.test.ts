import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'fs'
import { resolve } from 'path'

// Extract the grouping logic into a testable pure function.
// This mirrors the buildBlocksByRole logic from DynamicPage/preview.
function groupBlocksByRole(
  blocks: Array<{ layoutRole?: string | null; id: string; type: string }>,
  validRoles: Set<string> | null,
): Record<string, any[]> {
  const byRole: Record<string, any[]> = { _default: [] }
  for (const block of blocks) {
    let role = block.layoutRole || '_default'
    // Incompatible role → unroled
    if (role !== '_default' && validRoles && !validRoles.has(role)) {
      role = '_default'
    }
    if (!byRole[role]) byRole[role] = []
    byRole[role].push(block)
  }
  return byRole
}

describe('blocksByRole grouping', () => {
  it('groups blocks by layoutRole', () => {
    const blocks = [
      { id: '1', type: 'editorial-text', layoutRole: 'section-heading' },
      { id: '2', type: 'editorial-text', layoutRole: 'editorial-body' },
      { id: '3', type: 'grid-block', layoutRole: 'media-gallery' },
    ]
    const validRoles = new Set(['section-heading', 'editorial-body', 'media-gallery'])
    const result = groupBlocksByRole(blocks, validRoles)

    expect(result['section-heading']).toHaveLength(1)
    expect(result['editorial-body']).toHaveLength(1)
    expect(result['media-gallery']).toHaveLength(1)
    expect(result._default).toHaveLength(0)
  })

  it('sends blocks without layoutRole to _default', () => {
    const blocks = [
      { id: '1', type: 'editorial-text', layoutRole: null },
      { id: '2', type: 'grid-block' },
    ]
    const result = groupBlocksByRole(blocks, null)
    expect(result._default).toHaveLength(2)
  })

  it('sends blocks with incompatible roles to _default', () => {
    const blocks = [
      { id: '1', type: 'editorial-text', layoutRole: 'section-heading' },
      { id: '2', type: 'grid-block', layoutRole: 'media-gallery' },
    ]
    // Only section-heading is valid for this section type
    const validRoles = new Set(['section-heading'])
    const result = groupBlocksByRole(blocks, validRoles)

    expect(result['section-heading']).toHaveLength(1)
    expect(result._default).toHaveLength(1) // media-gallery → _default
    expect(result['media-gallery']).toBeUndefined()
  })

  it('groups hero blocks by role (section-heading, media-gallery, section-cta)', () => {
    const blocks = [
      { id: '1', type: 'editorial-text', layoutRole: 'section-heading' },
      { id: '2', type: 'image-banner', layoutRole: 'media-gallery' },
      { id: '3', type: 'cta-section', layoutRole: 'section-cta' },
      { id: '4', type: 'hero-block', layoutRole: null },
    ]
    const validRoles = new Set(['section-heading', 'media-gallery', 'section-cta'])
    const result = groupBlocksByRole(blocks, validRoles)

    expect(result['section-heading']).toHaveLength(1)
    expect(result['media-gallery']).toHaveLength(1)
    expect(result['section-cta']).toHaveLength(1)
    expect(result._default).toHaveLength(1) // unroled hero-banner → _default
  })

  it('allows all roles when validRoles is null (stacked)', () => {
    const blocks = [
      { id: '1', type: 'editorial-text', layoutRole: 'section-heading' },
    ]
    const result = groupBlocksByRole(blocks, null)
    expect(result['section-heading']).toHaveLength(1)
  })

  it('groups gallery blocks with multiple media-gallery entries', () => {
    const blocks = [
      { id: '1', type: 'editorial-text', layoutRole: 'section-heading' },
      { id: '2', type: 'image-banner', layoutRole: 'media-gallery' },
      { id: '3', type: 'image-banner', layoutRole: 'media-gallery' },
      { id: '4', type: 'image-banner', layoutRole: 'media-gallery' },
      { id: '5', type: 'cta-section', layoutRole: 'section-cta' },
    ]
    const validRoles = new Set(['section-heading', 'editorial-body', 'media-gallery', 'section-cta'])
    const result = groupBlocksByRole(blocks, validRoles)

    expect(result['section-heading']).toHaveLength(1)
    expect(result['media-gallery']).toHaveLength(3)
    expect(result['section-cta']).toHaveLength(1)
    expect(result._default).toHaveLength(0)
  })

  it('accepts editorial-body in gallery context', () => {
    const blocks = [
      { id: '1', type: 'image-banner', layoutRole: 'media-gallery' },
      { id: '2', type: 'editorial-text', layoutRole: 'editorial-body' },
    ]
    // Gallery now accepts editorial-body
    const validRoles = new Set(['section-heading', 'editorial-body', 'media-gallery', 'section-cta'])
    const result = groupBlocksByRole(blocks, validRoles)

    expect(result['media-gallery']).toHaveLength(1)
    expect(result['editorial-body']).toHaveLength(1)
    expect(result._default).toHaveLength(0)
  })
})

/**
 * Mirrors the admin picker logic from SectionSettings.vue → compatibleBlockTypesForRole().
 * Loads all block schemas from disk and filters by compatibleSectionRoles.
 */
function loadAllBlockSchemas(): Record<string, any> {
  const componentsDir = resolve(__dirname, '../../themes/standalone/components')
  const files = readdirSync(componentsDir).filter(f => f.endsWith('.settings.json'))
  const schemas: Record<string, any> = {}
  for (const file of files) {
    const schema = JSON.parse(readFileSync(resolve(componentsDir, file), 'utf-8'))
    if (schema.type) schemas[schema.type] = schema
  }
  return schemas
}

function compatibleBlockTypesForRole(
  allSchemas: Record<string, any>,
  role: string,
): string[] {
  const result: string[] = []
  for (const [blockType, schema] of Object.entries(allSchemas)) {
    const compatible: string[] = schema?.compatibleSectionRoles ?? []
    if (compatible.includes(role)) result.push(blockType)
  }
  return result
}

describe('section-heading role block filtering (SPL-017)', () => {
  const schemas = loadAllBlockSchemas()

  it('hero-block is NOT listed as compatible with section-heading role', () => {
    const compatible = compatibleBlockTypesForRole(schemas, 'section-heading')
    expect(compatible).not.toContain('hero-block')
  })

  it('page-header remains compatible with section-heading role', () => {
    const compatible = compatibleBlockTypesForRole(schemas, 'section-heading')
    expect(compatible).toContain('page-header')
  })

  it('chapter-divider remains compatible with section-heading role', () => {
    const compatible = compatibleBlockTypesForRole(schemas, 'section-heading')
    expect(compatible).toContain('chapter-divider')
  })

  it('editorial-text remains compatible with section-heading role', () => {
    const compatible = compatibleBlockTypesForRole(schemas, 'section-heading')
    expect(compatible).toContain('editorial-text')
  })

  it('hero-block is compatible with media-gallery role (SPL-034)', () => {
    expect(schemas['hero-block']).toBeDefined()
    expect(schemas['hero-block'].compatibleSectionRoles).toContain('media-gallery')
    expect(schemas['hero-block'].compatibleSectionRoles).not.toContain('section-heading')
  })
})
