-- Quick replies for TG chat + bot welcome/brief text editor
ALTER TABLE workspace_settings
  ADD COLUMN IF NOT EXISTS tg_quick_replies JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS tg_welcome_text  TEXT  DEFAULT '',
  ADD COLUMN IF NOT EXISTS tg_brief_config  JSONB DEFAULT '[]';
