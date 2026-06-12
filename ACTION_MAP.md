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
| 9 | Статистика по сегментам — конверсия отдельно для каждого типа бизнеса | НИЗКИЙ | TODO |
| 10 | Мини-график активности по дням (последние 14 дней) | НИЗКИЙ | TODO |
| 11 | Горячие клавиши: N (новый лид), S (фокус поиска), D (диалог активной строки) | НИЗКИЙ | TODO |
| 12 | Поиск внутри редактора скриптов | НИЗКИЙ | TODO |
| 13 | PWA — manifest.json + service worker, установка как приложение | БУДУЩЕЕ | TODO |
| 14 | Переключатель тем: Dark OLED / Linear Dark / Light | БУДУЩЕЕ | TODO |
| 15 | Мультиаккаунт — несколько воронок/менеджеров в localStorage | БУДУЩЕЕ | TODO |

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
