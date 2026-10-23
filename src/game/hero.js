// 지휘관(플레이어) 전투 모델. 원본 규칙: 전술 전투는 체력 900·기준 피해의 40%, 영웅 전투는 체력 10,000·피해 감소 60%·비전투 시 회복.
import { WEAPON_TYPES } from '../data/weapons.js';
import { clamp } from '../core/rules.js';

export const BASE_HIT = 600;
const COMBO = [{ p: 1, t: 0.34 }, { p: 1, t: 0.32 }, { p: 1.2, t: 0.36 }, { p: 1.6, t: 0.5 }];
const WEAPON_REACH = { swordShield: 3.6, greatsword: 4.4, polearm: 5.2, bow: 3, focus: 3 };

export class Hero {
  constructor({ name, weaponType, mode, trait = {}, mounted = false, difficulty = 'normal', x, z, facing }) {
    this.name = name;
    this.wt = weaponType;
    this.w = WEAPON_TYPES[weaponType];
    this.mode = mode;
    this.trait = trait;
    this.mounted = mounted;
    this.maxHp = mode === 'heroic' ? 10000 : 900;
    this.hp = this.maxHp;
    this.dr = mode === 'heroic' ? 0.6 : 0;
    this.dmgMul = (mode === 'heroic' ? 1 : 0.4) * (trait.dmg ?? 1);
    this.takenMul = { easy: 0.7, normal: 1, hard: 1.35 }[difficulty] * (trait.guard ?? 1);
    this.speedBase = (mounted ? 9.5 : 6.2) * (trait.speed ?? 1);
    this.x = x; this.z = z; this.facing = facing; this.aim = facing;
    this.vx = 0; this.vz = 0;
    this.stamina = 100;
    this.musou = 0;
    this.musouUses = 0;
    this.kills = 0;
    this.combo = 0; this.comboHits = 0; this.comboTimer = 0;
    this.state = 'idle'; this.stateT = 0; this.stateDur = 0;
    this.queued = false;
    this.chargeT = 0;
    this.cd = { Q: 0, E: 0, R: 0, Y: 0 };
    this.buffs = {};
    this.invuln = 0;
    this.lastDamaged = -10;
    this.dead = false;
    this.skillKey = null;
    this.strikes = []; // 예약된 판정 {t, fn}
    this.anim = { swing: 0, swingDir: 1, lunge: 0, spin: 0, roll: 0, guard: 0 };
    this.reach = WEAPON_REACH[weaponType];
    this.shield = 0;
  }

  get ranged() { return this.wt === 'bow' || this.wt === 'focus'; }
  get busy() { return this.state !== 'idle' && this.state !== 'charge'; }
  get musouReady() { return this.musou >= 100; }

  cooldownMul() { return this.trait.cdr ?? 1; }

  gainMusou(uniqueHits) {
    if (this.state === 'musou' || uniqueHits <= 0) return;
    this.musou = Math.min(100, this.musou + Math.min(uniqueHits, 14) * 0.55 * (this.trait.musou ?? 1));
  }

  /** 받는 피해. 회피·무쌍 중에는 무적. guard(방패벽)는 정면 피해를 크게 줄인다. */
  damage(amount, fromX, fromZ, time) {
    if (this.dead || this.invuln > 0 || this.state === 'musou') return 0;
    let a = amount * (1 - this.dr) * this.takenMul;
    if (this.buffs.guard > 0 || this.buffs.brace > 0) {
      const ang = Math.atan2(fromZ - this.z, fromX - this.x);
      const diff = Math.abs(Math.atan2(Math.sin(ang - this.aim), Math.cos(ang - this.aim)));
      if (diff < 1.3) a *= this.buffs.guard > 0 ? 0.25 : 0.5;
    }
    if (this.shield > 0) { const s = Math.min(this.shield, a); this.shield -= s; a -= s; }
    this.hp -= a;
    this.lastDamaged = time;
    if (this.hp <= 0) { this.hp = 0; this.dead = true; this.state = 'dead'; }
    return a;
  }

