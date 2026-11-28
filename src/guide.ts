import { uiLanguage } from './language'
import './guide.css'

type Text = readonly [english: string, chinese: string]
interface Step {
  title: Text
  text: Text
  keys?: string[]
}
interface Chapter {
  id: string
  name: Text
  title: Text
  introduction: Text
  steps: Step[]
  fieldNote: Text
}

const chapters: Chapter[] = [
  {
    id: 'drive',
    name: ['Driving', '荒原驾驶'],
    title: ['Take the wheel', '开出第一段车辙'],
    introduction: [
      'Drive the six-wheeler to a supply crate on the quarry floor.',
      '驾驶六轮勘探车，沿采石场地面驶向一只物资箱。',
    ],
    steps: [
      {
        title: ['Leave the motor pool', '驶入荒原'],
        keys: ['Enter'],
        text: [
          'Select Enter Sector. Hold W to accelerate. S brakes the rover, then reverses it. On a touch screen, hold the directional controls.',
          '选择「进入扇区」。按住 W 加速，按住 S 会先制动、再倒车。触屏上按住方向键即可驾驶。',
        ],
      },
      {
        title: ['Steer through a bend', '练习过弯'],
        keys: ['A', 'D', 'Shift'],
        text: [
          'Build some speed before turning. Hold A or D and briefly hold Shift or Space to slide the rear wheels. Release the handbrake to regain grip.',
          '先提速，再按 A 或 D 转向。过弯时短暂按住 Shift 或空格，车尾就会滑出。松开手刹，让轮胎重新抓地。',
        ],
      },
      {
        title: ['Approach a crate', '靠近物资箱'],
        keys: ['E'],
        text: [
          'Ease off the throttle beside a crate. When the waypoint offers Salvage, press E or tap Interact. The first field crate yields 5 alloy.',
          '在物资箱旁松开油门。目标提示出现可回收数量时，按 E 或点「交互」。起点附近的物资箱可获得 5 合金。',
        ],
      },
    ],
    fieldNote: [
      'R parks the rover and restores the entry screen. Enter Sector puts you back behind the wheel.',
      '按 R 驻车可回到主入口，再点「进入扇区」就能继续驾驶。',
    ],
  },
  {
    id: 'freight',
    name: ['Salvage & freight', '搜集与派送'],
    title: ['Deliver the convoy freight', '把车队货物送回车库'],
    introduction: [
      'Daytime salvage goes straight into district stores. The convoy crate also starts a timed delivery.',
      '白天回收的合金直接入库。拾取车队补给，还能接到一单限时派送。',
    ],
    steps: [
      {
        title: ['Recover the freight', '收取货物'],
        keys: ['E'],
        text: [
          'Drive to the convoy cache west of the motor pool. Get within 5.5 m and interact. You receive 8 alloy and the 45-second freight clock starts.',
          '驶向车库西侧的车队物资箱，靠近至 5.5 米内再交互。领取 8 合金的同时，45 秒派送倒计时开始。',
        ],
      },
      {
        title: ['Return to the motor pool', '交到车库'],
        keys: ['E'],
        text: [
          'Drive east toward Motor Pool. Once Deliver freight appears, interact again for 10 more alloy. An expired delivery costs the bonus.',
          '向东开回车库；出现交货提示时再次交互，额外获得 10 合金。超时会失去这笔派送奖励，已回收的合金仍在库里。',
        ],
      },
      {
        title: ['Spend the proceeds', '用合金整备'],
        keys: ['2'],
        text: [
          'Open the city and select Motor Pool after delivery. The first chassis refit costs 12 alloy and improves speed, squad health and attack power.',
          '交货后打开城区，选择车库。首次底盘改装花费 12 合金，可提高车速、小队耐久与攻击力。',
        ],
      },
    ],
    fieldNote: [
      'The city shows alloy, ore and cores separately. Switchyard opens the power grid; Nightwatch opens squad preparation.',
      '城区分别显示合金、矿石与核心库存。配电站通向电网，夜巡站通向战前编队。',
    ],
  },
  {
    id: 'power',
    name: ['Power & logistics', '供电与输送'],
    title: ['Bring a refinery online', '让精炼厂产出合金'],
    introduction: [
      'Open Switchyard or press 3. The starting installation has one powered line running at 3 alloy per minute.',
      '进入配电站，或按 3 打开基建。初始管网已接通一条生产线，每分钟产出 3 合金。',
    ],
    steps: [
      {
        title: ['Trace the power feed', '检查供电'],
        text: [
          'The generator at B4 supplies 8 MW. The relay at C4 carries power to any neighbouring tile, including diagonals. An extractor draws 2 MW; a refinery draws 3 MW.',
          'B4 发电机供电 8 MW，C4 中继节点把电送到相邻八格，斜向也能接通。采集器耗电 2 MW，精炼厂耗电 3 MW。',
        ],
      },
      {
        title: ['Follow the ore', '追踪矿石'],
        text: [
          'Trace D3 extractor → D4 conveyor → D5 refinery. Conveyors can turn 45°. Both machines need power, and ore must have a continuous path through a conveyor.',
          '沿 D3 采集器、D4 传送带、D5 精炼厂查看物流。传送带可按 45° 转弯；两端机器都要通电，矿石还须经过连续输送线路才能精炼。',
        ],
      },
      {
        title: ['Add one machine', '试建第二座精炼厂'],
        text: [
          'On the starting grid, choose Refinery and select empty C5. It costs 12 alloy, touches both the relay and conveyor, and raises output to 4 alloy per minute.',
          '在初始布局上选「精炼厂」，再点空地 C5。花费 12 合金后，新厂同时接上 C4 的电和 D4 的货，产量升至每分钟 4 合金。',
        ],
      },
    ],
    fieldNote: [
      'Inspect an occupied tile before choosing Remove. Dismantling refunds half the alloy cost, rounded down.',
      '点已占用地块可检查设备，再选拆除会退还一半造价，向下取整。',
    ],
  },
  {
    id: 'formation',
    name: ['Squad formation', '阵型与羁绊'],
    title: ['Choose a lead and formation', '先定领队，再布阵'],
    introduction: [
      'Open Nightwatch, use Squad uplink, or press 4. Formation and positions lock when the night sortie starts.',
      '从夜巡站、基建的小队入口或快捷键 4 进入编队。阵型和站位会在夜袭开始时锁定。',
    ],
    steps: [
      {
        title: ['Select the lead', '选择领队'],
        text: [
          'Select a crew member. Vale extends the parry window. Iris extends and strengthens resonance. Flint breaks the Warden’s poise faster with resonance.',
          '点队员设为领队。维尔的壁垒延长弹反窗口，艾瑞丝的感应强化共鸣并延长连携时间，弗林特的超压增加共鸣造成的失衡。',
        ],
      },
      {
        title: ['Lay out the board', '调整九宫格'],
        text: [
          'Select a cell to move the chosen operator there; occupied cells swap. Try moving Iris from the centre to the vacant top-middle cell. The three operators form a line for 8% extra damage.',
          '点棋盘格移动当前队员，点已有队员的格子会交换位置。可试着把艾瑞丝从中央移到上排中格：三人连成直线，伤害增加 8%。',
        ],
      },
      {
        title: ['Launch when ready', '确认后出击'],
        text: [
          'Wedge gains 12% more stagger. Dispersed reduces incoming damage by 15%. Choose Launch incursion when ready. Every spare MW adds 2 seconds to the 110-second sortie, up to 18 extra.',
          '楔形阵增加 12% 失衡积累，分散阵减免 15% 受击伤害。确认后启动夜袭。基础时限为 110 秒，每剩余 1 MW 电力增加 2 秒，最多多出 18 秒。',
        ],
      },
    ],
    fieldNote: [
      'During a sortie, Q or a crew slot switches the active operator. Your preselected lead bond remains in effect.',
      '实战时可按 Q 或点队员栏即时切人，出发前选定的领队羁绊持续生效。',
    ],
  },
  {
    id: 'combat',
    name: ['Combat & parry', '战斗与弹反'],
    title: ['Counter the Quarry Warden', '抓住镇守的出招空隙'],
    introduction: [
      'Watch the projected attack area and the windup gauge. The Warden changes attack sequence and tempo over three phases.',
      '观察招式覆盖范围和蓄力刻度。采石镇守会随血量进入三个阶段，连招顺序与节奏也随之变化。',
    ],
    steps: [
      {
        title: ['Close the gap and link hits', '贴近后打出共鸣'],
        keys: ['J', 'Q', 'J'],
        text: [
          'Move with WASD or the touch pad. Land a strike with J, a battlefield click or Attack, switch with Q, then hit with the new operator within 3 seconds. Iris’s lead bond gives you 4 seconds.',
          '用 WASD 或触屏方向键移动。按 J、点战场或点攻击键命中后，按 Q 换人，在 3 秒内再命中即可共鸣；艾瑞丝领队时窗口为 4 秒。',
        ],
      },
      {
        title: ['Guard at impact', '在命中前弹反'],
        keys: ['K', 'Space'],
        text: [
          'Wait for the final parry cue, then press K or tap Parry just before contact. A perfect parry staggers the Warden and opens a counterattack. Use Space or Dodge to step clear if the timing is unsafe.',
          '等到前摇末段出现弹反提示，再在招式命中前按 K 或点「弹反」。成功后镇守会硬直，抓紧反击。来不及判断时，可按空格或点「闪避」移出攻击范围。',
        ],
      },
      {
        title: ['Execute an exposed core', '处决暴露的核心'],
        keys: ['F'],
        text: [
          'At low health the core breaks open. Move within 8 m and press F or tap Finish. The squad now carries 24 extra alloy and one core. You can also withdraw before defeating the Warden.',
          '镇守濒危时核心会暴露。接近至 8 米内按 F 或点处决键，队伍将携带额外 24 合金和 1 枚核心。也可以绕开镇守，提前撤离。',
        ],
      },
    ],
    fieldNote: [
      'Attacks during recovery or stagger deal extra damage. Save a switch for that opening.',
      '镇守收招或硬直期间受到的伤害更高，留一次切人连携给这个窗口。',
    ],
  },
  {
    id: 'extraction',
    name: ['Extraction', '撤离入库'],
    title: ['Bring the haul home', '把战利品带回据点'],
    introduction: [
      'Night salvage is carried by the squad. It enters district stores only after a successful extraction.',
      '夜间战利品暂由小队携带。只有成功撤离，物资才会转入据点库存。',
    ],
    steps: [
      {
        title: ['Search or leave early', '判断是否继续搜集'],
        keys: ['3', 'E'],
        text: [
          'Open Extraction field or press 3 to see the caches and LZ. Approach a cache within 5.5 m, then tap its marker or press E. Leave extra time for the walk back and the final hold.',
          '点撤离战区入口或按 3 查看物资箱和撤离点。走到箱子 5.5 米内，点标记或按 E 搜集。除了赶路时间，还要为最后的坚守留出余量。',
        ],
      },
      {
        title: ['Call the beacon', '呼叫撤离'],
        keys: ['X'],
        text: [
          'Press X or select Call extraction. Follow the distance and bearing to the marked LZ. Opening the field map by itself only shows the route.',
          '按 X 或选择「呼叫撤离」启动信标，跟随距离与方位提示走向标记点。打开战区地图只会显示路线，仍需发出撤离呼叫。',
        ],
      },
      {
        title: ['Hold the landing zone', '守住撤离区'],
        text: [
          'Stay within 4.5 m of the beacon for 5 continuous seconds. Stepping out resets the hold. A successful pickup banks the cargo. A wipe or timeout loses this sortie’s unbanked haul.',
          '在信标 4.5 米范围内连续坚守 5 秒，离开范围会重新计时。接应成功后，携带物资入库；团灭或超时会失去本次尚未入库的战利品。',
        ],
      },
    ],
    fieldNote: [
      'Back in the city, check your stores. Each banked core raises output by 1 MW per generator, up to 3 MW extra.',
      '回城后查看仓储。每枚入库核心可让每台发电机额外供电 1 MW，最多增加 3 MW。',
    ],
  },
]

