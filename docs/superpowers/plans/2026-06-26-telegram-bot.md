# Telegram Bot Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Подключить Telegram Bot к OTR — входящие сообщения от клиентов появляются в чате, менеджер отвечает прямо из OTR через Bot API.

**Architecture:** Telegram Bot получает сообщения через webhook (Edge Function `tg-webhook`) и сохраняет в Supabase leads. Менеджер отвечает через Edge Function `tg-send`, которая вызывает `sendMessage` Bot API. Для холодного аутрича (лид без `tg_chat_id` но с t.me ссылкой) — кнопка "Открыть в TG" (open+copy, аналог VK).

**Tech Stack:** Deno/TypeScript Edge Functions, Telegram Bot API, Supabase (leads + workspace_settings), Vanilla JS

---

## Файловая карта

| Файл | Действие | Ответственность |
|------|----------|-----------------|
| `supabase/migrations/20260626_telegram.sql` | Создать | Колонки `tg_bot_token` + `tg_chat_id` |
| `supabase/functions/tg-webhook/index.ts` | Создать | Принять TG update → upsert lead + message |
| `supabase/functions/tg-send/index.ts` | Создать | Отправить сообщение через Bot API |
| `index.html` (4 блока) | Изменить | Lead obj, Settings UI, Chat buttons, Realtime toast |

---

## Task 1: SQL-миграция

**Files:**
- Create: `supabase/migrations/20260626_telegram.sql`

- [ ] **Step 1: Создать файл миграции**

```sql
-- supabase/migrations/20260626_telegram.sql

-- Токен бота для workspace
ALTER TABLE workspace_settings
  ADD COLUMN IF NOT EXISTS tg_bot_token TEXT;

-- chat_id пользователя Telegram в таблице лидов
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS tg_chat_id BIGINT;

CREATE INDEX IF NOT EXISTS idx_leads_tg_chat_id
  ON leads(workspace_id, tg_chat_id)
  WHERE tg_chat_id IS NOT NULL;
```

- [ ] **Step 2: Применить миграцию**

```bash
npx supabase db push
```

Ожидаемый вывод: `Applying migration 20260626_telegram.sql... done`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260626_telegram.sql
git commit -m "feat(tg): migration — tg_bot_token + tg_chat_id"
```

---

## Task 2: Edge Function `tg-webhook`

**Files:**
- Create: `supabase/functions/tg-webhook/index.ts`

Telegram шлёт POST на webhook URL при каждом новом сообщении.
Webhook URL содержит workspace_id как query-параметр `?ws=UUID` — это и есть "секрет".

- [ ] **Step 1: Создать файл**

```typescript
// supabase/functions/tg-webhook/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

interface TgMessage {
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

  // workspace_id передаётся в query string: ?ws=UUID
  const url = new URL(req.url)
  const workspaceId = url.searchParams.get('ws')
  if (!workspaceId) {
    return new Response('missing ws param', { status: 400 })
  }

  let update: Record<string, unknown>
  try {
    update = await req.json()
  } catch {
    return new Response('bad json', { status: 400 })
  }

  const sb = createClient(SUPABASE_URL, SERVICE_KEY)

  // Проверить что workspace существует и имеет tg_bot_token
  const { data: settings } = await sb
    .from('workspace_settings')
    .select('tg_bot_token')
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (!settings?.tg_bot_token) {
    return new Response('workspace not configured', { status: 404 })
  }

  // Telegram Update — обрабатываем только message
  const msg = update.message as Record<string, unknown> | undefined
  if (!msg) {
    return new Response('ok', { status: 200 })
  }

  const chatId    = Number((msg.chat as Record<string, unknown>)?.id ?? 0)
  const text      = String(msg.text ?? '').trim()
  const tgDate    = Number(msg.date ?? 0)
  const dateMs    = tgDate ? tgDate * 1000 : Date.now()
  const from      = msg.from as Record<string, unknown> | undefined
  const firstName = String(from?.first_name ?? '')
  const username  = String(from?.username  ?? '')
  const displayName = firstName || (username ? '@' + username : `TG ${chatId}`)

