// ─────────────────────────────────────────────────────────────────────────────
// 비디오 프로세서 — 하드 제약 판정·등급·정렬 (DEC-030, 코드 3분할 2026-09-12)
//
// 이 파일은 "제품이 요구를 충족하는지"를 판정한다: validateProcessor(하드 제약 PASS/
// CONDITIONAL/FAIL), rankProcessors(등급 매김·정렬), validateBuild(실제 카드 구성 검증).
// 용량·한계 숫자 계산은 processor-limits.js가 담당하고, 여기서 그 결과를 조합해 판정만 한다.
//
// 데이터 신뢰성 원칙(SOURCE-OF-TRUTH.md §9): 필수 기능이 UNKNOWN(null)이면 PASS가 아니라
//   CONDITIONAL. null을 임의로 PASS로 만들지 않는다. (null !== false)
// ─────────────────────────────────────────────────────────────────────────────

import {
  INPUT_2K_PER_CARD,
  inputsCapacity,
  outputs4kCapacity,
  validateOutputCardLayers,
} from './processor-limits.js?v=211';

/** 여러 값 중 최댓값(null 무시). 전부 null이면 null. */
function maxNullable(...vals) {
  const nums = vals.filter(v => v != null);
  return nums.length ? Math.max(...nums) : null;
}

/**
 * 하드 제약 검사. proc(제품) vs req(processorRequirements 결과).
 * 각 검사 ok: true(충족)/false(미달)/null(사양 미확인). 요구하지 않은 항목은 검사 생략.
 * 종합 verdict: 하나라도 false면 FAIL, false는 없고 null 있으면 CONDITIONAL, 모두 true면 PASS.
 * 반환: { id, verdict, checks: [{name, need, have, unit, ok}] }.
 */
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

  // 1) 독립 입력(4K/2K) — 윈도우·레이어와 별개(문서 §4). 입력카드 기준(슬롯당 4K 1 또는 2K 4).
  const inCap = inputsCapacity(proc);
  if (req.independent4kInputs > 0) numCheck('독립 4K 입력', req.independent4kInputs, inCap.max4k, '개', inCap.assumed4k ? '입력카드 가정(슬롯=4K1)' : undefined);
  if (req.independent2kInputs > 0) numCheck('독립 2K 입력', req.independent2kInputs, inCap.max2k, '개', inCap.assumed2k ? '입력카드 가정(슬롯=2K4)' : undefined);
  // 4K·2K 입력이 동시에 필요하면 슬롯을 나눠 쓴다: 필요 4K + 올림(필요 2K/4) ≤ 슬롯 수.
  // 단, '슬롯 1개=4K1 또는 2K4' 비율이 맞는 X100(global_window)·NovaStar(per_output_card)에만 적용.
  // Universe(screen_group)는 입력카드 밀도가 달라(예: U9 보드당 2×4K) 이 비율을 쓰지 않는다.
  if (req.independent4kInputs > 0 && req.independent2kInputs > 0 && inCap.slots != null
      && (proc.layers?.model === 'global_window' || proc.layers?.model === 'per_output_card')) {
    const need = req.independent4kInputs + Math.ceil(req.independent2kInputs / INPUT_2K_PER_CARD);
    numCheck('입력 슬롯', need, inCap.slots, '슬롯', '4K 1개=슬롯 1, 2K 4개=슬롯 1');
  }

  // 2) 필요 출력 수(4K) — HDMI 2.0(4K@60) 포트 기준. 출력카드 HDMI 2.0 가정 시 유도값 사용.
  if (req.required4kOutputs > 0) {
    const cap4k = outputs4kCapacity(proc);
    numCheck(cap4k.assumed ? '4K 출력(HDMI2.0 가정)' : '4K 출력', req.required4kOutputs, cap4k.value);
  }

  // 3) 레이어 용량 — capacityModel별로 다르게 산출(문서 §5).
  const L = proc.layers ?? {};
  if (L.model === 'global_window') {
    // Colorlight X100 Pro: 공식 "Max. layers"는 해상도 무관 총 레이어(4K/2K로 쪼개지 않음, 이사 확인).
    const totalLayers = req.simultaneous4kLayers + req.simultaneous2kLayers;
    if (totalLayers > 0) numCheck('최대 레이어', totalLayers, L.maxLayers ?? L.maxWindows ?? null, '개', '해상도 무관 총 레이어(공식 Max. layers)');
  } else {
    if (req.simultaneous4kLayers > 0) {
      let cap = null, name = '4K 레이어';
      switch (L.model) {
        case 'mixing_split':
          // True A/B가 필요하면 반드시 '믹싱' 레이어만 사용(분할 레이어로 대체 불가, 문서 §12).
          cap = req.trueABRequired ? (L.mixing4k ?? null) : maxNullable(L.mixing4k, L.split4k);
          name = req.trueABRequired ? '4K 믹싱 레이어(A/B)' : '4K 레이어(믹싱/분할)';
          break;
        case 'per_output_card':
          cap = (L.perOutputCard4k != null && proc.outputs?.maxOutputBoards != null)
            ? L.perOutputCard4k * proc.outputs.maxOutputBoards : (L.global4k ?? null);
          break;
        case 'screen_group':
        default:
          cap = L.global4k ?? null;
      }
      numCheck(name, req.simultaneous4kLayers, cap);
    }
    if (req.simultaneous2kLayers > 0) {
      let cap = null;
      switch (L.model) {
        case 'per_output_card':
          cap = (L.perOutputCard2k != null && proc.outputs?.maxOutputBoards != null)
            ? L.perOutputCard2k * proc.outputs.maxOutputBoards : (L.global2k ?? null);
          break;
        case 'screen_group':
        default:
          cap = L.global2k ?? null;
      }
      numCheck('2K 레이어', req.simultaneous2kLayers, cap);
    }
  }

  // 3c) 출력카드/보드별 레이어 한계.
  const cardCheck = validateOutputCardLayers(proc, req);
  if (cardCheck) checks.push(cardCheck);

  // 4) 스위칭/기능 요구.
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

