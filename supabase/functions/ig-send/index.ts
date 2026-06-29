import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: CORS })
  if (req.method !== 'POST') return json({ ok: false, error: 'method not allowed' }, 405)

  let body: { lead_id: string; message: string; workspace_id: string }
  try { body = await req.json() } catch { return json({ ok: false, error: 'bad json' }, 400) }

  const { lead_id, message, workspace_id } = body
  if (!lead_id || !message || !workspace_id) {
    return json({ ok: false, error: 'missing fields' }, 400)
  }
  if (message.length > 1000) return json({ ok: false, error: 'message too long' }, 400)

  const sb = createClient(SUPABASE_URL, SERVICE_KEY)

  // Get page token
  const { data: settings } = await sb
    .from('workspace_settings')
    .select('ig_page_token')
    .eq('workspace_id', workspace_id)
    .maybeSingle()

  const pageToken = (settings as Record<string, unknown> | null)?.ig_page_token as string | null
  if (!pageToken) return json({ ok: false, error: 'Instagram not configured' }, 400)

  // Get ig_user_id from lead
  const { data: lead } = await sb
    .from('leads')
    .select('ig_user_id, messages')
    .eq('id', lead_id)
    .eq('workspace_id', workspace_id)
    .maybeSingle()

  if (!lead) return json({ ok: false, error: 'Lead not found' }, 404)

  const igUserId = (lead as Record<string, unknown>).ig_user_id as string | null
  if (!igUserId) return json({ ok: false, error: 'Lead has no ig_user_id' }, 400)

  // Send via Instagram Graph API
  let igRes: Record<string, unknown>
  try {
    const res = await fetch('https://graph.facebook.com/v19.0/me/messages', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${pageToken}`,
      },
      body: JSON.stringify({
        recipient: { id: igUserId },
        message:   { text: message },
      }),
    })
    igRes = await res.json() as Record<string, unknown>
    if (!res.ok) {
      console.error('IG send error:', igRes)
      return json({ ok: false, error: String(igRes.error ?? 'IG API error') }, 400)
    }
  } catch (e) {
    console.error('IG fetch failed:', e)
    return json({ ok: false, error: 'IG network error' }, 502)
  }

  // Save message to lead history
  const newMsg = {
    id:         crypto.randomUUID(),
    text:       message,
    date:       Date.now(),
    fromClient: false,
    platform:   'ig',
    ig_sent:    true,
  }
  const messages = [...((lead as Record<string, unknown>).messages as unknown[] ?? []), newMsg]
  await sb.from('leads').update({
    messages,
    updated_at: Date.now(),
  }).eq('id', lead_id)

  return json({ ok: true, message_id: igRes.message_id })
})

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json', ...CORS }
  })
}
