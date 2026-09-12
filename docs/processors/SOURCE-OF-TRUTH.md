# Processor Specification / Limit — Source of Truth (정책)

비디오 프로세서 추천 기능에서 **제조사 사양을 추정·일반화하지 않는다.** 모든 판단은 프로젝트 내부의 검증된 Processor 문서(`docs/processors/`)와 `src/processors.js`를 Source of Truth로 사용한다. (이사 지침 2026-09-12)

## 1. 자료 우선순위
1. 제조사 공식 Product Specification / Datasheet
2. 제조사 공식 User Manual
3. 제조사 공식 Configuration Software Manual
4. 제조사 공식 Product Page
5. 프로젝트 내부 검증 문서

Reseller·블로그·쇼핑몰·커뮤니티 자료는 공식값 근거로 쓰지 않는다.

## 2. 문서 위치
`docs/processors/{analog-way,novastar,colorlight}/`. **Processor 관련 구현·수정 전 해당 제조사 문서를 먼저 읽는다.**

## 3. 숫자만 보지 말고 의미 확인 (자동 변환 금지)
`Input connector ≠ Independent input ≠ Window ≠ Layer ≠ Mixing/Split layer`,
`Output connector ≠ Independent/PGM/AUX/Mirrored output`, `Output card ≠ Output board ≠ Screen group ≠ Canvas`.
- 예) X100 Pro-7U `Max Windows = 64` → `2K Layers=64`·`4K Layers=16`로 추정 금지. 해상도별 확인 안 되면 `global2k=null`, `global4k=null`.

## 4. UNKNOWN은 실제 데이터
확인 못 한 값은 `null`. **`null` = "아직 공식 확인 안 됨"(≠ 미지원). `null !== false`.** UI는 `—`/"확인 필요"로 표시하고 임의 PASS 안 함.

## 5. 제조사별 Processing Model 분리
- Analog Way: `mixing_split` (Mixing/Split/PGM/AUX/Mixer·Matrix·Edge)
- NovaStar H: `per_output_card` (Global 숫자만으로 판정 금지, 카드당 16×2K/8×DL/4×4K 예산)
- Colorlight X100 Pro: `global_window` (Independent Input·Window·Output Board·Independent Output 별도, Window→Layer 변환 금지)
- Colorlight Universe: `screen_group` (Global + Output Board + Screen group, 전역 PASS여도 보드 초과 시 FAIL)

## 6. 사양과 Limit Rule 분리
- 공식 숫자 = 데이터, 제조사별 동작 제한 = validator. DB 숫자만으로 모든 판정 금지.
- **현재 코드 매핑**(코드 3분할은 후속 예정): 데이터 = `src/processors.js`, 한계/판정 로직 = `src/engine.js`(processorRequirements·validate*·rankProcessors·validateBuild). 향후 `processor-data.js`/`processor-limits.js`/`processor-validator.js`로 분리 계획.

## 7. 공식값에 출처 기록
각 Processor에 `verification: { status, sourceUrl, sourceVersion, verifiedAt, notes }` 유지. 중요한 한계값은 field-level 출처(document/page)도 허용.

## 8. 공식자료와 코드 충돌 시
임의 수정 금지. 먼저 보고: `현재 코드값 / 공식 문서값 / 출처 / 영향 validator / 영향 test` 정리 후 수정.

## 9. 추천은 두 단계
- Stage 1 Hard Constraint: 독립 입력·출력 용량·레이어/윈도우·카드/보드 한계·Canvas/Span·필수 기능. 하나라도 미달 → FAIL.
- Stage 2 Suitability: 통과 제품만 권장/적합/조건부/한계. **필수 기능이 UNKNOWN이면 PASS 아님 → CONDITIONAL("공식 지원 여부 확인 필요").**

## 10. 중요한 한계는 regression test로 고정
예: X100 7U 4K 입력 8→PASS/9→FAIL · NovaStar 카드 4×4K→PASS/5×4K→FAIL · Universe 전역 PASS + 보드 초과→FAIL · Eikos 2출력 가로 와이드→PASS. 사양 업데이트 시 테스트 깨짐 확인.

## 11. Processor 작업 순서
1) 제조사 문서 읽기 → 2) `processors.js` 확인 → 3) limit/validator 확인 → 4) 테스트 확인 → 5) 공식값·코드 차이 보고 → 6) 수정 → 7) regression 실행 → 8) 변경 사양·출처 보고. **기억·추정으로 채우지 않는다.**
