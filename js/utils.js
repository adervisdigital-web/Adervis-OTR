// Pure utility functions — no external dependencies, no DOM, no Supabase
// Loaded via <script src="js/utils.js"> (no ES modules — app uses inline onclick handlers)

// Минимальная защита от HTML-инъекций при выводе пользовательских данных
function escapeHtml(str) {
    return String(str ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

// Блокирует опасные протоколы в href/src (javascript:, data:, vbscript:)
function sanitizeUrl(url) {
    if (!url) return '';
    const trimmed = String(url).trim();
    // Decode percent-encoding and strip null bytes before checking protocol
    let decoded;
    try { decoded = decodeURIComponent(trimmed.replace(/\0/g, '')); } catch(_) { decoded = trimmed; }
    const lower = decoded.replace(/[\s\0]/g, '').toLowerCase();
    if (/^(javascript|data|vbscript|blob):/i.test(lower)) return '#';
    return trimmed;
}

function safeParseJSON(str, fallback) {
    if(!str) return fallback;
    try { return JSON.parse(str); } catch(e) { return fallback; }
}

// ── Telegram-like relative time ──────────────────────────────────────────
function formatRelativeTime(ts) {
    if (!ts) return '';
    const diff = Date.now() - new Date(ts).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'только что';
    if (m < 60) return m + ' мин';
    const h = Math.floor(m / 60);
    if (h < 24) return h + ' ч';
    const d = Math.floor(h / 24);
    if (d < 7) return d + ' д';
    return new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function formatDateSep(ts) {
    const d = new Date(ts);
    const today = new Date();
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return 'Сегодня';
    if (d.toDateString() === yesterday.toDateString()) return 'Вчера';
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

function formatMsgTime(ts) {
    const d = new Date(ts);
    const now = new Date();
    const yest = new Date(now); yest.setDate(now.getDate() - 1);
    const t = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === now.toDateString()) return t;
    if (d.toDateString() === yest.toDateString()) return 'Вчера ' + t;
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace(' г.', '') + ' ' + t;
}

function normalizeUrl(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    let url = s;
    if (!/^https?:\/\//i.test(url)) {
        if (/\.[a-z]{2,}/i.test(url)) url = 'https://' + url;
        else return url;
    }
    return url.replace(/\/+$/, '');
}

function extractNameFromUrl(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    if (s.startsWith('@')) {
        return s.slice(1).replace(/[-_.]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim();
    }
    try {
        const url = s.startsWith('http') ? s : 'https://' + s;
        const pathname = new URL(url).pathname;
        const slug = pathname.split('/').filter(Boolean)[0] || '';
        if (!slug || /^\d+$/.test(slug)) return '';
        return slug.replace(/[-_]/g, ' ').replace(/[.]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim();
    } catch (e) { return ''; }
}

function detectPlatform(url) {
    try {
        const h = new URL(url).hostname.replace(/^www\.|^m\./, '');
        if (h === 'vk.com') return 'vk';
        if (h === 'instagram.com' || h === 'instagr.am') return 'inst';
        if (h === 't.me' || h === 'telegram.me' || h === 'telegram.org') return 'tg';
    } catch(e) {}
    return '';
}

function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return String(Date.now()) + '-' + Math.random().toString(16).slice(2);
}

function debounce(fn, ms) {
    let t;
    return function() {
        const args = arguments;
        clearTimeout(t);
        t = setTimeout(function() { fn.apply(null, args); }, ms);
    };
}

function isMobile() {
    return window.innerWidth <= 768;
}

function calcPipelinePotential(leadsArr) {
    var active = leadsArr.filter(function(l) { return [1, 2, 3].includes(l.status); });
    var total = active.reduce(function(sum, l) { return sum + (l.dealBudget || l.deal_budget || 55000); }, 0);
    return { count: active.length, total: total };
}

function countTodayMessages(allLeads) {
    var startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    var startMs = startOfDay.getTime();
    var count = 0;
    for (var _i = 0; _i < allLeads.length; _i++) {
        var _msgs = allLeads[_i].messages || [];
        for (var _j = 0; _j < _msgs.length; _j++) {
            if (!_msgs[_j].fromClient && (_msgs[_j].date || 0) >= startMs) count++;
        }
    }
    return count;
}

function countTodayVkMessages(allLeads) {
    var startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    var startMs = startOfDay.getTime();
    var count = 0;
    for (var _i = 0; _i < allLeads.length; _i++) {
        var lead = allLeads[_i];
        if (!lead.vkPeerId) continue;
        var _msgs = lead.messages || [];
        for (var _j = 0; _j < _msgs.length; _j++) {
            if (!_msgs[_j].fromClient && (_msgs[_j].date || 0) >= startMs) count++;
        }
    }
    return count;
}

function calcAvgResponseTime(messages) {
    if (!messages || messages.length < 2) return null;
    const pairs = [];
    for (let i = 1; i < messages.length; i++) {
        if (messages[i].fromClient && !messages[i - 1].fromClient) {
            const diff = (messages[i].date || 0) - (messages[i - 1].date || 0);
            if (diff > 0 && diff < 7 * 24 * 3600 * 1000) pairs.push(diff);
        }
    }
    if (pairs.length === 0) return null;
    const avgMs = pairs.reduce((a, b) => a + b, 0) / pairs.length;
    const h = Math.floor(avgMs / 3600000);
    const m = Math.floor((avgMs % 3600000) / 60000);
    return { avgMs, label: h > 0 ? `${h}ч ${m}м` : `${m}м`, cold: avgMs > 48 * 3600000 };
}
