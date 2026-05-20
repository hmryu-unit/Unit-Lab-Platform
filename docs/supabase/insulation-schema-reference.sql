-- =============================================================================
-- 단열 관리 — 스키마 참고 (신규 프로젝트·문서용, 통째 실행 비권장)
-- =============================================================================
-- 실제 운영 DB는 insulation.sql 마이그레이션으로 맞추세요.
-- 아래는 앱(insulation.js)이 기대하는 최종 형태 요약입니다.
-- =============================================================================

/*
  insulation_specs
    id TEXT PK
    name TEXT NOT NULL
    role TEXT NOT NULL  -- 'panel' | 'insul' | 'finish'
    material_id TEXT → materials(id) ON DELETE SET NULL
    lambda NUMERIC NOT NULL
    fire_rating TEXT NOT NULL DEFAULT ''
    sort_order INTEGER NOT NULL DEFAULT 0
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()

  insulation_packages
    id TEXT PK
    name TEXT NOT NULL
    code TEXT NOT NULL  -- UNIQUE lower(trim(code))
    is_apartment BOOLEAN NOT NULL DEFAULT true
    has_floor_heating BOOLEAN NOT NULL DEFAULT true
    schema_version INTEGER NOT NULL DEFAULT 2
    sort_order INTEGER NOT NULL DEFAULT 0
    cells JSONB NOT NULL DEFAULT '{}'
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()

  finish_options
    id TEXT PK
    title TEXT NOT NULL
    sort_order INTEGER NOT NULL DEFAULT 0
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()

  finish_option_layers
    id TEXT PK
    finish_option_id TEXT → finish_options(id) ON DELETE CASCADE
    insulation_spec_id TEXT → insulation_specs(id) ON DELETE RESTRICT
    thickness_mm NUMERIC NOT NULL
    sort_order INTEGER NOT NULL DEFAULT 0

  lineup_engineering (기존 테이블 확장)
    ...
    insulation_package_id TEXT → insulation_packages(id) ON DELETE SET NULL
*/
