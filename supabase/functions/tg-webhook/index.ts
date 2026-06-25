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
  const t = new Uint8Array(await crypto.subtle.sign('HMAC', k, concat(info, new Uint8Array([0x01]))))
  return t.slice(0, len)
}
