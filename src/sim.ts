import { DISTRICT_FOOTPRINTS } from './district-layout.ts'
// All horizontal distances are metres. Heading zero points along world +Z.
export type Mode = 1 | 2 | 3 | 4
export interface Point {
  x: number
  z: number
}
export interface Input {
  forward?: number
  turn?: number
  strafe?: number
  drift?: boolean
}
export type BuildKind = 'generator' | 'relay' | 'extractor' | 'belt' | 'refinery'
export type Weather = 'clear' | 'wind' | 'dust'
export type BossStage = 'idle' | 'windup' | 'strike' | 'recover' | 'stunned' | 'broken' | 'dead'
export type BossMove = 'sweep' | 'slam' | 'lunge'
export type EventType =
  | 'ui'
  | 'mode'
  | 'start'
  | 'salvage'
  | 'build'
  | 'power'
  | 'raid'
  | 'attack'
  | 'hit'
  | 'hurt'
  | 'warning'
  | 'parry'
  | 'dodge'
  | 'switch'
  | 'resonance'
  | 'finish'
  | 'extract'
  | 'success'
  | 'failure'
  | 'upgrade'
  | 'error'
  | 'weather'
export interface GameEvent {
  id: number
  type: EventType
  label: string
}
export interface Site extends Point {
  id: string
  name: string
  radius: number
  action: string
}
export const LOCATIONS: readonly Site[] = [
  { id: 'yard', name: 'Switchyard', x: -14, z: -22, radius: 3.5, action: 'Power grid' },
  { id: 'foundry', name: 'The Foundry', x: 0, z: -36, radius: 3.4, action: 'Production' },
  { id: 'uplink', name: 'Nightwatch', x: 14, z: -22, radius: 3.4, action: 'Squad dispatch' },
  { id: 'depot', name: 'Motor Pool', x: 0, z: -10, radius: 2.6, action: 'Refit rover' },
]
export const CREW = [
  { id: 0, name: 'Vale', role: 'Vanguard', element: 'Kinetic', power: 16, delay: 0.49 },
  { id: 1, name: 'Iris', role: 'Conductor', element: 'Arc', power: 12, delay: 0.38 },
  { id: 2, name: 'Flint', role: 'Breaker', element: 'Thermal', power: 23, delay: 0.72 },
] as const
export const BUILDINGS: Record<BuildKind, { name: string; cost: number; power: number }> = {
  generator: { name: 'Generator', cost: 10, power: 8 },
  relay: { name: 'Relay', cost: 3, power: 0 },
  extractor: { name: 'Extractor', cost: 8, power: 2 },
  belt: { name: 'Conveyor', cost: 2, power: 0 },
  refinery: { name: 'Refinery', cost: 12, power: 3 },
}
export const ARENA: Point = { x: 36, z: -30 }
export const EXTRACTION = { x: 46, z: -23, radius: 4.5 }
export const GRID_SIZE = 7
export function gridToWorld(col: number, row: number): Point {
  return { x: (col - 3) * 3, z: -22 + (row - 3) * 3 }
}
export function worldToGrid(x: number, z: number) {
  return { col: Math.round(x / 3) + 3, row: Math.round((z + 22) / 3) + 3 }
}
export interface GridNode extends Point {
  id: number
  kind: BuildKind
  col: number
  row: number
  powered: boolean
  linked: boolean
}
export interface Link {
  from: number
  to: number
  kind: 'power' | 'belt'
}
export interface Cache extends Point {
  id: string
  amount: number
  claimed: boolean
  night: boolean
}
export interface Stock {
  alloy: number
  ore: number
  cores: number
}
export interface Rover extends Point {
  heading: number
  speed: number
  drift: number
  vx: number
  vz: number
}
export type LinkStyle = 'Line' | 'Wedge' | 'Dispersed'
export interface Party extends Point {
  heading: number
  active: number
  formation: number[]
  positions: number[]
  linkStyle: LinkStyle
  hp: number
  maxHp: number
  bond: string
  attackCooldown: number
  switchCooldown: number
  dodgeCooldown: number
  parryCooldown: number
  guard: number
  invulnerable: number
}
export interface Boss extends Point {
  hp: number
  maxHp: number
  phase: number
  stage: BossStage
  stageTime: number
  stageDuration: number
  telegraph: number
  move: BossMove
  range: number
  heading: number
  targetX: number
  targetZ: number
  poise: number
  attackIndex: number
}
export interface Raid {
  active: boolean
  timeLeft: number
  evacuating: boolean
  extraction: number
  loot: number
  cores: number
  bossDown: boolean
}
export interface Outcome {
  success: boolean
  alloy: number
  cores: number
  bossDown: boolean
  reason: string
}
export interface GameState {
  mode: Mode
  started: boolean
  clock: number
  day: number
  hour: number
  weather: Weather
  rank: number
  stock: Stock
  rover: Rover
  party: Party
  boss: Boss
  raid: Raid
  report: Outcome | null
  nodes: GridNode[]
  links: Link[]
  power: { supply: number; demand: number; used: number; rate: number; oreRate: number }
  caches: Cache[]
  delivery: { active: boolean; timeLeft: number; reward: number }
  buildKind: BuildKind
  event: GameEvent
  events: GameEvent[]
  cycles: number
  fx: {
    hit: number
    parry: number
    shake: number
    attack: number
    dodge: number
    switch: number
    finish: number
    hitstop: number
    hurt: number
    resonance: number
  }
}
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}
export type Action =
  | 'start'
  | 'park'
  | 'interact'
  | 'selectBuild'
  | 'build'
  | 'remove'
  | 'raid'
  | 'attack'
  | 'parry'
  | 'dodge'
  | 'switch'
  | 'formation'
  | 'position'
  | 'extract'
  | 'finish'
  | 'upgrade'
  | 'district'
  | 'salvage'
  | 'return'
  | 'dismiss'
