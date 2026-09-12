import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  processorRequirements, validateProcessor, validateOutputCardLayers, rankProcessors, regionTiles,
  outputCardUsage2kEq, outputs4kCapacity, inputsCapacity,
} from '../src/engine.js';
import { PROCESSORS, getProcessor } from '../src/processors.js';

// 판정 결과에서 특정 검사 항목을 찾는 헬퍼.
const findCheck = (v, name) => v.checks.find(c => c.name === name);

// ── 문서 §12: LED 출력 요구량 (required 4K output) ──────────────────────────────
test('required 4K outputs: 3840x2160 -> 1', () => {
  const req = processorRequirements({ resW: 3840, resH: 2160 });
  assert.equal(req.required4kOutputs, 1);
});
test('required 4K outputs: 7680x2160 -> 2', () => {
  const req = processorRequirements({ resW: 7680, resH: 2160 });
  assert.equal(req.required4kOutputs, 2);
});
test('required 4K outputs: 7680x4320 -> 4', () => {
  const req = processorRequirements({ resW: 7680, resH: 4320 });
  assert.equal(req.required4kOutputs, 4);
});
test('regionTiles handles invalid input as null', () => {
  assert.equal(regionTiles(0, 2160, 3840, 2160), null);
  assert.equal(regionTiles(3841, 2160, 3840, 2160), 2);
});

// ── 문서 §13: S-Box 이중화가 프로세서 출력을 2배로 만들지 않는다 ────────────────
test('SBOX redundancy does NOT double processor output requirement', () => {
  const base = processorRequirements({ resW: 7680, resH: 2160 });
  const withRedundancy = processorRequirements({ resW: 7680, resH: 2160, redundancy: true });
  assert.equal(base.required4kOutputs, 2);
  assert.equal(withRedundancy.required4kOutputs, 2);   // 여전히 2 (×2 아님)
});

// ── 문서 §6 / §4: Colorlight X100 Pro 독립 4K 입력 한계 ─────────────────────────
test('X100 Pro 7U: 4K source 8 -> PASS, 9 -> FAIL (input capacity)', () => {
  const x = getProcessor('cl-x100pro-7u');
  assert.ok(x, 'X100 Pro 7U present');
  const pass = validateProcessor(x, processorRequirements({ resW: 3840, resH: 2160 }, { independent4kInputs: 8 }));
  const in8 = findCheck(pass, '독립 4K 입력');
  assert.equal(in8.ok, true);
  const fail = validateProcessor(x, processorRequirements({ resW: 3840, resH: 2160 }, { independent4kInputs: 9 }));
  assert.equal(findCheck(fail, '독립 4K 입력').ok, false);
  assert.equal(fail.verdict, 'FAIL');
});
test('X100 Pro: max window is separate from 4K input count (문서 §4)', () => {
  const x = getProcessor('cl-x100pro-7u');
  // 윈도우는 64까지 되지만 독립 4K 입력은 8이 상한.
  assert.equal(x.layers.maxWindows, 64);
  assert.equal(x.inputs.maxIndependent4k, 8);
});

// ── 문서 §12: Analog Way True A/B는 믹싱 레이어를 사용(분할로 대체 불가) ──────────
test('Analog Way True A/B: need 8 4K layers, mixing 4 / split 8 -> FAIL', () => {
  const aw = {
    id: 'fx-aw', manufacturer: 'Analog Way', family: 'Alta', model: 'fixture',
    inputs: { maxIndependent4k: 16 }, outputs: { max4k: 8 },
    layers: { model: 'mixing_split', mixing4k: 4, split4k: 8 },
    switching: { trueABMixing: true, seamless: true },
    features: {}, control: {},
  };
  const req = processorRequirements({ resW: 3840, resH: 2160 }, { simultaneous4kLayers: 8, trueABRequired: true });
  const v = validateProcessor(aw, req);
  const layer = findCheck(v, '4K 믹싱 레이어(A/B)');
  assert.equal(layer.have, 4);      // 분할(8)이 아니라 믹싱(4)을 봄
  assert.equal(layer.ok, false);
  assert.equal(v.verdict, 'FAIL');
});
test('Analog Way without True A/B: same layers can use split capacity -> PASS', () => {
  const aw = {
    id: 'fx-aw2', manufacturer: 'Analog Way', family: 'Alta', model: 'fixture',
    inputs: { maxIndependent4k: 16 }, outputs: { max4k: 8 },
    layers: { model: 'mixing_split', mixing4k: 4, split4k: 8 },
    switching: {}, features: {}, control: {},
  };
  const req = processorRequirements({ resW: 3840, resH: 2160 }, { simultaneous4kLayers: 8 });
  const v = validateProcessor(aw, req);
  const layer = findCheck(v, '4K 레이어(믹싱/분할)');
  assert.equal(layer.have, 8);      // 분할 용량 사용
  assert.equal(layer.ok, true);
  assert.equal(v.verdict, 'PASS');
});

