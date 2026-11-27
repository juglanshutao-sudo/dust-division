import { BUILDINGS, CREW, EXTRACTION, Game, LOCATIONS, gridToWorld } from './sim';
import './modes.css';

type Project = (x: number, z: number, height?: number) => { x: number; y: number; visible: boolean };
const kinds = ['generator', 'relay', 'extractor', 'refinery', 'belt'] as const;
type Kind = typeof kinds[number];
const svgPaths: Record<string, string> = {
  yard: 'M3 20V8l9-5 9 5v12H3Zm4 0v-8h10v8M8 15h8',
  foundry: 'M2 21V10l6 3V9l6 3V6h4l3 15H2Zm4-4h2m3 0h2m3 0h2',
  uplink: 'm12 4-5 16m5-16 5 16M8.5 15h7M5 5a9 9 0 0 0 0 9M19 5a9 9 0 0 1 0 9',
  depot: 'm3 7 9-4 9 4v11l-9 4-9-4V7Zm0 0 9 4 9-4m-9 4v11m-5-14 9-4',
  generator: 'm14 2-9 12h6l-1 8 9-13h-6l1-7Z',
  relay: 'm12 3-7 18m7-18 7 18M7 9h10M5 14h14m-11-5 8 5m-8 0 8-5',
  extractor: 'M3 19h18v3H3zm3 0 5-12 6-3 4 3-8 4-3 8M7 5l4 2m7 0-1 7',
  refinery: 'M3 21h18M5 20V8h4v12m3 0v-9l4 2v-3l4 2v8M5 5h4',
  belt: 'M6 8h12a4 4 0 0 1 0 8H6a4 4 0 1 1 0-8Zm0 4h.01M18 12h.01M8 19h8',
  sun: 'M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M19 5l-2 2M5 19l2-2m9-5a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  crate: 'M3 6h18v14H3zM7 6V3h10v3M3 11h18m-12 0v3h6v-3',
  beacon: 'M11 4v13M8 21l3-4 4 4M7 7a6 6 0 0 0 0 7m9-7a6 6 0 0 1 0 7M4 4a10 10 0 0 0 0 13m15-13a10 10 0 0 1 0 13',
  warning: 'M12 2 1 21h22L12 2Zm0 7v5m0 2v2',
  attack: 'm6 18 11-14 3-1-1 6L8 20m-3-6 6 5m-6-1-3 3',
  parry: 'm12 2 8 4v6c0 4-4 7-8 10-4-3-8-6-8-10V6l8-4Zm0 5v9',
  dodge: 'm7 4 8 8-8 8m6-16 8 8-8 8M2 12h11',
  finish: 'M3 3h5m-5 0v5m13-5h5v5M3 16v5h5m8 0h5v-5m-9-9 5 5-5 5-5-5 5-5Z',
  crew0: 'm12 2 8 5-8 5-8-5 8-5Zm-8 10 8 5 8-5m-16 5 8 5 8-5',
  crew1: 'm12 2 9 18H3L12 2Zm0 7v6m-4 2h8',
  crew2: 'M4 4h7v7H4zM13 13h7v7h-7zM14 4h6v6M4 14v6h6',
};
function icon(name: string) {
  return '<svg class="mh-symbol" aria-hidden="true" viewBox="0 0 24 24"><path d="' + (svgPaths[name] ?? svgPaths.crate) + '"/></svg>';
}
const cellName = (col: number, row: number) => String.fromCharCode(65 + col) + String(row + 1);
const floor = (value: number) => Math.max(0, Math.floor(value));
const gauge = (count: number) => '<i></i>'.repeat(count);
const dashTime = (seconds: number) => {
  const s = Math.max(0, Math.ceil(seconds));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
};

