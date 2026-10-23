import test from 'node:test';
import assert from 'node:assert/strict';
import {
  attackAspect, meleeModifiers, casualties, stepCapture, flagOwner, evaluateObjective, objectiveForSide,
  evaluateAchievements, medalFor, splitCompanies, frontIndexFor, formatTime, seededRandom,
} from '../src/core/rules.js';
import { sanitize, rebindKey, DEFAULT_KEYS, loadSave, persistSave, SAVE_KEY } from '../src/core/save.js';

test('공격 방향: 정면·측면·후방 판정', () => {
  assert.equal(attackAspect(0, 0.2), 'front');
  assert.equal(attackAspect(0, Math.PI / 2), 'flank');
  assert.equal(attackAspect(0, Math.PI), 'rear');
  assert.equal(attackAspect(Math.PI, -Math.PI + 0.1), 'front');
});

test('상성: 창을 세운 창병은 정면 기병 돌격을 멈추고, 측후방 공격은 더 아프다', () => {
  const braced = meleeModifiers({ attackerCls: 'cav_shock', defenderCls: 'spear', aspect: 'front', defenderBraced: true, attackerCharging: true });
  const open = meleeModifiers({ attackerCls: 'cav_shock', defenderCls: 'spear', aspect: 'rear', defenderBraced: false, attackerCharging: true });
  assert.equal(braced.stopCharge, true);
  assert.ok(open.mult > braced.mult * 5);
  const front = meleeModifiers({ attackerCls: 'infantry', defenderCls: 'infantry', aspect: 'front' });
  const rear = meleeModifiers({ attackerCls: 'infantry', defenderCls: 'infantry', aspect: 'rear' });
  assert.ok(rear.mult > front.mult && rear.drMult < front.drMult);
  const circle = meleeModifiers({ attackerCls: 'infantry', defenderCls: 'infantry', aspect: 'rear', formation: 'circle' });
  assert.equal(circle.mult, 1);
});

test('사상자 계산은 음수·NaN 을 만들지 않고 피해 감소를 반영한다', () => {
  assert.equal(casualties(-5, 0.3, 100), 0);
  assert.equal(casualties(NaN, 0.3, 100), 0);
  assert.ok(casualties(1000, 0.4, 100) < casualties(1000, 0.1, 100));
  assert.ok(casualties(1000, 0.4, 100, 1, 0.45) > casualties(1000, 0.4, 100));
});

test('거점 점령: 경합 중에는 멈추고 100에 닿으면 주인이 바뀐다', () => {
  let r = stepCapture(0, 5, 5, 1);
  assert.equal(r.state, 'contested');
  assert.equal(r.progress, 0);
  r = stepCapture(95, 5, 0, 1);
  assert.equal(r.progress, 100);
  assert.equal(flagOwner(100, 'B'), 'A');
  assert.equal(flagOwner(50, 'B'), 'B');
});

test('승패 판정: 지휘관 사망이 가장 우선이고, 목표별 조건을 따른다', () => {
  const base = { heroDead: false, time: 10, timeLimit: 600, enemyRatio: 0.9, enemyLossRatio: 0.1, hold: 0, locked: new Set(), heroInZone: false, escorted: 0, generalDead: false };
  assert.equal(evaluateObjective({ ...base, objective: { type: 'rout' }, heroDead: true, enemyRatio: 0 }), 'defeat');
  assert.equal(evaluateObjective({ ...base, objective: { type: 'rout' }, enemyRatio: 0.19 }), 'victory');
  assert.equal(evaluateObjective({ ...base, objective: { type: 'holdAny', time: 540 }, hold: 540 }), 'victory');
  assert.equal(evaluateObjective({ ...base, objective: { type: 'holdAny', time: 540 }, hold: 100 }), null);
  assert.equal(evaluateObjective({ ...base, objective: { type: 'captureEach', flags: ['a', 'b'] }, locked: new Set(['a']) }), null);
  assert.equal(evaluateObjective({ ...base, objective: { type: 'captureEach', flags: ['a', 'b'] }, locked: new Set(['a', 'b']) }), 'victory');
  assert.equal(evaluateObjective({ ...base, objective: { type: 'captureReturn', flags: ['a'] }, locked: new Set(['a']) }), null);
  assert.equal(evaluateObjective({ ...base, objective: { type: 'captureReturn', flags: ['a'] }, locked: new Set(['a']), heroInZone: true }), 'victory');
  assert.equal(evaluateObjective({ ...base, objective: { type: 'commander', routPct: 0.3 }, generalDead: true, enemyLossRatio: 0.2 }), null);
  assert.equal(evaluateObjective({ ...base, objective: { type: 'commander', routPct: 0.3 }, generalDead: true, enemyLossRatio: 0.3 }), 'victory');
  assert.equal(evaluateObjective({ ...base, objective: { type: 'escort', persons: [1, 2] }, escorted: 2 }), 'victory');
  assert.equal(evaluateObjective({ ...base, objective: { type: 'rout' }, time: 600 }), 'defeat');
});

