import type {
  LayoutFrameConfig,
  LayoutHeaderConfig,
  LayoutFooterConfig,
  LayoutBackgroundConfig,
  LayoutChromeConfig,
  LayoutScrollConfig,
  LayoutOverridePolicy,
  LayoutSpacingTier,
  ThemeLayout,
  ResolvedLayoutConfig,
} from '~/shared/types/layout'

/**
 * Vertical rhythm a layout falls back to. Mirrors the `sections.section_space_y`
 * column default so an unset frame renders exactly like today.
 */
export const DEFAULT_SECTION_SPACING: LayoutSpacingTier = 'md'

export const DEFAULT_FRAME: LayoutFrameConfig = {
  // Mirrors the `sections.container_mode` column default: the frame is the
  // page-level default behind a section's own container mode.
  containerMode: 'measure',
  insetX: 'md',
  sectionSpacingDefault: DEFAULT_SECTION_SPACING,
  overflowX: 'visible',
  responsiveMode: 'breakpoint',
  designWidth: 1440,
  minScale: 0.25,
  maxScale: 1,
  scaleOrigin: 'top-center',
}

export const DEFAULT_HEADER: LayoutHeaderConfig = {
  enabled: true,
  palette: {},
}

export const DEFAULT_FOOTER: LayoutFooterConfig = {
  enabled: true,
  position: 'normal',
}

export const DEFAULT_BACKGROUND: LayoutBackgroundConfig = {}

export const DEFAULT_CHROME: LayoutChromeConfig = { elements: [] }

export const DEFAULT_SCROLL: LayoutScrollConfig = { mode: 'normal' }

export const DEFAULT_OVERRIDE_POLICY: LayoutOverridePolicy = {
  allowPageHeaderOverride: true,
  allowPageFooterOverride: true,
  allowPageBackgroundOverride: true,
  allowPageChromeOverride: true,
  allowPageChromeAdditions: false,
  allowPageScrollOverride: true,
}

export function applyLayoutDefaults(layout: ThemeLayout): ResolvedLayoutConfig {
  return {
    id: layout.id,
    label: layout.label,
    allowedBlocks: layout.allowedBlocks ?? [],
    frame: { ...DEFAULT_FRAME, ...(layout.frame ?? {}) },
    header: {
      ...DEFAULT_HEADER,
      ...(layout.header ?? {}),
      palette: { ...DEFAULT_HEADER.palette, ...(layout.header?.palette ?? {}) },
    },
    footer: { ...DEFAULT_FOOTER, ...(layout.footer ?? {}) },
    background: { ...DEFAULT_BACKGROUND, ...(layout.background ?? {}) },
    chrome: { elements: layout.chrome?.elements ?? [] },
    scroll: { ...DEFAULT_SCROLL, ...(layout.scroll ?? {}) },
    overridePolicy: { ...DEFAULT_OVERRIDE_POLICY, ...(layout.overridePolicy ?? {}) },
  }
}
