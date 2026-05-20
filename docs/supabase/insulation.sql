-- 단열 관리 (추후 Supabase 연동용 스키마 초안)
-- 현재 앱은 localStorage(unitlab_insulation_v1) 사용. 이 SQL은 마이그레이션 참고용.

-- 단열 스펙 (판넬 / 단열재 / 마감재)
CREATE TABLE IF NOT EXISTS insulation_specs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('panel', 'insul', 'finish')),
  material_id TEXT REFERENCES materials(id),
  lambda NUMERIC NOT NULL,
  sort_order INT DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 실내 마감 옵션 (플랫폼 공통)
CREATE TABLE IF NOT EXISTS finish_options (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  sort_order INT DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finish_option_layers (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  finish_option_id TEXT NOT NULL REFERENCES finish_options(id) ON DELETE CASCADE,
  insulation_spec_id TEXT NOT NULL REFERENCES insulation_specs(id),
  thickness_mm NUMERIC NOT NULL,
  sort_order INT DEFAULT 0
);

-- 단열 패키지 (부위×지역 셀 JSON)
CREATE TABLE IF NOT EXISTS insulation_packages (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  is_apartment BOOLEAN NOT NULL DEFAULT true,
  has_floor_heating BOOLEAN NOT NULL DEFAULT true,
  cells JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 플랫폼 ↔ 단열 패키지 (lineup_engineering 확장 또는 별도 테이블)
ALTER TABLE lineup_engineering
  ADD COLUMN IF NOT EXISTS insulation_package_id TEXT REFERENCES insulation_packages(id);
