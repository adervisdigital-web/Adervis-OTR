# VK UX Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сделать VK-интеграцию полностью удобной: авто-определение ID, умная кнопка отправки, уведомления о входящих, визуальные индикаторы.

**Architecture:** Всё реализуется в двух файлах: `index.html` (утилиты, UI-логика, CSS) и `supabase/functions/vk-send/index.ts` (добавить флаг `vk_sent`). Никаких новых файлов не создаётся.

**Tech Stack:** Vanilla JS, CSS Custom Properties, Supabase Realtime, Supabase Edge Functions (Deno/TypeScript)

---

## Затронутые файлы

| Файл | Что меняем |
|------|-----------|
| `index.html` | +`extractVkPeerId()`, +`primarySendAction()`, +`updateSendButtons()`, изм. `submitQuickAdd()`, `confirmBulkImport()`, `saveVkPeerId()`, `setChatInputTab()`, `renderChatView()`, `subscribeToLeads()`, `renderChatHeader()`, `renderTgLeadItem()`, `renderSingleMessage()`, +CSS |
| `supabase/functions/vk-send/index.ts` | добавить `vk_sent: true` в объект сообщения (~строка 108) |

---

## Task 1: `extractVkPeerId(url)` — авто-определение VK Peer ID из ссылки

**Files:**
- Modify: `index.html` — после `detectPlatform()` (~строка 2504), `submitQuickAdd()` (~строка 2643), `confirmBulkImport()` (~строка 2702), `saveVkPeerId()` (~строка 5017)

- [ ] **Step 1: Добавить функцию `extractVkPeerId` после `detectPlatform()` (~строка 2504)**

Вставить после закрывающей `}` функции `detectPlatform` (строка ~2504):

```js
        function extractVkPeerId(url) {
            if (!url) return null;
            try {
                const u = new URL(url.startsWith('http') ? url : 'https://' + url);
                const host = u.hostname.replace(/^www\.|^m\./, '');
                if (host !== 'vk.com') return null;
                const parts = u.pathname.split('/').filter(Boolean);
                const slug = parts[0] || '';
                // vk.com/id123456 → 123456
                const idMatch = slug.match(/^id(\d+)$/i);
                if (idMatch) return Number(idMatch[1]);
                // vk.com/club123456 → -123456
                const clubMatch = slug.match(/^club(\d+)$/i);
                if (clubMatch) return -Number(clubMatch[1]);
                // vk.com/public123456 → -123456
                const pubMatch = slug.match(/^public(\d+)$/i);
                if (pubMatch) return -Number(pubMatch[1]);
                // vk.com/username — не числовой, нельзя определить
                return null;
            } catch (e) { return null; }
        }
```

- [ ] **Step 2: Применить в `submitQuickAdd()` (~строка 2643)**

Найти блок создания `newLead` в `submitQuickAdd()`. Строку:
```js
                vkPeerId:     null,
```
Заменить на:
```js
                vkPeerId:     extractVkPeerId(finalLink),
```

- [ ] **Step 3: Применить в `confirmBulkImport()` (~строка 2702)**

Найти строку:
```js
                    updatedAt: Date.now(), notes: '', messages: [], bizType: bizType, vkPeerId: null });
```
Заменить на:
```js
                    updatedAt: Date.now(), notes: '', messages: [], bizType: bizType, vkPeerId: extractVkPeerId(r.link) });
```

- [ ] **Step 4: Применить в `saveVkPeerId()` — авто-заполнение при смене ссылки в drawer**

