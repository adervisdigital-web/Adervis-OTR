# TG-First Redesign + Objection Handler — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the TG-style two-column view the default main screen, add a 3-section sidebar (urgent / in-dialog / all), replace the empty right panel with a funnel hero, and add AI-powered objection detection that surfaces 2-3 counter-responses above the chat input.

**Architecture:** All changes are in one file (`index.html`). The existing `openTgView()` / `closeTgView()` functions become the switch mechanism. New JS functions are added inside the existing `<script>` block. New CSS classes are appended to the existing `<style>` block.

**Tech Stack:** Vanilla JS, CSS Custom Properties, Gemini 2.0 Flash API (existing key in `localStorage['adervis_gemini_key_v1']`), Supabase realtime (no schema changes).

**Spec:** `docs/superpowers/specs/2026-06-15-tg-first-redesign.md`

---

## File

Single file, all changes: `index.html`

Key line references (stable at plan-write time — verify before editing):
- Header HTML: ~line 638–663
- `#table-view` open tag: ~line 665
- `#tg-view` open tag: ~line 804
- `#tgEmpty` div: ~line 875–877
- Chat body area: ~line 821–870
- `openTgView()`: ~line 1270
- `renderTgSidebar()`: ~line 1218
- `renderTgLeadItem()`: ~line 1193
- `saveDB()`: ~line 1584
- `submitChatInput()`: ~line 2349
- `addMessageToLead()`: ~line 2811
- `appendMessageToFeed()`: ~line 2725
- `getGeminiKey()`: ~line 2529
- `initApp()`: ~line 3461

---

## Task 1: Default view + header restructure

Switch the app to open in TG-view by default. Restructure the header to add mode tabs and a `≡ Таблица` toggle button.

**Files:** `index.html`

- [ ] **Step 1: Add `toggleTableView()` function**

Find `function closeTgView()` (~line 1283). Add the new function immediately after `closeTgView()` (after its closing brace):

```js
function toggleTableView() {
    const tgView = document.getElementById('tg-view');
    if (tgView.style.display === 'flex') {
        closeTgView();
        document.getElementById('tableViewBtn').textContent = '← Диалоги';
    } else {
        openTgView(null);
        document.getElementById('tableViewBtn').textContent = '≡ Таблица';
    }
}
```

- [ ] **Step 2: Update `initApp()` to open TG view by default**

Find `initApp()` (~line 3461). The function ends with `subscribeToLeads();`. Add two lines after that call, still inside `initApp()`:

```js
    subscribeToLeads();
    openTgView(null);           // ← ADD: default to TG view
    renderTgSidebar(null);      // ← ADD: populate sidebar on load
```

- [ ] **Step 3: Restructure the header HTML**

Find the `<div class="header">` block (~line 638–663). Replace the entire block:

```html
<div class="header">
    <h1>ADERVIS | OTR</h1>

    <!-- Center: mode tabs -->
    <div class="header-mode-tabs" role="tablist">
        <button class="h-mode-tab active" id="modeTabDialogues" role="tab"
                aria-selected="true" onclick="openTgView(null); setModeTab('dialogues')">
            💬 Диалоги
        </button>
        <button class="h-mode-tab" id="modeTabScripts" role="tab"
                aria-selected="false" onclick="openSettingsModal(); setModeTab('scripts')">
            ⚙️ Скрипты
        </button>
    </div>

    <!-- Right: actions -->
    <div class="header-buttons">
        <button class="btn btn-outline" id="tableViewBtn" onclick="toggleTableView()"
                data-tooltip="Таблица лидов" aria-label="Переключить в таблицу">≡ Таблица</button>
        <div class="hdr-dropdown">
            <button class="btn btn-outline" onclick="toggleHeaderDropdown(event)"
                    aria-haspopup="true" aria-expanded="false" id="dataDropBtn"
                    data-tooltip="Экспорт и бэкап">📁 ▾</button>
            <div class="hdr-dropdown-menu" id="dataDropMenu" role="menu">
                <button class="hdr-dropdown-item" role="menuitem" onclick="exportCSV(); closeHeaderDropdown()">📊 Экспорт CSV</button>
                <div class="hdr-dropdown-divider"></div>
                <button class="hdr-dropdown-item" role="menuitem" onclick="exportBackup(); closeHeaderDropdown()">💾 Сохранить бэкап</button>
                <button class="hdr-dropdown-item" role="menuitem" onclick="triggerImportBackup(); closeHeaderDropdown()">📂 Восстановить из файла</button>
            </div>
        </div>
        <div id="userEmailBadge" style="display:flex;align-items:center;gap:5px;padding:4px 9px;border-radius:6px;border:1px solid var(--line);font-size:11px;color:var(--muted);flex-shrink:0;" aria-label="Текущий пользователь">
            <span aria-hidden="true">👤</span><span id="userEmailLabel"></span>
        </div>
        <button class="btn btn-outline" id="themeToggleBtn" onclick="toggleTheme()"
                data-tooltip="Переключить тему" aria-label="Переключить тему">🌙</button>
        <button class="btn btn-outline" onclick="openInfoModal()" aria-label="Справка" data-tooltip="Справка">ℹ️</button>
        <button class="btn btn-primary" onclick="openBulkModal()" aria-label="Добавить лиды">+ Лид</button>
        <button class="btn btn-outline" onclick="signOut()" aria-label="Выйти" style="font-size:12px;" data-tooltip="Выйти">↩</button>
        <input type="file" id="backupFileInput" accept="application/json" style="display:none"
               onchange="importBackupFile(this.files[0])">
    </div>
</div>
```