function city() {
  return `<section class="mh-page mh-city" aria-label="City district">
    <div class="mh-tl"><div class="city-eyeline mh-cap">Municipal atlas</div><h1 class="city-title">Quarry <em>District</em></h1></div>
    <div class="mh-tr city-time"><div class="mh-cap">${icon('sun')}Local time</div><strong data-ui="clock"></strong><div class="mh-cap" data-ui="weather"></div></div>
    <div class="mh-places">${LOCATIONS.map(place => `<button class="mh-place" data-district="${place.id}" title="Access ${place.name}" aria-label="Access ${place.name}"><span class="place-flag">${icon(place.id)}</span><span class="place-name">${place.name}</span></button>`).join('')}</div>
    <div class="mh-bl city-stores"><p class="mh-cap">District stores</p><dl>${['alloy','ore','cores'].map(k => `<div><dt>${k.toUpperCase()}</dt><dd data-ui="${k}"></dd></div>`).join('')}</dl></div>
    <div class="mh-br city-dispatch"><p class="mh-cap">Street dispatch</p><strong data-ui="event"></strong></div>
  </section>`;
}

function plant() {
  const cells = Array.from({length:49}, (_, i) => {
    const col = i % 7, row = Math.floor(i / 7);
    return `<path class="gridpad" data-cell="${i}" role="button" tabindex="${i === 24 ? '0' : '-1'}" aria-label="Grid ${cellName(col,row)}"/>`;
  }).join('');
  return `<section class="mh-page mh-industry" aria-label="Industrial construction">
    <svg class="mh-plot" aria-label="Construction field, arrow keys to move and Enter to place">${cells}</svg>
    <div class="mh-tl"><div class="industry-eyeline mh-cap">Network control</div><h1 class="industry-title">Fabrication</h1>
    <svg class="industry-ticks" aria-hidden="true"><defs><pattern id="plant-scale" width="7" height="8" patternUnits="userSpaceOnUse"><path d="M1 0v4" stroke="currentColor" stroke-width="1"/></pattern></defs><rect width="100%" height="8" fill="url(#plant-scale)"/></svg>
    <div class="industry-grid-readout"><span>07 × 07</span><span>/</span><span data-ui="output-rate"></span></div></div>
    <div class="mh-tr industry-power" data-ui="load"><p class="mh-cap">Grid load ${icon('generator')}</p><div class="industry-power-read"><strong data-ui="used"></strong><small data-ui="supply"></small></div><div class="industry-power-track" data-ui="power-bars">${gauge(20)}</div></div>
    <div class="mh-bl plant-dock"><div class="plant-dock-head mh-cap"><span>Build tool</span><strong data-ui="alloy-cost"></strong></div>
    <div class="plant-tools" role="group" aria-label="Build tool">${kinds.map(k => `<button type="button" class="plant-tool" data-kind="${k}" title="Select ${BUILDINGS[k].name} · ${BUILDINGS[k].cost} alloy">${icon(k)}<small>${BUILDINGS[k].cost}</small><span>${BUILDINGS[k].name}</span></button>`).join('')}</div>
    <div class="plant-inspector"><span data-ui="inspection"></span><button type="button" data-command="remove" hidden>Remove</button></div></div>
    <div class="mh-br plant-next"><button class="plant-deploy" data-command="prepare">${icon('uplink')}Squad uplink</button></div>
  </section>`;
}

function raid() {
  return `<section class="mh-page mh-industry mh-raid" aria-label="Extraction operations">
    <div class="mh-tl"><div class="industry-eyeline mh-cap">Exclusion zone / time left</div><strong class="raid-clock" data-ui="countdown"></strong><div class="raid-gauge" data-ui="raid-bars">${gauge(28)}</div></div>
    <div class="mh-tr raid-cargo"><p class="mh-cap">Unbanked cargo</p><strong data-ui="loot"></strong><span>ALLOY</span></div>
    <div class="mh-loot" data-ui="loot-pins"></div>
    <div class="mh-bl"><button class="raid-action" data-command="prepare">${icon('warning')}Engage warden</button></div>
    <div class="mh-br raid-exit"><p class="mh-cap" data-ui="evac-range"></p><button class="raid-action" data-command="extract">${icon('beacon')}<span data-ui="evac"></span></button></div>
  </section>`;
}

