# Mobile UX + Icons + Roadmap Items Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix iPhone Safari keyboard UX (input stays above keyboard), replace emoji with Lucide SVG icons throughout, fix 2 PlaybookBar gaps, add open-profile button, fast URL add, and AI icebreaker personalization.

**Architecture:** Single-file Vanilla JS app (`index.html`, 6561 lines). All changes in one file. No build step. Icon approach: inline SVG constants in a `var ICON = {}` object — no CDN, works offline.

**Tech Stack:** Vanilla JS, CSS Custom Properties, Supabase JS SDK v2, `window.visualViewport` API (iOS 13+).

---

## File Map

- Modify only: `index.html`
  - CSS `<style>` block (~lines 100–1238)
  - HTML body (static elements for sidebar, tab bar, back button)
  - JS `<script>` block (~lines 1776–6300)

---

## Task 1: ICON constants + CSS status dots + replace emoji in static HTML

**Goal:** Define `var ICON` object, CSS `.status-dot`, update tab bar HTML, back button HTML, and statuses labels. No behavior changes.

**Files:**
- Modify: `index.html` — CSS block, `statuses` object (~line 2485), `openMobileMoreSheet` (~line 6149), tab bar HTML (~line 6307), back button HTML (~line 1491)

- [ ] **Step 1: Add `var ICON` constant object**

Find the line (search for `let _appInitializing`  ~line 1776). Insert **before** that line:

```javascript
        var ICON = {
            plus:           '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
            settings:       '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
            archive:        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>',
            'file-text':    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
            'refresh-cw':   '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
            'chevron-left': '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>',
            'external-link':'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',
            sun:            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>',
            moon:           '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
            'message-circle':'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
            'layout-list':  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="6" height="6"/><rect x="3" y="13" width="6" height="6"/><line x1="13" y1="6" x2="21" y2="6"/><line x1="13" y1="10" x2="21" y2="10"/><line x1="13" y1="14" x2="21" y2="14"/><line x1="13" y1="18" x2="21" y2="18"/></svg>',
            'book-open':    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
            'more-horizontal':'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>',
            'user-plus':    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>',
        };
```

- [ ] **Step 2: Add `.status-dot` CSS**

Inside `<style>` block, before the closing `</style>` tag (before `@keyframes qaSlideIn` ~line 1234):

```css
        .status-dot {
            display: inline-block;
            width: 8px; height: 8px;
            border-radius: 50%;
            flex-shrink: 0;
            vertical-align: middle;
        }
        .status-dot.status-0 { background: var(--muted); }
        .status-dot.status-1 { background: #3B82F6; }
        .status-dot.status-2 { background: #F59E0B; }
        .status-dot.status-3 { background: #22C55E; }
        .status-dot.status-4 { background: #EF4444; }
        .icon-btn {
            display: inline-flex; align-items: center; justify-content: center;
            background: none; border: none; cursor: pointer;
            color: var(--muted); border-radius: 6px;
            transition: color .15s, background .15s;
        }
        .icon-btn:hover { color: var(--text); background: var(--bg3); }
```

- [ ] **Step 3: Update `statuses` object — strip emoji from labels**

Find lines ~2485–2491:
```javascript
        const statuses = {
            0: { label: "⚪️ Новый", class: "status-0" },
            1: { label: "🔵 Отправлен ледокол", class: "status-1" },
            2: { label: "🟠 В диалоге", class: "status-2" },
            3: { label: "🟢 УСПЕХ (Сделка)", class: "status-3" },
            4: { label: "🔴 Отказ / Игнор", class: "status-4" }
        };
```

Replace with:
```javascript
        const statuses = {
            0: { label: "Новый", class: "status-0" },
            1: { label: "Отправлен ледокол", class: "status-1" },
            2: { label: "В диалоге", class: "status-2" },
            3: { label: "УСПЕХ (Сделка)", class: "status-3" },
            4: { label: "Отказ / Игнор", class: "status-4" }
        };
```

- [ ] **Step 4: Update cmd palette — use ICON + status-dot**

Find `renderCmdPalette` items (~line 5656). Replace the 5 cmd item definitions:

```javascript
                    { type:'cmd', key:'new',      icon:'➕', label:'Добавить лид',       sub:'/new',      disabled:false },
                    { type:'cmd', key:'status',   icon:'🔄', label:'Сменить статус лида', sub:'/status',   disabled:!hasCurrent },
                    { type:'cmd', key:'archive',  icon:'🗃️', label:'Архивировать лид',   sub:'/archive',  disabled:!hasCurrent },
                    { type:'cmd', key:'settings', icon:'⚙️', label:'Настройки',           sub:'/settings', disabled:false },
                    { type:'cmd', key:'scripts',  icon:'📋', label:'Редактор скриптов',   sub:'/scripts',  disabled:false },
```

Replace with:
```javascript
                    { type:'cmd', key:'new',      icon:ICON.plus,            label:'Добавить лид',       sub:'/new',      disabled:false },
                    { type:'cmd', key:'status',   icon:ICON['refresh-cw'],   label:'Сменить статус лида', sub:'/status',   disabled:!hasCurrent },
                    { type:'cmd', key:'archive',  icon:ICON.archive,         label:'Архивировать лид',   sub:'/archive',  disabled:!hasCurrent },
                    { type:'cmd', key:'settings', icon:ICON.settings,        label:'Настройки',           sub:'/settings', disabled:false },
                    { type:'cmd', key:'scripts',  icon:ICON['file-text'],    label:'Редактор скриптов',   sub:'/scripts',  disabled:false },
```

- [ ] **Step 5: Update cmd palette lead row — use status-dot instead of colored emoji**

Find inside `renderCmdPalette` (~line 5685):
```javascript
                    const icon = ['⚪️','🔵','🟠','🟢','🔴'][l.status] || '⚪️';
```

Replace with:
```javascript
                    const icon = '<span class="status-dot status-' + (l.status || 0) + '"></span>';
```

- [ ] **Step 6: Update mobile back button in static HTML**

Find (~line 1491–1495):
```html
                <button id="mobileChatBack" style="display:none;"
                        onclick="closeMobileChat()"
                        aria-label="Назад к списку лидов">
                  <span aria-hidden="true">←</span>
                  <span class="mob-back-label">Назад</span>
                </button>
```

Replace with:
```html
                <button id="mobileChatBack" style="display:none;"
                        onclick="closeMobileChat()"
                        aria-label="Назад к списку лидов">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
                  <span class="mob-back-label">Назад</span>
                </button>
```

- [ ] **Step 7: Update mobile tab bar icons**

Find the tab bar buttons (~lines 6313–6360). Replace each emoji span:

Replace `<span style="font-size:20px;" aria-hidden="true">💬</span>` with:
```html
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
```

Replace `<span style="font-size:20px;" aria-hidden="true">📊</span>` with:
```html
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="6" height="6"/><rect x="3" y="13" width="6" height="6"/><line x1="13" y1="6" x2="21" y2="6"/><line x1="13" y1="10" x2="21" y2="10"/><line x1="13" y1="14" x2="21" y2="14"/><line x1="13" y1="18" x2="21" y2="18"/></svg>
```

Replace `<span style="font-size:20px;" aria-hidden="true">📜</span>` with:
```html
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
```

Find the "Ещё" tab button (search for `mobileMoreSheet` or `openMobileMoreSheet`). Replace its emoji icon similarly with the `more-horizontal` SVG (same viewBox).

- [ ] **Step 8: Update theme icon in `openMobileMoreSheet`**

Find (~line 6149–6153):
```javascript
            var icon  = document.getElementById('mobileThemeIcon');
            var label = document.getElementById('mobileThemeLabel');
            if (icon)  icon.textContent  = isDark ? '☀️' : '🌙';
            if (label) label.textContent = isDark ? 'Светлая тема' : 'Тёмная тема';
```

Replace with:
```javascript
            var icon  = document.getElementById('mobileThemeIcon');
            var label = document.getElementById('mobileThemeLabel');
            if (icon)  icon.innerHTML   = isDark ? ICON.sun : ICON.moon;
            if (label) label.textContent = isDark ? 'Светлая тема' : 'Тёмная тема';
```

- [ ] **Step 9: Replace funnel hero empty emoji**

Find (~line 2284):
```javascript
                    '<div class="funnel-hero-empty-icon">📭</div>' +
```

Replace with:
```javascript
                    '<div class="funnel-hero-empty-icon"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="opacity:.35"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 8.91a16 16 0 0 0 6 6l.81-.81a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg></div>' +
```

