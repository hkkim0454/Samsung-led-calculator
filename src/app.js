// app.js — UI controller. Pure calculation lives in engine.js; data in models.js.
import { computeConfig, computeQuote, cabinetResolution, DEFAULTS, spareRateForSeries } from './engine.js?v=135';
import { MODELS } from './models.js?v=135';
import { normalizeConfig, makeRecord, normalizeRecords, exportBundle, parseImport, mergeRecords } from './config.js?v=135';
import { listShared, uploadShared, deleteShared, listCases, addCases, deleteCase, updateCase } from './share-remote.js?v=135';
import { parseCasesText, normalizeDate } from './cases.js?v=135';

// 가격표 출처(우선순위): ① 이 브라우저 저장값(localStorage, '가격표 불러오기'로 저장) →
//   ② prices.local.js(사내 로컬 실행 시). 가격은 저장소·공개웹에 없으며, 브라우저에만 저장된다.
//   공개 방문자는 저장값이 없어 06에 가격이 뜨지 않는다.
const PRICES_KEY = 'svtled_prices_v1';
let PRICES = null;
function readStoredPrices() { try { const s = localStorage.getItem(PRICES_KEY); return s ? JSON.parse(s) : null; } catch { return null; } }
PRICES = readStoredPrices();
if (!PRICES) { try { PRICES = (await import('./prices.local.js?v=135')).PRICES; } catch { PRICES = null; } }

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

// 앞으로 기본 선택 모델 = IFR-M(IF015R-M). 목록에 없으면 첫 모델로 대체.
const DEFAULT_MODEL_ID = 'IF015RM';
const pickDefaultId = list => (list.find(m => m.id === DEFAULT_MODEL_ID)?.id) ?? list[0]?.id ?? null;

