# Human Takeover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Менеджер нажимает «✋ Подключиться» в chat header → бот замолкает, клиент получает авто-ответ от ADERVIS, на карточке лида в сайдбаре появляется бейдж 👤.

**Architecture:** Инфраструктура уже готова: `switchTgMode()` переключает `tg_state.mode`, tg-webhook уже молчит при `mode='human'`. Нужно добавить только (1) fire-and-forget вызов `tg-send` при активации и (2) badge в `renderTgLeadItem`. Никаких миграций БД, никаких новых Edge Functions.

**Tech Stack:** Vanilla JS single-file HTML, Supabase JS SDK, Supabase Edge Function `tg-send` (уже деплоен).

---

## File Map

| Файл | Изменение |
|------|-----------|
| `index.html` | `switchTgMode` (~строка 4795): +fetch после успешного update |
| `index.html` | `renderTgLeadItem` (~строка 2568): +human-mode badge в metaRight |

---

## Task 1: Авто-ответ клиенту при активации human mode

**Files:**
- Modify: `index.html` (функция `switchTgMode`, ~строка 4806)

- [ ] **Step 1: Найти точку вставки**

Найти в `index.html` строку:
```js
            if (error) { showToast('Ошибка: ' + error.message, 4000); return; }
            lead.tgState = newState;
            showToast(isHuman ? '🤖 AI подключён' : '✋ AI отключён — вы ведёте диалог');
```
Это находится внутри `async function switchTgMode(leadId)`.

- [ ] **Step 2: Заменить блок с добавлением fire-and-forget fetch**

Заменить:
```js
            if (error) { showToast('Ошибка: ' + error.message, 4000); return; }
            lead.tgState = newState;
            showToast(isHuman ? '🤖 AI подключён' : '✋ AI отключён — вы ведёте диалог');
```

На:
```js
            if (error) { showToast('Ошибка: ' + error.message, 4000); return; }
            lead.tgState = newState;
            if (!isHuman) {
                _sb.auth.getSession().then(function(res) {
                    var session = res.data && res.data.session;
                    if (!session) return;
                    fetch(SUPABASE_URL + '/functions/v1/tg-send', {
                        method: 'POST',
                        headers: { 'Authorization': 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            lead_id:      String(leadId),
                            message:      '🙏 Спасибо за обращение в ADERVIS!\n\n🎬 Менеджер уже видит ваш запрос и свяжется с вами в ближайшее время ✨',
                            workspace_id: workspaceId
                        })
                    }).catch(function() {});
                }).catch(function() {});
            }
            showToast(isHuman ? '🤖 AI подключён' : '✋ AI отключён — вы ведёте диалог');
```

- [ ] **Step 3: Проверить вручную**

1. Открыть OTR в браузере → найти TG-лида
2. Открыть чат → нажать «✋ Подключиться»
3. В Telegram (у клиента) должно появиться:
   ```
   🙏 Спасибо за обращение в ADERVIS!

   🎬 Менеджер уже видит ваш запрос и свяжется с вами в ближайшее время ✨
   ```
4. Toast в OTR: «✋ AI отключён — вы ведёте диалог»
5. Кнопка в header должна стать «🤖 AI вкл» (btn-primary, фиолетовая)

- [ ] **Step 4: Проверить обратный тоггл**

1. Нажать «🤖 AI вкл» → кнопка возвращается в «✋ Подключиться»
2. Клиент пишет сообщение → бот должен ответить (AI mode восстановлен)
3. Никакого авто-ответа «Спасибо» при деактивации — это корректное поведение

- [ ] **Step 5: Проверить ошибочный случай**

Если у лида нет `tg_chat_id` — кнопка не должна рендериться вообще. Проверить: найти лид без TG → в chat header нет кнопки «✋». ✓ Уже защищено в коде: `(lead.tgChatId ? ... : '')`.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat(tg): send ADERVIS auto-reply when manager takes over chat"
```

---

## Task 2: Бейдж 👤 в TG-сайдбаре

**Files:**
- Modify: `index.html` (функция `renderTgLeadItem`, ~строка 2568)

- [ ] **Step 1: Найти блок metaRight**

Найти в `renderTgLeadItem`:
```js
            let metaRight = '';
            if (isStale) {
                metaRight = '<span class="li-badge li-badge-hot">просрочен</span>';
            } else if (sectionCtx === 'urgent') {
                metaRight = '<span class="li-badge li-badge-warn">напомн.</span>';
            } else if (hasClientReply) {
                metaRight = '<span class="li-unread">!</span>';
            } else if (!lastMsg) {
                metaRight = '<span class="li-badge li-badge-new">новый</span>';
            }
