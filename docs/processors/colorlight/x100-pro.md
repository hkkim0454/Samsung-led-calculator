# Colorlight — X100 Pro

성격: 대량 입력 / 윈도우 / 대형 LED 스플라이서(모듈형). A/B 방송 스위처 아님.
`layerModel: "global_window"` · 입력 슬롯과 출력 슬롯은 **분리** 구조.
DB id: `cl-x100pro-2u` / `-4u` / `-7u` · verification.status: `official`.

---

## X100 Pro-2U

### Verified Specs
- Input Boards: 2
- Independent 4K Inputs: 2
- Independent 2K Inputs: 8
- Max Windows / Layers: 32
- Output Boards: 4
- Independent 4K Outputs: 4
- Independent 2K Outputs: 16
- Genlock: O · 10-bit(4K 출력보드): O · Preview/Monitoring: O

### UNKNOWN
- 2K Layer Capacity (global2k): UNKNOWN
- 4K Layer Capacity (global4k): UNKNOWN
- HDR / Seamless / Fade / True A/B: UNKNOWN
- AMX / Crestron: UNKNOWN

## X100 Pro-4U

### Verified Specs
- Input Boards: 4
- Independent 4K Inputs: 4
- Independent 2K Inputs: 16
- Max Windows / Layers: 32
- Output Boards: 4
- Independent 4K Outputs: 4
- Independent 2K Outputs: 16
- Genlock: O · 10-bit(4K 출력보드): O · Preview/Monitoring: O

### UNKNOWN
- 2K / 4K Layer Capacity: UNKNOWN
- HDR / Seamless / Fade / True A/B: UNKNOWN
- AMX / Crestron: UNKNOWN

## X100 Pro-7U

### Verified Specs
- Input Boards: 8
- Independent 4K Inputs: 8
- Independent 2K Inputs: 32
- Max Windows / Layers: 64
- Output Boards: 8
- Independent 4K Outputs: 8
- Independent 2K Outputs: 32
- Genlock: O · 10-bit(4K 출력보드): O · Preview/Monitoring: O

### UNKNOWN
- 2K Layer Capacity: UNKNOWN
- 4K Layer Capacity: UNKNOWN
- HDR / Seamless / Fade / True A/B: UNKNOWN
- AMX / Crestron: UNKNOWN

---

## Important Rules
- **Window ≠ Layer** — Max Windows(=Max. layers, 해상도 무관 총 레이어)를 `4K 레이어 16` / `2K 레이어 64`로 해석하지 않는다. 해상도별 레이어가 확인되지 않으면 `global4k=null`, `global2k=null`.
- **Input connectors ≠ independent sources** — 한 입력보드의 HDMI/DP는 한 소스의 대체 커넥터일 수 있다. 입력보드 1장 = 4K 1개 또는 2K 4개.
- 4K 입력을 여러 윈도우로 **복제**하면 레이어가 입력보다 많을 수 있다(입력 8 → 최대 64 레이어). 서로 다른 소스가 입력 상한을 넘으면 FAIL.
- **Output-board 구성이 출력 종류를 결정** — 4K 출력보드(1×4K)와 2K 출력보드(4×2K)는 혼용 불가 → `max4k`+`max2k`를 동시 사용으로 계산하지 않는다.
- 입력/출력 슬롯 분리 → 입력 최대와 출력 최대는 동시 성립.

## Official Sources
- X100 Pro-2U / 4U / 7U Specification V2.0
- https://en.colorlightinside.com/product/download/111
