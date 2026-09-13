// processor-data.js — 비디오 프로세서(영상 스위처/스플라이서) 순수 스펙 데이터.
// 계산 로직 없음(모든 판정은 processor-limits.js / processor-validator.js).
// 스키마·규칙 출처: processor-selector-source-of-truth.md(SoT) + 이사 지침(2026-09-13, plan v2).
//
// 데이터 신뢰성 원칙(SoT §18, CLAUDE.md 규칙 2):
//   - 공식 자료/이사 제공 문서로 "확인된 값"만 채운다. 확인 안 된 값은 절대 추정하지 않고 null.
//   - null !== false. UI에서 null은 "—/미확인", 하드제약에서 임의 PASS 처리 금지.
//
// 반드시 분리(SoT §7·§14, 지침 1·3):
//   outputs.maxActiveOutputs      : 물리 액티브 출력 (≠ PGM)
//   outputs.maxIndependent4kOutputs: 독립 4K 출력 커버리지
//   outputs.maxIndependent4kPgm    : 4K PGM(스크린) — Samsung S-Box 출력 판정에 사용(Analog Way)
//   slots.physical* ≠ slots.max*Boards (NovaStar 등: 물리 슬롯 ≠ 최대 보드 수)
//
// layers.model:
//   'mixing_split'    Analog Way — 믹싱(True A/B) vs 분할 레이어 분리
//   'per_output_card' NovaStar H — 레이어 자원이 출력카드 단위
//   'global_window'   Colorlight X100 Pro — Window 상한(≠Layer). per-card 공식 미확인이면 null
//   'screen_group'    Colorlight Universe — 전역 레이어 + 보드별 레이어 둘 다

const AW = 'Analog Way', NS = 'NovaStar', CL = 'Colorlight';

// 누락 필드는 null(확인 필요). comboHdmi14Sdi3g: HDMI1.4/3G-SDI 겸용 입력 수(표시용).
const emptySlots = () => ({ physicalInputSlots: null, physicalOutputSlots: null, maxInputBoards: null, maxOutputBoards: null, sharedIoSlots: null });
// 입력 필드 의미(혼동 금지):
//   total             : 공식 확인된 "총 입력 수".
//   maxIndependent4k  : 4K60 신호를 독립적으로 받을 수 있는 최대 입력 수(용량).
//   maxIndependent2k  : 2K60 신호를 독립적으로 받을 수 있는 최대 입력 수(용량). 4K 포트도 2K를 받으면
//                       여기에 포함된다 → "2K 전용 입력 수"가 아니다.
//   dedicated2kInputs : 2K 전용(4K 불가) 입력 포트 수. maxIndependent2k와 완전히 다른 개념. 미확인 null.
// 확인 안 되면 모두 null(추정 금지).
const emptyInputs = () => ({ total: null, maxIndependent2k: null, maxIndependent4k: null, dedicated2kInputs: null, hdmi14: null, hdmi20: null, dp12: null, sdi3g: null, sdi12g: null, comboHdmi14Sdi3g: null });
// 출력: Active / 독립4K출력 / 4K PGM / 독립2K를 각각 분리(지침 1). max4k/max2k 단일값 사용 금지.
//   maxWallSbox4k: 하나의 통합 LED 벽을 구동할 때 지원 가능한 S-Box 4K 패널(3840×2160) 최대 수.
//     Pulse 4K는 4K 1판(S-Box 1개)만 가능 → 1. null이면 별도 제한 없음(4K PGM 용량까지 허용).
const emptyOutputs = () => ({ maxActiveOutputs: null, maxIndependent4kOutputs: null, maxIndependent4kPgm: null, maxIndependent2k: null, maxWallSbox4k: null });
const emptyLayers = () => ({ model: null, maxWindows: null, maxLayers: null, global2k: null, global4k: null, mixing4k: null, split4k: null, perOutputCard2k: null, perOutputCardDL: null, perOutputCard4k: null, perBoard2k: null, perBoard4k: null, chassisMaxLayers2k: null });
const emptyCanvas = () => ({ multiOutputCanvas: null, horizontalSpan: null, verticalSpan: null, maxCanvasOutputs: null });
// AUX(보조 출력)는 제조사/제품군별로 성격이 다르므로 generic 규칙으로 합치지 않는다(지침 7).
//   maxResolution: AUX 최대 해상도('1080p60' | '4K60' 등). maxAuxOutputs: AUX로 쓸 수 있는 출력 수.
//   usesMainLayerResources: AUX 레이어가 메인 처리자원을 소모하는가(Aquilon RS는 false — 별도 자원).
const emptyAux = () => ({ maxResolution: null, maxAuxOutputs: null, usesMainLayerResources: null });
const emptyMixing = () => ({ supportsMixed4k2kBoards: null });
// 운영 모드 지원(Analog Way 등). matrix: 다중 독립 PGM, mixer: 1 PGM + AUX, edgeBlending: 2출력→1 wide PGM.
//   확인 안 되면 null(추정 금지). edgeBlending 여부는 canvas.multiOutputCanvas와 일관 유지.
const emptyModes = () => ({ matrix: null, mixer: null, edgeBlending: null });
const emptySwitching = () => ({ cut: null, fade: null, seamless: null, trueABMixing: null, previewProgram: null, monitoringPreview: null, transitionGrade: null });
const emptyLatency = () => ({ frames: null, milliseconds: null });
const emptyFeatures = () => ({ genlock: null, hdr: null, tenBit: null, multiview: null, redundancy: null });
const emptyControl = () => ({ rs232: null, tcp: null, restApi: null, amxCompatible: null, crestronCompatible: null });

