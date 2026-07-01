# VK Mass Broadcast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the manager select several leads by checkbox and send the same VK message to all of them in one action, with screen_name→peer_id resolution, a confirm/preview step, live send progress, and a daily-limit warning.

**Architecture:** Client-side loop in `index.html` (Bulk Actions → confirm modal → sequential `vk-send` calls with a 12s gap) plus one new edge function `vk-resolve-peer` that resolves VK `screen_name` slugs to numeric peer IDs using the workspace's community token (same token/pattern as `vk-conversations` and the default path of `vk-send` — there is no working personal-account VK integration in this project; the personal OAuth attempt was abandoned, see `docs/superpowers/specs/2026-06-25-vk-personal-accounts-design.md`). No DB migration needed — `leads.vk_peer_id` already exists.

**Tech Stack:** Vanilla JS (`index.html`, plain `<script>` tags, no bundler), Deno Supabase Edge Functions, VK API (`utils.resolveScreenName`, existing `messages.send` via `vk-send`). No test runner exists for either the client file or edge functions in this repo — verification is manual, per the checklist in `docs/superpowers/specs/2026-07-01-vk-broadcast-design.md`.

---

## File Map

- Create: `supabase/functions/vk-resolve-peer/index.ts` — resolves a batch of `{lead_id, screen_name}` to numeric VK peer IDs
- Modify: `index.html`
  - CSS block near line 400-404 (`.chip` rules) — add recipient-chip and progress-bar styles
  - Line ~2713 (globals near `selectedLeadIds`) — add `vkBroadcastState` and modal focus/escape trackers
  - Lines 3861-3884 (`extractVkPeerId`) — add `extractVkScreenName` + `isVkBroadcastEligible` right after it
  - Lines 4629-4653 (`updateSelectionUI`) — show/hide the new bulk-bar button and update its count
  - After line 4697 (`archiveSelected` ends) — add the whole VK broadcast module: open/close modal (with focus management), resolve, `announceVkBroadcast` (screen-reader status announcements via the existing `srAnnouncer`), render confirm/progress-shell/progress-dynamic/done screens, send loop
  - Lines 1782-1791 (bulk actions bar HTML) — add the "📤 Разослать выбранным" button
  - After line 8676 (end of `quickAddModal` block) — add the VK broadcast modal markup
- Modify: `js/utils.js` after line 136 (`countTodayMessages` ends) — add `countTodayVkMessages`

No other files change. Spec: `docs/superpowers/specs/2026-07-01-vk-broadcast-design.md` (commit `21cb7aa`).

---

### Task 1: `vk-resolve-peer` edge function

**Files:**
- Create: `supabase/functions/vk-resolve-peer/index.ts`

- [ ] **Step 1: Create the function file**

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface ResolveItem {
  lead_id:     string
  screen_name: string
}

interface ResolveBody {
  workspace_id: string
  items:        ResolveItem[]
}

interface ResolveResult {
  lead_id:  string
  peer_id:  number | null
  error?:   string
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return json({ ok: true }, 200)
  if (req.method !== 'POST') return json({ ok: false, error: 'method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace('Bearer ', '').trim()
  if (!token) return json({ ok: false, error: 'unauthorized' }, 401)

  const sbUser = createClient(SUPABASE_URL, ANON_KEY)
  const { data: { user }, error: authErr } = await sbUser.auth.getUser(token)
  if (authErr || !user) return json({ ok: false, error: 'unauthorized: ' + (authErr?.message ?? 'no user') }, 401)

  let body: ResolveBody
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: 'bad json' }, 400)
  }

  const { workspace_id, items } = body
  if (!workspace_id || !Array.isArray(items) || items.length === 0) {
    return json({ ok: false, error: 'missing fields' }, 400)
  }

  const sb = createClient(SUPABASE_URL, SERVICE_KEY)

  const { data: settings } = await sb
    .from('workspace_settings')
    .select('vk_token')
    .eq('workspace_id', workspace_id)
    .maybeSingle()

  if (!settings?.vk_token) {
    return json({ ok: false, error: 'VK token not configured' }, 400)
  }
  const vkToken = settings.vk_token as string

  const results: ResolveResult[] = []

  for (const item of items) {
    const params = new URLSearchParams({
      screen_name:  item.screen_name,
      v:            '5.131',
      access_token: vkToken,
    })
    try {
      const r = await fetch('https://api.vk.com/method/utils.resolveScreenName?' + params)
      const data = await r.json() as {
        response?: { type: string; object_id: number }
        error?:    { error_msg: string }
      }
      if (data.error) {
        results.push({ lead_id: item.lead_id, peer_id: null, error: data.error.error_msg })
      } else if (data.response?.object_id) {
        const isGroup = data.response.type === 'group' || data.response.type === 'club' || data.response.type === 'application'
        results.push({
          lead_id: item.lead_id,
          peer_id: isGroup ? -data.response.object_id : data.response.object_id,
        })
      } else {
        results.push({ lead_id: item.lead_id, peer_id: null, error: 'not found' })
      }
    } catch (e) {
      results.push({ lead_id: item.lead_id, peer_id: null, error: 'VK network error: ' + String(e) })
    }
    // VK API allows ~3 requests/sec per token — stay well under that
    await new Promise((resolve) => setTimeout(resolve, 350))
  }

  return json({ ok: true, results })
})

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS }
  })
}
```

- [ ] **Step 2: Verify the file parses as valid TypeScript by structure-checking it**

Run: `grep -c "^Deno.serve" supabase/functions/vk-resolve-peer/index.ts`
Expected: `1` (confirms exactly one `Deno.serve` block, no duplicate/truncated braces)

- [ ] **Step 3: Deploy the function**

Run: `npx supabase functions deploy vk-resolve-peer --project-ref efepnuuxtzwzygwipgxt`
Expected: JSON output ending with `"message":"Deployed Functions."`

This is a new, unwired function — deploying it has no effect on any existing behavior (nothing calls it yet), so it's safe to deploy immediately without a separate confirmation gate.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/vk-resolve-peer/index.ts
git commit -m "feat(vk-resolve-peer): resolve VK screen_name to numeric peer_id"
```

