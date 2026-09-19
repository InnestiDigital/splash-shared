import type {
  LogoPosition,
  HeaderLayoutState,
  CompactBackgroundConfig,
  ZoneConfig,
  ResolvedZoneStyle,
} from '~/shared/types/headerZone'

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t
}

export function computeZoneOrder(logoPosition: LogoPosition): Record<'logo' | 'nav' | 'actions', number> {
  switch (logoPosition) {
    case 'left':
      return { logo: 1, nav: 2, actions: 3 }
    case 'center':
      return { nav: 1, logo: 2, actions: 3 }
    case 'right':
      return { nav: 1, actions: 2, logo: 3 }
  }
}

export function interpolateLayout(
  expanded: HeaderLayoutState,
  compact: HeaderLayoutState,
  progress: number,
): HeaderLayoutState {
  return {
    gap: lerp(expanded.gap, compact.gap, progress),
    padding: lerp(expanded.padding, compact.padding, progress),
    justify: progress >= 1 ? compact.justify : expanded.justify,
    contentWidthMode: progress >= 1 ? compact.contentWidthMode : expanded.contentWidthMode,
  }
}

export function computeBackgroundStyle(
  config: CompactBackgroundConfig,
  progress: number,
  contentWidth: number,
): Record<string, string | number> {
  const style: Record<string, string | number> = {}

  switch (config.mode) {
    case 'pill': {
      const radius = lerp(0, config.borderRadius, progress)
      style.borderRadius = `${radius}px`
      style.opacity = 1
      if (progress > 0) {
        const targetPx = contentWidth + config.insetPadding * 2
        style.maxWidth = `${targetPx}px`
        style.margin = '0 auto'
        style.transformOrigin = 'center'
        style.transform = `scaleX(${lerp(1, targetPx / Math.max(contentWidth * 2, 1), progress)})`
      }
      break
    }
    case 'shrink-bar': {
      const radius = lerp(0, config.borderRadius, progress)
      style.borderRadius = `${radius}px`
      style.opacity = 1
      if (progress > 0) {
        const targetPercent = Math.min(100, ((contentWidth + config.insetPadding * 2) / contentWidth) * 50)
        style.maxWidth = `${lerp(100, targetPercent, progress)}%`
        style.margin = '0 auto'
      }
      break
    }
    case 'fade': {
      style.opacity = lerp(1, config.targetOpacity, progress)
      style.borderRadius = '0px'
      break
    }
  }

  return style
}

export function resolveZoneStyle(
  config: ZoneConfig,
  progress: number,
  visibleInSource: boolean,
  visibleInTarget: boolean,
): ResolvedZoneStyle {
  const from = config.expanded
  const to = config.compact

  const scale = lerp(from.scale, to.scale, progress)
  const offsetX = lerp(from.offsetX, to.offsetX, progress)
  const offsetY = lerp(from.offsetY, to.offsetY, progress)

  let opacity: number
  let pointerEvents: 'auto' | 'none'
  let visibility: 'visible' | 'hidden'

  if (!visibleInSource && !visibleInTarget) {
    opacity = 0
    pointerEvents = 'none'
    visibility = 'hidden'
  } else if (visibleInSource && !visibleInTarget) {
    opacity = lerp(from.opacity, 0, progress)
    pointerEvents = progress >= 1 ? 'none' : 'auto'
    visibility = progress >= 1 ? 'hidden' : 'visible'
  } else if (!visibleInSource && visibleInTarget) {
    opacity = lerp(0, to.opacity, progress)
    pointerEvents = progress > 0 ? 'auto' : 'none'
    visibility = 'visible'
  } else {
    opacity = lerp(from.opacity, to.opacity, progress)
    pointerEvents = 'auto'
    visibility = 'visible'
  }

  const transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`

  return { transform, opacity, pointerEvents, visibility }
}
