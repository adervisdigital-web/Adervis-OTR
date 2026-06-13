# ADERVIS OTR — SaaS Evolution Design

**Дата:** 2026-06-13  
**Статус:** Approved  
**Подход:** Двухэтапный — сначала для внутреннего использования, затем коммерческий продукт

---

## Контекст

ADERVIS OTR — single-file HTML CRM для холодных продаж (VK/Inst/TG). Все 15 пунктов оригинального плана выполнены. Текущие ограничения:

- Данные в `localStorage` — нет синхронизации между устройствами и пользователями
- Нет авторизации — нельзя разграничить доступ
- Не продаваем как продукт — нет URL, нет регистрации, нет оплаты

**Цель:** Превратить в облачный SaaS с возможностью продажи другим агентствам и продажным командам.

---

## Этап 1: Облачная база для команды (~3–5 дней)

### Цель
Два пользователя (владелец + сотрудник) работают с общей базой лидов через браузер, видят изменения друг друга в реальном времени.

### Выбранный стек
- **Supabase** — auth (email+password) + PostgreSQL + real-time subscriptions
- **Netlify** — бесплатный хостинг HTML-файла (drag & drop)
- Фронтенд остаётся single-file HTML, добавляется Supabase JS SDK через CDN

### Авторизация

Экран входа появляется поверх приложения до инициализации данных:

```
┌─────────────────────────────────┐
│         ADERVIS | OTR           │
│                                 │
│  Email: [_____________________] │
│  Пароль:[_____________________] │
│                                 │
│  [        Войти        ]        │
└─────────────────────────────────┘
```

- `supabase.auth.signInWithPassword({ email, password })`
- Сессия сохраняется в localStorage автоматически Supabase SDK
- `supabase.auth.onAuthStateChange` — при потере сессии показываем экран входа
- Регистрация новых пользователей — только через Supabase Dashboard (не публичная)

### Схема базы данных

```sql
-- Workspace (команда / воронка)
CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Привязка пользователей к workspace
CREATE TABLE workspace_members (
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  role TEXT DEFAULT 'manager', -- 'owner' | 'manager'
  PRIMARY KEY (workspace_id, user_id)
);

-- Лиды
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  link TEXT,
  contact TEXT,
  biz_type TEXT,
  status INTEGER DEFAULT 0,       -- 0=новый, 1=ледокол, 2=диалог, 3=успех, 4=отказ
  updated_at TIMESTAMPTZ DEFAULT now(),
  notes TEXT,
  messages JSONB DEFAULT '[]',
  remind_at DATE,
  attempt_count INTEGER DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  assigned_to UUID REFERENCES auth.users(id)  -- НОВОЕ: назначенный менеджер
);

-- Скрипты (per-workspace)
CREATE TABLE scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  stage INTEGER NOT NULL,         -- 0, 1, 2
  templates JSONB NOT NULL DEFAULT '[]'
);

-- CTA ссылки (per-workspace)
CREATE TABLE cta_config (
  workspace_id UUID REFERENCES workspaces(id) PRIMARY KEY,
  call_link TEXT,
  brief_link TEXT,
  meeting_link TEXT
);
```

### Row Level Security (RLS)

```sql
-- Лиды видят только члены того же workspace
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leads_workspace" ON leads
  FOR ALL USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );
-- Аналогично для scripts, cta_config
```

### Real-time синхронизация

```js
// Подписка на изменения лидов в workspace
supabase
  .channel('leads')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'leads',
    filter: `workspace_id=eq.${currentWorkspaceId}`
  }, payload => {
    handleLeadChange(payload); // обновляет локальный массив + renderTable()
  })
  .subscribe();
```

Без перезагрузки страницы — как в Telegram.

### Миграция данных

При первом входе, если в localStorage есть `adervis_cold_db_v3`:
1. Показать диалог «Найдены локальные данные. Импортировать в облако?»
2. При согласии — batch insert в Supabase
3. Очистить localStorage после успешного импорта

### Новый UI: Назначение менеджера

- Колонка «Менеджер» в таблице — аватарка/инициалы
- Фильтр «Мои лиды / Все лиды» — переключатель в шапке контролов
- При создании лида — `assigned_to = auth.uid()` (создатель)
- Возможность переназначить из drawer лида

### PWA (единственный TODO из оригинального плана)

```json
// manifest.json
{
  "name": "ADERVIS OTR",
  "short_name": "OTR",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#010102",
  "theme_color": "#7c3aed",
  "icons": [{ "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" }]
}
```

Service worker: кеширует HTML+JS, показывает заглушку при офлайн.

---

## Этап 2: SaaS-продукт (~+1–2 недели после Этапа 1)

### Модель монетизации

| Тариф | Цена | Включено |
|-------|------|----------|
| Старт | 990 руб/мес | 1 workspace, до 3 пользователей, 500 лидов |
| Про | 1 990 руб/мес | 1 workspace, до 10 пользователей, безлимит лидов |
| Агентство | 4 990 руб/мес | 5 workspaces, безлимит, API доступ |

14 дней бесплатного триала без карты.

