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
  outputCapacity2k,
  validateOutputCardLayers,
} from './processor-limits.js?v=273';

// ── 제조사별 Layer validator (SoT §6 — 반드시 분리) ────────────────────────────
function validateAnalogWayLayers(proc, req, numCheck) {
  const L = proc.layers ?? {};
  // True A/B가 필요하면 반드시 '믹싱' 레이어만(분할로 대체 불가, SoT §7).
  if (req.requiredMixingLayers > 0) numCheck('4K 믹싱 레이어(A/B)', req.requiredMixingLayers, L.mixing4k ?? null);
  // 분할(일반) 레이어 요구는 split4k만 본다. split4k가 null이면 mixing4k로 대체 추정하지 않고
  //   ok=null(→ CONDITIONAL) 처리한다(UNKNOWN=null≠PASS, 이사 지침).
  if (req.requiredSplitLayers > 0) numCheck('4K 레이어(믹싱/분할)', req.requiredSplitLayers, L.split4k ?? null);
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

  // 1) Samsung S-Box 출력 — topology 후보별 Capacity Fit(지침 1). UHD 중심 + 검증된 FHD 중심.
  //    규칙: 후보 중 하나라도 PASS면 출력 OK(기술적으로 사용 가능). 하나도 PASS 못하면
  //    기본(UHD) 후보 결과로 판정한다 — 미확인(null) 대체 후보가 확정 FAIL을 되살리지 않는다.
  //    통과한 후보는 passedTopologies로 결과에 보존한다.
  let passedTopologies = [], topologyResults = [];
  {
    const outCap = outputCapacity(proc);        // 4K 계열(AW=PGM / X100·Universe=독립4K / NovaStar=카드)
    const out2k = outputCapacity2k(proc);       // 2K 독립 출력(FHD 중심 후보용)
    const evalTopos = [];
    if (req.required4kOutputs > 0) evalTopos.push({ label: 'UHD 중심', kind: '4k', need: req.required4kOutputs });
    for (const t of (req.sboxTopologies ?? [])) {
      if (t.required2kOutputs != null && t.required2kOutputs > 0) evalTopos.push({ label: t.label, kind: '2k', need: t.required2kOutputs });
    }
    // 통합 벽 4K 패널 상한(예: Pulse 4K = 1판/S-Box 1개). null이면 제한 없음.
    const wallCap4k = proc.outputs?.maxWallSbox4k;
    let have4k = outCap.value;
    if (wallCap4k != null) have4k = (have4k != null) ? Math.min(have4k, wallCap4k) : wallCap4k;
    topologyResults = evalTopos.map(t => {
      const have = t.kind === '4k' ? have4k : out2k.value;
      const name = t.kind === '2k' ? '2K 출력'
        : (outCap.kind === 'pgm' ? '4K PGM 출력' : (outCap.assumed ? '4K 출력(카드 가정)' : '4K 출력'));
      const ok = (t.need != null && have != null) ? have >= t.need : null;
      return { label: t.label, name, need: t.need, have: have ?? null, ok };
    });
    if (topologyResults.length) {
      const primary = topologyResults[0];
      const anyPass = topologyResults.some(t => t.ok === true);
      const outputOk = anyPass ? true : primary.ok;
      passedTopologies = topologyResults.filter(t => t.ok === true).map(t => t.label);
      const shown = topologyResults.find(t => t.ok === true) || primary;
      const note = topologyResults.length > 1
        ? 'S-Box 후보 — ' + topologyResults.map(t => `${t.label}: ${t.name} ${t.have ?? '?'}/${t.need}${t.ok === true ? ' ✓' : t.ok === false ? ' ✗' : ' ?'}`).join(' · ')
        : undefined;
      checks.push({ name: shown.name, need: shown.need ?? null, have: shown.have ?? null, unit: '개', ok: outputOk, ...(note ? { note } : {}) });
    }
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
  return { id: proc.id ?? null, verdict, checks, passedTopologies, topologyResults };
}

// ── Operation Fit: 공간 용도 5종 성향(SoT §2). 통과 제품의 우선순위/등급 결정 ────────
//   family: Midra(Pulse/Eikos)·Alta(Zenith)·Aquilon = Analog Way / X100 Pro·Universe = Colorlight / H = NovaStar
const OPERATION_PREF = Object.freeze({
  exec:         ['Midra 4K', 'Alta 4K', 'Aquilon'],                 // 중역회의실 — Analog Way 최우선
  conference:   ['Midra 4K', 'Alta 4K', 'Aquilon', 'X100 Pro'],     // 회의실 — AW 우선, Colorlight 조건부
  auditorium:   ['Alta 4K', 'Aquilon', 'Midra 4K'],                 // 강당 — AW 최우선(공연·이벤트 성격 흡수)
  control_room: ['X100 Pro', 'Universe', 'H'],                // 상황실/관제실 — X100 우선, NovaStar 후순위
  lobby:        ['X100 Pro', 'Universe', 'H'],                // 로비 사이니지 — Colorlight 우선, NovaStar 대안
});

// 소형 작업(필요 4K 출력 ≤2) 기준. 이 이하 + 고급요구 없음이면 고가 Aquilon을 후순위로 내린다.
// (하드 필터 아님 — 확장/이중화/커스터마이즈/LivePremier 요구가 있으면 다시 상위 후보가 됨, 지침 2)
export const AQUILON_SMALL_JOB_MAX_4K = 2;
const AQUILON_SMALL_JOB_PENALTY = 100;   // 소형·단순에서 Aquilon을 뒤로(제거는 안 함)

/**
 * 제품 단위 Operation Fit 보정(지침 3). 제조사 선호(baseRank)에 운영 요구를 반영해 미세 조정.
 * 낮을수록 우선. family 밴드(×10)를 넘어설 수 있어 예: 확장/이중화 요구 시 Aquilon이 고정형 Alta보다 앞설 수 있다.
 */
function productAdjust(proc, req) {
  let adj = 0;
  const smallJob = req.required4kOutputs != null && req.required4kOutputs <= AQUILON_SMALL_JOB_MAX_4K;
  const wantsHighEnd = !!(req.expansionRequired || req.redundancyRequired || req.customizableRequired || req.livePremierPreferred);
  if (proc.family === 'Aquilon') {
    if (smallJob && !wantsHighEnd) adj += AQUILON_SMALL_JOB_PENALTY;   // 소형·단순 → 후순위(삭제 아님)
    if (req.expansionRequired)    adj -= 6;    // 향후 I/O 확장
    if (req.redundancyRequired)   adj -= 6;    // Redundant PSU 등
    if (req.customizableRequired) adj -= 4;    // 커스터마이즈 구성
    if (req.livePremierPreferred) adj -= 3;    // LivePremier 생태계
  }
  // 고정형 라인(Alta 4K/Midra 4K)은 확장·이중화 요구가 크면 상대적으로 후순위.
  if (proc.family === 'Alta 4K' || proc.family === 'Midra 4K') {
    if (req.expansionRequired)  adj += 3;
    if (req.redundancyRequired) adj += 3;
  }
  // 다중 윈도우 우선 → X100 Pro(global_window) 가점.
  if (req.multiWindowPriority && proc.family === 'X100 Pro') adj -= 4;
  // 전환효과(Fade/Seamless/True A/B/PGM/고급 트랜지션) 중시 → Analog Way 계열 가점.
  if ((req.fadeRequired || req.seamlessSwitching || req.trueABRequired || req.previewProgramRequired || req.advancedTransitionRequired)
      && (proc.family === 'Midra 4K' || proc.family === 'Alta 4K' || proc.family === 'Aquilon')) adj -= 2;
  // 고정 솔루션 선호 → Midra 4K/Alta 4K 가점, 모듈형 Aquilon 감점.
  if (req.fixedSolutionPreferred) {
    if (proc.family === 'Midra 4K' || proc.family === 'Alta 4K') adj -= 2;
    if (proc.family === 'Aquilon') adj += 3;
  }
  // 2출력 이상 Wide Canvas(가로/세로 확장)가 필요하면, 실제로 지원하는 제품(예: Eikos 4K Edge-Blending) 가점(지침 5).
  if (req.requiredCanvasOutputs > 1 && req.canvasMode && req.canvasMode !== 'independent'
      && req.canvasMode !== 'multi_region' && proc.canvas?.multiOutputCanvas === true) adj -= 5;
  return adj;
}

/**
 * Operation Fit. 반환: { rank(작을수록 우선), preferred(용도 최우선 제품군), baseRank }.
 *   rank = 제조사 선호 밴드(baseRank×10) + 제품단위 보정(productAdjust). 제조사 선호만으로 끝내지 않는다.
 *   preferred는 라벨용으로 제조사 선호(최우선군) 기준을 유지한다.
 */
export function operationFit(proc, req) {
  const pref = OPERATION_PREF[req.application] ?? [];
  const idx = pref.indexOf(proc.family);
  const baseRank = idx < 0 ? 99 : idx;
  const rank = baseRank * 10 + productAdjust(proc, req);
  return { rank, preferred: idx === 0, baseRank };
}

const GRADE_ORDER = Object.freeze({ '권장': 0, '적합': 1, '조건부 적합': 2, '한계 구성': 3, '부적합': 4 });

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
 * needs_verification 제품(예: H20)은 제외(지침 6). Aquilon은 하드 제외하지 않고 Operation Fit
 * 점수(productAdjust)로 소형·단순에선 후순위, 확장/이중화 요구 시 상위로 정렬(지침 2).
 * 정렬: (1) Operation Fit 점수 → (2) 등급 → (3) 여유 적은(적정) 모델 먼저.
 */
export function rankProcessors(procs, req) {
  if (!Array.isArray(procs) || !req) return [];
  return procs
    .filter(proc => proc.verification?.status !== 'needs_verification')
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