// ── 문서 §5.2: NovaStar 전체 레이어는 충분해도 특정 출력카드 한계 초과 -> FAIL ──────
test('NovaStar per-output-card: global OK but a card exceeds -> FAIL', () => {
  const ns = {
    id: 'fx-ns', manufacturer: 'NovaStar', family: 'H', model: 'fixture',
    inputs: { maxIndependent4k: 16 }, outputs: { max4k: 8, maxOutputBoards: 10 },
    layers: { model: 'per_output_card', perOutputCard4k: 4, perOutputCard2k: 16 },
    switching: {}, features: {}, control: {},
  };
  // 전역 4K 레이어 용량 = 4 × 10 = 40 (>= 20 OK), 그러나 한 출력에 5 레이어 요구 -> 카드 한계 4 초과.
  const req = processorRequirements({ resW: 3840, resH: 2160 }, { simultaneous4kLayers: 20, maxLayersPerOutput: 5 });
  const v = validateProcessor(ns, req);
  assert.equal(findCheck(v, '4K 레이어').ok, true);            // 전역은 통과
  assert.equal(findCheck(v, '출력카드별 4K 레이어').ok, false); // 카드 한계 초과
  assert.equal(v.verdict, 'FAIL');
});
test('validateOutputCardLayers: no placement -> theoretical feasibility + note (§21)', () => {
  const ns = getProcessor('ns-h9');   // per4k 4 × 5 boards = 20 total
  const c = validateOutputCardLayers(ns, processorRequirements({ resW: 3840, resH: 2160 }, { simultaneous4kLayers: 8 }));
  assert.equal(c.ok, true);              // 8 <= 20, 이론상 분산 가능
  assert.ok(c.note && c.note.includes('배치'));   // 배치 확인 안내
});
test('validateOutputCardLayers: unknown per-board (U15) -> null (확인 필요)', () => {
  const u15 = getProcessor('cl-universe-u15max');   // perBoard4k null, boards null
  const c = validateOutputCardLayers(u15, processorRequirements({ resW: 3840, resH: 2160 }, { simultaneous4kLayers: 8 }));
  assert.equal(c.ok, null);
});

// ── 문서 §26: NovaStar 카드 몰림 FAIL / 분산 PASS (배치도 배열) ───────────────────
test('§26 NovaStar: 5×4K on one card -> FAIL, 4+4 distributed -> PASS', () => {
  const ns = getProcessor('ns-h9');
  const fail = validateOutputCardLayers(ns, processorRequirements({ resW: 7680, resH: 2160 }, { perOutputCardDemand: [{ layers4k: 5 }] }));
  assert.equal(fail.ok, false);   // 5×4=20 > 16
  const pass = validateOutputCardLayers(ns, processorRequirements({ resW: 7680, resH: 2160 }, { perOutputCardDemand: [{ layers4k: 4 }, { layers4k: 4 }] }));
  assert.equal(pass.ok, true);    // 각 카드 16 ≤ 16, 2 카드 ≤ 5
});

// ── 문서 §26: X100 Pro 소스 복제 (독립입력 ≠ 윈도우) ─────────────────────────────
test('§26 X100 Pro-7U: 8 sources × 2 windows(16) -> input OK; 9 sources -> FAIL', () => {
  const x = getProcessor('cl-x100pro-7u');
  const dup = validateProcessor(x, processorRequirements({ resW: 3840, resH: 2160 }, { independent4kInputs: 8, simultaneous4kLayers: 16 }));
  assert.equal(findCheck(dup, '독립 4K 입력').ok, true);   // 8 / 8
  assert.equal(findCheck(dup, '최대 윈도우').ok, true);    // 16 / 64
  assert.notEqual(dup.verdict, 'FAIL');
  const over = validateProcessor(x, processorRequirements({ resW: 3840, resH: 2160 }, { independent4kInputs: 9, simultaneous4kLayers: 9 }));
  assert.equal(findCheck(over, '독립 4K 입력').ok, false); // 9 > 8, 윈도우 여유 있어도 FAIL
  assert.equal(over.verdict, 'FAIL');
});

