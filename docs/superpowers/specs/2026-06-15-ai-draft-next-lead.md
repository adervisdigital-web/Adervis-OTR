# Spec: AI-черновик в textarea + кнопка «Следующий лид»

**Date:** 2026-06-15
**Status:** Approved
**Scope:** `index.html` (single-file app, ~4015 lines, Vanilla JS + CSS)

---

## Контекст

Менеджер не использует приложение в реальной работе по двум причинам:
1. Кнопка ✨ ИИ-подсказка генерирует текст, но открывает panel со скриптами — текст не попадает в textarea автоматически
2. При 40 лидах непонятно, с кого начать и как быстро переходить к следующему

---

## Feature 1: One-click AI Draft

### Цель

Кнопка `✨ ИИ-подсказка` → текст сразу в `#chatInputMain` (без промежуточных шагов).

### Что меняется в `generateManagerSuggestion(leadId)`

Функция находится на ~line 2943. Два режима:

#### Режим A: Новый лид (нет сообщений)

**Сейчас:** показывает toast "Начните с шаблона" и открывает script drawer — неправильно.

**Новое поведение:**
- Определяем платформу по `lead.link` (vk.com → ВКонтакте, instagram.com → Instagram, t.me → Telegram, иначе → соцсетях)
- Генерируем ледокол через Gemini

Промпт для ледокола:
```
Ты — менеджер по продажам видеопродакшена ADERVIS.
Мы снимаем короткие вертикальные видео (Reels/Shorts/VK Клипы), которые привлекают новых клиентов в бизнес.

Напиши первое холодное сообщение для:
Бизнес: {lead.bizType || 'заведение'}
Название: {lead.name}
Платформа: {platformName}

Требования:
- 2-3 коротких предложения
- Живой разговорный стиль, без официоза
- Сделай конкретный акцент на пользе для этого типа бизнеса
- Не упоминай цену
- Только текст сообщения, без кавычек и предисловий
```

#### Режим B: Лид в диалоге (есть сообщения)

**Сейчас:** вызывает Gemini с историей, получает 2 варианта, сохраняет в `window._aiCard`, открывает script drawer.

**Новое поведение:**
- Промпт и Gemini-вызов **остаются без изменений** (уже хорошие)
- После получения ответа — берём **первый вариант** (`variants[0].text`)
- Вставляем в `#chatInputMain`, вызываем `.focus()`, переключаем таб в 'manager' через `setChatInputTab('manager')`
- `window._aiCard` и `openScriptDrawer()` — **убираем** (больше не нужны)

### Поведение кнопки

| Состояние | Текст кнопки |
|-----------|-------------|
| Обычное | `✨ ИИ-подсказка` |
| Загрузка | `⏳...` + `disabled` |
| Успех | `✨ ИИ-подсказка` (восстановлена) |
| Нет Gemini ключа | toast + открыть настройки (без изменений) |
| Ошибка | toast с текстом ошибки (без изменений) |

Кнопка остаётся только в `manager`-табе (`#chatSuggestBar`, видна когда `tab === 'manager'`). При вставке текста автоматически переключается таб на 'manager' — кнопка сразу доступна для повторной генерации.

### Acceptance criteria

1. Нет сообщений у лида → клик ✨ → Gemini → ледокол в textarea
2. Есть сообщения → клик ✨ → Gemini → первый вариант в textarea
3. Таб автоматически переключается на "Я написал"
4. Текст можно редактировать перед отправкой
5. Кнопка блокируется во время загрузки (нельзя кликнуть дважды)
6. Нет Gemini ключа → toast + настройки (поведение без изменений)

---

## Feature 2: Кнопка «→ Следующий лид»

### Цель

Менеджер быстро переходит к следующему лиду без возврата в сайдбар.

### Расположение

В `.chat-header` (содержит `.lead-title` + кнопки статуса). Добавляем кнопку справа от заголовка лида:

```html
<button id="btnNextLead" class="btn btn-outline" onclick="goToNextLead()"
        aria-label="Следующий лид" data-tooltip="Следующий лид в очереди"
        style="font-size:11px;padding:4px 10px;flex-shrink:0;">
    → Следующий
</button>
```

### Логика `getNextLead()`

Порядок обхода — тот же что рендерит сайдбар:
1. Срочные (`isLeadUrgent(l) === true`), сортировка по дате последнего сообщения ↓
2. В диалоге (`messages.length > 0` и не срочные), сортировка по дате последнего сообщения ↓
3. Новые (`messages.length === 0`), сортировка по `updatedAt` ↓

```js
function getNextLead() {
    const todayStr = new Date().toISOString().slice(0, 10);
    const sortByLastMsg = arr => arr.slice().sort((a, b) => {
        const ta = ((a.messages||[]).slice(-1)[0]||{}).date || a.updatedAt || 0;
        const tb = ((b.messages||[]).slice(-1)[0]||{}).date || b.updatedAt || 0;
        return Number(tb) - Number(ta);
    });

    const urgent  = sortByLastMsg(leads.filter(l => isLeadUrgent(l)));
    const dialog  = sortByLastMsg(leads.filter(l => !isLeadUrgent(l) && l.messages && l.messages.length > 0));
    const newL    = leads.filter(l => !isLeadUrgent(l) && (!l.messages || !l.messages.length))
                         .sort((a,b) => (b.updatedAt||0)-(a.updatedAt||0));

    const queue = [...urgent, ...dialog, ...newL];
    if (!queue.length) return null;

    const idx = queue.findIndex(l => String(l.id) === String(currentChatLeadId));
    return queue[(idx + 1) % queue.length];
}

function goToNextLead() {
    const next = getNextLead();
    if (next) selectTgLead(next.id);
    else showToast('Это последний лид в очереди', 2000);
}
```

### Acceptance criteria

1. Кнопка "→ Следующий" видна в заголовке чата когда лид открыт
2. Клик → переход к следующему лиду в порядке: срочные → в диалоге → новые
3. Если текущий лид последний в очереди → toast "Это последний лид"
4. Если лидов нет → кнопка не вылетает с ошибкой

---

## Data Model Changes

Нет. Все изменения только в JS-функциях и HTML.

---

## CSS Changes

Минимальные. `#btnNextLead` использует существующие классы `btn btn-outline`.

---

## Out of Scope

- Счётчик касаний (отложено)
- Playbook-последовательности
- VK Callback fix (пользователь делает сам через Settings UI)
- Любые изменения в скриптах, CSV, bulk import

---

## Files Changed

Single file: `index.html`

Key locations (verify before editing):
- `generateManagerSuggestion()`: ~line 2943
- `#chatSuggestBar` HTML: ~line 996–998
- `.chat-header` HTML: ~line 1060–1080 (verify)
- `isLeadUrgent()`: ~line 1339
- `selectTgLead()`: ~line 1440 (verify)
- `setChatInputTab()`: ~line 2884