  if (!chatId) return new Response('ok', { status: 200 })

  const newMessage: TgMessage = {
    id:         crypto.randomUUID(),
    text:       text || '(без текста)',
    date:       dateMs,
    fromClient: true
  }

  // Найти существующий лид по tg_chat_id
  const { data: existingLead } = await sb
    .from('leads')
    .select('id, name, messages')
    .eq('workspace_id', workspaceId)
    .eq('tg_chat_id', chatId)
    .maybeSingle()

  let leadId: string
  let leadName: string

  if (existingLead) {
    const messages = [...(existingLead.messages ?? []), newMessage]
    await sb
      .from('leads')
      .update({ messages, updated_at: Date.now() })
      .eq('id', existingLead.id)
    leadId   = existingLead.id
    leadName = existingLead.name || displayName
  } else {
    const newId = crypto.randomUUID()
    leadId   = newId
    leadName = displayName
    const tgLink = username ? `https://t.me/${username}` : `https://t.me/${chatId}`
    await sb.from('leads').insert({
      id:            newId,
      workspace_id:  workspaceId,
      name:          leadName,
      link:          tgLink,
      contact:       '',
      biz_type:      '',
      status:        0,
      updated_at:    Date.now(),
      notes:         '',
      messages:      [newMessage],
      remind_at:     null,
      attempt_count: 0,
      assigned_to:   null,
      created_by:    null,
      vk_peer_id:    null,
      tg_chat_id:    chatId
    })
  }

  // AI draft + push — fire-and-forget
  const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY') ?? ''
  if (GEMINI_KEY && text) {
    generateAndPatchDraft(
      sb, leadId, text, existingLead?.messages ?? [], newMessage.id
    ).catch(e => console.error('ai draft failed:', e))
  }

  sendPushToWorkspace(sb, workspaceId, leadName, text || '(медиа)').catch(
    e => console.error('push failed:', e)
  )

  return new Response('ok', { status: 200 })
})

async function generateAndPatchDraft(
  sb: ReturnType<typeof createClient>,
  leadId: string,
  userText: string,
  history: TgMessage[],
  newMsgId: string
): Promise<void> {
  const geminiKey = Deno.env.get('GEMINI_API_KEY') ?? ''
  if (!geminiKey || !userText.trim()) return

  const recent = history.slice(-5).map(m =>
    (m.fromClient ? 'Клиент' : 'Менеджер') + ': «' + m.text.slice(0, 200) + '»'
  ).join('\n')

  const prompt = [
    'Ты — менеджер видеопродакшена ADERVIS.',
    'Снимаем короткие видео (VK Клипы, Reels, Shorts) для заведений.',
    'Цель диалога: договориться о звонке или встрече.',
    recent ? `\nИстория:\n${recent}` : '',
    `\nСообщение клиента: «${userText}»`,
    '\nНапиши 2 варианта ответа (до 3 предложений каждый).',
    'Формат: "Вариант 1: ...\n\nВариант 2: ..."',
  ].join('\n')

  try {
    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 400, temperature: 0.7 }
        })
      }
    )
    const data = await res.json()
    const draft = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    if (!draft) return

    const { data: lead } = await sb
      .from('leads').select('messages').eq('id', leadId).maybeSingle()
    if (!lead?.messages) return

    const messages = (lead.messages as TgMessage[]).map(m =>
      m.id === newMsgId ? { ...m, ai_draft: draft } : m
    )
    await sb.from('leads').update({ messages }).eq('id', leadId)
  } catch {
    // non-fatal
  }
}

