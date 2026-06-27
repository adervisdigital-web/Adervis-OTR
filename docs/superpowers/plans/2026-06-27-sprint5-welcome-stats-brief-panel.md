# Sprint 5: First-message Welcome + TG Stats + Brief Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Три улучшения: (1) бот автоматически показывает меню при первом сообщении без /start, (2) статистика TG-лидов в сайдбаре (всего / брифов / конверсия), (3) коллапсируемая панель брифа под хедером чата.

**Architecture:** п.12 — одна проверка в `tg-webhook/index.ts` + передача `welcomeText` в `handleMessage`. п.8 — клиентская `renderTgStats()` считает данные из массива `leads` без новых DB-запросов. п.13 — `<div id="chatBriefPanel">` внутри `.chat-body`, заполняется `renderBriefPanel(lead)` при переключении лида, показывается/скрывается `toggleBriefPanel()` по кнопке ℹ️ в хедере чата.

**Tech Stack:** Deno TypeScript (tg-webhook), Vanilla JS, HTML/CSS (index.html).

---

## File Map

| Файл | Изменение |
|------|-----------|
| `supabase/functions/tg-webhook/index.ts` | п.12: `handleMessage` принимает `welcomeText`; first-client-msg check |
| `index.html` | п.8: `#tgStatsRow` + `renderTgStats()`; п.13: `#chatBriefPanel` + CSS + `toggleBriefPanel()` + `renderBriefPanel()` + кнопка ℹ️ в `renderChatHeader()` |

---

## Task 1: п.12 — First-message auto-welcome (tg-webhook)

**Files:**
- Modify: `supabase/functions/tg-webhook/index.ts`

Сейчас если человек пишет текст (не /start) → AI отвечает, но меню не показывается. Нужно: первое клиентское сообщение → сначала welcome + меню, потом AI.

- [ ] **Step 1: Добавить `welcomeText` в сигнатуру `handleMessage`**

Найти строку ~148:
```ts
async function handleMessage(msg: LeadRow, sb: SbClient, tok: string, wsId: string) {
```

Заменить на:
```ts
async function handleMessage(msg: LeadRow, sb: SbClient, tok: string, wsId: string, welcomeText: string) {
```

- [ ] **Step 2: Обновить вызов `handleMessage` в `serve()`**

Найти строку ~133:
```ts
    if (msg) await handleMessage(msg, sb, tok, wsId)
```

Заменить на:
```ts
    if (msg) await handleMessage(msg, sb, tok, wsId, welcomeText)
```

- [ ] **Step 3: Добавить first-client-message check**

В `handleMessage`, найти блок ~строка 209–214 (после `addMsg`, перед `classifyService`):
```ts
  // Store incoming
  await addMsg(sb, lead, wsId, text, true)

  // Classify service direction on first substantive message (fire-and-forget)
  if (!lead.service_category && text.length > 3 && !text.startsWith('/')) {
    classifyService(text).then(cat =>
      sb.from('leads').update({ service_category: cat }).eq('id', lead.id as string)
    ).catch(() => {})
  }

  // Human takeover — manager is handling, skip AI
```

Вставить МЕЖДУ концом classifyService-блока и `// Human takeover`:
```ts
  // п.12: First-time visitor (no prior client messages) → show welcome + menu before AI
  const priorClientMsgs = ((lead.messages as LeadRow[] | null) ?? []).filter((m: any) => m.fromClient === true)
  if (priorClientMsgs.length === 0) {
    await tgSend(tok, chatId, welcomeText, MAIN_KB)
  }

  // Human takeover — manager is handling, skip AI
```

Логика: `lead.messages` содержит сообщения ДО текущего (addMsg уже добавил текущее, но в `lead` объекте — старый снимок). Если ни одного `fromClient` ранее не было — показываем welcome. Затем код продолжается в AI-секцию.

- [ ] **Step 4: Deploy**

```bash
npx supabase functions deploy tg-webhook --no-verify-jwt
```

Ожидаемый вывод: `Deployed Functions.`

