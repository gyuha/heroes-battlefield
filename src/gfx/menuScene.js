// 메뉴 배경: 해질녘 능선 위에 군기를 든 군대가 늘어선 장면을 천천히 돌며 보여준다.
import * as THREE from 'three';
import { soldierGeometry, teamMaterial, buildCommander, treeGeometry, vertexColorMaterial } from './models.js';
import { crestCanvas } from './art.js';

export class MenuScene {
  constructor(profile) {
    const s = (this.scene = new THREE.Scene());
    s.background = new THREE.Color(0x2a2a3a);
    s.fog = new THREE.Fog(0x6a5060, 60, 260);
    // 노을 하늘(그라데이션 구)
    const skyGeo = new THREE.SphereGeometry(400, 24, 16);
    const cols = [];
    const p = skyGeo.attributes.position;
    const top = new THREE.Color(0x1e2a48), mid = new THREE.Color(0xc0705a), low = new THREE.Color(0xf2c27a);
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) / 400;
      const c = y > 0.25 ? mid.clone().lerp(top, Math.min(1, (y - 0.25) / 0.6)) : low.clone().lerp(mid, Math.max(0, (y + 0.05) / 0.3));
      cols.push(c.r, c.g, c.b);
    }
    skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    s.add(new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false })));
    const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(18, 32), new THREE.MeshBasicMaterial({ color: 0xffe3a0, fog: false }));
    sunDisc.position.set(-120, 30, -330); sunDisc.lookAt(0, 0, 0); s.add(sunDisc);
    s.add(new THREE.HemisphereLight(0xffd6b0, 0x3a3040, 1.4));
    const sun = new THREE.DirectionalLight(0xffc890, 2.6);
    sun.position.set(-80, 40, -100); s.add(sun);
    // 능선 지형
    const g = new THREE.PlaneGeometry(500, 500, 100, 100);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position, gc = [];
    const c1 = new THREE.Color(0x4a5a32), c2 = new THREE.Color(0x6b6a3a);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = 9 * Math.exp(-((z + 10) ** 2) / 900) + Math.sin(x * 0.03) * 3 + Math.cos(z * 0.05 + x * 0.02) * 2 + (z < -80 ? (-80 - z) * 0.35 : 0);
      pos.setY(i, h);
      const c = c1.clone().lerp(c2, (Math.sin(x * 0.1) + 1) / 2);
      gc.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(gc, 3));
    g.computeVertexNormals();
    s.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true })));
    this.heightAt = (x, z) => 9 * Math.exp(-((z + 10) ** 2) / 900) + Math.sin(x * 0.03) * 3 + Math.cos(z * 0.05 + x * 0.02) * 2;
    // 숲
    const tm = vertexColorMaterial();
    const trees = new THREE.InstancedMesh(treeGeometry(0), tm, 160);
    const o = new THREE.Object3D();
    for (let i = 0; i < 160; i++) {
      const a = i * 2.39996, r = 60 + (i % 40) * 3.2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r - 40;
      o.position.set(x, this.heightAt(x, z), z); o.scale.setScalar(1.2 + (i % 5) * 0.2); o.updateMatrix(); trees.setMatrixAt(i, o.matrix);
    }
    s.add(trees);
    // 군대: 아군(붉은)과 멀리 적(푸른)
    const mat = teamMaterial();
    const army = (kind, n, side, cx, cz, cols2, sp) => {
      const m = new THREE.InstancedMesh(soldierGeometry(kind), mat, n);
      for (let i = 0; i < n; i++) {
        const r = Math.floor(i / cols2), c = i % cols2;
        const x = cx + (c - cols2 / 2) * sp + Math.sin(i * 7.1) * 0.3, z = cz + r * sp;
        o.position.set(x, this.heightAt(x, z), z); o.rotation.set(0, side === 'A' ? Math.PI / 2 : -Math.PI / 2, 0); o.scale.setScalar(1); o.updateMatrix();
        m.setMatrixAt(i, o.matrix); m.setColorAt(i, new THREE.Color(side === 'A' ? '#c43b2f' : '#3a6cc0'));
      }
      s.add(m);
    };
    army('spearUp', 120, 'A', -6, -8, 24, 1.6);
    army('shield', 72, 'A', -6, -14, 24, 1.6);
    army('archer', 60, 'A', -6, 0, 20, 1.6);
    army('cavShock', 24, 'A', 32, -8, 6, 2.8);
    army('spearUp', 200, 'B', 0, -110, 40, 1.6);
    army('cavShock', 40, 'B', -60, -100, 10, 2.8);
    // 지휘관과 군기
    this.hero = buildCommander({ weaponType: 'polearm', equip: profile.equip, colors: profile.crest.colors, scale: 1.6 });
    this.hero.position.set(0, this.heightAt(0, 6) , 6);
    this.hero.rotation.y = Math.PI / 2;
    s.add(this.hero);
    const tex = new THREE.CanvasTexture(crestCanvas(profile.crest, 256)); tex.colorSpace = THREE.SRGBColorSpace;
    this.banners = [];
    for (const [x, z] of [[-14, -2], [6, -2], [22, -2]]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 10, 6), new THREE.MeshLambertMaterial({ color: 0x4a3420 }));
      pole.position.set(x, this.heightAt(x, z) + 5, z); s.add(pole);
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 4, 10, 1), new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide, color: 0xffffff }));
      cloth.position.set(x + 1.75, this.heightAt(x, z) + 7.6, z); s.add(cloth);
      this.banners.push(cloth);
    }
    this.t = 0;
  }
  update(dt, camera) {
    this.t += dt;
    const a = Math.PI * 0.55 + Math.sin(this.t * 0.05) * 0.5;
    camera.position.set(Math.cos(a) * 34, 12 + Math.sin(this.t * 0.11) * 1.5, Math.sin(a) * 34 + 6);
    camera.lookAt(-4, 7, -10);
    if (camera.fov !== 42) { camera.fov = 42; camera.updateProjectionMatrix(); }
    for (const b of this.banners) {
      const p = b.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, Math.sin(x * 1.8 - this.t * 4) * 0.3 * ((x + 1.7) / 3.4)); }
      p.needsUpdate = true;
    }
    this.hero.userData.cloak && (this.hero.userData.cloak.rotation.z = 0.3 + Math.sin(this.t * 3) * 0.1);
  }
  dispose() { this.scene.traverse((o) => { o.geometry?.dispose?.(); o.material?.map?.dispose?.(); o.material?.dispose?.(); }); }
}
