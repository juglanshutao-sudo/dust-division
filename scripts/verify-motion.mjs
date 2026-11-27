import assert from 'node:assert/strict'

export async function verifyOverworldChrome(page) {
  const result = await page.evaluate(() => {
    function inspect(selector) {
      const element = document.querySelector(selector),
        style = getComputedStyle(element)
      const rule = getComputedStyle(element, '::before')
      return {
        color: style.color,
        background: style.backgroundColor,
        image: style.backgroundImage,
        shadow: style.textShadow,
        stroke: style.webkitTextStrokeColor,
        strokeWidth: parseFloat(style.webkitTextStrokeWidth),
        physical: [style.borderTopWidth, style.borderBottomWidth],
        rule: {
          height: rule.height,
          left: parseFloat(rule.left),
          right: parseFloat(rule.right),
          opacity: Number(rule.opacity),
        },
      }
    }
    return Object.fromEntries(
      ['.topbar', '.statusbar', '.field-readings', '.sector-map'].map((key) => [key, inspect(key)]),
    )
  })
  for (const region of Object.values(result)) {
    assert.match(region.background, /rgba\([^)]*, 0\)$/, 'Mode 1 surface must reveal the world')
    assert.equal(region.image, 'none')
  }
  for (const selector of ['.topbar', '.statusbar']) {
    const bar = result[selector]
    assert.deepEqual(bar.physical, ['0px', '0px'])
    assert.equal(bar.rule.height, '1px')
    assert.ok(bar.rule.left > 0 && bar.rule.right > 0 && bar.rule.opacity > 0 && bar.rule.opacity < 1)
  }
  function luminance(channels) {
    return channels
      .map((value) => value / 255)
      .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))
      .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0)
  }
  for (const selector of ['.field-readings', '.sector-map']) {
    const region = result[selector]
    assert.notEqual(region.shadow, 'none', 'Scene labels need their localized text shadow')
    assert.ok(region.strokeWidth > 0)
    const color = (s) => s.match(/[\d.]+/g).map(Number)
    const ink = luminance(color(region.color).slice(0, 3)),
      [r, g, b, alpha = 1] = color(region.stroke)
    region.contrast = [
      [239, 211, 168],
      [62, 53, 44],
    ].map((scene) => {
      const edge = luminance([r, g, b].map((c, i) => c * alpha + scene[i] * (1 - alpha)))
      return (Math.max(ink, edge) + 0.05) / (Math.min(ink, edge) + 0.05)
    })
    assert.ok(
      region.contrast.every((ratio) => ratio >= 4.5),
      'Glyph contrast against sand and rock',
    )
  }
  result.vignette = await page.locator('#viewport').evaluate((el) => {
    const v = getComputedStyle(el, '::after')
    return {
      height: parseFloat(v.height),
      bottom: v.bottom,
      image: v.backgroundImage,
      pointerEvents: v.pointerEvents,
    }
  })
  const v = result.vignette
  assert.ok(v.height > 0 && v.height <= 88 && parseFloat(v.bottom) === 0 && v.pointerEvents === 'none')
  assert.match(v.image, /linear-gradient/)
  assert.match(v.image, /rgba\([^)]*, 0\)/, 'Upper vignette edge must remain transparent')
  return result
}

export async function verifyIndustryCaption(page) {
  const caption = await page.locator('.mh-industry:not(.mh-raid) > .mh-tl').evaluate((el) => {
    const title = el.querySelector('.industry-title'),
      style = getComputedStyle(title),
      box = el.getBoundingClientRect()
    const load = document.querySelector('.industry-power').getBoundingClientRect()
    return {
      ink: style.color,
      paper: style.backgroundColor,
      blockPaper: getComputedStyle(el).backgroundColor,
      shadow: style.boxShadow,
      radius: style.borderRadius,
      filter: style.filter,
      captionRight: box.right,
      captionWidth: box.width,
      loadLeft: load.left,
    }
  })
  function linear(color) {
    const rgb = color.match(/[\d.]+/g).map(Number)
    assert.equal(rgb.length, 3, 'Caption plaque must be opaque')
    return rgb.reduce((total, v, i) => {
      const c = v / 255
      return total + [0.2126, 0.7152, 0.0722][i] * (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
    }, 0)
  }
  const ink = linear(caption.ink),
    paper = linear(caption.paper)
  caption.contrast = (Math.max(ink, paper) + 0.05) / (Math.min(ink, paper) + 0.05)
  assert.match(
    caption.blockPaper,
    /rgba\([^)]*, 0\)$/,
    'Ground must show between the title, eyebrow and ruler',
  )
  assert.ok(caption.contrast >= 7 && caption.captionRight <= caption.loadLeft + 1)
  assert.ok(caption.radius === '0px' && caption.shadow === 'none' && caption.filter === 'none')
  return caption
}

