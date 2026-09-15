// ─────────────────────────────────────────────────────────────────────────────
// 비디오 프로세서 — 용량·요구량 계산 헬퍼 (SoT + plan v2, 2026-09-13)
//
// "숫자 계산"만 한다: LED → 요구사양(processorRequirements), Samsung S-Box topology
// 후보(buildSboxTopologies), 제조사별 출력용량(outputCapacity), 입력용량(inputsCapacity),
// 출력보드/카드 레이어 예산(outputCardUsage2kEq·validateOutputCardLayers), 영역 타일(regionTiles).
// "충족 여부" 종합 판정은 processor-validator.js.
//
// 원칙(SoT §18): 확인되지 않은 사양은 추정하지 않는다. 사양이 null이면 그 검사는 ok=null(확인 필요).
//   null !== false. 절대 혼동 금지: 독립 입력 ≠ 레이어 ≠ 윈도우 ≠ Active 출력 ≠ PGM 출력.
//   COPY/LOOP는 독립 출력으로 세지 않는다(데이터가 독립 출력만 담고 있음).
// ─────────────────────────────────────────────────────────────────────────────

export const TILE_4K_W = 3840, TILE_4K_H = 2160;
export const TILE_2K_W = 1920, TILE_2K_H = 1080;

// engineeringRule(공식 아님, 현장 계산규칙): 레이어 2K 환산 비용. per-board/per-card '공식 용량'이
//   있는 Universe/NovaStar 몰림검사에만 적용. X100 등 공식 per-card 미확인 제품엔 적용 금지.
export const LAYER_COST_2KEQ = Object.freeze({ '2k': 1, 'dl': 2, '4k': 4 });   // engineeringRule
export const CARD_CAPACITY_2KEQ = 16;                                          // engineeringRule (카드 1장 = 16×2K)

// 입력카드 1장 = 4K 1채널 또는 2K 4채널 (X100 Pro 실측, 이사 확인). 카드/슬롯 기반 유도에만 사용.
export const INPUT_2K_PER_CARD = 4;

/** 영역 타일 수 = ceil(resW/tileW) × ceil(resH/tileH). 입력 무효면 null. */
export function regionTiles(resW, resH, tileW, tileH) {
  if (!(resW > 0) || !(resH > 0) || !(tileW > 0) || !(tileH > 0)) return null;
  return Math.ceil(resW / tileW) * Math.ceil(resH / tileH);
}

/**
 * Samsung S-Box topology 후보 생성(SoT §3·§4·§16). 반환: 후보 배열.
 *   후보1 = UHD 중심(기본, ⌈resW/3840⌉×⌈resH/2160⌉).
 *   후보2 = 검증된 FHD 중심(가로 한 줄이 2K 정수배일 때만) — 구조만 열어둠.
 * v1 판정은 후보1(primary)만 사용. "최소 S-Box=최적" 가정은 하지 않는다.
 */
export function buildSboxTopologies(resW, resH) {
  const out = [];
  const t4 = regionTiles(resW, resH, TILE_4K_W, TILE_4K_H);
  const t2 = regionTiles(resW, resH, TILE_2K_W, TILE_2K_H);
  if (t4 != null) out.push({ label: 'UHD 중심', required4kOutputs: t4, required2kOutputs: null, sboxCount: t4, canvasMode: 'independent' });
  // FHD 중심 후보(예: 5760×1080 → 2K 3출력). 세로 1080 단위·가로 1920 정수배일 때만.
  if (resW > 0 && resH > 0 && resH % TILE_2K_H === 0 && resW % TILE_2K_W === 0 && t2 != null && t2 !== t4) {
    out.push({ label: 'FHD 중심', required4kOutputs: null, required2kOutputs: t2, sboxCount: t2, canvasMode: 'independent' });
  }
  return out;
}

/**
 * LED 한 벌 + 사용자 요구 → 프로세서 요구사양(SoT §16). 레이어 요구는 의미별로 분리(지침 4).
 *  - required4kOutputs = 기본 UHD topology(⌈resW/3840⌉×⌈resH/2160⌉). o.required4kOutputs로 덮어쓰기 가능.
 *  - requiredWindows(X100) / requiredMixingLayers·requiredSplitLayers(AW) / required4kLayers·required2kLayers(Universe·NovaStar)
 *    는 raw 입력(simultaneous*Layers)과 플래그로부터 유도하되, o.*로 명시 지정 가능.
 * S-Box 이중화(config.redundancy)는 출력량을 2배로 만들지 않는다(SoT §13).
 */
