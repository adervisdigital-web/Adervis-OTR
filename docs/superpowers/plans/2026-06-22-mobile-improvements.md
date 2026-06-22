# Mobile Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Превратить боковую панель скриптов в bottom sheet на мобиле + добавить свайп вправо для возврата к списку лидов.

**Architecture:** Единственный файл `index.html` (~5620 строк). Task 1 — только CSS в блоке `@media (max-width: 768px)`. Task 2 — одна новая JS-функция `setupMobileSwipe()` и её вызов в `initApp()`. Никакие другие файлы не затрагиваются.

**Tech Stack:** Vanilla JS, CSS Custom Properties, Touch Events API

---

## Файловая карта

| Файл | Что меняем |
|------|-----------|
| `index.html` строки 838–1024 | Добавить CSS bottom sheet в блок `@media (max-width: 768px)` |
| `index.html` строки 5300–5303 | Добавить вызов `setupMobileSwipe()` рядом с `setupMobileKeyboard()` |
| `index.html` после строки 5474 | Добавить функцию `setupMobileSwipe()` |

---

## Task 1: CSS — Script drawer → Bottom sheet на мобиле

**Files:**
- Modify: `index.html` (CSS блок `@media (max-width: 768px)`, после строки ~983)

### Контекст

Текущий CSS `.script-drawer` (строки 593–602):
```css
.script-drawer {
    position: fixed; top: 0; right: 0; bottom: 0; width: 320px;
    background: var(--bg2); border-left: 1px solid var(--line);
    box-shadow: -8px 0 48px rgba(0,0,0,.7);
    z-index: 600;
    transform: translateX(100%);
    transition: transform .22s cubic-bezier(.25,.46,.45,.94);
    display: flex; flex-direction: column; overflow: hidden;
}
.script-drawer.open { transform: translateX(0); }
```

Текущий `.script-drawer-header` (строки 607–611):
```css
.script-drawer-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 16px; border-bottom: 1px solid var(--line); flex-shrink: 0;
    background: rgba(10,10,12,.88); backdrop-filter: blur(20px);
}
```

Нужно добавить в конец блока `@media (max-width: 768px)` (перед его закрывающей `}` около строки 1024) новые правила, которые переопределяют позиционирование только на мобиле.

- [ ] **Step 1: Найти место вставки**

Найти в `index.html` строку (около 983–989):
```css
            /* Command palette */
            #cmdPalette {
                width: calc(100vw - 24px) !important;
            }
```

Вставить ПОСЛЕ этого блока (но ДО закрывающей `}` media query):

```css
            /* Script drawer → bottom sheet on mobile */
            .script-drawer {
                top: auto !important;
                right: 0 !important;
                bottom: 0 !important;
                left: 0 !important;
                width: 100% !important;
                height: 85dvh !important;
                border-left: none !important;
                border-top: 1px solid var(--line) !important;
                border-radius: 16px 16px 0 0 !important;
                transform: translateY(100%) !important;
                transition: transform .25s cubic-bezier(.25,.46,.45,.94) !important;
            }
            .script-drawer.open {
                transform: translateY(0) !important;
            }
            /* Drag handle above header */
            .script-drawer-header::before {
                content: '';
                display: block;
                width: 36px;
                height: 4px;
                background: var(--line);
                border-radius: 2px;
                margin: 0 auto 10px;
            }
            .script-drawer-header {
                flex-direction: column !important;
                align-items: stretch !important;
                padding-top: 12px !important;
            }
```

- [ ] **Step 2: Верификация в браузере**

Открыть `index.html` → Инструменты разработчика (F12) → нажать иконку телефона (Toggle Device Toolbar) → выбрать размер 375×812 (iPhone).

Нажать на лид → открыть панель скриптов (кнопка «✨» или «Скрипты»). Убедиться:
1. Панель слайдит снизу, а не справа
2. Вверху панели видна серая ручка (drag handle)
3. Высота ~85% экрана
4. Закрытие по overlay работает

На десктопе (ширина > 768px) панель должна работать как раньше — сбоку справа.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "style(mobile): script drawer → bottom sheet на мобиле"
```

---

## Task 2: JS — Свайп вправо для возврата к списку

**Files:**
- Modify: `index.html` строки 5300–5303 (вызов в `initApp`)
- Modify: `index.html` после строки 5474 (новая функция)

### Контекст

В `initApp()` (строки 5299–5303) уже есть:
```js
            if (isMobile()) {
                setMobileView('list');
                setupMobileKeyboard();
            }
```

Функция `setupMobileKeyboard()` определена на строке 5459 и заканчивается около 5474.

Нужно:
1. Добавить `setupMobileSwipe()` после `setupMobileKeyboard()` в блоке `if (isMobile())`
2. Добавить саму функцию `setupMobileSwipe()` после `setupMobileKeyboard()`

- [ ] **Step 1: Добавить вызов `setupMobileSwipe()` в `initApp()`**

Найти строки 5300–5303:
```js
            if (isMobile()) {
                setMobileView('list');
                setupMobileKeyboard();
            }
```

Заменить на:
```js
            if (isMobile()) {
                setMobileView('list');
                setupMobileKeyboard();
                setupMobileSwipe();
            }
```

- [ ] **Step 2: Добавить функцию `setupMobileSwipe()`**

Найти строку после конца `setupMobileKeyboard()` (около строки 5474):
```js
        }

        /** Handle window resize (desktop <-> mobile switch) */
        window.addEventListener('resize', function() {
```

Вставить между `}` и `/** Handle window resize`:

```js
        /** Swipe right on chat view → go back to lead list */
        function setupMobileSwipe() {
            var el = document.getElementById('tgMain');
            if (!el) return;
            var startX, startY;
            el.addEventListener('touchstart', function(e) {
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
            }, { passive: true });
            el.addEventListener('touchend', function(e) {
                if (startX === undefined) return;
                var dx = e.changedTouches[0].clientX - startX;
                var dy = e.changedTouches[0].clientY - startY;
                if (dx > 60 && Math.abs(dy) < 40 && _mobileView === 'chat') {
                    setMobileView('list');
                }
                startX = undefined;
            }, { passive: true });
        }

```

- [ ] **Step 3: Верификация в браузере**

Инструменты разработчика → Toggle Device Toolbar → 375×812.

1. Нажать на лид → открывается чат (mobile-view-chat)
2. Провести пальцем вправо по области чата → возвращается к списку лидов
3. Провести пальцем вверх/вниз → ничего не происходит (скролл работает нормально)
4. Навигация «← Назад» кнопкой всё ещё работает

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(mobile): свайп вправо в чате → возврат к списку лидов"
```

---

## Self-Review

**Spec coverage:**
- ✅ Script drawer → bottom sheet: Task 1
- ✅ Drag handle: Task 1 (через `::before`)
- ✅ Десктоп не затронут: все правила внутри `@media (max-width: 768px)` с `!important`
- ✅ Свайп вправо, порог 60px, drift 40px: Task 2
- ✅ Только для `_mobileView === 'chat'`: Task 2 (guard условие)
- ✅ `{ passive: true }` для производительности: Task 2

**Placeholder scan:** Нет TBD, нет "similar to task N". Весь CSS и JS конкретный.

**Type consistency:**
- `setupMobileSwipe` — объявлена в Step 2 Task 2, вызывается в Step 1 Task 2 ✅
- `_mobileView` — глобальная переменная, определена на строке 5322 ✅
- `setMobileView()` — существующая функция, строка 5331 ✅
- `tgMain` — существующий элемент в HTML ✅
