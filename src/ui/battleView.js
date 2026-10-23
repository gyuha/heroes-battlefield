// 전투 화면 컨트롤러: 입력 → 시뮬레이션 → 카메라 연출 → 렌더 → HUD.
import * as THREE from 'three';
import { h, clear, $, modal, keyName } from './dom.js';
import { openKeybinds } from './menus.js';
import { paintTerrain, getMap } from './select.js';
import { Battle } from '../game/battle.js';
import { BattleRenderer } from '../gfx/battleRenderer.js';
import { CameraDirector, ZOOM_MIN, ZOOM_MAX } from '../gfx/camera.js';
import { DamageNumbers } from '../gfx/effects.js';
import { battleById } from '../data/battles.js';
import { CLASS_INFO } from '../data/troops.js';
import { WEAPON_TYPES } from '../data/weapons.js';
import { FORMATIONS } from '../game/unit.js';
import { portraitURL, crestURL } from '../gfx/art.js';
import { formatTime, evaluateAchievements } from '../core/rules.js';
import { audio } from '../core/audio.js';

const PAGE = 8;
const STATUS = (u) => u.statusText();
const FRONT_LABEL = { main: '본진', lt1: '부장 1', lt2: '부장 2' };

export class BattleView {
  constructor(app, id, swapped) {
    this.app = app;
    this.def = battleById(id);
    this.swapped = swapped && this.def.mode === 'tactical';
    const save = app.save;
    this.settings = save.settings;
    this.battle = new Battle(this.def, { swapped: this.swapped, profile: { commander: save.commander, equip: save.equip }, settings: save.settings, seed: id * 31 + Date.now() % 1000 });
    this.r = new BattleRenderer(app.stage, this.battle, { crest: save.crest, colors: save.crest.colors, equip: save.equip, quality: app.stage.quality });
    this.cam = new CameraDirector(app.stage.camera, save.settings);
    this.cam.setMap(this.battle.map.W, this.battle.map.H);
    this.cam.focus.set(this.battle.hero.x, 0, this.battle.hero.z);
    this.dmg = new DamageNumbers(this.buildDmgLayer());
    this.keys = new Set(); this.pressed = new Set();
    this.mouse = { x: innerWidth / 2, y: innerHeight / 2, l: false, r: false, lPress: false, rPress: false, rRelease: false };
    this.aim = { x: this.battle.hero.x + 10, z: this.battle.hero.z };
    this.paused = false; this.page = 0; this.showCmd = false; this.perf = false;
    this.feed = [];
    this.comboN = 0; this.comboT = 0;
    this.endT = null;
    this.prevHp = 1;
    this.simMs = 0;
    this.buildHud();
    this.bind();
    this.startIntro();
    window.__battle = this.battle; window.__view = this; // 검증용
  }

  // ───────── HUD 구성 ─────────
  buildDmgLayer() { const l = h('div#dmg-layer'); document.body.append(l); return l; }

