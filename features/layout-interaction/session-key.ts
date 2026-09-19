import { SCHEMA_VERSION } from './constants'

export function composeSessionKey(args: {
  namespace: string
  blockId: string
  configVersion: string | number
  layoutFingerprint: string
}): string {
  return `${args.namespace}:${args.blockId}:v:${args.configVersion}:h:${args.layoutFingerprint}:s:${SCHEMA_VERSION}`
}
