import { Mark, mergeAttributes } from '@tiptap/core'

export const InlineTypographyPreset = Mark.create({
  name: 'inlineTypographyPreset',

  addAttributes() {
    return {
      presetKey: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-preset-key'),
        renderHTML: (attributes) => {
          if (!attributes.presetKey) return {}
          return {
            class: `rt-preset-${attributes.presetKey}`,
            'data-preset-key': attributes.presetKey,
          }
        },
      },
    }
  },

  excludes: 'inlineTypographyPreset',

  parseHTML() {
    return [{ tag: 'span[data-preset-key]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0]
  },
})
