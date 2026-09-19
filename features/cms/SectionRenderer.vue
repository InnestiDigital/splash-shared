<script setup lang="ts">
import { computed, ref, provide, inject, onMounted, onUnmounted } from 'vue'
import { useRuntimeConfig } from '#imports'
import { useSectionReveal } from '~/shared/composables/useSectionReveal'
import { getSectionTypeSchema, getSectionTypeSchemaV2 } from '~/shared/features/cms/sectionSchemas'
import SchemaSectionLayout from '~/shared/features/cms/section-layouts/SchemaSectionLayout.vue'
import StackedSectionLayout from '~/shared/features/cms/section-layouts/StackedSectionLayout.vue'
import HeroSectionLayout from '~/shared/features/cms/section-layouts/HeroSectionLayout.vue'
import EditorialSplitSectionLayout from '~/shared/features/cms/section-layouts/EditorialSplitSectionLayout.vue'
import GallerySectionLayout from '~/shared/features/cms/section-layouts/GallerySectionLayout.vue'
import CanvasSectionLayout from '~/shared/features/cms/section-layouts/CanvasSectionLayout.vue'
import PlacementWrapper from '~/shared/features/cms/placement/PlacementWrapper.vue'
import { ENGINE_KEY } from '~/shared/features/cms/animation/constants'
import { PAGE_CONTEXT_KEY } from '~/shared/features/cms/page-context'
import {
  getDividerPath,
  getDividerHeight,
  normalizeDividerShape,
  normalizeDividerHeight,
} from '~/shared/features/cms/sectionDividers'
import type { BlocksByRole, SectionColorScheme } from '~/shared/types/sectionTypes'
import type { AnimationEngine } from '~/shared/types/animation'

interface SectionData {
  id: string
  name: string
  anchor: string | null
  isHidden: boolean
  // The shared alias, not a restatement: the editor offers 'transparent' and
  // this component styles it, so a narrower prop type only makes callers that
  // pass a whole section row (the brand canvas snapshot) fail to compile.
  colorScheme: SectionColorScheme
  sectionRole: 'hero' | 'content' | 'divider' | 'footer' | null
  // Theme vocabulary, not a renderer-owned union: a theme adds a section type
  // by adding `section-types/<type>.v2.json`, and this component must accept
  // the value rather than fail to compile against a list in `shared/`.
  sectionType: string
  containerMode: 'measure' | 'content' | 'wide' | 'full-bleed'
  position: number
  sectionSpaceY: 'none' | 'sm' | 'md' | 'lg' | 'xl'
  containerInsetX: 'none' | 'sm' | 'md' | 'lg' | 'xl'
  revealPreset: string | null
  revealOverrides: Record<string, any> | null
  defaultBlockEntrance: string | null
  layoutConfig: Record<string, any> | null
}

const props = defineProps<{
  section: SectionData
  blocksByRole: BlocksByRole
  themeName: string
}>()

const pageContext = inject(PAGE_CONTEXT_KEY, null)
const isCanvasPage = computed(() => pageContext?.value.pageType === 'brand-canvas')

// Provide section context so child blocks can consume it
provide('currentSection', computed(() => props.section))

// Resolve section type schema
const typeSchema = computed(() => {
  try {
    return getSectionTypeSchema(props.themeName, props.section.sectionType) ?? null
  } catch {
    return null
  }
})

const usesContainer = computed(() =>
  isCanvasPage.value ? false : (typeSchema.value?.usesContainer ?? true),
)

// Section schemas are theme-owned; the renderer currently exposes these four
// layout primitives as its explicit public contract.
const layoutComponents: Record<string, any> = {
  hero: HeroSectionLayout,
  stacked: StackedSectionLayout,
  'editorial-split': EditorialSplitSectionLayout,
  gallery: GallerySectionLayout,
}

// Schema-driven layout engine (L3) — the DEFAULT path. A section type that
// ships a `*.v2.json` carrying a `layout` block renders through the generic
// engine; one that does not falls back to a hand-written layout component, so
// a theme predating v2 schemas is untouched.
//
// The flag inverted in L3: `NUXT_PUBLIC_LAYOUT_ENGINE_DISABLED` is an EMERGENCY
// KILL SWITCH, not an opt-in. Setting it forces every section back onto the
// hand-written components — the escape hatch if the engine misrenders in
// production, and the reason those components are still here.
//
// Read defensively regardless: an absent schema, an unknown theme or a stubbed
// loader must degrade to the legacy component, never blank the section.
const layoutEngineDisabled = computed(() => useRuntimeConfig().public?.layoutEngineDisabled === true)

