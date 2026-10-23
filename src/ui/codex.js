// 전장 도감: 병종 · 무기와 기술 · 지형 · 전투 · 업적.
import { h, clear, modal } from './dom.js';
import { TROOPS, TROOP_ORDER, CLASS_INFO, reachMeters, rangeMeters } from '../data/troops.js';
import { WEAPON_TYPES, WEAPON_ORDER } from '../data/weapons.js';
import { BATTLES, TERRAIN_CODEX } from '../data/battles.js';
import { totalHonor } from '../core/save.js';

const TABS = [['troops', '병종'], ['weapons', '무기와 기술'], ['terrain', '지형'], ['battles', '전투'], ['achievements', '업적']];

export function openCodex(app, tab = 'troops') {
  let cur = tab, idx = 0, troopFilter = 'all', battleFilter = 'all', achFilter = 'all';
  const tabsEl = h('div.codex-tabs', { role: 'tablist' });
  const listEl = h('div.codex-list.scroll');
  const detail = h('div.codex-detail.scroll');
  const titleEl = h('h2');
  const render = () => {
    titleEl.textContent = cur === 'achievements' ? '영웅의 업적' : '전장 도감';
    clear(tabsEl).append(...TABS.map(([k, l]) => h('button.btn.small', { role: 'tab', 'aria-selected': String(k === cur), class: k === cur ? 'btn small primary' : 'btn small', on: { click: () => { cur = k; idx = 0; render(); } } }, l)));
    clear(listEl); clear(detail);
    ({ troops, weapons, terrain, battles, achievements })[cur]();
  };
  const item = (label, sub, i) => h('button', { class: i === idx ? 'on' : '', on: { click: () => { idx = i; render(); } } }, h('span', label), h('small', sub));

  function troops() {
    const keys = TROOP_ORDER.filter((k) => troopFilter === 'all' || (troopFilter === 'basic' ? TROOPS[k].tier === 1 : TROOPS[k].tier > 1));
    listEl.append(h('div', { style: { display: 'flex', gap: '4px', marginBottom: '4px' } }, ...[['all', '전체'], ['basic', '기본 병종'], ['elite', '정예 병종']].map(([k, l]) => h('button.btn.small', { class: troopFilter === k ? 'btn small primary' : 'btn small', on: { click: () => { troopFilter = k; idx = 0; render(); } } }, l))));
    keys.forEach((k, i) => listEl.append(item(`${CLASS_INFO[TROOPS[k].cls].icon} ${TROOPS[k].name}`, `${'Ⅰ Ⅱ Ⅲ'.split(' ')[TROOPS[k].tier - 1]}급`, i)));
    const t = TROOPS[keys[idx] ?? keys[0]];
    const roster = BATTLES.flatMap((b) => ['ally', 'enemy'].flatMap((s) => b.armies[s].units.filter((u) => TROOPS[u[1]] === t).map((u) => `${b.title} · ${b.armies[s].name} ${u[0]} ${u[2].toLocaleString()}`)));
    detail.append(h('div.eyebrow', `${t.tier}급 · ${CLASS_INFO[t.cls].label}`), h('h3', t.name),
      h('div.stats', h('div', h('b', t.hp), h('small', '병사당 체력')), h('div', h('b', t.dmg), h('small', t.range ? '사격 피해' : '타격 피해')), h('div', h('b', `${Math.round(t.dr * 100)}%`), h('small', '피해 감소')),
        h('div', h('b', t.range ? `${Math.round(rangeMeters(t))}m` : `${reachMeters(t).toFixed(1)}m`), h('small', t.range ? '사거리' : '근접 거리'))),
      h('h4.title-serif', '능력'), h('p', t.ability), h('h4.title-serif', '지휘 요령'), h('p', t.advice), h('h4.title-serif', '약점'), h('p', t.weak),
      h('h4.title-serif', '등장 전투'), roster.length ? h('ul', ...roster.slice(0, 12).map((r) => h('li', r))) : h('p.muted', '이 병종이 배치된 전투가 없습니다.'));
  }
  function weapons() {
    WEAPON_ORDER.forEach((k, i) => listEl.append(item(`${WEAPON_TYPES[k].icon} ${WEAPON_TYPES[k].name}`, '', i)));
    const w = WEAPON_TYPES[WEAPON_ORDER[idx]];
    detail.append(h('div.eyebrow', '무기와 기술'), h('h3', w.name), h('p.muted', '장비는 능력치를 주지 않습니다. 무기 계열이 기술을 정하고, 강함은 전투가 정합니다.'),
      ...['Q', 'E', 'R', 'Y'].map((k) => h('div', h('h4.title-serif', `${k} · ${w.skills[k].name}`), h('p', w.skills[k].desc, h('small.muted', `  재사용 ${w.skills[k].cd}초`)))),
      h('h4.title-serif', `무쌍 · ${w.musou.name}`), h('p', w.musou.desc, ' 게이지가 가득 차면 T 키나 무쌍 버튼을 누르세요. 밀집한 적에게 적중시키면 빠르게 차고, 빗나가면 오르지 않습니다. 한 기술로 같은 적을 여러 번 때려도 한 번만 셉니다.'),
      h('h4.title-serif', '기본 조작'), h('p', '좌클릭 연속 공격(최대 4타) · 우클릭을 길게 눌러 힘 모으기 후 떼면 강공격 · 스페이스 회피(잠깐 무적) · Shift 질주'));
  }
  function terrain() {
    TERRAIN_CODEX.forEach((t, i) => listEl.append(item(t.name, '', i)));
    const t = TERRAIN_CODEX[idx];
    detail.append(h('div.eyebrow', '지형'), h('h3', t.name), h('p', t.text));
  }
  function battles() {
    const arr = BATTLES.filter((b) => battleFilter === 'all' || b.mode === battleFilter);
    listEl.append(h('div', { style: { display: 'flex', gap: '4px', marginBottom: '4px' } }, ...[['all', '전체'], ['tactical', '전술'], ['heroic', '무쌍']].map(([k, l]) => h('button.btn.small', { class: battleFilter === k ? 'btn small primary' : 'btn small', on: { click: () => { battleFilter = k; idx = 0; render(); } } }, l))));
    arr.forEach((b, i) => listEl.append(item(`${String(b.id).padStart(2, '0')} ${b.title}`, b.year, i)));
    const b = arr[idx] ?? arr[0];
    detail.append(h('div.eyebrow', b.era), h('h3', b.title), h('div.muted', `${b.battle} · ${b.place}`),
      h('h4.title-serif', '교전 세력'), h('p', b.history.forces), h('h4.title-serif', '개전 이유'), h('p', b.history.cause),
      h('h4.title-serif', '전투 경과'), h('p', b.history.course), h('h4.title-serif', '역사적 결과'), h('p', b.history.outcome),
      h('button.btn', { on: { click: () => { m.close(); app.selected.id = b.id; app.selected.swapped = false; app.go('select'); } } }, '이 전투 보기'));
  }
  function achievements() {
    const res = app.save.results;
    const hon = totalHonor(res, BATTLES);
    listEl.append(h('div.panel', { style: { padding: '10px', marginBottom: '6px' } }, h('b', { style: { fontSize: '22px', color: 'var(--bronze2)' } }, `${hon.count} / 100`), h('div.muted', `명예 점수 ${hon.pts}점`)));
    const sel = h('select', { 'aria-label': '전투 고르기', on: { change: (e) => { battleFilter = e.target.value; render(); } } }, h('option', { value: 'all' }, '모든 전투'), ...BATTLES.map((b) => h('option', { value: String(b.id), selected: String(b.id) === battleFilter }, `${String(b.id).padStart(2, '0')} ${b.title}`)));
    listEl.append(sel, h('div', { style: { display: 'flex', gap: '4px', marginTop: '6px' } }, ...[['all', '전체'], ['todo', '미달성'], ['done', '달성']].map(([k, l]) => h('button.btn.small', { class: achFilter === k ? 'btn small primary' : 'btn small', on: { click: () => { achFilter = k; render(); } } }, l))));
    for (const b of BATTLES) {
      if (battleFilter !== 'all' && String(b.id) !== battleFilter) continue;
      const r = res[b.id];
      const rows = b.achievements.map((a, i) => ({ a, ok: !!r?.achievements?.[i] })).filter((x) => achFilter === 'all' || (achFilter === 'done' ? x.ok : !x.ok));
      if (!rows.length) continue;
      detail.append(h('h4.title-serif', `${String(b.id).padStart(2, '0')} ${b.title}`),
        ...rows.map(({ a, ok }) => h('div.ach-line', { class: ok ? 'ach-line done' : 'ach-line' }, h('span.chk', ok ? '✓' : ''), h('div', h('b', a.name), h('br'), h('small', a.text)), h('span.pts', `${a.pts}점 · ${ok ? '달성' : '미달성'}`))));
    }
    if (!detail.children.length) detail.append(h('p.muted', '조건에 맞는 업적이 없습니다.'));
  }

  const m = modal(h('div.codex', h('div.codex-head', h('div', h('div.eyebrow', '영웅의 전장 · 전투 연대기'), titleEl), h('button.btn', { 'aria-label': '도감 닫기', on: { click: () => m.close() } }, '돌아가기')), tabsEl, h('div.codex-main', listEl, detail)), { wide: true, title: '전장 도감' });
  render();
  return m;
}
