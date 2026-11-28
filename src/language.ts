import { translateEvent } from './event-language'

export type UiLanguage = 'en' | 'zh-CN'

const storageKey = 'dust-division.language'
const listeners = new Set<(language: UiLanguage) => void>()

function initialLanguage(): UiLanguage {
  try {
    const saved = window.localStorage.getItem(storageKey)
    if (saved === 'en' || saved === 'zh-CN') return saved
  } catch {
    // The current session can still select a language without storage.
  }
  return /^zh(?:-|$)/i.test(navigator.language) ? 'zh-CN' : 'en'
}

let active = initialLanguage()
document.documentElement.lang = active

export function uiLanguage(): UiLanguage {
  return active
}

export function setLanguage(language: UiLanguage) {
  if (language !== 'en' && language !== 'zh-CN') return
  try {
    window.localStorage.setItem(storageKey, language)
  } catch {
    // Keep the preference in memory in restricted browser sessions.
  }
  if (active === language) return
  active = language
  document.documentElement.lang = active
  for (const listen of listeners) listen(active)
}

export function onLanguageChange(listen: (language: UiLanguage) => void) {
  listeners.add(listen)
  return () => {
    listeners.delete(listen)
  }
}

const chinese: Readonly<Record<string, string>> = {
  Overworld: '荒原',
  City: '城区',
  Industry: '工业',
  Combat: '战斗',
  'Ashline field simulation': '灰烬荒原实景',
  'Real-time 3D game world': '实时三维游戏世界',
  'Dust Division overworld': '尘域分部 · 荒原主页',
  'Game modes': '游戏模式',
  'OPEN WORLD': '开放荒原',
  'SECTOR 07': '扇区 07',
  'LOADING SECTOR': '正在载入扇区',
  'ENTER SECTOR': '进入扇区',
  'RESUME SORTIE': '继续行动',
  HELIOSTAT: '定日镜',
  'ARRAY 07': '阵列 07',
  'FIELD DRIVE': '荒原驾驶',
  'Ashline Expanse': '灰烬荒原',
  'Park rover': '停靠勘探车',
  WAYPOINT: '目的地',
  'LOCAL TIME': '当地时间',
  ATMOSPHERE: '气象',
  'SECTOR MAP': '扇区地图',
  'Sector minimap': '扇区小地图',
  'Position of rover and districts': '勘探车与城区的位置',
  'ASHLINE BASIN': '灰烬盆地',
  'N ↑': '北 ↑',
  '100 M': '100 米',
  'KM/H': '千米/时',
  AUDIO: '声音',
  'Mute audio': '静音',
  'Enable audio': '开启声音',
  'Toggle audio [M]': '切换声音 [M]',
  Settings: '设置',
  'FIELD SYSTEMS': '现场系统',
  'STARTER GUIDE': '新手攻略',
  'Starter guide [H]': '新手攻略 [H]',
  'Open starter guide': '打开新手攻略',
  'Measured rendering rate': '实测渲染帧率',
  'Close dialog': '关闭窗口',
  'Close [Esc]': '关闭 [Esc]',
  'Move forward': '向前',
  'Move left': '向左',
  'Move back': '向后',
  'Move right': '向右',
  'Switch mode': '切换模式',
  Deploy: '进入扇区',
  Drive: '驾驶',
  Drift: '漂移',
  Interact: '交互',
  'Build / inspect': '建造 / 查看',
  'Select cell': '选择地块',
  'Arrange squad': '编队',
  Move: '移动',
  'Strike / parry': '攻击 / 弹反',
  Switch: '切换队员',
  Click: '点击',
  'SORTIE PAUSED': '行动暂停',
  'SORTIE ACTIVE': '行动中',
  'GRID ONLINE': '管网在线',
  'SQUAD LINKED': '小队已连接',
  'SYSTEM ONLINE': '系统在线',
  Clear: '晴朗',
  Crosswind: '侧风',
  'Dust front': '沙尘锋面',
  Alloy: '合金',
  Ore: '矿石',
  Cores: '核心',
}

export function t(text: string): string {
  if (active === 'en') return text
  return Object.hasOwn(chinese, text) ? chinese[text] : translateEvent(text)
}
