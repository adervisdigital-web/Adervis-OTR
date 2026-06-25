# VK Personal Accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Подключить личные страницы ВКонтакте через OAuth чтобы менеджер мог писать лидам первым прямо из OTR.

**Architecture:** OAuth popup flow через `oauth.vk.com` → новая Edge Function `vk-oauth` обменивает code на token и сохраняет в таблицу `vk_accounts` → обновлённый `vk-send` принимает `sender_account_id` и берёт нужный токен из БД → UI в Settings + селектор аккаунта в чате.

**Tech Stack:** Vanilla JS, Supabase (DB + Edge Functions), Deno/TypeScript, VK API v5.199. Тесты — ручные в браузере (нет тестового фреймворка).

---

## Затронутые файлы

| Файл | Действие | Что меняем |
|------|----------|-----------|
| `index.html` | Modify | OAuth popup handler при загрузке, Settings UI, Chat selector |
| `supabase/functions/vk-oauth/index.ts` | Create | Обмен OAuth code → token, сохранение в vk_accounts |
| `supabase/functions/vk-send/index.ts` | Modify | Принять sender_account_id, выбрать нужный токен |
| Supabase SQL (через Dashboard) | Run | Создать таблицу vk_accounts с RLS |

---

## Task 1: Создать таблицу vk_accounts в Supabase

**Files:**
- Run SQL in: Supabase Dashboard → SQL Editor

- [ ] **Step 1: Выполнить SQL миграцию**

Открыть Supabase Dashboard → SQL Editor → New Query → вставить и выполнить:

```sql
-- Таблица для хранения VK аккаунтов (группа + личные страницы)
create table if not exists vk_accounts (
  id            uuid        primary key default gen_random_uuid(),
  workspace_id  text        not null,
  account_type  text        not null check (account_type in ('personal', 'community')),
  vk_id         bigint      not null,
  access_token  text        not null,
  display_name  text        not null default '',
  photo_url     text        not null default '',
  is_active     boolean     not null default true,
  created_at    timestamptz not null default now(),
  unique (workspace_id, vk_id)
);

-- RLS: только члены своего workspace видят свои аккаунты
alter table vk_accounts enable row level security;

create policy "vk_accounts_workspace_policy" on vk_accounts
  using (
    workspace_id = (
      select workspace_id from workspace_members
      where user_id = auth.uid()
      limit 1
    )
  );

-- Service role может всё (для Edge Functions)
create policy "vk_accounts_service_policy" on vk_accounts
  to service_role
  using (true)
  with check (true);
```

Ожидаемый результат: "Success. No rows returned."

- [ ] **Step 2: Проверить таблицу**