// ── 문서 §26: U6 Max 보드 몰림 FAIL / 분산 PASS ─────────────────────────────────
test('§26 U6 Max: 5×4K on one board -> FAIL, 4+4 distributed -> PASS', () => {
  const u6 = getProcessor('cl-universe-u6max');   // perBoard2k 16, perBoard4k 4, boards 5
  const fail = validateOutputCardLayers(u6, processorRequirements({ resW: 7680, resH: 2160 }, { perOutputCardDemand: [{ layers4k: 5 }] }));
  assert.equal(fail.ok, false);   // 5×4=20 > 16
  const pass = validateOutputCardLayers(u6, processorRequirements({ resW: 7680, resH: 2160 }, { perOutputCardDemand: [{ layers4k: 4 }, { layers4k: 4 }] }));
  assert.equal(pass.ok, true);
});

// ── 문서 §4 / TEST 7·8: 출력카드 2K 환산 예산 (카드 용량 16) ─────────────────────
test('outputCardUsage2kEq: 4K×3 + 2K×4 = 16 (PASS), 4K×4 + 2K×1 = 17 (FAIL)', () => {
  assert.equal(outputCardUsage2kEq({ layers4k: 3, layers2k: 4 }), 16);
  assert.equal(outputCardUsage2kEq({ layers4k: 4, layers2k: 1 }), 17);
  assert.equal(outputCardUsage2kEq({ layers4k: 2, layersDL: 3, layers2k: 2 }), 16); // 8+6+2
});
test('NovaStar per-card budget: 2K환산 16 PASS / 17 FAIL', () => {
  const ns = getProcessor('ns-h9');   // perOutputCard2k = 16
  const pass = validateOutputCardLayers(ns, processorRequirements({ resW: 3840, resH: 2160 }, { perOutputCardDemand: { layers4k: 3, layers2k: 4 } }));
  assert.equal(pass.have, 16); assert.equal(pass.need, 16); assert.equal(pass.ok, true);
  const fail = validateOutputCardLayers(ns, processorRequirements({ resW: 3840, resH: 2160 }, { perOutputCardDemand: { layers4k: 4, layers2k: 1 } }));
  assert.equal(fail.need, 17); assert.equal(fail.ok, false);
});
// TEST 5·6: 한 카드 4K 레이어 4 PASS / 5 FAIL
test('NovaStar per-card 4K layers: 4 PASS / 5 FAIL', () => {
  const ns = getProcessor('ns-h9');   // perOutputCard4k = 4
  const pass = validateOutputCardLayers(ns, processorRequirements({ resW: 3840, resH: 2160 }, { maxLayersPerOutput: 4 }));
  assert.equal(pass.ok, true);
  const fail = validateOutputCardLayers(ns, processorRequirements({ resW: 3840, resH: 2160 }, { maxLayersPerOutput: 5 }));
  assert.equal(fail.ok, false);
});

// ── 문서 §12 / TEST 3·4: Colorlight U6 Max 전역 4K 레이어 20 PASS / 21 FAIL ──────
test('U6 Max: 4K input 20 / output 4 / layer 20 -> PASS', () => {
  const u6 = getProcessor('cl-universe-u6max');
  assert.deepEqual(
    { in: u6.inputs.maxIndependent4k, out: u6.outputs.max4k, g4: u6.layers.global4k, pb4: u6.layers.perBoard4k },
    { in: 20, out: 10, g4: 20, pb4: 4 });
  const req = processorRequirements({ resW: 7680, resH: 4320 }, { independent4kInputs: 8, simultaneous4kLayers: 20 });
  const v = validateProcessor(u6, req);
  assert.equal(findCheck(v, '독립 4K 입력').ok, true);
  assert.equal(findCheck(v, '4K 출력').ok, true);   // 필요 4 / 지원 10
  assert.equal(findCheck(v, '4K 레이어').ok, true);  // 필요 20 / 지원 20
  assert.equal(v.verdict, 'PASS');
});
test('U6 Max: 4K layer 21 -> FAIL (global 20)', () => {
  const u6 = getProcessor('cl-universe-u6max');
  const req = processorRequirements({ resW: 3840, resH: 2160 }, { simultaneous4kLayers: 21 });
  const v = validateProcessor(u6, req);
  assert.equal(findCheck(v, '4K 레이어').ok, false);
  assert.equal(v.verdict, 'FAIL');
});

