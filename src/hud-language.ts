import { t, uiLanguage } from './language'

const copy: Record<string, string> = {
  'City district': '城区沙盘',
  'Municipal atlas': '城区图志',
  'Quarry District': '采石区',
  'Local time': '当地时间',
  'District stores': '据点仓储',
  ALLOY: '合金',
  ORE: '矿石',
  CORES: '核心',
  'Street dispatch': '街区动态',
  'Day {0} / {1}': '第 {0} 天 / {1}',
  'Motor Pool · {0} s': '车库 · 剩余 {0} 秒',
  'Salvage · {0} m': '物资点 · {0} 米',
  'All caches recovered': '物资已全部回收',
  'Cargo banked': '物资已入库',
  'Sortie lost': '行动失败',
  '+{0} alloy / +{1} core': '+{0} 合金 / +{1} 核心',
  'Dismiss sortie report': '关闭行动报告',
  Close: '关闭',
  Space: '空格',
  'Deliver freight · {0} alloy': '交付货物 · 奖励 {0} 合金',
  'Deliver freight': '交付货物',
  'Fully refitted': '改装已满级',
  'Refit · {0} alloy': '底盘改装 · {0} 合金',
  'Motor Pool · {0}': '车库 · {0}',
  MAX: '已满级',
  'Industrial construction': '工业建设',
  'Construction field, arrow keys to move and Enter to place': '建造区域，方向键选择地块，回车建造',
  'Network control': '管网调度',
  Fabrication: '工业筑造',
  'Grid load': '电网负载',
  'Build tool': '建造工具',
  'Select {0} · {1} alloy': '选择{0} · {1} 合金',
  Remove: '拆除',
  'Squad uplink': '小队整备',
  '{0} alloy': '{0} 合金',
  '+{0} alloy / min': '+{0} 合金 / 分',
  Linked: '已连通',
  Idle: '空闲',
  Online: '已供电',
  Unpowered: '未供电',
  'Place {0}': '放置{0}',
  'Select a build site': '选择建造地块',
  'Extraction operations': '战术撤离',
  'Exclusion zone / time left': '禁区 / 剩余时间',
  'Unbanked cargo': '待撤离物资',
  'Engage warden': '迎战镇守',
  'Search cache · {0} alloy': '搜查物资箱 · {0} 合金',
  'Activate extraction beacon': '启动撤离信标',
  LZ: '撤离点',
  'Hold position': '守住撤离点',
  '{0} m / Landing zone': '{0} 米 / 撤离点',
  'Uplink {0} s': '信标接通 · {0} 秒',
  'Beacon active': '信标已启动',
  'Call extraction': '呼叫撤离',
  'Search +{0}': '搜取 +{0}',
  '{0} m': '{0} 米',
  'Warden encounter and squad formation': '镇守战与小队编队',
  'Quarry Warden': '采石镇守',
  'Warden integrity': '镇守耐久',
  Telemetry: '战况监测',
  'Deployment board, three by three': '三乘三部署棋盘',
  'Line · three aligned cells. Wedge · one operator adjacent to both allies. Dispersed · separated cells.':
    '直线阵：三人共线。楔形阵：一名干员与两名队友相邻。分散阵：三人分散部署。',
  Formation: '阵型',
  'Squad formation': '小队编队',
  'Squad integrity': '小队耐久',
  'Launch incursion': '出击',
  Attack: '攻击',
  Parry: '弹反',
  Dodge: '闪避',
  Finish: '处决',
  'Extraction field': '前往撤离区',
  'Exclusion zone / {0}': '禁区 / {0}',
  'Encounter preparation': '战前整备',
  'P{0} / 3': '阶段 {0} / 3',
  Standby: '待命',
  Tracking: '追击',
  Recovering: '收招',
  Staggered: '失衡',
  'Core exposed': '核心暴露',
  'Core secured': '核心已回收',
  Offline: '离线',
  PARRY: '弹反',
  EXECUTE: '处决',
  LIVE: '在线',
  '{0} s': '{0} 秒',
  '{0}s': '{0}秒',
  '+8% strike damage': '攻击伤害 +8%',
  '+12% stagger': '失衡积累 +12%',
  '−15% damage taken': '承受伤害 −15%',
  'Place {0} on a tile': '选择格子部署{0}',
  '{0} deployed': '{0}已部署',
  'Swap {0} with {1}': '将{0}与{1}换位',
  'Squad channel': '小队频道',
  'Lead operator': '领队干员',
  'Bond · {0} · Formation · {1}': '羁绊 · {0} · 阵型 · {1}',
  'Extended parry': '延长弹反窗口',
  'Arc resonance': '电弧共鸣',
  'Stagger bonus': '失衡强化',
  'Integrity {0} / {1}': '耐久 {0} / {1}',
  'Formation set': '编队就绪',
  'Switch to {0} / {1}': '切换至{0} / {1}',
  'Set formation lead · {0} / {1}': '设为领队 · {0} / {1}',
  'Core shielded': '核心受护盾保护',
  'Approach within 8 m': '接近至 8 米内',
  'Impact hold': '命中顿帧',
  Paused: '已暂停',
  Ready: '就绪',
  'Core exposed until sortie ends · {0} s': '核心已暴露 · 行动剩余 {0} 秒',
  OK: '确认',
}

// Placeholders stay separate from translated nouns so Chinese can reorder a sentence.
export function hudText(english: string, ...values: (string | number)[]) {
  const pattern = uiLanguage() === 'zh-CN' && /[a-z]/i.test(english) ? (copy[english] ?? t(english)) : english
  if (!values.length) return pattern
  return pattern.replace(/\{(\d+)\}/g, (_, index) => String(values[Number(index)]))
}

// Bind the authored English once per mount. Language changes then update only these leaves,
// preserving focus, the selected tile, CSS animations and the running game's state.
export function bindHudCopy(section: HTMLElement) {
  const originals: Array<() => void> = []
  const walker = section.ownerDocument.createTreeWalker(section, 4)
  while (walker.nextNode()) {
    const node = walker.currentNode as Text
    const value = node.data,
      key = value.trim()
    if (!/[a-z]/i.test(key) || node.parentElement?.closest('h1,.eyeline-zh,[aria-hidden="true"]')) continue
    originals.push(() => {
      node.data = value.replace(key, hudText(key))
    })
  }
  for (const el of [section, ...section.querySelectorAll('[aria-label],[title]')]) {
    for (const name of ['aria-label', 'title']) {
      const text = el.getAttribute(name)
      if (
        text &&
        (Object.hasOwn(copy, text) ||
          !el.matches('[data-cell],[data-district],[data-kind],[data-cache],.combat-act'))
      ) {
        originals.push(() => el.setAttribute(name, hudText(text)))
      }
    }
  }
  return () => originals.forEach((apply) => apply())
}
