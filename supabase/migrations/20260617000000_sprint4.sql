-- Sprint 4: archived_at, deal_score, deal_score_reason on leads; daily_goal on workspace_settings
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS archived_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deal_score   INTEGER,
  ADD COLUMN IF NOT EXISTS deal_score_reason TEXT;

ALTER TABLE workspace_settings
  ADD COLUMN IF NOT EXISTS daily_goal INTEGER DEFAULT 20;
