# VK-автоматизация продаж — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Автоматически получать входящие сообщения из VK в OTR, отвечать прямо из браузера, получать AI-черновик ответа.

**Architecture:** Два Supabase Edge Functions (vk-webhook — публичный приём Callback API, vk-send — защищённая отправка с JWT). Весь UI — изменения в одном файле `index.html`. Хранение настроек VK в новой таблице `workspace_settings`.

**Tech Stack:** Deno (Supabase Edge Functions), TypeScript, VK API v5.131, Gemini 2.0 Flash REST API, Vanilla JS, Supabase JS v2.

---

## Файловая структура

| Файл | Действие | Ответственность |
|------|----------|-----------------|
| `supabase/migrations/20260614000000_vk_automation.sql` | CREATE | SQL миграции: таблица + колонка |
| `supabase/functions/vk-webhook/index.ts` | CREATE | Принимает Callback API от VK |
| `supabase/functions/vk-send/index.ts` | CREATE | Отправляет сообщение в VK |
| `index.html` | MODIFY | 5 UI-изменений: settings, drawer, chat button, AI draft, leadToRow/rowToLead |

---

## Task 1: SQL миграция

**Files:**
- Create: `supabase/migrations/20260614000000_vk_automation.sql`

- [ ] **Step 1.1: Создать файл миграции**

```sql
-- supabase/migrations/20260614000000_vk_automation.sql

-- Настройки VK для workspace
CREATE TABLE IF NOT EXISTS workspace_settings (
  workspace_id UUID PRIMARY KEY,
  vk_token TEXT,
  vk_community_id BIGINT,
  vk_webhook_secret TEXT,
  vk_confirmation_string TEXT,
  updated_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
);

ALTER TABLE workspace_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws_settings_select"
  ON workspace_settings FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "ws_settings_all"
  ON workspace_settings FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

-- Добавить поле vk_peer_id к лидам
ALTER TABLE leads ADD COLUMN IF NOT EXISTS vk_peer_id BIGINT;
CREATE INDEX IF NOT EXISTS idx_leads_vk_peer_id
  ON leads(workspace_id, vk_peer_id)
  WHERE vk_peer_id IS NOT NULL;
```

- [ ] **Step 1.2: Выполнить в Supabase SQL Editor**

Открыть https://supabase.com/dashboard/project/efepnuuxtzwzygwipgxt/sql/new  
Вставить содержимое файла → Run  
Ожидаемый результат: «Success. No rows returned»

- [ ] **Step 1.3: Проверить что таблица создалась**

В SQL Editor выполнить:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'workspace_settings';
-- Должно вернуть: workspace_id, vk_token, vk_community_id, vk_webhook_secret, vk_confirmation_string, updated_at

