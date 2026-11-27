window.__build = window.__build || {}; window.__build['helpers.js'] = '2026-11-27-financial-audit-2';
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
                    data: [{ date: `01/${monthNumStr}/${yr}`, desc: idx === 0 ? "Starting Balance" : "Previous Period Balance", cost: "", creditCat: "Starting Balance", type: "", credit: 0, debit: 0, method: "Previous Balance", paid: "YES" }]
                };
            }
        });
    }

    // Canonical money/status helpers. Accumulate monetary totals in integer cents.
    function moneyCents(value) { const n = Number(typeof value === 'string' ? value.replace(/[$,\s]/g, '') : value); return Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 100) : 0; }
    function centsMoney(cents) { return (Number(cents) || 0) / 100; }
    function txIsPaid(tx) { return String(tx && tx.paid != null ? tx.paid : 'NO').trim().toLowerCase() === 'yes'; }
    function txAmountCents(tx, field) { return moneyCents(tx && tx[field]); }
    function yearHasFinancialActivity(year) {
        return getMonthKeysOrderForYear(String(year)).some(k => (datasets[k] && datasets[k].data || []).some(t => isRolloverTx(t) ? !!t.manual : (txAmountCents(t, 'credit') !== 0 || txAmountCents(t, 'debit') !== 0)));
    }
    // Net of the still-unpaid lines in one month (income minus expenses, in cents). Opening rows are ignored.
    function monthPendingNetCents(monthKey) {
        const ds = datasets && datasets[monthKey];
        if (!ds || !Array.isArray(ds.data)) return 0;
        let net = 0;
        ds.data.forEach(tx => { if (!isRolloverTx(tx) && !txIsPaid(tx)) net += txAmountCents(tx, 'credit') - txAmountCents(tx, 'debit'); });
        return net;
    }
    // Unpaid lines from EARLIER months. Each month opens with only the money that has really cleared,
    // so anything still unpaid in an earlier month is carried here so the projected balance does not forget it.
    function carriedPendingCents(monthKey) {
        const m = /^([a-z]+)(\d{4})$/.exec(String(monthKey || ''));
        if (!m) return 0;
        let idx = rawMonthNames.indexOf(m[1]), yr = Number(m[2]), total = 0;
        if (idx < 0) return 0;
        for (let guard = 0; guard < 240; guard++) {
            if (idx === 0) { if (!earlierYearsHaveActivity(yr)) break; idx = 11; yr -= 1; } else idx -= 1;
            const k = rawMonthNames[idx] + yr;
            if (!datasets[k]) break;
            total += monthPendingNetCents(k);
        }
        return total;
    }
    // True when this year or any year before it holds real entries, so a balance has to be carried into it even if the year just before is empty.
    function earlierYearsHaveActivity(year) {
        return (typeof allYears !== 'undefined' ? allYears : []).some(y => Number(y) < Number(year) && yearHasFinancialActivity(y));
    }
    function getMonthFinancials(monthKey) {
        const ds = datasets && datasets[monthKey], rows = ds && Array.isArray(ds.data) ? ds.data : [];
        const carried = carriedPendingCents(monthKey);
        let opening = 0, paidIncome = 0, paidExpense = 0, pendingIncome = 0, pendingExpense = 0, allIncome = 0, allExpense = 0, reportIncome = 0, reportExpense = 0;
        rows.forEach(tx => {
            const c = txAmountCents(tx, 'credit'), d = txAmountCents(tx, 'debit');
            if (isRolloverTx(tx)) { opening += c - d; return; }
            allIncome += c; allExpense += d;
            if (isReportableTx(tx)) { reportIncome += c; reportExpense += d; }
            if (txIsPaid(tx)) { paidIncome += c; paidExpense += d; } else { pendingIncome += c; pendingExpense += d; }
        });
        const cleared = opening + paidIncome - paidExpense;
        return { opening:centsMoney(opening), paidIncome:centsMoney(paidIncome), paidExpense:centsMoney(paidExpense), pendingIncome:centsMoney(pendingIncome), pendingExpense:centsMoney(pendingExpense), allIncome:centsMoney(allIncome), allExpense:centsMoney(allExpense), reportIncome:centsMoney(reportIncome), reportExpense:centsMoney(reportExpense), currentBalance:centsMoney(cleared), carriedPending:centsMoney(carried), projectedBalance:centsMoney(cleared + carried + pendingIncome - pendingExpense), netMovement:centsMoney(reportIncome - reportExpense) };
    }

    function fmt(n) { return moneyFmt.format(Number(n) || 0); }

    function esc(v) {
        return String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    }

    function isInternalTransferTx(t) { return !!(t && (t.xfer || t.xferFrom)); }
    function isReportableTx(t) { return !!t && !isRolloverTx(t) && !isInternalTransferTx(t); }
    function isRolloverTx(t) {
        const d = (t.desc || '').toLowerCase();
        return d.includes('previous period') || d.includes('starting balance') ||
            (d.trim() === 'opening balance' && String(t.method || '').trim().toLowerCase() === 'transfer') ||
            String(t.method || '').trim() === 'Previous Balance';
    }

    function startOfToday() { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }
    function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
    function daysBetween(a, b) { return Math.round((b - a) / 86400000); }
    function monthKeyOfDate(d) { return rawMonthNames[d.getMonth()] + d.getFullYear(); }
    function parseTxDate(str) {
        const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(str || '').trim());
        if (!m) return null;
        const day = +m[1], month = +m[2], year = +m[3];
        const d = new Date(year, month - 1, day);
        return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day ? d : null;
    }
    function parseIso(str) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(str || ''));
        if (!m) return null;
        const year = +m[1], month = +m[2], day = +m[3];
        const d = new Date(year, month - 1, day);
        return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day ? d : null;
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
            if (!isReportableTx(t)) return;
            if (c > 0) income += c;
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

