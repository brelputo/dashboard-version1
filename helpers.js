/* HELPERS: small tools used everywhere (money format, dates, toast messages, theme and glass switch).
   Part of the Financial Movement Dashboard. Plain script (not a module): functions here are shared with the other js files. */

    // ==========================================
    // GLASS EFFECTS SWITCH (blur, moving glow, hover lift): remembered in this browser
    // ==========================================
    function applyFx(on) {
        document.documentElement.classList.toggle('fx-off', !on);
        const t = document.getElementById('fx-toggle');
        if (t) t.checked = !!on;
    }

    function setFx(on) {
        applyFx(on);
        try { localStorage.setItem('dashboard_fx', on ? 'on' : 'off'); } catch (_) { /* storage unavailable */ }
        showToast(on ? 'Glass effects on' : 'Glass effects off · lighter and faster');
    }

    function toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('dashboard_theme', newTheme);
        updateThemeToggleButton(newTheme);
        showToast(`Switched to ${newTheme} mode`);
    }

    function updateThemeToggleButton(theme) {
        const btn = document.getElementById('theme-toggle-btn');
        if (btn) {
            btn.innerHTML = theme === 'dark' ? '☀️' : '🌙';
            btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode');
        }
    }

    function getMonthKeysOrderForYear(yr) {
        return rawMonthNames.map(m => m + yr);
    }

    function ensureYearDatasetsExist(yr) {
        rawMonthNames.forEach((m, idx) => {
            let mKey = m + yr;
            if (!datasets[mKey]) {
                let fullMonthTitle = m.charAt(0).toUpperCase() + m.slice(1) + " " + yr;
                let monthNumStr = String(idx + 1).padStart(2, '0');
                datasets[mKey] = {
                    title: fullMonthTitle,
                    data: [{ date: `01/${monthNumStr}/${yr}`, desc: idx === 0 ? "Starting Balance" : "Previous Period Balance", cost: "", creditCat: "Starting Balance", type: "", credit: 1000.00, debit: 0, method: "Previous Balance", paid: "YES" }]
                };
            }
        });
    }

    function fmt(n) { return moneyFmt.format(Number(n) || 0); }

    function esc(v) {
        return String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    }

    function isRolloverTx(t) {
        const d = (t.desc || '').toLowerCase();
        return d.includes('previous period') || d.includes('starting balance') || t.method === 'Previous Balance';
    }

    function startOfToday() { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }
    function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
    function daysBetween(a, b) { return Math.round((b - a) / 86400000); }
    function monthKeyOfDate(d) { return rawMonthNames[d.getMonth()] + d.getFullYear(); }
    function parseTxDate(str) {
        const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(str || '').trim());
        if (!m) return null;
        const d = new Date(+m[3], +m[2] - 1, +m[1]);
        return isNaN(d) ? null : d;
    }
    function parseIso(str) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(str || ''));
        if (!m) return null;
        const d = new Date(+m[1], +m[2] - 1, +m[3]);
        return isNaN(d) ? null : d;
    }
    function isoDate(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
    function fmtDay(d) { return d.getDate() + ' ' + SHORT_MONTHS[d.getMonth()]; }
    function fmtDayLong(d) { return SHORT_DAYS[d.getDay()] + ' ' + fmtDay(d); }
    function relDays(n) { return n <= 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`; }
    function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
    function signedMoney(v) { return (v < 0 ? '−' : '+') + fmt(Math.abs(v)); }

    function median(arr) {
        const a = [...arr].sort((x, y) => x - y);
        const m = Math.floor(a.length / 2);
        return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
    }

    function ovParseKey(key) {
        const m = /^([a-z]+)(\d{4})$/.exec(key || '');
        if (!m) return null;
        const idx = rawMonthNames.indexOf(m[1]);
        return idx < 0 ? null : { idx, year: parseInt(m[2], 10) };
    }
    function ovShiftKey(key, delta) {
        const p = ovParseKey(key);
        if (!p) return null;
        const total = p.year * 12 + p.idx + delta;
        return rawMonthNames[((total % 12) + 12) % 12] + Math.floor(total / 12);
    }
    function ovMonthTotals(key) {
        const ds = datasets[key];
        if (!ds || !Array.isArray(ds.data)) return null;
        let income = 0, expenses = 0;
        ds.data.forEach(t => {
            const c = parseFloat(t.credit) || 0, d = parseFloat(t.debit) || 0;
            if (c > 0 && !isRolloverTx(t)) income += c;
            if (d > 0) expenses += d;
        });
        return { income, expenses };
    }
    function ovNiceMax(v) {
        if (!(v > 0)) return 100;
        const p = Math.pow(10, Math.floor(Math.log10(v)));
        const n = v / p;
        const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
        return m * p;
    }
    function ovPct(cur, prev) { return prev ? ((cur - prev) / Math.abs(prev)) * 100 : null; }
    function ovFmtPct(p) { return (p >= 0 ? '+' : '') + p.toFixed(1) + '%'; }
    function monthLabelOfKey(key) {
        const p = ovParseKey(key);
        return p ? rawMonthNames[p.idx].charAt(0).toUpperCase() + rawMonthNames[p.idx].slice(1) + ' ' + p.year : '';
    }
    function toastHasAction() {
        const t = document.getElementById('toast');
        return !!t && String(t.className).includes('has-action');
    }
    // Ledger money boxes: the $ appears automatically as you type, and only numbers are kept
    function parseMoney(s) { return parseFloat(String(s == null ? '' : s).replace(/[^0-9.]/g, '')) || 0; }
    function moneyInput(el) {
        let v = String(el.value).replace(/[^0-9.]/g, '');
        const i = v.indexOf('.');
        if (i !== -1) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, '').slice(0, 2);
        const out = v ? '$' + v : '';
        if (el.value !== out) el.value = out;
    }
    function moneyBlur(el) {
        const n = parseMoney(el.value);
        el.value = n > 0 ? '$' + n.toFixed(2) : '';
    }
    function closeOptionsDropdown() {
        const d = document.getElementById('options-dropdown');
        if (d) d.classList.remove('show');
    }
    function toggleDropdown(event) {
        event.stopPropagation();
        document.getElementById('options-dropdown').classList.toggle('show');
    }
    function setSyncStatus(state) {
        const dot = document.getElementById('sync-status');
        if (!dot) return;
        dot.className = 'sync-status' + (state ? ' ' + state : '');
        const btn = document.getElementById('sync-btn');
        if (btn) btn.title = state === 'saving' ? 'Saving…' : state === 'error' ? 'Save failed — click to retry sync' : 'Synced';
        clearTimeout(quietSaveTimer);
        if (state === 'saving') return;
        if (state === 'error') quietSaveTimer = setTimeout(() => setSyncStatus(''), 8000);
        else quietSaveTimer = setTimeout(() => setSyncStatus(''), 15000);
    }

    function showToast(message, isError = false, action = null) {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        if (action) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'toast-action';
            btn.textContent = action.label;
            btn.onclick = () => { clearTimeout(toastTimer); toast.className = ''; action.fn(); };
            toast.appendChild(btn);
        }
        toast.style.background = isError ? 'var(--danger)' : '#10b981';
        toast.className = 'show' + (action ? ' has-action' : '');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { toast.className = ''; }, action ? 8000 : (isError ? 4500 : 2000));
    }

    function togglePasswordVisibility(inputId) {
        const pwdInput = document.getElementById(inputId || 'master-pwd');
        const eyeIcon = pwdInput.parentElement.querySelector('svg');
        if (pwdInput.type === 'password') {
            pwdInput.type = 'text';
            if (eyeIcon) eyeIcon.innerHTML = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>';
        } else {
            pwdInput.type = 'password';
            if (eyeIcon) eyeIcon.innerHTML = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>';
        }
    }

    function getCurrentYearString() {
        const y = new Date().getFullYear().toString();
        return allYears.includes(y) ? y : "2026";
    }

    function toISOFormat(dateStr) {
        if (!dateStr) return '';
        const parts = dateStr.split('/');
        if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
        return dateStr;
    }

    function toAUFormat(isoDateStr) {
        if (!isoDateStr) return '';
        const parts = isoDateStr.split('-');
        if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
        return isoDateStr;
    }

    function getDefaultDateString(monthKey) {
        const now = new Date();
        const todayDay = String(now.getDate()).padStart(2, '0');
        const todayMonth = String(now.getMonth() + 1).padStart(2, '0');
        const todayYear = now.getFullYear().toString();
        let monthKeys = getMonthKeysOrderForYear(selectedYear);
        const currentActiveMonthNum = String(monthKeys.indexOf(monthKey) + 1).padStart(2, '0');
        if (todayYear === selectedYear && todayMonth === currentActiveMonthNum) {
            return `${todayDay}/${todayMonth}/${todayYear}`;
        }
        return `01/${currentActiveMonthNum}/${selectedYear}`;
    }

    function parseDateString(dateStr) {
        if (!dateStr) return new Date(0);
        const parts = dateStr.split('/');
        if (parts.length === 3) {
            const day = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10) - 1;
            const year = parseInt(parts[2], 10);
            return new Date(year, month, day);
        }
        const parsed = Date.parse(dateStr);
        return isNaN(parsed) ? new Date(0) : new Date(parsed);
    }