- [ ] **Step 10: Update `#archiveToggleBtn` — replace 🗃️ emoji**

Find (~line 1484):
```html
                    aria-label="Показать или скрыть архив лидов">🗃️ Архив</button>
```

Replace with:
```html
                    aria-label="Показать или скрыть архив лидов"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:middle;margin-right:4px;"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg> Архив</button>
```

- [ ] **Step 11: Verify in browser**

Open app → open cmd palette (Ctrl+K) → should see SVG icons instead of emoji for all 5 commands. Lead rows should show colored dots. Tab bar should show SVG icons. Back button should show chevron.

- [ ] **Step 12: Commit**

```bash
git add index.html
git commit -m "feat(icons): replace emoji with Lucide SVG icons — cmd palette, tab bar, status dots"
```

---

## Task 2: Fix mobile keyboard (visualViewport → CSS vars)

**Goal:** When iPhone Safari keyboard opens, chat input stays visible above the keyboard.

**Files:**
- Modify: `index.html` — `setupMobileKeyboard()` (~line 6216), CSS block (~line 862)

- [ ] **Step 1: Replace `setupMobileKeyboard()` with enhanced version**

Find (~lines 6216–6231):
```javascript
        function setupMobileKeyboard() {
            if (!window.visualViewport) return;
            var tabBar = document.getElementById('mobileTabBar');
            window.visualViewport.addEventListener('resize', function() {
                var keyboardH = window.innerHeight - window.visualViewport.height;
                if (tabBar) {
                    tabBar.style.transform = keyboardH > 50
                        ? 'translateY(-' + keyboardH + 'px)'
                        : '';
                }
                if (_mobileView === 'chat') {
                    var feed = document.getElementById('chatFeedMain');
                    if (feed) setTimeout(function() { feed.scrollTop = feed.scrollHeight; }, 50);
                }
            });
        }
```

Replace with:
```javascript
        function setupMobileKeyboard() {
            if (!window.visualViewport) return;
            var tabBar = document.getElementById('mobileTabBar');
            function onVVChange() {
                var vvh = window.visualViewport.height;
                var kbH = Math.max(0, window.innerHeight - vvh - window.visualViewport.offsetTop);
                document.documentElement.style.setProperty('--vvh', vvh + 'px');
                document.documentElement.style.setProperty('--keyboard-height', kbH + 'px');
                if (tabBar) tabBar.style.display = kbH > 80 ? 'none' : '';
                if (kbH > 80 && _mobileView === 'chat') {
                    var feed = document.getElementById('chatFeedMain');
                    if (feed) setTimeout(function() { feed.scrollTop = feed.scrollHeight; }, 60);
                }
            }
            window.visualViewport.addEventListener('resize', onVVChange);
            window.visualViewport.addEventListener('scroll', onVVChange);
            onVVChange();
        }
```

- [ ] **Step 2: Update mobile CSS — use `--vvh` for `#tg-view` height**

Find inside `@media (max-width: 768px)` block (~line 870):
```css
            #tg-view {
                display: flex !important;
                flex-direction: row;
                height: calc(100dvh - 60px);
                overflow: hidden;
            }
```

Replace with:
```css
            #tg-view {
                display: flex !important;
                flex-direction: row;
                height: calc(var(--vvh, 100dvh) - 60px);
                overflow: hidden;
            }
```

- [ ] **Step 3: Add `padding-bottom` to `.chat-input-area` in mobile CSS**

Find inside `@media (max-width: 768px)` (~line 926):
```css
            /* Input area */
            .chat-input-area {
                position: relative;
                z-index: 10;
                background: var(--bg2);
                border-top: 1px solid var(--line);
            }
```

Replace with:
```css
            /* Input area */
            .chat-input-area {
                position: relative;
                z-index: 10;
                background: var(--bg2);
                border-top: 1px solid var(--line);
                padding-bottom: var(--keyboard-height, env(safe-area-inset-bottom, 0px));
                transition: padding-bottom 0.15s ease;
            }
```

- [ ] **Step 4: Update modal `max-height` to use `--vvh`**

Find inside `@media (max-width: 768px)` (~line 972):
```css
            /* Modals full width */
            .modal {
                width: calc(100vw - 24px) !important;
                max-height: 88vh !important;
            }
```

