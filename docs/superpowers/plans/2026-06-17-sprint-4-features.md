# Sprint 4 Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 4 features to `index.html`: daily goal counter, archive instead of delete, AI deal score gauge, and command palette (Ctrl+K).

**Architecture:** All code lives in `index.html` (~4250 lines, single-file). New JS functions are injected near related existing functions. New HTML goes at end of `<body>`. DB columns added via Supabase migration file + `npx supabase db push`.

**Tech Stack:** Vanilla JS, CSS Custom Properties, Supabase JS v2, Gemini 2.0 Flash API.

---

## Task 0: DB Migration + Data Layer

**Files:**
- Create: `supabase/migrations/20260617000000_sprint4.sql`
- Modify: `index.html:1789` (`leadToRow`), `index.html:1810` (`rowToLead`), `index.html:1832` (`loadLeadsFromDB`)

- [ ] **Step 1: Create migration file**

```sql
-- supabase/migrations/20260617000000_sprint4.sql
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS archived_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deal_score   INTEGER,
  ADD COLUMN IF NOT EXISTS deal_score_reason TEXT;

ALTER TABLE workspace_settings
  ADD COLUMN IF NOT EXISTS daily_goal INTEGER DEFAULT 20;
```

- [ ] **Step 2: Apply migration**

```bash
npx supabase db push
```

Expected output: `Applying migration 20260617000000_sprint4.sql... Done`

- [ ] **Step 3: Update `leadToRow` — add 3 new fields**

In `index.html`, find `leadToRow` function (line ~1789). The return object ends with `playbook_step: lead.playbookStep ?? null`. Add after that line:

Old:
```js
                playbook_step: lead.playbookStep ?? null
            };
        }
```

New:
```js
                playbook_step:        lead.playbookStep    ?? null,
                archived_at:          lead.archivedAt       || null,
                deal_score:           lead.dealScore         ?? null,
                deal_score_reason:    lead.dealScoreReason   || null
            };
        }
```

- [ ] **Step 4: Update `rowToLead` — add 3 new fields**

Find `rowToLead` function (line ~1810). Last line is `playbookStep: row.playbook_step ?? null`. Add after:

Old:
```js
                playbookStep: row.playbook_step ?? null
            };
        }
```

New:
```js
                playbookStep:       row.playbook_step      ?? null,
                archivedAt:         row.archived_at         || null,
                dealScore:          row.deal_score           ?? null,
                dealScoreReason:    row.deal_score_reason    || null
            };
        }
```

- [ ] **Step 5: Filter archived leads out of `loadLeadsFromDB`**

Find `loadLeadsFromDB` (line ~1830). Add `.is('archived_at', null)` after `.eq('workspace_id', workspaceId)`:

Old:
```js
            const { data, error } = await _sb.from('leads')
                .select('*')
                .eq('workspace_id', workspaceId)
                .order('updated_at', { ascending: false });
```

New:
```js
            const { data, error } = await _sb.from('leads')
                .select('*')
                .eq('workspace_id', workspaceId)
                .is('archived_at', null)
                .order('updated_at', { ascending: false });
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260617000000_sprint4.sql index.html
git commit -m "feat: DB migration + data layer for sprint4 (archived_at, deal_score, daily_goal)"
```

---

## Task 1: Daily Goal Widget

**Files:**
- Modify: `index.html:1220` (global vars), `index.html:~3190` (new functions), `index.html:4184` (`initApp`), `index.html:~809` (header HTML)

- [ ] **Step 1: Add global variable**

Find line `let playbookConfig = null;` (~line 1220). Add after it:

```js
        let dailyGoal = 20;
```

- [ ] **Step 2: Add helper functions**

Find the closing `}` of `savePlaybookConfig` function (~line 3187). Add the following block immediately after:

```js
        function countTodayTouches() {
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const ts = todayStart.getTime();
            let count = 0;
            leads.forEach(function(l) {
                (l.messages || []).forEach(function(m) {
                    if (!m.fromClient && Number(m.date) >= ts) count++;
                });
            });
            return count;
        }

        function renderDailyGoalWidget() {
            const count = countTodayTouches();
            const goal  = dailyGoal;
            const pct   = goal > 0 ? count / goal : 0;
            const color = pct >= 1 ? 'var(--success)' : pct >= 0.5 ? 'var(--warning)' : 'var(--text-muted,#9ca3af)';
            return '<button id="dailyGoalBtn" onclick="toggleDailyGoalPopover(event)" ' +
                'style="background:none;border:1px solid var(--line);border-radius:6px;padding:4px 10px;cursor:pointer;color:' + color + ';font-size:13px;font-family:inherit;flex-shrink:0;white-space:nowrap;" ' +
                'aria-label="Дневная цель: ' + count + ' из ' + goal + ' касаний. Нажмите чтобы изменить цель.">' +
                count + ' / ' + goal + ' сегодня' +
                '</button>' +
                '<div id="dailyGoalPopover" style="display:none;position:absolute;top:calc(100% + 6px);right:0;z-index:200;background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:12px;width:180px;box-shadow:0 8px 24px rgba(0,0,0,.4);">' +
                '<label for="dailyGoalInput" style="font-size:12px;color:var(--text-muted,#9ca3af);display:block;margin-bottom:6px;">Цель на день (касаний)</label>' +
                '<input type="number" id="dailyGoalInput" value="' + goal + '" min="1" max="999" style="width:100%;margin-bottom:8px;box-sizing:border-box;" aria-label="Цель касаний на день">' +
                '<button class="btn btn-primary" style="width:100%;font-size:12px;" onclick="saveDailyGoal()">Сохранить</button>' +
                '</div>';
        }

        function updateDailyGoalWidget() {
            const wrap = document.getElementById('dailyGoalWrap');
            if (wrap) wrap.innerHTML = renderDailyGoalWidget();
        }

        function toggleDailyGoalPopover(e) {
            e.stopPropagation();
            const pop = document.getElementById('dailyGoalPopover');
            if (!pop) return;
            const isOpen = pop.style.display !== 'none';
            pop.style.display = isOpen ? 'none' : 'block';
            if (!isOpen) {
                const inp = document.getElementById('dailyGoalInput');
                if (inp) inp.focus();
                document.addEventListener('click', _closeDailyGoalOutside);
                document.addEventListener('keydown', function _escDG(e2) {
                    if (e2.key === 'Escape') {
                        pop.style.display = 'none';
                        document.removeEventListener('click', _closeDailyGoalOutside);
                        document.removeEventListener('keydown', _escDG);
                    }
                });
            } else {
                document.removeEventListener('click', _closeDailyGoalOutside);
            }
        }

        function _closeDailyGoalOutside(e) {
            const wrap = document.getElementById('dailyGoalWrap');
            if (wrap && !wrap.contains(e.target)) {
                const pop = document.getElementById('dailyGoalPopover');
                if (pop) pop.style.display = 'none';
                document.removeEventListener('click', _closeDailyGoalOutside);
            }
        }

        async function saveDailyGoal() {
            const inp = document.getElementById('dailyGoalInput');
            const n = parseInt(inp ? inp.value : dailyGoal, 10);
            if (!n || n < 1) return;
            dailyGoal = n;
            const pop = document.getElementById('dailyGoalPopover');
            if (pop) pop.style.display = 'none';
            document.removeEventListener('click', _closeDailyGoalOutside);
            if (workspaceId) {
                await _sb.from('workspace_settings').upsert({
                    workspace_id: workspaceId,
                    daily_goal:   n,
                    updated_at:   Date.now()
                }, { onConflict: 'workspace_id' });
            }
            updateDailyGoalWidget();
        }

        async function loadDailyGoal() {
            if (!workspaceId) return;
            const { data } = await _sb.from('workspace_settings')
                .select('daily_goal')
                .eq('workspace_id', workspaceId)
                .maybeSingle();
            if (data && data.daily_goal) dailyGoal = data.daily_goal;
        }
```

- [ ] **Step 3: Call `loadDailyGoal` in `initApp`**

Find `initApp` (~line 4182). After `await loadPlaybookConfig();` add:

```js
            await loadDailyGoal();
```

- [ ] **Step 4: Add `updateDailyGoalWidget()` call to `saveDB` and `addMessageToLead`**

In `saveDB` function (~line 1935), add at end:

Old:
```js
        function saveDB() {
            updateDashboard();
            renderTable();
            renderTgSidebar(currentChatLeadId);
            const emptyPanel = document.getElementById('tgEmpty');
            if (emptyPanel && emptyPanel.style.display === 'flex') {
                renderFunnelHero();
            }
        }
```

New:
```js
        function saveDB() {
            updateDashboard();
            renderTable();
            renderTgSidebar(currentChatLeadId);
            updateDailyGoalWidget();
            const emptyPanel = document.getElementById('tgEmpty');
            if (emptyPanel && emptyPanel.style.display === 'flex') {
                renderFunnelHero();
            }
        }
```

In `addMessageToLead` (~line 3470), after `updateTgSidebarItem(leadId);` add:

```js
            if (!fromClient) updateDailyGoalWidget();
```

- [ ] **Step 5: Add widget placeholder to header HTML**

