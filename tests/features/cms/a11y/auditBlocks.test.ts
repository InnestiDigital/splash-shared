import { describe, it, expect } from 'vitest'
import {
  auditBlocks,
  summarize,
  type A11yFinding,
  type AuditBlock,
  type BlockSchema,
} from '../../../../../shared/features/cms/a11y/auditBlocks'

function block(
  id: string,
  type: string,
  settings: Record<string, unknown> | null = {},
): AuditBlock {
  return { id, type, settings }
}

describe('auditBlocks — guards', () => {
  it('returns [] for an empty block list', () => {
    expect(auditBlocks([], {})).toEqual([])
  })

  it('skips blocks whose type has no schema', () => {
    expect(auditBlocks([block('b1', 'unknown-type', { img: 'x.jpg' })], {})).toEqual([])
  })

  it('skips blocks whose schema has no settings or empty settings', () => {
    const schemas: Record<string, BlockSchema> = {
      'no-settings': {},
      'empty-settings': { settings: [] },
    }
    const blocks = [
      block('b1', 'no-settings', { img: 'x.jpg' }),
      block('b2', 'empty-settings', { img: 'x.jpg' }),
    ]
    expect(auditBlocks(blocks, schemas)).toEqual([])
  })

  it('treats null settings as empty (image not set → no finding)', () => {
    const schemas: Record<string, BlockSchema> = {
      hero: { settings: [{ id: 'image', type: 'image' }] },
    }
    expect(auditBlocks([block('b1', 'hero', null)], schemas)).toEqual([])
  })
})

describe('auditBlocks — image-no-alt-field (warning)', () => {
  const schemas: Record<string, BlockSchema> = {
    'hero-block': { settings: [{ id: 'backgroundImage', type: 'image' }] },
  }

  it('flags a set image field with no alt-text field in the schema', () => {
    const findings = auditBlocks(
      [block('b1', 'hero-block', { backgroundImage: 'bg.jpg' })],
      schemas,
    )
    expect(findings).toEqual([
      {
        rule: 'image-no-alt-field',
        severity: 'warning',
        blockId: 'b1',
        blockType: 'hero-block',
        blockLabel: 'Hero Block',
        fieldId: 'backgroundImage',
        message:
          '"Hero Block" shows an image but has no alt-text field, so it can\'t be described for screen readers.',
      },
    ])
  })

  it('treats a media-object value ({ src }) as a set image', () => {
    const findings = auditBlocks(
      [block('b1', 'hero-block', { backgroundImage: { src: '/img/bg.jpg', alt: '' } })],
      schemas,
    )
    expect(findings).toHaveLength(1)
    expect(findings[0].rule).toBe('image-no-alt-field')
  })

  it('does not flag when the image is not set', () => {
    expect(auditBlocks([block('b1', 'hero-block', {})], schemas)).toEqual([])
    expect(
      auditBlocks([block('b1', 'hero-block', { backgroundImage: '   ' })], schemas),
    ).toEqual([])
  })

  it('media object with non-string src is not set', () => {
    expect(
      auditBlocks([block('b1', 'hero-block', { backgroundImage: { src: 123 } })], schemas),
    ).toEqual([])
  })

  it('array value is not set', () => {
    expect(
      auditBlocks([block('b1', 'hero-block', { backgroundImage: ['a.jpg'] })], schemas),
    ).toEqual([])
  })

  it('number value counts as set (String(value))', () => {
    const findings = auditBlocks(
      [block('b1', 'hero-block', { backgroundImage: 42 })],
      schemas,
    )
    expect(findings).toHaveLength(1)
    expect(findings[0].rule).toBe('image-no-alt-field')
  })
})

describe('auditBlocks — image-alt-empty (error)', () => {
  const schemas: Record<string, BlockSchema> = {
    figure: {
      settings: [
        { id: 'image', type: 'media', group: 'content' },
        { id: 'imageAlt', type: 'text', group: 'content' },
      ],
    },
  }

  it('flags a set image with a blank alt field', () => {
    const findings = auditBlocks(
      [block('b1', 'figure', { image: 'x.jpg', imageAlt: '' })],
      schemas,
    )
    expect(findings).toEqual([
      {
        rule: 'image-alt-empty',
        severity: 'error',
        blockId: 'b1',
        blockType: 'figure',
        blockLabel: 'Figure',
        fieldId: 'imageAlt',
        message:
          '"Figure" has an image with empty alt text. Describe the image or mark it decorative.',
      },
    ])
  })

  it('flags whitespace-only and absent alt values', () => {
    const ws = auditBlocks([block('b1', 'figure', { image: 'x.jpg', imageAlt: '  ' })], schemas)
    const absent = auditBlocks([block('b2', 'figure', { image: 'x.jpg' })], schemas)
    expect(ws.map((f) => f.rule)).toEqual(['image-alt-empty'])
    expect(absent.map((f) => f.rule)).toEqual(['image-alt-empty'])
  })

  it('does not flag when the alt is populated', () => {
    expect(
      auditBlocks([block('b1', 'figure', { image: 'x.jpg', imageAlt: 'A dog' })], schemas),
    ).toEqual([])
  })

  it('does not flag when the image is not set even if the alt is empty', () => {
    expect(auditBlocks([block('b1', 'figure', { imageAlt: '' })], schemas)).toEqual([])
  })
})

