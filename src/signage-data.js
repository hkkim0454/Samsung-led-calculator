// src/signage-data.js
// Samsung LCD Signage 모델 라이브러리 — standalone_signage / video_wall 두 종류만.
//
// 이 파일은 "제품 라이브러리(데이터 + 검증)"만 담는다.
//   - 기존 Samsung LED(models.js) · engine.js · processor 로직과 완전히 독립적이다(참조·수정 없음).
//   - UI · 추천 알고리즘 · 자동 배치 로직은 여기에 넣지 않는다(이번 단계 범위 밖).
//
// 데이터 규칙(엄수):
//   1) 공식/승인 자료에서 확인되지 않은 값은 반드시 null. 추정 금지.
//   2) null 을 false 또는 0 으로 바꾸지 말 것.
//   3) modelCode 를 가장 신뢰도 높은 식별자로 사용. 중복 등록 금지.
//   4) family / model / modelCode / productGroup 은 서로 다른 개념. 모델코드에서 spec 을 추론하지 말 것.

// 공통 스키마(모든 필드 null 기본값). 확인된 값만 덮어쓴다.
function baseSchema() {
  return {
    manufacturer: 'Samsung',

    category: null,
    family: null,
    model: null,
    modelCode: null,
    productGroup: null,

    display: {
      screenSizeInch: null,
      screenSizeCm: null,

      resolution: {
        width: null,
        height: null,
        label: null,
      },

      brightnessNit: null,
      contrastRatio: null,
      panelType: null,

      viewingAngle: {
        horizontal: null,
        vertical: null,
      },

      responseTimeMs: null,
    },

    videoWall: {
      bezelMm: null,
      bezelDefinition: null,
    },

    physical: {
      widthMm: null,
      heightMm: null,
      depthMm: null,
      weightKg: null,
      vesaMm: null,
      bezelMm: null,
    },

    operation: {
      ratedUsage: null,
      portraitSupport: null,
      landscapeSupport: null,
    },

    io: {
      hdmiIn: null,
      hdmiOut: null,
      displayPortIn: null,
      displayPortOut: null,
      usb: null,
      rs232In: null,
      rs232Out: null,
      rj45: null,
      note: null,
    },

    // I/O 전용 출처(물리/디스플레이 verification과 분리 추적). 미채움이면 status=null.
    ioVerification: {
      status: null,
      sourceUrl: null,
      verifiedAt: null,
      notes: null,
    },

    power: {
      typicalW: null,
      maxW: null,
      sleepW: null,
    },

    features: {
      hdr: null,
      speakerW: null,
      soc: null,        // 운영체제 버전 문자열(예: 'Tizen 7.0'). 미확인=null.
      tizen: null,
      wifi: null,
      bluetooth: null,
      ir: null,
      magicInfo: null,  // MagicINFO 지원 여부(true/false), 미확인=null
      vxt: null,        // VXT(Visual eXperience Transformation) 지원 여부, 미확인=null
    },

    verification: {
      status: null,
      sourceDocument: null,
      sourcePage: null,
      verifiedAt: '2026-09-14',
      notes: null,
    },
  };
}

// ── Standalone Signage (QMC / QHC) ────────────────────────────────────────────
// 확인 근거: Samsung Business Catalog 2026-09, p.33 (official_catalog).
//   screenSizeInch 는 카탈로그에서 별도 확인 안 됨 → null(추정 금지). screenSizeCm 만 저장.
function standalone(family, model, modelCode, screenSizeCm, resW, resH, resLabel, brightnessNit, contrastRatio, responseTimeMs) {
  const s = baseSchema();
  s.category = 'standalone_signage';
  s.family = family;
  s.model = model;
  s.modelCode = modelCode;
  s.display.screenSizeCm = screenSizeCm;
  s.display.resolution = { width: resW, height: resH, label: resLabel };
  s.display.brightnessNit = brightnessNit;
  s.display.contrastRatio = contrastRatio;
  s.display.viewingAngle = { horizontal: 178, vertical: 178 };
  s.display.responseTimeMs = responseTimeMs;
  s.verification = {
    status: 'official_catalog',
    sourceDocument: 'Samsung Business Catalog 2026-09',
    sourcePage: 33,
    verifiedAt: '2026-09-14',
    notes: null,
  };
  return s;
}

