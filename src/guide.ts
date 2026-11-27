import type { FrameSample } from './frame-sample'
export const guideContent = [
  {
    name: 'Overworld',
    description:
      '从 Ashline 荒原启程。驾驶六轮勘探车接近物资箱，按 E 回收合金。车队补给会触发限时派送，45 秒内返回 Motor Pool 可获额外合金。进入街区后，建筑标牌可直接打开设施。',
    rows: [
      ['W / S', '油门与倒车'],
      ['A / D', '转向'],
      ['Shift / Space', '手刹漂移'],
      ['E', '搜集物资或进入据点'],
      ['R', '停车，返回主入口'],
    ],
  },
  {
    name: 'City',
    description:
      '街区是一张可操作的地图。点击建筑标牌，在基地整备、生产和夜袭之间移动。Motor Pool 消耗合金提升底盘等级、小队耐久与攻击力。',
    rows: [
      ['Switchyard', '铺设电力节点'],
      ['The Foundry', '安装精炼设施'],
      ['Motor Pool', '改装载具'],
      ['Nightwatch', '布置小队与出击'],
    ],
  },
  {
    name: 'Industry',
    description:
      '选择模块，再点地块放置。发电机和中继给相邻八格供电，传送带以直线或 45° 转角连接采集器和精炼厂。回收的守卫核心可提高发电量。选中已占用地块可拆除。',
    rows: [
      ['Generator', '提供 8 单位电力'],
      ['Relay', '延伸相邻供电范围'],
      ['Extractor', '2 电力，采集矿石'],
      ['Conveyor', '在采集与精炼之间输送物料'],
      ['Refinery', '3 电力，将矿石炼成合金'],
    ],
  },
  {
    name: 'Combat',
    description:
      '选队员指定领队，再点九宫格换位。直线阵增加攻击，楔阵增加破韧，疏阵降低受到的伤害。夜袭基础时限 110 秒，剩余电力最多延长 18 秒。贴近守卫交替攻击触发共鸣，观察红色招式前摇，在命中前弹反。可提前呼叫撤离，进入信标范围并坚守 5 秒即可带回战利品。',
    rows: [
      ['W A S D', '移动小队'],
      ['J / Click', '攻击'],
      ['K', '极限弹反'],
      ['Q', '切换角色'],
      ['Space', '闪避'],
      ['E / F', '交互或处决暴露核心'],
    ],
  },
]
export function renderGuide(index: number) {
  const g = guideContent[index]
  return (
    '<h2 id="dialog-title">Field guide</h2><div class="guide-tabs">' +
    guideContent
      .map(
        (v, i) =>
          '<button class="tab-guide" data-tab="' +
          i +
          '" aria-pressed="' +
          (i === index) +
          '">' +
          v.name +
          '</button>',
      )
      .join('') +
    '</div><p class="guide-copy" lang="zh-CN">' +
    g.description +
    '</p>' +
    g.rows
      .map(
        ([key, label]) =>
          '<div class="guide-row"><span lang="zh-CN">' + label + '</span><kbd>' + key + '</kbd></div>',
      )
      .join('')
  )
}
export interface Preferences {
  compatibility: boolean
  audio: boolean
  volume: number
  quality: 'auto' | 'high' | 'low'
  motion: boolean
}
export function renderSettings(
  p: Preferences,
  renderer: string,
  fps: number,
  stats?: { calls: number; triangles: number },
  sample?: FrameSample | null,
) {
  return (
    '<h2 id="dialog-title">Settings</h2><div class="pref"><label for="render-path">Render path</label><select id="render-path"><option value="webgl" ' +
    (p.compatibility ? '' : 'selected') +
    '>3D / WEBGL 2</option><option value="canvas" ' +
    (p.compatibility ? 'selected' : '') +
    '>2D / COMPATIBILITY</option></select></div><div class="pref"><label for="quality">Render quality</label><select id="quality">' +
    ['auto', 'high', 'low']
      .map(
        (q) =>
          '<option value="' +
          q +
          '" ' +
          (q === p.quality ? 'selected' : '') +
          '>' +
          q.toUpperCase() +
          '</option>',
      )
      .join('') +
    '</select></div><div class="pref"><label for="volume">Master volume</label><div><input id="volume" type="range" min="0" max="100" value="' +
    Math.round(p.volume * 100) +
    '"> <b id="volume-text">' +
    Math.round(p.volume * 100) +
    '%</b></div></div><div class="pref"><span>Camera impact</span><button id="motion" aria-pressed="' +
    p.motion +
    '">' +
    (p.motion ? 'FULL' : 'REDUCED') +
    '</button></div><div class="pref"><span>Display</span><button id="fullscreen">FULLSCREEN</button></div><div class="pref"><span>Renderer</span><small>' +
    renderer +
    ' · ' +
    Math.round(fps) +
    ' FPS</small></div>' +
    (stats
      ? '<div class="pref"><span>Draw calls / triangles</span><small>' +
        stats.calls +
        ' / ' +
        Math.round(stats.triangles).toLocaleString() +
        '</small></div>'
      : '') +
    '<div class="pref"><span>Frame timings</span><button id="measure-frames">RECORD 10 S</button></div>' +
    (sample
      ? '<div class="sample-result"><span>' +
        Number(sample.meanFps).toFixed(1) +
        ' FPS · P95 ' +
        Number(sample.p95Ms).toFixed(1) +
        ' ms</span><button id="export-frames">Export JSON</button></div>'
      : '') +
    '<button class="dialog-command" id="settings-guide">FIELD GUIDE</button>'
  )
}
