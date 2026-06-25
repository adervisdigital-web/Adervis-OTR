# Navigation & UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the header menu (6 buttons → 4 elements with dropdown), simplify the script panel (per-card buttons → click-to-select + 2 bottom buttons), add two-tab chat input, and add days-counter + quick-reject button to the table.

**Architecture:** All changes are in a single file `Adervis LidGen.html`. HTML sections are modified in-place; new JS functions are inserted into the existing `<script>` block. No dependencies added.

**Tech Stack:** Vanilla JS, CSS Custom Properties, localStorage — no build step.

---

## Scope note — no test framework

This project has no automated test runner. Each task ends with a **manual verification** step in the browser instead of `npm test`. Open `Adervis LidGen.html` directly in a browser and follow the verification checklist.

---

## File map

Only one file changes: `Adervis LidGen.html`

Regions (by current line numbers — will shift as edits accumulate):

| Region | Lines | What changes |
|---|---|---|
| Header HTML | ~261–272 | Remove 6 buttons, add icon buttons + dropdown chip + CTA |
| Header CSS | ~60–63 | `.header-buttons` stays; add `.hdr-dropdown-*` styles |
| `renderTable()` — stale HTML | ~1013–1016 | Replace binary stale with colorized days counter |
| `renderTable()` — action column | ~1052–1056 | Add quick-reject ✕ button |
| `renderScriptPanel()` — stageNames | ~1141 | Extract to module scope |
| `renderScriptPanel()` — cards HTML | ~1158–1168 | Remove per-card buttons; card div becomes clickable |
| `renderScriptPanel()` — stage nav | ~1172–1179 | Change labels to "From → To" format |
| Chat input HTML | ~396–404 | Replace `<input>` with two-tab `<textarea>` |
| JS near `submitClientMessageFromChat` | ~1286–1292 | Add tab state var + update submit function + Ctrl+Enter |
| New dropdown JS | after existing functions | Add `toggleHeaderDropdown()` + close-on-outside |

---

## Task 1: Header — extract stageNames to module scope

`stageNames` is currently local inside `renderScriptPanel`. Tasks 3 and 5 need it globally.

**Files:**
- Modify: `Adervis LidGen.html` (~line 541 area, after `let currentSort`)

- [ ] **Step 1: Add module-level stageNames**

Find this line (around line 543):
```js
let selectedLeadIds = new Set();
```

Add directly after it:
```js
const stageNames = ['Новый', 'Ледокол', 'В диалоге', 'Успех'];
```

- [ ] **Step 2: Remove the local declaration inside renderScriptPanel**

Find inside `renderScriptPanel` (~line 1141):
```js
const stageNames  = ['Новый', 'Ледокол', 'В диалоге', 'Успех'];
const stageDescs  = [
```

Replace with (remove only the `stageNames` line, keep `stageDescs`):
```js
const stageDescs  = [
```

- [ ] **Step 3: Verify in browser**

Open `Adervis LidGen.html` → open any lead chat → stage name should still show correctly in the right panel.

- [ ] **Step 4: Commit**

```
git add "Adervis LidGen.html"
git commit -m "refactor: extract stageNames to module scope"
```

---

## Task 2: Header dropdown — replace 6 buttons with 4 elements

**Files:**
- Modify: `Adervis LidGen.html` — HTML header section + CSS + JS

- [ ] **Step 1: Add dropdown CSS**

Find in the `<style>` block, after the `.btn-danger:hover` rule (~line 99):
```css
.btn-danger:hover { background: rgba(242, 40, 34, .16); }
```

Insert after it:
```css
.hdr-dropdown { position: relative; display: inline-block; }
.hdr-dropdown-menu { position: absolute; top: calc(100% + 6px); right: 0; background: #1a1b1e; border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 8px 32px rgba(0,0,0,.72); min-width: 172px; z-index: 200; display: none; }
.hdr-dropdown-menu.open { display: block; }
.hdr-dropdown-item { display: flex; align-items: center; gap: 8px; padding: 9px 13px; font-size: 13px; color: var(--text); cursor: pointer; font-family: var(--font-ui); border: none; background: transparent; width: 100%; text-align: left; }
.hdr-dropdown-item:hover { background: rgba(255,255,255,.05); }
.hdr-dropdown-divider { height: 1px; background: var(--line); margin: 4px 0; }
```