- [ ] **Step 4: Add `setModeTab()` helper function**

Find `function toggleTableView()` just added. Add after it:

```js
function setModeTab(tab) {
    const d = document.getElementById('modeTabDialogues');
    const s = document.getElementById('modeTabScripts');
    if (!d || !s) return;
    d.classList.toggle('active', tab === 'dialogues');
    s.classList.toggle('active', tab === 'scripts');
    d.setAttribute('aria-selected', String(tab === 'dialogues'));
    s.setAttribute('aria-selected', String(tab === 'scripts'));
}
```

- [ ] **Step 5: Verify in browser**

Open `index.html` in browser. Expected:
- App opens in TG-view (sidebar visible, table hidden)
- `≡ Таблица` button in header switches to table; clicking again (now labeled `← Диалоги`) returns to TG view
- `💬 Диалоги` and `⚙️ Скрипты` tabs visible in header center
- Logo, user badge, theme toggle, + Лид, ↩ all present

- [ ] **Step 6: Commit**

```
git add index.html
git commit -m "feat: TG-view as default, header mode tabs, toggleTableView"
```

---

## Task 2: CSS additions

Add all new CSS classes. No JS or HTML changes in this task.

**Files:** `index.html` — append inside `<style>` block, before the closing `</style>` tag (~line 614).

- [ ] **Step 1: Add CSS**

Locate the closing `</style>` tag (~line 614). Insert the following block just before it:

```css
/* ─── Header mode tabs ──────────────────────────────── */
.header-mode-tabs { display: flex; gap: 2px; }
.h-mode-tab {
    font-size: 12px; font-weight: 500; padding: 5px 12px;
    border-radius: 7px; border: 1px solid transparent;
    background: transparent; color: var(--muted); cursor: pointer;
    font-family: var(--font-ui); transition: background .12s, color .12s;
}
.h-mode-tab:hover { background: rgba(255,255,255,.05); color: var(--text); }
.h-mode-tab.active {
    background: rgba(124,58,237,.12); border-color: rgba(124,58,237,.28);
    color: var(--primary2); font-weight: 600;
}
:root[data-theme="light"] .h-mode-tab.active {
    background: rgba(124,58,237,.09); border-color: rgba(124,58,237,.3);
}

/* ─── Sidebar 3-section layout ──────────────────────── */
.sb-section-lbl {
    font-size: 9.5px; font-weight: 700; text-transform: uppercase;
    letter-spacing: .55px; color: var(--text-muted);
    padding: 10px 12px 4px; opacity: .7;
}
.lead-item {
    display: flex; align-items: center; gap: 9px;
    padding: 7px 12px 7px 14px;
    border-left: 2.5px solid transparent;
    cursor: pointer; transition: background .1s;
    text-decoration: none; color: inherit;
}
.lead-item:hover { background: rgba(255,255,255,.03); }
.lead-item.active {
    background: rgba(94,106,210,.10);
    border-left-color: #5e6ad2;
}
.lead-item.urgent {
    border-left-color: var(--danger);
    background: rgba(242,40,34,.04);
}
.lead-item.warm {
    border-left-color: var(--warning);
    background: rgba(246,189,58,.03);
}
.lead-item.new-lead { opacity: .52; }
.li-av {
    width: 32px; height: 32px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 10.5px; font-weight: 700; color: #fff; flex-shrink: 0;
    letter-spacing: -.3px;
}
.li-info { flex: 1; min-width: 0; }
.li-name {
    font-size: 12px; font-weight: 600; color: var(--text);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    margin-bottom: 1px;
}
.li-msg {
    font-size: 11px; color: var(--text-muted);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.li-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; flex-shrink: 0; }
.li-time { font-size: 9.5px; color: var(--text-muted); white-space: nowrap; }
.li-badge {
    font-size: 9.5px; padding: 1px 6px; border-radius: 99px; font-weight: 600;
}
.li-badge-hot   { background: rgba(242,40,34,.13);  color: var(--danger); }
.li-badge-reply { background: rgba(99,102,241,.13); color: #818cf8; }
.li-badge-sent  { background: rgba(255,255,255,.07); color: var(--text-muted); }
.li-badge-new   { background: rgba(255,255,255,.05); color: var(--text-muted); border: 1px solid var(--line-subtle); }
.li-badge-warn  { background: rgba(246,189,58,.12); color: var(--warning); }

/* ─── Funnel hero (empty right panel) ───────────────── */
.funnel-hero {
    flex: 1; display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    padding: 32px; gap: 0;
}
.funnel-hero-title {
    font-size: 10px; font-weight: 700; text-transform: uppercase;
    letter-spacing: .7px; color: var(--text-muted); margin-bottom: 20px;
}
.funnel-chart { display: flex; align-items: flex-end; gap: 10px; margin-bottom: 12px; }
.funnel-col { display: flex; flex-direction: column; align-items: center; gap: 3px; width: 56px; }
.funnel-bar { width: 56px; border-radius: 5px 5px 0 0; transition: height .3s ease; }
.funnel-col-count { font-size: 18px; font-weight: 700; line-height: 1; }
.funnel-col-name  { font-size: 10px; color: var(--text-muted); }
.funnel-col-pct   { font-size: 10px; color: var(--primary2); font-weight: 600; }
.funnel-arrow     { font-size: 20px; color: var(--line); align-self: center; margin-bottom: 28px; }
.funnel-hero-cta  { font-size: 11px; color: var(--text-muted); margin-top: 10px; }

/* ─── AI Objection Panel ─────────────────────────────── */
.objection-panel {
    border-top: 1px solid rgba(246,189,58,.28);
    background: rgba(246,189,58,.04);
    padding: 8px 12px 6px; flex-shrink: 0;
}
:root[data-theme="light"] .objection-panel {
    background: rgba(246,189,58,.06); border-top-color: rgba(246,189,58,.35);
}
.op-header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 6px;
}
.op-badge {
    font-size: 11px; font-weight: 600; color: var(--warning);
    display: flex; align-items: center; gap: 4px;
}
.op-loading { font-size: 11px; color: var(--text-muted); font-style: italic; }
.op-close {
    font-size: 12px; color: var(--text-muted); background: none; border: none;
    cursor: pointer; padding: 2px 5px; border-radius: 4px; font-family: var(--font-ui);
}
.op-close:hover { background: rgba(255,255,255,.08); color: var(--text); }
.op-suggestions { display: flex; flex-direction: column; gap: 4px; }
.op-sugg {
    background: var(--bg2); border: 1px solid var(--line);
    border-radius: 7px; padding: 6px 10px;
    font-size: 11px; color: var(--text); line-height: 1.5;
    cursor: pointer; transition: border-color .12s, background .12s;
    text-align: left; width: 100%; font-family: var(--font-ui);
}
.op-sugg:hover { border-color: rgba(246,189,58,.5); background: rgba(246,189,58,.05); }
.op-sugg:focus-visible { outline: 2px solid var(--warning); outline-offset: 2px; }
.op-sugg strong { display: block; font-size: 10px; color: var(--warning); margin-bottom: 2px; font-weight: 700; }

/* ─── Classify badge (inline in chat feed) ───────────── */
.classify-badge {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 2px 9px; border-radius: 99px;
    font-size: 10.5px; font-weight: 600; margin: 3px 0 4px;
}
.classify-badge.interest   { background: rgba(39,166,68,.1);  color: var(--success); border: 1px solid rgba(39,166,68,.2); }
.classify-badge.objection  { background: rgba(246,189,58,.1); color: var(--warning); border: 1px solid rgba(246,189,58,.2); }
.classify-badge.rejection  { background: rgba(242,40,34,.1);  color: var(--danger);  border: 1px solid rgba(242,40,34,.2); }
```

- [ ] **Step 2: Verify CSS loads without errors**

Open browser DevTools → Console. Confirm no CSS parse errors. Visually: layout unchanged (classes not yet used).

- [ ] **Step 3: Commit**

```
git add index.html
git commit -m "feat: CSS for sidebar sections, funnel hero, objection panel, classify badge"
```

---

## Task 3: Sidebar 3-section rewrite

Rewrite `renderTgSidebar()` and `renderTgLeadItem()` to produce three sections.

**Files:** `index.html`

- [ ] **Step 1: Add `isLeadUrgent()` and `getLeadAvatarStyle()` helpers**

Find `function renderTgLeadItem(` (~line 1193). Insert before it:

```js
function isLeadUrgent(lead) {
    const todayStr = new Date().toISOString().slice(0, 10);
    const stale = (lead.status === 1 || lead.status === 2) &&
        Math.floor((Date.now() - (lead.updatedAt || Date.now())) / 86400000) >= 2;
    const remind = lead.remindAt && lead.remindAt <= todayStr;
    return stale || remind;
}

function getLeadAvatarStyle(lead) {
    const link = (lead.link || '').toLowerCase();
    if (link.includes('vk.com'))        return 'background:linear-gradient(135deg,#7c3aed,#6366f1)';
    if (link.includes('instagram.com')) return 'background:linear-gradient(135deg,#d97706,#f59e0b)';
    if (link.includes('t.me'))          return 'background:linear-gradient(135deg,#2563eb,#6366f1)';
    return 'background:linear-gradient(135deg,#374151,#4b5563)';
}
```

- [ ] **Step 2: Rewrite `renderTgLeadItem()` (~line 1193)**

Replace the entire `function renderTgLeadItem(lead, isActive)` function (from its `function` keyword to its closing `}`) with:

```js
function renderTgLeadItem(lead, isActive, sectionCtx) {
    // sectionCtx: 'urgent' | 'dialog' | 'new'
    const name     = escapeHtml(lead.name || 'Без имени');
    const msgs     = lead.messages || [];
    const lastMsg  = msgs[msgs.length - 1];
    const lastText = lastMsg
        ? escapeHtml((lastMsg.text || '').slice(0, 52))
        : '<em>нет сообщений</em>';
    const lastTime = lastMsg ? formatRelativeTime(lastMsg.date) : '';
    const initials = (lead.name || '?').slice(0, 2).toUpperCase();
    const safeId   = escapeHtml(String(lead.id));
    const avStyle  = getLeadAvatarStyle(lead);

    let itemClass = 'lead-item';
    if (isActive)             itemClass += ' active';
    if (sectionCtx === 'urgent' && !isActive) {
        const todayStr = new Date().toISOString().slice(0, 10);
        const isStale  = (lead.status === 1 || lead.status === 2) &&
            Math.floor((Date.now() - (lead.updatedAt || Date.now())) / 86400000) >= 2;
        itemClass += isStale ? ' urgent' : ' warm';
    }
    if (sectionCtx === 'new') itemClass += ' new-lead';

    let badge = '';
    if (sectionCtx === 'urgent') {
        const todayStr = new Date().toISOString().slice(0, 10);
        const isStale  = (lead.status === 1 || lead.status === 2) &&
            Math.floor((Date.now() - (lead.updatedAt || Date.now())) / 86400000) >= 2;
        badge = isStale
            ? '<span class="li-badge li-badge-hot">просрочен</span>'
            : '<span class="li-badge li-badge-warn">напомн.</span>';
    } else if (lastMsg && lastMsg.fromClient) {
        badge = '<span class="li-badge li-badge-reply">ответил</span>';
    } else if (lastMsg && !lastMsg.fromClient) {
        badge = '<span class="li-badge li-badge-sent">ждём</span>';
    } else {
        badge = '<span class="li-badge li-badge-new">новый</span>';
    }

    const msgDisplay = sectionCtx === 'new'
        ? '<em style="color:var(--text-muted);font-style:italic">нет сообщений</em>'
        : (lastMsg && !lastMsg.fromClient ? '✍️ ' : '') + lastText;

    return '<div class="' + itemClass + '" role="listitem" tabindex="0"' +
        ' onclick="selectTgLead(\'' + safeId + '\')"' +
        ' onkeydown="if(event.key===\'Enter\'||event.key===\' \'){selectTgLead(\'' + safeId + '\');event.preventDefault();}"' +
        ' aria-label="' + name + '">' +
        '<div class="li-av" style="' + avStyle + '">' + initials + '</div>' +
        '<div class="li-info">' +
            '<div class="li-name">' + name + '</div>' +
            '<div class="li-msg">' + msgDisplay + '</div>' +
        '</div>' +
        '<div class="li-meta">' +
            '<span class="li-time">' + lastTime + '</span>' +
            badge +
        '</div>' +
        '</div>';
}
```

- [ ] **Step 3: Rewrite `renderTgSidebar()` (~line 1218)**

Replace the entire `function renderTgSidebar(selectId)` function with:

```js
function renderTgSidebar(selectId) {
    const list = document.getElementById('tgLeadList');
    if (!list) return;
    const query = ((document.getElementById('tgSearchInput') || {}).value || '').trim().toLowerCase();

    const filtered = query
        ? leads.filter(l => (l.name || '').toLowerCase().includes(query))
        : leads.slice();

    if (!filtered.length) {
        list.innerHTML = '<div class="tg-empty-sidebar">' +
            (query ? 'Ничего не найдено' : 'Нет лидов.<br>Нажмите <strong>+ Лид</strong> чтобы начать.') +
            '</div>';
        return;
    }

    const todayStr   = new Date().toISOString().slice(0, 10);
    const isActive   = id => String(id) === String(selectId);

    const urgent = filtered.filter(l => isLeadUrgent(l));
    const dialog = filtered.filter(l => !isLeadUrgent(l) && l.messages && l.messages.length > 0);
    const newLeads = filtered.filter(l => !isLeadUrgent(l) && (!l.messages || l.messages.length === 0));

    const sortByLastMsg = arr => arr.slice().sort((a, b) => {
        const ta = ((a.messages || []).slice(-1)[0] || {}).date || a.updatedAt || 0;
        const tb = ((b.messages || []).slice(-1)[0] || {}).date || b.updatedAt || 0;
        return Number(tb) - Number(ta);
    });

    let html = '';

    if (urgent.length) {
        html += '<div class="sb-section-lbl" aria-hidden="true">🔥 Требуют действия</div>';
        html += sortByLastMsg(urgent).map(l => renderTgLeadItem(l, isActive(l.id), 'urgent')).join('');
    }
    if (dialog.length) {
        html += '<div class="sb-section-lbl" aria-hidden="true">💬 В диалоге</div>';
        html += sortByLastMsg(dialog).map(l => renderTgLeadItem(l, isActive(l.id), 'dialog')).join('');
    }
    if (newLeads.length) {
        html += '<div class="sb-section-lbl" aria-hidden="true">📋 Все лиды</div>';
        html += newLeads.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
            .map(l => renderTgLeadItem(l, isActive(l.id), 'new')).join('');
    }

    list.innerHTML = html;
}
```

- [ ] **Step 4: Add `renderTgSidebar` call to `saveDB()`**

Find `function saveDB()` (~line 1584):

```js
function saveDB() {
    updateDashboard();
    renderTable();
}
```

Replace with:

```js
function saveDB() {
    updateDashboard();
    renderTable();
    renderTgSidebar(currentChatLeadId);
}
```

- [ ] **Step 5: Verify in browser**

Open app. Expected:
- Sidebar shows three sections with labels "🔥 Требуют действия", "💬 В диалоге", "📋 Все лиды"
- Leads without messages appear in "Все лиды" with italic text and lower opacity
- Active lead has indigo left border
- Urgent/stale leads show red left border; reminder leads show yellow
- Search still filters across all sections

- [ ] **Step 6: Commit**

```
git add index.html
git commit -m "feat: sidebar 3-section layout with urgency detection and avatar gradients"
```

---

## Task 4: Funnel hero on empty right panel

Replace `#tgEmpty` content with a live bar-chart funnel.

**Files:** `index.html`

- [ ] **Step 1: Add `renderFunnelHero()` function**

Find `function openTgView(id)` (~line 1270). Insert before it:

```js
function renderFunnelHero() {
    const el = document.getElementById('tgEmpty');
    if (!el) return;

    const counts = [0, 1, 2, 3, 4].map(s => leads.filter(l => l.status === s).length);
    // stages: 0=Новые, 1=Ледокол, 2=Диалог, 3=Успех (skip 4=Отказ for funnel)
    const stages = [
        { label: 'Новые',   count: counts[0], color: '#6366f1', pct: null },
        { label: 'Ледокол', count: counts[1], color: '#7c3aed', pct: counts[0] > 0 ? Math.round(counts[1] / counts[0] * 100) : null },
        { label: 'Диалог',  count: counts[2], color: '#8b5cf6', pct: counts[1] > 0 ? Math.round(counts[2] / counts[1] * 100) : null },
        { label: 'Успех',   count: counts[3], color: '#27a644', pct: counts[2] > 0 ? Math.round(counts[3] / counts[2] * 100) : null }
    ];

    const maxCount = Math.max(...stages.map(s => s.count), 1);
    const maxBarPx = 80;

    const barsHtml = stages.map((s, i) => {
        const height = Math.round((s.count / maxCount) * maxBarPx);
        const pctHtml = s.pct !== null
            ? '<div class="funnel-col-pct">' + s.pct + '%</div>'
            : '<div class="funnel-col-pct" style="opacity:0">—</div>';
        const arrow = i < stages.length - 1
            ? '<div class="funnel-arrow">›</div>' : '';
        return '<div class="funnel-col">' +
            '<div class="funnel-bar" style="height:' + (height || 4) + 'px;background:' + s.color + ';min-height:4px;"></div>' +
            '<div class="funnel-col-count" style="color:' + s.color + '">' + s.count + '</div>' +
            '<div class="funnel-col-name">' + escapeHtml(s.label) + '</div>' +
            pctHtml +
            '</div>' + arrow;
    }).join('');

    el.innerHTML =
        '<div class="funnel-hero-title">Воронка продаж</div>' +
        '<div class="funnel-chart">' + barsHtml + '</div>' +
        '<div class="funnel-hero-cta">← выбери лид для работы</div>';
}
```

- [ ] **Step 2: Replace `#tgEmpty` inner HTML**

Find `#tgEmpty` div (~line 875–877):

