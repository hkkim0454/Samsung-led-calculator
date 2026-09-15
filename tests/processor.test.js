import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  processorRequirements, validateOutputCardLayers, regionTiles,
  outputCardUsage2kEq, outputCapacity, inputsCapacity, buildSboxTopologies, cardPlan,
} from '../src/processor-limits.js';
import {
  validateProcessor, rankProcessors, validateBuild, operationFit, verificationPending,
} from '../src/processor-validator.js';
import { PROCESSORS, getProcessor } from '../src/processor-data.js';

const findCheck = (v, name) => v.checks.find(c => c.name === name);

// ── S-Box 출력 요구량 / topology ────────────────────────────────────────────
test('required 4K outputs: 3840x2160 -> 1, 7680x2160 -> 2, 7680x4320 -> 4', () => {
  assert.equal(processorRequirements({ resW: 3840, resH: 2160 }).required4kOutputs, 1);
  assert.equal(processorRequirements({ resW: 7680, resH: 2160 }).required4kOutputs, 2);
  assert.equal(processorRequirements({ resW: 7680, resH: 4320 }).required4kOutputs, 4);
});
test('regionTiles invalid -> null', () => {
  assert.equal(regionTiles(0, 2160, 3840, 2160), null);
  assert.equal(regionTiles(3841, 2160, 3840, 2160), 2);
});
test('buildSboxTopologies: 5760x1080 -> UHD(2) + FHD(3) 후보', () => {
  const t = buildSboxTopologies(5760, 1080);
  assert.equal(t[0].required4kOutputs, 2);              // UHD 중심 primary
  assert.ok(t.some(x => x.label === 'FHD 중심' && x.required2kOutputs === 3));  // FHD 대체 후보 존재
});
test('SBOX redundancy does NOT double output requirement', () => {
  assert.equal(processorRequirements({ resW: 7680, resH: 2160, redundancy: true }).required4kOutputs, 2);
});

// ── 지침1: Active ≠ 독립4K출력 ≠ PGM (Analog Way) ────────────────────────────
test('Analog Way outputs separate Active / Independent4kOut / PGM', () => {
  const z1 = getProcessor('aw-alta-zenith-100').outputs;
  assert.deepEqual({ a: z1.maxActiveOutputs, i: z1.maxIndependent4kOutputs, p: z1.maxIndependent4kPgm }, { a: 4, i: 4, p: 3 });
  const z2 = getProcessor('aw-alta-zenith-200').outputs;
  assert.deepEqual({ a: z2.maxActiveOutputs, p: z2.maxIndependent4kPgm }, { a: 6, p: 4 });
});
test('outputCapacity uses PGM for Analog Way, card-count for NovaStar, independent for X100/Universe', () => {
  assert.deepEqual(outputCapacity(getProcessor('aw-alta-zenith-100')), { value: 3, kind: 'pgm', assumed: false });
  assert.deepEqual(outputCapacity(getProcessor('aw-alta-zenith-200')), { value: 4, kind: 'pgm', assumed: false });
  assert.deepEqual(outputCapacity(getProcessor('ns-h9')), { value: 5, kind: 'card', assumed: true });   // 출력카드 5장(레이어자원×카드 아님)
  assert.deepEqual(outputCapacity(getProcessor('cl-x100pro-7u')), { value: 8, kind: 'independent', assumed: false });
  assert.deepEqual(outputCapacity(getProcessor('cl-universe-u6max')), { value: 10, kind: 'independent', assumed: false });
});

// ── SoT Test3: Zenith100 = FAIL, Zenith200 = 권장 (S-Box 4×4K) ────────────────
test('Zenith 100 fails S-Box 4×4K (PGM 3<4); Zenith 200 passes (PGM 4)', () => {
  const req = processorRequirements({ resW: 7680, resH: 4320 }, { application: 'auditorium' });  // 4×4K
  const z1 = validateProcessor(getProcessor('aw-alta-zenith-100'), req);
  assert.equal(findCheck(z1, '4K PGM 출력').ok, false);   // 3 < 4
  assert.equal(z1.verdict, 'FAIL');
  const z2 = validateProcessor(getProcessor('aw-alta-zenith-200'), req);
  assert.equal(findCheck(z2, '4K PGM 출력').ok, true);    // 4 >= 4
  assert.equal(z2.verdict, 'PASS');
  const ranked = rankProcessors(PROCESSORS, req);
  const z2r = ranked.find(r => r.proc.id === 'aw-alta-zenith-200');
  assert.equal(z2r.label, '권장');                        // 강당=Alta 최우선
  assert.ok(!ranked.some(r => r.proc.id === 'aw-alta-zenith-100' && r.label !== '부적합'));
});

// ── 지침6: Aquilon RS는 공식 PGM 값으로 정상 판정(PGM null 규칙 폐기). Active≠PGM ─
test('Aquilon RS uses official PGM (not null); RS output judged PASS/FAIL, Active not used as PGM', () => {
  const rs4 = getProcessor('aw-aquilon-rs4');
  assert.equal(rs4.outputs.maxIndependent4kPgm, 8);       // 공식 PGM
  assert.equal(rs4.outputs.maxActiveOutputs, 16);         // Active ≠ PGM
  const v = validateProcessor(rs4, processorRequirements({ resW: 7680, resH: 4320 }));  // 4×4K
  assert.equal(findCheck(v, '4K PGM 출력').ok, true);     // PGM 8 >= 4 → PASS(더 이상 CONDITIONAL 아님)
  assert.notEqual(v.verdict, 'CONDITIONAL');
});

// ── 지침4: X100 Window로 Capacity Fit PASS 가능(레이어 null이어도) ────────────
test('X100 Pro-7U: requiredWindows within maxWindows -> PASS (layers null not blocking)', () => {
  const x = getProcessor('cl-x100pro-7u');
  assert.equal(x.layers.maxWindows, 64);
  assert.equal(x.layers.maxLayers, 64);
  assert.equal(x.layers.perOutputCard4k, null);   // per-card 추정 금지
  const v = validateProcessor(x, processorRequirements({ resW: 3840, resH: 2160 }, { simultaneous4kLayers: 40, simultaneous2kLayers: 20 }));
  assert.equal(findCheck(v, '최대 윈도우').ok, true);   // 60 <= 64
  assert.equal(findCheck(v, '4K 레이어'), undefined);   // global_window엔 4K레이어 검사 없음
  assert.equal(findCheck(v, '4K 레이어(전역)'), undefined);
  const over = validateProcessor(x, processorRequirements({ resW: 3840, resH: 2160 }, { simultaneous4kLayers: 65 }));
  assert.equal(findCheck(over, '최대 윈도우').ok, false);  // 65 > 64
});
test('X100 Pro-7U independent 4K input 8 PASS / 9 FAIL; window separate', () => {
  const x = getProcessor('cl-x100pro-7u');
  assert.equal(x.inputs.maxIndependent4k, 8);
  const pass = validateProcessor(x, processorRequirements({ resW: 3840, resH: 2160 }, { independent4kInputs: 8 }));
  assert.equal(findCheck(pass, '독립 4K 입력').ok, true);
  const fail = validateProcessor(x, processorRequirements({ resW: 3840, resH: 2160 }, { independent4kInputs: 9 }));
  assert.equal(findCheck(fail, '독립 4K 입력').ok, false);
  assert.equal(fail.verdict, 'FAIL');
});

