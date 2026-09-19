import {
  getCurrentInstance,
  onBeforeUnmount,
  onMounted,
  ref,
  inject,
  type ComponentInternalInstance,
  type Ref,
} from 'vue'
import { BREAKPOINTS } from '~/shared/features/cms/composition/responsive'

/**
 * Symbol-keyed `provide/inject` slot for test overrides. Components call
 * `useViewport()` unchanged; tests `provide(VIEWPORT_OVERRIDE, ref(375))`
 * to mock the viewport width without exposing a public prop.
 */
export const VIEWPORT_OVERRIDE = Symbol('splash.viewportWidth')

/**
 * Reactive layout width for composition / collapse decisions.
 *
 * The width is the *container* width, not the window width: the composable
 * observes the nearest `container-type: inline-size` ancestor of the calling
 * component, so a TS collapse decision and a sibling `@container` rule
 * evaluate the same number by construction. Editor preview panes scale the
 * canvas without resizing the window, and a window-keyed decision drifted
 * from the CSS it was supposed to mirror.
 *
 * - No such ancestor (a block rendered outside `LayoutShell`) falls back to
 *   `window.innerWidth` plus a `resize` listener — which is what a root-level
 *   container query resolves against anyway.
 * - SSR default: `BREAKPOINTS.md` (768). Splash runs SSR-disabled today (per
 *   CLAUDE.md); on the client the sync `window.innerWidth` read below beats
 *   first paint, and the observer takes over on mount.
 * - Tests override via `provide(VIEWPORT_OVERRIDE, ref(<width>))`.
 */
export function useViewport(): { innerWidth: Ref<number> } {
  const override = inject<Ref<number> | null>(VIEWPORT_OVERRIDE, null)
  if (override) return { innerWidth: override }

  const innerWidth = ref(BREAKPOINTS.md)

  if (typeof window === 'undefined') {
    return { innerWidth }
  }

  const instance = getCurrentInstance()

  // Initialize synchronously so the very first render already classifies a
  // real width. Without it a desktop client flashes the mobile layout for one
  // frame before onMounted runs.
  innerWidth.value = window.innerWidth

  let stop: (() => void) | null = null

  const observeWindow = () => {
    const update = () => {
      innerWidth.value = window.innerWidth
    }
    update()
    window.addEventListener('resize', update, { passive: true })
    stop = () => window.removeEventListener('resize', update)
  }

  onMounted(() => {
    const container = findInlineSizeContainer(rootElement(instance))

    if (container === null || typeof ResizeObserver === 'undefined') {
      observeWindow()
      return
    }

    // `contentRect` is the content box, which is exactly what a
    // `container-type: inline-size` query resolves against.
    const observer = new ResizeObserver(entries => {
      const entry = entries[entries.length - 1]
      if (entry) innerWidth.value = entry.contentRect.width
    })
    observer.observe(container)
    stop = () => observer.disconnect()
  })

  onBeforeUnmount(() => {
    stop?.()
    stop = null
  })

  return { innerWidth }
}

/**
 * The component's root element. A fragment root resolves to a text/comment
 * node, whose parent is the element the container lookup should start from.
 */
function rootElement(instance: ComponentInternalInstance | null): Element | null {
  const el: unknown = instance?.proxy?.$el
  if (el instanceof Element) return el
  if (el instanceof Node) return el.parentElement
  return null
}

/**
 * Nearest ancestor (inclusive) that establishes an inline-size query
 * container. `container-type: size` qualifies too — it answers inline-size
 * queries as well.
 */
function findInlineSizeContainer(start: Element | null): Element | null {
  let el = start
  while (el !== null) {
    const type = window.getComputedStyle(el).getPropertyValue('container-type').trim()
    if (type === 'size' || type.includes('inline-size')) return el
    el = el.parentElement
  }
  return null
}
