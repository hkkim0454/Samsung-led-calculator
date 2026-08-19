import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeConfig, computeQuote, computeIndirect, fitCabinets, cabinetResolution, bom, sboxCount, gbicSets, fit169, bdmFarViewerM } from '../src/engine.js';
import { MODELS } from '../src/models.js';

const MP012F = MODELS.find(m => m.id === 'MP012F');

// Reference values captured directly from Samsung configurator on 2026-07-23:
// MP012F, wall 6.0 x 3.4 m, "Fit to wall" -> 7 x 6 cabinets.
test('MP012F 7x6 reproduces Samsung reference figures', () => {
  const r = computeConfig(MP012F, 6000, 3400, { mode: 'manual', cols: 7, rows: 6 });
  assert.equal(r.total, 42);
  assert.equal(r.resW, 4480);
  assert.equal(r.resH, 2160);
  assert.ok(Math.abs(r.actualW - 5644.8) < 0.1, `actualW=${r.actualW}`);
  assert.ok(Math.abs(r.actualH - 2721.6) < 0.1, `actualH=${r.actualH}`);
  assert.ok(Math.abs(r.areaM2 - 15.362) < 0.01, `area=${r.areaM2}`);
  assert.ok(Math.abs(r.diagIn - 246.679) < 0.1, `diag=${r.diagIn}`);
  assert.ok(Math.abs(r.weightKg - 386.4) < 0.1, `weight=${r.weightKg}`);
  assert.equal(r.maxW, 6132);
  assert.ok(Math.abs(r.typW - 3234) < 8, `typ=${r.typW}`); // Samsung 3234 (pf 0.527)
  assert.ok(Math.abs(r.heatMaxBTU - 20916) < 20, `btu=${r.heatMaxBTU}`);
});

test('cabinet resolution derives from size/pitch when absent', () => {
  const m = { cabW: 806.4, cabH: 453.6, pitch: 1.26 };
  assert.deepEqual(cabinetResolution(m), { resW: 640, resH: 360 });
});

test('fill mode floors on both axes', () => {
  // 6000/806.4 = 7.44 -> 7 ; 3400/453.6 = 7.49 -> 7 (pure floor; see SPEC Q1)
  const f = fitCabinets(MP012F, 6000, 3400, { mode: 'fill' });
  assert.deepEqual({ cols: f.cols, rows: f.rows }, { cols: 7, rows: 7 });
});

test('does not fit when space smaller than one cabinet', () => {
  const f = fitCabinets(MP012F, 500, 300, { mode: 'fill' });
  assert.equal(f.fits, false);
  assert.equal(f.cols * f.rows, 0);
});

test('null weight propagates as null (no fake numbers)', () => {
  // IF040R: 전력은 IFR 브로셔로 채웠지만 무게는 신뢰 가능한 실측이 없어 null 유지.
  const IF040R = MODELS.find(m => m.id === 'IF040R');
  const r = computeConfig(IF040R, 6000, 3400, { mode: 'fill' });
  assert.equal(r.weightKg, null);   // 무게 null → 결과도 null(가짜 수치 금지)
  assert.ok(r.maxW > 0);            // 전력은 채워졌으므로 산출됨
  assert.ok(r.resW > 0);            // geometry still computed
});

test('bom spare defaults to 5% rounded up (owner rule 2026-07-26)', () => {
  const b = bom(MP012F, 42);
  assert.equal(b.spares, 3);        // ceil(42 * 0.05) = ceil(2.1) = 3
  assert.equal(b.totalCabinets, 45);
});

test('computeConfig exposes spares and total-with-spares', () => {
  const r = computeConfig(MP012F, 6000, 3400, { mode: 'manual', cols: 7, rows: 6 });
  assert.equal(r.total, 42);
  assert.equal(r.spares, 3);            // MPF 7%: ceil(42 * 0.07) = ceil(2.94) = 3
  assert.equal(r.totalWithSpares, 45);
});

