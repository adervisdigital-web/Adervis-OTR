# Playbook-цепочки — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Автоматически планировать follow-up касания — менеджер отправил сообщение → система ставит `remindAt` на следующий шаг playbook.

**Architecture:** Один глобальный Playbook хранится в `workspace_settings.playbook_config` (JSONB). Прогресс лида — колонка `playbook_step INTEGER` в `leads`. `advancePlaybookStep()` вызывается внутри `submitChatInput()` при каждой отправке менеджера.

**Tech Stack:** Vanilla JS, Supabase (SQL + upsert), index.html (~4080 строк)

---

## Файлы, которые затрагиваются

| Файл | Что меняется |
|---|---|
| `supabase/migrations/20260616000000_playbook.sql` | CREATE — новая миграция |
| `index.html:1207` | Добавить глобал `let playbookConfig = null;` |
| `index.html:1766–1783` | `leadToRow()` — добавить `playbook_step` |
| `index.html:1786–1802` | `rowToLead()` — добавить `playbookStep` |
| `index.html:888` | HTML новой формы лида — добавить чекбокс Playbook |
| `index.html:2155–2187` | `addLead()` — вызов `enrollInPlaybook` |
| `index.html:2836–2875` | `submitChatInput()` — вызов `advancePlaybookStep` |
| `index.html:1672–1698` | `renderChatHeader()` — playbook badge |
| `index.html:1140–1201` | Settings modal HTML — раздел Playbook |
| `index.html:3838–3916` | `renderDrawerBody()` — playbook кнопка |
| `index.html:4014–4032` | `initApp()` — вызов `loadPlaybookConfig` |

---

## Task 1: SQL миграция

**Files:**
- Create: `supabase/migrations/20260616000000_playbook.sql`

- [ ] **Step 1: Создать файл миграции**

```sql
-- supabase/migrations/20260616000000_playbook.sql

-- Добавить playbook_step к лидам
ALTER TABLE leads ADD COLUMN IF NOT EXISTS playbook_step INTEGER DEFAULT NULL;

-- Добавить playbook_config к workspace_settings
ALTER TABLE workspace_settings ADD COLUMN IF NOT EXISTS playbook_config JSONB DEFAULT NULL;
```

- [ ] **Step 2: Применить миграцию в Supabase**

Открыть Supabase Dashboard → SQL Editor → вставить содержимое файла → Run.

Ожидаемый результат: `Success. No rows returned`

- [ ] **Step 3: Проверить схему**

В Supabase → Table Editor → `leads`: убедиться что колонка `playbook_step` появилась.
В `workspace_settings`: убедиться что `playbook_config` появилась.

- [ ] **Step 4: Коммит**

```bash
git add supabase/migrations/20260616000000_playbook.sql
git commit -m "feat: add playbook_step to leads + playbook_config to workspace_settings"
```

---

## Task 2: Data layer — leadToRow / rowToLead / globals / config functions

**Files:**
- Modify: `index.html:1207` (глобальный var)
- Modify: `index.html:1766–1783` (`leadToRow`)
- Modify: `index.html:1786–1802` (`rowToLead`)
- Add: после `saveVkSettings()` (~line 3126) — функции `getPlaybookConfig`, `loadPlaybookConfig`, `savePlaybookConfig`

- [ ] **Step 1: Добавить глобальный `playbookConfig` (index.html:1207)**

Найти строку:
```javascript
let vkSettings = { token: '', communityId: '', secret: '', confirmationString: '' };
```

Добавить после неё:
```javascript
let playbookConfig = null;
```

- [ ] **Step 2: Обновить `leadToRow` (index.html:1782 — последняя строка возврата)**

Найти:
```javascript
            vk_peer_id:    lead.vkPeerId    != null ? Number(lead.vkPeerId) : null
        };
    }
```

Заменить на:
```javascript
            vk_peer_id:    lead.vkPeerId    != null ? Number(lead.vkPeerId) : null,
            playbook_step: lead.playbookStep ?? null
        };
    }
```

- [ ] **Step 3: Обновить `rowToLead` (index.html:1801 — последняя строка возврата)**

Найти:
```javascript
            vkPeerId:     row.vk_peer_id != null ? Number(row.vk_peer_id) : null
        };
    }
```

