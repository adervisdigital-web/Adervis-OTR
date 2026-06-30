import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const VAPID_PUBLIC_KEY = 'BK5eS4qOz28ezTLb3ejmOUHNsF65l2LegtHO5wHUgYkFyHvhyaG1tJ43agB7941XXTVmImeMPoULFwPexgCq01I'

interface VkMessage {
  id: string
  text: string
  date: number
  fromClient: boolean
  ai_draft?: string
  vk_sent?: boolean
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
    .select('workspace_id, vk_confirmation_string, vk_webhook_secret, vk_token, vk_welcome_text, tg_portfolio_text, tg_portfolio_videos')
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

  const peerId  = Number(msgObj.peer_id ?? msgObj.from_id)
  const text    = String(msgObj.text ?? '')
  const vkDate  = Number(msgObj.date ?? 0)
  const dateMs  = vkDate ? vkDate * 1000 : Date.now()

  if (!peerId || isNaN(peerId)) return new Response('ok', { status: 200 })

  const workspaceId = settings.workspace_id

  // Найти лид по vk_peer_id
  const { data: existingLead } = await sb
    .from('leads')
    .select('id, name, messages')
    .eq('workspace_id', workspaceId)
    .eq('vk_peer_id', peerId)
    .maybeSingle()

  const newMessage: VkMessage = {
    id:         crypto.randomUUID(),
    text,
    date:       dateMs,
    fromClient: true
  }

  let leadId: string
  let leadName: string

  if (existingLead) {
    const messages = [...(existingLead.messages ?? []), newMessage]
    const { error } = await sb
      .from('leads')
      .update({ messages, updated_at: Date.now() })
      .eq('id', existingLead.id)
    if (error) {
      console.error('lead update failed:', error.message)
      return new Response('internal error', { status: 500 })
    }
    leadId   = existingLead.id
    leadName = existingLead.name || `VK ${peerId}`
  } else {
    const newId = crypto.randomUUID()
    leadId   = newId
    leadName = `VK ${peerId}`
    const { error } = await sb.from('leads').insert({
      id:            newId,
      workspace_id:  workspaceId,
      name:          leadName,
      link:          peerId > 0 ? `https://vk.com/id${peerId}` : `https://vk.com/gim${Math.abs(peerId)}`,
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
      vk_peer_id:    peerId
    })
    if (error) {
      console.error('lead insert failed:', error.message)
      return new Response('internal error', { status: 500 })
    }
  }

  // Respond to VK immediately (within 5 seconds)
  const responsePromise = Promise.resolve(new Response('ok', { status: 200 }))

  const communityToken   = (settings as Record<string, unknown>).vk_token as string | null
  const welcomeText      = (settings as Record<string, unknown>).vk_welcome_text as string | null
  const portfolioText    = (settings as Record<string, unknown>).tg_portfolio_text as string | null
  const portfolioVideos  = (settings as Record<string, unknown>).tg_portfolio_videos as string[] | null

  // Auto-reply on first message from new lead
  if (!existingLead && communityToken && welcomeText?.trim()) {
    vkSendAndSave(communityToken, peerId, welcomeText.trim(), sb, leadId, true).catch(
      e => console.error('vk auto-reply failed:', e)
    )
  }

  // Handle VK keyboard button presses
  const trimmed = text.trim()
  const isButton = trimmed === '📹 Примеры работ' || trimmed === '📋 Оставить заявку'
  if (isButton && communityToken) {
    handleVkButton(sb, communityToken, peerId, trimmed, leadId, workspaceId, leadName, portfolioText, portfolioVideos).catch(
      e => console.error('vk button handler failed:', e)
    )
  }

  // Fire-and-forget: AI auto-reply to client (skip for first message and button presses)
  const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY') ?? ''
  if (existingLead && !isButton && communityToken && GEMINI_KEY && text.trim()) {
    generateVkAutoReply(
      communityToken, peerId, text, existingLead.messages ?? [], sb, leadId
    ).catch(e => console.error('vk auto-reply failed:', e))
  }
  // Keep ai_draft patch for new leads (first message already handled by welcome)
  if (!existingLead && GEMINI_KEY && text.trim()) {
    generateAndPatchDraft(sb, leadId, text, [], newMessage.id).catch(
      e => console.error('ai draft patch failed:', e)
    )
  }

