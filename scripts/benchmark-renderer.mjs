import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { cpus, totalmem } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { chromium } from 'playwright'

const url = process.env.DUST_BENCH_URL || 'http://127.0.0.1:4173/'
const output = resolve(process.env.DUST_BENCH_DIR || 'renderer-benchmark')
const viewport = { width: 1280, height: 800 }
const attempts = [
  { name: 'Chromium default', args: [] },
  { name: 'ANGLE / system OpenGL', args: ['--use-gl=angle', '--use-angle=gl', '--ignore-gpu-blocklist'] },
  {
    name: 'ANGLE / Mesa llvmpipe',
    args: ['--use-gl=angle', '--use-angle=gl', '--ignore-gpu-blocklist'],
    env: { LIBGL_ALWAYS_SOFTWARE: '1', GALLIUM_DRIVER: 'llvmpipe' },
  },
]
const report = {
  sha: process.env.GITHUB_SHA || null,
  started: new Date().toISOString(),
  viewport,
  environment: {
    os: process.platform,
    arch: process.arch,
    cpu: cpus()[0]?.model,
    logicalCPUs: cpus().length,
    memoryGiB: totalmem() / 2 ** 30,
    display: process.env.DISPLAY,
    glxinfo: spawnSync('glxinfo', ['-B'], { encoding: 'utf8', timeout: 10_000 }).stdout || null,
  },
  attempts: [],
  results: [],
  errors: [],
  comparison: [],
  success: false,
}
await mkdir(output, { recursive: true })
async function save() {
  await writeFile(join(output, 'benchmark.json'), JSON.stringify(report, null, 2))
}
let browser, page
const chooser = () => page.getByRole('button', { name: 'Settings', exact: true })
async function boot() {
  page = await browser.newPage({ viewport, deviceScaleFactor: 1 })
  page.setDefaultTimeout(55_000)
  await page.bringToFront()
  await page.goto(url, { waitUntil: 'networkidle', timeout: 100_000 })
  await page.locator('#terminal[aria-busy="false"]').waitFor()
  await page.evaluate(async () => {
    await document.fonts.ready
  })
}
async function inspectGL() {
  return page.locator('#world').evaluate((canvas) => {
    const gl = canvas.getContext('webgl2')
    if (!gl || gl.isContextLost()) return null
    const extension = gl.getExtension('WEBGL_debug_renderer_info')
    return {
      renderer: gl.getParameter(extension?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER),
      vendor: gl.getParameter(extension?.UNMASKED_VENDOR_WEBGL ?? gl.VENDOR),
      version: gl.getParameter(gl.VERSION),
      shadingLanguage: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
    }
  })
}
async function launch(option) {
  return chromium.launch({
    headless: false,
    args: ['--ozone-platform=x11', ...option.args],
    env: { ...process.env, ...option.env },
  })
}
async function selectNative() {
  for (const option of attempts) {
    const attempt = { name: option.name, args: option.args, environment: option.env ?? {} }
    report.attempts.push(attempt)
    try {
      browser = await launch(option)
      report.chromium = browser.version()
      await boot()
      attempt.adapter = await inspectGL()
      assert.ok(attempt.adapter, 'Production game did not create a WebGL2 context')
      const name = attempt.adapter.renderer
      assert.ok(!/swiftshader/i.test(name), 'Chromium selected bundled SwiftShader')
      attempt.classification = /llvmpipe|softpipe|swrast|lavapipe|software rasterizer/i.test(name)
        ? 'Mesa software'
        : /WebGL|ANGLE\s*$/i.test(name)
          ? 'Unidentified adapter'
          : 'System graphics adapter'
      console.log('ADAPTER', JSON.stringify(attempt))
      await save()
      return attempt
    } catch (error) {
      attempt.rejected = error.message
      console.log('ADAPTER', JSON.stringify(attempt))
      await browser?.close()
      browser = null
      page = null
      await save()
    }
  }
  return null
}
async function chooseCanvas() {
  if (!browser) browser = await launch(attempts[0])
  if (page) await page.close()
  await boot()
  await chooser().click()
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'load' }),
    page.locator('#render-path').selectOption('canvas'),
  ])
  await page.locator('#terminal[aria-busy="false"]').waitFor()
  await chooser().click()
  const renderer = await page
    .getByRole('dialog')
    .locator('.pref')
    .filter({ hasText: /^Renderer/ })
    .locator('small')
    .innerText()
  assert.match(renderer, /Canvas 2D/)
  assert.equal(await page.locator('#world').evaluate((c) => !!c.getContext('2d')), true)
  await page.getByRole('button', { name: 'Close dialog' }).click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
}
// Measure actual animation-frame delivery. Every interval, including stalls, contributes.
// Only ordinary HUD controls are used to supply timed attacks and guards.
async function frames(metrics) {
  return page.evaluate(
    ({ path, warmup, combat, duration, minFrames }) =>
      new Promise((resolve, reject) => {
        const canvas = document.querySelector('#world')
        const gl = path === 'WebGL2' ? canvas.getContext('webgl2') : null
        if (path === 'WebGL2' && (!gl || gl.isContextLost())) {
          reject(new Error('Live WebGL2 context required'))
          return
        }
        const sourceRect = canvas.getBoundingClientRect()
        const layout = { width: sourceRect.width, height: sourceRect.height, devicePixelRatio }
        let start,
          prev,
          lastAttack = -Infinity,
          strikes = 0
        const hud = (field) => document.querySelector(field)?.textContent.trim()
        const bossStart = hud('[data-ui="boss-pct"]'),
          speedStart = hud('#kph')
        const intervals = [],
          resolutions = []
        const timeout = setTimeout(() => reject(new Error('Animation frame sampling exceeded 90 s')), 90_000)
        function step(ts) {
          if (document.hidden || gl?.isContextLost()) {
            clearTimeout(timeout)
            reject(new Error('Foreground rendering interrupted'))
            return
          }
          if (prev !== undefined) intervals.push(ts - prev)
          start ??= ts
          prev = ts
          const width = gl ? gl.drawingBufferWidth : canvas.width,
            height = gl ? gl.drawingBufferHeight : canvas.height
          const lastSize = resolutions.at(-1)
          if (width !== lastSize?.width || height !== lastSize?.height)
            resolutions.push({ atMs: ts - start, width, height })
          if (combat) {
            const guard = document.querySelector('.combat-strip button[data-command="parry"]')
            const attack = document.querySelector('.combat-strip button[data-command="attack"]')
            if (!attack) {
              clearTimeout(timeout)
              reject(new Error('Encounter HUD disappeared'))
              return
            }
            if (!guard.disabled && guard.classList.contains('window')) guard.click()
            // Representative repeated strikes, with room between actions to measure motion and boss responses.
            if (
              (!warmup || strikes < 2) &&
              !attack.disabled &&
              ts - lastAttack >= 1250 &&
              hud('[data-ui="boss-move"]') !== 'Core exposed'
            ) {
              const before = hud('[data-ui="boss-pct"]')
              attack.click()
              lastAttack = ts
              if (hud('[data-ui="boss-pct"]') !== before) strikes++
            }
          }
          const elapsed = ts - start
          if (elapsed < duration || intervals.length < minFrames) {
            requestAnimationFrame(step)
            return
          }
          clearTimeout(timeout)
          const sorted = [...intervals].sort((a, b) => a - b)
          const pct = (p) => sorted[Math.ceil(sorted.length * p) - 1]
          resolve({
            layout,
            intervalsMs: intervals,
            resolutions,
            elapsedMs: elapsed,
            frames: intervals.length,
            meanFps: (intervals.length * 1000) / elapsed,
            p50FrameMs: pct(0.5),
            p95FrameMs: pct(0.95),
            framesWithin16_67ms: intervals.filter((value) => value <= 1000 / 60).length,
            hudFps: hud('#frame-data'),
            speedStart,
            speedEnd: hud('#kph'),
            bossStart,
            bossEnd: hud('[data-ui="boss-pct"]'),
            strikes,
          })
        }
        requestAnimationFrame(step)
      }),
    metrics,
  )
}
async function scene(path, name, combat = false) {
  const args = { path, combat }
  // At low frame rates both animation time and camera spring convergence need more wall time.
  const warm = await frames({ ...args, warmup: true, duration: 3300, minFrames: 24 })
  const sample = await frames({ ...args, warmup: false, duration: 4600, minFrames: 16 })
  if (name === 'driving')
    assert.ok(Number(sample.speedStart) > 0 && Number(sample.speedEnd) > 0, 'Vehicle must be in motion')
  if (combat) assert.ok(sample.strikes > 0, 'Timed combat sample must include a real hit')
  const entry = {
    path,
    scene: name,
    settling: { elapsedMs: warm.elapsedMs, frames: warm.frames, dimensions: warm.resolutions },
    ...sample,
  }
  report.results.push(entry)
  await save()
  console.log(
    'SAMPLE',
    JSON.stringify({
      path,
      scene: name,
      dimensions: sample.resolutions,
      frames: sample.frames,
      durationMs: sample.elapsedMs,
      meanFps: sample.meanFps,
      p50FrameMs: sample.p50FrameMs,
      p95FrameMs: sample.p95FrameMs,
    }),
  )
}
async function play(path) {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.getByRole('button', { name: /ENTER SECTOR/i }).waitFor()
  await scene(path, 'overworld')
  await page.getByRole('button', { name: /ENTER SECTOR/i }).click()
  await page.keyboard.down('w')
  await page.keyboard.down('d')
  try {
    await page.waitForFunction(() => Number(document.querySelector('#kph')?.textContent) >= 8)
    await scene(path, 'driving')
  } finally {
    await page.keyboard.up('d')
    await page.keyboard.up('w')
  }
  await page.keyboard.press('r')
  for (const [mode, name, heading] of [
    [2, 'city', /Quarry District/i],
    [3, 'industry', 'Fabrication'],
    [4, 'formation', /Quarry Warden/i],
  ]) {
    await page.keyboard.press(String(mode))
    await page.getByRole('heading', { name: heading }).waitFor()
    await scene(path, name)
  }
  await page.locator('button[data-slot="1"]').click() // ranged lead
  await page.getByRole('button', { name: /Launch incursion/i }).click()
  await page.locator('.combat-strip:visible').waitFor()
  await page.keyboard.press('e')
  await scene(path, 'combat', true)
  await page.keyboard.press('x')
  await page.locator('.raid-clock').waitFor()
  await scene(path, 'extraction')
  assert.deepEqual(errors, [], path + ' console/runtime errors: ' + JSON.stringify(errors))
}
try {
  const native = await selectNative()
  if (native) {
    try {
      await play('WebGL2')
    } catch (error) {
      report.errors.push('WebGL2: ' + error.stack)
    }
  } else report.errors.push('No system OpenGL/Mesa WebGL2 context was available on the standard runner.')
  try {
    await chooseCanvas()
    await play('Canvas 2D')
  } catch (error) {
    report.errors.push('Canvas 2D: ' + error.stack)
  }
  for (const gl of report.results.filter((r) => r.path === 'WebGL2')) {
    const canvas = report.results.find((r) => r.path === 'Canvas 2D' && r.scene === gl.scene)
    if (canvas)
      report.comparison.push({
        scene: gl.scene,
        webglMeanFps: gl.meanFps,
        canvasMeanFps: canvas.meanFps,
        webglP50Ms: gl.p50FrameMs,
        canvasP50Ms: canvas.p50FrameMs,
        webglP95Ms: gl.p95FrameMs,
        canvasP95Ms: canvas.p95FrameMs,
      })
  }
  report.success = !report.errors.length
} catch (error) {
  report.errors.push(error.stack)
} finally {
  report.finished = new Date().toISOString()
  await save()
  await browser?.close()
  if (!report.success) {
    console.error(report.errors)
    process.exitCode = 1
  }
  console.log('BENCHMARK', JSON.stringify(report.comparison))
}