```html
<div id="tgEmpty" aria-label="Выберите диалог из списка слева">
    <span style="opacity:.45;">Выберите диалог слева</span>
</div>
```

Replace with (keep the div, change only its content and aria-label):

```html
<div id="tgEmpty" class="funnel-hero" aria-label="Статистика воронки продаж">
    <!-- filled by renderFunnelHero() -->
</div>
```

- [ ] **Step 3: Call `renderFunnelHero()` from `openTgView()` and `saveDB()`**

In `openTgView(id)` (~line 1270), find the `else` branch where `tgEmpty` is shown:

```js
} else {
    renderTgSidebar(null);
    document.getElementById('tgEmpty').style.display = 'flex';
    document.getElementById('chat-view').style.display = 'none';
}
```

Replace with:

```js
} else {
    renderTgSidebar(null);
    document.getElementById('tgEmpty').style.display = 'flex';
    document.getElementById('chat-view').style.display = 'none';
    renderFunnelHero();
}
```

In `saveDB()` (~line 1584), add `renderFunnelHero()`:

```js
function saveDB() {
    updateDashboard();
    renderTable();
    renderTgSidebar(currentChatLeadId);
    if (document.getElementById('tgEmpty').style.display !== 'none') {
        renderFunnelHero();
    }
}
```

- [ ] **Step 4: Verify in browser**

Open app. Expected:
- Right panel shows "ВОРОНКА ПРОДАЖ" with 4 bars: Новые/Ледокол/Диалог/Успех
- Bar heights proportional to lead counts; correct colors
- Conversion % shown between stages (null for first column)
- After adding a lead (bulk import), funnel updates automatically
- After selecting a lead, funnel disappears and chat appears
- After deselecting (no way currently), funnel shown on `openTgView(null)`

- [ ] **Step 5: Commit**

```
git add index.html
git commit -m "feat: funnel hero on empty right panel with live conversion %"
```

---

## Task 5: AI classify + inline badge

Call Gemini after each client message. Append an inline badge in the chat feed.

**Files:** `index.html`

- [ ] **Step 1: Add `classifyClientMessage()` function**

Find `function submitChatInput(leadId)` (~line 2349). Insert before it:

```js
async function classifyClientMessage(text, leadId) {
    const apiKey = getGeminiKey();
    if (!apiKey) return null;

    const prompt = [
        'Ты помощник менеджера по продажам видеопродакшена.',
        'Клиент написал: «' + text + '»',
        '',
        'Определи тип сообщения и главную причину (если возражение).',
        'Ответь строго JSON (без объяснений, без markdown):',
        '{',
        '  "type": "interest" | "objection" | "rejection" | "unclear",',
        '  "reason": "no_budget" | "has_smm" | "send_examples" | "think_later" | "other" | null,',
        '  "reason_text": "краткое название причины по-русски или null"',
        '}'
    ].join('\n');

    try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(
            'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + encodeURIComponent(apiKey),
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal,
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { maxOutputTokens: 120, temperature: 0.1 }
                })
            }
        );
        clearTimeout(tid);
        if (!res.ok) return null;
        const data = await res.json();
        const raw = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
        // Strip markdown code fences if Gemini wraps in ```json
        const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
        return safeParseJSON(cleaned, null);
    } catch (e) {
        return null;
    }
}
```

- [ ] **Step 2: Add `appendClassifyBadge()` function**

Insert after `classifyClientMessage()`:

```js
function appendClassifyBadge(type, reasonText) {
    const feed = document.getElementById('chatFeedMain');
    if (!feed) return;
    const labelMap = {
        interest:  '🟢 Интерес',
        objection: '🟡 Возражение' + (reasonText ? ' · ' + reasonText : ''),
        rejection: '🔴 Отказ',
        unclear:   '❓ Непонятно'
    };
    const label = labelMap[type];
    if (!label) return;
    const badge = document.createElement('div');
    badge.className = 'classify-badge ' + type;
    badge.textContent = label;
    badge.setAttribute('aria-label', 'AI классификация: ' + label);
    feed.appendChild(badge);
    feed.scrollTop = feed.scrollHeight;
}
```

- [ ] **Step 3: Extend `submitChatInput()` to trigger classification**

Find `function submitChatInput(leadId)` (~line 2349):

```js
function submitChatInput(leadId) {
    const input = document.getElementById('chatInputMain');
    if (!input || !input.value.trim()) return;
    const txt = input.value.trim();
    input.value = '';
    const fromClient = (chatInputTab === 'client');
    addMessageToLead(leadId, txt, fromClient);
    const status = document.getElementById('chatSubmitStatus');
    if (status) status.textContent = fromClient ? 'Сообщение клиента добавлено' : 'Сообщение записано';
}
```

Replace with:

```js
function submitChatInput(leadId) {
    const input = document.getElementById('chatInputMain');
    if (!input || !input.value.trim()) return;
    const txt = input.value.trim();
    input.value = '';
    const fromClient = (chatInputTab === 'client');
    addMessageToLead(leadId, txt, fromClient);
    const status = document.getElementById('chatSubmitStatus');
    if (status) status.textContent = fromClient ? 'Сообщение клиента добавлено' : 'Сообщение записано';

    if (fromClient) {
        // Guard: hideObjectionPanel defined in Task 6
        if (typeof hideObjectionPanel === 'function') hideObjectionPanel();
        // Show loading indicator while classifying
        const feed = document.getElementById('chatFeedMain');
        const loadBadge = document.createElement('div');
        loadBadge.className = 'classify-badge';
        loadBadge.id = 'classifyLoading';
        loadBadge.style.cssText = 'background:rgba(255,255,255,.05);color:var(--text-muted);font-style:italic;';
        loadBadge.textContent = '🤖 Анализирую...';
        if (feed) { feed.appendChild(loadBadge); feed.scrollTop = feed.scrollHeight; }

        classifyClientMessage(txt, leadId).then(function(result) {
            const lb = document.getElementById('classifyLoading');
            if (lb) lb.remove();
            if (!result || !result.type || result.type === 'unclear') return;
            // Only show if still on same lead
            if (String(currentChatLeadId) !== String(leadId)) return;
            appendClassifyBadge(result.type, result.reason_text);
            // Guard: loadObjectionSuggestions defined in Task 6
            if (result.type === 'objection' && typeof loadObjectionSuggestions === 'function') {
                loadObjectionSuggestions(txt, result.reason, leadId);
            }
        });
    }
}
```

- [ ] **Step 4: Verify in browser (classification badge only — objection panel added in Task 6)**

Open app, open a lead, switch to "← Клиент ответил" tab, paste a client message and submit. Expected:
- "🤖 Анализирую..." badge appears briefly in the feed
- Badge replaced by `🟢 Интерес` / `🟡 Возражение · ...` / `🔴 Отказ` based on Gemini response
- No JS errors in console (guard checks prevent crash on missing Task 6 functions)
- If no Gemini key configured: no badge, no error toast, no crash

- [ ] **Step 5: Commit**

```
git add index.html
git commit -m "feat: async AI classify on client message, inline badge in chat feed"
```

---

## Task 6: Objection panel HTML + JS

Render suggested responses above the textarea when Gemini detects an objection.

**Files:** `index.html`

- [ ] **Step 1: Add `#objectionPanel` HTML**

