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
  mode: 'menu' | 'brief' | 'ai' | 'human'
  step?: number
  brief?: {
    business?: string; format?: string
    city?: string;     budget?: string
    name?: string;     contact?: string
  }
  aiRounds?: number
}

interface WsConfig {
  tok:            string
  welcomeText:    string
  welcomeTextB:   string | null
  abEnabled:      boolean
  portfolioText:  string
  portfolioVideos: string[]
  briefQ:         string[]
  aiPrompt:       string
  managerChatId:  number
}

type SbClient = ReturnType<typeof createClient>
type LeadRow  = Record<string, unknown>

function buildVideoButtons(videos: string[]): { text: string; url: string }[][] {
  return videos
    .filter(u => u && u.trim())
    .slice(0, 5)
    .map((url, i) => [{ text: `🎬 Видео ${i + 1}`, url }])
}

// ─── BUDGET PARSER ───────────────────────────────────────────────────────────

function parseBudget(text: string): number | null {
  if (!text) return null
  if (text.includes('до 30') || text.includes('до30')) return 15000
  if (text.includes('30–100') || text.includes('30-100')) return 55000
  if (text.includes('100 000 ₽+') || text.includes('100к+') || text.includes('100000+')) return 140000
  if (text.toLowerCase().includes('обсудим')) return 250000
  return null
}

// ─── MAIN HANDLER ────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('ok')

  const wsId = new URL(req.url).searchParams.get('ws')
  if (!wsId) return new Response('missing ws', { status: 400 })

  let upd: Record<string, unknown>
  try { upd = await req.json() } catch { return new Response('bad json', { status: 400 }) }

  const sb = createClient(SUPABASE_URL, SERVICE_KEY)
  const { data: ws } = await sb
    .from('workspace_settings')
    .select('tg_bot_token, tg_welcome_text, tg_welcome_text_b, tg_ab_enabled, tg_manager_chat_id, tg_portfolio_text, tg_portfolio_videos, tg_brief_questions, tg_ai_prompt')
    .eq('workspace_id', wsId).maybeSingle()
  if (!ws?.tg_bot_token) return new Response('not configured', { status: 404 })
  const rawBriefQ = (ws as any).tg_brief_questions
  const cfg: WsConfig = {
    tok:            ws.tg_bot_token as string,
    welcomeText:    (ws as any).tg_welcome_text  as string | null || WELCOME_TEXT,
    welcomeTextB:   (ws as any).tg_welcome_text_b as string | null ?? null,
    abEnabled:      !!(ws as any).tg_ab_enabled,
    portfolioText:  (ws as any).tg_portfolio_text as string | null || PORTFOLIO_TEXT,
    portfolioVideos: Array.isArray((ws as any).tg_portfolio_videos)
      ? ((ws as any).tg_portfolio_videos as string[]).filter((u: string) => u && u.trim())
      : [],
    briefQ:         (Array.isArray(rawBriefQ) && rawBriefQ.length === 6) ? rawBriefQ as string[] : BRIEF_Q,
    aiPrompt:       (ws as any).tg_ai_prompt     as string | null || AI_PROMPT,
    managerChatId:  Number((ws as any).tg_manager_chat_id || 0),
  }

  try {
    const msg = upd.message        as LeadRow | undefined
    const cb  = upd.callback_query as LeadRow | undefined

    if (msg) await handleMessage(msg, sb, cfg, wsId)
    if (cb)  {
      await handleCallback(cb, sb, cfg, wsId)
      fetch(`https://api.telegram.org/bot${cfg.tok}/answerCallbackQuery`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ callback_query_id: cb.id })
      }).catch(() => {})
    }
  } catch (e) { console.error('handler error:', e) }

  return new Response('ok', { status: 200 })
})

// ─── MESSAGE HANDLER ─────────────────────────────────────────────────────────

