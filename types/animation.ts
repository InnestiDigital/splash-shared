// Animation Scene Data Model — Platform Motion Layer
// Spec: docs/superpowers/specs/2026-04-11-platform-motion-layer-design.md

export type { ValidationIssue } from '~/shared/features/cms/animation/sceneValidation'

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export type ReducedMotionMode = 'skip' | 'fade-only' | 'instant'

export type ScrollAnchor = {
  edge: 'top' | 'center' | 'bottom'
  viewport: number // 0-1, e.g. 0.85 = 85% down viewport
}

export interface TargetRef {
  entityType: 'block' | 'section' | 'page'
  entityId: string
  part: string // validated against block's declared target registry at runtime
  itemIndex?: number
}

// ---------------------------------------------------------------------------
// Scene Trigger (discriminated union)
// ---------------------------------------------------------------------------

export interface ScrollTrigger {
  type: 'scroll'
  anchor: TargetRef | 'viewport'
  start: ScrollAnchor
  end?: ScrollAnchor
  scrub?: boolean | number
  pin?: boolean
}

export interface IntersectionTrigger {
  type: 'intersection'
  anchor: TargetRef
  threshold?: number | number[]
  once?: boolean
}

export interface EventTrigger {
  type: 'event'
  event: 'load' | 'click' | 'hover'
  source: TargetRef | 'page'
  once?: boolean
}

export type SceneTrigger = ScrollTrigger | IntersectionTrigger | EventTrigger

// ---------------------------------------------------------------------------
// Keyframes & Entry Position
// ---------------------------------------------------------------------------

export interface Keyframe {
  offset: number
  opacity?: number
  transform?: {
    x?: string
    y?: string
    scale?: number
    rotate?: string
  }
  blur?: string
  clipPath?: string
  color?: string
  backgroundColor?: string
  vars?: Record<string, string>
  // B2 motion-path fields
  offsetPath?: string // e.g., "path('M 0 0 Q 60 -60 120 0')"
  offsetDistance?: string // e.g., "0%", "100%"
  offsetRotate?: string // e.g., "0deg", "auto"
  offsetAnchor?: string // e.g., "auto", "center"
}

export type EntryPosition =
  | { type: 'absolute'; ms: number }
  | { type: 'after-entry'; entryId: string; offsetMs: number }

// ---------------------------------------------------------------------------
// Animation Entry
// ---------------------------------------------------------------------------

export interface AnimationEntry {
  id: string
  sceneId: string
  target: TargetRef
  keyframes: Keyframe[]
  position: EntryPosition
  duration?: number
  easing?: string
  staggerGroup?: string
  staggerDelay?: number
  staggerVariant?: string
  reducedMotion?: ReducedMotionMode
  presetId?: string
  presetVersion?: string
  presetKnobs?: Record<string, string | number> // B2: preserves knob selections for path presets
  /** Subrange within the parent scroll range [0,1]. Used by section choreography entries. */
  scrollRange?: { start: number; end: number }
}

// ---------------------------------------------------------------------------
// Scene Conditions (reserved for Phase 3+)
// ---------------------------------------------------------------------------

export interface SceneConditions {
  minBreakpoint?: 'sm' | 'md' | 'lg' | 'xl'
  maxBreakpoint?: 'sm' | 'md' | 'lg' | 'xl'
  pointer?: 'fine' | 'coarse'
}

// ---------------------------------------------------------------------------
// Section Choreography
// ---------------------------------------------------------------------------

/**
 * Choreography sequence mode for coordinating block-entry animations
 * within a section.
 *
 * - `none` — no choreography (entries play with their own delays).
 * - `stagger` — linear delay increment in visual order.
 * - `wave` — sinusoidal delay pattern (peak near center).
 * - `simultaneous` — all blocks play together (delay 0).
 */
export type ChoreographyMode = 'none' | 'stagger' | 'wave' | 'simultaneous'

/** Visual order of delay application for stagger mode. */
export type ChoreographyOrder = 'top-down' | 'bottom-up'

/**
 * Section-level choreography configuration for coordinating block-entry
 * animations.
 *
 * Controls how multiple blocks in a section reveal as a unified sequence.
 * Entry-level `staggerGroup`/`staggerDelay` take precedence over choreography
 * — the resolver only fills in stagger fields on entries that have neither.
 */
