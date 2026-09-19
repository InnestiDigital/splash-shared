import type { Keyframe } from '~/shared/types/animation'

/**
 * Compose a CSS transform string from individual transform components.
 */
export function composeTransform(t: {
  x?: string
  y?: string
  scale?: number
  rotate?: string
}): string {
  const parts: string[] = []

  if (t.x !== undefined || t.y !== undefined) {
    parts.push(`translate(${t.x ?? '0'}, ${t.y ?? '0'})`)
  }
  if (t.scale !== undefined) {
    parts.push(`scale(${t.scale})`)
  }
  if (t.rotate !== undefined) {
    parts.push(`rotate(${t.rotate})`)
  }

  return parts.join(' ')
}

/**
 * Convert spec Keyframe[] to WAAPI-compatible globalThis.Keyframe[].
 * Maps: opacity, transform (composed), filter:blur, clipPath.
 */
export function toWAAPIKeyframes(keyframes: Keyframe[]): globalThis.Keyframe[] {
  return keyframes.map((kf) => {
    const frame: globalThis.Keyframe = {}

    if (kf.offset !== undefined) {
      frame.offset = kf.offset
    }
    if (kf.opacity !== undefined) {
      frame.opacity = kf.opacity
    }
    if (kf.transform) {
      frame.transform = composeTransform(kf.transform)
    }
    if (kf.blur !== undefined) {
      frame.filter = `blur(${kf.blur})`
    }
    if (kf.clipPath !== undefined) {
      frame.clipPath = kf.clipPath
    }
    if (kf.color !== undefined) {
      frame.color = kf.color
    }
    if (kf.backgroundColor !== undefined) {
      frame.backgroundColor = kf.backgroundColor
    }
    // Motion path fields: cast to any because native Keyframe TS type may not
    // include offset-* in older lib versions, but browsers accept them.
    if (kf.offsetPath !== undefined) {
      (frame as any).offsetPath = kf.offsetPath
    }
    if (kf.offsetDistance !== undefined) {
      (frame as any).offsetDistance = kf.offsetDistance
    }
    if (kf.offsetRotate !== undefined) {
      (frame as any).offsetRotate = kf.offsetRotate
    }
    if (kf.offsetAnchor !== undefined) {
      (frame as any).offsetAnchor = kf.offsetAnchor
    }
    // vars are intentionally NOT passed through — VarAnimator handles them

    return frame
  })
}