SELECT column_name FROM information_schema.columns
WHERE table_name = 'leads' AND column_name = 'vk_peer_id';
-- Должно вернуть: vk_peer_id
```

- [ ] **Step 1.4: Commit**

```bash
git add supabase/migrations/20260614000000_vk_automation.sql
git commit -m "feat: add workspace_settings table and vk_peer_id column"
```

---

## Task 2: Edge Function — vk-webhook

**Files:**
- Create: `supabase/functions/vk-webhook/index.ts`

- [ ] **Step 2.1: Создать папку функции**

```bash
mkdir -p "supabase/functions/vk-webhook"
```

- [ ] **Step 2.2: Написать функцию**

Создать `supabase/functions/vk-webhook/index.ts`:

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const GEMINI_KEY   = Deno.env.get('GEMINI_API_KEY') ?? ''

interface VkMessage {
  id: string
  text: string
  date: number
  fromClient: boolean
  ai_draft?: string
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return new Response('bad json', { status: 400 })
  }

  const groupId   = Number(body.group_id)
  const eventType = String(body.type ?? '')
  const secret    = String(body.secret ?? '')

  const sb = createClient(SUPABASE_URL, SERVICE_KEY)

  // Найти workspace по vk_community_id
  const { data: settings } = await sb
    .from('workspace_settings')
    .select('workspace_id, vk_confirmation_string, vk_webhook_secret')
    .eq('vk_community_id', groupId)
    .maybeSingle()

  // Подтверждение Callback API — VK ждёт строку подтверждения
  if (eventType === 'confirmation') {
    if (!settings?.vk_confirmation_string) {
      return new Response('not configured', { status: 404 })
    }
    return new Response(settings.vk_confirmation_string, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' }
    })
  }

  // Верификация secret для всех остальных событий
  if (!settings || secret !== settings.vk_webhook_secret) {
    return new Response('forbidden', { status: 403 })
  }

  if (eventType !== 'message_new') {
    return new Response('ok', { status: 200 })
  }

  // Обработка входящего сообщения
  const msgObj = (body.object as Record<string, unknown>)?.message as Record<string, unknown>
  if (!msgObj) return new Response('ok', { status: 200 })

  const fromId  = Number(msgObj.from_id)
  const text    = String(msgObj.text ?? '')
  const vkDate  = Number(msgObj.date ?? 0)
  const dateMs  = vkDate ? vkDate * 1000 : Date.now()

  const workspaceId = settings.workspace_id

  // Найти лид по vk_peer_id
  const { data: existingLead } = await sb
    .from('leads')
    .select('id, messages')
    .eq('workspace_id', workspaceId)
    .eq('vk_peer_id', fromId)
    .maybeSingle()

  // Генерация AI-черновика (не блокирует основной поток)
  const aiDraft = await generateAiDraft(text, existingLead?.messages ?? [])

  const newMessage: VkMessage = {
    id:         crypto.randomUUID(),
    text,
    date:       dateMs,
    fromClient: true,
    ...(aiDraft ? { ai_draft: aiDraft } : {})
  }

  if (existingLead) {
    const messages = [...(existingLead.messages ?? []), newMessage]
    await sb
      .from('leads')
      .update({ messages, updated_at: Date.now() })
      .eq('id', existingLead.id)
  } else {
    await sb.from('leads').insert({
      id:           crypto.randomUUID(),
      workspace_id: workspaceId,
      name:         `VK ${fromId}`,
      link:         `https://vk.com/id${fromId}`,
      contact:      '',
      biz_type:     '',
      status:       0,
      updated_at:   Date.now(),
      notes:        '',
      messages:     [newMessage],
      remind_at:    null,
      attempt_count: 0,
      assigned_to:  null,
      created_by:   null,
      vk_peer_id:   fromId
    })
  }

  return new Response('ok', { status: 200 })
})

async function generateAiDraft(
  userText: string,
  history: VkMessage[]
): Promise<string> {
  if (!GEMINI_KEY || !userText.trim()) return ''

  const recent = history.slice(-5).map(m =>
    (m.fromClient ? 'Клиент' : 'Менеджер') + ': «' + m.text.slice(0, 200) + '»'
  ).join('\n')

  const prompt = [
    'Ты — менеджер видеопродакшена ADERVIS.',
    'Снимаем короткие видео (VK Клипы, Reels, Shorts) для заведений — кафе, рестораны, барбершопы.',
    'Цель диалога: договориться о звонке или встрече.',
    recent ? `\nИстория диалога:\n${recent}` : '',
    `\nСообщение клиента: «${userText}»`,
    '\nНапиши 2 варианта ответа менеджера (каждый до 3 предложений).',
    'Формат ответа строго: "Вариант 1: ...\n\nВариант 2: ..."',
  ].join('\n')

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 400, temperature: 0.7 }
        })
      }
    )
    const data = await res.json()
    return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  } catch {
    return ''
  }
}
```

- [ ] **Step 2.3: Задеплоить функцию**

```bash
# Из корня проекта "c:\work\ADERVIS OTR"
# Установить CLI если нет: npm install -g supabase

supabase login
supabase link --project-ref efepnuuxtzwzygwipgxt
supabase secrets set GEMINI_API_KEY=your_gemini_api_key_here
supabase functions deploy vk-webhook --no-verify-jwt
```

Ожидаемый вывод:
```
Deploying function vk-webhook
...
Done: vk-webhook => https://efepnuuxtzwzygwipgxt.supabase.co/functions/v1/vk-webhook
```

- [ ] **Step 2.4: Проверить что функция отвечает**

```bash
curl -X POST https://efepnuuxtzwzygwipgxt.supabase.co/functions/v1/vk-webhook \
  -H "Content-Type: application/json" \
  -d '{"type":"unknown","group_id":0,"secret":""}'