В Supabase Dashboard → Table Editor — убедиться что таблица `vk_accounts` появилась с колонками: id, workspace_id, account_type, vk_id, access_token, display_name, photo_url, is_active, created_at.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(vk): SQL migration — таблица vk_accounts с RLS"
```

---

## Task 2: Edge Function `vk-oauth`

**Files:**
- Create: `supabase/functions/vk-oauth/index.ts`

Функция принимает OAuth code от браузера, обменивает его на токен через VK API, получает имя и фото пользователя, сохраняет в `vk_accounts`.

- [ ] **Step 1: Создать файл Edge Function**

Создать файл `supabase/functions/vk-oauth/index.ts`:

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!
const ANON_KEY      = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VK_APP_ID     = '54652870'
const VK_SECRET     = Deno.env.get('VK_CLIENT_SECRET')!
const REDIRECT_URI  = 'https://otr.adervis.ru'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface OAuthBody {
  code:         string
  workspace_id: string
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: CORS })
  if (req.method !== 'POST') return json({ ok: false, error: 'method not allowed' }, 405)

  // Верифицировать JWT пользователя
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace('Bearer ', '').trim()
  if (!token) return json({ ok: false, error: 'unauthorized' }, 401)

  const sbUser = createClient(SUPABASE_URL, ANON_KEY)
  const { data: { user }, error: authErr } = await sbUser.auth.getUser(token)
  if (authErr || !user) return json({ ok: false, error: 'unauthorized' }, 401)

  let body: OAuthBody
  try { body = await req.json() }
  catch { return json({ ok: false, error: 'bad json' }, 400) }

  const { code, workspace_id } = body
  if (!code || !workspace_id) return json({ ok: false, error: 'missing fields' }, 400)

  // Шаг 1: обменять code на access_token через VK
  const tokenUrl = 'https://oauth.vk.com/access_token?' + new URLSearchParams({
    client_id:     VK_APP_ID,
    client_secret: VK_SECRET,
    redirect_uri:  REDIRECT_URI,
    code:          code,
  })

  let vkToken: string
  let vkUserId: number
  try {
    const res  = await fetch(tokenUrl)
    const data = await res.json() as { access_token?: string; user_id?: number; error?: string; error_description?: string }
    if (!data.access_token || !data.user_id) {
      return json({ ok: false, error: data.error_description ?? data.error ?? 'VK token error' }, 400)
    }
    vkToken  = data.access_token
    vkUserId = data.user_id
  } catch (e) {
    return json({ ok: false, error: 'VK network error: ' + String(e) }, 502)
  }

  // Шаг 2: получить имя и фото пользователя
  let displayName = 'VK пользователь'
  let photoUrl    = ''
  try {
    const userRes  = await fetch(
      'https://api.vk.com/method/users.get?' + new URLSearchParams({
        user_ids:     String(vkUserId),
        fields:       'photo_100',
        access_token: vkToken,
        v:            '5.199',
      })
    )
    const userData = await userRes.json() as { response?: Array<{ first_name: string; last_name: string; photo_100?: string }> }
    if (userData.response?.[0]) {
      const u = userData.response[0]
      displayName = (u.first_name + ' ' + u.last_name).trim()
      photoUrl    = u.photo_100 ?? ''
    }
  } catch {
    // Non-fatal: имя и фото не критичны
  }

  // Шаг 3: сохранить в vk_accounts (upsert)
  const sb = createClient(SUPABASE_URL, SERVICE_KEY)
  const { data: account, error: dbErr } = await sb
    .from('vk_accounts')
    .upsert({
      workspace_id,
      account_type: 'personal',
      vk_id:        vkUserId,
      access_token: vkToken,
      display_name: displayName,
      photo_url:    photoUrl,
      is_active:    true,
    }, { onConflict: 'workspace_id,vk_id' })
    .select('id, display_name, photo_url, vk_id')
    .single()

  if (dbErr) return json({ ok: false, error: 'DB error: ' + dbErr.message }, 500)

  return json({ ok: true, account })
})

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}
```

- [ ] **Step 2: Задеплоить Edge Function**

```bash
cd "c:/work/ADERVIS OTR"
npx supabase functions deploy vk-oauth --no-verify-jwt
```

Ожидаемый вывод: `Deployed Function vk-oauth`

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/vk-oauth/index.ts
git commit -m "feat(vk): Edge Function vk-oauth — OAuth code exchange + save to vk_accounts"
```

---

## Task 3: Обновить `vk-send` — поддержка personal account token

**Files:**
- Modify: `supabase/functions/vk-send/index.ts`

Добавить необязательный параметр `sender_account_id` (UUID из vk_accounts). Если передан → брать токен из `vk_accounts`, иначе использовать community token из `workspace_settings` (обратная совместимость).

- [ ] **Step 1: Обновить interface и логику токена**

Найти в `supabase/functions/vk-send/index.ts` строку:
```typescript
interface SendBody {
  lead_id:      string
  message:      string
  workspace_id: string
}
```

Заменить на:
```typescript
interface SendBody {
  lead_id:           string
  message:           string
  workspace_id:      string
  sender_account_id?: string   // UUID из vk_accounts; если не передан — используется community token
}
```

- [ ] **Step 2: Заменить блок получения токена**

Найти блок (строки ~54-63):
```typescript
  // Получить настройки VK
  const { data: settings } = await sb
    .from('workspace_settings')
    .select('vk_token, vk_community_id')
    .eq('workspace_id', workspace_id)
    .maybeSingle()

  if (!settings?.vk_token) {
    return json({ ok: false, error: 'VK token not configured' }, 400)
  }