// ── NovaStar 라인업 & 출력카드 정정 확인 ────────────────────────────────────────
test('NovaStar lineup: 7 models with corrected output-card counts', () => {
  const ns = PROCESSORS.filter(p => p.manufacturer === 'NovaStar');
  assert.equal(ns.length, 7);
  const byId = id => getProcessor(id);
  assert.equal(byId('ns-h5').outputs.maxOutputBoards, 3);   // (정정: 이전 10은 입력카드 수였음)
  assert.equal(byId('ns-h9').outputs.maxOutputBoards, 5);   // (정정: 이전 15)
  assert.equal(byId('ns-h20').outputs.maxOutputBoards, 20);
  assert.ok(byId('ns-h9e') && byId('ns-h15e') && byId('ns-h20'));
  // 카드당 레이어(2K/DL/4K)
  assert.deepEqual(
    { a: byId('ns-h9').layers.perOutputCard2k, b: byId('ns-h9').layers.perOutputCardDL, c: byId('ns-h9').layers.perOutputCard4k },
    { a: 16, b: 8, c: 4 });
});

// ── 문서 §15: 확인되지 않은 사양은 PASS가 아니라 CONDITIONAL ────────────────────
test('unknown required feature yields CONDITIONAL, not PASS', () => {
  const x = getProcessor('cl-x100pro-7u');   // seamless=null(확인 필요)
  const req = processorRequirements({ resW: 3840, resH: 2160 }, { independent4kInputs: 4, seamlessSwitching: true });
  const v = validateProcessor(x, req);
  assert.equal(findCheck(v, 'Seamless 스위칭').ok, null);
  assert.equal(v.verdict, 'CONDITIONAL');
});
test('output capacity unknown (null) is never auto-PASS', () => {
  const x = getProcessor('cl-x100pro-7u');   // global_window, 출력보드 미상 → 유도 불가
  const req = processorRequirements({ resW: 7680, resH: 4320 });  // 4K 출력 4 요구
  const v = validateProcessor(x, req);
  assert.equal(findCheck(v, '4K 출력').ok, null);
  assert.notEqual(v.verdict, 'PASS');
});

// ── 이사 지침: 출력카드 HDMI 2.0 가정 → NovaStar 4K 출력 유도 ─────────────────────
test('outputs4kCapacity: HDMI 2.0 assumption derives NovaStar 4K outputs', () => {
  assert.deepEqual(outputs4kCapacity(getProcessor('ns-h9')), { value: 20, assumed: true });   // 4×5
  assert.deepEqual(outputs4kCapacity(getProcessor('ns-h20')), { value: 80, assumed: true });  // 4×20
  assert.deepEqual(outputs4kCapacity(getProcessor('cl-universe-u6max')), { value: 10, assumed: false }); // 공식값 유지
  assert.deepEqual(outputs4kCapacity(getProcessor('cl-x100pro-7u')), { value: null, assumed: false });   // 유도 불가
});
test('NovaStar 4K output check uses HDMI 2.0 assumption (labeled)', () => {
  const v = validateProcessor(getProcessor('ns-h9'), processorRequirements({ resW: 7680, resH: 4320 })); // 필요 4
  const c = findCheck(v, '4K 출력(HDMI2.0 가정)');
  assert.ok(c);
  assert.equal(c.have, 20);
  assert.equal(c.ok, true);   // 필요 4 / 지원 20(가정)
});

