# Sprint 8: A/B Test Welcome + Onboarding Carousel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add A/B split-testing for Telegram bot welcome messages with conversion stats, and replace the existing 3-step setup wizard with a beautiful 6-slide carousel onboarding.

**Architecture:** Part 1 (A/B test) — DB migration → tg-webhook variant selection → Settings UI → Dashboard stats. Part 2 (Onboarding) — replace existing `checkOnboarding` / `onboardingModal` with new carousel modal, add `📖` helpBtn in header, auto-open on first launch. All UI changes in `index.html`; webhook changes in `tg-webhook/index.ts`.

**Tech Stack:** Deno TypeScript (Edge Functions), Vanilla JS single-file HTML, Supabase PostgreSQL, CSS Custom Properties.

---

## File Map

| File | Change |
|------|--------|
| `supabase/migrations/20260701_ab_test.sql` | NEW — 3 columns |
| `supabase/functions/tg-webhook/index.ts` | A/B variant selection + deploy |
| `index.html` | A/B Settings UI + A/B dashboard + Onboarding carousel |

---

## Task 1: SQL Migration — A/B columns

**Files:**
- Create: `supabase/migrations/20260701_ab_test.sql`

- [ ] **Step 1: Create migration file**

```sql
-- Sprint 8: A/B welcome text test
ALTER TABLE workspace_settings
  ADD COLUMN IF NOT EXISTS tg_welcome_text_b TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS tg_ab_enabled     BOOLEAN DEFAULT FALSE;

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS ab_variant VARCHAR(1) DEFAULT NULL; -- 'A' | 'B'
```

Save to `supabase/migrations/20260701_ab_test.sql`.

- [ ] **Step 2: Apply migration**

```bash
npx supabase db push
```

Expected: success with no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260701_ab_test.sql
git commit -m "feat(db): ab_variant on leads, tg_welcome_text_b + tg_ab_enabled on workspace_settings"
```

---

## Task 2: tg-webhook — A/B variant selection

**Files:**
- Modify: `supabase/functions/tg-webhook/index.ts`

**Context:** `handleWebhook` is at line ~116; `handleMessage` signature at line ~148; `/start` welcome send at line ~180; first-visit welcome send at line ~219.

- [ ] **Step 1: Expand workspace_settings select**

Find (line ~124):
```ts
    .from('workspace_settings').select('tg_bot_token, tg_welcome_text').eq('workspace_id', wsId).maybeSingle()
```

Replace with:
```ts
    .from('workspace_settings').select('tg_bot_token, tg_welcome_text, tg_welcome_text_b, tg_ab_enabled').eq('workspace_id', wsId).maybeSingle()