```

- [ ] **Step 2: Добавить human-mode badge с наивысшим приоритетом**

Заменить весь блок на:
```js
            let metaRight = '';
            if (lead.tgState && lead.tgState.mode === 'human') {
                metaRight = '<span class="li-badge" style="background:rgba(200,144,42,.18);color:#c8902a;" aria-label="Менеджер ведёт диалог" title="Менеджер ведёт диалог"><span aria-hidden="true">👤</span></span>';
            } else if (isStale) {
                metaRight = '<span class="li-badge li-badge-hot">просрочен</span>';
            } else if (sectionCtx === 'urgent') {
                metaRight = '<span class="li-badge li-badge-warn">напомн.</span>';
            } else if (hasClientReply) {
                metaRight = '<span class="li-unread">!</span>';
            } else if (!lastMsg) {
                metaRight = '<span class="li-badge li-badge-new">новый</span>';
            }
```

Бейдж human-mode имеет приоритет над всеми остальными — менеджер должен видеть что он в диалоге даже если есть непрочитанные.

- [ ] **Step 3: A11y review**

Делегировать accessibility-agents:accessibility-lead для проверки новых UI-элементов:
- badge span: имеет `aria-label` на outer span + `aria-hidden="true"` на emoji
- title атрибут дублирует aria-label для tooltip в браузерах без поддержки aria

- [ ] **Step 4: Проверить вручную**

1. Активировать human mode на каком-либо TG-лиде (нажать «✋ Подключиться»)
2. В TG-сайдбаре на карточке этого лида должен появиться amber-badge 👤
3. Переключиться на другой лид и вернуться — badge должен сохраняться
4. Нажать «🤖 AI вкл» → badge должен исчезнуть с карточки

- [ ] **Step 5: Проверить real-time update**

Если режим меняется через Supabase real-time (другой менеджер или другая вкладка):
1. Открыть OTR в двух вкладках
2. В вкладке 1 → «✋ Подключиться» на TG-лиде
3. Вкладка 2 → badge 👤 должен появиться без перезагрузки

Это уже работает: real-time subscription обновляет `lead.tgState` через `rowToLead()` → `renderTgSidebar()` вызывается → `renderTgLeadItem` читает новый tgState.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat(tg-sidebar): human-mode badge on lead card when manager takes over"
```

---

## Task 3: Smoke test + push

- [ ] **Step 1: Полный e2e тест**

Сценарий:
1. Клиент пишет в TG-бот любое сообщение
2. OTR → TG-сайдбар → выбрать лида → «✋ Подключиться»
3. Клиент получает: `🙏 Спасибо за обращение в ADERVIS! ...`
4. Бейдж 👤 на карточке в сайдбаре
5. Клиент пишет ещё одно сообщение → приходит push-уведомление менеджеру, бот НЕ отвечает
6. Менеджер отвечает из OTR → клиент получает ответ
7. «🤖 AI вкл» → бот снова активен, badge исчез

- [ ] **Step 2: Push**

```bash
git push origin main
```

---

## Self-Review

**Spec coverage:**
- ✅ Авто-ответ при активации human mode → Task 1 Step 2
- ✅ Текст авто-ответа «Спасибо за обращение... ADERVIS» → Task 1 Step 2, message field
- ✅ Push-уведомление при входящем в human mode → уже реализовано в tg-webhook, не меняем
- ✅ Ручной тоггл (только A, без авто-возврата) → switchTgMode уже переключает mode='menu'
- ✅ Бейдж 👤 в сайдбаре → Task 2 Step 2

**Placeholder scan:** Нет TBD/TODO. Все блоки кода полные.

**Type consistency:**
- `lead.tgState` в renderTgLeadItem → соответствует `rowToLead` маппингу `tgState: row.tg_state`
- `workspaceId` в fetch body → глобальная переменная, используется в `sendToTg()` той же функцией
- `SUPABASE_URL` → глобальная константа, уже используется в `sendToTg()`
- `_sb.auth.getSession()` → та же цепочка что в `sendToTg()` (строки 4822-4823)

**Edge cases:**
- `tg-send` падает → `.catch(function() {})` игнорирует, тоггл уже завершён
- `workspaceId` null → `tg-send` вернёт 400, `.catch` игнорирует
- Лид без `tgChatId` → кнопка не рендерится, `switchTgMode` возвращается на строке 2
