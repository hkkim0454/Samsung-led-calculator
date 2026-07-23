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

## Decision Log

| ID | Timestamp | Decision | Rationale | Owner | Status |
|---|---|---|---|---|---|
| DEC-001 | 2026-07-23 | vanilla JS 단일 HTML 채택, engine/data/UI 분리 | 배포 단순, 의존성 0, 사내 오프라인 실행 용이 | 김현규 | Approved |
| DEC-002 | 2026-07-23 | 산출 항목·데이터 스키마를 삼성 실측 기준으로 정렬(Pitch, W×H×D, weight, max/typ power, resolution, brightness, OVD, BOM) | 사내 견적 정합성 확보 | 김현규 | Proposed |
| DEC-003 | 2026-07-23 | 평균전력 계수 0.35 → 0.53 정정 | 삼성 MP012F 실측(3234/6132=0.527) 반영 | 김현규 | Proposed |

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
