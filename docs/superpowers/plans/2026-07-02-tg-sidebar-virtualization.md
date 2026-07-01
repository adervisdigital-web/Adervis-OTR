# TG Sidebar Virtualization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `#tgLeadList` (the TG-first sidebar's dialogue list) render only the rows near the current scroll position instead of rebuilding every lead's DOM node on every call, so it stays fast as the lead count grows into the hundreds.

**Architecture:** Split the existing `renderTgSidebar()` into a data-building step (`buildTgSidebarRows`, unchanged grouping/sorting logic, now returning a flat array of row descriptors instead of one big HTML string) and two render steps: `renderTgSidebar()` (expensive — rebuilds rows + offsets from `leads`, called on data/filter changes, same as today) and `renderTgSidebarVisibleWindow()` (cheap — slices the already-built rows by scroll position, called on every scroll tick via `requestAnimationFrame`). Row heights are measured once from real rendered DOM (`getBoundingClientRect`), not hardcoded. The "Закрытые" (closed) section stays fully unvirtualized (collapsed by default, rendered as a fixed suffix). A `scrollTgSidebarToLead()` helper is added and reused by three call sites that need to bring an off-screen lead into the rendered window: selecting a lead, an incoming-message pulse, and Arrow-key navigation.

**Tech Stack:** Vanilla JS (`index.html`, plain `<script>` tags, no bundler). No test runner exists for this file — verification is manual, per the checklist in `docs/superpowers/specs/2026-07-01-tg-sidebar-virtualization-design.md`.

---

## Correction vs. the spec (found while grounding this plan in the real code)

The spec's CSS references (`.tg-lead-item`, `.tg-lead-avatar`) don't match what `renderTgLeadItem()` actually renders. The real, live classes are `.lead-item` (item container, `index.html:771`), `.li-av` (avatar), `.li-info`/`.li-row1`/`.li-row2` (text rows), and `.sb-section-lbl` (section headers, `index.html:754`). `.tg-lead-item` etc. is dead CSS from an earlier redesign — not touched by this plan, not referenced by any task below. Both `.li-name` and `.li-msg` are `white-space:nowrap; text-overflow:ellipsis` (single line, no wrapping), so `.lead-item` rows are genuinely uniform height — confirms the fixed/measured-height approach from the spec is sound.

Also found while reading the code: **global Arrow Up/Down keyboard navigation** (`index.html:8294-8306`, in the app-wide `keydown` listener) currently calls `list.querySelectorAll('.lead-item[data-lead-id]')` to get an ordered array of *every* lead and walks it by index. Under virtualization this array only contains the currently-rendered subset, silently breaking Arrow-key nav at the edges of the rendered window. This wasn't in the spec's edge-case list — it's a necessary fix for this plan to not regress existing behavior (Task 5 below), not scope creep.

## Accessibility requirements (from an accessibility-lead pre-implementation review of this exact plan)

`#tgLeadList` already has `role="list" aria-label="Список диалогов"` and each row already has `role="listitem" tabindex="0"` (`renderTgLeadItem`, `index.html:2777-2889`) — none of that changes. Two Major findings from that review are folded into the tasks below, not deferred:

1. **`aria-setsize`/`aria-posinset` are required**, scoped per-section (🔥/💬/📋/Закрытые), not whole-list — with ~20 of 200+ rows ever mounted, a screen reader can't otherwise infer list size/position from DOM traversal (WAI-ARIA 1.2 §6.6.2). Since the `sb-section-lbl` headers are `aria-hidden="true"` (decorative dividers, not announced), the section name is also folded into each row's existing `aria-label` so a screen reader user knows *why* posinset resets at a section boundary. Implemented in **Task 1**.
2. **Focus must not be silently destroyed when a scroll-triggered re-render evicts the row that currently holds it.** `renderTgSidebarVisibleWindow()` does a full `innerHTML` replace on every scroll tick; if a keyboard user has Tabbed to (not yet selected) a row and a scroll pushes it out of the render window before the next tick, that DOM node is destroyed mid-focus and focus silently falls back to `<body>` — worse than today, where all rows persist. Implemented in **Task 2**.

One Minor finding is addressed as its own task rather than silently dropped: **Tab currently walks every row; after virtualization it silently stops at the edge of the rendered window** with no way to reveal more rows without scrolling by mouse or using Arrow keys (which also selects a lead, changing the active chat). **Task 6** adds boundary interception so Tab/Shift+Tab at the first/last rendered row extends the window by one row instead of just leaving the list. (A known, accepted limitation of this fix, per the review: it only recognizes the boundary of the *virtualized* section — if "Закрытые" is expanded, Tab-expansion doesn't extend into it; that's fine, mouse/scroll still work there as today.)

Two findings from the review needed **no code change**, confirmed by re-reading the actual markup rather than assuming: the incoming-message pulse's `showToast(...)` already renders into `#toastEl`, which already has `role="status" aria-live="polite" aria-atomic="true"` (`index.html:8872`) — already announced today, independent of virtualization, no new live region needed. And the spacer `<div>` elements (`aria-hidden="true"`, no role, no content) are already correct as designed in Task 2's original code — nothing to add there.

---

## File Map

- Modify: `index.html`
  - Globals near `let currentSort` (`index.html:2713` area, alongside other module-level state) — add virtualization state
  - Lines 2777-2889 (`renderTgLeadItem`) — add `aria-setsize`/`aria-posinset`/section-name-in-`aria-label` parameters
  - Lines 2909-3014 (current `renderTgSidebar`) — split into `buildTgSidebarRows` + rewritten `renderTgSidebar` + new `renderTgSidebarVisibleWindow`
  - New functions: `bindTgSidebarScroll`, `scrollTgSidebarToLead`, `measureTgSidebarRowHeights`, `bindTgSidebarTabExpansion`
  - Lines 3622-3630 (incoming-VK-message pulse in `subscribeToLeads`) — scroll lead into window before pulsing
  - Lines 8294-8306 (Arrow Up/Down keyboard nav) — read from `_tgSidebarRows` instead of the DOM

No other files change. Spec: `docs/superpowers/specs/2026-07-01-tg-sidebar-virtualization-design.md` (commit `53e3c10`).

---

### Task 1: Virtualization state + `buildTgSidebarRows`

**Files:**
- Modify: `index.html:2713-2717` (globals block)
- Modify: `index.html:2909-3014` (replace `renderTgSidebar` body with a new `buildTgSidebarRows` + a temporary pass-through `renderTgSidebar`, refined further in Task 2)

- [ ] **Step 1: Add virtualization globals**

Find:

```javascript
        let currentSort = { col: 'updatedAt', desc: true };
        let selectedLeadIds = new Set();
        let lastVisibleLeadIds = [];
        let vkBroadcastState = { recipients: [], skipped: [], templateText: '', sending: false, stopFlag: false };
        let _vkBcFocusTrigger = null;
        let _vkBcEscHandler = null;
```

