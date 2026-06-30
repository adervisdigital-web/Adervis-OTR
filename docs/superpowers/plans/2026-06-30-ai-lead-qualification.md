# AI Lead Qualification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After VK or TG brief completion, Gemini scores the lead 1–100; leads ≥ 70 get a "🔥 Горячий" push and sidebar badge.

**Architecture:** Three isolated edits — (1) add `scoreBrief()` to vk-webhook and call it after brief completion, (2) add hot-lead prefix to `notifyManagerTg()` in tg-webhook, (3) two targeted UI changes in index.html. No new DB columns needed.

**Tech Stack:** Deno/TypeScript (Supabase Edge Functions), Gemini 2.0 Flash API, vanilla JS (index.html), Supabase CLI for deploy.

---

## File Map

| File | What changes |
|------|-------------|
| `supabase/functions/vk-webhook/index.ts` | Add `scoreBrief()` function + rewrite push call in `processVkBrief()` |
| `supabase/functions/tg-webhook/index.ts` | Enhance `notifyManagerTg()` header for score ≥ 70 |
| `index.html` | `row-hot` threshold 55 → 70; `scorePill` hot badge for score ≥ 70 |

---

## Task 1: Add `scoreBrief()` to vk-webhook

**Files:**
- Modify: `supabase/functions/vk-webhook/index.ts`

- [ ] **Step 1: Find the right insertion point**

Search for `// ── VK Button handlers` in vk-webhook/index.ts — this is the line after `processVkBrief` ends.
Add the new function immediately before it.

- [ ] **Step 2: Add the `scoreBrief()` function**

Insert this block between the closing `}` of `processVkBrief` and `// ── VK Button handlers`:

```typescript
// ── Brief scoring ──────────────────────────────────────────────────────────────

async function scoreBrief(
  sb: ReturnType<typeof createClient>,
  leadId: string,
  brief: Record<string, string>,
  geminiKey: string
): Promise<{ score: number; reason: string } | null> {
  if (!geminiKey) return null
  const prompt = `Ты эксперт по продажам видеостудии ADERVIS. Оцени горячесть лида от 1 до 100.

Бриф (VK):
- Бизнес: ${brief.business || '—'}
- Имя: ${brief.name || '—'}
- Контакт: ${brief.contact || '—'}

Критерии (сумма = итоговый балл 0–100):
+40 — контакт указан (телефон или @username реальный)
+35 — бизнес конкретный (не пустой, не прочерк)
+25 — имя указано

Ответь ТОЛЬКО валидным JSON без markdown-обёрток: {"score":72,"reason":"до 80 символов по-русски"}`

  try {
    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
        body:    JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 60, temperature: 0 }
        })
      }
    )
    const d      = await res.json()
    const raw    = (d?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim()
    const clean  = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(clean)
    const score  = Math.max(1, Math.min(100, Number(parsed.score) || 0))
    const reason = String(parsed.reason || '').slice(0, 200)
    if (score > 0) {
      await sb.from('leads')
        .update({ deal_score: score, deal_score_reason: reason })
        .eq('id', leadId)
      return { score, reason }
    }
    return null
  } catch { return null }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd supabase/functions/vk-webhook
deno check index.ts
```

Expected: no errors. Fix any type errors before continuing.

---

## Task 2: Call `scoreBrief()` and rewrite push in `processVkBrief()`

**Files:**
- Modify: `supabase/functions/vk-webhook/index.ts` (end of `processVkBrief`, ~line 556)

- [ ] **Step 1: Find the current push call**

Current code at the end of `processVkBrief()` (after the `vkSendAndSave` confirmation):

```typescript
  sendPushToWorkspace(sb, workspaceId, updated.name || leadName,
    '📋 VK бриф заполнен: ' + (updated.business || '').slice(0, 60)
  ).catch(() => {})
}
```

- [ ] **Step 2: Replace with score-aware version**

Replace the `sendPushToWorkspace` call (keep `vkSendAndSave` untouched above it):

```typescript
  const geminiKey = Deno.env.get('GEMINI_API_KEY') ?? ''
  const scoreResult = await scoreBrief(sb, survivingLeadId, updated, geminiKey).catch(() => null)
  const displayName = updated.name || leadName
  const pushText = scoreResult
    ? (scoreResult.score >= 70
        ? `🔥 Горячий лид: ${displayName} · ${scoreResult.score}/100 — ${scoreResult.reason}`
        : `📋 Бриф: ${displayName} · ${scoreResult.score}/100`)
    : `📋 VK бриф заполнен: ${(updated.business || '').slice(0, 60)}`
  sendPushToWorkspace(sb, workspaceId, displayName, pushText).catch(() => {})
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
deno check index.ts
```

Expected: no errors.

- [ ] **Step 4: Commit vk-webhook changes**

```bash
git add supabase/functions/vk-webhook/index.ts
git commit -m "feat(vk-webhook): score VK brief via Gemini + hot-lead push"
```

- [ ] **Step 5: Deploy vk-webhook**

```bash
npx supabase functions deploy vk-webhook
```

Expected: `Deployed vk-webhook` success message.

---

## Task 3: Hot-lead prefix in `notifyManagerTg()` (tg-webhook)

