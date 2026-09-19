import type {
  BlockSchema,
  BlockSchemaStatus,
  BlockSchemaSurface,
  BlockSchemaTier,
} from '~/shared/types/theme'

export const BLOCK_SCHEMA_SURFACES = ['site', 'canvas'] as const satisfies readonly BlockSchemaSurface[]
export const BLOCK_SCHEMA_TIERS = ['basic', 'standard', 'advanced'] as const satisfies readonly BlockSchemaTier[]
export const BLOCK_SCHEMA_STATUSES = ['active', 'deprecated'] as const satisfies readonly BlockSchemaStatus[]

type BlockSurfaceCatalogEntry = {
  status?: BlockSchema['status']
  surfaces?: readonly BlockSchemaSurface[]
}

/**
 * Whether a schema may be offered for new insertion.
 *
 * Surface metadata is a discovery hint, never a capability gate: authors may
 * use site-oriented components on a canvas and canvas primitives on a site.
 * Only lifecycle status removes a schema from insertion; deprecated content
 * remains renderable through DynamicPage.
 */
export function isBlockSchemaInsertable(schema: BlockSurfaceCatalogEntry): boolean {
  return schema.status !== 'deprecated'
}

/**
 * Whether a schema should be promoted for an authoring surface.
 *
 * Missing metadata preserves the historical meaning: an existing component is
 * site-first, while explicit `canvas` metadata elevates a primitive in canvas
 * discovery without taking it away anywhere else.
 */
export function isBlockSchemaPreferredOnSurface(
  schema: BlockSurfaceCatalogEntry,
  surface: BlockSchemaSurface,
): boolean {
  if (schema.surfaces === undefined) return surface === 'site'
  return schema.surfaces.includes(surface)
}

/** True only for an explicit surface declaration, useful for confidence badges. */
export function explicitlySupportsBlockSurface(
  schema: Pick<BlockSurfaceCatalogEntry, 'surfaces'>,
  surface: BlockSchemaSurface,
): boolean {
  return schema.surfaces?.includes(surface) === true
}
