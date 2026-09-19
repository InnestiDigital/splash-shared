// shared/features/cms/section-layouts/engine/flows/index.ts
//
// Slot-flow dispatch: one `SlotFlowMode` → the component that renders it.
//
// The switch is exhaustive with a `never` default, so adding a member to
// `SLOT_FLOW_MODES` fails the build here until it has a renderer — the same
// discipline the engine's other dispatches use.
//
// Contract: docs/architecture/section-layout-engine-contract.md §3.5.

import { markRaw, type Component } from 'vue'
import type { SlotFlowMode } from '~/shared/types/sectionTypes'
import SlotFlowStackComponent from './SlotFlowStack.vue'
import SlotFlowMasonryComponent from './SlotFlowMasonry.vue'
import SlotFlowStripComponent from './SlotFlowStrip.vue'
import SlotFlowCarouselComponent from './SlotFlowCarousel.vue'
import SlotFlowLayeredComponent from './SlotFlowLayered.vue'

// `markRaw` because this dispatch is called from a template expression: the
// returned definition would otherwise be pulled into the render context's
// reactive proxy, which Vue warns about and which costs a proxy per block.
const SlotFlowStack = markRaw(SlotFlowStackComponent)
const SlotFlowMasonry = markRaw(SlotFlowMasonryComponent)
const SlotFlowStrip = markRaw(SlotFlowStripComponent)
const SlotFlowCarousel = markRaw(SlotFlowCarouselComponent)
const SlotFlowLayered = markRaw(SlotFlowLayeredComponent)

export type { SlotFlowProps } from './types'
export { slotBlockKey } from './types'

export function slotFlowRenderer(flow: SlotFlowMode): Component {
  switch (flow) {
    case 'stack':
    case 'grid':
      return SlotFlowStack
    case 'masonry':
      return SlotFlowMasonry
    case 'strip':
      return SlotFlowStrip
    case 'carousel':
      return SlotFlowCarousel
    case 'layered':
      return SlotFlowLayered
    default: {
      const exhaustive: never = flow
      throw new Error(`[layoutEngine] unhandled slot flow "${String(exhaustive)}"`)
    }
  }
}