function battle() {
  return `<section class="mh-page mh-battle" aria-label="Warden encounter and squad formation">
    <div class="mh-tl"><p class="battle-ident mh-cap">${icon('warning')}<span data-ui="arena-status"></span></p><h1 class="battle-title">Quarry <span>Warden</span></h1>
    <div class="boss-line"><progress data-ui="boss-bar" max="100" value="100" aria-label="Warden integrity"></progress><span data-ui="boss-pct"></span></div></div>
    <div class="mh-tr battle-scope" data-ui="scope"><div class="scope-head mh-cap"><span>Telemetry</span><span data-ui="phase"></span></div>
    <svg viewBox="0 0 220 42" preserveAspectRatio="none" aria-hidden="true"><path class="scope-grid" stroke-dasharray="1 4" d="M0 6H220M0 21H220M0 36H220"/><path class="scope-wave" data-ui="scope-path"/></svg>
    <p class="scope-move"><span data-ui="boss-move"></span><small data-ui="boss-window"></small></p></div>
    <div class="mh-bl battle-roster"><div class="squad-caption"><span class="mh-cap" data-ui="squad-label"></span><span class="bond-label" data-ui="bond"></span></div>
    <div class="squad-slots" role="group" aria-label="Squad formation">${[0,1,2].map(i => `<button class="squad-slot" data-slot="${i}"><span data-ui="slot-icon-${i}" style="display:contents"></span><strong data-ui="name-${i}"></strong><small data-ui="element-${i}"></small></button>`).join('')}</div>
    <div class="squad-health"><span class="mh-cap" data-ui="squad-information"></span><progress data-ui="party-bar" max="100" value="100" aria-label="Squad integrity"></progress></div></div>
    <div class="mh-br battle-actions"><button class="battle-deploy" data-command="raid">Launch incursion ${icon('uplink')}</button>
    <div class="combat-strip" data-ui="combat-acts">${[['attack','Attack','J'],['parry','Parry','K'],['dodge','Dodge','Space'],['finish','Finish','F']].map(([k,n,key]) => `<button class="combat-act" data-command="${k}" title="${n} · ${key}" aria-label="${n}">${icon(k)}${n}</button>`).join('')}</div>
    <button class="battle-withdraw" data-command="exfil">Extraction field</button></div>
  </section>`;
}

