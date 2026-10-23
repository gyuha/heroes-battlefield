// 전투 오케스트레이터: 배치 → 매 틱 지휘관/장수/AI/부대 이동·교전/사격/거점/목표 판정.
// 렌더러와 무관한 순수 시뮬레이션이라 Node 에서도 돌릴 수 있다(tests/battle.test.js).
import { TROOPS } from '../data/troops.js';
import { weaponTypeOf } from '../data/weapons.js';
import { BattleMap } from './map.js';
import { Unit } from './unit.js';
import { Hero, General, BASE_HIT } from './hero.js';
import { FrontAI } from './ai.js';
import {
  attackAspect, meleeModifiers, shieldAbsorb, casualties, stepCapture, flagOwner, evaluateObjective,
  objectiveForSide, splitCompanies, frontIndexFor, clamp, seededRandom,
} from '../core/rules.js';

const K_MELEE = 0.1;
const K_MISSILE = 0.022;
const K_HERO_MISSILE = 0.0042;
const FLAG_R = 14;

const killGroup = (cls) => (cls === 'spear' ? 'spear' : cls === 'archer' || cls === 'crossbow' ? 'missile' : cls === 'cav_shock' || cls === 'cav_raid' ? 'cavalry' : cls);

function facingFromCode(code, z) {
  if (code === -1) return Math.PI;
  if (code === 1) return 0;
  return z < 0 ? Math.PI / 2 : -Math.PI / 2;
}

export class Battle {
  /**
   * @param def 전투 데이터(BATTLES 항목)
   * @param opts { swapped, profile:{commander, equip}, settings, seed }
   */
  constructor(def, opts = {}) {
    this.def = def;
    this.mode = def.mode;
    this.swapped = !!opts.swapped && def.mode === 'tactical';
    this.settings = opts.settings ?? {};
    this.profile = opts.profile ?? { commander: '지휘관', equip: { weapon: 'dragonGlaive', mount: 'foot' } };
    this.rand = seededRandom(opts.seed ?? def.id * 101);
    this.time = 0;
    this.events = [];
    this.result = null;
    this.units = [];
    this.missiles = []; // 시각용 화살 + 도착 시 피해
    this.heroShots = [];
    this.wards = [];
    this.objective = objectiveForSide(def.objective, this.swapped);
    this.timeLimit = def.timeLimit ?? 900;
    this.map = new BattleMap(def.map, { sand: def.sand, seed: def.id });
    this.stats = { killsBy: {}, heroKills: 0, enemyLosses: 0, allyLosses: 0, musouUses: 0 };
    this.hold = 0;
    this.locked = new Set();
    this.lockTimers = {};
    this.speed = 1;
    this.setup();
  }

  emit(e) { this.events.push(e); }
  log(text, kind = '') { this.emit({ type: 'log', text, kind, time: this.time }); }

  armyFor(side) {
    const { ally, enemy } = this.def.armies;
    return side === 'A' ? (this.swapped ? enemy : ally) : (this.swapped ? ally : enemy);
  }
  frontsFor(side) {
    const { ally, enemy } = this.def.fronts;
    return side === 'A' ? (this.swapped ? enemy : ally) : (this.swapped ? ally : enemy);
  }

  setup() {
    const heroic = this.mode === 'heroic';
    for (const side of ['A', 'B']) {
      const army = this.armyFor(side);
      const fronts = this.frontsFor(side);
      const maxPer = heroic ? (side === 'A' ? 100000 : 1000) : 600;
      const ratio = heroic ? (side === 'A' ? 4 : 20) : 12;
      // 전선별 배치 목록
      const lists = fronts.map(() => []);
      for (const [name, key, count] of army.units) {
        const comps = splitCompanies(count, maxPer);
        comps.forEach((n, i) => lists[frontIndexFor(i, comps.length, fronts.length)].push({ name, key, n }));
      }
      fronts.forEach(([fid, fname, fx, fz, code], fi) => {
        const facing = facingFromCode(code, fz);
        this.deployFront(side, fid, fname, fx, fz, facing, lists[fi], ratio);
      });
    }
    this.initial = { A: this.sumTroops('A'), B: this.sumTroops('B') };
    this.homeDir = {
      A: Math.sign(this.frontsFor('A')[0][2] - this.frontsFor('B')[0][2]) || 1,
      B: Math.sign(this.frontsFor('B')[0][2] - this.frontsFor('A')[0][2]) || -1,
    };
    // 지휘관
    const mf = this.frontsFor('A')[0];
    const facing = facingFromCode(mf[4], mf[3]);
    const back = heroic ? 6 : -10;
    const hp = this.map.nearestOpen(mf[2] + Math.cos(facing) * back, mf[3] + Math.sin(facing) * back);
    const equip = this.profile.equip ?? {};
    this.hero = new Hero({
      name: this.profile.commander, weaponType: weaponTypeOf(equip.weapon), mode: this.mode, trait: heroic ? this.def.hero : {},
      mounted: equip.mount && equip.mount !== 'foot', difficulty: this.settings.difficulty, x: hp.x, z: hp.z, facing,
    });
    // 적 지휘관(장수)
    const ef = this.frontsFor('B')[0];
    const ef0 = facingFromCode(ef[4], ef[3]);
    const gp = this.map.nearestOpen(ef[2] - Math.cos(ef0) * 16, ef[3] - Math.sin(ef0) * 16);
    this.general = new General({ name: this.armyFor('B').commander, side: 'B', mode: this.mode, x: gp.x, z: gp.z, facing: ef0, front: ef[0] });
    // 거점
    const flagOwnerOf = (f) => {
      if (f.owner === 'none') return 'none';
      const allyOwned = f.owner === 'ally';
      return (allyOwned !== this.swapped) ? 'A' : 'B';
    };
    this.flags = (this.def.map.flags ?? []).map((f) => {
      const owner = flagOwnerOf(f);
      return { ...f, owner, origOwner: owner, progress: owner === 'A' ? 100 : owner === 'B' ? -100 : 0, state: 'idle', countA: 0, countB: 0, locked: false };
    });
    this.zones = (this.def.map.zones ?? []).map((z) => ({ ...z }));
    this.wards = (this.objective.type === 'escort' ? this.objective.persons : []).map((p) => ({ ...p, following: false, safe: false, y: 0 }));
    // AI 전선
    this.ais = [];
    const obj = this.objective;
    const flagGame = !!obj.flags?.length;
    const aDefends = flagGame && obj.type === 'holdAny';
    for (const [fid] of this.frontsFor('A')) {
      if (fid === 'main') this.ais.push(new FrontAI(this, 'A', fid, heroic ? 'escort' : 'defend', { leash: 34 }));
      else this.ais.push(new FrontAI(this, 'A', fid, aDefends ? 'defend' : 'attack', { delay: 8, leash: 40 }));
    }
    this.frontsFor('B').forEach(([fid], i) => {
      let posture;
      if (heroic) posture = 'hunt';
      else if (aDefends) posture = 'attack';
      else if (flagGame) posture = i === 0 ? 'defend' : 'attack';
      else posture = 'attack';
      this.ais.push(new FrontAI(this, 'B', fid, posture, { delay: aDefends ? 6 + i * 8 : 18 + i * 10, leash: heroic ? 55 : 42 }));
    });
    // 플레이어 측 본진 외 부대는 부장 지휘, 본진도 처음에는 AI(원본 카드의 AI 표시)
    this.log(`전투 시작 — ${this.objective.text}`, 'big');
  }

