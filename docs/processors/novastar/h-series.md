# NovaStar — H Series

성격: 대형 LED / 관제실 / 다중 윈도우 스플라이서(Video Splicer + LED Sending 통합). A/B 방송 스위처 아님.
`layerModel: "per_output_card"` — **레이어 자원이 출력카드 단위**.
DB id: `ns-h2` … `ns-h20` · status: `official`.

---

## Verified Specs (모델별 chassis)
| 모델 | Rack | Input Cards | Output Cards | Max Layers(2K환산, 참고) |
|---|---|---:|---:|---:|
| H2 | 2U | 4 | 2 | 32 |
| H5 | 5U | 10 | 3 | 48 |
| H9 | 9U | 15 | 5 | 80 |
| H9 Enhanced | 9U | 15 | 10 | 160 |
| H15 | 15U | 30 | 10 | 160 |
| H15 Enhanced | 15U | 30 | 16 | 160 |
| H20 | 20U | 40 | 20 | 320 |

공통: Output Card 1장 = **16×2K 또는 8×DL 또는 4×4K** (2K 환산 예산 16). Seamless · Fade · Genlock · HDR · 10-bit = **O**. TCP/IP·RS-232 O.

## UNKNOWN
- **True A/B · Preview/Program: UNKNOWN** — Seamless/Fade 지원만으로 방송급 A/B로 승격 금지.
- **Independent 4K/2K Inputs: UNKNOWN** — 장착 카드 종류 의존(데이터는 null).
- **4K Output 포트 수: UNKNOWN** — 공식 단일값 없음.
- AMX / Crestron: UNKNOWN.

## Important Rules
- **Global Layer 숫자만으로 판정 금지** — 카드별 예산(4K=4/DL=2/2K=1, 카드 16) 초과 시 FAIL. 예: 3×4K+4×2K=16 PASS / 4×4K+1×2K=17 FAIL. 실제 배치 미상이면 "배치 확인 필요".
- 엔진 가정: 독립 4K 입력 = 입력카드 수(슬롯당 4K 1 가정), 4K 출력 = 카드당 4K(4)×출력카드 수(HDMI2.0 가정, 라벨 표기). 정밀 판정은 05 "내 장비 구성으로 검증" 사용.
- Input connector ≠ independent source, Output card ≠ output connector — 혼동 금지.

## Official Sources
- https://www.novastar.tech/tpl/H_SERIES.html
- H Series User Manual V1.12.0 · H5/H9 Specifications V1.2.0 (NovaStar 공식 PDF)
