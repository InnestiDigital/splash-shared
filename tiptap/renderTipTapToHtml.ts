import type { TipTapDocument, TipTapNode, TipTapMark } from './types'
import { sanitizeHref } from './urlPolicy'
import { STYLE_VALIDATORS } from './inlineStyleAllowlist'
import type { RichtextMode } from './richtextModes'

export interface RenderOptions {
  mode?: RichtextMode
}

export function renderTipTapToHtml(
  doc: TipTapDocument,
  validPresetKeys: Set<string>,
  options: RenderOptions = {},
): string {
  if (!doc.content || doc.content.length === 0) return ''
  const mode: RichtextMode = options.mode ?? 'block'
  return doc.content.map(node => renderNode(node, validPresetKeys, mode)).join(joinForMode(mode))
}

function joinForMode(mode: RichtextMode): string {
  // Between top-level paragraphs:
  //   block  → '' (each paragraph already wrapped in <p>...</p>)
  //   inline → '<br>' (no <p> wrap; separate paragraphs visually)
  //   single → '' (drop separation entirely; one continuous line)
  return mode === 'inline' ? '<br>' : ''
}

const MARK_ORDER: Record<string, number> = {
  link: 0,
  bold: 1,
  italic: 2,
  underline: 3,
  strike: 4,
  inlineTypographyPreset: 5,
}

function markSortKey(mark: TipTapMark): number {
  return MARK_ORDER[mark.type] ?? 3
}

const INLINE_OVERRIDE_MARK_TO_PROP: Record<string, { prop: string; attr: string }> = {
  textColor: { prop: 'color', attr: 'color' },
  fontWeight: { prop: 'font-weight', attr: 'weight' },
  fontSize: { prop: 'font-size', attr: 'size' },
}

const STYLE_PROP_ORDER = ['color', 'font-weight', 'font-size']

function renderNode(node: TipTapNode, validKeys: Set<string>, mode: RichtextMode): string {
  switch (node.type) {
    case 'text':
      return renderText(node, validKeys)
    case 'paragraph':
      return renderParagraph(node, validKeys, mode)
    case 'bulletList':
      return mode === 'block' ? `<ul>${renderChildren(node, validKeys, mode)}</ul>` : renderChildren(node, validKeys, mode)
    case 'orderedList':
      return mode === 'block' ? `<ol>${renderChildren(node, validKeys, mode)}</ol>` : renderChildren(node, validKeys, mode)
    case 'listItem':
      return mode === 'block' ? `<li>${renderChildren(node, validKeys, mode)}</li>` : renderChildren(node, validKeys, mode)
    case 'hardBreak':
      // <br> is allowed in inline + block, dropped in single.
      return mode === 'single' ? '' : '<br>'
    case 'heading':
      return renderHeading(node, validKeys, mode)
    case 'table':
      return mode === 'block' ? `<table>${renderChildren(node, validKeys, mode)}</table>` : renderChildren(node, validKeys, mode)
    case 'tableRow':
      return mode === 'block' ? `<tr>${renderChildren(node, validKeys, mode)}</tr>` : renderChildren(node, validKeys, mode)
    case 'tableHeader':
      return mode === 'block' ? renderTableCell(node, validKeys, mode, 'th') : renderChildren(node, validKeys, mode)
    case 'tableCell':
      return mode === 'block' ? renderTableCell(node, validKeys, mode, 'td') : renderChildren(node, validKeys, mode)
    default:
      console.warn(`[renderTipTapToHtml] Unknown node type: "${node.type}" — dropping wrapper, rendering children`)
      return renderChildren(node, validKeys, mode)
  }
}

/**
 * Heading node → h2..h6.
 *
 * TipTap stores the author's choice as `attrs.level` (1-6). Level 1 is clamped
 * to 2: the page template owns the document's single h1, so a body h1 would
 * give the page two top-level headings. An out-of-range or missing level falls
 * back to 2 rather than emitting `<hundefined>`.
 *
 * Inline and single modes have no block structure to carry a heading, so they
 * render the text only — consistent with how paragraphs and lists degrade
 * there. The emitted tags mirror `sanitizeHtmlString`'s block allowlist; the
 * two lists must stay in step or the renderer emits what the sanitizer then
 * strips.
 */
function renderHeading(node: TipTapNode, validKeys: Set<string>, mode: RichtextMode): string {
  const inner = renderChildren(node, validKeys, mode)
  if (mode !== 'block') return inner
  const rawLevel = Number((node.attrs as { level?: unknown } | undefined)?.level)
  const level = Number.isFinite(rawLevel) ? Math.min(6, Math.max(2, Math.trunc(rawLevel))) : 2
  return `<h${level}>${inner}</h${level}>`
}