  deployFront(side, fid, fname, fx, fz, facing, list, ratio) {
    const rows = { front: [], second: [], missile: [], cav: [] };
    for (const c of list) {
      const t = TROOPS[c.key];
      const cls = t.cls;
      const row = cls === 'spear' || cls === 'shield' ? 'front' : cls === 'archer' || cls === 'crossbow' ? 'missile' : cls === 'cav_shock' || cls === 'cav_raid' ? 'cav' : 'second';
      rows[row].push(c);
    }
    if (!rows.front.length && rows.second.length) rows.front = rows.second.splice(0, Math.ceil(rows.second.length / 2));
    const fwd = { x: Math.cos(facing), z: Math.sin(facing) };
    const right = { x: -Math.sin(facing), z: Math.cos(facing) };
    const depthOf = { front: 0, second: -16, missile: -32, cav: -8 };
    let maxWidth = 0;
    const placeRow = (row, arr) => {
      const made = arr.map((c) => new Unit({ side, front: fid, name: c.name, key: c.key, troop: TROOPS[c.key], troops: c.n, ratio, x: fx, z: fz, facing }));
      const widths = made.map((u) => u.hw * 2 + 5);
      const total = widths.reduce((s, w) => s + w, 0);
      maxWidth = Math.max(maxWidth, total);
      let off = -total / 2;
      made.forEach((u, i) => {
        const lat = row === 'cav' ? (i % 2 === 0 ? 1 : -1) * (maxWidth / 2 + 14 + Math.floor(i / 2) * (widths[i] + 4)) : off + widths[i] / 2;
        off += widths[i];
        const want = this.map.clampInside({ x: fx + right.x * lat + fwd.x * depthOf[row], z: fz + right.z * lat + fwd.z * depthOf[row] });
        want.x = Math.max(-this.map.W / 2 + u.radius, Math.min(this.map.W / 2 - u.radius, want.x));
        want.z = Math.max(-this.map.H / 2 + u.radius, Math.min(this.map.H / 2 - u.radius, want.z));
        const p = this.map.nearestOpen(want.x, want.z);
        u.x = p.x; u.z = p.z;
        u.figures.forEach((f, k) => { const s = u.slotWorld(k); f.x = s.x; f.z = s.z; f.face = facing; });
        u.home = { x: p.x, z: p.z, facing, offset: { x: p.x - fx, z: p.z - fz }, escort: { x: lat * 0.6, z: depthOf[row] * 0.5 - 6 } };
        u.order = { type: 'hold', x: p.x, z: p.z, facing };
        u.frontName = fname;
        u.huntAt = 25 + this.rand() * 90;
        // 영웅 전투의 소수 정예 친위대: 밀집 대형을 깨뜨릴 만큼 강하다(원본 브리핑 설명을 수치화).
        if (this.mode === 'heroic' && side === 'A') { u.power = 2.4; u.tough = 0.4; }
        this.units.push(u);
      });
    };
    placeRow('front', rows.front);
    placeRow('second', rows.second);
    placeRow('missile', rows.missile);
    placeRow('cav', rows.cav);
  }

  sumTroops(side) { return this.units.reduce((s, u) => s + (u.side === side ? u.troops : 0), 0); }
  effective(side) { return this.units.reduce((s, u) => s + (u.side === side ? u.effective : 0), 0); }

  /** 부대 명령. fromAI=true 면 AI 위임 상태를 유지한다. */
  orderUnit(u, order, fromAI = false) {
    if (!fromAI) u.ai = false;
    const prev = u.order;
    const same = prev && prev.type === order.type && prev.target === order.target && prev.hero === order.hero && Math.hypot((prev.x ?? 0) - (order.x ?? 0), (prev.z ?? 0) - (order.z ?? 0)) < (order.loose ? 4 : 2.5);
    if (same) { if (order.facing !== undefined) prev.facing = order.facing; return; }
    u.order = order;
    u.path = null;
    u.repathT = 0;
  }

  crowdAround(x, z, r, side) {
    let n = 0;
    for (const u of this.units) {
      if (u.side !== side || u.dead || Math.abs(u.x - x) > u.radius + r + 2 || Math.abs(u.z - z) > u.radius + r + 2) continue;
      for (const f of u.figures) if (f.alive && Math.abs(f.x - x) < r && Math.abs(f.z - z) < r) n++;
    }
    return n;
  }

  // ───────────────────────── 업데이트 ─────────────────────────
  update(rawDt, input = {}) {
    if (this.result) { this.time += 0; for (const u of this.units) u.updateFigures(rawDt, this.map, this.time); this.tickMissiles(rawDt); return; }
    const dt = Math.min(0.05, rawDt);
    this.time += dt;
    this.hero.update(dt, input, this);
    this.general.update(dt, this);
    for (const ai of this.ais) ai.update(dt);
    this.pathBudget = 3;
    for (const u of this.units) if (!u.dead) this.updateUnitMotion(u, dt);
    this.resolveContacts();
    for (const u of this.units) if (!u.dead) this.updateUnitCombat(u, dt);
    this.separate(dt);
    for (const u of this.units) u.updateFigures(dt, this.map, this.time);
    this.pushFiguresFromHero();
    this.tickMissiles(dt);
    this.tickHeroShots(dt);
    this.updateWards(dt);
    this.updateFlags(dt);
    this.updateMorale(dt);
    this.checkEnd();
  }

