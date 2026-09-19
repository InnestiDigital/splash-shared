<script setup lang="ts">
/**
 * The generic section layout engine.
 *
 * One component for every section type. It reads the `layout` block of a
 * `*.v2.json` section-type schema, resolves the responsive tier from
 * `useViewport()`, applies the `layoutBind` settings the author has set, and
 * writes CSS Grid geometry as inline style on the section root, on one wrapper
 * per zone and on one wrapper per slot.
 *
 * There is no per-type SCSS, no per-type component, and — deliberately — no
 * `@media`: the tier decision lives in TS and CSS keys off `data-collapse` /
 * `data-layout-tier`, which is the house rule from
 * docs/design/composition-responsive.md generalised from a boolean to a tier.
 *
 * Slot roles are iterated from data. No role name appears in this file.
 *
 * Contract: docs/architecture/section-layout-engine-contract.md
 */
import { computed, inject, type ComputedRef } from 'vue'
import { useViewport } from '~/shared/composables/useViewport'
import {
  applyLayoutBindings,
  applyPreset,
  cloneLayout,
  gridItemStyle,
  PRESET_CONFIG_KEY,
  presetById,
  resolveLayoutTier,
  resolveSectionLayout,
  sectionRootStyle,
  slotFlowStyle,
  zoneFlowStyle,
} from './engine/resolveLayout'
import { slotFlowRenderer } from './engine/flows'
import type {
  BlocksByRole,
  ResolvedBlock,
  ResolvedLayoutSlot,
  SectionTypeSchemaV2,
} from '~/shared/types/sectionTypes'

const props = defineProps<{
  section: { id: string }
  schema: SectionTypeSchemaV2
  layoutConfig: Record<string, unknown>
  blocksByRole: BlocksByRole
}>()

/**
 * Sibling index for the `alternate-by-index` resolver.
 *
 * `DynamicPage` already publishes this map (it counts only same-type siblings,
 * so interspersed sections of other types do not shift the alternation). L2
 * generalises the provide key beyond the one type that needs it today.
 */
const sectionIndexMap = inject<ComputedRef<Record<string, number>>>(
  'editorialSplitIndexMap',
  computed(() => ({})),
)

const { innerWidth } = useViewport()

const tier = computed(() => resolveLayoutTier(props.schema.layout.tiers, innerWidth.value))

const bindingContext = (activeTier: string) => ({
  activeTier,
  sectionIndex: sectionIndexMap.value[props.section.id] ?? 0,
})

const draft = computed(() => {
  const cloned = cloneLayout(props.schema.layout)
  // A preset patches the base layout BEFORE authored settings, so a section
  // setting always wins over the preset it sits on (unification C2).
  const preset = presetById(props.schema, props.layoutConfig[PRESET_CONFIG_KEY])
  if (preset) applyPreset(cloned, preset, bindingContext(tier.value))
  return applyLayoutBindings(
    cloned,
    props.schema.settings,
    props.layoutConfig,
    bindingContext(tier.value),
  )
})

const resolved = computed(() => resolveSectionLayout(draft.value, tier.value))

const rootStyle = computed(() => sectionRootStyle(resolved.value))

/**
 * Unbound settings become `data-<setting-id>` on the root and theme SCSS keys
 * off them (contract §3.7). The engine claims geometry, not decoration: a
 * hairline border or a centred text treatment is not a grid decision.
 */
const dataAttrs = computed(() => {
  const attrs: Record<string, string> = {}
  for (const setting of props.schema.settings) {
    if (setting.layoutBind && setting.layoutBind.length > 0) continue
    const value = props.layoutConfig[setting.id] ?? setting.default
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      attrs[`data-${kebabCase(setting.id)}`] = String(value)
    }
  }
  return attrs
})

