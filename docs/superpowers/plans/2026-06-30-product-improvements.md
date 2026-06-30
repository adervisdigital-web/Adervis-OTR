# Product Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реализовать 10 продуктовых улучшений ADERVIS OTR: VK AI-ответ, мини-бриф VK, воронка с выручкой, дедупликация, время ответа, VK follow-up, быстрые ответы VK, счётчик дня, экспорт таргета, рефакторинг JS.

**Architecture:** Backend-изменения (задачи 1–2, 6) — Edge Functions Deno/TypeScript, деплой через `supabase functions deploy`. Frontend-изменения (задачи 3, 5, 7–9) — vanilla JS в `index.html`. Смешанные (задачи 3–4) — и то и другое + SQL миграция.

**Tech Stack:** Supabase Edge Functions (Deno/TypeScript), Vanilla JS, Supabase PostgreSQL, VK Callback API, Gemini 2.0 Flash, CSS Custom Properties.

---

## Файловая карта

| Файл | Задачи |
|------|--------|
| `supabase/functions/vk-webhook/index.ts` | 1, 2, 3, 4 |
| `supabase/functions/tg-webhook/index.ts` | 3, 4 |
| `supabase/functions/tg-reminder/index.ts` | 6 |
| `supabase/migrations/20260706_improvements.sql` | 2, 3, 6 |
| `index.html` | 3, 5, 7, 8, 9 |

---

## Задача 1: VK AI-автоответ на свободный текст

**Контекст:** `vk-webhook` при входящем тексте уже вызывает `generateAndPatchDraft()` — это записывает `ai_draft` на сообщение (черновик для менеджера). Нужно добавить реальный авто-ответ боту клиенту через `vkSendAndSave()`. Только для не-первых, не-кнопочных сообщений.

**Файлы:**
- Modify: `supabase/functions/vk-webhook/index.ts`

- [ ] **Step 1.1: Добавить функцию `generateVkAutoReply`**

В `vk-webhook/index.ts` после функции `generateAiDraft` добавить:

```typescript
async function generateVkAutoReply(
  token: string,
  peerId: number,
  userText: string,
  history: VkMessage[],
  sb: ReturnType<typeof createClient>,
  leadId: string
): Promise<void> {
  const geminiKey = Deno.env.get('GEMINI_API_KEY') ?? ''
  if (!geminiKey || !userText.trim()) return

  const recent = history.slice(-5).map(m =>
    (m.fromClient ? 'Клиент' : 'Менеджер/Бот') + ': «' + m.text.slice(0, 200) + '»'
  ).join('\n')

  const prompt = [
    'Ты — менеджер видеопродакшена ADERVIS.',
    'Снимаем короткие видео (VK Клипы, Reels, Shorts) для бизнеса — кафе, рестораны, барбершопы.',
    'Цель диалога: вызвать интерес и предложить оставить заявку.',
    recent ? `\nИстория диалога:\n${recent}` : '',
    `\nСообщение клиента: «${userText.slice(0, 300)}»`,
    '\nНапиши ОДИН ответ менеджера. Максимум 3 предложения. Без вводных слов типа "Конечно!" или "Отлично!".',
    'Закончи вопросом или призывом к действию. Пиши по-русски, дружелюбно.',
  ].join('\n')

  try {
    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 200, temperature: 0.65 }
        })
      }
    )
    const data = await res.json() as Record<string, unknown>
    const reply = (data?.candidates as any)?.[0]?.content?.parts?.[0]?.text?.trim() ?? ''
    if (!reply) return
    await vkSendAndSave(token, peerId, reply, sb, leadId, false)
  } catch (e) {
    console.error('vk auto-reply error:', e)
  }
}
```

- [ ] **Step 1.2: Вызвать `generateVkAutoReply` в основном handler**

Найти блок в main handler (после строки `// Fire-and-forget: AI draft + push notifications`):

```typescript
  // Fire-and-forget: AI draft + push notifications (skip for button presses)
  const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY') ?? ''
  if (!isButton && GEMINI_KEY && text.trim()) {
    generateAndPatchDraft(sb, leadId, text, existingLead?.messages ?? [], newMessage.id).catch(
      e => console.error('ai draft patch failed:', e)
    )
  }
```

Заменить на:

```typescript
  // Fire-and-forget: AI auto-reply to client (skip for first message and button presses)
  const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY') ?? ''
  if (existingLead && !isButton && communityToken && GEMINI_KEY && text.trim()) {
    generateVkAutoReply(
      communityToken, peerId, text, existingLead.messages ?? [], sb, leadId
    ).catch(e => console.error('vk auto-reply failed:', e))
  }
  // Keep ai_draft for new leads (first message already handled by welcome)
  if (!existingLead && GEMINI_KEY && text.trim()) {
    generateAndPatchDraft(sb, leadId, text, [], newMessage.id).catch(
      e => console.error('ai draft patch failed:', e)
    )
  }
```

