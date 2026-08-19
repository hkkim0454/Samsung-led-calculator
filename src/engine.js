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

// 예비 캐비닛 규칙: 시리즈별로 다르다.
//   MMF 5% · MPF 7% — 비율(올림). (삼성 configurator export로 검증, 2026-07-27)
//   IFR/IEA — 3×3(=9)대당 1대 (오너 규칙, 2026-08-19). 이전 3% 비율을 대체.
export const SPARE_RATES = Object.freeze({ MM: 0.05, MP: 0.07 });
// 시리즈별 '캐비닛 N대당 예비 1대' 규칙(비율 대신 개수 기준). IFR/IEA = 9대(3×3)당 1대.
export const SPARE_PER_UNIT = Object.freeze({ IF: 9, IE: 9 });
/** 모델 시리즈의 기본 예비율(소수). 미등록 시리즈는 DEFAULTS.spareRate로 대체. */
export function spareRateForSeries(series) {
  return SPARE_RATES[series] ?? DEFAULTS.spareRate;
}
/**
 * 예비 캐비닛 수. 우선순위:
 *   ① opts.spareRate(사용자 지정 비율)가 있으면 ceil(total × 비율)
 *   ② 시리즈가 SPARE_PER_UNIT에 있으면(IFR/IEA) ceil(total / N)  — 3×3당 1대
 *   ③ 그 외(MMF/MPF)는 ceil(total × 시리즈 기본율)
 */
export function spareCount(series, total, opts = {}) {
  if (!(total > 0)) return 0;
  if (opts.spareRate != null) return Math.ceil(total * opts.spareRate - 1e-9);
  const per = SPARE_PER_UNIT[series];
  if (per) return Math.ceil(total / per);
  return Math.ceil(total * spareRateForSeries(series) - 1e-9);
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
  // 예비 캐비닛 — 시리즈 규칙(MMF 5%·MPF 7% 비율, IFR/IEA 3×3당 1대) 또는 사용자 지정 비율(opts.spareRate).
  const spares = spareCount(model.series, total, opts);
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
  // 예비 SBOX: 산출 대수(sbox>0)일 때만. 기본 1대, opts.sboxSpares로 직접 지정(0 이상 정수).
  const sboxSpares = (sbox > 0) ? Math.max(0, Math.floor(opts.sboxSpares ?? 1)) : 0;
  const sboxWithSpares = (sbox != null) ? sbox + sboxSpares : null;
  // 'CS4B(광전송)로 설계' 선택 시 컨트롤러 표시를 SBB-CS4B로 바꾼다(기본은 모델 지정 컨트롤러).
  // 단, 모델 기본 컨트롤러가 이미 CS4B 계열(MMF의 SBB-CS4BPGS 등)이면 그대로 둔다(다운그레이드 방지).
  const cs4b = opts.cs4b ?? false;
  const nativeCS4B = typeof model.sbox === 'string' && model.sbox.includes('CS4B');
  const controller = (cs4b && !nativeCS4B) ? 'SBB-CS4B' : (model.sbox ?? null);
  // 광 지빅(GBIC)은 CS4B 계열 컨트롤러에서만 필요: MMF(기본 SBB-CS4BPGS)는 자동, 그 외 라인은
  // 'CS4B(광전송)' 선택 시. 1920x2160 신호 영역마다 1 SET.
  // Gbic 수량 2배 조건: SBOX 이중화(redundancy) 또는 Gbic 포워드/백워드(gbicFB) 중 하나라도 켜지면 ×2.
  const gbicFB = opts.gbicFB ?? false;
  const usesCS4B = typeof controller === 'string' && controller.includes('CS4B');
  const gbic = usesCS4B ? gbicSets(resW, resH, { redundancy: redundancy || gbicFB }) : null;

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

  // BDM 시청거리(m): %EH 2.5% → 세로×5(권장), %EH 3% → 세로×6(최대).
  const bdm25M = bdmFarViewerM(actualH, 2.5);
  const bdm30M = bdmFarViewerM(actualH, 3);

  return {
    cols, rows, fits, total, spares, totalWithSpares,
    actualW, actualH, areaM2, diagIn, bdm25M, bdm30M,
    resW, resH, pixels,
    res169W, res169H, is169, diag169In,
    weightKg, maxW, typW, heatMaxBTU, heatTypBTU,
    sbox, sboxSpares, sboxWithSpares, gbic, controller, redundancy,
    deadW, deadH,
    marginW: deadW / 2, marginH: deadH / 2, // centered mount
    brightnessPeak: model.brightnessPeak ?? null,
    // "최대"(운영 최대) 밝기. 모델에 reduced 값이 있으면 그 값, 없으면 peak 값을 최대로 사용한다.
    brightnessMax: (model.brightnessReduced ?? model.brightnessPeak) ?? null,
  };
}

