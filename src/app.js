// app.js — UI controller. Pure calculation lives in engine.js; data in models.js.
import { computeConfig, computeQuote, cabinetResolution, DEFAULTS, spareRateForSeries } from './engine.js?v=106';
import { MODELS } from './models.js?v=106';
import { normalizeConfig, makeRecord, normalizeRecords, exportBundle, parseImport, mergeRecords } from './config.js?v=106';
import { listShared, uploadShared, deleteShared } from './share-remote.js?v=106';

// 가격표 출처(우선순위): ① 이 브라우저 저장값(localStorage, '가격표 불러오기'로 저장) →
//   ② prices.local.js(사내 로컬 실행 시). 가격은 저장소·공개웹에 없으며, 브라우저에만 저장된다.
//   공개 방문자는 저장값이 없어 06에 가격이 뜨지 않는다.
const PRICES_KEY = 'svtled_prices_v1';
let PRICES = null;
function readStoredPrices() { try { const s = localStorage.getItem(PRICES_KEY); return s ? JSON.parse(s) : null; } catch { return null; } }
PRICES = readStoredPrices();
if (!PRICES) { try { PRICES = (await import('./prices.local.js?v=106')).PRICES; } catch { PRICES = null; } }

// 사용자가 고른 가격표 파일(prices.local.js 등)을 읽어 브라우저에 저장한다. 파일은 업로드되지 않고 로컬에서만 처리.
async function importPriceFile(file) {
  if (!file) return;
  try {
    const text = await file.text();
    let prices = null;
    const trimmed = text.trim();
    if (trimmed.startsWith('{')) {
      prices = JSON.parse(trimmed);                    // 순수 JSON도 허용
    } else {
      const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
      try { prices = (await import(/* @vite-ignore */ url)).PRICES; } finally { URL.revokeObjectURL(url); }
    }
    if (!prices || typeof prices !== 'object' || !prices.panels) throw new Error('가격표 형식이 아닙니다(PRICES.panels 없음).');
    PRICES = prices;
    indirectDisabled = null;   // 새 가격표의 기본 on/off로 재초기화
    localStorage.setItem(PRICES_KEY, JSON.stringify(prices));
    renderAll();
    alert('가격표를 불러왔습니다. 이 브라우저에 저장되어 다음에 열 때도 자동으로 표시됩니다.');
  } catch (e) {
    alert('가격표 파일을 읽지 못했습니다.\nprices.local.js 파일이 맞는지 확인하세요.\n\n(' + e.message + ')');
  }
}
function clearStoredPrices() {
  if (!confirm('이 브라우저에 저장된 가격표를 삭제할까요? (파일 원본은 그대로 남습니다)')) return;
  localStorage.removeItem(PRICES_KEY); PRICES = null; indirectDisabled = null; renderAll();
}

// 간접비 항목 on/off 상태(화면 체크박스). null = 가격표 기준(enabled:false)으로 초기화 필요.
let indirectDisabled = null;
// 간접비 상세 펼침 상태(기본 닫힘). 재렌더 시에도 유지.
let indirectOpen = false;
function ensureIndirectDefaults() {
  if (indirectDisabled) return;
  indirectDisabled = new Set((PRICES?.indirect?.items || []).filter(i => i.enabled === false).map(i => i.name));
}

// Sales lines shown by default. Marketing name (label) -> internal series code.
const LINE_NAMES = { MP: 'MPF', MM: 'MMF', IF: 'IFR', IFM: 'IFR-M', IE: 'IEA' };
// 기본 노출 라인 + 기본 표시 순서 (IFR → IFR-M → IEA → MMF → MPF).
const SALES_LINES = ['IF', 'IFM', 'IE', 'MM', 'MP'];

// 기본 모델 목록: 라인을 SALES_LINES 순서로 배치한다. 같은 라인 내부(피치 순)와
// 사용자 커스텀 정렬(▲▼)·JSON 불러오기 순서는 stable sort 로 그대로 보존된다.
const lineRank = s => { const i = SALES_LINES.indexOf(s); return i < 0 ? SALES_LINES.length : i; };
const defaultModels = () => structuredClone(MODELS).sort((a, b) => lineRank(a.series) - lineRank(b.series));

let models = defaultModels();
let selectedId = models[0].id;
let mode = 'fill';
let editingId = null;
let signalMode = 'off'; // 'off' | 'fhd' | 'uhd' — signal-region overlay on the preview
// 사용자가 직접 선택한 CS4B 여부(비-MMF 모델용). MMF는 항상 CS4B 필수이므로 체크박스를 강제한다.
let userCS4B = false;
// 예비율 입력칸 자동 표시: 모델·공간에 맞는 예비 비율(%)을 자동 기입한다.
//   spareEdited=false → 자동(엔진은 시리즈 규칙 사용, 칸은 환산 %를 표시).
//   spareEdited=true  → 사용자가 직접 입력한 %가 우선.
let spareEdited = false;
let spareModelId = null;   // 모델 전환 감지(전환 시 자동 모드로 복귀)
// 삼성 판매 정책(2026-07-24): 앞으로 P0.8~P1.8 제품만 판매. 이 범위 밖은 기본 화면에서 숨김.
const MIN_PITCH = 0.8;
const MAX_PITCH = 1.8;
const pitchOk = m => m.pitch >= MIN_PITCH - 1e-9 && m.pitch <= MAX_PITCH + 1e-9;
// 화면 노출 대상: 판매범위(P0.8~1.8) 안이거나, 사용자가 라이브러리에서 불러온/직접 추가한 모델(_show).
const shown = m => pitchOk(m) || m._show === true;
let visibleLines = new Set(SALES_LINES);

const $ = s => document.querySelector(s);
const num = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
const fmt = (n, d = 0) => (isFinite(n) && n != null) ? n.toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
// 피치 표기: 최대 소수 2자리, 끝자리 0은 생략 (1.5→"1.5", 1.25→"1.25", 1.5625→"1.56").
const fmtPitch = p => (p != null && isFinite(p)) ? p.toLocaleString('ko-KR', { maximumFractionDigits: 2 }) : '—';
// mm → m 표기: 최대 소수 3자리, 끝자리 0은 생략 (3840→"3.84", 4000→"4").
const fmtMeters = mm => (isFinite(mm) ? (mm / 1000).toLocaleString('ko-KR', { maximumFractionDigits: 3 }) : '—');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const uid = () => 'm' + Math.random().toString(36).slice(2, 8);

// Data-reliability badge (3 levels): verified / derived / needs-verification.
function statusBadge(m) {
  if (m.dataStatus === 'verified') return '<span class="chk">✓ 검증</span>';
  if (m.dataStatus === 'needs-verification') return '<span class="todo">확인 필요</span>';
  return '<span class="derived">파생</span>';
}

function sboxText(v) { return v == null ? '—' : (v === 0 ? '내장' : fmt(v)); }

const lineLabel = s => LINE_NAMES[s] ?? (s || '기타');
function familiesInOrder() { const seen = []; for (const m of models) if (shown(m) && !seen.includes(m.series)) seen.push(m.series); return seen; }
const visibleModels = () => models.filter(m => visibleLines.has(m.series) && shown(m));
function ensureSelectionVisible() {
  const vis = visibleModels();
  if (!vis.some(m => m.id === selectedId)) selectedId = vis[0]?.id ?? null;
}

