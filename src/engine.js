// engine.js — LED Wall Configurator calculation engine (pure functions).
// No DOM, no side effects. Importable from both browser (ESM) and Node (--test).
// All formulas verified against Samsung official configurator (MP012F, 2026-07-23).

export const WATT_TO_BTU = 3.412142;   // W -> BTU/hr
export const MM_PER_INCH = 25.4;
export const RATIO_169 = 16 / 9;

/**
 * BDM 기준 최대 시청거리(m). 화면 세로(IH, Image Height)를 기준으로, 표시할 객체(글자)가
 * 화면 세로의 %EH를 차지할 때 가독 한계가 되는 가장 먼 시청자(FV) 거리.
 *   FV = IH × 200 × (%EH/100) = IH × 2 × %EH   → %EH 2.5%면 FV = IH × 5.
 * imageHeightMm: 화면 세로(mm), ehPercent: %EH(퍼센트). 유효하지 않으면 0.
 */
export function bdmFarViewerM(imageHeightMm, ehPercent) {
  if (!(imageHeightMm > 0) || !(ehPercent > 0)) return 0;
  return (imageHeightMm / 1000) * 2 * ehPercent;
}

/** Largest 16:9 resolution (in whole pixels) that fits inside w x h. */
export function fit169(w, h) {
  if (!(w > 0) || !(h > 0)) return { w: 0, h: 0 };
  return (w / h >= RATIO_169)
    ? { w: Math.round(h * RATIO_169), h }   // wider than 16:9 -> height-limited
    : { w, h: Math.round(w / RATIO_169) };  // taller than 16:9 -> width-limited
}

export const DEFAULTS = Object.freeze({
  powerFactor: 0.527,  // typical = max * powerFactor (Samsung MP012F: 3234/6132 = 0.5274)
  spareRate: 0.05,     // fallback spare rate when a series has no entry (see SPARE_RATES)
  edgeClearanceMm: 0,  // per-edge clearance subtracted before fill (VERTICAL FILL RULE PENDING — see SPEC Q1)
});

// 예비 캐비닛 비율: 시리즈별로 다르다 (삼성 공식 configurator export로 검증, 2026-07-27).
//   IFR/IEA 3% · MMF 5% · MPF 7% — 모두 올림(ceil). 22개 배열 구성에서 예비 수량 정확히 일치.
export const SPARE_RATES = Object.freeze({ IF: 0.03, IE: 0.03, MM: 0.05, MP: 0.07 });
/** 모델 시리즈의 기본 예비율(소수). 미등록 시리즈는 DEFAULTS.spareRate로 대체. */
export function spareRateForSeries(series) {
  return SPARE_RATES[series] ?? DEFAULTS.spareRate;
}

/** Resolution per cabinet: explicit if provided, else derived from size / pitch. */
export function cabinetResolution(model) {
  const resW = model.resW ?? Math.round(model.cabW / model.pitch);
  const resH = model.resH ?? Math.round(model.cabH / model.pitch);
  return { resW, resH };
}

/**
 * SBOX (controller) count by width/height region tiling:
 *   ceil(resW / capW) * ceil(resH / capH)
 * where cap is one box's max output resolution. Redundancy doubles it.
 * Integrated-controller models need none (return 0). Unknown capacity -> null (no fake numbers).
 * Rule confirmed by owner + datasheet (SBB-CS4B = model code SBB-CS4BPGS, and SBB-SNOWAAE
 * limited to 4K): both boxes cap at 3840x2160. Verified vs Samsung: MP012F 42 cabinets
 * (4480x2160) -> ceil(4480/3840)*ceil(2160/2160) = 2 units.
 */
export function sboxCount(model, resW, resH, opts = {}) {
  if (model.integratedController) return 0;
  const capW = model.maxInputW, capH = model.maxInputH;
  if (capW == null || capH == null || !(resW > 0) || !(resH > 0)) return null;
  const base = Math.ceil(resW / capW) * Math.ceil(resH / capH);
  return opts.redundancy ? base * 2 : base;
}