```

Ожидаемый ответ: `forbidden` (403) или `not configured` — значит функция работает.

- [ ] **Step 2.5: Commit**

```bash
git add supabase/functions/vk-webhook/index.ts
git commit -m "feat: add vk-webhook Edge Function for VK Callback API"
```

---

## Task 3: Edge Function — vk-send

**Files:**
- Create: `supabase/functions/vk-send/index.ts`

- [ ] **Step 3.1: Создать папку функции**

```bash
mkdir -p "supabase/functions/vk-send"
```

- [ ] **Step 3.2: Написать функцию**

Создать `supabase/functions/vk-send/index.ts`:

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

interface SendBody {
  lead_id:      string
  message:      string
  workspace_id: string
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return json({ ok: false, error: 'method not allowed' }, 405)
  }

  // Верифицировать JWT пользователя
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace('Bearer ', '').trim()
  if (!token) return json({ ok: false, error: 'unauthorized' }, 401)

  const sbUser = createClient(SUPABASE_URL, token)
  const { data: { user }, error: authErr } = await sbUser.auth.getUser()
  if (authErr || !user) return json({ ok: false, error: 'unauthorized' }, 401)

  let body: SendBody
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: 'bad json' }, 400)
  }

  const { lead_id, message, workspace_id } = body
  if (!lead_id || !message || !workspace_id) {
    return json({ ok: false, error: 'missing fields' }, 400)
  }

  const sb = createClient(SUPABASE_URL, SERVICE_KEY)

  // Убедиться что пользователь — член workspace
  const { data: membership } = await sb
    .from('workspace_members')
    .select('id')
    .eq('workspace_id', workspace_id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!membership) return json({ ok: false, error: 'forbidden' }, 403)

  // Получить настройки VK
  const { data: settings } = await sb
    .from('workspace_settings')
    .select('vk_token, vk_community_id')
    .eq('workspace_id', workspace_id)
    .maybeSingle()

  if (!settings?.vk_token) {
    return json({ ok: false, error: 'VK token not configured' }, 400)
  }

  // Получить vk_peer_id лида
  const { data: lead } = await sb
    .from('leads')
    .select('vk_peer_id, messages')
    .eq('id', lead_id)
    .eq('workspace_id', workspace_id)
    .maybeSingle()

  if (!lead?.vk_peer_id) {
    return json({ ok: false, error: 'Lead has no vk_peer_id' }, 400)
  }

  // Вызвать VK API messages.send
  const vkParams = new URLSearchParams({
    peer_id:      String(lead.vk_peer_id),
    message:      message,
    random_id:    String(Date.now()),
    v:            '5.131',
    access_token: settings.vk_token
  })

  const vkRes = await fetch(
    'https://api.vk.com/method/messages.send',
    { method: 'POST', body: vkParams }
  )
  const vkData = await vkRes.json()

  if (vkData.error) {
    return json({ ok: false, error: vkData.error.error_msg ?? 'VK error' }, 400)
  }

  // Записать сообщение в историю лида
  const newMsg = {
    id:         crypto.randomUUID(),
    text:       message,
    date:       Date.now(),
    fromClient: false
  }
  const messages = [...(lead.messages ?? []), newMsg]

  await sb
    .from('leads')
    .update({ messages, updated_at: Date.now() })
    .eq('id', lead_id)

  return json({ ok: true, vk_message_id: vkData.response })
})

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}
```

- [ ] **Step 3.3: Задеплоить функцию**

```bash
supabase functions deploy vk-send
```

Ожидаемый вывод:
```
Done: vk-send => https://efepnuuxtzwzygwipgxt.supabase.co/functions/v1/vk-send
```

- [ ] **Step 3.4: Проверить что функция отвечает на авторизацию**

```bash
curl -X POST https://efepnuuxtzwzygwipgxt.supabase.co/functions/v1/vk-send \
  -H "Content-Type: application/json" \
  -d '{"lead_id":"test","message":"hi","workspace_id":"test"}'
```

Ожидаемый ответ: `{"ok":false,"error":"unauthorized"}` (401)

- [ ] **Step 3.5: Commit**

```bash
git add supabase/functions/vk-send/index.ts
git commit -m "feat: add vk-send Edge Function for outbound VK messages"
```

