import type { CompositionTemplate, CompositionItem, CompositionRole } from './types'

export interface ValidationError {
  code: string
  message: string
  role?: string
  itemId?: string
}

export function validateTemplate(template: CompositionTemplate): ValidationError[] {
  const errors: ValidationError[] = []
  const roleNames = Object.keys(template.roles)
  const groupIds = new Set(template.groups.map(g => g.id))

  // Every role must be in a group or a floater
  const placedRoles = new Set<string>()
  for (const group of template.groups) {
    for (const role of group.roles) placedRoles.add(role)
  }
  for (const role of Object.keys(template.floaters)) placedRoles.add(role)

  for (const role of roleNames) {
    if (!placedRoles.has(role)) {
      errors.push({ code: 'role-unplaced', message: `Role "${role}" not in any group or floater`, role })
    }
  }

  // Group anchor cycle detection
  const visited = new Set<string>()
  const inStack = new Set<string>()
  function dfs(gid: string): boolean {
    if (inStack.has(gid)) return true
    if (visited.has(gid)) return false
    visited.add(gid)
    inStack.add(gid)
    const group = template.groups.find(g => g.id === gid)
    if (group && group.anchor !== 'canvas') {
      if (dfs(group.anchor)) return true
    }
    inStack.delete(gid)
    return false
  }
  for (const g of template.groups) {
    if (dfs(g.id)) {
      errors.push({ code: 'anchor-cycle', message: 'Group anchor cycle detected' })
      break
    }
  }

  // Floater anchor must reference a defined group
  for (const [role, placement] of Object.entries(template.floaters)) {
    if (!groupIds.has(placement.anchor)) {
      errors.push({ code: 'floater-anchor-undefined', message: `Floater "${role}" anchors to undefined group "${placement.anchor}"`, role })
    }
  }

  // stackOrder completeness
  const hidden = new Set(template.responsive.hideOnStack ?? [])
  const stacked = new Set(template.responsive.stackOrder)
  for (const role of roleNames) {
    if (!hidden.has(role as CompositionRole) && !stacked.has(role as CompositionRole)) {
      errors.push({ code: 'stackorder-incomplete', message: `Role "${role}" missing from stackOrder`, role })
    }
  }

  return errors
}

export function validateItems(items: CompositionItem[], template: CompositionTemplate): ValidationError[] {
  const errors: ValidationError[] = []

  // Duplicate IDs
  const ids = new Set<string>()
  for (const item of items) {
    if (ids.has(item.id)) errors.push({ code: 'duplicate-id', message: `Duplicate id "${item.id}"`, itemId: item.id })
    ids.add(item.id)
  }

  // Cardinality
  const roleCounts = new Map<string, number>()
  for (const item of items) roleCounts.set(item.role, (roleCounts.get(item.role) ?? 0) + 1)

  for (const [role, def] of Object.entries(template.roles)) {
    const count = roleCounts.get(role) ?? 0
    const min = def.min ?? (def.required ? 1 : 0)
    const max = def.max ?? 1
    if (count < min) errors.push({ code: 'missing-required', message: `Required role "${role}" missing`, role })
    if (count > max) errors.push({ code: 'exceeds-max', message: `Role "${role}" exceeds max ${max}`, role })
  }

  // Required cannot be invisible
  for (const item of items) {
    const def = template.roles[item.role]
    if (def?.required && !item.visible) {
      errors.push({ code: 'required-invisible', message: `Required role "${item.role}" invisible`, role: item.role, itemId: item.id })
    }
  }

  return errors
}
