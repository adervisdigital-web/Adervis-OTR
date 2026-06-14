# VK-автоматизация продаж — ADERVIS OTR

**Дата:** 2026-06-14  
**Статус:** Approved

---

## Цель

Менеджер работает только в OTR. Входящие сообщения из VK попадают в историю диалога автоматически. Ответы уходят в VK прямо из OTR. AI-черновик ответа генерируется без участия менеджера.

---

## Ограничения VK API

- Community Bot может отправлять сообщения пользователям только если те **уже писали в сообщество** или **разрешили сообщения от него**.
- Холодный аутрич (первое сообщение незнакомцу) через API невозможен.
- Вывод: кнопка «В VK» работает только для диалогов, где `vk_peer_id` установлен (входящий был или менеджер указал вручную).

---

## Архитектура

```
VK Community ──(Callback API)──► vk-webhook (Supabase Edge Fn)
                                      │
                              ┌───────┴──────────────────┐
                              │ 1. Verify secret         │
                              │ 2. Find/Create lead      │
                              │    by vk_peer_id         │
                              │ 3. Append message        │
                              │    (fromClient: true)    │
                              │ 4. Gemini 2.0 Flash      │
                              │    → save ai_draft       │
                              └──────────────────────────┘
                                      │
                              Supabase leads table
                                      │ (realtime)
                              OTR Browser
                                      │
                        [📤 В VK кнопка] ─► vk-send (Edge Fn)
                                                   │
                                           VK messages.send
```

---

## База данных

### Новая таблица `workspace_settings`

```sql
CREATE TABLE workspace_settings (
  workspace_id UUID PRIMARY KEY,
  vk_token TEXT,
  vk_community_id BIGINT,
  vk_webhook_secret TEXT,
  vk_confirmation_string TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE workspace_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members can read own settings"
  ON workspace_settings FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "workspace members can upsert own settings"
  ON workspace_settings FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );
```

### Изменение таблицы `leads`

```sql
ALTER TABLE leads ADD COLUMN vk_peer_id BIGINT;
CREATE INDEX idx_leads_vk_peer_id ON leads(vk_peer_id) WHERE vk_peer_id IS NOT NULL;
```

### Поле `ai_draft` в JSONB массиве messages

Схема не меняется. Добавляется ключ в каждый объект сообщения:

```json
{
  "id": "uuid",
  "text": "Текст от клиента",
  "date": 1718364000000,
  "fromClient": true,
  "ai_draft": "Вариант 1: ...\n\nВариант 2: ..."
}
```

---

## Supabase Edge Functions

### `supabase/functions/vk-webhook/index.ts`

**Метод:** POST (публичный — VK не умеет передавать JWT)  
**URL:** `https://efepnuuxtzwzygwipgxt.supabase.co/functions/v1/vk-webhook`

**Логика:**

1. Парсинг тела запроса
2. Если `type === 'confirmation'` → найти `workspace_settings` по `group_id`, вернуть `vk_confirmation_string`
3. Проверить `secret` из тела против `vk_webhook_secret` в настройках
4. Если `type === 'message_new'`:
   - Извлечь `from_id`, `text`, `date`, `group_id`
   - Найти `workspace_id` по `group_id` (через `workspace_settings.vk_community_id`)
   - Найти лид: `SELECT * FROM leads WHERE workspace_id = ? AND vk_peer_id = from_id`
   - Если лид не найден: создать `{ name: "VK ${from_id}", link: "https://vk.com/id${from_id}", vk_peer_id: from_id, status: 0 }`
   - Append в `messages[]`: `{ id, text, date: date*1000, fromClient: true }`
   - Вызвать Gemini 2.0 Flash (env `GEMINI_API_KEY`) с контекстом диалога (последние 5 реплик)
   - Сохранить `ai_draft` в это же сообщение
   - `upsert` лид
5. Вернуть `"ok"` (строка, не JSON)

**Промпт Gemini:**
```
Ты — менеджер видеопродакшена ADERVIS. Отвечаешь на сообщение от потенциального клиента.
Контекст диалога: {последние 5 реплик}
Сообщение клиента: {text}

Напиши 2 варианта ответа менеджера (каждый до 3 предложений).
Цель: продвинуть к звонку или встрече.
Формат: "Вариант 1: ...\n\nВариант 2: ..."
```