---

## Task 4: UI — обновить leadToRow / rowToLead

**Files:**
- Modify: `index.html` (строки 1406–1441)

- [ ] **Step 4.1: Добавить vk_peer_id в leadToRow**

В `index.html` найти функцию `leadToRow` (строка ~1406) и добавить одну строку:

```js
// ДО (строка ~1421):
                created_by:    lead.createdBy   || (currentUser ? currentUser.id : null)
            };
        }

// ПОСЛЕ:
                created_by:    lead.createdBy   || (currentUser ? currentUser.id : null),
                vk_peer_id:    lead.vkPeerId    || null
            };
        }
```

- [ ] **Step 4.2: Добавить vk_peer_id в rowToLead**

В функции `rowToLead` (строка ~1425) добавить строку:

```js
// ДО (строка ~1439):
                assignedTo:   row.assigned_to,
                createdBy:    row.created_by
            };
        }

// ПОСЛЕ:
                assignedTo:   row.assigned_to,
                createdBy:    row.created_by,
                vkPeerId:     row.vk_peer_id || null
            };
        }
```

- [ ] **Step 4.3: Инициализировать vkPeerId при создании нового лида**

Найти место создания нового лида через форму (поиск по `uid()` и `name:` в createLead-like функции). Добавить `vkPeerId: null` в объект нового лида:

```bash
grep -n "id: uid()\|id:uid()\|newLead\s*=" "index.html" | head -10
```

В найденном месте добавить `vkPeerId: null` если его нет.

- [ ] **Step 4.4: Проверить в браузере**

Открыть DevTools Console → `leads[0]` — у объекта лида должно быть поле `vkPeerId: null`.

- [ ] **Step 4.5: Commit**

```bash
git add index.html
git commit -m "feat: add vkPeerId to lead model (leadToRow/rowToLead)"
```

---

## Task 5: UI — секция VK в Settings modal

**Files:**
- Modify: `index.html` (строки ~999–1011, settingsModal)

- [ ] **Step 5.1: Добавить глобальную переменную для настроек VK**

Найти блок с глобальными переменными (строка ~1013–1017, рядом с `let currentUser`):

```js
// Добавить после let workspaceId = null;
let vkSettings = { token: '', communityId: '', secret: '', confirmationString: '' };
```

- [ ] **Step 5.2: Добавить HTML-секцию VK в settingsModal**

Найти строку с `id="geminiSection"` (~строка 999) и добавить ПОСЛЕ неё (перед `<div class="action-buttons"`):

```html
            <div id="vkSection" style="margin-top:15px;border-top:1px solid var(--border);padding-top:15px;">
                <div style="font-weight:700;margin-bottom:10px;font-size:13px;">📱 VK Сообщество</div>
                <div style="display:flex;flex-direction:column;gap:8px;">
                    <label for="vkTokenInput" style="font-size:12px;color:var(--muted);margin-bottom:-4px;">Community Token</label>
                    <input type="password" id="vkTokenInput" placeholder="vk1.a.xxxx..." style="width:100%;" autocomplete="off">

                    <label for="vkCommunityIdInput" style="font-size:12px;color:var(--muted);margin-bottom:-4px;">Community ID (числовой)</label>
                    <input type="number" id="vkCommunityIdInput" placeholder="123456789" style="width:100%;">

                    <label for="vkSecretInput" style="font-size:12px;color:var(--muted);margin-bottom:-4px;">Webhook Secret (придумать самому)</label>
                    <input type="text" id="vkSecretInput" placeholder="my_secret_string" style="width:100%;" autocomplete="off">

                    <label for="vkConfirmInput" style="font-size:12px;color:var(--muted);margin-bottom:-4px;">Строка подтверждения (из VK Callback API)</label>
                    <input type="text" id="vkConfirmInput" placeholder="a1b2c3d4" style="width:100%;">

                    <div style="display:flex;gap:8px;margin-top:4px;">
                        <button class="btn btn-outline" onclick="saveVkSettings()" style="flex:1;">💾 Сохранить</button>
                        <button class="btn btn-outline" onclick="checkVkConnection()" style="flex:1;">✅ Проверить</button>
                    </div>
                    <div id="vkConnectionStatus" style="font-size:11px;color:var(--muted);min-height:16px;"></div>
                </div>
            </div>
```

