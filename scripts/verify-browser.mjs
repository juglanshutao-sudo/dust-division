import assert from 'node:assert/strict'
import { createReadStream } from 'node:fs'
import { mkdir, mkdtemp, stat, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import {
  verifyOverworldChrome,
  verifyModeMotion,
  watchCombatHUD,
  verifySecuredCoreActions,
} from './verify-motion.mjs'

const dist = fileURLToPath(new URL('../dist/', import.meta.url))
const output = process.env.DUST_QA_DIR
  ? resolve(process.env.DUST_QA_DIR)
  : await mkdtemp(join(tmpdir(), 'dust-division-qa-'))
await mkdir(output, { recursive: true })

const mount = '/dust-division/'
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.wasm': 'application/wasm',
}
// A Pages repository runs below a URL prefix. Absolute asset paths should fail here as they would there.
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost')
    const pathname = decodeURIComponent(url.pathname)
    if (!pathname.startsWith(mount)) {
      res.writeHead(404).end()
      return
    }
    const filename = resolve(dist, pathname.slice(mount.length) || 'index.html')
    if (!filename.startsWith(resolve(dist) + sep)) {
      res.writeHead(400).end()
      return
    }
    const file = await stat(filename)
    if (!file.isFile()) {
      res.writeHead(404).end()
      return
    }
    res.writeHead(200, {
      'Content-Type': mime[extname(filename)] ?? 'application/octet-stream',
      'Content-Length': file.size,
    })
    createReadStream(filename)
      .on('error', () => res.destroy())
      .pipe(res)
  } catch {
    res.writeHead(404).end()
  }
})

const viewport = { width: 1280, height: 800 }
const report = {
  commit: process.env.GITHUB_SHA ?? null,
  startedAt: new Date().toISOString(),
  viewport,
  gpuRequest: process.env.DUST_GPU_BACKEND || 'system',
  success: false,
  checks: [],
  screens: [],
  console: [],
  pageErrors: [],
  requestErrors: [],
  renderErrors: [],
  pixelChecks: [],
}
let browser,
  page,
  stage = 'start'
const gpuFailure =
  /shader error|failed to (?:compile|link)|(?:GL|WebGL)_INVALID_|GL_OUT_OF_MEMORY|context (?:was )?lost/i
