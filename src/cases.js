// cases.js — 설치 사례 '엑셀 붙여넣기' 파서 (순수 함수, DOM/네트워크 없음).
// ─────────────────────────────────────────────────────────────────────────────
// 엑셀에서 셀 범위를 복사하면 탭(\t)으로 구분된 여러 줄 텍스트가 된다. 이를 사례 객체 배열로 바꾼다.
// 기대 열 순서: 설치장소 | 설치일 | 모델 | 열 | 행 | 메모
//   · 열·행 대신 "8x5"(또는 8×5)처럼 한 칸에 적어도 인식한다.
//   · 첫 줄이 머리글(설치장소/모델 등 글자)이면 건너뛴다.
// 해상도는 저장하지 않고 화면에서 모델+배열로 자동 계산해 표시한다.
// ─────────────────────────────────────────────────────────────────────────────

const toInt = v => { const n = parseInt(String(v).replace(/[^0-9-]/g, ''), 10); return Number.isFinite(n) ? n : null; };

// "8x5" / "8×5" / "8*5" → { cols, rows }. 아니면 null.
function parseArrayToken(s) {
  const m = /^\s*(\d+)\s*[x×*]\s*(\d+)\s*$/i.exec(String(s || ''));
  return m ? { cols: parseInt(m[1], 10), rows: parseInt(m[2], 10) } : null;
}

// 날짜 문자열을 'YYYY-MM-DD'로 정규화. 인식 실패 시 null.
export function normalizeDate(s) {
  const t = String(s || '').trim();
  if (!t) return null;
  const m = /^(\d{4})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})/.exec(t);
  if (!m) return null;
  const y = m[1], mo = String(m[2]).padStart(2, '0'), d = String(m[3]).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

// 머리글 줄인지 판단: '열'(배열) 칸이 숫자도 "NxM"도 아니면 머리글로 본다.
// (데이터 줄은 배열 칸이 항상 숫자/NxM이므로, 사이트명이 '현장C'처럼 '현장'을 포함해도 안전하다.)
function looksLikeHeader(cells) {
  return !parseArrayToken(cells[3]) && toInt(cells[3]) === null;
}

// 붙여넣은 텍스트(TSV)를 사례 객체 배열로 변환.
// 반환 각 항목: { name, site, install_date, model_name, cols, rows, memo }
export function parseCasesTSV(text) {
  const lines = String(text || '').split(/\r?\n/).map(l => l.replace(/\s+$/, '')).filter(l => l.trim() !== '');
  const out = [];
  lines.forEach((line, i) => {
    const cells = line.split('\t').map(c => c.trim());
    if (i === 0 && looksLikeHeader(cells)) return;   // 머리글 줄 건너뜀
    const site = cells[0] || '';
    const install_date = normalizeDate(cells[1]);
    const model_name = cells[2] || '';
    let cols = null, rows = null, memo = '';
    const arr = parseArrayToken(cells[3]);
    if (arr) { cols = arr.cols; rows = arr.rows; memo = cells[4] || ''; }
    else { cols = toInt(cells[3]); rows = toInt(cells[4]); memo = cells[5] || ''; }
    // 모델도 없고 배열도 없는 줄은 무효로 건너뜀.
    if (!model_name && !(cols && rows)) return;
    const name = [site, model_name, (cols && rows) ? `${cols}×${rows}` : ''].filter(Boolean).join(' ').trim() || '설치사례';
    out.push({ name, site, install_date, model_name, cols, rows, memo });
  });
  return out;
}
