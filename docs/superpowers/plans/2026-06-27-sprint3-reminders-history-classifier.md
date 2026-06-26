# Sprint 3: TG Reminder Cron + История диалога + AI-классификатор Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить автонапоминания лидам без брифа (cron), визуальные стили сообщений (кнопки/бриф-карточки) и AI-классификатор направления (Видео/Дизайн/Фото/ИИ) с адаптивным промптом.

**Architecture:**
- SQL migration: 4 новых колонки (`tg_reminded_at`, `tg_reminder_enabled`, `tg_reminder_text`, `service_category`)
- `tg-webhook` обновлён: `addMsg` принимает опциональный `type`, новая `classifyService()` fire-and-forget, `aiResponse` адаптируется по категории
- Новая Edge Function `tg-reminder` с `Deno.cron` (каждые 6ч) + HTTP-триггер
- `index.html`: новые CSS классы + `renderSingleMessage` ветвится по `type`, Settings UI с полями напоминания, бейджи категорий в sidebar/таблице

**Tech Stack:** Vanilla JS, single-file `index.html`, Supabase JS SDK v2, Supabase Edge Functions (Deno/TypeScript), Supabase CLI.

---

## File Map

| File | Change |
|------|--------|
| `supabase/migrations/20260627_tg_reminder.sql` | новая — 4 колонки |
| `supabase/functions/tg-webhook/index.ts` | `addMsg` type param, type tagging в callers, `classifyService`, адаптивный `aiResponse` |
| `supabase/functions/tg-reminder/index.ts` | новая EF с Deno.cron |
| `index.html` | `getMsgType`, `renderButtonMessage`, `renderBriefAnswerMessage`, CSS классы, Settings UI, tgSettings global, `loadTgSettings`, `saveTgSettings`, `rowToLead`, `leadToRow`, category pills в `renderTgLeadItem` |

---

## Task 1: SQL Migration

**Files:**
- Create: `supabase/migrations/20260627_tg_reminder.sql`

- [ ] **Step 1: Create migration file**

```sql
-- Sprint 3: reminders + service category
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS tg_reminded_at   BIGINT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS service_category TEXT   DEFAULT NULL;

ALTER TABLE workspace_settings
  ADD COLUMN IF NOT EXISTS tg_reminder_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS tg_reminder_text    TEXT    DEFAULT NULL;
```

Save to `supabase/migrations/20260627_tg_reminder.sql`.

- [ ] **Step 2: Apply migration**

```bash
npx supabase db push
```

Expected: no errors. If prompted for confirmation, confirm.

- [ ] **Step 3: Verify columns**

Open Supabase dashboard → Table Editor → `leads` → confirm `tg_reminded_at` and `service_category` columns exist.
Open `workspace_settings` → confirm `tg_reminder_enabled` and `tg_reminder_text` columns exist.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260627_tg_reminder.sql
git commit -m "feat(db): add tg_reminded_at, service_category, tg_reminder_* columns"
```

---

## Task 2: tg-webhook — addMsg type tagging + callers

**Files:**
- Modify: `supabase/functions/tg-webhook/index.ts`

This task adds optional `type` param to `addMsg` and tags button/brief messages in `handleCallback`.

- [ ] **Step 1: Update `addMsg` signature and body**

Find at line ~410:
```ts
async function addMsg(sb: SbClient, lead: LeadRow, wsId: string, text: string, fromClient: boolean) {
  const fresh    = await getLead(sb, wsId, Number(lead.tg_chat_id))
  const messages = [...((fresh?.messages ?? lead.messages ?? []) as LeadRow[])]
  messages.push({ id: crypto.randomUUID(), text, date: Date.now(), fromClient })
  await sb.from('leads').update({ messages, updated_at: Date.now() }).eq('id', lead.id as string)
}
```

Replace with:
```ts
async function addMsg(
  sb: SbClient, lead: LeadRow, wsId: string,
  text: string, fromClient: boolean,
  type?: 'button' | 'brief_answer' | 'reminder'
) {
  const fresh    = await getLead(sb, wsId, Number(lead.tg_chat_id))
  const messages = [...((fresh?.messages ?? lead.messages ?? []) as LeadRow[])]
  const entry: Record<string, unknown> = { id: crypto.randomUUID(), text, date: Date.now(), fromClient }
  if (type) entry.type = type
  messages.push(entry)
  await sb.from('leads').update({ messages, updated_at: Date.now() }).eq('id', lead.id as string)
}
```

- [ ] **Step 2: Tag button clicks in `handleCallback`**

Find in `handleCallback` (~line 239–253):
```ts
  if (data === 'm:portfolio') {
    await tgSend(tok, chatId, PORTFOLIO_TEXT, ACTION_KB)
    await addMsg(sb, lead, wsId, '📹 [Примеры работ]', true)
    return
  }
  if (data === 'm:brief') {
    await startBrief(sb, lead, tok, chatId)
    await addMsg(sb, lead, wsId, '📋 [Оставить заявку]', true)
    return
  }
  if (data === 'm:manager') {
    await tgSend(tok, chatId, '👨‍💼 Передаю менеджеру! Свяжется в ближайшее время.')
    await addMsg(sb, lead, wsId, '💬 [Написать менеджеру]', true)
    await notifyOTR(sb, lead, wsId, '💬 Клиент запросил связь с менеджером', tok, displayName)
    return
  }