// ── 지침2: X100 출력보드 혼용 = 모델별(2U/4U/7U=false) ────────────────────────
test('X100 2U/4U/7U mixed 4K+2K output boards = false -> FAIL only when required', () => {
  const x = getProcessor('cl-x100pro-7u');
  assert.equal(x.outputBoardMixing.supportsMixed4k2kBoards, false);
  const noReq = validateProcessor(x, processorRequirements({ resW: 3840, resH: 2160 }));
  assert.equal(findCheck(noReq, '4K+2K 출력보드 혼용'), undefined);   // 요구 안 하면 검사 없음
  const req = validateProcessor(x, processorRequirements({ resW: 3840, resH: 2160 }, { requiredMixed4k2kOutput: true }));
  assert.equal(findCheck(req, '4K+2K 출력보드 혼용').ok, false);
  assert.equal(req.verdict, 'FAIL');
});

// ── Analog Way True A/B: 믹싱만(분할 대체 불가) ───────────────────────────────
test('AW True A/B uses mixing layer (fixture): mixing4/split8, need 8 -> FAIL', () => {
  const aw = { id: 'fx-aw', manufacturer: 'Analog Way', family: 'Alta', model: 'fx',
    inputs: { maxIndependent4k: 16 }, outputs: { maxIndependent4kPgm: 8 }, slots: {},
    layers: { model: 'mixing_split', mixing4k: 4, split4k: 8 }, canvas: {}, outputBoardMixing: {},
    switching: { trueABMixing: true }, features: {}, control: {} };
  const v = validateProcessor(aw, processorRequirements({ resW: 3840, resH: 2160 }, { simultaneous4kLayers: 8, trueABRequired: true }));
  assert.equal(findCheck(v, '4K 믹싱 레이어(A/B)').have, 4);
  assert.equal(findCheck(v, '4K 믹싱 레이어(A/B)').ok, false);
  assert.equal(v.verdict, 'FAIL');
});
test('AW without True A/B can use split capacity -> PASS (fixture)', () => {
  const aw = { id: 'fx-aw2', manufacturer: 'Analog Way', family: 'Alta', model: 'fx',
    inputs: { maxIndependent4k: 16 }, outputs: { maxIndependent4kPgm: 8 }, slots: {},
    layers: { model: 'mixing_split', mixing4k: 4, split4k: 8 }, canvas: {}, outputBoardMixing: {},
    switching: {}, features: {}, control: {} };
  const v = validateProcessor(aw, processorRequirements({ resW: 3840, resH: 2160 }, { simultaneous4kLayers: 8 }));
  assert.equal(findCheck(v, '4K 레이어(믹싱/분할)').have, 8);
  assert.equal(v.verdict, 'PASS');
});

// ── NovaStar per-output-card: 전역 OK지만 카드 초과 -> FAIL (fixture) ──────────
test('NovaStar per-card: global OK but a card exceeds -> FAIL (fixture)', () => {
  const ns = { id: 'fx-ns', manufacturer: 'NovaStar', family: 'H', model: 'fx',
    inputs: { maxIndependent4k: 16 }, outputs: {}, slots: { maxOutputBoards: 10 },
    layers: { model: 'per_output_card', perOutputCard4k: 4, perOutputCard2k: 16 }, canvas: {}, outputBoardMixing: {},
    switching: {}, features: {}, control: {} };
  const req = processorRequirements({ resW: 3840, resH: 2160 }, { simultaneous4kLayers: 20, maxLayersPerOutput: 5 });
  const v = validateProcessor(ns, req);
  assert.equal(findCheck(v, '4K 레이어').ok, true);              // 전역 4×10=40 >= 20
  assert.equal(findCheck(v, '출력카드별 4K 레이어').ok, false);  // 카드 한계 4 < 5
  assert.equal(v.verdict, 'FAIL');
});
test('NovaStar card 몰림: 5×4K FAIL, 4+4 분산 PASS (ns-h9)', () => {
  const ns = getProcessor('ns-h9');
  assert.equal(validateOutputCardLayers(ns, processorRequirements({ resW: 7680, resH: 2160 }, { perOutputCardDemand: [{ layers4k: 5 }] })).ok, false);
  assert.equal(validateOutputCardLayers(ns, processorRequirements({ resW: 7680, resH: 2160 }, { perOutputCardDemand: [{ layers4k: 4 }, { layers4k: 4 }] })).ok, true);
});
test('outputCardUsage2kEq engineeringRule 4K=4/DL=2/2K=1', () => {
  assert.equal(outputCardUsage2kEq({ layers4k: 3, layers2k: 4 }), 16);
  assert.equal(outputCardUsage2kEq({ layers4k: 4, layers2k: 1 }), 17);
  assert.equal(outputCardUsage2kEq({ layers4k: 2, layersDL: 3, layers2k: 2 }), 16);
});

// ── Universe: 전역 + per-board 둘 다 / U3 추가 / U15 per-board 4 ───────────────
test('U3 Max added: outputs 6, global4k 12, perBoard4k 4', () => {
  const u3 = getProcessor('cl-universe-u3max');
  assert.ok(u3);
  assert.deepEqual({ o: u3.outputs.maxIndependent4kOutputs, g: u3.layers.global4k, pb: u3.layers.perBoard4k, oB: u3.slots.maxOutputBoards }, { o: 6, g: 12, pb: 4, oB: 3 });
});
test('U3 Max board 몰림: global PASS but board 5>4 -> FAIL', () => {
  const u3 = getProcessor('cl-universe-u3max');
  const fail = validateOutputCardLayers(u3, processorRequirements({ resW: 7680, resH: 2160 }, { perOutputCardDemand: [{ layers4k: 5 }] }));
  assert.equal(fail.ok, false);   // 5×4=20 > 16
  const pass = validateOutputCardLayers(u3, processorRequirements({ resW: 7680, resH: 2160 }, { perOutputCardDemand: [{ layers4k: 4 }, { layers4k: 4 }] }));
  assert.equal(pass.ok, true);
});
test('U6 Max global 4K layer 20 PASS / 21 FAIL', () => {
  const u6 = getProcessor('cl-universe-u6max');
  assert.equal(findCheck(validateProcessor(u6, processorRequirements({ resW: 3840, resH: 2160 }, { simultaneous4kLayers: 20 })), '4K 레이어(전역)').ok, true);
  assert.equal(findCheck(validateProcessor(u6, processorRequirements({ resW: 3840, resH: 2160 }, { simultaneous4kLayers: 21 })), '4K 레이어(전역)').ok, false);
});
test('U15 Max perBoard4k = 4 (was null)', () => {
  assert.equal(getProcessor('cl-universe-u15max').layers.perBoard4k, 4);
});
test('Universe does NOT use 1:4 input-slot budget', () => {
  const v = validateProcessor(getProcessor('cl-universe-u9max'),
    processorRequirements({ resW: 3840, resH: 2160 }, { independent4kInputs: 10, independent2kInputs: 20 }));
  assert.equal(findCheck(v, '입력 슬롯'), undefined);
});

