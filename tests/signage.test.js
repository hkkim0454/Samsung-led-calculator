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

test('signage: powerMax 는 전 모델 미확인 → null 유지', () => {
  for (const m of SIGNAGE_MODELS) {
    assert.equal(m.power.maxW, null, `powerMax 미확인은 null 유지: ${m.modelCode}`);
  }
});
// SoC: 공식 KR 페이지에서 확인된 모델만 값(예: 'Tizen 7.0'), 미확인 모델은 null 유지(추정 금지).
test('signage: features.soc 는 문자열이거나 null (추정 금지)', () => {
  for (const m of SIGNAGE_MODELS) {
    assert.ok(m.features.soc === null || typeof m.features.soc === 'string', `soc 타입 이상: ${m.modelCode}`);
  }
});

// ── QHC 단독형 공식 KR 페이지 반영(2026-09-14): On Mode 전력·SoC·패널타입·베젤·Sleep·사용시간 ──
test('io/spec: QHC 소비전력 typicalW = 공식 On Mode 값', () => {
  const byCode = c => SIGNAGE_MODELS.find(m => m.modelCode === c);
  assert.equal(byCode('LH43QHCEBGCXKR').power.typicalW, 132);
  assert.equal(byCode('LH50QHCEBGCXKR').power.typicalW, 165);
  assert.equal(byCode('LH55QHCEBGCXKR').power.typicalW, 187);
  assert.equal(byCode('LH65QHCEBGCXKR').power.typicalW, 203.5);
  assert.equal(byCode('LH75QHCEBGCXKR').power.typicalW, 275);
  assert.equal(byCode('LH115QHFEBGXKR').power.typicalW, 836);
});
test('io/spec: QMC 소비전력 typicalW = 공식 On Mode 값(제공 7종)', () => {
  const byCode = c => SIGNAGE_MODELS.find(m => m.modelCode === c);
  assert.equal(byCode('LH32QMCEBGCXKR').power.typicalW, 55);
  assert.equal(byCode('LH43QMCEBGCXKR').power.typicalW, 121);
  assert.equal(byCode('LH50QMCEBGCXKR').power.typicalW, 132);
  assert.equal(byCode('LH55QMCEBGCXKR').power.typicalW, 154);
  assert.equal(byCode('LH65QMCEBGCXKR').power.typicalW, 187);
  assert.equal(byCode('LH75QMCEBGCXKR').power.typicalW, 214.5);
  assert.equal(byCode('LH85QMCEBGCXKR').power.typicalW, 330);
  assert.equal(byCode('LH98QMCEBGCXKR').power.typicalW, 363);
  assert.equal(byCode('LH98QMCEBGCXKR').features.soc, 'Tizen 7.0');
  assert.equal(byCode('LH98QMCEBGCXKR').physical.bezelMm, 14.8);
});
test('spec: QM32C = FHD(1920x1080)·400nit·DP In 0(공식 No)', () => {
  const q = SIGNAGE_MODELS.find(m => m.modelCode === 'LH32QMCEBGCXKR');
  assert.equal(q.display.resolution.label, 'FHD');
  assert.equal(q.display.resolution.width, 1920);
  assert.equal(q.display.resolution.height, 1080);
  assert.equal(q.display.brightnessNit, 400);
  assert.equal(q.io.displayPortIn, 0);
  assert.equal(q.features.soc, 'Tizen 7.0');
});
test('spec: QH115FX OS = Tizen 8.0 / VXT 지원', () => {
  const q = SIGNAGE_MODELS.find(m => m.modelCode === 'LH115QHFEBGXKR');
  assert.equal(q.features.soc, 'Tizen 8.0');
  assert.equal(q.features.vxt, true);
  assert.equal(q.features.ir, true);   // 매뉴얼 IR 단자 확인
  assert.equal(q.display.panelType, 'VA');
  assert.equal(q.physical.bezelMm, 3);
  assert.equal(q.power.sleepW, 0.5);
  assert.equal(q.features.wifi, true);
  assert.equal(q.features.bluetooth, true);
});
test('spec: 단독형 13종(QH115FX 제외) MagicINFO·VXT 둘 다 지원', () => {
  for (const m of SIGNAGE_MODELS.filter(x => x.category === 'standalone_signage' && x.modelCode !== 'LH115QHFEBGXKR')) {
    assert.equal(m.features.magicInfo, true, `${m.modelCode} magicInfo true 아님`);
    assert.equal(m.features.vxt, true, `${m.modelCode} vxt true 아님`);
  }
});
test('spec: 비디오월 4종(VMBU46/55·VMCR·VHCR) 하드웨어 상세 반영', () => {
  const byCode = c => SIGNAGE_MODELS.find(m => m.modelCode === c);
  for (const [c, on] of [['LH46VMBUBGBXKR', 160], ['LH55VMBUBGBXKR', 220], ['LH55VMCRBGBXKR', 270], ['LH55VHCRBGBXKR', 250]]) {
    const m = byCode(c);
    assert.equal(m.display.panelType, 'IPS', `${c} panel`);
    assert.equal(m.power.typicalW, on, `${c} On`);
    assert.equal(m.power.sleepW, 0.5);
    assert.equal(m.power.maxW, null);          // Max 미명시 → null
    assert.equal(m.physical.vesaMm, '600x400');
    assert.equal(m.io.hdmiIn, 2); assert.equal(m.io.hdmiOut, 0);
    assert.equal(m.io.displayPortIn, 1); assert.equal(m.io.displayPortOut, 1);
    assert.equal(m.io.dviIn, 1);
    assert.equal(m.features.ir, true);
    assert.equal(m.operation.ratedUsage, '24/7');
    assert.ok(m.videoWall.individualBezelMm, `${c} 개별베젤`);
    assert.ok(Array.isArray(m.sourceUrls) && m.sourceUrls.length >= 1);
  }
});
test('spec: 비디오월 VMHE/VHHE 상세 미상은 null 유지(추정 금지)', () => {
  for (const c of ['LH55VMHEBGBXKR', 'LH55VHHEBGBXKR']) {
    const m = SIGNAGE_MODELS.find(x => x.modelCode === c);
    assert.equal(m.display.panelType, null, `${c} panel null`);
    assert.equal(m.power.typicalW, null, `${c} power null`);
    assert.equal(m.io.dviIn, null);
    // 크기·무게·베젤은 회사 공식 목록 확인값이라 유지(1.74mm, 19.5kg)
    assert.equal(m.videoWall.bezelMm, 1.74);
    assert.equal(m.physical.weightKg, 19.5);
  }
});
test('spec: 비디오월 6종 OS 없음 · MagicINFO/VXT 미지원(false)', () => {
  for (const m of SIGNAGE_MODELS.filter(x => x.category === 'video_wall')) {
    assert.equal(m.features.magicInfo, false, `${m.modelCode} magicInfo false 아님`);
    assert.equal(m.features.vxt, false, `${m.modelCode} vxt false 아님`);
    assert.ok(typeof m.features.soc === 'string' && m.features.soc.includes('외장'), `${m.modelCode} soc 외장셋탑 표기 아님`);
  }
});
test('spec: QMC 응답속도 QM50C·QM85C = 10ms', () => {
  assert.equal(SIGNAGE_MODELS.find(m => m.modelCode === 'LH50QMCEBGCXKR').display.responseTimeMs, 10);
  assert.equal(SIGNAGE_MODELS.find(m => m.modelCode === 'LH85QMCEBGCXKR').display.responseTimeMs, 10);
});
test('spec: QHC 핵심 추가 항목(패널·SoC·베젤·Sleep·사용시간)', () => {
  const q75 = SIGNAGE_MODELS.find(m => m.modelCode === 'LH75QHCEBGCXKR');
  assert.equal(q75.display.panelType, 'VA');
  assert.equal(q75.features.soc, 'Tizen 7.0');
  assert.equal(q75.features.wifi, true);
  assert.equal(q75.features.bluetooth, true);
  assert.equal(q75.features.ir, true);
  assert.equal(q75.physical.bezelMm, 13.4);
  assert.equal(q75.power.sleepW, 0.5);
  assert.equal(q75.operation.ratedUsage, '24/7');
  assert.equal(SIGNAGE_MODELS.find(m => m.modelCode === 'LH50QHCEBGCXKR').display.responseTimeMs, 10);
});

