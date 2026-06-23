-- Push subscriptions for PWA push notifications
-- Run this in Supabase Dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    user_id      UUID,
    subscription JSONB NOT NULL,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_push_sub_endpoint
    ON push_subscriptions (workspace_id, (subscription->>'endpoint'));

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members can manage push subs"
    ON push_subscriptions FOR ALL
    USING (
        workspace_id IN (
            SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
        )
    );
