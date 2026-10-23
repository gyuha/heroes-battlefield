// 전투 장면 렌더러: 시뮬레이션 상태(Battle)를 three.js 장면으로 옮긴다.
import * as THREE from 'three';
import { T, CELL } from '../game/map.js';
import { CLASS_INFO } from '../data/troops.js';
import { soldierGeometry, MODEL_KINDS, CLASS_MODEL, teamMaterial, buildCommander, treeGeometry, tentGeometry, postGeometry, houseGeometry, rockGeometry, cliffGeometry, vertexColorMaterial } from './models.js';
import { drawUnitTag, drawNameplate, drawFlagCloth } from './art.js';
import { Effects } from './effects.js';

const TEAM = { A: new THREE.Color('#c43b2f'), B: new THREE.Color('#3a6cc0') };
const GROUND = {
  [T.GRASS]: [0x5f8a3e, 0x6e9846], [T.SAND]: [0xc9ab72, 0xd8bc85], [T.MUD]: [0x5c4630, 0x6a5238], [T.FOREST]: [0x3d5f2c, 0x466b33],
  [T.ROAD]: [0x9a7f57, 0xa88c62], [T.WATER]: [0x4a5d4a, 0x4a5d4a], [T.FORD]: [0x7b8a6a, 0x7b8a6a], [T.BRIDGE]: [0x6a5a40, 0x6a5a40],
  [T.CLIFF]: [0x6d6a62, 0x77736a], [T.WALL]: [0x7a6a50, 0x7a6a50], [T.HOUSE]: [0x8a7a5a, 0x8a7a5a], [T.SEA]: [0x3a5060, 0x3a5060],
};

