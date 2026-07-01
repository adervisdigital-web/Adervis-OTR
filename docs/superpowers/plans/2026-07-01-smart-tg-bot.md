# Smart TG Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Telegram bot's AI assistant warmer, give it objection-handling few-shots, delay the "leave a request" push from 2 to 3 exchanges, and add a direct "❓ Задать вопрос" entry point to the main menu.

**Architecture:** Single-file Deno edge function change in `supabase/functions/tg-webhook/index.ts`. No DB migrations, no `index.html` changes. Four independent edits: (1) swap the `AI_PROMPT` constant, (2) raise the `aiRounds` threshold that reveals `ACTION_KB`, (3) add a 4th button to `MAIN_KB`, (4) add a `m:ask` branch in `handleCallback()` that resets the lead into free AI dialogue.

**Tech Stack:** Deno (Supabase Edge Functions), TypeScript, Telegram Bot API. No local test runner exists for this function (no `deno.json`, no test files in `supabase/functions/`) — verification is by direct code reading plus a post-deploy manual smoke test against the live bot, consistent with how every prior `tg-webhook` change in this repo (see `git log --oneline -- supabase/functions/tg-webhook/index.ts`) was verified.

---

## File Map

- Modify: `supabase/functions/tg-webhook/index.ts`
  - Lines 63-69 — `MAIN_KB` (add 4th button row)
  - Lines 78-95 — `AI_PROMPT` (full replacement)
  - Line 301 — `showActions` threshold in `handleMessage()`
  - After line 347 / before line 349 — new `m:ask` branch in `handleCallback()`

No other files change. Spec lived at `docs/superpowers/specs/2026-06-30-smart-tg-bot-design.md` — this plan adapts it to the **current** file (the spec was written against a slightly older version of `index.html`'s helper text; line numbers and surrounding logic below reflect what's in the file today).

---

### Task 1: Replace `AI_PROMPT` with the warmer, objection-aware prompt

**Files:**
- Modify: `supabase/functions/tg-webhook/index.ts:78-95`

- [ ] **Step 1: Replace the constant**

Find this block (lines 78-95):

```typescript
const AI_PROMPT = `Ты — профессиональный менеджер по продажам видеостудии ADERVIS.

О компании:
- Создаём видео для бизнеса: рекламные, Reels, VK Клипы, Shorts, корпоративные, событийные
- Цены: индивидуально, зависит от формата и сложности
- Портфолио: adervis.ru, t.me/Adervis_digital
- Работаем по всей России

Задача:
1. Дружелюбно отвечать на вопросы
2. Обрабатывать возражения (нет бюджета, есть SMM, сами снимаем)
3. Вызывать интерес — объяснять ценность профессионального видео
4. После 2 обменов — предлагать оставить заявку

Правила:
- Максимум 3 предложения в ответе
- Заканчивай вопросом или призывом к действию
- Пиши по-русски, дружелюбно, без официоза`
```

Replace it with:

```typescript
const AI_PROMPT = `Ты — Алексей, менеджер видеостудии ADERVIS. Общаешься живо и по-человечески, без официоза и корпоративных штампов. Сначала слушаешь и проявляешь искренний интерес к бизнесу клиента, потом мягко ведёшь к заявке.

О компании ADERVIS:
- Создаём видео для бизнеса: рекламные ролики, Reels, VK Клипы, Shorts, корпоративные, событийные
- Цены: индивидуально, зависит от формата и сложности съёмки
- Портфолио: adervis.ru, t.me/Adervis_digital
- Работаем по всей России, выезжаем в любой город

Правила ответа:
- Максимум 3 предложения
- Заканчивай вопросом или мягким призывом
- Пиши разговорно, как живой человек в мессенджере
- Используй эмодзи умеренно (1-2 на сообщение)

Обработка возражений — отвечай именно так:
- "дорого" / "нет бюджета" → "Понимаю 🙂 Расскажите немного о вашем проекте — подберём формат под бюджет, у нас есть варианты от небольших Reels до полноценных роликов."
- "сами снимаем" / "есть свой оператор" → "Здорово, что уже делаете контент! Многие наши клиенты тоже начинали так. Чем отличается профессиональная съёмка — покажем на примерах, если интересно?"
- "есть SMM-щик" → "Отличная основа для работы! Мы как раз делаем видео, которое SMM потом продвигает. Какой контент сейчас используете — фото или уже видео?"
- "подумаю" / "позже" → "Конечно, не спешите 🙂 Могу скинуть пару примеров наших работ — поможет понять, подходим ли мы вам?"
- "уже работаем с другими" → "Понял! Если вдруг понадобится что-то дополнительное или второй взгляд — обращайтесь. Чем занимаетесь, если не секрет?"

