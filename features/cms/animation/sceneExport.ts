/**
 * Scene Import/Export — portable animation scene bundles.
 *
 * Export creates a self-describing bundle that captures scenes + a targetMap
 * so block type/part info survives cross-site import. Import validates the
 * bundle, remaps entity IDs, and generates fresh UUIDs to avoid collisions.
 */

import type { AnimationScene, AnimationEntry, SceneTrigger, TargetRef } from '~/shared/types/animation'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExportedSceneBundle {
  version: '1.0'
  exportedAt: string // ISO date
  pageId: string
  scenes: AnimationScene[]
  targetMap: Record<string, { blockType: string; part: string }>
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/**
 * Build an ExportedSceneBundle from a page's scenes + block list.
 * The targetMap records which block type + part each entityId resolves to,
 * enabling the importer to verify structural compatibility.
 */
export function exportScenes(
  scenes: AnimationScene[],
  blocks: Array<{ id: string; type: string }>,
): ExportedSceneBundle {
  const blockTypeById = new Map(blocks.map((b) => [b.id, b.type]))
  const targetMap: ExportedSceneBundle['targetMap'] = {}

  for (const scene of scenes) {
    for (const entry of scene.entries) {
      const blockType = blockTypeById.get(entry.target.entityId)
      if (blockType && !targetMap[entry.target.entityId]) {
        targetMap[entry.target.entityId] = {
          blockType,
          part: entry.target.part,
        }
      }
    }

    // Also capture trigger anchor targets
    collectTriggerTargets(scene.trigger, blockTypeById, targetMap)
  }

  const pageId = scenes.length > 0 ? scenes[0].pageId : ''

  return {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    pageId,
    scenes: JSON.parse(JSON.stringify(scenes)),
    targetMap,
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate an unknown payload as an ExportedSceneBundle.
 * Returns a list of structural errors (empty = valid).
 */
export function validateImportBundle(data: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Bundle must be a non-null object'] }
  }

  const d = data as Record<string, unknown>

  if (d.version !== '1.0') {
    errors.push(`Unsupported bundle version: ${String(d.version ?? 'missing')}`)
  }

  if (typeof d.exportedAt !== 'string') {
    errors.push('Missing or invalid exportedAt field')
  }

  if (typeof d.pageId !== 'string') {
    errors.push('Missing or invalid pageId field')
  }

  if (!Array.isArray(d.scenes)) {
    errors.push('scenes must be an array')
  } else {
    for (let i = 0; i < d.scenes.length; i++) {
      const scene = d.scenes[i] as Record<string, unknown>
      if (!scene || typeof scene !== 'object') {
        errors.push(`scenes[${i}] must be an object`)
        continue
      }
      if (typeof scene.id !== 'string') {
        errors.push(`scenes[${i}].id must be a string`)
      }
      if (!scene.trigger || typeof scene.trigger !== 'object') {
        errors.push(`scenes[${i}].trigger must be an object`)
      }
      if (!Array.isArray(scene.entries)) {
        errors.push(`scenes[${i}].entries must be an array`)
      }
    }
  }

  if (!d.targetMap || typeof d.targetMap !== 'object' || Array.isArray(d.targetMap)) {
    errors.push('targetMap must be a non-null object')
  }

  return { valid: errors.length === 0, errors }
}

// ---------------------------------------------------------------------------
// Remap & Import
// ---------------------------------------------------------------------------

/**
 * Remap entity IDs in a bundle's scenes using an old→new ID mapping.
 * Generates fresh UUIDs for all scene and entry IDs to avoid collisions.
 * Rewrites:
 * - entry target entityIds
 * - trigger anchor/source entityIds
 * - after-entry position entryId references
 */
export function remapSceneTargets(
  bundle: ExportedSceneBundle,
  idMapping: Record<string, string>,
): AnimationScene[] {
  const idMap = new Map(Object.entries(idMapping))

  return bundle.scenes.map((scene) => {
    const newSceneId = generateUUID()

    // Build entry ID remap (old entry ID → new entry ID) so after-entry refs resolve
    const entryIdMap = new Map<string, string>()
    for (const entry of scene.entries) {
      entryIdMap.set(entry.id, generateUUID())
    }

    const newEntries: AnimationEntry[] = scene.entries.map((entry) => ({
      ...entry,
      id: entryIdMap.get(entry.id)!,
      sceneId: newSceneId,
      target: {
        ...entry.target,
        entityId: idMap.get(entry.target.entityId) ?? entry.target.entityId,
      },
      position: remapEntryPosition(entry.position, entryIdMap),
    }))

    const newTrigger = remapTriggerEntityIds(scene.trigger, idMap)

    return {
      ...scene,
      id: newSceneId,
      trigger: newTrigger,
      entries: newEntries,
    }
  })
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function collectTriggerTargets(
  trigger: SceneTrigger,
  blockTypeById: Map<string, string>,
  targetMap: ExportedSceneBundle['targetMap'],
): void {
  let ref: TargetRef | undefined

  if (trigger.type === 'scroll' && trigger.anchor !== 'viewport') {
    ref = trigger.anchor
  } else if (trigger.type === 'intersection') {
    ref = trigger.anchor
  } else if (trigger.type === 'event' && trigger.source !== 'page') {
    ref = trigger.source
  }

  if (ref && !targetMap[ref.entityId]) {
    const blockType = blockTypeById.get(ref.entityId)
    if (blockType) {
      targetMap[ref.entityId] = { blockType, part: ref.part }
    }
  }
}

function remapTriggerEntityIds(
  trigger: SceneTrigger,
  idMap: Map<string, string>,
): SceneTrigger {
  const clone = JSON.parse(JSON.stringify(trigger)) as SceneTrigger

  if (clone.type === 'scroll') {
    if (clone.anchor !== 'viewport' && clone.anchor.entityId) {
      clone.anchor.entityId = idMap.get(clone.anchor.entityId) ?? clone.anchor.entityId
    }
  } else if (clone.type === 'intersection') {
    if (clone.anchor.entityId) {
      clone.anchor.entityId = idMap.get(clone.anchor.entityId) ?? clone.anchor.entityId
    }
  } else if (clone.type === 'event') {
    if (clone.source !== 'page' && clone.source.entityId) {
      clone.source.entityId = idMap.get(clone.source.entityId) ?? clone.source.entityId
    }
  }

  return clone
}

function remapEntryPosition(
  position: AnimationEntry['position'],
  entryIdMap: Map<string, string>,
): AnimationEntry['position'] {
  if (position.type === 'after-entry') {
    return {
      ...position,
      entryId: entryIdMap.get(position.entryId) ?? position.entryId,
    }
  }
  return position
}

/**
 * UUID generator — uses crypto.randomUUID when available, falls back to a
 * simple v4-like generator for universal browser/server compatibility.
 */
let generateUUID: () => string = () => {
  // Try native first
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    generateUUID = () => crypto.randomUUID()
    return generateUUID()
  }
  // Fallback
  generateUUID = () =>
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0
      const v = c === 'x' ? r : (r & 0x3) | 0x8
      return v.toString(16)
    })
  return generateUUID()
}

// Exposed for test seams
export function _setUUIDGenerator(fn: () => string): void {
  generateUUID = fn
}
