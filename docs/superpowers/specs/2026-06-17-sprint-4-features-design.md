# Sprint: 4 Features Design Spec
**Date:** 2026-06-17  
**Project:** ADERVIS | OTR  
**Status:** Approved

---

## Overview

Four independent features implemented in one sprint. All are additive — no existing logic removed.

---

## Feature 1: Daily Goal Counter

### What
A touch counter in the TG-view header: `12 / 20 сегодня` with color coding.

### Definition of "touch"
Any outgoing message (`fromClient: false`) sent today (local date, midnight boundary) found in `messages[]` across all leads. Counted client-side from `window._leads`.

### UI Placement
Right side of the TG-view top header bar, between existing controls and the right edge.

```
[  ADERVIS | OTR    ≡ Таблица  Настройки  ]   [ 12 / 20 сегодня ]
```

Color states:
- Gray: `< 50%` of goal
- Yellow (`--warning`): `>= 50%` and `< 100%`
- Green (`--success`): `>= 100%`

### Interaction
Click on the counter → inline popover (not modal) with:
- Input field pre-filled with current goal
- "Сохранить" button
- Closes on outside click or Esc

### Data
- Goal value stored in `workspace_settings` table, column `daily_goal` (integer, default 20)
- Loaded on app init alongside other workspace settings
- Saved via existing `saveWorkspaceSettings()` pattern
- Counter recalculates on every `renderTgView()` call (no separate timer)

### Functions
- `countTodayTouches()` → integer — iterates `window._leads`, filters messages by date
- `renderDailyGoalWidget()` → HTML string — renders the counter badge
- `saveDailyGoal(n)` → updates Supabase + local cache

---

## Feature 2: Archive Instead of Delete

### What
Soft-delete leads. "Delete" button → "Archive" button. Archived leads hidden by default, viewable via filter toggle.

### Data Layer
- Add column `archived_at TIMESTAMPTZ` to `leads` table (nullable, default NULL)
- All existing queries add `.is('archived_at', null)` filter — archived leads excluded automatically
- `archiveLead(id)` → sets `archived_at = now()` in Supabase
- `restoreLead(id)` → sets `archived_at = null`
- Permanent deletion: leads with `archived_at < now() - interval '30 days'` deleted on app load (one-time cleanup query)

### UI Changes
- Lead Drawer: replace "Удалить" button with "В архив 🗃️"
- Table view: same replacement in row action menu
- TG sidebar: no delete button there (already not present)

### Archive View
- New filter toggle at bottom of TG sidebar: "🗃️ Архив (N)"
- When active: loads archived leads separately, shows in sidebar with muted styling
- Archived leads show "Восстановить" button instead of "В архив"
- No playbook, no AI scoring, no daily count for archived leads

### No Confirmation Dialog
Archive is reversible — no confirm prompt needed. Show toast: "Лид архивирован · Восстановить" (the toast itself acts as undo via the restore action inline).

---

## Feature 3: AI Deal Score (%)

### What
Gemini-powered probability estimate shown as a visual indicator in the chat header.

### When It Runs
- Triggered when a lead is opened (`selectTgLead`) AND has at least 1 message from client (`fromClient: true`)
- Re-triggered when a new message is saved to `messages[]` (`saveMessage` path)
- Not triggered for leads with zero messages or zero client replies

### Gemini Prompt
System: "Ты — эксперт по холодным продажам. Оцени вероятность сделки от 0 до 100 на основе диалога."  
User: last 10 messages of dialog (role + text) + bizType  
Expected response: strict JSON `{"score": 72, "reason": "Клиент спросил цену, но упомянул бюджетные ограничения"}`

### Data
- Field `deal_score` (integer 0–100) on lead row in Supabase
- Field `deal_score_reason` (text) — tooltip text
- Updated after each successful Gemini call
- Stale if no new messages since last call — no auto-refresh on timer

### UI
In `renderChatHeader()`, after lead name:
```
[Название лида]  [●●●○○ 67%]  [→ Следующий]  [📋]
```
- SVG arc gauge, radius ~14px, color: red(<30) → yellow(30-70) → green(>70)
- Hover tooltip shows `deal_score_reason`
- If score is null → not shown (no placeholder)

### Functions
- `fetchDealScore(lead)` → async, calls Gemini, updates Supabase + local lead object
- `renderScoreGauge(score, reason)` → HTML string with inline SVG arc

---

## Feature 4: Command Palette (Ctrl+K)

### What
Keyboard-first quick-action overlay. Two modes based on first character of input.

### Trigger
- `Ctrl+K` (or `Cmd+K` on Mac) → open palette
- `Esc` → close
- Opens from anywhere in the app

### Default Mode: Lead Search
Input without `/` prefix → fuzzy filter on `window._leads` by:
- `lead.name`
- `lead.link`
- `lead.bizType`
- `lead.contact`

Shows up to 10 results as rows:
```
[🟡] Кофейня Арома · vk.com/aroma · В диалоге
```
- Arrow keys navigate, Enter → `selectTgLead(id)` + close palette
- Switches to TG-view automatically if table-view was active

### Command Mode: `/` prefix
Typing `/` switches to command list. Available commands:

| Command | Action |
|---------|--------|
| `/new` | Open new lead modal |
| `/status` | Show sub-list: Новый / Ледокол / Диалог / Успех / Отказ → apply to current open lead |
| `/archive` | Archive current open lead |
| `/settings` | Open settings modal |
| `/scripts` | Open scripts editor |

Commands filtered by text after `/`. If no lead is open, `/status` and `/archive` are grayed out.

### UI
- Full-screen dark overlay (`rgba(0,0,0,0.5)`)
- Centered white/dark card, width 560px, max-height 400px
- Input at top with search icon
- Results list below, scrollable
- Active row highlighted with `--accent` background
- Keyboard: `↑↓` moves selection, `Enter` executes, `Esc` closes
- Click outside → close

### Functions
- `openPalette()` / `closePalette()` — toggle visibility, manage focus
- `renderPaletteResults(query)` — returns filtered leads or command list based on input
- `executePaletteItem(item)` — dispatches to correct handler
- Global `keydown` listener registered once on app init

---

## Data Migrations Required

| Change | Type |
|--------|------|
| `leads.archived_at TIMESTAMPTZ` | ALTER TABLE (SQL migration) |
| `leads.deal_score INTEGER` | ALTER TABLE (SQL migration) |
| `leads.deal_score_reason TEXT` | ALTER TABLE (SQL migration) |
| `workspace_settings.daily_goal INTEGER DEFAULT 20` | ALTER TABLE (SQL migration) |

All migrations additive (nullable or with default) — no existing data affected.

---

## Implementation Order

1. DB migrations (one SQL block)
2. Daily Goal widget
3. Archive feature
4. Deal Score AI
5. Command Palette