function kebabCase(id: string): string {
  return id.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

interface RenderedZone {
  name: string
  style: Record<string, string>
  slots: ResolvedLayoutSlot[]
}

/**
 * Zones in declaration order. With `grid-template-areas` the named areas do the
 * placing, so DOM order is not the visual order — which is how `shellSide`
 * swaps the columns without reordering anything, and how the floor tier keeps
 * chrome below content regardless of that setting.
 *
 * A zone holding no blocks is rendered but `display: none`. The hand-written
 * layouts `v-if`-ed their empty regions away, and a zero-height grid item is
 * NOT equivalent: it still claims its share of `row-gap`, so a gallery with
 * only a heading and its items would carry three phantom `lg` gaps. Taking it
 * out of the box tree removes the gap; keeping the element keeps every
 * `[data-zone]` selector and the zone's own resolved geometry observable.
 */
const renderedZones = computed<RenderedZone[]>(() =>
  draft.value.zoneOrder.flatMap(name => {
    const zone = draft.value.zones[name]
    const item = resolved.value.zones[name]
    if (!zone || !item || !item.rendered) return []
    const slots = resolved.value.slots.filter(slot => slot.rendered && slot.zone === name)
    const empty = slots.every(slot => blocksFor(slot).length === 0)
    return [{
      name,
      style: {
        ...gridItemStyle(item),
        ...zoneFlowStyle(zone, resolved.value.collapse),
        ...(empty ? { display: 'none' } : {}),
      },
      slots,
    }]
  }),
)

/** Slots that bypass zones with line-based `place` — they are grid items themselves. */
const placedSlots = computed(() =>
  resolved.value.slots.filter(slot => slot.rendered && slot.item !== null),
)

function flowStyleFor(slot: ResolvedLayoutSlot): Record<string, string> {
  return slotFlowStyle(slot.flow, slot.flowOptions, resolved.value.collapse)
}

function slotStyleFor(slot: ResolvedLayoutSlot): Record<string, string> {
  return slot.item ? { ...gridItemStyle(slot.item), ...flowStyleFor(slot) } : flowStyleFor(slot)
}

/**
 * Blocks for one slot, capped by the authoring contract rather than by the
 * layout: a `layoutSlots` entry with `multiple: false` renders its first block
 * only, which is the hard cap the hand-written layouts applied to headings.
 */
function blocksFor(slot: ResolvedLayoutSlot): ResolvedBlock[] {
  const blocks = props.blocksByRole[slot.role] ?? []
  const authoring = props.schema.layoutSlots.find(candidate => candidate.role === slot.role)
  return authoring && authoring.multiple === false ? blocks.slice(0, 1) : blocks
}
</script>

<template>
  <div
    class="schema-layout"
    :style="rootStyle"
    :data-layout-tier="resolved.tier || undefined"
    :data-collapse="resolved.collapse"
    v-bind="dataAttrs"
  >
    <div
      v-for="zone in renderedZones"
      :key="zone.name"
      class="schema-layout__zone"
      :data-zone="zone.name"
      :style="zone.style"
    >
      <component
        :is="slotFlowRenderer(slot.flow)"
        v-for="slot in zone.slots"
        :key="slot.role"
        :flow-slot="slot"
        :blocks="blocksFor(slot)"
        :root-style="flowStyleFor(slot)"
        :collapse="resolved.collapse"
        :layout-config="layoutConfig"
      />
    </div>

    <component
      :is="slotFlowRenderer(slot.flow)"
      v-for="slot in placedSlots"
      :key="`placed-${slot.role}`"
      :flow-slot="slot"
      :blocks="blocksFor(slot)"
      :root-style="slotStyleFor(slot)"
      :collapse="resolved.collapse"
      :layout-config="layoutConfig"
      class="schema-layout__slot--placed"
    />
  </div>
</template>

<style lang="scss" scoped>
// Geometry is inline style, per tier, computed in TS. The only thing left for
// CSS is the `min-width: 0` floor every grid/flex descendant needs so an
// oversized media child cannot push its track past the section width — the same
// reason every track list in the schemas is written `minmax(0, …)`.
//
// No `@media` here on purpose: collapse decisions belong to `resolveLayoutTier`
// and reach CSS as `data-collapse` / `data-layout-tier`.
.schema-layout {
  min-width: 0;

  &__zone,
  &__slot {
    min-width: 0;
  }
}
</style>
