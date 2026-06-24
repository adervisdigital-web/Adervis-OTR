# Mobile UX + Icons + Roadmap Items Design

**Date:** 2026-06-24  
**Target device:** iPhone Safari (primary), Android Chrome (secondary)  
**File:** `index.html` (~6561 lines, single-file Vanilla JS + CSS)

---

## Goals

1. Chat input stays above keyboard when it appears (Telegram-like)
2. Modals don't overflow viewport when keyboard is open
3. Replace emoji icons with Lucide Icons throughout
4. Fix 2 known PlaybookBar minor gaps
5. Roadmap #16 — open lead profile button
6. Roadmap #19 — fast URL add
7. Roadmap #7 — AI icebreaker personalization

---

## Architecture

Single-file HTML app. No build step. All changes go to `index.html`.  
Icon library loaded via CDN script tag — no npm.

---

## Task 1: Lucide Icons

### No CDN needed

The app builds HTML as JS strings — no DOM-based icon APIs work here. We inline the SVG paths directly as named constants (no external dependency, works offline):

```js
var ICON = {
    plus:          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    settings:      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    archive:       '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>',
    'file-text':   '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
    'refresh-cw':  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
    'chevron-left':'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>',
    'external-link':'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',
    search:        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    x:             '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    'user-plus':   '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>',
};
```

### Replacements

| Location | Old | New |
|----------|-----|-----|
| `renderCmdPalette` — cmd items | `icon:'➕'` | `ICON.plus` |
| `renderCmdPalette` — cmd items | `icon:'⚙️'` | `ICON.settings` |
| `renderCmdPalette` — cmd items | `icon:'🗃️'` | `ICON.archive` |
| `renderCmdPalette` — cmd items | `icon:'📋'` | `ICON['file-text']` |
| `renderCmdPalette` — cmd items | `icon:'🔄'` | `ICON['refresh-cw']` |
| `renderCmdPalette` — status dots | `⚪️🔵🟠🟢🔴` | `<span class="status-dot status-N">` (CSS dots) |
| `#mobileChatBack` button text | `←` / text | `ICON['chevron-left']` |
| Funnel hero empty | `📭` | neutral SVG illustration (inline) |
| Mobile theme toggle | `☀️` / `🌙` | Lucide `sun` / `moon` icons |

### Status dots CSS (replaces colored emoji)

```css
.status-dot {
    display: inline-block;
    width: 8px; height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
}
.status-dot.status-0 { background: var(--muted); }
.status-dot.status-1 { background: #3B82F6; }
.status-dot.status-2 { background: #F59E0B; }
.status-dot.status-3 { background: #22C55E; }
.status-dot.status-4 { background: #EF4444; }
```

---

## Task 2: Mobile Keyboard Fix (iPhone Safari)

### Problem

On iPhone Safari, when the virtual keyboard opens:
- Layout viewport height does NOT shrink
- Visual viewport height DOES shrink
- `position: fixed` / `position: sticky` elements anchored to layout viewport end up behind the keyboard
- The chat input field is hidden

### Solution: visualViewport API

```js
function initVisualViewport() {
    if (!window.visualViewport) return;
    function onVVResize() {
        var vvh = window.visualViewport.height;
        var windowH = window.innerHeight;
        var kbHeight = Math.max(0, windowH - vvh - window.visualViewport.offsetTop);
        document.documentElement.style.setProperty('--vvh', vvh + 'px');
        document.documentElement.style.setProperty('--keyboard-height', kbHeight + 'px');
        // Hide tab bar when keyboard is visible
        var tabBar = document.getElementById('mobileTabBar');
        if (tabBar) tabBar.style.display = kbHeight > 100 ? 'none' : '';
        // Scroll feed to bottom when keyboard opens
        if (kbHeight > 100) {
            var feed = document.getElementById('chatFeedMain');
            if (feed) feed.scrollTop = feed.scrollHeight;
        }
    }
    window.visualViewport.addEventListener('resize', onVVResize);
    window.visualViewport.addEventListener('scroll', onVVResize);
    onVVResize();
}
```