```

Replace with:
```ts
  if (data === 'm:portfolio') {
    await tgSend(tok, chatId, PORTFOLIO_TEXT, ACTION_KB)
    await addMsg(sb, lead, wsId, '📹 [Примеры работ]', true, 'button')
    return
  }
  if (data === 'm:brief') {
    await startBrief(sb, lead, tok, chatId)
    await addMsg(sb, lead, wsId, '📋 [Оставить заявку]', true, 'button')
    return
  }
  if (data === 'm:manager') {
    await tgSend(tok, chatId, '👨‍💼 Передаю менеджеру! Свяжется в ближайшее время.')
    await addMsg(sb, lead, wsId, '💬 [Написать менеджеру]', true, 'button')
    await notifyOTR(sb, lead, wsId, '💬 Клиент запросил связь с менеджером', tok, displayName)
    return
  }
```

- [ ] **Step 3: Tag brief button answers in `handleCallback`**

Find (~line 257–273):
```ts
  // Brief: format button
  if (data.startsWith('bf:') && state.mode === 'brief') {
    const format = data.slice(3)
    const ns: TgState = { ...state, brief: { ...state.brief, format }, step: 2 }
    await setState(sb, lead.id as string, ns)
    await addMsg(sb, lead, wsId, `Формат: ${format}`, true)
    await tgSend(tok, chatId, BRIEF_Q[2])
    return
  }

  // Brief: budget button
  if (data.startsWith('bb:') && state.mode === 'brief') {
    const budget = data.slice(3)
    const ns: TgState = { ...state, brief: { ...state.brief, budget }, step: 4 }
    await setState(sb, lead.id as string, ns)
    await addMsg(sb, lead, wsId, `Бюджет: ${budget}`, true)
    await tgSend(tok, chatId, BRIEF_Q[4])
  }
```

Replace with:
```ts
  // Brief: format button
  if (data.startsWith('bf:') && state.mode === 'brief') {
    const format = data.slice(3)
    const ns: TgState = { ...state, brief: { ...state.brief, format }, step: 2 }
    await setState(sb, lead.id as string, ns)
    await addMsg(sb, lead, wsId, `Формат: ${format}`, true, 'brief_answer')
    await tgSend(tok, chatId, BRIEF_Q[2])
    return
  }

  // Brief: budget button
  if (data.startsWith('bb:') && state.mode === 'brief') {
    const budget = data.slice(3)
    const ns: TgState = { ...state, brief: { ...state.brief, budget }, step: 4 }
    await setState(sb, lead.id as string, ns)
    await addMsg(sb, lead, wsId, `Бюджет: ${budget}`, true, 'brief_answer')
    await tgSend(tok, chatId, BRIEF_Q[4])
  }
```

- [ ] **Step 4: Commit (no deploy yet — Task 3 adds more changes)**

```bash
git add supabase/functions/tg-webhook/index.ts
git commit -m "feat(tg-webhook): addMsg optional type param + tag button/brief messages"
```

---

## Task 3: tg-webhook — classifyService + adaptive aiResponse + deploy

**Files:**
- Modify: `supabase/functions/tg-webhook/index.ts`

- [ ] **Step 1: Add `classifyService` function**

Find `// ─── AI RESPONSE ─────` section (~line 354). Insert the new function immediately BEFORE `async function aiResponse`:

```ts
// ─── SERVICE CLASSIFIER ──────────────────────────────────────────────────────

async function classifyService(text: string): Promise<string> {
  if (!GEMINI_KEY) return 'unknown'
  const prompt = `Ты классификатор запросов для агентства ADERVIS.
Направления агентства: video (видеосъёмка, монтаж, сценарий, Reels, Shorts, рекламные ролики), design (дизайн: логотипы, брендинг, SMM-графика, баннеры), photo (фотосъёмка бизнеса, продуктовая, репортажная), ai (ИИ-решения: боты, автоматизация, нейросети, генерация контента).
Клиент написал: «${text.slice(0, 300)}»
Ответь ОДНИМ словом без пояснений: video, design, photo, ai или unknown.`
  try {
    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 10, temperature: 0 }
        })
      }
    )
    const d = await res.json()
    const cat = (d?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim().toLowerCase()
    return ['video', 'design', 'photo', 'ai'].includes(cat) ? cat : 'unknown'
  } catch { return 'unknown' }
}
```

