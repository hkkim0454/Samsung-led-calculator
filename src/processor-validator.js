// ─────────────────────────────────────────────────────────────────────────────
// 비디오 프로세서 — Capacity Fit / Operation Fit 2단계 판정 (SoT + plan v2, 2026-09-13)
//
// 1) Capacity Fit (validateProcessor): 하드 제약. 제조사별 Layer validator를 분리 호출.
//    하나라도 false → FAIL, false 없고 null 있으면 CONDITIONAL, 모두 true면 PASS.
// 2) Operation Fit (operationFit): 공간 용도(5종) 성향으로 통과 제품의 우선순위/등급 결정.
//
// 원칙(SoT §18): 미확인(null)은 PASS 아님(=CONDITIONAL). null !== false. 임의 % 점수 없음.
// ─────────────────────────────────────────────────────────────────────────────

import {
  INPUT_2K_PER_CARD,
  inputsCapacity,
  outputCapacity,
  validateOutputCardLayers,
} from './processor-limits.js?v=248';

function maxNullable(...vals) {
  const nums = vals.filter(v => v != null);
  return nums.length ? Math.max(...nums) : null;
}

// ── 제조사별 Layer validator (SoT §6 — 반드시 분리) ────────────────────────────
function validateAnalogWayLayers(proc, req, numCheck) {
  const L = proc.layers ?? {};
  // True A/B가 필요하면 반드시 '믹싱' 레이어만(분할로 대체 불가, SoT §7).
  if (req.requiredMixingLayers > 0) numCheck('4K 믹싱 레이어(A/B)', req.requiredMixingLayers, L.mixing4k ?? null);
  if (req.requiredSplitLayers > 0) numCheck('4K 레이어(믹싱/분할)', req.requiredSplitLayers, maxNullable(L.split4k, L.mixing4k));
}
function validateX100Windows(proc, req, numCheck) {
  const L = proc.layers ?? {};
  // Window≠Layer(SoT §9·§14). 공식 Max Windows가 요구를 만족하면 PASS 가능(지침 4).
  if (req.requiredWindows > 0) numCheck('최대 윈도우', req.requiredWindows, L.maxWindows ?? null, '개', 'Window≠Layer(공식 Max Windows)');
  // per-output-card 4K Layer 한계는 공식 미확인 → 추정 금지(검사하지 않음).
}
function validateUniverseLayers(proc, req, numCheck) {
  const L = proc.layers ?? {};
  if (req.required4kLayers > 0) numCheck('4K 레이어(전역)', req.required4kLayers, L.global4k ?? null);
  if (req.required2kLayers > 0) numCheck('2K 레이어(전역)', req.required2kLayers, L.global2k ?? null);
  // per-board 몰림 검사는 validateOutputCardLayers()에서(전역 + 보드별 둘 다).
}
function validateNovaStarLayers(proc, req, numCheck) {
  const L = proc.layers ?? {};
  const boards = proc.slots?.maxOutputBoards ?? null;
  if (req.required4kLayers > 0) {
    const cap = (L.perOutputCard4k != null && boards != null) ? L.perOutputCard4k * boards : null;
    numCheck('4K 레이어', req.required4kLayers, cap);
  }
  if (req.required2kLayers > 0) {
    const cap = (L.perOutputCard2k != null && boards != null) ? L.perOutputCard2k * boards : null;
    numCheck('2K 레이어', req.required2kLayers, cap);
  }
  // per-card 몰림 검사는 validateOutputCardLayers()에서.
}

