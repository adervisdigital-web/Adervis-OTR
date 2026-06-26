# Sprint 3 Design: TG Reminder Cron + История диалога

Date: 2026-06-27  
Status: Approved

---

## Фича 1: Напоминания о незаполненном брифе (п.10)

### Goal
Через 20–48ч после последнего сообщения автоматически напомнить TG-лиду оставить заявку, если бриф не заполнен.

### SQL Changes

**Migration `20260627_tg_reminder.sql`:**
```sql
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS tg_reminded_at BIGINT DEFAULT NULL;

ALTER TABLE workspace_settings
  ADD COLUMN IF NOT EXISTS tg_reminder_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS tg_reminder_text    TEXT    DEFAULT NULL;
```

### New Edge Function: `tg-reminder`

File: `supabase/functions/tg-reminder/index.ts`

**Scheduling:** `Deno.cron("send-tg-reminders", "0 */6 * * *", handler)` + `Deno.serve()` для ручного триггера.

**Eligibility query (TypeScript logic):**
```
tg_chat_id IS NOT NULL
AND archived_at IS NULL
AND status IN (0, 1, 2)                    -- не успех и не отказ
AND tg_reminded_at IS NULL                 -- ещё не напоминали
AND tg_state->>'mode' != 'human'           -- менеджер не ведёт вручную
AND (кол-во заполненных полей брифа) < 5   -- бриф не завершён
AND updated_at < (now - 20h)               -- последнее сообщение > 20 часов назад
AND updated_at > (now - 7 days)            -- но не старше 7 дней
```

Бриф считается незаполненным если в `tg_state.brief` менее 5 полей из: `business`, `format`, `city`, `budget`, `name`, `contact`.

**После отправки:**
- Вызов `api.telegram.org/bot{TOKEN}/sendMessage` напрямую (без tg-send EF)
- `UPDATE leads SET tg_reminded_at = {now}` + сохранить напоминание как сообщение типа `'system'` с `fromClient: false`

**Default reminder text (хранится в workspace_settings, редактируется в Settings):**
```
Привет! 👋

Вы писали нам, но мы ещё не успели поговорить подробнее.

Хотите узнать, как мы поможем привлечь гостей через короткие видео? Оставьте заявку — займёт 2 минуты 👇

/brief
```

**Обработка workspace_settings:**
- Функция читает все workspaces где `tg_reminder_enabled = true AND tg_bot_token IS NOT NULL`
- Для каждого workspace ищет eligible leads
- Использует `tg_reminder_text || DEFAULT_TEXT` для сообщения

### Settings UI Changes (index.html)

В секции TG Settings, после `tgBotUsernameInput`, перед разделителем webhook:

```html
<div style="display:flex;align-items:center;gap:8px;margin-top:8px;">
  <input type="checkbox" id="tgReminderEnabledInput" aria-label="Включить напоминания">
  <label for="tgReminderEnabledInput" style="font-size:13px;cursor:pointer;">
    Напоминания о незаполненном брифе (через 24 ч)
  </label>
</div>
<label for="tgReminderTextInput" style="font-size:12px;color:var(--muted);margin-top:6px;display:block;">
  Текст напоминания
</label>
<textarea id="tgReminderTextInput" rows="4" style="width:100%;resize:vertical;"
  placeholder="Привет! Вы писали нам..."
  aria-label="Текст напоминания TG Bot"></textarea>
```

`tgSettings` global: добавить `reminderEnabled: false, reminderText: ''`

`loadTgSettings`: добавить в SELECT `tg_reminder_enabled, tg_reminder_text`

`saveTgSettings`: добавить в upsert `tg_reminder_enabled, tg_reminder_text`

---

## Фича 2: История диалога — стили сообщений (п.6)

### Goal
Разные типы TG-сообщений визуально различаются: кнопки меню → чип, ответы брифа → карточка, обычный текст → пузырь.

### Message Type Field

Добавляем опциональное поле `type?: 'text' | 'button' | 'brief_answer'` в объект сообщения.

Старые сообщения без `type` — backwards-compatible: определяются по контенту (см. ниже).

### Changes to tg-webhook/index.ts

**Обновить `addMsg`:**
```ts
async function addMsg(
  sb: SbClient, lead: LeadRow, wsId: string,
  text: string, fromClient: boolean,
  type?: 'text' | 'button' | 'brief_answer'
) {
  const fresh    = await getLead(sb, wsId, Number(lead.tg_chat_id))
  const messages = [...((fresh?.messages ?? lead.messages ?? []) as LeadRow[])]
  const entry: Record<string, unknown> = { id: crypto.randomUUID(), text, date: Date.now(), fromClient }
  if (type && type !== 'text') entry.type = type
  messages.push(entry)
  await sb.from('leads').update({ messages, updated_at: Date.now() }).eq('id', lead.id as string)
}
```

