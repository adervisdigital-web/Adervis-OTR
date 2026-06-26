# Sprint 1: Manager Takeover + {tg_bot_link} Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "✋ Подключиться" toggle to TG chats (silences AI bot when manager takes over) and `{tg_bot_link}` placeholder in script templates.

**Architecture:**
- Manager takeover: `tg_state.mode = 'human'` is already the planned value; the webhook's early-exit blocks AI response while still storing the client's message. Frontend toggle button reads/writes `lead.tgState` and upserts to Supabase.
- Bot link: `tg_bot_username` stored in `workspace_settings` (alongside existing `tg_bot_token`). `substituteCta()` reads from the global `tgSettings` object. Requires one SQL migration.

**Tech Stack:** Vanilla JS, single-file `index.html`, Supabase JS SDK v2, Supabase Edge Functions (Deno/TypeScript), Supabase CLI for deploys.

---

## File Map

| File | Change |
|------|--------|
| `index.html` | Fix `rowToLead`/`leadToRow` for `tg_state`, add `switchTgMode()`, update `renderChatHeader()`, update `tgSettings`/`loadTgSettings`/`saveTgSettings`, add Settings UI input, update `substituteCta()`, update placeholder hint |
| `supabase/functions/tg-webhook/index.ts` | Add `'human'` to `TgState.mode` union, add early-exit guard |
| `supabase/migrations/20260627_tg_bot_username.sql` | `ALTER TABLE workspace_settings ADD COLUMN IF NOT EXISTS tg_bot_username TEXT DEFAULT ''` |

---

## Task 1: SQL migration — `tg_bot_username`

**Files:**
- Create: `supabase/migrations/20260627_tg_bot_username.sql`

- [ ] **Step 1: Create migration file**

```sql
-- Add tg_bot_username to workspace_settings
ALTER TABLE workspace_settings
  ADD COLUMN IF NOT EXISTS tg_bot_username TEXT DEFAULT '';
```

Save to `supabase/migrations/20260627_tg_bot_username.sql`.

- [ ] **Step 2: Apply to Supabase**

```bash
npx supabase db push
```

Expected: no errors, migration applied successfully.

- [ ] **Step 3: Verify column exists**

In Supabase dashboard → Table Editor → `workspace_settings` → confirm column `tg_bot_username` is present with default `''`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260627_tg_bot_username.sql
git commit -m "feat(db): add tg_bot_username column to workspace_settings"
```

---

## Task 2: Fix `rowToLead` / `leadToRow` for `tg_state`

**Files:**
- Modify: `index.html` at `rowToLead` (line ~3073) and `leadToRow` (line ~3048)

This is a pre-existing bug: `tg_state` is stored in the DB but never loaded into the in-memory lead objects. The takeover feature depends on it being present.

- [ ] **Step 1: Add `tg_state` to `leadToRow`**

Find this block in `leadToRow` (around line 3064–3069):
```js
vk_peer_id:    lead.vkPeerId    != null ? Number(lead.vkPeerId) : null,
tg_chat_id:    lead.tgChatId    != null ? Number(lead.tgChatId) : null,
playbook_step:        lead.playbookStep    ?? null,
archived_at:          lead.archivedAt       ?? null,
deal_score:           lead.dealScore         ?? null,
deal_score_reason:    lead.dealScoreReason   || null
```

Add one line after `tg_chat_id`:
```js
vk_peer_id:    lead.vkPeerId    != null ? Number(lead.vkPeerId) : null,
tg_chat_id:    lead.tgChatId    != null ? Number(lead.tgChatId) : null,
tg_state:      lead.tgState     ?? null,
playbook_step:        lead.playbookStep    ?? null,
archived_at:          lead.archivedAt       ?? null,
deal_score:           lead.dealScore         ?? null,
deal_score_reason:    lead.dealScoreReason   || null
```

- [ ] **Step 2: Add `tgState` to `rowToLead`**

Find this block in `rowToLead` (around line 3088–3094):
```js
vkPeerId:     row.vk_peer_id != null ? Number(row.vk_peer_id) : null,
tgChatId:     row.tg_chat_id != null ? Number(row.tg_chat_id) : null,
playbookStep:       row.playbook_step      ?? null,
archivedAt:         row.archived_at         || null,
dealScore:          row.deal_score           ?? null,
dealScoreReason:    row.deal_score_reason    || null
```

Add one line after `tgChatId`:
```js
vkPeerId:     row.vk_peer_id != null ? Number(row.vk_peer_id) : null,
tgChatId:     row.tg_chat_id != null ? Number(row.tg_chat_id) : null,
tgState:      row.tg_state   ?? null,
playbookStep:       row.playbook_step      ?? null,
archivedAt:         row.archived_at         || null,
dealScore:          row.deal_score           ?? null,
dealScoreReason:    row.deal_score_reason    || null
```

- [ ] **Step 3: Verify in browser**

Open the app. Open a TG lead (one with `tg_chat_id` set). Open DevTools → Console:
```js
leads.find(l => l.tgChatId).tgState
```
Expected: `null` or `{mode: 'menu', ...}` — NOT `undefined`.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "fix(db): map tg_state <-> tgState in rowToLead/leadToRow"
```

