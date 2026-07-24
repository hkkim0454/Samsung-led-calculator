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

## Approval Log

| Timestamp | Stage or Artifact | Requested From | Result | Notes |
|---|---|---|---|---|
| 2026-07-23 | 브라우저 접속(삼성 도구) | 김현규 | Approved | Browser 1 선택 |
| 2026-07-23 | 프로토타입 v0.1 | 김현규 | Pending | 리뷰 대기 |
| 2026-07-23 | SPEC.md 확정(예정) | 김현규 | Pending | Construction 착수 게이트 |

## Verification Log

| Timestamp | Scope | Method | Result | Evidence |
|---|---|---|---|---|
| 2026-07-23 | 계산 엔진(충진·크기·해상도·중량·전력) | Node 수동 실행 | Pass | 세션 실행 로그 |
| 2026-07-23 | 삼성 도구 대조(MP012F / 6×3.4m) | 브라우저 화면 수기 대조 | Partial | 산출값 일치, 세로 행수 불일치(6 vs 7) |