/** Capacity Fit(하드 제약). 반환: { id, verdict, checks: [{name,need,have,unit,ok,note?}] }. */
export function validateProcessor(proc, req) {
  if (!proc || !req) return null;
  const checks = [];
  const numCheck = (name, need, have, unit = '개', note) => {
    let ok = null;
    if (need != null && have != null) ok = have >= need;
    checks.push({ name, need: need ?? null, have: have ?? null, unit, ok, ...(note ? { note } : {}) });
  };
  const featCheck = (name, required, have) => {
    if (!required) return;
    const ok = have === true ? true : (have === false ? false : null);
    checks.push({ name, need: '지원', have: have === true ? '지원' : (have === false ? '미지원' : '확인 필요'), unit: '', ok });
  };

  // 1) 필요 4K 출력 — 제조사별 출력용량(AW=PGM, X100/Universe=독립4K출력, NovaStar=출력카드수).
  if (req.required4kOutputs > 0) {
    const cap = outputCapacity(proc);
    const label = cap.kind === 'pgm' ? '4K PGM 출력' : (cap.assumed ? '4K 출력(카드 가정)' : '4K 출력');
    numCheck(label, req.required4kOutputs, cap.value);
  }

  // 2) 독립 입력(4K/2K). 입력 슬롯 공유검사는 '슬롯=4K1 또는 2K4' 비율 모델(X100/NovaStar)에만.
  const inCap = inputsCapacity(proc);
  if (req.independent4kInputs > 0) numCheck('독립 4K 입력', req.independent4kInputs, inCap.max4k, '개', inCap.assumed4k ? '입력카드 가정(슬롯=4K1)' : undefined);
  if (req.independent2kInputs > 0) numCheck('독립 2K 입력', req.independent2kInputs, inCap.max2k, '개', inCap.assumed2k ? '입력카드 가정(슬롯=2K4)' : undefined);
  if (req.independent4kInputs > 0 && req.independent2kInputs > 0 && inCap.slots != null
      && (proc.layers?.model === 'global_window' || proc.layers?.model === 'per_output_card')) {
    const need = req.independent4kInputs + Math.ceil(req.independent2kInputs / INPUT_2K_PER_CARD);
    numCheck('입력 슬롯', need, inCap.slots, '슬롯', '4K 1개=슬롯 1, 2K 4개=슬롯 1');
  }

  // 3) 레이어 — 제조사별 validator 분리(SoT §6).
  switch (proc.layers?.model) {
    case 'mixing_split':    validateAnalogWayLayers(proc, req, numCheck); break;
    case 'global_window':   validateX100Windows(proc, req, numCheck); break;
    case 'screen_group':    validateUniverseLayers(proc, req, numCheck); break;
    case 'per_output_card': validateNovaStarLayers(proc, req, numCheck); break;
  }
  // 3b) 출력카드/보드별 레이어 몰림(Universe 전역+보드, NovaStar 카드).
  const cardCheck = validateOutputCardLayers(proc, req);
  if (cardCheck) checks.push(cardCheck);

  // 4) Wide Canvas — 단일 캔버스가 여러 출력에 걸칠 때만(출력 수만으로 지원 단정 금지, SoT §15).
  if (req.requiredCanvasOutputs > 1 && req.canvasMode && req.canvasMode !== 'independent' && req.canvasMode !== 'multi_region') {
    const c = proc.canvas ?? {};
    const wantH = req.canvasMode === 'single_wide', wantV = req.canvasMode === 'single_tall';
    let ok = null;
    if (c.multiOutputCanvas === false) ok = false;
    else if (c.multiOutputCanvas === true && c.maxCanvasOutputs != null) {
      ok = c.maxCanvasOutputs >= req.requiredCanvasOutputs
        && (!wantH || c.horizontalSpan === true) && (!wantV || c.verticalSpan === true);
    }
    checks.push({ name: 'Wide Canvas', need: `${req.requiredCanvasOutputs}출력·${req.canvasMode}`, have: c.multiOutputCanvas == null ? '확인 필요' : (ok ? '지원' : '미지원/부족'), unit: '', ok });
  }

  // 5) 출력보드 혼용(모델별, 지침 2) — 4K+2K 혼합 출력을 요구할 때만.
  if (req.requiredMixed4k2kOutput) {
    const s = proc.outputBoardMixing?.supportsMixed4k2kBoards;
    const ok = s === true ? true : (s === false ? false : null);
    checks.push({ name: '4K+2K 출력보드 혼용', need: '지원', have: s === true ? '지원' : (s === false ? '불가' : '확인 필요'), unit: '', ok });
  }

  // 6) 스위칭/기능.
  featCheck('True A/B 믹싱', req.trueABRequired, proc.switching?.trueABMixing);
  featCheck('Seamless 스위칭', req.seamlessSwitching, proc.switching?.seamless);
  featCheck('Fade', req.fadeRequired, proc.switching?.fade);
  featCheck('Preview/Program', req.previewProgramRequired, proc.switching?.previewProgram);
  featCheck('Genlock', req.genlockRequired, proc.features?.genlock);
  featCheck('HDR', req.hdrRequired, proc.features?.hdr);
  featCheck('10-bit', req.tenBitRequired, proc.features?.tenBit);
  if (req.advancedTransitionRequired) {
    const g = proc.switching?.transitionGrade;
    const ok = g == null ? null : (g === 'live_production' || g === 'broadcast_grade');
    checks.push({ name: '고급 트랜지션', need: '지원', have: g ?? '확인 필요', unit: '', ok });
  }
  if (req.externalControlRequired) {
    const c = proc.control ?? {};
    const vals = [c.amxCompatible, c.crestronCompatible, c.tcp, c.restApi];
    const ok = vals.some(v => v === true) ? true : (vals.every(v => v === false) ? false : null);
    checks.push({ name: '외부 제어(AMX/Crestron 등)', need: '지원', have: ok === true ? '지원' : (ok === false ? '미지원' : '확인 필요'), unit: '', ok });
  }

  const anyFail = checks.some(c => c.ok === false);
  const anyUnknown = checks.some(c => c.ok === null);
  const verdict = anyFail ? 'FAIL' : (anyUnknown ? 'CONDITIONAL' : 'PASS');
  return { id: proc.id ?? null, verdict, checks };
}

