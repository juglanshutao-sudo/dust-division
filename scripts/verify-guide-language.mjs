import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const han = /\p{Script=Han}/u

async function localized(page, selector, fields) {
  const el = page.locator(selector).first()
  await el.waitFor({ state: 'visible' })
  const values = await el.evaluate(
    (node, names) =>
      Object.fromEntries(
        names.map((name) => [
          name,
          (name === 'text' ? node.innerText || node.textContent : node.getAttribute(name) || '').trim(),
        ]),
      ),
    fields,
  )
  for (const [field, value] of Object.entries(values)) {
    assert.match(value, han, `${selector} needs a Chinese ${field}, received "${value}"`)
  }
  return values
}

async function language(page, value) {
  await page.locator('#ui-language').selectOption(value)
  await page.waitForFunction((expected) => document.documentElement.lang === expected, value)
  assert.equal(await page.locator('#ui-language').inputValue(), value)
}

async function mode(page, id) {
  const inCity = (await page.locator('#terminal').getAttribute('data-mode')) === '2'
  // In the city the buildings are its navigation, including the power Switchyard.
  const entry = inCity && id === 3 ? '[data-district="yard"]' : `#modes-nav [data-mode="${id}"]`
  await page.locator(entry).click()
  await page.locator(`#terminal[data-mode="${id}"]`).waitFor()
  await page.locator('.hud-leaving').waitFor({ state: 'detached' })
  await page.locator('.mode-sweep').waitFor({ state: 'detached' })
}

async function chapter(page, id) {
  const button = page.locator(`[data-guide-chapter="${id}"][aria-current="page"]`).first()
  // The phone contents panel can be collapsed while its selected chapter is being read.
  await button.waitFor({ state: 'attached' })
  return (await localized(page, '#guide-page-title', ['text'])).text
}

async function checkPanelLayout(page, kind) {
  const metrics = await page.locator('#drawer[open]').evaluate((drawer, which) => {
    const bounds = drawer.getBoundingClientRect()
    const nodes =
      which === 'guide'
        ? ['#guide-page-title', '#guide-return', '#guide-prev', '#guide-next']
        : ['#dialog-title', '#ui-language', '#settings-guide', '#close-panel']
    return {
      viewport: [innerWidth, innerHeight],
      bounds: [bounds.left, bounds.top, bounds.right, bounds.bottom],
      contentWidth: drawer.scrollWidth,
      clientWidth: drawer.clientWidth,
      items: nodes.map((selector) => {
        const element = drawer.querySelector(selector)
        const r = element?.getBoundingClientRect()
        return { selector, left: r?.left, right: r?.right, height: r?.height }
      }),
    }
  }, kind)
  const [w, h] = metrics.viewport
  const [left, top, right, bottom] = metrics.bounds
  assert.ok(left >= -1 && top >= -1 && right <= w + 1 && bottom <= h + 1, 'Dialog exceeds viewport')
  assert.ok(metrics.contentWidth <= metrics.clientWidth + 1, 'Dialog requires horizontal scrolling')
  for (const item of metrics.items) {
    assert.ok(
      item.height > 0 && item.left >= left - 1 && item.right <= right + 1,
      `Clipped or missing ${kind} control: ${item.selector}`,
    )
  }
  return metrics
}

async function screenshot(page, directory, name) {
  if (!directory) return
  await mkdir(directory, { recursive: true })
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: join(directory, name + '.jpg'), type: 'jpeg', quality: 91, timeout: 60_000 })
}

/**
 * Play the localized workflow in a fresh profile so raid state, guide progress,
 * language and purchases in the calling walkthrough stay under its own control.
 * Pass a phone-sized source page to exercise the mobile UI.
 */
