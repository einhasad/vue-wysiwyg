import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import config from '../../../vite.config.js'

const readJson = (file: string): unknown => JSON.parse(readFileSync(file, 'utf8'))

const manifest = readJson('package.json') as { files: string[]; exports: Record<string, unknown> }

describe('published package', () => {
  it('ships the changelog and security policy next to dist', () => {
    expect(manifest.files).toEqual(expect.arrayContaining(['dist', 'CHANGELOG.md', 'SECURITY.md']))
  })

  it('emits no source or declaration maps, since src is not shipped', () => {
    expect(config.build?.sourcemap).toBe(false)
    const build = readJson('tsconfig.build.json') as { compilerOptions: Record<string, unknown> }
    expect(build.compilerOptions).toMatchObject({ declarationMap: false, sourceMap: false })
  })

  it('exports the helpers subpath for custom modules', () => {
    expect(manifest.exports['./helpers']).toEqual({
      types: './dist/helpers/index.d.ts',
      import: './dist/helpers/index.js',
    })
  })

  it('tests on maintained Node versions and runs e2e before publishing', () => {
    const ci = readFileSync('.github/workflows/ci.yml', 'utf8')
    const publish = readFileSync('.github/workflows/publish.yml', 'utf8')
    expect(ci).toContain('node-version: [22, 24]')
    const steps = [
      'npm run test:coverage',
      'npm run test:e2e',
      'playwright test -c playwright.demo.config.ts --grep-invert @network',
      'npm publish',
    ].map((step) => publish.indexOf(step))
    expect(steps.every((index) => index >= 0)).toBe(true)
    expect([...steps].sort((first, second) => first - second)).toEqual(steps)
  })
})