Найти функцию `saveVkPeerId` (~строка 5017):
```js
            lead.vkPeerId = value ? Number(value) : null;
```
Эта строка остаётся как есть (ручной ввод числа работает). Дополнительно найти в `saveDrawer()` (~строка 4994) строку сохранения `lead.link`:
```js
            lead.link     = normalizeUrl(document.getElementById('drawerLink').value || '');
```
После неё добавить:
```js
            if (!lead.vkPeerId) {
                const autoPeer = extractVkPeerId(lead.link);
                if (autoPeer) { lead.vkPeerId = autoPeer; }
            }
```

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat(vk): extractVkPeerId — авто-определение peer_id из VK URL"
```

---

## Task 2: Умная кнопка отправки

**Files:**
- Modify: `index.html` — HTML зоны ввода (~строка 1249–1254), +`primarySendAction()`, +`updateSendButtons()`, `setChatInputTab()`, `renderChatView()`

- [ ] **Step 1: Обновить HTML зоны кнопок и textarea (~строки 1249–1254)**

Найти блок:
```html
                            <textarea id="chatInputMain" placeholder="Вставь текст сообщения клиента..."
                                style="width:100%;min-height:80px;resize:none;"
                                aria-describedby="chatInputHint"
                                onkeydown="if(event.ctrlKey&&event.key==='Enter'){submitChatInput(currentChatLeadId);event.preventDefault();}"></textarea>
                        </div>
                        <div style="display:flex;gap:6px;align-self:flex-end;">
                            <button class="btn btn-outline" aria-label="Отправить в историю" onclick="submitChatInput(currentChatLeadId)">Отправить</button>
                            <button id="btnSendVk" class="btn btn-outline" aria-label="Отправить в VK" onclick="sendToVk(currentChatLeadId)" style="display:none;" data-tooltip="Отправить сообщение в VK">📤 В VK</button>
                        </div>
```

Заменить на:
```html
                            <textarea id="chatInputMain" placeholder="Вставь текст сообщения клиента..."
                                style="width:100%;min-height:80px;resize:none;"
                                aria-describedby="chatInputHint"
                                onkeydown="if(event.ctrlKey&&event.key==='Enter'){primarySendAction(currentChatLeadId);event.preventDefault();}"></textarea>
                        </div>
                        <div style="display:flex;gap:6px;align-self:flex-end;align-items:center;">
                            <button id="btnSendHistory" class="btn btn-outline" aria-label="Отправить в историю" onclick="submitChatInput(currentChatLeadId)">Отправить</button>
                            <button id="btnSendVk" class="btn btn-primary" aria-label="Отправить в VK" onclick="sendToVk(currentChatLeadId)" style="display:none;" data-tooltip="Отправить сообщение в VK">📤 Отправить в VK</button>
                            <button id="btnSendHistoryOnly" class="btn-link-muted" aria-label="Только в историю" onclick="submitChatInput(currentChatLeadId)" style="display:none;">только в историю</button>
                        </div>
```

- [ ] **Step 2: Добавить CSS для `.btn-link-muted`**

В блоке `<style>` найти любое существующее правило для `.btn` и добавить рядом (например после `.btn-outline`):

```css
        .btn-link-muted { background: none; border: none; color: var(--muted); font-size: 11px; cursor: pointer; padding: 2px 4px; text-decoration: underline; text-underline-offset: 2px; white-space: nowrap; flex-shrink: 0; }
        .btn-link-muted:hover { color: var(--text); }
```

- [ ] **Step 3: Добавить `primarySendAction()` и `updateSendButtons()` перед `submitChatInput()` (~строка 3333)**

Вставить перед строкой `function submitChatInput(leadId)`:

```js
        function primarySendAction(leadId) {
            const lead = leads.find(function(l) { return String(l.id) === String(leadId); });
            if (lead && lead.vkPeerId && chatInputTab === 'manager') {
                sendToVk(leadId);
            } else {
                submitChatInput(leadId);
            }
        }

        function updateSendButtons(lead) {
            const btnHistory     = document.getElementById('btnSendHistory');
            const btnVk          = document.getElementById('btnSendVk');
            const btnHistoryOnly = document.getElementById('btnSendHistoryOnly');
            if (!btnHistory || !btnVk || !btnHistoryOnly) return;
            const isVkLead = lead && lead.vkPeerId && chatInputTab === 'manager';
            btnHistory.style.display     = isVkLead ? 'none' : '';
            btnVk.style.display          = isVkLead ? ''     : 'none';
            btnHistoryOnly.style.display = isVkLead ? ''     : 'none';
        }
```

- [ ] **Step 4: Вызвать `updateSendButtons()` из `renderChatView()` (~строка 1998)**

Найти конец `renderChatView()`:
```js
            if (chatInput) chatInput.value = '';
        }