export async function verifyGuideLanguage(
  sourcePage,
  { artifactsDir, url: entryUrl = sourcePage.url() } = {},
) {
  const viewport = sourcePage.viewportSize()
  assert.ok(viewport, 'Language test needs a measured viewport')
  const mobile = await sourcePage.evaluate(() => navigator.maxTouchPoints > 0)
  const browser = sourcePage.context().browser()
  assert.ok(browser, 'Language test needs a browser-backed source page')
  const context = await browser.newContext({
    viewport,
    locale: 'en-US',
    deviceScaleFactor: 1,
    isMobile: mobile,
    hasTouch: mobile,
  })
  const page = await context.newPage()
  page.setDefaultTimeout(45_000)
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('requestfailed', (req) => {
    if (req.failure()?.errorText !== 'net::ERR_ABORTED') errors.push(req.url())
  })
  const device = mobile ? 'phone' : 'desktop'
  const report = { device, viewport, panels: {}, localized: {}, chapters: [], errors }
  const settings = page.locator('#settings')
  const guideFromSettings = page.locator('#settings-guide')
  const close = page.locator('#close-panel')
  const drawer = page.locator('#drawer')
  const url = new URL(entryUrl)
  url.hash = ''

  try {
    const response = await page.goto(url.href, { waitUntil: 'domcontentloaded' })
    if (response) assert.ok(response.ok(), 'Game entry returned HTTP ' + response.status())
    report.entry = { url: page.url(), httpStatus: response?.status() ?? null }
    await page.locator('#terminal[aria-busy="false"]').waitFor()
    if (artifactsDir)
      await page.waitForFunction(
        () => Number.parseFloat(document.querySelector('#frame-data')?.textContent) > 0,
      )
    await settings.click()
    assert.equal(
      await page.locator('#ui-language').inputValue(),
      'en',
      'A new profile should start in English',
    )
    await language(page, 'zh-CN')
    report.localized.settings = await localized(page, '#dialog-title', ['text'])
    assert.match(report.localized.settings.text, /设置/)
    await localized(page, '#close-panel', ['aria-label', 'title'])
    await localized(page, 'label[for="ui-language"]', ['text'])
    await localized(page, '#settings-guide', ['text'])
    report.panels.settings = await checkPanelLayout(page, 'settings')
    await screenshot(page, artifactsDir, device + '-settings-zh')

    await guideFromSettings.click()
    report.chapters.push(await chapter(page, 'drive'))
    report.panels.guide = await checkPanelLayout(page, 'guide')
    await localized(page, '#guide-next', ['text'])
    await localized(page, '#guide-return', ['text'])
    await screenshot(page, artifactsDir, device + '-guide-zh')
    const contents = page.locator('#guide-contents-toggle')
    if (await contents.isVisible()) await contents.click()
    const index = page.locator('#guide-contents [data-guide-chapter]')
    assert.deepEqual(await index.evaluateAll((buttons) => buttons.map((b) => b.dataset.guideChapter)), [
      'drive',
      'freight',
      'power',
      'formation',
      'combat',
      'extraction',
    ])
    await page.locator('[data-guide-chapter="power"]').click()
    await chapter(page, 'power')
    if (await contents.isVisible()) await contents.click()
    await page.locator('[data-guide-chapter="drive"]').click()
    await chapter(page, 'drive')
    await page.locator('#guide-next').click()
    report.chapters.push(await chapter(page, 'freight'))
    assert.equal(await page.locator('[data-guide-chapter="drive"]').first().getAttribute('data-read'), 'true')
    await page.locator('#guide-prev').click()
    await chapter(page, 'drive')
    await page.locator('#guide-next').click()
    await chapter(page, 'freight')
    await page.locator('#guide-return').click()
    await page.locator('#ui-language').waitFor()
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'settings-guide')
    await close.click()

    report.localized.deploy = await localized(page, '#deploy', ['text'])
    assert.doesNotMatch(report.localized.deploy.text, /Enter sector/i)
    await localized(page, '#settings', ['aria-label', 'title'])
    await localized(page, '.guide-trigger', ['aria-label', 'title'])
    await localized(page, '#intro-guide', ['text'])
    await page.locator('#intro-guide').click()
    await chapter(page, 'freight')
    await page.locator('#guide-return').click()
    await drawer.waitFor({ state: 'hidden' })
    await page.waitForFunction(() => document.activeElement?.id === 'intro-guide')

    await mode(page, 2)
    report.localized.city = await localized(page, '.city-title', ['text', 'aria-label'])
    await localized(page, '[data-district="yard"]', ['text', 'aria-label', 'title'])
    await mode(page, 3)
    report.localized.plant = await localized(page, '.industry-title', ['text', 'aria-label'])
    const generator = page.locator('[data-kind="generator"]')
    await localized(page, '[data-kind="generator"]', ['text', 'title'])
    await generator.click()
    const cell = page.locator('[data-cell="25"]')
    await cell.focus()
    await page.keyboard.press('Enter')
    await page.waitForFunction(() =>
      document.querySelector('[data-cell="25"]')?.getAttribute('aria-label')?.includes('发电机'),
    )
    const supply = (await page.locator('[data-ui="supply"]').textContent()).trim()
    await settings.click()
    await language(page, 'en')
    await close.click()
    assert.match(await cell.getAttribute('aria-label'), /Generator/)
    await settings.click()
    await language(page, 'zh-CN')
    await close.click()
    assert.equal(
      (await page.locator('[data-ui="supply"]').textContent()).trim(),
      supply,
      'Changing the language must preserve the power network',
    )
    assert.match(await cell.getAttribute('aria-label'), /发电机/)

    await mode(page, 4)
    report.localized.boss = await localized(page, '.battle-title', ['text', 'aria-label'])
    await localized(page, '[data-command="raid"]', ['text'])
    await localized(page, '[data-tile="1"]', ['aria-label'])
    await page.locator('[data-command="raid"]').click()
    const attack = '.combat-act[data-command="attack"]'
    await localized(page, attack, ['text', 'aria-label', 'title'])
    await settings.click()
    await language(page, 'en')
    await language(page, 'zh-CN')
    await close.click()
    await page.locator(attack).waitFor()
    assert.ok(
      await page.locator('[data-command="raid"]').isHidden(),
      'An active incursion returned to preparation',
    )
    await page.locator('.guide-trigger').click()
    await chapter(page, 'freight')
    await page.locator('#guide-return').click()
    await drawer.waitFor({ state: 'hidden' })
    await page.locator(attack).waitFor()

    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.locator('#terminal[aria-busy="false"][data-mode="4"]').waitFor()
    await page.locator(attack).waitFor()
    await settings.click()
    assert.equal(
      await page.locator('#ui-language').inputValue(),
      'zh-CN',
      'Lost language preference after reload',
    )
    await guideFromSettings.click()
    assert.equal(
      await chapter(page, 'freight'),
      report.chapters[1],
      'The last-read page changed after reload',
    )
    assert.equal(await page.locator('[data-guide-chapter="drive"]').first().getAttribute('data-read'), 'true')
    await page.locator('#guide-return').click()
    await close.click()
    await mode(page, 3)
    await localized(page, '.raid-exit [data-command="extract"]', ['text'])
    await settings.click()
    await language(page, 'en')
    assert.match(await page.locator('#dialog-title').textContent(), /Settings/i)
    await guideFromSettings.click()
    await page
      .locator('[data-guide-chapter="freight"][aria-current="page"]')
      .first()
      .waitFor({ state: 'attached' })
    const englishChapter = await page.locator('#guide-page-title').innerText()
    assert.match(englishChapter, /[A-Za-z]/)
    assert.doesNotMatch(englishChapter, han)
    await page.locator('#guide-return').click()
    await close.click()
    assert.equal(await page.locator('html').getAttribute('lang'), 'en')
    assert.deepEqual(errors, [], 'New profile encountered browser errors')
    return report
  } catch (error) {
    if (errors.length)
      throw new Error(device + ' guide/language browser errors: ' + errors.join(' | '), { cause: error })
    throw error
  } finally {
    await context.close()
  }
}
