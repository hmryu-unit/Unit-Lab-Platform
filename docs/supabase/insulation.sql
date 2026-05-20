-- =============================================================================
-- 단열 관리 — Supabase 마이그레이션 (기존 DB용)
-- =============================================================================
-- 대상: 이미 public.insulation_* / finish_* / lineup_engineering 이 있는 프로젝트
-- 앱: js/insulation.js (PostgREST read/write)
--
-- ■ 현재 DB에 있음 (추가 불필요)
--   - insulation_specs (id, name, role, material_id, lambda, sort_order, updated_at)
--   - insulation_packages (id, name, code, cells, updated_at)
--   - finish_options, finish_option_layers
--   - lineup_engineering.insulation_package_id → insulation_packages
--
-- ■ 이 스크립트가 추가·수정하는 것
--   - insulation_specs.fire_rating
--   - insulation_packages.is_apartment, has_floor_heating, schema_version
--   - 패키지 code 유니크 인덱스
--   - finish_option_layers: 옵션 삭제 시 레이어 CASCADE
--   - insulation_specs.material_id: 자재 삭제 시 NULL
--   - 단열 4테이블 RLS 정책 (anon API용)
--
-- 실행: Supabase SQL Editor → Run (한 번)
-- =============================================================================

-- ── 1. insulation_specs ─────────────────────────────────────────────────────
ALTER TABLE public.insulation_specs
  ADD COLUMN IF NOT EXISTS fire_rating TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN public.insulation_specs.fire_rating IS '방화등급: 불연, 준불연, 난연 등 (앱 fireRating)';

-- material_id: 자재 삭제 시 스펙 연결만 해제
ALTER TABLE public.insulation_specs
  DROP CONSTRAINT IF EXISTS insulation_specs_material_id_fkey;

ALTER TABLE public.insulation_specs
  ADD CONSTRAINT insulation_specs_material_id_fkey
  FOREIGN KEY (material_id) REFERENCES public.materials(id) ON DELETE SET NULL;

-- ── 2. insulation_packages ──────────────────────────────────────────────────
ALTER TABLE public.insulation_packages
  ADD COLUMN IF NOT EXISTS is_apartment BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.insulation_packages
  ADD COLUMN IF NOT EXISTS has_floor_heating BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.insulation_packages
  ADD COLUMN IF NOT EXISTS schema_version INTEGER NOT NULL DEFAULT 2;

ALTER TABLE public.insulation_packages
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.insulation_packages.is_apartment IS '[별표1] 공동주택 여부';
COMMENT ON COLUMN public.insulation_packages.has_floor_heating IS '[별표1] 바닥난방 여부 (층간바닥 행 적용)';
COMMENT ON COLUMN public.insulation_packages.schema_version IS '셀 키 스키마 버전 (앱 migratePackages, 현재 2)';

-- 기존 행 백필 (NULL이 남지 않도록)
UPDATE public.insulation_packages
SET
  is_apartment = COALESCE(is_apartment, true),
  has_floor_heating = COALESCE(has_floor_heating, true),
  schema_version = COALESCE(schema_version, 2)
WHERE is_apartment IS NULL
   OR has_floor_heating IS NULL
   OR schema_version IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS insulation_packages_code_lower_idx
  ON public.insulation_packages (lower(trim(code)));

-- ── 3. lineup_engineering (없을 때만) ───────────────────────────────────────
ALTER TABLE public.lineup_engineering
  ADD COLUMN IF NOT EXISTS insulation_package_id TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'lineup_engineering_insulation_package_id_fkey'
  ) THEN
    ALTER TABLE public.lineup_engineering
      ADD CONSTRAINT lineup_engineering_insulation_package_id_fkey
      FOREIGN KEY (insulation_package_id)
      REFERENCES public.insulation_packages(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── 4. finish_option_layers — 마감 옵션 삭제 시 레이어 함께 삭제 ───────────
ALTER TABLE public.finish_option_layers
  DROP CONSTRAINT IF EXISTS finish_option_layers_finish_option_id_fkey;

ALTER TABLE public.finish_option_layers
  ADD CONSTRAINT finish_option_layers_finish_option_id_fkey
  FOREIGN KEY (finish_option_id)
  REFERENCES public.finish_options(id) ON DELETE CASCADE;

-- ── 5. RLS (PostgREST + publishable key) ─────────────────────────────────────
ALTER TABLE public.insulation_specs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insulation_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finish_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finish_option_layers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS insulation_specs_public_all ON public.insulation_specs;
CREATE POLICY insulation_specs_public_all ON public.insulation_specs
  FOR ALL TO public, anon, authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS insulation_packages_public_all ON public.insulation_packages;
CREATE POLICY insulation_packages_public_all ON public.insulation_packages
  FOR ALL TO public, anon, authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS finish_options_public_all ON public.finish_options;
CREATE POLICY finish_options_public_all ON public.finish_options
  FOR ALL TO public, anon, authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS finish_option_layers_public_all ON public.finish_option_layers;
CREATE POLICY finish_option_layers_public_all ON public.finish_option_layers
  FOR ALL TO public, anon, authenticated
  USING (true) WITH CHECK (true);

-- lineup_engineering (단열 패키지 FK 컬럼 사용)
ALTER TABLE public.lineup_engineering ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lineup_engineering_public_all ON public.lineup_engineering;
CREATE POLICY lineup_engineering_public_all ON public.lineup_engineering
  FOR ALL TO public, anon, authenticated
  USING (true) WITH CHECK (true);
