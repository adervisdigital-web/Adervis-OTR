import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Implicit flow: браузер получает токен напрямую из VK, присылает сюда для сохранения
interface OAuthBody {
  access_token: string
  vk_user_id:  number
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

  const { access_token: vkToken, vk_user_id: vkUserId, workspace_id } = body
  if (!vkToken || !vkUserId || !workspace_id) return json({ ok: false, error: 'missing fields' }, 400)

  // Получить имя и фото пользователя
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

  // Upsert в vk_accounts
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