  buildHud() {
    const save = this.app.save;
    const b = this.battle;
    const w = WEAPON_TYPES[b.hero.wt];
    const el = (this.el = {});
    el.numA = h('span.num.a'); el.numB = h('span.num.b'); el.time = h('div.medallion', '0:00');
    el.balA = h('i.a'); el.balB = h('i.b');
    el.obj = h('div.objective', { role: 'status', 'aria-live': 'polite' });
    el.feed = h('div.feed', { 'aria-live': 'polite' });
    el.zoomOut = h('output', '1.00');
    el.zoomRange = h('input', { type: 'range', min: ZOOM_MIN, max: ZOOM_MAX, step: 0.05, value: 1, 'aria-label': '확대 배율', on: { input: (e) => this.cam.setZoom(+e.target.value) } });
    el.zoomBox = h('div.zoombox.panel', h('span', '배율'), h('button.btn.small', { 'aria-label': '축소', on: { click: () => this.cam.zoomBy(1 / 1.2) } }, '−'), el.zoomRange, h('button.btn.small', { 'aria-label': '확대', on: { click: () => this.cam.zoomBy(1.2) } }, '+'), el.zoomOut);
    el.btnZoom = h('button.btn', { on: { click: () => el.zoomBox.classList.toggle('show') } }, '확대/축소');
    el.btnTac = h('button.btn', { on: { click: () => this.toggleTactical() } }, '전술 지도');
    el.btnCmd = h('button.btn', { on: { click: () => this.toggleCommand() } }, '명령');
    // 지휘관 카드
    el.hp = h('i'); el.hpTxt = h('span'); el.hpG = h('div.gauge.hp', el.hp, el.hpTxt);
    el.mu = h('i'); el.muTxt = h('span', '무쌍'); el.muG = h('div.gauge.mu', el.mu, el.muTxt);
    el.st = h('i'); el.stG = h('div.gauge.st', el.st);
    el.kills = h('span.muted');
    // 기술
    el.sk = {};
    const skill = (k, label, name) => { const cd = h('div.cd'); const node = h('div.sk', { title: name }, h('kbd', label), h('span', name), cd); el.sk[k] = { node, cd }; return node; };
    const kbl = (a) => keyName(save.keys[a]);
    el.skills = h('div.skills.pe-none', skill('L', '좌', '연속 공격'), skill('Rm', '우', '힘 모으기'),
      ...['Q', 'E', 'R', 'Y'].map((k) => skill(k, kbl('skill' + k), w.skills[k].name)), skill('T', kbl('musou'), w.musou.name), skill('D', '␣', '회피'));
    el.combo = h('div.combo');
    // 부대 명부
    el.cards = h('div.cards');
    el.pageInfo = h('span.muted');
    el.speed = h('button.btn.small', { on: { click: () => this.cycleSpeed() } }, '배속 1×');
    el.delegateBack = h('button.btn.small', { on: { click: () => this.cmd('delegateBack') } }, '부장에게 반환');
    el.aiBtn = h('button.btn.small', { on: { click: () => this.cmd('delegate') } }, 'AI 위임');
    el.roster = h('div.roster.panel',
      h('div.bar', h('button.btn.small', { 'aria-label': '이전 쪽', on: { click: () => { this.page = Math.max(0, this.page - 1); this.renderCards(true); } } }, '◀'), el.pageInfo,
        h('button.btn.small', { 'aria-label': '다음 쪽', on: { click: () => { this.page++; this.renderCards(true); } } }, '▶'),
        h('button.btn.small', { on: { click: () => { b.selectFront(); this.renderCards(true); } } }, '전선 선택'), el.delegateBack,
        h('button.btn.small', { on: { click: () => this.cmd('holdHere') } }, '현 위치 고수'), el.aiBtn, h('span.grow'), el.speed),
      el.cards);
    el.cmdLbl = h('span.lbl');
    el.formLbl = h('span.muted', { style: { fontSize: '12px' } });
    const cbtn = (key, label, fn) => h('button.btn.small', { on: { click: fn } }, h('kbd', kbl(key)), ' ', label);
    el.cmdPanel = h('div.command-panel.panel', el.cmdLbl,
      cbtn('formAhead', '전방 정렬', () => this.cmd('formAhead')), cbtn('attack', '공격', () => this.cmd('attack', this.aim)), cbtn('charge', '돌격', () => this.cmd('charge', this.aim)),
      cbtn('hold', '고수', () => this.cmd('holdCursor', this.aim)), cbtn('delegate', 'AI 지휘', () => this.cmd('delegate')),
      ...[['fBlock', 'block'], ['fCircle', 'circle'], ['fWedge', 'wedge'], ['fSnake', 'snake'], ['fHollow', 'hollow']].map(([k, f]) => cbtn(k, FORMATIONS[f], () => this.cmd('formation', { formation: f }))), el.formLbl);
    el.mini = h('canvas', { width: 424, height: 300, 'aria-label': '미니맵 — 누르면 전술 지도' });
    this.miniBase = h('canvas', { width: 424, height: 300 });
    paintTerrain(this.miniBase, b.map);
    el.title = h('div.big-title', h('b', this.def.title), h('span', `${this.def.battle} · ${this.def.year} · ${this.def.place}`), h('small', '아무 키나 누르면 바로 시작합니다'));
    el.call = h('div.banner-call');
    el.danger = h('div.danger');
    el.perf = h('div.perf', { style: { display: 'none' } });
    // 터치
    el.stickKnob = h('i'); el.stick = h('div.stick', el.stickKnob);
    const tb = (label, code, cls = '') => h('button', { class: cls, on: { pointerdown: (e) => { e.preventDefault(); this.touchKey(code, true); }, pointerup: () => this.touchKey(code, false), pointercancel: () => this.touchKey(code, false), pointerleave: () => this.touchKey(code, false) } }, label);
    el.touch = h('div.touch', el.stick, h('div.pad', tb('Q', 'skillQ'), tb('E', 'skillE'), tb('R', 'skillR'), tb('Y', 'skillY'), tb('회피', 'dodge'), tb('무쌍', 'musou'), tb('강공', 'heavy'), tb('명령', 'cmdToggle'), tb('공격', 'attack', 'big'), tb('돌격', 'chargeCmd'), tb('고수', 'holdCmd')));
    this.hud = h('div.hud',
      h('div.hud-plate.panel', h('img', { src: crestURL(save.crest, 64), alt: '' }), h('div', h('b', save.company), h('div.muted', { style: { fontSize: '12px' } }, `${save.commander} · ${this.battle.armyFor('A').name}`))),
      el.feed,
      h('div.scale-wrap', h('div.scale', h('div', { style: { display: 'flex', justifyContent: 'space-between' } }, h('b', { style: { color: '#ffb3a8' } }, '아군'), el.numA), el.time, h('div', { style: { display: 'flex', justifyContent: 'space-between' } }, el.numB, h('b', { style: { color: '#b3c9ff' } }, '적군')), h('div.balance', el.balA, el.balB)), el.obj),
      h('div.hud-tools', h('div.tb', el.btnZoom, h('button.btn', { on: { click: () => this.openPause() } }, '일시정지'), h('button.btn', { 'aria-label': '전체 화면', on: { click: () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.()) } }, '⛶')),
        el.zoomBox, h('div.tb', el.btnCmd, el.btnTac)),
      el.skills,
      h('div.hero-card.panel', h('img', { src: portraitURL(save.portrait, 128), alt: '지휘관' }), h('div', h('div.nm', h('b', save.commander), el.kills), el.hpG, el.muG, el.stG)),
      el.combo, el.cmdPanel, el.roster,
      h('div.minimap.panel', { on: { click: () => this.toggleTactical() } }, el.mini),
      el.title, el.call, el.danger, el.perf, el.touch,
    );
    clear($('#app')).append(this.hud);
    const touch = this.settings.ui === 'touch' || (this.settings.ui === 'auto' && matchMedia('(pointer: coarse)').matches);
    el.touch.classList.toggle('show', touch);
    this.touch = touch;
    this.renderCards(true);
  }

  // ───────── 입력 ─────────
  bind() {
    const keysMap = () => this.app.save.keys;
    this.onKeyDown = (e) => {
      if ($('#modal-root').children.length) return;
      if (this.introActive) { this.skipIntro(); if (e.code !== keysMap().pause) return; }
      const k = keysMap();
      if ([k.tactical, k.dodge, k.help, k.perf, 'Tab', 'Space'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code); this.pressed.add(e.code);
      this.shift = e.shiftKey;
    };
    this.onKeyUp = (e) => { this.keys.delete(e.code); this.shift = e.shiftKey; };
    const canvas = this.app.stage.renderer.domElement;
    this.onMove = (e) => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; };
    this.onDown = (e) => {
      if (e.target !== canvas) return;
      if (this.introActive) { this.skipIntro(); return; }
      if (e.button === 0) { this.mouse.l = true; this.mouse.lPress = true; }
      if (e.button === 2) { this.mouse.r = true; this.mouse.rPress = true; }
      this.shift = e.shiftKey;
    };
    this.onUp = (e) => { if (e.button === 0) this.mouse.l = false; if (e.button === 2) { this.mouse.r = false; this.mouse.rRelease = true; } };
    this.onWheel = (e) => { if (e.target !== canvas) return; e.preventDefault(); this.cam.zoomBy(e.deltaY > 0 ? 1 / 1.12 : 1.12); };
    this.onCtx = (e) => e.preventDefault();
    this.onBlur = () => { this.keys.clear(); this.mouse.l = this.mouse.r = false; };
    addEventListener('keydown', this.onKeyDown);
    addEventListener('keyup', this.onKeyUp);
    addEventListener('pointermove', this.onMove);
    addEventListener('pointerdown', this.onDown);
    addEventListener('pointerup', this.onUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    addEventListener('contextmenu', this.onCtx);
    addEventListener('blur', this.onBlur);
    // 터치 스틱
    this.stickVec = { x: 0, z: 0 };
    const st = this.el.stick;
    const stickMove = (e) => {
      const r = st.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const d = Math.min(1, Math.hypot(dx, dy) / 55);
      const a = Math.atan2(dy, dx);
      this.stickVec = { x: Math.cos(a) * d, z: Math.sin(a) * d };
      this.el.stickKnob.style.transform = `translate(${Math.cos(a) * d * 45}px, ${Math.sin(a) * d * 45}px)`;
    };
    st.addEventListener('pointerdown', (e) => { st.setPointerCapture(e.pointerId); stickMove(e); });
    st.addEventListener('pointermove', (e) => { if (e.buttons) stickMove(e); });
    st.addEventListener('pointerup', () => { this.stickVec = { x: 0, z: 0 }; this.el.stickKnob.style.transform = ''; });
  }

  touchKey(code, down) {
    const k = this.app.save.keys;
    if (code === 'heavy') { this.mouse.r = down; if (down) this.mouse.rPress = true; else this.mouse.rRelease = true; return; }
    if (code === 'attack') { this.mouse.l = down; if (down) this.mouse.lPress = true; return; }
    if (!down) return;
    if (code === 'cmdToggle') return this.toggleCommand();
    if (code === 'chargeCmd') return this.cmd('charge', this.aim);
    if (code === 'holdCmd') return this.cmd('holdCursor', this.aim);
    this.pressed.add(k[code]);
  }

  unbind() {
    removeEventListener('keydown', this.onKeyDown); removeEventListener('keyup', this.onKeyUp);
    removeEventListener('pointermove', this.onMove); removeEventListener('pointerdown', this.onDown); removeEventListener('pointerup', this.onUp);
    this.app.stage.renderer.domElement.removeEventListener('wheel', this.onWheel);
    removeEventListener('contextmenu', this.onCtx); removeEventListener('blur', this.onBlur);
  }

  /** 화면 좌표 → 지면 좌표: 평면 교차 후 높이로 3회 보정(레이캐스트보다 가볍다). */
  screenToGround(sx, sy) {
    const cam = this.app.stage.camera;
    const v = new THREE.Vector3((sx / innerWidth) * 2 - 1, -(sy / innerHeight) * 2 + 1, 0.5).unproject(cam);
    const dir = v.sub(cam.position).normalize();
    let hgt = 0, p = { x: 0, z: 0 };
    for (let i = 0; i < 3; i++) {
      const t = (hgt - cam.position.y) / dir.y;
      p = { x: cam.position.x + dir.x * t, z: cam.position.z + dir.z * t };
      hgt = this.battle.map.heightAt(p.x, p.z);
    }
    return p;
  }

  readInput() {
    const k = this.app.save.keys;
    const down = (a) => this.keys.has(k[a]);
    const press = (a) => this.pressed.has(k[a]);
    const b = this.battle;
    // 전역 키
    if (press('pause')) this.openPause();
    if (press('tactical')) this.toggleTactical();
    if (press('help')) this.openHelp();
    if (press('perf')) { this.perf = !this.perf; this.el.perf.style.display = this.perf ? 'block' : 'none'; }
    for (let d = 1; d <= 9; d++) if (this.pressed.has('Digit' + d)) this.selectCard(d - 1, this.shift);
    if (this.pressed.has('Digit0')) { b.deselect(); this.renderCards(true); }
    if (press('selectFront')) { b.selectFront(); this.renderCards(true); }
    if (press('formAhead')) this.cmd('formAhead');
    if (press('attack')) this.cmd('attack', this.aim);
    if (press('charge')) this.cmd('charge', this.aim);
    if (press('hold')) this.cmd('holdCursor', this.aim);
    if (press('delegate')) this.cmd('delegate');
    for (const [a, f] of [['fBlock', 'block'], ['fCircle', 'circle'], ['fWedge', 'wedge'], ['fSnake', 'snake'], ['fHollow', 'hollow']]) if (press(a)) this.cmd('formation', { formation: f });
    // 조준
    if (this.touch) {
      const e = b.enemyNear(b.hero.x, b.hero.z, 26);
      const sv = this.stickVec;
      if (e) this.aim = { x: e.x, z: e.z };
      else if (Math.hypot(sv.x, sv.z) > 0.2) this.aim = { x: b.hero.x + sv.x * 10, z: b.hero.z + sv.z * 10 };
    } else this.aim = this.screenToGround(this.mouse.x, this.mouse.y);
    // 전술 지도: 좌클릭 선택, 우클릭 명령
    if (this.cam.tactical) {
      if (this.mouse.lPress) {
        const u = this.r.pickUnit(this.mouse.x, this.mouse.y, this.app.stage.camera, innerWidth, innerHeight);
        if (u && u.side === 'A') { b.select(u, this.shift); this.renderCards(true); }
        else if (!this.shift) { b.deselect(); this.renderCards(true); }
      }
      if (this.mouse.rPress) {
        const p = this.aim;
        const enemy = b.enemyNear(p.x, p.z, 14);
        this.cmd(enemy ? 'attack' : 'move', p);
      }
      this.mouse.lPress = this.mouse.rPress = this.mouse.rRelease = false;
      this.pressed.clear();
      return { aim: this.aim, move: { x: 0, z: 0 } };
    }
    let mx = (down('right') ? 1 : 0) - (down('left') ? 1 : 0), mz = (down('down') ? 1 : 0) - (down('up') ? 1 : 0);
    if (this.touch && Math.hypot(this.stickVec.x, this.stickVec.z) > 0.15) { mx = this.stickVec.x; mz = this.stickVec.z; }
    const input = {
      move: { x: mx, z: mz }, aim: this.aim, sprint: down('sprint') || this.keys.has('ShiftRight'),
      attack: this.mouse.lPress || (this.mouse.l && b.hero.state === 'idle'), heavyDown: this.mouse.rPress, heavyHeld: this.mouse.r,
      skillQ: press('skillQ'), skillE: press('skillE'), skillR: press('skillR'), skillY: press('skillY'), musou: press('musou'), dodge: press('dodge'),
    };
    this.mouse.lPress = this.mouse.rPress = this.mouse.rRelease = false;
    this.pressed.clear();
    return input;
  }

  cmd(type, p) {
    const b = this.battle;
    if (!b.commandUnits().length) { this.pushFeed('지휘할 부대가 없습니다.', 'bad'); return; }
    b.command(type, p);
    if (p && (type === 'attack' || type === 'charge' || type === 'holdCursor' || type === 'move')) {
      this.r.fx.ring(p.x, b.map.heightAt(p.x, p.z), p.z, { r: 7, color: type === 'holdCursor' ? 0x8fe8ff : type === 'move' ? 0xffffff : 0xff7a5a, dur: 0.8 });
    }
    if (type === 'formation') this.pushFeed(`진형 변경: ${FORMATIONS[p.formation]}`);
    audio.play('ui');
    this.renderCards(true);
  }

  selectCard(i, add) {
    const us = this.battle.playerUnits();
    const u = us[this.page * PAGE + i];
    if (!u) return;
    this.battle.select(u, add);
    this.renderCards(true);
  }

  toggleTactical(on) {
    const v = this.cam.toggleTactical(on);
    this.el.btnTac.classList.toggle('on', v);
    this.hud.classList.toggle('tactical', v);
    if (v) this.pushFeed('전술 지도: 좌클릭으로 부대 선택(Shift 추가), 우클릭으로 이동·공격 명령');
  }
  toggleCommand() { this.showCmd = !this.showCmd; this.el.cmdPanel.classList.toggle('show', this.showCmd); this.el.btnCmd.classList.toggle('on', this.showCmd); }
  cycleSpeed() { const s = { 1: 2, 2: 0.5, 0.5: 1 }[this.battle.speed]; this.battle.speed = s; this.el.speed.textContent = `배속 ${s}×`; }

  // ───────── 연출 ─────────
  startIntro() {
    const b = this.battle;
    const us = b.units;
    const cx = us.reduce((s, u) => s + u.x, 0) / us.length, cz = us.reduce((s, u) => s + u.z, 0) / us.length;
    this.introActive = true;
    this.el.title.classList.add('show');
    document.body.classList.add('letterbox', 'on');
    this.cam.play('intro', { force: true, priority: 9, dur: 4.6, from: { x: cx, z: cz, dist: Math.max(b.map.W, b.map.H) * 0.9, pitch: 1.18, yaw: 0.55 }, focus: () => ({ x: b.hero.x, y: 0, z: b.hero.z }), zoom: 1, pitch: 1.1, onEnd: () => this.endIntro() });
    audio.play('horn');
  }
  skipIntro() { if (this.introActive) { this.cam.shot = null; this.cam.shotW = 0; this.cam.timeScale = 1; this.endIntro(); } }
  endIntro() {
    if (!this.introActive) return;
    this.introActive = false;
    this.el.title.classList.remove('show');
    document.body.classList.remove('on');
    this.pushFeed(`전투 시작 — ${this.battle.objective.text}`, 'big');
  }

  callout(text, ms = 1600) {
    const c = this.el.call;
    c.textContent = text; c.classList.add('show');
    clearTimeout(this._callT); this._callT = setTimeout(() => c.classList.remove('show'), ms);
  }

  handleEvents() {
    const b = this.battle, cam = this.cam, fx = this.r.fx, H = (x, z) => b.map.heightAt(x, z);
    const dn = this.settings.damageNumbers;
    for (const e of b.events) {
      switch (e.type) {
        case 'log': if (e.time > 0.5) this.pushFeed(e.text, e.kind); break;
        case 'slash': {
          if (e.hits || e.tag !== 'A') fx.slash(e.x, H(e.x, e.z), e.z, e.dir, e.range, e.arc, e.tag === 'T' ? 0xffc24a : e.tag === 'A' ? 0xfff1c8 : 0xbfe8ff);
          if (e.hits) { fx.spark(e.x + Math.cos(e.dir) * e.range * 0.5, H(e.x, e.z) + 1.2, e.z + Math.sin(e.dir) * e.range * 0.5, { n: Math.min(24, 4 + e.hits) }); audio.play('hit'); this.comboN += e.hits; this.comboT = 2; }
          break;
        }
        case 'dmg': if (dn === 'all' || (dn === 'crit' && e.crit)) this.dmg.add(e.x, H(e.x, e.z) + 2.4, e.z, e.kills >= 1 ? `${e.amount.toLocaleString()} · ${Math.round(e.kills)}명` : e.amount.toLocaleString(), { crit: e.crit }); break;
        case 'heroHurt': {
          if (dn !== 'off' && e.amount > b.hero.maxHp * 0.01) this.dmg.add(e.x, H(e.x, e.z) + 3, e.z, `-${Math.round(e.amount)}`, { kind: 'hurt' });
          audio.play('hurt');
          const ratio = b.hero.hp / b.hero.maxHp;
          if (this.prevHp >= 0.3 && ratio < 0.3) { cam.play('danger', { priority: 4, dur: 1.4, zoom: 1.9 * cam.userZoom, pitch: 0.95, focus: () => ({ x: b.hero.x, y: 0, z: b.hero.z }), slowmo: 0.45, slowFor: 0.7 }); this.pushFeed('지휘관이 위험합니다! 물러나 체력을 회복하세요.', 'bad'); }
          this.prevHp = ratio;
          if (e.amount > b.hero.maxHp * 0.04) cam.punch(0.25);
          break;
        }
        case 'swing': audio.play('swing'); break;
        case 'heavy': cam.punch(0.3 + e.ratio * 0.5); audio.play('heavy'); break;
        case 'skill': {
          audio.play('skill');
          if (e.kind === 'area') { cam.punch(0.35); fx.ring(b.hero.x, H(b.hero.x, b.hero.z), b.hero.z, { r: 7, color: 0xbfe8ff }); }
          if (e.kind === 'dash') fx.puff(b.hero.x, H(b.hero.x, b.hero.z), b.hero.z, { size: 3, n: 3 });
          break;
        }
        case 'blastCast': fx.ring(e.x, H(e.x, e.z), e.z, { r: e.r, color: e.fx === 'fire' ? 0xff8a3a : 0x9fd8ff, dur: 0.45, from: 1, opacity: 0.5 }); break;
        case 'blast': {
          const y = H(e.x, e.z);
          if (e.fx === 'thunder') { fx.bolt(e.x, y, e.z); audio.play('thunder'); fx.spark(e.x, y + 1, e.z, { n: 24, color: 0xbfe8ff, speed: 10 }); }
          else if (e.fx === 'arrows') { for (let i = 0; i < 10; i++) b.missiles.push({ sx: e.x + (Math.random() - 0.5) * 12, sz: e.z - 30, sy: y + 40, ex: e.x + (Math.random() - 0.5) * 10, ez: e.z + (Math.random() - 0.5) * 10, ey: y, t: 0, dur: 0.35, arc: 0.02 }); audio.play('arrow'); }
          else { fx.spark(e.x, y + 1, e.z, { n: 30, color: 0xff8a3a, speed: 9, up: 8 }); fx.lightFlash(e.x, y + 2, e.z, 0xff9a4a, 5); audio.play('fire'); }
          fx.ring(e.x, y, e.z, { r: e.r * 1.2, color: e.fx === 'fire' ? 0xffa050 : 0xcfe9ff });
          if (Math.hypot(e.x - b.hero.x, e.z - b.hero.z) < 30) cam.punch(0.25);
          break;
        }
        case 'shoot': audio.play('arrow'); break;
        case 'musou': {
          this.callout(`무쌍 · ${e.name}`, 2200);
          audio.play('musou');
          cam.play('musou', { priority: 6, dur: 1.9, zoom: 2.5, pitch: 0.8, orbit: 0.7, focus: () => ({ x: b.hero.x, y: 1, z: b.hero.z }), slowmo: 0.25, slowFor: 0.75, force: true });
          fx.ring(b.hero.x, H(b.hero.x, b.hero.z), b.hero.z, { r: 14, color: 0xffc24a, dur: 1, opacity: 0.45 });
          fx.spark(b.hero.x, H(b.hero.x, b.hero.z) + 1, b.hero.z, { n: 60, color: 0xffd27a, speed: 12, up: 10 });
          break;
        }
        case 'musouEnd': cam.punch(0.6); fx.ring(b.hero.x, H(b.hero.x, b.hero.z), b.hero.z, { r: 16, color: 0xffe08a, dur: 0.8, opacity: 0.45 }); break;
        case 'heal': fx.spark(e.x, H(e.x, e.z) + 0.5, e.z, { n: 40, color: 0x8affa0, speed: 3, up: 6, grav: -2, life: 1.2, spread: 6 }); break;
        case 'ward': fx.ring(e.x, H(e.x, e.z), e.z, { r: 6, color: 0x8fd8ff }); break;
        case 'clash': if (Math.random() < 0.5) fx.spark(e.x, H(e.x, e.z) + 1.3, e.z, { n: 3, color: 0xffe2a0, speed: 4 }); if (Math.hypot(e.x - b.hero.x, e.z - b.hero.z) < 40) audio.play('clash'); break;
        case 'arrowLand': if (Math.random() < 0.15) fx.puff(e.x, H(e.x, e.z), e.z, { size: 1, dur: 0.5, n: 1 }); break;
        case 'charge': {
          fx.puff(e.x, H(e.x, e.z), e.z, { size: 8, n: 4 });
          if (e.near || e.hero) { cam.punch(e.hero ? 0.8 : 0.5); audio.play('charge'); }
          if (e.hero && cam.play('chargeHit', { priority: 2, dur: 0.9, zoom: 1.6 * cam.userZoom, pitch: 1.0, focus: () => ({ x: b.hero.x, y: 0, z: b.hero.z }), slowmo: 0.5, slowFor: 0.35 })) { /* 근접 돌격에 맞으면 짧게 확대 */ }
          break;
        }
        case 'braceStop': fx.spark(e.x, H(e.x, e.z) + 1.5, e.z, { n: 18, color: 0xffffff, speed: 8 }); if (Math.hypot(e.x - b.hero.x, e.z - b.hero.z) < 50) { this.callout('창벽이 돌격을 막았다!', 1300); cam.punch(0.3); } break;
        case 'flag': {
          const f = e.flag, mine = e.owner === 'A';
          audio.play(mine ? 'flag' : 'flagLost');
          this.callout(mine ? `${f.name} 장악!` : `${f.name} 상실!`);
          cam.play('flag', { priority: 3, dur: 2.2, zoom: 1.35, pitch: 1.0, orbit: 0.25, focus: () => ({ x: f.x, y: 0, z: f.z }), slowmo: 0.6, slowFor: 0.9 });
          fx.ring(f.x, H(f.x, f.z), f.z, { r: 16, color: mine ? 0xff7a5a : 0x5a8aff, dur: 1.2 });
          break;
        }
        case 'flagLocked': this.callout(`${e.flag.name} 점령 완료`); audio.play('flag'); cam.play('flag', { priority: 3, dur: 1.8, zoom: 1.6, pitch: 0.95, orbit: 0.4, focus: () => ({ x: e.flag.x, y: 0, z: e.flag.z }), slowmo: 0.6, slowFor: 0.7 }); break;
        case 'generalDown': {
          this.callout(`적장 ${e.name} 격파!`, 2400);
          audio.play('victory');
          cam.play('general', { priority: 7, dur: 2.6, zoom: 2.4, pitch: 0.78, orbit: 0.5, focus: () => ({ x: e.x, y: 1, z: e.z }), slowmo: 0.25, slowFor: 1.1, force: true });
          fx.ring(e.x, H(e.x, e.z), e.z, { r: 18, color: 0xffd27a, dur: 1.4 });
          break;
        }
        case 'wardJoin': this.callout(`${e.ward.name} 합류`); cam.play('ward', { priority: 3, dur: 1.6, zoom: 1.9, pitch: 0.95, focus: () => ({ x: e.ward.x, y: 0, z: e.ward.z }), slowmo: 0.7, slowFor: 0.6 }); break;
        case 'wardSafe': this.callout(`${e.ward.name} 피난 완료`); audio.play('flag'); break;
        case 'rout': if (e.unit.side === 'B' && Math.hypot(e.unit.x - b.hero.x, e.unit.z - b.hero.z) < 40) fx.puff(e.unit.x, H(e.unit.x, e.unit.z), e.unit.z, { size: 6, n: 2 }); break;
        case 'end': this.onEnd(e); break;
        default: break;
      }
    }
    b.events.length = 0;
  }

  onEnd(e) {
    const b = this.battle, cam = this.cam;
    const win = e.result === 'victory';
    this.callout(win ? '승리!' : '패배', 3200);
    document.body.classList.add('letterbox', 'on');
    if (!win) $('#world').classList.add('desat');
    cam.toggleTactical(false);
    cam.play(win ? 'victory' : 'defeat', { force: true, priority: 10, dur: 4.4, zoom: win ? 2.1 : 2.7, pitch: win ? 0.85 : 0.7, orbit: win ? 0.35 : 0.12, focus: () => ({ x: b.hero.x, y: 1, z: b.hero.z }), slowmo: win ? 0.5 : 0.3, slowFor: 2.5 });
    this.endT = 4.6;
    audio.play(win ? 'victory' : 'defeat');
  }

  finishToResult() {
    const b = this.battle, save = this.app.save;
    const sum = b.summary();
    let achieved = evaluateAchievements(this.def.achievements, sum);
    if (this.swapped) achieved = achieved.map(() => false);
    const prev = save.results[this.def.id] ?? { won: false, bestTime: null, achievements: [false, false, false, false, false] };
    const newly = achieved.map((a, i) => a && !prev.achievements[i]);
    save.results[this.def.id] = {
      won: prev.won || sum.victory,
      bestTime: sum.victory ? Math.min(prev.bestTime ?? Infinity, sum.elapsed) : prev.bestTime,
      achievements: prev.achievements.map((p, i) => p || achieved[i]),
    };
    save.started = true;
    this.app.persist();
    this.app.endBattle({ ...sum, battleId: this.def.id, swapped: this.swapped, achieved, newly, reason: b.resultReason });
  }

  // ───────── 일시정지·도움말 ─────────
  openPause() {
    if (this.paused || this.battle.result) return;
    this.paused = true;
    this.keys.clear();
    const app = this.app;
    const m = modal(h('div',
      h('h2', '일시정지'),
      h('div.pause-menu',
        h('div.col',
          h('button.btn.primary', { on: { click: () => m.close() } }, '계속하기'),
          h('button.btn', { on: { click: () => openKeybinds(app) } }, '키 설정'),
          h('button.btn', { on: { click: () => app.openCodex('troops') } }, '병종 도감'),
          h('button.btn', { on: { click: () => app.openCodex('achievements') } }, '업적'),
          h('button.btn', { on: { click: () => this.openHelp() } }, '조작 도움말'),
          h('button.btn', { on: { click: () => { m.close(); app.startBattle(this.def.id, this.swapped); } } }, '다시 시작'),
          h('button.btn.ghost', { on: { click: () => { m.close(); app.go('select'); } } }, '전투 포기 · 메뉴로'),
        ),
        h('div',
          h('div.goal', h('b', '목표'), h('div', this.battle.objective.text)),
          h('p.muted', { style: { fontSize: '13px' } }, `${this.def.title} — ${this.def.battle}. 지휘관이 쓰러지면 패배합니다.`),
          h('button.btn', { on: { click: () => app.openSettings({ inBattle: true }) } }, '설정 열기 (연출 카메라·화질·피해 숫자 등)'),
        ),
      )), { title: '일시정지', onClose: () => { this.paused = false; this.last = performance.now(); } });
  }

  openHelp() {
    const k = this.app.save.keys, n = (a) => keyName(k[a]);
    const p = (a, b) => h('p', h('span', a), h('kbd', b));
    const wasPaused = this.paused;
    this.paused = true;
    modal(h('div', h('h2', '조작 도움말'), h('div.help-grid',
      h('div', h('h4', '지휘관'), p('이동', `${n('up')}${n('left')}${n('down')}${n('right')}`), p('질주', n('sprint')), p('연속 공격', '좌클릭'), p('힘 모으기 · 강공격', '우클릭 길게'), p('기술', `${n('skillQ')} ${n('skillE')} ${n('skillR')} ${n('skillY')}`), p('무쌍', n('musou')), p('회피', n('dodge'))),
      h('div', h('h4', '군대'), p('전방 정렬', n('formAhead')), p('커서 공격', n('attack')), p('돌격', n('charge')), p('커서 고수', n('hold')), p('AI 위임/회수', n('delegate')), p('전선 선택', n('selectFront')), p('부대 선택', '1–9 (Shift 추가)'), p('선택 해제', '0')),
      h('div', h('h4', '진형 · 화면'), p('방진 / 원진 / 쐐기진', `${n('fBlock')} ${n('fCircle')} ${n('fWedge')}`), p('장사진 / 공심방진', `${n('fSnake')} ${n('fHollow')}`), p('전술 지도', n('tactical')), p('확대 / 축소', '마우스 휠'), p('일시정지', n('pause')), p('성능 표시', n('perf'))),
    ), h('p.muted', { style: { fontSize: '13px' } }, '연출 카메라: 전투 시작·무쌍·거점 점령·적장 격파·위기·승패 때 카메라가 자동으로 확대·축소하고 슬로모션을 겁니다. 설정에서 끌 수 있습니다.')),
    { title: '조작 도움말', onClose: () => { this.paused = wasPaused; } });
  }

  // ───────── HUD 갱신 ─────────
  pushFeed(text, kind = '') {
    const d = h('div', { class: kind }, `${formatTime(this.battle.time)} ${text}`);
    this.el.feed.prepend(d);
    while (this.el.feed.children.length > 6) this.el.feed.lastChild.remove();
    setTimeout(() => d.classList.add('fade'), 7000);
    setTimeout(() => d.remove(), 8400);
  }

  renderCards(force = false) {
    const b = this.battle;
    const us = b.playerUnits().concat(b.units.filter((u) => u.side === 'A' && u.dead && !u.fled));
    const all = b.units.filter((u) => u.side === 'A');
    const pages = Math.max(1, Math.ceil(all.length / PAGE));
    this.page = Math.min(this.page, pages - 1);
    const key = all.map((u) => `${u.id}${Math.round(u.troops)}${u.selected}${u.routing}${u.ai}${u.dead}${STATUS(u)}`).join('|') + this.page;
    if (!force && key === this.cardKey) return;
    this.cardKey = key;
    this.el.pageInfo.textContent = `${this.page + 1} / ${pages} 쪽 · 총 ${all.length}개 부대`;
    clear(this.el.cards);
    all.slice(this.page * PAGE, this.page * PAGE + PAGE).forEach((u, i) => {
      const card = h('button.ucard', { class: `ucard${u.selected ? ' sel' : ''}${u.routing ? ' rout' : ''}${u.dead ? ' dead' : ''}`, 'aria-label': `${i + 1}번 ${u.name}`, on: { click: (e) => { b.select(u, e.shiftKey); this.renderCards(true); } } },
        h('span.tag', { class: u.ai ? 'tag' : 'tag me' }, u.ai ? 'AI' : '직접'),
        h('div', h('span.ic', CLASS_INFO[u.cls].icon), ` ${i + 1} · ${FRONT_LABEL[u.homeFront] ?? ''}`),
        h('b', u.name), h('div.hpb', h('i', { style: { width: `${(u.troops / u.maxTroops) * 100}%` } })),
        h('small.muted', `${Math.round(u.troops)}명 · ${STATUS(u)}`));
      this.el.cards.append(card);
    });
    void us;
    const sel = b.playerUnits().filter((u) => u.selected);
    this.el.cmdLbl.textContent = sel.length ? `명령 대상: 선택한 ${sel.length}개 부대` : `명령 대상: 본진 · ${b.frontsFor('A')[0][1]}`;
    const tgt = b.commandUnits();
    this.el.formLbl.textContent = tgt.length ? `현재 진형: ${FORMATIONS[tgt[0].formation]}` : '';
    this.el.delegateBack.disabled = !sel.some((u) => u.homeFront !== 'main');
    this.el.aiBtn.textContent = tgt.length && tgt.every((u) => u.ai) ? 'AI 회수' : 'AI 위임';
  }

  updateHud(dt) {
    const b = this.battle, el = this.el, hero = b.hero;
    const a = Math.round(b.effective('A')), e = Math.round(b.effective('B'));
    el.numA.textContent = a.toLocaleString(); el.numB.textContent = e.toLocaleString();
    const tot = a + e || 1;
    el.balA.style.width = `${(a / tot) * 100}%`; el.balB.style.width = `${(e / tot) * 100}%`;
    el.time.textContent = formatTime(b.time);
    // 목표
    const o = b.objective, pr = b.objectiveProgress();
    const chips = b.flags.filter((f) => !o.flags || o.flags.includes(f.id)).map((f) => {
      const cls = f.locked ? 'locked' : f.state === 'contested' ? 'contested' : f.owner;
      const st = f.locked ? '점령 완료' : f.state === 'contested' ? '경합' : f.owner === 'A' ? '아군' : f.owner === 'B' ? '적군' : '중립';
      const timer = pr.timers?.[f.id] && !f.locked ? ` ${Math.floor(pr.timers[f.id])}/${o.time}초` : '';
      return `<span class="flagchip ${cls}">⚑ ${f.name} · ${st}${timer}</span>`;
    }).join('');
    let text = '';
    const left = formatTime(b.timeLimit - b.time);
    switch (o.type) {
      case 'holdAny': text = `깃발 사수 남은 시간 <b>${formatTime(pr.remaining)}</b>`; break;
      case 'holdTogether': text = `모든 깃발 함께 유지 <b>${Math.floor(pr.hold)}/${pr.need}초</b>`; break;
      case 'captureEach': text = `점령 <b>${pr.locked}/${pr.total}</b>`; break;
      case 'captureReturn': text = pr.locked >= pr.total ? `<b>지휘관 귀환!</b> ${b.zones.find((z) => z.id === o.zone)?.name}` : `점령 <b>${pr.locked}/${pr.total}</b> 후 귀환`; break;
      case 'rout': text = `적 유효 병력 <b>${Math.round(pr.enemyRatio * 100)}%</b> (20% 미만이면 승리)`; break;
      case 'commander': text = `적장 ${b.general.name} <b>${pr.generalDead ? '격파' : '생존'}</b> · 적 손실 <b>${Math.round(pr.loss * 100)}%</b>/${Math.round(pr.need * 100)}%`; break;
      case 'escort': text = `보호 대상 피난 <b>${pr.safe}/${pr.total}</b>`; break;
      default: break;
    }
    const html = `${text} ${chips} <span class="muted">· 제한 ${left}</span>`;
    if (html !== this._objHtml) { el.obj.innerHTML = html; this._objHtml = html; }
    // 지휘관
    const hr = hero.hp / hero.maxHp;
    el.hp.style.width = `${hr * 100}%`; el.hpTxt.textContent = `${Math.ceil(hero.hp).toLocaleString()} / ${hero.maxHp.toLocaleString()}`;
    el.hpG.classList.toggle('low', hr < 0.3);
    el.mu.style.width = `${hero.musou}%`; el.muG.classList.toggle('full', hero.musouReady);
    el.muTxt.textContent = hero.musouReady ? `무쌍 준비! [${keyName(this.app.save.keys.musou)}]` : '무쌍';
    el.st.style.width = `${hero.stamina}%`;
    el.kills.textContent = `격파 ${Math.round(hero.kills).toLocaleString()}`;
    el.danger.classList.toggle('show', hr < 0.25 && !hero.dead);
    for (const k of ['Q', 'E', 'R', 'Y']) {
      const max = WEAPON_TYPES[hero.wt].skills[k].cd * hero.cooldownMul();
      el.sk[k].cd.style.height = `${(hero.cd[k] / max) * 100}%`;
    }
    el.sk.T.node.classList.toggle('ready-t', hero.musouReady); el.sk.T.node.classList.toggle('dim', !hero.musouReady);
    el.sk.T.cd.style.height = `${100 - hero.musou}%`;
    el.sk.D.node.classList.toggle('dim', hero.stamina < 20);
    el.sk.Rm.cd.style.height = hero.state === 'charge' ? `${100 - (hero.chargeT / 1.2) * 100}%` : '0%';
    // 연격
    this.comboT -= dt;
    if (this.comboT <= 0) this.comboN = 0;
    el.combo.classList.toggle('show', this.comboN >= 5);
    if (this.comboN >= 5) el.combo.innerHTML = `${this.comboN}<small>연격</small>`;
    el.zoomOut.textContent = (this.cam.userZoom).toFixed(2);
    if (document.activeElement !== el.zoomRange) el.zoomRange.value = this.cam.userZoom;
    this.cardTimer = (this.cardTimer ?? 0) - dt;
    if (this.cardTimer <= 0) { this.cardTimer = 0.4; this.renderCards(); }
    this.drawMinimap();
  }

  drawMinimap() {
    const cv = this.el.mini, ctx = cv.getContext('2d'), b = this.battle, map = b.map;
    ctx.drawImage(this.miniBase, 0, 0);
    const sx = cv.width / map.W, sz = cv.height / map.H;
    const P = (x, z) => [(x + map.W / 2) * sx, (z + map.H / 2) * sz];
    for (const u of b.units) {
      if (u.dead) continue;
      const [x, y] = P(u.x, u.z);
      ctx.fillStyle = u.side === 'A' ? (u.routing ? '#7a3a30' : '#ff5a44') : (u.routing ? '#2a3a5a' : '#4a8aff');
      ctx.fillRect(x - u.hw * sx, y - u.hw * sz * 0.6, Math.max(3, u.hw * 2 * sx), Math.max(3, u.hw * 1.2 * sz));
      if (u.selected) { ctx.strokeStyle = '#ffe28a'; ctx.lineWidth = 2; ctx.strokeRect(x - u.hw * sx - 2, y - u.hw * sz * 0.6 - 2, u.hw * 2 * sx + 4, u.hw * 1.2 * sz + 4); }
    }
    for (const f of b.flags) { const [x, y] = P(f.x, f.z); ctx.fillStyle = f.locked ? '#ffd36a' : f.owner === 'A' ? '#ff8a7a' : f.owner === 'B' ? '#8ab0ff' : '#ddd'; ctx.beginPath(); ctx.moveTo(x, y - 9); ctx.lineTo(x + 7, y + 5); ctx.lineTo(x - 7, y + 5); ctx.fill(); }
    for (const z of b.zones) { const [x, y] = P(z.x, z.z); ctx.strokeStyle = '#8fe8ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, z.r * sx, 0, 7); ctx.stroke(); }
    for (const w of b.wards) { const [x, y] = P(w.x, w.z); ctx.fillStyle = '#bff0ff'; ctx.fillRect(x - 4, y - 4, 8, 8); }
    if (!b.general.dead) { const [x, y] = P(b.general.x, b.general.z); ctx.fillStyle = '#9ec0ff'; ctx.beginPath(); ctx.arc(x, y, 6, 0, 7); ctx.fill(); ctx.strokeStyle = '#000'; ctx.stroke(); }
    const [hx, hy] = P(b.hero.x, b.hero.z);
    ctx.fillStyle = '#ffd36a'; ctx.beginPath(); ctx.arc(hx, hy, 7, 0, 7); ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.stroke();
    const v = this.cam.viewRect();
    const [vx, vy] = P(v.x, v.z);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2; ctx.strokeRect(vx - v.hw * sx, vy - v.hh * sz, v.hw * 2 * sx, v.hh * 2 * sz);
  }

  // ───────── 프레임 ─────────
  frame(dt) {
    const b = this.battle;
    const t0 = performance.now();
    const input = this.paused ? {} : this.readInput();
    let simDt = 0;
    if (!this.paused && !this.introActive) {
      simDt = dt * b.speed * this.cam.timeScale;
      let left = simDt;
      while (left > 1e-4) { const step = Math.min(0.04, left); b.update(step, input); left -= step; input.attack = input.heavyDown = input.skillQ = input.skillE = input.skillR = input.skillY = input.musou = input.dodge = false; }
    }
    const t1 = performance.now();
    this.handleEvents();
    const hero = b.hero;
    this.cam.update(dt, {
      hero: { x: hero.x, y: b.map.heightAt(hero.x, hero.z) + 1, z: hero.z },
      crowd: this.paused ? 0 : b.crowdAround(hero.x, hero.z, 14, 'B'), sprinting: hero.sprinting, charge: hero.state === 'charge' ? hero.chargeT / 1.2 : 0,
      hpRatio: hero.hp / hero.maxHp, musou: hero.state === 'musou',
    });
    this.r.update(this.paused ? 0 : dt * b.speed * this.cam.timeScale, this.cam, this.cam.tacticalBlend > 0.5);
    this.app.stage.render(this.r.scene, this.app.stage.camera);
    this.dmg.update(dt, this.app.stage.camera, innerWidth, innerHeight);
    this.updateHud(dt);
    if (this.perf) {
      const info = this.app.stage.renderer.info.render;
      this._fps = (this._fps ?? 60) * 0.95 + (1 / Math.max(dt, 0.001)) * 0.05;
      this.el.perf.textContent = `FPS ${this._fps.toFixed(0)} · 시뮬 ${(t1 - t0).toFixed(1)}ms · 렌더 ${(performance.now() - t1).toFixed(1)}ms · 그리기 ${info.calls} · 병사 ${b.units.reduce((s, u) => s + u.alive, 0)} · 배율 ${this.cam.userZoom.toFixed(2)} · 연출 ${this.cam.shot?.kind ?? '-'}`;
    }
    if (this.endT !== null) {
      this.endT -= dt;
      if (this.endT <= 0) { this.endT = null; this.finishToResult(); }
    }
  }

  dispose() {
    this.unbind();
    this.r.dispose();
    $('#dmg-layer')?.remove();
    document.body.classList.remove('letterbox', 'on');
    $('#world').classList.remove('desat');
    clear($('#app'));
    window.__battle = window.__view = undefined;
  }
}
