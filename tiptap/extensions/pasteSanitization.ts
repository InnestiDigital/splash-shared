import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { Slice, Node as ProseMirrorNode, Fragment } from '@tiptap/pm/model'
import type { TipTapDocument, TipTapNode, TipTapMark } from '../types'

export function stripPresetMetadata(doc: TipTapDocument): TipTapDocument {
  return {
    type: 'doc',
    content: doc.content.map(stripNode),
  }
}

function stripNode(node: TipTapNode): TipTapNode {
  const result: TipTapNode = { type: node.type }

  if (node.attrs) {
    const attrs = { ...node.attrs }
    if ('presetKey' in attrs) {
      attrs.presetKey = null
    }
    result.attrs = attrs
  }

  if (node.marks) {
    const filtered = node.marks.filter((m: TipTapMark) => m.type !== 'inlineTypographyPreset')
    if (filtered.length > 0) {
      result.marks = filtered
    }
  }

  if (node.text !== undefined) {
    result.text = node.text
  }

  if (node.content) {
    result.content = node.content.map(stripNode)
  }

  return result
}

function stripFragment(fragment: Fragment, schema: any): Fragment {
  const nodes: ProseMirrorNode[] = []
  fragment.forEach((node) => {
    let stripped = node

    if (node.type.name === 'paragraph' && node.attrs.presetKey) {
      stripped = node.type.create({ ...node.attrs, presetKey: null }, node.content, node.marks)
    }

    if (stripped.isText && stripped.marks.length > 0) {
      const cleanMarks = stripped.marks.filter(m => m.type.name !== 'inlineTypographyPreset')
      if (cleanMarks.length !== stripped.marks.length) {
        stripped = stripped.mark(cleanMarks)
      }
    }

    if (stripped.content.size > 0) {
      const cleanContent = stripFragment(stripped.content, schema)
      if (cleanContent !== stripped.content) {
        stripped = stripped.copy(cleanContent)
      }
    }

    nodes.push(stripped)
  })

  return Fragment.from(nodes)
}

export const PasteSanitization = Extension.create({
  name: 'pasteSanitization',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('pasteSanitization'),
        props: {
          transformPasted: (slice: Slice) => {
            const cleaned = stripFragment(slice.content, this.editor.schema)
            return new Slice(cleaned, slice.openStart, slice.openEnd)
          },
        },
      }),
    ]
  },
})
