# Colorlight — Universe (U Series)

성격: 초대형 LED용 고밀도 모듈형 스플라이서. `layerModel: "screen_group"`.
**전역(global) 레이어 + 보드당(per-board) 레이어를 분리** 검사. 전역 PASS여도 특정 출력보드 초과 시 FAIL.
DB id: `cl-universe-u6max` / `-u9max` / `-u15max`.

---

## U6 Max  (status: official)

### Verified Specs
- Input Boards: 10 · Independent 4K: 20 · Independent 2K: 60
- Output Boards: 5 · Independent 4K Out: 10 · Independent 2K Out: 30
- Global Layers: 20×4K / 80×2K
- Per Output Board: 4×4K / 16×2K
- Fade · HDR · 10-bit · Preview/Monitoring · Redundancy: O

### UNKNOWN
- Seamless / True A/B: UNKNOWN
- Genlock / AMX / Crestron: UNKNOWN

## U9 Max  (status: official)

### Verified Specs
- Input Boards: 18 · Independent 4K: 36 · Independent 2K: 108
- Output Boards: 10 · Independent 4K Out: 20 · Independent 2K Out: 60
- Global Layers: 40×4K / 160×2K
- Per Output Board: 4×4K / 16×2K
- Fade · HDR · 10-bit · Preview/Monitoring · Redundancy: O

### UNKNOWN
- Seamless / True A/B: UNKNOWN
- Genlock / AMX / Crestron: UNKNOWN

## U15 Max  (status: partial_official)

### Verified Specs
- Input Boards: 30 · Independent 4K: 60 · Independent 2K: 120
- Output Boards: 20 · Independent 4K Out: 40 · Independent 2K Out: 120
- Global Layers: 80×4K / 320×2K
- Fade · HDR · 10-bit · Preview/Monitoring · Redundancy: O
- 참고: 최대 5.2억 화소, 카드 슬롯 최대 40, 카드당 최대 8K 입력

### UNKNOWN
- **Per Output Board Layer (perBoard4k/2k): UNKNOWN** — U6/U9의 4×4K/16×2K를 자동 적용 금지.
- Seamless / True A/B: UNKNOWN
- Genlock / AMX / Crestron: UNKNOWN

---

## Important Rules
- **Global capacity + Per-board capacity 둘 다** 충족해야 PASS. 전역이 남아도 한 출력보드 예산 초과면 FAIL.
- 카드 슬롯 총수(예: U15 40)와 최대 입력/출력 보드 수는 **다른 개념** — 슬롯 합으로 입출력 보드 수를 역산하지 않는다(입력/출력 조합 사용).
- 입력 밀도가 X100과 다르다(예: U9 입력보드당 2×4K) → "슬롯당 4K 1/2K 4" 가정을 Universe에 적용하지 않는다(공식 독립 입력값 사용).
- 많은 레이어 ≠ True A/B Mixing. Preview/Monitoring ≠ Analog Way식 Program/Preview 2-bus.

## Official Sources
- U6 Max Specification V1.0 · U9 Max Specification V1.1 · U15 Max Specification V1.0
- https://en.colorlightinside.com/product/special/2033
- https://en.colorlightinside.com/product/download///2376
