-- Instagram Integration
-- Adds ig_user_id to leads and IG settings to workspace_settings

-- Lead: store Instagram user ID (IGSID) for sending replies
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS ig_user_id TEXT,
  ADD COLUMN IF NOT EXISTS ig_mode    TEXT DEFAULT 'ai';  -- 'ai' | 'human'

CREATE INDEX IF NOT EXISTS leads_ig_user_id_idx
  ON leads (workspace_id, ig_user_id)
  WHERE ig_user_id IS NOT NULL;

-- Workspace settings: IG credentials and config
ALTER TABLE workspace_settings
  ADD COLUMN IF NOT EXISTS ig_page_token   TEXT,
  ADD COLUMN IF NOT EXISTS ig_verify_token TEXT DEFAULT 'AdervisIG2026',
  ADD COLUMN IF NOT EXISTS ig_ai_enabled   BOOLEAN DEFAULT true;