// ── Operation Fit: 공간 용도 5종 성향(SoT §2). 통과 제품의 우선순위/등급 결정 ────────
//   family: Midra(Pulse/Eikos)·Alta(Zenith)·Aquilon = Analog Way / X100 Pro·Universe = Colorlight / H = NovaStar
const OPERATION_PREF = Object.freeze({
  exec:         ['Midra', 'Alta', 'Aquilon'],                 // 중역회의실 — Analog Way 최우선
  conference:   ['Midra', 'Alta', 'Aquilon', 'X100 Pro'],     // 회의실 — AW 우선, Colorlight 조건부
  auditorium:   ['Alta', 'Aquilon', 'Midra'],                 // 강당 — AW 최우선(공연·이벤트 성격 흡수)
  control_room: ['X100 Pro', 'Universe', 'H'],                // 상황실/관제실 — X100 우선, NovaStar 후순위
  lobby:        ['X100 Pro', 'Universe', 'H'],                // 로비 사이니지 — Colorlight 우선, NovaStar 대안
});

/** Operation Fit. 반환: { rank(작을수록 우선, 미해당=99), preferred(용도 최우선군=rank 0) }. */
export function operationFit(proc, req) {
  const pref = OPERATION_PREF[req.application] ?? [];
  const idx = pref.indexOf(proc.family);
  return { rank: idx < 0 ? 99 : idx, preferred: idx === 0 };
}

const GRADE_ORDER = Object.freeze({ '권장': 0, '적합': 1, '조건부 적합': 2, '한계 구성': 3, '부적합': 4 });

// 소형 작업(필요 4K 출력 ≤2)에서는 고가 Aquilon을 추천에서 숨긴다(이사 지침, Operation Fit 규칙).
export const AQUILON_HIDE_MAX_4K_OUTPUTS = 2;
const isExpensiveOverspec = (proc, req) =>
  proc.family === 'Aquilon' && req.required4kOutputs != null && req.required4kOutputs <= AQUILON_HIDE_MAX_4K_OUTPUTS;

