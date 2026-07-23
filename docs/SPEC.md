# SPEC — LED Wall Configurator

Inception 산출물. 계산 공식·데이터 스키마·엣지케이스를 코드보다 먼저 고정한다.
미확정 결정(DECISION PENDING)은 오너 승인 전까지 기본값으로 구현하되 명시한다.

## 1. 목적

사용자가 설치 공간(가로·세로 mm)만 입력하면, 등록된 LED 캐비닛 모델별로 공간을 최대한 채운 배열을 계산하고 스펙과 BOM을 산출·비교한다. 삼성 공식 configurator의 계산 결과와 수치가 일치하는 것을 정합성 기준으로 삼는다.

## 2. 데이터 스키마 (모델 1개)

| 필드 | 단위 | 필수 | 비고 |
|---|---|---|---|
| id, name, series, category | — | ● | category: `LED Indoor (The Wall)` / `Indoor` / `Outdoor` |
| pitch | mm | ● | 픽셀 피치 |
| cabW, cabH, depth | mm | ● | 캐비닛 물리 치수 |
| resW, resH | px | ○ | 없으면 `round(cab/pitch)`로 파생 |
| brightnessPeak, brightnessReduced | nit | ○ | 삼성 표기의 두 값 |
| refreshHz | Hz | ○ | |
| ovd_m | m | ○ | Optimal Viewing Distance |
| weight | kg/캐비닛 | ○ | **데이터시트 필요** (미입력 시 중량 산출 불가) |
| maxPower | W/캐비닛 | ○ | **데이터시트 필요** (미입력 시 전력·발열 산출 불가) |
| typicalPower | W/캐비닛 | ○ | 실측 평균전력. 있으면 평균전력 계산에 우선 사용, 없으면 `maxPower × 0.527` |
| maxInputW, maxInputH | px | ○ | 컨트롤러(S-Box) 1대 최대 입력 픽셀. 미입력 시 S-Box 수량 산출 불가 |
| sbox, cabinetPart | — | ○ | BOM용 부품 코드 |
| dataStatus | enum | ● | `verified`(전력까지 대조) / `derived`(치수 관측, 전력 파생·미상) / `needs-verification`(확인 필요) |

## 3. 계산 공식 (engine.js와 1:1 대응)

- 파생 해상도: `resW = resW ?? round(cabW/pitch)`, `resH` 동일
- 충진: `cols = floor((W - 2·clearance)/cabW)`, `rows = floor((H - 2·clearance)/cabH)` (fits = cols≥1 && rows≥1)
- 실제 크기(mm): `actualW = cols·cabW`, `actualH = rows·cabH`
- 면적(m²): `(actualW/1000)·(actualH/1000)`
- 대각(inch): `sqrt(actualW² + actualH²)/25.4`
- 총 해상도(px): `cols·resW × rows·resH`, 화소수 = 곱
- 총 중량(kg): `total·weight` (weight 없으면 null)
- 최대전력(W): `total·maxPower`; 평균전력 = `total·typicalPower` (없으면 `max·0.527`)
- 발열(BTU/hr): `W·3.412142`
- S-Box(컨트롤러): `ceil(전체 픽셀 / (maxInputW·maxInputH))`, 이중화 시 ×2, 일체형(integratedController)은 0, 용량 미상은 null
- 여백(mm): `deadW = W - actualW`, 센터 정렬 시 각 변 `deadW/2`

**정합성 기준 (테스트로 고정됨):** MP012F, 6000×3400, 7×6 → 42캐비닛, 5644.8×2721.6mm, 15.362m², 246.7", 4480×2160, 386.4kg, 최대 6132W / 평균 3234W, 20916 BTU. → `tests/engine.test.js` 통과 필수.

## 4. DECISION PENDING (오너 승인 필요)

### Q1 — 세로(및 가로) 최대 충진 규칙
삼성 Fit-to-wall은 순수 floor보다 보수적으로 관측됨. 6.0×3.4m 벽 + MP012F에서 삼성은 **7×6**을 채택했으나, 세로는 7행(7·453.6=3175.2mm ≤ 3400)도 물리적으로 가능. 즉 삼성은 세로에 여유(클리어런스/구조 여백)를 둔 것으로 보임.
- **현재 기본 구현:** 순수 floor (fill 모드 → 7×7). `edgeClearanceMm` 파라미터로 보수적 충진 근사 가능.
- **결정 필요:** (A) 순수 최대 충진 유지 / (B) 삼성과 동일한 보수적 규칙(여백 상수 or 규칙) 도입.

### Q2 — 대상 범위
Flat 캐비닛형만(1차) vs Curved 포함. 현재: **Flat 전용**.

### BOM 규칙
- 스페어 캐비닛: 현재 `ceil(total·0.10)`. 단 삼성은 42캐비닛에 스페어 **4**(≈9.5%)를 표기 → 반올림/버림 규칙 확인 필요.
- ~~S-Box 대수~~ **[확정 2026-07-23]** `ceil(전체 픽셀 / 컨트롤러 최대입력)`, 이중화 시 ×2. 삼성 검증: MP012F 42캐비닛(4480×2160) ÷ SBB-CS4BPGS(3840×2160) = 2대와 일치. 컨트롤러 용량 미상 모델은 산출하지 않음(null). *스페어 S-Box 규칙은 별도 미확정.*
- Jig 대수: 삼성 3 (규칙 미확정, null).
- 회로 계산(110/208/230V, daisy chain): 미구현(후속).

### [확정 2026-07-23] 방향 A 채택 — 오너 승인
친구 DISPLAY FIT 비교(`docs/comparison-displayfit.md`) 후 오너가 **방향 A**(본 프로젝트 유지 + 좋은 아이디어 흡수)를 승인. 반영: (1) S-Box 산출 규칙 위와 같이 확정, (2) 데이터 신뢰도 `dataStatus` 3단계 도입, (3) 평균전력에 모델별 실측 typical 우선, (4) MP008F 검증 전력(122W/64W) 반영. **단위는 mm/meter만 사용(feet 미도입).** Q1(세로 충진)·Q2(범위)는 여전히 미확정.

## 5. 엣지케이스

- 공간이 캐비닛 1개보다 작음 → fits=false, 모든 총량 0/—
- weight/maxPower null → 중량·전력·발열은 null(가짜 숫자 금지), 기하 지표는 정상 산출
- 크기÷피치 ≠ 입력 해상도 → 정합성 경고 표시
- 매우 큰 배열(>2000캐비닛) → 미리보기 셀 렌더링 상한 적용(계산은 정확)
- manual 모드 cols/rows 0 또는 음수 → 0으로 clamp

## 6. 비기능 요구(NFR, 경량)

- 외부 런타임 의존성 0(브라우저 순수 ESM). 테스트는 Node 내장 `node:test`.
- 계산 엔진은 순수 함수(DOM/전역 상태 없음) — 테스트 가능성 최우선.
- 개인정보·자격증명 미저장. 모델 데이터는 JSON import/export로만 영속.
