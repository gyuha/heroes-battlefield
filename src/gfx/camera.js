// 카메라 연출기. 세 겹으로 구성된다.
//  1) 기본 추적: 지휘관을 따라가며 사용자 배율(휠·슬라이더)에 따라 거리·내려다보는 각을 바꾼다.
//  2) 상황 보정: 힘 모으기·질주·주변 밀집도·저체력에 따라 자동으로 확대/축소한다.
//  3) 연출 샷: 전투 시작·무쌍·거점 점령·적장 격파·승패 등 주요 상황에서 잠시 카메라를 빼앗아 확대·회전·슬로모션을 건다.
import * as THREE from 'three';
import { clamp, lerp } from '../core/rules.js';

export const ZOOM_MIN = 0.45;
export const ZOOM_MAX = 2.6;
const BASE_DIST = 58;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export class CameraDirector {
  constructor(camera, settings) {
    this.cam = camera;
    this.settings = settings;
    this.userZoom = 1;
    this.tactical = false;
    this.tacticalBlend = 0;
    this.focus = new THREE.Vector3();
    this.dist = BASE_DIST;
    this.pitch = 1.05;
    this.yaw = 0;
    this.auto = 1; // 상황 보정 배율
    this.shot = null;
    this.shotW = 0;
    this.shake = 0;
    this.fovKick = 0;
    this.timeScale = 1;
    this.mapSize = { W: 320, H: 220 };
    this._tmp = new THREE.Vector3();
  }

  setMap(W, H) { this.mapSize = { W, H }; }
  setZoom(z) { this.userZoom = clamp(z, ZOOM_MIN, ZOOM_MAX); }
  zoomBy(f) { this.setZoom(this.userZoom * f); }
  toggleTactical(on = !this.tactical) { this.tactical = on; return on; }

  /** 짧은 충격: 화면 흔들림 + 시야각 수축. */
  punch(strength = 0.5) {
    if (this.settings.shake) this.shake = Math.max(this.shake, strength);
    this.fovKick = Math.max(this.fovKick, strength * 6);
  }

  /**
   * 연출 샷 재생. priority 가 낮으면 진행 중인 샷을 덮지 못한다.
   * opts: { focus: () => {x,y,z}, zoom, pitch, orbit(rad/s), dur, slowmo, slowFor, blendIn, blendOut, priority, from }
   */
  play(kind, opts) {
    if (!this.settings.cinematic && !opts.force) return false;
    if (this.shot && (this.shot.priority ?? 1) > (opts.priority ?? 1) && this.shot.t < this.shot.dur) return false;
    this.shot = { kind, t: 0, blendIn: 0.45, blendOut: 0.6, zoom: 2, pitch: 0.95, orbit: 0, slowmo: 1, slowFor: 0, ...opts, yaw0: this.yaw };
    return true;
  }
  stopShot() { if (this.shot) this.shot.t = Math.max(this.shot.t, this.shot.dur - this.shot.blendOut); }
  get inShot() { return !!this.shot; }

  /** ctx: { hero:{x,y,z}, heroState, crowd, sprinting, charge(0~1), hpRatio, dt } */
  update(dt, ctx) {
    const W = this.mapSize.W, H = this.mapSize.H;
    // 1) 기본 추적
    const playFocus = this._tmp.set(ctx.hero.x, ctx.hero.y, ctx.hero.z);
    let auto = 1;
    if (ctx.charge > 0) auto *= 1 + ctx.charge * 0.5; // 힘 모으기: 점점 다가간다(밀집 보정보다 우선)
    else if (this.settings.autoZoom) {
      if (ctx.crowd > 30) auto *= clamp(1 - (ctx.crowd - 30) / 260, 0.78, 1);
      if (ctx.sprinting) auto *= 0.88;
    }
    if (ctx.hpRatio < 0.3) auto *= 1.12;
    if (ctx.musou) auto *= 1.25;
    this.auto = lerp(this.auto, auto, 1 - Math.exp(-dt * 3));
    const z = this.userZoom * this.auto;
    let dist = BASE_DIST / z;
    let pitch = lerp(0.86, 1.32, clamp((dist - 20) / 110, 0, 1));
    let fx = playFocus.x, fy = playFocus.y, fz = playFocus.z;
    let yaw = 0;
    // 전술 지도 블렌드
    this.tacticalBlend = lerp(this.tacticalBlend, this.tactical ? 1 : 0, 1 - Math.exp(-dt * 5));
    if (this.tacticalBlend > 0.001) {
      const k = ease(clamp(this.tacticalBlend, 0, 1));
      // 전장 전체가 화면에 들어오도록 시야각과 화면 비율로 거리를 구한다.
      const tanH = Math.tan(((this.cam.fov / 2) * Math.PI) / 180);
      const tdist = Math.max(W / (2 * tanH * this.cam.aspect), (H * 1.15) / (2 * tanH)) * 1.02;
      fx = lerp(fx, 0, k); fy = lerp(fy, 0, k); fz = lerp(fz, 6, k);
      dist = lerp(dist, tdist, k); pitch = lerp(pitch, 1.48, k);
    }
    // 3) 연출 샷
    let slow = 1;
    if (this.shot) {
      const s = this.shot;
      s.t += dt;
      const wIn = clamp(s.t / s.blendIn, 0, 1), wOut = clamp((s.dur - s.t) / s.blendOut, 0, 1);
      const w = ease(Math.min(wIn, wOut));
      const f = s.focus();
      const sdist = BASE_DIST / s.zoom;
      const syaw = s.yaw0 + s.orbit * s.t;
      if (s.from && s.t < s.dur) {
        // 시작 연출: from(전경) → 지휘관으로 미끄러진다
        const k = ease(clamp(s.t / (s.dur * 0.85), 0, 1));
        fx = lerp(s.from.x, fx, k); fz = lerp(s.from.z, fz, k); fy = lerp(0, fy, k);
        dist = lerp(s.from.dist, dist, k); pitch = lerp(s.from.pitch, pitch, k); yaw = lerp(s.from.yaw ?? 0, 0, k);
      } else {
        fx = lerp(fx, f.x, w); fy = lerp(fy, f.y ?? fy, w); fz = lerp(fz, f.z, w);
        dist = lerp(dist, sdist, w); pitch = lerp(pitch, s.pitch, w); yaw = lerp(yaw, syaw, w);
      }
      if (s.t < s.slowFor) slow = Math.min(slow, s.slowmo);
      else if (s.slowmo < 1 && s.t < s.slowFor + 0.4) slow = Math.min(slow, lerp(s.slowmo, 1, (s.t - s.slowFor) / 0.4));
      this.shotW = w;
      if (s.t >= s.dur) { this.shot = null; this.shotW = 0; s.onEnd?.(); }
    }
    this.timeScale = slow;
    // 부드럽게 따라가기(스프링)
    const k = 1 - Math.exp(-dt * (this.shot ? 7 : 9));
    this.focus.x = lerp(this.focus.x, fx, k); this.focus.y = lerp(this.focus.y, fy, k); this.focus.z = lerp(this.focus.z, fz, k);
    this.dist = lerp(this.dist, dist, 1 - Math.exp(-dt * 6));
    this.pitch = lerp(this.pitch, pitch, 1 - Math.exp(-dt * 6));
    this.yaw = lerp(this.yaw, yaw, 1 - Math.exp(-dt * 6));
    // 흔들림
    this.shake = Math.max(0, this.shake - dt * 1.8);
    this.fovKick = Math.max(0, this.fovKick - dt * 18);
    const sh = this.shake * this.shake * 1.2;
    const t = performance.now() / 1000;
    const ox = Math.sin(t * 53) * sh, oz = Math.cos(t * 47) * sh;
    // 카메라는 남쪽(+z)에서 북쪽을 바라본다(북쪽이 화면 위).
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const dirX = Math.sin(this.yaw) * cp, dirZ = Math.cos(this.yaw) * cp;
    this.cam.position.set(this.focus.x + dirX * this.dist + ox, this.focus.y + sp * this.dist, this.focus.z + dirZ * this.dist + oz);
    this.cam.lookAt(this.focus.x + ox * 0.5, this.focus.y, this.focus.z + oz * 0.5);
    const fov = 42 - this.fovKick;
    if (Math.abs(this.cam.fov - fov) > 0.01) { this.cam.fov = fov; this.cam.updateProjectionMatrix(); }
  }

  /** 현재 화면에 보이는 지면 영역(미니맵 표시용) 근사. */
  viewRect() {
    const h = this.dist * Math.tan(((this.cam.fov / 2) * Math.PI) / 180) * 1.3;
    return { x: this.focus.x, z: this.focus.z, hw: h * this.cam.aspect, hh: h / Math.max(0.4, Math.sin(this.pitch)) };
  }
}
