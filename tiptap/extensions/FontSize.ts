import { Mark, mergeAttributes } from '@tiptap/core'

export const FontSize = Mark.create({
  name: 'fontSize',

  addAttributes() {
    return {
      size: {
        default: null,
        parseHTML: (element) => {
          const style = element.getAttribute('style')
          if (!style) return null
          const match = /(?:^|;)\s*font-size\s*:\s*([^;]+)/i.exec(style)
          return match ? match[1].trim() : null
        },
        renderHTML: (attributes) => {
          if (!attributes.size) return {}
          return { style: `font-size: ${attributes.size}` }
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
          if (!style || !/(?:^|;)\s*font-size\s*:/i.test(style)) return false
          return null
        },
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0]
  },
})