Триггер на заявку (после 3+ обменов):
Когда клиент задал 3 или более вопросов и проявляет интерес — мягко предложи: "Кстати, можем за 1 минуту заполнить небольшую анкету — и я подготовлю точное предложение под ваш запрос. Удобно?"

Никогда не придумывай цены и сроки — только "индивидуально, зависит от проекта".`
```

- [ ] **Step 2: Verify the surrounding code still parses as one statement**

Run: `grep -n "^interface TgState" "supabase/functions/tg-webhook/index.ts"`
Expected: one match, on the line immediately after the closing backtick + blank line of `AI_PROMPT` — confirms the template literal was closed correctly (an unclosed backtick would shift this line number or break syntax highlighting).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/tg-webhook/index.ts
git commit -m "feat(tg-webhook): warmer AI prompt with objection-handling few-shots"
```

---

### Task 2: Raise the action-buttons reveal threshold from 2 to 3 exchanges

**Files:**
- Modify: `supabase/functions/tg-webhook/index.ts:301`

- [ ] **Step 1: Change the threshold**

Find (inside `handleMessage()`, in the "AI assistant" block):

```typescript
    const showActions = rounds >= 2
```

Replace with:

```typescript
    const showActions = rounds >= 3
```

- [ ] **Step 2: Verify no other code depends on the old threshold**

Run: `grep -n "rounds >= 2\|rounds>=2" "supabase/functions/tg-webhook/index.ts"`
Expected: no matches (confirms this was the only place using the threshold).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/tg-webhook/index.ts
git commit -m "feat(tg-webhook): delay action buttons to 3rd AI exchange"
```

---

### Task 3: Add "❓ Задать вопрос" button to `MAIN_KB`

**Files:**
- Modify: `supabase/functions/tg-webhook/index.ts:63-69`

- [ ] **Step 1: Add the new row**

Find:

```typescript
const MAIN_KB = {
  inline_keyboard: [
    [{ text: '📹 Примеры работ',          callback_data: 'm:portfolio' }],
    [{ text: '📋 Оставить заявку',         callback_data: 'm:brief'     }],
    [{ text: '💬 Написать менеджеру',      callback_data: 'm:manager'   }],
  ]
}
```

Replace with:

```typescript
const MAIN_KB = {
  inline_keyboard: [
    [{ text: '📹 Примеры работ',          callback_data: 'm:portfolio' }],
    [{ text: '📋 Оставить заявку',         callback_data: 'm:brief'     }],
    [{ text: '❓ Задать вопрос',           callback_data: 'm:ask'       }],
    [{ text: '💬 Написать менеджеру',      callback_data: 'm:manager'   }],
  ]
}
```

- [ ] **Step 2: Verify the keyboard still has exactly 4 rows**

Run: `grep -n "callback_data: 'm:" "supabase/functions/tg-webhook/index.ts"`
Expected: 4 matches inside `MAIN_KB` (`m:portfolio`, `m:brief`, `m:ask`, `m:manager`) plus any pre-existing matches inside `ACTION_KB`/`handleCallback` further down — `m:ask` itself will only resolve once Task 4 adds its handler, that's expected at this point.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/tg-webhook/index.ts
git commit -m "feat(tg-webhook): add 'Задать вопрос' button to main menu"
```

---

### Task 4: Handle the `m:ask` callback — reset lead into free AI dialogue

**Files:**
- Modify: `supabase/functions/tg-webhook/index.ts` (insert after the `m:manager` block in `handleCallback()`, ~line 347)

- [ ] **Step 1: Insert the new branch**

Find (the end of the `m:manager` block, immediately followed by the brief-format-button block):

```typescript
  if (data === 'm:manager') {
    await tgSend(cfg.tok, chatId, '👨‍💼 Передаю менеджеру! Свяжется в ближайшее время.')
    await addMsg(sb, lead, wsId, '💬 [Написать менеджеру]', true, 'button')
    await notifyOTR(sb, lead, wsId, '💬 Клиент запросил связь с менеджером', cfg.tok, displayName)
    return
  }

  // Brief: format button