async function sendPushToWorkspace(
  sb: ReturnType<typeof createClient>,
  workspaceId: string,
  leadName: string,
  text: string
): Promise<void> {
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
  const vapidContact    = Deno.env.get('VAPID_CONTACT') ?? 'mailto:admin@adervis.ru'
  const VAPID_PUBLIC_KEY = 'BK5eS4qOz28ezTLb3ejmOUHNsF65l2LegtHO5wHUgYkFyHvhyaG1tJ43agB7941XXTVmImeMPoULFwPexgCq01I'
  if (!vapidPrivateKey) return

  const { data: subs } = await sb
    .from('push_subscriptions')
    .select('subscription')
    .eq('workspace_id', workspaceId)
  if (!subs?.length) return

  const privKey = await importVapidPrivateKey(vapidPrivateKey)
  const payload = JSON.stringify({
    title: `💬 ${leadName}`,
    body:  text.slice(0, 100) || 'Новое сообщение в Telegram',
    url:   '/'
  })

  await Promise.allSettled(
    subs.map(({ subscription }) =>
      sendWebPush(subscription as PushSub, payload, privKey, vapidContact, VAPID_PUBLIC_KEY)
    )
  )
}

interface PushSub { endpoint: string; keys: { p256dh: string; auth: string } }

// — VAPID + encryption helpers (идентичны vk-webhook) —

async function sendWebPush(sub: PushSub, payload: string, privKey: CryptoKey, contact: string, pubKey: string) {
  const ep  = new URL(sub.endpoint)
  const aud = `${ep.protocol}//${ep.host}`
  const now = Math.floor(Date.now() / 1000)
  const jwt = await buildVapidJWT(aud, now + 43200, contact, privKey)
  const enc = await encryptPayload(payload, sub.keys.p256dh, sub.keys.auth)
  await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'Authorization':    `vapid t=${jwt},k=${pubKey}`,
      'Content-Type':     'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'TTL':              '86400',
    },
    body: enc,
  })
}

function b64u(input: string | ArrayBuffer): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input)
  let bin = ''; bytes.forEach(b => bin += String.fromCharCode(b))
  return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'')
}

function base64UrlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - s.length % 4)
  const bin = atob(s.replace(/-/g,'+').replace(/_/g,'/') + pad)
  return Uint8Array.from(bin, c => c.charCodeAt(0))
}

async function buildVapidJWT(aud: string, exp: number, sub: string, key: CryptoKey) {
  const h = b64u(JSON.stringify({ typ:'JWT', alg:'ES256' }))
  const p = b64u(JSON.stringify({ aud, exp, sub }))
  const sig = await crypto.subtle.sign({ name:'ECDSA', hash:'SHA-256' }, key, new TextEncoder().encode(`${h}.${p}`))
  return `${h}.${p}.${b64u(sig)}`
}

async function importVapidPrivateKey(b64: string): Promise<CryptoKey> {
  const raw = base64UrlDecode(b64)
  const hdr = new Uint8Array([0x30,0x41,0x02,0x01,0x00,0x30,0x13,0x06,0x07,0x2a,0x86,0x48,0xce,0x3d,0x02,0x01,0x06,0x08,0x2a,0x86,0x48,0xce,0x3d,0x03,0x01,0x07,0x04,0x27,0x30,0x25,0x02,0x01,0x01,0x04,0x20])
  const pkcs8 = new Uint8Array(hdr.length + raw.length); pkcs8.set(hdr); pkcs8.set(raw, hdr.length)
  return crypto.subtle.importKey('pkcs8', pkcs8, { name:'ECDSA', namedCurve:'P-256' }, false, ['sign'])
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s,a) => s+a.length, 0)
  const out = new Uint8Array(total); let off = 0
  for (const a of arrays) { out.set(a, off); off += a.length }
  return out
}

function lenPrefixed(buf: Uint8Array): Uint8Array {
  const out = new Uint8Array(2 + buf.length)
  out[0] = (buf.length >> 8) & 0xff; out[1] = buf.length & 0xff; out.set(buf, 2)
  return out
}

