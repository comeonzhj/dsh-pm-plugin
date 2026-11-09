#!/usr/bin/env node
/**
 * Build `index.json` for the dsh-pm-plugin market index.
 *
 * Sources are declared in `scripts/plugins.json`. For Git sources the version list is
 * resolved from release tags (commit + commit date + manifest at that commit); for npm
 * sources it is resolved from the public registry document. Display metadata (title,
 * description, icon, links) is curated in `scripts/plugins.json`.
 *
 * The result is validated with @deepseek-ai/dsh-plugin-market-index before it is written,
 * so a broken index can never be published by this script.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { marketInstallTarget, parseMarketIndex } from '@deepseek-ai/dsh-plugin-market-index'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const cacheDir = path.join(root, 'scripts', '.cache')
const indexUrl = process.env.INDEX_URL ?? 'https://comeonzhj.github.io/dsh-pm-plugin/index.json'
const registry = process.env.NPM_REGISTRY ?? 'https://registry.npmjs.org'
const maxIconBytes = 256 * 1024
const githubToken = process.env.GITHUB_TOKEN ?? ghToken()

const config = JSON.parse(await readFile(path.join(root, 'scripts', 'plugins.json'), 'utf8'))

function ghToken() {
  try {
    return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** GET a URL as JSON, with retries and an on-disk cache so reruns survive flaky networks. */
async function getJson(url) {
  const cacheFile = path.join(cacheDir, `${createHash('sha256').update(url).digest('hex').slice(0, 32)}.json`)
  let lastError
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const headers = { 'user-agent': 'dsh-pm-plugin-index' }
      if (githubToken && url.startsWith('https://api.github.com/')) headers.authorization = `Bearer ${githubToken}`
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(60_000) })
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
      const text = await response.text()
      JSON.parse(text) // fail fast on malformed payloads
      await mkdir(cacheDir, { recursive: true })
      await writeFile(cacheFile, text)
      return JSON.parse(text)
    } catch (error) {
      lastError = error
      await sleep(600 * (attempt + 1))
    }
  }
  try {
    return JSON.parse(await readFile(cacheFile, 'utf8'))
  } catch {
    throw new Error(`GET ${url} failed: ${lastError?.message ?? 'unknown error'}`)
  }
}

/** Derive the `engines.dsh` range the reference generator would use. */
function deriveEngines(manifest) {
  const declared = manifest.engines?.dsh
  if (typeof declared === 'string' && declared.trim()) return declared.trim()
  const ranges = []
  for (const [name, range] of Object.entries(manifest.peerDependencies ?? {})) {
    if (name !== '@deepseek-ai/dsh' && !name.startsWith('@deepseek-ai/dsh-')) continue
    if (typeof range !== 'string' || !range.trim()) continue
    if (/^workspace:/.test(range)) continue // the running DSH version: no extra constraint
    if (!ranges.includes(range)) ranges.push(range)
  }
  return ranges.length ? ranges.join(' ') : '*'
}

function parseRepo(repoUrl) {
  const match = repoUrl.match(/^https:\/\/github\.com\/([^/]+)\/([^/.#]+)(?:\.git)?$/)
  if (!match) throw new Error(`unsupported Git source: ${repoUrl}`)
  return { owner: match[1], repo: match[2] }
}

function assertVersion(manifest, plugin, expected) {
  if (manifest.name !== plugin.name) {
    throw new Error(`${plugin.name}: manifest name ${manifest.name} does not match`)
  }
  if (expected && manifest.version !== expected) {
    throw new Error(`${plugin.name}: tag version ${expected} does not match manifest ${manifest.version}`)
  }
  if (!manifest.dsh?.bundle) throw new Error(`${plugin.name}@${manifest.version}: not a DSH bundle`)
}

async function gitVersions(plugin) {
  const { owner, repo } = parseRepo(plugin.source.repo)
  const versions = []
  for (const tag of plugin.versions) {
    const commit = await getJson(`https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(tag)}`)
    const sha = commit.sha
    const manifest = await getJson(`https://raw.githubusercontent.com/${owner}/${repo}/${sha}/package.json`)
    assertVersion(manifest, plugin, manifest.version)
    versions.push({
      version: manifest.version,
      publishTimestamp: Math.floor(Date.parse(commit.commit.committer.date) / 1000),
      source: { type: 'git', url: plugin.source.repo, commit: sha },
      engines: { dsh: deriveEngines(manifest) },
    })
  }
  return versions
}

async function npmVersions(plugin) {
  const packageName = plugin.source.package
  const doc = await getJson(`${registry}/${packageName.replace('/', '%2f')}`)
  const versions = plugin.versions.map((version) => {
    const manifest = doc.versions?.[version]
    const publishedAt = doc.time?.[version]
    if (!manifest) throw new Error(`${packageName}@${version}: not found in registry document`)
    if (!publishedAt) throw new Error(`${packageName}@${version}: no publish time`)
    assertVersion(manifest, plugin, version)
    return {
      version,
      publishTimestamp: Math.floor(Date.parse(publishedAt) / 1000),
      source: { type: 'npm' },
      engines: { dsh: deriveEngines(manifest) },
    }
  })
  const distTags = {}
  for (const [name, version] of Object.entries(doc['dist-tags'] ?? {})) {
    if (plugin.versions.includes(version)) distTags[name] = version
  }
  return { versions, distTags: Object.keys(distTags).length ? distTags : undefined }
}

async function checkIcon(plugin) {
  const iconPath = path.join(root, plugin.icon)
  const info = await stat(iconPath)
  if (!info.isFile()) throw new Error(`${plugin.name}: icon ${plugin.icon} is not a file`)
  if (info.size > maxIconBytes) throw new Error(`${plugin.name}: icon ${plugin.icon} exceeds ${maxIconBytes} bytes`)
  if (!/\.(svg|png|jpe?g|webp)$/i.test(plugin.icon)) throw new Error(`${plugin.name}: unsupported icon format`)
}

const index = {
  format: 1,
  title: config.market.title,
  description: config.market.description,
  metadata: config.market.metadata,
  plugins: [],
}

for (const plugin of config.plugins) {
  await checkIcon(plugin)
  const { versions, distTags } = plugin.source.type === 'git' ? { versions: await gitVersions(plugin) } : await npmVersions(plugin)
  const entry = {
    name: plugin.name,
    title: plugin.title,
    description: plugin.description,
    icon: plugin.icon,
    author: plugin.author,
    homepage: plugin.homepage,
    repository: plugin.repository,
    metadata: {
      category: plugin.category,
      labels: plugin.labels,
      keywords: plugin.keywords,
    },
  }
  if (distTags) entry['dist-tags'] = distTags
  entry.versions = versions
  index.plugins.push(entry)
  console.log(`✓ ${plugin.name}: ${versions.map((v) => v.version).join(', ')}`)
}

// Validate before writing: relative icons resolve against the published index URL.
const parsed = parseMarketIndex(index, indexUrl)
for (const plugin of parsed.plugins) {
  for (const version of plugin.versions) marketInstallTarget(plugin.name, version)
}

await writeFile(path.join(root, 'index.json'), `${JSON.stringify(index, null, 2)}\n`)
console.log(`\nWrote index.json: ${parsed.plugins.length} plugins, ${parsed.plugins.reduce((n, p) => n + p.versions.length, 0)} versions`)
