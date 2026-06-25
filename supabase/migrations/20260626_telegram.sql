-- supabase/migrations/20260626_telegram.sql

-- Токен бота для workspace
ALTER TABLE workspace_settings
  ADD COLUMN IF NOT EXISTS tg_bot_token TEXT;

-- chat_id пользователя Telegram в таблице лидов
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS tg_chat_id BIGINT;

CREATE INDEX IF NOT EXISTS idx_leads_tg_chat_id
  ON leads(workspace_id, tg_chat_id)
  WHERE tg_chat_id IS NOT NULL;
