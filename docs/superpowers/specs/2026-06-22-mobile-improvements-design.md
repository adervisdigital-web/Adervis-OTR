# Mobile Improvements Design Spec — ADERVIS OTR

**Дата:** 2026-06-22  
**Статус:** Approved  
**Scope:** Script drawer → bottom sheet на мобиле + свайп вправо для навигации

---

## Контекст

Мобильная основа уже есть: tab bar, stack-навигация (list/chat), FAB, `isMobile()`, `setMobileView()`. Главная проблема — панель скриптов (`#scriptDrawer`) на мобиле слайдит справа как боковая панель 320px. На экране 375px это занимает 86% ширины, полностью скрывая чат. Нужно превратить её в bottom sheet.

---

## Task 1: Script drawer → Bottom sheet на мобиле

### Подход

Только CSS — через `@media (max-width: 768px)`. Десктопное поведение не трогается.

### CSS-изменения

Добавить в блок `@media (max-width: 768px)` в `index.html`:

```css
/* Script drawer becomes bottom sheet on mobile */
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
```

### Handle (drag indicator)

В `.script-drawer-header` добавить декоративную ручку сверху только на мобиле:

```css
@media (max-width: 768px) {
    .script-drawer-header::before {
        content: '';
        display: block;
        width: 36px;
        height: 4px;
        background: var(--line);
        border-radius: 2px;
        margin: 0 auto 12px;
    }
    .script-drawer-header {
        flex-direction: column;
        align-items: stretch;
    }
}
```

Альтернатива без `::before` — добавить `<div class="sheet-handle">` в HTML перед `.script-drawer-header`. Выбор реализатора.

### Что НЕ меняется

- JS-логика `openScriptDrawer()` / `closeScriptDrawer()` — без изменений
- Overlay `#scriptDrawerOverlay` — работает как есть
- Содержимое панели (этапы, скрипты, AI) — без изменений
- Десктопное поведение — без изменений

---

## Task 2: Свайп вправо → назад к списку

### Поведение

В режиме `mobile-view-chat` — провести пальцем вправо по области чата `#tgMain` → вызов `setMobileView('list')`.

### Параметры

- Минимальный горизонтальный порог: `60px` (чтобы не срабатывал случайно)
- Максимальный вертикальный drift: `40px` (чтобы не конфликтовал со скроллом чата)
- Анимация: нет — мгновенное переключение как у кнопки «←»

### JS-реализация

Добавить в `setupMobileKeyboard()` или в отдельную функцию `setupMobileSwipe()`, вызываемую из `initApp()`:

```js
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

Вызов: добавить `setupMobileSwipe()` рядом с `setupMobileKeyboard()` в `initApp()`.

---

## Затронутые файлы

| Файл | Изменения |
|------|-----------|
| `index.html` (CSS) | Новые правила в `@media (max-width: 768px)` для `.script-drawer`, `.script-drawer.open`, `.script-drawer-header` |
| `index.html` (JS) | Новая функция `setupMobileSwipe()` + вызов в `initApp()` |

---

## Не входит в scope

- Свайп для закрытия script drawer
- Pull-to-refresh
- Анимация свайпа (следование за пальцем)
- Haptic feedback
- Изменения на десктопе
