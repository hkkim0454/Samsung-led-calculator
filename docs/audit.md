# AI-DLC Audit Log — LED Wall Configurator

## Initial User Request

**Timestamp**: 2026-07-23

**User Input**: 삼성 LED configurator처럼, 설치 공간 정보만 입력하면 모델별로 캐비닛을 최대한 채워 크기·해상도·무게·밝기·소비전력 등을 산출하는 웹 도구를 제작 요청. AIDLC 방식으로 진행하며 프롬프트 작성법 안내 요청.

**AI Response**: AIDLC 3단계(Inception/Construction/Operations) 프롬프트 가이드 제공 및 즉시 사용 가능한 작동 프로토타입(`led-configurator.html`) 생성. 이후 삼성 공식 도구를 직접 검증하고 첨부된 AI-DLC 템플릿(state/audit)을 프로젝트 기준으로 작성.

**Context**: INCEPTION 시작. Greenfield 프로젝트, 기존 코드 없음.

---

## Reverse-Engineering the Samsung Reference (Browser)

**Timestamp**: 2026-07-23

**User Input**: 삼성 configurator 사이트를 직접 조작해 확인하고, 첨부 AI-DLC 템플릿으로 작업 요청.

**AI Response**: 사용자 승인 하에 Chrome(Browser 1)으로 `display-configurator.biz.samsung.com` 접속. 조작 흐름(모델 선택 → 단위 → 폭/높이 → Columns/Rows 또는 Fit-to-wall → Screen Type/Resolution/S-Box Redundancy), 모델 라이브러리(69종), 산출 항목, BOM 구조 확인. MP012F를 6×3.4m 벽에 Fit-to-wall 실행하여 실제 산출값 확보.

**Context**: INCEPTION, Requirements Analysis 보강. 삼성 도구는 SPA(클라이언트 렌더링)라 정적 조회로는 불가 → 브라우저 조작으로 확인.

**Decision**: 산출 항목·데이터 스키마를 삼성 실측 기준으로 정렬(DEC-002). 평균전력 계수를 실측값 0.53으로 정정(DEC-003).

**Artifacts**: 브라우저 세션 스크린샷(사용자 로컬 저장), 본 감사 로그 및 aidlc-state.md 갱신.

**Approval Status**: 브라우저 접속 — 승인(2026-07-23, Browser 1 선택). 정보 수집 활동으로 별도 산출물 승인 불요.

**Verification**: 삼성 도구 산출값을 화면에서 직접 대조. MP012F/6×3.4m → 7×6=42캐비닛, 5.644×2.721m, 4480×2160, 386.4kg, 최대 6132W/평균 3234W 확인.

**Open Items**: Fit-to-wall 세로 충진 규칙이 순수 floor와 상이(6행 채택, 7행 가능) → Q1.

**Compliance**: 브라우저 사용 전 사용자에게 대상 브라우저 확인. 개인정보·자격증명 미수집. 삼성 사이트 조작은 조회·시뮬레이션 범위로 한정, 계정 생성/제출/구매 행위 없음.

---

## Prototype v0.1 (Code Generation — Preliminary)

**Timestamp**: 2026-07-23

**User Input**: "프로그램을 작성해줘" — 작동하는 configurator 요청.

**AI Response**: 단일 HTML 프로토타입 생성 — 공간 입력 기반 최대 충진 계산, 배열 시각 미리보기, 산출 readout(크기·해상도·대각·중량·밝기·최대/평균 전력·화면비·여백), 모델별 비교표, 모델 CRUD, JSON import/export, 스펙 정합성 경고, 인쇄/PDF.

**Context**: INCEPTION 단계에서의 선행 프로토타입(디자인 검증용). 정식 Construction 착수 전.

**Decision**: vanilla JS 단일 파일, 계산 엔진·모델 데이터·UI 분리 구조 채택(DEC-001).

**Artifacts**: `/outputs/led-configurator.html`

**Approval Status**: 대기 — 오너 리뷰 예정.

**Verification**: 계산 로직을 Node로 수동 실행하여 검증(충진·크기·해상도·중량·전력 산출 정상). 단, 삼성 세로 충진 규칙 차이로 결과 일부 불일치.

**Open Items**: 실측 스펙 데이터 교체(R1), 평균전력 계수 0.53 반영(P2), 세로 충진 규칙 확정(Q1), BOM/회로/발열 항목 추가(P4).

**Compliance**: 외부 의존성 0, 개인정보 미수집. 스펙 데이터는 "예시값"으로 명시하여 오용 방지.

---

## Comparison with DISPLAY FIT & Direction A (Owner-Approved)

**Timestamp**: 2026-07-23

**User Input**: 친구가 만든 유사 도구 DISPLAY FIT(ChatGPT 제작)를 공유하며 참고 요청. 이후 **방향 A 채택**(본 프로젝트 유지 + 좋은 아이디어 흡수)과 **feet 단위 미도입**(한국은 meter만 사용) 지시.