/** Sample the browser's real mask polygons and transformed yellow border in screen coordinates. */
export async function verifyCityCut(page, from) {
  await page.locator('.mode-sweep').waitFor({ state: 'detached' })
  const probe = await page.evaluateHandle(
    (fromMode) => ({
      result: new Promise((resolve, reject) => {
        const shell = document.querySelector('#terminal')
        const observer = new MutationObserver(() => {
          const clock = shell.getAnimations().find((a) => a.animationName === 'dd-city-handoff')
          if (!clock) return
          observer.disconnect()
          clearTimeout(timeout)
          const original = clock.currentTime ?? 0
          try {
            const old = shell.querySelector('.hud-leaving[data-from="' + fromMode + '"]')
            const incoming = shell.querySelector('.mh-city.hud-entering')
            const stripe = shell.querySelector('.mode-sweep[data-to="2"] [data-wipe]')
            const control = [...old.querySelectorAll('button:not([disabled])')].find(
              (b) => b.getClientRects().length,
            )
            control?.focus({ preventScroll: true })
            const duration = Number(clock.effect.getTiming().duration)
            function polygon(el) {
              const rect = el.getBoundingClientRect()
              const clip = getComputedStyle(el).clipPath
              if (!clip.startsWith('polygon(')) throw Error('Expected a diagonal HUD mask: ' + clip)
              function length(value, extent) {
                if (!/^-?[\d.]+(?:px|%)?$/.test(value)) throw Error('Unresolved polygon coordinate: ' + value)
                return parseFloat(value) * (value.endsWith('%') ? extent / 100 : 1)
              }
              const points = clip
                .slice(8, -1)
                .split(',')
                .map((point) => {
                  const [x, y] = point.trim().split(/\s+/)
                  return [rect.left + length(x, rect.width), rect.top + length(y, rect.height)]
                })
              return { rect, points }
            }
            function interval(mask, y) {
              const xs = []
              mask.points.forEach(([x1, y1], i) => {
                const [x2, y2] = mask.points[(i + 1) % mask.points.length]
                if (y > Math.min(y1, y2) && y < Math.max(y1, y2))
                  xs.push(x1 + ((x2 - x1) * (y - y1)) / (y2 - y1))
              })
              if (xs.length !== 2) throw Error('Expected two mask intersections, got ' + JSON.stringify(xs))
              return xs
                .sort((a, b) => a - b)
                .map((x) => Math.min(mask.rect.right, Math.max(mask.rect.left, x)))
            }
            const store = incoming.querySelector('.city-stores').getBoundingClientRect()
            const tool = old.querySelector('.plant-dock')?.getBoundingClientRect()
            const samples = []
            clock.pause()
            for (const portion of [0.06, 0.17, 0.28, 0.39, 0.5, 0.61, 0.72, 0.83, 0.94]) {
              clock.currentTime = duration * portion
              const a = polygon(old),
                b = polygon(incoming)
              const band = stripe.getBoundingClientRect(),
                style = getComputedStyle(stripe)
              const shear = new DOMMatrix(style.transform).c
              // Negative skew puts the upper-left border at bbox.right minus its unsheared width.
              const stripeAtTop = band.right - parseFloat(style.width) + parseFloat(style.borderLeftWidth) / 2
              const top = Math.max(a.rect.top, b.rect.top),
                bottom = Math.min(a.rect.bottom, b.rect.bottom)
              const rows = [0.07, 0.34, 0.61, 0.88].map((f) => top + f * (bottom - top))
              if (tool && Math.min(store.bottom, tool.bottom) > Math.max(store.top, tool.top)) {
                rows.push((Math.max(store.top, tool.top) + Math.min(store.bottom, tool.bottom)) / 2)
              }
              const edges = rows.map((y) => {
                const x = stripeAtTop + (y - band.top) * shear
                const [left, right] = interval(a, y),
                  [start, end] = interval(b, y)
                const expected = Math.min(a.rect.right, Math.max(a.rect.left, x))
                const overlap = Math.max(0, Math.min(right, end) - Math.max(left, start))
                return {
                  y,
                  x,
                  oldRight: right,
                  newLeft: start,
                  error: Math.max(Math.abs(right - expected), Math.abs(start - expected)),
                  overlap,
                }
              })
              samples.push({ portion, stripeAtTop, shear, edges })
            }
            const style = getComputedStyle(stripe)
            resolve({
              from: fromMode,
              to: 2,
              duration,
              viewport: [innerWidth, innerHeight],
              oldInert: old.inert,
              oldVisible: old.getClientRects().length > 0,
              ariaHidden: old.getAttribute('aria-hidden'),
              focusBlocked: !!control && document.activeElement !== control,
              yellow: style.borderLeftColor,
              stripeWidth: parseFloat(style.borderLeftWidth),
              samples,
            })
          } catch (error) {
            reject(error)
          } finally {
            clock.currentTime = original
            clock.play()
          }
        })
        observer.observe(shell, { subtree: true, attributes: true, childList: true })
        const timeout = setTimeout(() => {
          observer.disconnect()
          reject(Error('City handoff did not start'))
        }, 6000)
      }),
    }),
    from,
  )
  try {
    await page.keyboard.press('2')
    const result = await probe.evaluate((handle) => handle.result)
    assert.ok(result.oldInert && result.oldVisible && result.ariaHidden === 'true' && result.focusBlocked)
    assert.equal(result.duration, 180)
    assert.equal(result.yellow, 'rgb(255, 230, 0)')
    assert.equal(result.stripeWidth, 3)
    let interior = 0
    result.samples.forEach((sample, i) => {
      assert.ok(Math.abs(sample.shear - Math.tan((-23 * Math.PI) / 180)) < 0.0001)
      if (i)
        assert.ok(sample.stripeAtTop < result.samples[i - 1].stripeAtTop, 'City cut must move right to left')
      for (const edge of sample.edges) {
        assert.ok(
          edge.error < 1 && edge.overlap < 1,
          'HUDs must meet at the yellow border: ' + JSON.stringify(edge),
        )
        if (edge.x > 1 && edge.x < result.viewport[0] - 1) interior++
      }
    })
    assert.ok(interior >= 5, 'Sample multiple interior locations on the moving diagonal')
    return result
  } finally {
    await probe.dispose()
  }
}