function renderFilters() {
  const el = $('#lineFilter'); if (!el) return;
  el.innerHTML = familiesInOrder().map(s => {
    const on = visibleLines.has(s);
    const n = models.filter(m => m.series === s && shown(m)).length;
    return `<label class="lineChip${on ? ' on' : ''}"><input type="checkbox" data-line="${esc(s)}"${on ? ' checked' : ''}/>${esc(lineLabel(s))}<span class="cnt">${n}</span></label>`;
  }).join('');
}

// 예비율(%) → 소수 비율. 자동 모드(미편집)면 null 반환 → 엔진이 시리즈 기본율 사용
// (IFR·IEA·MMF 5%, MPF 7%). 사용자가 직접 입력하면 그 비율이 우선.
function spareRateOpt() {
  if (!spareEdited) return null;
  const el = $('#spareRate');
  if (!el || el.value === '') return null;
  return Math.max(0, num(el.value)) / 100;
}

// 시리즈 기본 예비율(%). 칸에 자동 표시용. IFR·IEA·MMF 5% · MPF 7%.
function effectiveSparePct(m) {
  return +(spareRateForSeries(m.series) * 100).toFixed(2);
}

// 예비율 칸을 시리즈 기본율로 자동 채운다. 모델이 바뀌면 자동 모드로 복귀.
function syncSpareRate() {
  const el = $('#spareRate'); if (!el) return;
  const m = models.find(x => x.id === selectedId); if (!m) return;
  if (selectedId !== spareModelId) { spareEdited = false; spareModelId = selectedId; }
  if (!spareEdited) { el.value = String(effectiveSparePct(m)); el.placeholder = ''; }
}

// 선택 모델이 MMF면 CS4B 체크박스를 강제 체크+비활성(필수), 그 외에는 사용자 선택값을 따른다.
function syncCS4B() {
  const m = models.find(x => x.id === selectedId);
  const isMMF = m && m.series === 'MM';
  const cb = $('#useCS4B'); if (!cb) return;
  cb.checked = isMMF ? true : userCS4B;
  cb.disabled = !!isMMF;
  cb.closest('.checkline')?.classList.toggle('locked', !!isMMF);
}

// 예비 SBOX 수량(대). 빈칸이면 기본 1대, 값을 넣으면 그 수(0 이상 정수).
function sboxSparesOpt() {
  const el = $('#sboxSpare');
  if (!el || el.value === '') return 1;
  return Math.max(0, Math.floor(num(el.value)));
}

function opts() {
  const redundancy = $('#redundancy')?.checked ?? false;
  const cs4b = $('#useCS4B')?.checked ?? false;
  const gbicFB = $('#gbicFB')?.checked ?? false;
  const spareRate = spareRateOpt();
  const sboxSpares = sboxSparesOpt();
  return mode === 'manual'
    ? { mode: 'manual', cols: num($('#manCols').value), rows: num($('#manRows').value), redundancy, cs4b, gbicFB, spareRate, sboxSpares }
    : { mode: 'fill', redundancy, cs4b, gbicFB, spareRate, sboxSpares };
}

function renderModelList() {
  const el = $('#modelList'); el.innerHTML = '';
  const vis = visibleModels();
  if (vis.length === 0) { el.innerHTML = '<div class="previewEmpty">표시할 라인이 없습니다. 위에서 제품 라인을 선택하세요.</div>'; return; }
  vis.forEach((m, i) => {
    const row = document.createElement('div');
    row.dataset.id = m.id;
    row.className = 'modelRow' + (m.id === selectedId ? ' sel' : '');
    row.title = '클릭하여 이 모델 적용';
    row.innerHTML = `
      <div class="mvcol">
        <button class="tiny ghost mv" data-act="up" data-id="${m.id}" title="위로"${i === 0 ? ' disabled' : ''}>▲</button>
        <button class="tiny ghost mv" data-act="down" data-id="${m.id}" title="아래로"${i === vis.length - 1 ? ' disabled' : ''}>▼</button>
      </div>
      <div class="minfo">
        <div class="mname">${esc(m.name)} ${statusBadge(m)}</div>
        <div class="mmeta">${esc(lineLabel(m.series))} · ${fmt(m.cabW,1)}×${fmt(m.cabH,1)}mm · P${fmtPitch(m.pitch)}</div>
      </div>
      <div class="acts">
        <button class="tiny ghost" data-act="edit" data-id="${m.id}">편집</button>
        <button class="tiny ghost danger" data-act="del" data-id="${m.id}">삭제</button>
      </div>`;
    el.appendChild(row);
  });
}

// Reorder within the visible list; reflected in the master models[] array.
// Order persists via 데이터 저장/불러오기(JSON) — consistent with the rest of the library.
function moveModel(id, dir) {
  const vis = visibleModels();
  const vi = vis.findIndex(m => m.id === id), tj = vi + dir;
  if (vi < 0 || tj < 0 || tj >= vis.length) return;
  const a = models.indexOf(vis[vi]), b = models.indexOf(vis[tj]);
  [models[a], models[b]] = [models[b], models[a]];
  renderAll();
}

