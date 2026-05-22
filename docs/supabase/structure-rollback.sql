-- =============================================================================
-- structure.sql 되돌리기 (이미 실행한 마이그레이션 롤백)
-- =============================================================================
-- 되돌림: structure_specs, structure_packages, lineup_engineering.structure_package_id
--
-- 실행 후 패키지만 다시 쓰려면 structure.sql (패키지 전용 버전) 을 실행하세요.
-- =============================================================================

-- 1) 플랫폼 FK·컬럼
ALTER TABLE public.lineup_engineering
  DROP CONSTRAINT IF EXISTS lineup_engineering_structure_package_id_fkey;

ALTER TABLE public.lineup_engineering
  DROP COLUMN IF EXISTS structure_package_id;

-- 2) RLS 정책
DROP POLICY IF EXISTS structure_packages_public_all ON public.structure_packages;
DROP POLICY IF EXISTS structure_specs_public_all ON public.structure_specs;

-- 3) 테이블 (스펙·패키지·인덱스)
DROP TABLE IF EXISTS public.structure_specs CASCADE;
DROP TABLE IF EXISTS public.structure_packages CASCADE;
