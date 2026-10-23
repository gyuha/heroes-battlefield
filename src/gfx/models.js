// 절차적으로 만드는 로우폴리 모델. 외부 에셋 없이 모든 병사·말·지형 소품을 코드로 생성한다.
// 병사 지오메트리는 정점 색 + teamMask(1 = 진영 색을 입힐 부분) 속성을 가진다.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const C = {
  skin: 0xd9a77e, metal: 0x9aa1a8, dark: 0x3b3430, wood: 0x7a5636, leather: 0x6b4a2e, white: 0xffffff,
  horse: 0x6b4228, horseDark: 0x3a2618, steel: 0xc9ced3, gold: 0xc9a75a, cloth: 0xe9e2d0,
};

function part(geo, color, mask, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  const g = geo.clone();
  g.scale(sx, sy, sz);
  g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz);
  g.translate(x, y, z);
  const n = g.attributes.position.count;
  const col = new THREE.Color(color);
  const cols = new Float32Array(n * 3), m = new Float32Array(n);
  for (let i = 0; i < n; i++) { cols[i * 3] = col.r; cols[i * 3 + 1] = col.g; cols[i * 3 + 2] = col.b; m[i] = mask; }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.setAttribute('teamMask', new THREE.BufferAttribute(m, 1));
  return g.index ? g.toNonIndexed() : g;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (r1, r2, h, s = 6) => new THREE.CylinderGeometry(r1, r2, h, s);
const sph = (r, w = 6, h = 4) => new THREE.SphereGeometry(r, w, h);
const cone = (r, h, s = 6) => new THREE.ConeGeometry(r, h, s);

// 모델 로컬 좌표: +x 가 정면, y 위.
function infantryBody(helmet = 'cap') {
  const parts = [
    part(box(0.22, 0.78, 0.2), C.dark, 0, { x: 0, y: 0.39, z: -0.13 }),
    part(box(0.22, 0.78, 0.2), C.dark, 0, { x: 0, y: 0.39, z: 0.13 }),
    part(box(0.42, 0.62, 0.52), C.white, 1, { y: 1.12 }),
    part(box(0.46, 0.18, 0.56), C.metal, 0, { y: 1.42 }),
    part(box(0.16, 0.56, 0.16), C.metal, 0, { x: 0.02, y: 1.08, z: -0.34 }),
    part(box(0.16, 0.56, 0.16), C.metal, 0, { x: 0.02, y: 1.08, z: 0.34 }),
    part(sph(0.17, 6, 5), C.skin, 0, { y: 1.68 }),
  ];
  if (helmet === 'cap') parts.push(part(sph(0.19, 6, 3), C.metal, 0, { y: 1.74, sy: 0.8 }));
  if (helmet === 'cone') parts.push(part(cone(0.2, 0.32, 6), C.metal, 0, { y: 1.9 }));
  if (helmet === 'hood') parts.push(part(sph(0.2, 6, 4), C.leather, 0, { y: 1.72, sy: 0.9 }));
  return parts;
}

