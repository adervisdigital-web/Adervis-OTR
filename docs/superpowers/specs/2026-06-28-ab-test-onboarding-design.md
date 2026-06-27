# Sprint 8: A/B Test Welcome + Onboarding Carousel — Design Spec

**Date:** 2026-06-28  
**Scope:** Two independent features: (1) A/B тест приветственных сообщений Telegram-бота, (2) Онбординг-карусель «Как пользоваться» внутри OTR.

---

## Part 1: A/B Test Welcome Messages

### Goal

Two variants of the Telegram bot welcome text. The bot picks one randomly on first contact. OTR shows per-variant conversion stats so the manager can see which message works better.

### DB Migration

```sql
-- workspace_settings
ALTER TABLE workspace_settings
  ADD COLUMN IF NOT EXISTS tg_welcome_text_b TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS tg_ab_enabled     BOOLEAN DEFAULT FALSE;

-- leads
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS ab_variant VARCHAR(1) DEFAULT NULL; -- 'A' | 'B'
```

### tg-webhook Changes

**`handleWebhook`** — expand the settings `select` to include `tg_welcome_text_b`, `tg_ab_enabled`. Pass both to `handleMessage`.

**`handleMessage`** — variant assignment logic:

```
if ab_enabled AND welcome_text_b is set:
  if lead already has ab_variant → use that (returning user gets same variant)
  else → pick = Math.random() < 0.5 ? 'A' : 'B'
         save ab_variant on lead (upsert)
         use welcome_text_a (pick=A) or welcome_text_b (pick=B)
else:
  use welcome_text_a (default behaviour, unchanged)
```

Variant assignment fires at the two existing welcome-send points (line ~180 `/start` handler and line ~219 first-message fallback).

### index.html — Settings UI

Location: inside the TG Bot settings panel, after the existing Welcome text textarea and before the Reminder section.

```html
<div style="border-top:1px solid var(--border);padding-top:10px;margin-top:2px;">
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
    <input type="checkbox" id="tgAbEnabledInput" aria-describedby="tgAbHint">
    <label for="tgAbEnabledInput" style="font-size:12px;color:var(--muted);font-weight:600;">
      🧪 A/B тест приветственных сообщений
    </label>
  </div>
  <div id="tgAbHint" style="font-size:10px;color:var(--muted);margin-bottom:6px;">
    Бот случайно выбирает вариант A (текст выше) или B (ниже). Конверсия видна на дашборде.
  </div>
  <div id="tgAbBSection" style="display:none;">
    <label for="tgWelcomeTextBInput" style="font-size:12px;color:var(--muted);display:block;margin-bottom:4px;">
      Вариант B — альтернативное приветствие
    </label>
    <textarea id="tgWelcomeTextBInput" rows="4" style="width:100%;resize:vertical;"
              placeholder="Привет! Это ADERVIS..."></textarea>
  </div>
</div>
```

- `tgAbEnabledInput` toggle → show/hide `tgAbBSection`
- `tgSettings` gets two new fields: `abEnabled: false`, `welcomeTextB: ''`
- `loadTgSettings`: read `tg_ab_enabled`, `tg_welcome_text_b`, populate DOM + in-memory
- `saveTgSettings`: upsert `tg_ab_enabled`, `tg_welcome_text_b` to workspace_settings

### index.html — Dashboard A/B Stats

Location: New `<div id="abTestStats">` immediately after the existing `#tgBotStats` row. Hidden when `ab_enabled = false` or no leads have `ab_variant`.

```html
<div class="dashboard" id="abTestStats" style="display:none;margin-top:-4px;">
  <div class="stat-card" style="border-top-color:var(--primary);">
    <div class="value" id="stat-ab-a-leads" style="color:var(--primary);">0</div>
    <div class="label">Вариант A — лидов</div>
    <div style="font-size:11px;color:var(--muted);margin-top:4px;" id="stat-ab-a-conv">0% конверсия</div>
  </div>
  <div class="stat-card" style="border-top-color:var(--purple);">
    <div class="value" id="stat-ab-b-leads" style="color:var(--purple);">0</div>
    <div class="label">Вариант B — лидов</div>
    <div style="font-size:11px;color:var(--muted);margin-top:4px;" id="stat-ab-b-conv">0% конверсия</div>
  </div>
</div>
```

