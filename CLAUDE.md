# CLAUDE.md — LED Wall Configurator

이 파일은 Claude Code가 세션 시작 시 읽는 프로젝트 지침이다. 작업 전 `docs/aidlc-state.md`(현재 상태)와 `docs/SPEC.md`(명세)를 함께 확인할 것.

## 프로젝트 한 줄 요약

공간(가로·세로 mm)만 입력하면 LED 캐비닛 모델별로 공간을 최대 충진한 배열과 스펙(크기·해상도·무게·밝기·소비전력·발열·BOM)을 산출·비교하는 사내 도구. 삼성 공식 configurator와 수치가 일치하는 것을 정합성 기준으로 삼는다.

## 개발 방식: AI-DLC

- 3단계: **Inception → Construction → Operations**. 각 단계는 오너(김현규) 승인 게이트를 거친다.
- 상태는 `docs/aidlc-state.md`, 이력은 `docs/audit.md`에 기록한다. **의미 있는 결정·승인·검증이 생기면 audit.md에 항목을 추가**하고 state.md의 해당 필드를 갱신할 것.
- **코드보다 SPEC이 먼저다.** SPEC에 없는 계산 규칙을 임의로 만들지 말 것. 애매하면 진행을 멈추고 오너에게 질문한다.

## 현재 위치

- Phase: **INCEPTION 후반** (프로토타입 v0.2 존재, SPEC 초안 작성됨)
- 즉시 승인이 필요한 결정 3건은 `docs/SPEC.md` §4 (Q1 충진 규칙 / Q2 범위 / BOM 규칙). **이 결정 없이 Construction 본착수 금지.**

## 저장소 구조

```
src/engine.js   순수 계산 함수 (DOM 없음). 브라우저·Node 공용 ESM. 모든 공식의 단일 출처.
src/models.js   모델 데이터. 삼성 도구에서 관측한 실측치. weight/maxPower=null은 데이터시트 필요.
src/app.js      UI 컨트롤러. 계산은 반드시 engine.js를 호출(중복 구현 금지).
src/index.html  마크업. src/styles.css.
tests/          node:test. 삼성 검증 수치를 고정하는 회귀 테스트.
docs/           SPEC.md, aidlc-state.md, audit.md.
```

## 실행 / 검증

- 테스트: `npm test` (= `node --test tests/`). **커밋 전 반드시 green.**
- 로컬 실행: `npm run dev` 후 브라우저에서 `http://localhost:5173`.
  (ESM import 때문에 `file://` 직접 열기는 브라우저에 따라 차단됨 — 반드시 서버로 띄울 것.)

## 규칙 (반드시 준수)

1. **계산 로직은 engine.js에만.** app.js·테스트는 이를 호출만 한다. 공식을 두 곳에 쓰지 말 것.
2. **가짜 스펙 금지.** weight/maxPower가 없으면 `null`을 반환하고 UI는 `—`로 표시한다. 임의 추정값으로 채우지 말 것.
3. **정합성 테스트를 깨지 말 것.** `tests/engine.test.js`의 MP012F 기준값은 삼성 실측이다. 공식을 바꾸면 삼성 도구로 재검증하고 근거를 audit.md에 남긴다.
4. 외부 런타임 의존성을 추가하지 말 것(빌드리스 유지). 테스트는 Node 내장만 사용.
5. 개인정보·자격증명·가격계약 정보를 코드나 문서에 넣지 말 것.

## 다음 작업 (오너 결정 후)

1. SPEC §4 결정 반영 (Q1 충진 규칙 확정 → engine.js `fitCabinets`, Q2 범위, BOM 규칙 → `bom()`).
2. 산출 항목 확장: 회로 계산(110/208/230V, daisy chain), 발열 typical, PDF/Excel 내보내기.
3. 모델 데이터 weight/maxPower를 데이터시트 실측으로 채우고 `validated: true` 갱신.
4. (Operations) 사내 배포 방식 결정 — 정적 호스팅 vs 파일 배포.

## 검증된 기준 데이터 (수정 시 재확인 필요)

삼성 공식 configurator(2026-07-23): MP012F(P1.26, 806.4×453.6×49.4mm, 9.2kg, 최대 146W, 640×360, S-Box SBB-CS4BPGS, 부품 LH012MPFAAA) → 6×3.4m Fit-to-wall = 7×6=42캐비닛, 최대 6132W/평균 3234W(계수 0.527), 발열 20916 BTU.
