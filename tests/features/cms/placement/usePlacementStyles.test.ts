// tests/shared/features/cms/placement/usePlacementStyles.test.ts
import { describe, it, expect } from 'vitest'
import { ref, nextTick } from 'vue'
import { usePlacementStyles } from '~/shared/features/cms/placement/usePlacementStyles'
import type { BlockPlacementConfig } from '~/shared/types/placement'

describe('usePlacementStyles', () => {
  it('returns empty when placement is undefined', () => {
    const { placementClasses, placementVars, hasFrame } = usePlacementStyles(ref(undefined))
    expect(placementClasses.value).toEqual({})
    expect(placementVars.value).toEqual({})
    expect(hasFrame.value).toBe(false)
  })

  it('generates alignment class', () => {
    const placement = ref<BlockPlacementConfig>({ alignSelf: 'center' })
    const { placementClasses } = usePlacementStyles(placement)
    expect(placementClasses.value).toMatchObject({
      'block-placement--align-center': true,
    })
  })

  it('generates width class', () => {
    const placement = ref<BlockPlacementConfig>({ widthMode: 'content' })
    const { placementClasses } = usePlacementStyles(placement)
    expect(placementClasses.value).toMatchObject({
      'block-placement--width-content': true,
    })
  })

  it('generates margin CSS vars from tokens', () => {
    const placement = ref<BlockPlacementConfig>({
      marginTop: { mode: 'token', value: 'lg' },
      marginBottom: { mode: 'token', value: 'sm' },
    })
    const { placementVars } = usePlacementStyles(placement)
    expect(placementVars.value['--placement-margin-top']).toBe('2rem')
    expect(placementVars.value['--placement-margin-bottom']).toBe('0.5rem')
  })

  it('generates maxWidth CSS var', () => {
    const placement = ref<BlockPlacementConfig>({
      maxWidth: { mode: 'token', value: 'md' },
    })
    const { placementVars } = usePlacementStyles(placement)
    expect(placementVars.value['--placement-max-width']).toBe('640px')
  })

  it('hasFrame is true when wrapperStyle is not none', () => {
    const placement = ref<BlockPlacementConfig>({ wrapperStyle: 'card' })
    const { hasFrame } = usePlacementStyles(placement)
    expect(hasFrame.value).toBe(true)
  })

  it('hasFrame is true when wrapperOverrides have values', () => {
    const placement = ref<BlockPlacementConfig>({
      wrapperOverrides: { shadow: 'md' },
    })
    const { hasFrame } = usePlacementStyles(placement)
    expect(hasFrame.value).toBe(true)
  })

  it('hasFrame is false when wrapperStyle is none and no overrides', () => {
    const placement = ref<BlockPlacementConfig>({ wrapperStyle: 'none' })
    const { hasFrame } = usePlacementStyles(placement)
    expect(hasFrame.value).toBe(false)
  })

  it('generates frame CSS vars from overrides', () => {
    const placement = ref<BlockPlacementConfig>({
      wrapperStyle: 'card',
      wrapperOverrides: {
        borderRadius: 'lg',
        shadow: 'sm',
        backgroundColor: 'surface',
      },
    })
    const { frameVars } = usePlacementStyles(placement)
    expect(frameVars.value['--frame-border-radius']).toBe('16px')
    expect(frameVars.value['--frame-shadow']).toContain('0')
    expect(frameVars.value['--frame-bg']).toBe('var(--section-surface)')
  })

  it('respects layoutConstraints.ignoreAlign', () => {
    const placement = ref<BlockPlacementConfig>({ alignSelf: 'center' })
    const { placementClasses } = usePlacementStyles(placement, { ignoreAlign: true })
    expect(placementClasses.value['block-placement--align-center']).toBeUndefined()
  })

  it('respects layoutConstraints.forceWidth', () => {
    const placement = ref<BlockPlacementConfig>({ widthMode: 'content' })
    const { placementClasses } = usePlacementStyles(placement, { forceWidth: true })
    expect(placementClasses.value['block-placement--width-full']).toBe(true)
  })

  it('is reactive to placement changes', async () => {
    const placement = ref<BlockPlacementConfig>({ alignSelf: 'start' })
    const { placementClasses } = usePlacementStyles(placement)
    expect(placementClasses.value['block-placement--align-start']).toBe(true)

    placement.value = { alignSelf: 'end' }
    await nextTick()
    expect(placementClasses.value['block-placement--align-end']).toBe(true)
    expect(placementClasses.value['block-placement--align-start']).toBeUndefined()
  })
})

