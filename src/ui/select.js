// 전투 선택: 왼쪽 연표(전술 역사/영웅 무쌍), 가운데 지형도·양군 편성·진영 선택, 오른쪽 정보(역사/전술/업적)와 출정.
import { h, clear } from './dom.js';
import { topbar } from './menus.js';
import { BATTLES, battleById } from '../data/battles.js';
import { TROOPS } from '../data/troops.js';
import { BattleMap, T } from '../game/map.js';
import { medalFor, objectiveForSide } from '../core/rules.js';
import { audio } from '../core/audio.js';

const mapCache = new Map();
export function getMap(def) {
  if (!mapCache.has(def.id)) mapCache.set(def.id, new BattleMap(def.map, { sand: def.sand, seed: def.id }));
  return mapCache.get(def.id);
}

const TYPE_RGB = { [T.GRASS]: [96, 136, 62], [T.SAND]: [205, 175, 118], [T.MUD]: [92, 70, 48], [T.FOREST]: [52, 88, 42], [T.ROAD]: [156, 128, 88], [T.WATER]: [56, 104, 136], [T.FORD]: [104, 140, 150], [T.BRIDGE]: [130, 98, 62], [T.CLIFF]: [70, 68, 64], [T.WALL]: [120, 92, 60], [T.HOUSE]: [150, 120, 90], [T.SEA]: [40, 80, 112] };

/** 지형도 그리기(전투 선택 화면·미니맵 공용). */
export function paintTerrain(canvas, map) {
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(map.cols, map.rows);
  for (let j = 0; j < map.rows; j++) for (let i = 0; i < map.cols; i++) {
    const t = map.type[j * map.cols + i];
    const hgt = map.heightGrid[j * (map.cols + 1) + i];
    const hx = map.heightGrid[j * (map.cols + 1) + i + 1] - hgt;
    const [r, g, b] = TYPE_RGB[t] ?? TYPE_RGB[T.GRASS];
    const shade = 1 + hgt * 0.025 - hx * 0.12;
    const k = (j * map.cols + i) * 4;
    img.data[k] = r * shade; img.data[k + 1] = g * shade; img.data[k + 2] = b * shade; img.data[k + 3] = 255;
  }
  const tmp = document.createElement('canvas'); tmp.width = map.cols; tmp.height = map.rows;
  tmp.getContext('2d').putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(tmp, 0, 0, canvas.width, canvas.height);
  return ctx;
}

function drawBriefMap(canvas, def, swapped) {
  const map = getMap(def);
  const ctx = paintTerrain(canvas, map);
  const sx = canvas.width / map.W, sz = canvas.height / map.H;
  const P = (x, z) => [(x + map.W / 2) * sx, (z + map.H / 2) * sz];
  // 배치
  const fr = (list, color) => list.forEach(([, name, x, z, code]) => {
    const [px, py] = P(x, z);
    const dir = code === -1 ? Math.PI : code === 1 ? 0 : z < 0 ? Math.PI / 2 : -Math.PI / 2;
    ctx.save(); ctx.translate(px, py); ctx.rotate(dir);
    ctx.fillStyle = color; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 2;
    for (let i = -2; i <= 2; i++) { ctx.fillRect(-10, i * 9 - 3, 16, 7); ctx.strokeRect(-10, i * 9 - 3, 16, 7); }
    ctx.beginPath(); ctx.moveTo(14, -10); ctx.lineTo(26, 0); ctx.lineTo(14, 10); ctx.fill();
    ctx.restore();
    ctx.font = 'bold 24px "Apple SD Gothic Neo",sans-serif'; ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 4; ctx.textAlign = 'center';
    ctx.strokeText(name, px, py + 44); ctx.fillText(name, px, py + 44);
  });
  fr(swapped ? def.fronts.enemy : def.fronts.ally, '#e0503f');
  fr(swapped ? def.fronts.ally : def.fronts.enemy, '#4a7ad8');
  for (const f of def.map.flags ?? []) {
    const [px, py] = P(f.x, f.z);
    const mine = (f.owner === 'ally') !== swapped;
    ctx.fillStyle = mine ? '#e0503f' : '#4a7ad8'; ctx.strokeStyle = '#ffe28a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(px, py, 14 * sx, 0, Math.PI * 2); ctx.globalAlpha = 0.25; ctx.fill(); ctx.globalAlpha = 1; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px - 6, py + 6); ctx.lineTo(px, py - 8); ctx.lineTo(px + 6, py + 6); ctx.closePath(); ctx.fillStyle = '#ffe28a'; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 22px sans-serif'; ctx.lineWidth = 4; ctx.strokeText(f.name, px, py - 18); ctx.fillText(f.name, px, py - 18);
  }
  for (const z of def.map.zones ?? []) {
    const [px, py] = P(z.x, z.z);
    ctx.strokeStyle = '#8fe8ff'; ctx.setLineDash([5, 4]); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, z.r * sx, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#bff0ff'; ctx.font = 'bold 22px sans-serif'; ctx.strokeText(z.name, px, py + z.r * sx + 24); ctx.fillText(z.name, px, py + z.r * sx + 24);
  }
  for (const p of def.objective.persons ?? []) {
    const [px, py] = P(p.x, p.z);
    ctx.fillStyle = '#bff0ff'; ctx.font = 'bold 28px sans-serif'; ctx.strokeText('★', px, py); ctx.fillText('★', px, py);
    ctx.font = 'bold 22px sans-serif'; ctx.strokeText(p.name, px, py + 26); ctx.fillText(p.name, px, py + 26);
  }
}

