# UX Convenience Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the chat-view to a two-column layout (history left, scripts right) with full script text, message edit/delete, and minor table improvements.

**Architecture:** All changes stay in the single file `Adervis LidGen.html`. New CSS classes are additive and don't break existing ones. `renderSuggestionPanel` is replaced by `renderScriptPanel`; all callers updated. Message edit/delete operates by index into `lead.messages[]`.

**Tech Stack:** Vanilla JS, CSS Custom Properties, localStorage. No build step.

---

## Files Modified

- `Adervis LidGen.html` — everything lives here.
  - `<style>` block: add new CSS classes (lines ~100–213)
  - `#chat-view` HTML (lines ~344–374): restructure to two-column grid
  - `renderChatView()` (line ~514): call `renderScriptPanel` + pass `lead.id` to `renderMessagesFeed`
  - `renderChatHeader()` (line ~525): remove status `<select>`, add static status badge
  - `renderSuggestionPanel()` (line ~1063): replace entirely with `renderScriptPanel()`
  - `renderSingleMessage()` (line ~1195): add edit/delete action buttons + accept `leadId, msgIdx` params
  - `renderMessagesFeed()` (line ~1169): accept `leadId` param, pass to `renderSingleMessage`
  - `appendMessageToFeed()` (line ~1206): accept `leadId`, re-derive message from `leads`
  - `addMessageToLead()` (line ~1226): update `appendMessageToFeed` call
  - `renderTable()` (line ~905): add last-msg preview cell, stale row class

---

## Task 1: Add CSS — Two-Column Layout + New Component Styles

**File:** `Adervis LidGen.html` — inside `<style>` block, after line `/* ONBOARDING */` comment (~line 192)

- [ ] **Step 1: Insert the new CSS block**

Find the comment `/* ONBOARDING */` (line ~192) and insert the following block immediately before it:

```css
        /* TWO-COLUMN CHAT LAYOUT */
        .chat-two-col { display: grid; grid-template-columns: 1fr 340px; flex: 1; min-height: 0; overflow: hidden; }
        @media (max-width: 768px) { .chat-two-col { grid-template-columns: 1fr; } }
        .chat-col-left { display: flex; flex-direction: column; border-right: 1px solid var(--line); min-height: 400px; overflow: hidden; }
        .chat-col-right { display: flex; flex-direction: column; background: #0d0e0f; overflow-y: auto; max-height: 75vh; }
        .chat-two-col #chatFeedMain { max-height: none; flex: 1; min-height: 0; }
        .chat-notes-strip { border-top: 1px solid var(--line); padding: 8px 14px; background: var(--bg2); display: flex; gap: 8px; align-items: center; flex-shrink: 0; flex-wrap: wrap; }
        .chat-client-hint { padding: 2px 14px 6px; font-size: 10px; color: var(--muted); }

        /* STAGE PROGRESS BAR */
        .stage-progress { display: flex; gap: 3px; margin: 5px 0; }
        .stage-progress-seg { flex: 1; height: 3px; border-radius: 2px; background: var(--line); }
        .stage-progress-seg.done { background: var(--success); }
        .stage-progress-seg.current { background: var(--primary); }

        /* PLATFORM TABS */
        .platform-tabs { display: flex; gap: 4px; padding: 10px 14px 0; flex-shrink: 0; }
        .platform-tab { padding: 4px 9px; border: 1px solid var(--line); border-radius: 5px; background: rgba(255,255,255,.04); color: var(--muted); font-size: 11px; font-weight: 600; cursor: pointer; transition: all .15s; font-family: var(--font-ui); }
        .platform-tab.active { border-color: rgba(94,106,210,.45); background: rgba(94,106,210,.12); color: #5e6ad2; }
        .platform-tab:hover:not(.active) { border-color: var(--muted); color: var(--text); }

        /* SCRIPT CARDS (full text, not truncated) */
        .script-card { background: var(--bg2); border: 1px solid var(--line); border-radius: 7px; padding: 10px 12px; transition: border-color .15s; }
        .script-card:hover { border-color: rgba(108,0,255,.4); }
        .script-card-text { color: var(--text); font-size: 12px; line-height: 1.55; white-space: pre-wrap; word-break: break-word; margin-bottom: 8px; }
        .script-card-btns { display: flex; gap: 5px; }
        .script-panel-inner { flex: 1; overflow-y: auto; padding: 10px 14px; display: flex; flex-direction: column; gap: 6px; }
        .script-panel-label { font-size: 10px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: .5px; margin-bottom: 2px; }

        /* MESSAGE EDIT / DELETE ACTIONS */
        .msg-actions { display: flex; gap: 3px; opacity: 0; transition: opacity .15s; align-self: center; flex-shrink: 0; }
        .msg-wrap:hover .msg-actions { opacity: 1; }
        @media (hover: none) { .msg-actions { opacity: 1; } }
        .msg-action-btn { background: rgba(255,255,255,.06); border: 1px solid var(--line); color: var(--muted); border-radius: 4px; padding: 2px 6px; font-size: 10px; cursor: pointer; transition: all .12s; font-family: var(--font-ui); line-height: 1.4; }
        .msg-action-btn:hover { border-color: rgba(108,0,255,.4); color: var(--text); }
        .msg-action-btn.danger:hover { border-color: rgba(242,40,34,.4); color: var(--danger); }
        .msg-edit-area { width: 100%; min-height: 60px; resize: vertical; margin-top: 6px; font-size: 12px; }
        .msg-edit-btns { display: flex; gap: 5px; margin-top: 5px; }

        /* TABLE IMPROVEMENTS */
        .last-msg-preview { display: block; font-size: 11px; color: var(--muted); margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 220px; }
        tr.row-stale > td:first-child { box-shadow: inset 2px 0 0 rgba(246,189,58,.55); }
```