async function encryptPayload(plaintext: string, p256dhB64: string, authB64: string): Promise<Uint8Array> {
  const enc     = new TextEncoder()
  const authKey = base64UrlDecode(authB64)
  const p256dh  = base64UrlDecode(p256dhB64)
  const recvPub = await crypto.subtle.importKey('raw', p256dh, { name:'ECDH', namedCurve:'P-256' }, true, [])
  const sKP     = await crypto.subtle.generateKey({ name:'ECDH', namedCurve:'P-256' }, true, ['deriveBits'])
  const sPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', sKP.publicKey))
  const shared  = await crypto.subtle.deriveBits({ name:'ECDH', public: recvPub }, sKP.privateKey, 256)
  const salt    = crypto.getRandomValues(new Uint8Array(16))
  const ikm     = await hkdfExtract(authKey, new Uint8Array(shared))
  const infoKey = concat(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([0x00]), enc.encode('P-256\0'), lenPrefixed(p256dh), lenPrefixed(sPubRaw))
  const cKey    = await hkdfExpand(ikm, concat(salt, infoKey), 16)
  const nonce   = await hkdfExpand(ikm, concat(salt, enc.encode('Content-Encoding: nonce\0'), new Uint8Array([0x00])), 12)
  const aesKey  = await crypto.subtle.importKey('raw', cKey, 'AES-GCM', false, ['encrypt'])
  const cipher  = new Uint8Array(await crypto.subtle.encrypt({ name:'AES-GCM', iv: nonce }, aesKey, concat(enc.encode(plaintext), new Uint8Array([0x02]))))
  return concat(salt, new Uint8Array([0x00,0x10,0x00,0x00]), new Uint8Array([sPubRaw.length]), sPubRaw, cipher)
}

async function hkdfExtract(salt: Uint8Array, ikm: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', salt, { name:'HMAC', hash:'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, ikm))
}

async function hkdfExpand(prk: Uint8Array, info: Uint8Array, len: number): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', prk, { name:'HMAC', hash:'SHA-256' }, false, ['sign'])
  return (await crypto.subtle.sign('HMAC', k, concat(info, new Uint8Array([0x01])))).slice(0, len) as Uint8Array
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/tg-webhook/index.ts
git commit -m "feat(tg): Edge Function tg-webhook — incoming messages → leads"
```

---

## Task 3: Edge Function `tg-send`

**Files:**
- Create: `supabase/functions/tg-send/index.ts`

- [ ] **Step 1: Создать файл**

```typescript
// supabase/functions/tg-send/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: CORS })
  if (req.method !== 'POST') return json({ ok: false, error: 'method not allowed' }, 405)

  // JWT auth
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim()
  if (!token) return json({ ok: false, error: 'unauthorized' }, 401)
  const sbUser = createClient(SUPABASE_URL, ANON_KEY)
  const { data: { user }, error: authErr } = await sbUser.auth.getUser(token)
  if (authErr || !user) return json({ ok: false, error: 'unauthorized' }, 401)

  let body: { lead_id: string; message: string; workspace_id: string }
  try { body = await req.json() } catch { return json({ ok: false, error: 'bad json' }, 400) }

  const { lead_id, message, workspace_id } = body
  if (!lead_id || !message || !workspace_id) {
    return json({ ok: false, error: 'missing fields' }, 400)
  }
  if (message.length > 4096) return json({ ok: false, error: 'message too long' }, 400)

  const sb = createClient(SUPABASE_URL, SERVICE_KEY)

  // Получить bot token
  const { data: settings } = await sb
    .from('workspace_settings')
    .select('tg_bot_token')
    .eq('workspace_id', workspace_id)
    .maybeSingle()
  if (!settings?.tg_bot_token) return json({ ok: false, error: 'TG bot not configured' }, 400)

  // Получить tg_chat_id лида
  const { data: lead } = await sb
    .from('leads')
    .select('tg_chat_id, messages')
    .eq('id', lead_id)
    .eq('workspace_id', workspace_id)
    .maybeSingle()
  if (!lead?.tg_chat_id) return json({ ok: false, error: 'Lead has no tg_chat_id' }, 400)

  // Отправить через Telegram Bot API
  let tgData: Record<string, unknown>
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${settings.tg_bot_token}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: lead.tg_chat_id, text: message })
      }
    )
    tgData = await res.json()
  } catch (e) {
    console.error('TG fetch failed:', e)
    return json({ ok: false, error: 'TG network error' }, 502)
  }

  if (!tgData.ok) {
    return json({ ok: false, error: String(tgData.description ?? 'TG error') }, 400)
  }

  // Записать сообщение в историю
  const newMsg = {
    id: crypto.randomUUID(),
    text: message,
    date: Date.now(),
    fromClient: false,
    tg_sent: true
  }
  const messages = [...(lead.messages ?? []), newMsg]
  await sb.from('leads').update({ messages, updated_at: Date.now() }).eq('id', lead_id)

  return json({ ok: true, tg_message_id: (tgData.result as Record<string, unknown>)?.message_id })
})

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json', ...CORS }
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/tg-send/index.ts
git commit -m "feat(tg): Edge Function tg-send — reply via Bot API"
```

---

## Task 4: index.html — Lead object, Settings UI, JS-функции

**Files:**
- Modify: `index.html`

### 4a: Lead object + upsertLead + rowToLead

- [ ] **Step 1: Найти `upsertLead` и добавить `tg_chat_id`**

Найти блок с `vk_peer_id: lead.vkPeerId` в функции `upsertLead` (ищи `vk_peer_id:`) и добавить строку ниже:

```js
// БЫЛО:
vk_peer_id:    lead.vkPeerId    != null ? Number(lead.vkPeerId) : null,

