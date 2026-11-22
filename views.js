/* VIEWS: page navigation, Dashboard overview, Annual, Multi-Year and Month vs Last Month pages.
   Part of the Financial Movement Dashboard. Plain script (not a module): functions here are shared with the other js files. */

    function changeMonth(delta) {
        let idx = rawMonthNames.indexOf(selectedMonthName);
        if (idx === -1) idx = rawMonthNames.indexOf(lastMonthName);
        idx += delta;
        let yr = parseInt(selectedYear, 10);
        if (idx < 0) { idx = 11; yr--; }
        else if (idx > 11) { idx = 0; yr++; }
        if (!allYears.includes(String(yr))) { showToast(`No data beyond ${selectedYear}`, true); return; }
        selectedYear = String(yr);
        document.getElementById('year-dropdown').value = selectedYear;
        ensureYearDatasetsExist(selectedYear);
        document.getElementById('month-dropdown').value = rawMonthNames[idx];
        switchMonth(rawMonthNames[idx]);
    }

    function spendByCategory(key, cutoffDay) {
        const map = {};
        let total = 0;
        const ds = datasets[key];
        if (!ds || !Array.isArray(ds.data)) return { map, total };
        ds.data.forEach(t => {
            if (isRolloverTx(t)) return;
            const d = parseFloat(t.debit) || 0;
            if (d <= 0) return;
            const day = parseInt(String(t.date).slice(0, 2), 10);
            if (cutoffDay && day > cutoffDay) return;
            const c = t.cost || 'Uncategorised';
            map[c] = (map[c] || 0) + d;
            total += d;
        });
        return { map, total };
    }

    function renderCategoryComparison() {
        const box = document.getElementById('cmp-body');
        if (!box) return;
        const mName = rawMonthNames.find(m => activeMonthKey.startsWith(m));
        if (!mName) { box.innerHTML = ''; return; }
        const yr = parseInt(activeMonthKey.slice(mName.length), 10);
        const mIdx = rawMonthNames.indexOf(mName);
        const today = startOfToday();
        const monthStart = new Date(yr, mIdx, 1);
        const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        if (monthStart > thisMonthStart) {
            box.innerHTML = '<div class="empty-note">Comparisons are available for the current and past months.</div>';
            return;
        }
        const isCurrent = monthStart.getTime() === thisMonthStart.getTime();
        const cutoff = isCurrent ? today.getDate() : 0;
        const cur = spendByCategory(activeMonthKey, cutoff);
        const prior = [];
        for (let k = 1; k <= 3; k++) {
            const r = spendByCategory(monthKeyOfDate(new Date(yr, mIdx - k, 1)), cutoff);
            if (r.total > 0) prior.push(r);
        }
        if (!prior.length) {
            box.innerHTML = '<div class="empty-note">Not enough history yet. Comparisons appear once a previous month has spending.</div>';
            return;
        }
        const n = prior.length;
        const avg = {};
        let avgTotal = 0;
        prior.forEach(p => {
            Object.keys(p.map).forEach(c => { avg[c] = (avg[c] || 0) + p.map[c] / n; });
            avgTotal += p.total / n;
        });
        const cats = new Set([...Object.keys(cur.map), ...Object.keys(avg)]);
        const rows = [...cats].map(c => ({ c, cur: cur.map[c] || 0, avg: avg[c] || 0 }))
            .map(r => ({ ...r, diff: r.cur - r.avg }))
            .filter(r => Math.abs(r.diff) >= 5)
            .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
            .slice(0, 6);
        const totalDiff = cur.total - avgTotal;
        const totalPct = avgTotal > 0 ? (totalDiff / avgTotal) * 100 : null;
        const tCls = totalDiff > 0 ? 'up' : 'down';
        const summary = `
            <div class="cmp-summary">
                <span><strong>${fmt(cur.total)}</strong> <span style="color: var(--text-muted);">vs ${fmt(avgTotal)} average</span></span>
                ${totalPct === null ? '' : `<span class="cmp-delta ${tCls}">${totalDiff > 0 ? '▲' : '▼'} ${Math.abs(totalPct).toFixed(0)}%</span>`}
            </div>`;
        const list = rows.length ? rows.map(r => {
            const isNew = r.avg === 0;
            const cls = isNew ? 'new' : (r.diff > 0 ? 'up' : 'down');
            const pct = isNew ? 'New' : `${r.diff > 0 ? '▲' : '▼'} ${Math.abs((r.diff / r.avg) * 100).toFixed(0)}%`;
            const max = Math.max(r.cur, r.avg, 1);
            return `
                <div class="cmp-row">
                    <div class="cmp-top"><span class="cmp-name">${esc(r.c)}</span><span class="cmp-delta ${cls}">${pct}</span></div>
                    <div class="cmp-bar"><div class="cmp-fill ${cls}" style="width: ${((r.cur / max) * 100).toFixed(1)}%"></div><div class="cmp-tick" style="left: calc(${((r.avg / max) * 100).toFixed(1)}% - 1px)" title="Average"></div></div>
                    <div class="cmp-sub"><span>This month ${fmt(r.cur)}</span><span>Avg ${fmt(r.avg)}</span></div>
                </div>`;
        }).join('') : '<div class="empty-note">Spending is in line with your average.</div>';
        const note = `Average of your previous ${n} month${n > 1 ? 's' : ''}${isCurrent ? `, compared at the same point of the month (day ${cutoff})` : ''}. The tick marks the average.`;
        box.innerHTML = `${summary}<div class="cmp-list">${list}</div><div class="cmp-foot">${note}</div>`;
    }

    function setNavGroupOpen(group, open) {
        group.classList.toggle('open', open);
        const btn = group.querySelector('.nav-parent');
        if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    function toggleNavGroup(btn) {
        const group = btn.closest('.nav-group');
        if (group) setNavGroupOpen(group, !group.classList.contains('open'));
    }
    function toggleSidebar() {
        const open = document.getElementById('sidebar').classList.toggle('open');
        document.getElementById('sidebar-backdrop').classList.toggle('show', open);
    }
    function closeSidebar() {
        const sb = document.getElementById('sidebar');
        const bd = document.getElementById('sidebar-backdrop');
        if (sb) sb.classList.remove('open');
        if (bd) bd.classList.remove('show');
    }
    function showView(view) {
        if (!VIEWS[view]) view = 'dashboard';
        currentView = view;
        const meta = VIEWS[view];
        document.querySelectorAll('.view-pane').forEach(p => { p.style.display = 'none'; });
        document.getElementById(meta.pane).style.display = 'block';
        document.querySelectorAll('.nav-item[data-view], .nav-sub[data-view]').forEach(b => {
            const on = b.dataset.view === view;
            b.classList.toggle('active', on);
            if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
        });
        document.querySelectorAll('.nav-group').forEach(g => {
            const hasActive = !!g.querySelector('.nav-sub[data-view="' + view + '"]');
            g.classList.toggle('has-active', hasActive);
            if (hasActive) setNavGroupOpen(g, true);
        });
        document.getElementById('month-nav').classList.toggle('hidden', !meta.month);
        document.getElementById('year-dropdown').style.display = meta.year === false ? 'none' : '';
        closeSidebar();
        renderApp();
        window.scrollTo(0, 0);
    }

    function ovTrend(id, tone, dir, text) {
        const el = document.getElementById(id);
        if (!el) return;
        el.className = 'ov-trend ' + tone;
        el.innerHTML = OV_ICON[dir] + '<span>' + esc(text) + '</span>';
    }

    function renderOverview() {
        if (!document.getElementById('ov-balance')) return;
        const ds = datasets[activeMonthKey];
        if (!ds || !Array.isArray(ds.data)) return;
        const txs = ds.data;
        const num = v => parseFloat(v) || 0;
        const state = t => String(t.paid || '').toLowerCase();
        const sum = (list, f) => list.reduce((a, t) => a + f(t), 0);
        const prevBal = sum(txs.filter(isRolloverTx), t => num(t.credit));
        const paidCredits = sum(txs.filter(t => !isRolloverTx(t) && state(t) === 'yes' && num(t.credit) > 0), t => num(t.credit));
        const debitsPaid = sum(txs.filter(t => state(t) === 'yes' && num(t.debit) > 0), t => num(t.debit));
        const currBal = prevBal + paidCredits - debitsPaid;
        const creditsRecv = sum(txs.filter(t => !isRolloverTx(t) && state(t) === 'no' && num(t.credit) > 0), t => num(t.credit));
        const debitsPay = sum(txs.filter(t => state(t) === 'no' && num(t.debit) > 0), t => num(t.debit));
        const projBal = currBal + creditsRecv - debitsPay;
        const cur = ovMonthTotals(activeMonthKey) || { income: 0, expenses: 0 };
        const prev = ovMonthTotals(ovShiftKey(activeMonthKey, -1));
        document.getElementById('ov-month').innerText = currentMonthLabel();
        const balEl = document.getElementById('ov-balance');
        balEl.innerText = fmt(currBal);
        balEl.classList.toggle('text-danger', currBal < 0);
        balEl.classList.toggle('text-success', currBal > 0);
        const bp = ovPct(currBal, prevBal);
        if (bp === null) ovTrend('ov-balance-trend', 'flat', 'flat', 'No opening balance');
        else ovTrend('ov-balance-trend', bp >= 0 ? 'good' : 'bad', bp >= 0 ? 'up' : 'down', ovFmtPct(bp) + ' from last month');
        const incEl = document.getElementById('ov-income');
        incEl.innerText = fmt(cur.income);
        incEl.classList.toggle('text-success', cur.income > 0);
        const ip = prev ? ovPct(cur.income, prev.income) : null;
        if (ip === null) ovTrend('ov-income-trend', 'flat', 'flat', 'No income last month');
        else ovTrend('ov-income-trend', ip >= 0 ? 'good' : 'bad', ip >= 0 ? 'up' : 'down', ovFmtPct(ip) + ' vs last month');
        const expEl = document.getElementById('ov-expenses');
        expEl.innerText = fmt(cur.expenses);
        expEl.classList.toggle('text-danger', cur.expenses > 0);
        const ep = prev ? ovPct(cur.expenses, prev.expenses) : null;
        if (ep === null) ovTrend('ov-expenses-trend', 'flat', 'flat', 'No spending last month');
        else ovTrend('ov-expenses-trend', ep > 0 ? 'bad' : 'good', ep >= 0 ? 'up' : 'down', ovFmtPct(ep) + ' vs last month');
        const projEl = document.getElementById('ov-proj');
        projEl.innerText = fmt(projBal);
        projEl.classList.toggle('text-danger', projBal < 0);
        projEl.classList.toggle('text-success', projBal > 0);
        const delta = projBal - currBal;
        if (Math.abs(delta) < 0.005) ovTrend('ov-proj-trend', 'flat', 'flat', 'Nothing pending');
        else ovTrend('ov-proj-trend', delta >= 0 ? 'good' : 'bad', delta >= 0 ? 'up' : 'down', (delta >= 0 ? '+' : '-') + fmt(Math.abs(delta)) + ' still to settle');
        const n = parseInt(document.getElementById('cf-range').value, 10) || 6;
        const rows = [];
        for (let i = n - 1; i >= 0; i--) {
            const key = ovShiftKey(activeMonthKey, -i);
            const p = ovParseKey(key);
            const t = ovMonthTotals(key) || { income: 0, expenses: 0 };
            rows.push({ label: OV_MONTHS[p.idx], year: p.year, income: t.income, expenses: t.expenses });
        }
        const crossYear = new Set(rows.map(r => r.year)).size > 1;
        const max = ovNiceMax(Math.max(0, ...rows.map(r => Math.max(r.income, r.expenses))));
        let axis = '', grid = '';
        for (let i = 0; i <= 4; i++) {
            axis += `<span>${Math.round(max * (4 - i) / 4).toLocaleString('en-AU')}</span>`;
            grid += '<i></i>';
        }
        document.getElementById('cf-axis').innerHTML = axis;
        document.getElementById('cf-grid').innerHTML = grid;
        const cols = document.getElementById('cf-cols');
        const labels = document.getElementById('cf-labels');
        cols.style.gridTemplateColumns = labels.style.gridTemplateColumns = `repeat(${rows.length}, minmax(0, 1fr))`;
        cols.innerHTML = rows.map(r => `
            <div class="cf-col" title="${esc(r.label + ' ' + r.year)}: Income ${esc(fmt(r.income))} · Expenses ${esc(fmt(r.expenses))}">
                <div class="cf-bar inc" style="height: ${(r.income / max * 100).toFixed(1)}%"></div>
                <div class="cf-bar exp" style="height: ${(r.expenses / max * 100).toFixed(1)}%"></div>
            </div>`).join('');
        labels.innerHTML = rows.map(r => `<span>${r.label}${crossYear ? " '" + String(r.year).slice(2) : ''}</span>`).join('');
        const net = rows.reduce((a, r) => a + r.income - r.expenses, 0);
        const netEl = document.getElementById('cf-net');
        netEl.innerText = `Net over period: ${net >= 0 ? '+' : '-'}${fmt(Math.abs(net))}`;
        netEl.className = net >= 0 ? 'text-success' : 'text-danger';
        netEl.style.fontWeight = '700';
        const catMap = {};
        let total = 0;
        txs.forEach(t => {
            const d = num(t.debit);
            if (d > 0) { const k = t.cost || 'Uncategorised'; catMap[k] = (catMap[k] || 0) + d; total += d; }
        });
        const sorted = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
        const parts = sorted.slice(0, 5).map(([name, v]) => ({ name, v }));
        const rest = sorted.slice(5).reduce((a, e) => a + e[1], 0);
        if (rest > 0) parts.push({ name: 'Other', v: rest });
        const ring = document.getElementById('dn-ring');
        const legend = document.getElementById('dn-legend');
        document.getElementById('dn-total').innerText = fmt(total);
        if (total > 0) {
            let acc = 0;
            const stops = parts.map((p, i) => {
                const start = acc / total * 100;
                acc += p.v;
                return `${OV_PALETTE[i % OV_PALETTE.length]} ${start.toFixed(2)}% ${(acc / total * 100).toFixed(2)}%`;
            });
            ring.style.background = `conic-gradient(${stops.join(', ')})`;
            legend.innerHTML = parts.map((p, i) => `
                <li title="${esc(p.name)}: ${esc(fmt(p.v))}">
                    <i style="background: ${OV_PALETTE[i % OV_PALETTE.length]}"></i>
                    <span class="dn-name">${esc(p.name)}</span>
                    <span class="dn-pct">${(p.v / total * 100).toFixed(0)}%</span>
                </li>`).join('');
        } else {
            ring.style.background = '';
            legend.innerHTML = '<li class="dn-none">No expenses recorded this month</li>';
        }
        const allRecent = txs.map((t, i) => ({ t, i }))
            .filter(e => !isRolloverTx(e.t))
            .sort((a, b) => (parseDateString(b.t.date) - parseDateString(a.t.date)) || (b.i - a.i));
        const isThisMonth = activeMonthKey === monthKeyOfDate(startOfToday());
        const settled = isThisMonth ? allRecent.filter(e => { const d = parseTxDate(e.t.date); return !d || d <= startOfToday(); }) : allRecent;
        const recent = (settled.length ? settled : allRecent).slice(0, 7);
        const tbody = document.getElementById('ov-recent-tbody');
        if (!recent.length) {
            tbody.innerHTML = '<tr class="empty-state"><td colspan="5">No transactions yet this month.</td></tr>';
        } else {
            tbody.innerHTML = recent.map(({ t }) => {
                const netAmt = num(t.credit) - num(t.debit);
                const isIn = netAmt >= 0;
                const paid = state(t) === 'yes';
                const cat = t.cost || t.creditCat || '—';
                const idx = txs.indexOf(t);
                return `
                    <tr>
                        <td><div class="ov-desc">
                            <span class="ov-tx-ico ${isIn ? 'ov-ico-green' : 'ov-ico-red'}">${isIn ? OV_ICON.in : OV_ICON.out}</span>
                            <span class="t" title="${esc(t.desc)}">${esc(t.desc || '(no description)')}</span>
                        </div></td>
                        <td class="hide-sm"><span class="ov-cat">${esc(cat)}</span></td>
                        <td class="hide-sm" style="color: var(--text-muted);">${esc(t.date)}</td>
                        <td class="hide-sm"><button type="button" class="ov-status ${paid ? '' : 'pending'}" onclick="togglePaid(${idx})" title="${paid ? 'Click to mark as pending' : 'Click to mark as paid'}"><i></i>${paid ? 'Paid' : 'Pending'}</button></td>
                        <td class="ov-amt ${isIn ? 'text-success' : 'text-danger'}">${isIn ? '+' : '-'}${fmt(Math.abs(netAmt))}</td>
                    </tr>`;
            }).join('');
        }
        renderOverviewExtras(txs);
    }

    function buildReportHtml(key) {
        key = key || activeMonthKey;
        const ds = datasets[key];
        const txs = ds && Array.isArray(ds.data) ? ds.data : [];
        const num = v => parseFloat(v) || 0;
        const st = t => String(t.paid || '').toLowerCase();
        const s = periodSummaryFor(key);
        const pendCr = txs.filter(t => !isRolloverTx(t) && st(t) === 'no' && num(t.credit) > 0).reduce((a, t) => a + num(t.credit), 0);
        const pendDb = txs.filter(t => st(t) === 'no' && num(t.debit) > 0).reduce((a, t) => a + num(t.debit), 0);
        const proj = s.currBal + pendCr - pendDb;
        const income = txs.filter(t => !isRolloverTx(t)).reduce((a, t) => a + num(t.credit), 0);
        const spend = txs.reduce((a, t) => a + num(t.debit), 0);
        const rate = income > 0 ? ((income - spend) / income * 100).toFixed(1) + '%' : '—';
        const catMap = {};
        txs.forEach(t => { const d = num(t.debit); if (d > 0) { const c = t.cost || 'Uncategorised'; catMap[c] = (catMap[c] || 0) + d; } });
        const catRows = Object.entries(catMap).sort((a, b) => b[1] - a[1]).map(([c, v]) => {
            const base = c === 'Uncategorised' ? 0 : getCategoryBudgetForMonth(c, key);
            const lim = base > 0 ? base + getCategoryRolloverCarryover(c, key) : 0;
            return `<tr><td>${esc(c)}</td><td class="n">${fmt(v)}</td><td class="n">${lim > 0 ? fmt(lim) : '—'}</td><td class="n">${lim > 0 ? Math.round(v / lim * 100) + '%' : '—'}</td></tr>`;
        }).join('') || '<tr><td colspan="4">No expenses recorded.</td></tr>';
        const lines = [...txs].sort((a, b) => parseDateString(a.date) - parseDateString(b.date)).map(t =>
            `<tr><td>${esc(t.date)}</td><td>${esc(t.desc)}</td><td>${esc(t.cost || t.creditCat || '')}</td><td class="n">${num(t.credit) ? fmt(t.credit) : ''}</td><td class="n">${num(t.debit) ? fmt(t.debit) : ''}</td><td>${st(t) === 'yes' ? 'Paid' : 'Pending'}</td></tr>`
        ).join('');
        const row = (label, val) => `<tr><td>${label}</td><td class="n">${val}</td></tr>`;
        return `
            <h1>Financial Report — ${esc(monthLabelOfKey(key))}</h1>
            <div class="meta">Generated ${esc(new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }))}</div>
            <h2>Period Summary</h2>
            <table class="sum"><tbody>
                ${row('Credits received (incl. opening balance)', fmt(s.creditsRcvd))}
                ${row('Debits paid', fmt(s.debitsPaid))}
                ${row('<strong>Current balance</strong>', '<strong>' + fmt(s.currBal) + '</strong>')}
                ${row('Pending credits', fmt(pendCr))}
                ${row('Pending debits', fmt(pendDb))}
                ${row('<strong>Projected balance</strong>', '<strong>' + fmt(proj) + '</strong>')}
                ${row('Savings rate', rate)}
            </tbody></table>
            <h2>Spending by Category</h2>
            <table><thead><tr><th>Category</th><th class="n">Spent</th><th class="n">Budget</th><th class="n">Used</th></tr></thead><tbody>${catRows}</tbody></table>
            <h2>Transactions</h2>
            <table><thead><tr><th>Date</th><th>Description</th><th>Category</th><th class="n">Credit</th><th class="n">Debit</th><th>Status</th></tr></thead><tbody>${lines}</tbody></table>
            <div class="foot">This report contains personal financial information. Store or share it carefully.</div>`;
    }

    function printReport() {
        const el = document.getElementById('print-report');
        if (!el) return;
        const oldTitle = document.title;
        el.innerHTML = buildReportHtml(activeMonthKey);
        document.title = 'Financial Report - ' + monthLabelOfKey(activeMonthKey);
        document.body.classList.add('printing-report');
        const cleanup = () => {
            document.body.classList.remove('printing-report');
            el.innerHTML = '';
            document.title = oldTitle;
            window.removeEventListener('afterprint', cleanup);
        };
        window.addEventListener('afterprint', cleanup);
        setTimeout(() => window.print(), 80);
    }

    function renderYtd() {
        if (!document.getElementById('ytd-income')) return;
        const year = selectedYear;
        let earned = 0, spent = 0;
        const entered = [];
        getMonthKeysOrderForYear(year).forEach(k => {
            const ds = datasets[k];
            const t = ovMonthTotals(k);
            if (t) { earned += t.income; spent += t.expenses; }
            if (t && ds && Array.isArray(ds.data) && ds.data.some(x => !isRolloverTx(x))) {
                const p = ovParseKey(k);
                entered.push({ name: OV_MONTHS[p.idx], net: t.income - t.expenses });
            }
        });
        const months = entered.length;
        const net = earned - spent;
        const avgText = total => months ? `${months} month${months === 1 ? '' : 's'} · avg ${fmt(total / months)}/mo` : 'No months with entries yet';
        const signed = n => (n >= 0 ? '+' : '-') + fmt(Math.abs(n));
        document.getElementById('ytd-year').innerText = year;
        const incEl = document.getElementById('ytd-income');
        incEl.innerText = fmt(earned);
        incEl.className = earned > 0 ? 'text-success' : '';
        document.getElementById('ytd-income-sub').innerText = avgText(earned);
        const expEl = document.getElementById('ytd-expenses');
        expEl.innerText = fmt(spent);
        expEl.className = spent > 0 ? 'text-danger' : '';
        document.getElementById('ytd-expenses-sub').innerText = avgText(spent);
        const netEl = document.getElementById('ytd-net');
        netEl.innerText = signed(net);
        netEl.className = net > 0 ? 'text-success' : (net < 0 ? 'text-danger' : '');
        document.getElementById('ytd-net-sub').innerText = !earned && !spent ? 'Earned minus Spent'
            : (net >= 0 ? "Earned minus Spent. You're ahead." : "Earned minus Spent. You're behind.");
        const rateEl = document.getElementById('ytd-rate');
        const rateSub = document.getElementById('ytd-rate-sub');
        if (earned > 0) {
            const rate = net / earned * 100;
            rateEl.innerText = rate.toFixed(1) + '%';
            rateEl.className = rate >= 0 ? 'text-success' : 'text-danger';
            const v = rate >= 20 ? ['Great', 'good'] : rate >= 10 ? ['Healthy', 'good'] : rate >= 0 ? ['Low', 'ok'] : ['Overspending', 'bad'];
            rateSub.innerHTML = `<span class="verdict ${v[1]}">${v[0]}</span> · ` + (rate >= 0
                ? `you keep ${Math.round(rate)}¢ of every $1 you earn`
                : `you spend ${fmt(spent / earned)} for every $1 you earn`);
        } else {
            rateEl.innerText = '--';
            rateEl.className = '';
            rateSub.innerText = 'Needs some income entered first';
        }
        const sentence = document.getElementById('ytd-summary');
        if (!earned && !spent) sentence.innerText = `Nothing has been entered for ${year} yet.`;
        else if (!earned) sentence.innerHTML = `So far in ${esc(year)} you have spent <strong class="down">${esc(fmt(spent))}</strong> and no income is entered.`;
        else sentence.innerHTML = `So far in ${esc(year)} you earned <strong class="up">${esc(fmt(earned))}</strong> and spent <strong class="down">${esc(fmt(spent))}</strong>, so you are <strong class="${net >= 0 ? 'up' : 'down'}">${esc(fmt(Math.abs(net)))} ${net >= 0 ? 'ahead' : 'behind'}</strong>.`;
        const pct = earned > 0 ? spent / earned * 100 : (spent > 0 ? 100 : 0);
        document.getElementById('ytd-bar-pct').innerText = earned > 0 ? `${Math.round(pct)}% spent` : (spent > 0 ? 'No income to compare' : '--');
        const fill = document.getElementById('ytd-bar-fill');
        fill.style.width = Math.min(100, pct).toFixed(1) + '%';
        fill.className = 'progress-bar-fill ' + (pct > 100 ? 'over-budget' : pct > 80 ? 'warn' : 'success-fill');
        const lines = [];
        lines.push(months
            ? `Counts the ${months} month${months === 1 ? '' : 's'} you have entered in ${esc(year)}. Lines marked Pending are included, and empty months are skipped.`
            : `No months have been entered for ${esc(year)} yet.`);
        if (months >= 2) {
            const best = entered.reduce((a, m) => (m.net > a.net ? m : a));
            const worst = entered.reduce((a, m) => (m.net < a.net ? m : a));
            lines.push(`Best month: <strong>${best.name}</strong> (${esc(signed(best.net))}) · Toughest month: <strong>${worst.name}</strong> (${esc(signed(worst.net))}).`);
        }
        const cur = ovMonthTotals(activeMonthKey);
        if (cur && (cur.income || cur.expenses)) {
            const curNet = cur.income - cur.expenses;
            lines.push(`This month on its own: <strong>${esc(signed(curNet))}</strong>${cur.income > 0 ? ` (${(curNet / cur.income * 100).toFixed(1)}% saved)` : ''}.`);
        }
        document.getElementById('ytd-note').innerHTML = lines.join('<br>');
    }

    function renderThisMonth(txs) {
        if (!document.getElementById('mo-earned')) return;
        const num = v => parseFloat(v) || 0;
        const st = t => String(t.paid || '').toLowerCase();
        const sum = (list, f) => list.reduce((a, t) => a + f(t), 0);
        const credits = txs.filter(t => !isRolloverTx(t) && num(t.credit) > 0);
        const debits = txs.filter(t => num(t.debit) > 0);
        const earned = sum(credits, t => num(t.credit));
        const earnedPaid = sum(credits.filter(t => st(t) === 'yes'), t => num(t.credit));
        const spent = sum(debits, t => num(t.debit));
        const spentPaid = sum(debits.filter(t => st(t) === 'yes'), t => num(t.debit));
        const net = earned - spent;
        const label = currentMonthLabel();
        document.getElementById('mo-month').innerText = label;
        const earnedEl = document.getElementById('mo-earned');
        earnedEl.innerText = fmt(earned);
        earnedEl.className = earned > 0 ? 'text-success' : '';
        document.getElementById('mo-earned-sub').innerText = earned > 0
            ? `${fmt(earnedPaid)} received · ${fmt(earned - earnedPaid)} still to come` : 'No income entered yet';
        const spentEl = document.getElementById('mo-spent');
        spentEl.innerText = fmt(spent);
        spentEl.className = spent > 0 ? 'text-danger' : '';
        document.getElementById('mo-spent-sub').innerText = spent > 0
            ? `${fmt(spentPaid)} paid · ${fmt(spent - spentPaid)} still to pay` : 'No spending entered yet';
        const leftEl = document.getElementById('mo-left');
        leftEl.innerText = (net >= 0 ? '+' : '-') + fmt(Math.abs(net));
        leftEl.className = net > 0 ? 'text-success' : (net < 0 ? 'text-danger' : '');
        document.getElementById('mo-left-sub').innerText = !earned && !spent ? 'Earned minus Spent'
            : (net >= 0 ? "Earned minus Spent. You're ahead." : "Earned minus Spent. You're behind.");
        const rateEl = document.getElementById('mo-rate');
        const rateSub = document.getElementById('mo-rate-sub');
        if (earned > 0) {
            const rate = net / earned * 100;
            rateEl.innerText = rate.toFixed(1) + '%';
            rateEl.className = rate >= 0 ? 'text-success' : 'text-danger';
            const v = rate >= 20 ? ['Great', 'good'] : rate >= 10 ? ['Healthy', 'good'] : rate >= 0 ? ['Low', 'ok'] : ['Overspending', 'bad'];
            rateSub.innerHTML = `<span class="verdict ${v[1]}">${v[0]}</span> · ` + (rate >= 0
                ? `you keep ${Math.round(rate)}¢ of every $1 you earn`
                : `you spend ${fmt(spent / earned)} for every $1 you earn`);
        } else {
            rateEl.innerText = '--';
            rateEl.className = '';
            rateSub.innerText = 'Needs some income entered first';
        }
        const sentence = document.getElementById('mo-summary');
        if (!earned && !spent) sentence.innerText = `Nothing has been entered for ${label} yet.`;
        else if (!earned) sentence.innerHTML = `You have spent <strong class="down">${esc(fmt(spent))}</strong> and no income is entered for ${esc(label)}.`;
        else sentence.innerHTML = `You earned <strong class="up">${esc(fmt(earned))}</strong> and spent <strong class="down">${esc(fmt(spent))}</strong>, so you are <strong class="${net >= 0 ? 'up' : 'down'}">${esc(fmt(Math.abs(net)))} ${net >= 0 ? 'ahead' : 'behind'}</strong>.`;
        const pct = earned > 0 ? spent / earned * 100 : (spent > 0 ? 100 : 0);
        document.getElementById('mo-bar-pct').innerText = earned > 0 ? `${Math.round(pct)}% spent` : (spent > 0 ? 'No income to compare' : '--');
        const fill = document.getElementById('mo-bar-fill');
        fill.style.width = Math.min(100, pct).toFixed(1) + '%';
        fill.className = 'progress-bar-fill ' + (pct > 100 ? 'over-budget' : pct > 80 ? 'warn' : 'success-fill');
        const p = ovParseKey(activeMonthKey);
        const today = startOfToday();
        const dim = p ? new Date(p.year, p.idx + 1, 0).getDate() : 30;
        let when = '';
        if (p) {
            const first = new Date(p.year, p.idx, 1), last = new Date(p.year, p.idx, dim);
            if (today >= first && today <= last) when = `Today is day ${today.getDate()} of ${dim}, so the month is not over and these numbers can still change.`;
            else if (today > last) when = 'This month is finished.';
            else when = 'This month has not started yet, so these are planned amounts.';
        }
        document.getElementById('mo-note').innerText = `${when} Lines marked Pending are included.`.trim();
    }

    function renderOverviewExtras(txs) {
        renderDueSoon();
        renderBudgetStrip(txs);
        renderThisMonth(txs);
        renderYtd();
        renderUpcoming7();
        renderGoalsCard();
    }

    function switchYear(yr) {
        selectedYear = yr;
        ensureYearDatasetsExist(selectedYear);
        syncRolloverBalances();
        activeMonthKey = selectedMonthName + selectedYear;
        sortTransactions();
        renderApp();
        showToast(`Switched to ${selectedYear}`);
    }

    function switchMonth(val) {
        selectedMonthName = val;
        lastMonthName = val;
        ensureYearDatasetsExist(selectedYear);
        activeMonthKey = selectedMonthName + selectedYear;
        sortTransactions();
        renderApp();
    }

    function renderApp() {
        document.getElementById('app-title-header').innerText = `Financial Movement Dashboard — ${selectedYear}`;
        const mLabel = document.getElementById('mobile-month-label');
        if (mLabel) mLabel.textContent = currentMonthLabel();
        switch (currentView) {
            case 'annual': renderAnnualSummary(); return;
            case 'multiyear': renderMultiYearSummary(); return;
            case 'trend': renderMonthlyTrendView(); return;
            case 'goals': renderGoals(); return;
            case 'forecast': renderForecast(); return;
            case 'subscriptions': renderSubscriptions(); return;
        }
        syncRolloverBalances();
        renderTransactions();
        renderCategoryManagement();
        calculateMetrics();
        renderBudgets();
    }

    function setMvMode(m) { mvMode = m; renderMonthlyTrendView(); }

    // per-day totals for one month (index 1..days). kind: 'debit' | 'credit'. Rollover lines are skipped.
    function mvDaily(key, kind, days) {
        const arr = new Array(days + 1).fill(0);
        const ds = datasets[key];
        if (!ds || !Array.isArray(ds.data)) return arr;
        ds.data.forEach(t => {
            if (isRolloverTx(t)) return;
            const v = parseFloat(t[kind]) || 0;
            if (v <= 0) return;
            const day = parseInt(String(t.date).slice(0, 2), 10);
            if (day >= 1 && day <= days) arr[day] += v;
        });
        return arr;
    }
    function mvPct(cur, prev) { return prev > 0 ? ((cur - prev) / prev) * 100 : null; }
    // tone: for spending, up is bad; for income / saved, up is good
    function mvTone(diff, upIsGood) { if (Math.abs(diff) < 0.005) return 'flat'; return (diff > 0) === upIsGood ? 'good' : 'bad'; }
    function mvPill(diff, pct, tone) {
        if (Math.abs(diff) < 0.005) return '<span class="mv-pill flat">● No change</span>';
        const arrow = diff > 0 ? '▲' : '▼';
        return `<span class="mv-pill ${tone}">${arrow} ${pct === null ? 'New' : Math.abs(pct).toFixed(1) + '%'}</span>`;
    }

    function renderMonthlyTrendView() {
        const box = document.getElementById('mv-body');
        if (!box) return;
        const key = activeMonthKey;
        const mName = rawMonthNames.find(m => key.startsWith(m));
        if (!mName) { box.innerHTML = ''; return; }
        const yr = parseInt(key.slice(mName.length), 10), mIdx = rawMonthNames.indexOf(mName);
        const prevDate = new Date(yr, mIdx - 1, 1);
        const prevKey = monthKeyOfDate(prevDate);
        const curLabel = SHORT_MONTHS[mIdx] + ' ' + yr, prevLabel = SHORT_MONTHS[prevDate.getMonth()] + ' ' + prevDate.getFullYear();
        const curFull = new Date(yr, mIdx, 1).toLocaleString('en-AU', { month: 'long' });
        const prevFull = prevDate.toLocaleString('en-AU', { month: 'long' });
        const dimCur = new Date(yr, mIdx + 1, 0).getDate(), dimPrev = new Date(yr, mIdx, 0).getDate();
        const today = startOfToday();
        const monthStart = new Date(yr, mIdx, 1), thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        document.getElementById('mv-title').textContent = `${curFull} vs ${prevFull}`;
        const modeBox = document.getElementById('mv-mode');

        if (monthStart > thisMonthStart) {
            modeBox.style.display = 'none';
            document.getElementById('mv-sub').textContent = '';
            box.innerHTML = '<div class="card"><div class="empty-note">Comparisons are available for the current and past months.</div></div>';
            return;
        }
        const isCurrent = monthStart.getTime() === thisMonthStart.getTime();
        const todayDay = isCurrent ? today.getDate() : dimCur;
        modeBox.style.display = isCurrent ? '' : 'none';
        modeBox.querySelectorAll(".pill").forEach(b => b.classList.toggle('active', b.dataset.mode === mvMode));
        const samePoint = isCurrent && mvMode === 'same';
        const cutPrev = samePoint ? Math.min(todayDay, dimPrev) : dimPrev;       // how much of last month is compared
        const cutCur = todayDay;

        const spCur = mvDaily(key, 'debit', dimCur), spPrev = mvDaily(prevKey, 'debit', dimPrev);
        const inCur = mvDaily(key, 'credit', dimCur), inPrev = mvDaily(prevKey, 'credit', dimPrev);
        const prevHas = mvSum(spPrev, dimPrev) > 0 || mvSum(inPrev, dimPrev) > 0;
        document.getElementById('mv-sub').textContent = samePoint
            ? `${curLabel} up to day ${todayDay}, against ${prevLabel} up to day ${cutPrev}`
            : (isCurrent ? `${curLabel} so far, against all of ${prevLabel}` : `${curLabel} against ${prevLabel}`);
        if (!prevHas) {
            box.innerHTML = `<div class="card"><div class="empty-note">There is no spending or income recorded for ${esc(prevLabel)} yet, so there is nothing to compare with.</div></div>`;
            return;
        }

        const S = { cur: mvSum(spCur, cutCur), prev: mvSum(spPrev, cutPrev) };
        const I = { cur: mvSum(inCur, cutCur), prev: mvSum(inPrev, cutPrev) };
        const N = { cur: I.cur - S.cur, prev: I.prev - S.prev };
        const sd = S.cur - S.prev, id = I.cur - I.prev, nd = N.cur - N.prev;
        const sTone = mvTone(sd, false), iTone = mvTone(id, true), nTone = mvTone(nd, true);
        const sPct = mvPct(S.cur, S.prev), iPct = mvPct(I.cur, I.prev), nPct = N.prev !== 0 ? (nd / Math.abs(N.prev)) * 100 : null;

        // headline sentence
        const when = samePoint ? 'at this point' : (isCurrent ? 'so far' : '');
        let heroCls = 'flat', heroIc = '＝', heroTxt;
        if (Math.abs(sd) < 0.005) heroTxt = `You have spent <strong>the same amount</strong> as in ${esc(prevFull)}${when ? ' ' + when : ''}.`;
        else {
            heroCls = sd > 0 ? 'up' : 'down'; heroIc = sd > 0 ? '▲' : '▼';
            heroTxt = `You have spent <strong>${fmt(Math.abs(sd))} ${sd > 0 ? 'more' : 'less'}</strong>${sPct === null ? '' : ` (${Math.abs(sPct).toFixed(1)}%)`} than in ${esc(prevFull)}${when ? ' ' + when : ''}. ${sd > 0 ? 'Spending is up.' : 'Nice, spending is down.'}`;
        }

        // categories
        const catCur = {}, catPrev = {};
        const addCat = (key2, cut, out) => {
            const ds = datasets[key2];
            ((ds && ds.data) || []).forEach(t => {
                if (isRolloverTx(t)) return;
                const v = parseFloat(t.debit) || 0;
                if (v <= 0) return;
                const day = parseInt(String(t.date).slice(0, 2), 10);
                if (cut && day > cut) return;
                const c = t.cost || 'Uncategorised';
                out[c] = (out[c] || 0) + v;
            });
        };
        addCat(key, cutCur, catCur); addCat(prevKey, cutPrev, catPrev);
        const rows = [...new Set([...Object.keys(catCur), ...Object.keys(catPrev)])]
            .map(c => ({ c, cur: catCur[c] || 0, prev: catPrev[c] || 0 }))
            .map(r => ({ ...r, diff: r.cur - r.prev }))
            .sort((a, b) => Math.max(b.cur, b.prev) - Math.max(a.cur, a.prev));
        const shown = rows.slice(0, 8);
        const maxCat = Math.max(1, ...shown.map(r => Math.max(r.cur, r.prev)));
        const inc = rows.filter(r => r.diff > 0.005).sort((a, b) => b.diff - a.diff)[0];
        const dec = rows.filter(r => r.diff < -0.005).sort((a, b) => a.diff - b.diff)[0];
        const daysC = Math.max(1, cutCur), daysP = Math.max(1, cutPrev);
        const avgC = S.cur / daysC, avgP = S.prev / daysP, ad = avgC - avgP;

        const kpi = (label, icon, o, d, pct, tone, valCls) => `
            <div class="card mv-kpi">
                <div class="mv-kpi-top"><span>${label}</span><span aria-hidden="true">${icon}</span></div>
                <div class="mv-kpi-val ${valCls || ''}">${o.cur < 0 ? '−' : ''}${fmt(Math.abs(o.cur))}</div>
                <div class="mv-kpi-delta">${mvPill(d, pct, tone)}<span class="mv-amt ${tone}">${Math.abs(d) < 0.005 ? '' : (d > 0 ? '+' : '−') + fmt(Math.abs(d))}</span></div>
                <div class="mv-kpi-prev">${esc(prevFull)}: ${o.prev < 0 ? '−' : ''}${fmt(Math.abs(o.prev))}</div>
            </div>`;

        const catHtml = shown.length ? shown.map(r => {
            const isNew = r.prev === 0, gone = r.cur === 0;
            const tone = Math.abs(r.diff) < 0.005 ? 'flat' : (r.diff > 0 ? 'bad' : 'good');
            const pill = Math.abs(r.diff) < 0.005 ? '<span class="mv-pill flat">No change</span>'
                : isNew ? '<span class="mv-pill new">New</span>'
                : `<span class="mv-pill ${tone}">${r.diff > 0 ? '▲' : '▼'} ${gone ? '100' : Math.abs((r.diff / r.prev) * 100).toFixed(0)}%</span>`;
            return `
                <div class="mv-cat">
                    <div class="mv-cat-top"><span class="mv-cat-name" title="${esc(r.c)}">${esc(r.c)}</span>
                        <span class="mv-cat-right"><span class="mv-amt ${tone}">${Math.abs(r.diff) < 0.005 ? '' : (r.diff > 0 ? '+' : '−') + fmt(Math.abs(r.diff))}</span>${pill}</span></div>
                    <div class="mv-bars">
                        <div class="mv-bar-row"><div class="mv-track"><div class="mv-fill now" style="width:${((r.cur / maxCat) * 100).toFixed(1)}%"></div></div><span class="mv-bar-val now">${fmt(r.cur)}</span></div>
                        <div class="mv-bar-row"><div class="mv-track"><div class="mv-fill prev" style="width:${((r.prev / maxCat) * 100).toFixed(1)}%"></div></div><span class="mv-bar-val">${fmt(r.prev)}</span></div>
                    </div>
                </div>`;
        }).join('') : '<div class="empty-note">No spending in either month yet.</div>';

        const ins = (tone, icon, label, main, sub) => `<div class="mv-ins"><span class="mv-ins-ic ${tone}" aria-hidden="true">${icon}</span><div style="min-width:0"><small>${label}</small><strong title="${esc(main)}">${esc(main)}</strong><span class="s">${sub}</span></div></div>`;
        const insights =
            (inc ? ins('bad', '▲', 'Biggest increase', inc.c, `${signedMoney(inc.diff)}${inc.prev > 0 ? ' (' + ((inc.diff / inc.prev) * 100).toFixed(0) + '%)' : ' · new this month'}`) : ins('flat', '＝', 'Biggest increase', 'None', 'No category went up')) +
            (dec ? ins('good', '▼', 'Biggest saving', dec.c, `${signedMoney(dec.diff)}${dec.cur > 0 ? ' (' + ((dec.diff / dec.prev) * 100).toFixed(0) + '%)' : ' · none this month'}`) : ins('flat', '＝', 'Biggest saving', 'None', 'No category went down')) +
            ins(mvTone(ad, false), ad > 0 ? '▲' : ad < 0 ? '▼' : '＝', 'Average per day', fmt(avgC), `${esc(prevFull)}: ${fmt(avgP)} · ${signedMoney(ad)} a day`);

        box.innerHTML = `
            <div class="card mv-hero"><span class="mv-hero-ic ${heroCls}" aria-hidden="true">${heroIc}</span><div class="mv-hero-text">${heroTxt}</div></div>
            <div class="mv-kpis">
                ${kpi('Spending', '💸', S, sd, sPct, sTone)}
                ${kpi('Income', '💰', I, id, iPct, iTone)}
                ${kpi('Left over', '🏦', N, nd, nPct, nTone, N.cur < 0 ? 'text-danger' : '')}
            </div>
            <div class="mv-grid">
                <div class="card">
                    <div class="card-header"><h2>Spending day by day</h2><span style="font-size:0.76rem;color:var(--text-muted)">Running total</span></div>
                    <div class="mv-chart-wrap"><div id="mv-chart"></div><div class="mv-tip" id="mv-tip" role="status"></div></div>
                    <div class="mv-legend"><span><i style="border-color:var(--mv-now)"></i>${esc(curLabel)}</span><span><i class="prev" style="border-color:var(--mv-prev)"></i>${esc(prevLabel)}</span></div>
                </div>
                <div class="card">
                    <div class="card-header"><h2>By category</h2><span style="font-size:0.76rem;color:var(--text-muted)">${esc(curFull)} ▪ ${esc(prevFull)}</span></div>
                    <div class="mv-legend" style="margin:0 0 14px"><span><i style="border-color:var(--mv-now)"></i>${esc(curLabel)}</span><span><i style="border-color:var(--mv-prev)"></i>${esc(prevLabel)}</span></div>
                    <div class="mv-cats">${catHtml}</div>
                    ${rows.length > shown.length ? `<div class="mv-note">Showing the ${shown.length} biggest categories of ${rows.length}.</div>` : ''}
                </div>
            </div>
            <div class="mv-insights">${insights}</div>
            <div class="mv-note">${samePoint ? `Both months are compared up to day ${cutPrev} so a part-way month is not judged against a full one. Switch to “Full previous month” to see the whole of ${esc(prevFull)}.` : `Spending excludes the carried-over balance line. Green means better for you (less spending, more income), red means worse.`}</div>`;

        // cumulative chart
        const cumNow = [0], cumPrev = [0];
        for (let d = 1; d <= dimCur; d++) cumNow[d] = cumNow[d - 1] + spCur[d];
        for (let d = 1; d <= dimPrev; d++) cumPrev[d] = cumPrev[d - 1] + spPrev[d];
        mvChartState = { cumNow, cumPrev, dimCur, dimPrev, todayDay: cutCur, isCurrent, curLabel, prevLabel };
        mvDrawChart();
    }

    function mvNiceStep(maxVal, ticks) {
        const rough = maxVal / ticks, mag = Math.pow(10, Math.floor(Math.log10(rough))), n = rough / mag;
        return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
    }
    function mvDrawChart() {
        const st = mvChartState, host = document.getElementById('mv-chart');
        if (!st || !host) return;
        mvLastWidth = host.clientWidth;
        const W = Math.max(280, Math.round(host.clientWidth || 560)), H = 280, pl = 54, pr = 14, pt = 12, pb = 28;
        const iw = W - pl - pr, ih = H - pt - pb;
        const nowEnd = st.isCurrent ? Math.min(st.todayDay, st.dimCur) : st.dimCur;
        const days = Math.max(st.dimCur, st.dimPrev);
        const maxVal = Math.max(100, st.cumNow[nowEnd], st.cumPrev[st.dimPrev]);
        const step = mvNiceStep(maxVal, 4), tickN = Math.ceil(maxVal / step), top = tickN * step;
        const x = d => pl + ((d - 1) / Math.max(1, days - 1)) * iw;
        const y = v => pt + (1 - v / top) * ih;
        const compact = top >= 10000;
        let grid = '', xl = '';
        for (let t = 0; t <= tickN; t++) {
            const v = t * step, yy = y(v);
            grid += `<line class="mv-grid-line" x1="${pl}" x2="${W - pr}" y1="${yy.toFixed(1)}" y2="${yy.toFixed(1)}"/><text class="mv-axis" x="${pl - 8}" y="${(yy + 4).toFixed(1)}" text-anchor="end">${compact ? fmtCompact.format(v) : '$' + Math.round(v).toLocaleString('en-AU')}</text>`;
        }
        const every = W < 480 ? 7 : 5;
        for (let d = 1; d <= days; d++) if (d === 1 || d % every === 0 || (d === days && days % every >= 3)) xl += `<text class="mv-axis" x="${x(d).toFixed(1)}" y="${H - 8}" text-anchor="middle">${d}</text>`;
        const path = (arr, end) => { let p = ''; for (let d = 1; d <= end; d++) p += (d === 1 ? 'M' : 'L') + x(d).toFixed(1) + ',' + y(arr[d]).toFixed(1); return p; };
        const nowPath = path(st.cumNow, nowEnd), prevPath = path(st.cumPrev, st.dimPrev);
        const area = nowPath + `L${x(nowEnd).toFixed(1)},${y(0).toFixed(1)}L${x(1).toFixed(1)},${y(0).toFixed(1)}Z`;
        const endDot = (d, v, c) => `<circle class="mv-dot" cx="${x(d).toFixed(1)}" cy="${y(v).toFixed(1)}" r="5" fill="${c}"/>`;
        host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Running total of spending by day: ${esc(st.curLabel)} ends at ${esc(fmt(st.cumNow[nowEnd]))}, ${esc(st.prevLabel)} ends at ${esc(fmt(st.cumPrev[st.dimPrev]))}">
            ${grid}${xl}
            <path class="mv-area-now" d="${area}"/>
            <path class="mv-line-prev" d="${prevPath}"/>
            <path class="mv-line-now" d="${nowPath}"/>
            ${endDot(st.dimPrev, st.cumPrev[st.dimPrev], 'var(--mv-prev)')}${endDot(nowEnd, st.cumNow[nowEnd], 'var(--mv-now)')}
            <line class="mv-cross" id="mv-cross" y1="${pt}" y2="${H - pb}"/>
            <circle class="mv-dot mv-hover-dot" id="mv-hd-now" r="5" fill="var(--mv-now)"/><circle class="mv-dot mv-hover-dot" id="mv-hd-prev" r="5" fill="var(--mv-prev)"/>
            <rect x="${pl}" y="${pt}" width="${iw}" height="${ih + pb}" fill="transparent" id="mv-hit"/>
        </svg>`;
        const svg = host.querySelector('svg'), tip = document.getElementById('mv-tip'), wrap = host.parentElement;
        const cross = svg.querySelector('#mv-cross'), hdN = svg.querySelector('#mv-hd-now'), hdP = svg.querySelector('#mv-hd-prev');
        const hide = () => { tip.classList.remove('show'); cross.style.opacity = 0; hdN.style.opacity = 0; hdP.style.opacity = 0; };
        const row = (color, dash, name, val) => {
            const r = document.createElement('div'); r.className = 't-row';
            const k = document.createElement('span'); k.className = 't-key';
            const sw = document.createElement('i'); sw.className = 't-sw'; sw.style.background = color; if (dash) sw.style.opacity = 0.8;
            k.appendChild(sw); k.appendChild(document.createTextNode(name));
            const v = document.createElement('span'); v.className = 't-val'; v.textContent = val;
            r.appendChild(k); r.appendChild(v); return r;
        };
        svg.addEventListener('pointermove', e => {
            const rect = svg.getBoundingClientRect();
            const px = (e.clientX - rect.left) * (W / rect.width);
            const d = Math.min(days, Math.max(1, Math.round(((px - pl) / iw) * (days - 1) + 1)));
            const hasNow = d <= nowEnd, hasPrev = d <= st.dimPrev;
            const vn = hasNow ? st.cumNow[d] : null, vp = hasPrev ? st.cumPrev[d] : null;
            tip.textContent = '';
            const t = document.createElement('div'); t.className = 't-title'; t.textContent = 'Day ' + d; tip.appendChild(t);
            tip.appendChild(row('var(--mv-now)', false, st.curLabel, vn === null ? '—' : fmt(vn)));
            tip.appendChild(row('var(--mv-prev)', true, st.prevLabel, vp === null ? '—' : fmt(vp)));
            if (vn !== null && vp !== null) { const df = vn - vp; tip.appendChild(row('var(--text-muted)', false, 'Difference', (Math.abs(df) < 0.005 ? '' : df > 0 ? '+' : '−') + fmt(Math.abs(df)))); }
            tip.classList.add('show');
            const tw = tip.offsetWidth, xx = x(d) * (rect.width / W);
            tip.style.left = Math.min(Math.max(xx - tw / 2, 0), Math.max(0, wrap.clientWidth - tw)) + 'px';
            cross.setAttribute('x1', x(d)); cross.setAttribute('x2', x(d)); cross.style.opacity = 0.7;
            if (hasNow) { hdN.setAttribute('cx', x(d)); hdN.setAttribute('cy', y(vn)); hdN.style.opacity = 1; } else hdN.style.opacity = 0;
            if (hasPrev) { hdP.setAttribute('cx', x(d)); hdP.setAttribute('cy', y(vp)); hdP.style.opacity = 1; } else hdP.style.opacity = 0;
        });
        svg.addEventListener('pointerleave', hide);
    }
    function renderMultiYearSummary() {
        let multiYearData = [];
        let maxVal = 1000;
        allYears.forEach(yr => {
            let monthKeys = getMonthKeysOrderForYear(yr);
            let yIncome = 0, ySpend = 0;
            monthKeys.forEach(mKey => {
                if (datasets[mKey] && datasets[mKey].data) {
                    let txs = datasets[mKey].data;
                    yIncome += txs.filter(t => !isRolloverTx(t) && (parseFloat(t.credit) || 0) > 0).reduce((acc, t) => acc + (parseFloat(t.credit) || 0), 0);
                    ySpend += txs.filter(t => (parseFloat(t.debit) || 0) > 0).reduce((acc, t) => acc + (parseFloat(t.debit) || 0), 0);
                }
            });
            let ySavings = yIncome - ySpend;
            multiYearData.push({ year: yr, income: yIncome, spend: ySpend, savings: ySavings, avgSpend: ySpend / 12 });
            maxVal = Math.max(maxVal, yIncome, ySpend, Math.abs(ySavings));
        });
        const chartEl = document.getElementById('multi-year-bar-chart');
        chartEl.innerHTML = '';
        multiYearData.forEach(d => {
            let incHeight = Math.round((d.income / maxVal) * 100);
            let spdHeight = Math.round((d.spend / maxVal) * 100);
            let savHeight = Math.round((Math.max(0, d.savings) / maxVal) * 100);
            let col = document.createElement('div');
            col.className = 'bar-column';
            col.innerHTML = `
                <div class="bar-tooltip">
                    <strong>Year ${d.year}</strong><br>
                    Income: ${fmt(d.income)}<br>
                    Spend: ${fmt(d.spend)}<br>
                    Net Savings: ${fmt(d.savings)}
                </div>
                <div class="bar-group-flex">
                    <div class="bar-bar bar-income" style="height: ${incHeight}%;"></div>
                    <div class="bar-bar bar-spend" style="height: ${spdHeight}%;"></div>
                    <div class="bar-bar bar-savings" style="height: ${savHeight}%;"></div>
                </div>
                <div class="bar-label">${d.year}</div>
            `;
            chartEl.appendChild(col);
        });
        const tbody = document.getElementById('multi-year-tbody');
        tbody.innerHTML = '';
        multiYearData.forEach(d => {
            let tr = document.createElement('tr');
            let savClass = d.savings >= 0 ? 'text-success' : 'text-danger';
            tr.innerHTML = `
                <td style="font-weight: 700;">${d.year}</td>
                <td class="col-num text-success">${fmt(d.income)}</td>
                <td class="col-num text-danger">${fmt(d.spend)}</td>
                <td class="col-num ${savClass}" style="font-weight: 700;">${fmt(d.savings)}</td>
                <td class="col-num" style="color: var(--accent);">${fmt(d.avgSpend)}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    function renderAnnualSummary() {
        ensureYearDatasetsExist(selectedYear);
        let monthKeys = getMonthKeysOrderForYear(selectedYear);
        let totalIncomeAll = 0, totalSpendAll = 0;
        let monthlyDataList = [];
        let annualCatMap = {};
        monthKeys.forEach((mKey, idx) => {
            let txs = datasets[mKey] ? datasets[mKey].data || [] : [];
            let mIncome = txs.filter(t => !isRolloverTx(t) && (parseFloat(t.credit) || 0) > 0).reduce((acc, t) => acc + (parseFloat(t.credit) || 0), 0);
            let mSpend = txs.filter(t => (parseFloat(t.debit) || 0) > 0).reduce((acc, t) => acc + (parseFloat(t.debit) || 0), 0);
            totalIncomeAll += mIncome;
            totalSpendAll += mSpend;
            txs.forEach(t => {
                let dVal = parseFloat(t.debit) || 0;
                if (t.cost && dVal > 0) annualCatMap[t.cost] = (annualCatMap[t.cost] || 0) + dVal;
            });
            const shortNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            monthlyDataList.push({ name: shortNames[idx], income: mIncome, spend: mSpend, diff: mIncome - mSpend });
        });
        let netSavings = totalIncomeAll - totalSpendAll;
        let avgSpend = totalSpendAll / 12;
        document.getElementById('annual-chart-title').innerText = `Monthly Income vs Spends Performance (${selectedYear})`;
        document.getElementById('ann-total-income').innerText = `${fmt(totalIncomeAll)}`;
        document.getElementById('ann-total-spends').innerText = `${fmt(totalSpendAll)}`;
        let netEl = document.getElementById('ann-net-savings');
        netEl.innerText = `${fmt(netSavings)}`;
        netEl.className = netSavings >= 0 ? 'stat-card-value text-success' : 'stat-card-value text-danger';
        document.getElementById('ann-avg-spend').innerText = `${fmt(avgSpend)}`;
        const chartEl = document.getElementById('annual-bar-chart');
        chartEl.innerHTML = '';
        let maxVal = Math.max(...monthlyDataList.map(m => Math.max(m.income, m.spend)), 1000);
        monthlyDataList.forEach(m => {
            let incomeHeight = Math.round((m.income / maxVal) * 100);
            let spendHeight = Math.round((m.spend / maxVal) * 100);
            let col = document.createElement('div');
            col.className = 'bar-column';
            col.innerHTML = `
                <div class="bar-tooltip">
                    <strong>${m.name} ${selectedYear}</strong><br>
                    Income: ${fmt(m.income)}<br>
                    Spend: ${fmt(m.spend)}<br>
                    Diff: ${m.diff >= 0 ? '+' : ''}${fmt(m.diff)}
                </div>
                <div class="bar-group-flex">
                    <div class="bar-bar bar-income" style="height: ${incomeHeight}%;"></div>
                    <div class="bar-bar bar-spend" style="height: ${spendHeight}%;"></div>
                </div>
                <div class="bar-label">${m.name}</div>
            `;
            chartEl.appendChild(col);
        });
        let catTbody = document.getElementById('annual-categories-tbody');
        catTbody.innerHTML = '';
        Object.keys(annualCatMap).sort((a, b) => annualCatMap[b] - annualCatMap[a]).slice(0, 20).forEach((cat, index) => {
            let amt = annualCatMap[cat];
            let share = totalSpendAll > 0 ? (amt / totalSpendAll) * 100 : 0;
            let tr = document.createElement('tr');
            tr.innerHTML = `
                <td><span style="color:var(--text-muted); font-size:0.7rem; margin-right:6px;">#${index + 1}</span>${esc(cat)}</td>
                <td class="col-num">${fmt(amt)}</td>
                <td style="padding-left: 12px;">
                    <div class="progress-cell">
                        <span style="font-size:0.7rem;">${share.toFixed(1)}%</span>
                        <div class="progress-bar-bg"><div class="progress-bar-fill" style="width: ${share}%"></div></div>
                    </div>
                </td>
            `;
            catTbody.appendChild(tr);
        });
        let monthsTbody = document.getElementById('annual-months-tbody');
        monthsTbody.innerHTML = '';
        const fullMonthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        monthlyDataList.forEach((m, idx) => {
            let diffClass = m.diff >= 0 ? 'text-success' : 'text-danger';
            let diffSign = m.diff >= 0 ? '+' : '';
            let tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-weight: 500;">${fullMonthNames[idx]}</td>
                <td class="col-num text-success">${fmt(m.income)}</td>
                <td class="col-num text-danger">${fmt(m.spend)}</td>
                <td class="col-num ${diffClass}" style="font-weight: 700;">${diffSign}${fmt(m.diff)}</td>
            `;
            monthsTbody.appendChild(tr);
        });
    }

    function calculateMetrics() {
        let transactions = datasets[activeMonthKey].data;
        let prevBal = transactions.filter(t => isRolloverTx(t)).reduce((acc, t) => acc + (parseFloat(t.credit) || 0), 0);
        let paidCredits = transactions
            .filter(t => !isRolloverTx(t) && t.paid.toLowerCase() === 'yes' && (parseFloat(t.credit) || 0) > 0)
            .reduce((acc, t) => acc + (parseFloat(t.credit) || 0), 0);
        let creditsRcvdTotal = prevBal + paidCredits;
        let debitsPaid = transactions
            .filter(t => t.paid.toLowerCase() === 'yes' && (parseFloat(t.debit) || 0) > 0)
            .reduce((acc, t) => acc + (parseFloat(t.debit) || 0), 0);
        let currBal = creditsRcvdTotal - debitsPaid;
        let creditsRecv = transactions
            .filter(t => !isRolloverTx(t) && t.paid.toUpperCase() === 'NO' && (parseFloat(t.credit) || 0) > 0)
            .reduce((acc, t) => acc + (parseFloat(t.credit) || 0), 0);
        let debitsPay = transactions
            .filter(t => t.paid.toUpperCase() === 'NO' && (parseFloat(t.debit) || 0) > 0)
            .reduce((acc, t) => acc + (parseFloat(t.debit) || 0), 0);
        let projBal = currBal + creditsRecv - debitsPay;
        let totalCreditsAll = transactions.filter(t => (parseFloat(t.credit) || 0) > 0).reduce((acc, t) => acc + (parseFloat(t.credit) || 0), 0);
        document.getElementById('lbl-credits-rcvd').innerText = `${fmt(creditsRcvdTotal)}`;
        document.getElementById('lbl-debits-paid').innerText = `${fmt(debitsPaid)}`;
        const psToPayEl = document.getElementById('lbl-ps-debits-topay');
        psToPayEl.innerText = `${fmt(debitsPay)}`;
        psToPayEl.className = debitsPay > 0 ? 'text-danger' : '';
        document.getElementById('lbl-curr-bal').innerText = `${fmt(currBal)}`;
        document.getElementById('lbl-curr-bal').classList.toggle('text-danger', currBal < 0);
        const creditsRecvEl = document.getElementById('lbl-credits-recv');
        creditsRecvEl.innerText = `${fmt(creditsRecv)}`;
        creditsRecvEl.className = creditsRecv > 0 ? 'text-success' : '';
        const debitsPayEl = document.getElementById('lbl-debits-pay');
        debitsPayEl.innerText = `${fmt(debitsPay)}`;
        debitsPayEl.className = debitsPay > 0 ? 'text-danger' : '';
        document.getElementById('lbl-proj-bal').innerText = `${fmt(projBal)}`;
        document.getElementById('lbl-proj-bal').classList.toggle('text-danger', projBal < 0);
        let fixedTotal = transactions.filter(t => t.type === 'Fixed').reduce((acc, t) => acc + (parseFloat(t.debit) || 0), 0);
        let varTotal = transactions.filter(t => t.type === 'Variable').reduce((acc, t) => acc + (parseFloat(t.debit) || 0), 0);
        let totalDebits = transactions.reduce((acc, t) => acc + (parseFloat(t.debit) || 0), 0);
        document.getElementById('lbl-fixed').innerText = `${fmt(fixedTotal)}`;
        document.getElementById('lbl-fixed-pct').innerText = `(${totalDebits > 0 ? ((fixedTotal/totalDebits)*100).toFixed(1) : 0}%)`;
        document.getElementById('lbl-variable').innerText = `${fmt(varTotal)}`;
        document.getElementById('lbl-variable-pct').innerText = `(${totalDebits > 0 ? ((varTotal/totalDebits)*100).toFixed(1) : 0}%)`;
        document.getElementById('lbl-total-debits').innerText = `${fmt(totalDebits)}`;
        let catMap = {};
        transactions.forEach(t => {
            if (t.cost && (parseFloat(t.debit) || 0) > 0) {
                catMap[t.cost] = (catMap[t.cost] || 0) + parseFloat(t.debit);
            }
        });
        let catTbody = document.getElementById('category-tbody');
        catTbody.innerHTML = '';
        Object.keys(catMap).sort((a, b) => catMap[b] - catMap[a]).forEach(cat => {
            let amt = catMap[cat];
            let baseLimit = getCategoryBudgetForMonth(cat, activeMonthKey);
            let rolloverCarryover = getCategoryRolloverCarryover(cat, activeMonthKey);
            let effectiveLimit = baseLimit + rolloverCarryover;
            let displayInfo = '';
            if (effectiveLimit > 0) {
                let pctUsed = Math.min((amt / effectiveLimit) * 100, 100);
                let isOver = amt > effectiveLimit;
                let barClass = isOver ? 'progress-bar-fill over-budget' : (pctUsed >= 80 ? 'progress-bar-fill warn' : 'progress-bar-fill');
                let rolloverLabel = rolloverCarryover > 0 ? ` (+$${rolloverCarryover.toFixed(0)} roll)` : '';
                displayInfo = `
                    <div class="progress-cell" title="Budget: ${fmt(effectiveLimit)}${rolloverLabel} (${pctUsed.toFixed(1)}%)">
                        <span style="font-size:0.7rem; color:${isOver ? 'var(--danger)' : 'var(--text-muted)'}">$${effectiveLimit.toFixed(0)}${rolloverLabel} (${pctUsed.toFixed(0)}%)</span>
                        <div class="progress-bar-bg"><div class="${barClass}" style="width: ${pctUsed}%"></div></div>
                    </div>
                `;
            } else {
                let share = totalDebits > 0 ? (amt / totalDebits) * 100 : 0;
                displayInfo = `
                    <div class="progress-cell">
                        <span style="font-size:0.7rem;">${share.toFixed(1)}%</span>
                        <div class="progress-bar-bg"><div class="progress-bar-fill" style="width: ${share}%"></div></div>
                    </div>
                `;
            }
            let tr = document.createElement('tr');
            tr.innerHTML = `
                <td><button type="button" class="cat-link" title="See every ${esc(cat)} line in Transactions"></button></td>
                <td class="col-num">${fmt(amt)}</td>
                <td style="padding-left: 12px;">${displayInfo}</td>
            `;
            const link = tr.querySelector('.cat-link');
            link.textContent = cat;
            link.onclick = () => openCategoryInLedger(cat);
            catTbody.appendChild(tr);
        });
        renderBudgetHealth(catMap, projBal, transactions);
        renderUpcomingSummary();
        renderCategoryComparison();
        let catTfoot = document.getElementById('category-tfoot');
        catTfoot.innerHTML = `
            <tr>
                <td style="font-weight: 700; color: var(--text-muted);">Total</td>
                <td class="col-num text-danger" style="font-weight: 700;">${fmt(totalDebits)}</td>
                <td style="padding-left: 12px; font-weight: 700;">100.0%</td>
            </tr>
        `;
        let creditMap = {};
        transactions.forEach(t => {
            let cVal = parseFloat(t.credit) || 0;
            if (cVal > 0) {
                let cKey = t.creditCat ? t.creditCat : (t.method === 'Previous Balance' ? 'Starting Balance' : 'Other Credits');
                creditMap[cKey] = (creditMap[cKey] || 0) + cVal;
            }
        });
        let creditsTbody = document.getElementById('credits-breakdown-tbody');
        creditsTbody.innerHTML = '';
        Object.keys(creditMap).sort((a, b) => creditMap[b] - creditMap[a]).forEach(cCat => {
            let amt = creditMap[cCat];
            let share = totalCreditsAll > 0 ? (amt / totalCreditsAll) * 100 : 0;
            let tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${esc(cCat)}</td>
                <td class="col-num">${fmt(amt)}</td>
                <td style="padding-left: 12px;">
                    <div class="progress-cell">
                        <span style="font-size:0.7rem;">${share.toFixed(1)}%</span>
                        <div class="progress-bar-bg"><div class="progress-bar-fill success-fill" style="width: ${share}%"></div></div>
                    </div>
                </td>
            `;
            creditsTbody.appendChild(tr);
        });
        let creditsTfoot = document.getElementById('credits-breakdown-tfoot');
        creditsTfoot.innerHTML = `
            <tr>
                <td style="font-weight: 700; color: var(--text-muted);">Total</td>
                <td class="col-num text-success" style="font-weight: 700;">${fmt(totalCreditsAll)}</td>
                <td style="padding-left: 12px; font-weight: 700;">100.0%</td>
            </tr>
        `;
        let methodMap = {};
        transactions.forEach(t => {
            if (t.method && t.method !== 'Previous Balance' && (parseFloat(t.debit) || 0) > 0) {
                methodMap[t.method] = (methodMap[t.method] || 0) + parseFloat(t.debit);
            }
        });
        let methodsTbody = document.getElementById('methods-tbody');
        methodsTbody.innerHTML = '';
        let totalMethodDebits = Object.values(methodMap).reduce((a, b) => a + b, 0);
        Object.keys(methodMap).sort((a, b) => methodMap[b] - methodMap[a]).forEach(m => {
            let amt = methodMap[m];
            let share = totalMethodDebits > 0 ? (amt / totalMethodDebits) * 100 : 0;
            let tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${esc(m)}</td>
                <td class="col-num">${fmt(amt)}</td>
                <td style="padding-left: 12px;">${share.toFixed(1)}%</td>
            `;
            methodsTbody.appendChild(tr);
        });
        renderOverview();
        renderTxSummary();
    }
