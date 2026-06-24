import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface ImportBody {
  workspace_id: string
}

interface VkUser {
  id: number
  first_name: string
  last_name: string
  screen_name?: string
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return json({ ok: true }, 200)
  }
  if (req.method !== 'POST') {
    return json({ ok: false, error: 'method not allowed' }, 405)
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace('Bearer ', '').trim()
  if (!token) return json({ ok: false, error: 'unauthorized' }, 401)

  const sbUser = createClient(SUPABASE_URL, ANON_KEY)
  const { data: { user }, error: authErr } = await sbUser.auth.getUser(token)
  if (authErr || !user) return json({ ok: false, error: 'unauthorized' }, 401)

  let body: ImportBody
  try { body = await req.json() } catch { return json({ ok: false, error: 'bad json' }, 400) }

  const { workspace_id } = body
  if (!workspace_id) return json({ ok: false, error: 'missing workspace_id' }, 400)

  const sb = createClient(SUPABASE_URL, SERVICE_KEY)

  const { data: settings } = await sb
    .from('workspace_settings')
    .select('vk_token, vk_community_id')
    .eq('workspace_id', workspace_id)
    .maybeSingle()

  if (!settings?.vk_token || !settings?.vk_community_id) {
    return json({ ok: false, error: 'VK token or community ID not configured' }, 400)
  }

  const vkToken    = settings.vk_token as string
  const communityId = String(settings.vk_community_id)

  // Fetch up to 200 conversations from VK community inbox
  const convParams = new URLSearchParams({
    group_id:     communityId,
    count:        '200',
    v:            '5.131',
    access_token: vkToken,
  })
  let convData: Record<string, unknown>
  try {
    const r = await fetch(
      'https://api.vk.com/method/messages.getConversations?' + convParams
    )
    convData = await r.json()
  } catch (e) {
    return json({ ok: false, error: 'VK network error: ' + String(e) }, 502)
  }

  if ((convData as { error?: unknown }).error) {
    const err = (convData as { error: Record<string, unknown> }).error
    return json({ ok: false, error: err?.error_msg ?? 'VK API error' }, 400)
  }

  const items = ((convData as { response?: { items?: unknown[] } }).response?.items ?? []) as Array<{
    conversation: { peer: { id: number; type: string } }
    last_message: { text: string; date: number; from_id: number }
  }>

  // Keep only user conversations (not chats, not bots)
  const userConvs = items.filter(i => i.conversation?.peer?.type === 'user')
  if (!userConvs.length) {
    return json({ ok: true, imported: 0, skipped: 0, leads: [] })
  }

  const peerIds = userConvs.map(i => i.conversation.peer.id)

  // Resolve user profiles in batches of 200 (VK limit)
  const userMap = new Map<number, VkUser>()
  const BATCH = 200
  for (let i = 0; i < peerIds.length; i += BATCH) {
    const batchIds = peerIds.slice(i, i + BATCH)
    const upParams = new URLSearchParams({
      user_ids:     batchIds.join(','),
      fields:       'screen_name',
      v:            '5.131',
      access_token: vkToken,
    })
    let uData: Record<string, unknown>
    try {
      const r = await fetch('https://api.vk.com/method/users.get?' + upParams)
      uData = await r.json()
    } catch { continue }
    const users = ((uData as { response?: VkUser[] }).response ?? [])
    users.forEach(u => userMap.set(u.id, u))
  }

  // Build lead upsert list
  const leadsToUpsert = userConvs.map(conv => {
    const peerId = conv.conversation.peer.id
    const user   = userMap.get(peerId)
    const name   = user ? (user.first_name + ' ' + user.last_name).trim() : 'VK ' + peerId
    const slug   = user?.screen_name || 'id' + peerId
    const link   = 'https://vk.com/' + slug
    return {
      workspace_id,
      vk_peer_id:  peerId,
      name,
      link,
      contact:     '@' + slug,
      status:      1,           // ледокол отправлен (уже в переписке)
      updated_at:  Date.now(),
    }
  })

  // Upsert on vk_peer_id — never overwrite existing status/messages
  let imported = 0, skipped = 0
  for (const lead of leadsToUpsert) {
    const { data: existing } = await sb
      .from('leads')
      .select('id')
      .eq('workspace_id', workspace_id)
      .eq('vk_peer_id', lead.vk_peer_id)
      .maybeSingle()

    if (existing) { skipped++; continue }

    const { error } = await sb.from('leads').insert(lead)
    if (!error) imported++
  }

  return json({ ok: true, imported, skipped, total: leadsToUpsert.length })
})

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS }
  })
}
