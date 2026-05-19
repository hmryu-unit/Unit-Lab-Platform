/* ===========================
   유닛랩 플랫폼 - 메인 앱
   =========================== */

// ===== 전역 상태 =====
const State = {
  currentPage: 'dashboard',
  lineups: [],
  packageCategories: [],  // 분류 (마감, 구조, 건축 등)
  packages: [],
  lineupSetSelections: [],
  grades: [],
  packageItems: [],      // 항목 (세면대, 양변기 등)
  slots: [],
  slotAssignments: [],   // (항목 × 패키지) → 스펙 배치
  materials: [],
  slotMaterials: [],
  variants: [],
  changeLogs: [],
  enums: [],       // 선택지 관리
  filters: {}
};

// ===== Supabase 설정 =====
const SUPABASE_URL = 'https://hxjvhssmmnzetbygzqdo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_AaiskI_pBfoCLvvSBTWegw_3N4Z8Pz1';

function _sbHeaders(extra = {}) {
  return {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    ...extra
  };
}

// ===== API 헬퍼 (Supabase PostgREST) =====
const API = {
  // GET: 목록 조회
  // params 예시: { eq: { set_type_id: 'abc' }, order: 'sort_order.asc', limit: 500 }
  async get(table, params = {}) {
    const { limit = 1000, eq, order } = params;
    const qs = new URLSearchParams();

    // eq 필터: { field: value } → ?field=eq.value
    if (eq) {
      Object.entries(eq).forEach(([k, v]) => qs.append(k, `eq.${v}`));
    }
    // 정렬: 'sort_order.asc' → ?order=sort_order.asc
    if (order) qs.append('order', order);

    // limit은 쿼리 파라미터로 전달 (Range 헤더 미사용 — 빈 테이블 416 오류 방지)
    qs.append('limit', limit);

    const url = `${SUPABASE_URL}/rest/v1/${table}?${qs.toString()}`;

    const res = await fetch(url, {
      headers: _sbHeaders()
    });
    if (!res.ok) {
      const err = await res.text();
      console.error(`[API.get] ${table} → status:${res.status}`, err);
      throw new Error(`GET ${table} 실패: ${err}`);
    }
    const rows = await res.json();
    // 기존 코드와 호환: { data: [...] } 형태로 반환
    return { data: Array.isArray(rows) ? rows : [] };
  },

  // POST: 단건 생성 → 생성된 행 반환
  async post(table, data) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: _sbHeaders({ 'Prefer': 'return=representation' }),
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`POST ${table} 실패: ${err}`);
    }
    const rows = await res.json();
    // Supabase는 배열로 반환 → 첫 번째 행 반환
    return Array.isArray(rows) ? rows[0] : rows;
  },

  // PUT: 수정 (id 기준 PATCH) → 수정된 행 반환
  async put(table, id, data) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        headers: _sbHeaders({ 'Prefer': 'return=representation' }),
        body: JSON.stringify(data)
      }
    );
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`PUT ${table}/${id} 실패: ${err}`);
    }
    const rows = await res.json();
    return Array.isArray(rows) ? rows[0] : rows;
  },

  // DELETE: 단건 삭제
  async delete(table, id) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`,
      {
        method: 'DELETE',
        headers: _sbHeaders({ 'Prefer': 'return=minimal' })
      }
    );
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`DELETE ${table}/${id} 실패: ${err}`);
    }
  }
};

// ===== 유틸리티 =====
function showToast(msg, type = 'success') {
  const icons = { success: '✅', error: '❌', warning: '⚠️' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${icons[type] || '💬'}</span><span>${msg}</span>`;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function openModal(id) {
  document.getElementById(id).classList.add('open');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

function formatPrice(v) {
  if (!v) return '-';
  return Number(v).toLocaleString('ko-KR') + '원';
}

function formatDate(ts) {
  if (!ts) return '-';
  const d = new Date(Number(ts));
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function statusBadge(s) {
  const map = {
    active:       '',  // 활성화 상태엔 배지 표시 안 함
    inactive:     '<span class="badge badge-gray">비활성화</span>',
    discontinued: '<span class="badge badge-gray">비활성화</span>',  // 구버전 호환
    draft:        '<span class="badge badge-warning">초안</span>',
    pending:      '<span class="badge badge-warning">검토중</span>',
  };
  return map[s] ?? `<span class="badge badge-gray">${s}</span>`;
}

// 브랜드 선택지(enum lineup_brand) 색상 조회
const BRAND_COLOR_FALLBACK = ['#1a56db', '#0e9f6e', '#9333ea', '#f59e0b', '#ef4444', '#06b6d4'];

function getBrandEnum(brand) {
  if (!brand) return null;
  return (State.enums || []).find(e => e.group_key === 'lineup_brand' && e.value === brand) || null;
}

function getBrandColor(brand, fallbackIdx = 0) {
  const entry = getBrandEnum(brand);
  if (entry?.color) return entry.color;
  const brands = (State.enums || [])
    .filter(e => e.group_key === 'lineup_brand')
    .sort((a, b) => (a.sort_order || 99) - (b.sort_order || 99))
    .map(e => e.value);
  const idx = brands.indexOf(brand);
  if (idx >= 0) return BRAND_COLOR_FALLBACK[idx % BRAND_COLOR_FALLBACK.length];
  const allBrands = [...new Set(State.lineups.map(l => l.brand).filter(Boolean))];
  const fi = allBrands.indexOf(brand);
  return BRAND_COLOR_FALLBACK[(fi >= 0 ? fi : fallbackIdx) % BRAND_COLOR_FALLBACK.length];
}

function brandBadge(brand, label) {
  const text = label || brand;
  if (!text) return '<span class="badge badge-gray">-</span>';
  const color = getBrandColor(brand || text);
  return `<span class="badge" style="background:${escHtml(color)}1a;color:${escHtml(color)};border:1px solid ${escHtml(color)}40">${escHtml(text)}</span>`;
}

// 하위 호환 — CSS 클래스만 필요한 곳용
function getBrandBadgeClass(brand) {
  const brands = (State.enums || [])
    .filter(e => e.group_key === 'lineup_brand')
    .sort((a, b) => (a.sort_order || 99) - (b.sort_order || 99))
    .map(e => e.value);
  const idx = brands.indexOf(brand);
  const palette = ['badge-brand-0', 'badge-brand-1', 'badge-brand-2', 'badge-brand-3', 'badge-brand-4', 'badge-brand-5'];
  return palette[idx >= 0 ? idx % palette.length : 0];
}

function categoryBadge(c) {
  // enum material_type color를 동적으로 반영 (State 로드 후)
  const enumEntry = (State.enums || []).find(e => e.group_key === 'material_type' && e.value === c);
  if (enumEntry?.color) {
    return `<span class="badge" style="background:${enumEntry.color}1a;color:${enumEntry.color};border:1px solid ${enumEntry.color}40">${escHtml(c)}</span>`;
  }
  // fallback: 하드코딩 색상 맵
  const colors = { 구조재:'badge-info', 마감재:'badge-purple', 단열재:'badge-warning', 방수재:'badge-info', 설비:'badge-gray', 기타:'badge-gray' };
  return `<span class="badge ${colors[c]||'badge-gray'}">${escHtml(c)}</span>`;
}

function confirmDelete(msg, onOk) {
  document.getElementById('confirm-message').textContent = msg;
  const btn = document.getElementById('confirm-ok-btn');
  btn.onclick = () => { closeModal('confirm-modal'); onOk(); };
  openModal('confirm-modal');
}

function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ===== 스펙 속성값 파싱/직렬화 헬퍼 =====
// slots.description 필드에 "일반설명\n[[ATTRS]]\n{json}" 형태로 저장
const ATTRS_SEP = '\n[[ATTRS]]\n';

/** description 문자열 → { desc, attrs } */
function parseSlotDesc(raw) {
  if (!raw) return { desc: '', attrs: {} };
  const idx = raw.indexOf(ATTRS_SEP);
  if (idx === -1) return { desc: raw, attrs: {} };
  const desc = raw.slice(0, idx);
  try {
    const attrs = JSON.parse(raw.slice(idx + ATTRS_SEP.length));
    return { desc, attrs: typeof attrs === 'object' && attrs ? attrs : {} };
  } catch {
    return { desc, attrs: {} };
  }
}

/** { desc, attrs } → description 문자열 */
function serializeSlotDesc(desc, attrs) {
  const cleanDesc = (desc || '').trim();
  const hasAttrs  = attrs && Object.keys(attrs).length > 0;
  if (!hasAttrs) return cleanDesc;
  return cleanDesc + ATTRS_SEP + JSON.stringify(attrs);
}

/** State.enums에서 특정 slot_type의 속성 정의 목록 반환
 *  group_key = "slot_attr_def:{slotType}"
 *  → [{ id, value(key), label(표시명), color("단위\t기준예시"), sort_order }]
 *
 * color 필드 직렬화: "단위" or "단위\t기준예시"
 * _parseAttrUnit(color) → { unit, hint }
 */
function _parseAttrUnit(colorStr) {
  if (!colorStr) return { unit: '', hint: '' };
  const idx = colorStr.indexOf('\t');
  if (idx === -1) return { unit: colorStr, hint: '' };
  return { unit: colorStr.slice(0, idx), hint: colorStr.slice(idx + 1) };
}
function _serializeAttrUnit(unit, hint) {
  const u = (unit || '').trim();
  const h = (hint || '').trim();
  if (!u && !h) return '';
  if (!h) return u;
  return `${u}\t${h}`;
}

function getAttrDefs(slotType) {
  if (!slotType) return [];
  return (State.enums || [])
    .filter(e => e.group_key === `slot_attr_def:${slotType}`)
    .sort((a, b) => (a.sort_order || 99) - (b.sort_order || 99));
}

// ===== 드래그앤드롭 정렬 공통 유틸 =====
/**
 * makeSortable(container, options)
 * - container   : 드래그 대상 행들의 부모 엘리먼트 (HTMLElement)
 * - options:
 *     itemSelector  : 드래그 대상 행 CSS 선택자 (e.g. 'tr[data-id]', '.stg-st-block[data-id]')
 *     handleSelector: 핸들 CSS 선택자 (e.g. '.drag-handle'). 없으면 행 전체
 *     getId         : 행 → 데이터 id 추출 함수 (el => el.dataset.id)
 *     onReorder     : async (orderedIds) => void  — 새 순서의 id 배열 전달, 저장 처리
 */
function makeSortable(container, { itemSelector, handleSelector, getId, onReorder, skipDragData = false }) {
  let dragSrc = null;    // 드래그 중인 행 엘리먼트

  function getItems() {
    return [...container.querySelectorAll(itemSelector)];
  }

  function onDragStart(e) {
    dragSrc = this;
    dragSrc.classList.add('sortable-dragging');
    e.dataTransfer.effectAllowed = 'move';
    // skipDragData=true이면 이미 외부에서 setData를 처리했으므로 덮어쓰지 않음
    if (!skipDragData) {
      e.dataTransfer.setData('text/plain', '');   // Firefox 필수
    }
  }

  function onDragEnd() {
    dragSrc && dragSrc.classList.remove('sortable-dragging');
    getItems().forEach(el => {
      el.classList.remove('sortable-drag-over-top', 'sortable-drag-over-bottom');
    });
    dragSrc = null;
  }

  function onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!dragSrc || this === dragSrc) return;

    // 행의 상단 50% / 하단 50% 기준으로 삽입 위치 결정
    const rect = this.getBoundingClientRect();
    const mid  = rect.top + rect.height / 2;
    this.classList.remove('sortable-drag-over-top', 'sortable-drag-over-bottom');
    this.classList.add(e.clientY < mid ? 'sortable-drag-over-top' : 'sortable-drag-over-bottom');
  }

  function onDragLeave() {
    this.classList.remove('sortable-drag-over-top', 'sortable-drag-over-bottom');
  }

  function onDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!dragSrc || this === dragSrc) return;

    // skipDragData 모드: slot-pool-sort 키가 비어있으면 정렬용 드래그가 아님 → 무시
    if (skipDragData && !e.dataTransfer.getData('slot-pool-sort')) return;

    const rect  = this.getBoundingClientRect();
    const after = e.clientY >= rect.top + rect.height / 2;

    // DOM 이동
    if (after) {
      this.parentNode.insertBefore(dragSrc, this.nextSibling);
    } else {
      this.parentNode.insertBefore(dragSrc, this);
    }

    // 저장 — 현재 DOM 순서대로 id 배열 추출
    const orderedIds = getItems().map(el => getId(el));
    _saveSortOrder(orderedIds, onReorder);
  }

  // 이벤트 바인딩
  getItems().forEach(el => {
    if (skipDragData) {
      // skipDragData=true: dragstart/dragend/draggable은 외부에서 이미 처리
      // dragover, dragleave, drop만 추가로 바인딩
      el.addEventListener('dragover',   onDragOver);
      el.addEventListener('dragleave',  onDragLeave);
      el.addEventListener('drop',       onDrop);
      // dragSrc 추적을 위해 dragstart는 여전히 바인딩하되 setData는 skip
      el.addEventListener('dragstart',  onDragStart);
      el.addEventListener('dragend',    onDragEnd);
    } else if (handleSelector) {
      const handle = el.querySelector(handleSelector);
      if (handle) {
        el.setAttribute('draggable', 'false');
        handle.addEventListener('mousedown', () => { el.setAttribute('draggable', 'true'); });
        handle.addEventListener('mouseup',   () => { el.setAttribute('draggable', 'false'); });
      }
      el.addEventListener('dragstart',  onDragStart);
      el.addEventListener('dragend',    onDragEnd);
      el.addEventListener('dragover',   onDragOver);
      el.addEventListener('dragleave',  onDragLeave);
      el.addEventListener('drop',       onDrop);
    } else {
      el.setAttribute('draggable', 'true');
      el.addEventListener('dragstart',  onDragStart);
      el.addEventListener('dragend',    onDragEnd);
      el.addEventListener('dragover',   onDragOver);
      el.addEventListener('dragleave',  onDragLeave);
      el.addEventListener('drop',       onDrop);
    }
  });
}

/** 저장: 새 순서 배열 → sort_order 1,2,3... 일괄 PATCH */
let _sortSaveTimer = null;
async function _saveSortOrder(orderedIds, onReorder) {
  // 저장 중 배지 표시
  let badge = document.querySelector('.sort-saving-badge');
  if (!badge) {
    badge = document.createElement('div');
    badge.className = 'sort-saving-badge';
    badge.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:6px"></i> 순서 저장 중…';
    document.body.appendChild(badge);
  }
  try {
    await onReorder(orderedIds);
    badge.innerHTML = '✅ 순서가 저장되었습니다';
  } catch(e) {
    badge.innerHTML = '❌ 저장 실패: ' + e.message;
  }
  clearTimeout(_sortSaveTimer);
  _sortSaveTimer = setTimeout(() => { badge.remove(); }, 1800);
}

// ===== 변경이력 자동 기록 =====
async function logChange(entityType, entityId, entityName, changeType, before, after, reason = '') {
  try {
    const rec = await API.post('change_logs', {
      entity_type: entityType,
      entity_id: entityId,
      entity_name: entityName,
      change_type: changeType,
      before_value: before ? JSON.stringify(before) : '',
      after_value: after ? JSON.stringify(after) : '',
      changed_by: '운영자',
      reason: reason
    });
    // 삭제가 아닌 변경/생성만 Undo 대상으로 버튼 활성화
    if (changeType !== 'delete') {
      _setUndoBtn({ id: rec.id, entityType, entityId, entityName, changeType, before, after });
    }
  } catch(e) { /* 이력 기록 실패는 무시 */ }
}

// ── Undo 상태 관리 ──
let _lastUndoable = null; // { id, entityType, entityId, entityName, changeType, before, after }

function _setUndoBtn(info) {
  _lastUndoable = info;
  const btn   = document.getElementById('undo-btn');
  const label = document.getElementById('undo-btn-label');
  if (!btn) return;
  const typeLabel = {
    lineup: '플랫폼', set_type: '카테고리', set: '패키지',
    slot: '스펙', material: '자재', slot_material: '자재 연결',
    variant: '변형', enum: '선택지'
  }[info.entityType] || info.entityType;
  const actionLabel = info.changeType === 'create' ? '추가' : '수정';
  label.textContent = `되돌리기(${typeLabel} ${actionLabel})`;
  btn.disabled = false;
  btn.classList.add('undo-btn--active');
}

function _clearUndoBtn() {
  _lastUndoable = null;
  const btn   = document.getElementById('undo-btn');
  const label = document.getElementById('undo-btn-label');
  if (!btn) return;
  label.textContent = '되돌리기';
  btn.disabled = true;
  btn.classList.remove('undo-btn--active');
}

async function undoLastChange() {
  if (!_lastUndoable) return;
  const { id: logId, entityType, entityId, changeType, before, after, entityName } = _lastUndoable;

  // 테이블 이름 매핑
  const tableMap = {
    lineup: 'lineups', package: 'packages', grade: 'grades',
    slot: 'slots', material: 'materials', slot_material: 'slot_materials',
    variant: 'variants', enum: 'enums'
  };
  const table = tableMap[entityType];
  if (!table) { showToast('되돌리기 지원 안 됨', 'error'); return; }

  const typeLabel = {
    lineup: '플랫폼', package: '패키지', grade: '등급',
    slot: '스펙', material: '자재', slot_material: '자재 연결',
    variant: '변형', enum: '선택지'
  }[entityType] || entityType;

  try {
    if (changeType === 'create') {
      // 생성 취소 → 삭제
      await API.delete(table, entityId);
      showToast(`"${entityName}" 추가가 취소되었습니다`);
    } else if (changeType === 'replace') {
      // 자재 연결 변경 취소 → after(새 연결) 삭제, before(이전 연결) 복원
      if (after) await API.delete(table, after.id || entityId).catch(() => {});
      if (before) await API.post(table, before);
      showToast(`"${entityName}" 연결이 이전으로 돌아갔습니다`);
    } else if (changeType === 'update' && before) {
      // 수정 취소 → before 값으로 복원
      const restoreData = typeof before === 'string' ? JSON.parse(before) : before;
      await API.put(table, entityId, restoreData);
      showToast(`"${entityName}" 수정이 취소되었습니다`);
    } else {
      showToast('되돌릴 이전 데이터가 없습니다', 'error'); return;
    }
    // 이력 로그에서 해당 항목 제거
    await API.delete('change_logs', logId).catch(() => {});
    _clearUndoBtn();
    await loadAll();
    // 현재 페이지 갱신
    const refreshMap = {
      lineups: renderLineups, slots: renderSlotTable,
      materials: renderMaterials, 'slot-materials': renderSlotMaterials,
      'packages': renderPackages, grades: renderGrades, variants: renderVariants,
      enums: renderEnumsPage
    };
    const refreshFn = refreshMap[State.currentPage];
    if (refreshFn) refreshFn();
    else if (State.currentPage === 'package-detail' && currentPackageId) renderPackageDetail(currentPackageId);
  } catch(e) { showToast('되돌리기 실패: ' + e.message, 'error'); }
}

// Ctrl+Z 전역 단축키
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    // 입력 필드 안에 있을 때는 기본 동작 유지
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    e.preventDefault();
    undoLastChange();
  }
});

// ===== 내비게이션 =====
function navigate(page) {
  // 활성 페이지 전환
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const pageEl = document.getElementById(`page-${page}`);
  if (pageEl) pageEl.classList.add('active');

  const navEl = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (navEl) navEl.classList.add('active');

  State.currentPage = page;

  const titles = {
    dashboard: '대시보드',
    lineups: '플랫폼 관리',
    'packages': '패키지 관리',
    'package-detail': '패키지 상세',
    grades: '등급 카탈로그',
    slots: '스펙 관리',
    materials: '자재 DB',
    'slot-materials': '스펙-자재 연결',
    variants: '변형(Variant) 관리',
    changelogs: '변경 이력',
    enums: '유형 관리'
  };
  document.getElementById('header-title').textContent = titles[page] || page;

  // 페이지별 렌더
  const renders = {
    dashboard: renderDashboard,
    lineups: renderLineups,
    'packages': renderPackages,
    grades: renderGrades,
    slots: renderSlots,
    materials: renderMaterials,
    'slot-materials': renderSlotMaterials,
    variants: renderVariants,
    changelogs: renderChangeLogs,
    enums: renderEnumsPage
  };
  if (renders[page]) renders[page]();
}

// ===== 데이터 로드 =====
async function loadAll() {
  try {
    const [lineups, stCategories, setTypes, lineupSetSels, grades, stItems, slots, slotAssigns, materials, slotMaterials, variants, logs, enums] = await Promise.all([
      API.get('lineups'),
      API.get('package_categories'),
      API.get('packages'),
      API.get('lineup_set_selections'),
      API.get('grades'),
      API.get('package_items'),
      API.get('slots'),
      API.get('slot_assignments'),
      API.get('materials'),
      API.get('slot_materials'),
      API.get('variants'),
      API.get('change_logs'),
      API.get('enums')
    ]);
    State.lineups = (lineups.data || []).sort((a, b) => (a.id||'').localeCompare(b.id||''));
    State.packageCategories = (stCategories.data || []).sort((a, b) => (a.sort_order||99) - (b.sort_order||99));
    State.packages = (setTypes.data || []).sort((a, b) => (a.sort_order||99) - (b.sort_order||99));
    State.lineupSetSelections = lineupSetSels.data || [];
    State.grades = grades.data || [];
    State.packageItems = (stItems.data || []).sort((a, b) => (a.sort_order||99) - (b.sort_order||99));
    State.slots = slots.data || [];
    State.slotAssignments = slotAssigns.data || [];
    State.materials = materials.data || [];
    State.slotMaterials = slotMaterials.data || [];
    State.variants = variants.data || [];
    State.changeLogs = logs.data || [];
    State.enums = (enums.data || []).sort((a, b) => (a.sort_order||99) - (b.sort_order||99));

    // 동적 select 채우기
    _populateDynamicSelects();



    // 뱃지 업데이트
    document.getElementById('nav-badge-lineups').textContent = State.lineups.length;
    const navBadgeSets = document.getElementById('nav-badge-grades');
    if (navBadgeSets) navBadgeSets.textContent = State.grades.length;

  } catch(e) {
    showToast('데이터 로드 실패: ' + e.message, 'error');
  }
}

