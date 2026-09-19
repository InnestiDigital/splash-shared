<!-- shared/features/cms/placement/PlacementWrapper.vue -->
<script setup lang="ts">
import { toRef, computed, inject } from 'vue'
import type { BlockPlacementConfig } from '~/shared/types/placement'
import type { HandleKind } from '~/shared/features/layout-interaction'
import { usePlacementStyles } from './usePlacementStyles'
import { CANVAS_LAYER_CONTEXT } from './canvasLayerContext'

const props = defineProps<{
  blockId?: string
  placement?: BlockPlacementConfig
  layoutConstraints?: { forceWidth?: boolean; ignoreAlign?: boolean }
}>()

const placementRef = toRef(props, 'placement')
const { placementClasses, placementVars, hasFrame, frameVars } = usePlacementStyles(
  placementRef,
  props.layoutConstraints,
)

const frameClasses = computed(() => {
  const p = props.placement
  if (!hasFrame.value || !p?.wrapperStyle || p.wrapperStyle === 'none') return {}
  return { [`block-frame--${p.wrapperStyle}`]: true }
})

const canvasContext = inject(CANVAS_LAYER_CONTEXT, null)
const canvasItem = computed(() => {
  if (!canvasContext || !props.blockId) return null
  return canvasContext.items.value.find(item => item.id === props.blockId) ?? null
})
const isCanvasLayer = computed(() => canvasItem.value !== null)
const isSelected = computed(() =>
  !!props.blockId && canvasContext?.selectedItemId.value === props.blockId,
)
const isGestureActive = computed(() =>
  !!props.blockId && canvasContext?.activeGestureItemId.value === props.blockId,
)
const showHandles = computed(() =>
  !!canvasContext?.interactive && isSelected.value && canvasItem.value?.locked !== true,
)
const resizeHandles: HandleKind[] = ['resize-nw', 'resize-ne', 'resize-sw', 'resize-se']
const canvasGestureZIndex = computed(() => {
  if (!canvasContext || !isGestureActive.value) return canvasItem.value?.zIndex
  return Math.max(0, ...canvasContext.items.value.map(item => item.zIndex)) + 1
})

const canvasLayerStyle = computed<Record<string, string> | undefined>(() => {
  const item = canvasItem.value
  if (!item) return undefined
  // Match ScatterCollage's centre-coordinate geometry exactly. translate()
  // percentages are relative to the item itself, hence position / size.
  const elementX = (item.positionX / item.width) * 100 - 50
  const elementY = (item.positionY / item.height) * 100 - 50
  return {
    left: '0',
    top: '0',
    width: `${item.width}%`,
    height: `${item.height}%`,
    transform: `translate(${elementX}%, ${elementY}%) rotate(${item.rotation}deg)`,
    // Direct manipulation gets a temporary visual lift so handles remain
    // reachable. The authored layer order remains the persistent source of
    // truth and is never rewritten merely because an item was moved.
    zIndex: String(canvasGestureZIndex.value ?? item.zIndex),
    touchAction: canvasContext?.interactive && !item.locked ? 'none' : 'auto',
  }
})

function onPointerDown(event: PointerEvent) {
  if (canvasContext && props.blockId) {
    canvasContext.onPointerDownItem(event, props.blockId)
  }
}

function onHandlePointerDown(event: PointerEvent, kind: HandleKind) {
  if (canvasContext && props.blockId) {
    canvasContext.onPointerDownHandle(event, props.blockId, kind)
  }
}
</script>

<template>
  <div
    class="block-placement"
    :class="[
      placementClasses,
      {
        'block-placement--canvas-layer': isCanvasLayer,
        'is-selected': isCanvasLayer && isSelected,
        'is-locked': canvasItem?.locked,
      },
    ]"
    :style="[placementVars, canvasLayerStyle]"
    :data-canvas-block-id="isCanvasLayer ? blockId : undefined"
    :data-motion-suppressed="isGestureActive ? 'true' : undefined"
    @pointerdown="onPointerDown"
  >
    <div v-if="hasFrame" class="block-frame" :class="frameClasses" :style="frameVars">
      <slot />
    </div>
    <slot v-else />

    <template v-if="showHandles">
      <span
        v-for="kind in resizeHandles"
        :key="kind"
        :class="['canvas-layer-handle', `canvas-layer-handle--${kind}`]"
        role="button"
        :aria-label="`Resize layer ${kind.replace('resize-', '').toUpperCase()}`"
        @pointerdown.stop="onHandlePointerDown($event, kind)"
      />
      <span
        class="canvas-layer-handle canvas-layer-handle--rotate"
        role="button"
        aria-label="Rotate layer"
        @pointerdown.stop="onHandlePointerDown($event, 'rotate')"
      />
    </template>
  </div>
</template>

<style lang="scss">
@import './placement.scss';
</style>
