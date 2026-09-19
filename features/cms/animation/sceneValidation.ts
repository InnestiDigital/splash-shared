import type { AnimationScene } from '~/shared/types/animation'
import {
  entrancePresets,
  loopPresets,
  scrollPresets,
  hoverPresets,
  pathPresets,
} from '~/shared/features/cms/animation/presets'
import type { PresetMeta } from '~/shared/features/cms/animation/presets/types'

export const PROPERTY_CHANNELS = [
  'transform',
  'opacity',
  'blur',
  'clip-path',
  'color',
  'background-color',
  'motion-path',
] as const

export type PropertyChannel = string  // includes CSS var names like '--motion-tint'

export interface ValidationIssue {
  level: 'error' | 'warn'
  code: string
  message: string
  entryIds: string[]
  target?: { blockId: string; part: string }
  channel?: PropertyChannel
}

const ALL_PRESETS: PresetMeta[] = [
  ...entrancePresets,
  ...loopPresets,
  ...scrollPresets,
  ...hoverPresets,
  ...pathPresets,
]

export function getChannelsForPreset(presetId: string): PropertyChannel[] {
  const meta = ALL_PRESETS.find(p => p.id === presetId)
  if (!meta) return []
  const out = meta.factory()
  return out.channels ?? []
}

export function getPresetCategory(presetId: string): PresetMeta['category'] | null {
  const meta = ALL_PRESETS.find(p => p.id === presetId)
  return meta?.category ?? null
}

// ---------------------------------------------------------------------------
// Block descriptor — enriched block info for choreography validation
// ---------------------------------------------------------------------------

export interface BlockDescriptor {
  id: string
  type: string
  sectionId?: string
}

// ---------------------------------------------------------------------------
// validateScene
// ---------------------------------------------------------------------------

