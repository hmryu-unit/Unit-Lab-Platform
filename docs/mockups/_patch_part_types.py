from pathlib import Path
D = "d" + "iv"

p = Path("insulation-v2-mockup.html")
t = p.read_text(encoding="utf-8")
t = t.replace("<motion", "<" + D).replace("</motion>", "</" + D + ">")

old_pkg = """  <section class="panel" id="panel-packages">
    <p class="note">표에서 소재(단열 스펙)를 고르고 두께·λ를 조정하세요. 하단 <strong>실내 마감 옵션</strong>도 U 계산에 합산됩니다.</p>
    <div class="card">
      <motion class="card-b">
        <div class="pkg-head">
          <div class="field"><label>패키지명</label><input type="text" id="pkg-name" value="벽체 표준형 A"></div>
          <div class="field"><label>코드</label><input type="text" id="pkg-code" value="INS-WALL-A" style="font-family:monospace;min-width:130px"></div>
        </div>

        <table class="layer-table">""".replace("motion", D)

new_pkg = """  <section class="panel" id="panel-packages">
    <p class="note">패키지마다 <strong>건물 부위</strong>를 지정합니다. [별표5] Rᵢ·Rₒ가 부위별로 적용되며, 층간 바닥은 실내 양면(외기 없음)입니다.</p>
    <div class="card">
      <div class="card-b">
        <motion class="pkg-head">
          <div class="field"><label>패키지명</label><input type="text" id="pkg-name" value="벽체 표준형 A"></div>
          <div class="field"><label>코드</label><input type="text" id="pkg-code" value="INS-WALL-A" style="font-family:monospace;min-width:130px"></div>
          <div class="field"><label>건물 부위</label>
            <select id="pkg-part" onchange="onPartTypeChange()">
              <option value="wall">거실 외벽</option>
              <option value="floor_bottom">최하층 거실 바닥</option>
              <option value="roof">최상층 지붕·반자</option>
              <option value="floor_between">공동주택 층간 바닥</option>
            </select>
          </div>
          <div class="field" id="field-exposure">
            <label>외기 조건 (Rₒ)</label>
            <select id="pkg-exposure" onchange="onExposureChange()">
              <option value="direct">외기 직접</option>
              <option value="indirect">외기 간접</option>
            </select>
          </div>
        </div>
        <div class="legal-box" id="legal-surface-hint"></div>

        <table class="layer-table">""".replace("motion", D)

if old_pkg not in t:
    raise SystemExit("pkg block not found")
t = t.replace(old_pkg, new_pkg, 1)

t = t.replace(
    '<div class="lbl">벽체 열관류율 U</motion>',
    '<div class="lbl" id="u-part-label">외벽 열관류율 U</' + D + '>'
)

# Replace script block from const R_OUT through savedPkgState init - use marker
start = t.index("  const R_OUT = 0.04;")
end = t.index("  document.querySelectorAll('.tabs button')")

new_js = r'''  /** 건축물 에너지절약설계기준 [별표5] 표면열전달저항 (㎡·K/W) */
  const PART_TYPES = {
    wall: {
      label: '거실 외벽', short: '외벽',
      ri: 0.11, ro: { direct: 0.043, indirect: 0.11 },
      dualInterior: false,
      roleHints: ['외단열', '외단열', '내단열', '내단열'],
    },
    floor_bottom: {
      label: '최하층 거실 바닥', short: '바닥',
      ri: 0.086, ro: { direct: 0.043, indirect: 0.15 },
      dualInterior: false,
      roleHints: ['하부 단열', '하부 단열', '상부 마감', '—'],
    },
    roof: {
      label: '최상층 지붕·반자', short: '지붕',
      ri: 0.086, ro: { direct: 0.043, indirect: 0.086 },
      dualInterior: false,
      roleHints: ['외단열', '외단열', '내단열', '—'],
    },
    floor_between: {
      label: '공동주택 층간 바닥', short: '층간바닥',
      ri: 0.086, ro: null,
      dualInterior: true,
      roleHints: ['상부층', '상부층', '하부층', '—'],
    },
  };

  const LAYER_SLOTS = 4;
  let pkgPartType = 'wall';
  let pkgExposure = 'direct';

  const MATERIALS = [
'''

# Find where MATERIALS starts in original and splice
mat_start = t.index("  const MATERIALS = [", start)
t = t[:start] + new_js + t[mat_start:]

# Remove old R_OUT R_IN ROLE_LABELS if still there - the new_js doesn't include them, good

