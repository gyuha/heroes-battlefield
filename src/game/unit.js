// 부대(중대) 시뮬레이션. 부대는 병력 수(troops)로 전투를 계산하고, 화면에는 비율(ratio)만큼의 병사 인형(figure)으로 표현된다.
import { CLASS_INFO, isCavalry, isRanged, reachMeters, rangeMeters } from '../data/troops.js';
import { clamp } from '../core/rules.js';

let nextId = 1;
export const FORMATIONS = { block: '방진', circle: '원진', wedge: '쐐기진', snake: '장사진', hollow: '공심방진' };
const FORM_SPEED = { block: 1, circle: 0.7, wedge: 1.05, snake: 1.2, hollow: 0.6 };

/** 대형별 병사 자리(로컬 좌표: lx 오른쪽, lz 앞쪽). */
export function formationSlots(form, n, sp, aspect = 2.6) {
  const out = [];
  if (n <= 0) return { slots: out, hw: 0, hd: 0 };
  if (form === 'circle') {
    let placed = 0, ring = 0;
    while (placed < n) {
      const r = ring === 0 ? 0 : ring * sp;
      const cap = ring === 0 ? 1 : Math.floor((Math.PI * 2 * r) / sp);
      const m = Math.min(cap, n - placed);
      for (let k = 0; k < m; k++) { const a = (k / m) * Math.PI * 2 + ring * 0.3; out.push({ lx: Math.cos(a) * r, lz: Math.sin(a) * r }); }
      placed += m; ring++;
    }
    const R = (ring - 1) * sp;
    // 바깥 고리부터 앞줄로 쓰기 위해 역순
    out.reverse();
    return { slots: out, hw: R, hd: R };
  }
  if (form === 'hollow') {
    const side = Math.max(2, Math.ceil(n / 4) + 1);
    const L = (side - 1) * sp;
    for (let k = 0; out.length < n; k++) {
      const layer = Math.floor(k / (4 * (side - 1)));
      const kk = k % (4 * (side - 1)), s = Math.floor(kk / (side - 1)), t = (kk % (side - 1)) * sp - L / 2;
      const h = L / 2 - layer * sp;
      const p = [{ lx: t, lz: h }, { lx: h, lz: -t }, { lx: -t, lz: -h }, { lx: -h, lz: t }][s];
      out.push(p);
      if (k > n * 4) break;
    }
    return { slots: out, hw: L / 2, hd: L / 2 };
  }
  if (form === 'wedge') {
    let row = 0;
    while (out.length < n) {
      const w = row * 2 + 1;
      for (let k = 0; k < w && out.length < n; k++) out.push({ lx: (k - row) * sp * 0.9, lz: -row * sp * 0.9 });
      row++;
    }
    const depth = (row - 1) * sp * 0.9;
    for (const s of out) s.lz += depth / 2;
    return { slots: out, hw: row * sp * 0.9, hd: depth / 2 };
  }
  const cols = form === 'snake' ? Math.min(3, n) : Math.max(1, Math.round(Math.sqrt(n * aspect)));
  const rows = Math.ceil(n / cols);
  for (let r = 0; r < rows; r++) {
    const inRow = Math.min(cols, n - r * cols);
    for (let c = 0; c < inRow; c++) out.push({ lx: (c - (inRow - 1) / 2) * sp, lz: ((rows - 1) / 2 - r) * sp });
  }
  return { slots: out, hw: ((cols - 1) * sp) / 2, hd: ((rows - 1) * sp) / 2 };
}

