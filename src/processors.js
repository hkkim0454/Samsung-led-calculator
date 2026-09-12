// processors.js — 비디오 프로세서(영상 스위처/스플라이서) 순수 스펙 데이터.
// 계산 로직 없음(모든 판정은 engine.js). 스키마는 컨텍스트 문서(2026-09-12) §9 기준.
//
// 데이터 신뢰성 원칙(문서 §15, CLAUDE.md 규칙 2):
//   - 공식 자료/오너 제공 문서로 "확인된 값"만 채운다.
//   - 확인되지 않은 값은 절대 추정하지 않고 null + verification.status='needs_verification'.
//   - UI에서 null은 "확인 필요"로 표시하고, 하드 제약에서 임의 PASS 처리하지 않는다.
//
// 출처 표기:
//   - 오너 제공 컨텍스트 문서(2026-09-12): X100 Pro 표(§6), U6 Max(§7), Alta Zenith 200(§5.2),
//     Aquilon RS 예시(§3 예제, RS4). 이 값들은 문서에 명시된 것만 반영.
//   - Analog Way 공식 제품 페이지(2026-09-12 조사): Midra 4K I/O, Aquilon RS 믹싱/분할 레이어.
//   - NovaStar H / Colorlight 세부 수치는 대부분 PDF 사양서에만 있어 이 환경에서 열람 불가 → 확인 필요.
//
// layers.model:
//   'mixing_split'    Analog Way — 믹싱 레이어(True A/B용) vs 분할 레이어를 구분.
//   'per_output_card' NovaStar H — 레이어 자원이 출력카드 단위(카드당 한계 검증 필요).
//   'global_window'   Colorlight X100 Pro — 전체 윈도우 상한 + 독립 입력 상한이 별개.
//   'screen_group'    Colorlight Universe — 전역 레이어 + 출력보드/스크린그룹 단위.

const AW = 'Analog Way', NS = 'NovaStar', CL = 'Colorlight';

// 반복되는 빈 서브구조 기본값(누락 필드는 null = 확인 필요).
const emptyInputs = () => ({ maxIndependent2k: null, maxIndependent4k: null, maxInputBoards: null, hdmi14: null, hdmi20: null, dp12: null, sdi3g: null, sdi12g: null });
const emptyOutputs = () => ({ max2k: null, max4k: null, maxOutputBoards: null });
// monitoringPreview: 멀티뷰/프리뷰·모니터링 지원(≠ Analog Way식 Program/Preview 2-bus). previewProgram과 분리.
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
    inputs: { ...emptyInputs(), ...(p.inputs ?? {}) },
    outputs: { ...emptyOutputs(), ...(p.outputs ?? {}) },
    layers: { model: p.layers.model, maxWindows: null, global2k: null, global4k: null, mixing4k: null, split4k: null, perOutputCard2k: null, perOutputCardDL: null, perOutputCard4k: null, perBoard2k: null, perBoard4k: null, ...p.layers },
    switching: { ...emptySwitching(), ...(p.switching ?? {}) },
    latency: { ...emptyLatency(), ...(p.latency ?? {}) },
    features: { ...emptyFeatures(), ...(p.features ?? {}) },
    control: { ...emptyControl(), ...(p.control ?? {}) },
    verification: { status: 'needs_verification', sourceUrl: null, sourceVersion: null, verifiedAt: null, notes: null, ...(p.verification ?? {}) },
  };
}