**AI Response**: 두 프로젝트를 계산식·데이터·기능으로 비교(`docs/comparison-displayfit.md`) 후 A안을 코드에 반영. (1) S-Box 산출 규칙 확정 `ceil(전체픽셀/컨트롤러용량)`·이중화 ×2, (2) `dataStatus` 3단계 도입, (3) 평균전력 모델별 실측 typical 우선, (4) MP008F 검증 전력(122W/64W) 반영. 단위는 mm/meter만 유지. 계산 테스트 6→10종으로 확장, 전부 통과.

**Verification**: S-Box 규칙을 삼성 실측과 대조 — MP012F 42캐비닛(4480×2160) ÷ SBB-CS4BPGS(3840×2160) = 2대로 삼성 도구 출력과 일치. `tests/engine.test.js` 10/10 green.

**Open Items**: Q1(세로 충진 규칙)·Q2(범위: 일체형/Video Wall 포함 여부) 여전히 미확정. 스페어 캐비닛·S-Box 반올림 규칙 확인 필요.

---

## Decision Log

| ID | Timestamp | Decision | Rationale | Owner | Status |
|---|---|---|---|---|---|
| DEC-001 | 2026-07-23 | vanilla JS 단일 HTML 채택, engine/data/UI 분리 | 배포 단순, 의존성 0, 사내 오프라인 실행 용이 | 김현규 | Approved |
| DEC-002 | 2026-07-23 | 산출 항목·데이터 스키마를 삼성 실측 기준으로 정렬(Pitch, W×H×D, weight, max/typ power, resolution, brightness, OVD, BOM) | 사내 견적 정합성 확보 | 김현규 | Proposed |
| DEC-003 | 2026-07-23 | 평균전력 계수 0.35 → 0.53 정정 | 삼성 MP012F 실측(3234/6132=0.527) 반영 | 김현규 | Proposed |
| DEC-004 | 2026-07-23 | 방향 A 채택 — 본 프로젝트 유지 + DISPLAY FIT 우수 요소(S-Box 규칙·dataStatus 3단계·검증 전력) 흡수. feet 미도입 | 가벼운 배포 이점 유지하며 산출 정확도 보강 | 김현규 | Approved |
| DEC-005 | 2026-07-23 | S-Box 수량 = `ceil(전체픽셀/컨트롤러용량)`, 이중화 ×2 | 삼성 검증(42캐비닛→2대) 일치 | 김현규 | Superseded by DEC-006 |
| DEC-006 | 2026-07-24 | S-Box 수량 = 영역 타일 `ceil(resW/3840)×ceil(resH/2160)`, 이중화 ×2. SBB-CS4B(=CS4BPGS)·SNOWAAE 공통 4K. IFR/IEA에도 용량 반영. Outdoor(IB) 단종 삭제. 슈퍼와이드 시 16:9 최대해상도 산출 | S-Box 데이터시트 스터디(CS4B/SNOWAAE 매뉴얼)로 박스당 최대 4K 확인, 영역 타일이 실제 신호 매핑에 부합하고 삼성 42→2 검증 유지. SNOWAAE 8K는 4K로 보수 운용 | 김현규 | Approved |
| DEC-007 | 2026-07-24 | 모델 라이브러리 정리: IW 시리즈(IW008C/012C/016C) 삭제(단종·MPF로 대체); 픽셀피치 2.5mm 초과 및 P2.0(IF020R) 모델 기본 숨김(데이터 보존, 필터 제외); MP008F 부품코드 LH008MPFAAA 반영(삼성 DE 데이터시트); 캐비닛 치수 표시를 소수점 1자리(예: 806.4×453.6)로 정밀화 | 세일즈 대상 피치 라인 한정 + 데이터시트 부품코드 확보 + 453.6mm를 454로 반올림 표기하던 오해 해소(데이터는 삼성 검증값 453.6 유지) | 김현규 | Approved |
| DEC-008 | 2026-07-24 | 밝기 표시를 peak → "최대"(운영 최대)로 변경. 산출 스펙·비교표 모두 `brightnessMax = brightnessReduced ?? brightnessPeak` 사용 | 삼성 세일즈 자료가 "최대 밝기" 기준(예: MPF 1000 / IFR 800 / IEA 500 / MMF 600 nit)을 사용 — 실제 견적/운영 값에 부합 | 김현규 | Approved |
| DEC-009 | 2026-07-24 | 기본 노출 피치 범위를 P0.8~P1.8로 한정(기존 ≤2.5). 범위 밖(IF020R P2.0, IF025R/IE025A P2.5, IF040R P4.0)은 데이터 보존한 채 기본 숨김 | 삼성 판매 정책상 앞으로 P0.8~P1.8만 판매. 안 팔리는 피치는 기본 목록에서 제외(데이터는 유지, 필터만 조정) | 김현규 | Approved |
| DEC-010 | 2026-07-24 | MMF 시리즈에 MM009F(P0.9375, 640×360)·MM012F(P1.25, 480×270) 추가. 밝기 최대 600 nit, 최대전력 85.8W·92.7W(=삼성 시트 W/㎡ × 캐비닛 0.2025㎡), 부품코드 LH009MMFRGS·LH012MMFRGS. weight/typical은 세일즈 시트에 없어 null(데이터시트 필요) | 삼성 MMF 세일즈 자료(slide 13)로 피치·해상도·밝기·최대전력(W/㎡) 확인. MM015F(467→94.6W) 검증값이 동일 산식으로 재현되어 산식 신뢰 | 김현규 | Approved |
| DEC-011 | 2026-07-24 | 모델 라이브러리 기본 표시 순서를 IFR→IEA→MMF→MPF로 변경(SALES_LINES 순서 + stable sort, 라인 내부·커스텀·JSON 순서 보존) | 오너 설계 우선순위 반영 | 김현규 | Approved |
| DEC-012 | 2026-07-24 | IFR/IEA 기본 컨트롤러(S-Box)를 SBB-SNOWJMU로 변경(필요시 CS4B). 산출 스펙의 S-Box 항목이 모델별 실제 컨트롤러명을 표시하도록 개선(하드코딩 라벨 제거). MPF/MMF는 SBB-CS4BPGS 유지 | IFR/IEA는 SNOWJMU로 주 설계, CS4B는 예비. S-Box **수량 산식(박스당 4K, maxInputW/H)** 은 SNOWJMU 용량 데이터 미확보로 변경하지 않음(수량 결과 불변, 삼성 정합성 유지) | 김현규 | Approved |
| DEC-016 | 2026-07-24 | 전체 서체를 Pretendard로 변경(본문·숫자 통일, 애플 SF 느낌 + 완전한 한글). 가변 woff2를 저장소에 동봉(self-host, `src/fonts/PretendardVariable.woff2`), `--sans`·`--mono` 모두 Pretendard 우선 + tabular-nums | 애플/삼성 정품 폰트는 웹 임베드 라이선스 제약 → 오픈 라이선스(OFL) Pretendard 채택. CDN 대신 파일 동봉으로 빌드리스·오프라인 유지(외부 런타임 의존성 없음). 계산 로직 무관(디자인만) | 김현규 | Approved |
| DEC-015 | 2026-07-24 | MPF(MP008F/012F/016F) 기본 컨트롤러를 SBB-SNOWAAE로 변경(SNOWAAE 또는 CS4B 사용 가능, 기본 SNOWAAE). MMF는 SBB-CS4BPGS 유지 | 오너 설계 기준. SNOWAAE도 4K(3840×2160) 상한이라 maxInputW/H·S-Box 수량 산식 불변 → MP012F 42→2 정합성 유지(수량 결과 동일, 컨트롤러 표시명만 변경) | 김현규 | Approved |
| DEC-014 | 2026-07-24 | 광 지빅(GBIC) 산출 추가: '01 설치공간'에 'CS4B(광전송)로 설계' 토글. 켜면 컨트롤러를 SBB-CS4B로 보고 광 지빅 SET = ⌈resW/1920⌉×⌈resH/2160⌉(1 SET=SBOX 1+LED 1, 이중화 ×2)을 S-Box 옆에 표기. 기본 OFF | CS4B(광전송) 구성에서 1920×2160마다 광모듈(Exatek EXA-40G-QSFP-LR4 등) 1 SET 필요(오너 지침). 삼성 CS4BPGS export엔 지빅 없음 → 기본 OFF로 정합성 유지, 필요시(CS4B)만 산출. S-Box 수량 산식은 불변 | 김현규 | Approved |
| DEC-013 | 2026-07-24 | MM009F·MM012F를 삼성 configurator export로 검증·확정(dataStatus derived→verified). 무게 5.1kg 공통, 최대/평균전력(W/캐비닛) 009F 94.6/37·012F 92.8/41.5, OVD 009F 3.2m·012F 4.3m 반영. **009F 최대전력 85.8W→94.6W 정정**(이전 세일즈 시트 423.47 W/m² 값 오류, export 6811.2W/72=94.6 기준) | 삼성 공식 export가 진실 소스. 검증: 009F 12×6(367.2kg·6811.2W·2664W·2 S-Box)·012F 8×8(326.4kg·5939.2W·2656W·1 S-Box) 전 항목 일치. 참고: 두 export 모두 광 지빅(GBIC) 부품 미표기 → CS4BPGS는 별도 지빅 불필요 확인 | 김현규 | Approved |