async function handleMessage(msg: LeadRow, sb: SbClient, cfg: WsConfig, wsId: string) {
  const chatId = Number((msg.chat as LeadRow)?.id ?? 0)
  if (!chatId) return

  // Voice/video_note → transcribe via Gemini
  const voiceObj = (msg.voice ?? msg.video_note) as LeadRow | undefined
  let text = String(msg.text ?? '').trim()
  if (!text && voiceObj?.file_id) {
    const transcript = await transcribeVoice(cfg.tok, String(voiceObj.file_id))
    if (transcript) {
      text = transcript
      await tgSend(cfg.tok, chatId, `🎙 Распознал: «${transcript.slice(0, 100)}${transcript.length > 100 ? '…' : ''}»`)
    } else {
      await tgSend(cfg.tok, chatId, '⚠️ Не удалось распознать голосовое. Напишите текстом, пожалуйста.')
      return
    }
  }
  if (!text) return

  const from        = msg.from as LeadRow | undefined
  const firstName   = String(from?.first_name ?? '')
  const username    = String(from?.username   ?? '')
  const displayName = firstName || (username ? '@' + username : `TG ${chatId}`)

  let lead = await getLead(sb, wsId, chatId)
  if (!lead) lead = await createLead(sb, wsId, chatId, displayName, username)
  if (!lead) return

  // A/B variant — assigned once on first contact, reused on all subsequent messages
  let effectiveWelcome = cfg.welcomeText
  if (cfg.abEnabled && cfg.welcomeTextB) {
    const existing = (lead.ab_variant as string | null) ?? null
    let variant = existing
    if (!variant) {
      variant = Math.random() < 0.5 ? 'A' : 'B'
      await sb.from('leads').update({ ab_variant: variant }).eq('id', lead.id as string)
      ;(lead as any).ab_variant = variant
    }
    if (variant === 'B') effectiveWelcome = cfg.welcomeTextB!
  }

  const state: TgState = (lead.tg_state as TgState) ?? { mode: 'menu', aiRounds: 0, brief: {} }

  // Commands
  if (text === '/start' || text === '/menu') {
    await tgSend(cfg.tok, chatId, effectiveWelcome, MAIN_KB)
    await setState(sb, lead.id as string, { mode: 'menu', aiRounds: 0, brief: {} })
    await addMsg(sb, lead, wsId, text, true, 'system')
    return
  }
  if (text === '/portfolio') {
    const vids = buildVideoButtons(cfg.portfolioVideos)
    const vidKb = vids.length ? { inline_keyboard: [...vids, ...ACTION_KB.inline_keyboard] } : ACTION_KB
    await tgSend(cfg.tok, chatId, cfg.portfolioText, vidKb)
    await addMsg(sb, lead, wsId, text, true, 'system')
    return
  }
  if (text === '/brief') {
    await startBrief(sb, lead, cfg, chatId)
    await addMsg(sb, lead, wsId, text, true, 'system')
    return
  }
  if (text === '/manager') {
    await tgSend(cfg.tok, chatId, '👨‍💼 Передаю менеджеру! Свяжется в ближайшее время.')
    await addMsg(sb, lead, wsId, 'Запрос: /manager', true, 'system')
    await notifyOTR(sb, lead, wsId, '💬 Клиент запросил связь с менеджером', cfg.tok, displayName)
    return
  }
  if (text === '/getchatid') {
    await tgSend(cfg.tok, chatId, `Ваш Telegram Chat ID: ${chatId}\n\nВставьте это число в настройки OTR → TG Bot → Chat ID менеджера для уведомлений о заявках.`)
    return
  }

  // Store incoming — tag as brief_answer when inside brief flow
  const inBrief = state.mode === 'brief' && state.step !== undefined
  await addMsg(sb, lead, wsId, text, true, inBrief ? 'brief_answer' : undefined)

  // Classify service direction on first substantive message (fire-and-forget)
  if (!lead.service_category && text.length > 3 && !text.startsWith('/')) {
    classifyService(text).then(cat =>
      sb.from('leads').update({ service_category: cat }).eq('id', lead.id as string)
    ).catch(() => {})
  }

  // п.12: First-time visitor (no prior client messages) → show welcome + menu before AI
  const priorClientMsgs = ((lead.messages as LeadRow[] | null) ?? []).filter((m: any) => m.fromClient === true)
  if (priorClientMsgs.length === 0) {
    await tgSend(cfg.tok, chatId, effectiveWelcome, MAIN_KB)
  }

  // Human takeover — manager is handling, skip AI
  if (state.mode === 'human') {
    pushNotify(sb, wsId, displayName, text).catch(() => {})
    return
  }

  // Brief flow
  if (state.mode === 'brief' && state.step !== undefined) {
    await processBrief(sb, lead, state, text, cfg, chatId, wsId, displayName)
    return
  }

  // AI assistant
  const rounds = (state.aiRounds ?? 0) + 1
  const freshLead = await getLead(sb, wsId, chatId)
  const history = ((freshLead?.messages ?? []) as LeadRow[]).slice(-8)

  const aiReply = await aiResponse(text, history, (freshLead?.service_category as string) ?? undefined, cfg.aiPrompt || undefined)
  if (aiReply) {
    const showActions = rounds >= 2
    await tgSend(cfg.tok, chatId, aiReply + (showActions ? '\n\n💡 Хотите обсудить подробнее?' : ''),
      showActions ? ACTION_KB : undefined)
    await addManagerMsg(sb, lead, wsId, aiReply)
  }
  await setState(sb, lead.id as string, { ...state, mode: 'ai', aiRounds: rounds })
  pushNotify(sb, wsId, displayName, text).catch(() => {})
}

