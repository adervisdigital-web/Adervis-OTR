# ADERVIS OTR — Stage 1: Supabase Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перевести single-file HTML CRM с localStorage на Supabase — shared database, email-auth, real-time sync для двух пользователей.

**Architecture:** Supabase используется как backend (PostgreSQL + Auth + Realtime). HTML-файл деплоится на Netlify. В-памяти массив `leads` остаётся source of truth для UI — при каждой мутации данные синхронизируются в Supabase, при реалтайм-событии — массив обновляется и UI перерисовывается.

**Tech Stack:** Vanilla JS, Supabase JS SDK v2 (CDN), Supabase PostgreSQL + Auth + Realtime, Netlify (static hosting), manifest.json + SW для PWA.

**Spec:** `docs/superpowers/specs/2026-06-13-saas-evolution-design.md`

---

## Файлы

| Файл | Действие | Что делает |
|------|----------|------------|
| `Adervis LidGen.html` | Modify | Основной файл — все изменения идут сюда |
| `supabase-schema.sql` | Create | SQL для создания таблиц и RLS в Supabase |
| `manifest.json` | Create | PWA манифест |
| `sw.js` | Create | Service Worker для PWA (offline cache) |

---

## Task 0: Supabase project + схема базы данных

**Files:**
- Create: `supabase-schema.sql`

