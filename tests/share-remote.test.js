import test from 'node:test';
import assert from 'node:assert/strict';
import { SUPABASE_URL, SUPABASE_KEY, listShared, uploadShared, deleteShared } from '../src/share-remote.js';

// globalThis.fetch 를 가로채 요청(URL/method/headers/body)을 기록하는 헬퍼.
function stubFetch(response) {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url, opts });
    return {
      ok: response.ok !== false,
      status: response.status ?? 200,
      json: async () => response.body ?? [],
    };
  };
  return calls;
}

test('listShared: 올바른 URL·apikey·x-team-code 헤더로 GET', async () => {
  const calls = stubFetch({ body: [{ id: '1', name: 'A', data: {} }] });
  const rows = await listShared('pw-123');
  assert.equal(rows.length, 1);
  const { url, opts } = calls[0];
  assert.ok(url.startsWith(`${SUPABASE_URL}/rest/v1/shared_configs?select=`));
  assert.ok(/order=created_at\.desc/.test(url));
  assert.equal(opts.headers.apikey, SUPABASE_KEY);
  assert.equal(opts.headers['x-team-code'], 'pw-123');
  assert.equal('Authorization' in opts.headers, false); // publishable 키는 Authorization에 넣지 않음
});

test('uploadShared: POST + team_code 본문·헤더 일치', async () => {
  const calls = stubFetch({ body: [{ id: '9', name: '테스트' }] });
  const rec = await uploadShared('pw-123', { name: '테스트', summary: 's', data: { spaceW: 6000 }, updated_by: '홍길동' });
  assert.equal(rec.id, '9');
  const { url, opts } = calls[0];
  assert.equal(url, `${SUPABASE_URL}/rest/v1/shared_configs`);
  assert.equal(opts.method, 'POST');
  assert.equal(opts.headers['x-team-code'], 'pw-123');
  assert.equal(opts.headers['Content-Type'], 'application/json');
  const body = JSON.parse(opts.body);
  assert.equal(body.team_code, 'pw-123');       // 본문 team_code = 헤더와 동일(RLS with check 통과)
  assert.equal(body.name, '테스트');
  assert.equal(body.data.spaceW, 6000);
  assert.equal(body.updated_by, '홍길동');
});

test('deleteShared: id=eq 필터로 DELETE', async () => {
  const calls = stubFetch({ body: [] });
  await deleteShared('pw-123', 'abc-1');
  const { url, opts } = calls[0];
  assert.equal(url, `${SUPABASE_URL}/rest/v1/shared_configs?id=eq.abc-1`);
  assert.equal(opts.method, 'DELETE');
  assert.equal(opts.headers['x-team-code'], 'pw-123');
});

test('HTTP 오류는 예외로 전달', async () => {
  stubFetch({ ok: false, status: 401 });
  await assert.rejects(() => listShared('x'), /HTTP 401/);
});
