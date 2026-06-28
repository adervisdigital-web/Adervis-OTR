# Sprint 9 — Редактор текста бота + Карточка брифа + Уведомление менеджеру

**Дата:** 2026-06-29  
**Статус:** Approved  

---

## Цель

Сделать тексты Telegram-бота полностью управляемыми из OTR без деплоя.  
Улучшить читаемость истории диалога.  
Уведомлять менеджера в Telegram когда клиент заполнил бриф.

---

## Задачи

| # | Пункт Roadmap v3 | Описание |
|---|-----------------|----------|
| 1 | п.3 (остаток) | Редактор PORTFOLIO_TEXT + BRIEF_Q + AI_PROMPT в Настройках |
| 2 | п.6 | Системные сообщения → пилюли, бриф → карточка в истории диалога |
| 3 | п.4 | TG-уведомление менеджеру при заполненном брифе |

---

## 1. База данных

**Миграция: 3 новых колонки в `workspace_settings`**

```sql
ALTER TABLE workspace_settings
  ADD COLUMN tg_portfolio_text  TEXT,
  ADD COLUMN tg_brief_questions JSONB,
  ADD COLUMN tg_ai_prompt       TEXT;
```

- `tg_portfolio_text` — текст, отправляемый при нажатии "📹 Примеры работ"
- `tg_brief_questions` — JSON-массив из 6 строк, вопросы брифа по позиции (0–5)
- `tg_ai_prompt` — системный промпт AI-консультанта

Значение `NULL` во всех колонках = использовать захардкоженный дефолт в tg-webhook.

---

## 2. Настройки OTR (index.html)

### 2.1 Структура `tgSettings`

Добавить поля:
```js
tgSettings = {
  ...существующие поля...,
  portfolioText: '',         // tg_portfolio_text
  briefQuestions: ['','','','','',''],  // tg_brief_questions
  aiPrompt: '',              // tg_ai_prompt
}
```

### 2.2 UI в разделе "TG Bot" Настроек

После блока A/B теста добавить секцию **"Тексты бота"**:

**Текст "Примеры работ":**
```html
<label>Текст портфолио (при нажатии "Примеры работ")</label>
<textarea id="tgPortfolioTextInput" rows="4" placeholder="[дефолтный текст]"></textarea>
```

**Вопросы брифа:**
```html
<label>Вопросы брифа (6 шагов)</label>
<!-- 6 inputs: id="tgBriefQ0" ... "tgBriefQ5" -->
<!-- placeholder — текущий захардкоженный вопрос -->
```
Тип вопроса (текст/кнопки) не меняется — он привязан к позиции.

**Системный промпт AI:**
```html
<label>Промпт AI-консультанта</label>
<textarea id="tgAiPromptInput" rows="8" placeholder="[дефолтный промпт]"></textarea>
```

### 2.3 loadTgSettings()

Добавить в SELECT:
```js
.select('...tg_portfolio_text, tg_brief_questions, tg_ai_prompt')
```

Присвоить:
```js
portfolioText:   data.tg_portfolio_text || '',
briefQuestions:  Array.isArray(data.tg_brief_questions) ? data.tg_brief_questions : ['','','','','',''],
aiPrompt:        data.tg_ai_prompt || '',
```

Заполнить поля формы после загрузки.

### 2.4 saveTgSettings()

Добавить в UPSERT:
```js
tg_portfolio_text:  portfolioText.trim() || null,
tg_brief_questions: briefQuestions.some(q => q.trim()) ? briefQuestions : null,
tg_ai_prompt:       aiPrompt.trim() || null,
```
`null` = не переопределять дефолт в webhook.

---

## 3. tg-webhook (supabase/functions/tg-webhook/index.ts)

### 3.1 Расширить SELECT workspace_settings

```ts
.select('tg_bot_token, tg_welcome_text, tg_welcome_text_b, tg_ab_enabled, tg_manager_chat_id, tg_portfolio_text, tg_brief_questions, tg_ai_prompt')
```

### 3.2 Fallback-паттерн

```ts
const portfolioText = (ws as any).tg_portfolio_text as string | null || PORTFOLIO_TEXT
const briefQ        = (Array.isArray((ws as any).tg_brief_questions) && (ws as any).tg_brief_questions.length === 6)
                      ? (ws as any).tg_brief_questions as string[]
                      : BRIEF_Q
const aiPrompt      = (ws as any).tg_ai_prompt as string | null || AI_PROMPT
const managerChatId = Number((ws as any).tg_manager_chat_id || 0)
```

Передать `portfolioText`, `briefQ`, `aiPrompt`, `managerChatId` как параметры в `handleMessage` и `handleCallback`.