export function soldierGeometry(kind) {
  let p;
  switch (kind) {
    case 'shield':
      p = [...infantryBody('cone'), part(box(0.1, 1.05, 0.72), C.white, 1, { x: 0.38, y: 1.0 }), part(box(0.11, 0.2, 0.2), C.gold, 0, { x: 0.42, y: 1.05 }),
        part(cyl(0.035, 0.035, 2.2), C.wood, 0, { x: 0.15, y: 1.6, z: 0.36 })];
      break;
    case 'infantry':
      p = [...infantryBody('cap'), part(cyl(0.3, 0.3, 0.08, 8), C.white, 1, { x: 0.32, y: 1.05, z: -0.18, rz: Math.PI / 2 }), part(box(0.07, 0.95, 0.05), C.steel, 0, { x: 0.3, y: 1.35, z: 0.36, rz: -0.5 })];
      break;
    case 'spearUp':
      p = [...infantryBody('cone'), part(cyl(0.035, 0.035, 4.2), C.wood, 0, { x: 0.2, y: 2.4, z: 0.34, rz: -0.12 }), part(cone(0.07, 0.35, 4), C.steel, 0, { x: 0.45, y: 4.55, z: 0.34, rz: -0.12 })];
      break;
    case 'spearDown':
      p = [...infantryBody('cone'), part(cyl(0.035, 0.035, 4.6), C.wood, 0, { x: 1.4, y: 1.15, z: 0.3, rz: -Math.PI / 2 + 0.08 }), part(cone(0.07, 0.35, 4), C.steel, 0, { x: 3.75, y: 1.0, z: 0.3, rz: -Math.PI / 2 + 0.08 })];
      break;
    case 'shock':
      p = [...infantryBody('cap'), part(cyl(0.04, 0.04, 1.5), C.wood, 0, { x: 0.25, y: 1.45, z: 0.32, rz: -0.35 }), part(box(0.4, 0.34, 0.06), C.steel, 0, { x: 0.48, y: 2.05, z: 0.32, rz: -0.35 })];
      break;
    case 'archer':
      p = [...infantryBody('hood'), part(new THREE.TorusGeometry(0.62, 0.03, 4, 10, Math.PI), C.wood, 0, { x: 0.32, y: 1.25, rz: -Math.PI / 2, ry: 0 }), part(box(0.16, 0.6, 0.16), C.leather, 0, { x: -0.3, y: 1.25, z: 0.1, rz: 0.3 })];
      break;
    case 'crossbow':
      p = [...infantryBody('cap'), part(box(0.8, 0.1, 0.12), C.wood, 0, { x: 0.5, y: 1.25 }), part(box(0.08, 0.08, 0.8), C.steel, 0, { x: 0.82, y: 1.27 })];
      break;
    case 'cavShock': case 'cavRaid': {
      const horse = [
        part(box(1.7, 0.72, 0.62), C.horse, 0, { y: 1.25 }),
        part(box(1.5, 0.4, 0.66), C.white, 1, { y: 1.32, x: -0.05 }), // 마갑(진영 색)
        part(box(0.42, 0.85, 0.36), C.horse, 0, { x: 0.95, y: 1.75, rz: -0.55 }),
        part(box(0.62, 0.3, 0.3), C.horse, 0, { x: 1.32, y: 2.0, rz: -0.25 }),
        part(box(0.16, 0.25, 0.4), C.horseDark, 0, { x: -0.92, y: 1.3, rz: 0.5 }),
      ];
      for (const [lx, lz] of [[0.6, 0.2], [0.6, -0.2], [-0.6, 0.2], [-0.6, -0.2]]) horse.push(part(box(0.16, 0.95, 0.16), C.horseDark, 0, { x: lx, y: 0.48, z: lz }));
      const rider = [
        part(box(0.4, 0.62, 0.46), C.white, 1, { y: 2.0 }), part(box(0.44, 0.16, 0.5), C.metal, 0, { y: 2.3 }),
        part(sph(0.16, 6, 5), C.skin, 0, { y: 2.52 }), part(cone(0.18, 0.3, 6), C.metal, 0, { y: 2.74 }),
        part(box(0.18, 0.5, 0.14), C.dark, 0, { y: 1.65, z: 0.3 }), part(box(0.18, 0.5, 0.14), C.dark, 0, { y: 1.65, z: -0.3 }),
      ];
      const weapon = kind === 'cavShock'
        ? [part(cyl(0.035, 0.03, 3.6), C.wood, 0, { x: 1.3, y: 2.1, z: 0.32, rz: -Math.PI / 2 + 0.2 }), part(cone(0.06, 0.3, 4), C.steel, 0, { x: 3.1, y: 1.75, z: 0.32, rz: -Math.PI / 2 + 0.2 }), part(box(0.08, 0.6, 0.45), C.white, 1, { x: 0.15, y: 1.95, z: -0.36 })]
        : [part(box(0.06, 0.85, 0.05), C.steel, 0, { x: 0.4, y: 2.25, z: 0.36, rz: -0.8 })];
      p = [...horse, ...rider, ...weapon];
      break;
    }
    default: p = infantryBody();
  }
  const g = mergeGeometries(p, false);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export const CLASS_MODEL = { shield: 'shield', infantry: 'infantry', spear: 'spearUp', shock: 'shock', archer: 'archer', crossbow: 'crossbow', cav_shock: 'cavShock', cav_raid: 'cavRaid' };
export const MODEL_KINDS = ['shield', 'infantry', 'spearUp', 'spearDown', 'shock', 'archer', 'crossbow', 'cavShock', 'cavRaid'];

/** 진영 색을 teamMask 부분에만 곱하는 재질. */
export function teamMaterial() {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = 'attribute float teamMask;\n' + sh.vertexShader.replace('vColor.xyz *= instanceColor.xyz;', 'vColor.xyz *= mix(vec3(1.0), instanceColor.xyz, teamMask);');
  };
  m.customProgramCacheKey = () => 'teamMask';
  return m;
}

// ───────── 지휘관 모델(장비에 따라 조립) ─────────
const ARMOR_TONE = { plateI: 0x9aa3ad, plateII: 0xc7ccd2, plateIII: 0xd9b45a, scaleI: 0x6b5a45, scaleII: 0x8c3b2f, darkIII: 0x2f3338 };
const MOUNT_TONE = { bay: 0x6b3d22, black: 0x1d1b1a, grey: 0x9c9a95 };

function mesh(geo, color, opts = {}) {
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts }));
  m.castShadow = true;
  return m;
}