  updateUnitMotion(u, dt) {
    u.chargeCd = Math.max(0, u.chargeCd - dt);
    if (u.routing) {
      u.routTime += dt;
      const ex = this.homeDir[u.side] * (this.map.W / 2);
      u.order = { type: 'retreat', x: ex, z: u.z };
      // 지도 밖으로 빠져나가면 전장 이탈
      if (Math.abs(u.x) > this.map.W / 2 - 6) { u.dead = true; u.fled = true; u.figures.forEach((f) => { f.alive = false; f.dieT = -99; }); this.emit({ type: 'unitGone', unit: u }); return; }
    }
    const o = u.order;
    let tx = o.x, tz = o.z;
    let chase = null;
    if (o.target && !o.target.dead) { chase = o.target; tx = chase.x; tz = chase.z; }
    else if (o.hero && !this.hero.dead) { tx = this.hero.x; tz = this.hero.z; }
    else if (o.target && o.target.dead) { u.order = { type: 'hold', x: u.x, z: u.z, facing: u.facing }; tx = u.x; tz = u.z; }
    const fighting = (u.engaged || u.engagedHero) && o.type !== 'retreat';
    const shooting = u.ranged && u.target && (o.type === 'hold' || o.type === 'attack');
    let moving = false;
    const dist = Math.hypot(tx - u.x, tz - u.z);
    const arrive = chase ? 0 : o.hero ? 2 : 3;
    if (!fighting && !shooting && dist > arrive) {
      // 경로 재계산(목표가 움직이면 주기적으로)
      u.repathT = (u.repathT ?? 0) - dt;
      const goalMoved = !u.pathGoal || Math.hypot(u.pathGoal.x - tx, u.pathGoal.z - tz) > 5;
      if ((!u.path || (u.repathT <= 0 && goalMoved)) && this.pathBudget > 0) {
        this.pathBudget--;
        u.path = this.map.findPath(u.x, u.z, tx, tz);
        u.pathGoal = { x: tx, z: tz };
        // 닿을 수 없는 목표는 한동안 다시 찾지 않는다.
        u.repathT = u.path.failed ? 5 : (chase || o.hero ? 1.2 : 6) + this.rand() * 0.6;
      }
      if (!u.path) u.path = [{ x: tx, z: tz }];
      let wp = u.path[0];
      while (wp && Math.hypot(wp.x - u.x, wp.z - u.z) < 2.5 && u.path.length > 1) { u.path.shift(); wp = u.path[0]; }
      if (!wp) wp = { x: tx, z: tz };
      if ((chase || o.hero) && u.path.length <= 1) wp = { x: tx, z: tz };
      const dx = wp.x - u.x, dz = wp.z - u.z, d = Math.hypot(dx, dz) || 1;
      let sp = u.moveSpeed(this.map);
      if (o.type === 'charge' && !u.cav) sp *= 1.25;
      if (o.type === 'move' && o.loose) sp *= clamp(dist / 8, 0.4, 1.2);
      const ahead = this.map.heightAt(u.x + (dx / d) * 4, u.z + (dz / d) * 4) - this.map.heightAt(u.x, u.z);
      sp *= clamp(1 - ahead * 0.18, 0.6, 1.25);
      const want = Math.atan2(dz, dx);
      const turn = u.cav ? 2.4 : u.cls === 'spear' ? 1.1 : 1.7;
      const diff = Math.atan2(Math.sin(want - u.facing), Math.cos(want - u.facing));
      u.facing += clamp(diff, -turn * dt, turn * dt);
      if (Math.abs(diff) > 1.4 && !u.cav) sp *= 0.4;
      const step = Math.min(sp * dt, d);
      const nx = u.x + (dx / d) * step, nz = u.z + (dz / d) * step;
      if (!this.map.blocked(nx, nz)) { u.x = nx; u.z = nz; moving = true; }
      else if (!this.map.blocked(nx, u.z)) { u.x = nx; moving = true; }
      else if (!this.map.blocked(u.x, nz)) { u.z = nz; moving = true; }
      else if (!u.path.failed && u.repathT > 1) { u.repathT = 1; u.pathGoal = null; }
      u.speed = moving ? sp : 0;
    } else {
      u.speed = 0;
      if (!fighting) {
        let face = o.facing;
        if (shooting) face = Math.atan2(u.target.z - u.z, u.target.x - u.x);
        else if (face === undefined) {
          const th = this.threatNear(u, 30);
          if (th) face = Math.atan2(th.z - u.z, th.x - u.x);
        }
        if (face !== undefined) {
          const diff = Math.atan2(Math.sin(face - u.facing), Math.cos(face - u.facing));
          const turn = u.cls === 'spear' ? 1.2 : 2;
          u.facing += clamp(diff, -turn * dt, turn * dt);
          if (Math.abs(diff) > 0.15) u.stillTime = 0;
        }
      }
    }
    if (moving) { u.stillTime = 0; u.runTime += dt; } else { u.stillTime += dt; u.runTime = 0; }
    // 기병 돌격 상태: 도움닫기 1초 이상, 숲·진흙이 아님
    u.charging = u.cav && moving && u.runTime > 1 && u.chargeCd <= 0 && !this.map.slowFor(u.x, u.z) && (o.type === 'charge' || o.type === 'attack');
  }

  threatNear(u, r) {
    let best = null, bd = r;
    for (const e of this.units) { if (e.side === u.side || e.dead || e.routing) continue; const d = Math.hypot(e.x - u.x, e.z - u.z) - e.radius; if (d < bd) { bd = d; best = e; } }
    if (u.side === 'B' && !this.hero.dead && Math.hypot(this.hero.x - u.x, this.hero.z - u.z) < Math.min(bd, r)) return this.hero;
    return best;
  }

  /** 근접 접촉 판정: 가장 가까운 적 부대와 교전, 지휘관이 가까우면 지휘관과 교전. */
  resolveContacts() {
    for (const u of this.units) { u.engaged = null; u.engagedHero = false; }
    for (const u of this.units) {
      if (u.dead || u.routing) continue;
      let best = null, bg = Infinity;
      for (const e of this.units) {
        if (e.side === u.side || e.dead) continue;
        if (Math.abs(e.x - u.x) > u.radius + e.radius + 12 || Math.abs(e.z - u.z) > u.radius + e.radius + 12) continue;
        const gap = u.gapTo(e);
        if (gap < bg) { bg = gap; best = e; }
      }
      const reach = u.ranged ? 1.6 : u.reach;
      if (best && bg < reach) u.engaged = best;
      if (u.side === 'B' && !this.hero.dead) {
        const dx = this.hero.x - u.x, dz = this.hero.z - u.z;
        const gapH = Math.hypot(dx, dz) - u.extentToward(dx, dz);
        if (gapH < reach + 0.8 && (!u.engaged || gapH < bg)) { u.engagedHero = true; if (!u.engaged || gapH < bg - 2) u.engaged = null; }
      }
    }
  }

  updateUnitCombat(u, dt) {
    if (u.routing) return;
    if (u.engaged) u.meleeTime += dt; else u.meleeTime = 0;
    // 근접전
    u.attackTimer -= dt;
    if (u.engaged && u.attackTimer <= 0) {
      u.attackTimer = u.cav ? 1.5 : u.cls === 'shock' ? 1.7 : 1.5;
      this.meleeHit(u, u.engaged);
    } else if (u.engagedHero && u.attackTimer <= 0) {
      u.attackTimer = 1.45;
      this.meleeHero(u);
    }
    // 원거리
    if (u.ranged) {
      u.reloadTimer -= dt * (u.haste ?? 1);
      if (!u.engaged && !u.engagedHero) {
        const tgt = this.pickRangedTarget(u);
        u.target = tgt;
        if (tgt && u.reloadTimer <= 0 && u.speed < 0.3) { u.reloadTimer = u.t.reload; this.fireVolley(u, tgt); }
      } else u.target = null;
    }
  }

