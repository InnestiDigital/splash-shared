/**
 * Weighted motion budget calculator for the Platform Motion Layer.
 * Assigns costs to animation effects and computes page-level budgets
 * to prevent performance degradation from excessive motion.
 */

import type { AnimationScene, AnimationEntry, ScrollTrigger } from '~/shared/types/animation'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MotionCost {
  sceneCost: number
  breakdown: Record<string, number> // effect → cost
}

interface PageBudget {
  totalCost: number
  sceneCosts: Array<{ sceneId: string; cost: number; breakdown: Record<string, number> }>
  overBudget: boolean
  budgetLimit: number
}

// ---------------------------------------------------------------------------
// Effect cost weights
// ---------------------------------------------------------------------------

export const EFFECT_COSTS: Record<string, number> = {
  opacity: 1,
  transform: 1, // translate, scale, rotate
  blur: 5,
  clipPath: 3,
  color: 1,
  backgroundColor: 1,
  varTrack: 2, // per unique CSS custom property name
  pinned: 8,
  scrub: 6,
  stagger: 2, // per staggered item
}

/** Default budget limit for desktop. */
export const DEFAULT_BUDGET_DESKTOP = 100

// ---------------------------------------------------------------------------
// Scene cost calculation
// ---------------------------------------------------------------------------

export function calculateSceneCost(scene: AnimationScene): MotionCost {
  const breakdown: Record<string, number> = {}

  // Trigger-level costs
  if (scene.trigger.type === 'scroll') {
    const scrollTrigger = scene.trigger as ScrollTrigger
    if (scrollTrigger.pin) {
      breakdown.pinned = EFFECT_COSTS.pinned
    }
    if (scrollTrigger.scrub) {
      breakdown.scrub = EFFECT_COSTS.scrub
    }
  }

  // Entry-level costs (accumulate across all entries)
  for (const entry of scene.entries) {
    accumulateEntryCosts(entry, breakdown)
  }

  const sceneCost = Object.values(breakdown).reduce((sum, v) => sum + v, 0)
  return { sceneCost, breakdown }
}

function accumulateEntryCosts(entry: AnimationEntry, breakdown: Record<string, number>): void {
  let hasOpacity = false
  let hasTransform = false
  let hasBlur = false
  let hasClipPath = false
  let hasColor = false
  let hasBackgroundColor = false
  const varNames = new Set<string>()

  for (const kf of entry.keyframes) {
    if (kf.opacity !== undefined) hasOpacity = true
    if (kf.transform) hasTransform = true
    if (kf.blur !== undefined) hasBlur = true
    if (kf.clipPath !== undefined) hasClipPath = true
    if (kf.color !== undefined) hasColor = true
    if (kf.backgroundColor !== undefined) hasBackgroundColor = true
    if (kf.vars) {
      for (const name of Object.keys(kf.vars)) {
        varNames.add(name)
      }
    }
  }

  if (hasOpacity) {
    breakdown.opacity = (breakdown.opacity ?? 0) + EFFECT_COSTS.opacity
  }
  if (hasTransform) {
    breakdown.transform = (breakdown.transform ?? 0) + EFFECT_COSTS.transform
  }
  if (hasBlur) {
    breakdown.blur = (breakdown.blur ?? 0) + EFFECT_COSTS.blur
  }
  if (hasClipPath) {
    breakdown.clipPath = (breakdown.clipPath ?? 0) + EFFECT_COSTS.clipPath
  }
  if (hasColor) {
    breakdown.color = (breakdown.color ?? 0) + EFFECT_COSTS.color
  }
  if (hasBackgroundColor) {
    breakdown.backgroundColor = (breakdown.backgroundColor ?? 0) + EFFECT_COSTS.backgroundColor
  }
  if (varNames.size > 0) {
    breakdown.varTrack = (breakdown.varTrack ?? 0) + EFFECT_COSTS.varTrack * varNames.size
  }

  // Stagger cost: each staggered entry adds per-item cost
  if (entry.staggerGroup) {
    breakdown.stagger = (breakdown.stagger ?? 0) + EFFECT_COSTS.stagger
  }
}

// ---------------------------------------------------------------------------
// Page budget calculation
// ---------------------------------------------------------------------------

export function calculatePageBudget(
  scenes: AnimationScene[],
  limit: number = DEFAULT_BUDGET_DESKTOP,
): PageBudget {
  const sceneCosts: PageBudget['sceneCosts'] = []
  let totalCost = 0

  for (const scene of scenes) {
    const { sceneCost, breakdown } = calculateSceneCost(scene)
    sceneCosts.push({ sceneId: scene.id, cost: sceneCost, breakdown })
    totalCost += sceneCost
  }

  return {
    totalCost,
    sceneCosts,
    overBudget: totalCost > limit,
    budgetLimit: limit,
  }
}