function proc(p) {
  return {
    id: p.id,
    manufacturer: p.manufacturer,
    family: p.family,
    model: p.model,
    lifecycle: p.lifecycle ?? null,                   // 'active' | 'legacy' | null
    configurationType: p.configurationType ?? null,   // 'preconfigured' | 'customizable' | null
    slots: { ...emptySlots(), ...(p.slots ?? {}) },
    fieldFrame: p.fieldFrame ?? null,                 // {inputSlots,outputSlots} — 공식 max와 다를 때만
    inputs: { ...emptyInputs(), ...(p.inputs ?? {}) },
    outputs: { ...emptyOutputs(), ...(p.outputs ?? {}) },
    layers: { ...emptyLayers(), ...(p.layers ?? {}) },
    canvas: { ...emptyCanvas(), ...(p.canvas ?? {}) },
    modes: { ...emptyModes(), ...(p.modes ?? {}) },
    aux: { ...emptyAux(), ...(p.aux ?? {}) },
    outputBoardMixing: { ...emptyMixing(), ...(p.outputBoardMixing ?? {}) },
    switching: { ...emptySwitching(), ...(p.switching ?? {}) },
    latency: { ...emptyLatency(), ...(p.latency ?? {}) },
    features: { ...emptyFeatures(), ...(p.features ?? {}) },
    control: { ...emptyControl(), ...(p.control ?? {}) },
    verification: { status: 'needs_verification', sourceUrl: null, sourceDocument: null, sourceVersion: null, verifiedAt: null, notes: null, ...(p.verification ?? {}) },
  };
}