**Files:**
- Modify: `supabase/functions/tg-webhook/index.ts` (~line 713, `notifyManagerTg` function)

- [ ] **Step 1: Find the current header line**

In `notifyManagerTg()`, find:

```typescript
  const lines = [
    '🔥 Новая заявка!',
```

- [ ] **Step 2: Replace with score-conditional header**

```typescript
  const isHot = !!(scoreResult && scoreResult.score >= 70)
  const lines = [
    isHot ? `🔥 ГОРЯЧИЙ ЛИД! ${scoreResult!.score}/100` : '🔥 Новая заявка!',
```

The rest of the `lines` array stays identical. The `scoreResult` parameter already exists in the function signature.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd ../tg-webhook
deno check index.ts
```

Expected: no errors.

- [ ] **Step 4: Commit and deploy tg-webhook**

```bash
git add supabase/functions/tg-webhook/index.ts
git commit -m "feat(tg-webhook): highlight hot leads (score >= 70) in manager notification"
npx supabase functions deploy tg-webhook
```

Expected: `Deployed tg-webhook` success message.

---

## Task 4: index.html — `row-hot` threshold + hot `scorePill` badge

**Files:**
- Modify: `index.html`

### 4a — row-hot threshold (renderTable)

- [ ] **Step 1: Find the threshold line**

Search index.html for `score >= 55` — it appears in the `renderTable` function (~line 4542):

```javascript
const rowHotClass = score >= 55 ? 'row-hot' : '';
const scoreTier = score >= 55 ? `Срочный ${score}/100` : score >= 20 ? `Приоритет ${score}/100` : '';
const scoreDotHtml = score >= 55
    ? `<span class="score-dot hot" aria-hidden="true"></span>`
    : score >= 20
```

- [ ] **Step 2: Change both `55` thresholds to `70`**

```javascript
const rowHotClass = score >= 70 ? 'row-hot' : '';
const scoreTier = score >= 70 ? `Срочный ${score}/100` : score >= 20 ? `Приоритет ${score}/100` : '';
const scoreDotHtml = score >= 70
    ? `<span class="score-dot hot" aria-hidden="true"></span>`
    : score >= 20
```

Note: `score` here is `calcLeadScore(lead)` — the client-side urgency score, not `deal_score`.

### 4b — hot badge in TG sidebar (`renderTgLeadItem`)

- [ ] **Step 3: Find the `scorePill` definition**

In `renderTgLeadItem()` (~line 2801), find:

```javascript
            const scorePill = (lead.dealScore != null && lead.dealScore > 0)
                ? (function() {
                    var sc = lead.dealScore;
                    var col = sc >= 70 ? 'var(--success)' : sc >= 30 ? 'var(--warning)' : 'var(--text-muted)';
                    return '<span title="' + escapeHtml(lead.dealScoreReason || 'Вероятность сделки') + '" ' +
                        'style="font-size:10.5px;font-weight:700;color:' + col + ';margin-left:2px;" ' +
                        'aria-label="Вероятность сделки ' + sc + '%">' + sc + '%</span>';
                })()
                : '';
```

- [ ] **Step 4: Replace with hot-badge variant for score ≥ 70**

```javascript
            const scorePill = (lead.dealScore != null && lead.dealScore > 0)
                ? (function() {
                    var sc = lead.dealScore;
                    if (sc >= 70) {
                        return '<span class="li-badge li-badge-hot" ' +
                            'title="' + escapeHtml(lead.dealScoreReason || 'Горячий лид') + '" ' +
                            'aria-label="Горячий лид — вероятность сделки ' + sc + '%">🔥 ' + sc + '%</span>';
                    }
                    var col = sc >= 30 ? 'var(--warning)' : 'var(--text-muted)';
                    return '<span title="' + escapeHtml(lead.dealScoreReason || 'Вероятность сделки') + '" ' +
                        'style="font-size:10.5px;font-weight:700;color:' + col + ';margin-left:2px;" ' +
                        'aria-label="Вероятность сделки ' + sc + '%">' + sc + '%</span>';
                })()
                : '';
```

- [ ] **Step 5: Verify in browser**

Open the app. Open a lead in TG sidebar that has `dealScore >= 70`.
Expected: red/orange badge "🔥 N%" visible in `li-meta` of the sidebar item.

Open a lead with `dealScore < 70`:
Expected: yellow/muted `N%` text (unchanged).

- [ ] **Step 6: Commit index.html**

```bash
git add index.html
git commit -m "feat(ui): hot lead badge in sidebar + raise row-hot threshold to 70"
```

---

## Smoke Test Checklist

After all deploys, verify end-to-end:

- [ ] Fill a VK brief through the bot (3 questions: бизнес/имя/контакт)
- [ ] Confirm push notification arrives with score in the title
- [ ] If score ≥ 70: push starts with "🔥 Горячий лид:"
- [ ] Open OTR — lead shows `deal_score` badge in sidebar
- [ ] If score ≥ 70: badge is `li-badge-hot` (red/orange)
- [ ] Fill a TG brief — confirm manager notification in TG shows "🔥 ГОРЯЧИЙ ЛИД! N/100" header if hot
