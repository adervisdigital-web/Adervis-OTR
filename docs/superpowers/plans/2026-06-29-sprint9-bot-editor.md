# Sprint 9 — Bot Editor + Brief Card + Manager Notification

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make PORTFOLIO_TEXT, BRIEF_Q, and AI_PROMPT editable from OTR Settings; show system messages as pills and completed briefs as summary cards in chat history; manager already gets TG notification (п.4 is done).

**Architecture:** Three-layer change — (1) SQL migration adds 3 columns to workspace_settings, (2) index.html Settings UI + loadTgSettings/saveTgSettings read/write them, (3) tg-webhook reads from DB via WsConfig struct instead of hardcoded constants. Message tagging happens in tg-webhook; rendering in index.html renderMessagesFeed.

**Tech Stack:** Single-file HTML app (index.html), Deno/TypeScript (supabase/functions/tg-webhook/index.ts), Supabase PostgreSQL. Deploy via Supabase CLI.

---

## Files

| File | Change |
|------|--------|
| `supabase/functions/tg-webhook/index.ts` | WsConfig interface; extend SELECT; pass config through call chain; message tagging; brief_complete msg |
| `index.html` line ~2042 | New settings-subsection: portfolio text + 6 brief Q inputs + AI prompt textarea |
| `index.html` line ~2138 | Extend tgSettings object: portfolioText, briefQuestions, aiPrompt |
| `index.html` line ~5741 | loadTgSettings: extend SELECT + populate new fields |
| `index.html` line ~5784 | saveTgSettings: add 3 fields to UPSERT |
| `index.html` line ~6325 | renderMessagesFeed: skip attempt tracking for system/brief_complete |
| `index.html` line ~6359 | getMsgType: handle 'system' and 'brief_complete' |
| `index.html` line ~6392 | renderSingleMessage: call renderSystemMessage / renderBriefCompleteCard |
| `index.html` CSS ~line 298 | Add .msg-system and .brief-complete-card styles |

---

## Task 1: SQL Migration

**Files:**
- Run in: Supabase Dashboard → SQL Editor

- [ ] **Step 1: Run migration SQL**

Open Supabase Dashboard → SQL Editor and run:

```sql
ALTER TABLE workspace_settings
  ADD COLUMN IF NOT EXISTS tg_portfolio_text  TEXT,
  ADD COLUMN IF NOT EXISTS tg_brief_questions JSONB,
  ADD COLUMN IF NOT EXISTS tg_ai_prompt       TEXT;
```

- [ ] **Step 2: Verify**

In Table Editor → workspace_settings, confirm the 3 new columns exist. They will be NULL for all rows — that's correct, the webhook falls back to hardcoded defaults when NULL.

- [ ] **Step 3: Commit note**

```bash
git commit --allow-empty -m "feat(db): tg_portfolio_text + tg_brief_questions + tg_ai_prompt on workspace_settings"
```

---

## Task 2: tgSettings Object + Settings UI HTML

**Files:**
- Modify: `index.html:2138` (tgSettings init)
- Modify: `index.html:2042` (Settings HTML — insert after A/B section)

- [ ] **Step 1: Extend tgSettings initializer (line ~2138)**

Find this line:
```js
let tgSettings = { botToken: '', botUsername: '', quickReplies: [...DEFAULT_QUICK_REPLIES], welcomeText: '', briefConfig: [], reminderEnabled: false, reminderText: '', managerChatId: '', abEnabled: false, welcomeTextB: '' };
```

Replace with:
```js
let tgSettings = { botToken: '', botUsername: '', quickReplies: [...DEFAULT_QUICK_REPLIES], welcomeText: '', briefConfig: [], reminderEnabled: false, reminderText: '', managerChatId: '', abEnabled: false, welcomeTextB: '', portfolioText: '', briefQuestions: ['','','','','',''], aiPrompt: '' };
```

- [ ] **Step 2: Add Settings UI — insert after line 2048 (after the quickRepliesEditor div, before the Save button row)**

Find this block (ends at line 2048):
```html
                    <div class="settings-subsection">
                        <label style="font-size:12px;color:var(--muted);display:block;margin-bottom:4px;">Быстрые ответы в TG-чате</label>
                        <div id="quickRepliesEditor" style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px;"></div>
                        <button class="btn btn-outline" type="button" onclick="addQuickReply()" style="font-size:12px;padding:4px 10px;width:100%;" aria-label="Добавить быстрый ответ">+ Добавить ответ</button>
                    </div>
```

Insert AFTER it (before the Save button row `<div style="display:flex;gap:8px;margin-top:8px;">`):