---

## Task 3: Update `tg-webhook` — human mode guard

**Files:**
- Modify: `supabase/functions/tg-webhook/index.ts`

- [ ] **Step 1: Add `'human'` to `TgState` interface**

Find at line ~97:
```ts
interface TgState {
  mode: 'menu' | 'brief' | 'ai'
```

Change to:
```ts
interface TgState {
  mode: 'menu' | 'brief' | 'ai' | 'human'
```

- [ ] **Step 2: Add human-mode early exit in `handleMessage`**

Find at line ~187–194 (after `// Store incoming`):
```ts
  // Store incoming
  await addMsg(sb, lead, wsId, text, true)

  // Brief flow
  if (state.mode === 'brief' && state.step !== undefined) {
    await processBrief(sb, lead, state, text, tok, chatId, wsId, displayName)
    return
  }

  // AI assistant
```

Insert between "Store incoming" and "Brief flow":
```ts
  // Store incoming
  await addMsg(sb, lead, wsId, text, true)

  // Human takeover — manager is handling, skip AI
  if (state.mode === 'human') {
    pushNotify(sb, wsId, displayName, text).catch(() => {})
    return
  }

  // Brief flow
  if (state.mode === 'brief' && state.step !== undefined) {
    await processBrief(sb, lead, state, text, tok, chatId, wsId, displayName)
    return
  }

  // AI assistant
```

- [ ] **Step 3: Deploy the Edge Function**

```bash
npx supabase functions deploy tg-webhook --no-verify-jwt
```

Expected: `Deployed: tg-webhook`

- [ ] **Step 4: Verify human mode blocks AI**

In Supabase dashboard → Table Editor → `leads` → find a TG lead → manually set `tg_state` to `{"mode":"human","aiRounds":0,"brief":{}}`.

Send a test message from Telegram to the bot. Expected: message appears in OTR (realtime), NO bot reply sent to Telegram.

