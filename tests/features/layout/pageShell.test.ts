// @vitest-environment happy-dom
/**
 * The shell contract every surface that renders theme chrome goes through.
 *
 * It exists because three surfaces used to carry their own copy of it — the
 * published route, the page preview and (not at all) the article preview — and
 * a copy that drifts is a preview showing chrome the visitor never sees.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed, defineComponent, h, inject, ref, type MaybeRefOrGetter, type Ref } from 'vue'
import {
  KNOWN_NUXT_LAYOUTS,
  resolveNuxtLayoutName,
  usePageShell,
} from '~/shared/features/layout/pageShell'

describe('resolveNuxtLayoutName', () => {
  it('uses the theme shell that exists for the layout id', () => {
    expect(resolveNuxtLayoutName('standalone', 'blank')).toBe('standalone-blank')
  })

  it('falls back to the theme default shell for a theme-only layout id', () => {
    // 'editorial' / 'scale-canvas' are resolved INSIDE the shell from
    // theme.json — they must not require a parallel Nuxt layout file.
    expect(resolveNuxtLayoutName('standalone', 'editorial')).toBe('standalone-default')
    expect(resolveNuxtLayoutName('standalone', 'scale-canvas')).toBe('standalone-default')
  })

  it('treats an absent layout id as the default layout', () => {
    expect(resolveNuxtLayoutName('standalone', null)).toBe('standalone-default')
    expect(resolveNuxtLayoutName('standalone', '')).toBe('standalone-default')
  })

  it('falls back to the app layout while the theme is unknown', () => {
    expect(resolveNuxtLayoutName('', 'blank')).toBe('default')
    expect(resolveNuxtLayoutName(null, 'blank')).toBe('default')
  })

  it('only claims a themed shell that is actually registered', () => {
    for (const name of KNOWN_NUXT_LAYOUTS) {
      const [theme, ...rest] = name.split('-')
      expect(resolveNuxtLayoutName(theme, rest.join('-'))).toBe(name)
    }
  })
})

const Probe = defineComponent({
  setup() {
    const layoutId = inject<Ref<string>>('currentPageLayoutId')
    const meta = inject<Ref<Record<string, unknown>>>('currentPageMeta')
    return () => h('div', {
      'data-layout-id': layoutId?.value ?? '',
      'data-meta': JSON.stringify(meta?.value ?? null),
    })
  },
})

function mountHost(source: {
  theme: MaybeRefOrGetter<string | null>
  layoutId: MaybeRefOrGetter<string | null>
  meta: MaybeRefOrGetter<Record<string, unknown> | null>
}) {
  const Host = defineComponent({
    setup() {
      const name = usePageShell(source)
      return () => h('div', { 'data-name': name.value }, [h(Probe)])
    },
  })
  return mount(Host)
}

describe('usePageShell', () => {
  it('publishes the layout id and meta the shell resolves its ThemeLayout from', () => {
    const wrapper = mountHost({
      theme: ref('standalone'),
      layoutId: ref('editorial'),
      meta: ref({ layoutOverrides: { header: { variant: 'minimal' } } }),
    })

    const probe = wrapper.find('[data-layout-id]')
    expect(probe.attributes('data-layout-id')).toBe('editorial')
    expect(JSON.parse(probe.attributes('data-meta') ?? 'null')).toEqual({
      layoutOverrides: { header: { variant: 'minimal' } },
    })
  })

  it('publishes the default layout id rather than an empty one', () => {
    const wrapper = mountHost({ theme: ref('standalone'), layoutId: ref(null), meta: ref(null) })

    expect(wrapper.find('[data-layout-id]').attributes('data-layout-id')).toBe('default')
    expect(JSON.parse(wrapper.find('[data-layout-id]').attributes('data-meta') ?? 'null')).toEqual({})
  })

  it('answers with the hosting Nuxt layout', () => {
    const wrapper = mountHost({ theme: ref('standalone'), layoutId: ref('blank'), meta: ref(null) })

    expect(wrapper.attributes('data-name')).toBe('standalone-blank')
  })

  it('tracks a page switch without remounting the shell', async () => {
    const layoutId = ref<string | null>('default')
    const meta = ref<Record<string, unknown> | null>(null)
    const wrapper = mountHost({ theme: ref('standalone'), layoutId, meta })

    layoutId.value = 'blank'
    meta.value = { layoutOverrides: { footer: { enabled: false } } }
    await wrapper.vm.$nextTick()

    expect(wrapper.attributes('data-name')).toBe('standalone-blank')
    expect(wrapper.find('[data-layout-id]').attributes('data-layout-id')).toBe('blank')
    expect(JSON.parse(wrapper.find('[data-layout-id]').attributes('data-meta') ?? 'null')).toEqual({
      layoutOverrides: { footer: { enabled: false } },
    })
  })

  it('accepts getters as well as refs', () => {
    const wrapper = mountHost({
      theme: computed(() => 'standalone'),
      layoutId: computed(() => 'blank'),
      meta: computed(() => ({})),
    })

    expect(wrapper.attributes('data-name')).toBe('standalone-blank')
  })
})