// ===================================================
// ===== 대시보드 =====
// ===================================================
async function renderDashboard() {
  await loadAll();

  const isEmpty = State.lineups.length === 0 && State.materials.length === 0;

  // 데이터가 하나도 없으면 온보딩 가이드 표시
  if (isEmpty) {
    document.getElementById('dashboard-stats').innerHTML = '';
    document.getElementById('dashboard-lineups-table').innerHTML = '';
    document.getElementById('dashboard-discontinued').innerHTML = '';
    document.getElementById('dashboard-logs').innerHTML = '';

    // 온보딩 카드를 page-dashboard에 삽입 (한 번만)
    const existing = document.getElementById('onboarding-guide');
    if (!existing) {
      const guideEl = document.createElement('div');
      guideEl.id = 'onboarding-guide';
      guideEl.innerHTML = `
        <div class="onboarding-hero">
          <div class="onboarding-icon">🏗️</div>
          <h2>유닛랩 플랫폼에 오신 것을 환영합니다!</h2>
          <p>아래 순서대로 데이터를 입력하면 SSoT 자재 관리 시스템이 완성됩니다.</p>
        </div>
        <div class="onboarding-steps">
          <div class="onboarding-step" onclick="navigate('materials')">
            <div class="step-number">1</div>
            <div class="step-icon">🗃️</div>
            <div class="step-body">
              <div class="step-title">자재 DB 등록</div>
              <div class="step-desc">사용할 자재를 먼저 모두 등록합니다.<br>브랜드, 규격, 단가, 공급업체 등을 입력하세요.</div>
            </div>
            <div class="step-arrow">→</div>
          </div>
          <div class="onboarding-step" onclick="navigate('lineups')">
            <div class="step-number">2</div>
            <div class="step-icon">🏗️</div>
            <div class="step-body">
              <div class="step-title">플랫폼 등록</div>
              <div class="step-desc">유닛빌드·유닛하우스 등 플랫폼을 등록합니다.<br>브랜드, 규모(S/M/L/XL), 적용 면적을 입력하세요.</div>
            </div>
            <div class="step-arrow">→</div>
          </div>
          <div class="onboarding-step" onclick="navigate('sets')">
            <div class="step-number">3</div>
            <div class="step-icon">📦</div>
            <div class="step-body">
              <div class="step-title">패키지 카탈로그 등록</div>
              <div class="step-desc">각 플랫폼에 속하는 패키지를 등록합니다.<br>구조·외장·내장·설비·기초 카테고리로 분류하세요.</div>
            </div>
            <div class="step-arrow">→</div>
          </div>
          <div class="onboarding-step" onclick="navigate('slots')">
            <div class="step-number">4</div>
            <div class="step-icon">🔩</div>
            <div class="step-body">
              <div class="step-title">스펙 등록</div>
              <div class="step-desc">패키지 내 자재 역할(외벽 스터드, 단열재 등)을 스펙으로 정의합니다.<br>수량 산출식도 함께 입력하세요.</div>
            </div>
            <div class="step-arrow">→</div>
          </div>
          <div class="onboarding-step" onclick="navigate('slot-materials')">
            <div class="step-number">5</div>
            <div class="step-icon">🔗</div>
            <div class="step-body">
              <div class="step-title">스펙 ↔ 자재 연결</div>
              <div class="step-desc">각 스펙에 실제 자재를 연결합니다.<br>변형 조건(단열지역, 규모 등)도 설정할 수 있습니다.</div>
            </div>
            <div class="step-arrow">→</div>
          </div>
          <div class="onboarding-step done">
            <div class="step-number done">✓</div>
            <div class="step-icon">🎉</div>
            <div class="step-body">
              <div class="step-title">SSoT 완성!</div>
              <div class="step-desc">자재 교체 시 스펙-자재 연결만 수정하면<br>연결된 모든 플랫폼에 자동 반영됩니다.</div>
            </div>
            <div class="step-arrow"></div>
          </div>
        </div>
        <div style="text-align:center;margin-top:8px">
          <button class="btn btn-primary" style="font-size:15px;padding:12px 32px" onclick="navigate('materials')">
            <i class="fas fa-play"></i> 지금 시작하기 — 자재 DB 등록
          </button>
        </div>
      `;
      const ssotNotice = document.querySelector('#page-dashboard .ssot-notice');
      ssotNotice.after(guideEl);
    }
    return;
  }

  // 온보딩 가이드 제거 (데이터 있을 때)
  const existing = document.getElementById('onboarding-guide');
  if (existing) existing.remove();

  // 통계 카드
  const disc = State.materials.filter(m => m.status === 'inactive' || m.status === 'discontinued').length;
  const statsHtml = `
    <div class="stat-card">
      <div class="stat-icon blue">🏗️</div>
      <div class="stat-info">
        <div class="stat-label">전체 플랫폼</div>
        <div class="stat-value">${State.lineups.length}</div>
        <div class="stat-sub">유닛빌드 · 유닛하우스</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon green">📦</div>
      <div class="stat-info">
        <div class="stat-label">패키지 카탈로그</div>
        <div class="stat-value">${State.grades.length}</div>
        <div class="stat-sub">등록된 총 패키지 수</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon blue">🔩</div>
      <div class="stat-info">
        <div class="stat-label">스펙 (추상화)</div>
        <div class="stat-value">${State.slots.length}</div>
        <div class="stat-sub">자재 연결 ${State.slotMaterials.length}건</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon yellow">🗃️</div>
      <div class="stat-info">
        <div class="stat-label">전체 자재</div>
        <div class="stat-value">${State.materials.length}</div>
        <div class="stat-sub">활성 ${State.materials.filter(m=>m.status==='active').length}종</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon red">⚠️</div>
      <div class="stat-info">
        <div class="stat-label">비활성 자재</div>
        <div class="stat-value" style="color:#e02424">${disc}</div>
        <div class="stat-sub">교체 필요</div>
      </div>
    </div>
    <div class="stat-card">
      <div class="stat-icon green">📋</div>
      <div class="stat-info">
        <div class="stat-label">변경 이력</div>
        <div class="stat-value">${State.changeLogs.length}</div>
        <div class="stat-sub">전체 변경 기록</div>
      </div>
    </div>
  `;
  document.getElementById('dashboard-stats').innerHTML = statsHtml;

  // 플랫폼 현황 테이블
  const lineupRows = State.lineups.map(l => {
    // 이 플랫폼에 선택된 카테고리 수 (lineup_set_selections 기반)
    const selCount = State.lineupSetSelections.filter(s => s.lineup_id === l.id).length;
    const totalTypes = State.packages.length;
    return `<tr style="cursor:pointer" onclick="navigateToLineupDetail('${escHtml(l.id)}')">
      <td>${brandBadge(l.brand)}</td>
      <td style="font-weight:500">${escHtml(l.name)}</td>
      <td style="font-size:12px;color:#6b7280">${escHtml(l.description||'-')}</td>
      <td>
        ${totalTypes > 0
          ? `<span class="badge ${selCount === totalTypes ? 'badge-success' : 'badge-info'}">${selCount}/${totalTypes} 카테고리</span>`
          : `<span class="badge badge-gray">카테고리 없음</span>`}
      </td>
      <td>${statusBadge(l.status)}</td>
    </tr>`;
  }).join('');

  document.getElementById('dashboard-lineups-table').innerHTML = `
    <div class="table-wrapper" style="border:none">
      <table>
        <thead><tr><th>브랜드</th><th>플랫폼명</th><th>설명</th><th>패키지</th><th>상태</th></tr></thead>
        <tbody>${lineupRows || `<tr><td colspan="5"><div class="empty-state" style="padding:24px">
          <div class="empty-icon">🏗️</div>
          <h3>플랫폼 없음</h3>
          <p><span class="link-btn" onclick="navigate('lineups')">플랫폼 관리</span>에서 추가하세요</p>
        </div></td></tr>`}</tbody>
      </table>
    </div>`;

  // 비활성화 자재 알림
  const discMats = State.materials.filter(m => m.status === 'inactive' || m.status === 'discontinued');
  if (discMats.length === 0) {
    document.getElementById('dashboard-discontinued').innerHTML = `
      <div class="empty-state" style="padding:32px">
        <div class="empty-icon">✅</div>
        <h3>비활성화 자재 없음</h3>
        <p>모든 자재가 정상 운영중입니다</p>
      </div>`;
  } else {
    document.getElementById('dashboard-discontinued').innerHTML = discMats.map(m => `
      <div style="display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid #f3f4f6">
        <span class="status-dot inactive"></span>
        <div style="flex:1">
          <div style="font-weight:500;font-size:13px">${escHtml(m.name)}</div>
          <div style="font-size:11px;color:#9ca3af">${escHtml(m.code||'')} · ${escHtml(m.spec||'-')}</div>
        </div>
        <span class="badge badge-gray">비활성화</span>
      </div>`).join('');
  }

  // 최근 변경이력
  const recentLogs = [...State.changeLogs]
    .sort((a,b) => Number(b.created_at||0) - Number(a.created_at||0))
    .slice(0, 6);

  if (recentLogs.length === 0) {
    document.getElementById('dashboard-logs').innerHTML = `
      <div class="empty-state" style="padding:24px">
        <p>데이터를 추가·수정·삭제하면 이력이 자동 기록됩니다</p>
      </div>`;
  } else {
    const typeMap = { create:'🆕 생성', update:'✏️ 수정', delete:'🗑️ 삭제', replace:'🔄 교체' };
    const entityMap = { lineup:'플랫폼', set:'패키지', slot:'스펙', material:'자재', slot_material:'스펙-자재' };
    document.getElementById('dashboard-logs').innerHTML = `
      <table><thead><tr><th>일시</th><th>유형</th><th>대상</th><th>변경명</th><th>변경자</th></tr></thead>
      <tbody>${recentLogs.map(l => `<tr>
        <td style="font-size:12px;color:#6b7280">${formatDate(l.created_at)}</td>
        <td><span class="badge badge-info">${typeMap[l.change_type]||l.change_type}</span></td>
        <td><span class="badge badge-gray">${entityMap[l.entity_type]||l.entity_type}</span></td>
        <td style="font-weight:500">${escHtml(l.entity_name||'-')}</td>
        <td style="font-size:12px;color:#6b7280">${escHtml(l.changed_by||'-')}</td>
      </tr>`).join('')}</tbody></table>`;
  }
}

function refreshDashboard() {
  renderDashboard();
  showToast('대시보드가 새로고침되었습니다');
}

// ===================================================
// ===== 플랫폼 관리 =====
// ===================================================
let lineupFilterText = '';
let lineupFilterBrand = '';

async function renderLineups() {
  await loadAll();
  renderBrandManageSection();
  renderLineupTable();
}

// ── 브랜드 섹션 렌더 (플랫폼 관리 페이지 상단)
// 브랜드별 카드 + 드래그 정렬 + 수정/삭제 버튼 통합
function renderBrandManageSection() {
  const container = document.getElementById('brand-manage-section');
  if (!container) return;

  const brands = (State.enums || [])
    .filter(e => e.group_key === 'lineup_brand')
    .sort((a, b) => (a.sort_order || 99) - (b.sort_order || 99));

  const BRAND_ICONS = ['🏢', '🏠', '🏗️', '🏛️', '🏬', '🏭'];
  const totalTypes = State.packages.length;

  // 브랜드 카드 목록 HTML
  const cardsHtml = brands.length === 0
    ? `<div class="bm-empty">등록된 브랜드가 없습니다. <strong>+ 브랜드 추가</strong> 버튼으로 추가하세요.</div>`
    : brands.map((e, idx) => {
        const rawColor = e.color && e.color !== '#6b7280' ? e.color : null;
        const color = rawColor || '#6b7280';
        const icon  = BRAND_ICONS[idx % BRAND_ICONS.length];
        const brandLineups = State.lineups.filter(l => l.brand === e.value);
        const lineupHtml = brandLineups.length === 0
          ? `<div class="bm-lineup-empty">등록된 플랫폼 없음</div>`
          : brandLineups.map(l => {
              const selCount = State.lineupSetSelections.filter(s => s.lineup_id === l.id).length;
              return `<div class="bm-lineup-item" onclick="navigateToLineupDetail('${escHtml(l.id)}')">
                <span class="status-dot ${escHtml(l.status||'active')}"></span>
                <span class="bm-lineup-name">${escHtml(l.name)}</span>
                <span class="bm-lineup-count">${selCount}/${totalTypes}</span>
              </div>`;
            }).join('');

        return `
          <div class="bm-card" data-id="${escHtml(e.id)}" style="border-left:4px solid ${escHtml(color)}">
            <div class="bm-card-head" style="background:${escHtml(color)}12">
              <span class="bm-drag" title="드래그하여 순서 변경"><i class="fas fa-grip-vertical"></i></span>
              <span class="bm-card-icon">${icon}</span>
              <span class="bm-card-name" style="color:${escHtml(color)}">${escHtml(e.label || e.value)}</span>
              <span class="bm-card-cnt">${brandLineups.length}개</span>
              <div class="bm-card-actions">
                <button class="tm-icon-btn" onclick="event.stopPropagation();openBrandEditModal('${escHtml(e.id)}')" title="수정"><i class="fas fa-pen"></i></button>
                <button class="tm-icon-btn tm-icon-btn--del" onclick="event.stopPropagation();deleteBrand('${escHtml(e.id)}','${escHtml(e.label||e.value)}')" title="삭제"><i class="fas fa-trash"></i></button>
              </div>
            </div>
            <div class="bm-lineup-list">${lineupHtml}</div>
          </div>`;
      }).join('');

  container.innerHTML = `
    <div class="bm-section">
      <div class="bm-section-header">
        <div class="bm-section-title">
          <i class="fas fa-building"></i> 브랜드
          <span class="badge badge-gray" style="margin-left:6px;font-size:10px">${brands.length}</span>
        </div>
        <button class="btn btn-xs btn-secondary" onclick="openBrandAddModal()">
          <i class="fas fa-plus"></i> 브랜드 추가
        </button>
      </div>
      <div class="bm-cards-row" id="bm-cards-row">${cardsHtml}</div>
    </div>`;

  // DnD 카드 순서 변경
  if (brands.length >= 2) {
    const row = container.querySelector('#bm-cards-row');
    makeSortable(row, {
      itemSelector: '.bm-card[data-id]',
      handleSelector: '.bm-drag',
      getId: el => el.dataset.id,
      onReorder: async (orderedIds) => {
        await Promise.all(orderedIds.map((id, i) => {
          const e = State.enums.find(x => x.id === id);
          if (!e) return Promise.resolve();
          return API.put('enums', id, { ...e, sort_order: i + 1 });
        }));
        await loadAll();
        renderBrandManageSection();
        _populateDynamicSelects();
      }
    });
  }
}

// ── 브랜드 추가/수정 모달 ──
function openBrandAddModal() {
  _openBrandModal({}, false);
}
function openBrandEditModal(enumId) {
  const e = State.enums.find(x => x.id === enumId);
  if (!e) return;
  _openBrandModal(e, true);
}

function _openBrandModal(data, isEdit) {
  let modal = document.getElementById('brand-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'brand-modal';
    modal.innerHTML = `
      <div class="modal" style="max-width:380px">
        <div class="modal-header">
          <span class="modal-title" id="brand-modal-title">브랜드 추가</span>
          <button class="modal-close" onclick="closeModal('brand-modal')"><i class="fas fa-times"></i></button>
        </div>
        <div class="modal-body">
          <input type="hidden" id="brand-record-id">
          <div class="form-group">
            <label class="form-label">브랜드명 <span class="required">*</span></label>
            <input type="text" class="form-control" id="brand-label" placeholder="예: 유닛빌드, 유닛하우스">
          </div>
          <div class="form-group">
            <label class="form-label">색상</label>
            <div style="display:flex;align-items:center;gap:10px">
              <input type="color" id="brand-color" value="#1a56db"
                     style="width:40px;height:34px;border:1px solid #e5e7eb;border-radius:6px;cursor:pointer;padding:2px">
              <span style="font-size:12px;color:#9ca3af">브랜드 카드·배지 색상</span>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal('brand-modal')">취소</button>
          <button class="btn btn-primary" onclick="saveBrand()">저장</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }

  document.getElementById('brand-modal-title').textContent = isEdit ? '브랜드 수정' : '브랜드 추가';
  document.getElementById('brand-record-id').value = isEdit ? (data.id || '') : '';
  document.getElementById('brand-label').value     = isEdit ? (data.label || data.value || '') : '';
  document.getElementById('brand-color').value     = (data.color && data.color.startsWith('#')) ? data.color : '#1a56db';
  openModal('brand-modal');
}

async function saveBrand() {
  const id       = document.getElementById('brand-record-id').value.trim();
  const labelVal = document.getElementById('brand-label').value.trim();
  const color    = document.getElementById('brand-color').value || '#1a56db';

  if (!labelVal) { showToast('브랜드명을 입력하세요', 'error'); return; }

  const existing = id ? State.enums.find(e => e.id === id) : null;
  const sort_order = existing?.sort_order ??
    (Math.max(0, ...State.enums.filter(e => e.group_key === 'lineup_brand').map(e => e.sort_order || 0)) + 1);

  const payload = {
    group_key: 'lineup_brand', group_label: '플랫폼 브랜드',
    label: labelVal, value: labelVal,
    color, sort_order, is_system: false
  };

  try {
    if (id) {
      await API.put('enums', id, { ...payload, id });
      showToast('브랜드가 수정되었습니다');
    } else {
      await API.post('enums', payload);
      showToast('브랜드가 추가되었습니다');
    }
    closeModal('brand-modal');
    await loadAll();
    renderBrandManageSection();
    _populateDynamicSelects();
  } catch(err) {
    showToast('저장 실패: ' + err.message, 'error');
  }
}

async function deleteBrand(enumId, label) {
  const inUse = State.lineups.filter(l => l.brand === label).length;
  const warnMsg = inUse > 0 ? `\n⚠️ 이 브랜드를 사용 중인 플랫폼이 ${inUse}개 있습니다.` : '';
  confirmDelete(
    `브랜드 "${label}"을 삭제하시겠습니까?${warnMsg}`,
    async () => {
      try {
        await API.delete('enums', enumId);
        showToast('브랜드가 삭제되었습니다');
        await loadAll();
        renderBrandManageSection();
        _populateDynamicSelects();
      } catch(err) {
        showToast('삭제 실패: ' + err.message, 'error');
      }
    }
  );
}

function renderLineupBrandCards() {
  const container = document.getElementById('brand-cards-container');
  if (!container) return;

  // enums에서 lineup_brand 그룹을 읽어 브랜드 목록 동적 생성
  const brandEnums = State.enums
    .filter(e => e.group_key === 'lineup_brand')
    .sort((a, b) => (a.sort_order || 99) - (b.sort_order || 99));

  // enums에 브랜드가 없으면 현재 등록된 플랫폼의 브랜드를 fallback으로 사용
  const brands = brandEnums.length > 0
    ? brandEnums.map(e => e.value)
    : [...new Set(State.lineups.map(l => l.brand).filter(Boolean))];

  if (brands.length === 0) {
    container.innerHTML = '<div style="font-size:12px;color:#9ca3af;padding:8px 0">브랜드가 없습니다. 위 <strong>브랜드</strong> 섹션에서 브랜드를 추가하면 카드가 표시됩니다.</div>';
    return;
  }

  const BRAND_ICONS = ['🏢', '🏠', '🏗️', '🏛️', '🏬', '🏭'];

  container.innerHTML = brands.map((brand, idx) => {
    const color = getBrandColor(brand, idx);
    const icon = BRAND_ICONS[idx % BRAND_ICONS.length];
    const brandLineups = State.lineups.filter(l => l.brand === brand);
    const totalTypes = State.packages.length;

    const listHtml = brandLineups.map(l => {
      const selCount = State.lineupSetSelections.filter(s => s.lineup_id === l.id).length;
      return `
        <div class="tree-item" onclick="navigateToLineupDetail('${escHtml(l.id)}')">
          <span class="status-dot ${l.status}"></span>
          <div style="flex:1">
            <span style="font-weight:500;font-size:13px">${escHtml(l.name)}</span>
          </div>
          <span style="font-size:11px;color:#9ca3af">${selCount}/${totalTypes}</span>
        </div>`;
    }).join('') || '<div style="font-size:12px;color:#9ca3af;padding:8px 12px">등록된 플랫폼 없음</div>';

    return `
      <div class="card" style="border-left:4px solid ${escHtml(color)}">
        <div class="card-body" style="padding:16px 20px;background:${escHtml(color)}0d">
          <div style="font-size:12px;color:${escHtml(color)};font-weight:600;margin-bottom:6px;">${icon} ${escHtml(brand)}</div>
          ${listHtml}
        </div>
      </div>`;
  }).join('');
}

function renderLineupTable() {
  let data = [...State.lineups];
  if (lineupFilterText) {
    const q = lineupFilterText.toLowerCase();
    data = data.filter(l =>
      (l.name||'').toLowerCase().includes(q) ||
      (l.id||'').toLowerCase().includes(q) ||
      (l.description||'').toLowerCase().includes(q)
    );
  }
  if (lineupFilterBrand) data = data.filter(l => l.brand === lineupFilterBrand);

  const tbody = document.getElementById('lineups-tbody');
  if (data.length === 0) {
    tbody.innerHTML = State.lineups.length === 0
      ? `<tr><td colspan="6"><div class="empty-state-action">
          <div class="esa-icon">🏗️</div>
          <div class="esa-title">등록된 플랫폼이 없습니다</div>
          <div class="esa-desc">오른쪽 상단 <strong>+ 플랫폼 추가</strong> 버튼을 눌러 첫 번째 플랫폼을 등록하세요.</div>
          <button class="btn btn-primary" onclick="openLineupModal()"><i class="fas fa-plus"></i> 플랫폼 추가</button>
        </div></td></tr>`
      : `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">🔍</div><h3>검색 결과 없음</h3><p>검색어 또는 필터를 변경해보세요</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(l => {
    return `<tr class="lineup-row" data-id="${escHtml(l.id)}" onclick="navigateToLineupDetail('${escHtml(l.id)}')" style="cursor:pointer">
      <td class="drag-handle-cell" onclick="event.stopPropagation()">
        <span class="drag-handle" title="드래그하여 순서 변경"><i class="fas fa-grip-vertical"></i></span>
      </td>
      <td>${brandBadge(l.brand)}</td>
      <td style="font-weight:600">${escHtml(l.name)}</td>
      <td style="font-size:13px;color:#6b7280;max-width:300px">${escHtml(l.description||'-')}</td>
      <td>${statusBadge(l.status)}</td>
      <td onclick="event.stopPropagation()">
        <div style="display:flex;gap:4px">
          <button class="btn btn-sm btn-secondary" onclick="editLineup('${escHtml(l.id)}')">
            <i class="fas fa-edit"></i>
          </button>
          <button class="btn btn-sm btn-ghost" style="color:#e02424" onclick="deleteLineup('${escHtml(l.id)}','${escHtml(l.name)}')">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </td>
    </tr>`;
  }).join('');

  // 검색/필터 중에는 정렬 비활성화 (원래 순서를 바꾸면 혼란)
  if (!lineupFilterText && !lineupFilterBrand) {
    makeSortable(tbody, {
      itemSelector: 'tr[data-id]',
      handleSelector: '.drag-handle',
      getId: el => el.dataset.id,
      onReorder: async (orderedIds) => {
        await Promise.all(orderedIds.map((id, i) => {
          const item = State.lineups.find(l => l.id === id);
          if (!item) return Promise.resolve();
          return API.put('lineups', id, { ...item, sort_order: i + 1 });
        }));
        await loadAll();
        renderBrandManageSection();
      }
    });
  }
}

function filterLineups(val) { lineupFilterText = val; renderLineupTable(); }
function filterLineupsByBrand(val) { lineupFilterBrand = val; renderLineupTable(); }

function openLineupModal(data = null) {
  document.getElementById('lineup-modal-title').textContent = data ? '플랫폼 수정' : '플랫폼 추가';
  document.getElementById('lineup-id').value = data ? (data.id || '') : '';
  document.getElementById('lineup-code').value = data ? data.id : '';
  document.getElementById('lineup-name').value = data ? data.name : '';
  document.getElementById('lineup-brand').value = data ? (data.brand || '유닛빌드') : '유닛빌드';
  document.getElementById('lineup-desc').value = data ? (data.description || '') : '';
  document.getElementById('lineup-status').value = data ? (data.status || 'active') : 'active';
  openModal('lineup-modal');
}

async function saveLineup() {
  const rowId = document.getElementById('lineup-id').value;
  const payload = {
    id: document.getElementById('lineup-code').value.trim(),
    name: document.getElementById('lineup-name').value.trim(),
    brand: document.getElementById('lineup-brand').value,
    description: document.getElementById('lineup-desc').value.trim(),
    status: document.getElementById('lineup-status').value
  };

  if (!payload.id || !payload.name) {
    showToast('ID와 이름을 입력하세요', 'error'); return;
  }

  try {
    if (rowId) {
      const _beforeLineup = State.lineups.find(l => l.id === rowId);
      await API.put('lineups', rowId, payload);
      await logChange('lineup', payload.id, payload.name, 'update', _beforeLineup, payload);
      showToast('플랫폼이 수정되었습니다');
    } else {
      await API.post('lineups', payload);
      await logChange('lineup', payload.id, payload.name, 'create', null, payload);
      showToast('플랫폼이 추가되었습니다');
    }
    closeModal('lineup-modal');
    // 현재 상세 페이지에 있으면 상세 리렌더, 아니면 목록 리렌더
    if (State.currentPage === 'lineup-detail' && currentLineupId) {
      await renderLineupDetail(currentLineupId);
    } else {
      await renderLineups();
    }
  } catch(e) {
    showToast('저장 실패: ' + e.message, 'error');
  }
}

function editLineup(lineupId) {
  const item = State.lineups.find(l => l.id === lineupId);
  if (!item) return;
  openLineupModal(item);
}

function deleteLineup(lineupId, name) {
  const item = State.lineups.find(l => l.id === lineupId);
  if (!item) return;
  confirmDelete(`플랫폼 "${name}"을 삭제하시겠습니까?\n연결된 패키지와 스펙에 영향을 줄 수 있습니다.`, async () => {
    try {
      await API.delete('lineups', item.id);
      await logChange('lineup', lineupId, name, 'delete', item, null);
      showToast('플랫폼이 삭제되었습니다');
      renderLineups();
    } catch(e) { showToast('삭제 실패: ' + e.message, 'error'); }
  });
}

// ===================================================
// ===== 플랫폼 상세 페이지 =====
// ===================================================
let currentLineupId = null;

function navigateToLineupDetail(lineupId) {
  currentLineupId = lineupId;
  State.currentPage = 'lineup-detail';
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-lineup-detail').classList.add('active');
  document.querySelector('.nav-item[data-page="lineups"]').classList.add('active');
  document.getElementById('header-title').textContent = '플랫폼 상세';
  renderLineupDetail(lineupId);
}

async function renderLineupDetail(lineupId) {
  await loadAll();
  const lineup = State.lineups.find(l => l.id === lineupId);
  if (!lineup) { navigate('lineups'); return; }

  document.getElementById('detail-lineup-title').textContent = lineup.name;
  document.getElementById('detail-lineup-desc').textContent = lineup.description || '';

  // 플랫폼 정보 카드
  document.getElementById('detail-lineup-info').innerHTML = `
    <div class="lineup-detail-info-card">
      <div class="ldic-row">
        <div class="ldic-item">
          <div class="ldic-label">브랜드</div>
          <div class="ldic-value">${brandBadge(lineup.brand)}</div>
        </div>
        <div class="ldic-item">
          <div class="ldic-label">플랫폼 ID</div>
          <div class="ldic-value"><span class="font-mono">${escHtml(lineup.id)}</span></div>
        </div>
        <div class="ldic-item">
          <div class="ldic-label">상태</div>
          <div class="ldic-value">${statusBadge(lineup.status)}</div>
        </div>
      </div>
      ${lineup.description ? `
      <div class="ldic-desc">
        <div class="ldic-label" style="margin-bottom:4px">설명</div>
        <div style="font-size:13.5px;color:#374151;line-height:1.6">${escHtml(lineup.description)}</div>
      </div>` : ''}
    </div>
  `;

  // ── 카테고리별 선택 그리드 ──
  renderLineupSetTypeGrid(lineupId);
}