- [ ] **Step 2: Call `classifyService` in `handleMessage`**

Find in `handleMessage` (~line 188–189):
```ts
  // Store incoming
  await addMsg(sb, lead, wsId, text, true)

  // Human takeover — manager is handling, skip AI
```

Replace with:
```ts
  // Store incoming
  await addMsg(sb, lead, wsId, text, true)

  // Classify service direction on first substantive message (fire-and-forget)
  if (!lead.service_category && text.length > 3 && !text.startsWith('/')) {
    classifyService(text).then(cat =>
      sb.from('leads').update({ service_category: cat }).eq('id', lead.id as string)
    ).catch(() => {})
  }

  // Human takeover — manager is handling, skip AI
```

- [ ] **Step 3: Update `aiResponse` to accept and use category**

Find the `aiResponse` function signature (~line 356):
```ts
async function aiResponse(userText: string, history: LeadRow[]): Promise<string> {
  if (!GEMINI_KEY) return ''

  const recent = history.slice(-6)
    .map(m => (m.fromClient ? 'Клиент' : 'Менеджер') + ': «' + String(m.text ?? '').slice(0, 200) + '»')
    .join('\n')

  const prompt = [
    AI_PROMPT,
    recent ? `\nИстория:\n${recent}` : '',
    `\nКлиент: «${userText}»`,
    '\nТвой ответ:',
  ].join('\n')
```

Replace the signature line and prompt block with:
```ts
async function aiResponse(userText: string, history: LeadRow[], category?: string): Promise<string> {
  if (!GEMINI_KEY) return ''

  const CAT_CTX: Record<string, string> = {
    video:  '\n\nТекущий запрос клиента касается ВИДЕО (съёмка, монтаж, сценарий, Reels, Shorts, VK Клипы, рекламные ролики, корпоративные видео). Фокусируй ответ на видеопроизводстве.',
    design: '\n\nТекущий запрос клиента касается ДИЗАЙНА (логотипы, фирменный стиль, брендинг, SMM-графика, баннеры). Фокусируй ответ на дизайне.',
    photo:  '\n\nТекущий запрос клиента касается ФОТО (фотосъёмка бизнеса, продуктовая фото, репортажная съёмка). Фокусируй ответ на фотографии.',
    ai:     '\n\nТекущий запрос клиента касается ИИ-РЕШЕНИЙ (чат-боты, автоматизация, нейросети, генерация контента). Фокусируй ответ на AI-услугах.',
  }
  const categoryContext = (category && CAT_CTX[category]) ?? ''

  const recent = history.slice(-6)
    .map(m => (m.fromClient ? 'Клиент' : 'Менеджер') + ': «' + String(m.text ?? '').slice(0, 200) + '»')
    .join('\n')

  const prompt = [
    AI_PROMPT + categoryContext,
    recent ? `\nИстория:\n${recent}` : '',
    `\nКлиент: «${userText}»`,
    '\nТвой ответ:',
  ].join('\n')
```

- [ ] **Step 4: Pass category to aiResponse at call site**

Find in `handleMessage` (~line 208):
```ts
  const aiReply = await aiResponse(text, history)
```

Replace with:
```ts
  const aiReply = await aiResponse(text, history, (freshLead?.service_category as string) ?? undefined)
```

- [ ] **Step 5: Deploy tg-webhook**

```bash
npx supabase functions deploy tg-webhook --no-verify-jwt
```

Expected: `Deployed: tg-webhook`

- [ ] **Step 6: Verify classify works**

Send a test message to the TG bot: "хочу снять рекламный ролик для кафе"

Check Supabase dashboard → Table Editor → `leads` → find the test lead → confirm `service_category = 'video'`

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/tg-webhook/index.ts
git commit -m "feat(tg-webhook): classifyService + adaptive aiResponse by direction"
```

---

## Task 4: New tg-reminder Edge Function

**Files:**
- Create: `supabase/functions/tg-reminder/index.ts`

- [ ] **Step 1: Create the Edge Function file**

Create `supabase/functions/tg-reminder/index.ts` with this complete content:

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const DEFAULT_REMINDER = `Привет! 👋

Вы писали нам, но мы ещё не успели поговорить подробнее.

Хотите узнать, как мы поможем привлечь гостей через короткие видео? Оставьте заявку — займёт 2 минуты 👇