function renderPreview() {
  const m = models.find(x => x.id === selectedId);
  const stage = $('#stage');
  $('#pvModelName').textContent = m ? m.name : '—';
  if (!m) { stage.innerHTML = '<div class="previewEmpty">모델을 선택하세요</div>'; return; }
  const sW = num($('#spaceW').value), sH = num($('#spaceH').value);
  const r = computeConfig(m, sW, sH, opts());
  if (!r.fits) { stage.innerHTML = '<div class="previewEmpty">이 공간에는 캐비닛이 들어가지 않습니다.</div>'; return; }

  // 신호 레이어: HD=HD만, UHD=UHD만, 둘다(both)=HD+UHD 동시. HD=파랑 / UHD=빨강.
  // 각 신호 영역은 '풀 크기'(HD 1920x1080 / UHD 3840x2160)로 그려 벽보다 크면 밖으로 확장된다.
  const sigLayers = [];
  if (signalMode !== 'off' && r.resW > 0 && r.resH > 0) {
    if (signalMode === 'fhd' || signalMode === 'both') sigLayers.push({ bw: 1920, bh: 1080, label: 'FHD', cls: 'fhd' });
    if (signalMode === 'uhd' || signalMode === 'both') sigLayers.push({ bw: 3840, bh: 2160, label: 'UHD', cls: 'uhd' });
  }
  let sigFootW = 0, sigFootH = 0; // 그려질 신호 발자국의 최대(스케일 기준)
  for (const L of sigLayers) {
    L.nC = Math.ceil(r.resW / L.bw); L.nR = Math.ceil(r.resH / L.bh);
    L.footW = L.nC * L.bw / r.resW * r.actualW; // px→mm(벽 기준)
    L.footH = L.nR * L.bh / r.resH * r.actualH;
    sigFootW = Math.max(sigFootW, L.footW); sigFootH = Math.max(sigFootH, L.footH);
  }

  const padX = 82, padY = 54;
  const stageW = Math.max(140, stage.clientWidth - padX * 2), stageH = Math.max(140, stage.clientHeight - padY * 2);
  // 콘텐츠 박스 = 공간 ∪ 신호 발자국(벽 좌상단에서 시작). 이 박스를 스테이지에 맞춰 축소.
  const contentW = Math.max(sW, r.marginW + sigFootW), contentH = Math.max(sH, r.marginH + sigFootH);
  const scale = Math.min(stageW / contentW, stageH / contentH);
  const spW = sW * scale, spH = sH * scale, arW = r.actualW * scale, arH = r.actualH * scale;
  const offX = r.marginW * scale, offY = r.marginH * scale;
  const meters = mm => (mm / 1000).toLocaleString('ko-KR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' m';

  stage.innerHTML = '';

  // human silhouette (~1.7 m) for scale
  const figH = Math.max(46, Math.min(spH * 1.02, 1700 * scale));
  const fig = document.createElement('div');
  fig.className = 'pvFigure'; fig.style.height = figH + 'px';
  fig.innerHTML = '<svg viewBox="0 0 40 100" preserveAspectRatio="xMidYMax meet"><circle cx="20" cy="13" r="11"/><rect x="5" y="27" width="30" height="73" rx="15"/></svg>';
  stage.appendChild(fig);

  // installation space (white bezel/frame), LED wall centered inside.
  // 콘텐츠 박스(공간 ∪ 신호 발자국)를 스테이지 중앙에 배치. 공간은 콘텐츠 박스 좌상단에 둔다.
  const contentPxW = contentW * scale, contentPxH = contentH * scale;
  const scene = document.createElement('div');
  scene.className = 'pvScene'; scene.style.width = spW + 'px'; scene.style.height = spH + 'px';
  scene.style.transform = 'none';
  scene.style.left = ((stage.clientWidth - contentPxW) / 2) + 'px';
  scene.style.top = ((stage.clientHeight - contentPxH) / 2) + 'px';
  const wall = document.createElement('div');
  wall.className = 'pvWall';
  wall.style.left = offX + 'px'; wall.style.top = offY + 'px';
  wall.style.width = arW + 'px'; wall.style.height = arH + 'px';
  // minmax(0,1fr): 셀 내용(번호 라벨)이 트랙을 밀어 벽 높이를 넘겨 마지막 줄이 잘리던 문제 방지.
  wall.style.gridTemplateColumns = `repeat(${r.cols},minmax(0,1fr))`;
  wall.style.gridTemplateRows = `repeat(${r.rows},minmax(0,1fr))`;
  const cellW = arW / r.cols, cellH = arH / r.rows;
  const showNums = r.cols <= 30 && r.rows <= 20 && cellW >= 14 && cellH >= 13;
  const drawCells = Math.min(r.total, 2000);
  for (let i = 0; i < drawCells; i++) {
    const ci = i % r.cols, ri = (i / r.cols) | 0;
    const c = document.createElement('div'); c.className = 'pvCab';
    if (showNums && (ri === 0 || ci === 0)) c.textContent = ri === 0 ? (ci + 1) : (ri + 1);
    wall.appendChild(c);
  }
  scene.appendChild(wall);

  // 신호 영역 오버레이 — 벽 좌상단 기준으로 풀 크기 타일. 각 영역(타일)마다 좌상단에 라벨(HD/UHD).
  // HD를 먼저, UHD를 위에 얹어(둘다 모드에서 겹치는 좌상단은 UHD가 위에 보이게).
  for (const L of sigLayers) {
    const cbw = arW * L.bw / r.resW, cbh = arH * L.bh / r.resH;
    // 둘다 모드에선 HD 라벨 생략(UHD만). 영역이 많으면(>4) 라벨을 첫 칸에만 — 'HD'가 화면을 가득 채우는 것 방지.
    const showLabel = !(signalMode === 'both' && L.cls === 'fhd');
    const perTile = L.nC * L.nR <= 4;
    const ov = document.createElement('div');
    ov.className = 'pvSignal ' + L.cls;
    ov.style.cssText = `left:${offX}px;top:${offY}px`;
    for (let rr = 0; rr < L.nR; rr++) for (let cc = 0; cc < L.nC; cc++) {
      const blk = document.createElement('div'); blk.className = 'pvSig';
      blk.style.cssText = `left:${cc * cbw}px;top:${rr * cbh}px;width:${cbw}px;height:${cbh}px`;
      if (showLabel && (perTile || (cc === 0 && rr === 0))) blk.innerHTML = `<span class="pvSigTag">${L.label}</span>`;
      ov.appendChild(blk);
    }
    scene.appendChild(ov);
  }

  // dimension pills
  const pill = (cls, txt, css) => { const d = document.createElement('div'); d.className = 'pvPill ' + cls; d.textContent = txt; d.style.cssText = css; scene.appendChild(d); };
  pill('big', meters(r.actualW), `left:${offX + arW / 2}px;top:-30px;transform:translateX(-50%)`);
  pill('big vert', meters(r.actualH), `top:${spH / 2}px;left:${spW + 14}px;transform:translateY(-50%)`);
  // 여백 알약은 화면상 실제로 보이는 간격이 있을 때만 표시(간격≈0이면 치수 알약과 겹치므로 생략).
  // 여백 수치는 04 산출 스펙의 '여백' 안내에도 표기됨.
  const GAP_MIN = 16; // px
  if (r.marginW > 1 && offX > GAP_MIN) pill('sm', meters(r.marginW), `left:${offX / 2}px;top:-26px;transform:translateX(-50%)`);
  if (r.marginH > 1 && offY > GAP_MIN) pill('sm vert', meters(r.marginH), `top:${offY / 2}px;left:${spW + 14}px;transform:translateY(-50%)`);
  pill('count', `${r.cols} × ${r.rows} = ${r.total} 캐비닛`, `left:${offX}px;top:${offY + arH + 8}px`);

  stage.appendChild(scene);
}

function renderReadout() {
  const m = models.find(x => x.id === selectedId);
  const box = $('#readout'), nt = $('#notices'); nt.innerHTML = '';
  if (!m) { box.innerHTML = ''; return; }
  const sW = num($('#spaceW').value), sH = num($('#spaceH').value);
  const r = computeConfig(m, sW, sH, opts());
  const aspect = r.actualH > 0 ? r.actualW / r.actualH : 0;
  // 소수 1자리까지 표기하되 .0이면 정수로(예: 32.0→"32", 21.33→"21.3"). 화면비 x:9·가로 N개에 사용.
  const trim1 = n => (isFinite(n) ? n.toLocaleString('ko-KR', { maximumFractionDigits: 1 }) : '—');
  // 소수 3자리까지 표기하되 뒤의 0은 생략(예: 3.840→"3.84", 4.000→"4"). 실제 모듈 크기(m)에 사용.
  const trim3 = n => (isFinite(n) ? n.toLocaleString('ko-KR', { maximumFractionDigits: 3 }) : '—');
  // Signal-region counts (matches the FHD/UHD preview overlay) — always show both.
  const hasRes = r.resW > 0 && r.resH > 0;
  const fhd = hasRes ? { c: Math.ceil(r.resW / 1920), r: Math.ceil(r.resH / 1080) } : null;
  const uhd = hasRes ? { c: Math.ceil(r.resW / 3840), r: Math.ceil(r.resH / 2160) } : null;
  const cells = [
    { k: '실제 모듈 크기', v: `${trim3(r.actualW / 1000)} × ${trim3(r.actualH / 1000)}`, u: 'm', hero: true },
    { k: '대각', v: fmt(r.diagIn, 1), u: "'" },
    { k: '캐비닛 배열', v: `${r.cols} × ${r.rows}`, u: `= ${r.total} + 예비 ${r.spares} = ${r.totalWithSpares}` },
    { k: '전체 해상도', v: `${fmt(r.resW)} × ${fmt(r.resH)}`, u: 'px' },
    { k: '16:9 최대 해상도', v: `${fmt(r.res169W)} × ${fmt(r.res169H)}`, u: `px (${fmt(r.diag169In, 1)}")` },
    ...(fhd ? [{ k: 'FHD 신호 영역', v: `${fhd.c} × ${fhd.r}`, u: `= ${fhd.c * fhd.r}개` }] : []),
    ...(uhd ? [{ k: 'UHD 신호 영역', v: `${uhd.c} × ${uhd.r}`, u: `= ${uhd.c * uhd.r}개` }] : []),
    { k: '밝기 (최대)', v: fmt(r.brightnessMax), u: 'nit' },
    { k: '총 중량', v: fmt(r.weightKg, 1), u: 'kg' },
    { k: '최대 소비전력', v: fmt(r.maxW == null ? NaN : r.maxW / 1000, 2), u: 'kW' },
    { k: '평균 소비전력', v: fmt(r.typW == null ? NaN : r.typW / 1000, 2), u: 'kW' },
    { k: '발열 (최대)', v: fmt(r.heatMaxBTU == null ? NaN : r.heatMaxBTU / 1000, 1), u: 'kBTU/h' },
    { k: `SBOX${r.controller ? ` (${esc(r.controller)})` : ''}`, v: sboxText(r.sbox), u: (r.sbox > 0 ? `대 + 예비 ${r.sboxSpares} = ${r.sboxWithSpares}${r.redundancy ? ' · 이중화' : ''}` : '') },
    { k: 'Gbic', v: r.gbic ? fmt(r.gbic * 2) : '<span class="vdash">—</span>', u: r.gbic ? `EA (SBOX ${fmt(r.gbic)} + LED ${fmt(r.gbic)})` : '' },
    { k: '총 화소수', v: fmt(r.pixels / 1e6, 1), u: 'MP' },
    { k: '면적', v: fmt(r.areaM2, 2), u: 'm²' },
    { k: '화면비', v: `${trim1(aspect * 9)}:9`, u: `(16:9 가로 ${trim1(aspect * 9 / 16)}개)` },
    { k: '권장 시청거리', v: fmt(r.bdm25M, 1), u: 'm · BDM(세로x5)' },
    { k: '최대 시청거리', v: fmt(r.bdm30M, 1), u: 'm · BDM(세로x6)' },
  ];
  box.innerHTML = cells.map(c => `<div class="metric${c.hero ? ' hero' : ''}"><div class="k">${c.k}</div><div class="v">${c.v}<span class="u">${c.u || ''}</span></div></div>`).join('');

  if (!r.fits) nt.innerHTML = `<div class="notice warn">⚠ 지정 조건으로 캐비닛이 배치되지 않습니다.</div>`;
  else if (r.deadW > 0.5 || r.deadH > 0.5) nt.innerHTML = `<div class="notice info">여백 — 가로 ${fmt(r.deadW)}mm · 세로 ${fmt(r.deadH)}mm (센터 정렬 시 각 ${fmt(r.marginW)}/${fmt(r.marginH)}mm).</div>`;
  if (r.fits && !r.is169 && r.res169W > 0) nt.innerHTML += `<div class="notice info">16:9가 아닌 구성(슈퍼와이드 등)입니다. 16:9 콘텐츠 최대 해상도는 ${fmt(r.res169W)} × ${fmt(r.res169H)} px입니다.</div>`;
  if (r.maxW == null) nt.innerHTML += `<div class="notice warn">⚠ 이 모델은 중량·전력 데이터시트 값이 없어 해당 지표를 산출할 수 없습니다.</div>`;
  if (r.fits && r.sbox == null && !m.integratedController) nt.innerHTML += `<div class="notice warn">⚠ 이 모델은 컨트롤러(SBOX) 입력 용량 정보가 없어 SBOX 수량을 산출할 수 없습니다.</div>`;
  const d = cabinetResolution(m);
  if (Math.abs(m.cabW / m.pitch - d.resW) > 1 || Math.abs(m.cabH / m.pitch - d.resH) > 1)
    nt.innerHTML += `<div class="notice warn">⚠ 정합성: 크기÷피치와 입력 해상도가 다릅니다.</div>`;
}

function renderCompare() {
  const sW = num($('#spaceW').value), sH = num($('#spaceH').value);
  const cs4b = $('#useCS4B')?.checked ?? false;
  const rows = visibleModels().map(m => ({ m, r: computeConfig(m, sW, sH, { mode: 'fill', cs4b }) }));
  const body = $('#cmpBody'); body.innerHTML = '';
  for (const { m, r } of rows) {
    const tr = document.createElement('tr');
    tr.className = 'rowbtn' + (m.id === selectedId ? ' pick' : '') + (!r.fits ? ' nofit' : '');
    tr.dataset.id = m.id;
    tr.innerHTML = `
      <td class="name">${esc(m.name)}</td>
      <td>${fmtPitch(m.pitch)}</td>
      <td>${r.fits ? `${r.cols}×${r.rows}` : '—'}</td>
      <td>${r.fits ? fmt(r.diagIn, 1) : '—'}</td>
      <td>${r.fits ? `${fmtMeters(r.actualW)}×${fmtMeters(r.actualH)}` : '—'}</td>
      <td>${r.fits ? sboxText(r.sbox) + (r.gbic != null ? `(${fmt(r.gbic * 2)})` : '') : '—'}</td>
      <td>${r.fits ? `${fmt(r.resW)}×${fmt(r.resH)}` : '—'}</td>
      <td>${r.fits ? `${fmt(r.res169W)}×${fmt(r.res169H)}` : '—'}</td>
      <td>${r.maxW == null ? '—' : fmt(r.maxW / 1000, 2)}</td>
      <td>${fmt(r.weightKg, 1)}</td>
      <td>${fmt(r.brightnessMax)}</td>
      <td>${r.fits ? `${fmt(r.deadW)}/${fmt(r.deadH)}` : '—'}</td>`;
    body.appendChild(tr);
  }
}

// 06 원가/견적 — 가격표가 이 브라우저에 있을 때만 표를 그린다. 없으면 '가격표 불러오기' 안내만 표시.
function renderQuote() {
  const card = $('#quoteCard');
  if (!card) return;
  const box = $('#quoteBody');
  const etcRow = $('#etcRow');
  const clearBtn = $('#btnPriceClear');
  const hwLine = $('#highWorkLine');
  if (!PRICES) {
    if (etcRow) etcRow.hidden = true;
    if (hwLine) hwLine.hidden = true;
    if (clearBtn) clearBtn.hidden = true;
    box.innerHTML = '<div class="previewEmpty">사내 전용 — 위 <b>‘가격표 불러오기’</b> 버튼으로 가격표 파일(prices.local.js)을 한 번 불러오면 원가·견적이 여기에 표시됩니다.<br>불러온 값은 이 브라우저에 저장되어 다음에 열 때도 자동으로 나타납니다. (공개 방문자에겐 표시되지 않습니다.)</div>';
    return;
  }
  if (etcRow) etcRow.hidden = false;
  if (hwLine) hwLine.hidden = false;
  if (clearBtn) clearBtn.hidden = false;
  ensureIndirectDefaults();
  const m = models.find(x => x.id === selectedId);
  if (!m) { box.innerHTML = ''; return; }
  const sW = num($('#spaceW').value), sH = num($('#spaceH').value);
  const r = computeConfig(m, sW, sH, opts());
  const etc = { cost: num($('#etcCost')?.value), sell: num($('#etcSell')?.value) };
  const highWork = $('#highWork')?.checked ?? false;
  const q = computeQuote(m, r, PRICES, { etc, highWork, indirectDisabled: Array.from(indirectDisabled) });
  if (!q) { box.innerHTML = '<div class="previewEmpty">이 공간에는 캐비닛이 들어가지 않습니다.</div>'; return; }

  const won = v => v == null ? '<span class="vdash">—</span>' : fmt(v);
  const qn = v => v == null ? '—' : v.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
  const rows = q.lines.map(l => {
    const mg = (l.sell > 0 && l.cost != null) ? ((l.sell - l.cost) / l.sell * 100) : null;
    return `<tr>
      <td class="name">${esc(l.label)}${l.note ? ` <span class="muted-note">${esc(l.note)}</span>` : ''}</td>
      <td>${qn(l.qty)} ${esc(l.unit)}</td>
      <td>${won(l.unitCost)}</td>
      <td>${won(l.cost)}</td>
      <td>${won(l.unitSell)}</td>
      <td>${won(l.sell)}</td>
      <td>${mg == null ? '—' : fmt(mg, 1) + '%'}</td>
    </tr>`;
  }).join('');
  const totMg = q.totalSell > 0 ? (q.totalSell - q.totalCost) / q.totalSell * 100 : 0;
  const ind = q.indirect;
  // 간접비 상세 표(견적에만 가산). 기준(baseKind) 라벨 매핑.
  const baseLabel = { labor: '노무비', direct: '직접비', special: '직접비+간접노무+안전' };
  const indirectBlock = ind ? `
    <div class="indirectWrap">
      <details class="indirectDetails"${indirectOpen ? ' open' : ''}>
        <summary class="indSummary">
          <span class="indTitle">간접비 합계</span>
          <span class="indAmt">${fmt(ind.total)}</span>
          <span class="muted-note indHint">표준품셈 · 견적에만 가산 · 클릭하여 항목 펼치기/접기</span>
        </summary>
        <table class="quoteTable indTable"><thead><tr>
          <th>포함</th><th>항목</th><th>기준</th><th>요율</th><th>금액</th>
        </tr></thead><tbody>
          ${ind.lines.map(l => `<tr class="${l.included ? '' : 'off'}">
            <td class="indck"><input type="checkbox" class="indChk" data-ind="${esc(l.name)}"${l.included ? ' checked' : ''}/></td>
            <td class="name">${esc(l.name)}</td><td>${baseLabel[l.baseKind] || '-'}</td><td>${fmt(l.pct, 3)}%</td>
            <td>${l.included ? fmt(l.amount) : '<span class="vdash">—</span>'}</td></tr>`).join('')}
        </tbody></table>
      </details>
    </div>` : '';
  box.innerHTML = `
    <table id="quoteTable"><thead><tr>
      <th>품목</th><th>수량</th><th>원가단가</th><th>원가금액</th><th>견적단가</th><th>견적금액</th><th>마진</th>
    </tr></thead><tbody>${rows}</tbody>
    <tfoot><tr class="qtot">
      <td>직접비 합계</td><td></td><td></td><td>${fmt(q.directCost)}</td><td></td><td>${fmt(q.directSell)}</td><td></td>
    </tr></tfoot></table>
    ${indirectBlock}
    <table class="quoteTable grandTable"><tbody>
      <tr class="qtot"><td class="costLbl">총 원가</td><td class="amt costAmt">${fmt(q.totalCost)}</td></tr>
      <tr class="qtot"><td class="sellLbl">총 견적 (직접비 + 간접비)</td><td class="amt sellAmt">${fmt(q.totalSell)}</td></tr>
      <tr class="qprofit"><td>마진액 · 마진율</td><td class="amt">${fmt(q.totalSell - q.totalCost)} · ${fmt(totMg, 1)}%</td></tr>
    </tbody></table>
    <div class="quoteNote">
      금액=공급가(VAT 별도). 패널은 예비 포함 수량. 간접비는 원가 기준으로 산출해 견적에만 가산(요율은 가격표에서 조정). ${q.incomplete ? '<b class="warnText">일부 품목은 단가 미설정(—)이라 합계에서 빠졌습니다.</b> ' : ''}
      프레임·지그·케이블 등 기타 자재는 아래 칸에 직접 입력하세요.
    </div>`;
  // 간접비 펼침 상태를 사용자 조작에 맞춰 기억(재렌더 후에도 유지).
  box.querySelector('.indirectDetails')?.addEventListener('toggle', e => { indirectOpen = e.target.open; });
}

function renderAll() { ensureSelectionVisible(); syncCS4B(); syncSpareRate(); renderFilters(); renderModelList(); renderPreview(); renderReadout(); renderCompare(); renderQuote(); }

/* events */
['spaceW', 'spaceH', 'manCols', 'manRows', 'sboxSpare'].forEach(id => $('#' + id).addEventListener('input', renderAll));
// 예비율 칸: 값을 지우면 자동 모드로 복귀(환산 % 다시 표시), 숫자를 넣으면 그 값이 우선.
$('#spareRate').addEventListener('input', () => { spareEdited = $('#spareRate').value !== ''; renderAll(); });
$('#redundancy').addEventListener('change', renderAll);
$('#gbicFB').addEventListener('change', renderAll);
['etcCost', 'etcSell'].forEach(id => $('#' + id)?.addEventListener('input', renderQuote));
$('#highWork')?.addEventListener('change', renderQuote);
$('#quoteBody')?.addEventListener('change', e => {
  const cb = e.target.closest('.indChk'); if (!cb) return;
  if (!indirectDisabled) indirectDisabled = new Set();
  if (cb.checked) indirectDisabled.delete(cb.dataset.ind); else indirectDisabled.add(cb.dataset.ind);
  renderQuote();
});
$('#btnPriceLoad')?.addEventListener('click', () => $('#priceFile')?.click());
$('#priceFile')?.addEventListener('change', e => { const f = e.target.files?.[0]; e.target.value = ''; importPriceFile(f); });
$('#btnPriceClear')?.addEventListener('click', clearStoredPrices);
$('#useCS4B').addEventListener('change', () => { userCS4B = $('#useCS4B').checked; renderAll(); });
$('#signalMode').addEventListener('click', e => {
  const b = e.target.closest('button[data-sig]'); if (!b) return;
  signalMode = b.dataset.sig;
  $('#signalMode').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  renderPreview(); renderReadout();
});
$('#lineFilter').addEventListener('change', e => {
  const cb = e.target.closest('input[data-line]'); if (!cb) return;
  if (cb.checked) visibleLines.add(cb.dataset.line); else visibleLines.delete(cb.dataset.line);
  renderAll();
});
$('#fitMode').addEventListener('click', e => {
  const b = e.target.closest('button[data-mode]'); if (!b) return;
  mode = b.dataset.mode;
  $('#fitMode').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  $('#manualBox').hidden = mode !== 'manual';
  if (mode === 'manual') {
    const m = models.find(x => x.id === selectedId);
    const r = computeConfig(m, num($('#spaceW').value), num($('#spaceH').value), { mode: 'fill' });
    $('#manCols').value = r.cols; $('#manRows').value = r.rows;
  }
  renderAll();
});
$('#modelList').addEventListener('click', e => {
  const b = e.target.closest('button[data-act]');
  if (b) {
    const { id, act } = b.dataset;
    if (act === 'up') return moveModel(id, -1);
    if (act === 'down') return moveModel(id, 1);
    if (act === 'edit') return openEdit(id);
    if (act === 'del') {
      if (models.length <= 1) return alert('최소 1개 모델은 남겨야 합니다.');
      models = models.filter(m => m.id !== id);
      if (selectedId === id) selectedId = models[0].id;
      return renderAll();
    }
    return;
  }
  // click anywhere else on the row -> select and calculate this model
  const row = e.target.closest('.modelRow[data-id]');
  if (row) { selectedId = row.dataset.id; renderAll(); }
});
$('#cmpBody').addEventListener('click', e => {
  const tr = e.target.closest('tr[data-id]'); if (!tr) return;
  selectedId = tr.dataset.id; renderAll();
});
$('#btnAddModel').addEventListener('click', () => openEdit(null));
$('#btnResetModels').addEventListener('click', () => {
  if (confirm('모든 모델을 기본값으로 되돌립니다. 계속할까요?')) { models = defaultModels(); selectedId = models[0].id; visibleLines = new Set(SALES_LINES); renderAll(); }
});

const dlg = $('#dlg');
function openEdit(id) {
  editingId = id;
  const m = id ? models.find(x => x.id === id)
    : { name: '신규 모델', series: '', pitch: 2.5, cabW: 960, cabH: 540, depth: 79.5, resW: '', resH: '', weight: '', maxPower: '', brightnessPeak: 1000, maxInputW: '', maxInputH: '' };
  $('#dlgTitle').textContent = id ? '모델 편집' : '모델 추가';
  const set = (f, v) => $('#' + f).value = (v == null ? '' : v);
  set('e_name', m.name); set('e_series', m.series); set('e_pitch', m.pitch);
  set('e_cabW', m.cabW); set('e_cabH', m.cabH); set('e_depth', m.depth);
  set('e_resW', m.resW); set('e_resH', m.resH); set('e_weight', m.weight);
  set('e_maxP', m.maxPower); set('e_nit', m.brightnessPeak);
  set('e_inW', m.maxInputW); set('e_inH', m.maxInputH);
  dlg.showModal();
}
$('#dlgClose').addEventListener('click', () => dlg.close());
$('#dlgCancel').addEventListener('click', () => dlg.close());
$('#dlgSave').addEventListener('click', () => {
  const pitch = num($('#e_pitch').value), cabW = num($('#e_cabW').value), cabH = num($('#e_cabH').value);
  if (cabW <= 0 || cabH <= 0) return alert('캐비닛 크기는 0보다 커야 합니다.');
  const orEmpty = v => v === '' ? null : num(v);
  let resW = orEmpty($('#e_resW').value), resH = orEmpty($('#e_resH').value);
  if (resW == null && pitch > 0) resW = Math.round(cabW / pitch);
  if (resH == null && pitch > 0) resH = Math.round(cabH / pitch);
  const data = {
    name: $('#e_name').value || '이름없음', series: $('#e_series').value,
    pitch, cabW, cabH, depth: orEmpty($('#e_depth').value),
    resW, resH, weight: orEmpty($('#e_weight').value), maxPower: orEmpty($('#e_maxP').value),
    maxInputW: orEmpty($('#e_inW').value), maxInputH: orEmpty($('#e_inH').value),
    brightnessPeak: orEmpty($('#e_nit').value), dataStatus: 'needs-verification',
  };
  if (editingId) Object.assign(models.find(x => x.id === editingId), data);
  else { const nm = { id: uid(), ...data, _show: true }; models.push(nm); selectedId = nm.id; visibleLines.add(nm.series); }
  dlg.close(); renderAll();
});

/* 라이브러리에서 불러오기 — 판매범위 밖이라 숨겨진 기존 모델을 골라 바로 추가·선택한다. */
const loadDlg = $('#loadDlg');
function renderLoadList() {
  const el = $('#loadList');
  const hidden = models.filter(m => !shown(m)).sort((a, b) => (lineRank(a.series) - lineRank(b.series)) || (a.pitch - b.pitch));
  if (!hidden.length) { el.innerHTML = '<div class="previewEmpty">불러올 숨김 모델이 없습니다. (기본 모델이 모두 표시 중)</div>'; return; }
  el.innerHTML = hidden.map(m => `
    <div class="loadRow" data-load="${m.id}" title="눌러서 추가">
      <div class="minfo">
        <div class="mname">${esc(m.name)} ${statusBadge(m)}</div>
        <div class="mmeta">${esc(lineLabel(m.series))} · ${fmt(m.cabW, 1)}×${fmt(m.cabH, 1)}mm · P${fmtPitch(m.pitch)}</div>
      </div>
      <button class="tiny primary" data-load="${m.id}">추가</button>
    </div>`).join('');
}
function loadModel(id) {
  const m = models.find(x => x.id === id); if (!m) return;
  m._show = true;                 // 숨김 해제 → 목록/비교표에 노출
  visibleLines.add(m.series);     // 해당 라인 필터도 켠다
  selectedId = id;                // 바로 선택·적용
  loadDlg.close(); renderAll();
}
$('#btnLoadModel').addEventListener('click', () => { renderLoadList(); loadDlg.showModal(); });
$('#loadClose').addEventListener('click', () => loadDlg.close());
$('#loadCancel').addEventListener('click', () => loadDlg.close());
$('#loadList').addEventListener('click', e => {
  const el = e.target.closest('[data-load]'); if (!el) return;
  loadModel(el.dataset.load);
});

/* ─── 구성(설정) 저장/불러오기 — 이 브라우저에 이름 붙여 저장(localStorage) ───
   화면의 모든 입력·선택(공간·배열·옵션·선택 모델 등)을 한 건으로 저장했다가 그대로 복원한다.
   가격표(prices.local.js)와 가격은 여기에 포함하지 않는다(별도 저장). 규격은 config.js. */
const CONFIG_KEY = 'svtled_configs_v1';
function readConfigs() { try { return normalizeRecords(JSON.parse(localStorage.getItem(CONFIG_KEY) || '[]')); } catch { return []; } }
function writeConfigs(list) { try { localStorage.setItem(CONFIG_KEY, JSON.stringify(list)); } catch (e) { alert('구성을 저장하지 못했습니다(브라우저 저장공간 문제).\n' + e.message); } }

// 현재 화면의 모든 입력·선택을 하나의 구성 객체로 모은다.
function gatherConfig() {
  const m = models.find(x => x.id === selectedId) || null;
  return {
    spaceW: num($('#spaceW').value), spaceH: num($('#spaceH').value),
    mode, manCols: num($('#manCols').value), manRows: num($('#manRows').value),
    redundancy: $('#redundancy').checked, cs4b: userCS4B, gbicFB: $('#gbicFB').checked,
    highWork: $('#highWork')?.checked ?? false,
    spareRate: $('#spareRate').value, spareEdited,
    sboxSpare: num($('#sboxSpare').value),
    signalMode, selectedId,
    selectedModel: m ? structuredClone(m) : null,
    etcCost: num($('#etcCost')?.value), etcSell: num($('#etcSell')?.value),
    visibleLines: [...visibleLines],
    indirectDisabled: indirectDisabled ? [...indirectDisabled] : null,
  };
}

// 저장된 구성 하나를 화면에 복원한다.
function applyConfig(raw) {
  const c = normalizeConfig(raw);
  // 직접 추가한 커스텀 모델 복원: 현재 목록에 없고 스냅샷이 있으면 목록에 되살린다.
  if (c.selectedId && !models.some(m => m.id === c.selectedId) && c.selectedModel) {
    models.push({ ...c.selectedModel, _show: true });
  }
  $('#spaceW').value = c.spaceW; $('#spaceH').value = c.spaceH;
  $('#manCols').value = c.manCols; $('#manRows').value = c.manRows;
  $('#sboxSpare').value = c.sboxSpare;
  $('#spareRate').value = c.spareRate;
  if ($('#etcCost')) $('#etcCost').value = c.etcCost;
  if ($('#etcSell')) $('#etcSell').value = c.etcSell;
  $('#redundancy').checked = c.redundancy;
  $('#gbicFB').checked = c.gbicFB;
  if ($('#highWork')) $('#highWork').checked = c.highWork;
  $('#useCS4B').checked = c.cs4b;
  userCS4B = c.cs4b;
  spareEdited = c.spareEdited;
  mode = c.mode;
  signalMode = c.signalMode;
  if (Array.isArray(c.visibleLines)) visibleLines = new Set(c.visibleLines);
  if (Array.isArray(c.indirectDisabled)) indirectDisabled = new Set(c.indirectDisabled);
  if (c.selectedId && models.some(m => m.id === c.selectedId)) selectedId = c.selectedId;
  spareModelId = selectedId; // 모델 전환 자동복귀가 복원된 예비율을 지우지 않도록 맞춰둔다.
  $('#fitMode').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
  $('#manualBox').hidden = mode !== 'manual';
  $('#signalMode').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.sig === signalMode));
  renderAll();
}

