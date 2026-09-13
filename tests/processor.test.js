import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  processorRequirements, validateOutputCardLayers, regionTiles,
  outputCardUsage2kEq, outputCapacity, inputsCapacity, buildSboxTopologies,
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

// ── 지침5: Aquilon RS PGM null → S-Box 판정 CONDITIONAL(FAIL 아님) ─────────────
test('Aquilon RS PGM null -> output check CONDITIONAL, not FAIL; Active not used as PGM', () => {
  const rs4 = getProcessor('aw-aquilon-rs4');
  assert.equal(rs4.outputs.maxIndependent4kPgm, null);
  assert.equal(rs4.outputs.maxActiveOutputs, 16);
  const v = validateProcessor(rs4, processorRequirements({ resW: 7680, resH: 4320 }));  // 4 out
  assert.equal(findCheck(v, '4K PGM 출력').ok, null);     // PGM 미확인
  assert.notEqual(v.verdict, 'FAIL');
  assert.equal(v.verdict, 'CONDITIONAL');
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

// ── Wide Canvas (SoT §15): Eikos 지원 / Pulse 미확인 ─────────────────────────
test('Wide Canvas single_wide 2-output: Eikos PASS, Pulse CONDITIONAL(null)', () => {
  const req = processorRequirements({ resW: 7680, resH: 2160 }, { canvasMode: 'single_wide', requiredCanvasOutputs: 2, application: 'exec' });
  const eikos = validateProcessor(getProcessor('aw-midra-eikos-4k'), req);
  assert.equal(findCheck(eikos, 'Wide Canvas').ok, true);
  const pulse = validateProcessor(getProcessor('aw-midra-pulse-4k'), req);
  assert.equal(findCheck(pulse, 'Wide Canvas').ok, null);   // canvas 미확인 → CONDITIONAL
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

// ── 소형(4K출력≤2) Aquilon 숨김 ──────────────────────────────────────────────
test('Aquilon hidden when required 4K outputs <= 2, shown >= 3', () => {
  const has = list => list.some(r => r.proc.family === 'Aquilon');
  assert.equal(has(rankProcessors(PROCESSORS, processorRequirements({ resW: 3840, resH: 2160 }))), false);
  assert.equal(has(rankProcessors(PROCESSORS, processorRequirements({ resW: 7680, resH: 2160 }))), false);
  assert.equal(has(rankProcessors(PROCESSORS, processorRequirements({ resW: 7680, resH: 4320 }))), true);
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
test('discontinued Midra removed; Pulse/Eikos remain', () => {
  const midra = PROCESSORS.filter(p => p.family === 'Midra').map(p => p.model).sort();
  assert.deepEqual(midra, ['Eikos 4K', 'Pulse 4K']);
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
