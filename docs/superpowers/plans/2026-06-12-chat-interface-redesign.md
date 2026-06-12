# Chat Interface Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two-tab/two-column chat view with a linear 3-step flow (client wrote → choose reply → sent), with inline script chips and AI variant selection (3 tones: мягкий / деловой / вопросом).

**Architecture:** Single file `Adervis LidGen.html`. CSS: add 15 new classes, remove 12 old ones. HTML: replace `#chat-view` inner structure. JS: remove 9 old functions/variables, add 8 new, update 3.

**Tech Stack:** Vanilla JS, CSS Custom Properties, localStorage (`adervis_custom_scripts_v4`, `adervis_cta_v1`), Gemini 1.5 Flash API (existing key in `adervis_gemini_key_v1`)

**Spec:** `docs/superpowers/specs/2026-06-12-chat-interface-redesign.md`

---

### Task 1: Add new CSS classes

**Files:**
- Modify: `Adervis LidGen.html` — CSS `<style>` block, after the `/* PLATFORM TABS */` section (around line 222, after `.platform-tab:hover:not(.active)` rule)

- [ ] **Step 1: Insert new CSS block**

Find this exact line in the `<style>` block:
```css
        /* SCRIPT CARDS (full text, not truncated) */
```

Insert the following block immediately before it:

```css
        /* CHAT STEP FLOW (new linear 3-step layout) */
        .chat-step { padding: 14px 16px; border-bottom: 1px solid var(--line); }
        .chat-step-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
        .chat-step h3 { margin: 0; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .6px; color: var(--purple); }
        .step-num { width: 22px; height: 22px; background: #23252a; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; color: var(--purple); flex-shrink: 0; }
        .step-num-2 { background: rgba(108,0,255,.25); }
        .step-hint { font-size: 10px; color: var(--muted); margin-left: auto; }
        .step-actions { display: flex; justify-content: flex-end; margin-top: 8px; }
        .script-chips { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
        .chip { padding: 5px 10px; border-radius: 6px; border: 1px solid rgba(108,0,255,.28); background: rgba(108,0,255,.10); color: var(--purple); font-size: 11px; font-family: var(--font-ui); font-weight: 500; cursor: pointer; transition: background .12s, border-color .12s; }
        .chip:hover { background: rgba(108,0,255,.2); border-color: rgba(108,0,255,.5); }
        .chip:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
        .chip-ai { background: rgba(39,166,68,.10); border-color: rgba(39,166,68,.28); color: var(--success); font-weight: 600; }
        .chip-ai:hover { background: rgba(39,166,68,.2); border-color: rgba(39,166,68,.5); }
        .chip-ai:disabled { opacity: .5; cursor: not-allowed; }
        .ai-variants { background: rgba(39,166,68,.05); border: 1px solid rgba(39,166,68,.18); border-radius: 8px; padding: 10px; margin-bottom: 10px; }
        .ai-variants-label { font-size: 10px; font-weight: 700; color: var(--success); margin-bottom: 8px; }
        .ai-variant-card { background: rgba(15,16,17,.9); border: 1px solid rgba(39,166,68,.2); border-radius: 6px; padding: 8px 10px; margin-bottom: 5px; cursor: pointer; font-family: var(--font-ui); font-size: 12px; color: var(--text); text-align: left; width: 100%; transition: border-color .12s, background .12s; }
        .ai-variant-card:last-child { margin-bottom: 0; }
        .ai-variant-card:hover { border-color: rgba(39,166,68,.45); background: rgba(39,166,68,.07); }
        .ai-variant-card:focus-visible { outline: 2px solid var(--success); outline-offset: 2px; }
        .ai-tone-label { font-size: 9px; font-weight: 700; color: var(--success); display: block; margin-bottom: 3px; letter-spacing: .4px; }
        .chat-send-bar { padding: 10px 16px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; border-bottom: 1px solid var(--line); }
        .send-hint { font-size: 11px; color: var(--muted); flex: 1; min-width: 100px; }
        .stage-nav-strip { display: flex; gap: 6px; padding: 8px 16px; border-bottom: 1px solid var(--line); background: rgba(10,10,12,.3); flex-wrap: wrap; }

```