/brief`

type SbClient = ReturnType<typeof createClient>

async function runReminders(sb: SbClient): Promise<{ sent: number; skipped: number }> {
  let sent = 0, skipped = 0

  // All workspaces with reminders enabled
  const { data: workspaces, error: wsErr } = await sb
    .from('workspace_settings')
    .select('workspace_id, tg_bot_token, tg_reminder_text')
    .eq('tg_reminder_enabled', true)
    .not('tg_bot_token', 'is', null)

  if (wsErr) { console.error('ws query error:', wsErr); return { sent, skipped } }
  if (!workspaces?.length) return { sent, skipped }

  const now = Date.now()
  const h20 = now - 20 * 3600 * 1000   // 20 hours ago (JS ms)
  const d7  = now - 7  * 86400 * 1000  // 7 days ago (JS ms)

  for (const ws of workspaces) {
    const tok  = ws.tg_bot_token as string
    const wsId = ws.workspace_id as string
    const text = (ws.tg_reminder_text as string | null)?.trim() || DEFAULT_REMINDER

    const { data: candidates } = await sb
      .from('leads')
      .select('id, tg_chat_id, tg_state, messages')
      .eq('workspace_id', wsId)
      .not('tg_chat_id', 'is', null)
      .is('archived_at', null)
      .is('tg_reminded_at', null)
      .in('status', [0, 1, 2])
      .lt('updated_at', h20)
      .gt('updated_at', d7)

    for (const lead of candidates ?? []) {
      const state = (lead.tg_state ?? {}) as Record<string, unknown>

      // Skip if manager is handling
      if (state.mode === 'human') { skipped++; continue }

      // Skip if brief is already complete (all 6 fields)
      const brief  = (state.brief ?? {}) as Record<string, unknown>
      const filled = ['business', 'format', 'city', 'budget', 'name', 'contact'].filter(k => brief[k])
      if (filled.length >= 6) { skipped++; continue }

      // Send via TG Bot API
      const chatId = Number(lead.tg_chat_id)
      const ok = await fetch(`https://api.telegram.org/bot${tok}/sendMessage`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ chat_id: chatId, text }),
      }).then(r => r.ok).catch(() => false)

      if (!ok) { skipped++; continue }

      // Store as reminder message + mark lead as reminded
      const messages = [...((lead.messages ?? []) as Record<string, unknown>[])]
      messages.push({ id: crypto.randomUUID(), text, date: now, fromClient: false, type: 'reminder' })

      await sb.from('leads').update({
        tg_reminded_at: now,
        messages,
        updated_at:     now,
      }).eq('id', lead.id as string)

      sent++
    }
  }

  return { sent, skipped }
}

// Scheduled: every 6 hours
Deno.cron('tg-reminders', '0 */6 * * *', async () => {
  const sb = createClient(SUPABASE_URL, SERVICE_KEY)
  const result = await runReminders(sb)
  console.log('tg-reminder cron:', result)
})

// HTTP handler: manual trigger via POST (for testing)
Deno.serve(async (req: Request) => {
  if (req.method === 'POST') {
    const sb = createClient(SUPABASE_URL, SERVICE_KEY)
    const result = await runReminders(sb)
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
      status: 200
    })
  }
  return new Response('tg-reminder ok', { status: 200 })
})
```

- [ ] **Step 2: Deploy**

```bash
npx supabase functions deploy tg-reminder
```

Expected: `Deployed: tg-reminder`

- [ ] **Step 3: Verify via manual trigger**

First enable reminders on a test workspace in Supabase dashboard → `workspace_settings` → set `tg_reminder_enabled = true`.

Then trigger manually (replace URL with your Supabase project URL):
```bash
curl -X POST https://<your-project>.supabase.co/functions/v1/tg-reminder \
  -H "Authorization: Bearer <your-anon-key>"
```

Expected response: `{"sent":0,"skipped":0}` (or actual counts if eligible leads exist)

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/tg-reminder/index.ts
git commit -m "feat(tg-reminder): new Edge Function with Deno.cron every 6h"
```

---

## Task 5: index.html — getMsgType + renderSingleMessage + CSS

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add `getMsgType` helper function**

Find `function renderSingleMessage(m, leadId, msgIdx) {` (~line 6056). Insert immediately BEFORE it:

```js
        function getMsgType(m) {
            if (!m.fromClient) return 'text';
            if (m.type === 'button')       return 'button';
            if (m.type === 'brief_answer') return 'brief_answer';
            // Backward compat: detect by content for messages without type field
            if (/\[.+\]/.test(m.text))             return 'button';
            if (/^(Формат|Бюджет):/.test(m.text))  return 'brief_answer';
            return 'text';
        }

        function renderButtonMessage(m, leadId) {
            const ds        = formatMsgTime(m.date);
            const safeText  = escapeHtml(m.text);
            const safeId    = escapeHtml(String(leadId));
            return '<div class="msg-wrap client msg-type-button" data-lead-id="' + safeId + '">' +
                '<div class="msg-button-pill" aria-label="Клиент нажал кнопку: ' + safeText + '">' + safeText + '</div>' +
                '<div class="msg-meta msg-meta-small">Клиент · ' + ds + '</div>' +
                '</div>';
        }

        function renderBriefAnswerMessage(m, leadId) {
            const ds    = formatMsgTime(m.date);
            const safeId = escapeHtml(String(leadId));
            const parts  = m.text.split(':');
            const key    = escapeHtml((parts[0] || '').trim());
            const value  = escapeHtml(parts.slice(1).join(':').trim());
            return '<div class="msg-wrap client msg-type-brief" data-lead-id="' + safeId + '">' +
                '<div class="msg-brief-card" role="region" aria-label="Ответ брифа: ' + key + ': ' + value + '">' +
                    '<div class="msg-brief-key">' + key + '</div>' +
                    '<div class="msg-brief-value">' + value + '</div>' +
                '</div>' +
                '<div class="msg-meta msg-meta-small">Клиент · ' + ds + '</div>' +
                '</div>';
        }
```

