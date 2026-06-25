# VK UX Integration Design — ADERVIS OTR

**Дата:** 2026-06-22  
**Статус:** Approved  
**Scope:** 4 UX-улучшения VK-интеграции (end-to-end)

---

## Контекст

VK Callback webhook подтверждён (`724729db`). Edge Functions `vk-webhook` и `vk-send` задеплоены и работают. Входящие VK-сообщения уже попадают в Supabase. Проблема — UX в браузере не отражает это: кнопка скрыта, нет уведомлений, нет визуальных индикаторов.

---

## 1. Авто-определение VK Peer ID из URL

**Функция:** `extractVkPeerId(url): number | null`

Правила парсинга:
- `vk.com/id123456` → `123456`
- `vk.com/club123456` → `-123456` (группы — отрицательный peer_id)
- `m.vk.com/id123456` → `123456`
- `vk.com/username` → `null` (не числовой slug — нельзя определить)

**Точки применения:**
1. `submitQuickAdd()` — после сохранения лида, если URL содержит VK → автоматически устанавливает `vkPeerId`
2. `parseBulkLines()` (bulk import) — для каждой VK-ссылки
3. `saveVkPeerId()` — при ручном редактировании поля «Ссылка» в drawer, если `vkPeerId` ещё не задан

---

## 2. Умная кнопка отправки

**Логика рендера кнопок в зоне ввода чата:**

```
if (lead.vkPeerId && tab === 'manager'):
    Primary:   [📤 Отправить в VK]  → sendToVk(leadId)
    Secondary: [только в историю]   → submitChatInput(leadId)
else:
    Primary:   [Отправить]          → submitChatInput(leadId)
```

**Ctrl+Enter** — вызывает primary action (если vkPeerId → sendToVk, иначе submitChatInput).

**Поведение `sendToVk()`:**
- Отправляет текст в VK через `vk-send` Edge Function
- Edge Function сохраняет сообщение в БД с флагом `vk_sent: true`
- Realtime обновляет UI
- Textarea очищается, toast «Отправлено в VK ✓»

---

## 3. Входящее VK-уведомление

**В `subscribeToLeads()` — обработчик UPDATE события:**

При получении realtime-обновления лида проверить:
1. Новый массив `messages` длиннее старого
2. Последнее новое сообщение имеет `fromClient: true`
3. Лид имеет `vkPeerId` (значит сообщение пришло из ВК)
4. Этот лид не является текущим открытым (`currentChatLeadId`)

Если все условия выполнены:
- Toast: `📨 Новое от VK: [lead.name]` (длительность 6000ms)
- Лид в сайдбаре получает класс `.li-vk-incoming` — синяя пульсирующая обводка 2 секунды
- Если лид не в видимой секции сайдбара — прокрутить к нему

---

## 4. VK-статусные бейджи

### 4a. Шапка чата
В `renderChatHeader()`: если `lead.vkPeerId` → показывать пилюлю:
```html
<span class="vk-badge">VK ✓</span>
```
Цвет: синий (`#1da1f2` border + background rgba).

### 4b. Карточка в сайдбаре
В `renderTgLeadItem()`: если `lead.vkPeerId` → добавить маленький значок VK рядом с бейджем платформы.

### 4c. Исходящее VK-сообщение в фиде
`vk-send` Edge Function: добавить `vk_sent: true` в объект сохраняемого сообщения.

В `renderSingleMessage()`: если `msg.vk_sent` → показывать `<span class="msg-vk-tick">→ VK</span>` после текста сообщения.

---

## Затронутые файлы

| Файл | Изменения |
|------|-----------|
| `index.html` | extractVkPeerId(), renderChatHeader(), renderTgLeadItem(), submitChatInput(), subscribeToLeads(), renderSingleMessage(), CSS |
| `supabase/functions/vk-send/index.ts` | добавить `vk_sent: true` в объект сообщения |

---

## Не входит в scope

- Холодный аутрич через ВК-сообщество (технически невозможно, только личный аккаунт)
- TG-уведомления менеджеру
- Изменения vk-webhook Edge Function
