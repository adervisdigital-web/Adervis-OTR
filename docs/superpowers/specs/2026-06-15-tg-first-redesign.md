# Spec: TG-First Redesign + Objection Handler

**Date:** 2026-06-15  
**Status:** Approved  
**Scope:** `index.html` (single-file app, ~3600 lines, Vanilla JS + CSS)

---

## Goal

Replace the table-first CRM feeling with a Telegram-style execution tool. The main screen becomes a two-column messenger where the manager works through leads — not a spreadsheet of records.

Two features ship together because they share the same chat UI:
1. **TG-First Layout Redesign** — new main screen structure
2. **AI Objection Handler** — auto-classify client replies, surface 2-3 pre-written responses

---

## Feature 1: TG-First Layout

### Layout Structure

```
┌─────────────────────────────────────────────────────────┐
│  HEADER: logo · [💬 Диалоги] [⚙️ Скрипты] · [≡ Таблица] [🌙] [+ Лид]  │
├──────────────┬──────────────────────────────────────────┤
│   SIDEBAR    │              MAIN PANEL                  │
│   248px      │  (state A: funnel hero)                  │
│              │  (state B: chat view)                    │
└──────────────┴──────────────────────────────────────────┘
```

### Header

- Logo left, two mode tabs center (`💬 Диалоги` active by default, `⚙️ Скрипты`), actions right
- Right side: `≡ Таблица` button (outline) → switches to full-screen `#table-view`; theme toggle `🌙`; `+ Лид` primary
- Скрипты tab: opens existing settings modal (no change to scripts logic)

### Sidebar (248px, fixed)

Three collapsible sections rendered in order:

**Section 1: 🔥 Требуют действия**  
Leads where `isUrgent(lead) === true`:
- `lead.status === 2` (В диалоге) AND last client message is unread/unanswered for 2+ days (`row-stale` logic)
- OR `lead.remindAt` is today or past

Each item: left-border `#f22822` (urgent) or `#f6bd3a` (warm reminder), avatar-initials, name, last message preview, relative time, status badge.

**Section 2: 💬 В диалоге**  
Leads with `messages.length > 0` and NOT in section 1. Sorted by last message date descending.

**Section 3: 📋 Все лиды**  
Leads with `messages.length === 0`. Opacity `0.55`, italic "нет сообщений", badge "новый". Sorted by `updatedAt` descending.

**Lead item anatomy:**
```
[avatar] [name          ] [time  ]
         [last msg...   ] [badge ]
```
- Avatar: 32×32 circle, gradient by platform (VK=purple, Inst=orange, TG=blue, other=grey), initials 2 chars
- Active item: left border `#5e6ad2`, background `rgba(94,106,210,.10)`
- Click → `selectTgLead(id)` (existing function, keep as-is)

**Search input** at top of sidebar (existing `tgSearchInput` logic, keep).

### Main Panel — State A: No lead selected (Funnel Hero)

The existing `#tgEmpty` div (`aria-label="Выберите диалог из списка слева"`) is replaced with the funnel hero content. Its show/hide logic (`selectTgLead` / `#tgEmpty.style.display`) stays the same — only the inner HTML changes.

Centered vertically and horizontally:
- Label: "ВОРОНКА ПРОДАЖ" (uppercase, muted)
- Bar chart: 4 columns (Новые / Ледокол / Диалог / Успех), heights proportional to counts
- Colors: `#6366f1` → `#7c3aed` → `#8b5cf6` → `#27a644`
- Below each bar: count (colored) + stage name + conversion % (violet, except first column)
- Conversion % = `count[n] / count[n-1] * 100`, rounded to 0 decimal
- Subtitle below chart: "← выбери лид для работы" (muted)
- Data source: existing `leads[]` array, computed same as `updateDashboard()`

### Main Panel — State B: Chat view (existing logic, extended)

Keep all existing chat HTML/JS intact. Changes:
- Move chat into the right panel of the TG-First layout (it already lives in `#tg-view`)
- The `#tg-view` div IS the new default view — `#table-view` becomes secondary
- On app init: show `#tg-view` by default; `≡ Таблица` button toggles to `#table-view`

### View Switching

```js
// On init: show tg-view by default
showTgView()   // existing or new function

// Header button "≡ Таблица"
function toggleTableView() {
  const isTable = document.getElementById('table-view').style.display !== 'none'
  document.getElementById('table-view').style.display = isTable ? 'none' : 'block'
  document.getElementById('tg-view').style.display = isTable ? 'flex' : 'none'
}
```

### Empty States

