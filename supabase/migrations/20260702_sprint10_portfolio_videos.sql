-- Sprint 10: portfolio video links for TG bot inline buttons
ALTER TABLE workspace_settings
  ADD COLUMN IF NOT EXISTS tg_portfolio_videos JSONB;
