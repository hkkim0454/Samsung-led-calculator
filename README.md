# LED Wall Configurator

공간(가로·세로 mm)만 입력하면 LED 캐비닛 모델별로 공간을 최대 충진한 배열과 스펙(크기·해상도·무게·밝기·소비전력·발열·BOM)을 산출·비교하는 사내 도구. 삼성 공식 LED configurator의 계산 흐름을 참조하되 다모델 동시 비교에 최적화.

## 빠른 시작

```bash
npm test          # 계산 엔진 회귀 테스트 (삼성 실측 수치 고정)
npm run dev       # http://localhost:5173 에서 UI 실행
```

> ESM import 때문에 `src/index.html`을 파일로 직접 열면 브라우저가 막을 수 있습니다. 반드시 `npm run dev`로 서버를 띄우세요.

## 구조

- `src/engine.js` — 순수 계산 함수(모든 공식의 단일 출처)
- `src/models.js` — 모델 데이터(삼성 도구 관측 실측치)
- `src/app.js` / `src/index.html` / `src/styles.css` — UI
- `tests/` — node:test 회귀 테스트
- `docs/` — SPEC.md, aidlc-state.md, audit.md
- `CLAUDE.md` — Claude Code용 프로젝트 지침 (세션 시작 시 자동 참조)

## 개발 방식

AI-DLC(Inception → Construction → Operations). 현재 INCEPTION 후반 — Construction 본착수 전 `docs/SPEC.md` §4의 결정 3건(충진 규칙/범위/BOM) 오너 승인 필요.

## 주의

사내 견적/설계 보조용. 공식 견적·최종 사양은 삼성 또는 설치 파트너 확인이 필요합니다.