// СТАЛО:
vk_peer_id:    lead.vkPeerId    != null ? Number(lead.vkPeerId) : null,
tg_chat_id:    lead.tgChatId    != null ? Number(lead.tgChatId) : null,
```

- [ ] **Step 2: Найти `rowToLead` и добавить `tgChatId`**

Найти `vkPeerId: row.vk_peer_id` и добавить строку ниже:

```js
// БЫЛО:
vkPeerId:     row.vk_peer_id != null ? Number(row.vk_peer_id) : null,

// СТАЛО:
vkPeerId:     row.vk_peer_id != null ? Number(row.vk_peer_id) : null,
tgChatId:     row.tg_chat_id != null ? Number(row.tg_chat_id) : null,
```

- [ ] **Step 3: Найти инициализацию нового лида в `quickAddLead` (ищи `vkPeerId: null`) и добавить `tgChatId`**

Во всех местах где создаётся объект нового лида с `vkPeerId: null`, добавить `tgChatId: null`:

```js
// quickAddLead, bulkImport, cmdPaletteAdd — везде:
vkPeerId: null,
tgChatId: null,   // ← добавить
```

### 4b: Глобальные переменные + loadTgSettings

- [ ] **Step 4: Найти `let vkSettings = {` и добавить рядом**

```js
let tgSettings = { botToken: '' };
```

- [ ] **Step 5: Найти функцию `loadVkSettings` и добавить `loadTgSettings` после неё**

```js
async function loadTgSettings() {
    if (!workspaceId) return;
    const { data } = await _sb
        .from('workspace_settings')
        .select('tg_bot_token')
        .eq('workspace_id', workspaceId)
        .maybeSingle();
    if (!data) return;
    tgSettings = { botToken: data.tg_bot_token || '' };
    const tf = document.getElementById('tgBotTokenInput');
    if (tf) tf.value = tgSettings.botToken;
    updateTgWebhookUrlDisplay();
}

function updateTgWebhookUrlDisplay() {
    const el = document.getElementById('tgWebhookUrlDisplay');
    if (!el || !workspaceId) return;
    const webhookUrl = SUPABASE_URL + '/functions/v1/tg-webhook?ws=' + workspaceId;
    el.textContent = webhookUrl;
}

async function saveTgSettings() {
    if (!workspaceId) return;
    const token = (document.getElementById('tgBotTokenInput').value || '').trim();
    const { error } = await _sb.from('workspace_settings').upsert({
        workspace_id: workspaceId,
        tg_bot_token: token || null,
        updated_at: Date.now()
    }, { onConflict: 'workspace_id' });
    if (error) { showToast('Ошибка сохранения TG: ' + error.message, 4000); return; }
    tgSettings.botToken = token;
    showToast('TG Bot сохранён ✓');
}

async function setupTgWebhook() {
    const token = (document.getElementById('tgBotTokenInput').value || '').trim();
    if (!token) { showToast('Введите Bot Token'); return; }
    if (!workspaceId) return;
    const webhookUrl = SUPABASE_URL + '/functions/v1/tg-webhook?ws=' + workspaceId;
    const statusEl = document.getElementById('tgConnectionStatus');
    if (statusEl) statusEl.textContent = '⏳ Настраиваем webhook...';
    try {
        const res = await fetch(
            `https://api.telegram.org/bot${token}/setWebhook`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: webhookUrl, allowed_updates: ['message'] })
            }
        );
        const data = await res.json();
        if (data.ok) {
            if (statusEl) statusEl.textContent = '✅ Webhook установлен';
            showToast('Telegram Bot подключён ✓', 4000);
        } else {
            if (statusEl) statusEl.textContent = '❌ ' + (data.description || 'ошибка');
            showToast('Ошибка TG: ' + (data.description || ''), 5000);
        }
    } catch (e) {
        if (statusEl) statusEl.textContent = '❌ Ошибка сети';
        showToast('Ошибка: ' + e.message, 5000);
    }
}
```

- [ ] **Step 6: Найти вызов `loadVkSettings()` в `initApp` или `renderSettingsModal` и добавить `loadTgSettings()` рядом**

```js
loadVkSettings();
loadTgSettings();   // ← добавить
```

### 4c: Settings UI — секция Telegram

- [ ] **Step 7: Найти в HTML блок `<div id="vkSection"` и добавить TG-секцию сразу ПОСЛЕ закрывающего `</div>`**

```html
<div id="tgSection" style="margin-top:15px;border-top:1px solid var(--border);padding-top:15px;">
    <div style="font-weight:700;margin-bottom:10px;font-size:13px;">💬 Telegram Bot</div>
    <div style="display:flex;flex-direction:column;gap:8px;">
        <label for="tgBotTokenInput" style="font-size:12px;color:var(--muted);margin-bottom:-4px;">Bot Token (от @BotFather)</label>
        <input type="password" id="tgBotTokenInput" placeholder="123456789:ABC-DEF1234..." style="width:100%;" autocomplete="off" aria-label="Telegram Bot Token">

        <div style="font-size:11px;color:var(--muted);margin-top:2px;">Webhook URL (скопируй, не меняй):</div>
        <div id="tgWebhookUrlDisplay" style="font-size:10px;font-family:monospace;background:var(--bg2);padding:6px 8px;border-radius:4px;word-break:break-all;color:var(--text-muted);user-select:all;"></div>

        <div style="display:flex;gap:8px;margin-top:4px;">
            <button class="btn btn-outline" onclick="saveTgSettings()" style="flex:1;" aria-label="Сохранить Telegram настройки">💾 Сохранить</button>
            <button class="btn btn-outline" onclick="setupTgWebhook()" style="flex:1;" aria-label="Настроить Telegram webhook">🔗 Установить webhook</button>
        </div>
        <div id="tgConnectionStatus" style="font-size:12px;color:var(--muted);min-height:18px;" aria-live="polite"></div>
    </div>
