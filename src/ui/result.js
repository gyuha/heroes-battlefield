// 전투 결과 화면: 승패 · 통계 · 업적 달성 · 다음 행동.
import { h } from './dom.js';
import { portraitURL, crestURL } from '../gfx/art.js';
import { battleById } from '../data/battles.js';
import { formatTime, medalFor } from '../core/rules.js';
import { audio } from '../core/audio.js';

export function resultScreen(app, r) {
  const b = battleById(r.battleId);
  const s = app.save;
  const win = r.victory;
  const medal = medalFor(r.achieved);
  const MEDAL = { gold: '금', silver: '은', bronze: '동', none: '없음' };
  setTimeout(() => audio.play(win ? 'victory' : 'defeat'), 200);
  return h('section.result',
    h('div.result-card.panel',
      h('div.eyebrow', `${b.battle} · ${b.year}`),
      h('div.result-top',
        h('img', { src: portraitURL(s.portrait, 192), alt: '지휘관 초상' }),
        h('img', { src: crestURL(s.crest, 110), alt: '군기', style: { width: '76px', height: 'auto', border: 0 } }),
        h('div', h('h1', { class: win ? 'win' : 'lose' }, win ? '승리' : '패배'), h('div', h('b', s.company), ` · 지휘관 ${s.commander}`), h('div.muted', b.title)),
      ),
      h('p', r.reason),
      h('div.tiles',
        h('div.tile', h('b', formatTime(r.elapsed)), h('small', '전투 시간')),
        h('div.tile', h('b', r.heroKills.toLocaleString()), h('small', '직접 격파')),
        h('div.tile', h('b', r.enemyLosses.toLocaleString()), h('small', '적 손실')),
        h('div.tile', h('b', r.survivingAllies.toLocaleString()), h('small', `아군 생존 / ${r.initialAllies.toLocaleString()}`)),
      ),
      h('h3.title-serif', { style: { margin: '6px 0' } }, '전투 업적', h('span', { class: `medal ${medal}`, style: { marginLeft: '10px', verticalAlign: 'middle' } }), h('small.muted', ` ${MEDAL[medal]} 훈장`)),
      ...b.achievements.map((a, i) => h('div.ach-line', { class: r.achieved[i] ? 'ach-line done' : 'ach-line' }, h('span.chk', r.achieved[i] ? '✓' : ''), h('div', h('b', a.name), r.newly?.[i] ? h('span', { style: { color: 'var(--vermilion)', marginLeft: '6px', fontSize: '12px' } }, '새로 달성!') : null, h('br'), h('small', a.text)), h('span.pts', `${a.pts}점`))),
      r.swapped ? h('p.muted', { style: { fontSize: '12px' } }, '권장 진영이 아닌 쪽으로 싸운 전투는 「승리」 업적이 인정되지 않습니다.') : null,
      h('div.actions',
        h('button.btn.primary', { on: { click: () => app.startBattle(r.battleId, r.swapped) } }, '다시 싸우기'),
        h('button.btn', { on: { click: () => app.go('select') } }, '전투 선택'),
        h('button.btn', { on: { click: () => app.go('armory', { back: 'select' }) } }, '장비 변경'),
        h('div', { style: { flex: 1 } }),
        h('button.btn.ghost', { on: { click: () => app.go('title') } }, '처음으로'),
      ),
    ),
  );
}