let models = defaultModels();
let selectedId = pickDefaultId(models);
let mode = 'ledsize';   // 기본 = 자동 채움(LED 설치 크기, 비우면 벽면). 'manual' = 배열 직접 지정.
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
// 모델명을 여러 표기로 인식한다: 제품코드(MM015F), 라인+코드(MMF015), 시리즈+코드(MM015) 등.
//   설치 사례에 사용자가 다양하게 적어도 실제 모델을 찾아내기 위함(대소문자·공백·기호 무시).
const normName = s => String(s ?? '').toUpperCase().replace(/[\s._\-]/g, '');
function findModelByName(raw) {
  const q0 = String(raw ?? '').trim(); if (!q0) return null;
  const q = normName(q0);
  const digits = m => (String(m.name).match(/\d+/) || [''])[0];
  // 1) 별칭 정확 일치: 제품코드(MM015F)·id·라인+코드(MMF015)·시리즈+코드(MM015)
  let m = models.find(mm => [mm.name, mm.id, lineLabel(mm.series) + digits(mm), mm.series + digits(mm)]
    .map(normName).includes(q));
  if (m) return m;
  // 2) 라인 + 피치 표기(예: "MMF P1.5", "IFR 1.5"): 라인 일치 후보 중 피치가 가장 가까운 모델.
  const pm = /(\d+(?:\.\d+)?)/.exec(q0);
  const letters = q.replace(/[^A-Z]/g, '').replace(/P$/, '');   // 숫자 제거→라인힌트, 끝의 P 제거
  if (pm && letters) {
    const pitch = parseFloat(pm[1]);
    const lineOk = mm => normName(lineLabel(mm.series)) === letters || normName(mm.series) === letters;
    let best = null, bd = Infinity;
    for (const mm of models) if (lineOk(mm)) { const d = Math.abs(mm.pitch - pitch); if (d < bd) { bd = d; best = mm; } }
    if (best && bd <= 0.2) return best;
  }
  return null;
}
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
  const baseHeight = num($('#baseHeight')?.value);   // 바닥에서 LED 아래까지(mm)
  const common = { redundancy, cs4b, gbicFB, spareRate, sboxSpares, baseHeight };
  if (mode === 'manual') return { mode: 'manual', cols: num($('#manCols').value), rows: num($('#manRows').value), ...common };
  // 자동 채움: ② LED 설치 크기(비우면 벽면 = 세로는 하단 높이 위)에 캐비닛을 채운다.
  const lw = num($('#ledW')?.value) || num($('#spaceW').value);
  const lh = num($('#ledH')?.value) || Math.max(0, num($('#spaceH').value) - baseHeight);
  return { mode: 'ledsize', ledW: lw, ledH: lh, ...common };
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
  const offX = r.marginW * scale;
  // 하단 높이(바닥에서 LED 아래까지)가 지정되고 공간 안에 들어가면, LED를 바닥에서 baseH 띄워 배치(방처럼).
  const baseH = num($('#baseHeight').value);
  const fitsBase = baseH > 0 && (baseH + r.actualH) <= sH + 1;
  const topGapMM = fitsBase ? (sH - baseH - r.actualH) : 0;
  const offY = fitsBase ? topGapMM * scale : r.marginH * scale;
  const meters = mm => (mm / 1000).toLocaleString('ko-KR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' m';

  stage.innerHTML = '';

  // 콘텐츠 박스(공간 ∪ 신호 발자국)를 스테이지 중앙에 배치. 공간(벽)의 바닥 레벨을 먼저 구한다.
  const contentPxW = contentW * scale, contentPxH = contentH * scale;
  const sceneLeft = (stage.clientWidth - contentPxW) / 2;
  const sceneTop = (stage.clientHeight - contentPxH) / 2;
  const floorY = sceneTop + spH;   // 공간(벽) 바닥 = 사람이 서는 바닥 레벨

  // 방 컨텍스트(1단계): 벽면(scene)을 '뒷벽'으로 두고 바닥·천장·양옆 벽을 원근으로 그린다(SVG, 뒤에 깔림).
  //   앞쪽(스테이지 가장자리)에서 뒷벽(scene) 모서리로 이어지는 1점 투시. LED·사람 외 다른 장비는 없음.
  {
    const SW = stage.clientWidth, SH = stage.clientHeight;
    const bl = sceneLeft, bt = sceneTop, br = sceneLeft + spW, bb = floorY;   // 뒷벽 좌/상/우/하
    const rb = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    rb.setAttribute('width', SW); rb.setAttribute('height', SH);
    rb.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none';
    const poly = (pts, fill) => `<polygon points="${pts}" fill="${fill}" stroke="rgba(128,128,128,.22)" stroke-width="1"/>`;
    rb.innerHTML =
      poly(`0,0 ${SW},0 ${br},${bt} ${bl},${bt}`, 'rgba(130,140,160,.05)') +        // 천장
      poly(`0,${SH} ${SW},${SH} ${br},${bb} ${bl},${bb}`, 'rgba(130,140,160,.12)') + // 바닥
      poly(`0,0 ${bl},${bt} ${bl},${bb} 0,${SH}`, 'rgba(130,140,160,.08)') +        // 좌벽
      poly(`${SW},0 ${br},${bt} ${br},${bb} ${SW},${SH}`, 'rgba(130,140,160,.08)'); // 우벽
    stage.appendChild(rb);
  }

  // 사람 실루엣(한국 성인 남성 평균 키 ≈ 170cm) — 바닥 레벨 위에 서게 배치. viewBox 세로=170 → 1.7m.
  const figH = Math.max(46, Math.min(spH * 1.02, 1700 * scale));
  const fig = document.createElement('div');
  fig.className = 'pvFigure'; fig.style.height = figH + 'px';
  fig.style.bottom = 'auto'; fig.style.top = (floorY - figH) + 'px';
  fig.innerHTML = '<svg viewBox="0 0 62 170" preserveAspectRatio="xMidYMax meet">'
    + '<circle cx="31" cy="12" r="11.5"/>'                       // 머리
    + '<path d="M19,32 Q31,25 43,32 L40,92 Q31,98 22,92 Z"/>'     // 어깨~몸통~허리
    + '<rect x="15" y="32" width="7" height="54" rx="3.5"/>'     // 왼팔
    + '<rect x="40" y="32" width="7" height="54" rx="3.5"/>'     // 오른팔
    + '<rect x="22.5" y="90" width="8" height="80" rx="4"/>'     // 왼다리
    + '<rect x="31.5" y="90" width="8" height="80" rx="4"/>'     // 오른다리
    + '</svg>';
  stage.appendChild(fig);

  // installation space (white bezel/frame), LED wall centered inside.
  const scene = document.createElement('div');
  scene.className = 'pvScene'; scene.style.width = spW + 'px'; scene.style.height = spH + 'px';
  scene.style.transform = 'none';
  scene.style.left = sceneLeft + 'px';
  scene.style.top = sceneTop + 'px';
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

  // 방 컨텍스트(1단계): 하단 높이 지정 시 LED를 바닥에서 baseH 띄워 배치하고(offY로 반영),
  //   위/아래 남는 공간을 점선 밴드로 표시한다. LED·사람 외 다른 AV 장비는 표시하지 않는다.
  if (fitsBase) {
    const band = (topPx, hPx, label) => {
      if (hPx < 3) return;
      const d = document.createElement('div');
      d.style.cssText = `position:absolute;left:${offX}px;top:${topPx}px;width:${arW}px;height:${hPx}px;`
        + 'display:flex;align-items:center;justify-content:center;box-sizing:border-box;'
        + 'border:1px dashed rgba(128,128,128,.45);border-radius:6px;pointer-events:none';
      if (hPx >= 16) d.innerHTML = `<span style="font-size:11px;padding:1px 6px;border-radius:6px;background:rgba(128,128,128,.14)">${label}</span>`;
      scene.appendChild(d);
    };
    band(0, offY, `위 ${fmt(Math.round(topGapMM))}mm`);                       // LED 위 남는 공간
    band(offY + arH, spH - (offY + arH), `LED 하단 높이 ${fmt(Math.round(baseH))}mm`);   // LED 아래(바닥에서 LED까지)
  }

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

  // ── 치수 보조선(대시): LED·벽면 가장자리 연장선 + 상단/우측 치수선 (삼성 configurator 스타일) ──
  const dcol = 'rgba(128,128,128,.5)';
  const dline = (x1, y1, x2, y2) => {
    const horiz = Math.abs(y1 - y2) < 0.5;
    const d = document.createElement('div');
    d.style.cssText = `position:absolute;left:${Math.min(x1, x2)}px;top:${Math.min(y1, y2)}px;`
      + (horiz ? `width:${Math.abs(x2 - x1)}px;height:0;border-top:1px dashed ${dcol}`
               : `height:${Math.abs(y2 - y1)}px;width:0;border-left:1px dashed ${dcol}`)
      + ';pointer-events:none';
    scene.appendChild(d);
  };
  const topGuide = -16, rightGuide = spW + 8;
  // 가로(위): 상단 치수선 + 벽/LED 좌우 가장자리 연장선
  dline(0, topGuide, spW, topGuide);
  dline(0, topGuide, 0, 0); dline(spW, topGuide, spW, 0);
  dline(offX, topGuide, offX, offY); dline(offX + arW, topGuide, offX + arW, offY);
  // 세로(우): 우측 치수선 + 벽/LED 상하 가장자리 연장선
  dline(rightGuide, 0, rightGuide, spH);
  dline(spW, 0, rightGuide, 0); dline(spW, spH, rightGuide, spH);
  dline(offX + arW, offY, rightGuide, offY); dline(offX + arW, offY + arH, rightGuide, offY + arH);

  // dimension pills
  const pill = (cls, txt, css) => { const d = document.createElement('div'); d.className = 'pvPill ' + cls; d.textContent = txt; d.style.cssText = css; scene.appendChild(d); };
  pill('big', meters(r.actualW), `left:${offX + arW / 2}px;top:-30px;transform:translateX(-50%)`);
  pill('big vert', meters(r.actualH), `top:${offY + arH / 2}px;left:${spW + 14}px;transform:translateY(-50%)`);
  // 여백 알약은 화면상 실제로 보이는 간격이 있을 때만 표시(간격≈0이면 치수 알약과 겹치므로 생략).
  // 여백 수치는 04 산출 스펙의 '여백' 안내에도 표기됨.  방 모드(하단 높이)에선 세로 여백은 밴드로 대체.
  const GAP_MIN = 16; // px
  // 좌우 여백(공간감): LED가 벽면보다 좁으면 양쪽 여백을 위쪽에 함께 표시.
  const rightGap = spW - offX - arW;
  if (r.marginW > 1 && offX > GAP_MIN) pill('sm', meters(r.marginW), `left:${offX / 2}px;top:-26px;transform:translateX(-50%)`);
  if (r.marginW > 1 && rightGap > GAP_MIN) pill('sm', meters(r.marginW), `left:${offX + arW + rightGap / 2}px;top:-26px;transform:translateX(-50%)`);
  // 위/아래 여백: 방 모드(하단 높이)에선 밴드로 표시하므로 여기선 생략. 그 외엔 위·아래 대칭 표시.
  const botGap = spH - offY - arH;
  if (!fitsBase && r.marginH > 1 && offY > GAP_MIN) pill('sm vert', meters(r.marginH), `top:${offY / 2}px;left:${spW + 14}px;transform:translateY(-50%)`);
  if (!fitsBase && r.marginH > 1 && botGap > GAP_MIN) pill('sm vert', meters(r.marginH), `top:${offY + arH + botGap / 2}px;left:${spW + 14}px;transform:translateY(-50%)`);
  pill('count', `${r.cols} × ${r.rows} = ${r.total} 캐비닛`, `left:${offX}px;top:${offY + arH + 8}px`);

  // 바닥 기준선(공간감): 벽면 하단에 옅은 바닥 선을 살짝 넓게 그린다.
  const floor = document.createElement('div');
  floor.style.cssText = `position:absolute;left:-10px;top:${spH}px;width:${spW + 20}px;height:0;border-top:2px solid rgba(128,128,128,.4);pointer-events:none`;
  scene.appendChild(floor);

  // 눈높이 가이드선(바닥 기준): 앉은 눈높이 1.2m·선 눈높이 1.6m 참고선. 벽 높이 안에 들 때만 표시.
  for (const g of [{ mm: 1200, label: '앉은 눈높이 1.2m' }, { mm: 1600, label: '선 눈높이 1.6m' }]) {
    if (g.mm > sH) continue;
    const gy = spH - g.mm * scale;
    if (gy < 0 || gy > spH) continue;
    const line = document.createElement('div');
    line.style.cssText = `position:absolute;left:0;top:${gy}px;width:${spW}px;height:0;border-top:1px dashed rgba(74,110,224,.65);pointer-events:none`;
    line.innerHTML = `<span style="position:absolute;left:4px;top:-9px;font-size:10px;color:rgba(74,110,224,.95);background:rgba(127,127,127,.14);padding:0 4px;border-radius:4px;white-space:nowrap">${g.label}</span>`;
    scene.appendChild(line);
  }

  stage.appendChild(scene);
}

