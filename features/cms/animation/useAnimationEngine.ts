import { reactive, watch, onUnmounted } from 'vue'
import type {
  AnimationEngine,
  AnimationScene,
  AnimationEntry,
  MotionAdapter,
  ResolvedTargets,
  AdapterInstance,
  ReducedMotionMode,
  MotionHints,
} from '~/shared/types/animation'
import { entrancePresets, loopPresets, scrollPresets, hoverPresets } from './presets'
import { validateSceneSet, type ValidationIssue } from './sceneValidation'
import { compileSceneEntries } from './compileScene'
import type { CompiledEntry } from './compileScene'
import { applyChoreographyDelays } from './sceneResolver'
import { downgradeScene } from './reducedMotionDowngrade'
import { evaluateConditions } from './sceneConditions'
import { useReducedMotion } from '~/shared/composables/useReducedMotion'
import { createLoopAdapter } from './adapters/loopAdapter'
import { createIntersectionAdapter } from './adapters/intersectionAdapter'
import { createScrollAdapter } from './adapters/scrollAdapter'
import { createWAAPIAdapter } from './adapters/waAPIAdapter'
import { MAX_OBSERVERS_PER_PAGE, SCENE_BATCH_SIZE } from './constants'

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

interface EngineOptions {
  themeMotionDefaults?: {
    defaultDuration?: number
    defaultEasing?: string
    reducedMotion?: ReducedMotionMode
  }
  /** Override default adapters (useful for testing). */
  adapters?: MotionAdapter[]
}

// ---------------------------------------------------------------------------
// Composable
// ---------------------------------------------------------------------------