- [ ] **Step 2: Open `Adervis LidGen.html` in browser, open DevTools Console — no errors expected**

- [ ] **Step 3: Commit**

```bash
git add "Adervis LidGen.html"
git commit -m "style: add CSS classes for linear chat step flow"
```

---

### Task 2: Replace `#chat-view` HTML

**Files:**
- Modify: `Adervis LidGen.html` — HTML block lines 406–447

- [ ] **Step 1: Replace the entire `#chat-view` div**

Find this block (starts with `<div id="chat-view"`, ends with `</div><!-- end #chat-view area -->`-ish, after the `<div id="chatSubmitStatus"...></div>` and closing tags):

```html
    <div id="chat-view" style="display:none;">
        <div class="chat-header" id="chatHeader"></div>
        <div class="chat-body">
            <div class="chat-two-col">
                <!-- LEFT: history -->
                <div class="chat-col-left">
                    <div id="chatFeedMain" role="log" aria-live="polite" aria-label="История диалога"></div>
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
                    <div class="chat-client-hint" id="chatInputHintVisible">Ctrl+Enter — записать · ← клиент · ✍️ менеджер</div>
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

Replace with:

```html
    <div id="chat-view" style="display:none;">
        <div class="chat-header" id="chatHeader"></div>
        <div class="chat-body">

            <!-- History feed -->
            <div id="chatFeedMain" role="log" aria-live="polite" aria-label="История диалога"></div>

            <!-- Step 1: Client wrote -->
            <div class="chat-step">
                <div class="chat-step-header">
                    <span class="step-num" aria-hidden="true">1</span>
                    <h3>Клиент написал</h3>
                    <span class="step-hint">Вставь из VK / Inst / TG</span>
                </div>
                <label for="clientTextarea" class="sr-only">Текст ответа клиента</label>
                <textarea id="clientTextarea" placeholder="Вставь текст ответа клиента..."
                    style="width:100%;min-height:52px;resize:none;"
                    oninput="document.getElementById('addClientMsgBtn').disabled = !this.value.trim();"></textarea>
                <div class="step-actions">
                    <button class="btn btn-outline" id="addClientMsgBtn"
                        onclick="submitClientMsg(currentChatLeadId)"
                        aria-label="Добавить сообщение клиента в историю"
                        disabled>+ Добавить в историю</button>
                </div>
            </div>

            <!-- Step 2: Your reply -->
            <div class="chat-step">
                <div class="chat-step-header">
                    <span class="step-num step-num-2" aria-hidden="true">2</span>
                    <h3 style="color:var(--blue);">Твой ответ</h3>
                </div>
                <div class="script-chips" id="script-chips-container"
                    role="group" aria-label="Шаблоны ответов"></div>
                <div class="ai-variants" id="ai-variants" hidden
                    aria-live="polite" aria-label="Варианты ответа от AI"></div>
                <label for="replyTextarea" class="sr-only">Текст ответа менеджера</label>
                <textarea id="replyTextarea" placeholder="Нажми скрипт выше — или напиши свой вариант..."
                    style="width:100%;min-height:72px;resize:vertical;"
                    oninput="var e=this.value.trim(); document.getElementById('sentBtn').disabled=!e; document.getElementById('copyReplyBtn').disabled=!e;"></textarea>
            </div>

            <!-- Step 3: Send bar -->
            <div class="chat-send-bar">
                <span class="send-hint" aria-hidden="true">Скопируй → отправь в VK / Inst / TG</span>
                <button class="btn btn-outline" id="copyReplyBtn"
                    onclick="copyReply()"
                    aria-label="Скопировать текст ответа в буфер обмена"
                    disabled>📋 Скопировать</button>
                <button class="btn btn-success" id="sentBtn"
                    onclick="submitManagerMsg(currentChatLeadId)"
                    aria-label="Записать отправленное сообщение в историю"
                    disabled>✓ Отправил</button>
            </div>

            <!-- Stage navigation -->
            <div class="stage-nav-strip" id="stage-nav-strip"></div>

            <!-- Notes strip (unchanged) -->
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
                    onclick="saveReminder(currentChatLeadId,'');document.getElementById('chatRemindInput').value='';"
                    aria-label="Убрать напоминание">Убрать</button>
            </div>

            <div id="chatSubmitStatus" aria-live="polite" class="sr-only"></div>
        </div>
    </div>