const layoutSchema = computed(() => {
  if (layoutEngineDisabled.value || isCanvasPage.value) return null
  try {
    const schema = getSectionTypeSchemaV2(props.themeName, props.section.sectionType)
    return schema?.layout ? schema : null
  } catch {
    return null
  }
})

const layoutComponent = computed(() => {
  if (isCanvasPage.value) return CanvasSectionLayout
  if (layoutSchema.value) return SchemaSectionLayout
  const comp = layoutComponents[props.section.sectionType]
  if (!comp) {
    // No v2 schema AND no legacy component: the type is unrenderable. Fail
    // loud — a theme-defined type that reaches here is a missing file, and
    // rendering nothing would hide that until someone loaded the page.
    throw new Error(
      `[SectionRenderer] Unknown sectionType "${props.section.sectionType}": theme `
      + `"${props.themeName}" ships neither a section-types/${props.section.sectionType}.v2.json `
      + 'layout schema nor a built-in layout component for it',
    )
  }
  return comp
})

// Render VISIBLE, warn loud: a non-stacked layout has no declared slot for
// role-less blocks. Three behaviours have been tried here. Throwing detonated
// inside this computed and blanked the ENTIRE section, correctly-roled blocks
// included. Replacing the blocks with a red diagnostic box surfaced the drift
// but still deleted the content from the page — an operator changing a section
// type (e.g. hero-block → collage-canvas) watched their block vanish and had
// only a console line to explain it, and the same wall stopped the assistant.
//
// So: render them, appended after the declared slots as a plain vertical stack,
// styled like any other block. Nothing an author wrote ever disappears; the
// warning stays on the console for whoever is debugging the layout, and the
// editor marks the block as unplaced in the section's block list.
const unroledBlocks = computed(() => {
  if (isCanvasPage.value || props.section.sectionType === 'stacked') return []
  // A schema-driven layout that declares a `_default` slot HAS an outlet for
  // role-less blocks, so they are not orphans — that is how `stacked` stops
  // being a branch here and becomes ordinary data (contract §3.3).
  if (layoutSchema.value?.layout.slots.some(slot => slot.role === '_default')) return []
  const orphans = props.blocksByRole._default ?? []
  if (orphans.length) {
    console.warn(
      `[SectionRenderer] Section "${props.section.name}" (${props.section.sectionType}) has ` +
      `${orphans.length} block(s) without a layoutRole this layout declares — they render in a `
      + 'fallback stack below the section layout. Assign each block a role compatible with the '
      + 'section type to place it.',
    )
  }
  return orphans
})

/**
 * A stable per-block key for the fallback stack. `_previewId` is the editor's
 * identity for a block that has no persisted id yet; outside preview only `id`
 * exists.
 */
function fallbackKey(entry: { block: { id?: string; _previewId?: string } }, index: number): string {
  return entry.block._previewId ?? entry.block.id ?? `unroled-${index}`
}

// Typed layout config
const typedConfig = computed(() => props.section.layoutConfig ?? {})

// Only the engine takes a schema. Bound conditionally rather than always: an
// unknown prop on a hand-written layout would land in its $attrs and be written
// onto its root element as a stringified attribute.
const layoutProps = computed(() => (layoutSchema.value ? { schema: layoutSchema.value } : {}))

// Section shape dividers — decorative SVG edges filled with the section's own
// `--section-bg` so its colour flows into the adjacent section. Opt-in via
// layoutConfig (authored through the section-type settings schema). Purely
// additive: when both edges resolve to `none` nothing renders.
const dividerTopPath = computed(() => getDividerPath(normalizeDividerShape(typedConfig.value.dividerTop)))
const dividerBottomPath = computed(() => getDividerPath(normalizeDividerShape(typedConfig.value.dividerBottom)))
const hasDivider = computed(() => dividerTopPath.value !== null || dividerBottomPath.value !== null)
const dividerFlip = computed(() => typedConfig.value.dividerFlip === true)
const dividerStyle = computed(() => {
  if (!hasDivider.value) return undefined
  const h = getDividerHeight(normalizeDividerHeight(typedConfig.value.dividerHeight))
  return { '--section-divider-h': `${h}px` } as Record<string, string>
})