---

### Task 2: Client-side VK link/limit helpers

**Files:**
- Modify: `index.html:3861-3884` (right after `extractVkPeerId`)
- Modify: `js/utils.js:124-136` (right after `countTodayMessages`)

- [ ] **Step 1: Add `extractVkScreenName` and `isVkBroadcastEligible` to `index.html`**

Find (end of `extractVkPeerId`, start of `parseBulkLines`):

```javascript
                // vk.com/username — не числовой, нельзя определить
                return null;
            } catch (e) { return null; }
        }

        function parseBulkLines(data, existingLinks) {
```

Replace with:

```javascript
                // vk.com/username — не числовой, нельзя определить
                return null;
            } catch (e) { return null; }
        }

        function extractVkScreenName(url) {
            if (!url) return null;
            try {
                const u = new URL(url.startsWith('http') ? url : 'https://' + url);
                const host = u.hostname.replace(/^www\.|^m\./, '');
                if (host !== 'vk.com') return null;
                const parts = u.pathname.split('/').filter(Boolean);
                const slug = parts[0] || '';
                if (!slug || /^(id|club|public|group)\d+$/i.test(slug)) return null;
                return slug;
            } catch (e) { return null; }
        }

        function isVkBroadcastEligible(lead) {
            return !!(lead.vkPeerId || extractVkScreenName(lead.link));
        }

        function parseBulkLines(data, existingLinks) {
```

- [ ] **Step 2: Verify by grep**

Run: `grep -n "function extractVkScreenName\|function isVkBroadcastEligible" index.html`
Expected: 2 matches, both inside the main `<script>` block near line 3885-3900

- [ ] **Step 3: Add `countTodayVkMessages` to `js/utils.js`**

Find:

```javascript
function countTodayMessages(allLeads) {
    var startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    var startMs = startOfDay.getTime();
    var count = 0;
    for (var _i = 0; _i < allLeads.length; _i++) {
        var _msgs = allLeads[_i].messages || [];
        for (var _j = 0; _j < _msgs.length; _j++) {
            if (!_msgs[_j].fromClient && (_msgs[_j].date || 0) >= startMs) count++;
        }
    }
    return count;
}

function calcAvgResponseTime(messages) {
```

Replace with:

```javascript
function countTodayMessages(allLeads) {
    var startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    var startMs = startOfDay.getTime();
    var count = 0;
    for (var _i = 0; _i < allLeads.length; _i++) {
        var _msgs = allLeads[_i].messages || [];
        for (var _j = 0; _j < _msgs.length; _j++) {
            if (!_msgs[_j].fromClient && (_msgs[_j].date || 0) >= startMs) count++;
        }
    }
    return count;
}

function countTodayVkMessages(allLeads) {
    var startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    var startMs = startOfDay.getTime();
    var count = 0;
    for (var _i = 0; _i < allLeads.length; _i++) {
        var lead = allLeads[_i];
        if (!lead.vkPeerId) continue;
        var _msgs = lead.messages || [];
        for (var _j = 0; _j < _msgs.length; _j++) {
            if (!_msgs[_j].fromClient && (_msgs[_j].date || 0) >= startMs) count++;
        }
    }
    return count;
}

function calcAvgResponseTime(messages) {
```

- [ ] **Step 4: Verify by grep**

Run: `grep -n "function countTodayVkMessages" js/utils.js`
Expected: 1 match

- [ ] **Step 5: Commit**

```bash
git add index.html js/utils.js
git commit -m "feat(vk-broadcast): add VK link/limit helper functions"
```

---

### Task 3: Bulk-bar entry point

**Files:**
- Modify: `index.html:1782-1791` (bulk actions bar HTML)
- Modify: `index.html:4629-4653` (`updateSelectionUI`)

- [ ] **Step 1: Add the button to the bulk actions bar**

Find:

```html
    <div class="controls" id="bulkActions" style="display:flex; justify-content:space-between; gap:10px; align-items:center;">
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <div style="color:var(--muted); font-size:13px; font-weight:700;">Выбрано: <span id="selectedCount">0</span></div>
            <button class="btn btn-outline" onclick="selectAllVisible()"><span aria-hidden="true">☑️</span> Выделить все</button>
            <button class="btn btn-outline" onclick="clearSelection()"><span aria-hidden="true">↩️</span> Сбросить</button>
        </div>
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <button class="btn btn-outline" onclick="archiveSelected()"><span aria-hidden="true">🗃️</span> Архивировать выбранные</button>
        </div>
    </div>
```

Replace with:

```html
    <div class="controls" id="bulkActions" style="display:flex; justify-content:space-between; gap:10px; align-items:center;">
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <div style="color:var(--muted); font-size:13px; font-weight:700;">Выбрано: <span id="selectedCount">0</span></div>
            <button class="btn btn-outline" onclick="selectAllVisible()"><span aria-hidden="true">☑️</span> Выделить все</button>
            <button class="btn btn-outline" onclick="clearSelection()"><span aria-hidden="true">↩️</span> Сбросить</button>
        </div>
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <button class="btn btn-primary" id="vkBroadcastBtn" style="display:none;" onclick="openVkBroadcastModal()">
                <span aria-hidden="true">📤</span> <span id="vkBroadcastBtnLabel">Разослать выбранным</span>
            </button>
            <button class="btn btn-outline" onclick="archiveSelected()"><span aria-hidden="true">🗃️</span> Архивировать выбранные</button>
        </div>
    </div>
```

- [ ] **Step 2: Show/hide the button and keep its count current in `updateSelectionUI`**

Find:

```javascript
        function updateSelectionUI() {
            const countEl = document.getElementById('selectedCount');
            if(countEl) {
                const prev = countEl.innerText;
                const next = String(selectedLeadIds.size);
                countEl.innerText = next;
                if (prev !== next) {
                    var ann = document.getElementById('srAnnouncer');
                    if (ann) ann.textContent = 'Выбрано лидов: ' + next;
                }
            }

            // header checkbox = выбраны ли все видимые
            const headerCb = document.getElementById('selectAllCheckbox');
            if(headerCb) {
                if(lastVisibleLeadIds.length === 0) {
                    headerCb.checked = false;
                    headerCb.indeterminate = false;
                } else {
                    const selectedVisible = lastVisibleLeadIds.filter(id => selectedLeadIds.has(String(id))).length;
                    headerCb.checked = selectedVisible === lastVisibleLeadIds.length;
                    headerCb.indeterminate = selectedVisible > 0 && selectedVisible < lastVisibleLeadIds.length;
                }
            }
        }
```

Replace with:

```javascript
        function updateSelectionUI() {
            const countEl = document.getElementById('selectedCount');
            if(countEl) {
                const prev = countEl.innerText;
                const next = String(selectedLeadIds.size);
                countEl.innerText = next;
                if (prev !== next) {
                    var ann = document.getElementById('srAnnouncer');
                    if (ann) ann.textContent = 'Выбрано лидов: ' + next;
                }
            }

            // header checkbox = выбраны ли все видимые
            const headerCb = document.getElementById('selectAllCheckbox');
            if(headerCb) {
                if(lastVisibleLeadIds.length === 0) {
                    headerCb.checked = false;
                    headerCb.indeterminate = false;
                } else {
                    const selectedVisible = lastVisibleLeadIds.filter(id => selectedLeadIds.has(String(id))).length;
                    headerCb.checked = selectedVisible === lastVisibleLeadIds.length;
                    headerCb.indeterminate = selectedVisible > 0 && selectedVisible < lastVisibleLeadIds.length;
                }
            }

            const vkBtn = document.getElementById('vkBroadcastBtn');
            if (vkBtn) {
                const vkCount = Array.from(selectedLeadIds).filter(function(id) {
                    const lead = leads.find(function(l) { return String(l.id) === String(id); });
                    return lead && isVkBroadcastEligible(lead);
                }).length;
                vkBtn.style.display = vkCount > 0 ? 'inline-flex' : 'none';
                const label = document.getElementById('vkBroadcastBtnLabel');
                if (label) label.textContent = 'Разослать выбранным (' + vkCount + ' VK)';
            }
        }
```

- [ ] **Step 3: Verify by grep**

Run: `grep -n "vkBroadcastBtn" index.html`
Expected: 3 matches (button id in HTML, `style.display` line, label update line)

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(vk-broadcast): add bulk-bar entry point button"
```

---

### Task 4: Modal markup and CSS

**Files:**
- Modify: `index.html` CSS block near line 400-404
- Modify: `index.html` after line 8676 (end of `quickAddModal` block)

- [ ] **Step 1: Add chip and progress-bar CSS**

Find:

```css
        .chip { padding: 5px 10px; border-radius: var(--radius-sm); border: 1px solid var(--primary-border); background: var(--primary-subtle); color: var(--primary2); font-size: 11px; font-family: var(--font-ui); font-weight: 500; cursor: pointer; transition: background .12s, border-color .12s; }
        .chip:hover { background: rgba(200,144,42,.2); border-color: rgba(200,144,42,.5); }
        .chip-ai { background: rgba(39,166,68,.10); border-color: rgba(39,166,68,.28); color: var(--success); font-weight: 600; }
        .chip-ai:hover { background: rgba(39,166,68,.2); border-color: rgba(39,166,68,.5); }
        .chip-ai:disabled { opacity: .5; cursor: not-allowed; }