Replace with:

```javascript
        let currentSort = { col: 'updatedAt', desc: true };
        let selectedLeadIds = new Set();
        let lastVisibleLeadIds = [];
        let vkBroadcastState = { recipients: [], skipped: [], templateText: '', sending: false, stopFlag: false };
        let _vkBcFocusTrigger = null;
        let _vkBcEscHandler = null;
        let _tgSidebarRows = [];        // flattened virtualized rows: [{type:'header'|'lead', html, leadId?}]
        let _tgSidebarOffsets = [];     // cumulative top offset (px) per row index, same length as _tgSidebarRows
        let _tgSidebarTotalHeight = 0;  // total px height of all virtualized rows
        let _tgSidebarBannerHtml = '';  // "best time" banner — unvirtualized prefix, 0 or 1 row
        let _tgSidebarClosedHtml = '';  // "Закрытые" section — unvirtualized suffix, collapsed by default
        let _tgHeaderH = null;          // measured height of .sb-section-lbl — null until first real measurement
        let _tgLeadH = null;            // measured height of .lead-item — null until first real measurement
        let _tgSidebarScrollBound = false; // guard so the scroll listener is attached only once
        let _tgSidebarTabBound = false;    // guard so the Tab-boundary-expansion listener is attached only once
```

- [ ] **Step 2: Verify by grep**

Run: `grep -n "_tgSidebarRows\|_tgHeaderH\|_tgLeadH\|_tgSidebarScrollBound\|_tgSidebarTabBound" index.html`
Expected: at least 7 matches, all inside the globals block just added (no other matches yet — later tasks reference these too)

- [ ] **Step 3: Add `aria-setsize`/`aria-posinset`/section-name to `renderTgLeadItem`**

This is the accessibility fix from the pre-implementation review — with only a subset of rows ever mounted, screen readers can't infer list size/position from DOM traversal alone.

Find:

```javascript
        function renderTgLeadItem(lead, isActive, sectionCtx) {
            // sectionCtx: 'urgent' | 'dialog' | 'new'
            const name     = escapeHtml(lead.name || 'Без имени');
```

(Only the function signature and its first line need to match — this Find is intentionally short since the replacement only changes the signature and the final `return` statement below; everything in between, lines computing `msgs`/`lastMsg`/`itemClass`/`metaRight`/`msgPrev`/the pill variables, is untouched.)

Replace with:

```javascript
        function renderTgLeadItem(lead, isActive, sectionCtx, posinset, setsize, sectionLabel) {
            // sectionCtx: 'urgent' | 'dialog' | 'new' | 'success' | 'rejected'
            // posinset/setsize: 1-based position and count within sectionLabel's group, for aria-posinset/aria-setsize
            // sectionLabel: plain-text section name (no emoji) folded into aria-label, since the visible
            //   .sb-section-lbl headers are aria-hidden and wouldn't otherwise explain a posinset reset
            const name     = escapeHtml(lead.name || 'Без имени');
```

- [ ] **Step 4: Add the `aria-setsize`/`aria-posinset`/`aria-label` attributes to the row's wrapper `<div>`**

Find:

```javascript
            return '<div class="' + itemClass + '" role="listitem" tabindex="0"' +
                ' data-lead-id="' + safeId + '"' +
                ' onclick="selectTgLead(\'' + safeId + '\')"' +
                ' onkeydown="if(event.key===\'Enter\'||event.key===\' \'){selectTgLead(\'' + safeId + '\');event.preventDefault();}"' +
                ' aria-label="' + name + (hasClientReply ? ' — ответил клиент' : '') + '">' +
```

Replace with:

```javascript
            const setsizeAttr  = (typeof setsize === 'number')  ? ' aria-setsize="' + setsize + '"'   : '';
            const posinsetAttr = (typeof posinset === 'number') ? ' aria-posinset="' + posinset + '"' : '';
            const sectionPrefix = sectionLabel ? sectionLabel + ': ' : '';

            return '<div class="' + itemClass + '" role="listitem" tabindex="0"' +
                ' data-lead-id="' + safeId + '"' + setsizeAttr + posinsetAttr +
                ' onclick="selectTgLead(\'' + safeId + '\')"' +
                ' onkeydown="if(event.key===\'Enter\'||event.key===\' \'){selectTgLead(\'' + safeId + '\');event.preventDefault();}"' +
                ' aria-label="' + sectionPrefix + name + (hasClientReply ? ' — ответил клиент' : '') + '">' +
```

- [ ] **Step 5: Verify by grep**

