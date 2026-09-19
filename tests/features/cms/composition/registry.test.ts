import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('template registry', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('registers and retrieves a template', async () => {
    const { registerTemplate, getTemplate } = await import('~/shared/features/cms/composition/templates')
    const t = {
      id: 'test-tpl',
      label: { 'en-US': 'Test' },
      description: { 'en-US': '' },
      defaultHeight: 'large' as const,
      roles: {},
      groups: [],
      floaters: {},
      responsive: { stackBelow: 768, stackOrder: [] },
      defaultKnobs: { dominance: 'balanced' as const, overlap: 'normal' as const, alignment: 'balanced' as const, density: 'normal' as const },
    }
    registerTemplate(t)
    expect(getTemplate('test-tpl')).toBe(t)
  })

  it('returns undefined for unknown template', async () => {
    const { getTemplate } = await import('~/shared/features/cms/composition/templates')
    expect(getTemplate('nonexistent')).toBeUndefined()
  })

  it('getAllTemplates includes built-in templates plus custom', async () => {
    const { registerTemplate, getAllTemplates } = await import('~/shared/features/cms/composition/templates')
    const before = getAllTemplates().length
    const base = { label: { 'en-US': '' }, description: { 'en-US': '' }, defaultHeight: 'large' as const, roles: {}, groups: [], floaters: {}, responsive: { stackBelow: 768, stackOrder: [] }, defaultKnobs: { dominance: 'balanced' as const, overlap: 'normal' as const, alignment: 'balanced' as const, density: 'normal' as const } }
    registerTemplate({ ...base, id: 'custom-a' })
    registerTemplate({ ...base, id: 'custom-b' })
    expect(getAllTemplates()).toHaveLength(before + 2)
  })

  it('built-in templates are auto-registered', async () => {
    const { getAllTemplates } = await import('~/shared/features/cms/composition/templates')
    const ids = getAllTemplates().map(t => t.id)
    expect(ids).toContain('asymmetric-hero')
    expect(ids).toContain('offset-media-stack')
    expect(ids).toContain('captioned-editorial-spread')
  })
})
