import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SIGNAGE_MODELS, validateSignageLibrary, SIGNAGE_CATEGORIES, STANDALONE_FAMILIES, VIDEO_WALL_PRODUCT_GROUPS } from '../src/signage-data.js';

test('signage: 라이브러리 무결성(validateSignageLibrary) 통과', () => {
  const r = validateSignageLibrary();
  assert.deepEqual(r.errors, []);
  assert.equal(r.ok, true);
});

test('signage: 전체 20 / standalone 14 / video wall 6', () => {
  const r = validateSignageLibrary();
  assert.equal(r.counts.total, 20);
  assert.equal(r.counts.standalone, 14);
  assert.equal(r.counts.videoWall, 6);
});

test('signage: QMC 8 / QHC 6', () => {
  const r = validateSignageLibrary();
  assert.equal(r.counts.qmc, 8);
  assert.equal(r.counts.qhc, 6);
});

test('signage: Video Wall VM_500nit 4 / VH_700nit 2', () => {
  const r = validateSignageLibrary();
  assert.equal(r.counts.vm500, 4);
  assert.equal(r.counts.vh700, 2);
});

test('signage: modelCode 중복 없음', () => {
  const codes = SIGNAGE_MODELS.map(m => m.modelCode);
  assert.equal(new Set(codes).size, codes.length);
  assert.ok(codes.every(c => typeof c === 'string' && c.length > 0));
});

test('signage: category 허용값만', () => {
  for (const m of SIGNAGE_MODELS) assert.ok(SIGNAGE_CATEGORIES.includes(m.category), `bad category ${m.modelCode}`);
});

test('signage: standalone family 허용값(QMC/QHC)만', () => {
  for (const m of SIGNAGE_MODELS.filter(x => x.category === 'standalone_signage'))
    assert.ok(STANDALONE_FAMILIES.includes(m.family), `bad family ${m.modelCode}`);
});

test('signage: video_wall productGroup 허용값(VM_500nit/VH_700nit)만', () => {
  for (const m of SIGNAGE_MODELS.filter(x => x.category === 'video_wall'))
    assert.ok(VIDEO_WALL_PRODUCT_GROUPS.includes(m.productGroup), `bad productGroup ${m.modelCode}`);
});

test('signage: 모든 모델 manufacturer = Samsung', () => {
  for (const m of SIGNAGE_MODELS) assert.equal(m.manufacturer, 'Samsung');
});

test('signage: 확인 안 된 값은 null (추정 금지) — video wall model/family null, standalone screenSizeInch null', () => {
  for (const m of SIGNAGE_MODELS.filter(x => x.category === 'video_wall')) {
    assert.equal(m.model, null, `video wall model 은 null 이어야: ${m.modelCode}`);
    assert.equal(m.family, null, `video wall family 는 null 이어야: ${m.modelCode}`);
    assert.equal(m.display.screenSizeCm, null);
  }
  for (const m of SIGNAGE_MODELS.filter(x => x.category === 'standalone_signage')) {
    assert.equal(m.display.screenSizeInch, null, `standalone screenSizeInch 는 null 이어야: ${m.modelCode}`);
    assert.equal(m.productGroup, null);
  }
});

test('signage: null 이 false/0 으로 바뀌지 않았는지 (미확인 io/power/features 는 null 유지)', () => {
  for (const m of SIGNAGE_MODELS) {
    for (const v of Object.values(m.io)) assert.equal(v, null, `io 미확인은 null 유지: ${m.modelCode}`);
    assert.equal(m.power.typicalW, null);
    assert.equal(m.power.maxW, null);
    for (const v of Object.values(m.features)) assert.equal(v, null, `features 미확인은 null 유지: ${m.modelCode}`);
    assert.equal(m.physical.vesaMm, null);
  }
});

test('signage: video wall 6종 physical(mm/kg)·bezel 값 존재, display FHD', () => {
  for (const m of SIGNAGE_MODELS.filter(x => x.category === 'video_wall')) {
    assert.equal(typeof m.physical.widthMm, 'number');
    assert.equal(typeof m.physical.heightMm, 'number');
    assert.equal(typeof m.physical.depthMm, 'number');
    assert.equal(typeof m.physical.weightKg, 'number');
    assert.equal(typeof m.videoWall.bezelMm, 'number');
    assert.equal(m.videoWall.bezelDefinition, 'catalog_value');
    assert.equal(m.display.resolution.label, 'FHD');
    assert.equal(m.display.resolution.width, 1920);
    assert.equal(m.display.resolution.height, 1080);
  }
});

test('signage: 대표 표본 값 확인 (QM55C / QH115FX / LH46VMBU)', () => {
  const byCode = c => SIGNAGE_MODELS.find(m => m.modelCode === c);
  const qm55 = byCode('LH55QMCEBGCXKR');
  assert.equal(qm55.family, 'QMC');
  assert.equal(qm55.display.screenSizeCm, 138);
  assert.equal(qm55.display.resolution.label, 'UHD');
  assert.equal(qm55.display.brightnessNit, 500);
  assert.equal(qm55.verification.status, 'official_catalog');

  const qh115 = byCode('LH115QHFEBGXKR');
  assert.equal(qh115.family, 'QHC');
  assert.equal(qh115.display.screenSizeCm, 290);
  assert.equal(qh115.display.brightnessNit, 1000);
  assert.equal(qh115.display.responseTimeMs, 6.5);
  assert.equal(qh115.display.contrastRatio, '5500:1');

  const vmb46 = byCode('LH46VMBUBGBXKR');
  assert.equal(vmb46.productGroup, 'VM_500nit');
  assert.equal(vmb46.display.screenSizeInch, 46);
  assert.equal(vmb46.videoWall.bezelMm, 3.5);
  assert.equal(vmb46.physical.widthMm, 1022);
  assert.equal(vmb46.physical.weightKg, 15.7);
  assert.equal(vmb46.display.contrastRatio, '1200:1');
  assert.equal(vmb46.verification.status, 'user_approved_source');
});