// ── 문서 §3: Aquilon RS4 예시 (필요 충족 시 PASS/권장) ──────────────────────────
test('Aquilon RS4 meets 4K in 8 / mixing 8 / out 4 -> PASS', () => {
  const rs4 = getProcessor('aw-aquilon-rs4');
  assert.deepEqual(
    { in: rs4.inputs.maxIndependent4k, mix: rs4.layers.mixing4k, out: rs4.outputs.max4k },
    { in: 24, mix: 12, out: 16 });
  const req = processorRequirements(
    { resW: 7680, resH: 2160 },   // 4K 출력 2 요구
    { independent4kInputs: 8, simultaneous4kLayers: 8, trueABRequired: true });
  const v = validateProcessor(rs4, req);
  assert.equal(findCheck(v, '독립 4K 입력').ok, true);
  assert.equal(findCheck(v, '4K 믹싱 레이어(A/B)').ok, true);
  assert.equal(findCheck(v, '4K 출력').ok, true);
  assert.equal(v.verdict, 'PASS');
});

// ── rankProcessors: 등급 순 정렬, FAIL은 부적합으로 뒤로 ─────────────────────────
test('rankProcessors sorts PASS/CONDITIONAL ahead of FAIL', () => {
  // 4K 출력 4개(≥3)라 Aquilon도 목록에 포함된다.
  const req = processorRequirements({ resW: 7680, resH: 4320 }, { independent4kInputs: 30 });
  const ranked = rankProcessors(PROCESSORS, req);
  assert.equal(ranked.length, PROCESSORS.length);
  // 독립 4K 입력 30 요구 -> X100 Pro(최대 8) 등은 부적합, Aquilon RS6(32)는 통과 가능.
  const rs6 = ranked.find(r => r.proc.id === 'aw-aquilon-rs6');
  const x7u = ranked.find(r => r.proc.id === 'cl-x100pro-7u');
  assert.equal(x7u.label, '부적합');       // 독립 4K 입력 8 < 30
  assert.notEqual(rs6.label, '부적합');     // 32 >= 30
  // 일단 '부적합'이 나오면 그 뒤는 전부 '부적합'이어야 한다(부적합은 맨 뒤로).
  const firstFail = ranked.findIndex(r => r.label === '부적합');
  assert.ok(firstFail === -1 || ranked.slice(firstFail).every(r => r.label === '부적합'));
});

// ── 이사 규칙: 소형 작업(4K 출력 ≤2)에서 Aquilon 숨김(예외 없음) ────────────────
test('Aquilon hidden when required 4K outputs <= 2, shown when >= 3', () => {
  const has = list => list.some(r => r.proc.family === 'Aquilon');
  // 4K 출력 1개(3840×2160): Aquilon 숨김
  assert.equal(has(rankProcessors(PROCESSORS, processorRequirements({ resW: 3840, resH: 2160 }))), false);
  // 4K 출력 2개(7680×2160): Aquilon 숨김
  assert.equal(has(rankProcessors(PROCESSORS, processorRequirements({ resW: 7680, resH: 2160 }))), false);
  // 4K 출력 4개(7680×4320): Aquilon 표시
  assert.equal(has(rankProcessors(PROCESSORS, processorRequirements({ resW: 7680, resH: 4320 }))), true);
  // 예외 없음: 방송급(공연·방송급) 요구여도 소형이면 숨김
  const show = processorRequirements({ resW: 3840, resH: 2160 }, { advancedTransitionRequired: true, trueABRequired: true });
  assert.equal(has(rankProcessors(PROCESSORS, show)), false);
});