Find line with `<button class="btn btn-primary" onclick="openBulkModal()"` (~line 810). Add the wrapper span **before** that line:

Old:
```html
            <button class="btn btn-primary" onclick="openBulkModal()" aria-label="Добавить лиды">+ Лид</button>
```

New:
```html
            <span id="dailyGoalWrap" style="position:relative;display:inline-flex;align-items:center;"></span>
            <button class="btn btn-primary" onclick="openBulkModal()" aria-label="Добавить лиды">+ Лид</button>
```

- [ ] **Step 6: Render widget on `initApp` completion**

In `initApp`, after `openTgView(null);` (last line, ~line 4200) add:

```js
            updateDailyGoalWidget();
```

- [ ] **Step 7: Verify manually**

Open `index.html` in browser. Header shows `0 / 20 сегодня` in gray. Send a manager message (tab "✍️ Я написал") → counter increments. Click counter → popover opens, change to 10 → Сохранить → counter reflects new goal. Goal persists after page refresh.

- [ ] **Step 8: Commit**

```bash
git add index.html
git commit -m "feat: daily goal counter widget in header with Supabase persistence"
```

---

## Task 2: Archive Instead of Delete

**Files:**
- Modify: `index.html:2291` (after `deleteLead`), `index.html:2534` (table row button), `index.html:933` (bulk actions), `index.html:2599` (`deleteSelected`), `index.html:4084` (`renderDrawerBody`), `index.html:961` (TG sidebar HTML), `index.html:1300` (`showToast` area), `index.html:4190` (`initApp`)

- [ ] **Step 1: Add `showToastHtml` helper**

Find `showToast` function (~line 1300). Add immediately after its closing `}`:

```js
        function showToastHtml(html, ms) {
            const el = document.getElementById('toastEl');
            if (!el) return;
            el.innerHTML = html;
            el.classList.add('visible');
            if (_toastTimer) clearTimeout(_toastTimer);
            _toastTimer = setTimeout(function() { el.classList.remove('visible'); }, ms || 2000);
        }
```

- [ ] **Step 2: Add archive/restore functions**

Find `deleteLead` function (~line 2291). Add after its closing `}`:

```js
        async function archiveLead(id) {
            if (!workspaceId) return;
            const archivedAt = new Date().toISOString();
            await _sb.from('leads')
                .update({ archived_at: archivedAt })
                .eq('id', String(id))
                .eq('workspace_id', workspaceId);
            leads = leads.filter(function(l) { return String(l.id) !== String(id); });
            if (String(currentChatLeadId) === String(id)) closeTgView();
            closeLeadDrawer();
            saveDB();
            const safeId = escapeHtml(String(id));
            showToastHtml(
                'Лид архивирован &nbsp;·&nbsp; ' +
                '<button onclick="restoreLead(\'' + safeId + '\')" ' +
                'style="background:none;border:none;color:var(--accent,#7c3aed);cursor:pointer;font-size:13px;padding:0;text-decoration:underline;" ' +
                'aria-label="Восстановить лид из архива">Восстановить</button>',
                5000
            );
        }

        async function restoreLead(id) {
            if (!workspaceId) return;
            await _sb.from('leads')
                .update({ archived_at: null })
                .eq('id', String(id))
                .eq('workspace_id', workspaceId);
            await loadLeadsFromDB();
            saveDB();
            showToast('Лид восстановлен ✓');
        }

        async function cleanupExpiredArchive() {
            if (!workspaceId) return;
            const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
            await _sb.from('leads').delete()
                .eq('workspace_id', workspaceId)
                .not('archived_at', 'is', null)
                .lt('archived_at', cutoff);
        }

        let _showArchive = false;
        let _archivedLeads = [];

        async function toggleArchiveSidebar() {
            _showArchive = !_showArchive;
            const btn = document.getElementById('archiveToggleBtn');
            if (_showArchive) {
                const { data } = await _sb.from('leads')
                    .select('*')
                    .eq('workspace_id', workspaceId)
                    .not('archived_at', 'is', null)
                    .order('archived_at', { ascending: false })
                    .limit(50);
                _archivedLeads = (data || []).map(rowToLead);
                const count = _archivedLeads.length;
                if (btn) btn.textContent = '🗃️ Архив (' + count + ') ✕';
                renderArchiveSidebar();
            } else {
                _archivedLeads = [];
                if (btn) btn.textContent = '🗃️ Архив';
                renderTgSidebar(currentChatLeadId);
            }
        }

        function renderArchiveSidebar() {
            const list = document.getElementById('tgLeadList');
            if (!list) return;
            if (!_archivedLeads.length) {
                list.innerHTML = '<div class="tg-empty-sidebar">Архив пуст</div>';
                return;
            }
            list.innerHTML = '<div class="sb-section-lbl" aria-hidden="true">🗃️ Архивные лиды</div>' +
                _archivedLeads.map(function(l) {
                    const safeId   = escapeHtml(String(l.id));
                    const safeName = escapeHtml(l.name || '—');
                    const date     = l.archivedAt ? new Date(l.archivedAt).toLocaleDateString('ru-RU') : '';
                    return '<div class="tg-lead-item" style="opacity:0.55;" role="listitem">' +
                        '<div style="flex:1;min-width:0;">' +
                        '<div class="tg-lead-name">' + safeName + '</div>' +
                        '<div class="tg-lead-preview" style="color:var(--text-muted,#9ca3af);">В архиве с ' + date + '</div>' +
                        '</div>' +
                        '<button onclick="restoreLead(\'' + safeId + '\');toggleArchiveSidebar();" ' +
                        'style="background:none;border:1px solid var(--line);border-radius:4px;color:var(--text-muted,#9ca3af);cursor:pointer;font-size:11px;padding:3px 7px;flex-shrink:0;" ' +
                        'aria-label="Восстановить лид ' + safeName + '">↩ Восстановить</button>' +
                        '</div>';
                }).join('');
        }
```

