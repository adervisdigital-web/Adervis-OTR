# Playbook Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить hint-текст к шагам плейбука и вывести заметный PlaybookBar в чате с явной кнопкой "Выполнено →".

**Architecture:** Vanilla JS single-file app (`index.html`, 6514 строк). Данные хранятся в `workspace_settings.playbook_config` (jsonb). PlaybookBar — статический `<div id="playbookBar">` в HTML, заполняемый функцией `renderPlaybookBar(lead)` при каждом открытии чата.

**Tech Stack:** Vanilla JS, CSS Custom Properties, Supabase JS SDK v2. Без тестового фреймворка — проверка вручную в браузере.

---

## Файлы

- Modify: `index.html` (единственный файл)
  - Строка ~1482: HTML — добавить `<div id="playbookBar">`
  - Строка ~4608: `getPlaybookConfig()` — добавить hint в дефолтные шаги
  - Строка ~5235: `renderPlaybookEditor()` — добавить поле hint
  - Строка ~5252: `addPlaybookStep()` — добавить hint: ''
  - Строка ~5267: `savePlaybookFromEditor()` — считывать data-pb-hint
  - Строка ~2437: `renderChatHeader(lead)` — убрать inline badge, добавить вызов `renderPlaybookBar`
  - Строка ~3871: убрать `advancePlaybookStep` при отправке
  - Строка ~3912: убрать `advancePlaybookStep` в VK callback
  - Новая функция `renderPlaybookBar(lead)` — добавить рядом с `advancePlaybookStep`

---

## Task 1: Расширить структуру шага — добавить поле `hint`

**Files:**
- Modify: `index.html:4608-4616` (`getPlaybookConfig`)
- Modify: `index.html:5239-5249` (`renderPlaybookEditor`)
- Modify: `index.html:5252-5257` (`addPlaybookStep`)
- Modify: `index.html:5267-5280` (`savePlaybookFromEditor`)

- [ ] **Step 1: Обновить дефолтный конфиг** — добавить `hint` к дефолтным шагам в `getPlaybookConfig()`

Заменить блок `steps: [...]` (строки 4611–4615):

```javascript
steps: [
    { step: 1, name: 'Ледокол',  hint: 'Отправь первое сообщение по скрипту', daysAfter: 0 },
    { step: 2, name: 'Дожим',    hint: 'Напомни о себе, предложи созвон',      daysAfter: 2 },
    { step: 3, name: 'Финал',    hint: 'Последняя попытка — скидка или пример', daysAfter: 3 }
]
```

- [ ] **Step 2: Обновить редактор шагов** — добавить поле hint в `renderPlaybookEditor()`

Заменить весь `container.innerHTML = config.steps.map(...)` (строки 5239–5249):

```javascript
container.innerHTML = config.steps.map(function(s, i) {
    return '<div style="display:flex;flex-direction:column;gap:4px;padding:6px 0;border-bottom:1px solid var(--line-subtle);">' +
        '<div style="display:flex;align-items:center;gap:6px;">' +
            '<span style="font-size:11px;color:var(--muted);width:44px;flex-shrink:0;">Шаг ' + (i + 1) + '</span>' +
            '<input type="text" value="' + escapeHtml(s.name) + '" placeholder="Название" style="flex:1;font-size:12px;" data-pb-name="' + i + '" aria-label="Название шага ' + (i+1) + '">' +
            '<span style="font-size:11px;color:var(--muted);white-space:nowrap;flex-shrink:0;">через</span>' +
            '<input type="number" value="' + (s.daysAfter || 0) + '" min="0" max="30" style="width:48px;font-size:12px;" data-pb-days="' + i + '" aria-label="Дней до шага ' + (i+1) + '">' +
            '<span style="font-size:11px;color:var(--muted);flex-shrink:0;">дн.</span>' +
            '<button style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:14px;padding:2px 6px;line-height:1;" ' +
                'onclick="removePlaybookStep(' + i + ')" aria-label="Удалить шаг ' + (i+1) + '">✕</button>' +
        '</div>' +
        '<input type="text" value="' + escapeHtml(s.hint || '') + '" placeholder="Подсказка менеджеру (что делать на этом шаге)" ' +
            'style="font-size:11px;color:var(--muted);background:transparent;border:1px solid var(--line-subtle);border-radius:4px;padding:3px 8px;width:100%;box-sizing:border-box;" ' +
            'data-pb-hint="' + i + '" aria-label="Подсказка для шага ' + (i+1) + '">' +
    '</div>';
}).join('');
```

- [ ] **Step 3: Обновить addPlaybookStep** — новый шаг включает hint

Заменить строку внутри `addPlaybookStep()` (строка ~5254):

```javascript
config.steps.push({ step: config.steps.length + 1, name: 'Новый шаг', hint: '', daysAfter: 2 });
```

- [ ] **Step 4: Обновить savePlaybookFromEditor** — считывать `data-pb-hint`

Заменить весь `savePlaybookFromEditor()` (строки 5267–5280):