const SAVE = 'dust-division.field-save.v1'
const STEP = 1 / 90
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z)
const direction = (a: Point, b: Point) => Math.atan2(b.x - a.x, b.z - a.z)
const angleDelta = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b))
const BONDS = ['Bulwark', 'Induction', 'Overpressure']
const MOVES: Record<BossMove, { windup: number; range: number; damage: number; recover: number }> = {
  sweep: { windup: 1.2, range: 7.6, damage: 17, recover: 1.5 },
  slam: { windup: 1.65, range: 6.7, damage: 26, recover: 1.8 },
  lunge: { windup: 1, range: 9, damage: 21, recover: 1.6 },
}
const PHASE_MOVES: readonly (readonly BossMove[])[] = [
  ['sweep', 'lunge', 'slam'],
  ['lunge', 'sweep', 'slam', 'lunge'],
  ['slam', 'lunge', 'sweep', 'lunge'],
]
function makeNode(id: number, kind: BuildKind, col: number, row: number): GridNode {
  return { id, kind, col, row, ...gridToWorld(col, row), powered: false, linked: false }
}
function makeCaches(): Cache[] {
  return [
    { id: 'field', x: -5, z: -3, amount: 5, night: false, claimed: false },
    { id: 'convoy', x: -19, z: -12, amount: 8, night: false, claimed: false },
    { id: 'relay', x: 12, z: 8, amount: 6, night: false, claimed: false },
    { id: 'sink', x: 25, z: -8, amount: 10, night: false, claimed: false },
    { id: 'supply', x: 40, z: -24, amount: 8, night: true, claimed: false },
    { id: 'vault', x: 29, z: -34, amount: 16, night: true, claimed: false },
    { id: 'wreck', x: 43, z: -39, amount: 24, night: true, claimed: false },
  ]
}
function makeBoss(): Boss {
  return {
    ...ARENA,
    z: -33,
    hp: 225,
    maxHp: 225,
    phase: 1,
    stage: 'idle',
    stageTime: 1.8,
    stageDuration: 1.8,
    telegraph: 0,
    move: 'sweep',
    range: 7.6,
    heading: 0,
    targetX: 36,
    targetZ: -23,
    poise: 0,
    attackIndex: 0,
  }
}
function formationStyle(cells: number[]): LinkStyle {
  const points = cells.map((cell) => ({ x: cell % 3, z: Math.floor(cell / 3) }))
  const [a, b, c] = points
  if ((b.x - a.x) * (c.z - a.z) === (b.z - a.z) * (c.x - a.x)) return 'Line'
  // A bend in the line remains linked when one operator can reach both neighbours.
  const connected = points.some((p) =>
    points.every((q) => Math.max(Math.abs(q.x - p.x), Math.abs(q.z - p.z)) <= 1),
  )
  return connected ? 'Wedge' : 'Dispersed'
}
function validPositions(cells: unknown): cells is number[] {
  return (
    Array.isArray(cells) &&
    cells.length === 3 &&
    new Set(cells).size === 3 &&
    cells.every((c) => Number.isInteger(c) && c >= 0 && c < 9)
  )
}
function makeParty(): Party {
  return {
    x: 36,
    z: -23,
    heading: Math.PI,
    active: 0,
    formation: [0, 1, 2],
    positions: [0, 4, 2],
    linkStyle: 'Wedge',
    hp: 100,
    maxHp: 100,
    bond: BONDS[0],
    attackCooldown: 0,
    switchCooldown: 0,
    dodgeCooldown: 0,
    parryCooldown: 0,
    guard: 0,
    invulnerable: 0,
  }
}
function makeRaid(): Raid {
  return {
    active: false,
    timeLeft: 110,
    evacuating: false,
    extraction: -1,
    loot: 0,
    cores: 0,
    bossDown: false,
  }
}
function makeState(): GameState {
  const event: GameEvent = { id: 0, type: 'ui', label: '' }
  return {
    mode: 1,
    started: false,
    clock: 0,
    day: 1,
    hour: 15.62,
    weather: 'clear',
    rank: 0,
    stock: { alloy: 32, ore: 6, cores: 0 },
    rover: { x: 0, z: 0, heading: -2.56, speed: 0, vx: 0, vz: 0, drift: 0 },
    party: makeParty(),
    boss: makeBoss(),
    raid: makeRaid(),
    report: null,
    nodes: [
      makeNode(1, 'generator', 1, 3),
      makeNode(2, 'relay', 2, 3),
      makeNode(3, 'extractor', 3, 2),
      makeNode(4, 'belt', 3, 3),
      makeNode(5, 'refinery', 3, 4),
    ],
    links: [],
    power: { supply: 0, demand: 0, used: 0, rate: 0, oreRate: 0 },
    caches: makeCaches(),
    delivery: { active: false, timeLeft: 0, reward: 10 },
    buildKind: 'relay',
    event,
    events: [],
    cycles: 0,
    fx: {
      hit: 0,
      parry: 0,
      shake: 0,
      attack: 0,
      dodge: 0,
      switch: 0,
      finish: 0,
      hitstop: 0,
      hurt: 0,
      resonance: 0,
    },
  }
}
function cellsTouch(a: GridNode, b: GridNode) {
  return Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row)) === 1
}
function conductor(n: GridNode) {
  return n.kind === 'generator' || n.kind === 'relay'
}
function cargoNode(n: GridNode) {
  return n.kind === 'belt' || n.kind === 'extractor' || n.kind === 'refinery'
}
function inGrid(col: number, row: number) {
  return (
    Number.isInteger(col) &&
    Number.isInteger(row) &&
    col >= 0 &&
    col < GRID_SIZE &&
    row >= 0 &&
    row < GRID_SIZE
  )
}
function cell(payload: unknown): { col: number; row: number } | null {
  if (!payload || typeof payload !== 'object' || !('col' in payload) || !('row' in payload)) return null
  if (typeof payload.col !== 'number' || typeof payload.row !== 'number' || !inGrid(payload.col, payload.row))
    return null
  return { col: payload.col, row: payload.row }
}
function isKind(k: unknown): k is BuildKind {
  return typeof k === 'string' && Object.hasOwn(BUILDINGS, k)
}
function finite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