Заменить на:
```javascript
            vkPeerId:     row.vk_peer_id != null ? Number(row.vk_peer_id) : null,
            playbookStep: row.playbook_step ?? null
        };
    }
```

- [ ] **Step 4: Добавить функции config после `saveVkSettings` (~line 3126)**

Найти строку:
```javascript
        async function checkVkConnection() {
```

Вставить перед ней:
```javascript
        function getPlaybookConfig() {
            if (playbookConfig && Array.isArray(playbookConfig.steps)) return playbookConfig;
            return {
                steps: [
                    { step: 1, name: 'Ледокол', daysAfter: 0 },
                    { step: 2, name: 'Дожим',   daysAfter: 2 },
                    { step: 3, name: 'Финал',   daysAfter: 3 }
                ]
            };
        }

        async function loadPlaybookConfig() {
            if (!workspaceId) return;
            const { data } = await _sb
                .from('workspace_settings')
                .select('playbook_config')
                .eq('workspace_id', workspaceId)
                .maybeSingle();
            if (data && data.playbook_config) playbookConfig = data.playbook_config;
        }

        async function savePlaybookConfig(steps) {
            if (!workspaceId) return;
            const config = { steps };
            const { error } = await _sb.from('workspace_settings').upsert({
                workspace_id:    workspaceId,
                playbook_config: config,
                updated_at:      Date.now()
            }, { onConflict: 'workspace_id' });
            if (error) { showToast('Ошибка сохранения: ' + error.message, 4000); return; }
            playbookConfig = config;
            showToast('Playbook сохранён ✓');
        }

```

- [ ] **Step 5: Верификация**

Открыть `index.html` в браузере → открыть DevTools Console → выполнить:
```javascript
console.log(getPlaybookConfig());
```
Ожидаемый результат: `{steps: [{step:1, name:'Ледокол', daysAfter:0}, ...]}` — дефолт из 3 шагов.

- [ ] **Step 6: Коммит**

```bash
git add index.html
git commit -m "feat: playbook data layer — leadToRow/rowToLead/getPlaybookConfig/load/save"
```

---

## Task 3: Core logic — enrollInPlaybook / advancePlaybookStep / exitPlaybook

**Files:**
- Modify: `index.html` — добавить 3 функции после `savePlaybookConfig`

- [ ] **Step 1: Добавить `enrollInPlaybook`, `advancePlaybookStep`, `exitPlaybook`**

Найти строку:
```javascript
        async function checkVkConnection() {
```

Вставить перед ней (ПОСЛЕ блока с `savePlaybookConfig`):
```javascript
        async function enrollInPlaybook(leadId) {
            const config = getPlaybookConfig();
            if (!config.steps.length) { showToast('Playbook не настроен'); return; }
            const lead = leads.find(function(l) { return String(l.id) === String(leadId); });
            if (!lead) return;
            const d = new Date();
            d.setDate(d.getDate() + (config.steps[0].daysAfter || 0));
            lead.playbookStep = 1;
            lead.remindAt = d.toISOString().slice(0, 10);
            lead.updatedAt = Date.now();
            upsertLead(lead);
            renderTgSidebar(currentChatLeadId);
            if (String(currentChatLeadId) === String(lead.id)) renderChatHeader(lead);
        }

        async function advancePlaybookStep(leadId) {
            const lead = leads.find(function(l) { return String(l.id) === String(leadId); });
            if (!lead || lead.playbookStep == null) return;
            const config = getPlaybookConfig();
            const nextStep = lead.playbookStep + 1;
            if (nextStep > config.steps.length) {
                lead.playbookStep = null;
            } else {
                const stepConfig = config.steps[nextStep - 1];
                lead.playbookStep = nextStep;
                const d = new Date();
                d.setDate(d.getDate() + (stepConfig.daysAfter || 0));
                lead.remindAt = d.toISOString().slice(0, 10);
            }
            lead.updatedAt = Date.now();
            upsertLead(lead);
            if (String(currentChatLeadId) === String(lead.id)) renderChatHeader(lead);
        }

        async function exitPlaybook(leadId) {
            const lead = leads.find(function(l) { return String(l.id) === String(leadId); });
            if (!lead) return;
            lead.playbookStep = null;
            lead.updatedAt = Date.now();
            upsertLead(lead);
            renderTgSidebar(currentChatLeadId);
            if (String(currentChatLeadId) === String(lead.id)) renderChatHeader(lead);
        }

```

