import { describe, expect, it } from 'vitest'
import { planSectionTypeRoles } from '~/shared/features/cms/sectionTypeRoles'
import type { SectionTypeSchema } from '~/shared/types/sectionTypes'

const schema: SectionTypeSchema = {
  type: 'editorial-split',
  label: 'Split',
  description: '',
  usesContainer: true,
  layoutSlots: [
    { role: 'section-heading', required: true, multiple: false },
    { role: 'editorial-body', required: true, multiple: true },
  ],
  settings: [],
  groups: [],
}

describe('planSectionTypeRoles', () => {
  it('repairs unsupported and duplicate roles, then fills unambiguous required slots', () => {
    const roles: Record<string, string[]> = {
      Heading: ['section-heading'],
      Paragraph: ['editorial-body'],
    }
    const plan = planSectionTypeRoles(schema, [
      { id: 'heading-1', type: 'Heading', layoutRole: 'section-heading' },
      { id: 'heading-2', type: 'Heading', layoutRole: 'section-heading' },
      { id: 'body-1', type: 'Paragraph', layoutRole: 'media-gallery' },
    ], type => roles[type] ?? [])

    expect(plan).toEqual({
      assignments: [
        { blockId: 'heading-1', layoutRole: 'section-heading' },
        { blockId: 'heading-2', layoutRole: null },
        { blockId: 'body-1', layoutRole: 'editorial-body' },
      ],
      clearedCount: 2,
      autoAssignedCount: 1,
      unassignedCount: 1,
    })
  })

  it('counts blocks left without any role after planning', () => {
    const schema = {
      type: 'editorial-split',
      layoutSlots: [
        { role: 'section-heading', required: true, multiple: false },
        { role: 'media-gallery', required: false, multiple: true },
      ],
    } as any
    // hero-mimic: compatible ONLY with optional slots, so auto-assignment
    // never places it — the S8 prod scenario (blank published section).
    const plan = planSectionTypeRoles(schema, [
      { id: 'hero-1', type: 'Hero', layoutRole: null },
      { id: 'hero-2', type: 'Hero', layoutRole: null },
    ], () => ['media-gallery', 'section-cta'])

    expect(plan.autoAssignedCount).toBe(0)
    expect(plan.unassignedCount).toBe(2)
    expect(plan.assignments.every(a => a.layoutRole === null)).toBe(true)
  })
})