```

Заменить на:
```typescript
  // Получить токен: из личного аккаунта или community token
  let accessToken: string

  if (body.sender_account_id) {
    const { data: account } = await sb
      .from('vk_accounts')
      .select('access_token')
      .eq('id', body.sender_account_id)
      .eq('workspace_id', workspace_id)
      .eq('is_active', true)
      .maybeSingle()
    if (!account?.access_token) {
      return json({ ok: false, error: 'VK account not found or inactive' }, 400)
    }
    accessToken = account.access_token
  } else {
    const { data: settings } = await sb
      .from('workspace_settings')
      .select('vk_token')
      .eq('workspace_id', workspace_id)
      .maybeSingle()
    if (!settings?.vk_token) {
      return json({ ok: false, error: 'VK token not configured' }, 400)
    }
    accessToken = settings.vk_token
  }
```

- [ ] **Step 3: Заменить `settings.vk_token` на `accessToken` в vkParams**

Найти строку:
```typescript
    access_token: settings.vk_token
```
Заменить на:
```typescript
    access_token: accessToken
```

- [ ] **Step 4: Задеплоить обновлённый vk-send**

```bash
npx supabase functions deploy vk-send --no-verify-jwt
```

Ожидаемый вывод: `Deployed Function vk-send`

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/vk-send/index.ts
git commit -m "feat(vk): vk-send принимает sender_account_id для отправки с личной страницы"
```

---

## Task 4: OAuth popup handler в `index.html`

**Files:**
- Modify: `index.html` — добавить обработчик VK callback при загрузке страницы

Когда VK редиректит после авторизации, URL будет: `https://otr.adervis.ru?code=AUTH_CODE`. Если страница открыта в popup (есть `window.opener`) — вызываем `vk-oauth`, затем `postMessage` в parent и закрываемся.

- [ ] **Step 1: Найти место вставки — init функция при загрузке**

Найти в `index.html` строку (первая инициализация на старте, ~строка 6800+):
```javascript
        document.addEventListener('DOMContentLoaded', async function() {
```
или аналогичный блок запуска приложения. Найти через:

```bash
grep -n "DOMContentLoaded\|window.onload\|initApp\|onAuthStateChange" index.html | head -20
```

- [ ] **Step 2: Добавить VK OAuth callback обработчик**

В самом начале блока `DOMContentLoaded` (или сразу в `<script>` до остального кода) вставить:

```javascript
        // ── VK OAuth Popup Callback ──────────────────────────────────────────
        // Если эта страница открыта как popup после VK OAuth redirect,
        // перехватываем code и отправляем в Edge Function
        (async function handleVkOAuthCallback() {
            const params = new URLSearchParams(window.location.search);
            const code   = params.get('code');
            if (!code || !window.opener) return; // не callback, обычная загрузка

            // Убрать code из URL чтобы не показывать пользователю
            history.replaceState({}, '', window.location.pathname);

            // Сообщить opener что начали обработку
            window.opener.postMessage({ type: 'vk-oauth-loading' }, '*');

            try {
                // Нужна сессия — взять из localStorage (Supabase сохраняет туда)
                const sbTemp = window._sb || supabase.createClient(
                    'https://efepnuuxtzwzygwipgxt.supabase.co',
                    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVmZXBudXV4dHp3enlnd2lwZ3h0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTg5NzMxMzcsImV4cCI6MjAzNDU0OTEzN30.hzpnBBdC1o7JY43iyMYQxPaQTbzCk2OQkK9CXS07JNI'
                );
                const { data: { session } } = await sbTemp.auth.getSession();
                if (!session) {
                    window.opener.postMessage({ type: 'vk-oauth-error', error: 'Нет сессии — войди в OTR' }, '*');
                    window.close();
                    return;
                }

                // Получить workspace_id из localStorage
                const wsId = localStorage.getItem('otr_workspace_id') || '';

                const res  = await fetch('https://efepnuuxtzwzygwipgxt.supabase.co/functions/v1/vk-oauth', {
                    method:  'POST',
                    headers: {
                        'Authorization': 'Bearer ' + session.access_token,
                        'Content-Type':  'application/json',
                    },
                    body: JSON.stringify({ code, workspace_id: wsId }),
                });
                const data = await res.json();
                if (data.ok) {
                    window.opener.postMessage({ type: 'vk-oauth-success', account: data.account }, '*');
                } else {
                    window.opener.postMessage({ type: 'vk-oauth-error', error: data.error }, '*');
                }
            } catch (e) {
                window.opener.postMessage({ type: 'vk-oauth-error', error: String(e) }, '*');
            }
            window.close();
        })();
        // ────────────────────────────────────────────────────────────────────
```