/**
 * 원가/견적가 산출 (품목별). 실제 단가(prices)는 인자로만 받는다 — engine.js엔 가격을 하드코딩하지 않는다.
 * prices 구조는 prices.example.js 참고. prices가 없으면(공개 배포 등) null 반환 → UI에서 06 카드 숨김.
 *
 * config: computeConfig() 결과. opts.etc = { cost, sell } 기타자재 수동 입력(선택).
 * 각 라인: { label, qty, unit, unitCost, unitSell, cost, sell, note }. cost/sell는 단가 없으면 null.
 * 반환: { lines, totalCost, totalSell, margin, incomplete }  (incomplete = 단가 미설정 항목 존재)
 */
export function computeQuote(model, config, prices, opts = {}) {
  if (!prices || !config || !config.fits) return null;
  const lines = [];
  const add = (label, qty, unit, uc, us, note) => {
    if (!(qty > 0)) return;
    const cost = uc != null ? qty * uc : null;
    const sell = us != null ? qty * us : null;
    lines.push({ label, qty, unit, unitCost: uc ?? null, unitSell: us ?? null, cost, sell, note: note ?? '' });
  };

  // 1) LED 패널 — 예비 포함 총 캐비닛 수 기준(실제 구매/견적 수량과 일치).
  const p = prices.panels?.[model.id] ?? null;
  add(`LED 패널 · ${model.name}`, config.totalWithSpares, 'EA', p?.cost ?? null, p?.sell ?? null, '예비 포함');

  // 2) S-BOX(컨트롤러) — 산출 대수(이중화 반영) + 예비 SBOX.
  if (config.sbox > 0 && config.controller) {
    const s = prices.sbox?.[config.controller] ?? null;
    const qty = config.sboxWithSpares ?? config.sbox;
    const note = config.sboxSpares > 0 ? `예비 ${config.sboxSpares} 포함` : '';
    add(`S-BOX · ${config.controller}`, qty, 'EA', s?.cost ?? null, s?.sell ?? null, note);
  }

  // 3) Gbic 광모듈 — EA = SET×2 (SBOX측+LED측). CS4B 설계일 때만 config.gbic 존재.
  if (config.gbic > 0 && prices.gbic) {
    add('Gbic 광모듈', config.gbic * 2, 'EA', prices.gbic.cost ?? null, prices.gbic.sell ?? null, 'SET×2');
  }

  // 4) 설치 인건비 — 면적(㎡) × ㎡단가. 고소작업(opts.highWork) 시 할증배수(highWorkMultiplier) 적용.
  //    간접비 산출의 '노무비' 기준으로 쓰기 위해 설치 원가금액을 laborCost로 보관한다.
  let laborCost = 0;
  if (config.areaM2 > 0 && prices.install) {
    const mult = (opts.highWork && prices.install.highWorkMultiplier > 0) ? prices.install.highWorkMultiplier : 1;
    const uc = prices.install.costPerM2 != null ? prices.install.costPerM2 * mult : null;
    const us = prices.install.sellPerM2 != null ? prices.install.sellPerM2 * mult : null;
    add('설치 인건비' + (mult > 1 ? ' · 고소작업' : ''), config.areaM2, '㎡', uc, us, mult > 1 ? `고소 할증 ×${mult}` : '');
    laborCost = uc != null ? config.areaM2 * uc : 0;
  }

  // 5) 기타 자재(프레임·지그·케이블 등) — 수량규칙 미정, 수동 입력 lump.
  const etc = opts.etc;
  if (etc && ((etc.cost ?? 0) > 0 || (etc.sell ?? 0) > 0)) {
    add('기타 자재 (프레임·지그·케이블 등)', 1, '식', etc.cost ?? null, etc.sell ?? null, '수동 입력');
  }

  const sum = k => lines.reduce((a, l) => a + (l[k] ?? 0), 0);
  const directCost = sum('cost'), directSell = sum('sell');

  // 간접비(표준품셈 방식) — 원가 기준(노무비=설치 원가, 직접비=총 원가)으로 산출해 '견적'에만 가산.
  // 요율/항목은 prices.indirect.items 에서 설정(오너 지침 2026-08-19). 없으면 간접비 미적용.
  // opts.indirectDisabled: 화면 체크박스로 끈 항목명 배열(있으면 그것이 포함/제외의 기준).
  const indirect = prices.indirect ? computeIndirect(laborCost, directCost, prices.indirect, opts.indirectDisabled) : null;
  const indirectTotal = indirect?.total ?? 0;

  const totalCost = directCost;                 // 간접비는 견적에만 → 원가 총액 불변
  const totalSell = directSell + indirectTotal; // 견적 = 직접 견적 + 간접비
  const incomplete = lines.some(l => l.unitSell == null || l.unitCost == null);
  return {
    lines, directCost, directSell, indirect,
    totalCost, totalSell,
    margin: totalSell > 0 ? (totalSell - totalCost) / totalSell : 0,
    incomplete,
  };
}