describe('auditBlocks — findAltField pairing precedence', () => {
  it('same-group alt wins over prefix match', () => {
    const schemas: Record<string, BlockSchema> = {
      b: {
        settings: [
          { id: 'heroImage', type: 'image', group: 'media' },
          { id: 'altText', type: 'text', group: 'media' },
          { id: 'heroImageAlt', type: 'text', group: 'content' },
        ],
      },
    }
    const findings = auditBlocks([block('b1', 'b', { heroImage: 'x.jpg', heroImageAlt: 'set' })], schemas)
    // Paired with same-group altText (empty), not the populated prefix match.
    expect(findings).toHaveLength(1)
    expect(findings[0].rule).toBe('image-alt-empty')
    expect(findings[0].fieldId).toBe('altText')
  })

  it('prefix match (heroImage → heroImageAlt) when groups differ', () => {
    const schemas: Record<string, BlockSchema> = {
      b: {
        settings: [
          { id: 'heroImage', type: 'image', group: 'media' },
          { id: 'heroImageAlt', type: 'text', group: 'content' },
        ],
      },
    }
    const findings = auditBlocks([block('b1', 'b', { heroImage: 'x.jpg' })], schemas)
    expect(findings).toHaveLength(1)
    expect(findings[0].fieldId).toBe('heroImageAlt')
  })

  it('single image falls back to any alt text field with no group/prefix match', () => {
    const schemas: Record<string, BlockSchema> = {
      b: {
        settings: [
          { id: 'photo', type: 'image', group: 'a' },
          { id: 'altDescription', type: 'string', group: 'b' },
        ],
      },
    }
    const findings = auditBlocks([block('b1', 'b', { photo: 'x.jpg' })], schemas)
    expect(findings).toHaveLength(1)
    expect(findings[0].rule).toBe('image-alt-empty')
    expect(findings[0].fieldId).toBe('altDescription')
  })

  it('two image fields with one non-matching alt field → unpaired images get image-no-alt-field', () => {
    const schemas: Record<string, BlockSchema> = {
      b: {
        settings: [
          { id: 'photoOne', type: 'image', group: 'a' },
          { id: 'photoTwo', type: 'image', group: 'b' },
          { id: 'somethingAlt', type: 'text', group: 'c' },
        ],
      },
    }
    const findings = auditBlocks(
      [block('b1', 'b', { photoOne: 'x.jpg', photoTwo: 'y.jpg' })],
      schemas,
    )
    expect(findings.map((f) => [f.rule, f.fieldId])).toEqual([
      ['image-no-alt-field', 'photoOne'],
      ['image-no-alt-field', 'photoTwo'],
    ])
  })
})

