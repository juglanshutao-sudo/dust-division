import { LOCATIONS, EXTRACTION, type GameState } from './sim'
export function createMinimap(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')
  const paper = document.createElement('canvas')
  paper.width = canvas.width
  paper.height = canvas.height
  const ink = paper.getContext('2d')
  const w = canvas.width,
    h = canvas.height
  const project = (x: number, z: number) => [((x + 52) / 108) * w, ((z + 55) / 100) * h] as const
  const elevation = (x: number, y: number) =>
    10 * Math.sin(x * 0.018 + y * 0.033) +
    13 * Math.sin(x * 0.012 - y * 0.041) +
    4 * Math.cos(x * 0.038 + y * 0.035) +
    4 * Math.sin(Math.hypot(x - 270, y - 100) * 0.046)
  if (ink) {
    ink.lineWidth = 1.2
    ink.strokeStyle = 'rgba(255,248,228,.62)'
    for (let level = -28; level < 30; level += 3.7) {
      ink.beginPath()
      for (let y = 0; y < h; y += 6)
        for (let x = 0; x < w; x += 6) {
          const corners = [
            [x, y],
            [x + 6, y],
            [x + 6, y + 6],
            [x, y + 6],
          ]
          const heights = corners.map(([a, b]) => elevation(a, b))
          let count = 0
          for (let k = 0; k < 4; k++) {
            const next = (k + 1) % 4,
              a = heights[k],
              b = heights[next]
            if (a < level === b < level) continue
            const f = (level - a) / (b - a)
            const px = corners[k][0] + (corners[next][0] - corners[k][0]) * f,
              py = corners[k][1] + (corners[next][1] - corners[k][1]) * f
            if (count++ % 2 === 0) ink.moveTo(px, py)
            else ink.lineTo(px, py)
          }
        }
      ink.stroke()
    }
    ink.strokeStyle = '#fff0d5'
    ink.lineWidth = 1.7
    ink.setLineDash([3, 4])
    ink.beginPath()
    const route = [
      [-45, 35],
      [-12, 28],
      [0, 0],
      [0, -10],
      [-14, -22],
      [0, -36],
      [14, -22],
      [34, -30],
      [46, -23],
    ]
    route.forEach(([x, z], i) => {
      const [a, b] = project(x, z)
      if (i) ink.lineTo(a, b)
      else ink.moveTo(a, b)
    })
    ink.stroke()
    ink.setLineDash([])
    for (const loc of LOCATIONS) {
      const [x, y] = project(loc.x, loc.z)
      ink.fillStyle = '#24241e'
      ink.strokeStyle = '#ebdfc8'
      ink.fillRect(x - 3, y - 3, 6, 6)
      ink.strokeRect(x - 3, y - 3, 6, 6)
    }
  }
  return (s: GameState) => {
    if (!ctx) return
    ctx.clearRect(0, 0, w, h)
    ctx.drawImage(paper, 0, 0)
    const p = s.raid.active ? s.party : s.rover
    const [x, y] = project(p.x, p.z)
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(-p.heading + Math.PI)
    ctx.fillStyle = '#ff7a39'
    ctx.strokeStyle = '#1e1e16'
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.moveTo(0, -9)
    ctx.lineTo(6, 6)
    ctx.lineTo(0, 3)
    ctx.lineTo(-6, 6)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.restore()
    if (s.raid.active) {
      const [a, b] = project(EXTRACTION.x, EXTRACTION.z)
      ctx.strokeStyle = '#a5f0ae'
      ctx.strokeRect(a - 4, b - 4, 8, 8)
    }
  }
}
