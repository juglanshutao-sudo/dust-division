import type { Mode } from './sim'
export interface RenderStats {
  calls: number
  triangles: number
  renderWidth?: number
  renderHeight?: number
  adapter?: string
}
export interface FrameSample {
  recordedAt: string
  renderer: string
  adapter: string
  quality: string
  viewport: number[]
  renderSize: number[]
  modes: Mode[]
  frames: number
  durationMs: number
  meanFps: number
  medianMs: number
  p95Ms: number
  p99Ms: number
}
const round = (value: number) => Math.round(value * 100) / 100
export function finishSample(
  intervals: number[],
  modes: Set<Mode>,
  renderer: string,
  quality: string,
  stats?: RenderStats,
): FrameSample {
  const sorted = [...intervals].sort((a, b) => a - b)
  const duration = intervals.reduce((total, value) => total + value, 0)
  const percentile = (q: number) => round(sorted[Math.max(0, Math.ceil(sorted.length * q) - 1)])
  const canvas = document.querySelector<HTMLCanvasElement>('#world')
  return {
    recordedAt: new Date().toISOString(),
    renderer,
    adapter: stats?.adapter ?? renderer,
    quality,
    viewport: [innerWidth, innerHeight],
    renderSize: [
      stats?.renderWidth ?? canvas?.width ?? innerWidth,
      stats?.renderHeight ?? canvas?.height ?? innerHeight,
    ],
    modes: [...modes],
    frames: intervals.length,
    durationMs: round(duration),
    meanFps: round((intervals.length * 1000) / duration),
    medianMs: percentile(0.5),
    p95Ms: percentile(0.95),
    p99Ms: percentile(0.99),
  }
}
