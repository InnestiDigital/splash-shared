import { defineConfig } from 'vitest/config'
import { resolve } from 'path'
import vue from '@vitejs/plugin-vue'

// Force UTC so Date handling matches the Docker env of the host monorepo.
process.env.TZ = 'UTC'

export default defineConfig({
  root: __dirname,
  plugins: [vue()],
  define: {
    'import.meta.client': true,
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: [resolve(__dirname, 'tests/setup.ts')],
    testTimeout: 10000,
    coverage: {
      provider: 'v8',
      // lcov feeds SonarCloud (sonar-project.properties in this repo); the
      // rest are human/CI artifacts.
      reporter: ['text', 'text-summary', 'json-summary', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      thresholds: {
        lines: 75,
      },
      include: ['**/*.{ts,vue}'],
      exclude: [
        'coverage/**',
        'node_modules/**',
        'tests/**',
        'features/cms/blockRegistry.ts',
        '**/*.d.ts',
        // Vue page components — need E2E/browser tests, not unit tests
        'pages/**',
        // Nuxt plugins — runtime-only, no unit-testable logic
        'plugins/**',
        // Type-only exports
        'types/**',
        // Template-only Vue components (0% — need E2E, not unit tests)
        'components/FormField.vue',
        'features/cms/SectionRenderer.vue',
        'features/cms/section-layouts/GallerySectionLayout.vue',
        'features/cms/section-layouts/StackedSectionLayout.vue',
        // Nuxt-runtime composables (thin wrappers, no testable logic)
        'composables/useFormFieldSchema.ts',
        'composables/useAuthState.ts',
        // DOM-heavy composables (scroll/IntersectionObserver — need E2E)
        'composables/useSectionReveal.ts',
      ],
    },
  },
  resolve: {
    alias: {
      // Tests historically import product code as `~/shared/...`; inside this
      // repo that resolves to the package root itself.
      '~/shared': resolve(__dirname),
      '~/tests': resolve(__dirname, 'tests'),
      '#app': resolve(__dirname, 'tests/helpers/nuxt-stubs.ts'),
      '#imports': resolve(__dirname, 'tests/helpers/nuxt-stubs.ts'),
    },
  },
})