function renderLineupSetTypeGrid(lineupId) {
  const grid = document.getElementById('detail-settype-grid');

  if (State.packages.length === 0) {
    grid.innerHTML = `
      <div class="card" style="margin-top:20px">
        <div class="card-body">
          <div class="empty-state-action" style="padding:32px">
            <div class="esa-icon">🏷️</div>
            <div class="esa-title">패키지가 없습니다</div>
            <div class="esa-desc">먼저 <strong>패키지</strong>를 등록해야 플랫폼에 등급을 연결할 수 있습니다.</div>
            <button class="btn btn-primary" onclick="navigate('packages')">
              <i class="fas fa-tags"></i> 패키지 관리
            </button>
          </div>
        </div>
      </div>`;
    return;
  }

  // ── 패키지 카드 렌더 헬퍼 ──
  function _renderSetTypeCard(st) {
    const setsOfType  = State.grades.filter(s => s.package_id === st.id);
    const selection   = State.lineupSetSelections.find(
      sel => sel.lineup_id === lineupId && sel.package_id === st.id
    );
    const selectedSet = selection ? State.grades.find(s => s.id === selection.grade_id) : null;
    const selId       = selection?.id || '';

    const opts = setsOfType.map(s =>
      `<option value="${escHtml(s.id)}" ${selection?.grade_id === s.id ? 'selected' : ''}>
        ${escHtml(s.name)}${s.code ? ' [' + escHtml(s.code) + ']' : ''}
      </option>`
    ).join('');

    let slotPreview = '';
    if (selectedSet) {
      const items   = State.packageItems.filter(i => i.package_id === st.id)
                        .sort((a, b) => (a.sort_order||99) - (b.sort_order||99));
      const assigns = State.slotAssignments.filter(a => a.grade_id === selectedSet.id);

      if (items.length > 0) {
        const rows = items.map(item => {
          const chips = assigns.filter(a => a.item_id === item.id).map(a => {
            const sl = State.slots.find(s => s.id === a.slot_id);
            return sl ? `<span class="lds-slot-chip">${escHtml(sl.name)}</span>` : '';
          }).join('');
          return `
            <tr class="lds-row">
              <td class="lds-item-name">${escHtml(item.name)}</td>
              <td class="lds-slots">${chips || '<span class="lds-empty">—</span>'}</td>
            </tr>`;
        }).join('');
        slotPreview = `
          <div class="lds-preview">
            <table class="lds-table">
              <thead><tr>
                <th class="lds-th-item">항목</th>
                <th class="lds-th-slots">배치된 스펙</th>
              </tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>`;
      } else {
        const poolSlots = State.slots.filter(sl => sl.package_id === st.id);
        if (poolSlots.length > 0) {
          const chips = poolSlots.map(sl =>
            `<span class="lds-slot-chip">${escHtml(sl.name)}</span>`
          ).join('');
          slotPreview = `<div class="lds-preview"><div class="lds-pool">${chips}</div></div>`;
        }
      }
    }

    return `
      <div class="package-block">
        <div class="package-block-header">
          <div class="package-block-title">
            <i class="fas fa-tag" style="color:#6b7280;font-size:12px"></i>
            ${escHtml(st.name)}
          </div>
          <div class="package-block-actions">
            <button class="btn btn-xs btn-ghost" onclick="navigateToPackageDetail('${escHtml(st.id)}')" title="패키지 상세">
              <i class="fas fa-external-link-alt" style="font-size:10px"></i>
            </button>
          </div>
        </div>
        <div class="lds-select-row">
          <select class="lds-set-select ${selectedSet ? 'has-value' : ''}"
                  onchange="selectSetForLineup('${escHtml(lineupId)}','${escHtml(st.id)}',this.value,'${escHtml(selId)}')">
            <option value="">— 등급을 선택하세요 —</option>
            ${opts}
          </select>
          ${selectedSet
            ? `<button class="btn btn-xs btn-ghost lds-clear-btn" title="선택 해제"
                 onclick="clearSetSelection('${escHtml(selId)}','${escHtml(lineupId)}')">
                 <i class="fas fa-times"></i>
               </button>`
            : ''}
        </div>
        ${setsOfType.length === 0
          ? `<div class="lds-no-sets">등록된 등급 없음 <span class="link-btn" onclick="navigateToPackageDetail('${escHtml(st.id)}')">추가</span></div>`
          : ''}
        ${slotPreview}
      </div>`;
  }

  // ── 분류별 섹션 렌더 ──
  const cats = [...State.packageCategories].sort((a, b) => (a.sort_order||99) - (b.sort_order||99));

  // 분류에 속한 packages
  const sectionsHtml = cats.map(cat => {
    const typesInCat = State.packages.filter(st => st.category_id === cat.id)
                         .sort((a, b) => (a.sort_order||99) - (b.sort_order||99));
    if (typesInCat.length === 0) return '';

    // 이 분류에서 선택된 등급 수
    const selectedCount = typesInCat.filter(st =>
      State.lineupSetSelections.some(sel => sel.lineup_id === lineupId && sel.package_id === st.id)
    ).length;

    const cards = typesInCat.map(_renderSetTypeCard).join('');

    return `
      <div class="lds-section">
        <div class="lds-section-header">
          <span class="lds-section-title">${escHtml(cat.name)}</span>
          <span class="lds-section-badge ${selectedCount > 0 ? 'lds-section-badge--done' : ''}">
            ${selectedCount} / ${typesInCat.length} 선택
          </span>
        </div>
        <div class="package-grid">${cards}</div>
      </div>`;
  }).join('');

  // 분류 미지정 packages
  const uncatTypes = State.packages.filter(st =>
    !st.category_id || !State.packageCategories.find(c => c.id === st.category_id)
  ).sort((a, b) => (a.sort_order||99) - (b.sort_order||99));

  const uncatHtml = uncatTypes.length > 0 ? `
    <div class="lds-section">
      <div class="lds-section-header">
        <span class="lds-section-title" style="color:var(--gray-400)">
          <i class="fas fa-folder-open" style="margin-right:6px"></i>미분류
        </span>
        <span class="lds-section-badge">${uncatTypes.filter(st =>
          State.lineupSetSelections.some(sel => sel.lineup_id === lineupId && sel.package_id === st.id)
        ).length} / ${uncatTypes.length} 선택</span>
      </div>
      <div class="package-grid">${uncatTypes.map(_renderSetTypeCard).join('')}</div>
    </div>` : '';

  grid.innerHTML = `
    <div class="lds-wrap">
      <div class="lds-header">
        <div class="lds-header-title">
          <i class="fas fa-cubes" style="color:#1a56db;margin-right:6px"></i>분류별 패키지 선택
        </div>
        <div class="lds-header-desc">각 등급에서 이 플랫폼에 적용할 등급을 선택하세요</div>
      </div>
      ${sectionsHtml}${uncatHtml}
    </div>`;
}

async function selectSetForLineup(lineupId, setTypeId, setId, existingSelId) {
  if (!setId) {
    // 빈 값 선택 → 해제
    if (existingSelId) {
      try {
        await API.delete('lineup_set_selections', existingSelId);
        await loadAll();
        renderLineupSetTypeGrid(lineupId);
        showToast('패키지 선택이 해제되었습니다');
      } catch(e) { showToast('실패: ' + e.message, 'error'); }
    }
    return;
  }
  try {
    const existing = State.lineupSetSelections.find(
      sel => sel.lineup_id === lineupId && sel.package_id === setTypeId
    );
    if (existing) {
      await API.put('lineup_set_selections', existing.id, { lineup_id: lineupId, package_id: setTypeId, grade_id: setId });
    } else {
      await API.post('lineup_set_selections', { lineup_id: lineupId, package_id: setTypeId, grade_id: setId });
    }
    await loadAll();
    renderLineupSetTypeGrid(lineupId);
    showToast('패키지가 선택되었습니다');
  } catch(e) { showToast('저장 실패: ' + e.message, 'error'); }
}

async function clearSetSelection(selId, lineupId) {
  try {
    await API.delete('lineup_set_selections', selId);
    await loadAll();
    renderLineupSetTypeGrid(lineupId);
    showToast('패키지 선택이 해제되었습니다');
  } catch(e) { showToast('실패: ' + e.message, 'error'); }
}

function editCurrentLineup() {
  const lineup = State.lineups.find(l => l.id === currentLineupId);
  if (lineup) openLineupModal(lineup);
}

// ===================================================
// ===== 카테고리 관리 (분류 → 카테고리 → 패키지 3단 계층)
// ===================================================
let stgFilterText = '';

function filterPackageGroups(val) {
  stgFilterText = val;
  renderPackageGroups();
}

async function renderPackages() {
  await loadAll();
  renderPackageGroups();
}

function renderPackageGroups() {
  const container = document.getElementById('stg-container');
  if (!container) return;
  const q = stgFilterText.toLowerCase();

  // 검색어 기준: 카테고리명·패키지명·패키지코드 매칭
  const matchedStIds = new Set();
  if (q) {
    State.packages.forEach(st => {
      if ((st.name||'').toLowerCase().includes(q)) matchedStIds.add(st.id);
    });
    State.grades.forEach(s => {
      if ((s.name||'').toLowerCase().includes(q) || (s.code||'').toLowerCase().includes(q))
        matchedStIds.add(s.package_id);
    });
  }

  // 완전히 빈 상태
  if (State.packages.length === 0 && State.packageCategories.length === 0) {
    container.innerHTML = `
      <div class="empty-state-action" style="margin-top:24px">
        <div class="esa-icon">🏷️</div>
        <div class="esa-title">패키지가 없습니다</div>
        <div class="esa-desc">먼저 <strong>분류 추가</strong>로 분류를 만들고 <strong>패키지 추가</strong>로 패키지를 등록하세요.<br>예) 분류 "마감" → 패키지 "거실마감", "화장실마감"</div>
        <div style="display:flex;gap:8px;justify-content:center;margin-top:12px">
          <button class="btn btn-secondary" onclick="openCategoryModal()"><i class="fas fa-folder-plus"></i> 분류 추가</button>
          <button class="btn btn-primary" onclick="openPackageModal()"><i class="fas fa-plus"></i> 패키지 추가</button>
        </div>
      </div>`;
    return;
  }

  if (q && matchedStIds.size === 0) {
    container.innerHTML = `<div class="empty-state" style="margin-top:24px"><div class="empty-icon">🔍</div><h3>검색 결과 없음</h3><p>다른 검색어를 입력해보세요</p></div>`;
    return;
  }

  // 분류별 그룹 구성
  const sortedCats = [...State.packageCategories].sort((a,b) => (a.sort_order||99)-(b.sort_order||99));
  const groups = sortedCats.map(cat => ({
    cat,
    setTypes: State.packages.filter(st =>
      st.category_id === cat.id && (!q || matchedStIds.has(st.id)))
  }));

  // 미분류
  const uncategorized = State.packages.filter(st =>
    (!st.category_id || !State.packageCategories.find(c => c.id === st.category_id)) &&
    (!q || matchedStIds.has(st.id))
  );
  if (uncategorized.length > 0 || State.packageCategories.length === 0)
    groups.push({ cat: null, setTypes: uncategorized });

  container.innerHTML = groups
    .filter(g => g.setTypes.length > 0 || !q)  // 검색 중엔 결과 있는 그룹만
    .map(({ cat, setTypes }) => {
      const catId   = cat ? escHtml(cat.id) : '';
      const catName = cat ? escHtml(cat.name) : '미분류';
      const totalSets = setTypes.reduce((acc, st) =>
        acc + State.grades.filter(s => s.package_id === st.id).length, 0);

      const stBlocks = setTypes.length === 0
        ? `<div class="stg-empty-hint">이 분류에 패키지가 없습니다.
             <button class="btn btn-xs btn-secondary" style="margin-left:8px"
               onclick="openPackageModalForCat('${catId}')">
               <i class="fas fa-plus"></i> 패키지 추가
             </button>
           </div>`
        : setTypes.map(st => _renderPackageBlock(st, q)).join('');

      const isUncategorized = !cat;
      return `
        <div class="stg-cat-group${isUncategorized ? ' stg-cat-group--uncategorized' : ''}" ${cat ? `data-cat-id="${catId}"` : ''}>
          <div class="stg-cat-header${isUncategorized ? ' stg-cat-header--uncategorized' : ''}">
            <div class="stg-cat-title-wrap">
              ${cat ? `<span class="drag-handle stg-cat-drag-handle" title="드래그하여 분류 순서 변경"><i class="fas fa-grip-vertical"></i></span>` : ''}
              <span class="stg-cat-bullet"></span>
              <span class="stg-cat-name">${catName}</span>
            </div>
            <div class="stg-cat-actions">
              ${cat ? `
                <button class="btn btn-xs btn-secondary" onclick="editCategory('${catId}')" title="분류 이름 수정">
                  <i class="fas fa-pen"></i>
                </button>
                <button class="btn btn-xs btn-ghost" style="color:#e02424" onclick="deleteCategory('${catId}','${catName}')" title="분류 삭제">
                  <i class="fas fa-trash"></i>
                </button>` : ''}
              <button class="btn btn-xs btn-primary" onclick="openPackageModalForCat('${catId}')">
                <i class="fas fa-plus"></i> 패키지 추가
              </button>
            </div>
          </div>
          <div class="stg-card-grid" data-cat-id="${catId}">${stBlocks}</div>
        </div>`;
    }).join('');

  // ① 각 분류(stg-card-grid)마다 카테고리 카드 정렬 DnD 활성화
  if (!q) {
    container.querySelectorAll('.stg-card-grid').forEach(list => {
      if (list.querySelectorAll('.stg-card[data-id]').length < 2) return;
      makeSortable(list, {
        itemSelector: '.stg-card[data-id]',
        handleSelector: '.drag-handle',
        getId: el => el.dataset.id,
        onReorder: async (orderedIds) => {
          await Promise.all(orderedIds.map((id, i) => {
            const item = State.packages.find(st => st.id === id);
            if (!item) return Promise.resolve();
            return API.put('packages', id, { ...item, sort_order: i + 1 });
          }));
          await loadAll();
        }
      });
    });

    // ② 분류(stg-cat-group) 자체 순서 DnD — 미분류(.stg-cat-group--uncategorized) 제외
    const catGroups = [...container.querySelectorAll('.stg-cat-group[data-cat-id]')];
    if (catGroups.length >= 2) {
      makeSortable(container, {
        itemSelector: '.stg-cat-group[data-cat-id]',
        handleSelector: '.stg-cat-drag-handle',
        getId: el => el.dataset.catId,
        onReorder: async (orderedIds) => {
          await Promise.all(orderedIds.map((id, i) => {
            const item = State.packageCategories.find(c => c.id === id);
            if (!item) return Promise.resolve();
            return API.put('package_categories', id, { ...item, sort_order: i + 1 });
          }));
          await loadAll();
        }
      });
    }

    // ③ 미분류 → 분류 크로스 그리드 DnD
    _setupCrossGridDrop(container);
  }
}

