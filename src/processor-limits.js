// ─────────────────────────────────────────────────────────────────────────────
// 비디오 프로세서 — 용량·한계 계산 헬퍼 (DEC-030, 코드 3분할 2026-09-12)
//
// 이 파일은 "숫자를 계산"만 한다: LED 한 벌 → 요구사양 변환(processorRequirements),
// 입력/출력 용량 산출(inputsCapacity·outputs4kCapacity), 출력카드 레이어 예산 검사
// (outputCardUsage2kEq·validateOutputCardLayers), 영역 타일 수(regionTiles).
// 제품이 요구를 "충족하는지"의 종합 판정은 processor-validator.js에서 한다.
//
// 데이터 신뢰성 원칙(SOURCE-OF-TRUTH.md, CLAUDE.md 규칙 2): 확인되지 않은 사양은 추정하지 않는다.
//   사양이 null이면 그 검사는 ok=null(확인 필요)로 둔다. null을 임의로 PASS로 만들지 않는다.
// 절대 혼동 금지: 독립 입력 ≠ 레이어 ≠ 윈도우 ≠ 출력. 각각 별도로 산출한다.
// ─────────────────────────────────────────────────────────────────────────────

/** 표준 신호 타일 크기(px). 4K=3840x2160, 2K/FHD=1920x1080. */
export const TILE_4K_W = 3840, TILE_4K_H = 2160;
export const TILE_2K_W = 1920, TILE_2K_H = 1080;

/** 영역 타일 수 = ceil(resW/tileW) × ceil(resH/tileH). 입력이 유효하지 않으면 null. */
export function regionTiles(resW, resH, tileW, tileH) {
  if (!(resW > 0) || !(resH > 0) || !(tileW > 0) || !(tileH > 0)) return null;
  return Math.ceil(resW / tileW) * Math.ceil(resH / tileH);
}

/**
 * LED 한 벌 + 사용자 요구를 프로세서 요구사양으로 변환한다(문서 §10 ProcessorRequirement).
 * config: computeConfig() 결과(resW/resH 사용).
 *  - required4kOutputs = ceil(resW/3840) × ceil(resH/2160)   (오너 확정 공식)
 *  - required2kOutputs = ceil(resW/1920) × ceil(resH/1080)
 * SBOX 이중화(config.redundancy)는 신호 경로 이중화일 뿐 프로세서 출력량을 2배로 만들지 않는다 → 반영 안 함(문서 §13).
 * o: 사용자 입력(입력 소스 수·레이어 수·필요 기능·운용 환경 등). 값이 없으면 0/false/other.
 */
export function processorRequirements(config, o = {}) {
  const resW = config?.resW, resH = config?.resH;
  const int = (v) => Math.max(0, Math.floor(v ?? 0));
  // 필요 4K 출력 수: 기본은 자동(⌈resW/3840⌉×⌈resH/2160⌉). o.required4kOutputs가 있으면 사용자 지정값으로 덮어씀.
  const required4kOutputs = (o.required4kOutputs != null && o.required4kOutputs > 0)
    ? Math.floor(o.required4kOutputs) : regionTiles(resW, resH, TILE_4K_W, TILE_4K_H);
  return {
    resW: resW ?? null, resH: resH ?? null,
    required4kOutputs,
    required2kOutputs: regionTiles(resW, resH, TILE_2K_W, TILE_2K_H),
    independent4kInputs: int(o.independent4kInputs),
    independent2kInputs: int(o.independent2kInputs),
    simultaneous4kLayers: int(o.simultaneous4kLayers),
    simultaneous2kLayers: int(o.simultaneous2kLayers),
    // 한 출력(카드/보드)에 올라갈 최대 레이어 수(선택). 모르면 null → 카드별 검사는 '확인 필요'.
    maxLayersPerOutput: o.maxLayersPerOutput != null ? int(o.maxLayersPerOutput) : null,
    // 한 출력카드에 몰리는 레이어 배치(선택): {layers4k,layersDL,layers2k}. 있으면 2K 환산으로 카드 예산 검사.
    perOutputCardDemand: o.perOutputCardDemand ?? null,
    allowSourceDuplication: o.allowSourceDuplication ?? false,  // 기본 꺼짐(문서 §4)
    seamlessSwitching: !!o.seamlessSwitching,
    fadeRequired: !!o.fadeRequired,
    trueABRequired: !!o.trueABRequired,
    advancedTransitionRequired: !!o.advancedTransitionRequired,
    previewProgramRequired: !!o.previewProgramRequired,
    genlockRequired: !!o.genlockRequired,
    hdrRequired: !!o.hdrRequired,
    tenBitRequired: !!o.tenBitRequired,
    externalControlRequired: !!o.externalControlRequired,
    application: o.application ?? 'other',
  };
}

