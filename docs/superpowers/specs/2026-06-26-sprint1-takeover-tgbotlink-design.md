# Sprint 1 Design: Manager Takeover + {tg_bot_link}

Date: 2026-06-26  
Status: Approved

---

## П.7 — Manager Takeover ("✋ Подключиться")

### Goal
Manager can take over a Telegram lead's conversation, silencing the AI bot. Toggle back to re-enable AI.

### Data Model
`tg_state` JSONB column already exists on `leads` (migration `20260626200000_tg_bot_features.sql`).  
New mode value: `'human'` (existing: `'menu'`, `'brief'`, `'ai'`).

Current `rowToLead()` and `leadToRow()` do NOT map `tg_state` — this is a bug that must be fixed first.

### Changes

**1. `rowToLead()` / `leadToRow()` in index.html**
- `rowToLead`: add `tgState: row.tg_state ?? null`
- `leadToRow`: add `tg_state: lead.tgState ?? null`

**2. `tg-webhook/index.ts`**
In `handleMessage()`, after loading state and handling commands, add early-exit before the AI block:
```ts
if (state.mode === 'human') {
  pushNotify(sb, wsId, displayName, text).catch(() => {})
  return
}
```
Message is already stored by `addMsg()` before this check — no data lost.

**3. `renderChatHeader()` in index.html**
Add toggle button only if `lead.tgChatId` is set:
- OFF (AI active): `<button onclick="switchTgMode(leadId)">✋ Подключиться</button>` — outline style
- ON (human mode): `<button onclick="switchTgMode(leadId)">🤖 AI вкл</button>` — accent/green style

**4. `switchTgMode(leadId)` new function**
```js
async function switchTgMode(leadId) {
  const lead = leads.find(l => String(l.id) === String(leadId));
  if (!lead || !lead.tgChatId) return;
  const state = lead.tgState ?? { mode: 'menu', aiRounds: 0, brief: {} };
  const isHuman = state.mode === 'human';
  const newState = isHuman
    ? { ...state, mode: 'menu', aiRounds: 0 }
    : { ...state, mode: 'human' };
  await _sb.from('leads').update({ tg_state: newState, updated_at: Date.now() }).eq('id', lead.id);
  lead.tgState = newState;
  showToast(isHuman ? '🤖 AI подключён' : '✋ AI отключён — вы ведёте диалог');
  // re-render chat header
  if (currentChatLeadId === String(leadId)) renderChatHeader(lead);
}
```

### Error handling
- If Supabase update fails: show error toast, do NOT update local state
- If lead has no `tgChatId`: button not rendered (no guard needed in function)

---

## П.2 — Плейсхолдер `{tg_bot_link}`

### Goal
Add `{tg_bot_link}` placeholder to script templates, substituted with the bot's Telegram link.

### Approach
Store `tg_bot_username` in `workspace_settings` alongside existing `tg_bot_token`.  
Link is computed as `https://t.me/{username}` (no new table/column on cta_config needed).

### Changes

**1. SQL migration** — `20260626_add_tg_bot_username.sql`
```sql
ALTER TABLE workspace_settings ADD COLUMN IF NOT EXISTS tg_bot_username TEXT DEFAULT '';
```

**2. `tgSettings` object in index.html**
Add `botUsername: ''` to the global `tgSettings` object.

**3. `loadTgSettings()`**
Add `tg_bot_username` to the SELECT, set `tgSettings.botUsername = data.tg_bot_username || ''`.

**4. `saveTgSettings()`**
Add `tg_bot_username: tgSettings.botUsername` to the upsert payload.
Read from new `#tgBotUsernameInput` field.

**5. Settings UI (TG section)**
Add input after the token field:
```html
<label>Username бота (без @)</label>
<input id="tgBotUsernameInput" placeholder="adervis_bot" ...>
```

**6. `substituteCta(text, lead)`**
Add one `.replace()` line:
```js
.replace(/{tg_bot_link}/g, tgSettings.botUsername
  ? 'https://t.me/' + tgSettings.botUsername
  : '[ссылка на бота]')
```

**7. Placeholder hint in UI**
Add `{tg_bot_link}` to the existing hint text (line ~1803 in index.html).

### Error handling
- Empty username: substitution produces `[ссылка на бота]` (consistent with other unfilled CTAs)
- Invalid username: user's responsibility — no validation needed

---

## Implementation Order

1. SQL migration for `tg_bot_username`
2. Fix `rowToLead` / `leadToRow` for `tg_state`
3. Update `tg-webhook` with human-mode early exit + redeploy
4. Add `switchTgMode()` + update `renderChatHeader()`
5. Add `tg_bot_link` to `tgSettings`, `loadTgSettings`, `saveTgSettings`, Settings UI
6. Add `{tg_bot_link}` to `substituteCta()` + hint text
7. Deploy + smoke test
