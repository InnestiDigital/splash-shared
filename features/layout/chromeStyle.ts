import type { BaseChromeElement, ChromeAnchor } from '~/shared/types/layout'

/**
 * Compute CSS positioning styles for a chrome element given an anchor + offsets.
 * - corner anchors (top-left, bottom-right, etc.) emit top/bottom + left/right
 * - center emits top/left 50% + a translate(-50%, -50%) + offset translate
 */
export function anchorStyles(
  anchor: ChromeAnchor,
  offsetX: string,
  offsetY: string,
): Record<string, string> {
  if (anchor === 'center') {
    return {
      top: '50%',
      left: '50%',
      transform: `translate(-50%, -50%) translate(${offsetX}, ${offsetY})`,
    }
  }
  const [vert, horz] = anchor.split('-') as ['top' | 'bottom', 'left' | 'right']
  const style: Record<string, string> = {}
  if (vert === 'top') style.top = offsetY
  else style.bottom = offsetY
  if (horz === 'left') style.left = offsetX
  else style.right = offsetX
  return style
}

/**
 * Compose a rotation onto an existing transform string (e.g. center anchor's translate).
 * Returns '' when no rotation is set and no existing transform supplied.
 */
export function rotationTransform(rotation: string | undefined, existing?: string): string {
  if (!rotation) return existing ?? ''
  return existing ? `${existing} rotate(${rotation})` : `rotate(${rotation})`
}

/**
 * Emit base CSS for any chrome element (position, z-index, pointer-events, opacity, blend mode).
 * Element-specific paint (color, dimensions, transform) is applied by the element component.
 */
export function baseChromeStyles(element: BaseChromeElement): Record<string, string> {
  const style: Record<string, string> = {
    position: element.position,
    zIndex: String(element.zIndex),
    pointerEvents: element.pointerEvents ?? 'none',
  }
  if (element.opacity != null) style.opacity = String(element.opacity)
  if (element.blendMode) style.mixBlendMode = element.blendMode
  return style
}

/**
 * Normalize the hideBelow attribute value (null/undefined collapse to undefined so Vue omits the attr).
 */
export function hideBelowAttr(value: 'sm' | 'md' | 'lg' | null | undefined): string | undefined {
  return value ?? undefined
}