- [ ] **Step 2: Replace header HTML**

Find the entire `<div class="header-buttons">` block (~lines 263–270):
```html
        <div class="header-buttons">
            <button class="btn btn-outline" onclick="openSettingsModal()">⚙️ Скрипты</button>
            <button class="btn btn-outline" onclick="openInfoModal()">ℹ️ Инфо</button>
            <button class="btn btn-outline" onclick="exportCSV()">📊 Экспорт CSV</button>
            <button class="btn btn-outline" onclick="exportBackup()">💾 Бэкап</button>
            <button class="btn btn-outline" onclick="triggerImportBackup()">📂 Импорт</button>
            <button class="btn btn-primary" onclick="openBulkModal()">📥 Загрузить базу</button>
            <input type="file" id="backupFileInput" accept="application/json" style="display:none" onchange="importBackupFile(this.files[0])">
        </div>
```

Replace with:
```html
        <div class="header-buttons">
            <div class="hdr-dropdown">
                <button class="btn btn-outline" onclick="toggleHeaderDropdown(event)" aria-haspopup="true" aria-expanded="false" id="dataDropBtn" title="Данные">
                    📁 Данные ▾
                </button>
                <div class="hdr-dropdown-menu" id="dataDropMenu" role="menu">
                    <button class="hdr-dropdown-item" role="menuitem" onclick="exportCSV(); closeHeaderDropdown()">📊 Экспорт CSV</button>
                    <div class="hdr-dropdown-divider"></div>
                    <button class="hdr-dropdown-item" role="menuitem" onclick="exportBackup(); closeHeaderDropdown()">💾 Сохранить бэкап</button>
                    <button class="hdr-dropdown-item" role="menuitem" onclick="triggerImportBackup(); closeHeaderDropdown()">📂 Восстановить из файла</button>
                </div>
            </div>
            <button class="btn btn-outline" onclick="openSettingsModal()" title="Настройки шаблонов" aria-label="Настройки шаблонов">⚙️</button>
            <button class="btn btn-outline" onclick="openInfoModal()" title="Справка" aria-label="Справка">ℹ️</button>
            <button class="btn btn-primary" onclick="openBulkModal()">+ Загрузить лиды</button>
            <input type="file" id="backupFileInput" accept="application/json" style="display:none" onchange="importBackupFile(this.files[0])">
        </div>
```

- [ ] **Step 3: Add dropdown JS functions**

Find `function safeParseJSON` (~line 516) and insert these two functions **before** it:
```js
        function toggleHeaderDropdown(e) {
            e.stopPropagation();
            const menu = document.getElementById('dataDropMenu');
            const btn  = document.getElementById('dataDropBtn');
            const opening = !menu.classList.contains('open');
            menu.classList.toggle('open', opening);
            btn.setAttribute('aria-expanded', String(opening));
            if (opening) {
                document.addEventListener('click', closeHeaderDropdown, { once: true });
            }
        }
        function closeHeaderDropdown() {
            const menu = document.getElementById('dataDropMenu');
            const btn  = document.getElementById('dataDropBtn');
            if (menu) menu.classList.remove('open');
            if (btn)  btn.setAttribute('aria-expanded', 'false');
        }
```

- [ ] **Step 4: Verify in browser**

1. Page loads — header shows: `📁 Данные ▾` | `⚙️` | `ℹ️` | `+ Загрузить лиды`
2. Click `📁 Данные ▾` → dropdown opens with 3 items
3. Click outside dropdown → closes
4. Click `⚙️` → Settings modal opens
5. Click `ℹ️` → Info modal opens
6. Click `+ Загрузить лиды` → Bulk import modal opens
7. Click `Экспорт CSV` inside dropdown → CSV downloads, dropdown closes

- [ ] **Step 5: Commit**

```
git add "Adervis LidGen.html"
git commit -m "feat: compact header with dropdown and icon buttons"
```

---

## Task 3: Script panel — click-to-select cards

Remove per-card «Скопировать» / «Отправлено ✓» buttons. Card click fills the draft area. Bottom buttons remain (already work correctly: `copyDraftText()` and `saveDraftAsSent()`).

Also: remove auto-clipboard-copy from `selectScriptCard` (card click should only fill the textarea; copying is triggered by the bottom «Копировать» button).