- [ ] **Step 3: Add archive toggle button to TG sidebar HTML**

Find the TG sidebar HTML (~line 961):

Old:
```html
            <div id="tgLeadList" role="list" aria-label="Список диалогов"></div>
        </div>
```

New:
```html
            <div id="tgLeadList" role="list" aria-label="Список диалогов"></div>
            <div style="padding:8px;">
                <button id="archiveToggleBtn" onclick="toggleArchiveSidebar()"
                    style="width:100%;background:none;border:1px solid var(--line);border-radius:6px;padding:6px 10px;cursor:pointer;color:var(--text-muted,#9ca3af);font-size:12px;font-family:inherit;text-align:left;"
                    aria-label="Показать или скрыть архив лидов">🗃️ Архив</button>
            </div>
        </div>
```

- [ ] **Step 4: Replace delete button in table row with archive**

Find line ~2534:

Old:
```js
                            <button class="btn btn-outline" style="color:var(--danger); border-color:#fca5a5; padding: 8px 10px;" aria-label="Удалить лид ${safeName}" data-tooltip="Удалить лид" onclick="deleteLead('${safeId}')"><span aria-hidden="true">×</span></button>
```

New:
```js
                            <button class="btn btn-outline" style="color:var(--text-muted,#9ca3af); padding: 8px 10px;" aria-label="Архивировать лид ${safeName}" data-tooltip="В архив" onclick="archiveLead('${safeId}')"><span aria-hidden="true">🗃️</span></button>
```

- [ ] **Step 5: Replace "Удалить выбранные" bulk button with archive**

Find line ~933:

Old:
```html
            <button class="btn btn-danger" onclick="deleteSelected()">🗑️ Удалить выбранные</button>
```

New:
```html
            <button class="btn btn-outline" onclick="archiveSelected()">🗃️ Архивировать выбранные</button>
```

- [ ] **Step 6: Replace `deleteSelected` with `archiveSelected`**

Find `deleteSelected` function (~line 2599):

Old:
```js
        function deleteSelected() {
            const ids = Array.from(selectedLeadIds);
            if(ids.length === 0) return alert('Ничего не выбрано.');
            if(!confirm(`Удалить выбранные лиды: ${ids.length} шт.?`)) return;

            leads = leads.filter(l => !selectedLeadIds.has(String(l.id)));
            selectedLeadIds = new Set();
            saveDB();
        }
```

New:
```js
        async function archiveSelected() {
            const ids = Array.from(selectedLeadIds);
            if (ids.length === 0) { showToast('Ничего не выбрано'); return; }
            const archivedAt = new Date().toISOString();
            await Promise.all(ids.map(function(id) {
                return _sb.from('leads')
                    .update({ archived_at: archivedAt })
                    .eq('id', String(id))
                    .eq('workspace_id', workspaceId);
            }));
            leads = leads.filter(function(l) { return !selectedLeadIds.has(String(l.id)); });
            selectedLeadIds = new Set();
            saveDB();
            showToast('Архивировано: ' + ids.length + ' лидов');
        }
```

- [ ] **Step 7: Add archive button to Lead Drawer**

In `renderDrawerBody` (~line 4014), find the template literal. At the end of the drawer body, before the closing backtick of `document.getElementById('drawerBody').innerHTML`, find the last field (history dialog section) and add an archive button after it:

Find:
```js
                    <div class="drawer-field">
                        <div class="drawer-field-label">История диалога${totalMsgs > 5 ? ` (последние 5 из ${totalMsgs})` : ''}</div>
                        <div class="chat-feed" style="max-height:200px;">${feedHtml}</div>
                        <button class="btn btn-outline" style="margin-top:8px;width:100%;font-size:12px;"
                            onclick="closeLeadDrawer(); openChatView('${safeId}')">
                            <span aria-hidden="true">✍️</span> Открыть полный диалог
                        </button>
                    </div>
                `;
```

Replace with:
```js
                    <div class="drawer-field">
                        <div class="drawer-field-label">История диалога${totalMsgs > 5 ? ` (последние 5 из ${totalMsgs})` : ''}</div>
                        <div class="chat-feed" style="max-height:200px;">${feedHtml}</div>
                        <button class="btn btn-outline" style="margin-top:8px;width:100%;font-size:12px;"
                            onclick="closeLeadDrawer(); openChatView('${safeId}')">
                            <span aria-hidden="true">✍️</span> Открыть полный диалог
                        </button>
                    </div>
                    <div class="drawer-field" style="margin-top:4px;">
                        <button class="btn btn-outline" style="width:100%;font-size:12px;color:var(--text-muted,#9ca3af);"
                            onclick="archiveLead('${safeId}')"
                            aria-label="Переместить лид в архив">
                            🗃️ В архив
                        </button>
                    </div>
                `;
```

- [ ] **Step 8: Call `cleanupExpiredArchive` in `initApp`**

In `initApp`, after `await loadDailyGoal();` add:

```js
            cleanupExpiredArchive(); // async, fire-and-forget
```

- [ ] **Step 9: Verify manually**

Open app. In table view: click 🗃️ on a lead → toast "Лид архивирован · Восстановить" appears, lead disappears from table. Click "Восстановить" in toast → lead reappears. In TG sidebar: click "🗃️ Архив" button → archived leads appear with "↩ Восстановить" buttons. Lead Drawer: "🗃️ В архив" button archives and closes drawer.

- [ ] **Step 10: Commit**

```bash
git add index.html
git commit -m "feat: archive instead of delete — soft-delete, sidebar toggle, restore from toast"
```

---

## Task 3: AI Deal Score

**Files:**
- Modify: `index.html:~3505` (new functions after `generateAiReply`), `index.html:1685` (`renderChatHeader`), `index.html:1526` (`selectTgLead`), `index.html:3470` (`addMessageToLead`)

- [ ] **Step 1: Add `renderScoreGauge` and `fetchDealScore` functions**

Find the end of `generateAiReply` function (~line 3540, look for the closing `}` after `showToast('Ошибка Gemini'`). Add immediately after:

```js
        function renderScoreGauge(score, reason) {
            if (score == null) return '';
            const r    = 10, sw = 3;
            const circ  = 2 * Math.PI * r;
            const filled = Math.max(0, Math.min(1, score / 100)) * circ;
            const color = score >= 70
                ? 'var(--success,#22c55e)'
                : score >= 30
                ? 'var(--warning,#f59e0b)'
                : 'var(--danger,#ef4444)';
            const safeReason = escapeHtml(reason || '');
            return '<span title="' + safeReason + '" ' +
                'style="display:inline-flex;align-items:center;gap:3px;flex-shrink:0;cursor:default;" ' +
                'aria-label="Вероятность сделки ' + score + '%">' +
                '<svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">' +
                '<circle cx="13" cy="13" r="' + r + '" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="' + sw + '"/>' +
                '<circle cx="13" cy="13" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="' + sw + '" ' +
                'stroke-dasharray="' + filled.toFixed(2) + ' ' + circ.toFixed(2) + '" ' +
                'stroke-linecap="round" transform="rotate(-90 13 13)"/>' +
                '</svg>' +
                '<span style="font-size:12px;color:' + color + ';font-weight:600;min-width:28px;">' + score + '%</span>' +
                '</span>';
        }

        async function fetchDealScore(lead) {
            const apiKey = getGeminiKey();
            if (!apiKey || !workspaceId) return;
            const clientMsgs = (lead.messages || []).filter(function(m) { return m.fromClient; });
            if (!clientMsgs.length) return;

            const last10 = (lead.messages || []).slice(-10);
            const dialog = last10.map(function(m) {
                return (m.fromClient ? 'Клиент: ' : 'Менеджер: ') +
                    m.text.slice(0, 300).replace(/[\r\n]+/g, ' ');
            }).join('\n');

            try {
                const resp = await fetch(
                    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{
                                parts: [{
                                    text: 'Ты — эксперт по холодным продажам. Оцени вероятность сделки от 0 до 100.\n' +
                                          'Сегмент: ' + (lead.bizType || 'неизвестен').slice(0, 50) + '\n' +
                                          'Диалог:\n' + dialog + '\n\n' +
                                          'Ответь ТОЛЬКО JSON без markdown: {"score":72,"reason":"краткое объяснение на русском до 120 символов"}'
                                }]
                            }],
                            generationConfig: { temperature: 0.2 }
                        })
                    }
                );
                if (!resp.ok) return;
                const json = await resp.json();
                const rawText = (((json.candidates || [])[0] || {}).content || {}).parts?.[0]?.text || '';
                const match = rawText.match(/\{[\s\S]*?\}/);
                if (!match) return;
                const result = JSON.parse(match[0]);
                if (typeof result.score !== 'number') return;

                lead.dealScore       = Math.max(0, Math.min(100, Math.round(result.score)));
                lead.dealScoreReason = String(result.reason || '').slice(0, 200);

                await _sb.from('leads').update({
                    deal_score:        lead.dealScore,
                    deal_score_reason: lead.dealScoreReason
                }).eq('id', String(lead.id)).eq('workspace_id', workspaceId);

                if (String(currentChatLeadId) === String(lead.id)) renderChatHeader(lead);
            } catch (_e) {
                // silent fail — score stays as-is
            }
        }
```