```

Replace with:

```css
        .chip { padding: 5px 10px; border-radius: var(--radius-sm); border: 1px solid var(--primary-border); background: var(--primary-subtle); color: var(--primary2); font-size: 11px; font-family: var(--font-ui); font-weight: 500; cursor: pointer; transition: background .12s, border-color .12s; }
        .chip:hover { background: rgba(200,144,42,.2); border-color: rgba(200,144,42,.5); }
        .chip-ai { background: rgba(39,166,68,.10); border-color: rgba(39,166,68,.28); color: var(--success); font-weight: 600; }
        .chip-ai:hover { background: rgba(39,166,68,.2); border-color: rgba(39,166,68,.5); }
        .chip-ai:disabled { opacity: .5; cursor: not-allowed; }
        .vk-chip-ok { padding: 3px 10px; border-radius: 12px; font-size: 11px; background: rgba(39,166,68,.12); border: 1px solid rgba(39,166,68,.35); color: var(--success); }
        .vk-chip-skip { padding: 3px 10px; border-radius: 12px; font-size: 11px; background: var(--bg); border: 1px solid var(--line); color: var(--text-muted,#9ca3af); }
        .vk-progress-track { background: var(--line); border-radius: 4px; height: 6px; overflow: hidden; }
        .vk-progress-fill { background: var(--primary); height: 6px; border-radius: 4px; transition: width .3s ease; }
```

- [ ] **Step 2: Add the modal markup after `quickAddModal`**

Find:

```html
            <span aria-hidden="true">✓ </span>Добавить в воронку
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Command Palette -->
```

Replace with:

```html
            <span aria-hidden="true">✓ </span>Добавить в воронку
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══════ VK BROADCAST MODAL ═══════ -->
    <div id="vkBroadcastOverlay"
         style="display:none;position:fixed;inset:0;z-index:1100;
                background:rgba(0,0,0,.6);backdrop-filter:blur(4px);
                align-items:center;justify-content:center;padding:20px;"
         onclick="if(event.target===this)closeVkBroadcastModal()">
      <div id="vkBroadcastModal"
           role="dialog" aria-modal="true" aria-labelledby="vkBroadcastTitle"
           style="background:var(--panel);border:1px solid var(--line);
                  border-radius:var(--radius-xl);width:480px;
                  max-width:calc(100vw - 32px);max-height:calc(100vh - 40px);
                  overflow-y:auto;box-shadow:var(--shadow-4);">
        <div style="display:flex;align-items:center;justify-content:space-between;
                    padding:16px 20px 12px;border-bottom:1px solid var(--line);
                    position:sticky;top:0;background:var(--panel);z-index:1;">
          <span id="vkBroadcastTitle" style="font-size:15px;font-weight:700;color:var(--text);">📤 Рассылка ВКонтакте</span>
          <button onclick="closeVkBroadcastModal()"
                  style="background:none;border:none;color:var(--muted);font-size:18px;
                         cursor:pointer;padding:0;line-height:1;min-width:44px;min-height:44px;"
                  aria-label="Закрыть">✕</button>
        </div>
        <div id="vkBroadcastBody" style="padding:20px;display:flex;flex-direction:column;gap:14px;"></div>
      </div>
    </div>

    <!-- Command Palette -->
```

- [ ] **Step 3: Verify by grep**

Run: `grep -n "vkBroadcastOverlay\|vkBroadcastBody" index.html`
Expected: 3 matches (overlay open tag, onclick reference to `closeVkBroadcastModal`, and the body div)

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(vk-broadcast): add modal markup and chip/progress CSS"
```

---

### Task 5: Modal open/close + peer resolution

**Accessibility requirements (from the accessibility-lead review of Task 4's markup, applied here):** on open, give `#vkBroadcastBody` `tabindex="-1"` and focus it (there's no input to focus yet, so the container itself is the fallback target, consistent with how `openQuickAdd()` focuses its first real input). `renderVkBroadcastBody()` must re-focus the body after every `innerHTML` swap **only if focus was already inside it** (checked via `body.contains(document.activeElement)` before the swap) — this keeps focus from silently dropping to `<body>` across the confirm→progress→done transitions without fighting the user if they'd already moved focus elsewhere (e.g. into the app behind the modal, which can't happen while the overlay is up, but the guard is cheap and correct either way). A new `announceVkBroadcast(text)` helper writes to the existing `srAnnouncer` live region (already used elsewhere in `index.html` for selection-count announcements) — do not add a new `aria-live` region; reuse the stable one so screen readers reliably pick up the change (a live region inside content that gets wholesale replaced via `innerHTML` is unreliable across screen readers, since the node itself is destroyed and recreated).

**Files:**
- Modify: `index.html:2713` (globals) and after line 4697 (`archiveSelected` ends)

- [ ] **Step 1: Add broadcast state globals**

Find:

```javascript
        let currentSort = { col: 'updatedAt', desc: true };
        let selectedLeadIds = new Set();
        let lastVisibleLeadIds = [];
```

Replace with:

```javascript
        let currentSort = { col: 'updatedAt', desc: true };
        let selectedLeadIds = new Set();
        let lastVisibleLeadIds = [];
        let vkBroadcastState = { recipients: [], skipped: [], templateText: '', sending: false, stopFlag: false };
        let _vkBcFocusTrigger = null;
        let _vkBcEscHandler = null;
```

- [ ] **Step 2: Add open/close/resolve functions after `archiveSelected`**

Find:

```javascript
            if (failedCount > 0) {
                showToast('Архивировано: ' + succeededIds.size + ', ошибок: ' + failedCount, 4000);
            } else {
                showToast('Архивировано: ' + succeededIds.size + ' лидов');
            }
        }

        function renderScriptChips(lead) {
```

Replace with:

```javascript
            if (failedCount > 0) {
                showToast('Архивировано: ' + succeededIds.size + ', ошибок: ' + failedCount, 4000);
            } else {
                showToast('Архивировано: ' + succeededIds.size + ' лидов');
            }
        }

        async function openVkBroadcastModal() {
            const overlayCheck = document.getElementById('vkBroadcastOverlay');
            if (overlayCheck && overlayCheck.style.display === 'flex') return;

            const ids = Array.from(selectedLeadIds);
            const candidates = ids
                .map(function(id) { return leads.find(function(l) { return String(l.id) === String(id); }); })
                .filter(function(l) { return l && isVkBroadcastEligible(l); });
            if (candidates.length === 0) { showToast('Нет выбранных лидов с VK-ссылкой'); return; }

            _vkBcFocusTrigger = document.activeElement;
            const overlay = document.getElementById('vkBroadcastOverlay');
            overlay.style.display = 'flex';
            _vkBcEscHandler = function(e) { if (e.key === 'Escape') { e.stopPropagation(); closeVkBroadcastModal(); } };
            document.addEventListener('keydown', _vkBcEscHandler, true);

            vkBroadcastState = { recipients: [], skipped: [], templateText: '', sending: false, stopFlag: false };
            renderVkBroadcastBody('<div style="text-align:center;padding:20px;color:var(--muted);">⏳ Проверяю получателей...</div>');
            const body = document.getElementById('vkBroadcastBody');
            if (body) { body.setAttribute('tabindex', '-1'); body.focus(); }

            const toResolve = candidates.filter(function(l) { return !l.vkPeerId; });
            if (toResolve.length > 0) {
                await resolveVkPeerIds(toResolve);
            }

            candidates.forEach(function(l) {
                if (l.vkPeerId) {
                    vkBroadcastState.recipients.push({ id: String(l.id), name: l.name, peerId: l.vkPeerId, status: 'queued' });
                } else {
                    vkBroadcastState.skipped.push({ id: String(l.id), name: l.name, reason: 'нет VK' });
                }
            });

            renderVkBroadcastConfirm();
            announceVkBroadcast('Получатели проверены: ' + vkBroadcastState.recipients.length + ' готовы, ' + vkBroadcastState.skipped.length + ' пропущено.');
        }

        function closeVkBroadcastModal() {
            if (vkBroadcastState.sending) {
                if (!confirm('Рассылка ещё идёт. Закрыть окно и остановить отправку?')) return;
                vkBroadcastState.stopFlag = true;
            }
            const overlay = document.getElementById('vkBroadcastOverlay');
            overlay.style.display = 'none';
            if (_vkBcEscHandler) { document.removeEventListener('keydown', _vkBcEscHandler, true); _vkBcEscHandler = null; }
            if (_vkBcFocusTrigger && document.contains(_vkBcFocusTrigger)) _vkBcFocusTrigger.focus();
            _vkBcFocusTrigger = null;
        }

        function renderVkBroadcastBody(html) {
            const body = document.getElementById('vkBroadcastBody');
            if (!body) return;
            const hadFocusInside = body.contains(document.activeElement);
            body.innerHTML = html;
            if (hadFocusInside) {
                body.setAttribute('tabindex', '-1');
                body.focus();
            }
        }

        function announceVkBroadcast(text) {
            const ann = document.getElementById('srAnnouncer');
            if (ann) ann.textContent = text;
        }

        async function resolveVkPeerIds(leadsToResolve) {
            const { data: { session } } = await _sb.auth.getSession();
            if (!session) return;
            const payload = leadsToResolve.map(function(l) {
                return { lead_id: String(l.id), screen_name: extractVkScreenName(l.link) };
            }).filter(function(p) { return p.screen_name; });
            if (payload.length === 0) return;

            let data;
            try {
                const res = await fetch(SUPABASE_URL + '/functions/v1/vk-resolve-peer', {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ workspace_id: workspaceId, items: payload })
                });
                data = await res.json();
            } catch (e) {
                showToast('Ошибка резолва VK: ' + (e.message || String(e)), 4000);
                return;
            }
            if (!data.ok) { showToast('Ошибка резолва VK: ' + (data.error || ''), 4000); return; }

            data.results.forEach(function(r) {
                if (!r.peer_id) return;
                const lead = leads.find(function(l) { return String(l.id) === String(r.lead_id); });
                if (lead) { lead.vkPeerId = r.peer_id; upsertLead(lead); }
            });
        }

        function renderScriptChips(lead) {
```

- [ ] **Step 3: Verify by grep**

Run: `grep -n "function openVkBroadcastModal\|function closeVkBroadcastModal\|function resolveVkPeerIds\|function renderVkBroadcastBody\|function announceVkBroadcast" index.html`
Expected: 5 matches

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(vk-broadcast): add modal open/close and peer resolution"
```

---

### Task 6: Confirm screen (recipients, limit warning, template, preview)

**Accessibility requirements (from the accessibility-lead review):** the recipient chips get `role="listitem"` inside a `role="list"` container labeled via `aria-labelledby` pointing at the existing "Получатели" heading div (needs an `id`) — currently that label has no programmatic relationship to the chips. The ✅/⚠️ glyphs move into their own `aria-hidden="true"` span (matching the existing convention used elsewhere in this file, e.g. the bulk-bar buttons), since the visible text next to them (name, or name + skip reason) already conveys the meaning — the emoji is decorative once wrapped this way, not a second copy of the same information. The template `<select>` currently would have no accessible name at all (the "Шаблон" label above it is a plain unassociated `<div>`) — change it to a real `<label for="vkBroadcastTemplate">`, which requires zero visual change. `#vkBroadcastPreview` needs `aria-live="polite"` set **in the initial markup**, not added later via JS — `aria-live` must already be present in the DOM before its content changes for screen readers to reliably announce the update when the template dropdown changes.

**Files:**
- Modify: `index.html` — add functions right after `resolveVkPeerIds` (which now ends right before `function renderScriptChips(lead) {`, per Task 5)

- [ ] **Step 1: Add `renderVkBroadcastConfirm` and `updateVkBroadcastPreview`**

Find:

```javascript
            data.results.forEach(function(r) {
                if (!r.peer_id) return;
                const lead = leads.find(function(l) { return String(l.id) === String(r.lead_id); });
                if (lead) { lead.vkPeerId = r.peer_id; upsertLead(lead); }
            });
        }

        function renderScriptChips(lead) {
```

Replace with:

```javascript
            data.results.forEach(function(r) {
                if (!r.peer_id) return;
                const lead = leads.find(function(l) { return String(l.id) === String(r.lead_id); });
                if (lead) { lead.vkPeerId = r.peer_id; upsertLead(lead); }
            });
        }

        function renderVkBroadcastConfirm() {
            const st = vkBroadcastState;
            const chipsHtml = st.recipients.map(function(r) {
                return '<span class="vk-chip-ok" role="listitem"><span aria-hidden="true">✅</span> ' + escapeHtml(r.name) + '</span>';
            }).join(' ') + (st.skipped.length ? ' ' : '') + st.skipped.map(function(s) {
                return '<span class="vk-chip-skip" role="listitem"><span aria-hidden="true">⚠️</span> ' + escapeHtml(s.name) + ' — ' + escapeHtml(s.reason) + '</span>';
            }).join(' ');

            const todayVk = countTodayVkMessages(leads);
            const afterCount = todayVk + st.recipients.length;
            const limitWarning = afterCount >= 25
                ? '<div style="background:rgba(230,145,56,.12);border:1px solid rgba(230,145,56,.35);border-radius:6px;padding:8px 10px;font-size:12px;color:#e69138;">⚠️ Сегодня уже отправлено ' + todayVk + ' через VK, эта рассылка доведёт до ' + afterCount + ' (лимит ~30-50/день)</div>'
                : '';

            const stageOptions = (scripts[0] && scripts[0].options) || [];
            const templateOptionsHtml = stageOptions.map(function(opt, i) {
                return '<option value="' + i + '">' + escapeHtml(opt.text) + '</option>';
            }).join('');

            const etaSec = st.recipients.length > 0 ? (st.recipients.length - 1) * 12 : 0;

            renderVkBroadcastBody(
                '<div>' +
                    '<div id="vkRecipientsLabel" style="color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Получатели</div>' +
                    '<div role="list" aria-labelledby="vkRecipientsLabel" style="display:flex;flex-wrap:wrap;gap:6px;">' + chipsHtml + '</div>' +
                    '<div style="color:var(--muted);font-size:11px;margin-top:5px;">' + st.recipients.length + ' из ' + (st.recipients.length + st.skipped.length) + ' получат сообщение' + (st.skipped.length ? ' · ' + st.skipped.length + ' пропущен(о)' : '') + '</div>' +
                '</div>' +
                limitWarning +
                '<div>' +
                    '<label for="vkBroadcastTemplate" style="display:block;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Шаблон</label>' +
                    '<select id="vkBroadcastTemplate" onchange="updateVkBroadcastPreview()" style="width:100%;background:var(--bg);border:1px solid var(--line);border-radius:var(--radius-md);padding:8px 10px;font-size:13px;color:var(--text);">' + templateOptionsHtml + '</select>' +
                '</div>' +
                '<div>' +
                    '<div style="color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Предпросмотр</div>' +
                    '<div id="vkBroadcastPreview" aria-live="polite" style="background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:10px;color:var(--text);line-height:1.5;font-size:13px;"></div>' +
                '</div>' +
                '<div style="display:flex;justify-content:space-between;align-items:center;padding-top:4px;border-top:1px solid var(--line);">' +
                    '<span style="color:var(--muted);font-size:11px;">⏱ ~' + etaSec + ' сек · задержка 12с между сообщениями</span>' +
                    '<button class="btn btn-primary" ' + (st.recipients.length === 0 ? 'disabled' : '') + ' onclick="startVkBroadcast()">Начать рассылку →</button>' +
                '</div>'
            );
            updateVkBroadcastPreview();
        }

        function updateVkBroadcastPreview() {
            const sel = document.getElementById('vkBroadcastTemplate');
            const preview = document.getElementById('vkBroadcastPreview');
            if (!sel || !preview) return;
            const opt = (scripts[0] && scripts[0].options && scripts[0].options[Number(sel.value)]) || null;
            vkBroadcastState.templateText = opt ? opt.content : '';
            preview.textContent = opt ? substituteCta(opt.content, null) : '';
        }

        function renderScriptChips(lead) {
```

- [ ] **Step 2: Verify by grep**

Run: `grep -n "function renderVkBroadcastConfirm\|function updateVkBroadcastPreview" index.html`
Expected: 2 matches

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(vk-broadcast): add confirm screen with limit warning and preview"
```

---

### Task 7: Send loop, progress screen, completion screen

**Accessibility requirement — this is the most important fix from the accessibility-lead review, not optional polish:** the original single-function `renderVkBroadcastProgress()` design replaced the *entire* `#vkBroadcastBody` (including the "⏹ Остановить" button) on every status tick — roughly twice per recipient, every ~12 seconds. Each replacement creates a brand-new "⏹ Остановить" DOM node. A keyboard user who tabs to that button can have it silently swapped out from under them before they click it, ejecting focus to `<body>` with no warning. The fix is structural, not a patch: split the progress screen into a **stable shell** (`renderVkBroadcastProgressShell()`, called once when sending starts) containing a permanent `#vkStopBtn` that is never recreated, plus an inner `#vkBroadcastDynamic` container that gets its `innerHTML` replaced on every tick via `updateVkBroadcastProgressDynamic()` — only the progress bar and recipient list live inside that inner container. This replaces the single `renderVkBroadcastProgress()` function referenced in earlier drafts of this plan.

Two more accessibility fixes folded into this task: (1) the per-recipient error reason must be visible text next to the status label, not hidden inside a `title` attribute (unreliable on touch devices and inconsistently exposed by screen readers); (2) `announceVkBroadcast()` (from Task 5) fires exactly twice during a send — once when it starts, once when it ends (regardless of whether it ended via completion or the Stop button) — never per-recipient, since that would be constant noisy chatter over a multi-minute operation with only a ~12s gap between updates.

**Files:**
- Modify: `index.html` — add functions right after `updateVkBroadcastPreview` (which now ends right before `function renderScriptChips(lead) {`, per Task 6)

- [ ] **Step 1: Add `startVkBroadcast`, `stopVkBroadcast`, `renderVkBroadcastProgressShell`, `updateVkBroadcastProgressDynamic`, `renderVkBroadcastDone`**

Find:

```javascript
            vkBroadcastState.templateText = opt ? opt.content : '';
            preview.textContent = opt ? substituteCta(opt.content, null) : '';
        }

        function renderScriptChips(lead) {
```

Replace with:

```javascript
            vkBroadcastState.templateText = opt ? opt.content : '';
            preview.textContent = opt ? substituteCta(opt.content, null) : '';
        }

        async function startVkBroadcast() {
            const st = vkBroadcastState;
            if (st.recipients.length === 0 || st.sending) return;
            st.sending = true;
            st.stopFlag = false;
            renderVkBroadcastProgressShell();
            updateVkBroadcastProgressDynamic();
            announceVkBroadcast('Рассылка начата, ' + st.recipients.length + ' получателей.');

            const { data: { session } } = await _sb.auth.getSession();
            if (!session) { showToast('Нет сессии', 3000); st.sending = false; return; }

            for (let i = 0; i < st.recipients.length; i++) {
                if (st.stopFlag) break;
                const r = st.recipients[i];
                r.status = 'sending';
                updateVkBroadcastProgressDynamic();

                const lead = leads.find(function(l) { return String(l.id) === String(r.id); });
                const message = substituteCta(st.templateText, lead);

                try {
                    const res = await fetch(SUPABASE_URL + '/functions/v1/vk-send', {
                        method: 'POST',
                        headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ lead_id: String(r.id), message: message, workspace_id: workspaceId })
                    });
                    const data = await res.json();
                    if (data.ok) {
                        r.status = 'sent';
                    } else {
                        r.status = 'error';
                        r.error = data.error || 'Ошибка отправки';
                    }
                } catch (e) {
                    r.status = 'error';
                    r.error = e.message || String(e);
                }
                updateVkBroadcastProgressDynamic();

                const isLast = i === st.recipients.length - 1;
                if (!isLast && !st.stopFlag) {
                    await new Promise(function(resolve) { setTimeout(resolve, 12000); });
                }
            }

            st.sending = false;
            renderVkBroadcastDone();
        }

        function stopVkBroadcast() {
            vkBroadcastState.stopFlag = true;
        }

        function renderVkBroadcastProgressShell() {
            renderVkBroadcastBody(
                '<div id="vkBroadcastDynamic"></div>' +
                '<div style="text-align:right;padding-top:4px;border-top:1px solid var(--line);">' +
                    '<button id="vkStopBtn" class="btn btn-danger" onclick="stopVkBroadcast()">⏹ Остановить</button>' +
                '</div>'
            );
        }

        function updateVkBroadcastProgressDynamic() {
            const st = vkBroadcastState;
            const dyn = document.getElementById('vkBroadcastDynamic');
            if (!dyn) return;

            const doneCount = st.recipients.filter(function(r) { return r.status === 'sent' || r.status === 'error'; }).length;
            const pct = Math.round((doneCount / st.recipients.length) * 100);
            const remaining = (st.recipients.length - doneCount) * 12;

            const iconFor = { queued: '⬜', sending: '⏳', sent: '✅', error: '❌' };
            const labelFor = { queued: 'в очереди', sending: 'отправляется...', sent: 'отправлено', error: 'ошибка' };

            const listHtml = st.recipients.map(function(r) {
                const statusText = labelFor[r.status] + (r.status === 'error' && r.error ? ': ' + escapeHtml(r.error) : '');
                return '<div style="display:flex;align-items:center;gap:8px;padding:6px;background:var(--bg);border-radius:4px;">' +
                    '<span aria-hidden="true">' + iconFor[r.status] + '</span>' +
                    '<span style="flex:1;">' + escapeHtml(r.name) + '</span>' +
                    '<span style="color:var(--muted);font-size:11px;">' + statusText + '</span>' +
                '</div>';
            }).join('');

            dyn.innerHTML =
                '<div>' +
                    '<div style="display:flex;justify-content:space-between;color:var(--muted);font-size:11px;margin-bottom:4px;">' +
                        '<span>' + doneCount + ' из ' + st.recipients.length + ' обработано</span>' +
                        '<span>~' + remaining + ' сек осталось</span>' +
                    '</div>' +
                    '<div class="vk-progress-track" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100" aria-valuetext="' + doneCount + ' из ' + st.recipients.length + ' обработано"><div class="vk-progress-fill" style="width:' + pct + '%;"></div></div>' +
                '</div>' +
                '<div style="display:flex;flex-direction:column;gap:5px;margin-top:14px;">' + listHtml + '</div>';
        }

        function renderVkBroadcastDone() {
            const st = vkBroadcastState;
            const sent = st.recipients.filter(function(r) { return r.status === 'sent'; }).length;
            const errors = st.recipients.filter(function(r) { return r.status === 'error'; }).length;
            const listHtml = st.recipients.map(function(r) {
                const icon = r.status === 'sent' ? '✅' : (r.status === 'error' ? '❌' : '⬜');
                return '<div style="display:flex;align-items:center;gap:8px;padding:6px;background:var(--bg);border-radius:4px;">' +
                    '<span aria-hidden="true">' + icon + '</span><span style="flex:1;">' + escapeHtml(r.name) + '</span></div>';
            }).join('');

            renderVkBroadcastBody(
                '<div style="text-align:center;padding:12px;background:var(--bg);border-radius:8px;border:1px solid var(--line);">' +
                    '<div style="font-size:22px;margin-bottom:4px;">✅</div>' +
                    '<div style="color:var(--success);font-weight:600;font-size:14px;">Рассылка завершена</div>' +
                    '<div style="color:var(--muted);font-size:11px;margin-top:2px;">' + sent + ' отправлено · ' + errors + ' ошибок · ' + st.skipped.length + ' пропущено</div>' +
                '</div>' +
                '<div style="display:flex;flex-direction:column;gap:5px;">' + listHtml + '</div>' +
                '<div style="text-align:right;padding-top:4px;border-top:1px solid var(--line);">' +
                    '<button class="btn btn-outline" onclick="closeVkBroadcastModal()">Закрыть</button>' +
                '</div>'
            );
            announceVkBroadcast('Рассылка завершена: ' + sent + ' отправлено, ' + errors + ' ошибок, ' + st.skipped.length + ' пропущено.');
            renderTable();
            updateDashboard();
        }

        function renderScriptChips(lead) {
```

- [ ] **Step 2: Verify by grep**

Run: `grep -n "function startVkBroadcast\|function stopVkBroadcast\|function renderVkBroadcastProgressShell\|function updateVkBroadcastProgressDynamic\|function renderVkBroadcastDone" index.html`
Expected: 5 matches

- [ ] **Step 3: Trace the state machine by hand**

Confirm: `vkBroadcastState.recipients[i].status` only ever takes values `'queued'`, `'sending'`, `'sent'`, `'error'` — matching the keys used in `iconFor`/`labelFor` in `updateVkBroadcastProgressDynamic` and the two branches checked in `renderVkBroadcastDone`. No other status string is assigned anywhere in Tasks 5-7. Also confirm `#vkStopBtn` is written exactly once per send (inside `renderVkBroadcastProgressShell`, called once at the start of `startVkBroadcast`) and is never touched by `updateVkBroadcastProgressDynamic`, which must only ever write to `#vkBroadcastDynamic`'s `innerHTML` — grep for `vkStopBtn` and confirm it appears in exactly one `innerHTML`/string-concatenation location in the whole file.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(vk-broadcast): add send loop with progress and completion screens"
```

---

### Task 8: Deploy and manual QA

**Files:** none (verification only)

- [ ] **Step 1: Confirm `vk-resolve-peer` is deployed**

It was deployed in Task 1, Step 3. If more time has passed and you're unsure it's current, redeploy: `npx supabase functions deploy vk-resolve-peer --project-ref efepnuuxtzwzygwipgxt`

- [ ] **Step 2: Deploy the updated `index.html`**

This repo has no build step for `index.html` — it's served directly (see `netlify.toml`). Deploy it the same way prior `index.html` changes in this repo were shipped (Netlify auto-deploy on push, or manual upload). **Confirm with the user which path applies and get explicit go-ahead before deploying** — this changes live, user-facing behavior for the manager's production CRM.

- [ ] **Step 3: Manual QA in the live app**

Run through the checklist from `docs/superpowers/specs/2026-07-01-vk-broadcast-design.md` § Тестирование:

1. Select a lead with a `vk.com/<screen_name>` link and no `vkPeerId` yet, plus a lead that already has a numeric `vkPeerId` → click "Разослать выбранным" → confirm screen shows both as ✅, and the screen_name-only lead now has a resolved numeric `vkPeerId` persisted (check via the lead drawer after closing the modal)
2. Select a lead with a private/nonexistent VK profile → confirm it shows ⚠️ on the confirm screen and is excluded from the recipient count
3. Run a broadcast against 2 real-but-safe test VK profiles (not real leads) — confirm both messages arrive in VK, and both appear in each lead's dialogue history in the app as ordinary outbound messages (same as a manual send)
4. Force an error for one recipient (e.g. temporarily set an invalid `vkPeerId` on a test lead) — confirm the broadcast continues to the next recipient instead of stopping, and the failed one shows ❌
5. Start a broadcast with 3+ recipients, click "⏹ Остановить" after the first send — confirm remaining recipients stay unsent (no further `vk-send` calls happen) and already-sent ones are not rolled back
6. With today's VK send count near 25+, open the confirm screen — confirm the daily-limit banner appears but the "Начать рассылку" button is still clickable
7. Accessibility spot-check: open the modal with a screen reader running (NVDA/VoiceOver) — confirm focus lands inside the dialog on open and moves along with each state transition (confirm → sending → done) instead of getting lost on `<body>`; confirm you hear "Получатели проверены..." once when the confirm screen appears, "Рассылка начата..." once when sending starts, and "Рассылка завершена..." once at the end, with no per-recipient chatter in between; tab to "⏹ Остановить" during an active send and confirm it is not force-blurred by the next progress tick (this was the specific bug the accessibility review caught in the original single-function design — verify the shell/dynamic split in Task 7 actually fixed it, don't just assume the code is correct because it compiles)

No commit for this task — it's verification of already-committed work.

---

## Self-Review Notes

- **Spec coverage:** Entry point (Bulk Actions) → Task 3. Confirm screen (recipients/resolve/template/preview/limit warning) → Tasks 5-6. Resolve mechanism → Tasks 1 and 5. Send/progress screen → Task 7. Completion screen → Task 7. Error handling (skip-and-continue) → Task 7 (`startVkBroadcast` catch block continues the loop). Daily-limit warning (warn, don't block) → Task 6 (`limitWarning` shown, button never disabled for this reason). Message history logging as ordinary outbound message → handled server-side by the pre-existing `vk-send` edge function (which already appends the sent message to `lead.messages` on success, unrelated to this feature) plus the pre-existing realtime `leads` subscription that reflects it into the UI — an initial draft of Task 7 also called `addMessageToLead(...)` client-side, which was removed (commit `fix(vk-broadcast): remove duplicate client-side message logging on send`) once code review caught that it duplicated `vk-send`'s own server-side write on every successful send. "Out of scope" items (scheduling, resume-after-reload, dedicated broadcast template pool, hard limit blocking) — untouched by all tasks, confirmed by file map.
- **Type/naming consistency:** `vkBroadcastState.recipients[].status` values (`queued`/`sending`/`sent`/`error`) are introduced once in Task 5 and consumed identically in Tasks 6-7 — checked in Task 7 Step 3. Function names (`openVkBroadcastModal`, `closeVkBroadcastModal`, `renderVkBroadcastBody`, `announceVkBroadcast`, `renderVkBroadcastConfirm`, `updateVkBroadcastPreview`, `startVkBroadcast`, `stopVkBroadcast`, `renderVkBroadcastProgressShell`, `updateVkBroadcastProgressDynamic`, `renderVkBroadcastDone`) are each defined exactly once and referenced by the same spelling everywhere, including inline `onclick` handlers in the generated HTML strings.
- **Accessibility fixes applied after a dedicated accessibility-lead review of Task 4's committed markup (done proactively, before Tasks 5-7 were implemented, not after):** focus management on open/state-transitions (Task 5), `announceVkBroadcast` reusing the existing stable `srAnnouncer` live region instead of an unreliable region-inside-swapped-innerHTML (Task 5), list semantics + `aria-hidden` icons + a real `<label>` for the template select + static `aria-live` on the preview (Task 6), and — the one structural must-fix — splitting the progress screen into a stable shell with a permanent Stop button plus an inner dynamically-updated region, so the Stop button is never silently recreated out from under a keyboard user's focus during the ~12s-per-recipient send loop (Task 7). Two lower-priority items from that review were deliberately deferred as pre-existing, systemic gaps shared with `quickAddModal` rather than fixed one-off here: no Tab-key focus trap (Escape-to-close only, matching the existing modal pattern exactly), and the dialog title being a `<span>` rather than a heading element.
- **No automated tests added:** matches existing project convention — zero test files exist for `index.html`, `js/utils.js`, or any `supabase/functions/*` edge function in this repo (also the approach taken by the prior executed plan, `docs/superpowers/plans/2026-07-01-smart-tg-bot.md`).
