import type { CompositionTemplate } from '../types'
import { asymmetricHero } from './asymmetricHero'
import { offsetMediaStack } from './offsetMediaStack'
import { captionedEditorialSpread } from './captionedEditorialSpread'

const registry = new Map<string, CompositionTemplate>()

export function registerTemplate(template: CompositionTemplate): void {
  registry.set(template.id, template)
}

export function getTemplate(id: string): CompositionTemplate | undefined {
  return registry.get(id)
}

export function getAllTemplates(): CompositionTemplate[] {
  return Array.from(registry.values())
}

// Auto-register built-in templates
registerTemplate(asymmetricHero)
registerTemplate(offsetMediaStack)
registerTemplate(captionedEditorialSpread)
