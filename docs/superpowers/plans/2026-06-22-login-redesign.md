# Login Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Редизайн экрана входа — CSS-спиннер, «Запомнить меня», inline forgot password flow.

**Architecture:** Единственный файл `index.html`. Auth screen уже существует (~строка 1015). Рефакторим HTML `#authScreen` на два view (`#authViewLogin` / `#authViewForgot`), добавляем CSS, обновляем `signIn()`, добавляем 3 новые JS-функции. Онбординг (`#onboardingModal`) уже реализован на строках 5383+ и не трогается.

**Tech Stack:** Vanilla JS, CSS Custom Properties, Supabase Auth (`_sb.auth.resetPasswordForEmail`)

---

## Файловая карта

| Файл | Что меняем |
|------|-----------|
| `index.html` строки 103–120 | Удалить старые CSS-правила спиннера, добавить новые `.auth-spinner`, `.auth-row`, `.auth-remember`, `.auth-success`, `.auth-submit`, `.auth-fields` |
| `index.html` строки 1015–1032 | Заменить HTML `#authScreen` — два view внутри `.auth-card` |
| `index.html` строки 1508–1520 | Обновить `signIn()` — новые ID кнопки и спиннера, remember-me, `_signOutOnUnload` |
| `index.html` строка 1522 | Обновить `signOut()` — снять `beforeunload` listener если был |
| `index.html` после `signIn()` | Добавить `showForgotPassword()`, `showLoginView()`, `sendPasswordReset()` |

---

## Task 1: CSS — спиннер, remember me, forgot success

**Files:**
- Modify: `index.html` (~строки 103–120)

### Контекст

Текущие строки в `<style>`:
```css
        .auth-error { color: var(--danger); font-size: 12px; min-height: 16px; }
        #authSpinner { display: none; }
        #authSpinner.visible { display: inline; }
```

Нужно удалить `#authSpinner` правила (они будут заменены) и добавить новые классы.

- [ ] **Step 1: Удалить старые спиннер-правила, добавить новые CSS**

Найти в `<style>`:
```css
        .auth-error { color: var(--danger); font-size: 12px; min-height: 16px; }
        #authSpinner { display: none; }
        #authSpinner.visible { display: inline; }
```

Заменить на:
```css
        .auth-error { color: var(--danger); font-size: 12px; min-height: 16px; }
        .auth-success { color: var(--success); font-size: 12px; min-height: 16px; }
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
        .auth-row { display: flex; justify-content: space-between; align-items: center; font-size: 12px; }
        .auth-remember { display: flex; align-items: center; gap: 6px; color: var(--muted); cursor: pointer; font-size: 12px; }
        .auth-remember input { accent-color: var(--primary); width: 13px; height: 13px; }
        .auth-submit { width: 100%; }
        .auth-fields { display: flex; flex-direction: column; gap: 8px; }
```

- [ ] **Step 2: Верификация**

Открыть `index.html` в браузере → убедиться что страница загружается без ошибок в консоли.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "style(auth): CSS спиннер, remember me, forgot success — новые auth классы"
```

---

## Task 2: HTML — рефакторинг #authScreen на два view

**Files:**
- Modify: `index.html` (~строки 1015–1032)

### Контекст

Текущий HTML `#authScreen` (строки 1015–1032):
```html
    <!-- Auth Screen -->
    <div id="authScreen">
        <div class="auth-card">
            <h1>ADERVIS | OTR</h1>
            <p class="auth-sub">CRM для холодных продаж</p>
            <div style="display:flex;flex-direction:column;gap:8px;">
                <label class="sr-only" for="authEmail">Email</label>
                <input type="email" id="authEmail" placeholder="Email" autocomplete="email">
                <label class="sr-only" for="authPassword">Пароль</label>
                <input type="password" id="authPassword" placeholder="Пароль"
                       autocomplete="current-password"
                       onkeydown="if(event.key==='Enter')signIn()">
            </div>
            <p class="auth-error" id="authError" aria-live="polite"></p>
            <button class="btn btn-primary" onclick="signIn()">
                Войти <span id="authSpinner" aria-hidden="true">…</span>
            </button>
        </div>
    </div>
```

- [ ] **Step 1: Заменить HTML #authScreen**