// 하단 높이(바닥에서 LED 아래까지)를 입력하면 세로 구성(바닥 여백·LED 세로·위 남는 높이)을 표시.
//   위 남는 높이 = 세로 공간 − 하단 높이 − LED 세로. 음수면(공간 초과) 경고를 빨간색으로 보여준다.
function updateVSplit(r, sH) {
  const el = $('#vSplitInfo'); if (!el) return;
  const baseH = num($('#baseHeight').value);
  if (!(baseH > 0)) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  const mm = v => fmt(Math.round(v)) + 'mm';
  const ledH = (r && r.fits) ? (r.actualH || 0) : 0;
  if (!ledH) {   // 하단 높이가 너무 높아 남는 세로 공간에 캐비닛이 한 줄도 안 들어감
    el.style.color = 'var(--danger)';
    el.innerHTML = `⚠️ 하단 높이(${mm(baseH)})가 너무 높아 이 세로 공간에 LED가 들어가지 않습니다.`;
    return;
  }
  const top = sH - baseH - ledH;
  if (top < -1) {   // 수동 배열에서 행 수를 크게 지정한 경우(자동 채움에선 발생하지 않음)
    el.style.color = 'var(--danger)';
    el.innerHTML = `⚠️ 바닥 여백(${mm(baseH)}) + LED 세로(${mm(ledH)})가 세로 공간(${mm(sH)})을 <b>${mm(-top)}</b> 넘습니다. 행 수나 하단 높이를 줄이세요.`;
  } else {
    el.style.color = '';
    el.innerHTML = `바닥 여백 <b>${mm(baseH)}</b> · LED 세로 <b>${mm(ledH)}</b> · 위 남는 높이 <b>${mm(top)}</b> <span style="opacity:.7">(자동 채움 시 행 수 자동 조정)</span>`;
  }
}
function renderReadout() {
  const m = models.find(x => x.id === selectedId);
  const box = $('#readout'), nt = $('#notices'); nt.innerHTML = '';
  if (!m) { box.innerHTML = ''; const vs = $('#vSplitInfo'); if (vs) vs.hidden = true; return; }
  const sW = num($('#spaceW').value), sH = num($('#spaceH').value);
  const r = computeConfig(m, sW, sH, opts());
  updateVSplit(r, sH);
  // 화면(Screen) 배열은 항상 표시: 자동 채움·LED 크기 지정 모드에선 계산된 열·행을 입력칸에 반영한다.
  if (mode !== 'manual') { const mc = $('#manCols'), mr = $('#manRows'); if (mc) mc.value = r.cols || 0; if (mr) mr.value = r.rows || 0; }
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
// LED 설치 크기(②)는 벽면을 넘을 수 없다. 하단 높이를 지정하면 세로 = 벽면−하단높이까지만.
//   (그 위로는 캐비닛을 더 쌓을 수 없으므로) 입력값을 그 한계로 제한하고 max 속성도 맞춘다.
function clampLedInputs() {
  const maxW = Math.max(0, num($('#spaceW').value));
  const maxH = Math.max(0, num($('#spaceH').value) - num($('#baseHeight').value));
  const wEl = $('#ledW'), hEl = $('#ledH');
  if (wEl) { wEl.max = maxW; if (num(wEl.value) > maxW) wEl.value = maxW; }
  if (hEl) { hEl.max = maxH; if (num(hEl.value) > maxH) hEl.value = maxH; }
}
['spaceW', 'spaceH', 'sboxSpare', 'baseHeight', 'ledW', 'ledH'].forEach(id => $('#' + id)?.addEventListener('input', () => { clampLedInputs(); renderAll(); }));
clampLedInputs();   // 초기 max 속성 설정
const EDGE_MARGIN = 100;   // 설치 공간 가장자리 여유(mm, 각 변) — 사례 등록/불러오기 등에서 사용
// 화면(Screen) 배열 열·행을 직접 입력하면 '배열 직접 지정' 모드로 전환한다(벽면은 선언값 그대로 유지 → 여백 표시).
['manCols', 'manRows'].forEach(id => $('#' + id).addEventListener('input', () => {
  if (mode !== 'manual') {
    mode = 'manual';
    $('#fitMode').querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.mode === 'manual'));
    $('#ledBox').hidden = true;
  }
  renderAll();
}));
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
  // 열·행(배열 직접 지정) 칸은 '배열 직접 지정'일 때만 표시. LED 설치 크기(②)는 항상 표시.
  $('#manualBox').hidden = mode !== 'manual';
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
  if (confirm('모든 모델을 기본값으로 되돌립니다. 계속할까요?')) { models = defaultModels(); selectedId = pickDefaultId(models); visibleLines = new Set(SALES_LINES); renderAll(); }
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
    baseHeight: num($('#baseHeight').value), ledW: num($('#ledW').value), ledH: num($('#ledH').value),
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
  $('#baseHeight').value = c.baseHeight; $('#ledW').value = c.ledW; $('#ledH').value = c.ledH;
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
  mode = (c.mode === 'fill') ? 'ledsize' : c.mode;   // 옛 '자동 채움(벽면)'은 '자동 채움(LED 크기, 비우면 벽면)'으로
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
// 현재 구성 이름을 지정하고 상단 배지에 표시(없으면 숨김).
function setCurrentConfig(name) {
  currentConfigName = name || null;
  const el = $('#currentCfgTag');
  if (el) { el.hidden = !currentConfigName; el.textContent = currentConfigName ? `📄 현재 구성: ${currentConfigName}` : ''; }
}

