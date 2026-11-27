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
  return result
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
    assert.equal(trace.animation.name, ['', '', 'dd-city-scan', 'dd-industry-scan', 'dd-combat-scan'][to])
    const geometry = trace.animation.frames.map((frame) => frame.transform || '').join(' ')
    if (to === 2) assert.ok(Math.abs(trace.animation.shear) > 0.1 || /skew/i.test(geometry))
    if (to === 3) {
      assert.equal(trace.animation.height, '1px')
      assert.ok(new Set(trace.animation.frames.map((f) => f.transform)).size >= 2)
    }
    if (to === 4) {
      assert.ok(
        trace.animation.pieces >= 4 && new Set(trace.animation.frames.map((f) => f.clipPath)).size >= 3,
      )
      assert.match(trace.animation.timing, /step/i)
    }
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
            seen.hot++
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
              !['rust', 'bone'].includes(reticle.dataset.beat) ||
              !Number.isInteger(Number(reticle.dataset.step))
            )
              seen.violations.add('reticle pulse')
            seen.beats.add(reticle.dataset.beat + ' / ' + reticle.dataset.step)
          } else seen.cold++
          if (
            visible !== (cue === 'PARRY') ||
            (visible &&
              (!winding ||
                !Number.isFinite(remaining) ||
                remaining > 0.2605 ||
                reticle.querySelectorAll('i').length !== 4)) ||
            (!visible && winding && remaining < 0.2595)
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
