// 진입점: 저장 데이터를 읽고, 공용 렌더러와 메뉴 배경을 띄운 뒤 화면을 전환한다.
import './ui/styles.css';
import { Stage } from './gfx/stage.js';
import { MenuScene } from './gfx/menuScene.js';
import { loadSave, persistSave } from './core/save.js';
import { audio } from './core/audio.js';
import { $, clear, toast } from './ui/dom.js';
import { titleScreen, commanderScreen, armoryScreen, openSettings } from './ui/menus.js';
import { selectScreen } from './ui/select.js';
import { openCodex } from './ui/codex.js';
import { resultScreen } from './ui/result.js';
import { BattleView } from './ui/battleView.js';

class App {
  constructor() {
    this.save = loadSave(localStorage);
    this.stage = new Stage($('#world'));
    this.stage.setQuality(this.save.settings.quality);
    audio.setVolume(this.save.settings.volume);
    this.menu = null;
    this.battleView = null;
    this.selected = { id: 1, swapped: false, tab: 'tactical' };
    this.last = performance.now();
    addEventListener('pointerdown', () => audio.ensure(), { once: false });
    addEventListener('keydown', () => audio.ensure());
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  persist() { if (!persistSave(localStorage, this.save)) toast('저장 공간을 쓸 수 없어 진행 상황이 이번 세션에만 유지됩니다.'); }

  ensureMenuScene() {
    if (!this.menu) this.menu = new MenuScene(this.save);
  }
  refreshMenuScene() { this.menu?.dispose(); this.menu = null; this.ensureMenuScene(); }

  loop(now) {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.battleView) this.battleView.frame(dt);
    else if (this.menu) { this.menu.update(dt, this.stage.camera); this.stage.render(this.menu.scene); }
    requestAnimationFrame(this.loop);
  }

  /** 화면 전환. name: title | commander | armory | select | result */
  go(name, args = {}) {
    const root = clear($('#app'));
    clear($('#modal-root'));
    if (name !== 'battle' && this.battleView) { this.battleView.dispose(); this.battleView = null; }
    if (name !== 'battle') this.ensureMenuScene();
    const screens = { title: titleScreen, commander: commanderScreen, armory: armoryScreen, select: selectScreen, result: resultScreen };
    root.append(screens[name](this, args));
    this.current = name;
    document.body.dataset.screen = name;
  }

  openCodex(tab) { return openCodex(this, tab); }
  openSettings(opts) { return openSettings(this, opts); }

  startBattle(id = this.selected.id, swapped = this.selected.swapped) {
    clear($('#app')); clear($('#modal-root'));
    this.menu?.dispose(); this.menu = null;
    document.body.dataset.screen = 'battle';
    this.battleView = new BattleView(this, id, swapped);
    this.current = 'battle';
  }

  endBattle(summary) {
    const bv = this.battleView;
    this.battleView = null;
    bv?.dispose();
    this.go('result', summary);
  }
}

const app = new App();
window.__app = app; // 검증·디버깅용
setTimeout(() => { $('#loading').classList.add('hide'); app.go('title'); }, 300);
