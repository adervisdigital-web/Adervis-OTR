import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const GEMINI_KEY   = Deno.env.get('GEMINI_API_KEY') ?? ''

const PORTFOLIO_SITE = 'https://adervis.ru'
const PORTFOLIO_TG   = 'https://t.me/Adervis_digital'

const WELCOME_TEXT = `👋 Привет! Я помощник видеостудии ADERVIS

Создаём видео для бизнеса:
🎬 Рекламные ролики
📱 Reels, VK Клипы, Shorts
🏢 Корпоративные видео
🎉 Событийная съёмка

Выберите что вас интересует 👇`

const PORTFOLIO_TEXT = `Наши работы и примеры 👇

🌐 Сайт: ${PORTFOLIO_SITE}
📱 Telegram-канал: ${PORTFOLIO_TG}

Понравилось? Оставьте заявку — обсудим ваш проект:`

const BRIEF_Q = [
  'Расскажите про ваш бизнес — чем занимаетесь и что хотите снять?',       // 0 — free text
  'Какой формат видео интересует?',                                           // 1 — buttons
  'В каком городе находитесь?',                                               // 2 — free text
  'Ориентировочный бюджет?',                                                  // 3 — buttons
  'Как вас зовут?',                                                           // 4 — free text
  'Телефон или @username для связи?',                                         // 5 — free text → done
]

const FORMAT_KB = {
  inline_keyboard: [
    [
      { text: '📢 Рекламный ролик',  callback_data: 'bf:Рекламный ролик' },
      { text: '📱 Reels / Shorts',   callback_data: 'bf:Reels / Shorts'  },
    ],
    [
      { text: '🏢 Корпоративный',   callback_data: 'bf:Корпоративный'   },
      { text: '🎉 Событийный',      callback_data: 'bf:Событийный'      },
    ],
    [{ text: '🎬 Другой формат', callback_data: 'bf:Другой' }],
  ]
}

const BUDGET_KB = {
  inline_keyboard: [
    [
      { text: 'до 30 000 ₽',   callback_data: 'bb:до 30 000 ₽'  },
      { text: '30–100 000 ₽',  callback_data: 'bb:30–100 000 ₽' },
    ],
    [
      { text: '100 000 ₽+',   callback_data: 'bb:100 000 ₽+'    },
      { text: '🤝 Обсудим',   callback_data: 'bb:Обсудим'        },
    ],
  ]
}

const MAIN_KB = {
  inline_keyboard: [
    [{ text: '📹 Примеры работ',          callback_data: 'm:portfolio' }],
    [{ text: '📋 Оставить заявку',         callback_data: 'm:brief'     }],
    [{ text: '💬 Написать менеджеру',      callback_data: 'm:manager'   }],
  ]
}

const ACTION_KB = {
  inline_keyboard: [
    [{ text: '📋 Оставить заявку',    callback_data: 'm:brief'   }],
    [{ text: '💬 Связаться с менеджером', callback_data: 'm:manager' }],
  ]
}

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

interface TgState {
  mode: 'menu' | 'brief' | 'ai'
  step?: number
  brief?: {
    business?: string; format?: string
    city?: string;     budget?: string
    name?: string;     contact?: string
  }
  aiRounds?: number
}

type SbClient = ReturnType<typeof createClient>
type LeadRow  = Record<string, unknown>

// ─── MAIN HANDLER ────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('ok')

  const wsId = new URL(req.url).searchParams.get('ws')
  if (!wsId) return new Response('missing ws', { status: 400 })

  let upd: Record<string, unknown>
  try { upd = await req.json() } catch { return new Response('bad json', { status: 400 }) }

  const sb = createClient(SUPABASE_URL, SERVICE_KEY)
  const { data: ws } = await sb
    .from('workspace_settings').select('tg_bot_token').eq('workspace_id', wsId).maybeSingle()
  if (!ws?.tg_bot_token) return new Response('not configured', { status: 404 })
  const tok = ws.tg_bot_token as string

  try {
    const msg = upd.message        as LeadRow | undefined
    const cb  = upd.callback_query as LeadRow | undefined

    if (msg) await handleMessage(msg, sb, tok, wsId)
    if (cb)  {
      await handleCallback(cb, sb, tok, wsId)
      fetch(`https://api.telegram.org/bot${tok}/answerCallbackQuery`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ callback_query_id: cb.id })
      }).catch(() => {})
    }
  } catch (e) { console.error('handler error:', e) }

  return new Response('ok', { status: 200 })
})

// ─── MESSAGE HANDLER ─────────────────────────────────────────────────────────