export function selectScreen(app) {
  const s = app.save;
  const st = app.selected;
  let tab = battleById(st.id)?.mode ?? 'tactical';
  const list = h('div.list.scroll');
  const middle = h('div.brief.scroll');
  const intel = h('div.intel.panel');
  let infoTab = 'history';

  const renderList = () => {
    clear(list);
    for (const b of BATTLES.filter((x) => x.mode === tab)) {
      const r = s.results[b.id];
      const medal = r ? medalFor(r.achievements) : 'none';
      list.append(h('button.bcard', { class: b.id === st.id ? 'bcard on' : 'bcard', on: { click: () => { st.id = b.id; st.swapped = false; audio.play('ui'); render(); } } },
        h('span.num', String(b.id).padStart(2, '0')), h('span', h('b', b.title), h('small', `${b.battle} · ${b.year}`)), h('span', { class: `medal ${medal}`, title: r?.won ? '승리' : '미승리' })));
    }
  };

  const renderMiddle = () => {
    const b = battleById(st.id);
    const swapped = st.swapped && b.mode === 'tactical';
    const me = swapped ? b.armies.enemy : b.armies.ally, them = swapped ? b.armies.ally : b.armies.enemy;
    const total = (a) => a.units.reduce((n, u) => n + u[2], 0);
    const cv = h('canvas', { width: 960, height: 660, 'aria-label': `${b.title} 지형도` });
    drawBriefMap(cv, b, swapped);
    const armyCard = (a, cls, mine) => h(`div.army.panel.${cls}`,
      h('h3', h('b', a.name), h('span', total(a).toLocaleString(), h('small', ' 명'))),
      h('ul', ...a.units.map(([n, k, c]) => h('li', h('span', n, ' ', h('em', `〔${TROOPS[k].name}〕`)), h('span', c.toLocaleString())))),
      h('div.muted', { style: { fontSize: '12px' } }, `지휘관 · ${a.commander}${mine ? ' | 당신이 지휘합니다' : ''}`));
    const ta = total(me), tb = total(them);
    clear(middle).append(
      h('div.brief-head', h('div', h('span.eyebrow', b.mode === 'tactical' ? '전술 역사' : '영웅 무쌍'), h('h2', b.title), h('div.muted', `${b.battle} · ${b.year}`)), h('div.muted', b.place)),
      h('div.mapbox', cv, h('div.legend', h('span', { style: { color: '#ff8a7a' } }, '■ ', me.name), '  ', h('span', { style: { color: '#9ab8ff' } }, '■ ', them.name), '  ▲ 거점')),
      h('div.strength', h('i', { style: { width: `${(ta / (ta + tb)) * 100}%`, background: 'linear-gradient(90deg,#8d2219,#e0503f)', float: 'left' } }), h('i', { style: { width: `${(tb / (ta + tb)) * 100}%`, background: 'linear-gradient(270deg,#1f3f80,#4a7ad8)', float: 'right' } })),
      h('div.armies', armyCard(me, 'ally', true), armyCard(them, 'enemy', false)),
      b.mode === 'tactical'
        ? h('div.sidepick', h('button.btn', { class: !swapped ? 'btn on' : 'btn', on: { click: () => { st.swapped = false; render(); } } }, `${b.armies.ally.name} 지휘 · 권장`), h('button.btn', { class: swapped ? 'btn on' : 'btn', on: { click: () => { st.swapped = true; render(); } } }, `${b.armies.enemy.name} 지휘`))
        : h('div.goal', h('b', `영웅의 역할 · ${b.hero.name} ｜ ${b.hero.trait}`), h('div.muted', `${b.hero.desc}. 지휘관은 당신의 이름과 외형을 유지한 채 이 전투의 영웅 능력을 얻습니다.`)),
      h('div.muted', { style: { fontSize: '13px', lineHeight: 1.7 } },
        h('b', '전선 지휘: '), `${(swapped ? b.fronts.enemy : b.fronts.ally).map(([id, n], i) => (i === 0 ? `당신이 ${n}` : `부장 ${i}이(가) ${n}`)).join(', ')}을(를) 맡습니다. `,
        '부대를 선택하지 않으면 명령은 당신의 전선에 내려집니다. 부대 카드나 전술 지도에서 부대를 선택하면 다른 전선을 넘겨받고, 「부장에게 반환」으로 돌려줄 수 있습니다. ', b.frontNote),
      h('div.muted', { style: { fontSize: '13px' } }, h('b', `지형: ${b.terrain} — `), b.terrainNote),
    );
  };

  const renderIntel = () => {
    const b = battleById(st.id);
    const swapped = st.swapped && b.mode === 'tactical';
    const obj = objectiveForSide(b.objective, swapped);
    const content = h('div.content.scroll');
    const r = s.results[b.id];
    if (infoTab === 'history') {
      content.append(h('h4', '연대와 시대'), h('div', h('b', b.era)), h('div.muted', b.summary),
        h('h4', '교전 세력'), h('div', b.history.forces), h('h4', '개전 이유'), h('div', b.history.cause),
        h('h4', '전투 경과'), h('div', b.history.course), h('h4', '역사적 결과'), h('div', b.history.outcome),
        h('p.muted', { style: { fontSize: '12px' } }, '영웅 능력과 병력 규모는 게임에 맞게 각색했습니다.'));
    } else if (infoTab === 'tactics') {
      content.append(h('div.goal', h('b', '승리 조건'), h('div', obj.text), h('small.muted', b.mode === 'heroic' ? '지휘관이 쓰러지면 패배합니다.' : '지휘관이 쓰러지면 패배합니다. 지휘관은 취약하며 기준 피해의 40%만 줍니다. 병력과 지형으로 승리하세요.')),
        h('h4', '전술'), h('ul', { style: { paddingLeft: '18px', margin: 0 } }, ...b.tactics.map((t) => h('li', t))),
        b.mode === 'heroic' && h('p.muted', '지휘관: 체력 10,000 · 피해 감소 60% · 비전투 시 체력 회복. 소수의 정예 친위대가 함께합니다.'),
        h('h4', '제한 시간'), h('div', `${Math.floor(b.timeLimit / 60)}분${b.timeLimit % 60 ? ` ${b.timeLimit % 60}초` : ''}`));
    } else {
      content.append(h('h4', '전투 업적 5'), ...b.achievements.map((a, i) => h('div.ach-line', { class: r?.achievements?.[i] ? 'ach-line done' : 'ach-line' }, h('span.chk', r?.achievements?.[i] ? '✓' : ''), h('div', h('b', a.name), h('br'), h('small', a.text)), h('span.pts', `${a.pts}점`))),
        r ? h('p.muted', `최고 기록: ${r.won ? '승리' : '미승리'}${r.bestTime ? ` · ${Math.floor(r.bestTime / 60)}분 ${Math.floor(r.bestTime % 60)}초` : ''}`) : h('p.muted', '아직 이 전투에 나서지 않았습니다.'));
    }
    const tabs = h('div.tabs', ...[['history', '역사 배경'], ['tactics', '전술과 목표'], ['ach', '업적']].map(([k, l]) => h('button.btn.small', { class: infoTab === k ? 'btn small primary' : 'btn small', on: { click: () => { infoTab = k; renderIntel(); } } }, l)));
    clear(intel).append(tabs, content, h('div.actions',
      h('button.btn', { on: { click: () => app.go('armory', { back: 'select' }) } }, '무기고'),
      h('button.btn.primary', { on: { click: () => { audio.play('horn'); app.startBattle(st.id, swapped); } } }, '출정!')));
  };

  const tabsEl = h('div.tabs');
  const renderTabs = () => {
    clear(tabsEl).append(...[['tactical', '전술 역사'], ['heroic', '영웅 무쌍']].map(([k, l]) => h('button.btn', { class: tab === k ? 'btn primary' : 'btn', on: { click: () => { tab = k; const first = BATTLES.find((b) => b.mode === k); if (battleById(st.id).mode !== k) { st.id = first.id; st.swapped = false; } render(); } } }, l)));
  };
  const render = () => { renderTabs(); renderList(); renderMiddle(); renderIntel(); };
  const wins = Object.values(s.results).filter((r) => r.won).length;
  const timeline = h('div.timeline.panel', { style: { padding: '12px' } }, tabsEl,
    h('div.muted', { style: { fontSize: '12px', margin: '0 2px 8px' } }, tab === 'tactical' ? '열세의 병력으로 지형을 이용해 승리하세요.' : '소수 정예와 함께 영웅이 되어 적진을 돌파하세요.'),
    list, h('div.muted', { style: { fontSize: '12px', marginTop: '8px' } }, `승리 ${wins} / 20`));
  render();
  return h('section.screen', topbar(app, '전투 선택'), h('div.screen-body.select-body', timeline, middle, intel));
}