- [ ] **Step 2: Верификация в консоли**

В DevTools Console (после входа в приложение) выполнить с ID существующего лида:
```javascript
const lead = leads[0];
console.log('before:', lead.playbookStep, lead.remindAt);
await enrollInPlaybook(lead.id);
console.log('after enroll:', lead.playbookStep, lead.remindAt);
await advancePlaybookStep(lead.id);
console.log('after advance:', lead.playbookStep, lead.remindAt);
await exitPlaybook(lead.id);
console.log('after exit:', lead.playbookStep);
```

Ожидаемый результат:
```
before: null  null
after enroll: 1  "2026-06-16"  (или дата сегодня)
after advance: 2  "2026-06-18"  (+2 дня)
after exit: null
```

- [ ] **Step 3: Коммит**

```bash
git add index.html
git commit -m "feat: enrollInPlaybook / advancePlaybookStep / exitPlaybook"
```

---

## Task 4: Hook advancePlaybookStep в submitChatInput

**Files:**
- Modify: `index.html:2836–2875` (`submitChatInput`)

- [ ] **Step 1: Добавить вызов `advancePlaybookStep` в `submitChatInput`**

Найти в `submitChatInput` (строка ~2874) закрывающую скобку блока `if (fromClient)`:
```javascript
            }).catch(function() {
                    const lb = document.getElementById(loadBadgeId);
                    if (lb) lb.remove();
                });
            }
        }
```

Заменить на:
```javascript
            }).catch(function() {
                    const lb = document.getElementById(loadBadgeId);
                    if (lb) lb.remove();
                });
            }
            if (!fromClient) advancePlaybookStep(leadId);
        }
```

- [ ] **Step 2: Верификация**

1. Открыть приложение в браузере
2. Выбрать любой лид в TG-view
3. В DevTools Console: `await enrollInPlaybook(currentChatLeadId)`
4. Ввести сообщение в поле "Я написал" → нажать "Отправить"
5. Проверить в DevTools: `leads.find(l => String(l.id) === String(currentChatLeadId)).playbookStep` → должен стать `2`
6. Проверить `remindAt` → должна стать дата +2 дня

- [ ] **Step 3: Коммит**

```bash
git add index.html
git commit -m "feat: auto-advance playbook step on manager message"
```

---

## Task 5: Новый лид — чекбокс "Playbook"

**Files:**
- Modify: `index.html:888` (HTML формы)
- Modify: `index.html:2155–2187` (`addLead()`)

- [ ] **Step 1: Добавить чекбокс в HTML формы (line 888)**

Найти:
```html
        <button class="btn btn-success" onclick="addLead()">+ Добавить</button>
    </div>
```

Заменить на:
```html
        <label style="display:flex;align-items:center;gap:4px;font-size:12px;color:var(--muted);flex-shrink:0;cursor:pointer;white-space:nowrap;">
            <input type="checkbox" id="newLeadPlaybook" checked style="cursor:pointer;"> Playbook
        </label>
        <button class="btn btn-success" onclick="addLead()">+ Добавить</button>
    </div>
```

- [ ] **Step 2: Обновить `addLead()` — вызов enrollInPlaybook (line 2185)**

Найти:
```javascript
            upsertLead(newLead);
            saveDB();
        }
```

Заменить на:
```javascript
            upsertLead(newLead);
            saveDB();
            const pbCheck = document.getElementById('newLeadPlaybook');
            if (pbCheck && pbCheck.checked) enrollInPlaybook(newLead.id);
        }
```

- [ ] **Step 3: Верификация**

1. В браузере: заполнить форму "Новый лид" с чекбоксом Playbook ✓ → нажать "+ Добавить"
2. Найти новый лид в Supabase → Table Editor → `leads`: `playbook_step` = `1`, `remind_at` = сегодня
3. Убедиться что лид попал в секцию 🔥 в TG-view (так как `remindAt = сегодня`)
4. Снять чекбокс Playbook → добавить ещё один лид → убедиться `playbook_step = null`

- [ ] **Step 4: Коммит**

```bash
git add index.html
git commit -m "feat: auto-enroll new leads in playbook via checkbox"
```

---

## Task 6: Chat header — playbook badge

**Files:**
- Modify: `index.html:1672–1698` (`renderChatHeader`)

