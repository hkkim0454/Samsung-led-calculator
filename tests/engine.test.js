import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeConfig, fitCabinets, cabinetResolution, bom, sboxCount, fit169 } from '../src/engine.js';
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

test('null weight/power propagate as null (no fake numbers)', () => {
  const IF025R = MODELS.find(m => m.id === 'IF025R');
  const r = computeConfig(IF025R, 6000, 3400, { mode: 'fill' });
  assert.equal(r.weightKg, null);
  assert.equal(r.maxW, null);
  assert.ok(r.resW > 0); // geometry still computed
});

test('bom spare defaults to 10% rounded up', () => {
  const b = bom(MP012F, 42);
  assert.equal(b.spares, 5);        // ceil(4.2) = 5   (NOTE: Samsung showed 4 -> spare rule pending)
  assert.equal(b.totalCabinets, 47);
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
  const MM012F = MODELS.find(m => m.id === 'MM012F'); // MM line has no S-Box capacity yet
  const r = computeConfig(MM012F, 6000, 3400, { mode: 'fill' });
  assert.equal(r.sbox, null);
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
});

test('16:9 max equals full resolution when the panel is exactly 16:9', () => {
  // 3840x2160 (4K UHD) is exactly 16:9.
  assert.deepEqual(fit169(3840, 2160), { w: 3840, h: 2160 });
});