**Files:**
- Modify: `Adervis LidGen.html` — `selectScriptCard()` function + `renderScriptPanel()` cards HTML

- [ ] **Step 1: Remove auto-copy from selectScriptCard**

Find inside `selectScriptCard` (~line 1246):
```js
            navigator.clipboard.writeText(text).catch(function() {});
```

Delete that line entirely. The function should now end after setting `window._chatDraft[String(leadId)] = text;`.

- [ ] **Step 2: Replace per-card HTML in renderScriptPanel**

Find the `cardsHtml` forEach block (~lines 1158–1168):
```js
            cards.forEach(function(opt) {
                const realIdx = stageData.options.indexOf(opt);
                const safeId = escapeHtml(String(lead.id));
                const displayText = opt.text.replace(/^\[.*?\]\s*/, '');
                cardsHtml += '<div class="script-card">' +
                    '<div class="script-card-text">' + escapeHtml(displayText) + '</div>' +
                    '<div class="script-card-btns">' +
                    '<button class="btn btn-primary" style="font-size:11px;padding:4px 9px;flex:1;" onclick="selectScriptCard(' + lead.status + ',' + realIdx + ',\'' + safeId + '\')">Скопировать</button>' +
                    '<button class="btn btn-outline" style="font-size:11px;padding:4px 9px;" onclick="saveScriptCardAsSent(' + lead.status + ',' + realIdx + ',\'' + safeId + '\')">Отправлено ✓</button>' +
                    '</div></div>';
            });
```

Replace with (cards get `data-card-idx` for highlight tracking; 4th arg passes display index to `selectScriptCard`):
```js
            cards.forEach(function(opt, i) {
                const realIdx = stageData.options.indexOf(opt);
                const safeId = escapeHtml(String(lead.id));
                const displayText = opt.text.replace(/^\[.*?\]\s*/, '');
                cardsHtml += '<div class="script-card" role="button" tabindex="0" data-card-idx="' + i + '"' +
                    ' onclick="selectScriptCard(' + lead.status + ',' + realIdx + ',\'' + safeId + '\',' + i + ')"' +
                    ' onkeydown="if(event.key===\'Enter\'||event.key===\' \'){selectScriptCard(' + lead.status + ',' + realIdx + ',\'' + safeId + '\',' + i + ');event.preventDefault();}">' +
                    '<div class="script-card-text">' + escapeHtml(displayText) + '</div>' +
                    '</div>';
            });
```

- [ ] **Step 3: Update selectScriptCard signature and add card highlight**

Find the function declaration (~line 1228):
```js
        function selectScriptCard(stageIdx, optIdx, leadId) {
```
Replace with:
```js
        function selectScriptCard(stageIdx, optIdx, leadId, cardDisplayIdx) {
```

Find the end of `selectScriptCard` after the `window._chatDraft` assignment (~line 1244):
```js
            if (!window._chatDraft) window._chatDraft = {};
            window._chatDraft[String(leadId)] = text;
        }
```

Replace with:
```js
            if (!window._chatDraft) window._chatDraft = {};
            window._chatDraft[String(leadId)] = text;
            document.querySelectorAll('#scriptPanel .script-card').forEach(function(el) {
                el.classList.toggle('selected', Number(el.dataset.cardIdx) === cardDisplayIdx);
            });
        }
```

- [ ] **Step 4: Rename bottom button labels for clarity**

Find in `renderScriptPanel` the draft bottom buttons (~line 1201–1204):
```js
                    '<div style="display:flex;gap:5px;">' +
                        '<button class="btn btn-primary" style="flex:1;font-size:12px;" onclick="saveDraftAsSent(\'' + escapeHtml(String(lead.id)) + '\')">Отправлено ✓</button>' +
                        '<button class="btn btn-outline" style="font-size:12px;" onclick="copyDraftText()">Копировать</button>' +
                    '</div>' +
```

Replace with:
```js
                    '<div style="display:flex;gap:5px;">' +
                        '<button class="btn btn-outline" style="font-size:12px;" onclick="copyDraftText()">📋 Копировать</button>' +
                        '<button class="btn btn-success" style="flex:1;font-size:12px;" onclick="saveDraftAsSent(\'' + escapeHtml(String(lead.id)) + '\')">✓ Отправлено</button>' +
                    '</div>' +
```