interface Reading {
  chapter: string
  read: string[]
}
const storageKey = 'dust-division.guide.v1'
const validChapter = (id: unknown): id is string => chapters.some((chapter) => chapter.id === id)
let lastReading: Reading = { chapter: chapters[0].id, read: [] }

function restoreReading(): Reading {
  try {
    const raw = localStorage.getItem(storageKey)
    if (raw) {
      const data = JSON.parse(raw)
      if (data && validChapter(data.chapter) && Array.isArray(data.read)) {
        lastReading = { chapter: data.chapter, read: [...new Set<string>(data.read.filter(validChapter))] }
      }
    }
  } catch {
    // Browser storage can be unavailable for a private session or a local HTML file.
  }
  return { chapter: lastReading.chapter, read: [...lastReading.read] }
}

function saveReading(reading: Reading) {
  lastReading = { chapter: reading.chapter, read: [...reading.read] }
  try {
    localStorage.setItem(storageKey, JSON.stringify(lastReading))
  } catch {
    /* Keep progress for this session. */
  }
}

/** Mount the guide inside the game's native dialog. The caller owns pause, return and focus restoration. */
export function mountGuide(host: HTMLElement, onReturn: () => void): () => void {
  const reading = restoreReading()
  let index = chapters.findIndex((chapter) => chapter.id === reading.chapter)
  let indexOpen = false
  const keyboardRoot = host.closest('dialog') ?? host
  const number = (i: number) => String(i + 1).padStart(2, '0')
  const progressIcon = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="m2 6 2.5 2.5L10 3"/></svg>'
  const chevron = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="m4 2.5 3.5 3.5L4 9.5"/></svg>'

  function draw(focus?: string) {
    const language = uiLanguage()
    const copy = (text: Text) => text[language === 'zh-CN' ? 1 : 0]
    const chapter = chapters[index]
    const contents = copy(['Contents', '章节目录'])
    const read = copy(['read', '已读'])
    host.innerHTML = `<section class="field-manual" lang="${language}" data-chapter="${chapter.id}" data-index-open="${indexOpen}">
      <header class="manual-head"><h2 id="dialog-title" tabindex="-1">${copy(['Starter guide', '新手攻略'])}</h2>
        <div class="manual-progress"><span>${reading.read.length} / ${chapters.length} ${read}</span><div aria-hidden="true">${chapters.map((c) => `<i${reading.read.includes(c.id) ? ' class="read"' : ''}></i>`).join('')}</div></div>
      </header>
      <div class="manual-workspace">
        <button type="button" id="guide-contents-toggle" aria-controls="guide-contents" aria-expanded="${indexOpen}">${contents}<span>${number(index)} / ${number(chapters.length - 1)}</span>${chevron}</button>
        <nav id="guide-contents" class="manual-index" aria-label="${contents}"><p>${contents}</p>
          ${chapters
            .map((c, i) => {
              const done = reading.read.includes(c.id)
              return `<button type="button" data-guide-chapter="${c.id}" data-read="${done}"${i === index ? ' aria-current="page"' : ''} aria-label="${number(i)} · ${copy(c.name)}${done ? ' · ' + read : ''}"><small>${number(i)}</small><span>${copy(c.name)}</span>${done ? progressIcon : ''}</button>`
            })
            .join('')}
        </nav>
        <article class="manual-page" aria-labelledby="guide-page-title">
          <p class="manual-folio">${copy(['Chapter', '章节'])} ${number(index)} <i></i> ${copy(chapter.name)}</p>
          <h3 id="guide-page-title" tabindex="-1">${copy(chapter.title)}</h3><p class="manual-intro">${copy(chapter.introduction)}</p>
          <ol class="manual-steps">${chapter.steps.map((step, i) => `<li><div class="manual-step-head"><span class="manual-number" aria-hidden="true">${i + 1}</span><h4>${copy(step.title)}</h4>${step.keys ? `<span class="manual-keys">${step.keys.map((key) => `<kbd>${key}</kbd>`).join('')}</span>` : ''}</div><p>${copy(step.text)}</p></li>`).join('')}</ol>
          <p class="manual-note">${copy(chapter.fieldNote)}</p>
        </article>
      </div>
      <footer class="manual-footer"><button type="button" id="guide-return">${copy(['Back', '返回'])}</button>
        <div><button type="button" id="guide-prev"${index === 0 ? ' disabled' : ''} aria-keyshortcuts="ArrowLeft">${copy(['Previous', '上一章'])}</button>
        <button type="button" id="guide-next" aria-keyshortcuts="ArrowRight" title="${copy(['Mark chapter as read', '将本章标为已读'])}">${index === chapters.length - 1 ? copy(['Finish & return', '读完并返回']) : copy(['Next chapter', '下一章'])}</button></div>
      </footer>
    </section>`
    if (focus) host.querySelector<HTMLElement>(focus)?.focus({ preventScroll: true })
  }

  function navigate(next: number, markRead = false) {
    if (markRead && !reading.read.includes(chapters[index].id)) reading.read.push(chapters[index].id)
    if (next === chapters.length) {
      saveReading(reading)
      onReturn()
      return
    }
    index = Math.max(0, Math.min(chapters.length - 1, next))
    reading.chapter = chapters[index].id
    saveReading(reading)
    indexOpen = false
    draw('#guide-page-title')
  }
  function click(event: MouseEvent) {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button') : null
    if (!button || !host.contains(button) || button.disabled) return
    if (button.id === 'guide-return') {
      onReturn()
      return
    }
    if (button.id === 'guide-contents-toggle') {
      indexOpen = !indexOpen
      draw(indexOpen ? '[aria-current="page"]' : '#guide-contents-toggle')
    } else if (button.id === 'guide-next') navigate(index + 1, true)
    else if (button.id === 'guide-prev') navigate(index - 1)
    else if (button.dataset.guideChapter)
      navigate(chapters.findIndex((chapter) => chapter.id === button.dataset.guideChapter))
  }
  function keydown(event: Event) {
    if (
      !(event instanceof KeyboardEvent) ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.repeat
    )
      return
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      navigate(index + 1, true)
    } else if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault()
      navigate(index - 1)
    }
  }
  draw()
  host.addEventListener('click', click)
  keyboardRoot.addEventListener('keydown', keydown)
  return () => {
    host.removeEventListener('click', click)
    keyboardRoot.removeEventListener('keydown', keydown)
  }
}