// ── Video Wall (지정 6종만) ───────────────────────────────────────────────────
// 확인 근거: Samsung Video Wall specification list + Samsung Business Catalog 2026-09 (user_approved_source).
//   model / family 는 확인 안 됨 → null. productGroup 만 저장. bezel 은 승인 자료 값(catalog_value).
//   ※ bezelMm 이 Bezel-to-Bezel 인지 개별 패널 베젤인지 추가 datasheet 확인 전까지 의미 추정 금지.
function videoWall(modelCode, productGroup, screenSizeInch, resW, resH, resLabel, brightnessNit, contrastRatio, responseTimeMs, bezelMm, widthMm, heightMm, depthMm, weightKg) {
  const s = baseSchema();
  s.category = 'video_wall';
  s.modelCode = modelCode;
  s.productGroup = productGroup;
  s.display.screenSizeInch = screenSizeInch;
  s.display.resolution = { width: resW, height: resH, label: resLabel };
  s.display.brightnessNit = brightnessNit;
  s.display.contrastRatio = contrastRatio;
  s.display.viewingAngle = { horizontal: 178, vertical: 178 };
  s.display.responseTimeMs = responseTimeMs;
  s.videoWall = { bezelMm, bezelDefinition: 'bezel_to_bezel' };   // 교차확인(VMC-R: 0.88mm=B2B, 개별 0.44mm) + 삼성 표기 관례
  s.physical.widthMm = widthMm;
  s.physical.heightMm = heightMm;
  s.physical.depthMm = depthMm;
  s.physical.weightKg = weightKg;
  s.verification = {
    status: 'verified',
    sourceDocument: 'Samsung Video Wall specification list + Samsung Business Catalog 2026-09',
    sourcePage: null,
    verifiedAt: '2026-09-14',
    notes: '오너 승인 자료(삼성 카탈로그) + 교차확인(2026-09-14): VMC-R 0.88mm=Bezel-to-Bezel(개별 0.44mm)·500nit·IP5X·깊이<70mm 일치. bezelMm=Bezel-to-Bezel(이미지 간격).',
  };
  return s;
}

export const SIGNAGE_MODELS = [
  // ── QMC (Standalone, 8종) ──
  standalone('QMC', 'QM32C', 'LH32QMCEBGCXKR', 80.1, 1920, 1080, 'FHD', 400, '4000:1', 8),
  standalone('QMC', 'QM43C', 'LH43QMCEBGCXKR', 108, 3840, 2160, 'UHD', 500, '4000:1', 8),
  standalone('QMC', 'QM50C', 'LH50QMCEBGCXKR', 125, 3840, 2160, 'UHD', 500, '4000:1', 10),
  standalone('QMC', 'QM55C', 'LH55QMCEBGCXKR', 138, 3840, 2160, 'UHD', 500, '4000:1', 8),
  standalone('QMC', 'QM65C', 'LH65QMCEBGCXKR', 163, 3840, 2160, 'UHD', 500, '4000:1', 8),
  standalone('QMC', 'QM75C', 'LH75QMCEBGCXKR', 189, 3840, 2160, 'UHD', 500, '4000:1', 8),
  standalone('QMC', 'QM85C', 'LH85QMCEBGCXKR', 214, 3840, 2160, 'UHD', 500, '4000:1', 10),
  standalone('QMC', 'QM98C', 'LH98QMCEBGCXKR', 247, 3840, 2160, 'UHD', 500, '5500:1', 8),

  // ── QHC (Standalone, 6종) ──
  standalone('QHC', 'QH43C', 'LH43QHCEBGCXKR', 108, 3840, 2160, 'UHD', 700, '4000:1', 8),
  standalone('QHC', 'QH50C', 'LH50QHCEBGCXKR', 125, 3840, 2160, 'UHD', 700, '4000:1', 10),
  standalone('QHC', 'QH55C', 'LH55QHCEBGCXKR', 138, 3840, 2160, 'UHD', 700, '4000:1', 8),
  standalone('QHC', 'QH65C', 'LH65QHCEBGCXKR', 163, 3840, 2160, 'UHD', 700, '4000:1', 8),
  standalone('QHC', 'QH75C', 'LH75QHCEBGCXKR', 189, 3840, 2160, 'UHD', 700, '4000:1', 8),
  standalone('QHC', 'QH115FX', 'LH115QHFEBGXKR', 290, 3840, 2160, 'UHD', 1000, '5500:1', 6.5),

  // ── Video Wall (지정 6종) ──
  // VM_500nit
  //   VMB-U 계열 (contrast 1200:1)
  videoWall('LH46VMBUBGBXKR', 'VM_500nit', 46, 1920, 1080, 'FHD', 500, '1200:1', 8, 3.5, 1022, 577, 69.9, 15.7),
  videoWall('LH55VMBUBGBXKR', 'VM_500nit', 55, 1920, 1080, 'FHD', 500, '1200:1', 8, 3.5, 1213.5, 684.3, 73.1, 21.2),
  //   VMHX-E 계열 (contrast 1000:1)
  videoWall('LH55VMHEBGBXKR', 'VM_500nit', 55, 1920, 1080, 'FHD', 500, '1000:1', 8, 1.74, 1212.2, 683.0, 70.4, 19.5),
  //   VMC-R 계열 (contrast 1100:1)
  videoWall('LH55VMCRBGBXKR', 'VM_500nit', 55, 1920, 1080, 'FHD', 500, '1100:1', 8, 0.88, 1211.0, 681.7, 69.9, 16.8),
  // VH_700nit
  //   VHHX-E 계열 (contrast 1000:1)
  videoWall('LH55VHHEBGBXKR', 'VH_700nit', 55, 1920, 1080, 'FHD', 700, '1000:1', 8, 1.74, 1212.2, 683.0, 70.4, 19.5),
  //   VHC-R 계열 (contrast 1100:1)
  videoWall('LH55VHCRBGBXKR', 'VH_700nit', 55, 1920, 1080, 'FHD', 700, '1100:1', 8, 0.88, 1211.0, 681.7, 69.9, 16.8),
];

