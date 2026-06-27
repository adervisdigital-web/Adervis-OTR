# Human Takeover — Дизайн-документ

**Дата:** 2026-06-27  
**Фича:** Перехват диалога менеджером (п.7 Roadmap v3)  
**Статус:** Approved

---

## Проблема

TG-бот отвечает на все сообщения клиентов через AI. Менеджер не может «подключиться» — взять диалог вручную и отключить автоответы — не перезаписав tg_state вручную в БД.

---

## Что уже реализовано

Код уже содержит большую часть инфраструктуры:

| Компонент | Статус |
|-----------|--------|
| `TgState.mode = 'human'` тип | ✅ есть в tg-webhook |
| `if (state.mode === 'human') { pushNotify... return }` | ✅ бот молчит, пуш идёт |
| `switchTgMode(leadId)` JS функция | ✅ есть, переключает tg_state в Supabase |
| Кнопка «✋ Подключиться / 🤖 AI вкл» в chat header | ✅ рендерится |
| `tg-send` Edge Function | ✅ есть, отправляет текст клиенту |

**Не реализовано:**
1. Авто-ответ клиенту при активации human mode
2. Индикатор «👤 Менеджер» в TG-сайдбаре на карточке лида

---

## Дизайн

### Изменение 1 — авто-ответ при переключении в human mode

**Файл:** `index.html`, функция `switchTgMode` (~строка 4795)

Текущий код после `_sb.from('leads').update(...)` показывает только toast. Нужно добавить:
если `!isHuman` (т.е. только что **активировали** human mode) → вызвать `tg-send` с текстом:

```
🙏 Спасибо за обращение в ADERVIS!

🎬 Менеджер уже видит ваш запрос и свяжется с вами в ближайшее время ✨
```

Вызов идёт через существующий `fetch(SUPABASE_URL + '/functions/v1/tg-send', ...)` — ту же инфраструктуру что использует `sendToTg()`. Fire-and-forget (`.catch(() => {})`), не блокирует UI.

Если `tg-send` вернул ошибку — молча игнорируем (менеджер всё равно подключён, авто-ответ опциональный).

### Изменение 2 — бейдж в TG-сайдбаре

**Файл:** `index.html`, функция `renderTgLeadItem` (~строка 2568), блок `metaRight`

Добавить приоритет перед остальными бейджами:

```js
if (lead.tgState && lead.tgState.mode === 'human') {
    metaRight = '<span class="li-badge" style="background:rgba(200,144,42,.18);color:var(--gold);" aria-label="Менеджер ведёт диалог">👤</span>';
}
```

Бейдж отображается даже если `hasClientReply` — человек-оператор важнее индикатора непрочитанного.

---

## Поток данных

```
OTR: switchTgMode(leadId)
  ↓
Supabase UPDATE leads SET tg_state.mode = 'human'  (прямой вызов из браузера)
  ↓ (если !isHuman)
tg-send Edge Function → Telegram Bot API → клиент получает авто-ответ
  ↓
lead.tgState обновляется локально → renderChatHeader(lead) → кнопка меняется на «🤖 AI вкл»
renderTgLeadItem → бейдж 👤 на карточке в сайдбаре

Входящее от клиента при mode='human':
  tg-webhook: addMsg → pushNotify → return (AI молчит)
  OTR: real-time subscription → showToast «Новое в Telegram»
```

---

## Scope (только это, ничего лишнего)

- ✅ Авто-ответ при активации human mode
- ✅ Бейдж 👤 в сайдбаре
- ❌ Автоматический возврат к боту (не нужен — ручной контроль)
- ❌ Новый Edge Function (не нужен — используем tg-send)
- ❌ SQL миграция (не нужна — tg_state.mode уже в JSONB)

---

## A11y notes

- Кнопка в chat header уже имеет `aria-label` и `data-tooltip` с контекстом
- Бейдж в сайдбаре получает `aria-label="Менеджер ведёт диалог"`
- Авто-ответ не влияет на DOM

---

## Файлы затронуты

| Файл | Изменение |
|------|-----------|
| `index.html` | `switchTgMode`: +8 строк для fetch tg-send |
| `index.html` | `renderTgLeadItem` metaRight: +3 строки для бейджа |

Нет изменений в: tg-webhook, tg-send, SQL-миграциях, других Edge Functions.
