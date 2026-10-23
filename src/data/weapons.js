// 무기 계열별 기술. 원본 규칙: 장비는 능력치를 주지 않고, 무기 계열이 기술 구성만 바꾼다.
// kind: 기술 판정 방식 — dash(전방 돌진 판정), arc(전방 부채꼴), area(주변 원형), special(버프/반격), shot(투사체)
export const WEAPON_TYPES = {
  swordShield: {
    name: '검과 방패', icon: '🛡',
    skills: {
      Q: { name: '돌진 베기', desc: '앞으로 돌진하며 적을 벱니다.', kind: 'dash', cd: 6, power: 1.6, range: 9, width: 2.6 },
      E: { name: '방패 강타', desc: '방패로 주변 적을 강타해 밀어냅니다.', kind: 'arc', cd: 7, power: 1.3, range: 4.2, arc: 2.2, knock: 4 },
      R: { name: '반격', desc: '지휘관 주위를 한 바퀴 베어 반격합니다.', kind: 'area', cd: 11, power: 2.0, range: 5 },
      Y: { name: '방패벽', desc: '방패를 세워 정면 공격을 견딥니다.', kind: 'special', cd: 15, buff: 'guard', time: 5 },
    },
    musou: { name: '천검난무', desc: '검기를 사방으로 연속해서 뿌립니다.', kind: 'storm' },
  },
  greatsword: {
    name: '대검', icon: '🗡',
    skills: {
      Q: { name: '전진 내려베기', desc: '한 걸음 내딛으며 묵직하게 내려칩니다.', kind: 'dash', cd: 6, power: 2.0, range: 6, width: 3 },
      E: { name: '넓게 베기', desc: '넓은 호를 그리며 적을 휩쓸어 벱니다.', kind: 'arc', cd: 7, power: 1.6, range: 5.5, arc: 2.8 },
      R: { name: '회오리', desc: '회전하며 주변 적을 베어 넘깁니다.', kind: 'area', cd: 11, power: 2.4, range: 5.5 },
      Y: { name: '파쇄 일격', desc: '방어를 부수는 일격을 내리칩니다.', kind: 'arc', cd: 14, power: 3.2, range: 5, arc: 1.2, shieldBreak: true },
    },
    musou: { name: '대지 가르기', desc: '땅을 가르는 거대한 참격을 연달아 내리칩니다.', kind: 'storm' },
  },
  polearm: {
    name: '장병기', icon: '🔱',
    skills: {
      Q: { name: '관통 찌르기', desc: '앞의 적들을 꿰뚫어 찌릅니다.', kind: 'dash', cd: 6, power: 1.7, range: 10, width: 2 },
      E: { name: '휩쓸기', desc: '앞 열을 옆으로 쓸어 넘깁니다.', kind: 'arc', cd: 7, power: 1.5, range: 6.5, arc: 2.4, knock: 3 },
      R: { name: '돌파', desc: '지휘관 주변의 공간을 확보합니다.', kind: 'area', cd: 11, power: 2.0, range: 6, knock: 5 },
      Y: { name: '창 세우기', desc: '창을 세워 정면으로 오는 적에게 반격합니다.', kind: 'special', cd: 15, buff: 'brace', time: 5 },
    },
    musou: { name: '연환 찌르기', desc: '눈에 보이지 않을 만큼 빠른 찌르기를 퍼붓습니다.', kind: 'storm' },
  },
  bow: {
    name: '활 · 쇠뇌', icon: '🏹',
    skills: {
      Q: { name: '조준 사격', desc: '강력한 화살을 조준해 쏩니다.', kind: 'shot', cd: 5, power: 3.0, range: 60, pierce: 2 },
      E: { name: '이동 사격', desc: '뒤로 물러나며 화살을 날립니다.', kind: 'shot', cd: 6, power: 1.6, range: 45, step: -6, pierce: 1 },
      R: { name: '관통 사격', desc: '일직선의 적을 꿰뚫는 화살을 쏩니다.', kind: 'shot', cd: 10, power: 2.4, range: 70, pierce: 12 },
      Y: { name: '신속 장전', desc: '잠시 동안 연사 속도가 크게 오릅니다.', kind: 'special', cd: 15, buff: 'haste', time: 6 },
    },
    musou: { name: '화살비', desc: '하늘을 뒤덮는 화살비를 쏟아붓습니다.', kind: 'rain' },
  },
  focus: {
    name: '법구', icon: '✨',
    skills: {
      Q: { name: '화염구', desc: '적진에 불덩이를 던집니다.', kind: 'blast', cd: 6, power: 2.0, range: 28, radius: 5 },
      E: { name: '치유의 빛', desc: '주변 아군과 자신을 회복합니다.', kind: 'special', cd: 14, buff: 'heal', time: 0 },
      R: { name: '낙뢰', desc: '번개로 적을 내리칩니다.', kind: 'blast', cd: 10, power: 2.8, range: 32, radius: 6 },
      Y: { name: '수호 결계', desc: '자신과 주변 아군에게 보호막을 칩니다.', kind: 'special', cd: 16, buff: 'ward', time: 6 },
    },
    musou: { name: '천뢰', desc: '하늘에서 수많은 벼락이 쏟아집니다.', kind: 'rain' },
  },
};

