/**
 * 단열 관리 — 스펙 / 패키지 / 실내 마감 (Supabase)
 */
const Insulation = (function () {
  const STORAGE_KEY = 'unitlab_insulation_v1';
  const STORAGE_MIGRATED_KEY = 'unitlab_insulation_migrated_v1';
  /** 신규 빈 셀 기본 레이어 수 (추가·삭제는 자유) */
  const DEFAULT_EMPTY_LAYER_COUNT = 4;

  const PART_TYPES = {
    wall: { label: '거실 외벽', short: '외벽', ri: 0.11, ro: { direct: 0.043, indirect: 0.11 }, dualInterior: false, roleHints: ['외단열', '외단열', '내단열', '내단열'] },
    wall_interior: { label: '내벽', short: '내벽', ri: 0.11, ro: null, dualInterior: true, roleHints: ['A실', 'A실', 'B실', '—'] },
    floor_bottom: { label: '최하층 거실 바닥', short: '바닥', ri: 0.086, ro: { direct: 0.043, indirect: 0.15 }, dualInterior: false, roleHints: ['하부 단열', '하부 단열', '상부 마감', '—'] },
    roof: { label: '최상층 지붕·반자', short: '지붕', ri: 0.086, ro: { direct: 0.043, indirect: 0.086 }, dualInterior: false, roleHints: ['외단열', '외단열', '내단열', '—'] },
    floor_between: { label: '공동주택 층간 바닥', short: '층간바닥', ri: 0.086, ro: null, dualInterior: true, roleHints: ['상부층', '상부층', '하부층', '—'] },
  };

  /** [별표1] 지역별 건축물부위 열관류율 — 이하 W/m²·K 이하 */
  const U_LIMITS = {
    wall: {
      direct: {
        apartment: { mid1: 0.150, mid2: 0.170, south: 0.220, jeju: 0.290 },
        non_apartment: { mid1: 0.170, mid2: 0.240, south: 0.320, jeju: 0.410 },
      },
      indirect: {
        apartment: { mid1: 0.210, mid2: 0.240, south: 0.310, jeju: 0.410 },
        non_apartment: { mid1: 0.240, mid2: 0.340, south: 0.450, jeju: 0.560 },
      },
    },
    roof: {
      direct: { mid1: 0.150, mid2: 0.150, south: 0.180, jeju: 0.250 },
      indirect: { mid1: 0.210, mid2: 0.210, south: 0.260, jeju: 0.350 },
    },
    floor_bottom: {
      direct: {
        heated: { mid1: 0.150, mid2: 0.170, south: 0.220, jeju: 0.290 },
        unheated: { mid1: 0.170, mid2: 0.200, south: 0.250, jeju: 0.330 },
      },
      indirect: {
        heated: { mid1: 0.210, mid2: 0.240, south: 0.310, jeju: 0.410 },
        unheated: { mid1: 0.240, mid2: 0.290, south: 0.350, jeju: 0.470 },
      },
    },
    floor_between: { mid1: 0.810, mid2: 0.810, south: 0.810, jeju: 0.810 },
  };

  /** 별표1 행 — 외기 직/간접은 행으로 분리 (셀에서 노출 변경 불가) */
  const PART_ROWS = [
    { id: 'wall_direct', title: '거실 외벽', partType: 'wall', exposure: 'direct' },
    { id: 'wall_indirect', title: '거실 외벽', partType: 'wall', exposure: 'indirect' },
    { id: 'wall_int', title: '내벽', partType: 'wall_interior', exposure: null, noLimit: true },
    { id: 'roof_direct', title: '지붕·반자', partType: 'roof', exposure: 'direct' },
    { id: 'roof_indirect', title: '지붕·반자', partType: 'roof', exposure: 'indirect' },
    { id: 'floor_direct', title: '최하층 바닥', partType: 'floor_bottom', exposure: 'direct' },
    { id: 'floor_indirect', title: '최하층 바닥', partType: 'floor_bottom', exposure: 'indirect' },
    { id: 'floor_between', title: '층간바닥', partType: 'floor_between', exposure: null },
  ];

  function partRowExposureLabel(row) {
    if (!row?.exposure) return '';
    return row.exposure === 'direct' ? '외기 직접' : '외기 간접';
  }

  function partRowLabelHtml(row) {
    const exp = partRowExposureLabel(row);
    if (exp) {
      return `<span class="insul-part-title">${escHtml(row.title)}</span>` +
        `<span class="insul-part-exposure">${escHtml(exp)}</span>`;
    }
    return `<span class="insul-part-title">${escHtml(row.title)}</span>`;
  }

  function visiblePartRows(pkg) {
    return PART_ROWS.filter(row => rowApplies(pkg, row.id));
  }

  const ZONES = [
    { id: 'mid1', label: '중부1' }, { id: 'mid2', label: '중부2' },
    { id: 'south', label: '남부' }, { id: 'jeju', label: '제주' },
  ];

  let data = { specs: [], packages: [], finishOptions: [] };
  let _apiReady = false;
  let _pkgPersistTimer = null;
  let _finishPersistTimer = null;
  const _serverIds = { specs: new Set(), packages: new Set(), finish: new Set() };

  let activePackageId = null;
  let activePartRow = 'wall_direct';
  let activeZone = 'mid1';
  let pkgPartType = 'wall';
  let pkgExposure = 'direct';
  let pkgLayers = [];
  let pkgFinishId = '';
  let savedPkgState = '';
  let editingFinishId = '';
  let modalSpecId = null;
  let modalPackageId = null;
  let _lineupDetailInsulId = null;
  let _notesSaveTimer = null;

  function _api() {
    if (typeof API === 'undefined') throw new Error('API not loaded');
    return API;
  }

  function rowToSpec(r) {
    return {
      id: r.id,
      name: r.name,
      role: r.role,
      material_id: r.material_id || null,
      lambda: Number(r.lambda),
      fireRating: r.fire_rating || '',
    };
  }

  function specToRow(s, sortOrder = 0) {
    return {
      id: s.id,
      name: s.name,
      role: s.role,
      material_id: s.material_id || null,
      lambda: s.lambda,
      fire_rating: s.fireRating || '',
      sort_order: sortOrder,
    };
  }

  function rowToPackage(r) {
    return {
      id: r.id,
      name: r.name,
      code: r.code,
      is_apartment: r.is_apartment !== false,
      has_floor_heating: r.has_floor_heating !== false,
      schemaVersion: r.schema_version ?? 2,
      sort_order: r.sort_order ?? 0,
      cells: r.cells && typeof r.cells === 'object' ? r.cells : {},
    };
  }

  function packageToRow(pkg) {
    return {
      id: pkg.id,
      name: pkg.name,
      code: pkg.code,
      is_apartment: pkg.is_apartment !== false,
      has_floor_heating: pkg.has_floor_heating !== false,
      schema_version: pkg.schemaVersion ?? 2,
      sort_order: pkg.sort_order ?? 0,
      cells: pkg.cells || {},
    };
  }

  function cloneCells(cells) {
    const out = {};
    Object.entries(cells || {}).forEach(([k, c]) => {
      out[k] = {
        ...c,
        layers: (c.layers || []).map(L => ({ ...L })),
      };
    });
    return out;
  }

  function loadLocalSnapshot() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      console.warn('[Insulation] local snapshot read failed', e);
      return null;
    }
  }

  async function loadFromApi() {
    const [specRes, pkgRes, finRes, layerRes] = await Promise.all([
      _api().get('insulation_specs', { order: 'sort_order.asc' }),
      _api().get('insulation_packages', { order: 'sort_order.asc' }),
      _api().get('finish_options', { order: 'sort_order.asc' }),
      _api().get('finish_option_layers', { order: 'sort_order.asc' }),
    ]);
    const layers = layerRes.data || [];
    data.specs = (specRes.data || []).map(rowToSpec);
    data.packages = (pkgRes.data || []).map(rowToPackage)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name, 'ko'));
    data.finishOptions = (finRes.data || []).map(f => ({
      id: f.id,
      title: f.title,
      layers: layers
        .filter(l => l.finish_option_id === f.id)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
        .map(l => ({ specId: l.insulation_spec_id, thick: Number(l.thickness_mm) })),
    }));
    migratePackages();
    _serverIds.specs = new Set(data.specs.map(s => s.id));
    _serverIds.packages = new Set(data.packages.map(p => p.id));
    _serverIds.finish = new Set(data.finishOptions.map(f => f.id));
    _apiReady = true;
  }

  async function migrateFromLocalStorageIfNeeded() {
    if (localStorage.getItem(STORAGE_MIGRATED_KEY)) return;
    const local = loadLocalSnapshot();
    if (!local) return;
    const hasRemote = data.specs.length || data.packages.length || data.finishOptions.length;
    if (hasRemote) {
      localStorage.setItem(STORAGE_MIGRATED_KEY, '1');
      return;
    }
    data.specs = (local.specs || []).map(s => ({ ...s, fireRating: s.fireRating || '' }));
    data.packages = (local.packages || []).map(p => ({
      ...p,
      schemaVersion: p.schemaVersion ?? 2,
      cells: p.cells || {},
    }));
    data.finishOptions = local.finishOptions || [];
    migratePackages();
    for (let i = 0; i < data.specs.length; i++) await apiPersistSpec(data.specs[i], i);
    for (const pkg of data.packages) await apiPersistPackage(pkg);
    for (let i = 0; i < data.finishOptions.length; i++) await apiPersistFinish(data.finishOptions[i], i);
    if (local.lineupPackages && typeof saveLineupEngineering === 'function' && typeof State !== 'undefined') {
      for (const [lineupId, pkgId] of Object.entries(local.lineupPackages)) {
        if (!pkgId) continue;
        await saveLineupEngineering(lineupId, { insulation_package_id: pkgId });
      }
      const eng = await _api().get('lineup_engineering');
      State.lineupEngineering = eng.data || [];
    }
    localStorage.setItem(STORAGE_MIGRATED_KEY, '1');
    showToast('로컬 단열 데이터를 Supabase로 이전했습니다');
  }

  async function apiPersistSpec(spec, sortOrder) {
    const row = specToRow(spec, sortOrder ?? data.specs.findIndex(s => s.id === spec.id));
    if (_serverIds.specs.has(spec.id)) await _api().put('insulation_specs', spec.id, row);
    else {
      await _api().post('insulation_specs', row);
      _serverIds.specs.add(spec.id);
    }
  }

  async function apiDeleteSpec(id) {
    await _api().delete('insulation_specs', id);
    _serverIds.specs.delete(id);
  }

  async function apiPersistPackage(pkg) {
    if (!pkg?.id) return;
    const row = packageToRow(pkg);
    if (_serverIds.packages.has(pkg.id)) await _api().put('insulation_packages', pkg.id, row);
    else {
      await _api().post('insulation_packages', row);
      _serverIds.packages.add(pkg.id);
    }
  }

  async function apiDeletePackage(id) {
    await _api().delete('insulation_packages', id);
    _serverIds.packages.delete(id);
  }

  async function apiDeleteFinishLayers(finishId) {
    const res = await _api().get('finish_option_layers', { eq: { finish_option_id: finishId }, limit: 500 });
    await Promise.all((res.data || []).map(l => _api().delete('finish_option_layers', l.id)));
  }

  async function apiPersistFinish(fin, sortOrder = 0) {
    const row = { id: fin.id, title: fin.title, sort_order: sortOrder };
    if (_serverIds.finish.has(fin.id)) await _api().put('finish_options', fin.id, row);
    else {
      await _api().post('finish_options', row);
      _serverIds.finish.add(fin.id);
    }
    await apiDeleteFinishLayers(fin.id);
    for (let i = 0; i < (fin.layers || []).length; i++) {
      const L = fin.layers[i];
      if (!L.specId) continue;
      await _api().post('finish_option_layers', {
        id: `fol_${fin.id}_${i}_${Date.now()}`,
        finish_option_id: fin.id,
        insulation_spec_id: L.specId,
        thickness_mm: parseFloat(L.thick) || 0,
        sort_order: i,
      });
    }
  }

  async function apiDeleteFinish(id) {
    await _api().delete('finish_options', id);
    _serverIds.finish.delete(id);
  }

  function schedulePersistPackage() {
    const pkg = activePackage();
    if (!pkg || !_apiReady) return;
    clearTimeout(_pkgPersistTimer);
    _pkgPersistTimer = setTimeout(() => {
      apiPersistPackage(pkg).catch(e => showToast('구조 저장 실패: ' + e.message, 'error'));
    }, 450);
  }

  async function flushPersistPackage() {
    const pkg = activePackage();
    if (!pkg || !_apiReady) return;
    clearTimeout(_pkgPersistTimer);
    await apiPersistPackage(pkg);
  }

  function schedulePersistFinish(fin) {
    if (!fin || !_apiReady) return;
    clearTimeout(_finishPersistTimer);
    _finishPersistTimer = setTimeout(() => {
      const idx = data.finishOptions.findIndex(f => f.id === fin.id);
      apiPersistFinish(fin, idx >= 0 ? idx : 0).catch(e => showToast('마감 옵션 저장 실패: ' + e.message, 'error'));
    }, 450);
  }

  async function clearLineupPackageRefs(packageId) {
    if (!packageId || typeof State === 'undefined' || typeof saveLineupEngineering !== 'function') return;
    const affected = (State.lineupEngineering || []).filter(e => e.insulation_package_id === packageId);
    for (const eng of affected) {
      await saveLineupEngineering(eng.lineup_id, { insulation_package_id: '' });
    }
  }

  function defaultPackageAttrs() {
    return { is_apartment: true, has_floor_heating: true, schemaVersion: 2 };
  }

  function migratePackages() {
    const OLD_ROW_MAP = {
      wall_ext: { direct: 'wall_direct', indirect: 'wall_indirect' },
      roof: { direct: 'roof_direct', indirect: 'roof_indirect' },
      floor_bottom: { direct: 'floor_direct', indirect: 'floor_indirect' },
      floor_between: { single: 'floor_between' },
    };
    let changed = false;
    data.packages.forEach(pkg => {
      if (pkg.schemaVersion >= 2) return;
      if (pkg.is_apartment == null) pkg.is_apartment = true;
      if (pkg.has_floor_heating == null) pkg.has_floor_heating = true;
      const cells = pkg.cells || {};
      const next = { ...cells };
      ZONES.forEach(z => {
        Object.entries(OLD_ROW_MAP).forEach(([oldId, map]) => {
          const k = cellKey(oldId, z.id);
          const src = cells[k];
          if (!src) return;
          if (map.single) {
            next[cellKey(map.single, z.id)] = cloneCellForRow(map.single, src);
          } else {
            next[cellKey(map.direct, z.id)] = cloneCellForRow(map.direct, { ...src, exposure: 'direct' });
            next[cellKey(map.indirect, z.id)] = cloneCellForRow(map.indirect, { ...src, exposure: 'indirect' });
          }
          delete next[k];
        });
      });
      pkg.cells = next;
      pkg.schemaVersion = 2;
      changed = true;
    });
    if (changed && _apiReady) {
      data.packages.filter(p => p.schemaVersion >= 2).forEach(pkg => {
        apiPersistPackage(pkg).catch(e => console.warn('[Insulation] migrate persist', e));
      });
    }
  }

  function cloneCellForRow(rowId, src) {
    const row = PART_ROWS.find(r => r.id === rowId);
    const c = { ...src, layers: (src.layers || []).map(L => ({ ...L })) };
    if (row) {
      c.partType = row.partType;
      if (row.exposure) c.exposure = row.exposure;
    }
    return c;
  }

  function partRowById(id) { return PART_ROWS.find(r => r.id === id); }

  function rowHasLegalLimit(partRowId) {
    const row = partRowById(partRowId);
    return !!(row && !row.noLimit && row.partType !== 'wall_interior');
  }

  function rowApplies(pkg, rowId) {
    const row = partRowById(rowId);
    if (!row) return true;
    if (row.partType === 'floor_between') return !!pkg.has_floor_heating;
    return true;
  }

  function getLegalLimitU(partRowId, zoneId, pkg) {
    const row = partRowById(partRowId);
    if (!row || !pkg || !rowHasLegalLimit(partRowId)) return null;
    if (!rowApplies(pkg, partRowId)) return null;
    if (row.partType === 'wall') {
      const bucket = pkg.is_apartment !== false ? 'apartment' : 'non_apartment';
      return U_LIMITS.wall[row.exposure]?.[bucket]?.[zoneId] ?? null;
    }
    if (row.partType === 'roof') {
      return U_LIMITS.roof[row.exposure]?.[zoneId] ?? null;
    }
    if (row.partType === 'floor_bottom') {
      const bucket = pkg.has_floor_heating !== false ? 'heated' : 'unheated';
      return U_LIMITS.floor_bottom[row.exposure]?.[bucket]?.[zoneId] ?? null;
    }
    if (row.partType === 'floor_between') {
      return U_LIMITS.floor_between[zoneId] ?? null;
    }
    return null;
  }

  function limitCriteriaLabel(pkg) {
    const apt = pkg.is_apartment !== false ? '공동주택' : '공동주택 외';
    const heat = pkg.has_floor_heating !== false ? '바닥난방' : '바닥난방 아님';
    return `[별표1] ${apt} · ${heat}`;
  }

  async function seedIfEmpty() {
    if (data.specs.length) return;
    data.specs = [
      { id: 'is1', name: '48K 그라스울 판넬', role: 'panel', material_id: null, lambda: 0.036, fireRating: '준불연' },
      { id: 'is2', name: '60K 미네랄울', role: 'insul', material_id: null, lambda: 0.035, fireRating: '불연' },
      { id: 'is3', name: '80K 미네랄울', role: 'insul', material_id: null, lambda: 0.034, fireRating: '불연' },
      { id: 'is-f1', name: '석고보드', role: 'finish', material_id: null, lambda: 0.18, fireRating: '불연' },
      { id: 'is-f2', name: '석고보드(12.5)', role: 'finish', material_id: null, lambda: 0.21, fireRating: '불연' },
      { id: 'is-f3', name: '도장층', role: 'finish', material_id: null, lambda: 0.5, fireRating: '' },
    ];
    data.finishOptions = [
      { id: 'gypsum95', title: '석고보드 9.5T 2ply', layers: [{ specId: 'is-f1', thick: 9.5 }, { specId: 'is-f1', thick: 9.5 }] },
      { id: 'gypsum125', title: '석고보드 12.5T 2ply', layers: [{ specId: 'is-f2', thick: 12.5 }, { specId: 'is-f2', thick: 12.5 }] },
      { id: 'paint', title: '도장 마감 (얇음)', layers: [{ specId: 'is-f3', thick: 0.3 }] },
    ];
    data.packages = [
      { id: 'ins-std', name: 'U-Standard 단열셋', code: 'INS-STD', cells: {} },
      { id: 'ins-pre', name: 'U-Premium 단열셋', code: 'INS-PRE', cells: {} },
    ];
    seedPackage(data.packages[0], 'std');
    seedPackage(data.packages[1], 'pre');
    for (let i = 0; i < data.specs.length; i++) await apiPersistSpec(data.specs[i], i);
    for (const pkg of data.packages) await apiPersistPackage(pkg);
    for (let i = 0; i < data.finishOptions.length; i++) await apiPersistFinish(data.finishOptions[i], i);
  }

  function emptyLayer() {
    return { specId: '', lambda: '', thick: '' };
  }

  function emptyLayers(count = DEFAULT_EMPTY_LAYER_COUNT) {
    return Array.from({ length: Math.max(1, count) }, () => emptyLayer());
  }

  function normalizeCellLayers(layers) {
    if (!layers?.length) return emptyLayers();
    return layers.map(L => ({
      specId: L.specId || '',
      lambda: L.lambda ?? '',
      thick: L.thick ?? '',
    }));
  }

  function specById(id) { return data.specs.find(s => s.id === id); }
  function finishById(id) { return data.finishOptions.find(f => f.id === id); }
  function packageById(id) { return data.packages.find(p => p.id === id); }
  function activePackage() { return data.packages.find(p => p.id === activePackageId); }

  function isPackageCodeTaken(code, exceptId) {
    const c = (code || '').trim().toLowerCase();
    if (!c) return false;
    return data.packages.some(p => p.id !== exceptId && (p.code || '').trim().toLowerCase() === c);
  }

  function lineupNamesUsingPackage(pkgId) {
    const fromEng = typeof State !== 'undefined'
      ? (State.lineupEngineering || []).filter(e => e.insulation_package_id === pkgId)
      : [];
    return fromEng.map(e => {
      const lu = typeof State !== 'undefined' ? State.lineups.find(l => l.id === e.lineup_id) : null;
      return lu?.name || e.lineup_id;
    });
  }

  function syncPackageEditorVisibility() {
    const hasPkg = data.packages.length > 0 && !!activePackageId;
    const editor = document.getElementById('insul-pkg-editor');
    const empty = document.getElementById('insul-pkg-empty');
    const selBar = document.querySelector('.insul-pkg-select-bar');
    if (editor) editor.style.display = hasPkg ? '' : 'none';
    if (empty) empty.style.display = data.packages.length ? 'none' : '';
    if (selBar) selBar.style.display = data.packages.length ? '' : 'none';
    const saveBtn = document.getElementById('insul-btn-pkg-save');
    if (saveBtn && !hasPkg) saveBtn.disabled = true;
  }

  function refreshPackageUi() {
    if (document.getElementById('insul-pkg-list-mgmt')) renderPackageList('insul-pkg-list-mgmt');
    if (document.getElementById('insul-pkg-select')) renderPackageSelect();
  }

  function renderPackageSelect() {
    const sel = document.getElementById('insul-pkg-select');
    if (!sel) return;
    if (!data.packages.length) {
      sel.innerHTML = '<option value="">등록된 패키지 없음</option>';
      sel.disabled = true;
      return;
    }
    sel.disabled = false;
    const cur = activePackageId || '';
    sel.innerHTML = data.packages.map(p =>
      `<option value="${escHtml(p.id)}" ${p.id === cur ? 'selected' : ''}>${escHtml(p.name)} (${escHtml(p.code)})</option>`
    ).join('');
  }

  async function applyActivePackageToEditor() {
    const pkg = activePackage();
    if (!pkg) {
      const saveBtn = document.getElementById('insul-btn-pkg-save');
      if (saveBtn) saveBtn.disabled = true;
      return;
    }
    const n = document.getElementById('insul-pkg-name');
    const c = document.getElementById('insul-pkg-code');
    if (n) n.value = pkg.name;
    if (c) c.value = pkg.code;
    syncPkgAttrsUI();
    if (!activePartRow || !partRowById(activePartRow)) {
      activePartRow = 'wall_direct';
      activeZone = 'mid1';
    }
    loadActiveCellToEditor();
    updateCellEditorHeader();
    syncCellEditorPanelState();
    refreshExposureUI();
    savedPkgState = getPkgState();
    renderPackageMatrix();
    renderPackageTable();
    syncPkgSave();
  }
  function cellKey(pr, z) { return pr + ':' + z; }

  function materialById(id) {
    return (typeof State !== 'undefined' ? State.materials : []).find(m => m.id === id);
  }

  function materialsSorted() {
    return (typeof State !== 'undefined' ? State.materials : [])
      .slice()
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));
  }

  function layerR(lambda, thickMm) {
    const l = parseFloat(lambda);
    const d = parseFloat(thickMm);
    if (!l || l <= 0 || !d || d <= 0) return 0;
    return (d / 1000) / l;
  }

  function layerLambda(L) {
    if (L?.specId) {
      const sp = specById(L.specId);
      if (sp?.lambda != null) return sp.lambda;
    }
    return parseFloat(L?.lambda) || 0;
  }

  function finishLayerR(L) { return layerR(layerLambda(L), L.thick); }

  function roundU(u) { return Math.round(u * 1000) / 1000; }
  function thickLabel(mm) { const d = parseFloat(mm); return d ? `${d}T` : ''; }
  function fmtR(r) { return r > 0 ? r.toFixed(3) : '—'; }

  function specRoleLabel(role) {
    if (role === 'panel') return '판넬';
    if (role === 'insul') return '단열재';
    if (role === 'finish') return '마감재';
    return role;
  }

  function finishSpecsSorted() {
    return data.specs.filter(s => s.role === 'finish').slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }

  function insulationSpecsForPackage() {
    return data.specs.filter(s => s.role === 'panel' || s.role === 'insul').slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }

  function specsSortedForTable() {
    const order = { panel: 0, insul: 1, finish: 2 };
    return data.specs.slice().sort((a, b) => {
      const d = (order[a.role] ?? 9) - (order[b.role] ?? 9);
      return d !== 0 ? d : a.name.localeCompare(b.name, 'ko');
    });
  }

  /** 편집·표시용 빈 셀 (DB에 쓰이기 전, pkg.cells에 자동 생성하지 않음) */
  function emptyCell(partType, exposure) {
    const row = PART_ROWS.find(r => r.partType === partType);
    return {
      partType: partType || 'wall',
      exposure: exposure || row?.exposure || 'direct',
      finishId: '',
      layers: emptyLayers(),
    };
  }

  function peekCell(pkg, partRowId, zoneId) {
    const row = partRowById(partRowId);
    const k = cellKey(partRowId, zoneId);
    const stored = pkg.cells[k];
    if (stored) {
      const c = { ...stored, layers: normalizeCellLayers(stored.layers) };
      if (row) {
        c.partType = row.partType;
        if (row.exposure) c.exposure = row.exposure;
      }
      return c;
    }
    return emptyCell(row?.partType || 'wall', row?.exposure);
  }

  function ensureCell(pkg, partRowId, zoneId) {
    const row = partRowById(partRowId);
    const k = cellKey(partRowId, zoneId);
    if (!pkg.cells[k]) pkg.cells[k] = emptyCell(row?.partType || 'wall', row?.exposure);
    const c = pkg.cells[k];
    if (row) {
      c.partType = row.partType;
      if (row.exposure) c.exposure = row.exposure;
    }
    return c;
  }

  function seedPackage(pkg, variant) {
    const wallThick = { mid1: 100, mid2: 100, south: 110, jeju: 130 };
    Object.assign(pkg, defaultPackageAttrs());
    PART_ROWS.forEach(row => {
      ZONES.forEach(z => {
        const c = ensureCell(pkg, row.id, z.id);
        if (row.id === 'wall_direct') {
          c.layers[0] = { specId: 'is1', lambda: 0.036, thick: 75 };
          c.layers[1] = { specId: 'is2', lambda: 0.035, thick: wallThick[z.id] + (variant === 'pre' ? 20 : 0) };
        }
        if (row.id === 'wall_indirect') {
          c.layers[0] = { specId: 'is1', lambda: 0.036, thick: 75 };
          c.layers[1] = { specId: 'is2', lambda: 0.035, thick: wallThick[z.id] + (variant === 'pre' ? 10 : 0) };
        }
        if (row.id === 'wall_int') {
          c.layers[0] = { specId: 'is2', lambda: 0.035, thick: 50 };
        }
        if (variant === 'pre' && row.id === 'roof_direct' && c.layers[1]) {
          c.layers[1].thick = (parseFloat(c.layers[1].thick) || 120) + 30;
        }
      });
    });
  }

  function calcUForCell(cell) {
    const p = PART_TYPES[cell.partType];
    if (!p) return { u: null, rTotal: 0, rLayers: 0, rFinish: 0, surf: { top: { r: 0 }, bottom: { r: 0 } } };
    const exposure = cell.exposure || 'direct';
    let surf;
    if (p.dualInterior) {
      surf = {
        top: { r: p.ri, label: '상부 실내 (Rᵢ=' + p.ri + ')' },
        bottom: { r: p.ri, label: '하부 실내 (Rᵢ=' + p.ri + ')' },
      };
    } else {
      const ro = p.ro[exposure];
      const expLabel = exposure === 'direct' ? '외기 직접' : '외기 간접';
      surf = {
        top: { r: ro, label: '실외 Rₒ=' + ro + ' (' + expLabel + ')' },
        bottom: { r: p.ri, label: '실내 Rᵢ=' + p.ri },
      };
    }
    let r = surf.top.r;
    let rLayers = 0;
    (cell.layers || []).forEach(L => { rLayers += layerR(layerLambda(L), L.thick); });
    r += rLayers;
    let rFinish = 0;
    const fin = finishById(cell.finishId);
    if (fin) {
      rFinish = fin.layers.reduce((s, fl) => s + finishLayerR(fl), 0);
      r += rFinish;
    }
    r += surf.bottom.r;
    return { u: r > 0 ? 1 / r : null, rTotal: r, rLayers, rFinish, surf };
  }

  function buildStructureTxtForCell(cell) {
    const bits = [];
    (cell.layers || []).forEach(L => {
      if (!L.specId || !L.thick) return;
      const sp = specById(L.specId);
      if (sp) bits.push(sp.name + ' ' + thickLabel(L.thick));
    });
    const fin = finishById(cell.finishId);
    if (fin) bits.push(fin.title);
    return bits.length ? bits.join(' + ') : '—';
  }

  /** 소재·두께(또는 마감)가 입력된 구조만 true — 미입력 시 U 초과 표시 안 함 */
  function cellHasStructure(cell) {
    return buildStructureTxtForCell(cell) !== '—';
  }

  function cellStructureHtml(cell) {
    const txt = buildStructureTxtForCell(cell);
    if (!txt || txt === '—') return '<span class="struct-empty">—</span>';
    const parts = txt.split(' + ');
    if (parts.length <= 1) return `<div class="struct-main">${escHtml(txt)}</div>`;
    return `<div class="struct-main">${parts.map(p => `<div class="struct-line">${escHtml(p)}</div>`).join('')}</div>`;
  }

  function partConfig() { return PART_TYPES[pkgPartType]; }

  function getSurfaceResistances() {
    const p = partConfig();
    if (p.dualInterior) {
      return {
        top: { r: p.ri, label: '상부 실내표면열전달저항 (Rᵢ=' + p.ri + ')' },
        bottom: { r: p.ri, label: '하부 실내표면열전달저항 (Rᵢ=' + p.ri + ')' },
      };
    }
    const ro = p.ro[pkgExposure];
    const expLabel = pkgExposure === 'direct' ? '외기 직접' : '외기 간접';
    return {
      top: { r: ro, label: '실외측 표면열전달저항 (Rₒ=' + ro + ', ' + expLabel + ')' },
      bottom: { r: p.ri, label: '실내측 표면열전달저항 (Rᵢ=' + p.ri + ')' },
    };
  }

  function persistEditorToCell() {
    const pkg = activePackage();
    const row = partRowById(activePartRow);
    if (!pkg || !activePartRow || !activeZone || !row) return;
    pkg.cells[cellKey(activePartRow, activeZone)] = {
      partType: row.partType,
      exposure: row.exposure || 'direct',
      finishId: pkgFinishId,
      layers: pkgLayers.map(L => ({ ...L })),
    };
  }

  function loadActiveCellToEditor() {
    const pkg = activePackage();
    if (!pkg || !hasCellSelection()) return;
    const row = partRowById(activePartRow);
    const cell = peekCell(pkg, activePartRow, activeZone);
    pkgPartType = row?.partType || cell.partType;
    pkgExposure = row?.exposure || cell.exposure || 'direct';
    pkgLayers = normalizeCellLayers(cell.layers);
    pkgFinishId = cell.finishId || '';
  }

  function syncLayerAddButton() {
    const btn = document.getElementById('insul-btn-add-layer');
    if (!btn) return;
    const on = hasCellSelection();
    btn.disabled = !on;
    btn.title = on ? '레이어 추가' : '부위·지역 셀을 먼저 선택하세요';
  }

  function addLayer() {
    if (!hasCellSelection()) {
      showToast('표에서 부위·지역 셀을 먼저 선택하세요', 'warning');
      return;
    }
    pkgLayers.push(emptyLayer());
    renderPackageTable();
  }

  function removeLayer(index) {
    if (!hasCellSelection()) return;
    if (pkgLayers.length <= 1) {
      showToast('레이어는 최소 1개가 필요합니다', 'warning');
      return;
    }
    pkgLayers.splice(index, 1);
    renderPackageTable();
  }

  function specOptionsHtml(selected) {
    let h = '<option value="">— 선택 —</option>';
    insulationSpecsForPackage().forEach(s => {
      h += `<option value="${escHtml(s.id)}" ${s.id === selected ? 'selected' : ''}>${escHtml(s.name)}</option>`;
    });
    return h;
  }

  function finishTotalMm(fin) {
    if (!fin?.layers?.length) return 0;
    return fin.layers.reduce((s, fl) => s + (parseFloat(fl.thick) || 0), 0);
  }

  function finishMmLabel(fin) {
    const mm = finishTotalMm(fin);
    return mm > 0 ? (Number.isInteger(mm) ? String(mm) : mm.toFixed(1)) : '—';
  }

  function finishOptionsHtml(selected) {
    let h = '<option value="">— 선택 안함 —</option>';
    data.finishOptions.forEach(f => {
      h += `<option value="${escHtml(f.id)}" ${f.id === selected ? 'selected' : ''}>${escHtml(f.title)}</option>`;
    });
    return h;
  }

  function finishSpecsOptionsHtml(selected) {
    let h = '<option value="">— 선택 —</option>';
    finishSpecsSorted().forEach(s => {
      h += `<option value="${escHtml(s.id)}" ${s.id === selected ? 'selected' : ''}>${escHtml(s.name)}</option>`;
    });
    return h;
  }

  function getPkgState() {
    persistEditorToCell();
    const pkg = activePackage();
    return pkg ? JSON.stringify({
      id: pkg.id,
      name: pkg.name,
      code: pkg.code,
      is_apartment: pkg.is_apartment,
      has_floor_heating: pkg.has_floor_heating,
      cells: pkg.cells,
    }) : '';
  }

  function syncPkgAttrsUI() {
    const pkg = activePackage();
    const apt = document.getElementById('insul-pkg-apartment');
    const heat = document.getElementById('insul-pkg-floor-heat');
    if (!pkg) return;
    if (apt) apt.value = pkg.is_apartment !== false ? '1' : '0';
    if (heat) heat.value = pkg.has_floor_heating !== false ? '1' : '0';
  }

  function readPkgAttrsFromUI() {
    const pkg = activePackage();
    if (!pkg) return;
    const apt = document.getElementById('insul-pkg-apartment');
    const heat = document.getElementById('insul-pkg-floor-heat');
    if (apt) pkg.is_apartment = apt.value === '1';
    if (heat) pkg.has_floor_heating = heat.value === '1';
  }

  function syncPkgSave() {
    const btn = document.getElementById('insul-btn-pkg-save');
    if (btn) btn.disabled = getPkgState() === savedPkgState;
  }

  function refreshExposureUI() {
    refreshCellUCompare();
  }

  function refreshCellUCompare() {
    const panel = document.getElementById('insul-cell-u-panel');
    const limitEl = document.getElementById('insul-limit-u');
    const calcEl = document.getElementById('insul-calc-u');
    const structEl = document.getElementById('insul-u-struct-summary');
    const thickEl = document.getElementById('insul-u-thickness');
    const metaEl = document.getElementById('insul-u-meta');
    const pkg = activePackage();
    const row = partRowById(activePartRow);
    if (!panel || !pkg || !row) return;

    const { u, rTotal, rLayers, rFinish, surf } = calcU();
    const calcRounded = u != null ? roundU(u) : null;
    if (calcEl) calcEl.textContent = calcRounded != null ? calcRounded.toFixed(3) : '—';

    const structTxt = buildStructureTxt();
    const hasStruct = structTxt !== '—';
    const fin = finishById(pkgFinishId);
    const rSurf = surf.top.r + surf.bottom.r;
    const thickSum = pkgLayers.reduce((s, L) => s + (parseFloat(L.thick) || 0), 0)
      + (fin ? finishTotalMm(fin) : 0);
    const showThick = hasStruct && thickSum > 0;
    const structRow = document.querySelector('.insul-u-struct-row');
    if (structEl) {
      if (hasStruct) {
        structEl.textContent = structTxt;
        structEl.hidden = false;
      } else {
        structEl.textContent = '';
        structEl.hidden = true;
      }
    }
    if (thickEl) {
      if (showThick) {
        thickEl.textContent = thickSum + 'mm';
        thickEl.hidden = false;
      } else {
        thickEl.textContent = '';
        thickEl.hidden = true;
      }
    }
    if (structRow) structRow.hidden = !hasStruct;
    if (metaEl) {
      if (calcRounded != null) {
        metaEl.textContent = `R=${rTotal.toFixed(3)} (표면${rSurf.toFixed(3)}+단열${rLayers.toFixed(3)}+마감${rFinish.toFixed(3)})`;
        metaEl.style.display = '';
      } else {
        metaEl.textContent = '';
        metaEl.style.display = 'none';
      }
    }

    const hasLimit = rowHasLegalLimit(activePartRow) && rowApplies(pkg, activePartRow);
    panel.classList.remove('insul-u-pass', 'insul-u-fail', 'insul-u-optional');

    if (!hasLimit) {
      if (limitEl) limitEl.textContent = '—';
      if (!rowApplies(pkg, activePartRow) || row.noLimit || row.partType === 'wall_interior') {
        panel.classList.add('insul-u-optional');
      }
      return;
    }

    const limit = getLegalLimitU(activePartRow, activeZone, pkg);
    if (limitEl) limitEl.textContent = limit != null ? '≤ ' + limit.toFixed(3) : '—';
    if (!hasStruct) return;
    if (limit != null && calcRounded != null) {
      const pass = calcRounded <= limit + 1e-9;
      panel.classList.add(pass ? 'insul-u-pass' : 'insul-u-fail');
    }
  }

  function renderPackageMatrix() {
    const pkg = activePackage();
    const el = document.getElementById('insul-pkg-matrix');
    if (!pkg || !el) return;
    const hdr = '<tr><th class="part-col part-col--corner" aria-hidden="true"></th>' +
      ZONES.map(z => '<th>' + escHtml(z.label) + '</th>').join('') + '</tr>';
    const body = visiblePartRows(pkg).map(row => {
      const cells = ZONES.map(z => {
        const active = activePartRow === row.id && activeZone === z.id ? ' active' : '';
        const c = peekCell(pkg, row.id, z.id);
        const res = calcUForCell(c);
        const limit = getLegalLimitU(row.id, z.id, pkg);
        const hasStruct = cellHasStructure(c);
        const fail = hasStruct && limit != null && res.u != null && res.u > limit + 1e-9;
        const optCls = !hasStruct ? ' cell-optional' : '';
        return `<td class="cell${active}${fail ? ' cell-fail' : ''}${optCls}" onclick="event.stopPropagation();Insulation.selectCell('${escHtml(row.id)}','${escHtml(z.id)}')">` +
          cellStructureHtml(c) + '</td>';
      }).join('');
      return `<tr><th class="part-col">${partRowLabelHtml(row)}</th>${cells}</tr>`;
    }).join('');
    const colgroup = '<colgroup><col class="col-part">' +
      ZONES.map(() => '<col class="col-zone">').join('') + '</colgroup>';
    el.innerHTML = colgroup + '<thead>' + hdr + '</thead><tbody>' + body + '</tbody>';
  }

  function buildStructureTxt() {
    const bits = [];
    pkgLayers.forEach(L => {
      if (!L.specId || !L.thick) return;
      const sp = specById(L.specId);
      if (sp) bits.push(sp.name + ' ' + thickLabel(L.thick));
    });
    const fin = finishById(pkgFinishId);
    if (fin) bits.push(fin.title);
    return bits.length ? bits.join(' + ') : '—';
  }

  function calcU() {
    const surf = getSurfaceResistances();
    let r = surf.top.r;
    let rLayers = 0;
    pkgLayers.forEach(L => { rLayers += layerR(layerLambda(L), L.thick); });
    r += rLayers;
    let rFinish = 0;
    const fin = finishById(pkgFinishId);
    if (fin) {
      rFinish = fin.layers.reduce((s, fl) => s + finishLayerR(fl), 0);
      r += rFinish;
    }
    r += surf.bottom.r;
    return { u: r > 0 ? 1 / r : null, rTotal: r, surf, rLayers, rFinish };
  }

  function renderPackageTable() {
    const fin = finishById(pkgFinishId);
    const surf = getSurfaceResistances();
    const rFinish = fin ? fin.layers.reduce((s, fl) => s + finishLayerR(fl), 0) : 0;
    let html = '';
    html += `<tr class="surface"><td class="col-no">표면</td>
      <td colspan="3"><input readonly value="${escHtml(surf.top.label)}"></td>
      <td class="col-r"><input readonly value="${fmtR(surf.top.r)}"></td>
      <td class="col-del" aria-hidden="true"></td></tr>`;
    const canRemoveLayer = pkgLayers.length > 1;
    for (let i = 0; i < pkgLayers.length; i++) {
      const L = pkgLayers[i];
      const rL = layerR(layerLambda(L), L.thick);
      const delBtn = canRemoveLayer
        ? `<button type="button" class="insul-layer-del-btn" onclick="Insulation.removeLayer(${i})" aria-label="레이어 ${i + 1} 삭제"><i class="fas fa-times"></i></button>`
        : '';
      html += `<tr><td class="col-no">${i + 1}</td>
        <td><select onchange="Insulation.onSpecPick(${i}, this.value)">${specOptionsHtml(L.specId)}</select></td>
        <td><input type="number" step="0.001" value="${L.lambda}" onchange="Insulation.onLayerField(${i},'lambda',this.value)"></td>
        <td><input type="number" step="1" value="${L.thick}" onchange="Insulation.onLayerField(${i},'thick',this.value)"></td>
        <td class="col-r"><input readonly value="${fmtR(rL)}"></td>
        <td class="col-del">${delBtn}</td></tr>`;
    }
    html += `<tr class="finish-row"><td class="col-no">마감</td>
      <td><select onchange="Insulation.onFinishPick(this.value)">${finishOptionsHtml(pkgFinishId)}</select></td>
      <td><input readonly value="—"></td>
      <td><input readonly value="${finishMmLabel(fin)}"></td>
      <td class="col-r"><input readonly value="${fmtR(rFinish)}"></td>
      <td class="col-del" aria-hidden="true"></td></tr>`;
    html += `<tr class="surface"><td class="col-no">표면</td>
      <td colspan="3"><input readonly value="${escHtml(surf.bottom.label)}"></td>
      <td class="col-r"><input readonly value="${fmtR(surf.bottom.r)}"></td>
      <td class="col-del" aria-hidden="true"></td></tr>`;
    const tbody = document.getElementById('insul-layer-tbody');
    if (tbody) tbody.innerHTML = html;
    syncLayerAddButton();

    refreshCellUCompare();
    persistEditorToCell();
    schedulePersistPackage();
    renderPackageMatrix();
    syncPkgSave();
  }

  /** 선택 해제 시 tbody 비움 → 우측·페이지 높이 변화로 가로 폭 흔들림 방지 */
  function renderLayerTablePlaceholder() {
    const tbody = document.getElementById('insul-layer-tbody');
    if (!tbody) return;
    let html = `<tr class="surface"><td class="col-no">표면</td>
      <td colspan="3"><input readonly value="—" tabindex="-1"></td>
      <td class="col-r"><input readonly value="—" tabindex="-1"></td>
      <td class="col-del" aria-hidden="true"></td></tr>`;
    for (let i = 0; i < DEFAULT_EMPTY_LAYER_COUNT; i++) {
      html += `<tr><td class="col-no">${i + 1}</td>
        <td><select disabled tabindex="-1"><option>—</option></select></td>
        <td><input type="number" readonly value="" tabindex="-1"></td>
        <td><input type="number" readonly value="" tabindex="-1"></td>
        <td class="col-r"><input readonly value="—" tabindex="-1"></td>
        <td class="col-del" aria-hidden="true"></td></tr>`;
    }
    html += `<tr class="finish-row"><td class="col-no">마감</td>
      <td><select disabled tabindex="-1"><option>—</option></select></td>
      <td><input readonly value="—" tabindex="-1"></td>
      <td><input readonly value="—" tabindex="-1"></td>
      <td class="col-r"><input readonly value="—" tabindex="-1"></td>
      <td class="col-del" aria-hidden="true"></td></tr>`;
    html += `<tr class="surface"><td class="col-no">표면</td>
      <td colspan="3"><input readonly value="—" tabindex="-1"></td>
      <td class="col-r"><input readonly value="—" tabindex="-1"></td>
      <td class="col-del" aria-hidden="true"></td></tr>`;
    tbody.innerHTML = html;
    syncLayerAddButton();
  }

  async function reorderPackages(orderedIds) {
    orderedIds.forEach((id, i) => {
      const p = packageById(id);
      if (p) p.sort_order = i;
    });
    data.packages.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    try {
      await Promise.all(data.packages.map(p => apiPersistPackage(p)));
      refreshPackageUi();
    } catch (e) {
      showToast('순서 저장 실패: ' + e.message, 'error');
    }
  }

  function initPackageListDnD() {
    const el = document.getElementById('insul-pkg-list-mgmt');
    if (!el || typeof makeSortable !== 'function') return;
    makeSortable(el, {
      itemSelector: '.insul-pkg-list-item',
      handleSelector: '.insul-pkg-drag-handle',
      getId: (item) => item.dataset.id,
      onReorder: reorderPackages,
    });
  }

  function fillPackageDuplicateOptions() {
    const sel = document.getElementById('insul-pkg-modal-duplicate-from');
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="">— 빈 패키지로 시작 —</option>' +
      data.packages.map(p =>
        `<option value="${escHtml(p.id)}">${escHtml(p.name)} (${escHtml(p.code)})</option>`
      ).join('');
    if (cur && data.packages.some(p => p.id === cur)) sel.value = cur;
  }

  function renderPackageList(containerId = 'insul-pkg-list-mgmt') {
    const el = document.getElementById(containerId);
    if (!el) return;
    if (!data.packages.length) {
      el.innerHTML = '<p class="insul-note" style="padding:12px;margin:0">패키지 없음</p>';
      return;
    }
    el.innerHTML = data.packages.map(p =>
      `<div class="insul-pkg-list-item ${p.id === activePackageId ? 'active' : ''}" data-id="${escHtml(p.id)}">
        <span class="insul-pkg-drag-handle" title="순서 변경"><i class="fas fa-grip-vertical"></i></span>
        <div class="insul-pkg-list-body">
          <div class="insul-pkg-list-main" onclick="Insulation.goToPackageCells('${escHtml(p.id)}')" title="단열 패키지 관리에서 구조 편집">
            <div class="insul-pkg-list-title-row">
              <span class="t">${escHtml(p.name)}</span>
              <span class="d">${escHtml(p.code)}</span>
            </div>
          </div>
          <div class="insul-pkg-list-actions">
            <button type="button" class="btn btn-xs btn-secondary" title="복제하여 추가"
              onclick="event.stopPropagation();Insulation.duplicatePackage('${escHtml(p.id)}')"><i class="fas fa-copy"></i></button>
            <button type="button" class="btn btn-xs btn-secondary" title="수정"
              onclick="event.stopPropagation();Insulation.editPackage('${escHtml(p.id)}')"><i class="fas fa-edit"></i></button>
            <button type="button" class="btn btn-xs btn-ghost" title="삭제" style="color:#dc2626"
              onclick="event.stopPropagation();Insulation.deletePackage('${escHtml(p.id)}','${escHtml(p.name)}')"><i class="fas fa-trash"></i></button>
          </div>
        </div>
      </div>`
    ).join('');
    initPackageListDnD();
  }

  function hasCellSelection() {
    return !!(activePartRow && activeZone && partRowById(activePartRow));
  }

  function syncCellEditorPanelState() {
    const panel = document.querySelector('.insul-pkg-cell-panel');
    const body = document.getElementById('insul-cell-editor-body');
    const sel = hasCellSelection();
    if (panel) panel.classList.toggle('insul-pkg-cell-panel--idle', !sel);
    if (body) body.setAttribute('aria-hidden', sel ? 'false' : 'true');
  }

  function updateCellEditorHeader() {
    const el = document.getElementById('insul-cell-editor-title');
    if (!el) return;
    if (!hasCellSelection()) {
      el.innerHTML = '<span class="insul-editor-idle">표에서 부위·지역 셀을 선택하세요</span>';
      return;
    }
    const row = PART_ROWS.find(r => r.id === activePartRow);
    const zone = ZONES.find(z => z.id === activeZone);
    const exp = partRowExposureLabel(row);
    el.innerHTML =
      `<span class="insul-editor-head">` +
        `<span class="insul-editor-head-top">` +
          `<span class="insul-editor-part">${escHtml(row?.title || '')}</span>` +
          `<span class="insul-editor-zone">${escHtml(zone?.label || '')}</span>` +
        `</span>` +
        (exp ? `<span class="insul-editor-exposure">${escHtml(exp)}</span>` : '') +
      `</span>`;
  }

  function clearCellSelection() {
    if (!hasCellSelection()) return;
    persistEditorToCell();
    activePartRow = null;
    activeZone = null;
    renderPackageMatrix();
    updateCellEditorHeader();
    syncCellEditorPanelState();
    renderLayerTablePlaceholder();
    const panel = document.getElementById('insul-cell-u-panel');
    if (panel) {
      panel.classList.remove('insul-u-pass', 'insul-u-fail', 'insul-u-optional');
      ['insul-limit-u', 'insul-calc-u'].forEach(id => {
        const n = document.getElementById(id);
        if (n) n.textContent = '—';
      });
      const thickEl = document.getElementById('insul-u-thickness');
      const structRow = document.querySelector('.insul-u-struct-row');
      if (thickEl) { thickEl.textContent = ''; thickEl.hidden = true; }
      const structElClear = document.getElementById('insul-u-struct-summary');
      if (structElClear) { structElClear.textContent = ''; structElClear.hidden = true; }
      if (structRow) structRow.hidden = true;
      ['insul-u-meta'].forEach(id => {
        const n = document.getElementById(id);
        if (n) { n.textContent = ''; n.style.display = 'none'; }
      });
    }
  }

  function bindInsulPkgOutsideClick() {
    if (window._insulPkgOutsideClickBound) return;
    window._insulPkgOutsideClickBound = true;
    document.addEventListener('click', (e) => {
      if (typeof State === 'undefined' || State.currentPage !== 'insulation-packages') return;
      if (!activePackageId || !hasCellSelection()) return;
      if (!e.target.closest('#insul-pkg-editor')) return;
      if (e.target.closest('#insul-pkg-matrix')) return;
      if (e.target.closest('.insul-pkg-cell-panel')) return;
      clearCellSelection();
    });
  }

  // ── Public API ──
  async function ensureReady() {
    if (typeof loadAll === 'function') await loadAll();
    try {
      await loadFromApi();
      await migrateFromLocalStorageIfNeeded();
      await seedIfEmpty();
    } catch (e) {
      console.error('[Insulation] Supabase load failed — docs/supabase/insulation.sql 실행 필요', e);
      const local = loadLocalSnapshot();
      if (local) {
        data.specs = local.specs || [];
        data.packages = (local.packages || []).map(p => ({ ...p, schemaVersion: p.schemaVersion ?? 2 }));
        data.finishOptions = local.finishOptions || [];
        migratePackages();
        showToast('단열 DB 연결 실패 — 로컬 데이터로 표시 중', 'warning');
      } else {
        showToast('단열 DB 연결 실패: ' + e.message, 'error');
      }
    }
  }

  function getPackages() { return data.packages; }

  function getLineupPackageId(lineupId) {
    if (typeof State !== 'undefined') {
      const eng = State.lineupEngineering.find(e => e.lineup_id === lineupId);
      if (eng?.insulation_package_id) return eng.insulation_package_id;
    }
    return '';
  }

  function setLineupPackageId() {
    /* 플랫폼 단열 패키지는 saveLineupEngineering(insulation_package_id)로 저장 */
  }

  async function renderSpecsPage() {
    await ensureReady();
    const tbody = document.getElementById('insul-spec-tbody');
    if (!tbody) return;
    tbody.innerHTML = specsSortedForTable().map(s => {
      const m = s.material_id ? materialById(s.material_id) : null;
      const matCell = m
        ? `<span class="insul-link-mat" onclick="Insulation.openSpecMatModal('${escHtml(s.id)}')">${escHtml(m.name)}</span>`
        : `<span class="insul-link-mat muted" onclick="Insulation.openSpecMatModal('${escHtml(s.id)}')"><i class="fas fa-link"></i> 연결</span>`;
      const fireHtml = s.fireRating
        ? `<span class="fire-badge fire-${s.fireRating}">${escHtml(s.fireRating)}</span>`
        : '<span style="color:var(--gray-300)">—</span>';
      return `<tr>
        <td><strong>${escHtml(s.name)}</strong></td>
        <td>${specRoleLabel(s.role)}</td>
        <td>${fireHtml}</td>
        <td>${matCell}</td>
        <td>${s.lambda ?? '—'}</td>
        <td>
          <button class="btn btn-sm btn-secondary" onclick="Insulation.editSpec('${escHtml(s.id)}')" title="수정"><i class="fas fa-edit"></i></button>
          <button class="btn btn-sm btn-ghost" onclick="Insulation.deleteSpec('${escHtml(s.id)}','${escHtml(s.name)}')" title="삭제"><i class="fas fa-trash"></i></button>
        </td>
      </tr>`;
    }).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--gray-400);padding:24px">등록된 단열 스펙이 없습니다</td></tr>';
    refreshPackageUi();
  }

  async function renderPackagesPage() {
    await ensureReady();
    bindInsulPkgOutsideClick();
    if (activePackageId && !packageById(activePackageId)) activePackageId = null;
    if (!activePackageId && data.packages[0]) activePackageId = data.packages[0].id;
    refreshPackageUi();
    syncPackageEditorVisibility();
    await applyActivePackageToEditor();
  }

  async function onPackageSelectChange(id) {
    if (!id || id === activePackageId) return;
    persistEditorToCell();
    try {
      await flushPersistPackage();
    } catch (e) {
      showToast('셀 저장 실패: ' + e.message, 'error');
      renderPackageSelect();
      return;
    }
    activePackageId = id;
    refreshPackageUi();
    syncPackageEditorVisibility();
    await applyActivePackageToEditor();
  }

  async function goToPackageCells(id) {
    if (!packageById(id)) return;
    if (activePackageId && activePackageId !== id) {
      persistEditorToCell();
      try { await flushPersistPackage(); } catch (e) {
        showToast('저장 실패: ' + e.message, 'error');
        return;
      }
    }
    activePackageId = id;
    if (typeof State !== 'undefined' && State.currentPage === 'insulation-packages') {
      refreshPackageUi();
      syncPackageEditorVisibility();
      await applyActivePackageToEditor();
      return;
    }
    if (typeof navigate === 'function') navigate('insulation-packages');
    else await renderPackagesPage();
  }

  async function renderFinishPage() {
    await ensureReady();
    if (!editingFinishId && data.finishOptions[0]) editingFinishId = data.finishOptions[0].id;
    renderFinishPanel();
  }

  function renderFinishPanel() {
    const list = document.getElementById('insul-finish-list');
    const editor = document.getElementById('insul-finish-editor');
    if (!list || !editor) return;
    list.innerHTML = data.finishOptions.map(f =>
      `<div class="insul-finish-list-item ${editingFinishId === f.id ? 'active' : ''}" onclick="Insulation.editFinish('${escHtml(f.id)}')">
        <div class="t">${escHtml(f.title)}</div>
        <div class="d">${f.layers.length}층 · U 기여 R≈${f.layers.reduce((s, l) => s + finishLayerR(l), 0).toFixed(3)}</div>
      </div>`
    ).join('') || '<p class="insul-note" style="padding:12px">마감 옵션이 없습니다</p>';

    const f = finishById(editingFinishId);
    if (!f) {
      editor.innerHTML = '<p class="insul-note">옵션을 선택하세요.</p>';
      return;
    }
    if (!finishSpecsSorted().length) {
      editor.innerHTML = '<p class="insul-note">단열 스펙에 <strong>마감재</strong> 분류를 먼저 등록하세요.</p>';
      return;
    }
    const rows = f.layers.map((L, i) => {
      const lam = layerLambda(L);
      return `<tr>
        <td class="col-no">${i + 1}</td>
        <td><select onchange="Insulation.onFinishSpecPick(${i}, this.value)">${finishSpecsOptionsHtml(L.specId)}</select></td>
        <td><input type="number" step="0.001" readonly value="${lam || ''}"></td>
        <td><input type="number" step="0.1" value="${L.thick}" onchange="Insulation.onFinishLayer(${i}, this.value)"></td>
        <td><button type="button" class="btn btn-sm btn-ghost" onclick="Insulation.removeFinishLayer(${i})"><i class="fas fa-times"></i></button></td>
      </tr>`;
    }).join('');
    editor.innerHTML = `
      <h4 style="font-size:15px;font-weight:700;margin-bottom:8px">${escHtml(f.title)}</h4>
      <p class="insul-note">마감재는 단열 스펙에서 선택 · λ 자동 · 두께(mm)만 입력</p>
      <div class="form-group" style="margin-bottom:12px">
        <label class="form-label">옵션명</label>
        <input type="text" class="form-control" value="${escHtml(f.title)}" onchange="Insulation.renameFinish('${escHtml(f.id)}', this.value)">
      </div>
      <table class="insul-layer-table">
        <thead><tr><th class="col-no">#</th><th>마감 스펙</th><th class="col-lambda">λ</th><th class="col-thick">mm</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <button type="button" class="btn btn-secondary btn-sm" style="margin-top:10px" onclick="Insulation.addFinishLayer()"><i class="fas fa-plus"></i> 레이어 추가</button>
      <button type="button" class="btn btn-ghost btn-sm" style="margin-top:10px;margin-left:8px" onclick="Insulation.deleteFinishOption('${escHtml(f.id)}')"><i class="fas fa-trash"></i> 옵션 삭제</button>`;
  }

  function packageRowsWithStructure(pkg) {
    if (!pkg) return [];
    return PART_ROWS.filter(row => {
      if (!rowApplies(pkg, row.id)) return false;
      return ZONES.some(z => cellHasStructure(peekCell(pkg, row.id, z.id)));
    });
  }

  function renderLineupPackageSummaryHtml(pkg) {
    if (!pkg) {
      return '<p class="ld-insul-preview-empty">단열 패키지를 선택하면 구조가 입력된 부위만 요약 표시됩니다.</p>';
    }
    const rows = packageRowsWithStructure(pkg);
    if (!rows.length) {
      return `<p class="ld-insul-preview-empty">「${escHtml(pkg.name)}」에 입력된 부위별 구조가 없습니다.</p>`;
    }
    const hdr = '<tr><th class="part-col">부위</th>' +
      ZONES.map(z => `<th>${escHtml(z.label)}</th>`).join('') + '</tr>';
    const body = rows.map(row => {
      const cells = ZONES.map(z => {
        if (!rowApplies(pkg, row.id)) {
          return '<td class="cell cell-na"><span class="struct-empty">—</span></td>';
        }
        const c = peekCell(pkg, row.id, z.id);
        const optCls = cellHasStructure(c) ? '' : ' cell-optional';
        return `<td class="cell cell-readonly${optCls}">${cellStructureHtml(c)}</td>`;
      }).join('');
      return `<tr><th class="part-col">${partRowLabelHtml(row)}</th>${cells}</tr>`;
    }).join('');
    const colgroup = '<colgroup><col class="col-part">' +
      ZONES.map(() => '<col class="col-zone">').join('') + '</colgroup>';
    return `
      <p class="ld-insul-preview-meta">${escHtml(limitCriteriaLabel(pkg))} · 구조 입력 <strong>${rows.length}</strong>개 부위</p>
      <div class="insul-matrix-wrap insul-matrix-wrap--compact">
        <table class="insul-matrix insul-matrix--preview">
          ${colgroup}
          <thead>${hdr}</thead>
          <tbody>${body}</tbody>
        </table>
      </div>`;
  }

  function refreshLineupPackagePreview() {
    const el = document.getElementById('ld-insul-pkg-preview');
    if (!el) return;
    const pkgId = document.getElementById('ld-insulation-package')?.value || '';
    const pkg = pkgId ? packageById(pkgId) : null;
    el.innerHTML = renderLineupPackageSummaryHtml(pkg);
    requestAnimationFrame(() => syncInsulNotesHeight());
  }

  function syncInsulNotesHeight() {
    const main = document.querySelector('.ld-insul-detail-main');
    const side = document.querySelector('.ld-insul-detail-side');
    const ta = document.getElementById('ld-insulation-notes');
    if (!main || !side || !ta) return;
    const labelH = side.querySelector('.ld-insul-notes-label')?.offsetHeight || 0;
    const gap = 6;
    const h = main.offsetHeight - labelH - gap;
    if (h > 80) ta.style.height = h + 'px';
  }

  async function persistLineupInsulationEng(lineupId) {
    if (!lineupId || typeof saveLineupEngineering !== 'function') return;
    const ok = await saveLineupEngineering(lineupId, {
      insulation_notes: document.getElementById('ld-insulation-notes')?.value ?? '',
      insulation_package_id: document.getElementById('ld-insulation-package')?.value ?? '',
    });
    return ok;
  }

  async function renderLineupSection(lineupId) {
    const el = document.getElementById('detail-insulation-section');
    if (!el) return;
    _lineupDetailInsulId = lineupId;
    await ensureReady();
    const current = getLineupPackageId(lineupId);
    const engNotes = typeof getLineupEng === 'function' ? getLineupEng(lineupId).insulation_notes : '';
    const opts = data.packages.map(p =>
      `<option value="${escHtml(p.id)}" ${p.id === current ? 'selected' : ''}>${escHtml(p.name)} (${escHtml(p.code)})</option>`
    ).join('');
    const pkg = data.packages.find(p => p.id === current);
    const previewHtml = renderLineupPackageSummaryHtml(pkg);
    el.innerHTML = `
      <div class="ld-section card">
        <div class="ld-section-head">
          <div class="ld-section-title">
            <i class="fas fa-temperature-low" style="color:#059669"></i>
            단열
          </div>
          <span class="ld-section-hint">패키지 선택 · 구조 입력 부위 요약</span>
        </div>
        <div class="card-body ld-section-body ld-insul-detail-layout">
          <div class="ld-insul-detail-main">
            <div class="ld-insul-pkg-row">
              <label for="ld-insulation-package">단열 패키지</label>
              <select id="ld-insulation-package" class="form-control"
                onchange="Insulation.onLineupPackageSelect()">
                <option value="">— 선택 —</option>
                ${opts}
              </select>
            </div>
            <div id="ld-insul-pkg-preview" class="ld-insul-pkg-preview">${previewHtml}</div>
          </div>
          <aside class="ld-insul-detail-side">
            <label class="ld-insul-notes-label" for="ld-insulation-notes">단열 메모</label>
            <textarea id="ld-insulation-notes" class="ld-insul-notes-compact"
              placeholder="단열 관련 메모…"
              oninput="Insulation.onLineupNotesInput()">${typeof escHtml === 'function' ? escHtml(engNotes) : engNotes}</textarea>
          </aside>
        </div>
      </div>`;
    requestAnimationFrame(() => syncInsulNotesHeight());
  }

  function onLineupNotesInput() {
    if (!_lineupDetailInsulId) return;
    clearTimeout(_notesSaveTimer);
    _notesSaveTimer = setTimeout(() => persistLineupInsulationEng(_lineupDetailInsulId), 600);
  }

  async function onLineupPackageSelect() {
    refreshLineupPackagePreview();
    if (_lineupDetailInsulId) await persistLineupInsulationEng(_lineupDetailInsulId);
  }

  function onLineupPackageChange(lineupId) {
    const sel = document.getElementById('ld-insulation-package');
    setLineupPackageId(lineupId, sel?.value || '');
  }

  function openPackageModal(pkg, duplicateFromId) {
    modalPackageId = pkg?.id || null;
    const isEdit = !!pkg;
    const dupWrap = document.getElementById('insul-pkg-duplicate-wrap');
    if (dupWrap) dupWrap.style.display = isEdit ? 'none' : '';
    document.getElementById('insul-pkg-modal-title').textContent = isEdit ? '단열 패키지 수정' : '단열 패키지 추가';
    document.getElementById('insul-pkg-modal-record-id').value = pkg?.id || '';
    document.getElementById('insul-pkg-modal-name').value = pkg?.name || '';
    document.getElementById('insul-pkg-modal-code').value = pkg?.code || (isEdit ? '' : 'INS-NEW');
    document.getElementById('insul-pkg-modal-apartment').value = pkg?.is_apartment !== false ? '1' : '0';
    document.getElementById('insul-pkg-modal-floor-heat').value = pkg?.has_floor_heating !== false ? '1' : '0';
    fillPackageDuplicateOptions();
    const dupSel = document.getElementById('insul-pkg-modal-duplicate-from');
    if (dupSel) dupSel.value = isEdit ? '' : (duplicateFromId || '');
    openModal('insul-pkg-modal');
    requestAnimationFrame(() => document.getElementById('insul-pkg-modal-name')?.focus());
  }

  function duplicatePackage(sourceId) {
    const src = packageById(sourceId);
    if (!src) return;
    openPackageModal(null, sourceId);
    const nameEl = document.getElementById('insul-pkg-modal-name');
    const codeEl = document.getElementById('insul-pkg-modal-code');
    if (nameEl) nameEl.value = (src.name || '') + ' (복제)';
    if (codeEl) codeEl.value = (src.code || 'INS') + '-COPY';
  }

  async function savePackageModal() {
    const recordId = document.getElementById('insul-pkg-modal-record-id').value.trim();
    const name = document.getElementById('insul-pkg-modal-name').value.trim();
    const code = document.getElementById('insul-pkg-modal-code').value.trim();
    const is_apartment = document.getElementById('insul-pkg-modal-apartment').value === '1';
    const has_floor_heating = document.getElementById('insul-pkg-modal-floor-heat').value === '1';
    if (!name) { showToast('패키지명을 입력하세요', 'error'); return; }
    if (!code) { showToast('코드를 입력하세요', 'error'); return; }

    const existing = packageById(modalPackageId || recordId);
    if (isPackageCodeTaken(code, existing?.id)) {
      showToast('이미 사용 중인 코드입니다', 'error');
      return;
    }

    if (existing) {
      existing.name = name;
      existing.code = code;
      existing.is_apartment = is_apartment;
      existing.has_floor_heating = has_floor_heating;
      activePackageId = existing.id;
    } else {
      const id = recordId || ('ins_' + Date.now());
      if (packageById(id)) { showToast('이미 사용 중인 ID입니다', 'error'); return; }
      const dupFrom = document.getElementById('insul-pkg-modal-duplicate-from')?.value || '';
      const src = dupFrom ? packageById(dupFrom) : null;
      const row = {
        id,
        name,
        code,
        cells: src ? cloneCells(src.cells) : {},
        sort_order: data.packages.length,
        ...defaultPackageAttrs(),
        is_apartment: src ? src.is_apartment !== false : is_apartment,
        has_floor_heating: src ? src.has_floor_heating !== false : has_floor_heating,
      };
      data.packages.push(row);
      activePackageId = id;
    }
    try {
      await apiPersistPackage(packageById(activePackageId));
      closeModal('insul-pkg-modal');
      showToast(existing ? '패키지 정보가 수정되었습니다' : '단열 패키지가 추가되었습니다');
      refreshPackageUi();
      syncPackageEditorVisibility();
      if (typeof State !== 'undefined' && State.currentPage === 'insulation-packages') {
        await applyActivePackageToEditor();
      }
    } catch (e) {
      showToast('저장 실패: ' + e.message, 'error');
    }
  }

  function deletePackage(id, name) {
    const pkg = packageById(id);
    if (!pkg) return;
    const linked = lineupNamesUsingPackage(id);
    const extra = linked.length
      ? `\n\n연결된 플랫폼 ${linked.length}개(${linked.join(', ')})의 단열 패키지 지정이 해제됩니다.`
      : '';
    confirmDelete(`단열 패키지 "${name}"을 삭제하시겠습니까?${extra}`, async () => {
      try {
        if (activePackageId === id) {
          persistEditorToCell();
          await flushPersistPackage();
        }
        await clearLineupPackageRefs(id);
        await apiDeletePackage(id);
        data.packages = data.packages.filter(p => p.id !== id);
        if (activePackageId === id) activePackageId = data.packages[0]?.id || null;
        showToast('삭제되었습니다');
        refreshPackageUi();
        syncPackageEditorVisibility();
        if (typeof State !== 'undefined' && State.currentPage === 'insulation-packages') {
          await applyActivePackageToEditor();
        }
        if (typeof State !== 'undefined' && State.currentPage === 'lineup-detail'
            && typeof renderLineupDetail === 'function' && typeof currentLineupId !== 'undefined' && currentLineupId) {
          renderLineupDetail(currentLineupId);
        }
      } catch (e) {
        showToast('삭제 실패: ' + e.message, 'error');
      }
    });
  }

  function openSpecModal(spec) {
    modalSpecId = spec?.id || null;
    document.getElementById('insul-spec-modal-title').textContent = spec ? '단열 스펙 수정' : '단열 스펙 추가';
    document.getElementById('insul-spec-id').value = spec?.id || '';
    document.getElementById('insul-spec-name').value = spec?.name || '';
    document.getElementById('insul-spec-role').value = spec?.role || 'insul';
    document.getElementById('insul-spec-lambda').value = spec?.lambda ?? '';
    document.getElementById('insul-spec-fire-rating').value = spec?.fireRating || '';
    document.getElementById('insul-spec-id').disabled = !!spec;
    openModal('insul-spec-modal');
  }

  async function saveSpec() {
    const id = document.getElementById('insul-spec-id').value.trim() || ('is_' + Date.now());
    const name = document.getElementById('insul-spec-name').value.trim();
    const role = document.getElementById('insul-spec-role').value;
    const lambda = parseFloat(document.getElementById('insul-spec-lambda').value);
    if (!name) { showToast('스펙명을 입력하세요', 'error'); return; }
    if (!lambda && lambda !== 0) { showToast('열전도율 λ를 입력하세요', 'error'); return; }
    const existing = specById(modalSpecId || id);
    const fireRating = document.getElementById('insul-spec-fire-rating').value;
    const row = {
      id: existing?.id || id,
      name,
      role,
      lambda,
      fireRating: fireRating || '',
      material_id: existing?.material_id || null,
    };
    if (existing) {
      const idx = data.specs.findIndex(s => s.id === existing.id);
      data.specs[idx] = row;
    } else {
      if (data.specs.some(s => s.id === row.id)) { showToast('이미 사용 중인 ID입니다', 'error'); return; }
      data.specs.push(row);
    }
    try {
      const idx = data.specs.findIndex(s => s.id === row.id);
      await apiPersistSpec(row, idx);
      closeModal('insul-spec-modal');
      showToast('단열 스펙이 저장되었습니다');
      await renderSpecsPage();
      if (document.getElementById('insul-pkg-matrix')) await renderPackagesPage();
      if (document.getElementById('insul-finish-list')) await renderFinishPage();
    } catch (e) {
      showToast('저장 실패: ' + e.message, 'error');
    }
  }

  function openSpecMatModal(specId) {
    if (typeof openInsulSpecMatQuickModal === 'function') {
      openInsulSpecMatQuickModal(specId);
      return;
    }
    showToast('자재 연결 UI를 불러올 수 없습니다', 'error');
  }

  async function linkSpecMaterial(specId, materialId) {
    const sp = specById(specId);
    const m = materialById(materialId);
    if (!sp || !m) throw new Error('스펙 또는 자재를 찾을 수 없습니다');
    if ((m.category || '') !== '단열재') {
      throw new Error('단열재 유형 자재만 연결할 수 있습니다');
    }
    const had = !!sp.material_id;
    sp.material_id = m.id;
    await apiPersistSpec(sp, data.specs.findIndex(s => s.id === specId));
    showToast(had ? '자재가 변경되었습니다' : '자재가 연결되었습니다');
    if (document.getElementById('insul-spec-tbody')) await renderSpecsPage();
    if (State?.currentPage === 'slot-materials' && typeof renderSlotMaterials === 'function') {
      await renderSlotMaterials();
    }
  }

  function init() {
    /* 데이터는 ensureReady() 시 Supabase에서 로드 */
  }

  return {
    init,
    ensureReady,
    renderSpecsPage,
    renderPackagesPage,
    renderFinishPage,
    renderLineupSection,
    refreshLineupPackagePreview,
    onLineupPackageSelect,
    onLineupNotesInput,
    getPackages,
    getSpecs: () => data.specs.slice(),
    getSpecById: (id) => specById(id),
    linkSpecMaterial,
    getLineupPackageId,
    setLineupPackageId,
    onLineupPackageChange,
    openSpecModal,
    editSpec: (id) => openSpecModal(specById(id)),
    addSpec: () => openSpecModal(null),
    saveSpec,
    deleteSpec: (id, name) => {
      confirmDelete(`단열 스펙 "${name}"을 삭제하시겠습니까?`, async () => {
        try {
          await apiDeleteSpec(id);
          data.specs = data.specs.filter(s => s.id !== id);
          showToast('삭제되었습니다');
          await renderSpecsPage();
        } catch (e) {
          showToast('삭제 실패: ' + e.message, 'error');
        }
      });
    },
    openSpecMatModal,
    selectPackage: (id) => onPackageSelectChange(id),
    onPackageSelectChange,
    goToPackageCells,
    openPackageModal,
    editPackage: (id) => openPackageModal(packageById(id)),
    editActivePackage: () => {
      const pkg = activePackage();
      if (pkg) openPackageModal(pkg);
    },
    deleteActivePackage: () => {
      const pkg = activePackage();
      if (pkg) deletePackage(pkg.id, pkg.name);
    },
    savePackageModal,
    addPackage: () => openPackageModal(null),
    deletePackage,
    savePackage: async () => {
      persistEditorToCell();
      readPkgAttrsFromUI();
      const pkg = activePackage();
      if (pkg) {
        pkg.name = document.getElementById('insul-pkg-name').value;
        pkg.code = document.getElementById('insul-pkg-code').value;
      }
      try {
        clearTimeout(_pkgPersistTimer);
        if (pkg) await apiPersistPackage(pkg);
        savedPkgState = getPkgState();
        syncPkgSave();
        showToast('단열 패키지가 저장되었습니다 (구조·cells 포함)');
        refreshPackageUi();
      } catch (e) {
        showToast('저장 실패: ' + e.message, 'error');
      }
    },
    duplicatePackage,
    selectCell: async (partRowId, zoneId) => {
      persistEditorToCell();
      try { await flushPersistPackage(); } catch (e) {
        showToast('셀 저장 실패: ' + e.message, 'error');
      }
      activePartRow = partRowId;
      activeZone = zoneId;
      loadActiveCellToEditor();
      updateCellEditorHeader();
      syncCellEditorPanelState();
      refreshExposureUI();
      renderPackageMatrix();
      renderPackageTable();
    },
    clearCellSelection,
    onPkgMetaInput: () => {
      const pkg = activePackage();
      if (pkg) {
        pkg.name = document.getElementById('insul-pkg-name').value;
        pkg.code = document.getElementById('insul-pkg-code').value;
        refreshPackageUi();
        schedulePersistPackage();
      }
      syncPkgSave();
    },
    onPkgAttrsChange: () => {
      readPkgAttrsFromUI();
      const pkg = activePackage();
      if (pkg && activePartRow === 'floor_between' && !rowApplies(pkg, 'floor_between')) {
        activePartRow = 'wall_direct';
        activeZone = activeZone || 'mid1';
        loadActiveCellToEditor();
        updateCellEditorHeader();
        syncCellEditorPanelState();
      }
      schedulePersistPackage();
      refreshExposureUI();
      renderPackageMatrix();
      renderPackageTable();
      syncPkgSave();
    },
    onSpecPick: (i, specId) => {
      pkgLayers[i].specId = specId;
      const sp = specById(specId);
      if (sp) {
        pkgLayers[i].lambda = sp.lambda ?? '';
        if (!pkgLayers[i].thick) pkgLayers[i].thick = 75;
      } else {
        pkgLayers[i].lambda = '';
        pkgLayers[i].thick = '';
      }
      renderPackageTable();
    },
    onLayerField: (i, key, val) => {
      pkgLayers[i][key] = val;
      renderPackageTable();
    },
    addLayer,
    removeLayer,
    onFinishPick: (id) => {
      pkgFinishId = id;
      renderPackageTable();
    },
    editFinish: (id) => { editingFinishId = id; renderFinishPanel(); renderPackageTable(); },
    onFinishSpecPick: (i, specId) => {
      const f = finishById(editingFinishId);
      if (f?.layers[i]) { f.layers[i].specId = specId; schedulePersistFinish(f); renderFinishPanel(); renderPackageTable(); }
    },
    onFinishLayer: (i, thick) => {
      const f = finishById(editingFinishId);
      if (f?.layers[i]) { f.layers[i].thick = parseFloat(thick) || 0; schedulePersistFinish(f); renderFinishPanel(); renderPackageTable(); }
    },
    removeFinishLayer: (i) => {
      const f = finishById(editingFinishId);
      f?.layers.splice(i, 1);
      if (f) schedulePersistFinish(f);
      renderFinishPanel();
      renderPackageTable();
    },
    addFinishLayer: () => {
      const specs = finishSpecsSorted();
      if (!specs.length) return;
      const f = finishById(editingFinishId);
      f?.layers.push({ specId: specs[0].id, thick: 9.5 });
      if (f) schedulePersistFinish(f);
      renderFinishPanel();
      renderPackageTable();
    },
    renameFinish: (id, title) => {
      const f = finishById(id);
      if (f) { f.title = title; schedulePersistFinish(f); renderFinishPanel(); renderPackageTable(); }
    },
    addFinishOption: async () => {
      const specs = finishSpecsSorted();
      if (!specs.length) { showToast('마감재 단열 스펙을 먼저 등록하세요', 'error'); return; }
      const id = 'fin_' + Date.now();
      const fin = { id, title: '새 마감 옵션', layers: [{ specId: specs[0].id, thick: 9.5 }] };
      data.finishOptions.push(fin);
      editingFinishId = id;
      try {
        await apiPersistFinish(fin, data.finishOptions.length - 1);
        await renderFinishPage();
      } catch (e) {
        showToast('추가 실패: ' + e.message, 'error');
      }
    },
    deleteFinishOption: (id) => {
      confirmDelete('이 마감 옵션을 삭제하시겠습니까?', async () => {
        try {
          await apiDeleteFinish(id);
          data.finishOptions = data.finishOptions.filter(f => f.id !== id);
          if (editingFinishId === id) editingFinishId = data.finishOptions[0]?.id || '';
          await renderFinishPage();
          showToast('삭제되었습니다');
        } catch (e) {
          showToast('삭제 실패: ' + e.message, 'error');
        }
      });
    },
  };
})();

document.addEventListener('DOMContentLoaded', () => {
  Insulation.init();
  const btn = document.getElementById('insul-btn-pkg-save');
  if (btn) btn.onclick = () => Insulation.savePackage();
  const specBtn = document.getElementById('insul-btn-spec-save');
  if (specBtn) specBtn.onclick = () => Insulation.saveSpec();
  const pkgModalBtn = document.getElementById('insul-btn-pkg-modal-save');
  if (pkgModalBtn) pkgModalBtn.onclick = () => Insulation.savePackageModal();
});
