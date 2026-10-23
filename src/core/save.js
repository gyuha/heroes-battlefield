// 저장 데이터. 브라우저 localStorage 에 보관하며, 손상·구버전 데이터는 기본값으로 복구한다.
import { ARMORY } from '../data/weapons.js';

export const SAVE_KEY = 'heroes-battlefield-save-v2';

export const DEFAULT_KEYS = {
  up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', sprint: 'ShiftLeft',
  skillQ: 'KeyQ', skillE: 'KeyE', skillR: 'KeyR', skillY: 'KeyY', musou: 'KeyT', dodge: 'Space',
  formAhead: 'KeyC', attack: 'KeyV', charge: 'KeyZ', hold: 'KeyX', delegate: 'KeyB', selectFront: 'Backquote',
  fBlock: 'KeyF', fCircle: 'KeyG', fWedge: 'KeyH', fSnake: 'BracketLeft', fHollow: 'BracketRight',
  tactical: 'Tab', pause: 'Escape', help: 'F1', perf: 'F3',
};

export const KEY_LABELS = {
  지휘관: { up: '위로 이동', down: '아래로 이동', left: '왼쪽 이동', right: '오른쪽 이동', sprint: '질주', skillQ: '기술 1 (돌진)', skillE: '기술 2 (호)', skillR: '기술 3 (광역)', skillY: '기술 4 (특수)', musou: '무쌍 필살', dodge: '회피' },
  군대: { formAhead: '전방 정렬', attack: '커서 공격', charge: '돌격', hold: '커서 고수', delegate: 'AI 위임 (다시 누르면 회수)', selectFront: '전선 선택' },
  진형: { fBlock: '방진', fCircle: '원진', fWedge: '쐐기진', fSnake: '장사진', fHollow: '공심방진' },
  화면: { tactical: '전술 지도', pause: '일시정지', help: '도움말', perf: '성능 표시' },
};

export const defaults = () => ({
  started: false,
  commander: '새벽', company: '은빛 군단', portrait: 0,
  crest: { division: 'solid', charge: 'star', ordinary: 'none', colors: ['#1f5f5b', '#e8d9a8', '#c9a75a', '#f2e6c4'] },
  equip: { weapon: 'dragonGlaive', armor: 'plateII', helmet: 'kettle', cloak: 'oath', mount: 'foot', barding: 'none' },
  results: {},
  settings: { cinematic: true, autoZoom: true, shake: true, quality: 'auto', damageNumbers: 'all', difficulty: 'normal', volume: 0.6, ui: 'auto' },
  keys: { ...DEFAULT_KEYS },
});

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const BAD = new Set(['__proto__', 'constructor', 'prototype']);
const HEX = /^#[\da-f]{6}$/i;

export function sanitize(input) {
  const s = defaults();
  if (!isObj(input)) return s;
  s.started = input.started === true;
  for (const k of ['commander', 'company']) if (typeof input[k] === 'string' && input[k].trim()) s[k] = input[k].trim().slice(0, 16);
  if (Number.isInteger(input.portrait) && input.portrait >= 0 && input.portrait < 40) s.portrait = input.portrait;
  if (isObj(input.crest)) {
    for (const k of ['division', 'charge', 'ordinary']) if (typeof input.crest[k] === 'string' && /^[\w-]{1,24}$/.test(input.crest[k])) s.crest[k] = input.crest[k];
    if (Array.isArray(input.crest.colors) && input.crest.colors.length === 4 && input.crest.colors.every((c) => HEX.test(c))) s.crest.colors = [...input.crest.colors];
  }
  if (isObj(input.equip)) for (const k of Object.keys(s.equip)) if (ARMORY[k]?.some((o) => o.id === input.equip[k])) s.equip[k] = input.equip[k];
  if (isObj(input.results)) {
    for (const [id, r] of Object.entries(input.results)) {
      if (BAD.has(id) || !isObj(r)) continue;
      s.results[id] = {
        won: r.won === true,
        bestTime: Number.isFinite(r.bestTime) ? r.bestTime : null,
        achievements: Array.isArray(r.achievements) ? r.achievements.slice(0, 5).map(Boolean) : [false, false, false, false, false],
      };
    }
  }
  if (isObj(input.settings)) {
    const st = input.settings;
    for (const k of ['cinematic', 'autoZoom', 'shake']) if (typeof st[k] === 'boolean') s.settings[k] = st[k];
    if (['auto', 'high', 'medium', 'low'].includes(st.quality)) s.settings.quality = st.quality;
    if (['all', 'crit', 'off'].includes(st.damageNumbers)) s.settings.damageNumbers = st.damageNumbers;
    if (['easy', 'normal', 'hard'].includes(st.difficulty)) s.settings.difficulty = st.difficulty;
    if (['auto', 'desktop', 'touch'].includes(st.ui)) s.settings.ui = st.ui;
    if (Number.isFinite(st.volume)) s.settings.volume = Math.min(1, Math.max(0, st.volume));
  }
  if (isObj(input.keys)) for (const k of Object.keys(DEFAULT_KEYS)) if (typeof input.keys[k] === 'string' && /^[\w]{1,20}$/.test(input.keys[k])) s.keys[k] = input.keys[k];
  return s;
}

export function loadSave(storage) {
  try { return sanitize(JSON.parse(storage.getItem(SAVE_KEY))); } catch { return defaults(); }
}

/** 저장 실패(용량 초과·차단)는 false 를 돌려주고 게임은 메모리 상태로 계속된다. */
export function persistSave(storage, data) {
  try { storage.setItem(SAVE_KEY, JSON.stringify(sanitize(data))); return true; } catch { return false; }
}

/** 키 재지정: 이미 쓰는 키를 누르면 두 동작의 키를 서로 바꾼다(원본 동작과 동일). */
export function rebindKey(keys, action, code) {
  const next = { ...keys };
  const other = Object.keys(next).find((k) => k !== action && next[k] === code);
  if (other) next[other] = keys[action];
  next[action] = code;
  return next;
}

export function totalHonor(results, battles) {
  let pts = 0, count = 0;
  for (const b of battles) {
    const r = results[b.id];
    if (!r) continue;
    r.achievements.forEach((ok, i) => { if (ok) { pts += b.achievements[i].pts; count++; } });
  }
  return { pts, count };
}