async function check(name, fn) {
  stage = name
  await fn()
  report.checks.push(name)
  console.log('PASS', name)
}
async function waitUI(selector, expression, value) {
  // Predicates read the same DOM text and controls exposed to the player.
  await page.waitForFunction(
    ({ selector, expression, value }) => {
      const element = document.querySelector(selector)
      if (!element) return false
      const text = element.textContent.trim()
      if (expression === 'number>') return Number.parseFloat(text) > value
      if (expression === 'number<') return Number.parseFloat(text) < value
      if (expression === 'contains') return text.includes(value)
      if (expression === 'matches') return new RegExp(value).test(text)
      return text === value
    },
    { selector, expression, value },
    { timeout: 50_000 },
  )
}
async function sampleFrames() {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const intervals = []
        let previous
        const start = performance.now()
        const deadline = setTimeout(() => reject(new Error('Animation frame sampler timed out')), 40_000)
        function frame(now) {
          if (previous !== undefined) intervals.push(now - previous)
          previous = now
          if (now - start < 1900 || intervals.length < 10) {
            requestAnimationFrame(frame)
            return
          }
          clearTimeout(deadline)
          const sorted = [...intervals].sort((a, b) => a - b)
          const duration = intervals.reduce((sum, value) => sum + value, 0)
          const round = (value) => Number(value.toFixed(2))
          resolve({
            frames: intervals.length,
            durationMs: round(duration),
            meanFps: round((intervals.length * 1000) / duration),
            medianFrameMs: round(sorted[Math.floor(sorted.length / 2)]),
            p95FrameMs: round(sorted[Math.ceil(sorted.length * 0.95) - 1]),
          })
        }
        requestAnimationFrame(frame)
      }),
  )
}
// These samples use the final compositor output. Reading the WebGL drawing buffer after
// presentation can return cleared pixels, even when the user actually saw a correct frame.
const sceneProbes = {
  '01-hero': { region: [0.43, 0.43, 0.77, 0.74], changed: 0.35, darkened: 0.25 },
  '03-city': { region: [0.22, 0.26, 0.78, 0.75], changed: 0.45 },
  '04-industry': { region: [0.22, 0.26, 0.78, 0.75], changed: 0.45 },
  '04-industry-low': { region: [0.22, 0.26, 0.78, 0.75], changed: 0.45 },
}
async function checkScenePixels(name) {
  const probe = sceneProbes[name]
  if (!probe) return
  const canvas = page.locator('#world')
  // Let the camera converge and enter the static geometry cache. Both a minimum
  // number of presented frames and elapsed time matter on the CI software adapter.
  await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        let frames = 0
        const start = performance.now()
        const deadline = setTimeout(
          () => reject(new Error('World presentation stopped while settling')),
          90_000,
        )
        const frame = (now) => {
          if (++frames >= 36 && now - start >= 2600) {
            clearTimeout(deadline)
            resolve()
          } else requestAnimationFrame(frame)
        }
        requestAnimationFrame(frame)
      }),
  )
  const bounds = await canvas.boundingBox()
  assert.ok(bounds && bounds.width > 0 && bounds.height > 0, 'World canvas must have visible bounds')
  const [left, top, right, bottom] = probe.region
  const clip = {
    x: Math.round(bounds.x + left * bounds.width),
    y: Math.round(bounds.y + top * bounds.height),
    width: Math.floor((right - left) * bounds.width),
    height: Math.floor((bottom - top) * bounds.height),
  }
  // Omit overlay lettering, map markers, module selection and the loading illustration
  // from both images so they cannot pass the geometry check on their own.
  const clean =
    '#overworld,#mode-hud,#standby-rover,#reticle,#touch-controls,#notice{visibility:hidden!important}'
  const picture = await page.screenshot({ clip, style: clean, timeout: 60_000 })
  const backdrop = await page.screenshot({
    clip,
    style: clean + '#world{visibility:hidden!important}',
    timeout: 60_000,
  })
  const metrics = await page.evaluate(
    async ({ foreground, underlay }) => {
      async function pixels(source) {
        const bytes = Uint8Array.from(atob(source), (c) => c.charCodeAt(0))
        const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
        const canvas = document.createElement('canvas')
        canvas.width = bitmap.width
        canvas.height = bitmap.height
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        ctx.drawImage(bitmap, 0, 0)
        bitmap.close()
        return ctx.getImageData(0, 0, canvas.width, canvas.height)
      }
      const [scene, base] = await Promise.all([pixels(foreground), pixels(underlay)])
      if (scene.width !== base.width || scene.height !== base.height)
        throw new Error('Pixel probe size mismatch')
      const luminance = (data, i) => data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722
      const a = scene.data,
        b = base.data
      let changed = 0,
        darker = 0,
        edges = 0,
        sum = 0,
        sumSquares = 0,
        count = 0
      for (let y = 0; y < scene.height - 3; y += 2) {
        for (let x = 0; x < scene.width - 3; x += 2) {
          const i = (y * scene.width + x) * 4,
            level = luminance(a, i)
          if (
            Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])) > 24
          )
            changed++
          if (luminance(b, i) - level > 32) darker++
          const horizontal = Math.abs(level - luminance(a, i + 12))
          const vertical = Math.abs(level - luminance(a, i + scene.width * 12))
          if (Math.max(horizontal, vertical) > 20) edges++
          sum += level
          sumSquares += level * level
          count++
        }
      }
      return {
        sampledPixels: count,
        changed: changed / count,
        darkened: darker / count,
        edgeFraction: edges / count,
        luminanceDeviation: Math.sqrt(Math.max(0, sumSquares / count - (sum / count) ** 2)),
      }
    },
    { foreground: picture.toString('base64'), underlay: backdrop.toString('base64') },
  )
  const valid =
    metrics.changed >= probe.changed &&
    metrics.darkened >= (probe.darkened ?? 0) &&
    metrics.edgeFraction >= 0.03 &&
    metrics.luminanceDeviation >= 12
  const record = { name, clip, metrics, valid }
  report.pixelChecks.push(record)
  console.log('PIXELS', JSON.stringify(record))
  if (!valid) {
    await Promise.all([
      writeFile(join(output, name + '-failed-scene.png'), picture),
      writeFile(join(output, name + '-underlay.png'), backdrop),
    ])
    assert.fail('Rendered world geometry missing or blank: ' + JSON.stringify(record))
  }
}
async function verifyLowTier() {
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.locator('#quality').selectOption('low')
  await page.getByRole('button', { name: 'Close dialog' }).click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  await checkScenePixels('04-industry-low')
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.locator('#quality').selectOption('auto')
  await page.getByRole('button', { name: 'Close dialog' }).click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
}
async function capture(name) {
  await checkScenePixels(name)
  const timing = await sampleFrames()
  const hudFps = await page.locator('#frame-data').innerText()
  await page.screenshot({ path: join(output, name + '.png'), timeout: 60_000 })
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  const settings = page.getByRole('dialog')
  await settings.waitFor()
  const renderer = await settings
    .locator('.pref')
    .filter({ hasText: 'Renderer' })
    .locator('small')
    .innerText()
  assert.match(renderer, /WebGL 2/i, 'Unexpected renderer in the public Settings panel')
  const counts = await settings
    .locator('.pref')
    .filter({ hasText: 'Draw calls / triangles' })
    .locator('small')
    .innerText()
  const [drawCalls, triangles] = counts.split('/').map((token) => Number(token.replaceAll(',', '').trim()))
  const cachedMode = /hero|city|industry|return|mobile/.test(name)
  assert.ok(
    drawCalls >= 1 && triangles >= (cachedMode ? 0 : 200),
    'Expected a presented frame from the WebGL2 pipeline',
  )
  await settings.getByRole('button', { name: 'Close dialog' }).click()
  await settings.waitFor({ state: 'hidden' })
  const result = { name, renderer, drawCalls, triangles, hudFps, timing, viewport: page.viewportSize() }
  report.screens.push(result)
  console.log(
    'SCREEN',
    JSON.stringify({
      ...result,
      pageErrors: report.pageErrors,
      renderErrors: report.renderErrors,
      requestErrors: report.requestErrors,
    }),
  )
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2))
}
function listen(page) {
  page.on('pageerror', (error) => report.pageErrors.push(error.stack || error.message))
  page.on('console', (msg) => {
    const item = { type: msg.type(), text: msg.text(), source: msg.location().url }
    report.console.push(item)
    if (msg.type() === 'error' || gpuFailure.test(item.text)) report.renderErrors.push(item)
  })
  page.on('requestfailed', (req) =>
    report.requestErrors.push({ url: req.url(), failure: req.failure()?.errorText }),
  )
  page.on('response', (response) => {
    if (response.status() >= 400)
      report.requestErrors.push({ url: response.url(), status: response.status() })
  })
}
function button(name) {
  return page.getByRole('button', { name, exact: true })
}
async function pressMode(n, heading) {
  await page.keyboard.press(String(n))
  await page.locator('#terminal[data-mode="' + n + '"]').waitFor()
  await page.getByRole('heading', { name: heading }).waitFor()
}
try {
  assert.ok((await stat(join(dist, 'index.html'))).isFile(), 'Run npm run build before browser validation')
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const args = ['--enable-webgl', '--ignore-gpu-blocklist']
  if (process.env.DUST_GPU_BACKEND === 'swiftshader')
    args.push('--use-angle=swiftshader', '--enable-unsafe-swiftshader')
  browser = await chromium.launch({ args })
  report.chromium = browser.version()
  page = await browser.newPage({ viewport, deviceScaleFactor: 1 })
  page.setDefaultTimeout(50_000)
  listen(page)
  await page.goto('http://127.0.0.1:' + server.address().port + mount, {
    waitUntil: 'networkidle',
    timeout: 120_000,
  })
  await check('Booted real WebGL2 under a repository subpath', async () => {
    await page.locator('#terminal[aria-busy="false"]').waitFor()
    assert.ok(await button(/ENTER SECTOR/i).isEnabled())
    report.gpu = await page.locator('#world').evaluate((canvas) => {
      const gl = canvas.getContext('webgl2')
      if (!gl || gl.isContextLost()) return null
      const ext = gl.getExtension('WEBGL_debug_renderer_info')
      return {
        renderer: gl.getParameter(ext?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER),
        vendor: gl.getParameter(ext?.UNMASKED_VENDOR_WEBGL ?? gl.VENDOR),
        glVersion: gl.getParameter(gl.VERSION),
        shadingLanguage: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
      }
    })
    assert.ok(report.gpu, 'The shipped canvas must have a live WebGL2 context')
    await page.evaluate(() => document.fonts.ready)
    await capture('01-hero')
  })
  await check(
    'Kept the scene visible beneath readable overworld chrome and distinct HUD transitions',
    async () => {
      report.overworldChrome = await verifyOverworldChrome(page)
      report.modeMotion = await verifyModeMotion(page)
      console.log('MOTION', JSON.stringify(report.modeMotion))
    },
  )
  await check('Drove and parked from the overworld', async () => {
    await button(/ENTER SECTOR/i).click()
    await page.keyboard.down('w')
    try {
      await waitUI('#kph', 'number>', 12)
    } finally {
      await page.keyboard.up('w')
    }
    await capture('02-driving')
    await page.keyboard.press('r')
    await button(/ENTER SECTOR/i).waitFor()
  })
  await check('Opened the city and entered its Switchyard', async () => {
    await pressMode(2, /Quarry District/i)
    await capture('03-city')
    await page.locator('button[data-district="yard"]').click()
    await page.getByRole('heading', { name: 'Fabrication' }).waitFor()
    await pressMode(2, /Quarry District/i)
    await pressMode(3, 'Fabrication')
  })
  await check('Placed and reclaimed a live power module', async () => {
    await page.locator('button[data-kind="generator"]').click()
    // E4 is an initially empty cell beside the production line.
    const empty = button('E4 · Empty footprint')
    await empty.waitFor()
    await empty.focus()
    await page.keyboard.press('Enter')
    await button('E4 · Generator').waitFor()
    await waitUI('[data-ui="supply"]', 'contains', '16 MW')
    await capture('04-industry')
    await verifyLowTier()
    await button('Remove').click()
    await button('E4 · Empty footprint').waitFor()
    await waitUI('[data-ui="supply"]', 'contains', '8 MW')
  })
  await check('Changed the squad lead and deployed', async () => {
    await pressMode(4, /Quarry Warden/i)
    await page.locator('button[data-slot="1"]').click()
    await waitUI('[data-ui="bond"]', 'equals', 'Induction')
    await page.locator('[data-tile="1"]').click()
    await waitUI('[data-ui="link-style"]', 'equals', 'Line')
    await capture('05-formation')
    await button(/Launch incursion/i).click()
    await waitUI('[data-ui="arena-status"]', 'contains', 'Exclusion zone')
    await page.keyboard.press('e')
    await waitUI('#notice', 'contains', 'Recovered 8 alloy')
    await page.keyboard.press('j')
    await waitUI('[data-ui="boss-pct"]', 'number<', 100)
  })
  await check('Parried a telegraphed strike, broke all armour phases and executed the Warden', async () => {
    // The software renderer may show only a single frame of the parry cue. React to the
    // visible HUD on that frame, through the ordinary Parry button handler.
    const [fight, hud] = await Promise.all([
      page.evaluate(
        () =>
          new Promise((resolve, reject) => {
            const start = performance.now(),
              phases = new Set(),
              moves = new Set()
            let parried = false,
              parryAttempts = 0,
              strikes = 0,
              swaps = 0
            const result = () => ({
              phases: [...phases],
              moves: [...moves],
              parried,
              parryAttempts,
              strikes,
              swaps,
            })
            const text = (key) => document.querySelector('[data-ui="' + key + '"]')?.textContent.trim()
            const command = (name) =>
              document.querySelector('.combat-strip button[data-command="' + name + '"]')
            const deadline = setTimeout(
              () => reject(new Error('Combat timed out: ' + JSON.stringify(result()))),
              105_000,
            )
            const end = (fn, data) => {
              clearTimeout(deadline)
              fn(data)
            }
            function play() {
              const attack = command('attack'),
                guard = command('parry'),
                finish = command('finish')
              if (!attack || !guard || !finish) {
                end(reject, new Error('Encounter ended before execution: ' + JSON.stringify(result())))
                return
              }
              const phase = text('phase'),
                move = text('boss-move')
              if (phase) phases.add(phase.split(' / ')[0])
              if (move) moves.add(move)
              if (!parried) {
                if (
                  document.querySelector('#notice')?.textContent.includes('Perfect parry') &&
                  move === 'Staggered'
                )
                  parried = true
                else if (!guard.disabled && text('boss-window') === 'PARRY') {
                  guard.click()
                  parryAttempts++
                }
              }
              if (parried) {
                if (!finish.disabled && move === 'Core exposed') {
                  end(resolve, result())
                  return
                }
                if (!attack.disabled) {
                  const before = text('boss-pct')
                  attack.click()
                  if (before !== text('boss-pct')) strikes++
                } else {
                  const slots = Array.from(document.querySelectorAll('button[data-slot]'))
                  const active = slots.findIndex((slot) => slot.getAttribute('aria-pressed') === 'true')
                  const next = slots[(active + 1) % slots.length]
                  if (next && !next.disabled) {
                    next.click()
                    swaps++
                  }
                }
              }
              if (performance.now() - start < 105_000) requestAnimationFrame(play)
            }
            requestAnimationFrame(play)
          }),
      ),
      watchCombatHUD(page),
    ])
    report.combatHud = hud
    console.log('COMBAT HUD', JSON.stringify(hud))
    assert.deepEqual(hud.violations, [])
    assert.ok(hud.hot > 0 && hud.cold > 0 && hud.bonds.includes('Induction / Line'))
    assert.ok(
      hud.cooldowns.parry?.length >= 2 && hud.cooldowns.attack?.length >= 1,
      'Cooldown bars must track live timers',
    )
    report.combat = fight
    console.log('COMBAT', JSON.stringify(fight))
    assert.deepEqual(fight.phases, ['P1', 'P2', 'P3'])
    assert.ok(fight.parried && fight.parryAttempts && fight.strikes > 1 && fight.swaps > 0)
    await capture('06-combat')
    report.combatHud.securedCore = await verifySecuredCoreActions(page)
    console.log('SECURED CORE HUD', JSON.stringify(report.combatHud.securedCore))
  })
  await check('Followed the landing-zone bearing and banked the Warden core', async () => {
    await page.keyboard.press('x')
    await waitUI('[data-ui="loot"]', 'equals', '32')
    await waitUI('[data-ui="evac"]', 'contains', 'Beacon active')
    await capture('07-extraction')
    const held = new Set(),
      route = [],
      deadline = Date.now() + 75_000
    try {
      let reached = false
      while (Date.now() < deadline) {
        const nav = await page.evaluate(() => ({
          range: document.querySelector('[data-ui="evac-range"]')?.textContent,
          bearing: document.querySelector('[data-ui="evac-bearing"]')?.textContent,
          settled: document.querySelector('.city-dispatch .mh-cap')?.textContent === 'Cargo banked',
        }))
        if (nav.settled || nav.range === 'Hold position') {
          reached = true
          break
        }
        assert.ok(nav.range && nav.bearing, 'Landing-zone HUD missing: ' + JSON.stringify(nav))
        const degrees = nav.bearing.match(/([0-9]+(?:\.[0-9]+)?)\s*°/)
        assert.ok(degrees, 'Bearing must include a heading in degrees: ' + nav.bearing)
        const theta = (Number(degrees[1]) * Math.PI) / 180,
          dx = Math.sin(theta),
          north = Math.cos(theta)
        const next = new Set()
        if (Math.abs(dx) > 0.38) next.add(dx > 0 ? 'd' : 'a')
        if (Math.abs(north) > 0.38) next.add(north > 0 ? 'w' : 's')
        for (const key of held)
          if (!next.has(key)) {
            await page.keyboard.up(key)
            held.delete(key)
          }
        for (const key of next)
          if (!held.has(key)) {
            await page.keyboard.down(key)
            held.add(key)
          }
        const waypoint = [nav.range, nav.bearing, [...held].join('+')].join(' / ')
        if (route[route.length - 1] !== waypoint) route.push(waypoint)
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)))
      }
      assert.ok(reached, 'Landing zone not reached: ' + JSON.stringify(route))
    } finally {
      for (const key of held) await page.keyboard.up(key)
      report.extractionRoute = route
      console.log('ROUTE', JSON.stringify(route))
    }
    await waitUI('.city-dispatch .mh-cap', 'equals', 'Cargo banked')
    await waitUI('.city-dispatch [data-ui="event"]', 'contains', '+32 alloy / +1 core')
    await capture('08-return')
  })
  await check('Opened a fresh touch viewport', async () => {
    const url = page.url()
    await page.close()
    page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
    })
    page.setDefaultTimeout(50_000)
    listen(page)
    await page.goto(url, { waitUntil: 'networkidle', timeout: 120_000 })
    await page.locator('#terminal[aria-busy="false"]').waitFor()
    await button(/ENTER SECTOR/i).waitFor()
    await capture('09-mobile-hero')
    await button(/ENTER SECTOR/i).tap()
    await page.getByRole('button', { name: 'Move forward', exact: true }).waitFor()
    await button('Settings').click()
    await button('RECORD 10 S').click()
    await waitUI('#notice', 'contains', 'Frame sample saved')
    await button('Settings').click()
    await button('Export JSON').waitFor()
    assert.match(await page.locator('.sample-result').innerText(), /FPS · P95/)
    await button('Close dialog').click()
  })
  await check('Rendered all scenes without console, shader, runtime or asset errors', async () => {
    assert.equal(report.pageErrors.length, 0, JSON.stringify(report.pageErrors))
    assert.equal(report.renderErrors.length, 0, JSON.stringify(report.renderErrors))
    assert.equal(report.requestErrors.length, 0, JSON.stringify(report.requestErrors))
  })
  report.success = true
} catch (error) {
  report.failure = { stage, message: error.stack ?? String(error) }
  console.error(report.failure)
  if (page) await page.screenshot({ path: join(output, 'failure.png'), timeout: 15_000 }).catch(() => {})
  process.exitCode = 1
} finally {
  await browser?.close()
  server.closeAllConnections()
  if (server.listening) await new Promise((resolve) => server.close(resolve))
  report.finishedAt = new Date().toISOString()
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2))
  console.log('Browser evidence:', output)
}
