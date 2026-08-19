// prices.example.js — 가격표 "견본" 파일 (숫자는 모두 0/비움).
// ─────────────────────────────────────────────────────────────────────────────
// ※ 이 파일은 저장소에 올라갑니다(안전: 실제 단가 없음). "어떤 값을 넣으면 되는지" 안내용입니다.
// ※ 실제 단가는 이 파일을 복사해 `prices.local.js` 로 만들어 채웁니다.
//    `prices.local.js` 는 .gitignore 로 저장소·공개 웹에 절대 올라가지 않습니다(사내 전용).
//    프로그램은 `prices.local.js` 가 있으면 06 원가/견적 카드를 보여주고, 없으면 자동으로 숨깁니다.
//
// 단위: 원(KRW). cost = 우리 매입원가, sell = 고객 견적가.
// 값이 없는 항목(모델/컨트롤러)은 생략하면 됩니다 → 화면에 '—'(미설정)로 표시됩니다.
// ─────────────────────────────────────────────────────────────────────────────

export const PRICES = {
  // 1) LED 패널: 모델ID → { cost, sell } (원/EA). 수량은 '예비 포함' 총 캐비닛 수로 자동 곱셈.
  panels: {
    // 'MP012F': { cost: 0, sell: 0 },
    // 'MM015F': { cost: 0, sell: 0 },
  },

  // 2) S-BOX(컨트롤러): 컨트롤러 코드 → { cost, sell } (원/EA). 수량은 산출된 SBOX 대수로 자동.
  sbox: {
    // 'SBB-CS4BPGS': { cost: 0, sell: 0 },
    // 'SBB-SNOWAAE': { cost: 0, sell: 0 },
    // 'SBB-SNOWJMU': { cost: 0, sell: 0 },
  },

  // 3) Gbic(광모듈): { cost, sell } (원/EA). 수량은 산출된 Gbic EA(=SET×2)로 자동. 없으면 생략.
  gbic: null, // 예: { cost: 0, sell: 0 }

  // 4) 설치 인건비: { costPerM2, sellPerM2, highWorkMultiplier } (원/㎡). 면적(㎡)에 자동 곱셈.
  //    highWorkMultiplier: '고소작업' 체크 시 설치비에 곱하는 할증 배수(예: 1.4 = +40%). 현장별 편차 큼 — 필요 시 조정.
  install: null, // 예: { costPerM2: 0, sellPerM2: 0, highWorkMultiplier: 1.4 }

  // 5) 기타 자재(프레임·지그·케이블·배관 등): 자동 수량규칙이 아직 없어 화면에서 직접 금액 입력.
  //    아래 값은 그 입력칸의 '초깃값'으로만 쓰입니다(프로젝트마다 달라 0 권장).
  etcDefault: { cost: 0, sell: 0 },

  // 6) 간접비(표준품셈): 원가 기준으로 산출해 '견적'에만 가산. base = 'labor'(노무비 대비)/
  //    'direct'(직접비 대비)/'special'(직접비+간접노무비+산업안전관리비). 요율(pct)은 연도별 조정.
  //    생략(null)하면 간접비 미적용. 예:
  // indirect: {
  //   items: [
  //     { name: '간접노무비', base: 'labor', pct: 4.86 },
  //     { name: '산업안전보건관리비', base: 'direct', pct: 3.11 },
  //     { name: '공과잡비', base: 'special', pct: 10.0 },
  //   ],
  // },
  indirect: null,
};