async function handleMessage(msg: LeadRow, sb: SbClient, tok: string, wsId: string) {
  const chatId = Number((msg.chat as LeadRow)?.id ?? 0)
  const text   = String(msg.text ?? '').trim()
  if (!chatId || !text) return

  const from        = msg.from as LeadRow | undefined
  const firstName   = String(from?.first_name ?? '')
  const username    = String(from?.username   ?? '')
  const displayName = firstName || (username ? '@' + username : `TG ${chatId}`)

  let lead = await getLead(sb, wsId, chatId)
  if (!lead) lead = await createLead(sb, wsId, chatId, displayName, username)
  if (!lead) return

  const state: TgState = (lead.tg_state as TgState) ?? { mode: 'menu', aiRounds: 0, brief: {} }

  // Commands
  if (text === '/start' || text === '/menu') {
    await tgSend(tok, chatId, WELCOME_TEXT, MAIN_KB)
    await setState(sb, lead.id as string, { mode: 'menu', aiRounds: 0, brief: {} })
    await addMsg(sb, lead, wsId, text, true)
    return
  }
  if (text === '/portfolio') {
    await tgSend(tok, chatId, PORTFOLIO_TEXT, ACTION_KB)
    await addMsg(sb, lead, wsId, text, true)
    return
  }
  if (text === '/brief') {
    await startBrief(sb, lead, tok, chatId)
    await addMsg(sb, lead, wsId, text, true)
    return
  }
  if (text === '/manager') {
    await tgSend(tok, chatId, '👨‍💼 Передаю менеджеру! Свяжется в ближайшее время.')
    await addMsg(sb, lead, wsId, 'Запрос: /manager', true)
    await notifyOTR(sb, lead, wsId, '💬 Клиент запросил связь с менеджером', tok, displayName)
    return
  }

  // Store incoming
  await addMsg(sb, lead, wsId, text, true)

  // Brief flow
  if (state.mode === 'brief' && state.step !== undefined) {
    await processBrief(sb, lead, state, text, tok, chatId, wsId, displayName)
    return
  }

  // AI assistant
  const rounds = (state.aiRounds ?? 0) + 1
  const freshLead = await getLead(sb, wsId, chatId)
  const history = ((freshLead?.messages ?? []) as LeadRow[]).slice(-8)

  const aiReply = await aiResponse(text, history)
  if (aiReply) {
    const showActions = rounds >= 2
    await tgSend(tok, chatId, aiReply + (showActions ? '\n\n💡 Хотите обсудить подробнее?' : ''),
      showActions ? ACTION_KB : undefined)
    await addManagerMsg(sb, lead, wsId, aiReply)
  }
  await setState(sb, lead.id as string, { ...state, mode: 'ai', aiRounds: rounds })
  pushNotify(sb, wsId, displayName, text).catch(() => {})
}

// ─── CALLBACK HANDLER ────────────────────────────────────────────────────────

async function handleCallback(cb: LeadRow, sb: SbClient, tok: string, wsId: string) {
  const data    = String(cb.data ?? '')
  const from    = cb.from as LeadRow | undefined
  const chatId  = Number((cb.message as LeadRow)?.chat
    ? ((cb.message as LeadRow).chat as LeadRow).id
    : from?.id ?? 0)
  if (!chatId) return

  const firstName   = String(from?.first_name ?? '')
  const username    = String(from?.username   ?? '')
  const displayName = firstName || (username ? '@' + username : `TG ${chatId}`)

  let lead = await getLead(sb, wsId, chatId)
  if (!lead) lead = await createLead(sb, wsId, chatId, displayName, username)
  if (!lead) return

  const state: TgState = (lead.tg_state as TgState) ?? { mode: 'menu', aiRounds: 0, brief: {} }

  if (data === 'm:portfolio') {
    await tgSend(tok, chatId, PORTFOLIO_TEXT, ACTION_KB)
    await addMsg(sb, lead, wsId, '📹 [Примеры работ]', true)
    return
  }
  if (data === 'm:brief') {
    await startBrief(sb, lead, tok, chatId)
    await addMsg(sb, lead, wsId, '📋 [Оставить заявку]', true)
    return
  }
  if (data === 'm:manager') {
    await tgSend(tok, chatId, '👨‍💼 Передаю менеджеру! Свяжется в ближайшее время.')
    await addMsg(sb, lead, wsId, '💬 [Написать менеджеру]', true)
    await notifyOTR(sb, lead, wsId, '💬 Клиент запросил связь с менеджером', tok, displayName)
    return
  }

  // Brief: format button
  if (data.startsWith('bf:') && state.mode === 'brief') {
    const format = data.slice(3)
    const ns: TgState = { ...state, brief: { ...state.brief, format }, step: 2 }
    await setState(sb, lead.id as string, ns)
    await addMsg(sb, lead, wsId, `Формат: ${format}`, true)
    await tgSend(tok, chatId, BRIEF_Q[2])
    return
  }

  // Brief: budget button
  if (data.startsWith('bb:') && state.mode === 'brief') {
    const budget = data.slice(3)
    const ns: TgState = { ...state, brief: { ...state.brief, budget }, step: 4 }
    await setState(sb, lead.id as string, ns)
    await addMsg(sb, lead, wsId, `Бюджет: ${budget}`, true)
    await tgSend(tok, chatId, BRIEF_Q[4])
  }
}

