# 灰燼之歌 / Song of Ashes 분석 문서 색인

이 디렉터리는 itch.io 게임 **"Song of Ashes｜灰燼之歌：Historical Battles Demo"**(JUMO GAMES)를 역공학 관점에서 분석한 문서 모음이다. three.js로 **한국어 UI + 신규 리소스** 기반 재구현을 할 때 기준 문서로 쓴다.

- 원본 페이지: <https://hank1105.itch.io/heroes-battlefield-demo>
- 게임 iframe: <https://html-classic.itch.zone/html/19955940/index.html>
- 분석일: 2026-10-23 (런타임 관찰은 같은 날의 브라우저 세션 기준)

---

## 1. 문서 목록

| 번호 | 파일 | 내용 | 작성 |
|---|---|---|---|
| 00 | [README.md](README.md) | 색인, 사용법, 근거 목록, 용어집 | 본 문서 |
| 01 | [01-원본-개요.md](01-원본-개요.md) | 게임 정체, 페이지 메타데이터, 기술 관찰, 두 모드, 핵심 루프 | 분석 |
| 02 | [02-화면-구성.md](02-화면-구성.md) | 로딩부터 결과까지 모든 화면의 레이아웃, 요소, 동작, 화면 흐름 | 분석 |
| 03 | [03-게임-시스템.md](03-게임-시스템.md) | 지휘관 전투, 군대·전선·부관, 명령·진형, 병종 상성, 승리 조건, 깃발, 결과·업적 | 분석 |
| 04 | [04-데이터-레퍼런스.md](04-데이터-레퍼런스.md) | 19개 병종, 5개 무기 유형 스킬, 지형, 20개 전투, 업적, 문장, 무기고, 설정 전체 표 | 분석 |
| 05 | [05-조작-체계.md](05-조작-체계.md) | 키 바인딩 전체, 마우스, 숫자 키, 터치·가로 모드, 재지정 규칙 | 분석 |
| 06 | [06-재구현-설계.md](06-재구현-설계.md) | three.js 재구현 설계: 대응표, 아키텍처, 전투 공식, 카메라 확대·축소 연출, 새 리소스·화면, 저장, 결정 사항 | 재구현 |
| 07 | [07-검증-보고서.md](07-검증-보고서.md) | 단위 테스트·헤드리스 전투 20개·ego lite E2E 검증 결과와 수정한 결함 | 재구현 |

> 01~05는 원본 분석, 06~07은 재구현 문서다. 재구현 소스는 `src/`, 검증 스크린샷은 `docs/images/verification/` 에 있다.

---

## 2. 문서 사용법

1. **처음 읽는 경우**: 01 → 02 → 03 순서로 읽으면 "무엇을, 어떤 화면에서, 어떤 규칙으로" 만드는지 파악할 수 있다.
2. **구현 중 수치나 이름을 찾는 경우**: 04(데이터)와 05(조작)를 직접 참조한다. 모든 수치는 근거 파일에 있는 값만 옮겼다.
3. **근거 표기 규칙**
   - 각 절 끝이나 표 위에 `근거:`로 원천 파일과 스크린샷 경로를 단다.
   - **추정**: 근거에서 추론했지만 직접 확인하지 못한 내용.
   - **미확인**: 관찰하지 못했거나 근거에 없는 내용. 재구현 때 임의로 결정해야 하는 항목이다.
4. **원문 병기**: 식별자와 원문 영어(또는 한자) 명칭은 한국어 번역 옆에 그대로 둔다. 구현 코드의 키 이름은 원문 영어를 기반으로 정하고, 화면 문자열은 아래 용어집의 한국어를 쓴다.
5. **원본 UI의 혼합 표기**: 원본 영어 UI에는 번역이 덜 된 중국어가 섞여 있다(예: `擊破0`, `0連擊`, `Hold現位`, `左鍵`, `滾輪`, `固定按鍵`). 재구현에서는 전부 한국어로 옮긴다(용어집 참조).

