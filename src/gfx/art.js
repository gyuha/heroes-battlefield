// 캔버스로 그리는 새 리소스: 문장(군기), 초상화 40종, 부대 표지, 발광 텍스처.
import { seededRandom } from '../core/rules.js';

export const DIVISIONS = { solid: '단색', pale: '세로 2분할', fess: '가로 2분할', bend: '우사선 분할', bendSinister: '좌사선 분할', quarterly: '4분할', saltire: 'X자 분할', chevron: '산형 분할', paly: '세로 줄무늬', barry: '가로 줄무늬', chequy: '체크무늬' };
export const ORDINARIES = { none: '없음', cross: '십자', saltire: 'X자', chevron: '산형띠', fess: '가로띠', pale: '세로띠', bend: '사선띠', chief: '상단띠', bordure: '테두리', roundel: '원판' };
const HAN = ['楚', '漢', '秦', '趙', '齊', '魏', '蜀', '吳', '唐', '宋', '金', '梁', '燕', '夏', '鄭', '新', '李', '項', '劉', '曹', '孫', '岳', '霍', '衛', '陳', '王', '英', '法', '蘇', '羅', '迦'];
export const CHARGES = {
  none: { name: '없음' }, star: { name: '별', glyph: '★' }, sun: { name: '태양', glyph: '☀' }, crescent: { name: '초승달', glyph: '☾' },
  fleur: { name: '백합', glyph: '⚜' }, crown: { name: '왕관', glyph: '♛' }, tower: { name: '탑', glyph: '♜' }, horse: { name: '말', glyph: '♞' },
  swords: { name: '교차한 검', glyph: '⚔' }, anchor: { name: '닻', glyph: '⚓' }, rose: { name: '장미', glyph: '✿' }, maltese: { name: '몰타 십자', glyph: '✠' },
  eagle: { name: '독수리', path: true }, lion: { name: '사자 머리', path: true }, dragon: { name: '용', path: true },
  ...Object.fromEntries(HAN.map((h) => ['han' + h, { name: `한자 · ${h}`, glyph: h, han: true }])),
};
export const PRESETS = [
  { name: '주홍과 금', colors: ['#8c2b25', '#e8d9a8', '#c9a75a', '#f2d17a'] },
  { name: '청람과 은', colors: ['#24406e', '#d8dde3', '#c7ccd2', '#eef2f6'] },
  { name: '청록과 금', colors: ['#1f5f5b', '#e8d9a8', '#c9a75a', '#f2e6c4'] },
  { name: '흑과 금', colors: ['#1d1b1a', '#c9a75a', '#c9a75a', '#e8c46a'] },
  { name: '자주와 은', colors: ['#4b2a63', '#d8dde3', '#c7ccd2', '#f0eaf6'] },
];

function shieldPath(ctx, w, h) {
  ctx.beginPath();
  ctx.moveTo(w * 0.08, h * 0.06);
  ctx.lineTo(w * 0.92, h * 0.06);
  ctx.lineTo(w * 0.92, h * 0.5);
  ctx.quadraticCurveTo(w * 0.9, h * 0.82, w * 0.5, h * 0.96);
  ctx.quadraticCurveTo(w * 0.1, h * 0.82, w * 0.08, h * 0.5);
  ctx.closePath();
}

const PATHS = {
  eagle: [[0.5, 0.18], [0.56, 0.3], [0.62, 0.32], [0.86, 0.22], [0.8, 0.38], [0.9, 0.4], [0.78, 0.5], [0.84, 0.56], [0.66, 0.56], [0.6, 0.66], [0.66, 0.82], [0.56, 0.74], [0.5, 0.86], [0.44, 0.74], [0.34, 0.82], [0.4, 0.66], [0.34, 0.56], [0.16, 0.56], [0.22, 0.5], [0.1, 0.4], [0.2, 0.38], [0.14, 0.22], [0.38, 0.32], [0.44, 0.3]],
  lion: [[0.5, 0.2], [0.62, 0.24], [0.72, 0.2], [0.74, 0.34], [0.82, 0.42], [0.74, 0.5], [0.78, 0.62], [0.66, 0.64], [0.6, 0.78], [0.5, 0.72], [0.4, 0.78], [0.34, 0.64], [0.22, 0.62], [0.26, 0.5], [0.18, 0.42], [0.26, 0.34], [0.28, 0.2], [0.38, 0.24]],
  dragon: [[0.24, 0.3], [0.4, 0.22], [0.56, 0.26], [0.7, 0.2], [0.82, 0.28], [0.74, 0.34], [0.66, 0.32], [0.62, 0.44], [0.76, 0.5], [0.72, 0.62], [0.58, 0.58], [0.5, 0.7], [0.62, 0.82], [0.44, 0.8], [0.4, 0.66], [0.3, 0.58], [0.36, 0.46], [0.28, 0.4]],
};

