import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG_VERSION, CONFIG_DEFAULTS, normalizeConfig, makeRecord, normalizeRecords } from '../src/config.js';

test('정상 구성은 값이 그대로 왕복(roundtrip)된다', () => {
  const cfg = {
    spaceW: 6000, spaceH: 3400, mode: 'manual', manCols: 8, manRows: 6,
    redundancy: true, cs4b: true, gbicFB: false, highWork: true,
    spareRate: '7', spareEdited: true, sboxSpare: 2, signalMode: 'uhd',
    selectedId: 'IF015RM', selectedModel: { id: 'IF015RM', name: 'IF015R-M' },
    etcCost: 500000, etcSell: 700000, visibleLines: ['IF', 'MM'], indirectDisabled: ['연금보험료'],
  };
  const out = normalizeConfig(cfg);
  assert.deepEqual(out, cfg);
});

test('누락 항목은 기본값으로 채워진다', () => {
  const out = normalizeConfig({ spaceW: 5000 });
  assert.equal(out.spaceW, 5000);
  assert.equal(out.spaceH, CONFIG_DEFAULTS.spaceH);
  assert.equal(out.mode, 'fill');
  assert.equal(out.signalMode, 'off');
  assert.equal(out.spareRate, '');
  assert.equal(out.selectedId, null);
});

test('잘못된 타입/값은 무시하고 기본값으로', () => {
  const out = normalizeConfig({ mode: 'ZZZ', signalMode: 42, redundancy: 'yes', sboxSpare: 'abc', visibleLines: 'IF' });
  assert.equal(out.mode, 'fill');
  assert.equal(out.signalMode, 'off');
  assert.equal(out.redundancy, false);   // 문자열 'yes'는 boolean 아님 → 기본값
  assert.equal(out.sboxSpare, 1);         // 'abc'는 숫자 아님 → 기본값
  assert.equal(out.visibleLines, null);   // 배열 아님 → 기본값(null=현재 유지)
});

test('object 아닌 입력은 전부 기본값', () => {
  for (const bad of [null, undefined, 42, 'x', []]) {
    const out = normalizeConfig(bad);
    assert.equal(out.spaceW, CONFIG_DEFAULTS.spaceW);
    assert.equal(out.mode, CONFIG_DEFAULTS.mode);
  }
});

test('숫자 문자열은 숫자로 강제(공간·수량)', () => {
  const out = normalizeConfig({ spaceW: '6000', manCols: '8', etcCost: '500000' });
  assert.equal(out.spaceW, 6000);
  assert.equal(out.manCols, 8);
  assert.equal(out.etcCost, 500000);
});

test('알 수 없는 항목은 결과에서 제거된다', () => {
  const out = normalizeConfig({ spaceW: 4000, __hack: 1, price: 999 });
  assert.equal('__hack' in out, false);
  assert.equal('price' in out, false);
});

test('makeRecord: 버전·이름·정규화된 data 를 포함', () => {
  const rec = makeRecord('롯데타워 로비', { spaceW: 5000 }, '2026-09-08T00:00:00.000Z');
  assert.equal(rec.v, CONFIG_VERSION);
  assert.equal(rec.name, '롯데타워 로비');
  assert.equal(rec.savedAt, '2026-09-08T00:00:00.000Z');
  assert.equal(rec.data.spaceW, 5000);
  assert.equal(rec.data.mode, 'fill'); // 정규화로 기본값 채움
});

test('normalizeRecords: 배열 정리·정규화·최신순 정렬', () => {
  const list = [
    { name: 'A', savedAt: '2026-09-01T00:00:00.000Z', data: { spaceW: 1000 } },
    { name: 'B', savedAt: '2026-09-08T00:00:00.000Z', data: { spaceW: 2000 } },
    { nope: true },                 // name 없음 → 제거
    'garbage',                      // object 아님 → 제거
  ];
  const out = normalizeRecords(list);
  assert.equal(out.length, 2);
  assert.equal(out[0].name, 'B');   // 최신 저장 먼저
  assert.equal(out[1].name, 'A');
  assert.equal(out[0].data.spaceW, 2000);
});

test('normalizeRecords: 배열 아닌 입력은 빈 배열', () => {
  assert.deepEqual(normalizeRecords(null), []);
  assert.deepEqual(normalizeRecords({}), []);
});
