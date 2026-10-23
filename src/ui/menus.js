// 메뉴 화면: 타이틀, 지휘관과 군기, 무기고, 설정·키 설정.
import { h, modal, seg, toggle, toast, keyName, clear } from './dom.js';
import { portraitURL, crestURL, portraitInfo, drawCrest, DIVISIONS, ORDINARIES, CHARGES, PRESETS } from '../gfx/art.js';
import { Preview3D } from '../gfx/preview.js';
import { ARMORY, ARMORY_LABELS, WEAPON_TYPES, weaponTypeOf } from '../data/weapons.js';
import { BATTLES } from '../data/battles.js';
import { KEY_LABELS, DEFAULT_KEYS, rebindKey, totalHonor, defaults } from '../core/save.js';
import { audio } from '../core/audio.js';

export function topbar(app, title, extra = []) {
  return h('header.topbar',
    h('div.seal', '戰'),
    h('h1', title),
    h('div.spacer'),
    ...extra,
    h('button.btn.ghost', { on: { click: () => app.openCodex() } }, '전장 도감'),
    h('button.btn.ghost', { on: { click: () => app.openCodex('achievements') } }, '업적'),
    h('button.btn.ghost', { on: { click: () => app.openSettings() } }, '설정'),
    h('button.btn', { on: { click: () => app.go('title') } }, '처음으로'),
  );
}

export function titleScreen(app) {
  const s = app.save;
  const wins = Object.values(s.results).filter((r) => r.won).length;
  const honor = totalHonor(s.results, BATTLES);
  const first = !s.started;
  const go = (fn) => () => { audio.play('ui'); fn(); };
  return h('section.title-screen',
    h('div.title-left',
      h('div.seal', '戰'),
      h('div', h('div.eyebrow', '스무 개의 역사 전투'), h('h1.game-title', '영웅의 전장')),
      h('p.game-sub', '당신의 군기를 들고, 역사의 전장을 다시 쓰십시오.'),
      h('nav.menu-list', { 'aria-label': '주 메뉴' },
        h('button.btn.primary', { on: { click: go(() => (first ? app.go('commander', { first: true }) : app.go('select'))) } }, first ? '군기를 들어라' : '출정하기', h('small', '전술 10 · 무쌍 10')),
        h('button.btn', { on: { click: go(() => app.go('commander')) } }, '지휘관과 군기', h('small', '이름 · 문장 · 초상')),
        h('button.btn', { on: { click: go(() => app.go('armory', { back: 'title' })) } }, '무기고', h('small', '무기 · 갑옷 · 탈것')),
        h('button.btn', { on: { click: go(() => app.openCodex()) } }, '전장 도감', h('small', '병종 · 기술 · 지형 · 전투')),
        h('button.btn', { on: { click: go(() => app.openCodex('achievements')) } }, '업적', h('small', `${honor.count} / 100`)),
        h('button.btn', { on: { click: go(() => app.openSettings()) } }, '설정', h('small', '연출 · 화질 · 키')),
      ),
      h('div.nameplate.panel',
        h('img', { src: portraitURL(s.portrait, 128), alt: '지휘관 초상' }),
        h('img.crest', { src: crestURL(s.crest, 92), alt: '군기 문장' }),
        h('div', h('b', s.company), h('div.muted', `지휘관 · ${s.commander}`), h('small.muted', `승리 ${wins} / 20 · 명예 ${honor.pts}점`)),
      ),
    ),
    h('div.title-hint', 'WASD 이동 · 마우스 조준/공격 · Q E R Y 기술 · T 무쌍 · 휠 확대/축소', h('br'), 'Tab 전술 지도 · C V Z X 군대 명령 · Esc 일시정지'),
  );
}