Run: `grep -n "aria-setsize\|aria-posinset\|sectionPrefix" index.html`
Expected: 4 matches (the two attr-building lines, the wrapper div's attribute usage, and the `sectionPrefix` usage in `aria-label`)

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat(tg-sidebar): add aria-setsize/aria-posinset to lead rows

Per accessibility-lead review: with virtualization about to make most
rows absent from the DOM at any given time, screen readers can no
longer infer list size/position from traversal alone. Scoped
per-section (not whole-list) since sections are logically distinct
groups. Section name folded into aria-label too, since the visible
section headers are aria-hidden and wouldn't otherwise explain why
posinset resets at a section boundary."
```

- [ ] **Step 7: Replace `renderTgSidebar` with `buildTgSidebarRows` + a straight-line `renderTgSidebar`**

This step keeps behavior byte-for-byte identical to today (full render, no windowing yet) — it only restructures the code so Task 2 can add windowing on top without re-deriving the grouping/sorting logic. It also wires the new `posinset`/`setsize`/`sectionLabel` parameters from Steps 3-4 into every `renderTgLeadItem` call site.

Find:

```javascript
        function renderTgSidebar(selectId) {
            const list = document.getElementById('tgLeadList');
            if (!list) return;
            const query = ((document.getElementById('tgSearchInput') || {}).value || '').trim().toLowerCase();
            // Update sidebar title with active lead count
            (function() {
                const title = document.querySelector('.tg-sidebar-title');
                if (!title) return;
                const active = leads.filter(function(l) { return !l.archived_at && l.status !== 3 && l.status !== 4; });
                title.textContent = 'Диалоги' + (active.length ? ' · ' + active.length : '');
            })();

            const filtered = query
                ? leads.filter(function(l) {
                    return (l.name    || '').toLowerCase().includes(query) ||
                           (l.bizType || '').toLowerCase().includes(query) ||
                           (l.contact || '').toLowerCase().includes(query) ||
                           (l.link    || '').toLowerCase().includes(query);
                })
                : leads.slice();

            if (!filtered.length) {
                const emptyIcon = query ? '🔍' : '📋';
                const emptyTitle = query ? 'Ничего не найдено' : 'Нет лидов';
                const emptySub = query ? 'Измените запрос или фильтры' : 'Нажмите <strong>+ Лид</strong>, чтобы начать';
                list.innerHTML = '<div class="tg-empty-sidebar" role="status">' +
                    '<div style="font-size:28px;margin-bottom:8px;" aria-hidden="true">' + emptyIcon + '</div>' +
                    '<div style="font-weight:600;font-size:12px;color:var(--text);margin-bottom:4px;">' + emptyTitle + '</div>' +
                    '<div>' + emptySub + '</div>' +
                    '</div>';
                return;
            }

            const isActive = id => String(id) === String(selectId);

            // Separate closed leads (status 3/4) from active pipeline
            const active   = filtered.filter(l => l.status !== 3 && l.status !== 4);
            const closed   = filtered.filter(l => l.status === 3 || l.status === 4);

            const urgent   = active.filter(l => isLeadUrgent(l));
            const dialog   = active.filter(l => !isLeadUrgent(l) && l.messages && l.messages.length > 0);
            const newLeads = active.filter(l => !isLeadUrgent(l) && (!l.messages || l.messages.length === 0));

            const sortByLastMsg = arr => arr.slice().sort((a, b) => {
                const ta = ((a.messages || []).slice(-1)[0] || {}).date || a.updatedAt || 0;
                const tb = ((b.messages || []).slice(-1)[0] || {}).date || b.updatedAt || 0;
                return Number(tb) - Number(ta);
            });

            let html = '';

            const mkLabel = (icon, text, count) =>
                '<div class="sb-section-lbl" aria-hidden="true">' +
                '<span>' + icon + ' ' + text + '</span>' +
                '<span class="sb-section-cnt">' + count + '</span>' +
                '</div>';

            var _btHint = getBestContactHours(5);
            if (_btHint) {
                html += '<div class="sb-best-time" aria-label="Лучшее время для касания: ' + escapeHtml(_btHint.top.join(', ')) + '">' +
                    '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' +
                    '<span>Лучше писать: <b>' + escapeHtml(_btHint.top.join(', ')) + '</b></span>' +
                    '<span style="opacity:.6;margin-left:auto;">· ' + _btHint.total + ' отв.</span>' +
                    '</div>';
            }

            const urgentCount = urgent.length;
            const urgentHeader = urgentCount > 0
                ? '<div class="sb-section-lbl" aria-hidden="true" style="display:flex;align-items:center;justify-content:space-between;"><span>🔥 Требуют действия <span style="background:rgba(248,113,113,.15);color:var(--danger);border-radius:9999px;padding:1px 7px;font-size:10.5px;font-weight:700;margin-left:4px;">' + urgentCount + '</span></span><button onclick="selectNextUrgentLead()" style="background:none;border:none;color:var(--muted);font-size:11px;cursor:pointer;padding:2px 4px;border-radius:4px;" aria-label="Перейти к следующему срочному лиду">Следующий →</button></div>'
                : '<div class="sb-section-lbl" aria-hidden="true" style="color:var(--muted);">🔥 Требуют действия <span style="font-size:11px;font-weight:400;">— всё обработано ✓</span></div>';
            html += urgentHeader;
            if (urgentCount > 0) {
                html += sortByLastMsg(urgent).map(l => renderTgLeadItem(l, isActive(l.id), 'urgent')).join('');
            }
            if (dialog.length) {
                html += mkLabel('💬', 'В диалоге', dialog.length);
                html += sortByLastMsg(dialog).map(l => renderTgLeadItem(l, isActive(l.id), 'dialog')).join('');
            }
            if (newLeads.length) {
                html += mkLabel('📋', 'Все лиды', newLeads.length);
                html += newLeads.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
                    .map(l => renderTgLeadItem(l, isActive(l.id), 'new')).join('');
            }

            // Closed/rejected leads collapsed at the bottom (static ID)
            if (closed.length) {
                html += '<div style="margin-top:4px;">' +
                    '<button onclick="(function(btn){var s=document.getElementById(\'sbClosedList\');var open=s.style.display===\'block\';s.style.display=open?\'none\':\'block\';btn.setAttribute(\'aria-expanded\',String(!open));btn.querySelector(\'.sb-caret\').textContent=open?\'›\':\'‹\';})(this)" ' +
                    'style="width:100%;background:none;border:none;display:flex;align-items:center;gap:6px;padding:6px 12px;color:var(--muted);font-size:11px;cursor:pointer;text-align:left;" ' +
                    'aria-expanded="false" aria-controls="sbClosedList">' +
                    '<span class="sb-caret">›</span>' +
                    '<span>Закрытые</span>' +
                    '<span style="background:rgba(255,255,255,.06);border-radius:9999px;padding:1px 6px;font-size:10.5px;margin-left:auto;">' + closed.length + '</span>' +
                    '</button>' +
                    '<div id="sbClosedList" style="display:none;">' +
                    closed.slice().sort(function(a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); })
                        .map(function(l) {
                            return renderTgLeadItem(l, isActive(l.id), l.status === 3 ? 'success' : 'rejected');
                        }).join('') +
                    '</div></div>';
            }

            list.innerHTML = html;
            updateUrgentBadge();
            renderTgStats();
        }