```html
                    <div class="settings-subsection">
                        <details>
                            <summary style="font-size:12px;color:var(--muted);cursor:pointer;padding:4px 0;user-select:none;">🤖 Тексты бота (Портфолио · Вопросы брифа · AI-промпт)</summary>
                            <div style="margin-top:10px;display:flex;flex-direction:column;gap:10px;">
                                <div>
                                    <label for="tgPortfolioTextInput" style="font-size:12px;color:var(--muted);display:block;margin-bottom:4px;">Текст "📹 Примеры работ"</label>
                                    <textarea id="tgPortfolioTextInput" rows="4" style="width:100%;font-size:12px;resize:vertical;" placeholder="Наши работы и примеры 👇&#10;&#10;🌐 Сайт: adervis.ru&#10;📱 Telegram-канал: t.me/Adervis_digital&#10;&#10;Понравилось? Оставьте заявку — обсудим ваш проект:" aria-label="Текст при нажатии Примеры работ"></textarea>
                                    <div style="font-size:11px;color:var(--muted);margin-top:2px;">Оставь пустым — используется текст по умолчанию</div>
                                </div>
                                <div>
                                    <div style="font-size:12px;color:var(--muted);margin-bottom:6px;">Вопросы брифа (6 шагов)</div>
                                    <div style="display:flex;flex-direction:column;gap:4px;">
                                        <input id="tgBriefQ0" type="text" style="width:100%;font-size:12px;" placeholder="Вопрос 1 — Расскажите про ваш бизнес..." aria-label="Вопрос брифа 1: бизнес">
                                        <input id="tgBriefQ1" type="text" style="width:100%;font-size:12px;" placeholder="Вопрос 2 — Какой формат видео интересует?" aria-label="Вопрос брифа 2: формат">
                                        <input id="tgBriefQ2" type="text" style="width:100%;font-size:12px;" placeholder="Вопрос 3 — В каком городе находитесь?" aria-label="Вопрос брифа 3: город">
                                        <input id="tgBriefQ3" type="text" style="width:100%;font-size:12px;" placeholder="Вопрос 4 — Ориентировочный бюджет?" aria-label="Вопрос брифа 4: бюджет">
                                        <input id="tgBriefQ4" type="text" style="width:100%;font-size:12px;" placeholder="Вопрос 5 — Как вас зовут?" aria-label="Вопрос брифа 5: имя">
                                        <input id="tgBriefQ5" type="text" style="width:100%;font-size:12px;" placeholder="Вопрос 6 — Телефон или @username для связи?" aria-label="Вопрос брифа 6: контакт">
                                    </div>
                                    <div style="font-size:11px;color:var(--muted);margin-top:2px;">Оставь пустыми — будут вопросы по умолчанию. Позиция определяет тип: вопросы 2 и 4 — с кнопками выбора.</div>
                                </div>
                                <div>
                                    <label for="tgAiPromptInput" style="font-size:12px;color:var(--muted);display:block;margin-bottom:4px;">Системный промпт AI-консультанта</label>
                                    <textarea id="tgAiPromptInput" rows="8" style="width:100%;font-size:12px;resize:vertical;font-family:monospace;" placeholder="Ты — профессиональный менеджер по продажам видеостудии ADERVIS..." aria-label="Системный промпт AI консультанта"></textarea>
                                    <div style="font-size:11px;color:var(--muted);margin-top:2px;">Оставь пустым — используется промпт по умолчанию</div>
                                </div>
                            </div>
                        </details>
                    </div>
```

- [ ] **Step 3: Verify HTML renders correctly**

Open index.html in browser → Настройки → TG Bot → scroll down. You should see a collapsible "🤖 Тексты бота" section before the Save button. Expand it and confirm 3 sub-sections appear.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(settings): TG bot text editor — portfolio, brief questions, AI prompt"
```

---

## Task 3: loadTgSettings + saveTgSettings

**Files:**
- Modify: `index.html:5737-5818`

- [ ] **Step 1: Extend loadTgSettings SELECT (line ~5741)**

Find:
```js
.select('tg_bot_token, tg_bot_username, tg_quick_replies, tg_welcome_text, tg_brief_config, tg_reminder_enabled, tg_reminder_text, tg_manager_chat_id, tg_ab_enabled, tg_welcome_text_b')
```

Replace with:
```js
.select('tg_bot_token, tg_bot_username, tg_quick_replies, tg_welcome_text, tg_brief_config, tg_reminder_enabled, tg_reminder_text, tg_manager_chat_id, tg_ab_enabled, tg_welcome_text_b, tg_portfolio_text, tg_brief_questions, tg_ai_prompt')
```

- [ ] **Step 2: Extend tgSettings assignment in loadTgSettings (line ~5745)**

Find the block that ends with:
```js
                welcomeTextB:    data.tg_welcome_text_b || '',
            };
