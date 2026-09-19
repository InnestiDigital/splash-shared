import { Mark, mergeAttributes } from '@tiptap/core'

/**
 * Inline override mark that wraps selected text in a <span style="color: ...">.
 * Stored on text nodes as `{ type: 'textColor', attrs: { color: '#rrggbb' } }`.
 * Rendered + parsed via the inline-style attribute (NO data-* sidecar) so
 * the same HTML round-trips identically through the sanitizer + ProseMirror
 * parseHTML. Coalescing of nested <span> tags happens in renderTipTapToHtml,
 * not here — TipTap's own renderHTML always emits one span per mark.
 */
export const TextColor = Mark.create({
  name: 'textColor',

  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (element) => {
          const style = element.getAttribute('style')
          if (!style) return null
          const match = /(?:^|;)\s*color\s*:\s*([^;]+)/i.exec(style)
          return match ? match[1].trim() : null
        },
        renderHTML: (attributes) => {
          if (!attributes.color) return {}
          return { style: `color: ${attributes.color}` }
        },
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'span',
        getAttrs: (node) => {
          if (typeof node === 'string') return false
          const style = (node as HTMLElement).getAttribute('style')
          if (!style || !/(?:^|;)\s*color\s*:/i.test(style)) return false
          return null // delegate attribute extraction to addAttributes.parseHTML
        },
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0]
  },
})