/* ---------- PRIVACY MODE: the eye button blurs every amount and percentage on screen ---------- */
    const PV_RE = /[−+\-]?\$\s?\d[\d,]*(?:\.\d+)?|[−+\-]?\d[\d,]*\.\d+%?|[−+\-]?\d+(?:\.\d+)?%/g;
    const PV_TEST = /[−+\-]?\$\s?\d|[−+\-]?\d[\d,]*\.\d+|\d%/;
    let privacyOn = false, pvObserver = null, pvBusy = false;
    function pvWrapText(n) {
        const p = n.parentNode;
        if (!p || !PV_TEST.test(n.nodeValue)) return;
        if (/^(SCRIPT|STYLE|TEXTAREA|OPTION|SELECT|TITLE|NOSCRIPT)$/i.test(p.nodeName)) return;
        if (p.closest && p.closest('.pv, svg, #privacy-btn')) return;
        const txt = n.nodeValue, frag = document.createDocumentFragment();
        let last = 0, hit = false;
        txt.replace(PV_RE, (m, off) => {
            hit = true;
            if (off > last) frag.appendChild(document.createTextNode(txt.slice(last, off)));
            const s = document.createElement('span'); s.className = 'pv'; s.textContent = m; frag.appendChild(s);
            last = off + m.length; return m;
        });
        if (!hit) return;
        if (last < txt.length) frag.appendChild(document.createTextNode(txt.slice(last)));
        p.replaceChild(frag, n);
    }
    function pvWrapTree(root) {
        if (root.nodeType === 3) { pvWrapText(root); return; }
        if (root.nodeType !== 1) return;
        const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), list = [];
        while (w.nextNode()) list.push(w.currentNode);
        list.forEach(pvWrapText);
    }
    function pvUnwrapAll() {
        document.querySelectorAll('span.pv').forEach(s => { s.replaceWith(document.createTextNode(s.textContent)); });
    }
    function applyPrivacy(on, quiet) {
        privacyOn = !!on;
        document.body.classList.toggle('privacy', privacyOn);
        const btn = document.getElementById('privacy-btn');
        if (btn) {
            btn.classList.toggle('on', privacyOn);
            btn.setAttribute('aria-pressed', privacyOn ? 'true' : 'false');
            btn.setAttribute('aria-label', privacyOn ? 'Disable privacy mode' : 'Enable privacy mode');
        }
        if (pvObserver) { pvObserver.disconnect(); pvObserver = null; }
        if (privacyOn) {
            pvBusy = true; try { pvWrapTree(document.body); } finally { pvBusy = false; }
            pvObserver = new MutationObserver(muts => {
                if (pvBusy) return;
                pvBusy = true;
                try {
                    muts.forEach(m => {
                        if (m.type === 'characterData') pvWrapText(m.target);
                        else m.addedNodes.forEach(n => pvWrapTree(n));
                    });
                } finally { pvBusy = false; }
            });
            pvObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
        } else pvUnwrapAll();
        try { localStorage.setItem('dashboard_privacy', privacyOn ? '1' : '0'); } catch (_) { }
        if (!quiet) showToast(privacyOn ? 'Privacy mode on: amounts are hidden' : 'Privacy mode off');
    }
    function togglePrivacy() { applyPrivacy(!privacyOn); }
    function initPrivacy() {
        let on = false;
        try { on = localStorage.getItem('dashboard_privacy') === '1'; } catch (_) { }
        if (on) applyPrivacy(true, true);
    }