- [ ] **Step 1.3: Задеплоить функцию**

```bash
npx supabase functions deploy vk-webhook --no-verify-jwt
```

Ожидаемый вывод: `Deployed Functions vk-webhook`

- [ ] **Step 1.4: Протестировать вручную**

Написать в VK-сообщество НЕ первое сообщение (уже существующий лид). Ожидание: бот отвечает AI-ответом в течение 5-10 секунд. Если ответ не приходит — проверить логи: `npx supabase functions logs vk-webhook --tail`.

- [ ] **Step 1.5: Коммит**

```bash
git add supabase/functions/vk-webhook/index.ts
git commit -m "feat(vk-webhook): AI auto-reply to client on free text messages"
```

---

## Задача 2: VK мини-бриф (3 вопроса)

**Контекст:** При нажатии "📋 Оставить заявку" в VK сейчас отправляется только запрос контакта. Нужен 3-шаговый бриф: бизнес → имя → контакт. Состояние хранится в колонке `vk_brief_step` на `leads`.

**Файлы:**
- Create: `supabase/migrations/20260706_vk_brief.sql`
- Modify: `supabase/functions/vk-webhook/index.ts`

- [ ] **Step 2.1: SQL миграция — добавить `vk_brief_step`**

Создать файл `supabase/migrations/20260706_vk_brief.sql`:

```sql
-- VK mini-brief state tracking
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS vk_brief_step INT;

-- VK brief answers (business, name, contact)
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS vk_brief_data JSONB DEFAULT '{}'::jsonb;
```

- [ ] **Step 2.2: Применить миграцию**

```bash
npx supabase db push
```

Ожидаемый вывод: `Applying migration 20260706_vk_brief.sql...`

- [ ] **Step 2.3: Добавить функцию `startVkBrief`**

В `vk-webhook/index.ts` добавить после `handleVkButton`:

```typescript
const VK_BRIEF_Q = [
  'Расскажите про ваш бизнес — чем занимаетесь?',   // step 1
  'Как вас зовут?',                                   // step 2
  'Телефон или @username для связи?',                 // step 3 → done
]

async function startVkBrief(
  token: string, peerId: number,
  sb: ReturnType<typeof createClient>, leadId: string
): Promise<void> {
  await sb.from('leads').update({
    vk_brief_step: 1,
    vk_brief_data: {},
    updated_at: Date.now()
  }).eq('id', leadId)
  await vkSendAndSave(token, peerId, '📝 ' + VK_BRIEF_Q[0], sb, leadId, false)
}

async function processVkBrief(
  token: string, peerId: number, text: string,
  step: number, briefData: Record<string, string>,
  sb: ReturnType<typeof createClient>, leadId: string,
  workspaceId: string, leadName: string
): Promise<void> {
  const keys = ['business', 'name', 'contact']
  const updated = { ...briefData, [keys[step - 1]]: text }

  if (step < 3) {
    // Next question
    await sb.from('leads').update({
      vk_brief_step: step + 1,
      vk_brief_data: updated,
      updated_at: Date.now()
    }).eq('id', leadId)
    await vkSendAndSave(token, peerId, VK_BRIEF_Q[step], sb, leadId, false)
    return
  }

  // Step 3 done — save contact, finish brief
  const summary = `🔥 VK ЗАЯВКА\nБизнес: ${updated.business || '—'}\nИмя: ${updated.name || '—'}\nКонтакт: ${updated.contact || '—'}`
  await sb.from('leads').update({
    vk_brief_step: null,
    vk_brief_data: updated,
    contact: updated.contact || '',
    name: updated.name || leadName,
    status: 2,
    notes: summary,
    updated_at: Date.now()
  }).eq('id', leadId)
  await vkSendAndSave(token, peerId,
    '✅ Отлично! Наш менеджер свяжется с вами в ближайшее время. Спасибо!',
    sb, leadId, false
  )
  sendPushToWorkspace(sb, workspaceId, updated.name || leadName,
    '📋 VK бриф заполнен: ' + (updated.business || '').slice(0, 60)
  ).catch(() => {})
}
```

- [ ] **Step 2.4: Изменить `handleVkButton` — запускать бриф вместо одного вопроса**

В функции `handleVkButton` найти блок `if (button === '📋 Оставить заявку')` и заменить:

```typescript
// БЫЛО:
  if (button === '📋 Оставить заявку') {
    const reply = 'Отлично! Оставьте свой контакт (телефон или email) — менеджер свяжется в ближайшее время 🎬'
    await vkSendAndSave(token, peerId, reply, sb, leadId, false)
    await sb.from('leads').update({ status: 2, updated_at: Date.now() }).eq('id', leadId)
    sendPushToWorkspace(sb, workspaceId, leadName, '📋 Клиент хочет оставить заявку (VK)').catch(() => {})
  }

// СТАЛО:
  if (button === '📋 Оставить заявку') {
    await startVkBrief(token, peerId, sb, leadId)
  }
```