  rangeOf(u) {
    const h = this.map.heightAt(u.x, u.z);
    return u.range * (h > 4 ? 1.15 + Math.min(0.15, (h - 4) * 0.02) : 1);
  }

  pickRangedTarget(u) {
    const r = this.rangeOf(u);
    if (u.order.target && !u.order.target.dead && Math.hypot(u.order.target.x - u.x, u.order.target.z - u.z) < r) return u.order.target;
    let best = null, bd = r;
    for (const e of this.units) {
      if (e.side === u.side || e.dead) continue;
      const d = Math.hypot(e.x - u.x, e.z - u.z) - e.radius * 0.5;
      // 아군과 근접전 중인 적은 오사를 피해 우선순위를 낮춘다.
      const pen = e.engaged ? 20 : 0;
      if (d + pen < bd) { bd = d + pen; best = e; }
    }
    if (u.side === 'B' && !this.hero.dead) {
      const dh = Math.hypot(this.hero.x - u.x, this.hero.z - u.z);
      if (dh < r && (this.mode === 'heroic' || dh < bd)) return this.hero;
    }
    return best;
  }

  frontage(u) {
    const alive = u.alive;
    const cols = Math.max(1, Math.round((u.hw * 2) / u.spacing));
    const ranks = u.cls === 'spear' ? (u.key === 'dragontooth' ? 4 : 3) : 2;
    return Math.min(alive, cols * ranks) * u.ratio;
  }

  meleeHit(u, e) {
    const toAttacker = Math.atan2(u.z - e.z, u.x - e.x);
    const aspect = attackAspect(e.facing, toAttacker);
    const braceLevel = (u.t.brace ?? 1) * (this.mode === 'heroic' && u.side === 'A' ? this.def.hero?.antiCav ?? 1 : 1);
    const m = meleeModifiers({ attackerCls: u.cls, defenderCls: e.cls, aspect, defenderBraced: e.braced, attackerCharging: u.charging, braceLevel, formation: e.formation });
    let attackers = this.frontage(u) * (1 + 0.3 * ((u.t.multi ?? 1) - 1));
    if (u.charging) attackers = Math.min(u.troops, attackers * 1.5);
    const allyDmg = u.side === 'A' && this.mode === 'heroic' ? this.def.hero?.allyDmg ?? 1 : 1;
    // 고지: 위에서 내려치면 강하고, 올려 치면 약하다.
    const dh = this.map.heightAt(u.x, u.z) - this.map.heightAt(e.x, e.z);
    const slope = dh > 1.5 ? 1.2 : dh < -1.5 ? 0.8 : 1;
    let dmg = attackers * u.t.dmg * K_MELEE * m.mult * slope * allyDmg * (u.power ?? 1) * (e.tough ?? 1) * (e.routing ? 1.5 : 1);
    // 방패벽
    const ab = shieldAbsorb(e.cls, aspect, e.shield / (e.shieldMax || 1));
    if (ab > 0) { const s = Math.min(e.shield, dmg * ab); e.shield -= s; dmg -= s; e.lastShieldHit = this.time; }
    const ap = u.t.armorPierce ?? 1;
    const lost = e.takeLosses(casualties(dmg, e.t.dr, e.t.hp, m.drMult, ap), u.x, u.z, this.time);
    this.credit(u, lost);
    if (aspect !== 'front') e.morale -= aspect === 'rear' ? 5 : 2.5;
    // 반격 친위대
    if (e.t.counter && aspect === 'front' && !e.routing) {
      const lost2 = u.takeLosses(casualties(this.frontage(e) * e.t.dmg * K_MELEE * 0.35, u.t.dr, u.t.hp), e.x, e.z, this.time);
      this.credit(e, lost2);
    }
    // 기병 돌격 충돌
    if (u.charging) {
      if (m.stopCharge) {
        const lost3 = u.takeLosses(casualties(this.frontage(e) * e.t.dmg * K_MELEE * 2.2 * (e.t.brace ?? 1), u.t.dr, u.t.hp), e.x, e.z, this.time);
        this.credit(e, lost3);
        u.morale -= 12;
        this.emit({ type: 'braceStop', x: (u.x + e.x) / 2, z: (u.z + e.z) / 2, side: u.side });
      } else {
        this.launchFigures(e, u, e.t.steady ? 2 : 6 + Math.round(u.troops / u.ratio / 6));
        e.morale -= e.t.steady ? 4 : 12;
        this.emit({ type: 'charge', x: (u.x + e.x) / 2, z: (u.z + e.z) / 2, side: u.side, near: Math.hypot(this.hero.x - e.x, this.hero.z - e.z) < 30 });
      }
      u.charging = false;
      u.chargeCd = 10;
      u.runTime = 0;
    }
    this.animateAttack(u, e);
  }

  meleeHero(u) {
    const h = this.hero;
    let n = 0;
    for (const f of u.figures) if (f.alive && Math.hypot(f.x - h.x, f.z - h.z) < u.reach + 1.6) { n++; f.atk = 1; f.face = Math.atan2(h.z - f.z, h.x - f.x); if (n >= 6) break; }
    if (!n) return;
    let dmg = n * u.t.dmg * 1.0 * (u.charging ? 2.2 : 1);
    if (h.buffs.brace > 0) {
      // 창 세우기: 정면으로 달려든 적에게 반격
      const lost = u.takeLosses(casualties(BASE_HIT * h.dmgMul * 0.6, u.t.dr, u.t.hp), h.x, h.z, this.time);
      this.creditHero(lost, u);
      if (u.cav) dmg *= 0.3;
    }
    if (u.charging) { u.charging = false; u.chargeCd = 10; this.emit({ type: 'charge', x: h.x, z: h.z, side: u.side, near: true, hero: true }); }
    const got = h.damage(dmg, u.x, u.z, this.time);
    if (got > 0) this.emit({ type: 'heroHurt', amount: got, x: h.x, z: h.z });
  }

  strikeHero(amount, fx, fz) {
    const got = this.hero.damage(amount, fx, fz, this.time);
    if (got > 0) this.emit({ type: 'heroHurt', amount: got, x: this.hero.x, z: this.hero.z });
  }

  animateAttack(u, e) {
    let k = 0;
    for (const f of u.figures) {
      if (!f.alive) continue;
      if (this.rand() < 0.35) { f.atk = 1; if (++k > 10) break; }
    }
    let j = 0;
    for (const f of e.figures) { if (f.alive && this.rand() < 0.2) { f.hit = 1; if (++j > 6) break; } }
    if (this.rand() < 0.5) {
      const mx = (u.x + e.x) / 2 + (this.rand() - 0.5) * 6, mz = (u.z + e.z) / 2 + (this.rand() - 0.5) * 6;
      this.emit({ type: 'clash', x: mx, z: mz });
    }
  }