**Conversion definition:** `leads` where `ab_variant = 'A'/'B'` AND `status >= 2` (В диалоге +) / total leads with that variant.

**`updateStats()`** — extend to compute A/B numbers and toggle `#abTestStats` visibility.

---

## Part 2: Onboarding Carousel «Как пользоваться»

### Goal

A beautiful in-app guide that a new manager can open any time. Button in the header. Auto-opens on first launch (no leads in DB). After first view, only opens manually.

### Trigger Button

In the page header, right of the Settings button:

```html
<button id="helpBtn" class="btn btn-outline" type="button"
        onclick="openOnboarding()"
        aria-label="Как пользоваться приложением"
        style="font-size:12px;padding:5px 12px;">
  📖 Инструкция
</button>
```

### Modal Structure

Full-screen dark overlay + centred card (max-width 560px, max-height 90vh).

```html
<div id="onboardingModal" role="dialog" aria-modal="true"
     aria-labelledby="onboardingTitle" style="display:none;">
  <!-- overlay -->
  <div class="onboarding-overlay" onclick="closeOnboarding()"></div>
  <!-- card -->
  <div class="onboarding-card">
    <!-- progress dots -->
    <div class="onboarding-dots" role="tablist" id="onboardingDots"></div>
    <!-- slides container -->
    <div class="onboarding-slides" id="onboardingSlides"></div>
    <!-- nav -->
    <div class="onboarding-nav">
      <button id="obPrev" class="btn btn-outline" onclick="obGo(-1)"
              aria-label="Предыдущий слайд">←</button>
      <button id="obNext" class="btn" onclick="obGo(1)"
              aria-label="Следующий слайд / Начать работу">Далее →</button>
    </div>
    <!-- close -->
    <button class="onboarding-close" onclick="closeOnboarding()"
            aria-label="Закрыть инструкцию">✕</button>
  </div>
</div>
```

### Slides Data

```js
const ONBOARDING_SLIDES = [
  {
    emoji: '🎯',
    color: 'linear-gradient(135deg,#1e293b,#0f172a)',
    accent: '#6366f1',
    title: 'Добавь первого лида',
    body: 'Нажми «+ Добавить» и вставь ссылку на профиль ВКонтакте, Instagram или Telegram. Выбери тип бизнеса — кафе, барбершоп, салон…',
    tip: 'Можно вставить сразу несколько ссылок через «Массовый импорт».'
  },
  {
    emoji: '🤖',
    color: 'linear-gradient(135deg,#0c1a2e,#0d2137)',
    accent: '#29b6f6',
    title: 'Telegram Bot сам собирает заявки',
    body: 'Добавь ссылку на бота в своё первое сообщение клиенту. Когда он пишет в бот — заявка появляется в OTR автоматически, вместе с брифом.',
    tip: 'Бриф заполняется прямо в Telegram — никаких форм, только кнопки.'
  },
  {
    emoji: '💬',
    color: 'linear-gradient(135deg,#1a1a2e,#16213e)',
    accent: '#a855f7',
    title: 'Готовые скрипты под каждый этап',
    body: 'Открой диалог с лидом → кнопка «Скрипты». Выбери платформу (ВК / Inst / TG) и этап воронки — получишь текст с уже подставленными ссылками.',
    tip: 'Плейбук подскажет следующий шаг в нужный момент.'
  },
  {
    emoji: '✨',
    color: 'linear-gradient(135deg,#1c1917,#292524)',
    accent: '#f59e0b',
    title: 'AI пишет ответы и оценивает лидов',
    body: 'Кнопка «AI» в чате — Gemini предложит ответ на сообщение клиента. После заполнения брифа AI автоматически ставит оценку лиду от 1 до 100.',
    tip: 'Горячие лиды (80+) выделяются золотым бейджем в сайдбаре.'
  },
  {
    emoji: '✋',
    color: 'linear-gradient(135deg,#1e1b4b,#1e1b4b)',
    accent: '#818cf8',
    title: 'Подключись сам когда нужно',
    body: 'Нажми «✋ Подключиться» в заголовке чата — бот замолчит, а ты пишешь вручную. Клиент получает сообщение «Менеджер уже видит ваш запрос».',
    tip: 'Вернуть AI: кнопка «🤖 AI вкл» в том же месте.'
  },
  {
    emoji: '🧪',
    color: 'linear-gradient(135deg,#052e16,#14532d)',
    accent: '#22c55e',
    title: 'A/B тест приветственных сообщений',
    body: 'В Настройках → TG Bot включи A/B тест. Бот будет случайно отправлять клиентам вариант A или B. На дашборде видишь конверсию каждого.',
    tip: 'Используй лучший вариант — удвой заявки без лишней работы.',
    isFinal: true,
    cta: '🚀 Начать работу'
  }
]
```

