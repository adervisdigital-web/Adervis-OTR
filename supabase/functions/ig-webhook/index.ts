import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const GEMINI_KEY   = Deno.env.get('GEMINI_API_KEY') ?? ''

type SbClient = ReturnType<typeof createClient>

// ─── MAIN HANDLER ────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const url = new URL(req.url)

  // ── Webhook verification (GET from Meta) ──────────────────────────────────
  if (req.method === 'GET') {
    const mode      = url.searchParams.get('hub.mode')
    const token     = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')

    if (mode !== 'subscribe' || !challenge) {
      return new Response('Bad request', { status: 400 })
    }

    const wsId = url.searchParams.get('ws')
    if (!wsId) return new Response('missing ws', { status: 400 })

    const sb = createClient(SUPABASE_URL, SERVICE_KEY)
    const { data: ws } = await sb
      .from('workspace_settings')
      .select('ig_verify_token')
      .eq('workspace_id', wsId)
      .maybeSingle()

    const expectedToken = (ws as Record<string, unknown>)?.ig_verify_token as string | null
    if (!expectedToken || token !== expectedToken) {
      return new Response('Forbidden', { status: 403 })
    }

    return new Response(challenge, { status: 200 })
  }

  // ── Incoming DM (POST from Meta) ──────────────────────────────────────────
  if (req.method !== 'POST') return new Response('ok')

  const wsId = url.searchParams.get('ws')
  if (!wsId) return new Response('missing ws', { status: 400 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return new Response('bad json', { status: 400 }) }

  // Meta sends entry array
  if (body.object !== 'instagram') return new Response('ok')

  const entries = (body.entry as Record<string, unknown>[]) ?? []
  const sb = createClient(SUPABASE_URL, SERVICE_KEY)

  // Load workspace settings once
  const { data: ws } = await sb
    .from('workspace_settings')
    .select('ig_page_token, ig_ai_enabled')
    .eq('workspace_id', wsId)
    .maybeSingle()
  if (!ws) return new Response('not configured', { status: 404 })

  const pageToken  = (ws as Record<string, unknown>).ig_page_token as string | null
  const aiEnabled  = !!(ws as Record<string, unknown>).ig_ai_enabled

  for (const entry of entries) {
    const messaging = (entry.messaging as Record<string, unknown>[]) ?? []
    for (const event of messaging) {
      const senderId = String((event.sender as Record<string, unknown>)?.id ?? '')
      const msg      = event.message as Record<string, unknown> | undefined
      if (!senderId || !msg || msg.is_echo) continue

      const text = String(msg.text ?? '').trim()
      if (!text) continue

      try {
        await handleIncoming(sb, wsId, senderId, text, pageToken, aiEnabled)
      } catch (e) {
        console.error('handleIncoming error:', e)
      }
    }
  }

  return new Response('ok', { status: 200 })
})

// ─── HANDLE INCOMING MESSAGE ─────────────────────────────────────────────────

async function handleIncoming(
  sb: SbClient,
  wsId: string,
  igUserId: string,
  text: string,
  pageToken: string | null,
  aiEnabled: boolean
) {
  // Find or create lead
  let { data: lead } = await sb
    .from('leads')
    .select('id, name, messages, ig_mode')
    .eq('workspace_id', wsId)
    .eq('ig_user_id', igUserId)
    .maybeSingle()

  const now = Date.now()

  if (!lead) {
    // New lead from Instagram DM
    const { data: newLead } = await sb
      .from('leads')
      .insert({
        id:           crypto.randomUUID(),
        workspace_id: wsId,
        name:         `Instagram ${igUserId.slice(-6)}`,
        link:         `https://www.instagram.com/direct/t/${igUserId}`,
        contact:      igUserId,
        biz_type:     'Неизвестно',
        status:       0,
        updated_at:   now,
        ig_user_id:   igUserId,
        ig_mode:      'ai',
        messages:     [],
      })
      .select()
      .maybeSingle()
    lead = newLead
  }

  if (!lead) return

  // Append incoming message
  const inMsg = {
    id:         crypto.randomUUID(),
    text,
    date:       now,
    fromClient: true,
    platform:   'ig',
  }
  const messages = [...((lead.messages as unknown[]) ?? []), inMsg]

  await sb.from('leads').update({
    messages,
    updated_at: now,
    status:     Math.max(Number(lead.status ?? 0), 1), // move to "in dialogue"
  }).eq('id', lead.id)

  // AI auto-reply if enabled and not in human mode
  const mode = (lead.ig_mode as string) ?? 'ai'
  if (aiEnabled && mode !== 'human' && pageToken && GEMINI_KEY) {
    const reply = await generateAiReply(text, messages)
    if (reply) {
      await igSend(pageToken, igUserId, reply)
      const outMsg = {
        id:         crypto.randomUUID(),
        text:       reply,
        date:       Date.now(),
        fromClient: false,
        platform:   'ig',
        ai_sent:    true,
      }
      await sb.from('leads').update({
        messages:   [...messages, outMsg],
        updated_at: Date.now(),
      }).eq('id', lead.id)
    }
  }
}

// ─── SEND via Instagram Graph API ────────────────────────────────────────────

async function igSend(pageToken: string, recipientId: string, text: string): Promise<boolean> {
  try {
    const res = await fetch('https://graph.facebook.com/v19.0/me/messages', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${pageToken}`,
      },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message:   { text: text.slice(0, 1000) },
      }),
    })
    const data = await res.json() as Record<string, unknown>
    if (!res.ok) { console.error('igSend error:', data); return false }
    return true
  } catch (e) {
    console.error('igSend fetch error:', e)
    return false
  }
}

// ─── GEMINI AI REPLY ──────────────────────────────────────────────────────────

async function generateAiReply(
  userText: string,
  history: unknown[]
): Promise<string | null> {
  if (!GEMINI_KEY) return null

  const prompt = `Ты — менеджер видеостудии ADERVIS. Отвечаешь на Instagram DM от потенциального клиента.

О студии: снимаем рекламные ролики, Reels, Shorts, корпоративные видео. Работаем по всей России.
Портфолио: adervis.ru

Правила:
- Максимум 3 предложения
- Дружелюбно, без официоза
- Заканчивай вопросом или призывом
- Предложи оставить заявку после 2 обменов

Последнее сообщение клиента: "${userText.slice(0, 200).replace(/[\r\n]/g, ' ')}"`

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 200, temperature: 0.7 },
        }),
      }
    )
    const data = await res.json() as Record<string, unknown>
    const text = (data?.candidates as Record<string, unknown>[])?.[0]
      ?.content as Record<string, unknown>
    return String((text?.parts as Record<string, unknown>[])?.[0]?.text ?? '').trim() || null
  } catch (e) {
    console.error('Gemini error:', e)
    return null
  }
}