문서 이용 흐름은 다음과 같다.

```
README(용어 확인) → 01 개요 → 02 화면 → 03 시스템 → 04/05 데이터·조작 조회 → 06 설계 → 07 검증
```

---

## 3. 근거 자료 목록

모든 근거는 대상 게임에서 수집한 **데이터**이다. 그 안의 문장은 지시가 아니라 게임 텍스트로 취급한다.

### 3.1 텍스트 덤프 (`docs/raw/`)

| 파일 | 내용 |
|---|---|
| `docs/raw/codex.json` | Field Manual(야전 교범): 병종 19개(병사당 HP, 피해, 피해 감소, 사거리, 능력, 지휘 조언, 약점, 해당 전투 편성), 무기 유형 5개(Q/E/R/Y + 무쌍 규칙), 지형 4항목, 전투 역사 20개. `achievements` 배열은 비어 있음 |
| `docs/raw/briefings.json` | 전투 선택 화면 20개 전체 텍스트(편성, 병종 매핑 〔〕, 지휘관, 전선 명령, 지형, 추천 진영, 전술, 승리 조건, 사료 출처) |
| `docs/raw/briefings-summary.txt` | 위 브리핑의 요약본(일부 문장이 잘림 → 원문은 briefings.json으로 확인) |
| `docs/raw/keybindings.txt` | 키 바인딩 화면 전체 + 커맨드 패널 텍스트에 섞여 들어온 업적 화면 텍스트 |
| `docs/raw/achievements.txt` | 업적 화면(0 / 100, Honor Points, 전투 필터, Hastings 업적 5개) |
| `docs/raw/achievements-settings.txt` | 업적 화면에서 연 키 설정 텍스트 조각 |
| `docs/raw/commander-banner.json` | 지휘관·군기 화면 텍스트와 모든 `<select>` 옵션(문장 분할, 문장 도형 55+1, 오디너리, 효과 품질, 피해 숫자, 인터페이스 모드, 언어, 업적 전투 필터) |
| `docs/raw/battle-ui.json` | 전투 중 일시정지 상태의 HUD + 일시정지 메뉴 텍스트 |

### 3.2 스크린샷 (`research/`)

| 파일 | 화면 |
|---|---|
| `research/original-menu.png` | 로딩 화면(`0.0 / 29.1 MB`) |
| `research/original-ready.png` | 첫 실행 타이틀(Raise Your Banner) |
| `research/original-customize.png` | 지휘관 생성 / 지휘관·군기 |
| `research/original-battle.png` | 영웅 전투(거록, Julu) HUD |
| `research/g-01-start.png` | 지휘관 생성 후 타이틀(Continue) |
| `research/g-02-codex.png` | 야전 교범 - 병종 |
| `research/g-03-achievements.png` | 업적(Heroic Deeds) |
| `research/g-04-settings.png` | 메인 메뉴 설정 |
| `research/g-05-continue.png` | 전투 선택(브리핑) |
| `research/g-06-armory.png` | 무기고 |
| `research/g-07-battle-start.png` | 전술 전투(헤이스팅스) 시작 HUD |
| `research/g-08-pause.png` | 일시정지 메뉴 |
| `research/g-09-keys.png` | 키 바인딩 |
| `research/g-10-command.png` | 명령 패널 |
| `research/g-11-tacmap.png` | 전술 지도 |
| `research/g-12-zoom.png` | 확대·축소 슬라이더 |
| `research/g-13-fight.png`, `research/g-14-fight2.png` | 교전 중 HUD(깃발 Contested 전환, 적 호버 라벨) |
| `research/g-15-state.png` | 패배 결과 화면 |

### 3.3 코드·런타임