export function useAnimationEngine(options: EngineOptions = {}): AnimationEngine {
  // Internal state
  const scenes = new Map<string, AnimationScene>()
  const compiledEntriesMap = new Map<string, CompiledEntry[]>()
  const entityTargets = new Map<string, Record<string, HTMLElement | HTMLElement[]>>()
  const blockHints = new Map<string, MotionHints>()
  const sectionBlocks = new Map<string, string[]>()
  const adapterInstances = new Map<string, Array<{ adapter: MotionAdapter; instance: AdapterInstance }>>()
  const activeAdaptersSet = reactive(new Set<string>())
  // Reactive scene count — drives hasScenes getter. Kept in sync with scenes Map
  // via syncSceneCount() at every mutation site (loadScenes/upsertScene/removeScene/resetAll).
  const sceneCountRef = reactive({ count: 0 })

  function syncSceneCount(): void {
    sceneCountRef.count = scenes.size
  }

  // Validation state
  let lastValidationIssues: ValidationIssue[] = []
  function getValidationIssues(): ValidationIssue[] {
    return lastValidationIssues
  }

  // Lazy engine ref — loopAdapter needs engine observables but engine isn't
  // constructed yet at this point. Resolved at the end of useAnimationEngine().
  let engineRef: AnimationEngine | null = null
  const getEngine = (): AnimationEngine => {
    if (!engineRef) throw new Error('loopAdapter used before engine initialization completed')
    return engineRef
  }

  // Default adapters in priority order — loopAdapter FIRST so loop entries
  // route to it before intersectionAdapter claims the whole scene.
  const adapters: MotionAdapter[] = options.adapters ?? [
    createLoopAdapter({
      subscribeTarget: (b, p, h, idx) => getEngine().subscribeTarget(b, p, h, idx),
      subscribeTargetAll: (b, p, h) => getEngine().subscribeTargetAll(b, p, h),
      subscribeEntranceActive: (b, p, h) => getEngine().subscribeEntranceActive(b, p, h),
    }),
    createIntersectionAdapter({
      onEntryStarted:  (sceneId, entryId) => markEntranceStarted(sceneId, entryId),
      onEntryFinished: (sceneId, entryId) => markEntranceFinished(sceneId, entryId),
      onEntryCanceled: (sceneId, entryId) => markEntranceCanceled(sceneId, entryId),
      isEntrancePreset: (presetId) => isEntrancePreset(presetId),
    }),
    createScrollAdapter(),
    createWAAPIAdapter(),
  ]

  // Reduced motion detection (reactive)
  const { isReducedMotion } = useReducedMotion()

  // data-motion-ready gate element
  let pageRoot: HTMLElement | null = null

  // -------------------------------------------------------------------------
  // Target subscriptions
  // -------------------------------------------------------------------------

  type TargetHandler = (el: Element | null) => void
  const targetSubscribers = new Map<string, Set<TargetHandler>>()
  const lastNotifiedElement = new Map<string, Element | null>()

  type TargetAllHandler = (els: Element[]) => void
  const targetAllSubscribers = new Map<string, Set<TargetAllHandler>>()

  function targetKey(blockId: string, part: string, itemIndex?: number): string {
    return itemIndex === undefined ? `${blockId}/${part}` : `${blockId}/${part}/${itemIndex}`
  }

  function entityKey(entityType: string, entityId: string): string {
    return `${entityType}:${entityId}`
  }

  function resolvePartElement(blockId: string, part: string, itemIndex?: number): Element | null {
    const parts = entityTargets.get(entityKey('block', blockId))
    if (!parts) return null
    const v = parts[part]
    if (!v) return null
    if (Array.isArray(v)) {
      return itemIndex !== undefined ? (v[itemIndex] ?? null) : (v[0] ?? null)
    }
    return v
  }

  function resolvePartElements(blockId: string, part: string): Element[] {
    const parts = entityTargets.get(entityKey('block', blockId))
    if (!parts) return []
    const v = parts[part]
    if (!v) return []
    return Array.isArray(v) ? v.filter(Boolean) as Element[] : [v]
  }

  function notifyTargetAllSubscribers(blockId: string, part: string): void {
    const key = `${blockId}/${part}`
    const subs = targetAllSubscribers.get(key)
    if (!subs) return
    const els = resolvePartElements(blockId, part)
    for (const h of subs) h(els)
  }

  function subscribeTargetAll(blockId: string, part: string, handler: TargetAllHandler): () => void {
    const key = `${blockId}/${part}`
    let subs = targetAllSubscribers.get(key)
    if (!subs) {
      subs = new Set()
      targetAllSubscribers.set(key, subs)
    }
    subs.add(handler)
    handler(resolvePartElements(blockId, part))
    return () => {
      subs!.delete(handler)
      if (subs!.size === 0) targetAllSubscribers.delete(key)
    }
  }

  function notifyTargetSubscribers(blockId: string, part: string): void {
    // Fire non-indexed subscribers
    const key = targetKey(blockId, part)
    const current = resolvePartElement(blockId, part)
    // Diff: only fire when element identity actually changed
    if (!lastNotifiedElement.has(key) || lastNotifiedElement.get(key) !== current) {
      lastNotifiedElement.set(key, current)
      const subs = targetSubscribers.get(key)
      if (subs) {
        for (const h of subs) h(current)
      }
    }

    // Fire per-index subscribers (for multi-target parts)
    const prefix = `${blockId}/${part}/`
    for (const [k, subs] of targetSubscribers) {
      if (!k.startsWith(prefix)) continue
      const idxStr = k.slice(prefix.length)
      const idx = parseInt(idxStr, 10)
      if (isNaN(idx)) continue
      const currentIndexed = resolvePartElement(blockId, part, idx)
      if (lastNotifiedElement.has(k) && lastNotifiedElement.get(k) === currentIndexed) continue
      lastNotifiedElement.set(k, currentIndexed)
      for (const h of subs) h(currentIndexed)
    }

    // Fire all-element subscribers (for adapters managing full array, e.g. loopAdapter all-scope)
    notifyTargetAllSubscribers(blockId, part)
  }

  function subscribeTarget(blockId: string, part: string, handler: TargetHandler, itemIndex?: number): () => void {
    const key = targetKey(blockId, part, itemIndex)
    let subs = targetSubscribers.get(key)
    if (!subs) {
      subs = new Set()
      targetSubscribers.set(key, subs)
    }
    subs.add(handler)
    // Fire initial state synchronously; seed lastNotified so diff works
    const current = resolvePartElement(blockId, part, itemIndex)
    lastNotifiedElement.set(key, current)
    handler(current)
    return () => {
      subs!.delete(handler)
      if (subs!.size === 0) targetSubscribers.delete(key)
    }
  }

  // -------------------------------------------------------------------------
  // Entrance-active observable
  // -------------------------------------------------------------------------

  type EntranceHandler = (active: boolean) => void
  const entranceRunningSet = new Map<string, Set<string>>()      // targetKey → set of running entry ids
  const entranceSubscribers = new Map<string, Set<EntranceHandler>>()
  const entryTargetIndex = new Map<string, { sceneId: string; blockId: string; part: string }>()
  const entranceBySceneEntry = new Map<string, Set<string>>()    // sceneId → set of entry ids

  function isEntrancePreset(presetId?: string): boolean {
    if (!presetId) return false
    const all = [...entrancePresets, ...loopPresets, ...scrollPresets, ...hoverPresets]
    const meta = all.find((m) => m.id === presetId)
    return meta?.category === 'entrance'
  }

  function notifyEntranceSubscribers(key: string, active: boolean): void {
    const subs = entranceSubscribers.get(key)
    if (!subs) return
    for (const h of subs) h(active)
  }

  function registerEntranceEntry(sceneId: string, entry: AnimationEntry): void {
    if (!isEntrancePreset(entry.presetId)) return
    if (entry.target.entityType !== 'block') return
    entryTargetIndex.set(entry.id, {
      sceneId,
      blockId: entry.target.entityId,
      part: entry.target.part,
    })
    let byScene = entranceBySceneEntry.get(sceneId)
    if (!byScene) { byScene = new Set(); entranceBySceneEntry.set(sceneId, byScene) }
    byScene.add(entry.id)
  }

  function markEntranceStarted(sceneId: string, entryId: string): void {
    const idx = entryTargetIndex.get(entryId)
    if (!idx || idx.sceneId !== sceneId) return
    const key = targetKey(idx.blockId, idx.part)
    let set = entranceRunningSet.get(key)
    const wasEmpty = !set || set.size === 0
    if (!set) { set = new Set(); entranceRunningSet.set(key, set) }
    set.add(entryId)
    if (wasEmpty) notifyEntranceSubscribers(key, true)
  }

  function _stopEntry(sceneId: string, entryId: string): void {
    const idx = entryTargetIndex.get(entryId)
    if (!idx || idx.sceneId !== sceneId) return
    const key = targetKey(idx.blockId, idx.part)
    const set = entranceRunningSet.get(key)
    if (set) {
      set.delete(entryId)
      if (set.size === 0) {
        entranceRunningSet.delete(key)
        notifyEntranceSubscribers(key, false)
      }
    }
    entryTargetIndex.delete(entryId)
    const byScene = entranceBySceneEntry.get(sceneId)
    byScene?.delete(entryId)
  }

  function markEntranceFinished(sceneId: string, entryId: string): void { _stopEntry(sceneId, entryId) }
  function markEntranceCanceled(sceneId: string, entryId: string): void { _stopEntry(sceneId, entryId) }

  function subscribeEntranceActive(blockId: string, part: string, handler: EntranceHandler): () => void {
    const key = targetKey(blockId, part)
    let subs = entranceSubscribers.get(key)
    if (!subs) { subs = new Set(); entranceSubscribers.set(key, subs) }
    subs.add(handler)
    const current = (entranceRunningSet.get(key)?.size ?? 0) > 0
    handler(current)
    return () => {
      subs!.delete(handler)
      if (subs!.size === 0) entranceSubscribers.delete(key)
    }
  }

  // -------------------------------------------------------------------------
  // Batched registration queue
  // -------------------------------------------------------------------------

  const pendingRegistrations = new Set<string>()
  let batchScheduled = false
  let batchMode = false
  /** Tracks how many times the batch flush has run (exposed for testing). */
  let _batchFlushCount = 0

  function scheduleBatchFlush(): void {
    if (batchScheduled) return
    batchScheduled = true

    const doFlush = () => {
      batchScheduled = false
      _batchFlushCount++
      const blockIds = [...pendingRegistrations]
      pendingRegistrations.clear()

      // Collect all affected scene IDs to avoid duplicate setup
      const affectedSceneIds = new Set<string>()
      for (const blockId of blockIds) {
        for (const [sceneId, scene] of scenes) {
          const referencesBlock =
            scene.entries.some((e) => e.target.entityId === blockId) ||
            resolveTriggerBlockId(scene) === blockId
          if (referencesBlock) {
            affectedSceneIds.add(sceneId)
          }
        }
      }

      // Teardown then setup affected scenes in one pass
      for (const sceneId of affectedSceneIds) {
        if (adapterInstances.has(sceneId)) {
          teardownScene(sceneId)
        }
      }
      for (const sceneId of affectedSceneIds) {
        const scene = scenes.get(sceneId)
        if (scene) trySetupScene(scene)
      }
    }

    // Use requestAnimationFrame when available, fall back to microtask
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(doFlush)
    } else {
      queueMicrotask(doFlush)
    }
  }

  // -------------------------------------------------------------------------
  // Registration
  // -------------------------------------------------------------------------

  function registerEntityTargets(
    entityType: string,
    entityId: string,
    parts: Record<string, HTMLElement | HTMLElement[]>,
    hints?: MotionHints,
  ): void {
    const key = entityKey(entityType, entityId)
    entityTargets.set(key, parts)
    if (entityType === 'block') {
      if (hints) {
        blockHints.set(entityId, hints)
      } else {
        blockHints.delete(entityId)
      }
      for (const part of Object.keys(parts)) {
        notifyTargetSubscribers(entityId, part)
      }
      if (batchMode) {
        pendingRegistrations.add(entityId)
        scheduleBatchFlush()
      } else {
        rebindAffectedScenes(entityId)
      }
    } else if (entityType === 'section') {
      // Rebind scenes whose trigger references this section
      for (const [, scene] of scenes) {
        const sectionRef = getTriggerSectionId(scene)
        if (sectionRef === entityId) {
          if (adapterInstances.has(scene.id)) {
            teardownScene(scene.id)
          }
          trySetupScene(scene)
        }
      }
    }
  }

  function registerBlockTargets(
    blockId: string,
    parts: Record<string, HTMLElement | HTMLElement[]>,
    hints?: MotionHints,
  ): void {
    registerEntityTargets('block', blockId, parts, hints)
  }

  function getBlockHints(blockId: string): MotionHints | undefined {
    return blockHints.get(blockId)
  }

  // -------------------------------------------------------------------------
  // Section registration
  // -------------------------------------------------------------------------

  function registerSection(sectionId: string, blockIds: string[]): void {
    sectionBlocks.set(sectionId, blockIds)
    // Rebind any scenes whose trigger references this section
    for (const [, scene] of scenes) {
      const sectionRef = getTriggerSectionId(scene)
      if (sectionRef === sectionId) {
        if (adapterInstances.has(scene.id)) {
          teardownScene(scene.id)
        }
        trySetupScene(scene)
      }
    }
  }

  function unregisterSection(sectionId: string): void {
    sectionBlocks.delete(sectionId)
    // Teardown scenes whose trigger references this section
    for (const [, scene] of scenes) {
      const sectionRef = getTriggerSectionId(scene)
      if (sectionRef === sectionId && adapterInstances.has(scene.id)) {
        teardownScene(scene.id)
      }
    }
  }

  function getSectionBlockIds(sectionId: string): string[] | undefined {
    return sectionBlocks.get(sectionId)
  }

  function unregisterTargets(keyOrBlockId: string): void {
    // Support composite key format (e.g. "section:sec-1") or plain blockId
    let entityType: string
    let entityId: string
    if (keyOrBlockId.includes(':')) {
      const idx = keyOrBlockId.indexOf(':')
      entityType = keyOrBlockId.slice(0, idx)
      entityId = keyOrBlockId.slice(idx + 1)
    } else {
      entityType = 'block'
      entityId = keyOrBlockId
    }

    const key = entityKey(entityType, entityId)
    const parts = entityTargets.get(key)
    const partNames = parts ? Object.keys(parts) : []

    entityTargets.delete(key)

    if (entityType === 'block') {
      blockHints.delete(entityId)
      for (const part of partNames) {
        notifyTargetSubscribers(entityId, part)
      }
      for (const [sceneId, scene] of scenes) {
        const references = scene.entries.some((e) => e.target.entityId === entityId)
        if (references && adapterInstances.has(sceneId)) {
          teardownScene(sceneId)
        }
      }
    } else if (entityType === 'section') {
      // Teardown scenes whose trigger references this section
      for (const [, scene] of scenes) {
        const sectionRef = getTriggerSectionId(scene)
        if (sectionRef === entityId && adapterInstances.has(scene.id)) {
          teardownScene(scene.id)
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Scene lifecycle
  // -------------------------------------------------------------------------

  /** Tracks how many RAF batches were used in progressive loadScenes. */
  let _loadBatchCount = 0

  function loadScenes(newScenes: AnimationScene[]): void {
    resetAll()
    compiledEntriesMap.clear()

    // Validate and collect skip set
    lastValidationIssues = validateSceneSet(newScenes)
    const errors = lastValidationIssues.filter(i => i.level === 'error')
    if (errors.length > 0) {
      console.warn('[animation:scene-set]', errors)
    }
    const skipEntryIds = new Set<string>()
    for (const issue of errors) {
      for (const id of issue.entryIds) skipEntryIds.add(id)
    }

    // Filter each scene's entries to exclude flagged IDs
    const filteredScenes = newScenes.map(scene => ({
      ...scene,
      entries: scene.entries.filter(e => !skipEntryIds.has(e.id)),
    }))

    for (const scene of filteredScenes) {
      scenes.set(scene.id, scene)
      compiledEntriesMap.set(scene.id, compileSceneEntries(scene.entries))
      for (const entry of scene.entries) {
        registerEntranceEntry(scene.id, entry)
      }
    }
    syncSceneCount()

    // Progressive scene setup: process in batches to avoid blocking main thread
    if (filteredScenes.length <= SCENE_BATCH_SIZE || typeof requestAnimationFrame !== 'function') {
      // Small list or no RAF: set up synchronously
      for (const scene of filteredScenes) {
        trySetupScene(scene)
      }
      _loadBatchCount = 1
      markReady()
    } else {
      _loadBatchCount = 0
      let offset = 0
      const processNextBatch = () => {
        const end = Math.min(offset + SCENE_BATCH_SIZE, filteredScenes.length)
        for (let i = offset; i < end; i++) {
          trySetupScene(filteredScenes[i])
        }
        _loadBatchCount++
        offset = end
        if (offset < filteredScenes.length) {
          requestAnimationFrame(processNextBatch)
        } else {
          markReady()
        }
      }
      requestAnimationFrame(processNextBatch)
    }
  }

  function upsertScene(newScene: AnimationScene): void {
    // Build full scene set for validation (existing + the new one replacing any match)
    const fullSet: AnimationScene[] = []
    for (const [id, s] of scenes) {
      if (id !== newScene.id) fullSet.push(s)
    }
    fullSet.push(newScene)

    lastValidationIssues = validateSceneSet(fullSet)
    const errors = lastValidationIssues.filter(i => i.level === 'error')
    if (errors.length > 0) {
      console.warn('[animation:scene-set]', errors)
    }
    const skipEntryIds = new Set<string>()
    for (const issue of errors) {
      for (const id of issue.entryIds) skipEntryIds.add(id)
    }

    const filtered: AnimationScene = {
      ...newScene,
      entries: newScene.entries.filter(e => !skipEntryIds.has(e.id)),
    }

    if (adapterInstances.has(filtered.id)) {
      teardownScene(filtered.id)
    }
    scenes.set(filtered.id, filtered)
    compiledEntriesMap.set(filtered.id, compileSceneEntries(filtered.entries))
    for (const entry of filtered.entries) {
      registerEntranceEntry(filtered.id, entry)
    }
    syncSceneCount()
    trySetupScene(filtered)
  }

  function removeScene(sceneId: string): void {
    teardownScene(sceneId)
    // Stop any in-flight entrance entries for this scene
    const byScene = entranceBySceneEntry.get(sceneId)
    if (byScene) {
      for (const entryId of Array.from(byScene)) {
        _stopEntry(sceneId, entryId)
      }
      entranceBySceneEntry.delete(sceneId)
    }
    scenes.delete(sceneId)
    syncSceneCount()
    updateActiveAdapters()
  }

  function refreshTargets(blockId: string): void {
    rebindAffectedScenes(blockId)
  }

  function rebindAffectedScenes(blockId: string): void {
    for (const [sceneId, scene] of scenes) {
      const referencesBlock =
        scene.entries.some((e) => e.target.entityId === blockId) ||
        resolveTriggerBlockId(scene) === blockId
      if (referencesBlock) {
        if (adapterInstances.has(sceneId)) {
          teardownScene(sceneId)
        }
        trySetupScene(scene)
      }
    }
  }

  // -------------------------------------------------------------------------
  // Playback
  // -------------------------------------------------------------------------

  function play(sceneId: string): void {
    const recs = adapterInstances.get(sceneId) ?? []
    for (const { adapter, instance } of recs) adapter.play(instance)
  }

  function pause(sceneId: string): void {
    const recs = adapterInstances.get(sceneId) ?? []
    for (const { adapter, instance } of recs) adapter.pause(instance)
  }

  function scrub(sceneId: string, progress: number): void {
    const recs = adapterInstances.get(sceneId) ?? []
    for (const { adapter, instance } of recs) adapter.scrub(instance, progress)
  }

  function seekAll(progress: number): void {
    for (const [sceneId] of adapterInstances) {
      scrub(sceneId, progress)
    }
  }

  function resetAll(): void {
    for (const [sceneId] of adapterInstances) {
      teardownScene(sceneId)
    }
    scenes.clear()
    compiledEntriesMap.clear()
    syncSceneCount()
    // Section mappings are structural page data — preserved across scene reloads.
    // Cleared on component unmount, not on resetAll/loadScenes.
    activeAdaptersSet.clear()
  }

  // -------------------------------------------------------------------------
  // Adapter info
  // -------------------------------------------------------------------------

  function getSceneAdapter(sceneId: string): string {
    const recs = adapterInstances.get(sceneId)
    return recs?.[0]?.adapter.name ?? 'none'
  }

  function getActiveAdapters(sceneId: string): AdapterInstance[] {
    return (adapterInstances.get(sceneId) ?? []).map(r => r.instance)
  }

  function hasActiveSceneForPart(blockId: string, part: string): boolean {
    for (const [, scene] of scenes) {
      if (scene.entries.some((e) => e.target.entityId === blockId && e.target.part === part))
        return true
    }
    return false
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  function trySetupScene(scene: AnimationScene): void {
    // Admin-level mute toggle — skip disabled scenes entirely
    if (scene.disabled) return

    // Evaluate scene conditions (breakpoint/device targeting)
    if (!evaluateConditions(scene.conditions)) return

    // Guardrail: cap total active adapter instances (observer proxy)
    if (adapterInstances.size >= MAX_OBSERVERS_PER_PAGE) return

    // Apply scene-level reduced-motion downgrade
    let effectiveScene = scene
    if (isReducedMotion.value) {
      const mode: ReducedMotionMode =
        scene.defaults?.reducedMotion ??
        options.themeMotionDefaults?.reducedMotion ??
        'fade-only'
      effectiveScene = downgradeScene(scene, mode)
    }

    // Apply section-level choreography delays (step 1.5) before adapter setup.
    // Clones the entry array + each entry's position so in-place mutation here
    // does not leak back into the stored scene. Entry-level explicit timing
    // (staggerGroup or non-zero position.ms) wins over choreography — enforced
    // inside applyChoreographyDelays.
    if (effectiveScene.sectionChoreography) {
      const { sectionId, meta, orderedBlockIds: providedIds } = effectiveScene.sectionChoreography
      const orderedBlockIds = providedIds ?? sectionBlocks.get(sectionId) ?? []
      if (meta.mode !== 'none' && orderedBlockIds.length > 0) {
        const clonedEntries = effectiveScene.entries.map(e => ({
          ...e,
          position: { ...e.position },
        }))
        applyChoreographyDelays(clonedEntries, meta, sectionId, orderedBlockIds)
        effectiveScene = { ...effectiveScene, entries: clonedEntries }
      }
    }

    // Collect all required block IDs (from effective scene — entries may differ after downgrade)
    const requiredBlockIds = new Set<string>()
    for (const entry of effectiveScene.entries) {
      if (entry.target.entityType === 'block') {
        requiredBlockIds.add(entry.target.entityId)
      }
    }

    // Resolve trigger anchor — may be a block ID directly or via section lookup
    // Use effectiveScene since trigger type may change (e.g. scroll → intersection)
    const triggerBlockId = resolveTriggerBlockId(effectiveScene)
    if (triggerBlockId) requiredBlockIds.add(triggerBlockId)

    // If trigger references a section but section isn't registered, bail
    const triggerSectionId = getTriggerSectionId(effectiveScene)
    if (triggerSectionId && !sectionBlocks.has(triggerSectionId)) return

    // Choreography membership guard: when section IS registered, validate every
    // entry's block against section membership. Orphaned references (blocks
    // deleted from the section after the scene was saved) would otherwise spin up
    // observers on null elements and fail silently.
    // Deferred-mount path: section not yet registered → stay silent (bailed above).
    if (scene.sectionId) {
      const memberBlockIds = sectionBlocks.get(scene.sectionId)
      if (memberBlockIds !== undefined) {
        const memberSet = new Set(memberBlockIds)
        const orphanBlockIds = [
          ...new Set(
            effectiveScene.entries
              .filter(e => e.target.entityType === 'block' && !memberSet.has(e.target.entityId))
              .map(e => e.target.entityId),
          ),
        ]
        if (orphanBlockIds.length > 0) {
          console.error(
            `[AnimationEngine] Scene "${scene.id}" skipped — choreography entries reference blocks ` +
            `not in section "${scene.sectionId}": ${orphanBlockIds.join(', ')}. ` +
            `Remove these entries or re-add the blocks to the section.`,
          )
          return
        }
      }
    }

    // Bail if any required block targets are missing
    for (const blockId of requiredBlockIds) {
      if (!entityTargets.has(entityKey('block', blockId))) return
    }

    // Build resolved targets map — keyed by `entityId:part` for multi-block
    // choreography support (multiple entries targeting 'root' on different blocks).
    // Also populate part-only keys for backward compat with anchor resolution.
    const resolvedTargets: ResolvedTargets = {}
    for (const entry of effectiveScene.entries) {
      if (entry.target.entityType === 'block') {
        const parts = entityTargets.get(entityKey('block', entry.target.entityId))
        if (parts && parts[entry.target.part]) {
          const compositeKey = `${entry.target.entityId}:${entry.target.part}`
          resolvedTargets[compositeKey] = parts[entry.target.part]
          // Part-only key for anchor resolution (last-write-wins is fine for anchors)
          resolvedTargets[entry.target.part] = parts[entry.target.part]
        }
      }
    }

    // Include trigger anchor's target parts in resolvedTargets so adapters
    // can resolve the anchor element (e.g. IntersectionAdapter.resolveAnchorElement).
    if (triggerBlockId) {
      const triggerParts = entityTargets.get(entityKey('block', triggerBlockId))
      if (triggerParts) {
        const anchorRef = getTriggerAnchorRef(effectiveScene)
        const anchorPart = anchorRef?.part ?? 'root'
        if (triggerParts[anchorPart] && !resolvedTargets[anchorPart]) {
          resolvedTargets[anchorPart] = triggerParts[anchorPart]
        }
      }
    }

    // Include section element in resolved targets for section-anchored triggers
    if (triggerSectionId) {
      const sectionParts = entityTargets.get(entityKey('section', triggerSectionId))
      if (sectionParts) {
        const anchorRef = getTriggerAnchorRef(effectiveScene)
        const anchorPart = anchorRef?.part ?? 'root'
        if (sectionParts[anchorPart] && !resolvedTargets[anchorPart]) {
          resolvedTargets[anchorPart] = sectionParts[anchorPart]
        }
      }
    }

    // Apply triggerRootOverride: if the trigger block has a hint overriding the
    // trigger anchor part, swap 'root' in resolved targets for the override part.
    let triggerHints: MotionHints | undefined
    if (triggerBlockId) {
      triggerHints = blockHints.get(triggerBlockId)
      if (triggerHints?.triggerRootOverride) {
        const parts = entityTargets.get(entityKey('block', triggerBlockId))
        const overridePart = parts?.[triggerHints.triggerRootOverride]
        if (overridePart) {
          resolvedTargets[triggerHints.triggerRootOverride] = overridePart
        }
      }
    }

    // Skip scene if the trigger type is disabled by parent container hints
    const disabledTypes = triggerHints?.disabledTriggerTypes ?? []
    if (disabledTypes.includes(effectiveScene.trigger.type)) {
      console.warn(
        `[AnimationEngine] Scene "${scene.id}" skipped — trigger type "${effectiveScene.trigger.type}" ` +
        `is disabled by parent container motionHints (disabledTriggerTypes).`,
      )
      return
    }

    // Retrieve compiled entries for this scene
    const compiled = compiledEntriesMap.get(scene.id)

    // Per-entry adapter routing: group entries by their chosen adapter.
    // This allows one scene to use multiple adapters simultaneously
    // (e.g. loopAdapter for loop entries + intersectionAdapter for entrance entries).
    const entriesByAdapter = new Map<MotionAdapter, AnimationEntry[]>()
    for (const entry of effectiveScene.entries) {
      const adapter = chooseAdapterForEntry(entry, effectiveScene, adapters)
      if (!adapter) continue
      let group = entriesByAdapter.get(adapter)
      if (!group) { group = []; entriesByAdapter.set(adapter, group) }
      group.push(entry)
    }

    // Call setup per adapter with its sub-scene
    for (const [adapter, entries] of entriesByAdapter) {
      const subScene: AnimationScene = { ...effectiveScene, entries }
      const subCompiled = compiled?.filter(c => entries.some(e => e.id === c.source.id))
      const instance = adapter.setup(subScene, resolvedTargets, triggerHints, subCompiled)
      const recs = adapterInstances.get(scene.id) ?? []
      recs.push({ adapter, instance })
      adapterInstances.set(scene.id, recs)
    }
    updateActiveAdapters()
  }

  /**
   * Choose the best adapter for a single entry by probing adapters with a
   * single-entry variant of the scene. Preserves scene.trigger.type so
   * trigger-aware adapters (scrollAdapter, intersectionAdapter) still work.
   */
  function chooseAdapterForEntry(
    entry: AnimationEntry,
    scene: AnimationScene,
    adapterList: MotionAdapter[],
  ): MotionAdapter | null {
    const probe: AnimationScene = { ...scene, entries: [entry] }
    for (const a of adapterList) {
      if (a.canHandle(probe)) return a
    }
    return null
  }

  function teardownScene(sceneId: string): void {
    const recs = adapterInstances.get(sceneId)
    if (recs) {
      for (const { adapter, instance } of recs) adapter.destroy(instance)
      adapterInstances.delete(sceneId)
    }
    compiledEntriesMap.delete(sceneId)
  }

  /**
   * Extract the trigger anchor's entity ID when it directly references a block.
   * Does NOT resolve section → block. Use resolveTriggerBlockId for that.
   */
  function getTriggerBlockId(scene: AnimationScene): string | null {
    const ref = getTriggerAnchorRef(scene)
    if (ref && ref.entityType === 'block') return ref.entityId
    return null
  }

  /**
   * Extract the trigger anchor TargetRef (if any).
   */
  function getTriggerAnchorRef(scene: AnimationScene): import('~/shared/types/animation').TargetRef | null {
    const trigger = scene.trigger
    if (trigger.type === 'intersection') return trigger.anchor
    if (trigger.type === 'scroll' && trigger.anchor !== 'viewport') return trigger.anchor
    if (trigger.type === 'event' && trigger.source !== 'page') return trigger.source
    return null
  }

  /**
   * If the trigger anchor references a section, return that section ID.
   */
  function getTriggerSectionId(scene: AnimationScene): string | null {
    const ref = getTriggerAnchorRef(scene)
    if (ref && ref.entityType === 'section') return ref.entityId
    return null
  }

  /**
   * Resolve the trigger anchor to a concrete block ID.
   * For block anchors, returns the block ID directly.
   * For section anchors, returns the first block in the section.
   */
  function resolveTriggerBlockId(scene: AnimationScene): string | null {
    const ref = getTriggerAnchorRef(scene)
    if (!ref) return null
    if (ref.entityType === 'block') return ref.entityId
    if (ref.entityType === 'section') {
      const blockIds = sectionBlocks.get(ref.entityId)
      return blockIds && blockIds.length > 0 ? blockIds[0] : null
    }
    return null
  }

  function updateActiveAdapters(): void {
    activeAdaptersSet.clear()
    for (const [, recs] of adapterInstances) {
      for (const { adapter } of recs) {
        activeAdaptersSet.add(adapter.name)
      }
    }
  }

  function markReady(): void {
    if (typeof document !== 'undefined') {
      pageRoot = document.documentElement
      pageRoot.setAttribute('data-motion-ready', '')
    }
  }

  // -------------------------------------------------------------------------
  // Reactive reduced-motion re-setup
  // -------------------------------------------------------------------------

  watch(() => isReducedMotion.value, () => {
    // Teardown all active adapter instances, then re-setup with (or without) downgrade
    for (const [sceneId] of adapterInstances) {
      teardownScene(sceneId)
    }
    for (const [, scene] of scenes) {
      trySetupScene(scene)
    }
  })

  // -------------------------------------------------------------------------
  // Resize-based condition re-evaluation
  // -------------------------------------------------------------------------

  let resizeCleanup: (() => void) | null = null

  if (typeof window !== 'undefined') {
    let lastWidth = window.innerWidth
    const onResize = () => {
      const newWidth = window.innerWidth
      if (newWidth === lastWidth) return
      lastWidth = newWidth

      // Re-evaluate conditions: teardown scenes that no longer match,
      // attempt setup of scenes that now match
      for (const [, scene] of scenes) {
        const active = adapterInstances.has(scene.id)
        const passes = evaluateConditions(scene.conditions)
        if (active && !passes) {
          teardownScene(scene.id)
        } else if (!active && passes) {
          trySetupScene(scene)
        }
      }
      updateActiveAdapters()
    }
    window.addEventListener('resize', onResize)
    resizeCleanup = () => window.removeEventListener('resize', onResize)
  }

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  onUnmounted(() => {
    resetAll()
    sectionBlocks.clear()
    resizeCleanup?.()
    if (pageRoot) {
      pageRoot.removeAttribute('data-motion-ready')
      pageRoot = null
    }
  })

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  const engine: AnimationEngine = {
    registerEntityTargets,
    registerBlockTargets,
    unregisterTargets,
    subscribeTarget,
    subscribeTargetAll,
    getBlockHints,
    registerSection,
    unregisterSection,
    getSectionBlockIds,
    loadScenes,
    upsertScene,
    removeScene,
    refreshTargets,
    rebindAffectedScenes,
    play,
    pause,
    scrub,
    seekAll,
    resetAll,
    getSceneAdapter,
    getActiveAdapters,
    getValidationIssues,
    hasActiveSceneForPart,
    subscribeEntranceActive,
    registerEntranceEntry,
    markEntranceStarted,
    markEntranceFinished,
    markEntranceCanceled,
    get activeAdapters() {
      return activeAdaptersSet as ReadonlySet<string>
    },
    get hasScenes() {
      return sceneCountRef.count > 0
    },
    // Internals exposed for testing and batch control
    /** @internal */ get _batchFlushCount() { return _batchFlushCount },
    /** @internal */ get _loadBatchCount() { return _loadBatchCount },
    /** Enable batched registration mode — calls to registerBlockTargets queue rather than immediately rebind. */
    enableBatchMode() { batchMode = true },
    /** Disable batched registration mode. */
    disableBatchMode() { batchMode = false },
    /** Synchronously flush all pending batched registrations. */
    flushPendingRegistrations() {
      if (pendingRegistrations.size === 0) return
      batchScheduled = false
      _batchFlushCount++
      const blockIds = [...pendingRegistrations]
      pendingRegistrations.clear()
      const affectedSceneIds = new Set<string>()
      for (const blockId of blockIds) {
        for (const [sceneId, scene] of scenes) {
          const referencesBlock =
            scene.entries.some((e) => e.target.entityId === blockId) ||
            resolveTriggerBlockId(scene) === blockId
          if (referencesBlock) affectedSceneIds.add(sceneId)
        }
      }
      for (const sceneId of affectedSceneIds) {
        if (adapterInstances.has(sceneId)) teardownScene(sceneId)
      }
      for (const sceneId of affectedSceneIds) {
        const scene = scenes.get(sceneId)
        if (scene) trySetupScene(scene)
      }
    },
  } as AnimationEngine

  // Resolve the lazy engine ref so loopAdapter (and any future adapters that
  // depend on engine observables) can access it after construction.
  engineRef = engine
  return engine
}