// ── 미분류 카드 → 분류 그룹 드래그 배정 ──
function _setupCrossGridDrop(container) {
  // 미분류 그룹의 카드들에 draggable 속성 및 dragstart 이벤트 등록
  const uncatGrid = container.querySelector('.stg-cat-group--uncategorized .stg-card-grid');
  if (!uncatGrid) return;

  const uncatCards = uncatGrid.querySelectorAll('.stg-card[data-id]');
  if (uncatCards.length === 0) return;

  // 드래그 중인 카드 ID를 저장할 변수
  let draggingStId = null;

  uncatCards.forEach(card => {
    card.setAttribute('draggable', 'true');
    card.classList.add('stg-card--cross-draggable');

    card.addEventListener('dragstart', e => {
      draggingStId = card.dataset.id;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', draggingStId);
      // 약간의 딜레이로 드래그 시작 시 스타일 적용
      setTimeout(() => card.classList.add('stg-card--dragging'), 0);
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('stg-card--dragging');
      draggingStId = null;
      // 모든 드롭 하이라이트 제거
      container.querySelectorAll('.stg-card-grid--drop-over').forEach(el => {
        el.classList.remove('stg-card-grid--drop-over');
      });
      container.querySelectorAll('.stg-card-grid--drop-ready').forEach(el => {
        el.classList.remove('stg-card-grid--drop-ready');
      });
    });
  });

  // 분류 그룹의 card-grid에 dragover/dragleave/drop 등록
  const catGrids = container.querySelectorAll('.stg-cat-group[data-cat-id] .stg-card-grid');
  catGrids.forEach(grid => {
    // 드롭 가능 영역 시각화
    grid.addEventListener('dragenter', e => {
      if (!draggingStId) return;
      e.preventDefault();
      grid.classList.add('stg-card-grid--drop-over');
    });

    grid.addEventListener('dragover', e => {
      if (!draggingStId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      grid.classList.add('stg-card-grid--drop-over');
    });

    grid.addEventListener('dragleave', e => {
      // grid 내부 자식 요소로 이동한 경우는 무시
      if (grid.contains(e.relatedTarget)) return;
      grid.classList.remove('stg-card-grid--drop-over');
    });

    grid.addEventListener('drop', async e => {
      e.preventDefault();
      grid.classList.remove('stg-card-grid--drop-over');

      const stId = e.dataTransfer.getData('text/plain') || draggingStId;
      if (!stId) return;

      const targetCatId = grid.closest('.stg-cat-group').dataset.catId;
      if (!targetCatId) return;

      const st = State.packages.find(s => s.id === stId);
      if (!st) return;

      // 이미 같은 분류면 무시
      if (st.category_id === targetCatId) return;

      try {
        // 저장 중 시각 피드백
        grid.classList.add('stg-card-grid--drop-saving');
        await API.put('packages', stId, { ...st, category_id: targetCatId });
        await loadAll();
        renderPackageGroups();
      } catch (err) {
        console.error('카테고리 배정 실패:', err);
        grid.classList.remove('stg-card-grid--drop-saving');
        alert('분류 배정에 실패했습니다. 다시 시도해 주세요.');
      }
    });
  });

  // 분류 그룹 헤더에도 dragover/drop 등록 (헤더에 드롭해도 해당 분류로 배정)
  const catHeaders = container.querySelectorAll('.stg-cat-group[data-cat-id] .stg-cat-header');
  catHeaders.forEach(header => {
    header.addEventListener('dragenter', e => {
      if (!draggingStId) return;
      e.preventDefault();
      const grid = header.closest('.stg-cat-group').querySelector('.stg-card-grid');
      if (grid) grid.classList.add('stg-card-grid--drop-over');
    });

    header.addEventListener('dragover', e => {
      if (!draggingStId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });

    header.addEventListener('dragleave', e => {
      if (header.contains(e.relatedTarget)) return;
      const grid = header.closest('.stg-cat-group').querySelector('.stg-card-grid');
      if (grid) grid.classList.remove('stg-card-grid--drop-over');
    });

    header.addEventListener('drop', async e => {
      e.preventDefault();
      const stId = e.dataTransfer.getData('text/plain') || draggingStId;
      if (!stId) return;

      const targetCatId = header.closest('.stg-cat-group').dataset.catId;
      if (!targetCatId) return;

      const st = State.packages.find(s => s.id === stId);
      if (!st || st.category_id === targetCatId) return;

      const grid = header.closest('.stg-cat-group').querySelector('.stg-card-grid');
      if (grid) grid.classList.remove('stg-card-grid--drop-over');

      try {
        await API.put('packages', stId, { ...st, category_id: targetCatId });
        await loadAll();
        renderPackageGroups();
      } catch (err) {
        console.error('카테고리 배정 실패:', err);
        alert('분류 배정에 실패했습니다. 다시 시도해 주세요.');
      }
    });
  });
}

// ── 패키지 카드 렌더 ──
function _renderPackageBlock(st, q) {
  const allSets = State.grades.filter(s => s.package_id === st.id);
  const sets = q
    ? allSets.filter(s =>
        (s.name||'').toLowerCase().includes(q) ||
        (s.code||'').toLowerCase().includes(q) ||
        (st.name||'').toLowerCase().includes(q))
    : allSets;
  const items = State.packageItems.filter(i => i.package_id === st.id)
                  .sort((a,b) => (a.sort_order||99)-(b.sort_order||99));

  // 등급 목록
  const pkgHtml = sets.length === 0
    ? `<div class="stg-card-pkg-empty">등급 없음</div>`
    : sets.map(s => `
        <div class="stg-card-pkg-row${s.status==='inactive'?' stg-set-inactive':''}">
          <span class="stg-set-dot"></span>
          <span class="stg-card-pkg-name" onclick="event.stopPropagation();openGradePreview('${escHtml(s.id)}')">${escHtml(s.name)}</span>
          ${statusBadge(s.status)}
          <div class="stg-set-actions">
            <button class="btn btn-xs btn-secondary" onclick="event.stopPropagation();editGrade('${escHtml(s.id)}')" title="수정"><i class="fas fa-edit"></i></button>
            <button class="btn btn-xs btn-ghost" style="color:#e02424" onclick="event.stopPropagation();deleteGrade('${escHtml(s.id)}','${escHtml(s.name)}')" title="삭제"><i class="fas fa-trash"></i></button>
          </div>
        </div>`).join('');

  // 항목 목록 (토글 패널)
  const itemsHtml = items.length === 0
    ? `<div class="stg-card-items-empty"><i class="fas fa-info-circle"></i> 등록된 항목 없음</div>`
    : items.map(i => `<div class="stg-card-item-row"><i class="fas fa-minus" style="font-size:8px;color:#9ca3af"></i> ${escHtml(i.name)}</div>`).join('');

  return `
    <div class="stg-card" data-id="${escHtml(st.id)}">
      <!-- 카드 헤더 -->
      <div class="stg-card-header" onclick="navigateToPackageDetail('${escHtml(st.id)}')">
        <div class="stg-card-title-row">
          <span class="drag-handle stg-card-drag" onclick="event.stopPropagation()" title="드래그하여 순서 변경"><i class="fas fa-grip-vertical"></i></span>
          <span class="stg-st-icon"><i class="fas fa-tag"></i></span>
          <span class="stg-card-name">${escHtml(st.name)}</span>
          <button class="stg-card-items-btn" title="항목 목록 보기"
            onclick="event.stopPropagation();toggleCardItems('${escHtml(st.id)}')">
            <i class="fas fa-list-ul"></i>
          </button>
        </div>
        ${st.description ? `<div class="stg-card-desc">${escHtml(st.description)}</div>` : ''}
      </div>
      <!-- 항목 토글 패널 -->
      <div class="stg-card-items-panel" id="stg-items-${escHtml(st.id)}" style="display:none">
        <div class="stg-card-items-label"><i class="fas fa-list"></i> 항목 (${items.length})</div>
        ${itemsHtml}
      </div>
      <!-- 등급 목록 -->
      <div class="stg-card-pkg-list">${pkgHtml}</div>
      <!-- 카드 푸터 -->
      <div class="stg-card-footer" onclick="event.stopPropagation()">
        <button class="btn btn-xs btn-secondary" onclick="openGradeModalForPackage('${escHtml(st.id)}')" title="등급 추가">
          <i class="fas fa-plus"></i> 등급
        </button>
        <div style="margin-left:auto;display:flex;gap:4px">
          <button class="btn btn-xs btn-secondary" onclick="editPackage('${escHtml(st.id)}')" title="패키지 수정"><i class="fas fa-pen"></i></button>
          <button class="btn btn-xs btn-ghost" style="color:#e02424" onclick="deletePackage('${escHtml(st.id)}','${escHtml(st.name)}')" title="삭제"><i class="fas fa-trash"></i></button>
        </div>
      </div>
    </div>`;
}

// 항목 토글
function toggleCardItems(stId) {
  const panel = document.getElementById(`stg-items-${stId}`);
  if (!panel) return;
  const isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : 'block';
  // 버튼 하이라이트
  const btn = panel.closest('.stg-card')?.querySelector('.stg-card-items-btn');
  if (btn) btn.classList.toggle('active', !isOpen);
}

// ── 등급 미리보기 팝업 ──
function openGradePreview(setId) {
  const set     = State.grades.find(s => s.id === setId);
  if (!set) return;
  const st      = State.packages.find(t => t.id === set.package_id);
  const items   = State.packageItems
                    .filter(i => i.package_id === set.package_id)
                    .sort((a, b) => (a.sort_order||99) - (b.sort_order||99));

  // 모달 타이틀
  document.getElementById('pkg-preview-title').textContent = set.name;
  document.getElementById('pkg-preview-sub').textContent   = st ? st.name : '';

  // 테이블 렌더링 — 행: 항목, 열: 스펙명 + 연결 자재
  const tbody = document.getElementById('pkg-preview-tbody');

  if (items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;padding:24px;color:#9ca3af">
      <i class="fas fa-info-circle" style="margin-right:6px"></i>등록된 항목이 없습니다</td></tr>`;
    openModal('pkg-preview-modal');
    return;
  }

  tbody.innerHTML = items.map(item => {
    // 이 등급+항목 교차점에 배치된 스펙 찾기
    const assigns = State.slotAssignments.filter(
      a => a.grade_id === setId && a.item_id === item.id
    );

    if (assigns.length === 0) {
      return `<tr>
        <td class="pkg-preview-item">${escHtml(item.name)}</td>
        <td class="pkg-preview-slot" style="color:#9ca3af">—</td>
        <td class="pkg-preview-mat"  style="color:#9ca3af">—</td>
      </tr>`;
    }

    return assigns.map((a, idx) => {
      const slot   = State.slots.find(sl => sl.id === a.slot_id);
      // slot_id로 직접 조회 (slot 객체 유무와 무관하게)
      const sm     = State.slotMaterials.find(sm => sm.slot_id === a.slot_id);
      const mat    = sm ? State.materials.find(m => m.id === sm.material_id) : null;
      const isDisc = mat?.status === 'inactive' || mat?.status === 'discontinued';

      return `<tr>
        ${idx === 0
          ? `<td class="pkg-preview-item" rowspan="${assigns.length}">${escHtml(item.name)}</td>`
          : ''}
        <td class="pkg-preview-slot">
          ${slot
            ? `<span>${escHtml(slot.name)}</span>${slot.code ? `<span class="pkg-preview-code">${escHtml(slot.code)}</span>` : ''}`
            : `<span style="color:#9ca3af;font-size:12px">—</span>`}
        </td>
        <td class="pkg-preview-mat">
          ${mat
            ? `${isDisc ? '<span class="pkg-preview-disc-icon">&#x26D4;&nbsp;</span>' : ''}<span class="${isDisc ? 'pkg-preview-disc' : 'pkg-preview-mat-name'}">${escHtml(mat.name)}</span>${mat.supplier ? `<span class="pkg-preview-sup">${escHtml(mat.supplier)}</span>` : ''}`
            : `<span class="pkg-preview-unlinked"><i class="fas fa-unlink"></i>&nbsp;미연결</span>`}
        </td>
      </tr>`;
    }).join('');
  }).join('');

  openModal('pkg-preview-modal');
}

// 특정 분류로 패키지 추가 모달 열기
function openPackageModalForCat(catId) {
  openPackageModal();
  if (catId) setTimeout(() => {
    const sel = document.getElementById('package-category');
    if (sel) sel.value = catId;
  }, 50);
}

// ===================================================
// ===== 패키지 상세 페이지 =====
// ===================================================
let currentPackageId = null;

function navigateToPackageDetail(stId) {
  currentPackageId = stId;
  State.currentPage = 'package-detail';
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-package-detail').classList.add('active');
  document.querySelector('.nav-item[data-page="packages"]').classList.add('active');
  document.getElementById('header-title').textContent = '패키지 상세';
  renderPackageDetail(stId);
}

// ── 패키지 상세 메인 렌더 ──
async function renderPackageDetail(stId) {
  await loadAll();
  const st = State.packages.find(t => t.id === stId);
  if (!st) { navigate('packages'); return; }

  // 헤더 타이틀
  document.getElementById('std-page-title').textContent = `🏷️ ${st.name}`;

  // 요약 바
  const sets = State.grades.filter(s => s.package_id === stId);
  _renderSummaryBar(st, sets);

  renderDetailMatrix(stId);
  renderSlotPool(stId);
}

// ── 매트릭스 테이블 렌더 ──
function renderDetailMatrix(stId) {
  const sets  = State.grades.filter(s => s.package_id === stId);
  const items = State.packageItems.filter(i => i.package_id === stId)
                  .sort((a, b) => (a.sort_order||99) - (b.sort_order||99));
  const container = document.getElementById('std-matrix-container');

  // 안내 힌트 (빈 상태)
  const emptySetHint  = sets.length  === 0 ? `<div class="matrix-guide-chip warn"><i class="fas fa-plus-circle"></i> 패키지 추가 (열)</div>` : '';
  const emptyItemHint = items.length === 0 ? `<div class="matrix-guide-chip warn"><i class="fas fa-plus-circle"></i> 항목 추가 (행)</div>` : '';

  // 헤더: 항목＼패키지 코너 + 패키지 열 헤더
  const emptySetCols = sets.length === 0
    ? `<th class="matrix-header-cell matrix-header-empty">
         <div style="font-size:11px;color:#9ca3af;font-style:italic">패키지를 추가하세요</div>
       </th>`
    : sets.map(s => `
        <th class="matrix-header-cell" data-set-id="${escHtml(s.id)}">
          <div class="matrix-header-name">${escHtml(s.name)}</div>
          ${s.code ? `<div class="matrix-header-code">${escHtml(s.code)}</div>` : ''}
          <div class="matrix-header-actions">
            <button class="matrix-header-btn" onclick="editGradeInDetail('${escHtml(s.id)}')" title="등급 수정"><i class="fas fa-edit"></i></button>
            <button class="matrix-header-btn danger" onclick="deleteGradeInDetail('${escHtml(s.id)}','${escHtml(s.name)}')" title="등급 삭제"><i class="fas fa-trash"></i></button>
          </div>
        </th>`).join('');

  // 바디 행: 항목이 없으면 안내 행
  let bodyRows = '';
  if (items.length === 0) {
    const colSpan = sets.length + 1;
    bodyRows = `<tr><td colspan="${colSpan}" class="matrix-empty-row">
      <i class="fas fa-info-circle" style="color:#9ca3af;margin-right:6px"></i>
      항목을 추가하면 행이 생성됩니다
    </td></tr>`;
  } else {
    bodyRows = items.map(item => {
      const cells = sets.length === 0
        ? `<td class="matrix-cell matrix-cell-disabled"></td>`
        : sets.map(set => {
            const cellAssigns = State.slotAssignments.filter(
              a => a.item_id === item.id && a.grade_id === set.id
            );
            const chips = cellAssigns.map(a => {
              const sl = State.slots.find(s => s.id === a.slot_id);
              return sl
                ? `<div class="matrix-slot-chip"
                        draggable="false"
                        title="${escHtml(sl.name)}"
                        data-assignment-id="${escHtml(a.id)}">
                     <span class="matrix-chip-label">${escHtml(sl.name)}</span>
                     <span class="matrix-chip-del" onclick="event.stopPropagation();quickRemoveChip('${escHtml(a.id)}')" title="제거">×</span>
                   </div>`
                : '';
            }).join('');
            return `
              <td class="matrix-cell"
                  data-item-id="${escHtml(item.id)}"
                  data-set-id="${escHtml(set.id)}"
                  onclick="openCellModal('${escHtml(item.id)}','${escHtml(set.id)}')"
                  ondragover="event.preventDefault();this.classList.add('drag-over')"
                  ondragleave="this.classList.remove('drag-over')"
                  ondrop="handleCellDrop(event,'${escHtml(item.id)}','${escHtml(set.id)}')">
                <div class="matrix-cell-inner">
                  ${chips || '<span class="matrix-cell-empty">—</span>'}
                  <button class="matrix-cell-add-btn" title="스펙 배치"><i class="fas fa-plus"></i></button>
                </div>
              </td>`;
          }).join('');

      return `
        <tr data-id="${escHtml(item.id)}">
          <td class="matrix-row-header">
            <div class="matrix-row-header-inner">
              <span class="drag-handle" title="드래그하여 순서 변경" onclick="event.stopPropagation()"><i class="fas fa-grip-vertical"></i></span>
              <span class="matrix-row-name">${escHtml(item.name)}</span>
              <div class="matrix-row-actions">
                <button class="matrix-header-btn" onclick="editItem('${escHtml(item.id)}')" title="항목 수정"><i class="fas fa-edit"></i></button>
                <button class="matrix-header-btn danger" onclick="deleteItem('${escHtml(item.id)}','${escHtml(item.name)}')" title="항목 삭제"><i class="fas fa-trash"></i></button>
              </div>
            </div>
          </td>
          ${cells}
        </tr>`;
    }).join('');
  }

  // 상태 안내 힌트바 (둘 다 비었을 때만)
  const hintBar = (sets.length === 0 || items.length === 0)
    ? `<div class="matrix-hint-bar">${emptySetHint}${emptyItemHint}
         ${sets.length===0&&items.length===0 ? '<span class="matrix-guide-tip">패키지(열)와 항목(행)을 추가한 후, 셀을 클릭하거나 스펙을 드래그해서 배치하세요</span>' : ''}
       </div>`
    : '';

  container.innerHTML = `
    ${hintBar}
    <table class="std-matrix-table">
      <thead>
        <tr>
          <th class="matrix-corner-cell"><span>항목 ＼ 패키지</span></th>
          ${emptySetCols}
        </tr>
      </thead>
      <tbody id="matrix-tbody-${escHtml(stId)}">${bodyRows}</tbody>
    </table>
    <button class="btn btn-secondary matrix-add-item-btn" onclick="openItemModal()">
      <i class="fas fa-plus"></i> 항목 추가
    </button>`;

  // 항목 행 DnD 활성화
  if (items.length >= 2) {
    const tbody = container.querySelector('tbody');
    makeSortable(tbody, {
      itemSelector: 'tr[data-id]',
      handleSelector: '.drag-handle',
      getId: el => el.dataset.id,
      onReorder: async (orderedIds) => {
        await Promise.all(orderedIds.map((id, i) => {
          const item = State.packageItems.find(it => it.id === id);
          if (!item) return Promise.resolve();
          return API.put('package_items', id, { ...item, sort_order: i + 1 });
        }));
        await loadAll();
      }
    });
  }
}

// ── 셀에서 칩 빠른 제거 (×버튼) ──
async function quickRemoveChip(assignmentId) {
  try {
    await API.delete('slot_assignments', assignmentId);
    await loadAll();
    renderDetailMatrix(currentPackageId);
    renderSlotPool(currentPackageId);
    updateSummaryBar(currentPackageId);
  } catch(e) { showToast('제거 실패: ' + e.message, 'error'); }
}

// ── 드래그앤드롭: 스펙 풀 → 매트릭스 셀 ──
async function handleCellDrop(event, itemId, setId) {
  event.preventDefault();
  event.currentTarget.classList.remove('drag-over');
  // 정렬용 드래그(핸들)가 셀에 떨어진 경우 무시
  if (event.dataTransfer.getData('slot-pool-sort')) return;
  const slotId = event.dataTransfer.getData('text/plain');
  if (!slotId) return;

  const already = State.slotAssignments.find(
    a => a.item_id === itemId && a.grade_id === setId && a.slot_id === slotId
  );
  if (already) { showToast('이미 배치된 스펙입니다', 'error'); return; }

  try {
    await API.post('slot_assignments', {
      package_id: currentPackageId,
      item_id: itemId,
      grade_id: setId,
      slot_id: slotId
    });
    showToast('스펙이 배치되었습니다');
    await loadAll();
    renderDetailMatrix(currentPackageId);
    renderSlotPool(currentPackageId);
    updateSummaryBar(currentPackageId);
  } catch(e) { showToast('배치 실패: ' + e.message, 'error'); }
}

// ── 요약 바만 갱신 ──
function updateSummaryBar(stId) {
  const st   = State.packages.find(t => t.id === stId);
  if (!st) return;
  const sets = State.grades.filter(s => s.package_id === stId);
  _renderSummaryBar(st, sets);
}

// ── 요약 바 공통 렌더 ──
function _renderSummaryBar(st, sets) {
  const pkgList = sets.length > 0
    ? sets.map(s =>
        `<div class="stdb-pkg-item${s.status==='inactive'?' stdb-pkg-inactive':''}">
           <span class="stdb-pkg-dot"></span>
           <span class="stdb-pkg-name">${escHtml(s.name)}</span>
           ${s.description ? `<span class="stdb-pkg-desc">${escHtml(s.description)}</span>` : ''}
         </div>`
      ).join('')
    : `<span class="stdb-pkg-empty">패키지 없음</span>`;

  document.getElementById('std-summary-bar').innerHTML = `
    <div class="stdb-pkg-section">
      <div class="stdb-section-label"><i class="fas fa-layer-group"></i> 패키지</div>
      <div class="stdb-pkg-list">${pkgList}</div>
    </div>
    <div class="stdb-divider"></div>
    <div class="stdb-memo-section">
      <div class="stdb-section-label"><i class="fas fa-sticky-note"></i> 메모</div>
      <div class="stdb-memo-wrap" id="stdb-memo-wrap">
        <div class="stdb-memo-display" id="stdb-memo-display"
             onclick="_startMemoEdit('${escHtml(st.id)}')">
          ${st.description
            ? `<span class="stdb-memo-text">${escHtml(st.description)}</span>`
            : `<span class="stdb-memo-placeholder">클릭하여 메모 추가...</span>`}
        </div>
      </div>
    </div>`;
}

function _startMemoEdit(stId) {
  const st = State.packages.find(t => t.id === stId);
  if (!st) return;
  const wrap = document.getElementById('stdb-memo-wrap');
  if (!wrap || wrap.querySelector('textarea')) return; // 이미 편집 중

  wrap.innerHTML = `
    <textarea class="stdb-memo-textarea" id="stdb-memo-input"
      placeholder="카테고리에 대한 메모를 자유롭게 작성하세요...">${escHtml(st.description||'')}</textarea>
    <div class="stdb-memo-actions">
      <button class="btn btn-xs btn-primary" onclick="_saveMemo('${escHtml(stId)}')">저장</button>
      <button class="btn btn-xs btn-secondary" onclick="_cancelMemoEdit('${escHtml(stId)}')">취소</button>
    </div>`;
  const ta = document.getElementById('stdb-memo-input');
  if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
}

async function _saveMemo(stId) {
  const st  = State.packages.find(t => t.id === stId);
  if (!st) return;
  const val = (document.getElementById('stdb-memo-input')?.value || '').trim();
  try {
    await API.put('packages', stId, { ...st, description: val });
    await loadAll();
    updateSummaryBar(stId);
    showToast('메모가 저장되었습니다');
  } catch(e) { showToast('저장 실패: ' + e.message, 'error'); }
}

function _cancelMemoEdit(stId) {
  updateSummaryBar(stId);
}

// ── 스펙 풀 패널 렌더 ──
let slotPoolFilter = '';

function filterSlotPool(val) {
  slotPoolFilter = val;
  renderSlotPool(currentPackageId);
}

function renderSlotPool(stId) {
  let slots = State.slots
    .filter(sl => sl.package_id === stId)
    .sort((a, b) => (a.name||'').localeCompare(b.name||'', 'ko'));
  const totalCount = slots.length;
  if (slotPoolFilter) {
    const q = slotPoolFilter.toLowerCase();
    slots = slots.filter(sl =>
      (sl.name||'').toLowerCase().includes(q) ||
      (sl.code||'').toLowerCase().includes(q)
    );
  }
  const container = document.getElementById('std-slot-pool');
  const countEl   = document.getElementById('std-slot-pool-count');
  if (countEl) countEl.textContent = totalCount;

  if (slots.length === 0) {
    container.innerHTML = totalCount === 0
      ? `<div class="slot-pool-empty">
           <i class="fas fa-puzzle-piece"></i>
           <div>Slot이 없습니다<br><span style="font-size:11px;color:#9ca3af">위 <strong>추가</strong> 버튼으로 생성하세요</span></div>
         </div>`
      : `<div class="slot-pool-empty"><i class="fas fa-search"></i><div>검색 결과 없음</div></div>`;
    return;
  }

  container.innerHTML = slots.map(sl => {
    const linkedMats  = State.slotMaterials.filter(sm => sm.slot_id === sl.id);
    const defaultMat  = linkedMats.find(sm => sm.is_default === true || sm.is_default === 'true');
    const matName     = defaultMat
      ? (State.materials.find(m => m.id === defaultMat.material_id)?.name || '?')
      : null;
    const assignCount = State.slotAssignments.filter(a => a.slot_id === sl.id && a.package_id === stId).length;

    // 속성값 파싱 & 표시용 태그 생성
    const { attrs } = parseSlotDesc(sl.description);
    const attrDefs   = getAttrDefs(sl.slot_type);
    const attrChips  = attrDefs
      .filter(def => attrs[def.value])
      .map(def => {
        const { unit: _u } = _parseAttrUnit(def.color);
        const unitSuffix = _u ? ` ${_u}` : '';
        return `<span class="slot-pool-attr-chip" title="${escHtml(def.label||def.value)}">${escHtml(def.label||def.value)}: <strong>${escHtml(attrs[def.value])}${escHtml(unitSuffix)}</strong></span>`;
      }).join('');

    return `
      <div class="slot-pool-item"
           data-id="${escHtml(sl.id)}"
           data-slot-id="${escHtml(sl.id)}"
           title="셀로 드래그하여 배치">
        <div class="slot-pool-drag-handle" title="드래그하여 순서 변경"><i class="fas fa-grip-vertical"></i></div>
        <div class="slot-pool-info">
          <div class="slot-pool-top">
            <span class="slot-pool-name">${escHtml(sl.name)}</span>
            ${sl.code ? `<span class="slot-pool-code">${escHtml(sl.code)}</span>` : ''}
            ${categoryBadge(sl.slot_type||'기타')}
          </div>
          ${attrChips ? `<div class="slot-pool-attrs">${attrChips}</div>` : ''}
          <div class="slot-pool-bottom">
            ${matName
              ? `<span class="slot-pool-mat"><i class="fas fa-box"></i> ${escHtml(matName)}</span>`
              : `<span class="slot-pool-mat-none">자재 미연결</span>`}
          </div>
        </div>
        <div class="slot-pool-actions">
          ${!defaultMat
            ? `<button class="matrix-header-btn" onclick="openSlotMatQuickModal('${escHtml(sl.id)}')" title="자재 연결"><i class="fas fa-link"></i></button>`
            : `<button class="matrix-header-btn" disabled title="연결된 자재 있음 — 해제 후 변경 가능" style="opacity:0.3;cursor:not-allowed"><i class="fas fa-link"></i></button>`}
          <button class="matrix-header-btn" onclick="editSlotInDetail('${escHtml(sl.id)}')" title="수정"><i class="fas fa-edit"></i></button>
          <button class="matrix-header-btn danger" onclick="deleteSlotInDetail('${escHtml(sl.id)}','${escHtml(sl.name)}')" title="삭제"><i class="fas fa-trash"></i></button>
        </div>
      </div>`;
  }).join('');

  // 스펙 풀 아이템 이벤트 바인딩:
  // - 핸들(grip) 드래그 → 순서 변경 (slot-pool-sort 키)
  // - 아이템 본체 드래그 → 매트릭스 셀 배치 (text/plain 키)
  container.querySelectorAll('.slot-pool-item').forEach(el => {
    const slotId = el.dataset.slotId;

    // 기본적으로 draggable 활성 → 아이템 전체 드래그 = 셀 배치용
    el.setAttribute('draggable', 'true');

    el.addEventListener('dragstart', e => {
      // dragstart가 핸들에서 시작됐는지 확인
      const fromHandle = e.target.closest('.slot-pool-drag-handle');
      if (fromHandle) {
        // 핸들 드래그 → 정렬용
        e.dataTransfer.setData('slot-pool-sort', slotId);
        e.dataTransfer.setData('text/plain', '');   // 셀 드롭 차단
        e.dataTransfer.effectAllowed = 'move';
      } else {
        // 아이템 본체 드래그 → 셀 배치용
        e.dataTransfer.setData('text/plain', slotId);
        e.dataTransfer.setData('slot-pool-sort', '');  // 정렬 차단
        e.dataTransfer.effectAllowed = 'copy';
      }
      el.classList.add('dragging');
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
    });
  });

  // 스펙 풀 순서 변경 makeSortable 적용
  if (slots.length >= 2) {
    makeSortable(container, {
      itemSelector: '.slot-pool-item[data-id]',
      handleSelector: '.slot-pool-drag-handle',
      getId: el => el.dataset.id,
      skipDragData: true,   // 각 아이템의 dragstart에서 직접 setData 처리
      onReorder: async (orderedIds) => {
        await Promise.all(orderedIds.map((id, i) => {
          const slot = State.slots.find(s => s.id === id);
          if (!slot) return Promise.resolve();
          return API.put('slots', id, { ...slot, sort_order: i + 1 });
        }));
        await loadAll();
        renderSlotPool(currentPackageId);
      }
    });
  }
}

// ─────────────────────────────────────────
// 항목(Item) CRUD
// ─────────────────────────────────────────
function openItemModal(data = null) {
  document.getElementById('item-modal-title').textContent = data ? '항목 수정' : '항목 추가';
  document.getElementById('item-record-id').value = data ? (data.id || '') : '';
  document.getElementById('item-name').value = data ? (data.name || '') : '';
  document.getElementById('item-desc').value = data ? (data.description || '') : '';
  document.getElementById('item-sort').value = data
    ? (data.sort_order ?? 99)
    : State.packageItems.filter(i => i.package_id === currentPackageId).length + 1;
  openModal('item-modal');
}

function editItem(itemId) {
  const item = State.packageItems.find(i => i.id === itemId);
  if (item) openItemModal(item);
}

async function saveItem() {
  const recordId = document.getElementById('item-record-id').value;
  const name = document.getElementById('item-name').value.trim();
  if (!name) { showToast('항목명을 입력하세요', 'error'); return; }

  const payload = {
    package_id: currentPackageId,
    name,
    description: document.getElementById('item-desc').value.trim(),
    sort_order: parseInt(document.getElementById('item-sort').value) || 99
  };

  try {
    if (recordId) {
      const existing = State.packageItems.find(i => i.id === recordId);
      await API.put('package_items', recordId, { ...(existing||{}), ...payload });
      showToast('항목이 수정되었습니다');
    } else {
      await API.post('package_items', payload);
      showToast('항목이 추가되었습니다');
    }
    closeModal('item-modal');
    await loadAll();
    renderDetailMatrix(currentPackageId);
    renderSlotPool(currentPackageId);
    // 요약 바 갱신
    renderPackageDetail(currentPackageId);
  } catch(e) { showToast('저장 실패: ' + e.message, 'error'); }
}

function deleteItem(itemId, name) {
  const assignCount = State.slotAssignments.filter(a => a.item_id === itemId).length;
  const warn = assignCount > 0 ? `\n⚠️ 이 항목에 배치된 스펙 ${assignCount}개가 함께 삭제됩니다.` : '';
  confirmDelete(`항목 "${name}"을 삭제하시겠습니까?${warn}`, async () => {
    try {
      // 이 항목의 slot_assignments도 삭제
      const toDelete = State.slotAssignments.filter(a => a.item_id === itemId);
      await Promise.all(toDelete.map(a => API.delete('slot_assignments', a.id)));
      await API.delete('package_items', itemId);
      showToast('항목이 삭제되었습니다');
      await loadAll();
      renderPackageDetail(currentPackageId);
    } catch(e) { showToast('삭제 실패: ' + e.message, 'error'); }
  });
}

// ─────────────────────────────────────────
// 셀 배치 모달 (항목 × 패키지 → 스펙)
// staged 방식: 추가/삭제 스테이징 → 저장 버튼으로 일괄 반영
// ─────────────────────────────────────────
let cellStaged = { toAdd: [], toRemove: [] };  // { toAdd: [slotId], toRemove: [assignmentId] }

function openCellModal(itemId, setId) {
  const item = State.packageItems.find(i => i.id === itemId);
  const set  = State.grades.find(s => s.id === setId);
  if (!item || !set) return;

  // 상태 초기화
  cellStaged = { toAdd: [], toRemove: [] };

  document.getElementById('cell-modal-title').textContent = `${escHtml(item.name)} × ${escHtml(set.name)}`;
  document.getElementById('cell-modal-sub').textContent   = '셀 스펙 배치 편집';
  document.getElementById('cell-item-id').value = itemId;
  document.getElementById('cell-grade-id').value  = setId;

  _renderCellModalSlots();
  _refreshCellSlotSelect();
  // 스테이징 영역 초기화
  document.getElementById('cell-staged-slots').innerHTML = '';

  openModal('cell-modal');
}

// 현재 저장된 배치 목록 렌더
function _renderCellModalSlots() {
  const itemId = document.getElementById('cell-item-id').value;
  const setId  = document.getElementById('cell-grade-id').value;
  // toRemove에 없는 것만 표시
  const assigns = State.slotAssignments.filter(
    a => a.item_id === itemId && a.grade_id === setId &&
         !cellStaged.toRemove.includes(a.id)
  );
  const container = document.getElementById('cell-current-slots');

  if (assigns.length === 0) {
    container.innerHTML = `<div class="cell-modal-empty">배치된 Slot이 없습니다.</div>`;
    return;
  }
  container.innerHTML = assigns.map(a => {
    const sl = State.slots.find(s => s.id === a.slot_id);
    return `
      <div class="cell-slot-item">
        <span class="cell-slot-name">${escHtml(sl ? sl.name : '?')}</span>
        ${sl ? categoryBadge(sl.slot_type||'기타') : ''}
        <button class="cell-slot-remove" onclick="stageCellRemove('${escHtml(a.id)}')" title="제거 예약">
          <i class="fas fa-times"></i>
        </button>
      </div>`;
  }).join('');
}

// 스테이징된 추가 목록 렌더
function _renderCellStagedSlots() {
  const container = document.getElementById('cell-staged-slots');
  if (cellStaged.toAdd.length === 0) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = cellStaged.toAdd.map(slotId => {
    const sl = State.slots.find(s => s.id === slotId);
    return `
      <div class="cell-slot-item cell-slot-staged">
        <i class="fas fa-plus-circle" style="color:#1a56db;font-size:11px"></i>
        <span class="cell-slot-name">${escHtml(sl ? sl.name : '?')}</span>
        ${sl ? categoryBadge(sl.slot_type||'기타') : ''}
        <button class="cell-slot-remove" onclick="unstageCellAdd('${escHtml(slotId)}')" title="추가 취소">
          <i class="fas fa-times"></i>
        </button>
      </div>`;
  }).join('');
}

// 드롭다운: 이미 배치됐거나 toAdd에 있는 것 제외
function _refreshCellSlotSelect() {
  const itemId = document.getElementById('cell-item-id').value;
  const setId  = document.getElementById('cell-grade-id').value;
  const alreadyIds = State.slotAssignments
    .filter(a => a.item_id === itemId && a.grade_id === setId &&
                 !cellStaged.toRemove.includes(a.id))
    .map(a => a.slot_id);
  const usedIds = new Set([...alreadyIds, ...cellStaged.toAdd]);

  const poolSlots = State.slots.filter(sl => sl.package_id === currentPackageId);
  const sel = document.getElementById('cell-slot-select');
  sel.innerHTML = '<option value="">— 스펙 선택 —</option>' +
    poolSlots.map(sl => {
      const used = usedIds.has(sl.id);
      return `<option value="${escHtml(sl.id)}" ${used?'disabled':''}>
        ${escHtml(sl.name)}${sl.code?' ['+escHtml(sl.code)+']':''}${used?' ✓':''}
      </option>`;
    }).join('');
}

// 추가 스테이징
function stageCellSlot() {
  const slotId = document.getElementById('cell-slot-select').value;
  if (!slotId) { showToast('Slot을 선택하세요', 'error'); return; }
  if (cellStaged.toAdd.includes(slotId)) { showToast('이미 추가 예약됨', 'error'); return; }
  cellStaged.toAdd.push(slotId);
  document.getElementById('cell-slot-select').value = '';
  _renderCellStagedSlots();
  _refreshCellSlotSelect();
}

// 추가 스테이징 취소
function unstageCellAdd(slotId) {
  cellStaged.toAdd = cellStaged.toAdd.filter(id => id !== slotId);
  _renderCellStagedSlots();
  _refreshCellSlotSelect();
}

// 제거 스테이징 (현재 배치 → 제거 예약)
function stageCellRemove(assignmentId) {
  if (!cellStaged.toRemove.includes(assignmentId)) {
    cellStaged.toRemove.push(assignmentId);
  }
  _renderCellModalSlots();
  _refreshCellSlotSelect();
}

// 저장 — staged 일괄 반영
async function saveCellAssignments() {
  const itemId = document.getElementById('cell-item-id').value;
  const setId  = document.getElementById('cell-grade-id').value;

  if (cellStaged.toAdd.length === 0 && cellStaged.toRemove.length === 0) {
    closeModal('cell-modal');
    return;
  }

  try {
    // 삭제 먼저
    await Promise.all(cellStaged.toRemove.map(id => API.delete('slot_assignments', id)));
    // 추가
    await Promise.all(cellStaged.toAdd.map(slotId =>
      API.post('slot_assignments', {
        package_id: currentPackageId,
        item_id: itemId,
        grade_id: setId,
        slot_id: slotId
      })
    ));
    showToast('배치가 저장되었습니다');
    closeModal('cell-modal');
    await loadAll();
    renderDetailMatrix(currentPackageId);
    renderSlotPool(currentPackageId);
    updateSummaryBar(currentPackageId);
  } catch(e) { showToast('저장 실패: ' + e.message, 'error'); }
}

// 모달 닫기 — staged 초기화
function closeCellModal() {
  cellStaged = { toAdd: [], toRemove: [] };
  closeModal('cell-modal');
}

// 기존 removeSlotFromCell은 quickRemoveChip으로 대체됨 (셀 ×버튼)
async function removeSlotFromCell(assignmentId) {
  await quickRemoveChip(assignmentId);
}

// ─────────────────────────────────────────
// 패키지 상세 — 등급 CRUD
// ─────────────────────────────────────────
function openGradeModalInDetail() {
  // 상세 페이지에서 등급 추가: 패키지를 currentPackageId로 고정
  const fakeData = { package_id: currentPackageId };
  openGradeModal(null, true);
  // package_id 숨김 세팅 (openGradeModal 후 덮어쓰기)
  setTimeout(() => {
    document.getElementById('grade-package-id').innerHTML =
      `<option value="${escHtml(currentPackageId)}" selected>${escHtml(State.packages.find(t=>t.id===currentPackageId)?.name||'')}</option>`;
    document.getElementById('grade-package-id').value = currentPackageId;
  }, 0);
}

function editGradeInDetail(setId) {
  const item = State.grades.find(s => s.id === setId);
  if (!item) return;
  // hidePackageRow=true: 상세 페이지에서는 패키지 선택 불필요
  openGradeModal(item, true);
}

function deleteGradeInDetail(setId, name) {
  const assignCount = State.slotAssignments.filter(a => a.grade_id === setId).length;
  const warn = assignCount > 0 ? `\n⚠️ 이 등급의 스펙 배치 ${assignCount}개가 함께 삭제됩니다.` : '';
  confirmDelete(`등급 "${name}"을 삭제하시겠습니까?${warn}`, async () => {
    try {
      const toDelete = State.slotAssignments.filter(a => a.grade_id === setId);
      await Promise.all(toDelete.map(a => API.delete('slot_assignments', a.id)));
      await API.delete('grades', setId);
      await logChange('grade', setId, name, 'delete', null, null);
      showToast('등급이 삭제되었습니다');
      await loadAll();
      renderPackageDetail(currentPackageId);
    } catch(e) { showToast('삭제 실패: ' + e.message, 'error'); }
  });
}

// ─────────────────────────────────────────
// 패키지 상세 — 스펙 CRUD
// ─────────────────────────────────────────
function openSlotModalInDetail() {
  document.getElementById('slot-modal-title').textContent = '스펙 추가';
  document.getElementById('slot-record-id').value = '';
  document.getElementById('slot-package-id').value = currentPackageId;
  document.getElementById('slot-code').value = '';
  document.getElementById('slot-name').value = '';
  document.getElementById('slot-type').value = '기타';
  document.getElementById('slot-desc').value = '';
  _renderSlotAttrFields('기타', {});
  openModal('slot-modal');
}

function editSlotInDetail(slotId) {
  const item = State.slots.find(s => s.id === slotId);
  if (!item) return;
  document.getElementById('slot-modal-title').textContent = '스펙 수정';
  document.getElementById('slot-record-id').value = item.id;
  document.getElementById('slot-package-id').value = item.package_id || currentPackageId;
  document.getElementById('slot-code').value = item.code || item.id || '';
  document.getElementById('slot-name').value = item.name || '';
  document.getElementById('slot-type').value = item.slot_type || '기타';
  const { desc, attrs } = parseSlotDesc(item.description);
  document.getElementById('slot-desc').value = desc;
  _renderSlotAttrFields(item.slot_type || '기타', attrs);
  openModal('slot-modal');
}

function deleteSlotInDetail(slotId, name) {
  const assignCount = State.slotAssignments.filter(a => a.slot_id === slotId).length;
  const warn = assignCount > 0 ? `\n⚠️ 이 스펙의 셀 배치 ${assignCount}개가 함께 삭제됩니다.` : '';
  confirmDelete(`스펙 "${name}"을 삭제하시겠습니까?${warn}`, async () => {
    try {
      const toDelete = State.slotAssignments.filter(a => a.slot_id === slotId);
      await Promise.all(toDelete.map(a => API.delete('slot_assignments', a.id)));
      await API.delete('slots', slotId);
      await logChange('slot', slotId, name, 'delete', null, null);
      showToast('Slot이 삭제되었습니다');
      await loadAll();
      renderPackageDetail(currentPackageId);
    } catch(e) { showToast('삭제 실패: ' + e.message, 'error'); }
  });
}

// ── 자재 연결 빠른 모달 ──
function openSlotMatQuickModal(slotId) {
  const slot = State.slots.find(s => s.id === slotId);
  if (!slot) return;

  // 기존 연결 여부 확인 (변경 모드 판단용 — 차단하지 않음)
  const existing = State.slotMaterials.find(sm => sm.slot_id === slotId);

  // 스펙 유형 기준 자재 스코프 결정
  // '기타' 또는 미지정이면 전체 자재 표시
  const slotType = slot.slot_type || '';
  const isAllTypes = !slotType || slotType === '기타';
  const scopedMats = isAllTypes
    ? State.materials
    : State.materials.filter(m => (m.category || '') === slotType);

  // 유형 배지 — 타이틀 우측 인라인
  const badgeEl = document.getElementById('smq-type-badge');
  if (badgeEl) {
    if (!isAllTypes) {
      const enumEntry = State.enums.find(e => e.group_key === 'material_type' && e.value === slotType);
      const color = enumEntry?.color || '#6b7280';
      badgeEl.innerHTML =
        `<span style="display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;`+
        `color:${escHtml(color)};background:${escHtml(color)}1a;border:1px solid ${escHtml(color)}40;`+
        `padding:2px 9px;border-radius:99px;white-space:nowrap">`+
        `<span style="width:7px;height:7px;border-radius:50%;background:${escHtml(color)};flex-shrink:0"></span>`+
        `${escHtml(slotType)}</span>`;
      badgeEl.style.display = 'inline-flex';
    } else {
      badgeEl.style.display = 'none';
      badgeEl.innerHTML = '';
    }
  }

  // 현재 슬롯 유형을 hidden에 저장 (filterSmqMaterials에서 스코프 유지)
  const slotTypeInput = document.getElementById('smq-slot-type');
  if (slotTypeInput) slotTypeInput.value = slotType;

  document.getElementById('smq-title').textContent = existing
    ? `자재 변경 — ${slot.name}`
    : `자재 연결 — ${slot.name}`;
  // 변경 모드일 때 기존 연결 ID를 hidden에 저장
  const smqReplaceId = document.getElementById('smq-replace-id');
  if (smqReplaceId) smqReplaceId.value = existing ? existing.id : '';
  document.getElementById('smq-slot-id').value = slotId;
  document.getElementById('smq-record-id').value = '';
  document.getElementById('smq-material').value = '';
  document.getElementById('smq-note').value = '';
  document.getElementById('smq-search').value = '';
  document.getElementById('smq-confirm-btn').disabled = true;

  // 유형 스코프 적용된 자재 목록으로 렌더링
  _renderSmqTable(scopedMats);
  openModal('slot-mat-quick-modal');

  requestAnimationFrame(() => {
    const inp = document.getElementById('smq-search');
    if (inp) inp.focus();
  });
}

// 자재 연결 모달 — 테이블 렌더링
function _renderSmqTable(list) {
  const tbody = document.getElementById('smq-mat-tbody');
  const empty = document.getElementById('smq-mat-empty');
  const selectedId = document.getElementById('smq-material').value;

  if (!list || list.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'flex';
    return;
  }
  empty.style.display = 'none';

  tbody.innerHTML = list.map(m => {
    const isDisc     = m.status === 'inactive' || m.status === 'discontinued';
    const isSelected = m.id === selectedId;

    // 색상 파싱
    let colors = [];
    if (m.colors) { try { colors = JSON.parse(m.colors); } catch(e) { colors = []; } }

    // 세부 속성 패널 HTML — 코드·규격·단위·단가 한 줄 표시
    const infoItems = [
      m.code       ? `<span class="smq-info-chip"><span class="smq-info-lbl">코드</span>${escHtml(m.code)}</span>` : '',
      m.spec       ? `<span class="smq-info-chip"><span class="smq-info-lbl">규격</span>${escHtml(m.spec)}</span>` : '',
      m.unit       ? `<span class="smq-info-chip"><span class="smq-info-lbl">단위</span>${escHtml(m.unit)}</span>` : '',
      m.unit_price ? `<span class="smq-info-chip"><span class="smq-info-lbl">단가</span>${Number(m.unit_price).toLocaleString()}원</span>` : '',
    ].filter(Boolean);
    const hasDetail = infoItems.length > 0 || m.note || colors.length > 0 || m.image_url;
    const detailHtml = `
      <tr class="smq-detail-row" id="smq-detail-${escHtml(m.id)}" style="display:none">
        <td colspan="5" style="padding:0">
          <div class="smq-detail-panel">
            ${m.image_url ? `<img src="${escHtml(m.image_url)}" class="smq-detail-img" alt="자재 이미지">` : ''}
            <div class="smq-detail-body">
              ${infoItems.length > 0 ? `<div class="smq-info-row">${infoItems.join('')}</div>` : ''}
              ${m.note ? `<div class="smq-detail-note"><span class="smq-info-lbl">비고</span>${escHtml(m.note)}</div>` : ''}
              ${colors.length > 0 ? `<div class="smq-color-row"><span class="smq-info-lbl">색상</span>${
                colors.map(c => `<span class="smq-color-chip">${c.hex ? `<span class="smq-color-swatch" style="background:${escHtml(c.hex)}"></span>` : ''}${escHtml(c.code||'')}${c.name?` ${escHtml(c.name)}`:''}</span>`).join('')
              }</div>` : ''}
              ${!hasDetail ? `<span style="font-size:12px;color:#9ca3af">등록된 세부 정보가 없습니다</span>` : ''}
            </div>
          </div>
        </td>
      </tr>`;

    return `<tr class="smq-mat-row${isSelected ? ' smq-mat-row--selected' : ''}${isDisc ? ' smq-mat-row--disc' : ''}"
               data-mat-id="${escHtml(m.id)}"
               onclick="selectSmqMaterial('${escHtml(m.id)}')">
      <td>
        ${isDisc ? '<span style="margin-right:4px">⛔</span>' : ''}
        <span class="smq-mat-name">${escHtml(m.name)}</span>
      </td>
      <td style="color:#6b7280">${escHtml(m.supplier||'-')}</td>
      <td style="color:#6b7280">${escHtml(m.brand||'-')}</td>
      <td>${isDisc
        ? '<span class="badge badge-gray" style="font-size:10px">비활성화</span>'
        : '<span class="badge badge-success" style="font-size:10px">정상</span>'}</td>
      <td style="padding:0 6px;text-align:center">
        <button class="smq-info-btn" title="세부 정보 보기"
                onclick="event.stopPropagation();toggleSmqDetail('${escHtml(m.id)}', this)">
          <i class="fas fa-info-circle"></i>
        </button>
      </td>
    </tr>${detailHtml}`;
  }).join('');
}

// 자재 연결 모달 — 세부 정보 패널 토글
function toggleSmqDetail(matId, btn) {
  const row = document.getElementById(`smq-detail-${matId}`);
  if (!row) return;
  const isOpen = row.style.display !== 'none';
  // 다른 열려있는 패널들 모두 닫기
  document.querySelectorAll('.smq-detail-row').forEach(r => {
    r.style.display = 'none';
  });
  document.querySelectorAll('.smq-info-btn').forEach(b => b.classList.remove('smq-info-btn--active'));
  // 현재 패널 토글
  if (!isOpen) {
    row.style.display = '';
    btn.classList.add('smq-info-btn--active');
  }
}

// 자재 연결 모달 — 검색 필터 (slot_type 스코프 유지)
function filterSmqMaterials(query) {
  const q = query.trim().toLowerCase();
  // 현재 스펙의 유형 스코프
  const slotType = (document.getElementById('smq-slot-type')?.value || '');
  const isAllTypes = !slotType || slotType === '기타';
  const base = isAllTypes
    ? State.materials
    : State.materials.filter(m => (m.category || '') === slotType);
  const filtered = !q
    ? base
    : base.filter(m =>
        (m.name     || '').toLowerCase().includes(q) ||
        (m.code     || '').toLowerCase().includes(q) ||
        (m.supplier || '').toLowerCase().includes(q) ||
        (m.brand    || '').toLowerCase().includes(q)
      );
  _renderSmqTable(filtered);
}

// 자재 연결 모달 — 행 클릭 시 선택 (이미 선택된 행 재클릭 시 취소)
function selectSmqMaterial(matId) {
  const current = document.getElementById('smq-material').value;
  const isToggleOff = (current === matId);

  document.getElementById('smq-material').value = isToggleOff ? '' : matId;
  document.getElementById('smq-confirm-btn').disabled = isToggleOff;

  // 선택 행 하이라이트 갱신
  filterSmqMaterials(document.getElementById('smq-search').value);
}

async function saveSlotMatQuick() {
  const slotId    = document.getElementById('smq-slot-id').value;
  const matId     = document.getElementById('smq-material').value;
  const replaceId = document.getElementById('smq-replace-id')?.value || '';
  if (!matId) { showToast('자재를 선택하세요', 'error'); return; }

  const mat = State.materials.find(m => m.id === matId);
  const payload = { slot_id: slotId, material_id: matId, is_default: true };

  try {
    // 기존 연결이 있으면 먼저 삭제 후 새로 연결 (교체)
    if (replaceId) {
      await API.delete('slot_materials', replaceId);
    }
    const res = await API.post('slot_materials', payload);
    await logChange('slot_material', res.id, `${slotId} ↔ ${mat?.name||matId}`,
      replaceId ? 'replace' : 'create', null, payload, replaceId ? '자재 변경' : '자재 연결');
    showToast(replaceId ? '자재가 변경되었습니다' : '자재가 연결되었습니다');
    closeModal('slot-mat-quick-modal');
    await loadAll();
    if (State.currentPage === 'package-detail' && currentPackageId) {
      renderSlotPool(currentPackageId);
    } else if (State.currentPage === 'slots') {
      renderSlotTable();
    } else if (State.currentPage === 'slot-materials') {
      renderSlotMaterials();
    }
  } catch(e) { showToast('저장 실패: ' + e.message, 'error'); }
}

function editCurrentPackage() {
  const st = State.packages.find(t => t.id === currentPackageId);
  if (st) openPackageModal(st);
}

function openPackageModal(data = null) {
  document.getElementById('package-modal-title').textContent = data ? '패키지 수정' : '패키지 추가';
  document.getElementById('package-record-id').value = data ? (data.id || '') : '';
  document.getElementById('package-name').value = data ? data.name : '';
  document.getElementById('package-desc').value = data ? (data.description || '') : '';
  document.getElementById('package-sort').value = data ? (data.sort_order ?? State.packages.length + 1) : State.packages.length + 1;

  // 분류 드롭다운 채우기
  const catSel = document.getElementById('package-category');
  catSel.innerHTML = '<option value="">(분류 없음)</option>' +
    State.packageCategories.map(c =>
      `<option value="${escHtml(c.id)}" ${data?.category_id === c.id ? 'selected' : ''}>${escHtml(c.name)}</option>`
    ).join('');

  openModal('package-modal');
}

async function savePackage() {
  const recordId   = document.getElementById('package-record-id').value;
  const name       = document.getElementById('package-name').value.trim();
  const description = document.getElementById('package-desc').value.trim();
  const sort_order = parseInt(document.getElementById('package-sort').value) || 0;
  const category_id = document.getElementById('package-category').value || undefined;

  if (!name) { showToast('패키지명을 입력하세요', 'error'); return; }

  const payload = { name, description, sort_order, category_id };

  try {
    if (recordId) {
      const _beforeSt = State.packages.find(t => t.id === recordId);
      await API.put('packages', recordId, payload);
      await logChange('package', recordId, name, 'update', _beforeSt, payload);
      showToast('패키지가 수정되었습니다');
    } else {
      const res = await API.post('packages', payload);
      await logChange('package', res.id, name, 'create', null, payload);
      showToast('패키지가 추가되었습니다');
    }
    closeModal('package-modal');
    if (State.currentPage === 'package-detail' && currentPackageId) {
      await loadAll();
      const updated = State.packages.find(t => t.id === currentPackageId);
      if (updated) document.getElementById('std-page-title').textContent = `🏷️ ${updated.name}`;
    } else {
      await renderPackages();
    }
  } catch(e) { showToast('저장 실패: ' + e.message, 'error'); }
}

function editPackage(stId) {
  const item = State.packages.find(st => st.id === stId);
  if (!item) return;
  openPackageModal(item);
}

function deletePackage(stId, name) {
  const setCount = State.grades.filter(s => s.package_id === stId).length;
  const warnMsg  = setCount > 0 ? `\n⚠️ 이 패키지에 속한 등급 ${setCount}개가 있습니다!` : '';
  confirmDelete(`패키지 "${name}"을 삭제하시겠습니까?${warnMsg}`, async () => {
    try {
      await API.delete('packages', stId);
      await logChange('package', stId, name, 'delete', null, null);
      showToast('패키지가 삭제되었습니다');
      await renderPackages();
    } catch(e) { showToast('삭제 실패: ' + e.message, 'error'); }
  });
}

// ===================================================
// ===== 분류(Category) CRUD =====
// ===================================================
function openCategoryModal(data = null) {
  document.getElementById('category-modal-title').textContent = data ? '분류 수정' : '분류 추가';
  document.getElementById('category-record-id').value = data ? (data.id || '') : '';
  document.getElementById('category-name').value = data ? data.name : '';
  document.getElementById('category-sort').value = data
    ? (data.sort_order ?? State.packageCategories.length + 1)
    : State.packageCategories.length + 1;
  openModal('category-modal');
}

async function saveCategory() {
  const recordId   = document.getElementById('category-record-id').value;
  const name       = document.getElementById('category-name').value.trim();
  const sort_order = parseInt(document.getElementById('category-sort').value) || 99;

  if (!name) { showToast('분류명을 입력하세요', 'error'); return; }

  const payload = { name, sort_order };
  try {
    if (recordId) {
      await API.put('package_categories', recordId, payload);
      showToast('분류가 수정되었습니다');
    } else {
      await API.post('package_categories', payload);
      showToast('분류가 추가되었습니다');
    }
    closeModal('category-modal');
    await renderPackages();
  } catch(e) { showToast('저장 실패: ' + e.message, 'error'); }
}

function editCategory(catId) {
  const item = State.packageCategories.find(c => c.id === catId);
  if (!item) return;
  openCategoryModal(item);
}

function deleteCategory(catId, name) {
  const stCount = State.packages.filter(st => st.category_id === catId).length;
  const warn    = stCount > 0 ? `\n⚠️ 이 분류에 속한 패키지 ${stCount}개가 있습니다!\n패키지들은 삭제되지 않고 "미분류"로 남습니다.` : '';
  confirmDelete(`분류 "${name}"을 삭제하시겠습니까?${warn}`, async () => {
    try {
      await API.delete('package_categories', catId);
      showToast('분류가 삭제되었습니다');
      await renderPackages();
    } catch(e) { showToast('삭제 실패: ' + e.message, 'error'); }
  });
}

// ===================================================
// ===== 등급 카탈로그 =====
// ===================================================
let setFilterText = '';

async function renderGrades() {
  await loadAll();
  renderGradeGroups();
}

// ── 패키지별 그룹 렌더 ──
function renderGradeGroups() {
  const q = setFilterText.toLowerCase();
  const container = document.getElementById('grades-group-container');

  // 검색어 필터 적용
  const filtered = q
    ? State.grades.filter(s =>
        (s.name||'').toLowerCase().includes(q) ||
        (s.code||'').toLowerCase().includes(q))
    : State.grades;

  // 데이터가 하나도 없는 경우
  if (State.grades.length === 0) {
    container.innerHTML = `
      <div class="empty-state-action" style="margin-top:24px">
        <div class="esa-icon">📦</div>
        <div class="esa-title">등록된 등급이 없습니다</div>
        <div class="esa-desc">패키지를 먼저 등록한 후, <strong>+ 등급 추가</strong> 버튼을 눌러 등급을 등록하세요.</div>
        <button class="btn btn-primary" onclick="openGradeModal()"><i class="fas fa-plus"></i> 등급 추가</button>
      </div>`;
    return;
  }

  // 검색 결과 없음
  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="margin-top:24px">
        <div class="empty-icon">🔍</div>
        <h3>검색 결과 없음</h3>
        <p>다른 검색어를 입력해보세요</p>
      </div>`;
    return;
  }

  // 패키지별로 그룹핑
  // 1) 패키지가 있는 등급: package_id 기준
  // 2) 패키지가 없는 등급: "미분류" 그룹
  const groups = [];

  // sort_order 기준으로 패키지 정렬
  const sortedTypes = [...State.packages].sort((a, b) => (a.sort_order||99) - (b.sort_order||99));

  sortedTypes.forEach(st => {
    const sets = filtered.filter(s => s.package_id === st.id);
    groups.push({ type: st, sets });
  });

  // 패키지 없는 등급 (미분류)
  const untyped = filtered.filter(s => !s.package_id || !State.packages.find(t => t.id === s.package_id));
  if (untyped.length > 0) {
    groups.push({ type: null, sets: untyped });
  }

  container.innerHTML = groups.map(({ type, sets }) => {
    // 유형에 속한 세트가 없고 검색 중이 아니면 빈 그룹도 표시
    const typeId   = type ? escHtml(type.id) : '';
    const typeName = type ? escHtml(type.name) : '미분류';
    const typeDesc = type?.description ? `<span class="sc-type-desc">${escHtml(type.description)}</span>` : '';
    const totalSlots = sets.reduce((acc, s) => {
      return acc + State.slotAssignments.filter(a => a.grade_id === s.id).length;
    }, 0);

    const rows = sets.length === 0
      ? `<div class="sc-empty-row">이 패키지에 등록된 등급이 없습니다.
           <button class="btn btn-xs btn-secondary" style="margin-left:8px"
             onclick="openGradeModalForPackage('${typeId}')">
             <i class="fas fa-plus"></i> 추가
           </button>
         </div>`
      : sets.map(s => {
          const slotCount    = State.slots.filter(sl => sl.package_id === (type?.id||'')).length;
          const assignCount  = State.slotAssignments.filter(a => a.grade_id === s.id).length;
          const isInactive   = s.status === 'inactive';
          return `
            <div class="sc-set-row ${isInactive ? 'sc-set-inactive' : ''}" data-id="${escHtml(s.id)}">
              <span class="drag-handle" title="드래그하여 순서 변경"><i class="fas fa-grip-vertical"></i></span>
              <div class="sc-set-main">
                <span class="sc-set-name">${escHtml(s.name)}</span>
                ${s.code ? `<span class="sc-set-code">${escHtml(s.code)}</span>` : ''}
                ${s.description ? `<span class="sc-set-desc">${escHtml(s.description)}</span>` : ''}
              </div>
              <div class="sc-set-meta">
                <span class="sc-meta-chip" title="배치된 스펙 수">
                  <i class="fas fa-th"></i> ${assignCount}배치
                </span>
                ${statusBadge(s.status)}
              </div>
              <div class="sc-set-actions">
                <button class="btn btn-xs btn-secondary" onclick="editGrade('${escHtml(s.id)}')" title="수정">
                  <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-xs btn-ghost" style="color:#e02424"
                  onclick="deleteGrade('${escHtml(s.id)}','${escHtml(s.name)}')" title="삭제">
                  <i class="fas fa-trash"></i>
                </button>
              </div>
            </div>`;
        }).join('');

    return `
      <div class="sc-group">
        <div class="sc-group-header">
          <div class="sc-group-title-wrap">
            <span class="sc-group-icon"><i class="fas fa-tag"></i></span>
            <span class="sc-group-name">${typeName}</span>
            <span class="sc-group-count">${sets.length}개</span>
            ${typeDesc}
          </div>
          <div class="sc-group-actions">
            ${type ? `<button class="btn btn-xs btn-secondary"
                onclick="navigateToPackageDetail('${typeId}')" title="패키지 상세">
                <i class="fas fa-external-link-alt"></i> 상세
              </button>` : ''}
            <button class="btn btn-xs btn-primary"
              onclick="openGradeModalForPackage('${typeId}')" title="등급 추가">
              <i class="fas fa-plus"></i> 등급 추가
            </button>
          </div>
        </div>
        <div class="sc-set-list" data-type-id="${typeId}">
          ${rows}
        </div>
      </div>`;
  }).join('');

  // 각 카테고리 그룹 안의 패키지 행 DnD 활성화
  if (!q) {
    container.querySelectorAll('.sc-set-list').forEach(list => {
      if (list.querySelectorAll('.sc-set-row[data-id]').length < 2) return;
      makeSortable(list, {
        itemSelector: '.sc-set-row[data-id]',
        handleSelector: '.drag-handle',
        getId: el => el.dataset.id,
        onReorder: async (orderedIds) => {
          await Promise.all(orderedIds.map((id, i) => {
            const item = State.grades.find(s => s.id === id);
            if (!item) return Promise.resolve();
            return API.put('grades', id, { ...item, sort_order: i + 1 });
          }));
          await loadAll();
        }
      });
    });
  }
}

// 특정 패키지로 등급 추가 모달 열기
function openGradeModalForPackage(packageId) {
  openGradeModal();
  // 패키지 미리 선택
  if (packageId) {
    setTimeout(() => {
      const sel = document.getElementById('grade-package-id');
      if (sel) sel.value = packageId;
    }, 50);
  }
}

function filterGrades(val) { setFilterText = val; renderGradeGroups(); }
function filterGradesByLineup(val) { /* 하위호환 */ }
function filterGradesByType(val)   { /* 하위호� */ }

function openGradeModal(data = null, hidePackageRow = false) {
  // hidePackageRow=true이면 패키지 선택 행 숨김 (상세 페이지에서 호출 시)
  const typeRow = document.getElementById('grade-package-row');
  typeRow.style.display = hidePackageRow ? 'none' : '';

  document.getElementById('grade-modal-title').textContent = data ? '등급 수정' : '등급 추가';
  document.getElementById('grade-record-id').value = data ? (data.id||'') : '';

  // 패키지 옵션 채우기
  const typeSelect = document.getElementById('grade-package-id');
  typeSelect.innerHTML = '<option value="">-- 패키지 선택 --</option>' +
    State.packages.map(st =>
      `<option value="${escHtml(st.id)}" ${data?.package_id===st.id?'selected':''}>${escHtml(st.name)}</option>`
    ).join('');

  document.getElementById('grade-code').value = data ? (data.code||data.id||'') : '';
  document.getElementById('grade-name').value = data ? data.name : '';
  document.getElementById('grade-desc').value = data ? (data.description||'') : '';
  document.getElementById('grade-status').value = data ? (data.status||'active') : 'active';
  openModal('grade-modal');
}

async function saveGrade() {
  const recordId = document.getElementById('grade-record-id').value;
  const codeVal = document.getElementById('grade-code').value.trim();
  const payload = {
    code: codeVal || undefined,
    name: document.getElementById('grade-name').value.trim(),
    package_id: document.getElementById('grade-package-id').value,
    description: document.getElementById('grade-desc').value.trim(),
    status: document.getElementById('grade-status').value
  };
  if (codeVal) payload.id = codeVal;

  if (!payload.name) { showToast('등급명을 입력하세요', 'error'); return; }
  if (!payload.package_id) { showToast('패키지를 선택하세요', 'error'); return; }

  try {
    if (recordId) {
      const _beforeSet = State.grades.find(s => s.id === recordId);
      await API.put('grades', recordId, payload);
      await logChange('grade', recordId, payload.name, 'update', _beforeSet, payload);
      showToast('등급이 수정되었습니다');
    } else {
      const res = await API.post('grades', payload);
      await logChange('grade', res.id, payload.name, 'create', null, payload);
      showToast('등급이 추가되었습니다');
    }
    closeModal('grade-modal');
    // 현재 페이지에 맞게 갱신
    if (State.currentPage === 'package-detail' && currentPackageId) {
      await loadAll();
      renderPackageDetail(currentPackageId);
    } else {
      await renderPackages();   // 패키지 관리 페이지 갱신
    }
  } catch(e) { showToast('저장 실패: ' + e.message, 'error'); }
}

function editGrade(setId) {
  const item = State.grades.find(s => s.id === setId);
  if (!item) return;
  openGradeModal(item);
}

function deleteGrade(setId, name) {
  const item = State.grades.find(s => s.id === setId);
  if (!item) return;
  confirmDelete(`등급 "${name}"을 삭제하시겠습니까?`, async () => {
    try {
      await API.delete('grades', item.id);
      await logChange('grade', setId, name, 'delete', item, null);
      showToast('등급이 삭제되었습니다');
      if (State.currentPage === 'package-detail' && currentPackageId) {
        await loadAll();
        renderPackageDetail(currentPackageId);
      } else {
        await renderPackages();
      }
    } catch(e) { showToast('삭제 실패: ' + e.message, 'error'); }
  });
}

// ===================================================
// ===== 스펙 관리 =====
// ===================================================
let slotFilterText = '', slotFilterSet = '', slotFilterType = '';

async function renderSlots() {
  await loadAll();
  renderSlotTable();
}

function renderSlotTable() {
  // ── 필터 적용 ──
  let data = [...State.slots];
  if (slotFilterText) {
    const q = slotFilterText.toLowerCase();
    data = data.filter(s =>
      (s.name||'').toLowerCase().includes(q) ||
      (s.code||'').toLowerCase().includes(q)
    );
  }
  if (slotFilterType) data = data.filter(s => s.slot_type === slotFilterType);

  const container = document.getElementById('slots-groups-container');

  // ── 전체 비어있을 때 ──
  if (State.slots.length === 0) {
    container.innerHTML = `
      <div class="empty-state-action">
        <div class="esa-icon">🔩</div>
        <div class="esa-title">등록된 스펙이 없습니다</div>
        <div class="esa-desc">카테고리 상세에서 스펙을 추가하거나, 오른쪽 상단 <strong>+ 스펙 추가</strong> 버튼을 눌러 등록하세요.</div>
        <button class="btn btn-primary" onclick="openSlotModal()"><i class="fas fa-plus"></i> 스펙 추가</button>
      </div>`;
    return;
  }

  // ── 검색 결과 없을 때 ──
  if (data.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <h3>검색 결과 없음</h3>
        <p>검색어 또는 필터를 변경해보세요</p>
      </div>`;
    return;
  }

  // ── 패키지별 그룹 분류 ──
  // package_id 기준으로 그룹핑, sort_order 순 정렬
  const sortedTypes = [...State.packages].sort((a, b) => (a.sort_order||0) - (b.sort_order||0));

  // 패키지 없는 스펙(미분류) 포함
  const grouped = new Map(); // packageId → slots[]
  sortedTypes.forEach(st => grouped.set(st.id, []));
  grouped.set('__none__', []); // 미분류

  data.forEach(sl => {
    const key = sl.package_id && grouped.has(sl.package_id) ? sl.package_id : '__none__';
    grouped.get(key).push(sl);
  });

  // ── 단일 스펙 행 렌더 헬퍼 ──
  function _slotRow(sl) {
    const sm  = State.slotMaterials.find(s => s.slot_id === sl.id);
    const mat = sm ? State.materials.find(m => m.id === sm.material_id) : null;

    // 이 스펙이 배치된 slot_assignments
    const assigns = State.slotAssignments.filter(a => a.slot_id === sl.id);

    // 항목명 (중복 제거)
    const itemNames = [...new Set(
      assigns.map(a => State.packageItems.find(i => i.id === a.item_id)?.name).filter(Boolean)
    )];
    const itemCell = itemNames.length
      ? itemNames.map(n => `<span class="slot-ref-chip slot-ref-chip--item">${escHtml(n)}</span>`).join('')
      : `<span style="color:#d1d5db;font-size:12px">—</span>`;

    // 등급명 (중복 제거)
    const pkgNames = [...new Set(
      assigns.map(a => State.grades.find(s => s.id === a.grade_id)?.name).filter(Boolean)
    )];
    const pkgCell = pkgNames.length
      ? pkgNames.map(n => `<span class="slot-ref-chip slot-ref-chip--pkg">${escHtml(n)}</span>`).join('')
      : `<span style="color:#d1d5db;font-size:12px">—</span>`;

    // 연결 자재 칩
    const matCell = !sm
      ? `<button class="btn btn-xs btn-secondary" onclick="openSlotMatQuickModal('${escHtml(sl.id)}')" title="자재 연결">
           <i class="fas fa-link"></i> 연결 추가
         </button>`
      : mat
        ? `<span class="slot-mat-chip${(mat.status==='inactive'||mat.status==='discontinued')?' slot-mat-chip--disc':''}"
               onclick="openMatDetail('${escHtml(mat.id)}')" title="자재 상세 보기" style="cursor:pointer">
             ${(mat.status==='inactive'||mat.status==='discontinued') ? '<span class="slot-mat-disc-icon">&#x26D4;</span>' : ''}
             <span class="slot-mat-chip-name">${escHtml(mat.name)}</span>
             ${mat.supplier ? `<span class="slot-mat-chip-sup">${escHtml(mat.supplier)}</span>` : ''}
             <button class="slot-mat-chip-del" onclick="event.stopPropagation();unlinkSlotMat('${escHtml(sm.id)}')" title="연결 해제">×</button>
           </span>`
        : '';

    // 열 순서: 유형 - 스펙명 - 대상 패키지 - 항목 - 연결 자재 - 관리
    return `<tr>
      <td>${categoryBadge(sl.slot_type||'기타')}</td>
      <td style="font-weight:600">${escHtml(sl.name)}
        ${sl.description ? `<div style="font-size:11px;color:#9ca3af;font-weight:400;margin-top:2px">${escHtml(sl.description)}</div>` : ''}
      </td>
      <td><div class="slot-ref-wrap">${pkgCell}</div></td>
      <td><div class="slot-ref-wrap">${itemCell}</div></td>
      <td><div class="slot-mat-list">${matCell}</div></td>
      <td>
        <div style="display:flex;gap:4px">
          <button class="btn btn-sm btn-secondary" onclick="editSlot('${escHtml(sl.id)}')" title="수정"><i class="fas fa-edit"></i></button>
          <button class="btn btn-sm btn-ghost" style="color:#e02424" onclick="deleteSlot('${escHtml(sl.id)}','${escHtml(sl.name)}')" title="삭제"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    </tr>`;
  }

  // ── 그룹 블록 생성 ──
  let html = '';
  const renderOrder = [...sortedTypes.map(st => st.id), '__none__'];
  // 검색/필터 중일 때는 DnD 비활성화
  const isDndActive = !slotFilterText && !slotFilterType;

  renderOrder.forEach(key => {
    const slots = grouped.get(key);
    if (!slots || slots.length === 0) return;

    const isNone = key === '__none__';
    const stName = isNone ? '미분류' : (State.packages.find(st => st.id === key)?.name || key);
    const dataId = isNone ? '' : `data-st-id="${escHtml(key)}"`;

    html += `
      <div class="slot-group-block" ${dataId}>
        <div class="slot-group-header${isNone ? ' slot-group-header--none' : ''}">
          ${isDndActive && !isNone
            ? `<span class="slot-group-drag-handle drag-handle" title="드래그하여 순서 변경"><i class="fas fa-grip-vertical"></i></span>`
            : ''}
          <span class="slot-group-name">${escHtml(stName)}</span>
          <span class="slot-group-count">${slots.length}</span>
        </div>
        <div class="table-wrapper" style="margin-bottom:0;border-radius:0 0 8px 8px;border-top:none">
          <table>
            <colgroup>
              <col style="width:90px">
              <col style="min-width:160px">
              <col style="width:140px">
              <col style="width:130px">
              <col style="width:210px">
              <col style="width:80px">
            </colgroup>
            <thead>
              <tr>
                <th>유형</th>
                <th>스펙명</th>
                <th>대상 패키지</th>
                <th>항목</th>
                <th>연결 자재</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>${slots.slice().sort((a,b)=>(a.name||'').localeCompare(b.name||'','ko')).map(_slotRow).join('')}</tbody>
          </table>
        </div>
      </div>`;
  });

  container.innerHTML = html;

  // ── DnD: 카테고리 그룹 순서 변경 (검색 중엔 비활성) ──
  if (isDndActive) {
    makeSortable(container, {
      itemSelector: '.slot-group-block[data-st-id]',
      handleSelector: '.slot-group-drag-handle',
      getId: el => el.dataset.stId,
      onReorder: async orderedIds => {
        await Promise.all(orderedIds.map((id, i) => {
          const st = State.packages.find(t => t.id === id);
          if (!st) return Promise.resolve();
          return API.put('packages', id, { ...st, sort_order: i + 1 });
        }));
        await loadAll();
        // State 갱신 후 재렌더 없이 순서만 저장 완료 (DOM은 이미 드롭으로 갱신됨)
      }
    });
  }
}