Найти и заменить весь блок выше на:
```html
    <!-- Auth Screen -->
    <div id="authScreen">
        <div class="auth-card">
            <div>
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
                <div class="auth-row" style="margin-top:4px;">
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
                <p class="auth-sub" style="margin:0 0 8px;">Отправим ссылку для сброса на почту</p>
                <div class="auth-fields">
                    <label class="sr-only" for="authResetEmail">Email для сброса</label>
                    <input type="email" id="authResetEmail" placeholder="Email" autocomplete="email">
                </div>
                <p class="auth-error" id="authResetError" aria-live="polite"></p>
                <p class="auth-success" id="authResetSuccess" aria-live="polite"></p>
                <button class="btn btn-primary auth-submit" id="btnResetSend" onclick="sendPasswordReset()">
                    <span id="authResetBtnText">Отправить ссылку</span>
                    <span id="authResetSpinner" class="auth-spinner" aria-hidden="true" style="display:none;"></span>
                </button>
                <div style="text-align:center;margin-top:4px;">
                    <button class="btn-link-muted" onclick="showLoginView()">← Назад к входу</button>
                </div>
            </div>
        </div>
    </div>
```

- [ ] **Step 2: Верификация**

Открыть приложение → экран входа должен выглядеть как раньше (email, пароль, кнопка «Войти») + снизу появилась строка с чекбоксом «Запомнить меня» и ссылкой «Забыл пароль?».

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(auth): два view внутри auth-card — login + forgot password HTML"
```

---

## Task 3: JS — обновить signIn() + добавить showForgotPassword / sendPasswordReset

**Files:**
- Modify: `index.html` (~строки 1508–1534)

### Контекст

Текущие функции `signIn()` (строки 1508–1520) и `signOut()` (строки 1522–1534):

```js
        async function signIn() {
            const email    = (document.getElementById('authEmail').value || '').trim();
            const password = document.getElementById('authPassword').value || '';
            const errEl    = document.getElementById('authError');
            const spinner  = document.getElementById('authSpinner');
            errEl.textContent = '';
            spinner.classList.add('visible');
            const { error } = await _sb.auth.signInWithPassword({ email, password });
            spinner.classList.remove('visible');
            if (error) { errEl.textContent = translateAuthError(error.message); return; }
            // onAuthStateChange('SIGNED_IN') fires synchronously inside signInWithPassword above
            // and has already started initApp() — no direct call needed here
        }

        async function signOut() {
            // Clean up realtime subscription before signing out
            const ch = _sb.getChannels().find(function(c) { return c.topic === 'realtime:leads-rt'; });
            if (ch) _sb.removeChannel(ch);
            try { await _sb.auth.signOut(); } catch(e) { /* sign-out on network error: clear local state anyway */ }
            currentUser = null;
            workspaceId = null;
            _appInitializing = false;
            leads = [];
            document.getElementById('authScreen').classList.remove('hidden');
            document.getElementById('authEmail').value    = '';
            document.getElementById('authPassword').value = '';
        }
```

- [ ] **Step 1: Добавить переменную `_signOutOnUnload` перед `signIn()`**

Найти строку:
```js
        async function signIn() {
```

Добавить ПЕРЕД ней:
```js
        let _signOutOnUnload = null; // listener ссылка для remember-me cleanup

```

- [ ] **Step 2: Заменить `signIn()`**

Найти весь блок `async function signIn()` (до закрывающей `}` включительно) и заменить:

```js
        async function signIn() {
            const email    = (document.getElementById('authEmail').value || '').trim();
            const password = document.getElementById('authPassword').value || '';
            const errEl    = document.getElementById('authError');
            const btnText  = document.getElementById('authBtnText');
            const spinner  = document.getElementById('authSpinner');
            const btn      = document.getElementById('btnSignIn');
            errEl.textContent = '';
            btnText.style.display = 'none';
            spinner.style.display = '';
            btn.disabled = true;
            try {
                const { error } = await _sb.auth.signInWithPassword({ email, password });
                if (error) { errEl.textContent = translateAuthError(error.message); return; }
                const remember = document.getElementById('authRemember');
                if (remember && !remember.checked) {
                    _signOutOnUnload = function() { _sb.auth.signOut(); };
                    window.addEventListener('beforeunload', _signOutOnUnload);
                }
                // onAuthStateChange('SIGNED_IN') fires synchronously inside signInWithPassword above
                // and has already started initApp() — no direct call needed here
            } finally {
                btnText.style.display = '';
                spinner.style.display = 'none';
                btn.disabled = false;
            }
        }
