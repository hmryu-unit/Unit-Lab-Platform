# 유닛랩 플랫폼 — 자재 관리 시스템

---

## 📖 용어 사전 — 이 시스템에서 쓰는 단어들

> 처음 사용하기 전에 읽어두면 좋습니다. 각 용어가 서로 어떻게 연결되는지 이해하면 전체 구조가 한눈에 보입니다.

---

### 🏢 플랫폼 (Lineup)
**"우리 회사가 판매하는 건축 상품 라인"**

예) `유닛빌드 A타입`, `유닛하우스 기본형`

- 브랜드(유닛빌드 / 유닛하우스)와 상태(운영중 / 비활성 / 초안)를 가짐
- 플랫폼마다 각 카테고리에서 **패키지를 하나씩 선택**해 조합함
- → 같은 카테고리라도 플랫폼에 따라 다른 패키지(등급)를 사용할 수 있음

---

### 🗂️ 분류 (Category / PackageCategory)
**"패키지들을 묶는 상위 그룹"

예) `구조`, `마감`, `설비`

- 카테고리 관리 화면의 최상위 단계 (검은 배경 헤더)
- 플랫폼 상세에서 분류별로 섹션을 나눠 패키지를 선택함
- 카테고리가 많아질 때 한눈에 파악하기 위한 그루핑 단위

---

### 🏷️ 패키지 (Package)
**"건물의 어떤 부위/공종인가"**

예) `화장실 도기`, `거실 마감재`, `단열재`

- 분류(구조/마감 등) 아래에 속함
- 패키지마다 여러 **등급**과 여러 **항목**(구성 요소)을 가짐
- 패키지 상세 화면에서 **항목 × 등급 매트릭스**를 관리함

---

### 🏅 등급 (Grade)
**"하나의 패키지 안에서 선택 가능한 등급/옵션"**

예) `화장실 도기 — 저렴`, `화장실 도기 — 비쌈`

- 반드시 하나의 패키지에 속함
- 플랫폼에서 이 패키지를 선택할 때 등급 중 하나를 고름
- 패키지 안에 **항목별 스펙**이 배치됨

---

### 📋 항목 (SetTypeItem)
**"카테고리를 구성하는 세부 요소(행)"**

예) `화장실 도기` 카테고리의 항목 → `세면대`, `양변기`, `욕조`

- 카테고리에 속하며, 모든 패키지에 공통으로 적용됨
- 카테고리 상세 매트릭스의 **행(row)** 역할
- 각 항목에 어떤 스펙을 쓸지 패키지마다 다르게 배치할 수 있음

---

### 🔩 스펙 (Slot)
**"항목에 배치되는 구체적인 구성 요소 명세"**

예) `긴다리 세면대`, `벽걸이형 양변기 CDC`, `실크도배`

- 카테고리에 속하는 스펙 풀(pool)에서 관리됨
- 카테고리 상세 매트릭스에서 **특정 항목 × 특정 패키지 셀**에 드래그앤드롭으로 배치
- 스펙 유형(`마감재`, `구조재` 등)을 가지며, 같은 유형의 자재만 연결 가능
- 스펙 하나에 자재 하나를 연결해 실제 자재 정보와 연결됨

---

### 🪵 자재 (Material)
**"실제로 구매·시공되는 물리적 재료"**

예) `그라스울 어쩌고 (test-5)`, `미네랄울 어쩌고 (ff)`

- 자재코드, 브랜드, 규격, 단위, 단가, 공급업체, 이미지 등 실물 정보를 보유
- 카테고리(`material_type`)를 가지며, **같은 카테고리의 스펙에만 연결 가능**
- 상태: `사용중(active)` / `검토중(pending)` / `단종(discontinued)`
- 단종된 자재가 스펙에 연결되어 있으면 **스펙-자재 연결** 페이지에서 경고 표시

---

### 🔗 스펙-자재 연결 (SlotMaterial)
**"스펙이 실제로 어떤 자재를 사용하는지 연결하는 관계"**

- 스펙 1개 ↔ 자재 1개로 연결
- 연결이 없으면 "자재 미연결" 경고
- 연결된 자재가 단종이면 "단종 자재 연결됨" 경고 → 자재 변경 필요
- **SSoT 원칙**: 자재를 교체할 때 이 연결만 수정하면 해당 스펙을 사용하는 모든 패키지·플랫폼에 자동 반영

