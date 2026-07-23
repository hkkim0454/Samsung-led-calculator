# AI-DLC State Tracking

## Project Information

- **Project Name**: LED Wall Configurator (사내 캐비닛 자동 배치·스펙 산출 도구)
- **Project Type**: Greenfield
- **Start Date**: 2026-07-23
- **Current Phase**: INCEPTION
- **Current Stage**: Requirements Analysis 완료 · Application Design 진행(프로토타입 검증) · Units Generation 승인 대기
- **Project Owner**: 김현규 (서울영상테크 SI사업본부)
- **Last Updated**: 2026-07-23

## Objectives and Scope

### Objective

사용자가 설치 공간(가로·세로)만 입력하면 LED 캐비닛 모델별로 공간을 최대한 채운 배열을 자동 계산하고, 크기·해상도·무게·밝기·소비전력·수량(BOM)을 산출·비교하는 사내 견적/설계 보조 웹 도구. 삼성 공식 configurator의 핵심 계산 흐름을 참조하되 사내 다모델 비교에 최적화한다.

### In Scope

- 공간 치수 입력 → 모델별 최대 충진(cols/rows) 자동 계산
- 산출 지표: 실제 크기, 총 해상도·화소수, 대각(inch), 면적(m²), 총 중량, 밝기, 최대·평균 소비전력, 발열(BTU), 여백(dead space)
- 모델별 비교 테이블(같은 공간에 대해 전 모델 동시 비교)
- 캐비닛 배열 시각 미리보기
- 모델 스펙 라이브러리 편집(CRUD) 및 JSON import/export
- BOM 산출(캐비닛 + 스페어, S-Box, Jig 등 부자재)
- 인쇄/PDF·엑셀 내보내기

### Out of Scope

- 삼성 공식 configurator의 대체 또는 재배포(본 도구는 사내 보조용, 공식 견적은 삼성·설치 파트너 확인 필요)
- 실시간 삼성 가격/재고/납기 연동
- 곡면(Curved) 배열 정밀 계산 — 1차 범위 제외, 후속 검토
- 3D 렌더링, 콘텐츠 시뮬레이션, 조도/시야각 시뮬레이션

## Execution Plan Summary

- **Stages to Execute**: Requirements Analysis → User Stories → Workflow Planning → Application Design → Units Generation → (Construction) Functional Design → Code Generation → Build & Test → (Operations) 사내 배포
- **Stages to Skip**: Reverse Engineering (N/A — Greenfield, 기존 코드 없음). Infrastructure Design은 경량화(단일 HTML/서버리스)로 축소 수행.
- **Units of Work**:
  - **U1** — 충진·스펙 계산 엔진(순수 함수 + 단위 테스트)
  - **U2** — 모델 라이브러리 관리(CRUD, JSON import/export, 스펙 정합성 검증)
  - **U3** — UI(입력폼, 배열 미리보기, 산출 readout, 모델별 비교표)
  - **U4** — 출력(BOM 산출, 인쇄/PDF, 엑셀 내보내기)

## Workspace State

- **Existing Code**: 프로토타입 1종 — `led-configurator.html` (단일 파일, vanilla JS)
- **Reverse Engineering Needed**: No (Greenfield)
- **Programming Languages**: HTML, CSS, JavaScript (vanilla, 빌드리스)
- **Build System**: 없음(단일 HTML). 규모 확대 시 Vite 검토
- **Project Structure**: 확인 필요 — 저장소(Git) 전환 여부 미정
- **Workspace Root**: 확인 필요
- **Application Code Directory**: 확인 필요 (제안: `/src`)
- **Documentation Directory**: `/docs` (aidlc-state.md, audit.md, SPEC.md)

## Confirmed Technology Stack