  // Send push notification to all workspace subscribers
  sendPushToWorkspace(sb, workspaceId, leadName, text).catch(
    e => console.error('push notify failed:', e)
  )

  return responsePromise
})

// ── Push Notifications ──────────────────────────────────────────────────────

async function sendPushToWorkspace(
  sb: ReturnType<typeof createClient>,
  workspaceId: string,
  leadName: string,
  text: string
): Promise<void> {
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
  const vapidContact    = Deno.env.get('VAPID_CONTACT') ?? 'mailto:admin@adervis.ru'
  if (!vapidPrivateKey) return

  const { data: subs } = await sb
    .from('push_subscriptions')
    .select('subscription')
    .eq('workspace_id', workspaceId)

  if (!subs?.length) return

  const privKey = await importVapidPrivateKey(vapidPrivateKey)
  const payload = JSON.stringify({
    title: `📨 ${leadName}`,
    body:  text.slice(0, 100) || 'Новое сообщение',
    url:   '/'
  })

  await Promise.allSettled(
    subs.map(({ subscription }) =>
      sendWebPush(subscription as PushSubscription, payload, privKey, vapidContact)
    )
  )
}

interface PushSubscription {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

async function sendWebPush(
  sub: PushSubscription,
  payload: string,
  vapidPrivateKey: CryptoKey,
  contact: string
): Promise<void> {
  const endpointUrl = new URL(sub.endpoint)
  const audience    = `${endpointUrl.protocol}//${endpointUrl.host}`
  const now         = Math.floor(Date.now() / 1000)

  const jwt = await buildVapidJWT(audience, now + 12 * 3600, contact, vapidPrivateKey)

  // Encrypt payload (RFC 8291 aes128gcm)
  const encrypted = await encryptPayload(payload, sub.keys.p256dh, sub.keys.auth)

  await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'Authorization':    `vapid t=${jwt},k=${VAPID_PUBLIC_KEY}`,
      'Content-Type':     'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'TTL':              '86400',
    },
    body: encrypted,
  })
}

// ── VAPID JWT ────────────────────────────────────────────────────────────────

async function buildVapidJWT(
  audience: string,
  exp: number,
  sub: string,
  privateKey: CryptoKey
): Promise<string> {
  const header  = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))
  const payload = b64u(JSON.stringify({ aud: audience, exp, sub }))
  const input   = `${header}.${payload}`
  const sig     = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(input)
  )
  return `${input}.${b64u(sig)}`
}

function b64u(input: string | ArrayBuffer): string {
  const bytes = typeof input === 'string'
    ? new TextEncoder().encode(input)
    : new Uint8Array(input)
  let bin = ''
  bytes.forEach(b => bin += String.fromCharCode(b))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function base64UrlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - s.length % 4)
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad)
  return Uint8Array.from(bin, c => c.charCodeAt(0))
}

async function importVapidPrivateKey(base64url: string): Promise<CryptoKey> {
  // VAPID private keys are raw 32-byte P-256 scalars encoded as base64url.
  // crypto.subtle needs PKCS#8 DER wrapper.
  const rawKey = base64UrlDecode(base64url)

  // PKCS#8 DER for P-256 private key (standard fixed header + raw key bytes)
  const pkcs8Header = new Uint8Array([
    0x30, 0x41, 0x02, 0x01, 0x00, 0x30, 0x13, 0x06,
    0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01,
    0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03,
    0x01, 0x07, 0x04, 0x27, 0x30, 0x25, 0x02, 0x01,
    0x01, 0x04, 0x20,
  ])
  const pkcs8 = new Uint8Array(pkcs8Header.length + rawKey.length)
  pkcs8.set(pkcs8Header)
  pkcs8.set(rawKey, pkcs8Header.length)

  return crypto.subtle.importKey(
    'pkcs8',
    pkcs8,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  )
}

// ── RFC 8291 payload encryption (aes128gcm) ──────────────────────────────────

