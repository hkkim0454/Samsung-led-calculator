import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCasesTSV, normalizeDate } from '../src/cases.js';

test('normalizeDate: 여러 형식 → YYYY-MM-DD', () => {
  assert.equal(normalizeDate('2026-03-15'), '2026-03-15');
  assert.equal(normalizeDate('2026.3.5'), '2026-03-05');
  assert.equal(normalizeDate('2025/11/20'), '2025-11-20');
  assert.equal(normalizeDate('2026년 3월 15일'), '2026-03-15');
  assert.equal(normalizeDate(''), null);
  assert.equal(normalizeDate('없음'), null);
});

test('parseCasesTSV: 기본 6열(설치장소/설치일/모델/열/행/메모)', () => {
  const tsv = '롯데타워 로비\t2026-03-15\tIF015R\t8\t5\t고소작업 포함';
  const out = parseCasesTSV(tsv);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], {
    name: '롯데타워 로비 IF015R 8×5',
    site: '롯데타워 로비', install_date: '2026-03-15',
    model_name: 'IF015R', cols: 8, rows: 5, memo: '고소작업 포함',
  });
});

test('parseCasesTSV: 배열을 "8x5" 한 칸으로', () => {
  const tsv = '삼성홀\t2025.11.20\tMM015F\t12×6\t비고';
  const out = parseCasesTSV(tsv);
  assert.equal(out.length, 1);
  assert.equal(out[0].cols, 12);
  assert.equal(out[0].rows, 6);
  assert.equal(out[0].memo, '비고');
});

test('parseCasesTSV: 머리글 줄 건너뜀 + 여러 줄', () => {
  const tsv = [
    '설치장소\t설치일\t모델\t열\t행\t메모',
    '현장A\t2026-01-02\tIF015R\t8\t5\t',
    '현장B\t2026-02-03\tIE015A\t10\t6\t야외',
  ].join('\n');
  const out = parseCasesTSV(tsv);
  assert.equal(out.length, 2);
  assert.equal(out[0].site, '현장A');
  assert.equal(out[1].model_name, 'IE015A');
  assert.equal(out[1].memo, '야외');
});

test('parseCasesTSV: 빈 줄·무효 줄 무시', () => {
  const tsv = '\n현장C\t2026-01-01\tIF015R\t4\t4\t\n\n\t\t\t\t\t';
  const out = parseCasesTSV(tsv);
  assert.equal(out.length, 1);
  assert.equal(out[0].site, '현장C');
});

test('parseCasesTSV: 날짜 이상하면 null(등록은 진행)', () => {
  const out = parseCasesTSV('현장D\t미정\tIF015R\t8\t5\t');
  assert.equal(out[0].install_date, null);
  assert.equal(out[0].cols, 8);
});
