import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, extname, posix, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

const root = fileURLToPath(new URL('..', import.meta.url))
const destination = resolve(process.argv[2] || '/workspace/work/qa/Dust-Division.html')
const mime = {
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2'
}
const runtimeAssets = new Set()

// The hosted renderer resolves public artwork using Vite's deployment base.
// For a file: build, both renderers resolve the same names from inline image elements.
const publicImages = {
  name: 'portable-public-images',
  enforce: 'pre',
  transform(source, id) {
    if (!id.startsWith(root) || !id.endsWith('.ts') || !source.includes('import.meta.env.BASE_URL')) return
    const directImage = /`\$\{import\.meta\.env\.BASE_URL\}([\w./-]+)`/g
    const namedImage = /import\.meta\.env\.BASE_URL\s*\+\s*(['"])([\w/-]+)\1\s*\+\s*([\w$]+)\s*\+\s*(['"])(\.\w+)\4/g
    const code = source.replace(directImage, (_, path) => {
      runtimeAssets.add(path)
      return `globalThis.__dustAsset(${JSON.stringify(path)})`
    }).replace(namedImage, (_, _a, prefix, variable, _b, suffix) => {
      return `globalThis.__dustAsset(${JSON.stringify(prefix)}+${variable}+${JSON.stringify(suffix)})`
    })
    if (code.includes('import.meta.env.BASE_URL')) throw new Error(`Unresolved deployment-relative address in ${id}`)
    return { code, map: null }
  }
}

const result = await build({
  root, configFile: false, base: './', plugins: [publicImages],
  build: {
    write: false, copyPublicDir: false, assetsInlineLimit: () => true,
    cssCodeSplit: false, modulePreload: false, sourcemap: false,
    chunkSizeWarningLimit: 4096,
    rollupOptions: {output: {inlineDynamicImports: true}}
  }
})
const files = new Map(result.output.map(item => [item.fileName, item]))
const entry = files.get('index.html')
if (entry?.type !== 'asset') throw new Error('Vite did not emit an HTML entry')
const chunks = result.output.filter(item => item.type === 'chunk')
if (chunks.length !== 1 || chunks[0].imports.length || chunks[0].dynamicImports.length) {
  throw new Error('Offline build contains a runtime module dependency')
}

const inlineData = new Map()
async function dataFor(path) {
  if (inlineData.has(path)) return inlineData.get(path)
  if (path.startsWith('../') || !mime[extname(path)]) throw new Error(`Unsupported asset: ${path}`)
  const item = files.get(path)
  const bytes = item?.type === 'asset' ? Buffer.from(item.source) : await readFile(resolve(root, 'public', path))
  const uri = `data:${mime[extname(path)]};base64,${bytes.toString('base64')}`
  inlineData.set(path, uri)
  return uri
}

function relativeFile(ref, base = '') {
  if (/^(?:[a-z][\w+.-]*:|\/\/)/i.test(ref)) throw new Error(`External resource: ${ref}`)
  return posix.normalize(ref.startsWith('/') ? ref.slice(1) : posix.join(base, ref))
}

const styles = result.output.filter(item => item.type === 'asset' && item.fileName.endsWith('.css'))
let css = ''
for (const style of styles) {
  let sheet = String(style.source)
  for (const match of [...sheet.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/g)]) {
    const url = match[2]
    if (/^(?:data:|#)/.test(url)) continue
    const path = relativeFile(url, posix.dirname(style.fileName))
    const uri = await dataFor(path)
    sheet = sheet.replace(match[0], () => `url("${uri}")`)
  }
  if (/@import\s/.test(sheet)) throw new Error('Offline stylesheet contains an external import')
  css += sheet
}

let html = String(entry.source)
html = html.replace(/<script\b[^>]*\bsrc="[^"]+"[^>]*>\s*<\/script>/gi, '')
html = html.replace(/<link\b(?=[^>]*\brel="stylesheet")[^>]*>/gi, '')
const marked = new Set()
// Browser-native data URIs work for HTML images, WebGL textures and the Canvas renderer.
for (const match of [...html.matchAll(/<(?:link|img)\b[^>]*?\b(href|src)="([^"]+)"[^>]*>/gi)]) {
  const path = relativeFile(match[2])
  const uri = await dataFor(path)
  const attr = match[1]
  const tag = match[0].replace(`${attr}="${match[2]}"`, () => `${attr}="${uri}" data-offline-path="${path}"`)
  marked.add(path)
  html = html.replace(match[0], () => tag)
}
for (const path of runtimeAssets) {
  if (!marked.has(path)) throw new Error(`Runtime image missing from the HTML asset registry: ${path}`)
}

const boot = `const embedded = new Map(Array.from(document.querySelectorAll('[data-offline-path]'), el => [el.dataset.offlinePath, el.getAttribute('src') || el.getAttribute('href')]));
globalThis.__dustAsset = path => { if (!embedded.has(path)) throw new Error('Missing embedded asset: ' + path); return embedded.get(path) };
`
const js = (boot + chunks[0].code).replace(/<\/script/gi, '<\\/script')
html = html.replace('</head>', () => `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>\n</head>`)
html = html.replace('</body>', () => `<script type="module">${js}</script>\n</body>`)

const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
for (const match of markup.matchAll(/\b(?:href|src|srcset)="([^"]+)"/g)) {
  if (!/^(?:data:|#)/.test(match[1])) throw new Error(`Unembedded markup resource: ${match[1]}`)
}
for (const match of css.matchAll(/url\(\s*["']?([^)"']+)/g)) {
  if (!/^(?:data:|#)/.test(match[1])) throw new Error(`Unembedded stylesheet resource: ${match[1]}`)
}
const notices = await readFile(resolve(root, 'public/THIRD-PARTY-NOTICES.txt'), 'utf8')
html = html.replace('</body>', () => '<script type="text/plain" id="third-party-notices">' + notices.replace(/<\/script/gi, '<\\/script') + '</script>\n</body>')
await mkdir(dirname(destination), {recursive: true})
await writeFile(destination, html)
console.log(`Standalone game: ${destination} (${(Buffer.byteLength(html) / 1048576).toFixed(2)} MiB)`)