- No leads at all: sidebar shows "Нет лидов. Нажмите + Лид чтобы начать." centered in list
- No urgent leads: section 1 hidden entirely (don't render empty section header)
- No leads with messages: section 2 hidden entirely

---

## Feature 2: AI Objection Handler

### Trigger

When user submits a client message (tab = "Клиент ответил") via `submitChatInput()`:
1. Message is logged to `lead.messages[]` as `fromClient: true` (existing)
2. **New:** call `classifyClientMessage(text)` async, non-blocking
3. If classification = "objection" → call `loadObjectionSuggestions(text, reason)`
4. Show objection panel above textarea

### Classification — `classifyClientMessage(text)`

Gemini API call using the same inline `fetch` pattern already in the codebase (lines ~2497-2504). No utility wrapper exists — copy the pattern directly:

**Prompt:**
```
Ты помощник менеджера по продажам видеопродакшена.
Клиент написал: «{text}»

Определи тип сообщения и главную причину (если возражение).
Ответь строго JSON:
{
  "type": "interest" | "objection" | "rejection" | "unclear",
  "reason": "no_budget" | "has_smm" | "send_examples" | "think_later" | "other" | null,
  "reason_text": "краткое название причины по-русски или null"
}
```

Response parsed with `safeParseJSON()`. On error or timeout (>8s) → silently skip, no panel shown.

### Objection Suggestions — `loadObjectionSuggestions(text, reason)`

Second Gemini call:

**Prompt:**
```
Ты менеджер по продажам видеопродакшена ADERVIS.
Клиент ответил: «{text}»
Тип возражения: {reason}

Напиши 3 коротких ответа менеджера (каждый 1-2 предложения, живой разговорный стиль, без официоза).
Каждый с коротким заголовком (2-4 слова).
Ответь строго JSON: [{"title": "...", "text": "..."}, ...]
```

### Objection Panel UI

Rendered above `.chat-input` area, inside the chat bottom section. Hidden by default (`display: none`).

```html
<div id="objectionPanel" class="objection-panel" style="display:none;">
  <div class="op-header">
    <span class="op-badge">🟡 Возражение · <span id="opReasonText"></span> — кликни вариант чтобы вставить</span>
    <button class="op-close" onclick="hideObjectionPanel()">✕</button>
  </div>
  <div id="opSuggestions" class="op-suggestions"></div>
</div>
```

**On click of a suggestion:** populate `#chatInputMain` with `suggestion.text`, focus textarea. Do NOT auto-submit.

**Panel lifecycle:**
- Show: after Gemini responds with objection + suggestions
- Hide: `✕` button, or when user selects different lead, or when tab switches to "Я написал"
- Loading state: show "🤖 Анализирую ответ..." spinner badge while Gemini is working

**Classification badge in chat feed** (inline, minimal):  
After client message is logged, append a small badge in the feed (no panel):
- `🟢 Интерес` → `rgba(39,166,68,.1)` green
- `🟡 Возражение` → `rgba(246,189,58,.1)` yellow (panel also opens)
- `🔴 Отказ` → `rgba(242,40,34,.1)` red (no panel, just badge)

Badge is NOT stored in `lead.messages[]` — it's ephemeral UI, recomputed on next classify.

---

## Data Model Changes

None. All new UI is computed from existing `leads[]` structure. No new fields, no Supabase schema changes.

---

## CSS Architecture

New classes added to existing `<style>` block:

| Class | Purpose |
|-------|---------|
| `.sb-section-lbl` | Section header in sidebar (replaces existing `.sec-lbl` pattern) |
| `.lead-item` | Sidebar lead row (replaces `.tg-lead-item`) |
| `.lead-item.urgent` | Red left border |
| `.lead-item.warm` | Yellow left border |
| `.lead-item.new-lead` | Dimmed, no messages |
| `.funnel-hero` | Centered funnel container |
| `.funnel-bar` | Individual bar in chart |
| `.objection-panel` | AI suggestions panel above input |
| `.op-badge` | Classification label |
| `.op-sugg` | Clickable suggestion row |
| `.classify-badge` | Inline badge in chat feed |

Existing `.tg-lead-item`, `.tg-sidebar-header`, etc. replaced or kept for backwards compat during transition.

---

## JS Functions

| Function | Change |
|----------|--------|
| `renderTgSidebar()` | Rewrite to render 3 sections instead of flat list |
| `renderTgLeadItem()` | Extend to support section context (urgent/active/new) |
| `initApp()` | Default to tg-view (show tg, hide table) |
| `toggleTableView()` | New — swap table-view / tg-view |
| `renderFunnelHero()` | New — draw funnel on empty right panel |
| `classifyClientMessage(text)` | New — Gemini call, returns `{type, reason, reason_text}` |
| `loadObjectionSuggestions(text, reason)` | New — Gemini call, returns `[{title, text}]` |
| `showObjectionPanel(suggestions, reasonText)` | New — render and show panel |
| `hideObjectionPanel()` | New — hide and clear panel |
| `submitChatInput()` | Extend — after logging client msg, call `classifyClientMessage()` |

---

## Out of Scope

- Playbook sequences (roadmap #4)
- TG notifications (roadmap #15)
- Command palette Ctrl+K (roadmap #18)
- Any changes to scripts editor, bulk import, CSV export
- Mobile/responsive layout

---

## Acceptance Criteria

1. On load, `#tg-view` is visible, `#table-view` is hidden
2. `≡ Таблица` button toggles between views
3. Sidebar shows 3 sections; sections without leads are hidden
4. Leads with `messages.length === 0` appear in section 3 with italic "нет сообщений"
5. When no lead is selected, funnel hero is shown with correct counts and %
6. Funnel updates when leads change (realtime)
7. When client message is submitted, Gemini is called async
8. If objection detected: panel appears above input with 3 suggestions
9. Clicking suggestion fills textarea (does not auto-send)
10. `✕` dismisses panel; switching leads clears panel
11. If Gemini fails/times out: no error shown, panel simply doesn't appear
12. Inline classification badge appears in chat feed for all message types
