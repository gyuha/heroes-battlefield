// 전장 지도: 지형 특징(features)을 2m 격자로 래스터화해 높이·지형 종류·통행 가능 여부를 제공하고 A* 경로를 찾는다.
import { seededRandom, clamp } from '../core/rules.js';

export const CELL = 2;
export const T = { GRASS: 0, SAND: 1, MUD: 2, FOREST: 3, ROAD: 4, WATER: 5, FORD: 6, BRIDGE: 7, CLIFF: 8, WALL: 9, HOUSE: 10, SEA: 11 };
const SPEED = [1, 0.92, 0.55, 0.65, 1.08, 0, 0.5, 1, 0, 0, 0, 0];
const BLOCK = [0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 1, 1];

function distToSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz || 1;
  const t = clamp(((px - ax) * dx + (pz - az) * dz) / l2, 0, 1);
  const x = ax + dx * t, z = az + dz * t;
  return Math.hypot(px - x, pz - z);
}
export function distToPolyline(px, pz, pts) {
  let d = Infinity;
  for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, distToSegment(px, pz, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
  return d;
}
const inRect = (px, pz, r) => {
  const rot = r.rot ?? 0, c = Math.cos(-rot), s = Math.sin(-rot);
  const lx = (px - r.x) * c - (pz - r.z) * s, lz = (px - r.x) * s + (pz - r.z) * c;
  return Math.abs(lx) <= r.len / 2 && Math.abs(lz) <= r.w / 2;
};

export class BattleMap {
  constructor(def, { sand = false, seed = 1 } = {}) {
    this.W = def.size?.[0] ?? 320;
    this.H = def.size?.[1] ?? 220;
    this.def = def;
    this.sand = sand;
    this.cols = Math.round(this.W / CELL);
    this.rows = Math.round(this.H / CELL);
    this.type = new Uint8Array(this.cols * this.rows);
    this.heightGrid = new Float32Array((this.cols + 1) * (this.rows + 1));
    this.decor = { trees: [], walls: [], tents: [], houses: [], bridges: [], cliffs: [], fords: [], rivers: [], roads: [], rocks: [] };
    this.rand = seededRandom(seed * 7919 + 13);
    this.features = def.features ?? [];
    this.build();
  }

  // 지형 높이(연속 함수). 언덕은 코사인 감쇠, 강은 파인 골짜기.
  rawHeight(x, z) {
    // 기준 지면을 1m 올려 물(-0.55m)은 파인 강바닥·바다에만 드러나게 한다.
    let h = 1;
    for (const f of this.features) {
      if (f.t === 'hill') {
        const d = Math.hypot((x - f.x) / f.rx, (z - f.z) / f.rz);
        if (d < 1) h += f.h * (0.5 + 0.5 * Math.cos(Math.PI * d));
      }
    }
    // 잔잔한 기복
    h += Math.sin(x * 0.05) * Math.cos(z * 0.043) * 0.6 + Math.sin(x * 0.11 + z * 0.07) * 0.25;
    if (this.sand) h += Math.sin(x * 0.03 + 1.3) * Math.sin(z * 0.05) * 1.2;
    for (const f of this.features) {
      if (f.t === 'river') {
        const d = distToPolyline(x, z, f.pts);
        const half = f.w / 2;
        if (d < half + 6) {
          const k = d < half ? 1 : 1 - (d - half) / 6;
          h = h * (1 - k) + (-2.2) * k;
        }
      } else if (f.t === 'sea' && z > f.z0 - 8) {
        const k = clamp((z - (f.z0 - 8)) / 10, 0, 1);
        h = h * (1 - k) + -3 * k;
      }
    }
    return h;
  }

  build() {
    const { cols, rows } = this;
    const base = this.sand ? T.SAND : T.GRASS;
    this.type.fill(base);
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
      const x = -this.W / 2 + i * CELL, z = -this.H / 2 + j * CELL;
      this.heightGrid[j * (cols + 1) + i] = this.rawHeight(x, z);
    }
    const order = ['mud', 'forest', 'road', 'river', 'sea', 'cliff', 'camp', 'village'];
    for (const kind of order) for (const f of this.features) if (f.t === kind) this.raster(f);
    // 다리와 여울은 강 위에 덮어쓴다.
    for (const f of this.features) if (f.t === 'river') {
      for (const b of f.bridges ?? []) { this.fillRect(b, T.BRIDGE); this.decor.bridges.push(b); }
      for (const fd of f.fords ?? []) { this.fillRect(fd, T.FORD); this.decor.fords.push(fd); }
    }
    this.buildDecor();
  }

  forCells(fn) {
    for (let j = 0; j < this.rows; j++) for (let i = 0; i < this.cols; i++) fn(i, j, -this.W / 2 + (i + 0.5) * CELL, -this.H / 2 + (j + 0.5) * CELL);
  }
  set(i, j, t) { this.type[j * this.cols + i] = t; }

  fillRect(r, t) {
    this.forCells((i, j, x, z) => { if (inRect(x, z, { ...r, w: r.w + 1 })) this.set(i, j, t); });
  }

  raster(f) {
    switch (f.t) {
      case 'mud': this.forCells((i, j, x, z) => { if (Math.hypot((x - f.x) / f.rx, (z - f.z) / f.rz) < 1 - this.noise(x, z) * 0.15) this.set(i, j, T.MUD); }); break;
      case 'forest': this.forCells((i, j, x, z) => { if (Math.hypot(x - f.x, z - f.z) < f.r * (1 - this.noise(x, z) * 0.2)) this.set(i, j, T.FOREST); }); break;
      case 'road': this.decor.roads.push(f); this.forCells((i, j, x, z) => { if (distToPolyline(x, z, f.pts) < f.w / 2 && this.typeAt(x, z) !== T.FOREST) this.set(i, j, T.ROAD); }); break;
      case 'river': this.decor.rivers.push(f); this.forCells((i, j, x, z) => { if (distToPolyline(x, z, f.pts) < f.w / 2) this.set(i, j, T.WATER); }); break;
      case 'sea': this.forCells((i, j, x, z) => { if (z > f.z0) this.set(i, j, T.SEA); }); this.seaZ = f.z0; break;
      case 'cliff': this.decor.cliffs.push(f); this.forCells((i, j, x, z) => { if (distToPolyline(x, z, f.pts) < 2.6) this.set(i, j, T.CLIFF); }); break;
      case 'camp': {
        const gates = f.gates ?? [];
        this.forCells((i, j, x, z) => {
          const d = Math.hypot(x - f.x, z - f.z);
          if (Math.abs(d - f.r) < 1.3) {
            const a = Math.atan2(z - f.z, x - f.x);
            if (!gates.some((g) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < 0.32)) this.set(i, j, T.WALL);
          }
        });
        const n = Math.round((Math.PI * 2 * f.r) / 1.6);
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2;
          if (gates.some((g) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < 0.32)) continue;
          this.decor.walls.push({ x: f.x + Math.cos(a) * f.r, z: f.z + Math.sin(a) * f.r, a });
        }
        const tents = Math.max(3, Math.round(f.r / 4));
        for (let k = 0; k < tents; k++) {
          const a = this.rand() * Math.PI * 2, d = f.r * (0.35 + this.rand() * 0.45);
          this.decor.tents.push({ x: f.x + Math.cos(a) * d, z: f.z + Math.sin(a) * d, s: 2 + this.rand() * 1.2 });
        }
        break;
      }
      case 'village': {
        const n = Math.round(f.r / 3.2);
        for (let k = 0; k < n; k++) {
          const a = this.rand() * Math.PI * 2, d = f.r * Math.sqrt(this.rand()) * 0.9;
          const h = { x: f.x + Math.cos(a) * d, z: f.z + Math.sin(a) * d, w: 5 + this.rand() * 3, l: 6 + this.rand() * 4, rot: this.rand() * Math.PI };
          this.decor.houses.push(h);
          this.forCells((i, j, x, z) => { if (inRect(x, z, { x: h.x, z: h.z, len: h.l, w: h.w, rot: h.rot })) this.set(i, j, T.HOUSE); });
        }
        break;
      }
      default: break;
    }
  }

  noise(x, z) { return (Math.sin(x * 0.21 + z * 0.13) + Math.sin(x * 0.07 - z * 0.19)) * 0.25 + 0.5; }

  buildDecor() {
    for (const f of this.features) {
      if (f.t !== 'forest') continue;
      const n = Math.round(f.r * f.r * 0.09);
      for (let k = 0; k < n; k++) {
        const a = this.rand() * Math.PI * 2, d = f.r * Math.sqrt(this.rand());
        const x = f.x + Math.cos(a) * d, z = f.z + Math.sin(a) * d;
        if (this.typeAt(x, z) === T.FOREST) this.decor.trees.push({ x, z, s: 0.8 + this.rand() * 0.7, kind: this.rand() < 0.65 ? 0 : 1 });
      }
    }
    // 들판의 바위와 덤불(장식)
    for (let k = 0; k < 40; k++) {
      const x = (this.rand() - 0.5) * this.W * 0.95, z = (this.rand() - 0.5) * this.H * 0.95;
      const t = this.typeAt(x, z);
      if (t === T.GRASS || t === T.SAND) this.decor.rocks.push({ x, z, s: 0.6 + this.rand() * 1.6 });
    }
  }

  cellIndex(x, z) {
    const i = Math.floor((x + this.W / 2) / CELL), j = Math.floor((z + this.H / 2) / CELL);
    if (i < 0 || j < 0 || i >= this.cols || j >= this.rows) return -1;
    return j * this.cols + i;
  }
  typeAt(x, z) { const c = this.cellIndex(x, z); return c < 0 ? T.CLIFF : this.type[c]; }
  blocked(x, z) { const c = this.cellIndex(x, z); return c < 0 || BLOCK[this.type[c]] === 1; }
  speedAt(x, z) { const c = this.cellIndex(x, z); return c < 0 ? 0 : SPEED[this.type[c]]; }
  slowFor(x, z) { const t = this.typeAt(x, z); return t === T.FOREST || t === T.MUD || t === T.FORD; }

  heightAt(x, z) {
    const fx = (x + this.W / 2) / CELL, fz = (z + this.H / 2) / CELL;
    const i = clamp(Math.floor(fx), 0, this.cols - 1), j = clamp(Math.floor(fz), 0, this.rows - 1);
    const tx = clamp(fx - i, 0, 1), tz = clamp(fz - j, 0, 1);
    const c = this.cols + 1, g = this.heightGrid;
    const a = g[j * c + i], b = g[j * c + i + 1], d = g[(j + 1) * c + i], e = g[(j + 1) * c + i + 1];
    let h = (a * (1 - tx) + b * tx) * (1 - tz) + (d * (1 - tx) + e * tx) * tz;
    const t = this.typeAt(x, z);
    if (t === T.BRIDGE) h = Math.max(h, 0.7);
    return h;
  }

  clampInside(p) { p.x = clamp(p.x, -this.W / 2 + 2, this.W / 2 - 2); p.z = clamp(p.z, -this.H / 2 + 2, this.H / 2 - 2); return p; }

  /** 막힌 지점이면 가장 가까운 통행 가능 지점을 찾는다. */
  nearestOpen(x, z) {
    if (!this.blocked(x, z)) return { x, z };
    for (let r = 2; r < 40; r += 2) for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (!this.blocked(px, pz)) return { x: px, z: pz };
    }
    return { x, z };
  }

  lineClear(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / (CELL * 0.7));
    for (let k = 1; k <= n; k++) { const t = k / n; if (this.blocked(ax + (bx - ax) * t, az + (bz - az) * t)) return false; }
    return true;
  }

  /** A* (8방향, 모서리 끼어들기 금지) 후 시야 기반 경로 단순화. */
  findPath(sx, sz, tx, tz) {
    const goal = this.nearestOpen(tx, tz);
    if (this.lineClear(sx, sz, goal.x, goal.z)) return [goal];
    const { cols, rows } = this;
    const start = this.cellIndex(sx, sz), end = this.cellIndex(goal.x, goal.z);
    if (start < 0 || end < 0) return [goal];
    const N = cols * rows;
    const g = (this._g ??= new Float32Array(N)); g.fill(Infinity);
    const from = (this._from ??= new Int32Array(N)); from.fill(-1);
    const closed = (this._closed ??= new Uint8Array(N)); closed.fill(0);
    const heap = [];
    const ex = end % cols, ez = (end / cols) | 0;
    const hfn = (c) => { const dx = Math.abs((c % cols) - ex), dz = Math.abs(((c / cols) | 0) - ez); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
    const push = (c, f) => { heap.push([f, c]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    g[start] = 0; push(start, hfn(start));
    let found = false, iter = 0;
    while (heap.length && iter++ < 24000) {
      const [, c] = pop();
      if (closed[c]) continue;
      closed[c] = 1;
      if (c === end) { found = true; break; }
      const ci = c % cols, cj = (c / cols) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = ci + di, nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= cols || nj >= rows) continue;
        const n = nj * cols + ni;
        if (closed[n] || BLOCK[this.type[n]]) continue;
        if (di && dj && (BLOCK[this.type[cj * cols + ni]] || BLOCK[this.type[nj * cols + ci]])) continue;
        const sp = SPEED[this.type[n]] || 1;
        const cost = g[c] + (di && dj ? 1.414 : 1) / sp;
        if (cost < g[n]) { g[n] = cost; from[n] = c; push(n, cost + hfn(n)); }
      }
    }
    if (!found) { const r = [goal]; r.failed = true; return r; }
    const cells = [];
    for (let c = end; c !== -1 && c !== start; c = from[c]) cells.push(c);
    cells.reverse();
    const pts = cells.map((c) => ({ x: -this.W / 2 + ((c % cols) + 0.5) * CELL, z: -this.H / 2 + (((c / cols) | 0) + 0.5) * CELL }));
    pts[pts.length - 1] = goal;
    // 시야 단순화
    const out = [];
    let ax = sx, az = sz, k = 0;
    while (k < pts.length) {
      let far = k;
      for (let m = pts.length - 1; m > k; m--) if (this.lineClear(ax, az, pts[m].x, pts[m].z)) { far = m; break; }
      out.push(pts[far]); ax = pts[far].x; az = pts[far].z; k = far + 1;
    }
    return out;
  }
}
