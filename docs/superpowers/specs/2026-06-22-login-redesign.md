# Login Redesign Design Spec — ADERVIS OTR

**Дата:** 2026-06-22  
**Статус:** Approved  
**Scope:** Редизайн экрана входа — улучшенная карточка, forgot password, loading state, onboarding

---

## Контекст

Текущий экран входа (#authScreen) — минималистичная карточка с email + пароль + кнопка «Войти». Спиннер — это просто «…» в тексте кнопки. Нет «запомнить меня», нет сброса пароля, нет онбординга.

---

## Выбранный подход: А — Улучшенная карточка

Та же центрированная карточка 360px, тот же dark theme. Улучшения:
- Нормальный CSS-спиннер вместо «…»
- Чекбокс «Запомнить меня»
- Ссылка «Забыл пароль?» — inline-переключение формы
- Онбординг-экран при первом входе

---

## 1. Экран входа (Login)

### HTML-структура

```html
<div id="authScreen">
  <div class="auth-card">
    <!-- Шапка -->
    <div class="auth-logo">
      <h1>ADERVIS | OTR</h1>
      <p class="auth-sub">CRM для холодных продаж</p>
    </div>

    <!-- View: login (default) -->
    <div id="authViewLogin">
      <div class="auth-fields">
        <label class="sr-only" for="authEmail">Email</label>
        <input type="email" id="authEmail" placeholder="Email" autocomplete="email">
        <label class="sr-only" for="authPassword">Пароль</label>
        <input type="password" id="authPassword" placeholder="Пароль"
               autocomplete="current-password"
               onkeydown="if(event.key==='Enter')signIn()">
      </div>
      <div class="auth-row">
        <label class="auth-remember">
          <input type="checkbox" id="authRemember" checked> Запомнить меня
        </label>
        <button class="btn-link-muted" onclick="showForgotPassword()">Забыл пароль?</button>
      </div>
      <p class="auth-error" id="authError" aria-live="polite"></p>
      <button class="btn btn-primary auth-submit" id="btnSignIn" onclick="signIn()">
        <span id="authBtnText">Войти</span>
        <span id="authSpinner" class="auth-spinner" aria-hidden="true" style="display:none;"></span>
      </button>
    </div>

    <!-- View: forgot password -->
    <div id="authViewForgot" style="display:none;">
      <div>
        <p class="auth-sub" style="margin:0;">Отправим ссылку для сброса на почту</p>
      </div>
      <div class="auth-fields">
        <label class="sr-only" for="authResetEmail">Email</label>
        <input type="email" id="authResetEmail" placeholder="Email" autocomplete="email">
      </div>
      <p class="auth-error" id="authResetError" aria-live="polite"></p>
      <p class="auth-success" id="authResetSuccess" aria-live="polite"></p>
      <button class="btn btn-primary auth-submit" id="btnResetSend" onclick="sendPasswordReset()">
        <span id="authResetBtnText">Отправить ссылку</span>
        <span id="authResetSpinner" class="auth-spinner" aria-hidden="true" style="display:none;"></span>
      </button>
      <div style="text-align:center;">
        <button class="btn-link-muted" onclick="showLoginView()">← Назад к входу</button>
      </div>
    </div>
  </div>
</div>
```

### CSS-добавления

```css
.auth-spinner {
    display: inline-block;
    width: 14px; height: 14px;
    border: 2px solid rgba(255,255,255,.3);
    border-top-color: #fff;
    border-radius: 50%;
    animation: authSpin .7s linear infinite;
    vertical-align: middle;
}
@keyframes authSpin { to { transform: rotate(360deg); } }

.auth-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12px;
}
.auth-remember {
    display: flex; align-items: center; gap: 6px;
    color: var(--muted); cursor: pointer; font-size: 12px;
}
.auth-remember input { accent-color: var(--primary); width: 13px; height: 13px; }
.auth-success { color: var(--success); font-size: 12px; min-height: 16px; }
.auth-submit { width: 100%; }
.auth-fields { display: flex; flex-direction: column; gap: 8px; }
```

### JS-функции

**`signIn()`** — уже существует, обновить:
- Скрыть `#authBtnText`, показать `#authSpinner`
- `#btnSignIn.disabled = true`
- В `finally`: вернуть кнопку в исходное состояние

**`showForgotPassword()`** — новая:
- Скрыть `#authViewLogin`, показать `#authViewForgot`
- Pre-fill `#authResetEmail` из `#authEmail` если есть
- Сфокусировать `#authResetEmail`

**`showLoginView()`** — новая:
- Показать `#authViewLogin`, скрыть `#authViewForgot`
- Очистить `#authResetError`, `#authResetSuccess`

**`sendPasswordReset()`** — новая:
- Взять email из `#authResetEmail`
- Валидация: не пустой
- Показать спиннер, `disabled = true`
- Вызов: `await _sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.href })`
- Успех: скрыть форму, показать `#authResetSuccess` = «Письмо отправлено на [email]. Проверь почту.»
- Ошибка: показать `#authResetError`
- `finally`: убрать спиннер, `disabled = false`

**«Запомнить меня»** — простое поведение:
- Чекбокс checked (по умолчанию) → стандартное поведение Supabase (сессия в localStorage)
- Чекбокс unchecked → после signIn добавить `window.addEventListener('beforeunload', () => _sb.auth.signOut())`
  - Переменная `_signOutOnUnload` хранит состояние чтобы удалить listener при явном выходе

---

## 2. Онбординг-экран

Показывается **один раз** — при первом успешном входе (нет ключа `adervis_onboarded_v1` в localStorage).

### HTML

```html
<div id="onboardingScreen" style="display:none;">
  <div class="auth-card" style="max-width:420px;gap:20px;">
    <div style="text-align:center;">
      <h2 style="margin:0;font-size:18px;">Добро пожаловать в OTR 👋</h2>
      <p class="auth-sub">Три шага чтобы начать</p>
    </div>
    <div style="display:flex;flex-direction:column;gap:10px;">
      <div class="onboard-step">
        <span class="onboard-icon">➕</span>
        <div>
          <strong>Добавь первый лид</strong>
          <p>Нажми «+ Лид» и вставь ссылку на VK / Instagram / Telegram</p>
        </div>
      </div>
      <div class="onboard-step">
        <span class="onboard-icon">💬</span>
        <div>
          <strong>Отправь ледокол</strong>
          <p>Открой чат → скопируй готовый скрипт → напиши клиенту</p>
        </div>
      </div>
      <div class="onboard-step">
        <span class="onboard-icon">📊</span>
        <div>
          <strong>Обновляй статус</strong>
          <p>Двигай лид по воронке по мере развития диалога</p>
        </div>
      </div>
    </div>
    <button class="btn btn-primary" style="width:100%;" onclick="finishOnboarding()">
      Начать работу →
    </button>
    <p style="text-align:center;font-size:11px;color:var(--muted);margin:0;">Показывается только один раз</p>
  </div>
</div>
```

### CSS

```css
.onboard-step {
    display: flex; gap: 14px; align-items: flex-start;
    background: var(--bg); border: 1px solid var(--line);
    border-radius: var(--radius); padding: 12px 14px;
}
.onboard-icon { font-size: 20px; flex-shrink: 0; }
.onboard-step strong { font-size: 13px; display: block; margin-bottom: 2px; }
.onboard-step p { font-size: 11px; color: var(--muted); margin: 0; }
```

### JS-логика

**`finishOnboarding()`**:
```js
function finishOnboarding() {
    localStorage.setItem('adervis_onboarded_v1', '1');
    document.getElementById('onboardingScreen').style.display = 'none';
}
```

**Интеграция в `onAuthStateChange('SIGNED_IN')`**:
```js
// После скрытия authScreen:
document.getElementById('authScreen').classList.add('hidden');
if (!localStorage.getItem('adervis_onboarded_v1')) {
    document.getElementById('onboardingScreen').style.display = 'flex';
} else {
    // обычная инициализация
}
```

**`#onboardingScreen` позиционирование** — такое же как `#authScreen`:
```css
#onboardingScreen {
    position: fixed; inset: 0; z-index: 9998;
    display: flex; align-items: center; justify-content: center;
    background: var(--bg);
}
```

---

## Затронутые файлы

| Файл | Изменения |
|------|-----------|
| `index.html` (CSS) | `.auth-spinner`, `@keyframes authSpin`, `.auth-row`, `.auth-remember`, `.auth-success`, `.auth-submit`, `.auth-fields`, `.onboard-step`, `.onboard-icon`, `#onboardingScreen` |
| `index.html` (HTML) | Рефакторинг `#authScreen` (два view), новый `#onboardingScreen` |
| `index.html` (JS) | Обновить `signIn()`, добавить `showForgotPassword()`, `showLoginView()`, `sendPasswordReset()`, `finishOnboarding()` |

---

## Не входит в scope

- Регистрация новых пользователей (создание аккаунтов через UI)
- OAuth / Google / VK Sign In
- Кастомный email-template для сброса пароля (Supabase defaults)
- Onboarding с интерактивным туром (просто 3 карточки)