- [ ] **Step 1: Добавить playbook badge в `renderChatHeader`**

Найти в `renderChatHeader` блок с платформой и bizType:
```javascript
            (lead.bizType ? '<span style="background:rgba(255,255,255,.05);border:1px solid var(--line);color:var(--muted);border-radius:4px;padding:2px 7px;font-size:11px;flex-shrink:0;">' + escapeHtml(lead.bizType) + '</span>' : '') +
            '<div class="chat-status-drop">' +
```

Заменить на:
```javascript
            (lead.bizType ? '<span style="background:rgba(255,255,255,.05);border:1px solid var(--line);color:var(--muted);border-radius:4px;padding:2px 7px;font-size:11px;flex-shrink:0;">' + escapeHtml(lead.bizType) + '</span>' : '') +
            (function() {
                if (lead.playbookStep == null) return '';
                const cfg = getPlaybookConfig();
                const stepName = cfg.steps[lead.playbookStep - 1] ? cfg.steps[lead.playbookStep - 1].name : '';
                const total = cfg.steps.length;
                return '<span style="display:inline-flex;align-items:center;gap:4px;background:rgba(108,0,255,.12);border:1px solid rgba(108,0,255,.35);color:#a78bfa;border-radius:4px;padding:2px 8px;font-size:11px;flex-shrink:0;">' +
                    '⚙ Шаг ' + lead.playbookStep + '/' + total + ': ' + escapeHtml(stepName) +
                    '<button onclick="exitPlaybook(\'' + escapeHtml(String(lead.id)) + '\')" style="background:none;border:none;color:#a78bfa;cursor:pointer;font-size:12px;padding:0 0 0 4px;line-height:1;" aria-label="Выйти из Playbook">✕</button>' +
                '</span>';
            })() +
            '<div class="chat-status-drop">' +
```

- [ ] **Step 2: Верификация**

1. В браузере: открыть лид с `playbookStep = 1` (из Task 5)
2. В чат-хедере должен появиться фиолетовый бейдж "⚙ Шаг 1/3: Ледокол ✕"
3. Нажать ✕ → бейдж исчезает, `lead.playbookStep` → `null`
4. Для лида без playbook: бейдж не отображается

- [ ] **Step 3: Коммит**

```bash
git add index.html
git commit -m "feat: playbook step badge in chat header with exit button"
```

---

## Task 7: Lead drawer — кнопка Playbook

**Files:**
- Modify: `index.html:3838–3916` (`renderDrawerBody`)

- [ ] **Step 1: Добавить playbook-кнопку в `renderDrawerBody`**

Найти в `renderDrawerBody` блок с напоминанием:
```javascript
                <div class="drawer-field">
                    <label class="drawer-field-label" for="drawerRemind"><span aria-hidden="true">📅</span> Перезвонить</label>
                    <input type="date" id="drawerRemind" value="${escapeHtml(lead.remindAt || '')}" style="width:100%;color-scheme:dark;">
                </div>
                <div class="drawer-field">
                    <label class="drawer-field-label" for="drawerNotes">Заметки</label>
```

Заменить на:
```javascript
                <div class="drawer-field">
                    <label class="drawer-field-label" for="drawerRemind"><span aria-hidden="true">📅</span> Перезвонить</label>
                    <input type="date" id="drawerRemind" value="${escapeHtml(lead.remindAt || '')}" style="width:100%;color-scheme:dark;">
                </div>
                <div class="drawer-field">
                    ${(function() {
                        const cfg = getPlaybookConfig();
                        if (lead.playbookStep != null) {
                            const stepName = cfg.steps[lead.playbookStep - 1] ? cfg.steps[lead.playbookStep - 1].name : '';
                            return '<button class="btn btn-outline" style="width:100%;font-size:12px;text-align:left;" ' +
                                'onclick="exitPlaybook(\'' + safeId + '\');renderDrawerBody(leads.find(function(l){return String(l.id)===\'' + safeId + '\';}))">' +
                                '⚙ Playbook: Шаг ' + lead.playbookStep + '/' + cfg.steps.length + ' — ' + escapeHtml(stepName) + ' · Выйти</button>';
                        }
                        return '<button class="btn btn-outline" style="width:100%;font-size:12px;" ' +
                            'onclick="enrollInPlaybook(\'' + safeId + '\');renderDrawerBody(leads.find(function(l){return String(l.id)===\'' + safeId + '\';}))">' +
                            '▶ Подключить к Playbook</button>';
                    })()}
                </div>
                <div class="drawer-field">
                    <label class="drawer-field-label" for="drawerNotes">Заметки</label>
```

