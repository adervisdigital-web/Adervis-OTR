-- Sprint 4: manager TG chat ID for brief notifications
ALTER TABLE workspace_settings
  ADD COLUMN IF NOT EXISTS tg_manager_chat_id BIGINT DEFAULT NULL;
