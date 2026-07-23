// engine.js — LED Wall Configurator calculation engine (pure functions).
// No DOM, no side effects. Importable from both browser (ESM) and Node (--test).
// All formulas verified against Samsung official configurator (MP012F, 2026-07-23).

export const WATT_TO_BTU = 3.412142;   // W -> BTU/hr
export const MM_PER_INCH = 25.4;

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
 * S-Box (controller) count = ceil(totalPixels / controller max-input pixels).
 * Redundancy doubles it. Integrated-controller models need none (return 0).
 * If the controller's max input capacity is unknown, return null (no fake numbers).
 * Rule verified against Samsung: MP012F 42 cabinets (4480x2160) -> 2 units (SBB-CS4BPGS, 3840x2160).
 */
export function sboxCount(model, totalPixels, opts = {}) {
  if (model.integratedController) return 0;
  const capW = model.maxInputW, capH = model.maxInputH;
  if (capW == null || capH == null || !(totalPixels > 0)) return null;
  const base = Math.max(1, Math.ceil(totalPixels / (capW * capH)));
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
  const sbox = sboxCount(model, pixels, { redundancy });

  const deadW = Math.max(0, spaceW - actualW);
  const deadH = Math.max(0, spaceH - actualH);

  return {
    cols, rows, fits, total,
    actualW, actualH, areaM2, diagIn,
    resW, resH, pixels,
    weightKg, maxW, typW, heatMaxBTU, heatTypBTU,
    sbox, redundancy,
    deadW, deadH,
    marginW: deadW / 2, marginH: deadH / 2, // centered mount
    brightnessPeak: model.brightnessPeak ?? null,
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
  const sboxQty = opts.pixels != null ? sboxCount(model, opts.pixels, opts) : null;
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