Reset: set `tg_state` back to `{"mode":"menu","aiRounds":0,"brief":{}}`.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/tg-webhook/index.ts
git commit -m "feat(tg-webhook): skip AI reply when tg_state.mode = 'human'"
```

---

## Task 4: `switchTgMode()` function + `renderChatHeader` toggle button

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add `switchTgMode` function**

Find `async function sendToTg(leadId)` (line ~4499). Insert this new function immediately before it:

```js
async function switchTgMode(leadId) {
    const lead = leads.find(function(l) { return String(l.id) === String(leadId); });
    if (!lead || !lead.tgChatId) return;
    const state = lead.tgState || { mode: 'menu', aiRounds: 0, brief: {} };
    const isHuman = state.mode === 'human';
    const newState = isHuman
        ? Object.assign({}, state, { mode: 'menu', aiRounds: 0 })
        : Object.assign({}, state, { mode: 'human' });
    const { error } = await _sb.from('leads')
        .update({ tg_state: newState, updated_at: Date.now() })
        .eq('id', lead.id);
    if (error) { showToast('Ошибка: ' + error.message, 4000); return; }
    lead.tgState = newState;
    showToast(isHuman ? '🤖 AI подключён' : '✋ AI отключён — вы ведёте диалог');
    if (String(currentChatLeadId) === String(leadId)) renderChatHeader(lead);
}
```

- [ ] **Step 2: Add toggle button to `renderChatHeader`**

In `renderChatHeader` (line ~2948), find the last button in the header string — the `→ Следующий` button:
```js
'<button class="btn btn-outline chat-nav-btn" onclick="goToNextLead()" style="flex-shrink:0;padding:6px 10px;font-size:12px;" aria-label="Следующий лид" data-tooltip="Следующий лид в очереди">→ Следующий</button>';
```

Replace this closing `';` with a conditional TG toggle before it:
```js
(lead.tgChatId ? (function() {
    var isTgHuman = lead.tgState && lead.tgState.mode === 'human';
    var safeLeadId = JSON.stringify(String(lead.id));
    return '<button class="btn ' + (isTgHuman ? 'btn-primary' : 'btn-outline') + ' chat-nav-btn"' +
        ' onclick="switchTgMode(' + safeLeadId + ')"' +
        ' style="flex-shrink:0;padding:6px 10px;font-size:12px;"' +
        ' aria-label="' + (isTgHuman ? 'Включить AI-бота' : 'Взять диалог на себя — отключить AI') + '"' +
        ' data-tooltip="' + (isTgHuman ? 'AI сейчас отключён — нажми чтобы вернуть' : 'AI отвечает автоматически — нажми чтобы взять диалог') + '">' +
        (isTgHuman ? '🤖 AI вкл' : '✋ Подключиться') +
        '</button>';
}()) : '') +
'<button class="btn btn-outline chat-nav-btn" onclick="goToNextLead()" style="flex-shrink:0;padding:6px 10px;font-size:12px;" aria-label="Следующий лид" data-tooltip="Следующий лид в очереди">→ Следующий</button>';
```

- [ ] **Step 3: Verify in browser**

Open the app. Open a TG lead (with `tgChatId` set):
- Header should show "✋ Подключиться" button (AI mode)
- Click it → button changes to "🤖 AI вкл" (green/primary), toast "AI отключён"
- Click again → button back to "✋ Подключиться", toast "AI подключён"
- Open DevTools → check that `leads.find(l=>l.tgChatId).tgState.mode` matches button state
- Non-TG leads: button NOT present in header

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(ui): add Подключиться/AI toggle button to TG chat header"
```

---

## Task 5: `{tg_bot_link}` — tgSettings + load/save + Settings UI

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add `botUsername` to `tgSettings` global**

Find at line ~1995:
```js
let tgSettings = { botToken: '' };
```

Change to:
```js
let tgSettings = { botToken: '', botUsername: '' };
```

- [ ] **Step 2: Update `loadTgSettings` to read `tg_bot_username`**

Find at line ~5352–5361:
```js
        async function loadTgSettings() {
            if (!workspaceId) return;
            const { data } = await _sb
                .from('workspace_settings')
                .select('tg_bot_token')
                .eq('workspace_id', workspaceId)
                .maybeSingle();
            if (!data) return;
            tgSettings = { botToken: data.tg_bot_token || '' };
            const tf = document.getElementById('tgBotTokenInput');
            if (tf) tf.value = tgSettings.botToken;
            updateTgWebhookUrlDisplay();
        }