describe('auditBlocks — link-text', () => {
  const schemas: Record<string, BlockSchema> = {
    cta: {
      settings: [
        { id: 'ctaUrl', type: 'url', group: 'cta' },
        { id: 'ctaText', type: 'text', group: 'cta' },
      ],
    },
  }

  it('flags a set link whose text is empty', () => {
    const findings = auditBlocks(
      [block('b1', 'cta', { ctaUrl: '/about', ctaText: '' })],
      schemas,
    )
    expect(findings).toEqual([
      {
        rule: 'link-text',
        severity: 'warning',
        blockId: 'b1',
        blockType: 'cta',
        blockLabel: 'Cta',
        fieldId: 'ctaText',
        message:
          'A link in "Cta" has no visible text. Screen readers will announce only the URL.',
      },
    ])
  })

  it('flags generic phrases case-insensitively with the quoted-text message', () => {
    const findings = auditBlocks(
      [block('b1', 'cta', { ctaUrl: '/about', ctaText: 'Click HERE' })],
      schemas,
    )
    expect(findings).toHaveLength(1)
    expect(findings[0].message).toBe(
      'A link in "Cta" reads "Click HERE" — write text that describes where it goes.',
    )
  })

  it('strips richtext markup and &nbsp; before matching generic phrases', () => {
    const findings = auditBlocks(
      [block('b1', 'cta', { ctaUrl: '/about', ctaText: '<b>Read&nbsp;more</b>' })],
      schemas,
    )
    expect(findings).toHaveLength(1)
    expect(findings[0].message).toBe(
      'A link in "Cta" reads "Read more" — write text that describes where it goes.',
    )
  })

  it('does not flag descriptive link text', () => {
    expect(
      auditBlocks([block('b1', 'cta', { ctaUrl: '/about', ctaText: 'About our team' })], schemas),
    ).toEqual([])
  })

  it('skips links that are not set', () => {
    expect(auditBlocks([block('b1', 'cta', { ctaText: '' })], schemas)).toEqual([])
  })

  it('skips a set link when the schema has no candidate text field', () => {
    const bare: Record<string, BlockSchema> = {
      b: { settings: [{ id: 'externalLink', type: 'link' }] },
    }
    expect(auditBlocks([block('b1', 'b', { externalLink: 'https://x.test' })], bare)).toEqual([])
  })
})

describe('auditBlocks — findLinkTextField precedence', () => {
  it('same-group candidate beats prefix match', () => {
    const schemas: Record<string, BlockSchema> = {
      b: {
        settings: [
          { id: 'ctaUrl', type: 'url', group: 'g1' },
          { id: 'buttonLabel', type: 'text', group: 'g1' },
          { id: 'ctaText', type: 'text', group: 'g2' },
        ],
      },
    }
    const findings = auditBlocks(
      [block('b1', 'b', { ctaUrl: '/x', buttonLabel: '', ctaText: 'Fine text' })],
      schemas,
    )
    expect(findings).toHaveLength(1)
    expect(findings[0].fieldId).toBe('buttonLabel')
  })

  it('prefix match (ctaUrl → ctaText) beats first candidate when groups differ', () => {
    const schemas: Record<string, BlockSchema> = {
      b: {
        settings: [
          { id: 'ctaUrl', type: 'url', group: 'g1' },
          { id: 'headingTitle', type: 'text', group: 'g2' },
          { id: 'ctaText', type: 'text', group: 'g3' },
        ],
      },
    }
    const findings = auditBlocks(
      [block('b1', 'b', { ctaUrl: '/x', headingTitle: 'Some heading', ctaText: '' })],
      schemas,
    )
    expect(findings).toHaveLength(1)
    expect(findings[0].fieldId).toBe('ctaText')
  })

  it('falls back to the first candidate when neither group nor prefix matches', () => {
    const schemas: Record<string, BlockSchema> = {
      b: {
        settings: [
          { id: 'ctaUrl', type: 'url', group: 'g1' },
          { id: 'headingTitle', type: 'text', group: 'g2' },
        ],
      },
    }
    const findings = auditBlocks(
      [block('b1', 'b', { ctaUrl: '/x', headingTitle: '' })],
      schemas,
    )
    expect(findings).toHaveLength(1)
    expect(findings[0].fieldId).toBe('headingTitle')
  })

  it('link id with no url/link/href suffix still resolves a candidate', () => {
    const schemas: Record<string, BlockSchema> = {
      b: {
        settings: [
          { id: 'destination', type: 'link', group: 'g1' },
          { id: 'labelText', type: 'string', group: 'g2' },
        ],
      },
    }
    const findings = auditBlocks(
      [block('b1', 'b', { destination: '/x', labelText: 'here' })],
      schemas,
    )
    expect(findings).toHaveLength(1)
    expect(findings[0].fieldId).toBe('labelText')
    expect(findings[0].message).toBe(
      'A link in "B" reads "here" — write text that describes where it goes.',
    )
  })
})