export class Unit {
  constructor({ side, front, name, key, troop, troops, ratio, x, z, facing, ai = true }) {
    this.id = nextId++;
    this.side = side; // 'A' 플레이어 측, 'B' 상대
    this.front = front; // 'main' | 'lt1' | 'lt2'
    this.homeFront = front;
    this.name = name;
    this.key = key;
    this.t = troop;
    this.cls = troop.cls;
    this.cav = isCavalry(this.cls);
    this.ranged = isRanged(this.cls);
    this.troops = troops;
    this.maxTroops = troops;
    this.ratio = ratio;
    this.x = x; this.z = z; this.facing = facing;
    this.vx = 0; this.vz = 0; this.speed = 0;
    this.formation = this.cls === 'archer' || this.cls === 'crossbow' ? 'block' : this.cav ? 'wedge' : 'block';
    this.order = { type: 'hold', x, z, facing };
    this.path = null;
    this.ai = ai; // true 면 전선 지휘관(AI)이 지휘
    this.selected = false;
    this.attackTimer = Math.random() * 1.5;
    this.reloadTimer = Math.random() * 2;
    this.stillTime = 3;
    this.runTime = 0;
    this.charging = false;
    this.chargeCd = 0;
    this.meleeTime = 0;
    this.engaged = null; // 근접 중인 적 부대
    this.engagedHero = false;
    this.target = null; // 사격·공격 대상
    this.morale = 100;
    this.routing = false;
    this.routTime = 0;
    this.dead = false;
    this.kills = 0;
    this.shieldMax = this.cls === 'shield' ? troops * troop.hp * 0.25 : 0;
    this.shield = this.shieldMax;
    this.lastHit = -10;
    this.lastShieldHit = -10;
    this.reach = this.t.reach ? reachMeters(this.t) : 2;
    this.range = this.ranged ? rangeMeters(this.t) : 0;
    this.baseSpeed = CLASS_INFO[this.cls].speed;
    this.status = '대기';
    this.spacing = this.cav ? 2.6 : 1.55;
    const n = Math.max(1, Math.ceil(troops / ratio));
    this.figures = [];
    this.layout();
    for (let k = 0; k < n; k++) {
      const s = this.slotWorld(k);
      this.figures.push({ x: s.x, z: s.z, y: 0, vy: 0, ox: 0, oz: 0, alive: true, phase: Math.random() * 6.28, atk: 0, launch: 0, hit: 0, dieT: 0, face: facing });
    }
  }

  get alive() { return this.figures.reduce((n, f) => n + (f.alive ? 1 : 0), 0); }
  get braced() { return this.cls === 'spear' && this.stillTime > 1.4 && !this.routing; }
  get effective() { return this.routing || this.dead ? 0 : this.troops; }

  layout() {
    const n = Math.max(1, Math.ceil(this.troops / this.ratio));
    const aspect = this.cls === 'spear' || this.cls === 'shield' ? 3.2 : this.ranged ? 3 : this.cav ? 1.6 : 2.4;
    const res = formationSlots(this.formation, n, this.spacing, aspect);
    this.slots = res.slots;
    this.hw = res.hw + this.spacing * 0.6;
    this.hd = res.hd + this.spacing * 0.6;
    this.radius = Math.hypot(this.hw, this.hd);
  }

  setFormation(f) { if (this.formation !== f) { this.formation = f; this.layout(); } }

  slotWorld(k) {
    const s = this.slots[k] ?? { lx: 0, lz: 0 };
    const c = Math.cos(this.facing), sn = Math.sin(this.facing);
    // 앞쪽 = (cos, sin), 오른쪽 = (-sin, cos)
    return { x: this.x + c * s.lz - sn * s.lx, z: this.z + sn * s.lz + c * s.lx };
  }

  /** 다른 부대 방향으로의 외곽 반경(직사각형 근사). */
  extentToward(dx, dz) {
    const d = Math.hypot(dx, dz) || 1;
    const ux = dx / d, uz = dz / d;
    const c = Math.cos(this.facing), s = Math.sin(this.facing);
    return Math.abs(ux * c + uz * s) * this.hd + Math.abs(-ux * s + uz * c) * this.hw;
  }

  gapTo(o) {
    const dx = o.x - this.x, dz = o.z - this.z;
    return Math.hypot(dx, dz) - this.extentToward(dx, dz) - o.extentToward(-dx, -dz);
  }

  moveSpeed(map) {
    const terr = map.speedAt(this.x, this.z) || 0.5;
    let sp = this.baseSpeed * FORM_SPEED[this.formation] * terr;
    if (this.routing) sp *= 1.25;
    if (this.cav && map.slowFor(this.x, this.z)) sp *= 0.8;
    return sp;
  }

