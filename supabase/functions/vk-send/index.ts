import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface SendBody {
  lead_id:      string
  message:      string
  workspace_id: string
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: CORS })
  }
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

  if (message.length > 4096) {
    return json({ ok: false, error: 'message too long (max 4096 chars)' }, 400)
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
    random_id:    String(Math.floor(Math.random() * 2147483647)),
    v:            '5.131',
    access_token: settings.vk_token
  })

  let vkData: Record<string, unknown>
  try {
    const vkRes = await fetch(
      'https://api.vk.com/method/messages.send',
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    vkParams
      }
    )
    vkData = await vkRes.json()
  } catch (e) {
    console.error('VK fetch failed:', e)
    return json({ ok: false, error: 'VK network error' }, 502)
  }

  if (vkData.error) {
    const vkErr = vkData.error as Record<string, unknown>
    return json({ ok: false, error: (vkErr?.error_msg as string) ?? 'VK error' }, 400)
  }

  // Записать сообщение в историю лида
  const newMsg = {
    id:         crypto.randomUUID(),
    text:       message,
    date:       Date.now(),
    fromClient: false,
    vk_sent:    true
  }
  const messages = [...(lead.messages ?? []), newMsg]

  const { error: updateErr } = await sb
    .from('leads')
    .update({ messages, updated_at: Date.now() })
    .eq('id', lead_id)

  if (updateErr) {
    console.error('lead update after send failed:', updateErr.message)
    // Non-fatal: message was sent to VK, just log the DB error
  }

  return json({ ok: true, vk_message_id: vkData.response })
})

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS }
  })
}