function filterSlots(val) { slotFilterText = val; renderSlotTable(); }
function filterSlotsBySet(val) { slotFilterSet = val; renderSlotTable(); }
function filterSlotsByType(val) { slotFilterType = val; renderSlotTable(); }

// ── 자재 상세 팝업 ──
function openMatDetail(matId) {
  const mat = State.materials.find(m => m.id === matId);
  if (!mat) return;

  // 상태 배지
  const statusMap = {
    active:       '<span style="background:#dcfce7;color:#16a34a;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:600">운영중</span>',
    inactive:      '<span style="background:#f3f4f6;color:#6b7280;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:600">비활성화</span>',
    discontinued:  '<span style="background:#f3f4f6;color:#6b7280;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:600">비활성화</span>',
    pending:      '<span style="background:#fef9c3;color:#ca8a04;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:600">검토중</span>',
  };

  document.getElementById('mat-detail-name').textContent = mat.name;
  document.getElementById('mat-detail-status-badge').innerHTML = statusMap[mat.status] || '';

  const rows = [
    ['코드',    mat.code],
    ['브랜드',  mat.brand],
    ['카테고리', mat.category],
    ['규격',    mat.spec],
    ['단위',    mat.unit],
    ['단가',    mat.unit_price != null ? Number(mat.unit_price).toLocaleString() + ' 원' : null],
    ['공급업체', mat.supplier],
    ['리드타임', mat.lead_time_days != null ? mat.lead_time_days + ' 일' : null],
    ['비고',    mat.note],
  ].filter(([, v]) => v != null && v !== '');

  document.getElementById('mat-detail-tbody').innerHTML = rows.map(([label, value]) => `
    <tr>
      <td class="mat-detail-label">${escHtml(label)}</td>
      <td class="mat-detail-value">${escHtml(String(value))}</td>
    </tr>`).join('') || `<tr><td colspan="2" style="text-align:center;padding:20px;color:#9ca3af">등록된 정보가 없습니다</td></tr>`;

  openModal('mat-detail-modal');
}