export const WEAPON_ORDER = ['swordShield', 'greatsword', 'polearm', 'bow', 'focus'];

// 무기고: 외형 장비. 능력치 없음.
export const ARMORY = {
  weapon: [
    { id: 'oathSword', name: '맹세의 검과 방패', type: 'swordShield' },
    { id: 'templarBlade', name: '성전 기사의 대검', type: 'greatsword' },
    { id: 'dragonGlaive', name: '용아 장창', type: 'polearm' },
    { id: 'cavalryLance', name: '성기사 기창', type: 'polearm' },
    { id: 'shadowBow', name: '그림자 장궁', type: 'bow' },
    { id: 'highlandXbow', name: '고원 쇠뇌', type: 'bow' },
    { id: 'angelStaff', name: '천사의 지팡이', type: 'focus' },
  ],
  armor: [
    { id: 'plateI', name: '판금 갑옷 Ⅰ', color: 0x9aa3ad }, { id: 'plateII', name: '판금 갑옷 Ⅱ', color: 0xc7ccd2 },
    { id: 'plateIII', name: '판금 갑옷 Ⅲ', color: 0xd9b45a }, { id: 'scaleI', name: '찰갑 Ⅰ', color: 0x6b5a45 },
    { id: 'scaleII', name: '찰갑 Ⅱ', color: 0x8c3b2f }, { id: 'darkIII', name: '흑철 갑옷 Ⅲ', color: 0x2f3338 },
  ],
  helmet: [
    { id: 'none', name: '투구 없음' }, { id: 'kettle', name: '철모' }, { id: 'great', name: '대투구' }, { id: 'plume', name: '깃털 장식 투구' },
  ],
  cloak: [
    { id: 'none', name: '망토 없음' }, { id: 'oath', name: '맹세의 망토' }, { id: 'ember', name: '잿불 망토' },
  ],
  mount: [
    { id: 'foot', name: '도보' }, { id: 'bay', name: '밤색 말', color: 0x6b3d22 }, { id: 'black', name: '흑마', color: 0x1d1b1a }, { id: 'grey', name: '회색 말', color: 0x9c9a95 },
  ],
  barding: [
    { id: 'none', name: '마갑 없음' }, { id: 'sacred', name: '성기사 마갑' }, { id: 'ember', name: '잿불 마갑' },
  ],
};

export const ARMORY_LABELS = { weapon: '무기', armor: '갑옷', helmet: '투구', cloak: '망토', mount: '탈것', barding: '마갑' };

export function weaponTypeOf(weaponId) {
  return ARMORY.weapon.find((w) => w.id === weaponId)?.type ?? 'polearm';
}