// Custom color scheme inline styles
const customSchemeStyle = computed(() => {
  if (props.section.colorScheme !== 'custom') return undefined
  const cfg = props.section.layoutConfig ?? {}
  const style: Record<string, string> = {}
  if (cfg.customBgColor) style['--custom-section-bg'] = cfg.customBgColor
  if (cfg.customTextColor) style['--custom-section-text'] = cfg.customTextColor
  if (cfg.customAccentColor) style['--custom-section-accent'] = cfg.customAccentColor
  if (cfg.customBorderColor) style['--custom-section-border'] = cfg.customBorderColor
  if (cfg.customSurfaceColor) style['--custom-section-surface'] = cfg.customSurfaceColor
  if (cfg.customTextMuted) style['--custom-section-text-muted'] = cfg.customTextMuted
  if (cfg.customTextFaint) style['--custom-section-text-faint'] = cfg.customTextFaint
  return style
})

// Spacing — inline CSS custom properties driven by sectionSpaceY / containerInsetX.
// A section without its own value falls through to the layout frame
// (--layout-space-y / --layout-inset-x, set by LayoutShell), and only then to
// the historical literal. Section value wins by construction: it never reads
// the frame var at all.
const spacingStyle = computed(() => {
  const spaceY = props.section.sectionSpaceY
  const insetX = props.section.containerInsetX
  const insetFallback = props.section.containerMode === 'full-bleed'
    ? 'var(--container-inset-x-none)'
    : 'var(--layout-inset-x, var(--container-inset-x-md))'
  return {
    '--section-space-y': spaceY
      ? `var(--section-space-y-${spaceY})`
      : 'var(--layout-space-y, var(--section-space-y-md))',
    '--container-inset-x': insetX ? `var(--container-inset-x-${insetX})` : insetFallback,
  } as Record<string, string>
})

// Typography scale inline style
const typographyScaleMap: Record<string, number> = { display: 1.3, compact: 0.8 }
const sectionStyle = computed(() => {
  const style: Record<string, string> = { ...customSchemeStyle.value, ...spacingStyle.value, ...dividerStyle.value }
  const scale = typedConfig.value.typographyScale as string | undefined
  if (scale && typographyScaleMap[scale]) {
    style['--section-heading-scale'] = String(typographyScaleMap[scale])
  }
  return Object.keys(style).length ? style : undefined
})

// Reveal animation (legacy data-reveal targets).
// Yields to the modern AnimationEngine when scenes are present for this page,
// or when this section opts in via defaultBlockEntrance, or when the editor
// set revealPreset to 'none'. Prevents double WAAPI animation on shared DOM
// elements (SPL-076).
const sectionEl = ref<HTMLElement | null>(null)
const engine = inject<AnimationEngine | null>(ENGINE_KEY, null)
const revealDisabled = computed(() => {
  if (props.section.revealPreset === 'none') return true
  if (props.section.defaultBlockEntrance) return true
  if (engine && engine.hasScenes) return true
  return false
})
useSectionReveal(sectionEl, {
  preset: props.section.revealPreset,
  overrides: props.section.revealOverrides,
  disabled: revealDisabled,
})

// Register section element + membership for animation engine targeting
const blockIds = computed(() => {
  const ids: string[] = []
  for (const blocks of Object.values(props.blocksByRole)) {
    for (const rb of blocks) {
      if (rb.block?.id) ids.push(rb.block.id)
    }
  }
  return ids
})

onMounted(() => {
  if (engine && sectionEl.value) {
    engine.registerEntityTargets('section', props.section.id, { root: sectionEl.value })
    engine.registerSection(props.section.id, blockIds.value)
  }
})

onUnmounted(() => {
  if (engine) {
    engine.unregisterTargets(`section:${props.section.id}`)
  }
})

</script>