/**
 * 지휘관/장수 모델. 반환 객체의 parts 로 애니메이션(팔 휘두르기 등)을 제어한다.
 * equip: {weapon type, armor, helmet, cloak, mount, barding}, colors: [field, second, ordinary, charge]
 */
export function buildCommander({ weaponType = 'polearm', equip = {}, colors = ['#8c2b25', '#e8d9a8', '#c9a75a', '#f2e6c4'], scale = 1.25 }) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const armor = ARMOR_TONE[equip.armor] ?? 0xc7ccd2;
  const cloth = new THREE.Color(colors[0]);
  const trim = new THREE.Color(colors[2]);
  const mounted = equip.mount && equip.mount !== 'foot';
  let seatY = 0;
  if (mounted) {
    const horse = new THREE.Group();
    const tone = MOUNT_TONE[equip.mount] ?? 0x6b3d22;
    const b = mesh(box(1.9, 0.8, 0.7), tone); b.position.y = 1.3; horse.add(b);
    const neck = mesh(box(0.45, 0.95, 0.4), tone); neck.position.set(1.05, 1.85, 0); neck.rotation.z = -0.55; horse.add(neck);
    const head = mesh(box(0.7, 0.32, 0.32), tone); head.position.set(1.45, 2.12, 0); head.rotation.z = -0.25; horse.add(head);
    const legs = [];
    for (const [lx, lz] of [[0.68, 0.22], [0.68, -0.22], [-0.68, 0.22], [-0.68, -0.22]]) { const l = mesh(box(0.17, 1, 0.17), 0x2a1c12); l.position.set(lx, 0.5, lz); horse.add(l); legs.push(l); }
    if (equip.barding && equip.barding !== 'none') {
      const bd = mesh(box(1.7, 0.5, 0.78), equip.barding === 'ember' ? 0x3a1410 : cloth.getHex()); bd.position.y = 1.36; horse.add(bd);
      const tr = mesh(box(1.72, 0.08, 0.8), trim.getHex()); tr.position.y = 1.1; horse.add(tr);
    }
    body.add(horse);
    root.userData.horseLegs = legs;
    seatY = 1.05;
  }
  const rider = new THREE.Group();
  rider.position.y = seatY;
  body.add(rider);
  if (!mounted) {
    const l1 = mesh(box(0.24, 0.85, 0.22), 0x2c2622); l1.position.set(0, 0.42, -0.14); rider.add(l1);
    const l2 = mesh(box(0.24, 0.85, 0.22), 0x2c2622); l2.position.set(0, 0.42, 0.14); rider.add(l2);
    root.userData.legs = [l1, l2];
  }
  const torso = mesh(box(0.5, 0.7, 0.6), armor); torso.position.y = 1.2; rider.add(torso);
  const tabard = mesh(box(0.52, 0.5, 0.4), cloth.getHex()); tabard.position.set(0.04, 1.05, 0); rider.add(tabard);
  const belt = mesh(box(0.54, 0.08, 0.62), trim.getHex()); belt.position.y = 0.88; rider.add(belt);
  const pauldL = mesh(sph(0.2, 6, 4), armor); pauldL.position.set(0, 1.52, -0.38); rider.add(pauldL);
  const pauldR = mesh(sph(0.2, 6, 4), armor); pauldR.position.set(0, 1.52, 0.38); rider.add(pauldR);
  const head = mesh(sph(0.19, 8, 6), 0xd9a77e); head.position.y = 1.8; rider.add(head);
  const helmet = equip.helmet ?? 'kettle';
  if (helmet !== 'none') {
    const hm = mesh(new THREE.SphereGeometry(0.22, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), armor); hm.position.y = 1.84; rider.add(hm);
    if (helmet === 'great') { const g = mesh(cyl(0.22, 0.22, 0.32, 8), armor); g.position.y = 1.82; rider.add(g); }
    if (helmet === 'plume') { const pl = mesh(cone(0.08, 0.5, 5), cloth.getHex()); pl.position.set(-0.05, 2.18, 0); pl.rotation.z = 0.4; rider.add(pl); }
  }
  if (equip.cloak && equip.cloak !== 'none') {
    const ck = mesh(box(0.08, 1.1, 0.7), equip.cloak === 'ember' ? 0x5a1810 : cloth.getHex(), { side: THREE.DoubleSide });
    ck.position.set(-0.32, 1.05, 0); ck.rotation.z = 0.12; rider.add(ck);
    root.userData.cloak = ck;
  }
  // 무기 팔(어깨 피벗)
  const arm = new THREE.Group(); arm.position.set(0, 1.5, 0.4); rider.add(arm);
  const armMesh = mesh(box(0.16, 0.55, 0.16), armor); armMesh.position.set(0.08, -0.25, 0); arm.add(armMesh);
  const weapon = new THREE.Group(); weapon.position.set(0.18, -0.5, 0); arm.add(weapon);
  const steel = 0xdfe4e8;
  if (weaponType === 'swordShield' || weaponType === 'greatsword') {
    const len = weaponType === 'greatsword' ? 1.7 : 1.05;
    const blade = mesh(box(0.08, len, 0.04), steel, { emissive: 0x111111 }); blade.position.set(0.1, len / 2 + 0.12, 0); blade.rotation.z = -0.15; weapon.add(blade);
    const guard = mesh(box(0.08, 0.06, 0.36), trim.getHex()); guard.position.set(0.05, 0.1, 0); weapon.add(guard);
  } else if (weaponType === 'polearm') {
    const shaft = mesh(cyl(0.04, 0.04, 3.2), 0x5a3b22); shaft.rotation.z = -Math.PI / 2 + 0.3; shaft.position.set(1.0, 0.35, 0); weapon.add(shaft);
    const tip = mesh(cone(0.09, 0.55, 4), steel); tip.rotation.z = -Math.PI / 2 + 0.3; tip.position.set(2.6, 0.82, 0); weapon.add(tip);
  } else if (weaponType === 'bow') {
    const bow = mesh(new THREE.TorusGeometry(0.75, 0.04, 4, 12, Math.PI), 0x5a3b22); bow.rotation.z = -Math.PI / 2; bow.position.set(0.25, 0.2, 0); weapon.add(bow);
  } else {
    const staff = mesh(cyl(0.04, 0.05, 2.0), 0xe8e0c8); staff.position.set(0.1, 0.6, 0); weapon.add(staff);
    const orb = mesh(sph(0.16, 8, 6), 0x9fe8ff, { emissive: 0x3aa0c8 }); orb.position.set(0.1, 1.65, 0); weapon.add(orb);
    root.userData.orb = orb;
  }
  if (weaponType === 'swordShield') {
    const sh = mesh(box(0.1, 0.8, 0.62), cloth.getHex()); sh.position.set(0.42, 1.15, -0.42); rider.add(sh);
    const boss = mesh(box(0.12, 0.2, 0.2), trim.getHex()); boss.position.set(0.48, 1.15, -0.42); rider.add(boss);
    root.userData.shield = sh;
  }
  root.scale.setScalar(scale);
  root.userData.arm = arm;
  root.userData.body = body;
  root.userData.rider = rider;
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return root;
}

