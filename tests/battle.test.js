// 헤드리스 전투 시뮬레이션 검증: 20개 전투 모두 배치·진행·종료가 안정적인지 확인한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BATTLES } from '../src/data/battles.js';
import { TROOPS } from '../src/data/troops.js';
import { Battle } from '../src/game/battle.js';

const profile = { commander: '시험', equip: { weapon: 'dragonGlaive', mount: 'foot' } };

test('모든 전투 데이터가 유효한 병종과 전선을 참조한다', () => {
  assert.equal(BATTLES.length, 20);
  assert.equal(BATTLES.filter((b) => b.mode === 'tactical').length, 10);
  for (const b of BATTLES) {
    for (const side of ['ally', 'enemy']) for (const [, key, n] of b.armies[side].units) { assert.ok(TROOPS[key], `${b.id} ${key}`); assert.ok(n > 0); }
    assert.equal(b.achievements.length, 5);
    for (const f of b.objective.flags ?? []) assert.ok(b.map.flags.some((x) => x.id === f), `${b.id} flag ${f}`);
    if (b.objective.zone) assert.ok(b.map.zones.some((z) => z.id === b.objective.zone));
  }
});

test('20개 전투 모두 60초 동안 NaN 없이 진행되고 부대가 지형에 갇히지 않는다', () => {
  for (const def of BATTLES) {
    const b = new Battle(def, { profile, settings: { difficulty: 'normal' } });
    assert.ok(b.units.length > 0);
    for (const u of b.units) assert.equal(b.map.blocked(u.x, u.z), false, `${def.id} ${u.name} 배치 위치가 막힘`);
    for (let i = 0; i < 1200 && !b.result; i++) { b.update(0.05, {}); b.events.length = 0; }
    for (const u of b.units) assert.ok(Number.isFinite(u.x) && Number.isFinite(u.z) && Number.isFinite(u.troops), `${def.id} ${u.name} 값 오류`);
    assert.ok(Number.isFinite(b.hero.hp));
  }
});

test('지휘관의 공격은 적 병사를 쓰러뜨리고 무쌍 게이지를 채운다', () => {
  const def = BATTLES.find((x) => x.id === 11);
  const b = new Battle(def, { profile, settings: {} });
  const enemy = b.units.find((u) => u.side === 'B');
  b.hero.x = enemy.x - Math.cos(enemy.facing) * 2; b.hero.z = enemy.z;
  const before = enemy.troops;
  b.hero.aim = Math.atan2(enemy.z - b.hero.z, enemy.x - b.hero.x);
  const hits = b.heroStrike({ power: 2, range: 8, arc: Math.PI * 2 });
  assert.ok(hits > 0);
  assert.ok(enemy.troops < before);
  assert.ok(b.hero.musou > 0);
  assert.ok(b.stats.heroKills > 0);
});

test('지휘관이 쓰러지면 패배하고, 적 유효 병력이 20% 미만이면 승리한다', () => {
  const def = BATTLES.find((x) => x.id === 5);
  const b = new Battle(def, { profile, settings: {} });
  b.hero.damage(1e9, 0, 0, 0);
  b.update(0.05, {});
  assert.equal(b.result, 'defeat');
  const b2 = new Battle(def, { profile, settings: {} });
  for (const u of b2.units) if (u.side === 'B') u.takeLosses(u.troops * 0.85, u.x, u.z, 0);
  b2.update(0.05, {});
  assert.equal(b2.result, 'victory');
});

test('거점 유지형 목표: 아군이 깃발을 지키면 시간이 쌓인다', () => {
  const def = BATTLES.find((x) => x.id === 1);
  const b = new Battle(def, { profile, settings: {} });
  for (let i = 0; i < 100; i++) { b.update(0.05, {}); b.events.length = 0; }
  assert.ok(b.hold > 4);
  assert.ok(b.flags.every((f) => f.owner === 'A'));
});

test('명령: 선택하지 않으면 본진 전선 전체가 명령을 받는다', () => {
  const b = new Battle(BATTLES[0], { profile, settings: {} });
  const main = b.units.filter((u) => u.side === 'A' && u.front === 'main');
  b.command('holdCursor', { x: b.hero.x + 20, z: b.hero.z });
  assert.ok(main.every((u) => !u.ai && u.order.type === 'hold'));
  b.select(b.units.find((u) => u.side === 'A' && u.front === 'lt1'));
  assert.equal(b.commandUnits().length, 1);
  b.command('delegateBack');
  assert.equal(b.units.filter((u) => u.selected).length, 0);
});
