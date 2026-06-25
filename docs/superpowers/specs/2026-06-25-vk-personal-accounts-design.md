# VK Personal Accounts — Design Spec

**Date:** 2026-06-25  
**Goal:** Подключить личные страницы ВКонтакте к OTR, чтобы менеджер мог писать лидам первым прямо из приложения.

---

## Проблема

Текущая VK-интеграция работает только на ВХОДЯЩИЕ — лид сам пишет в группу, и OTR получает сообщение. Для холодных продаж нужно писать лидам ПЕРВЫМ, что невозможно через группу по политике VK API.

Личная страница ВКонтакте может отправлять личные сообщения любому пользователю (у кого открыты ЛС).

---

## VK App

- **App ID:** `54652870`  
- **Название:** ADERVIS OTR  
- **Тип:** Standalone (VK ID)  
- **Домен:** otr.adervis.ru  
- **Client Secret:** хранится в Supabase Secrets как `VK_CLIENT_SECRET`

---

## Архитектура

### Новая таблица Supabase: `vk_accounts`

```sql
create table vk_accounts (
  id          uuid primary key default gen_random_uuid(),
  workspace_id text not null,
  account_type text not null check (account_type in ('personal', 'community')),
  vk_id       bigint not null,
  access_token text not null,
  display_name text not null default '',
  photo_url    text not null default '',
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (workspace_id, vk_id)
);

alter table vk_accounts enable row level security;
create policy "workspace members only" on vk_accounts
  using (workspace_id = (select workspace_id from workspace_members where user_id = auth.uid() limit 1));
```

### OAuth flow (старый VK OAuth, scope=messages,offline)

```
1. Кнопка "Войти через ВКонтакте" → открывается popup окно
2. URL: https://oauth.vk.com/authorize
        ?client_id=54652870
        &scope=messages,offline
        &redirect_uri=https://otr.adervis.ru
        &response_type=code
        &display=popup
3. Пользователь разрешает доступ в VK
4. VK редиректит: https://otr.adervis.ru?code=AUTH_CODE
5. OTR перехватывает code из URL при загрузке
6. Вызывает Edge Function vk-oauth с кодом
7. vk-oauth обменивает code → access_token + vk_user_id
8. Запрашивает имя и фото через VK API (users.get)
9. Сохраняет в таблицу vk_accounts
10. Popup закрывается, основное окно обновляет список аккаунтов
```

### Новая Edge Function: `vk-oauth`

**Input (POST JSON):**
```json
{
  "code": "AUTH_CODE_FROM_VK",
  "workspace_id": "uuid"
}
```

**Действия:**
1. POST на `https://oauth.vk.com/access_token` с code + client_id + client_secret + redirect_uri
2. Получает `{ access_token, user_id }`
3. Вызывает `users.get?user_ids=USER_ID&fields=photo_100` с полученным токеном
4. Upsert в `vk_accounts`
5. Возвращает `{ display_name, photo_url, vk_id }`

### Обновление Edge Function: `vk-send`

Добавить параметр `sender_account_id` (UUID из vk_accounts).  
Если передан → взять токен из `vk_accounts` вместо community_token из workspace_settings.

---

## UI изменения

### Settings → VK аккаунты (новая секция)

```
┌─────────────────────────────────────────┐
│ ВКонтакте аккаунты                      │
│─────────────────────────────────────────│
│ 🏢 ADERVIS (группа)          [активна] │
│ 👤 Артём Никитин             [активен] │
│     [Отключить]                         │
│                                         │
│  [🔵 Подключить страницу ВКонтакте]    │
└─────────────────────────────────────────┘
```

- Группа отображается как существующий аккаунт (community)
- Кнопка "Подключить" открывает OAuth popup
- После авторизации страница появляется в списке мгновенно
- Кнопка "Отключить" помечает `is_active = false` и удаляет токен

### Chat → выбор аккаунта отправки

Когда лид имеет vkPeerId, под кнопкой отправки добавляется компактный селектор:

```
Отправить от: [👤 Артём Никитин ▼]
[📤 Отправить в VK]
```

- Список включает только `is_active = true` аккаунты workspace
- Последний выбранный аккаунт запоминается в localStorage
- Community (группа) тоже доступна как отправитель (для ответа на входящие)

---

## Безопасность

- `access_token` хранится в Supabase (RLS защита по workspace_id)
- `VK_CLIENT_SECRET` только в Supabase Secrets, никогда в frontend-коде
- OAuth code обменивается только через Edge Function (server-side)
- Redirect URI захардкожен и в VK App, и в Edge Function

---

## Ограничения VK

- Личная страница может отправлять ~30-50 новых диалогов в день (лимит VK)
- Нельзя писать пользователям с закрытыми ЛС
- VK может заблокировать страницу при подозрении на спам (не автоматизировать массово)
- `offline` scope даёт бессрочный токен — не нужно обновлять

---

## Файлы затронутые

| Файл | Изменение |
|------|-----------|
| `index.html` | +секция VK аккаунты в Settings, +селектор аккаунта в chat, +OAuth обработчик кода при загрузке |
| `supabase/functions/vk-oauth/index.ts` | Новая Edge Function |
| `supabase/functions/vk-send/index.ts` | +параметр sender_account_id |
| Supabase SQL | +таблица vk_accounts с RLS |

---

## Что НЕ входит в эту задачу

- Интеграция Instagram (требует Meta Business верификации)
- Интеграция Telegram (бот не может писать первым)
- Мультиворкспейс (уже есть через Supabase)
- Автоматические рассылки (противоречит политике VK)