// ─── BRIEF STATE MACHINE ─────────────────────────────────────────────────────

async function startBrief(sb: SbClient, lead: LeadRow, tok: string, chatId: number) {
  await setState(sb, lead.id as string, { mode: 'brief', step: 0, brief: {}, aiRounds: 0 })
  await tgSend(tok, chatId, '📋 Отлично! Заполним короткую анкету — 1 минута.\n\n' + BRIEF_Q[0])
}

async function processBrief(
  sb: SbClient, lead: LeadRow, state: TgState, text: string,
  tok: string, chatId: number, wsId: string, displayName: string
) {
  const step  = state.step ?? 0
  const brief = state.brief ?? {}

  switch (step) {
    case 0:  // business → show format buttons
      await setState(sb, lead.id as string, { ...state, brief: { ...brief, business: text }, step: 1 })
      await tgSend(tok, chatId, BRIEF_Q[1], FORMAT_KB)
      break

    case 2:  // city → show budget buttons
      await setState(sb, lead.id as string, { ...state, brief: { ...brief, city: text }, step: 3 })
      await tgSend(tok, chatId, BRIEF_Q[3], BUDGET_KB)
      break

    case 4:  // name → ask contact
      await setState(sb, lead.id as string, { ...state, brief: { ...brief, name: text }, step: 5 })
      await tgSend(tok, chatId, BRIEF_Q[5])
      break

    case 5: { // contact → DONE
      const b = { ...brief, contact: text }
      await setState(sb, lead.id as string, { mode: 'menu', brief: b, aiRounds: 0 })

      // Thank you message
      const recap = [
        '✅ Заявка принята! Менеджер свяжется в ближайшее время.',
        '',
        '📋 Ваши данные:',
        b.business ? `Бизнес: ${b.business}` : '',
        b.format   ? `Формат: ${b.format}`   : '',
        b.city     ? `Город: ${b.city}`       : '',
        b.budget   ? `Бюджет: ${b.budget}`    : '',
        b.name     ? `Имя: ${b.name}`         : '',
        `Контакт: ${b.contact}`,
      ].filter(Boolean).join('\n')

      await tgSend(tok, chatId, recap)
      await tgSend(tok, chatId, '🙌 Пока ждёте — посмотрите наши работы:', {
        inline_keyboard: [[{ text: '📹 Примеры работ', callback_data: 'm:portfolio' }]]
      })

      // Notify OTR with full brief
      const briefNote = [
        '🔥 НОВАЯ ЗАЯВКА (бриф заполнен)',
        `Бизнес: ${b.business || '—'}`,
        `Формат: ${b.format   || '—'}`,
        `Город: ${b.city      || '—'}`,
        `Бюджет: ${b.budget   || '—'}`,
        `Имя: ${b.name        || '—'}`,
        `Контакт: ${b.contact || '—'}`,
      ].join('\n')

      await notifyOTR(sb, lead, wsId, briefNote, tok, displayName)

      // Update lead status to "В диалоге" + save brief in notes
      const freshLead = await getLead(sb, wsId, Number(lead.tg_chat_id))
      await sb.from('leads').update({
        status:     2,
        notes:      briefNote,
        updated_at: Date.now(),
        messages:   freshLead?.messages ?? lead.messages ?? []
      }).eq('id', lead.id as string)
      break
    }
  }
}

// ─── AI RESPONSE ─────────────────────────────────────────────────────────────

async function aiResponse(userText: string, history: LeadRow[]): Promise<string> {
  if (!GEMINI_KEY) return ''

  const recent = history.slice(-6)
    .map(m => (m.fromClient ? 'Клиент' : 'Менеджер') + ': «' + String(m.text ?? '').slice(0, 200) + '»')
    .join('\n')

  const prompt = [
    AI_PROMPT,
    recent ? `\nИстория:\n${recent}` : '',
    `\nКлиент: «${userText}»`,
    '\nТвой ответ:',
  ].join('\n')

  try {
    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
        body:    JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 300, temperature: 0.7 }
        })
      }
    )
    const d = await res.json()
    return d?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? ''
  } catch { return '' }
}