</div>
```

- [ ] **Step 8: Commit**

```bash
git add index.html
git commit -m "feat(tg): Settings UI + loadTgSettings + saveTgSettings + setupTgWebhook"
```

---

## Task 5: index.html — Chat buttons, send logic, badge, toast

**Files:**
- Modify: `index.html`

### 5a: Кнопка btnSendTg в HTML

- [ ] **Step 1: Найти строку с `btnSendVk` и добавить кнопку TG рядом**

```html
<!-- БЫЛО: -->
<button id="btnSendVk" class="btn btn-primary" ... style="display:none;">🔗 Открыть в ВК</button>
<button id="btnSendHistoryOnly" ...>только в историю</button>

<!-- СТАЛО: -->
<button id="btnSendVk" class="btn btn-primary" aria-label="Открыть ВКонтакте и скопировать текст" onclick="openVkChat(currentChatLeadId)" style="display:none;" data-tooltip="Текст скопируется, ВК откроется в новой вкладке">🔗 Открыть в ВК</button>
<button id="btnSendTg" class="btn btn-primary" aria-label="Отправить в Telegram" onclick="sendToTg(currentChatLeadId)" style="display:none;" data-tooltip="Отправить сообщение через Telegram Bot">📤 Отправить в TG</button>
<button id="btnSendHistoryOnly" class="btn-link-muted" aria-label="Только в историю" onclick="submitChatInput(currentChatLeadId)" style="display:none;">только в историю</button>
```

### 5b: updateSendButtons — добавить логику TG

- [ ] **Step 2: Найти функцию `updateSendButtons` и заменить её целиком**

```js
function updateSendButtons(lead) {
    const btnHistory     = document.getElementById('btnSendHistory');
    const btnVk          = document.getElementById('btnSendVk');
    const btnTg          = document.getElementById('btnSendTg');
    const btnHistoryOnly = document.getElementById('btnSendHistoryOnly');
    const senderRow      = document.getElementById('vkSenderRow');
    if (!btnHistory || !btnVk || !btnHistoryOnly) return;

    const isVkLead = !!(lead && lead.vkPeerId && chatInputTab === 'manager');
    const isTgLead = !!(lead && lead.tgChatId  && chatInputTab === 'manager');

    btnHistory.style.display     = (isVkLead || isTgLead) ? 'none' : '';
    btnVk.style.display          = isVkLead  ? '' : 'none';
    if (btnTg) btnTg.style.display = isTgLead ? '' : 'none';
    btnHistoryOnly.style.display = (isVkLead || isTgLead) ? '' : 'none';
    if (senderRow) senderRow.style.display = 'none';
}
```

### 5c: primarySendAction — добавить ветку TG

- [ ] **Step 3: Найти `primarySendAction` и заменить**

```js
function primarySendAction(leadId) {
    const lead = leads.find(function(l) { return String(l.id) === String(leadId); });
    if (lead && lead.tgChatId && chatInputTab === 'manager') {
        sendToTg(leadId);
    } else if (lead && lead.vkPeerId && chatInputTab === 'manager') {
        openVkChat(leadId);
    } else {
        submitChatInput(leadId);
    }
}
```

### 5d: Функция sendToTg

- [ ] **Step 4: Найти функцию `openVkChat` и добавить `sendToTg` сразу ПОСЛЕ неё**

```js
async function sendToTg(leadId) {
    const lead = leads.find(function(l) { return String(l.id) === String(leadId); });
    const text = (document.getElementById('chatInputMain').value || '').trim();
    if (!text) { showToast('Введите текст сообщения'); return; }
    if (!lead || !lead.tgChatId) { showToast('У лида нет Telegram Chat ID'); return; }

    const btn = document.getElementById('btnSendTg');
    if (btn) { btn.disabled = true; btn.textContent = '⏳'; }

    try {
        const { data: { session } } = await _sb.auth.getSession();
        if (!session) throw new Error('Нет сессии');

        const res = await fetch(SUPABASE_URL + '/functions/v1/tg-send', {
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
            document.getElementById('chatInputMain').value = '';
            addMessageToLead(leadId, text, false);
            showToast('Отправлено в Telegram ✓');
        } else {
            showToast('Ошибка TG: ' + (data.error || 'неизвестно'), 5000);
        }
    } catch (e) {
        showToast('Ошибка: ' + e.message, 5000);
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '📤 Отправить в TG'; }
    }
}
```

### 5e: TG badge в заголовке чата + автопереключение таба

- [ ] **Step 5: Найти в `renderChatHeader` строку с `vk-badge` и добавить TG badge рядом**

```js
// БЫЛО:
(lead.vkPeerId ? '<span class="vk-badge" title="VK peer_id: ' + Number(lead.vkPeerId) + '">VK ✓</span>' : '') +

