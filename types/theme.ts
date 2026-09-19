// Theme + block schema types — shared between admin, server, and client renderer.
// Moved out of server/storage/types.ts so shared/features/cms/themeData.ts can
// import them without crossing the server→shared boundary.

export interface ThemeManifest {
  name: string
  label?: Record<string, string>
  locales?: string[]
  defaultLocale?: string
  allowedBlocks: string[]
  settings: ThemeSettingField[]
  groups?: ThemeSettingGroup[]
  blockDefaults: Record<string, Record<string, any>>
  typography?: Record<string, any>
  layout?: Record<string, any>
  motion?: {
    defaultDuration?: number
    defaultEasing?: string
    reducedMotion?: string
    defaultEntrance?: string
    motionScale?: number
    scrollOffset?: { edge: string; viewport: number }
    /**
     * Data-driven entrance preset definitions. Built into PresetOutput factories
     * at load time by shared/features/cms/animation/presets/index.ts.
     */
    entrancePresets?: Record<string, {
      presetVersion: string
      name: string
      group: 'safe' | 'expressive'
      keyframes: Array<Record<string, any>>
      duration?: number
      easing?: string
      reducedMotion?: string
      channels?: string[]
    }>
  }
  envVariables?: Record<string, ThemeEnvVariableDef>
  schemaVersion?: string
  migrations?: SchemaMigrationDef[]
}

export interface ThemeSettingGroup {
  id: string
  label: Record<string, string>
}

export interface ThemeEnvVariableDef {
  type: string
  label: Record<string, string>
  description?: string
  default?: string
}

export interface ThemeSettingField {
  id: string
  type: string
  label: string | Record<string, string>
  default?: any
  options?: any[] | Record<string, any>
  placeholder?: string
  cssVar?: boolean
  group?: string
}

export interface ThemeSummary {
  name: string
  allowedBlocks: string[]
  blockCount: number
}

/**
 * Authoring surfaces where a block is optimized and promoted.
 *
 * This is ranking metadata, not an insertion or renderer gate: every active
 * block remains available on every compatible layout. Omitting `surfaces`
 * preserves the historical site-first ranking for existing schemas.
 */
export type BlockSchemaSurface = 'site' | 'canvas'

/** Progressive-disclosure hint for the Add Block picker. */
export type BlockSchemaTier = 'basic' | 'standard' | 'advanced'

/**
 * Lifecycle state for new insertion. Deprecated schemas stay registered so
 * old content can render, but are omitted from the Add Block picker.
 */
export type BlockSchemaStatus = 'active' | 'deprecated'

export interface BlockSchema {
  type: string
  component: string
  /**
   * Settings fragments this schema opts into (`themes/<theme>/settings-fragments/<id>.json`).
   * Resolved away at load time — a schema handed to the admin or the renderer
   * never still carries it. See `shared/features/cms/settingsFragments.mjs`.
   */
  $fragments?: string[]
  /**
   * Per-block patches on a fragment-owned setting, keyed by setting id. Only
   * `showIf` / `default`-class keys — `id`, `type` and `options` stay with the
   * fragment. Resolved away at load time like `$fragments`.
   */
  $fragmentOverrides?: Record<string, Record<string, any>>
  label: string | Record<string, string>
  category?: string
  description?: string | Record<string, string>
  /** Omit for backwards-compatible site-first ranking; never restricts insertion. */
  surfaces?: BlockSchemaSurface[]
  /** Optional complexity cue displayed in the component catalog. */
  tier?: BlockSchemaTier
  /** Omit for active. Deprecated blocks remain renderable but cannot be newly inserted. */
  status?: BlockSchemaStatus
  /** Suggested schema type when `status` is deprecated. Informational only. */
  replacement?: string
  /** Search aliases and author vocabulary; never rendered as settings. */
  keywords?: string[]
  settings: BlockSchemaField[]
  groups?: { id: string; label: string | Record<string, string> }[]
  presets?: Record<string, any>[]
  childBlocks?: string[]
  events?: string[]
  isLayoutComponent?: boolean
  authAware?: boolean
  targets?: Record<string, { description?: string; selector?: string; multiple?: boolean; animatable?: string[]; canTrigger?: boolean }>
  motionSupport?: {
    levels?: string[]
    excluded?: string[]
  }
  motionHints?: {
    prefersLayerPromotion?: string[]
    isolateTransforms?: string[]
    containsDynamicChildren?: boolean
    stableItemKeysTarget?: string
    triggerRootOverride?: string
  }
  roleNotes?: Record<string, string>
  compatibleSectionRoles?: string[]
}