# Replace calcU and renderPackageTable - find function calcU
old_calc = """  function calcU() {
    let r = R_OUT;
    const parts = [];
    pkgLayers.forEach(L => {
      const rL = layerR(L.lambda, L.thick);
      if (rL > 0) {
        r += rL;
        const sp = specById(L.specId);
        parts.push({ label: sp?.name || '층', r: rL });
      }
    });
    const fin = finishById(pkgFinishId);
    if (fin) {
      fin.layers.forEach(fl => {
        const rF = layerR(fl.lambda, fl.thick);
        if (rF > 0) { r += rF; parts.push({ label: fl.name, r: rF }); }
      });
    }
    r += R_IN;
    const u = r > 0 ? 1 / r : null;
    return { u, rTotal: r, parts };
  }"""

new_calc = """  function partConfig() { return PART_TYPES[pkgPartType]; }

  function getSurfaceResistances() {
    const p = partConfig();
    if (p.dualInterior) {
      return {
        top: { r: p.ri, label: `상부 실내표면열전달저항 (Rᵢ=${p.ri})` },
        bottom: { r: p.ri, label: `하부 실내표면열전달저항 (Rᵢ=${p.ri})` },
      };
    }
    const ro = p.ro[pkgExposure];
    return {
      top: { r: ro, label: `실외측 표면열전달저항 (Rₒ=${ro}, ${pkgExposure === 'direct' ? '외기 직접' : '외기 간접'})` },
      bottom: { r: p.ri, label: `실내측 표면열전달저항 (Rᵢ=${p.ri})` },
    };
  }

  function buildLegalHint() {
    const p = partConfig();
    const surf = getSurfaceResistances();
    if (p.dualInterior) {
      return `<strong>${p.label}</strong> — 외기 면 없음. 상·하부 실내표면 각 Rᵢ=${p.ri} 적용 (별표5).`;
    }
    return `<strong>${p.label}</strong> — ${surf.top.label} / ${surf.bottom.label}. 공식: U=1/(Rₒ+Σd/λ+R마감+Rᵢ). 제출용 계산서는 [별표5] 필수.`;
  }

  function roundU(u) {
    return Math.round(u * 100) / 100;
  }

  function roleLabel(i) {
    return partConfig().roleHints[i] || '—';
  }

  function calcU() {
    const surf = getSurfaceResistances();
    let r = surf.top.r;
    let rLayers = 0;
    let rFinish = 0;
    pkgLayers.forEach(L => {
      rLayers += layerR(L.lambda, L.thick);
    });
    r += rLayers;
    const fin = finishById(pkgFinishId);
    if (fin) {
      rFinish = fin.layers.reduce((s, fl) => s + layerR(fl.lambda, fl.thick), 0);
      r += rFinish;
    }
    r += surf.bottom.r;
    const u = r > 0 ? 1 / r : null;
    return { u, rTotal: r, surf, rLayers, rFinish };
  }"""

if old_calc in t:
    t = t.replace(old_calc, new_calc, 1)
else:
    print("warn: calcU block not found")

old_render_start = """  function renderPackageTable() {
    const fin = finishById(pkgFinishId);
    const rFinish = fin ? fin.layers.reduce((s, fl) => s + layerR(fl.lambda, fl.thick), 0) : 0;
    let rSum = R_OUT;
    let html = '';
    html += `<tr class="surface"><td class="col-no">—</td><td class="col-role">표면</td>
      <td colspan="2"><input readonly value="실외측 표면열전달저항"></td>
      <td></td><td class="col-r"><input readonly value="${fmtR(R_OUT)}"></td></tr>`;"""

new_render_start = """  function onPartTypeChange() {
    pkgPartType = document.getElementById('pkg-part').value;
    const p = partConfig();
    document.getElementById('field-exposure').style.display = p.ro ? '' : 'none';
    if (p.ro) {
      document.getElementById('opt-direct').textContent =
        `외기 직접 — Rₒ ${p.ro.direct}`;
      document.getElementById('opt-indirect').textContent =
        `외기 간접 — Rₒ ${p.ro.indirect}`;
    }
    document.getElementById('u-part-label').textContent = p.short + ' 열관류율 U';
    document.getElementById('legal-surface-hint').innerHTML = buildLegalHint();
    renderPackageTable();
  }
  function onExposureChange() {
    pkgExposure = document.getElementById('pkg-exposure').value;
    document.getElementById('legal-surface-hint').innerHTML = buildLegalHint();
    renderPackageTable();
  }

  function renderPackageTable() {
    const fin = finishById(pkgFinishId);
    const surf = getSurfaceResistances();
    const rFinish = fin ? fin.layers.reduce((s, fl) => s + layerR(fl.lambda, fl.thick), 0) : 0;
    let html = '';
    html += `<tr class="surface"><td class="col-no">—</td><td class="col-role">표면</td>
      <td colspan="2"><input readonly value="${surf.top.label}"></td>
      <td></td><td class="col-r"><input readonly value="${fmtR(surf.top.r)}"></td></tr>`;"""

if old_render_start in t:
    t = t.replace(old_render_start, new_render_start, 1)