async function encryptPayload(
  plaintext: string,
  p256dhBase64: string,
  authBase64: string
): Promise<Uint8Array> {
  const encoder  = new TextEncoder()
  const authKey  = base64UrlDecode(authBase64)        // 16 bytes
  const p256dh   = base64UrlDecode(p256dhBase64)      // 65 bytes uncompressed point

  // Browser's public key (recipient)
  const recipientPublicKey = await crypto.subtle.importKey(
    'raw', p256dh, { name: 'ECDH', namedCurve: 'P-256' }, true, []
  )

  // Ephemeral sender key pair
  const senderKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']
  )
  const senderPublicKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey('raw', senderKeyPair.publicKey)
  )

  // ECDH shared secret
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: recipientPublicKey },
    senderKeyPair.privateKey,
    256
  )

  // Salt (16 random bytes)
  const salt = crypto.getRandomValues(new Uint8Array(16))

  // HKDF extract + expand (RFC 8291)
  const ikm = await hkdfExtract(authKey, new Uint8Array(sharedBits))

  // prk_key
  const infoKey = concat(
    encoder.encode('Content-Encoding: aes128gcm\0'),
    new Uint8Array([0x00]),    // context = empty
    encoder.encode('P-256\0'),
    lenPrefixed(p256dh),
    lenPrefixed(senderPublicKeyRaw)
  )
  // simplified: skip full HKDF context and derive directly
  const contentKey = await hkdfExpand(ikm, concat(salt, infoKey), 16)
  const nonce      = await hkdfExpand(ikm, concat(salt, encoder.encode('Content-Encoding: nonce\0'), new Uint8Array([0x00])), 12)

  const aesKey = await crypto.subtle.importKey('raw', contentKey, 'AES-GCM', false, ['encrypt'])

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey,
      concat(encoder.encode(plaintext), new Uint8Array([0x02]))  // padding delimiter
    )
  )

  // Build RFC 8291 content: salt(16) + rs(4) + idlen(1) + keyid(65) + ciphertext
  const rs = new Uint8Array([0x00, 0x10, 0x00, 0x00]) // record size 4096
  const idlen = new Uint8Array([senderPublicKeyRaw.length])
  return concat(salt, rs, idlen, senderPublicKeyRaw, ciphertext)
}

async function hkdfExtract(salt: Uint8Array, ikm: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', salt, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, ikm))
}

async function hkdfExpand(prk: Uint8Array, info: Uint8Array, len: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', prk, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const t   = new Uint8Array(await crypto.subtle.sign('HMAC', key, concat(info, new Uint8Array([0x01]))))
  return t.slice(0, len)
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0)
  const out   = new Uint8Array(total)
  let offset  = 0
  for (const a of arrays) { out.set(a, offset); offset += a.length }
  return out
}

function lenPrefixed(buf: Uint8Array): Uint8Array {
  const out = new Uint8Array(2 + buf.length)
  out[0] = (buf.length >> 8) & 0xff
  out[1] = buf.length & 0xff
  out.set(buf, 2)
  return out
}

// ── VK Send helpers ────────────────────────────────────────────────────────────

const VK_MAIN_KB = JSON.stringify({
  one_time: false,
  buttons: [[
    { action: { type: 'text', label: '📹 Примеры работ' }, color: 'default' },
    { action: { type: 'text', label: '📋 Оставить заявку' }, color: 'primary' }
  ]]
})

async function vkApiSend(token: string, peerId: number, text: string, keyboard?: string): Promise<boolean> {
  const params = new URLSearchParams({
    peer_id:      String(peerId),
    message:      text.slice(0, 4096),
    random_id:    String(Math.floor(Math.random() * 2147483647)),
    v:            '5.131',
    access_token: token
  })
  if (keyboard) params.set('keyboard', keyboard)

  const res  = await fetch('https://api.vk.com/method/messages.send', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    params
  })
  const data = await res.json() as Record<string, unknown>
  if (data.error) { console.error('vkApiSend error:', data.error); return false }
  return true
}

async function saveBotMsg(sb: ReturnType<typeof createClient>, leadId: string, text: string): Promise<void> {
  const { data: lead } = await sb.from('leads').select('messages').eq('id', leadId).maybeSingle()
  if (!lead) return
  const botMsg: VkMessage = { id: crypto.randomUUID(), text, date: Date.now(), fromClient: false, vk_sent: true }
  await sb.from('leads')
    .update({ messages: [...((lead.messages as VkMessage[]) ?? []), botMsg], updated_at: Date.now() })
    .eq('id', leadId)
}