- [ ] **Step 2: Update `renderSingleMessage` to dispatch by type**

Find at the start of `renderSingleMessage` (line ~6056):
```js
        function renderSingleMessage(m, leadId, msgIdx) {
            const ds = formatMsgTime(m.date);
```

Replace the first line with:
```js
        function renderSingleMessage(m, leadId, msgIdx) {
            const msgType = getMsgType(m);
            if (msgType === 'button')       return renderButtonMessage(m, leadId);
            if (msgType === 'brief_answer') return renderBriefAnswerMessage(m, leadId);
            const ds = formatMsgTime(m.date);
```

- [ ] **Step 3: Add new CSS classes**

Find the `<style>` block and locate `.msg-wrap` or `.msg-bubble` styles. Insert these new classes immediately after `.msg-meta { ... }` or any other `.msg-*` rule:

```css
/* Message type: button click pill */
.msg-type-button { justify-content: flex-end; }
.msg-button-pill {
    display: inline-block;
    background: var(--surface-2, rgba(255,255,255,0.04));
    color: var(--text-muted);
    border: 1px solid var(--border);
    border-radius: 20px;
    padding: 3px 12px;
    font-size: 12px;
    max-width: 220px;
    word-break: break-word;
}

/* Message type: brief answer card */
.msg-type-brief { justify-content: flex-end; }
.msg-brief-card {
    background: var(--surface, #1a1a2e);
    border-left: 3px solid #06b6d4;
    border-radius: 6px;
    padding: 6px 12px;
    min-width: 100px;
    max-width: 220px;
}
.msg-brief-key {
    font-size: 10px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 2px;
}
.msg-brief-value {
    font-size: 13px;
    color: var(--text);
    font-weight: 500;
}
.msg-meta-small {
    font-size: 10px;
    color: var(--text-muted);
    margin-top: 3px;
    text-align: right;
}
```

- [ ] **Step 4: Verify in browser**

Open the app. Open a TG lead that has historical messages with `[...]` patterns (e.g. `'📹 [Примеры работ]'`) or `'Формат: ...'`.

Expected:
- `'📹 [Примеры работ]'` → renders as small pill chip on the right
- `'Формат: Reels / Shorts'` → renders as a card with `ФОРМАТ` key and `Reels / Shorts` value
- Regular messages → unchanged bubble rendering

Send a new `/start` → click "Примеры работ" → confirm the stored message renders as pill.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat(ui): message type styles — button pill + brief answer card"
```

---

## Task 6: index.html — tgSettings reminder fields + Settings UI

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Update `tgSettings` global**

Find at line ~2034:
```js
        let tgSettings = { botToken: '', botUsername: '', quickReplies: [...DEFAULT_QUICK_REPLIES], welcomeText: '', briefConfig: [] };
```

Replace with:
```js
        let tgSettings = { botToken: '', botUsername: '', quickReplies: [...DEFAULT_QUICK_REPLIES], welcomeText: '', briefConfig: [], reminderEnabled: false, reminderText: '' };
```

- [ ] **Step 2: Update `loadTgSettings` — SELECT + populate fields**

Find at line ~5465:
```js
        async function loadTgSettings() {
            if (!workspaceId) return;
            const { data } = await _sb
                .from('workspace_settings')
                .select('tg_bot_token, tg_bot_username, tg_quick_replies, tg_welcome_text, tg_brief_config')
                .eq('workspace_id', workspaceId)
                .maybeSingle();
            if (!data) return;
            tgSettings = {
                botToken:     data.tg_bot_token    || '',
                botUsername:  data.tg_bot_username  || '',
                quickReplies: (Array.isArray(data.tg_quick_replies) && data.tg_quick_replies.length > 0) ? data.tg_quick_replies : [...DEFAULT_QUICK_REPLIES],
                welcomeText:  data.tg_welcome_text  || '',
                briefConfig:  Array.isArray(data.tg_brief_config)  ? data.tg_brief_config  : [],
            };
            const tf = document.getElementById('tgBotTokenInput');
            if (tf) tf.value = tgSettings.botToken;
            const uf = document.getElementById('tgBotUsernameInput');
            if (uf) uf.value = tgSettings.botUsername;
            const wf = document.getElementById('tgWelcomeTextInput');
            if (wf) wf.value = tgSettings.welcomeText;
            renderQuickRepliesEditor();
            updateTgWebhookUrlDisplay();
        }
