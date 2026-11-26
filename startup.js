window.__build = window.__build || {}; window.__build['startup.js'] = '2026-11-26-financial-audit-3';
/* STARTUP: things that run once when the page opens (theme, login clock, listeners). Loaded last.
   Part of the Financial Movement Dashboard. Plain script (not a module): functions here are shared with the other js files. */

    const savedTheme = localStorage.getItem('dashboard_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeToggleButton(savedTheme);

    (function initFx() {
        let saved = null;
        try { saved = localStorage.getItem('dashboard_fx'); } catch (_) { /* storage unavailable */ }
        applyFx(saved !== 'off');
    })();

    ['click', 'keydown', 'touchstart'].forEach(ev => document.addEventListener(ev, resetIdleTimer, { passive: true }));

    window.addEventListener('beforeunload', (e) => {
        if (!masterKey) return;
        if (saveTimer) saveNow();
        if (saving) { e.preventDefault(); e.returnValue = ''; }
    });

    updateLockClock();
    setInterval(updateLockClock, 1000);

    (function loadRememberedAccount() {
        try {
            const saved = localStorage.getItem('dashboard_acct_email');
            if (saved) document.getElementById('acct-email').value = saved;
        } catch (_) { }
    })();


    (function initAuthClient() {
        if (window.supabase && window.supabase.createClient) {
            // The sign-in lives in memory only: closing the tab always means signing in again.
            authClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: true } });
            authClient.auth.onAuthStateChange((event) => { if (event === 'PASSWORD_RECOVERY') showLoginPanel('recovery'); });
        }
        const em = document.getElementById('acct-email');
        setTimeout(() => (em.value ? document.getElementById('acct-pwd') : em).focus(), 50);
    })();

    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeAllModals(); closeSidebar(); const ap = document.getElementById('pl-account'); if (ap) ap.classList.remove('show'); } });

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'n' && e.key !== 'N') return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const t = e.target;
        const tag = t && t.tagName ? t.tagName.toLowerCase() : '';
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || (t && t.isContentEditable)) return;
        if (!masterKey) return;
        if (['txn-modal', 'budget-modal', 'recurring-modal'].some(id => { const m = document.getElementById(id); return m && m.style.display === 'flex'; })) return;
        e.preventDefault();
        openTransactionModal();
    });

    (function loadDuePref() {
        try {
            const v = parseInt(localStorage.getItem('dashboard_due_days') || '', 10);
            if ([3, 5, 7, 14].includes(v)) dueWindowDays = v;
        } catch (_) { }
    })();

    syncDueDaysLabel();

    (function setupHelpBubbles() {
        const bubble = document.getElementById('help-bubble');
        if (!bubble) return;
        let current = null;
        const helpOf = e => (e.target && e.target.closest) ? e.target.closest('.help') : null;
        function hideHelp() {
            bubble.classList.remove('show');
            if (current) { current.classList.remove('open'); current.removeAttribute('aria-describedby'); current = null; }
        }
        function showHelp(btn) {
            const text = btn.getAttribute('data-help');
            if (!text) return;
            if (current && current !== btn) hideHelp();
            current = btn;
            btn.classList.add('open');
            btn.setAttribute('aria-describedby', 'help-bubble');
            bubble.textContent = text;
            bubble.classList.add('show');
            const r = btn.getBoundingClientRect();
            const bw = bubble.offsetWidth || 260, bh = bubble.offsetHeight || 80;
            const vw = window.innerWidth || 1200, vh = window.innerHeight || 800;
            let left = r.left + r.width / 2 - bw / 2;
            left = Math.max(8, Math.min(left, vw - bw - 8));
            let top = r.bottom + 8;
            if (top + bh > vh - 8) top = Math.max(8, r.top - bh - 8);
            bubble.style.left = left + 'px';
            bubble.style.top = top + 'px';
        }
        document.addEventListener('mouseover', e => { const b = helpOf(e); if (b) showHelp(b); });
        document.addEventListener('mouseout', e => { const b = helpOf(e); if (b && b === current) hideHelp(); });
        document.addEventListener('focusin', e => { const b = helpOf(e); if (b) showHelp(b); });
        document.addEventListener('focusout', e => { const b = helpOf(e); if (b && b === current) hideHelp(); });
        document.addEventListener('click', e => { const b = helpOf(e); if (b) showHelp(b); else hideHelp(); });
        document.addEventListener('keydown', e => { if (e.key === 'Escape') hideHelp(); });
        window.addEventListener('scroll', hideHelp, { passive: true });
        window.addEventListener('resize', hideHelp);
    })();

    window.onclick = function(event) {
        if (!event.target.closest('.dropdown')) {
            const dropdowns = document.getElementsByClassName('dropdown-content');
            for (let i = 0; i < dropdowns.length; i++) {
                if (dropdowns[i].classList.contains('show')) dropdowns[i].classList.remove('show');
            }
        }
    };

    (function mvInitResize() {
        let raf = 0;
        window.addEventListener('resize', () => {
            if (currentView !== 'trend') return;
            const h = document.getElementById('mv-chart');
            if (!h || !h.clientWidth || Math.abs(h.clientWidth - mvLastWidth) < 3) return;
            cancelAnimationFrame(raf); raf = requestAnimationFrame(mvDrawChart);
        });
    })();

// One click handler for every clickable category name (Budgets, Month vs Last Month): opens that category in Transactions
document.addEventListener('click', e => {
    const el = e.target.closest && e.target.closest('[data-open-cat]');
    if (el) openCategoryInLedger(el.getAttribute('data-open-cat'));
});
initPrivacy();
