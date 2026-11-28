import './settings.css'
import type { FrameSample, RenderStats } from './frame-sample'
import { t, uiLanguage } from './language'

export interface Preferences {
  compatibility: boolean
  audio: boolean
  volume: number
  quality: 'auto' | 'high' | 'low'
  motion: boolean
}

const labels = {
  Language: '语言',
  'Render path': '渲染方式',
  'Render quality': '画面质量',
  AUTO: '自动',
  HIGH: '高',
  LOW: '低',
  '2D / COMPATIBILITY': '2D / 兼容模式',
  'Master volume': '主音量',
  'Camera impact': '镜头震动',
  FULL: '完整',
  REDUCED: '减弱',
  Display: '显示',
  FULLSCREEN: '进入全屏',
  'EXIT FULLSCREEN': '退出全屏',
  UNAVAILABLE: '不可用',
  Renderer: '渲染器',
  Initializing: '初始化中',
  'Draw calls / triangles': '绘制调用 / 三角面',
  'Frame timings': '帧耗时',
  'RECORD 10 S': '采样 10 秒',
  RECORDING: '采样中',
  'Export JSON': '导出 JSON',
} as const

export function settingText(label: keyof typeof labels) {
  return uiLanguage() === 'zh-CN' ? labels[label] : label
}

export function renderSettings(
  p: Preferences,
  renderer: string,
  fps: number,
  stats: RenderStats | undefined,
  sample: FrameSample | null,
  sampling: boolean,
) {
  const language = uiLanguage()
  const text = settingText
  const option = (value: string, label: string, selected: boolean, lang?: string) =>
    `<option value="${value}"${selected ? ' selected' : ''}${lang ? ` lang="${lang}"` : ''}>${label}</option>`
  const selectRow = (id: string, label: string, choices: string[]) =>
    `<div class="pref"><label for="${id}">${label}</label><select id="${id}">${choices.join('')}</select></div>`
  const volume = Math.round(p.volume * 100)
  const result = sample
    ? `<div class="sample-result"><span>${Number(sample.meanFps).toFixed(1)} FPS · P95 ${Number(sample.p95Ms).toFixed(1)} ms</span><button id="export-frames">${text('Export JSON')}</button></div>`
    : ''
  return `<div class="settings-head"><h2 id="dialog-title" tabindex="-1">${t('Settings')}</h2><button class="dialog-command" id="settings-guide">${t('STARTER GUIDE')}</button></div>
    ${selectRow('ui-language', text('Language'), [
      option('en', 'English', language === 'en', 'en'),
      option('zh-CN', '简体中文', language === 'zh-CN', 'zh-CN'),
    ])}
    ${selectRow('render-path', text('Render path'), [
      option('webgl', '3D / WEBGL 2', !p.compatibility),
      option('canvas', text('2D / COMPATIBILITY'), p.compatibility),
    ])}
    ${selectRow('quality', text('Render quality'), [
      option('auto', text('AUTO'), p.quality === 'auto'),
      option('high', text('HIGH'), p.quality === 'high'),
      option('low', text('LOW'), p.quality === 'low'),
    ])}
    <div class="pref"><label for="volume">${text('Master volume')}</label><div><input id="volume" type="range" min="0" max="100" value="${volume}"> <b id="volume-text">${volume}%</b></div></div>
    <div class="pref"><span id="motion-label">${text('Camera impact')}</span><button id="motion" aria-describedby="motion-label" aria-pressed="${p.motion}">${text(p.motion ? 'FULL' : 'REDUCED')}</button></div>
    <div class="pref"><span id="display-label">${text('Display')}</span><button id="fullscreen" aria-describedby="display-label">${text(document.fullscreenElement ? 'EXIT FULLSCREEN' : 'FULLSCREEN')}</button></div>
    <div class="pref"><span>${text('Renderer')}</span><small>${renderer === 'Initializing' ? text('Initializing') : renderer} · ${Math.round(fps)} FPS</small></div>
    ${stats ? `<div class="pref"><span>${text('Draw calls / triangles')}</span><small>${stats.calls} / ${Math.round(stats.triangles).toLocaleString(language)}</small></div>` : ''}
    <div class="pref"><span id="sample-label">${text('Frame timings')}</span><button id="measure-frames" aria-describedby="sample-label"${sampling ? ' disabled' : ''}>${text(sampling ? 'RECORDING' : 'RECORD 10 S')}</button></div>
    ${result}`
}