```

Replace with:

```javascript
        function buildTgSidebarRows(selectId) {
            const query = ((document.getElementById('tgSearchInput') || {}).value || '').trim().toLowerCase();
            // Update sidebar title with active lead count
            (function() {
                const title = document.querySelector('.tg-sidebar-title');
                if (!title) return;
                const active = leads.filter(function(l) { return !l.archived_at && l.status !== 3 && l.status !== 4; });
                title.textContent = 'Диалоги' + (active.length ? ' · ' + active.length : '');
            })();

            const filtered = query
                ? leads.filter(function(l) {
                    return (l.name    || '').toLowerCase().includes(query) ||
                           (l.bizType || '').toLowerCase().includes(query) ||
                           (l.contact || '').toLowerCase().includes(query) ||
                           (l.link    || '').toLowerCase().includes(query);
                })
                : leads.slice();

            if (!filtered.length) {
                const emptyIcon = query ? '🔍' : '📋';
                const emptyTitle = query ? 'Ничего не найдено' : 'Нет лидов';
                const emptySub = query ? 'Измените запрос или фильтры' : 'Нажмите <strong>+ Лид</strong>, чтобы начать';
                return {
                    rows: [],
                    bannerHtml: '',
                    closedHtml: '',
                    emptyHtml: '<div class="tg-empty-sidebar" role="status">' +
                        '<div style="font-size:28px;margin-bottom:8px;" aria-hidden="true">' + emptyIcon + '</div>' +
                        '<div style="font-weight:600;font-size:12px;color:var(--text);margin-bottom:4px;">' + emptyTitle + '</div>' +
                        '<div>' + emptySub + '</div>' +
                        '</div>'
                };
            }

            const isActive = id => String(id) === String(selectId);

            // Separate closed leads (status 3/4) from active pipeline
            const active   = filtered.filter(l => l.status !== 3 && l.status !== 4);
            const closed   = filtered.filter(l => l.status === 3 || l.status === 4);

            const urgent   = active.filter(l => isLeadUrgent(l));
            const dialog   = active.filter(l => !isLeadUrgent(l) && l.messages && l.messages.length > 0);
            const newLeads = active.filter(l => !isLeadUrgent(l) && (!l.messages || l.messages.length === 0));

            const sortByLastMsg = arr => arr.slice().sort((a, b) => {
                const ta = ((a.messages || []).slice(-1)[0] || {}).date || a.updatedAt || 0;
                const tb = ((b.messages || []).slice(-1)[0] || {}).date || b.updatedAt || 0;
                return Number(tb) - Number(ta);
            });

            const mkLabel = (icon, text, count) =>
                '<div class="sb-section-lbl" aria-hidden="true">' +
                '<span>' + icon + ' ' + text + '</span>' +
                '<span class="sb-section-cnt">' + count + '</span>' +
                '</div>';

            var bannerHtml = '';
            var _btHint = getBestContactHours(5);
            if (_btHint) {
                bannerHtml = '<div class="sb-best-time" aria-label="Лучшее время для касания: ' + escapeHtml(_btHint.top.join(', ')) + '">' +
                    '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' +
                    '<span>Лучше писать: <b>' + escapeHtml(_btHint.top.join(', ')) + '</b></span>' +
                    '<span style="opacity:.6;margin-left:auto;">· ' + _btHint.total + ' отв.</span>' +
                    '</div>';
            }

            var rows = [];

            const urgentCount = urgent.length;
            const urgentHeader = urgentCount > 0
                ? '<div class="sb-section-lbl" aria-hidden="true" style="display:flex;align-items:center;justify-content:space-between;"><span>🔥 Требуют действия <span style="background:rgba(248,113,113,.15);color:var(--danger);border-radius:9999px;padding:1px 7px;font-size:10.5px;font-weight:700;margin-left:4px;">' + urgentCount + '</span></span><button onclick="selectNextUrgentLead()" style="background:none;border:none;color:var(--muted);font-size:11px;cursor:pointer;padding:2px 4px;border-radius:4px;" aria-label="Перейти к следующему срочному лиду">Следующий →</button></div>'
                : '<div class="sb-section-lbl" aria-hidden="true" style="color:var(--muted);">🔥 Требуют действия <span style="font-size:11px;font-weight:400;">— всё обработано ✓</span></div>';
            rows.push({ type: 'header', html: urgentHeader });
            if (urgentCount > 0) {
                sortByLastMsg(urgent).forEach((l, i) => rows.push({ type: 'lead', html: renderTgLeadItem(l, isActive(l.id), 'urgent', i + 1, urgentCount, 'Требуют действия'), leadId: String(l.id) }));
            }
            if (dialog.length) {
                rows.push({ type: 'header', html: mkLabel('💬', 'В диалоге', dialog.length) });
                sortByLastMsg(dialog).forEach((l, i) => rows.push({ type: 'lead', html: renderTgLeadItem(l, isActive(l.id), 'dialog', i + 1, dialog.length, 'В диалоге'), leadId: String(l.id) }));
            }
            if (newLeads.length) {
                rows.push({ type: 'header', html: mkLabel('📋', 'Все лиды', newLeads.length) });
                newLeads.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
                    .forEach((l, i) => rows.push({ type: 'lead', html: renderTgLeadItem(l, isActive(l.id), 'new', i + 1, newLeads.length, 'Все лиды'), leadId: String(l.id) }));
            }

            // Closed/rejected leads: unvirtualized, collapsed by default (static ID)
            var closedHtml = '';
            if (closed.length) {
                closedHtml = '<div style="margin-top:4px;">' +
                    '<button onclick="(function(btn){var s=document.getElementById(\'sbClosedList\');var open=s.style.display===\'block\';s.style.display=open?\'none\':\'block\';btn.setAttribute(\'aria-expanded\',String(!open));btn.querySelector(\'.sb-caret\').textContent=open?\'›\':\'‹\';})(this)" ' +
                    'style="width:100%;background:none;border:none;display:flex;align-items:center;gap:6px;padding:6px 12px;color:var(--muted);font-size:11px;cursor:pointer;text-align:left;" ' +
                    'aria-expanded="false" aria-controls="sbClosedList">' +
                    '<span class="sb-caret">›</span>' +
                    '<span>Закрытые</span>' +
                    '<span style="background:rgba(255,255,255,.06);border-radius:9999px;padding:1px 6px;font-size:10.5px;margin-left:auto;">' + closed.length + '</span>' +
                    '</button>' +
                    '<div id="sbClosedList" style="display:none;">' +
                    closed.slice().sort(function(a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); })
                        .map(function(l, i) {
                            return renderTgLeadItem(l, isActive(l.id), l.status === 3 ? 'success' : 'rejected', i + 1, closed.length, 'Закрытые');
                        }).join('') +
                    '</div></div>';
            }

            return { rows: rows, bannerHtml: bannerHtml, closedHtml: closedHtml, emptyHtml: null };
        }

        function renderTgSidebar(selectId) {
            const list = document.getElementById('tgLeadList');
            if (!list) return;

            const built = buildTgSidebarRows(selectId);

            if (built.emptyHtml !== null) {
                list.innerHTML = built.emptyHtml;
                _tgSidebarRows = [];
                _tgSidebarOffsets = [];
                _tgSidebarTotalHeight = 0;
                updateUrgentBadge();
                renderTgStats();
                return;
            }

            _tgSidebarRows = built.rows;
            _tgSidebarBannerHtml = built.bannerHtml;
            _tgSidebarClosedHtml = built.closedHtml;

            var offset = 0;
            _tgSidebarOffsets = _tgSidebarRows.map(function(row) {
                var top = offset;
                offset += row.type === 'header' ? (_tgHeaderH || 32) : (_tgLeadH || 68);
                return top;
            });
            _tgSidebarTotalHeight = offset;

            list.innerHTML = _tgSidebarBannerHtml + _tgSidebarRows.map(r => r.html).join('') + _tgSidebarClosedHtml;

            updateUrgentBadge();
            renderTgStats();
        }