```

- [ ] **Step 3: Обновить `signOut()` — снять beforeunload listener**

Найти в `signOut()` строку:
```js
            document.getElementById('authEmail').value    = '';
            document.getElementById('authPassword').value = '';
```

Заменить на:
```js
            document.getElementById('authEmail').value    = '';
            document.getElementById('authPassword').value = '';
            if (_signOutOnUnload) {
                window.removeEventListener('beforeunload', _signOutOnUnload);
                _signOutOnUnload = null;
            }
```

- [ ] **Step 4: Добавить 3 новые функции ПОСЛЕ `signOut()` (после её закрывающей `}`)**

Вставить сразу после `signOut()`:

```js
        function showForgotPassword() {
            document.getElementById('authViewLogin').style.display = 'none';
            document.getElementById('authViewForgot').style.display = '';
            const resetEmail = document.getElementById('authResetEmail');
            const loginEmail = document.getElementById('authEmail');
            if (resetEmail && loginEmail && loginEmail.value) resetEmail.value = loginEmail.value;
            document.getElementById('authResetError').textContent = '';
            document.getElementById('authResetSuccess').textContent = '';
            if (resetEmail) resetEmail.focus();
        }

        function showLoginView() {
            document.getElementById('authViewForgot').style.display = 'none';
            document.getElementById('authViewLogin').style.display = '';
            document.getElementById('authResetError').textContent = '';
            document.getElementById('authResetSuccess').textContent = '';
        }

        async function sendPasswordReset() {
            const emailEl  = document.getElementById('authResetEmail');
            const errEl    = document.getElementById('authResetError');
            const succEl   = document.getElementById('authResetSuccess');
            const btnText  = document.getElementById('authResetBtnText');
            const spinner  = document.getElementById('authResetSpinner');
            const btn      = document.getElementById('btnResetSend');
            const email    = (emailEl.value || '').trim();
            errEl.textContent  = '';
            succEl.textContent = '';
            if (!email) { errEl.textContent = 'Введите email'; emailEl.focus(); return; }
            btnText.style.display = 'none';
            spinner.style.display = '';
            btn.disabled = true;
            try {
                const { error } = await _sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.href });
                if (error) { errEl.textContent = error.message; return; }
                emailEl.style.display = 'none';
                succEl.textContent = 'Письмо отправлено на ' + email + '. Проверь почту.';
            } finally {
                btnText.style.display = '';
                spinner.style.display = 'none';
                btn.disabled = false;
            }
        }
```

- [ ] **Step 5: Верификация**

1. Открыть приложение → страница входа
2. Нажать «Забыл пароль?» → форма переключается на «Отправить ссылку»
3. Нажать «← Назад к входу» → возвращает login view
4. Ввести неверный email+пароль → кнопка мигает спиннером, затем показывает ошибку
5. Снять чекбокс «Запомнить меня», войти → при закрытии вкладки выполняется signOut

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat(auth): спиннер, remember me, forgot password — signIn + 3 новые функции"
```

---

## Self-Review

**Spec coverage:**
- ✅ CSS-спиннер вместо «…» → Task 1
- ✅ «Запомнить меня» → Task 2 (HTML) + Task 3 (JS)
- ✅ «Забыл пароль?» → Task 2 (HTML) + Task 3 (JS)
- ✅ Loading state (disabled button) → Task 3 `signIn()`
- ✅ Onboarding → уже реализован в `#onboardingModal` (строки 5383+), `checkOnboarding()` вызывается в `initApp()` (строка 5182). Не трогаем.

**Placeholder scan:** Нет TBD, нет "similar to task N". Каждый шаг содержит точный код.

**Type consistency:**
- `authBtnText`, `authSpinner`, `btnSignIn` — определены в Task 2 HTML и использованы в Task 3 JS ✅
- `authResetBtnText`, `authResetSpinner`, `btnResetSend` — аналогично ✅
- `showForgotPassword` / `showLoginView` — вызываются в HTML (Task 2) и определяются в JS (Task 3) ✅
- `_signOutOnUnload` — объявлена перед `signIn()`, используется в `signIn()` и `signOut()` ✅