// 목록 표시용 짧은 요약: 모델 · 공간 · 배열.
function configSummary(d) {
  const c = normalizeConfig(d);
  const model = c.selectedModel?.name || c.selectedId || '—';
  const arr = c.mode === 'manual' ? `${c.manCols}×${c.manRows}` : '자동';
  return `${esc(model)} · ${fmt(c.spaceW)}×${fmt(c.spaceH)}mm · ${arr}`;
}

// 현재 화면에 불러와 있는 구성 이름(있으면 '덮어쓰기 저장'의 대상). 새로 만들면 null.
let currentConfigName = null;

// 이름으로 저장(같은 이름 있으면 덮어씀). 저장 후 그 이름을 '현재 구성'으로 기억한다.
function persistConfig(name) {
  const list = readConfigs();
  const idx = list.findIndex(r => r.name === name);
  const rec = makeRecord(name, gatherConfig());
  if (idx >= 0) list[idx] = rec; else list.push(rec);
  writeConfigs(normalizeRecords(list));
  currentConfigName = name;
  renderConfigList();
}

function saveCurrentConfig() {
  const m = models.find(x => x.id === selectedId);
  // 기본 이름 제안: 모델명_열X행 (예: IF015R_4X4). 배열 수량은 현재 설정으로 산출.
  let suggested = m?.name || '구성';
  if (m) {
    const r = computeConfig(m, num($('#spaceW').value), num($('#spaceH').value), opts());
    if (r && r.cols > 0 && r.rows > 0) suggested = `${m.name}_${r.cols}X${r.rows}`;
  }
  // 불러온 구성(로컬·공유함·링크)이 있으면: 덮어쓰기 저장 / 다른 이름으로 저장 선택.
  //   공유함에서 불러온 구성은 로컬 목록에 없어도 이 선택을 제공한다(덮어쓰기 = 내 목록에 같은 이름으로 저장).
  if (currentConfigName) {
    const overwrite = confirm(`수정한 내용을 저장합니다.\n\n[확인] '${currentConfigName}'에 그대로 덮어쓰기\n[취소] 다른 이름으로 저장`);
    if (overwrite) { persistConfig(currentConfigName); alert(`'${currentConfigName}' 구성에 저장했습니다.`); return; }
    suggested = `${currentConfigName} (수정본)`;   // 취소 → 새 이름 저장(기본 제안)
  }
  const name = (prompt('구성 이름을 입력하세요.', suggested) || '').trim();
  if (!name) return;
  if (name !== currentConfigName && readConfigs().some(r => r.name === name)
      && !confirm(`이미 '${name}' 이름의 구성이 있습니다. 덮어쓸까요?`)) return;
  persistConfig(name);
  alert(`'${name}' 구성을 저장했습니다.`);
}