// 예비 규칙은 시리즈별로 다르다.
//   MMF 5% · MPF 7% (비율, 삼성 export 검증). IFR/IEA = 3×3(9대)당 1대 (오너 규칙 2026-08-19).
test('spare rule is series-specific (IFR/IEA per-9, MMF 5%, MPF 7%)', () => {
  const IF015R = MODELS.find(m => m.id === 'IF015R');
  const IE015A = MODELS.find(m => m.id === 'IE015A');
  const MM009F = MODELS.find(m => m.id === 'MM009F');
  const MP008F = MODELS.find(m => m.id === 'MP008F');
  const man = (m, c, r) => computeConfig(m, 0, 0, { mode: 'manual', cols: c, rows: r }).spares;
  // MMF/MPF: 비율(올림) — 100대에서 MMF 5, MPF 7
  assert.equal(man(MM009F, 10, 10), 5);
  assert.equal(man(MP008F, 10, 10), 7);
  assert.equal(man(MP008F, 12, 12), 11);   // 144 * 0.07 -> 11
  // IFR/IEA: 3×3(9)대당 1대 = ceil(total / 9)
  assert.equal(man(IF015R, 3, 3), 1);      // 9 -> 1
  assert.equal(man(IE015A, 3, 3), 1);
  assert.equal(man(IF015R, 10, 10), 12);   // 100 -> ceil(100/9)=12
  assert.equal(man(IE015A, 10, 10), 12);
  assert.equal(man(IF015R, 10, 5), 6);     // 50 -> ceil(50/9)=6
  assert.equal(man(IF015R, 3, 4), 2);      // 12 -> ceil(12/9)=2
  // 사용자 지정 비율(opts.spareRate)이 있으면 그 값이 우선한다(시리즈 규칙 무시).
  assert.equal(computeConfig(MP008F, 0, 0, { mode: 'manual', cols: 10, rows: 10, spareRate: 0.05 }).spares, 5);
  assert.equal(computeConfig(IF015R, 0, 0, { mode: 'manual', cols: 10, rows: 10, spareRate: 0.03 }).spares, 3);
});

// S-Box rule (region tiling) verified against Samsung: MP012F 42 cabinets (4480x2160) -> 2 units.
test('MP012F 42 cabinets need 2 S-Box (Samsung reference)', () => {
  const r = computeConfig(MP012F, 6000, 3400, { mode: 'manual', cols: 7, rows: 6 });
  assert.equal(r.sbox, 2);
  // ceil(4480/3840) * ceil(2160/2160) = 2 * 1 = 2
  assert.equal(sboxCount(MP012F, 4480, 2160), 2);
});

test('S-Box tiles by width and height (region-based)', () => {
  // 5760 wide x 2160 tall, cap 3840x2160 -> ceil(5760/3840)=2 across, 1 tall = 2 boxes.
  assert.equal(sboxCount(MP012F, 5760, 2160), 2);
  // 3840 wide x 4320 tall -> 1 across, ceil(4320/2160)=2 tall = 2 boxes.
  assert.equal(sboxCount(MP012F, 3840, 4320), 2);
});

test('S-Box redundancy doubles the controller count', () => {
  const r = computeConfig(MP012F, 6000, 3400, { mode: 'manual', cols: 7, rows: 6, redundancy: true });
  assert.equal(r.sbox, 4);
});

test('S-Box is null when controller capacity is unknown (no fake numbers)', () => {
  const noCap = { maxInputW: null, maxInputH: null };
  assert.equal(sboxCount(noCap, 3840, 2160), null);
});

test('per-model typical power is preferred over the global factor', () => {
  // MP012F stores typicalPower 77 -> 42 * 77 = 3234 exactly (matches Samsung reading).
  const r = computeConfig(MP012F, 6000, 3400, { mode: 'manual', cols: 7, rows: 6 });
  assert.equal(r.typW, 42 * 77);
});

test('16:9 max resolution: super-wide is height-limited', () => {
  // 5760x1080 super-wide -> full height, width capped at 1080*16/9 = 1920.
  assert.deepEqual(fit169(5760, 1080), { w: 1920, h: 1080 });
  // taller than 16:9 -> width-limited: 1080x1920 -> h = 1080*9/16 = 607.5 -> 608
  assert.deepEqual(fit169(1080, 1920), { w: 1080, h: 608 });
});

