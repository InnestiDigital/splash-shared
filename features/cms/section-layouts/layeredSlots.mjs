// "Does this section type offer free placement?" — one answer, four callers.
//
// The runtime half of `layeredSlots.ts`, which re-exports everything here and
// keeps the `LayeredProbeSchema` type. Plain ESM because the editable-surface
// registry builder is plain ESM too (it runs under plain Node in the drift
// gate), and a second copy of this predicate is exactly the drift the module's
// own header warns about: a gesture the preview accepts would become a 422
// nobody can explain.
//
// Contract: docs/architecture/section-layout-engine-contract.md §7.

const LAYERED = 'layered'

/** The `layoutBind` target that swaps one slot's flow. */
function slotFlowTarget(role) {
  return typeof role === 'string' && role.length > 0 ? `slot.${role}.flow` : null
}

/**
 * Whether any slot of this schema can be `layered` — declared outright, or
 * reachable through a `slot.<role>.flow` binding.
 *
 * The bound case is not hypothetical: a section type may offer "free placement"
 * as one option of a layout setting, exactly the way gallery offers masonry. A
 * gate that only read the declared flow would refuse geometry for a section the
 * author had legitimately switched over.
 *
 * @param {import('./layeredSlots').LayeredProbeSchema | null | undefined} schema
 * @returns {boolean}
 */
export function declaresLayeredSlot(schema) {
  const slots = schema?.layout?.slots
  if (!Array.isArray(slots)) return false

  const roles = new Set()
  for (const slot of slots) {
    if (slot?.flow === LAYERED) return true
    const target = slotFlowTarget(slot?.role)
    if (target) roles.add(target)
  }

  for (const setting of schema?.settings ?? []) {
    if (!Array.isArray(setting.layoutBind)) continue
    const bound = setting.layoutBind.filter(
      binding => typeof binding?.target === 'string' && roles.has(binding.target),
    )
    if (bound.length === 0) continue
    const sources = [
      ...(setting.options ?? []).map(option => option.layoutValues),
      setting.layoutValue,
      setting.layoutValueOff,
    ]
    for (const source of sources) {
      if (!source) continue
      for (const binding of bound) {
        if (source[binding.target] === LAYERED) return true
      }
    }
  }
  return false
}

/**
 * The subset of a theme's section types that offer free placement.
 *
 * @param {Readonly<Record<string, any>>} schemas
 * @returns {Set<string>}
 */
export function layeredSectionTypes(schemas) {
  const types = new Set()
  for (const [type, schema] of Object.entries(schemas)) {
    if (declaresLayeredSlot(schema)) types.add(type)
  }
  return types
}
