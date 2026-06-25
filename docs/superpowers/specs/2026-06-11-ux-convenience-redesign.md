# UX Convenience Redesign — ADERVIS OTR

**Date:** 2026-06-11  
**Status:** Approved for implementation  
**Scope:** Chat-view two-column layout + app-wide convenience improvements  
**Design reference:** 21st.dev — clean, minimal, dark, high-information-density

---

## Problem Statement

The current chat-view mixes stage context, script templates, history, and navigation controls without clear hierarchy. The user can't tell at a glance: *what stage am I on, what do I send next, and what has already been said?* Script template cards are truncated and unreadable. There is no way to edit or delete logged messages.

Across the app, minor friction points accumulate: search fires on every keystroke, the table row gives no preview of last activity, and the "→ Диалог" button leads to a cramped single-column view.

---

## 1. Chat-View: Two-Column Layout

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│ ← Назад  [Название лида]  [ВК badge] [Сегмент]  [Статус]  │  ← header
├─────────────────────────────┬───────────────────────────────┤
│                             │  ЭТАП: прогресс-бар + имя    │
│   ИСТОРИЯ ПЕРЕПИСКИ         │  В диалоге · 2/4              │
│                             ├───────────────────────────────┤
│   [пузыри сообщений]        │  Вкладки: [ВК ✓] [Inst] [TG]│
│   — каждый с ✏️ 🗑 —        │                               │
│                             │  Шаблоны ответов:             │
│                             │  [полный текст скрипта 1]     │
│                             │  [Скопировать] [Отправлено ✓] │
│                             │                               │
│                             │  [полный текст скрипта 2]     │
│                             │  [Скопировать] [Отправлено ✓] │
│                             │                               │
│                             │  [✨ AI-ответ]                │
│                             ├───────────────────────────────┤
│  [Вставить текст клиента…]  │  Черновик textarea            │
│  [← Ответ клиента]          │  [Отправлено ✓] [Копировать] │
├─────────────────────────────┴───────────────────────────────┤
│  ✅ Закрыть сделку          │  🔴 Отказ                     │  ← stage nav
├─────────────────────────────────────────────────────────────┤
│  📝 Заметки: [textarea]    📅 [дата перезвонить]  [Убрать] │  ← notes strip
└─────────────────────────────────────────────────────────────┘
```

**Right column width:** 340px fixed, left column fills remaining space.  
**Responsive:** below 768px — single column, right panel стекается снизу.

### Stage Panel (правая колонка, верх)

- Прогресс-бар: 4 сегмента, зелёный = пройдено, фиолетовый = текущий, серый = будущий
- Название этапа (Новый / Ледокол / В диалоге / Успех / Отказ) — 12px bold фиолетовый
- Подпись с описанием действия — 10px muted

### Platform Tabs

- Вкладки ВК / Inst / TG — автоматически активируется нужная по `lead.link`
- При переключении вкладки — меняется набор скриптов (уже реализовано в логике, нужен новый UI)
- Активная вкладка: `border: 1px solid rgba(94,106,210,.45)`, background tint

### Script Cards (правая колонка, середина)

- Полный текст — без truncate, с `white-space: pre-wrap`, `line-height: 1.55`
- Максимум 3 карточки + AI кнопка (если скриптов больше — скролл внутри правой панели)
- Каждая карточка: текст → две кнопки `[Скопировать]` + `[Отправлено ✓]`
- «Скопировать» — копирует в clipboard и подставляет в черновик
- «Отправлено ✓» — сохраняет как исходящее в историю, очищает черновик

### Draft Area (правая колонка, низ)

- `textarea` min-height 48px, resize: vertical
- `[Отправлено ✓]` — сохраняет черновик как manager message
- `[Копировать]` — копирует черновик в clipboard без сохранения

---

## 2. Message Edit & Delete

### Edit Flow

1. Навести на сообщение → показать `[✏️]` `[🗑]` (opacity 0 → 1 по hover, на мобильном всегда видны)
2. Клик `[✏️]` → сообщение разворачивается in-place в редактируемый `<textarea>` с текущим текстом
3. Показать `[Сохранить]` `[Отмена]` под textarea
4. `[Сохранить]` → обновляет `messages[i].text`, сохраняет в localStorage, перерендеривает
5. `[Отмена]` → возвращает исходный пузырь без изменений

### Delete Flow

1. Клик `[🗑]` → `confirm('Удалить это сообщение?')`
2. Confirm → `messages.splice(i, 1)`, save, re-render
3. Отмена → ничего не происходит

### Data: `messages` array

Существующая структура `{text, date, fromClient}` дополняется полем `edited: boolean` (опционально показывать пометку «изм.» рядом с временем).

---

## 3. Переименование кнопки

- `«+ Клиент»` → `«← Ответ клиента»`
- Под полем ввода: подпись `«Скопируй сообщение клиента из ВК / Inst / TG и запиши в историю»` (font-size 10px, color muted)

---

## 4. Table View — Minor Improvements

### Last Activity Preview

В строке таблицы после статус-бейджа добавить `last-msg` — последнее сообщение лида, обрезанное до 60 символов, цвет `var(--muted)`, font-size 11px. Показывать только если `messages.length > 0`.

Реализация: вычислять при `renderTable()` → `lead.messages?.at(-1)?.text?.slice(0,60)`.

### Stale Highlight

Строки просроченных лидов (2+ дня без ответа) — левая граница `2px solid rgba(246,189,58,.5)` вместо отдельного цвета фона, чтобы не нарушать читаемость таблицы.

---

## 5. Search Debounce

Текущий `oninput="renderTable()"` заменить на `oninput="debouncedSearch()"` с задержкой **200ms**.

`debouncedSearch` уже объявлена в коде (`CLAUDE.md`, пункт 8 плана) — убедиться, что она используется в HTML-атрибуте `oninput` инпута поиска.

---

## Out of Scope

Следующие пункты из 15-пунктного плана **не входят** в этот спек:
- AI (Gemini API) — пункт 3
- Напоминания-дашборд — пункт 4
- Статистика по сегментам — пункт 9
- Мини-график — пункт 10

---

## Implementation Notes

- Файл: `c:\work\lidgen\Adervis LidGen.html` — single-file app
- Нет билд-шага, нет npm — vanilla JS + CSS
- CSS: добавить новые классы `.chat-col-left`, `.chat-col-right`, `.chat-two-col` не ломая существующие `.chat-body`, `.suggestion-panel`
- JS: `renderSuggestionPanel()` → `renderScriptPanel()` (rename + new layout), `renderChatView()` обновить grid
- Все изменения должны сохранять обратную совместимость данных в localStorage (`adervis_cold_db_v3`)