> **Важно:** вставить это в самое начало `<script>`, до инициализации Supabase клиента (`_sb`). Поэтому используем отдельный экземпляр `sbTemp`. Hardcoded URL и ANON_KEY допустимы — они публичные.

- [ ] **Step 3: Найти `workspaceId` и убедиться что он сохраняется в localStorage**

Найти в index.html где устанавливается `workspaceId` (переменная):
```bash
grep -n "workspaceId\s*=" index.html | head -10
```
Найти строку вида:
```javascript
workspaceId = data.workspace_id;
```
После неё добавить:
```javascript
localStorage.setItem('otr_workspace_id', workspaceId);
```

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(vk): OAuth popup callback handler — перехват ?code= и отправка в vk-oauth"
```

---

## Task 5: Settings UI — секция «VK Личные страницы»

**Files:**
- Modify: `index.html` — HTML + JS

Добавить секцию под `#vkSection` в Settings Modal, и функции `loadVkAccounts()`, `renderVkAccountsSection()`, `connectVkPersonalPage()`, `disconnectVkAccount()`.

- [ ] **Step 1: Добавить HTML секцию в Settings Modal**

Найти строку (конец `#vkSection`, ~строка 1884):
```html
            </div>
            <div id="playbookSection" style="margin-top:15px;border-top:1px solid var(--border);padding-top:15px;">
```

Вставить ПЕРЕД ней новую секцию:
```html
            <div id="vkPersonalSection" style="margin-top:15px;border-top:1px solid var(--border);padding-top:15px;">
                <div style="font-weight:700;margin-bottom:10px;font-size:13px;">👤 VK Личные страницы</div>
                <div style="font-size:11px;color:var(--muted);margin-bottom:10px;">Подключи свою личную страницу ВК чтобы писать лидам первым прямо из OTR</div>
                <div id="vkAccountsList" style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px;" aria-label="Подключённые VK аккаунты" role="list"></div>
                <button class="btn btn-outline" onclick="connectVkPersonalPage()" style="width:100%;" aria-label="Подключить личную страницу ВКонтакте">
                    🔵 Подключить страницу ВКонтакте
                </button>
                <div id="vkOAuthStatus" style="font-size:11px;color:var(--muted);min-height:16px;margin-top:6px;" aria-live="polite"></div>
            </div>
```

- [ ] **Step 2: Добавить JS функции**

В блоке `<script>` найти область рядом с `checkVkConnection()` (~строка 5575) и добавить после неё:

```javascript
        // ── VK Personal Accounts ─────────────────────────────────────────────

        var _vkAccounts = []; // кэш подключённых аккаунтов

        async function loadVkAccounts() {
            if (!workspaceId) return;
            const { data } = await _sb
                .from('vk_accounts')
                .select('id, account_type, vk_id, display_name, photo_url, is_active')
                .eq('workspace_id', workspaceId)
                .eq('is_active', true)
                .order('created_at');
            _vkAccounts = data || [];
            return _vkAccounts;
        }

        function renderVkAccountsSection() {
            const list = document.getElementById('vkAccountsList');
            if (!list) return;
            if (!_vkAccounts.length) {
                list.innerHTML = '<div style="font-size:12px;color:var(--muted);padding:4px 0;">Нет подключённых аккаунтов</div>';
                return;
            }
            list.innerHTML = _vkAccounts.map(function(acc) {
                const icon = acc.account_type === 'community' ? '🏢' : '👤';
                const photo = acc.photo_url
                    ? '<img src="' + escapeHtml(acc.photo_url) + '" alt="" style="width:24px;height:24px;border-radius:50%;object-fit:cover;flex-shrink:0;" aria-hidden="true">'
                    : '<span aria-hidden="true" style="width:24px;height:24px;border-radius:50%;background:var(--bg2);display:inline-flex;align-items:center;justify-content:center;font-size:12px;">' + icon + '</span>';
                return '<div role="listitem" style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:var(--bg2);border:1px solid var(--line);border-radius:6px;">' +
                    photo +
                    '<span style="flex:1;font-size:12px;">' + escapeHtml(acc.display_name) + '</span>' +
                    '<span style="font-size:10px;color:var(--success);flex-shrink:0;">✓ подключён</span>' +
                    '<button class="btn btn-outline" style="padding:2px 8px;font-size:11px;flex-shrink:0;" ' +
                        'onclick="disconnectVkAccount(\'' + escapeHtml(acc.id) + '\')" ' +
                        'aria-label="Отключить аккаунт ' + escapeHtml(acc.display_name) + '">Отключить</button>' +
                '</div>';
            }).join('');
            renderVkSenderSelect(); // обновить селектор в чате
        }

        function connectVkPersonalPage() {
            const statusEl = document.getElementById('vkOAuthStatus');
            const oauthUrl = 'https://oauth.vk.com/authorize?' + new URLSearchParams({
                client_id:     '54652870',
                scope:         'messages,offline',
                redirect_uri:  'https://otr.adervis.ru',
                response_type: 'code',
                display:       'popup',
            });
            const popup = window.open(oauthUrl, 'vk_auth', 'width=620,height=520,top=100,left=200,scrollbars=yes');
            if (!popup) {
                showToast('Разрешите всплывающие окна для otr.adervis.ru', 4000);
                return;
            }
            if (statusEl) statusEl.textContent = 'Ожидаем авторизацию ВКонтакте...';

            function onMessage(e) {
                if (!e.data || !e.data.type || !e.data.type.startsWith('vk-oauth')) return;
                window.removeEventListener('message', onMessage);

                if (e.data.type === 'vk-oauth-success') {
                    const acc = e.data.account;
                    showToast('Страница подключена: ' + (acc.display_name || 'ВК'));
                    if (statusEl) statusEl.textContent = '';
                    loadVkAccounts().then(renderVkAccountsSection);
                } else if (e.data.type === 'vk-oauth-error') {
                    showToast('Ошибка: ' + (e.data.error || 'неизвестно'), 5000);
                    if (statusEl) statusEl.textContent = 'Ошибка авторизации: ' + (e.data.error || '');
                }
            }
            window.addEventListener('message', onMessage);
        }

        async function disconnectVkAccount(accountId) {
            if (!confirm('Отключить этот аккаунт ВКонтакте?')) return;
            const { error } = await _sb
                .from('vk_accounts')
                .update({ is_active: false })
                .eq('id', accountId)
                .eq('workspace_id', workspaceId);
            if (error) { showToast('Ошибка: ' + error.message, 4000); return; }
            showToast('Аккаунт отключён');
            await loadVkAccounts();
            renderVkAccountsSection();
        }

        // ─────────────────────────────────────────────────────────────────────
```

- [ ] **Step 3: Вызывать `loadVkAccounts` при открытии Settings**

Найти функцию `openSettingsModal()` (~строка 6122):
```javascript
        function openSettingsModal() {
            _modalFocusTriggers['settingsModal'] = document.activeElement;
            document.getElementById('settingsModal').style.display = 'flex';
```

После строки `document.getElementById('settingsModal').style.display = 'flex';` добавить:
```javascript
            loadVkAccounts().then(renderVkAccountsSection);
```