```

Replace with:

```typescript
  if (data === 'm:manager') {
    await tgSend(cfg.tok, chatId, '👨‍💼 Передаю менеджеру! Свяжется в ближайшее время.')
    await addMsg(sb, lead, wsId, '💬 [Написать менеджеру]', true, 'button')
    await notifyOTR(sb, lead, wsId, '💬 Клиент запросил связь с менеджером', cfg.tok, displayName)
    return
  }
  if (data === 'm:ask') {
    await setState(sb, lead.id as string, { mode: 'ai', aiRounds: 0, brief: {} })
    await addMsg(sb, lead, wsId, '❓ [Задать вопрос]', true, 'button')
    await tgSend(cfg.tok, chatId, 'Конечно, спрашивайте! 😊 Расскажите о вашем бизнесе или задайте любой вопрос про видео.')
    return
  }

  // Brief: format button
```

Note: this uses `'button'` as the `addMsg` kind (not `'system'` as in the original spec draft) to match the sibling `m:portfolio`/`m:brief`/`m:manager` branches in `handleCallback()`, which all log `'button'` for menu taps — `'system'` is reserved for slash-command echoes in `handleMessage()`.

- [ ] **Step 2: Verify the branch is wired correctly**

Run: `grep -n "m:ask" "supabase/functions/tg-webhook/index.ts"`
Expected: 2 matches — one in `MAIN_KB` (`callback_data: 'm:ask'`), one in `handleCallback()` (`if (data === 'm:ask')`).

- [ ] **Step 3: Trace the resulting state by hand**

Confirm: `setState(..., { mode: 'ai', aiRounds: 0, brief: {} })` matches the `TgState` interface (`mode`, `aiRounds`, `brief` are all valid optional/required fields per the interface at lines 97-106) — no `step` field needed since we're not in the brief flow.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/tg-webhook/index.ts
git commit -m "feat(tg-webhook): handle 'Задать вопрос' callback, reset lead into AI mode"
```

---

### Task 5: Manual smoke test against the deployed bot

**Files:** none (verification only)

- [ ] **Step 1: Deploy**

This repo has no CI/CD for Supabase functions and no `supabase` CLI in this environment — deploy `tg-webhook` the same way prior changes to this function were shipped (Supabase dashboard function editor, or `supabase functions deploy tg-webhook` from a machine with the CLI configured). Confirm with the user which path applies before this step, since it's an action with external, user-visible effect (live bot behavior changes for real leads).

- [ ] **Step 2: Smoke test the new button**

In the actual Telegram bot:
1. Send `/start` (or `/menu`) → confirm the menu now shows 4 buttons, with "❓ Задать вопрос" between "Оставить заявку" and "Написать менеджеру".
2. Tap "❓ Задать вопрос" → confirm reply is "Конечно, спрашивайте! 😊 Расскажите о вашем бизнесе или задайте любой вопрос про видео."
3. Send a message with an objection, e.g. "дорого" → confirm the AI reply reflects the new objection-handling tone (references budget-fitting formats, not a generic brush-off).
4. Send 2 more follow-up messages → confirm `ACTION_KB` ("Оставить заявку" / "Связаться с менеджером") only appears starting on the 3rd AI reply, not the 2nd.

- [ ] **Step 3: Confirm no regression in existing flows**

1. `/portfolio` still shows video buttons + `ACTION_KB`.
2. `/brief` still starts the 6-step brief flow.
3. `/manager` still pings the manager workspace.

No commit for this task — it's verification of already-committed work.

---

## Self-Review Notes

- **Spec coverage:** Section 1 (new prompt) → Task 1. Section 2a (threshold) → Task 2. Section 2b (button) → Task 3. Section 2c (`m:ask` handler) → Task 4. "Out of Scope" items (brief flow, portfolio flow, human takeover, DB migrations, `index.html`) are untouched by all 4 tasks — confirmed by file map above.
- **Deviation from spec:** `addMsg` kind for the `m:ask` log changed from `'system'` (spec draft) to `'button'` to match the actual codebase convention used by sibling menu-callback branches (`m:portfolio`, `m:brief`, `m:manager` all use `'button'`). `'system'` in the real file is only used for slash-command echoes inside `handleMessage()`. This is the only place this plan diverges from the literal spec text — diverges to match working code, not to change behavior.
- **No automated tests added:** matches existing project convention — zero test files exist for any `supabase/functions/*` edge function in this repo as of this plan's writing.
