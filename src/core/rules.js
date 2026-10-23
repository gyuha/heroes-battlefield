// 전투 규칙의 순수 함수 모음. three.js·DOM 에 의존하지 않아 Node 테스트로 검증한다.

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
export const lerp = (a, b, t) => a + (b - a) * t;

export function seededRandom(seed) {
  let s = typeof seed === 'number' ? seed >>> 0 : [...String(seed)].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let v = Math.imul(s ^ (s >>> 15), s | 1);
    v ^= v + Math.imul(v ^ (v >>> 7), v | 61);
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
  };
}

/** 공격 방향 판정. defenderFacing: 방어 부대가 바라보는 각(rad), attackAngle: 방어자→공격자 방향 각. */
export function attackAspect(defenderFacing, attackAngle) {
  let d = Math.abs(attackAngle - defenderFacing) % (Math.PI * 2);
  if (d > Math.PI) d = Math.PI * 2 - d;
  if (d < Math.PI / 3) return 'front';
  if (d < (Math.PI * 2) / 3) return 'flank';
  return 'rear';
}

export const ASPECT = { front: { dmg: 1, dr: 1 }, flank: { dmg: 1.5, dr: 0.8 }, rear: { dmg: 2, dr: 0.5 } };

/**
 * 근접 공격 한 번의 피해 배율. 원본 도감의 상성(창 세우기 vs 기병, 기병 돌격, 측후방 공격)을 수치화했다.
 * @returns {{ mult:number, drMult:number, stopCharge:boolean }}
 */
export function meleeModifiers({ attackerCls, defenderCls, aspect = 'front', defenderBraced = false, attackerCharging = false, braceLevel = 1, formation = 'block' }) {
  let mult = ASPECT[aspect].dmg;
  let drMult = ASPECT[aspect].dr;
  let stopCharge = false;
  const cav = (c) => c === 'cav_shock' || c === 'cav_raid';
  // 원진·공심방진은 측후방 약점이 없다.
  if ((formation === 'circle' || formation === 'hollow') && aspect !== 'front') { mult = 1; drMult = 1; }
  if (cav(attackerCls) && defenderCls === 'spear' && defenderBraced && aspect === 'front') { mult *= 0.35; stopCharge = true; }
  if (defenderCls === 'spear' && cav(attackerCls) && aspect === 'front') mult *= 0.8;
  if (attackerCls === 'spear' && cav(defenderCls)) mult *= 1.6 * (defenderBraced ? 1 : 1) * braceLevel;
  if (attackerCharging && cav(attackerCls) && !stopCharge) mult *= attackerCls === 'cav_shock' ? 2.6 : 1.7;
  if (cav(attackerCls) && (defenderCls === 'archer' || defenderCls === 'crossbow')) mult *= 1.4;
  if (attackerCls === 'shock' && (defenderCls === 'shield' || defenderCls === 'infantry')) mult *= 1.15;
  return { mult, drMult, stopCharge };
}

/** 받는 쪽이 정면 방패를 가진 경우 방패 내구가 흡수하는 비율. */
export function shieldAbsorb(defenderCls, aspect, poolRatio) {
  if (defenderCls !== 'shield' || aspect !== 'front' || poolRatio <= 0) return 0;
  return 0.7;
}

/** 실제 병사 손실 수. dmg: 총 피해, dr: 피해 감소(0~1), hp: 병사당 체력. */
export function casualties(dmg, dr, hp, drMult = 1, armorPierce = 1) {
  if (!(dmg > 0) || !(hp > 0)) return 0;
  const effDr = clamp(dr * drMult * armorPierce, 0, 0.9);
  return (dmg * (1 - effDr)) / hp;
}