- [ ] **Step 5: Update label in draft section**

Find (~line 1198):
```js
                '<label for="chatDraftArea" class="sr-only">Черновик ответа</label>' +
                '<textarea id="chatDraftArea" placeholder="Выбери шаблон или напиши ответ..."
```

Replace placeholder text:
```js
                '<label for="chatDraftArea" style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:5px;">Черновик</label>' +
                '<textarea id="chatDraftArea" placeholder="Нажми на шаблон выше или напиши свой текст..."
```

- [ ] **Step 6: Verify in browser**

1. Open a lead chat
2. Right panel shows template cards **without buttons** — just card title text
3. Click a card → it gets a purple border (`.selected` class), text fills the draft textarea
4. Click another card → previous deselects, new one selects
5. Click `📋 Копировать` → draft text copied to clipboard (test by pasting in notepad)
6. Type a message in draft, click `✓ Отправлено` → message appears in left chat feed as manager bubble (right-aligned, purple background)
7. Draft textarea clears after sending

- [ ] **Step 7: Commit**

```
git add "Adervis LidGen.html"
git commit -m "feat: script cards click-to-select, remove per-card buttons"
```

---

## Task 4: Stage advance button — "From → To" labels

**Files:**
- Modify: `Adervis LidGen.html` — `renderScriptPanel()` stage nav section

- [ ] **Step 1: Replace stage nav HTML**

Find the `stageNavHtml` block (~lines 1171–1180). Note: `stageNames` is now module-level (added in Task 1). `safeId` used in the cards forEach is not in scope here, so declare a new const:
```js
            let stageNavHtml = '';
            if (lead.status === 0) {
                stageNavHtml = '<button class="btn btn-primary" style="font-size:12px;flex:1;" onclick="setStatus(\'' + escapeHtml(String(lead.id)) + '\', 1)">Ледокол отправлен →</button>';
            } else if (lead.status === 1) {
                stageNavHtml = '<button class="btn btn-primary" style="font-size:12px;flex:1;" onclick="setStatus(\'' + escapeHtml(String(lead.id)) + '\', 2)">В диалоге →</button>' +
                    '<button class="btn btn-danger" style="font-size:12px;" onclick="setStatus(\'' + escapeHtml(String(lead.id)) + '\', 4)">Отказ</button>';
            } else if (lead.status === 2) {
                stageNavHtml = '<button class="btn btn-success" style="font-size:12px;flex:1;" onclick="setStatus(\'' + escapeHtml(String(lead.id)) + '\', 3)">✅ Закрыть сделку</button>' +
                    '<button class="btn btn-danger" style="font-size:12px;" onclick="setStatus(\'' + escapeHtml(String(lead.id)) + '\', 4)">🔴</button>';
            }
```

Replace with:
```js
            // stageNames is module-level: ['Новый','Ледокол','В диалоге','Успех']
            const safeLeadId2 = escapeHtml(String(lead.id));
            let stageNavHtml = '';
            if (lead.status === 0) {
                stageNavHtml = '<button class="btn btn-primary" style="font-size:12px;flex:1;" onclick="setStatus(\'' + safeLeadId2 + '\', 1)">' +
                    stageNames[0] + ' → ' + stageNames[1] + '</button>';
            } else if (lead.status === 1) {
                stageNavHtml = '<button class="btn btn-primary" style="font-size:12px;flex:1;" onclick="setStatus(\'' + safeLeadId2 + '\', 2)">' +
                    stageNames[1] + ' → ' + stageNames[2] + '</button>' +
                    '<button class="btn btn-danger" style="font-size:12px;" onclick="setStatus(\'' + safeLeadId2 + '\', 4)" title="Отказ / Игнор">✕</button>';
            } else if (lead.status === 2) {
                stageNavHtml = '<button class="btn btn-success" style="font-size:12px;flex:1;" onclick="setStatus(\'' + safeLeadId2 + '\', 3)">' +
                    stageNames[2] + ' → ' + stageNames[3] + ' ✅</button>' +
                    '<button class="btn btn-danger" style="font-size:12px;" onclick="setStatus(\'' + safeLeadId2 + '\', 4)" title="Отказ / Игнор">✕</button>';
            }
```

- [ ] **Step 2: Verify in browser**