// ── Standalone 외형·무게·VESA·전력·스피커 (Samsung 공식 데이터시트 수집, 2026-09-14) ──────
//   확인된 값만. 미확인은 null(추정 금지). powerMaxW·soc 는 데이터시트 미확인 → null 유지.
//   [w, h, d, weightKg, vesaMm, typicalW, speakerW, hdr, tizen]  (w/h/d = mm, without stand)
const STANDALONE_DATASHEET = {
  // QMC: 소비전력 typicalW = 삼성 공식 KR '소비전력(On Mode)'. QM98C는 미제공 → 기존 값 유지.
  LH32QMCEBGCXKR: { widthMm: 727.3, heightMm: 421.9, depthMm: 28.5, weightKg: 5.2, vesaMm: '100x100', typicalW: 55, sleepW: 0.5, speakerW: '10+10', hdr: null, tizen: true, panelType: 'VA', bezelMm: 11.5, soc: 'Tizen 7.0', wifi: true, bluetooth: true, ir: true, ratedUsage: '24/7' },
  LH43QMCEBGCXKR: { widthMm: 969.5, heightMm: 557.8, depthMm: 28.5, weightKg: 8.8, vesaMm: '200x200', typicalW: 121, sleepW: 0.5, speakerW: null, hdr: null, tizen: true, panelType: 'VA', bezelMm: 11.5, soc: 'Tizen 7.0', wifi: true, bluetooth: true, ir: true, ratedUsage: '24/7' },
  LH50QMCEBGCXKR: { widthMm: 1124.1, heightMm: 644.8, depthMm: 28.5, weightKg: 11.8, vesaMm: '200x200', typicalW: 132, sleepW: 0.5, speakerW: null, hdr: null, tizen: true, panelType: 'VA', bezelMm: 11.5, soc: 'Tizen 7.0', wifi: true, bluetooth: true, ir: true, ratedUsage: '24/7' },
  LH55QMCEBGCXKR: { widthMm: 1237.9, heightMm: 708.8, depthMm: 28.5, weightKg: 15.7, vesaMm: '200x200', typicalW: 154, sleepW: 0.5, speakerW: '10+10', hdr: null, tizen: true, panelType: 'VA', bezelMm: 11.5, soc: 'Tizen 7.0', wifi: true, bluetooth: true, ir: true, ratedUsage: '24/7' },
  LH65QMCEBGCXKR: { widthMm: 1456.8, heightMm: 831.9, depthMm: 28.5, weightKg: 21.5, vesaMm: '400x300', typicalW: 187, sleepW: 0.5, speakerW: '10+10', hdr: null, tizen: true, panelType: 'VA', bezelMm: 11.5, soc: 'Tizen 7.0', wifi: true, bluetooth: true, ir: true, ratedUsage: '24/7' },
  LH75QMCEBGCXKR: { widthMm: 1682.3, heightMm: 960.4, depthMm: 28.5, weightKg: 33.4, vesaMm: '400x400', typicalW: 214.5, sleepW: 0.5, speakerW: '10+10', hdr: null, tizen: true, panelType: 'VA', bezelMm: 13.4, soc: 'Tizen 7.0', wifi: true, bluetooth: true, ir: true, ratedUsage: '24/7' },
  LH85QMCEBGCXKR: { widthMm: 1904.3, heightMm: 1085.3, depthMm: 28.5, weightKg: 41.9, vesaMm: '600x400', typicalW: 330, sleepW: 0.5, speakerW: '10+10', hdr: null, tizen: true, panelType: 'VA', bezelMm: 13.9, soc: 'Tizen 7.0', wifi: true, bluetooth: true, ir: true, ratedUsage: '24/7' },
  LH98QMCEBGCXKR: { widthMm: 2193.2, heightMm: 1248.8, depthMm: 48.1, weightKg: 56.3, vesaMm: '600x400', typicalW: 197, speakerW: '10+10', hdr: null, tizen: true },
  // QHC: 소비전력 typicalW = 삼성 공식 KR 페이지 '소비전력(On Mode)'로 교체(이사 승인 2026-09-14). 핵심 항목 추가.
  LH43QHCEBGCXKR: { widthMm: 969.5, heightMm: 557.8, depthMm: 28.5, weightKg: 9.3, vesaMm: '200x200', typicalW: 132, sleepW: 0.5, speakerW: '10+10', hdr: null, tizen: true, panelType: 'VA', bezelMm: 11.5, soc: 'Tizen 7.0', wifi: true, bluetooth: true, ir: true, ratedUsage: '24/7' },
  LH50QHCEBGCXKR: { widthMm: 1124.1, heightMm: 644.8, depthMm: 28.5, weightKg: 12.4, vesaMm: '200x200', typicalW: 165, sleepW: 0.5, speakerW: '10+10', hdr: null, tizen: true, panelType: 'VA', bezelMm: 11.5, soc: 'Tizen 7.0', wifi: true, bluetooth: true, ir: true, ratedUsage: '24/7' },
  LH55QHCEBGCXKR: { widthMm: 1237.9, heightMm: 708.8, depthMm: 28.5, weightKg: 16.9, vesaMm: '200x200', typicalW: 187, sleepW: 0.5, speakerW: '10+10', hdr: null, tizen: true, panelType: 'VA', bezelMm: 11.5, soc: 'Tizen 7.0', wifi: true, bluetooth: true, ir: true, ratedUsage: '24/7' },
  LH65QHCEBGCXKR: { widthMm: 1456.8, heightMm: 831.9, depthMm: 28.5, weightKg: 22.7, vesaMm: '400x300', typicalW: 203.5, sleepW: 0.5, speakerW: '10+10', hdr: null, tizen: true, panelType: 'VA', bezelMm: 11.5, soc: 'Tizen 7.0', wifi: true, bluetooth: true, ir: true, ratedUsage: '24/7' },
  LH75QHCEBGCXKR: { widthMm: 1682.3, heightMm: 960.4, depthMm: 28.5, weightKg: 34.6, vesaMm: '400x400', typicalW: 275, sleepW: 0.5, speakerW: '10+10', hdr: null, tizen: true, panelType: 'VA', bezelMm: 13.4, soc: 'Tizen 7.0', wifi: true, bluetooth: true, ir: true, ratedUsage: '24/7' },
  LH115QHFEBGXKR: { widthMm: 2565.2, heightMm: 1467.6, depthMm: 34.1, weightKg: 83.7, vesaMm: '1000x600', typicalW: 836, speakerW: 60, hdr: true, tizen: true, ratedUsage: '24/7', vxt: true },
};
for (const m of SIGNAGE_MODELS) {
  const d = STANDALONE_DATASHEET[m.modelCode];
  if (!d) continue;
  m.physical.widthMm = d.widthMm;
  m.physical.heightMm = d.heightMm;
  m.physical.depthMm = d.depthMm;
  m.physical.weightKg = d.weightKg;
  m.physical.vesaMm = d.vesaMm ?? null;
  m.power.typicalW = d.typicalW ?? null;   // powerMaxW 는 미확인 → null 유지. typicalW = 공식 On Mode(있으면).
  m.power.sleepW = d.sleepW ?? null;
  m.features.speakerW = d.speakerW ?? null;
  m.features.hdr = d.hdr ?? null;
  m.features.tizen = d.tizen ?? null;
  // 핵심 추가 항목(삼성 공식 KR 페이지 확인값, 있으면만). 미확인은 null 유지.
  if (d.panelType != null) m.display.panelType = d.panelType;
  if (d.bezelMm != null) m.physical.bezelMm = d.bezelMm;
  if (d.soc != null) m.features.soc = d.soc;
  if (d.wifi != null) m.features.wifi = d.wifi;
  if (d.bluetooth != null) m.features.bluetooth = d.bluetooth;
  if (d.ir != null) m.features.ir = d.ir;
  if (d.magicInfo != null) m.features.magicInfo = d.magicInfo;
  if (d.vxt != null) m.features.vxt = d.vxt;
  if (d.ratedUsage != null) m.operation.ratedUsage = d.ratedUsage;
  // KR SKU(BXKR) 교차검증 완료(2026-09-14): 물리 스펙은 지역 공통(동일 패널)이며 독립 출처와 정확 일치
  //   (QM55C 15.7kg / QM98C 48.1mm·56.3kg / QH115FX 2565.2×1467.6×34.1mm·83.7kg·VESA1000×600).
  m.verification.status = 'verified';
  m.verification.notes = '외형·무게·VESA·해상도: Samsung 데이터시트 + KR SKU 교차검증(2026-09-14). 소비전력(typical=공식 On Mode)·Sleep전력·패널타입·베젤·SoC/OS·WiFi/BT/IR·사용시간(24/7): 삼성 공식 KR 제품페이지 확인(있는 모델만). powerMax 등 미확인 값은 null 유지.';
}