async function industryCut(page, holdFrame = false) {
  // Seek the actual, shared CSS animation. Reading resolved clip insets synchronously avoids
  // losing all intermediate frames on a low-FPS adapter.
  const probe = await page.evaluateHandle(
    (hold) => ({
      result: new Promise((resolve, reject) => {
        function measure() {
          const shell = document.querySelector('#terminal[data-industry-handoff]')
          const clock = shell?.getAnimations().find((a) => a.animationName === 'dd-industry-handoff')
          if (!clock) return
          observer.disconnect()
          try {
            const old = shell.querySelector('.hud-leaving[data-from="2"]'),
              incoming = shell.querySelector('.hud-entering')
            const line = shell.querySelector('.mode-sweep[data-to="3"] [data-wipe]')
            const store = old.querySelector('.city-stores').getBoundingClientRect()
            const dock = incoming.querySelector('.plant-dock').getBoundingClientRect()
            const source = old.getBoundingClientRect(),
              destination = incoming.getBoundingClientRect()
            const style = getComputedStyle(line),
              samples = []
            function clip(el, fromBottom) {
              const path = getComputedStyle(el).clipPath
              if (!/^inset\([\d. px%]+\)$/.test(path)) throw Error('Unresolved rectangular HUD clip: ' + path)
              const terms = path.slice(6, -1).split(/\s+/)
              const token = fromBottom ? (terms[2] ?? terms[0]) : terms[0]
              const rect = el.getBoundingClientRect()
              const length = parseFloat(token) * (token.includes('%') ? rect.height / 100 : 1)
              return fromBottom ? rect.bottom - length : rect.top + length
            }
            const duration = Number(clock.effect.getTiming().duration),
              original = clock.currentTime ?? 0
            clock.pause()
            for (const portion of [0.16, 0.32, 0.48, 0.63, 0.78, 0.91]) {
              clock.currentTime = duration * portion
              const y = line.getBoundingClientRect().top,
                oldEdge = clip(old, false),
                newEdge = clip(incoming, true)
              const clamped = (v, rect) => Math.min(rect.bottom, Math.max(v, rect.top))
              const overlap = Math.max(
                0,
                Math.min(store.bottom, dock.bottom, newEdge) - Math.max(store.top, dock.top, oldEdge),
              )
              samples.push({
                portion,
                y,
                oldEdge,
                newEdge,
                sourceError: oldEdge - clamped(y, source),
                destinationError: newEdge - clamped(y, destination),
                storeBuildOverlapPx: overlap,
              })
            }
            const middle = samples.reduce((a, b) =>
              Math.abs(a.y - innerHeight / 2) < Math.abs(b.y - innerHeight / 2) ? a : b,
            )
            if (hold) clock.currentTime = duration * middle.portion
            else {
              clock.currentTime = original
              clock.play()
            }
            resolve({
              from: 2,
              to: 3,
              name: clock.animationName,
              duration,
              viewportHeight: innerHeight,
              samples,
              middle,
              oldInert: old.inert,
              oldVisible: old.getClientRects().length > 0,
              tint: style.backgroundColor,
              height: style.height,
            })
          } catch (error) {
            reject(error)
          }
        }
        const observer = new MutationObserver(measure)
        observer.observe(document.querySelector('#terminal'), {
          childList: true,
          attributes: true,
          subtree: true,
        })
        setTimeout(() => {
          observer.disconnect()
          reject(new Error('Industry handoff did not start'))
        }, 6000)
      }),
    }),
    holdFrame,
  )
  try {
    await page.keyboard.press('3')
    const cut = await probe.evaluate((h) => h.result)
    assert.ok(cut.oldInert && cut.oldVisible && cut.height === '1px' && cut.tint === 'rgb(255, 77, 0)')
    assert.ok(cut.samples.at(-1).y - cut.samples[0].y > cut.viewportHeight * 0.7)
    for (const [i, s] of cut.samples.entries()) {
      if (i) assert.ok(s.y > cut.samples[i - 1].y, 'Industry scan must move down')
      assert.ok(
        Math.abs(s.sourceError) <= 1.5 && Math.abs(s.destinationError) <= 1.5 && s.storeBuildOverlapPx <= 1.5,
        'The HUD masks must meet at the orange scanline: ' + JSON.stringify(s),
      )
    }
    return cut
  } finally {
    await probe.dispose()
  }
}

