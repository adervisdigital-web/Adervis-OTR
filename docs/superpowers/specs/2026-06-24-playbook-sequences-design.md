# Playbook-последовательности — Design Spec

**Дата:** 2026-06-24  
**Статус:** Approved

---

## Цель

Улучшить существующую playbook-систему: добавить hint-текст к шагам, превратить крошечный badge в заметный PlaybookBar, и добавить явную кнопку "Выполнено →" вместо скрытой авто-логики при отправке.

---

## Что уже существует в коде

```
getPlaybookConfig()         — returns { steps: [{step, name, daysAfter}] }
loadPlaybookConfig()        — SELECT playbook_config FROM workspace_settings
savePlaybookConfig(steps)   — UPSERT workspace_settings.playbook_config
enrollInPlaybook(leadId)    — sets lead.playbookStep=1, remindAt=today+daysAfter
advancePlaybookStep(leadId) — step++, updates remindAt; called on message send
exitPlaybook(leadId)        — clears playbookStep
renderPlaybookEditor()      — в Settings: список шагов + add/remove
```

**Хранилище:** `workspace_settings.playbook_config` (jsonb) — один плейбук на workspace.  
**Lead fields:** `playbook_step` (integer | null) — уже есть в Supabase.

---

## Delta — что нужно сделать

### 1. Расширить структуру шага: добавить `hint`

Текущая: `{ step, name, daysAfter }`  
Целевая: `{ step, name, hint, daysAfter }`

`hint` — короткий текст (до 100 символов): "Отправь ледокол по скрипту", "Напомни о себе".

Обратная совместимость: если `hint` отсутствует — просто не показываем.

### 2. PlaybookBar в чате

Заменяет текущий крошечный badge в `renderChatHeader()`.

Компонент рендерится **под шапкой, над историей сообщений** — отдельный `<div id="playbookBar">`.

```
┌─────────────────────────────────────────────────────────────┐
│  ⚙ Шаг 2 / 3 · Дожим                    [Выполнено →] [✕]  │
│  "Напомни о себе, предложи созвон"                          │
└─────────────────────────────────────────────────────────────┘
```

Стиль: `background: rgba(200,144,42,.08); border-bottom: 1px solid var(--primary-border); padding: 8px 16px;`

- Скрыт если `lead.playbookStep == null`
- Показывается если лид в плейбуке

### 3. Кнопка "Выполнено →"

`advancePlaybookStep(leadId)` уже существует — нужно только добавить явную кнопку в PlaybookBar.

- "Выполнено →" → вызывает `advancePlaybookStep(leadId)`, обновляет bar
- На последнем шаге: step → null, toast "Плейбук завершён ✓"
- "✕" → вызывает `exitPlaybook(leadId)`

**Auto-advance при отправке убираем:** строка 3871 (`if (!fromClient) advancePlaybookStep(leadId)`) и строка 3912 (внутри VK-send callback). Только явная кнопка.

### DOM — куда вставить PlaybookBar

В HTML (около строки 1482) добавить статический div **внутрь `.chat-body`, перед `#chatFeedMain`**:

```html
<div class="chat-body">
  <div id="playbookBar" style="display:none;"></div>  <!-- ДОБАВИТЬ -->
  <div id="chatFeedMain" ...></div>
  ...
</div>
```

`renderPlaybookBar(lead)` вызывать из `renderChatHeader(lead)` (уже вызывается везде где нужно).

### 4. Редактор шагов: добавить поле hint

В `renderPlaybookEditor()` — добавить input для `hint` рядом с `name`:

```
Шаг 1  [Название: Ледокол        ]  [Hint: Отправь первое сообщение  ]  через [0] дн.  [✕]
```

---

## Что НЕ входит в этот спек

- Мульти-плейбуки (отдельная `playbooks` таблица) — отложено, один плейбук достаточен для MVP
- Drag-to-reorder шагов
- Привязка шага к конкретному скрипту из библиотеки
- auto-advance по remindAt (cron/edge function)

---

## Затронутые части кода

| Функция/элемент | Изменение |
|---|---|
| Step structure | + поле `hint` |
| `renderPlaybookEditor()` | + input для hint |
| `renderChatHeader()` | убрать inline badge, добавить `<div id="playbookBar">` |
| `renderChatHeader(lead)` (все вызовы) | добавить вызов `renderPlaybookBar(lead)` в конец |
| `renderPlaybookBar(lead)` | новая функция |
| `advancePlaybookStep(leadId)` | без изменений |
| Строки 3871, 3912 | убрать вызовы `advancePlaybookStep` (auto-advance) |

---

## Порядок реализации

1. Расширить тип шага (добавить `hint`, обратная совместимость)
2. Обновить `renderPlaybookEditor()` — добавить поле hint
3. Создать `renderPlaybookBar(lead)` — HTML компонент
4. Внедрить PlaybookBar в layout чата (под header, над messages)
5. Убрать auto-advance при отправке
6. Тест: Настройки → добавить hint → открыть чат → проверить bar
