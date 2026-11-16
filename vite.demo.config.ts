import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

const fromRoot = (path: string): string => resolve(import.meta.dirname, path)

export default defineConfig({
  root: fromRoot('demo'),
  base: process.env['VITE_DEMO_BASE'] ?? '/vue-wysiwyg/',
  plugins: [vue()],
  resolve: {
    alias: [
      {
        find: /^@einhasad-vue\/vue-wysiwyg\/modules\/(.+)$/,
        replacement: fromRoot('src/modules/$1.ts'),
      },
      {
        find: /^@einhasad-vue\/vue-wysiwyg\/theme\.css$/,
        replacement: fromRoot('src/theme/theme.css'),
      },
      {
        find: /^@einhasad-vue\/vue-wysiwyg\/(sanitize|normalize|markdown|vue|theme)$/,
        replacement: fromRoot('src/$1/index.ts'),
      },
      { find: /^@einhasad-vue\/vue-wysiwyg$/, replacement: fromRoot('src/index.ts') },
    ],
  },
  build: {
    outDir: fromRoot('demo-dist'),
    emptyOutDir: true,
    sourcemap: true,
  },
  preview: {
    port: 4180,
    strictPort: true,
  },
})
