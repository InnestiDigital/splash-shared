<script setup lang="ts">
import { computed, watch, onBeforeUnmount, ref, toRef, provide } from 'vue'
import type { ResolvedLayoutConfig } from '~/shared/types/layout'
import LayoutChromeRenderer from './LayoutChromeRenderer.vue'
import LayoutBackgroundLayer from './LayoutBackgroundLayer.vue'
import LayoutScaleContent from './LayoutScaleContent.vue'
import { RESOLVED_LAYOUT_KEY } from './layoutInjectionKey'
import { resolveFrameTokens } from './frameTokens'
import { useLayoutScale } from './useLayoutScale'
import { useViewport } from '~/shared/composables/useViewport'
import { BREAKPOINTS } from '~/shared/features/cms/composition/responsive'

const props = defineProps<{ resolvedLayout: ResolvedLayoutConfig }>()

provide(RESOLVED_LAYOUT_KEY, toRef(props, 'resolvedLayout'))

const { innerWidth } = useViewport()

const responsiveMode = computed(() => props.resolvedLayout.frame.responsiveMode ?? 'breakpoint')
// Scale mode renders the page as a fixed designWidth (e.g. 1440px) canvas
// transform-scaled to fit. Below the mobile breakpoint that scale factor
// shrinks everything to ~27%, leaving text unreadable — and the readymag
// reference REFLOWS to a single column on mobile rather than scaling.
// So at or below BREAKPOINTS.md we drop to breakpoint mode: the content
// renders in the real-width container, every block's
// `@container (max-width: 768px)` rule fires, and the page reflows to one
// column exactly like the breakpoint-mode inner pages already do. 768 (iPad
// portrait) is inclusive-mobile, consistent with isMobileViewport().
const isScale = computed(
  () => responsiveMode.value === 'scale' && innerWidth.value > BREAKPOINTS.md,
)

const scale = useLayoutScale(() => props.resolvedLayout.frame)

const scaleOriginAttr = computed(() => props.resolvedLayout.frame.scaleOrigin ?? 'top-center')
const scaleOriginCss = computed(() => scaleOriginAttr.value === 'top-center' ? 'top center' : 'top left')
const designWidthCss = computed(() => `${props.resolvedLayout.frame.designWidth ?? 1440}px`)

// Unscaled content height tracked via ResizeObserver. Spacer height equals
// unscaledHeight × scale so document scroll length matches the visible page.
//
// IMPORTANT: must NOT use getBoundingClientRect().height here — the element
// is transformed, so getBoundingClientRect returns the POST-scale height.
// Multiplying that by scale would double-scale the spacer.
//   - Initial sync: scrollHeight (unaffected by transform).
//   - Subsequent updates: ResizeObserverEntry.contentRect.height (also
//     unaffected by transform — reports CSS layout box).
const contentRef = ref<HTMLElement | null>(null)
const unscaledHeight = ref(0)
let resizeObserver: ResizeObserver | null = null

// (Re)wire measurement whenever the scale-content element (re)appears.
// This was previously done once in onMounted gated on isScale — but isScale
// flips reactively at the md breakpoint and the v-if REPLACES the content
// element: resizing to mobile destroyed the observed node (the observer's
// last entry reported height 0), and resizing back created a NEW node that
// nothing observed. unscaledHeight stayed 0 → spacer height 0 → the shell
// collapsed to the chrome height and the footer rendered at the top of the
// page (the transformed canvas painting over it). Watching the element ref
// keeps measurement correct across any number of breakpoint crossings.
watch(contentRef, (el) => {
  resizeObserver?.disconnect()
  resizeObserver = null
  if (!el) return
  unscaledHeight.value = el.scrollHeight
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) unscaledHeight.value = entry.contentRect.height
    })
    resizeObserver.observe(el)
  }
}, { flush: 'post' })

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})

const spacerStyle = computed(() => ({
  height: `${unscaledHeight.value * scale.value}px`,
}))

// The frame as CSS custom properties — the page-level defaults every frame
// consumer (sections today, template roots next) reads. See ./frameTokens.ts.
const frameStyle = computed(() => resolveFrameTokens(props.resolvedLayout.frame))

const contentStyle = computed<Record<string, string>>(() => ({
  ...frameStyle.value,
  '--layout-design-width': designWidthCss.value,
  '--layout-scale': String(scale.value),
  '--layout-scale-origin': scaleOriginCss.value,
}))

const shellStyle = computed(() => {
  const f = props.resolvedLayout.frame
  const style: Record<string, string> = {}
  if (f.minHeight) style.minHeight = f.minHeight
  if (f.overflowX !== 'visible') style.overflowX = f.overflowX
  return style
})

