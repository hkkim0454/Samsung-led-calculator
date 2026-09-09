// cases.js — 설치 사례 '엑셀 붙여넣기/CSV' 파서 (순수 함수, DOM/네트워크 없음).
// ─────────────────────────────────────────────────────────────────────────────
// 엑셀에서 셀을 복사하면 탭(\t) 구분, CSV 파일은 쉼표(,) 구분이다. 둘 다 자동 인식한다.
// 기대 열 순서: 설치장소 | 설치일 | 모델 | 열 | 행 | 메모
//   · 열·행 대신 "8x5"(또는 8×5)처럼 한 칸에 적어도 인식한다.
//   · 첫 줄이 머리글(글자)이면 건너뛴다.  · 큰따옴표로 감싼 필드(내부 구분자 포함) 지원.
// 해상도는 저장하지 않고 화면에서 모델+배열로 자동 계산해 표시한다.
// ─────────────────────────────────────────────────────────────────────────────

const toInt = v => { const n = parseInt(String(v).replace(/[^0-9-]/g, ''), 10); return Number.isFinite(n) ? n : null; };

// "8x5" / "8×5" / "8*5" → { cols, rows }. 아니면 null.
function parseArrayToken(s) {
  const m = /^\s*(\d+)\s*[x×*]\s*(\d+)\s*$/i.exec(String(s || ''));
  return m ? { cols: parseInt(m[1], 10), rows: parseInt(m[2], 10) } : null;
}

// 날짜 문자열을 'YYYY-MM-DD'로 정규화. 연·월·일 → 그대로, 연·월만 → 1일, 실패 → null.
const pad2 = v => String(v).padStart(2, '0');
export function normalizeDate(s) {
  const t = String(s || '').trim();
  if (!t) return null;
  let m = /^(\d{4})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})/.exec(t);
  if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;
  m = /^(\d{4})[.\-/년\s]+(\d{1,2})/.exec(t);   // 연·월만 → 해당 월 1일
  if (m) return `${m[1]}-${pad2(m[2])}-01`;
  return null;
}

// 한 줄을 구분자로 나누되, 큰따옴표로 감싼 필드(내부 구분자·"" 이스케이프)를 존중한다.
function splitLine(line, delim) {
  const out = []; let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === delim) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map(c => c.trim());
}

// 머리글 줄인지 판단: '열'(배열) 칸이 숫자도 "NxM"도 아니면 머리글로 본다.
function looksLikeHeader(cells) {
  return !parseArrayToken(cells[3]) && toInt(cells[3]) === null;
}

// 붙여넣기(탭) 또는 CSV(쉼표) 텍스트를 사례 객체 배열로 변환.
// 반환 각 항목: { name, site, install_date, model_name, cols, rows, memo }
export function parseCasesText(text) {
  const raw = String(text || '').replace(/^﻿/, '');   // CSV UTF-8 BOM 제거
  const delim = raw.includes('\t') ? '\t' : ',';   // 탭이 있으면 엑셀 붙여넣기, 없으면 CSV
  const lines = raw.split(/\r?\n/).filter(l => l.trim() !== '');
  const out = [];
  lines.forEach((line, i) => {
    const cells = splitLine(line, delim);
    if (i === 0 && looksLikeHeader(cells)) return;   // 머리글 줄 건너뜀
    const site = cells[0] || '';
    const install_date = normalizeDate(cells[1]);
    const model_name = cells[2] || '';
    let cols = null, rows = null, memo = '';
    const arr = parseArrayToken(cells[3]);
    if (arr) { cols = arr.cols; rows = arr.rows; memo = cells[4] || ''; }
    else { cols = toInt(cells[3]); rows = toInt(cells[4]); memo = cells[5] || ''; }
    if (!model_name && !(cols && rows)) return;      // 모델·배열 둘 다 없으면 무효
    const name = [site, model_name, (cols && rows) ? `${cols}×${rows}` : ''].filter(Boolean).join(' ').trim() || '설치사례';
    out.push({ name, site, install_date, model_name, cols, rows, memo });
  });
  return out;
}

// 하위호환 별칭(탭/CSV 자동 인식).
export const parseCasesTSV = parseCasesText;
