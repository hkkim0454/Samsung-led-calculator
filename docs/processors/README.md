# 비디오 프로세서 데이터 문서 (docs/processors)

이 폴더는 **비디오 프로세서 선정(05 비디오 프로세서)** 에 쓰이는 제조사별 사양을 사람이 읽기 쉽게 정리한 참고 문서다.
실제 계산에 쓰이는 데이터는 `src/processor-data.js`(순수 데이터), 용량·한계 계산은 `src/processor-limits.js`, 판정·정렬은 `src/processor-validator.js`에 있다(코드 3분할, DEC-030). **이 문서와 코드가 다르면 코드(`processor-data.js`)가 기준이다.**

> 관련: [SOURCE-OF-TRUTH.md](SOURCE-OF-TRUTH.md)(데이터 정책 — **작업 전 필독**), `docs/SPEC.md` §7, `docs/audit.md` DEC-018~028.

## 문서 목록
- Analog Way
  - [Midra 4K](analog-way/midra.md) — Pulse 4K · Eikos 4K
  - [Alta 4K](analog-way/alta.md) — Alta 4K (Zenith 200)
  - [LivePremier / Aquilon](analog-way/livepremier.md) — Aquilon RS1~RS6
- NovaStar
  - [H Series](novastar/h-series.md) — H2 · H5 · H9 · H9E · H15 · H15E · H20
- Colorlight
  - [X100 Pro](colorlight/x100-pro.md) — 2U · 4U · 7U
  - [Universe](colorlight/universe.md) — U6 Max · U9 Max · U15 Max

## 핵심 원칙 (절대 혼동 금지)
- **독립 입력 ≠ 윈도우 ≠ 레이어 ≠ 출력.** 각각 별도로 검사한다.
- 제조사별 레이어 개념이 다르다 — 하나의 `maxLayers`로 통일 비교하지 않는다:
  | 제품군 | layers.model | 핵심 자원 | 로컬 제약 |
  |---|---|---|---|
  | Analog Way | `mixing_split` | 믹싱(True A/B용) vs 분할 레이어 | operating mode |
  | NovaStar H | `per_output_card` | 출력카드 단위 레이어(카드당 16×2K/8×DL/4×4K) | 카드별 예산 |
  | Colorlight X100 Pro | `global_window` | 독립 입력 + 윈도우/레이어(총량) | 입력·윈도우·출력보드 |
  | Colorlight Universe | `screen_group` | 전역 + 보드당 레이어 | 출력보드/스크린그룹 |

## 데이터 신뢰성 표기
- `official` — 공식 사양서/제품 페이지로 확인.
- `partial_official` — 일부만 공식 확인, 나머지는 `확인 필요`.
- 값이 **확인되지 않으면 `null`(확인 필요)** — 추정하지 않는다. 화면은 `?`/"확인 필요"로 표시하고 임의 PASS 처리하지 않는다.

## 엔진이 적용하는 가정(공식 대체값)
- **출력카드 HDMI 2.0 가정**: 공식 4K 출력 수가 없으면 `카드당 4K × 출력보드 수`로 유도(라벨 "HDMI2.0 가정"). — NovaStar 등.
- **입력카드 슬롯 가정**: 슬롯 1개 = 4K 1개 또는 2K 4개(X100 Pro 실측 일치). NovaStar 독립 입력 유도에 사용.
- **소형 작업 Aquilon 숨김**: 필요 4K 출력 ≤ 2면 고가의 Aquilon을 추천 목록에서 제외(예외 없음).