describe('auditBlocks — localization', () => {
  const schemas: Record<string, BlockSchema> = {
    figure: {
      settings: [
        { id: 'image', type: 'image', group: 'g' },
        { id: 'imageAlt', type: 'text', group: 'g' },
      ],
    },
  }

  it('resolves the active locale from a localized map', () => {
    const blocks = [
      block('b1', 'figure', {
        image: 'x.jpg',
        imageAlt: { 'en-US': '', 'it-IT': 'Un cane' },
      }),
    ]
    expect(auditBlocks(blocks, schemas, { locale: 'it-IT' })).toEqual([])
    expect(auditBlocks(blocks, schemas, { locale: 'en-US' })).toHaveLength(1)
  })

  it('falls back to fallbackLocale, then to the first key', () => {
    const blocks = [
      block('b1', 'figure', {
        image: 'x.jpg',
        imageAlt: { 'it-IT': 'Un cane' },
      }),
    ]
    // Active locale missing → fallback locale hit.
    expect(
      auditBlocks(blocks, schemas, { locale: 'fr-FR', fallbackLocale: 'it-IT' }),
    ).toEqual([])
    // Both missing → first key value.
    expect(
      auditBlocks(blocks, schemas, { locale: 'fr-FR', fallbackLocale: 'de-DE' }),
    ).toEqual([])
  })

  it('non-string localized value resolves to empty', () => {
    const blocks = [
      block('b1', 'figure', { image: 'x.jpg', imageAlt: { 'en-US': 42 } }),
    ]
    const findings = auditBlocks(blocks, schemas)
    expect(findings.map((f) => f.rule)).toEqual(['image-alt-empty'])
  })

  it('localized image map counts as set', () => {
    const blocks = [
      block('b1', 'figure', { image: { 'en-US': 'x.jpg' }, imageAlt: 'A dog' }),
    ]
    expect(auditBlocks(blocks, schemas)).toEqual([])
  })
})

describe('auditBlocks — block label resolution', () => {
  const settings = [
    { id: 'image', type: 'image', group: 'g' },
    { id: 'imageAlt', type: 'text', group: 'g' },
  ] as const

  it('uses a localized schema label object', () => {
    const schemas: Record<string, BlockSchema> = {
      figure: { settings, label: { 'en-US': 'Figure EN', 'it-IT': 'Figura' } },
    }
    const findings = auditBlocks(
      [block('b1', 'figure', { image: 'x.jpg' })],
      schemas,
      { locale: 'it-IT' },
    )
    expect(findings[0].blockLabel).toBe('Figura')
  })

  it('uses a plain string label', () => {
    const schemas: Record<string, BlockSchema> = {
      figure: { settings, label: 'My Figure' },
    }
    const findings = auditBlocks([block('b1', 'figure', { image: 'x.jpg' })], schemas)
    expect(findings[0].blockLabel).toBe('My Figure')
  })

  it('humanizes the block type when no label exists', () => {
    const schemas: Record<string, BlockSchema> = {
      'hero_banner-block': { settings },
      '-leading-sep': { settings },
    }
    const a = auditBlocks([block('b1', 'hero_banner-block', { image: 'x.jpg' })], schemas)
    expect(a[0].blockLabel).toBe('Hero Banner Block')
    const b = auditBlocks([block('b2', '-leading-sep', { image: 'x.jpg' })], schemas)
    expect(b[0].blockLabel).toBe('Leading Sep')
  })
})

describe('auditBlocks — ordering', () => {
  it('sorts errors first, preserving block order within each severity', () => {
    const schemas: Record<string, BlockSchema> = {
      'warn-only': { settings: [{ id: 'img', type: 'image' }] },
      'err-only': {
        settings: [
          { id: 'img', type: 'image', group: 'g' },
          { id: 'imgAlt', type: 'text', group: 'g' },
        ],
      },
    }
    const findings = auditBlocks(
      [
        block('w1', 'warn-only', { img: 'a.jpg' }),
        block('e1', 'err-only', { img: 'b.jpg', imgAlt: '' }),
        block('w2', 'warn-only', { img: 'c.jpg' }),
        block('e2', 'err-only', { img: 'd.jpg', imgAlt: '' }),
      ],
      schemas,
    )
    expect(findings.map((f) => [f.severity, f.blockId])).toEqual([
      ['error', 'e1'],
      ['error', 'e2'],
      ['warning', 'w1'],
      ['warning', 'w2'],
    ])
  })
})

describe('summarize', () => {
  const finding = (severity: 'error' | 'warning'): A11yFinding => ({
    rule: 'link-text',
    severity,
    blockId: 'b',
    blockType: 't',
    blockLabel: 'T',
    fieldId: 'f',
    message: 'm',
  })

  it('counts errors, warnings and total', () => {
    expect(summarize([finding('error'), finding('warning'), finding('warning')])).toEqual({
      errors: 1,
      warnings: 2,
      total: 3,
    })
  })

  it('returns zeros for no findings', () => {
    expect(summarize([])).toEqual({ errors: 0, warnings: 0, total: 0 })
  })
})