- [ ] **Step 2.5: Обработать ответы брифа в main handler**

В main handler, перед блоком `const isButton = ...`, добавить проверку состояния брифа. Найти:

```typescript
  const communityToken   = (settings as Record<string, unknown>).vk_token as string | null
```

И добавить получение данных лида с `vk_brief_step` и `vk_brief_data`. Изменить SELECT лида:

```typescript
  const { data: existingLead } = await sb
    .from('leads')
    .select('id, name, messages, vk_brief_step, vk_brief_data')
    .eq('workspace_id', workspaceId)
    .eq('vk_peer_id', peerId)
    .maybeSingle()
```

Затем после блока сохранения сообщения (после `return responsePromise` строки или перед ним), добавить обработку брифа. Найти строку:

```typescript
  // Auto-reply on first message from new lead
```

И перед ней добавить:

```typescript
  // VK mini-brief FSM
  const briefStep = existingLead?.vk_brief_step as number | null ?? null
  const briefData = (existingLead?.vk_brief_data as Record<string, string> | null) ?? {}
  if (briefStep !== null && communityToken && text.trim()) {
    processVkBrief(
      communityToken, peerId, text, briefStep, briefData,
      sb, leadId, workspaceId, leadName
    ).catch(e => console.error('vk brief error:', e))
    return responsePromise
  }
```

- [ ] **Step 2.6: В условии авто-ответа AI исключить лиды в состоянии брифа**

Уже исключено через `return responsePromise` выше — brief handler вернёт раньше.

- [ ] **Step 2.7: Задеплоить**

```bash
npx supabase functions deploy vk-webhook --no-verify-jwt
```

- [ ] **Step 2.8: Протестировать**

Нажать кнопку "📋 Оставить заявку" в VK → бот должен задать вопрос про бизнес → ответить → вопрос про имя → ответить → вопрос про контакт → ответить → бот подтверждает + менеджер получает push.

- [ ] **Step 2.9: Коммит**

```bash
git add supabase/migrations/20260706_vk_brief.sql supabase/functions/vk-webhook/index.ts
git commit -m "feat(vk-webhook): 3-step mini-brief via VK bot"
```

---

## Задача 3: Потенциальная выручка в воронке

**Контекст:** В TG брифе кнопки бюджета: "до 30 000 ₽", "30–100 000 ₽", "100 000 ₽+", "🤝 Обсудим". Нужно при brief_complete сохранять `deal_budget INT` и показывать сумму в воронке OTR.

**Файлы:**
- Create: `supabase/migrations/20260706_deal_budget.sql`
- Modify: `supabase/functions/tg-webhook/index.ts`
- Modify: `supabase/functions/vk-webhook/index.ts`
- Modify: `index.html` (функции `renderDashFunnel`, `renderFunnelHero`, `rowToLead`, `leadToRow`)

- [ ] **Step 3.1: SQL миграция — добавить `deal_budget`**

Создать файл `supabase/migrations/20260706_deal_budget.sql`:

```sql
-- Pipeline revenue tracking
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS deal_budget INT;
```

- [ ] **Step 3.2: Применить миграцию**

```bash
npx supabase db push
```

- [ ] **Step 3.3: В tg-webhook сохранять `deal_budget` при завершении брифа**

В `tg-webhook/index.ts` добавить функцию после блока констант (после `AI_PROMPT`):

```typescript
function parseBudget(budgetStr: string | undefined): number | null {
  if (!budgetStr) return null
  if (budgetStr.includes('до 30')) return 15000
  if (budgetStr.includes('30') && budgetStr.includes('100')) return 65000
  if (budgetStr.includes('100 000 ₽+')) return 150000
  if (budgetStr.includes('Обсудим') || budgetStr.includes('обсудим')) return 50000
  return null
}
```

В функции `processBrief` → `case 5` (контакт → DONE), найти UPDATE лида (~строка 432):

```typescript
      await sb.from('leads').update({
        status:     2,
        notes:      briefNote,
        updated_at: Date.now(),
      }).eq('id', lead.id as string)
```

Заменить на:

```typescript
      await sb.from('leads').update({
        status:      2,
        notes:       briefNote,
        deal_budget: parseBudget(b.budget),
        updated_at:  Date.now(),
      }).eq('id', lead.id as string)
```

- [ ] **Step 3.4: В vk-webhook сохранять `deal_budget` при VK брифе**

В `processVkBrief` (задача 2), в финальном UPDATE добавить:

```typescript
deal_budget: null, // VK brief не собирает бюджет — ставим null
```

(Это явно показывает что бюджет не был собран, в отличие от default NULL при создании.)