// 운용 환경별 우선 제품군(문서 §8). 정렬 시 가벼운 가중치로만 사용(v1은 정확한 판정이 우선, 문서 §16).
const APPLICATION_PREFERRED = Object.freeze({
  conference: ['Midra', 'Alta', 'X100 Pro'],
  auditorium: ['Alta', 'Aquilon', 'Universe', 'H'],
  event: ['Aquilon'],
  broadcast: ['Aquilon'],
  control_room: ['Universe', 'H'],
});

/** 등급 라벨. 미달=부적합, 미확인=조건부 적합, 충족 시 수치 여유로 권장/적합/한계 구성 구분. */
function gradeLabel(v) {
  if (!v || v.verdict === 'FAIL') return '부적합';
  if (v.verdict === 'CONDITIONAL') return '조건부 적합';
  const nums = v.checks.filter(c => typeof c.need === 'number' && typeof c.have === 'number');
  if (nums.some(c => c.have === c.need)) return '한계 구성';        // 딱 맞음
  if (nums.length && nums.every(c => c.have >= c.need * 1.5)) return '권장';  // 넉넉한 여유
  return '적합';
}

const GRADE_ORDER = Object.freeze({ '권장': 0, '적합': 1, '조건부 적합': 2, '한계 구성': 3, '부적합': 4 });

// 소형 작업(필요 4K 출력이 이 값 이하)에서는 고가의 Aquilon을 추천 목록에서 제외한다.
// (이사 지침 2026-09-12: "4K 2개 출력엔 Aquilon 절대 사용 안 함(가격). 예외 없음.")
export const AQUILON_HIDE_MAX_4K_OUTPUTS = 2;
const isExpensiveOverspec = (proc, req) =>
  proc.family === 'Aquilon' &&
  req.required4kOutputs != null &&
  req.required4kOutputs <= AQUILON_HIDE_MAX_4K_OUTPUTS;

/**
 * 제품 목록을 평가·정렬한다. 반환: [{ proc, verdict, checks, label, appPreferred }] (좋은 등급 먼저).
 * 동급이면 (1) 운용 환경 우선 제품군, (2) **필요에 가까운(여유가 적은) 작은 모델 우선**.
 *   → 소형 작업에서 대용량(고가) 모델이 위로 오지 않고 적정 모델이 먼저 추천된다(이사 지침 2026-09-12).
 * 소형 작업에서는 Aquilon(고가)을 목록에서 숨긴다(위 규칙, 예외 없음).
 */
export function rankProcessors(procs, req) {
  if (!Array.isArray(procs) || !req) return [];
  const pref = APPLICATION_PREFERRED[req.application] ?? [];
  return procs
    .filter(proc => !isExpensiveOverspec(proc, req))
    .map(proc => {
      const v = validateProcessor(proc, req);
      const out4k = v?.checks.find(c => c.name.startsWith('4K 출력'));
      const headroom = (out4k && typeof out4k.have === 'number' && typeof out4k.need === 'number') ? out4k.have - out4k.need : 0;
      return { proc, ...v, label: gradeLabel(v), appPreferred: pref.includes(proc.family), _headroom: headroom };
    })
    .sort((a, b) =>
      (GRADE_ORDER[a.label] - GRADE_ORDER[b.label]) ||
      (Number(b.appPreferred) - Number(a.appPreferred)) ||
      (a._headroom - b._headroom));   // 여유가 적은(적정 크기) 모델 먼저 → 대용량은 후순위
}

/**
 * 사용자가 실제로 계획한 카드 구성(build)이 이 LED에 충분한지 검증한다.
 * build: { out4kCards, in4kPorts, in2kPorts } — 값이 없으면(null/undefined) 해당 검사 생략.
 * 각 항목: (1) LED 요구를 덮는가(필요 ≤ 보유), (2) 제품(섀시) 최대에 맞는가(보유 ≤ 최대).
 * 반환: { verdict, checks:[{name,need,have,unit,ok,note?}] }.
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

  if (build.out4kCards != null) {
    cover('4K 출력카드(보유)', req.required4kOutputs, build.out4kCards, '장');
    withinMax('4K 출력카드 섀시 한계', build.out4kCards, proc.outputs?.max4k, '장');
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
