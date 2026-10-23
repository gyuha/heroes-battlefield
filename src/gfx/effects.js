// 전투 효과: 불꽃 입자, 베기 궤적, 충격파 고리, 번개, 먼지, 피해 숫자.
import * as THREE from 'three';
import { glowCanvas } from './art.js';

const glowTex = () => { const t = new THREE.CanvasTexture(glowCanvas(64)); t.colorSpace = THREE.SRGBColorSpace; return t; };

export class Effects {
  constructor(scene, quality = 'high') {
    this.scene = scene;
    this.quality = quality;
    const N = quality === 'low' ? 500 : 1600;
    this.N = N;
    this.p = { pos: new Float32Array(N * 3), vel: new Float32Array(N * 3), col: new Float32Array(N * 3), life: new Float32Array(N), max: new Float32Array(N), grav: new Float32Array(N) };
    this.cursor = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.p.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.p.col, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.9, map: glowTex(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    // 고리 풀
    this.rings = [];
    const ringGeo = new THREE.RingGeometry(0.82, 1, 48);
    ringGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 28; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      m.visible = false; scene.add(m); this.rings.push({ m, t: 0, dur: 1 });
    }
    // 베기 궤적 풀
    this.arcs = [];
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: 0xfff1c8, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      m.visible = false; scene.add(m); this.arcs.push({ m, t: 0, dur: 0.25, key: '' });
    }
    // 번개
    this.bolts = [];
    for (let i = 0; i < 8; i++) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(16 * 3), 3));
      const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xcfe9ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending }));
      l.visible = false; l.frustumCulled = false; scene.add(l); this.bolts.push({ l, t: 0 });
    }
    // 섬광
    this.flash = new THREE.PointLight(0xffd08a, 0, 40, 2);
    scene.add(this.flash);
    this.flashT = 0;
    // 먼지
    this.dust = [];
    const dustMat = new THREE.SpriteMaterial({ map: glowTex(), color: 0xb59a74, transparent: true, depthWrite: false, opacity: 0 });
    for (let i = 0; i < (quality === 'low' ? 16 : 48); i++) { const s = new THREE.Sprite(dustMat.clone()); s.visible = false; scene.add(s); this.dust.push({ s, t: 0, dur: 1 }); }
    // 무쌍 오라
    const auraGeo = new THREE.CylinderGeometry(2.2, 3.2, 5, 24, 1, true);
    this.aura = new THREE.Mesh(auraGeo, new THREE.MeshBasicMaterial({ color: 0xffc24a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    scene.add(this.aura);
    this.bubble = new THREE.Mesh(new THREE.SphereGeometry(2.6, 20, 14), new THREE.MeshBasicMaterial({ color: 0x8fd8ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    scene.add(this.bubble);
  }

  spark(x, y, z, { n = 8, color = 0xffd27a, speed = 6, up = 4, life = 0.5, grav = 14, spread = 1 } = {}) {
    if (this.quality === 'low') n = Math.ceil(n / 2);
    const c = new THREE.Color(color);
    for (let k = 0; k < n; k++) {
      const i = this.cursor; this.cursor = (this.cursor + 1) % this.N;
      const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.6);
      this.p.pos[i * 3] = x + (Math.random() - 0.5) * spread; this.p.pos[i * 3 + 1] = y; this.p.pos[i * 3 + 2] = z + (Math.random() - 0.5) * spread;
      this.p.vel[i * 3] = Math.cos(a) * s; this.p.vel[i * 3 + 1] = up * (0.5 + Math.random()); this.p.vel[i * 3 + 2] = Math.sin(a) * s;
      this.p.col[i * 3] = c.r; this.p.col[i * 3 + 1] = c.g; this.p.col[i * 3 + 2] = c.b;
      this.p.life[i] = life * (0.6 + Math.random() * 0.6); this.p.max[i] = this.p.life[i]; this.p.grav[i] = grav;
    }
  }

  ring(x, y, z, { r = 6, color = 0xffd27a, dur = 0.6, from = 0.3, opacity = r > 10 ? 0.4 : 0.7 } = {}) {
    const slot = this.rings.find((q) => !q.m.visible) ?? this.rings[0];
    slot.m.position.set(x, y + 0.15, z); slot.m.material.color.set(color); slot.t = 0; slot.dur = dur; slot.r = r; slot.from = from; slot.op = opacity;
    slot.m.visible = true;
  }

  slash(x, y, z, dir, range, arc, color = 0xfff1c8) {
    const slot = this.arcs.find((q) => !q.m.visible) ?? this.arcs[0];
    const full = arc >= Math.PI * 2 - 0.01;
    const key = `${range.toFixed(1)}:${arc.toFixed(2)}`;
    if (slot.key !== key) {
      slot.m.geometry.dispose();
      const g = new THREE.RingGeometry(range * 0.45, range, 28, 1, full ? 0 : -arc / 2, full ? Math.PI * 2 : arc);
      g.rotateX(-Math.PI / 2);
      slot.m.geometry = g; slot.key = key;
    }
    slot.m.position.set(x, y + 1.1, z);
    slot.m.rotation.y = -dir;
    slot.m.material.color.set(color);
    slot.t = 0; slot.dur = full ? 0.35 : 0.22; slot.full = full; slot.m.visible = true;
  }

  bolt(x, y, z) {
    const slot = this.bolts.find((q) => !q.l.visible) ?? this.bolts[0];
    const arr = slot.l.geometry.attributes.position.array;
    for (let i = 0; i < 16; i++) {
      const t = i / 15;
      arr[i * 3] = x + (i ? (Math.random() - 0.5) * 3 * (1 - t) : 0); arr[i * 3 + 1] = y + 40 * (1 - t); arr[i * 3 + 2] = z + (i ? (Math.random() - 0.5) * 3 * (1 - t) : 0);
    }
    slot.l.geometry.attributes.position.needsUpdate = true;
    slot.t = 0; slot.l.visible = true;
    this.lightFlash(x, y + 4, z, 0xbfe0ff, 6);
  }

  lightFlash(x, y, z, color = 0xffd08a, intensity = 4) {
    this.flash.position.set(x, y, z); this.flash.color.set(color); this.flash.intensity = intensity * 60; this.flashT = 0.25;
  }

  puff(x, y, z, { size = 4, dur = 1.1, color = 0xb59a74, n = 3 } = {}) {
    for (let k = 0; k < n; k++) {
      const slot = this.dust.find((q) => !q.s.visible);
      if (!slot) return;
      slot.s.position.set(x + (Math.random() - 0.5) * size, y + 0.6, z + (Math.random() - 0.5) * size);
      slot.s.material.color.set(color);
      slot.size = size * (0.6 + Math.random() * 0.6); slot.t = 0; slot.dur = dur; slot.s.visible = true;
    }
  }

  update(dt, hero, heroY) {
    const p = this.p;
    for (let i = 0; i < this.N; i++) {
      if (p.life[i] <= 0) { if (p.pos[i * 3 + 1] > -50) p.pos[i * 3 + 1] = -100; continue; }
      p.life[i] -= dt;
      p.vel[i * 3 + 1] -= p.grav[i] * dt;
      p.pos[i * 3] += p.vel[i * 3] * dt; p.pos[i * 3 + 1] += p.vel[i * 3 + 1] * dt; p.pos[i * 3 + 2] += p.vel[i * 3 + 2] * dt;
      const k = Math.max(0, p.life[i] / p.max[i]);
      p.col[i * 3] *= 0.985 + 0.015 * k; p.col[i * 3 + 1] *= 0.975 + 0.02 * k; p.col[i * 3 + 2] *= 0.96 + 0.03 * k;
      if (p.life[i] <= 0) p.pos[i * 3 + 1] = -100;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
    for (const r of this.rings) {
      if (!r.m.visible) continue;
      r.t += dt; const k = r.t / r.dur;
      if (k >= 1) { r.m.visible = false; continue; }
      const s = r.r * (r.from + (1 - r.from) * (1 - (1 - k) ** 3));
      r.m.scale.set(s, 1, s); r.m.material.opacity = r.op * (1 - k);
    }
    for (const a of this.arcs) {
      if (!a.m.visible) continue;
      a.t += dt; const k = a.t / a.dur;
      if (k >= 1) { a.m.visible = false; continue; }
      a.m.material.opacity = (a.full ? 0.32 : 0.75) * (1 - k); a.m.scale.setScalar(0.85 + 0.25 * k);
    }
    for (const b of this.bolts) { if (!b.l.visible) continue; b.t += dt; b.l.material.opacity = Math.max(0, 1 - b.t / 0.3) * (Math.random() < 0.5 ? 1 : 0.4); if (b.t > 0.3) b.l.visible = false; }
    this.flashT -= dt; if (this.flashT <= 0) this.flash.intensity = 0; else this.flash.intensity *= 0.86;
    for (const d of this.dust) {
      if (!d.s.visible) continue;
      d.t += dt; const k = d.t / d.dur;
      if (k >= 1) { d.s.visible = false; continue; }
      const s = d.size * (0.6 + k); d.s.scale.set(s, s, s); d.s.material.opacity = 0.5 * (1 - k); d.s.position.y += dt * 0.8;
    }
    // 오라·보호막
    if (hero) {
      const musou = hero.state === 'musou';
      this.aura.position.set(hero.x, heroY + 2.4, hero.z);
      this.aura.material.opacity += ((musou ? 0.35 : hero.musouReady ? 0.08 : 0) - this.aura.material.opacity) * Math.min(1, dt * 6);
      this.aura.rotation.y += dt * 2;
      this.aura.visible = this.aura.material.opacity > 0.01;
      this.bubble.position.set(hero.x, heroY + 1.4, hero.z);
      this.bubble.material.opacity += ((hero.shield > 0 ? 0.18 : 0) - this.bubble.material.opacity) * Math.min(1, dt * 6);
      this.bubble.visible = this.bubble.material.opacity > 0.01;
    }
  }
}

/** 피해 숫자(DOM). */
export class DamageNumbers {
  constructor(layer) {
    this.layer = layer;
    this.pool = [];
    for (let i = 0; i < 40; i++) { const d = document.createElement('div'); d.className = 'dmg'; d.style.display = 'none'; layer.appendChild(d); this.pool.push({ d, t: 0, live: false, pos: new THREE.Vector3() }); }
    this._v = new THREE.Vector3();
  }
  add(x, y, z, text, { crit = false, kind = '' } = {}) {
    const s = this.pool.find((p) => !p.live) ?? this.pool[0];
    s.pos.set(x + (Math.random() - 0.5), y, z + (Math.random() - 0.5)); s.t = 0; s.live = true;
    s.d.textContent = text; s.d.className = `dmg${crit ? ' crit' : ''}${kind ? ' ' + kind : ''}`; s.d.style.display = 'block';
  }
  update(dt, camera, w, h) {
    for (const s of this.pool) {
      if (!s.live) continue;
      s.t += dt;
      if (s.t > 0.95) { s.live = false; s.d.style.display = 'none'; continue; }
      this._v.copy(s.pos); this._v.y += s.t * 3;
      this._v.project(camera);
      if (this._v.z > 1) { s.d.style.display = 'none'; continue; }
      s.d.style.display = 'block';
      s.d.style.transform = `translate(${((this._v.x + 1) / 2) * w}px, ${((1 - this._v.y) / 2) * h}px) translate(-50%,-50%) scale(${s.t < 0.12 ? 1.6 - s.t * 5 : 1})`;
      s.d.style.opacity = String(Math.min(1, (0.95 - s.t) * 4));
    }
  }
  clear() { for (const s of this.pool) { s.live = false; s.d.style.display = 'none'; } }
}
