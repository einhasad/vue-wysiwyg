import { readdirSync, readFileSync } from 'node:fs'

const sizeDir = new URL('./size/', import.meta.url)

export default readdirSync(sizeDir)
  .filter((file) => file.endsWith('.json'))
  .sort()
  .flatMap((file) => JSON.parse(readFileSync(new URL(file, sizeDir), 'utf8')))
  .map((entry) => ({ ignore: ['vue'], gzip: true, ...entry }))
