# AI-черновик в textarea + «Следующий лид» — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Кнопка ✨ ИИ-подсказка вставляет текст прямо в textarea (ледокол для новых лидов, ответ для лидов в диалоге); кнопка "→ Следующий" в заголовке чата переходит к следующему лиду по приоритету.

**Architecture:** Два независимых изменения в одном файле `index.html`. Task 1 добавляет `getNextLead()` / `goToNextLead()` и кнопку в `renderChatHeader()`. Task 2 переписывает `generateManagerSuggestion()` — убирает redirect в script drawer, вместо этого вставляет текст в `#chatInputMain`.

**Tech Stack:** Vanilla JS, Gemini 2.0 Flash API (ключ из `localStorage['adervis_gemini_key_v1']`), CSS Custom Properties. Единственный файл: `index.html` (~4015 строк).

**Spec:** `docs/superpowers/specs/2026-06-15-ai-draft-next-lead.md`

---

## Files

Single file, all changes: `index.html`

Key line references (stable at plan-write time — verify before editing):
- `renderChatHeader()`: line 1643
- `isLeadUrgent()`: line 1352
- `selectTgLead()`: line 1484
- `generateManagerSuggestion()`: line 2943
- `setChatInputTab()`: ~line 2884
- `#chatSuggestBtn` HTML: line 998

---

## Task 1: Кнопка «→ Следующий лид»

Добавляем `getNextLead()`, `goToNextLead()` и кнопку в заголовок чата.

**Files:** `index.html`

- [ ] **Step 1: Добавить `getNextLead()` и `goToNextLead()`**

Найти `function selectTgLead(id)` (line 1484). Вставить **перед** ней два новых функции:

```js
function getNextLead() {
    const sortByLastMsg = arr => arr.slice().sort((a, b) => {
        const ta = ((a.messages||[]).slice(-1)[0]||{}).date || a.updatedAt || 0;
        const tb = ((b.messages||[]).slice(-1)[0]||{}).date || b.updatedAt || 0;
        return Number(tb) - Number(ta);
    });

    const urgent  = sortByLastMsg(leads.filter(l => isLeadUrgent(l)));
    const dialog  = sortByLastMsg(leads.filter(l =>
        !isLeadUrgent(l) && l.messages && l.messages.length > 0));
    const newLeads = leads.filter(l =>
        !isLeadUrgent(l) && (!l.messages || !l.messages.length))
        .sort((a, b) => (b.updatedAt||0) - (a.updatedAt||0));

    const queue = [...urgent, ...dialog, ...newLeads];
    if (!queue.length) return null;
    const idx = queue.findIndex(l => String(l.id) === String(currentChatLeadId));
    return queue[(idx + 1) % queue.length];
}

function goToNextLead() {
    const next = getNextLead();
    if (next) {
        selectTgLead(next.id);
    } else {
        showToast('Это последний лид в очереди', 2000);
    }
}
```

- [ ] **Step 2: Добавить кнопку в `renderChatHeader()`**

Найти `renderChatHeader(lead)` (line 1643). В конце `header.innerHTML = ...` (строка 1654–1667), **после** последней строки с кнопкой 📋:

```js
'<button class="btn btn-outline" onclick="openScriptDrawer()" style="flex-shrink:0;padding:6px 10px;font-size:12px;" aria-label="Открыть шаблоны ответов" data-tooltip="Шаблоны ответов">📋</button>';
```

Заменить на:

```js
'<button class="btn btn-outline" onclick="openScriptDrawer()" style="flex-shrink:0;padding:6px 10px;font-size:12px;" aria-label="Открыть шаблоны ответов" data-tooltip="Шаблоны ответов">📋</button>' +
'<button class="btn btn-outline" onclick="goToNextLead()" id="btnNextLead" style="flex-shrink:0;padding:6px 10px;font-size:12px;" aria-label="Следующий лид" data-tooltip="Следующий лид в очереди">→ Следующий</button>';
```

- [ ] **Step 3: Проверить в браузере**

Открыть `index.html`. Выбрать любой лид. Ожидаемое:
- Кнопка "→ Следующий" видна в заголовке чата справа
- Клик → открывается следующий лид (порядок: срочные → в диалоге → новые)
- Если выбран последний в очереди → toast "Это последний лид в очереди"
- Нет ошибок в консоли

- [ ] **Step 4: Commit**

```
git add index.html
git commit -m "feat: next lead button in chat header with priority queue order"
```

---

## Task 2: One-click AI Draft → прямо в textarea

Переписываем `generateManagerSuggestion()`: новое поведение для лидов без сообщений + убираем redirect в script drawer.

**Files:** `index.html`

- [ ] **Step 1: Заменить всю функцию `generateManagerSuggestion()`**

Найти `async function generateManagerSuggestion(leadId)` (line 2943). Заменить функцию целиком (от `async function` до закрывающей `}`) на:

```js
async function generateManagerSuggestion(leadId) {
    const lead = leads.find(l => String(l.id) === String(leadId));
    if (!lead) return;

    const apiKey = getGeminiKey();
    if (!apiKey) {
        showToast('⚙️ Введите Gemini API ключ в Настройках', 4000);
        openSettingsModal();
        return;
    }

    const btn = document.getElementById('chatSuggestBtn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳...'; }

    const msgs = lead.messages || [];
    let prompt;

    if (!msgs.length) {
        // Режим А: новый лид — генерируем ледокол
        const link = (lead.link || '').toLowerCase();
        const platformName = link.includes('vk.com')        ? 'ВКонтакте'
                           : link.includes('instagram.com') ? 'Instagram'
                           : link.includes('t.me')          ? 'Telegram'
                           : 'соцсетях';
        const bizInfo = lead.bizType ? lead.bizType : 'заведение';

        prompt = [
            'Ты — менеджер по продажам видеопродакшена ADERVIS.',
            'Мы снимаем короткие вертикальные видео (Reels/Shorts/VK Клипы), которые привлекают новых клиентов в бизнес.',
            '',
            'Напиши первое холодное сообщение для:',
            'Бизнес: ' + bizInfo,
            'Название: ' + lead.name,
            'Платформа: ' + platformName,
            '',
            'Требования:',
            '- 2-3 коротких предложения',
            '- Живой разговорный стиль, без официоза',
            '- Конкретный акцент на пользе для этого типа бизнеса',
            '- Не упоминай цену',
            '- Только текст сообщения, без кавычек и предисловий'
        ].join('\n');
    } else {
        // Режим Б: лид в диалоге — ответ на историю
        const historyLines = msgs.slice(-8).map(m =>
            (m.fromClient ? 'Клиент' : 'Менеджер') + ': «' + m.text.slice(0, 200) + '»'
        ).join('\n');
        const bizInfo = lead.bizType ? ' (' + lead.bizType + ')' : '';
        const stageLabels = ['новый лид', 'отправлен ледокол', 'в активном диалоге', 'сделка закрыта', 'отказ/игнор'];
        const stageName = stageLabels[lead.status] || '';
        const lastMsg = msgs[msgs.length - 1];
        const needsFollowUp = lastMsg && !lastMsg.fromClient;

        prompt = [
            'Ты — менеджер по продажам видеопродакшена ADERVIS. Снимаем вертикальные видео для привлечения клиентов в бизнес.',
            '',
            'Лид: «' + lead.name + '»' + bizInfo + '. Стадия: ' + stageName + '.',
            '',
            'История переписки:',
            historyLines,
            '',
            needsFollowUp
                ? 'Менеджер уже писал — клиент не ответил. Напиши один ненавязчивый follow-up.'
                : 'Напиши один следующий ответ менеджера для продвижения к созвону. Тон: живой, без канцелярита.',
            '',
            'Только текст сообщения, без кавычек, пометок и предисловий.'
        ].join('\n');
    }

    try {
        const res = await fetch(
            'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + encodeURIComponent(apiKey),
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { maxOutputTokens: 300, temperature: 0.85 }
                })
            }
        );
        if (!res.ok) {
            const e = await res.json().catch(() => ({}));
            throw new Error((e.error && e.error.message) || 'HTTP ' + res.status);
        }
        const data = await res.json();
        const text = ((data.candidates?.[0]?.content?.parts?.[0]?.text) || '').trim();
        if (!text) throw new Error('Пустой ответ');

        // Вставляем текст прямо в textarea
        const ta = document.getElementById('chatInputMain');
        if (ta) {
            ta.value = text;
            ta.focus();
        }
        // Переключаем на таб "Я написал"
        setChatInputTab('manager');

    } catch (err) {
        showToast('Ошибка Gemini: ' + err.message, 5000);
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '✨ ИИ-подсказка'; }
    }
}
```

- [ ] **Step 2: Проверить в браузере — новый лид**

Открыть лид **без сообщений** (секция "Все лиды" в сайдбаре). Переключиться на таб "Я написал". Нажать "✨ ИИ-подсказка". Ожидаемое:
- Кнопка становится `⏳...` и блокируется
- Через 1-3 сек появляется текст в textarea (ледокол по платформе/bizType)
- Таб остаётся на "Я написал"
- Кнопка восстанавливается
- Нет ошибок в консоли

- [ ] **Step 3: Проверить в браузере — лид в диалоге**

Открыть лид **с историей сообщений**. Нажать "✨ ИИ-подсказка". Ожидаемое:
- Текст продолжения диалога появляется в textarea
- Script drawer НЕ открывается (это было старое поведение)
- Таб "Я написал" активен

- [ ] **Step 4: Проверить отсутствие Gemini ключа**

В Настройках → стереть Gemini ключ. Нажать "✨ ИИ-подсказка". Ожидаемое:
- Toast "⚙️ Введите Gemini API ключ в Настройках"
- Открываются настройки
- Нет ошибки в консоли

- [ ] **Step 5: Commit**

```
git add index.html
git commit -m "feat: AI draft fills textarea directly — icebreaker for new leads, reply for dialog"
```

---

## Acceptance Criteria Checklist

Запустить после завершения всех задач:

- [ ] AC1: Новый лид (нет сообщений) → ✨ ИИ-подсказка → ледокол в textarea
- [ ] AC2: Лид в диалоге → ✨ ИИ-подсказка → ответ в textarea (НЕ в script drawer)
- [ ] AC3: Таб автоматически "Я написал" после генерации
- [ ] AC4: Текст можно редактировать перед отправкой
- [ ] AC5: Кнопка заблокирована во время загрузки (⏳...)
- [ ] AC6: Нет Gemini ключа → toast + настройки, без краша
- [ ] AC7: Кнопка "→ Следующий" видна в заголовке каждого открытого лида
- [ ] AC8: Клик "→ Следующий" → следующий лид в порядке срочные → в диалоге → новые
- [ ] AC9: Последний лид в очереди → toast "Это последний лид в очереди"
- [ ] AC10: Нет JS ошибок в консоли при любом из сценариев выше