// 이름으로 저장(같은 이름 있으면 덮어씀). 저장 후 그 이름을 '현재 구성'으로 기억한다.
function persistConfig(name) {
  const list = readConfigs();
  const idx = list.findIndex(r => r.name === name);
  const rec = makeRecord(name, gatherConfig());
  if (idx >= 0) list[idx] = rec; else list.push(rec);
  writeConfigs(normalizeRecords(list));
  setCurrentConfig(name);
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
  setCurrentConfig(records[0].name);
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
    if (rec) { applyConfig(rec.data); setCurrentConfig(rec.name); cfgDlg.close(); }
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

/* ─── 회사 공유함 (Supabase) — 공유함 비밀번호로 잠금(설치 사례와 동일 방식) ───
   비밀번호는 서버(RLS)에만 있고 앱엔 없다. 사용자가 입력한 값만 x-team-code 헤더로 전달.
   틀리면 못 들어오고, 조회 성공(1건 이상)했을 때만 비번을 저장(검증)한다. */
const SHARE_KEY = 'svtled_share_code';
const NAME_KEY = 'svtled_display_name';
let sharedRowsCache = [];
let shareCode = '';    // 공유함 비밀번호(세션). 검증되면 localStorage에도 저장.

// 공유함 비번을 확보(대소문자 구분). 저장은 renderSharedList가 조회 성공 시에만 한다.
function ensureShareCode(forceNew) {
  if (!forceNew && !shareCode) shareCode = localStorage.getItem(SHARE_KEY) || '';
  if (forceNew || !shareCode) shareCode = (prompt('설계 프로젝트 비밀번호를 입력하세요 (대소문자 구분):', '') || '').trim();
  return shareCode;
}

function getDisplayName() {
  let n = localStorage.getItem(NAME_KEY) || '';
  if (!n) {
    n = (prompt('설계 프로젝트에 표시할 이름(올린 사람)을 입력하세요:', '') || '').trim();
    if (n) localStorage.setItem(NAME_KEY, n);
  }
  return n;
}

const sharedDlg = $('#sharedDlg');
async function openSharedLib() {
  if (!ensureShareCode()) return;
  sharedDlg?.showModal();
  await renderSharedList();
}
async function renderSharedList() {
  const el = $('#sharedList'); if (!el) return;
  el.innerHTML = '<div class="previewEmpty">불러오는 중…</div>';
  try {
    const rows = await listShared(shareCode);
    if (!rows.length) {
      // 비었거나 비번 틀림 → 저장하지 않고 다시 입력 유도(맞는 비번이면 첫 구성 올리기 가능).
      localStorage.removeItem(SHARE_KEY);
      sharedRowsCache = [];
      el.innerHTML = '<div class="previewEmpty">🔒 <b>비밀번호가 다르거나</b> 설계 프로젝트가 비어 있습니다.<br>'
        + '맞는 비번이면 아래 <b>현재 구성 올리기</b>로 첫 구성을 올리세요.<br>'
        + '<button class="tiny primary" id="btnShareRetryPass" style="margin-top:8px">비밀번호 다시 입력</button></div>';
      $('#btnShareRetryPass')?.addEventListener('click', () => { if (ensureShareCode(true)) renderSharedList(); });
      return;
    }
    localStorage.setItem(SHARE_KEY, shareCode);   // 조회 성공 → 검증된 비번 저장
    sharedRowsCache = rows;
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
    el.innerHTML = `<div class="previewEmpty">설계 프로젝트를 불러오지 못했습니다.<br>(${esc(e.message)})<br>인터넷 연결을 확인하세요.</div>`;
  }
}
async function uploadCurrentToShared() {
  const m = models.find(x => x.id === selectedId);
  let suggested = currentConfigName || m?.name || '구성';
  if (!currentConfigName && m) {
    const r = computeConfig(m, num($('#spaceW').value), num($('#spaceH').value), opts());
    if (r && r.cols > 0 && r.rows > 0) suggested = `${m.name}_${r.cols}X${r.rows}`;
  }
  const name = (prompt('설계 프로젝트에 올릴 이름:', suggested) || '').trim();
  if (!name) return;
  const cfg = gatherConfig();
  try {
    await uploadShared(shareCode, { name, summary: configSummary(cfg), data: cfg, updated_by: getDisplayName() });
    await renderSharedList();
    alert(`'${name}' 구성을 설계 프로젝트에 올렸습니다. 전 직원이 볼 수 있습니다.`);
  } catch (e) {
    alert('설계 프로젝트에 올리지 못했습니다.\n' + e.message);
  }
}
$('#btnSharedLib')?.addEventListener('click', openSharedLib);
$('#sharedClose')?.addEventListener('click', () => sharedDlg.close());
$('#sharedCancel')?.addEventListener('click', () => sharedDlg.close());
$('#btnSharedUpload')?.addEventListener('click', uploadCurrentToShared);
$('#btnSharedRefresh')?.addEventListener('click', renderSharedList);
$('#btnSharedPass')?.addEventListener('click', () => { if (ensureShareCode(true)) renderSharedList(); });
$('#sharedList')?.addEventListener('click', async e => {
  const loadBtn = e.target.closest('[data-sh-load]');
  const delBtn = e.target.closest('[data-sh-del]');
  if (loadBtn) {
    const rec = sharedRowsCache.find(r => String(r.id) === loadBtn.dataset.shLoad);
    if (rec) { applyConfig(rec.data); setCurrentConfig(rec.name); sharedDlg.close(); }
    return;
  }
  if (delBtn) {
    const rec = sharedRowsCache.find(r => String(r.id) === delBtn.dataset.shDel);
    if (!rec || !confirm(`설계 프로젝트에서 '${rec.name}'을(를) 삭제할까요? (모든 직원에게서 사라집니다)`)) return;
    try { await deleteShared(shareCode, rec.id); await renderSharedList(); }
    catch (err) { alert('삭제하지 못했습니다.\n' + err.message); }
  }
});

/* ─── 설치 사례집 (install_cases) — 보기 비번으로 열람, 등록/삭제는 관리자 비번 ───
   과거 실제 설치 건을 모아두고, 지금 고른 모델·배열과 맞는 사례를 먼저 보여준다. */
const CASE_VIEW_KEY = 'svtled_case_view';
const CASE_ADMIN_KEY = 'svtled_case_admin';
let caseRowsCache = [];
let caseSearch = '';     // 설치 사례 검색어(건명·장소·모델·메모).
let caseYear = 'all';    // 연도 필터('all' | 'YYYY' | '미지정').
let caseViewCode = '';   // 현재 세션 보기 비번. 검증(사례 조회 성공) 시에만 localStorage에 저장한다.

// 보기 비번을 확보한다(대소문자 구분). 저장된 값을 쓰거나, 없으면/forceNew면 입력받는다.
// 저장은 여기서 하지 않고, renderCaseList가 조회에 성공(사례 1건 이상)했을 때만 저장한다.
function ensureCaseViewCode(forceNew) {
  if (!forceNew && !caseViewCode) caseViewCode = localStorage.getItem(CASE_VIEW_KEY) || '';
  if (forceNew || !caseViewCode) caseViewCode = (prompt('설치 사례 보기 비밀번호를 입력하세요 (대소문자 구분):', '') || '').trim();
  return caseViewCode;
}
function getCaseAdminCode(forceNew) {
  let c = forceNew ? '' : (localStorage.getItem(CASE_ADMIN_KEY) || '');
  if (!c) { c = (prompt('설치 사례 등록(관리자) 비밀번호를 입력하세요:', '') || '').trim(); if (c) localStorage.setItem(CASE_ADMIN_KEY, c); }
  return c;
}

// 현재 화면의 선택 모델·배열(열/행)을 구한다(사례 매칭·등록용).
function currentModelArray() {
  const m = models.find(x => x.id === selectedId);
  if (!m) return { m: null, cols: 0, rows: 0 };
  const r = computeConfig(m, num($('#spaceW').value), num($('#spaceH').value), opts());
  return { m, cols: r.cols || 0, rows: r.rows || 0 };
}
// 사례의 해상도 표기(모델+배열로 자동 계산). 모델을 못 찾으면 빈 문자열.
function caseResolution(c) {
  const m = findModelByName(c.model_name);
  if (!m || !c.cols || !c.rows || m.resW == null || m.resH == null) return '';
  return ` · ${fmt(m.resW * c.cols)}×${fmt(m.resH * c.rows)}px`;
}
// 사례 → 화면 적용용 구성. 모델 스냅샷이 담긴 data가 있으면 그대로, 없으면 모델명으로 찾아 합성.
function caseToConfig(c) {
  if (c.data && typeof c.data === 'object' && c.data.selectedId) return c.data;
  const m = findModelByName(c.model_name);
  const cols = c.cols || 0, rows = c.rows || 0;
  const spaceW = c.space_w || (m && cols ? Math.round(cols * m.cabW + 2 * EDGE_MARGIN) : 0);
  const spaceH = c.space_h || (m && rows ? Math.round(rows * m.cabH + 2 * EDGE_MARGIN) : 0);
  const cfg = { mode: 'manual', manCols: cols, manRows: rows, spaceW, spaceH };
  if (m) { cfg.selectedId = m.id; cfg.selectedModel = { ...m }; }
  return cfg;
}

const casesDlg = $('#casesDlg');
async function openCases() {
  if (!ensureCaseViewCode()) return;
  casesDlg?.showModal();
  await renderCaseList();
}
async function renderCaseList() {
  const el = $('#caseList'); if (!el) return;
  el.innerHTML = '<div class="previewEmpty">불러오는 중…</div>';
  try {
    const rows = await listCases(caseViewCode);
    if (!rows.length) {
      // 비었거나 비번 틀림 → 저장하지 않고(틀린 비번을 기억하지 않도록) 다시 입력 유도.
      localStorage.removeItem(CASE_VIEW_KEY);
      caseRowsCache = [];
      el.innerHTML = '<div class="previewEmpty">🔒 <b>비밀번호가 다르거나</b> 아직 등록된 사례가 없습니다.<br>'
        + '<button class="tiny primary" id="btnCaseRetryPass" style="margin-top:8px">비밀번호 다시 입력</button></div>';
      $('#btnCaseRetryPass')?.addEventListener('click', () => { if (ensureCaseViewCode(true)) renderCaseList(); });
      const yf = $('#caseYearFilter'); if (yf) yf.innerHTML = '';
      return;
    }
    localStorage.setItem(CASE_VIEW_KEY, caseViewCode);   // 조회 성공 → 검증된 비번으로 저장
    // 같은 모델끼리 모이도록 '모델명' 기준으로 정렬(같은 모델 안에서는 배열 작은 순 → 최신순).
    // 표기가 달라도(MMF015·MM015F 등) 같은 모델로 묶이게 실제 모델명으로 정렬한다.
    const modelKey = c => (findModelByName(c.model_name)?.name || c.model_name || 'zzz');
    rows.sort((a, b) =>
      modelKey(a).localeCompare(modelKey(b), 'ko') ||
      (a.cols || 0) - (b.cols || 0) || (a.rows || 0) - (b.rows || 0) ||
      String(b.created_at).localeCompare(String(a.created_at)));
    caseRowsCache = rows;
    renderCaseYearChips();
    renderCaseRows();
  } catch (e) {
    el.innerHTML = `<div class="previewEmpty">설치 사례를 불러오지 못했습니다.<br>(${esc(e.message)})<br>인터넷 연결·보기 비밀번호를 확인하세요.</div>`;
  }
}
// 설치일에서 연도(YYYY) 추출. 날짜가 없으면 '미지정'.
function caseYearOf(c) { const m = /^(\d{4})/.exec(String(c.install_date || '')); return m ? m[1] : '미지정'; }
// 검색어 일치(건명·장소·모델명·메모·배열). 빈 검색어는 항상 통과.
function caseMatchesSearch(c, q) {
  if (!q) return true;
  const model = findModelByName(c.model_name)?.name || c.model_name || '';
  return [c.name, c.site, c.memo, model, `${c.cols}×${c.rows}`]
    .some(x => String(x || '').toLowerCase().includes(q));
}
// 연도 필터 칩(전체 + 데이터에 있는 연도, 최신순 + 미지정).
function renderCaseYearChips() {
  const el = $('#caseYearFilter'); if (!el) return;
  const years = [...new Set(caseRowsCache.map(caseYearOf))];
  const known = years.filter(y => y !== '미지정').sort((a, b) => b.localeCompare(a));
  const ordered = [...known, ...(years.includes('미지정') ? ['미지정'] : [])];
  if (caseYear !== 'all' && !ordered.includes(caseYear)) caseYear = 'all';   // 사라진 연도면 전체로
  const chip = (val, label) => `<button class="tiny ${caseYear === val ? 'primary' : 'ghost'}" data-case-year="${esc(val)}">${esc(label)}</button>`;
  el.innerHTML = chip('all', '전체') + ordered.map(y => chip(y, y === '미지정' ? '미지정' : y + '년')).join('');
}
// 캐시된 사례를 검색·연도로 걸러 목록을 그린다(서버 재조회 없음).
function renderCaseRows() {
  const el = $('#caseList'); if (!el) return;
  const q = caseSearch.trim().toLowerCase();
  const cur = currentModelArray();
  const sameModel = c => cur.m && findModelByName(c.model_name)?.id === cur.m.id;
  const list = caseRowsCache.filter(c =>
    (caseYear === 'all' || caseYearOf(c) === caseYear) && caseMatchesSearch(c, q));
  if (!list.length) { el.innerHTML = '<div class="previewEmpty">조건에 맞는 사례가 없습니다.</div>'; return; }
  el.innerHTML = list.map(c => {
    const match = (sameModel(c) && c.cols === cur.cols && c.rows === cur.rows)
      ? ' <span class="chk">지금 배열과 일치</span>' : '';
    // 표기 순서: 모델명 · 캐비넷(열×행) · 건명(설치장소). 건명이 없으면 사례명으로 대체.
    const modelDisp = esc((findModelByName(c.model_name)?.name) || c.model_name || '—');
    const arr = `${c.cols || '?'}×${c.rows || '?'}`;
    const proj = esc(c.site || c.name || '');
    const title = `${modelDisp} ${arr}${proj ? ` · ${proj}` : ''}`;
    const resTxt = caseResolution(c).replace(/^ · /, '');
    const meta = [c.install_date, resTxt, c.memo].filter(Boolean).map(esc).join(' · ') || '&nbsp;';
    return `<div class="cfgRow" style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:8px 0">
      <div style="min-width:0"><div class="mname">${title}${match}</div><div class="hint">${meta}</div></div>
      <div style="display:flex;gap:6px;flex:0 0 auto">
        <button class="tiny primary" data-case-load="${esc(String(c.id))}">불러오기</button>
        <button class="tiny" data-case-edit="${esc(String(c.id))}">수정</button>
        <button class="tiny ghost" data-case-del="${esc(String(c.id))}">삭제</button>
      </div>
    </div>`;
  }).join('');
}
// ── 중복 사례 판정 ──────────────────────────────────────────────
// 중복 기준: 설치장소 · 모델 · 배열(열×행)이 모두 같으면 중복으로 본다(오너 결정).
// 표기가 달라도(MMF015·MM015F) 같은 모델로 묶이게 실제 모델 id로 비교. 대소문자·앞뒤공백 무시.
const caseModelId = c => String(findModelByName(c.model_name)?.id || c.model_name || '').trim().toLowerCase();
const caseSiteKey = c => String(c.site || '').trim().toLowerCase();
function isDupCase(c, existing) {
  const site = caseSiteKey(c), model = caseModelId(c), arr = `${c.cols || ''}x${c.rows || ''}`;
  return (existing || []).some(e =>
    caseSiteKey(e) === site && caseModelId(e) === model && `${e.cols || ''}x${e.rows || ''}` === arr);
}
// 서버의 최신 목록을 가져와 중복 검사에 쓴다(실패하면 화면 캐시로 대체).
async function existingCasesForDupCheck() {
  try { return await listCases(caseViewCode); } catch { return caseRowsCache; }
}

// 현재 구성을 단건 사례로 등록.
async function registerCurrentCase() {
  const admin = getCaseAdminCode(); if (!admin) return;
  const { m, cols, rows } = currentModelArray();
  if (!m) { alert('모델을 먼저 선택하세요.'); return; }
  const name = (prompt('사례명:', `${m.name} ${cols}×${rows}`) || '').trim(); if (!name) return;
  const site = (prompt('설치장소/고객 (선택):', '') || '').trim();
  const install_date = normalizeDate(prompt('설치일 YYYY-MM-DD (선택):', '') || '');
  const memo = (prompt('메모 (선택):', '') || '').trim();
  const rec = {
    name, site: site || null, install_date, memo: memo || null,
    model_name: m.name, cols, rows,
    space_w: num($('#spaceW').value) || null, space_h: num($('#spaceH').value) || null,
    data: gatherConfig(), created_by: localStorage.getItem(NAME_KEY) || null,
  };
  // 중복 검사 — 같은 사례가 이미 있으면 등록하지 않고 팝업으로 알린다.
  if (isDupCase(rec, await existingCasesForDupCheck())) {
    alert(`이미 같은 설치 사례가 있습니다.\n(설치장소·모델·배열이 모두 동일)\n\n중복이라 등록하지 않았습니다.`);
    return;
  }
  try { await addCases(admin, [rec]); await renderCaseList(); alert(`'${name}' 사례를 등록했습니다.`); }
  catch (e) { alert('사례 등록에 실패했습니다.\n' + e.message); }
}
// 기존 사례 수정. 사례명·장소·날짜·메모를 고치고, 원하면 모델·배열도 현재 화면 구성으로 교체.
async function editCase(c) {
  const admin = getCaseAdminCode(); if (!admin) return;
  const name = (prompt('사례명:', c.name || '') || '').trim(); if (!name) return;
  const site = (prompt('설치장소/고객 (선택):', c.site || '') || '').trim();
  const install_date = normalizeDate(prompt('설치일 YYYY-MM-DD (선택):', c.install_date || '') || '');
  const memo = (prompt('메모 (선택):', c.memo || '') || '').trim();
  const patch = { name, site: site || null, install_date, memo: memo || null };
  // 모델·배열이 틀린 경우 현재 화면 구성으로 통째 교체(선택).
  const { m, cols, rows } = currentModelArray();
  if (m && confirm(`모델·배열을 지금 화면 구성(${m.name} ${cols}×${rows})으로 교체할까요?\n[확인] 모델·배열까지 교체   [취소] 사례명·장소·날짜·메모만 수정`)) {
    patch.model_name = m.name; patch.cols = cols; patch.rows = rows;
    patch.space_w = num($('#spaceW').value) || null; patch.space_h = num($('#spaceH').value) || null;
    patch.data = gatherConfig();
  }
  try { await updateCase(admin, c.id, patch, caseViewCode); await renderCaseList(); alert(`'${name}' 사례를 수정했습니다.`); }
  catch (e) { localStorage.removeItem(CASE_ADMIN_KEY); alert('수정하지 못했습니다.\n' + e.message + '\n\n(등록 비밀번호를 다시 입력받겠습니다.)'); }
}
// 파싱된 사례들을 모델 해석·공간/스냅샷 보강 후 서버에 일괄 등록(등록 비번 필요).
async function registerParsedCases(parsed, { clearPaste } = {}) {
  if (!parsed.length) { alert('사례를 찾지 못했습니다.\n(설치장소 · 설치일 · 모델 · 열 · 행 · 메모 순)'); return; }
  const admin = getCaseAdminCode(); if (!admin) return;
  const createdBy = localStorage.getItem(NAME_KEY) || null;
  const unknown = [];
  const mapped = parsed.map(c => {
    const m = findModelByName(c.model_name);   // 여러 표기(MMF015·MM015F 등) 인식
    if (c.model_name && !m) unknown.push(c.model_name);
    const space_w = (m && c.cols) ? Math.round(c.cols * m.cabW + 2 * EDGE_MARGIN) : null;
    const space_h = (m && c.rows) ? Math.round(c.rows * m.cabH + 2 * EDGE_MARGIN) : null;
    const data = m ? { mode: 'manual', manCols: c.cols, manRows: c.rows, spaceW: space_w, spaceH: space_h, selectedId: m.id, selectedModel: { ...m } } : null;
    return { name: c.name, site: c.site || null, install_date: c.install_date, memo: c.memo || null,
      model_name: m ? m.name : (c.model_name || null), cols: c.cols, rows: c.rows, space_w, space_h, data, created_by: createdBy };
  });
  // 중복 제거 — 기존 목록과 겹치거나, 이번 묶음 안에서 서로 겹치는 건은 제외한다.
  const existing = await existingCasesForDupCheck();
  const seen = [], dups = [];
  const rows = mapped.filter(r => {
    if (isDupCase(r, existing) || isDupCase(r, seen)) { dups.push(r.name); return false; }
    seen.push(r); return true;
  });
  const dupList = [...new Set(dups)];
  const dupMsg = dupList.length ? `\n\n⚠️ 이미 있는(중복) ${dups.length}건은 제외했습니다:\n- ${dupList.slice(0, 10).join('\n- ')}${dupList.length > 10 ? '\n  …외 ' + (dupList.length - 10) + '건' : ''}` : '';
  if (!rows.length) { alert(`추가할 새 사례가 없습니다. 모두 이미 등록된 중복입니다.${dupMsg}`); return; }
  const warn = unknown.length ? `\n\n⚠️ 인식 못한 모델명: ${[...new Set(unknown)].join(', ')}\n(그대로 등록하면 불러올 때 모델이 안 잡힙니다. 취소하고 모델명을 확인하는 걸 권장합니다.)` : '';
  if (!confirm(`${rows.length}건의 설치 사례를 등록할까요?${warn}${dupMsg}`)) return;
  try {
    await addCases(admin, rows);
    if (clearPaste && $('#casePaste')) $('#casePaste').value = '';
    await renderCaseList();
    alert(`${rows.length}건을 등록했습니다.${dupList.length ? ` (중복 ${dups.length}건 제외)` : ''}`);
  } catch (e) { alert('일괄 등록에 실패했습니다.\n' + e.message); }
}
// 엑셀 붙여넣기(탭) 일괄 등록.
async function bulkRegisterCases() {
  await registerParsedCases(parseCasesText($('#casePaste')?.value || ''), { clearPaste: true });
}
// CSV 파일에서 일괄 등록.
async function importCasesCsv(file) {
  if (!file) return;
  try {
    const text = await file.text();   // UTF-8로 읽음 → CSV는 'CSV UTF-8'로 저장해야 한글이 안 깨짐
    await registerParsedCases(parseCasesText(text));
  } catch (e) { alert('CSV 파일을 읽지 못했습니다.\n' + e.message); }
}
$('#btnCases')?.addEventListener('click', openCases);
$('#casesClose')?.addEventListener('click', () => casesDlg.close());
$('#casesCancel')?.addEventListener('click', () => casesDlg.close());
$('#btnCaseRefresh')?.addEventListener('click', renderCaseList);
$('#btnCaseViewPass')?.addEventListener('click', () => { if (ensureCaseViewCode(true)) renderCaseList(); });
// 검색어 입력 → 목록만 다시 필터(서버 재조회 없음).
$('#caseSearch')?.addEventListener('input', e => { caseSearch = e.target.value || ''; renderCaseRows(); });
// 연도 칩 클릭 → 그 연도로 필터.
$('#caseYearFilter')?.addEventListener('click', e => {
  const b = e.target.closest('[data-case-year]'); if (!b) return;
  caseYear = b.dataset.caseYear; renderCaseYearChips(); renderCaseRows();
});
$('#btnCaseAddCurrent')?.addEventListener('click', registerCurrentCase);
$('#btnCaseBulk')?.addEventListener('click', bulkRegisterCases);
$('#btnCaseCsv')?.addEventListener('click', () => $('#caseCsvFile')?.click());
$('#caseCsvFile')?.addEventListener('change', e => { const f = e.target.files?.[0]; e.target.value = ''; importCasesCsv(f); });
$('#caseList')?.addEventListener('click', async e => {
  const loadBtn = e.target.closest('[data-case-load]');
  const editBtn = e.target.closest('[data-case-edit]');
  const delBtn = e.target.closest('[data-case-del]');
  if (loadBtn) {
    const c = caseRowsCache.find(r => String(r.id) === loadBtn.dataset.caseLoad);
    if (c) { applyConfig(caseToConfig(c)); setCurrentConfig(c.name); casesDlg.close(); }
    return;
  }
  if (editBtn) {
    const c = caseRowsCache.find(r => String(r.id) === editBtn.dataset.caseEdit);
    if (c) await editCase(c);
    return;
  }
  if (delBtn) {
    const c = caseRowsCache.find(r => String(r.id) === delBtn.dataset.caseDel);
    if (!c) return;
    const admin = getCaseAdminCode(); if (!admin) return;
    if (!confirm(`설치 사례 '${c.name}'을(를) 삭제할까요? (모든 직원에게서 사라집니다)`)) return;
    try { await deleteCase(admin, c.id, caseViewCode); await renderCaseList(); }
    catch (err) { localStorage.removeItem(CASE_ADMIN_KEY); alert('삭제하지 못했습니다.\n' + err.message + '\n\n(등록 비밀번호를 다시 입력받겠습니다.)'); }
  }
});

window.addEventListener('resize', renderPreview);

// 인쇄 시 03 미리보기를 A4 폭(styles.css의 body.printing 고정폭)에 맞춰 다시 그린다.
// beforeprint에서 클래스 추가 후 재렌더 → 화면 폭과 무관하게 그림이 페이지 안에 들어온다.
window.addEventListener('beforeprint', () => { document.body.classList.add('printing'); renderPreview(); });
window.addEventListener('afterprint', () => { document.body.classList.remove('printing'); renderPreview(); });

renderAll();
handleSharedLink();   // 공유 링크(#share=)로 들어온 경우 그 구성을 불러온다.
