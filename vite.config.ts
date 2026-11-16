import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import type { Plugin } from 'vite'
import dts from 'vite-plugin-dts'
import { defineConfig } from 'vitest/config'

const fromRoot = (path: string): string => resolve(import.meta.dirname, path)

const subpathEntries = [
  'index',
  'sanitize/index',
  'normalize/index',
  'markdown/index',
  'helpers/index',
  'vue/index',
  'theme/index',
]
  .filter((entry) => existsSync(fromRoot(`src/${entry}.ts`)))
  .map((entry) => [entry, fromRoot(`src/${entry}.ts`)] as const)

const moduleEntries = readdirSync(fromRoot('src/modules'))
  .filter((file) => file.endsWith('.ts'))
  .map((file) => [`modules/${file.slice(0, -3)}`, fromRoot(`src/modules/${file}`)] as const)

const themeCss: Plugin = {
  name: 'theme-css',
  apply: 'build',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'theme.css',
      source: readFileSync(fromRoot('src/theme/theme.css'), 'utf8'),
    })
  },
}

const fullCoverage = { statements: 100, branches: 100, functions: 100, lines: 100 }

export default defineConfig({
  plugins: [
    vue(),
    themeCss,
    dts({
      tsconfigPath: fromRoot('tsconfig.build.json'),
      entryRoot: 'src',
      exclude: ['src/__tests__/**'],
    }),
  ],
  build: {
    target: 'es2022',
    minify: false,
    sourcemap: false,
    lib: {
      entry: Object.fromEntries([...subpathEntries, ...moduleEntries]),
      formats: ['es'],
    },
    rolldownOptions: {
      external: ['vue'],
      output: {
        preserveModules: true,
        preserveModulesRoot: 'src',
        entryFileNames: '[name].js',
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      include: ['src/**/*.ts', 'src/**/*.vue'],
      exclude: ['src/__tests__/**', 'src/**/types.ts'],
      thresholds: {
        statements: 95,
        branches: 95,
        functions: 95,
        lines: 95,
        'src/core/**': fullCoverage,
        'src/sanitize/**': fullCoverage,
        'src/normalize/**': fullCoverage,
        'src/markdown/**': fullCoverage,
      },
    },
  },
})