  update(dt, input, battle) {
    if (this.dead) return;
    const t = battle.time;
    for (const k of Object.keys(this.cd)) this.cd[k] = Math.max(0, this.cd[k] - dt);
    for (const k of Object.keys(this.buffs)) this.buffs[k] = Math.max(0, this.buffs[k] - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.comboTimer -= dt;
    if (this.comboTimer <= 0 && this.state === 'idle') this.combo = 0;
    // 비전투 회복
    const regenDelay = this.mode === 'heroic' ? 4 : 6;
    if (t - this.lastDamaged > regenDelay) this.hp = Math.min(this.maxHp, this.hp + this.maxHp * (this.mode === 'heroic' ? 0.035 : 0.006) * dt);
    // 조준
    if (input.aim) this.aim = Math.atan2(input.aim.z - this.z, input.aim.x - this.x);

    // 예약된 판정 실행
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      if (this.strikes[i].t <= t) { const s = this.strikes.splice(i, 1)[0]; s.fn(); }
    }

    this.stateT += dt;
    let moveMul = 1;
    let mx = input.move?.x ?? 0, mz = input.move?.z ?? 0;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }
    const sprinting = input.sprint && ml > 0.1 && this.stamina > 2 && this.state === 'idle';
    if (sprinting) { moveMul = 1.55; this.stamina = Math.max(0, this.stamina - 14 * dt); }
    else this.stamina = Math.min(100, this.stamina + 18 * dt);
    this.sprinting = sprinting;

    // 무쌍은 회피 중이 아니면 어떤 동작이든 끊고 발동한다.
    if (input.musou && this.musouReady && this.state !== 'musou' && this.state !== 'dodge') { this.strikes.length = 0; this.skillMove = null; this.startMusou(battle, input); }
    switch (this.state) {
      case 'idle':
        if (input.dodge && this.stamina >= 20) { this.startDodge(mx, mz, ml); break; }
        if (input.musou && this.musouReady) { this.startMusou(battle, input); break; }
        for (const k of ['Q', 'E', 'R', 'Y']) if (input['skill' + k] && this.cd[k] <= 0) { this.startSkill(k, battle, input); break; }
        if (this.state !== 'idle') break;
        if (input.heavyDown) { this.state = 'charge'; this.stateT = 0; this.chargeT = 0; break; }
        if (input.attack || this.queued) { this.queued = false; this.startCombo(battle); }
        break;
      case 'charge':
        moveMul = 0.45;
        this.chargeT = Math.min(1.2, this.chargeT + dt);
        this.anim.guard = this.chargeT / 1.2;
        if (input.dodge && this.stamina >= 20) { this.anim.guard = 0; this.startDodge(mx, mz, ml); break; }
        if (!input.heavyHeld) this.releaseHeavy(battle);
        break;
      case 'attack':
        moveMul = 0.35;
        if (input.attack) this.queued = true;
        if (input.dodge && this.stamina >= 20 && this.stateT > 0.12) { this.startDodge(mx, mz, ml); break; }
        // 기술·무쌍은 연속 공격을 끊고 바로 나간다.
        if (input.musou && this.musouReady) { this.strikes.length = 0; this.startMusou(battle, input); break; }
        { const k = ['Q', 'E', 'R', 'Y'].find((s) => input['skill' + s] && this.cd[s] <= 0); if (k) { this.strikes.length = 0; this.combo = 0; this.startSkill(k, battle, input); break; } }
        if (this.stateT >= this.stateDur) {
          this.state = 'idle';
          this.comboTimer = 0.55;
          if (this.queued && this.combo < COMBO.length) { this.queued = false; this.startCombo(battle); }
          else if (this.combo >= COMBO.length) this.combo = 0;
        }
        break;
      case 'skill': case 'heavy':
        moveMul = this.skillMove ? 0 : 0.2;
        if (this.stateT >= this.stateDur) { this.state = 'idle'; this.skillMove = null; }
        break;
      case 'dodge':
        moveMul = 0;
        if (this.stateT >= this.stateDur) this.state = 'idle';
        break;
      case 'musou':
        moveMul = this.w.musou.kind === 'storm' ? 0.55 : 0.4;
        if (this.stateT >= this.stateDur) { this.state = 'idle'; battle.emit({ type: 'musouEnd' }); }
        break;
      default: break;
    }

