// shared/features/cms/templateLoader.ts
//
// Runtime resolver for template Vue components. One cross-theme `import.meta.glob`
// over `/themes/*/templates/*.vue`, grouped by theme at module load. The glob is
// NOT eager, so Vite still emits one async chunk per `.vue` and unused templates
// are tree-shaken / lazily loaded in production. A theme that ships templates is
// discovered automatically — no registry edit needed.
//
// `component` strings stamped on articles look like `templates/<id>.vue` and
// are validated against COMPONENT_RE before resolution. The regex rejects path
// traversal (`..`) and any non-template prefix, so a poisoned DB row can't
// load arbitrary Vue files from the bundle.

const TEMPLATE_MODULES = import.meta.glob<Record<string, any>>(
  '/themes/*/templates/*.vue',
)

const THEME_SEG_RE = /^\/themes\/([^/]+)\/templates\//

const REGISTRIES: Record<string, Record<string, () => Promise<any>>> = (() => {
  const out: Record<string, Record<string, () => Promise<any>>> = {}
  for (const [key, loader] of Object.entries(TEMPLATE_MODULES)) {
    const theme = key.match(THEME_SEG_RE)?.[1]
    if (!theme) continue
    ;(out[theme] ??= {})[key] = loader
  }
  return out
})()

const COMPONENT_RE = /^templates\/[a-z0-9][a-z0-9-]*\.vue$/

export async function loadTemplateComponent(theme: string, component: string): Promise<any> {
  if (!COMPONENT_RE.test(component)) {
    throw new Error(`templateLoader: invalid component path ${component}`)
  }
  const registry = REGISTRIES[theme]
  if (!registry) throw new Error(`templateLoader: theme ${theme} not registered`)
  // Translate `templates/foo.vue` -> glob key `/themes/<theme>/templates/foo.vue`
  const fileName = component.replace(/^templates\//, '')
  const key = Object.keys(registry).find(k => k.endsWith(`/${fileName}`))
  if (!key) throw new Error(`templateLoader: component ${component} not found in theme ${theme}`)
  const mod = await registry[key]!()
  return (mod as any).default
}