export function processorRequirements(config, o = {}) {
  const resW = config?.resW, resH = config?.resH;
  const int = (v) => Math.max(0, Math.floor(v ?? 0));
  const topo = buildSboxTopologies(resW, resH);
  const primary = topo[0] ?? null;
  const required4kOutputs = (o.required4kOutputs != null && o.required4kOutputs > 0)
    ? Math.floor(o.required4kOutputs) : (primary?.required4kOutputs ?? null);
  const sim4k = int(o.simultaneous4kLayers), sim2k = int(o.simultaneous2kLayers);
  const trueAB = !!o.trueABRequired;
  return {
    resW: resW ?? null, resH: resH ?? null,
    sboxTopologies: topo, sboxTopology: primary,
    required4kOutputs,
    required2kOutputs: regionTiles(resW, resH, TILE_2K_W, TILE_2K_H),
    // 입력
    independent4kInputs: int(o.independent4kInputs),
    independent2kInputs: int(o.independent2kInputs),
    allowSourceDuplication: o.allowSourceDuplication ?? false,
    // 레이어(의미 분리)
    simultaneous4kLayers: sim4k,
    simultaneous2kLayers: sim2k,
    requiredWindows: o.requiredWindows != null ? int(o.requiredWindows) : (sim4k + sim2k),   // X100
    requiredMixingLayers: o.requiredMixingLayers != null ? int(o.requiredMixingLayers) : (trueAB ? sim4k : 0),   // AW True A/B
    requiredSplitLayers: o.requiredSplitLayers != null ? int(o.requiredSplitLayers) : (trueAB ? 0 : sim4k),      // AW 분할
    required4kLayers: o.required4kLayers != null ? int(o.required4kLayers) : sim4k,   // Universe/NovaStar 전역
    required2kLayers: o.required2kLayers != null ? int(o.required2kLayers) : sim2k,
    maxLayersPerOutput: o.maxLayersPerOutput != null ? int(o.maxLayersPerOutput) : null,
    perOutputCardDemand: o.perOutputCardDemand ?? null,
    // Wide Canvas
    canvasMode: o.canvasMode ?? 'independent',
    requiredCanvasOutputs: o.requiredCanvasOutputs != null ? int(o.requiredCanvasOutputs) : 0,
    // 출력보드 혼용(모델별)
    requiredMixed4k2kOutput: !!o.requiredMixed4k2kOutput,
    // 기능
    seamlessSwitching: !!o.seamlessSwitching,
    fadeRequired: !!o.fadeRequired,
    trueABRequired: trueAB,
    advancedTransitionRequired: !!o.advancedTransitionRequired,
    previewProgramRequired: !!o.previewProgramRequired,
    genlockRequired: !!o.genlockRequired,
    hdrRequired: !!o.hdrRequired,
    tenBitRequired: !!o.tenBitRequired,
    externalControlRequired: !!o.externalControlRequired,
    application: o.application ?? 'other',
    // Operation Fit(제품 단위) 성향 플래그 — 제조사 선호만으로 끝내지 않기 위함(지침 3).
    expansionRequired: !!o.expansionRequired,
    redundancyRequired: !!o.redundancyRequired,
    customizableRequired: !!o.customizableRequired,
    livePremierPreferred: !!o.livePremierPreferred,
    multiWindowPriority: !!o.multiWindowPriority,
    fixedSolutionPreferred: !!o.fixedSolutionPreferred,
    switchingFrequency: o.switchingFrequency ?? null,   // 'low' | 'high' 등(참고용, 점수엔 미반영)
  };
}

/** 한 출력카드/보드에 올라갈 레이어들의 2K 환산 사용량(engineeringRule 4K=4/DL=2/2K=1). */
export function outputCardUsage2kEq(demand = {}) {
  const n = (v) => Math.max(0, Math.floor(v ?? 0));
  return n(demand.layers4k) * LAYER_COST_2KEQ['4k']
       + n(demand.layersDL) * LAYER_COST_2KEQ['dl']
       + n(demand.layers2k) * LAYER_COST_2KEQ['2k'];
}