// ── I/O(입출력 단자) 회귀 테스트 (2026-09-14 오너 공식 표) ──
const byCode = c => SIGNAGE_MODELS.find(m => m.modelCode === c);
test('io: 20모델 모두 io 객체 + ioVerification(official_samsung) 존재', () => {
  for (const m of SIGNAGE_MODELS) {
    assert.ok(m.io && typeof m.io === 'object', `io 없음: ${m.modelCode}`);
    for (const k of ['hdmiIn', 'hdmiOut', 'displayPortIn', 'displayPortOut', 'usb', 'rs232In', 'rs232Out', 'rj45', 'note']) {
      assert.ok(k in m.io, `io.${k} 필드 없음: ${m.modelCode}`);
    }
    assert.equal(m.ioVerification.status, 'official_samsung', `ioVerification 없음: ${m.modelCode}`);
    assert.ok(typeof m.ioVerification.sourceUrl === 'string' && m.ioVerification.sourceUrl.length > 0, `io sourceUrl 없음: ${m.modelCode}`);
  }
});
test('io: QMC/QHC HDMI In = 3 (전 모델)', () => {
  for (const m of SIGNAGE_MODELS.filter(x => x.category === 'standalone_signage'))
    assert.equal(m.io.hdmiIn, 3, `hdmiIn 3 아님: ${m.modelCode}`);
});
test('io: QM32C displayPortIn = 0 (공식 No), 나머지 단독형 = 1', () => {
  assert.equal(byCode('LH32QMCEBGCXKR').io.displayPortIn, 0);
  for (const m of SIGNAGE_MODELS.filter(x => x.category === 'standalone_signage' && x.modelCode !== 'LH32QMCEBGCXKR'))
    assert.equal(m.io.displayPortIn, 1, `displayPortIn 1 아님: ${m.modelCode}`);
});
test('io: QH115FX 상세값', () => {
  const q = byCode('LH115QHFEBGXKR');
  assert.equal(q.io.hdmiIn, 3); assert.equal(q.io.displayPortIn, 1); assert.equal(q.io.usb, 2);
  assert.equal(q.io.rs232In, 1); assert.equal(q.io.rs232Out, 1); assert.equal(q.io.rj45, 1);
});
test('io: Video Wall 6종 hdmiIn = 2', () => {
  for (const m of SIGNAGE_MODELS.filter(x => x.category === 'video_wall'))
    assert.equal(m.io.hdmiIn, 2, `VW hdmiIn 2 아님: ${m.modelCode}`);
});
test('io: VMB(46)·VHC-R hdmiOut=0 & displayPortOut=1 (공식 확인)', () => {
  for (const c of ['LH46VMBUBGBXKR', 'LH55VHCRBGBXKR']) {
    assert.strictEqual(byCode(c).io.hdmiOut, 0, `${c} hdmiOut 0 아님`);
    assert.strictEqual(byCode(c).io.displayPortOut, 1, `${c} dpOut 1 아님`);
  }
});
test('io: VMHX-E·VHHX-E displayPortOut = null (개수 미확인 → 0으로 바꾸지 않음)', () => {
  for (const c of ['LH55VMHEBGBXKR', 'LH55VHHEBGBXKR']) {
    assert.strictEqual(byCode(c).io.displayPortOut, null, `${c} dpOut null 아님(0 변환 금지)`);
  }
});
test('io: 단독형 hdmiOut·displayPortOut 은 미확인 → null(0 변환 금지)', () => {
  for (const m of SIGNAGE_MODELS.filter(x => x.category === 'standalone_signage')) {
    assert.strictEqual(m.io.hdmiOut, null, `${m.modelCode} hdmiOut null 아님`);
    assert.strictEqual(m.io.displayPortOut, null, `${m.modelCode} dpOut null 아님`);
  }
});

