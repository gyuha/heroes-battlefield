// 병종 데이터. 수치(병사당 체력·피해·피해 감소·사거리)는 원본 전장 도감에서 추출한 값이다.
// reach/range 는 원본 단위(px)를 그대로 두고, 시뮬레이션에서 meters() 로 변환한다.
// cls: 렌더링 모델과 상성 규칙을 결정하는 분류.
//   shield 방패 · infantry 검 · spear 창 · shock 돌격보병 · archer 활 · crossbow 쇠뇌 · cav_shock 돌격기병 · cav_raid 습격기병

export const TROOPS = {
  shieldInf: { name: '방패 보병', en: 'Shield Infantry', tier: 1, cls: 'shield', hp: 380, dmg: 44, dr: 0.36, reach: 28,
    ability: '정면 방패벽이 방패 내구가 소진될 때까지 공격을 막아냅니다.', advice: '궁병과 보병을 엄호하고 장창 대열의 측면을 지키세요.', weak: '측면 공격과 방패를 부수는 쇠뇌.' },
  swordInf: { name: '검 보병', en: 'Sword Infantry', tier: 1, cls: 'infantry', hp: 260, dmg: 48, dr: 0.20, reach: 31,
    ability: '검과 방패를 든 근접 보병으로 기동성과 정면 방호의 균형을 갖췄습니다.', advice: '빈틈을 메우고 궁병을 호위하며 경보병을 추격하세요.', weak: '중방패나 장창 대형에 정면으로 돌격하는 것.' },
  spearmen: { name: '창병', en: 'Spearmen', tier: 1, cls: 'spear', hp: 250, dmg: 58, dr: 0.17, reach: 55, brace: 1,
    ability: '제자리를 지키며 창을 세우면 정면 기병 돌격을 막아냅니다.', advice: '기병이 오기 전에 고수 명령으로 대형을 정비하세요.', weak: '이동 중 근접전, 측면과 후방 공격.' },
  shockInf: { name: '돌격 보병', en: 'Shock Infantry', tier: 1, cls: 'shock', hp: 290, dmg: 92, dr: 0.22, reach: 43, multi: 2,
    ability: '넓게 휘둘러 정면의 적을 함께 벱니다.', advice: '방패가 먼저 맞붙게 한 뒤 밀집 대열의 측면을 치세요.', weak: '집중 사격과 정면 기병 돌격.' },
  longbow: { name: '장궁병', en: 'Longbowmen', tier: 1, cls: 'archer', hp: 165, dmg: 61, dr: 0.07, range: 920, reload: 2.6,
    ability: '긴 사거리의 곡사로 낮은 경사를 넘겨 쏩니다.', advice: '고지를 차지하고 궁병과 적 사이에 방패와 창을 두세요.', weak: '근접전과 온전한 방패벽.' },
  crossbow: { name: '쇠뇌병', en: 'Crossbowmen', tier: 1, cls: 'crossbow', hp: 190, dmg: 92, dr: 0.12, range: 760, reload: 3.6, pierce: 1,
    ability: '강력한 관통 화살을 쏘지만 장전이 느립니다.', advice: '중갑병과 좁은 통로에 집중하세요.', weak: '근접전과 사격 사이의 공백.' },
  shockCav: { name: '돌격 기병', en: 'Shock Cavalry', tier: 1, cls: 'cav_shock', hp: 580, dmg: 95, dr: 0.35, reach: 39, charge: 1,
    ability: '도움닫기 중 창을 내리고 적진을 꿰뚫어 돌격합니다. 피해 한도에 도달한 뒤에도 적을 날려 버립니다.', advice: '보병의 측면이나 후방을 친 뒤 빠져나와 재정비하세요.', weak: '창을 세운 장창병과 정면의 중방패.' },
  raidCav: { name: '습격 기병', en: 'Raiding Cavalry', tier: 1, cls: 'cav_raid', hp: 330, dmg: 52, dr: 0.19, reach: 37, charge: 0.6,
    ability: '이동하며 베고 흩어진 병력을 밀쳐냅니다.', advice: '궁병 쪽으로 우회하고 매 공격 후 계속 움직이세요.', weak: '장창, 방패, 정지한 채 오래 끄는 근접전.' },
  ironwall: { name: '철벽 근위대', en: 'Ironwall Guard', tier: 2, cls: 'shield', hp: 600, dmg: 52, dr: 0.40, reach: 30, steady: 1,
    ability: '두꺼운 정면 방패. 정비된 방어 대형은 밀림과 날림에 저항합니다.', advice: '사격을 흡수하고 요충지를 지키거나 공심방진 바깥을 맡기세요.', weak: '측면 공격, 방패를 부수는 쇠뇌, 느린 이동.' },
  royalGuard: { name: '어림 친위대', en: 'Royal Guard', tier: 3, cls: 'shield', hp: 620, dmg: 54, dr: 0.36, reach: 34, counter: 1, steady: 1,
    ability: '정면 공격을 막고 반격합니다. 정비된 방어 대형은 제어 효과에 저항합니다.', advice: '지휘관을 호위하고 적과 맞붙은 뒤 반격하세요.', weak: '후방 공격과 소진된 방패.' },
  linebreaker: { name: '파진 친위대', en: 'Linebreaker Guard', tier: 3, cls: 'infantry', hp: 510, dmg: 44, dr: 0.30, reach: 46, multi: 3,
    ability: '세 번 연속 공격하며 매번 최대 세 명을 휩씁니다.', advice: '방패를 따라 돌파구로 들어가 주변 적을 정리하세요.', weak: '집중 사격과 긴 장창의 사거리.' },
  ironcleaver: { name: '철부 노병', en: 'Ironcleaver Veterans', tier: 2, cls: 'shock', hp: 480, dmg: 64, dr: 0.28, reach: 48, multi: 2,
    ability: '묵직한 세 번의 베기, 매번 최대 두 명을 벱니다.', advice: '밀집 보병의 측면을 치고 지휘관이 지날 길을 여세요.', weak: '공격 사이의 틈과 방패 없음.' },
  halberd: { name: '미늘창 근위대', en: 'Halberd Guard', tier: 2, cls: 'spear', hp: 390, dmg: 65, dr: 0.24, reach: 70, brace: 1.2,
    ability: '창을 세운 긴 휩쓸기로 정면의 기병과 보병을 멈춥니다.', advice: '방패 부대 옆에서 버티며 좁은 접근로를 통제하세요.', weak: '이동 중, 측면이나 후방에 닿은 적.' },
  dragontooth: { name: '용아 장창대', en: 'Dragontooth Pikes', tier: 3, cls: 'spear', hp: 500, dmg: 92, dr: 0.30, reach: 100, brace: 1.5,
    ability: '여섯 걸음에 이르는 매우 긴 장창으로 정면 기병을 멈춥니다.', advice: '앞 열 뒤로 간격을 유지하며 다가오는 적을 꿰뚫으세요.', weak: '근접전에서 느린 방향 전환. 후방을 보호하세요.' },
  apLongbow: { name: '관통 장궁대', en: 'Armor-piercing Longbows', tier: 3, cls: 'archer', hp: 240, dmg: 121, dr: 0.10, range: 1080, reload: 3.0, armorPierce: 0.45,
    ability: '먼 거리의 중화살이 적 갑옷을 평소의 45%로만 취급합니다.', advice: '고지에서 중갑 부대를 노려 앞 열을 얇게 만드세요.', weak: '방패, 근접한 기병, 느린 연사.' },
  heavyXbow: { name: '중쇠뇌 근위대', en: 'Heavy Crossbow Guard', tier: 2, cls: 'crossbow', hp: 300, dmg: 130, dr: 0.16, range: 860, reload: 4.0, pierce: 2, shieldDmg: 1.6,
    ability: '화살이 적 둘을 관통하고 방패에 추가 피해를 줍니다.', advice: '깊은 대형과 좁은 통로를 겨누세요.', weak: '느린 장전. 보병의 보호가 필수입니다.' },
  shieldbreaker: { name: '파순 쇠뇌대', en: 'Shieldbreaker Crossbows', tier: 3, cls: 'crossbow', hp: 340, dmg: 170, dr: 0.20, range: 900, reload: 4.4, pierce: 3, shieldDmg: 2.2,
    ability: '화살이 적 셋을 관통하고 방패에 일반 화살의 두 배 넘는 피해를 줍니다.', advice: '방패벽에 집중한 뒤 돌격 보병을 들여보내세요.', weak: '느린 장전과 이동으로 측면에 취약합니다.' },
  armoredCav: { name: '중장 돌격 기병', en: 'Armored Shock Cavalry', tier: 3, cls: 'cav_shock', hp: 800, dmg: 120, dr: 0.42, reach: 42, charge: 1.3,
    ability: '창과 방패를 든 기병이 돌격마다 최대 네 명에게 피해를 줍니다. 돌격 속도를 유지하면 날림 횟수 제한이 없습니다.', advice: '도움닫기 거리를 두고 측면이나 후방으로 돌격하세요.', weak: '창을 세운 장창과 정면의 온전한 방패. 돌격 후 재정비가 필요합니다.' },
  bloodwolf: { name: '혈랑 기병', en: 'Bloodwolf Riders', tier: 3, cls: 'cav_raid', hp: 510, dmg: 72, dr: 0.25, reach: 42, charge: 0.8,
    ability: '빠른 습격 기병이 이동하며 베고 경보병을 흩어 놓습니다.', advice: '지휘관과 함께 진격해 쇠뇌를 우회하고 패주하는 적을 추격하세요.', weak: '방패 없음. 정면의 장창과 방패는 돌아가세요.' },
};