test('16:9 max for the MP012F reference wall (4480x2160 is wider than 16:9)', () => {
  // 4480/2160 = 2.07 > 16/9 -> not 16:9; 16:9 content max = 2160*16/9 = 3840 x 2160.
  const r = computeConfig(MP012F, 6000, 3400, { mode: 'manual', cols: 7, rows: 6 });
  assert.equal(r.is169, false);
  assert.equal(r.res169W, 3840);
  assert.equal(r.res169H, 2160);
  // 16:9 영역 물리 대각: 3840x2160 @ pitch 1.26 -> ~218.6"
  assert.ok(Math.abs(r.diag169In - 218.6) < 0.1, `diag169=${r.diag169In}`);
});

test('16:9 max equals full resolution when the panel is exactly 16:9', () => {
  // 3840x2160 (4K UHD) is exactly 16:9.
  assert.deepEqual(fit169(3840, 2160), { w: 3840, h: 2160 });
});

test('GBIC: gbicSets = 1 SET per 1920x2160 region, doubled by redundancy', () => {
  // 4480x2160 -> ceil(4480/1920)=3 * ceil(2160/2160)=1 = 3 SET.
  assert.equal(gbicSets(4480, 2160), 3);
  assert.equal(gbicSets(4480, 2160, { redundancy: true }), 6);
  // 3840x2160 (4K) -> 2 SET; unknown resolution -> null.
  assert.equal(gbicSets(3840, 2160), 2);
  assert.equal(gbicSets(0, 0), null);
});

test('GBIC는 CS4B 계열 컨트롤러에서만 산출 (MMF 자동, 그 외는 CS4B 선택 시)', () => {
  // MPF 기본 SNOWAAE -> GBIC 없음.
  const mpOff = computeConfig(MP012F, 6000, 3400, { mode: 'manual', cols: 7, rows: 6 });
  assert.equal(mpOff.controller, 'SBB-SNOWAAE');
  assert.equal(mpOff.gbic, null);
  // MPF + CS4B(광전송) 선택 -> 컨트롤러 CS4B, GBIC 3 (4480x2160).
  const mpOn = computeConfig(MP012F, 6000, 3400, { mode: 'manual', cols: 7, rows: 6, cs4b: true });
  assert.equal(mpOn.controller, 'SBB-CS4B');
  assert.equal(mpOn.gbic, 3);
  assert.equal(mpOn.sbox, mpOff.sbox); // S-Box 수량은 CS4B 옵션과 무관.
  // MMF는 기본 컨트롤러가 CS4BPGS -> GBIC 자동 산출 (10x10 = 3840x2160 -> 2 SET).
  const MM015F = MODELS.find(m => m.id === 'MM015F');
  const mm = computeConfig(MM015F, 6000, 3400, { mode: 'fill' });
  assert.equal(mm.controller, 'SBB-CS4BPGS');
  assert.equal(mm.gbic, 2);
  // MMF에 cs4b 옵션이 켜져도 네이티브 CS4BPGS 컨트롤러를 SBB-CS4B로 다운그레이드하지 않는다.
  const mmOn = computeConfig(MM015F, 6000, 3400, { mode: 'fill', cs4b: true });
  assert.equal(mmOn.controller, 'SBB-CS4BPGS');
  assert.equal(mmOn.gbic, 2);
});

test('Gbic 포워드/백워드(gbicFB)로 Gbic 수량 2배 (SBOX 이중화와 독립)', () => {
  const base = { mode: 'manual', cols: 7, rows: 6, cs4b: true };            // MPF+CS4B -> gbic 3
  assert.equal(computeConfig(MP012F, 6000, 3400, base).gbic, 3);
  // gbicFB만 켜면 Gbic ×2, SBOX 수량은 그대로.
  const fb = computeConfig(MP012F, 6000, 3400, { ...base, gbicFB: true });
  assert.equal(fb.gbic, 6);
  assert.equal(fb.sbox, computeConfig(MP012F, 6000, 3400, base).sbox);
  // SBOX 이중화만 켜도 Gbic ×2(기존 동작 유지).
  assert.equal(computeConfig(MP012F, 6000, 3400, { ...base, redundancy: true }).gbic, 6);
  // 둘 다 켜도 Gbic은 ×2(×4 아님).
  assert.equal(computeConfig(MP012F, 6000, 3400, { ...base, redundancy: true, gbicFB: true }).gbic, 6);
});