// ───────── 지휘관과 군기 ─────────
export function commanderScreen(app, { first = false } = {}) {
  const s = app.save;
  const draft = { commander: s.commander, company: s.company, portrait: s.portrait, crest: { ...s.crest, colors: [...s.crest.colors] } };
  const crestCv = h('canvas', { width: 220, height: 246, style: { width: '170px' } });
  const preview = h('canvas.preview3d');
  let prev = null;
  const nameB = h('b'), compB = h('div.muted');
  const redraw = () => {
    drawCrest(crestCv, draft.crest);
    nameB.textContent = draft.commander || '이름 없는 지휘관';
    compB.textContent = draft.company || '군기를 기다리는 군단';
    prev?.set(s.equip, draft.crest.colors);
  };
  const sel = (obj, key, cur, onChange) => h('select', { on: { change: (e) => { onChange(e.target.value); redraw(); } } },
    ...Object.entries(obj).map(([k, v]) => h('option', { value: k, selected: k === cur }, typeof v === 'string' ? v : v.name)));
  const colorInputs = draft.crest.colors.map((c, i) => h('input', { type: 'color', value: c, 'aria-label': ['바탕색', '둘째 바탕색', '문양색', '그림색'][i], on: { input: (e) => { draft.crest.colors[i] = e.target.value; redraw(); } } }));
  const form = h('div.forge-form.panel.scroll',
    h('div.eyebrow', '나의 군기, 나의 이야기'),
    h('h2.title-serif', { style: { margin: '0 0 4px' } }, '지휘관 등록'),
    h('div.field', h('label', { for: 'f-name' }, '지휘관 이름'), h('input#f-name', { type: 'text', maxlength: 16, value: draft.commander, placeholder: '지휘관 이름을 입력하세요', on: { input: (e) => { draft.commander = e.target.value; redraw(); } } })),
    h('div.field', h('label', { for: 'f-comp' }, '군단 이름'), h('input#f-comp', { type: 'text', maxlength: 16, value: draft.company, placeholder: '군단·근위대·연대 이름', on: { input: (e) => { draft.company = e.target.value; redraw(); } } })),
    h('div.field', h('label', '방패 분할'), sel(DIVISIONS, 'division', draft.crest.division, (v) => (draft.crest.division = v))),
    h('div.field', h('label', '문장 그림'), sel(CHARGES, 'charge', draft.crest.charge, (v) => (draft.crest.charge = v))),
    h('div.field', h('label', '기하 문양'), sel(ORDINARIES, 'ordinary', draft.crest.ordinary, (v) => (draft.crest.ordinary = v))),
    h('div.colors', ...['바탕색', '둘째 바탕색', '문양색', '그림색'].map((l, i) => h('label', colorInputs[i], l))),
    h('div.presets', ...PRESETS.map((p) => h('button.btn.small', { on: { click: () => { draft.crest.colors = [...p.colors]; p.colors.forEach((c, i) => (colorInputs[i].value = c)); redraw(); } } }, p.name)),
      h('button.btn.small', { on: { click: () => {
        const keys = Object.keys(CHARGES), divs = Object.keys(DIVISIONS), ords = Object.keys(ORDINARIES);
        const rnd = (a) => a[Math.floor(Math.random() * a.length)];
        draft.crest.charge = rnd(keys); draft.crest.division = rnd(divs); draft.crest.ordinary = rnd(ords);
        draft.crest.colors = draft.crest.colors.map(() => `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')}`);
        colorInputs.forEach((c, i) => (c.value = draft.crest.colors[i]));
        form.querySelectorAll('select').forEach((x, i) => (x.value = [draft.crest.division, draft.crest.charge, draft.crest.ordinary][i]));
        redraw();
      } } }, '무작위')),
    h('small.muted', '네 가지 색을 각각 정할 수 있습니다. 둘째 바탕색은 분할된 방패에, 문양색은 기하 문양에 쓰입니다.'),
  );
  // 초상화
  const bigP = h('img', { alt: '선택한 초상' });
  const pName = h('b');
  const grid = h('div.portrait-grid.scroll', { role: 'listbox', 'aria-label': '초상화 목록' });
  let filter = 'all';
  const fillGrid = () => {
    clear(grid);
    for (let i = 0; i < 40; i++) {
      const info = portraitInfo(i);
      if (filter === 'm' && info.female) continue;
      if (filter === 'f' && !info.female) continue;
      grid.append(h('button', { role: 'option', 'aria-label': info.name, class: i === draft.portrait ? 'on' : '', 'aria-selected': String(i === draft.portrait), on: { click: () => { draft.portrait = i; setP(); fillGrid(); } } }, h('img', { src: portraitURL(i, 96), alt: '' })));
    }
  };
  const setP = () => { bigP.src = portraitURL(draft.portrait, 192); pName.textContent = portraitInfo(draft.portrait).name; };
  const portraits = h('div.portraits.panel',
    h('h3.title-serif', { style: { margin: 0 } }, '초상 선택'),
    h('div.portrait-sel', bigP, h('div', pName, h('div.muted', { style: { fontSize: '13px' } }, '초상은 지휘관 명패와 전장 체력판에 표시됩니다.'))),
    seg([['all', '전체 40'], ['m', '남성 24'], ['f', '여성 16']], 'all', (v) => { filter = v; fillGrid(); }),
    grid,
  );
  const save = () => {
    s.commander = draft.commander.trim() || '새벽';
    s.company = draft.company.trim() || '은빛 군단';
    s.portrait = draft.portrait; s.crest = draft.crest; s.started = true;
    app.persist(); app.refreshMenuScene();
    toast('군기를 높이 들었습니다!');
    app.go(first ? 'select' : 'title');
  };
  const center = h('div.stagecard.panel', preview, h('div.banner', crestCv, nameB, compB),
    h('div', { style: { display: 'flex', gap: '8px' } }, h('button.btn', { on: { click: () => app.go('armory', { back: 'commander' }) } }, '장비 변경'), h('button.btn.primary', { on: { click: save } }, first ? '군기를 들고 출정' : '저장하고 돌아가기')));
  const screen = h('section.screen', topbar(app, '지휘관과 군기'), h('div.screen-body.forge-body', form, center, portraits));
  requestAnimationFrame(() => { prev = new Preview3D(preview); redraw(); });
  setP(); fillGrid(); redraw();
  observeRemoval(screen, () => prev?.dispose());
  return screen;
}