export const PROCESSORS = [

  // ── Analog Way · Midra 4K (Pulse 4K / Eikos 4K) ───────────────────────────
  // 공식 재검증(2026-09-13): 10입력(8×4K60 + 2×2K60). 2 물리출력 = 최대 2×4K PGM(HDMI+SDI는
  //   mirrored plug → 독립출력 2배 계산 금지, 지침 4·10). 믹싱2/분할4. Active ≠ PGM.
  //   Pulse: Matrix(2×PGM) / Mixer(1×PGM + 1×AUX 1080p60). Edge-Blending 미지원(→ Wide Canvas 불가).
  //   Eikos: Matrix / Mixer / Edge-Blending(Hard-Soft Edge) → 2출력 1 wide PGM 지원(지침 5).
  ...[
    { model: 'Pulse 4K', slug: 'pulse-4k', wall4k: 1,   // 4K 1판(S-Box 1개)만 → 3840×2160 초과 시 사용 불가
      canvas: { multiOutputCanvas: false, horizontalSpan: false, verticalSpan: false, maxCanvasOutputs: null },   // Edge-Blending 미지원
      modes: { matrix: true, mixer: true, edgeBlending: false },   // Matrix(2 독립 PGM) / Mixer / Edge 미지원
      aux: { maxResolution: '1080p60', maxAuxOutputs: 1, usesMainLayerResources: null },   // Mixer 모드 1×AUX. 메인자원 소모여부 미확인→null
      note: 'Matrix 2×4K 독립 PGM / Mixer 1×4K PGM + 1×AUX(1080p60). Edge-Blending 미지원 → Wide Canvas 불가. 통합 벽 4K 1판(S-Box 1개)만 → 3840×2160 초과 시 사용 불가.' },
    { model: 'Eikos 4K', slug: 'eikos-4k', wall4k: null,   // Edge-Blending으로 2출력 wide 가능(별도 제한 없음)
      canvas: { multiOutputCanvas: true, horizontalSpan: true, verticalSpan: true, maxCanvasOutputs: 2 },   // Edge-Blending 지원(2출력 → 1 wide PGM)
      modes: { matrix: true, mixer: true, edgeBlending: true },   // Matrix(2 독립 PGM) / Mixer / Edge-Blending 모두 지원
      aux: { maxResolution: '1080p60', maxAuxOutputs: 1, usesMainLayerResources: null },   // 메인자원 소모여부 미확인→null
      note: 'Matrix(2×4K 독립 PGM) / Mixer(1 PGM + 1 AUX) / Edge-Blending(Hard-Soft Edge). 2 물리출력 전체 → 1 wide Edge-Blended PGM(Edge모드 2믹싱/4분할), 가로·세로 wide canvas 용도. Pulse와 달리 Edge-Blending 지원.' },
  ].map(m => proc({
    id: 'aw-midra-' + m.slug,
    manufacturer: AW, family: 'Midra 4K', model: m.model, lifecycle: 'active', configurationType: 'preconfigured',
    inputs: { total: 10, maxIndependent4k: 8, maxIndependent2k: 10, dedicated2kInputs: 2, hdmi20: 4, dp12: 2, sdi12g: 2, comboHdmi14Sdi3g: 2 },   // 8×4K60 + 2×2K60(전용)
    outputs: { maxActiveOutputs: 2, maxIndependent4kOutputs: 2, maxIndependent4kPgm: 2, maxIndependent2k: null, maxWallSbox4k: m.wall4k },
    layers: { model: 'mixing_split', mixing4k: 2, split4k: 4 },
    canvas: m.canvas,
    modes: m.modes,
    aux: m.aux,
    switching: { cut: true, fade: true, seamless: true, trueABMixing: true, previewProgram: true, transitionGrade: 'presentation' },
    features: { genlock: true, hdr: true, tenBit: true, multiview: true },
    control: { tcp: true, crestronCompatible: true },
    verification: { status: 'official', sourceUrl: 'https://www.analogway.com/products/pulse-4k', sourceDocument: 'EKS-4K 데이터시트(이사 제공) + AW 공식 재검증', sourceVersion: '2026-09-13', notes: m.note + ' 10입력(8×4K + 2×2K 겸용). Active 2 / PGM 2, 믹싱2 분할4. HDMI+SDI mirrored plug → 독립출력 2배 금지.' },
  })),

  // ── Analog Way · Alta 4K (Zenith 100 / Zenith 200) ────────────────────────
  // 지침 1: Active ≠ PGM. Samsung S-Box 판정엔 PGM 사용.
  proc({
    id: 'aw-alta-zenith-100',
    manufacturer: AW, family: 'Alta 4K', model: 'Zenith 100', lifecycle: 'active', configurationType: 'preconfigured',
    inputs: { total: 13, maxIndependent4k: 11, maxIndependent2k: 13, dedicated2kInputs: 2, hdmi20: 6, dp12: 3, sdi12g: 2, comboHdmi14Sdi3g: 2 },   // 11×4K60 + 2×2K60(전용)
    outputs: { maxActiveOutputs: 4, maxIndependent4kOutputs: 4, maxIndependent4kPgm: 3, maxIndependent2k: null },   // Active 4 / PGM 3
    layers: { model: 'mixing_split', mixing4k: 3, split4k: 6 },   // 공식 재검증(2026-09-13): 믹싱3 / 분할6
    canvas: { multiOutputCanvas: true, horizontalSpan: true, verticalSpan: true, maxCanvasOutputs: null },   // Hard/Soft Edge 지원(공식 비교표). 최대 캔버스 출력수 미확인→null
    aux: { maxResolution: '1080p60', maxAuxOutputs: 2, usesMainLayerResources: null },   // 미사용 물리출력 → scaled AUX(1080p60), max 2. 메인자원 소모여부 미확인→null
    switching: { cut: true, fade: true, seamless: true, trueABMixing: true, previewProgram: true, transitionGrade: 'live_production' },
    latency: { frames: 1 }, features: { genlock: true, hdr: true, tenBit: true, multiview: true }, control: { tcp: true, crestronCompatible: true },
    verification: { status: 'official', sourceUrl: 'https://www.analogway.com/products/zenith-100', sourceDocument: 'ZEN100 데이터시트(이사 제공) + AW 공식 비교표 재검증', sourceVersion: '2026-09-13', notes: '13입력(11×4K60 + 2×2K60). Active 4 / 4K PGM 3 / AUX 2(1080p60). 믹싱3 분할6. Hard/Soft Edge 지원. Active ≠ PGM. AUX 메인자원 소모여부 미확인(null).' },
  }),
  proc({
    id: 'aw-alta-zenith-200',
    manufacturer: AW, family: 'Alta 4K', model: 'Zenith 200', lifecycle: 'active', configurationType: 'preconfigured',
    inputs: { total: 16, maxIndependent4k: 14, maxIndependent2k: 16, dedicated2kInputs: 2, hdmi20: 8, dp12: 4, sdi12g: 2, comboHdmi14Sdi3g: 2 },   // 14×4K60 + 2×2K60(전용)
    outputs: { maxActiveOutputs: 6, maxIndependent4kOutputs: 6, maxIndependent4kPgm: 4, maxIndependent2k: null },   // Active 6 / PGM 4
    layers: { model: 'mixing_split', mixing4k: 4, split4k: 8 },
    canvas: { multiOutputCanvas: true, horizontalSpan: true, verticalSpan: true, maxCanvasOutputs: null },   // Hard/Soft Edge 지원(공식 비교표). 최대 캔버스 출력수 미확인→null
    aux: { maxResolution: '1080p60', maxAuxOutputs: 4, usesMainLayerResources: null },   // 미사용 물리출력 → scaled AUX(1080p60), max 4. 메인자원 소모여부 미확인→null
    switching: { cut: true, fade: true, seamless: true, trueABMixing: true, previewProgram: true, transitionGrade: 'live_production' },
    latency: { frames: 1 }, features: { genlock: true, hdr: true, tenBit: true, multiview: true }, control: { tcp: true, crestronCompatible: true },
    verification: { status: 'official', sourceUrl: 'https://www.analogway.com/products/zenith-200', sourceDocument: 'ZEN200 데이터시트(이사 제공) + AW 공식 비교표 재검증', sourceVersion: '2026-09-13', notes: '16입력(14×4K60 + 2×2K60). Active 6 / 4K PGM 4 / AUX 4(1080p60). 믹싱4 분할8. Hard/Soft Edge 지원. Active ≠ PGM. AUX 메인자원 소모여부 미확인(null).' },
  }),

  // ── Analog Way · Aquilon (LivePremier RS) ─────────────────────────────────
  // 공식 재검증(2026-09-13, 지침 6): 모델별 PGM/믹싱/분할 확정 → PGM null 규칙 폐기.
  //   Active ≠ PGM ≠ Mixing(지침 8). non-PGM 출력은 scaled 4K60 AUX로 사용 가능하고 그 AUX 레이어는
  //   메인 처리자원을 쓰지 않음(usesMainLayerResources=false, 지침 7) — Zenith(1080p60 AUX)와 다름.
  ...[
    { model: 'Aquilon RS alpha', in4k: 8,  act: 4,  pgm: 4,  mix: 4,  split: 8,  slug: 'rsalpha' },
    { model: 'Aquilon RS1',      in4k: 16, act: 8,  pgm: 4,  mix: 4,  split: 8,  slug: 'rs1' },
    { model: 'Aquilon RS2',      in4k: 16, act: 12, pgm: 8,  mix: 8,  split: 16, slug: 'rs2' },
    { model: 'Aquilon RS3',      in4k: 24, act: 12, pgm: 8,  mix: 8,  split: 16, slug: 'rs3' },
    { model: 'Aquilon RS4',      in4k: 24, act: 16, pgm: 8,  mix: 12, split: 24, slug: 'rs4' },
    { model: 'Aquilon RS5',      in4k: 32, act: 16, pgm: 12, mix: 12, split: 24, slug: 'rs5' },
    { model: 'Aquilon RS6',      in4k: 32, act: 20, pgm: 16, mix: 16, split: 32, slug: 'rs6' },
  ].map(m => proc({
    id: 'aw-aquilon-' + m.slug,
    manufacturer: AW, family: 'Aquilon', model: m.model, lifecycle: 'active', configurationType: 'preconfigured',
    inputs: { total: m.in4k, maxIndependent4k: m.in4k },   // 총 입력 수 = 확인된 4K 입력 수(2K 전용수는 미확인→null)
    outputs: { maxActiveOutputs: m.act, maxIndependent4kOutputs: m.act, maxIndependent4kPgm: m.pgm },   // Active ≠ PGM(공식값)
    layers: { model: 'mixing_split', mixing4k: m.mix, split4k: m.split },
    aux: { maxResolution: '4K60', maxAuxOutputs: null, usesMainLayerResources: false },   // non-PGM 출력 = scaled 4K60 AUX, 메인자원 미소모
    switching: { cut: true, fade: true, seamless: true, trueABMixing: true, previewProgram: true, transitionGrade: 'broadcast_grade' },
    features: { genlock: true, hdr: true, tenBit: true, multiview: true, redundancy: true },
    control: { tcp: true, restApi: true, amxCompatible: true, crestronCompatible: true },
    verification: { status: 'official', sourceUrl: 'https://www.analogway.com/products/', sourceDocument: 'Analog Way LivePremier RS 공식 재검증(이사 제공, 2026-09-13)', sourceVersion: '2026-09-13', notes: `IN ${m.in4k}×4K / Active ${m.act} / PGM ${m.pgm} / 믹싱 ${m.mix} / 분할 ${m.split}. non-PGM 출력=scaled 4K60 AUX(메인자원 미소모). Active·PGM·Mixing 별도.` },
  })),

  // ── Analog Way · Aquilon C mini (customizable / LivePremier) ──────────────
  // SoT §8: 2 입력카드 / 3 출력카드. Max 8×4K IN / 12×4K Active Out / 4×4K PGM / 4×4K Mixing.
  proc({
    id: 'aw-aquilon-cmini',
    manufacturer: AW, family: 'Aquilon', model: 'Aquilon C mini', lifecycle: 'active', configurationType: 'customizable',
    slots: { maxInputBoards: 2, maxOutputBoards: 3 },
    inputs: { total: 8, maxIndependent4k: 8 },
    outputs: { maxActiveOutputs: 12, maxIndependent4kOutputs: 12, maxIndependent4kPgm: 4 },
    layers: { model: 'mixing_split', mixing4k: 4, split4k: null },
    switching: { cut: true, fade: true, seamless: true, trueABMixing: true, previewProgram: true, transitionGrade: 'broadcast_grade' },
    features: { genlock: true, hdr: true, tenBit: true, multiview: true, redundancy: true },
    control: { tcp: true, restApi: true, amxCompatible: true, crestronCompatible: true },
    verification: { status: 'partial_official', sourceUrl: 'https://www.analogway.com/products/', sourceDocument: 'SoT §8 (Aquilon C mini)', sourceVersion: '2026-09-13', notes: 'customizable. 8×4K IN / 12×4K Active / 4×4K PGM / 4×4K 믹싱. 확장성·이중화(LivePremier). Zenith 200과 단순 상하비교 금지.' },
  }),

  // ── NovaStar · H Series ───────────────────────────────────────────────────
  // 지침 3: physical slot ≠ max board count. 출력카드 1장 = 독립 4K 출력 1(+LOOP, LOOP는 독립출력 아님).
  //   per_output_card 레이어(카드당 16×2K/8×DL/4×4K). H20은 SoT 라인업 밖 → needs_verification(지침 6).
  ...[
    { model: 'H2',           slug: 'h2',   inCards: 4,  outCards: 2,  maxLayers: 32,  status: 'official' },
    { model: 'H5',           slug: 'h5',   inCards: 10, outCards: 3,  maxLayers: 48,  status: 'official' },
    { model: 'H9',           slug: 'h9',   inCards: 15, outCards: 5,  maxLayers: 80,  status: 'official' },
    { model: 'H9 Enhanced',  slug: 'h9e',  inCards: 15, outCards: 10, maxLayers: 160, status: 'official' },
    { model: 'H15',          slug: 'h15',  inCards: 30, outCards: 10, maxLayers: 160, status: 'official' },
    { model: 'H15 Enhanced', slug: 'h15e', inCards: 30, outCards: 16, maxLayers: 160, status: 'official' },
    { model: 'H20',          slug: 'h20',  inCards: 40, outCards: 20, maxLayers: 320, status: 'needs_verification' },  // SoT 라인업 밖
  ].map(m => proc({
    id: 'ns-' + m.slug,
    manufacturer: NS, family: 'H', model: 'H Series ' + m.model, lifecycle: 'active', configurationType: 'customizable',
    // 공식 최대 보드 수만 확인됨. 물리 슬롯 수(입출력 공용 포함)는 미확인 → null(지침 3).
    slots: { maxInputBoards: m.inCards, maxOutputBoards: m.outCards, physicalInputSlots: null, physicalOutputSlots: null, sharedIoSlots: null },
    inputs: {},   // 독립 4K/2K 입력 수는 장착 카드 종류 의존 → null(카드=4K1/2K4 가정은 limits에서 유도)
    outputs: {},  // 독립 4K 출력 = 출력카드 수(카드=1×4K, LOOP 제외) → limits.outputCapacity에서 유도
    layers: { model: 'per_output_card', perOutputCard2k: 16, perOutputCardDL: 8, perOutputCard4k: 4, chassisMaxLayers2k: m.maxLayers },
    switching: { seamless: true, fade: true },
    features: { genlock: true, hdr: true, tenBit: true, redundancy: true },
    control: { tcp: true, rs232: true },
    verification: { status: m.status, sourceUrl: 'https://www.novastar.tech/tpl/H_SERIES.html', sourceDocument: 'NOVASTAR_H Series(ver.2)', sourceVersion: 'V1.12.0', notes: m.status === 'needs_verification' ? 'SoT 라인업 밖 — 검증 후 활성화. 자동추천 제외.' : '카드당 16×2K/8×DL/4×4K. 출력카드=독립4K출력 1(+LOOP). 물리슬롯·독립입력수 미확인. True A/B·PVW/PGM·AMX/Crestron 미확인.' },
  })),

  // ── Colorlight · X100 Pro ─────────────────────────────────────────────────
  // 지침 4·이사 확인: maxLayers는 device-level 공식(7U=64). Window≠Layer. per-output-card 공식 미확인 → null.
  //   출력보드 혼용: 2U/4U/7U 불가(false). 11U+ 가능(true, 검증 데이터 있는 모델만). "4K=2K×4"는 engineeringRule.
  ...[
    { model: 'X100 Pro 2U', boards: 2, in2k: 8,  in4k: 2, win: 32, lay: 32, out4kB: 4, out2k: 16, slug: '2u' },
    { model: 'X100 Pro 4U', boards: 4, in2k: 16, in4k: 4, win: 32, lay: 32, out4kB: 4, out2k: 16, slug: '4u' },
    { model: 'X100 Pro 7U', boards: 8, in2k: 32, in4k: 8, win: 64, lay: 64, out4kB: 8, out2k: 32, slug: '7u' },
  ].map(m => proc({
    id: 'cl-x100pro-' + m.slug,
    manufacturer: CL, family: 'X100 Pro', model: m.model, lifecycle: 'active', configurationType: 'customizable',
    slots: { maxInputBoards: m.boards, maxOutputBoards: m.out4kB },
    inputs: { maxIndependent2k: m.in2k, maxIndependent4k: m.in4k },
    outputs: { maxActiveOutputs: m.out4kB, maxIndependent4kOutputs: m.out4kB, maxIndependent2k: m.out2k, maxIndependent4kPgm: null },
    layers: { model: 'global_window', maxWindows: m.win, maxLayers: m.lay, global4k: null, global2k: null, perOutputCard4k: null },
    outputBoardMixing: { supportsMixed4k2kBoards: false },   // 2U/4U/7U 혼용 불가(11U+ 모델만 true)
    switching: { monitoringPreview: true },
    features: { genlock: true, tenBit: true },
    control: {},
    verification: { status: 'official', sourceUrl: 'https://en.colorlightinside.com/product/download/111', sourceDocument: 'X100 Pro Specification', sourceVersion: 'V2.0', notes: 'Max Layers(device) 32/32/64, Window 32/32/64(≠Layer). 출력 4K보드수/2K. per-card Layer 미확인(null). 출력보드 혼용 불가. HDR·seamless·True A/B 미확인.' },
  })),

  // ── Colorlight · Universe (U Series) ──────────────────────────────────────
  // 독립 입력 + 전역(global) 레이어 + 보드별(per-board) 레이어 분리(지침: Global+Per-board 둘 다 검사).
  ...[
    { model: 'Universe U3 Max',  slug: 'u3max',  in4k: 10, in2k: null, inB: 5,  o4k: 6,  o2k: null, oB: 3,  g2k: 48,  g4k: 12, pb4: 4, status: 'official',        ver: 'U3 Max Specification (SoT §10)' },
    { model: 'Universe U6 Max',  slug: 'u6max',  in4k: 20, in2k: 60,   inB: 10, o4k: 10, o2k: 30,   oB: 5,  g2k: 80,  g4k: 20, pb4: 4, status: 'official',        ver: 'U6 Max Specification V1.0' },
    { model: 'Universe U9 Max',  slug: 'u9max',  in4k: 36, in2k: 108,  inB: 18, o4k: 20, o2k: 60,   oB: 10, g2k: 160, g4k: 40, pb4: 4, status: 'official',        ver: 'U9 Max Specification V1.1' },
    { model: 'Universe U15 Max', slug: 'u15max', in4k: 60, in2k: 120,  inB: 30, o4k: 40, o2k: 120,  oB: 20, g2k: 320, g4k: 80, pb4: 4, status: 'partial_official', ver: 'U15 Max Specification V1.0' },
  ].map(m => proc({
    id: 'cl-universe-' + m.slug,
    manufacturer: CL, family: 'Universe', model: m.model, lifecycle: 'active', configurationType: 'customizable',
    slots: { maxInputBoards: m.inB, maxOutputBoards: m.oB, sharedIoSlots: m.slug === 'u15max' ? 40 : null },   // U15: 40 물리슬롯 I/O 공용(입출력 단순합≠40)
    inputs: { maxIndependent4k: m.in4k, maxIndependent2k: m.in2k },
    outputs: { maxActiveOutputs: m.o4k, maxIndependent4kOutputs: m.o4k, maxIndependent2k: m.o2k, maxIndependent4kPgm: null },
    layers: { model: 'screen_group', global2k: m.g2k, global4k: m.g4k, perBoard2k: 16, perBoard4k: m.pb4 },
    switching: { fade: true, monitoringPreview: true, ...(m.slug === 'u6max' ? { cut: true } : {}) },
    features: { hdr: true, tenBit: true, redundancy: true },
    control: { tcp: true },
    verification: { status: m.status, sourceUrl: 'https://en.colorlightinside.com/', sourceDocument: m.ver, sourceVersion: m.ver, notes: 'I/O·출력·전역/보드 레이어 반영. True A/B·Seamless·Genlock 미확인(null).' + (m.slug === 'u15max' ? ' 40슬롯 I/O 공용.' : '') + (m.slug === 'u3max' ? ' 2K I/O수는 SoT 표 미기재→null.' : '') },
  })),

];

/** id로 프로세서 1개 조회. */
export function getProcessor(id) {
  return PROCESSORS.find(p => p.id === id) ?? null;
}

export default PROCESSORS;