/** 거점 점령 진행. progress -100(B)~100(A). 양측이 모두 있으면 경합(정지). */
export function stepCapture(progress, aCount, bCount, dt, rate = 12.5) {
  // 한쪽이 두 배 이상 우세하면 상대가 남아 있어도 점령이 진행된다(느리게).
  if (aCount > 0 && bCount > 0) {
    if (aCount >= bCount * 2 + 1) return { progress: clamp(progress + rate * 0.5 * dt, -100, 100), state: 'capturing' };
    if (bCount >= aCount * 2 + 1) return { progress: clamp(progress - rate * 0.5 * dt, -100, 100), state: 'capturing' };
    return { progress, state: 'contested' };
  }
  if (aCount > 0) return { progress: clamp(progress + rate * dt, -100, 100), state: progress >= 100 ? 'held' : 'capturing' };
  if (bCount > 0) return { progress: clamp(progress - rate * dt, -100, 100), state: progress <= -100 ? 'held' : 'capturing' };
  return { progress, state: 'idle' };
}
export const flagOwner = (progress, prevOwner) => (progress >= 100 ? 'A' : progress <= -100 ? 'B' : prevOwner);

/**
 * 승패 판정. 지휘관 사망은 언제나 패배이며 다른 조건보다 우선한다.
 * s: { heroDead, time, timeLimit, enemyRatio, enemyLossRatio, objective, flagsOwned:{id:'A'|'B'|'none'}, hold, locked:Set, heroInZone, escorted, generalDead }
 */
export function evaluateObjective(s) {
  const o = s.objective;
  if (s.heroDead) return 'defeat';
  if (s.allyRatio !== undefined && s.allyRatio <= 0.02) return 'defeat';
  const rout = s.enemyRatio < (o.threshold ?? 0.2);
  switch (o.type) {
    case 'holdAny': if (rout || s.hold >= o.time) return 'victory'; break;
    case 'holdTogether': if (s.hold >= o.time) return 'victory'; if (o.allowRout && rout) return 'victory'; break;
    case 'captureEach': if (o.flags.every((f) => s.locked.has(f))) return 'victory'; break;
    case 'rout': if (rout) return 'victory'; break;
    case 'commander': if (s.generalDead && s.enemyLossRatio >= o.routPct) return 'victory'; break;
    case 'captureReturn': if (o.flags.every((f) => s.locked.has(f)) && s.heroInZone) return 'victory'; break;
    case 'escort': if (s.escorted >= o.persons.length) return 'victory'; break;
    default: break;
  }
  if (s.time >= s.timeLimit) return 'defeat';
  return null;
}

/** 권장 진영이 아닌 쪽을 고르면 목표를 공격형으로 바꾼다(재구현 규칙). */
export function objectiveForSide(objective, swapped) {
  if (!swapped) return objective;
  if (objective.flags?.length) return { type: 'holdTogether', flags: objective.flags, time: 30, allowRout: true, text: '모든 깃발을 빼앗아 함께 30초 동안 지키거나 적을 패주시키세요.' };
  return { type: 'rout', threshold: 0.2, text: '적의 유효 병력을 시작의 20% 미만으로 줄이세요.' };
}

/** 업적 판정. stats: 전투 종료 통계. */
export function evaluateAchievements(list, stats) {
  return list.map((a) => {
    if (!stats.victory) return false;
    switch (a.type) {
      case 'win': return stats.recommended !== false;
      case 'killsBy': return (stats.killsBy?.[a.cls] ?? 0) >= a.n;
      case 'survive': return stats.initialAllies > 0 && stats.survivingAllies / stats.initialAllies >= a.pct;
      case 'time': return stats.elapsed <= a.sec;
      case 'heroKills': return stats.heroKills >= a.n;
      case 'musou': return stats.musouUses >= a.n;
      case 'heroHp': return stats.maxHeroHp > 0 && stats.heroHp / stats.maxHeroHp >= a.pct;
      default: return false;
    }
  });
}

export function medalFor(achieved) {
  const n = achieved.filter(Boolean).length;
  if (!achieved[0] && n === 0) return 'none';
  return n >= 5 ? 'gold' : n >= 3 ? 'silver' : n >= 1 ? 'bronze' : 'none';
}

export function formatTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** 원본 병력을 중대(부대)로 나눈다. 전술 전투는 중대당 최대 600, 영웅 전투 적군은 1000. */
export function splitCompanies(count, maxPer) {
  const n = Math.max(1, Math.ceil(count / maxPer));
  const base = Math.floor(count / n);
  return Array.from({ length: n }, (_, i) => base + (i < count - base * n ? 1 : 0));
}

/** 중대 i(총 k개)를 F개 전선에 고르게 배분한다. */
export const frontIndexFor = (i, k, F) => Math.min(F - 1, Math.floor((i * F) / k));