/** 화면이 DOM 에서 빠지면 정리 함수 실행. */
export function observeRemoval(el, fn) {
  const mo = new MutationObserver(() => { if (!el.isConnected) { mo.disconnect(); fn(); } });
  requestAnimationFrame(() => mo.observe(document.body, { childList: true, subtree: true }));
}

// ───────── 무기고 ─────────
export function armoryScreen(app, { back = 'title' } = {}) {
  const s = app.save;
  const draft = { ...s.equip };
  const canvas = h('canvas.preview3d');
  let prev = null;
  const skills = h('div.skill-table');
  const showSkills = () => {
    clear(skills);
    const w = WEAPON_TYPES[weaponTypeOf(draft.weapon)];
    skills.append(h('kbd', '좌'), h('span', '연속 공격 (최대 4타)'), h('kbd', '우'), h('span', '힘 모으기 — 길게 눌렀다 떼면 강공격'));
    for (const k of ['Q', 'E', 'R', 'Y']) skills.append(h('kbd', k), h('span', h('b', w.skills[k].name), ' — ', w.skills[k].desc));
    skills.append(h('kbd', 'T'), h('span', h('b', w.musou.name), ' — ', w.musou.desc), h('kbd', '␣'), h('span', '회피 (무적 구르기)'));
  };
  const groups = h('div.equip-groups.panel.scroll',
    h('div.eyebrow', '무기고'), h('h2.title-serif', { style: { margin: 0 } }, '출정 준비'),
    h('p.muted', { style: { margin: 0, fontSize: '13px' } }, '무기 계열이 기술을 정합니다: 검과 방패, 대검, 장병기, 활·쇠뇌, 법구. 같은 계열의 장비끼리는 능력치 차이가 없으며 체력·피해·방어는 전투가 정합니다. 화폐나 해금 없이 자유롭게 조합하세요.'),
    ...Object.keys(ARMORY).map((cat) => h('div', h('h3', ARMORY_LABELS[cat]), h('div.chips', ...ARMORY[cat].map((it) => h('button.chip', { class: draft[cat] === it.id ? 'chip on' : 'chip', on: { click: (e) => {
      draft[cat] = it.id;
      e.target.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.remove('on')); e.target.classList.add('on');
      prev?.set(draft, s.crest.colors); showSkills();
    } } }, it.name + (it.type ? ` · ${WEAPON_TYPES[it.type].name}` : '')))))),
    h('div', h('h3', '기술 구성'), skills),
  );
  const left = h('div.stagecard.panel', canvas,
    h('div', { style: { display: 'flex', gap: '8px' } }, h('button.btn', { 'aria-label': '왼쪽으로 회전', on: { click: () => prev?.rotate(-0.8) } }, '↶ 회전'), h('button.btn', { 'aria-label': '오른쪽으로 회전', on: { click: () => prev?.rotate(0.8) } }, '회전 ↷')),
    h('div.banner', h('b', s.commander), h('div.muted', s.company)),
    h('div', { style: { display: 'flex', gap: '8px' } },
      h('button.btn', { on: { click: () => app.go(back === 'battle' ? 'select' : back) } }, '변경 취소'),
      h('button.btn.primary', { on: { click: () => { s.equip = draft; app.persist(); app.refreshMenuScene(); toast('장비를 갖췄습니다.'); app.go(back === 'battle' ? 'select' : back); } } }, '장착하고 돌아가기')),
    h('small.muted', '외형은 모든 전투에 이어지며 전장의 지휘관에게 그대로 적용됩니다.'),
  );
  const screen = h('section.screen', topbar(app, '무기고'), h('div.screen-body.armory-body', left, groups));
  requestAnimationFrame(() => { prev = new Preview3D(canvas); prev.set(draft, s.crest.colors); });
  showSkills();
  observeRemoval(screen, () => prev?.dispose());
  return screen;
}