// 출력카드 레이어 비용(2K 환산): 4K=4, DL(듀얼링크)=2, 2K=1. 카드 1장 용량은 2K 16개 분량.
// (NovaStar H 공식: 1 output card = 16×2K = 8×DL = 4×4K, 컨텍스트 문서 §4.)
export const LAYER_COST_2KEQ = Object.freeze({ '2k': 1, 'dl': 2, '4k': 4 });

/** 한 출력카드에 올라갈 레이어들의 2K 환산 사용량 = 4×(4K수) + 2×(DL수) + 1×(2K수). */
export function outputCardUsage2kEq(demand = {}) {
  const n = (v) => Math.max(0, Math.floor(v ?? 0));
  return n(demand.layers4k) * LAYER_COST_2KEQ['4k']
       + n(demand.layersDL) * LAYER_COST_2KEQ['dl']
       + n(demand.layers2k) * LAYER_COST_2KEQ['2k'];
}

/**
 * 출력카드/출력보드별 레이어 한계 검사(NovaStar per_output_card, Universe screen_group).
 * 카드 1장 용량(2K 16개 분량)을 기준으로, 한 카드에 몰리는 레이어가 예산을 넘는지 본다(문서 §19·§21).
 * 우선순위:
 *   1) req.perOutputCardDemand — 카드별 레이어 배치. {layers4k,layersDL,layers2k} 하나 또는 배열.
 *      각 카드의 2K 환산 사용량이 카드 예산 이하이고, 사용 카드 수가 출력카드 수 이하이면 PASS.
 *      (한 레이어가 카드 경계에 걸치면 양쪽 카드 배열에 각각 넣으면 됨 — cross-output, 문서 §19.)
 *   2) req.maxLayersPerOutput(한 카드 4K 레이어 수)가 있으면 카드당 4K 용량과 비교.
 *   3) 배치 정보가 없으면: 이론상 분산 가능성만 본다(정밀 판정은 배치 입력 필요, 문서 §21).
 *      per-board/카드 사양이 없으면 ok=null(확인 필요).
 * 반환: 검사 객체 { name, need, have, unit, ok, note? } 또는 해당 없으면 null.
 */