// Footer cover-reveal: when the resolved layout pins the footer to the
// viewport bottom, the shell opts into the reveal. The pinned footer (z 0)
// must be occluded by the page content (z 1) until the content's bottom edge
// scrolls past — but the content box is transparent by default (the page
// background lives on the fixed LayoutBackgroundLayer behind everything). This
// attribute drives a scoped rule that paints an opaque background onto the
// flow content so it actually covers the pinned footer.
const footerRevealActive = computed(
  () => props.resolvedLayout.footer.position === 'sticky-bottom',
)
</script>

<template>
  <div
    data-layout-shell
    :data-scroll-mode="resolvedLayout.scroll.mode"
    :data-responsive-mode="responsiveMode"
    :data-footer-reveal-active="footerRevealActive || undefined"
    :style="shellStyle"
  >
    <LayoutBackgroundLayer :background="resolvedLayout.background" />
    <slot name="header" />

    <template v-if="isScale">
      <div class="layout-scale-viewport">
        <div class="layout-scale-spacer" :style="spacerStyle">
          <div
            ref="contentRef"
            class="layout-scale-content"
            :data-scale-origin="scaleOriginAttr"
            :style="contentStyle"
          >
            <LayoutChromeRenderer :chrome="resolvedLayout.chrome" mode="flow" />
            <LayoutScaleContent :design-width="resolvedLayout.frame.designWidth ?? 1440">
              <slot />
            </LayoutScaleContent>
          </div>
        </div>
      </div>
    </template>
    <div v-else data-layout-content :style="frameStyle">
      <LayoutChromeRenderer :chrome="resolvedLayout.chrome" mode="flow" />
      <slot />
    </div>

    <slot name="footer" />
    <LayoutChromeRenderer :chrome="resolvedLayout.chrome" />
  </div>
</template>

<style scoped>
[data-scroll-mode="snap-y"] {
  scroll-snap-type: y mandatory;
  height: 100vh;
  overflow-y: scroll;
}

/* Ensure header / content / footer always stack above background-layer chrome.
   A footer that opts into the cover-reveal (data-footer-reveal) is excluded
   here — it must sit BEHIND the content, not above it, so it gets its own rule
   below. */
[data-layout-shell] > :slotted(header),
[data-layout-shell] > [data-layout-content],
[data-layout-shell] > .layout-scale-viewport,
[data-layout-shell] > :slotted(footer:not([data-footer-reveal])) {
  position: relative;
  z-index: 1;
}

/* Cover-reveal footer: pinned to the viewport bottom, one stacking level BELOW
   the page content. As the content's bottom edge scrolls past, the footer is
   progressively uncovered — the readymag /diario parallax reveal, CSS-only. */
[data-layout-shell] > :slotted(footer[data-footer-reveal]) {
  position: sticky;
  bottom: 0;
  z-index: 0;
}

/* The reveal only works if the content occludes the pinned footer. The flow
   content box is transparent by default (page background lives on the fixed
   LayoutBackgroundLayer behind everything), so paint an opaque background onto
   it while a reveal footer is active. Scoped to breakpoint-mode flow content;
   scale mode does not opt into the reveal. */
[data-layout-shell][data-footer-reveal-active] > [data-layout-content] {
  background: var(--color-background, #fff);
}

/* Container query context for content blocks.
   - Breakpoint mode: container width ≈ viewport content area, so a block's
     `@container (max-width: $bp-md)` behaves like the legacy `@media` rule.
   - Scale mode: container width = designWidth (e.g. 1440px) regardless of
     real viewport, so content blocks stay desktop layout while the whole
     canvas scales — header/footer/chrome stay viewport-aware via @media.
   Block components inside page content should query the nearest unnamed
   container; chrome/header/footer must keep using @media. */
[data-layout-shell] > [data-layout-content],
.layout-scale-content {
  container-type: inline-size;
}

/* Scale-mode shell: viewport clips horizontal overflow from the wider design
   canvas; spacer reserves the visually-scaled height so document scroll
   length matches what the user sees; content is the actual transform target.

   overflow-x MUST be `clip`, not `hidden`: `hidden` on one axis promotes the
   other axis's `visible` to `auto` (CSS Overflow 3), creating an unintended
   vertical scroll container that can interfere with sticky and positioned
   descendants. */
.layout-scale-viewport {
  width: 100%;
  overflow-x: clip;
}

.layout-scale-spacer {
  position: relative;
  width: 100%;
}

/* Origin selected via data-scale-origin attribute — NOT inline-style string
   matching (fragile and breaks if browsers normalize the style serialization). */
.layout-scale-content {
  width: var(--layout-design-width, 1440px);
  /* Positioning context for the flow-mode chrome layer (absolute, inset:0),
     so the flow hairline spans the content box and scrolls with it. */
  position: relative;
}

.layout-scale-content[data-scale-origin="top-left"] {
  transform: scale(var(--layout-scale, 1));
  transform-origin: top left;
}

.layout-scale-content[data-scale-origin="top-center"] {
  margin-left: 50%;
  transform: translateX(-50%) scale(var(--layout-scale, 1));
  transform-origin: top center;
}
</style>
