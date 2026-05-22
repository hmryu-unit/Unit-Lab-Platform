---
name: unitlab-platform
description: >-
  UnitLab Platform (유닛랩) vanilla JS/CSS material management app. Use when
  editing this repo, working on lineups/packages/slots/materials, slot_assignments
  matrix, brand cards, or Korean UI pages (플랫폼·스펙·자재 DB).
---

# UnitLab Platform

## Stack

- Static app: `index.html`, `js/app.js`, `css/style.css`
- Data via `API.get/post/put/delete`; state in global `State`
- No build step — verify in browser after changes

## Domain model (Korean UI labels)

| Code | UI | Notes |
|------|-----|-------|
| `lineup` | 플랫폼 | Brand via `lineup_brand` enum |
| `packages` | 패키지 | Category detail; has grades + items |
| `grades` | 등급 | Column in item×grade matrix |
| `packageItems` | 항목 | Row in matrix |
| `slots` | 스펙 | Pool per package; `slot_type` = material category |
| `slotAssignments` | (셀 배치) | Links slot to `grade_id` + `item_id` (+ `package_id`) |
| `materials` | 자재 | `status`: `active` / `inactive` / `pending` |
| `slotMaterials` | 스펙-자재 연결 | One default material per slot |

**배치됨** = has row in `State.slotAssignments` for that `slot_id`.  
**미배치** = no assignment (not the same as missing `package_id` on slot).

## Key helpers (`js/app.js`)

- `parseSlotDesc` / `serializeSlotDesc` — `description` stores `text\n[[ATTRS]]\n{json}`; never show `[[ATTRS]]` raw in UI; use `renderSlotMetaSubline(sl)`
- `isSlotMatrixPlaced(slotId)` — matrix placement check
- `sortSlotsPlacedFirst(slots)` — placed first, unplaced last within a group
- `getBrandColor` / `renderBrandManageSection` — brand cards use `--bm-color`, not `border-left` tint on whole card
- `openConfirmModal` — generic confirm; `confirmDelete` for delete-only copy
- `matStatusCell` / `mat-action-slot` — keep materials table column width stable when toggling inactive

## Page conventions

- **구조 패키지** (`js/structure.js`): `structure_packages` only; 플랫폼 `lineup_engineering.structure_package_id` (부위·규격 상세 추후)
- **스펙 관리** (`renderSlotTable`): groups by slot `package_id`; management column needs `slot-col-actions` + `padding-right`; use `inline-flex` for action buttons
- **스펙-자재 연결** (`renderSlotMaterials`): only `isSlotMatrixPlaced` slots
- **자재 DB** (`renderMaterialTable`): `materials-table` + `colgroup`; deactivate via `deactivateMaterial` + `openConfirmModal`, not `confirmDelete` wording
- **플랫폼 관리** brand section: `.bm-card` / `.bm-lineup-item`; status dots use `var(--bm-color)`, not global green

## Edit guidelines

- Match existing patterns in `app.js` (template HTML strings, `escHtml`, `showToast`, `loadAll`)
- Prefer scoped CSS under `#page-*` or component classes; use `table-layout: fixed` + `colgroup` when action columns jump on re-render
- Minimize diff scope; do not commit/push unless the user asks

## Docs

- Terminology: `README.md` 용어 사전