    // 이동
    let vx = 0, vz = 0;
    if (this.state === 'dodge' || this.skillMove) {
      const m = this.state === 'dodge' ? this.dodgeVec : this.skillMove;
      vx = m.x; vz = m.z;
    } else if (ml > 0.05) {
      const sp = this.speedBase * moveMul * (battle.map.speedAt(this.x, this.z) || 0.5) * (this.buffs.guard > 0 ? 0.6 : 1);
      vx = mx * sp; vz = mz * sp;
    }
    const crowd = battle.crowdAround(this.x, this.z, 1.4, 'B');
    if (crowd > 5 && this.state !== 'dodge' && this.state !== 'musou') { vx *= 0.55; vz *= 0.55; }
    const nx = this.x + vx * dt, nz = this.z + vz * dt;
    if (!battle.map.blocked(nx, nz)) { this.x = nx; this.z = nz; }
    else if (!battle.map.blocked(nx, this.z)) this.x = nx;
    else if (!battle.map.blocked(this.x, nz)) this.z = nz;
    battle.map.clampInside(this);
    this.vx = vx; this.vz = vz;
    const moving = Math.hypot(vx, vz) > 0.3;
    const wantFace = this.state === 'idle' && moving && !input.aimLock ? Math.atan2(vz, vx) : this.aim;
    this.facing += Math.atan2(Math.sin(wantFace - this.facing), Math.cos(wantFace - this.facing)) * Math.min(1, dt * 14);
    this.moving = moving;

