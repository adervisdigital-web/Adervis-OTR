ALTER TABLE workspace_settings
  ADD COLUMN IF NOT EXISTS vk_followup_text TEXT
    DEFAULT 'Добрый день! Хотели уточнить, актуально ли вам видеопродвижение? 🎬';

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS vk_followup_sent_at TIMESTAMPTZ;
