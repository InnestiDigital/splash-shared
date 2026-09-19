import type { CompositionItem, CompositionTemplate, CompositionRole } from './types'

export interface MappingResult {
  items: CompositionItem[]
  warnings: string[]
}

export function mapItemsToTemplate(
  currentItems: CompositionItem[],
  fromTemplate: CompositionTemplate,
  toTemplate: CompositionTemplate,
): MappingResult {
  const warnings: string[] = []
  const result: CompositionItem[] = []
  const toRoles = new Set(Object.keys(toTemplate.roles))

  // Preserve items whose role exists in target template
  for (const item of currentItems) {
    if (toRoles.has(item.role)) {
      result.push({ ...item })
    } else {
      const label = item.role
      const hasContent = item.media?.src || (item.textContent && Object.values(item.textContent).some(v => v))
      if (hasContent) {
        warnings.push(`"${label}" does not exist in ${toTemplate.label['en-US'] || toTemplate.id} — content will be lost`)
      }
    }
  }

  // Create missing required roles
  for (const [role, def] of Object.entries(toTemplate.roles)) {
    if (def.required && !result.some(i => i.role === role)) {
      result.push({
        id: crypto.randomUUID(),
        role: role as CompositionRole,
        visible: true,
        emphasis: def.defaultEmphasis,
      })
    }
  }

  return { items: result, warnings }
}