// This separate small-screen session holds only the browser animation timeline for a staged
// screenshot. The main gameplay, timing and performance runs always use the normal clock.
export async function captureIndustryCut(browser, url, outputPath) {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  })
  try {
    await page.goto(url, { waitUntil: 'networkidle' })
    await page.locator('#terminal[aria-busy="false"]').waitFor()
    await page.keyboard.press('3')
    await page.locator('.plant-dock').waitFor({ state: 'visible' })
    const reverse = await verifyCityCut(page, 3)
    await page.locator('.mh-city button[data-district="yard"]').waitFor({ state: 'visible' })
    await page.locator('.mode-sweep').waitFor({ state: 'detached' })
    const result = await industryCut(page, true)
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    )
    assert.ok(
      await page.locator('#terminal[data-industry-handoff]').count(),
      'Staged handoff should remain visible',
    )
    await page.screenshot({ path: outputPath, timeout: 60_000 })
    return { cut: result, reverse, caption: await verifyIndustryCaption(page) }
  } finally {
    await page.close()
  }
}

export async function verifyModeMotion(page) {
  const traces = []
  for (const [from, to] of [
    [1, 2],
    [2, 3],
    [3, 4],
  ]) {
    await page.locator('.mode-sweep').waitFor({ state: 'detached' })
    if (from === 2) await page.locator('.mh-city button[data-district="yard"]').waitFor({ state: 'visible' })
    if (to === 2) {
      traces.push(await verifyCityCut(page, from))
      continue
    }
    if (from === 2 && to === 3) {
      traces.push(await industryCut(page))
      continue
    }
    const probe = await page.evaluateHandle(
      ({ from, to }) => ({
        result: new Promise((resolve, reject) => {
          let started = performance.now()
          window.addEventListener(
            'keydown',
            () => {
              started = performance.now()
            },
            { capture: true, once: true },
          )
          let exit, animation
          const timeout = setTimeout(() => {
            observer.disconnect()
            reject(new Error('Incomplete mode motion ' + JSON.stringify({ from, to, exit, animation })))
          }, 6000)
          function read() {
            const outgoing = document.querySelector('.hud-leaving[data-from="' + from + '"]')
            if (outgoing && !exit) {
              const control = [...outgoing.querySelectorAll('button:not([disabled])')].find(
                (b) => b.getClientRects().length,
              )
              control?.focus({ preventScroll: true })
              exit = {
                durationMs: outgoing
                  .getAnimations()
                  .find((a) => a.animationName === 'dd-hud-exit')
                  ?.effect.getTiming().duration,
                visible:
                  outgoing.getClientRects().length > 0 && getComputedStyle(outgoing).visibility !== 'hidden',
                inert: outgoing.inert,
                ariaHidden: outgoing.getAttribute('aria-hidden'),
                focusBlocked: !!control && document.activeElement !== control,
              }
            }
            const art = document.querySelector('.mode-sweep[data-to="' + to + '"] [data-wipe]')
            if (art && !animation) {
              const scan = art
                .getAnimations({ subtree: true })
                .find((a) => /^dd-.*-scan$/.test(a.animationName))
              if (scan)
                animation = {
                  name: scan.animationName,
                  shear: new DOMMatrix(getComputedStyle(art).transform).c,
                  pieces: art.children.length,
                  timing: getComputedStyle(art).animationTimingFunction,
                  height: getComputedStyle(art).height,
                  frames: scan.effect.getKeyframes().map((k) => ({
                    transform: k.transform,
                    clipPath: k.clipPath,
                    offset: k.computedOffset,
                  })),
                }
            }
            if (
              exit &&
              animation &&
              !outgoing &&
              document.querySelector('#terminal').dataset.mode === String(to)
            ) {
              clearTimeout(timeout)
              observer.disconnect()
              resolve({ from, to, retainedMs: performance.now() - started, exit, animation })
            }
          }
          const observer = new MutationObserver(read)
          observer.observe(document.querySelector('#terminal'), {
            childList: true,
            attributes: true,
            subtree: true,
          })
        }),
      }),
      { from, to },
    )
    await page.keyboard.press(String(to))
    const trace = await probe.evaluate((handle) => handle.result)
    await probe.dispose()
    assert.ok(
      trace.exit.visible && trace.exit.inert && trace.exit.focusBlocked && trace.exit.ariaHidden === 'true',
    )
    assert.ok(trace.retainedMs >= 172, 'Old HUD removed before its 180 ms exit')
    assert.equal(trace.exit.durationMs, 180, 'The outgoing HUD uses its authored 180 ms clip')
    assert.equal(trace.animation.name, 'dd-combat-scan')
    assert.ok(trace.animation.pieces >= 4 && new Set(trace.animation.frames.map((f) => f.clipPath)).size >= 3)
    assert.match(trace.animation.timing, /step/i)
    traces.push(trace)
  }
  const rapid = await page.evaluate(() =>
    [1, 2, 3, 4].map((target) => {
      const key = { key: String(target), code: 'Digit' + target, bubbles: true }
      const inputTarget = document.activeElement || document.body
      inputTarget.dispatchEvent(new KeyboardEvent('keydown', key))
      inputTarget.dispatchEvent(new KeyboardEvent('keyup', key))
      return {
        target,
        live: document.querySelector('#terminal').dataset.mode,
        outgoing: document.querySelectorAll('.hud-leaving').length,
        sweeps: [...document.querySelectorAll('.mode-sweep')].map((node) => node.dataset.to),
      }
    }),
  )
  for (const step of rapid) {
    assert.equal(step.live, String(step.target))
    assert.ok(step.outgoing <= 1 && step.sweeps.length <= 1)
    if (step.sweeps.length) assert.equal(step.sweeps[0], String(step.target))
  }
  await page.locator('.hud-leaving').waitFor({ state: 'detached' })
  await page.locator('.mode-sweep').waitFor({ state: 'detached' })
  assert.ok(await page.getByRole('heading', { name: /Quarry Warden/i }).isVisible())
  assert.equal(await page.locator('#modes-nav button[aria-current="true"]').getAttribute('data-mode'), '4')
  await page.keyboard.press('1')
  await page.locator('.hud-leaving').waitFor({ state: 'detached' })
  await page.getByRole('button', { name: /ENTER SECTOR/i }).waitFor()
  return { traces, rapid }
}