Replace with:
```css
            /* Modals full width */
            .modal {
                width: calc(100vw - 24px) !important;
                max-height: min(88dvh, calc(var(--vvh, 100dvh) - 20px)) !important;
            }
```

- [ ] **Step 5: Verify on iPhone Safari (or DevTools mobile emulator)**

Test flow:
1. Open the app → navigate to a chat
2. Tap the textarea → keyboard appears
3. The textarea should be visible above the keyboard, not hidden behind it
4. The tab bar should disappear while keyboard is open
5. Feed should auto-scroll to latest message
6. Dismiss keyboard → tab bar reappears, layout restores

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "fix(mobile): visualViewport keyboard fix — input stays above keyboard on iOS Safari"
```

---

## Task 3: PlaybookBar minor gaps

**Files:**
- Modify: `index.html` — `exitPlaybook` (~line 4783), `advancePlaybookStep` (~line 4763)

- [ ] **Step 1: Fix `exitPlaybook` — clear `remindAt`**

Find in `exitPlaybook` function (~line 4783–4791):
```javascript
        async function exitPlaybook(leadId) {
            const lead = leads.find(function(l) { return String(l.id) === String(leadId); });
            if (!lead) return;
            lead.playbookStep = null;
            lead.updatedAt = Date.now();
```

Replace with:
```javascript
        async function exitPlaybook(leadId) {
            const lead = leads.find(function(l) { return String(l.id) === String(leadId); });
            if (!lead) return;
            lead.playbookStep = null;
            lead.remindAt = null;
            lead.updatedAt = Date.now();
```

- [ ] **Step 2: Fix `advancePlaybookStep` — update TG sidebar**

Find (~line 4778–4781):
```javascript
            lead.updatedAt = Date.now();
            upsertLead(lead);
            if (String(currentChatLeadId) === String(lead.id)) renderChatHeader(lead);
        }
```

Replace with:
```javascript
            lead.updatedAt = Date.now();
            upsertLead(lead);
            if (String(currentChatLeadId) === String(lead.id)) renderChatHeader(lead);
            updateTgSidebarItem(lead.id);
        }
```

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "fix(playbook): exitPlaybook clears remindAt, advancePlaybookStep updates sidebar"
```

---

## Task 4: Open profile button — icon-only

**Goal:** Replace the text "Открыть" button in chat header with a clean icon-only link.

**Files:**
- Modify: `index.html` — `renderChatHeader` (~line 2479), CSS block

**Background:** `renderChatHeader` already renders an open link at line 2479:
```javascript
(lead.link ? '<a href="' + escapeHtml(sanitizeUrl(lead.link)) + '" target="_blank" rel="noopener noreferrer" class="btn btn-outline" style="flex-shrink:0;padding:6px 10px;font-size:12px;text-decoration:none;" aria-label="Открыть профиль лида" data-tooltip="Открыть VK / TG / IG">' + getPlatformIcon(lead.link) + ' Открыть</a>' : '')
```

We replace it with a compact icon-only version.

- [ ] **Step 1: Add `.chat-profile-link` CSS**

In `<style>` block before the closing `</style>` tag:
```css
        .chat-profile-link {
            display: inline-flex; align-items: center; justify-content: center;
            width: 32px; height: 32px; min-width: 32px;
            color: var(--muted);
            border-radius: 6px;
            border: 1px solid var(--line);
            transition: color .15s, background .15s;
            flex-shrink: 0;
            text-decoration: none;
        }
        .chat-profile-link:hover { color: var(--text); background: var(--bg3); }
        @media (max-width: 768px) {
            .chat-profile-link { width: 44px; height: 44px; min-width: 44px; }
        }
```

- [ ] **Step 2: Replace the link in `renderChatHeader`**

Find (~line 2479):
```javascript
                (lead.link ? '<a href="' + escapeHtml(sanitizeUrl(lead.link)) + '" target="_blank" rel="noopener noreferrer" class="btn btn-outline" style="flex-shrink:0;padding:6px 10px;font-size:12px;text-decoration:none;" aria-label="Открыть профиль лида" data-tooltip="Открыть VK / TG / IG">' + getPlatformIcon(lead.link) + ' Открыть</a>' : '') +
```