/**
 * 간접비(표준품셈) 산출. base 종류:
 *   'labor'   → 노무비(직접노무비) 대비
 *   'direct'  → 직접비 대비
 *   'special' → (직접비 + 간접노무비 + 산업안전보건관리비) 대비  (공과잡비용)
 * items는 순서대로 계산되며 'special'은 앞서 계산된(그리고 포함된) 간접노무비·산업안전보건관리비 금액을 참조한다.
 * 포함 여부: disabled 배열이 주어지면 그 목록에 없는 항목만 포함(화면 체크박스 기준). 없으면 item.enabled!==false.
 * 제외 항목은 total과 공과잡비 base 계산에서 모두 빠진다.
 * 반환: { lines:[{name,pct,baseKind,base,amount,included}], total }  (cfg 없으면 null)
 */
export function computeIndirect(labor, direct, cfg, disabled) {
  if (!cfg || !Array.isArray(cfg.items) || cfg.items.length === 0) return null;
  const off = disabled != null
    ? new Set(disabled)
    : new Set(cfg.items.filter(i => i.enabled === false).map(i => i.name));
  const by = {};  // 포함된 항목의 금액(공과잡비 base용). 제외 항목은 0.
  const lines = cfg.items.map(it => {
    const included = !off.has(it.name);
    const base = it.base === 'labor' ? labor
      : it.base === 'direct' ? direct
      : it.base === 'special' ? (direct + (by['간접노무비'] || 0) + (by['산업안전보건관리비'] || 0))
      : 0;
    const amount = base * (Number(it.pct) || 0) / 100;
    by[it.name] = included ? amount : 0;
    return { name: it.name, pct: Number(it.pct) || 0, baseKind: it.base, base, amount, included };
  });
  const total = lines.reduce((a, l) => a + (l.included ? l.amount : 0), 0);
  return { lines, total };
}

/**
 * Bill of materials. Spare rule: ceil(total * spareRate). SBOX quantity uses the
 * confirmed rule (see sboxCount) when total pixels are supplied via opts.pixels.
 * Jig quantity rule is still model-specific and undefined — returned as null.
 */
export function bom(model, total, opts = {}) {
  const spares = spareCount(model.series, total, opts);
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