```

This step is intentionally still a full (non-windowed) render — Task 2 replaces the last `list.innerHTML = ...` line with the windowed version. Keeping this as its own step means you can verify the refactor didn't change visible behavior before adding windowing on top.

- [ ] **Step 8: Verify by grep**

Run: `grep -n "function buildTgSidebarRows\|function renderTgSidebar" index.html`
Expected: 2 matches

- [ ] **Step 9: Manual sanity check**

Open the app locally or in the deployed preview, go to the TG-first dialogue view. The sidebar should look and behave identically to before this change — same sections, same sorting, same "Закрытые" toggle (the `aria-setsize`/`aria-posinset`/section-name-in-`aria-label` additions from Steps 3-6 are screen-reader-only, no visible change). If anything looks different, something in the Find/Replace didn't match the live file exactly — stop and re-check before continuing.

- [ ] **Step 10: Commit**

```bash
git add index.html
git commit -m "refactor(tg-sidebar): extract buildTgSidebarRows from renderTgSidebar

No behavior change — splits data-building (grouping/sorting into a
flat row array) from HTML rendering, so a later commit can add
windowed rendering on top without re-deriving the grouping logic."
```

---

### Task 2: Windowed rendering (`renderTgSidebarVisibleWindow`)

**Files:**
- Modify: `index.html` — the `renderTgSidebar` function from Task 1

- [ ] **Step 1: Replace the full-render line with windowed rendering + scroll binding**

Find:

```javascript
            _tgSidebarRows = built.rows;
            _tgSidebarBannerHtml = built.bannerHtml;
            _tgSidebarClosedHtml = built.closedHtml;

            var offset = 0;
            _tgSidebarOffsets = _tgSidebarRows.map(function(row) {
                var top = offset;
                offset += row.type === 'header' ? (_tgHeaderH || 32) : (_tgLeadH || 68);
                return top;
            });
            _tgSidebarTotalHeight = offset;

            list.innerHTML = _tgSidebarBannerHtml + _tgSidebarRows.map(r => r.html).join('') + _tgSidebarClosedHtml;

            updateUrgentBadge();
            renderTgStats();
        }
```

Replace with:

```javascript
            _tgSidebarRows = built.rows;
            _tgSidebarBannerHtml = built.bannerHtml;
            _tgSidebarClosedHtml = built.closedHtml;

            var offset = 0;
            _tgSidebarOffsets = _tgSidebarRows.map(function(row) {
                var top = offset;
                offset += row.type === 'header' ? (_tgHeaderH || 32) : (_tgLeadH || 68);
                return top;
            });
            _tgSidebarTotalHeight = offset;

            bindTgSidebarScroll();
            renderTgSidebarVisibleWindow();

            if (_tgHeaderH === null || _tgLeadH === null) {
                measureTgSidebarRowHeights();
            }

            updateUrgentBadge();
            renderTgStats();
        }

        function renderTgSidebarVisibleWindow() {
            const list = document.getElementById('tgLeadList');
            if (!list) return;
            const rows = _tgSidebarRows;
            if (!rows.length) return;

            const leadH   = _tgLeadH || 68;
            const offsets = _tgSidebarOffsets;
            const totalHeight = _tgSidebarTotalHeight;

            const scrollTop  = list.scrollTop;
            const viewportH  = list.clientHeight || 400;
            const OVERSCAN_ROWS = 8;
            const overscanPx = OVERSCAN_ROWS * leadH;

            const startPx = Math.max(0, scrollTop - overscanPx);
            const endPx   = scrollTop + viewportH + overscanPx;

            var startIdx = 0;
            while (startIdx < offsets.length && offsets[startIdx] < startPx) startIdx++;
            if (startIdx > 0) startIdx--;

            var endIdx = startIdx;
            while (endIdx < rows.length && offsets[endIdx] < endPx) endIdx++;

            // Preserve keyboard focus if it's currently on a row this re-render might evict —
            // otherwise a scroll tick can destroy the focused DOM node mid-focus, silently
            // dropping focus to <body> (accessibility-lead review finding, Major).
            var focusedLeadId = null;
            if (list.contains(document.activeElement) && document.activeElement.dataset && document.activeElement.dataset.leadId) {
                focusedLeadId = document.activeElement.dataset.leadId;
            }

            const topSpacerH    = offsets[startIdx];
            const bottomSpacerH = totalHeight - (endIdx < rows.length ? offsets[endIdx] : totalHeight);

            const visibleHtml = rows.slice(startIdx, endIdx).map(r => r.html).join('');

            list.innerHTML =
                _tgSidebarBannerHtml +
                (topSpacerH > 0 ? '<div style="height:' + topSpacerH + 'px;" aria-hidden="true"></div>' : '') +
                visibleHtml +
                (bottomSpacerH > 0 ? '<div style="height:' + bottomSpacerH + 'px;" aria-hidden="true"></div>' : '') +
                _tgSidebarClosedHtml;

            if (focusedLeadId) {
                var stillThere = list.querySelector('[data-lead-id="' + focusedLeadId + '"]');
                if (stillThere) {
                    stillThere.focus();
                } else {
                    list.setAttribute('tabindex', '-1');
                    list.focus();
                }
            }
        }

        function bindTgSidebarScroll() {
            if (_tgSidebarScrollBound) return;
            const list = document.getElementById('tgLeadList');
            if (!list) return;
            var ticking = false;
            list.addEventListener('scroll', function() {
                if (ticking) return;
                ticking = true;
                requestAnimationFrame(function() {
                    renderTgSidebarVisibleWindow();
                    ticking = false;
                });
            });
            _tgSidebarScrollBound = true;
        }

        function measureTgSidebarRowHeights() {
            const headerEl = document.querySelector('#tgLeadList .sb-section-lbl');
            const leadEl   = document.querySelector('#tgLeadList .lead-item');
            var changed = false;
            if (headerEl) {
                var h = headerEl.getBoundingClientRect().height;
                if (h > 0 && h !== _tgHeaderH) { _tgHeaderH = h; changed = true; }
            }
            if (leadEl) {
                var h2 = leadEl.getBoundingClientRect().height;
                if (h2 > 0 && h2 !== _tgLeadH) { _tgLeadH = h2; changed = true; }
            }
            if (changed) {
                var offset = 0;
                _tgSidebarOffsets = _tgSidebarRows.map(function(row) {
                    var top = offset;
                    offset += row.type === 'header' ? (_tgHeaderH || 32) : (_tgLeadH || 68);
                    return top;
                });
                _tgSidebarTotalHeight = offset;
                renderTgSidebarVisibleWindow();
            }
        }
