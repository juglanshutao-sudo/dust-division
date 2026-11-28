// The simulation stores its original labels. Translate them only at presentation time,
// so a language change can redraw an existing notification, waypoint or saved result.
const labels = new Map<string, string>([
  ['Overworld', '开放荒原'],
  ['District', '采石区'],
  ['Operations', '作业控制'],
  ['Encounter', '战斗'],
  ['SYSTEM ONLINE', '系统在线'],
  ['SORTIE ACTIVE', '夜袭进行中'],
  ['GRID ONLINE', '电网在线'],
  ['SQUAD LINKED', '小队已连接'],
  ['Switchyard', '配电站'],
  ['The Foundry', '铸造厂'],
  ['Nightwatch', '夜巡站'],
  ['Motor Pool', '车库'],
  ['Vanguard', '先锋'],
  ['Conductor', '导流者'],
  ['Breaker', '破盾手'],
  ['Execute', '处决'],
  ['Hold extraction', '坚守撤离区'],
  ['Call extraction', '呼叫撤离'],
  ['Locate cache', '寻找物资箱'],
  ['Deliver freight', '交付货物'],
  ['Survey district', '查看城区'],
  ['Power grid', '查看电网'],
  ['Production', '查看产线'],
  ['Squad dispatch', '派遣小队'],
  ['Refit rover', '改装勘探车'],
  ['Field link established', '荒原通信已接通'],
  ['Extract before docking', '先完成撤离，再返回车库'],
  ['Refit unavailable during sortie', '夜袭期间无法改装'],
  ['Rover at maximum rank', '勘探车已达最高等级'],
  ['Insufficient alloy', '合金不足'],
  ['No active sortie', '当前没有夜袭任务'],
  ['Beacon active · reach the landing zone', '信标已开启，前往着陆区'],
  ['Cache unavailable', '物资箱不可搜刮'],
  ['Move closer to cache', '靠近物资箱'],
  ['Convoy freight · deliver to Motor Pool', '已接收车队货物，运往车库'],
  ['Drive freight to Motor Pool', '将货物运回车库'],
  ['Locate a field cache or the extraction beacon', '寻找物资箱或撤离信标'],
  ['Construction paused during sortie', '夜袭期间暂停建造'],
  ['Outside build area', '超出建造范围'],
  ['Empty footprint', '空地块'],
  ['Footprint occupied', '该地块已被占用'],
  ['Module reclaimed', '模块已拆除，部分合金已回收'],
  ['Night sortie deployed', '小队已进入夜袭区域'],
  ['Deployment locked on sortie', '夜袭期间无法更改站位'],
  ['Formation locked on deployment', '出击后无法调整编队顺序'],
  ['Core exposed · execute', '核心暴露，可执行处决'],
  ['Warden staggered', '采石镇守失衡'],
  ['Guard', '格挡'],
  ['Quickstep', '闪避'],
  ['Core shielded', '核心护盾仍在生效'],
  ['Approach exposed core', '靠近暴露的核心'],
  ['Core secured · extract', '已取得核心，请撤离'],
  ['Perfect parry', '极限弹反'],
  ['Squad down', '小队全员倒下'],
  ['Freight delivery expired', '货运交付超时'],
  ['Dust front', '沙尘锋面'],
  ['Crosswind', '侧风'],
  ['Clear skies', '晴朗'],
  ['Hold landing zone', '坚守着陆区'],
  ['Extraction complete', '撤离成功'],
  ['Extraction interrupted', '撤离中断'],
  ['Signal lost', '撤离超时，信号已断开'],
])

// Build exact messages for the named slots. An unfamiliar event remains unchanged.
for (const [name, zh] of Object.entries({
  Generator: '发电机',
  Relay: '中继节点',
  Extractor: '采集器',
  Conveyor: '传送带',
  Refinery: '精炼厂',
})) {
  labels.set(name, zh)
  labels.set(name + ' installed', zh + '已安装')
}
for (const [name, zh] of Object.entries({ Vale: '维尔', Iris: '艾瑞丝', Flint: '弗林特' })) {
  labels.set(name, zh)
  labels.set(name + ' in position', zh + '已接替出战')
}
for (const [name, zh] of Object.entries({ Kinetic: '动能', Arc: '电弧', Thermal: '热能' })) {
  labels.set(name, zh)
  labels.set(name + ' strike', zh + '攻击')
  labels.set(name + ' impact', zh + '命中')
  labels.set('Resonance · ' + name, '属性共鸣 · ' + zh)
}
for (const [name, zh] of Object.entries({ Bulwark: '壁垒', Induction: '感应', Overpressure: '超压' })) {
  labels.set(name, zh)
  labels.set(name + ' formation', '领队羁绊 · ' + zh)
}
for (const [name, zh] of Object.entries({ Line: '直线阵', Wedge: '楔形阵', Dispersed: '分散阵' })) {
  labels.set(name, zh)
  labels.set(name + ' deployment', '部署阵型 · ' + zh)
}
for (const [move, zh] of Object.entries({ sweep: '横扫', slam: '重砸', lunge: '突进' })) {
  labels.set(move, zh)
  labels.set('Warden · ' + move, '采石镇守 · ' + zh)
}

const numberedLabels: ReadonlyArray<readonly [RegExp, string]> = [
  [/^Chassis refit · Mk (\d+)$/, '底盘已改装 · Mk $1'],
  [/^Motor Pool · (\d+) s$/, '运往车库 · 剩余 $1 秒'],
  [/^Salvage \+(\d+(?:\.\d+)?)$/, '回收合金 +$1'],
  [/^Recovered (\d+(?:\.\d+)?) alloy$/, '已回收 $1 合金'],
  [/^Freight delivered · \+(\d+(?:\.\d+)?) alloy$/, '货物已交付 · 合金 +$1'],
  [/^(\d+) impact received$/, '受到 $1 点伤害'],
  [/^Recording frame times · (\d+) s$/, '正在记录帧时间 · $1 秒'],
  [
    /^Frame sample saved · (\d+(?:\.\d+)?) FPS · P95 (\d+(?:\.\d+)?) ms$/,
    '帧时间采样已保存 · $1 FPS · P95 $2 毫秒',
  ],
]

export function translateEvent(text: string): string {
  const label = labels.get(text)
  if (label !== undefined) return label
  for (const [pattern, translated] of numberedLabels) {
    if (pattern.test(text)) return text.replace(pattern, translated)
  }
  return text
}