test('IFR/IEA specs match Samsung series brochures (IFR 220805 / IEA 220113)', () => {
  const pick = id => MODELS.find(m => m.id === id);
  // IEA 브로셔 실측 (per-cabinet): 무게/최대W/평균W/피크·최대 밝기.
  const IE015A = pick('IE015A'), IE020A = pick('IE020A'), IE025A = pick('IE025A'), IE040A = pick('IE040A');
  assert.deepEqual([IE015A.weight, IE015A.maxPower, IE015A.typicalPower], [11.8, 190, 105]);
  assert.deepEqual([IE020A.weight, IE020A.maxPower, IE020A.typicalPower], [12.4, 190, 105]);
  assert.deepEqual([IE025A.weight, IE025A.maxPower, IE025A.typicalPower], [10.8, 180, 60]);
  assert.deepEqual([IE040A.weight, IE040A.maxPower, IE040A.typicalPower], [10.8, 180, 60]);
  assert.deepEqual([IE040A.brightnessPeak, IE040A.brightnessReduced], [800, 500]);
  // IFR 브로셔 전력(무게는 브로셔 신뢰도 낮아 IF015R만 실측 11.8, IF020R/040R 무게는 미입력).
  const IF015R = pick('IF015R'), IF020R = pick('IF020R'), IF025R = pick('IF025R'), IF040R = pick('IF040R');
  assert.equal(IF015R.weight, 11.8);                         // configurator 실측 유지(브로셔 12.4 아님)
  assert.deepEqual([IF015R.maxPower, IF015R.typicalPower], [360, 117]);
  assert.deepEqual([IF020R.maxPower, IF020R.typicalPower, IF020R.weight], [260, 87, null]);
  assert.deepEqual([IF025R.maxPower, IF025R.typicalPower], [260, 87]);
  assert.deepEqual([IF040R.maxPower, IF040R.typicalPower, IF040R.weight], [260, 87, null]);
});

test('BDM far-viewer distance = 화면 세로 × (2 × %EH) (2.5% → ×5)', () => {
  // 2.16 m 화면, %EH 2.5% → 2.16 × 5 = 10.8 m
  assert.ok(Math.abs(bdmFarViewerM(2160, 2.5) - 10.8) < 1e-9);   // 2.5% -> ×5
  assert.ok(Math.abs(bdmFarViewerM(2160, 3) - 12.96) < 1e-9);    // 3%   -> ×6
  assert.equal(bdmFarViewerM(0, 2.5), 0);
  // computeConfig가 bdm25M(세로×5, 권장)·bdm30M(세로×6, 최대)을 노출: MP012F 7x6 -> actualH 2721.6mm.
  const r = computeConfig(MP012F, 6000, 3400, { mode: 'manual', cols: 7, rows: 6 });
  assert.ok(Math.abs(r.bdm25M - (2721.6 / 1000) * 5) < 1e-6, `bdm25M=${r.bdm25M}`);
  assert.ok(Math.abs(r.bdm30M - (2721.6 / 1000) * 6) < 1e-6, `bdm30M=${r.bdm30M}`);
});

test('brightnessMax uses operating "최대" (reduced when present, else peak)', () => {
  // MP008F peak 1800 / reduced 1000 -> operating max is 1000.
  const MP008F = MODELS.find(m => m.id === 'MP008F');
  assert.equal(computeConfig(MP008F, 6000, 3400, { mode: 'fill' }).brightnessMax, 1000);
  // MM015F has reduced=null; the 600 nit peak IS the 최대.
  const MM015F = MODELS.find(m => m.id === 'MM015F');
  assert.equal(computeConfig(MM015F, 6000, 3400, { mode: 'fill' }).brightnessMax, 600);
});

