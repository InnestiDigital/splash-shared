import type {
  LayoutHeaderConfig,
  LayoutFooterConfig,
  LayoutBackgroundConfig,
  LayoutScrollConfig,
  LayoutChromeElement,
  LayoutHeaderOverride,
  LayoutFooterOverride,
  LayoutBackgroundOverride,
} from '~/shared/types/layout'

export function mergeHeader(
  base: LayoutHeaderConfig,
  patch: LayoutHeaderOverride,
): LayoutHeaderConfig {
  const { morphStyle, ...rest } = patch
  const merged: LayoutHeaderConfig = {
    ...base,
    ...rest,
    palette: { ...base.palette, ...(patch.palette ?? {}) },
  }
  // 'none' is the page-level "explicitly no choreography" sentinel; an absent
  // key inherits the layout value.
  if (morphStyle === 'none') delete merged.morphStyle
  else if (morphStyle !== undefined) merged.morphStyle = morphStyle
  return merged
}

export function mergeFooter(
  base: LayoutFooterConfig,
  patch: LayoutFooterOverride,
): LayoutFooterConfig {
  return {
    ...base,
    ...patch,
    palette: patch.palette ? { ...base.palette, ...patch.palette } : base.palette,
  }
}

export function mergeBackground(
  base: LayoutBackgroundConfig,
  patch: LayoutBackgroundOverride,
): LayoutBackgroundConfig {
  return {
    ...base,
    ...patch,
    image: patch.image
      ? base.image
        ? { ...base.image, ...patch.image }
        : (patch.image as LayoutBackgroundConfig['image'])
      : base.image,
    overlay: patch.overlay
      ? base.overlay
        ? { ...base.overlay, ...patch.overlay }
        : (patch.overlay as LayoutBackgroundConfig['overlay'])
      : base.overlay,
    texture: patch.texture
      ? base.texture
        ? { ...base.texture, ...patch.texture }
        : (patch.texture as LayoutBackgroundConfig['texture'])
      : base.texture,
  }
}

export function mergeScroll(
  base: LayoutScrollConfig,
  patch: Partial<LayoutScrollConfig>,
): LayoutScrollConfig {
  return { ...base, ...patch }
}

export function mergeChromeElement(
  base: LayoutChromeElement,
  patch: Partial<LayoutChromeElement>,
): LayoutChromeElement {
  // Type is the discriminator — never override it from a patch.
  const { type: _ignored, ...rest } = patch as { type?: string } & Record<string, unknown>
  return { ...base, ...rest } as LayoutChromeElement
}