// ─── CALLBACK HANDLER ────────────────────────────────────────────────────────

async function handleCallback(cb: LeadRow, sb: SbClient, cfg: WsConfig, wsId: string) {
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
    const vids = buildVideoButtons(cfg.portfolioVideos)
    const vidKb = vids.length ? { inline_keyboard: [...vids, ...ACTION_KB.inline_keyboard] } : ACTION_KB
    await tgSend(cfg.tok, chatId, cfg.portfolioText, vidKb)
    await addMsg(sb, lead, wsId, '📹 [Примеры работ]', true, 'button')
    return
  }
  if (data === 'm:brief') {
    await startBrief(sb, lead, cfg, chatId)
    await addMsg(sb, lead, wsId, '📋 [Оставить заявку]', true, 'button')
    return
  }
  if (data === 'm:manager') {
    await tgSend(cfg.tok, chatId, '👨‍💼 Передаю менеджеру! Свяжется в ближайшее время.')
    await addMsg(sb, lead, wsId, '💬 [Написать менеджеру]', true, 'button')
    await notifyOTR(sb, lead, wsId, '💬 Клиент запросил связь с менеджером', cfg.tok, displayName)
    return
  }

  // Brief: format button
  if (data.startsWith('bf:') && state.mode === 'brief') {
    const format = data.slice(3)
    const ns: TgState = { ...state, brief: { ...state.brief, format }, step: 2 }
    await setState(sb, lead.id as string, ns)
    await addMsg(sb, lead, wsId, `Формат: ${format}`, true, 'brief_answer')
    await tgSend(cfg.tok, chatId, cfg.briefQ[2])
    return
  }

  // Brief: budget button
  if (data.startsWith('bb:') && state.mode === 'brief') {
    const budget = data.slice(3)
    const ns: TgState = { ...state, brief: { ...state.brief, budget }, step: 4 }
    await setState(sb, lead.id as string, ns)
    await addMsg(sb, lead, wsId, `Бюджет: ${budget}`, true, 'brief_answer')
    await tgSend(cfg.tok, chatId, cfg.briefQ[4])
  }
}

// ─── BRIEF STATE MACHINE ─────────────────────────────────────────────────────

async function startBrief(sb: SbClient, lead: LeadRow, cfg: WsConfig, chatId: number) {
  await setState(sb, lead.id as string, { mode: 'brief', step: 0, brief: {}, aiRounds: 0 })
  await tgSend(cfg.tok, chatId, '📋 Отлично! Заполним короткую анкету — 1 минута.\n\n' + cfg.briefQ[0])
}