<template>
  <section
    ref="sectionEl"
    :id="section.anchor || undefined"
    :data-section-id="section.id"
    :data-section-type="section.sectionType"
    :data-section-role="section.sectionRole || undefined"
    :class="[
      'section-renderer',
      `section-renderer--${section.colorScheme}`,
      `section-renderer--${section.containerMode}`,
      {
        'section-renderer--has-divider': hasDivider,
        'section-renderer--canvas': isCanvasPage,
      },
    ]"
    :style="sectionStyle"
    v-show="!section.isHidden"
  >
    <!-- Shape dividers: filled with the section's own background so the section
         colour flows into the adjacent section. Decorative only (aria-hidden,
         pointer-events:none). Top edge reuses the bottom path flipped vertically. -->
    <svg
      v-if="dividerTopPath"
      class="section-divider section-divider--top"
      :class="{ 'section-divider--flip': dividerFlip }"
      viewBox="0 0 1200 120"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <path :d="dividerTopPath" />
    </svg>
    <div v-if="usesContainer" class="section-renderer__container" :class="`section-renderer__container--${section.containerMode}`">
      <component
        :is="layoutComponent"
        :section="section"
        :layout-config="typedConfig"
        :blocks-by-role="blocksByRole"
        v-bind="layoutProps"
      >
        <slot />
      </component>
    </div>
    <component
      v-else
      :is="layoutComponent"
      :section="section"
      :layout-config="typedConfig"
      :blocks-by-role="blocksByRole"
      v-bind="layoutProps"
    >
      <slot />
    </component>
    <!-- Fallback outlet for blocks this layout declares no slot for (see
         `unroledBlocks`). They render normally, appended after the layout, so a
         section-type change never makes authored content disappear. Matches the
         section's own container width so the stack lines up with the layout
         above it. -->
    <div
      v-if="unroledBlocks.length"
      class="section-renderer__unroled-blocks"
      data-unroled-fallback="true"
      :class="usesContainer
        ? ['section-renderer__container', `section-renderer__container--${section.containerMode}`]
        : []"
    >
      <PlacementWrapper
        v-for="(entry, index) in unroledBlocks"
        :key="fallbackKey(entry, index)"
        :placement="entry.block.placement"
      >
        <component :is="entry.component" v-bind="entry.props" />
      </PlacementWrapper>
    </div>
    <svg
      v-if="dividerBottomPath"
      class="section-divider section-divider--bottom"
      :class="{ 'section-divider--flip': dividerFlip }"
      viewBox="0 0 1200 120"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <path :d="dividerBottomPath" />
    </svg>
  </section>
</template>