// Run alongside the normal-input fight. Read the rendered controls after input handlers and
// frame updates so short telegraph windows are observed even on the software renderer.
export function watchCombatHUD(page) {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const seen = {
          hot: 0,
          cold: 0,
          prelock: 0,
          prelockReads: [],
          cooldowns: {},
          bonds: new Set(),
          beats: new Set(),
          cornerOffsets: [],
          violations: new Set(),
        }
        const text = (key) => document.querySelector('[data-ui="' + key + '"]')?.textContent.trim()
        const safeArea = document.createElement('i')
        safeArea.style.cssText =
          'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)'
        document.body.append(safeArea)
        const safeStyle = getComputedStyle(safeArea)
        const insets = [
          safeStyle.paddingLeft,
          safeStyle.paddingRight,
          safeStyle.paddingTop,
          safeStyle.paddingBottom,
        ].map(parseFloat)
        safeArea.remove()
        const observer = new MutationObserver(inspect)
        const timeout = setTimeout(() => {
          observer.disconnect()
          reject(new Error('No execution window in combat HUD'))
        }, 110_000)
        function inspect() {
          const reticle = document.querySelector('.parry-reticle')
          if (!reticle) return
          const remaining = Number(reticle.dataset.remaining),
            cue = text('boss-window'),
            move = text('boss-move')
          const winding = ['sweep', 'slam', 'lunge'].includes(move) && cue !== 'LIVE'
          const visible = !reticle.hidden && reticle.getClientRects().length > 0
          if (visible) {
            const corner = reticle.querySelector('i'),
              cornerStyle = getComputedStyle(corner)
            const stroke = Math.max(
              ...['borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth'].map((k) =>
                parseFloat(cornerStyle[k]),
              ),
            )
            if (reticle.dataset.phase === 'prelock') {
              seen.prelock++
              const color = getComputedStyle(reticle).color
              if (
                !winding ||
                remaining < 0.2595 ||
                stroke !== 1 ||
                color !== 'rgb(113, 104, 100)' ||
                cue === 'PARRY'
              )
                seen.violations.add('prelock appearance')
              if (!seen.prelockReads.length || remaining !== seen.prelockReads.at(-1).remaining)
                seen.prelockReads.push({ remaining, color, stroke })
            } else {
              seen.hot++
              if (
                reticle.dataset.phase !== 'hot' ||
                !winding ||
                remaining > 0.2605 ||
                cue !== 'PARRY' ||
                stroke !== 3
              )
                seen.violations.add('hot appearance')
            }
            const style = getComputedStyle(reticle),
              bounds = reticle.getBoundingClientRect()
            const corners = [...reticle.querySelectorAll('i')].map((i) => i.getBoundingClientRect())
            if (
              style.position !== 'fixed' ||
              style.pointerEvents !== 'none' ||
              Math.abs(bounds.x) > 1 ||
              Math.abs(bounds.y) > 1 ||
              Math.abs(bounds.width - innerWidth) > 1 ||
              Math.abs(bounds.height - innerHeight) > 1
            )
              seen.violations.add('viewport reticle')
            const dx = (box, right) => (right ? innerWidth - box.right : box.left)
            const dy = (box, bottom) => (bottom ? innerHeight - box.bottom : box.top)
            const offsets = corners.map((box, i) => [dx(box, i % 2 === 1), dy(box, i >= 2)])
            if (
              corners.some((box) => box.width < 4 || box.height < 4) ||
              offsets.some(
                ([x, y], i) => x < 0 || y < 0 || x > 16 + insets[i % 2] || y > 16 + insets[i < 2 ? 2 : 3],
              )
            )
              seen.violations.add('physical corner placement')
            if (seen.cornerOffsets.length === 0) seen.cornerOffsets = offsets
            if (Number(style.zIndex) <= Number(getComputedStyle(document.querySelector('.topbar')).zIndex))
              seen.violations.add('reticle behind chrome')
            if (
              !['rust', 'bone', 'quiet'].includes(reticle.dataset.beat) ||
              !Number.isInteger(Number(reticle.dataset.step))
            )
              seen.violations.add('reticle pulse')
            seen.beats.add(reticle.dataset.beat + ' / ' + reticle.dataset.step)
          } else seen.cold++
          if (
            visible !== winding ||
            (visible && (!Number.isFinite(remaining) || reticle.querySelectorAll('i').length !== 4))
          )
            seen.violations.add('parry window')
          seen.bonds.add(text('live-links'))
          for (const btn of document.querySelectorAll('.combat-act[data-state="cooldown"]')) {
            const t = Number(btn.dataset.remaining),
              fill = Number(btn.style.getPropertyValue('--action-meter'))
            const meter = btn.querySelector('.cooldown-meter')
            if (
              !btn.disabled ||
              !Number.isFinite(t) ||
              t < 0 ||
              !meter?.getClientRects().length ||
              !(fill >= 0 && fill <= 1)
            )
              seen.violations.add('cooldown meter')
            const values = (seen.cooldowns[btn.dataset.command] ??= new Set())
            values.add(fill)
          }
          if (move !== 'Core exposed') return
          const finish = document.querySelector('.combat-act[data-command="finish"]')
          if (finish.dataset.indicator !== 'window' || !(Number(finish.dataset.window) > 0))
            seen.violations.add('execution window')
          observer.disconnect()
          clearTimeout(timeout)
          resolve({
            hot: seen.hot,
            prelock: seen.prelock,
            prelockSamples: seen.prelockReads,
            cold: seen.cold,
            beats: [...seen.beats],
            cornerOffsets: seen.cornerOffsets,
            bonds: [...seen.bonds],
            violations: [...seen.violations],
            cooldowns: Object.fromEntries(Object.entries(seen.cooldowns).map(([k, v]) => [k, [...v]])),
          })
        }
        observer.observe(document.querySelector('.mh-battle'), {
          subtree: true,
          childList: true,
          attributes: true,
          characterData: true,
        })
        inspect()
      }),
  )
}