export function validateOutputCardLayers(proc, req) {
  const L = proc?.layers ?? {};
  if (L.model !== 'per_output_card' && L.model !== 'screen_group') return null;
  const cap2k = L.perOutputCard2k ?? L.perBoard2k ?? null;   // 카드 1장 2K 용량(예: 16)
  const per4k = L.perOutputCard4k ?? L.perBoard4k ?? null;   // 카드 1장 4K 용량(예: 4)
  const boards = proc?.outputs?.maxOutputBoards ?? null;      // 출력카드/보드 수

  // 1) 상세 레이어 배치(2K 환산). 카드별로 몰린 레이어를 각각 검사(경계 걸침은 여러 카드에 중복 배치).
  if (req.perOutputCardDemand != null) {
    const cards = Array.isArray(req.perOutputCardDemand) ? req.perOutputCardDemand : [req.perOutputCardDemand];
    const maxUsage = cards.reduce((mx, c) => Math.max(mx, outputCardUsage2kEq(c)), 0);
    if (cap2k == null) return { name: '출력카드별 레이어(2K환산)', need: maxUsage, have: null, unit: '', ok: null };
    const okCap = cap2k >= maxUsage;
    const okCount = boards == null ? true : boards >= cards.length;
    return { name: '출력카드별 레이어(2K환산)', need: maxUsage, have: cap2k, unit: '', ok: okCap && okCount };
  }

  // 2) 한 카드 4K 레이어 수만 지정된 경우.
  if (req.maxLayersPerOutput != null) {
    if (per4k == null) return { name: '출력카드별 4K 레이어', need: req.maxLayersPerOutput, have: null, unit: '개', ok: null };
    return { name: '출력카드별 4K 레이어', need: req.maxLayersPerOutput, have: per4k, unit: '개', ok: per4k >= req.maxLayersPerOutput };
  }

  // 3) 배치 정보 없음 — 이론적 분산 가능성만. (전체 총량 초과는 전역 레이어 검사가 FAIL로 잡음.)
  if (req.simultaneous4kLayers > 0 || req.simultaneous2kLayers > 0) {
    if (per4k == null || boards == null)
      return { name: '카드/보드별 배치', need: '확인 필요', have: '—', unit: '', ok: null, note: 'per-board/카드 사양 미확인' };
    if (req.simultaneous4kLayers > per4k * boards) return null;   // 총량 초과 → 전역 검사에서 FAIL
    return { name: '카드/보드별 배치', need: '—', have: '이론상 가능', unit: '', ok: true, note: '실제 카드/보드 배치에 따라 달라질 수 있음(정밀 판정은 배치 입력 필요)' };
  }
  return null;
}

/**
 * 4K 출력 커버리지(HDMI 2.0 4K@60 포트 수 기준).
 * 공식 outputs.max4k가 있으면 그대로. 없고 per_output_card/screen_group이면
 * **"출력카드는 모두 HDMI 2.0을 쓴다" 가정**으로 카드당 4K(perOutputCard4k/perBoard4k) × 출력보드 수로 추정
 * (이사 지침 2026-09-12). 유도값은 assumed=true로 표시. 근거 없으면 value=null(확인 필요).
 * 반환: { value, assumed }.
 */
export function outputs4kCapacity(proc) {
  const o = proc?.outputs ?? {};
  if (o.max4k != null) return { value: o.max4k, assumed: false };
  const L = proc?.layers ?? {};
  if (L.model === 'per_output_card' || L.model === 'screen_group') {
    const per4k = L.perOutputCard4k ?? L.perBoard4k ?? null;
    if (per4k != null && o.maxOutputBoards != null) return { value: per4k * o.maxOutputBoards, assumed: true };
  }
  return { value: null, assumed: false };
}

// 입력카드 1장 = 4K 1채널 또는 2K 4채널 (X100 Pro 실측과 일치, 이사 확인 2026-09-12).
export const INPUT_2K_PER_CARD = 4;

/**
 * 독립 입력 용량(HDMI 2.0/카드 기준). 공식 maxIndependent4k/2k가 있으면 그대로(X100 Pro),
 * 없고 입력슬롯(maxInputBoards)이 있으면 "슬롯 1개 = 4K 1개 또는 2K 4개" 가정으로 유도
 * (max4k=슬롯, max2k=슬롯×4). 4K/2K는 슬롯을 공유하므로 실제 판정은 validateProcessor의 '입력 슬롯' 검사.
 * 반환: { max4k, max2k, slots, assumed4k, assumed2k }.
 */
export function inputsCapacity(proc) {
  const i = proc?.inputs ?? {};
  const slots = i.maxInputBoards ?? null;
  let max4k = i.maxIndependent4k ?? null, assumed4k = false;
  let max2k = i.maxIndependent2k ?? null, assumed2k = false;
  if (max4k == null && slots != null) { max4k = slots; assumed4k = true; }
  if (max2k == null && slots != null) { max2k = slots * INPUT_2K_PER_CARD; assumed2k = true; }
  return { max4k, max2k, slots, assumed4k, assumed2k };
}