export class Game {
  state: GameState = makeState()
  private storage?: StorageLike
  private groundHeight?: (x: number, z: number) => number
  private accumulator = 0
  private saveTimer = 0
  private lastElement = -1
  private resonanceTime = 0
  private lastCargo = 0
  private lastMotion: Point = { x: 0, z: -1 }
  constructor(storage?: StorageLike, groundHeight?: (x: number, z: number) => number) {
    this.storage = storage
    this.groundHeight = groundHeight
    this.restore()
    this.recalculate()
  }
  private emit(type: EventType, label: string) {
    const s = this.state
    const event = { id: s.event.id + 1, type, label }
    s.event = event
    s.events.push(event)
    if (s.events.length > 16) s.events.shift()
  }
  private denied(label: string) {
    this.emit('error', label)
    return false
  }
  setMode(mode: Mode) {
    if (![1, 2, 3, 4].includes(mode)) return false
    if (mode === this.state.mode) return true
    this.state.mode = mode
    this.state.rover.drift = 0
    this.emit('mode', ['', 'Overworld', 'District', 'Operations', 'Encounter'][mode])
    return true
  }
  get upgradeCost() {
    return 12 + this.state.rank * 6
  }
  get context(): string {
    const s = this.state
    if (s.raid.active && (s.mode === 3 || s.mode === 4)) {
      if (s.boss.stage === 'broken' && dist(s.party, s.boss) < 8) return 'Execute'
      if (dist(s.party, EXTRACTION) <= EXTRACTION.radius && s.raid.evacuating) return 'Hold extraction'
      const cache = this.nearbyCache()
      if (cache) return 'Salvage +' + cache.amount
      if (dist(s.party, EXTRACTION) <= EXTRACTION.radius) return 'Call extraction'
      return 'Locate cache'
    }
    if (s.delivery.active)
      return this.atDepot() ? 'Deliver freight' : 'Motor Pool · ' + Math.ceil(s.delivery.timeLeft) + ' s'
    const cache = this.nearbyCache()
    if (cache) return 'Salvage +' + cache.amount
    const site = LOCATIONS.find((p) => dist(p, s.rover) < p.radius + 5)
    return site ? site.action : 'Survey district'
  }
  act(action: Action | string, payload?: unknown): boolean {
    const s = this.state
    switch (action) {
      case 'start':
        s.started = true
        s.report = null
        this.emit('start', 'Field link established')
        this.save()
        return true
      case 'park':
        if (s.raid.active) return this.denied('Extract before docking')
        s.started = false
        s.rover.speed = 0
        s.rover.vx = 0
        s.rover.vz = 0
        s.rover.drift = 0
        this.setMode(1)
        this.save()
        return true
      case 'dismiss':
        s.report = null
        return true
      case 'selectBuild':
        if (!isKind(payload)) return false
        s.buildKind = payload
        this.emit('ui', BUILDINGS[payload].name)
        return true
      case 'build':
        return this.build(payload, false)
      case 'remove':
        return this.build(payload, true)
      case 'upgrade':
        if (s.raid.active) return this.denied('Refit unavailable during sortie')
        if (s.rank >= 5) return this.denied('Rover at maximum rank')
        if (s.stock.alloy < this.upgradeCost) return this.denied('Insufficient alloy')
        s.stock.alloy -= this.upgradeCost
        s.rank++
        s.party.maxHp = 100 + s.rank * 12
        s.party.hp = s.party.maxHp
        this.emit('upgrade', 'Chassis refit · Mk ' + (s.rank + 1))
        this.save()
        return true
      case 'district': {
        const p = LOCATIONS.find((site) => site.id === payload)
        if (!p) return false
        s.started = true
        if (p.id === 'depot') return s.delivery.active ? this.deliverFreight() : this.act('upgrade')
        if (p.id === 'foundry') s.buildKind = 'refinery'
        if (p.id === 'yard') s.buildKind = 'relay'
        return this.setMode(p.id === 'uplink' ? 4 : 3)
      }
      case 'raid':
        return this.beginRaid()
      case 'salvage':
        return this.salvage(payload)
      case 'extract':
        if (!s.raid.active) return this.denied('No active sortie')
        if (!s.raid.evacuating) {
          s.raid.evacuating = true
          this.emit('extract', 'Beacon active · reach the landing zone')
        }
        this.setMode(3)
        this.save()
        return true
      case 'return':
        if (s.raid.active) return this.act('extract')
        s.report = null
        this.setMode(2)
        return true
      case 'interact':
        return this.interact()
      case 'formation':
        return this.formation(payload)
      case 'position':
        return this.position(payload)
      case 'switch':
        return this.switchOperator(payload)
      case 'attack':
        return this.attack()
      case 'parry':
        return this.parry()
      case 'dodge':
        return this.dodge()
      case 'finish':
        return this.finisher()
      default:
        return false
    }
  }
  private nearbyCache() {
    const s = this.state,
      onRaid = s.raid.active
    const p = onRaid ? s.party : s.rover
    return s.caches
      .filter((c) => !c.claimed && c.night === onRaid && dist(c, p) <= 5.5)
      .sort((a, b) => dist(a, p) - dist(b, p))[0]
  }
  private salvage(id: unknown) {
    const s = this.state,
      c = id ? s.caches.find((c) => c.id === id) : this.nearbyCache()
    if (!c || c.claimed || c.night !== s.raid.active) return this.denied('Cache unavailable')
    if (dist(s.raid.active ? s.party : s.rover, c) > 5.5) return this.denied('Move closer to cache')
    c.claimed = true
    if (s.raid.active) s.raid.loot += c.amount
    else s.stock.alloy += c.amount
    if (c.id === 'convoy') {
      s.delivery = { active: true, timeLeft: 45, reward: 10 }
      this.emit('salvage', 'Convoy freight · deliver to Motor Pool')
    } else this.emit('salvage', 'Recovered ' + c.amount + ' alloy')
    this.save()
    return true
  }
  private atDepot() {
    const depot = LOCATIONS.find((site) => site.id === 'depot')!
    return dist(this.state.rover, depot) <= depot.radius + 5
  }
  private deliverFreight() {
    const s = this.state
    if (!this.atDepot()) return this.denied('Drive freight to Motor Pool')
    s.stock.alloy += s.delivery.reward
    s.delivery.active = false
    this.emit('salvage', 'Freight delivered · +' + s.delivery.reward + ' alloy')
    this.save()
    return true
  }
  private interact() {
    const s = this.state
    if (s.raid.active) {
      if (s.boss.stage === 'broken' && dist(s.party, s.boss) <= 8) return this.finisher()
      const c = this.nearbyCache()
      if (c) return this.salvage(c.id)
      if (dist(s.party, EXTRACTION) <= EXTRACTION.radius) return this.act('extract')
      return this.denied('Locate a field cache or the extraction beacon')
    }
    if (s.delivery.active && this.atDepot()) return this.deliverFreight()
    const c = this.nearbyCache()
    if (c) return this.salvage(c.id)
    const site = LOCATIONS.filter((p) => dist(s.rover, p) < p.radius + 5).sort(
      (a, b) => dist(s.rover, a) - dist(s.rover, b),
    )[0]
    return site ? this.act('district', site.id) : this.setMode(2)
  }
  private build(payload: unknown, remove: boolean) {
    const s = this.state,
      pos = cell(payload)
    if (s.raid.active) return this.denied('Construction paused during sortie')
    if (!pos) return this.denied('Outside build area')
    const old = s.nodes.find((n) => n.col === pos.col && n.row === pos.row)
    if (remove) {
      if (!old) return this.denied('Empty footprint')
      s.stock.alloy += Math.floor(BUILDINGS[old.kind].cost / 2)
      s.nodes = s.nodes.filter((n) => n.id !== old.id)
    } else {
      if (old) return this.denied('Footprint occupied')
      const spec = BUILDINGS[s.buildKind]
      if (s.stock.alloy < spec.cost) return this.denied('Insufficient alloy')
      s.stock.alloy -= spec.cost
      s.nodes.push(makeNode(Math.max(0, ...s.nodes.map((n) => n.id)) + 1, s.buildKind, pos.col, pos.row))
    }
    s.started = true
    this.recalculate()
    this.emit('build', remove ? 'Module reclaimed' : BUILDINGS[s.buildKind].name + ' installed')
    this.save()
    return true
  }
  private recalculate() {
    const { nodes, power } = this.state
    const links: Link[] = []
    for (const n of nodes) {
      n.powered = false
      n.linked = false
    }
    for (let i = 0; i < nodes.length; i++)
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i],
          b = nodes[j]
        if (!cellsTouch(a, b)) continue
        if (conductor(a) || conductor(b)) links.push({ from: a.id, to: b.id, kind: 'power' })
        if (cargoNode(a) && cargoNode(b) && (a.kind === 'belt' || b.kind === 'belt'))
          links.push({ from: a.id, to: b.id, kind: 'belt' })
      }
    power.supply = 0
    power.used = 0
    power.demand = 0
    const visited = new Set<number>()
    // Electrical components have independent budgets. End appliances never bridge two feeders.
    for (const start of nodes.filter(conductor)) {
      if (visited.has(start.id)) continue
      const bus = [start]
      visited.add(start.id)
      for (let i = 0; i < bus.length; i++)
        for (const n of nodes) {
          if (conductor(n) && !visited.has(n.id) && cellsTouch(bus[i], n)) {
            bus.push(n)
            visited.add(n.id)
          }
        }
      const generatorOutput = BUILDINGS.generator.power + Math.min(3, this.state.stock.cores)
      let available = bus.filter((n) => n.kind === 'generator').length * generatorOutput
      power.supply += available
      if (available === 0) continue
      for (const n of bus) n.powered = true
      const clients = nodes
        .filter((n) => !conductor(n) && bus.some((b) => cellsTouch(b, n)))
        .sort((a, b) => a.id - b.id)
      for (const n of clients) {
        const load = BUILDINGS[n.kind].power
        if (n.powered || load > available) continue
        n.powered = true
        available -= load
        power.used += load
      }
    }
    power.demand = nodes.reduce((n, m) => n + (conductor(m) ? 0 : BUILDINGS[m.kind].power), 0)
    power.oreRate = 0
    power.rate = 0
    const cargoVisited = new Set<number>()
    for (const start of nodes.filter(cargoNode)) {
      if (cargoVisited.has(start.id)) continue
      const line = [start]
      cargoVisited.add(start.id)
      for (let i = 0; i < line.length; i++)
        for (const n of nodes) {
          if (!cargoNode(n) || cargoVisited.has(n.id) || !cellsTouch(line[i], n)) continue
          if (line[i].kind !== 'belt' && n.kind !== 'belt') continue
          line.push(n)
          cargoVisited.add(n.id)
        }
      const mines = line.filter((n) => n.kind === 'extractor' && n.powered).length
      const mills = line.filter((n) => n.kind === 'refinery' && n.powered).length
      power.oreRate += mines * 4
      if (mines && mills && line.some((n) => n.kind === 'belt')) {
        for (const n of line) n.linked = true
        power.rate += Math.min(mines * 4, mills * 3)
      }
    }
    this.state.links = links
  }
  private beginRaid() {
    const s = this.state
    if (s.raid.active) {
      this.setMode(4)
      return true
    }
    s.started = true
    s.report = null
    s.hour = 21.2
    const reserve = Math.min(18, Math.max(0, s.power.supply - s.power.used) * 2)
    s.delivery.active = false
    s.raid = { ...makeRaid(), active: true, timeLeft: 110 + reserve }
    const formation = [...s.party.formation],
      positions = [...s.party.positions]
    s.party = {
      ...makeParty(),
      formation,
      positions,
      linkStyle: formationStyle(positions),
      active: formation[0],
      bond: BONDS[formation[0]],
      maxHp: 100 + s.rank * 12,
      hp: 100 + s.rank * 12,
    }
    s.boss = makeBoss()
    s.boss.maxHp += Math.min(s.cycles, 6) * 8
    s.boss.hp = s.boss.maxHp
    for (const cache of s.caches) if (cache.night) cache.claimed = false
    this.lastElement = -1
    this.resonanceTime = 0
    this.lastMotion = { x: 0, z: -1 }
    this.setMode(4)
    this.emit('raid', 'Night sortie deployed')
    this.save()
    return true
  }
  private position(payload: unknown) {
    const s = this.state
    if (s.raid.active) return this.denied('Deployment locked on sortie')
    if (!payload || typeof payload !== 'object' || !('operator' in payload) || !('cell' in payload))
      return false
    const { operator, cell } = payload
    if (!finite(operator) || !Number.isInteger(operator) || operator < 0 || operator >= 3) return false
    if (!finite(cell) || !Number.isInteger(cell) || cell < 0 || cell >= 9) return false
    const positions = s.party.positions,
      occupied = positions.indexOf(cell)
    if (occupied === operator) return true
    if (occupied >= 0) positions[occupied] = positions[operator]
    positions[operator] = cell
    s.party.linkStyle = formationStyle(positions)
    this.emit('ui', s.party.linkStyle + ' deployment')
    this.save()
    return true
  }
  private formation(payload: unknown) {
    const s = this.state
    if (s.raid.active) return this.denied('Formation locked on deployment')
    const team = s.party.formation
    let a = 0,
      b = 1
    if (typeof payload === 'number') b = payload
    else if (payload && typeof payload === 'object' && 'a' in payload && 'b' in payload) {
      if (typeof payload.a !== 'number' || typeof payload.b !== 'number') return false
      a = payload.a
      b = payload.b
    }
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || a > 2 || b < 0 || b > 2) return false
    ;[team[a], team[b]] = [team[b], team[a]]
    s.party.active = team[0]
    s.party.bond = BONDS[team[0]]
    this.emit('ui', s.party.bond + ' formation')
    this.save()
    return true
  }
  private switchOperator(payload: unknown) {
    const s = this.state,
      p = s.party
    if (!s.raid.active) {
      const next = p.formation[(p.formation.indexOf(p.active) + 1) % 3]
      return this.formation({ a: 0, b: p.formation.indexOf(typeof payload === 'number' ? payload : next) })
    }
    if (p.switchCooldown > 0) return false
    const index = p.formation.indexOf(p.active)
    const next = typeof payload === 'number' ? payload : p.formation[(index + 1) % 3]
    if (!p.formation.includes(next) || next === p.active) return false
    p.active = next
    p.switchCooldown = 0.32
    p.attackCooldown = 0
    p.invulnerable = Math.max(p.invulnerable, 0.15)
    s.fx.switch = 1
    this.emit('switch', CREW[next].name + ' in position')
    return true
  }
  private attack() {
    const s = this.state,
      p = s.party,
      b = s.boss
    if (!s.raid.active || p.attackCooldown > 0 || s.fx.hitstop > 0 || b.stage === 'dead') return false
    if (b.stage === 'broken' && dist(p, b) < 8) return this.finisher()
    const op = CREW[p.active]
    p.attackCooldown = op.delay
    p.heading = direction(p, b)
    s.fx.attack = 1
    this.emit('attack', op.element + ' strike')
    const range = op.id === 1 ? 9 : 5.8
    const distance = dist(p, b)
    if (distance > 2.6 && distance < range + 3.1) {
      const step = Math.min(2.7, distance - 2.6)
      p.x += Math.sin(p.heading) * step
      p.z += Math.cos(p.heading) * step
    }
    if (dist(p, b) > range) return true
    const critical = b.stage === 'stunned' || b.stage === 'recover'
    const reacts = this.lastElement >= 0 && this.lastElement !== p.active && this.resonanceTime > 0
    let amount = op.power * (1 + s.rank * 0.08) * (critical ? 1.32 : 1)
    let stagger = op.id === 2 ? 13 : 7
    if (reacts) {
      amount += p.bond === 'Induction' ? 19 : 12
      stagger = p.bond === 'Overpressure' ? 32 : 22
      s.fx.resonance = 1
    }
    if (p.linkStyle === 'Line') amount *= 1.08
    b.poise += stagger * (p.linkStyle === 'Wedge' ? 1.12 : 1)
    this.lastElement = p.active
    this.resonanceTime = p.bond === 'Induction' ? 4 : 3
    this.damageBoss(
      amount,
      reacts ? 'resonance' : 'hit',
      reacts ? 'Resonance · ' + op.element : op.element + ' impact',
    )
    return true
  }
  private setStage(stage: BossStage, duration: number) {
    const b = this.state.boss
    b.stage = stage
    b.stageTime = duration
    b.stageDuration = duration
    b.telegraph = stage === 'strike' ? 1 : 0
  }
  private damageBoss(amount: number, type: EventType, label: string) {
    const s = this.state,
      b = s.boss
    b.hp = Math.max(1, b.hp - amount)
    s.fx.hit = 1
    s.fx.shake = type === 'resonance' ? 0.85 : 0.45
    s.fx.hitstop = type === 'resonance' ? 0.085 : 0.045
    this.emit(type, label)
    b.phase = b.hp / b.maxHp > 0.67 ? 1 : b.hp / b.maxHp > 0.34 ? 2 : 3
    if (b.hp <= b.maxHp * 0.09) {
      this.setStage('broken', 30)
      this.emit('warning', 'Core exposed · execute')
    } else if (b.poise >= 100) {
      b.poise = 0
      this.setStage('stunned', 2.2)
      this.emit('warning', 'Warden staggered')
    }
  }
  private parry() {
    const s = this.state,
      p = s.party
    if (!s.raid.active || p.parryCooldown > 0) return false
    p.guard = p.bond === 'Bulwark' ? 0.36 : 0.28
    p.parryCooldown = 0.81
    this.emit('ui', 'Guard')
    return true
  }
  private dodge() {
    const s = this.state,
      p = s.party
    if (!s.raid.active || p.dodgeCooldown > 0) return false
    p.dodgeCooldown = 1.22
    p.invulnerable = 0.4
    s.fx.dodge = 1
    p.x = clamp(p.x + this.lastMotion.x * 3, ARENA.x - 15, ARENA.x + 15)
    p.z = clamp(p.z + this.lastMotion.z * 3, ARENA.z - 15, ARENA.z + 15)
    this.emit('dodge', 'Quickstep')
    return true
  }
  private finisher() {
    const s = this.state,
      b = s.boss
    if (!s.raid.active || b.stage !== 'broken') return this.denied('Core shielded')
    if (dist(s.party, b) > 8) return this.denied('Approach exposed core')
    b.hp = 0
    this.setStage('dead', 0)
    s.raid.bossDown = true
    s.raid.loot += 24
    s.raid.cores += 1
    s.fx.finish = 1
    s.fx.shake = 1
    s.fx.hitstop = 0.19
    s.raid.timeLeft = Math.max(s.raid.timeLeft, 32)
    this.emit('finish', 'Core secured · extract')
    this.save()
    return true
  }
  private incoming() {
    const s = this.state,
      b = s.boss,
      p = s.party,
      move = MOVES[b.move]
    const d = dist(p, b),
      angle = Math.abs(angleDelta(b.heading, direction(b, p)))
    let contact =
      b.move === 'slam'
        ? d <= b.range
        : d <= b.range && (d < 2.2 || angle < (b.move === 'sweep' ? 1.7 : 0.48))
    if (b.move === 'lunge') {
      const end = { x: b.x + Math.sin(b.heading) * 5, z: b.z + Math.cos(b.heading) * 5 }
      contact = contact || dist(end, p) < 2.7
      b.x = end.x
      b.z = end.z
    }
    if (!contact || p.invulnerable > 0) return
    if (p.guard > 0) {
      p.guard = 0
      p.attackCooldown = 0
      b.poise = 0
      s.fx.parry = 1
      s.fx.shake = 0.86
      this.damageBoss(13 + s.rank * 2, 'parry', 'Perfect parry')
      if (b.stage !== 'broken') this.setStage('stunned', 2.1)
      s.fx.hitstop = 0.115
      return
    }
    const armor = (p.active === 0 ? 0.82 : 1) * (p.linkStyle === 'Dispersed' ? 0.85 : 1)
    const taken = move.damage * (1 + (b.phase - 1) * 0.12) * armor
    p.hp = Math.max(0, p.hp - taken)
    p.invulnerable = 0.48
    s.fx.hurt = 1
    s.fx.shake = 0.85
    s.fx.hitstop = 0.055
    this.emit('hurt', Math.round(taken) + ' impact received')
    if (p.hp <= 0) this.settle(false, 'Squad down')
  }
  private chooseBossMove(): BossMove {
    const { boss: b, party: p } = this.state,
      range = dist(b, p)
    if (range > 8.5) return 'lunge'
    if (p.guard > 0 && range <= MOVES.slam.range) return 'slam'
    // After its first armour break the warden counters the most recent attacking operator.
    if (b.phase >= 2 && this.resonanceTime > 0) {
      if (this.lastElement === 1 && range > 4.8) return 'lunge'
      if (this.lastElement === 2 && range <= MOVES.sweep.range) return 'sweep'
    }
    const sequence = PHASE_MOVES[b.phase - 1]
    return sequence[b.attackIndex % sequence.length]
  }
  private beginWindup() {
    const s = this.state,
      b = s.boss,
      p = s.party
    b.move = this.chooseBossMove()
    b.attackIndex++
    b.range = MOVES[b.move].range
    b.heading = direction(b, p)
    b.targetX = p.x
    b.targetZ = p.z
    this.setStage('windup', MOVES[b.move].windup / (1 + (b.phase - 1) * 0.12))
    this.emit('warning', 'Warden · ' + b.move)
  }
  private updateBoss(dt: number) {
    const s = this.state,
      b = s.boss,
      p = s.party
    if (b.stage === 'dead' || b.stage === 'broken') return
    b.stageTime = Math.max(0, b.stageTime - dt)
    if (b.stage === 'idle') {
      const d = dist(p, b)
      b.heading = direction(b, p)
      if (d > 3.8) {
        const v = (1.7 + (b.phase - 1) * 0.65) * dt
        b.x += Math.sin(b.heading) * v
        b.z += Math.cos(b.heading) * v
      }
      if (b.stageTime <= 0 && d <= 11) this.beginWindup()
    } else if (b.stage === 'windup') {
      b.telegraph = 1 - b.stageTime / b.stageDuration
      if (b.telegraph < 0.55) {
        b.heading = direction(b, p)
        b.targetX = p.x
        b.targetZ = p.z
      }
      if (b.stageTime <= 0) {
        this.setStage('strike', 0.24)
        this.incoming()
      }
    } else if (b.stageTime <= 0) {
      if (b.stage === 'strike') this.setStage('recover', MOVES[b.move].recover / (1 + (b.phase - 1) * 0.23))
      else this.setStage('idle', 0.7 / (1 + (b.phase - 1) * 0.24))
    }
  }
  private settle(success: boolean, reason: string) {
    const s = this.state,
      r = s.raid
    if (!r.active) return
    s.report = {
      success,
      alloy: success ? r.loot : 0,
      cores: success ? r.cores : 0,
      bossDown: r.bossDown,
      reason,
    }
    if (success) {
      s.stock.alloy += r.loot
      s.stock.cores += r.cores
      s.cycles++
      this.recalculate()
    }
    s.raid = { ...r, active: false, evacuating: false, extraction: -1 }
    s.day++
    s.hour = 7.25
    for (const c of s.caches) if (!c.night) c.claimed = false
    s.party.hp = s.party.maxHp
    s.rover.speed = 0
    s.rover.vx = 0
    s.rover.vz = 0
    this.setMode(2)
    this.emit(success ? 'success' : 'failure', reason)
    this.save()
  }
  tick(seconds: number, input: Input = {}) {
    if (!finite(seconds) || seconds <= 0) return
    this.accumulator += Math.min(0.25, seconds)
    while (this.accumulator >= STEP) {
      this.step(STEP, input)
      this.accumulator -= STEP
    }
  }
  private step(dt: number, input: Input) {
    const s = this.state
    s.clock += dt
    for (const key of [
      'hit',
      'parry',
      'shake',
      'attack',
      'dodge',
      'switch',
      'finish',
      'hurt',
      'resonance',
    ] as const) {
      const decay = key === 'finish' ? 0.68 : key === 'parry' ? 2.25 : key === 'attack' ? 3.7 : 2.8
      s.fx[key] = Math.max(0, s.fx[key] - dt * decay)
    }
    if (s.fx.hitstop > 0) {
      s.fx.hitstop = Math.max(0, s.fx.hitstop - dt)
      return
    }
    if (s.raid.active && s.mode < 3) return
    if (!s.started && s.mode === 1) return
    if (s.mode === 2 && input.forward) s.started = true
    this.saveTimer += dt
    if (this.saveTimer >= 4) {
      this.saveTimer = 0
      this.save()
    }
    if (!s.raid.active) {
      s.hour += dt / 28
      if (s.delivery.active) {
        s.delivery.timeLeft = Math.max(0, s.delivery.timeLeft - dt)
        if (s.delivery.timeLeft === 0) {
          s.delivery.active = false
          this.emit('warning', 'Freight delivery expired')
        }
      }
      if (s.hour >= 24) {
        s.hour -= 24
        s.day++
        for (const c of s.caches) if (!c.night) c.claimed = false
      }
      const weather = knowWeather(s.day, s.hour)
      if (weather !== s.weather) {
        s.weather = weather
        this.emit(
          'weather',
          weather === 'dust' ? 'Dust front' : weather === 'wind' ? 'Crosswind' : 'Clear skies',
        )
      }
      this.lastCargo += dt
      if (this.lastCargo >= 1) {
        const elapsed = this.lastCargo
        this.lastCargo = 0
        const gain = (s.power.oreRate * elapsed) / 60
        s.stock.ore = Math.min(99, s.stock.ore + gain)
        const converted = Math.min(s.stock.ore, (s.power.rate * elapsed) / 60)
        s.stock.ore -= converted
        s.stock.alloy += converted
      }
      if (s.mode === 1 || s.mode === 2) this.drive(dt, input)
      return
    }
    const r = s.raid,
      p = s.party
    for (const key of [
      'attackCooldown',
      'dodgeCooldown',
      'switchCooldown',
      'parryCooldown',
      'invulnerable',
      'guard',
    ] as const)
      p[key] = Math.max(0, p[key] - dt)
    this.resonanceTime = Math.max(0, this.resonanceTime - dt)
    r.timeLeft = Math.max(0, r.timeLeft - dt)
    const dx = clamp((input.strafe ?? 0) + (input.turn ?? 0), -1, 1)
    const dz = -clamp(input.forward ?? 0, -1, 1)
    const length = Math.hypot(dx, dz)
    if (length > 0.001 && (s.mode === 3 || s.mode === 4)) {
      this.lastMotion = { x: dx / length, z: dz / length }
      p.heading = Math.atan2(dx, dz)
      const speed = [5.4, 6.4, 4.85][p.active] * (p.guard > 0 ? 0.48 : 1)
      p.x = clamp(p.x + this.lastMotion.x * speed * dt, ARENA.x - 15, ARENA.x + 15)
      p.z = clamp(p.z + this.lastMotion.z * speed * dt, ARENA.z - 15, ARENA.z + 15)
    }
    this.updateBoss(dt)
    if (!r.active || !s.raid.active) return
    if (r.evacuating) {
      if (dist(p, EXTRACTION) <= EXTRACTION.radius) {
        if (r.extraction < 0) {
          r.extraction = 5
          this.emit('extract', 'Hold landing zone')
        }
        r.extraction -= dt
        if (r.extraction <= 0) {
          this.settle(true, 'Extraction complete')
          return
        }
      } else if (r.extraction >= 0) {
        r.extraction = -1
        this.emit('warning', 'Extraction interrupted')
      }
    }
    if (r.timeLeft <= 0) this.settle(false, 'Signal lost')
  }
  private drive(dt: number, input: Input) {
    const s = this.state,
      r = s.rover
    const throttle = clamp(input.forward ?? 0, -1, 1),
      steer = clamp(input.turn ?? 0, -1, 1)
    const sin = Math.sin(r.heading),
      cos = Math.cos(r.heading)
    let longitudinal = r.vx * sin + r.vz * cos,
      side = r.vx * cos - r.vz * sin
    const brake =
      throttle !== 0 && Math.sign(throttle) !== Math.sign(longitudinal) && Math.abs(longitudinal) > 0.35
    const top = throttle < 0 ? 6 : 15 + s.rank
    const target = throttle * top
    const gain = brake ? 21 : throttle === 0 ? 4 : 9
    longitudinal += clamp(target - longitudinal, -gain * dt, gain * dt)
    const drifting = !!input.drift && Math.abs(longitudinal) > 3.4
    const traction = s.weather === 'dust' ? 4.3 : s.weather === 'wind' ? 6.1 : 7
    side *= Math.exp(-(drifting ? 0.95 : traction) * dt)
    if (drifting) longitudinal *= Math.exp(-0.21 * dt)
    if (this.groundHeight && (Math.abs(longitudinal) > 0.05 || throttle !== 0)) {
      const along = (this.groundHeight(r.x + sin, r.z + cos) - this.groundHeight(r.x - sin, r.z - cos)) * 0.5
      const across = (this.groundHeight(r.x + cos, r.z - sin) - this.groundHeight(r.x - cos, r.z + sin)) * 0.5
      longitudinal -= ((9.81 * along) / Math.sqrt(1 + along * along)) * dt
      side -= ((9.81 * across) / Math.sqrt(1 + across * across)) * (drifting ? 1 : 0.24) * dt
    }
    const yaw =
      steer * (drifting ? 2.18 : 1.43) * clamp(Math.abs(longitudinal) / 3.5, 0, 1) * Math.sign(longitudinal)
    r.heading = angleDelta(r.heading + yaw * dt, 0)
    // Keep part of the old velocity in world space so rotating the chassis produces a real slip angle.
    const ns = Math.sin(r.heading),
      nc = Math.cos(r.heading)
    const grip = drifting ? 0.07 : 0.58
    const newSin = sin + (ns - sin) * grip,
      newCos = cos + (nc - cos) * grip
    r.vx = longitudinal * newSin + side * newCos
    r.vz = longitudinal * newCos - side * newSin
    const nextX = r.x + r.vx * dt,
      nextZ = r.z + r.vz * dt
    r.x = clamp(nextX, -52, 56)
    r.z = clamp(nextZ, -55, 45)
    if (nextX !== r.x) r.vx = 0
    if (nextZ !== r.z) r.vz = 0
    // A three-disc capsule follows the wheelbase and catches corners before the hull clips a wall.
    const radius = 1.05
    for (const offset of [-1.66, 0, 1.66]) {
      for (const lot of DISTRICT_FOOTPRINTS) {
        const cx = r.x + offset * ns,
          cz = r.z + offset * nc
        if (
          cx < lot.minX - radius ||
          cx > lot.maxX + radius ||
          cz < lot.minZ - radius ||
          cz > lot.maxZ + radius
        )
          continue
        const dx = cx - clamp(cx, lot.minX, lot.maxX),
          dz = cz - clamp(cz, lot.minZ, lot.maxZ)
        const distance = Math.hypot(dx, dz)
        if (distance >= radius) continue
        let nx = 0,
          nz = 0,
          push = radius - distance
        if (distance > 0.0001) {
          nx = dx / distance
          nz = dz / distance
        } else {
          const xDepth = lot.width * 0.5 - Math.abs(cx - lot.x),
            zDepth = lot.depth * 0.5 - Math.abs(cz - lot.z)
          if (xDepth < zDepth) {
            nx = cx < lot.x ? -1 : 1
            push = radius + xDepth
          } else {
            nz = cz < lot.z ? -1 : 1
            push = radius + zDepth
          }
        }
        r.x += nx * push
        r.z += nz * push
        const impact = r.vx * nx + r.vz * nz
        if (impact < 0) {
          r.vx -= nx * impact * 1.05
          r.vz -= nz * impact * 1.05
          if (impact < -5) s.fx.shake = 0.3
        }
      }
    }
    r.speed = r.vx * ns + r.vz * nc
    const slip = r.vx * nc - r.vz * ns
    r.drift = clamp(Math.abs(slip) / 6 + (drifting ? Math.abs(steer) * 0.35 : 0), 0, 1)
  }
  save() {
    if (!this.storage) return
    const s = this.state
    // Per-run combat data is saved with base inventory to keep unbanked salvage separate on reload.
    const data = {
      v: 1,
      started: s.started,
      mode: s.mode,
      day: s.day,
      hour: s.hour,
      rank: s.rank,
      stock: s.stock,
      rover: s.rover,
      party: s.party,
      boss: s.boss,
      raid: s.raid,
      report: s.report,
      nodes: s.nodes,
      combatMemory: { lastElement: this.lastElement, resonanceTime: this.resonanceTime },
      caches: s.caches.map((c) => [c.id, c.claimed]),
      delivery: s.delivery,
      buildKind: s.buildKind,
      cycles: s.cycles,
    }
    try {
      this.storage.setItem(SAVE, JSON.stringify(data))
    } catch {
      /* A full or private store keeps the session in memory. */
    }
  }
  private restore() {
    if (!this.storage) return
    try {
      const text = this.storage.getItem(SAVE)
      if (!text) return
      const d = JSON.parse(text)
      if (d?.v !== 1 || !d.stock || !d.party || !d.rover || !Array.isArray(d.nodes)) return
      const s = this.state
      if (![d.stock.alloy, d.stock.ore, d.stock.cores, d.rank, d.day, d.hour].every(finite)) return
      if (!Array.isArray(d.party.formation) || [...d.party.formation].sort().join(',') !== '0,1,2') return
      const cells = new Set(),
        ids = new Set()
      if (
        !d.nodes.every((n: GridNode) => {
          if (
            !n ||
            !isKind(n.kind) ||
            !inGrid(n.col, n.row) ||
            !Number.isInteger(n.id) ||
            ids.has(n.id) ||
            cells.has(n.col + ',' + n.row)
          )
            return false
          ids.add(n.id)
          cells.add(n.col + ',' + n.row)
          return true
        })
      )
        return
      if (d.delivery?.active && finite(d.delivery.timeLeft)) {
        s.delivery.active = d.delivery.timeLeft > 0
        s.delivery.timeLeft = clamp(d.delivery.timeLeft, 0, 45)
      }
      const { formation, active } = d.party
      s.started = !!d.started
      s.mode = [1, 2, 3, 4].includes(d.mode) ? d.mode : 1
      s.day = Math.max(1, Math.floor(d.day))
      s.hour = clamp(d.hour, 0, 23.99)
      s.weather = knowWeather(s.day, s.hour)
      s.rank = clamp(Math.floor(d.rank), 0, 5)
      s.stock = {
        alloy: Math.max(0, d.stock.alloy),
        ore: Math.max(0, d.stock.ore),
        cores: Math.max(0, d.stock.cores),
      }
      s.cycles = finite(d.cycles) ? Math.max(0, Math.floor(d.cycles)) : 0
      s.nodes = d.nodes.map((n: GridNode) => makeNode(n.id, n.kind, n.col, n.row))
      if (isKind(d.buildKind)) s.buildKind = d.buildKind
      if (Array.isArray(d.caches))
        for (const c of s.caches)
          c.claimed = d.caches.some((a: unknown) => Array.isArray(a) && a[0] === c.id && a[1] === true)
      for (const k of ['x', 'z', 'heading', 'vx', 'vz', 'speed', 'drift'] as const)
        if (finite(d.rover[k])) s.rover[k] = d.rover[k]
      if (validPositions(d.party.positions)) s.party.positions = [...d.party.positions]
      s.party.linkStyle = formationStyle(s.party.positions)
      s.party.formation = formation
      s.party.active = formation.includes(active) ? active : formation[0]
      s.party.bond = BONDS[formation[0]]
      s.party.hp = s.party.maxHp = 100 + s.rank * 12
      if (d.raid?.active && d.boss && finite(d.raid.timeLeft) && finite(d.boss.hp) && finite(d.party.hp)) {
        const stages: BossStage[] = ['idle', 'windup', 'strike', 'recover', 'stunned', 'broken', 'dead']
        if (!stages.includes(d.boss.stage) || !Object.hasOwn(MOVES, d.boss.move)) return
        const numeric = (target: object, data: Record<string, unknown>) => {
          for (const k of Object.keys(target))
            if (typeof Reflect.get(target, k) === 'number' && finite(data[k])) Reflect.set(target, k, data[k])
        }
        numeric(s.boss, d.boss)
        s.boss.stage = d.boss.stage
        s.boss.move = d.boss.move
        numeric(s.party, d.party)
        s.party.active = formation.includes(active) ? active : formation[0]
        if (Number.isInteger(d.combatMemory?.lastElement) && finite(d.combatMemory?.resonanceTime)) {
          this.lastElement = clamp(d.combatMemory.lastElement, -1, 2)
          this.resonanceTime = clamp(d.combatMemory.resonanceTime, 0, 4)
        }
        numeric(s.raid, d.raid)
        s.raid.active = true
        s.raid.evacuating = !!d.raid.evacuating
        s.raid.bossDown = !!d.raid.bossDown
      } else if (
        d.report &&
        typeof d.report.success === 'boolean' &&
        finite(d.report.alloy) &&
        finite(d.report.cores) &&
        typeof d.report.reason === 'string'
      )
        s.report = d.report
    } catch {
      /* A damaged or earlier save can always open a fresh district. */
    }
  }
}
function knowWeather(day: number, hour: number): Weather {
  const slot = (Math.floor(((hour - 15 + 24) % 24) / 1.3) + day - 1) % 6
  return slot === 2 || slot === 5 ? 'dust' : slot === 1 || slot === 4 ? 'wind' : 'clear'
}