export function validateScene(scene: AnimationScene): ValidationIssue[] {
  const out: ValidationIssue[] = []
  for (const entry of scene.entries) {
    if (!entry.presetId) {
      // Entries with explicit keyframes but no presetId are valid "detached" entries
      // (e.g., seeded demo scenes with custom var keyframes). Only warn if the entry
      // also has no keyframes — that would be truly incomplete.
      if (!entry.keyframes || entry.keyframes.length === 0) {
        out.push({
          level: 'error',
          code: 'missing-preset',
          message: `Entry ${entry.id} has no presetId and no keyframes`,
          entryIds: [entry.id],
        })
      }
      continue
    }
    const category = getPresetCategory(entry.presetId)
    if (!category) {
      out.push({
        level: 'error',
        code: 'unknown-preset',
        message: `Entry ${entry.id} references unknown preset "${entry.presetId}"`,
        entryIds: [entry.id],
      })
      continue
    }
    if (entry.target.entityType !== 'block') {
      out.push({
        level: 'error',
        code: 'unsupported-target-type',
        message: `Entry ${entry.id} targets unsupported entity type "${entry.target.entityType}" (B1 only supports block)`,
        entryIds: [entry.id],
      })
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// validateChoreography — choreography-specific validation for scenes with sectionId
// ---------------------------------------------------------------------------

export function validateChoreography(
  scene: AnimationScene,
  blockDescriptors?: BlockDescriptor[],
): ValidationIssue[] {
  if (!scene.sectionId) return []
  const issues: ValidationIssue[] = []

  // Rule: sectionId must be non-empty
  if (scene.sectionId.trim() === '') {
    issues.push({
      level: 'error',
      code: 'empty-section-id',
      message: `Choreography scene ${scene.id} has an empty sectionId`,
      entryIds: scene.entries.map(e => e.id),
    })
  }

  // Rule: trigger anchor must reference entityType 'section'
  const trigger = scene.trigger
  let anchorRef: import('~/shared/types/animation').TargetRef | null = null
  if (trigger.type === 'scroll' && trigger.anchor !== 'viewport') {
    anchorRef = trigger.anchor
  } else if (trigger.type === 'intersection') {
    anchorRef = trigger.anchor
  } else if (trigger.type === 'event' && trigger.source !== 'page') {
    anchorRef = trigger.source
  }

  if (!anchorRef || anchorRef.entityType !== 'section') {
    issues.push({
      level: 'error',
      code: 'choreography-anchor-not-section',
      message: `Choreography scene ${scene.id} must have a trigger anchor targeting entityType 'section'`,
      entryIds: scene.entries.map(e => e.id),
    })
  }

  // Rule: no duplicate (blockId, part) within one choreography
  const seen = new Set<string>()
  for (const entry of scene.entries) {
    if (entry.target.entityType !== 'block') continue
    const key = `${entry.target.entityId}/${entry.target.part}`
    if (seen.has(key)) {
      issues.push({
        level: 'error',
        code: 'duplicate-choreography-target',
        message: `Duplicate target (${entry.target.entityId}, ${entry.target.part}) in choreography scene ${scene.id}`,
        entryIds: [entry.id],
        target: { blockId: entry.target.entityId, part: entry.target.part },
      })
    }
    seen.add(key)
  }

  // Rule: every entry target must belong to sectionId (requires block descriptors)
  if (blockDescriptors && blockDescriptors.length > 0) {
    const sectionBlockIds = new Set(
      blockDescriptors
        .filter(b => b.sectionId === scene.sectionId)
        .map(b => b.id),
    )
    for (const entry of scene.entries) {
      if (entry.target.entityType !== 'block') continue
      if (!sectionBlockIds.has(entry.target.entityId)) {
        issues.push({
          level: 'error',
          code: 'entry-not-in-section',
          message: `Entry ${entry.id} targets block ${entry.target.entityId} which does not belong to section ${scene.sectionId}`,
          entryIds: [entry.id],
          target: { blockId: entry.target.entityId, part: entry.target.part },
        })
      }
    }
  }

  return issues
}

// ---------------------------------------------------------------------------
// validateSceneSet — cross-scene, channel-granular conflict detection
// ---------------------------------------------------------------------------

interface NormalizedEntry {
  entryId: string
  sceneId: string
  blockId: string
  part: string
  presetId: string
  category: PresetMeta['category']
  channels: PropertyChannel[]
  triggerType: AnimationScene['trigger']['type']
}

function normalize(scenes: AnimationScene[]): NormalizedEntry[] {
  const out: NormalizedEntry[] = []
  for (const scene of scenes) {
    for (const entry of scene.entries) {
      if (!entry.presetId || entry.target.entityType !== 'block') continue
      const category = getPresetCategory(entry.presetId)
      if (!category) continue
      out.push({
        entryId: entry.id,
        sceneId: scene.id,
        blockId: entry.target.entityId,
        part: entry.target.part,
        presetId: entry.presetId,
        category,
        channels: getChannelsForPreset(entry.presetId),
        triggerType: scene.trigger.type,
      })
    }
  }
  return out
}

function targetKeyOf(n: NormalizedEntry): string {
  return `${n.blockId}/${n.part}`
}

function writesTransform(channels: readonly string[]): boolean {
  return channels.includes('transform') || channels.includes('motion-path')
}

function isAllowedPair(a: NormalizedEntry, b: NormalizedEntry): boolean {
  const pair = [a.category, b.category].sort().join(',')
  return pair === 'entrance,loop'  // sequenced handoff
}

export function validateSceneSet(
  scenes: AnimationScene[],
  blockDescriptors?: BlockDescriptor[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  for (const scene of scenes) {
    issues.push(...validateScene(scene))
    issues.push(...validateChoreography(scene, blockDescriptors))
  }

  // Cross-scene: at most one choreography per sectionId
  const choreoBySectionId = new Map<string, AnimationScene[]>()
  for (const scene of scenes) {
    if (!scene.sectionId) continue
    const list = choreoBySectionId.get(scene.sectionId) ?? []
    list.push(scene)
    choreoBySectionId.set(scene.sectionId, list)
  }
  for (const [sectionId, sectionScenes] of choreoBySectionId) {
    if (sectionScenes.length > 1) {
      issues.push({
        level: 'error',
        code: 'duplicate-choreography',
        message: `Multiple choreography scenes target section ${sectionId}`,
        entryIds: sectionScenes.flatMap(s => s.entries.map(e => e.id)),
      })
    }
  }

  const byTarget = new Map<string, NormalizedEntry[]>()
  for (const n of normalize(scenes)) {
    const k = targetKeyOf(n)
    let arr = byTarget.get(k)
    if (!arr) { arr = []; byTarget.set(k, arr) }
    arr.push(n)
  }

  for (const [, entries] of byTarget) {
    const loops = entries.filter(e => e.category === 'loop')
    const entrances = entries.filter(e => e.category === 'entrance')

    if (loops.length > 1) {
      issues.push({
        level: 'error',
        code: 'duplicate-loop',
        message: `Multiple loop-category entries on target ${targetKeyOf(loops[0])}`,
        entryIds: loops.map(e => e.entryId),
        target: { blockId: loops[0].blockId, part: loops[0].part },
      })
    }

    if (entrances.length > 1) {
      issues.push({
        level: 'error',
        code: 'duplicate-entrance',
        message: `Multiple entrance-category entries on target ${targetKeyOf(entrances[0])}`,
        entryIds: entrances.map(e => e.entryId),
        target: { blockId: entrances[0].blockId, part: entrances[0].part },
      })
    }

    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i], b = entries[j]

        const aMP = a.channels.includes('motion-path')
        const bMP = b.channels.includes('motion-path')
        const aIsEntrance = a.category === 'entrance'
        const bIsEntrance = b.category === 'entrance'

        // Rule 1 (B2): entrance + motion-path always blocked (even when channels don't overlap)
        if ((aIsEntrance && bMP) || (bIsEntrance && aMP)) {
          issues.push({
            level: 'error',
            code: 'channel-conflict',
            message: `Entrance preset and motion-path preset cannot coexist on target ${targetKeyOf(a)} in B2`,
            entryIds: [a.entryId, b.entryId],
            target: { blockId: a.blockId, part: a.part },
          })
          continue
        }

        // Rule 2: transform-alias normalization (motion-path implies transform)
        if (writesTransform(a.channels) && writesTransform(b.channels) && !isAllowedPair(a, b)) {
          issues.push({
            level: 'error',
            code: 'channel-conflict',
            message: `Entries ${a.entryId} and ${b.entryId} both affect transform/motion on target ${targetKeyOf(a)}`,
            entryIds: [a.entryId, b.entryId],
            target: { blockId: a.blockId, part: a.part },
            channel: 'transform',
          })
          continue
        }

        if (isAllowedPair(a, b)) continue
        const overlap = a.channels.filter(c => b.channels.includes(c))
        if (overlap.length === 0) continue
        for (const channel of overlap) {
          issues.push({
            level: 'error',
            code: 'channel-conflict',
            message: `Entries ${a.entryId} and ${b.entryId} both write channel "${channel}" on target ${targetKeyOf(a)}`,
            entryIds: [a.entryId, b.entryId],
            target: { blockId: a.blockId, part: a.part },
            channel,
          })
        }
      }
    }
  }

  return issues
}