// 광 지빅(GBIC, 광 컨버터) 신호 영역 단위: SBB-CS4B는 1920x2160 영역마다 1 SET 필요.
export const GBIC_REGION_W = 1920, GBIC_REGION_H = 2160;

/**
 * 광 지빅(GBIC) SET 수량. SBB-CS4B로 설계할 때만 사용:
 * 1920x2160 신호 영역마다 1 SET(SBOX측 1개 + LED측 1개 = 2개)이 필요하다.
 *   SET 수 = ceil(resW/1920) * ceil(resH/2160)
 * SBOX 이중화 시 신호 경로도 2배가 되므로 ×2. 해상도를 알 수 없으면 null(해당 없음).
 * (실제 부품: Exatek EXA-40G-QSFP-LR4 등 40G QSFP 싱글모드 광모듈.)
 */
export function gbicSets(resW, resH, opts = {}) {
  if (!(resW > 0) || !(resH > 0)) return null;
  const base = Math.ceil(resW / GBIC_REGION_W) * Math.ceil(resH / GBIC_REGION_H);
  return opts.redundancy ? base * 2 : base;
}

/**
 * Decide how many cabinets fit.
 * mode 'fill'   -> floor((space - 2*clearance) / cabinet) on each axis (pure max-fill)
 * mode 'manual' -> caller-supplied cols/rows
 * NOTE: Samsung "Fit to wall" was observed to be more conservative vertically than pure floor.
 *       Until that rule is confirmed (SPEC Q1), 'fill' uses pure floor; adjust edgeClearanceMm to approximate.
 */
export function fitCabinets(model, spaceW, spaceH, opts = {}) {
  const mode = opts.mode ?? 'fill';
  const clr = opts.edgeClearanceMm ?? DEFAULTS.edgeClearanceMm;
  let cols, rows;
  if (mode === 'manual') {
    cols = Math.max(0, Math.floor(opts.cols ?? 0));
    rows = Math.max(0, Math.floor(opts.rows ?? 0));
  } else {
    cols = Math.max(0, Math.floor((spaceW - 2 * clr) / model.cabW));
    rows = Math.max(0, Math.floor((spaceH - 2 * clr) / model.cabH));
  }
  return { cols, rows, fits: cols >= 1 && rows >= 1 };
}

