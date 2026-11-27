import * as T from 'three'
import { terrainHeight } from './landform'
import {
  CITY_BLOCKS,
  DISTRICT_SHEDS,
  DISTRICT_TANKS,
  DISTRICT_CARGO,
  GANTRIES,
  POWER_MASTS,
  SWITCHGEAR,
  CANOPY_POSTS,
} from './district-layout'

// Small architectural parts are instanced by primitive. A complete outpost costs
// a handful of draw calls even though every crane, tank and insulator is modeled.
export function buildArchitecture(scene: T.Scene, lowDetail = false) {
  const colors = {
    wall: '#c3b79f',
    white: '#e6dbc6',
    dark: '#333c3b',
    trim: '#686a60',
    amber: '#d59d36',
    blue: '#34495b',
    glass: '#343f40',
    copper: '#8e6145',
  }
  const groups = new Map<T.BufferGeometry, { matrix: T.Matrix4; color: T.Color }[]>()
  const cube = new T.BoxGeometry(1, 1, 1),
    cylinder = new T.CylinderGeometry(0.5, 0.5, 1, lowDetail ? 7 : 12),
    pipe = new T.CylinderGeometry(0.5, 0.5, 1, lowDetail ? 4 : 7),
    cone = new T.ConeGeometry(0.5, 1, lowDetail ? 7 : 12)
  const o = new T.Object3D(),
    a = new T.Vector3(),
    b = new T.Vector3(),
    yv = new T.Vector3(0, 1, 0)
  function register(g: T.BufferGeometry, c: string) {
    o.updateMatrix()
    let l = groups.get(g)
    if (!l) {
      l = []
      groups.set(g, l)
    }
    l.push({ matrix: o.matrix.clone(), color: new T.Color(c) })
  }
  function part(
    g: T.BufferGeometry,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    c: string,
    ry = 0,
    rz = 0,
  ) {
    o.position.set(x, y, z)
    o.scale.set(w, h, d)
    o.rotation.set(0, ry, rz)
    register(g, c)
  }
  function beam(
    x1: number,
    y1: number,
    z1: number,
    x2: number,
    y2: number,
    z2: number,
    d: number,
    c: string,
    square = false,
  ) {
    a.set(x1, y1, z1)
    b.set(x2, y2, z2)
    o.position.copy(a).add(b).multiplyScalar(0.5)
    a.sub(b)
    o.scale.set(d, a.length(), d)
    o.quaternion.setFromUnitVectors(yv, a.normalize())
    register(square ? cube : pipe, c)
  }
  const box = (x: number, y: number, z: number, w: number, h: number, d: number, c: string, ry = 0) =>
    part(cube, x, y, z, w, h, d, c, ry)
  const cyl = (x: number, y: number, z: number, w: number, h: number, c: string) =>
    part(cylinder, x, y, z, w, h, w, c)
  const ink = colors.dark,
    w = colors.wall,
    m = colors.trim,
    white = colors.white,
    amber = colors.amber
  function shed(
    x: number,
    z: number,
    width: number,
    depth: number,
    height: number,
    accent: string,
    doors = 1,
  ) {
    const y = terrainHeight(x, z)
    box(x, y + 0.12, z, width + 0.55, 0.3, depth + 0.5, m)
    box(x, y + height * 0.5, z, width, height, depth, w)
    box(x, y + height - 0.45, z, width + 0.045, 0.49, depth + 0.045, accent)
    box(x, y + height + 0.075, z, width + 0.35, 0.16, depth + 0.4, white)
    for (let i = 0; i < doors; i++) {
      const dx = x + (i - (doors - 1) * 0.5) * 2.3
      box(dx, y + 1.04, z + depth * 0.5 + 0.04, 1.7, 2.08, 0.12, ink)
      for (let j = 1; j < 6; j++) box(dx, y + j * 0.31, z + depth * 0.5 + 0.13, 1.64, 0.035, 0.035, m)
    }
    const n = Math.max(2, Math.floor(width / 1.08))
    for (let i = 0; i < n; i++)
      box(
        x + (width * (i + 0.5)) / n - width / 2,
        y + height - 0.76,
        z + depth * 0.5 + 0.026,
        width / n - 0.15,
        0.36,
        0.06,
        colors.glass,
      )
    for (const edge of [-1, 1])
      for (let j = 0; j < 4; j++)
        box(
          x + edge * (width * 0.5 + 0.03),
          y + height * 0.44,
          z + (j - 1.5) * depth * 0.24,
          0.11,
          height * 0.84,
          0.09,
          m,
        )
    box(x - width * 0.21, y + height + 0.38, z + 0.08 * depth, 1.55, 0.57, 1.1, m)
    for (let i = 0; i < 7; i++)
      box(x - width * 0.21 + (i - 3) * 0.18, y + height + 0.68, z + 0.08 * depth, 0.078, 0.045, 1.03, ink)
    for (const end of [-1, 1])
      box(x + end * (width * 0.5 - 0.2), y + height * 0.5, z + depth * 0.5 + 0.07, 0.11, height, 0.12, m)
  }
  function tank(x: number, z: number, r: number, h: number, c: string) {
    const y = terrainHeight(x, z)
    cyl(x, y + h / 2, z, r, h, c)
    cyl(x, y + h + 0.04, z, r + 0.12, 0.09, m)
    part(cone, x, y + h + 0.27, z, r, 0.44, r, white)
    for (const f of [0.13, 0.68]) cyl(x, y + h * f, z, r + 0.06, 0.13, m)
    for (let i = 0; i < 7; i++)
      box(x + 0.1, y + 0.35 + (i * h) / 8, z + r * 0.5 + 0.08, 0.43, 0.05, 0.07, ink)
    for (const e of [-1, 1]) box(x + 0.1 + e * 0.23, y + h / 2, z + r * 0.5 + 0.09, 0.05, h + 0.2, 0.05, ink)
  }
  function mast(x: number, z: number, h: number, span: number) {
    const y = terrainHeight(x, z)
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        beam(x + sx * span, y, z + sz * span, x + sx * 0.17, y + h, z + sz * 0.17, 0.16, m, true)
    for (let j = 0; j < 5; j++) {
      let p = span * (1 - j / 5) + (0.17 * j) / 5,
        q = span * (1 - (j + 1) / 5) + (0.17 * (j + 1)) / 5,
        lo = y + (h * j) / 5,
        hi = y + (h * (j + 1)) / 5
      for (const side of [-1, 1]) {
        beam(x - p, lo, z + side * p, x + q, hi, z + side * q, 0.075, m)
        beam(x + p, lo, z + side * p, x - q, hi, z + side * q, 0.075, m)
        beam(x + side * p, lo, z - p, x + side * q, hi, z + q, 0.075, m)
      }
    }
    box(x, y + h + 0.1, z, span * 3, 0.17, 0.37, m)
    for (const dx of [-1, 1]) {
      for (let j = 0; j < 3; j++)
        cyl(x + dx * span * 1.2, y + h + 0.33 + j * 0.11, z, 0.33 - 0.039 * j, 0.064, white)
    }
  }
  function crane(x: number, z: number, h: number, len: number) {
    mast(x, z, h, 0.72)
    const y = terrainHeight(x, z) + h
    box(x, y + 0.4, z, 0.98, 0.65, 1.1, amber)
    box(x + len * 0.32, y + 0.8, z, len, 0.17, 0.61, amber)
    box(x + len * 0.32, y + 1.48, z, len, 0.15, 0.49, amber)
    for (let i = 0; i < 11; i++) {
      const t = x + len * (i / 11 - 0.18)
      beam(t, y + 0.82, z + 0.24, t + len / 11, y + 1.47, z + 0.24, 0.1, ink)
    }
    beam(x + len * 0.66, y + 0.82, z, x + len * 0.66, y - 2.4, z, 0.038, ink)
    box(x - len * 0.15, y + 0.3, z, 1.45, 0.72, 1.12, m)
  }
  // Roads are laid flush with the terrain in the graded center of the basin.
  function road(cx: number, cz: number, width: number, length: number, rot: number) {
    const forward = new T.Vector2(Math.sin(rot), Math.cos(rot))
    const across = new T.Vector2(Math.cos(rot), -Math.sin(rot))
    const count = Math.ceil(length / 2.4),
      step = length / count
    for (let i = 0; i < count; i++) {
      const dist = (i + 0.5 - count * 0.5) * step,
        x = cx + dist * forward.x,
        z = cz + dist * forward.y,
        y = terrainHeight(x, z)
      box(x, y + 0.035, z, width, 0.055, step + 0.03, '#65645a', rot)
      if (i % 2 === 0) box(x, y + 0.072, z, 0.095, 0.028, 1.14, '#c7b382', rot)
      for (const edge of [-1, 1]) {
        const dx = x + across.x * edge * (width * 0.5 - 0.15),
          dz = z + across.y * edge * (width * 0.5 - 0.15)
        box(dx, y + 0.075, dz, 0.064, 0.027, step, '#a59e87', rot)
      }
    }
  }
  road(0, -16, 3.9, 42, 0)
  road(0, -22, 3.7, 68, Math.PI / 2)
  road(22, -25, 3.6, 36, 0)
  // The western access street turns around the motor court and rejoins the depot road.
  road(-10.8, -11.1, 3.15, 24.5, 0)
  road(-9.6, 1.0, 3, 21.7, Math.PI / 2)
  for (const [cx, cz] of [
    [-10.8, -19.65],
    [-10.8, -1.18],
    [22, -23.9],
  ]) {
    for (let k = -2; k <= 2; k++)
      box(cx + k * 0.54, terrainHeight(cx, cz) + 0.106, cz, 0.25, 0.025, 0.83, '#cec4a9')
  }
  for (const site of DISTRICT_SHEDS)
    shed(site.x, site.z, site.width, site.depth, site.height, site.accent, site.doors)
  for (const bin of DISTRICT_TANKS) tank(bin.x, bin.z, bin.width, bin.height, white)
  for (const [x, z, h, len] of GANTRIES) crane(x, z, h, len)
  for (let i = 0; i < POWER_MASTS.length; i++) {
    const { x, z } = POWER_MASTS[i]
    mast(x, z, 6.7, 0.53)
    if (i > 0)
      for (const side of [-0.55, 0.55]) {
        let px = x - 8,
          py = terrainHeight(px, z + 0.2) + 7.2,
          pz = z + 0.2
        for (let k = 1; k <= 6; k++) {
          const t = k / 6,
            bx = x - 8 + 8 * t,
            bz = z + 0.2 * (1 - t),
            by = terrainHeight(bx, bz) + 7.1 - 0.75 * Math.sin(t * Math.PI)
          beam(px + side, py, pz, bx + side, by, bz, 0.035, ink)
          px = bx
          py = by
          pz = bz
        }
      }
  }
  for (let i = 0; i < 14; i++) {
    const x = -31 + i * 3.8,
      z = -40.5
    box(x, 0.65, z, 0.24, 1.3, 0.81, m)
    beam(x, 1.28, z, x + 3.8, 1.28, z, 0.4, '#8f7f60')
  }
  for (const [i, container] of DISTRICT_CARGO.entries()) {
    const { x, z, width, depth } = container,
      y = terrainHeight(x, z)
    box(x, y + 0.6, z, width, 1.15, depth, i % 3 === 0 ? amber : '#767966')
    for (let k = 0; k < (lowDetail ? 3 : 6); k++)
      box(
        x - width * 0.4 + (k * width * 0.8) / (lowDetail ? 2 : 5),
        y + 0.6,
        z + depth * 0.5 + 0.01,
        0.043,
        1.07,
        0.035,
        ink,
      )
  }
  // Recessed shops, gallery columns, a solid stair core and alternating balcony decks
  // give the inhabited blocks a separate construction vocabulary from the plant.
  for (const block of CITY_BLOCKS) {
    const { x, z, width, depth, floors, style } = block,
      y = terrainHeight(x, z),
      base = 2.15,
      storey = 1.66
    const front = z + depth * 0.5,
      side = x + width * 0.5,
      bodyColor = style === 'market' ? '#c0ab88' : style === 'tower' ? '#c4c0ac' : '#d1c6a7'
    const accent = style === 'housing' ? '#3b5470' : style === 'market' ? '#af7b2c' : '#475b66'
    box(x, y + 0.12, z, width + 0.42, 0.23, depth + 0.42, '#9f9b8b')
    box(x, y + base * 0.5, z - 0.19, width - 0.14, base, depth - 0.48, ink)
    for (let i = 0; i < 4; i++) {
      const dx = x + width * ((i + 0.5) / 4 - 0.5)
      box(dx, y + 0.91, front - 0.36, width * 0.206, 1.32, 0.08, i % 3 === 0 ? '#75817c' : '#425459')
      box(dx, y + 1.63, front - 0.32, width * 0.21, 0.22, 0.14, i % 2 ? accent : w)
    }
    for (let i = 0; i < 5; i++)
      box(x + width * (i / 4 - 0.5), y + 1.02, front + 0.09, 0.16, 2.04, 0.17, white)
    box(x, y + base - 0.08, front - 0.1, width + 0.4, 0.25, 1.02, accent)
    box(x, y + 0.099, front + 0.49, width + 0.58, 0.18, 1.17, '#b4ac96')
    for (let k = 1; k <= 5; k++)
      box(x + width * (k / 6 - 0.5), y + 0.193, front + 0.56, 0.042, 0.012, 1.0, '#8b887c')
    let top = base
    for (let i = 1; i < floors; i++) {
      const reduced = style === 'tower' && i >= 4 ? 1.06 : 0
      const floorWidth = width - reduced,
        floorDepth = depth - (style === 'market' ? 0.48 : 0) - reduced * 0.46
      const levelZ = z - (style === 'market' ? 0.21 : 0),
        start = y + top
      box(x, start + storey * 0.5, levelZ, floorWidth, storey, floorDepth, bodyColor)
      for (const f of [-1, 1]) {
        const face = levelZ + f * (floorDepth / 2 + 0.015)
        box(x, start + 0.86, face, floorWidth - 0.45, 0.7, 0.035, colors.glass)
        const count = lowDetail ? 4 : 6
        for (let j = 1; j < count; j++)
          box(
            x + floorWidth * (j / count - 0.5),
            start + 0.86,
            face + f * 0.025,
            0.105,
            0.72,
            0.06,
            bodyColor,
          )
      }
      const sideX = x + floorWidth * 0.5 + 0.012
      box(sideX, start + 0.87, levelZ, 0.046, 0.66, floorDepth - 0.39, colors.glass)
      for (const f of [-1, 0, 1])
        box(sideX + 0.036, start + 0.86, levelZ + floorDepth * f * 0.26, 0.07, 0.67, 0.11, bodyColor)
      const balcony = style === 'housing' || (style === 'market' && i === 1)
      if (balcony) {
        const bz = levelZ + floorDepth * 0.5 + 0.24,
          balconyWidth = floorWidth * (style === 'housing' ? 0.65 : 0.95),
          bx = x + (style === 'housing' ? (i % 2 ? 0.13 : -0.13) * floorWidth : 0)
        box(bx, start + 0.12, bz, balconyWidth, 0.19, 0.72, white)
        box(bx, start + 0.41, bz + 0.31, balconyWidth, 0.34, 0.09, accent)
        for (const end of [-1, 1])
          box(bx + end * (balconyWidth * 0.5 - 0.04), start + 0.41, bz, 0.09, 0.34, 0.67, accent)
      }
      box(
        x,
        start + storey - 0.077,
        levelZ,
        floorWidth + 0.14,
        0.15,
        floorDepth + 0.14,
        style === 'tower' ? accent : white,
      )
      top += storey
    }
    const roofWidth = style === 'tower' ? width - 1.06 : width,
      roofDepth = style === 'tower' ? depth - 0.49 : depth
    box(x, y + top + 0.06, z, roofWidth + 0.25, 0.17, roofDepth + 0.19, white)
    box(x - width * 0.32, y + top + 0.43, z - depth * 0.18, 1.18, 0.77, 1.4, accent)
    if (style === 'tower') {
      cyl(x + 0.78, y + top + 0.53, z - 0.17, 1.27, 0.92, '#8f9484')
      cyl(x + 0.78, y + top + 1.04, z - 0.17, 1.39, 0.1, white)
      cyl(x + 0.78, y + top + 0.32, z - 0.17, 1.31, 0.09, ink)
      beam(x - 0.8, y + top + 0.65, z - 1.1, x - 0.8, y + top + 2.64, z - 1.1, 0.062, m)
    } else if (style === 'housing') {
      for (const dx of [0.12, 1.65]) {
        cyl(x + dx, y + top + 0.59, z - 0.58, 1.11, 0.97, '#ad9e7e')
        cyl(x + dx, y + top + 1.1, z - 0.58, 1.21, 0.11, m)
      }
      box(x - width * 0.4, y + (top + 1.0) * 0.5, z + depth * 0.08, 0.81, top + 0.99, 1.18, accent)
    } else {
      for (let j = 0; j < 3; j++) {
        box(x + 1.2, y + top + 0.29, z + 0.62 * (j - 1), 1.1, 0.4, 0.5, m)
      }
      box(side + 0.018, y + top * 0.66, z + 0.31, 0.25, 0.77 * top, 0.67, accent)
    }
  }
  // Refit forecourt, with enough headroom for the full R-07 roof basket.
  {
    const z = -7.66,
      roof = terrainHeight(0, z) + 3.52
    box(0, roof, z, 5.63, 0.21, 2.96, colors.blue)
    box(0, roof + 0.14, z, 5.76, 0.1, 3.09, amber)
    for (const post of CANOPY_POSTS) {
      const y = terrainHeight(post.x, post.z)
      box(post.x, (y + roof) * 0.5, post.z, post.width, roof - y, post.depth, m)
    }
    for (const sx of [-1, 1]) {
      box(sx * 1.54, roof - 0.13, z, 0.18, 0.045, 1.62, white)
      for (let j = 0; j < 3; j++)
        box(sx * (0.76 + 0.39 * j), terrainHeight(0, -5.8) + 0.1, -5.81, 0.11, 0.024, 0.78, '#d8ca91', 0.54)
    }
    mast(-2.7, -10.4, 5.9, 0.34)
  }
  // Transformer cooling fins, ceramic bushings and twin elevated busbars.
  for (const bank of SWITCHGEAR) {
    const { x, z, width, depth } = bank,
      y = terrainHeight(x, z)
    box(x, y + 0.84, z, width, 1.62, depth, '#6e786b')
    for (let j = 0; j < 5; j++) box(x + width * (j / 5 - 0.4), y + 0.83, z + depth / 2, 0.13, 1.18, 0.34, m)
    for (const side of [-0.41, 0.41])
      for (let i = 0; i < 4; i++) cyl(x + side, y + 1.81 + i * 0.18, z, 0.33 - i * 0.032, 0.12, white)
  }
  for (const x of [-16.9, -12.05]) {
    const z = -24.11,
      y = terrainHeight(x, z)
    beam(x, y + 2.76, z, x, y + 4.89, z, 0.15, m, true)
  }
  for (const z of [-24.13, -24.76]) {
    const height = terrainHeight(-14.4, z) + 4.77
    beam(-16.93, height, z, -12.03, height, z, 0.135, amber, true)
  }
  // A north-lit sawtooth roof and two insulated exhausts mark the foundry.
  {
    const y = terrainHeight(0, -36)
    for (let i = 0; i < 3; i++) {
      const x = -2.27 + i * 1.57
      part(cube, x, y + 4.45, -35.85, 1.59, 0.12, 3.74, white, 0, 0.29)
      box(x + 0.72, y + 4.41, -35.85, 0.12, 0.57, 3.62, colors.glass)
    }
    for (const [x, z, h, d] of [
      [2.04, -36.88, 8.08, 0.74],
      [0.66, -37.48, 6.66, 0.61],
    ]) {
      cyl(x, y + (4 + h) / 2, z, d, h - 4, '#795f4a')
      cyl(x, y + 4.39, z, d * 1.35, 0.48, m)
      for (const t of [0.66, 0.82, 0.97])
        cyl(x, y + 4 + (h - 4) * t, z, d * 1.12, 0.16, t === 0.82 ? white : m)
      cyl(x, y + h + 0.012, z, d * 0.75, 0.025, ink)
    }
  }
  // Parabolic reflector on a four-legged truss. Bowl and ribs share the normal
  // of the focal axis, leaving its silhouette legible from the city camera.
  {
    const x = 13.59,
      z = -23.07,
      h = 6.92,
      y = terrainHeight(x, z)
    mast(x, z, h, 0.67)
    const origin = new T.Vector3(x, y + h + 0.13, z),
      axis = new T.Vector3(0.45, 0.71, 0.54).normalize()
    const right = new T.Vector3(axis.z, 0, -axis.x).normalize(),
      up = new T.Vector3().crossVectors(axis, right).normalize()
    const radius = 1.56,
      segments = lowDetail ? 12 : 20
    const profile = [
      new T.Vector2(0.035, 0),
      new T.Vector2(0.77, 0.088),
      new T.Vector2(radius, 0.39),
      new T.Vector2(radius, 0.43),
      new T.Vector2(0.77, 0.13),
      new T.Vector2(0.035, 0.03),
    ]
    const dish = new T.LatheGeometry(profile, segments)
    o.position.copy(origin)
    o.scale.setScalar(1)
    o.quaternion.setFromUnitVectors(yv, axis)
    register(dish, '#d0c4a6')
    const rim = (angle: number) =>
      origin
        .clone()
        .addScaledVector(axis, 0.44)
        .addScaledVector(right, Math.cos(angle) * radius)
        .addScaledVector(up, Math.sin(angle) * radius)
    const focus = origin.clone().addScaledVector(axis, 1.3)
    for (let i = 0; i < segments; i++) {
      const p = rim((i * Math.PI * 2) / segments),
        q = rim(((i + 1) * Math.PI * 2) / segments)
      beam(p.x, p.y, p.z, q.x, q.y, q.z, 0.078, colors.blue)
      if (i % (segments / 4) === 0) beam(p.x, p.y, p.z, focus.x, focus.y, focus.z, 0.045, m)
    }
    box(focus.x, focus.y, focus.z, 0.2, 0.22, 0.2, amber)
  }
  // The night arena and evacuation beacon can be seen before leaving the depot.
  for (let i = 0; i < 13; i++) {
    const t = (i / 13) * 6.28,
      x = 36 + Math.cos(t) * 10.8,
      z = -30 + Math.sin(t) * 10.2
    if (i % 5 === 0) continue
    box(x, 0.59, z, 2.2, 1.12, 0.72, '#797665', -t + Math.PI / 2)
    box(x, 1.18, z, 2.26, 0.11, 0.76, amber, -t + Math.PI / 2)
  }
  for (const [x, z] of [
    [26, -38],
    [44, -38],
    [47, -23],
  ]) {
    const y = terrainHeight(x, z)
    cyl(x, y + 2.05, z, 0.23, 4.1, ink)
    box(x, y + 4.18, z, 1.02, 0.3, 0.35, white)
  }
  // In-world eclipse collector. Its dimensions and azimuth correspond to the opening plate.
  const ringCenter = new T.Vector3(-11, 17, -72),
    normal = new T.Vector3(0.52, 0, 0.85),
    right = new T.Vector3(0.85, 0, -0.52),
    up = new T.Vector3(0, 1, 0)
  function ringPt(r: number, t: number, offset = 0) {
    return ringCenter
      .clone()
      .addScaledVector(right, Math.cos(t) * r)
      .addScaledVector(up, Math.sin(t) * r)
      .addScaledVector(normal, offset)
  }
  const link = (aa: T.Vector3, bb: T.Vector3, width: number, c: string) =>
    beam(aa.x, aa.y, aa.z, bb.x, bb.y, bb.z, width, c, true)
  const n = 96
  for (let i = 0; i < n; i++) {
    if (i === 25 || i === 26) continue
    const a0 = (i / n) * Math.PI * 2,
      a1 = ((i + 1) / n) * Math.PI * 2
    for (const d of [-0.44, 0.44]) {
      link(ringPt(11, a0, d), ringPt(11, a1, d), 0.26, amber)
      link(ringPt(12.1, a0, d), ringPt(12.1, a1, d), 0.28, i % 4 === 0 ? m : amber)
    }
    link(ringPt(11, a0, 0.44), ringPt(12.1, a1, 0.44), 0.11, m)
    if (i % 3 === 0) link(ringPt(11, a0, -0.44), ringPt(12.1, a0, 0.44), 0.24, ink)
  }
  for (const dx of [-8.6, 8.6]) {
    const p = ringCenter.clone().addScaledVector(right, dx)
    mast(p.x, p.z, 9.4, 1.05)
  }
  const material = lowDetail
    ? new T.MeshLambertMaterial()
    : new T.MeshStandardMaterial({ roughness: 0.78, metalness: 0.18 })
  for (const [geo, items] of groups) {
    // On a software adapter a single distant instance must not submit an entire district.
    const bins = new Map<string, typeof items>()
    for (const item of items) {
      const e = item.matrix.elements,
        key = lowDetail ? Math.floor(e[12] / 18) + ':' + Math.floor(e[14] / 18) : 'all'
      let bin = bins.get(key)
      if (!bin) {
        bin = []
        bins.set(key, bin)
      }
      bin.push(item)
    }
    for (const bin of bins.values()) {
      const mesh = new T.InstancedMesh(geo, material, bin.length)
      for (let i = 0; i < bin.length; i++) {
        mesh.setMatrixAt(i, bin[i].matrix)
        mesh.setColorAt(i, bin[i].color)
      }
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.computeBoundingSphere()
      scene.add(mesh)
    }
  }
}