// ───────── 설정 ─────────
export function openSettings(app, { inBattle = false, onChange } = {}) {
  const st = app.save.settings;
  const set = (k, v) => { st[k] = v; app.persist(); onChange?.(k, v); };
  const body = h('div',
    h('h2', '설정'),
    row('연출 카메라', '주요 상황에서 자동 확대·축소와 슬로모션을 연출합니다.', toggle(st.cinematic, (v) => set('cinematic', v), '연출 카메라')),
    row('자동 거리 조절', '적에게 둘러싸이거나 질주하면 시야를 넓히고, 힘을 모으면 다가갑니다.', toggle(st.autoZoom, (v) => set('autoZoom', v), '자동 거리 조절')),
    row('화면 흔들림', '돌격·강공격 때 화면을 흔듭니다.', toggle(st.shake, (v) => set('shake', v), '화면 흔들림')),
    row('효과 품질', '그림자와 입자 수를 조절합니다. 전투를 다시 시작하면 적용됩니다.', seg([['auto', '자동'], ['high', '높음'], ['medium', '중간'], ['low', '낮음']], st.quality, (v) => { set('quality', v); app.stage.setQuality(v); })),
    row('피해 숫자', '', seg([['all', '전체'], ['crit', '치명타만'], ['off', '끄기']], st.damageNumbers, (v) => set('damageNumbers', v))),
    row('난이도', '지휘관이 받는 피해가 달라집니다.', seg([['easy', '쉬움'], ['normal', '보통'], ['hard', '어려움']], st.difficulty, (v) => set('difficulty', v))),
    row('음량', '', h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: st.volume, 'aria-label': '음량', on: { input: (e) => { set('volume', +e.target.value); audio.setVolume(+e.target.value); } } })),
    row('인터페이스', '자동은 화면과 기기에 맞춰 고릅니다. 모바일 가로는 터치 이동·기술·군대 조작을 켭니다.', seg([['auto', '자동'], ['desktop', '데스크톱'], ['touch', '모바일 가로']], st.ui, (v) => set('ui', v))),
    h('div', { style: { display: 'flex', gap: '8px', marginTop: '16px', flexWrap: 'wrap' } },
      h('button.btn', { on: { click: () => openKeybinds(app) } }, '키 설정'),
      !inBattle && h('button.btn.ghost', { on: { click: () => { if (confirm('모든 진행 상황과 설정을 지우고 처음부터 시작할까요?')) { Object.assign(app.save, defaults()); app.persist(); app.refreshMenuScene(); m.close(); app.go('title'); toast('저장 데이터를 초기화했습니다.'); } } } }, '저장 데이터 초기화'),
      h('div', { style: { flex: 1 } }),
      h('button.btn.primary', { on: { click: () => m.close() } }, '완료')),
  );
  const m = modal(body, { title: '설정' });
  return m;
}
function row(label, help, control) { return h('div.row', h('label', label, help && h('small', help)), control); }

export function openKeybinds(app) {
  let waiting = null;
  const list = h('div.keys-list');
  const render = () => {
    clear(list);
    for (const [group, items] of Object.entries(KEY_LABELS)) {
      list.append(h('h4', group));
      for (const [action, label] of Object.entries(items)) {
        const b = h('button.btn.small', { class: waiting === action ? 'btn small wait' : 'btn small', on: { click: () => { waiting = action; render(); } } }, waiting === action ? '키를 누르세요…' : keyName(app.save.keys[action]));
        list.append(h('div.row', h('label', label), b));
      }
    }
    list.append(h('h4', '고정 키'), h('div.row', h('label', '부대 선택 (Shift 추가 선택)'), h('kbd', '1–9')), h('div.row', h('label', '선택 해제 (전선 전체 지휘)'), h('kbd', '0')),
      h('div.row', h('label', '연속 공격 / 힘 모으기'), h('kbd', '좌클릭 / 우클릭')), h('div.row', h('label', '확대 / 축소'), h('kbd', '마우스 휠')));
  };
  const onKey = (e) => {
    if (!waiting) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.code === 'Escape' && waiting !== 'pause') { waiting = null; render(); return; }
    app.save.keys = rebindKey(app.save.keys, waiting, e.code);
    app.persist(); waiting = null; render();
  };
  addEventListener('keydown', onKey, true);
  const m = modal(h('div', h('h2', '키 설정'), h('p.muted', { style: { marginTop: 0, fontSize: '13px' } }, '버튼을 누른 뒤 새 키를 누르세요. 이미 쓰는 키를 누르면 두 동작의 키가 서로 바뀝니다. 설정은 이 브라우저에 저장됩니다.'), list,
    h('div', { style: { display: 'flex', gap: '8px', marginTop: '12px' } }, h('button.btn', { on: { click: () => { app.save.keys = { ...DEFAULT_KEYS }; app.persist(); render(); } } }, '기본값 복원'), h('div', { style: { flex: 1 } }), h('button.btn.primary', { on: { click: () => m.close() } }, '완료'))),
  { title: '키 설정', onClose: () => removeEventListener('keydown', onKey, true) });
  render();
}