- [ ] **Step 2: Верификация**

1. Открыть Lead Drawer (иконка карандаша или клик на лид в таблице)
2. Для лида без playbook: кнопка "▶ Подключить к Playbook"
3. Нажать → кнопка меняется на "⚙ Playbook: Шаг 1/3 — Ледокол · Выйти"
4. Нажать "Выйти" → возвращается "▶ Подключить"

- [ ] **Step 3: Коммит**

```bash
git add index.html
git commit -m "feat: playbook enroll/exit button in lead drawer"
```

---

## Task 8: Settings — раздел Playbook (HTML + JS)

**Files:**
- Modify: `index.html:1193–1198` (settings modal HTML)
- Add: JS функции `renderPlaybookEditor`, `addPlaybookStep`, `removePlaybookStep`, `savePlaybookFromEditor`
- Modify: `index.html:3496` (`openSettingsModal`)

- [ ] **Step 1: Добавить HTML секцию Playbook в Settings modal**

Найти:
```html
            <div class="action-buttons" style="margin-top: 20px; border-top: 1px solid var(--border); padding-top: 15px;">
                    <button class="btn btn-outline" onclick="addTemplateOption()">+ Добавить шаблон</button>
                    <button class="btn btn-danger" onclick="resetScriptsToDefault()">Сбросить до стандартных</button>
                    <button class="btn btn-success" onclick="closeModal('settingsModal')">Готово</button>
                </div>
```

Добавить ПЕРЕД этим блоком:
```html
            <div id="playbookSection" style="margin-top:15px;border-top:1px solid var(--border);padding-top:15px;">
                <div style="font-weight:700;margin-bottom:10px;font-size:13px;">⚙ Playbook-цепочка</div>
                <div style="font-size:11px;color:var(--muted);margin-bottom:10px;">Менеджер отправил → система ставит напоминание на следующий шаг</div>
                <div id="playbookStepsEditor" style="display:flex;flex-direction:column;gap:8px;margin-bottom:10px;"></div>
                <div style="display:flex;gap:8px;">
                    <button class="btn btn-outline" style="flex:1;" onclick="addPlaybookStep()">+ Добавить шаг</button>
                    <button class="btn btn-success" style="flex:1;" onclick="savePlaybookFromEditor()">💾 Сохранить</button>
                </div>
            </div>
```

- [ ] **Step 2: Добавить JS функции редактора Playbook**

Найти:
```javascript
        function openSettingsModal() {
            document.getElementById('settingsModal').style.display = 'flex';
```

Вставить ПЕРЕД ней:
```javascript
        function renderPlaybookEditor() {
            const container = document.getElementById('playbookStepsEditor');
            if (!container) return;
            const config = getPlaybookConfig();
            container.innerHTML = config.steps.map(function(s, i) {
                return '<div style="display:flex;align-items:center;gap:6px;">' +
                    '<span style="font-size:11px;color:var(--muted);width:44px;flex-shrink:0;">Шаг ' + (i + 1) + '</span>' +
                    '<input type="text" value="' + escapeHtml(s.name) + '" placeholder="Название" style="flex:1;font-size:12px;" data-pb-name="' + i + '">' +
                    '<span style="font-size:11px;color:var(--muted);white-space:nowrap;flex-shrink:0;">через</span>' +
                    '<input type="number" value="' + (s.daysAfter || 0) + '" min="0" max="30" style="width:48px;font-size:12px;" data-pb-days="' + i + '">' +
                    '<span style="font-size:11px;color:var(--muted);flex-shrink:0;">дн.</span>' +
                    '<button style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:14px;padding:2px 6px;line-height:1;" ' +
                        'onclick="removePlaybookStep(' + i + ')" aria-label="Удалить шаг ' + (i+1) + '">✕</button>' +
                '</div>';
            }).join('');
        }

        function addPlaybookStep() {
            const config = getPlaybookConfig();
            config.steps.push({ step: config.steps.length + 1, name: 'Новый шаг', daysAfter: 2 });
            playbookConfig = config;
            renderPlaybookEditor();
        }

        function removePlaybookStep(index) {
            const config = getPlaybookConfig();
            config.steps.splice(index, 1);
            config.steps.forEach(function(s, i) { s.step = i + 1; });
            playbookConfig = config;
            renderPlaybookEditor();
        }

        async function savePlaybookFromEditor() {
            const nameInputs = document.querySelectorAll('[data-pb-name]');
            const daysInputs = document.querySelectorAll('[data-pb-days]');
            const steps = [];
            nameInputs.forEach(function(el, i) {
                steps.push({
                    step: i + 1,
                    name: (el.value || '').trim() || ('Шаг ' + (i + 1)),
                    daysAfter: Math.max(0, parseInt((daysInputs[i] || {}).value, 10) || 0)
                });
            });
            await savePlaybookConfig(steps);
            renderPlaybookEditor();
        }

```

