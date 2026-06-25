# Design Spec: Напоминания + Мессенджер-чат

**Date:** 2026-06-10  
**Plan item:** #4 (Напоминания) + улучшение чата (запрос пользователя)  
**File:** `Adervis LidGen.html` (single-file app)

---

## 1. Данные

### Новое поле лида
```js
remindAt: null | "YYYY-MM-DD"   // ISO date string или null
```

### Миграция (при загрузке из localStorage)
```js
leads.forEach(l => {
  if (!('remindAt' in l)) l.remindAt = null;
});
```

Хранится в том же ключе `adervis_cold_db_v3`.

---

## 2. Установка даты напоминания — модалка «Диалог»

Позиция: сразу под `<textarea class="notes-area">`, до кнопки «Откатить на этап назад».

```html
<div class="remind-row">
  <label for="remindInput">📅 Перезвонить:</label>
  <input type="date" id="remindInput" value="{lead.remindAt||''}"
         onchange="saveReminder('{lead.id}', this.value)">
  <button class="btn btn-outline" onclick="saveReminder('{lead.id}', '')">Убрать</button>
</div>
```

### `saveReminder(leadId, dateStr)`
- Находит лид, устанавливает `remindAt = dateStr || null`
- Вызывает `localStorage.setItem`, `updateDashboard()`, и `renderTable()` — нужно обновить индикатор в таблице и счётчик дашборда

---

## 3. Дашборд — карточка «Сегодня»

Шестая карточка, добавляется после «Просрочено (2+ дня)».

```html
<div class="stat-card" onclick="setTodayFilter()" style="cursor:pointer;">
  <div class="value" id="stat-today" style="color: var(--blue);">0</div>
  <div class="label">Перезвонить сегодня</div>
</div>
```

### `updateDashboard()` — добавить:
```js
const todayStr = new Date().toISOString().slice(0, 10);
const todayCount = leads.filter(l => l.remindAt === todayStr).length;
document.getElementById('stat-today').innerText = todayCount;
```

### `setTodayFilter()`
```js
function setTodayFilter() {
  document.getElementById('statusFilter').value = 'today';
  renderTable();
  document.querySelector('.table-container').scrollIntoView({ behavior: 'smooth' });
}
```

---

## 4. Фильтр «Сегодня»

В `<select id="statusFilter">` добавить после `⏳ Просроченные`:
```html
<option value="today">📅 Перезвонить сегодня</option>
```

### `renderTable()` — расширить логику `matchStatus`:
```js
const todayStr = new Date().toISOString().slice(0, 10);
// ...
const matchStatus =
  statusFilter === 'all' ||
  (statusFilter === 'stale' && isStale) ||
  (statusFilter === 'today' && l.remindAt === todayStr) ||
  (statusFilter !== 'stale' && statusFilter !== 'today' && l.status.toString() === statusFilter);
```

---

## 5. Индикатор в таблице

В `renderTable()`, в ячейке статуса, после `staleHtml`:

```js
const todayStr = new Date().toISOString().slice(0, 10);
let remindHtml = '';
if (lead.remindAt === todayStr) {
  remindHtml = `<span class="remind-today">📅 сегодня</span>`;
}
```

### CSS:
```css
.remind-today {
  font-size: 11px;
  color: var(--blue);
  font-weight: 700;
  margin-left: 6px;
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
```

---

## 6. Мессенджер-чат

### 6a. Compose-панель (замена текущей)

Убрать:
```html
<!-- текущее: два отдельных блока для ввода и AI -->
```

Заменить на единый блок:
```html
<div class="compose-bar">
  <input type="text" id="chatInput" class="compose-input"
         placeholder="Ответ клиента..."
         onkeydown="if(event.key==='Enter'&&!event.shiftKey){submitClientMessage('{id}');event.preventDefault();}">
  <button class="compose-send" onclick="submitClientMessage('{id}')" aria-label="Добавить сообщение клиента">
    ➤
  </button>
</div>
<div class="compose-actions">
  <button class="btn btn-outline compose-manager-btn"
          onclick="submitManagerMessage('{id}')"
          title="Записать исходящее сообщение (то что вы написали клиенту)">
    ✉️ Я написал
  </button>
  <button class="btn btn-outline" id="aiReplyBtn" onclick="generateAiReply('{id}')">
    ✨ AI-ответ
  </button>
</div>
```

### `submitManagerMessage(leadId)` — новая функция:
```js
function submitManagerMessage(leadId) {
  const input = document.getElementById('chatInput');
  if (!input || !input.value.trim()) return;
  addMessageToLead(leadId, input.value, false);  // fromClient=false
  input.value = '';
}
```

### 6b. Автолог при смене статуса

В `setStatus()` ПОСЛЕ нахождения лида и ДО `saveDB()`:
```js
// Если в модалке был выбран скрипт — логируем его как исходящее
if (currentLeadId === String(id)) {
  const sel = document.getElementById('scriptSelect');
  const previewText = document.getElementById('previewBoxText');
  if (sel && previewText && previewText.innerText.trim()) {
    const _mid = uid();
    if (!Array.isArray(lead.messages)) lead.messages = [];
    lead.messages.push({ id: _mid, text: previewText.innerText.trim(), date: Date.now(), fromClient: false });
  }
}
```

### 6c. Разделители по дате в чат-фиде

В `renderMessagesFeed()` — группировать по дням и вставлять заголовок:
```js
function formatDateSep(ts) {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Сегодня';
  if (d.toDateString() === yesterday.toDateString()) return 'Вчера';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}
```

Вставлять `<div class="date-sep">...</div>` между группами сообщений с разными датами.

### 6d. CSS изменения

```css
/* Увеличиваем высоту чата */
.chat-feed { max-height: 300px; }

/* Compose bar */
.compose-bar { display: flex; gap: 8px; margin-top: 8px; align-items: center; }
.compose-input { flex: 1; }
.compose-send { padding: 8px 14px; border-radius: 8px; background: var(--primary); color: #fff; border: none; cursor: pointer; font-size: 16px; transition: background .15s; }
.compose-send:hover { background: var(--primary2); }
.compose-actions { display: flex; gap: 8px; margin-top: 6px; }
.compose-manager-btn { font-size: 12px; }

/* Разделители дат */
.date-sep { text-align: center; font-size: 11px; color: var(--muted); margin: 8px 0; position: relative; }
.date-sep::before, .date-sep::after { content: ''; display: inline-block; width: 30%; height: 1px; background: var(--line); vertical-align: middle; margin: 0 8px; }
```

---

## 7. AI-ответ — инвариант (не менять)

`generateAiReply()` строит prompt из:
```js
const clientMsgs = (lead.messages || []).filter(m => m.fromClient);
const lastMsg = clientMsgs[clientMsgs.length - 1];
```
Этот принцип сохраняется при любых изменениях.

---

## Не входит в скоуп

- Редактирование/удаление отдельных сообщений
- Push-уведомления о напоминаниях
- Экспорт истории диалога
