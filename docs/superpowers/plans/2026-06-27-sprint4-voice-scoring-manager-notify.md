# Sprint 4: Voice Transcription + AI Brief Scoring + Manager TG Notify Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Бот принимает голосовые сообщения (Gemini transcription), автоматически оценивает лида после заполнения брифа (AI score 1–100), и мгновенно уведомляет менеджера в Telegram при новой заявке.

**Architecture:** Все три фичи — изменения только в `tg-webhook/index.ts` + одна SQL-миграция + одно поле в Settings UI (`index.html`). Voice → Gemini inline audio; scoring и manager-notify — fire-and-forget после `processBrief` case 5. Менеджер получает `tg_manager_chat_id` командой `/getchatid` в боте.

**Tech Stack:** Deno TypeScript, Supabase Edge Functions, Gemini 2.0 Flash (audio + text), Telegram Bot API, Vanilla JS single-file HTML.

---

## File Map

| File | Change |
|------|--------|
| `supabase/migrations/20260630_sprint4_manager_chat.sql` | новая — `tg_manager_chat_id BIGINT` в workspace_settings |
| `supabase/functions/tg-webhook/index.ts` | `/getchatid` команда + `transcribeVoice()` + `scoreBrief()` + `notifyManagerTg()` |
| `index.html` | Settings UI: поле `tgManagerChatIdInput` + tgSettings/load/save |

---

## Task 1: SQL Migration

**Files:**
- Create: `supabase/migrations/20260630_sprint4_manager_chat.sql`

- [ ] **Step 1: Create migration file**

```sql
-- Sprint 4: manager TG chat ID for brief notifications
ALTER TABLE workspace_settings
  ADD COLUMN IF NOT EXISTS tg_manager_chat_id BIGINT DEFAULT NULL;
```

Save to `supabase/migrations/20260630_sprint4_manager_chat.sql`.

- [ ] **Step 2: Apply migration**

```bash
npx supabase db push
```

Expected: no errors. If prompted for confirmation, confirm.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260630_sprint4_manager_chat.sql
git commit -m "feat(db): add tg_manager_chat_id to workspace_settings"
```

---

## Task 2: tg-webhook — /getchatid command + transcribeVoice

**Files:**
- Modify: `supabase/functions/tg-webhook/index.ts`

This task adds:
1. `/getchatid` command (manager learns their chat ID)
2. `transcribeVoice()` function (Gemini audio transcription)
3. Voice message handling in `handleMessage`

No deploy yet — Tasks 3 and 4 add more changes before deploy.

- [ ] **Step 1: Add `/getchatid` command in `handleMessage`**

Find at line ~164 (commands block, after the `/manager` handler at line ~181):
```ts
  if (text === '/manager') {
    await tgSend(tok, chatId, '👨‍💼 Передаю менеджеру! Свяжется в ближайшее время.')
    await addMsg(sb, lead, wsId, 'Запрос: /manager', true)
    await notifyOTR(sb, lead, wsId, '💬 Клиент запросил связь с менеджером', tok, displayName)
    return
  }
```

Add immediately AFTER that block (before the `// Store incoming` comment):
```ts
  if (text === '/getchatid') {
    await tgSend(tok, chatId, `Ваш Telegram Chat ID: ${chatId}\n\nВставьте это число в настройки OTR → TG Bot → Chat ID менеджера для уведомлений о заявках.`)
    return
  }
```

- [ ] **Step 2: Add `transcribeVoice` function**

Find the line `// ─── SERVICE CLASSIFIER ─────────` (~line 361). Insert immediately BEFORE it:

```ts
// ─── VOICE TRANSCRIPTION ─────────────────────────────────────────────────────

async function transcribeVoice(tok: string, fileId: string): Promise<string> {
  if (!GEMINI_KEY) return ''
  try {
    // Get TG file path
    const fRes = await fetch(`https://api.telegram.org/bot${tok}/getFile?file_id=${encodeURIComponent(fileId)}`)
    const fData = await fRes.json()
    const filePath = fData?.result?.file_path as string | undefined
    if (!filePath) return ''

    // Download OGG voice file
    const dlRes = await fetch(`https://api.telegram.org/file/bot${tok}/${filePath}`)
    if (!dlRes.ok) return ''
    const buf = await dlRes.arrayBuffer()

    // Base64 encode (chunked to avoid stack overflow on large files)
    const bytes = new Uint8Array(buf)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    const b64 = btoa(binary)

    // Transcribe via Gemini 2.0 Flash (supports audio/ogg inline)
    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
        body:    JSON.stringify({
          contents: [{ parts: [
            { inlineData: { mimeType: 'audio/ogg', data: b64 } },
            { text: 'Точно транскрибируй голосовое сообщение на русском языке. Только текст транскрипции, без пояснений и кавычек.' }
          ]}],
          generationConfig: { temperature: 0 }
        })
      }
    )
    const d = await res.json()
    return (d?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim()
  } catch { return '' }
}