/** Full spec readout for a given model + space + options. */
export function computeConfig(model, spaceW, spaceH, opts = {}) {
  const pf = opts.powerFactor ?? DEFAULTS.powerFactor;
  const { cols, rows, fits } = fitCabinets(model, spaceW, spaceH, opts);
  const total = cols * rows;
  // 예비 캐비닛 = 설치 수량 × 시리즈별 예비율, 무조건 올림 (삼성 export 검증 2026-07-27).
  // opts.spareRate가 주어지면(사용자 입력) 그 값을, 없으면 시리즈 기본율을 쓴다.
  const spareRate = opts.spareRate ?? spareRateForSeries(model.series);
  const spares = total > 0 ? Math.ceil(total * spareRate - 1e-9) : 0;
  const totalWithSpares = total + spares;
  const { resW: cRW, resH: cRH } = cabinetResolution(model);

  const actualW = cols * model.cabW;         // mm
  const actualH = rows * model.cabH;         // mm
  const areaM2  = (actualW / 1000) * (actualH / 1000);
  const diagIn  = Math.sqrt(actualW ** 2 + actualH ** 2) / MM_PER_INCH;
  const resW = cols * cRW, resH = rows * cRH, pixels = resW * resH;

  const hasWeight = model.weight != null;
  const hasPower  = model.maxPower != null;
  const weightKg  = hasWeight ? total * model.weight : null;
  const maxW      = hasPower ? total * model.maxPower : null;
  // Prefer a per-model measured typical power; otherwise derive from the global power factor.
  const typW      = model.typicalPower != null ? total * model.typicalPower
                    : (hasPower ? maxW * pf : null);
  const heatMaxBTU = maxW != null ? maxW * WATT_TO_BTU : null;
  const heatTypBTU = typW != null ? typW * WATT_TO_BTU : null;

  const redundancy = opts.redundancy ?? false;
  const sbox = sboxCount(model, resW, resH, { redundancy });
  // 'CS4B(광전송)로 설계' 선택 시 컨트롤러 표시를 SBB-CS4B로 바꾼다(기본은 모델 지정 컨트롤러).
  // 단, 모델 기본 컨트롤러가 이미 CS4B 계열(MMF의 SBB-CS4BPGS 등)이면 그대로 둔다(다운그레이드 방지).
  const cs4b = opts.cs4b ?? false;
  const nativeCS4B = typeof model.sbox === 'string' && model.sbox.includes('CS4B');
  const controller = (cs4b && !nativeCS4B) ? 'SBB-CS4B' : (model.sbox ?? null);
  // 광 지빅(GBIC)은 CS4B 계열 컨트롤러에서만 필요: MMF(기본 SBB-CS4BPGS)는 자동, 그 외 라인은
  // 'CS4B(광전송)' 선택 시. 1920x2160 신호 영역마다 1 SET(이중화 시 x2).
  const usesCS4B = typeof controller === 'string' && controller.includes('CS4B');
  const gbic = usesCS4B ? gbicSets(resW, resH, { redundancy }) : null;

  // Largest 16:9 resolution that fits inside the panel's output resolution.
  // For a super-wide wall (wider than 16:9) the full height is used and the width is
  // limited to height*16/9; for a taller-than-16:9 wall the width is the limit.
  const { w: res169W, h: res169H } = fit169(resW, resH);
  const is169 = resH > 0 && Math.abs(resW / resH - RATIO_169) < 0.001;
  // 16:9 최대 영역의 물리 대각(인치): 해당 픽셀 영역 × 픽셀피치 기준.
  const diag169In = (res169W > 0 && res169H > 0)
    ? Math.sqrt((res169W * model.pitch) ** 2 + (res169H * model.pitch) ** 2) / MM_PER_INCH
    : 0;

  const deadW = Math.max(0, spaceW - actualW);
  const deadH = Math.max(0, spaceH - actualH);

  // BDM 최대 시청거리(m): %EH 2.5% 기준 → 화면 세로 × 5.
  const bdm25M = bdmFarViewerM(actualH, 2.5);

  return {
    cols, rows, fits, total, spares, totalWithSpares,
    actualW, actualH, areaM2, diagIn, bdm25M,
    resW, resH, pixels,
    res169W, res169H, is169, diag169In,
    weightKg, maxW, typW, heatMaxBTU, heatTypBTU,
    sbox, gbic, controller, redundancy,
    deadW, deadH,
    marginW: deadW / 2, marginH: deadH / 2, // centered mount
    brightnessPeak: model.brightnessPeak ?? null,
    // "최대"(운영 최대) 밝기. 모델에 reduced 값이 있으면 그 값, 없으면 peak 값을 최대로 사용한다.
    brightnessMax: (model.brightnessReduced ?? model.brightnessPeak) ?? null,
  };
}

/**
 * Bill of materials. Spare rule: ceil(total * spareRate). SBOX quantity uses the
 * confirmed rule (see sboxCount) when total pixels are supplied via opts.pixels.
 * Jig quantity rule is still model-specific and undefined — returned as null.
 */
export function bom(model, total, opts = {}) {
  const spareRate = opts.spareRate ?? spareRateForSeries(model.series);
  const spares = total > 0 ? Math.ceil(total * spareRate - 1e-9) : 0;
  const sboxQty = (opts.resW != null && opts.resH != null) ? sboxCount(model, opts.resW, opts.resH, opts) : null;
  return {
    cabinetPart: model.cabinetPart ?? null,
    cabinets: total,
    spares,
    totalCabinets: total + spares,
    sbox: model.sbox ?? null,
    sboxQty,
    jitQty: null,    // TODO(SPEC:BOM): define Jig count rule
  };
}