```

- [ ] **Step 2: Verify by grep**

Run: `grep -n "function renderTgSidebarVisibleWindow\|function bindTgSidebarScroll\|function measureTgSidebarRowHeights" index.html`
Expected: 3 matches

- [ ] **Step 3: Trace the windowing math by hand**

Confirm: `startIdx`/`endIdx` are computed by linearly scanning `_tgSidebarOffsets` (already sorted ascending by construction — each row's offset is the previous row's offset plus its height, so this is a monotonically increasing array) for the first index whose offset lands inside `[startPx, endPx)`, then backing `startIdx` up by one row as a small safety margin. `rows.slice(startIdx, endIdx)` — confirm `endIdx` can safely reach `rows.length` (the while loop condition `endIdx < rows.length` stops it there) and that `topSpacerH`/`bottomSpacerH` never go negative (guarded by the `> 0` check before rendering each spacer div).

- [ ] **Step 4: Manual test — long list**

Temporarily test with a large lead count (e.g. via browser console: duplicate a few real lead objects into `leads` with unique fake ids and call `renderTgSidebar(null)` — don't save these to the DB, just testing client-side rendering). Scroll the sidebar — confirm only a small number of `.lead-item` nodes exist in the DOM at once (check via DevTools Elements panel or `document.querySelectorAll('#tgLeadList .lead-item').length`), and that scrolling is smooth with no visible blank flashes.

- [ ] **Step 5: Manual test — focus preservation**

With the same large-list setup: click into the sidebar to focus a `.lead-item` row via Tab (don't click/activate it — just focus it, e.g. `document.querySelectorAll('#tgLeadList .lead-item')[3].focus()` in the console), then trigger a scroll that would push that row out of the rendered window (`document.getElementById('tgLeadList').scrollTop = 5000`). Confirm focus lands back on that same lead's row (if it's within the new window) or on `#tgLeadList` itself (if it's now evicted) — not silently on `<body>` (check `document.activeElement` in the console).

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat(tg-sidebar): windowed rendering with measured row heights

renderTgSidebar() now only rebuilds the flat row array + offsets
(expensive part); renderTgSidebarVisibleWindow() slices it by scroll
position and is what actually touches the DOM on every scroll tick,
via a single requestAnimationFrame-throttled listener. Row heights
are measured once from real rendered .sb-section-lbl/.lead-item
elements rather than hardcoded, correcting the offset table if the
initial 32px/68px estimate was off.

Also preserves keyboard focus across scroll-triggered re-renders: if
a focused row would be evicted from the DOM by the innerHTML swap,
focus moves to the row's new position (if still rendered) or to the
list container itself, rather than silently falling back to <body>
(accessibility-lead review finding)."
```

---

### Task 3: Scroll a selected/off-screen lead into the rendered window

**Files:**
- Modify: `index.html` — `renderTgSidebar` (add a call at the end) and add `scrollTgSidebarToLead`

- [ ] **Step 1: Add `scrollTgSidebarToLead` and call it from `renderTgSidebar`**

Find:

```javascript
            bindTgSidebarScroll();
            renderTgSidebarVisibleWindow();

            if (_tgHeaderH === null || _tgLeadH === null) {
                measureTgSidebarRowHeights();
            }

            updateUrgentBadge();
            renderTgStats();
        }

        function renderTgSidebarVisibleWindow() {
```

Replace with:

```javascript
            bindTgSidebarScroll();
            renderTgSidebarVisibleWindow();
            scrollTgSidebarToLead(selectId);

            if (_tgHeaderH === null || _tgLeadH === null) {
                measureTgSidebarRowHeights();
            }

            updateUrgentBadge();
            renderTgStats();
        }

        // Scrolls #tgLeadList so the given lead's row is inside the viewport, but only
        // if it currently isn't (never fights a scroll position that's already fine).
        function scrollTgSidebarToLead(leadId) {
            if (!leadId) return;
            const list = document.getElementById('tgLeadList');
            if (!list) return;
            const idx = _tgSidebarRows.findIndex(r => r.type === 'lead' && r.leadId === String(leadId));
            if (idx === -1) return;

            const rowTop    = _tgSidebarOffsets[idx];
            const rowH      = _tgLeadH || 68;
            const rowBottom = rowTop + rowH;
            const viewTop    = list.scrollTop;
            const viewBottom = viewTop + (list.clientHeight || 400);

            if (rowTop < viewTop) {
                list.scrollTop = rowTop;
                renderTgSidebarVisibleWindow();
            } else if (rowBottom > viewBottom) {
                list.scrollTop = rowBottom - (list.clientHeight || 400);
                renderTgSidebarVisibleWindow();
            }
        }

        function renderTgSidebarVisibleWindow() {
```

- [ ] **Step 2: Verify by grep**

Run: `grep -n "function scrollTgSidebarToLead" index.html`
Expected: 1 match

- [ ] **Step 3: Manual test**

With the same large-list test setup as Task 2 Step 4: scroll the sidebar far down, then call `selectTgLead('<id-of-a-lead-currently-scrolled-out-of-view>')` from the console. The sidebar should scroll to bring that lead into view and highlight it as active.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(tg-sidebar): auto-scroll to selected lead when off-screen

renderTgSidebar(selectId) now brings the selected lead's row into the
visible window if it's currently scrolled out of view, instead of
silently rendering with no visual indication of which lead is active."
```

---

### Task 4: Incoming-message pulse survives virtualization

**Files:**
- Modify: `index.html:3622-3630` (inside `subscribeToLeads`)

- [ ] **Step 1: Scroll the lead into the window before pulsing**

Find:

```javascript
                            } else if (hasNewMsg && updLead.vkPeerId) {
                                showToast('📨 Новое от VK: ' + (updLead.name || 'Лид'), 6000);
                                // Pulse the sidebar item
                                const el = document.querySelector('[data-lead-id="' + String(updLead.id) + '"]');
                                if (el) {
                                    el.classList.add('li-vk-incoming');
                                    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                                    setTimeout(function() { el.classList.remove('li-vk-incoming'); }, 2200);
                                }
                            } else if (hasNewMsg && updLead.tgChatId) {
```

Replace with:

```javascript
                            } else if (hasNewMsg && updLead.vkPeerId) {
                                showToast('📨 Новое от VK: ' + (updLead.name || 'Лид'), 6000);
                                // Pulse the sidebar item — bring it into the virtualized window first if it's not currently rendered
                                scrollTgSidebarToLead(String(updLead.id));
                                const el = document.querySelector('[data-lead-id="' + String(updLead.id) + '"]');
                                if (el) {
                                    el.classList.add('li-vk-incoming');
                                    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                                    setTimeout(function() { el.classList.remove('li-vk-incoming'); }, 2200);
                                }
                            } else if (hasNewMsg && updLead.tgChatId) {
```

- [ ] **Step 2: Verify by grep**

Run: `grep -n "scrollTgSidebarToLead" index.html`
Expected: 3 matches (the function definition from Task 3, the call inside `renderTgSidebar`, and this new call inside `subscribeToLeads`)

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "fix(tg-sidebar): scroll incoming-VK-message lead into view before pulsing

The pulse animation looked up the lead's DOM node directly via
querySelector, which silently no-ops if the row isn't in the
virtualized window. Now scrolls it into view first via the same
helper used for lead selection."
```

---

### Task 5: Arrow Up/Down keyboard navigation uses the full row list, not the DOM

**Files:**
- Modify: `index.html:8294-8306` (global keydown handler)

- [ ] **Step 1: Replace the DOM-order lookup with `_tgSidebarRows`**

Find:

```javascript
            // Arrow keys: navigate leads in sidebar
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                const list = document.getElementById('tgLeadList');
                if (!list) return;
                const items = Array.from(list.querySelectorAll('.lead-item[data-lead-id]'));
                if (!items.length) return;
                event.preventDefault();
                const curIdx = items.findIndex(function(el) { return el.dataset.leadId === String(currentChatLeadId); });
                const nextIdx = event.key === 'ArrowDown'
                    ? Math.min(curIdx + 1, items.length - 1)
                    : Math.max(curIdx - 1, 0);
                const nextId = items[nextIdx] && items[nextIdx].dataset.leadId;
                if (nextId) { selectTgLead(nextId); items[nextIdx].scrollIntoView({ block: 'nearest' }); }
                return;
            }
