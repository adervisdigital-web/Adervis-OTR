-- Add tg_bot_username to workspace_settings
ALTER TABLE workspace_settings
  ADD COLUMN IF NOT EXISTS tg_bot_username TEXT DEFAULT '';