---

### 📐 매트릭스 배치 (SlotAssignment)
**"어떤 패키지의 어떤 항목에 어떤 스펙을 쓸지 정의한 표"**

```
          [저렴 패키지]    [비쌈 패키지]
세면대      긴다리 세면대    고급 세면대
양변기      벽걸이 양변기    —
```

- 카테고리 상세 화면의 매트릭스가 바로 이것
- 스펙풀(우측 패널)에서 셀로 드래그해 배치, × 버튼으로 제거

---

### 🔄 변형 (Variant)
**"플랫폼별 특수 조건이나 옵션 값"**

예) `면적_기본값 = 33`, `층수_최대 = 5`

- 플랫폼에 종속되는 키-값 형태의 추가 정보

---

### ⚙️ 선택지 (Enum)
**"드롭다운 메뉴에 표시되는 선택 항목들을 중앙에서 관리"**

| 그룹 | 쓰이는 곳 |
|------|-----------|
| 자재·스펙 유형 (`material_type`) | 스펙의 유형 + 자재의 카테고리 (같은 유형끼리만 연결) |
| 플랫폼 브랜드 (`lineup_brand`) | 플랫폼 등록 시 브랜드 선택 |
| 플랫폼 상태 (`lineup_status`) | 시스템 고정값 — 변경 불가 |
| 패키지 상태 (`set_status`) | 시스템 고정값 — 변경 불가 |
| 자재 상태 (`material_status`) | 시스템 고정값 — 변경 불가 |

---

### 🗺️ 전체 구조 한눈에 보기

```
플랫폼 (Lineup)
 └─ [카테고리별 패키지 선택] ──────────────────────────────┐
                                                            │
분류 (Category)                                             │
 └─ 카테고리 (SetType) ◀──────────────────────────────────┘
      ├─ 항목 (SetTypeItem): 세면대 / 양변기 / 욕조 ...
      ├─ 패키지 (Set): 저렴 / 비쌈 / 프리미엄 ...
      │    └─ [항목 × 패키지] 매트릭스 배치
      │           └─ 스펙 (Slot)
      │                └─ 자재 (Material) ← 스펙-자재 연결
      └─ 스펙 풀 (Slot Pool): 이 카테고리에 속한 모든 스펙
```

---

## 프로젝트 개요
모듈러 건축 플랫폼의 자재를 패키지·스펙 구조로 체계적으로 관리하는 SPA(Single Page Application)입니다.

---

## ⚡ 백엔드: Supabase PostgREST API

> **중요**: 이 프로젝트는 Genspark 내장 `tables/` API 대신 **Supabase PostgREST API**를 백엔드로 사용합니다.

### 연결 정보

| 항목 | 값 |
|------|----|
| Supabase URL | `https://hxjvhssmmnzetbygzqdo.supabase.co` |
| API 엔드포인트 | `https://hxjvhssmmnzetbygzqdo.supabase.co/rest/v1/{table}` |
| Publishable Key | `sb_publishable_AaiskI_pBfoCLvvSBTWegw_3N4Z8Pz1` |
| RLS 정책 | 모든 13개 테이블에 `public_all` 정책 적용 (`FOR ALL USING (true)`) |

### API 헬퍼 (`API` 객체)

앱 내부에서 다음 4가지 메서드로 Supabase와 통신합니다:

```javascript
// 목록 조회 — ?field=eq.value 필터, ?limit=N, ?order=field
API.get(table, { limit, eq, order })

// 단건 생성 — POST, Prefer: return=representation → rows[0] 반환
API.post(table, data)

// 단건 수정 — PATCH ?id=eq.{id}, Prefer: return=representation → rows[0] 반환
API.put(table, id, data)

// 단건 삭제 — DELETE ?id=eq.{id}
API.delete(table, id)
```

### Supabase 테이블 목록 (13개)