```

Replace with:

```javascript
            // Arrow keys: navigate leads in sidebar
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                const leadRows = _tgSidebarRows.filter(r => r.type === 'lead');
                if (!leadRows.length) return;
                event.preventDefault();
                const curIdx = leadRows.findIndex(r => r.leadId === String(currentChatLeadId));
                const nextIdx = event.key === 'ArrowDown'
                    ? Math.min(curIdx + 1, leadRows.length - 1)
                    : Math.max(curIdx - 1, 0);
                const nextId = leadRows[nextIdx] && leadRows[nextIdx].leadId;
                if (nextId) selectTgLead(nextId);
                return;
            }
```

Note: `selectTgLead()` already calls `renderTgSidebar(currentChatLeadId)` (Task 3 wires `scrollTgSidebarToLead` into that call), so the explicit `scrollIntoView` from the old code is no longer needed here — the new active lead is guaranteed to be scrolled into view as part of the normal selection flow, whether or not it was previously rendered.

- [ ] **Step 2: Verify by grep**

Run: `grep -n "_tgSidebarRows.filter(r => r.type === 'lead')" index.html`
Expected: 1 match

- [ ] **Step 3: Manual test**

Open the TG-first sidebar, select a lead, press Arrow Down repeatedly past the bottom of the currently-visible window. The selection should keep advancing through the full list (not stop at whatever was originally rendered), and the sidebar should scroll to follow it.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "fix(tg-sidebar): arrow-key nav reads the full row list, not rendered DOM

Under virtualization, querySelectorAll('.lead-item') only returns the
currently-rendered subset, which would silently cap Arrow-key
navigation at the edge of the visible window. Now walks
_tgSidebarRows (the full logical list) instead."
```

---

### Task 6: Tab/Shift+Tab at the rendered window's edge reveals the next row

**Files:**
- Modify: `index.html` — `renderTgSidebar` (add a call) and add `bindTgSidebarTabExpansion`

Accessibility-lead review finding (Minor, but explicitly called out as something to implement, not silently drop): today, Tab walks every `.lead-item` in the sidebar. Under virtualization, Tab silently stops at whichever row happens to be first/last in the currently-rendered window — a keyboard/screen-reader user scanning the list (without wanting to select anything, which is what Arrow-keys are for) has no way to reveal more rows except scrolling by mouse. This only needs to handle the boundary of the *virtualized* section — if "Закрытые" is expanded, Tab-expansion doesn't reach into it; mouse/scroll still work there as they do today, and that's an accepted limitation, not a bug to chase further.

- [ ] **Step 1: Add `bindTgSidebarTabExpansion` and call it from `renderTgSidebar`**

Find:

```javascript
            bindTgSidebarScroll();
            renderTgSidebarVisibleWindow();
            scrollTgSidebarToLead(selectId);

            if (_tgHeaderH === null || _tgLeadH === null) {
                measureTgSidebarRowHeights();
            }

            updateUrgentBadge();
            renderTgStats();
        }

        // Scrolls #tgLeadList so the given lead's row is inside the viewport, but only
```

Replace with:

```javascript
            bindTgSidebarScroll();
            bindTgSidebarTabExpansion();
            renderTgSidebarVisibleWindow();
            scrollTgSidebarToLead(selectId);

            if (_tgHeaderH === null || _tgLeadH === null) {
                measureTgSidebarRowHeights();
            }

            updateUrgentBadge();
            renderTgStats();
        }

        // Tab at the last rendered row (or Shift+Tab at the first) extends the virtualized
        // window by one row instead of just leaving the list — otherwise a keyboard user
        // scanning the sidebar (not selecting) can't reveal rows beyond what's rendered.
        function bindTgSidebarTabExpansion() {
            if (_tgSidebarTabBound) return;
            const list = document.getElementById('tgLeadList');
            if (!list) return;
            list.addEventListener('keydown', function(e) {
                if (e.key !== 'Tab') return;
                const rendered = document.querySelectorAll('#tgLeadList .lead-item[data-lead-id]');
                if (!rendered.length) return;
                const forward = !e.shiftKey;
                const boundaryEl = forward ? rendered[rendered.length - 1] : rendered[0];
                if (document.activeElement !== boundaryEl) return;

                const leadRows = _tgSidebarRows.filter(r => r.type === 'lead');
                const curIdx = leadRows.findIndex(r => r.leadId === boundaryEl.dataset.leadId);
                // curIdx is -1 if boundaryEl belongs to the unvirtualized "Закрытые" section
                // (only reachable when that section is expanded) — let Tab behave normally there.
                if (curIdx === -1) return;
                const nextIdx = forward ? curIdx + 1 : curIdx - 1;
                if (nextIdx < 0 || nextIdx >= leadRows.length) return; // truly first/last active lead — let Tab leave the list

                e.preventDefault();
                const nextLeadId = leadRows[nextIdx].leadId;
                scrollTgSidebarToLead(nextLeadId);
                const nextEl = document.querySelector('[data-lead-id="' + nextLeadId + '"]');
                if (nextEl) nextEl.focus();
            });
            _tgSidebarTabBound = true;
        }

        // Scrolls #tgLeadList so the given lead's row is inside the viewport, but only
```

- [ ] **Step 2: Verify by grep**

Run: `grep -n "function bindTgSidebarTabExpansion" index.html`
Expected: 1 match

- [ ] **Step 3: Trace the boundary logic by hand**