// Arm the observer before the trusted F key so the first 1.22 s dodge sample and
// the brief hitstop confirmation are visible on both slow and fast adapters.
export async function verifySecuredCoreActions(page) {
  const probe = await page.evaluateHandle(() => ({
    result: new Promise((resolve, reject) => {
      const finish = document.querySelector('.combat-act[data-command="finish"]')
      const dodge = document.querySelector('.combat-act[data-command="dodge"]')
      const confirmation = [],
        cooldown = []
      function record(list, value, button) {
        const fill = Number(button.style.getPropertyValue('--action-meter'))
        if (list.at(-1)?.value !== value) list.push({ value, fill })
      }
      const observer = new MutationObserver(() => {
        if (finish.disabled && finish.dataset.state === 'locked' && finish.dataset.indicator === 'confirm') {
          record(confirmation, Number(finish.dataset.confirm), finish)
        }
        if (dodge.disabled && dodge.dataset.state === 'cooldown')
          record(cooldown, Number(dodge.dataset.remaining), dodge)
        if (!dodge.disabled && cooldown.length && dodge.dataset.state === 'ready') {
          record(cooldown, Number(dodge.dataset.remaining), dodge)
          observer.disconnect()
          clearTimeout(deadline)
          resolve({ confirmation, cooldown, dodgeReady: true })
        }
      })
      const deadline = setTimeout(() => {
        observer.disconnect()
        reject(new Error('Post-execution feedback did not complete'))
      }, 40_000)
      observer.observe(document.querySelector('.combat-strip'), { attributes: true, subtree: true })
    }),
  }))
  try {
    await page.keyboard.press('f')
    await page
      .locator('[data-ui="boss-move"]')
      .filter({ hasText: /^Core secured$/ })
      .waitFor()
    await page.getByRole('button', { name: 'Dodge', exact: true }).click()
    const sample = await probe.evaluate((handle) => handle.result)
    const decayed = (series) =>
      series.some(
        (v, i) => i > 0 && v.value > 0 && v.value < series[i - 1].value && v.fill < series[i - 1].fill,
      )
    assert.ok(decayed(sample.confirmation), 'Locked finish must show the decaying confirmation meter')
    assert.ok(decayed(sample.cooldown), 'Dodge cooldown must visibly drain')
    assert.deepEqual(sample.cooldown[0], { value: 1.22, fill: 1 })
    assert.deepEqual(sample.cooldown.at(-1), { value: 0, fill: 0 })
    return sample
  } finally {
    await probe.dispose()
  }
}
