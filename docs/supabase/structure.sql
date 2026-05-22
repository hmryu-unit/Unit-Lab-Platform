-- =============================================================================
-- 구조 패키지 — Supabase 마이그레이션 (스펙 테이블 없음)
-- =============================================================================
-- 앱: js/structure.js
-- 플랫폼: lineup_engineering.structure_package_id
--
-- ■ 최초 설치: 이 파일만 실행
-- ■ structure.sql(스펙 포함)을 이미 실행했다면:
--     1) structure-rollback.sql 실행
--     2) 이 파일 실행
-- =============================================================================

-- ── 1. structure_packages ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.structure_packages (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  cells JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.structure_packages IS '구조 패키지 (규격·부위 상세는 추후 기획)';
COMMENT ON COLUMN public.structure_packages.cells IS '추후 스키마용 JSON — 현재 앱에서는 미사용';

CREATE UNIQUE INDEX IF NOT EXISTS structure_packages_code_lower_idx
  ON public.structure_packages (lower(trim(code)));

-- ── 2. lineup_engineering ─────────────────────────────────────────────────────
ALTER TABLE public.lineup_engineering
  ADD COLUMN IF NOT EXISTS structure_package_id TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'lineup_engineering_structure_package_id_fkey'
  ) THEN
    ALTER TABLE public.lineup_engineering
      ADD CONSTRAINT lineup_engineering_structure_package_id_fkey
      FOREIGN KEY (structure_package_id)
      REFERENCES public.structure_packages(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── 3. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.structure_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS structure_packages_public_all ON public.structure_packages;
CREATE POLICY structure_packages_public_all ON public.structure_packages
  FOR ALL TO public, anon, authenticated
  USING (true) WITH CHECK (true);