// ── NovaStar 4K 출력 = 카드수(레이어자원×카드 아님) ──────────────────────────
test('NovaStar 4K output uses card count (H9=5), labeled 가정', () => {
  const v = validateProcessor(getProcessor('ns-h9'), processorRequirements({ resW: 7680, resH: 4320 }));  // 4 out
  const c = findCheck(v, '4K 출력(카드 가정)');
  assert.ok(c); assert.equal(c.have, 5); assert.equal(c.ok, true);
});
test('inputsCapacity: NovaStar derived from slots.maxInputBoards; X100 explicit', () => {
  assert.deepEqual(inputsCapacity(getProcessor('ns-h9')), { max4k: 15, max2k: 60, slots: 15, assumed4k: true, assumed2k: true });
  assert.deepEqual(inputsCapacity(getProcessor('cl-x100pro-7u')), { max4k: 8, max2k: 32, slots: 8, assumed4k: false, assumed2k: false });
});
test('input slot budget: NovaStar H2 3×4K+4×2K fits 4, +8×2K over', () => {
  const h2 = getProcessor('ns-h2');
  assert.equal(findCheck(validateProcessor(h2, processorRequirements({ resW: 3840, resH: 2160 }, { independent4kInputs: 3, independent2kInputs: 4 })), '입력 슬롯').ok, true);
  assert.equal(findCheck(validateProcessor(h2, processorRequirements({ resW: 3840, resH: 2160 }, { independent4kInputs: 3, independent2kInputs: 8 })), '입력 슬롯').ok, false);
});

// ── 지침6: H20 = needs_verification, 자동추천 제외 ────────────────────────────
test('H20 kept as needs_verification and excluded from rankProcessors', () => {
  const h20 = getProcessor('ns-h20');
  assert.equal(h20.verification.status, 'needs_verification');
  const ranked = rankProcessors(PROCESSORS, processorRequirements({ resW: 7680, resH: 4320 }));
  assert.ok(!ranked.some(r => r.proc.id === 'ns-h20'));
  assert.ok(verificationPending(PROCESSORS).some(p => p.id === 'ns-h20'));
});

// ── 지침7: Cmini / RS alpha / RS5 추가 ───────────────────────────────────────
test('Aquilon Cmini / RS alpha / RS5 present with verified values', () => {
  const cmini = getProcessor('aw-aquilon-cmini');
  assert.equal(cmini.configurationType, 'customizable');
  assert.deepEqual({ a: cmini.outputs.maxActiveOutputs, p: cmini.outputs.maxIndependent4kPgm, m: cmini.layers.mixing4k }, { a: 12, p: 4, m: 4 });
  assert.ok(getProcessor('aw-aquilon-rsalpha'));
  assert.equal(getProcessor('aw-aquilon-rs5').inputs.maxIndependent4k, 32);
});

test('Aquilon C MAX present with official values (2026-09-14); 정격전력 미상 vs 최대 1500W 구분', () => {
  const cmax = getProcessor('aw-aquilon-cmax');
  assert.ok(cmax, 'aw-aquilon-cmax 없음');
  assert.equal(cmax.model, 'Aquilon C MAX');
  assert.equal(cmax.configurationType, 'customizable');
  assert.equal(cmax.inputs.maxIndependent4k, 32);
  assert.deepEqual(
    { a: cmax.outputs.maxActiveOutputs, p: cmax.outputs.maxIndependent4kPgm, m: cmax.layers.mixing4k, s: cmax.layers.split4k },
    { a: 24, p: 16, m: 16, s: 32 }
  );
  assert.equal(cmax.verification.status, 'official');
  // 출력 슬롯 6(공식 Technical Datasheet: 24×4K = 6카드×4채널. 웹페이지 '5 cards' 문구는 24출력과 불일치 → 데이터시트 6 적용, 2026-09-15)
  assert.strictEqual(cmax.slots.maxOutputBoards, 6);
  // 지침6: 정격전력 미상, 최대 1500W는 노트에 명시(추정으로 채우지 않음)
  assert.match(cmax.verification.notes, /정격전력=미상/);
  assert.match(cmax.verification.notes, /1,500W/);
  assert.match(cmax.verification.notes, /HDCP 1\.4·2\.2/);
});

test('Aquilon C / C+ 정식 등록(2026-09-15) — 입력/Active/PGM/레이어 구분값', () => {
  const c = getProcessor('aw-aquilon-c');
  assert.ok(c && c.model === 'Aquilon C');
  assert.equal(c.verification.status, 'official');
  assert.deepEqual(
    { i: c.inputs.maxIndependent4k, a: c.outputs.maxActiveOutputs, p: c.outputs.maxIndependent4kPgm, m: c.layers.mixing4k, s: c.layers.split4k },
    { i: 16, a: 16, p: 8, m: 8, s: 16 }
  );
  assert.match(c.verification.notes, /정격전력=미상/);   // 미상은 null·노트, 추정 금지
  assert.match(c.verification.notes, /최대 740W/);
  const cp = getProcessor('aw-aquilon-cplus');
  assert.ok(cp && cp.model === 'Aquilon C+');
  assert.deepEqual(
    { i: cp.inputs.maxIndependent4k, a: cp.outputs.maxActiveOutputs, p: cp.outputs.maxIndependent4kPgm, m: cp.layers.mixing4k, s: cp.layers.split4k },
    { i: 24, a: 20, p: 12, m: 12, s: 24 }
  );
});

// ── Wide Canvas (SoT §15, 지침 5): Eikos Edge-Blending 지원 / Pulse 미지원 ────────
test('Wide Canvas single_wide 2-output: Eikos PASS, Pulse unsupported (Edge-Blending 없음 -> false)', () => {
  const req = processorRequirements({ resW: 7680, resH: 2160 }, { canvasMode: 'single_wide', requiredCanvasOutputs: 2, application: 'exec' });
  const eikos = validateProcessor(getProcessor('aw-midra-eikos-4k'), req);
  assert.equal(findCheck(eikos, 'Wide Canvas').ok, true);
  const pulse = validateProcessor(getProcessor('aw-midra-pulse-4k'), req);
  assert.equal(getProcessor('aw-midra-pulse-4k').canvas.multiOutputCanvas, false);   // Pulse는 Edge-Blending 미지원
  assert.equal(findCheck(pulse, 'Wide Canvas').ok, false);   // 미지원 → FAIL
});