```

Replace with:
```js
                welcomeTextB:    data.tg_welcome_text_b || '',
                portfolioText:   data.tg_portfolio_text  || '',
                briefQuestions:  (Array.isArray(data.tg_brief_questions) && data.tg_brief_questions.length === 6)
                                   ? data.tg_brief_questions
                                   : ['','','','','',''],
                aiPrompt:        data.tg_ai_prompt       || '',
            };
```

- [ ] **Step 3: Populate form fields in loadTgSettings — add after the `wb.value = tgSettings.welcomeTextB` block (around line 5772)**

Find:
```js
            const wb = document.getElementById('tgWelcomeTextBInput');
            if (wb) wb.value = tgSettings.welcomeTextB;
            renderQuickRepliesEditor();
```

Replace with:
```js
            const wb = document.getElementById('tgWelcomeTextBInput');
            if (wb) wb.value = tgSettings.welcomeTextB;
            const pt = document.getElementById('tgPortfolioTextInput');
            if (pt) pt.value = tgSettings.portfolioText;
            for (let i = 0; i < 6; i++) {
                const qi = document.getElementById('tgBriefQ' + i);
                if (qi) qi.value = tgSettings.briefQuestions[i] || '';
            }
            const ap = document.getElementById('tgAiPromptInput');
            if (ap) ap.value = tgSettings.aiPrompt;
            renderQuickRepliesEditor();
```

- [ ] **Step 4: Extend saveTgSettings — read new field values**

In `saveTgSettings` (line ~5784), find after the `welcomeTextB` variable:
```js
            const welcomeTextB    = (document.getElementById('tgWelcomeTextBInput') ? document.getElementById('tgWelcomeTextBInput').value : tgSettings.welcomeTextB || '').trim();
```

Insert after it:
```js
            const portfolioText   = (document.getElementById('tgPortfolioTextInput')  ? document.getElementById('tgPortfolioTextInput').value  : tgSettings.portfolioText  || '').trim();
            const briefQuestions  = [0,1,2,3,4,5].map(function(i) {
                const el = document.getElementById('tgBriefQ' + i);
                return el ? el.value.trim() : (tgSettings.briefQuestions[i] || '');
            });
            const aiPrompt        = (document.getElementById('tgAiPromptInput')       ? document.getElementById('tgAiPromptInput').value       : tgSettings.aiPrompt       || '').trim();
```

- [ ] **Step 5: Add to UPSERT payload in saveTgSettings**

Find the UPSERT object that ends with:
```js
                tg_welcome_text_b:    welcomeTextB || null,
                updated_at:           Date.now()
```

Replace with:
```js
                tg_welcome_text_b:    welcomeTextB || null,
                tg_portfolio_text:    portfolioText || null,
                tg_brief_questions:   briefQuestions.some(function(q) { return q; }) ? briefQuestions : null,
                tg_ai_prompt:         aiPrompt || null,
                updated_at:           Date.now()
```

- [ ] **Step 6: Update in-memory tgSettings after save — add at the end of saveTgSettings, before `showToast`**

Find:
```js
            tgSettings.abEnabled       = abEnabled;
            tgSettings.welcomeTextB    = welcomeTextB;
            showToast('TG Bot сохранён ✓');
```

Replace with:
```js
            tgSettings.abEnabled       = abEnabled;
            tgSettings.welcomeTextB    = welcomeTextB;
            tgSettings.portfolioText   = portfolioText;
            tgSettings.briefQuestions  = briefQuestions;
            tgSettings.aiPrompt        = aiPrompt;
            showToast('TG Bot сохранён ✓');
```

- [ ] **Step 7: Smoke test**

Open browser → Настройки → TG Bot → expand "Тексты бота" → type something in "Текст портфолио" → click 💾 Сохранить. Reload page, check the value persists. Check Supabase Table Editor that `tg_portfolio_text` column has the value.

- [ ] **Step 8: Commit**

```bash
git add index.html
git commit -m "feat(settings): load/save tg_portfolio_text, tg_brief_questions, tg_ai_prompt"
```

---

## Task 4: tg-webhook — WsConfig + Editable Texts (п.3)

**Files:**
- Modify: `supabase/functions/tg-webhook/index.ts`

- [ ] **Step 1: Add WsConfig interface after the TgState interface (around line 97)**

Find:
```ts
interface TgState {
  mode: 'menu' | 'brief' | 'ai' | 'human'
  step?: number
  brief?: {
    business?: string; format?: string
    city?: string;     budget?: string
    name?: string;     contact?: string
  }
  aiRounds?: number
}
```

Insert AFTER it:
```ts
interface WsConfig {
  tok:            string
  welcomeText:    string
  welcomeTextB:   string | null
  abEnabled:      boolean
  portfolioText:  string
  briefQ:         string[]
  aiPrompt:       string
  managerChatId:  number
}
```

- [ ] **Step 2: Extend workspace_settings SELECT in main handler (line ~124)**

Find:
```ts
  const { data: ws } = await sb
    .from('workspace_settings').select('tg_bot_token, tg_welcome_text, tg_welcome_text_b, tg_ab_enabled').eq('workspace_id', wsId).maybeSingle()