// 스펙 관리 페이지에서 자재 연결 해제
async function unlinkSlotMat(smId) {
  const sm  = State.slotMaterials.find(s => s.id === smId);
  const mat = sm ? State.materials.find(m => m.id === sm.material_id) : null;
  confirmDelete(
    `"${mat?.name || '?'}" 자재 연결을 해제하시겠습니까?`,
    async () => {
      try {
        await API.delete('slot_materials', smId);
        showToast('연결이 해제되었습니다');
        await loadAll();
        renderSlotTable();
      } catch(e) { showToast('해제 실패: ' + e.message, 'error'); }
    }
  );
}

function openSlotModal(data = null) {
  // 전역 스펙 관리 페이지에서 호출 — package_id는 빈값
  document.getElementById('slot-modal-title').textContent = data ? '스펙 수정' : '스펙 추가';
  document.getElementById('slot-record-id').value = data ? (data.id||'') : '';
  document.getElementById('slot-package-id').value = data ? (data.package_id||'') : '';
  document.getElementById('slot-code').value = data ? (data.code||data.id||'') : '';
  document.getElementById('slot-name').value = data ? data.name : '';
  const slotType = data ? (data.slot_type||'기타') : '기타';
  document.getElementById('slot-type').value = slotType;
  const { desc, attrs } = parseSlotDesc(data ? (data.description||'') : '');
  document.getElementById('slot-desc').value = desc;
  _renderSlotAttrFields(slotType, attrs);
  openModal('slot-modal');
}

/** slot_type 변경 시 속성 입력 폼 동적 렌더링 */
function _renderSlotAttrFields(slotType, currentAttrs = {}) {
  const container = document.getElementById('slot-attr-fields');
  if (!container) return;

  const defs = getAttrDefs(slotType);
  if (defs.length === 0) {
    container.innerHTML = `<div style="font-size:12px;color:#9ca3af;padding:4px 0">
      이 유형에 정의된 속성이 없습니다. <span class="link-btn" onclick="navigate('enums')">유형 관리</span>에서 추가할 수 있습니다.
    </div>`;
    return;
  }

  container.innerHTML = defs.map(def => {
    const key = def.value;   // 속성 key
    const label = def.label || def.value;
    const { unit, hint } = _parseAttrUnit(def.color);
    const val = currentAttrs[key] || '';
    const ph = hint || (unit ? `예: ${unit}` : `${label} 값 입력`);
    return `
      <div class="form-group" style="margin-bottom:10px">
        <label class="form-label" style="font-size:12px">
          ${escHtml(label)}
          ${unit ? `<span style="color:#9ca3af;font-weight:400;margin-left:4px">(${escHtml(unit)})</span>` : ''}
        </label>
        <input type="text" class="form-control" data-attr-key="${escHtml(key)}"
               value="${escHtml(val)}"
               placeholder="${escHtml(ph)}">
      </div>`;
  }).join('');
}

async function saveSlot() {
  const recordId  = document.getElementById('slot-record-id').value;
  const codeVal   = document.getElementById('slot-code').value.trim();
  const packageId = document.getElementById('slot-package-id').value;
  const slotType  = document.getElementById('slot-type').value;
  const descRaw   = document.getElementById('slot-desc').value.trim();

  // 속성 필드값 수집
  const attrs = {};
  document.querySelectorAll('#slot-attr-fields [data-attr-key]').forEach(input => {
    const key = input.dataset.attrKey;
    const val = input.value.trim();
    if (val) attrs[key] = val;
  });

  const payload = {
    code:        codeVal || undefined,
    name:        document.getElementById('slot-name').value.trim(),
    package_id:  packageId || undefined,
    slot_type:   slotType,
    description: serializeSlotDesc(descRaw, attrs)
  };
  if (codeVal) payload.id = codeVal;

  if (!payload.name) { showToast('Slot명을 입력하세요', 'error'); return; }

  try {
    if (recordId) {
      const existing = State.slots.find(s => s.id === recordId);
      const merged   = { ...(existing||{}), ...payload };
      await API.put('slots', recordId, merged);
      await logChange('slot', recordId, payload.name, 'update', existing, merged);
      showToast('Slot이 수정되었습니다');
    } else {
      const res = await API.post('slots', payload);
      await logChange('slot', res.id, payload.name, 'create', null, payload);
      showToast('Slot이 추가되었습니다');
    }
    closeModal('slot-modal');
    // 패키지 상세에서 열었으면 상세 갱신
    if (State.currentPage === 'package-detail' && currentPackageId) {
      await loadAll();
      renderPackageDetail(currentPackageId);
    } else {
      await renderSlots();
    }
  } catch(e) { showToast('저장 실패: ' + e.message, 'error'); }
}

function editSlot(slotId) {
  const item = State.slots.find(s => s.id === slotId);
  if (!item) return;
  openSlotModal(item);
}

function deleteSlot(slotId, name) {
  const item = State.slots.find(s => s.id === slotId);
  if (!item) return;
  confirmDelete(`스펙 "${name}"을 삭제하시겠습니까?\n연결된 자재 정보도 함께 영향을 받습니다.`, async () => {
    try {
      await API.delete('slots', item.id);
      await logChange('slot', slotId, name, 'delete', item, null);
      showToast('Slot이 삭제되었습니다');
      renderSlots();
    } catch(e) { showToast('삭제 실패: ' + e.message, 'error'); }
  });
}

// 전역 스펙 관리 페이지에서 연결 새로고침 후 상세도 반영
async function refreshAfterSlotSave() {
  await loadAll();
  if (State.currentPage === 'package-detail' && currentPackageId) {
    renderPackageDetail(currentPackageId);
  } else {
    renderSlots();
  }
}

// ===================================================
// ===== 자재 DB =====
// ===================================================
let matFilterText = '', matFilterCategory = '', matFilterStatus = '';

async function renderMaterials() {
  await loadAll();
  renderMaterialTable();
}