Find the chat input area in `#tg-view`. Look for `<div class="client-input-row">` (~line 833). Insert the `#objectionPanel` div immediately **before** that div:

```html
<!-- AI Objection Panel — shown when client message is an objection -->
<div id="objectionPanel" class="objection-panel" style="display:none;" aria-live="polite">
    <div class="op-header">
        <span class="op-badge" id="opBadge">🟡 Возражение</span>
        <button class="op-close" onclick="hideObjectionPanel()" aria-label="Скрыть подсказки">✕</button>
    </div>
    <div id="opSuggestions" class="op-suggestions"></div>
</div>
```

- [ ] **Step 2: Add `loadObjectionSuggestions()`, `showObjectionPanel()`, `hideObjectionPanel()`**

Find `function classifyClientMessage(` added in Task 5. Insert the following three functions after `appendClassifyBadge()`:

```js
async function loadObjectionSuggestions(text, reason, leadId) {
    const apiKey = getGeminiKey();
    if (!apiKey) return;

    const panel = document.getElementById('objectionPanel');
    const suggs = document.getElementById('opSuggestions');
    const badge = document.getElementById('opBadge');
    if (!panel || !suggs) return;

    // Show loading state
    if (badge) badge.textContent = '🟡 Загружаю варианты...';
    suggs.innerHTML = '<div class="op-loading">Подбираю ответы на возражение...</div>';
    panel.style.display = '';

    const reasonLabels = {
        no_budget:     'нет бюджета',
        has_smm:       'есть SMM',
        send_examples: 'пришлите примеры',
        think_later:   'подумаю',
        other:         'другое'
    };
    const reasonLabel = reasonLabels[reason] || reason || 'возражение';

    const prompt = [
        'Ты менеджер по продажам видеопродакшена ADERVIS.',
        'Клиент ответил: «' + text + '»',
        'Тип возражения: ' + reasonLabel,
        '',
        'Напиши ровно 3 коротких ответа менеджера (каждый 1-2 предложения, живой разговорный стиль, без официоза).',
        'Каждый с коротким заголовком (2-4 слова).',
        'Ответь строго JSON (без markdown, без объяснений):',
        '[{"title": "...", "text": "..."}, {"title": "...", "text": "..."}, {"title": "...", "text": "..."}]'
    ].join('\n');

    try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 10000);
        const res = await fetch(
            'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + encodeURIComponent(apiKey),
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal,
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { maxOutputTokens: 400, temperature: 0.85 }
                })
            }
        );
        clearTimeout(tid);
        if (!res.ok) { hideObjectionPanel(); return; }
        const data = await res.json();
        const raw  = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
        const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
        const suggestions = safeParseJSON(cleaned, []);
        if (!Array.isArray(suggestions) || !suggestions.length) { hideObjectionPanel(); return; }
        // Abort if user switched leads
        if (String(currentChatLeadId) !== String(leadId)) return;
        showObjectionPanel(suggestions, reasonLabel);
    } catch (e) {
        hideObjectionPanel();
    }
}

function showObjectionPanel(suggestions, reasonLabel) {
    const panel = document.getElementById('objectionPanel');
    const suggs = document.getElementById('opSuggestions');
    const badge = document.getElementById('opBadge');
    if (!panel || !suggs) return;
    if (badge) badge.textContent = '🟡 Возражение · ' + escapeHtml(reasonLabel) + ' — кликни вариант чтобы вставить';
    suggs.innerHTML = suggestions.map(function(s) {
        const safeTitle = escapeHtml(s.title || '');
        const safeText  = escapeHtml(s.text  || '');
        return '<button class="op-sugg" onclick="useObjectionSuggestion(' + JSON.stringify(s.text) + ')">' +
            '<strong>' + safeTitle + '</strong>' + safeText + '</button>';
    }).join('');
    panel.style.display = '';
}

function hideObjectionPanel() {
    const panel = document.getElementById('objectionPanel');
    if (panel) panel.style.display = 'none';
    const suggs = document.getElementById('opSuggestions');
    if (suggs) suggs.innerHTML = '';
}

function useObjectionSuggestion(text) {
    const ta = document.getElementById('chatInputMain');
    if (!ta) return;
    ta.value = text;
    ta.focus();
    setChatInputTab('manager');
}
```

