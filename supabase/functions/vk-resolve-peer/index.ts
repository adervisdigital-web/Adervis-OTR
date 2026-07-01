import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface ResolveItem {
  lead_id:     string
  screen_name: string
}

interface ResolveBody {
  workspace_id: string
  items:        ResolveItem[]
}

interface ResolveResult {
  lead_id:  string
  peer_id:  number | null
  error?:   string
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return json({ ok: true }, 200)
  if (req.method !== 'POST') return json({ ok: false, error: 'method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace('Bearer ', '').trim()
  if (!token) return json({ ok: false, error: 'unauthorized' }, 401)

  const sbUser = createClient(SUPABASE_URL, ANON_KEY)
  const { data: { user }, error: authErr } = await sbUser.auth.getUser(token)
  if (authErr || !user) return json({ ok: false, error: 'unauthorized: ' + (authErr?.message ?? 'no user') }, 401)

  let body: ResolveBody
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: 'bad json' }, 400)
  }

  const { workspace_id, items } = body
  if (!workspace_id || !Array.isArray(items) || items.length === 0) {
    return json({ ok: false, error: 'missing fields' }, 400)
  }

  const sb = createClient(SUPABASE_URL, SERVICE_KEY)

  const { data: settings } = await sb
    .from('workspace_settings')
    .select('vk_token')
    .eq('workspace_id', workspace_id)
    .maybeSingle()

  if (!settings?.vk_token) {
    return json({ ok: false, error: 'VK token not configured' }, 400)
  }
  const vkToken = settings.vk_token as string

  const results: ResolveResult[] = []

  for (const item of items) {
    const params = new URLSearchParams({
      screen_name:  item.screen_name,
      v:            '5.131',
      access_token: vkToken,
    })
    try {
      const r = await fetch('https://api.vk.com/method/utils.resolveScreenName?' + params)
      const data = await r.json() as {
        response?: { type: string; object_id: number }
        error?:    { error_msg: string }
      }
      if (data.error) {
        results.push({ lead_id: item.lead_id, peer_id: null, error: data.error.error_msg })
      } else if (data.response?.object_id) {
        const isGroup = data.response.type === 'group' || data.response.type === 'club' || data.response.type === 'application'
        results.push({
          lead_id: item.lead_id,
          peer_id: isGroup ? -data.response.object_id : data.response.object_id,
        })
      } else {
        results.push({ lead_id: item.lead_id, peer_id: null, error: 'not found' })
      }
    } catch (e) {
      results.push({ lead_id: item.lead_id, peer_id: null, error: 'VK network error: ' + String(e) })
    }
    // VK API allows ~3 requests/sec per token — stay well under that
    await new Promise((resolve) => setTimeout(resolve, 350))
  }

  return json({ ok: true, results })
})

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS }
  })
}