test('MMF P0.9375 / P1.25 verified against Samsung configurator export', () => {
  const MM009F = MODELS.find(m => m.id === 'MM009F');
  const MM012F = MODELS.find(m => m.id === 'MM012F');
  // geometry / resolution (cabinet 600x337.5, pitch-derived) — matches Samsung export.
  assert.deepEqual({ p: MM009F.pitch, w: MM009F.resW, h: MM009F.resH }, { p: 0.9375, w: 640, h: 360 });
  assert.deepEqual({ p: MM012F.pitch, w: MM012F.resW, h: MM012F.resH }, { p: 1.25, w: 480, h: 270 });
  // per-cabinet figures from the official export (weight 5.1kg 공통).
  assert.deepEqual({ w: MM009F.weight, max: MM009F.maxPower, typ: MM009F.typicalPower }, { w: 5.1, max: 94.6, typ: 37 });
  assert.deepEqual({ w: MM012F.weight, max: MM012F.maxPower, typ: MM012F.typicalPower }, { w: 5.1, max: 92.8, typ: 41.5 });

  // MM009F 12x6 export: 367.2 kg, 6811.2 W max, 2664 W typ, 2 S-Box (7680x2160).
  const a = computeConfig(MM009F, 7200, 2025, { mode: 'manual', cols: 12, rows: 6 });
  assert.ok(Math.abs(a.weightKg - 367.2) < 0.1, `weight=${a.weightKg}`);
  assert.ok(Math.abs(a.maxW - 6811.2) < 0.1, `max=${a.maxW}`);
  assert.ok(Math.abs(a.typW - 2664) < 0.1, `typ=${a.typW}`);
  assert.equal(a.sbox, 2);
  assert.equal(a.brightnessMax, 600);

  // MM012F 8x8 export: 326.4 kg, 5939.2 W max, 2656 W typ, 1 S-Box (3840x2160).
  const b = computeConfig(MM012F, 4800, 2700, { mode: 'manual', cols: 8, rows: 8 });
  assert.ok(Math.abs(b.weightKg - 326.4) < 0.1, `weight=${b.weightKg}`);
  assert.ok(Math.abs(b.maxW - 5939.2) < 0.1, `max=${b.maxW}`);
  assert.ok(Math.abs(b.typW - 2656) < 0.1, `typ=${b.typW}`);
  assert.equal(b.sbox, 1);
});

// ── 원가/견적 산출 (computeQuote) ──────────────────────────────────────────────
// 실제 단가는 테스트에 넣지 않는다(가격정보 금지). 아래는 계산 검증용 가짜 단가.
test('computeQuote: 품목별 원가/견적/마진 (가짜 단가)', () => {
  const P = {
    panels: { MP012F: { cost: 1000, sell: 1500 } },
    sbox: { 'SBB-SNOWAAE': { cost: 200, sell: 300 } },
    install: { costPerM2: 10, sellPerM2: 20 },
  };
  // 예비 SBOX는 이 테스트에서 0으로 두어 패널/설치 검증에 집중(예비 SBOX는 별도 테스트).
  const r = computeConfig(MP012F, 6000, 3400, { mode: 'manual', cols: 7, rows: 6, sboxSpares: 0 });
  // 42 캐비닛, MP 예비율 7% → 예비 3 → 총 45. SBOX 2대(4480x2160). CS4B 아님 → Gbic 없음.
  const q = computeQuote(MP012F, r, P);
  const panel = q.lines.find(l => l.label.includes('LED 패널'));
  assert.equal(panel.qty, 45, `panel qty=${panel.qty}`);      // 예비 포함
  assert.equal(panel.cost, 45000);
  assert.equal(panel.sell, 67500);
  const sbox = q.lines.find(l => l.label.includes('S-BOX'));
  assert.equal(sbox.qty, 2);
  assert.equal(sbox.cost, 400);
  assert.ok(!q.lines.some(l => l.label.includes('Gbic')), 'no gbic without CS4B');
  // 설치: 면적 × ㎡단가
  const inst = q.lines.find(l => l.label.includes('설치'));
  assert.ok(Math.abs(inst.cost - r.areaM2 * 10) < 1e-6);
  // 합계·마진
  assert.ok(Math.abs(q.totalCost - (45000 + 400 + r.areaM2 * 10)) < 1e-6);
  assert.ok(Math.abs(q.totalSell - (67500 + 600 + r.areaM2 * 20)) < 1e-6);
  assert.ok(Math.abs(q.margin - (q.totalSell - q.totalCost) / q.totalSell) < 1e-9);
  assert.equal(q.incomplete, false);
});