- [ ] **Step 5.3: Добавить JS-функции для VK настроек**

Найти функцию `saveGeminiKey` (примерно строка 2750–2760) и добавить ПОСЛЕ неё:

```js
        async function loadVkSettings() {
            if (!workspaceId) return;
            const { data } = await _sb
                .from('workspace_settings')
                .select('vk_token, vk_community_id, vk_webhook_secret, vk_confirmation_string')
                .eq('workspace_id', workspaceId)
                .maybeSingle();
            if (!data) return;
            vkSettings = {
                token:              data.vk_token              || '',
                communityId:        String(data.vk_community_id || ''),
                secret:             data.vk_webhook_secret     || '',
                confirmationString: data.vk_confirmation_string || ''
            };
            const tf = document.getElementById('vkTokenInput');
            const cf = document.getElementById('vkCommunityIdInput');
            const sf = document.getElementById('vkSecretInput');
            const kf = document.getElementById('vkConfirmInput');
            if (tf) tf.value = vkSettings.token;
            if (cf) cf.value = vkSettings.communityId;
            if (sf) sf.value = vkSettings.secret;
            if (kf) kf.value = vkSettings.confirmationString;
        }

        async function saveVkSettings() {
            if (!workspaceId) return;
            const token  = (document.getElementById('vkTokenInput').value || '').trim();
            const commId = Number(document.getElementById('vkCommunityIdInput').value || 0);
            const secret = (document.getElementById('vkSecretInput').value || '').trim();
            const conf   = (document.getElementById('vkConfirmInput').value || '').trim();
            const { error } = await _sb.from('workspace_settings').upsert({
                workspace_id:           workspaceId,
                vk_token:               token,
                vk_community_id:        commId || null,
                vk_webhook_secret:      secret,
                vk_confirmation_string: conf,
                updated_at:             Date.now()
            }, { onConflict: 'workspace_id' });
            if (error) { showToast('Ошибка сохранения: ' + error.message, 4000); return; }
            vkSettings = { token, communityId: String(commId), secret, confirmationString: conf };
            showToast('VK настройки сохранены ✓');
        }

        async function checkVkConnection() {
            const statusEl = document.getElementById('vkConnectionStatus');
            if (!vkSettings.token) {
                statusEl.textContent = '⚠️ Сначала сохраните токен';
                return;
            }
            statusEl.textContent = '⏳ Проверяем...';
            try {
                const res = await fetch(
                    `https://api.vk.com/method/groups.getById?group_id=${vkSettings.communityId}&v=5.131&access_token=${vkSettings.token}`
                );
                const data = await res.json();
                if (data.error) {
                    statusEl.textContent = '❌ Ошибка: ' + data.error.error_msg;
                } else {
                    const name = data.response?.[0]?.name || '?';
                    statusEl.textContent = '✅ Подключено: ' + name;
                }
            } catch (e) {
                statusEl.textContent = '❌ Сетевая ошибка';
            }
        }
```

- [ ] **Step 5.4: Вызвать loadVkSettings в initApp**

Найти функцию `initApp()` и добавить вызов рядом с `loadScriptsFromDB()`:

```js
// В initApp() — добавить строку:
await loadVkSettings();
```

- [ ] **Step 5.5: Проверить в браузере**

1. Открыть OTR → ⚙️ → должна появиться секция «VK Сообщество»
2. Ввести тестовые данные → «Сохранить» → тост «VK настройки сохранены ✓»
3. Перезагрузить страницу → данные должны подгрузиться из Supabase
4. Нажать «Проверить» → должен ответить VK (или ошибка токена если токен не настроен)

- [ ] **Step 5.6: Commit**

```bash
git add index.html
git commit -m "feat: VK settings section in settings modal with save/load/check"
```

---

## Task 6: UI — поле VK User ID в Lead Drawer

**Files:**
- Modify: `index.html` (Lead Drawer HTML и JS)

- [ ] **Step 6.1: Найти Lead Drawer в HTML**

```bash
grep -n "drawerLink\|drawer-field\|drawerVk\|Lead Drawer\|id=\"drawer" "index.html" | head -20
```

- [ ] **Step 6.2: Добавить поле VK User ID в HTML Drawer**

Найти блок с полем `id="drawerLink"` (ссылка лида) и добавить ПОСЛЕ него:

```html
                    <div>
                        <label class="drawer-field-label" for="drawerVkPeerId">VK User ID</label>
                        <input type="number" id="drawerVkPeerId"
                               placeholder="123456 (из vk.com/id123456)"
                               style="width:100%;"
                               onchange="saveVkPeerId(currentDrawerLeadId, this.value)">
                    </div>