const cfgDlg = $('#cfgDlg');
function renderConfigList() {
  const el = $('#cfgList'); if (!el) return;
  const list = readConfigs();
  if (!list.length) { el.innerHTML = '<div class="previewEmpty">저장된 구성이 없습니다. 먼저 <b>‘구성 저장’</b>으로 현재 설정을 저장하세요.</div>'; return; }
  el.innerHTML = list.map(r => {
    const when = new Date(r.savedAt).toLocaleString('ko-KR');
    return `<div class="cfgRow" style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:8px 0">
      <div style="min-width:0">
        <div class="mname">${esc(r.name)}</div>
        <div class="hint">${configSummary(r.data)} · ${esc(when)}</div>
      </div>
      <div style="display:flex;gap:6px;flex:0 0 auto">
        <button class="tiny primary" data-cfg-load="${esc(r.name)}">불러오기</button>
        <button class="tiny ghost" data-cfg-share="${esc(r.name)}" title="공유 링크를 만들어 복사(상대는 링크를 열어 바로 불러옴)">공유</button>
        <button class="tiny ghost" data-cfg-del="${esc(r.name)}">삭제</button>
      </div>
    </div>`;
  }).join('');
}

// ─── 구성 링크로 공유 ───
//   '공유'를 누르면 그 구성을 담은 링크를 만들어 복사한다. 상대가 링크를 열면(이 사이트로 접속)
//   그 구성이 자동으로 불러와지고 내 목록에도 저장된다. 데이터는 URL의 # 뒤(해시)에 담아
//   서버로 전송되지 않는다. 가격 정보는 구성에 포함되지 않으므로 링크에도 없다.
// 유니코드(한글) 안전 base64url 인코딩/디코딩.
function b64urlEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(s) {
  const b = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b);
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
// 구성 레코드들로 공유 링크(현재 사이트 주소 + #share=...)를 만든다.
function buildShareLink(records) {
  const payload = JSON.stringify(exportBundle(records));
  return location.origin + location.pathname + '#share=' + b64urlEncode(payload);
}
// 구성 하나를 공유: 링크 생성 → 클립보드 복사(막히면 직접 복사 안내).
async function shareConfig(name) {
  const rec = readConfigs().find(r => r.name === name);
  if (!rec) return;
  const link = buildShareLink([rec]);
  try {
    await navigator.clipboard.writeText(link);
    alert('공유 링크가 복사되었습니다.\n카톡·메일에 붙여넣어 보내면, 상대가 링크를 열어 이 구성을 바로 불러올 수 있습니다.');
  } catch {
    prompt('아래 링크를 복사(Ctrl+C)해 전달하세요:', link);
  }
}
// 페이지 진입 시 #share= 링크를 처리: 공유 구성을 내 목록에 합치고 바로 불러온다.
function handleSharedLink() {
  const m = /[#&]share=([^&]+)/.exec(location.hash || '');
  if (!m) return;
  // 링크는 한 번만 처리하고 주소에서 지운다(새로고침 시 반복 방지).
  history.replaceState(null, '', location.origin + location.pathname + location.search);
  let records = [];
  try { records = parseImport(JSON.parse(b64urlDecode(m[1]))); } catch { records = []; }
  if (!records.length) { alert('공유 링크를 읽지 못했습니다. 링크가 중간에 잘렸을 수 있어요. 다시 받아 열어보세요.'); return; }
  const { list, added } = mergeRecords(readConfigs(), records);
  writeConfigs(list);
  applyConfig(records[0].data);       // 받은 구성을 바로 화면에 적용
  currentConfigName = records[0].name;
  const extra = added > 1 ? ` (외 ${added - 1}개도 내 목록에 추가됨)` : '';
  alert(`공유된 구성 '${records[0].name}'을(를) 불러왔습니다.${extra}\n내 목록에도 저장되어 다음에 또 열 수 있습니다.`);
}
$('#btnConfigSave')?.addEventListener('click', saveCurrentConfig);
$('#btnConfigLoad')?.addEventListener('click', () => { renderConfigList(); cfgDlg?.showModal(); });
$('#cfgClose')?.addEventListener('click', () => cfgDlg.close());
$('#cfgCancel')?.addEventListener('click', () => cfgDlg.close());
$('#cfgList')?.addEventListener('click', e => {
  const loadBtn = e.target.closest('[data-cfg-load]');
  const shareBtn = e.target.closest('[data-cfg-share]');
  const delBtn = e.target.closest('[data-cfg-del]');
  if (loadBtn) {
    const rec = readConfigs().find(r => r.name === loadBtn.dataset.cfgLoad);
    if (rec) { applyConfig(rec.data); currentConfigName = rec.name; cfgDlg.close(); }
    return;
  }
  if (shareBtn) { shareConfig(shareBtn.dataset.cfgShare); return; }
  if (delBtn) {
    const name = delBtn.dataset.cfgDel;
    if (!confirm(`'${name}' 구성을 삭제할까요?`)) return;
    writeConfigs(readConfigs().filter(r => r.name !== name));
    renderConfigList();
  }
});

/* ─── 회사 공유함 (Supabase) — 전 직원이 접속만 하면 보이는 공유 구성 목록 ───
   비밀번호 없이 '공유함' 버튼만 누르면 열린다. 접근은 아래 고정 팀코드로 자동 처리한다.
   ※ 공유되는 데이터는 가격 없는 '배열 구성'뿐이라 별도 비밀번호 없이 사내 공용으로 쓴다. */
const TEAM_CODE = 'seoulav-shared';    // 회사 공용 고정 코드(사용자 입력 없음)
const NAME_KEY = 'svtled_display_name';
let sharedRowsCache = [];

function getDisplayName() {
  let n = localStorage.getItem(NAME_KEY) || '';
  if (!n) {
    n = (prompt('공유함에 표시할 이름(올린 사람)을 입력하세요:', '') || '').trim();
    if (n) localStorage.setItem(NAME_KEY, n);
  }
  return n;
}

const sharedDlg = $('#sharedDlg');
async function openSharedLib() {
  sharedDlg?.showModal();
  await renderSharedList();
}
async function renderSharedList() {
  const el = $('#sharedList'); if (!el) return;
  el.innerHTML = '<div class="previewEmpty">불러오는 중…</div>';
  try {
    const rows = await listShared(TEAM_CODE);
    sharedRowsCache = rows;
    if (!rows.length) {
      el.innerHTML = '<div class="previewEmpty">공유함이 비어 있습니다.<br>아래 <b>현재 구성 올리기</b>로 첫 구성을 올려보세요.</div>';
      return;
    }
    el.innerHTML = rows.map(r => {
      const when = r.created_at ? new Date(r.created_at).toLocaleString('ko-KR') : '';
      const who = r.updated_by ? esc(r.updated_by) + ' · ' : '';
      const sub = r.summary || configSummary(r.data);
      return `<div class="cfgRow" style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:8px 0">
        <div style="min-width:0">
          <div class="mname">${esc(r.name)}</div>
          <div class="hint">${esc(sub)} · ${who}${esc(when)}</div>
        </div>
        <div style="display:flex;gap:6px;flex:0 0 auto">
          <button class="tiny primary" data-sh-load="${esc(String(r.id))}">불러오기</button>
          <button class="tiny ghost" data-sh-del="${esc(String(r.id))}">삭제</button>
        </div>
      </div>`;
    }).join('');
  } catch (e) {
    el.innerHTML = `<div class="previewEmpty">공유함을 불러오지 못했습니다.<br>(${esc(e.message)})<br>인터넷 연결을 확인하세요.</div>`;
  }
}
async function uploadCurrentToShared() {
  const m = models.find(x => x.id === selectedId);
  let suggested = currentConfigName || m?.name || '구성';
  if (!currentConfigName && m) {
    const r = computeConfig(m, num($('#spaceW').value), num($('#spaceH').value), opts());
    if (r && r.cols > 0 && r.rows > 0) suggested = `${m.name}_${r.cols}X${r.rows}`;
  }
  const name = (prompt('공유함에 올릴 이름:', suggested) || '').trim();
  if (!name) return;
  const cfg = gatherConfig();
  try {
    await uploadShared(TEAM_CODE, { name, summary: configSummary(cfg), data: cfg, updated_by: getDisplayName() });
    await renderSharedList();
    alert(`'${name}' 구성을 공유함에 올렸습니다. 전 직원이 볼 수 있습니다.`);
  } catch (e) {
    alert('공유함에 올리지 못했습니다.\n' + e.message);
  }
}
$('#btnSharedLib')?.addEventListener('click', openSharedLib);
$('#sharedClose')?.addEventListener('click', () => sharedDlg.close());
$('#sharedCancel')?.addEventListener('click', () => sharedDlg.close());
$('#btnSharedUpload')?.addEventListener('click', uploadCurrentToShared);
$('#btnSharedRefresh')?.addEventListener('click', renderSharedList);
$('#sharedList')?.addEventListener('click', async e => {
  const loadBtn = e.target.closest('[data-sh-load]');
  const delBtn = e.target.closest('[data-sh-del]');
  if (loadBtn) {
    const rec = sharedRowsCache.find(r => String(r.id) === loadBtn.dataset.shLoad);
    if (rec) { applyConfig(rec.data); currentConfigName = rec.name; sharedDlg.close(); }
    return;
  }
  if (delBtn) {
    const rec = sharedRowsCache.find(r => String(r.id) === delBtn.dataset.shDel);
    if (!rec || !confirm(`공유함에서 '${rec.name}'을(를) 삭제할까요? (모든 직원에게서 사라집니다)`)) return;
    try { await deleteShared(TEAM_CODE, rec.id); await renderSharedList(); }
    catch (err) { alert('삭제하지 못했습니다.\n' + err.message); }
  }
});

window.addEventListener('resize', renderPreview);

// 인쇄 시 03 미리보기를 A4 폭(styles.css의 body.printing 고정폭)에 맞춰 다시 그린다.
// beforeprint에서 클래스 추가 후 재렌더 → 화면 폭과 무관하게 그림이 페이지 안에 들어온다.
window.addEventListener('beforeprint', () => { document.body.classList.add('printing'); renderPreview(); });
window.addEventListener('afterprint', () => { document.body.classList.remove('printing'); renderPreview(); });

renderAll();
handleSharedLink();   // 공유 링크(#share=)로 들어온 경우 그 구성을 불러온다.