test('computeQuote: CS4B 모델은 Gbic 라인 포함, 기타자재 수동입력', () => {
  const MM015F = MODELS.find(m => m.id === 'MM015F');
  const P = {
    panels: { MM015F: { cost: 100, sell: 150 } },
    sbox: { 'SBB-CS4BPGS': { cost: 200, sell: 300 } },
    gbic: { cost: 50, sell: 75 },
    install: { costPerM2: 1, sellPerM2: 2 },
  };
  const r = computeConfig(MM015F, 0, 0, { mode: 'manual', cols: 10, rows: 10 }); // 3840x2160
  const q = computeQuote(MM015F, r, P, { etc: { cost: 500, sell: 800 } });
  const g = q.lines.find(l => l.label.includes('Gbic'));
  assert.equal(g.qty, 4);          // SET 2 × 2 = 4 EA
  assert.equal(g.cost, 200);
  const etc = q.lines.find(l => l.label.includes('기타 자재'));
  assert.equal(etc.cost, 500);
  assert.equal(etc.sell, 800);
});

test('computeQuote: 가격표 없거나 미배치면 null', () => {
  const r = computeConfig(MP012F, 6000, 3400, { mode: 'manual', cols: 7, rows: 6 });
  assert.equal(computeQuote(MP012F, r, null), null);
  const nofit = computeConfig(MP012F, 100, 100, { mode: 'fill' });
  assert.equal(computeQuote(MP012F, nofit, { panels: {} }), null);
});

test('computeQuote: 단가 미설정 항목은 incomplete=true, 합계 제외', () => {
  const P = { panels: {} }; // 패널 단가 없음
  const r = computeConfig(MP012F, 6000, 3400, { mode: 'manual', cols: 7, rows: 6 });
  const q = computeQuote(MP012F, r, P);
  assert.equal(q.incomplete, true);
  const panel = q.lines.find(l => l.label.includes('LED 패널'));
  assert.equal(panel.cost, null);
  assert.equal(q.totalCost, 0); // null은 합계에서 빠짐
});

test('computeQuote: 고소작업 시 설치비에 할증배수 적용', () => {
  const P = { panels: { MP012F: { cost: 1000, sell: 1500 } },
              install: { costPerM2: 10, sellPerM2: 20, highWorkMultiplier: 1.5 } };
  const r = computeConfig(MP012F, 6000, 3400, { mode: 'manual', cols: 7, rows: 6 });
  const base = computeQuote(MP012F, r, P);
  const hw = computeQuote(MP012F, r, P, { highWork: true });
  const bi = base.lines.find(l => l.label.includes('설치'));
  const hi = hw.lines.find(l => l.label.includes('설치'));
  assert.ok(Math.abs(hi.cost - bi.cost * 1.5) < 1e-6, `hw cost=${hi.cost}`);
  assert.ok(Math.abs(hi.sell - bi.sell * 1.5) < 1e-6);
  assert.ok(hi.label.includes('고소'));
  // 배수 미설정이면 highWork여도 기본가 유지
  const noMult = { panels: {}, install: { costPerM2: 10, sellPerM2: 20 } };
  const inst = computeQuote(MP012F, r, noMult, { highWork: true }).lines.find(l => l.label.includes('설치'));
  assert.ok(Math.abs(inst.cost - r.areaM2 * 10) < 1e-6);
});

test('예비 SBOX: 기본 1대, 직접 지정, 견적 수량 반영', () => {
  const P = { panels: {}, sbox: { 'SBB-SNOWAAE': { cost: 200, sell: 300 } } };
  // 기본: SBOX 2대 + 예비 1 = 3
  const base = computeConfig(MP012F, 6000, 3400, { mode: 'manual', cols: 7, rows: 6 });
  assert.equal(base.sbox, 2);
  assert.equal(base.sboxSpares, 1);
  assert.equal(base.sboxWithSpares, 3);
  const s = computeQuote(MP012F, base, P).lines.find(l => l.label.includes('S-BOX'));
  assert.equal(s.qty, 3);
  assert.equal(s.cost, 600);         // 3 × 200
  // 예비 3대 지정 → 2+3=5
  const r3 = computeConfig(MP012F, 6000, 3400, { mode: 'manual', cols: 7, rows: 6, sboxSpares: 3 });
  assert.equal(r3.sboxWithSpares, 5);
  assert.equal(computeQuote(MP012F, r3, P).lines.find(l => l.label.includes('S-BOX')).qty, 5);
  // 예비 0 → 2
  const r0 = computeConfig(MP012F, 6000, 3400, { mode: 'manual', cols: 7, rows: 6, sboxSpares: 0 });
  assert.equal(r0.sboxWithSpares, 2);
});