// ── Analog Way 공식 재검증(2026-09-13): Family / Active≠PGM≠Mixing / RS PGM / AUX / Alta ──
test('[AW] Alta 4K is a family (Zenith 100/200); no standalone "Alta" model is recommended', () => {
  const alta = PROCESSORS.filter(p => p.family === 'Alta 4K').map(p => p.model).sort();
  assert.deepEqual(alta, ['Zenith 100', 'Zenith 200']);
  // family 문자열이 제품(model)로 새어나오면 안 됨.
  assert.ok(!PROCESSORS.some(p => p.model === 'Alta' || p.model === 'Alta 4K'));
  const ranked = rankProcessors(PROCESSORS, processorRequirements({ resW: 7680, resH: 4320 }, { application: 'auditorium' }));
  assert.ok(!ranked.some(r => r.proc.model === 'Alta' || r.proc.model === 'Alta 4K'));   // 추천은 Zenith 100/200 단위
  assert.ok(ranked.some(r => r.proc.model === 'Zenith 200'));
});
test('[AW] Zenith 100: Active4/PGM3/mixing3/split6, 4×4K -> FAIL; Zenith 200: Active6/PGM4 -> PASS', () => {
  const z1 = getProcessor('aw-alta-zenith-100');
  assert.deepEqual({ act: z1.outputs.maxActiveOutputs, pgm: z1.outputs.maxIndependent4kPgm, mix: z1.layers.mixing4k, sp: z1.layers.split4k }, { act: 4, pgm: 3, mix: 3, sp: 6 });
  const req = processorRequirements({ resW: 7680, resH: 4320 });   // 4×4K
  assert.equal(validateProcessor(z1, req).verdict, 'FAIL');          // PGM 3 < 4
  const z2 = getProcessor('aw-alta-zenith-200');
  assert.deepEqual({ act: z2.outputs.maxActiveOutputs, pgm: z2.outputs.maxIndependent4kPgm }, { act: 6, pgm: 4 });
  assert.equal(findCheck(validateProcessor(z2, req), '4K PGM 출력').ok, true);   // PGM 4 >= 4
});
test('[AW] Aquilon RS1 PGM4: req 4 -> PASS, req 5 -> FAIL', () => {
  const rs1 = getProcessor('aw-aquilon-rs1');
  assert.deepEqual({ act: rs1.outputs.maxActiveOutputs, pgm: rs1.outputs.maxIndependent4kPgm }, { act: 8, pgm: 4 });
  assert.equal(findCheck(validateProcessor(rs1, processorRequirements({ resW: 3840, resH: 2160 }, { required4kOutputs: 4 })), '4K PGM 출력').ok, true);
  assert.equal(findCheck(validateProcessor(rs1, processorRequirements({ resW: 3840, resH: 2160 }, { required4kOutputs: 5 })), '4K PGM 출력').ok, false);
});
test('[AW] Aquilon RS2 PGM8: req 8 -> PASS, req 9 -> FAIL', () => {
  const rs2 = getProcessor('aw-aquilon-rs2');
  assert.deepEqual({ act: rs2.outputs.maxActiveOutputs, pgm: rs2.outputs.maxIndependent4kPgm }, { act: 12, pgm: 8 });
  assert.equal(findCheck(validateProcessor(rs2, processorRequirements({ resW: 3840, resH: 2160 }, { required4kOutputs: 8 })), '4K PGM 출력').ok, true);
  assert.equal(findCheck(validateProcessor(rs2, processorRequirements({ resW: 3840, resH: 2160 }, { required4kOutputs: 9 })), '4K PGM 출력').ok, false);
});
test('[AW] Aquilon RS4 keeps Active(16)/PGM(8)/Mixing(12) as three separate fields', () => {
  const rs4 = getProcessor('aw-aquilon-rs4');
  assert.equal(rs4.outputs.maxActiveOutputs, 16);
  assert.equal(rs4.outputs.maxIndependent4kPgm, 8);
  assert.equal(rs4.layers.mixing4k, 12);
  assert.equal(rs4.layers.split4k, 24);
  // 세 값이 서로 다른 개념 — 하나로 합쳐지지 않았는지.
  assert.notEqual(rs4.outputs.maxActiveOutputs, rs4.outputs.maxIndependent4kPgm);
  assert.notEqual(rs4.outputs.maxIndependent4kPgm, rs4.layers.mixing4k);
});
test('[AW] Aquilon RS AUX = scaled 4K60, main resources not used; Zenith AUX = 1080p60', () => {
  assert.deepEqual(getProcessor('aw-aquilon-rs4').aux, { maxResolution: '4K60', maxAuxOutputs: null, usesMainLayerResources: false });
  assert.equal(getProcessor('aw-alta-zenith-100').aux.maxResolution, '1080p60');
  assert.equal(getProcessor('aw-alta-zenith-200').aux.maxAuxOutputs, 4);
});
test('[AW] Pulse: 2×4K PGM (Matrix) + Mixer 1×AUX 1080p60; Eikos: 2-output wide canvas supported', () => {
  const pulse = getProcessor('aw-midra-pulse-4k');
  assert.equal(pulse.outputs.maxIndependent4kPgm, 2);          // Matrix: 2×4K PGM
  assert.deepEqual(pulse.aux, { maxResolution: '1080p60', maxAuxOutputs: 1, usesMainLayerResources: null });   // Mixer: 1×AUX. 메인자원 소모여부 미확인
  assert.equal(pulse.canvas.multiOutputCanvas, false);         // Edge-Blending 미지원
  const eikos = getProcessor('aw-midra-eikos-4k');
  assert.equal(eikos.canvas.multiOutputCanvas, true);          // Edge-Blending → 2출력 wide canvas
  assert.equal(eikos.canvas.maxCanvasOutputs, 2);
});
test('[AW] Eikos supports Matrix/Mixer/Edge; Pulse supports Matrix/Mixer but not Edge', () => {
  const eikos = getProcessor('aw-midra-eikos-4k'), pulse = getProcessor('aw-midra-pulse-4k');
  assert.deepEqual(eikos.modes, { matrix: true, mixer: true, edgeBlending: true });   // 3개 모두 지원
  assert.deepEqual(pulse.modes, { matrix: true, mixer: true, edgeBlending: false });  // Edge만 미지원
  // Matrix = 2 independent 4K PGM (둘 다 동일).
  assert.equal(eikos.outputs.maxIndependent4kPgm, 2);
  assert.equal(pulse.outputs.maxIndependent4kPgm, 2);
  // modes.edgeBlending 은 canvas.multiOutputCanvas 와 일관.
  assert.equal(eikos.modes.edgeBlending, eikos.canvas.multiOutputCanvas);
  assert.equal(pulse.modes.edgeBlending, pulse.canvas.multiOutputCanvas);
});
test('[AW] Pulse 4K = 1 S-Box 4K panel only: OK at <=3840x2160, FAIL when exceeded', () => {
  const pulse = getProcessor('aw-midra-pulse-4k');
  assert.equal(pulse.outputs.maxWallSbox4k, 1);   // 통합 벽 4K 1판만
  // 3840×2160(4K 1판): 출력 검사 통과.
  const ok = validateProcessor(pulse, processorRequirements({ resW: 3840, resH: 2160 }));
  assert.equal(findCheck(ok, '4K PGM 출력').ok, true);
  assert.notEqual(ok.verdict, 'FAIL');
  // 5760×1080(4K 2판 필요, 3840 초과): Pulse 사용 불가(FAIL).
  const over = validateProcessor(pulse, processorRequirements({ resW: 5760, resH: 1080 }));
  assert.equal(findCheck(over, '4K PGM 출력').have, 1);   // 2가 아니라 1로 상한
  assert.equal(findCheck(over, '4K PGM 출력').ok, false); // 1 < 2
  assert.equal(over.verdict, 'FAIL');
  // 7680×2160(4K 4판)도 당연히 FAIL.
  assert.equal(validateProcessor(pulse, processorRequirements({ resW: 7680, resH: 2160 })).verdict, 'FAIL');
});
test('[AW] Eikos not limited to 1 panel (2 PGM / edge-blending) — 5760x1080 passes output', () => {
  const eikos = getProcessor('aw-midra-eikos-4k');
  assert.equal(eikos.outputs.maxWallSbox4k, null);   // 별도 제한 없음
  const v = validateProcessor(eikos, processorRequirements({ resW: 5760, resH: 1080 }));  // 2판
  assert.equal(findCheck(v, '4K PGM 출력').ok, true);  // 2 >= 2
});
test('[AW] Eikos wide-canvas job ranks Eikos above Pulse (Operation Fit boost)', () => {
  const req = processorRequirements({ resW: 7680, resH: 2160 }, { canvasMode: 'single_wide', requiredCanvasOutputs: 2, application: 'exec' });
  const ranked = rankProcessors(PROCESSORS, req);
  const ei = ranked.findIndex(r => r.proc.id === 'aw-midra-eikos-4k');
  const pu = ranked.findIndex(r => r.proc.id === 'aw-midra-pulse-4k');
  assert.ok(ei >= 0 && pu >= 0 && ei < pu, 'Eikos가 Pulse보다 상위');
});