1. Open lead at status 0 (Новый) → button shows `Новый → Ледокол`
2. Click it → status changes to 1, button now shows `Ледокол → В диалоге` + `✕`
3. Click `✕` → status becomes 4 (Отказ)
4. Open lead at status 2 → button shows `В диалоге → Успех ✅` + `✕`

- [ ] **Step 3: Commit**

```
git add "Adervis LidGen.html"
git commit -m "feat: stage advance button shows From → To labels"
```

---

## Task 5: Chat input — two-tab textarea

Replace single-line `<input id="chatInputMain">` with a tabbed `<textarea>` that handles both client and manager messages.

**Files:**
- Modify: `Adervis LidGen.html` — HTML chat input area + JS

- [ ] **Step 1: Add CSS for input tabs**

Find in the `<style>` block, after the `.chat-client-hint` rule (~line 200):
```css
        .chat-client-hint { padding: 2px 14px 6px; font-size: 10px; color: var(--muted); }
```

Insert after:
```css
        .chat-input-tabs { display: flex; gap: 4px; padding: 8px 14px 4px; flex-shrink: 0; }
        .chat-input-tab { padding: 4px 11px; border-radius: 6px; border: 1px solid var(--line); background: transparent; color: var(--muted); font-size: 11px; font-weight: 600; cursor: pointer; font-family: var(--font-ui); transition: all .12s; }
        .chat-input-tab.active { background: rgba(94,106,210,.14); border-color: rgba(94,106,210,.4); color: #5e6ad2; }
        .chat-input-tab:hover:not(.active) { border-color: var(--muted); color: var(--text); }
```

- [ ] **Step 2: Replace HTML client input row**

Find the client input row HTML (~lines 395–405):
```html
                    <div class="client-input-row">
                        <span id="chatInputHint" class="sr-only">Вставьте текст клиента и нажмите «Ответ клиента» для записи в историю.</span>
                        <label for="chatInputMain" class="sr-only">Вставить ответ клиента</label>
                        <input type="text" id="chatInputMain" placeholder="Вставить текст клиента..."
                            style="flex:1;"
                            aria-describedby="chatInputHint"
                            onkeydown="if(event.key==='Enter'&&!event.shiftKey){submitClientMessageFromChat(currentChatLeadId);event.preventDefault();}">
                        <button class="btn btn-outline" aria-label="Записать как сообщение клиента" onclick="submitClientMessageFromChat(currentChatLeadId)">← Ответ клиента</button>
                    </div>
                    <div class="chat-client-hint">Скопируй сообщение клиента из ВК / Inst / TG и запиши в историю</div>
```

Replace with:
```html
                    <div class="chat-input-tabs">
                        <button class="chat-input-tab active" id="tabClient" onclick="setChatInputTab('client')" aria-pressed="true">← Клиент ответил</button>
                        <button class="chat-input-tab" id="tabManager" onclick="setChatInputTab('manager')" aria-pressed="false">✍️ Я написал</button>
                    </div>
                    <div class="client-input-row">
                        <span id="chatInputHint" class="sr-only">Вставьте текст сообщения и нажмите Ctrl+Enter или кнопку «Записать».</span>
                        <label for="chatInputMain" class="sr-only">Текст сообщения</label>
                        <textarea id="chatInputMain" placeholder="Вставь текст сообщения клиента..."
                            style="flex:1;min-height:52px;resize:none;"
                            aria-describedby="chatInputHint"
                            onkeydown="if(event.ctrlKey&&event.key==='Enter'){submitChatInput(currentChatLeadId);event.preventDefault();}"></textarea>
                        <button class="btn btn-outline" aria-label="Записать в историю" onclick="submitChatInput(currentChatLeadId)" style="align-self:flex-end;">Записать</button>
                    </div>
                    <div class="chat-client-hint" id="chatInputHintVisible">Ctrl+Enter — записать · Клиент ответил: слева · Я написал: справа</div>
```

- [ ] **Step 3: Add tab state and new JS functions**

Find (~line 545):
```js
        let currentChatLeadId = null;
```

Add after that line:
```js
        let chatInputTab = 'client'; // 'client' | 'manager'
```

Find `function submitClientMessageFromChat(leadId)` (~line 1286):
```js
        function submitClientMessageFromChat(leadId) {
            const input = document.getElementById('chatInputMain');
            if (!input || !input.value.trim()) return;
            const txt = input.value;
            input.value = '';
            addMessageToLead(leadId, txt, true);
        }
```