```

- [ ] **Step 2: Open file in browser, click «Диалог» on any lead. Verify: new 3-step layout renders without JS errors. Buttons «Добавить в историю», «Скопировать», «✓ Отправил» are disabled initially.**

- [ ] **Step 3: Commit**

```bash
git add "Adervis LidGen.html"
git commit -m "feat: replace chat-view HTML with linear 3-step flow"
```

---

### Task 3: Update `openChatView` and `renderChatView`; remove `chatInputTab` variable

**Files:**
- Modify: `Adervis LidGen.html` — JS section

- [ ] **Step 1: Remove `let chatInputTab = 'client';`**

Find and delete this exact line (around line 584):
```javascript
        let chatInputTab = 'client'; // 'client' | 'manager'
```

- [ ] **Step 2: Replace `openChatView`**

Find:
```javascript
        function openChatView(id) {
            currentChatLeadId = String(id);
            const lead = leads.find(l => String(l.id) === currentChatLeadId);
            if (!lead) return;
            document.getElementById('table-view').style.display = 'none';
            document.getElementById('chat-view').style.display = 'block';
            renderChatView(lead);
            setChatInputTab('client');
            const f = document.getElementById('chatInputMain');
            if (f) f.focus();
        }
```

Replace with:
```javascript
        function openChatView(id) {
            currentChatLeadId = String(id);
            const lead = leads.find(l => String(l.id) === currentChatLeadId);
            if (!lead) return;
            document.getElementById('table-view').style.display = 'none';
            document.getElementById('chat-view').style.display = 'block';
            renderChatView(lead);
            const f = document.getElementById('clientTextarea');
            if (f) f.focus();
        }
```

- [ ] **Step 3: Replace `renderChatView`**

Find:
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

Replace with:
```javascript
        function renderChatView(lead) {
            renderChatHeader(lead);
            const feed = document.getElementById('chatFeedMain');
            if (feed) { feed.innerHTML = renderMessagesFeed(lead.messages, lead.id); feed.scrollTop = feed.scrollHeight; }
            renderScriptChips(lead);
            renderStageNav(lead);
            const notesEl = document.getElementById('chatNotesArea');
            if (notesEl) notesEl.value = lead.notes || '';
            const remindEl = document.getElementById('chatRemindInput');
            if (remindEl) remindEl.value = lead.remindAt || '';
            // Reset step inputs
            const clientTA = document.getElementById('clientTextarea');
            if (clientTA) { clientTA.value = ''; document.getElementById('addClientMsgBtn').disabled = true; }
            const replyTA = document.getElementById('replyTextarea');
            if (replyTA) { replyTA.value = ''; document.getElementById('sentBtn').disabled = true; document.getElementById('copyReplyBtn').disabled = true; }
            const aiBlock = document.getElementById('ai-variants');
            if (aiBlock) aiBlock.hidden = true;
        }
```

- [ ] **Step 4: Open browser, click Диалог on a lead. Verify history renders, no console errors. Step inputs are empty and buttons disabled.**

- [ ] **Step 5: Commit**

```bash
git add "Adervis LidGen.html"
git commit -m "feat: update openChatView and renderChatView for new layout"
```

---

### Task 4: Replace `renderScriptPanel` with `renderScriptChips` + `insertScript` + `renderStageNav`

**Files:**
- Modify: `Adervis LidGen.html` — JS section

- [ ] **Step 1: Delete `renderScriptPanel` function**

Find the entire function (starts at line ~1175):
```javascript
        function renderScriptPanel(lead) {
```
Delete it through its closing `}` — the function ends just before `function setChatPlatformTab`. Visually: it's a large block ending around line 1278.

- [ ] **Step 2: Delete `setChatPlatformTab` function**

Find and delete:
```javascript
        function setChatPlatformTab(leadId, tab) {
            if (!window._chatPlatformTab) window._chatPlatformTab = {};
            window._chatPlatformTab[String(leadId)] = tab;
            const lead = leads.find(function(l) { return String(l.id) === String(leadId); });
            if (lead) renderScriptPanel(lead);
        }
