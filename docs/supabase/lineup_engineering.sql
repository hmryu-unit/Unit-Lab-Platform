-- 플랫폼별 구조·단열 서술형 메모 (Supabase SQL Editor에서 실행)
CREATE TABLE IF NOT EXISTS lineup_engineering (
  id TEXT PRIMARY KEY DEFAULT (gen_random_uuid()::text),
  lineup_id TEXT NOT NULL UNIQUE,
  structure_spec TEXT NOT NULL DEFAULT '',
  structure_logic TEXT NOT NULL DEFAULT '',
  insulation_notes TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE lineup_engineering ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS public_all ON lineup_engineering;
CREATE POLICY public_all ON lineup_engineering
  FOR ALL USING (true) WITH CHECK (true);