Confirm: `scrollTgSidebarToLead(nextLeadId)` (from Task 3) runs synchronously and calls `renderTgSidebarVisibleWindow()` internally if a scroll was needed — so by the time `document.querySelector('[data-lead-id="' + nextLeadId + '"]')` runs on the next line, that row is guaranteed to exist in the DOM (either it didn't need scrolling and was already there, or it does now). No `requestAnimationFrame`/`setTimeout` wait is needed here, unlike the throttled scroll-event path.

- [ ] **Step 4: Manual test**

Tab into the sidebar until focus reaches the last currently-rendered `.lead-item` (don't press Enter/Space — just Tab). Press Tab once more — confirm the sidebar scrolls down one row and focus moves to the newly-revealed row, instead of Tab leaving the sidebar for the next focusable element on the page. Repeat with Shift+Tab at the first rendered row, moving upward.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat(tg-sidebar): Tab/Shift+Tab at rendered window edge reveals next row

Without this, a keyboard user Tabbing through the sidebar (scanning,
not selecting — that's what Arrow-keys are for) would silently hit
the edge of whatever's currently rendered with no way to reveal more
rows except scrolling by mouse. Accessibility-lead review finding."
```

---

### Task 7: Manual QA

**Files:** none (verification only)

- [ ] **Step 1: Deploy**

This repo has no build step for `index.html` (served directly, see `netlify.toml`). Deploy via `git push origin main` (Netlify auto-deploys). **Confirm with the user and get explicit go-ahead before pushing** — this changes live, user-facing behavior for the manager's production CRM.

- [ ] **Step 2: Run through the checklist from the spec's § Тестирование**

1. Normal-size lead list (current real data) — sidebar looks and behaves identically to before (sections, sorting, "Закрытые" toggle, badges, hot-lead pills)
2. Large synthetic lead count (~300, added temporarily via console, not saved to DB) — scrolling stays smooth, DevTools confirms only a small number of `.lead-item` nodes exist in the DOM at once
3. Incoming VK message for a lead that's scrolled out of view — sidebar scrolls to it and shows the pulse animation
4. Select a lead via `Ctrl+K` command palette or search when it's off-screen — sidebar scrolls to it and highlights it active
5. "Закрытые" section — expand/collapse still works exactly as before, unaffected by virtualization
6. Change the search filter — list rebuilds correctly, scroll resets to top, no stale rows from the previous filter
7. Arrow Up/Down keyboard navigation — advances through the *entire* list (not just the initially-rendered window), sidebar follows the selection
8. Typical daily use (current real lead count, well under the "hundreds" threshold that motivated this work) — no regressions, no visual glitches
9. Screen reader spot-check (NVDA/VoiceOver): open the sidebar, navigate into a section — confirm you hear position/size info (e.g. "2 of 6") reflecting the *section's* count, not the whole list's; cross a section boundary and confirm the announced name changes (e.g. "Требуют действия: ..." → "В диалоге: ...") since the visible headers are decorative/`aria-hidden`
10. Tab into the sidebar, Tab repeatedly past the last rendered row — confirm it reveals the next row instead of leaving the sidebar; repeat with Shift+Tab at the first row
11. Focus a row via Tab (don't activate it), then scroll far enough to evict it — confirm focus lands on the row's new position or on the list container, never silently on `<body>` (check via screen reader or `document.activeElement` in DevTools)

- [ ] **Step 3: Verify the height-measurement correction**

Open DevTools console right after a page load with a non-empty sidebar. `_tgHeaderH` and `_tgLeadH` should be `null` before the very first `renderTgSidebar()` call and hold real measured pixel values (not `null`, not the 32/68 fallback constants unless those happen to be exactly correct) immediately after. If they stay `null`, `measureTgSidebarRowHeights()` isn't finding `.sb-section-lbl`/`.lead-item` elements — check that at least one header and one lead row exist in the very first rendered window.

No commit for this task — it's verification of already-committed work.

---

## Self-Review Notes

- **Spec coverage:** "Закрытые" section stays unvirtualized → Task 1 (`buildTgSidebarRows` puts it in `closedHtml`, always appended as a fixed suffix, never sliced). Active sections collapsed into a flat row array with cumulative offsets → Task 1. Real-DOM height measurement, not hardcoded → Task 2 (`measureTgSidebarRowHeights`, with 32/68 as the initial fallback only, explicitly called out in the spec). Two-tier render (expensive rebuild vs. cheap re-slice) → Task 2 (`renderTgSidebar` vs `renderTgSidebarVisibleWindow`). `requestAnimationFrame`-throttled scroll handling → Task 2 (`bindTgSidebarScroll`). Overscan buffer of 8 rows → Task 2 (`OVERSCAN_ROWS`). Pulse-animation edge case → Task 4. Selection-scroll edge case → Task 3. `updateTgSidebarItem`/`filterTgSidebar` compatibility (both just call `renderTgSidebar`, untouched) → confirmed unchanged by this plan, no task modifies them. "Out of scope" items (table virtualization, ES-module migration, diff-rendering, virtualizing "Закрытые") — untouched by all tasks, confirmed by file map.
- **Found during planning, not in the spec:** the Arrow-key navigation bug (Task 5) and the corrected CSS class names (noted at the top of this plan) — both discovered by reading the actual code rather than re-deriving from the spec's prose, per the "explore project context" step. Documented rather than silently absorbed.
- **Found via accessibility-lead pre-implementation review, not in the spec:** `aria-setsize`/`aria-posinset` + section-name-in-`aria-label` (Task 1, Steps 3-6), focus preservation across scroll-triggered re-renders (Task 2), and Tab/Shift+Tab window expansion (Task 6) — all three folded into the plan before any code was written, matching the "review markup/design before writing the JS, not after" workflow already used for the VK-broadcast feature. Two findings from that review needed no code change: the incoming-message toast is already `aria-live` (confirmed by reading `index.html:8872` directly, correcting an initial sub-agent claim that it wasn't), and the spacer divs were already correctly `aria-hidden`.
- **Type/naming consistency:** row descriptor shape `{type: 'header'|'lead', html, leadId?}` is introduced in Task 1 (`buildTgSidebarRows`) and consumed identically everywhere else — `renderTgSidebarVisibleWindow` (Task 2) only reads `.html`, `scrollTgSidebarToLead` (Task 3), the Arrow-key handler (Task 5), and `bindTgSidebarTabExpansion` (Task 6) all filter by `.type === 'lead'` and read `.leadId` the same way. No place introduces a third row type or a differently-named field. `renderTgLeadItem`'s new `posinset`/`setsize`/`sectionLabel` parameters (Task 1) are optional (guarded with `typeof === 'number'`/truthiness checks), so the function stays safe to call without them — though every call site touched by this plan does pass them. `_tgHeaderH`/`_tgLeadH`/`_tgSidebarOffsets`/`_tgSidebarTotalHeight`/`_tgSidebarRows`/`_tgSidebarTabBound` are each declared once (Task 1) and referenced by the same spelling in every later task.
- **No automated tests added:** matches existing project convention — zero test files exist for `index.html` in this repo (also the approach taken by both prior executed plans in this repo, the smart-TG-bot and VK-broadcast plans).
