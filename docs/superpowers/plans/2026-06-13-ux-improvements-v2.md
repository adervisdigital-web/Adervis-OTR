# UX Improvements v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the chat script panel (copy icon on cards, remove draft area, status dropdown), add global CSS tooltips, and add segment selector to bulk import.

**Architecture:** All changes are in a single file `Adervis LidGen.html`. No dependencies added. CSS changes go in `<style>` block, JS changes in `<script>` block. No automated tests — each task ends with a manual browser verification checklist.

**Tech Stack:** Vanilla JS, CSS Custom Properties, localStorage. Open `Adervis LidGen.html` directly in a browser to verify.

---

## Scope note

No automated test runner. Each task ends with **manual verification** in the browser. Open `Adervis LidGen.html` directly (file:// protocol) and follow the checklist.

---

## File map

Only one file changes: `Adervis LidGen.html`

| Region | Approx. lines | What changes |
|--------|--------------|--------------|
| CSS `<style>` | ~1–250 | Add tooltip, toast, copy icon, script chip styles |
| Bulk modal HTML | ~499–522 | Add `<select id="bulkBizType">` above textarea |
| Chat right panel HTML | ~450–475 | Remove `#replyTextarea`, `.chat-send-bar`, `#ai-variants` |
| Chat stage-nav HTML | find `stage-nav-strip` | Remove the strip element |
| `renderChatHeader()` | ~682–694 | Add status dropdown |
| `renderScriptPanel()` | ~1241–1272 | Add chips, copy icons, remove old card buttons |
| `renderStageNav()` | ~1302–1321 | Delete entire function + its call site |
| `showAiVariants()` | ~1578–1598 | Output AI result as temporary cards |
| `copyReply()` / `submitManagerMsg()` | find by name | Delete both functions |
| `confirmBulkImport()` | ~920–932 | Read `bulkBizType` and apply to new leads |
| `previewBulkAdd()` | ~884–918 | Show segment in preview list |
| All `data-tooltip` targets | scattered | Add attribute to 8 elements |

---

## Task 1: CSS — tooltip, toast, copy icon, script chip styles

**Files:**
- Modify: `Adervis LidGen.html` — `<style>` block

- [ ] **Step 1: Add CSS after last rule in `<style>` block**

Find the closing `</style>` tag. Insert all of the following CSS **before** it:

```css
        /* ── Tooltip ─────────────────────────────────────────── */
        [data-tooltip] { position: relative; }
        [data-tooltip]::after {
            content: attr(data-tooltip);
            position: absolute; bottom: calc(100% + 6px); left: 50%;
            transform: translateX(-50%);
            background: #1a1b1e; color: var(--text); font-size: 11px;
            padding: 4px 8px; border-radius: 6px; white-space: nowrap;
            border: 1px solid var(--line); pointer-events: none;
            opacity: 0; transition: opacity .15s; z-index: 300;
            font-family: var(--font-ui);
        }
        [data-tooltip]:hover::after { opacity: 1; }

        /* ── Toast ───────────────────────────────────────────── */
        #toastEl {
            position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
            background: #23252a; color: var(--text); font-size: 13px;
            padding: 8px 16px; border-radius: 8px; border: 1px solid var(--line);
            box-shadow: 0 4px 16px rgba(0,0,0,.6); z-index: 400;
            opacity: 0; transition: opacity .2s; pointer-events: none;
            font-family: var(--font-ui);
        }
        #toastEl.visible { opacity: 1; }

        /* ── Script card copy icon ────────────────────────────── */
        .script-card { position: relative; cursor: default; }
        .script-card-copy {
            position: absolute; bottom: 8px; right: 8px;
            background: transparent; border: none; padding: 4px;
            color: var(--muted); cursor: pointer; border-radius: 4px;
            display: flex; align-items: center; justify-content: center;
            transition: color .12s, background .12s;
        }
        .script-card-copy:hover { color: var(--text); background: rgba(255,255,255,.07); }
        .script-card-text { padding-right: 32px; }

        /* ── Script stage chips ───────────────────────────────── */
        .script-stage-chips { display: flex; gap: 6px; flex-wrap: wrap; padding: 10px 12px 6px; flex-shrink: 0; }
        .script-stage-chip {
            padding: 3px 10px; border-radius: 6px; border: 1px solid var(--line);
            background: transparent; color: var(--muted); font-size: 11px;
            font-weight: 600; cursor: pointer; font-family: var(--font-ui);
            transition: all .12s;
        }
        .script-stage-chip.active { background: rgba(94,106,210,.14); border-color: rgba(94,106,210,.4); color: #5e6ad2; }
        .script-stage-chip:hover:not(.active) { border-color: var(--muted); color: var(--text); }

        /* ── Chat status dropdown ─────────────────────────────── */
        .chat-status-drop { position: relative; flex-shrink: 0; }
        .chat-status-btn {
            background: transparent; border: 1px solid var(--line);
            color: var(--text); font-size: 12px; padding: 3px 8px;
            border-radius: 6px; cursor: pointer; font-family: var(--font-ui);
            display: flex; align-items: center; gap: 4px;
        }
        .chat-status-menu {
            position: absolute; top: calc(100% + 4px); right: 0;
            background: #1a1b1e; border: 1px solid var(--line);
            border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,.7);
            min-width: 148px; z-index: 200; display: none;
        }
        .chat-status-menu.open { display: block; }
        .chat-status-opt {
            display: block; width: 100%; background: transparent;
            border: none; color: var(--text); font-size: 13px;
            padding: 8px 12px; text-align: left; cursor: pointer;
            font-family: var(--font-ui);
        }
        .chat-status-opt:hover { background: rgba(255,255,255,.05); }

        /* ── AI card ──────────────────────────────────────────── */
        .script-card-ai { border-color: rgba(94,106,210,.35); background: rgba(94,106,210,.05); }
        .script-card-ai-label {
            font-size: 10px; font-weight: 700; color: #5e6ad2;
            text-transform: uppercase; letter-spacing: .5px; margin-bottom: 4px;
        }
```

- [ ] **Step 2: Add toast element to HTML `<body>`**

Find the closing `</body>` tag. Insert before it:
```html
    <div id="toastEl" role="status" aria-live="polite" aria-atomic="true"></div>
```

- [ ] **Step 3: Verify in browser**

Open `Adervis LidGen.html`. Open DevTools → Console → no errors. Page looks normal (no visual changes yet).

- [ ] **Step 4: Commit**

```
git add "Adervis LidGen.html"
git commit -m "style: add tooltip, toast, copy icon, script chip CSS"
```

---

## Task 2: Toast JS function + showToast

**Files:**
- Modify: `Adervis LidGen.html` — `<script>` block

- [ ] **Step 1: Add showToast function**

Find `function safeParseJSON` and insert **before** it:

```js
        let _toastTimer = null;
        function showToast(msg) {
            const el = document.getElementById('toastEl');
            if (!el) return;
            el.textContent = msg;
            el.classList.add('visible');
            if (_toastTimer) clearTimeout(_toastTimer);
            _toastTimer = setTimeout(function() { el.classList.remove('visible'); }, 2000);
        }
```

- [ ] **Step 2: Verify in browser**

Open DevTools console, run `showToast('Тест ✓')`. A dark toast should appear at the bottom center for 2 seconds.

- [ ] **Step 3: Commit**

```
git add "Adervis LidGen.html"
git commit -m "feat: showToast notification function"
```

---

## Task 3: Script panel — copy icon on cards + stage chips

**Files:**
- Modify: `Adervis LidGen.html` — `renderScriptPanel()` function (~line 1241) + add `copyAndRecord()` function

- [ ] **Step 1: Add module-level variable for selected chip stage**

Find `let currentChatLeadId = null;` and add after it:
```js
        let _scriptChipStage = null; // null = use lead.status
```

- [ ] **Step 2: Add copyAndRecord function**

Find `function showToast` and insert **after** it:

```js
        function copyAndRecord(text, leadId) {
            navigator.clipboard.writeText(text).then(function() {
                addMessageToLead(leadId, text, false);
                showToast('✓ Скопировано и записано');
            }).catch(function() {
                showToast('Не удалось скопировать — скопируй вручную');
            });
        }
```

- [ ] **Step 3: Replace renderScriptPanel function**

Find the entire `function renderScriptPanel(lead)` and replace it with:

```js
        function renderScriptPanel(lead) {
            const container = document.getElementById('scriptPanel');
            if (!container) return;
            if (lead.status === 3 || lead.status === 4) {
                container.innerHTML = '<div style="padding:16px;color:var(--muted);font-size:13px;">Диалог завершён</div>';
                return;
            }

            // Stage chips
            const activeStage = (_scriptChipStage !== null) ? _scriptChipStage : lead.status;
            const chipLabels = ['Новый', 'Ледокол', 'В диалоге'];
            let chipsHtml = '<div class="script-stage-chips">';
            chipLabels.forEach(function(label, i) {
                if (!scripts[i] || !scripts[i].options || scripts[i].options.length === 0) return;
                const safeLeadId = escapeHtml(String(lead.id));
                chipsHtml += '<button class="script-stage-chip' + (i === activeStage ? ' active' : '') + '"' +
                    ' onclick="setScriptChip(' + i + ',\'' + safeLeadId + '\')">' + escapeHtml(label) + '</button>';
            });
            chipsHtml += '</div>';

            // Cards for active stage
            const stageData = scripts[activeStage] || { options: [] };
            const platformLink = (lead.link || '').toLowerCase();
            const platform = platformLink.includes('vk.com') ? 'vk' : platformLink.includes('instagr') ? 'inst' : platformLink.includes('t.me') ? 'tg' : null;
            const kw = platform === 'vk' ? '[вк]' : platform === 'inst' ? '[inst]' : platform === 'tg' ? '[tg]' : null;
            let cards = (stageData.options || []).slice();
            if (kw) {
                const matched = cards.filter(function(o) { return o.text.toLowerCase().includes(kw); });
                if (matched.length > 0) cards = matched;
            }
            cards = cards.slice(0, 4);

            const safeId = escapeHtml(String(lead.id));
            const copyIconSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

            let cardsHtml = '';
            cards.forEach(function(opt) {
                const displayText = opt.text.replace(/^\[.*?\]\s*/, '');
                const jsonText = JSON.stringify(displayText);
                cardsHtml += '<div class="script-card">' +
                    '<div class="script-card-text">' + escapeHtml(displayText) + '</div>' +
                    '<button class="script-card-copy" data-tooltip="Скопировать и записать в историю"' +
                    ' aria-label="Скопировать шаблон и записать в историю"' +
                    ' onclick="copyAndRecord(' + jsonText + ',\'' + safeId + '\')">' +
                    copyIconSvg + '</button>' +
                    '</div>';
            });

            if (cards.length === 0) {
                cardsHtml = '<div style="padding:12px;color:var(--muted);font-size:12px;">Нет шаблонов для этого этапа</div>';
            }

            // AI button
            const aiBtnHtml = '<button class="btn btn-outline" style="margin:8px 12px;font-size:12px;" onclick="generateAiReply(currentChatLeadId)" id="aiReplyBtn" aria-label="Сгенерировать AI-ответ">✨ AI-ответ</button>';

            // AI temp card (if exists for this lead)
            let aiCardHtml = '';
            if (window._aiCard && window._aiCard.leadId === lead.id) {
                const aiTexts = window._aiCard.variants;
                aiTexts.forEach(function(v) {
                    const jsonV = JSON.stringify(v.text);
                    aiCardHtml += '<div class="script-card script-card-ai">' +
                        '<div class="script-card-ai-label">✨ ' + escapeHtml(v.label) + '</div>' +
                        '<div class="script-card-text">' + escapeHtml(v.text) + '</div>' +
                        '<button class="script-card-copy" data-tooltip="Скопировать и записать в историю"' +
                        ' aria-label="Скопировать AI-ответ и записать в историю"' +
                        ' onclick="copyAndRecord(' + jsonV + ',\'' + safeId + '\')">' +
                        copyIconSvg + '</button>' +
                        '</div>';
                });
            }

            container.innerHTML = chipsHtml + cardsHtml + aiBtnHtml + aiCardHtml;
        }

        function setScriptChip(stageIdx, leadId) {
            _scriptChipStage = stageIdx;
            const lead = leads.find(function(l) { return String(l.id) === String(leadId); });
            if (lead) renderScriptPanel(lead);
        }
```

- [ ] **Step 4: Update showAiVariants to populate _aiCard instead of DOM buttons**

Find function `showAiVariants` and replace it entirely with:

```js
        function showAiVariants(text, leadId) {
            const sections = [
                { tag: '[МЯГКИЙ]', label: 'Мягкий' },
                { tag: '[ДЕЛОВОЙ]', label: 'Деловой' },
                { tag: '[ВОПРОСОМ]', label: 'Вопросом' }
            ];
            const variants = [];
            sections.forEach(function(s, i) {
                const nextTag = i < sections.length - 1 ? sections[i + 1].tag : null;
                const start = text.indexOf(s.tag);
                if (start === -1) return;
                const contentStart = start + s.tag.length;
                const end = nextTag ? text.indexOf(nextTag, contentStart) : text.length;
                const content = text.slice(contentStart, end !== -1 ? end : undefined).trim();
                if (content) variants.push({ label: s.label, text: content });
            });
            if (variants.length === 0) variants.push({ label: 'AI', text: text.trim() });
            window._aiCard = { leadId: leadId, variants: variants };
            const lead = leads.find(function(l) { return String(l.id) === String(leadId); });
            if (lead) renderScriptPanel(lead);
            const btn = document.getElementById('aiReplyBtn');
            if (btn) btn.textContent = '✨ AI-ответ';
        }
```

- [ ] **Step 5: Reset _aiCard and _scriptChipStage when opening a new lead**

Find `function openChatView(leadId)`. Inside it, after `currentChatLeadId = lead.id;`, add:
```js
            window._aiCard = null;
            _scriptChipStage = null;
```

- [ ] **Step 6: Verify in browser**

1. Open any lead chat → right panel shows stage chips + cards with copy icon in bottom-right
2. Hover copy icon → tooltip «Скопировать и записать в историю» appears
3. Click copy icon → toast «✓ Скопировано и записано» appears for 2 sec
4. Check chat feed → a manager message bubble was added
5. Click stage chip «Ледокол» when on «Новый» lead → cards switch to Ледокол scripts
6. Click «✨ AI-ответ» → after response, AI cards appear with label «✨ Мягкий» etc.
7. Open a different lead → AI cards disappear (reset)

- [ ] **Step 7: Commit**

```
git add "Adervis LidGen.html"
git commit -m "feat: copy icon on script cards, stage chips, AI cards"
```

---

## Task 4: Remove draft area and stage advance button from HTML

**Files:**
- Modify: `Adervis LidGen.html` — HTML section of chat view

- [ ] **Step 1: Remove replyTextarea, chat-send-bar, ai-variants from HTML**

Search for `id="replyTextarea"` in the file. Find the surrounding block — it contains the label, textarea, `.chat-send-bar` div, and `#ai-variants` div. Remove all of it.

The block to remove looks like:
```html
                <label for="replyTextarea" ...>Черновик</label>
                <textarea id="replyTextarea" ...></textarea>
                <div class="chat-send-bar">
                    ...copyReplyBtn...
                    ...sentBtn...
                </div>
```
And separately:
```html
                <div id="ai-variants" ...>...</div>
```

Delete all of the above.

- [ ] **Step 2: Remove stage-nav-strip from HTML**

Search for `stage-nav-strip` in the HTML. Find and delete the element:
```html
<div id="stage-nav-strip" ...>...</div>
```

- [ ] **Step 3: Verify in browser**

Open chat → right panel has only: chips + cards + AI button. No textarea or bottom buttons.

- [ ] **Step 4: Commit**

```
git add "Adervis LidGen.html"
git commit -m "refactor: remove draft textarea and stage-nav-strip from HTML"
```

---

## Task 5: Remove dead JS functions

**Files:**
- Modify: `Adervis LidGen.html` — `<script>` block

- [ ] **Step 1: Delete renderStageNav function**

Find `function renderStageNav(lead)` (around line 1302). Delete the entire function body.

- [ ] **Step 2: Delete renderStageNav call sites**

Search for `renderStageNav(` in the file. Delete every line that calls it (there should be 1–2 calls in `openChatView` or `renderChatView`).

- [ ] **Step 3: Delete copyReply and submitManagerMsg**

Find and delete:
- `function copyReply()` — entire function
- `function submitManagerMsg(leadId)` — entire function

- [ ] **Step 4: Delete selectScriptCard if still unused**

Search for `selectScriptCard`. If the function exists but is no longer called anywhere, delete it. If it's still called, leave it.

- [ ] **Step 5: Verify in browser**

Open browser console. Open a lead chat → no JS errors. All tabs functional.

- [ ] **Step 6: Commit**

```
git add "Adervis LidGen.html"
git commit -m "refactor: remove renderStageNav, copyReply, submitManagerMsg dead code"
```

---

## Task 6: Status dropdown in chat header

**Files:**
- Modify: `Adervis LidGen.html` — `renderChatHeader()` function (~line 682) + add 2 new JS functions

- [ ] **Step 1: Add JS functions for chat status dropdown**

Find `function renderChatHeader(lead)` and insert **before** it:

```js
        function openChatStatusDrop(leadId) {
            const menu = document.getElementById('chatStatusMenu');
            if (!menu) return;
            const open = menu.classList.toggle('open');
            if (open) {
                document.addEventListener('click', closeChatStatusDrop, { once: true });
                document.addEventListener('keydown', function onEsc(e) {
                    if (e.key === 'Escape') { closeChatStatusDrop(); document.removeEventListener('keydown', onEsc); }
                });
            }
        }
        function closeChatStatusDrop() {
            const menu = document.getElementById('chatStatusMenu');
            if (menu) menu.classList.remove('open');
        }
        function setChatLeadStatus(leadId, statusIdx) {
            closeChatStatusDrop();
            setStatus(leadId, statusIdx);
            const lead = leads.find(function(l) { return String(l.id) === String(leadId); });
            if (lead) renderChatHeader(lead);
        }
```

- [ ] **Step 2: Update renderChatHeader to include status dropdown**

Find `function renderChatHeader(lead)` and replace it entirely with:

```js
        function renderChatHeader(lead) {
            const header = document.getElementById('chatHeader');
            if (!header) return;
            const currentBadge = statuses[lead.status];
            const safeId = escapeHtml(String(lead.id));

            const statusOpts = statuses.map(function(s, i) {
                return '<button class="chat-status-opt" onclick="setChatLeadStatus(\'' + safeId + '\',' + i + ')">' +
                    escapeHtml(s.label) + '</button>';
            }).join('');

            header.innerHTML =
                '<button class="btn btn-outline" onclick="closeChatView()" style="flex-shrink:0;padding:6px 12px;" aria-label="Вернуться к списку лидов">← Назад</button>' +
                '<div class="lead-title">' + escapeHtml(lead.name) + '</div>' +
                (lead.contact ? '<span style="font-size:12px;color:var(--muted);flex-shrink:0;">' + escapeHtml(lead.contact) + '</span>' : '') +
                '<div style="flex-shrink:0;">' + getPlatformBadge(lead.link, lead.name) + '</div>' +
                (lead.bizType ? '<span style="background:rgba(255,255,255,.05);border:1px solid var(--line);color:var(--muted);border-radius:4px;padding:2px 7px;font-size:11px;flex-shrink:0;">' + escapeHtml(lead.bizType) + '</span>' : '') +
                '<div class="chat-status-drop" style="flex-shrink:0;">' +
                    '<button class="chat-status-btn badge ' + currentBadge.class + '" onclick="openChatStatusDrop(\'' + safeId + '\')" aria-haspopup="true" aria-label="Изменить статус: ' + escapeHtml(currentBadge.label) + '">' +
                        escapeHtml(currentBadge.label) + ' ▾' +
                    '</button>' +
                    '<div class="chat-status-menu" id="chatStatusMenu" role="menu">' + statusOpts + '</div>' +
                '</div>';
        }
```

- [ ] **Step 3: Verify in browser**

1. Open any lead chat → header shows lead name + platform badge + status button with «▾»
2. Click status button → dropdown opens with all 5 statuses
3. Click a different status → dropdown closes, badge in header updates, table row updates
4. Press Escape when dropdown is open → closes
5. Click outside dropdown → closes

- [ ] **Step 4: Commit**

```
git add "Adervis LidGen.html"
git commit -m "feat: status dropdown in chat header replaces stage advance button"
```

---

## Task 7: Add data-tooltip attributes to all target elements

**Files:**
- Modify: `Adervis LidGen.html` — HTML header + JS `renderTable()`

- [ ] **Step 1: Add data-tooltip to static header buttons**

Find the `<div class="header-buttons">` block. Update the three buttons:

```html
            <div class="hdr-dropdown">
                <button class="btn btn-outline" onclick="toggleHeaderDropdown(event)" aria-haspopup="true" aria-expanded="false" id="dataDropBtn" title="Данные" data-tooltip="Экспорт и бэкап">
```

```html
            <button class="btn btn-outline" onclick="openSettingsModal()" title="Настройки шаблонов" aria-label="Настройки шаблонов" data-tooltip="Редактор скриптов">⚙️</button>
```

```html
            <button class="btn btn-outline" onclick="openInfoModal()" title="Справка" aria-label="Справка" data-tooltip="Справка">ℹ️</button>
```

- [ ] **Step 2: Add data-tooltip to dynamic table elements in renderTable()**

In `renderTable()`, find where `attemptHtml` is built (search for `attemptHtml`). Update it to include tooltip:

Find:
```js
                let attemptHtml = '';
                if (lead.attempts && lead.attempts > 0) {
```

Inside the attemptHtml building, find where it creates the badge span and add `data-tooltip`:

Find the span that contains the attempt count and add `data-tooltip="Количество попыток связаться"`.

Then find the quick-reject button in the action column:
```js
`<button class="btn btn-danger" aria-label="Отказ / Игнор: ${safeName}" title="Отметить как Отказ / Игнор" onclick="quickReject('${safeId}')" style="padding:7px 10px;margin-right:4px;font-size:12px;">✕</button>`
```
Add `data-tooltip="Отказ / Игнор"` to it.

Find the delete button:
```js
`<button class="btn btn-outline" style="color:var(--danger); border-color:#fca5a5; padding: 8px 10px;" aria-label="Удалить лид ${safeName}" onclick="deleteLead('${safeId}')"><span aria-hidden="true">×</span></button>`
```
Add `data-tooltip="Удалить лид"` to it.

- [ ] **Step 3: Verify in browser**

1. Hover over ⚙️ → tooltip «Редактор скриптов» appears
2. Hover over ℹ️ → tooltip «Справка»
3. Hover over «📁 Данные ▾» → tooltip «Экспорт и бэкап»
4. Hover over ✕ in table row → tooltip «Отказ / Игнор»
5. Hover over × delete button → tooltip «Удалить лид»

- [ ] **Step 4: Commit**

```
git add "Adervis LidGen.html"
git commit -m "feat: data-tooltip on header buttons and table action buttons"
```

---

## Task 8: Bulk import — segment selector

**Files:**
- Modify: `Adervis LidGen.html` — bulk modal HTML + `previewBulkAdd()` + `confirmBulkImport()`

- [ ] **Step 1: Add segment select to bulk modal HTML**

Find `<div id="bulkPhase1">` block. The block currently starts with a `<p>` description and then a `<textarea id="bulkData">`. Insert a segment selector **between** the `<p>` and `<textarea>`:

```html
            <div id="bulkPhase1">
                <p style="font-size:13px;color:var(--muted);margin-top:0;">Одна строка — один лид. Поддерживаются VK, Instagram, Telegram.<br>Формат: <code>Название — ссылка</code> или просто ссылка.</p>
                <div style="margin-bottom:12px;">
                    <label for="bulkBizType" style="font-size:12px;color:var(--muted);display:block;margin-bottom:6px;">Сегмент бизнеса (для всех лидов):</label>
                    <select id="bulkBizType" style="width:100%;background:var(--surface);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:8px 10px;font-size:13px;">
                        <option value="">Не указан</option>
                        <option>Общепит</option>
                        <option>Бар / Кальянная</option>
                        <option>Кофейня</option>
                        <option>Доставка еды</option>
                        <option>Барбершоп</option>
                        <option>Салон красоты</option>
                        <option>Фитнес / Спорт</option>
                        <option>Автосервис</option>
                        <option>Медицина</option>
                        <option>Образование</option>
                        <option>Сервис</option>
                        <option>Другое</option>
                    </select>
                </div>
```

Make sure to close the `</div>` properly — keep everything after the existing `<textarea id="bulkData">` unchanged.

- [ ] **Step 2: Update confirmBulkImport to read segment**

Find `function confirmBulkImport()` (~line 920). Replace it with:

```js
        function confirmBulkImport() {
            if (!_bulkParsed) return;
            const bizType = (document.getElementById('bulkBizType') || {}).value || '';
            _bulkParsed.filter(function(r) { return !r.isDup; }).forEach(function(r) {
                leads.push({
                    id: uid(), name: r.name, link: r.link, contact: '', status: 0,
                    updatedAt: Date.now(), notes: '', messages: [], bizType: bizType
                });
            });
            _bulkParsed = null;
            document.getElementById('bulkData').value = '';
            const bulkBiz = document.getElementById('bulkBizType');
            if (bulkBiz) bulkBiz.value = '';
            currentSort = { col: 'updatedAt', desc: true };
            saveDB();
            closeModal('bulkModal');
            backToBulkPhase1();
        }
```

- [ ] **Step 3: Show segment in preview list**

Find `function previewBulkAdd()` (~line 884). Inside it, find where the preview HTML is built — it creates a list of leads to import. Find the line that builds each preview row (search for `bulkPreviewList` or `isDup`).

Find the part that renders each row. It likely builds `<div>` items showing name + platform + link. Add the segment to the display:

Find inside `previewBulkAdd` where it builds the preview rows. Look for something like:
```js
listHtml += '<div ...>' + escapeHtml(r.name) + ...
```

Add the segment display after the name in non-duplicate rows. Change the row HTML to include:
```js
const bizSel = (document.getElementById('bulkBizType') || {}).value || '';
```
And in the row HTML, after the name, add:
```js
+ (bizSel ? ' <span style="color:var(--muted);font-size:11px;">· ' + escapeHtml(bizSel) + '</span>' : '')
```

Read the exact current code first to insert in the right place.

- [ ] **Step 4: Reset segment select when modal closes**

Find `function backToBulkPhase1()`. After it resets the phase display, add:
```js
            const bulkBiz = document.getElementById('bulkBizType');
            if (bulkBiz) bulkBiz.value = '';
```

- [ ] **Step 5: Verify in browser**

1. Click «+ Загрузить лиды» → modal shows segment dropdown at top
2. Select «Общепит»
3. Paste 2–3 VK links
4. Click «Просмотреть» → preview shows «· Общепит» next to each lead name
5. Click «Импортировать» → new leads appear in table with segment «Общепит»
6. Click «+ Загрузить лиды» again → segment resets to «Не указан»
7. Import without selecting segment → leads have empty bizType (no change from current behavior)

- [ ] **Step 6: Commit**

```
git add "Adervis LidGen.html"
git commit -m "feat: segment selector in bulk import modal"
```

---

## Final verification checklist

After all 8 tasks:

- [ ] Hover ⚙️ → tooltip visible
- [ ] Hover ✕ table button → tooltip visible
- [ ] Open chat → right panel has stage chips + cards with SVG copy icon
- [ ] Click copy icon → toast appears + message added to chat feed
- [ ] Switch stage chip → cards change
- [ ] Click AI → variants appear as cards with copy icons
- [ ] Chat header shows status as clickable dropdown
- [ ] Change status via dropdown → badge updates in header and in table
- [ ] Stage advance button (Новый → Ледокол) is gone
- [ ] Draft textarea + Копировать/Отправлено buttons are gone
- [ ] Bulk modal has segment dropdown
- [ ] Imported leads get selected segment

- [ ] **Final commit if any cleanup**

```
git add "Adervis LidGen.html"
git commit -m "chore: final cleanup after UX improvements v2"
```
