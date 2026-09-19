import { flattenExtensions } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import { TypographyParagraph } from './TypographyParagraph'
import { InlineTypographyPreset } from './InlineTypographyPreset'
import { PasteSanitization } from './pasteSanitization'
import { TextColor } from './TextColor'
import { FontWeight } from './FontWeight'
import { FontSize } from './FontSize'
import { isSafeUrl } from '~/shared/tiptap/urlPolicy'
import type { RichtextMode } from '../richtextModes'

export interface CreateExtensionsOptions {
  mode?: RichtextMode
}

export function createRichTextExtensions(options: CreateExtensionsOptions = {}) {
  const mode: RichtextMode = options.mode ?? 'block'

  // StarterKit ships paragraph/hardBreak/bulletList/orderedList/listItem/link/
  // bold/italic/strike/code/history/underline.
  // Per mode:
  //   - paragraph: block mode disables StarterKit's paragraph and registers
  //     TypographyParagraph (carries presetKey attr). Single/inline keep
  //     StarterKit's paragraph as the structural carrier for ProseMirror —
  //     the renderer drops the <p> wrap on output for those modes, but the
  //     editor schema still needs a block node to hold the cursor.
  //   - hardBreak disabled in single
  //   - bulletList/orderedList/listItem disabled in single + inline
  //   - link disabled here always; block mode re-registers it with isAllowedUri
  //     (single/inline don't allow links)
  const starter = StarterKit.configure({
    paragraph: mode === 'block' ? false : {},
    hardBreak: mode === 'single' ? false : {},
    bulletList: mode === 'block' ? {} : false,
    orderedList: mode === 'block' ? {} : false,
    listItem: mode === 'block' ? {} : false,
    link: false,
  })

  // Underline ships with StarterKit in TipTap 3. Registering the standalone
  // extension as well creates two plugins with the same name and ambiguous
  // command state in every rich-text field.
  const exts: any[] = [starter]

  // TypographyParagraph (the paragraph node carrying presetKey attr) is
  // only meaningful when paragraphs exist — block mode only.
  if (mode === 'block') {
    exts.push(TypographyParagraph)
    exts.push(Link.configure({
      openOnClick: false,
      isAllowedUri: (url: string, { defaultValidate }: any) => isSafeUrl(url) && defaultValidate(url),
    }))
  }

  exts.push(InlineTypographyPreset, TextColor, FontWeight, FontSize, PasteSanitization)

  // Flatten so consumers (and tests) see individual sub-extension names from
  // StarterKit (paragraph, bulletList, hardBreak, etc.) rather than just the
  // wrapper. Drop the StarterKit wrapper itself: it's a container that emits
  // children via addExtensions(), so re-flattening downstream (in
  // ExtensionManager.resolve) would re-expand it and duplicate every child.
  return flattenExtensions(exts).filter((e: any) => e.name !== 'starterKit')
}