```

- [ ] **Step 3: Delete `selectScriptCard` function**

Find and delete:
```javascript
        function selectScriptCard(stageIdx, optIdx, leadId, cardDisplayIdx) {
```
Delete through its closing `}`.

- [ ] **Step 4: Delete `selectSuggestion` function (dead code)**

Find and delete:
```javascript
        function selectSuggestion(stageIdx, optIdx, leadId) {
```
Delete through its closing `}`.

- [ ] **Step 5: Insert new functions**

Find the line:
```javascript
        function saveDraftAsSent(leadId) {
```

Insert the following three new functions immediately before it:

```javascript
        function renderScriptChips(lead) {
            const container = document.getElementById('script-chips-container');
            if (!container) return;
            if (lead.status === 3 || lead.status === 4) {
                container.innerHTML = '';
                return;
            }
            const stageData = scripts[lead.status] || { options: [] };
            const platformLink = (lead.link || '').toLowerCase();
            const platform = platformLink.includes('vk.com') ? 'vk' : platformLink.includes('instagr') ? 'inst' : platformLink.includes('t.me') ? 'tg' : null;
            const kw = platform === 'vk' ? '[вк]' : platform === 'inst' ? '[inst]' : platform === 'tg' ? '[tg]' : null;
            let opts = stageData.options.slice();
            if (kw) {
                const matched = opts.filter(function(o) { return o.text.toLowerCase().includes(kw); });
                if (matched.length > 0) opts = matched;
            }
            opts = opts.slice(0, 4);
            const safeId = escapeHtml(String(lead.id));
            let html = '';
            opts.forEach(function(opt) {
                const realIdx = stageData.options.indexOf(opt);
                const label = opt.text.replace(/^\[.*?\]\s*/, '');
                html += '<button class="chip" onclick="insertScript(\'' + safeId + '\',' + lead.status + ',' + realIdx + ')"' +
                    ' aria-label="Вставить скрипт: ' + escapeHtml(label) + '">' +
                    escapeHtml(label) + '</button>';
            });
            html += '<button class="chip chip-ai" id="chipAiBtn" onclick="toggleAiVariants(\'' + safeId + '\')"' +
                ' aria-label="Получить AI-варианты ответа">✨ AI-вариант</button>';
            container.innerHTML = html;
        }

        function insertScript(leadId, stageIdx, optIdx) {
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
            const ta = document.getElementById('replyTextarea');
            if (ta) {
                ta.value = text;
                ta.focus();
                document.getElementById('sentBtn').disabled = false;
                document.getElementById('copyReplyBtn').disabled = false;
            }
        }

        function renderStageNav(lead) {
            const strip = document.getElementById('stage-nav-strip');
            if (!strip) return;
            const safeId = escapeHtml(String(lead.id));
            let html = '';
            if (lead.status === 0) {
                html = '<button class="btn btn-primary" style="font-size:12px;flex:1;" onclick="setStatus(\'' + safeId + '\', 1)">' +
                    stageNames[0] + ' → ' + stageNames[1] + '</button>';
            } else if (lead.status === 1) {
                html = '<button class="btn btn-primary" style="font-size:12px;flex:1;" onclick="setStatus(\'' + safeId + '\', 2)">' +
                    stageNames[1] + ' → ' + stageNames[2] + '</button>' +
                    '<button class="btn btn-danger" style="font-size:12px;" onclick="setStatus(\'' + safeId + '\', 4)" aria-label="Отказ или игнор">✕</button>';
            } else if (lead.status === 2) {
                html = '<button class="btn btn-success" style="font-size:12px;flex:1;" onclick="setStatus(\'' + safeId + '\', 3)">' +
                    stageNames[2] + ' → ' + stageNames[3] + ' ✅</button>' +
                    '<button class="btn btn-danger" style="font-size:12px;" onclick="setStatus(\'' + safeId + '\', 4)" aria-label="Отказ или игнор">✕</button>';
            }
            strip.hidden = !html;
            strip.innerHTML = html;
        }

```

- [ ] **Step 6: Verify in browser — open Диалог, check: script chips appear in Step 2. Click a chip — text appears in reply textarea, «✓ Отправил» and «📋 Скопировать» become enabled. Stage nav buttons visible below send bar.**

- [ ] **Step 7: Commit**

```bash
git add "Adervis LidGen.html"
git commit -m "feat: add renderScriptChips, insertScript, renderStageNav; remove renderScriptPanel"
```

---

### Task 5: Add `submitClientMsg`, `submitManagerMsg`, `copyReply`; remove old submit functions

**Files:**
- Modify: `Adervis LidGen.html` — JS section

- [ ] **Step 1: Delete `saveDraftAsSent` function**

Find and delete:
```javascript
        function saveDraftAsSent(leadId) {
            const draftEl = document.getElementById('chatDraftArea');
            if (!draftEl || !draftEl.value.trim()) return;
            addMessageToLead(leadId, draftEl.value, false);
            draftEl.value = '';
        }
```

- [ ] **Step 2: Delete `copyDraftText` function**

Find and delete:
```javascript
        function copyDraftText() {
            const draftEl = document.getElementById('chatDraftArea');
```
Delete through its closing `}`.

- [ ] **Step 3: Delete `submitClientMessageFromChat` function**

Find and delete:
```javascript
        function submitClientMessageFromChat(leadId) {
            submitChatInput(leadId);
        }
```

- [ ] **Step 4: Delete `submitChatInput` function**

Find and delete:
```javascript
        function submitChatInput(leadId) {
            if (!leadId) return;
            const input = document.getElementById('chatInputMain');
            if (!input || !input.value.trim()) return;
            const txt = input.value.trim();
            input.value = '';
            const fromClient = (chatInputTab === 'client');
            addMessageToLead(leadId, txt, fromClient);
        }
```

- [ ] **Step 5: Delete `setChatInputTab` function**

Find and delete:
```javascript
        function setChatInputTab(tab) {
            chatInputTab = tab;
```
Delete through its closing `}`.

- [ ] **Step 6: Insert new functions**

Find the line:
```javascript
        function getGeminiKey() {
```

Insert immediately before it:

```javascript
        function submitClientMsg(leadId) {
            if (!leadId) return;
            const ta = document.getElementById('clientTextarea');
            if (!ta || !ta.value.trim()) return;
            addMessageToLead(leadId, ta.value.trim(), true);
            ta.value = '';
            document.getElementById('addClientMsgBtn').disabled = true;
            const status = document.getElementById('chatSubmitStatus');
            if (status) status.textContent = 'Сообщение клиента добавлено';
        }

        function submitManagerMsg(leadId) {
            if (!leadId) return;
            const ta = document.getElementById('replyTextarea');
            if (!ta || !ta.value.trim()) return;
            addMessageToLead(leadId, ta.value.trim(), false);
            ta.value = '';
            document.getElementById('sentBtn').disabled = true;
            document.getElementById('copyReplyBtn').disabled = true;
            const status = document.getElementById('chatSubmitStatus');
            if (status) status.textContent = 'Сообщение записано';
        }

        function copyReply() {
            const ta = document.getElementById('replyTextarea');
            if (!ta || !ta.value.trim()) return;
            const btn = document.getElementById('copyReplyBtn');
            navigator.clipboard.writeText(ta.value).then(function() {
                if (btn) { btn.textContent = 'Скопировано ✓'; setTimeout(function() { btn.textContent = '📋 Скопировать'; }, 2000); }
            }).catch(function() {
                ta.select();
                document.execCommand('copy');
                if (btn) { btn.textContent = 'Скопировано ✓'; setTimeout(function() { btn.textContent = '📋 Скопировать'; }, 2000); }
            });
        }

```

- [ ] **Step 7: Verify in browser:**
  - Paste text in Step 1 textarea → «Добавить в историю» enables → click → message appears in history, textarea clears, button disables again
  - Type text in Step 2 textarea → «✓ Отправил» and «📋 Скопировать» enable
  - Click «📋 Скопировать» → button briefly shows «Скопировано ✓»
  - Click «✓ Отправил» → message appears in history, textarea clears, buttons disable

- [ ] **Step 8: Commit**

```bash
git add "Adervis LidGen.html"
git commit -m "feat: add submitClientMsg, submitManagerMsg, copyReply; remove old tab submit functions"
```

---

### Task 6: Add AI variant selection; update `generateAiReply` for 3-tone output

**Files:**
- Modify: `Adervis LidGen.html` — JS section (around the existing `generateAiReply` function)

- [ ] **Step 1: Replace `generateAiReply` function entirely**

Find:
```javascript
        async function generateAiReply(leadId) {
```
Delete through its closing `}` (ends around line 1567).

Insert in its place:

```javascript
        async function generateAiReply(leadId) {
            const lead = leads.find(function(l) { return String(l.id) === String(leadId); });
            if (!lead) return;
            const apiKey = getGeminiKey();
            if (!apiKey) { alert('Введите Gemini API ключ в Настройках (⚙️ Скрипты → поле Gemini API)'); return; }
            const clientMsgs = (lead.messages || []).filter(function(m) { return m.fromClient; });
            const lastMsg = clientMsgs[clientMsgs.length - 1];
            if (!lastMsg) { alert('Нет сообщений от клиента. Добавьте сообщение клиента в шаге 1.'); return; }
            const btn = document.getElementById('chipAiBtn');
            const aiBlock = document.getElementById('ai-variants');
            if (btn) { btn.disabled = true; btn.textContent = '⏳ AI...'; }
            if (aiBlock) aiBlock.hidden = true;
            const bizInfo = lead.bizType ? ' (' + lead.bizType + ')' : '';
            const prompt = 'Ты — менеджер по продажам видеопродакшена ADERVIS. Снимаем короткие видео (VK Клипы, Reels, Shorts) для заведений.\n\nКлиент: «' + lead.name + '»' + bizInfo + ' написал:\n«' + lastMsg.text + '»\n\nДай ровно 3 варианта короткого ответа менеджера на русском. Цель — перевести на созвон. Только текст ответов, без вступлений. Формат строго:\n1. [МЯГКИЙ] текст ответа\n2. [ДЕЛОВОЙ] текст ответа\n3. [ВОПРОСОМ] текст ответа';
            try {
                const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + encodeURIComponent(apiKey), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 500, temperature: 0.8 } })
                });
                if (!res.ok) { const e = await res.json().catch(function() { return {}; }); throw new Error((e.error && e.error.message) || 'HTTP ' + res.status); }
                const data = await res.json();
                const gen = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text) || '';
                if (!gen) throw new Error('Пустой ответ от API');
                showAiVariants(gen.trim());
            } catch (err) {
                alert('Ошибка Gemini API: ' + err.message);
            } finally {
                if (btn) { btn.disabled = false; btn.textContent = '✨ AI-вариант'; }
            }
        }

        function showAiVariants(rawText) {
            const aiBlock = document.getElementById('ai-variants');
            if (!aiBlock) return;
            const tones = ['МЯГКИЙ', 'ДЕЛОВОЙ', 'ВОПРОСОМ'];
            const variants = [];
            tones.forEach(function(tone) {
                const re = new RegExp('\\[' + tone + '\\][\\s\\S]*?([^\\[]+?)(?=\\n\\d+\\.\\s*\\[|$)', 'i');
                const m = rawText.match(re);
                if (m && m[1] && m[1].trim()) variants.push({ tone: tone, text: m[1].trim() });
            });
            // Fallback: parsing failed → show full text as one variant
            if (variants.length === 0) variants.push({ tone: 'AI', text: rawText });
            let html = '<div class="ai-variants-label">✨ AI предлагает — выбери тон:</div>';
            variants.forEach(function(v) {
                html += '<button class="ai-variant-card" onclick="selectAiVariant(' + JSON.stringify(v.text) + ')"' +
                    ' aria-label="Вставить вариант ' + escapeHtml(v.tone) + '">' +
                    '<span class="ai-tone-label">' + escapeHtml(v.tone) + '</span>' +
                    escapeHtml(v.text) + '</button>';
            });
            aiBlock.innerHTML = html;
            aiBlock.hidden = false;
        }

        function toggleAiVariants(leadId) {
            const aiBlock = document.getElementById('ai-variants');
            if (aiBlock && !aiBlock.hidden) { aiBlock.hidden = true; return; }
            generateAiReply(leadId);
        }

        function selectAiVariant(text) {
            const ta = document.getElementById('replyTextarea');
            if (ta) {
                ta.value = text;
                ta.focus();
                document.getElementById('sentBtn').disabled = false;
                document.getElementById('copyReplyBtn').disabled = false;
            }
            const aiBlock = document.getElementById('ai-variants');
            if (aiBlock) aiBlock.hidden = true;
        }

