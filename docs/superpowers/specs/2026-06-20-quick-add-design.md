# Quick Add Modal — Design Spec

**Date:** 2026-06-20  
**Feature:** Быстрое добавление лида через URL-first модалку  
**File:** `index.html` (single-file app, Vanilla JS + Supabase)

---

## Проблема

1. Менеджер находит заведение → вынужден заполнять 4 поля вручную (название, ссылка, ЛПР, сегмент).
2. Мобильный FAB (`+`) вызывает `openAddModal()` — функция не определена → JS-ошибка.
3. Форма добавления существует только в `#table-view`; в TG-view (основной экран) добавить лида нельзя.

---

## Решение

**URL-first модалка** — менеджер вставляет ссылку, имя и платформа заполняются автоматически. После нажатия "Добавить" модалка закрывается и открывается чат нового лида.

Триггеры открытия:
- Кнопка `+ Лид` в `.tg-sidebar-header` рядом с заголовком "Диалоги" (desktop, **новая кнопка**)
- FAB `+` на мобильном tab bar (исправляет текущий баг — `openAddModal` не была определена)
- Команда `/new` в Command Palette (Ctrl+K)

---

## UX Flow

```
Менеджер нажимает +
  → модалка открывается, фокус на поле URL
  → вставляет ссылку (vk.com/handle, t.me/handle, @handle)
  → JS парсит URL: detectPlatform() + extractNameFromUrl()
  → имя автозаполняется (редактируемо), платформа показана тегом
  → опционально: выбрать сегмент
  → нажимает "✓ Добавить в воронку" (или Enter)
  → лид сохраняется в Supabase, enrollInPlaybook() если чекбокс ✓
  → модалка закрывается
  → selectTgLead(newLead.id) — открывается чат нового лида
```

Ошибка: если URL пустой и имя пустое → поле URL подсвечивается красным, отправка блокируется. Алерт не показывается.

---

## Автодетект URL

### `detectPlatform(url)`
Возвращает `{ icon, name, key }` или `null`.

| Паттерн | Платформа |
|---------|-----------|
| `vk.com/*`, `vkontakte.ru/*` | `{ icon:'🔵', name:'VK', key:'vk' }` |
| `instagram.com/*`, `instagr.am/*` | `{ icon:'🟣', name:'Instagram', key:'inst' }` |
| `t.me/*`, `telegram.me/*` | `{ icon:'💬', name:'Telegram', key:'tg' }` |
| `@anything` | `{ icon:'💬', name:'Telegram', key:'tg' }` |
| иное | `null` (показывает ⚠️ но не блокирует) |

### `extractNameFromUrl(url)`
Извлекает slug из URL → форматирует в Title Case, замена `-_` на пробел.

Примеры:
- `vk.com/coffee_cherry` → `Coffee Cherry`
- `t.me/barbershop_mik` → `Barbershop Mik`
- `@salon_style` → `Salon Style`
- `instagram.com/rest.name` → `Rest Name`

Если slug не извлечён → возвращает `''` (поле остаётся пустым, пользователь вводит вручную).

Имя автозаполняется только если поле было пустым до вставки. После автозаполнения — редактируемо.

---

## Компоненты

### HTML — модалка `#quickAddModal`

Структура внутри `<body>` перед `#toastEl`:
```
div#quickAddOverlay        (backdrop, onclick → closeQuickAdd)
div#quickAddModal          (role=dialog, aria-modal, aria-labelledby)
  div.modal-header         (заголовок + кнопка закрытия)
  div.modal-body
    div                    (URL input + status icon + platform tag)
    div                    (Name input + "✨ автозаполнено" label)
    select#qaSegment       (сегмент, опционально)
    div                    (Playbook checkbox + submit button)
```

### CSS

Модалка использует существующие токены — `--panel`, `--line`, `--primary`, `--radius-xl`. Никаких новых CSS переменных. Анимация: `opacity 0→1 + translateY(8px→0)` за 0.18s.

На `@media (max-width: 768px)`: `width: calc(100vw - 24px)` (уже покрыто правилом `.modal`).

### JS — новые функции

| Функция | Описание |
|---------|----------|
| `openQuickAdd()` | Открывает модалку, фокус на URL-поле. Alias: `openAddModal()` |
| `closeQuickAdd()` | Закрывает модалку, очищает поля, возвращает фокус на триггер |
| `onQuickAddUrlInput(val)` | oninput/onpaste: парсит URL, заполняет имя, показывает тег |
| `submitQuickAdd()` | Валидирует, создаёт лид, вызывает enrollInPlaybook если нужно, вызывает selectTgLead |
| `detectPlatform(url)` | Чистая функция: URL → `{icon, name, key}` или null |
| `extractNameFromUrl(url)` | Чистая функция: URL → строка имени |

`openAddModal` — алиас для `openQuickAdd` (чтобы мобильный FAB работал без изменений HTML).

### Изменения в существующем коде

| Место | Изменение |
|-------|-----------|
| `.tg-sidebar-header` (строка ~1149) | Добавить кнопку `+ Лид` рядом с заголовком "Диалоги" |
| Command Palette `executePaletteItem` (строка ~4602) | `case 'new'` → `openQuickAdd()` вместо `openBulkModal()` |
| Пустое состояние `#tgLeadList` | Текст "Нажмите **+ Лид**" уже корректен — ничего не менять |

Старая inline-форма (`.controls` с 4 полями в table-view) **удаляется** — она заменяется Quick Add модалкой. Кнопка `+ Лид` в table-view (строка 996, `openBulkModal()`) **остаётся** — это отдельный bulk import.  
Функция `addLead()` больше не вызывается — удаляется вместе со старой формой.

---

## Данные

Новый лид создаётся со структурой, идентичной текущему `addLead()`:

```js
{
  id: uid(),
  name,           // из поля или extractNameFromUrl
  link: normalizeUrl(url),
  contact: '',    // не заполняется в quick add
  status: 0,
  bizType,        // из select сегмента
  updatedAt: Date.now(),
  notes: '',
  messages: [],
  assignedTo: currentUser?.id,
  createdBy: currentUser?.id,
  vkPeerId: null,
  playbookStep: null  // enrollInPlaybook установит если чекбокс ✓
}
```

---

## Accessibility

- `role="dialog"`, `aria-modal="true"`, `aria-labelledby="qaModalTitle"`
- Фокус при открытии: URL input
- Фокус при закрытии: возврат на триггер (сохраняем `_qaFocusTrigger = document.activeElement`)
- Esc → закрыть (keydown listener, удаляется при закрытии)
- Backdrop click → закрыть
- Все inputs имеют `<label>` или `aria-label`

---

## Out of Scope

- Автодетект сегмента по URL (слишком эвристично, часто неверно)
- Поле "Имя ЛПР" — убирается из quick add, доступно в Lead Drawer после создания
- Bulk import через эту модалку — остаётся отдельной кнопкой

---

## Success Criteria

- [ ] Нажать + в шапке → модалка открылась, фокус на URL
- [ ] Вставить `vk.com/coffeecherry` → имя = "Coffeecherry", тег "🔵 VK"
- [ ] Нажать "Добавить" → лид в Supabase, чат открылся
- [ ] Мобильный FAB + → та же модалка (нет JS-ошибки)
- [ ] Ctrl+K → /new → та же модалка
- [ ] Esc / клик backdrop → модалка закрылась, фокус вернулся
- [ ] Пустой URL + пустое имя → красная граница поля, не отправляется