/** 문장 그리기. crest: {division, ordinary, charge, colors[4]} */
export function drawCrest(canvas, crest, { frame = true } = {}) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const [c1, c2, c3, c4] = crest.colors;
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  shieldPath(ctx, w, h);
  ctx.clip();
  ctx.fillStyle = c1; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = c2;
  switch (crest.division) {
    case 'pale': ctx.fillRect(w / 2, 0, w / 2, h); break;
    case 'fess': ctx.fillRect(0, h * 0.48, w, h); break;
    case 'bend': ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.fill(); break;
    case 'bendSinister': ctx.beginPath(); ctx.moveTo(w, 0); ctx.lineTo(0, h); ctx.lineTo(w, h); ctx.fill(); break;
    case 'quarterly': ctx.fillRect(w / 2, 0, w / 2, h * 0.48); ctx.fillRect(0, h * 0.48, w / 2, h); break;
    case 'saltire': ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w / 2, h * 0.48); ctx.lineTo(0, h); ctx.fill(); ctx.beginPath(); ctx.moveTo(w, 0); ctx.lineTo(w / 2, h * 0.48); ctx.lineTo(w, h); ctx.fill(); break;
    case 'chevron': ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(w / 2, h * 0.38); ctx.lineTo(w, h); ctx.fill(); break;
    case 'paly': for (let i = 1; i < 6; i += 2) ctx.fillRect((i * w) / 6, 0, w / 6, h); break;
    case 'barry': for (let i = 1; i < 8; i += 2) ctx.fillRect(0, (i * h) / 8, w, h / 8); break;
    case 'chequy': for (let i = 0; i < 6; i++) for (let j = 0; j < 7; j++) if ((i + j) % 2) ctx.fillRect((i * w) / 6, (j * h) / 7, w / 6, h / 7); break;
    default: break;
  }
  ctx.fillStyle = c3; ctx.strokeStyle = c3;
  const bw = w * 0.16;
  switch (crest.ordinary) {
    case 'cross': ctx.fillRect(w / 2 - bw / 2, 0, bw, h); ctx.fillRect(0, h * 0.42 - bw / 2, w, bw); break;
    case 'saltire': ctx.lineWidth = bw; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w, h); ctx.moveTo(w, 0); ctx.lineTo(0, h); ctx.stroke(); break;
    case 'chevron': ctx.lineWidth = bw; ctx.beginPath(); ctx.moveTo(0, h * 0.85); ctx.lineTo(w / 2, h * 0.38); ctx.lineTo(w, h * 0.85); ctx.stroke(); break;
    case 'fess': ctx.fillRect(0, h * 0.42 - bw / 2, w, bw); break;
    case 'pale': ctx.fillRect(w / 2 - bw / 2, 0, bw, h); break;
    case 'bend': ctx.lineWidth = bw; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w, h); ctx.stroke(); break;
    case 'chief': ctx.fillRect(0, 0, w, h * 0.26); break;
    case 'bordure': ctx.lineWidth = w * 0.14; shieldPath(ctx, w, h); ctx.stroke(); break;
    case 'roundel': ctx.beginPath(); ctx.arc(w / 2, h * 0.46, w * 0.3, 0, Math.PI * 2); ctx.fill(); break;
    default: break;
  }
  const ch = CHARGES[crest.charge];
  if (ch && crest.charge !== 'none') {
    ctx.fillStyle = c4;
    ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = w * 0.03; ctx.shadowOffsetY = w * 0.01;
    if (ch.path) {
      ctx.beginPath();
      PATHS[crest.charge].forEach(([px, py], i) => { const x = w * (0.12 + px * 0.76), y = h * (0.06 + py * 0.8); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.closePath(); ctx.fill();
    } else {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const size = ch.han ? h * 0.46 : h * 0.5;
      ctx.font = `${ch.han ? 700 : 400} ${size}px ${ch.han ? '"Songti TC","Noto Serif CJK TC","AppleMyungjo",serif' : '"Apple Symbols","Segoe UI Symbol","Noto Sans Symbols2",serif'}`;
      ctx.fillText(ch.glyph, w / 2, h * 0.47);
    }
  }
  ctx.restore();
  if (frame) {
    ctx.lineWidth = Math.max(2, w * 0.035);
    ctx.strokeStyle = '#d8b56a';
    shieldPath(ctx, w, h); ctx.stroke();
  }
  return canvas;
}

export function crestCanvas(crest, size = 128) {
  const c = document.createElement('canvas');
  c.width = size; c.height = Math.round(size * 1.12);
  return drawCrest(c, crest);
}

// ───────── 초상화 40종(남 24, 여 16) ─────────
const SKIN = ['#f1c9a5', '#e0ac85', '#c98e64', '#a86f4b', '#7f5136', '#f5d6bd'];
const HAIR = [['#2a1d16', '흑발'], ['#5a3420', '갈색 머리'], ['#8a5a2b', '밤색 머리'], ['#c9a35a', '금발'], ['#a8a39a', '은발'], ['#7a2a1a', '적발'], ['#d9d4c8', '백발']];
const ARMOR = [['#9aa3ad', '판금'], ['#c7ccd2', '은갑'], ['#d9b45a', '금장'], ['#6b5a45', '찰갑'], ['#8c3b2f', '주홍 갑'], ['#2f3338', '흑철'], ['#3d5a46', '녹피']];
const ROLE_M = ['기사', '창기병', '궁사', '검객', '장수', '수호자', '책사', '돌격대장'];
const ROLE_F = ['여기사', '궁수', '검무사', '여장군', '수호자', '책사', '창술사', '기마궁사'];

export function portraitInfo(i) {
  const r = seededRandom(i * 977 + 31);
  const female = i >= 24;
  const skin = SKIN[Math.floor(r() * SKIN.length)];
  const hair = HAIR[(i * 3 + Math.floor(r() * 3)) % HAIR.length];
  const armor = ARMOR[(i * 5 + Math.floor(r() * 2)) % ARMOR.length];
  const role = (female ? ROLE_F : ROLE_M)[i % 8];
  const style = Math.floor(r() * 4);
  const beard = !female && r() < 0.45;
  const helm = r() < 0.22;
  const bg = `hsl(${Math.floor(r() * 360)}, 32%, ${22 + Math.floor(r() * 10)}%)`;
  const cloak = `hsl(${Math.floor(r() * 360)}, 55%, 32%)`;
  return { i, female, skin, hair: hair[0], armor: armor[0], style, beard, helm, bg, cloak, name: `${hair[1]}의 ${armor[1]} ${role}`, scar: r() < 0.2 };
}

export function drawPortrait(canvas, index) {
  const p = portraitInfo(index);
  const ctx = canvas.getContext('2d');
  const s = canvas.width;
  const u = s / 100;
  const g = ctx.createRadialGradient(s * 0.5, s * 0.35, s * 0.1, s * 0.5, s * 0.5, s * 0.75);
  g.addColorStop(0, p.bg.replace(/(\d+)%\)$/, (m, l) => `${+l + 16}%)`)); g.addColorStop(1, p.bg);
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  // 망토·어깨
  ctx.fillStyle = p.cloak;
  ctx.beginPath(); ctx.moveTo(4 * u, 100 * u); ctx.quadraticCurveTo(10 * u, 70 * u, 30 * u, 66 * u); ctx.lineTo(70 * u, 66 * u); ctx.quadraticCurveTo(90 * u, 70 * u, 96 * u, 100 * u); ctx.fill();
  ctx.fillStyle = p.armor;
  ctx.beginPath(); ctx.moveTo(16 * u, 100 * u); ctx.quadraticCurveTo(20 * u, 74 * u, 36 * u, 70 * u); ctx.lineTo(64 * u, 70 * u); ctx.quadraticCurveTo(80 * u, 74 * u, 84 * u, 100 * u); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1.5 * u;
  ctx.beginPath(); ctx.moveTo(36 * u, 78 * u); ctx.lineTo(50 * u, 88 * u); ctx.lineTo(64 * u, 78 * u); ctx.stroke();
  // 목
  ctx.fillStyle = p.skin; ctx.fillRect(43 * u, 56 * u, 14 * u, 16 * u);
  // 뒷머리(긴 머리)
  ctx.fillStyle = p.hair;
  if (p.female && p.style !== 1) { ctx.beginPath(); ctx.ellipse(50 * u, 50 * u, 22 * u, 28 * u, 0, 0, Math.PI * 2); ctx.fill(); }
  // 얼굴
  ctx.fillStyle = p.skin;
  ctx.beginPath(); ctx.ellipse(50 * u, 42 * u, p.female ? 15 * u : 16 * u, p.female ? 19 * u : 20 * u, 0, 0, Math.PI * 2); ctx.fill();
  // 그림자
  ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.beginPath(); ctx.ellipse(56 * u, 46 * u, 9 * u, 15 * u, 0, -1, 1.6); ctx.fill();
  // 눈·눈썹
  ctx.fillStyle = '#1b1410';
  ctx.beginPath(); ctx.ellipse(44 * u, 41 * u, 2.2 * u, 1.6 * u, 0, 0, Math.PI * 2); ctx.ellipse(56 * u, 41 * u, 2.2 * u, 1.6 * u, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = p.hair; ctx.lineWidth = (p.female ? 1.4 : 2.4) * u;
  ctx.beginPath(); ctx.moveTo(40 * u, 36 * u); ctx.lineTo(47 * u, 35 * u); ctx.moveTo(53 * u, 35 * u); ctx.lineTo(60 * u, 36 * u); ctx.stroke();
  ctx.strokeStyle = 'rgba(80,40,30,0.7)'; ctx.lineWidth = 1.4 * u;
  ctx.beginPath(); ctx.moveTo(46 * u, 53 * u); ctx.quadraticCurveTo(50 * u, 55 * u, 54 * u, 53 * u); ctx.stroke();
  if (p.scar) { ctx.strokeStyle = 'rgba(140,50,40,0.8)'; ctx.beginPath(); ctx.moveTo(57 * u, 36 * u); ctx.lineTo(61 * u, 48 * u); ctx.stroke(); }
  // 수염
  if (p.beard) { ctx.fillStyle = p.hair; ctx.beginPath(); ctx.moveTo(36 * u, 46 * u); ctx.quadraticCurveTo(50 * u, 72 * u, 64 * u, 46 * u); ctx.quadraticCurveTo(50 * u, 58 * u, 36 * u, 46 * u); ctx.fill(); }
  // 앞머리 / 투구
  if (p.helm) {
    ctx.fillStyle = p.armor; ctx.beginPath(); ctx.ellipse(50 * u, 30 * u, 19 * u, 15 * u, 0, Math.PI, 0); ctx.fill();
    ctx.fillRect(31 * u, 29 * u, 38 * u, 5 * u);
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(48 * u, 16 * u, 4 * u, 14 * u);
  } else {
    ctx.fillStyle = p.hair;
    ctx.beginPath(); ctx.ellipse(50 * u, 28 * u, 18 * u, 11 * u, 0, Math.PI, 0); ctx.fill();
    if (p.style === 0) { ctx.beginPath(); ctx.moveTo(32 * u, 30 * u); ctx.lineTo(44 * u, 36 * u); ctx.lineTo(50 * u, 28 * u); ctx.lineTo(58 * u, 35 * u); ctx.lineTo(68 * u, 30 * u); ctx.lineTo(68 * u, 24 * u); ctx.lineTo(32 * u, 24 * u); ctx.fill(); }
    if (p.style === 2) { ctx.beginPath(); ctx.arc(50 * u, 14 * u, 7 * u, 0, Math.PI * 2); ctx.fill(); }
    if (p.style === 3 && p.female) { ctx.fillRect(30 * u, 28 * u, 6 * u, 32 * u); ctx.fillRect(64 * u, 28 * u, 6 * u, 32 * u); }
  }
  // 테두리 빛
  const v = ctx.createRadialGradient(s / 2, s / 2, s * 0.35, s / 2, s / 2, s * 0.72);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, s, s);
  return canvas;
}