- [ ] **Step 3.5: Задеплоить оба webhook**

```bash
npx supabase functions deploy tg-webhook
npx supabase functions deploy vk-webhook --no-verify-jwt
```

- [ ] **Step 3.6: В `index.html` добавить `dealBudget` в `rowToLead` и `leadToRow`**

В функции `rowToLead` (строка 3444), найти строку:

```javascript
                abVariant:          row.ab_variant           || null
            };
```

Заменить на:

```javascript
                abVariant:          row.ab_variant           || null,
                dealBudget:         row.deal_budget           ?? null
            };
```

В функции `leadToRow` (строка 3413), найти строку:

```javascript
                ab_variant:           lead.abVariant         || null
            };
```

Заменить на:

```javascript
                ab_variant:           lead.abVariant         || null,
                deal_budget:          lead.dealBudget         ?? null
            };
```

- [ ] **Step 3.7: Добавить функцию расчёта потенциала**

В `index.html` после функции `renderDashFunnel` добавить:

```javascript
function calcPipelineRevenue() {
    var total = 0;
    leads.forEach(function(l) {
        if ((l.status === 1 || l.status === 2) && !l.archived_at && l.dealBudget) {
            total += l.dealBudget;
        }
    });
    return total;
}

function formatRevenue(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace('.0', '') + ' млн ₽';
    if (n >= 1000)    return Math.round(n / 1000) + ' тыс ₽';
    return n + ' ₽';
}
```

- [ ] **Step 3.8: Показать потенциал в `renderDashFunnel`**

В функции `renderDashFunnel` (строка 3111) найти строку с финальным `el.innerHTML =`. Она выглядит так:

```javascript
            el.innerHTML =
                '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">' +
                '<span style="font-size:12px;font-weight:600;color:var(--text);">Воронка продаж</span>' +
                '<span style="font-size:12px;color:var(--muted);">' + total + ' лидов · <span style="color:var(--success);font-weight:600;">' + successRate + '% конверсия</span>' + rejectedHtml + '</span>' +
                '</div>' +
                '<div class="funnel-chart" style="gap:0;">' + barsHtml + '</div>';
```

Заменить на:

```javascript
            var rev = calcPipelineRevenue();
            var revHtml = rev > 0
                ? '<div style="margin-top:8px;font-size:11px;color:var(--muted);">💰 Потенциал: <span style="color:var(--success);font-weight:600;">' + formatRevenue(rev) + '</span></div>'
                : '';

            el.innerHTML =
                '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">' +
                '<span style="font-size:12px;font-weight:600;color:var(--text);">Воронка продаж</span>' +
                '<span style="font-size:12px;color:var(--muted);">' + total + ' лидов · <span style="color:var(--success);font-weight:600;">' + successRate + '% конверсия</span>' + rejectedHtml + '</span>' +
                '</div>' +
                '<div class="funnel-chart" style="gap:0;">' + barsHtml + '</div>' +
                revHtml;
```

- [ ] **Step 3.9: Показать потенциал в `renderFunnelHero`**

Аналогично добавить `revHtml` в HTML `renderFunnelHero` после `funnel-chart`:

```javascript
var rev = calcPipelineRevenue();
var revHtml = rev > 0
    ? '<div class="funnel-hero-cta" style="color:var(--success);">💰 Pipeline: ' + formatRevenue(rev) + '</div>'
    : '<div class="funnel-hero-cta">← выбери лид для работы</div>';
```

- [ ] **Step 3.10: Проверить в браузере**

Открыть OTR → дашборд → убедиться что потенциал показывается для лидов в статусах 1 и 2 с заполненным бюджетом.

- [ ] **Step 3.11: Коммит**

```bash
git add supabase/migrations/20260706_deal_budget.sql supabase/functions/tg-webhook/index.ts supabase/functions/vk-webhook/index.ts index.html
git commit -m "feat: pipeline revenue in funnel + deal_budget from TG brief"
```

---

## Задача 4: Дедупликация VK ↔ TG лидов

**Контекст:** Если один клиент написал в VK и в TG, создаётся 2 лида. При завершении брифа (известен контакт) — искать по `contact` и сливать.

**Файлы:**
- Modify: `supabase/functions/tg-webhook/index.ts`
- Modify: `supabase/functions/vk-webhook/index.ts`

- [ ] **Step 4.1: Добавить функцию `findAndMergeDuplicate` в tg-webhook**

В `tg-webhook/index.ts` добавить функцию:

```typescript
async function findAndMergeDuplicate(
  sb: SbClient,
  wsId: string,
  currentLeadId: string,
  contact: string,
  vkPeerId: number | null,
  tgChatId: number | null,
  extraMessages: LeadRow[]
): Promise<void> {
  if (!contact || contact.length < 5) return

  const normalized = contact.replace(/[\s\-\(\)]/g, '').replace(/^8/, '7')

  // Find a lead in same workspace with matching contact (but different id)
  const { data: dup } = await sb
    .from('leads')
    .select('id, messages, vk_peer_id, tg_chat_id')
    .eq('workspace_id', wsId)
    .neq('id', currentLeadId)
    .is('archived_at', null)
    .ilike('contact', '%' + normalized.slice(-7) + '%')
    .maybeSingle()

  if (!dup) return

  // Merge: append current messages to duplicate, update cross-channel ids
  const mergedMessages = [
    ...((dup.messages as LeadRow[]) ?? []),
    ...extraMessages
  ].sort((a, b) => Number((a as any).date ?? 0) - Number((b as any).date ?? 0))

  await sb.from('leads').update({
    messages:    mergedMessages,
    vk_peer_id:  dup.vk_peer_id  ?? vkPeerId,
    tg_chat_id:  dup.tg_chat_id  ?? tgChatId,
    updated_at:  Date.now()
  }).eq('id', dup.id as string)

  // Archive the current (duplicate) lead
  await sb.from('leads').update({
    archived_at: Date.now(),
    notes: '[Объединён с ' + dup.id + ']'
  }).eq('id', currentLeadId)
}
```

- [ ] **Step 4.2: Вызвать `findAndMergeDuplicate` в tg-webhook при завершении брифа**

В tg-webhook найти место где бриф завершается (ищи `brief_complete` или `status: 2` + сохранение contact). После сохранения contact вызвать:

```typescript
// Fire-and-forget: dedup check after brief completion
if (contact) {
  findAndMergeDuplicate(
    sb, wsId, lead.id as string, contact,
    null, chatId,
    (freshLead?.messages as LeadRow[]) ?? []
  ).catch(() => {})
}
```

- [ ] **Step 4.3: Скопировать ту же функцию в vk-webhook и вызвать при завершении VK брифа**

В `vk-webhook/index.ts` добавить аналогичную функцию `findAndMergeDuplicate` (идентичную, TypeScript копируем целиком).

В `processVkBrief` после финального UPDATE добавить:

```typescript
  if (updated.contact) {
    findAndMergeDuplicate(sb, workspaceId, leadId, updated.contact, peerId, null, []).catch(() => {})
  }
```

- [ ] **Step 4.4: Задеплоить оба webhook**

```bash
npx supabase functions deploy tg-webhook
npx supabase functions deploy vk-webhook --no-verify-jwt
```

- [ ] **Step 4.5: Проверить в логах**

```bash
npx supabase functions logs tg-webhook --tail
```

Протестировать: создать лид в TG, заполнить бриф с номером телефона который уже есть у VK-лида → второй лид должен архивироваться, сообщения слиться.

- [ ] **Step 4.6: Коммит**

```bash
git add supabase/functions/tg-webhook/index.ts supabase/functions/vk-webhook/index.ts
git commit -m "feat: deduplication VK↔TG leads on brief completion by phone contact"
```

---

## Задача 5: Среднее время ответа клиента в карточке лида

**Контекст:** Из `messages[]` считаем: для каждой пары [менеджер → клиент] берём разницу дат. Показываем в `renderDrawerBody` (строка 7823).

**Файлы:**
- Modify: `index.html`

- [ ] **Step 5.1: Добавить функцию `calcAvgResponseTime`**

В `index.html` после функции `renderDrawerBody` добавить:

```javascript
function calcAvgResponseTime(messages) {
    if (!messages || messages.length < 2) return null;
    var deltas = [];
    for (var i = 1; i < messages.length; i++) {
        var prev = messages[i - 1];
        var curr = messages[i];
        if (!prev.fromClient && curr.fromClient) {
            var delta = curr.date - prev.date;
            if (delta > 0 && delta < 7 * 24 * 3600 * 1000) {
                deltas.push(delta);
            }
        }
    }
    if (!deltas.length) return null;
    var avg = deltas.reduce(function(s, d) { return s + d; }, 0) / deltas.length;
    return avg;
}

function formatDuration(ms) {
    var s = ms / 1000;
    if (s < 60) return 'меньше минуты';
    var m = Math.floor(s / 60);
    if (m < 60) return m + ' мин';
    var h = Math.floor(m / 60);
    var rm = m % 60;
    if (h < 24) return h + 'ч' + (rm ? ' ' + rm + 'м' : '');
    return Math.floor(h / 24) + ' дн.';
}
```

- [ ] **Step 5.2: Вставить время ответа в `renderDrawerBody`**

В `renderDrawerBody` (строка 7847) найти строку где формируется HTML карточки. Найти блок с attempt-badge:

```javascript
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
                <span class="attempt-badge${sentCount > 0 ? ' has-sent' : ''}">
```

После этого блока добавить строку с временем ответа:

```javascript
            ${(function() {
                var avgMs = calcAvgResponseTime(lead.messages);
                if (!avgMs) return '';
                var label = formatDuration(avgMs);
                var isCold = avgMs > 48 * 3600 * 1000;
                return '<span class="attempt-badge" style="' + (isCold ? 'color:var(--danger)' : '') + '" title="Среднее время ответа клиента">' +
                    '<span aria-hidden="true">⏱</span> Отвечает за ' + label +
                    '</span>';
            })()}
```

- [ ] **Step 5.3: Проверить в браузере**

Открыть лид с несколькими сообщениями → нажать карандаш/открыть drawer → убедиться что появился бейдж "⏱ Отвечает за Xч".

- [ ] **Step 5.4: Коммит**

```bash
git add index.html
git commit -m "feat(drawer): avg client response time badge in lead card"
```

---

## Задача 6: VK follow-up автоматическое напоминание

**Контекст:** `tg-reminder/index.ts` уже отправляет follow-up TG-лидам через 20ч без ответа. Добавить аналогичный блок для VK-лидов. Нужны: `vk_followup_text TEXT` в `workspace_settings`, `vk_reminded_at TIMESTAMPTZ` в `leads`.

**Файлы:**
- Create: `supabase/migrations/20260706_vk_followup.sql`
- Modify: `supabase/functions/tg-reminder/index.ts`

- [ ] **Step 6.1: SQL миграция**

Создать `supabase/migrations/20260706_vk_followup.sql`:

```sql
-- VK follow-up reminder
ALTER TABLE workspace_settings
  ADD COLUMN IF NOT EXISTS vk_followup_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS vk_followup_text TEXT;

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS vk_reminded_at BIGINT;
```

- [ ] **Step 6.2: Применить**

```bash
npx supabase db push
```

- [ ] **Step 6.3: Расширить `runReminders` в tg-reminder**

В `tg-reminder/index.ts` в функции `runReminders` после цикла для TG (после `return { sent, skipped }`) добавить блок для VK. Но т.к. функция возвращает рано — добавить VK-блок ПЕРЕД финальным return:

```typescript
  // ── VK follow-up ─────────────────────────────────────────────────────────────
  const { data: vkWorkspaces } = await sb
    .from('workspace_settings')
    .select('workspace_id, vk_token, vk_followup_text, vk_followup_enabled')
    .eq('vk_followup_enabled', true)
    .not('vk_token', 'is', null)

  for (const vkWs of vkWorkspaces ?? []) {
    const wsId    = vkWs.workspace_id as string
    const token   = vkWs.vk_token    as string
    const text    = (vkWs.vk_followup_text as string | null)?.trim() ||
      'Привет! 👋 Хотели узнать о создании видео для вашего бизнеса — остались вопросы? Пишите, поможем! 🎬'

    const { data: vkCandidates } = await sb
      .from('leads')
      .select('id, vk_peer_id, name, messages')
      .eq('workspace_id', wsId)
      .not('vk_peer_id', 'is', null)
      .is('archived_at', null)
      .is('vk_reminded_at', null)
      .in('status', [0, 1, 2])
      .lt('updated_at', h20)
      .gt('updated_at', d7)

    for (const lead of vkCandidates ?? []) {
      const peerId = Number(lead.vk_peer_id)
      if (!peerId) { skipped++; continue }

      const ok = await fetch('https://api.vk.com/method/messages.send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          peer_id: String(peerId), message: text,
          random_id: String(Math.floor(Math.random() * 2147483647)),
          v: '5.131', access_token: token
        }).toString()
      }).then(r => r.json()).then((d: any) => !d.error).catch(() => false)

      if (!ok) { skipped++; continue }

      const messages = [...((lead.messages ?? []) as Record<string, unknown>[])]
      messages.push({ id: crypto.randomUUID(), text, date: now, fromClient: false, type: 'reminder' })

      await sb.from('leads').update({
        vk_reminded_at: now,
        messages,
        updated_at: now
      }).eq('id', lead.id as string)

      sent++
    }
  }

  return { sent, skipped }
```

- [ ] **Step 6.4: Задеплоить tg-reminder**

```bash
npx supabase functions deploy tg-reminder
```

- [ ] **Step 6.5: Добавить поле "VK follow-up" в HTML Settings**

В `index.html` (строка 2091) найти блок `vkWelcomeTextInput`:

```html
                    <div style="font-size:11px;color:var(--muted);">Оставьте пустым, чтобы отключить авто-ответ.</div>
```

После этой строки (перед блоком с кнопками сохранения на строке 2094) добавить:

```html
                    <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-muted);margin-top:8px;cursor:pointer;">
                        <input type="checkbox" id="vkFollowupEnabledInput" onchange="toggleVkFollowupText(this.checked)">
                        Авто follow-up через 20ч молчания
                    </label>
                    <div id="vkFollowupTextRow" style="display:none;">
                        <textarea id="vkFollowupTextInput" rows="3" placeholder="Привет! Хотели узнать о создании видео для вашего бизнеса — остались вопросы? 🎬" style="width:100%;resize:vertical;margin-top:4px;" aria-label="Текст VK follow-up напоминания"></textarea>
                    </div>
```

- [ ] **Step 6.6: Добавить JS для чекбокса и загрузки/сохранения**

В `index.html` после функции `saveVkSettings` (строка 6288) добавить:

```javascript
function toggleVkFollowupText(checked) {
    var row = document.getElementById('vkFollowupTextRow');
    if (row) row.style.display = checked ? '' : 'none';
}
```

В `loadVkSettings` (строка 6044) изменить SELECT, добавив поля:

```javascript
                .select('vk_token, vk_community_id, vk_webhook_secret, vk_confirmation_string, vk_welcome_text, vk_followup_enabled, vk_followup_text')
```

В блоке установки значений в `loadVkSettings` после `if (wf) wf.value = vkSettings.welcomeText;` добавить:

```javascript
            const fce = document.getElementById('vkFollowupEnabledInput');
            const fct = document.getElementById('vkFollowupTextInput');
            const ftRow = document.getElementById('vkFollowupTextRow');
            if (fce) fce.checked = !!(data.vk_followup_enabled);
            if (fct) fct.value = data.vk_followup_text || '';
            if (ftRow) ftRow.style.display = data.vk_followup_enabled ? '' : 'none';
```

В `saveVkSettings` (строка 6276) в объект upsert добавить:

```javascript
                vk_followup_enabled:    !!(document.getElementById('vkFollowupEnabledInput')?.checked),
                vk_followup_text:       (document.getElementById('vkFollowupTextInput')?.value || '').trim() || null,
```

- [ ] **Step 6.6: Проверить в браузере**

Открыть Настройки → VK → убедиться что чекбокс и textarea для follow-up отображаются.

- [ ] **Step 6.7: Коммит**

```bash
git add supabase/migrations/20260706_vk_followup.sql supabase/functions/tg-reminder/index.ts index.html
git commit -m "feat: VK auto follow-up reminder (20h silence) via tg-reminder cron"
```

---

## Задача 7: Быстрые ответы в VK-чате

**Контекст:** `renderQuickRepliesBar` (строка 4949) показывает кнопки только для TG-лидов (`isTg`). Нужно показывать и для VK-лидов, переиспользуя те же `tgSettings.quickReplies`.

**Файлы:**
- Modify: `index.html`

- [ ] **Step 7.1: Расширить `renderQuickRepliesBar` для VK**

Найти функцию `renderQuickRepliesBar` (строка 4949):

```javascript
function renderQuickRepliesBar(lead) {
    const bar = document.getElementById('quickRepliesBar');
    if (!bar) return;
    const isTg = !!(lead && lead.tgChatId && chatInputTab === 'manager');
    const replies = tgSettings.quickReplies;
    if (!isTg || !replies || !replies.length) { bar.style.display = 'none'; return; }
```

Заменить на:

```javascript
function renderQuickRepliesBar(lead) {
    const bar = document.getElementById('quickRepliesBar');
    if (!bar) return;
    const isTg = !!(lead && lead.tgChatId && chatInputTab === 'manager');
    const isVk = !!(lead && lead.vkPeerId && chatInputTab === 'manager');
    const replies = tgSettings.quickReplies;
    if ((!isTg && !isVk) || !replies || !replies.length) { bar.style.display = 'none'; return; }
```

- [ ] **Step 7.2: Проверить в браузере**

Открыть чат с VK-лидом → переключиться на вкладку "Я написал" → убедиться что кнопки быстрых фраз появились.

- [ ] **Step 7.3: Коммит**

```bash
git add index.html
git commit -m "feat(chat): quick reply buttons now work for VK leads, not only TG"
```

---

## Задача 8: Счётчик исходящих сообщений за сегодня

**Контекст:** В `updateDashboard()` уже есть `renderFocusToday()`. Добавить счётчик "написано сегодня" в Focus Today панель.

**Файлы:**
- Modify: `index.html`

- [ ] **Step 8.1: Добавить функцию `countTodayOutgoing`**

В `index.html` после `renderFocusToday` добавить:

```javascript
function countTodayOutgoing() {
    var start = new Date();
    start.setHours(0, 0, 0, 0);
    var startMs = start.getTime();
    var count = 0;
    leads.forEach(function(l) {
        (l.messages || []).forEach(function(m) {
            if (!m.fromClient && m.date >= startMs && m.type !== 'reminder') count++;
        });
    });
    return count;
}
```

- [ ] **Step 8.2: Показать счётчик в `renderFocusToday`**

