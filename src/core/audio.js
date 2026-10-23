// Web Audio 로 합성하는 효과음. 외부 음원 없이 모두 코드로 만든다.
export class Audio {
  constructor() { this.ctx = null; this.volume = 0.6; this.last = {}; }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return true; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain(); this.master.gain.value = this.volume; this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      return true;
    } catch { return false; }
  }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }
  throttle(key, ms) { const n = performance.now(); if (n - (this.last[key] ?? 0) < ms) return false; this.last[key] = n; return true; }

  env(node, t, a, peak, dur) { node.gain.setValueAtTime(0.0001, t); node.gain.exponentialRampToValueAtTime(peak, t + a); node.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
  noiseHit({ freq = 900, q = 1, dur = 0.15, gain = 0.4, type = 'bandpass' } = {}) {
    if (!this.ctx || this.volume <= 0) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource(); src.buffer = this.noise; src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain(); this.env(g, t, 0.005, gain, dur);
    src.connect(f).connect(g).connect(this.master); src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  }
  tone({ freq = 440, to, dur = 0.3, type = 'sine', gain = 0.2, delay = 0 } = {}) {
    if (!this.ctx || this.volume <= 0) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = this.ctx.createGain(); this.env(g, t, 0.01, gain, dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  play(name) {
    if (!this.ctx) return;
    switch (name) {
      case 'swing': if (this.throttle('swing', 60)) this.noiseHit({ freq: 1800, q: 0.7, dur: 0.12, gain: 0.18, type: 'highpass' }); break;
      case 'hit': if (this.throttle('hit', 45)) { this.noiseHit({ freq: 600, q: 1.2, dur: 0.12, gain: 0.35 }); this.tone({ freq: 140, to: 60, dur: 0.12, type: 'triangle', gain: 0.25 }); } break;
      case 'clash': if (this.throttle('clash', 90)) this.tone({ freq: 1800 + Math.random() * 900, to: 1200, dur: 0.18, type: 'square', gain: 0.03 }); break;
      case 'arrow': if (this.throttle('arrow', 140)) this.noiseHit({ freq: 3200, q: 2, dur: 0.25, gain: 0.08, type: 'bandpass' }); break;
      case 'heavy': this.tone({ freq: 110, to: 40, dur: 0.35, type: 'sawtooth', gain: 0.25 }); this.noiseHit({ freq: 300, dur: 0.3, gain: 0.4, type: 'lowpass' }); break;
      case 'skill': this.tone({ freq: 520, to: 980, dur: 0.18, type: 'triangle', gain: 0.12 }); this.noiseHit({ freq: 1400, dur: 0.18, gain: 0.2 }); break;
      case 'dodge': this.noiseHit({ freq: 900, dur: 0.18, gain: 0.12, type: 'lowpass' }); break;
      case 'charge': if (this.throttle('charge', 400)) { this.noiseHit({ freq: 200, dur: 0.6, gain: 0.5, type: 'lowpass' }); this.tone({ freq: 70, to: 40, dur: 0.5, type: 'sine', gain: 0.4 }); } break;
      case 'musou': [0, 4, 7, 12].forEach((s, i) => this.tone({ freq: 220 * 2 ** (s / 12), dur: 1.2, type: 'sawtooth', gain: 0.07, delay: i * 0.06 })); this.tone({ freq: 55, to: 110, dur: 1.4, type: 'sine', gain: 0.4 }); break;
      case 'flag': [0, 7, 12].forEach((s, i) => this.tone({ freq: 660 * 2 ** (s / 12), dur: 0.8, type: 'sine', gain: 0.12, delay: i * 0.1 })); break;
      case 'flagLost': [0, -3, -7].forEach((s, i) => this.tone({ freq: 440 * 2 ** (s / 12), dur: 0.7, type: 'triangle', gain: 0.12, delay: i * 0.12 })); break;
      case 'horn': this.tone({ freq: 146, dur: 1.6, type: 'sawtooth', gain: 0.12 }); this.tone({ freq: 220, dur: 1.4, type: 'sawtooth', gain: 0.06, delay: 0.3 }); break;
      case 'victory': [0, 4, 7, 12, 16].forEach((s, i) => this.tone({ freq: 392 * 2 ** (s / 12), dur: 1.0, type: 'triangle', gain: 0.12, delay: i * 0.14 })); break;
      case 'defeat': [0, -5, -9].forEach((s, i) => this.tone({ freq: 196 * 2 ** (s / 12), dur: 1.6, type: 'sine', gain: 0.18, delay: i * 0.35 })); break;
      case 'hurt': if (this.throttle('hurt', 200)) this.tone({ freq: 200, to: 120, dur: 0.15, type: 'square', gain: 0.06 }); break;
      case 'ui': this.tone({ freq: 880, dur: 0.06, type: 'sine', gain: 0.05 }); break;
      case 'thunder': this.noiseHit({ freq: 200, dur: 0.9, gain: 0.6, type: 'lowpass' }); this.noiseHit({ freq: 2400, dur: 0.15, gain: 0.3, type: 'highpass' }); break;
      case 'fire': this.noiseHit({ freq: 500, dur: 0.6, gain: 0.4, type: 'lowpass' }); break;
      default: break;
    }
  }
}
export const audio = new Audio();