- [ ] **Step 1: Создать Supabase проект**

  Зайди на [supabase.com](https://supabase.com) → New project → назови `adervis-otr` → запомни Region.

- [ ] **Step 2: Записать ключи**

  В Supabase Dashboard → Settings → API:
  - `Project URL` → сохрани как `SUPABASE_URL`
  - `anon public` key → сохрани как `SUPABASE_ANON_KEY`

- [ ] **Step 3: Создать файл схемы**

  Create `supabase-schema.sql`:

  ```sql
  -- Workspaces (команды)
  CREATE TABLE workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now()
  );

  -- Члены workspace
  CREATE TABLE workspace_members (
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id),
    role TEXT DEFAULT 'manager',
    PRIMARY KEY (workspace_id, user_id)
  );

  -- Лиды
  CREATE TABLE leads (
    id UUID PRIMARY KEY,
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    link TEXT,
    contact TEXT,
    biz_type TEXT,
    status INTEGER DEFAULT 0,
    updated_at BIGINT,
    notes TEXT,
    messages JSONB DEFAULT '[]',
    remind_at TEXT,
    attempt_count INTEGER DEFAULT 0,
    assigned_to UUID REFERENCES auth.users(id),
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now()
  );

  -- Скрипты (per workspace)
  CREATE TABLE scripts (
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    stage INTEGER NOT NULL,
    templates JSONB NOT NULL DEFAULT '[]',
    PRIMARY KEY (workspace_id, stage)
  );

  -- CTA ссылки (per workspace)
  CREATE TABLE cta_config (
    workspace_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
    call_link TEXT DEFAULT '',
    brief_link TEXT DEFAULT '',
    meeting_link TEXT DEFAULT ''
  );

  -- RLS: включить для всех таблиц
  ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
  ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
  ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
  ALTER TABLE scripts ENABLE ROW LEVEL SECURITY;
  ALTER TABLE cta_config ENABLE ROW LEVEL SECURITY;

  -- Политики: пользователь видит только свой workspace
  CREATE POLICY "workspace_own" ON workspaces
    FOR ALL USING (id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    ));

  CREATE POLICY "members_own" ON workspace_members
    FOR ALL USING (workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    ));

  CREATE POLICY "leads_workspace" ON leads
    FOR ALL USING (workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    ));

  CREATE POLICY "scripts_workspace" ON scripts
    FOR ALL USING (workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    ));

  CREATE POLICY "cta_workspace" ON cta_config
    FOR ALL USING (workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    ));
  ```

- [ ] **Step 4: Запустить SQL в Supabase**

  В Supabase Dashboard → SQL Editor → вставить содержимое `supabase-schema.sql` → Run.
  Ожидаем: все таблицы созданы без ошибок.

- [ ] **Step 5: Создать тестовых пользователей**

  В Supabase Dashboard → Authentication → Users → Add user:
  - Пользователь 1 (владелец): `owner@adervis.ru` / пароль
  - Пользователь 2 (менеджер): `manager@adervis.ru` / пароль

- [ ] **Step 6: Создать workspace вручную через SQL**

  В SQL Editor:
  ```sql
  -- Замени UUID на реальные user_id из таблицы auth.users
  INSERT INTO workspaces (id, name, created_by)
  VALUES ('00000000-0000-0000-0000-000000000001', 'ADERVIS', '<owner_user_id>');

  INSERT INTO workspace_members (workspace_id, user_id, role)
  VALUES
    ('00000000-0000-0000-0000-000000000001', '<owner_user_id>', 'owner'),
    ('00000000-0000-0000-0000-000000000001', '<manager_user_id>', 'manager');
  ```

- [ ] **Step 7: Commit**

  ```bash
  git add supabase-schema.sql
  git commit -m "feat: add Supabase schema — leads, workspaces, RLS"
  ```

---

## Task 1: Добавить Supabase SDK + инициализация клиента

**Files:**
- Modify: `Adervis LidGen.html` — `<head>` секция

- [ ] **Step 1: Добавить CDN и константы в `<head>`**

  Найти строку `<title>ADERVIS | OTR</title>` (строка ~6) и вставить **после** неё:

  ```html
  <!-- Supabase JS SDK -->
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
  <script>
    const SUPABASE_URL = 'https://ВСТАВЬ_СВОЙ_PROJECT_ID.supabase.co';
    const SUPABASE_ANON_KEY = 'ВСТАВЬ_СВОЙ_ANON_KEY';
    const _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  </script>
  ```

  Замени `ВСТАВЬ_СВОЙ_PROJECT_ID` и `ВСТАВЬ_СВОЙ_ANON_KEY` на реальные значения из Task 0 Step 2.

- [ ] **Step 2: Проверить в браузере**

  Открыть `Adervis LidGen.html` в браузере. В DevTools Console:
  ```js
  typeof _sb   // должно вернуть "object"
  _sb.auth     // должен быть объект с методами signIn, signOut, etc.
  ```
  Ожидаем: нет ошибок `_sb is not defined`.

- [ ] **Step 3: Commit**

  ```bash
  git add "Adervis LidGen.html"
  git commit -m "feat: add Supabase SDK CDN + client init"
  ```

---

## Task 2: Экран авторизации — HTML + CSS

**Files:**
- Modify: `Adervis LidGen.html` — CSS секция и HTML body

- [ ] **Step 1: Добавить CSS для login screen**

  Найти строку `* { box-sizing: border-box; }` (строка ~92) и вставить **перед** ней:

  ```css
  /* ─── Auth screen ─────────────────────────────────── */
  #authScreen {
      position: fixed; inset: 0; z-index: 9999;
      display: flex; align-items: center; justify-content: center;
      background: var(--bg);
  }
  #authScreen.hidden { display: none; }
  .auth-card {
      background: var(--panel); border: 1px solid var(--line);
      border-radius: var(--radius-xl); padding: 40px 36px;
      width: 360px; box-shadow: var(--shadow-4);
      display: flex; flex-direction: column; gap: 16px;
  }
  .auth-card h1 { margin: 0; font-size: 18px; font-weight: 700; letter-spacing: -0.3px; }
  .auth-card .auth-sub { font-size: 13px; color: var(--muted); margin-top: -8px; }
  .auth-error { color: var(--danger); font-size: 12px; min-height: 16px; }
  #authSpinner { display: none; }
  #authSpinner.visible { display: inline; }
  ```

- [ ] **Step 2: Добавить HTML экрана входа**

  Найти `<body>` тег (строка ~700 approx) и вставить **сразу после него**:

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

- [ ] **Step 3: Добавить toast элемент если ещё нет**

  Найти `<div id="toastEl"` в HTML. Если уже есть — пропустить этот шаг. Если нет — вставить перед `</body>`:
  ```html
  <div id="toastEl" role="status" aria-live="polite" aria-atomic="true"
       style="position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(20px);
              background:var(--panel);border:1px solid var(--line);border-radius:var(--radius-pill);
              padding:8px 18px;font-size:13px;font-weight:500;z-index:9998;opacity:0;
              transition:opacity .2s,transform .2s;pointer-events:none;">
  </div>
  ```
  Добавить CSS: `.#toastEl.visible { opacity: 1; transform: translateX(-50%) translateY(0); }`

- [ ] **Step 4: Проверить в браузере**

  Открыть файл. Должен появиться экран входа поверх всего содержимого.
  В Console: `document.getElementById('authScreen')` — должен вернуть элемент.

- [ ] **Step 5: Commit**

  ```bash
  git add "Adervis LidGen.html"
  git commit -m "feat: add auth screen HTML + CSS overlay"
  ```

---

## Task 3: Логика авторизации (signIn / signOut / сессия)

**Files:**
- Modify: `Adervis LidGen.html` — в `<script>` блоке, сразу после `// --- HEADER DROPDOWN ---`

- [ ] **Step 1: Добавить глобальные переменные auth**

  Найти `// --- HEADER DROPDOWN ---` (строка ~937) и вставить **перед** ним:

  ```js
  // ─── Auth ────────────────────────────────────────────
  let currentUser = null;       // { id, email }
  let workspaceId = null;       // UUID текущего workspace
  ```

- [ ] **Step 2: Добавить функции auth**

  Вставить сразу после объявлений `currentUser` и `workspaceId`:

  ```js
  async function signIn() {
      const email    = document.getElementById('authEmail').value.trim();
      const password = document.getElementById('authPassword').value;
      const errEl    = document.getElementById('authError');
      const spinner  = document.getElementById('authSpinner');
      errEl.textContent = '';
      spinner.classList.add('visible');

      const { data, error } = await _sb.auth.signInWithPassword({ email, password });
      spinner.classList.remove('visible');
      if (error) { errEl.textContent = error.message; return; }
      currentUser = { id: data.user.id, email: data.user.email };
      await initApp();
  }

  async function signOut() {
      await _sb.auth.signOut();
      currentUser = null;
      workspaceId = null;
      leads       = [];
      document.getElementById('authScreen').classList.remove('hidden');
      document.getElementById('authEmail').value    = '';
      document.getElementById('authPassword').value = '';
  }

  async function resolveWorkspace() {
      const { data, error } = await _sb.from('workspace_members')
          .select('workspace_id')
          .eq('user_id', currentUser.id)
          .limit(1)
          .single();
      if (error || !data) throw new Error('Workspace не найден. Попросите владельца добавить вас.');
      workspaceId = data.workspace_id;
  }

  async function checkSession() {
      const { data: { session } } = await _sb.auth.getSession();
      if (session) {
          currentUser = { id: session.user.id, email: session.user.email };
          await initApp();
      }
      // Если нет сессии — authScreen уже виден (по умолчанию)
  }
  ```

- [ ] **Step 3: Добавить кнопку «Выйти» в шапку**

  Найти в HTML шапку (`.header-buttons`), добавить кнопку:
  ```html
  <button class="btn btn-outline" onclick="signOut()" aria-label="Выйти из аккаунта" style="font-size:12px;">Выйти</button>
  ```

- [ ] **Step 4: Проверить логику входа в Console**

  ```js
  // Вызвать вручную:
  _sb.auth.signInWithPassword({ email: 'owner@adervis.ru', password: 'твой_пароль' })
    .then(r => console.log('user:', r.data?.user?.id, 'err:', r.error?.message))
  // Ожидаем: user: <uuid>, err: undefined
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add "Adervis LidGen.html"
  git commit -m "feat: Supabase auth — signIn/signOut/checkSession"
  ```

---

## Task 4: Асинхронная инициализация приложения

**Files:**
- Modify: `Adervis LidGen.html` — нижняя часть `<script>`, строки ~2788-2793

- [ ] **Step 1: Обернуть блок инициализации в `initApp()`**

  Найти блок (строка ~2788):
  ```js
  // Init
  updateDashboard();
  renderTable();
  updateAccountBadge();
  checkOnboarding();
  window.onclick = function(e) { if (e.target.className === 'modal-overlay') e.target.style.display = "none"; }
  ```

  Заменить на:
  ```js
  // ─── Async init ───────────────────────────────────────
  async function initApp() {
      try {
          await resolveWorkspace();
          await Promise.all([
              loadLeadsFromDB(),
              loadScriptsFromDB(),
              loadCtaFromDB()
          ]);
          document.getElementById('authScreen').classList.add('hidden');
          updateDashboard();
          renderTable();
          updateAccountBadge();
          checkOnboarding();
          subscribeToLeads();
      } catch (err) {
          const errEl = document.getElementById('authError');
          if (errEl) errEl.textContent = err.message;
          document.getElementById('authScreen').classList.remove('hidden');
      }
  }

  window.onclick = function(e) { if (e.target.className === 'modal-overlay') e.target.style.display = "none"; }

  // Проверить существующую сессию при загрузке страницы
  checkSession();
  ```

- [ ] **Step 2: Проверить что страница не показывает данные до входа**

  Открыть файл в браузере (без активной сессии). Должен быть только экран входа, таблица лидов не видна.

- [ ] **Step 3: Commit**

  ```bash
  git add "Adervis LidGen.html"
  git commit -m "feat: async initApp() — auth guard before data load"
  ```

---

## Task 5: Функции чтения/записи в Supabase (DB helpers)

**Files:**
- Modify: `Adervis LidGen.html` — в `<script>`, сразу после `// --- ДАННЫЕ И ИНИЦИАЛИЗАЦИЯ ---`

- [ ] **Step 1: Добавить helper-функции Supabase**

  Найти строку `// --- ЛОГИКА БД И СТАТИСТИКИ ---` (строка ~1287) и вставить **перед** ней:

  ```js
  // ─── Supabase DB helpers ─────────────────────────────

  function leadToRow(lead) {
      return {
          id:            String(lead.id),
          workspace_id:  workspaceId,
          name:          lead.name || '',
          link:          lead.link || '',
          contact:       lead.contact || '',
          biz_type:      lead.bizType || '',
          status:        lead.status ?? 0,
          updated_at:    lead.updatedAt || Date.now(),
          notes:         lead.notes || '',
          messages:      lead.messages || [],
          remind_at:     lead.remindAt || null,
          attempt_count: lead.attemptCount || 0,
          assigned_to:   lead.assignedTo || null,
          created_by:    lead.createdBy || currentUser?.id || null
      };
  }

  function rowToLead(row) {
      return {
          id:           row.id,
          name:         row.name,
          link:         row.link,
          contact:      row.contact,
          bizType:      row.biz_type,
          status:       row.status,
          updatedAt:    row.updated_at,
          notes:        row.notes,
          messages:     row.messages || [],
          remindAt:     row.remind_at,
          attemptCount: row.attempt_count || 0,
          assignedTo:   row.assigned_to,
          createdBy:    row.created_by
      };
  }

  async function loadLeadsFromDB() {
      const { data, error } = await _sb.from('leads')
          .select('*')
          .eq('workspace_id', workspaceId)
          .order('updated_at', { ascending: false });
      if (error) { console.error('loadLeads:', error.message); return; }
      leads = (data || []).map(rowToLead);
  }

  async function upsertLead(lead) {
      if (!workspaceId) return;
      const { error } = await _sb.from('leads').upsert(leadToRow(lead), { onConflict: 'id' });
      if (error) console.error('upsertLead:', error.message);
  }

  async function destroyLead(id) {
      if (!workspaceId) return;
      const { error } = await _sb.from('leads').delete()
          .eq('id', String(id))
          .eq('workspace_id', workspaceId);
      if (error) console.error('destroyLead:', error.message);
  }

  async function loadScriptsFromDB() {
      const { data, error } = await _sb.from('scripts')
          .select('stage, templates')
          .eq('workspace_id', workspaceId);
      if (error || !data || data.length === 0) {
          // Fallback: дефолтные скрипты (уже определены ниже в коде)
          return;
      }
      // Merge loaded templates into scripts structure
      data.forEach(row => {
          if (scripts[row.stage]) scripts[row.stage].options = row.templates;
      });
  }

  async function saveScriptsToDB() {
      if (!workspaceId) return;
      const rows = scripts.map((s, stage) => ({
          workspace_id: workspaceId,
          stage,
          templates: s.options
      }));
      const { error } = await _sb.from('scripts').upsert(rows, { onConflict: 'workspace_id,stage' });
      if (error) console.error('saveScripts:', error.message);
  }

  async function loadCtaFromDB() {
      const { data, error } = await _sb.from('cta_config')
          .select('*')
          .eq('workspace_id', workspaceId)
          .maybeSingle();
      if (error || !data) return;
      cta.call_link    = data.call_link    || '';
      cta.brief_link   = data.brief_link   || '';
      cta.meeting_link = data.meeting_link || '';
  }

  async function saveCtaToDB() {
      if (!workspaceId) return;
      const { error } = await _sb.from('cta_config').upsert({
          workspace_id: workspaceId,
          call_link:    cta.call_link    || '',
          brief_link:   cta.brief_link   || '',
          meeting_link: cta.meeting_link || ''
      }, { onConflict: 'workspace_id' });
      if (error) console.error('saveCta:', error.message);
  }
  ```

- [ ] **Step 2: Проверить в Console после входа**

  ```js
  // После логина:
  await loadLeadsFromDB();
  console.log('leads loaded:', leads.length);  // 0 или кол-во импортированных
  typeof upsertLead   // "function"
  typeof destroyLead  // "function"
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add "Adervis LidGen.html"
  git commit -m "feat: Supabase DB helpers — upsertLead, destroyLead, loadLeads, scripts, cta"
  ```

---

## Task 6: Заменить localStorage сохранение лидов на Supabase

**Files:**
- Modify: `Adervis LidGen.html` — функции `saveDB`, `addLead`, `deleteLead`, `setStatus`, `saveNotes`, `saveReminder`, `saveMessageEdit`, `deleteMessage`, `addMessageToLead`

- [ ] **Step 1: Заменить `saveDB()`**

  Найти (строка ~1288):
  ```js
  function saveDB() {
      localStorage.setItem(dbKey(), JSON.stringify(leads));
      updateDashboard();
      renderTable();
  }
  ```
  Заменить на:
  ```js
  function saveDB() {
      updateDashboard();
      renderTable();
  }
  ```

- [ ] **Step 2: Обновить `addLead()` — добавить `upsertLead`**

  Найти в `addLead()` (строка ~1543):
  ```js
  currentSort = { col: 'updatedAt', desc: true };
  saveDB();
  ```
  Заменить на:
  ```js
  currentSort = { col: 'updatedAt', desc: true };
  const _newLead = leads[leads.length - 1];
  _newLead.assignedTo = currentUser?.id || null;
  _newLead.createdBy  = currentUser?.id || null;
  upsertLead(_newLead);
  saveDB();
  ```

- [ ] **Step 3: Обновить `deleteLead()`**

  Найти (строка ~1621):
  ```js
  function deleteLead(id) {
      if (confirm("Удалить лид из базы?")) {
          leads = leads.filter(l => l.id !== id);
          saveDB();
      }
  }
  ```
  Заменить на:
  ```js
  function deleteLead(id) {
      if (confirm("Удалить лид из базы?")) {
          leads = leads.filter(l => l.id !== id);
          destroyLead(id);
          saveDB();
      }
  }
  ```

- [ ] **Step 4: Обновить `setStatus()`**

  Найти (строка ~1628):
  ```js
  function setStatus(id, newStatus) {
      const lead = leads.find(l => String(l.id) === String(id));
      if(lead) {
          lead.status = newStatus;
          lead.updatedAt = Date.now();
          saveDB();
  ```
  Заменить `saveDB();` на:
  ```js
          upsertLead(lead);
          saveDB();
  ```

- [ ] **Step 5: Обновить `saveNotes()`**

  Найти (строка ~1638):
  ```js
  function saveNotes(id, text) {
      const lead = leads.find(l => String(l.id) === String(id));
      if(lead) {
          lead.notes = text;
          localStorage.setItem(dbKey(), JSON.stringify(leads));
      }
  }
  ```
  Заменить на:
  ```js
  function saveNotes(id, text) {
      const lead = leads.find(l => String(l.id) === String(id));
      if (lead) {
          lead.notes = text;
          upsertLead(lead);
      }
  }
  ```

- [ ] **Step 6: Обновить `saveReminder()`**

  Найти (строка ~2100):
  ```js
  function saveReminder(leadId, dateStr) {
      const lead = leads.find(l => String(l.id) === String(leadId));
      if (!lead) return;
      lead.remindAt = dateStr || null;
      localStorage.setItem(dbKey(), JSON.stringify(leads));
      updateDashboard();
      renderTable();
  }
  ```
  Заменить на:
  ```js
  function saveReminder(leadId, dateStr) {
      const lead = leads.find(l => String(l.id) === String(leadId));
      if (!lead) return;
      lead.remindAt = dateStr || null;
      upsertLead(lead);
      updateDashboard();
      renderTable();
  }
  ```

- [ ] **Step 7: Обновить `saveMessageEdit()`**

  Найти (строка ~2186):
  ```js
  lead.messages[msgIdx].edited = true;
  localStorage.setItem(dbKey(), JSON.stringify(leads));
  ```
  Заменить на:
  ```js
  lead.messages[msgIdx].edited = true;
  upsertLead(lead);
  ```

- [ ] **Step 8: Обновить `deleteMessage()`**

  Найти (строка ~2203):
  ```js
  lead.messages.splice(msgIdx, 1);
  localStorage.setItem(dbKey(), JSON.stringify(leads));
  updateDashboard();
  ```
  Заменить на:
  ```js
  lead.messages.splice(msgIdx, 1);
  upsertLead(lead);
  updateDashboard();
  ```

- [ ] **Step 9: Обновить `addMessageToLead()`**

  Найти (строка ~2224):
  ```js
  lead.updatedAt = Date.now();
  localStorage.setItem(dbKey(), JSON.stringify(leads));
  updateDashboard();
  ```
  Заменить на:
  ```js
  lead.updatedAt = Date.now();
  upsertLead(lead);
  updateDashboard();
  ```

- [ ] **Step 10: Найти оставшиеся прямые вызовы localStorage.setItem(dbKey())**

  ```bash
  grep -n "localStorage.setItem(dbKey" "Adervis LidGen.html"
  ```
  Ожидаем: только в функциях bulk import и JSON import (строки 1642 и 1706). Заменить оба:

  Строка ~1642 (в bulk import, после push в массив):
  ```js
  // Заменить: localStorage.setItem(dbKey(), JSON.stringify(leads));
  // На:
  newItems.forEach(l => { l.assignedTo = currentUser?.id; upsertLead(l); });
  ```

  Строка ~1706 (в JSON import):
  ```js
  // Заменить: localStorage.setItem(dbKey(), JSON.stringify(leads));
  // На:
  leads.forEach(l => upsertLead(l));
  // и: localStorage.setItem(scriptsKey(), JSON.stringify(scripts));
  // На:
  saveScriptsToDB();
  ```

- [ ] **Step 11: Проверить что нет `localStorage.setItem(dbKey())` в коде**

  ```bash
  grep -n "localStorage.setItem(dbKey" "Adervis LidGen.html"
  ```
  Ожидаем: 0 результатов.

- [ ] **Step 12: Smoke test — добавить лид и проверить в Supabase**

  1. Открыть файл в браузере, войти
  2. Добавить лид "Тест кафе"
  3. В Supabase Dashboard → Table Editor → leads → должна появиться строка
  4. В Console: `leads.find(l => l.name === 'Тест кафе')` — должен вернуть объект

- [ ] **Step 13: Commit**

  ```bash
  git add "Adervis LidGen.html"
  git commit -m "feat: replace localStorage lead saves with Supabase upsert/delete"
  ```

---

## Task 7: Заменить localStorage для скриптов и CTA

**Files:**
- Modify: `Adervis LidGen.html`

- [ ] **Step 1: Найти `saveScripts()` и заменить**

  Найти (строка ~1294):
  ```js
  function saveScripts() { localStorage.setItem(scriptsKey(), JSON.stringify(scripts)); }
  ```
  Заменить на:
  ```js
  function saveScripts() { saveScriptsToDB(); }
  ```

- [ ] **Step 2: Найти `saveCta()` и заменить**

  Найти (строка ~1284):
  ```js
  function saveCta() { localStorage.setItem(ctaKey(), JSON.stringify(cta)); }
  ```
  Заменить на:
  ```js
  function saveCta() { saveCtaToDB(); }
  ```

- [ ] **Step 3: Убрать localStorage initialization для leads/scripts/cta**

  Найти блок инициализации переменных (строки ~1003-1283):
  ```js
  let leads = safeParseJSON(localStorage.getItem(dbKey()), []) || [];
  ```
  Заменить на:
  ```js
  let leads = [];
  ```
  (Leads будут загружены async в initApp → loadLeadsFromDB)

  Найти:
  ```js
  let scripts = safeParseJSON(localStorage.getItem(scriptsKey()), null) || JSON.parse(JSON.stringify(defaultScripts));
  ```
  Заменить на:
  ```js
  let scripts = JSON.parse(JSON.stringify(defaultScripts));
  ```
  (Scripts загружаются в initApp → loadScriptsFromDB)

  Найти:
  ```js
  let cta = safeParseJSON(localStorage.getItem(ctaKey()), null) || JSON.parse(JSON.stringify(defaultCta));
  ```
  Заменить на:
  ```js
  let cta = JSON.parse(JSON.stringify(defaultCta));
  ```

- [ ] **Step 4: Smoke test — изменить CTA ссылку**

  1. Войти в приложение
  2. Открыть настройки → ввести call_link → сохранить
  3. Обновить страницу → войти заново
  4. Открыть настройки → call_link должен сохраниться
  5. В Supabase → cta_config → должна быть строка с workspace_id

- [ ] **Step 5: Commit**

  ```bash
  git add "Adervis LidGen.html"
  git commit -m "feat: replace scripts/cta localStorage with Supabase"
  ```

---

## Task 8: Real-time подписка на изменения лидов

**Files:**
- Modify: `Adervis LidGen.html`

- [ ] **Step 1: Добавить функцию подписки**

  Найти секцию с DB helpers (добавленную в Task 5) и вставить в конец:

  ```js
  function subscribeToLeads() {
      if (!workspaceId) return;
      _sb.channel('leads-rt')
          .on('postgres_changes', {
              event: '*',
              schema: 'public',
              table: 'leads',
              filter: `workspace_id=eq.${workspaceId}`
          }, payload => {
              const { eventType, new: newRow, old: oldRow } = payload;

              if (eventType === 'INSERT') {
                  // Не добавлять если это наш собственный лид (уже в памяти)
                  if (!leads.find(l => String(l.id) === String(newRow.id))) {
                      leads.unshift(rowToLead(newRow));
                      saveDB();
                      showToast('📥 Новый лид добавлен');
                  }
              } else if (eventType === 'UPDATE') {
                  const idx = leads.findIndex(l => String(l.id) === String(newRow.id));
                  if (idx !== -1) {
                      leads[idx] = rowToLead(newRow);
                      saveDB();
                  }
              } else if (eventType === 'DELETE') {
                  const prevLen = leads.length;
                  leads = leads.filter(l => String(l.id) !== String(oldRow.id));
                  if (leads.length !== prevLen) {
                      saveDB();
                      showToast('🗑 Лид удалён другим пользователем');
                  }
              }
          })
          .subscribe();
  }
  ```

- [ ] **Step 2: Убедиться что `subscribeToLeads()` вызывается в `initApp()`**

  В `initApp()` (Task 4) уже есть `subscribeToLeads()` — проверить что вызов есть после `renderTable()`.

- [ ] **Step 3: Включить Realtime в Supabase Dashboard**

  В Supabase → Database → Replication → убедиться что таблица `leads` включена в Realtime.
  Или через SQL:
  ```sql
  ALTER PUBLICATION supabase_realtime ADD TABLE leads;
  ```

- [ ] **Step 4: Тест real-time (в двух вкладках)**

  1. Открыть `Adervis LidGen.html` в вкладке 1 → войти как owner@
  2. Открыть в вкладке 2 → войти как manager@
  3. В вкладке 1 добавить лид "Real-time тест"
  4. В вкладке 2 через 1-2 секунды должен появиться toast "📥 Новый лид добавлен" и лид в таблице
  
  Ожидаем: обе вкладки синхронизированы без перезагрузки.

- [ ] **Step 5: Commit**

  ```bash
  git add "Adervis LidGen.html"
  git commit -m "feat: real-time sync via Supabase channel subscription"
  ```

---

## Task 9: Поле «assignedTo» + фильтр «Мои / Все лиды»

**Files:**
- Modify: `Adervis LidGen.html`

- [ ] **Step 1: Добавить переменную фильтра**

  В разделе с переменными (около строки ~1000), после `let leads = [];`:
  ```js
  let showOnlyMine = false;
  ```

- [ ] **Step 2: Добавить кнопку в controls bar (HTML)**

  Найти в HTML блок `.controls` (строка ~approx 730) с поиском и фильтрами. Добавить кнопку:
  ```html
  <button id="mineFilterBtn" class="btn btn-outline" onclick="toggleMineFilter()"
          aria-pressed="false" style="font-size:12px;">
      👤 Мои лиды
  </button>
  ```
  Вставить после кнопки поиска и до кнопки «Аналитика».

- [ ] **Step 3: Добавить JS функцию переключения**

  Вставить в script-блок рядом с другими filter-функциями:
  ```js
  function toggleMineFilter() {
      showOnlyMine = !showOnlyMine;
      const btn = document.getElementById('mineFilterBtn');
      if (btn) {
          btn.setAttribute('aria-pressed', String(showOnlyMine));
          btn.style.background = showOnlyMine ? 'var(--primary-subtle)' : '';
          btn.style.borderColor = showOnlyMine ? 'var(--primary-border)' : '';
          btn.style.color = showOnlyMine ? 'var(--primary2)' : '';
      }
      renderTable();
  }
  ```

- [ ] **Step 4: Применить фильтр в `renderTable()`**

  Найти в `renderTable()` место где формируется массив `filtered` (поиск по `let filtered` или `var filtered`). Добавить условие:
  ```js
  // После остальных фильтров (status, bizType, search), добавить:
  if (showOnlyMine && currentUser) {
      filtered = filtered.filter(l => l.assignedTo === currentUser.id);
  }
  ```

- [ ] **Step 5: Показать иконку назначенного в таблице**

  В `renderTable()` в HTML строки таблицы, найти колонку Actions или Name. Добавить инициалы:
  ```js
  // В рендере строки, где выводится имя:
  const assigneeHtml = lead.assignedTo && lead.assignedTo === currentUser?.id
      ? '<span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:var(--primary-subtle);font-size:9px;font-weight:700;color:var(--primary2);margin-left:4px;" aria-label="Назначен вам">Я</span>'
      : '';
  ```
  Вставить `${assigneeHtml}` рядом с именем лида в HTML строки.

- [ ] **Step 6: Проверить фильтр**

  1. Добавить лид под user1, добавить лид под user2 (через другую вкладку)
  2. Нажать «Мои лиды» — должны быть только лиды текущего пользователя
  3. Нажать снова — все лиды

- [ ] **Step 7: Commit**

  ```bash
  git add "Adervis LidGen.html"
  git commit -m "feat: assignedTo field + Mine/All filter toggle"
  ```

---

## Task 10: Миграция данных из localStorage в Supabase

**Files:**
- Modify: `Adervis LidGen.html`

- [ ] **Step 1: Добавить CSS для модали миграции**

  Добавить в CSS-секцию (не нужен отдельный CSS — использует существующие `.modal` стили).

- [ ] **Step 2: Добавить HTML для миграционного модала**

  Перед `</body>` добавить:
  ```html
  <!-- Migration Modal -->
  <div class="modal-overlay" id="migrationModal" style="z-index:9998;">
      <div class="modal" style="width:460px;" role="dialog" aria-modal="true" aria-labelledby="migTitle">
          <div class="modal-header">
              <h2 id="migTitle" style="margin:0;font-size:15px;">📦 Локальные данные найдены</h2>
          </div>
          <div class="modal-body">
              <p style="color:var(--muted);font-size:13px;margin:0 0 12px;">
                  В браузере обнаружены данные из предыдущей версии.
                  Импортировать их в облачную базу?
              </p>
              <div id="migStats" style="font-size:13px;font-weight:600;"></div>
          </div>
          <div style="display:flex;gap:8px;padding:12px 16px;border-top:1px solid var(--line);">
              <button class="btn btn-primary" onclick="runMigration()" style="flex:1;">
                  Импортировать в облако
              </button>
              <button class="btn btn-outline" onclick="skipMigration()">
                  Пропустить
              </button>
          </div>
      </div>
  </div>
  ```

- [ ] **Step 3: Добавить JS логику миграции**

  Добавить в script-блок рядом с DB helpers:

  ```js
  async function checkLocalMigration() {
      const legacyKey = 'adervis_cold_db_v3';
      const legacyData = safeParseJSON(localStorage.getItem(legacyKey), []);
      if (!legacyData || legacyData.length === 0) return;

      const statsEl = document.getElementById('migStats');
      if (statsEl) statsEl.textContent = `Найдено лидов: ${legacyData.length}`;
      document.getElementById('migrationModal').style.display = 'flex';
  }

  async function runMigration() {
      const legacyKey = 'adervis_cold_db_v3';
      const legacyLeads = safeParseJSON(localStorage.getItem(legacyKey), []);
      document.getElementById('migrationModal').style.display = 'none';

      if (!legacyLeads || legacyLeads.length === 0) return;

      showToast('Импортируем данные…');
      let imported = 0;
      // Батчи по 50 для Supabase
      for (let i = 0; i < legacyLeads.length; i += 50) {
          const batch = legacyLeads.slice(i, i + 50).map(l => {
              if (!l.id) l.id = uid();
              l.assignedTo = currentUser?.id;
              l.createdBy  = currentUser?.id;
              return leadToRow(l);
          });
          const { error } = await _sb.from('leads').upsert(batch, { onConflict: 'id' });
          if (!error) imported += batch.length;
      }

      // Удалить из localStorage после успешного импорта
      localStorage.removeItem(legacyKey);
      localStorage.removeItem('adervis_custom_scripts_v4');

      await loadLeadsFromDB();
      saveDB();
      showToast(`✓ Импортировано ${imported} лидов`);
  }

  function skipMigration() {
      document.getElementById('migrationModal').style.display = 'none';
      // Пометить что уже спрашивали
      localStorage.setItem('adervis_migration_skipped_v1', '1');
  }
  ```

- [ ] **Step 4: Вызвать `checkLocalMigration()` в `initApp()`**

  В функции `initApp()` после `checkOnboarding()` добавить:
  ```js
  const migSkipped = localStorage.getItem('adervis_migration_skipped_v1');
  if (!migSkipped) await checkLocalMigration();
  ```

- [ ] **Step 5: Smoke test миграции**

  1. Добавить тестовые данные в localStorage вручную:
     ```js
     localStorage.setItem('adervis_cold_db_v3', JSON.stringify([{id:'test-1', name:'Мигрированный лид', status:0, messages:[], updatedAt: Date.now()}]));
     ```
  2. Перезагрузить страницу → войти
  3. Должен появиться modal "Найдено лидов: 1"
  4. Нажать «Импортировать» → toast «✓ Импортировано 1 лидов»
  5. В Supabase → leads → должна быть строка «Мигрированный лид»
  6. В localStorage: `adervis_cold_db_v3` не должен существовать

- [ ] **Step 6: Commit**

  ```bash
  git add "Adervis LidGen.html"
  git commit -m "feat: data migration modal — import localStorage leads to Supabase"
  ```

---

## Task 11: PWA — manifest.json + Service Worker

**Files:**
- Create: `manifest.json`
- Create: `sw.js`
- Modify: `Adervis LidGen.html` — `<head>`

- [ ] **Step 1: Создать `manifest.json`**

  ```json
  {
    "name": "ADERVIS OTR",
    "short_name": "OTR",
    "description": "CRM для холодных продаж",
    "start_url": "/",
    "display": "standalone",
    "background_color": "#010102",
    "theme_color": "#7c3aed",
    "lang": "ru",
    "icons": [
      {
        "src": "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 192 192'><rect width='192' height='192' rx='40' fill='%237c3aed'/><text x='50%25' y='55%25' dominant-baseline='middle' text-anchor='middle' font-size='100' font-family='system-ui' fill='white'>O</text></svg>",
        "sizes": "192x192",
        "type": "image/svg+xml"
      }
    ]
  }
  ```

- [ ] **Step 2: Создать `sw.js`**

  ```js
  const CACHE = 'otr-v1';
  const OFFLINE_URL = '/';

  self.addEventListener('install', e => {
      e.waitUntil(
          caches.open(CACHE).then(c => c.addAll([OFFLINE_URL]))
      );
      self.skipWaiting();
  });

  self.addEventListener('activate', e => {
      e.waitUntil(
          caches.keys().then(keys =>
              Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
          )
      );
      self.clients.claim();
  });

  self.addEventListener('fetch', e => {
      if (e.request.mode !== 'navigate') return;
      e.respondWith(
          fetch(e.request).catch(() => caches.match(OFFLINE_URL))
      );
  });
  ```

- [ ] **Step 3: Добавить `<link rel="manifest">` в HTML `<head>`**

  Найти `<meta name="viewport"...>` и добавить после:
  ```html
  <link rel="manifest" href="manifest.json">
  <meta name="theme-color" content="#7c3aed">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  ```

- [ ] **Step 4: Зарегистрировать service worker в JS**

  В конце script-блока, после `checkSession()`:
  ```js
  if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  ```

- [ ] **Step 5: Проверить PWA через Netlify (Task 12)**

  Service Worker работает только на HTTPS или localhost. Проверить после деплоя на Netlify:
  - Chrome DevTools → Application → Service Workers → должен быть активен
  - Application → Manifest → все поля заполнены
  - Lighthouse PWA audit → installable

- [ ] **Step 6: Commit**

  ```bash
  git add manifest.json sw.js "Adervis LidGen.html"
  git commit -m "feat: PWA — manifest.json + service worker"
  ```

---

## Task 12: Деплой на Netlify

**Files:**
- Create: `netlify.toml`

- [ ] **Step 1: Создать `netlify.toml`**

  ```toml
  [build]
    publish = "."

  [[headers]]
    for = "/*"
    [headers.values]
      X-Frame-Options = "DENY"
      X-Content-Type-Options = "nosniff"
      Referrer-Policy = "strict-origin-when-cross-origin"

  [[headers]]
    for = "/sw.js"
    [headers.values]
      Cache-Control = "no-cache"
  ```

- [ ] **Step 2: Задеплоить на Netlify**

  1. Зайти на [netlify.com](https://netlify.com) → New site
  2. Drag & drop папку `c:\work\lidgen\` на Netlify
  3. Или: связать с GitHub репозиторием для auto-deploy

- [ ] **Step 3: Настроить Supabase CORS**

  В Supabase Dashboard → Authentication → URL Configuration:
  - Site URL: `https://ваш-сайт.netlify.app`
  - Redirect URLs: `https://ваш-сайт.netlify.app`

- [ ] **Step 4: Smoke test на продакшене**

  1. Открыть `https://ваш-сайт.netlify.app`
  2. Войти
  3. Добавить лид
  4. Открыть в другом браузере / устройстве → лид должен быть виден

- [ ] **Step 5: Commit**

  ```bash
  git add netlify.toml
  git commit -m "feat: Netlify config for static deployment"
  ```

---

## Self-Review — Проверка покрытия спека

**Spec requirements vs plan coverage:**

| Требование из спека | Task |
|---------------------|------|
| Supabase auth (email+password) | Task 3 |
| Экран входа | Task 2 |
| Сессия сохраняется | Task 3 (checkSession) |
| Схема БД (leads, workspaces, scripts, cta) | Task 0 |
| RLS — только свой workspace | Task 0 |
| Real-time sync | Task 8 |
| `assigned_to` поле | Task 9 |
| Фильтр «Мои / Все» | Task 9 |
| Кнопка «Выйти» | Task 3 |
| Миграция localStorage → Supabase | Task 10 |
| PWA manifest + SW | Task 11 |
| Деплой Netlify | Task 12 |

**Замечания после self-review:**
- `saveScriptsToDB()` вызывается асинхронно но `saveScripts()` — синхронная обёртка. Это OK — fire-and-forget для скриптов приемлем, ошибки логируются в console.
- Функция `switchAccount()` (локальный мультиаккаунт) станет неактуальной — пользователи разделяются через Supabase Auth, не через localStorage accounts. Эти функции можно оставить (не ломают работу) или удалить в следующей итерации.
- `updateAccountBadge()` будет показывать название workspace из Supabase — потребует небольшой адаптации в `resolveWorkspace()`: добавить `let workspaceName = ''` и fetch имени.
