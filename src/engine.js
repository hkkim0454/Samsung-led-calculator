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

// 예비 캐비닛 비율(시리즈별, 올림): IFR·IEA·MMF 5% · MPF 7% (오너 지침 2026-08-19, IFR/IEA 5%로 재조정).
export const SPARE_RATES = Object.freeze({ IF: 0.05, IFM: 0.05, IE: 0.05, MM: 0.05, MP: 0.07 });

// LED 구조틀 여백(좌우상하 각 변, mm): IFR·IFR-M·IEA 30mm · MMF·MPF 50mm (오너 확인 2026-09-10).
//   구조물을 세울 때 필요한 가장자리 여유. 자동 채움 시 이 값을 빼고 캐비닛 수를 계산한다.
export const FRAME_CLEARANCE = Object.freeze({ IF: 30, IFM: 30, IE: 30, MM: 50, MP: 50 });
/** 시리즈별 구조틀 여백(각 변 mm). 미등록 시리즈는 30mm. */
export function frameClearanceMm(series) {
  return FRAME_CLEARANCE[series] ?? 30;
}
/** 모델 시리즈의 기본 예비율(소수). 미등록 시리즈는 DEFAULTS.spareRate로 대체. */
export function spareRateForSeries(series) {
  return SPARE_RATES[series] ?? DEFAULTS.spareRate;
}
/**
 * 예비 캐비닛 수 = 올림(설치수량 × 예비율).
 * opts.spareRate(사용자 지정 비율)가 있으면 그 값을, 없으면 시리즈 기본율을 쓴다.
 */