### 3.3 Тегирование сообщений

В `addMsg()` добавить опциональный параметр `type?: string`:
```ts
async function addMsg(sb, lead, wsId, text, fromClient, type = 'message') { ... }
// в insert: { ..., type }
```

**Теги:**
- `/start`, `/menu`, `/portfolio`, `/brief`, `/manager`, `/getchatid` → `type: 'system'`
- Callback `m:*`, `bf:*`, `bb:*` → `type: 'system'`
- Обычные тексты клиента → `type: 'message'` (дефолт)
- Ответы бота → `type: 'bot'` (дефолт уже есть через fromClient=false)
- Напоминание → `type: 'reminder'` (уже есть в tg-reminder)

### 3.4 Сообщение brief_complete

После записи последнего шага брифа (step 5, contact):
```ts
const summaryMsg = {
  id: crypto.randomUUID(),
  text: '📋 Заявка заполнена',
  date: Date.now(),
  fromClient: false,
  type: 'brief_complete',
  brief: state.brief,  // { business, format, city, budget, name, contact }
}
// добавить в messages[] перед upsert в leads
```

### 3.5 TG-уведомление менеджеру (п.4)

После записи `brief_complete` и если `managerChatId > 0`:
```ts
const b = state.brief
await tgSend(tok, managerChatId,
  `📋 Новая заявка!\n\n` +
  `👤 ${b.name || '—'}   📱 ${b.contact || '—'}\n` +
  `🏢 ${b.business || '—'}\n` +
  `🎬 Формат: ${b.format || '—'}\n` +
  `📍 Город: ${b.city || '—'}\n` +
  `💰 Бюджет: ${b.budget || '—'}`
)
```

---

## 4. UI истории диалога (index.html)

### 4.1 Стили (добавить в `<style>`)

```css
.msg-system {
  text-align: center;
  font-size: 11px;
  color: var(--muted);
  padding: 2px 8px;
  margin: 2px 0;
  user-select: none;
}
.msg-system span {
  background: var(--surface-2);
  border-radius: 10px;
  padding: 2px 10px;
}
.brief-card {
  background: color-mix(in srgb, var(--success) 8%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--success) 30%, transparent);
  border-radius: 10px;
  padding: 10px 14px;
  margin: 4px 0;
  font-size: 13px;
  line-height: 1.6;
}
.brief-card .brief-card-title {
  font-weight: 600;
  margin-bottom: 6px;
  color: var(--success);
}
.msg-reminder {
  text-align: center;
  font-size: 11px;
  color: var(--muted);
  padding: 2px 0;
  font-style: italic;
}
```

### 4.2 Логика рендера сообщений

В функции рендера одного сообщения добавить ветки по `msg.type`:

```js
if (msg.type === 'system') {
  return `<div class="msg-system"><span>${escapeHtml(msg.text)}</span></div>`
}
if (msg.type === 'brief_complete') {
  const b = msg.brief || {}
  return `<div class="brief-card">
    <div class="brief-card-title">📋 Заявка заполнена</div>
    <div><b>Бизнес:</b> ${escapeHtml(b.business||'—')}</div>
    <div><b>Формат:</b> ${escapeHtml(b.format||'—')}</div>
    <div><b>Город:</b>  ${escapeHtml(b.city||'—')}</div>
    <div><b>Бюджет:</b> ${escapeHtml(b.budget||'—')}</div>
    <div><b>Имя:</b>    ${escapeHtml(b.name||'—')}</div>
    <div><b>Контакт:</b>${escapeHtml(b.contact||'—')}</div>
  </div>`
}
if (msg.type === 'reminder') {
  return `<div class="msg-reminder">🔔 Напоминание отправлено</div>`
}
// иначе — обычный пузырь
```

---

## Порядок реализации

1. Миграция SQL в Supabase Dashboard (ручная, ~1 мин)
2. index.html — Настройки (loadTgSettings + saveTgSettings + UI)
3. index.html — Рендер сообщений (стили + ветки)
4. tg-webhook — расширить SELECT + fallback + тегирование + brief_complete + менеджер
5. Деплой tg-webhook через `supabase functions deploy tg-webhook`
6. Smoke-test: нажать /start в боте → проверить тег, заполнить бриф → проверить карточку + уведомление менеджеру

---

## Что НЕ меняется

- Кнопочные клавиатуры (`MAIN_KB`, `FORMAT_KB`, `BUDGET_KB`) — остаются захардкоженными (достаточно редактировать текст вопросов)
- `tg_reminder_text` — уже редактируется, не трогаем
- Структура `tg_state` и логика шагов брифа — не меняется