| 테이블 | 설명 |
|--------|------|
| `set_type_categories` | 분류 |
| `set_types` | 카테고리 |
| `lineups` | 플랫폼 |
| `sets` | 패키지 |
| `set_type_items` | 항목 (행) |
| `slots` | 스펙 |
| `slot_assignments` | 매트릭스 배치 |
| `materials` | 자재 |
| `slot_materials` | 스펙-자재 연결 |
| `lineup_set_selections` | 플랫폼별 패키지 선택 |
| `variants` | 변형 조건 |
| `change_logs` | 변경 이력 |
| `enums` | 선택지 관리 |

### DDL / 초기화

`supabase_setup.sql` 파일을 Supabase SQL Editor에서 실행하면 전체 스키마를 재생성할 수 있습니다.
- DROP CASCADE → CREATE 순서로 FK 충돌 없이 재생성
- `_update_updated_at()` 트리거 포함 (13개 테이블 전체)

---

## 현재 구현된 기능

### 페이지 구조
| 페이지 | 경로(navigate 인자) | 설명 |
|--------|-------------------|------|
| 대시보드 | `dashboard` | 전체 현황 요약 카드 |
| 플랫폼 관리 | `lineups` | 플랫폼 CRUD + 상세 진입 |
| 플랫폼 상세 | `lineup-detail` | 패키지별 드롭다운 등급 선택 + 항목별 스펙 미리보기 |
| 패키지 관리 | `packages` | 패키지 CRUD + 상세 진입 |
| 패키지 상세 | `package-detail` | 2단 레이아웃(매트릭스 + 스펙풀 우측 패널) + D&D 배치 |
| 등급 카탈로그 | `grades` | 등급 CRUD |
| 스펙 관리 | `slots` | 스펙 CRUD |
| 자재 DB | `materials` | 자재 CRUD + 이미지 업로드(클릭/드래그/붙여넣기) |
| 스펙-자재 연결 | `slot-materials` | 스펙 ↔ 자재 연결 관리 (스펙·자재·비고만) |
| 변형 관리 | `variants` | 플랫폼별 변형 조건 관리 |
| 변경 이력 | `change-logs` | 전체 변경 로그 |

### 주요 기능 상세

#### 플랫폼 상세
- 카테고리별 패키지 선택을 **드롭다운** 방식으로 제공
- 드롭다운에서 빈 옵션 선택 시 자동 해제
- 선택된 패키지의 **항목별 스펙 내역 미리보기 표** 표시 (`lds-table`)

#### 카테고리 상세
- **2단 flex 레이아웃**: 좌측 매트릭스 영역 + 우측 280px 고정 스펙풀 패널
- 항목·패키지가 없어도 **표 구조 항상 표시** (빈 상태 안내 힌트 행)
- 스펙풀 아이템에서 매트릭스 셀로 **HTML5 드래그앤드롭** 배치
- 셀 내 칩에 **× 버튼**으로 즉시 제거

#### 셀 배치 모달
- **Staged 방식 UX**: 추가(`toAdd`)·삭제(`toRemove`) 예약 후 저장 버튼으로 일괄 반영
- 현재 배치 / 추가 예약 영역 분리 표시
- 닫기 버튼 옆 **저장 버튼** 추가

#### 스펙-자재 연결
- `구분(is_default)`, `수량배수(qty_multiplier)`, `변형조건(variant_condition)` 필드 제거
- 테이블 열: 스펙 / 자재 / 비고 / 관리 (4열)
- 카테고리 상세의 빠른 연결 모달(`slot-mat-quick-modal`)도 동일하게 적용

#### 자재 등록
- `리드타임(lead_time_days)` 필드 제거
- 이미지 업로드 영역: **클릭 / 드래그앤드롭 / Ctrl+V 붙여넣기** 모두 지원
- 이미지 썸네일 클릭 시 확대 미리보기 모달
- 자재 테이블: 이미지 썸네일 열 추가

---

## 데이터 모델 (13개 Supabase 테이블)

> **주의**: 테이블명(API 식별자)은 변경하지 않습니다.