```
Заменить на:
```js
            if (chatInput) chatInput.value = '';
            updateSendButtons(lead);
        }
```

- [ ] **Step 5: Вызвать `updateSendButtons()` из `setChatInputTab()` (~строка 3438–3442)**

Найти блок в `setChatInputTab()`:
```js
            const btnVk2 = document.getElementById('btnSendVk');
            if (btnVk2) {
                const activeLead = leads.find(function(l) { return String(l.id) === currentChatLeadId; });
                btnVk2.style.display = (tab === 'manager' && activeLead && activeLead.vkPeerId) ? '' : 'none';
            }
```
Заменить на:
```js
            const activeLead = leads.find(function(l) { return String(l.id) === currentChatLeadId; });
            updateSendButtons(activeLead || null);
```

- [ ] **Step 6: Вызвать `updateSendButtons()` из `saveVkPeerId()` (~строка 5017–5022)**

Найти:
```js
            const btn = document.getElementById('btnSendVk');
            if (btn) {
                btn.style.display = (lead.vkPeerId) ? '' : 'none';
            }
```
Заменить на:
```js
            updateSendButtons(lead);
```

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "feat(vk): умная кнопка — primary action отправляет в VK когда есть peer_id"
```

---

## Task 3: Уведомление о входящем VK-сообщении

**Files:**
- Modify: `index.html` — `subscribeToLeads()` (~строка 2267–2274), CSS

- [ ] **Step 1: Добавить CSS для `.li-vk-incoming`**

В блоке `<style>` добавить после существующего `.has-reply`:

```css
        @keyframes vkIncomingPulse {
            0%   { box-shadow: 0 0 0 0 rgba(29,161,242,.5); }
            70%  { box-shadow: 0 0 0 6px rgba(29,161,242,0); }
            100% { box-shadow: 0 0 0 0 rgba(29,161,242,0); }
        }
        .li-vk-incoming {
            animation: vkIncomingPulse 1s ease-out 2;
            border-color: rgba(29,161,242,.4) !important;
        }
```

- [ ] **Step 2: Обновить UPDATE-обработчик в `subscribeToLeads()` (~строка 2267)**

Найти блок:
```js
                    } else if (ev === 'UPDATE') {
                        const idx = leads.findIndex(function(l) { return String(l.id) === String(newRow.id); });
                        if (idx !== -1) { leads[idx] = rowToLead(newRow); saveDB(); }
```