- [ ] **Step 2: Add score gauge to `renderChatHeader`**

In `renderChatHeader` (~line 1685), find where the chat header innerHTML is built. Find `'<div class="lead-title">' + escapeHtml(lead.name) + '</div>'` and add the gauge right after the contact/platform badges area. Specifically, find the playbook badge block and add the gauge before the status dropdown:

Find:
```js
                '<div class="chat-status-drop">' +
```

Add immediately before that line:
```js
                renderScoreGauge(lead.dealScore, lead.dealScoreReason) +
```

So the full area around the change looks like:
```js
                (function() {
                    // ... playbook badge ...
                })() +
                renderScoreGauge(lead.dealScore, lead.dealScoreReason) +
                '<div class="chat-status-drop">' +
```

- [ ] **Step 3: Trigger `fetchDealScore` when a lead is opened**

In `selectTgLead` function (~line 1526), after `renderChatView(lead);` add:

```js
            fetchDealScore(lead);
```

- [ ] **Step 4: Trigger `fetchDealScore` when a client message arrives**

In `addMessageToLead` (~line 3470), find the block after `upsertLead(lead);`. After `updateTgSidebarItem(leadId);` add:

```js
            if (fromClient) fetchDealScore(lead);
```

- [ ] **Step 5: Verify manually**

Open a lead that has client messages. The chat header shows a circular gauge (e.g., `67%`) colored red/yellow/green. Tooltip shows reason text. Adding a new client message re-fetches the score. Leads with no client messages show no gauge. Refresh page → score persists from Supabase.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: AI deal score gauge in chat header — Gemini-powered %, persisted to Supabase"
```

---

## Task 4: Command Palette (Ctrl+K)

**Files:**
- Modify: `index.html:~4235` (add HTML before `</body>`), `index.html:~1345` (add global vars), `index.html:~3940` (add JS functions), `index.html:4199` (`initApp` — register keydown)

- [ ] **Step 1: Add palette HTML**

Find the migrationModal div (~line 4237). Add the palette overlay **before** it:

```html
    <!-- Command Palette -->
    <div id="cmdPaletteOverlay"
         style="display:none;position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.55);align-items:flex-start;justify-content:center;padding-top:15vh;"
         onclick="if(event.target===this)closePalette()"
         role="dialog" aria-modal="true" aria-label="Командная строка">
        <div id="cmdPalette"
             style="background:var(--panel);border:1px solid var(--line);border-radius:12px;width:560px;max-width:calc(100vw - 32px);max-height:400px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(0,0,0,.5);">
            <div style="display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--line);flex-shrink:0;">
                <span aria-hidden="true" style="color:var(--text-muted,#9ca3af);font-size:15px;">⌘</span>
                <input id="cmdInput" type="text"
                    placeholder="Найти лид...  или  / для команд"
                    autocomplete="off"
                    style="flex:1;background:none;border:none;outline:none;font-size:14px;color:var(--text,#f1f5f9);"
                    oninput="renderPaletteResults(this.value)"
                    onkeydown="handlePaletteKey(event)"
                    aria-label="Поиск лидов или команд"
                    aria-autocomplete="list"
                    aria-controls="cmdResultsList">
                <kbd style="font-size:11px;color:var(--text-muted,#9ca3af);border:1px solid var(--line);border-radius:4px;padding:2px 5px;">Esc</kbd>
            </div>
            <div id="cmdResultsList" role="listbox" style="overflow-y:auto;padding:4px 0;" aria-label="Результаты"></div>
        </div>
    </div>
