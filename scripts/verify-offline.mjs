import assert from 'node:assert/strict'
import { stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

const filename = process.argv[2]
assert.ok(filename, 'Pass the standalone HTML file to verify')
assert.ok((await stat(filename)).isFile())
const entry = pathToFileURL(resolve(filename)).href
const args = ['--enable-webgl', '--ignore-gpu-blocklist']
if (process.env.DUST_GPU_BACKEND === 'swiftshader') {
  args.push('--use-angle=swiftshader', '--enable-unsafe-swiftshader')
}

const browser = await chromium.launch({ args })
try {
  const context = await browser.newContext({ offline: true, viewport: { width: 800, height: 500 } })
  const page = await context.newPage()
  page.setDefaultTimeout(12_000)
  const errors = []
  context.on('request', (request) => {
    const url = request.url()
    if (url !== entry && !/^(data|blob):/.test(url)) errors.push(`External dependency: ${url.slice(0, 200)}`)
  })
  context.on('requestfailed', (request) =>
    errors.push(`Failed ${request.resourceType()}: ${request.failure()?.errorText}`),
  )
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('websocket', (socket) => errors.push(`Unexpected WebSocket: ${socket.url()}`))
  page.on('console', (msg) => {
    if (
      msg.type() === 'error' ||
      /shader error|failed to (?:compile|link)|context (?:was )?lost/i.test(msg.text())
    ) {
      errors.push(msg.text().slice(0, 600))
    }
  })

  await page.goto(entry, { waitUntil: 'domcontentloaded' })
  await page.locator('#terminal[aria-busy="false"]').waitFor()
  assert.equal(await page.evaluate(() => navigator.onLine), false)
  const glVersion = await page.locator('#world').evaluate((canvas) => {
    const gl = canvas.getContext('webgl2')
    return gl && !gl.isContextLost() ? gl.getParameter(gl.VERSION) : null
  })
  assert.match(glVersion ?? '', /WebGL 2/, 'Expected a live WebGL2 renderer in the standalone build')
  await page.locator('#modes-nav button[data-mode="2"]').click()
  await page.locator('#terminal[data-mode="2"]').waitFor()
  await page.getByRole('heading', { name: /Quarry District/i }).waitFor()
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  )
  assert.deepEqual(errors, [], 'Standalone document must render without errors or external dependencies')
  console.log(`PASS offline file boot and city interaction · ${glVersion} · no external requests`)
} finally {
  await browser.close()
}