  /** 병력 손실을 반영하고 인형 수를 맞춘다. 반환값: 실제 사망자 수. */
  takeLosses(n, hitX, hitZ, time) {
    if (this.dead || !(n > 0)) return 0;
    const lost = Math.min(this.troops, n);
    this.troops -= lost;
    this.lastHit = time;
    this.morale -= (lost / this.maxTroops) * 120;
    const want = Math.ceil(this.troops / this.ratio - 1e-6);
    let alive = this.alive;
    while (alive > want) {
      // 피격 지점에 가장 가까운 인형부터 쓰러진다.
      let best = -1, bd = Infinity;
      for (let k = 0; k < this.figures.length; k++) {
        const f = this.figures[k];
        if (!f.alive) continue;
        const d = hitX === undefined ? -k : (f.x - hitX) ** 2 + (f.z - hitZ) ** 2;
        if (d < bd) { bd = d; best = k; }
      }
      if (best < 0) break;
      this.figures[best].alive = false;
      this.figures[best].dieT = time;
      alive--;
    }
    if (this.troops <= 0.5) { this.troops = 0; this.dead = true; this.figures.forEach((f) => { if (f.alive) { f.alive = false; f.dieT = time; } }); }
    return lost;
  }

  /** 살아 있는 인형을 앞 열부터 자리에 배정해 이동시킨다. */
  updateFigures(dt, map, time) {
    const alive = [];
    for (const f of this.figures) if (f.alive) alive.push(f);
    if (alive.length !== this.slots.length) this.layout();
    const c = Math.cos(this.facing), s = Math.sin(this.facing);
    const figSpeed = Math.max(this.speed * 1.6, this.cav ? 9 : 4);
    for (let k = 0; k < alive.length; k++) {
      const f = alive[k];
      const sl = this.slots[k] ?? { lx: 0, lz: 0 };
      let tx = this.x + c * sl.lz - s * sl.lx, tz = this.z + s * sl.lz + c * sl.lx;
      if (this.routing) { tx += Math.sin(f.phase * 3 + time) * 3; tz += Math.cos(f.phase * 2 + time) * 3; }
      if (map.blocked(tx, tz)) {
        // 다리·좁은 길에서는 부대 중심 쪽으로 모인다.
        for (let q = 1; q <= 4; q++) {
          const nx = tx + (this.x - tx) * (q / 4), nz = tz + (this.z - tz) * (q / 4);
          if (!map.blocked(nx, nz)) { tx = nx; tz = nz; break; }
        }
      }
      const dx = tx - f.x, dz = tz - f.z, d = Math.hypot(dx, dz);
      const step = Math.min(d, figSpeed * dt * (d > 3 ? 1.4 : 1));
      if (d > 0.01) { f.x += (dx / d) * step; f.z += (dz / d) * step; }
      f.moving = d > 0.3;
      const wantFace = this.engaged || this.target || !f.moving ? this.facing : Math.atan2(dz, dx);
      f.face += Math.atan2(Math.sin(wantFace - f.face), Math.cos(wantFace - f.face)) * Math.min(1, dt * 8);
      // 넉백·날림
      if (f.launch > 0 || f.y > 0) {
        f.vy -= 30 * dt; f.y += f.vy * dt;
        f.x += f.ox * dt; f.z += f.oz * dt;
        f.launch = Math.max(0, f.launch - dt);
        if (f.y <= 0) { f.y = 0; f.vy = 0; f.ox = 0; f.oz = 0; f.launch = 0; }
      } else if (f.ox || f.oz) {
        f.x += f.ox * dt; f.z += f.oz * dt; f.ox *= Math.max(0, 1 - dt * 6); f.oz *= Math.max(0, 1 - dt * 6);
        if (Math.abs(f.ox) + Math.abs(f.oz) < 0.05) { f.ox = 0; f.oz = 0; }
      }
      if (map.blocked(f.x, f.z)) { const p = map.nearestOpen(f.x, f.z); f.x += (p.x - f.x) * 0.3; f.z += (p.z - f.z) * 0.3; }
      f.atk = Math.max(0, f.atk - dt * 3);
      f.hit = Math.max(0, f.hit - dt * 4);
    }
  }

  statusText() {
    if (this.dead) return '전멸';
    if (this.routing) return '패주';
    if (this.engaged || this.engagedHero) return this.charging ? '돌격 중' : '교전 중';
    if (this.ranged && this.target && this.reloadTimer < 99) return '사격 중';
    if (this.cls === 'spear' && this.braced) return '창 세움';
    if (this.speed > 0.4) return this.charging ? '돌격' : this.order.type === 'retreat' ? '후퇴' : '전진';
    return this.order.type === 'hold' ? '고수' : '대기';
  }

  moraleRecover(dt, time) {
    if (time - this.lastHit > 4 && !this.routing) this.morale = clamp(this.morale + dt * 4, -50, 100);
  }
}