async function processBrief(
  sb: SbClient, lead: LeadRow, state: TgState, text: string,
  cfg: WsConfig, chatId: number, wsId: string, displayName: string
) {
  const step  = state.step ?? 0
  const brief = state.brief ?? {}

  switch (step) {
    case 0:  // business → show format buttons
      await setState(sb, lead.id as string, { ...state, brief: { ...brief, business: text }, step: 1 })
      await tgSend(cfg.tok, chatId, cfg.briefQ[1], FORMAT_KB)
      break

    case 2:  // city → show budget buttons
      await setState(sb, lead.id as string, { ...state, brief: { ...brief, city: text }, step: 3 })
      await tgSend(cfg.tok, chatId, cfg.briefQ[3], BUDGET_KB)
      break

    case 4:  // name → ask contact
      await setState(sb, lead.id as string, { ...state, brief: { ...brief, name: text }, step: 5 })
      await tgSend(cfg.tok, chatId, cfg.briefQ[5])
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

      await tgSend(cfg.tok, chatId, recap)
      await tgSend(cfg.tok, chatId, '🙌 Пока ждёте — посмотрите наши работы:', {
        inline_keyboard: [[{ text: '📹 Примеры работ', callback_data: 'm:portfolio' }]]
      })

      // Brief summary card in chat history
      await addMsg(sb, lead, wsId, '📋 Заявка заполнена', false, 'brief_complete', { brief: b })

      // Push notification to OTR browser
      const briefNote = [
        '🔥 НОВАЯ ЗАЯВКА (бриф заполнен)',
        `Бизнес: ${b.business || '—'}`,
        `Формат: ${b.format   || '—'}`,
        `Город: ${b.city      || '—'}`,
        `Бюджет: ${b.budget   || '—'}`,
        `Имя: ${b.name        || '—'}`,
        `Контакт: ${b.contact || '—'}`,
      ].join('\n')
      pushNotify(sb, wsId, String(lead.name ?? 'Клиент'), '🔥 Новая заявка!').catch(() => {})

      // Await AI scoring so score is available for manager notification
      const scoreResult = await scoreBrief(sb, lead.id as string, b, (lead.service_category as string) ?? 'unknown').catch(() => null)

      // Fire-and-forget: notify manager in Telegram (with score if available)
      notifyManagerTg(cfg.tok, cfg.managerChatId, b, displayName, (lead.service_category as string) ?? '', scoreResult).catch(() => {})

      // Update lead status and notes (messages already updated by addMsg above)
      const budgetVal = parseBudget(b.budget ?? '')
      const updatePayload: Record<string, unknown> = {
        status:     2,
        notes:      briefNote,
        updated_at: Date.now(),
      }
      if (budgetVal !== null) updatePayload.deal_budget = budgetVal
      await sb.from('leads').update(updatePayload).eq('id', lead.id as string)
      break
    }
  }
}

// ─── VOICE TRANSCRIPTION ─────────────────────────────────────────────────────

async function transcribeVoice(tok: string, fileId: string): Promise<string> {
  if (!GEMINI_KEY) return ''
  try {
    const fRes = await fetch(`https://api.telegram.org/bot${tok}/getFile?file_id=${encodeURIComponent(fileId)}`)
    const fData = await fRes.json()
    const filePath = fData?.result?.file_path as string | undefined
    if (!filePath) return ''

    const dlRes = await fetch(`https://api.telegram.org/file/bot${tok}/${filePath}`)
    if (!dlRes.ok) return ''
    const buf = await dlRes.arrayBuffer()

    // Chunked base64 to avoid stack overflow on large voice files
    const bytes = new Uint8Array(buf)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    const b64 = btoa(binary)

    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
        body:    JSON.stringify({
          contents: [{ parts: [
            { inlineData: { mimeType: 'audio/ogg', data: b64 } },
            { text: 'Точно транскрибируй голосовое сообщение на русском языке. Только текст транскрипции, без пояснений и кавычек.' }
          ]}],
          generationConfig: { temperature: 0 }
        })
      }
    )
    const d = await res.json()
    return (d?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim()
  } catch { return '' }
}

// ─── SERVICE CLASSIFIER ──────────────────────────────────────────────────────

async function classifyService(text: string): Promise<string> {
  if (!GEMINI_KEY) return 'unknown'
  const prompt = `Ты классификатор запросов для агентства ADERVIS.
Направления агентства: video (видеосъёмка, монтаж, сценарий, Reels, Shorts, рекламные ролики), design (дизайн: логотипы, брендинг, SMM-графика, баннеры), photo (фотосъёмка бизнеса, продуктовая, репортажная), ai (ИИ-решения: боты, автоматизация, нейросети, генерация контента).
Клиент написал: «${text.slice(0, 300)}»
Ответь ОДНИМ словом без пояснений: video, design, photo, ai или unknown.`
  try {
    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 10, temperature: 0 }
        })
      }
    )
    const d = await res.json()
    const cat = (d?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim().toLowerCase()
    return ['video', 'design', 'photo', 'ai'].includes(cat) ? cat : 'unknown'
  } catch { return 'unknown' }
}

// ─── BRIEF SCORING ───────────────────────────────────────────────────────────

