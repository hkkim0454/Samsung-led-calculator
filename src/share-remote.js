// share-remote.js — 회사 공유함(Supabase REST) 연동.
// ─────────────────────────────────────────────────────────────────────────────
// 브라우저에서 fetch로 Supabase Data API(REST)를 호출해 '공유 구성'을 올리고/보고/지운다.
// 접근 제한은 '팀 비밀번호'(x-team-code 헤더)로 하며, 서버(Supabase RLS 정책)가 강제한다.
//   · publishable 키는 '공개용'으로 설계된 키라 클라이언트 코드에 포함해도 안전하다.
//     (진짜 잠금은 팀 비밀번호이며, 비밀번호는 저장소에 넣지 않고 각자 브라우저에만 저장한다.)
// 계산 로직(engine.js)·데이터 규격(config.js)과는 분리된 네트워크 I/O 모듈이다.
// ─────────────────────────────────────────────────────────────────────────────

export const SUPABASE_URL = 'https://jvizfwcdrdleietjlhmo.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_7VMPnLOs4VZreCJJI2PH5Q_ZpkO5NmG';
const TABLE = 'shared_configs';

// 새 publishable 키는 apikey 헤더로만 인증한다(Authorization Bearer에 넣지 않는다 — JWT가 아니라서).
// 접근 제한용 팀 비밀번호는 x-team-code 헤더로 전달 → 서버 RLS가 team_code 일치만 허용.
function buildHeaders(teamCode, extra) {
  return Object.assign({ apikey: SUPABASE_KEY, 'x-team-code': String(teamCode ?? '') }, extra || {});
}

const api = () => (globalThis.fetch ? globalThis.fetch.bind(globalThis) : null);

// 공유함 목록(팀 비밀번호에 해당하는 구성만, 최신순). 반환: 레코드 배열.
export async function listShared(teamCode) {
  const f = api(); if (!f) throw new Error('fetch 사용 불가');
  const url = `${SUPABASE_URL}/rest/v1/${TABLE}?select=id,name,summary,data,updated_by,created_at&order=created_at.desc`;
  const res = await f(url, { headers: buildHeaders(teamCode) });
  if (!res.ok) throw new Error(`목록 조회 실패 (HTTP ${res.status})`);
  return await res.json();
}

// 구성 하나 올리기. 반환: 저장된 레코드.
export async function uploadShared(teamCode, { name, summary, data, updated_by } = {}) {
  const f = api(); if (!f) throw new Error('fetch 사용 불가');
  const res = await f(`${SUPABASE_URL}/rest/v1/${TABLE}`, {
    method: 'POST',
    headers: buildHeaders(teamCode, { 'Content-Type': 'application/json', Prefer: 'return=representation' }),
    body: JSON.stringify({ team_code: teamCode, name, summary: summary ?? null, data, updated_by: updated_by || null }),
  });
  if (!res.ok) throw new Error(`올리기 실패 (HTTP ${res.status})`);
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] : rows;
}

// 구성 하나 삭제(id 기준).
export async function deleteShared(teamCode, id) {
  const f = api(); if (!f) throw new Error('fetch 사용 불가');
  const res = await f(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: buildHeaders(teamCode),
  });
  if (!res.ok) throw new Error(`삭제 실패 (HTTP ${res.status})`);
  return true;
}

/* ─── 설치 사례집 (install_cases) — 보기/등록 비밀번호 2단계 ───
   보기(SELECT)는 x-view-code, 등록·삭제(INSERT/DELETE)는 x-admin-code 헤더로 서버 RLS가 강제.
   비밀번호는 서버(RLS 정책) 안에만 있고 이 코드엔 없다. 사용자가 입력한 값만 헤더로 전달한다. */
const CASES = 'install_cases';
function caseHeaders({ view, admin } = {}, extra) {
  const h = { apikey: SUPABASE_KEY };
  if (view) h['x-view-code'] = String(view);
  if (admin) h['x-admin-code'] = String(admin);
  return Object.assign(h, extra || {});
}

// 설치 사례 목록(보기 비번 필요, 최신순). 비번 틀리면 서버가 빈 목록 반환.
export async function listCases(viewCode) {
  const f = api(); if (!f) throw new Error('fetch 사용 불가');
  const url = `${SUPABASE_URL}/rest/v1/${CASES}?select=id,name,site,install_date,memo,model_name,cols,rows,space_w,space_h,data,created_by,created_at&order=created_at.desc`;
  const res = await f(url, { headers: caseHeaders({ view: viewCode }) });
  if (!res.ok) throw new Error(`목록 조회 실패 (HTTP ${res.status})`);
  return await res.json();
}

// 설치 사례 등록(등록 비번 필요). rows: 사례 객체 배열(단건도 배열로). 여러 건 한번에 저장.
export async function addCases(adminCode, rows) {
  const f = api(); if (!f) throw new Error('fetch 사용 불가');
  const list = Array.isArray(rows) ? rows : [rows];
  const res = await f(`${SUPABASE_URL}/rest/v1/${CASES}`, {
    method: 'POST',
    headers: caseHeaders({ admin: adminCode }, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
    body: JSON.stringify(list),
  });
  if (res.status === 401 || res.status === 403) throw new Error('등록 비밀번호가 틀렸거나 권한이 없습니다.');
  if (!res.ok) throw new Error(`등록 실패 (HTTP ${res.status})`);
  return list.length;
}

// 설치 사례 삭제(등록 비번 필요, id 기준).
export async function deleteCase(adminCode, id) {
  const f = api(); if (!f) throw new Error('fetch 사용 불가');
  const res = await f(`${SUPABASE_URL}/rest/v1/${CASES}?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: caseHeaders({ admin: adminCode }),
  });
  if (res.status === 401 || res.status === 403) throw new Error('등록 비밀번호가 틀렸거나 권한이 없습니다.');
  if (!res.ok) throw new Error(`삭제 실패 (HTTP ${res.status})`);
  return true;
}
