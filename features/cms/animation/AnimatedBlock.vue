<script lang="ts">
import { defineComponent, inject, provide, computed, onMounted, onUnmounted, ref, h, type PropType } from 'vue'
import type { MotionHints } from '~/shared/types/animation'
import { ENGINE_KEY, ANIMATION_TARGETS_CHANGED, NESTED_MOTION_HINTS_KEY } from './constants'
import { LAYOUT_INTERACTION_BLOCK_ID } from '~/shared/features/layout-interaction/injection-keys'

// Cache resolved selectors per block type (static across instances of same type)
// Exported for testing; production code accesses it only through AnimatedBlock internals.
export const selectorCache = new Map<string, Record<string, string | undefined>>()

// Debounce helper: delays invocation by `ms` milliseconds, coalescing rapid calls.
function debounce(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  return () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      fn()
    }, ms)
  }
}

export default defineComponent({
  name: 'AnimatedBlock',
  props: {
    blockId: { type: String, required: true },
    blockType: { type: String, required: true },
    targetsSchema: {
      type: Object as PropType<Record<string, { selector?: string; multiple?: boolean }>>,
      default: () => ({}),
    },
    motionHints: {
      type: Object as PropType<MotionHints>,
      default: undefined,
    },
  },
  setup(props, { slots }) {
    const engine = inject(ENGINE_KEY, null)
    const wrapperRef = ref<HTMLElement | null>(null)

    // Provide per-block id under a stable key so blocks that adopt the
    // layout-interaction substrate (e.g. ScatterCollage) can consume identity
    // via inject without threading a prop through every intermediate wrapper.
    // Non-consuming blocks ignore the provide.
    provide(LAYOUT_INTERACTION_BLOCK_ID, computed(() => props.blockId))

    // Inject parent container hints (e.g. from HorizontalScroll).
    // Falls back to null when AnimatedBlock is not inside a providing container.
    const parentHints = inject(NESTED_MOTION_HINTS_KEY, null)

    // Merge parent hints (higher priority) with block-level motionHints prop.
    // Parent hints override block hints for axis/root configuration
    // (intersectionRoot, disabledTriggerTypes).
    const mergedHints = computed<MotionHints | undefined>(() => {
      const own = props.motionHints
      const parent = parentHints?.value
      if (!own && !parent) return undefined
      return {
        ...(own ?? {}),
        ...(parent ?? {}),
      }
    })

    function getSelectors(): Record<string, string | undefined> {
      const cached = selectorCache.get(props.blockType)
      if (cached) return cached

      const selectors: Record<string, string | undefined> = {}
      for (const [name, decl] of Object.entries(props.targetsSchema)) {
        selectors[name] = decl.selector
      }
      selectorCache.set(props.blockType, selectors)
      return selectors
    }

    function resolveTargets(root: HTMLElement): Record<string, HTMLElement | HTMLElement[]> {
      const parts: Record<string, HTMLElement | HTMLElement[]> = {}
      const selectors = getSelectors()

      // root target is always the root element itself
      parts['root'] = root

      for (const [name, selector] of Object.entries(selectors)) {
        if (name === 'root' || !selector) continue

        // Query all candidates, then pick elements that are NOT inside
        // a nested AnimatedBlock boundary (prevents selector leaking into
        // slot-rendered child blocks).
        const candidates = root.querySelectorAll<HTMLElement>(selector)
        const schema = props.targetsSchema[name]
        if (schema?.multiple) {
          const accepted: HTMLElement[] = []
          for (const el of candidates) {
            // Skip elements opted out of motion (e.g. interactive-positioned items).
            if (el.getAttribute('data-motion-suppressed') === 'true') continue
            const nearestAnimatedBlock = el.closest('[data-animated-block]')
            if (!nearestAnimatedBlock || nearestAnimatedBlock === wrapperRef.value)
              accepted.push(el)
          }
          if (accepted.length) parts[name] = accepted
        } else {
          for (const el of candidates) {
            // Skip elements opted out of motion (e.g. interactive-positioned items).
            if (el.getAttribute('data-motion-suppressed') === 'true') continue
            const nearestAnimatedBlock = el.closest('[data-animated-block]')
            // Accept if: no AnimatedBlock ancestor found, OR the nearest one
            // is this block's own wrapper (wrapperRef.value).
            if (!nearestAnimatedBlock || nearestAnimatedBlock === wrapperRef.value) {
              parts[name] = el
              break
            }
          }
        }
      }

      return parts
    }

    function applyMotionHintStyles(parts: Record<string, HTMLElement | HTMLElement[]>): void {
      const hints = props.motionHints
      if (!hints) return

      if (hints.prefersLayerPromotion) {
        for (const partName of hints.prefersLayerPromotion) {
          const target = parts[partName]
          if (!target) continue
          const elements = Array.isArray(target) ? target : [target]
          for (const el of elements) {
            el.style.willChange = 'transform'
          }
        }
      }

      if (hints.isolateTransforms) {
        for (const partName of hints.isolateTransforms) {
          const target = parts[partName]
          if (!target) continue
          const elements = Array.isArray(target) ? target : [target]
          for (const el of elements) {
            el.style.contain = 'layout'
          }
        }
      }
    }

    /** Re-query DOM targets and refresh the engine registration for this block. */
    function reQueryTargets(): void {
      if (!engine || !wrapperRef.value) return
      const root = wrapperRef.value.children[0] as HTMLElement | undefined
      if (!root) return
      const parts = resolveTargets(root)
      applyMotionHintStyles(parts)
      engine.registerBlockTargets(props.blockId, parts, mergedHints.value)
      engine.refreshTargets(props.blockId)
    }

    const debouncedReQuery = debounce(reQueryTargets, 100)

    function handleTargetsChanged(event: Event): void {
      const detail = (event as CustomEvent).detail as { blockId?: string } | undefined
      // Only respond if the event's blockId matches this block (or is absent)
      if (detail?.blockId && detail.blockId !== props.blockId) return
      // Invalidate selector cache for this block type so targets are re-resolved from DOM
      selectorCache.delete(props.blockType)
      debouncedReQuery()
    }

    onMounted(() => {
      if (!engine || !wrapperRef.value) return

      // Listen for targets-changed events bubbling from dynamic children
      wrapperRef.value.addEventListener(ANIMATION_TARGETS_CHANGED, handleTargetsChanged)

      // Use queueMicrotask to batch multiple registrations happening in same tick
      queueMicrotask(() => {
        if (!wrapperRef.value) return

        // With display:contents, children are promoted to parent layout.
        // Find the first element child as the logical root for queries.
        const root = wrapperRef.value.children[0] as HTMLElement | undefined
        if (!root) return

        const parts = resolveTargets(root)
        applyMotionHintStyles(parts)
        engine.registerBlockTargets(props.blockId, parts, mergedHints.value)
      })
    })

    onUnmounted(() => {
      if (engine) {
        engine.unregisterTargets(props.blockId)
      }
      if (wrapperRef.value) {
        wrapperRef.value.removeEventListener(ANIMATION_TARGETS_CHANGED, handleTargetsChanged)
      }
    })

    return () => {
      const content = slots.default?.()
      return h(
        'div',
        {
          ref: wrapperRef,
          style: 'display:contents',
          'data-animated-block': props.blockId,
        },
        content,
      )
    }
  },
})
</script>