  launchFigures(target, by, count) {
    const dir = Math.atan2(target.z - by.z, target.x - by.x);
    let n = 0;
    for (const f of target.figures) {
      if (!f.alive || n >= count) continue;
      if (Math.hypot(f.x - by.x, f.z - by.z) > by.radius + 6) continue;
      const a = dir + (this.rand() - 0.5) * 1.2;
      f.vy = 7 + this.rand() * 5; f.y = 0.01; f.launch = 1;
      f.ox = Math.cos(a) * 6; f.oz = Math.sin(a) * 6;
      n++;
    }
  }

  credit(u, lost) {
    if (!(lost > 0)) return;
    u.kills += lost;
    if (u.side === 'A') {
      const g = killGroup(u.cls);
      this.stats.killsBy[g] = (this.stats.killsBy[g] ?? 0) + lost;
      this.stats.enemyLosses += lost;
    } else this.stats.allyLosses += lost;
  }

  creditHero(lost, unit) {
    if (!(lost > 0)) return;
    this.hero.kills += lost;
    this.stats.heroKills += lost;
    this.stats.enemyLosses += lost;
    if (unit) unit.morale -= lost * 0.15;
  }

  fireVolley(u, tgt) {
    const isHero = tgt === this.hero;
    const tx = tgt.x, tz = tgt.z;
    const d = Math.hypot(tx - u.x, tz - u.z);
    const flight = 0.5 + d / 48;
    const shooters = u.troops;
    const arrows = Math.min(14, Math.max(3, Math.round(u.alive / 3)));
    for (let k = 0; k < arrows; k++) {
      const f = u.figures[Math.floor(this.rand() * u.figures.length)];
      if (!f?.alive) continue;
      f.atk = 1;
      const ex = tx + (this.rand() - 0.5) * (isHero ? 4 : tgt.hw * 1.6), ez = tz + (this.rand() - 0.5) * (isHero ? 4 : tgt.hd * 1.6);
      this.missiles.push({ sx: f.x, sz: f.z, sy: this.map.heightAt(f.x, f.z) + 1.4, ex, ez, ey: this.map.heightAt(ex, ez) + 0.3, t: 0, dur: flight * (0.9 + this.rand() * 0.2), bolt: u.cls === 'crossbow', arc: u.cls === 'crossbow' ? 0.12 : 0.3 });
    }
    this.missiles.push({ dmgOnly: true, t: 0, dur: flight, apply: () => {
      if (isHero) {
        if (Math.hypot(this.hero.x - tx, this.hero.z - tz) < 3.6) {
          const got = this.hero.damage(Math.min(shooters, 600) * u.t.dmg * K_HERO_MISSILE, u.x, u.z, this.time);
          if (got > 0) this.emit({ type: 'heroHurt', amount: got, x: this.hero.x, z: this.hero.z, missile: true });
        }
        return;
      }
      if (tgt.dead) return;
      const aspect = attackAspect(tgt.facing, Math.atan2(u.z - tgt.z, u.x - tgt.x));
      let dmg = shooters * u.t.dmg * K_MISSILE * (1 + 0.25 * ((u.t.pierce ?? 1) - 1)) * (u.power ?? 1) * (tgt.tough ?? 1);
      if (aspect !== 'front') dmg *= aspect === 'rear' ? 1.6 : 1.3;
      if (tgt.cls === 'shield' && aspect === 'front' && tgt.shield > 0) {
        const absorb = dmg * 0.8;
        const sd = absorb * (u.t.shieldDmg ?? 1);
        const used = Math.min(tgt.shield, sd);
        tgt.shield -= used; tgt.lastShieldHit = this.time;
        dmg -= absorb * (used / sd);
      }
      const lost = tgt.takeLosses(casualties(dmg, tgt.t.dr, tgt.t.hp, aspect === 'rear' ? 0.6 : 1, u.t.armorPierce ?? 1), tx, tz, this.time);
      this.credit(u, lost);
      tgt.morale -= 1.5;
    } });
  }