// ─── DB HELPERS ───────────────────────────────────────────────────────────────

async function getLead(sb: SbClient, wsId: string, chatId: number): Promise<LeadRow | null> {
  const { data } = await sb
    .from('leads').select('*').eq('workspace_id', wsId).eq('tg_chat_id', chatId).maybeSingle()
  return data as LeadRow | null
}

async function createLead(sb: SbClient, wsId: string, chatId: number, name: string, username: string) {
  const id     = crypto.randomUUID()
  const tgLink = username ? `https://t.me/${username}` : `https://t.me/${chatId}`
  const { data } = await sb.from('leads').insert({
    id, workspace_id: wsId, name, link: tgLink, contact: '', biz_type: '', status: 0,
    updated_at: Date.now(), notes: '', messages: [], remind_at: null, attempt_count: 0,
    assigned_to: null, created_by: null, vk_peer_id: null, tg_chat_id: chatId, tg_state: null,
  }).select().single()
  return data as LeadRow | null
}

async function setState(sb: SbClient, leadId: string, state: TgState) {
  await sb.from('leads').update({ tg_state: state, updated_at: Date.now() }).eq('id', leadId)
}

async function addMsg(sb: SbClient, lead: LeadRow, wsId: string, text: string, fromClient: boolean) {
  const fresh    = await getLead(sb, wsId, Number(lead.tg_chat_id))
  const messages = [...((fresh?.messages ?? lead.messages ?? []) as LeadRow[])]
  messages.push({ id: crypto.randomUUID(), text, date: Date.now(), fromClient })
  await sb.from('leads').update({ messages, updated_at: Date.now() }).eq('id', lead.id as string)
}

async function addManagerMsg(sb: SbClient, lead: LeadRow, wsId: string, text: string) {
  await addMsg(sb, lead, wsId, text, false)
}

async function notifyOTR(sb: SbClient, lead: LeadRow, wsId: string, text: string, _tok: string, _name: string) {
  const fresh    = await getLead(sb, wsId, Number(lead.tg_chat_id))
  const messages = [...((fresh?.messages ?? lead.messages ?? []) as LeadRow[])]
  messages.push({ id: crypto.randomUUID(), text, date: Date.now(), fromClient: true })
  await sb.from('leads').update({ messages, updated_at: Date.now() }).eq('id', lead.id as string)
  pushNotify(sb, wsId, String(lead.name ?? 'Клиент'), text).catch(() => {})
}

// ─── PUSH NOTIFICATIONS ───────────────────────────────────────────────────────

async function pushNotify(sb: SbClient, wsId: string, name: string, text: string) {
  const VAPID_PUB = 'BK5eS4qOz28ezTLb3ejmOUHNsF65l2LegtHO5wHUgYkFyHvhyaG1tJ43agB7941XXTVmImeMPoULFwPexgCq01I'
  const vapidPriv = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
  const contact   = Deno.env.get('VAPID_CONTACT') ?? 'mailto:admin@adervis.ru'
  if (!vapidPriv) return

  const { data: subs } = await sb.from('push_subscriptions')
    .select('subscription').eq('workspace_id', wsId)
  if (!subs?.length) return

  const privKey = await importVapidKey(vapidPriv)
  const payload = JSON.stringify({ title: `💬 ${name}`, body: text.slice(0, 100), url: '/' })
  await Promise.allSettled(subs.map(({ subscription }) =>
    webPush(subscription as PushSub, payload, privKey, contact, VAPID_PUB)
  ))
}

// ─── TG SEND HELPER ──────────────────────────────────────────────────────────

