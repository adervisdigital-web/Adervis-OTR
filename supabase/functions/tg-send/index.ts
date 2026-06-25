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
