# ADERVIS | OTR — Action Map

Правило: после каждого изменения в Adervis LidGen.html — обновить этот файл.
Статусы: TODO / IN PROGRESS / DONE / CANCELED

---

## Базовая информация

- Файл: Adervis LidGen.html
- Папка: C:\work\lidgen
- localStorage: adervis_cold_db_v3 (лиды), adervis_custom_scripts_v4 (скрипты), adervis_cta_v1 (CTA)

---

## 15-пунктный план разработки

| # | Задача | Приоритет | Статус |
|---|--------|-----------|--------|
| 1 | Исправить баги: XSS в getPlatformBadge, notes в textarea, saveNotes keystroke, статус-4 в фильтре, CSV экранирование | КРИТИЧНО | DONE |
| 2 | История диалога — массив сообщений [{text, date, fromClient}] вместо clientReply | ВЫСОКИЙ | DONE |
| 3 | AI-ответ через Gemini API — реальная генерация по тексту клиента | ВЫСОКИЙ | DONE |
| 4 | Напоминания — поле "перезвонить дата" + карточка "Сегодня" на дашборде | СРЕДНИЙ | DONE |
| 5 | Bulk import: автоопределение платформы по URL, нормализация ссылок | СРЕДНИЙ | DONE |
| 6 | Счётчик попыток — сколько раз писали лиду (в таблице) | СРЕДНИЙ | DONE |
| 7 | Карточка лида — боковой drawer со всей историей и редактированием | СРЕДНИЙ | DONE |
| 8 | Поиск с дебаунсом 200ms (убрать onkeyup без задержки) | НИЗКИЙ | DONE |
| 9 | Статистика по сегментам — конверсия отдельно для каждого типа бизнеса | НИЗКИЙ | DONE |
| 10 | Мини-график активности по дням (последние 14 дней) | НИЗКИЙ | DONE |
| 11 | Горячие клавиши: N (новый лид), S (фокус поиска), D (диалог активной строки) | НИЗКИЙ | DONE |
| 12 | Поиск внутри редактора скриптов | НИЗКИЙ | DONE |
| 13 | PWA — manifest.json + service worker, установка как приложение | БУДУЩЕЕ | DONE |
| 14 | Переключатель тем: Dark OLED / Linear Dark / Light | БУДУЩЕЕ | DONE |
| 15 | Мультиаккаунт — несколько воронок/менеджеров в localStorage | БУДУЩЕЕ | DONE |

---

## Журнал изменений

### 2026-06-09
- DONE: Добавлена кнопка "Инфо" с описанием программы
- DONE: Dark theme (gradients, radius, buttons) под adervis-CRM-PRO
- DONE: Переименование в "ADERVIS | OTR"
- DONE: Окно "Ответ клиента" (сохранение + заглушка AI)
- DONE: Сегментация лидов по бизнес-направлению (поле + фильтр)
- DONE: Чекбоксы строк + массовые действия (выделить все / удалить)
- DONE: XSS-защита — escapeHtml() для name/contact, таблица одной строкой
- DONE: safeParseJSON() + fallback для localStorage
- DONE: Бэкап/импорт JSON (лиды + скрипты + формат с метаданными)
- DONE: Фильтр "Просроченные (2+ дня)" + счётчик на дашборде
- DONE: Поиск расширен на notes, link, bizType
- DONE: Помощник диалога — CTA-плейсхолдеры + редактор
- DONE: Кнопка "Загрузить базу" — функция openBulkModal() исправлена
- DONE: crypto.randomUUID() с fallback