else:
    print("warn: render start not found")

# Fix role labels in loop
t = t.replace(
    "${ROLE_LABELS[i]}",
    "${roleLabel(i)}"
)

# Fix bottom surface row
t = t.replace(
    `<input readonly value="실내측 표면열전달저항"></td>
      <td></td><td class="col-r"><input readonly value="${fmtR(R_IN)}"></td></tr>`,
    `<input readonly value="${surf.bottom.label}"></td>
      <td></td><td class="col-r"><input readonly value="${fmtR(surf.bottom.r)}"></td></tr>`
)
# That replace might fail if already changed - fix render end section manually

old_render_end = """    rSum += R_IN;
    html += `<tr class="surface"><td class="col-no">—</td><td class="col-role">표면</td>
      <td colspan="2"><input readonly value="실내측 표면열전달저항"></td>
      <td></td><td class="col-r"><input readonly value="${fmtR(R_IN)}"></td></tr>`;

    document.getElementById('layer-tbody').innerHTML = html;

    const { u, rTotal } = calcU();
    document.getElementById('structure-txt').textContent = buildStructureTxt();
    if (u != null) {
      document.getElementById('u-val').textContent = u.toFixed(3);
      const thickSum = pkgLayers.reduce((s, L) => s + (parseFloat(L.thick) || 0), 0)
        + (fin ? fin.layers.reduce((s, fl) => s + (parseFloat(fl.thick) || 0), 0) : 0);
      document.getElementById('u-breakdown').textContent =
        `R합계 ${rTotal.toFixed(3)} ㎡·K/W · 전체 두께 ${thickSum}mm · U=1/R`;
    } else {
      document.getElementById('u-val').textContent = '—';
      document.getElementById('u-breakdown').textContent = '층을 입력하세요';
    }
    syncPkgSave();
  }"""

new_render_end = """    html += `<tr class="surface"><td class="col-no">—</td><td class="col-role">표면</td>
      <td colspan="2"><input readonly value="${surf.bottom.label}"></td>
      <td></td><td class="col-r"><input readonly value="${fmtR(surf.bottom.r)}"></td></tr>`;

    document.getElementById('layer-tbody').innerHTML = html;

    const { u, rTotal, rLayers, rFinish } = calcU();
    document.getElementById('structure-txt').textContent = buildStructureTxt();
    if (u != null) {
      const uDisp = roundU(u);
      document.getElementById('u-val').textContent = uDisp.toFixed(2);
      const thickSum = pkgLayers.reduce((s, L) => s + (parseFloat(L.thick) || 0), 0)
        + (fin ? fin.layers.reduce((s, fl) => s + (parseFloat(fl.thick) || 0), 0) : 0);
      document.getElementById('u-breakdown').textContent =
        `R=${rTotal.toFixed(3)} (표면+재료${rLayers.toFixed(3)}+마감${rFinish.toFixed(3)}) · ${thickSum}mm`;
    } else {
      document.getElementById('u-val').textContent = '—';
      document.getElementById('u-breakdown').textContent = '층을 입력하세요';
    }
    syncPkgSave();
  }"""

if old_render_end in t:
    t = t.replace(old_render_end, new_render_end, 1)
else:
    print("warn: render end not found")

# Remove rSum logic in middle of render if broken - read file after patch

t = t.replace(
    "return JSON.stringify({ pkgLayers, pkgFinishId });",
    "return JSON.stringify({ pkgLayers, pkgFinishId, pkgPartType, pkgExposure });"
)

t = t.replace(
    "const PACKAGES = [{ id: 'pkg-a', name: '벽체 표준형 A' }, { id: 'pkg-b', name: '벽체 고단열 B' }];",
    """const PACKAGES = [
    { id: 'pkg-a', name: '[외벽] 표준형 A', part: 'wall' },
    { id: 'pkg-b', name: '[외벽] 고단열 B', part: 'wall' },
    { id: 'pkg-floor', name: '[바닥] 최하층 표준', part: 'floor_bottom' },
    { id: 'pkg-roof', name: '[지붕] 표준', part: 'roof' },
    { id: 'pkg-mid', name: '[층간] 표준', part: 'floor_between' },
  ];"""
)

# Add init onPartTypeChange at end
t = t.replace(
    "  savedPkgState = getPkgState();\n  renderSpecs();",
    "  savedPkgState = getPkgState();\n  onPartTypeChange();\n  renderSpecs();"
)

# Fix exposure select ids in HTML - add id to options
t = t.replace(
    '<option value="direct">외기 직접</option>',
    '<option value="direct" id="opt-direct">외기 직접</option>'
).replace(
    '<option value="indirect">외기 간접</option>',
    '<option value="indirect" id="opt-indirect">외기 간접</option>'
)

p.write_text(t, encoding="utf-8")
print("done")