    // 애니메이션 감쇠
    this.anim.swing = Math.max(0, this.anim.swing - dt * 3.2);
    this.anim.lunge = Math.max(0, this.anim.lunge - dt * 4);
    this.anim.spin = Math.max(0, this.anim.spin - dt * 2.5);
    this.anim.roll = Math.max(0, this.anim.roll - dt * 3.5);
    if (this.state !== 'charge') this.anim.guard = Math.max(this.buffs.guard > 0 || this.buffs.brace > 0 ? 0.8 : 0, this.anim.guard - dt * 4);
  }

  startDodge(mx, mz, ml) {
    const a = ml > 0.1 ? Math.atan2(mz, mx) : this.aim + Math.PI;
    this.dodgeVec = { x: Math.cos(a) * 21, z: Math.sin(a) * 21 };
    this.state = 'dodge'; this.stateT = 0; this.stateDur = 0.32;
    this.invuln = 0.36;
    this.stamina -= 22;
    this.anim.roll = 1;
    this.strikes.length = 0;
  }

  startCombo(battle) {
    const step = COMBO[this.combo];
    this.state = 'attack'; this.stateT = 0; this.stateDur = step.t;
    this.anim.swing = 1; this.anim.swingDir = this.combo % 2 ? -1 : 1; this.anim.lunge = 0.6;
    this.facing = this.aim;
    const power = step.p, idx = this.combo;
    this.combo++;
    battle.emit({ type: 'swing', heavy: idx === 3 });
    if (this.ranged) {
      this.strikes.push({ t: battle.time + step.t * 0.35, fn: () => battle.heroProjectile({ power: power * 0.9, range: this.wt === 'bow' ? 42 : 30, pierce: this.wt === 'bow' ? 1 : 0, speed: this.wt === 'bow' ? 60 : 38, magic: this.wt === 'focus', aoe: this.wt === 'focus' ? 2.5 : 0 }) });
    } else {
      this.strikes.push({ t: battle.time + step.t * 0.4, fn: () => battle.heroStrike({ power, range: this.reach * (idx === 3 ? 1.25 : 1), arc: idx === 3 ? 2.6 : 2.0, knock: idx === 3 ? 3.5 : 1.2 }) });
    }
  }

  releaseHeavy(battle) {
    const ratio = this.chargeT / 1.2;
    this.state = 'heavy'; this.stateT = 0; this.stateDur = 0.45;
    this.anim.swing = 1; this.anim.lunge = 1; this.anim.guard = 0;
    this.facing = this.aim;
    battle.emit({ type: 'heavy', ratio });
    const power = 1.5 + ratio * 2.2;
    if (this.ranged) this.strikes.push({ t: battle.time + 0.12, fn: () => battle.heroProjectile({ power, range: 55, pierce: 4 + Math.round(ratio * 6), speed: 70, magic: this.wt === 'focus', aoe: this.wt === 'focus' ? 4 + ratio * 3 : 0 }) });
    else this.strikes.push({ t: battle.time + 0.14, fn: () => battle.heroStrike({ power, range: this.reach * (1.3 + ratio * 0.5), arc: 2.4 + ratio * 0.8, knock: 4 + ratio * 4, launch: ratio > 0.6, crit: ratio > 0.95 }) });
    this.chargeT = 0;
  }

  startSkill(k, battle, input) {
    const sk = this.w.skills[k];
    this.cd[k] = sk.cd * this.cooldownMul();
    this.state = 'skill'; this.stateT = 0; this.stateDur = 0.42;
    this.skillKey = k;
    this.facing = this.aim;
    battle.emit({ type: 'skill', key: k, name: sk.name, kind: sk.kind });
    const P = sk.power ?? 1;
    switch (sk.kind) {
      case 'dash': {
        this.stateDur = 0.34;
        const sp = sk.range / 0.3;
        this.skillMove = { x: Math.cos(this.aim) * sp, z: Math.sin(this.aim) * sp };
        this.invuln = 0.3;
        this.anim.lunge = 1;
        for (let i = 1; i <= 3; i++) this.strikes.push({ t: battle.time + i * 0.1, fn: () => battle.heroStrike({ power: P / 1.6, range: sk.width + 1.5, arc: Math.PI * 2, knock: 2.5, tag: 'Q', dedupe: 'dash' }) });
        this.strikes.push({ t: battle.time + 0.36, fn: () => { this.skillMove = null; } });
        break;
      }
      case 'arc':
        this.anim.swing = 1; this.anim.swingDir = 1;
        this.strikes.push({ t: battle.time + 0.15, fn: () => battle.heroStrike({ power: P, range: sk.range, arc: sk.arc, knock: sk.knock ?? 2, launch: !!sk.shieldBreak, shieldBreak: sk.shieldBreak, tag: k }) });
        break;
      case 'area':
        this.stateDur = 0.6; this.anim.spin = 1;
        this.strikes.push({ t: battle.time + 0.18, fn: () => battle.heroStrike({ power: P * 0.55, range: sk.range, arc: Math.PI * 2, knock: sk.knock ?? 3, tag: k, dedupe: 'area' }) });
        this.strikes.push({ t: battle.time + 0.42, fn: () => battle.heroStrike({ power: P * 0.55, range: sk.range, arc: Math.PI * 2, knock: (sk.knock ?? 3) + 2, launch: true, tag: k, dedupe: 'area' }) });
        break;
      case 'shot': {
        if (sk.step) { const sp = sk.step / 0.25; this.skillMove = { x: Math.cos(this.aim) * sp, z: Math.sin(this.aim) * sp }; this.strikes.push({ t: battle.time + 0.25, fn: () => { this.skillMove = null; } }); }
        this.strikes.push({ t: battle.time + 0.18, fn: () => battle.heroProjectile({ power: P, range: sk.range, pierce: sk.pierce, speed: 80, tag: k }) });
        break;
      }
      case 'blast': {
        const tgt = input.aim ?? { x: this.x + Math.cos(this.aim) * 10, z: this.z + Math.sin(this.aim) * 10 };
        const d = Math.min(sk.range, Math.hypot(tgt.x - this.x, tgt.z - this.z));
        const bx = this.x + Math.cos(this.aim) * d, bz = this.z + Math.sin(this.aim) * d;
        battle.emit({ type: 'blastCast', x: bx, z: bz, r: sk.radius, fx: k === 'Q' ? 'fire' : 'thunder' });
        this.strikes.push({ t: battle.time + 0.4, fn: () => battle.heroBlast({ x: bx, z: bz, r: sk.radius, power: P, fx: k === 'Q' ? 'fire' : 'thunder', tag: k }) });
        break;
      }
      case 'special':
        if (sk.buff === 'heal') {
          this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.25);
          battle.healAllies(this.x, this.z, 18, 0.06);
          battle.emit({ type: 'heal', x: this.x, z: this.z });
        } else if (sk.buff === 'ward') {
          this.shield = this.maxHp * 0.25;
          this.buffs.ward = sk.time;
          battle.emit({ type: 'ward', x: this.x, z: this.z });
        } else {
          this.buffs[sk.buff] = sk.time;
          if (sk.buff === 'brace' || sk.buff === 'guard') this.anim.guard = 1;
        }
        break;
      default: break;
    }
  }

  startMusou(battle, input) {
    this.musou = 0;
    this.musouUses++;
    this.state = 'musou'; this.stateT = 0; this.stateDur = 3.4;
    this.invuln = 3.4;
    const m = this.w.musou;
    battle.emit({ type: 'musou', name: m.name });
    const n = m.kind === 'storm' ? 16 : 12;
    for (let i = 0; i < n; i++) {
      const t = battle.time + 0.5 + i * (2.7 / n);
      if (m.kind === 'storm') {
        this.strikes.push({ t, fn: () => { this.anim.spin = 1; battle.heroStrike({ power: 1.15, range: 7.5, arc: Math.PI * 2, knock: 4, launch: i % 3 === 0, tag: 'T', dedupe: 'musou' + Math.floor(i / 4), crit: i === n - 1 }); } });
      } else {
        this.strikes.push({ t, fn: () => {
          const a = input.aim ?? { x: this.x + Math.cos(this.aim) * 14, z: this.z + Math.sin(this.aim) * 14 };
          const d = Math.min(32, Math.hypot(a.x - this.x, a.z - this.z));
          const cx = this.x + Math.cos(this.aim) * d + (Math.random() - 0.5) * 10, cz = this.z + Math.sin(this.aim) * d + (Math.random() - 0.5) * 10;
          battle.heroBlast({ x: cx, z: cz, r: 6, power: 1.4, fx: this.wt === 'focus' ? 'thunder' : 'arrows', tag: 'T', crit: i === n - 1 });
        } });
      }
    }
  }
}

