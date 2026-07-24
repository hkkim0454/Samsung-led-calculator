// app.js — UI controller. Pure calculation lives in engine.js; data in models.js.
import { computeConfig, cabinetResolution, DEFAULTS } from './engine.js';
import { MODELS } from './models.js';

// Sales lines shown by default. Marketing name (label) -> internal series code.
const LINE_NAMES = { MP: 'MPF', MM: 'MMF', IF: 'IFR', IE: 'IEA' };
// 기본 노출 라인 + 기본 표시 순서 (IFR → IEA → MMF → MPF).
const SALES_LINES = ['IF', 'IE', 'MM', 'MP'];

// 기본 모델 목록: 라인을 SALES_LINES 순서로 배치한다. 같은 라인 내부(피치 순)와
// 사용자 커스텀 정렬(▲▼)·JSON 불러오기 순서는 stable sort 로 그대로 보존된다.
const lineRank = s => { const i = SALES_LINES.indexOf(s); return i < 0 ? SALES_LINES.length : i; };
const defaultModels = () => structuredClone(MODELS).sort((a, b) => lineRank(a.series) - lineRank(b.series));

let models = defaultModels();
let selectedId = models[0].id;
let mode = 'fill';
let editingId = null;
let signalMode = 'off'; // 'off' | 'fhd' | 'uhd' — signal-region overlay on the preview
// 삼성 판매 정책(2026-07-24): 앞으로 P0.8~P1.8 제품만 판매. 이 범위 밖은 기본 화면에서 숨김.
const MIN_PITCH = 0.8;
const MAX_PITCH = 1.8;
const pitchOk = m => m.pitch >= MIN_PITCH - 1e-9 && m.pitch <= MAX_PITCH + 1e-9;
let visibleLines = new Set(SALES_LINES);

const $ = s => document.querySelector(s);
const num = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
const fmt = (n, d = 0) => (isFinite(n) && n != null) ? n.toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
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
function familiesInOrder() { const seen = []; for (const m of models) if (pitchOk(m) && !seen.includes(m.series)) seen.push(m.series); return seen; }
const visibleModels = () => models.filter(m => visibleLines.has(m.series) && pitchOk(m));
function ensureSelectionVisible() {
  const vis = visibleModels();
  if (!vis.some(m => m.id === selectedId)) selectedId = vis[0]?.id ?? null;
}

function renderFilters() {
  const el = $('#lineFilter'); if (!el) return;
  el.innerHTML = familiesInOrder().map(s => {
    const on = visibleLines.has(s);
    const n = models.filter(m => m.series === s && pitchOk(m)).length;
    return `<label class="lineChip${on ? ' on' : ''}"><input type="checkbox" data-line="${esc(s)}"${on ? ' checked' : ''}/>${esc(lineLabel(s))}<span class="cnt">${n}</span></label>`;
  }).join('');
}

