import { Mark, mergeAttributes } from '@tiptap/core'

export const FontWeight = Mark.create({
  name: 'fontWeight',

  addAttributes() {
    return {
      weight: {
        default: null,
        parseHTML: (element) => {
          const style = element.getAttribute('style')
          if (!style) return null
          const match = /(?:^|;)\s*font-weight\s*:\s*([^;]+)/i.exec(style)
          return match ? match[1].trim() : null
        },
        renderHTML: (attributes) => {
          if (!attributes.weight) return {}
          return { style: `font-weight: ${attributes.weight}` }
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
          if (!style || !/(?:^|;)\s*font-weight\s*:/i.test(style)) return false
          return null
        },
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0]
  },
})