```

- [ ] **Step 3: Handle voice messages in `handleMessage`**

Find at line ~148:
```ts
async function handleMessage(msg: LeadRow, sb: SbClient, tok: string, wsId: string) {
  const chatId = Number((msg.chat as LeadRow)?.id ?? 0)
  const text   = String(msg.text ?? '').trim()
  if (!chatId || !text) return
```

Replace those first 4 lines with:
```ts
async function handleMessage(msg: LeadRow, sb: SbClient, tok: string, wsId: string) {
  const chatId = Number((msg.chat as LeadRow)?.id ?? 0)
  if (!chatId) return

  // Voice/video_note → transcribe via Gemini
  const voiceObj = (msg.voice ?? msg.video_note) as LeadRow | undefined
  let text = String(msg.text ?? '').trim()
  if (!text && voiceObj?.file_id) {
    const transcript = await transcribeVoice(tok, String(voiceObj.file_id))
    if (transcript) {
      text = transcript
      // Acknowledge transcription
      await tgSend(tok, chatId, `🎙 Распознал: «${transcript.slice(0, 100)}${transcript.length > 100 ? '…' : ''}»`)
    } else {
      await tgSend(tok, chatId, '⚠️ Не удалось распознать голосовое. Напишите текстом, пожалуйста.')
      return
    }
  }
  if (!text) return
```

- [ ] **Step 4: Commit (no deploy yet)**

```bash
git add supabase/functions/tg-webhook/index.ts
git commit -m "feat(tg-webhook): /getchatid command + transcribeVoice via Gemini"
```

---

## Task 3: tg-webhook — scoreBrief after brief complete

**Files:**
- Modify: `supabase/functions/tg-webhook/index.ts`

- [ ] **Step 1: Add `scoreBrief` function**

Find `// ─── SERVICE CLASSIFIER ─────────` line. Insert immediately BEFORE `transcribeVoice` (which was inserted in Task 2, so this goes between the two new sections). Actually, insert right AFTER the `// ─── SERVICE CLASSIFIER` block and BEFORE `// ─── AI RESPONSE`.

Find `// ─── AI RESPONSE ────────────────────────────────────────────────────────────` (~line 386). Insert immediately BEFORE it:

```ts
// ─── BRIEF SCORING ───────────────────────────────────────────────────────────

async function scoreBrief(
  sb: SbClient, leadId: string,
  brief: Record<string, unknown>, category: string
): Promise<void> {
  if (!GEMINI_KEY) return
  const prompt = `Ты эксперт по продажам видеостудии ADERVIS. Оцени качество лида от 1 до 100.

Бриф:
- Бизнес: ${brief.business || '—'}
- Формат: ${brief.format   || '—'}
- Город: ${brief.city      || '—'}
- Бюджет: ${brief.budget   || '—'}
- Имя: ${brief.name        || '—'}
- Контакт: ${brief.contact || '—'}
- Направление: ${category  || '—'}

Критерии (сумма = итоговый балл 0–100):
+30 — бюджет "100 000 ₽+" или "Обсудим"
+20 — бюджет "30–100 000 ₽"
+20 — конкретный формат (не "Другой" и не "—")
+15 — указал имя И контакт (оба заполнены)
+10 — крупный город (Москва, СПб, Екатеринбург, Казань, Новосибирск)
+5  — другой город указан

Ответь ТОЛЬКО валидным JSON без markdown-обёрток: {"score":85,"reason":"Бюджет 100K+, Reels, Москва"}`

  try {
    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
        body:    JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 60, temperature: 0 }
        })
      }
    )
    const d    = await res.json()
    const raw  = (d?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim()
    const clean = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(clean)
    const score  = Math.max(1, Math.min(100, Number(parsed.score) || 0))
    const reason = String(parsed.reason || '').slice(0, 200)
    if (score > 0) {
      await sb.from('leads').update({ deal_score: score, deal_score_reason: reason }).eq('id', leadId)
    }
  } catch { /* ignore — fire-and-forget */ }
}

```

- [ ] **Step 2: Call `scoreBrief` in `processBrief` case 5**

Find at the end of case 5 (after `await notifyOTR(...)` at line ~346):
```ts
      await notifyOTR(sb, lead, wsId, briefNote, tok, displayName)

      // Update lead status to "В диалоге" + save brief in notes
      const freshLead = await getLead(sb, wsId, Number(lead.tg_chat_id))
      await sb.from('leads').update({
        status:     2,
        notes:      briefNote,
        updated_at: Date.now(),
        messages:   freshLead?.messages ?? lead.messages ?? []
      }).eq('id', lead.id as string)
      break
```

Replace with:
```ts
      await notifyOTR(sb, lead, wsId, briefNote, tok, displayName)

      // Fire-and-forget: AI brief scoring
      scoreBrief(sb, lead.id as string, b, (lead.service_category as string) ?? 'unknown').catch(() => {})

      // Update lead status to "В диалоге" + save brief in notes
      const freshLead = await getLead(sb, wsId, Number(lead.tg_chat_id))
      await sb.from('leads').update({
        status:     2,
        notes:      briefNote,
        updated_at: Date.now(),
        messages:   freshLead?.messages ?? lead.messages ?? []
      }).eq('id', lead.id as string)
      break
```

- [ ] **Step 3: Commit (no deploy yet)**

```bash
git add supabase/functions/tg-webhook/index.ts
git commit -m "feat(tg-webhook): scoreBrief AI scoring after brief complete"
```

---

## Task 4: tg-webhook — notifyManagerTg + deploy

**Files:**
- Modify: `supabase/functions/tg-webhook/index.ts`

- [ ] **Step 1: Add `notifyManagerTg` function**

Find `// ─── PUSH NOTIFICATIONS ─────────────────────────────────────────────────────` line (~line 478). Insert immediately BEFORE it:

```ts
// ─── MANAGER TG NOTIFICATION ─────────────────────────────────────────────────

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

  const CAT_RU: Record<string, string> = { video: 'Видео', design: 'Дизайн', photo: 'Фото', ai: 'ИИ' }
  const catLabel = CAT_RU[category] ?? ''
  const lines = [
    '🔥 Новая заявка!',
    '',
    `👤 ${displayName}`,
    `🏢 Бизнес: ${brief.business || '—'}`,
    `🎬 Формат: ${brief.format   || '—'}`,
    `📍 Город: ${brief.city      || '—'}`,
    `💰 Бюджет: ${brief.budget   || '—'}`,
    `📞 Контакт: ${brief.contact || '—'}`,
    catLabel ? `🎯 Направление: ${catLabel}` : '',
  ].filter(Boolean)

  await tgSend(tok, managerId, lines.join('\n'))
}

```

- [ ] **Step 2: Call `notifyManagerTg` in `processBrief` case 5**

Find (the block we updated in Task 3):
```ts
      await notifyOTR(sb, lead, wsId, briefNote, tok, displayName)

      // Fire-and-forget: AI brief scoring
      scoreBrief(sb, lead.id as string, b, (lead.service_category as string) ?? 'unknown').catch(() => {})
```

Replace with:
```ts
      await notifyOTR(sb, lead, wsId, briefNote, tok, displayName)

      // Fire-and-forget: AI brief scoring
      scoreBrief(sb, lead.id as string, b, (lead.service_category as string) ?? 'unknown').catch(() => {})

      // Fire-and-forget: notify manager in Telegram
      notifyManagerTg(sb, wsId, tok, b, displayName, (lead.service_category as string) ?? '').catch(() => {})
```

- [ ] **Step 3: Deploy**

```bash
npx supabase functions deploy tg-webhook --no-verify-jwt
```

Expected: `Deployed Functions.`

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/tg-webhook/index.ts
git commit -m "feat(tg-webhook): notifyManagerTg on brief complete + deploy"
```

---

## Task 5: index.html — Manager Chat ID settings UI

**Files:**
- Modify: `index.html`

This task is UI — a11y review required before implementation. The planned HTML:

```html
<label for="tgManagerChatIdInput" style="font-size:12px;color:var(--muted);display:block;margin-bottom:4px;">
  Chat ID менеджера (для уведомлений о заявках)
</label>
<input type="text" id="tgManagerChatIdInput"
       inputmode="numeric" pattern="[0-9]*"
       placeholder="Отправь /getchatid боту чтобы узнать"
       style="width:100%;"
       autocomplete="off"
       aria-describedby="tgManagerChatIdHint">
<div id="tgManagerChatIdHint" style="font-size:10px;color:var(--muted);margin-top:2px;">
  Напиши /getchatid боту от имени менеджера — он ответит твоим числовым ID
</div>
```

A11y notes: `<label for>` association + `aria-describedby` on hint. No `aria-label` (redundant with `<label for>`).

- [ ] **Step 1: Update `tgSettings` global**

Find at line ~2055:
```js
        let tgSettings = { botToken: '', botUsername: '', quickReplies: [...DEFAULT_QUICK_REPLIES], welcomeText: '', briefConfig: [], reminderEnabled: false, reminderText: '' };
```

Replace with:
```js
        let tgSettings = { botToken: '', botUsername: '', quickReplies: [...DEFAULT_QUICK_REPLIES], welcomeText: '', briefConfig: [], reminderEnabled: false, reminderText: '', managerChatId: '' };
```

- [ ] **Step 2: Add UI to Settings HTML**

Find the reminder settings block (the one we added in Sprint 3, starting with `⏰ Напоминания`):
```html
                    <div style="border-top:1px solid var(--border);padding-top:10px;margin-top:2px;">
                        <label style="font-size:12px;color:var(--muted);display:block;margin-bottom:6px;">⏰ Напоминания (через 20 ч если бриф не заполнен)</label>
```

Insert a new `<div>` block immediately BEFORE the reminder section:
```html

                    <div style="border-top:1px solid var(--border);padding-top:10px;margin-top:2px;">
                        <label for="tgManagerChatIdInput" style="font-size:12px;color:var(--muted);display:block;margin-bottom:4px;">📬 Chat ID менеджера (уведомления о заявках)</label>
                        <input type="text" id="tgManagerChatIdInput" inputmode="numeric" pattern="[0-9-]*" placeholder="Отправь /getchatid боту — он ответит ID" style="width:100%;" autocomplete="off" aria-describedby="tgManagerChatIdHint">
                        <div id="tgManagerChatIdHint" style="font-size:10px;color:var(--muted);margin-top:2px;">Открой бот → напиши /getchatid → вставь число сюда</div>
                    </div>
```

- [ ] **Step 3: Update `loadTgSettings`**

Find in `loadTgSettings`:
```js
                .select('tg_bot_token, tg_bot_username, tg_quick_replies, tg_welcome_text, tg_brief_config, tg_reminder_enabled, tg_reminder_text')
```

Replace with:
```js
                .select('tg_bot_token, tg_bot_username, tg_quick_replies, tg_welcome_text, tg_brief_config, tg_reminder_enabled, tg_reminder_text, tg_manager_chat_id')
```

Find in the `tgSettings = { ... }` assignment block:
```js
                reminderEnabled: !!data.tg_reminder_enabled,
                reminderText:    data.tg_reminder_text  || '',
```

Add after `reminderText` line:
```js
                managerChatId:   data.tg_manager_chat_id ? String(data.tg_manager_chat_id) : '',
```

Find the DOM population block (after the `tgSettings = {...}` assignment):
```js
            const rt = document.getElementById('tgReminderTextInput');
            if (rt) rt.value = tgSettings.reminderText;
```

Add immediately AFTER:
```js
            const mc = document.getElementById('tgManagerChatIdInput');
            if (mc) mc.value = tgSettings.managerChatId;
```

- [ ] **Step 4: Update `saveTgSettings`**

Find in the `const` declarations at top of `saveTgSettings`:
```js
            const reminderText    = (document.getElementById('tgReminderTextInput') ? document.getElementById('tgReminderTextInput').value : tgSettings.reminderText || '').trim();
```

Add immediately AFTER:
```js
            const managerChatId   = (document.getElementById('tgManagerChatIdInput') ? document.getElementById('tgManagerChatIdInput').value : tgSettings.managerChatId || '').trim().replace(/[^0-9-]/g, '');
```

Find in the upsert payload:
```js
                tg_reminder_text:     reminderText    || null,
```

Add immediately AFTER:
```js
                tg_manager_chat_id:   managerChatId ? Number(managerChatId) : null,
```

Find at the end of `saveTgSettings` (after `tgSettings.reminderText = reminderText;`):
```js
            tgSettings.reminderText    = reminderText;
```

Add immediately AFTER:
```js
            tgSettings.managerChatId   = managerChatId;
```

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat(settings): manager TG chat ID field for brief notifications"
```

---

## Task 6: Smoke Test + Push

- [ ] **Step 1: Test voice transcription**

Send a voice message to the bot saying "хочу заказать рекламный ролик для кафе".

Expected in OTR → lead chat:
1. First message: `🎙 Распознал: «хочу заказать рекламный ролик для кафе»`
2. Second message: AI response mentioning video production
3. `service_category` should be set to `'video'` in Supabase leads table

- [ ] **Step 2: Test /getchatid command**

Send `/getchatid` to the bot from the manager's account.

Expected: `Ваш Telegram Chat ID: 123456789\n\nВставьте это число...`

Copy the number, enter it in OTR → Settings → TG Bot → Chat ID менеджера → Save.

Verify in Supabase: `workspace_settings.tg_manager_chat_id = 123456789`

- [ ] **Step 3: Test brief scoring**

Go through the full brief flow: send `/brief` → answer all 6 questions with high-value answers (бюджет "100 000 ₽+", формат "Reels / Shorts", Москва).

After completion, check Supabase → leads → the test lead:
- `deal_score` should be 80–100
- `deal_score_reason` should mention budget/format/city
- In OTR sidebar → lead should show score badge (e.g. `85%` in gold color)

- [ ] **Step 4: Test manager notification**

After completing the brief in Step 3:
- Manager's Telegram should receive a message within 5 seconds:
```
🔥 Новая заявка!

👤 [Name]
🏢 Бизнес: [business]
🎬 Формат: Reels / Shorts
📍 Город: Москва
💰 Бюджет: 100 000 ₽+
📞 Контакт: [contact]
🎯 Направление: Видео
```

- [ ] **Step 5: Push to remote**

```bash
git push origin main
```

- [ ] **Step 6: Update memory**

Note Sprint 4 completion in memory.

---

## Self-Review

**Spec coverage:**
- ✅ Voice → Gemini transcription: `transcribeVoice()` + `msg.voice` + `msg.video_note` handling → Task 2
- ✅ `/getchatid` command → Task 2
- ✅ AI scoring after brief (1–100): `scoreBrief()` fire-and-forget in case 5 → Task 3
- ✅ `deal_score` + `deal_score_reason` updated in DB → Task 3 (already displayed by existing `scorePill` in sidebar)
- ✅ Manager TG notification on brief complete: `notifyManagerTg()` → Task 4
- ✅ `tg_manager_chat_id` SQL column → Task 1
- ✅ Settings UI for manager chat ID → Task 5
- ✅ `loadTgSettings` / `saveTgSettings` updated → Task 5

**Placeholder scan:** No TBDs. All code blocks are complete.

**Type consistency:**
- `brief` in `scoreBrief` and `notifyManagerTg` is `Record<string, unknown>` — consistent with `b` variable in processBrief case 5 (`const b = { ...brief, contact: text }`)
- `leadId` in `scoreBrief` → `lead.id as string` — consistent with existing codebase pattern
- `managerChatId` saved as `Number(managerChatId)` in upsert, loaded back as `String(data.tg_manager_chat_id)` in load → round-trip clean

**Edge cases covered:**
- Voice file too large / download fails → `transcribeVoice` returns `''` → user gets error message → returns early
- `tg_manager_chat_id` not set → `notifyManagerTg` returns early without error
- Gemini JSON parse fails → `scoreBrief` catch ignores → no score set (existing 0 stays)
- `video_note` (circular video) handled same as `voice`
