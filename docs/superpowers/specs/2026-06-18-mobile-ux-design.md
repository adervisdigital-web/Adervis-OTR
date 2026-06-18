# ADERVIS OTR — Mobile UX Design Spec
**Date:** 2026-06-18  
**Status:** Approved  
**Breakpoint:** `@media (max-width: 768px)`  
**Scope:** Responsive mobile layer on top of existing desktop layout. Desktop untouched.

---

## 1. Architecture

Single breakpoint at `768px`. Below it, the two-panel desktop layout (sidebar + chat) is replaced by a stack-navigation pattern driven by Bottom Tab Bar. No new pages, no routing library — visibility toggling via CSS classes and two JS state variables: `mobileActiveTab` (`'dialogues' | 'table' | 'scripts'`) for the tab bar, and `mobileView` (`'list' | 'chat'`) for navigation within the Диалоги tab.

The existing JS logic (leads, scripts, AI, realtime) is reused as-is. Only the rendering layer changes on mobile.

---

## 2. Bottom Tab Bar

Fixed at bottom of viewport (`position: fixed; bottom: 0`). 5 items:

| Position | Icon | Label | Action |
|----------|------|-------|--------|
| 1 | 💬 | Диалоги | Show lead list (`mobileView = 'list'`) |
| 2 | 📊 | Таблица | Show table view (existing `#tableView`) |
| 3 | ⊕ | — | FAB: open "Add lead" modal (existing `openAddModal()`) |
| 4 | 📜 | Скрипты | Open scripts modal (existing) |
| 5 | ⚙️ | Ещё | Open bottom sheet with: Settings (Gemini key, VK, CTA), Theme toggle, Sign out |

**FAB (position 3):** Violet circle (`background: var(--primary)`), raised 10px above tab bar with border, font-size 22px. No label.

**Active tab:** Icon + label in `var(--primary)`, others in `var(--muted)`.

**Safe area:** `padding-bottom: env(safe-area-inset-bottom)` for iPhone home indicator.

---

## 3. Lead List Screen (`mobileView = 'list'`)

### Header
```
[ADERVIS | OTR]          [🔍] [daily goal badge]
```
- Title left, search icon + goal widget right
- Tapping 🔍 expands full-width search input (slides down, autofocuses)

### Lead sections (sticky headers)
Three sections rendered in order:

**🔥 Требуют действия** — leads with `status < 4` and `updatedAt` > 2 days ago  
**💬 В диалоге** — leads with `status === 2` (В диалоге) not overdue  
**📋 Все лиды** — remaining leads

Each section header: label + red/blue/muted badge with count. Sticky (`position: sticky; top: 0`).

### Lead row
```
[Avatar+dot] [Name          preview...] [time]
             [platform badge]
```
- Avatar: 36px circle, initials, `var(--primary)` or segment color
- Status dot: 8px circle bottom-right of avatar. Colors: red=просрочен, green=ответил, yellow=ждём, grey=new
- Name: 14px semibold. Preview: 12px muted, one line, ellipsis
- Platform badge: `VK` / `Inst` / `TG` pill, 10px
- Time: 11px muted, right-aligned
- Overdue rows: `border-left: 3px solid var(--danger)`
- Tap → `openChat(lead.id)` → `mobileView = 'chat'`

---

## 4. Chat Screen (`mobileView = 'chat'`)

Shown when user taps a lead. Bottom Tab Bar remains visible.

### Header
```
[← ] [Avatar] [Name]        [Status dropdown ▾]
              [Platform · bizType]    [score%]
```
- Back arrow `←` → `mobileView = 'list'`
- Score %: colored number (green/yellow/red), shown if `dealScore` exists
- Status dropdown: existing status selector, compact

### Message feed
- Full available height between header and input area
- Bubbles: manager right (violet), client left (dark bg)
- AI draft card: appears inline after client message when AI generates. Violet border, `✨` prefix. Tap → insert into textarea.
- Date separators as today

### Input area (fixed above tab bar)
```
[✨]  [textarea: Написать...]           [↑ send]
```
- `✨` button: calls `generateManagerSuggestion()` (existing). Shows spinner while loading.
- Textarea: auto-grows up to 4 lines, then scrolls
- Send button: `var(--primary)`, disabled when empty
- When keyboard opens: input area slides up with keyboard (`height: 100dvh`, `padding-bottom` adjusted via `visualViewport` API)

---

## 5. Keyboard Handling

Mobile keyboards resize the viewport. Use `visualViewport` API:

```js
if (window.visualViewport) {
  visualViewport.addEventListener('resize', () => {
    const keyboardH = window.innerHeight - visualViewport.height;
    inputArea.style.paddingBottom = keyboardH + 'px';
    messageList.style.paddingBottom = (keyboardH + inputAreaH) + 'px';
    // scroll to bottom
  });
}
```

---

## 6. Table View (mobile)

Existing `#tableView` adapted:
- Horizontal scroll for wide table (`overflow-x: auto`)
- Sticky first column (lead name)
- Action buttons below each row (stacked, full-width) instead of inline

---

## 7. CSS Strategy

One `@media (max-width: 768px)` block added at end of existing `<style>`:

```css
@media (max-width: 768px) {
  /* Hide desktop two-panel layout */
  .tg-layout { display: none; }
  .header { display: none; }
  
  /* Show mobile shells */
  #mobileShell { display: flex; }
  #mobileTabBar { display: flex; }
  
  /* Table adaptations */
  #tableView { overflow-x: auto; }
}
```

New DOM elements added to `index.html`:
- `#mobileShell` — wraps mobile list + chat views
- `#mobileTabBar` — bottom nav (hidden on desktop via `display:none` default)

---

## 8. JS Changes

New global: `let mobileView = 'list'; // 'list' | 'chat'`

New functions:
- `isMobile()` → `window.innerWidth <= 768`
- `openMobileChat(leadId)` → set `currentChatLeadId`, render chat, `mobileView = 'chat'`
- `renderMobileList()` → renders three sections into `#mobileLeadList`
- `renderMobileChat()` → renders chat into `#mobileChatArea`
- `setupKeyboardHandler()` → `visualViewport` resize listener

Existing functions called unchanged: `generateManagerSuggestion()`, `sendMessage()`, `addMessageToLead()`, `updateStatus()`.

---

## 9. Out of Scope (this iteration)

- Swipe-to-archive / swipe-to-delete gestures
- Push notifications
- Pull-to-refresh
- Offline mode / PWA improvements
- iPad / landscape optimizations

---

## 10. Success Criteria

- [ ] App is fully usable on 375px wide screen (iPhone SE)
- [ ] Lead list shows all three sections with correct leads
- [ ] Tapping a lead opens chat, back button returns to list
- [ ] AI suggestion appears in feed and tapping inserts into textarea
- [ ] Keyboard does not cover the input area
- [ ] Bottom tab bar navigates between Диалоги / Таблица / Скрипты
- [ ] Desktop layout (≥769px) is completely unchanged
- [ ] Existing JS tests (if any) still pass