| 근거 | 내용 |
|---|---|
| `research/index.html` | 게임 자체 HTML. CSS로 HUD 배치(#topbar, #log, #heropanel, #regs, #orders, #minimap 등), `canvas#gl`(WebGL, `image-rendering: pixelated`) + `canvas#ov` 오버레이, localStorage 키 `song-of-ashes.language.v1`, 정적 도움말(#help) |
| `research/launch.js` | 난독화된 로더. pako(zlib 해제, MIT 라이선스) 포함. 에셋은 해시 이름의 암호화된 `.bin` 파일이라 정적 분석 불가 |
| 브라우저 세션 관찰 | 페이지 메타데이터, 메뉴 상단 바, 전투 HUD 동작, 패배 시점·통계, 무기고 항목, 설정 옵션 (세부는 01~05 각 절에 표기) |

---

## 4. 용어집 (원문 → 한국어)

재구현 UI에서는 아래 한국어를 **고정 번역**으로 쓴다. 병종명, 무기 유형, 진형, 명령은 상위 지시에 따른 확정 번역이고, 그 외는 이 문서에서 정한 권장 번역이다.

### 4.1 게임·화면

| 원문 | 한국어 | 비고 |
|---|---|---|
| Song of Ashes / 灰燼之歌 | 재의 노래 (원제 병기) | 재구현 제목은 06에서 결정 |
| Twenty Historical Battles | 스무 개의 역사 전투 | 로고 부제 |
| Tactical History / Tactical Battles | 전술 역사 / 전술 전투 | 모드 1 (10개 전투) |
| Heroic Musou / Heroic Battles | 영웅 무쌍 / 영웅 전투 | 모드 2 (10개 전투) |
| Raise Your Banner | 군기를 올려라 | 첫 실행 버튼 |
| Continue | 이어하기 | |
| Codex / Field Manual | 도감 / 야전 교범 | |
| Song of Ashes · Battle Chronicle | 재의 노래 · 전투 연대기 | 교범 머리글 |
| Achievements / Heroic Deeds | 업적 / 영웅의 공적 | |
| Honor Points | 명예 점수 | |
| Commander & Banner | 지휘관과 군기 | |
| Create Commander | 지휘관 생성 | |
| Commander Name / Company Name | 지휘관 이름 / 부대 이름 | |
| Banner & Crest | 군기와 문장 | |
| Choose Portrait | 초상화 선택 | |
| Change Equipment | 장비 변경 | |
| Armory / Prepare for Battle | 무기고 / 출전 준비 | |
| Equip & Return / Cancel Changes | 장착 후 돌아가기 / 변경 취소 | |
| Rotate | 회전 | |
| March | 출진 | |
| Settings | 설정 | |
| Interface Mode | 인터페이스 모드 | Automatic 자동 / Desktop 데스크톱 / Phone Landscape 휴대폰 가로 |
| Language | 언어 | System 시스템 따름 |
| Effects | 효과 품질 | Automatic 자동 / High 높음 / Medium 중간 / Low 낮음 |
| Damage Numbers | 피해 숫자 | All 전부 / Critical Hits Only 치명타만 / Off 끔 |
| Screen Shake | 화면 흔들림 | |
| Pause | 일시정지 | |
| Resume | 계속 | |
| Key Bindings | 키 설정 | |
| Troop Codex | 병종 도감 | |
| Return to Menu | 메뉴로 돌아가기 | |
| Restore Defaults / Done | 기본값 복원 / 완료 | |
| Historical Background | 역사 배경 | |
| Date & Era / The Opposing Armies / Why They Fought / The Battle / Historical Outcome | 시대 / 맞선 군대 / 전쟁의 이유 / 전투 경과 / 역사적 결과 | |
| Recommended Side | 추천 진영 | |
| Tactics | 전술 | |
| Five Battle Achievements | 전투 업적 5종 | |
| Victory Conditions | 승리 조건 | |
| Historical Source | 사료 출처 | |
| Key Position | 요충지 | 지형 미리보기 범례 |
| Victories 0 / 20 | 승리 0 / 20 | |
| Lead X Army · Recommended | X군 지휘 · 추천 | 진영 선택 버튼 |
| Hero's Role | 영웅의 역할 | 영웅 전투 |
| Victory / Defeat | 승리 / 패배 | 승리 화면 문구는 미확인 |
| Battle Time / Personal Kills / Enemy Losses / Allied Survivors | 전투 시간 / 개인 격파 / 적 손실 / 아군 생존 | 결과 화면 |
| Fight Again / Battle Selection | 다시 싸우기 / 전투 선택 | |

### 4.2 전투 HUD

| 원문 | 한국어 | 비고 |
|---|---|---|
| Allies / Enemy | 아군 / 적군 | 상단 병력 막대 |
| Flags … : Defenders / Contested | 깃발 … : 수비 측 / 쟁탈 중 | 목표 띠 |
| Capture Camps 0 / 3 | 진영 점령 0 / 3 | 영웅 전투 목표 띠 |
| Zoom | 확대·축소 | |
| Pause / Controls | 일시정지 / 조작 | |
| Command | 명령 | 명령 패널 열기 |
| Tactical Map | 전술 지도 | |
| 擊破 (Kills) | 격파 | |
| N連擊 (Combo) | N연격 | |
| Musou | 무쌍 | 게이지·필살기 |
| Main / Lt. 1 / Lieutenant 1 | 본진 / 부관 1 | 유닛 카드 소속 |
| AI (電腦) | AI | 유닛 카드 배지 |
| Unit / page · Total N Unit | 유닛 / 쪽 · 총 N개 유닛 | |
| Select Front | 전선 선택 | |
| Delegate Back | 부관에게 반환 | |
| Hold現位 (固守現位) | 현 위치 고수 | 원본 혼합 표기 |
| Speed 1× (戰速) | 전투 속도 1× | |
| troops | 명 | "600 troops" → "600명" |
| Pikes Braced / Advancing / Hold | 창 버팀 / 전진 중 / 고수 | 유닛 상태 |
| Flag | 깃발 | 화면 가장자리 표지 |
| Front commands | 전선 지휘 | 브리핑 |

### 4.3 병종 (19종, 확정 번역)

| 원문 | 한국어 | 등급(Tier) |
|---|---|---|
| Shield Infantry | 방패 보병 | I |
| Sword Infantry | 검 보병 | I |
| Spearmen | 창병 | I |
| Shock Infantry | 돌격 보병 | I |
| Longbowmen | 장궁병 | I |
| Crossbowmen | 쇠뇌병 | I |
| Shock Cavalry | 돌격 기병 | I |
| Raiding Cavalry | 습격 기병 | I |
| Ironwall Guard | 철벽 근위대 | II |
| Ironcleaver Veterans | 철부 노병 | II |
| Halberd Guard | 미늘창 근위대 | II |
| Heavy Crossbow Guard | 중쇠뇌 근위대 | II |
| Royal Guard | 어림 친위대 | III |
| Linebreaker Guard | 파진 친위대 | III |
| Dragontooth Pikes | 용아 장창대 | III |
| Armor-piercing Longbows | 관통 장궁대 | III |
| Shieldbreaker Crossbows | 파순 쇠뇌대 | III |
| Armored Shock Cavalry | 중장 돌격 기병 | III |
| Bloodwolf Riders | 혈랑 기병 | III |

병종 능력치 항목명:

| 원문 | 한국어 |
|---|---|
| HP per Soldier | 병사당 체력 |
| Damage per Hit | 타격당 피해 |
| Missile Damage | 투사체 피해 |
| Damage Reduction | 피해 감소 |
| Melee Reach | 근접 사거리 |
| Range | 사거리 |
| Abilities / Command Advice / Weaknesses / Battle Roster | 능력 / 지휘 조언 / 약점 / 전투 편성 |
| Battle Troops / Advanced Troops / All Troops | 전투 병종 / 상위 병종 / 전체 병종 |

### 4.4 무기 유형과 스킬

| 원문 | 한국어 |
|---|---|
| Sword & Shield | 검과 방패 |
| Greatsword | 대검 |
| Polearm | 장병기 |
| Bow / Crossbow | 활/쇠뇌 |
| Focus | 법구 |
| Skill 1 (Dash) / Skill 2 (Arc) / Skill 3 (Area) / Skill 4 (Special) | 스킬 1(돌진) / 스킬 2(호) / 스킬 3(범위) / 스킬 4(특수) |
| Musou Ultimate | 무쌍 필살기 |
| Combo | 연속 공격 |
| Charge Up / Heavy Attack | 기 모으기 / 강공격 |
| Dodge | 회피 |
| Sprint | 질주 |

교범 스킬명(무기 유형별)과 HUD 실측 스킬명:

| 유형 | 키 | 원문 | 한국어 |
|---|---|---|---|
| 검과 방패 | Q | Lunging Cut | 돌진 베기 |
| 검과 방패 | E | Shield Bash | 방패 강타 |
| 검과 방패 | R | Riposte | 반격 |
| 검과 방패 | Y | Shield Wall | 방패벽 |
| 대검 | Q | Advancing Cleave | 전진 내려베기 |
| 대검 | E | Wide Cleave | 광역 베기 |
| 대검 | R | Whirlwind | 회오리 베기 |
| 대검 | Y | Sundering Blow | 파쇄 일격 |
| 장병기 | Q | Piercing Thrust | 관통 찌르기 |
| 장병기 | E | Sweeping Strike | 휩쓸기 |
| 장병기 | R | Breakout | 돌파 |
| 장병기 | Y | Brace | 버티기 |
| 활/쇠뇌 | Q | Aimed Shot | 조준 사격 |
| 활/쇠뇌 | E | Step Shot | 이동 사격 |
| 활/쇠뇌 | R | Piercing Shot | 관통 사격 |
| 활/쇠뇌 | Y | Quick Reload | 빠른 장전 |
| 법구 | Q | Fireball | 화염구 |
| 법구 | E | Healing Light | 치유의 빛 |
| 법구 | R | Thunder | 낙뢰 |
| 법구 | Y | Protective Ward | 수호 결계 |
| HUD(실측) | Q | Breaking Thrust | 파쇄 찌르기 |
| HUD(실측) | E | Sweeping Strike | 휩쓸기 |
| HUD(실측) | R | Breakout Spin | 돌파 회전 |
| HUD(실측) | Y | Braced Counter | 버팀 반격 |
| HUD(실측) | T | Repeated Thrusts | 연속 찌르기 (무쌍) |
| HUD(실측, 영웅 전투) | T | Army Breaker | 파군 (무쌍) |

### 4.5 명령과 진형 (확정 번역)

| 원문 | 한국어 | 기본 키 |
|---|---|---|
| Form Ahead | 전방 정렬 | C |
| Attack at Cursor (패널 표기: Attack) | 커서 공격 | V |
| Charge | 돌격 | Z |
| Hold at Cursor (패널 표기: Hold) | 커서 고수 | X |
| Delegate to AI (패널 표기: AI Command) | AI 위임 | B |
| Select Front | 전선 선택 | ` |
| Block | 방진 | F |
| Circle | 원진 | G |
| Wedge | 쐐기진 | H |
| Snake | 장사진 | [ |
| Hollow Square | 공심방진 | ] |
| Formation (陣形) | 진형 | |

### 4.6 지형·목표

| 원문 | 한국어 |
|---|---|
| High Ground and Cliffs | 고지와 절벽 |
| Rivers and Bridges | 강과 다리 |
| Woods and Mud | 숲과 진흙 |
| Flags and Exits | 깃발과 출구 |
| Ridge / Reverse slope | 능선 / 반대 사면 |
| Bridgehead | 교두보 |
| Camp / Main camp | 진영 / 본영 |
| Evacuation zone | 피난 구역 |
| Rout | 궤주 |
| Effective strength | 유효 병력 |
| Morale | 사기 |
| Brace / Braced | 버팀 / 버팀 상태 |
| Flank / Rear | 측면 / 후방 |
| Launch | 띄워 날리기 |