- [ ] **Step 4: Проверить в браузере**

1. Открыть OTR → Настройки
2. Убедиться что появилась секция «VK Личные страницы» с кнопкой «Подключить»
3. Нажать кнопку → должен открыться popup VK
4. Авторизоваться → popup закрывается → аккаунт появляется в списке

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat(vk): Settings — секция VK личные страницы + OAuth flow + список аккаунтов"
```

---

## Task 6: Chat UI — селектор аккаунта отправки

**Files:**
- Modify: `index.html` — HTML + JS

Когда лид имеет `vkPeerId`, показывать под кнопкой «Отправить в VK» компактный dropdown: от какого аккаунта отправить.

- [ ] **Step 1: Добавить HTML для селектора**

Найти в `index.html` кнопку `#btnSendVk` (~строка 1685):
```html
                            <button id="btnSendVk" class="btn btn-primary" aria-label="Отправить в VK" onclick="sendToVk(currentChatLeadId)" style="display:none;" data-tooltip="Отправить сообщение в VK">📤 Отправить в VK</button>
```

После неё добавить (НЕ заменять):
```html
                        <div id="vkSenderRow" style="display:none;padding:4px 14px 2px;display:none;">
                            <label for="vkSenderSelect" style="font-size:10px;color:var(--muted);margin-right:4px;">от:</label>
                            <select id="vkSenderSelect" style="font-size:11px;background:var(--bg2);color:var(--text);border:1px solid var(--line);border-radius:4px;padding:2px 6px;" aria-label="Аккаунт отправки в VK" onchange="saveVkSenderChoice(this.value)"></select>
                        </div>
```

- [ ] **Step 2: Добавить функции `renderVkSenderSelect` и `saveVkSenderChoice`**

В JS, рядом с `updateSendButtons()` (~строка 4317), добавить:

```javascript
        function renderVkSenderSelect() {
            const sel = document.getElementById('vkSenderSelect');
            const row = document.getElementById('vkSenderRow');
            if (!sel || !row) return;
            if (!_vkAccounts.length) { row.style.display = 'none'; return; }

            const saved = localStorage.getItem('otr_vk_sender');
            sel.innerHTML = _vkAccounts.map(function(acc) {
                const icon = acc.account_type === 'community' ? '🏢' : '👤';
                const label = icon + ' ' + acc.display_name;
                return '<option value="' + escapeHtml(acc.id) + '"' +
                    (acc.id === saved ? ' selected' : '') +
                    '>' + escapeHtml(label) + '</option>';
            }).join('');
        }

        function saveVkSenderChoice(accountId) {
            localStorage.setItem('otr_vk_sender', accountId);
        }

        function getSelectedVkAccountId() {
            const saved = localStorage.getItem('otr_vk_sender');
            if (saved && _vkAccounts.find(function(a) { return a.id === saved; })) return saved;
            return _vkAccounts[0]?.id || null;
        }
```

- [ ] **Step 3: Обновить `updateSendButtons()` чтобы показывала/скрывала vkSenderRow**

Найти функцию `updateSendButtons(lead)` (~строка 4317):
```javascript
        function updateSendButtons(lead) {
            const btnHistory     = document.getElementById('btnSendHistory');
            const btnVk          = document.getElementById('btnSendVk');
            const btnHistoryOnly = document.getElementById('btnSendHistoryOnly');
            if (!btnHistory || !btnVk || !btnHistoryOnly) return;
            const isVkLead = lead && lead.vkPeerId && chatInputTab === 'manager';
            btnHistory.style.display     = isVkLead ? 'none' : '';
            btnVk.style.display          = isVkLead ? ''     : 'none';
            btnHistoryOnly.style.display = isVkLead ? ''     : 'none';
        }
```