// ── 이사 지침: 입력카드 '슬롯 1개 = 4K 1개 또는 2K 4개' 모델 ──────────────────────
test('inputsCapacity: NovaStar derived from slots, X100 uses explicit', () => {
  // NovaStar H9: 입력슬롯 15 → 4K 15, 2K 60 (가정)
  assert.deepEqual(inputsCapacity(getProcessor('ns-h9')), { max4k: 15, max2k: 60, slots: 15, assumed4k: true, assumed2k: true });
  // X100 Pro 7U: 공식값(8 / 32) 유지, 가정 아님
  assert.deepEqual(inputsCapacity(getProcessor('cl-x100pro-7u')), { max4k: 8, max2k: 32, slots: 8, assumed4k: false, assumed2k: false });
});
test('input slot budget: 4K + ceil(2K/4) <= slots (shared)', () => {
  const h2 = getProcessor('ns-h2');   // 입력슬롯 4
  // 3×4K + 4×2K = 3 + 1 = 4 슬롯 ≤ 4 → PASS
  const ok = validateProcessor(h2, processorRequirements({ resW: 3840, resH: 2160 }, { independent4kInputs: 3, independent2kInputs: 4 }));
  assert.equal(findCheck(ok, '입력 슬롯').ok, true);
  // 3×4K + 8×2K = 3 + 2 = 5 슬롯 > 4 → FAIL
  const over = validateProcessor(h2, processorRequirements({ resW: 3840, resH: 2160 }, { independent4kInputs: 3, independent2kInputs: 8 }));
  assert.equal(findCheck(over, '입력 슬롯').ok, false);
  assert.equal(over.verdict, 'FAIL');
});
test('X100 Pro-7U input slot budget: 4×4K + 16×2K fits 8 slots, 5×4K + 16×2K does not', () => {
  const x = getProcessor('cl-x100pro-7u');   // 슬롯 8
  const ok = validateProcessor(x, processorRequirements({ resW: 3840, resH: 2160 }, { independent4kInputs: 4, independent2kInputs: 16 }));
  assert.equal(findCheck(ok, '입력 슬롯').ok, true);   // 4 + 4 = 8
  const over = validateProcessor(x, processorRequirements({ resW: 3840, resH: 2160 }, { independent4kInputs: 5, independent2kInputs: 16 }));
  assert.equal(findCheck(over, '입력 슬롯').ok, false); // 5 + 4 = 9 > 8
});

// ── handoff §2/§6: Midra 레이어 & U9 Max 확정값 반영 ─────────────────────────────
test('Midra Pulse/Eikos: mixing 2 / split 4 layers filled', () => {
  for (const id of ['aw-midra-pulse-4k', 'aw-midra-eikos-4k']) {
    const p = getProcessor(id);
    assert.equal(p.layers.mixing4k, 2);
    assert.equal(p.layers.split4k, 4);
  }
});
test('U9 Max: official I/O + per-board layers filled', () => {
  const u9 = getProcessor('cl-universe-u9max');
  assert.deepEqual(
    { in4: u9.inputs.maxIndependent4k, in2: u9.inputs.maxIndependent2k, inB: u9.inputs.maxInputBoards,
      o4: u9.outputs.max4k, o2: u9.outputs.max2k, oB: u9.outputs.maxOutputBoards,
      g4: u9.layers.global4k, pb4: u9.layers.perBoard4k },
    { in4: 36, in2: 108, inB: 18, o4: 20, o2: 60, oB: 10, g4: 40, pb4: 4 });
  assert.equal(u9.verification.status, 'official');
});
test('Universe does NOT use the 1:4 input-slot budget (density differs)', () => {
  // U9: 독립 4K 36·2K 108 (explicit). 4K+2K 동시 요구여도 screen_group이라 '입력 슬롯' 검사 없음.
  const v = validateProcessor(getProcessor('cl-universe-u9max'),
    processorRequirements({ resW: 3840, resH: 2160 }, { independent4kInputs: 10, independent2kInputs: 20 }));
  assert.equal(findCheck(v, '입력 슬롯'), undefined);
  assert.equal(findCheck(v, '독립 4K 입력').ok, true);   // 10 ≤ 36
  assert.equal(findCheck(v, '독립 2K 입력').ok, true);   // 20 ≤ 108
});

// ── QuickVu / QuickMatrix 단종 삭제 확인 ────────────────────────────────────────
test('discontinued Midra models removed; Pulse/Eikos remain', () => {
  const midra = PROCESSORS.filter(p => p.family === 'Midra').map(p => p.model);
  assert.deepEqual(midra.sort(), ['Eikos 4K', 'Pulse 4K']);
  assert.equal(getProcessor('aw-midra-quickvu-4k'), null);
  assert.equal(getProcessor('aw-midra-quickmatrix-4k'), null);
});

// ── 데이터 무결성: 모든 제품이 유효한 스키마를 가진다 ───────────────────────────
test('every processor has a valid layer model and id', () => {
  const valid = new Set(['mixing_split', 'per_output_card', 'global_window', 'screen_group']);
  const ids = new Set();
  for (const p of PROCESSORS) {
    assert.ok(p.id && !ids.has(p.id), `unique id: ${p.id}`);
    ids.add(p.id);
    assert.ok(valid.has(p.layers.model), `${p.id} layer model`);
    assert.ok(['official', 'partial_official', 'needs_verification'].includes(p.verification.status), `${p.id} status`);
  }
});