- [ ] **Step 3: Hide panel when switching leads or tabs**

In `selectTgLead(id)` (~line 1251), find the line `currentChatLeadId = String(id);` and add `hideObjectionPanel()` right after it:

```js
function selectTgLead(id) {
    currentChatLeadId = String(id);
    hideObjectionPanel();          // ← ADD this line
    window._aiCard = null;
    // ... rest unchanged
```

In `setChatInputTab(tab)` (~line 2400), find where the tab switches to `'manager'`:

```js
if (tab === 'manager') {
    suggestBar.style.display = 'flex';
    updateChatSuggestHint();
} else {
```

Add `hideObjectionPanel()` in the `manager` branch:

```js
if (tab === 'manager') {
    suggestBar.style.display = 'flex';
    updateChatSuggestHint();
    hideObjectionPanel();          // ← ADD this line
} else {
```

- [ ] **Step 4: Verify end-to-end flow in browser**

1. Open app, select a lead that has messages
2. Switch to "← Клиент ответил" tab
3. Paste: `"У нас нет бюджета на видео сейчас"` and click Отправить
4. Expected sequence:
   - Message appears in feed
   - "🤖 Анализирую..." badge appears briefly
   - Badge becomes "🟡 Возражение · нет бюджета"
   - Yellow-tinted panel slides in above textarea with 3 clickable suggestions
5. Click a suggestion → textarea fills with that text, tab switches to "Я написал"
6. Click ✕ → panel hides
7. Select a different lead → panel is gone
8. Paste: `"Интересно, расскажите подробнее"` and submit
   - Badge becomes "🟢 Интерес", no objection panel appears

- [ ] **Step 5: Commit**

```
git add index.html
git commit -m "feat: AI objection panel with 3 Gemini-generated responses, click to insert"
```

---

## Acceptance Criteria Checklist

Run through these manually after all tasks complete:

- [ ] AC1: On load, `#tg-view` visible, `#table-view` hidden
- [ ] AC2: `≡ Таблица` button toggles views (label changes to `← Диалоги`)
- [ ] AC3: Sidebar shows 3 sections; empty sections not rendered
- [ ] AC4: Leads with `messages.length === 0` in section 3, italic "нет сообщений"
- [ ] AC5: Funnel hero shows correct counts when no lead selected
- [ ] AC6: Add a new lead → funnel bar heights update
- [ ] AC7: Client message submitted → Gemini called (check Network tab)
- [ ] AC8: Objection detected → panel appears with 3 suggestions
- [ ] AC9: Clicking suggestion fills textarea, does NOT auto-send
- [ ] AC10: ✕ dismisses panel; switching leads clears panel
- [ ] AC11: No Gemini key → no panel, no error, no crash
- [ ] AC12: Inline badge appears in feed for interest/objection/rejection