Заменить на:
```javascript
        function updateSendButtons(lead) {
            const btnHistory     = document.getElementById('btnSendHistory');
            const btnVk          = document.getElementById('btnSendVk');
            const btnHistoryOnly = document.getElementById('btnSendHistoryOnly');
            const senderRow      = document.getElementById('vkSenderRow');
            if (!btnHistory || !btnVk || !btnHistoryOnly) return;
            const isVkLead = lead && lead.vkPeerId && chatInputTab === 'manager';
            btnHistory.style.display     = isVkLead ? 'none' : '';
            btnVk.style.display          = isVkLead ? ''     : 'none';
            btnHistoryOnly.style.display = isVkLead ? ''     : 'none';
            if (senderRow) senderRow.style.display = (isVkLead && _vkAccounts.length > 1) ? '' : 'none';
        }
```

- [ ] **Step 4: Обновить `sendToVk()` — передавать `sender_account_id`**

Найти в `sendToVk()` (~строка 4388) тело JSON:
```javascript
                    body: JSON.stringify({
                        lead_id:      leadId,
                        message:      text,
                        workspace_id: workspaceId
                    })
```

Заменить на:
```javascript
                    body: JSON.stringify({
                        lead_id:           leadId,
                        message:           text,
                        workspace_id:      workspaceId,
                        sender_account_id: getSelectedVkAccountId() || undefined,
                    })
```

- [ ] **Step 5: Загружать аккаунты при старте приложения**

Найти место где приложение инициализируется после логина (после `onAuthStateChange` → успешная сессия). Добавить вызов `loadVkAccounts()` рядом с другими инициализациями:

```javascript
loadVkAccounts(); // загружает аккаунты для VK selector в чате
```

- [ ] **Step 6: Проверить в браузере**

Сценарий A — один аккаунт:
1. Открыть чат лида с vkPeerId → переключить таб «Я написал» → появляется кнопка «📤 Отправить в VK»
2. Selector `vkSenderRow` скрыт (один аккаунт — выбирать не нужно)
3. Нажать кнопку → сообщение уходит от личной страницы (проверить в VK)

Сценарий B — два аккаунта:
1. Подключить второй аккаунт в Settings
2. Открыть чат VK-лида → появляется dropdown «от: 👤 Имя ▼»
3. Выбрать другой аккаунт → отправить → проверить в VK с какого аккаунта пришло

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "feat(vk): Chat — селектор аккаунта отправки + передача sender_account_id в vk-send"
```

---

## Task 7: Финальная проверка и push

- [ ] **Step 1: Полный сценарий E2E**

1. Открыть OTR → Настройки → секция «VK Личные страницы»
2. Нажать «Подключить страницу ВКонтакте» → popup открылся
3. Авторизоваться в VK → аккаунт появился в списке с фото и именем
4. Открыть чат с VK-лидом → переключить на «Я написал»
5. Ввести текст → нажать «📤 Отправить в VK»
6. Проверить в VK — сообщение пришло от личной страницы
7. Лид получил сообщение → написал обратно в группу → сообщение появляется в OTR (realtime)

- [ ] **Step 2: Проверить обратную совместимость**

Лид без vkPeerId: кнопки работают как раньше (только «Отправить» в историю).
VK-лид без выбора личного аккаунта (sender_account_id = null): `vk-send` использует community token.

- [ ] **Step 3: Git push**

```bash
git push origin main
```

---

## Self-Review

### Spec coverage
- [x] Новая таблица `vk_accounts` → Task 1
- [x] OAuth flow через popup → Task 4 + 5
- [x] Edge Function `vk-oauth` → Task 2
- [x] Edge Function `vk-send` с `sender_account_id` → Task 3
- [x] Settings UI — список аккаунтов + кнопка подключения → Task 5
- [x] Отключение аккаунта → Task 5 (`disconnectVkAccount`)
- [x] Селектор аккаунта в чате → Task 6
- [x] Обратная совместимость (community token если нет sender_account_id) → Task 3

### Gaps / Notes
- `otr_workspace_id` в localStorage: нужно убедиться что workspaceId сохраняется при инициализации (Task 4 Step 3)
- Popup-blocker: браузеры могут блокировать popup если он открывается не из user gesture. Кнопка `onclick` гарантирует user gesture → всё ок.
- Токены с `offline` scope не истекают → не нужен refresh flow
