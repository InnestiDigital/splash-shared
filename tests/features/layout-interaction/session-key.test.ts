import { describe, it, expect } from 'vitest'
import { composeSessionKey } from '../../../../shared/features/layout-interaction/session-key'

describe('composeSessionKey', () => {
  it('composes expected format with namespace', () => {
    const key = composeSessionKey({ namespace: 'scatter', blockId: 'blk_1', configVersion: 'cv', layoutFingerprint: 'fp' })
    expect(key).toBe('scatter:blk_1:v:cv:h:fp:s:1')
  })

  it('different namespaces do not collide on same block', () => {
    const a = composeSessionKey({ namespace: 'scatter',  blockId: 'blk_1', configVersion: 'cv', layoutFingerprint: 'fp' })
    const b = composeSessionKey({ namespace: 'freeform', blockId: 'blk_1', configVersion: 'cv', layoutFingerprint: 'fp' })
    expect(a).not.toBe(b)
  })

  it('stringifies numeric configVersion', () => {
    expect(composeSessionKey({ namespace: 'scatter', blockId: 'b', configVersion: 42, layoutFingerprint: 'f' }))
      .toBe('scatter:b:v:42:h:f:s:1')
  })
})