test('computeIndirect: 표준품셈 항목·공과잡비 특별기준', () => {
  const cfg = { items: [
    { name: '간접노무비', base: 'labor', pct: 4.860 },
    { name: '고용보험료', base: 'labor', pct: 0.424 },
    { name: '산재보험료', base: 'labor', pct: 0.961 },
    { name: '연금보험료', base: 'labor', pct: 1.215 },
    { name: '건강보험료', base: 'labor', pct: 0.957 },
    { name: '노인장기요양보험료', base: 'labor', pct: 0.124 },
    { name: '산업안전보건관리비', base: 'direct', pct: 3.110 },
    { name: '퇴직공제부금비', base: 'labor', pct: 0.621 },
    { name: '공과잡비', base: 'special', pct: 10.000 },
  ]};
  const ind = computeIndirect(1_000_000, 10_000_000, cfg);
  const get = n => ind.lines.find(l => l.name === n).amount;
  assert.ok(Math.abs(get('간접노무비') - 48600) < 1e-6);
  assert.ok(Math.abs(get('산업안전보건관리비') - 311000) < 1e-6);
  // 공과잡비 = (직접비 + 간접노무비 + 산업안전) × 10%
  assert.ok(Math.abs(get('공과잡비') - (10_000_000 + 48600 + 311000) * 0.1) < 1e-6);
  assert.ok(Math.abs(ind.total - 1_438_580) < 1e-3, `total=${ind.total}`);
});

test('computeQuote: 간접비는 견적에만 가산(원가 불변)', () => {
  const P = {
    panels: { MP012F: { cost: 1000, sell: 1000 } },
    sbox: { 'SBB-SNOWAAE': { cost: 200, sell: 200 } },
    install: { costPerM2: 100, sellPerM2: 100 },
    indirect: { items: [{ name: '공과잡비', base: 'direct', pct: 10 }] },
  };
  const r = computeConfig(MP012F, 6000, 3400, { mode: 'manual', cols: 7, rows: 6, sboxSpares: 0 });
  const q = computeQuote(MP012F, r, P);
  assert.ok(q.indirect);
  assert.ok(Math.abs(q.indirect.total - q.directCost * 0.10) < 1e-6);
  assert.equal(q.totalCost, q.directCost);                                  // 원가 불변
  assert.ok(Math.abs(q.totalSell - (q.directSell + q.indirect.total)) < 1e-6);
});

test('computeIndirect: enabled:false 기본 제외 + disabled 인자 우선', () => {
  const cfg = { items: [
    { name: '간접노무비', base: 'labor', pct: 10 },
    { name: '연금보험료', base: 'labor', pct: 10, enabled: false },
    { name: '공과잡비',   base: 'special', pct: 10 },
  ]};
  // 기본(disabled 미지정): enabled:false 인 연금보험료 제외.
  const d = computeIndirect(1000, 5000, cfg);
  assert.equal(d.lines.find(l => l.name === '연금보험료').included, false);
  assert.equal(d.lines.find(l => l.name === '간접노무비').included, true);
  // 공과잡비 base = 직접5000 + 간접노무비(100) = 5100 → 510. total = 간접노무비100 + 공과잡비510 = 610.
  assert.ok(Math.abs(d.total - 610) < 1e-6, `d.total=${d.total}`);
  // disabled 인자가 있으면 그것이 유일 기준(연금보험료 다시 포함, 간접노무비 제외).
  const d2 = computeIndirect(1000, 5000, cfg, ['간접노무비']);
  assert.equal(d2.lines.find(l => l.name === '연금보험료').included, true);
  assert.equal(d2.lines.find(l => l.name === '간접노무비').included, false);
  // 간접노무비 제외 → 공과잡비 base=5000→500. total = 연금100 + 공과잡비500 = 600.
  assert.ok(Math.abs(d2.total - 600) < 1e-6, `d2.total=${d2.total}`);
});