export class BattleRenderer {
  constructor(stage, battle, { crest, colors, equip, quality }) {
    this.stage = stage;
    this.battle = battle;
    this.crest = crest;
    this.quality = quality;
    const scene = (this.scene = new THREE.Scene());
    const sand = battle.def.sand;
    scene.background = new THREE.Color(sand ? 0xe6cf9c : 0xaecbd8);
    scene.fog = new THREE.Fog(scene.background, 220, 520);
    const hemi = new THREE.HemisphereLight(sand ? 0xfff0d0 : 0xdfeeff, sand ? 0x8a6a40 : 0x4a5a30, 1.6);
    scene.add(hemi);
    const sun = (this.sun = new THREE.DirectionalLight(0xfff1d6, 2.4));
    sun.position.set(-60, 120, 40);
    if (quality !== 'low') {
      sun.castShadow = true;
      const s = quality === 'high' ? 2048 : 1024;
      sun.shadow.mapSize.set(s, s);
      Object.assign(sun.shadow.camera, { left: -80, right: 80, top: 80, bottom: -80, near: 10, far: 400 });
      sun.shadow.bias = -0.0008;
    }
    scene.add(sun, sun.target);
    this.buildTerrain();
    this.buildDecor();
    this.buildArmies();
    this.buildFlags();
    this.buildHeroes(colors, equip);
    this.buildMissiles();
    this.fx = new Effects(scene, quality);
    this.selRings = [];
    const rg = new THREE.RingGeometry(0.92, 1, 40); rg.rotateX(-Math.PI / 2);
    for (let i = 0; i < 24; i++) { const m = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xffe28a, transparent: true, opacity: 0.8, depthWrite: false })); m.visible = false; scene.add(m); this.selRings.push(m); }
    this.tagTimer = 0;
  }

  // ───────── 지형 ─────────
  buildTerrain() {
    const map = this.battle.map;
    const cols = map.cols, rows = map.rows;
    const pos = new Float32Array((cols + 1) * (rows + 1) * 3), col = new Float32Array((cols + 1) * (rows + 1) * 3);
    const c = new THREE.Color(), c2 = new THREE.Color();
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
      const k = j * (cols + 1) + i;
      const x = -map.W / 2 + i * CELL, z = -map.H / 2 + j * CELL;
      const t = map.type[Math.min(rows - 1, j) * cols + Math.min(cols - 1, i)];
      let h = map.heightGrid[k];
      if (t === T.FORD) h = Math.max(h, -0.35);
      pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
      const pal = GROUND[t] ?? GROUND[T.GRASS];
      const n = (Math.sin(x * 0.37 + z * 0.11) + Math.sin(x * 0.13 - z * 0.29) + Math.sin(x * 1.7 + z * 1.3) * 0.4) * 0.22 + 0.5;
      c.set(pal[0]); c2.set(pal[1]); c.lerp(c2, Math.min(1, Math.max(0, n)));
      // 높은 곳은 밝게, 강바닥은 어둡게
      const lift = Math.max(-0.25, Math.min(0.18, h * 0.012));
      c.offsetHSL(0, 0, lift);
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
    }
    const idx = [];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const a = j * (cols + 1) + i, b = a + 1, d = a + cols + 1, e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const ground = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.ground = ground;
    // 바깥 테두리 땅
    const skirt = new THREE.Mesh(new THREE.PlaneGeometry(map.W * 4, map.H * 4), new THREE.MeshLambertMaterial({ color: this.battle.def.sand ? 0xc4a46c : 0x557a38 }));
    skirt.rotation.x = -Math.PI / 2; skirt.position.y = -0.6; this.scene.add(skirt);
    // 물
    const hasWater = map.decor.rivers.length || map.seaZ !== undefined;
    if (hasWater) {
      const water = new THREE.Mesh(new THREE.PlaneGeometry(map.W, map.H), new THREE.MeshPhongMaterial({ color: 0x3f7fa0, transparent: true, opacity: 0.78, shininess: 90, specular: 0x88bbdd }));
      water.rotation.x = -Math.PI / 2; water.position.y = -0.55;
      this.scene.add(water);
      this.water = water;
    }
  }

  instanced(geo, mat, items, place) {
    if (!items.length) return null;
    const m = new THREE.InstancedMesh(geo, mat, items.length);
    const o = new THREE.Object3D();
    items.forEach((it, i) => { place(o, it); o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
    m.castShadow = true; m.receiveShadow = true;
    this.scene.add(m);
    return m;
  }

  buildDecor() {
    const map = this.battle.map, d = map.decor, H = (x, z) => map.heightAt(x, z);
    const vmat = vertexColorMaterial();
    for (const kind of [0, 1]) this.instanced(treeGeometry(kind), vmat, d.trees.filter((t) => t.kind === kind), (o, t) => { o.position.set(t.x, H(t.x, t.z), t.z); o.scale.setScalar(t.s * 1.3); o.rotation.y = t.x * 13.1; });
    this.instanced(postGeometry(), vmat, d.walls, (o, w) => { o.position.set(w.x, H(w.x, w.z) - 0.2, w.z); o.scale.setScalar(1); o.rotation.y = w.a; });
    this.instanced(tentGeometry(), vmat, d.tents, (o, t) => { o.position.set(t.x, H(t.x, t.z), t.z); o.scale.setScalar(t.s); });
    this.instanced(houseGeometry(), vmat, d.houses, (o, h) => { o.position.set(h.x, H(h.x, h.z), h.z); o.scale.set(h.l, 4.2, h.w); o.rotation.y = -h.rot; });
    this.instanced(rockGeometry(), vmat, d.rocks, (o, r) => { o.position.set(r.x, H(r.x, r.z), r.z); o.scale.setScalar(r.s); o.rotation.y = r.x; });
    // 절벽: 폴리라인을 따라 바위를 쌓는다.
    const rocks = [];
    for (const c of d.cliffs) for (let i = 0; i < c.pts.length - 1; i++) {
      const [ax, az] = c.pts[i], [bx, bz] = c.pts[i + 1];
      const L = Math.hypot(bx - ax, bz - az), n = Math.ceil(L / 2.2);
      for (let k = 0; k <= n; k++) { const x = ax + ((bx - ax) * k) / n, z = az + ((bz - az) * k) / n; rocks.push({ x, z, s: 1.8 + ((k * 7) % 5) * 0.25 }); }
    }
    this.instanced(cliffGeometry(), vmat, rocks, (o, r) => { o.position.set(r.x, H(r.x, r.z), r.z); o.scale.set(r.s, r.s * 1.5, r.s); o.rotation.y = r.x + r.z; });
    // 다리
    const wood = new THREE.MeshLambertMaterial({ color: 0x7a5a38, flatShading: true });
    for (const b of d.bridges) {
      const grp = new THREE.Group();
      const deck = new THREE.Mesh(new THREE.BoxGeometry(b.len + 2, 0.5, b.w), wood); deck.position.y = 0.45; deck.receiveShadow = true; grp.add(deck);
      for (const s of [-1, 1]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(b.len + 2, 0.9, 0.25), wood); rail.position.set(0, 1.1, (s * b.w) / 2); grp.add(rail); }
      for (let k = -2; k <= 2; k++) for (const s of [-1, 1]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 3.2, 6), wood); post.position.set((k * b.len) / 5, -0.9, (s * b.w) / 2); grp.add(post); }
      grp.position.set(b.x, 0, b.z); grp.rotation.y = -(b.rot ?? 0);
      this.scene.add(grp);
    }
  }

  // ───────── 군대 ─────────
  buildArmies() {
    const counts = {};
    for (const u of this.battle.units) {
      const kinds = u.cls === 'spear' ? ['spearUp', 'spearDown'] : [CLASS_MODEL[u.cls]];
      for (const k of kinds) counts[k + u.side] = (counts[k + u.side] ?? 0) + u.figures.length;
    }
    this.meshes = {};
    const mat = teamMaterial();
    for (const kind of MODEL_KINDS) {
      const geo = soldierGeometry(kind);
      for (const side of ['A', 'B']) {
        const n = counts[kind + side];
        if (!n) continue;
        const m = new THREE.InstancedMesh(geo, mat, n);
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        m.castShadow = this.quality === 'high';
        m.receiveShadow = false;
        m.frustumCulled = false;
        for (let i = 0; i < n; i++) m.setColorAt(i, TEAM[side]);
        this.scene.add(m);
        this.meshes[kind + side] = m;
      }
    }
    // 부대 표지
    this.tags = new Map();
    for (const u of this.battle.units) {
      const cv = document.createElement('canvas'); cv.width = 192; cv.height = 64;
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, sizeAttenuation: false }));
      sp.renderOrder = 10; sp.center.set(0.5, 0);
      this.scene.add(sp);
      this.tags.set(u.id, { sp, cv, tex, key: '' });
    }
    this._o = new THREE.Object3D();
    this._c = new THREE.Color();
  }

  buildHeroes(colors, equip) {
    const b = this.battle;
    this.heroModel = buildCommander({ weaponType: b.hero.wt, equip, colors });
    this.scene.add(this.heroModel);
    this.generalModel = buildCommander({ weaponType: 'greatsword', equip: { armor: 'darkIII', helmet: 'plume', cloak: 'oath', mount: b.mode === 'heroic' ? 'black' : 'foot', barding: 'none' }, colors: ['#2c4f8c', '#c7ccd2', '#c7ccd2', '#eef2f6'], scale: 1.2 });
    this.scene.add(this.generalModel);
    const plate = (color, bar) => {
      const cv = document.createElement('canvas'); cv.width = 320; cv.height = 72;
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, sizeAttenuation: false }));
      sp.renderOrder = 11; sp.center.set(0.5, 0); sp.scale.set(0.2, 0.045, 1);
      this.scene.add(sp);
      return { sp, cv, tex, key: '', color, bar };
    };
    this.heroPlate = plate('#ffd36a', '#8ee06a');
    this.genPlate = plate('#ffb0a0', '#e85a4a');
    const ringG = new THREE.RingGeometry(1.3, 1.6, 40); ringG.rotateX(-Math.PI / 2);
    this.heroRing = new THREE.Mesh(ringG, new THREE.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0.85, depthWrite: false }));
    this.scene.add(this.heroRing);
    const aimG = new THREE.ConeGeometry(0.45, 1.2, 3); aimG.rotateZ(-Math.PI / 2);
    this.aimMark = new THREE.Mesh(aimG, new THREE.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0.8, depthWrite: false }));
    this.scene.add(this.aimMark);
    // 보호 대상
    this.wardModels = b.wards.map((w) => {
      const m = buildCommander({ weaponType: 'focus', equip: { armor: 'scaleI', helmet: 'none', cloak: 'oath', mount: 'foot' }, colors: ['#e9dcc0', '#c9a75a', '#c9a75a', '#fff'], scale: 1.05 });
      this.scene.add(m);
      const p = plate('#bff0ff', null); p.sp.scale.set(0.16, 0.036, 1);
      return { m, p, w };
    });
  }

  buildFlags() {
    this.flagViews = [];
    const b = this.battle;
    for (const f of b.flags) {
      const g = new THREE.Group();
      const h = b.map.heightAt(f.x, f.z);
      g.position.set(f.x, h, f.z);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 9, 6), new THREE.MeshLambertMaterial({ color: 0x5a3b22 }));
      pole.position.y = 4.5; pole.castShadow = true; g.add(pole);
      const cv = document.createElement('canvas'); cv.width = 128; cv.height = 96;
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      const clothGeo = new THREE.PlaneGeometry(4, 3, 8, 1);
      const cloth = new THREE.Mesh(clothGeo, new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
      cloth.position.set(2.05, 7.3, 0); g.add(cloth);
      const base = new THREE.Mesh(new THREE.RingGeometry(13.3, 14, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, depthWrite: false }));
      base.position.y = 0.3; g.add(base);
      const prog = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide }));
      prog.position.y = 0.35; g.add(prog);
      this.scene.add(g);
      this.flagViews.push({ f, g, cloth, cv, tex, prog, base, key: '', pk: '' });
    }
    this.zoneViews = b.zones.map((z) => {
      const m = new THREE.Mesh(new THREE.RingGeometry(z.r - 0.8, z.r, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x8fe8ff, transparent: true, opacity: 0.6, depthWrite: false }));
      m.position.set(z.x, b.map.heightAt(z.x, z.z) + 0.3, z.z);
      const col = new THREE.Mesh(new THREE.CylinderGeometry(z.r, z.r, 6, 40, 1, true), new THREE.MeshBasicMaterial({ color: 0x8fe8ff, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
      col.position.set(z.x, b.map.heightAt(z.x, z.z) + 3, z.z);
      this.scene.add(m, col);
      return { m, col, z };
    });
  }

  buildMissiles() {
    const geo = new THREE.BoxGeometry(1.3, 0.06, 0.06);
    this.arrowMesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0x3a2a1a }), 900);
    this.arrowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.arrowMesh.frustumCulled = false;
    this.scene.add(this.arrowMesh);
    this.shotMeshes = [];
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, blending: THREE.AdditiveBlending }));
      m.visible = false; this.scene.add(m); this.shotMeshes.push(m);
    }
  }

  // ───────── 매 프레임 ─────────
  update(dt, cam, viewTactical) {
    const b = this.battle, map = b.map, o = this._o, col = this._c;
    const now = b.time;
    const used = {};
    for (const key in this.meshes) used[key] = 0;
    const hide = new THREE.Matrix4().makeScale(0, 0, 0);
    let ring = 0;
    for (const u of b.units) {
      const lowered = u.cls === 'spear' && (u.braced || u.engaged);
      const kind = u.cls === 'spear' ? (lowered ? 'spearDown' : 'spearUp') : CLASS_MODEL[u.cls];
      const mesh = this.meshes[kind + u.side];
      if (!mesh) continue;
      for (const f of u.figures) {
        let i = used[kind + u.side]++;
        if (i >= mesh.count) continue;
        if (!f.alive) {
          const age = now - f.dieT;
          if (f.dieT < 0 || age > 7) { mesh.setMatrixAt(i, hide); continue; }
          const sink = age > 5 ? (age - 5) * 0.5 : 0;
          o.position.set(f.x, map.heightAt(f.x, f.z) + 0.25 - sink, f.z);
          o.rotation.set(Math.PI / 2 * Math.min(1, age * 4) * (f.phase > 3 ? 1 : -1), -f.face, 0, 'YXZ');
          o.scale.setScalar(1);
        } else {
          const bob = f.moving ? Math.abs(Math.sin(now * (u.cav ? 9 : 7) + f.phase)) * (u.cav ? 0.25 : 0.12) : 0;
          o.position.set(f.x, map.heightAt(f.x, f.z) + f.y + bob, f.z);
          const lean = -f.atk * 0.35 + (f.launch > 0 ? f.y * 0.4 : 0);
          o.rotation.set(0, -f.face, lean, 'YZX');
          o.scale.setScalar(u.cav ? 1.05 : 1);
        }
        o.updateMatrix();
        mesh.setMatrixAt(i, o.matrix);
        col.copy(TEAM[u.side]);
        if (f.hit > 0) col.lerp(new THREE.Color(1, 1, 1), f.hit * 0.7);
        if (u.selected) col.offsetHSL(0, 0, 0.12 + Math.sin(now * 6) * 0.05);
        if (u.routing) col.multiplyScalar(0.6);
        mesh.setColorAt(i, col);
      }
      // 반대 자세 메시의 슬롯도 소모(창병은 두 메시를 번갈아 씀)
      if (u.cls === 'spear') {
        const other = this.meshes[(lowered ? 'spearUp' : 'spearDown') + u.side];
        if (other) for (let k = 0; k < u.figures.length; k++) { const i = used[(lowered ? 'spearUp' : 'spearDown') + u.side]++; if (i < other.count) other.setMatrixAt(i, hide); }
      }
      if (u.selected && !u.dead && ring < this.selRings.length) {
        const r = this.selRings[ring++];
        r.visible = true; r.position.set(u.x, map.heightAt(u.x, u.z) + 0.3, u.z); r.scale.setScalar(u.radius + 2);
      }
    }
    for (; ring < this.selRings.length; ring++) this.selRings[ring].visible = false;
    for (const key in this.meshes) {
      const m = this.meshes[key];
      for (let i = used[key]; i < m.count; i++) m.setMatrixAt(i, hide);
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    this.updateTags(dt, viewTactical);
    this.updateHeroes(dt);
    this.updateFlags(dt);
    this.updateMissiles();
    // 그림자 카메라는 시점 중심을 따라간다.
    this.sun.position.set(cam.focus.x - 60, 120, cam.focus.z + 40);
    this.sun.target.position.set(cam.focus.x, 0, cam.focus.z);
    // 안개는 카메라 거리를 따라가 전술 지도에서도 전장이 흐려지지 않게 한다.
    this.scene.fog.near = Math.max(200, cam.dist * 1.1);
    this.scene.fog.far = this.scene.fog.near + 320;
    if (this.water) this.water.material.opacity = 0.74 + Math.sin(now * 1.3) * 0.04;
    for (const zv of this.zoneViews) { zv.m.material.opacity = 0.45 + Math.sin(now * 3) * 0.2; }
    this.fx.update(dt, b.hero, map.heightAt(b.hero.x, b.hero.z));
  }

  updateTags(dt, tactical) {
    this.tagTimer -= dt;
    const refresh = this.tagTimer <= 0;
    if (refresh) this.tagTimer = 0.25;
    const b = this.battle;
    for (const u of b.units) {
      const t = this.tags.get(u.id);
      if (u.dead) { t.sp.visible = false; continue; }
      t.sp.visible = true;
      t.sp.position.set(u.x, b.map.heightAt(u.x, u.z) + (u.cav ? 7.5 : 6), u.z);
      const s = tactical ? 1.1 : 1;
      t.sp.scale.set(0.085 * s, 0.028 * s, 1);
      if (refresh) {
        const key = `${Math.round(u.troops)}|${u.selected}|${u.routing}|${u.ai}|${tactical}`;
        if (key !== t.key) {
          t.key = key;
          drawUnitTag(t.cv, { side: u.side, icon: CLASS_INFO[u.cls].icon, troops: u.troops, selected: u.selected, routing: u.routing, ai: u.ai, name: u.name, big: tactical });
          t.tex.needsUpdate = true;
        }
      }
    }
  }

  placeModel(model, ent, dt, { moving, alive }) {
    const map = this.battle.map;
    const a = ent.anim;
    model.visible = true;
    const h = map.heightAt(ent.x, ent.z);
    model.position.set(ent.x, h, ent.z);
    const ud = model.userData;
    if (!alive) {
      ud.body.rotation.z = Math.min(Math.PI / 2, (ud.body.rotation.z || 0) + dt * 3);
      ud.body.position.y = -0.2;
      return;
    }
    ud.body.rotation.z = 0; ud.body.position.y = 0;
    model.rotation.y = -ent.facing;
    const t = performance.now() / 1000;
    ud.walk = (ud.walk ?? 0) + (moving ? dt * 10 : 0);
    if (ud.legs) { ud.legs[0].rotation.z = moving ? Math.sin(ud.walk) * 0.6 : 0; ud.legs[1].rotation.z = moving ? -Math.sin(ud.walk) * 0.6 : 0; }
    if (ud.horseLegs) ud.horseLegs.forEach((l, i) => { l.rotation.z = moving ? Math.sin(ud.walk * 1.3 + i * 1.6) * 0.5 : 0; });
    ud.rider.position.y = (ud.horseLegs ? 1.05 : 0) + (moving ? Math.abs(Math.sin(ud.walk)) * 0.08 : Math.sin(t * 2) * 0.02);
    // 팔: 휘두르기·찌르기·회전
    const swing = a.swing > 0 ? Math.sin((1 - a.swing) * Math.PI) : 0;
    ud.arm.rotation.z = -0.3 - swing * 1.6 * (a.swingDir ?? 1) * 0.6 - a.guard * 0.9;
    ud.arm.rotation.x = swing * 1.2 * (a.swingDir ?? 1);
    ud.body.rotation.y = a.spin > 0 ? (1 - a.spin) * Math.PI * 4 : 0;
    ud.body.position.x = a.lunge * 0.4;
    if (a.roll > 0) { ud.body.rotation.x = (1 - a.roll) * Math.PI * 2; ud.body.position.y = Math.sin(a.roll * Math.PI) * 0.4; } else ud.body.rotation.x = 0;
    if (ud.cloak) ud.cloak.rotation.z = 0.12 + (moving ? 0.35 + Math.sin(t * 8) * 0.08 : Math.sin(t * 1.5) * 0.04);
    if (ud.orb) ud.orb.material.emissiveIntensity = 1 + Math.sin(t * 5) * 0.5;
  }

  updateHeroes(dt) {
    const b = this.battle, h = b.hero, g = b.general, map = b.map;
    this.placeModel(this.heroModel, h, dt, { moving: h.moving, alive: !h.dead });
    const hy = map.heightAt(h.x, h.z);
    this.heroRing.position.set(h.x, hy + 0.25, h.z);
    this.heroRing.material.opacity = h.dead ? 0 : 0.6 + Math.sin(b.time * 4) * 0.2;
    this.heroRing.material.color.set(h.musouReady ? 0xffb020 : 0xffd36a);
    this.aimMark.position.set(h.x + Math.cos(h.aim) * 2.6, hy + 0.35, h.z + Math.sin(h.aim) * 2.6);
    this.aimMark.rotation.set(-Math.PI / 2, 0, 0);
    this.aimMark.rotation.z = -h.aim;
    this.aimMark.rotation.order = 'XYZ';
    this.aimMark.quaternion.setFromEuler(new THREE.Euler(0, -h.aim, 0));
    this.aimMark.visible = !h.dead;
    this.generalModel.visible = true;
    this.placeModel(this.generalModel, g, dt, { moving: g.moving, alive: !g.dead });
    if (g.dead && b.time - (g.diedAt ?? (g.diedAt = b.time)) > 6) this.generalModel.visible = false;
    const plate = (p, ent, name, y) => {
      p.sp.position.set(ent.x, map.heightAt(ent.x, ent.z) + y, ent.z);
      p.sp.visible = !ent.dead;
      const key = `${name}|${Math.round((ent.hp / ent.maxHp) * 50)}`;
      if (key !== p.key) { p.key = key; drawNameplate(p.cv, { name, hp: ent.hp, max: ent.maxHp, color: p.color, bar: p.bar }); p.tex.needsUpdate = true; }
    };
    plate(this.heroPlate, h, h.name, h.mounted ? 5.4 : 3.6);
    plate(this.genPlate, g, g.name, g.maxHp && this.generalModel.userData.horseLegs ? 5.4 : 3.6);
    for (const wv of this.wardModels) {
      this.placeModel(wv.m, { ...wv.w, facing: Math.atan2(h.z - wv.w.z, h.x - wv.w.x), anim: { swing: 0, lunge: 0, spin: 0, roll: 0, guard: 0 } }, dt, { moving: wv.w.moving, alive: true });
      wv.p.sp.position.set(wv.w.x, map.heightAt(wv.w.x, wv.w.z) + 3.2, wv.w.z);
      const key = wv.w.name + wv.w.safe + wv.w.following;
      if (wv.p.key !== key) { wv.p.key = key; drawNameplate(wv.p.cv, { name: `${wv.w.safe ? '✔ ' : wv.w.following ? '▶ ' : '★ '}${wv.w.name}`, color: '#bff0ff' }); wv.p.tex.needsUpdate = true; }
    }
  }

  updateFlags(dt) {
    for (const v of this.flagViews) {
      const f = v.f;
      const key = `${f.owner}|${f.locked}`;
      if (key !== v.key) { v.key = key; drawFlagCloth(v.cv, { owner: f.owner, crest: this.crest, label: f.locked ? '奪' : '旗' }); v.tex.needsUpdate = true; }
      // 깃발 펄럭임
      const pos = v.cloth.geometry.attributes.position;
      const t = this.battle.time;
      for (let i = 0; i < pos.count; i++) { const x = pos.getX(i); pos.setZ(i, Math.sin(x * 1.6 - t * 5) * 0.25 * ((x + 2) / 4)); }
      pos.needsUpdate = true;
      const p = Math.round(Math.abs(f.progress) / 4) * 4;
      const pk = `${p}|${Math.sign(f.progress)}`;
      if (pk !== v.pk) {
        v.pk = pk;
        v.prog.geometry.dispose();
        const g = new THREE.RingGeometry(12.6, 14, 64, 1, Math.PI / 2, -(p / 100) * Math.PI * 2 || 0.0001);
        g.rotateX(-Math.PI / 2);
        v.prog.geometry = g;
      }
      v.prog.material.color.set(f.locked ? 0xffd36a : f.progress >= 0 ? 0xe0503f : 0x4a7ad8);
      v.base.material.color.set(f.state === 'contested' ? 0xffe08a : 0xffffff);
      v.base.material.opacity = f.state === 'contested' ? 0.5 + Math.sin(t * 8) * 0.3 : 0.25;
    }
  }

  updateMissiles() {
    const b = this.battle, o = this._o;
    let n = 0;
    for (const m of b.missiles) {
      if (m.dmgOnly || n >= this.arrowMesh.count) continue;
      const k = Math.min(1, m.t / m.dur);
      const D = Math.hypot(m.ex - m.sx, m.ez - m.sz);
      const arcH = D * m.arc;
      const x = m.sx + (m.ex - m.sx) * k, z = m.sz + (m.ez - m.sz) * k;
      const y = m.sy + (m.ey - m.sy) * k + arcH * 4 * k * (1 - k);
      const dy = (m.ey - m.sy) + arcH * 4 * (1 - 2 * k);
      o.position.set(x, y, z);
      o.rotation.set(0, -Math.atan2(m.ez - m.sz, m.ex - m.sx), Math.atan2(dy, D), 'YZX');
      o.scale.setScalar(m.bolt ? 0.8 : 1);
      o.updateMatrix();
      this.arrowMesh.setMatrixAt(n++, o.matrix);
    }
    this.arrowMesh.count = n;
    this.arrowMesh.instanceMatrix.needsUpdate = true;
    let i = 0;
    for (const s of b.heroShots) {
      if (i >= this.shotMeshes.length) break;
      const m = this.shotMeshes[i++];
      m.visible = true; m.position.set(s.x, b.map.heightAt(s.x, s.z) + 1.4, s.z);
      m.material.color.set(s.magic ? 0x9fe8ff : 0xffe2a0);
      m.scale.set(s.magic ? 1.2 : 1.6, s.magic ? 1.2 : 0.25, s.magic ? 1.2 : 0.25);
      m.rotation.y = -s.dir;
    }
    for (; i < this.shotMeshes.length; i++) this.shotMeshes[i].visible = false;
  }

  /** 화면 좌표 → 지면 좌표(레이캐스트). */
  pick(ndcX, ndcY, camera) {
    this._ray ??= new THREE.Raycaster();
    this._ray.setFromCamera({ x: ndcX, y: ndcY }, camera);
    const hit = this._ray.intersectObject(this.ground, false)[0];
    if (hit) return { x: hit.point.x, z: hit.point.z };
    const t = -this._ray.ray.origin.y / this._ray.ray.direction.y;
    return { x: this._ray.ray.origin.x + this._ray.ray.direction.x * t, z: this._ray.ray.origin.z + this._ray.ray.direction.z * t };
  }

  /** 화면 좌표 근처의 부대 표지 선택(전술 지도). */
  pickUnit(sx, sy, camera, w, h) {
    let best = null, bd = 40;
    const v = new THREE.Vector3();
    for (const u of this.battle.units) {
      if (u.dead) continue;
      v.set(u.x, this.battle.map.heightAt(u.x, u.z) + 4, u.z).project(camera);
      const px = ((v.x + 1) / 2) * w, py = ((1 - v.y) / 2) * h;
      const d = Math.hypot(px - sx, py - sy);
      if (d < bd) { bd = d; best = u; }
    }
    return best;
  }

  dispose() {
    this.scene.traverse((o) => {
      o.geometry?.dispose?.();
      const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of ms) { m.map?.dispose?.(); m.dispose?.(); }
    });
  }
}