Replace with:
```javascript
                (lead.link ? '<a href="' + escapeHtml(sanitizeUrl(lead.link)) + '" target="_blank" rel="noopener noreferrer" class="chat-profile-link" aria-label="Открыть профиль лида в новой вкладке" title="Открыть профиль">' + ICON['external-link'] + '</a>' : '') +
```

- [ ] **Step 3: Verify**

Open a lead with a link → chat header should show a small icon button (external-link SVG). Click it → opens VK/Inst/TG in new tab.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(chat): replace Открыть text link with icon-only external-link button"
```

---

## Task 5: Fast URL add

**Goal:** Paste a URL into sidebar search → show "Добавить как лид?" inline suggestion.

**Files:**
- Modify: `index.html` — sidebar HTML (~line 1480), `<style>`, JS (new functions + event listener)

- [ ] **Step 1: Add suggestion container in HTML**

Find the sidebar search area (~line 1479):
```html
            </div>
            <div id="tgLeadList" role="list" aria-label="Список диалогов"></div>
```

Replace with:
```html
            </div>
            <div id="fastAddSuggestion" style="display:none;padding:6px 10px;background:rgba(200,144,42,.08);border-bottom:1px solid rgba(200,144,42,.2);" role="status" aria-live="polite">
                <div style="font-size:11px;color:var(--muted);margin-bottom:4px;">Добавить как лид?</div>
                <div style="font-size:12px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:6px;" id="fastAddUrlPreview"></div>
                <div style="display:flex;gap:6px;">
                    <button onclick="quickAddLead(_fastAddUrl)" style="flex:1;padding:5px 10px;background:var(--primary);border:none;border-radius:5px;color:#fff;font-size:12px;cursor:pointer;font-family:inherit;">Добавить</button>
                    <button onclick="hideFastAddSuggestion()" style="padding:5px 10px;background:none;border:1px solid var(--line);border-radius:5px;color:var(--muted);font-size:12px;cursor:pointer;font-family:inherit;">Отмена</button>
                </div>
            </div>
            <div id="tgLeadList" role="list" aria-label="Список диалогов"></div>