/**
 * Samsung S-Box 출력 판정에 쓸 "독립 4K 출력 용량"을 제조사별로 산출(지침 1·3·5).
 *   mixing_split(Analog Way): 4K PGM(maxIndependent4kPgm) — Active 아님. null이면 value=null(→CONDITIONAL).
 *   global_window(X100)      : 독립 4K 출력(maxIndependent4kOutputs).
 *   screen_group(Universe)   : 독립 4K 출력(maxIndependent4kOutputs).
 *   per_output_card(NovaStar): 출력카드 수(카드=1×4K, LOOP 제외) → slots.maxOutputBoards. assumed=true.
 * 반환: { value, kind, assumed }.  kind: 'pgm'|'independent'|'card'.
 */
export function outputCapacity(proc) {
  const L = proc?.layers ?? {}, o = proc?.outputs ?? {}, s = proc?.slots ?? {};
  switch (L.model) {
    case 'mixing_split':
      return { value: o.maxIndependent4kPgm ?? null, kind: 'pgm', assumed: false };
    case 'global_window':
    case 'screen_group':
      return { value: o.maxIndependent4kOutputs ?? null, kind: 'independent', assumed: false };
    case 'per_output_card': {
      if (o.maxIndependent4kOutputs != null) return { value: o.maxIndependent4kOutputs, kind: 'independent', assumed: false };
      if (s.maxOutputBoards != null) return { value: s.maxOutputBoards, kind: 'card', assumed: true };   // 카드 1장=1×4K
      return { value: null, kind: 'card', assumed: false };
    }
    default:
      return { value: o.maxIndependent4kOutputs ?? null, kind: 'independent', assumed: false };
  }
}

/**
 * 슬롯·카드 구성 계산(SoT: 슬롯≠채널, 미상=null). 순수 함수 — 표시는 app.js.
 *   입력/출력 카드당 4K 채널(proc.cards)과 사용자 요구(req)로 필요 카드 수·남는 슬롯을 산출한다.
 *   - reqInCards = ceil(필요 독립4K입력 / 입력카드당채널), reqOutCards = ceil(필요 4K출력 / 출력카드당채널).
 *   - 카드당 채널이 미상(null)이면 해당 필요 카드 수 = null(추정 금지).
 *   - 요구량이 0이면 필요 카드 = 0.
 *   - 남는 슬롯 = 전체 슬롯 − 필요 카드 (전체 슬롯을 아는 제품만; 아니면 null).
 *   - cardBased=false(고정형: Midra·Zenith 등 카드/슬롯 개념 없음)면 카드 계산을 하지 않는다.
 * 반환: { cardBased, inPerCard, outPerCard, needIn, needOut, reqInCards, reqOutCards,
 *         inSlots, outSlots, remInSlots, remOutSlots }.
 */
export function cardPlan(proc, req) {
  const c = proc?.cards ?? {}, s = proc?.slots ?? {};
  const inPer = c.in4kPerCard ?? null;
  const outPer = c.out4kPerCard ?? null;
  const inSlots = s.maxInputBoards ?? null;
  const outSlots = s.maxOutputBoards ?? null;
  const cardBased = inPer != null || outPer != null || inSlots != null || outSlots != null;
  if (!cardBased) {
    return { cardBased: false, inPerCard: null, outPerCard: null, needIn: null, needOut: null,
      reqInCards: null, reqOutCards: null, inSlots: null, outSlots: null, remInSlots: null, remOutSlots: null };
  }
  const needIn = Math.max(0, Math.floor(req?.independent4kInputs ?? 0));
  const needOut = Math.max(0, Math.floor(req?.required4kOutputs ?? 0));
  const cards = (need, per) => {
    if (need <= 0) return 0;              // 요구 없음 → 0장
    if (per == null || per <= 0) return null;  // 카드당 채널 미상 → 미상
    return Math.ceil(need / per);
  };
  const reqInCards = cards(needIn, inPer);
  const reqOutCards = cards(needOut, outPer);
  const rem = (slots, used) => (slots != null && used != null) ? slots - used : null;
  // 최대 구성 가능한 4K 채널: 공식 독립4K 수 우선, 없으면 슬롯수×카드당채널로 유도(미상이면 null).
  const io = proc?.inputs ?? {}, oo = proc?.outputs ?? {};
  const maxIn4k = io.maxIndependent4k ?? ((inSlots != null && inPer != null) ? inSlots * inPer : null);
  const maxOut4k = oo.maxIndependent4kOutputs ?? ((outSlots != null && outPer != null) ? outSlots * outPer : null);
  return {
    cardBased: true, inPerCard: inPer, outPerCard: outPer, needIn, needOut,
    reqInCards, reqOutCards, inSlots, outSlots,
    remInSlots: rem(inSlots, reqInCards), remOutSlots: rem(outSlots, reqOutCards),
    maxIn4k, maxOut4k,
  };
}

