import type { Block } from '~/server/storage/types'
import type { LayoutRole, SectionTypeSchema } from '~/shared/types/sectionTypes'

export interface SectionBlockRoleAssignment {
  blockId: string
  layoutRole: LayoutRole | null
}

export interface SectionTypeRolePlan {
  assignments: SectionBlockRoleAssignment[]
  clearedCount: number
  autoAssignedCount: number
  /**
   * Blocks left with NO role after planning. A non-stacked layout has no
   * outlet for them, so they will not render (SectionRenderer shows a red
   * placeholder instead) — callers must surface this count, not just the
   * auto-assign successes.
   */
  unassignedCount: number
}

type RoleBlock = Pick<Block, 'id' | 'type' | 'layoutRole'>
type CompatibleRoles = (blockType: string) => readonly string[]

/**
 * Build the complete block-role snapshot for a section type transition.
 *
 * Existing assignments survive only when both the destination section and the
 * block schema support them. Historical duplicates in single-value slots are
 * repaired deterministically by keeping the first block in section order.
 * Finally, an unassigned block is placed automatically only when it is the
 * unambiguous candidate for exactly one still-empty required slot.
 */
export function planSectionTypeRoles(
  schema: SectionTypeSchema,
  blocks: readonly RoleBlock[],
  compatibleRolesForType: CompatibleRoles,
): SectionTypeRolePlan {
  const slots = new Map(schema.layoutSlots.map(slot => [slot.role, slot]))
  const counts = new Map<LayoutRole, number>()
  const roles = new Map<string, LayoutRole | null>()
  let clearedCount = 0

  for (const block of blocks) {
    const currentRole = block.layoutRole as LayoutRole | null | undefined
    const slot = currentRole ? slots.get(currentRole) : undefined
    const compatible = currentRole
      ? compatibleRolesForType(block.type).includes(currentRole)
      : false
    const occupied = currentRole ? (counts.get(currentRole) ?? 0) : 0

    if (!currentRole || !slot || !compatible || (!slot.multiple && occupied > 0)) {
      roles.set(block.id, null)
      if (currentRole) clearedCount++
      continue
    }

    roles.set(block.id, currentRole)
    counts.set(currentRole, occupied + 1)
  }

  let autoAssignedCount = 0
  for (const block of blocks) {
    if (roles.get(block.id)) continue

    const candidates = compatibleRolesForType(block.type)
      .filter((role): role is LayoutRole => slots.has(role as LayoutRole))
      .filter((role) => slots.get(role)?.required && (counts.get(role) ?? 0) === 0)

    if (candidates.length !== 1) continue
    const role = candidates[0]
    if (!role) continue
    roles.set(block.id, role)
    counts.set(role, (counts.get(role) ?? 0) + 1)
    autoAssignedCount++
  }

  const assignments = blocks.map(block => ({
    blockId: block.id,
    layoutRole: roles.get(block.id) ?? null,
  }))
  return {
    assignments,
    clearedCount,
    autoAssignedCount,
    unassignedCount: assignments.filter(assignment => assignment.layoutRole === null).length,
  }
}

/** Validate an already-planned role snapshot against section and block schemas. */
export function validateSectionTypeRoles(
  schema: SectionTypeSchema,
  blocks: readonly RoleBlock[],
  compatibleRolesForType: CompatibleRoles,
): string[] {
  const slots = new Map(schema.layoutSlots.map(slot => [slot.role, slot]))
  const counts = new Map<string, number>()
  const errors: string[] = []

  for (const block of blocks) {
    const role = block.layoutRole
    if (!role) continue
    const slot = slots.get(role as LayoutRole)
    if (!slot) {
      errors.push(`Block "${block.id}" uses role "${role}", which is not available in ${schema.type}`)
      continue
    }
    if (!compatibleRolesForType(block.type).includes(role)) {
      errors.push(`Block "${block.id}" (${block.type}) is not compatible with role "${role}"`)
      continue
    }
    counts.set(role, (counts.get(role) ?? 0) + 1)
  }

  for (const slot of schema.layoutSlots) {
    if (!slot.multiple && (counts.get(slot.role) ?? 0) > 1) {
      errors.push(`Role "${slot.role}" accepts only one block`)
    }
  }

  return errors
}
