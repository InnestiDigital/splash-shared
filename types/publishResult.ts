/**
 * Shared publish result types — exported so the admin UI can consume
 * strippedEntries from the publish and preflight endpoints without
 * duplicating the interface definitions.
 */
export type { StrippedEntry } from '~/server/services/animation/sceneValidationService'
export type { PublishResult } from '~/server/services/publish/publishService'