**Supabase Secrets:**
```bash
supabase secrets set GEMINI_API_KEY=your_key_here
```

---

### `supabase/functions/vk-send/index.ts`

**Метод:** POST (защищён JWT)  
**Body:** `{ lead_id: string, message: string, workspace_id: string }`

**Логика:**

1. Верифицировать JWT через Supabase Auth
2. Загрузить `workspace_settings` для `workspace_id`
3. Загрузить лид, получить `vk_peer_id`
4. Вызвать VK API:
   ```
   POST https://api.vk.com/method/messages.send
   { peer_id: vk_peer_id, message, random_id: Date.now(), v: "5.131", access_token: vk_token }
   ```
5. Добавить сообщение в `leads.messages[]` с `fromClient: false`
6. Вернуть `{ ok: true, vk_message_id: ... }` или `{ ok: false, error: ... }`

---

## UI изменения в index.html

### A. Структура лида

Добавить поле `vk_peer_id` (число или null) в объект лида.  
При создании нового лида: `vk_peer_id: null`.

### B. Секция VK в Settings modal

Добавить новую секцию после секции Gemini:

```html
<div id="vkSection" style="margin-top:15px; border-top:1px solid var(--border); padding-top:15px;">
  <div style="font-weight:700; margin-bottom:8px; font-size:13px;">📱 VK Сообщество</div>
  
  <label>Community Token</label>
  <input type="password" id="vkTokenInput" placeholder="vk1.a.xxxx..." />
  
  <label>Community ID (числовой)</label>
  <input type="number" id="vkCommunityIdInput" placeholder="123456789" />
  
  <label>Webhook Secret</label>
  <input type="text" id="vkWebhookSecretInput" placeholder="случайная строка" />
  
  <label>Confirmation String (из настроек VK)</label>
  <input type="text" id="vkConfirmationInput" placeholder="a1b2c3d4e5" />
  
  <button onclick="saveVkSettings()">💾 Сохранить</button>
  <button onclick="checkVkConnection()">✅ Проверить подключение</button>
  <div id="vkConnectionStatus" style="font-size:11px;margin-top:6px;"></div>
</div>
```

**Функции:**
- `saveVkSettings()` → upsert в `workspace_settings`
- `loadVkSettings()` → читает из `workspace_settings` при `initApp()`
- `checkVkConnection()` → вызывает `vk-send` с тестовым `groups.getById`

### C. Кнопка «📤 В VK» в chat view

Рядом с кнопкой «Отправить» (строка 840 в index.html):

```html
<button id="btnSendVk" 
        class="btn btn-outline" 
        onclick="sendToVk(currentChatLeadId)"
        style="display:none; align-self:flex-end;"
        aria-label="Отправить в VK">
  📤 В VK
</button>
```

**Логика показа:** в `openChatForLead(leadId)` → если `lead.vk_peer_id` → `btnSendVk.style.display = ''`

**`sendToVk(leadId)`:**
```js
async function sendToVk(leadId) {
  const lead = leads.find(l => l.id === leadId);
  const text = document.getElementById('chatInputMain').value.trim();
  if (!text || !lead.vk_peer_id) return;
  
  const btn = document.getElementById('btnSendVk');
  btn.disabled = true;
  btn.textContent = '⏳';
  
  // Получаем токен через getSession() — currentSession глобально не хранится
  const { data: { session } } = await _sb.auth.getSession();
  
  const res = await fetch(SUPABASE_URL + '/functions/v1/vk-send', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ lead_id: leadId, message: text, workspace_id: workspaceId })
  });
  
  const data = await res.json();
  if (data.ok) {
    showToast('Отправлено в VK ✓');
    document.getElementById('chatInputMain').value = '';
  } else {
    showToast('Ошибка VK: ' + (data.error || 'неизвестно'), 4000);
  }
  btn.disabled = false;
  btn.textContent = '📤 В VK';
}
```

### D. Поле VK User ID в Lead Drawer