- [ ] **Step 5: Ручной тест**

Создать нового пользователя (или сбросить данные тестового): написать в бот произвольный текст без /start.

Ожидаемо в TG:
1. Сообщение: welcome-текст + кнопки меню (🎬 Видео / 🎨 Дизайн / ...)
2. Сообщение: AI-ответ на введённый текст

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/tg-webhook/index.ts
git commit -m "feat(tg-webhook): show welcome menu on first message without /start"
```

---

## Task 2: п.8 — TG Stats Row в сайдбаре (index.html)

**Files:**
- Modify: `index.html`

Компактная строка из 3 чипов под поиском. Считается из массива `leads` на клиенте — без новых запросов к БД. Скрывается если нет TG-лидов.

- [ ] **Step 1: Добавить CSS**

Найти в CSS-блоке (`<style>`) любое место рядом с `.tg-search-wrap` или `.tg-sidebar-header`. Добавить:
```css
        #tgStatsRow { display: none; padding: 4px 10px 6px; gap: 10px; font-size: 11px; color: var(--muted); flex-wrap: wrap; align-items: center; border-bottom: 1px solid var(--line); }
        #tgStatsRow span { display: inline-flex; align-items: center; gap: 3px; }
```

- [ ] **Step 2: Добавить HTML**

Найти в index.html (~строка 1663):
```html
            <div id="tgLeadList" role="list" aria-label="Список диалогов"></div>
```

Вставить ПЕРЕД этой строкой:
```html
            <div id="tgStatsRow" role="status" aria-label="Статистика Telegram-диалогов" aria-live="polite"></div>
```

- [ ] **Step 3: Добавить JS-функцию `renderTgStats()`**

Найти функцию `renderTgSidebar(selectId)` (~строка 2609). Добавить перед ней новую функцию:
```js
        function renderTgStats() {
            var row = document.getElementById('tgStatsRow');
            if (!row) return;
            var tgLeads = leads.filter(function(l) { return !!l.tgChatId; });
            var total = tgLeads.length;
            if (total === 0) { row.style.display = 'none'; return; }
            var briefs = tgLeads.filter(function(l) {
                return (l.notes && l.notes.includes('🔥 НОВАЯ ЗАЯВКА')) ||
                       (l.tgState && l.tgState.brief && Object.keys(l.tgState.brief).length >= 4);
            }).length;
            var conv = Math.round(briefs / total * 100);
            row.style.display = 'flex';
            row.innerHTML =
                '<span aria-label="' + total + ' лидов из Telegram">🤖 ' + total + ' лидов</span>' +
                '<span aria-label="' + briefs + ' брифов заполнено">🔥 ' + briefs + ' бриф' + (briefs === 1 ? '' : briefs >= 2 && briefs <= 4 ? 'а' : 'ов') + '</span>' +
                '<span aria-label="Конверсия в бриф ' + conv + ' процентов">📈 ' + conv + '%→Бриф</span>';
        }
```

- [ ] **Step 4: Вызвать `renderTgStats()` из `renderTgSidebar()`**

Найти конец функции `renderTgSidebar()` (~где `list.innerHTML` присваивается финально). Добавить вызов в самом конце функции перед закрывающей `}`:
```js
            renderTgStats();
```

- [ ] **Step 5: Ручной проверка**

Открыть приложение, перейти в TG-вкладку. Под поиском должна появиться строка: `🤖 N лидов  🔥 M брифов  📈 X%→Бриф`.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat(ui): TG stats row in sidebar (total/briefs/conversion)"
```

---

## Task 3: п.13 — Brief Panel под хедером чата (index.html)

**Files:**
- Modify: `index.html`

Коллапс-панель внутри `.chat-body`, перед `#playbookBar`. Заполняется при переключении лида, стартует скрытой. Кнопка ℹ️ в chat-header показывает/скрывает.

- [ ] **Step 1: Добавить CSS**

