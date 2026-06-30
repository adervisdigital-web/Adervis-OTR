# AI Lead Qualification — Design Spec
Date: 2026-06-30

## Goal

After a lead completes a brief (via VK or TG bot), Gemini scores the lead 1–100.
Leads scoring ≥ 70 are flagged "горячий" with a distinct push notification and UI badge.

---

## Current State

| Channel | Brief scoring | Hot flag |
|---------|--------------|----------|
| TG bot  | ✅ `scoreBrief()` → `deal_score` + `deal_score_reason` in DB | ❌ |
| VK bot  | ❌ no scoring after brief | ❌ |
| index.html | `fetchDealScore()` lazy-scores by dialog (client-side) | `row-hot` at score ≥ 55 |

---

## Section 1 — VK Webhook Scoring

**File:** `supabase/functions/vk-webhook/index.ts`

Add `scoreBrief()` function (mirrors tg-webhook implementation) called at the end of
`processVkBrief()` — after deduplication, before the confirmation message.

VK brief has 3 fields (vs TG's 6), so the Gemini prompt is adapted:

```
Ты эксперт по продажам видеостудии ADERVIS. Оцени горячесть лида от 1 до 100.

Бриф (VK):
- Бизнес: ${business}
- Имя: ${name}
- Контакт: ${contact}

Отвечай ТОЛЬКО валидным JSON: {"score":72,"reason":"до 80 символов"}
```

`scoreBrief()` saves result to `deal_score` + `deal_score_reason` on the surviving lead
(post-dedup). Key is read via `Deno.env.get('GEMINI_API_KEY')` — already used in vk-webhook for AI auto-reply.

---

## Section 2 — Hot Lead Push Notifications

**Files:** `supabase/functions/vk-webhook/index.ts`, `supabase/functions/tg-webhook/index.ts`

Replace/enhance the generic brief notification with a score-aware version in both webhooks.

**VK — `sendPushToWorkspace()` call** (PWA push) at end of `processVkBrief()`:
```
score ≥ 70 → "🔥 Горячий лид: [name] · [score]/100 — [reason]"
score < 70 → "📋 Бриф: [name] · [score]/100"
no score   → "📋 VK бриф заполнен: [business]"  (fallback)
```

**TG — `notifyManagerTg()` message** (TG message to manager chat, no PWA push in TG webhook):
- Already sends score. Enhance: prefix message with "🔥 ГОРЯЧИЙ ЛИД!\n" when score ≥ 70.
- No `sendPushToWorkspace` needed — TG webhook doesn't use it.

---

## Section 3 — UI Changes (index.html)

Three targeted edits:

**3a. `row-hot` threshold** — raise from 55 to 70:
```js
// line ~4542
const rowHotClass = score >= 70 ? 'row-hot' : '';
const scoreDot = score >= 70 ? '<span class="score-dot hot" ...>' : ...;
```

**3b. Hot badge in TG sidebar** — in `renderTgLeadItem()`, after the lead name:
```js
if (lead.dealScore >= 70) {
  html += '<span class="li-badge li-badge-hot">🔥 ' + lead.dealScore + '</span>';
}
```

**3c. No change to `fetchDealScore()`** — already works for leads without score.

---

## Data Flow

```
VK brief complete
  → scoreBrief(sb, leadId, {business,name,contact}, GEMINI_KEY)
      → Gemini 2.0 flash → {score, reason}
      → UPDATE leads SET deal_score, deal_score_reason
  → score ≥ 70?
      yes → push "🔥 Горячий лид: [name] · [score]/100"
      no  → push "📋 Бриф: [name] · [score]/100"
  → vkSend confirmation to user

TG brief complete (existing flow, add hot push)
  → scoreBrief(...) [already exists]
  → score ≥ 70?
      yes → sendPushToWorkspace "🔥 Горячий лид: ..."  ← NEW
      no  → (no change)
  → notifyManagerTg with score [already exists]

index.html realtime update
  → lead.dealScore rendered in table pill + sidebar badge if ≥ 70
```

---

## Out of Scope

- No new DB columns (deal_score already exists)
- No status auto-change (manager decides)
- No configurable threshold (hardcoded 70)
- No changes to fetchDealScore() client-side logic

---

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/vk-webhook/index.ts` | Add `scoreBrief()` + score-aware push |
| `supabase/functions/tg-webhook/index.ts` | Add hot push for score ≥ 70 |
| `index.html` | row-hot threshold 55→70 + sidebar badge |