- [ ] **Step 2: Verify in browser**

Open `Adervis LidGen.html` in browser. Open DevTools → Elements, confirm the new classes exist in the stylesheet. No visual changes to the app yet (classes not applied to HTML yet).

- [ ] **Step 3: Commit**

```bash
git add "Adervis LidGen.html"
git commit -m "style: add two-column chat, script cards, msg edit/delete CSS classes"
```

---

## Task 2: Restructure #chat-view HTML

**File:** `Adervis LidGen.html` — the `#chat-view` div (lines ~344–374)

- [ ] **Step 1: Replace the entire `#chat-view` div**

Find and replace the entire `<div id="chat-view" ...>` block. The old block starts at `<div id="chat-view" style="display:none;">` and ends before the `<div class="modal-overlay" id="bulkModal">`. Replace it with:

```html
    <div id="chat-view" style="display:none;">
        <div class="chat-header" id="chatHeader"></div>
        <div class="chat-body">
            <div class="chat-two-col">
                <!-- LEFT: history -->
                <div class="chat-col-left">
                    <div id="chatFeedMain" role="log" aria-live="polite" aria-label="История диалога"></div>
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
                </div>
                <!-- RIGHT: script helper -->
                <div class="chat-col-right" id="scriptPanel"></div>
            </div>
            <!-- NOTES STRIP — spans full width -->
            <div class="chat-notes-strip">
                <span aria-hidden="true" style="font-size:12px;flex-shrink:0;">📝</span>
                <label for="chatNotesArea" class="sr-only">Заметки по лиду</label>
                <textarea id="chatNotesArea" placeholder="Заметки по лиду..."
                    style="flex:1;height:34px;min-height:34px;resize:none;"
                    oninput="saveNotes(currentChatLeadId, this.value)"></textarea>
                <label for="chatRemindInput" style="font-size:11px;color:var(--muted);white-space:nowrap;flex-shrink:0;"><span aria-hidden="true">📅</span> Перезвонить:</label>
                <input type="date" id="chatRemindInput" autocomplete="off"
                    style="width:145px;flex-shrink:0;"
                    onchange="saveReminder(currentChatLeadId, this.value)">
                <button class="btn btn-outline" style="padding:4px 8px;font-size:11px;flex-shrink:0;"
                    onclick="saveReminder(currentChatLeadId,'');document.getElementById('chatRemindInput').value='';">Убрать</button>
            </div>
            <div id="chatSubmitStatus" aria-live="polite" class="sr-only"></div>
        </div>
    </div>
```