В `<style>` добавить блок (рядом с `#playbookBar` стилями, ~строка 314–329):
```css
        #chatBriefPanel { border-bottom: 1px solid var(--line); background: rgba(0,0,0,.025); padding: 10px 16px; font-size: 12px; }
        .brief-panel-inner { display: flex; flex-direction: column; gap: 6px; }
        .brief-tags { display: flex; flex-wrap: wrap; gap: 4px; }
        .brief-tag { background: rgba(200,144,42,.12); color: var(--primary2); border-radius: 4px; padding: 2px 8px; font-size: 11px; font-weight: 600; white-space: nowrap; }
        .brief-contact { color: var(--text); }
        .brief-score { display: flex; align-items: baseline; gap: 6px; }
        #briefInfoToggle.active { color: var(--primary2); }
```

- [ ] **Step 2: Добавить HTML**

Найти (~строка 1682):
```html
                    <div id="playbookBar" style="display:none;" role="region" aria-label="Текущий шаг плейбука"></div>
```

Вставить ПОСЛЕ этой строки (перед `<!-- History feed -->`):
```html
                    <div id="chatBriefPanel" style="display:none;" role="region" aria-label="Информация о лиде и бриф" aria-expanded="false"></div>
```

- [ ] **Step 3: Добавить `toggleBriefPanel()` JS**

Найти функцию `switchTgMode(leadId)` (~строка 4633). Добавить перед ней:
```js
        function toggleBriefPanel() {
            var panel = document.getElementById('chatBriefPanel');
            var btn   = document.getElementById('briefInfoToggle');
            if (!panel) return;
            var isOpen = panel.style.display !== 'none';
            panel.style.display = isOpen ? 'none' : '';
            var expanded = String(!isOpen);
            panel.setAttribute('aria-expanded', expanded);
            if (btn) {
                btn.setAttribute('aria-expanded', expanded);
                btn.classList.toggle('active', !isOpen);
            }
        }
```

- [ ] **Step 4: Добавить `renderBriefPanel(lead)` JS**

Добавить рядом с `toggleBriefPanel()`:
```js
        function renderBriefPanel(lead) {
            var panel = document.getElementById('chatBriefPanel');
            if (!panel) return;
            var b = (lead.tgState && lead.tgState.brief) || {};
            var tags = [b.business, b.format, b.city, b.budget].filter(Boolean).map(function(t) {
                return '<span class="brief-tag">' + escapeHtml(String(t)) + '</span>';
            }).join('');
            var contact = b.contact || b.name || '';
            var catIcons = { video: '🎬', design: '🎨', photo: '📸', ai: '🤖' };
            var catIcon  = catIcons[lead.serviceCategory] || '';
            var sc = lead.dealScore || 0;
            var scColor = sc >= 70 ? 'var(--success)' : sc >= 30 ? 'var(--warning)' : 'var(--muted)';
            var scoreHtml = sc > 0
                ? '<div class="brief-score">' +
                      '<span style="font-weight:700;color:' + scColor + '">' + sc + '%</span>' +
                      (lead.dealScoreReason
                          ? '<span style="font-size:11px;color:var(--muted);">' + escapeHtml(lead.dealScoreReason) + '</span>'
                          : '') +
                  '</div>'
                : '';
            if (!tags && !contact && !sc) {
                panel.innerHTML = '<span style="color:var(--muted);">Бриф ещё не заполнен</span>';
                return;
            }
            panel.innerHTML =
                '<div class="brief-panel-inner">' +
                    (tags ? '<div class="brief-tags">' + tags + '</div>' : '') +
                    (contact
                        ? '<div class="brief-contact">📞 ' + escapeHtml(contact) +
                          (catIcon ? ' &nbsp;<span aria-hidden="true">' + catIcon + '</span>' : '') + '</div>'
                        : '') +
                    scoreHtml +
                '</div>';
        }
```

- [ ] **Step 5: Обновить `renderChatHeader(lead)` — сброс панели + кнопка ℹ️ + вызов renderBriefPanel**