- **Frontend**: HTML + CSS + Vanilla JS (단일 파일, 외부 의존성 0)
- **Backend**: N/A — 클라이언트 전용(1차)
- **Data Store**: JSON 파일(모델 라이브러리 import/export). 브라우저 스토리지 미사용
- **Authentication**: N/A (사내 오프라인 파일 배포 전제)
- **Integration / Real-time**: N/A
- **Testing**: Node 기반 순수함수 단위 테스트(계산 로직) — 자동화 확정 예정
- **Deployment**: 정적 파일 사내 공유 또는 사내 웹 호스팅 — 확인 필요

## Code Location Rules

- **Application Code**: `/src` (또는 단일 `index.html`)
- **Documentation**: `/docs`
- **Tests**: `/tests`
- **Generated Artifacts**: `/dist` 또는 `/outputs`
- **Structure Rules**: 계산 엔진(engine)·모델 데이터(JSON)·UI를 분리한다. 스펙 데이터는 코드에 하드코딩하지 않는다.

## Constraints and Assumptions

### Constraints

- 삼성 실제 스펙은 공식 데이터시트/공식 configurator 확인값으로만 확정한다(임의 추정 금지).
- 본 도구는 사내 견적/설계 보조용이며, 공식 견적은 삼성 또는 설치 파트너 확인이 필요하다(삼성 도구 고지사항과 동일).
- 개인정보·비밀정보(비밀번호·토큰·가격계약 등)는 저장하지 않는다.

### Assumptions

- 1차 대상은 평면(Flat) 캐비닛형(The Wall MP/IW, IF/IE 시리즈 등).
- 최대 충진 = 각 축 floor 배수. **단, 삼성 Fit-to-wall은 세로 축에서 더 보수적으로 관측됨 → 규칙 확인 필요(Q1).**
- 평균 소비전력 ≈ 최대 × **0.53** (삼성 MP012F 실측 기준; 기존 0.35 가정 폐기).
- 스페어 캐비닛 ≈ 총량의 약 10%(올림). — 실제 규칙 확인 필요.

## Deployment / Server Environment

- **Purpose**: 사내 견적/설계 보조 도구 배포
- **Environment Name**: 확인 필요
- **Status**: 미구축(프로토타입 로컬 실행 단계)
- **Compute Specification**: N/A (클라이언트 브라우저에서 실행)
- **Operating System**: N/A
- **Network**: 사내(오프라인 파일 실행 가능)
- **Runtime / Middleware**: 웹 브라우저
- **Deployment Method**: 정적 파일 배포(사내 공유 폴더 또는 사내 웹)
- **Backup / Recovery**: 모델 라이브러리 JSON을 Git으로 버전 관리
- **Monitoring / Logging**: N/A (1차)
- **Open Questions**: 사내 웹 호스팅 vs 파일 배포 방식 결정 필요

## Extension Configuration

| Extension | Enabled | Mode | Decided At | Notes |
|---|---|---|---|---|
| Reverse Engineering | No | N/A | INCEPTION | Greenfield, 기존 코드 없음 |
| PDF / Excel Export | Yes | 산출물 | CONSTRUCTION(예정) | 삼성 도구 동일 기능 참조 |
| Model Data Import | Yes | JSON | CONSTRUCTION(예정) | 데이터시트 실측값 반영용 |

## Stage Progress

### INCEPTION PHASE

- [x] Workspace Detection
- [ ] Reverse Engineering  <!-- N/A — Greenfield -->
- [x] Requirements Analysis
- [ ] User Stories
- [ ] Workflow Planning
- [ ] Application Design  <!-- 프로토타입으로 부분 검증, 미확정 -->
- [ ] Units Generation  <!-- U1~U4 정의됨, 승인 대기 -->

### CONSTRUCTION PHASE

| Unit | Functional Design | NFR Requirements | NFR Design | Infrastructure | Code Generation | Build & Test |
|---|---|---|---|---|---|---|
| U1 계산 엔진 | Not Started | Not Started | N/A | N/A | In Progress | Not Started |
| U2 모델 라이브러리 | Not Started | Not Started | N/A | N/A | In Progress | Not Started |
| U3 UI | Not Started | Not Started | N/A | N/A | In Progress | Not Started |
| U4 출력/BOM | Not Started | Not Started | N/A | N/A | Not Started | Not Started |