test('[AW] Zenith 100/200 support Hard/Soft Edge (wide canvas); Z200=6중 4출력, Z100 출력수 미확인', () => {
  for (const id of ['aw-alta-zenith-100', 'aw-alta-zenith-200']) {
    const c = getProcessor(id).canvas;
    assert.equal(c.multiOutputCanvas, true);
    assert.equal(c.horizontalSpan, true);
    assert.equal(c.verticalSpan, true);
  }
  assert.equal(getProcessor('aw-alta-zenith-200').canvas.maxCanvasOutputs, 4);   // 6 Active 중 4출력만 edge-blend(이사 확인 2026-09-15)
  assert.equal(getProcessor('aw-alta-zenith-100').canvas.maxCanvasOutputs, null); // Z100 결합 출력수 미확인 → 추정 금지
});
test('[AW] confirmed total input counts; Aquilon RS AUX not-main-resource, Zenith AUX main-resource unknown', () => {
  assert.equal(getProcessor('aw-alta-zenith-100').inputs.total, 13);
  assert.equal(getProcessor('aw-alta-zenith-200').inputs.total, 16);
  assert.equal(getProcessor('aw-aquilon-rs1').inputs.total, 16);
  assert.equal(getProcessor('aw-aquilon-rs4').inputs.total, 24);
  assert.equal(getProcessor('aw-aquilon-rs1').aux.usesMainLayerResources, false);   // RS: 공식 확인
  assert.equal(getProcessor('aw-alta-zenith-100').aux.usesMainLayerResources, null); // Zenith: 미확인(추정 금지)
});

// ── UNKNOWN(null) 원칙: 요구되면 CONDITIONAL, 요구 없으면 PASS 방해 안 함 (C mini split4k=null) ──
test('[UNKNOWN] C mini split4k=null: no split requirement -> not forced CONDITIONAL', () => {
  const cm = getProcessor('aw-aquilon-cmini');
  assert.equal(cm.layers.split4k, null);
  // 필요 4K출력 1(3840×2160), split 요구 없음 → split4k=null이 PASS를 막지 않아야 함.
  const v = validateProcessor(cm, processorRequirements({ resW: 3840, resH: 2160 }));
  assert.equal(findCheck(v, '4K 레이어(믹싱/분할)'), undefined);   // split 검사 자체 없음
  assert.equal(v.verdict, 'PASS');
});
test('[UNKNOWN] C mini split4k=null: split required -> CONDITIONAL (not PASS via mixing fallback, not FAIL)', () => {
  const cm = getProcessor('aw-aquilon-cmini');
  const v = validateProcessor(cm, processorRequirements({ resW: 3840, resH: 2160 }, { simultaneous4kLayers: 4 }));
  const c = findCheck(v, '4K 레이어(믹싱/분할)');
  assert.equal(c.have, null);        // split4k=null → mixing4k(4)로 대체하지 않음
  assert.equal(c.ok, null);          // UNKNOWN
  assert.equal(v.verdict, 'CONDITIONAL');   // PASS 아님, FAIL 아님
});
test('[UNKNOWN] null !== false and null !== PASS (fixture: required feature unknown -> CONDITIONAL)', () => {
  const cm = getProcessor('aw-aquilon-cmini');
  // split4k=null이 known 값으로 채워졌다고 가정하면 PASS가 되는지 대조(원칙 확인).
  const known = { ...cm, layers: { ...cm.layers, split4k: 6 } };
  assert.equal(validateProcessor(known, processorRequirements({ resW: 3840, resH: 2160 }, { simultaneous4kLayers: 4 })).verdict, 'PASS');
  const fewer = { ...cm, layers: { ...cm.layers, split4k: 3 } };
  assert.equal(validateProcessor(fewer, processorRequirements({ resW: 3840, resH: 2160 }, { simultaneous4kLayers: 4 })).verdict, 'FAIL');
});

// ── Operation Fit: 공간 5종 성향 ─────────────────────────────────────────────
test('operationFit preferred by application', () => {
  assert.equal(operationFit(getProcessor('aw-alta-zenith-200'), processorRequirements({ resW: 3840, resH: 2160 }, { application: 'auditorium' })).preferred, true);  // 강당=Alta 최우선
  assert.equal(operationFit(getProcessor('cl-x100pro-7u'), processorRequirements({ resW: 3840, resH: 2160 }, { application: 'control_room' })).preferred, true);   // 상황실=X100 최우선
  assert.equal(operationFit(getProcessor('ns-h9'), processorRequirements({ resW: 3840, resH: 2160 }, { application: 'exec' })).preferred, false);                  // 중역회의실에 NovaStar 아님
});
test('control_room 5760x1080: X100 권장, Eikos 통과(한계 구성)', () => {
  const req = processorRequirements({ resW: 5760, resH: 1080 }, { application: 'control_room' });
  const ranked = rankProcessors(PROCESSORS, req);
  const x = ranked.find(r => r.proc.id === 'cl-x100pro-7u');
  const eikos = ranked.find(r => r.proc.id === 'aw-midra-eikos-4k');
  assert.equal(x.label, '권장');            // 상황실=X100 최우선 + 출력 8>=2
  assert.equal(eikos.label, '한계 구성');   // AW는 상황실 preferred 아님 + PGM 2==2 딱맞음
  assert.notEqual(eikos.label, '부적합');
});