```javascript
async function savePlaybookFromEditor() {
    const nameInputs = document.querySelectorAll('[data-pb-name]');
    const daysInputs = document.querySelectorAll('[data-pb-days]');
    const hintInputs = document.querySelectorAll('[data-pb-hint]');
    const steps = [];
    nameInputs.forEach(function(el, i) {
        steps.push({
            step:     i + 1,
            name:     (el.value || '').trim() || ('Шаг ' + (i + 1)),
            hint:     ((hintInputs[i] || {}).value || '').trim(),
            daysAfter: Math.max(0, parseInt((daysInputs[i] || {}).value, 10) || 0)
        });
    });
    await savePlaybookConfig(steps);
    renderPlaybookEditor();
}
```

- [ ] **Step 5: Проверить в браузере** — открыть Настройки → Playbook-цепочка. Должны появиться поля-подсказки под каждым шагом. Ввести текст в подсказку → Сохранить → переоткрыть Настройки → подсказка должна сохраниться.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat(playbook): add hint field to steps — editor + save/load"
```

---

## Task 2: Добавить статический div в HTML

**Files:**
- Modify: `index.html:1482-1485` (chat-body)

- [ ] **Step 1: Добавить `<div id="playbookBar">` в HTML**

Найти строку 1482 (`<div class="chat-body">`). Вставить div сразу после открывающего тега, перед `<!-- History feed -->`:

```html
<div class="chat-body">
    <div id="playbookBar" style="display:none;" role="status" aria-live="polite" aria-label="Текущий шаг плейбука"></div>

    <!-- History feed -->
    <div id="chatFeedMain" role="log" aria-live="polite" aria-label="История диалога"></div>
```

- [ ] **Step 2: Добавить CSS для playbookBar** — после существующих стилей `.chat-body` (искать по строке 291)

Добавить правило в блок `<style>`:

```css
#playbookBar {
    padding: 8px 16px;
    background: rgba(200, 144, 42, .07);
    border-bottom: 1px solid rgba(200, 144, 42, .25);
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
}
#playbookBar .pb-meta { flex: 1; min-width: 0; }
#playbookBar .pb-title { font-size: 12px; font-weight: 600; color: #E0A83A; }
#playbookBar .pb-hint  { font-size: 11px; color: var(--muted); margin-top: 1px; }
#playbookBar .pb-done  { background: rgba(200,144,42,.15); border: 1px solid rgba(200,144,42,.4); color: #E0A83A; border-radius: 6px; padding: 4px 12px; font-size: 12px; cursor: pointer; white-space: nowrap; flex-shrink: 0; }
#playbookBar .pb-done:hover { background: rgba(200,144,42,.25); }
#playbookBar .pb-exit  { background: none; border: none; color: var(--muted); cursor: pointer; font-size: 16px; padding: 2px 4px; line-height: 1; flex-shrink: 0; }
#playbookBar .pb-exit:hover { color: var(--text); }
```

- [ ] **Step 3: Проверить** — div должен присутствовать в DOM (DevTools → Elements). По умолчанию `display:none`.

---

## Task 3: Создать функцию renderPlaybookBar(lead)

**Files:**
- Modify: `index.html` — добавить функцию рядом с `advancePlaybookStep` (~строка 4757)

- [ ] **Step 1: Добавить функцию** — вставить после `exitPlaybook` (~строка 4784):

```javascript
function renderPlaybookBar(lead) {
    const bar = document.getElementById('playbookBar');
    if (!bar) return;
    if (lead == null || lead.playbookStep == null) {
        bar.style.display = 'none';
        bar.innerHTML = '';
        return;
    }
    const cfg = getPlaybookConfig();
    const stepIdx = lead.playbookStep - 1;
    const step = cfg.steps[stepIdx];
    if (!step) {
        bar.style.display = 'none';
        bar.innerHTML = '';
        return;
    }
    const total   = cfg.steps.length;
    const safeId  = escapeHtml(String(lead.id));
    const isLast  = lead.playbookStep >= total;
    bar.style.display = 'flex';
    bar.innerHTML =
        '<div class="pb-meta">' +
            '<div class="pb-title">Шаг ' + lead.playbookStep + ' / ' + total + ' &middot; ' + escapeHtml(step.name) + '</div>' +
            (step.hint ? '<div class="pb-hint">' + escapeHtml(step.hint) + '</div>' : '') +
        '</div>' +
        '<button class="pb-done" onclick="advancePlaybookStep(\'' + safeId + '\')" ' +
            'aria-label="Отметить шаг выполненным и перейти к следующему">' +
            (isLast ? 'Завершить ✓' : 'Выполнено →') +
        '</button>' +
        '<button class="pb-exit" onclick="exitPlaybook(\'' + safeId + '\')" ' +
            'aria-label="Выйти из плейбука">✕</button>';
}
```

- [ ] **Step 2: Проверить функцию изолированно** — в консоли DevTools: `renderPlaybookBar(leads[0])`. Если у лида нет playbookStep — bar должен быть скрыт.

---

## Task 4: Интегрировать PlaybookBar + убрать auto-advance

**Files:**
- Modify: `index.html:2437-2475` (`renderChatHeader`)
- Modify: `index.html:3871` (auto-advance при логе менеджера)
- Modify: `index.html:3912` (auto-advance при VK send)

- [ ] **Step 1: Убрать inline badge из renderChatHeader**

В функции `renderChatHeader(lead)` удалить IIFE-блок со строк 2455–2464:

```javascript
// УДАЛИТЬ весь этот блок:
(function() {
    if (lead.playbookStep == null) return '';
    const cfg = getPlaybookConfig();
    const stepName = cfg.steps[lead.playbookStep - 1] ? cfg.steps[lead.playbookStep - 1].name : '';
    const total = cfg.steps.length;
    return '<span style="display:inline-flex;align-items:center;gap:4px;background:rgba(200,144,42,.12);border:1px solid rgba(200,144,42,.35);color:#E0A83A;border-radius:4px;padding:2px 8px;font-size:11px;flex-shrink:0;">' +
        '⚙ Шаг ' + lead.playbookStep + '/' + total + ': ' + escapeHtml(stepName) +
        '<button onclick="exitPlaybook(\'' + escapeHtml(String(lead.id)) + '\')" style="background:none;border:none;color:#E0A83A;cursor:pointer;font-size:12px;padding:0 0 0 4px;line-height:1;" aria-label="Выйти из Playbook">✕</button>' +
    '</span>';
})() +
```

- [ ] **Step 2: Добавить вызов renderPlaybookBar в конец renderChatHeader**

После последней строки `header.innerHTML = '...'` (строка ~2474) добавить:

```javascript
renderPlaybookBar(lead);
```

- [ ] **Step 3: Убрать auto-advance при логировании сообщения менеджера** (строка 3871)

Строка:
```javascript
if (!fromClient) advancePlaybookStep(leadId);
```
Удалить полностью.

- [ ] **Step 4: Убрать auto-advance в VK-send callback** (строка 3912)

Строка:
```javascript
advancePlaybookStep(leadId);
```
Удалить полностью.

- [ ] **Step 5: Убрать вызовы renderChatHeader которые уже не вызывают renderPlaybookBar**

Проверить: `advancePlaybookStep` и `exitPlaybook` вызывают `renderChatHeader(lead)` — значит bar обновится автоматически. Ничего добавлять не нужно.

- [ ] **Step 6: Финальная проверка в браузере**

Сценарий A — Лид без плейбука:
1. Открыть любой лид → PlaybookBar не виден
2. В drawer нажать "▶ Подключить к Playbook" → закрыть drawer
3. Открыть чат → PlaybookBar появился с шагом 1 и hint-текстом

Сценарий B — Прогресс:
1. Нажать "Выполнено →" → bar обновился (шаг 2)
2. Отправить сообщение → шаг НЕ меняется автоматически
3. На последнем шаге → кнопка "Завершить ✓" → toast "Плейбук завершён" → bar скрыт

Сценарий C — Выход:
1. Нажать ✕ в bar → bar скрыт → в drawer кнопка снова "▶ Подключить"

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "feat(playbook): PlaybookBar in chat — explicit done button, step hints, no auto-advance"
```