describe('usePlacementStyles — alignment is live by construction', () => {
  const widthModes: Array<[BlockPlacementConfig['widthMode'], boolean]> = [
    [undefined, true],
    ['auto', true],
    ['content', false],
    ['full', false],
  ]

  it.each(widthModes)('widthMode %s emits fit-content: %s when aligned', (widthMode, expected) => {
    const { placementVars } = usePlacementStyles(ref<BlockPlacementConfig>({ alignSelf: 'start', widthMode }))
    expect(placementVars.value.width).toBe(expected ? 'fit-content' : undefined)
  })

  it('does not shrink an unaligned block', () => {
    const { placementVars } = usePlacementStyles(ref<BlockPlacementConfig>({ widthMode: 'auto' }))
    expect(placementVars.value.width).toBeUndefined()
  })

  it('does not shrink a block that already has a max width', () => {
    const { placementVars } = usePlacementStyles(ref<BlockPlacementConfig>({
      alignSelf: 'end',
      maxWidth: { mode: 'token', value: 'md' },
    }))
    expect(placementVars.value.width).toBeUndefined()
  })

  it('does not shrink a stretched block', () => {
    const { placementVars } = usePlacementStyles(ref<BlockPlacementConfig>({ alignSelf: 'stretch' }))
    expect(placementVars.value.width).toBeUndefined()
  })

  it('honours forceWidth and ignoreAlign when deciding to shrink', () => {
    const placement = ref<BlockPlacementConfig>({ alignSelf: 'start' })
    expect(usePlacementStyles(placement, { forceWidth: true }).placementVars.value.width).toBeUndefined()
    expect(usePlacementStyles(placement, { ignoreAlign: true }).placementVars.value.width).toBeUndefined()
  })

  it.each([
    ['start', '0 auto'],
    ['center', 'auto'],
    ['end', 'auto 0'],
  ] as const)('emits --block-measure-align %s as %s', (alignSelf, expected) => {
    const { placementVars } = usePlacementStyles(ref<BlockPlacementConfig>({ alignSelf }))
    expect(placementVars.value['--block-measure-align']).toBe(expected)
  })

  it('emits the measure-align var even when width is constrained', () => {
    const { placementVars } = usePlacementStyles(ref<BlockPlacementConfig>({ alignSelf: 'end', widthMode: 'full' }))
    expect(placementVars.value['--block-measure-align']).toBe('auto 0')
  })

  it('leaves the measure-align var unset for a stretched block', () => {
    const { placementVars } = usePlacementStyles(ref<BlockPlacementConfig>({ alignSelf: 'stretch' }))
    expect(placementVars.value['--block-measure-align']).toBeUndefined()
  })

  it('emits nothing at all for an empty placement object', () => {
    const { placementClasses, placementVars } = usePlacementStyles(ref<BlockPlacementConfig>({}))
    expect(placementClasses.value).toEqual({})
    expect(placementVars.value).toEqual({})
  })

  it('omits the measure-align var when alignment is absent or ignored', () => {
    expect(usePlacementStyles(ref<BlockPlacementConfig>({ widthMode: 'auto' })).placementVars.value['--block-measure-align']).toBeUndefined()
    expect(
      usePlacementStyles(ref<BlockPlacementConfig>({ alignSelf: 'center' }), { ignoreAlign: true })
        .placementVars.value['--block-measure-align'],
    ).toBeUndefined()
  })
})
