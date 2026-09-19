<script setup lang="ts">
import { computed, inject, type Ref } from 'vue'
import type { LayoutChromeConfig, LayoutChromeElement, ResolvedLayoutConfig } from '~/shared/types/layout'
import LineChromeElement from './elements/LineChromeElement.vue'
import ShapeChromeElement from './elements/ShapeChromeElement.vue'
import ImageChromeElement from './elements/ImageChromeElement.vue'
import TextChromeElement from './elements/TextChromeElement.vue'
import ProgressChromeElement from './elements/ProgressChromeElement.vue'
import LayoutDesignChromeLayer from './LayoutDesignChromeLayer.vue'
import { RESOLVED_LAYOUT_KEY } from './layoutInjectionKey'

const props = withDefaults(
  defineProps<{ chrome: LayoutChromeConfig; mode?: 'viewport' | 'flow' }>(),
  { mode: 'viewport' },
)

const resolvedLayout = inject<Ref<ResolvedLayoutConfig> | null>(RESOLVED_LAYOUT_KEY, null)
const isScale = computed(() => (resolvedLayout?.value?.frame.responsiveMode ?? 'breakpoint') === 'scale')

// Both background-layer wrapper AND design-coords wrapper own a transform
// context that a child's `position: fixed` would escape (fixed elements
// anchor to the nearest transformed ancestor in modern browsers, but the
// behavior across stacking-context interactions is brittle). Coerce to
// `absolute` so the child positions inside the wrapper's box.
function asAbsolute(el: LayoutChromeElement): LayoutChromeElement {
  return { ...el, position: 'absolute' } as LayoutChromeElement
}

function isFlow(el: LayoutChromeElement): boolean {
  return (el.positionMode ?? 'viewport-fixed') === 'flow'
}

// Flow-mode elements render inside the content box (via mode='flow' below).
// Everything else — background, foreground, design layers — belongs to the
// shell-level viewport renderer.
const isFlowMode = computed(() => props.mode === 'flow')

// Design-coords elements are only meaningful in scale mode. In breakpoint
// mode there is no canvas to mirror, so they fall through to viewport.
const designEnabled = computed(() => isScale.value)

const bgElements = computed(() =>
  props.chrome.elements
    .filter(e => !isFlow(e) && (e.layer ?? 'foreground') === 'background' && (!designEnabled.value || (e.coordSpace ?? 'viewport') !== 'design'))
    .map(asAbsolute),
)

const fgElements = computed(() =>
  props.chrome.elements
    .filter(e => !isFlow(e) && (e.layer ?? 'foreground') !== 'background' && (!designEnabled.value || (e.coordSpace ?? 'viewport') !== 'design')),
)

const designElements = computed(() =>
  designEnabled.value
    ? props.chrome.elements.filter(e => !isFlow(e) && (e.coordSpace ?? 'viewport') === 'design').map(asAbsolute)
    : [],
)

// Flow mode renders ONLY flow elements, coerced to absolute so they position
// inside the .layout-chrome-flow wrapper's box (inset:0 over the content).
const flowElements = computed(() =>
  props.chrome.elements.filter(isFlow).map(asAbsolute),
)
</script>

<template>
  <div
    v-if="isFlowMode"
    class="layout-chrome-flow"
    data-chrome-layer="flow"
  >
    <template v-for="el in flowElements" :key="el.id">
      <LineChromeElement v-if="el.type === 'line'" :element="el" />
      <ShapeChromeElement v-else-if="el.type === 'shape'" :element="el" />
      <ImageChromeElement v-else-if="el.type === 'image'" :element="el" />
      <TextChromeElement v-else-if="el.type === 'text'" :element="el" />
      <ProgressChromeElement v-else-if="el.type === 'progress'" :element="el" />
    </template>
  </div>
  <template v-else>
    <div v-if="bgElements.length" class="layout-chrome-bg" data-chrome-layer="background">
      <template v-for="el in bgElements" :key="el.id">
        <LineChromeElement v-if="el.type === 'line'" :element="el" />
        <ShapeChromeElement v-else-if="el.type === 'shape'" :element="el" />
        <ImageChromeElement v-else-if="el.type === 'image'" :element="el" />
        <TextChromeElement v-else-if="el.type === 'text'" :element="el" />
        <ProgressChromeElement v-else-if="el.type === 'progress'" :element="el" />
      </template>
    </div>
    <LayoutDesignChromeLayer v-if="designElements.length">
      <template v-for="el in designElements" :key="el.id">
        <LineChromeElement v-if="el.type === 'line'" :element="el" />
        <ShapeChromeElement v-else-if="el.type === 'shape'" :element="el" />
        <ImageChromeElement v-else-if="el.type === 'image'" :element="el" />
        <TextChromeElement v-else-if="el.type === 'text'" :element="el" />
        <ProgressChromeElement v-else-if="el.type === 'progress'" :element="el" />
      </template>
    </LayoutDesignChromeLayer>
    <template v-for="el in fgElements" :key="el.id">
      <LineChromeElement v-if="el.type === 'line'" :element="el" />
      <ShapeChromeElement v-else-if="el.type === 'shape'" :element="el" />
      <ImageChromeElement v-else-if="el.type === 'image'" :element="el" />
      <TextChromeElement v-else-if="el.type === 'text'" :element="el" />
      <ProgressChromeElement v-else-if="el.type === 'progress'" :element="el" />
    </template>
  </template>
</template>

<style scoped>
.layout-chrome-bg {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  isolation: isolate;
  overflow: hidden;
}

/* Flow-mode chrome: absolutely fills the content wrapper (which is
   position:relative), so it scrolls WITH the content and ends before the
   footer (a sibling of the wrapper, not a descendant). No `isolation:isolate`
   — the line must paint behind sibling content blocks.

   z-index MUST be negative: sibling content blocks are frequently
   `position:static` (e.g. the project/diary index card grids). Per CSS paint
   order a positioned `z-index:0` layer paints ABOVE static block descendants,
   so `z-index:0` here made the editorial rule bleed OVER card images/titles on
   index pages. A negative z-index drops the wrapper below static content while
   still painting above the (transparent) ancestor backgrounds, so the rule
   stays visible in empty gutters and is cleanly occluded by content blocks. */
.layout-chrome-flow {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: -1;
}
</style>