// ── I/O(입출력 단자) — 모델별 Samsung 공식 페이지/데이터시트 확인값 (2026-09-14) ──────
//   규칙: 확인 안 된 항목 = null(0 아님). 공식 "No" 명시만 0. 시리즈 공통이라도 자동 복사 금지 —
//   각 값은 해당 모델의 공식 출처(sourceUrl)에서 확인됨. rs232는 In/Out 분리. null 을 0 으로 바꾸지 말 것.
//   [hdmiIn, hdmiOut, displayPortIn, displayPortOut, usb, rs232In, rs232Out, rj45, note, sourceUrl]
const V = '2026-09-14';
const IO_DATA = {
  // QMC
  LH32QMCEBGCXKR: { hdmiIn: 3, hdmiOut: null, displayPortIn: 0, displayPortOut: null, usb: 2, rs232In: 1, rs232Out: 1, rj45: 1, note: 'HDMI 1.4; DP In=No', sourceUrl: 'https://www.samsung.com/in/business/smart-signage/uhd-4k-signage/smart-signage-qm32c-32-inch-lh32qmcebgcxxl/' },
  LH43QMCEBGCXKR: { hdmiIn: 3, hdmiOut: null, displayPortIn: 1, displayPortOut: null, usb: 2, rs232In: 1, rs232Out: 1, rj45: 1, note: 'HDMI 2.0; DP 1.2', sourceUrl: 'https://www.samsung.com/ca/business/smart-signage/uhd-4k-signage/crystal-uhd-signage-qmc-lh43qmcebgcxgo/' },
  LH50QMCEBGCXKR: { hdmiIn: 3, hdmiOut: null, displayPortIn: 1, displayPortOut: null, usb: 2, rs232In: 1, rs232Out: 1, rj45: 1, note: 'HDMI 2.0; DP 1.2', sourceUrl: 'https://www.samsung.com/in/business/smart-signage/uhd-4k-signage/crystal-uhd-signage-qmc-50-inch-lh50qmcebgcxxl/' },
  LH55QMCEBGCXKR: { hdmiIn: 3, hdmiOut: null, displayPortIn: 1, displayPortOut: null, usb: 2, rs232In: 1, rs232Out: 1, rj45: 1, note: 'HDMI 2.0; DP 1.2', sourceUrl: 'https://www.samsung.com/au/business/smart-signage/uhd-4k-signage/crystal-uhd-signage-qmc-lh55qmcebgcxxy/' },
  LH65QMCEBGCXKR: { hdmiIn: 3, hdmiOut: null, displayPortIn: 1, displayPortOut: null, usb: 2, rs232In: 1, rs232Out: 1, rj45: 1, note: 'HDMI 2.0; DP 1.2', sourceUrl: 'https://www.samsung.com/au/business/smart-signage/uhd-4k-signage/crystal-uhd-signage-qmc-lh65qmcebgcxxy/' },
  LH75QMCEBGCXKR: { hdmiIn: 3, hdmiOut: null, displayPortIn: 1, displayPortOut: null, usb: 2, rs232In: 1, rs232Out: 1, rj45: 1, note: 'HDMI 2.0; DP 1.2', sourceUrl: 'https://www.samsung.com/ca/business/smart-signage/uhd-4k-signage/crystal-uhd-signage-qmc-lh75qmcebgcxgo/' },
  LH85QMCEBGCXKR: { hdmiIn: 3, hdmiOut: null, displayPortIn: 1, displayPortOut: null, usb: 2, rs232In: 1, rs232Out: 1, rj45: 1, note: 'HDMI 2.0; DP 1.2', sourceUrl: 'https://www.samsung.com/au/business/smart-signage/uhd-4k-signage/crystal-uhd-signage-qmc-lh85qmcebgcxxy/' },
  LH98QMCEBGCXKR: { hdmiIn: 3, hdmiOut: null, displayPortIn: 1, displayPortOut: null, usb: 2, rs232In: 1, rs232Out: 1, rj45: 1, note: 'HDMI 2.0; DP 1.2', sourceUrl: 'https://www.samsung.com/sa_en/smart-signage/uhd-4k-signage/uhd-signage-qm98c-98-inch-lh98qmcebgcxue/' },
  // QHC
  LH43QHCEBGCXKR: { hdmiIn: 3, hdmiOut: null, displayPortIn: 1, displayPortOut: null, usb: 2, rs232In: 1, rs232Out: 1, rj45: 1, note: 'HDMI 2.0; DP 1.2', sourceUrl: 'https://www.samsung.com/sg/business/smart-signage/uhd-4k-signage/crystal-uhd-signage-qhc-43-inch-lh43qhcebgcxxs/' },
  LH50QHCEBGCXKR: { hdmiIn: 3, hdmiOut: null, displayPortIn: 1, displayPortOut: null, usb: 2, rs232In: 1, rs232Out: 1, rj45: 1, note: 'HDMI 2.0; DP 1.2', sourceUrl: 'https://www.samsung.com/in/business/smart-signage/uhd-4k-signage/crystal-uhd-signage-qhc-series-50-inch-lh50qhcebgcxxl/' },
  LH55QHCEBGCXKR: { hdmiIn: 3, hdmiOut: null, displayPortIn: 1, displayPortOut: null, usb: 2, rs232In: 1, rs232Out: 1, rj45: 1, note: 'HDMI 2.0; DP 1.2', sourceUrl: 'https://www.samsung.com/hk_en/business/smart-signage/uhd-4k-signage/crystal-uhd-signage-qhc-lh55qhcebgcxxk/' },
  LH65QHCEBGCXKR: { hdmiIn: 3, hdmiOut: null, displayPortIn: 1, displayPortOut: null, usb: 2, rs232In: 1, rs232Out: 1, rj45: 1, note: 'HDMI 2.0; DP 1.2', sourceUrl: 'https://www.samsung.com/sg/business/smart-signage/uhd-4k-signage/crystal-uhd-signage-qhc-65-inch-lh65qhcebgcxxs/' },
  LH75QHCEBGCXKR: { hdmiIn: 3, hdmiOut: null, displayPortIn: 1, displayPortOut: null, usb: 2, rs232In: 1, rs232Out: 1, rj45: 1, note: 'HDMI 2.0; DP 1.2', sourceUrl: 'https://www.samsung.com/sg/business/smart-signage/uhd-4k-signage/crystal-uhd-signage-qhc-75-inch-lh75qhcebgcxxs/' },
  LH115QHFEBGXKR: { hdmiIn: 3, hdmiOut: null, displayPortIn: 1, displayPortOut: null, usb: 2, rs232In: 1, rs232Out: 1, rj45: 1, note: 'HDMI 2.1; DP 1.4; USB-A x2', sourceUrl: 'https://www.samsung.com/hk_en/business/smart-signage/uhd-4k-signage/qh115-fxuhd-signage-lh115qhfebgxxk/' },
  // Video Wall
  LH46VMBUBGBXKR: { hdmiIn: 2, hdmiOut: 0, displayPortIn: 1, displayPortOut: 1, usb: 1, rs232In: 1, rs232Out: 1, rj45: 1, note: 'HDMI 2.0; DP 1.2; DP Out=Loop-out; USB=F/W upgrade only', sourceUrl: 'https://images.samsung.com/is/content/samsung/assets/jp/business/displays/250709_Summary_Specifications_Catalog.pdf' },
  LH55VMBUBGBXKR: { hdmiIn: 2, hdmiOut: null, displayPortIn: 1, displayPortOut: 1, usb: 1, rs232In: 1, rs232Out: 1, rj45: 1, note: 'HDMI 2.0; DP 1.2; DP Out=Loop-out; USB=F/W upgrade only', sourceUrl: 'https://images.samsung.com/is/content/samsung/assets/vn/offer/07292024/Samsung_Video_Wall_Displays_series_Leaflet_FINAL.pdf' },
  LH55VMHEBGBXKR: { hdmiIn: 2, hdmiOut: null, displayPortIn: 1, displayPortOut: null, usb: 1, rs232In: 1, rs232Out: 1, rj45: 1, note: 'HDMI 2.0; DP 1.2; official page lists Video Out=Yes but DP Out port count is not specified', sourceUrl: 'https://www.samsung.com/hk_en/business/smart-signage/video-wall/video-wall-vmhx-e-lh55vmhebgbxxk/' },
  LH55VMCRBGBXKR: { hdmiIn: 2, hdmiOut: null, displayPortIn: 1, displayPortOut: 1, usb: 1, rs232In: 1, rs232Out: 1, rj45: 1, note: 'HDMI 2.0; DP 1.2; DP Out=Loop-out; USB=F/W upgrade only', sourceUrl: 'https://images.samsung.com/is/content/samsung/assets/vn/offer/07292024/Samsung_Video_Wall_Displays_series_Leaflet_FINAL.pdf' },
  LH55VHHEBGBXKR: { hdmiIn: 2, hdmiOut: null, displayPortIn: 1, displayPortOut: null, usb: 1, rs232In: 1, rs232Out: 1, rj45: 1, note: 'HDMI 2.0; DP 1.2; official page lists Video Out=Yes but DP Out port count is not specified', sourceUrl: 'https://www.samsung.com/hk_en/business/smart-signage/video-wall/video-wall-vhhx-e-lh55vhhebgbxxk/' },
  LH55VHCRBGBXKR: { hdmiIn: 2, hdmiOut: 0, displayPortIn: 1, displayPortOut: 1, usb: 1, rs232In: 1, rs232Out: 1, rj45: 1, note: 'HDMI 2.0; DP 1.2; DP Out=Loop-out; USB=F/W upgrade only', sourceUrl: 'https://images.samsung.com/is/content/samsung/assets/jp/business/displays/250709_Summary_Specifications_Catalog.pdf' },
};
for (const m of SIGNAGE_MODELS) {
  const d = IO_DATA[m.modelCode];
  if (!d) continue;
  // 직접 대입(null/0 그대로 보존 — ??나 ||로 0 변환하지 않음).
  m.io.hdmiIn = d.hdmiIn;
  m.io.hdmiOut = d.hdmiOut;
  m.io.displayPortIn = d.displayPortIn;
  m.io.displayPortOut = d.displayPortOut;
  m.io.usb = d.usb;
  m.io.rs232In = d.rs232In;
  m.io.rs232Out = d.rs232Out;
  m.io.rj45 = d.rj45;
  m.io.note = d.note;
  m.ioVerification = { status: 'official_samsung', sourceUrl: d.sourceUrl, verifiedAt: V, notes: null };
}