`type` не сохраняется если `'text'` — экономим место в JSONB.

**Callers обновить:**

| Caller | text | type |
|--------|------|------|
| `handleCallback` `m:portfolio` | `'📹 [Примеры работ]'` | `'button'` |
| `handleCallback` `m:brief`     | `'📋 [Оставить заявку]'` | `'button'` |
| `handleCallback` `m:manager`   | `'💬 [Написать менеджеру]'` | `'button'` |
| `handleCallback` `bf:*`        | `'Формат: {value}'` | `'brief_answer'` |
| `handleCallback` `bb:*`        | `'Бюджет: {value}'` | `'brief_answer'` |
| Всё остальное | — | не передавать (default `'text'`) |

**Важно:** free-text ответы в брифе (название бизнеса, город, имя, контакт) — обычный `type: 'text'`, потому что они хранятся без метки `Key: ...`.

### Changes to renderSingleMessage (index.html)

**Определение типа для старых сообщений (без поля `type`):**
```js
function getMsgType(m) {
  if (m.type) return m.type;
  if (!m.fromClient) return 'text';
  if (/\[.+\]/.test(m.text)) return 'button';
  // Only Формат: and Бюджет: are stored with labels — free-text brief answers (business, city, name, contact) are plain text
  if (/^(Формат|Бюджет):/.test(m.text)) return 'brief_answer';
  return 'text';
}
```

**Рендер `button`:**
```html
<div class="msg-wrap client msg-type-button">
  <div class="msg-button-pill">{text}</div>
  <div class="msg-meta msg-meta-small">Клиент · {time}</div>
</div>
```

**Рендер `brief_answer`:**
```html
<div class="msg-wrap client msg-type-brief">
  <div class="msg-brief-card">
    <div class="msg-brief-key">{key}</div>      <!-- "Формат" -->
    <div class="msg-brief-value">{value}</div>  <!-- "Reels / Shorts" -->
  </div>
  <div class="msg-meta msg-meta-small">Клиент · {time}</div>
</div>
```

Разбивка текста: `const [key, ...rest] = m.text.split(':'); const value = rest.join(':').trim();`

**Рендер `text`:** существующий код без изменений.

**Edit/delete кнопки:** присутствуют только для `text`. Для `button` и `brief_answer` — скрыть (нет смысла редактировать навигационное действие).

### New CSS Classes

```css
/* Button click pill */
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
}

/* Brief answer card */
.msg-type-brief { justify-content: flex-end; }
.msg-brief-card {
  background: var(--surface, #1a1a2e);
  border-left: 3px solid #06b6d4;
  border-radius: 6px;
  padding: 6px 12px;
  min-width: 120px;
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

/* Smaller meta for non-text messages */
.msg-meta-small {
  font-size: 10px;
  color: var(--text-muted);
  margin-top: 3px;
  text-align: right;
}
```

---

## Фича 3: AI-классификатор направления (п.новый)

### Goal
Gemini анализирует первое сообщение клиента и определяет направление ADERVIS. AI-ответ и дальнейший диалог адаптируются под нужную категорию.

### Service Categories

| Код | Направление | Примеры сигналов |
|-----|-------------|-----------------|
| `video` | Видео (сценарий, съёмка, монтаж, графика) | "ролик", "видео", "reels", "монтаж", "снять" |
| `design` | Дизайн (брендинг, логотипы, SMM-дизайн) | "логотип", "дизайн", "баннер", "фирменный стиль" |
| `photo` | Фото (бизнес, продукт, репортаж) | "фото", "съёмка", "фотограф" |
| `ai` | ИИ-решения (боты, автоматизация, генерация) | "бот", "автоматизация", "ИИ", "нейросеть" |
| `unknown` | Не определено | общие фразы ("хочу продвижение", "помогите") |

### SQL Changes

**В migration `20260627_tg_reminder.sql` добавить:**
```sql
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS service_category TEXT DEFAULT NULL;
```

### Changes to tg-webhook/index.ts

**Новая функция `classifyService(text)`:**
```ts
async function classifyService(text: string): Promise<string> {
  if (!GEMINI_KEY) return 'unknown'
  const prompt = `Ты классификатор запросов для агентства ADERVIS.