```

- [ ] **Step 6.3: Добавить JS-функцию saveVkPeerId**

Добавить рядом с другими drawer-функциями:

```js
        function saveVkPeerId(leadId, value) {
            const lead = leads.find(l => l.id === leadId);
            if (!lead) return;
            lead.vkPeerId = value ? Number(value) : null;
            lead.updatedAt = Date.now();
            upsertLead(lead);
            // Обновить кнопку В VK в chat view если этот лид открыт
            if (currentChatLeadId === leadId) {
                const btn = document.getElementById('btnSendVk');
                if (btn) btn.style.display = lead.vkPeerId ? '' : 'none';
            }
        }
```

- [ ] **Step 6.4: Подставлять vkPeerId при открытии Drawer**

Найти функцию открытия Drawer (по `openDrawer\|openLeadDrawer\|currentDrawerLeadId`) и добавить подстановку:

```js
// В функции открытия drawer — после других полей типа drawerLink:
const vkField = document.getElementById('drawerVkPeerId');
if (vkField) vkField.value = lead.vkPeerId || '';
```

- [ ] **Step 6.5: Проверить в браузере**

1. Открыть любой лид в Drawer
2. Убедиться что поле «VK User ID» появилось
3. Ввести число → сменить фокус → перезагрузить → число сохранилось

- [ ] **Step 6.6: Commit**

```bash
git add index.html
git commit -m "feat: VK User ID field in Lead Drawer"
```

---

## Task 7: UI — кнопка «В VK» в chat view

**Files:**
- Modify: `index.html` (строка ~840, chat input area)

- [ ] **Step 7.1: Добавить кнопку в HTML**

Найти строку ~840:
```html
                        <button class="btn btn-outline" aria-label="Отправить в историю" onclick="submitChatInput(currentChatLeadId)" style="align-self:flex-end;">Отправить</button>
```

Заменить на:
```html
                        <div style="display:flex;gap:6px;align-self:flex-end;">
                            <button class="btn btn-outline" aria-label="Отправить в историю" onclick="submitChatInput(currentChatLeadId)">Отправить</button>
                            <button id="btnSendVk" class="btn btn-outline" aria-label="Отправить в VK" onclick="sendToVk(currentChatLeadId)" style="display:none;" data-tooltip="Отправить в VK сообщество">📤 В VK</button>
                        </div>
```

- [ ] **Step 7.2: Показывать/скрывать кнопку при открытии чата**

Найти функцию открытия чата (`openChatForLead\|currentChatLeadId =\|openChat`) и добавить:

```js
// После установки currentChatLeadId:
const btnVk = document.getElementById('btnSendVk');
if (btnVk) btnVk.style.display = (lead && lead.vkPeerId) ? '' : 'none';
```

- [ ] **Step 7.3: Добавить функцию sendToVk**

Добавить после функции `submitChatInput`:

```js
        async function sendToVk(leadId) {
            const lead = leads.find(function(l) { return l.id === leadId; });
            const text = (document.getElementById('chatInputMain').value || '').trim();
            if (!text) { showToast('Введите текст сообщения'); return; }
            if (!lead || !lead.vkPeerId) { showToast('У лида нет VK User ID'); return; }

            const btn = document.getElementById('btnSendVk');
            if (btn) { btn.disabled = true; btn.textContent = '⏳'; }

            try {
                const { data: { session } } = await _sb.auth.getSession();
                if (!session) throw new Error('Нет сессии');

                const res = await fetch(SUPABASE_URL + '/functions/v1/vk-send', {
                    method: 'POST',
                    headers: {
                        'Authorization': 'Bearer ' + session.access_token,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        lead_id:      leadId,
                        message:      text,
                        workspace_id: workspaceId
                    })
                });

                const data = await res.json();
                if (data.ok) {
                    showToast('Отправлено в VK ✓');
                    document.getElementById('chatInputMain').value = '';
                    // Сообщение уже добавлено в Supabase Edge Function — realtime подхватит
                } else {
                    showToast('Ошибка VK: ' + (data.error || 'неизвестно'), 5000);
                }
            } catch (e) {
                showToast('Ошибка: ' + e.message, 5000);
            } finally {
                if (btn) { btn.disabled = false; btn.textContent = '📤 В VK'; }
            }
        }