Replace with:
```js
        function submitClientMessageFromChat(leadId) {
            submitChatInput(leadId);
        }

        function submitChatInput(leadId) {
            const input = document.getElementById('chatInputMain');
            if (!input || !input.value.trim()) return;
            const txt = input.value.trim();
            input.value = '';
            const fromClient = (chatInputTab === 'client');
            addMessageToLead(leadId, txt, fromClient);
        }

        function setChatInputTab(tab) {
            chatInputTab = tab;
            const tabClient  = document.getElementById('tabClient');
            const tabManager = document.getElementById('tabManager');
            const input      = document.getElementById('chatInputMain');
            const hint       = document.getElementById('chatInputHintVisible');
            if (tabClient)  { tabClient.classList.toggle('active', tab === 'client');  tabClient.setAttribute('aria-pressed', String(tab === 'client')); }
            if (tabManager) { tabManager.classList.toggle('active', tab === 'manager'); tabManager.setAttribute('aria-pressed', String(tab === 'manager')); }
            if (input) {
                input.placeholder = tab === 'client'
                    ? 'Вставь текст сообщения клиента...'
                    : 'Напиши что ты отправил клиенту...';
                input.focus();
            }
        }
```

- [ ] **Step 4: Verify in browser**

1. Open chat → bottom-left shows two tabs: `← Клиент ответил` (active, blue) | `✍️ Я написал`
2. Tab `← Клиент ответил` is default → paste text → Ctrl+Enter → message appears **left-aligned** (client bubble)
3. Click `✍️ Я написал` → placeholder changes → type text → Ctrl+Enter → message appears **right-aligned** (manager bubble, purple)
4. Click `Записать` button also works as alternative to Ctrl+Enter
5. After recording, textarea clears

- [ ] **Step 5: Commit**

```
git add "Adervis LidGen.html"
git commit -m "feat: two-tab chat input for client and manager messages"
```

---

## Task 6: Table — colorized days counter

Replace binary `⏳ 2+ дн.` with a precise color-coded counter for all active leads (status 0–2).

**Files:**
- Modify: `Adervis LidGen.html` — `renderTable()` stale HTML block

- [ ] **Step 1: Replace staleHtml logic in renderTable**

Find (~lines 1013–1016):
```js
                const daysPassed = Math.floor((now - (lead.updatedAt || now)) / (1000 * 60 * 60 * 24));
                let staleHtml = '';
                if((lead.status === 1 || lead.status === 2) && daysPassed >= 2) {
                    staleHtml = `<span class="stale-timer"><span aria-hidden="true">⏳ </span>${daysPassed} дн.</span>`;
                }
```

Replace with:
```js
                const daysPassed = Math.floor((now - (lead.updatedAt || now)) / (1000 * 60 * 60 * 24));
                let staleHtml = '';
                if (lead.status >= 0 && lead.status <= 2 && daysPassed >= 1) {
                    const daysColor = daysPassed >= 3 ? 'var(--danger)' : daysPassed === 2 ? 'var(--warning)' : 'var(--muted)';
                    const daysBold  = daysPassed >= 3 ? 'font-weight:700;' : '';
                    staleHtml = `<span class="stale-timer" style="color:${daysColor};${daysBold}" aria-label="${daysPassed} дней без контакта"><span aria-hidden="true">⏳ </span>${daysPassed} дн.</span>`;
                }
```

Also update `rowStaleClass` computation (~line 1039) — it's still useful for the left-border highlight:
```js
                const rowStaleClass = (lead.status === 1 || lead.status === 2) && daysPassed >= 2 ? 'row-stale' : '';
```
This line stays unchanged (the left-border highlight for 2+ days remains).

- [ ] **Step 2: Verify in browser**

1. A lead updated today → no counter shown
2. A lead updated 1 day ago (status 0–2) → shows `⏳ 1 дн.` in muted gray
3. A lead updated 2 days ago → shows `⏳ 2 дн.` in yellow
4. A lead updated 3+ days ago → shows `⏳ 3 дн.` in red bold + left-border orange stripe
5. Leads with status 3 (Успех) or 4 (Отказ) → no counter regardless of date

- [ ] **Step 3: Commit**