test('signage: standalone 14종 외형(mm)·무게 데이터시트 반영 (배치 가능)', () => {
  for (const m of SIGNAGE_MODELS.filter(x => x.category === 'standalone_signage')) {
    assert.equal(typeof m.physical.widthMm, 'number', `widthMm 필요: ${m.modelCode}`);
    assert.equal(typeof m.physical.heightMm, 'number', `heightMm 필요: ${m.modelCode}`);
    assert.equal(typeof m.physical.weightKg, 'number', `weightKg 필요: ${m.modelCode}`);
    // 외형 세로/가로 비율은 16:9 근처(외형이라 베젤 때문에 약간 작음) — 명백한 오류값 차단.
    const ratio = m.physical.widthMm / m.physical.heightMm;
    assert.ok(ratio > 1.6 && ratio < 1.85, `이상한 종횡비 ${ratio.toFixed(3)} (${m.modelCode})`);
  }
  const qm55 = SIGNAGE_MODELS.find(m => m.modelCode === 'LH55QMCEBGCXKR');
  assert.equal(qm55.physical.widthMm, 1237.9);
  assert.equal(qm55.physical.heightMm, 708.8);
  assert.equal(qm55.physical.weightKg, 15.7);
  assert.equal(qm55.physical.vesaMm, '200x200');
  assert.equal(qm55.features.tizen, true);
});

test('signage: video wall 6종 physical(mm/kg)·bezel 값 존재, display FHD', () => {
  for (const m of SIGNAGE_MODELS.filter(x => x.category === 'video_wall')) {
    assert.equal(typeof m.physical.widthMm, 'number');
    assert.equal(typeof m.physical.heightMm, 'number');
    assert.equal(typeof m.physical.depthMm, 'number');
    assert.equal(typeof m.physical.weightKg, 'number');
    assert.equal(typeof m.videoWall.bezelMm, 'number');
    assert.equal(m.videoWall.bezelDefinition, 'bezel_to_bezel');
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
  assert.equal(qm55.verification.status, 'verified');

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
  assert.equal(vmb46.verification.status, 'verified');
});