const portraitCache = new Map();
export function portraitURL(index, size = 128) {
  const key = `${index}:${size}`;
  if (!portraitCache.has(key)) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    drawPortrait(c, index);
    portraitCache.set(key, c.toDataURL());
  }
  return portraitCache.get(key);
}
export function crestURL(crest, size = 96) { return crestCanvas(crest, size).toDataURL(); }

// ───────── 3D 표지용 텍스처 ─────────
export function glowCanvas(size = 64, inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner); g.addColorStop(1, outer);
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  return c;
}

function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

/** 부대 표지: 병종 아이콘 + 병력 수. */
export function drawUnitTag(canvas, { side, icon, troops, selected, routing, ai, name, big }) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const base = side === 'A' ? (routing ? '#6b3a35' : '#b3352c') : (routing ? '#3a4660' : '#2f5fa8');
  roundRect(ctx, 3, 3, w - 6, h - 6, 10);
  ctx.fillStyle = base; ctx.fill();
  ctx.lineWidth = selected ? 6 : 3; ctx.strokeStyle = selected ? '#ffe28a' : 'rgba(255,240,210,0.8)'; ctx.stroke();
  ctx.fillStyle = '#fff6e0'; ctx.textBaseline = 'middle';
  ctx.font = `bold ${h * 0.48}px "Apple Symbols","Segoe UI Symbol",sans-serif`;
  ctx.textAlign = 'center'; ctx.fillText(icon, h * 0.5, h * 0.53);
  ctx.font = `bold ${h * 0.44}px "Apple SD Gothic Neo","Malgun Gothic",sans-serif`;
  ctx.textAlign = 'left'; ctx.fillText(routing ? '패주' : String(Math.round(troops)), h * 0.95, h * 0.53);
  if (ai && side === 'A') { ctx.font = `bold ${h * 0.26}px sans-serif`; ctx.fillStyle = '#bfe8ff'; ctx.textAlign = 'right'; ctx.fillText('AI', w - 12, h * 0.3); }
  if (big && name) { ctx.font = `${h * 0.24}px "Apple SD Gothic Neo",sans-serif`; ctx.fillStyle = '#fff6e0'; ctx.textAlign = 'right'; ctx.fillText(name, w - 12, h * 0.78); }
}