async function tgSend(tok: string, chatId: number, text: string, replyMarkup?: Record<string, unknown>) {
  const body: Record<string, unknown> = { chat_id: chatId, text }
  if (replyMarkup) body.reply_markup = replyMarkup
  await fetch(`https://api.telegram.org/bot${tok}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  }).catch(e => console.error('tgSend failed:', e))
}

// ─── VAPID / WEB PUSH (unchanged) ────────────────────────────────────────────

interface PushSub { endpoint: string; keys: { p256dh: string; auth: string } }

async function webPush(sub: PushSub, payload: string, priv: CryptoKey, contact: string, pub: string) {
  const ep  = new URL(sub.endpoint)
  const aud = `${ep.protocol}//${ep.host}`
  const now = Math.floor(Date.now() / 1000)
  const jwt = await buildJWT(aud, now + 43200, contact, priv)
  const enc = await encryptPayload(payload, sub.keys.p256dh, sub.keys.auth)
  await fetch(sub.endpoint, {
    method: 'POST',
    headers: { 'Authorization': `vapid t=${jwt},k=${pub}`, 'Content-Type': 'application/octet-stream', 'Content-Encoding': 'aes128gcm', 'TTL': '86400' },
    body: enc,
  })
}

function b64u(i: string | ArrayBuffer) {
  const b = typeof i === 'string' ? new TextEncoder().encode(i) : new Uint8Array(i)
  let s = ''; b.forEach(x => s += String.fromCharCode(x))
  return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'')
}
function b64Dec(s: string) {
  const p = s.length % 4 === 0 ? '' : '='.repeat(4 - s.length % 4)
  const b = atob(s.replace(/-/g,'+').replace(/_/g,'/') + p)
  return Uint8Array.from(b, c => c.charCodeAt(0))
}
async function buildJWT(aud: string, exp: number, sub: string, key: CryptoKey) {
  const h = b64u(JSON.stringify({typ:'JWT',alg:'ES256'}))
  const p = b64u(JSON.stringify({aud,exp,sub}))
  const sig = await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'}, key, new TextEncoder().encode(`${h}.${p}`))
  return `${h}.${p}.${b64u(sig)}`
}
async function importVapidKey(b64: string) {
  const raw = b64Dec(b64)
  const hdr = new Uint8Array([0x30,0x41,0x02,0x01,0x00,0x30,0x13,0x06,0x07,0x2a,0x86,0x48,0xce,0x3d,0x02,0x01,0x06,0x08,0x2a,0x86,0x48,0xce,0x3d,0x03,0x01,0x07,0x04,0x27,0x30,0x25,0x02,0x01,0x01,0x04,0x20])
  const pkcs8 = new Uint8Array(hdr.length + raw.length); pkcs8.set(hdr); pkcs8.set(raw, hdr.length)
  return crypto.subtle.importKey('pkcs8', pkcs8, {name:'ECDSA',namedCurve:'P-256'}, false, ['sign'])
}
function cat(...a: Uint8Array[]) {
  const t = a.reduce((s,x)=>s+x.length,0), o = new Uint8Array(t); let f=0
  for (const x of a) { o.set(x,f); f+=x.length } return o
}
function lenPfx(b: Uint8Array) {
  const o = new Uint8Array(2+b.length); o[0]=(b.length>>8)&0xff; o[1]=b.length&0xff; o.set(b,2); return o
}
async function encryptPayload(plain: string, p256: string, auth: string) {
  const enc = new TextEncoder()
  const aKey = b64Dec(auth), pKey = b64Dec(p256)
  const rPub = await crypto.subtle.importKey('raw', pKey, {name:'ECDH',namedCurve:'P-256'}, true, [])
  const sKP  = await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'}, true, ['deriveBits'])
  const sPub = new Uint8Array(await crypto.subtle.exportKey('raw', sKP.publicKey))
  const shrd = await crypto.subtle.deriveBits({name:'ECDH',public:rPub}, sKP.privateKey, 256)
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const ikm  = await hkdfX(aKey, new Uint8Array(shrd))
  const info = cat(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([0x00]), enc.encode('P-256\0'), lenPfx(pKey), lenPfx(sPub))
  const cKey = await hkdfE(ikm, cat(salt, info), 16)
  const nonce= await hkdfE(ikm, cat(salt, enc.encode('Content-Encoding: nonce\0'), new Uint8Array([0x00])), 12)
  const aes  = await crypto.subtle.importKey('raw', cKey, 'AES-GCM', false, ['encrypt'])
  const ciph = new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce}, aes, cat(enc.encode(plain), new Uint8Array([0x02]))))
  return cat(salt, new Uint8Array([0x00,0x10,0x00,0x00]), new Uint8Array([sPub.length]), sPub, ciph)
}
async function hkdfX(s: Uint8Array, i: Uint8Array) {
  const k = await crypto.subtle.importKey('raw',s,{name:'HMAC',hash:'SHA-256'},false,['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC',k,i))
}
async function hkdfE(p: Uint8Array, info: Uint8Array, l: number) {
  const k = await crypto.subtle.importKey('raw',p,{name:'HMAC',hash:'SHA-256'},false,['sign'])
  return (new Uint8Array(await crypto.subtle.sign('HMAC',k,cat(info,new Uint8Array([0x01]))))).slice(0,l)
}