---

## Self-Review Checklist

### Spec coverage
- [x] hint поле в шаге → Task 1
- [x] PlaybookBar под header → Task 2 + 3
- [x] "Выполнено →" кнопка → Task 3
- [x] Убрать auto-advance → Task 4 (Steps 3–4)
- [x] "✕" exit → Task 3 (renderPlaybookBar)
- [x] Toast "Плейбук завершён" → уже в `advancePlaybookStep` (step > total → playbookStep = null) — нужно добавить toast

### Gap: Toast при завершении плейбука

В `advancePlaybookStep` (строка ~4762) при `nextStep > config.steps.length` нет toast. Добавить в Task 4 Step 5:

**Modify `advancePlaybookStep`** — добавить toast при завершении:

```javascript
async function advancePlaybookStep(leadId) {
    const lead = leads.find(function(l) { return String(l.id) === String(leadId); });
    if (!lead || lead.playbookStep == null) return;
    const config = getPlaybookConfig();
    const nextStep = lead.playbookStep + 1;
    if (nextStep > config.steps.length) {
        lead.playbookStep = null;
        showToast('Плейбук завершён ✓', 3000);   // ← ДОБАВИТЬ
    } else {
        const stepConfig = config.steps[nextStep - 1];
        lead.playbookStep = nextStep;
        const d = new Date();
        d.setDate(d.getDate() + (stepConfig.daysAfter || 0));
        lead.remindAt = d.toISOString().slice(0, 10);
    }
    lead.updatedAt = Date.now();
    upsertLead(lead);
    if (String(currentChatLeadId) === String(lead.id)) renderChatHeader(lead);
}
```

Включить этот шаг в **Task 4 Step 5** (перед финальной проверкой).
