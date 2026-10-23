// 헤드리스 전투 시뮬레이션: 균형·성능·안정성 점검.
// 전술 전투는 지휘관을 후방에 두고 군대끼리 싸우게 하고, 영웅 전투는 간단한 봇이 목표를 향해 싸운다.
// 사용법: node scripts/sim-run.mjs [전투 id...]
import { BATTLES } from '../src/data/battles.js';
import { Battle } from '../src/game/battle.js';
import { formatTime } from '../src/core/rules.js';

function botInput(b) {
  const h = b.hero;
  const o = b.objective;
  let goal = null;
  const open = b.flags.filter((f) => !f.locked && (o.type === 'captureEach' || o.type === 'captureReturn' || o.type === 'holdTogether') && (f.owner !== 'A' || o.type !== 'holdTogether'));
  if (open.length) goal = open.sort((a, c) => Math.hypot(a.x - h.x, a.z - h.z) - Math.hypot(c.x - h.x, c.z - h.z))[0];
  else if (o.type === 'captureReturn') goal = b.zones.find((z) => z.id === o.zone);
  else if (o.type === 'escort') {
    const w = b.wards.find((x) => !x.following && !x.safe);
    goal = w ?? b.zones.find((z) => z.id === o.zone);
  } else if (o.type === 'commander' && !b.general.dead) goal = b.general;
  const enemy = b.enemyNear(h.x, h.z, 30);
  let tx = goal?.x ?? enemy?.x ?? h.x, tz = goal?.z ?? enemy?.z ?? h.z;
  // 체력이 낮으면 물러난다
  if (h.hp / h.maxHp < 0.25) { tx = h.x + b.homeDir.A * 30; tz = h.z; }
  const dx = tx - h.x, dz = tz - h.z, d = Math.hypot(dx, dz);
  const near = enemy && Math.hypot(enemy.x - h.x, enemy.z - h.z) < enemy.radius + 6;
  const aim = near ? { x: enemy.x, z: enemy.z } : { x: tx, z: tz };
  return {
    move: d > 4 && !(near && h.hp / h.maxHp > 0.25 && !goal) ? { x: dx / d, z: dz / d } : { x: 0, z: 0 },
    aim, attack: near, skillQ: near, skillE: near, skillR: near, skillY: false, musou: near && h.musouReady, sprint: !near && d > 30,
  };
}

const ids = process.argv.slice(2).map(Number);
const list = ids.length ? BATTLES.filter((b) => ids.includes(b.id)) : BATTLES;
for (const def of list) {
  const t0 = performance.now();
  const b = new Battle(def, { profile: { commander: '시험', equip: { weapon: 'dragonGlaive', mount: 'foot' } }, settings: { difficulty: 'normal' } });
  let steps = 0;
  const snaps = [];
  while (!b.result && b.time < def.timeLimit + 1) {
    let input;
    if (def.mode === 'heroic') input = botInput(b);
    else { const edge = b.homeDir.A * (b.map.W / 2 - 8); input = { move: { x: Math.sign(edge - b.hero.x) * (Math.abs(edge - b.hero.x) > 3 ? 1 : 0), z: 0 } }; }
    b.update(0.05, input);
    b.events.length = 0;
    steps++;
    if (steps % 1200 === 0) snaps.push(`${formatTime(b.time)} A${Math.round(b.effective('A'))} B${Math.round(b.effective('B'))} hp${Math.round(b.hero.hp)}`);
  }
  const ms = performance.now() - t0;
  const bad = b.units.some((u) => !Number.isFinite(u.x) || !Number.isFinite(u.troops));
  console.log(`#${def.id} ${def.title}: ${b.result ?? 'none'} @${formatTime(b.time)} (${b.resultReason ?? ''}) A=${Math.round(b.effective('A'))}/${b.initial.A} B=${Math.round(b.effective('B'))}/${b.initial.B} heroKills=${Math.round(b.hero.kills)} musou=${b.hero.musouUses} locked=${[...b.locked].join(',')} ${(ms / steps).toFixed(2)}ms/step ${bad ? 'NaN!!' : ''}`);
  console.log('   ', snaps.join(' | '));
}