function opts() {
  const redundancy = $('#redundancy')?.checked ?? false;
  return mode === 'manual'
    ? { mode: 'manual', cols: num($('#manCols').value), rows: num($('#manRows').value), redundancy }
    : { mode: 'fill', redundancy };
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
        <div class="mmeta">${esc(lineLabel(m.series))} · ${fmt(m.cabW,1)}×${fmt(m.cabH,1)}mm · P${fmt(m.pitch,2)}</div>
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

  const padX = 82, padY = 54;
  const stageW = Math.max(140, stage.clientWidth - padX * 2), stageH = Math.max(140, stage.clientHeight - padY * 2);
  const refW = Math.max(sW, r.actualW), refH = Math.max(sH, r.actualH);
  const scale = Math.min(stageW / refW, stageH / refH);
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

  // installation space (white bezel/frame), LED wall centered inside
  const scene = document.createElement('div');
  scene.className = 'pvScene'; scene.style.width = spW + 'px'; scene.style.height = spH + 'px';
  const wall = document.createElement('div');
  wall.className = 'pvWall';
  wall.style.left = offX + 'px'; wall.style.top = offY + 'px';
  wall.style.width = arW + 'px'; wall.style.height = arH + 'px';
  wall.style.gridTemplateColumns = `repeat(${r.cols},1fr)`;
  wall.style.gridTemplateRows = `repeat(${r.rows},1fr)`;
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

  // FHD/UHD signal-region overlay (blue borders + tag), like the Samsung tool
  if (signalMode !== 'off' && r.resW > 0 && r.resH > 0) {
    const [bw, bh, label] = signalMode === 'uhd' ? [3840, 2160, 'UHD'] : [1920, 1080, 'FHD'];
    const nC = Math.ceil(r.resW / bw), nR = Math.ceil(r.resH / bh);
    const cbw = arW * bw / r.resW, cbh = arH * bh / r.resH;
    const ov = document.createElement('div');
    ov.className = 'pvSignal';
    ov.style.cssText = `left:${offX}px;top:${offY}px;width:${arW}px;height:${arH}px`;
    for (let rr = 0; rr < nR; rr++) for (let cc = 0; cc < nC; cc++) {
      const bx = cc * cbw, by = rr * cbh;
      const w = Math.min(cbw, arW - bx), h = Math.min(cbh, arH - by);
      const blk = document.createElement('div'); blk.className = 'pvSig';
      blk.style.cssText = `left:${bx}px;top:${by}px;width:${w}px;height:${h}px`;
      blk.innerHTML = `<span class="pvSigTag">${label}</span>`;
      ov.appendChild(blk);
    }
    scene.appendChild(ov);
  }

  // dimension pills
  const pill = (cls, txt, css) => { const d = document.createElement('div'); d.className = 'pvPill ' + cls; d.textContent = txt; d.style.cssText = css; scene.appendChild(d); };
  pill('big', meters(r.actualW), `left:${offX + arW / 2}px;top:-30px;transform:translateX(-50%)`);
  pill('big vert', meters(r.actualH), `top:${spH / 2}px;left:${spW + 14}px;transform:translateY(-50%)`);
  if (r.marginW > 1) pill('sm', meters(r.marginW), `left:${offX / 2}px;top:-26px;transform:translateX(-50%)`);
  if (r.marginH > 1) pill('sm vert', meters(r.marginH), `top:${offY / 2}px;left:${spW + 14}px;transform:translateY(-50%)`);
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
  // Signal-region counts (matches the FHD/UHD preview overlay) — always show both.
  const hasRes = r.resW > 0 && r.resH > 0;
  const fhd = hasRes ? { c: Math.ceil(r.resW / 1920), r: Math.ceil(r.resH / 1080) } : null;
  const uhd = hasRes ? { c: Math.ceil(r.resW / 3840), r: Math.ceil(r.resH / 2160) } : null;
  const cells = [
    { k: '실제 모듈 크기', v: `${fmt(r.actualW)} × ${fmt(r.actualH)}`, u: 'mm', hero: true },
    { k: '캐비닛 배열', v: `${r.cols} × ${r.rows}`, u: `= ${r.total}` },
    { k: '총 해상도', v: `${fmt(r.resW)} × ${fmt(r.resH)}`, u: 'px' },
    { k: '16:9 최대 해상도', v: `${fmt(r.res169W)} × ${fmt(r.res169H)}`, u: r.is169 ? 'px (16:9)' : 'px' },
    ...(fhd ? [{ k: 'FHD 신호 영역', v: `${fhd.c} × ${fhd.r}`, u: `= ${fhd.c * fhd.r}개` }] : []),
    ...(uhd ? [{ k: 'UHD 신호 영역', v: `${uhd.c} × ${uhd.r}`, u: `= ${uhd.c * uhd.r}개` }] : []),
    { k: '총 화소수', v: fmt(r.pixels / 1e6, 1), u: 'MP' },
    { k: '면적', v: fmt(r.areaM2, 2), u: 'm²' },
    { k: '대각', v: fmt(r.diagIn, 1), u: '"' },
    { k: '총 중량', v: fmt(r.weightKg, 1), u: 'kg' },
    { k: '밝기 (최대)', v: fmt(r.brightnessMax), u: 'nit' },
    { k: '최대 소비전력', v: fmt(r.maxW == null ? NaN : r.maxW / 1000, 2), u: 'kW' },
    { k: '평균 소비전력', v: fmt(r.typW == null ? NaN : r.typW / 1000, 2), u: 'kW' },
    { k: '발열 (최대)', v: fmt(r.heatMaxBTU == null ? NaN : r.heatMaxBTU / 1000, 1), u: 'kBTU/h' },
    { k: `S-Box${m.sbox ? ` (${esc(m.sbox)})` : ''}`, v: sboxText(r.sbox), u: (r.sbox > 0 ? (r.redundancy ? '대 · 이중화' : '대') : '') },
    { k: '화면비', v: fmt(aspect, 2), u: ': 1' },
  ];
  box.innerHTML = cells.map(c => `<div class="metric${c.hero ? ' hero' : ''}"><div class="k">${c.k}</div><div class="v">${c.v}<span class="u">${c.u || ''}</span></div></div>`).join('');

  if (!r.fits) nt.innerHTML = `<div class="notice warn">⚠ 지정 조건으로 캐비닛이 배치되지 않습니다.</div>`;
  else if (r.deadW > 0.5 || r.deadH > 0.5) nt.innerHTML = `<div class="notice info">여백 — 가로 ${fmt(r.deadW)}mm · 세로 ${fmt(r.deadH)}mm (센터 정렬 시 각 ${fmt(r.marginW)}/${fmt(r.marginH)}mm).</div>`;
  if (r.fits && !r.is169 && r.res169W > 0) nt.innerHTML += `<div class="notice info">16:9가 아닌 구성(슈퍼와이드 등)입니다. 16:9 콘텐츠 최대 해상도는 ${fmt(r.res169W)} × ${fmt(r.res169H)} px입니다.</div>`;
  if (r.maxW == null) nt.innerHTML += `<div class="notice warn">⚠ 이 모델은 중량·전력 데이터시트 값이 없어 해당 지표를 산출할 수 없습니다.</div>`;
  if (r.fits && r.sbox == null && !m.integratedController) nt.innerHTML += `<div class="notice warn">⚠ 이 모델은 컨트롤러(S-Box) 입력 용량 정보가 없어 S-Box 수량을 산출할 수 없습니다.</div>`;
  const d = cabinetResolution(m);
  if (Math.abs(m.cabW / m.pitch - d.resW) > 1 || Math.abs(m.cabH / m.pitch - d.resH) > 1)
    nt.innerHTML += `<div class="notice warn">⚠ 정합성: 크기÷피치와 입력 해상도가 다릅니다.</div>`;
}

