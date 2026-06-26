import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const DEFAULT_REMINDER = `Привет! 👋

Вы писали нам, но мы ещё не успели поговорить подробнее.

Хотите узнать, как мы поможем привлечь гостей через короткие видео? Оставьте заявку — займёт 2 минуты 👇

/brief`

type SbClient = ReturnType<typeof createClient>

async function runReminders(sb: SbClient): Promise<{ sent: number; skipped: number }> {
  let sent = 0, skipped = 0

  const { data: workspaces, error: wsErr } = await sb
    .from('workspace_settings')
    .select('workspace_id, tg_bot_token, tg_reminder_text')
    .eq('tg_reminder_enabled', true)
    .not('tg_bot_token', 'is', null)

  if (wsErr) { console.error('ws query error:', wsErr); return { sent, skipped } }
  if (!workspaces?.length) return { sent, skipped }

  const now = Date.now()
  const h20 = now - 20 * 3600 * 1000
  const d7  = now - 7  * 86400 * 1000

  for (const ws of workspaces) {
    const tok  = ws.tg_bot_token as string
    const wsId = ws.workspace_id as string
    const text = (ws.tg_reminder_text as string | null)?.trim() || DEFAULT_REMINDER

    const { data: candidates } = await sb
      .from('leads')
      .select('id, tg_chat_id, tg_state, messages')
      .eq('workspace_id', wsId)
      .not('tg_chat_id', 'is', null)
      .is('archived_at', null)
      .is('tg_reminded_at', null)
      .in('status', [0, 1, 2])
      .lt('updated_at', h20)
      .gt('updated_at', d7)

    for (const lead of candidates ?? []) {
      const state = (lead.tg_state ?? {}) as Record<string, unknown>

      if (state.mode === 'human') { skipped++; continue }

      const brief  = (state.brief ?? {}) as Record<string, unknown>
      const filled = ['business', 'format', 'city', 'budget', 'name', 'contact'].filter(k => brief[k])
      if (filled.length >= 6) { skipped++; continue }

      const chatId = Number(lead.tg_chat_id)
      const ok = await fetch(`https://api.telegram.org/bot${tok}/sendMessage`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ chat_id: chatId, text }),
      }).then(r => r.ok).catch(() => false)

      if (!ok) { skipped++; continue }

      const messages = [...((lead.messages ?? []) as Record<string, unknown>[])]
      messages.push({ id: crypto.randomUUID(), text, date: now, fromClient: false, type: 'reminder' })

      await sb.from('leads').update({
        tg_reminded_at: now,
        messages,
        updated_at:     now,
      }).eq('id', lead.id as string)

      sent++
    }
  }

  return { sent, skipped }
}

Deno.cron('tg-reminders', '0 */6 * * *', async () => {
  const sb = createClient(SUPABASE_URL, SERVICE_KEY)
  const result = await runReminders(sb)
  console.log('tg-reminder cron:', result)
})

Deno.serve(async (req: Request) => {
  if (req.method === 'POST') {
    const sb = createClient(SUPABASE_URL, SERVICE_KEY)
    const result = await runReminders(sb)
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
      status: 200
    })
  }
  return new Response('tg-reminder ok', { status: 200 })
})
