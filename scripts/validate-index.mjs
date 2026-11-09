#!/usr/bin/env node
/**
 * Validate the committed `index.json` the same way DSH's plugin market does.
 * Run by CI on every push and by `npm run build` indirectly.
 */
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { marketInstallTarget, parseMarketIndex } from '@deepseek-ai/dsh-plugin-market-index'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const indexUrl = process.env.INDEX_URL ?? 'https://comeonzhj.github.io/dsh-pm-plugin/index.json'
const maxIconBytes = 256 * 1024

const raw = await readFile(path.join(root, 'index.json'), 'utf8')
const document = JSON.parse(raw)
const index = parseMarketIndex(document, indexUrl)
const rawIcons = new Map(document.plugins.map((plugin) => [plugin.name, plugin.icon]))

let failures = 0
for (const plugin of index.plugins) {
  console.log(`\n${plugin.name}  (${plugin.title.zh ?? plugin.title.en})`)
  for (const version of plugin.versions) {
    const target = marketInstallTarget(plugin.name, version)
    const registry = target.registry ? ` via ${target.registry}` : ''
    console.log(`  ${version.version.padEnd(10)} dsh ${version.engines.dsh.padEnd(58)} → ${target.spec}${registry}`)
  }
  const rawIcon = rawIcons.get(plugin.name)
  if (rawIcon) {
    const iconPath = path.join(root, decodeURIComponent(rawIcon))
    try {
      const info = await stat(iconPath)
      if (info.size > maxIconBytes) throw new Error(`${info.size} bytes exceeds ${maxIconBytes}`)
      if (!/\.(svg|png|jpe?g|webp)$/i.test(iconPath)) throw new Error('unsupported icon format')
      console.log(`  icon ok: ${plugin.icon} (${info.size} bytes)`)
    } catch (error) {
      failures += 1
      console.error(`  icon FAILED: ${plugin.icon}: ${error.message}`)
    }
  }
}

if (failures) {
  console.error(`\n${failures} icon check(s) failed`)
  process.exit(1)
}
console.log(`\nindex.json is valid: ${index.plugins.length} plugins, ${index.plugins.reduce((n, p) => n + p.versions.length, 0)} versions`)