// СТАЛО:
(lead.vkPeerId ? '<span class="vk-badge" title="VK peer_id: ' + Number(lead.vkPeerId) + '">VK ✓</span>' : '') +
(lead.tgChatId ? '<span class="vk-badge" style="color:#29b6f6;" title="Telegram chat_id: ' + Number(lead.tgChatId) + '">TG ✓</span>' : '') +
```

- [ ] **Step 6: Найти блок автопереключения таба для VK и добавить TG**

```js
// БЫЛО:
if (lead.vkPeerId) {
    setChatInputTab('manager');
} else {
    ...
}

// СТАЛО:
if (lead.vkPeerId || lead.tgChatId) {
    setChatInputTab('manager');
} else {
    ...
}
```

### 5f: Realtime toast для входящих TG сообщений

- [ ] **Step 7: Найти `showToast('📨 Новое от VK:` и добавить TG ниже**

```js
// БЫЛО:
} else if (hasNewMsg && updLead.vkPeerId) {
    showToast('📨 Новое от VK: ' + (updLead.name || 'Лид'), 6000);

// СТАЛО:
} else if (hasNewMsg && updLead.vkPeerId) {
    showToast('📨 Новое от VK: ' + (updLead.name || 'Лид'), 6000);
} else if (hasNewMsg && updLead.tgChatId) {
    showToast('💬 Новое в Telegram: ' + (updLead.name || 'Лид'), 6000);
```

- [ ] **Step 8: Commit**

```bash
git add index.html
git commit -m "feat(tg): chat buttons, sendToTg, TG badge, realtime toast"
```

---

## Task 6: Deploy и тест

- [ ] **Step 1: Задеплоить Edge Functions**

```bash
npx supabase functions deploy tg-webhook --no-verify-jwt
npx supabase functions deploy tg-send
```

- [ ] **Step 2: Создать Telegram Bot через @BotFather**

1. Открыть Telegram → @BotFather → `/newbot`
2. Задать имя: `ADERVIS OTR` (или любое)
3. Задать username: `adervis_otr_bot` (или любое, должно оканчиваться на `bot`)
4. Скопировать токен вида `7890123456:AAF_...`

- [ ] **Step 3: Сохранить токен в OTR**

1. Открыть otr.adervis.ru → Настройки → секция "💬 Telegram Bot"
2. Вставить Bot Token → "💾 Сохранить"
3. Нажать "🔗 Установить webhook"
4. Убедиться что статус: `✅ Webhook установлен`

- [ ] **Step 4: E2E тест**

1. Написать сообщение боту в Telegram (любой пользователь)
2. Через 2-3 секунды в OTR должен появиться новый лид с именем отправителя
3. Написать ответ в OTR → "📤 Отправить в TG"
4. Проверить что сообщение пришло в Telegram

- [ ] **Step 5: Commit финальный**

```bash
git add .
git commit -m "feat(tg): Telegram Bot integration — webhook + send + UI complete"
```

---

## Итог после выполнения

| Фича | Статус |
|------|--------|
| Входящие TG → OTR | ✅ |
| Ответ из OTR → TG | ✅ |
| AI-черновик на входящие TG | ✅ |
| Push-уведомления при TG | ✅ |
| Холодный аутрич (t.me/username) | open+copy (отдельная задача) |
| Settings UI для токена | ✅ |
