# Playbook-цепочки — Design Spec

**Дата:** 2026-06-16  
**Статус:** Approved  
**Продукт:** ADERVIS OTR

---

## Цель

Автоматизировать планирование follow-up касаний: менеджер отправляет сообщение → система сама ставит напоминание на следующий шаг. Менеджер не держит в голове "когда писать снова".

---

## Решение: Подход A (тонкий слой)

Один глобальный Playbook. Конфиг — в `workspace_settings`. Прогресс — одна колонка `playbook_step` на таблице `leads`.

---

## Схема данных

### Миграция SQL

```sql
ALTER TABLE leads ADD COLUMN playbook_step INTEGER DEFAULT NULL;
```

- `NULL` — лид вне плейбука
- `1` — шаг 1 текущий (ещё не выполнен)
- `2` — шаг 2 текущий (шаг 1 выполнен)
- `N > steps.length` — плейбук завершён → сбрасывается в NULL

### workspace_settings — поле playbook_config

```json
{
  "steps": [
    { "step": 1, "name": "Ледокол", "daysAfter": 0 },
    { "step": 2, "name": "Дожим",   "daysAfter": 2 },
    { "step": 3, "name": "Финал",   "daysAfter": 3 }
  ]
}
```

`daysAfter` = сколько дней добавить к сегодняшней дате для `remindAt` после выполнения этого шага.

### Структура лида (обновлена)

```js
{ id, name, link, contact, bizType, status(0-4), updatedAt, notes,
  messages[], remindAt, attemptCount, assignedTo, createdBy, vkPeerId,
  playbookStep  // ← новое
}
```

---

## Бизнес-логика

### getPlaybookConfig()

```
→ читает workspace_settings.playbook_config из памяти (уже загружено при старте)
→ если нет — возвращает дефолт: [Ледокол/0, Дожим/2, Финал/3]
```

### enrollInPlaybook(leadId)

```
→ config = getPlaybookConfig()
→ если config.steps.length === 0 → toast "Playbook не настроен", выход
→ lead.playbookStep = 1                           (шаг 1 — текущий)
→ lead.remindAt = today + config.steps[0].daysAfter  (обычно 0 = сегодня)
→ сохраняет в Supabase
→ вызывается: при добавлении нового лида (если чекбокс ✓) или вручную из карточки
```

### advancePlaybookStep(leadId)

```
→ вызывается внутри submitChatInput() сразу после сохранения сообщения менеджера
→ если lead.playbookStep === null → ничего не делает (выход)
→ config = getPlaybookConfig()
→ nextStep = lead.playbookStep + 1
→ если nextStep > config.steps.length:
    lead.playbookStep = null  (плейбук завершён)
    lead.remindAt без изменений
→ иначе:
    stepConfig = config.steps[nextStep - 1]  (0-indexed)
    lead.playbookStep = nextStep
    lead.remindAt = today + stepConfig.daysAfter дней
→ сохраняет в Supabase
```

### exitPlaybook(leadId)

```
→ lead.playbookStep = null
→ сохраняет в Supabase
→ вызывается кнопкой ✕ в чат-хедере
```

### Интеграция с очередью

`isLeadUrgent()` уже проверяет `lead.remindAt <= today` — лиды из плейбука автоматически попадают в секцию 🔥 без изменений.

---

## UI

### 1. Чат-хедер (renderChatHeader)

Если `lead.playbookStep !== null`:
```
[Название лида] · ⚙ Шаг 2/3: Дожим  [✕]
```
- Бейдж показывает номер/всего шагов + название текущего шага
- `✕` вызывает `exitPlaybook(leadId)`, бейдж исчезает

### 2. Добавление нового лида

В форму "Новый лид" добавляется чекбокс:
```
☑ Начать Playbook автоматически
```
По умолчанию включён. Если ✓ → `enrollInPlaybook()` после сохранения.

### 3. Карточка лида (Lead Drawer)

Кнопка в секции действий:
```
[▶ Подключить к Playbook]   (если playbookStep === null)
[⚙ Шаг 2/3: Дожим  · Выйти из Playbook]  (если активен)
```

### 4. Настройки → вкладка "Playbook"

Редактор шагов:
```
Шаг 1  [Ледокол ]  через [ 0] дн.  [✕]
Шаг 2  [Дожим   ]  через [ 2] дн.  [✕]
Шаг 3  [Финал   ]  через [ 3] дн.  [✕]
                              [+ Добавить шаг]
                              [Сохранить]
```
Сохраняется в `workspace_settings.playbook_config` через Supabase upsert.

---

## Поведение при ответе клиента

Плейбук **не останавливается** при входящем сообщении. Менеджер сам выходит через `✕` если сделка перешла в живой диалог.

---

## Граничные случаи

| Ситуация | Поведение |
|---|---|
| Менеджер редактирует шаги плейбука пока лиды активны | Лиды продолжают с текущим `playbookStep`, новый конфиг применяется только к следующему `advancePlaybookStep` |
| Лид переведён в статус "Успех" или "Отказ" | playbookStep не трогается; лид просто исчезает из очереди |
| Шаг 1, `daysAfter = 0` | `remindAt = сегодня` → лид сразу в 🔥 |
| Плейбук из 0 шагов (пользователь удалил все) | enrollInPlaybook() ничего не делает, показывает toast "Playbook не настроен" |

---

## Что НЕ входит в scope

- Несколько плейбуков (один для кафе, один для барбершопов)
- Аналитика конверсии по шагам
- Скрипты привязанные к шагу (scriptId в конфиге — зарезервировано, не реализуется сейчас)
- Отправка сообщений из плейбука без участия менеджера
