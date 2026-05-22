/**
 * 구조 패키지 관리 (Supabase) — 패키지명·코드만. 규격/부위는 추후 기획.
 */
const Structure = (function () {
  const STORAGE_KEY = 'unitlab_structure_pkgs_v1';
  const STORAGE_MIGRATED_KEY = 'unitlab_structure_pkgs_migrated_v1';

  let data = { packages: [] };
  let _pkgPersistTimer = null;
  const _serverIds = new Set();
  let modalPackageId = null;
  let _lineupDetailStrucId = null;
  let _notesSaveTimer = null;

  function _api() {
    if (typeof API === 'undefined') throw new Error('API not loaded');
    return API;
  }

  function rowToPackage(r) {
    return {
      id: r.id,
      name: r.name,
      code: r.code,
      sort_order: r.sort_order ?? 0,
      cells: r.cells && typeof r.cells === 'object' ? r.cells : {},
    };
  }

  function packageToRow(pkg) {
    return {
      id: pkg.id,
      name: pkg.name,
      code: pkg.code,
      sort_order: pkg.sort_order ?? 0,
      cells: pkg.cells || {},
    };
  }

  function loadLocalSnapshot() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.warn('[Structure] local read failed', e);
      return null;
    }
  }

  function saveLocalSnapshot() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('[Structure] local write failed', e);
    }
  }

  async function loadFromApi() {
    const res = await _api().get('structure_packages', { order: 'sort_order.asc' });
    data.packages = (res.data || []).map(rowToPackage)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name, 'ko'));
    _serverIds.clear();
    data.packages.forEach(p => _serverIds.add(p.id));
    saveLocalSnapshot();
  }

  async function migrateFromLocalStorageIfNeeded() {
    if (localStorage.getItem(STORAGE_MIGRATED_KEY)) return;
    const local = loadLocalSnapshot();
    const legacy = localStorage.getItem('unitlab_structure_v1');
    let pkgs = local?.packages;
    if (!pkgs?.length && legacy) {
      try { pkgs = JSON.parse(legacy).packages; } catch (_) { /* ignore */ }
    }
    if (!pkgs?.length) return;
    if (data.packages.length) {
      localStorage.setItem(STORAGE_MIGRATED_KEY, '1');
      return;
    }
    data.packages = pkgs;
    for (const pkg of data.packages) await apiPersistPackage(pkg);
    localStorage.setItem(STORAGE_MIGRATED_KEY, '1');
    showToast('로컬 구조 패키지를 Supabase로 이전했습니다');
  }

  async function seedIfEmpty() {
    if (data.packages.length) return;
    data.packages = [
      { id: 'st-pkg-std', name: 'U-Standard 구조셋', code: 'STR-STD', sort_order: 0, cells: {} },
      { id: 'st-pkg-pre', name: 'U-Premium 구조셋', code: 'STR-PRE', sort_order: 1, cells: {} },
    ];
    for (const pkg of data.packages) await apiPersistPackage(pkg);
    showToast('기본 구조 패키지가 생성되었습니다');
  }

  async function apiPersistPackage(pkg) {
    const row = packageToRow(pkg);
    if (_serverIds.has(pkg.id)) await _api().put('structure_packages', pkg.id, row);
    else {
      await _api().post('structure_packages', row);
      _serverIds.add(pkg.id);
    }
    saveLocalSnapshot();
  }

  async function apiDeletePackage(id) {
    await _api().delete('structure_packages', id);
    _serverIds.delete(id);
  }

  function packageById(id) { return data.packages.find(p => p.id === id); }

  function isPackageCodeTaken(code, excludeId) {
    const c = (code || '').trim().toLowerCase();
    return data.packages.some(p => p.id !== excludeId && (p.code || '').trim().toLowerCase() === c);
  }

  function getLineupPackageId(lineupId) {
    const eng = State?.lineupEngineering?.find(e => e.lineup_id === lineupId);
    return eng?.structure_package_id || '';
  }

  function renderLineupPackageSummaryHtml(pkg) {
    if (!pkg) {
      return '<p class="ld-struc-preview-empty">구조 패키지를 선택하세요.</p>';
    }
    return `<p class="ld-struc-preview-meta"><strong>${escHtml(pkg.name)}</strong> · <span class="font-mono">${escHtml(pkg.code)}</span></p>`;
  }

  async function persistLineupStructureEng(lineupId) {
    if (!lineupId || typeof saveLineupEngineering !== 'function') return;
    const fields = {
      structure_package_id: document.getElementById('ld-structure-package')?.value ?? '',
    };
    const spec = document.getElementById('ld-structure-spec');
    const logic = document.getElementById('ld-structure-logic');
    if (spec) fields.structure_spec = spec.value ?? '';
    if (logic) fields.structure_logic = logic.value ?? '';
    return saveLineupEngineering(lineupId, fields);
  }

  function refreshLineupPackagePreview() {
    const el = document.getElementById('ld-struc-pkg-preview');
    if (!el) return;
    const pkg = packageById(document.getElementById('ld-structure-package')?.value || '');
    el.innerHTML = renderLineupPackageSummaryHtml(pkg);
  }

  async function onLineupPackageSelect() {
    refreshLineupPackagePreview();
    if (_lineupDetailStrucId) await persistLineupStructureEng(_lineupDetailStrucId);
    if (typeof refreshEngSaveBtn === 'function') refreshEngSaveBtn('eng-save-detail-structure');
  }

  function onLineupNotesInput() {
    if (!_lineupDetailStrucId) return;
    clearTimeout(_notesSaveTimer);
    _notesSaveTimer = setTimeout(() => persistLineupStructureEng(_lineupDetailStrucId), 600);
  }

  async function renderLineupSection(lineupId) {
    const el = document.getElementById('detail-structure-section');
    if (!el) return;
    _lineupDetailStrucId = lineupId;
    await ensureReady();
    const current = getLineupPackageId(lineupId);
    const eng = typeof getLineupEng === 'function' ? getLineupEng(lineupId) : {};
    const opts = data.packages.map(p =>
      `<option value="${escHtml(p.id)}" ${p.id === current ? 'selected' : ''}>${escHtml(p.name)} (${escHtml(p.code)})</option>`
    ).join('');
    const pkg = packageById(current);
    el.innerHTML = `
      <div class="ld-section card">
        <div class="ld-section-head">
          <div class="ld-section-title">
            <i class="fas fa-drafting-compass" style="color:#1a56db"></i>
            구조
          </div>
          <span class="ld-section-hint">패키지 선택 · 상세 규격은 추후 연동</span>
        </div>
        <div class="card-body ld-section-body ld-struc-detail-layout">
          <div class="ld-struc-detail-main">
            <div class="ld-struc-pkg-row">
              <label for="ld-structure-package">구조 패키지</label>
              <select id="ld-structure-package" class="form-control" onchange="Structure.onLineupPackageSelect()">
                <option value="">— 선택 —</option>
                ${opts}
              </select>
            </div>
            <div id="ld-struc-pkg-preview" class="ld-struc-pkg-preview">${renderLineupPackageSummaryHtml(pkg)}</div>
          </div>
          <aside class="ld-struc-detail-side">
            <div class="ld-narrative-field">
              <label class="ld-narrative-label" for="ld-structure-spec">구조 메모</label>
              <textarea id="ld-structure-spec" class="ld-narrative-textarea ld-struc-notes-compact" rows="3"
                placeholder="플랫폼별 구조 보완 사항…"
                oninput="Structure.onLineupNotesInput()">${escHtml(eng.structure_spec || '')}</textarea>
            </div>
            <div class="ld-narrative-field">
              <label class="ld-narrative-label" for="ld-structure-logic">구조 로직 메모</label>
              <textarea id="ld-structure-logic" class="ld-narrative-textarea ld-struc-notes-compact" rows="3"
                placeholder="적용·변형 로직…"
                oninput="Structure.onLineupNotesInput()">${escHtml(eng.structure_logic || '')}</textarea>
            </div>
            <div class="ld-section-actions">
              <button type="button" id="eng-save-detail-structure" class="btn btn-primary btn-sm" disabled
                onclick="saveLineupEngFromDetail('structure')"><i class="fas fa-save"></i> 구조 저장</button>
            </div>
          </aside>
        </div>
      </div>`;
    if (typeof bindEngSaveControls === 'function') {
      bindEngSaveControls({
        btnId: 'eng-save-detail-structure',
        lineupId,
        section: 'structure',
        inputIds: ['ld-structure-spec', 'ld-structure-logic', 'ld-structure-package'],
      });
    }
  }

  function renderPackageList() {
    const el = document.getElementById('struc-pkg-list');
    if (!el) return;
    if (!data.packages.length) {
      el.innerHTML = '<p class="struc-note" style="padding:16px;margin:0;text-align:center">등록된 구조 패키지가 없습니다</p>';
      return;
    }
    el.innerHTML = data.packages.map(p => `
      <div class="struc-pkg-list-item" data-id="${escHtml(p.id)}">
        <div class="struc-pkg-list-main">
          <span class="t">${escHtml(p.name)}</span>
          <span class="d font-mono">${escHtml(p.code)}</span>
        </div>
        <div class="struc-pkg-list-actions">
          <button type="button" class="btn btn-xs btn-secondary" title="복제"
            onclick="Structure.duplicatePackage('${escHtml(p.id)}')"><i class="fas fa-copy"></i></button>
          <button type="button" class="btn btn-xs btn-secondary" title="수정"
            onclick="Structure.editPackage('${escHtml(p.id)}')"><i class="fas fa-edit"></i></button>
          <button type="button" class="btn btn-xs btn-ghost" style="color:#dc2626" title="삭제"
            onclick="Structure.deletePackage('${escHtml(p.id)}','${escHtml(p.name)}')"><i class="fas fa-trash"></i></button>
        </div>
      </div>`).join('');
    initPackageListDnD();
  }

  async function reorderPackages(orderedIds) {
    orderedIds.forEach((id, i) => {
      const p = packageById(id);
      if (p) p.sort_order = i;
    });
    data.packages.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    try {
      await Promise.all(data.packages.map(p => apiPersistPackage(p)));
      renderPackageList();
    } catch (e) {
      showToast('순서 저장 실패: ' + e.message, 'error');
    }
  }

  function initPackageListDnD() {
    const el = document.getElementById('struc-pkg-list');
    if (!el || typeof makeSortable !== 'function') return;
    makeSortable(el, {
      itemSelector: '.struc-pkg-list-item',
      handleSelector: '.struc-pkg-list-main',
      getId: (item) => item.dataset.id,
      onReorder: reorderPackages,
    });
  }

  function fillPackageDuplicateOptions() {
    const sel = document.getElementById('struc-pkg-modal-duplicate-from');
    if (!sel) return;
    sel.innerHTML = '<option value="">— 빈 패키지 —</option>' +
      data.packages.map(p => `<option value="${escHtml(p.id)}">${escHtml(p.name)} (${escHtml(p.code)})</option>`).join('');
  }

  function openPackageModal(pkg, duplicateFromId) {
    modalPackageId = pkg?.id || null;
    const isEdit = !!pkg;
    const dupWrap = document.getElementById('struc-pkg-duplicate-wrap');
    if (dupWrap) dupWrap.style.display = isEdit ? 'none' : '';
    document.getElementById('struc-pkg-modal-title').textContent = isEdit ? '구조 패키지 수정' : '구조 패키지 추가';
    document.getElementById('struc-pkg-modal-record-id').value = pkg?.id || '';
    document.getElementById('struc-pkg-modal-name').value = pkg?.name || '';
    document.getElementById('struc-pkg-modal-code').value = pkg?.code || (isEdit ? '' : 'STR-NEW');
    fillPackageDuplicateOptions();
    const dupSel = document.getElementById('struc-pkg-modal-duplicate-from');
    if (dupSel) dupSel.value = isEdit ? '' : (duplicateFromId || '');
    openModal('struc-pkg-modal');
    requestAnimationFrame(() => document.getElementById('struc-pkg-modal-name')?.focus());
  }

  async function savePackageModal() {
    const recordId = document.getElementById('struc-pkg-modal-record-id').value.trim();
    const name = document.getElementById('struc-pkg-modal-name').value.trim();
    const code = document.getElementById('struc-pkg-modal-code').value.trim();
    if (!name) { showToast('패키지명을 입력하세요', 'error'); return; }
    if (!code) { showToast('코드를 입력하세요', 'error'); return; }
    const existing = packageById(modalPackageId || recordId);
    if (isPackageCodeTaken(code, existing?.id)) {
      showToast('이미 사용 중인 코드입니다', 'error');
      return;
    }
    const dupFrom = document.getElementById('struc-pkg-modal-duplicate-from')?.value || '';
    const src = dupFrom ? packageById(dupFrom) : null;
    const id = existing?.id || recordId || ('st-pkg-' + Date.now());
    const pkg = {
      id,
      name,
      code,
      sort_order: existing?.sort_order ?? data.packages.length,
      cells: existing?.cells || src?.cells || {},
    };
    if (existing) {
      const idx = data.packages.findIndex(p => p.id === existing.id);
      data.packages[idx] = pkg;
    } else {
      data.packages.push(pkg);
    }
    try {
      await apiPersistPackage(pkg);
      closeModal('struc-pkg-modal');
      showToast(existing ? '패키지가 수정되었습니다' : '구조 패키지가 추가되었습니다');
      await renderPackagesPage();
    } catch (e) {
      showToast('저장 실패: ' + e.message, 'error');
    }
  }

  function deletePackage(id, name) {
    confirmDelete(`구조 패키지 "${name}"을 삭제하시겠습니까?`, async () => {
      try {
        await apiDeletePackage(id);
        data.packages = data.packages.filter(p => p.id !== id);
        const affected = (State.lineupEngineering || []).filter(e => e.structure_package_id === id);
        for (const eng of affected) {
          await saveLineupEngineering(eng.lineup_id, { structure_package_id: '' });
        }
        showToast('삭제되었습니다');
        await renderPackagesPage();
      } catch (e) {
        showToast('삭제 실패: ' + e.message, 'error');
      }
    });
  }

  async function ensureReady() {
    if (typeof loadAll === 'function') await loadAll();
    try {
      await loadFromApi();
      await migrateFromLocalStorageIfNeeded();
      await seedIfEmpty();
    } catch (e) {
      console.error('[Structure] Supabase load failed — docs/supabase/structure.sql 실행 필요', e);
      const local = loadLocalSnapshot();
      if (local?.packages?.length) {
        data.packages = local.packages;
        showToast('구조 DB 연결 실패 — 로컬 패키지 목록 표시 중', 'warning');
      } else {
        showToast('구조 DB 연결 실패: ' + e.message, 'error');
      }
    }
  }

  async function renderPackagesPage() {
    await ensureReady();
    renderPackageList();
  }

  function init() {}

  return {
    init,
    ensureReady,
    renderPackagesPage,
    renderLineupSection,
    refreshLineupPackagePreview,
    onLineupPackageSelect,
    onLineupNotesInput,
    getPackages: () => data.packages.slice(),
    getLineupPackageId,
    openPackageModal,
    editPackage: (id) => openPackageModal(packageById(id)),
    addPackage: () => openPackageModal(null),
    savePackageModal,
    duplicatePackage: (sourceId) => {
      const src = packageById(sourceId);
      if (!src) return;
      openPackageModal(null, sourceId);
      const nameEl = document.getElementById('struc-pkg-modal-name');
      const codeEl = document.getElementById('struc-pkg-modal-code');
      if (nameEl) nameEl.value = (src.name || '') + ' (복제)';
      if (codeEl) codeEl.value = (src.code || 'STR') + '-COPY';
    },
    deletePackage,
  };
})();

document.addEventListener('DOMContentLoaded', () => {
  Structure.init();
  const pkgModalBtn = document.getElementById('struc-btn-pkg-modal-save');
  if (pkgModalBtn) pkgModalBtn.onclick = () => Structure.savePackageModal();
});
