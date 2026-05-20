/**
 * 단열 관리 — 스펙 / 패키지 / 실내 마감 (localStorage, 추후 Supabase 이전)
 */
const Insulation = (function () {
  const STORAGE_KEY = 'unitlab_insulation_v1';
  const LAYER_SLOTS = 4;

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
    { id: 'wall_direct', label: '거실 외벽 · 외기 직접', partType: 'wall', exposure: 'direct' },
    { id: 'wall_indirect', label: '거실 외벽 · 외기 간접', partType: 'wall', exposure: 'indirect' },
    { id: 'wall_int', label: '내벽', partType: 'wall_interior', exposure: null, noLimit: true },
    { id: 'roof_direct', label: '지붕·반자 · 외기 직접', partType: 'roof', exposure: 'direct' },
    { id: 'roof_indirect', label: '지붕·반자 · 외기 간접', partType: 'roof', exposure: 'indirect' },
    { id: 'floor_direct', label: '최하층 바닥 · 외기 직접', partType: 'floor_bottom', exposure: 'direct' },
    { id: 'floor_indirect', label: '최하층 바닥 · 외기 간접', partType: 'floor_bottom', exposure: 'indirect' },
    { id: 'floor_between', label: '바닥난방 층간바닥', partType: 'floor_between', exposure: null },
  ];

  const ZONES = [
    { id: 'mid1', label: '중부1' }, { id: 'mid2', label: '중부2' },
    { id: 'south', label: '남부' }, { id: 'jeju', label: '제주' },
  ];

  let data = { specs: [], packages: [], finishOptions: [], lineupPackages: {} };

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
  let modalMatId = null;
  let matPickFilter = '';

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) data = { ...data, ...JSON.parse(raw) };
    } catch (e) {
      console.warn('[Insulation] load failed', e);
    }
    if (!data.lineupPackages) data.lineupPackages = {};
    migratePackages();
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
    if (changed) save();
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

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function seedIfEmpty() {
    if (data.specs.length) return;
    data.specs = [
      { id: 'is1', name: '48K 그라스울 판넬', role: 'panel', material_id: null, lambda: 0.036 },
      { id: 'is2', name: '60K 미네랄울', role: 'insul', material_id: null, lambda: 0.035 },
      { id: 'is3', name: '80K 미네랄울', role: 'insul', material_id: null, lambda: 0.034 },
      { id: 'is-f1', name: '석고보드', role: 'finish', material_id: null, lambda: 0.18 },
      { id: 'is-f2', name: '석고보드(12.5)', role: 'finish', material_id: null, lambda: 0.21 },
      { id: 'is-f3', name: '도장층', role: 'finish', material_id: null, lambda: 0.5 },
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
    save();
  }

  function emptyLayers() {
    return Array.from({ length: LAYER_SLOTS }, () => ({ specId: '', lambda: '', thick: '' }));
  }

  function specById(id) { return data.specs.find(s => s.id === id); }
  function finishById(id) { return data.finishOptions.find(f => f.id === id); }
  function activePackage() { return data.packages.find(p => p.id === activePackageId); }
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

  function defaultCell(partType, exposure) {
    const cell = {
      partType,
      exposure: exposure || (partType === 'floor_bottom' ? 'direct' : 'direct'),
      finishId: '',
      layers: emptyLayers(),
    };
    if (partType === 'wall') {
      cell.layers[0] = { specId: 'is1', lambda: 0.036, thick: 75 };
      cell.layers[1] = { specId: 'is2', lambda: 0.035, thick: 100 };
    } else if (partType === 'wall_interior') {
      cell.layers[0] = { specId: 'is2', lambda: 0.035, thick: 50 };
    } else if (partType === 'roof') {
      cell.layers[0] = { specId: 'is1', lambda: 0.036, thick: 100 };
      cell.layers[1] = { specId: 'is2', lambda: 0.035, thick: 120 };
    } else if (partType === 'floor_bottom') {
      cell.layers[0] = { specId: 'is2', lambda: 0.035, thick: 80 };
    } else if (partType === 'floor_between') {
      cell.layers[0] = { specId: 'is2', lambda: 0.035, thick: 60 };
    }
    return cell;
  }

  function getCell(pkg, partRowId, zoneId) {
    const row = partRowById(partRowId);
    const k = cellKey(partRowId, zoneId);
    if (!pkg.cells[k]) {
      pkg.cells[k] = defaultCell(row?.partType || 'wall', row?.exposure);
    }
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
        const c = getCell(pkg, row.id, z.id);
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

  function cellStructureHtml(cell) {
    const txt = buildStructureTxtForCell(cell);
    if (!txt || txt === '—') return '<span class="struct-empty">구조 미입력</span>';
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
    if (!pkg) return;
    const row = partRowById(activePartRow);
    const cell = getCell(pkg, activePartRow, activeZone);
    pkgPartType = row?.partType || cell.partType;
    pkgExposure = row?.exposure || cell.exposure || 'direct';
    pkgLayers = cell.layers.map(L => ({ ...L }));
    pkgFinishId = cell.finishId || '';
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
    const crit = document.getElementById('insul-pkg-criteria-hint');
    if (!pkg) return;
    if (apt) apt.value = pkg.is_apartment !== false ? '1' : '0';
    if (heat) heat.value = pkg.has_floor_heating !== false ? '1' : '0';
    if (crit) crit.textContent = limitCriteriaLabel(pkg);
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
    const crit = document.getElementById('insul-pkg-criteria-hint');
    const pkg = activePackage();
    if (crit && pkg) crit.textContent = limitCriteriaLabel(pkg);
    refreshCellUCompare();
  }

  function refreshCellUCompare() {
    const panel = document.getElementById('insul-cell-u-panel');
    const limitEl = document.getElementById('insul-limit-u');
    const calcEl = document.getElementById('insul-calc-u');
    const statusEl = document.getElementById('insul-u-status');
    const structEl = document.getElementById('insul-u-struct-summary');
    const metaEl = document.getElementById('insul-u-meta');
    const pkg = activePackage();
    const row = partRowById(activePartRow);
    if (!panel || !pkg || !row) return;

    const { u, rTotal, rLayers, rFinish, surf } = calcU();
    const calcRounded = u != null ? roundU(u) : null;
    if (calcEl) calcEl.textContent = calcRounded != null ? calcRounded.toFixed(3) : '—';

    const structTxt = buildStructureTxt();
    if (structEl) {
      structEl.textContent = structTxt !== '—' ? structTxt : '';
      structEl.style.display = structTxt !== '—' ? '' : 'none';
    }
    const fin = finishById(pkgFinishId);
    const rSurf = surf.top.r + surf.bottom.r;
    const thickSum = pkgLayers.reduce((s, L) => s + (parseFloat(L.thick) || 0), 0)
      + (fin ? finishTotalMm(fin) : 0);
    if (metaEl) {
      if (calcRounded != null) {
        metaEl.textContent = `R=${rTotal.toFixed(3)} (표면${rSurf.toFixed(3)}+단열${rLayers.toFixed(3)}+마감${rFinish.toFixed(3)}) · ${thickSum}mm`;
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
      if (statusEl) {
        if (!rowApplies(pkg, activePartRow)) {
          statusEl.textContent = '바닥난방 미적용 — 층간바닥 행 해당 없음';
        } else if (row.noLimit || row.partType === 'wall_interior') {
          statusEl.textContent = calcRounded != null
            ? '기준 없음 · 참고 계산 U ' + calcRounded.toFixed(3) + ' W/m²·K'
            : '기준 열관류율 미적용 · 구조만 정의';
          panel.classList.add('insul-u-optional');
        } else {
          statusEl.textContent = '';
        }
      }
      return;
    }

    const limit = getLegalLimitU(activePartRow, activeZone, pkg);
    if (limitEl) limitEl.textContent = limit != null ? '≤ ' + limit.toFixed(3) : '—';
    if (limit != null && calcRounded != null && statusEl) {
      const pass = calcRounded <= limit + 1e-9;
      const diff = (calcRounded - limit).toFixed(3);
      statusEl.textContent = pass
        ? `[별표1] 기준 충족 · 계산 ${calcRounded.toFixed(3)} ≤ ${limit.toFixed(3)}`
        : `[별표1] 기준 초과 · 계산 ${calcRounded.toFixed(3)} > ${limit.toFixed(3)} (+${diff})`;
      panel.classList.add(pass ? 'insul-u-pass' : 'insul-u-fail');
    } else if (statusEl) {
      statusEl.textContent = '층 두께·소재를 입력하면 계산 U가 표시됩니다';
    }
  }

  function renderPackageMatrix() {
    const pkg = activePackage();
    const el = document.getElementById('insul-pkg-matrix');
    if (!pkg || !el) return;
    const hdr = '<tr><th class="part-col">부위 \ 지역</th>' +
      ZONES.map(z => '<th>' + escHtml(z.label) + '</th>').join('') + '</tr>';
    const body = PART_ROWS.map(row => {
      const cells = ZONES.map(z => {
        const active = activePartRow === row.id && activeZone === z.id ? ' active' : '';
        if (!rowApplies(pkg, row.id)) {
          return `<td class="cell cell-na${active}" onclick="Insulation.selectCell('${escHtml(row.id)}','${escHtml(z.id)}')">` +
            `<div class="u-mini muted">해당 없음</div><div class="struct-mini">바닥난방 미적용</div></td>`;
        }
        const c = getCell(pkg, row.id, z.id);
        const res = calcUForCell(c);
        const limit = getLegalLimitU(row.id, z.id, pkg);
        const fail = limit != null && res.u != null && res.u > limit + 1e-9;
        const optCls = row.noLimit ? ' cell-optional' : '';
        return `<td class="cell${active}${fail ? ' cell-fail' : ''}${optCls}" onclick="Insulation.selectCell('${escHtml(row.id)}','${escHtml(z.id)}')">` +
          cellStructureHtml(c) + '</td>';
      }).join('');
      return `<tr><th class="part-col">${escHtml(row.label)}</th>${cells}</tr>`;
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
      <td class="col-r"><input readonly value="${fmtR(surf.top.r)}"></td></tr>`;
    for (let i = 0; i < LAYER_SLOTS; i++) {
      const L = pkgLayers[i];
      const rL = layerR(layerLambda(L), L.thick);
      html += `<tr><td class="col-no">${i + 1}</td>
        <td><select onchange="Insulation.onSpecPick(${i}, this.value)">${specOptionsHtml(L.specId)}</select></td>
        <td><input type="number" step="0.001" value="${L.lambda}" onchange="Insulation.onLayerField(${i},'lambda',this.value)"></td>
        <td><input type="number" step="1" value="${L.thick}" onchange="Insulation.onLayerField(${i},'thick',this.value)"></td>
        <td class="col-r"><input readonly value="${fmtR(rL)}"></td></tr>`;
    }
    html += `<tr class="finish-row"><td class="col-no">마감</td>
      <td><select onchange="Insulation.onFinishPick(this.value)">${finishOptionsHtml(pkgFinishId)}</select></td>
      <td><input readonly value="—"></td>
      <td><input readonly value="${finishMmLabel(fin)}"></td>
      <td class="col-r"><input readonly value="${fmtR(rFinish)}"></td></tr>`;
    html += `<tr class="surface"><td class="col-no">표면</td>
      <td colspan="3"><input readonly value="${escHtml(surf.bottom.label)}"></td>
      <td class="col-r"><input readonly value="${fmtR(surf.bottom.r)}"></td></tr>`;
    const tbody = document.getElementById('insul-layer-tbody');
    if (tbody) tbody.innerHTML = html;

    refreshCellUCompare();
    persistEditorToCell();
    renderPackageMatrix();
    syncPkgSave();
  }

  function renderPackageList() {
    const el = document.getElementById('insul-pkg-list');
    if (!el) return;
    el.innerHTML = data.packages.map(p =>
      `<div class="insul-pkg-list-item ${p.id === activePackageId ? 'active' : ''}" onclick="Insulation.selectPackage('${escHtml(p.id)}')">
        <div class="t">${escHtml(p.name)}</div>
        <div class="d">${escHtml(p.code)}</div></div>`
    ).join('');
  }

  function updateCellEditorHeader() {
    const row = PART_ROWS.find(r => r.id === activePartRow);
    const zone = ZONES.find(z => z.id === activeZone);
    const el = document.getElementById('insul-cell-editor-title');
    if (el) el.textContent = (row?.label || '') + ' · ' + (zone?.label || '') + ' 편집';
  }

  // ── Public API ──
  async function ensureReady() {
    if (typeof loadAll === 'function') await loadAll();
    load();
    seedIfEmpty();
  }

  function getPackages() { return data.packages; }

  function getLineupPackageId(lineupId) {
    return data.lineupPackages[lineupId] || '';
  }

  function setLineupPackageId(lineupId, packageId) {
    if (packageId) data.lineupPackages[lineupId] = packageId;
    else delete data.lineupPackages[lineupId];
    save();
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
      return `<tr>
        <td><strong>${escHtml(s.name)}</strong></td>
        <td>${specRoleLabel(s.role)}</td>
        <td>${matCell}</td>
        <td>${s.lambda ?? '—'}</td>
        <td>
          <button class="btn btn-sm btn-secondary" onclick="Insulation.editSpec('${escHtml(s.id)}')" title="수정"><i class="fas fa-edit"></i></button>
          <button class="btn btn-sm btn-ghost" onclick="Insulation.deleteSpec('${escHtml(s.id)}','${escHtml(s.name)}')" title="삭제"><i class="fas fa-trash"></i></button>
        </td>
      </tr>`;
    }).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--gray-400);padding:24px">등록된 단열 스펙이 없습니다</td></tr>';
  }

  async function renderPackagesPage() {
    await ensureReady();
    if (!activePackageId && data.packages[0]) activePackageId = data.packages[0].id;
    const pkg = activePackage();
    if (pkg) {
      const n = document.getElementById('insul-pkg-name');
      const c = document.getElementById('insul-pkg-code');
      if (n) n.value = pkg.name;
      if (c) c.value = pkg.code;
    }
    renderPackageList();
    syncPkgAttrsUI();
    if (!activePartRow || !partRowById(activePartRow)) { activePartRow = 'wall_direct'; activeZone = 'mid1'; }
    loadActiveCellToEditor();
    updateCellEditorHeader();
    refreshExposureUI();
    savedPkgState = getPkgState();
    renderPackageTable();
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

  function renderLineupSection(lineupId) {
    const el = document.getElementById('detail-insulation-section');
    if (!el) return;
    load();
    const current = getLineupPackageId(lineupId);
    const opts = data.packages.map(p =>
      `<option value="${escHtml(p.id)}" ${p.id === current ? 'selected' : ''}>${escHtml(p.name)} (${escHtml(p.code)})</option>`
    ).join('');
    const pkg = data.packages.find(p => p.id === current);
    el.innerHTML = `
      <div class="ld-section card">
        <div class="ld-section-head">
          <div class="ld-section-title">
            <i class="fas fa-temperature-low" style="color:#059669"></i>
            단열
          </div>
          <span class="ld-section-hint">단열 패키지 · [별표5] U 계산</span>
        </div>
        <div class="card-body ld-section-body">
          <div class="ld-insul-pkg-row">
            <label for="ld-insulation-package">단열 패키지</label>
            <select id="ld-insulation-package" class="form-control" onchange="typeof refreshEngSaveBtn==='function'&&refreshEngSaveBtn('eng-save-detail-insulation')">
              <option value="">— 선택 —</option>
              ${opts}
            </select>
            <p class="ld-insul-pkg-hint">${pkg ? '별표1 부위×4지역 · ' : ''}<a href="#" class="link-btn" onclick="event.preventDefault();navigate('insulation-packages')">패키지 편집</a></p>
          </div>
          ${_ldNarrativeField('단열 메모', 'ld-insulation-notes', (typeof getLineupEng === 'function' ? getLineupEng(lineupId).insulation_notes : ''), '단열 관련 메모…', 6)}
          <div class="ld-section-actions">
            ${_engSaveBtnHtml('eng-save-detail-insulation', '단열 저장', "saveLineupEngFromDetail('insulation')")}
          </div>
        </div>
      </div>`;
    if (typeof bindEngSaveControls === 'function') {
      bindEngSaveControls({
        btnId: 'eng-save-detail-insulation',
        lineupId,
        section: 'insulation',
        inputIds: ['ld-insulation-notes', 'ld-insulation-package'],
      });
    }
  }

  function onLineupPackageChange(lineupId) {
    const sel = document.getElementById('ld-insulation-package');
    setLineupPackageId(lineupId, sel?.value || '');
    if (typeof refreshEngSaveBtn === 'function') refreshEngSaveBtn('eng-save-detail-insulation');
  }

  function openSpecModal(spec) {
    modalSpecId = spec?.id || null;
    document.getElementById('insul-spec-modal-title').textContent = spec ? '단열 스펙 수정' : '단열 스펙 추가';
    document.getElementById('insul-spec-id').value = spec?.id || '';
    document.getElementById('insul-spec-name').value = spec?.name || '';
    document.getElementById('insul-spec-role').value = spec?.role || 'insul';
    document.getElementById('insul-spec-lambda').value = spec?.lambda ?? '';
    document.getElementById('insul-spec-id').disabled = !!spec;
    openModal('insul-spec-modal');
  }

  function saveSpec() {
    const id = document.getElementById('insul-spec-id').value.trim() || ('is_' + Date.now());
    const name = document.getElementById('insul-spec-name').value.trim();
    const role = document.getElementById('insul-spec-role').value;
    const lambda = parseFloat(document.getElementById('insul-spec-lambda').value);
    if (!name) { showToast('스펙명을 입력하세요', 'error'); return; }
    if (!lambda && lambda !== 0) { showToast('열전도율 λ를 입력하세요', 'error'); return; }
    const existing = specById(modalSpecId || id);
    const row = {
      id: existing?.id || id,
      name,
      role,
      lambda,
      material_id: existing?.material_id || null,
    };
    if (existing) {
      const idx = data.specs.findIndex(s => s.id === existing.id);
      data.specs[idx] = row;
    } else {
      if (data.specs.some(s => s.id === row.id)) { showToast('이미 사용 중인 ID입니다', 'error'); return; }
      data.specs.push(row);
    }
    save();
    closeModal('insul-spec-modal');
    showToast('단열 스펙이 저장되었습니다');
    renderSpecsPage();
    if (document.getElementById('insul-pkg-matrix')) renderPackagesPage();
    if (document.getElementById('insul-finish-list')) renderFinishPage();
  }

  function openSpecMatModal(specId) {
    modalSpecId = specId;
    const sp = specById(specId);
    modalMatId = sp?.material_id || null;
    matPickFilter = '';
    const search = document.getElementById('insul-mat-pick-search');
    if (search) search.value = '';
    document.getElementById('insul-mat-pick-title').textContent = '자재 연결 — ' + (sp?.name || '');
    renderMatPickList();
    openModal('insul-spec-mat-modal');
  }

  function renderMatPickList() {
    const q = matPickFilter.toLowerCase();
    let mats = materialsSorted();
    if (q) mats = mats.filter(m => (m.name || '').toLowerCase().includes(q) || (m.id || '').toLowerCase().includes(q));
    const list = document.getElementById('insul-mat-pick-list');
    const btn = document.getElementById('insul-mat-pick-confirm');
    if (!list) return;
    if (!mats.length) {
      list.innerHTML = '<p style="color:var(--gray-400);font-size:13px">연결 가능한 자재가 없습니다. 자재 DB에 먼저 등록하세요.</p>';
      if (btn) btn.disabled = true;
      return;
    }
    list.innerHTML = mats.map(m =>
      `<div class="insul-mat-pick-row ${modalMatId === m.id ? 'sel' : ''}" onclick="Insulation.pickSpecMat('${escHtml(m.id)}')">
        <strong>${escHtml(m.name)}</strong>
        <div style="font-size:11px;color:var(--gray-500);margin-top:2px">${escHtml(m.category || '')} · ${escHtml(m.id)}</div>
      </div>`
    ).join('');
    if (btn) btn.disabled = !modalMatId;
  }

  function saveSpecMat() {
    const sp = specById(modalSpecId);
    const m = materialById(modalMatId);
    if (!sp || !m) return;
    sp.material_id = m.id;
    save();
    closeModal('insul-spec-mat-modal');
    showToast('자재가 연결되었습니다');
    renderSpecsPage();
  }

  function init() {
    load();
    seedIfEmpty();
  }

  return {
    init,
    ensureReady,
    renderSpecsPage,
    renderPackagesPage,
    renderFinishPage,
    renderLineupSection,
    getPackages,
    getLineupPackageId,
    setLineupPackageId,
    onLineupPackageChange,
    openSpecModal,
    editSpec: (id) => openSpecModal(specById(id)),
    addSpec: () => openSpecModal(null),
    saveSpec,
    deleteSpec: (id, name) => {
      confirmDelete(`단열 스펙 "${name}"을 삭제하시겠습니까?`, () => {
        data.specs = data.specs.filter(s => s.id !== id);
        save();
        showToast('삭제되었습니다');
        renderSpecsPage();
      });
    },
    openSpecMatModal,
    pickSpecMat: (id) => { modalMatId = id; renderMatPickList(); },
    filterMatPick: (v) => { matPickFilter = v; renderMatPickList(); },
    saveSpecMat,
    selectPackage: (id) => {
      persistEditorToCell();
      activePackageId = id;
      const pkg = activePackage();
      if (!pkg) return;
      document.getElementById('insul-pkg-name').value = pkg.name;
      document.getElementById('insul-pkg-code').value = pkg.code;
      syncPkgAttrsUI();
      renderPackageList();
      renderPackageMatrix();
      loadActiveCellToEditor();
      updateCellEditorHeader();
      refreshExposureUI();
      renderPackageTable();
      syncPkgSave();
    },
    addPackage: () => {
      persistEditorToCell();
      const id = 'ins_' + Date.now();
      data.packages.push({ id, name: '신규 단열 패키지', code: 'INS-NEW', cells: {}, ...defaultPackageAttrs() });
      save();
      activePackageId = id;
      renderPackagesPage();
    },
    savePackage: () => {
      persistEditorToCell();
      readPkgAttrsFromUI();
      const pkg = activePackage();
      if (pkg) {
        pkg.name = document.getElementById('insul-pkg-name').value;
        pkg.code = document.getElementById('insul-pkg-code').value;
      }
      save();
      savedPkgState = getPkgState();
      syncPkgSave();
      showToast('단열 패키지가 저장되었습니다');
      renderPackageList();
    },
    selectCell: (partRowId, zoneId) => {
      persistEditorToCell();
      activePartRow = partRowId;
      activeZone = zoneId;
      loadActiveCellToEditor();
      updateCellEditorHeader();
      refreshExposureUI();
      renderPackageMatrix();
      renderPackageTable();
    },
    onPkgMetaInput: () => {
      const pkg = activePackage();
      if (pkg) {
        pkg.name = document.getElementById('insul-pkg-name').value;
        pkg.code = document.getElementById('insul-pkg-code').value;
        save();
        renderPackageList();
      }
      syncPkgSave();
    },
    onPkgAttrsChange: () => {
      readPkgAttrsFromUI();
      save();
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
        if (!pkgLayers[i].thick) pkgLayers[i].thick = sp.role === 'panel' ? 75 : 100;
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
    onFinishPick: (id) => {
      pkgFinishId = id;
      renderPackageTable();
    },
    editFinish: (id) => { editingFinishId = id; renderFinishPanel(); renderPackageTable(); },
    onFinishSpecPick: (i, specId) => {
      const f = finishById(editingFinishId);
      if (f?.layers[i]) { f.layers[i].specId = specId; save(); renderFinishPanel(); renderPackageTable(); }
    },
    onFinishLayer: (i, thick) => {
      const f = finishById(editingFinishId);
      if (f?.layers[i]) { f.layers[i].thick = parseFloat(thick) || 0; save(); renderFinishPanel(); renderPackageTable(); }
    },
    removeFinishLayer: (i) => {
      finishById(editingFinishId)?.layers.splice(i, 1);
      save();
      renderFinishPanel();
      renderPackageTable();
    },
    addFinishLayer: () => {
      const specs = finishSpecsSorted();
      if (!specs.length) return;
      finishById(editingFinishId)?.layers.push({ specId: specs[0].id, thick: 9.5 });
      save();
      renderFinishPanel();
      renderPackageTable();
    },
    renameFinish: (id, title) => {
      const f = finishById(id);
      if (f) { f.title = title; save(); renderFinishPanel(); renderPackageTable(); }
    },
    addFinishOption: () => {
      const specs = finishSpecsSorted();
      if (!specs.length) { showToast('마감재 단열 스펙을 먼저 등록하세요', 'error'); return; }
      const id = 'fin_' + Date.now();
      data.finishOptions.push({ id, title: '새 마감 옵션', layers: [{ specId: specs[0].id, thick: 9.5 }] });
      editingFinishId = id;
      save();
      renderFinishPage();
    },
    deleteFinishOption: (id) => {
      confirmDelete('이 마감 옵션을 삭제하시겠습니까?', () => {
        data.finishOptions = data.finishOptions.filter(f => f.id !== id);
        if (editingFinishId === id) editingFinishId = data.finishOptions[0]?.id || '';
        save();
        renderFinishPage();
      });
    },
  };
})();

document.addEventListener('DOMContentLoaded', () => {
  Insulation.init();
  const btn = document.getElementById('insul-btn-pkg-save');
  if (btn) btn.onclick = () => Insulation.savePackage();
  const matBtn = document.getElementById('insul-mat-pick-confirm');
  if (matBtn) matBtn.onclick = () => Insulation.saveSpecMat();
  const specBtn = document.getElementById('insul-btn-spec-save');
  if (specBtn) specBtn.onclick = () => Insulation.saveSpec();
});