- [ ] **Step 2: Verify in browser**

Open app, click "Диалог" on any lead. Should see a two-column layout: left column has message feed + input, right column is empty (grey background, #scriptPanel not rendered yet). Notes strip at bottom. No JS errors in console.

- [ ] **Step 3: Commit**

```bash
git add "Adervis LidGen.html"
git commit -m "feat: restructure chat-view to two-column HTML layout"
```

---

## Task 3: Update JS — renderChatView, renderChatHeader, add renderScriptPanel

**File:** `Adervis LidGen.html` — JS section

### Step 1: Update `renderChatView`

Find the function `renderChatView` (~line 514) and replace it:

- [ ] **Replace `renderChatView`**

```javascript
        function renderChatView(lead) {
            renderChatHeader(lead);
            const feed = document.getElementById('chatFeedMain');
            if (feed) { feed.innerHTML = renderMessagesFeed(lead.messages, lead.id); feed.scrollTop = feed.scrollHeight; }
            renderScriptPanel(lead);
            const notesEl = document.getElementById('chatNotesArea');
            if (notesEl) notesEl.value = lead.notes || '';
            const remindEl = document.getElementById('chatRemindInput');
            if (remindEl) remindEl.value = lead.remindAt || '';
        }
```

### Step 2: Update `renderChatHeader`

Find `renderChatHeader` (~line 525) and replace it:

- [ ] **Replace `renderChatHeader`**

```javascript
        function renderChatHeader(lead) {
            const header = document.getElementById('chatHeader');
            if (!header) return;
            const badge = statuses[lead.status];
            const badgeText = badge.label.replace(/^\p{Emoji_Presentation}️?\s*/u, '');
            header.innerHTML =
                '<button class="btn btn-outline" onclick="closeChatView()" style="flex-shrink:0;padding:6px 12px;" aria-label="Вернуться к списку лидов">← Назад</button>' +
                '<div class="lead-title">' + escapeHtml(lead.name) + '</div>' +
                (lead.contact ? '<span style="font-size:12px;color:var(--muted);flex-shrink:0;">' + escapeHtml(lead.contact) + '</span>' : '') +
                '<div style="flex-shrink:0;">' + getPlatformBadge(lead.link, lead.name) + '</div>' +
                (lead.bizType ? '<span style="background:rgba(255,255,255,.05);border:1px solid var(--line);color:var(--muted);border-radius:4px;padding:2px 7px;font-size:11px;flex-shrink:0;">' + escapeHtml(lead.bizType) + '</span>' : '') +
                '<span class="badge ' + badge.class + '" style="flex-shrink:0;" aria-label="Статус: ' + escapeHtml(badgeText) + '">' + badge.label + '</span>';
        }
```

### Step 3: Add `renderScriptPanel` + helpers

Find the existing `renderSuggestionPanel` function (~line 1063). Replace the entire function with `renderScriptPanel` and add the three helper functions below it:

- [ ] **Replace `renderSuggestionPanel` with `renderScriptPanel` + helpers**

```javascript
        function renderScriptPanel(lead) {
            const panel = document.getElementById('scriptPanel');
            if (!panel) return;

            if (lead.status === 3 || lead.status === 4) {
                panel.innerHTML = '<div style="padding:16px;color:var(--muted);font-size:13px;">Воронка завершена. <button class="btn btn-outline" style="padding:4px 8px;font-size:12px;" onclick="setStatus(\'' + escapeHtml(String(lead.id)) + '\', 2)">🔄 Возобновить</button></div>';
                return;
            }

            const stageData = scripts[lead.status] || { desc: '', options: [] };
            const platformLink = (lead.link || '').toLowerCase();
            const autoTab = platformLink.includes('vk.com') ? 'vk' : platformLink.includes('instagr') ? 'inst' : platformLink.includes('t.me') ? 'tg' : 'vk';
            if (!window._chatPlatformTab) window._chatPlatformTab = {};
            const activeTab = window._chatPlatformTab[currentChatLeadId] || autoTab;

            let cards = stageData.options.slice();
            const kw = activeTab === 'vk' ? '[вк]' : activeTab === 'inst' ? '[inst]' : '[tg]';
            const matched = cards.filter(function(o) { return o.text.toLowerCase().includes(kw); });
            if (matched.length > 0) cards = matched;
            cards = cards.slice(0, 3);

            const stageNames  = ['Новый', 'Ледокол', 'В диалоге', 'Успех'];
            const stageDescs  = [
                'Отправить первое сообщение',
                'Ответить и вывести на звонок',
                'Закрыть возражения, предложить договор',
                'Сделка завершена'
            ];
            const progressSegs = [0, 1, 2, 3].map(function(i) {
                const cls = i < lead.status ? 'done' : i === lead.status ? 'current' : '';
                return '<div class="stage-progress-seg ' + cls + '"></div>';
            }).join('');

            const tabsHtml = ['vk', 'inst', 'tg'].map(function(t) {
                const label = t === 'vk' ? 'ВК' : t === 'inst' ? 'Inst' : 'TG';
                return '<button class="platform-tab' + (activeTab === t ? ' active' : '') + '" onclick="setChatPlatformTab(\'' + escapeHtml(String(lead.id)) + '\',\'' + t + '\')" aria-pressed="' + (activeTab === t ? 'true' : 'false') + '">' + label + '</button>';
            }).join('');

            let cardsHtml = '';
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

            panel.innerHTML =
                '<div style="padding:12px 14px;border-bottom:1px solid var(--line);flex-shrink:0;">' +
                    '<div style="display:flex;justify-content:space-between;align-items:center;">' +
                        '<span style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;">Этап воронки</span>' +
                        '<span style="font-size:10px;color:var(--muted);">' + Math.min(lead.status + 1, 4) + ' / 4</span>' +
                    '</div>' +
                    '<div class="stage-progress">' + progressSegs + '</div>' +
                    '<div style="color:var(--purple);font-weight:700;font-size:12px;">' + escapeHtml(stageNames[lead.status] || '') + '</div>' +
                    '<div style="color:var(--muted);font-size:10px;margin-top:1px;">' + escapeHtml(stageDescs[lead.status] || '') + '</div>' +
                '</div>' +
                '<div class="platform-tabs">' + tabsHtml + '</div>' +
                '<div class="script-panel-inner">' +
                    '<div class="script-panel-label">Шаблоны ответов</div>' +
                    cardsHtml +
                    '<button class="suggestion-card ai-card" id="chatAiBtn" onclick="generateAiReply(\'' + escapeHtml(String(lead.id)) + '\')">✨ AI-ответ</button>' +
                '</div>' +
                '<div style="padding:8px 14px;border-top:1px solid var(--line);background:rgba(10,10,12,.4);flex-shrink:0;">' +
                    '<label for="chatDraftArea" class="sr-only">Черновик ответа</label>' +
                    '<textarea id="chatDraftArea" placeholder="Выбери шаблон или напиши ответ..." style="width:100%;min-height:60px;resize:vertical;margin-bottom:6px;"></textarea>' +
                    '<div style="display:flex;gap:5px;">' +
                        '<button class="btn btn-primary" style="flex:1;font-size:12px;" onclick="saveDraftAsSent(\'' + escapeHtml(String(lead.id)) + '\')">Отправлено ✓</button>' +
                        '<button class="btn btn-outline" style="font-size:12px;" onclick="copyDraftText()">Копировать</button>' +
                    '</div>' +
                '</div>' +
                '<div style="padding:8px 14px 10px;border-top:1px solid var(--line);display:flex;gap:5px;flex-shrink:0;">' +
                    stageNavHtml +
                '</div>';

            if (!window._chatDraft) window._chatDraft = {};
            const draftEl = document.getElementById('chatDraftArea');
            if (draftEl) {
                if (window._chatDraft[currentChatLeadId]) draftEl.value = window._chatDraft[currentChatLeadId];
                draftEl.addEventListener('input', function() {
                    window._chatDraft[currentChatLeadId] = draftEl.value;
                });
            }
        }

        function setChatPlatformTab(leadId, tab) {
            if (!window._chatPlatformTab) window._chatPlatformTab = {};
            window._chatPlatformTab[String(leadId)] = tab;
            const lead = leads.find(function(l) { return String(l.id) === String(leadId); });
            if (lead) renderScriptPanel(lead);
        }

        function selectScriptCard(stageIdx, optIdx, leadId) {
            const lead = leads.find(function(l) { return String(l.id) === String(leadId); });
            if (!lead) return;
            const opt = (scripts[stageIdx] || { options: [] }).options[optIdx];
            if (!opt) return;
            const greeting = lead.contact ? lead.contact + ', здравствуйте! ' : 'Здравствуйте! ';
            const text = opt.content
                .replace(/{rest}/g, lead.name)
                .replace(/{greeting}/g, greeting)
                .replace(/{call}/g, cta.call)
                .replace(/{call_link}/g, cta.callLink)
                .replace(/{brief}/g, cta.brief)
                .replace(/{brief_link}/g, cta.briefLink)
                .replace(/{meeting}/g, cta.meeting);
            const draftEl = document.getElementById('chatDraftArea');
            if (draftEl) { draftEl.value = text; draftEl.focus(); }
            if (!window._chatDraft) window._chatDraft = {};
            window._chatDraft[currentChatLeadId] = text;
            navigator.clipboard.writeText(text).catch(function() {});
        }

        function saveScriptCardAsSent(stageIdx, optIdx, leadId) {
            selectScriptCard(stageIdx, optIdx, leadId);
            saveDraftAsSent(leadId);
        }
```

- [ ] **Step 4: Verify in browser**

Open app → click Диалог on a lead with status "Новый" or "Ледокол":
- Right column shows stage panel with purple name, progress bar, platform tabs, script cards with full text
- Clicking a platform tab (ВК/Inst/TG) switches scripts
- Clicking "Скопировать" fills the draft textarea
- Stage advance button visible at bottom of right column
- No JS errors in console

- [ ] **Step 5: Commit**

```bash
git add "Adervis LidGen.html"
git commit -m "feat: two-column chat view — renderScriptPanel with stage, platform tabs, full-text scripts"
```

---

## Task 4: Message Edit & Delete

**File:** `Adervis LidGen.html` — JS section

### Step 1: Update `renderSingleMessage` signature + edit/delete buttons

Find `renderSingleMessage` (~line 1195). Replace the entire function:

- [ ] **Replace `renderSingleMessage`**

```javascript
        function renderSingleMessage(m, leadId, msgIdx) {
            const d = new Date(m.date);
            const ds = d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
                     + ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
            const side = m.fromClient ? 'client' : 'manager';
            const lbl  = m.fromClient ? 'Клиент' : 'Менеджер';
            const editedMark = m.edited ? ' · <span style="font-size:10px;color:var(--muted);">изм.</span>' : '';
            const safeLeadId = escapeHtml(String(leadId));
            const actionBtns = leadId != null
                ? '<div class="msg-actions">' +
                  '<button class="msg-action-btn" onclick="editMessage(\'' + safeLeadId + '\',' + msgIdx + ')" aria-label="Редактировать сообщение">✏️</button>' +
                  '<button class="msg-action-btn danger" onclick="deleteMessage(\'' + safeLeadId + '\',' + msgIdx + ')" aria-label="Удалить сообщение">🗑</button>' +
                  '</div>'
                : '';
            const bubbleHtml = '<div class="msg-bubble ' + side + '">' + escapeHtml(m.text) + '</div>';
            const metaHtml = '<div class="msg-meta">' + lbl + ' · ' + ds + editedMark + '</div>';
            if (m.fromClient) {
                return '<div class="msg-wrap client"><div style="display:flex;align-items:flex-end;gap:5px;">' +
                    bubbleHtml + actionBtns + '</div>' + metaHtml + '</div>';
            } else {
                return '<div class="msg-wrap manager"><div style="display:flex;align-items:flex-end;gap:5px;justify-content:flex-end;">' +
                    actionBtns + bubbleHtml + '</div>' + metaHtml + '</div>';
            }
        }
```

### Step 2: Update `renderMessagesFeed` to accept + pass `leadId`

Find `renderMessagesFeed` (~line 1169). Replace:

- [ ] **Replace `renderMessagesFeed`**

```javascript
        function renderMessagesFeed(messages, leadId) {
            if (!Array.isArray(messages) || messages.length === 0) {
                return '<div class="chat-empty">Нет сообщений. Добавьте ответ клиента ниже.</div>';
            }
            let html = '';
            let lastDateLabel = null;
            messages.forEach(function(m, idx) {
                const label = formatDateSep(m.date);
                if (label !== lastDateLabel) {
                    html += '<div class="date-sep" aria-hidden="true">' + escapeHtml(label) + '</div>';
                    lastDateLabel = label;
                }
                html += renderSingleMessage(m, leadId, idx);
            });
            return html;
        }
```

### Step 3: Update `appendMessageToFeed` to use leadId

Find `appendMessageToFeed` (~line 1206). Replace:

- [ ] **Replace `appendMessageToFeed`**

```javascript
        function appendMessageToFeed(leadId) {
            const lead = leads.find(function(l) { return String(l.id) === String(leadId); });
            if (!lead || !Array.isArray(lead.messages) || lead.messages.length === 0) return;
            const feed = document.getElementById('chatFeedMain');
            if (!feed) return;
            const empty = feed.querySelector('.chat-empty');
            if (empty) empty.remove();
            const msgIdx = lead.messages.length - 1;
            const wrapper = document.createElement('div');
            wrapper.innerHTML = renderSingleMessage(lead.messages[msgIdx], leadId, msgIdx);
            feed.appendChild(wrapper.firstElementChild);
            feed.scrollTop = feed.scrollHeight;
        }
```

### Step 4: Update call site in `addMessageToLead`

Find this line inside `addMessageToLead` (~line 1235):

```javascript
            appendMessageToFeed(lead.messages[lead.messages.length - 1]);
```

Replace with:

```javascript
            appendMessageToFeed(lead.id);
```

### Step 5: Add edit/delete/save/cancel functions

Find the end of `appendMessageToFeed` function. Insert the following four new functions immediately after it:

- [ ] **Add edit/delete functions**

```javascript
        function editMessage(leadId, msgIdx) {
            const lead = leads.find(function(l) { return String(l.id) === String(leadId); });
            if (!lead || !lead.messages || !lead.messages[msgIdx]) return;
            const feed = document.getElementById('chatFeedMain');
            if (!feed) return;
            const m = lead.messages[msgIdx];
            const side = m.fromClient ? 'client' : 'manager';
            const safeLeadId = escapeHtml(String(leadId));
            // re-render feed with an inline edit form at msgIdx
            let html = '';
            let lastDateLabel = null;
            lead.messages.forEach(function(msg, idx) {
                const label = formatDateSep(msg.date);
                if (label !== lastDateLabel) {
                    html += '<div class="date-sep" aria-hidden="true">' + escapeHtml(label) + '</div>';
                    lastDateLabel = label;
                }
                if (idx === msgIdx) {
                    html += '<div class="msg-wrap ' + side + '">' +
                        '<div class="msg-edit-inline">' +
                        '<textarea class="msg-edit-area" id="msgEditArea_' + idx + '">' + escapeHtml(msg.text) + '</textarea>' +
                        '<div class="msg-edit-btns">' +
                        '<button class="btn btn-primary" style="font-size:11px;padding:4px 9px;" onclick="saveMessageEdit(\'' + safeLeadId + '\',' + idx + ')">Сохранить</button>' +
                        '<button class="btn btn-outline" style="font-size:11px;padding:4px 9px;" onclick="cancelMessageEdit(\'' + safeLeadId + '\')">Отмена</button>' +
                        '</div></div></div>';
                } else {
                    html += renderSingleMessage(msg, leadId, idx);
                }
            });
            feed.innerHTML = html;
            const ta = document.getElementById('msgEditArea_' + msgIdx);
            if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
        }

        function saveMessageEdit(leadId, msgIdx) {
            const lead = leads.find(function(l) { return String(l.id) === String(leadId); });
            if (!lead || !lead.messages || !lead.messages[msgIdx]) return;
            const ta = document.getElementById('msgEditArea_' + msgIdx);
            if (!ta || !String(ta.value || '').trim()) return;
            lead.messages[msgIdx].text = String(ta.value).trim();
            lead.messages[msgIdx].edited = true;
            localStorage.setItem('adervis_cold_db_v3', JSON.stringify(leads));
            const feed = document.getElementById('chatFeedMain');
            if (feed) { feed.innerHTML = renderMessagesFeed(lead.messages, lead.id); feed.scrollTop = feed.scrollHeight; }
        }

        function cancelMessageEdit(leadId) {
            const lead = leads.find(function(l) { return String(l.id) === String(leadId); });
            if (!lead) return;
            const feed = document.getElementById('chatFeedMain');
            if (feed) { feed.innerHTML = renderMessagesFeed(lead.messages, lead.id); feed.scrollTop = feed.scrollHeight; }
        }

        function deleteMessage(leadId, msgIdx) {
            if (!confirm('Удалить это сообщение?')) return;
            const lead = leads.find(function(l) { return String(l.id) === String(leadId); });
            if (!lead || !Array.isArray(lead.messages)) return;
            lead.messages.splice(msgIdx, 1);
            localStorage.setItem('adervis_cold_db_v3', JSON.stringify(leads));
            updateDashboard();
            const feed = document.getElementById('chatFeedMain');
            if (feed) { feed.innerHTML = renderMessagesFeed(lead.messages, lead.id); feed.scrollTop = feed.scrollHeight; }
        }
```

- [ ] **Step 6: Verify in browser**

Open app → Диалог on a lead that has messages:
- Hover over a message bubble → ✏️ 🗑 appear
- Click ✏️ → message turns into textarea with current text, Сохранить/Отмена buttons
- Edit text, click Сохранить → text updates, "изм." label appears next to timestamp
- Click Отмена → reverts to original bubble
- Click 🗑 → confirm dialog → message removed from feed
- No JS errors in console

- [ ] **Step 7: Commit**

```bash
git add "Adervis LidGen.html"
git commit -m "feat: message edit and delete in chat history"
```

---

## Task 5: Table — Last Message Preview + Stale Row Border

**File:** `Adervis LidGen.html` — inside `renderTable()` (~line 955)

### Step 1: Add `lastMsgHtml` and `staleClass` variables

Find this block inside the `sortedLeads.forEach` callback (before `html += ...`):

```javascript
                const isSelected = selectedLeadIds.has(String(lead.id));
                html += `
                    <tr>
```

Add two new variables immediately before `const isSelected = ...`:

- [ ] **Add lastMsgHtml and staleClass**

```javascript
                const lastMsgText = (lead.messages || []).length > 0
                    ? (lead.messages[lead.messages.length - 1].text || '').slice(0, 60)
                    : '';
                const lastMsgHtml = lastMsgText
                    ? '<span class="last-msg-preview">' + escapeHtml(lastMsgText) + '</span>'
                    : '';
                const rowStaleClass = (lead.status === 1 || lead.status === 2) &&
                    Math.floor((now - (lead.updatedAt || now)) / (1000 * 60 * 60 * 24)) >= 2
                    ? 'row-stale' : '';
```

### Step 2: Apply to the `<tr>` and status `<td>`

In the `html += \`` template literal for the row, change:

```javascript
                        <tr>
```

to:

```javascript
                        <tr class="${rowStaleClass}">
```

And change the status cell from:

```javascript
                        <td><span class="badge ${badge.class}" aria-label="${escapeHtml(badgeText)}">${badge.label}</span> ${staleHtml}${remindHtml}</td>
```

to:

```javascript
                        <td><span class="badge ${badge.class}" aria-label="${escapeHtml(badgeText)}">${badge.label}</span> ${staleHtml}${remindHtml}${lastMsgHtml}</td>
```

- [ ] **Step 3: Verify in browser**

In the leads table:
- Leads that have messages show the last message text (grey, small, below the status badge)
- Stale leads (2+ days, status Ледокол or В диалоге) have a left yellow border on their row
- Other rows show no yellow border

- [ ] **Step 4: Commit**

```bash
git add "Adervis LidGen.html"
git commit -m "feat: table shows last message preview and stale row border"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Two-column chat layout — Task 2 (HTML) + Task 3 (CSS + JS)
- ✅ Stage progress bar — Task 3 `renderScriptPanel`
- ✅ Platform tabs — Task 3 `renderScriptPanel`
- ✅ Script cards full text — Task 3 `renderScriptPanel`
- ✅ Draft area in right column — Task 3 `renderScriptPanel`
- ✅ Stage advance buttons — Task 3 `renderScriptPanel`
- ✅ Message edit (inline) — Task 4
- ✅ Message delete (confirm) — Task 4
- ✅ `edited` field + "изм." label — Task 4
- ✅ Button rename `+ Клиент` → `← Ответ клиента` — Task 2
- ✅ Hint text under input — Task 2
- ✅ Last message preview in table — Task 5
- ✅ Stale row border — Task 5
- ✅ Debounce search — already wired (`debouncedSearch` on line 283, defined on line 1453)
- ✅ Responsive <768px — Task 1 CSS `@media`

**Type/naming consistency:**
- `renderScriptPanel(lead)` — defined Task 3, called from `renderChatView` Task 3 ✅
- `renderSingleMessage(m, leadId, msgIdx)` — defined Task 4, called from `renderMessagesFeed` Task 4 + `editMessage` Task 4 ✅
- `appendMessageToFeed(leadId)` — signature updated Task 4, call site updated Task 4 ✅
- `selectScriptCard(stageIdx, optIdx, leadId)` — defined Task 3, called from `cardsHtml` in `renderScriptPanel` Task 3 ✅
- `saveScriptCardAsSent(stageIdx, optIdx, leadId)` — defined Task 3, called from `cardsHtml` Task 3 ✅
- `setChatPlatformTab(leadId, tab)` — defined Task 3, called from `tabsHtml` in `renderScriptPanel` Task 3 ✅
- `window._chatPlatformTab` — initialized and read in `renderScriptPanel`, written in `setChatPlatformTab` ✅
- `window._chatDraft` — initialized and read in `renderScriptPanel` ✅