Заменить на:
```js
                    } else if (ev === 'UPDATE') {
                        const idx = leads.findIndex(function(l) { return String(l.id) === String(newRow.id); });
                        if (idx !== -1) {
                            const oldLead = leads[idx];
                            const updLead = rowToLead(newRow);
                            leads[idx] = updLead;
                            saveDB();
                            // VK incoming notification
                            const oldLen = (oldLead.messages || []).length;
                            const newMsgs = updLead.messages || [];
                            const lastNew = newMsgs[newMsgs.length - 1];
                            const isVkIncoming = newMsgs.length > oldLen
                                && lastNew && lastNew.fromClient
                                && updLead.vkPeerId
                                && String(updLead.id) !== String(currentChatLeadId);
                            if (isVkIncoming) {
                                showToast('📨 Новое от VK: ' + (updLead.name || 'Лид'), 6000);
                                // Pulse the sidebar item
                                const el = document.querySelector('[data-lead-id="' + String(updLead.id) + '"]');
                                if (el) {
                                    el.classList.add('li-vk-incoming');
                                    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                                    setTimeout(function() { el.classList.remove('li-vk-incoming'); }, 2200);
                                }
                            }
                        }
```

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(vk): toast + pulse при входящем VK-сообщении через realtime"
```

---

## Task 4: VK-статусные бейджи

**Files:**
- Modify: `index.html` — CSS, `renderChatHeader()`, `renderTgLeadItem()`, `renderSingleMessage()`
- Modify: `supabase/functions/vk-send/index.ts` (~строка 108)

- [ ] **Step 1: Добавить CSS для `.vk-badge` и `.msg-vk-tick`**

В блоке `<style>` добавить:

```css
        .vk-badge { display:inline-flex; align-items:center; gap:3px; background:rgba(29,161,242,.12); border:1px solid rgba(29,161,242,.3); color:#1da1f2; border-radius:4px; padding:2px 7px; font-size:11px; font-weight:600; flex-shrink:0; }
        .msg-vk-tick { font-size:10px; color:#1da1f2; opacity:.7; margin-left:5px; white-space:nowrap; }
```

- [ ] **Step 2: Добавить VK-бейдж в `renderChatHeader()` (~строка 2037)**

Найти строку в `renderChatHeader()`:
```js
                '<div style="flex-shrink:0;">' + getPlatformBadge(lead.link, lead.name) + '</div>' +
```
Добавить после неё (не заменять, добавить строку):
```js
                (lead.vkPeerId ? '<span class="vk-badge" title="VK peer_id: ' + Number(lead.vkPeerId) + '">VK ✓</span>' : '') +
```

- [ ] **Step 3: Добавить VK-иконку в `renderTgLeadItem()` (~строка 1722)**

Найти блок:
```js
            // Optional biz pill
            const bizPill = lead.bizType
                ? '<span class="li-biz">' + escapeHtml(lead.bizType.slice(0, 14)) + '</span>'
                : '';
```
Заменить на:
```js
            // Optional biz pill
            const vkPill = lead.vkPeerId
                ? '<span style="font-size:10px;font-weight:700;color:#1da1f2;margin-right:2px;">VK</span>'
                : '';
            const bizPill = lead.bizType
                ? '<span class="li-biz">' + escapeHtml(lead.bizType.slice(0, 14)) + '</span>'
                : '';
```
Затем найти строку где используется `bizPill`:
```js
                        '<span class="li-meta">' + bizPill + metaRight + '</span>' +
```
Заменить на:
```js
                        '<span class="li-meta">' + vkPill + bizPill + metaRight + '</span>' +
```

- [ ] **Step 4: Добавить `→ VK` в `renderSingleMessage()` (~строка 4026)**

Найти строку:
```js
            const bubbleHtml = '<div class="msg-bubble ' + side + '">' + escapeHtml(m.text) + '</div>';
```
Заменить на:
```js
            const vkTick = (!m.fromClient && m.vk_sent) ? '<span class="msg-vk-tick">→ VK</span>' : '';
            const bubbleHtml = '<div class="msg-bubble ' + side + '">' + escapeHtml(m.text) + vkTick + '</div>';
```

- [ ] **Step 5: Добавить `vk_sent: true` в `vk-send/index.ts` (~строка 108)**

В файле `supabase/functions/vk-send/index.ts` найти:
```ts
  const newMsg = {
    id:         crypto.randomUUID(),
    text:       message,
    date:       Date.now(),
    fromClient: false
  }
```
Заменить на:
```ts
  const newMsg = {
    id:         crypto.randomUUID(),
    text:       message,
    date:       Date.now(),
    fromClient: false,
    vk_sent:    true
  }
```

- [ ] **Step 6: Задеплоить обновлённую Edge Function**

```bash
npx supabase functions deploy vk-send --no-verify-jwt
```
Ожидаемый вывод: `Deployed Function vk-send`

- [ ] **Step 7: Commit**

```bash
git add index.html supabase/functions/vk-send/index.ts
git commit -m "feat(vk): бейджи VK ✓ в чате, карточке и → VK на отправленных сообщениях"
```

---

## Финальная проверка

- [ ] Добавить лид со ссылкой `vk.com/id123456` → проверить что `vkPeerId` = `123456` автоматически, кнопка «📤 Отправить в VK» появляется в таблетке «Я написал»
- [ ] Переключить таб «← Клиент ответил» → кнопка меняется обратно на «Отправить»
- [ ] Отправить сообщение через «📤 Отправить в VK» → появляется «→ VK» на сообщении
- [ ] Проверить бейдж «VK ✓» в шапке чата и «VK» на карточке в сайдбаре
- [ ] Имитировать входящее сообщение: обновить лид в Supabase → проверить toast и анимацию

- [ ] **Final commit**

```bash
git add -A
git commit -m "feat(vk): полная VK UX интеграция — авто-ID, умная кнопка, уведомления, бейджи"
git push origin main
```
