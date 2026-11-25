import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

const port = process.env.SMOKE_PORT ?? '4173'
const origin = `http://127.0.0.1:${port}`
const server = spawn(
  process.execPath,
  [
    'node_modules/vite/bin/vite.js',
    'preview',
    '--host',
    '127.0.0.1',
    '--port',
    port,
    '--strictPort',
  ],
  { stdio: 'ignore' },
)

try {
  let page
  let lastError
  const deadline = Date.now() + 20_000

  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Vite preview exited with code ${server.exitCode}.`)
    }

    try {
      page = await fetch(origin, { signal: AbortSignal.timeout(1_000) })
      break
    } catch (error) {
      lastError = error
      await delay(250)
    }
  }

  if (!page) {
    throw new Error(`Vite preview did not become ready: ${lastError}`)
  }
  if (!page.ok) {
    throw new Error(`Home page returned HTTP ${page.status}.`)
  }

  const html = await page.text()
  if (!html.includes('<title>Fish')) {
    throw new Error('The production page does not include the Fish page title.')
  }

  const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)]
    .map((match) => match[1])
    .filter((asset) => asset.startsWith('/'))

  if (assets.length === 0) {
    throw new Error('The production page does not reference any built JS or CSS assets.')
  }

  for (const asset of assets) {
    const response = await fetch(new URL(asset, origin))
    if (!response.ok) {
      throw new Error(`Built asset ${asset} returned HTTP ${response.status}.`)
    }
  }

  console.log(`Production smoke check passed: home page and ${assets.length} built assets responded.`)
} finally {
  if (server.exitCode === null) {
    server.kill()
    await Promise.race([
      new Promise((resolve) => server.once('exit', resolve)),
      delay(2_000),
    ])
  }
}