function renderCompare() {
  const sW = num($('#spaceW').value), sH = num($('#spaceH').value);
  const rows = visibleModels().map(m => ({ m, r: computeConfig(m, sW, sH, { mode: 'fill' }) }));
  let bestPx = -1, bestId = null;
  for (const { m, r } of rows) if (r.fits && r.pixels > bestPx) { bestPx = r.pixels; bestId = m.id; }
  const body = $('#cmpBody'); body.innerHTML = '';
  for (const { m, r } of rows) {
    const tr = document.createElement('tr');
    tr.className = 'rowbtn' + (m.id === selectedId ? ' pick' : '') + (!r.fits ? ' nofit' : '');
    tr.dataset.id = m.id;
    tr.innerHTML = `
      <td class="name">${esc(m.name)}${m.id === bestId ? '<span class="badge">최다화소</span>' : ''}</td>
      <td>${fmt(m.pitch, 2)}</td>
      <td>${r.fits ? `${r.cols}×${r.rows}` : '—'}</td>
      <td>${r.fits ? `${fmt(r.actualW)}×${fmt(r.actualH)}` : '—'}</td>
      <td>${r.fits ? `${fmt(r.resW)}×${fmt(r.resH)}` : '—'}</td>
      <td>${r.fits ? fmt(r.diagIn, 1) : '—'}</td>
      <td>${fmt(r.weightKg, 1)}</td>
      <td>${fmt(r.brightnessMax)}</td>
      <td>${r.maxW == null ? '—' : fmt(r.maxW / 1000, 2)}</td>
      <td>${r.fits ? sboxText(r.sbox) : '—'}</td>
      <td>${r.fits ? `${fmt(r.deadW)}/${fmt(r.deadH)}` : '—'}</td>`;
    body.appendChild(tr);
  }
}

function renderAll() { ensureSelectionVisible(); renderFilters(); renderModelList(); renderPreview(); renderReadout(); renderCompare(); }

/* events */
['spaceW', 'spaceH', 'manCols', 'manRows'].forEach(id => $('#' + id).addEventListener('input', renderAll));
$('#redundancy').addEventListener('change', renderAll);
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
  else { const nm = { id: uid(), ...data }; models.push(nm); selectedId = nm.id; visibleLines.add(nm.series); }
  dlg.close(); renderAll();
});

$('#btnExport').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ version: 1, models }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'led-models.json'; a.click(); URL.revokeObjectURL(a.href);
});
$('#btnImport').addEventListener('click', () => $('#fileImport').click());
$('#fileImport').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const j = JSON.parse(rd.result); const arr = Array.isArray(j) ? j : j.models;
      if (!Array.isArray(arr)) throw 0;
      models = arr.map(m => ({ id: m.id || uid(), ...m })); selectedId = models[0]?.id;
      visibleLines = new Set(models.map(m => m.series)); renderAll();
    } catch { alert('유효한 모델 JSON 파일이 아닙니다.'); }
  };
  rd.readAsText(f); e.target.value = '';
});

window.addEventListener('resize', renderPreview);
renderAll();