В `renderFocusToday` (строка 4407) найти строку `panel.style.display = 'block';` и после неё (перед `list.innerHTML`) добавить:

```javascript
            var todayOut = countTodayOutgoing();
            var counterEl = document.getElementById('focusTodayCounter');
            if (counterEl) {
                counterEl.textContent = 'Написано сегодня: ' + todayOut;
                counterEl.style.display = todayOut > 0 ? '' : 'none';
            }
```

В HTML (строка 1699) найти заголовок панели Focus Today:

```html
        <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px;">⚡ Сделайте сейчас</div>
```

Заменить на:

```html
        <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px;">
            ⚡ Сделайте сейчас
            <span id="focusTodayCounter" style="font-size:10px;font-weight:400;color:var(--muted);display:none;margin-left:8px;"></span>
        </div>
```

- [ ] **Step 8.3: Проверить в браузере**

Открыть OTR → убедиться что в Focus Today панели показывается счётчик "Написано сегодня: N".

- [ ] **Step 8.4: Коммит**

```bash
git add index.html
git commit -m "feat(dashboard): outgoing messages counter in Focus Today panel"
```

---

## Задача 9: Экспорт аудитории для таргета

**Контекст:** `exportCSV()` (строка 4305) — чёткий паттерн. Нужна аналогичная `exportTargetCSV()` для лидов со статусом 4 (Отказ).

**Файлы:**
- Modify: `index.html`

- [ ] **Step 9.1: Добавить функцию `exportTargetCSV`**

В `index.html` после `exportCSV` добавить:

```javascript
function exportTargetCSV() {
    var targets = leads.filter(function(l) { return l.status === 4 && !l.archived_at; });
    if (!targets.length) { showToast('Нет отказников для экспорта', 2500); return; }
    var csvField = function(v) { return '"' + String(v ?? '').replace(/"/g, '""').replace(/[\n\r]/g, ' ') + '"'; };
    var csv = '﻿Название;Ссылка;Контакт;Сегмент;Платформа\n';
    targets.forEach(function(l) {
        var platform = l.tgChatId ? 'TG' : l.vkPeerId ? 'VK' : l.igUserId ? 'Instagram' : 'Ручной';
        csv += csvField(l.name) + ';' + csvField(l.link) + ';' + csvField(l.contact) + ';' + csvField(l.bizType) + ';' + csvField(platform) + '\n';
    });
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'adervis_target_audience_' + new Date().toISOString().slice(0, 10) + '.csv';
    link.click();
    showToast('Экспортировано: ' + targets.length + ' отказников', 2500);
}
```

- [ ] **Step 9.2: Добавить кнопку в header dropdown**

В HTML найти кнопку "Экспорт CSV" (строка ~1599):

```html
<button class="hdr-dropdown-item" role="menuitem" onclick="exportCSV(); closeHeaderDropdown()">Экспорт CSV</button>
```

После неё добавить:

```html
<button class="hdr-dropdown-item" role="menuitem" onclick="exportTargetCSV(); closeHeaderDropdown()">Экспорт для таргета (отказники)</button>
```

- [ ] **Step 9.3: Проверить**

Открыть dropdown → кликнуть "Экспорт для таргета" → должен скачаться CSV с именем `adervis_target_audience_ДАТА.csv`.

- [ ] **Step 9.4: Коммит**

```bash
git add index.html
git commit -m "feat(export): target audience CSV export for rejected leads (status=4)"
```

---

## Задача 10: Рефакторинг — вынос JS в модули

**Контекст:** index.html = 8681 строк. Вынести JS в `js/` через `<script type="module">`. Это не меняет поведение.

**Решение:** Задача 10 откладывается до стабилизации остальных фич. Причина: любой рефакторинг single-file в этот момент создаст merge-конфликты с предыдущими задачами. Выполнить отдельным спринтом.

---

## Финальный деплой и проверка

- [ ] **Применить все миграции в правильном порядке**

```bash
npx supabase db push
```

- [ ] **Задеплоить все функции**

```bash
npx supabase functions deploy vk-webhook --no-verify-jwt
npx supabase functions deploy tg-webhook
npx supabase functions deploy tg-reminder
```

- [ ] **Открыть OTR и пройти smoke-test:**
  - VK: написать боту → получить AI-ответ ✓
  - VK: нажать "📋 Оставить заявку" → пройти 3 вопроса брифа ✓  
  - Дашборд: воронка показывает потенциал pipeline ✓
  - Drawer лида с историей: показывает "⏱ Отвечает за Xч" ✓
  - Чат VK-лида: кнопки быстрых ответов появляются ✓
  - Focus Today: счётчик "Написано сегодня: N" ✓
  - Header dropdown: есть "Экспорт для таргета" ✓

- [ ] **Финальный коммит (если есть несохранённое)**

```bash
git status
```