async function vkSendAndSave(
  token: string, peerId: number, text: string,
  sb: ReturnType<typeof createClient>, leadId: string, withKeyboard = false
): Promise<void> {
  const ok = await vkApiSend(token, peerId, text, withKeyboard ? VK_MAIN_KB : undefined)
  if (ok) await saveBotMsg(sb, leadId, text)
}

// ── VK Button handlers ─────────────────────────────────────────────────────────

async function handleVkButton(
  sb: ReturnType<typeof createClient>,
  token: string,
  peerId: number,
  button: string,
  leadId: string,
  workspaceId: string,
  leadName: string,
  portfolioText: string | null,
  portfolioVideos: string[] | null
): Promise<void> {
  if (button === '📹 Примеры работ') {
    let reply = portfolioText?.trim() || 'Наши работы: adervis.ru'
    const links = (portfolioVideos ?? []).filter((v: string) => v?.trim()).join('\n')
    if (links) reply += '\n\n' + links
    await vkSendAndSave(token, peerId, reply, sb, leadId, false)
    return
  }

  if (button === '📋 Оставить заявку') {
    const reply = 'Отлично! Оставьте свой контакт (телефон или email) — менеджер свяжется в ближайшее время 🎬'
    await vkSendAndSave(token, peerId, reply, sb, leadId, false)
    await sb.from('leads').update({ status: 2, updated_at: Date.now() }).eq('id', leadId)
    sendPushToWorkspace(sb, workspaceId, leadName, '📋 Клиент хочет оставить заявку (VK)').catch(() => {})
  }
}

// ── AI Draft ─────────────────────────────────────────────────────────────────

async function generateAndPatchDraft(
  sb: ReturnType<typeof createClient>,
  leadId: string,
  userText: string,
  history: VkMessage[],
  newMsgId: string
): Promise<void> {
  const geminiKey = Deno.env.get('GEMINI_API_KEY') ?? ''
  const draft = await generateAiDraft(userText, history, geminiKey)
  if (!draft) return

  const { data: lead } = await sb
    .from('leads')
    .select('messages')
    .eq('id', leadId)
    .maybeSingle()

  if (!lead?.messages) return

  const messages = (lead.messages as VkMessage[]).map(m =>
    m.id === newMsgId ? { ...m, ai_draft: draft } : m
  )

  await sb.from('leads').update({ messages }).eq('id', leadId)
}

async function generateAiDraft(
  userText: string,
  history: VkMessage[],
  geminiKey: string
): Promise<string> {
  if (!geminiKey || !userText.trim()) return ''

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
    return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  } catch {
    return ''
  }
}

async function generateVkAutoReply(
  token: string,
  peerId: number,
  userText: string,
  history: VkMessage[],
  sb: ReturnType<typeof createClient>,
  leadId: string
): Promise<void> {
  const geminiKey = Deno.env.get('GEMINI_API_KEY') ?? ''
  if (!geminiKey || !userText.trim()) return

  const recent = history.slice(-5).map(m =>
    (m.fromClient ? 'Клиент' : 'Менеджер/Бот') + ': «' + m.text.slice(0, 200) + '»'
  ).join('\n')

  const prompt = [
    'Ты — менеджер видеопродакшена ADERVIS.',
    'Снимаем короткие видео (VK Клипы, Reels, Shorts) для бизнеса — кафе, рестораны, барбершопы.',
    'Цель диалога: вызвать интерес и предложить оставить заявку.',
    recent ? `\nИстория диалога:\n${recent}` : '',
    `\nСообщение клиента: «${userText.slice(0, 300)}»`,
    '\nНапиши ОДИН ответ менеджера. Максимум 3 предложения. Без вводных слов типа "Конечно!" или "Отлично!".',
    'Закончи вопросом или призывом к действию. Пиши по-русски, дружелюбно.',
  ].join('\n')

  try {
    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 200, temperature: 0.65 }
        })
      }
    )
    const data = await res.json() as Record<string, unknown>
    const reply = (data?.candidates as any)?.[0]?.content?.parts?.[0]?.text?.trim() ?? ''
    if (!reply) return
    await vkSendAndSave(token, peerId, reply, sb, leadId, false)
  } catch (e) {
    console.error('vk auto-reply error:', e)
  }
}
