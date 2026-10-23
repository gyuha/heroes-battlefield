// 지휘관 미리보기(무기고·지휘관 화면). 별도의 작은 캔버스에 회전하는 지휘관을 그린다.
import * as THREE from 'three';
import { buildCommander } from './models.js';
import { weaponTypeOf } from '../data/weapons.js';

export class Preview3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.r.outputColorSpace = THREE.SRGBColorSpace;
    this.r.setPixelRatio(Math.min(2, devicePixelRatio));
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xfff2dc, 0x2a3a3a, 1.8));
    const key = new THREE.DirectionalLight(0xffe2b0, 2.4); key.position.set(4, 8, 6); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x8fd8ff, 1.2); rim.position.set(-6, 4, -6); this.scene.add(rim);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.4, 0.3, 40), new THREE.MeshLambertMaterial({ color: 0x24403e }));
    disc.position.y = -0.15; this.scene.add(disc);
    this.cam = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    this.angle = 0.6; this.target = 0.6;
    this.model = null;
    this.alive = true;
    const loop = () => { if (!this.alive) return; this.frame(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
  set(equip, colors) {
    if (this.model) { this.scene.remove(this.model); this.model.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); }); }
    this.model = buildCommander({ weaponType: weaponTypeOf(equip.weapon), equip, colors, scale: 1 });
    this.scene.add(this.model);
    this.mounted = equip.mount !== 'foot';
  }
  rotate(d) { this.target += d; }
  frame() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    if (this.canvas.width !== Math.round(w * this.r.getPixelRatio())) { this.r.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); }
    this.target += 0.003;
    this.angle += (this.target - this.angle) * 0.12;
    const cy = this.mounted ? 2.1 : 1.2, d = this.mounted ? 9 : 6.2;
    this.cam.position.set(Math.cos(this.angle) * d, cy + 1.2, Math.sin(this.angle) * d);
    this.cam.lookAt(0, cy, 0);
    if (this.model) {
      const t = performance.now() / 1000;
      this.model.userData.rider.position.y = (this.mounted ? 1.05 : 0) + Math.sin(t * 2) * 0.02;
      if (this.model.userData.cloak) this.model.userData.cloak.rotation.z = 0.15 + Math.sin(t * 1.6) * 0.05;
    }
    this.r.render(this.scene, this.cam);
  }
  dispose() { this.alive = false; this.r.dispose(); this.r.forceContextLoss?.(); }
}