```

- [ ] **Step 2: Extract new settings after line ~127**

Find (lines ~126-133):
```ts
  const tok = ws.tg_bot_token as string
  const welcomeText = (ws as any).tg_welcome_text || WELCOME_TEXT

  try {
    const msg = upd.message        as LeadRow | undefined
    const cb  = upd.callback_query as LeadRow | undefined

    if (msg) await handleMessage(msg, sb, tok, wsId, welcomeText)
```

Replace with:
```ts
  const tok          = ws.tg_bot_token as string
  const welcomeText  = (ws as any).tg_welcome_text  as string | null || WELCOME_TEXT
  const welcomeTextB = (ws as any).tg_welcome_text_b as string | null ?? null
  const abEnabled    = !!(ws as any).tg_ab_enabled

  try {
    const msg = upd.message        as LeadRow | undefined
    const cb  = upd.callback_query as LeadRow | undefined

    if (msg) await handleMessage(msg, sb, tok, wsId, welcomeText, welcomeTextB, abEnabled)
```

- [ ] **Step 3: Update handleMessage signature**

Find (line ~148):
```ts
async function handleMessage(msg: LeadRow, sb: SbClient, tok: string, wsId: string, welcomeText: string) {
```

Replace with:
```ts
async function handleMessage(msg: LeadRow, sb: SbClient, tok: string, wsId: string, welcomeText: string, welcomeTextB: string | null = null, abEnabled = false) {
```

- [ ] **Step 4: Add A/B variant resolution block**

Find the block (lines ~172-176):
```ts
  let lead = await getLead(sb, wsId, chatId)
  if (!lead) lead = await createLead(sb, wsId, chatId, displayName, username)
  if (!lead) return

  const state: TgState = (lead.tg_state as TgState) ?? { mode: 'menu', aiRounds: 0, brief: {} }
```

Replace with:
```ts
  let lead = await getLead(sb, wsId, chatId)
  if (!lead) lead = await createLead(sb, wsId, chatId, displayName, username)
  if (!lead) return

  // A/B variant — assigned once on first contact, reused on all subsequent messages
  let effectiveWelcome = welcomeText
  if (abEnabled && welcomeTextB) {
    const existing = (lead.ab_variant as string | null) ?? null
    let variant = existing
    if (!variant) {
      variant = Math.random() < 0.5 ? 'A' : 'B'
      await sb.from('leads').update({ ab_variant: variant }).eq('id', lead.id as string)
      ;(lead as any).ab_variant = variant
    }
    if (variant === 'B') effectiveWelcome = welcomeTextB
  }

  const state: TgState = (lead.tg_state as TgState) ?? { mode: 'menu', aiRounds: 0, brief: {} }
```

- [ ] **Step 5: Replace welcomeText with effectiveWelcome in /start handler**

Find (line ~180):
```ts
    await tgSend(tok, chatId, welcomeText, MAIN_KB)
    await setState(sb, lead.id as string, { mode: 'menu', aiRounds: 0, brief: {} })
```

Replace with:
```ts
    await tgSend(tok, chatId, effectiveWelcome, MAIN_KB)
    await setState(sb, lead.id as string, { mode: 'menu', aiRounds: 0, brief: {} })
```

- [ ] **Step 6: Replace welcomeText with effectiveWelcome in first-visit fallback**

Find (line ~219):
```ts
  if (priorClientMsgs.length === 0) {
    await tgSend(tok, chatId, welcomeText, MAIN_KB)
  }
```

Replace with:
```ts
  if (priorClientMsgs.length === 0) {
    await tgSend(tok, chatId, effectiveWelcome, MAIN_KB)
  }
```

- [ ] **Step 7: Deploy**

```bash
npx supabase functions deploy tg-webhook --no-verify-jwt
```

Expected: `Deployed Functions.`

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/tg-webhook/index.ts
git commit -m "feat(tg-webhook): A/B variant selection on /start — random 50/50, persisted on lead"
```

---

## Task 3: index.html — A/B Settings UI

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add abEnabled and welcomeTextB to tgSettings object**

Find (line ~2098):
```js
        let tgSettings = { botToken: '', botUsername: '', quickReplies: [...DEFAULT_QUICK_REPLIES], welcomeText: '', briefConfig: [], reminderEnabled: false, reminderText: '', managerChatId: '' };
```

Replace with:
```js
        let tgSettings = { botToken: '', botUsername: '', quickReplies: [...DEFAULT_QUICK_REPLIES], welcomeText: '', briefConfig: [], reminderEnabled: false, reminderText: '', managerChatId: '', abEnabled: false, welcomeTextB: '' };
```

- [ ] **Step 2: Insert A/B HTML after welcome text section**

Find (line ~2002, closing div of welcome text subsection):
```html
                        <div style="font-size:11px;color:var(--muted);margin-top:2px;">Оставь пустым — бот использует текст по умолчанию</div>
                    </div>

                    <div class="settings-subsection">
                        <label style="font-size:12px;color:var(--muted);display:block;margin-bottom:4px;">Быстрые ответы в TG-чате</label>
```

Replace with:
```html
                        <div style="font-size:11px;color:var(--muted);margin-top:2px;">Оставь пустым — бот использует текст по умолчанию</div>
                    </div>

                    <div class="settings-subsection">
                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                            <input type="checkbox" id="tgAbEnabledInput" style="width:16px;height:16px;cursor:pointer;"
                                   aria-describedby="tgAbHint"
                                   onchange="document.getElementById('tgAbBSection').style.display=this.checked?'':'none'">
                            <label for="tgAbEnabledInput" style="font-size:12px;color:var(--muted);font-weight:600;cursor:pointer;">🧪 A/B тест приветственных сообщений</label>
                        </div>
                        <div id="tgAbHint" style="font-size:10px;color:var(--muted);margin-bottom:6px;">Бот случайно выбирает вариант A (текст выше) или B (ниже). Конверсия видна на дашборде.</div>
                        <div id="tgAbBSection" style="display:none;">
                            <label for="tgWelcomeTextBInput" style="font-size:12px;color:var(--muted);display:block;margin-bottom:4px;">Вариант B — альтернативное приветствие</label>
                            <textarea id="tgWelcomeTextBInput" rows="4" style="width:100%;font-size:12px;resize:vertical;" placeholder="Привет! Это ADERVIS — видеостудия для бизнеса..."></textarea>
                        </div>
                    </div>

                    <div class="settings-subsection">
                        <label style="font-size:12px;color:var(--muted);display:block;margin-bottom:4px;">Быстрые ответы в TG-чате</label>
```

- [ ] **Step 3: Update loadTgSettings — expand select**

Find (line ~5684):
```js
                .select('tg_bot_token, tg_bot_username, tg_quick_replies, tg_welcome_text, tg_brief_config, tg_reminder_enabled, tg_reminder_text, tg_manager_chat_id')
```

Replace with:
```js
                .select('tg_bot_token, tg_bot_username, tg_quick_replies, tg_welcome_text, tg_brief_config, tg_reminder_enabled, tg_reminder_text, tg_manager_chat_id, tg_ab_enabled, tg_welcome_text_b')
```

- [ ] **Step 4: Update loadTgSettings — tgSettings assignment**

Find (line ~5696):
```js
                managerChatId:   data.tg_manager_chat_id ? String(data.tg_manager_chat_id) : '',
```

Replace with:
```js
                managerChatId:   data.tg_manager_chat_id ? String(data.tg_manager_chat_id) : '',
                abEnabled:       !!data.tg_ab_enabled,
                welcomeTextB:    data.tg_welcome_text_b || '',
```

- [ ] **Step 5: Update loadTgSettings — DOM population**

Find (line ~5708):
```js
            const mc = document.getElementById('tgManagerChatIdInput');
            if (mc) mc.value = tgSettings.managerChatId;
            renderQuickRepliesEditor();
```

Replace with:
```js
            const mc = document.getElementById('tgManagerChatIdInput');
            if (mc) mc.value = tgSettings.managerChatId;
            const ae = document.getElementById('tgAbEnabledInput');
            if (ae) { ae.checked = tgSettings.abEnabled; document.getElementById('tgAbBSection').style.display = tgSettings.abEnabled ? '' : 'none'; }
            const wb = document.getElementById('tgWelcomeTextBInput');
            if (wb) wb.value = tgSettings.welcomeTextB;
            renderQuickRepliesEditor();
```

- [ ] **Step 6: Update saveTgSettings — read new fields**

Find (line ~5728):
```js
            const managerChatId   = (document.getElementById('tgManagerChatIdInput') ? document.getElementById('tgManagerChatIdInput').value : tgSettings.managerChatId || '').trim().replace(/[^0-9-]/g, '');
```

Replace with:
```js
            const managerChatId   = (document.getElementById('tgManagerChatIdInput') ? document.getElementById('tgManagerChatIdInput').value : tgSettings.managerChatId || '').trim().replace(/[^0-9-]/g, '');
            const abEnabled       = !!(document.getElementById('tgAbEnabledInput') || {}).checked;
            const welcomeTextB    = (document.getElementById('tgWelcomeTextBInput') ? document.getElementById('tgWelcomeTextBInput').value : tgSettings.welcomeTextB || '').trim();
```

- [ ] **Step 7: Update saveTgSettings — upsert payload**

Find (line ~5738):
```js
                tg_manager_chat_id:   managerChatId ? Number(managerChatId) : null,
```

Replace with:
```js
                tg_manager_chat_id:   managerChatId ? Number(managerChatId) : null,
                tg_ab_enabled:        abEnabled,
                tg_welcome_text_b:    welcomeTextB || null,
```

- [ ] **Step 8: Update saveTgSettings — local state**

Find (line ~5747):
```js
            tgSettings.managerChatId   = managerChatId;
            showToast('TG Bot сохранён ✓');
```

Replace with:
```js
            tgSettings.managerChatId   = managerChatId;
            tgSettings.abEnabled       = abEnabled;
            tgSettings.welcomeTextB    = welcomeTextB;
            showToast('TG Bot сохранён ✓');
```

- [ ] **Step 9: Commit**

```bash
git add index.html
git commit -m "feat(settings): A/B test UI — checkbox, variant B textarea, load/save"
```

---

## Task 4: index.html — Dashboard A/B stats

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Insert abTestStats HTML after tgBotStats**

Find (line ~1574, closing div of tgBotStats and comment before Segment Analytics):
```html
    </div>

    <!-- Segment Analytics -->
```

Replace with:
```html
    </div>

    <!-- A/B Test Stats -->
    <div class="dashboard" id="abTestStats" style="display:none;margin-top:-4px;" aria-label="A/B тест статистика">
        <div class="stat-card" style="border-top-color:var(--primary);">
            <div class="value" id="stat-ab-a-leads" style="color:var(--primary);">0</div>
            <div class="label">Вариант A — лидов</div>
            <div style="font-size:11px;color:var(--muted);margin-top:4px;" id="stat-ab-a-conv" aria-live="polite">0% конверсия</div>
        </div>
        <div class="stat-card" style="border-top-color:var(--purple);">
            <div class="value" id="stat-ab-b-leads" style="color:var(--purple);">0</div>
            <div class="label">Вариант B — лидов</div>
            <div style="font-size:11px;color:var(--muted);margin-top:4px;" id="stat-ab-b-conv" aria-live="polite">0% конверсия</div>
        </div>
    </div>

    <!-- Segment Analytics -->
```

- [ ] **Step 2: Extend updateDashboard() with A/B stats**

Find (line ~3430, closing brace of tgBotStats block, before `}`  that closes updateDashboard):
```js
            if (tgStatsEl) {
                tgStatsEl.style.display = tgLeads.length > 0 ? '' : 'none';
                const e1 = document.getElementById('stat-tg-leads');  if (e1) e1.textContent = tgLeads.length;
                const e2 = document.getElementById('stat-tg-briefs'); if (e2) e2.textContent = tgBriefs.length;
                const e3 = document.getElementById('stat-tg-conv');   if (e3) e3.textContent = tgConv + '%';
            }
        }
```

Replace with:
```js
            if (tgStatsEl) {
                tgStatsEl.style.display = tgLeads.length > 0 ? '' : 'none';
                const e1 = document.getElementById('stat-tg-leads');  if (e1) e1.textContent = tgLeads.length;
                const e2 = document.getElementById('stat-tg-briefs'); if (e2) e2.textContent = tgBriefs.length;
                const e3 = document.getElementById('stat-tg-conv');   if (e3) e3.textContent = tgConv + '%';
            }

            // A/B Test stats — visible only when tg_ab_enabled and there are leads with ab_variant
            const abLeadsA = leads.filter(function(l) { return l.abVariant === 'A'; });
            const abLeadsB = leads.filter(function(l) { return l.abVariant === 'B'; });
            const abStatsEl = document.getElementById('abTestStats');
            if (abStatsEl) {
                const hasAbData = abLeadsA.length > 0 || abLeadsB.length > 0;
                abStatsEl.style.display = hasAbData ? '' : 'none';
                const convA = abLeadsA.length > 0 ? Math.round((abLeadsA.filter(function(l) { return l.status >= 2; }).length / abLeadsA.length) * 100) : 0;
                const convB = abLeadsB.length > 0 ? Math.round((abLeadsB.filter(function(l) { return l.status >= 2; }).length / abLeadsB.length) * 100) : 0;
                const al = document.getElementById('stat-ab-a-leads'); if (al) al.textContent = abLeadsA.length;
                const ac = document.getElementById('stat-ab-a-conv');  if (ac) ac.textContent = convA + '% конверсия';
                const bl = document.getElementById('stat-ab-b-leads'); if (bl) bl.textContent = abLeadsB.length;
                const bc = document.getElementById('stat-ab-b-conv');  if (bc) bc.textContent = convB + '% конверсия';
            }
        }
```

- [ ] **Step 3: Map ab_variant from DB row to lead object**

The lead mapping is in `loadLeads` / `upsertLead`. Find where lead rows are mapped to JS objects. Look for where `deal_score` is mapped — `ab_variant` needs to be alongside it.

Find (line ~3237):
```js
                dealScore:          row.deal_score           ?? null,
                dealScoreReason:    row.deal_score_reason    || null
```

Replace with:
```js
                dealScore:          row.deal_score           ?? null,
                dealScoreReason:    row.deal_score_reason    || null,
                abVariant:          row.ab_variant           || null
```

Also find the upsert mapping (line ~3210):
```js
                deal_score:           lead.dealScore         ?? null,
                deal_score_reason:    lead.dealScoreReason   || null
```

Replace with:
```js
                deal_score:           lead.dealScore         ?? null,
                deal_score_reason:    lead.dealScoreReason   || null,
                ab_variant:           lead.abVariant         || null
```

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(dashboard): A/B test stat cards — leads per variant and conversion rate"
```

---

## Task 5: index.html — Onboarding Carousel

**Files:**
- Modify: `index.html`

Replaces the existing 3-step setup wizard (`checkOnboarding`, `finishOnboarding`, `showOnboardingStep`, `obStep1Save`, `obStep2Save`, `obSwitchTab`) with a new 6-slide read-only carousel.

- [ ] **Step 1: Replace onboarding CSS**

Find (lines ~449-453, the `/* ONBOARDING */` CSS block):
```css
        /* ONBOARDING */
        .ob-progress { display: flex; gap: 4px; margin-bottom: 16px; }
        .ob-progress-step { flex: 1; height: 3px; border-radius: 2px; background: var(--line); transition: background .2s; }
        .ob-progress-step.active { background: var(--primary); }
        .ob-step-num { background: var(--primary); border-radius: 50%; width: 22px; height: 22px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 11px; color: #0a0808; font-weight: 700; }
```

Replace with:
```css
        /* ONBOARDING CAROUSEL */
        .onboarding-overlay { position:fixed;inset:0;background:rgba(0,0,0,.72); }
        .onboarding-card { position:relative;width:min(540px,92vw);max-height:90vh;overflow-y:auto;background:var(--panel);border-radius:20px;border:3px solid var(--primary);padding:32px 32px 24px; }
        .onboarding-dots { display:flex;justify-content:center;gap:6px;margin-bottom:24px; }
        .onboarding-dot { width:8px;height:8px;border-radius:50%;background:var(--line);border:none;cursor:pointer;padding:0;transition:all .2s; }
        .onboarding-dot.active { background:var(--primary);width:22px;border-radius:4px; }
        .onboarding-emoji { font-size:72px;line-height:1;margin-bottom:16px;display:block;text-align:center; }
        .onboarding-title { font-size:22px;font-weight:700;text-align:center;margin:0 0 12px;color:var(--text); }
        .onboarding-body { font-size:14px;line-height:1.6;color:var(--muted);text-align:center;margin:0 0 16px; }
        .onboarding-tip { font-size:12px;padding:8px 14px;border-radius:8px;background:var(--bg2);color:var(--text);text-align:center;line-height:1.5; }
        .onboarding-nav { display:flex;justify-content:space-between;align-items:center;margin-top:20px;gap:8px; }
        .onboarding-close { position:absolute;top:12px;right:14px;background:none;border:none;color:var(--muted);font-size:18px;cursor:pointer;line-height:1;padding:4px 8px;border-radius:4px; }
        .onboarding-close:hover,.onboarding-close:focus-visible { color:var(--text);background:var(--bg2);outline:2px solid var(--primary);outline-offset:2px; }
```

- [ ] **Step 2: Replace onboarding HTML**

Find (lines ~7770-7777):
```html
    <div class="modal-overlay" id="onboardingModal">
        <div class="modal" style="width:500px;" role="dialog" aria-modal="true" aria-labelledby="obTitle">
            <div class="modal-header">
                <h2 id="obTitle">Добро пожаловать в ADERVIS OTR</h2>
            </div>
            <div class="modal-body" id="onboardingBody"></div>
        </div>
    </div>
```

Replace with:
```html
    <div id="onboardingModal" role="dialog" aria-modal="true" aria-labelledby="onboardingTitle"
         style="display:none;position:fixed;inset:0;z-index:1000;display:none;align-items:center;justify-content:center;">
        <div class="onboarding-overlay" onclick="closeOnboarding()" aria-hidden="true"></div>
        <div class="onboarding-card">
            <div class="onboarding-dots" id="onboardingDots" role="tablist" aria-label="Прогресс инструкции"></div>
            <div id="onboardingSlides"></div>
            <div class="onboarding-nav">
                <button id="obPrev" class="btn btn-outline" type="button" onclick="obGo(-1)"
                        aria-label="Предыдущий слайд" style="min-width:90px;">← Назад</button>
                <button id="obNext" class="btn" type="button" onclick="obGo(1)"
                        aria-label="Следующий слайд" style="min-width:120px;">Далее →</button>
            </div>
            <button class="onboarding-close" type="button" onclick="closeOnboarding()"
                    aria-label="Закрыть инструкцию">✕</button>
        </div>
    </div>
```

Note: The `display:none` appears twice intentionally — the second one overwrites the inline `display:flex` from the `display:none` reset. Fix: use `style="display:none;align-items:center;justify-content:center;"` (display:none hides, openOnboarding sets display:'flex').

- [ ] **Step 3: Replace old onboarding JS functions**

Find the entire old onboarding block (lines ~6948-7059):
```js
        // --- ОНБОРДИНГ ---
        function checkOnboarding() {
```
...all the way to the end of `obStep2Save`:
```js
            showOnboardingStep(3);
        }
```

Replace the entire block (from `// --- ОНБОРДИНГ ---` through the closing `}` of `obStep2Save`) with:

```js
        // ─── ONBOARDING CAROUSEL ────────────────────────────────────────────────────

        var _obSlide = 0;
        var _obFocusTrigger = null;

        var ONBOARDING_SLIDES = [
            {
                emoji: '🎯', accent: '#6366f1',
                title: 'Добавь первого лида',
                body: 'Нажми «+ Добавить» и вставь ссылку на профиль ВКонтакте, Instagram или Telegram. Выбери тип бизнеса — кафе, барбершоп, салон…',
                tip: 'Можно вставить сразу несколько ссылок через «Массовый импорт».'
            },
            {
                emoji: '🤖', accent: '#29b6f6',
                title: 'Telegram Bot сам собирает заявки',
                body: 'Добавь ссылку на бота в своё первое сообщение клиенту. Когда он пишет в бот — заявка появляется в OTR автоматически, вместе с брифом.',
                tip: 'Бриф заполняется прямо в Telegram — никаких форм, только кнопки.'
            },
            {
                emoji: '💬', accent: '#a855f7',
                title: 'Готовые скрипты под каждый этап',
                body: 'Открой диалог с лидом → кнопка «Скрипты». Выбери платформу (ВК / Inst / TG) и этап воронки — получишь текст с уже подставленными ссылками.',
                tip: 'Плейбук подскажет следующий шаг в нужный момент.'
            },
            {
                emoji: '✨', accent: '#f59e0b',
                title: 'AI пишет ответы и оценивает лидов',
                body: 'Кнопка «AI» в чате — Gemini предложит ответ на сообщение клиента. После заполнения брифа AI автоматически ставит оценку лиду от 1 до 100.',
                tip: 'Горячие лиды (80+) выделяются золотым бейджем в сайдбаре.'
            },
            {
                emoji: '✋', accent: '#818cf8',
                title: 'Подключись сам когда нужно',
                body: 'Нажми «✋ Подключиться» в заголовке чата — бот замолчит, а ты пишешь вручную. Клиент получает сообщение «Менеджер уже видит ваш запрос».',
                tip: 'Вернуть AI: кнопка «🤖 AI вкл» в том же месте.'
            },
            {
                emoji: '🧪', accent: '#22c55e',
                title: 'A/B тест приветственных сообщений',
                body: 'В Настройках → TG Bot включи A/B тест. Бот будет случайно отправлять клиентам вариант A или B. На дашборде видишь конверсию каждого.',
                tip: 'Используй лучший вариант — удвой заявки без лишней работы.',
                isFinal: true
            }
        ];

        function openOnboarding() {
            _obFocusTrigger = document.activeElement;
            _obSlide = 0;
            var modal = document.getElementById('onboardingModal');
            if (!modal) return;
            modal.style.display = 'flex';
            obRender();
            var next = document.getElementById('obNext');
            if (next) next.focus();
        }

        function closeOnboarding() {
            var modal = document.getElementById('onboardingModal');
            if (modal) modal.style.display = 'none';
            localStorage.setItem('onboarding_seen_v2', '1');
            if (_obFocusTrigger && _obFocusTrigger.focus) _obFocusTrigger.focus();
        }

        function maybeAutoOpenOnboarding() {
            if (localStorage.getItem('onboarding_seen_v2')) return;
            if (leads.length === 0) openOnboarding();
        }

        function obGo(dir) {
            var s = ONBOARDING_SLIDES[_obSlide];
            if (dir > 0 && s && s.isFinal) { closeOnboarding(); return; }
            var next = _obSlide + dir;
            if (next < 0 || next >= ONBOARDING_SLIDES.length) return;
            _obSlide = next;
            obRender();
        }

        function obJump(idx) {
            _obSlide = idx;
            obRender();
        }

        function obRender() {
            var s = ONBOARDING_SLIDES[_obSlide];
            if (!s) return;
            var total = ONBOARDING_SLIDES.length;

            var dotsEl = document.getElementById('onboardingDots');
            if (dotsEl) {
                dotsEl.innerHTML = ONBOARDING_SLIDES.map(function(_, i) {
                    return '<button class="onboarding-dot' + (i === _obSlide ? ' active' : '') + '"' +
                        ' role="tab" aria-selected="' + (i === _obSlide ? 'true' : 'false') + '"' +
                        ' aria-label="Слайд ' + (i + 1) + ' из ' + total + '"' +
                        ' onclick="obJump(' + i + ')"></button>';
                }).join('');
            }

            var slidesEl = document.getElementById('onboardingSlides');
            if (slidesEl) {
                slidesEl.innerHTML =
                    '<section role="tabpanel" style="text-align:center;">' +
                        '<span class="onboarding-emoji" aria-hidden="true">' + s.emoji + '</span>' +
                        '<h2 id="onboardingTitle" class="onboarding-title">' + escapeHtml(s.title) + '</h2>' +
                        '<p class="onboarding-body">' + escapeHtml(s.body) + '</p>' +
                        (s.tip ? '<div class="onboarding-tip"><span aria-hidden="true">💡 </span>' + escapeHtml(s.tip) + '</div>' : '') +
                    '</section>';
            }

            var prevBtn = document.getElementById('obPrev');
            if (prevBtn) prevBtn.style.visibility = _obSlide === 0 ? 'hidden' : 'visible';

            var nextBtn = document.getElementById('obNext');
            if (nextBtn) nextBtn.textContent = s.isFinal ? '🚀 Начать работу' : 'Далее →';

            var card = document.querySelector('.onboarding-card');
            if (card && s.accent) card.style.borderTopColor = s.accent;
        }
```

- [ ] **Step 4: Update the checkOnboarding call**

Find (line ~7534):
```js
            checkOnboarding();
```

Replace with:
```js
            maybeAutoOpenOnboarding();
```

- [ ] **Step 5: Add 📖 helpBtn to header**

Find (line ~1500):
```html
            <button class="btn btn-outline icon-btn" id="themeToggleBtn" onclick="toggleTheme()"
                    aria-label="Переключить тему" title="Тема">
```

Replace with:
```html
            <button id="helpBtn" class="btn btn-outline icon-btn" type="button" onclick="openOnboarding()"
                    aria-label="Как пользоваться приложением" data-tooltip="Инструкция">
                <span aria-hidden="true">📖</span>
            </button>
            <button class="btn btn-outline icon-btn" id="themeToggleBtn" onclick="toggleTheme()"
                    aria-label="Переключить тему" title="Тема">
```

- [ ] **Step 6: Add carousel keyboard handler**

Find (line ~7547, after the existing Ctrl+K keydown listener):
```js
        });

        // ═══════════════════════════════════════════════════
        //  MOBILE LAYER
```

Replace with:
```js
        });

        // Onboarding carousel keyboard navigation
        document.addEventListener('keydown', function(e) {
            var modal = document.getElementById('onboardingModal');
            if (!modal || modal.style.display === 'none') return;
            if (e.key === 'Escape') { e.preventDefault(); closeOnboarding(); }
            else if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); obGo(1); }
            else if (e.key === 'ArrowLeft') { e.preventDefault(); obGo(-1); }
            else if (e.key === 'Tab') {
                var focusable = Array.prototype.slice.call(document.querySelectorAll('#onboardingModal button')).filter(function(el) {
                    return el.style.visibility !== 'hidden' && !el.disabled;
                });
                if (!focusable.length) return;
                var first = focusable[0], last = focusable[focusable.length - 1];
                if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last.focus(); } }
                else { if (document.activeElement === last) { e.preventDefault(); first.focus(); } }
            }
        });

        // ═══════════════════════════════════════════════════
        //  MOBILE LAYER
```

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "feat(onboarding): replace 3-step wizard with 6-slide carousel — helpBtn, keyboard nav, WCAG focus trap"
```

---

## Task 6: Smoke Test + Push

- [ ] **Step 1: Open app in browser**

Open `index.html` (or the deployed URL). Expected: `📖` button visible in header top-right area.

- [ ] **Step 2: Test carousel auto-open (if no leads)**

Clear `onboarding_seen_v2` in DevTools → Application → Local Storage. Reload. If no leads: carousel opens automatically on slide 1.

- [ ] **Step 3: Test carousel navigation**

Navigate with Далее → button through all 6 slides. Verify:
- Slide 1: 🎯 Добавь первого лида
- Slide 6 button text changes to «🚀 Начать работу»
- Clicking «🚀 Начать работу» closes modal and sets `onboarding_seen_v2=1` in localStorage
- `←` button hidden on slide 1, visible on slides 2-6
- Dots highlight active slide, clicking dot jumps to that slide
- `→` and `Escape` keys work
- After close, focus returns to `📖` button

- [ ] **Step 4: Test A/B Settings UI**

Open Settings → TG Bot. Verify:
- A/B checkbox appears after the welcome text textarea
- Checking it reveals the Вариант B textarea
- Unchecking hides it
- Save → Supabase `workspace_settings.tg_ab_enabled = true`, `tg_welcome_text_b = "..."` in DB

- [ ] **Step 5: Test dashboard stats**

Set `ab_variant` on a test lead in Supabase directly (set to 'A' or 'B'). Reload OTR. Expected: `#abTestStats` row appears under TG Bot stats with lead counts.

- [ ] **Step 6: Push**

```bash
git push origin main
```

- [ ] **Step 7: Update memory**

Note Sprint 8 completion in memory file.

---

## Self-Review

**Spec coverage:**
- ✅ DB migration: `tg_welcome_text_b`, `tg_ab_enabled`, `ab_variant` → Task 1
- ✅ tg-webhook: random 50/50 variant on /start + first visit, persisted on lead → Task 2
- ✅ Settings UI: checkbox + variant B textarea + load/save → Task 3
- ✅ Dashboard: A/B stat cards with conversion → Task 4
- ✅ `abVariant` mapped in JS lead object → Task 4 Step 3
- ✅ Onboarding carousel: 6 slides, dots, prev/next, auto-open → Task 5
- ✅ localStorage key `onboarding_seen_v2` — shows to users who saw old wizard → Task 5
- ✅ `helpBtn` in header → Task 5 Step 5
- ✅ Keyboard: ArrowRight/Space/ArrowLeft/Escape/Tab trap → Task 5 Step 6
- ✅ WCAG: role=dialog, aria-modal, aria-labelledby, role=tab dots, focus restore → Task 5

**Placeholder scan:** None found.

**Type consistency:**
- `abEnabled: boolean` in tgSettings ↔ `!!(document.getElementById('tgAbEnabledInput') || {}).checked` → bool
- `ab_variant VARCHAR(1)` → `lead.abVariant` JS string | null → filtered with `=== 'A'` / `=== 'B'`
- `effectiveWelcome` replaces `welcomeText` at both send sites (lines ~180, ~219)

**Edge cases:**
- `ab_enabled` true but `welcome_text_b` not set → `effectiveWelcome = welcomeText` (no change)
- Lead gets `ab_variant` on first `/start`, all subsequent calls reuse it
- No leads with `ab_variant` → `#abTestStats` hidden (`hasAbData = false`)
- Old `adervis_onboarded_v1` key ignored — new key `onboarding_seen_v2` means existing users see carousel once
- `obPrev` hidden (visibility:hidden, not display:none) on slide 0 — still in focus trap cycle but invisible; Tab skips it because `style.visibility === 'hidden'` filter
