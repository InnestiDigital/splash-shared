<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { ProgressChromeElement } from '~/shared/types/layout'
import { useReducedMotion } from '~/shared/composables/useReducedMotion'
import { anchorStyles, baseChromeStyles, hideBelowAttr } from '../chromeStyle'

const props = defineProps<{ element: ProgressChromeElement }>()

const visible = computed(() => props.element.enabled !== false)
const indicator = computed(() => props.element.indicator ?? 'bar')
const thickness = computed(() => props.element.thickness ?? '3px')
const edge = computed(() => props.element.edge ?? 'top')
const ringSize = computed(() => props.element.size ?? '44px')

const { isReducedMotion } = useReducedMotion()

// 0→1 scroll progress, rAF-throttled. Drives a CSS var so the bar fill and the
// ring stroke-dashoffset both read the same reactive value.
const progress = ref(0)
let frame = 0

function measure() {
  frame = 0
  if (typeof window === 'undefined') return
  const doc = document.documentElement
  const scrollable = doc.scrollHeight - window.innerHeight
  progress.value = scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0
}

function onScroll() {
  if (frame) return
  frame = window.requestAnimationFrame(measure)
}

onMounted(() => {
  if (typeof window === 'undefined') return
  measure()
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onScroll, { passive: true })
})

onUnmounted(() => {
  if (typeof window === 'undefined') return
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('resize', onScroll)
  if (frame) window.cancelAnimationFrame(frame)
})

const percent = computed(() => Math.round(progress.value * 100))

// --- Bar geometry ---
const barWrapperStyles = computed(() => {
  const e = props.element
  return {
    ...baseChromeStyles(e),
    left: '0',
    right: '0',
    width: '100%',
    height: thickness.value,
    [edge.value]: e.offsetY || '0',
    backgroundColor: e.trackColor ?? 'transparent',
  }
})

const barFillStyles = computed(() => ({
  width: `${progress.value * 100}%`,
  height: '100%',
  backgroundColor: props.element.color,
  transition: isReducedMotion.value ? 'none' : 'width 80ms linear',
}))

// --- Ring geometry (SVG circle, stroke-dashoffset gauge) ---
const RING_VIEWBOX = 40
const RING_R = 16
const RING_C = 2 * Math.PI * RING_R
const ringStrokeWidth = computed(() => {
  // thickness may carry a px unit; map it onto the 40-unit viewBox proportionally
  const n = Number.parseFloat(thickness.value)
  return Number.isFinite(n) ? Math.max(1.5, n) : 3
})
const ringDashoffset = computed(() => RING_C * (1 - progress.value))

const ringWrapperStyles = computed(() => {
  const e = props.element
  return {
    ...baseChromeStyles(e),
    width: ringSize.value,
    height: ringSize.value,
    ...anchorStyles(e.anchor, e.offsetX, e.offsetY),
  }
})

const ringFillTransition = computed(() =>
  isReducedMotion.value ? 'none' : 'stroke-dashoffset 80ms linear',
)

const hideBelow = computed(() => hideBelowAttr(props.element.hideBelow))
</script>

<template>
  <div
    v-if="visible && indicator === 'bar'"
    data-chrome-element="progress"
    data-progress-indicator="bar"
    :data-hide-below="hideBelow"
    :style="barWrapperStyles"
    role="progressbar"
    aria-label="Reading progress"
    :aria-valuenow="percent"
    aria-valuemin="0"
    aria-valuemax="100"
  >
    <div :style="barFillStyles" />
  </div>

  <div
    v-else-if="visible"
    data-chrome-element="progress"
    data-progress-indicator="ring"
    :data-hide-below="hideBelow"
    :style="ringWrapperStyles"
    role="progressbar"
    aria-label="Reading progress"
    :aria-valuenow="percent"
    aria-valuemin="0"
    aria-valuemax="100"
  >
    <svg :viewBox="`0 0 ${RING_VIEWBOX} ${RING_VIEWBOX}`" width="100%" height="100%">
      <circle
        :cx="RING_VIEWBOX / 2"
        :cy="RING_VIEWBOX / 2"
        :r="RING_R"
        fill="none"
        :stroke="element.trackColor ?? 'rgba(0,0,0,0.12)'"
        :stroke-width="ringStrokeWidth"
      />
      <circle
        :cx="RING_VIEWBOX / 2"
        :cy="RING_VIEWBOX / 2"
        :r="RING_R"
        fill="none"
        :stroke="element.color"
        :stroke-width="ringStrokeWidth"
        stroke-linecap="round"
        :stroke-dasharray="RING_C"
        :stroke-dashoffset="ringDashoffset"
        :transform="`rotate(-90 ${RING_VIEWBOX / 2} ${RING_VIEWBOX / 2})`"
        :style="{ transition: ringFillTransition }"
      />
      <text
        v-if="element.showLabel"
        :x="RING_VIEWBOX / 2"
        :y="RING_VIEWBOX / 2"
        text-anchor="middle"
        dominant-baseline="central"
        :fill="element.color"
        font-size="11"
        font-weight="600"
      >{{ percent }}</text>
    </svg>
  </div>
</template>