// 도감 표시 순서(원본 도감 순서와 동일)
export const TROOP_ORDER = ['shieldInf', 'swordInf', 'spearmen', 'shockInf', 'longbow', 'crossbow', 'shockCav', 'raidCav',
  'ironwall', 'royalGuard', 'linebreaker', 'ironcleaver', 'halberd', 'dragontooth', 'apLongbow', 'heavyXbow', 'shieldbreaker', 'armoredCav', 'bloodwolf'];

export const CLASS_INFO = {
  shield: { label: '방패', icon: '⛨', speed: 2.7 },
  infantry: { label: '보병', icon: '⚔', speed: 3.1 },
  spear: { label: '창', icon: '↑', speed: 2.8 },
  shock: { label: '돌격', icon: '⚒', speed: 3.0 },
  archer: { label: '활', icon: '➶', speed: 3.0 },
  crossbow: { label: '쇠뇌', icon: '⊕', speed: 2.7 },
  cav_shock: { label: '기병', icon: '♞', speed: 8.0 },
  cav_raid: { label: '경기병', icon: '♘', speed: 9.0 },
};

export const isCavalry = (cls) => cls === 'cav_shock' || cls === 'cav_raid';
export const isRanged = (cls) => cls === 'archer' || cls === 'crossbow';
// 원본 단위 → 월드 미터. 근접 거리와 사거리는 스케일을 달리한다.
export const reachMeters = (t) => 1.2 + t.reach / 22;
export const rangeMeters = (t) => t.range / 11;