/**
 * A block schema field as the PUBLIC renderer sees it — the projection emitted
 * into `blockSchemasRuntime.ts` by `generate-block-registry.mjs`.
 *
 * Deliberately narrower than `BlockSchemaField`: every key here has a proven
 * runtime consumer. Widening it means adding the key to the generator's
 * `projectRuntimeField` too, or the type will lie about what ships.
 */
export interface RuntimeBlockSchemaField {
  id: string
  type: string
  default?: any
  translatable?: boolean
  fields?: RuntimeBlockSchemaField[]
}

/** A block schema as the PUBLIC renderer sees it. See `RuntimeBlockSchemaField`. */
export interface RuntimeBlockSchema {
  type: string
  settings: RuntimeBlockSchemaField[]
  targets?: BlockSchema['targets']
  motionHints?: BlockSchema['motionHints']
}

export interface BlockSchemaFieldValidation {
  required?: boolean
  minLength?: number
  maxLength?: number
  pattern?: string
}

export interface BlockSchemaFieldRangeOptions {
  min?: number
  max?: number
  step?: number
  unit?: string
}

export interface BlockSchemaField {
  id: string
  type: string
  label: string | Record<string, string>
  default?: any
  translatable?: boolean
  group?: string
  options?: BlockSchemaFieldRangeOptions | Array<{ value: string; label: string | Record<string, string> }> | Record<string, any>
  placeholder?: string
  cssVar?: string
  /**
   * The value this field takes when the block is inserted EDGE-TO-EDGE on a
   * brand canvas (`server/services/schema/canvasBlockInsertionDefaults.ts`).
   *
   * Declared per field and never per field NAME: the server rule that reads it
   * mentions no id, so a block whose width knob is called `maxWidth` or
   * `imageWidth` participates by annotating itself. Absent = the block is born
   * with its ordinary `default` on a canvas too.
   *
   * Insertion-only. It never migrates an existing block and no renderer reads
   * it — the value lands as an ordinary instance setting the author can see in
   * the settings panel and change with one select.
   */
  canvasDefault?: string
  validation?: BlockSchemaFieldValidation
  allowedBlocks?: string[]
  maxBlocks?: number
  maxItems?: number
  fields?: BlockSchemaField[]
  note?: string
  multi?: boolean
  /**
   * Conditional visibility. Shown only when the condition matches sibling field
   * values. Supports operator (`{ id, gt: 0 }`), implicit-AND map
   * (`{ a: "x", b: true }`) and combinator (`allOf`/`anyOf`/`not`) forms —
   * see `admin/utils/showIfCondition.ts` (`evaluateShowIf`).
   */
  showIf?: Record<string, any>
  /** Same condition grammar as `showIf`, but toggles enabled/disabled instead of visibility. */
  dependsOn?: Record<string, any>
  hidden?: boolean
  internal?: boolean
}

// Schema migration types

/** A scalar the renamed field takes, or a patch across several settings. */
export type RenameValueTarget =
  | string
  | number
  | boolean
  | null
  /**
   * For an authored value the new vocabulary cannot express on its own
   * (`imagePosition: 'none'` against a side-only `mediaSide`): write these
   * settings verbatim instead of the renamed field alone.
   */
  | { set: Record<string, unknown> }

/**
 * What happens to an authored value a `valueMap` does not mention:
 * carry it across untouched, drop it so the default tiers decide, or
 * substitute an explicit replacement.
 */
export type UnmappedValuePolicy = 'keep' | 'default' | { to: RenameValueTarget }

export interface FieldChange {
  type: 'rename' | 'remove' | 'add'
  block: string
  from?: string
  to?: string
  default?: any
  /**
   * Rename-only: map authored values onto the new field's vocabulary
   * (`{ top: 'above' }`). A pure key rename needs no map at all; a map that
   * re-spells the vocabulary should list every legacy option, because
   * everything it omits is left to `unmappedValue`.
   */
  valueMap?: Record<string, RenameValueTarget>
  /** Rename-only. Defaults to `'keep'`. */
  unmappedValue?: UnmappedValuePolicy
  /** Why this change decides what it decides — read by humans, not by code. */
  note?: string
}

export interface SchemaMigrationDef {
  version: string
  description?: string
  changes: FieldChange[]
}

export interface MigrationResult {
  success: boolean
  fromVersion: string
  toVersion: string
  migratedFields: MigratedField[]
  warnings: string[]
}

export interface MigratedField {
  pageId: string
  blockId: string
  blockType: string
  action: 'renamed' | 'removed' | 'added'
  field: string
  toField?: string
  /** Rename-only: the authored value, and the settings patch written for it. */
  fromValue?: unknown
  toValue?: Record<string, unknown>
}

export interface SchemaFieldSnapshot {
  id: string
  type: string
  default?: any
}

export interface SchemaSnapshot {
  capturedAt: string
  blocks: Record<string, SchemaFieldSnapshot[]>
}