- [ ] Functional Design
- [ ] NFR Requirements
- [ ] NFR Design
- [ ] Infrastructure Design
- [ ] Code Generation  <!-- 프로토타입 v0.1 존재, 정식 착수 전 -->
- [ ] Build and Test

### OPERATIONS PHASE

- [ ] Deployment
- [ ] Monitoring  <!-- N/A 예정 (클라이언트 전용) -->
- [ ] Backup and Recovery
- [ ] Operations Handover

## Current Verification Status

- **Build**: N/A (빌드리스 단일 HTML)
- **Automated Tests**: 미구축. 계산 로직은 Node로 수동 검증 완료(2026-07-23)
- **Integration Tests**: N/A
- **Security Checks**: 외부 의존성 0, 개인정보 미수집 → 저위험. 정식 점검 미수행
- **Acceptance Review**: 프로토타입 v0.1 오너 리뷰 대기

## Risks and Open Items

| ID | Type | Description | Owner | Due Date | Status | Resolution Condition |
|---|---|---|---|---|---|---|
| Q1 | Question | Fit-to-wall 세로 충진 규칙이 순수 floor와 다름(관측: 3.4m 벽에 6행=2.721m, 7행=3.175m도 물리적으로 가능). 삼성 클리어런스/여백 규칙 확인 필요 | 김현규 | 확인 필요 | Open | 세로 충진 규칙을 SPEC.md에 문서화 |
| R1 | Risk | 스펙 데이터 정확도 — 임의값 사용 시 견적 오류 위험 | 김현규 | 확인 필요 | Open | 전 모델 데이터시트 실측값 확정 |
| Q2 | Question | 대상 시리즈 범위(Flat 전용 vs Curved 포함) | 김현규 | 확인 필요 | Open | 범위 확정 |
| D1 | Dependency | 삼성 공식 스펙 시트/부자재 규칙(스페어율, S-Box 대수 규칙) 확보 | 김현규 | 확인 필요 | Open | 데이터 확보 완료 |

## Next Actions

| Priority | Action | Owner | Due Date | Completion Criteria |
|---|---|---|---|---|
| P1 | SPEC.md 확정(계산 공식·데이터 스키마·엣지케이스·세로 충진 규칙) | 김현규 / AI | 확인 필요 | 오너 승인 |
| P2 | 프로토타입 스펙 데이터를 실측값으로 교체 + 평균전력 계수 0.53 반영 | AI | 확인 필요 | MP012F/6×3.4m 결과가 삼성 도구와 일치 |
| P3 | 계산 엔진 순수함수 분리 + 자동 테스트 작성 | AI | 확인 필요 | 테스트 전부 통과 |
| P4 | BOM 규칙(스페어율·S-Box 대수·회로 계산) 정의 | 김현규 / AI | 확인 필요 | BOM 산출이 삼성 도구와 일치 |

## Notes

삼성 공식 도구(display-configurator.biz.samsung.com) 직접 검증(2026-07-23): MP012F(P1.26, 캐비닛 806.4×453.6×49.4mm, 9.2kg, 최대 146W/평균 77W, 640×360, 1800/1000nit, 3840Hz, OVD 4.4m)을 6×3.4m 벽에 Fit-to-wall → **7×6=42캐비닛**, 5.644×2.721m, 15.362m², 246.679", 386.4kg, 해상도 4480×2160, 최대 6132W/평균 3234W, 발열 최대 20916/평균 11046 BTU. BOM: 캐비닛 42+스페어 4=46(LH012MPFAAA), S-Box SBB-CS4BPGS 2+스페어 1, Jig CY-WJFPWP 3. 프로토타입 v0.1은 동일 조건에서 7×7로 계산(세로 규칙 차이) → P2/Q1로 조정 예정.