export const PROCESSORS = [

  // ── Analog Way · Midra 4K ─────────────────────────────────────────────────
  // I/O는 공식 페이지 확인(8×4K + 2×2K 입력, 2×4K 출력, 공통). 레이어(믹싱/분할)는
  // 모델별 정확값이 공식 텍스트에 없어 null(확인 필요). 성격상 프레젠테이션 스위처.
  // (QuickVu 4K·QuickMatrix 4K는 단종 — 이사 확인 2026-09-12, 삭제.)
  ...['Pulse 4K', 'Eikos 4K'].map(model => proc({
    id: 'aw-midra-' + model.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/,''),
    manufacturer: AW, family: 'Midra', model,
    inputs: { maxIndependent4k: 8, maxIndependent2k: 2, hdmi20: 4, dp12: 2, sdi12g: 2 },
    outputs: { max4k: 2 },
    layers: { model: 'mixing_split', mixing4k: 2, split4k: 4 },  // 최대 2×4K 믹싱 / 4×4K 분할(프로젝트 조사 기준)
    switching: { cut: true, fade: true, seamless: true, trueABMixing: true, previewProgram: true, transitionGrade: 'presentation' },
    features: { genlock: true, hdr: true, tenBit: true, multiview: true },
    control: { tcp: true, crestronCompatible: true },
    verification: { status: 'official', sourceUrl: 'https://www.analogway.com/products/pulse-4k', sourceVersion: 'AW 공식 페이지(handoff v2 §J)', notes: '믹싱 2×4K / 분할 4×4K 공식 확인. Eikos Wide Canvas(single_wide)는 별도 PR' },
  })),

  // ── Analog Way · Alta 4K (Zenith 200 기준) ────────────────────────────────
  // 오너 문서 §5.2: 16입력(14×4K + 2×2K), 6출력(최대 4×4K Program), 8×4K 분할 / 4×4K 믹싱.
  proc({
    id: 'aw-alta-zenith-200',
    manufacturer: AW, family: 'Alta', model: 'Alta 4K (Zenith 200)',
    inputs: { maxIndependent4k: 14, maxIndependent2k: 2, hdmi20: 8, dp12: 4, sdi12g: 2 },
    outputs: { max4k: 4 },   // 최대 4×4K60 Program outputs (총 6 outputs)
    layers: { model: 'mixing_split', mixing4k: 4, split4k: 8 },
    switching: { cut: true, fade: true, seamless: true, trueABMixing: true, previewProgram: true, transitionGrade: 'live_production' },
    latency: { frames: 1 },
    features: { genlock: true, hdr: true, tenBit: true, multiview: true },
    control: { tcp: true, crestronCompatible: true },   // AMX는 공식 미확인(null 유지)
    verification: { status: 'official', sourceUrl: 'https://www.analogway.com/products/zenith-200', sourceVersion: 'Zenith 200 datasheet + Alta 4K brochure(handoff v2 §G)', notes: '총 6출력 중 4×4K Program. Genlock·Crestron 공식. AMX 확인 필요' },
  }),

  // ── Analog Way · Aquilon (LivePremier RS) ─────────────────────────────────
  // 입력/출력/믹싱·분할 레이어: 공식 제품 페이지 조사값(오너 문서 §3 RS4 예시와 일치).
  ...[
    { model: 'Aquilon RS1', in4k: 16, out4k: 8,  mix: 4,  split: 8,  slug: 'rs1' },
    { model: 'Aquilon RS2', in4k: 16, out4k: 12, mix: 8,  split: 16, slug: 'rs2' },
    { model: 'Aquilon RS3', in4k: 24, out4k: 12, mix: 8,  split: 16, slug: 'rs3' },
    { model: 'Aquilon RS4', in4k: 24, out4k: 16, mix: 12, split: 24, slug: 'rs4' },
    { model: 'Aquilon RS6', in4k: 32, out4k: 20, mix: 16, split: 32, slug: 'rs6' },
  ].map(m => proc({
    id: 'aw-aquilon-' + m.slug,
    manufacturer: AW, family: 'Aquilon', model: m.model,
    inputs: { maxIndependent4k: m.in4k },
    outputs: { max4k: m.out4k },
    layers: { model: 'mixing_split', mixing4k: m.mix, split4k: m.split },
    switching: { cut: true, fade: true, seamless: true, trueABMixing: true, previewProgram: true, transitionGrade: 'broadcast_grade' },
    features: { genlock: true, hdr: true, tenBit: true, multiview: true, redundancy: true },
    control: { tcp: true, restApi: true, amxCompatible: true, crestronCompatible: true },
    verification: { status: 'official', sourceUrl: 'https://www.analogway.com/products/' + m.slug.replace('rs','aquilon-rs'), sourceVersion: 'AW LivePremier 공식(handoff v2 §F)', notes: 'I/O·믹싱/분할·Genlock/Framelock·True A/B·AMX/Crestron 공식 확인' },
  })),

  // ── NovaStar · H Series ───────────────────────────────────────────────────
  // 레이어 자원은 출력카드 단위(카드 1장 = 16×2K / 8×DL / 4×4K, 문서 §4). 카드 예산 검사가 핵심.
  // chassis maxLayers(참고값)·입력/출력 카드 수는 공식(문서 §3). 단, 독립 4K 입력 수는 장착 카드에
  // 따라 달라 산출 불가 → null(확인 필요, 문서 §7).
  ...[
    { model: 'H2',           slug: 'h2',   u: 2,  inCards: 4,  outCards: 2,  maxLayers: 32 },
    { model: 'H5',           slug: 'h5',   u: 5,  inCards: 10, outCards: 3,  maxLayers: 48 },
    { model: 'H9',           slug: 'h9',   u: 9,  inCards: 15, outCards: 5,  maxLayers: 80 },
    { model: 'H9 Enhanced',  slug: 'h9e',  u: 9,  inCards: 15, outCards: 10, maxLayers: 160 },
    { model: 'H15',          slug: 'h15',  u: 15, inCards: 30, outCards: 10, maxLayers: 160 },
    { model: 'H15 Enhanced', slug: 'h15e', u: 15, inCards: 30, outCards: 16, maxLayers: 160 },
    { model: 'H20',          slug: 'h20',  u: 20, inCards: 40, outCards: 20, maxLayers: 320 },
  ].map(m => proc({
    id: 'ns-' + m.slug,
    manufacturer: NS, family: 'H', model: 'H Series ' + m.model,
    inputs: { maxInputBoards: m.inCards },          // 독립 4K/2K 입력 수는 카드 종류 의존 → null(확인 필요)
    outputs: { maxOutputBoards: m.outCards },        // 4K 출력 커버리지 = 카드당 4K(4) × 출력카드 수
    layers: { model: 'per_output_card', perOutputCard2k: 16, perOutputCardDL: 8, perOutputCard4k: 4, chassisMaxLayers2k: m.maxLayers },
    switching: { seamless: true, fade: true },      // 공식: seamless switching + fade. True A/B·PVW/PGM은 확인 필요(null)
    features: { genlock: true, hdr: true, tenBit: true, redundancy: true },
    control: { tcp: true, rs232: true },            // AMX/Crestron 확인 필요(null)
    verification: { status: 'official', sourceUrl: 'https://www.novastar.tech/tpl/H_SERIES.html', sourceVersion: 'H Series User Manual V1.12.0 / H5·H9 Spec V1.2.0(handoff v2 §C)', notes: `${m.u}U. 카드당 16×2K/8×DL/4×4K. Seamless·Fade·Genlock·HDR·10bit 공식. True A/B·PVW/PGM·AMX/Crestron 확인 필요. 독립 입력 수는 장착 카드 의존` },
  })),

  // ── Colorlight · X100 Pro ─────────────────────────────────────────────────
  // 오너 문서 §6 표(2U/4U/7U): 독립 2K/4K 입력, Max Window. 출력 수·기능은 확인 필요.
  // 출력: 4K 출력보드 1장=1×4K, 2K 출력보드 1장=4×2K. 4K/2K 출력보드는 혼용 불가 → max4k와 max2k를 동시 사용으로 계산 금지.
  ...[
    { model: 'X100 Pro 2U', boards: 2, in2k: 8,  in4k: 2, win: 32, outB: 4, out4k: 4, out2k: 16, slug: '2u' },
    { model: 'X100 Pro 4U', boards: 4, in2k: 16, in4k: 4, win: 32, outB: 4, out4k: 4, out2k: 16, slug: '4u' },
    { model: 'X100 Pro 7U', boards: 8, in2k: 32, in4k: 8, win: 64, outB: 8, out4k: 8, out2k: 32, slug: '7u' },
  ].map(m => proc({
    id: 'cl-x100pro-' + m.slug,
    manufacturer: CL, family: 'X100 Pro', model: m.model,
    inputs: { maxIndependent2k: m.in2k, maxIndependent4k: m.in4k, maxInputBoards: m.boards },
    outputs: { max4k: m.out4k, max2k: m.out2k, maxOutputBoards: m.outB },
    layers: { model: 'global_window', maxWindows: m.win },  // global2k/4k 확인 필요(윈도우≠레이어)
    switching: { monitoringPreview: true },        // 멀티스크린 프리뷰·모니터링 공식(≠ A/B PVW/PGM). seamless/fade/trueAB 확인 필요
    features: { genlock: true, tenBit: true },      // Genlock 공식, 10bit는 4K 출력보드 기준. HDR 확인 필요
    control: {},                                   // AMX/Crestron 확인 필요
    verification: { status: 'official', sourceUrl: 'https://en.colorlightinside.com/product/download/111', sourceVersion: 'X100 Pro-' + m.slug.toUpperCase() + ' Specification V2.0', notes: '독립 입력·윈도우·출력(보드×포트) 공식. 4K/2K 출력보드 혼용 불가(동시 사용 아님). 전역 레이어·HDR·스위칭 확인 필요' },
  })),

  // ── Colorlight · Universe (U Series) ──────────────────────────────────────
  // 독립 입력 + 전역(global) 레이어 + 보드/스크린그룹(per-board) 레이어를 분리 관리(문서 §11·§17).
  // U6 Max: 공식(문서 §12). U9/U15 Max: 레이어는 공식, I/O·per-board는 PDF 확인 필요 → partial_official.
  proc({
    id: 'cl-universe-u6max',
    manufacturer: CL, family: 'Universe', model: 'Universe U6 Max',
    inputs: { maxIndependent4k: 20, maxIndependent2k: 60, maxInputBoards: 10 },
    outputs: { max4k: 10, max2k: 30, maxOutputBoards: 5 },
    // 장치 전체 80×2K 또는 20×4K, 보드 1장 16×2K 또는 4×4K.
    layers: { model: 'screen_group', global2k: 80, global4k: 20, perBoard2k: 16, perBoard4k: 4 },
    switching: { cut: true, fade: true, monitoringPreview: true },   // True A/B는 공식 미확인(null). 프리뷰·모니터링은 공식
    features: { hdr: true, tenBit: true, redundancy: true },
    control: { tcp: true },
    verification: { status: 'official', sourceUrl: 'https://en.colorlightinside.com/product/special/2033', sourceVersion: 'U6 Max Specification V1.0 (문서 §12)', notes: 'I/O·출력·전역/보드 레이어·Fade·HDR·10bit 공식. True A/B·Seamless·Genlock 확인 필요' },
  }),
  proc({
    id: 'cl-universe-u9max',
    manufacturer: CL, family: 'Universe', model: 'Universe U9 Max',
    inputs: { maxIndependent4k: 36, maxIndependent2k: 108, maxInputBoards: 18 },
    outputs: { max4k: 20, max2k: 60, maxOutputBoards: 10 },
    layers: { model: 'screen_group', global2k: 160, global4k: 40, perBoard2k: 16, perBoard4k: 4 },
    switching: { fade: true, monitoringPreview: true },   // True A/B·Seamless는 공식 미확인(null)
    features: { hdr: true, tenBit: true, redundancy: true },
    control: { tcp: true },
    verification: { status: 'official', sourceUrl: 'https://en.colorlightinside.com/product/special/2033', sourceVersion: 'U9 Max Specification V1.1 (handoff 2026-09-12 §6)', notes: 'I/O·출력·전역/보드 레이어·Fade·HDR·10bit 공식(V1.1). True A/B·Seamless·Genlock 확인 필요' },
  }),
  proc({
    id: 'cl-universe-u15max',
    manufacturer: CL, family: 'Universe', model: 'Universe U15 Max',
    inputs: { maxIndependent4k: 60, maxIndependent2k: 120, maxInputBoards: 30 },   // 카드당 최대 8K 입력
    outputs: { max4k: 40, max2k: 120, maxOutputBoards: 20 },   // 4K 40 = 출력보드 20 × HDMI2.0 2포트
    layers: { model: 'screen_group', global2k: 320, global4k: 80 },  // per-board 공식 미확인 → null(U6/U9 규칙 자동적용 금지)
    switching: { fade: true, monitoringPreview: true },
    features: { hdr: true, tenBit: true, redundancy: true },
    control: { tcp: true },
    verification: { status: 'partial_official', sourceUrl: 'https://en.colorlightinside.com/product/download///2376', sourceVersion: 'U15 Max Specification V1.0', notes: '입력보드 30·독립 60×4K/120×2K, 출력보드 20·40×4K/120×2K, 전역 80×4K/320×2K 공식. 슬롯 40(입출력 합≠40, 조합 사용). 보드당 레이어 공식 미확인(null)' },
  }),

];

/** id로 프로세서 1개 조회. */
export function getProcessor(id) {
  return PROCESSORS.find(p => p.id === id) ?? null;
}

export default PROCESSORS;