async function scoreBrief(
  sb: SbClient, leadId: string,
  brief: Record<string, unknown>, category: string
): Promise<{ score: number; reason: string } | null> {
  if (!GEMINI_KEY) return
  const prompt = `Ты эксперт по продажам видеостудии ADERVIS. Оцени качество лида от 1 до 100.

Бриф:
- Бизнес: ${brief.business || '—'}
- Формат: ${brief.format   || '—'}
- Город: ${brief.city      || '—'}
- Бюджет: ${brief.budget   || '—'}
- Имя: ${brief.name        || '—'}
- Контакт: ${brief.contact || '—'}
- Направление: ${category  || '—'}

Критерии (сумма = итоговый балл 0–100):
+30 — бюджет "100 000 ₽+" или "Обсудим"
+20 — бюджет "30–100 000 ₽"
+20 — конкретный формат (не "Другой" и не "—")
+15 — указал имя И контакт (оба заполнены)
+10 — крупный город (Москва, СПб, Екатеринбург, Казань, Новосибирск)
+5  — другой город указан

Ответь ТОЛЬКО валидным JSON без markdown-обёрток: {"score":85,"reason":"Бюджет 100K+, Reels, Москва"}`

  try {
    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
        body:    JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 60, temperature: 0 }
        })
      }
    )
    const d     = await res.json()
    const raw   = (d?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim()
    const clean = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(clean)
    const score  = Math.max(1, Math.min(100, Number(parsed.score) || 0))
    const reason = String(parsed.reason || '').slice(0, 200)
    if (score > 0) {
      await sb.from('leads').update({ deal_score: score, deal_score_reason: reason }).eq('id', leadId)
      return { score, reason }
    }
    return null
  } catch { return null }
}

// ─── AI RESPONSE ─────────────────────────────────────────────────────────────

async function aiResponse(userText: string, history: LeadRow[], category?: string, customPrompt?: string): Promise<string> {
  if (!GEMINI_KEY) return ''

  const CAT_CTX: Record<string, string> = {
    video:  '\n\nТекущий запрос клиента касается ВИДЕО (съёмка, монтаж, сценарий, Reels, Shorts, VK Клипы, рекламные ролики). Фокусируй ответ на видеопроизводстве.',
    design: '\n\nТекущий запрос клиента касается ДИЗАЙНА (логотипы, фирменный стиль, брендинг, SMM-графика, баннеры). Фокусируй ответ на дизайне.',
    photo:  '\n\nТекущий запрос клиента касается ФОТО (фотосъёмка бизнеса, продуктовая фото, репортажная съёмка). Фокусируй ответ на фотографии.',
    ai:     '\n\nТекущий запрос клиента касается ИИ-РЕШЕНИЙ (чат-боты, автоматизация, нейросети, генерация контента). Фокусируй ответ на AI-услугах.',
  }
  const categoryContext = (category && CAT_CTX[category]) ?? ''

  const recent = history.slice(-6)
    .map(m => (m.fromClient ? 'Клиент' : 'Менеджер') + ': «' + String(m.text ?? '').slice(0, 200) + '»')
    .join('\n')

  const prompt = [
    (customPrompt || AI_PROMPT) + categoryContext,
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

async function addMsg(
  sb: SbClient, lead: LeadRow, wsId: string,
  text: string, fromClient: boolean,
  type?: 'button' | 'brief_answer' | 'reminder' | 'system' | 'brief_complete',
  extra?: Record<string, unknown>
) {
  const fresh    = await getLead(sb, wsId, Number(lead.tg_chat_id))
  const messages = [...((fresh?.messages ?? lead.messages ?? []) as LeadRow[])]
  const entry: Record<string, unknown> = { id: crypto.randomUUID(), text, date: Date.now(), fromClient }
  if (type)  entry.type = type
  if (extra) Object.assign(entry, extra)
  messages.push(entry)
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

// ─── MANAGER TG NOTIFICATION ─────────────────────────────────────────────────

async function notifyManagerTg(
  tok: string, managerChatId: number,
  brief: Record<string, unknown>, displayName: string, category: string,
  scoreResult?: { score: number; reason: string } | null
): Promise<void> {
  if (!managerChatId) return
  const managerId = managerChatId

  const CAT_RU: Record<string, string> = { video: 'Видео', design: 'Дизайн', photo: 'Фото', ai: 'ИИ' }
  const catLabel = CAT_RU[category] ?? ''
  const lines = [
    '🔥 Новая заявка!',
    '',
    `👤 ${displayName}`,
    `🏢 Бизнес: ${brief.business || '—'}`,
    `🎬 Формат: ${brief.format   || '—'}`,
    `📍 Город: ${brief.city      || '—'}`,
    `💰 Бюджет: ${brief.budget   || '—'}`,
    `📞 Контакт: ${brief.contact || '—'}`,
    catLabel ? `🎯 Направление: ${catLabel}` : '',
    scoreResult ? `⭐ AI оценка: ${scoreResult.score}/100 — ${scoreResult.reason}` : '',
  ].filter(Boolean)

  await tgSend(tok, managerId, lines.join('\n'))
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