// ── UNKNOWN → CONDITIONAL, null은 auto-PASS 아님 ─────────────────────────────
test('unknown required feature -> CONDITIONAL', () => {
  const v = validateProcessor(getProcessor('cl-x100pro-7u'), processorRequirements({ resW: 3840, resH: 2160 }, { independent4kInputs: 4, seamlessSwitching: true }));
  assert.equal(findCheck(v, 'Seamless 스위칭').ok, null);
  assert.equal(v.verdict, 'CONDITIONAL');
});
test('output capacity null never auto-PASS (fixture no output)', () => {
  const fx = { id: 'fx-noout', manufacturer: 'X', family: 'X', model: 'fx',
    inputs: {}, outputs: {}, slots: {}, layers: { model: 'mixing_split' }, canvas: {}, outputBoardMixing: {}, switching: {}, features: {}, control: {} };
  const v = validateProcessor(fx, processorRequirements({ resW: 7680, resH: 4320 }));
  assert.equal(findCheck(v, '4K PGM 출력').ok, null);
  assert.notEqual(v.verdict, 'PASS');
});

// ── [Test A] FHD 대체 topology 후보가 요구사양에 실려온다 ─────────────────────
test('[A] 5760x1080 -> req.sboxTopologies has UHD(4K 2) and FHD(2K 3) candidates', () => {
  const req = processorRequirements({ resW: 5760, resH: 1080 });
  const labels = req.sboxTopologies.map(t => t.label);
  assert.ok(labels.includes('UHD 중심'));
  assert.ok(labels.includes('FHD 중심'));
  assert.equal(req.sboxTopologies.find(t => t.label === 'UHD 중심').required4kOutputs, 2);
  assert.equal(req.sboxTopologies.find(t => t.label === 'FHD 중심').required2kOutputs, 3);
});

// ── [Test B] 두 topology가 실제 판정에 연결된다(X100 Pro) ─────────────────────
test('[B] 5760x1080 + X100 Pro: UHD & FHD topology both evaluated; FHD(2K) passes via maxIndependent2k', () => {
  const req = processorRequirements({ resW: 5760, resH: 1080 });
  const x = getProcessor('cl-x100pro-7u');   // 4K 8 / 2K 32
  const v = validateProcessor(x, req);
  const uhd = v.topologyResults.find(t => t.label === 'UHD 중심');
  const fhd = v.topologyResults.find(t => t.label === 'FHD 중심');
  assert.ok(uhd && fhd, 'both topology results present');
  assert.equal(uhd.ok, true);   // 4K 출력 8 >= 2
  assert.equal(fhd.ok, true);   // 2K 출력 32 >= 3
  assert.ok(v.passedTopologies.includes('UHD 중심') && v.passedTopologies.includes('FHD 중심'));
});
test('[B2] FHD-only capable device passes via FHD topology when UHD 4K output unknown', () => {
  // 2K 출력만 정의된 가상 제품: UHD(4K PGM null) 미확인이지만 FHD(2K) 후보로 PASS 가능.
  const fx = { id: 'fx-2konly', manufacturer: 'X', family: 'X', model: 'fx',
    inputs: { maxIndependent4k: 8 }, outputs: { maxIndependent4kPgm: null, maxIndependent2k: 8 },
    slots: {}, layers: { model: 'global_window', maxWindows: 16 }, canvas: {}, outputBoardMixing: {},
    switching: {}, features: {}, control: {}, verification: { status: 'official' } };
  const req = processorRequirements({ resW: 5760, resH: 1080 });   // UHD 2×4K / FHD 3×2K
  const v = validateProcessor(fx, req);
  const out = v.checks.find(c => c.name === '2K 출력' || c.name.startsWith('4K'));
  assert.equal(out.ok, true);                       // 하나라도 PASS(FHD 2K 8>=3) → 출력 OK
  assert.ok(v.passedTopologies.includes('FHD 중심'));
});
test('[B3] unknown FHD alternative must NOT rescue a real UHD fail (Zenith100 stays FAIL)', () => {
  const req = processorRequirements({ resW: 7680, resH: 4320 });   // UHD 4×4K, FHD 16×2K
  const z1 = validateProcessor(getProcessor('aw-alta-zenith-100'), req);  // PGM 3, 2K출력 null
  assert.equal(findCheck(z1, '4K PGM 출력').ok, false);   // UHD 확정 미달(3<4)
  assert.equal(z1.verdict, 'FAIL');                       // 미확인 FHD가 되살리지 않음
});

// ── [Test C] 소형(4K출력≤2)에서 Aquilon은 후순위지만 후보에서 삭제되지 않는다 ──
test('[C] Aquilon kept (not hard-hidden) on small jobs, but ranked low without high-end needs', () => {
  const req = processorRequirements({ resW: 3840, resH: 2160 });   // 1×4K 소형
  const ranked = rankProcessors(PROCESSORS, req);
  const cmini = ranked.find(r => r.proc.id === 'aw-aquilon-cmini');
  assert.ok(cmini, 'Cmini는 후보에서 완전히 삭제되지 않음');
  // 소형·단순 → 페널티로 후순위(다른 제품이 위에 있음).
  assert.ok(ranked.some(r => r.proc.family !== 'Aquilon' && ranked.indexOf(r) < ranked.indexOf(cmini)));
});

// ── [Test D] 같은 4×4K 강당: 확장/이중화 요구 유무로 Zenith200 ↔ Cmini 우선 역전 ─
test('[D] auditorium 4x4K: no expansion -> Zenith200 first; expansion+redundancy -> Cmini rises above Zenith200', () => {
  const base = { resW: 7680, resH: 4320 };
  const plain = rankProcessors(PROCESSORS, processorRequirements(base, { application: 'auditorium' }));
  const zi = plain.findIndex(r => r.proc.id === 'aw-alta-zenith-200');
  const ci = plain.findIndex(r => r.proc.id === 'aw-aquilon-cmini');
  assert.ok(zi >= 0 && ci >= 0);
  assert.ok(zi < ci, '고급요구 없으면 Zenith 200이 Cmini보다 우선');

  const hi = rankProcessors(PROCESSORS, processorRequirements(base, { application: 'auditorium', expansionRequired: true, redundancyRequired: true }));
  const zi2 = hi.findIndex(r => r.proc.id === 'aw-alta-zenith-200');
  const ci2 = hi.findIndex(r => r.proc.id === 'aw-aquilon-cmini');
  assert.ok(zi2 >= 0 && ci2 >= 0);
  assert.ok(ci2 < zi2, '확장+이중화 요구면 Cmini가 Zenith 200보다 우선(가능)');
});

// ── [Test E] verification 미검증 제품은 기본 자동추천에서 제외(강등 메커니즘 검증) ──
test('[E] needs_verification excludes from rankProcessors; Alta Zenith kept official (owner decision)', () => {
  // 오너 결정: Alta(Zenith)는 이사 제공 데이터시트 근거로 official 유지 → 자동추천 포함.
  assert.equal(getProcessor('aw-alta-zenith-200').verification.status, 'official');
  assert.ok(rankProcessors(PROCESSORS, processorRequirements({ resW: 7680, resH: 4320 }, { application: 'auditorium' }))
    .some(r => r.proc.id === 'aw-alta-zenith-200'));
  // 메커니즘: 어떤 제품이든 needs_verification이면 기본 추천에서 빠지고 verificationPending에만 노출.
  const fx = { ...getProcessor('aw-alta-zenith-200'), id: 'fx-unverified', verification: { status: 'needs_verification' } };
  const ranked = rankProcessors([...PROCESSORS, fx], processorRequirements({ resW: 7680, resH: 4320 }, { application: 'auditorium' }));
  assert.ok(!ranked.some(r => r.proc.id === 'fx-unverified'));
  assert.ok(verificationPending([...PROCESSORS, fx]).some(p => p.id === 'fx-unverified'));
});

