// engine.js — LED Wall Configurator calculation engine (pure functions).
// No DOM, no side effects. Importable from both browser (ESM) and Node (--test).
// All formulas verified against Samsung official configurator (MP012F, 2026-07-23).

export const WATT_TO_BTU = 3.412142;   // W -> BTU/hr
export const MM_PER_INCH = 25.4;
export const RATIO_169 = 16 / 9;

/** Largest 16:9 resolution (in whole pixels) that fits inside w x h. */
export function fit169(w, h) {
  if (!(w > 0) || !(h > 0)) return { w: 0, h: 0 };
  return (w / h >= RATIO_169)
    ? { w: Math.round(h * RATIO_169), h }   // wider than 16:9 -> height-limited
    : { w, h: Math.round(w / RATIO_169) };  // taller than 16:9 -> width-limited
}

export const DEFAULTS = Object.freeze({
  powerFactor: 0.527,  // typical = max * powerFactor (Samsung MP012F: 3234/6132 = 0.5274)
  spareRate: 0.10,     // spare cabinets ~10% of installed, rounded up (RULE PENDING — see SPEC Q "BOM")
  edgeClearanceMm: 0,  // per-edge clearance subtracted before fill (VERTICAL FILL RULE PENDING — see SPEC Q1)
});

/** Resolution per cabinet: explicit if provided, else derived from size / pitch. */
export function cabinetResolution(model) {
  const resW = model.resW ?? Math.round(model.cabW / model.pitch);
  const resH = model.resH ?? Math.round(model.cabH / model.pitch);
  return { resW, resH };
}

/**
 * S-Box (controller) count by width/height region tiling:
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

  // Largest 16:9 resolution that fits inside the panel's output resolution.
  // For a super-wide wall (wider than 16:9) the full height is used and the width is
  // limited to height*16/9; for a taller-than-16:9 wall the width is the limit.
  const { w: res169W, h: res169H } = fit169(resW, resH);
  const is169 = resH > 0 && Math.abs(resW / resH - RATIO_169) < 0.001;

  const deadW = Math.max(0, spaceW - actualW);
  const deadH = Math.max(0, spaceH - actualH);

  return {
    cols, rows, fits, total,
    actualW, actualH, areaM2, diagIn,
    resW, resH, pixels,
    res169W, res169H, is169,
    weightKg, maxW, typW, heatMaxBTU, heatTypBTU,
    sbox, redundancy,
    deadW, deadH,
    marginW: deadW / 2, marginH: deadH / 2, // centered mount
    brightnessPeak: model.brightnessPeak ?? null,
    // "최대"(운영 최대) 밝기. 모델에 reduced 값이 있으면 그 값, 없으면 peak 값을 최대로 사용한다.
    brightnessMax: (model.brightnessReduced ?? model.brightnessPeak) ?? null,
  };
}

/**
 * Bill of materials. Spare rule: ceil(total * spareRate). S-Box quantity uses the
 * confirmed rule (see sboxCount) when total pixels are supplied via opts.pixels.
 * Jig quantity rule is still model-specific and undefined — returned as null.
 */
export function bom(model, total, opts = {}) {
  const spareRate = opts.spareRate ?? DEFAULTS.spareRate;
  const spares = total > 0 ? Math.ceil(total * spareRate) : 0;
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