```

- [ ] **Step 2: Add global state variables**

Find `let lastVisibleLeadIds = [];` (~line 1348). Add after it:

```js
        let _paletteActive = false;
        let _paletteIndex  = 0;
        let _paletteItems  = [];
```

- [ ] **Step 3: Add palette JS functions**

Find `const debouncedSearch = debounce(...)` (~line 3935). Add the following block immediately before it:

```js
        // ── Command Palette ──────────────────────────────────────────────
        function openPalette() {
            _paletteActive = true;
            _paletteIndex  = 0;
            _paletteItems  = [];
            const overlay = document.getElementById('cmdPaletteOverlay');
            if (!overlay) return;
            overlay.style.display = 'flex';
            const input = document.getElementById('cmdInput');
            if (input) { input.value = ''; input.focus(); }
            renderPaletteResults('');
        }

        function closePalette() {
            _paletteActive = false;
            const overlay = document.getElementById('cmdPaletteOverlay');
            if (overlay) overlay.style.display = 'none';
        }

        function renderPaletteResults(query) {
            const list = document.getElementById('cmdResultsList');
            if (!list) return;
            _paletteIndex = 0;
            const q = (query || '').trim();

            if (q.startsWith('/')) {
                const cmd = q.slice(1).toLowerCase();
                const hasCurrent = !!currentChatLeadId;
                const allCmds = [
                    { type:'cmd', key:'new',      icon:'➕', label:'Добавить лид',       sub:'/new',      disabled:false },
                    { type:'cmd', key:'status',   icon:'🔄', label:'Сменить статус лида', sub:'/status',   disabled:!hasCurrent },
                    { type:'cmd', key:'archive',  icon:'🗃️', label:'Архивировать лид',   sub:'/archive',  disabled:!hasCurrent },
                    { type:'cmd', key:'settings', icon:'⚙️', label:'Настройки',           sub:'/settings', disabled:false },
                    { type:'cmd', key:'scripts',  icon:'📋', label:'Редактор скриптов',   sub:'/scripts',  disabled:false },
                ];
                _paletteItems = cmd
                    ? allCmds.filter(function(c) { return c.key.startsWith(cmd); })
                    : allCmds;
            } else {
                const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
                _paletteItems = leads.filter(function(l) {
                    if (!terms.length) return true;
                    const hay = [(l.name||''),(l.link||''),(l.bizType||''),(l.contact||'')].join(' ').toLowerCase();
                    return terms.every(function(t) { return hay.includes(t); });
                }).slice(0, 10).map(function(l) { return { type:'lead', lead:l }; });
            }

            if (!_paletteItems.length) {
                list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted,#9ca3af);font-size:13px;">Ничего не найдено</div>';
                return;
            }

            list.innerHTML = _paletteItems.map(function(item, i) {
                const isFirst = i === 0;
                const bg = isFirst ? 'background:rgba(108,0,255,.12);' : '';
                if (item.type === 'lead') {
                    const l = item.lead;
                    const badge = statuses[l.status] || { label:'?' };
                    const icon = ['⚪️','🔵','🟠','🟢','🔴'][l.status] || '⚪️';
                    return '<div role="option" class="cmd-palette-row" id="cmdRow-' + i + '" ' +
                        'aria-selected="' + isFirst + '" ' +
                        'onclick="executePaletteItem(' + i + ')" ' +
                        'style="padding:9px 14px;cursor:pointer;display:flex;gap:10px;align-items:center;' + bg + '">' +
                        '<span style="flex-shrink:0;width:20px;text-align:center;">' + icon + '</span>' +
                        '<span style="flex:1;overflow:hidden;">' +
                        '<span style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:14px;">' + escapeHtml(l.name || '—') + '</span>' +
                        '<span style="font-size:11px;color:var(--text-muted,#9ca3af);">' +
                            escapeHtml((l.link||'').replace(/^https?:\/\//,'').slice(0,50)) +
                            (l.bizType ? ' · ' + escapeHtml(l.bizType) : '') +
                        '</span>' +
                        '</span>' +
                        '<span style="font-size:11px;color:var(--text-muted,#9ca3af);flex-shrink:0;">' + escapeHtml(badge.label) + '</span>' +
                        '</div>';
                } else {
                    const opacity = item.disabled ? '0.38' : '1';
                    const cursor  = item.disabled ? 'default' : 'pointer';
                    const click   = item.disabled ? '' : 'onclick="executePaletteItem(' + i + ')"';
                    return '<div role="option" class="cmd-palette-row" id="cmdRow-' + i + '" ' +
                        'aria-selected="' + isFirst + '" ' + click + ' ' +
                        'style="padding:9px 14px;display:flex;gap:10px;align-items:center;opacity:' + opacity + ';cursor:' + cursor + ';' + (isFirst && !item.disabled ? bg : '') + '">' +
                        '<span style="flex-shrink:0;width:20px;text-align:center;">' + item.icon + '</span>' +
                        '<span style="flex:1;font-size:14px;">' + escapeHtml(item.label) + '</span>' +
                        '<kbd style="font-size:11px;color:var(--text-muted,#9ca3af);border:1px solid var(--line);border-radius:4px;padding:2px 6px;font-family:monospace;">' + escapeHtml(item.sub) + '</kbd>' +
                        '</div>';
                }
            }).join('');
        }

        function _paletteHighlight(idx) {
            const rows = document.querySelectorAll('.cmd-palette-row');
            rows.forEach(function(r, i) {
                r.style.background = i === idx ? 'rgba(108,0,255,.12)' : '';
                r.setAttribute('aria-selected', String(i === idx));
            });
            const active = document.getElementById('cmdRow-' + idx);
            if (active) active.scrollIntoView({ block: 'nearest' });
        }

        function handlePaletteKey(e) {
            if (e.key === 'Escape')    { closePalette();  e.preventDefault(); return; }
            if (e.key === 'ArrowDown') {
                _paletteIndex = Math.min(_paletteIndex + 1, _paletteItems.length - 1);
                _paletteHighlight(_paletteIndex); e.preventDefault(); return;
            }
            if (e.key === 'ArrowUp')   {
                _paletteIndex = Math.max(_paletteIndex - 1, 0);
                _paletteHighlight(_paletteIndex); e.preventDefault(); return;
            }
            if (e.key === 'Enter')     { executePaletteItem(_paletteIndex); e.preventDefault(); return; }
        }

        function executePaletteItem(idx) {
            const item = _paletteItems[idx];
            if (!item || item.disabled) return;
            closePalette();
            if (item.type === 'lead') {
                const tgView = document.getElementById('tg-view');
                if (tgView && tgView.style.display !== 'flex') openTgView(item.lead.id);
                selectTgLead(item.lead.id);
            } else if (item.key === 'new')      { openBulkModal(); }
            else if (item.key === 'status')     { openChatStatusDrop(); }
            else if (item.key === 'archive')    { if (currentChatLeadId) archiveLead(currentChatLeadId); }
            else if (item.key === 'settings')   { openSettingsModal(); }
            else if (item.key === 'scripts')    { openScriptDrawer(); }
        }
        // ─────────────────────────────────────────────────────────────────
```

- [ ] **Step 4: Register Ctrl+K listener in `initApp`**

In `initApp`, after `openTgView(null);` and `updateDailyGoalWidget();` add:

```js
            document.addEventListener('keydown', function(e) {
                if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                    e.preventDefault();
                    if (_paletteActive) closePalette(); else openPalette();
                }
            });
```

- [ ] **Step 5: Verify manually**

Press Ctrl+K → dark overlay appears, input focused. Type "кофе" → leads named кофейня filter in real-time. Arrow keys scroll through list, Enter opens the lead in TG-view. Press Esc → closes. Press Ctrl+K again. Type `/` → 5 commands appear. Type `/st` → only `/status` remains. Press Enter → status dropdown opens on current lead. Type `/archive` + Enter → current lead archived. `/new` → new lead modal opens.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: command palette Ctrl+K — lead search + slash commands"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** All 4 features fully covered (daily goal, archive, deal score, command palette)
- [x] **DB migrations:** `archived_at`, `deal_score`, `deal_score_reason`, `daily_goal` — all in Task 0
- [x] **leadToRow / rowToLead:** Updated in Task 0 to include new fields
- [x] **loadLeadsFromDB filter:** `.is('archived_at', null)` added in Task 0
- [x] **No placeholders:** All code blocks complete, no TBD
- [x] **Type consistency:** `archiveLead(id)` called as `archiveLead(id)` everywhere; `fetchDealScore(lead)` takes lead object; `renderScoreGauge(score, reason)` matches usage in `renderChatHeader`
- [x] **`_showArchive` and `_archivedLeads` globals:** Declared inside `archiveLead` block in Task 2 Step 2
- [x] **`showToastHtml`:** Declared in Task 2 Step 1 before first use in `archiveLead`
- [x] **`_paletteActive`, `_paletteIndex`, `_paletteItems`:** Declared in Task 4 Step 2 before functions
