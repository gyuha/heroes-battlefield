// WebGL 렌더러 하나를 메뉴 배경과 전투 장면이 함께 쓴다.
import * as THREE from 'three';

export class Stage {
  constructor(container) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 1400);
    this.quality = 'high';
    this.resize();
    addEventListener('resize', () => this.resize());
  }
  setQuality(q) {
    const auto = q === 'auto' ? (devicePixelRatio > 1.5 && Math.min(innerWidth, innerHeight) < 700 ? 'medium' : 'high') : q;
    this.quality = auto;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, auto === 'high' ? 2 : auto === 'medium' ? 1.5 : 1));
    this.renderer.shadowMap.enabled = auto !== 'low';
    this.resize();
    return auto;
  }
  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.w = w; this.h = h;
  }
  render(scene, camera = this.camera) { this.renderer.render(scene, camera); }
}
