-- supabase/migrations/20260614000000_vk_automation.sql

-- Настройки VK для workspace
CREATE TABLE IF NOT EXISTS workspace_settings (
  workspace_id UUID PRIMARY KEY,
  vk_token TEXT,
  vk_community_id BIGINT,
  vk_webhook_secret TEXT,
  vk_confirmation_string TEXT,
  updated_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

ALTER TABLE workspace_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws_settings_select"
  ON workspace_settings FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "ws_settings_all"
  ON workspace_settings FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

-- Добавить поле vk_peer_id к лидам
ALTER TABLE leads ADD COLUMN IF NOT EXISTS vk_peer_id BIGINT;
CREATE INDEX IF NOT EXISTS idx_leads_vk_peer_id
  ON leads(workspace_id, vk_peer_id)
  WHERE vk_peer_id IS NOT NULL;