  tickMissiles(dt) {
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      m.t += dt;
      if (m.t >= m.dur) {
        if (m.apply && !this.result) m.apply();
        else if (!m.dmgOnly) this.emit({ type: 'arrowLand', x: m.ex, z: m.ez });
        this.missiles.splice(i, 1);
      }
    }
  }

  // ───────────────────────── 지휘관 공격 판정 ─────────────────────────
  /** 지휘관 근접 판정: 부채꼴(arc, rad) 안의 적 인형에 피해. */
  heroStrike({ power = 1, range = 4, arc = 2, knock = 1, launch = false, tag = 'A', crit = false, shieldBreak = false, dedupe = null, x, z, dir }) {
    const h = this.hero;
    const ox = x ?? h.x, oz = z ?? h.z, face = dir ?? h.aim;
    const base = BASE_HIT * h.dmgMul * power;
    let hits = 0, total = 0, killed = 0;
    if (dedupe) { if (h.dedupeKey !== dedupe) { h.dedupeKey = dedupe; h.dedupeSet = new Set(); } }
    let uniq = 0;
    for (const u of this.units) {
      if (u.side !== 'B' || u.dead) continue;
      if (Math.hypot(u.x - ox, u.z - oz) > u.radius + range + 1) continue;
      let uHits = 0, nearX = 0, nearZ = 0;
      for (const f of u.figures) {
        if (!f.alive) continue;
        const dx = f.x - ox, dz = f.z - oz, d = Math.hypot(dx, dz);
        if (d > range + 0.6) continue;
        if (arc < Math.PI * 2 - 0.01) {
          const a = Math.atan2(dz, dx);
          if (Math.abs(Math.atan2(Math.sin(a - face), Math.cos(a - face))) > arc / 2 && d > 1.2) continue;
        }
        uHits++; nearX += f.x; nearZ += f.z;
        f.hit = 1;
        const kdir = Math.atan2(dz, dx);
        if (launch && this.rand() < 0.5 && !(u.t.steady && u.braced)) { f.vy = 6 + this.rand() * 6; f.y = 0.01; f.launch = 1; f.ox = Math.cos(kdir) * knock * 1.4; f.oz = Math.sin(kdir) * knock * 1.4; }
        else if (knock > 0) { f.ox += Math.cos(kdir) * knock * 2; f.oz += Math.sin(kdir) * knock * 2; }
        if (dedupe) { const key = u.id * 1000 + u.figures.indexOf(f); if (!h.dedupeSet.has(key)) { h.dedupeSet.add(key); uniq++; } } else uniq++;
      }
      if (!uHits) continue;
      hits += uHits;
      // 방패 정면: 방패 내구가 일부 흡수(파쇄 일격은 무시)
      const aspect = attackAspect(u.facing, Math.atan2(oz - u.z, ox - u.x));
      let dmg = base * uHits;
      if (u.cls === 'shield' && aspect === 'front' && u.shield > 0 && !shieldBreak) { const s = Math.min(u.shield, dmg * 0.5); u.shield -= s; dmg -= s; }
      if (shieldBreak) u.shield = Math.max(0, u.shield - u.shieldMax * 0.3);
      const lost = u.takeLosses(casualties(dmg, u.t.dr, u.t.hp, aspect === 'rear' ? 0.5 : 1), nearX / uHits, nearZ / uHits, this.time);
      this.creditHero(lost, u);
      killed += lost;
      total += dmg;
      if (this.mode === 'heroic') u.morale -= uHits * 0.5 * (this.def.hero?.fear ?? 1);
    }
    // 장수
    const g = this.general;
    if (!g.dead && Math.hypot(g.x - ox, g.z - oz) < range + 1.2) {
      const a = Math.atan2(g.z - oz, g.x - ox);
      if (arc >= Math.PI * 2 - 0.01 || Math.abs(Math.atan2(Math.sin(a - face), Math.cos(a - face))) < arc / 2 + 0.3) {
        const dealt = g.damage(base * 1.2, this.time);
        total += dealt; hits++; uniq += 2;
        if (g.dead) this.generalDown();
      }
    }
    h.gainMusou(uniq);
    if (hits) this.emit({ type: 'dmg', amount: Math.round(total), crit: crit || (tag !== 'A' && this.rand() < 0.15), x: ox + Math.cos(face) * range * 0.6, z: oz + Math.sin(face) * range * 0.6, kills: killed, tag });
    this.emit({ type: 'slash', x: ox, z: oz, dir: face, range, arc, tag, hits });
    return hits;
  }

  heroBlast({ x, z, r, power, fx, tag, crit }) {
    const saveAim = this.hero.aim;
    const n = this.heroStrike({ power, range: r, arc: Math.PI * 2, knock: 3, launch: true, tag, crit, x, z, dedupe: null });
    this.hero.aim = saveAim;
    this.emit({ type: 'blast', x, z, r, fx, hits: n });
  }

  heroProjectile({ power, range, pierce = 1, speed = 60, magic = false, aoe = 0, tag = 'A' }) {
    const h = this.hero;
    this.heroShots.push({ x: h.x + Math.cos(h.aim) * 1, z: h.z + Math.sin(h.aim) * 1, dir: h.aim, speed, left: range, power, pierce, hitIds: new Set(), magic, aoe, tag });
    this.emit({ type: 'shoot', magic });
  }

  tickHeroShots(dt) {
    for (let i = this.heroShots.length - 1; i >= 0; i--) {
      const s = this.heroShots[i];
      const step = s.speed * dt;
      s.x += Math.cos(s.dir) * step; s.z += Math.sin(s.dir) * step; s.left -= step;
      let done = s.left <= 0 || this.map.typeAt(s.x, s.z) === 8 || this.map.typeAt(s.x, s.z) === 9;
      if (!done) {
        // 가장 가까운 적 인형과 충돌
        for (const u of this.units) {
          if (u.side !== 'B' || u.dead || s.hitIds.has(u.id)) continue;
          if (Math.hypot(u.x - s.x, u.z - s.z) > u.radius + 2) continue;
          if (!u.figures.some((f) => f.alive && Math.hypot(f.x - s.x, f.z - s.z) < 1.3)) continue;
          s.hitIds.add(u.id);
          if (s.aoe > 0) { this.heroBlast({ x: s.x, z: s.z, r: s.aoe, power: s.power, fx: 'fire', tag: s.tag }); done = true; break; }
          this.heroStrike({ power: s.power, range: 2.2, arc: Math.PI * 2, knock: 1.5, tag: s.tag, x: s.x, z: s.z, dir: s.dir });
          s.pierce--;
          if (s.pierce < 0) { done = true; break; }
        }
        const g = this.general;
        if (!done && !g.dead && Math.hypot(g.x - s.x, g.z - s.z) < 1.5) { g.damage(BASE_HIT * this.hero.dmgMul * s.power, this.time); if (g.dead) this.generalDown(); done = true; }
      }
      if (done) this.heroShots.splice(i, 1);
    }
  }

  healAllies(x, z, r, pct) {
    for (const u of this.units) if (u.side === 'A' && !u.dead && Math.hypot(u.x - x, u.z - z) < r + u.radius) u.troops = Math.min(u.maxTroops, u.troops + u.maxTroops * pct);
  }

  generalDown() {
    const g = this.general;
    this.log(`적 지휘관 ${g.name}을(를) 쓰러뜨렸습니다!`, 'big');
    this.emit({ type: 'generalDown', x: g.x, z: g.z, name: g.name });
    for (const u of this.units) if (u.side === 'B') u.morale -= Math.hypot(u.x - g.x, u.z - g.z) < 80 ? 45 : 18;
  }

  /** 지휘관 주변 인형을 밀어내 겹치지 않게 한다. */
  pushFiguresFromHero() {
    const h = this.hero;
    for (const u of this.units) {
      if (u.dead || Math.hypot(u.x - h.x, u.z - h.z) > u.radius + 3) continue;
      for (const f of u.figures) {
        if (!f.alive) continue;
        const dx = f.x - h.x, dz = f.z - h.z, d = Math.hypot(dx, dz);
        const min = u.cav ? 1.8 : 1.1;
        if (d < min && d > 0.001) { f.x = h.x + (dx / d) * min; f.z = h.z + (dz / d) * min; }
      }
    }
  }

  /** 부대끼리 겹치지 않도록 중심을 밀어낸다. */
  separate(dt) {
    const us = this.units;
    for (let i = 0; i < us.length; i++) {
      const a = us[i];
      if (a.dead) continue;
      for (let j = i + 1; j < us.length; j++) {
        const b = us[j];
        if (b.dead) continue;
        const dx = b.x - a.x, dz = b.z - a.z;
        if (Math.abs(dx) > a.radius + b.radius || Math.abs(dz) > a.radius + b.radius) continue;
        const gap = a.gapTo(b);
        const minGap = a.side === b.side ? 1 : 0.4;
        if (gap < minGap) {
          const d = Math.hypot(dx, dz) || 0.01;
          const push = Math.min(3, (minGap - gap)) * dt * (a.side === b.side ? 2.5 : 4);
          const wa = a.cav && !b.cav ? 0.7 : b.cav && !a.cav ? 0.3 : 0.5;
          const ax = a.x - (dx / d) * push * wa, az = a.z - (dz / d) * push * wa;
          const bx = b.x + (dx / d) * push * (1 - wa), bz = b.z + (dz / d) * push * (1 - wa);
          if (!this.map.blocked(ax, az)) { a.x = ax; a.z = az; }
          if (!this.map.blocked(bx, bz)) { b.x = bx; b.z = bz; }
        }
      }
    }
  }

  updateMorale(dt) {
    const heroic = this.mode === 'heroic';
    for (const u of this.units) {
      if (u.dead) continue;
      if (u.shieldMax && this.time - u.lastShieldHit > 4) u.shield = Math.min(u.shieldMax * (u.troops / u.maxTroops), u.shield + u.shieldMax * 0.03 * dt);
      if (heroic && u.side === 'B' && !this.hero.dead && Math.hypot(this.hero.x - u.x, this.hero.z - u.z) < u.radius + 8) u.morale -= dt * 2.5 * (this.def.hero?.fear ?? 1);
      u.moraleRecover(dt, this.time);
      const frac = u.troops / u.maxTroops;
      const routAt = heroic ? (u.side === 'B' ? 0.3 : 0.08) : 0.15;
      if (heroic && u.side === 'A') u.morale = Math.max(u.morale, 20);
      if (!u.routing && (u.morale <= 0 || frac < routAt)) {
        u.routing = true; u.routTime = 0; u.engaged = null; u.selected = false;
        this.log(`${u.side === 'A' ? '아군' : '적군'} ${u.name} 부대가 무너져 패주합니다.`, u.side === 'A' ? 'bad' : '');
        this.emit({ type: 'rout', unit: u });
      } else if (u.routing && u.routTime > 16 && frac > 0.3 && !(heroic && u.side === 'B')) {
        u.morale = Math.max(u.morale, 30);
        if (u.morale >= 30) { u.routing = false; u.order = { type: 'hold', x: u.x, z: u.z, facing: u.facing }; this.log(`${u.side === 'A' ? '아군' : '적군'} ${u.name} 부대가 전열을 수습했습니다.`); }
      }
    }
  }

  updateWards(dt) {
    const h = this.hero;
    for (const w of this.wards) {
      if (w.safe) continue;
      const d = Math.hypot(h.x - w.x, h.z - w.z);
      if (!w.following && d < 6 && !h.dead) { w.following = true; this.log(`${w.name}을(를) 맞이했습니다. 피난 지역까지 호위하세요.`, 'big'); this.emit({ type: 'wardJoin', ward: w }); }
      if (w.following && d > 4 && d < 22) {
        const sp = Math.min(h.speedBase * 1.05, (d - 3) * 3);
        const nx = w.x + ((h.x - w.x) / d) * sp * dt, nz = w.z + ((h.z - w.z) / d) * sp * dt;
        if (!this.map.blocked(nx, nz)) { w.x = nx; w.z = nz; }
      }
      w.moving = w.following && d > 4 && d < 22;
      const zone = this.zones.find((z) => z.id === this.objective.zone) ?? this.zones[0];
      if (zone && Math.hypot(w.x - zone.x, w.z - zone.z) < zone.r) { w.safe = true; this.log(`${w.name}이(가) 피난 지역에 도착했습니다.`, 'big'); this.emit({ type: 'wardSafe', ward: w }); }
    }
  }

  updateFlags(dt) {
    const rate = 12.5 * (this.mode === 'heroic' ? this.def.hero?.capture ?? 1 : 1);
    for (const f of this.flags) {
      let a = 0, b = 0;
      for (const u of this.units) {
        if (u.dead || u.routing || Math.hypot(u.x - f.x, u.z - f.z) > u.radius + FLAG_R) continue;
        for (const fg of u.figures) if (fg.alive && Math.hypot(fg.x - f.x, fg.z - f.z) < FLAG_R) { if (u.side === 'A') a++; else b++; }
      }
      if (!this.hero.dead && Math.hypot(this.hero.x - f.x, this.hero.z - f.z) < FLAG_R) a += this.mode === 'heroic' ? 12 : 6;
      if (!this.general.dead && Math.hypot(this.general.x - f.x, this.general.z - f.z) < FLAG_R) b += 6;
      f.countA = a; f.countB = b;
      if (f.locked) { f.state = 'held'; continue; }
      const prevOwner = f.owner;
      const r = stepCapture(f.progress, a, b, dt, rate);
      f.progress = r.progress;
      f.owner = flagOwner(f.progress, f.owner);
      f.state = r.state === 'contested' ? 'contested' : (a > 0 || b > 0) && Math.abs(f.progress) < 100 ? 'capturing' : 'idle';
      if (f.owner !== prevOwner) {
        const mine = f.owner === 'A';
        this.log(`${f.name}: ${mine ? '아군이 장악했습니다' : '적군에게 빼앗겼습니다'}.`, mine ? 'big' : 'bad');
        this.emit({ type: 'flag', flag: f, owner: f.owner });
      }
    }
    // 목표별 유지 시간
    const o = this.objective;
    if (!o.flags?.length) return;
    const owned = o.flags.map((id) => this.flags.find((f) => f.id === id)).filter(Boolean);
    if (o.type === 'holdAny') { if (owned.some((f) => f.owner === 'A')) this.hold += dt; }
    else if (o.type === 'holdTogether') { this.hold = owned.every((f) => f.owner === 'A') ? this.hold + dt : 0; }
    else if (o.type === 'captureEach' || o.type === 'captureReturn') {
      const need = o.time ?? 10;
      for (const f of owned) {
        if (f.locked) continue;
        this.lockTimers[f.id] = f.owner === 'A' && f.state !== 'contested' ? (this.lockTimers[f.id] ?? 0) + dt : 0;
        if (this.lockTimers[f.id] >= need) {
          f.locked = true; f.lockedBy = 'A'; this.locked.add(f.id);
          this.log(`${f.name} 점령 완료!`, 'big');
          this.emit({ type: 'flagLocked', flag: f });
          if (o.type === 'captureReturn' && o.flags.every((id) => this.locked.has(id))) this.log('모든 목표를 점령했습니다. 지휘관을 귀환시키세요!', 'big');
        }
      }
    }
  }

  objectiveProgress() {
    const o = this.objective;
    const enemyRatio = this.effective('B') / this.initial.B;
    const parts = { type: o.type, enemyRatio, allyRatio: this.effective('A') / this.initial.A };
    if (o.type === 'holdAny') parts.remaining = Math.max(0, o.time - this.hold);
    if (o.type === 'holdTogether') { parts.hold = this.hold; parts.need = o.time; }
    if (o.type === 'captureEach' || o.type === 'captureReturn') { parts.locked = this.locked.size; parts.total = o.flags.length; parts.timers = this.lockTimers; }
    if (o.type === 'escort') { parts.safe = this.wards.filter((w) => w.safe).length; parts.total = this.wards.length; }
    if (o.type === 'commander') { parts.generalDead = this.general.dead; parts.loss = 1 - enemyRatio; parts.need = o.routPct; }
    return parts;
  }

  checkEnd() {
    const zone = this.zones.find((z) => z.id === this.objective.zone);
    const heroInZone = zone ? Math.hypot(this.hero.x - zone.x, this.hero.z - zone.z) < zone.r : false;
    const enemyRatio = this.effective('B') / this.initial.B;
    const res = evaluateObjective({
      objective: this.objective, heroDead: this.hero.dead, time: this.time, timeLimit: this.timeLimit,
      enemyRatio, enemyLossRatio: 1 - enemyRatio, allyRatio: this.mode === 'tactical' ? this.effective('A') / this.initial.A : undefined,
      hold: this.hold, locked: this.locked, heroInZone, escorted: this.wards.filter((w) => w.safe).length, generalDead: this.general.dead,
    });
    if (res) this.finish(res);
  }

  finish(res) {
    this.result = res;
    const reason = res === 'victory' ? '승리했습니다! 역사를 새로 썼습니다.'
      : this.hero.dead ? '지휘관이 쓰러졌습니다. 군대가 지휘를 잃었습니다.'
        : this.mode === 'tactical' && this.effective('A') / this.initial.A <= 0.02 ? '아군이 모두 무너졌습니다.' : '제한 시간 안에 목표를 이루지 못했습니다.';
    this.resultReason = reason;
    this.stats.musouUses = this.hero.musouUses;
    this.emit({ type: 'end', result: res, reason });
  }

  summary() {
    const initA = this.initial.A;
    return {
      victory: this.result === 'victory', recommended: !this.swapped, elapsed: this.time,
      killsBy: this.stats.killsBy, heroKills: Math.round(this.stats.heroKills), musouUses: this.hero.musouUses,
      initialAllies: initA, survivingAllies: Math.round(this.units.reduce((s, u) => s + (u.side === 'A' && !u.fled ? u.troops : 0), 0)),
      enemyLosses: Math.round(this.initial.B - this.units.reduce((s, u) => s + (u.side === 'B' && !u.fled ? u.troops : 0), 0)),
      heroHp: this.hero.hp, maxHeroHp: this.hero.maxHp,
    };
  }

  // ───────────────────────── 플레이어 지휘 ─────────────────────────
  playerUnits() { return this.units.filter((u) => u.side === 'A' && !u.dead); }
  commandUnits() {
    const sel = this.playerUnits().filter((u) => u.selected && !u.routing);
    if (sel.length) return sel;
    return this.playerUnits().filter((u) => u.front === 'main' && !u.routing);
  }

  command(type, p = {}) {
    const us = this.commandUnits();
    if (!us.length && !['select', 'deselect', 'selectFront', 'speed'].includes(type)) return;
    const h = this.hero;
    switch (type) {
      case 'formAhead': {
        const ax = h.x + Math.cos(h.aim) * 18, az = h.z + Math.sin(h.aim) * 18;
        this.lineUp(us, ax, az, h.aim);
        this.log(`명령: ${us.length}개 부대 전방 정렬`);
        break;
      }
      case 'holdCursor': {
        const face = Math.atan2(p.z - h.z, p.x - h.x);
        this.lineUp(us, p.x, p.z, face);
        this.log(`명령: ${us.length}개 부대 지정 위치 고수`);
        break;
      }
      case 'attack': case 'charge': {
        const tgt = this.enemyNear(p.x, p.z, 22);
        for (const u of us) this.orderUnit(u, { type: type === 'charge' ? 'charge' : 'attack', target: tgt, x: p.x, z: p.z });
        this.log(`명령: ${type === 'charge' ? '돌격' : '공격'}${tgt ? ` — ${tgt.name}` : ''}`);
        break;
      }
      case 'move':
        for (const u of us) this.orderUnit(u, { type: 'move', x: p.x + (u.x - us[0].x) * 0.3, z: p.z + (u.z - us[0].z) * 0.3 });
        break;
      case 'holdHere':
        for (const u of us) this.orderUnit(u, { type: 'hold', x: u.x, z: u.z, facing: u.facing });
        this.log('명령: 현 위치 고수');
        break;
      case 'delegate': {
        const allAi = us.every((u) => u.ai);
        for (const u of us) { u.ai = !allAi; if (u.ai) { u.order = { type: 'hold', x: u.x, z: u.z, facing: u.facing }; } }
        this.log(allAi ? '지휘권 회수: 직접 지휘합니다.' : 'AI 지휘로 위임했습니다.');
        break;
      }
      case 'delegateBack':
        for (const u of us) if (u.homeFront !== 'main') { u.ai = true; u.front = u.homeFront; u.selected = false; }
        this.log('선택한 부대를 부장에게 돌려주었습니다.');
        break;
      case 'formation':
        for (const u of us) u.setFormation(p.formation);
        break;
      default: break;
    }
  }

  select(u, add = false) {
    if (!add) for (const x of this.units) x.selected = false;
    if (u && u.side === 'A' && !u.dead) { u.selected = add ? !u.selected : true; if (u.homeFront !== 'main') u.front = 'main'; }
  }
  selectFront() { for (const u of this.units) u.selected = u.side === 'A' && u.front === 'main' && !u.dead; }
  deselect() { for (const u of this.units) u.selected = false; }

  enemyNear(x, z, r) {
    let best = null, bd = r;
    for (const e of this.units) { if (e.side !== 'B' || e.dead) continue; const d = Math.hypot(e.x - x, e.z - z) - e.radius * 0.5; if (d < bd) { bd = d; best = e; } }
    return best;
  }

  /** 전열 배치: 창·방패 앞, 보병 둘째 줄, 사격 뒤, 기병 양 날개. */
  lineUp(us, cx, cz, face) {
    const right = { x: -Math.sin(face), z: Math.cos(face) }, fwd = { x: Math.cos(face), z: Math.sin(face) };
    const rows = [[], [], [], []];
    for (const u of us) rows[u.cls === 'spear' || u.cls === 'shield' ? 0 : u.ranged ? 2 : u.cav ? 3 : 1].push(u);
    if (!rows[0].length) { rows[0] = rows[1]; rows[1] = []; }
    const depth = [0, -14, -28, -6];
    let frontW = 0;
    rows.forEach((row, ri) => {
      const ws = row.map((u) => u.hw * 2 + 4);
      const total = ws.reduce((s, w) => s + w, 0);
      if (ri === 0) frontW = total;
      let off = -total / 2;
      row.forEach((u, i) => {
        const lat = ri === 3 ? (i % 2 ? -1 : 1) * (frontW / 2 + 12 + Math.floor(i / 2) * ws[i]) : off + ws[i] / 2;
        off += ws[i];
        const p = this.map.nearestOpen(cx + right.x * lat + fwd.x * depth[ri], cz + right.z * lat + fwd.z * depth[ri]);
        this.orderUnit(u, { type: 'hold', x: p.x, z: p.z, facing: face });
      });
    });
  }
}