### 2026-06-10
- DONE: Design system обновлён — Linear.app токены (near-black canvas #010102, hairline #23252a, radius 12px)
- DONE: Исправлены все undefined CSS-переменные: --danger, --success, --warning, --purple, --border, --text-muted
- DONE: Platform badges и status badges переведены с белых фонов на dark-compatible
- DONE: script-box и template-editor — убраны белые #f8fafc фоны
- DONE: Добавлен класс .reminder (использовался в JS, но не был в CSS)
- DONE: Установлены глобальные скиллы: superpowers, frontend-design-pro, ux-design, accessibility-agents
- DONE: В .claude/ добавлены: design-references (8 DESIGN.md), skills/ui-refactor, команды fix-*
- DONE: Создан CLAUDE.md (project bible, загружается автоматически)
### 2026-06-11
- DONE: п.4 — Напоминания: поле remindAt, карточка «Перезвонить сегодня» на дашборде, фильтр today, badge в таблице
- DONE: п.4 — Чат: разделители дат в ленте, кнопка «Отправлено» (submitManagerMessage), append-only обновление ленты (S-3)
- DONE: Chat view + онбординг — реализованы полностью (CSS, HTML, JS) — ACTION_MAP обновлён
- DONE: WCAG 2.2 AA: 15+ фиксов: aria-label на delete/checkbox/badge/platformBadge/кнопках, sr-only labels для фильтров, button для кликабельной карточки, announceSubmit live-region, emoji aria-hidden
- DONE: Хук a11y-enforce-edit.sh исправлен (python3→py для Windows)

### 2026-06-11 (вечер)
- DONE: п.5 — Bulk import улучшенный: detectPlatform(vk/inst/tg), normalizeUrl убирает trailing slash, parseBulkLines(), двухфазный UX (Просмотреть → Импортировать), preview со счётчиком дублей

### 2026-06-13
- DONE: Navigation & UX Redesign (7 задач):
  - Хедер: 6 кнопок → dropdown «📁 Данные ▾» + иконки ⚙️ ℹ️ + «+ Загрузить лиды»; Escape закрывает dropdown
  - Script panel: карточки click-to-select (role=button, data-card-idx, highlight), убраны per-card кнопки
  - Stage кнопка: «Новый → Ледокол» / «Ледокол → В диалоге» / «В диалоге → Успех ✅» + ✕ Отказ
  - Chat input: два таба (← Клиент ответил / ✍️ Я написал) + textarea, Ctrl+Enter
  - Таблица: цветной счётчик дней (серый/жёлтый/красный жирный)
  - Таблица: кнопка ✕ быстрого Отказа для лидов status 0–2
  - stageNames вынесен в module scope

### 2026-06-13
- DONE: UX Improvements v2 (8 задач):
  - CSS: компонент `[data-tooltip]`, toast, стили copy-иконки, stage chips, status dropdown, AI card
  - showToast() + copyAndRecord() JS функции
  - Script panel рефакторинг: SVG copy icon на каждой карточке, chips по этапам (Новый/Ледокол/В диалоге), AI карточки
  - Удалён draft textarea, chat-send-bar, stage-nav-strip из HTML
  - Удалены мёртвые JS функции: renderStageNav, selectScriptCard, copyReply, submitManagerMsg, toggleAiVariants, selectAiVariant
  - Status dropdown в шапке чата: заменяет статичный badge, все 5 статусов в любом направлении
  - data-tooltip на: ⚙️ ℹ️ 📁 Данные, ✕ Отказ, × Удалить, attempt-badge, platform badges
  - Сегмент бизнеса в bulk import: select перед textarea, применяется к каждому лиду при импорте

### 2026-06-12
- DONE: п.6 — Счётчик попыток: badge 📤 N в Actions-колонке таблицы (фиолетовый если > 0)
- DONE: п.7 — Карточка лида: боковой drawer (400px), клик по имени → открытие, редактирование всех полей (name/link/contact/bizType/status/remindAt/notes), история последних 5 сообщений, кнопка "Открыть полный диалог", кнопка Сохранить с подтверждением, Escape/overlay для закрытия
- DONE: п.8 — Поиск с дебаунсом 200ms: debounce() helper, oninput вместо onkeyup
- DONE: Chat interface redesign — linear 3-step flow («Клиент написал» → «Твой ответ» → «Отправил»), script chips + ✨ AI-вариант с 3 тонами (МЯГКИЙ/ДЕЛОВОЙ/ВОПРОСОМ), копирование в буфер, отправка в историю, stage nav-bar с кнопками переходов

### 2026-06-10 (вечер)
- DONE: п.2 — История диалога: clientReply заменён на lead.messages[]; чат-фид с пузырьками (серые/фиолетовые) в scriptModal
- DONE: п.2 — Миграция данных: старый clientReply конвертируется при загрузке и импорте
- DONE: п.3 — Gemini AI: кнопка ✨ AI-ответ в scriptModal, generateAiReply() → gemini-1.5-flash API
- DONE: п.3 — Ключ Gemini API хранится в localStorage adervis_gemini_key_v1, вводится в настройках
- DONE: WCAG 2.2 AA: role=dialog/aria-modal/aria-labelledby, focus management, sr-only, aria-live, aria-atomic

### 2026-06-13 (п.12 Поиск в редакторе скриптов)
- DONE: HTML: поле #scriptSearchInput + кнопка × (#scriptSearchClear) над stage-select в settingsModal
- DONE: searchScripts(query): ищет по opt.text + opt.content во всех 3 этапах, скрывает stage-select в режиме поиска, показывает stage-label для каждого результата
- DONE: highlightQuery(): оборачивает совпадения в <mark> с rgba(124,58,237,.28)
- DONE: clearScriptSearch(): сбрасывает запрос + фокус
- DONE: openSettingsModal(): сброс поиска при открытии + автофокус на поле поиска
- DONE: Удаление шаблона из результатов поиска — обновляет поисковую выдачу (не renderSettingsEditor)

### 2026-06-13 (п.10 График активности)
- DONE: CSS: .analytics-section, .activity-chart, .act-bar-col, .act-bar (.active/.today), .act-bar-label (.today-lbl), .analytics-section-sub
- DONE: renderSegmentStats() расширен: вверху CSS-бар-чарт исходящих сообщений за 14 дней (считает msg.fromClient===false), ниже — таблица сегментов
- DONE: Кнопка «По сегментам» → «Аналитика»; hint в тоггле показывает итоговое кол-во сообщений

### 2026-06-13 (п.9 Статистика по сегментам)
- DONE: renderSegmentStats() — группировка по bizType, таблица: Всего/Ледокол/Диалог/Успех/Конверсия
- DONE: filterBySeg() — клик «показать →» фильтрует таблицу лидов по сегменту
- DONE: openSegmentStats() + toggleSegmentStats() — toggle-панель под дашбордом
- DONE: updateDashboard() обновляет статистику сегментов когда панель открыта
- DONE: CSS: .seg-stats-panel, .seg-table, .seg-conv-bar, .seg-filter-btn

### 2026-06-13 (Design System v2 + Quick wins)
- DONE: Design tokens v2 — --primary #7c3aed (Violet-600), --line #3a3d44 (WCAG border fix 4.1:1), --primary-subtle/border vars, --shadow-1/2/3/4 шкала, --radius-xs/sm/md/lg/xl/pill шкала, --line-subtle
- DONE: Глобальный :focus-visible (2px var(--primary) outline) — закрывает WCAG 2.4.7 для всех интерактивов
- DONE: body gradient обновлён под новые rgb-значения primary
- DONE: .btn-primary box-shadow обновлён под новые rgb-значения
- DONE: Caption/label 11px → 12px (th, .stat-card .label); letter-spacing нормализован
- DONE: .chip переведён на CSS-переменные (--primary-subtle, --primary-border, --primary2)
- DONE: copyAndRecord — platform hint (IG 24ч / TG инициация)
- DONE: п.11 — Горячие клавиши N/S/D: N (фокус «Название»), S (поиск), D (открыть/закрыть диалог); справка в ℹ️

### 2026-06-13 (П.14 Тема + П.15 Мультиаккаунт + Онбординг + Telegram)
- DONE: П.14 — Светлая тема: :root[data-theme="light"] с полным набором токенов, оверрайды для header/sidebar/bubbles/chat, кнопка 🌙/☀️ в шапке с aria-label, persist в localStorage adervis_theme_v1
- DONE: П.15 — Мультиаккаунт: accounts (adervis_accounts_v1), currentAccountId (adervis_current_account_v1), dbKey()/scriptsKey()/ctaKey() хелперы, модаль управления воронками, switchAccount/createAccount/deleteAccount, badge «🗂 Основная воронка» в шапке
- DONE: Онбординг-подсказка в drawer шаблонов: «Нажми 📋 → скопируется → вставь в VK/TG/IG»
- DONE: «Открыть» кнопка в шапке чата — открывает VK/TG/IG профиль лида в новой вкладке (с иконкой платформы)
- DONE: getPlatformIcon() хелпер

### 2026-06-13 (Chat UX redesign — по отзыву пользователя)
- DONE: Скрипты — карточки теперь показывают и копируют реальный текст сообщения (content), не название
- DONE: Новая функция substituteCta() — подставляет {rest}, {call}, {call_link}, {brief}, {brief_link}, {meeting} при копировании
- DONE: Новая функция formatMsgTime() — красивое время в сообщениях (сегодня: "15:42", вчера: "Вчера 15:42", раньше: "13 июн 15:42")
- DONE: Textarea — убран resize:none, min-height увеличен с 52px до 80px
- DONE: Кнопка «Записать» → «Отправить» (HTML + aria-label + hint)
- DONE: Названия этапов переведены на понятный язык: Новый/Ледокол/В диалоге → Первый контакт/Ответы/Возражения
- DONE: Лимит карточек увеличен с 4 до 8
- DONE: Шаблоны расширены: Шаг 1 — 7 шаблонов (было 4), Шаг 2 — 8 (было 7), Шаг 3 — 8 (было 6)
- DONE: Новые возражения: Нет времени, Уже пробовали, Другой подрядчик
- DONE: CSS .script-card-title для заголовка карточки

### 2026-06-13 (Supabase + облако)
- DONE: Stage 1 полностью реализован — Supabase auth, облачная БД, real-time синхронизация
- DONE: supabase-schema.sql — таблицы workspaces/workspace_members/leads/scripts/cta_config + RLS
- DONE: Supabase SDK через CDN, константы SUPABASE_URL + SUPABASE_KEY в head
- DONE: Экран входа email+пароль (#authScreen), кнопка "↩ Выйти" в шапке
- DONE: signIn/signOut/resolveWorkspace/checkSession, currentUser/workspaceId globals
- DONE: leadToRow/rowToLead конвертеры, loadLeadsFromDB/upsertLead/destroyLead, loadScriptsFromDB/saveScriptsToDB, loadCtaFromDB/saveCtaToDB
- DONE: saveDB() → только UI (updateDashboard + renderTable), все localStorage.setItem заменены на upsertLead
- DONE: Real-time подписка subscribeToLeads() — INSERT/UPDATE/DELETE без перезагрузки
- DONE: assignedTo поле, кнопка «👤 Мои лиды» + toggleMineFilter() + showOnlyMine фильтр в renderTable
- DONE: Модал миграции — checkLocalMigration/runMigration/skipMigration, batch upsert старых данных
- DONE: manifest.json + sw.js (PWA — offline заглушка, кеш HTML)
- DONE: netlify.toml — redirect / → HTML, cache headers для sw.js

### 2026-06-13 (Telegram-layout)
- DONE: TG-T1 — CSS: #tg-view flex-row, #tgSidebar 300px, .tg-lead-item, .script-drawer overlay
- DONE: TG-T2 — HTML: #tg-view со структурой Sidebar + Main(chat-view + tgEmpty), #scriptDrawer с #scriptPanel
- DONE: TG-T3 — JS sidebar: formatRelativeTime, renderTgLeadItem, renderTgSidebar, filterTgSidebar, selectTgLead, updateTgSidebarItem
- DONE: TG-T4 — JS навигация: openTgView/closeTgView, legacy aliases openChatView/closeChatView, убран renderScriptChips из renderChatView
- DONE: TG-T5 — JS drawer: openScriptDrawer/closeScriptDrawer, кнопка 📋 в chat header, ← Все лиды → closeTgView, updateTgSidebarItem в addMessageToLead
