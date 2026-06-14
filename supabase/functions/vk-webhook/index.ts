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
