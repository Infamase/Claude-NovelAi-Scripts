// Bundles src/ into a single NovelAI user script (.naiscript) with its metadata header.
import { build } from 'esbuild'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const meta = pkg.naiscript

const result = await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  charset: 'utf8',
  legalComments: 'none',
  write: false,
})

// NovelAI reads this YAML-style block to show the script's name, version and author.
const header = [
  '/*---',
  'compatibilityVersion: naiscript-1.0',
  `id: ${meta.id}`,
  `name: ${meta.name}`,
  `createdAt: ${meta.createdAt}`,
  `updatedAt: ${Date.now()}`,
  `version: ${pkg.version}`,
  `author: ${meta.author}`,
  `description: ${meta.description}`,
  `memoryLimit: ${meta.memoryLimit}`,
  '---*/',
  '',
].join('\n')

await mkdir(dirname(meta.output), { recursive: true })
await writeFile(meta.output, header + result.outputFiles[0].text)
console.log(`Built ${meta.output} (v${pkg.version})`)