```

Replace with:
```js
        async function loadTgSettings() {
            if (!workspaceId) return;
            const { data } = await _sb
                .from('workspace_settings')
                .select('tg_bot_token, tg_bot_username')
                .eq('workspace_id', workspaceId)
                .maybeSingle();
            if (!data) return;
            tgSettings = { botToken: data.tg_bot_token || '', botUsername: data.tg_bot_username || '' };
            const tf = document.getElementById('tgBotTokenInput');
            if (tf) tf.value = tgSettings.botToken;
            const uf = document.getElementById('tgBotUsernameInput');
            if (uf) uf.value = tgSettings.botUsername;
            updateTgWebhookUrlDisplay();
        }
```

- [ ] **Step 3: Update `saveTgSettings` to write `tg_bot_username`**

Find at line ~5371–5382:
```js
        async function saveTgSettings() {
            if (!workspaceId) return;
            const token = (document.getElementById('tgBotTokenInput').value || '').trim();
            const { error } = await _sb.from('workspace_settings').upsert({
                workspace_id: workspaceId,
                tg_bot_token: token || null,
                updated_at: Date.now()
            }, { onConflict: 'workspace_id' });
            if (error) { showToast('Ошибка сохранения TG: ' + error.message, 4000); return; }
```

Replace the upsert object (keep surrounding structure):
```js
        async function saveTgSettings() {
            if (!workspaceId) return;
            const token    = (document.getElementById('tgBotTokenInput').value    || '').trim();
            const username = (document.getElementById('tgBotUsernameInput').value || '').trim().replace(/^@/, '');
            tgSettings.botToken    = token;
            tgSettings.botUsername = username;
            const { error } = await _sb.from('workspace_settings').upsert({
                workspace_id:     workspaceId,
                tg_bot_token:     token    || null,
                tg_bot_username:  username || null,
                updated_at:       Date.now()
            }, { onConflict: 'workspace_id' });
            if (error) { showToast('Ошибка сохранения TG: ' + error.message, 4000); return; }
```

Note: `.replace(/^@/, '')` strips leading `@` so both `@adervis_bot` and `adervis_bot` work.

- [ ] **Step 4: Add username input to Settings UI**

Find at line ~1904–1905 (inside `#tgSection`):
```html
<label for="tgBotTokenInput" style="font-size:12px;color:var(--muted);margin-bottom:-4px;">Bot Token (от @BotFather)</label>
<input type="password" id="tgBotTokenInput" placeholder="123456789:ABC-DEF1234..." style="width:100%;" autocomplete="off" aria-label="Telegram Bot Token">
```

Insert immediately after the token `<input>`:
```html
<label for="tgBotUsernameInput" style="font-size:12px;color:var(--muted);margin-bottom:-4px;margin-top:4px;">Username бота (без @)</label>
<input type="text" id="tgBotUsernameInput" placeholder="adervis_bot" style="width:100%;" autocomplete="off" aria-label="Telegram Bot Username">
```

- [ ] **Step 5: Verify in browser**

Open Settings → Telegram Bot section. Confirm:
- New field "Username бота" appears between Token and Webhook URL
- Enter a username (e.g. `testbot`), click Сохранить
- Refresh page, re-open Settings → field shows `testbot`
- Check DevTools: `tgSettings.botUsername === 'testbot'`

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat(settings): add tg_bot_username field to TG settings"
```

---

## Task 6: `{tg_bot_link}` in `substituteCta` + hint

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add replacement to `substituteCta`**

Find at line ~5874–5885:
```js
        function substituteCta(text, lead) {
            if (!text) return '';
            const restName = (lead && lead.name) ? lead.name : 'вашем заведении';
            return text
                .replace(/{greeting}/g, 'Добрый день! ')
                .replace(/{rest}/g, restName)
                .replace(/{call}/g, cta.call || 'созвон')
                .replace(/{call_link}/g, cta.callLink || '[ссылка на созвон]')
                .replace(/{brief}/g, cta.brief || 'бриф')
                .replace(/{brief_link}/g, cta.briefLink || '[ссылка на бриф]')
                .replace(/{meeting}/g, cta.meeting || 'встреча');
        }
```

Add one line before the closing `};`:
```js
        function substituteCta(text, lead) {
            if (!text) return '';
            const restName = (lead && lead.name) ? lead.name : 'вашем заведении';
            return text
                .replace(/{greeting}/g, 'Добрый день! ')
                .replace(/{rest}/g, restName)
                .replace(/{call}/g, cta.call || 'созвон')
                .replace(/{call_link}/g, cta.callLink || '[ссылка на созвон]')
                .replace(/{brief}/g, cta.brief || 'бриф')
                .replace(/{brief_link}/g, cta.briefLink || '[ссылка на бриф]')
                .replace(/{meeting}/g, cta.meeting || 'встреча')
                .replace(/{tg_bot_link}/g, tgSettings.botUsername ? 'https://t.me/' + tgSettings.botUsername : '[ссылка на бота]');
        }
```

- [ ] **Step 2: Add `{tg_bot_link}` to the placeholder hint**

Find at line ~1803:
```html
<code>{greeting}</code> <code>{rest}</code> <code>{call}</code> <code>{call_link}</code> <code>{brief}</code> <code>{brief_link}</code> <code>{meeting}</code>
```

Replace with:
```html
<code>{greeting}</code> <code>{rest}</code> <code>{call}</code> <code>{call_link}</code> <code>{brief}</code> <code>{brief_link}</code> <code>{meeting}</code> <code>{tg_bot_link}</code>
```

- [ ] **Step 3: Verify in browser**

1. In Settings → Telegram Bot, set username to `adervis_bot`, save.
2. Open the script drawer for any lead.
3. In a script template that uses `{tg_bot_link}`, confirm it renders as `https://t.me/adervis_bot`.
4. Open Settings → ℹ️ Справка: confirm `{tg_bot_link}` appears in the placeholder list.

To test: temporarily edit one of the Stage 0 templates to include `{tg_bot_link}` and verify substitution.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(scripts): add {tg_bot_link} placeholder via tgSettings.botUsername"
```

---

## Task 7: Deploy and smoke test

- [ ] **Step 1: Open the live app**

Navigate to the deployed Netlify URL (or localhost if running locally).

- [ ] **Step 2: TG Takeover smoke test**

1. Open a TG lead — confirm "✋ Подключиться" button in header
2. Click it → "🤖 AI вкл" appears, toast fires
3. Send a real Telegram message to the bot from the test account
4. Confirm: message appears in OTR (realtime) — NO reply sent by bot
5. Click "🤖 AI вкл" → switches back, toast fires
6. Send another Telegram message → bot should respond with AI reply as before

- [ ] **Step 3: `{tg_bot_link}` smoke test**

1. Settings → TG Bot → enter your bot's username → Save
2. Open any script drawer → find a template you've edited to use `{tg_bot_link}`
3. Click copy — paste somewhere and confirm link is `https://t.me/yourbot`

- [ ] **Step 4: Final commit if any polish needed, then push**

```bash
git push origin main
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| Fix `rowToLead`/`leadToRow` for `tg_state` | Task 2 |
| `tg-webhook` early exit for `mode === 'human'` | Task 3 |
| "✋ Подключиться" / "🤖 AI вкл" toggle in chat header | Task 4 |
| `switchTgMode()` function | Task 4 |
| SQL migration for `tg_bot_username` | Task 1 |
| `tgSettings.botUsername` global | Task 5 |
| `loadTgSettings` reads `tg_bot_username` | Task 5 |
| `saveTgSettings` writes `tg_bot_username`, strips `@` | Task 5 |
| Settings UI input for username | Task 5 |
| `substituteCta` handles `{tg_bot_link}` | Task 6 |
| Placeholder hint updated | Task 6 |

All spec requirements covered. No TBDs. No placeholders.