| 테이블 (API명) | 주요 필드 | UI 표시명 |
|--------|----------|------|
| `lineups` | code, name, brand, status | 플랫폼 |
| `package_categories` | name, sort_order | 분류 |
| `packages` | name, description, sort_order, category_id | 패키지 |
| `lineup_set_selections` | lineup_id, package_id, grade_id | 플랫폼별 등급 선택 |
| `grades` | code, name, package_id, status | 등급 |
| `package_items` | package_id, name, sort_order | 항목 (행) |
| `slots` | code, name, package_id, slot_type | 스펙 |
| `slot_assignments` | package_id, item_id, grade_id, slot_id | 매트릭스 배치 |
| `materials` | code, name, brand, category, unit_price, image_url | 자재 |
| `slot_materials` | slot_id, material_id, note | 스펙-자재 연결 |
| `variants` | lineup_id, variant_key, variant_label, variant_value | 변형 조건 |
| `change_logs` | entity_type, entity_name, change_type, before/after_value | 변경 이력 |
| `enums` | group_name, value, label, sort_order | 선택지 |

---

## 파일 구조

```
index.html            SPA 진입점 — 전체 HTML, 모달, 페이지 섹션 + 인라인 JS
css/
  style.css           전체 스타일 (2단 레이아웃, D&D, staged 모달, 이미지 업로드 UI)
js/
  app.js              원본 JS 소스 (참조용) — Supabase PostgREST API 헬퍼 포함 4087줄
                      ※ Genspark MIME 타입 이슈로 index.html에 인라인 삽입하여 실행
supabase_setup.sql    Supabase 테이블 DDL + RLS 정책 + updated_at 트리거 (13개 테이블)
README.md
```

> **⚠️ 인라인 JS 주의사항**
> Genspark 환경에서는 `.js` 파일이 `application/json` MIME 타입으로 서빙되어
> `<script src="js/app.js">` 방식으로는 JS가 실행되지 않습니다.
> 따라서 `js/app.js`의 전체 내용을 `index.html`의 `</body>` 직전에
> 인라인 `<script>` 블록으로 삽입하여 사용합니다.
> `js/app.js`는 편집 편의를 위한 소스 원본으로만 유지합니다.

---

## 기술 스택
- **HTML5** — Semantic markup, Drag & Drop API, Clipboard API, FileReader API
- **CSS3** — Flexbox 2단 레이아웃, CSS 변수, 반응형
- **Vanilla JavaScript** — SPA 라우팅(`navigate()`, `navigateToPackageDetail()`), Staged 변경 패턴
- **Supabase PostgREST API** — `/rest/v1/{table}` CRUD (GET/POST/PATCH/DELETE)
  - `apikey` + `Authorization: Bearer` 헤더 인증
  - RLS `public_all` 정책 (`FOR ALL USING (true)`)
  - `Prefer: return=representation` 헤더로 응답 행 즉시 수신
- **CDN**: Noto Sans KR, Font Awesome 6.4.0

---

## 용어 대응표 (구 → 신)

| 구 용어 | 신 용어 | DB 테이블명 |
|--------|--------|------|
| 라인업 | 플랫폼 | `lineups` |
| 세트 유형 카테고리 / set_type_categories | 분류 | `package_categories` |
| 카테고리 / set_types | 패키지 | `packages` |
| 패키지 / sets | 등급 | `grades` |
| set_type_items | 항목 | `package_items` |
| set_type_id (FK) | package_id (FK) | 컬럼명 변경 |
| set_id (FK) | grade_id (FK) | 컬럼명 변경 |
| Slot / slot | 스펙 | `slots` |
| 자재 | 자재 | `materials` |

---

## 미구현 / 향후 개선 권장사항

1. **플랫폼 상세 스펙 미리보기 필터** — 카테고리가 많을 때 접기/펼치기(Accordion) 추가
2. **매트릭스 셀 내 스펙 순서 변경** — 셀 내 칩 간 드래그앤드롭 정렬
3. **자재 이미지 외부 URL 입력** — Base64 DataURL 대신 URL 직접 입력 옵션
4. **변경 이력 자동 기록 강화** — 스펙 배치 D&D 시에도 이력 기록
5. **모바일 반응형 개선** — 카테고리 상세 2단 레이아웃의 좁은 화면 대응
6. **JS 소스 분리 재검토** — Genspark MIME 타입 이슈 해결 시 인라인 → 외부 파일 방식으로 복귀 가능

---

## 배포
퍼블리시하려면 **Publish 탭**을 사용하세요.
