// 전선(front) 지휘 AI. 부장 전선·적군 전선·플레이어 본진(AI 위임 상태)의 부대에 명령을 내린다.
// 자세(posture): defend 거점·배치 위치 사수 / attack 목표 지점 진격 / escort 지휘관 호위 / hunt 지휘관 추적(영웅 전투의 적)

const near = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export class FrontAI {
  constructor(battle, side, frontId, posture, { delay = 0, leash = 40 } = {}) {
    this.b = battle; this.side = side; this.front = frontId; this.posture = posture;
    this.delay = delay; this.leash = leash; this.timer = Math.random() * 0.4;
  }

  units() { return this.b.units.filter((u) => u.side === this.side && u.homeFront === this.front && u.ai && !u.dead && !u.routing); }

  update(dt) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.5;
    const units = this.units();
    if (!units.length) return;
    const b = this.b;
    const enemies = b.units.filter((u) => u.side !== this.side && !u.dead && !u.routing);
    let posture = this.posture;
    if (posture === 'attack' && b.time < this.delay) posture = 'defend';
    // 전선 병력이 크게 줄면 방어로 전환해 물러선다(원본의 부장 후퇴 규칙을 단순화).
    const str = units.reduce((s, u) => s + u.troops, 0) / units.reduce((s, u) => s + u.maxTroops, 0);
    if (posture === 'attack' && str < 0.3) posture = 'defend';
    const goal = posture === 'attack' ? this.attackGoal(enemies) : null;

    for (const u of units) {
      if (posture === 'escort') this.escort(u, enemies);
      else if (posture === 'hunt') this.hunt(u, enemies);
      else if (posture === 'attack') this.attack(u, enemies, goal);
      else this.defend(u, enemies);
    }
  }

  nearestEnemy(u, enemies, maxD = Infinity, from = u) {
    let best = null, bd = maxD;
    for (const e of enemies) { const d = near(from, e) - e.radius; if (d < bd) { bd = d; best = e; } }
    return best;
  }

  /** 공격 목표: 빼앗아야 할 깃발 → 적 지휘관 → 적군 중심. */
  attackGoal(enemies) {
    const b = this.b;
    const mine = this.side;
    const targets = b.flags.filter((f) => f.owner !== mine && (!f.locked || f.lockedBy !== mine));
    if (targets.length) {
      const c = this.centroid();
      targets.sort((a, b2) => near(a, c) - near(b2, c));
      return { x: targets[0].x, z: targets[0].z, flag: targets[0] };
    }
    if (mine === 'B' && !b.hero.dead && b.mode === 'heroic') return { x: b.hero.x, z: b.hero.z };
    if (!enemies.length) return null;
    const c = this.centroid();
    const e = enemies.reduce((best, x) => (near(x, c) < near(best, c) ? x : best), enemies[0]);
    return { x: e.x, z: e.z, unit: e };
  }

  centroid() {
    const us = this.units();
    return { x: us.reduce((s, u) => s + u.x, 0) / us.length, z: us.reduce((s, u) => s + u.z, 0) / us.length };
  }

  defend(u, enemies) {
    const home = u.home;
    const threat = this.nearestEnemy(u, enemies, this.leash + 20, home);
    const heroThreat = this.side === 'B' && !this.b.hero.dead && near(this.b.hero, home) < this.leash ? this.b.hero : null;
    if (u.ranged) { this.b.orderUnit(u, { type: 'hold', x: home.x, z: home.z, facing: this.faceToward(home, threat ?? heroThreat, home.facing) }, true); return; }
    if (u.cav) {
      if (threat && near(threat, home) < this.leash + 15 && !(threat.braced && threat.cls === 'spear')) { this.cavalryStrike(u, threat); return; }
      if (u.engaged && u.meleeTime > 6) { this.b.orderUnit(u, { type: 'retreat', x: home.x, z: home.z }, true); return; }
      this.b.orderUnit(u, { type: 'hold', x: home.x, z: home.z, facing: home.facing }, true);
      return;
    }
    if (u.cls === 'spear' || u.cls === 'shield') {
      // 창·방패는 자리를 지키며 위협 쪽을 바라본다.
      if (threat && near(threat, home) < 16 && near(u, home) < 20) { this.b.orderUnit(u, { type: 'attack', target: threat, x: threat.x, z: threat.z }, true); return; }
      this.b.orderUnit(u, { type: 'hold', x: home.x, z: home.z, facing: this.faceToward(home, threat ?? heroThreat, home.facing) }, true);
      return;
    }
    if (threat && near(threat, home) < this.leash && near(u, home) < this.leash) this.b.orderUnit(u, { type: 'attack', target: threat, x: threat.x, z: threat.z }, true);
    else if (heroThreat && near(u, home) < this.leash) this.b.orderUnit(u, { type: 'attack', hero: true, x: heroThreat.x, z: heroThreat.z }, true);
    else this.b.orderUnit(u, { type: 'hold', x: home.x, z: home.z, facing: this.faceToward(home, threat, home.facing) }, true);
  }

  attack(u, enemies, goal) {
    if (!goal) { this.defend(u, enemies); return; }
    const near30 = this.nearestEnemy(u, enemies, 28);
    if (u.ranged) {
      const tgt = this.nearestEnemy(u, enemies, u.range * 0.95);
      if (tgt) { this.b.orderUnit(u, { type: 'hold', x: u.x, z: u.z, facing: Math.atan2(tgt.z - u.z, tgt.x - u.x) }, true); return; }
      // 아군 근접 부대 뒤를 따라 전진
      const off = u.home.offset;
      this.b.orderUnit(u, { type: 'move', x: goal.x + off.x - Math.cos(u.home.facing) * 25, z: goal.z + off.z - Math.sin(u.home.facing) * 25 }, true);
      return;
    }
    if (u.cav) {
      const prey = this.pickCavalryPrey(u, enemies);
      if (u.engaged && u.meleeTime > 5) { const back = { x: u.x - Math.cos(u.facing) * 35, z: u.z - Math.sin(u.facing) * 35 }; this.b.orderUnit(u, { type: 'retreat', x: back.x, z: back.z }, true); return; }
      if (prey) { this.cavalryStrike(u, prey); return; }
    }
    if (near30) { this.b.orderUnit(u, { type: 'attack', target: near30, x: near30.x, z: near30.z }, true); return; }
    if (goal.flag && near(u, goal) < 10) { this.b.orderUnit(u, { type: 'hold', x: u.x, z: u.z, facing: u.facing }, true); return; }
    const off = u.home.offset;
    this.b.orderUnit(u, { type: 'move', x: goal.x + off.x * 0.6, z: goal.z + off.z * 0.6 }, true);
  }

  pickCavalryPrey(u, enemies) {
    let best = null, bs = -Infinity;
    for (const e of enemies) {
      const d = near(u, e);
      if (d > 140) continue;
      let s = -d * 0.4;
      if (e.ranged) s += 40;
      if (e.engaged) s += 25;
      if (e.cls === 'spear' && e.braced) s -= 60;
      if (e.cls === 'spear') s -= 20;
      if (s > bs) { bs = s; best = e; }
    }
    return best;
  }

  /** 기병: 목표의 측면·후방으로 돌아간 뒤 돌격한다. */
  cavalryStrike(u, prey) {
    if (u.chargeCd > 0 && !u.engaged) {
      const away = { x: prey.x - Math.cos(prey.facing) * 45, z: prey.z - Math.sin(prey.facing) * 45 };
      this.b.orderUnit(u, { type: 'move', x: away.x, z: away.z }, true);
      return;
    }
    const toU = Math.atan2(u.z - prey.z, u.x - prey.x);
    const rel = Math.abs(Math.atan2(Math.sin(toU - prey.facing), Math.cos(toU - prey.facing)));
    if (rel < 1.0 && near(u, prey) > 20 && prey.cls !== 'archer' && prey.cls !== 'crossbow') {
      // 정면이면 측면 지점으로 우회
      const side = Math.sin(toU - prey.facing) >= 0 ? 1 : -1;
      const a = prey.facing + side * 1.9;
      this.b.orderUnit(u, { type: 'move', x: prey.x + Math.cos(a) * 40, z: prey.z + Math.sin(a) * 40 }, true);
      return;
    }
    this.b.orderUnit(u, { type: 'charge', target: prey, x: prey.x, z: prey.z }, true);
  }

  escort(u, enemies) {
    const h = this.b.hero;
    const off = u.home.escort;
    const ca = Math.cos(h.facing), sa = Math.sin(h.facing);
    const px = h.x + ca * off.z - sa * off.x, pz = h.z + sa * off.z + ca * off.x;
    const threat = this.nearestEnemy(u, enemies, 20, h);
    if (u.ranged) {
      const tgt = this.nearestEnemy(u, enemies, u.range * 0.9);
      if (tgt && near(u, h) < 30) { this.b.orderUnit(u, { type: 'hold', x: u.x, z: u.z, facing: Math.atan2(tgt.z - u.z, tgt.x - u.x) }, true); return; }
    } else if (threat && near(u, h) < 28) {
      if (u.cav) this.b.orderUnit(u, { type: 'charge', target: threat, x: threat.x, z: threat.z }, true);
      else this.b.orderUnit(u, { type: 'attack', target: threat, x: threat.x, z: threat.z }, true);
      return;
    }
    this.b.orderUnit(u, { type: 'move', x: px, z: pz, facing: h.facing, loose: true }, true);
  }

  hunt(u, enemies) {
    const h = this.b.hero;
    const dh = h.dead ? Infinity : near(u, h);
    const aggro = u.ranged ? u.range : u.cav ? 75 : 45;
    const unitThreat = this.nearestEnemy(u, enemies, 18);
    if (unitThreat && !u.ranged) { this.b.orderUnit(u, { type: 'attack', target: unitThreat, x: unitThreat.x, z: unitThreat.z }, true); return; }
    if (dh < aggro || this.b.time > u.huntAt) {
      if (u.ranged) {
        const tgt = dh < u.range ? null : this.nearestEnemy(u, enemies, u.range);
        if (dh < u.range || tgt) { this.b.orderUnit(u, { type: 'hold', x: u.x, z: u.z, facing: Math.atan2(h.z - u.z, h.x - u.x) }, true); return; }
        if (dh < aggro * 1.6) { this.b.orderUnit(u, { type: 'move', x: h.x, z: h.z }, true); return; }
      } else {
        this.b.orderUnit(u, { type: u.cav ? 'charge' : 'attack', hero: true, x: h.x, z: h.z }, true);
        return;
      }
    }
    this.defend(u, enemies);
  }

  faceToward(from, target, fallback) {
    if (!target) return fallback;
    return Math.atan2(target.z - from.z, target.x - from.x);
  }
}