```

Replace with:
```js
        async function loadTgSettings() {
            if (!workspaceId) return;
            const { data } = await _sb
                .from('workspace_settings')
                .select('tg_bot_token, tg_bot_username, tg_quick_replies, tg_welcome_text, tg_brief_config, tg_reminder_enabled, tg_reminder_text')
                .eq('workspace_id', workspaceId)
                .maybeSingle();
            if (!data) return;
            tgSettings = {
                botToken:        data.tg_bot_token      || '',
                botUsername:     data.tg_bot_username   || '',
                quickReplies:    (Array.isArray(data.tg_quick_replies) && data.tg_quick_replies.length > 0) ? data.tg_quick_replies : [...DEFAULT_QUICK_REPLIES],
                welcomeText:     data.tg_welcome_text   || '',
                briefConfig:     Array.isArray(data.tg_brief_config) ? data.tg_brief_config : [],
                reminderEnabled: !!data.tg_reminder_enabled,
                reminderText:    data.tg_reminder_text  || '',
            };
            const tf = document.getElementById('tgBotTokenInput');
            if (tf) tf.value = tgSettings.botToken;
            const uf = document.getElementById('tgBotUsernameInput');
            if (uf) uf.value = tgSettings.botUsername;
            const wf = document.getElementById('tgWelcomeTextInput');
            if (wf) wf.value = tgSettings.welcomeText;
            const re = document.getElementById('tgReminderEnabledInput');
            if (re) re.checked = tgSettings.reminderEnabled;
            const rt = document.getElementById('tgReminderTextInput');
            if (rt) rt.value = tgSettings.reminderText;
            renderQuickRepliesEditor();
            updateTgWebhookUrlDisplay();
        }
```

- [ ] **Step 3: Update `saveTgSettings` — upsert reminder fields**

Find in `saveTgSettings` (~line 5497):
```js
        async function saveTgSettings() {
            if (!workspaceId) return;
            const token    = (document.getElementById('tgBotTokenInput').value    || '').trim();
            const username = (document.getElementById('tgBotUsernameInput').value || '').trim().replace(/^@/, '');
            const welcome  = (document.getElementById('tgWelcomeTextInput')       ? document.getElementById('tgWelcomeTextInput').value : tgSettings.welcomeText || '');
            const { error } = await _sb.from('workspace_settings').upsert({
                workspace_id:      workspaceId,
                tg_bot_token:      token    || null,
                tg_bot_username:   username || null,
                tg_quick_replies:  tgSettings.quickReplies || [],
                tg_welcome_text:   welcome  || null,
                tg_brief_config:   tgSettings.briefConfig  || [],
                updated_at:        Date.now()
            }, { onConflict: 'workspace_id' });
            if (error) { showToast('Ошибка сохранения TG: ' + error.message, 4000); return; }
            tgSettings.botToken    = token;
            tgSettings.botUsername = username;
            tgSettings.welcomeText = welcome;
            showToast('TG Bot сохранён ✓');
        }
```

Replace with:
```js
        async function saveTgSettings() {
            if (!workspaceId) return;
            const token           = (document.getElementById('tgBotTokenInput').value    || '').trim();
            const username        = (document.getElementById('tgBotUsernameInput').value || '').trim().replace(/^@/, '');
            const welcome         = document.getElementById('tgWelcomeTextInput') ? document.getElementById('tgWelcomeTextInput').value : tgSettings.welcomeText || '';
            const reminderEnabled = !!(document.getElementById('tgReminderEnabledInput') || {}).checked;
            const reminderText    = (document.getElementById('tgReminderTextInput') ? document.getElementById('tgReminderTextInput').value : tgSettings.reminderText || '').trim();
            const { error } = await _sb.from('workspace_settings').upsert({
                workspace_id:         workspaceId,
                tg_bot_token:         token           || null,
                tg_bot_username:      username        || null,
                tg_quick_replies:     tgSettings.quickReplies || [],
                tg_welcome_text:      welcome         || null,
                tg_brief_config:      tgSettings.briefConfig  || [],
                tg_reminder_enabled:  reminderEnabled,
                tg_reminder_text:     reminderText    || null,
                updated_at:           Date.now()
            }, { onConflict: 'workspace_id' });
            if (error) { showToast('Ошибка сохранения TG: ' + error.message, 4000); return; }
            tgSettings.botToken        = token;
            tgSettings.botUsername     = username;
            tgSettings.welcomeText     = welcome;
            tgSettings.reminderEnabled = reminderEnabled;
            tgSettings.reminderText    = reminderText;
            showToast('TG Bot сохранён ✓');
        }
