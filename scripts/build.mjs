// Bundles each script in package.json's "naiscripts" into a single NovelAI user script (.naiscript)
// with its metadata header. Pass script names to build only those: node scripts/build.mjs "Story Adventure+"
import { build } from 'esbuild'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const only = process.argv.slice(2)
const scripts = pkg.naiscripts.filter((meta) => only.length === 0 || only.includes(meta.name))
if (scripts.length === 0) throw new Error(`No script named ${only.join(', ')} in package.json`)

for (const meta of scripts) {
  const result = await build({
    entryPoints: [meta.entry],
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
    `version: ${meta.version}`,
    `author: ${meta.author}`,
    `description: ${meta.description}`,
    `memoryLimit: ${meta.memoryLimit}`,
    '---*/',
    '',
  ].join('\n')

  await mkdir(dirname(meta.output), { recursive: true })
  await writeFile(meta.output, header + result.outputFiles[0].text)
  console.log(`Built ${meta.output} (${meta.name} v${meta.version})`)
}