export function spareCount(series, total, opts = {}) {
  if (!(total > 0)) return 0;
  const rate = opts.spareRate ?? spareRateForSeries(series);
  return Math.ceil(total * rate - 1e-9);
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
  const clr = opts.edgeClearanceMm ?? frameClearanceMm(model.series);   // 구조틀 여백(시리즈별)
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
  // 하단 높이(바닥에서 LED 아래까지, mm): 세로 공간에서 이만큼 빼고 남는 높이에 캐비닛을 채운다.
  //   baseHeight=0(기본)이면 기존과 동일. 자동 채움일 때 rows가 그만큼 줄어든다(수동 배열은 영향 없음).
  const mode = opts.mode ?? 'fill';
  const baseHeight = Math.max(0, opts.baseHeight || 0);
  // 채움 대상 크기: 'fill'=벽면(세로는 하단 높이 제외), 'ledsize'=사용자가 지정한 LED 크기, 'manual'=열/행.
  //   'ledsize'는 fill 규칙으로 LED 가로/세로 안에 캐비닛을 채운다(하단 높이는 위치용이라 빼지 않음).
  let fitW = spaceW, fitH = Math.max(0, spaceH - baseHeight), fitOpts = opts;
  if (mode === 'ledsize') { fitW = Math.max(0, opts.ledW || 0); fitH = Math.max(0, opts.ledH || 0); fitOpts = { ...opts, mode: 'fill' }; }
  const { cols, rows, fits } = fitCabinets(model, fitW, fitH, fitOpts);
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
  const deadH = Math.max(0, spaceH - baseHeight - actualH);   // 벽면 대비 위 남는 세로(하단 높이 제외 후)

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
    deadW, deadH, baseHeight,
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

// ─────────────────────────────────────────────────────────────────────────────
// 비디오 프로세서(영상 스위처/스플라이서) 선정 로직  (DEC-017, 컨텍스트 문서 2026-09-12)
//
// 흐름: LED 산출(computeConfig) + 사용자 요구 → processorRequirements()
//       → validateProcessor()로 제품별 하드 제약 판정(PASS / CONDITIONAL / FAIL)
//       → rankProcessors()로 등급(권장/적합/조건부 적합/한계 구성/부적합) 매김·정렬.
//
// 데이터 신뢰성 원칙(문서 §15, CLAUDE.md 규칙 2): 확인되지 않은 사양은 절대 추정하지 않는다.
//   사양이 null이면 그 검사는 ok=null(확인 필요)로 두고, 종합 판정은 CONDITIONAL이 된다.
//   null을 임의로 PASS로 만들지 않는다.
//
// 절대 혼동 금지(문서 §4): 독립 입력 ≠ 레이어 ≠ 윈도우 ≠ 출력. 각각 별도로 검사한다.
// ─────────────────────────────────────────────────────────────────────────────

/** 표준 신호 타일 크기(px). 4K=3840x2160, 2K/FHD=1920x1080. */
export const TILE_4K_W = 3840, TILE_4K_H = 2160;
export const TILE_2K_W = 1920, TILE_2K_H = 1080;

/** 영역 타일 수 = ceil(resW/tileW) × ceil(resH/tileH). 입력이 유효하지 않으면 null. */
export function regionTiles(resW, resH, tileW, tileH) {
  if (!(resW > 0) || !(resH > 0) || !(tileW > 0) || !(tileH > 0)) return null;
  return Math.ceil(resW / tileW) * Math.ceil(resH / tileH);
}

/** 여러 값 중 최댓값(null 무시). 전부 null이면 null. */
function maxNullable(...vals) {
  const nums = vals.filter(v => v != null);
  return nums.length ? Math.max(...nums) : null;
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
  return {
    resW: resW ?? null, resH: resH ?? null,
    required4kOutputs: regionTiles(resW, resH, TILE_4K_W, TILE_4K_H),
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
 * 하드 제약 검사. proc(제품) vs req(processorRequirements 결과).
 * 각 검사 ok: true(충족)/false(미달)/null(사양 미확인). 요구하지 않은 항목은 검사 생략.
 * 종합 verdict: 하나라도 false면 FAIL, false는 없고 null 있으면 CONDITIONAL, 모두 true면 PASS.
 * 반환: { id, verdict, checks: [{name, need, have, unit, ok}] }.
 */
export function validateProcessor(proc, req) {
  if (!proc || !req) return null;
  const checks = [];
  const numCheck = (name, need, have, unit = '개') => {
    let ok = null;
    if (need != null && have != null) ok = have >= need;
    checks.push({ name, need: need ?? null, have: have ?? null, unit, ok });
  };
  const featCheck = (name, required, have) => {
    if (!required) return;
    const ok = have === true ? true : (have === false ? false : null);
    checks.push({ name, need: '지원', have: have === true ? '지원' : (have === false ? '미지원' : '확인 필요'), unit: '', ok });
  };

  // 1) 독립 입력(4K/2K) — 윈도우·레이어와 별개(문서 §4).
  if (req.independent4kInputs > 0) numCheck('독립 4K 입력', req.independent4kInputs, proc.inputs?.maxIndependent4k);
  if (req.independent2kInputs > 0) numCheck('독립 2K 입력', req.independent2kInputs, proc.inputs?.maxIndependent2k);

  // 2) 필요 출력 수(4K).
  if (req.required4kOutputs > 0) numCheck('4K 출력', req.required4kOutputs, proc.outputs?.max4k);

  // 3) 레이어 용량 — capacityModel별로 다르게 산출(문서 §5).
  const L = proc.layers ?? {};
  if (req.simultaneous4kLayers > 0) {
    let cap = null, name = '4K 레이어';
    switch (L.model) {
      case 'mixing_split':
        // True A/B가 필요하면 반드시 '믹싱' 레이어만 사용(분할 레이어로 대체 불가, 문서 §12).
        cap = req.trueABRequired ? (L.mixing4k ?? null) : maxNullable(L.mixing4k, L.split4k);
        name = req.trueABRequired ? '4K 믹싱 레이어(A/B)' : '4K 레이어(믹싱/분할)';
        break;
      case 'per_output_card':
        cap = (L.perOutputCard4k != null && proc.outputs?.maxOutputBoards != null)
          ? L.perOutputCard4k * proc.outputs.maxOutputBoards : (L.global4k ?? null);
        break;
      case 'global_window':
      case 'screen_group':
      default:
        cap = L.global4k ?? null;
    }
    numCheck(name, req.simultaneous4kLayers, cap);
  }
  if (req.simultaneous2kLayers > 0) {
    let cap = null;
    switch (L.model) {
      case 'per_output_card':
        cap = (L.perOutputCard2k != null && proc.outputs?.maxOutputBoards != null)
          ? L.perOutputCard2k * proc.outputs.maxOutputBoards : (L.global2k ?? null);
        break;
      case 'global_window':
        cap = L.global2k ?? L.maxWindows ?? null;
        break;
      case 'screen_group':
      default:
        cap = L.global2k ?? null;
    }
    numCheck('2K 레이어', req.simultaneous2kLayers, cap);
  }

  // 3b) 총 윈도우(글로벌 윈도우 모델, 예: Colorlight X100 Pro): 동시 표시 수 ≤ maxWindows.
  if (L.model === 'global_window' && L.maxWindows != null) {
    const windows = req.simultaneous4kLayers + req.simultaneous2kLayers;
    if (windows > 0) numCheck('최대 윈도우', windows, L.maxWindows, '개');
  }

  // 3c) 출력카드/보드별 레이어 한계.
  const cardCheck = validateOutputCardLayers(proc, req);
  if (cardCheck) checks.push(cardCheck);

  // 4) 스위칭/기능 요구.
  featCheck('True A/B 믹싱', req.trueABRequired, proc.switching?.trueABMixing);
  featCheck('Seamless 스위칭', req.seamlessSwitching, proc.switching?.seamless);
  featCheck('Fade', req.fadeRequired, proc.switching?.fade);
  featCheck('Preview/Program', req.previewProgramRequired, proc.switching?.previewProgram);
  featCheck('Genlock', req.genlockRequired, proc.features?.genlock);
  featCheck('HDR', req.hdrRequired, proc.features?.hdr);
  featCheck('10-bit', req.tenBitRequired, proc.features?.tenBit);
  if (req.advancedTransitionRequired) {
    const g = proc.switching?.transitionGrade;
    const ok = g == null ? null : (g === 'live_production' || g === 'broadcast_grade');
    checks.push({ name: '고급 트랜지션', need: '지원', have: g ?? '확인 필요', unit: '', ok });
  }
  if (req.externalControlRequired) {
    const c = proc.control ?? {};
    const vals = [c.amxCompatible, c.crestronCompatible, c.tcp, c.restApi];
    const ok = vals.some(v => v === true) ? true : (vals.every(v => v === false) ? false : null);
    checks.push({ name: '외부 제어(AMX/Crestron 등)', need: '지원', have: ok === true ? '지원' : (ok === false ? '미지원' : '확인 필요'), unit: '', ok });
  }

  const anyFail = checks.some(c => c.ok === false);
  const anyUnknown = checks.some(c => c.ok === null);
  const verdict = anyFail ? 'FAIL' : (anyUnknown ? 'CONDITIONAL' : 'PASS');
  return { id: proc.id ?? null, verdict, checks };
}

// 운용 환경별 우선 제품군(문서 §8). 정렬 시 가벼운 가중치로만 사용(v1은 정확한 판정이 우선, 문서 §16).
const APPLICATION_PREFERRED = Object.freeze({
  conference: ['Midra', 'Alta', 'X100 Pro'],
  auditorium: ['Alta', 'Aquilon', 'Universe', 'H'],
  event: ['Aquilon'],
  broadcast: ['Aquilon'],
  control_room: ['Universe', 'H'],
});

/** 등급 라벨. 미달=부적합, 미확인=조건부 적합, 충족 시 수치 여유로 권장/적합/한계 구성 구분. */
function gradeLabel(v) {
  if (!v || v.verdict === 'FAIL') return '부적합';
  if (v.verdict === 'CONDITIONAL') return '조건부 적합';
  const nums = v.checks.filter(c => typeof c.need === 'number' && typeof c.have === 'number');
  if (nums.some(c => c.have === c.need)) return '한계 구성';        // 딱 맞음
  if (nums.length && nums.every(c => c.have >= c.need * 1.5)) return '권장';  // 넉넉한 여유
  return '적합';
}

const GRADE_ORDER = Object.freeze({ '권장': 0, '적합': 1, '조건부 적합': 2, '한계 구성': 3, '부적합': 4 });

// 소형 작업(필요 4K 출력이 이 값 이하)에서는 고가의 Aquilon을 추천 목록에서 제외한다.
// (이사 지침 2026-09-12: "4K 2개 출력엔 Aquilon 절대 사용 안 함(가격). 예외 없음.")
export const AQUILON_HIDE_MAX_4K_OUTPUTS = 2;
const isExpensiveOverspec = (proc, req) =>
  proc.family === 'Aquilon' &&
  req.required4kOutputs != null &&
  req.required4kOutputs <= AQUILON_HIDE_MAX_4K_OUTPUTS;

/**
 * 제품 목록을 평가·정렬한다. 반환: [{ proc, verdict, checks, label, appPreferred }] (좋은 등급 먼저).
 * 동급이면 (1) 운용 환경 우선 제품군, (2) 4K 출력 여유 큰 순.
 * 소형 작업에서는 Aquilon(고가)을 목록에서 숨긴다(위 규칙, 예외 없음).
 */
export function rankProcessors(procs, req) {
  if (!Array.isArray(procs) || !req) return [];
  const pref = APPLICATION_PREFERRED[req.application] ?? [];
  return procs
    .filter(proc => !isExpensiveOverspec(proc, req))
    .map(proc => {
      const v = validateProcessor(proc, req);
      const out4k = v?.checks.find(c => c.name === '4K 출력');
      const headroom = (out4k && typeof out4k.have === 'number' && typeof out4k.need === 'number') ? out4k.have - out4k.need : 0;
      return { proc, ...v, label: gradeLabel(v), appPreferred: pref.includes(proc.family), _headroom: headroom };
    })
    .sort((a, b) =>
      (GRADE_ORDER[a.label] - GRADE_ORDER[b.label]) ||
      (Number(b.appPreferred) - Number(a.appPreferred)) ||
      (b._headroom - a._headroom));
}