```
git add "Adervis LidGen.html"
git commit -m "feat: colorized days-since-contact counter in leads table"
```

---

## Task 7: Table — quick Отказ button

Add a small `✕` button in the action column to mark a lead as Отказ (status 4) without opening the chat.

**Files:**
- Modify: `Adervis LidGen.html` — `renderTable()` action column + new `quickReject()` function

- [ ] **Step 1: Add quickReject function**

Find `function deleteLead` and insert **before** it:
```js
        function quickReject(leadId) {
            const lead = leads.find(function(l) { return String(l.id) === String(leadId); });
            if (!lead) return;
            lead.status = 4;
            lead.updatedAt = Date.now();
            saveDB();
        }
```

- [ ] **Step 2: Add ✕ button to table action column**

Find in `renderTable()` the action column (~lines 1052–1056):
```js
                        <td style="white-space:nowrap;">
                            ${attemptHtml}
                            <button class="btn btn-outline" aria-label="Открыть диалог с ${safeName}" onclick="openChatView('${safeId}')" style="margin-left:6px;margin-right:5px;"><span aria-hidden="true">✍️ </span>Диалог</button>
                            <button class="btn btn-outline" style="color:var(--danger); border-color:#fca5a5; padding: 8px 12px;" aria-label="Удалить лид ${safeName}" onclick="deleteLead('${safeId}')"><span aria-hidden="true">×</span></button>
                        </td>
```

Replace with:
```js
                        <td style="white-space:nowrap;">
                            ${attemptHtml}
                            <button class="btn btn-outline" aria-label="Открыть диалог с ${safeName}" onclick="openChatView('${safeId}')" style="margin-left:6px;margin-right:4px;"><span aria-hidden="true">✍️ </span>Диалог</button>
                            ${lead.status <= 2 ? `<button class="btn btn-danger" aria-label="Отказ / Игнор: ${safeName}" title="Отметить как Отказ / Игнор" onclick="quickReject('${safeId}')" style="padding:7px 10px;margin-right:4px;font-size:12px;">✕</button>` : ''}
                            <button class="btn btn-outline" style="color:var(--danger); border-color:#fca5a5; padding: 8px 10px;" aria-label="Удалить лид ${safeName}" onclick="deleteLead('${safeId}')"><span aria-hidden="true">×</span></button>
                        </td>
```

- [ ] **Step 3: Verify in browser**

1. Table shows `✕` button for leads with status 0, 1, 2
2. Leads with status 3 or 4 → no `✕` button
3. Click `✕` on a lead → status instantly changes to 🔴 Отказ in the table, `✕` disappears
4. Delete button `×` still works separately for hard-deleting

- [ ] **Step 4: Commit**

```
git add "Adervis LidGen.html"
git commit -m "feat: quick reject button in leads table"
```

---

## Final verification checklist

After all 7 tasks, do one end-to-end run:

- [ ] Add a new lead via the single-line form → appears in table
- [ ] Bulk import 2 leads via `+ Загрузить лиды` → deduplicated correctly
- [ ] `📁 Данные ▾` dropdown → export CSV works, backup saves JSON, import restores from file
- [ ] `⚙️` opens template editor; `ℹ️` opens help modal
- [ ] Open a lead chat → stage shows name + description + progress bar
- [ ] Click a script card → card highlights, draft fills; clicking another card switches selection
- [ ] Click `📋 Копировать` → text is in clipboard
- [ ] Click `✓ Отправлено` → manager bubble appears in left feed, draft clears
- [ ] Tab `← Клиент ответил` → paste client text + Ctrl+Enter → client bubble left-aligned
- [ ] Tab `✍️ Я написал` → type text + Ctrl+Enter → manager bubble right-aligned
- [ ] Stage advance button shows `Новый → Ледокол` / `Ледокол → В диалоге` / `В диалоге → Успех ✅`
- [ ] Click `✕` in stage panel → status becomes Отказ
- [ ] Lead updated 1 day ago → gray `⏳ 1 дн.` in table; 2 days → yellow; 3+ → red bold
- [ ] Quick `✕` in table row → instant Отказ; button disappears for that row
- [ ] Backup → restore → all leads + messages preserved

- [ ] **Final commit if any cleanup needed**

```
git add "Adervis LidGen.html"
git commit -m "chore: final cleanup after navigation redesign"
```