/** 독립 2K 출력 용량(FHD 중심 S-Box topology 판정용). 데이터 없으면 null(→확인 필요). */
export function outputCapacity2k(proc) {
  const o = proc?.outputs ?? {};
  return { value: o.maxIndependent2k ?? null, kind: '2k', assumed: false };
}

/**
 * 독립 입력 용량. 공식 maxIndependent4k/2k 우선. 없고 입력슬롯(slots.maxInputBoards)이 있으면
 * '슬롯 1개 = 4K 1 또는 2K 4' 가정으로 유도(NovaStar 등). 반환:{max4k,max2k,slots,assumed4k,assumed2k}.
 */
export function inputsCapacity(proc) {
  const i = proc?.inputs ?? {}, s = proc?.slots ?? {};
  const slots = s.maxInputBoards ?? null;
  let max4k = i.maxIndependent4k ?? null, assumed4k = false;
  let max2k = i.maxIndependent2k ?? null, assumed2k = false;
  if (max4k == null && slots != null) { max4k = slots; assumed4k = true; }
  if (max2k == null && slots != null) { max2k = slots * INPUT_2K_PER_CARD; assumed2k = true; }
  return { max4k, max2k, slots, assumed4k, assumed2k };
}

/**
 * 출력카드/출력보드별 레이어 한계 검사(NovaStar per_output_card, Universe screen_group).
 *   1) req.perOutputCardDemand(카드별 배치)가 있으면 각 카드 2K환산 ≤ 카드예산 && 카드수 ≤ 출력보드수.
 *   2) req.maxLayersPerOutput(한 카드 4K 레이어 수)가 있으면 카드당 4K 용량과 비교.
 *   3) 배치 정보 없으면 이론적 분산 가능성만(정밀판정은 배치 입력 필요). per-board/카드 미확인이면 ok=null.
 * per-card/per-board 공식 용량이 없으면(X100 등) 이 검사는 호출되지 않음(모델이 per_output_card/screen_group 아님).
 */
export function validateOutputCardLayers(proc, req) {
  const L = proc?.layers ?? {};
  if (L.model !== 'per_output_card' && L.model !== 'screen_group') return null;
  const cap2k = L.perOutputCard2k ?? L.perBoard2k ?? null;
  const per4k = L.perOutputCard4k ?? L.perBoard4k ?? null;
  const boards = proc?.slots?.maxOutputBoards ?? null;

  if (req.perOutputCardDemand != null) {
    const cards = Array.isArray(req.perOutputCardDemand) ? req.perOutputCardDemand : [req.perOutputCardDemand];
    const maxUsage = cards.reduce((mx, c) => Math.max(mx, outputCardUsage2kEq(c)), 0);
    if (cap2k == null) return { name: '출력카드별 레이어(2K환산)', need: maxUsage, have: null, unit: '', ok: null };
    const okCap = cap2k >= maxUsage;
    const okCount = boards == null ? true : boards >= cards.length;
    return { name: '출력카드별 레이어(2K환산)', need: maxUsage, have: cap2k, unit: '', ok: okCap && okCount };
  }
  if (req.maxLayersPerOutput != null) {
    if (per4k == null) return { name: '출력카드별 4K 레이어', need: req.maxLayersPerOutput, have: null, unit: '개', ok: null };
    return { name: '출력카드별 4K 레이어', need: req.maxLayersPerOutput, have: per4k, unit: '개', ok: per4k >= req.maxLayersPerOutput };
  }
  if (req.required4kLayers > 0 || req.required2kLayers > 0) {
    if (per4k == null || boards == null)
      return { name: '카드/보드별 배치', need: '확인 필요', have: '—', unit: '', ok: null, note: 'per-board/카드 사양 미확인' };
    if (req.required4kLayers > per4k * boards) return null;   // 총량 초과 → 전역 검사가 FAIL로 잡음
    return { name: '카드/보드별 배치', need: '—', have: '이론상 가능', unit: '', ok: true, note: '실제 카드/보드 배치에 따라 달라질 수 있음(정밀 판정은 배치 입력 필요)' };
  }
  return null;
}
