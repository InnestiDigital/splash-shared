// shared/typography/typographySlots.ts
import type { SystemRole, TypographySnapshotPreset, TypographySnapshotRoles } from '~/server/services/typography/typographyTypes'

export interface TypographySlotSchema {
  slot: string
  label: string
  defaultRole: SystemRole
}

/**
 * Derives the flat settings key for a typography slot.
 * Invariant: `${slot}PresetKey` — no manual mapping.
 */
export function slotToSettingsKey(slot: string): string {
  return `${slot}PresetKey`
}

export interface InheritedLabelResult {
  presetName: string
  roleName: string
  isUnmapped: boolean
}

/**
 * Resolves the inherited (default) label for a typography slot.
 * Follows the chain: slot.defaultRole → roles[role] → preset.name
 */
export function resolveInheritedLabel(
  slot: TypographySlotSchema,
  roles: TypographySnapshotRoles,
  presets: TypographySnapshotPreset[],
): InheritedLabelResult {
  const roleName = slot.defaultRole
  const presetKey = roles[roleName]

  if (!presetKey) {
    return { presetName: '', roleName, isUnmapped: true }
  }

  const preset = presets.find(p => p.key === presetKey)
  if (!preset) {
    return { presetName: '', roleName, isUnmapped: true }
  }

  return { presetName: preset.name, roleName, isUnmapped: false }
}