Call `initVisualViewport()` once after DOM ready (in `DOMContentLoaded` or auth success).

### CSS changes

```css
/* Replace fixed heights with dynamic var */
#tg-view {
    height: var(--vvh, 100dvh);  /* was: calc(100dvh - 60px) on mobile */
}

/* Chat body: fill available space, don't overflow */
#tg-view .chat-body {
    height: 100%;
    padding-bottom: var(--keyboard-height, env(safe-area-inset-bottom, 0px));
}

/* Chat input stays above keyboard */
.chat-input-area {
    padding-bottom: calc(var(--keyboard-height, 0px) + env(safe-area-inset-bottom, 0px));
}

/* Tab bar: safe area at bottom */
#mobileTabBar {
    padding-bottom: env(safe-area-inset-bottom, 0px);
}

/* Modals: respect keyboard */
.modal {
    max-height: min(88dvh, calc(var(--vvh, 100dvh) - 20px)) !important;
}
```

### Behavior

- Keyboard opens → `--keyboard-height` set → chat input area gets padding-bottom → input visible above keyboard
- Tab bar hides while keyboard is open → more space for chat
- Feed auto-scrolls to bottom on keyboard open
- Keyboard closes → everything restores
- Modals: max-height shrinks when keyboard is open inside modal (e.g. playbook editor, notes)

---

## Task 3: PlaybookBar Minor Gaps

### Gap 1: `exitPlaybook` doesn't clear `remindAt`

In `exitPlaybook(leadId)` function, after setting `lead.playbookStep = null`:
```js
lead.remindAt = null;  // ADD THIS
```

### Gap 2: `advancePlaybookStep` doesn't update TG sidebar

In `advancePlaybookStep(leadId)` function, after `renderChatHeader(lead)`:
```js
updateTgSidebarItem(lead);  // ADD THIS
```

---

## Task 4: Roadmap #16 — Open Profile Button

### Location

In `renderChatHeader(lead)` — add a button after the lead title.

### Behavior

- Renders only when `lead.link` is set
- Button: Lucide `external-link` icon, 32px tap target
- `onclick`: `window.open(escapeHtml(lead.link), '_blank', 'noopener,noreferrer')`
- On mobile: opens in new tab (Safari treats it as external app link for VK/Inst)

### HTML (generated in JS string)

```js
(lead.link ? 
    '<a href="' + escapeHtml(lead.link) + '" target="_blank" rel="noopener noreferrer" ' +
    'class="chat-profile-link" aria-label="Открыть профиль лида в новой вкладке" ' +
    'title="Открыть профиль">' + ICON['external-link'] + '</a>'
    : '')
```

### CSS

```css
.chat-profile-link {
    display: inline-flex; align-items: center; justify-content: center;
    width: 32px; height: 32px;
    color: var(--muted);
    border-radius: 6px;
    transition: color .15s, background .15s;
    flex-shrink: 0;
    text-decoration: none;
}
.chat-profile-link:hover { color: var(--text); background: var(--bg3); }
```

---

## Task 5: Roadmap #19 — Fast URL Add

### Trigger

In the TG sidebar search input (`#tgSearchInput`): when user pastes a URL (starts with `http://`, `https://`, `vk.com`, `instagram.com`, `t.me`):

1. Show inline prompt below search: `"Добавить как лид? [Добавить] [Отмена]"`
2. On "Добавить": call `quickAddLead(url)`
3. On "Отмена": clear the suggestion

### `quickAddLead(url)` function