function renderMaterialTable() {
  let data = [...State.materials];
  if (matFilterText) {
    const q = matFilterText.toLowerCase();
    data = data.filter(m =>
      (m.name||'').toLowerCase().includes(q) ||
      (m.code||'').toLowerCase().includes(q) ||
      (m.brand||'').toLowerCase().includes(q) ||
      (m.spec||'').toLowerCase().includes(q) ||
      (m.supplier||'').toLowerCase().includes(q)
    );
  }
  if (matFilterCategory) data = data.filter(m => m.category === matFilterCategory);
  if (matFilterStatus) {
    // 'inactive' 필터는 구버전 'discontinued' 값도 함께 포함
    data = data.filter(m =>
      matFilterStatus === 'inactive'
        ? (m.status === 'inactive' || m.status === 'discontinued')
        : m.status === matFilterStatus
    );
  }

  const tbody = document.getElementById('materials-tbody');
  if (data.length === 0) {
    tbody.innerHTML = State.materials.length === 0
      ? `<tr><td colspan="11"><div class="empty-state-action">
          <div class="esa-icon">🗃️</div>
          <div class="esa-title">등록된 자재가 없습니다</div>
          <div class="esa-desc"><strong>+ 자재 등록</strong> 버튼을 눌러 첫 번째 자재를 등록하세요.<br>자재 코드, 브랜드, 규격, 단가, 공급업체 등을 입력할 수 있습니다.</div>
          <button class="btn btn-primary" onclick="openMaterialModal()"><i class="fas fa-plus"></i> 자재 등록</button>
        </div></td></tr>`
      : `<tr><td colspan="11"><div class="empty-state"><div class="empty-icon">🔍</div><h3>검색 결과 없음</h3><p>검색어 또는 필터를 변경해보세요</p></div></td></tr>`;
    return;
  }

  // enum sort_order 기준 카테고리 순서 맵 생성
  const catOrder = {};
  State.enums
    .filter(e => e.group_key === 'material_type')
    .sort((a, b) => (a.sort_order||99) - (b.sort_order||99))
    .forEach((e, i) => { catOrder[e.value] = i; });

  // 카테고리 순서 → 자재명 순으로 정렬
  data.sort((a, b) => {
    const oa = catOrder[a.category||'기타'] ?? 999;
    const ob = catOrder[b.category||'기타'] ?? 999;
    if (oa !== ob) return oa - ob;
    return (a.name||'').localeCompare(b.name||'');
  });

  tbody.innerHTML = data.map(m => {
    const rowStyle = (m.status === 'inactive' || m.status === 'discontinued') ? 'background:#f9fafb;' : '';
    const imgThumb = m.image_url
      ? `<img src="${escHtml(m.image_url)}" class="mat-thumb" onclick="openImagePreview('${escHtml(m.image_url)}')" title="이미지 보기">`
      : `<div class="mat-thumb-empty"><i class="fas fa-image"></i></div>`;
    return `<tr style="${rowStyle}">
      <td>${categoryBadge(m.category||'기타')}</td>
      <td>${imgThumb}</td>
      <td><span class="font-mono">${escHtml(m.code||m.id)}</span></td>
      <td style="font-weight:500">
        ${(m.status==='inactive'||m.status==='discontinued') ? '<i class="fas fa-exclamation-circle" style="color:#9ca3af;margin-right:4px;font-size:11px"></i>' : ''}
        ${escHtml(m.name)}
      </td>
      <td style="font-size:12px;color:#6b7280">${escHtml(m.brand||'-')}</td>
      <td style="font-size:12px;color:#6b7280;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
          title="${escHtml(m.spec||'')}">
        ${escHtml(m.spec||'-')}
      </td>
      <td style="font-size:12px;color:#6b7280">${escHtml(m.unit||'-')}</td>
      <td class="price">${formatPrice(m.unit_price)}</td>
      <td style="font-size:12px;color:#6b7280">${escHtml(m.supplier||'-')}</td>
      <td>${statusBadge(m.status)}</td>
      <td>
        <div style="display:flex;gap:4px">
          <button class="btn btn-sm btn-secondary" onclick="editMaterial('${escHtml(m.id)}')">
            <i class="fas fa-edit"></i>
          </button>
          <button class="btn btn-sm btn-ghost" style="color:#e02424" onclick="deleteMaterial('${escHtml(m.id)}','${escHtml(m.name)}')">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function filterMaterials(val) { matFilterText = val; renderMaterialTable(); }
function filterMaterialsByCategory(val) { matFilterCategory = val; renderMaterialTable(); }
function filterMaterialsByStatus(val) { matFilterStatus = val; renderMaterialTable(); }

function openMaterialModal(data = null) {
  document.getElementById('material-modal-title').textContent = data ? '자재 수정' : '자재 등록';
  document.getElementById('material-record-id').value = data ? (data.id||'') : '';
  document.getElementById('mat-code').value = data ? (data.code||data.id||'') : '';
  document.getElementById('mat-name').value = data ? data.name : '';
  document.getElementById('mat-brand').value = data ? (data.brand||'') : '';
  document.getElementById('mat-spec').value = data ? (data.spec||'') : '';
  document.getElementById('mat-category').value = data ? (data.category||'구조재') : '구조재';
  document.getElementById('mat-unit').value = data ? (data.unit||'') : '';
  document.getElementById('mat-price').value = data ? (data.unit_price||0) : 0;
  document.getElementById('mat-supplier').value = data ? (data.supplier||'') : '';
  document.getElementById('mat-status').value = data ? (data.status||'active') : 'active';
  document.getElementById('mat-note').value = data ? (data.note||'') : '';

  // 이미지
  matImageDataUrl = data?.image_url || null;
  renderMatImagePreview();

  // 색상 초기화
  let colors = [];
  if (data?.colors) {
    try { colors = typeof data.colors === 'string' ? JSON.parse(data.colors) : data.colors; } catch(e) { colors = []; }
  }
  matColors = Array.isArray(colors) ? colors.map(c => ({ code: c.code||'', name: c.name||'', hex: c.hex||'' })) : [];
  renderMatColorList();

  // 성적서
  matReportFile = null;
  matReportFileName = data?.report_file_name || null;
  if (data?.report_file) { matReportFile = data.report_file; matReportFileName = data.report_file_name || '성적서 파일'; }
  renderMatFileArea('report');

  // 시방서
  matSpecDocFile = null;
  matSpecDocFileName = data?.spec_doc_file_name || null;
  if (data?.spec_doc_file) { matSpecDocFile = data.spec_doc_file; matSpecDocFileName = data.spec_doc_file_name || '시방서 파일'; }
  renderMatFileArea('specDoc');

  openModal('material-modal');
}

async function saveMaterial() {
  const recordId = document.getElementById('material-record-id').value;

  // 색상 직렬화
  const validColors = matColors.filter(c => c.code.trim() || c.name.trim());

  const payload = {
    id:                 document.getElementById('mat-code').value.trim(),
    code:               document.getElementById('mat-code').value.trim(),
    name:               document.getElementById('mat-name').value.trim(),
    brand:              document.getElementById('mat-brand').value.trim(),
    spec:               document.getElementById('mat-spec').value.trim(),
    category:           document.getElementById('mat-category').value,
    unit:               document.getElementById('mat-unit').value.trim(),
    unit_price:         parseFloat(document.getElementById('mat-price').value) || 0,
    supplier:           document.getElementById('mat-supplier').value.trim(),
    status:             document.getElementById('mat-status').value,
    note:               document.getElementById('mat-note').value.trim(),
    image_url:          matImageDataUrl || undefined,
    colors:             validColors.length > 0 ? JSON.stringify(validColors) : null,
    report_file:        matReportFile || undefined,
    report_file_name:   matReportFileName || undefined,
    spec_doc_file:      matSpecDocFile || undefined,
    spec_doc_file_name: matSpecDocFileName || undefined,
  };

  if (!payload.name) { showToast('자재명을 입력하세요', 'error'); return; }

  try {
    if (recordId) {
      const before = State.materials.find(m => m.id === recordId);
      await API.put('materials', recordId, payload);
      await logChange('material', payload.id, payload.name, 'update', before, payload, '자재 정보 수정');
      showToast('자재가 수정되었습니다');
    } else {
      const res = await API.post('materials', payload);
      await logChange('material', res.id, payload.name, 'create', null, payload, '신규 자재 등록');
      showToast('자재가 등록되었습니다');
    }
    closeModal('material-modal');
    await renderMaterials();
  } catch(e) { showToast('저장 실패: ' + e.message, 'error'); }
}

// ── 이미지 업로드 관련 ──
let matImageDataUrl = null;

function renderMatImagePreview() {
  const wrap    = document.getElementById('mat-image-preview-wrap');
  const clearBtn = document.getElementById('mat-image-clear-btn');
  if (!wrap) return;
  if (matImageDataUrl) {
    wrap.innerHTML = `<img src="${matImageDataUrl}" class="mat-image-preview" alt="자재 이미지">`;
    if (clearBtn) clearBtn.style.display = 'inline-flex';
  } else {
    wrap.innerHTML = `
      <div class="mat-image-placeholder">
        <i class="fas fa-image"></i>
        <span>클릭하거나 이미지를 드래그/붙여넣기(Ctrl+V)</span>
      </div>`;
    if (clearBtn) clearBtn.style.display = 'none';
  }
}

function clearMatImage() {
  matImageDataUrl = null;
  document.getElementById('mat-image-file').value = '';
  renderMatImagePreview();
}

function handleMatImageFile(input) {
  const file = input.files[0];
  if (!file || !file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = e => { matImageDataUrl = e.target.result; renderMatImagePreview(); };
  reader.readAsDataURL(file);
}

function handleMatImageDrop(event) {
  event.preventDefault();
  event.currentTarget.classList.remove('drag-over');
  const file = event.dataTransfer.files[0];
  if (!file || !file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = e => { matImageDataUrl = e.target.result; renderMatImagePreview(); };
  reader.readAsDataURL(file);
}

function handleMatImagePaste(event) {
  const items = event.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile();
      const reader = new FileReader();
      reader.onload = e => { matImageDataUrl = e.target.result; renderMatImagePreview(); };
      reader.readAsDataURL(file);
      break;
    }
  }
}

function openImagePreview(url) {
  document.getElementById('image-preview-img').src = url;
  openModal('image-preview-modal');
}

// ── 파일 첨부 (성적서 / 시방서) ──
let matReportFile = null;
let matReportFileName = null;
let matSpecDocFile = null;
let matSpecDocFileName = null;

const MAT_FILE_KEYS = {
  report:  { file: () => matReportFile,  name: () => matReportFileName,  setFile: v => { matReportFile = v; },   setName: v => { matReportFileName = v; } },
  specDoc: { file: () => matSpecDocFile, name: () => matSpecDocFileName, setFile: v => { matSpecDocFile = v; }, setName: v => { matSpecDocFileName = v; } }
};

function renderMatFileArea(key) {
  const k = MAT_FILE_KEYS[key];
  const nameEl  = document.getElementById(`mat-${key}-name`);
  const hintEl  = document.getElementById(`mat-${key}-hint`);
  const clearEl = document.getElementById(`mat-${key}-clear`);
  if (!nameEl) return;
  const fileName = k.name();
  if (fileName) {
    nameEl.textContent = fileName;
    nameEl.style.display = 'block';
    hintEl.style.display = 'none';
    if (clearEl) clearEl.style.display = 'flex';
  } else {
    nameEl.style.display = 'none';
    hintEl.style.display = 'block';
    if (clearEl) clearEl.style.display = 'none';
  }
}

function handleMatFileInput(input, key) {
  const file = input.files[0];
  if (!file) return;
  const k = MAT_FILE_KEYS[key];
  const reader = new FileReader();
  reader.onload = e => {
    k.setFile(e.target.result);
    k.setName(file.name);
    renderMatFileArea(key);
  };
  reader.readAsDataURL(file);
}

function handleMatFileDrop(event, key) {
  event.preventDefault();
  event.currentTarget.classList.remove('drag-over');
  const file = event.dataTransfer.files[0];
  if (!file) return;
  const k = MAT_FILE_KEYS[key];
  const reader = new FileReader();
  reader.onload = e => {
    k.setFile(e.target.result);
    k.setName(file.name);
    renderMatFileArea(key);
  };
  reader.readAsDataURL(file);
}

function clearMatFile(key) {
  const k = MAT_FILE_KEYS[key];
  k.setFile(null);
  k.setName(null);
  const inputEl = document.getElementById(`mat-${key}-file`);
  if (inputEl) inputEl.value = '';
  renderMatFileArea(key);
}

// ── 색상 다중 입력 ──
let matColors = []; // [{ code, name, hex }]

function renderMatColorList() {
  const container = document.getElementById('mat-color-list');
  if (!container) return;
  if (matColors.length === 0) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = matColors.map((c, i) => `
    <div class="mat-color-row" data-idx="${i}">
      <div class="mat-color-swatch" title="색상 선택">
        <span class="swatch-fill" style="background:${c.hex || '#e5e7eb'}"></span>
        <input type="color" value="${c.hex || '#ffffff'}"
               oninput="updateMatColorHex(${i}, this.value)">
      </div>
      <input type="text" class="form-control" placeholder="색상코드 (예: EJ10)"
             value="${escHtml(c.code)}"
             oninput="updateMatColor(${i},'code',this.value)"
             style="max-width:130px">
      <span class="mat-color-sep">/</span>
      <input type="text" class="form-control" placeholder="색상명 (예: 화이트)"
             value="${escHtml(c.name)}"
             oninput="updateMatColor(${i},'name',this.value)">
      <button type="button" class="mat-color-del" onclick="removeMatColor(${i})" title="삭제">
        <i class="fas fa-times"></i>
      </button>
    </div>`).join('');
}

function addMatColorRow() {
  matColors.push({ code: '', name: '', hex: '' });
  renderMatColorList();
  const rows = document.querySelectorAll('#mat-color-list .mat-color-row');
  if (rows.length > 0) {
    const last = rows[rows.length - 1];
    last.querySelector('input[type="text"]')?.focus();
  }
}

function removeMatColor(idx) {
  matColors.splice(idx, 1);
  renderMatColorList();
}

function updateMatColor(idx, field, value) {
  if (matColors[idx]) matColors[idx][field] = value;
}

function updateMatColorHex(idx, value) {
  if (matColors[idx]) {
    matColors[idx].hex = value;
    const rows = document.querySelectorAll('#mat-color-list .mat-color-row');
    const swatch = rows[idx]?.querySelector('.swatch-fill');
    if (swatch) swatch.style.background = value;
  }
}

// 색상 칩 렌더링 (자재 목록/상세 표시용)
function renderColorChips(colorsJson) {
  let colors = [];
  try { colors = typeof colorsJson === 'string' ? JSON.parse(colorsJson) : (colorsJson || []); } catch(e) { return ''; }
  if (!Array.isArray(colors) || colors.length === 0) return '';
  return `<div class="mat-color-chips">${
    colors.map(c => `
      <span class="mat-color-chip">
        <span class="chip-dot" style="background:${escHtml(c.hex||'#e5e7eb')}"></span>
        ${c.code ? escHtml(c.code) : ''}${c.code && c.name ? ' / ' : ''}${c.name ? escHtml(c.name) : ''}
      </span>`).join('')
  }</div>`;
}

function editMaterial(matId) {
  const item = State.materials.find(m => m.id === matId);
  if (!item) return;
  openMaterialModal(item);
}

function quickReplaceMaterial(matId) {
  const item = State.materials.find(m => m.id === matId);
  if (!item) return;
  showToast(`"${item.name}" — 자재 교체: 새 자재를 등록 후 스펙-자재 연결에서 교체하세요`, 'warning');
  navigate('materials');
}

function deleteMaterial(matId, name) {
  const item = State.materials.find(m => m.id === matId);
  if (!item) return;
  // 연결된 스펙 확인
  const linked = State.slotMaterials.filter(sm => sm.material_id === matId);
  const linkedMsg = linked.length > 0 ? `\n⚠️ ${linked.length}개 스펙에 연결되어 있습니다!` : '';
  confirmDelete(`자재 "${name}"을 삭제하시겠습니까?${linkedMsg}`, async () => {
    try {
      await API.delete('materials', item.id);
      await logChange('material', matId, name, 'delete', item, null, '자재 삭제');
      showToast('자재가 삭제되었습니다');
      renderMaterials();
    } catch(e) { showToast('삭제 실패: ' + e.message, 'error'); }
  });
}

// ===================================================
// ===== 스펙-자재 연결 =====
// ===================================================
async function renderSlotMaterials() {
  await loadAll();
  const container = document.getElementById('slot-materials-container');
  if (!container) return;

  // ── ① 비활성화 자재 연결 목록 ──
  const discItems = State.slotMaterials
    .filter(sm => { const s = State.materials.find(m => m.id === sm.material_id)?.status; return s === 'inactive' || s === 'discontinued'; })
    .map(sm => ({
      sm,
      slot:    State.slots.find(s => s.id === sm.slot_id),
      mat:     State.materials.find(m => m.id === sm.material_id),
    }));

  // ── ② 미연결 스펙 목록 ──
  const unlinkedItems = State.slots
    .filter(sl => !State.slotMaterials.some(sm => sm.slot_id === sl.id))
    .map(sl => ({
      sl,
      setType: State.packages.find(st => st.id === sl.package_id),
    }));

  // ────────────────────────────────
  // 표 ① : 비활성화 자재 연결
  // ────────────────────────────────
  let discRows;
  if (discItems.length > 0) {
    discRows = discItems.map(({ sm, slot, mat }) => {
      const setType = slot ? State.packages.find(st => st.id === slot.package_id) : null;
      return `
        <tr>
          <td>${slot ? categoryBadge(slot.slot_type || '기타') : ''}</td>
          <td>
            <div class="sml-name">${escHtml(slot?.name || '—')}</div>
            ${setType ? `<div class="sml-sub">${escHtml(setType.name)}</div>` : ''}
          </td>
          <td>
            <div class="sml-name sml-name--disc">
              <i class="fas fa-exclamation-circle"></i>${escHtml(mat?.name || '—')}
            </div>
            ${mat?.supplier ? `<div class="sml-sub">${escHtml(mat.supplier)}</div>` : ''}
          </td>
          <td>
            <div class="sml-actions">
              <button class="btn btn-sm btn-primary"
                onclick="openSlotMatQuickModal('${escHtml(slot?.id || '')}')">
                <i class="fas fa-exchange-alt"></i> 자재 변경
              </button>
            </div>
          </td>
        </tr>`;
    }).join('');
  } else {
    discRows = `
      <tr>
        <td colspan="4">
          <div class="sml-empty"><i class="fas fa-check-circle" style="color:#22c55e;margin-right:6px"></i>비활성화 자재가 연결된 스펙이 없습니다</div>
        </td>
      </tr>`;
  }

  // ────────────────────────────────
  // 표 ② : 미연결 스펙
  // ────────────────────────────────
  let unlinkedRows;
  if (unlinkedItems.length > 0) {
    unlinkedRows = unlinkedItems.map(({ sl, setType }) => `
      <tr>
        <td>${categoryBadge(sl.slot_type || '기타')}</td>
        <td>
          <div class="sml-name">${escHtml(sl.name)}</div>
          ${setType ? `<div class="sml-sub">${escHtml(setType.name)}</div>` : ''}
        </td>
        <td>
          <button class="btn btn-sm btn-primary"
            onclick="openSlotMatQuickModal('${escHtml(sl.id)}')">
            <i class="fas fa-link"></i> 자재 연결
          </button>
        </td>
      </tr>`).join('');
  } else {
    unlinkedRows = `
      <tr>
        <td colspan="3">
          <div class="sml-empty"><i class="fas fa-check-circle" style="color:#22c55e;margin-right:6px"></i>자재가 미연결된 스펙이 없습니다</div>
        </td>
      </tr>`;
  }

  container.innerHTML = `
    <div class="sml-block sml-block--disc">
      <div class="sml-block-header">
        <span class="sml-block-icon sml-block-icon--disc"><i class="fas fa-ban"></i></span>
        <div>
          <div class="sml-block-title">비활성화된 자재 연결됨</div>
          <div class="sml-block-desc">연결된 자재를 변경해 주세요</div>
        </div>
        <span class="sml-block-badge sml-block-badge--disc">${discItems.length}건</span>
      </div>
      <div class="table-wrapper" style="margin:0;border-radius:0 0 10px 10px;border-top:none">
        <table>
          <colgroup>
            <col style="width:80px">
            <col style="width:auto">
            <col style="width:auto">
            <col style="width:110px">
          </colgroup>
          <thead>
            <tr><th>유형</th><th>스펙</th><th>연결된 비활성화 자재</th><th>관리</th></tr>
          </thead>
          <tbody>${discRows}</tbody>
        </table>
      </div>
    </div>

    <div class="sml-block sml-block--unlinked" style="margin-top:20px">
      <div class="sml-block-header">
        <span class="sml-block-icon sml-block-icon--unlinked"><i class="fas fa-unlink"></i></span>
        <div>
          <div class="sml-block-title">자재 미연결</div>
          <div class="sml-block-desc">아직 자재가 연결되지 않은 스펙입니다</div>
        </div>
        <span class="sml-block-badge sml-block-badge--unlinked">${unlinkedItems.length}건</span>
      </div>
      <div class="table-wrapper" style="margin:0;border-radius:0 0 10px 10px;border-top:none">
        <table>
          <colgroup>
            <col style="width:80px">
            <col style="width:auto">
            <col style="width:120px">
          </colgroup>
          <thead>
            <tr><th>유형</th><th>스펙</th><th>연결</th></tr>
          </thead>
          <tbody>${unlinkedRows}</tbody>
        </table>
      </div>
    </div>`;
}

function openSlotMaterialModal(data = null) {
  document.getElementById('sm-record-id').value = data ? (data.id||'') : '';

  const slotSel = document.getElementById('sm-slot');
  slotSel.innerHTML = State.slots.map(s =>
    `<option value="${escHtml(s.id)}" ${data?.slot_id===s.id?'selected':''}>${escHtml(s.name)} (${escHtml(s.code||s.id)})</option>`
  ).join('');

  const matSel = document.getElementById('sm-material');
  matSel.innerHTML = State.materials.map(m =>
    `<option value="${escHtml(m.id)}" ${data?.material_id===m.id?'selected':''}>${escHtml(m.name)} [${escHtml(m.code||m.id)}]${(m.status==='inactive'||m.status==='discontinued')?' ⛔':''}</option>`
  ).join('');

  document.getElementById('sm-note').value = data ? (data.note||'') : '';
  openModal('slot-material-modal');
}

async function saveSlotMaterial() {
  const recordId = document.getElementById('sm-record-id').value;
  const payload = {
    slot_id:     document.getElementById('sm-slot').value,
    material_id: document.getElementById('sm-material').value,
    is_default:  true,
    note:        document.getElementById('sm-note').value.trim()
  };

  try {
    if (recordId) {
      await API.put('slot_materials', recordId, payload);
      await logChange('slot_material', recordId, `${payload.slot_id} ↔ ${payload.material_id}`, 'update', null, payload, '자재 연결 수정');
      showToast('연결이 수정되었습니다');
    } else {
      const res = await API.post('slot_materials', payload);
      await logChange('slot_material', res.id, `${payload.slot_id} ↔ ${payload.material_id}`, 'replace', null, payload, '자재 연결');
      showToast('연결이 추가되었습니다');
    }
    closeModal('slot-material-modal');
    await renderSlotMaterials();
  } catch(e) { showToast('저장 실패: ' + e.message, 'error'); }
}

function editSlotMaterial(smId) {
  const item = State.slotMaterials.find(sm => sm.id === smId);
  if (!item) return;
  openSlotMaterialModal(item);
}

function deleteSlotMaterial(smId) {
  const item = State.slotMaterials.find(sm => sm.id === smId);
  if (!item) return;
  const slot = State.slots.find(s => s.id === item.slot_id);
  const mat = State.materials.find(m => m.id === item.material_id);
  confirmDelete(`스펙 "${slot?.name||item.slot_id}" ↔ 자재 "${mat?.name||item.material_id}" 연결을 삭제하시겠습니까?`, async () => {
    try {
      await API.delete('slot_materials', item.id);
      await logChange('slot_material', smId, `${item.slot_id} ↔ ${item.material_id}`, 'delete', item, null, '자재 연결 해제');
      showToast('연결이 삭제되었습니다');
      renderSlotMaterials();
    } catch(e) { showToast('삭제 실패: ' + e.message, 'error'); }
  });
}

// ===================================================
// ===== 변형(Variant) 관리 =====
// ===================================================
async function renderVariants() {
  await loadAll();

  // 플랫폼 선택 옵션
  const lineupSel = document.getElementById('variant-lineup');
  if (lineupSel.options.length <= 0) {
    State.lineups.forEach(l => {
      const opt = document.createElement('option');
      opt.value = l.id;
      opt.textContent = l.name;
      lineupSel.appendChild(opt);
    });
  }

  const tbody = document.getElementById('variants-tbody');
  if (State.variants.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state-action">
      <div class="esa-icon">🌿</div>
      <div class="esa-title">등록된 변형 조건이 없습니다</div>
      <div class="esa-desc">단열지역, 규모 등 조건에 따라 다른 자재를 사용하는 경우 변형을 등록하세요.<br>변형 없이도 기본 자재 연결만으로 운영 가능합니다.</div>
      <button class="btn btn-primary" onclick="openVariantModal()"><i class="fas fa-plus"></i> 변형 추가</button>
    </div></td></tr>`;
    return;
  }

  tbody.innerHTML = State.variants.map(v => {
    const lineup = State.lineups.find(l => l.id === v.lineup_id);
    return `<tr>
      <td>
        ${lineup
          ? brandBadge(lineup.brand, lineup.name)
          : `<span class="badge badge-gray">${escHtml(v.lineup_id)}</span>`}
      </td>
      <td><span class="font-mono">${escHtml(v.variant_key||'-')}</span></td>
      <td style="font-weight:500">${escHtml(v.variant_label||'-')}</td>
      <td><span class="variant-tag">${escHtml(v.variant_value||'-')}</span></td>
      <td style="font-size:12px;color:#6b7280">${escHtml(v.description||'-')}</td>
      <td>
        <div style="display:flex;gap:4px">
          <button class="btn btn-sm btn-secondary" onclick="editVariant('${escHtml(v.id)}')">
            <i class="fas fa-edit"></i>
          </button>
          <button class="btn btn-sm btn-ghost" style="color:#e02424" onclick="deleteVariant('${escHtml(v.id)}')">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function openVariantModal(data = null) {
  document.getElementById('variant-record-id').value = data ? (data.id||'') : '';
  const lineupSel = document.getElementById('variant-lineup');
  if (data) lineupSel.value = data.lineup_id;
  document.getElementById('variant-key').value = data ? (data.variant_key||'') : '';
  document.getElementById('variant-label').value = data ? (data.variant_label||'') : '';
  document.getElementById('variant-value').value = data ? (data.variant_value||'') : '';
  document.getElementById('variant-desc').value = data ? (data.description||'') : '';
  openModal('variant-modal');
}

async function saveVariant() {
  const recordId = document.getElementById('variant-record-id').value;
  const payload = {
    lineup_id: document.getElementById('variant-lineup').value,
    variant_key: document.getElementById('variant-key').value.trim(),
    variant_label: document.getElementById('variant-label').value.trim(),
    variant_value: document.getElementById('variant-value').value.trim(),
    description: document.getElementById('variant-desc').value.trim()
  };

  if (!payload.variant_key) { showToast('변형 키를 입력하세요', 'error'); return; }

  try {
    if (recordId) {
      const _beforeVar = State.variants.find(v => v.id === recordId);
      await API.put('variants', recordId, payload);
      await logChange('variant', recordId, payload.variant_label || payload.variant_key, 'update', _beforeVar, payload);
      showToast('변형이 수정되었습니다');
    } else {
      const res = await API.post('variants', payload);
      await logChange('variant', res.id, payload.variant_label || payload.variant_key, 'create', null, payload);
      showToast('변형이 추가되었습니다');
    }
    closeModal('variant-modal');
    await renderVariants();
  } catch(e) { showToast('저장 실패: ' + e.message, 'error'); }
}

function editVariant(vId) {
  const item = State.variants.find(v => v.id === vId);
  if (!item) return;
  openVariantModal(item);
}

function deleteVariant(vId) {
  const item = State.variants.find(v => v.id === vId);
  if (!item) return;
  confirmDelete(`변형 "${item.variant_label||item.variant_key}"을 삭제하시겠습니까?`, async () => {
    try {
      await API.delete('variants', item.id);
      showToast('변형이 삭제되었습니다');
      renderVariants();
    } catch(e) { showToast('삭제 실패: ' + e.message, 'error'); }
  });
}

// ===================================================
// ===== 동적 Select 채우기 =====
// ===================================================

/** loadAll() 이후 호출 — enum 데이터로 모든 select 동적 채우기 */
function _populateDynamicSelects() {
  const byGroup = (key) =>
    State.enums
      .filter(e => e.group_key === key)
      .sort((a, b) => (a.sort_order||99) - (b.sort_order||99));

  // 헬퍼: <select id>에 옵션 주입 (현재 값 유지, allLabel 있으면 첫 줄 추가)
  function fillSelect(id, items, { allLabel = '', valueFn = e => e.value, labelFn = e => e.label || e.value } = {}) {
    const sel = document.getElementById(id);
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML =
      (allLabel ? `<option value="">${allLabel}</option>` : '') +
      items.map(e => `<option value="${escHtml(valueFn(e))}">${escHtml(labelFn(e))}</option>`).join('');
    if (cur) sel.value = cur;  // 편집 모달 재오픈 시 값 복원
  }

  // 스펙 유형 + 자재 카테고리 — 동일 그룹 'material_type' 공유
  fillSelect('slot-type',        byGroup('material_type'));
  fillSelect('slot-type-filter', byGroup('material_type'), { allLabel: '전체 유형' });
  fillSelect('mat-category',     byGroup('material_type'));

  // 플랫폼 브랜드
  fillSelect('lineup-brand', byGroup('lineup_brand'));

  // 필터용 브랜드 (플랫폼 목록 필터바)
  const brandFilter = document.getElementById('lineup-brand-filter');
  if (brandFilter) {
    fillSelect('lineup-brand-filter', byGroup('lineup_brand'), { allLabel: '전체 브랜드' });
  }

  // 상태 selects — DB enum 미사용, 시스템 고정값 직접 주입
  const STATUS_OPTS = [
    { value: 'active',   label: '활성화' },
    { value: 'inactive', label: '비활성화' },
  ];
  ['lineup-status', 'grade-status', 'mat-status'].forEach(id => {
    fillSelect(id, STATUS_OPTS);
  });
}

// ===================================================
// ===== 선택지(Enum) 관리 페이지 =====
// ===================================================

const ENUM_GROUP_META = {
  material_type:   { label: '자재·스펙 유형',   icon: 'fa-layer-group',  editable: true,  desc: '스펙 유형 + 자재 카테고리 공용 — 같은 유형끼리만 연결 가능' },
  lineup_status:   { label: '플랫폼 상태',      icon: 'fa-toggle-on',    editable: false, desc: '시스템 고정값 — 변경 불가' },
  set_status:      { label: '패키지 상태',      icon: 'fa-tag',          editable: false, desc: '시스템 고정값 — 변경 불가' },
  material_status: { label: '자재 상태',        icon: 'fa-database',     editable: false, desc: '시스템 고정값 — 변경 불가' },
};

// 현재 선택된 유형 value (좌측 패널 선택 상태)
let _selectedTypeValue = null;

function renderEnumsPage() {
  const container = document.getElementById('enums-container');
  if (!container) return;

  const types = (State.enums || [])
    .filter(e => e.group_key === 'material_type')
    .sort((a, b) => (a.sort_order || 99) - (b.sort_order || 99));

  // 선택값 초기화: 없으면 첫 번째 유형
  if (!_selectedTypeValue && types.length > 0) {
    _selectedTypeValue = types[0].value;
  }

  container.innerHTML = `
    <div class="tm-layout">

      <!-- 좌측: 유형 목록 패널 -->
      <div class="tm-sidebar">
        <div class="tm-sidebar-header">
          <span class="tm-sidebar-title">유형 목록</span>
          <span class="badge badge-gray">${types.length}</span>
        </div>
        <div class="tm-type-list" id="tm-type-list">
          ${types.length === 0
            ? `<div class="tm-type-empty">유형이 없습니다.<br><span style="font-size:11px">상단 <strong>유형 추가</strong> 버튼으로 추가하세요.</span></div>`
            : types.map(e => {
                const attrCount = getAttrDefs(e.value).length;
                const isActive = e.value === _selectedTypeValue;
                const dot = e.color && e.color !== '#6b7280'
                  ? `<span class="tm-type-dot" style="background:${escHtml(e.color)}"></span>`
                  : `<span class="tm-type-dot" style="background:#e5e7eb"></span>`;
                return `
                  <div class="tm-type-item ${isActive ? 'tm-type-item--active' : ''}"
                       data-id="${escHtml(e.id)}"
                       data-value="${escHtml(e.value)}"
                       onclick="_selectType('${escHtml(e.value)}')">
                    <span class="tm-type-drag" title="드래그하여 순서 변경"><i class="fas fa-grip-vertical"></i></span>
                    ${dot}
                    <span class="tm-type-name">${escHtml(e.label || e.value)}</span>
                    <span class="tm-type-attr-count" title="속성 ${attrCount}개">${attrCount}</span>
                    <div class="tm-type-actions">
                      <button class="tm-icon-btn" onclick="event.stopPropagation();openEnumEditModal('${escHtml(e.id)}')" title="수정"><i class="fas fa-pen"></i></button>
                      <button class="tm-icon-btn tm-icon-btn--del" onclick="event.stopPropagation();deleteEnum('${escHtml(e.id)}','${escHtml(e.label||e.value)}')" title="삭제"><i class="fas fa-trash"></i></button>
                    </div>
                  </div>`;
              }).join('')}
        </div>

        <!-- 시스템 고정값 접기/펼치기 -->
        <div class="tm-sys-section">
          <button class="tm-sys-toggle" onclick="_toggleSysSection(this)">
            <i class="fas fa-lock" style="font-size:10px;margin-right:5px"></i>
            시스템 고정값
            <i class="fas fa-chevron-down" style="margin-left:auto;font-size:10px"></i>
          </button>
          <div class="tm-sys-body" style="display:none">
            ${Object.entries(ENUM_GROUP_META).filter(([,m]) => !m.editable).map(([key, meta]) => {
              const items = (State.enums || []).filter(e => e.group_key === key).sort((a,b)=>(a.sort_order||99)-(b.sort_order||99));
              return `
                <div class="tm-sys-group">
                  <div class="tm-sys-group-label"><i class="fas ${meta.icon}"></i> ${escHtml(meta.label)}</div>
                  ${items.map(e => `
                    <div class="tm-sys-item">
                      <span class="tm-sys-dot" style="background:${escHtml(e.color||'#e5e7eb')}"></span>
                      <span>${escHtml(e.label||e.value)}</span>
                    </div>`).join('')}
                </div>`;
            }).join('')}
          </div>
        </div>
      </div>

      <!-- 우측: 속성 상세 패널 -->
      <div class="tm-detail" id="tm-detail">
        ${_renderTypeDetail(_selectedTypeValue)}
      </div>

    </div>`;

  // 유형 목록 DnD 정렬
  if (types.length >= 2) {
    const list = container.querySelector('#tm-type-list');
    makeSortable(list, {
      itemSelector: '.tm-type-item[data-id]',
      handleSelector: '.tm-type-drag',
      getId: el => el.dataset.id,
      onReorder: async (orderedIds) => {
        await Promise.all(orderedIds.map((id, i) => {
          const e = State.enums.find(x => x.id === id);
          if (!e) return Promise.resolve();
          return API.put('enums', id, { ...e, sort_order: i + 1 });
        }));
        await loadAll();
        _populateDynamicSelects();
        renderEnumsPage();
      }
    });
  }
}

function _toggleSysSection(btn) {
  const body = btn.nextElementSibling;
  const icon = btn.querySelector('.fa-chevron-down, .fa-chevron-up');
  const open = body.style.display !== 'none';
  body.style.display = open ? 'none' : 'block';
  if (icon) icon.className = open ? 'fas fa-chevron-down' : 'fas fa-chevron-up';
}

function _selectType(typeValue) {
  _selectedTypeValue = typeValue;

  // 좌측 active 클래스 토글
  document.querySelectorAll('.tm-type-item').forEach(el => {
    el.classList.toggle('tm-type-item--active', el.dataset.value === typeValue);
  });

  // 우측 패널만 교체
  const detail = document.getElementById('tm-detail');
  if (detail) detail.innerHTML = _renderTypeDetail(typeValue);

  // 속성 목록 DnD 재설정
  _setupAttrListDnD(typeValue);
}

/** 우측 상세 패널 HTML 생성 */
function _renderTypeDetail(typeValue) {
  if (!typeValue) {
    return `<div class="tm-detail-empty"><i class="fas fa-arrow-left"></i><br>왼쪽에서 유형을 선택하세요</div>`;
  }

  const typeEnum = State.enums.find(e => e.group_key === 'material_type' && e.value === typeValue);
  if (!typeEnum) {
    return `<div class="tm-detail-empty">유형을 찾을 수 없습니다</div>`;
  }

  const attrDefs = getAttrDefs(typeValue);
  const color    = typeEnum.color && typeEnum.color !== '#6b7280' ? typeEnum.color : '#6b7280';
  const slotCount    = State.slots.filter(s => s.slot_type === typeValue).length;
  const materialCount= State.materials.filter(m => m.category === typeValue).length;

  return `
    <!-- 상세 헤더 -->
    <div class="tm-detail-header">
      <div class="tm-detail-header-left">
        <span class="tm-detail-color-bar" style="background:${escHtml(color)}"></span>
        <div>
          <div class="tm-detail-title">${escHtml(typeEnum.label || typeEnum.value)}</div>
          <div class="tm-detail-meta">
            <span><i class="fas fa-puzzle-piece"></i> 스펙 ${slotCount}개</span>
            <span><i class="fas fa-box"></i> 자재 ${materialCount}개</span>
          </div>
        </div>
      </div>
      <div class="tm-detail-header-actions">
        <button class="btn btn-secondary btn-sm" onclick="openEnumEditModal('${escHtml(typeEnum.id)}')">
          <i class="fas fa-pen"></i> 유형 수정
        </button>
      </div>
    </div>

    <!-- 속성 정의 섹션 -->
    <div class="tm-attr-section">
      <div class="tm-attr-section-header">
        <div class="tm-attr-section-title">
          <i class="fas fa-sliders-h"></i> 속성 항목
          <span class="tm-attr-count-badge">${attrDefs.length}</span>
        </div>
        <button class="btn btn-sm btn-primary" onclick="openAttrDefAddModal('${escHtml(typeValue)}','${escHtml(typeEnum.label||typeEnum.value)}')">
          <i class="fas fa-plus"></i> 속성 추가
        </button>
      </div>
      <p class="tm-attr-desc">이 유형의 스펙을 추가할 때 입력해야 할 항목들을 정의합니다.<br>예) 단열재 → 열관류율(W/m²K), 두께(mm)</p>

      ${attrDefs.length === 0
        ? `<div class="tm-attr-empty">
             <i class="fas fa-inbox"></i>
             <div>아직 속성 항목이 없습니다</div>
             <div style="font-size:12px;color:#9ca3af;margin-top:4px">속성 추가 버튼으로 첫 번째 항목을 만들어보세요</div>
           </div>`
        : `<div class="tm-attr-list" id="tm-attr-list-${escHtml(typeValue)}">
             ${attrDefs.map((def, idx) => `
               <div class="tm-attr-row" data-id="${escHtml(def.id)}">
                 <span class="tm-attr-drag" title="드래그하여 순서 변경"><i class="fas fa-grip-vertical"></i></span>
                 <div class="tm-attr-index">${idx + 1}</div>
                 <div class="tm-attr-body">
                   <div class="tm-attr-name">${escHtml(def.label || def.value)}</div>
                   <div class="tm-attr-sub">
                     ${(()=>{ const {unit,hint}=_parseAttrUnit(def.color); return (unit?`<span class="tm-attr-unit"><i class="fas fa-ruler"></i> ${escHtml(unit)}</span>`:'')+(hint?`<span class="tm-attr-key" style="font-style:italic"><i class="fas fa-comment-dots"></i> ${escHtml(hint)}</span>`:''); })()}
                     ${def.value && def.value !== (def.label||'') ? `<span class="tm-attr-key"><i class="fas fa-key"></i> ${escHtml(def.value)}</span>` : ''}
                   </div>
                 </div>
                 <div class="tm-attr-actions">
                   <button class="btn btn-sm btn-secondary" onclick="openAttrDefEditModal('${escHtml(def.id)}')">
                     <i class="fas fa-pen"></i> 수정
                   </button>
                   <button class="btn btn-sm btn-ghost" style="color:var(--danger)" onclick="deleteAttrDef('${escHtml(def.id)}','${escHtml(def.label||def.value)}')">
                     <i class="fas fa-trash"></i>
                   </button>
                 </div>
               </div>`).join('')}
           </div>`}
    </div>`;
}

/** 속성 목록 DnD 설정 */
function _setupAttrListDnD(typeValue) {
  const listId = `tm-attr-list-${typeValue}`;
  const list = document.getElementById(listId);
  if (!list) return;
  const rows = list.querySelectorAll('.tm-attr-row[data-id]');
  if (rows.length < 2) return;

  makeSortable(list, {
    itemSelector: '.tm-attr-row[data-id]',
    handleSelector: '.tm-attr-drag',
    getId: el => el.dataset.id,
    onReorder: async (orderedIds) => {
      await Promise.all(orderedIds.map((id, i) => {
        const e = State.enums.find(x => x.id === id);
        if (!e) return Promise.resolve();
        return API.put('enums', id, { ...e, sort_order: i + 1 });
      }));
      await loadAll();
      // 우측 패널만 재렌더 (선택 상태 유지)
      const detail = document.getElementById('tm-detail');
      if (detail) detail.innerHTML = _renderTypeDetail(typeValue);
      _setupAttrListDnD(typeValue);
    }
  });
}

function _renderEnumItem(e, editable, attrDefs = []) {
  const colorDot = e.color
    ? `<span class="enum-color-dot" style="background:${escHtml(e.color)}"></span>`
    : `<span class="enum-color-dot" style="background:#e5e7eb"></span>`;

  // 속성 정의 섹션 (material_type 그룹에만 표시)
  const hasAttrSection = Array.isArray(attrDefs);
  const attrSection = hasAttrSection ? `
    <div class="enum-attr-section" style="display:none">
      <div class="enum-attr-header">
        <span class="enum-attr-header-label"><i class="fas fa-list-ul"></i> 속성 항목 <span class="badge badge-gray" style="font-size:10px">${attrDefs.length}</span></span>
        <button class="btn btn-xs btn-secondary" onclick="openAttrDefAddModal('${escHtml(e.value)}','${escHtml(e.label||e.value)}')" title="속성 추가">
          <i class="fas fa-plus"></i> 속성 추가
        </button>
      </div>
      <div class="enum-attr-list" data-slot-type="${escHtml(e.value)}">
        ${attrDefs.length === 0
          ? `<div class="enum-attr-empty">아직 속성이 없습니다. <strong>속성 추가</strong>로 항목을 정의하세요.</div>`
          : attrDefs.map(def => `
              <div class="enum-attr-def-row" data-attr-id="${escHtml(def.id)}">
                <span class="enum-attr-def-name">${escHtml(def.label || def.value)}</span>
                ${(()=>{ const {unit,hint}=_parseAttrUnit(def.color); return (unit?`<span class="enum-attr-def-unit">${escHtml(unit)}</span>`:'')+( hint?`<span class="enum-attr-def-unit" style="color:#9ca3af;font-style:italic">${escHtml(hint)}</span>`:''); })()}
                ${def.value && def.value !== (def.label||'') ? `<span class="enum-attr-def-key">${escHtml(def.value)}</span>` : ''}
                <span style="flex:1"></span>
                <button class="enum-action-btn" onclick="openAttrDefEditModal('${escHtml(def.id)}')" title="수정"><i class="fas fa-pen"></i></button>
                <button class="enum-action-btn enum-action-btn--del" onclick="deleteAttrDef('${escHtml(def.id)}','${escHtml(def.label||def.value)}')" title="삭제"><i class="fas fa-trash"></i></button>
              </div>`).join('')}
      </div>
    </div>` : '';

  return `
    <div class="enum-item-row" data-id="${escHtml(e.id)}" draggable="${editable}">
      <div class="enum-item-main">
        ${editable
          ? `<span class="enum-drag-handle" title="드래그하여 순서 변경"><i class="fas fa-grip-vertical"></i></span>`
          : `<span style="width:16px;display:inline-block"></span>`}
        ${colorDot}
        <span class="enum-item-value">${escHtml(e.label || e.value)}</span>
        ${e.label && e.label !== e.value
          ? `<span class="enum-item-code">${escHtml(e.value)}</span>`
          : ''}
        <span class="enum-item-spacer"></span>
        ${hasAttrSection ? `
          <button class="enum-attr-toggle-btn" title="속성 정의 펼치기/접기">
            <i class="fas fa-chevron-down"></i>
            <span style="font-size:11px;margin-left:3px">속성 정의</span>
            ${attrDefs.length > 0 ? `<span class="enum-attr-count-badge">${attrDefs.length}</span>` : ''}
          </button>` : ''}
        ${editable ? `
          <button class="enum-action-btn" onclick="openEnumEditModal('${escHtml(e.id)}')" title="수정">
            <i class="fas fa-pen"></i>
          </button>
          <button class="enum-action-btn enum-action-btn--del" onclick="deleteEnum('${escHtml(e.id)}','${escHtml(e.label||e.value)}')" title="삭제">
            <i class="fas fa-trash"></i>
          </button>` : `
          <span class="enum-system-badge">시스템</span>`}
      </div>
      ${attrSection}
    </div>`;
}

// ── enum-items-list DnD 정렬 설정 ──
function _setupEnumListDnD(listEl) {
  let dragSrc = null;

  listEl.addEventListener('dragstart', e => {
    const row = e.target.closest('.enum-item-row[draggable="true"]');
    if (!row) return;
    dragSrc = row;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', row.dataset.id);
    setTimeout(() => row.classList.add('enum-item-dragging'), 0);
  });

  listEl.addEventListener('dragend', () => {
    if (dragSrc) dragSrc.classList.remove('enum-item-dragging');
    listEl.querySelectorAll('.enum-item-row').forEach(r => r.classList.remove('enum-item-drag-over'));
    dragSrc = null;
  });

  listEl.addEventListener('dragover', e => {
    if (!dragSrc) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const target = e.target.closest('.enum-item-row');
    if (!target || target === dragSrc) return;
    listEl.querySelectorAll('.enum-item-row').forEach(r => r.classList.remove('enum-item-drag-over'));
    // 마우스 위치에 따라 위/아래 표시
    const rect = target.getBoundingClientRect();
    const mid  = rect.top + rect.height / 2;
    target.classList.add('enum-item-drag-over');
    target.dataset.dropPos = e.clientY < mid ? 'before' : 'after';
  });

  listEl.addEventListener('dragleave', e => {
    const row = e.target.closest('.enum-item-row');
    if (row && !listEl.contains(e.relatedTarget)) row.classList.remove('enum-item-drag-over');
  });

  listEl.addEventListener('drop', async e => {
    e.preventDefault();
    if (!dragSrc) return;
    const target = listEl.querySelector('.enum-item-row.enum-item-drag-over');
    if (target && target !== dragSrc) {
      const pos = target.dataset.dropPos;
      if (pos === 'before') {
        listEl.insertBefore(dragSrc, target);
      } else {
        listEl.insertBefore(dragSrc, target.nextSibling);
      }
    }
    listEl.querySelectorAll('.enum-item-row').forEach(r => r.classList.remove('enum-item-drag-over'));
    dragSrc.classList.remove('enum-item-dragging');
    dragSrc = null;

    // DOM 순서대로 sort_order 재계산 → API 일괄 저장
    await _saveEnumOrder(listEl);
  });
}

async function _saveEnumOrder(listEl) {
  const rows = [...listEl.querySelectorAll('.enum-item-row[data-id]')];
  // 저장 중 피드백
  listEl.style.opacity = '0.6';
  try {
    await Promise.all(rows.map((row, idx) => {
      const e = State.enums.find(x => x.id === row.dataset.id);
      if (!e) return Promise.resolve();
      return API.put('enums', e.id, { ...e, sort_order: idx + 1 });
    }));
    // State 갱신 (재렌더 없이 메모리만)
    rows.forEach((row, idx) => {
      const e = State.enums.find(x => x.id === row.dataset.id);
      if (e) e.sort_order = idx + 1;
    });
    // 동적 select도 갱신
    _populateDynamicSelects();
    // 자재 테이블 정렬도 갱신
    if (State.currentPage === 'materials') renderMaterialTable();
  } catch(err) {
    showToast('순서 저장 실패: ' + err.message, 'error');
  } finally {
    listEl.style.opacity = '';
  }
}

// ── 추가 모달 ──
function openEnumAddModal(groupKey, groupLabel) {
  _openEnumModal({ group_key: groupKey, group_label: groupLabel }, false);
}

// ── 수정 모달 ──
function openEnumEditModal(enumId) {
  const e = State.enums.find(x => x.id === enumId);
  if (!e) return;
  const meta = ENUM_GROUP_META[e.group_key];
  _openEnumModal(e, true);
}

function _openEnumModal(data, isEdit) {
  // 모달이 없으면 동적 생성
  let modal = document.getElementById('enum-edit-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'enum-edit-modal';
    modal.innerHTML = `
      <div class="modal" style="max-width:400px">
        <div class="modal-header">
          <span class="modal-title" id="enum-modal-title">선택지 추가</span>
          <button class="modal-close" onclick="closeModal('enum-edit-modal')"><i class="fas fa-times"></i></button>
        </div>
        <div class="modal-body">
          <input type="hidden" id="enum-record-id">
          <input type="hidden" id="enum-group-key">
          <input type="hidden" id="enum-group-label">
          <div class="form-group">
            <label class="form-label">표시 이름 <span class="required">*</span></label>
            <input type="text" class="form-control" id="enum-label" placeholder="예: 구조재">
          </div>
          <div class="form-group">
            <label class="form-label">값(Value)
              <span style="font-size:11px;color:#9ca3af;margin-left:4px">— 저장되는 실제 값. 비우면 표시 이름과 동일</span>
            </label>
            <input type="text" class="form-control" id="enum-value" placeholder="비워두면 표시 이름과 동일">
          </div>
          <div class="form-group">
            <label class="form-label">색상</label>
            <div style="display:flex;align-items:center;gap:10px">
              <input type="color" id="enum-color" value="#6b7280" style="width:40px;height:34px;border:1px solid #e5e7eb;border-radius:6px;cursor:pointer;padding:2px">
              <span style="font-size:12px;color:#9ca3af">배지/뱃지 색상 (선택)</span>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">정렬 순서</label>
            <input type="number" class="form-control" id="enum-sort" placeholder="숫자 (작을수록 위)" min="1" style="width:120px">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal('enum-edit-modal')">취소</button>
          <button class="btn btn-primary" onclick="saveEnum()">저장</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }

  document.getElementById('enum-modal-title').textContent = isEdit ? '선택지 수정' : '선택지 추가';
  document.getElementById('enum-record-id').value  = isEdit ? (data.id || '') : '';
  document.getElementById('enum-group-key').value  = data.group_key || '';
  document.getElementById('enum-group-label').value= data.group_label || '';
  document.getElementById('enum-label').value       = isEdit ? (data.label || data.value || '') : '';
  document.getElementById('enum-value').value       = isEdit ? (data.value || '') : '';
  document.getElementById('enum-color').value       = (data.color && data.color.startsWith('#')) ? data.color : '#6b7280';
  document.getElementById('enum-sort').value        = data.sort_order != null ? data.sort_order : '';

  openModal('enum-edit-modal');
}

async function saveEnum() {
  const id         = document.getElementById('enum-record-id').value.trim();
  const group_key  = document.getElementById('enum-group-key').value.trim();
  const group_label= document.getElementById('enum-group-label').value.trim();
  const labelVal   = document.getElementById('enum-label').value.trim();
  const valueVal   = document.getElementById('enum-value').value.trim() || labelVal;
  const color      = document.getElementById('enum-color').value || '#6b7280';
  const sort_order = parseInt(document.getElementById('enum-sort').value) || 99;

  if (!labelVal) { showToast('표시 이름을 입력해주세요', 'error'); return; }
  if (!group_key) { showToast('그룹 키가 없습니다', 'error'); return; }

  const payload = { group_key, group_label, label: labelVal, value: valueVal, color, sort_order, is_system: false };

  try {
    if (id) {
      await API.put('enums', id, { ...payload, id });
      showToast('선택지가 수정되었습니다');
    } else {
      await API.post('enums', payload);
      showToast('선택지가 추가되었습니다');
    }
    closeModal('enum-edit-modal');
    await loadAll();
    renderEnumsPage();
    _populateDynamicSelects();
  } catch(e) {
    showToast('저장 실패: ' + e.message, 'error');
  }
}

async function deleteEnum(enumId, label) {
  const e = State.enums.find(x => x.id === enumId);
  if (e?.is_system) { showToast('시스템 고정값은 삭제할 수 없습니다', 'error'); return; }

  confirmDelete(
    `"${label}" 선택지를 삭제하시겠습니까?`,
    async () => {
      try {
        await API.delete('enums', enumId);
        showToast('삭제되었습니다');
        await loadAll();
        renderEnumsPage();
        _populateDynamicSelects();
      } catch(err) {
        showToast('삭제 실패: ' + err.message, 'error');
      }
    }
  );
}

// ===================================================
// ===== 속성 정의(Attr Def) CRUD — slot_attr_def:{slotType} 그룹 활용 =====
// ===================================================

/** 속성 정의 추가 모달 열기 */
function openAttrDefAddModal(slotType, slotTypeLabel) {
  _openAttrDefModal({ slotType, slotTypeLabel }, false);
}

/** 속성 정의 수정 모달 열기 */
function openAttrDefEditModal(enumId) {
  const e = State.enums.find(x => x.id === enumId);
  if (!e) return;
  // group_key = "slot_attr_def:단열재" → slotType = "단열재"
  const slotType = e.group_key.replace('slot_attr_def:', '');
  _openAttrDefModal({ ...e, slotType }, true);
}

function _openAttrDefModal(data, isEdit) {
  let modal = document.getElementById('attr-def-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'attr-def-modal';
    modal.innerHTML = `
      <div class="modal" style="max-width:420px">
        <div class="modal-header">
          <span class="modal-title" id="attr-def-modal-title">속성 항목 추가</span>
          <button class="modal-close" onclick="closeModal('attr-def-modal')"><i class="fas fa-times"></i></button>
        </div>
        <div class="modal-body">
          <input type="hidden" id="attr-def-record-id">
          <input type="hidden" id="attr-def-slot-type">
          <div class="form-group">
            <label class="form-label">속성 이름 <span class="required">*</span></label>
            <input type="text" class="form-control" id="attr-def-label" placeholder="예: 열관류율, 가격대, 두께">
            <div style="font-size:11px;color:#9ca3af;margin-top:4px">스펙 입력 폼에서 보여질 항목 이름입니다</div>
          </div>
          <div class="form-group">
            <label class="form-label">단위
              <span style="font-size:11px;color:#9ca3af;margin-left:4px">— 속성 라벨 옆에 표시됩니다</span>
            </label>
            <input type="text" class="form-control" id="attr-def-unit" placeholder="예: W/m²K, mm, %, 만원">
          </div>
          <div class="form-group">
            <label class="form-label">기준 예시
              <span style="font-size:11px;color:#9ca3af;margin-left:4px">— 입력 필드의 placeholder로 표시됩니다</span>
            </label>
            <input type="text" class="form-control" id="attr-def-hint" placeholder="예: 0.5 ~ 2.0, 불연/준불연/난연, 고성능">
          </div>
          <div class="form-group">
            <label class="form-label">속성 키(Key)
              <span style="font-size:11px;color:#9ca3af;margin-left:4px">— 비워두면 이름과 동일</span>
            </label>
            <input type="text" class="form-control" id="attr-def-value" placeholder="비워두면 표시 이름과 동일 (영문 권장)">
          </div>
          <div class="form-group">
            <label class="form-label">정렬 순서</label>
            <input type="number" class="form-control" id="attr-def-sort" min="1" style="width:120px" placeholder="숫자 (작을수록 위)">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal('attr-def-modal')">취소</button>
          <button class="btn btn-primary" onclick="saveAttrDef()">저장</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }

  const typeName = data.slotTypeLabel || data.slotType || '';
  document.getElementById('attr-def-modal-title').textContent =
    (isEdit ? '속성 항목 수정' : '속성 항목 추가') + (typeName ? ` — ${typeName}` : '');
  document.getElementById('attr-def-record-id').value = isEdit ? (data.id || '') : '';
  document.getElementById('attr-def-slot-type').value  = data.slotType || '';
  document.getElementById('attr-def-label').value      = isEdit ? (data.label || data.value || '') : '';
  const _parsedUnit = _parseAttrUnit(isEdit ? (data.color || '') : '');
  document.getElementById('attr-def-unit').value       = _parsedUnit.unit;
  document.getElementById('attr-def-hint').value       = _parsedUnit.hint;
  document.getElementById('attr-def-value').value      = isEdit ? (data.value || '') : '';
  document.getElementById('attr-def-sort').value       = isEdit && data.sort_order != null ? data.sort_order : '';
  openModal('attr-def-modal');
}

async function saveAttrDef() {
  const id        = document.getElementById('attr-def-record-id').value.trim();
  const slotType  = document.getElementById('attr-def-slot-type').value.trim();
  const labelVal  = document.getElementById('attr-def-label').value.trim();
  const unit      = document.getElementById('attr-def-unit').value.trim();
  const hint      = document.getElementById('attr-def-hint').value.trim();
  const valueVal  = document.getElementById('attr-def-value').value.trim() || labelVal;
  const sort_order= parseInt(document.getElementById('attr-def-sort').value) || 99;

  if (!labelVal) { showToast('속성 이름을 입력하세요', 'error'); return; }
  if (!slotType) { showToast('유형 정보가 없습니다', 'error'); return; }

  const group_key   = `slot_attr_def:${slotType}`;
  const group_label = `속성정의:${slotType}`;
  // color 필드 = "단위\t기준예시" 직렬화, label = 표시명, value = 속성 key
  const payload = { group_key, group_label, label: labelVal, value: valueVal, color: _serializeAttrUnit(unit, hint), sort_order, is_system: false };

  try {
    if (id) {
      await API.put('enums', id, { ...payload, id });
      showToast('속성 항목이 수정되었습니다');
    } else {
      await API.post('enums', payload);
      showToast('속성 항목이 추가되었습니다');
    }
    closeModal('attr-def-modal');
    await loadAll();
    renderEnumsPage();
  } catch(err) {
    showToast('저장 실패: ' + err.message, 'error');
  }
}

async function deleteAttrDef(enumId, label) {
  confirmDelete(
    `"${label}" 속성 항목을 삭제하시겠습니까?\n이미 입력된 스펙 속성값에는 영향을 주지 않습니다.`,
    async () => {
      try {
        await API.delete('enums', enumId);
        showToast('삭제되었습니다');
        await loadAll();
        renderEnumsPage();
      } catch(err) {
        showToast('삭제 실패: ' + err.message, 'error');
      }
    }
  );
}

// ===================================================
// ===== 변경 이력 =====
// ===================================================
let logFilterText = '', logFilterType = '';

async function renderChangeLogs() {
  await loadAll();
  renderLogTable();
}

function renderLogTable() {
  let data = [...State.changeLogs].sort((a,b) => Number(b.created_at||0) - Number(a.created_at||0));

  if (logFilterText) {
    const q = logFilterText.toLowerCase();
    data = data.filter(l =>
      (l.entity_name||'').toLowerCase().includes(q) ||
      (l.changed_by||'').toLowerCase().includes(q)
    );
  }
  if (logFilterType) data = data.filter(l => l.change_type === logFilterType);

  const tbody = document.getElementById('changelogs-tbody');
  if (data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state-action">
      <div class="esa-icon">📋</div>
      <div class="esa-title">변경 이력이 없습니다</div>
      <div class="esa-desc">데이터를 추가·수정·삭제하면 이력이 자동으로 기록됩니다.</div>
    </div></td></tr>`;
    return;
  }

  const typeMap = { create:'🆕 생성', update:'✏️ 수정', delete:'🗑️ 삭제', replace:'🔄 교체' };
  const typeBadge = { create:'badge-success', update:'badge-info', delete:'badge-danger', replace:'badge-warning' };
  const entityMap = { lineup:'🏗️ 플랫폼', set:'📦 패키지', slot:'🔩 스펙', material:'🗃️ 자재', slot_material:'🔗 스펙-자재' };

  tbody.innerHTML = data.map(l => `<tr>
    <td style="font-size:12px;color:#6b7280;white-space:nowrap">${formatDate(l.created_at)}</td>
    <td><span class="badge badge-gray" style="font-size:11px">${entityMap[l.entity_type]||l.entity_type}</span></td>
    <td style="font-weight:500;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(l.entity_name||'-')}</td>
    <td><span class="badge ${typeBadge[l.change_type]||'badge-gray'}">${typeMap[l.change_type]||l.change_type}</span></td>
    <td style="font-size:11px;color:#6b7280;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(l.before_value||'')}">
      ${l.before_value ? `<span style="font-family:monospace">${escHtml(l.before_value.substring(0,50))}${l.before_value.length>50?'...':''}</span>` : '-'}
    </td>
    <td style="font-size:11px;color:#6b7280;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(l.after_value||'')}">
      ${l.after_value ? `<span style="font-family:monospace">${escHtml(l.after_value.substring(0,50))}${l.after_value.length>50?'...':''}</span>` : '-'}
    </td>
    <td style="font-size:12px;color:#6b7280">${escHtml(l.changed_by||'-')}</td>
    <td style="font-size:12px;color:#6b7280">${escHtml(l.reason||'-')}</td>
  </tr>`).join('');
}

function filterLogs(val) { logFilterText = val; renderLogTable(); }
function filterLogsByType(val) { logFilterType = val; renderLogTable(); }

// ===================================================
// ===== 카테고리 — 플랫폼 브랜드카드 패키지 count 보정 =====
// ===================================================
// 플랫폼 상세 페이지: 선택된 패키지 수를 기반으로 트리 카운트 갱신
function getLineupSelectionCount(lineupId) {
  return State.lineupSetSelections.filter(s => s.lineup_id === lineupId).length;
}

// ===================================================
// ===== 초기화 =====
// ===================================================
document.addEventListener('DOMContentLoaded', async () => {
  await renderDashboard();
});
