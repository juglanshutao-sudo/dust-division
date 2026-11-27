// Measure rendered glyph ranges, including the font selected for each writing system.
// Call on the parked hero, city, fabrication or encounter-preparation screen.
export async function verifyBilingual(page, mode) {
  const expectedHeading = [null, null, 'Quarry District', 'Fabrication', 'Quarry Warden'][mode]
  if (![1, 2, 3, 4].includes(mode)) throw new Error('Unsupported bilingual HUD mode ' + mode)
  await page.locator('#terminal[data-mode="' + mode + '"][aria-busy="false"]').waitFor()
  await page.locator('.hud-leaving').waitFor({ state: 'detached' })
  await page.locator('.mode-sweep').waitFor({ state: 'detached' })
  if (expectedHeading) await page.getByRole('heading', { name: expectedHeading, exact: true }).waitFor()
  if (mode === 1) await page.getByRole('button', { name: /ENTER SECTOR/i }).waitFor()
  await page.evaluate(async () => {
    await document.fonts.ready
  })

  return page.evaluate((mode) => {
    const report = { mode, viewport: [innerWidth, innerHeight], lines: {} }
    const require = (ok, detail) => {
      if (!ok) throw new Error('Mode ' + mode + ' bilingual HUD: ' + detail)
    }
    const find = (selector) => {
      const el = document.querySelector(selector)
      require(el &&
        el.checkVisibility({ opacityProperty: true, visibilityProperty: true }), 'missing visible ' +
        selector)
      return el
    }
    const tidy = (s) => (s.toUpperCase().match(/[A-Z0-9]+|[^\s]/gu) ?? []).join('|')
    const box = (r) => ({ x: r.left, y: r.top, right: r.right, bottom: r.bottom })
    const intersects = (a, b) =>
      Math.min(a.right, b.right) - Math.max(a.x, b.x) > 1 &&
      Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y) > 1
    function fragments(el) {
      const pieces = [],
        walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const txt = n.nodeValue.trim(),
          p = n.parentElement
        if (
          !txt ||
          p.closest('svg,kbd') ||
          !p.checkVisibility({ opacityProperty: true, visibilityProperty: true })
        )
          continue
        const range = document.createRange(),
          offset = n.nodeValue.indexOf(txt)
        range.setStart(n, offset)
        range.setEnd(n, offset + txt.length)
        for (const rect of range.getClientRects()) {
          if (!rect.width || !rect.height) continue
          const bounds = box(rect)
          require(bounds.x >= -1 &&
            bounds.right <= innerWidth + 1 &&
            bounds.y >= -1 &&
            bounds.bottom <= innerHeight + 1, 'off screen: ' + txt)
          for (let parent = p; parent; parent = parent.parentElement) {
            const style = getComputedStyle(parent),
              clip = parent.getBoundingClientRect()
            if (/hidden|clip|auto|scroll/.test(style.overflowX))
              require(bounds.x >= clip.left - 1.5 &&
                bounds.right <= clip.right + 1.5, 'horizontal clipping: ' + txt)
            if (/hidden|clip|auto|scroll/.test(style.overflowY))
              require(bounds.y >= clip.top - 1.5 &&
                bounds.bottom <= clip.bottom + 1.5, 'vertical clipping: ' + txt)
          }
          pieces.push({ txt, bounds })
        }
      }
      return pieces
    }
    function line(selector, expected, oneLine = true) {
      const el = find(selector),
        spans = fragments(el)
      require(tidy(el.innerText) === tidy(expected), selector + ' copy: ' + el.innerText)
      require(spans.length > 0, selector + ' has no visible glyphs')
      if (oneLine) {
        const sharedHeight =
          Math.min(...spans.map((s) => s.bounds.bottom)) - Math.max(...spans.map((s) => s.bounds.y))
        require(sharedHeight > 0, selector + ' wraps or splits across baselines')
      }
      report.lines[selector] = { text: el.innerText, fragments: spans }
      return spans
    }
    function translation(container, text) {
      const chinese = [...container.querySelectorAll('[lang^="zh"]')].find((e) =>
        tidy(e.innerText).includes(tidy(text)),
      )
      require(chinese, 'missing language-tagged ' + text)
      const zh = fragments(chinese)
      require(zh.length > 0 &&
        Math.max(...zh.map((s) => s.bounds.y)) < Math.min(...zh.map((s) => s.bounds.bottom)), text +
        ' clipped or wrapped')
      const english = fragments(container).filter((s) => /[a-zA-Z]/.test(s.txt))
      for (const a of english)
        for (const b of zh)
          require(!intersects(a.bounds, b.bounds), a.txt +
            ' overlaps ' +
            b.txt +
            ' ' +
            JSON.stringify([a.bounds, b.bounds]))
      return zh
    }
    function trailingBadge(container, chinese) {
      const english = fragments(container).filter((s) => /[a-z]/i.test(s.txt))
      const lastEnglish = Math.max(...english.map((s) => s.bounds.right))
      const firstChinese = Math.min(...chinese.map((s) => s.bounds.x))
      require(firstChinese >= lastEnglish - 1, 'suffix must follow the English title on the right')
    }
    const clear = (color) => color === 'transparent' || /^rgba\([^)]*,\s*0\)$/.test(color)

    if (mode === 1) {
      const brow = '.hero-copy .eyebrow',
        region = '.hero-copy .region-name'
      line(brow, 'OPEN WORLD / SECTOR 07 · 开放荒原')
      translation(find(brow), '开放荒原')
      const title = line('.hero-copy h1', 'DUST DIVISION', false)
      require(title.some((s) => s.txt === 'DUST') &&
        title.some((s) => s.txt === 'DIVISION'), 'hero title lost its English lettering')
      line(region, '尘域分部 — The Ashline Expanse')
      translation(find(region), '尘域分部')
      line('#deploy .launch-copy', 'ENTER SECTOR 进入扇区')
      translation(find('#deploy .launch-copy'), '进入扇区')
      require(!find('#deploy').disabled, 'ready/park return did not restore the bilingual CTA')
      const launch = box(find('#deploy').getBoundingClientRect()),
        hotkey = find('#deploy').querySelector('kbd').getBoundingClientRect()
      if (innerWidth <= 430 && innerHeight > innerWidth) {
        // The portrait wordmark ends on open sky before the heliostat rim.
        const titleRight = Math.max(...title.map((s) => s.bounds.right))
        const subtitleRight = Math.max(...report.lines[region].fragments.map((s) => s.bounds.right))
        require(subtitleRight <= titleRight + 1 &&
          launch.right <= titleRight + 1, 'portrait subtitle or CTA extends beyond the clear wordmark column')
        report.heroColumn = { titleRight, subtitleRight, buttonRight: launch.right }
      }
      for (const { bounds } of report.lines['#deploy .launch-copy'].fragments) {
        require(bounds.x >= launch.x - 1 && bounds.right <= launch.right + 1, 'launch copy outside CTA')
        require(!intersects(bounds, box(hotkey)), 'launch copy overlaps Enter shortcut')
      }
    }
    if (mode === 2) {
      line('.city-eyeline', 'MUNICIPAL ATLAS · 城区图志')
      translation(find('.city-eyeline'), '城区图志')
      line('.city-title', 'Quarry District 采石区')
      trailingBadge(find('.city-title'), translation(find('.city-title'), '采石区'))
      require(clear(
        getComputedStyle(find('.topbar')).backgroundColor,
      ), 'city navigation backing became opaque')
      require(!document.querySelector('#modes-nav').getClientRects()
        .length, 'traditional navigation visible in city')
      const clock = find('.city-time')
      const sample = clock.cloneNode(true)
      sample.style.visibility = 'hidden'
      sample.setAttribute('aria-hidden', 'true')
      clock.after(sample)
      try {
        // Reserve room for a changing live forecast even when the test boots on a clear day.
        for (const weather of ['Clear', 'Crosswind', 'Dust front']) {
          const forecast = sample.querySelector('[data-ui="weather"]')
          forecast.textContent = 'Day 01 / ' + weather
          for (const row of sample.children) {
            const range = document.createRange()
            range.selectNodeContents(row)
            const bounds = [...range.getClientRects()].filter((r) => r.width && r.height).map(box)
            if (row === forecast) require(bounds.length === 1, 'city forecast wraps in ' + weather)
            for (const rect of bounds) {
              require(rect.x >= -1 && rect.right <= innerWidth + 1, 'city clock overflows in ' + weather)
              for (const run of report.lines['.city-title'].fragments)
                require(!intersects(run.bounds, rect), 'city title overlaps clock in ' + weather)
            }
          }
        }
      } finally {
        sample.remove()
      }
    }
    if (mode === 3) {
      line('.industry-eyeline', 'NETWORK CONTROL · 管网调度')
      translation(find('.industry-eyeline'), '管网调度')
      const title = line('.industry-title', 'FABRICATION / 工业筑造')
      trailingBadge(find('.industry-title'), translation(find('.industry-title'), '工业筑造'))
      const el = find('.mh-industry:not(.mh-raid) .mh-tl'),
        block = box(el.getBoundingClientRect())
      const load = box(find('.industry-power').getBoundingClientRect()),
        plaque = box(find('.industry-title').getBoundingClientRect())
      for (const { bounds } of title)
        require(bounds.x >= plaque.x - 1.5 &&
          bounds.right <= plaque.right + 1.5, 'title outside local plaque')
      require(clear(getComputedStyle(el).backgroundColor), 'full caption block unexpectedly opaque')
      require(!clear(
        getComputedStyle(find('.industry-title')).backgroundColor,
      ), 'missing local fabrication plaque')
      for (const selector of ['.industry-eyeline', '.industry-title', '.industry-grid-readout']) {
        const child = box(find(selector).getBoundingClientRect())
        require(child.x >= block.x - 1 &&
          child.right <= block.right + 1 &&
          child.y >= block.y - 1 &&
          child.bottom <= block.bottom + 1, selector + ' exceeds the full .mh-tl bounds')
      }
      require(block.x >= 0 &&
        block.right <= innerWidth + 1 &&
        block.bottom <= innerHeight + 1 &&
        !intersects(block, load), 'full .mh-tl overlaps Grid Load or viewport')
    }
    if (mode === 4) {
      const title = line('.battle-title', 'QUARRY WARDEN 采石镇守', innerWidth > 600),
        zh = translation(find('.battle-title'), '采石镇守')
      if (innerWidth > 600) trailingBadge(find('.battle-title'), zh)
      const scope = box(find('.battle-scope').getBoundingClientRect())
      for (const { bounds } of title)
        require(!intersects(bounds, scope), 'Warden title or badge overlaps telemetry ' +
          JSON.stringify([bounds, scope]))
      for (const s of zh)
        for (const selector of ['.boss-line progress', '.boss-line [data-ui="boss-pct"]'])
          require(!intersects(
            s.bounds,
            box(find(selector).getBoundingClientRect()),
          ), 'Warden badge overlaps integrity readout')
    }
    return report
  }, mode)
}
