-- Telegram bot conversation state per lead
ALTER TABLE leads ADD COLUMN IF NOT EXISTS tg_state JSONB DEFAULT NULL;