```

- [ ] **Step 2: Verify AI flow in browser (requires Gemini key in settings):**
  - Add a client message in Step 1
  - Click «✨ AI-вариант» chip → button shows «⏳ AI...» then returns to «✨ AI-вариант»
  - Three variant cards appear (МЯГКИЙ / ДЕЛОВОЙ / ВОПРОСОМ)
  - Click one → text fills reply textarea, AI block disappears, buttons enable
  - Click «✨ AI-вариант» again when block is visible → block hides (toggle)

  *If no Gemini key: verify alert about settings appears and function returns.*

- [ ] **Step 3: Commit**

```bash
git add "Adervis LidGen.html"
git commit -m "feat: update generateAiReply for 3-tone variants; add showAiVariants, toggleAiVariants, selectAiVariant"
```

---

### Task 7: Remove old CSS classes (clean-up)

**Files:**
- Modify: `Adervis LidGen.html` — CSS `<style>` block

- [ ] **Step 1: Delete the `/* TWO-COLUMN CHAT LAYOUT */` block**

Find and delete this entire CSS block (around lines 199–210):
```css
        /* TWO-COLUMN CHAT LAYOUT */
        .chat-two-col { display: grid; grid-template-columns: 1fr 340px; flex: 1; min-height: 0; overflow: hidden; }
        @media (max-width: 768px) { .chat-two-col { grid-template-columns: 1fr; } }
        .chat-col-left { display: flex; flex-direction: column; border-right: 1px solid var(--line); min-height: 400px; overflow: hidden; }
        .chat-col-right { display: flex; flex-direction: column; background: var(--bg2); overflow-y: auto; max-height: 75vh; }
        .chat-two-col #chatFeedMain { max-height: none; flex: 1; min-height: 0; }
        .chat-notes-strip { border-top: 1px solid var(--line); padding: 8px 14px; background: var(--bg2); display: flex; gap: 8px; align-items: center; flex-shrink: 0; flex-wrap: wrap; }
        .chat-client-hint { padding: 2px 14px 6px; font-size: 10px; color: var(--muted); }
        .chat-input-tabs { display: flex; gap: 4px; padding: 8px 14px 4px; flex-shrink: 0; }
        .chat-input-tab { padding: 4px 11px; border-radius: 6px; border: 1px solid var(--line); background: transparent; color: var(--muted); font-size: 11px; font-weight: 600; cursor: pointer; font-family: var(--font-ui); transition: all .12s; }
        .chat-input-tab.active { background: rgba(94,106,210,.14); border-color: rgba(94,106,210,.4); color: #5e6ad2; }
        .chat-input-tab:hover:not(.active) { border-color: var(--muted); color: var(--text); }
```

**Important:** the `.chat-notes-strip` rule is in this block — it needs to be kept. After deleting, add it back as a standalone rule just after `/* CHAT VIEW */`:

Add after `.chat-notes { border-top: ...}` rule:
```css
        .chat-notes-strip { border-top: 1px solid var(--line); padding: 8px 14px; background: var(--bg2); display: flex; gap: 8px; align-items: center; flex-shrink: 0; flex-wrap: wrap; }
```

- [ ] **Step 2: Delete `#chatDraftArea` rule (around line 194)**

Find and delete:
```css
        #chatDraftArea { width: 100%; min-height: 72px; resize: vertical; margin-top: 8px; }
```

- [ ] **Step 3: Delete `.client-input-row` rule (around line 187)**

Find and delete:
```css
        .client-input-row { display: flex; gap: 8px; padding: 10px 14px; border-top: 1px solid var(--line); background: var(--bg2); flex-shrink: 0; }
```

- [ ] **Step 4: Open browser, verify notes strip and reminder are still visible at bottom of chat. Check DevTools → no layout shifts.**

- [ ] **Step 5: Commit**

```bash
git add "Adervis LidGen.html"
git commit -m "style: remove old two-column chat CSS; keep chat-notes-strip"
```

---

### Task 8: Final verification and update ACTION_MAP

**Files:**
- Modify: `ACTION_MAP.md`

- [ ] **Step 1: Full end-to-end test in browser**

Open `Adervis LidGen.html` directly in the browser. Test this exact flow:

1. Click «Диалог» on any lead with status 0 (Новый) → chat opens. Step 1, 2, 3 visible. Chips show icebreaker scripts for the platform.
2. Paste a client reply in Step 1 textarea → «Добавить в историю» enables → click → message appears in history, textarea clears.
3. Click a script chip → text fills reply textarea → «✓ Отправил» and «📋 Скопировать» enable.
4. Click «📋 Скопировать» → button shows «Скопировано ✓» for 2s, reverts.
5. Click «✓ Отправил» → manager message appears in history, textarea clears.
6. Click «Назад» → returns to table. Re-open same lead → messages persist.
7. Stage nav: click «Новый → Ледокол» → header badge updates, chips refresh to stage 1 scripts.
8. Notes and reminder: type in notes, set date → save confirmed (check `adervis_cold_db_v3` in DevTools → Application → Local Storage).

- [ ] **Step 2: Test status 3/4 leads — chips area should be empty (no scripts shown)**

- [ ] **Step 3: Update `ACTION_MAP.md`**

Add to the `### 2026-06-12` section:
```
- DONE: Chat interface redesign — linear 3-step flow (client wrote → choose reply → sent), script chips, AI 3-tone variants
```

- [ ] **Step 4: Commit**

```bash
git add "Adervis LidGen.html" ACTION_MAP.md
git commit -m "feat: complete chat interface redesign — linear 3-step flow with script chips and AI variants"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Step 1 «Клиент написал» + «Добавить в историю» — Task 2, 5
- ✅ Step 2 «Твой ответ» with script chips + AI-chip — Task 4
- ✅ AI: 3 variants МЯГКИЙ/ДЕЛОВОЙ/ВОПРОСОМ, click to insert — Task 6
- ✅ AI fallback: full text if parse fails — Task 6 `showAiVariants`
- ✅ Step 3 «📋 Скопировать» + «✓ Отправил» — Task 2, 5
- ✅ Disabled buttons when textarea empty — Task 2 (inline oninput)
- ✅ Notes strip unchanged — Task 2
- ✅ Stage nav buttons preserved (moved to `stage-nav-strip`) — Task 4 `renderStageNav`
- ✅ WCAG: all buttons are `<button>`, aria-label on chips, aria-live on ai-variants — Task 2
- ✅ Gemini key absent → alert — Task 6
- ✅ Old CSS removed — Task 7
- ✅ Old JS removed (chatInputTab, setChatInputTab, submitChatInput, renderScriptPanel, selectScriptCard, selectSuggestion, saveDraftAsSent, copyDraftText, setChatPlatformTab) — Tasks 3,4,5

**Type consistency:** `currentChatLeadId` used in all onclick handlers ✅ · `addMessageToLead(leadId, text, bool)` signature matches ✅ · `setStatus(id, newStatus)` signature matches ✅