```

- [ ] **Step 4: Add reminder UI to Settings HTML**

Find at line ~1940 (after `tgWelcomeTextInput` block, before `quickRepliesEditor` block):
```html
                    <div style="border-top:1px solid var(--border);padding-top:10px;margin-top:2px;">
                        <label style="font-size:12px;color:var(--muted);display:block;margin-bottom:4px;">Быстрые ответы в TG-чате</label>
```

Insert immediately BEFORE that `<div>`:
```html
                    <div style="border-top:1px solid var(--border);padding-top:10px;margin-top:2px;">
                        <label style="font-size:12px;color:var(--muted);display:block;margin-bottom:6px;">⏰ Напоминания (через 24 ч если бриф не заполнен)</label>
                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                            <input type="checkbox" id="tgReminderEnabledInput" style="width:16px;height:16px;cursor:pointer;" aria-label="Включить автонапоминания">
                            <label for="tgReminderEnabledInput" style="font-size:13px;cursor:pointer;color:var(--text);">Включить автонапоминания</label>
                        </div>
                        <label for="tgReminderTextInput" style="font-size:12px;color:var(--muted);display:block;margin-bottom:4px;">Текст напоминания</label>
                        <textarea id="tgReminderTextInput" rows="4" style="width:100%;font-size:12px;resize:vertical;" placeholder="Привет! Вы писали нам, но мы ещё не успели поговорить..." aria-label="Текст автонапоминания TG Bot"></textarea>
                        <div style="font-size:10px;color:var(--muted);margin-top:2px;">Оставь пустым — будет использован текст по умолчанию</div>
                    </div>

```

- [ ] **Step 5: Verify in browser**

Open Settings → TG Bot section. Confirm:
- Checkbox "Включить автонапоминания" appears
- Textarea "Текст напоминания" appears
- Check the box, enter text, click Сохранить
- Refresh → reopen Settings → values restored (check Supabase dashboard to confirm save)

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat(settings): TG reminder toggle + text field"
```

---

## Task 7: index.html — rowToLead/leadToRow + service category badges

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add `tgRemindedAt` and `serviceCategory` to `leadToRow`**

Find in `leadToRow` (~line 3097–3100):
```js
                vk_peer_id:    lead.vkPeerId    != null ? Number(lead.vkPeerId) : null,
                tg_chat_id:    lead.tgChatId    != null ? Number(lead.tgChatId) : null,
                tg_state:      lead.tgState     ?? null,
                playbook_step:        lead.playbookStep    ?? null,
```

Replace with:
```js
                vk_peer_id:       lead.vkPeerId    != null ? Number(lead.vkPeerId) : null,
                tg_chat_id:       lead.tgChatId    != null ? Number(lead.tgChatId) : null,
                tg_state:         lead.tgState     ?? null,
                tg_reminded_at:   lead.tgRemindedAt ?? null,
                service_category: lead.serviceCategory ?? null,
                playbook_step:        lead.playbookStep    ?? null,
```

- [ ] **Step 2: Add `tgRemindedAt` and `serviceCategory` to `rowToLead`**

Find in `rowToLead` (~line 3122–3125):
```js
                vkPeerId:     row.vk_peer_id != null ? Number(row.vk_peer_id) : null,
                tgChatId:     row.tg_chat_id != null ? Number(row.tg_chat_id) : null,
                tgState:      row.tg_state   ?? null,
                playbookStep:       row.playbook_step      ?? null,
```

Replace with:
```js
                vkPeerId:         row.vk_peer_id   != null ? Number(row.vk_peer_id) : null,
                tgChatId:         row.tg_chat_id   != null ? Number(row.tg_chat_id) : null,
                tgState:          row.tg_state      ?? null,
                tgRemindedAt:     row.tg_reminded_at ?? null,
                serviceCategory:  row.service_category ?? null,
                playbookStep:       row.playbook_step      ?? null,
```

- [ ] **Step 3: Add service category pill in `renderTgLeadItem`**

Find in `renderTgLeadItem` (~line 2529–2534):
```js
            const vkPill = lead.vkPeerId
                ? '<span style="font-size:10px;font-weight:700;color:#1da1f2;margin-right:2px;">VK</span>'
                : '';
            const bizPill = lead.bizType
                ? '<span class="li-biz">' + escapeHtml(lead.bizType.slice(0, 14)) + '</span>'
                : '';
```