**5a.** В самом начале `renderChatHeader(lead)` (~строка 3000), сразу после `if (!header) return;`, добавить сброс панели:
```js
            // Reset brief panel on lead switch
            var bp = document.getElementById('chatBriefPanel');
            if (bp) { bp.style.display = 'none'; bp.setAttribute('aria-expanded', 'false'); }
```

**5b.** В `header.innerHTML = ...` найти строку с кнопкой Scripts (~строка 3020):
```js
                '<button class="chat-profile-link" onclick="openScriptDrawer()" aria-label="Шаблоны ответов" title="Шаблоны ответов">...</button>' +
                (lead.tgChatId ? (function() {
```

Вставить ℹ️ кнопку ПОСЛЕ кнопки Scripts и ПЕРЕД `(lead.tgChatId ?`:
```js
                '<button class="chat-profile-link" onclick="openScriptDrawer()" aria-label="Шаблоны ответов" title="Шаблоны ответов">...</button>' +
                '<button id="briefInfoToggle" class="chat-profile-link" onclick="toggleBriefPanel()" aria-label="Информация о лиде и бриф" aria-expanded="false" title="Бриф и информация о лиде"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></button>' +
                (lead.tgChatId ? (function() {
```

**5c.** В конце `renderChatHeader`, после `renderPlaybookBar(lead)` (~строка 3032):
```js
            renderPlaybookBar(lead);
            renderBriefPanel(lead);
```

- [ ] **Step 6: Ручной тест**

1. Открыть лида с заполненным брифом в TG-вкладке
2. В хедере чата появилась иконка ℹ️ — кликнуть
3. Под хедером раскрывается панель: теги бизнес/формат/город/бюджет, контакт, score%
4. Кликнуть ещё раз — панель закрывается
5. Переключить на другого лида — панель автоматически закрыта

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "feat(ui): collapsible brief panel below chat header"
```

---

## Task 4: Smoke Test + Push

- [ ] **Step 1: Проверить все три фичи совместно**

1. **п.12**: Зайти в бот новым пользователем → написать текст без /start → получить welcome + меню + AI ответ
2. **п.8**: В OTR TG-вкладка → под поиском видно `🤖 N лидов 🔥 M брифов 📈 X%→Бриф`
3. **п.13**: Открыть лида с брифом → нажать ℹ️ → панель раскрылась с тегами и score

- [ ] **Step 2: Push**

```bash
git push origin main
```

---

## Self-Review

**Spec coverage:**
- ✅ п.12: `priorClientMsgs.length === 0` → `tgSend(welcomeText, MAIN_KB)` → Task 1
- ✅ п.8: `renderTgStats()` считает `tgLeads / briefs / conv` из `leads` → Task 2
- ✅ п.13: `#chatBriefPanel` + `toggleBriefPanel()` + `renderBriefPanel(lead)` + ℹ️ кнопка → Task 3

**Placeholder scan:** Нет TBD. Весь код полный.

**Type consistency:**
- `renderBriefPanel(lead)` — `lead.tgState`, `lead.dealScore`, `lead.dealScoreReason`, `lead.serviceCategory` — все поля из `rowToLead` маппинга, используются в других функциях (scorePill, renderScoreGauge)
- `renderTgStats()` — использует `l.tgChatId`, `l.notes`, `l.tgState.brief` — те же поля что в `renderTgSidebarItem()`
- `priorClientMsgs` тест на `m.fromClient` — то же поле что используется в `handleMessage` и `addMsg` через тип `{ text, date, fromClient }`

**Edge cases:**
- TG-лидов нет → `#tgStatsRow` скрыт (`display:none`)
- Бриф не заполнен → панель показывает "Бриф ещё не заполнен" (а не пустую)
- `lead.tgState` null → `b = {}` → tags пустые → graceful
- Первое сообщение — команда (/start и т.д.) → уже обрабатывается командными ветками выше по коду, до нашей проверки не дойдёт
- `priorClientMsgs.length === 0` но лид существовал (только менеджер писал) → welcome покажется снова, что правильно — клиент впервые отвечает
