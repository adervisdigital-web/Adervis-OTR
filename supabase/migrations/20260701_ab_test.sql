-- Sprint 8: A/B welcome text test
ALTER TABLE workspace_settings
  ADD COLUMN IF NOT EXISTS tg_welcome_text_b TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS tg_ab_enabled     BOOLEAN DEFAULT FALSE;

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS ab_variant VARCHAR(1) DEFAULT NULL; -- 'A' | 'B'