```js
async function quickAddLead(url) {
    var normalized = normalizeUrl(url);        // existing function
    var platform   = detectPlatform(url);      // existing function
    var name       = extractNameFromUrl(url);  // new helper (see below)
    var lead = {
        name:      name,
        link:      normalized,
        contact:   '',
        bizType:   '',
        status:    0,
        notes:     '',
        messages:  [],
        sentCount: 0,
    };
    await upsertLead(lead);
    document.getElementById('tgSearchInput').value = '';
    hideFastAddSuggestion();
    showToast('Лид добавлен: ' + name, 2500);
}

function extractNameFromUrl(url) {
    // vk.com/cafe_name → "cafe_name"
    // instagram.com/name → "name"  
    // t.me/username → "username"
    try {
        var u = new URL(url.indexOf('://') === -1 ? 'https://' + url : url);
        var parts = u.pathname.replace(/^\//, '').split('/');
        return parts[0] || u.hostname;
    } catch(e) { return url.slice(0, 40); }
}
```

### Suggestion UI

```html
<div id="fastAddSuggestion" style="display:none;" role="status">
    <span id="fastAddUrl"></span>
    <button onclick="quickAddLead(_fastAddUrl)">Добавить</button>
    <button onclick="hideFastAddSuggestion()">✕</button>
</div>
```

Detect paste in search input:
```js
document.getElementById('tgSearchInput').addEventListener('input', function(e) {
    var val = this.value.trim();
    if (/^https?:\/\/|^vk\.com|^instagram\.com|^t\.me/.test(val)) {
        _fastAddUrl = val;
        showFastAddSuggestion(val);
    } else {
        hideFastAddSuggestion();
    }
});
```

---

## Task 6: Roadmap #7 — AI Icebreaker Personalization

### Concept

When generating the icebreaker message (`generateManagerSuggestion` in mode A — new lead, no messages):
1. Check if `lead.link` is a VK or Instagram URL
2. Attempt to fetch a proxy/description of the profile
3. Inject extracted info into the Gemini prompt

### Approach: Use Gemini itself to analyze the URL

Since direct fetch of VK/Inst pages will be blocked by CORS, use Gemini's ability to reason about URLs:

```js
async function fetchLeadContext(lead) {
    if (!lead.link) return '';
    // Ask Gemini to describe what this business likely does based on the URL/name
    var prompt = 'По ссылке ' + lead.link + ' и названию "' + lead.name + '" (сегмент: ' + (lead.bizType || 'бизнес') + ') ' +
        'напиши 1 предложение — что это за заведение и чем оно может быть интересно для видеосъёмки. ' +
        'Только факт, без лишних слов. Если не знаешь — пусто.';
    try {
        var res = await callGemini(prompt);  // existing function
        return res ? res.trim().slice(0, 200) : '';
    } catch(e) { return ''; }
}
```

### Inject into icebreaker prompt

In `generateManagerSuggestion` (mode A):
```js
var ctx = await fetchLeadContext(lead);
var systemPrompt = 
    'Ты пишешь первое холодное сообщение от лица ADERVIS — видеопродакшн.\n' +
    'Лид: ' + lead.name + ' (' + (lead.bizType || 'бизнес') + ')\n' +
    (ctx ? 'Контекст о заведении: ' + ctx + '\n' : '') +
    'Платформа: ' + platform + '\n' +
    'Напиши короткий, живой ледокол (2-3 предложения). Без шаблонных фраз.';
```

### UX

- "AI ✨" button shows spinner while fetching context (1-2 sec)
- If context fetch fails — falls back to standard prompt silently
- No separate button — same `generateManagerSuggestion` flow, just richer prompt

---

## Non-Goals

- No new modals or views added
- No changes to Supabase schema
- No changes to service worker / PWA manifest
- PlaybookBar desktop layout unchanged

---

## Implementation Order

1. Task 1: Lucide ICON constants + CSS status dots (no behavior change, safe)
2. Task 2: visualViewport fix (JS + CSS)
3. Task 3: Minor gaps (2 one-liners)
4. Task 4: Open profile button in chat header
5. Task 5: Fast URL add in sidebar search
6. Task 6: AI personalization in generateManagerSuggestion

Each task = 1 commit.
