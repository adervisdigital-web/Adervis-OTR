import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!
const ANON_KEY      = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VK_APP_ID     = '54652870'
const VK_SECRET     = Deno.env.get('VK_CLIENT_SECRET')!
const REDIRECT_URI  = 'https://otr.adervis.ru'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface OAuthBody {
  code:         string
  workspace_id: string
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: CORS })
  if (req.method !== 'POST') return json({ ok: false, error: 'method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace('Bearer ', '').trim()
  if (!token) return json({ ok: false, error: 'unauthorized' }, 401)

  const sbUser = createClient(SUPABASE_URL, ANON_KEY)
  const { data: { user }, error: authErr } = await sbUser.auth.getUser(token)
  if (authErr || !user) return json({ ok: false, error: 'unauthorized' }, 401)

  let body: OAuthBody
  try { body = await req.json() }
  catch { return json({ ok: false, error: 'bad json' }, 400) }

  const { code, workspace_id } = body
  if (!code || !workspace_id) return json({ ok: false, error: 'missing fields' }, 400)

  // Шаг 1: обменять OAuth code на access_token
  const tokenUrl = 'https://oauth.vk.com/access_token?' + new URLSearchParams({
    client_id:     VK_APP_ID,
    client_secret: VK_SECRET,
    redirect_uri:  REDIRECT_URI,
    code,
  })

  let vkToken: string
  let vkUserId: number
  try {
    const res  = await fetch(tokenUrl)
    const data = await res.json() as {
      access_token?: string
      user_id?:      number
      error?:        string
      error_description?: string
    }
    if (!data.access_token || !data.user_id) {
      return json({ ok: false, error: data.error_description ?? data.error ?? 'VK token error' }, 400)
    }
    vkToken  = data.access_token
    vkUserId = data.user_id
  } catch (e) {
    return json({ ok: false, error: 'VK network error: ' + String(e) }, 502)
  }

  // Шаг 2: получить имя и фото через VK API
  let displayName = 'ВК пользователь'
  let photoUrl    = ''
  try {
    const userRes = await fetch(
      'https://api.vk.com/method/users.get?' + new URLSearchParams({
        user_ids:     String(vkUserId),
        fields:       'photo_100',
        access_token: vkToken,
        v:            '5.199',
      })
    )
    const userData = await userRes.json() as {
      response?: Array<{ first_name: string; last_name: string; photo_100?: string }>
    }
    if (userData.response?.[0]) {
      const u = userData.response[0]
      displayName = (u.first_name + ' ' + u.last_name).trim()
      photoUrl    = u.photo_100 ?? ''
    }
  } catch {
    // Non-fatal
  }

  // Шаг 3: upsert в vk_accounts
  const sb = createClient(SUPABASE_URL, SERVICE_KEY)
  const { data: account, error: dbErr } = await sb
    .from('vk_accounts')
    .upsert({
      workspace_id,
      account_type: 'personal',
      vk_id:        vkUserId,
      access_token: vkToken,
      display_name: displayName,
      photo_url:    photoUrl,
      is_active:    true,
    }, { onConflict: 'workspace_id,vk_id' })
    .select('id, display_name, photo_url, vk_id')
    .single()

  if (dbErr) return json({ ok: false, error: 'DB error: ' + dbErr.message }, 500)

  return json({ ok: true, account })
})

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}
