import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const output = process.env.DUST_QA_DIR
  ? resolve(process.env.DUST_QA_DIR)
  : await mkdtemp(join(tmpdir(), 'dust-division-qa-'));
await mkdir(output, { recursive: true });

const mount = '/dust-division/';
const mime = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.wasm': 'application/wasm',
};
// A Pages repository runs below a URL prefix. Absolute asset paths should fail here as they would there.
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);
    if (!pathname.startsWith(mount)) { res.writeHead(404).end(); return; }
    const filename = resolve(dist, pathname.slice(mount.length) || 'index.html');
    if (!filename.startsWith(resolve(dist) + sep)) { res.writeHead(400).end(); return; }
    const file = await stat(filename);
    if (!file.isFile()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': mime[extname(filename)] ?? 'application/octet-stream', 'Content-Length': file.size });
    createReadStream(filename).on('error', () => res.destroy()).pipe(res);
  } catch { res.writeHead(404).end(); }
});

const viewport = { width: 1280, height: 800 };
const report = {
  commit: process.env.GITHUB_SHA ?? null,
  startedAt: new Date().toISOString(), viewport, gpuRequest: process.env.DUST_GPU_BACKEND || 'system',
  success: false, checks: [], screens: [], console: [], pageErrors: [], requestErrors: [], renderErrors: [],
};
let browser, page, stage = 'start';
const gpuFailure = /shader error|failed to (?:compile|link)|(?:GL|WebGL)_INVALID_|GL_OUT_OF_MEMORY|context (?:was )?lost/i;
async function check(name, fn) {
  stage = name;
  await fn();
  report.checks.push(name);
  console.log('PASS', name);
}
async function waitUI(selector, expression, value) {
  // Predicates read the same DOM text and controls exposed to the player.
  await page.waitForFunction(({ selector, expression, value }) => {
    const element = document.querySelector(selector);
    if (!element) return false;
    const text = element.textContent.trim();
    if (expression === 'number>') return Number.parseFloat(text) > value;
    if (expression === 'number<') return Number.parseFloat(text) < value;
    if (expression === 'contains') return text.includes(value);
    if (expression === 'matches') return new RegExp(value).test(text);
    return text === value;
  }, { selector, expression, value }, { timeout: 50_000 });
}
async function sampleFrames() {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const intervals = [];
    let previous;
    const start = performance.now();
    const deadline = setTimeout(() => reject(new Error('Animation frame sampler timed out')), 40_000);
    function frame(now) {
      if (previous !== undefined) intervals.push(now - previous);
      previous = now;
      if (now - start < 1900 || intervals.length < 10) {
        requestAnimationFrame(frame);
        return;
      }
      clearTimeout(deadline);
      const sorted = [...intervals].sort((a, b) => a - b);
      const duration = intervals.reduce((sum, value) => sum + value, 0);
      const round = value => Number(value.toFixed(2));
      resolve({
        frames: intervals.length, durationMs: round(duration), meanFps: round(intervals.length * 1000 / duration),
        medianFrameMs: round(sorted[Math.floor(sorted.length / 2)]), p95FrameMs: round(sorted[Math.ceil(sorted.length * .95) - 1]),
      });
    }
    requestAnimationFrame(frame);
  }));
}
async function capture(name, { measure = true } = {}) {
  const timing = measure ? await sampleFrames() : null;
  const hudFps = await page.locator('#frame-data').innerText();
  await page.screenshot({ path: join(output, name + '.png'), timeout: 60_000 });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const settings = page.getByRole('dialog');
  await settings.waitFor();
  const renderer = await settings.locator('.pref').filter({ hasText: 'Renderer' }).locator('small').innerText();
  assert.match(renderer, /WebGL 2/i, 'Unexpected renderer in the public Settings panel');
  const counts = await settings.locator('.pref').filter({ hasText: 'Draw calls / triangles' }).locator('small').innerText();
  const [drawCalls, triangles] = counts.split('/').map(token => Number(token.replaceAll(',', '').trim()));
  assert.ok(drawCalls > 1 && triangles > 200, 'Renderer must draw the 3D scene');
  await settings.getByRole('button', { name: 'Close dialog' }).click();
  await settings.waitFor({ state: 'hidden' });
  report.screens.push({ name, renderer, drawCalls, triangles, hudFps, timing });
}
function button(name) { return page.getByRole('button', { name, exact: true }); }
async function pressMode(n, heading) {
  await page.keyboard.press(String(n));
  await page.locator('#terminal[data-mode="' + n + '"]').waitFor();
  await page.getByRole('heading', { name: heading }).waitFor();
}
try {
  assert.ok((await stat(join(dist, 'index.html'))).isFile(), 'Run npm run build before browser validation');
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const args = ['--enable-webgl', '--ignore-gpu-blocklist'];
  if (process.env.DUST_GPU_BACKEND === 'swiftshader') args.push('--use-angle=swiftshader', '--enable-unsafe-swiftshader');
  browser = await chromium.launch({ args });
  report.chromium = browser.version();
  page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  page.setDefaultTimeout(50_000);
  page.on('pageerror', error => report.pageErrors.push(error.stack || error.message));
  page.on('console', msg => {
    const item = { type: msg.type(), text: msg.text(), source: msg.location().url };
    report.console.push(item);
    if (msg.type() === 'error' || gpuFailure.test(item.text)) report.renderErrors.push(item);
  });
  page.on('requestfailed', req => report.requestErrors.push({ url: req.url(), failure: req.failure()?.errorText }));
  page.on('response', response => {
    if (response.status() >= 400) report.requestErrors.push({ url: response.url(), status: response.status() });
  });
  await page.goto('http://127.0.0.1:' + server.address().port + mount, { waitUntil: 'networkidle', timeout: 120_000 });
  await check('Booted real WebGL2 under a repository subpath', async () => {
    await page.locator('#terminal[aria-busy="false"]').waitFor();
    assert.ok(await button(/ENTER SECTOR/i).isEnabled());
    report.gpu = await page.locator('#world').evaluate(canvas => {
      const gl = canvas.getContext('webgl2');
      if (!gl || gl.isContextLost()) return null;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return { renderer: gl.getParameter(ext?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER),
        vendor: gl.getParameter(ext?.UNMASKED_VENDOR_WEBGL ?? gl.VENDOR),
        glVersion: gl.getParameter(gl.VERSION), shadingLanguage: gl.getParameter(gl.SHADING_LANGUAGE_VERSION) };
    });
    assert.ok(report.gpu, 'The shipped canvas must have a live WebGL2 context');
    await page.evaluate(() => document.fonts.ready);
    await capture('01-hero');
  });
  await check('Drove and parked from the overworld', async () => {
    await button(/ENTER SECTOR/i).click();
    await page.keyboard.down('w');
    try { await waitUI('#kph', 'number>', 12); }
    finally { await page.keyboard.up('w'); }
    await capture('02-driving');
    await page.keyboard.press('r');
    await button(/ENTER SECTOR/i).waitFor();
  });
  await check('Opened the city and entered its Switchyard', async () => {
    await pressMode(2, /Quarry District/i);
    await capture('03-city');
    await page.locator('button[data-district="yard"]').click();
    await page.getByRole('heading', { name: 'Fabrication' }).waitFor();
    await pressMode(2, /Quarry District/i);
    await pressMode(3, 'Fabrication');
  });
  await check('Placed and reclaimed a live power module', async () => {
    await page.locator('button[data-kind="generator"]').click();
    // E4 is an initially empty cell beside the production line.
    const empty = button('E4 · Empty footprint');
    await empty.waitFor();
    await empty.focus();
    await page.keyboard.press('Enter');
    await button('E4 · Generator').waitFor();
    await waitUI('[data-ui="supply"]', 'contains', '16 MW');
    await capture('04-industry');
    await button('Remove').click();
    await button('E4 · Empty footprint').waitFor();
    await waitUI('[data-ui="supply"]', 'contains', '8 MW');
  });
  await check('Changed the squad lead and deployed', async () => {
    await pressMode(4, /Quarry Warden/i);
    await page.locator('button[data-slot="1"]').click();
    await waitUI('[data-ui="bond"]', 'equals', 'Induction');
    await capture('05-formation');
    await button(/Launch incursion/i).click();
    await waitUI('[data-ui="arena-status"]', 'contains', 'Exclusion zone');
    await page.keyboard.press('e');
    await waitUI('#notice', 'contains', 'Recovered 8 alloy');
    await page.keyboard.press('j');
    await waitUI('[data-ui="boss-pct"]', 'number<', 100);
    await page.keyboard.press('q');
    await page.locator('button[data-slot="1"][aria-pressed="true"]').waitFor();
    await capture('06-combat', { measure: false });
  });
  await check('Returned the salvaged cargo through the extraction beacon', async () => {
    await page.keyboard.press('x');
    await waitUI('[data-ui="loot"]', 'equals', '8');
    await waitUI('[data-ui="evac"]', 'contains', 'Beacon active');
    await capture('07-extraction', { measure: false });
    await page.keyboard.down('d');
    try { await waitUI('[data-ui="evac-range"]', 'equals', 'Hold position'); }
    finally { await page.keyboard.up('d'); }
    await waitUI('.city-dispatch .mh-cap', 'equals', 'Cargo banked');
    await waitUI('.city-dispatch [data-ui="event"]', 'contains', '+8 alloy');
    await capture('08-return');
  });
  await check('Rendered all scenes without console, shader, runtime or asset errors', async () => {
    assert.equal(report.pageErrors.length, 0, JSON.stringify(report.pageErrors));
    assert.equal(report.renderErrors.length, 0, JSON.stringify(report.renderErrors));
    assert.equal(report.requestErrors.length, 0, JSON.stringify(report.requestErrors));
  });
  report.success = true;
} catch (error) {
  report.failure = { stage, message: error.stack ?? String(error) };
  console.error(report.failure);
  if (page) await page.screenshot({ path: join(output, 'failure.png'), timeout: 15_000 }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.closeAllConnections();
  if (server.listening) await new Promise(resolve => server.close(resolve));
  report.finishedAt = new Date().toISOString();
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log('Browser evidence:', output);
}