- [ ] **Step 3: Вызвать `renderPlaybookEditor` в `openSettingsModal`**

Найти:
```javascript
        function openSettingsModal() {
            document.getElementById('settingsModal').style.display = 'flex';
```

Добавить вызов после строки с `display = 'flex'`:
```javascript
        function openSettingsModal() {
            document.getElementById('settingsModal').style.display = 'flex';
            renderPlaybookEditor();
```

- [ ] **Step 4: Верификация**

1. Открыть ⚙️ Настройки
2. Прокрутить вниз — должна появиться секция "⚙ Playbook-цепочка" с 3 шагами
3. Изменить название "Дожим" → "Дожим v2" → нажать "💾 Сохранить"
4. Toast "Playbook сохранён ✓"
5. Закрыть и открыть настройки снова → изменение сохранилось
6. Нажать "+ Добавить шаг" → появился "Новый шаг [2 дн.]"
7. Нажать ✕ у шага → шаг удалился

- [ ] **Step 5: Коммит**

```bash
git add index.html
git commit -m "feat: playbook settings editor — add/remove/save steps"
```

---

## Task 9: Init — загрузить playbook config при старте

**Files:**
- Modify: `index.html:4014–4032` (`initApp`)

- [ ] **Step 1: Добавить `loadPlaybookConfig()` в `initApp`**

Найти:
```javascript
            await loadVkSettings();
```

Заменить на:
```javascript
            await loadVkSettings();
            await loadPlaybookConfig();
```

- [ ] **Step 2: Верификация**

1. Перезагрузить страницу приложения
2. В DevTools Console: `console.log(playbookConfig)`
3. Если Playbook был настроен и сохранён в Task 8 → в консоли выведется сохранённый конфиг
4. Если не был сохранён → `null` (дефолт из `getPlaybookConfig()` применится при обращении)

- [ ] **Step 3: Финальный smoke-test**

1. Зайти в приложение
2. Добавить нового лида с чекбоксом Playbook ✓ → он появился в 🔥 (remindAt = сегодня)
3. Открыть лида → в хедере видно "⚙ Шаг 1/3: Ледокол ✕"
4. Написать сообщение → нажать "Отправить" → бейдж поменялся на "Шаг 2/3: Дожим", remindAt +2 дня
5. Написать ещё одно сообщение → "Шаг 3/3: Финал", remindAt +3 дня
6. Написать ещё раз → бейдж исчез (playbookStep = null, Playbook завершён)
7. В Lead Drawer: кнопка "▶ Подключить к Playbook" снова активна

- [ ] **Step 4: Коммит**

```bash
git add index.html
git commit -m "feat: load playbook config on app init"
```

---

## Spec Coverage Check

| Требование из спека | Задача |
|---|---|
| SQL миграция `playbook_step` + `playbook_config` | Task 1 |
| `getPlaybookConfig()` с дефолтом | Task 2 |
| `enrollInPlaybook()` | Task 3 |
| `advancePlaybookStep()` | Task 3 |
| `exitPlaybook()` | Task 3 |
| Вызов advance в `submitChatInput` | Task 4 |
| Чекбокс Playbook при добавлении лида | Task 5 |
| Бейдж в чат-хедере | Task 6 |
| Кнопка в Lead Drawer | Task 7 |
| Settings редактор шагов | Task 8 |
| Загрузка при старте | Task 9 |
| Edge: пустой playbook → toast | Task 3 (enrollInPlaybook) |
| Edge: последний шаг → playbookStep = null | Task 3 (advancePlaybookStep) |