/** 최종 등급(임의 % 없음). Capacity verdict + Operation Fit + 여유(딱맞음) 조합. */
function statusLabel(verdict, op, tight) {
  if (verdict === 'FAIL') return '부적합';
  if (verdict === 'CONDITIONAL') return '조건부 적합';
  if (op.preferred) return '권장';       // PASS + 용도 최우선 제품군
  if (tight) return '한계 구성';          // PASS지만 딱 맞음(여유 없음)
  return '적합';
}

/**
 * 제품 목록 평가·정렬. 반환: [{ proc, verdict, checks, label, opRank, preferred, _headroom }].
 * needs_verification 제품(예: H20)은 제외(지침 6). 소형에서 Aquilon 숨김.
 * 정렬: (1) Operation Fit 우선순위 → (2) 등급 → (3) 여유 적은(적정) 모델 먼저.
 */
export function rankProcessors(procs, req) {
  if (!Array.isArray(procs) || !req) return [];
  return procs
    .filter(proc => proc.verification?.status !== 'needs_verification')
    .filter(proc => !isExpensiveOverspec(proc, req))
    .map(proc => {
      const v = validateProcessor(proc, req);
      const op = operationFit(proc, req);
      const nums = v.checks.filter(c => typeof c.need === 'number' && typeof c.have === 'number');
      const tight = nums.some(c => c.have === c.need);
      const label = statusLabel(v.verdict, op, tight);
      const out4k = v.checks.find(c => c.name.startsWith('4K 출력') || c.name === '4K PGM 출력');
      const headroom = (out4k && typeof out4k.have === 'number' && typeof out4k.need === 'number') ? out4k.have - out4k.need : 0;
      return { proc, ...v, label, opRank: op.rank, preferred: op.preferred, _headroom: headroom };
    })
    .sort((a, b) =>
      (a.opRank - b.opRank) ||
      (GRADE_ORDER[a.label] - GRADE_ORDER[b.label]) ||
      (a._headroom - b._headroom));
}

/** needs_verification(미검증) 후보 목록(자동추천 제외분). UI에서 별도 노출용. */
export function verificationPending(procs) {
  return (Array.isArray(procs) ? procs : []).filter(p => p.verification?.status === 'needs_verification');
}

/**
 * 사용자가 계획한 카드 구성(build)이 이 LED에 충분한지 검증.
 * build: { out4kCards, in4kPorts, in2kPorts }. 값 없으면 해당 검사 생략.
 */
export function validateBuild(proc, req, build = {}) {
  if (!proc || !req) return null;
  const checks = [];
  const cover = (name, need, have, unit) => {
    let ok = null; if (need != null && have != null) ok = have >= need;
    checks.push({ name, need: need ?? null, have: have ?? null, unit, ok });
  };
  const withinMax = (name, have, max, unit) => {
    if (have == null || max == null) return;
    if (have > max) checks.push({ name, need: max, have, unit, ok: false, note: '제품(섀시) 최대 초과' });
  };
  const inCap = inputsCapacity(proc);
  const outCap = outputCapacity(proc);

  if (build.out4kCards != null) {
    cover('4K 출력카드(보유)', req.required4kOutputs, build.out4kCards, '장');
    withinMax('4K 출력카드 섀시 한계', build.out4kCards, outCap.value, '장');
  }
  if (build.in4kPorts != null) {
    cover('4K 입력 포트(보유)', req.independent4kInputs, build.in4kPorts, '포트');
    withinMax('4K 입력 섀시 한계', build.in4kPorts, inCap.max4k, '포트');
  }
  if (build.in2kPorts != null) {
    cover('2K 입력 포트(보유)', req.independent2kInputs, build.in2kPorts, '포트');
    withinMax('2K 입력 섀시 한계', build.in2kPorts, inCap.max2k, '포트');
  }

  const anyFail = checks.some(c => c.ok === false);
  const anyUnknown = checks.some(c => c.ok === null);
  return { verdict: checks.length === 0 ? null : (anyFail ? 'FAIL' : (anyUnknown ? 'CONDITIONAL' : 'PASS')), checks };
}
