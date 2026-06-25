# Navigation & UX Redesign — ADERVIS OTR

**Date:** 2026-06-12  
**Scope:** Header menu + chat script panel + message input + 5 logic fixes  
**File:** `Adervis LidGen.html` (single-file vanilla JS app)

---

## 1. Header Menu (Экран: список лидов)

### Problem
6 visually identical `btn-outline` buttons with unclear names. "Скрипты" doesn't describe a template editor. "Бэкап" and "Импорт" are separate buttons for related data operations.

### Solution: 4 elements instead of 6

| Element | Was | Now |
|---|---|---|
| ⚙️ icon button | «Скрипты» (btn-outline) | Icon-only `title="Настройки шаблонов"` → opens `settingsModal` |
| ℹ️ icon button | «Инфо» (btn-outline) | Icon-only `title="Справка"` → opens `infoModal` |
| «📁 Данные ▾» dropdown | «Бэкап» + «Импорт» + «Экспорт CSV» as 3 separate buttons | Single dropdown with 3 items: «📊 Экспорт CSV», «💾 Сохранить бэкап», «📂 Восстановить из файла» |
| «+ Загрузить лиды» | «📥 Загрузить базу» (btn-primary) | Renamed to «+ Загрузить лиды», same `openBulkModal()` handler |

**Dropdown behaviour:** Pure CSS/JS — clicking the chip toggles a floating menu. Click outside closes it. No dependencies.

**Icon button sizes:** `padding: 7px 9px` matching existing `.btn` height so the row stays aligned.

---

## 2. Chat — Right Script Panel

### Problem
Each script card had its own «Скопировать» + «Отправлено ✓» pair → N×2 buttons with no clear relationship. A second pair of copy/sent buttons appeared in the draft area below.

### Solution: Click-to-select card + 2 buttons total

1. **Script cards** — clicking a card selects it (visual highlight) and populates the `#chatDraftArea` textarea. No per-card buttons.
2. **AI chip** (`✨ AI-ответ`) remains as a standalone chip below the cards — clicking triggers AI generation into `#chatDraftArea`.
3. **Draft section** — one textarea `#chatDraftArea` + exactly 2 buttons:
   - `📋 Копировать` — copies draft text to clipboard
   - `✓ Отправлено` — records message to history (see Logic Fix #1) and clears draft

---

## 3. Chat — Message Input Area (Left Column Bottom)

### Problem
Single-line input `#chatInputMain` only for client messages. No way to manually log a manager message from outside a template.

### Solution: Two-tab textarea

Two tabs above a shared `<textarea>`:

- **Tab «← Клиент ответил»** (default) — submits as `fromClient: true` message via existing `submitClientMessageFromChat()`
- **Tab «✍️ Я написал»** — submits as `fromClient: false` (manager message), for cases when the manager wrote something outside the templates

**Keyboard shortcut:** `Ctrl+Enter` submits whichever tab is active.  
**Input type change:** single-line `<input>` → `<textarea>` (min-height 60px, resizable).

---

## 4. Logic Fix #1 — «Отправлено» records to history

**Current:** Clicking «Отправлено ✓» in the script panel only calls `markSent()` which updates `updatedAt` but does NOT add a message to the chat history. The left feed stays empty for manager messages.

**Fix:** When «✓ Отправлено» is clicked:
1. Take the current text of `#chatDraftArea`
2. Call `addMessage(leadId, { text, fromClient: false })` — same function used for client messages
3. Clear `#chatDraftArea`
4. Re-render `#chatFeedMain`

This makes the left feed a complete record of the conversation.

---

## 5. Logic Fix #2 — Stage advance button: «From → To» format

**Current:** Button label is `${stage.sentLabel} →` — e.g. «Ледокол отправлен →», «Презентация отправлена →». Each stage has a different label, making the outcome unpredictable.

**Fix:** Button label = `«${currentStageName} → ${nextStageName}»`

Examples:
- Stage 0→1: `Ледокол → В диалоге`
- Stage 1→2: `В диалоге → Презентация`  
- Stage 2→3: `Презентация → Успех`

Stage names come from the existing stages array. If already at max stage, button is hidden or disabled.

---

## 6. Logic Fix #3 — «Я написал» tab is for custom messages

The «✍️ Я написал» tab in the bottom-left handles messages the manager sent that don't come from a template (e.g. a quick "ок, понял"). This is separate from the «✓ Отправлено» flow in the right panel which handles template-based messages.

Both flows write `fromClient: false` messages into the same messages array. They are complementary, not duplicates.

---

## 7. Logic Fix #4 — «N дней без ответа» in table

**Current:** Stale leads (2+ days) show a `⏳ 2+ дня` badge in the name cell via `row-stale` class.

**Fix:** Replace the binary stale indicator with a precise counter shown in the **name cell** for all active leads (status 0–2):

- `< 1 day` → no indicator (fresh)
- `1 day` → `1 день` in `--muted` color
- `2 days` → `2 дня` in `--warning` color  
- `3+ days` → `N дней` in `--danger` color + bold

Leads with status 3 (Успех) or 4 (Отказ) show no counter.

Implementation: compute `daysPassed` inline in `renderTable()` — same calculation as line 1013: `Math.floor((now - lead.updatedAt) / 86400000)`. The `stageNames` array already exists at line 1141 inside `renderScriptPanel` — extract it to module scope so both `renderTable` and stage-advance logic can share it.

---

## 8. Logic Fix #5 — Quick «Отказ» button in table

**Current:** To mark a lead as refused, manager must open the chat view, find the stage change button or status selector.

**Fix:** Add a `✕` icon button in the **«Действие»** column, next to «Диалог →»:

```
[ Диалог → ]  [ ✕ ]
```

- Clicking `✕` sets `lead.status = 4` (Отказ/Игнор) immediately
- Shows a brief inline confirmation: the status badge updates in-place (no modal)
- Can be undone by clicking «Диалог →» and changing status back manually

Button style: `btn-danger` variant, small size. Hidden for leads already at status 3 or 4.

---

## Data Model

No changes to the lead data model `{ id, name, link, contact, bizType, status, updatedAt, notes, clientReply }` — messages are already stored in `lead.messages[]` (added in a previous session).

---

## Implementation Notes

- **Dropdown component:** Build a lightweight custom dropdown (no library). CSS: `position: absolute; top: calc(100% + 6px)`. JS: toggle class `open`, close on outside click via `document.addEventListener('click', ...)` with `once: true` or explicit removal.
- **Icon buttons:** Reuse `.btn.btn-icon` style (already defined in CSS as `padding: 7px 9px; color: var(--muted)`).
- **Script card click:** Add `onclick="selectScriptCard(this, template)"` that (a) removes `.selected` from siblings, (b) adds `.selected` to clicked card, (c) sets `chatDraftArea.value = resolveCTA(template.text)`.
- **Tab state:** A module-level variable `let chatInputTab = 'client'` tracks which tab is active. Switching tabs clears the textarea.
- **Ctrl+Enter handler:** Single `keydown` listener on the textarea checks `e.ctrlKey && e.key === 'Enter'`.
