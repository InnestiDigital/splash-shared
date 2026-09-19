import Paragraph from '@tiptap/extension-paragraph'

export const TypographyParagraph = Paragraph.extend({
  addAttributes() {
    return {
      presetKey: {
        default: null,
        parseHTML: (element) => {
          const dataAttr = element.getAttribute('data-preset-key')
          if (dataAttr) return dataAttr
          const classes = element.className.split(/\s+/)
          for (const cls of classes) {
            if (cls.startsWith('rt-preset-')) {
              return cls.slice('rt-preset-'.length)
            }
          }
          return null
        },
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
})