// 허용값(검증 기준).
export const SIGNAGE_CATEGORIES = Object.freeze(['standalone_signage', 'video_wall']);
export const STANDALONE_FAMILIES = Object.freeze(['QMC', 'QHC']);
export const VIDEO_WALL_PRODUCT_GROUPS = Object.freeze(['VM_500nit', 'VH_700nit']);

/**
 * 라이브러리 무결성 검증. 문제 없으면 errors 빈 배열.
 * 반환: { ok, errors, counts:{ total, standalone, videoWall, qmc, qhc, vm500, vh700 } }
 * (이번 단계는 순수 데이터 라이브러리라, 계산이 아니라 데이터 규칙만 검사한다.)
 */
export function validateSignageLibrary(models = SIGNAGE_MODELS) {
  const errors = [];

  // 1. modelCode 중복 없음(신뢰 식별자).
  const seen = new Map();
  for (const m of models) {
    if (m.modelCode == null) { errors.push(`modelCode 누락: ${m.model ?? '(model null)'}`); continue; }
    if (seen.has(m.modelCode)) errors.push(`modelCode 중복: ${m.modelCode}`);
    seen.set(m.modelCode, (seen.get(m.modelCode) || 0) + 1);
  }

  // 5. category 허용값.
  for (const m of models) {
    if (!SIGNAGE_CATEGORIES.includes(m.category)) errors.push(`허용되지 않은 category: ${m.category} (${m.modelCode})`);
  }

  const standalone = models.filter(m => m.category === 'standalone_signage');
  const videoWall = models.filter(m => m.category === 'video_wall');
  const qmc = standalone.filter(m => m.family === 'QMC');
  const qhc = standalone.filter(m => m.family === 'QHC');
  const vm500 = videoWall.filter(m => m.productGroup === 'VM_500nit');
  const vh700 = videoWall.filter(m => m.productGroup === 'VH_700nit');

  // 6. standalone family 허용값.
  for (const m of standalone) {
    if (!STANDALONE_FAMILIES.includes(m.family)) errors.push(`허용되지 않은 standalone family: ${m.family} (${m.modelCode})`);
  }
  // 7. video wall productGroup 허용값.
  for (const m of videoWall) {
    if (!VIDEO_WALL_PRODUCT_GROUPS.includes(m.productGroup)) errors.push(`허용되지 않은 video_wall productGroup: ${m.productGroup} (${m.modelCode})`);
  }

  // 2·3·4. 모델 수.
  if (qmc.length !== 8) errors.push(`QMC 수 불일치: ${qmc.length} (기대 8)`);
  if (qhc.length !== 6) errors.push(`QHC 수 불일치: ${qhc.length} (기대 6)`);
  if (standalone.length !== 14) errors.push(`Standalone 수 불일치: ${standalone.length} (기대 14)`);
  if (videoWall.length !== 6) errors.push(`Video Wall 수 불일치: ${videoWall.length} (기대 6)`);
  if (models.length !== 20) errors.push(`전체 수 불일치: ${models.length} (기대 20)`);

  // 8·9·10. 값 타입(단위) — 값이 있으면 숫자여야 함. 없으면 null 허용(추정 금지).
  const numOrNull = (v) => v == null || typeof v === 'number';
  for (const m of models) {
    for (const k of ['widthMm', 'heightMm', 'depthMm', 'weightKg']) {   // mm / kg (vesaMm 은 "600x400" 형식 문자열 허용)
      if (!numOrNull(m.physical[k])) errors.push(`physical.${k} 숫자 아님: ${m.physical[k]} (${m.modelCode})`);
    }
    if (!numOrNull(m.display.brightnessNit)) errors.push(`brightnessNit 숫자 아님: ${m.display.brightnessNit} (${m.modelCode})`);   // nit
    if (!numOrNull(m.videoWall.bezelMm)) errors.push(`videoWall.bezelMm 숫자 아님 (${m.modelCode})`);
  }

  return {
    ok: errors.length === 0,
    errors,
    counts: {
      total: models.length,
      standalone: standalone.length,
      videoWall: videoWall.length,
      qmc: qmc.length,
      qhc: qhc.length,
      vm500: vm500.length,
      vh700: vh700.length,
    },
  };
}