// ── rankProcessors: FAIL/부적합은 뒤로 ───────────────────────────────────────
test('rankProcessors: 부적합은 뒤로, 대용량 입력요구 걸러짐', () => {
  const req = processorRequirements({ resW: 7680, resH: 4320 }, { independent4kInputs: 30 });
  const ranked = rankProcessors(PROCESSORS, req);
  const x7u = ranked.find(r => r.proc.id === 'cl-x100pro-7u');
  assert.equal(x7u.label, '부적합');   // 독립 4K 입력 8 < 30
});

// ── Midra 레이어 / U9 공식값 유지 ────────────────────────────────────────────
test('Midra Pulse/Eikos: mixing 2 / split 4', () => {
  for (const id of ['aw-midra-pulse-4k', 'aw-midra-eikos-4k']) {
    const p = getProcessor(id);
    assert.equal(p.layers.mixing4k, 2); assert.equal(p.layers.split4k, 4);
  }
});
test('U9 Max official I/O + per-board', () => {
  const u9 = getProcessor('cl-universe-u9max');
  assert.deepEqual(
    { i4: u9.inputs.maxIndependent4k, o4: u9.outputs.maxIndependent4kOutputs, g4: u9.layers.global4k, pb4: u9.layers.perBoard4k },
    { i4: 36, o4: 20, g4: 40, pb4: 4 });
});

// ── validateBuild ────────────────────────────────────────────────────────────
test('validateBuild: X100 7U 5760x1080 출력2장 PASS, 1장 FAIL, 9장 섀시초과 FAIL', () => {
  const x = getProcessor('cl-x100pro-7u');
  const req = processorRequirements({ resW: 5760, resH: 1080 });   // 4K 출력 2
  assert.equal(validateBuild(x, req, { out4kCards: 2, in2kPorts: 12 }).verdict, 'PASS');
  assert.equal(validateBuild(x, req, { out4kCards: 1 }).verdict, 'FAIL');
  assert.equal(validateBuild(x, req, { out4kCards: 9 }).verdict, 'FAIL');   // 섀시 8 초과
});