```

- [ ] **Step 2: Add `_fastAddUrl` global and helper functions**

Find `var ICON =` (the line you added in Task 1). Insert **after** the closing `};` of the ICON object:

```javascript
        var _fastAddUrl = '';

        function extractNameFromUrl(url) {
            try {
                var u = new URL(url.indexOf('://') === -1 ? 'https://' + url : url);
                var parts = u.pathname.replace(/^\//, '').split('/');
                return (parts[0] || u.hostname).replace(/_/g, ' ').slice(0, 60);
            } catch(e) { return url.slice(0, 60); }
        }

        function showFastAddSuggestion(url) {
            _fastAddUrl = url;
            var el = document.getElementById('fastAddSuggestion');
            var preview = document.getElementById('fastAddUrlPreview');
            if (!el) return;
            if (preview) preview.textContent = url.replace(/^https?:\/\//, '').slice(0, 60);
            el.style.display = '';
        }

        function hideFastAddSuggestion() {
            _fastAddUrl = '';
            var el = document.getElementById('fastAddSuggestion');
            if (el) el.style.display = 'none';
            var input = document.getElementById('tgSearchInput');
            if (input && /^https?:\/\/|vk\.com|instagram\.com|t\.me/.test(input.value)) {
                input.value = '';
                debouncedFilterTgSidebar('');
            }
        }

        async function quickAddLead(url) {
            if (!url) return;
            var normalized = normalizeUrl(url);
            var name = extractNameFromUrl(url);
            var newLead = {
                name:       name,
                link:       normalized,
                contact:    '',
                bizType:    '',
                status:     0,
                notes:      '',
                messages:   [],
                sentCount:  0,
            };
            hideFastAddSuggestion();
            await upsertLead(newLead);
            showToast('Лид добавлен: ' + name, 2500);
        }
```

- [ ] **Step 3: Wire up search input event listener**

Find the search input oninput handler. It currently uses `oninput="debouncedFilterTgSidebar(this.value)"` as an attribute. We need to also check for URL pattern. The cleanest way: enhance `debouncedFilterTgSidebar` call site.

Find in the `<script>` block the function where search filtering happens. Search for `debouncedFilterTgSidebar`. Find where it's defined (~search for `function debouncedFilterTgSidebar`).

Actually, the attribute `oninput="debouncedFilterTgSidebar(this.value)"` at line 1477 already handles filtering. Add a second inline action — change to:

```html
                <input type="text" class="tg-search-input" id="tgSearchInput"
                    placeholder="Поиск..." oninput="debouncedFilterTgSidebar(this.value);checkFastAdd(this.value)"
                    aria-label="Поиск по диалогам">
```

Then add `checkFastAdd` function alongside the other fast-add functions (same location as Step 2):

```javascript
        function checkFastAdd(val) {
            val = (val || '').trim();
            if (/^https?:\/\/|^vk\.com|^instagram\.com|^t\.me/.test(val)) {
                showFastAddSuggestion(val);
            } else {
                hideFastAddSuggestion();
            }
        }
```

- [ ] **Step 4: Verify**

1. Open the TG sidebar
2. Paste `https://vk.com/cafe_example` into the search box
3. A yellow suggestion strip should appear below the search with "Добавить как лид?" prompt
4. Click "Добавить" → toast "Лид добавлен: cafe example" → suggestion disappears → new lead appears in list
5. Click "Отмена" → suggestion and URL disappear from search

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat(leads): fast URL add — paste link in search → Добавить как лид suggestion"
```

---

## Task 6: AI icebreaker personalization

**Goal:** When generating a first icebreaker, ask Gemini to describe the business based on URL + name, then inject that context into the icebreaker prompt.

**Files:**
- Modify: `index.html` — `generateManagerSuggestion` (~line 3986), add `fetchLeadContext` function

- [ ] **Step 1: Add `fetchLeadContext` function**

Find `async function generateManagerSuggestion` (~line 3986). Insert **before** it:

```javascript
        async function fetchLeadContext(lead) {
            if (!lead || !lead.link) return '';
            var safeName = (lead.name || '').slice(0, 80).replace(/[\r\n]/g, ' ');
            var safeBiz  = (lead.bizType || '').slice(0, 60).replace(/[\r\n]/g, ' ');
            var safeLink = (lead.link || '').slice(0, 120);
            var prompt = 'Ссылка: ' + safeLink + '\n' +
                'Название: ' + safeName + '\n' +
                (safeBiz ? 'Сегмент: ' + safeBiz + '\n' : '') +
                'Напиши 1 короткое предложение — что это за заведение/бизнес и чем оно уникально или интересно для видеосъёмки. ' +
                'Если не знаешь ничего конкретного — верни пустую строку. Только факт, без воды.';
            try {
                var ctx = await callGeminiAI(prompt, { maxTokens: 80, temperature: 0.2 });
                return ctx ? ctx.trim().slice(0, 200) : '';
            } catch(e) { return ''; }
        }
```

- [ ] **Step 2: Inject context into icebreaker prompt (mode A)**

Find inside `generateManagerSuggestion`, the mode A block (~line 3999–4017):

```javascript
            if (!msgs.length) {
                // Режим А: новый лид — выбираем icebreaker А/Б/В
                const link    = (lead.link || '').toLowerCase();
                const bizInfo = (lead.bizType || '').toLowerCase();
                const safeName    = (lead.name    || '').slice(0, 100).replace(/[\r\n]/g, ' ');
                const safeBizType = (lead.bizType || 'бизнес').slice(0, 80).replace(/[\r\n]/g, ' ');
                const platformName = link.includes('vk.com') ? 'ВКонтакте' : link.includes('instagram.com') ? 'Instagram' : link.includes('t.me') ? 'Telegram' : 'ВКонтакте';

                // Определяем тип icebreaker по типу бизнеса
                const isCommercialBrand = /завод|производ|бренд|товар|магазин|опт|фабрик|завод/i.test(bizInfo);
                const hasEvent = /ивент|event|фестиваль|выставк|форум|конференц/i.test(bizInfo);
                const icebreakerType = hasEvent ? 'Б' : isCommercialBrand ? 'В' : 'А';
                trackIcebreakerUsed(lead.id, icebreakerType);

                prompt = 'Бизнес: ' + safeBizType + '\nНазвание: ' + safeName + '\nПлатформа: ' + platformName + '\n' +
                    'Рекомендуемый icebreaker: ' + icebreakerType + '\n\n' +
                    'Напиши первое холодное сообщение в сообщество ВКонтакте. ' +
                    'Адаптируй шаблон под конкретный бизнес, сохраняя структуру. ' +
                    'ТОЛЬКО текст сообщения, без кавычек, без заголовков, без пояснений.';
```

Replace with:
```javascript
            if (!msgs.length) {
                // Режим А: новый лид — выбираем icebreaker А/Б/В
                const link    = (lead.link || '').toLowerCase();
                const bizInfo = (lead.bizType || '').toLowerCase();
                const safeName    = (lead.name    || '').slice(0, 100).replace(/[\r\n]/g, ' ');
                const safeBizType = (lead.bizType || 'бизнес').slice(0, 80).replace(/[\r\n]/g, ' ');
                const platformName = link.includes('vk.com') ? 'ВКонтакте' : link.includes('instagram.com') ? 'Instagram' : link.includes('t.me') ? 'Telegram' : 'ВКонтакте';

                // Определяем тип icebreaker по типу бизнеса
                const isCommercialBrand = /завод|производ|бренд|товар|магазин|опт|фабрик|завод/i.test(bizInfo);
                const hasEvent = /ивент|event|фестиваль|выставк|форум|конференц/i.test(bizInfo);
                const icebreakerType = hasEvent ? 'Б' : isCommercialBrand ? 'В' : 'А';
                trackIcebreakerUsed(lead.id, icebreakerType);

                // Персонализация: спрашиваем Gemini о конкретном бизнесе (fire-and-forget с таймаутом)
                const leadCtx = await Promise.race([
                    fetchLeadContext(lead),
                    new Promise(function(res) { setTimeout(function() { res(''); }, 4000); })
                ]);

                prompt = 'Бизнес: ' + safeBizType + '\nНазвание: ' + safeName + '\nПлатформа: ' + platformName + '\n' +
                    (leadCtx ? 'Контекст о заведении: ' + leadCtx + '\n' : '') +
                    'Рекомендуемый icebreaker: ' + icebreakerType + '\n\n' +
                    'Напиши первое холодное сообщение в сообщество ВКонтакте. ' +
                    'Адаптируй шаблон под конкретный бизнес, сохраняя структуру. ' +
                    'ТОЛЬКО текст сообщения, без кавычек, без заголовков, без пояснений.';
```

- [ ] **Step 3: Verify**

1. Add a new lead with a VK/Instagram link (e.g. `vk.com/dominos_russia`)
2. Click "✨ ИИ-подсказка"
3. The spinner shows for 1-3 seconds (two Gemini calls: context + icebreaker)
4. Result appears in textarea — should reference something specific about the business
5. If lead has no link → icebreaker generates normally without context (no error)

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(ai): personalized icebreaker — Gemini describes business from URL before generating"
```

---

## Self-Review

### Spec coverage

| Spec requirement | Task |
|-----------------|------|
| Chat input above keyboard (iPhone Safari) | Task 2 ✓ |
| Modals don't overflow with keyboard open | Task 2 Step 4 ✓ |
| Replace emoji with Lucide SVG icons | Task 1 ✓ |
| PlaybookBar: exitPlaybook clears remindAt | Task 3 Step 1 ✓ |
| PlaybookBar: advancePlaybookStep updates sidebar | Task 3 Step 2 ✓ |
| Roadmap #16 — open profile button | Task 4 ✓ |
| Roadmap #19 — fast URL add | Task 5 ✓ |
| Roadmap #7 — AI personalization | Task 6 ✓ |

### Type/name consistency

- `ICON` object defined in Task 1, used in Tasks 1 and 4 — consistent ✓
- `_fastAddUrl` global defined in Task 5 Step 2, referenced in HTML from Task 5 Step 1 — consistent ✓
- `updateTgSidebarItem(lead.id)` — signature is `updateTgSidebarItem(leadId)` confirmed at line 2201 ✓
- `fetchLeadContext(lead)` defined in Task 6 Step 1, called in Task 6 Step 2 — consistent ✓
- `callGeminiAI` confirmed at line 4410 ✓
- `normalizeUrl` confirmed at line 2922 ✓
- `debouncedFilterTgSidebar` confirmed at line 1477 ✓
