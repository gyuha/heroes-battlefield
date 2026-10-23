// 작은 DOM 도우미. h('div.cls#id', {attrs, on:{click}}, ...children)
export function h(tag, props = {}, ...children) {
  const m = tag.match(/^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i);
  const el = document.createElement(m?.[1] || 'div');
  for (const part of (m?.[2] ?? '').match(/[.#][\w-]+/g) ?? []) {
    if (part[0] === '.') el.classList.add(part.slice(1)); else el.id = part.slice(1);
  }
  if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) { children.unshift(props); props = {}; }
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k in el && k !== 'list' && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}
function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}
export const clear = (el) => { while (el.firstChild) el.firstChild.remove(); return el; };
export const $ = (sel, root = document) => root.querySelector(sel);

export function toast(text, ms = 2200) {
  const t = $('#toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), ms);
}

/** 모달 열기. 닫힐 때 onClose 호출. */
export function modal(content, { onClose, wide = false, title } = {}) {
  const root = $('#modal-root');
  const box = h(`div.modal${wide ? '.wide' : ''}`, { role: 'dialog', 'aria-modal': 'true', 'aria-label': title ?? '대화 상자' }, content);
  const back = h('div.modal-back', { on: { mousedown: (e) => { if (e.target === back) close(); } } }, box);
  const onKey = (e) => { if (e.code === 'Escape') { e.stopPropagation(); close(); } };
  function close() { back.remove(); removeEventListener('keydown', onKey, true); onClose?.(); }
  addEventListener('keydown', onKey, true);
  root.append(back);
  return { close, box };
}

export function seg(options, value, onChange) {
  const wrap = h('div.seg');
  for (const [v, label] of options) {
    wrap.append(h('button', { type: 'button', class: v === value ? 'on' : '', on: { click: () => { [...wrap.children].forEach((b) => b.classList.remove('on')); wrapBtn(v).classList.add('on'); onChange(v); } } }, label));
  }
  const wrapBtn = (v) => wrap.children[options.findIndex((o) => o[0] === v)];
  return wrap;
}

export function toggle(value, onChange, label) {
  const b = h('button.toggle', { type: 'button', role: 'switch', 'aria-checked': String(value), 'aria-label': label, on: { click: () => { value = !value; b.setAttribute('aria-checked', String(value)); b.classList.toggle('on', value); onChange(value); } } }, h('span'));
  b.classList.toggle('on', value);
  return b;
}

export const keyName = (code) => ({
  Space: '스페이스', ShiftLeft: '왼쪽 Shift', ShiftRight: '오른쪽 Shift', Backquote: '`', BracketLeft: '[', BracketRight: ']', Tab: 'Tab', Escape: 'Esc',
  ControlLeft: '왼쪽 Ctrl', AltLeft: '왼쪽 Alt', Enter: 'Enter', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Minus: '-', Equal: '=',
}[code] ?? code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Arrow/, '방향키 '));