function renderParagraph(node: TipTapNode, validKeys: Set<string>, mode: RichtextMode): string {
  const inner = renderChildren(node, validKeys, mode)
  if (mode !== 'block') return inner   // single + inline drop the <p> wrapper
  const presetKey = node.attrs?.presetKey
  if (presetKey && validKeys.has(presetKey)) {
    return `<p class="rt-preset-${escapeAttr(presetKey)}">${inner}</p>`
  }
  return `<p>${inner}</p>`
}

/**
 * Table cells carry the TipTap table extension's `colspan`/`rowspan` attrs.
 * Emit them only as plain positive integers > 1 — the sanitizer downstream
 * enforces the same shape, so anything else is dropped here for parity.
 */
function renderTableCell(node: TipTapNode, validKeys: Set<string>, mode: RichtextMode, tag: 'th' | 'td'): string {
  const attrs: string[] = []
  for (const name of ['colspan', 'rowspan'] as const) {
    const raw = node.attrs?.[name]
    if (typeof raw === 'number' && Number.isInteger(raw) && raw > 1 && raw < 1000) {
      attrs.push(`${name}="${raw}"`)
    }
  }
  const suffix = attrs.length > 0 ? ` ${attrs.join(' ')}` : ''
  return `<${tag}${suffix}>${renderChildren(node, validKeys, mode)}</${tag}>`
}

function renderChildren(node: TipTapNode, validKeys: Set<string>, mode: RichtextMode): string {
  if (!node.content) return ''
  return node.content.map(child => renderNode(child, validKeys, mode)).join('')
}

function renderText(node: TipTapNode, validKeys: Set<string>): string {
  const text = escapeHtml(node.text ?? '')
  if (!node.marks || node.marks.length === 0) return text

  // Split marks into structural (bold/italic/u/link/strike/inline-preset)
  // and inline overrides (textColor/fontWeight/fontSize). Override marks
  // collapse into a single inner <span style="..."> so we don't emit a
  // nested span per mark.
  //
  // Defense-in-depth: every override value is re-validated through
  // STYLE_VALIDATORS at emission time. The sanitizer is the final HTML
  // boundary, but the renderer should never emit an unsafe style value
  // even if the JSON is hand-edited or corrupted upstream.
  const structural: TipTapMark[] = []
  const styleProps: Record<string, string> = {}
  for (const mark of node.marks) {
    const meta = INLINE_OVERRIDE_MARK_TO_PROP[mark.type]
    if (meta) {
      const raw = mark.attrs?.[meta.attr]
      if (typeof raw !== 'string' || raw.length === 0) continue
      const validator = STYLE_VALIDATORS[meta.prop]
      const validated = validator(raw)
      if (validated === null) continue
      styleProps[meta.prop] = validated
    } else {
      structural.push(mark)
    }
  }

  // Filter unrenderable structural marks (invalid inline-preset key).
  const validStructural = structural.filter((mark) => {
    if (mark.type === 'inlineTypographyPreset') {
      const key = mark.attrs?.presetKey
      return key && validKeys.has(key)
    }
    return true
  })

  // Coalesce override marks into a single span.
  let result = text
  if (Object.keys(styleProps).length > 0) {
    const declarations = STYLE_PROP_ORDER
      .filter((p) => styleProps[p])
      .map((p) => `${p}: ${styleProps[p]}`)
      .join('; ')
    result = `<span style="${declarations}">${result}</span>`
  }

  // Wrap structural marks outside the override span, sorted by MARK_ORDER.
  const sorted = [...validStructural].sort((a, b) => markSortKey(a) - markSortKey(b))
  for (let i = sorted.length - 1; i >= 0; i--) {
    result = wrapWithMark(sorted[i], result)
  }
  return result
}

function wrapWithMark(mark: TipTapMark, inner: string): string {
  switch (mark.type) {
    case 'bold':
      return `<strong>${inner}</strong>`
    case 'italic':
      return `<em>${inner}</em>`
    case 'underline':
      return `<u>${inner}</u>`
    case 'link': {
      const href = sanitizeHref(mark.attrs?.href ?? '')
      if (!href) return inner
      return `<a href="${escapeAttr(href)}">${inner}</a>`
    }
    case 'strike':
      return `<s>${inner}</s>`
    case 'inlineTypographyPreset': {
      const key = mark.attrs?.presetKey
      return `<span class="rt-preset-${escapeAttr(key)}">${inner}</span>`
    }
    default:
      return inner
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeAttr(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// sanitizeHref is imported from ./urlPolicy (shared with Link extension + promptLink)