```

Replace with:
```ts
  const { data: ws } = await sb
    .from('workspace_settings')
    .select('tg_bot_token, tg_welcome_text, tg_welcome_text_b, tg_ab_enabled, tg_manager_chat_id, tg_portfolio_text, tg_brief_questions, tg_ai_prompt')
    .eq('workspace_id', wsId).maybeSingle()
```

- [ ] **Step 3: Build WsConfig and replace existing variable extractions (lines ~126-129)**

Find:
```ts
  const tok          = ws.tg_bot_token as string
  const welcomeText  = (ws as any).tg_welcome_text  as string | null || WELCOME_TEXT
  const welcomeTextB = (ws as any).tg_welcome_text_b as string | null ?? null
  const abEnabled    = !!(ws as any).tg_ab_enabled
```

Replace with:
```ts
  const rawBriefQ = (ws as any).tg_brief_questions
  const cfg: WsConfig = {
    tok:           ws.tg_bot_token as string,
    welcomeText:   (ws as any).tg_welcome_text  as string | null || WELCOME_TEXT,
    welcomeTextB:  (ws as any).tg_welcome_text_b as string | null ?? null,
    abEnabled:     !!(ws as any).tg_ab_enabled,
    portfolioText: (ws as any).tg_portfolio_text as string | null || PORTFOLIO_TEXT,
    briefQ:        (Array.isArray(rawBriefQ) && rawBriefQ.length === 6) ? rawBriefQ as string[] : BRIEF_Q,
    aiPrompt:      (ws as any).tg_ai_prompt     as string | null || AI_PROMPT,
    managerChatId: Number((ws as any).tg_manager_chat_id || 0),
  }