| DEC-017 | 2026-09-11 | (로드맵/Proposed) 소프트웨어 범위 확장 방향 채택 — 단순 치수 계산기 → **LED 연출 시뮬레이션 + 프로세서 자동 추천 + 견적 연동**. (a) LED 캔버스 위 레이어 드래그 배치·리사이즈(ICS/Analog Way "세미 버전"), 배경/격자벽 샘플 이미지로 룩앤필, (b) 공간·해상도별 레이어/분할 한계 분석 → 프로세서(Aquilon C ~ NovaStar) 자동 리커맨드, (c) 연출 확정 시 추천 프로세서 + 장비금액 포함 최종 견적. **시인성 규칙(오너):** 분할 창은 130인치 4분할=65인치까지 실효성 있음, 그보다 작으면 시인성 저하 → 분할 창 대각 하한 ≈ **65인치**를 추천 기준으로 사용. 프로세서 제품별 최대 레이어·분할·입력해상도 데이터는 오너가 정리해 제공 예정(그 전엔 규칙/엔진 미구현) | 현장 구축 단계 설계오류·시공 리스크 사전 차감, 초기 LED 사이즈 확정 후 AV/비디오 설계 검증 속도 단축 | 김현규 | Proposed |
| DEC-035 | 2026-09-12 | **03 3D 미리보기 방 위쪽(천장·옆벽) 정의 강화(v188, 이사 피드백 "좌측벽·천장 부족").** 천장·옆벽 면색이 프레임 배경과 거의 같아 방 위쪽이 안 읽히던 문제 → (1) 면 명도 대비 강화(천장·옆벽을 배경보다 뚜렷이 어둡게, 뒤로 갈수록 어둡게), (2) 각 면의 **뒷벽쪽 모서리에 경계선**(ceil/floor border-top, wallL/wallR border-left) 추가로 방 모서리가 크리스프하게, (3) 정면(뒷)벽 inset 그림자로 방 안에 앉힘, box-sizing:border-box. 계산 불변, 115/115, 헤드리스(전체채움·여백 배치) 확인 | 방 enclosure가 배경과 구분되어 원근감·좌측벽·천장이 또렷 | 김현규 | Approved |
| DEC-034 | 2026-09-12 | **03 3D 미리보기 이사 피드백 반영(v187).** (1) 사람 도형을 예전 실루엣(머리 원+어깨 넓은 몸통+다리)으로 복원(rs3Person .h/.b/.l, 폭 300mm). (2) '키 170cm' 라벨을 얼굴 옆 → **하단 왼쪽 구석 고정**. (3) **원근감 강화**: 스케일 기준을 '뒷벽 채움'(÷f0, 벽이 화면을 덮어 방 깊이가 사라짐)에서 **'방 앞면(카메라쪽 개구부) 채움'(÷fFront)** 으로 변경 → 방이 화면을 꽉 채우고 뒷벽(LED)은 안쪽에 ~58%로 물러나 바닥·천장·옆벽이 소실점으로 강하게 수렴(Claude Design 시안과 일치). 방 깊이 0.85×폭(cap 12000). (4) **면별 명도차·바닥 그리드 강화**(천장 최명→바닥 최암, grid rgba .22)로 방(모서리)이 또렷이 읽힘. (5) **사람 토글 끄면 눈높이선도 함께 숨김**. 계산 불변, 115/115, 헤드리스 확인(여백 배치=시안 원근감 일치·전체채움·사람off) | 원근감이 Claude Design만큼 안 산다는 피드백 → 벽이 아닌 방 앞면 기준으로 맞춰 깊이 확보 | 김현규 | Approved |
| DEC-033 | 2026-09-12 | **03 미리보기 CSS 3D 1점 투시 원근 적용(이사 디자인 핸드오프, 원근감-스펙.md).** 기존 2D %좌표 방식(rsFrame/rsWall/…) → CSS 3D 방(정면벽·바닥·천장·좌우벽 5면, 같은 소실점 수렴)으로 renderPreview 전면 재작성. **치수 값·계산(computeConfig)은 그대로 사용**하고 위치만 투영식 proj()로 2D 오버레이 배치(글자 안 찌그러짐). 스펙의 고정 좌표(9×3/FHD 예시) 대신 **실제 계산값에서 동적 산출**(S=화면맞춤 px/mm, 정면벽 투영배율 0.5 보정) → 모든 벽 크기·배열·LED크기·하단높이에서 동작. 깊이 단서: 바닥 1m 그리드·접지음영·LED 글로우·면별 명도차. 요소: LED월(정면벽 자식, 캐비닛 그리드+열/행 번호 안쪽 유지)·FHD/UHD 신호 오버레이·눈높이선(좌측벽)·사람 빌보드(씬 좌표+translateZ). **표시 토글 4개(사람/눈높이선/바닥 그리드/치수)** 신설 — 치수 끄면 발표용 클린 3D 뷰. rs3* CSS 신설(항상 라이트=물리 다이어그램), 구 rs* 블록은 미사용(주석 표기, 추후 정리). id/data-* 보존. v186. 계산·정합성 불변, 테스트 115/115, 헤드리스 다중 크기·토글·FHD 검증(에러 없음) | 원근감 강화로 공간 이해도 향상(이사 승인). 고정 예시가 아닌 동적화로 실사용 모든 케이스 대응. 치수 계산은 절대 불변 | 김현규 | Approved |
| DEC-032 | 2026-09-12 | **05 프로세서 추천 개선: 작은 모델 우선 + 제조사별 접이식 + 섹션 접힘(이사 지침).** (1) **정렬**: 동급 내 정렬 기준을 '여유(headroom) 큰 순'→'**여유 적은(적정 크기) 순**'으로 변경(rankProcessors). 소형 작업(예: 5760×1080, 필요 4K 출력 2)에서 대용량(H20 등)이 위로 오던 문제 해결 — 이제 적정 모델(Alta·X100 2U/4U·H2 등) 먼저, 대용량은 후순위. (2) **제조사별 그룹화**: 추천 결과를 Analog Way/NovaStar/Colorlight로 묶어 접이식(details)으로 표시(vpGroupsHTML), 최상위 모델을 가진 제조사만 기본 펼침·나머지는 눌러서 펼침. 접힌 상태에서도 제조사·최상위 등급·대표 모델·개수 표시. (3) **05 섹션 자체 기본 접힘**: #vpCard를 details로 전환(내부 id/data-* 전부 보존). v185. 계산·판정 로직·데이터 불변(정렬만 변경), 테스트 115/115, 헤드리스 확인(섹션 접힘·그룹 3개·에러 없음) | 소형 작업 과사양 억제, 긴 목록 정리. 숨김이 아닌 후순위+접기로 정보는 유지 | 김현규 | Approved |
| DEC-031 | 2026-09-12 | **미리보기 캐비닛 번호를 캐비닛 안쪽에 표기(이사 요청).** 기존에는 열 번호를 패널 위 남는 틈(topGap, 최대 5%)에 배치 → 공간이 클수록(위 여백이 좁을수록) 번호가 찌그러져 안 보임. 수정: 열 번호를 **맨 윗줄 캐비닛 안쪽**(top row band), 행 번호를 **맨 왼쪽 칸 안쪽**(left column)에 겹쳐 표시. app.js renderPreview의 rsColN/rsRowN 좌표를 패널 내부(행높이/열너비 기준)로 변경, `.inGrid` 스타일 추가(다크 캐비닛 위 가독성: 밝은 글자+그림자). 미사용 rowNL 제거. v184. 계산·id/data-* 불변, 테스트 115/115 유지, 헤드리스 렌더 확인(12×3 번호 안쪽·에러 없음) | 큰 공간에서 번호가 안 보이는 문제 해결, 예전 방식(안쪽 표기) 복원 | 김현규 | Approved |
| DEC-030 | 2026-09-12 | **프로세서 코드 3분할(이사 승인).** engine.js에 몰려 있던 프로세서 로직을 역할별 3파일로 분리(기능·화면·계산결과 무변경, 순수 구조 개선): 데이터 `processors.js`→`src/processor-data.js`(rename), 용량·한계 계산 `src/processor-limits.js` 신설(processorRequirements·regionTiles·inputsCapacity·outputs4kCapacity·outputCardUsage2kEq·validateOutputCardLayers·TILE/LAYER 상수·INPUT_2K_PER_CARD), 판정·등급·정렬 `src/processor-validator.js` 신설(validateProcessor·rankProcessors·validateBuild·gradeLabel·GRADE_ORDER·AQUILON_HIDE). engine.js는 LED 코어 계산 전용(프로세서 코드 제거). app.js·tests·index.html import·캐시버전 v182→v183 갱신, 내부 import(validator→limits)도 ?v=183. SOURCE-OF-TRUTH §6·README 매핑 갱신. **테스트 115/115 green, 헤드리스 로드 무오류 확인** | 유지보수성(사양 추가 시 위치 명확). 무동작-변경 리팩터라 단계별 테스트로 안전 진행 | 김현규 | Approved |
| DEC-029 | 2026-09-12 | **docs/processors/ 제조사별 사양 문서 + Source-of-Truth 정책 신설(이사 지침).** 구조 재편성 중 "문서 먼저" 채택. 제조사별 md(analog-way midra·alta·livepremier, novastar h-series, colorlight x100-pro·universe)를 Verified/UNKNOWN/Important Rules/Official Sources 형식으로 작성. SOURCE-OF-TRUTH.md에 데이터 정책(공식자료 우선순위, 개념 자동변환 금지, null≠false, 제조사별 processing model, 사양/limit 분리, 출처 기록, 2단계 판정, regression 고정, 작업 순서) 명문화. 코드 3분할(processor-data/limits/validator)은 후속 예정 — 현재는 processors.js(데이터)+engine.js(로직) 유지. 문서만 추가(코드·화면 무변경) | 사양 추정 방지·유지보수성. 코드 분리 전 위험 0인 문서부터 | 김현규 | Approved |
| DEC-028 | 2026-09-12 | **X100 Pro 공식 "Max. layers" 반영.** X100 Pro Spec V2.0의 "Max. layers"(2U 32·4U 32·7U 64)를 **해상도 무관 총 레이어 `maxLayers`** 로 독립 저장(global4k/2k로 쪼개지 않음, 이사 지침). engine: global_window 모델의 레이어 검사를 per-resolution(4K/2K) 대신 **총 레이어(≤maxLayers)** 단일 검사로 변경('최대 레이어' 항목, fallback maxWindows). → X100 Pro 레이어 판정 가능해짐(윈도우≠레이어 원칙 유지). 7U I/O 확인(입력보드 8·8×4K/32×2K, 출력보드 8·8×4K/32×2K) | 공식 표기 그대로 총 레이어로 저장, 해상도별 자원관계 미확인이므로 분할 금지 | 김현규 | Approved |
| DEC-027 | 2026-09-12 | **Colorlight 공식 출력값 반영(이사 사이트 직접 확인).** X100 Pro: 출력보드 2U 4·4U 4·7U 8장, 4K 출력 4·4·8, 2K 출력 16·16·32(4K/2K 출력보드 혼용 불가 명시, 동시 사용 아님). 전역 레이어는 여전히 null(윈도우≠레이어). U15 Max: 입력보드 30·독립 60×4K/120×2K, 출력보드 20·40×4K/120×2K, 전역 80×4K/320×2K(공식 V1.0). 보드당 레이어는 공식 미확인 → null 유지(partial_official). 슬롯 40은 입출력 보드 합과 별개로 관리 | 이사 공식 사이트 직접 확인값. 추정 없이 공식값만, per-board 미확인은 null | 김현규 | Approved |
| DEC-026 | 2026-09-12 | **handoff v2(공식 확인 결과) 기능/상태 반영.** 공식 확인값만 교체, UNKNOWN은 null 유지("없다는 문구 못 찾음"=X 아님). NovaStar H: Seamless·Fade·Genlock·HDR·10bit=O, True A/B·PVW/PGM·AMX/Crestron=null. X100 Pro: Genlock·10bit(출력보드)=O, monitoringPreview=O, HDR·Seamless·Fade·True A/B·AMX/Crestron=null. Universe(U6/U9/U15): Fade·HDR·10bit·monitoringPreview=O, Seamless·True A/B·Genlock=null(U6 trueAB false→null로 정정), U15 10bit 추가. Aquilon RS: Genlock·True A/B·AMX·Crestron=O. Alta Zenith 200: Genlock·Crestron=O, AMX=null. Midra Pulse/Eikos: 믹싱2/분할4 official 승격. **신규 필드 `monitoringPreview`(≠previewProgram) 추가.** | 공식 근거 있는 값만 확정, 모니터링과 A/B PVW/PGM 구분. 리셀러/추정 배제 | 김현규 | Approved |
| DEC-025 | 2026-09-12 | **handoff 문서(processor_selector_claude_handoff.md) 확정값 반영.** (1) Midra Pulse 4K·Eikos 4K: 믹싱 4K 2 / 분할 4K 4(프로젝트 조사 기준, partial_official). (2) Universe U9 Max: 공식 V1.1 값 — 입력보드 18·독립 36×4K/108×2K, 출력보드 10·20×4K/60×2K, 보드당 4×4K/16×2K → status official. (3) engine: 입력 슬롯 공유검사(4K1/2K4 비율)를 global_window·per_output_card(X100·NovaStar)로 한정 — Universe(screen_group)는 입력 밀도가 달라(U9 보드당 2×4K) 제외. 검증: IF015R 12×6=7680×2160→필요 4K 출력 2(§10 일치). **보류: Eikos Wide Canvas(§2·§10), 제조사별 UI 표시(§8) — 별도 PR.** HDMI2.0 입·출력 가정(DEC-023/024)은 유지하되 화면에 '가정' 라벨로 표기(handoff §11 추정금지와 상충하지 않게 명시) | 공식 확정값 우선 반영, 미확인은 null 유지. Universe 입력 밀도 차이 정확 반영 | 김현규 | Approved |
| DEC-024 | 2026-09-12 | **입력카드 "슬롯 1개 = 4K 1채널 또는 2K 4채널" 모델(이사 확인).** NovaStar H·Colorlight X100 Pro의 4K 입력 카드는 카드당 4K 1채널이고, 입력 슬롯은 2K/4K 카드를 필요에 따라 혼용(X100 Pro 실측: 슬롯당 4K 1·2K 4와 정확히 일치). engine `inputsCapacity()`: 공식 maxIndependent4k/2k 있으면 그대로(X100), 없고 maxInputBoards 있으면 max4k=슬롯·max2k=슬롯×4로 유도(가정). 4K·2K 동시 요구 시 '입력 슬롯' 공유 예산 검사 추가(필요 4K + ⌈필요 2K/4⌉ ≤ 슬롯). INPUT_2K_PER_CARD=4. → NovaStar H2~H20 독립 4K 입력 = 입력카드 수(4·10·15·15·30·30·40), 2K = ×4. 데이터는 그대로(유도는 엔진에서) | 입력 슬롯 유연 구성을 정확히 반영. 추정은 엔진 계산에만, 데이터 원본은 정직 유지 | 김현규 | Approved |
| DEC-023 | 2026-09-12 | **출력카드 HDMI 2.0 가정(이사 지침).** NovaStar·Colorlight의 4K 출력 수를 "출력카드는 모두 HDMI 2.0(4K@60)을 쓴다" 가정으로 산출: 공식 `outputs.max4k`가 있으면 그대로(U6 Max=10 등), 없고 per_output_card/screen_group이면 **카드당 4K(perOutputCard4k/perBoard4k) × 출력보드 수**로 유도(assumed=true, 라벨 '4K 출력(HDMI2.0 가정)'). engine `outputs4kCapacity()` 신설, validateProcessor 4K 출력 검사가 이를 사용. 데이터(processors.js)의 max4k는 미확인이면 그대로 null 유지(추정값은 엔진에서만) → NovaStar H2~H20 4K 출력 = 8·12·20·40·40·64·80(유도). X100 Pro는 출력보드 수 미상이라 유도 불가(확인 필요 유지) | 실무상 노바/컬러 출력을 HDMI 2.0 4K@60 단위로 통일해 필요 출력=포트 수로 비교. 데이터 원본은 정직하게 null 유지, 가정은 엔진 계산에만 반영 | 김현규 | Approved |
| DEC-022 | 2026-09-12 | **Analog Way 목록 정리(이사 지침).** (1) Midra QuickVu 4K·QuickMatrix 4K **단종 → 삭제**(Pulse 4K·Eikos 4K만 유지). (2) **소형 작업(필요 4K 출력 ≤2)에서 Aquilon(RS) 전 모델을 추천 목록에서 숨김** — 가격이 비싸 소형에 부적합, 예외 없음(방송급 요구여도 소형이면 숨김). `rankProcessors`에서 필터, 하드제약 로직 자체는 불변. (3) "NovaStar/Colorlight 레이어 ≠ AW 믹싱 레이어" 원칙 유지 확인 | 실무상 2×4K 출력에 Aquilon은 과사양·고가. 단종 모델 노출 방지 | 김현규 | Approved |
| DEC-021 | 2026-09-12 | **레이어 판정 정교화(자료문서 §19~27), 1차 엔진+테스트.** `validateOutputCardLayers` 확장: (1) `perOutputCardDemand`를 **카드별 배열**로 받아 각 카드 2K 환산 예산·사용 카드 수 검사(경계 걸침=여러 카드에 중복 배치→cross-output 지원, 문서 §19), (2) 배치 정보 없으면 **이론적 분산 가능성**만 보고 "배치 확인 필요" note(문서 §21), per-board 사양 없으면 ok=null. §26 회귀테스트 6종 반영(노바 몰림 FAIL/분산 PASS, X100 복제 8→OK·9→FAIL, U6 보드 FAIL/분산 PASS). 화면(제조사별 의미·이유 표시 §24·§25)은 2차. 등급 변화 없음(U6 적합 유지, 노바 조건부 유지) | 세 제조사 레이어 개념을 단일 maxLayers로 통일하지 않음(문서 §23). Capacity Fit + Operation Fit 분리 유지(§27). 정밀 카드/보드 배치는 배치 입력 필요(P5-4) | 김현규 | Approved |
| DEC-020 | 2026-09-12 | **레이어 경계 걸침(cross-output) 규칙 기록(구현 보류).** NovaStar H는 레이어가 출력카드 경계에 걸치면 양쪽 카드에서 레이어 예산을 각각 소모(배치 위치가 실효 용량을 좌우) — Colorlight(X100 Pro/Universe)는 전역 풀이라 이중 소모 없음(이사 김현규 확인). 지금은 SPEC §7.3 규칙 6·§7.4에 **기록만** 하고, 자동 계산(레이어 배치도 입력)은 후속(P5-4). 화면/코드 변경 없음 | 정확한 도메인 규칙 보존. 배치도 입력은 화면 복잡도가 커서 이사 지침대로 기록 우선 | 김현규 | Approved(기록만) |
| DEC-019 | 2026-09-12 | **프로세서 DB 갱신(Colorlight/NovaStar) + 출력카드 레이어 예산 로직.** 이사(김현규) 제공 자료문서(Colorlight_NovaStar_Claude_Code_Data.md) 반영. NovaStar H: 4→7모델(H2·H5·H9·H9E·H15·H15E·H20), **출력카드 수 정정(H5 10→3·H9 15→5; 기존값은 입력카드 수 오기)**, 카드당 16×2K/8×DL/4×4K, 입력카드 수 추가(독립 4K 입력 수는 카드 의존→null 유지), status official. Colorlight U6 Max: 전역 4K 20·per-board 16×2K/4×4K·cut·trueAB=false 추가(official). U9/U15 Max: 전역 레이어 공식 반영, status **partial_official**(신규 상태값). X100 Pro: 문서와 일치(변경 없음). engine: **출력카드 2K 환산 예산**(4K=4·DL=2·2K=1, 카드 16) `outputCardUsage2kEq`·`validateOutputCardLayers` 강화(배치 정보 있을 때만 카드별 검사, 없으면 전역 레이어로 갈음), screen_group per-board 필드명 `perBoard` 통일 | 문서 official/partial_official 우선, null 추정 금지(§17). NovaStar는 전역 레이어만으로 PASS 금지→카드 예산 검사 필요(§4·§16). 독립입력≠윈도우≠레이어≠출력 유지 | 김현규 | Approved |
| DEC-018 | 2026-09-12 | **Video Processor Selector 1차(엔진+데이터+테스트) 착수·승인.** 오너 컨텍스트 문서(Samsung_LED_Processor_Selector_Claude_Context.md) 스키마·규칙 채택: (1) `src/processors.js` 순수 데이터(문서 §9 스키마), (2) `engine.js`에 `processorRequirements`·`validateProcessor`·`validateOutputCardLayers`·`rankProcessors` 추가, (3) 2단계 판정(하드제약 PASS/CONDITIONAL/FAIL → 등급 권장/적합/조건부/한계/부적합, **근거 표시**). 확정 규칙: `required4kOutputs=⌈resW/3840⌉×⌈resH/2160⌉`; **독립입력 ≠ 레이어 ≠ 윈도우 ≠ 출력**(문서 §4); True A/B는 믹싱 레이어만 사용(분할 대체 불가); NovaStar는 출력카드별 레이어 검증; **S-Box 이중화 ≠ 프로세서 출력 이중화**(문서 §13). 데이터: Analog Way(Midra I/O·Aquilon RS 믹싱/분할) 및 오너 문서 표(X100 Pro 2U/4U/7U·U6 Max·Alta Zenith 200)만 채우고 **미확인 값은 전부 null + needs_verification**(문서 §15, PDF 사양서 이 환경 열람 불가). 화면 변화 없음(2차 PR에서 '05 비디오 프로세서' UI 추가) | 문서 §16 우선순위대로 "정확한 PASS/FAIL 판정" 먼저. 추정 스펙 금지(CLAUDE.md 규칙 2). 화면 무변경으로 디자인 작업과 충돌 회피 | 김현규 | Approved |