// ───────── 지형 소품 ─────────
export function treeGeometry(kind) {
  const p = kind === 0
    ? [part(cyl(0.18, 0.25, 1.6), C.wood, 0, { y: 0.8 }), part(cone(1.5, 2.6, 7), 0x2f5a35, 0, { y: 2.6 }), part(cone(1.15, 2.1, 7), 0x3a6b40, 0, { y: 3.8 })]
    : [part(cyl(0.2, 0.28, 1.8), C.wood, 0, { y: 0.9 }), part(new THREE.IcosahedronGeometry(1.6, 0), 0x4a7a3a, 0, { y: 3.0 }), part(new THREE.IcosahedronGeometry(1.1, 0), 0x5b8a45, 0, { x: 0.6, y: 3.7 })];
  const g = mergeGeometries(p, false); g.computeVertexNormals(); return g;
}
export function tentGeometry() {
  const g = mergeGeometries([part(cone(1.6, 2.2, 4), C.cloth, 1, { y: 1.1, ry: Math.PI / 4 }), part(cyl(0.05, 0.05, 2.8), C.wood, 0, { y: 1.4 })], false);
  g.computeVertexNormals(); return g;
}
export function postGeometry() {
  const g = mergeGeometries([part(cyl(0.22, 0.26, 2.6, 5), C.wood, 0, { y: 1.3 }), part(cone(0.24, 0.5, 5), 0x5a3b22, 0, { y: 2.85 })], false);
  g.computeVertexNormals(); return g;
}
export function houseGeometry() {
  const roof = new THREE.CylinderGeometry(0.01, 0.75, 0.6, 4, 1);
  const g = mergeGeometries([part(box(1, 0.6, 1), 0xcab48a, 0, { y: 0.3 }), part(roof, 0x7a3b28, 0, { y: 0.9, ry: Math.PI / 4, sx: 1, sz: 1 })], false);
  g.computeVertexNormals(); return g;
}
export function rockGeometry() {
  const g = part(new THREE.DodecahedronGeometry(1, 0), 0x8a8a84, 0, { y: 0.4, sy: 0.7 });
  g.computeVertexNormals(); return g;
}
export function cliffGeometry() {
  const g = part(new THREE.DodecahedronGeometry(1, 0), 0x77736b, 0, { y: 0.6, sy: 1.3 });
  g.computeVertexNormals(); return g;
}
export function vertexColorMaterial() { return new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }); }