/** 이름표 + 체력 막대. */
export function drawNameplate(canvas, { name, hp, max, color = '#ffd36a', bar = '#e8c45a' }) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.font = `bold ${h * 0.42}px "Apple SD Gothic Neo","Malgun Gothic",sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.strokeText(name, w / 2, h * 0.32);
  ctx.fillStyle = color; ctx.fillText(name, w / 2, h * 0.32);
  if (max) {
    const bw = w * 0.62, bx = (w - bw) / 2, by = h * 0.68, bh = h * 0.16;
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
    ctx.fillStyle = bar; ctx.fillRect(bx, by, bw * Math.max(0, hp / max), bh);
  }
}

export function drawFlagCloth(canvas, { owner, crest, label }) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.fillStyle = owner === 'A' ? '#a8322a' : owner === 'B' ? '#2c5a9e' : '#8a826e';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(0, 0, w, h * 0.12); ctx.fillRect(0, h * 0.88, w, h * 0.12);
  if (owner === 'A' && crest) { const c = crestCanvas(crest, Math.round(h * 0.7)); ctx.drawImage(c, w / 2 - c.width / 2, h * 0.12, c.width, c.height * 0.85); }
  else { ctx.fillStyle = '#f2e6c4'; ctx.font = `bold ${h * 0.5}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label ?? '旗', w / 2, h / 2); }
}