**Целевая аудитория:** видеостудии, SMM-агентства, аутрич-фрилансеры — все кто делает холодные продажи через VK/TG/IG.

### Архитектура SaaS

```
Лендинг (Netlify)
   ↓
Регистрация → создаёт workspace в Supabase
   ↓
Supabase Auth + workspace_members
   ↓
OTR App (тот же HTML, но с публичным URL)
   ↓
Stripe/ЮKassa → Supabase Edge Function webhook
   ↓
workspace.plan обновляется, фича-гейты применяются
```

### Лендинг

Отдельная страница (landing.html или отдельный домен):

- Hero: «CRM для холодных продаж в ВКонтакте, Instagram, Telegram»
- Скриншот интерфейса (TG-layout)
- 3 ключевых преимущества: готовые скрипты / AI-ответы / общая база команды
- Тарифы
- Кнопка «Попробовать 14 дней бесплатно» → форма регистрации

### Приглашение сотрудников

Владелец workspace → «Пригласить» → вводит email → Supabase отправляет Magic Link → сотрудник кликает → автоматически добавляется в workspace.

### Фича-гейты

```js
// В коде приложения
function canAddLead() {
  if (workspace.plan === 'free' && leads.length >= 50) {
    showUpgradeModal('Достигнут лимит 50 лидов. Перейдите на тариф Старт.');
    return false;
  }
  return true;
}
```

---

## Улучшения логики (параллельно с Этапом 1)

| Улучшение | Описание | Приоритет |
|-----------|----------|-----------|
| Activity feed | Лента событий: «Иван добавил Кафе Пуговица», «Мария перевела в Успех» | ВЫСОКИЙ |
| Назначение менеджера | `assigned_to` поле, фильтр «Мои лиды» | ВЫСОКИЙ |
| Email-дайджест | Supabase Edge Function: ежедневная сводка (отправлено/ответили/успехи) | СРЕДНИЙ |
| Экспорт Google Sheets | Через Sheets API или CSV с разделителем запятой (правильный RFC4180) | СРЕДНИЙ |
| Оптимистичные обновления | При изменении статуса — UI обновляется сразу, затем sync с Supabase | СРЕДНИЙ |

---

## Улучшения дизайна (параллельно с Этапом 1)

| Улучшение | Описание |
|-----------|----------|
| Аватарки менеджеров | Инициалы в цветном круге в таблице и в сообщениях чата |
| Skeleton loading | Вместо пустой таблицы при загрузке — серые placeholders |
| Empty states | Иллюстрация + CTA когда нет лидов / нет результатов поиска |
| Онбординг-тур | 4-шаговый тур при первом входе: добавь лид → выбери скрипт → скопируй → отметь статус |
| Мобильный sidebar | На узких экранах sidebar скрывается, кнопка ≡ открывает его как overlay |

---

## Оптимизация

| Оптимизация | Когда | Описание |
|-------------|-------|----------|
| Пагинация / infinite scroll | Этап 1 | Загружать 50 лидов, подгружать при скролле |
| Индексы в БД | Этап 1 | `CREATE INDEX ON leads(workspace_id, status)` и т.д. |
| Supabase RLS вместо JS-фильтров | Этап 1 | Фильтрация на уровне БД, не в браузере |
| Виртуальный скролл | Этап 2 | При 500+ лидов рендерить только видимые строки |
| Lazy load скриптов | Этап 2 | Не грузить все шаблоны при старте — только активный этап |

---

## Технические решения

### Supabase SDK — подключение

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
<script>
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
</script>
```

`SUPABASE_URL` и `SUPABASE_ANON_KEY` — публичные ключи, безопасны на фронте при наличии RLS.
- **Этап 1:** хардкодим константами прямо в HTML-файле.
- **Этап 2:** переносим в Netlify Environment Variables, вставляются в HTML при сборке.

### Совместимость с существующим кодом

- `leads` массив остаётся в памяти для UI
- `saveLead(lead)` → `supabase.from('leads').upsert(lead)` вместо `localStorage.setItem`
- `loadLeads()` → `supabase.from('leads').select('*')` вместо `localStorage.getItem`
- Существующие функции `renderTable()`, `updateDashboard()` и т.д. — не меняются

### Обработка офлайн

При потере соединения:
- Toast: «Нет соединения. Изменения сохранятся при восстановлении.»
- Запись изменений во временный буфер (IndexedDB или in-memory queue)
- При восстановлении — flush буфера в Supabase

---

## Риски и ограничения

| Риск | Митигация |
|------|-----------|
| Supabase free tier лимиты (500MB, 2GB bandwidth) | Мониторинг в Dashboard; апгрейд при необходимости (~$25/мес) |
| Конфликты при одновременном редактировании | Real-time обновления перезаписывают локальные данные; показывать toast «Данные обновлены другим пользователем» |
| Miграция данных клиентов при смене схемы | Supabase migrations через CLI; нумерация версий схемы |
| Single-file HTML растёт | Разбить на несколько файлов при переходе к Этапу 2; пока терпимо |

---

## Следующий шаг

Создать план реализации Этапа 1: подключение Supabase auth + миграция данных + real-time sync.
