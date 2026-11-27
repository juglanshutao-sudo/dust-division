import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export async function verifyTitleGround(page, name, output) {
  const title = page.locator('.mode-huds:not(.hud-leaving) .mh-tl:visible')
  const box = await title.boundingBox()
  assert.ok(box?.width && box.height, 'Expected a visible title block')
  const clip = {
    x: Math.floor(box.x),
    y: Math.floor(box.y),
    width: Math.ceil(box.width),
    height: Math.ceil(box.height),
  }
  const hideChrome = await page.addStyleTag({
    content:
      '#terminal > :not(#viewport), #viewport > :not(#world) { visibility: hidden !important }' +
      '#world { visibility: visible !important }',
  })
  let plate
  try {
    plate = await page.screenshot({ clip, timeout: 60_000 })
  } finally {
    await hideChrome.evaluate((node) => node.remove())
  }
  // Filter out the fine gravel texture. Roof boundaries and dark façades still
  // produce contrast across adjacent blocks at this scale.
  const metrics = await page.evaluate(async (png) => {
    const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0))
    const image = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
    const canvas = document.createElement('canvas')
    const w = (canvas.width = 40),
      h = (canvas.height = 12)
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(image, 0, 0, w, h)
    image.close()
    const { data } = ctx.getImageData(0, 0, w, h)
    const luma = []
    let jumps = 0
    for (let k = 0; k < w * h; k++) {
      const i = 4 * k
      const v = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
      luma.push(v)
      if (k % w && Math.abs(v - luma[k - 1]) > 24) jumps++
      if (k >= w && Math.abs(v - luma[k - w]) > 24) jumps++
    }
    luma.sort((a, b) => a - b)
    return {
      spread: luma[Math.floor(luma.length * 0.95)] - luma[Math.floor(luma.length * 0.05)],
      edgeFraction: jumps / ((w - 1) * h + (h - 1) * w),
    }
  }, plate.toString('base64'))
  await writeFile(join(output, name + '-title-ground.png'), plate)
  assert.ok(
    metrics.spread < 45 && metrics.edgeFraction < 0.035,
    'Title ground has a broad contrast break: ' + JSON.stringify({ name, clip, metrics }),
  )
  return { name, clip, ...metrics }
}