```

- [ ] **Step 4: Update handleMessage and handleCallback calls in main handler (lines ~135-143)**

Find:
```ts
    if (msg) await handleMessage(msg, sb, tok, wsId, welcomeText, welcomeTextB, abEnabled)
    if (cb)  {
      await handleCallback(cb, sb, tok, wsId)
```

Replace with:
```ts
    if (msg) await handleMessage(msg, sb, cfg, wsId)
    if (cb)  {
      await handleCallback(cb, sb, cfg, wsId)
```

- [ ] **Step 5: Update handleMessage signature and internals**

Find:
```ts
async function handleMessage(msg: LeadRow, sb: SbClient, tok: string, wsId: string, welcomeText: string, welcomeTextB: string | null = null, abEnabled = false) {
```

Replace with:
```ts
async function handleMessage(msg: LeadRow, sb: SbClient, cfg: WsConfig, wsId: string) {
```

Then within `handleMessage`, find the block that uses those old params:
```ts
  let effectiveWelcome = welcomeText
  if (abEnabled && welcomeTextB) {
```

Replace with:
```ts
  let effectiveWelcome = cfg.welcomeText
  if (cfg.abEnabled && cfg.welcomeTextB) {
```

And where `welcomeTextB` is used:
```ts
    if (variant === 'B') effectiveWelcome = welcomeTextB
```
Replace:
```ts
    if (variant === 'B') effectiveWelcome = cfg.welcomeTextB!
```

And within the AI assistant section, find where `AI_PROMPT` is used via `aiResponse`:
```ts
  const aiReply = await aiResponse(text, history, (freshLead?.service_category as string) ?? undefined)
```

`aiResponse` needs access to cfg.aiPrompt — update its signature in Step 7.

Also update the pushNotify/brief section to use `cfg.tok`:
Find all occurrences of standalone `tok` within handleMessage and replace with `cfg.tok`.

- [ ] **Step 6: Update handleCallback signature and body**

Find:
```ts
async function handleCallback(cb: LeadRow, sb: SbClient, tok: string, wsId: string) {
```

Replace:
```ts
async function handleCallback(cb: LeadRow, sb: SbClient, cfg: WsConfig, wsId: string) {
```

Within handleCallback, replace:
- `PORTFOLIO_TEXT` → `cfg.portfolioText`
- `BRIEF_Q[2]` → `cfg.briefQ[2]`
- `BRIEF_Q[4]` → `cfg.briefQ[4]`
- `tok` → `cfg.tok`

Find the startBrief call:
```ts
    await startBrief(sb, lead, tok, chatId)
```
Replace:
```ts
    await startBrief(sb, lead, cfg, chatId)
```

Find processBrief calls:
```ts
  if (state.mode === 'brief' && state.step !== undefined) {
    await processBrief(sb, lead, state, text, tok, chatId, wsId, displayName)
```
Replace (in handleMessage):
```ts
  if (state.mode === 'brief' && state.step !== undefined) {
    await processBrief(sb, lead, state, text, cfg, chatId, wsId, displayName)
```

- [ ] **Step 7: Update startBrief and processBrief signatures**

Find:
```ts
async function startBrief(sb: SbClient, lead: LeadRow, tok: string, chatId: number) {
  await setState(sb, lead.id as string, { mode: 'brief', step: 0, brief: {}, aiRounds: 0 })
  await tgSend(tok, chatId, '📋 Отлично! Заполним короткую анкету — 1 минута.\n\n' + BRIEF_Q[0])
}
```

Replace:
```ts
async function startBrief(sb: SbClient, lead: LeadRow, cfg: WsConfig, chatId: number) {
  await setState(sb, lead.id as string, { mode: 'brief', step: 0, brief: {}, aiRounds: 0 })
  await tgSend(cfg.tok, chatId, '📋 Отлично! Заполним короткую анкету — 1 минута.\n\n' + cfg.briefQ[0])
}
```

Find:
```ts
async function processBrief(
  sb: SbClient, lead: LeadRow, state: TgState, text: string,
  tok: string, chatId: number, wsId: string, displayName: string
) {
```

Replace:
```ts
async function processBrief(
  sb: SbClient, lead: LeadRow, state: TgState, text: string,
  cfg: WsConfig, chatId: number, wsId: string, displayName: string
) {
```

Within processBrief, replace:
- All `tok` → `cfg.tok`
- `BRIEF_Q[1]` → `cfg.briefQ[1]`
- `BRIEF_Q[3]` → `cfg.briefQ[3]`
- `BRIEF_Q[5]` → `cfg.briefQ[5]`

- [ ] **Step 8: Update aiResponse to accept custom aiPrompt**

`aiResponse` is at line 525. Find:
```ts
async function aiResponse(userText: string, history: LeadRow[], category?: string): Promise<string> {
```

Replace:
```ts
async function aiResponse(userText: string, history: LeadRow[], category?: string, customPrompt?: string): Promise<string> {
```

Within aiResponse, find (line ~540):
```ts
  const prompt = [
    AI_PROMPT + categoryContext,
```

Replace:
```ts
  const prompt = [
    (customPrompt || AI_PROMPT) + categoryContext,
```

In handleMessage, find the aiResponse call:
```ts
  const aiReply = await aiResponse(text, history, (freshLead?.service_category as string) ?? undefined)
```

Replace:
```ts
  const aiReply = await aiResponse(text, history, (freshLead?.service_category as string) ?? undefined, cfg.aiPrompt || undefined)
```

- [ ] **Step 9: Update notifyManagerTg to use passed managerChatId**

Find the `notifyManagerTg` function:
```ts
async function notifyManagerTg(
  sb: SbClient, wsId: string, tok: string,
  brief: Record<string, unknown>, displayName: string, category: string
): Promise<void> {
  const { data: ws } = await sb
    .from('workspace_settings')
    .select('tg_manager_chat_id')
    .eq('workspace_id', wsId)
    .maybeSingle()
  const managerId = ws?.tg_manager_chat_id ? Number(ws.tg_manager_chat_id) : 0
  if (!managerId) return
```

Replace the first part (eliminate the secondary DB query):
```ts
async function notifyManagerTg(
  tok: string, managerChatId: number,
  brief: Record<string, unknown>, displayName: string, category: string
): Promise<void> {
  if (!managerChatId) return
  const managerId = managerChatId
```

Then update the call to notifyManagerTg in processBrief case 5 (line ~391):
```ts
      notifyManagerTg(sb, wsId, tok, b, displayName, (lead.service_category as string) ?? '').catch(() => {})
```

Replace:
```ts
      notifyManagerTg(cfg.tok, cfg.managerChatId, b, displayName, (lead.service_category as string) ?? '').catch(() => {})
```

- [ ] **Step 10: Verify TypeScript compiles**

```bash
cd "c:\work\ADERVIS OTR"
npx supabase functions serve tg-webhook --no-verify-jwt 2>&1 | head -30
```

Expected: no TypeScript errors in the output (Deno will show the function URL). Ctrl+C to stop.

- [ ] **Step 11: Commit**

```bash
git add supabase/functions/tg-webhook/index.ts
git commit -m "feat(tg-webhook): WsConfig — portfolio text, brief questions, AI prompt from DB"
```

---

## Task 5: tg-webhook — Message Tagging + brief_complete (п.6)

**Files:**
- Modify: `supabase/functions/tg-webhook/index.ts`

- [ ] **Step 1: Extend addMsg type union**

Find:
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

Replace:
```ts
async function addMsg(
  sb: SbClient, lead: LeadRow, wsId: string,
  text: string, fromClient: boolean,
  type?: 'button' | 'brief_answer' | 'reminder' | 'system' | 'brief_complete',
  extra?: Record<string, unknown>
) {
  const fresh    = await getLead(sb, wsId, Number(lead.tg_chat_id))
  const messages = [...((fresh?.messages ?? lead.messages ?? []) as LeadRow[])]
  const entry: Record<string, unknown> = { id: crypto.randomUUID(), text, date: Date.now(), fromClient }
  if (type)  entry.type = type
  if (extra) Object.assign(entry, extra)
  messages.push(entry)
  await sb.from('leads').update({ messages, updated_at: Date.now() }).eq('id', lead.id as string)
}
```

- [ ] **Step 2: Tag commands as 'system' in handleMessage**

In handleMessage, find each command handler and change the addMsg call. There are 5 commands:

For `/start` or `/menu`:
```ts
  if (text === '/start' || text === '/menu') {
    await tgSend(cfg.tok, chatId, effectiveWelcome, MAIN_KB)
    await setState(sb, lead.id as string, { mode: 'menu', aiRounds: 0, brief: {} })
    await addMsg(sb, lead, wsId, text, true)
    return
  }
```
Change the addMsg line to:
```ts
    await addMsg(sb, lead, wsId, text, true, 'system')
```

For `/portfolio`:
```ts
    await addMsg(sb, lead, wsId, text, true)
```
→ `await addMsg(sb, lead, wsId, text, true, 'system')`

For `/brief`:
```ts
    await addMsg(sb, lead, wsId, text, true)
```
→ `await addMsg(sb, lead, wsId, text, true, 'system')`

For `/manager`:
```ts
    await addMsg(sb, lead, wsId, 'Запрос: /manager', true)
```
→ `await addMsg(sb, lead, wsId, 'Запрос: /manager', true, 'system')`

For `/getchatid`:
```ts
    await tgSend(cfg.tok, chatId, `Ваш Telegram Chat ID: ...`)
    return
```
No addMsg here — skip.

- [ ] **Step 3: Tag text brief answers as 'brief_answer' in handleMessage**

Find the generic addMsg call in handleMessage (the one before the routing checks):
```ts
  // Store incoming
  await addMsg(sb, lead, wsId, text, true)
```

Replace:
```ts
  // Store incoming — tag as brief_answer when inside the brief flow
  const inBrief = state.mode === 'brief' && state.step !== undefined
  await addMsg(sb, lead, wsId, text, true, inBrief ? 'brief_answer' : undefined)
```

- [ ] **Step 4: Add brief_complete message and simplify brief completion in processBrief case 5**

Find in processBrief case 5, the section after `await tgSend(tok, chatId, recap)` and before the final db update:

```ts
      // Notify OTR with full brief
      const briefNote = [
        '🔥 НОВАЯ ЗАЯВКА (бриф заполнен)',
        ...
      ].join('\n')

      await notifyOTR(sb, lead, wsId, briefNote, tok, displayName)

      // Fire-and-forget: AI brief scoring
      scoreBrief(sb, lead.id as string, b, (lead.service_category as string) ?? 'unknown').catch(() => {})

      // Fire-and-forget: notify manager in Telegram
      notifyManagerTg(cfg.tok, cfg.managerChatId, b, displayName, (lead.service_category as string) ?? '').catch(() => {})

      // Update lead status to "В диалоге" + save brief in notes
      const freshLead = await getLead(sb, wsId, Number(lead.tg_chat_id))
      await sb.from('leads').update({
        status:     2,
        notes:      briefNote,
        updated_at: Date.now(),
        messages:   freshLead?.messages ?? lead.messages ?? []
      }).eq('id', lead.id as string)
```

Replace with:
```ts
      // Brief summary card in chat history
      await addMsg(sb, lead, wsId, '📋 Заявка заполнена', false, 'brief_complete', { brief: b })

      // Push notification to OTR
      const briefNote = [
        '🔥 НОВАЯ ЗАЯВКА (бриф заполнен)',
        `Бизнес: ${b.business || '—'}`,
        `Формат: ${b.format   || '—'}`,
        `Город: ${b.city      || '—'}`,
        `Бюджет: ${b.budget   || '—'}`,
        `Имя: ${b.name        || '—'}`,
        `Контакт: ${b.contact || '—'}`,
      ].join('\n')
      pushNotify(sb, wsId, String(lead.name ?? 'Клиент'), '🔥 Новая заявка!').catch(() => {})

      // Fire-and-forget: AI brief scoring
      scoreBrief(sb, lead.id as string, b, (lead.service_category as string) ?? 'unknown').catch(() => {})

      // Fire-and-forget: notify manager in Telegram
      notifyManagerTg(cfg.tok, cfg.managerChatId, b, displayName, (lead.service_category as string) ?? '').catch(() => {})

      // Update lead status and notes (messages already updated by addMsg above)
      await sb.from('leads').update({
        status:     2,
        notes:      briefNote,
        updated_at: Date.now(),
      }).eq('id', lead.id as string)
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx supabase functions serve tg-webhook --no-verify-jwt 2>&1 | head -30
```

Expected: no errors. Ctrl+C to stop.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/tg-webhook/index.ts
git commit -m "feat(tg-webhook): system/brief_answer/brief_complete message types"
```

---

## Task 6: index.html — Chat History Rendering (п.6)

**Files:**
- Modify: `index.html` CSS section (~line 298)
- Modify: `index.html:6325` (renderMessagesFeed)
- Modify: `index.html:6359` (getMsgType)
- Modify: `index.html:6392` (renderSingleMessage)

- [ ] **Step 1: Add CSS styles**

In the `<style>` block, near the existing `.msg-bubble` rules (around line 298), add:

```css
        .msg-system { text-align: center; font-size: 11px; color: var(--muted); padding: 3px 0; margin: 1px 0; }
        .msg-system-pill { background: var(--bg2); border-radius: 10px; padding: 2px 10px; display: inline-block; }
        .brief-complete-card { background: color-mix(in srgb, var(--success) 8%, var(--surface)); border: 1px solid color-mix(in srgb, var(--success) 25%, transparent); border-radius: 10px; padding: 10px 14px; margin: 4px 0; font-size: 13px; line-height: 1.65; }
        .brief-complete-card-title { font-weight: 600; color: var(--success); margin-bottom: 5px; }
        .brief-complete-card-row { display: flex; gap: 6px; }
        .brief-complete-card-row b { min-width: 70px; color: var(--muted); font-weight: 500; }
        .msg-reminder-pill { text-align: center; font-size: 11px; color: var(--muted); padding: 3px 0; margin: 1px 0; font-style: italic; }
```

- [ ] **Step 2: Update getMsgType to handle new types**

Find:
```js
        function getMsgType(m) {
            if (m.type && m.type !== 'text') return m.type;
            if (!m.fromClient) return 'text';
            if (/\[.+\]/.test(m.text)) return 'button';
            if (/^(Формат|Бюджет):/.test(m.text)) return 'brief_answer';
            return 'text';
        }
```

Replace:
```js
        function getMsgType(m) {
            if (m.type === 'system')         return 'system';
            if (m.type === 'brief_complete') return 'brief_complete';
            if (m.type === 'reminder')       return 'reminder';
            if (m.type && m.type !== 'text') return m.type;
            if (!m.fromClient) return 'text';
            if (/\[.+\]/.test(m.text)) return 'button';
            if (/^(Формат|Бюджет):/.test(m.text)) return 'brief_answer';
            if (m.type === 'brief_answer') return 'brief_answer';
            return 'text';
        }
```

- [ ] **Step 3: Add renderSystemMessage and renderBriefCompleteCard functions**

After `renderBriefAnswerMessage` function (around line 6390), insert:

```js
        function renderSystemMessage(m) {
            return '<div class="msg-system" role="note" aria-label="Системное событие: ' + escapeHtml(m.text) + '">' +
                '<span class="msg-system-pill" aria-hidden="true">' + escapeHtml(m.text) + '</span>' +
                '</div>';
        }

        function renderBriefCompleteCard(m) {
            var b = m.brief || {};
            return '<div class="brief-complete-card" role="region" aria-label="Заявка заполнена">' +
                '<div class="brief-complete-card-title">📋 Заявка заполнена</div>' +
                (b.business ? '<div class="brief-complete-card-row"><b>Бизнес</b><span>' + escapeHtml(b.business) + '</span></div>' : '') +
                (b.format   ? '<div class="brief-complete-card-row"><b>Формат</b><span>' + escapeHtml(b.format)   + '</span></div>' : '') +
                (b.city     ? '<div class="brief-complete-card-row"><b>Город</b><span>'  + escapeHtml(b.city)     + '</span></div>' : '') +
                (b.budget   ? '<div class="brief-complete-card-row"><b>Бюджет</b><span>' + escapeHtml(b.budget)   + '</span></div>' : '') +
                (b.name     ? '<div class="brief-complete-card-row"><b>Имя</b><span>'    + escapeHtml(b.name)     + '</span></div>' : '') +
                (b.contact  ? '<div class="brief-complete-card-row"><b>Контакт</b><span>'+ escapeHtml(b.contact)  + '</span></div>' : '') +
                '</div>';
        }

        function renderReminderMessage(m) {
            return '<div class="msg-reminder-pill" aria-label="Напоминание отправлено">🔔 Напоминание отправлено · ' + escapeHtml(formatMsgTime(m.date)) + '</div>';
        }
```

- [ ] **Step 4: Update renderSingleMessage to dispatch new types**

Find:
```js
        function renderSingleMessage(m, leadId, msgIdx) {
            const msgType = getMsgType(m);
            if (msgType === 'button')       return renderButtonMessage(m, leadId);
            if (msgType === 'brief_answer') return renderBriefAnswerMessage(m, leadId);
```

Replace:
```js
        function renderSingleMessage(m, leadId, msgIdx) {
            const msgType = getMsgType(m);
            if (msgType === 'system')         return renderSystemMessage(m);
            if (msgType === 'brief_complete') return renderBriefCompleteCard(m);
            if (msgType === 'reminder')       return renderReminderMessage(m);
            if (msgType === 'button')         return renderButtonMessage(m, leadId);
            if (msgType === 'brief_answer')   return renderBriefAnswerMessage(m, leadId);
```

- [ ] **Step 5: Update renderMessagesFeed to skip attempt tracking for system/brief_complete**

Find in `renderMessagesFeed`:
```js
            messages.forEach(function(m, idx) {
                if (!m.fromClient && prevFromClient) {
                    attemptNum++;
                    html += '<div class="attempt-sep" role="separator" aria-label="Касание ' + attemptNum + '">Касание ' + attemptNum + '</div>';
                }
                prevFromClient = m.fromClient;
                const label = formatDateSep(m.date);
                if (label !== lastDateLabel) {
                    html += '<div class="date-sep" aria-hidden="true">' + escapeHtml(label) + '</div>';
                    lastDateLabel = label;
                }
                html += renderSingleMessage(m, leadId, idx);
            });
```

Replace:
```js
            messages.forEach(function(m, idx) {
                const mType = getMsgType(m);
                const isNeutral = mType === 'system' || mType === 'brief_complete' || mType === 'reminder';
                if (!isNeutral) {
                    if (!m.fromClient && prevFromClient) {
                        attemptNum++;
                        html += '<div class="attempt-sep" role="separator" aria-label="Касание ' + attemptNum + '">Касание ' + attemptNum + '</div>';
                    }
                    prevFromClient = m.fromClient;
                }
                const label = formatDateSep(m.date);
                if (label !== lastDateLabel) {
                    html += '<div class="date-sep" aria-hidden="true">' + escapeHtml(label) + '</div>';
                    lastDateLabel = label;
                }
                html += renderSingleMessage(m, leadId, idx);
            });
```

- [ ] **Step 6: Verify in browser**

Manually test with a lead that has existing messages. Open a TG lead in the chat panel. Confirm:
- Regular messages still appear as bubbles
- Any message with type='system' (from new webhook deploys) appears as a grey pill
- Any message with type='brief_complete' appears as a green card
- Attempt/Касание dividers are not affected by system messages

To preview brief_complete card without deploying webhook, temporarily add a test message to a lead's `messages` array in Supabase Table Editor:
```json
{"id":"test-1","text":"📋 Заявка заполнена","date":1719615600000,"fromClient":false,"type":"brief_complete","brief":{"business":"Кафе Ромашка","format":"Reels / Shorts","city":"Москва","budget":"30–100 000 ₽","name":"Илья","contact":"@ilyacafe"}}
```

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "feat(chat): system message pills, brief_complete card, reminder pill"
```

---

## Task 7: Deploy + End-to-End Smoke Test

- [ ] **Step 1: Deploy tg-webhook**

```bash
cd "c:\work\ADERVIS OTR"
npx supabase functions deploy tg-webhook
```

Expected output: `Deployed Functions tg-webhook`

- [ ] **Step 2: Smoke test — editable texts**

1. In OTR Настройки → TG Bot → expand "Тексты бота"
2. Enter "Тест Портфолио" in portfolio text field
3. Click 💾 Сохранить
4. In Telegram, send `/portfolio` to the bot
5. Verify the bot replies with "Тест Портфолио" (not the default)
6. Clear the field → save → confirm bot reverts to default text

- [ ] **Step 3: Smoke test — brief questions**

1. Fill in "Вопрос 1" field: "Что продаёте и что хотите снять?"
2. Save
3. In Telegram, send `/brief`
4. Bot should ask "Что продаёте и что хотите снять?" (not the default "Расскажите про ваш бизнес")

- [ ] **Step 4: Smoke test — system message pill**

After `/start` in Telegram, open that lead's chat in OTR. The `/start` message should appear as a grey pill `· /start ·`, not a client bubble.

- [ ] **Step 5: Smoke test — brief card**

Complete all 6 brief steps in Telegram. In OTR, the chat history should show:
- Brief answers appear as individual field cards (Формат/Бюджет already did, business/city/name/contact now also as cards)
- At the end: a green `📋 Заявка заполнена` card with all fields

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "deploy: sprint 9 — bot text editor, brief card, system message pills"
```