export interface ChoreographyMeta {
  /** Animation sequence mode */
  mode: ChoreographyMode
  /** Delay in ms between entries (stagger) or base delay + wave amplitude (wave) */
  baseDelay: number
  /** Visual order of delay application; ignored for wave/simultaneous */
  order: ChoreographyOrder
}

/** Default choreography config — safe no-op. */
export const DEFAULT_CHOREOGRAPHY: ChoreographyMeta = {
  mode: 'none',
  baseDelay: 80,
  order: 'top-down',
}

// ---------------------------------------------------------------------------
// Animation Scene
// ---------------------------------------------------------------------------

export interface AnimationScene {
  id: string
  pageId: string
  versionId: string
  trigger: SceneTrigger
  entries: AnimationEntry[]
  conditions?: SceneConditions
  /** When true, skip the cross-block phase gate — allows entries to target blocks different from the trigger anchor. */
  allowCrossBlock?: boolean
  /** When true, the engine skips this scene entirely (admin-only mute toggle). */
  disabled?: boolean
  /** Links this scene to a section — presence indicates a section choreography. */
  sectionId?: string
  /** Metadata for choreography display and provenance tracking in admin. */
  choreographyMeta?: {
    name?: string
    templateId?: string
  }
  /**
   * Optional section choreography context. When populated, the resolver
   * applies `meta` to entries targeting blocks in this section —
   * computing stagger/wave/simultaneous delays before adapter scheduling.
   *
   * `orderedBlockIds` is optional: if omitted, the runtime engine resolves
   * block order via `AnimationEngine.getSectionBlockIds(sectionId)`.
   */
  sectionChoreography?: {
    sectionId: string
    meta: ChoreographyMeta
    orderedBlockIds?: string[]
  }
  defaults?: {
    duration?: number
    easing?: string
    reducedMotion?: ReducedMotionMode
    /**
     * Base delay (ms) added to every entrance entry of this scene ON TOP of
     * choreography stagger. Distinct from entry `position.ms`, which the
     * choreography resolver treats as explicit authored timing and therefore
     * SKIPS staggering for (useAnimationEngine step 1.5). Used by
     * DynamicPage's auto-entrance so "pause before revealing" and section
     * stagger compose instead of cancelling each other.
     */
    entranceDelay?: number
  }
}

// ---------------------------------------------------------------------------
// Motion Hints (structural cooperation from blocks)
// ---------------------------------------------------------------------------

export interface MotionHints {
  prefersLayerPromotion?: string[]
  isolateTransforms?: string[]
  containsDynamicChildren?: boolean
  stableItemKeysTarget?: string
  triggerRootOverride?: string
  /** Passed to IntersectionObserver constructor as { root } when set. Required for blocks nested inside overflow containers (e.g. HorizontalScroll). */
  intersectionRoot?: HTMLElement
  /** Engine skips adapters whose trigger type matches any entry in this list. Used by HorizontalScroll to suppress vertical-axis scroll scenes on nested blocks. */
  disabledTriggerTypes?: string[]
}

// ---------------------------------------------------------------------------
// Runtime Adapter Interface
// ---------------------------------------------------------------------------

export interface AdapterInstance {
  id: string
  adapterName: string
}

export type ResolvedTargets = Record<string, HTMLElement | HTMLElement[]>

export interface MotionAdapter {
  name: string
  canHandle(scene: AnimationScene): boolean
  setup(scene: AnimationScene, targets: ResolvedTargets, motionHints?: MotionHints): AdapterInstance
  destroy(instance: AdapterInstance): void
  play(instance: AdapterInstance): void
  pause(instance: AdapterInstance): void
  scrub(instance: AdapterInstance, progress: number): void
}

// ---------------------------------------------------------------------------
// Animation Engine Interface
// ---------------------------------------------------------------------------