/** 적 지휘관(장수). 단순 AI 로 근접전을 벌인다. */
export class General {
  constructor({ name, side, mode, x, z, facing, front }) {
    this.name = name; this.side = side; this.front = front;
    this.maxHp = mode === 'heroic' ? 24000 : 4200;
    this.hp = this.maxHp;
    this.dr = 0.3;
    this.hit = mode === 'heroic' ? 340 : 150;
    this.x = x; this.z = z; this.facing = facing; this.homeX = x; this.homeZ = z;
    this.atkT = 0; this.dead = false; this.anim = { swing: 0, swingDir: 1, lunge: 0, spin: 0, roll: 0, guard: 0 };
    this.moving = false;
  }
  damage(a, time) {
    if (this.dead) return 0;
    const d = a * (1 - this.dr);
    this.hp -= d;
    this.lastHit = time;
    if (this.hp <= 0) { this.hp = 0; this.dead = true; }
    return d;
  }
  update(dt, battle) {
    if (this.dead) return;
    this.anim.swing = Math.max(0, this.anim.swing - dt * 3);
    const hero = battle.hero;
    const dh = Math.hypot(hero.x - this.x, hero.z - this.z);
    let tx = this.homeX, tz = this.homeZ;
    // 본진 부대의 중심 뒤쪽을 따라다닌다.
    const front = battle.units.filter((u) => u.side === this.side && u.front === this.front && !u.dead && !u.routing);
    if (front.length) {
      const cx = front.reduce((s, u) => s + u.x, 0) / front.length, cz = front.reduce((s, u) => s + u.z, 0) / front.length;
      const dir = this.side === 'B' ? battle.homeDir.B : battle.homeDir.A;
      tx = cx + dir * 14; tz = cz;
    }
    const wounded = this.hp / this.maxHp < 0.4;
    if (!hero.dead && dh < 22 && !wounded) { tx = hero.x; tz = hero.z; }
    // 크게 다치면 본진 뒤로 물러나 회복을 노린다.
    if (wounded) { const dir = battle.homeDir[this.side]; tx = (front.length ? tx : this.homeX) + dir * 30; }
    const dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz);
    const stop = !hero.dead && dh < 22 ? 2.6 : 2;
    this.moving = d > stop;
    if (this.moving) {
      const sp = 5.2 * (battle.map.speedAt(this.x, this.z) || 0.5);
      const nx = this.x + (dx / d) * sp * dt, nz = this.z + (dz / d) * sp * dt;
      if (!battle.map.blocked(nx, nz)) { this.x = nx; this.z = nz; }
      this.facing = Math.atan2(dz, dx);
    }
    this.atkT -= dt;
    if (!hero.dead && dh < 3.4 && this.atkT <= 0) {
      this.atkT = 1.15;
      this.anim.swing = 1; this.anim.swingDir *= -1;
      this.facing = Math.atan2(hero.z - this.z, hero.x - this.x);
      battle.strikeHero(this.hit, this.x, this.z);
    }
    if (this.hp < this.maxHp && battle.time - (this.lastHit ?? -10) > 6) this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.02 * dt);
  }
}

export const clampHp = (h) => clamp(h, 0, Infinity);