Insert immediately BEFORE `const vkPill`:
```js
            const CAT_ICONS = { video: '🎬', design: '🎨', photo: '📸', ai: '🤖' };
            const catPill = (lead.serviceCategory && CAT_ICONS[lead.serviceCategory])
                ? '<span style="font-size:11px;margin-right:2px;" title="Направление: ' + lead.serviceCategory + '" aria-label="Направление: ' + lead.serviceCategory + '">' + CAT_ICONS[lead.serviceCategory] + '</span>'
                : '';
```

Find the `li-meta` span (~line 2571):
```js
                        '<span class="li-meta">' + briefPill + vkPill + bizPill + scorePill + attPill + metaRight + '</span>' +
```

Replace with:
```js
                        '<span class="li-meta">' + catPill + briefPill + vkPill + bizPill + scorePill + attPill + metaRight + '</span>' +
```

- [ ] **Step 4: Verify in browser**

Send a test message to the bot: "хочу заказать логотип".
Open OTR → find the lead → confirm 🎨 appears next to the name in the sidebar.

Send another test: "нужна съёмка реклама". Confirm 🎬 appears.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat(ui): service category badges in sidebar + rowToLead/leadToRow mapping"
```

---

## Task 8: Smoke Test + Push

- [ ] **Step 1: Full smoke test — message type styling**

1. Open OTR app
2. In Telegram, send `/start` to the bot → click "📹 Примеры работ"
3. In OTR → open the lead → confirm the `📹 [Примеры работ]` message renders as a **pill chip** (not a bubble)
4. Click "📋 Оставить заявку" in the bot → go through the brief → click format button "Reels / Shorts"
5. In OTR → confirm `Формат: Reels / Shorts` renders as a **brief card** (teal left border)
6. Type a regular text message → confirm it renders as the **normal bubble**

- [ ] **Step 2: Full smoke test — classifier**

1. Start a fresh TG conversation (or use a lead with no `service_category`)
2. Send: "хочу сделать рекламный ролик для кофейни"
3. Wait 5–10 seconds
4. In Supabase → `leads` table → confirm `service_category = 'video'`
5. In OTR sidebar → confirm 🎬 icon appears on the lead

- [ ] **Step 3: Full smoke test — reminders**

1. In Settings → TG Bot → check "Включить автонапоминания" → add custom text → Сохранить
2. Confirm in Supabase: `workspace_settings.tg_reminder_enabled = true`
3. Manually create a test lead with `tg_chat_id` set, `status = 1`, `tg_reminded_at = null`, `updated_at` set to 25 hours ago (update directly in Supabase dashboard)
4. Trigger reminder manually:
```bash
curl -X POST https://<project>.supabase.co/functions/v1/tg-reminder \
  -H "Authorization: Bearer <anon-key>"
```
5. Confirm response shows `{"sent":1,"skipped":0}`
6. Check Telegram — reminder received
7. Check OTR → messages for that lead includes the reminder message
8. Check Supabase → `leads.tg_reminded_at` is set

- [ ] **Step 4: Push to remote**

```bash
git push origin main
```

- [ ] **Step 5: Update memory**

Update project memory to reflect Sprint 3 completion.

---

## Self-Review

**Spec coverage:**
- ✅ SQL: `tg_reminded_at`, `tg_reminder_enabled`, `tg_reminder_text`, `service_category` → Task 1
- ✅ `addMsg` type param + callers tagged → Task 2
- ✅ `classifyService()` + call in handleMessage → Task 3
- ✅ Adaptive `aiResponse` with category context → Task 3
- ✅ tg-webhook redeployed → Task 3
- ✅ `tg-reminder` EF with Deno.cron every 6h → Task 4
- ✅ Eligibility: mode != human, brief < 6 fields, 20h < last_msg < 7d → Task 4
- ✅ Reminder stored as message + `tg_reminded_at` set → Task 4
- ✅ `getMsgType` + `renderButtonMessage` + `renderBriefAnswerMessage` → Task 5
- ✅ Backward compat detection by content → Task 5
- ✅ New CSS classes → Task 5
- ✅ `tgSettings.reminderEnabled/reminderText` global → Task 6
- ✅ `loadTgSettings` + `saveTgSettings` updated → Task 6
- ✅ Settings UI: checkbox + textarea → Task 6
- ✅ `rowToLead` + `leadToRow` for new fields → Task 7
- ✅ Category badges in sidebar → Task 7

**Type consistency:**
- `tgSettings.reminderEnabled` (boolean) used consistently in Task 6
- `getMsgType` returns `'text' | 'button' | 'brief_answer'` — consumed only in Task 5
- `addMsg` 6th param is `'button' | 'brief_answer' | 'reminder'` — `type?: 'button' | 'brief_answer' | 'reminder'`
- Note: `renderSingleMessage` checks for `'reminder'` type messages via `getMsgType` → falls through to `text` rendering (reminder messages are `fromClient: false` so getMsgType returns `'text'` for them — correct, they render as manager bubbles)