// ── 단종/무결성 ──────────────────────────────────────────────────────────────
test('discontinued Midra removed; Pulse/Eikos remain (family = Midra 4K)', () => {
  const midra = PROCESSORS.filter(p => p.family === 'Midra 4K').map(p => p.model).sort();
  assert.deepEqual(midra, ['Eikos 4K', 'Pulse 4K']);
});
// ── 슬롯·카드 구성(cardPlan) — 요청 2026-09-15 ────────────────────────────────
test('cardPlan: 제품군별 카드당 4K 채널이 데이터에 명시되어 있다', () => {
  const per = (id) => PROCESSORS.find(p => p.id === id).cards;
  assert.deepEqual(per('aw-aquilon-c'),    { in4kPerCard: 4, out4kPerCard: 4 });   // Aquilon 4/4
  assert.deepEqual(per('aw-aquilon-cplus'),{ in4kPerCard: 4, out4kPerCard: 4 });
  assert.deepEqual(per('cl-universe-u6max'),{ in4kPerCard: 2, out4kPerCard: 2 });  // Universe U 2/2(HDMI)
  assert.deepEqual(per('cl-x100pro-7u'),   { in4kPerCard: 1, out4kPerCard: 1 });   // X100 Pro 1/1
  assert.deepEqual(per('ns-h5'),           { in4kPerCard: 1, out4kPerCard: 1 });   // NovaStar H 1/1
});
test('cardPlan: 필요 카드 수 = ceil(요구 / 카드당 채널)', () => {
  const x = PROCESSORS.find(p => p.id === 'cl-x100pro-7u');   // 1/1, 슬롯 8/8
  const cp = cardPlan(x, { independent4kInputs: 6, required4kOutputs: 5 });
  assert.equal(cp.reqInCards, 6);   // 6/1
  assert.equal(cp.reqOutCards, 5);  // 5/1
  assert.equal(cp.remInSlots, 2);   // 8-6
  assert.equal(cp.remOutSlots, 3);  // 8-5
  const u = PROCESSORS.find(p => p.id === 'cl-universe-u6max');   // 2/2, 슬롯 10/5
  const cu = cardPlan(u, { independent4kInputs: 5, required4kOutputs: 6 });
  assert.equal(cu.reqInCards, 3);   // ceil(5/2)
  assert.equal(cu.reqOutCards, 3);  // ceil(6/2)
  assert.equal(cu.remOutSlots, 2);  // 5-3
});
test('cardPlan: 최대 구성 가능 4K 채널(maxIn4k/maxOut4k)', () => {
  const req = { independent4kInputs: 6, required4kOutputs: 5 };
  const cp = (id) => cardPlan(PROCESSORS.find(p => p.id === id), req);
  assert.deepEqual([cp('aw-aquilon-c').maxIn4k, cp('aw-aquilon-c').maxOut4k], [16, 16]);   // 공식 독립4K
  assert.deepEqual([cp('cl-x100pro-7u').maxIn4k, cp('cl-x100pro-7u').maxOut4k], [8, 8]);
  assert.deepEqual([cp('cl-universe-u6max').maxIn4k, cp('cl-universe-u6max').maxOut4k], [20, 10]);
  assert.deepEqual([cp('ns-h5').maxIn4k, cp('ns-h5').maxOut4k], [10, 3]);   // 슬롯수×카드당채널(입력 empty→유도)
});
test('cardPlan: 슬롯 수 미상이면 남는 슬롯도 미상(null), 요구 0이면 카드 0', () => {
  // 합성 모델: 카드당 채널은 알지만 슬롯 수 미상(현재 등록 모델은 모두 슬롯이 채워져 있어 합성으로 검증).
  const synth = { cards: { in4kPerCard: 4, out4kPerCard: 4 }, slots: {} };
  const cp = cardPlan(synth, { independent4kInputs: 6, required4kOutputs: 5 });
  assert.equal(cp.reqInCards, 2);      // ceil(6/4)
  assert.equal(cp.reqOutCards, 2);     // ceil(5/4)
  assert.equal(cp.inSlots, null);
  assert.equal(cp.remInSlots, null);   // 슬롯 미상 → 남는 슬롯 미상
  const zero = cardPlan(synth, { independent4kInputs: 0, required4kOutputs: 3 });
  assert.equal(zero.reqInCards, 0);    // 입력 요구 0 → 0장
  assert.equal(zero.reqOutCards, 1);
});
test('cardPlan: 고정형(Midra·Zenith)은 cardBased=false(카드 개념 없음)', () => {
  const eikos = PROCESSORS.find(p => p.id === 'aw-midra-eikos-4k');
  const zen = PROCESSORS.find(p => p.id === 'aw-alta-zenith-100');
  assert.equal(cardPlan(eikos, { required4kOutputs: 2 }).cardBased, false);
  assert.equal(cardPlan(zen, { required4kOutputs: 2 }).cardBased, false);
});
// ── Aquilon RS 커넥터 구성(2026-09-15, 이사 확정 데이터) ──────────────────────
test('Aquilon RS: 입력 커넥터 합 = 4K 입력 채널 수(교차 검증)', () => {
  const rs = PROCESSORS.filter(p => /aw-aquilon-rs/.test(p.id));
  assert.equal(rs.length, 7);
  for (const p of rs) {
    const i = p.inputs;
    const sum = (i.hdmi20 || 0) + (i.dp12 || 0) + (i.sdi12g || 0);
    assert.equal(sum, i.maxIndependent4k, `${p.model}: 커넥터 합 ${sum} ≠ 4K 입력 ${i.maxIndependent4k}`);
    assert.equal(p.outputs.maxActiveOutputs, p.outputs.maxIndependent4kOutputs, `${p.model}: Active`);
    assert.equal(p.outputs.dedicatedMultiviewer, 2, `${p.model}: 전용 멀티뷰어 2(별도)`);
    assert.equal(p.configurationType, 'preconfigured');   // 고정형(슬롯 아님)
    assert.equal(p.fieldSwappableCards, true);
  }
});
test('Aquilon RS: 모델별 커넥터 확정값(HDMI2.0/DP1.2/12G-SDI)', () => {
  const g = id => PROCESSORS.find(p => p.id === id).inputs;
  const c = i => [i.hdmi20 || 0, i.dp12 || 0, i.sdi12g || 0];
  assert.deepEqual(c(g('aw-aquilon-rsalpha')), [8, 0, 0]);
  assert.deepEqual(c(g('aw-aquilon-rs1')), [8, 4, 4]);
  assert.deepEqual(c(g('aw-aquilon-rs2')), [8, 4, 4]);
  assert.deepEqual(c(g('aw-aquilon-rs3')), [12, 8, 4]);
  assert.deepEqual(c(g('aw-aquilon-rs4')), [12, 8, 4]);
  assert.deepEqual(c(g('aw-aquilon-rs5')), [16, 8, 8]);
  assert.deepEqual(c(g('aw-aquilon-rs6')), [16, 8, 8]);
});
// ── X100 Pro 11U 정식 등록(2026-09-15, 공식 Spec V1.1/V1.2) ────────────────────
test('X100 Pro 11U: 보드×카드당채널 = 채널 수 교차 검증', () => {
  const p = PROCESSORS.find(x => x.id === 'cl-x100pro-11u');
  assert.equal(p.verification.status, 'official');   // 더 이상 needs_verification 아님
  assert.equal(p.slots.maxInputBoards, 16);
  assert.equal(p.slots.maxOutputBoards, 18);
  assert.equal(p.inputs.maxIndependent4k, 16);   // 16보드 × 1
  assert.equal(p.inputs.maxIndependent2k, 64);   // 16보드 × 4
  assert.equal(p.outputs.maxIndependent4kOutputs, 18);   // 18보드 × 1
  assert.equal(p.outputs.maxIndependent2k, 72);  // 18보드 × 4
  assert.equal(p.outputs.maxIndependent4kPgm, null);   // PGM 미상(독립출력≠PGM)
  assert.equal(p.layers.global2k, 92);   // 최대 레이어 2K
  assert.equal(p.layers.global4k, 23);   // 최대 레이어 4K
  assert.equal(p.layers.maxWindows, null);   // 윈도우 미상(≠레이어)
  assert.equal(p.outputBoardMixing.supportsMixed4k2kBoards, true);
  assert.equal(p.switching.seamless, null);   // 미확인
  assert.equal(p.switching.trueABMixing, null);
});
test('X100 Pro 11U: 자동추천 대상(needs_verification 제외 아님)', () => {
  const req = processorRequirements({ resW: 7680, resH: 2160 });   // 2×4K 출력
  const ranked = rankProcessors(PROCESSORS, req);
  assert.ok(ranked.some(r => r.proc.id === 'cl-x100pro-11u'), '11U가 추천 목록에 포함');
});
// ── Aquilon C 라인 슬롯 수(2026-09-15, 공식 확정) ─────────────────────────────
test('Aquilon C 라인: 슬롯 수 + 카드×채널 교차 검증', () => {
  const chk = (id, inSlot, outSlot, in4k, act) => {
    const p = PROCESSORS.find(x => x.id === id);
    assert.equal(p.slots.maxInputBoards, inSlot, `${p.model} 입력슬롯`);
    assert.equal(p.slots.maxOutputBoards, outSlot, `${p.model} 출력슬롯`);
    assert.equal(inSlot * p.cards.in4kPerCard, in4k, `${p.model} 입력 카드×채널=${in4k}`);
    assert.equal(outSlot * p.cards.out4kPerCard, act, `${p.model} 출력 카드×채널=${act}`);
    assert.equal(p.inputs.maxIndependent4k, in4k);
    assert.equal(p.outputs.maxActiveOutputs, act);
  };
  chk('aw-aquilon-c', 4, 4, 16, 16);       // 4·4 슬롯 → 16 입력 / 16 Active
  chk('aw-aquilon-cplus', 6, 5, 24, 20);   // 6·5 슬롯 → 24 입력 / 20 Active
  chk('aw-aquilon-cmax', 8, 6, 32, 24);    // 8·6 슬롯 → 32 입력 / 24 Active
});
// ── Edge-Blending(와이드 캔버스) 데이터 ───────────────────────────────────────
test('Edge-Blending: Pulse 미지원 / Eikos 2출력 / Zenith200 6중 4출력', () => {
  const g = id => PROCESSORS.find(p => p.id === id);
  assert.equal(g('aw-midra-pulse-4k').canvas.multiOutputCanvas, false);   // Pulse 미지원
  assert.equal(g('aw-midra-pulse-4k').modes.edgeBlending, false);
  assert.equal(g('aw-midra-eikos-4k').canvas.maxCanvasOutputs, 2);        // Eikos 2출력
  const z2 = g('aw-alta-zenith-200');
  assert.equal(z2.canvas.multiOutputCanvas, true);
  assert.equal(z2.canvas.maxCanvasOutputs, 4);   // 6 Active 중 4출력만 edge-blend(이사 확인)
  assert.equal(z2.outputs.maxActiveOutputs, 6);
});
test('every processor has valid layer model / status / unique id', () => {
  const valid = new Set(['mixing_split', 'per_output_card', 'global_window', 'screen_group']);
  const ids = new Set();
  for (const p of PROCESSORS) {
    assert.ok(p.id && !ids.has(p.id), `unique id: ${p.id}`); ids.add(p.id);
    assert.ok(valid.has(p.layers.model), `${p.id} layer model`);
    assert.ok(['official', 'partial_official', 'needs_verification'].includes(p.verification.status), `${p.id} status`);
  }
});
