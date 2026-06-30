# Smart TG Bot — Design Spec
Date: 2026-06-30

## Goal

Make the Telegram bot a smarter sales assistant: warm+professional mixed tone, objection handling with few-shot examples, more dialogue before pushing to brief, and a direct "Ask a question" entry point in the menu.

---

## Current State

- `AI_PROMPT` — 12 lines, no objection handling, no examples, pushes to brief after 2 rounds
- `MAIN_KB` — 3 buttons: Примеры работ / Оставить заявку / Написать менеджеру
- `ACTION_KB` shown when `rounds >= 2` (too early)
- No direct entry to free AI dialogue from menu

---

## Section 1 — New AI Prompt

Replace `const AI_PROMPT = ...` in `supabase/functions/tg-webhook/index.ts` with:

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

---

## Section 2 — Flow Changes

### 2a. aiRounds threshold: 2 → 3

In `handleMessage()`, find:
```typescript
const showActions = rounds >= 2
```
Change to:
```typescript
const showActions = rounds >= 3
```

### 2b. New "❓ Задать вопрос" button in MAIN_KB

Add a 4th row to `MAIN_KB`:
```typescript
const MAIN_KB = {
  inline_keyboard: [
    [{ text: '📹 Примеры работ',         callback_data: 'm:portfolio' }],
    [{ text: '📋 Оставить заявку',        callback_data: 'm:brief'     }],
    [{ text: '❓ Задать вопрос',           callback_data: 'm:ask'       }],
    [{ text: '💬 Написать менеджеру',     callback_data: 'm:manager'   }],
  ]
}
```

### 2c. Handle `m:ask` callback

In `handleCallback()`, add after the `m:manager` block and before the `if (data.startsWith('bf:')...)` block:

```typescript
if (data === 'm:ask') {
  await setState(sb, lead.id as string, { mode: 'ai', aiRounds: 0, brief: {} })
  await addMsg(sb, lead, wsId, 'Нажал: Задать вопрос', true, 'system')
  await tgSend(cfg.tok, chatId, 'Конечно, спрашивайте! 😊 Расскажите о вашем бизнесе или задайте любой вопрос про видео.')
  return
}
```

---

## Data Flow

```
Client presses "❓ Задать вопрос"
  → m:ask callback → mode='ai', aiRounds=0
  → Bot replies with open invitation
  → Client types anything → handleMessage → AI responds (new prompt)
  → rounds 1,2: AI only
  → rounds 3+: AI + ACTION_KB appears (Оставить заявку / Менеджер)

Client writes objection ("дорого")
  → AI detects objection pattern from few-shot examples
  → Responds with specific counter (not generic)
  → Continues dialogue

Client presses "📋 Оставить заявку"
  → startBrief() → unchanged 6-step brief flow
```

---

## Out of Scope

- No changes to brief flow (6 questions stay the same)
- No changes to portfolio flow
- No changes to human takeover
- No DB migrations needed
- No index.html changes

---

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/tg-webhook/index.ts` | New AI_PROMPT, rounds threshold, MAIN_KB button, m:ask handler |