export interface AnimationEngine {
  registerEntityTargets(entityType: string, entityId: string, parts: Record<string, HTMLElement | HTMLElement[]>, hints?: MotionHints): void
  registerBlockTargets(blockId: string, parts: Record<string, HTMLElement | HTMLElement[]>, hints?: MotionHints): void
  unregisterTargets(keyOrBlockId: string): void
  subscribeTarget(blockId: string, part: string, handler: (el: Element | null) => void, itemIndex?: number): () => void
  subscribeTargetAll(blockId: string, part: string, handler: (els: Element[]) => void): () => void
  getBlockHints(blockId: string): MotionHints | undefined
  registerSection(sectionId: string, blockIds: string[]): void
  unregisterSection(sectionId: string): void
  getSectionBlockIds(sectionId: string): string[] | undefined
  loadScenes(scenes: AnimationScene[]): void
  upsertScene(scene: AnimationScene): void
  removeScene(sceneId: string): void
  refreshTargets(blockId: string): void
  rebindAffectedScenes(blockId: string): void
  play(sceneId: string): void
  pause(sceneId: string): void
  scrub(sceneId: string, progress: number): void
  seekAll(progress: number): void
  resetAll(): void
  getSceneAdapter(sceneId: string): string
  getActiveAdapters(sceneId: string): AdapterInstance[]
  getValidationIssues(): import('~/shared/features/cms/animation/sceneValidation').ValidationIssue[]
  readonly activeAdapters: ReadonlySet<string>
  /**
   * True when ≥1 scene is registered (regardless of adapter setup state).
   * Reactive — driven by the same state as activeAdapters. Legacy systems
   * (e.g. useSectionReveal) read this to step aside when the modern engine
   * is managing animation for the page.
   */
  readonly hasScenes: boolean
  hasActiveSceneForPart(blockId: string, part: string): boolean
  subscribeEntranceActive(blockId: string, part: string, handler: (active: boolean) => void): () => void
  registerEntranceEntry(sceneId: string, entry: AnimationEntry): void
  markEntranceStarted(sceneId: string, entryId: string): void
  markEntranceFinished(sceneId: string, entryId: string): void
  markEntranceCanceled(sceneId: string, entryId: string): void
}

// ---------------------------------------------------------------------------
// Phase Gate Validators
// ---------------------------------------------------------------------------

/**
 * After-entry position gate — lifted in Phase 4.
 * Previously rejected entries with after-entry positions. Now returns null (allow).
 * Kept as a no-op for backward compatibility with callers.
 */
export function rejectAfterEntry(_entry: AnimationEntry): string | null {
  return null
}

/**
 * Cross-block trigger gate — lifted in Phase 4.
 * Previously rejected scenes where the trigger anchor block differed from all entry target blocks.
 * Now returns null (allow). Kept as a no-op for backward compatibility with callers.
 */
export function rejectCrossBlockTrigger(_scene: AnimationScene): string | null {
  return null
}

/**
 * Section entity gate — lifted in Phase 3.
 * Previously rejected TargetRefs with entityType 'section'. Now returns null (allow).
 * Kept as a no-op for backward compatibility with callers.
 */
export function rejectSectionEntity(_ref: TargetRef): string | null {
  return null
}

// ---------------------------------------------------------------------------
// Preset Types
// ---------------------------------------------------------------------------

export type PresetCategory = 'entrance' | 'hover' | 'scroll' | 'exit' | 'loop'

export interface KnobDef {
  id: string
  type: 'enum' // B2 only uses enum; future phases may add 'range' etc
  options: readonly string[] | readonly number[]
  default: string | number
}

export interface PresetOutput {
  keyframes: Keyframe[]
  presetId: string
  presetVersion: string
  duration?: number
  easing?: string
  reducedMotion?: ReducedMotionMode
  channels?: string[]
}

export interface PresetMeta {
  id: string
  name: string
  group: 'safe' | 'expressive'
  category: PresetCategory
  factory: (knobs?: Record<string, any>) => PresetOutput
  knobs?: readonly KnobDef[]
  targetKinds?: ('media' | 'decorative' | 'text' | 'root')[]
  maxAmplitude?: Partial<Record<'media' | 'decorative' | 'text' | 'root', 'sm' | 'md' | 'lg'>>
}

// ---------------------------------------------------------------------------
// Section Data Model
// ---------------------------------------------------------------------------

/**
 * A lightweight section: a named group of contiguous block IDs on a page.
 * Sections are implicit — defined by block ranges, not stored as DB entities.
 */
export interface Section {
  id: string
  label: string
  blockIds: string[]
}