<style lang="scss" scoped>
.section-renderer {
  position: relative;

  // Color schemes via CSS custom properties.
  // Blocks pick a semantic role on two axes and resolve it THROUGH this layer:
  //   - background: section | surface | accent | inverse | transparent
  //   - textTone:   section | muted | faint | accent | inverse
  // Each resolves to the matching --section-* var below, which is why switching
  // a section's scheme re-colors every block inside it for free. See
  // `shared/composables/useBlockSurface.ts` and Phase F (color-roles).
  //
  // Every slot below reads `var(--role-<scheme>-<slot>, <what it used to be>)`.
  // The `--role-*` tier is emitted by useColorRoles() from the site's
  // color_roles bindings (Phase F / C1, docs/architecture/color-roles-phase-f.md).
  // With zero bindings nothing declares those vars, every declaration collapses
  // to its fallback, and the rendered CSS is what it was before the tier
  // existed. Role names are scheme-qualified because the same slot resolves to
  // a DIFFERENT palette entry per scheme (light's bg is --color-background,
  // dark's is --color-dark-bg); one shared --role-bg would collapse the two.
  //
  // `inverse-bg` / `inverse-text` are new: the opposite-polarity pair a block
  // reaches for when it wants a dark band inside a light page. They back the
  // `inverse` background/text roles blocks select in C2.
  //
  // NAMING TRAP: every `--section-accent` fallback below is `--color-primary`,
  // NOT the separate `accentColor` block setting — they share a word, not a
  // value. That's a deliberate carry-forward (this hardcode predates the role
  // tier), not a bug. A site that wants `accent` to mean its actual accent
  // color binds `*-accent` roles to `accentColor` via the color-roles admin
  // API; see "Known naming collision" in docs/architecture/color-roles-phase-f.md.
  &--light {
    --section-bg: var(--role-light-bg, var(--color-background, #fff));
    --section-text: var(--role-light-text, var(--color-text, #222222));
    --section-border: var(--role-light-border, var(--border-color, #e8e8e8));
    --section-accent: var(--role-light-accent, var(--color-primary, #1E3D4F));
    --section-surface: var(--role-light-surface, rgba(0,0,0,0.04));
    --section-text-muted: var(--role-light-text-muted, var(--color-text-muted, #666666));
    --section-text-faint: var(--role-light-text-faint, var(--color-text-faint, #999999));
    --section-inverse-bg: var(--role-light-inverse-bg, var(--color-dark-bg, #1a1a1a));
    --section-inverse-text: var(--role-light-inverse-text, var(--color-dark-text, #ffffff));
  }
  &--dark {
    --section-bg: var(--role-dark-bg, var(--color-dark-bg, #1a1a1a));
    --section-text: var(--role-dark-text, var(--color-dark-text, #ffffff));
    --section-border: var(--role-dark-border, var(--color-dark-border, rgba(255,255,255,0.12)));
    --section-accent: var(--role-dark-accent, var(--color-primary, #1E3D4F));
    --section-surface: var(--role-dark-surface, rgba(255,255,255,0.06));
    --section-text-muted: var(--role-dark-text-muted, rgba(255,255,255,0.65));
    --section-text-faint: var(--role-dark-text-faint, rgba(255,255,255,0.45));
    --section-inverse-bg: var(--role-dark-inverse-bg, var(--color-background, #fff));
    --section-inverse-text: var(--role-dark-inverse-text, var(--color-text, #222222));
  }
  &--accent {
    --section-bg: var(--role-accent-bg, var(--color-primary, #1E3D4F));
    --section-text: var(--role-accent-text, #fff);
    --section-border: var(--role-accent-border, rgba(255,255,255,0.15));
    --section-accent: var(--role-accent-accent, #fff);
    --section-surface: var(--role-accent-surface, rgba(255,255,255,0.1));
    --section-text-muted: var(--role-accent-text-muted, rgba(255,255,255,0.7));
    --section-text-faint: var(--role-accent-text-faint, rgba(255,255,255,0.5));
    --section-inverse-bg: var(--role-accent-inverse-bg, var(--color-background, #fff));
    --section-inverse-text: var(--role-accent-inverse-text, var(--color-text, #222222));
  }
  // The custom scheme's per-section pickers stay the outermost fallback tier:
  // an author who set an explicit color on THIS section outranks a site-wide
  // role binding, which in turn outranks the palette default.
  &--custom {
    --section-bg: var(--custom-section-bg, var(--role-custom-bg, var(--color-background, #fff)));
    --section-text: var(--custom-section-text, var(--role-custom-text, var(--color-text, #222)));
    --section-border: var(--custom-section-border, var(--role-custom-border, rgba(0,0,0,0.12)));
    --section-accent: var(--custom-section-accent, var(--role-custom-accent, var(--color-primary, #1E3D4F)));
    --section-surface: var(--custom-section-surface, var(--role-custom-surface, rgba(0,0,0,0.04)));
    --section-text-muted: var(--custom-section-text-muted, var(--role-custom-text-muted, var(--color-text-muted, #666666)));
    --section-text-faint: var(--custom-section-text-faint, var(--role-custom-text-faint, var(--color-text-faint, #999999)));
    --section-inverse-bg: var(--role-custom-inverse-bg, var(--color-dark-bg, #1a1a1a));
    --section-inverse-text: var(--role-custom-inverse-text, var(--color-dark-text, #ffffff));
  }
  // Transparent — section paints no background; whatever sits behind it
  // (page background or layer chrome) shows through. Text/accent inherit
  // from light defaults so legibility holds without an explicit colorScheme.
  &--transparent {
    --section-bg: var(--role-transparent-bg, transparent);
    --section-text: var(--role-transparent-text, var(--color-text, #222));
    --section-border: var(--role-transparent-border, rgba(0,0,0,0.12));
    --section-accent: var(--role-transparent-accent, var(--color-primary, #1E3D4F));
    --section-surface: var(--role-transparent-surface, rgba(0,0,0,0.04));
    --section-text-muted: var(--role-transparent-text-muted, var(--color-text-muted, #666));
    --section-text-faint: var(--role-transparent-text-faint, var(--color-text-faint, #999));
    --section-inverse-bg: var(--role-transparent-inverse-bg, var(--color-dark-bg, #1a1a1a));
    --section-inverse-text: var(--role-transparent-inverse-text, var(--color-dark-text, #ffffff));
  }

  background-color: var(--section-bg);
  color: var(--section-text);

  // Spacing — driven by CSS custom properties set inline via spacingStyle computed
  padding-top: var(--section-space-y);
  padding-bottom: var(--section-space-y);

  // Mobile spacing cap — the lg/xl vertical-space tiers (9.6rem/12.8rem from
  // theme spacingTokens) stack 128px+128px paddings and 192px+ voids between
  // adjacent sections at phone widths. Cap both to the md tier (6.4rem) via
  // min() so none/sm/md pass through unchanged. Keyed on the layout container
  // (LayoutShell sets container-type:inline-size on [data-layout-content]),
  // NOT @media, so it fires in admin FULL-preview too and correctly does NOT
  // fire in scale mode (container = 1440px design canvas).
  @container (max-width: 768px) {
    & {
      padding-top: min(var(--section-space-y), 6.4rem);
      padding-bottom: min(var(--section-space-y), 6.4rem);
    }
  }

  // Container modes — width only, horizontal inset via --container-inset-x
  &__container {
    width: 100%;
    min-width: 0;
    padding: 0 var(--container-inset-x);
    // Layout-frame default (LayoutShell → --layout-max-width). Every explicit
    // container mode below is a later rule of equal specificity, so a section
    // that declares its own mode still wins.
    max-width: var(--layout-max-width, none);
    margin: 0 auto;

    // Mobile cap for the horizontal axis, mirroring the vertical one above —
    // the md inset tier (4.8rem) costs 96px (27%) of a 360px phone before any
    // block padding stacks on top. Capped at the point of use, not by
    // redefining --container-inset-x: the var is set inline by spacingStyle
    // (inline beats any stylesheet rule) and a self-referential min() would
    // be invalid anyway. The md desktop token itself is intentional.
    @container (max-width: 768px) {
      padding: 0 min(var(--container-inset-x), 2rem);
    }

    &--measure { max-width: var(--container-max-width, 1200px); margin: 0 auto; }
    &--content { max-width: min(720px, var(--container-max-width, 1200px)); margin: 0 auto; }
    &--wide { max-width: max(var(--container-max-width, 1200px), 1400px); margin: 0 auto; }
    &--full-bleed { max-width: none; }
  }

  // Fallback stack for blocks the layout declares no slot for. Deliberately
  // undecorated — the point is that the block looks like itself, in an obvious
  // position (last), not that it looks like an error. The editor is where the
  // unplaced state is named.
  &__unroled-blocks {
    display: flex;
    flex-direction: column;
    gap: var(--section-space-y-sm, 1.6rem);
    min-width: 0;
  }

  // Shape dividers overflow into the adjacent (sibling) section. Sibling sections
  // are also position:relative, so without a raised stacking order the *next*
  // section — painted later in DOM order — would cover an overflowing bottom
  // divider. Lift any section carrying a divider above its un-lifted neighbours.
  &--has-divider {
    z-index: 1;
  }

  // The decorative edge itself: a full-width SVG that bleeds out of the section
  // box (top edge upward, bottom edge downward), filled with the section's own
  // background so the colour appears to flow into the neighbour. Non-interactive.
  .section-divider {
    position: absolute;
    left: 0;
    width: 100%;
    height: var(--section-divider-h, 80px);
    display: block;
    pointer-events: none;
    line-height: 0;

    path {
      fill: var(--section-bg);
    }

    &--bottom {
      bottom: 0;
      transform: translateY(100%);

      &.section-divider--flip { transform: translateY(100%) scaleX(-1); }
    }

    // Top edge reuses the bottom-oriented path flipped vertically so the filled
    // mass abuts the section's top and the contour points up into the neighbour.
    &--top {
      top: 0;
      transform: translateY(-100%) scaleY(-1);

      &.section-divider--flip { transform: translateY(-100%) scaleY(-1) scaleX(-1); }
    }
  }

}

.section-renderer--canvas {
  box-sizing: border-box;
  width: 100%;
  // In scale-layout mode this section lives inside the transform target.
  // Compensate its unscaled height so the transformed layer host still fills
  // the authoritative canvas viewport instead of leaving a bottom gutter.
  height: calc(100vh / var(--layout-scale, 1));
  min-height: calc(100vh / var(--layout-scale, 1));
  padding: 0;
  overflow: hidden;
}
</style>