test('비권장 진영은 공격형 목표로 바뀐다', () => {
  assert.equal(objectiveForSide({ type: 'holdAny', flags: ['n'] }, false).type, 'holdAny');
  assert.equal(objectiveForSide({ type: 'holdAny', flags: ['n'] }, true).type, 'holdTogether');
  assert.equal(objectiveForSide({ type: 'rout' }, true).type, 'rout');
});

test('업적·훈장: 경계값 포함, 패배에는 업적이 없다', () => {
  const list = [{ type: 'win' }, { type: 'killsBy', cls: 'spear', n: 30 }, { type: 'survive', pct: 0.45 }, { type: 'time', sec: 486 }, { type: 'heroHp', pct: 0.5 }];
  const st = { victory: true, recommended: true, killsBy: { spear: 30 }, initialAllies: 100, survivingAllies: 45, elapsed: 486, heroHp: 50, maxHeroHp: 100 };
  assert.deepEqual(evaluateAchievements(list, st), [true, true, true, true, true]);
  assert.deepEqual(evaluateAchievements(list, { ...st, victory: false }), [false, false, false, false, false]);
  assert.equal(evaluateAchievements(list, { ...st, recommended: false })[0], false);
  assert.equal(medalFor([true, true, true, true, true]), 'gold');
  assert.equal(medalFor([true, true, true, false, false]), 'silver');
  assert.equal(medalFor([true, false, false, false, false]), 'bronze');
  assert.equal(medalFor([false, false, false, false, false]), 'none');
});

test('중대 분할과 전선 배분은 병력을 보존한다', () => {
  for (const [n, max] of [[2400, 600], [800, 600], [5000, 1000], [240, 100000]]) {
    const c = splitCompanies(n, max);
    assert.equal(c.reduce((a, b) => a + b, 0), n);
    assert.ok(c.every((x) => x <= max));
  }
  const idx = Array.from({ length: 4 }, (_, i) => frontIndexFor(i, 4, 2));
  assert.deepEqual(idx, [0, 0, 1, 1]);
  assert.equal(formatTime(486), '8:06');
  const r = seededRandom(7);
  assert.ok(Array.from({ length: 50 }, r).every((v) => v >= 0 && v < 1));
});

test('저장 데이터: 손상된 값은 기본값으로, 키 재지정은 충돌 시 맞바꾼다', () => {
  const s = sanitize({ commander: '', portrait: 99, crest: { colors: ['red'] }, equip: { weapon: 'laser' }, results: { __proto__: { won: true }, 3: { won: true, bestTime: 100, achievements: [1, 0] } }, settings: { quality: 'ultra', volume: 5 } });
  assert.equal(s.commander, '새벽');
  assert.equal(s.portrait, 0);
  assert.equal(s.equip.weapon, 'dragonGlaive');
  assert.equal(s.results[3].won, true);
  assert.deepEqual(s.results[3].achievements, [true, false]);
  assert.equal(s.settings.quality, 'auto');
  assert.equal(s.settings.volume, 1);
  const k = rebindKey(DEFAULT_KEYS, 'skillQ', 'KeyE');
  assert.equal(k.skillQ, 'KeyE');
  assert.equal(k.skillE, 'KeyQ');
  const mem = new Map();
  const storage = { getItem: (key) => mem.get(key) ?? null, setItem: (key, v) => mem.set(key, v) };
  assert.equal(loadSave(storage).company, '은빛 군단');
  storage.setItem(SAVE_KEY, '{bad');
  assert.equal(loadSave(storage).company, '은빛 군단');
  assert.equal(persistSave({ setItem() { throw new Error('full'); } }, s), false);
});