export function createModes(container: HTMLElement, game: Game, project: Project) {
  const root = document.createElement('div');
  root.className = 'mode-huds';
  container.append(root);
  const cache = new Map<string, Element>();
  const anchors = new Map<HTMLElement, string>();
  let page = '';
  let selectedCell = -1;
  let hoveredCell = -1;
  let gridPaths: SVGPathElement[] = [];
  let lastSignalFrame = -1;
  let lastSignature = '';

  function element<T extends Element = HTMLElement>(selector: string): T {
    let found = cache.get(selector);
    if (!found) {
      found = root.querySelector(selector) ?? undefined;
      if (!found) throw new Error('Missing game interface ' + selector);
      cache.set(selector, found);
    }
    return found as T;
  }
  const field = (key: string) => element('[data-ui="' + key + '"]');
  function write(key: string, value: string | number) {
    const el = field(key), txt = String(value);
    if (el.textContent !== txt) el.textContent = txt;
  }
  function attr(el: Element, key: string, value: string) {
    if (el.getAttribute(key) !== value) el.setAttribute(key, value);
  }
  function bars(key: string, fraction: number) {
    const el = field(key);
    const n = Math.ceil(Math.max(0, Math.min(1, fraction)) * el.childElementCount);
    if (el.dataset.lit === String(n)) return;
    el.dataset.lit = String(n);
    Array.from(el.children).forEach((v, i) => v.classList.toggle('on', i < n));
  }
  function pin(el: HTMLElement, x: number, z: number, height: number, box: DOMRect, style = '') {
    const pos = project(x, z, height);
    const px = Math.round((pos.x - box.left) * 2) * .5, py = Math.round((pos.y - box.top) * 2) * .5;
    el.hidden = !(pos.visible && px > 0 && px < box.width && py > 0 && py < box.height);
    if (el.hidden) return;
    const value = 'translate3d(' + px + 'px,' + py + 'px,0)' + style;
    if (anchors.get(el) !== value) {
      anchors.set(el, value);
      el.style.transform = value;
    }
  }
  function mount(next: string) {
    page = next;
    cache.clear();
    anchors.clear();
    lastSignalFrame = -1;
    lastSignature = '';
    root.hidden = !next;
    root.innerHTML = next === 'city' ? city() : next === 'plant' ? plant() : next === 'raid' ? raid() : next === 'battle' ? battle() : '';
    gridPaths = Array.from(root.querySelectorAll<SVGPathElement>('.gridpad'));
    root.firstElementChild?.classList.add('mh-page-enter');
    if (next === 'raid') {
      const pins = field('loot-pins');
      pins.innerHTML = game.state.caches.filter(c => c.night).map(c => `<button class="mh-loot-point" data-cache="${c.id}" title="Search cache · ${c.amount} alloy">${icon('crate')}<span></span></button>`).join('') +
        `<button class="mh-loot-point" data-beacon data-command="extract" title="Activate extraction beacon">${icon('beacon')}<span>LZ</span></button>`;
    }
  }

  function updateCity(box: DOMRect) {
    const s = game.state;
    const minutes = Math.floor(s.hour * 60);
    write('clock', String(Math.floor(minutes / 60) % 24).padStart(2,'0') + ':' + String(minutes % 60).padStart(2,'0'));
    write('weather', 'Day ' + String(s.day).padStart(2,'0') + ' / ' + ({clear:'Clear', wind:'Crosswind', dust:'Dust front'}[s.weather]));
    for (const kind of ['alloy','ore','cores'] as const) write(kind, floor(s.stock[kind]));
    const near = s.caches.filter(c => !c.night && !c.claimed).sort((a,b) => Math.hypot(a.x-s.rover.x,a.z-s.rover.z) - Math.hypot(b.x-s.rover.x,b.z-s.rover.z))[0];
    write('event', s.delivery.active ? 'Motor Pool · ' + Math.ceil(s.delivery.timeLeft) + ' s' : near ? 'Salvage · ' + Math.round(Math.hypot(near.x-s.rover.x, near.z-s.rover.z)) + ' m' : 'All caches recovered');
    const report = s.report;
    const dispatch = element('.city-dispatch');
    if (report) {
      const label = report.success ? 'Cargo banked' : 'Sortie lost';
      write('event', report.success ? '+' + report.alloy + ' alloy / +' + report.cores + ' core' : report.reason);
      const cap = dispatch.querySelector('.mh-cap')!;
      if (cap.textContent !== label) cap.textContent = label;
      if (!dispatch.querySelector('button')) {
        const dismiss = document.createElement('button');
        dismiss.dataset.command = 'dismiss';
        dismiss.setAttribute('aria-label', 'Dismiss sortie report');
        dismiss.textContent = 'Close';
        dispatch.append(dismiss);
      }
    } else if (dispatch.querySelector('button')) {
      dispatch.querySelector('button')!.remove();
      dispatch.querySelector('.mh-cap')!.textContent = 'Street dispatch';
    }
    for (const place of LOCATIONS) {
      const el = element<HTMLButtonElement>('[data-district="' + place.id + '"]');
      pin(el, place.x, place.z, 4.8, box, ' translate(-28%,-100%) skewY(-8deg)');
      const isDepot = place.id === 'depot';
      const delivery = isDepot && s.delivery.active;
      const action = delivery ? 'Deliver freight · ' + s.delivery.reward + ' alloy' : isDepot ? (s.rank >= 5 ? 'Fully refitted' : 'Refit · ' + game.upgradeCost + ' alloy') : place.action;
      el.disabled = delivery ? Math.hypot(s.rover.x-place.x,s.rover.z-place.z) > place.radius + 5 : isDepot && (s.rank >= 5 || s.stock.alloy < game.upgradeCost || s.raid.active);
      attr(el, 'title', action);
      attr(el, 'aria-label', place.name + ' · ' + action);
      if (isDepot) {
        const name = el.querySelector('.place-name')!;
        const label = delivery ? 'Deliver freight' : 'Motor Pool · ' + (s.rank >= 5 ? 'MAX' : game.upgradeCost);
        if (name.textContent !== label) name.textContent = label;
      }
    }
  }

  function updatePlant(box: DOMRect) {
    const s = game.state, {power} = s;
    write('alloy-cost', floor(s.stock.alloy) + ' alloy');
    write('output-rate', '+' + power.rate + ' alloy / min');
    write('used', power.used);
    write('supply', '/ ' + power.supply + ' MW');
    attr(field('load'), 'data-load', power.demand > power.used ? 'over' : 'ok');
    bars('power-bars', power.supply ? power.used / power.supply : 0);
    for (const kind of kinds) {
      const btn = element<HTMLButtonElement>('[data-kind="' + kind + '"]');
      btn.disabled = s.stock.alloy < BUILDINGS[kind].cost;
      attr(btn,'aria-pressed', String(s.buildKind === kind));
    }
    const inspected = selectedCell >= 0 ? selectedCell : hoveredCell;
    const selected = inspected >= 0 ? cellName(inspected % 7, Math.floor(inspected / 7)) : '';
    const node = s.nodes.find(n => n.col + n.row * 7 === inspected);
    const remove = element<HTMLButtonElement>('[data-command="remove"]');
    remove.hidden = !node || selectedCell !== inspected;
    write('inspection', node
      ? [selected, BUILDINGS[node.kind].name, node.kind === 'belt' ? node.linked ? 'Linked' : 'Idle' : node.powered ? 'Online' : 'Unpowered'].join(' / ')
      : selected ? selected + ' / Place ' + BUILDINGS[s.buildKind].name : 'Select a build site');
    const signature = s.nodes.map(n => n.id + ':' + n.col + ':' + n.row).join(';') + '/' + selectedCell;
    if (lastSignature !== signature) {
      lastSignature = signature;
      const nodes = new Map(s.nodes.map(n => [n.row * 7 + n.col,n]));
      gridPaths.forEach((el,i) => {
        const n = nodes.get(i);
        el.classList.toggle('selected', selectedCell === i);
        el.classList.toggle('occupied', !!n);
        attr(el, 'aria-label', cellName(i % 7, Math.floor(i / 7)) + ' · ' + (n ? BUILDINGS[n.kind].name : 'Empty footprint'));
      });
    }
    // A shared projected vertex grid keeps all 49 interactive cells aligned with the field.
    const vertices = Array.from({length:64}, (_, i) => {
      const p = gridToWorld(i % 8 - .5, Math.floor(i / 8) - .5), q = project(p.x, p.z, .07);
      return { point: Math.round(q.x - box.left) + ',' + Math.round(q.y - box.top), visible: q.visible };
    });
    gridPaths.forEach((el,i) => {
      const n = Math.floor(i / 7) * 8 + i % 7;
      const corners = [vertices[n], vertices[n+1], vertices[n+9], vertices[n+8]];
      const visible = corners.every(v => v.visible);
      attr(el, 'visibility', visible ? 'visible' : 'hidden');
      if (visible) attr(el, 'd', 'M' + corners.map(v => v.point).join('L') + 'Z');
    });
  }

  function updateRaid(box: DOMRect) {
    const s = game.state, r = s.raid;
    write('countdown', dashTime(r.timeLeft));
    attr(field('countdown'), 'data-urgent', String(r.timeLeft < 25));
    bars('raid-bars', r.timeLeft/110);
    write('loot', r.loot);
    const range = Math.hypot(s.party.x - EXTRACTION.x, s.party.z - EXTRACTION.z);
    write('evac-range', r.extraction >= 0 ? 'Hold position' : Math.ceil(range) + ' m / Landing zone');
    write('evac', r.extraction >= 0 ? 'Uplink ' + Math.max(0,r.extraction).toFixed(1) + ' s' : r.evacuating ? 'Beacon active' : 'Call extraction');
    element<HTMLButtonElement>('.raid-exit button').disabled = r.evacuating;
    pin(element('[data-beacon]'), EXTRACTION.x, EXTRACTION.z, 1.5, box, ' translate(-50%,-100%)');
    for (const c of s.caches.filter(v => v.night)) {
      const el = element<HTMLButtonElement>('[data-cache="' + c.id + '"]');
      if (c.claimed) { el.hidden = true; continue; }
      pin(el, c.x, c.z, 1.2, box, ' translate(-50%,-100%)');
      const distance = Math.hypot(c.x - s.party.x, c.z - s.party.z);
      const txt = distance <= 5.5 ? 'Search +' + c.amount : Math.ceil(distance) + ' m';
      el.disabled = distance > 5.5;
      const caption = el.querySelector('span')!;
      if (caption.textContent !== txt) caption.textContent = txt;
    }
    element<HTMLButtonElement>('[data-command="prepare"]').hidden = r.bossDown;
  }

  function updateBattle() {
    const s = game.state, b = s.boss, p = s.party, live = s.raid.active;
    const ratio = live ? b.hp / b.maxHp : 1;
    write('arena-status', live ? 'Exclusion zone / ' + dashTime(s.raid.timeLeft) : 'Encounter preparation');
    attr(field('boss-bar'), 'value', String(Math.round(ratio * 100)));
    write('boss-pct', Math.ceil(ratio * 100) + '%');
    write('phase', 'P' + (live ? b.phase : 1) + ' / 3');
    const hot = live && b.stage === 'windup' && b.stageTime <= .26;
    attr(field('scope'),'data-open',String(hot || b.stage === 'broken'));
    const stage = live ? b.stage : 'idle';
    write('boss-move', !live ? 'Standby' : stage === 'windup' || stage === 'strike' ? b.move : ({idle:'Tracking',recover:'Recovering',stunned:'Staggered',broken:'Core exposed',dead:'Core secured'}[stage]));
    write('boss-window', !live ? 'Offline' : stage === 'windup' ? (hot ? 'PARRY' : b.stageTime.toFixed(1) + ' s') : stage === 'broken' ? 'EXECUTE' : 'LIVE');
    const frame = Math.floor(s.clock * 18);
    if (lastSignalFrame !== frame) {
      lastSignalFrame = frame;
      const intensity = !live || stage === 'dead' ? .06 : stage === 'windup' ? .3 + b.telegraph * .7 : stage === 'strike' || stage === 'stunned' ? .9 : .25;
      const points: string[] = [];
      for (let i = 0; i <= 55; i++) {
        const t = (i + frame) % 21;
        const pulse = t === 4 ? -8 : t === 5 ? 16 : t === 6 ? -13 : t < 12 && t > 7 ? 3 : 0;
        const y = 21 - Math.round((pulse + Math.sin((frame+i)*.65)*2) * intensity);
        points.push((i ? 'H' + i * 4 + 'V' : 'M0 ') + y);
      }
      attr(field('scope-path'),'d',points.join(''));
    }
    write('squad-label', live ? 'Squad channel' : 'Lead operator');
    write('bond', p.bond);
    const bonds: Record<string,string> = {Bulwark:'Extended parry',Induction:'Arc resonance',Overpressure:'Stagger bonus'};
    write('squad-information', live ? 'Integrity ' + Math.ceil(p.hp) + ' / ' + p.maxHp : bonds[p.bond] ?? 'Formation set');
    attr(field('party-bar'),'value',String(Math.ceil(p.hp / p.maxHp * 100)));
    field('party-bar').hidden = !live;
    p.formation.forEach((id,i) => {
      const op = CREW[id];
      const btn = element<HTMLButtonElement>('[data-slot="' + i + '"]');
      const sign = field('slot-icon-' + i);
      if (sign.dataset.operator !== String(id)) { sign.dataset.operator = String(id); sign.innerHTML = icon('crew' + id); }
      write('name-' + i, op.name);
      write('element-' + i, op.element);
      btn.disabled = live && p.switchCooldown > 0;
      attr(btn,'aria-pressed',String(id === p.active));
      attr(btn,'title',(live ? 'Switch to ' : 'Set formation lead · ') + op.name + ' / ' + op.role);
    });
    element('[data-command="raid"]').hidden = live;
    field('combat-acts').hidden = !live;
    element('[data-command="exfil"]').hidden = !live;
    if (live) {
      element<HTMLButtonElement>('[data-command="attack"]').disabled = p.attackCooldown > 0 || b.stage === 'dead';
      element<HTMLButtonElement>('[data-command="parry"]').disabled = p.parryCooldown > 0 || b.stage === 'dead';
      element('[data-command="parry"]').classList.toggle('window', hot);
      element<HTMLButtonElement>('[data-command="dodge"]').disabled = p.dodgeCooldown > 0;
      element<HTMLButtonElement>('[data-command="finish"]').disabled = b.stage !== 'broken' || Math.hypot(b.x-p.x,b.z-p.z)>8;
    }
  }

  function activateCell(i: number) {
    const col = i % 7, row = Math.floor(i / 7);
    selectedCell = i;
    if (!game.state.nodes.some(n => n.col === col && n.row === row)) game.act('build', {col,row});
    gridPaths.forEach((el,index) => attr(el,'tabindex',index === i ? '0':'-1'));
  }
  function onclick(e: MouseEvent) {
    if (!(e.target instanceof Element)) return;
    const el = e.target.closest<HTMLElement>('[data-cell], button');
    if (!el || !root.contains(el)) return;
    const {cell,district,kind,cache: id,slot,command} = el.dataset;
    if (cell !== undefined) activateCell(Number(cell));
    else if (district) game.act('district',district);
    else if (kind) { selectedCell = -1; game.act('selectBuild',kind as Kind); }
    else if (id) game.act('salvage',id);
    else if (slot !== undefined) {
      const i = Number(slot);
      if (game.state.raid.active) game.act('switch',game.state.party.formation[i]);
      else game.act('formation',i);
    } else if (command === 'remove' && selectedCell >= 0) {
      game.act('remove',{col:selectedCell % 7,row:Math.floor(selectedCell / 7)});
      selectedCell = -1;
    } else if (command === 'prepare') game.setMode(4);
    else if (command === 'exfil') game.setMode(3);
    else if (command) game.act(command);
    update();
  }
  function onKey(e: KeyboardEvent) {
    if (!(e.target instanceof SVGPathElement) || !e.target.hasAttribute('data-cell')) return;
    const i = Number(e.target.dataset.cell);
    if (e.key === 'Enter' || e.key === ' ') activateCell(i);
    else {
      const offset = {ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[e.key];
      if (!offset) return;
      const next = Math.max(0,Math.min(48,i+offset));
      attr(gridPaths[i],'tabindex','-1');
      attr(gridPaths[next],'tabindex','0');
      gridPaths[next].focus();
      hoveredCell = next;
    }
    e.stopPropagation();
    e.preventDefault();
    update();
  }
  function onPointer(e: PointerEvent) {
    if (!(e.target instanceof Element)) return;
    const el = e.target.closest<SVGPathElement>('[data-cell]');
    hoveredCell = el ? Number(el.dataset.cell) : -1;
  }
  function update() {
    const {mode,raid: r} = game.state;
    const target = mode === 1 ? '' : mode === 2 ? 'city' : mode === 3 ? r.active ? 'raid' : 'plant' : 'battle';
    if (page !== target || (!target && !root.hidden)) mount(target);
    if (!page) return;
    if (page === 'battle') { updateBattle(); return; }
    const box = root.getBoundingClientRect();
    if (page === 'city') updateCity(box);
    if (page === 'plant') updatePlant(box);
    if (page === 'raid') updateRaid(box);
  }
  root.addEventListener('click', onclick);
  root.addEventListener('keydown', onKey);
  root.addEventListener('pointerover',onPointer);
  update();
  return { update, destroy() {
    root.removeEventListener('click',onclick);
    root.removeEventListener('keydown',onKey);
    root.removeEventListener('pointerover',onPointer);
    root.remove();
  }};
}