В блок редактирования лида (drawer) добавить поле:
```html
<label>VK User ID (числовой)</label>
<input type="number" id="drawerVkPeerId" placeholder="123456 (из vk.com/id123456)"
       onchange="saveVkPeerId(currentDrawerLeadId, this.value)" />
```

### E. AI-черновик в chat feed

В `renderSingleMessage()` — после рендера сообщения с `fromClient: true`, если у него есть `ai_draft`:

```html
<div class="ai-draft-block" id="ai-draft-{msgId}">
  <div class="ai-draft-label">✨ AI-черновик</div>
  <div class="ai-draft-text">{ai_draft}</div>
  <div class="ai-draft-actions">
    <button onclick="useAiDraft('{leadId}', {msgIdx})">Использовать</button>
    <button onclick="dismissAiDraft('{leadId}', {msgIdx})">✕ Отклонить</button>
  </div>
</div>
```

**`useAiDraft(leadId, msgIdx)`:** вставляет `ai_draft` в `#chatInputMain`, переключает таб на «Я написал»  
**`dismissAiDraft(leadId, msgIdx)`:** удаляет `ai_draft` из `lead.messages[msgIdx]`, скрывает блок, upsert в Supabase

---

## Порядок разработки

1. SQL миграции (`workspace_settings`, `vk_peer_id`)
2. Edge Function `vk-webhook`
3. Edge Function `vk-send`
4. UI: Settings modal → VK секция
5. UI: Lead Drawer → VK User ID поле
6. UI: Chat view → кнопка «В VK» + `sendToVk()`
7. UI: Chat feed → AI-черновики
8. Инструкция по деплою

---

## Инструкция по деплою (для пользователя)

### Шаг 1. VK — подготовка сообщества
1. Открыть сообщество ADERVIS в VK → Управление → Настройки
2. **Сообщения** → включить «Сообщения сообщества»
3. **Работа с API** → создать ключ доступа, права: `messages` (отправка сообщений)
4. **Callback API** → добавить URL (вставишь после деплоя), получить строку подтверждения

### Шаг 2. Supabase — применить SQL

```sql
-- Выполнить в Supabase SQL Editor (полный SQL в разделе «База данных» выше):
CREATE TABLE workspace_settings (
  workspace_id UUID PRIMARY KEY,
  vk_token TEXT,
  vk_community_id BIGINT,
  vk_webhook_secret TEXT,
  vk_confirmation_string TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE workspace_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws_settings_select" ON workspace_settings FOR SELECT
  USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));
CREATE POLICY "ws_settings_all" ON workspace_settings FOR ALL
  USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));

ALTER TABLE leads ADD COLUMN vk_peer_id BIGINT;
CREATE INDEX idx_leads_vk_peer_id ON leads(vk_peer_id) WHERE vk_peer_id IS NOT NULL;
```

### Шаг 3. Deплой Edge Functions

```bash
# Установить Supabase CLI если нет
npm install -g supabase

# Войти
supabase login

# Линковать к проекту
supabase link --project-ref efepnuuxtzwzygwipgxt

# Установить секрет Gemini
supabase secrets set GEMINI_API_KEY=your_gemini_key_here

# Задеплоить функции
supabase functions deploy vk-webhook --no-verify-jwt
supabase functions deploy vk-send
```

### Шаг 4. VK — настроить Callback API
1. URL: `https://efepnuuxtzwzygwipgxt.supabase.co/functions/v1/vk-webhook`
2. Версия API: 5.131
3. Тип событий: **Входящие сообщения** (`message_new`)
4. VK отправит тестовый запрос — функция вернёт строку подтверждения ✓

### Шаг 5. OTR — заполнить настройки
1. Открыть OTR → шестерёнка ⚙️ → раздел VK Сообщество
2. Вставить: Token, Community ID, Webhook Secret, Confirmation String
3. Нажать «Проверить подключение»

---

## Что НЕ входит в этот релиз

- Холодный аутрич через VK API (невозможен без разрешения пользователя)
- Автоматическое разрешение screen names VK (например `vk.com/cafe_name` → numeric ID)
- Прикрепление медиафайлов к VK сообщениям
- Поддержка нескольких VK сообществ на один workspace
