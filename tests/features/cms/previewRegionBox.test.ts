// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import {
  PREVIEW_REGION_BOXLESS_CLASS,
  PREVIEW_REGION_CLASS,
  resolveRegionBox,
} from '~/shared/features/cms/previewInteraction'

/**
 * `resolveRegionBox` exists because block selection chrome lands on
 * `AnimatedBlock`'s `display: contents` wrapper, which generates no border box:
 * measuring or scrolling it yields the document origin instead of the block.
 * These cases pin the resolution, not the styling.
 */
function el(html: string): Element {
  const host = document.createElement('div')
  host.innerHTML = html
  const first = host.firstElementChild
  if (!first) throw new Error('test fixture produced no element')
  return first
}

describe('resolveRegionBox', () => {
  it('returns a section region unchanged — it already has a box', () => {
    const region = el(`<section class="${PREVIEW_REGION_CLASS}"><p>copy</p></section>`)

    expect(resolveRegionBox(region)).toBe(region)
  })

  it('descends past a boxless region to the block root that has a box', () => {
    const region = el(
      `<div class="${PREVIEW_REGION_CLASS} ${PREVIEW_REGION_BOXLESS_CLASS}">`
      + '<section class="editorial-text"><p>copy</p></section>'
      + '</div>',
    )

    const resolved = resolveRegionBox(region)

    expect(resolved.tagName).toBe('SECTION')
    expect(resolved.classList.contains('editorial-text')).toBe(true)
  })

  it('descends through a chain of boxless wrappers', () => {
    const region = el(
      `<div class="${PREVIEW_REGION_BOXLESS_CLASS}">`
      + `<div class="${PREVIEW_REGION_BOXLESS_CLASS}">`
      + '<article id="real">content</article>'
      + '</div></div>',
    )

    expect(resolveRegionBox(region).id).toBe('real')
  })

  it('returns the region itself when a boxless region has no element child', () => {
    // Degenerate, but handing the caller back a usable element beats returning
    // null and silently skipping the scroll.
    const region = el(`<div class="${PREVIEW_REGION_BOXLESS_CLASS}">bare text</div>`)

    expect(resolveRegionBox(region)).toBe(region)
  })

  it('stops descending at the depth bound instead of looping forever', () => {
    // Every level is marked boxless, so only the bound ends the walk.
    const depth = 20
    let html = '<span id="deepest">x</span>'
    for (let i = 0; i < depth; i += 1) {
      html = `<div class="${PREVIEW_REGION_BOXLESS_CLASS}">${html}</div>`
    }

    const resolved = resolveRegionBox(el(html))

    // Bound is 8, so it cannot have reached the innermost span.
    expect(resolved.id).not.toBe('deepest')
    expect(resolved.classList.contains(PREVIEW_REGION_BOXLESS_CLASS)).toBe(true)
  })

  it('ignores a class that merely contains the boxless name as a substring', () => {
    const region = el('<div class="preview-region--boxless-ish"><span>x</span></div>')

    expect(resolveRegionBox(region)).toBe(region)
  })
})