Направления: video (видео: съёмка, монтаж, ролики, reels), design (дизайн: логотипы, брендинг, графика), photo (фото: фотосъёмка бизнеса, продукта), ai (ИИ: боты, автоматизация, нейросети).
Клиент написал: «${text.slice(0, 300)}»
Ответь ОДНИМ словом: video, design, photo, ai или unknown.`

  try {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 10, temperature: 0 } })
    })
    const d = await res.json()
    const cat = d?.candidates?.[0]?.content?.parts?.[0]?.text?.trim().toLowerCase() ?? 'unknown'
    return ['video', 'design', 'photo', 'ai'].includes(cat) ? cat : 'unknown'
  } catch { return 'unknown' }
}
```

**Когда вызывать:** в `handleMessage`, после `addMsg`, перед AI-ответом — только если `lead.service_category` ещё не установлена (классифицируем один раз):
```ts
// Classify service on first substantive message (fire-and-forget)
if (!lead.service_category && text.length > 3 && !text.startsWith('/')) {
  classifyService(text).then(async (cat) => {
    await sb.from('leads').update({ service_category: cat }).eq('id', lead.id as string)
  }).catch(() => {})
}
```

**Адаптация AI-промпта** — функция `aiResponse` получает опциональный `category`:
```ts
async function aiResponse(userText: string, history: LeadRow[], category?: string): Promise<string>
```

Промпт расширяется секцией о направлении:
```ts
const categoryContext = {
  video:   'Клиент интересуется ВИДЕО. Фокус: съёмка, монтаж, сценарий, Reels/Shorts/VK Клипы, рекламные ролики, корпоративные, событийные видео.',
  design:  'Клиент интересуется ДИЗАЙНОМ. Фокус: логотипы, фирменный стиль, брендинг, SMM-дизайн, баннеры, упаковка.',
  photo:   'Клиент интересуется ФОТО. Фокус: фотосъёмка бизнеса, продуктовая фото, репортажная съёмка, фото для соцсетей.',
  ai:      'Клиент интересуется ИИ-РЕШЕНИЯМИ. Фокус: чат-боты, автоматизация бизнеса, генерация контента, нейросетевые сервисы.',
  unknown: '',
}[category ?? 'unknown'] ?? ''
```

### Changes to index.html

**rowToLead:** добавить `serviceCategory: row.service_category ?? null`

**leadToRow:** добавить `service_category: lead.serviceCategory ?? null`

**Бейдж в sidebar (renderTgSidebarItem):**
```js
const CAT_BADGE = { video: '🎬', design: '🎨', photo: '📸', ai: '🤖' }
const catIcon = lead.serviceCategory && CAT_BADGE[lead.serviceCategory]
  ? '<span title="' + lead.serviceCategory + '" aria-label="Направление: ' + lead.serviceCategory + '">' + CAT_BADGE[lead.serviceCategory] + '</span>'
  : ''
```
Бейдж показывается рядом с именем лида в sidebar и в строке таблицы.

**Бейдж в таблице (renderTable):** аналогично — иконка в колонке имени.

**Фильтр:** добавить в существующий фильтр "Источник" или отдельный дропдаун "Направление" (все / 🎬 Видео / 🎨 Дизайн / 📸 Фото / 🤖 ИИ).

---

## Implementation Order (updated)

1. SQL migration (`tg_reminded_at`, `tg_reminder_enabled`, `tg_reminder_text`, `service_category`)
2. `addMsg` update in tg-webhook + type tagging для callers
3. `classifyService()` + вызов в `handleMessage` + адаптация `aiResponse` в tg-webhook → redeploy
4. New `tg-reminder` Edge Function + deploy
5. `renderSingleMessage` update + new CSS (index.html)
6. Settings UI: reminder toggle + textarea (index.html)
7. `tgSettings` / `loadTgSettings` / `saveTgSettings` update (index.html)
8. `rowToLead` / `leadToRow`: add `tgRemindedAt` + `serviceCategory`
9. Бейджи категорий в sidebar + таблице (index.html)
10. Smoke test

---

## File Map

| File | Change |
|------|--------|
| `supabase/migrations/20260627_tg_reminder.sql` | новая (`tg_reminded_at`, `tg_reminder_*`, `service_category`) |
| `supabase/functions/tg-webhook/index.ts` | `addMsg` type tagging + `classifyService` + адаптивный `aiResponse` |
| `supabase/functions/tg-reminder/index.ts` | новая EF с Deno.cron |
| `index.html` | `renderSingleMessage`, CSS, Settings UI, tgSettings, rowToLead/leadToRow, бейджи категорий |