## Approval Log

| Timestamp | Stage or Artifact | Requested From | Result | Notes |
|---|---|---|---|---|
| 2026-07-23 | 브라우저 접속(삼성 도구) | 김현규 | Approved | Browser 1 선택 |
| 2026-07-23 | 프로토타입 v0.1 | 김현규 | Pending | 리뷰 대기 |
| 2026-07-23 | SPEC.md 확정(예정) | 김현규 | Pending | Construction 착수 게이트 |
| 2026-09-12 | Video Processor Selector 계획(6항목) + 진행 방식(2 PR 분할, 데이터=문서표+확실값) | 김현규 | Approved | 1차: 엔진+데이터+테스트(화면 무변경), 2차: 05 UI |

## Verification Log

| Timestamp | Scope | Method | Result | Evidence |
|---|---|---|---|---|
| 2026-07-23 | 계산 엔진(충진·크기·해상도·중량·전력) | Node 수동 실행 | Pass | 세션 실행 로그 |
| 2026-07-23 | 삼성 도구 대조(MP012F / 6×3.4m) | 브라우저 화면 수기 대조 | Partial | 산출값 일치, 세로 행수 불일치(6 vs 7) |
| 2026-09-12 | 프로세서 선정 엔진(요구산출·PASS/FAIL·카드별 레이어·랭킹) | node:test (`tests/processor.test.js`) | Pass | 87/87 통과(기존 71 + 신규 16). 문서 §12 케이스(출력량·X100 입력 8/9·A/B 믹싱·NovaStar 카드한계·미확인=CONDITIONAL) 포함 |
| 2026-09-12 | 프로세서 DB 갱신 + 카드 예산 로직(DEC-019) | node:test + 헤드리스 렌더 | Pass | 93/93 통과. TEST3~8(U6 20/21·카드 4/5·2K환산 16/17) 반영. 화면 제품 23개(NovaStar 7 포함), U6 Max 권장 승격 확인 |
| 2026-09-12 | 레이어 판정 정교화 §19~27(DEC-021) | node:test + 헤드리스 렌더 | Pass | 97/97 통과. §26 6종(카드 배열 몰림/분산, X100 복제, U6 보드) 반영. v171: 노바/유니버스에 '카드/보드별 배치' 줄 표시, 등급 불변(7 권장·16 조건부) |
