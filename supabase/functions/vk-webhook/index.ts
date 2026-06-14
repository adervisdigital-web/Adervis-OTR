import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

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

  const peerId  = Number(msgObj.peer_id ?? msgObj.from_id)  // peer_id for messages.send
  const text    = String(msgObj.text ?? '')
  const vkDate  = Number(msgObj.date ?? 0)
  const dateMs  = vkDate ? vkDate * 1000 : Date.now()

  // Fix 3: NaN guard
  if (!peerId || isNaN(peerId)) return new Response('ok', { status: 200 })

  const workspaceId = settings.workspace_id

  // Найти лид по vk_peer_id
  const { data: existingLead } = await sb
    .from('leads')
    .select('id, messages')
    .eq('workspace_id', workspaceId)
    .eq('vk_peer_id', peerId)
    .maybeSingle()

  // Fix 1: Write message to DB immediately (without ai_draft)
  const newMessage: VkMessage = {
    id:         crypto.randomUUID(),
    text,
    date:       dateMs,
    fromClient: true
  }

  let leadId: string

  if (existingLead) {
    const messages = [...(existingLead.messages ?? []), newMessage]
    const { error } = await sb
      .from('leads')
      .update({ messages, updated_at: Date.now() })
      .eq('id', existingLead.id)
    if (error) {
      console.error('lead update failed:', error.message)
      return new Response('internal error', { status: 500 }) // VK will retry
    }
    leadId = existingLead.id
  } else {
    const newId = crypto.randomUUID()
    leadId = newId
    const { error } = await sb.from('leads').insert({
      id:            newId,
      workspace_id:  workspaceId,
      name:          `VK ${peerId}`,
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
  // Generate AI draft in background — fire and forget
  const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY') ?? ''
  if (GEMINI_KEY && text.trim()) {
    generateAndPatchDraft(sb, leadId, text, existingLead?.messages ?? [], newMessage.id).catch(
      e => console.error('ai draft patch failed:', e)
    )
  }

  return new Response('ok', { status: 200 })
})

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

  // Fetch current messages to find the new message and patch it
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
    // Fix 4: API key in header, not URL query param
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