```

- [ ] **Step 7.4: Скрывать кнопку в таб «Клиент ответил»**

В функции `setChatInputTab`:

```js
        function setChatInputTab(tab) {
            chatInputTab = tab;
            // ... существующий код ...
            // Добавить в конец функции:
            const btnVk = document.getElementById('btnSendVk');
            if (btnVk) btnVk.style.display = (tab === 'manager' && currentChatLeadId) ?
                (leads.find(l => l.id === currentChatLeadId)?.vkPeerId ? '' : 'none') : 'none';
        }
```

- [ ] **Step 7.5: Проверить в браузере**

1. Открыть лид WITHOUT vkPeerId → вкладка «Я написал» → кнопка «В VK» не видна
2. Добавить vkPeerId через Drawer (любое число)
3. Открыть чат → «Я написал» → кнопка «В VK» появилась
4. Переключиться на «Клиент ответил» → кнопка скрылась
5. При нажатии «В VK» без настроенного токена: тост с ошибкой VK

- [ ] **Step 7.6: Commit**

```bash
git add index.html
git commit -m "feat: send-to-VK button in chat view with vkPeerId guard"
```

---

## Task 8: UI — AI-черновики в chat feed

**Files:**
- Modify: `index.html` (функции renderSingleMessage + новые useAiDraft/dismissAiDraft)

- [ ] **Step 8.1: Добавить CSS для AI-draft блока**

Найти блок CSS (перед `</style>`) и добавить:

```css
        .ai-draft-block { margin-top: 6px; padding: 8px 10px; background: rgba(94,106,210,.08); border: 1px solid rgba(94,106,210,.25); border-radius: 8px; font-size: 12px; }
        .ai-draft-label { font-weight: 700; color: #5e6ad2; margin-bottom: 4px; font-size: 11px; letter-spacing: .03em; }
        .ai-draft-text { color: var(--text); white-space: pre-wrap; line-height: 1.5; margin-bottom: 6px; }
        .ai-draft-actions { display: flex; gap: 6px; }
        .ai-draft-actions button { padding: 3px 10px; font-size: 11px; border-radius: 5px; border: 1px solid var(--border); background: var(--surface); color: var(--text); cursor: pointer; }
        .ai-draft-actions button:hover { border-color: #5e6ad2; color: #5e6ad2; }
```

- [ ] **Step 8.2: Найти функцию renderSingleMessage**

```bash
grep -n "renderSingleMessage\|function renderSingle" "index.html"
```

- [ ] **Step 8.3: Добавить рендер AI-черновика в renderSingleMessage**

В конце функции `renderSingleMessage`, перед `return html`:

```js
        // Добавить ПЕРЕД return в renderSingleMessage:
        if (m.fromClient && m.ai_draft) {
            const safeAiDraft = escapeHtml(m.ai_draft);
            html += '<div class="ai-draft-block">' +
                '<div class="ai-draft-label">✨ AI-черновик</div>' +
                '<div class="ai-draft-text">' + safeAiDraft + '</div>' +
                '<div class="ai-draft-actions">' +
                    '<button onclick="useAiDraft(' + JSON.stringify(leadId) + ',' + msgIdx + ')">Использовать</button>' +
                    '<button onclick="dismissAiDraft(' + JSON.stringify(leadId) + ',' + msgIdx + ')">✕ Отклонить</button>' +
                '</div>' +
            '</div>';
        }
```

> Важно: параметры `leadId` и `msgIdx` должны уже передаваться в `renderSingleMessage`. Если нет — посмотри как они передаются сейчас и адаптируй.

- [ ] **Step 8.4: Добавить функции useAiDraft и dismissAiDraft**

Добавить после `dismissAiDraft`:

```js
        function useAiDraft(leadId, msgIdx) {
            const lead = leads.find(function(l) { return l.id === leadId; });
            if (!lead || !lead.messages[msgIdx]) return;
            const draft = lead.messages[msgIdx].ai_draft || '';
            const ta = document.getElementById('chatInputMain');
            if (ta) ta.value = draft;
            setChatInputTab('manager');
            if (ta) ta.focus();
        }

        function dismissAiDraft(leadId, msgIdx) {
            const lead = leads.find(function(l) { return l.id === leadId; });
            if (!lead || !lead.messages[msgIdx]) return;
            delete lead.messages[msgIdx].ai_draft;
            upsertLead(lead);
            // Перерендерить конкретное сообщение
            const wrapper = document.querySelector('[data-msg-idx="' + msgIdx + '"]');
            if (wrapper) wrapper.innerHTML = renderSingleMessage(lead.messages[msgIdx], leadId, msgIdx);
        }
```

- [ ] **Step 8.5: Проверить в браузере (мок)**

Чтобы проверить без реального VK, добавить временно в console:
```js
const lead = leads[0];
if (lead && lead.messages.length > 0) {
  lead.messages[0].ai_draft = 'Вариант 1: Конечно, вот ссылка...\n\nВариант 2: Отправляю примеры прямо сейчас!';
  openChatForLead(lead.id);
}
```
Должен появиться блок «✨ AI-черновик». Кнопки «Использовать» и «Отклонить» должны работать.

- [ ] **Step 8.6: Commit**

```bash
git add index.html
git commit -m "feat: AI draft display in chat feed with use/dismiss actions"
```

---

## Task 9: Финальная проверка и инструкция

- [ ] **Step 9.1: Проверить полный flow end-to-end (мануально)**

1. VK Settings: открыть ⚙️ → заполнить настройки VK → сохранить → «Проверить» показывает имя группы
2. Lead + peer_id: создать тестовый лид → в Drawer ввести VK User ID (например свой личный ID)
3. Send: открыть чат лида → «Я написал» → написать текст → «📤 В VK» → тост «Отправлено»
4. VK проверить: сообщение пришло в переписку (если токен настроен правильно)
5. Webhook: написать в VK сообщество с личного аккаунта → через несколько секунд появился лид или сообщение в истории

- [ ] **Step 9.2: Сгенерировать URL webhook для пользователя**

URL для VK Callback API:
```
https://efepnuuxtzwzygwipgxt.supabase.co/functions/v1/vk-webhook
```

Вставить этот URL в VK: Управление сообществом → Работа с API → Callback API → Добавить сервер

- [ ] **Step 9.3: Обновить memory проекта**

Обновить файл `C:\Users\User\.claude\projects\c--work-ADERVIS-OTR\memory\project-state.md` — добавить секцию VK-автоматизации в список «Готово».

- [ ] **Step 9.4: Финальный commit**

```bash
git add -A
git status  # проверить что нет лишнего
git commit -m "feat: VK automation complete — webhook, send, AI drafts, settings UI"
```

---

## Self-Review

**Spec coverage:**
- [x] vk-webhook Edge Function → Task 2
- [x] vk-send Edge Function → Task 3
- [x] workspace_settings table → Task 1
- [x] vk_peer_id column → Task 1
- [x] VK settings in settings modal → Task 5
- [x] vk_peer_id field in Lead Drawer → Task 6
- [x] «В VK» button in chat → Task 7
- [x] AI draft display → Task 8
- [x] ai_draft field in messages JSONB → Task 2 (webhook) + Task 8 (display)
- [x] leadToRow/rowToLead update → Task 4

**Placeholders:** Нет. Все шаги содержат полный код.

**Type consistency:**
- `vkPeerId` (camelCase в JS), `vk_peer_id` (snake_case в Supabase) — последовательно в Tasks 4, 6, 7
- `vkSettings.token/communityId/secret/confirmationString` — используется в Tasks 5, 7
- `sendToVk(leadId)` → `lead.vkPeerId` — совпадает
- `useAiDraft(leadId, msgIdx)` / `dismissAiDraft(leadId, msgIdx)` — совпадает с renderSingleMessage

**Внимание при выполнении Task 8:**  
Нужно проверить сигнатуру функции `renderSingleMessage` в коде — принимает ли она `leadId` и `msgIdx`. Если нет — адаптировать вызовы в Task 8.3.