### Behaviour

| Event | Action |
|-------|--------|
| Click «Далее →» (not last slide) | Go to next slide |
| Click «Далее →» (last slide) | `closeOnboarding()` |
| Click «←» | Go to prev slide (hidden on slide 0) |
| Keyboard `→` / `Space` | Next slide |
| Keyboard `←` | Prev slide |
| Keyboard `Escape` | Close |
| Click overlay | Close |
| Last slide → button becomes «🚀 Начать работу» | |
| Dots | Click dot → jump to slide |

### Auto-open Logic

```js
function maybeAutoOpenOnboarding() {
  if (localStorage.getItem('onboarding_seen')) return
  if (leads.length === 0) openOnboarding()
}
```

Call after initial `loadLeads()`. `closeOnboarding()` sets `localStorage.setItem('onboarding_seen', '1')`.

### Accessibility

- `role="dialog"`, `aria-modal="true"`, `aria-labelledby="onboardingTitle"`
- Focus trap: Tab cycles only within modal while open
- On open: focus `#obNext`; on close: restore focus to `#helpBtn`
- Dots: `role="tab"`, `aria-selected`, `aria-label="Слайд N из M"`
- Slide content rendered in a `<section>` with `role="tabpanel"`
- Each `#onboardingTitle` (h2) is the slide title — updates on slide change

### CSS

```css
.onboarding-overlay { position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:1000; }
.onboarding-card {
  position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
  width:min(560px,92vw);max-height:90vh;overflow-y:auto;
  background:var(--panel);border-radius:20px;border:1px solid var(--line);
  z-index:1001;padding:32px 32px 24px;
}
.onboarding-slide { display:none; }
.onboarding-slide.active { display:block; }
.onboarding-emoji { font-size:72px;line-height:1;margin-bottom:16px;display:block;text-align:center; }
.onboarding-title { font-size:22px;font-weight:700;text-align:center;margin-bottom:12px;color:var(--text); }
.onboarding-body { font-size:14px;line-height:1.6;color:var(--muted);text-align:center;margin-bottom:16px; }
.onboarding-tip { font-size:12px;padding:8px 12px;border-radius:8px;background:var(--bg2);color:var(--text);text-align:center; }
.onboarding-dots { display:flex;justify-content:center;gap:6px;margin-bottom:24px; }
.onboarding-dot { width:8px;height:8px;border-radius:50%;background:var(--line);border:none;cursor:pointer;padding:0; }
.onboarding-dot.active { background:var(--primary);width:20px;border-radius:4px; }
.onboarding-nav { display:flex;justify-content:space-between;align-items:center;margin-top:20px; }
.onboarding-close {
  position:absolute;top:12px;right:14px;background:none;border:none;
  color:var(--muted);font-size:18px;cursor:pointer;line-height:1;padding:4px 8px;
}
.onboarding-close:hover { color:var(--text); }
```

---

## File Map

| File | Change |
|------|--------|
| `supabase/migrations/20260701_ab_test.sql` | new — `tg_welcome_text_b`, `tg_ab_enabled`, `ab_variant` |
| `supabase/functions/tg-webhook/index.ts` | variant selection + `ab_variant` upsert |
| `index.html` | Settings UI, dashboard stats, onboarding modal, helpBtn |

---

## Out of Scope

- Weighted split (70/30) — 50/50 is sufficient for this volume
- Screenshot images in slides — CSS-only cards (no image hosting needed)
- Multiple simultaneous experiments
- Instagram integration — separate sprint
