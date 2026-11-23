/* PLANNING: savings goals, subscriptions, the cash-flow forecast and the Investments page.
   Part of the Financial Movement Dashboard. Plain script (not a module): functions here are shared with the other js files. */

    function getYearNetStats(yr) {
        let income = 0, spend = 0, months = 0;
        getMonthKeysOrderForYear(yr).forEach(k => {
            const ds = datasets[k];
            ((ds && ds.data) || []).forEach(t => {
                const c = parseFloat(t.credit) || 0, d = parseFloat(t.debit) || 0;
                if (c > 0 && !isRolloverTx(t)) income += c;
                if (d > 0) spend += d;
            });
            if (ds && Array.isArray(ds.data) && ds.data.some(x => !isRolloverTx(x))) months++;
        });
        if (!months) months = 1;
        return { net: income - spend, months, avg: (income - spend) / months };
    }

    function addGoal() {
        const name = document.getElementById('goal-name').value.trim();
        const target = parseFloat(document.getElementById('goal-target').value) || 0;
        const saved = parseFloat(document.getElementById('goal-saved').value) || 0;
        const deadline = document.getElementById('goal-deadline').value;
        if (!name || target <= 0) { showToast('Enter a goal name and a target above $0', true); return; }
        savingsGoals.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, target, saved: Math.max(0, saved), deadline });
        ['goal-name', 'goal-target', 'goal-saved', 'goal-deadline'].forEach(id => { document.getElementById(id).value = ''; });
        renderGoals();
        saveToSupabase();
        showToast(`Goal "${name}" added`);
    }

    function contributeToGoal(id) {
        const g = savingsGoals.find(x => x.id === id);
        if (!g) return;
        const input = prompt(`Add funds to "${g.name}" (use a negative number to withdraw):`, '');
        if (input === null) return;
        const v = parseFloat(input);
        if (!isFinite(v) || v === 0) { showToast('Enter a valid amount', true); return; }
        g.saved = Math.max(0, (Number(g.saved) || 0) + v);
        renderGoals();
        saveToSupabase();
    }

    function editGoalTarget(id) {
        const g = savingsGoals.find(x => x.id === id);
        if (!g) return;
        const input = prompt(`New target amount for "${g.name}":`, g.target);
        if (input === null) return;
        const v = parseFloat(input);
        if (!isFinite(v) || v <= 0) { showToast('Enter a valid target', true); return; }
        g.target = v;
        renderGoals();
        saveToSupabase();
    }

    function deleteGoal(id) {
        const g = savingsGoals.find(x => x.id === id);
        if (!g || !confirm(`Delete goal "${g.name}"?`)) return;
        savingsGoals = savingsGoals.filter(x => x.id !== id);
        renderGoals();
        saveToSupabase();
    }

    function renderGoals() {
        const list = document.getElementById('goals-list');
        if (!list) return;
        const now = new Date();
        const stats = getYearNetStats(selectedYear);
        let totalTarget = 0, totalSaved = 0, totalNeeded = 0;
        list.innerHTML = '';
        if (!savingsGoals.length) {
            list.innerHTML = '<div class="empty-goals">No goals yet. Add one above, e.g. an emergency fund, a holiday or a car deposit.</div>';
        }
        savingsGoals.forEach(g => {
            const target = Number(g.target) || 0;
            const saved = Number(g.saved) || 0;
            const remaining = Math.max(0, target - saved);
            const pct = target > 0 ? Math.min(100, (saved / target) * 100) : 0;
            totalTarget += target;
            totalSaved += Math.min(saved, target);
            let chip = '<span class="chip">No target date</span>';
            let deadlineText = '';
            if (g.deadline) {
                const dl = new Date(g.deadline + 'T00:00:00');
                const monthsLeft = (dl - now) / (1000 * 60 * 60 * 24 * 30.44);
                deadlineText = `Target date ${toAUFormat(g.deadline)}`;
                if (remaining <= 0) { chip = '<span class="chip chip-ok">Goal reached 🎉</span>'; }
                else if (monthsLeft <= 0) { chip = '<span class="chip chip-bad">Past target date</span>'; }
                else {
                    const needed = remaining / Math.max(1, Math.ceil(monthsLeft));
                    totalNeeded += needed;
                    chip = `<span class="chip">Need ${fmt(needed)}/month</span>`;
                }
            } else if (remaining <= 0) { chip = '<span class="chip chip-ok">Goal reached 🎉</span>'; }
            const card = document.createElement('div');
            card.className = 'goal-card';
            card.innerHTML = `
                <div class="goal-top">
                    <span class="goal-name">${esc(g.name)}</span>
                    <span class="goal-pct">${pct.toFixed(0)}%</span>
                </div>
                <div class="progress-bar-bg"><div class="progress-bar-fill ${remaining <= 0 ? 'success-fill' : ''}" style="width: ${pct}%"></div></div>
                <div class="goal-amounts"><span>${fmt(saved)} saved</span><span>of ${fmt(target)}</span></div>
                <div class="goal-meta">${chip}<span>${esc(deadlineText)}</span></div>
                <div class="goal-actions">
                    <button class="btn" style="padding: 5px 10px; font-size: 0.75rem;" onclick="contributeToGoal('${g.id}')">+ Add funds</button>
                    <button class="btn-secondary" onclick="editGoalTarget('${g.id}')" title="Change target">✏️</button>
                    <button class="btn-danger" onclick="deleteGoal('${g.id}')" title="Delete goal">✕</button>
                </div>
            `;
            list.appendChild(card);
        });
        document.getElementById('goals-total-saved').innerText = fmt(totalSaved);
        document.getElementById('goals-total-target').innerText = fmt(totalTarget);
        document.getElementById('goals-needed').innerText = fmt(totalNeeded);
        document.getElementById('goals-avg-title').innerText = `Avg Net Savings / Month (${selectedYear})`;
        const avgEl = document.getElementById('goals-avg');
        avgEl.innerText = fmt(stats.avg);
        avgEl.className = 'stat-card-value ' + (stats.avg >= 0 ? 'text-success' : 'text-danger');
        const status = document.getElementById('goals-status');
        if (!savingsGoals.length) { status.className = 'chip'; status.innerText = 'No goals yet'; }
        else if (totalNeeded <= 0) { status.className = 'chip chip-ok'; status.innerText = 'Nothing due right now'; }
        else if (stats.avg >= totalNeeded) { status.className = 'chip chip-ok'; status.innerText = 'On track: your average savings cover these goals'; }
        else { status.className = 'chip chip-bad'; status.innerText = `Shortfall of ${fmt(totalNeeded - stats.avg)} per month`; }
    }

    function addMonthsClamped(d, n) {
        const day = d.getDate();
        const r = new Date(d.getFullYear(), d.getMonth() + n, 1);
        const last = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
        r.setDate(Math.min(day, last));
        return r;
    }
    function subOccurrence(sub, k) {
        const a = parseIso(sub.nextDue);
        if (!a) return null;
        switch (sub.cycle) {
            case 'weekly': return addDays(a, 7 * k);
            case 'fortnightly': return addDays(a, 14 * k);
            case 'quarterly': return addMonthsClamped(a, 3 * k);
            case 'yearly': return addMonthsClamped(a, 12 * k);
            default: return addMonthsClamped(a, k);
        }
    }
    function subOccurrencesBetween(sub, from, to) {
        const out = [];
        for (let k = 0; k < 4000; k++) {
            const d = subOccurrence(sub, k);
            if (!d || d > to) break;
            if (d >= from) out.push(d);
        }
        return out;
    }
    function subNextOccurrence(sub, from) {
        for (let k = 0; k < 4000; k++) {
            const d = subOccurrence(sub, k);
            if (!d) return null;
            if (d >= from) return d;
        }
        return null;
    }
    function subMonthlyCost(sub) {
        const c = SUB_CYCLES[sub.cycle] || SUB_CYCLES.monthly;
        return (Number(sub.amount) || 0) * c.perYear / 12;
    }

    function ledgerHasSubOccurrence(sub, occ) {
        const nm = String(sub.name || '').toLowerCase().trim();
        if (!nm) return false;
        const tol = (SUB_CYCLES[sub.cycle] || SUB_CYCLES.monthly).tol;
        for (let off = -1; off <= 1; off++) {
            const md = new Date(occ.getFullYear(), occ.getMonth() + off, 1);
            const ds = datasets[monthKeyOfDate(md)];
            if (!ds || !Array.isArray(ds.data)) continue;
            const hit = ds.data.some(t => {
                if (isRolloverTx(t) || !((parseFloat(t.debit) || 0) > 0)) return false;
                const td = String(t.desc || '').toLowerCase().trim();
                if (!td || !(td.includes(nm) || (td.length >= 3 && nm.includes(td)))) return false;
                const dt = parseTxDate(t.date);
                return dt ? Math.abs(daysBetween(dt, occ)) <= tol : false;
            });
            if (hit) return true;
        }
        return false;
    }

    function buildForecast(days) {
        const today = startOfToday();
        const yr = String(today.getFullYear());
        if (!allYears.includes(yr)) return null;
        if (!datasets[monthKeyOfDate(today)]) ensureYearDatasetsExist(yr);
        const cur = datasets[monthKeyOfDate(today)];
        if (!cur) return null;
        const end = addDays(today, days);
        let start = 0;
        cur.data.forEach(t => {
            const c = parseFloat(t.credit) || 0, d = parseFloat(t.debit) || 0;
            if (isRolloverTx(t) || String(t.paid).toLowerCase() === 'yes') start += c - d;
        });
        const events = [];
        for (let off = -6; off <= 4; off++) {
            const md = new Date(today.getFullYear(), today.getMonth() + off, 1);
            const ds = datasets[monthKeyOfDate(md)];
            if (!ds || !Array.isArray(ds.data)) continue;
            ds.data.forEach(t => {
                if (isRolloverTx(t) || String(t.paid).toLowerCase() === 'yes') return;
                const amt = (parseFloat(t.credit) || 0) - (parseFloat(t.debit) || 0);
                if (!amt) return;
                const dt = parseTxDate(t.date) || (off === 0 ? today : md);
                const overdue = dt < today;
                const when = overdue ? today : dt;
                if (when > end) return;
                events.push({ date: when, desc: t.desc || '(no description)', amount: amt, source: 'Ledger', overdue, cat: t.cost || t.creditCat || '' });
            });
        }
        subscriptions.forEach(sub => {
            if (!sub.active) return;
            subOccurrencesBetween(sub, today, end).forEach(d => {
                if (ledgerHasSubOccurrence(sub, d)) return;
                events.push({ date: d, desc: sub.name, amount: -Math.abs(Number(sub.amount) || 0), source: 'Subscription', overdue: false, cat: sub.category || '' });
            });
        });
        events.sort((a, b) => (a.date - b.date) || (a.amount - b.amount));
        const series = [];
        let bal = start, ei = 0;
        for (let i = 0; i <= days; i++) {
            const flows = [];
            while (ei < events.length && daysBetween(today, events[ei].date) <= i) {
                bal += events[ei].amount;
                events[ei].after = bal;
                flows.push(events[ei]);
                ei++;
            }
            series.push({ date: addDays(today, i), balance: bal, flows });
        }
        let low = series[0];
        series.forEach(p => { if (p.balance < low.balance) low = p; });
        return {
            today, end, days, start, events, series, low,
            endBalance: series[series.length - 1].balance,
            firstNeg: series.find(p => p.balance < 0) || null,
            totalIn: events.filter(e => e.amount > 0).reduce((a, e) => a + e.amount, 0),
            totalOut: events.filter(e => e.amount < 0).reduce((a, e) => a + e.amount, 0)
        };
    }

    function setForecastDays(n) {
        forecastDays = n;
        document.querySelectorAll('#fc-pills .pill').forEach(p => p.classList.toggle('active', Number(p.dataset.days) === n));
        renderForecast();
    }

    function buildForecastSvg(f) {
        const W = 900, H = 300, pl = 66, pr = 18, pt = 16, pb = 30;
        const iw = W - pl - pr, ih = H - pt - pb;
        const vals = f.series.map(p => p.balance);
        let minV = Math.min(0, ...vals), maxV = Math.max(0, ...vals);
        if (maxV === minV) maxV = minV + 1;
        const pad = (maxV - minV) * 0.08;
        if (minV < 0) minV -= pad;
        maxV += pad;
        const rough = (maxV - minV) / 4;
        const mag = Math.pow(10, Math.floor(Math.log10(rough)));
        const norm = rough / mag;
        const tickStep = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
        minV = Math.floor(minV / tickStep) * tickStep;
        maxV = Math.ceil(maxV / tickStep) * tickStep;
        const n = Math.max(1, f.series.length - 1);
        const x = i => pl + (i / n) * iw;
        const y = v => pt + (1 - (v - minV) / (maxV - minV)) * ih;
        const y0 = y(0);
        let grid = '', ylab = '';
        for (let v = minV; v <= maxV + tickStep / 2; v += tickStep) {
            v = Math.round(v / tickStep) * tickStep;
            grid += `<line class="fc-grid-line" x1="${pl}" x2="${W - pr}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/>`;
            ylab += `<text class="fc-axis-text" x="${pl - 10}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${fmtCompact.format(v)}</text>`;
        }
        const zero = minV < 0 ? `<line class="fc-zero-line" x1="${pl}" x2="${W - pr}" y1="${y0.toFixed(1)}" y2="${y0.toFixed(1)}"/>` : '';
        let xlab = '';
        const step = Math.max(1, Math.ceil(n / 6));
        for (let i = 0; i <= n; i += step) {
            xlab += `<text class="fc-axis-text" x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="${i === 0 ? 'start' : 'middle'}">${i === 0 ? 'Today' : fmtDay(f.series[i].date)}</text>`;
        }
        let d = `M${x(0).toFixed(1)},${y(vals[0]).toFixed(1)}`;
        for (let i = 1; i <= n; i++) d += ` L${x(i).toFixed(1)},${y(vals[i - 1]).toFixed(1)} L${x(i).toFixed(1)},${y(vals[i]).toFixed(1)}`;
        const area = `${d} L${x(n).toFixed(1)},${y0.toFixed(1)} L${x(0).toFixed(1)},${y0.toFixed(1)} Z`;
        let hover = '', dots = '';
        const bw = iw / n;
        f.series.forEach((p, i) => {
            hover += `<rect x="${(x(i) - bw / 2).toFixed(1)}" y="${pt}" width="${bw.toFixed(1)}" height="${ih}" fill="transparent"><title>${esc(fmtDayLong(p.date))} — balance ${esc(fmt(p.balance))}</title></rect>`;
            if (p.flows.length) {
                const net = p.flows.reduce((a, e) => a + e.amount, 0);
                const tip = p.flows.map(e => `${e.desc}: ${signedMoney(e.amount)}`).join('\n');
                dots += `<circle class="fc-dot ${net >= 0 ? 'in' : 'out'}" cx="${x(i).toFixed(1)}" cy="${y(p.balance).toFixed(1)}" r="4.5"><title>${esc(fmtDayLong(p.date))}\n${esc(tip)}\nBalance after: ${esc(fmt(p.balance))}</title></circle>`;
            }
        });
        const li = f.series.indexOf(f.low);
        const lowMark = li >= 0 ? `<circle class="fc-low-ring" cx="${x(li).toFixed(1)}" cy="${y(f.low.balance).toFixed(1)}" r="8"/><text class="fc-low-label" x="${Math.min(Math.max(x(li), pl + 14), W - pr - 14).toFixed(1)}" y="${(y(f.low.balance) - 14).toFixed(1)}" text-anchor="middle">Low ${esc(fmtCompact.format(f.low.balance))}</text>` : '';
        return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Projected balance over the next ${f.days} days">
            <defs>
                <linearGradient id="fcAreaPos" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" style="stop-color: var(--accent); stop-opacity: 0.38"/><stop offset="100%" style="stop-color: var(--accent); stop-opacity: 0.02"/></linearGradient>
                <linearGradient id="fcAreaNeg" x1="0" y1="1" x2="0" y2="0"><stop offset="0%" style="stop-color: var(--danger); stop-opacity: 0.4"/><stop offset="100%" style="stop-color: var(--danger); stop-opacity: 0.03"/></linearGradient>
                <clipPath id="fcAbove"><rect x="0" y="0" width="${W}" height="${Math.max(0, y0).toFixed(1)}"/></clipPath>
                <clipPath id="fcBelow"><rect x="0" y="${y0.toFixed(1)}" width="${W}" height="${Math.max(0, H - y0).toFixed(1)}"/></clipPath>
            </defs>
            ${grid}${ylab}${xlab}
            <path d="${area}" fill="url(#fcAreaPos)" clip-path="url(#fcAbove)"/>
            <path d="${area}" fill="url(#fcAreaNeg)" clip-path="url(#fcBelow)"/>
            ${zero}
            <path class="fc-line pos" d="${d}" clip-path="url(#fcAbove)"/>
            <path class="fc-line neg" d="${d}" clip-path="url(#fcBelow)"/>
            ${hover}${dots}${lowMark}
        </svg>`;
    }

    function renderForecast() {
        const chart = document.getElementById('forecast-chart');
        if (!chart) return;
        const f = buildForecast(forecastDays);
        const banner = document.getElementById('fc-banner');
        if (!f) {
            chart.innerHTML = '<div class="empty-note">Forecast is only available for years that exist in the dashboard.</div>';
            banner.style.display = 'none';
            return;
        }
        banner.style.display = 'flex';
        const setVal = (id, v, colorize) => {
            const el = document.getElementById(id);
            el.innerText = fmt(v);
            if (colorize) el.classList.toggle('text-danger', v < 0);
        };
        setVal('fc-today', f.start, true);
        document.getElementById('fc-end-title').innerText = `Balance in ${f.days} Days`;
        setVal('fc-end', f.endBalance, true);
        const delta = f.endBalance - f.start;
        document.getElementById('fc-end-sub').innerText = `${delta >= 0 ? 'Up' : 'Down'} ${fmt(Math.abs(delta))} from today`;
        setVal('fc-low', f.low.balance, true);
        document.getElementById('fc-low-date').innerText = f.low.date.getTime() === f.today.getTime() ? 'Right now' : fmtDayLong(f.low.date);
        setVal('fc-safe', Math.max(0, f.low.balance), false);
        const overdue = f.events.filter(e => e.overdue).length;
        const overdueNote = overdue ? ` ${overdue} overdue pending item${overdue > 1 ? 's are' : ' is'} counted as due today.` : '';
        if (f.firstNeg) {
            banner.className = 'fc-banner bad';
            banner.innerText = `⚠️ Your balance is projected to go below $0 on ${fmtDayLong(f.firstNeg.date)} (lowest: ${fmt(f.low.balance)}). Move a bill or top up before then.${overdueNote}`;
        } else if (f.low.balance < 100) {
            banner.className = 'fc-banner warn';
            banner.innerText = `⚡ Tight: your balance drops to ${fmt(f.low.balance)} on ${fmtDayLong(f.low.date)}.${overdueNote}`;
        } else {
            banner.className = 'fc-banner ok';
            banner.innerText = `✓ You stay above $0 for the next ${f.days} days. Lowest point: ${fmt(f.low.balance)} on ${fmtDayLong(f.low.date)}.${overdueNote}`;
        }
        chart.innerHTML = buildForecastSvg(f);
        const tbody = document.getElementById('forecast-tbody');
        document.getElementById('fc-count').innerText = `${f.events.length} item${f.events.length === 1 ? '' : 's'} · ${fmt(Math.abs(f.totalOut))} out · ${fmt(f.totalIn)} in`;
        if (!f.events.length) {
            tbody.innerHTML = '<tr class="empty-state"><td colspan="5">Nothing pending or scheduled in this window.</td></tr>';
            return;
        }
        tbody.innerHTML = f.events.map(e => `
            <tr>
                <td>${esc(fmtDayLong(e.date))}${e.overdue ? ' <span class="tag tag-bad">Overdue</span>' : ''}</td>
                <td>${esc(e.desc)}${e.cat ? `<span style="color: var(--text-muted);"> · ${esc(e.cat)}</span>` : ''}</td>
                <td><span class="tag ${e.source === 'Subscription' ? 'tag-sub' : ''}">${e.source}</span></td>
                <td class="col-num ${e.amount < 0 ? 'text-danger' : 'text-success'}">${signedMoney(e.amount)}</td>
                <td class="col-num ${e.after < 0 ? 'text-danger' : ''}">${fmt(e.after)}</td>
            </tr>`).join('');
    }

    function renderUpcomingSummary() {
        const el = document.getElementById('bh-due7');
        if (!el) return;
        const f = buildForecast(7);
        if (!f) { el.innerText = '--'; el.className = ''; return; }
        const out = Math.abs(f.totalOut);
        el.innerText = out > 0 ? fmt(out) : fmt(0);
        el.className = out > 0 ? 'text-danger' : '';
    }

    function detectSubscriptionCandidates() {
        const found = {};
        const yrs = [String(selectedYear)];
        const prev = String(parseInt(selectedYear, 10) - 1);
        if (allYears.includes(prev)) yrs.push(prev);
        yrs.forEach(yr => {
            getMonthKeysOrderForYear(yr).forEach(key => {
                const ds = datasets[key];
                if (!ds || !Array.isArray(ds.data)) return;
                ds.data.forEach(t => {
                    const amt = parseFloat(t.debit) || 0;
                    const raw = String(t.desc || '').trim();
                    if (isRolloverTx(t) || amt <= 0 || raw.length < 2) return;
                    const k = raw.toLowerCase().replace(/\s+/g, ' ');
                    const dt = parseTxDate(t.date);
                    const rec = found[k] || (found[k] = { name: raw, amounts: [], months: new Set(), hasFixed: false, last: null, lastAmt: amt, cat: '' });
                    rec.amounts.push(amt);
                    rec.months.add(key);
                    if (t.type === 'Fixed') rec.hasFixed = true;
                    if (dt && (!rec.last || dt >= rec.last)) { rec.last = dt; rec.lastAmt = amt; rec.name = raw; rec.cat = t.cost || ''; }
                });
            });
        });
        return Object.keys(found).map(k => ({ key: k, ...found[k] })).filter(r => {
            if (r.months.size < 2 || !r.last) return false;
            if (!(r.hasFixed || r.months.size >= 3)) return false;
            const med = median(r.amounts);
            if (!(med > 0) || (Math.max(...r.amounts) - Math.min(...r.amounts)) / med > 0.15) return false;
            return !subscriptions.some(s => {
                const nm = String(s.name || '').toLowerCase().trim();
                return nm && (r.key.includes(nm) || nm.includes(r.key));
            });
        }).sort((a, b) => b.lastAmt - a.lastAmt).slice(0, 8);
    }

    function addSubscription() {
        const name = document.getElementById('sub-name').value.trim();
        const amount = parseFloat(document.getElementById('sub-amount').value) || 0;
        const cycle = document.getElementById('sub-cycle').value;
        const nextDue = document.getElementById('sub-next').value;
        const category = document.getElementById('sub-cat').value;
        if (!name || amount <= 0) { showToast('Enter a name and an amount above $0', true); return; }
        if (!SUB_CYCLES[cycle]) { showToast('Pick a billing cycle', true); return; }
        if (!parseIso(nextDue)) { showToast('Pick the next due date', true); return; }
        subscriptions.push({ id: newId(), name, amount, cycle, nextDue, category, active: true });
        ['sub-name', 'sub-amount', 'sub-next'].forEach(id => { document.getElementById(id).value = ''; });
        renderSubscriptions();
        saveToSupabase();
        showToast(`"${name}" is now tracked`);
    }

    function trackCandidate(i) {
        const c = subCandidates[i];
        if (!c) return;
        subscriptions.push({ id: newId(), name: c.name, amount: c.lastAmt, cycle: 'monthly', nextDue: isoDate(c.last), category: c.cat || '', active: true });
        renderSubscriptions();
        saveToSupabase();
        showToast(`"${c.name}" is now tracked`);
    }

    function toggleSubscription(id) {
        const s = subscriptions.find(x => x.id === id);
        if (!s) return;
        s.active = !s.active;
        renderSubscriptions();
        saveToSupabase();
        showToast(s.active ? `"${s.name}" resumed` : `"${s.name}" paused`);
    }

    function editSubscriptionAmount(id) {
        const s = subscriptions.find(x => x.id === id);
        if (!s) return;
        let input = prompt(`Edit "${s.name}"\nNew name (blank keeps "${s.name}"):`, s.name);
        if (input === null) return;
        const nm = input.trim();
        if (nm) s.name = nm;
        input = prompt(`Edit "${s.name}"\nNew ${SUB_CYCLES[s.cycle].label.toLowerCase()} amount ($):`, s.amount);
        if (input === null) { renderSubscriptions(); saveToSupabase(); return; }
        const amt = parseFloat(input);
        if (isFinite(amt) && amt > 0) s.amount = amt;
        input = prompt(`Edit "${s.name}"\nNew cycle (weekly / fortnightly / monthly / quarterly / yearly):`, s.cycle);
        if (input === null) { renderSubscriptions(); saveToSupabase(); return; }
        const cy = input.trim().toLowerCase();
        if (SUB_CYCLES[cy]) s.cycle = cy;
        input = prompt(`Edit "${s.name}"\nNew next-due date (YYYY-MM-DD, a past date works too):`, s.nextDue);
        if (input === null) { renderSubscriptions(); saveToSupabase(); return; }
        if (parseIso(input.trim())) s.nextDue = input.trim();
        renderSubscriptions();
        saveToSupabase();
        showToast(`"${s.name}" updated`);
    }

    function deleteSubscription(id) {
        const s = subscriptions.find(x => x.id === id);
        if (!s || !confirm(`Stop tracking "${s.name}"?`)) return;
        subscriptions = subscriptions.filter(x => x.id !== id);
        renderSubscriptions();
        saveToSupabase();
    }

    function renderSubscriptions() {
        const tbody = document.getElementById('subs-tbody');
        if (!tbody) return;
        const today = startOfToday();
        const sel = document.getElementById('sub-cat');
        const keep = sel.value;
        sel.innerHTML = '<option value="">Category (optional)</option>' + [...categories].sort().map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
        if ([...sel.options].some(o => o.value === keep)) sel.value = keep;
        const rows = subscriptions.map(s => ({ s, next: subNextOccurrence(s, today) })).sort((a, b) => {
            if (a.s.active !== b.s.active) return a.s.active ? -1 : 1;
            const ta = a.next ? a.next.getTime() : Infinity, tb = b.next ? b.next.getTime() : Infinity;
            return ta < tb ? -1 : ta > tb ? 1 : 0;
        });
        const active = rows.filter(r => r.s.active);
        const monthly = active.reduce((a, r) => a + subMonthlyCost(r.s), 0);
        document.getElementById('subs-monthly').innerText = fmt(monthly);
        document.getElementById('subs-yearly').innerText = fmt(monthly * 12);
        document.getElementById('subs-yearly-sub').innerText = monthly > 0 ? `About ${fmt(monthly * 12 / 52)} every week` : ' ';
        document.getElementById('subs-count').innerText = String(active.length);
        document.getElementById('subs-paused').innerText = rows.length - active.length ? `${rows.length - active.length} paused` : ' ';
        const soonest = active.filter(r => r.next)[0];
        document.getElementById('subs-next').innerText = soonest ? soonest.s.name : '--';
        document.getElementById('subs-next-date').innerText = soonest ? `${fmtDayLong(soonest.next)} · ${relDays(daysBetween(today, soonest.next))}` : ' ';
        if (!rows.length) {
            tbody.innerHTML = '<tr class="empty-state"><td colspan="8">Nothing tracked yet. Add one above, or pick from the detected charges below.</td></tr>';
        } else {
            tbody.innerHTML = rows.map(({ s, next }) => `
                <tr class="${s.active ? '' : 'sub-row-paused'}">
                    <td style="font-weight: 600;">${esc(s.name)}${s.active ? '' : ' <span class="tag tag-paused">Paused</span>'}</td>
                    <td>${esc(s.category || '--')}</td>
                    <td>${esc((SUB_CYCLES[s.cycle] || SUB_CYCLES.monthly).label)}</td>
                    <td class="col-num">${fmt(s.amount)}</td>
                    <td class="col-num">${fmt(subMonthlyCost(s))}</td>
                    <td class="col-num">${fmt(subMonthlyCost(s) * 12)}</td>
                    <td>${next ? `${esc(fmtDayLong(next))} <span style="color: var(--text-muted);">· ${relDays(daysBetween(today, next))}</span>` : '--'}</td>
                    <td class="col-action">
                        <div class="btn-action-row">
                            <label class="sub-toggle" title="${s.active ? 'Active — click to pause' : 'Paused — click to resume'}">
                                <input type="checkbox" aria-label="${s.active ? 'Pause subscription' : 'Resume subscription'}" ${s.active ? 'checked' : ''} onchange="toggleSubscription('${s.id}')">
                                <span class="st-track"><span class="st-knob"></span></span>
                                <span class="st-label">${s.active ? 'Active' : 'Paused'}</span>
                            </label>
                            <button class="btn-copy" onclick="editSubscriptionAmount('${s.id}')" title="Edit name, amount, cycle, next due">✏️</button>
                            <button class="btn-danger" onclick="deleteSubscription('${s.id}')" title="Stop tracking">✕</button>
                        </div>
                    </td>
                </tr>`).join('');
        }
        subCandidates = detectSubscriptionCandidates();
        const sug = document.getElementById('subs-suggestions');
        sug.innerHTML = subCandidates.length ? subCandidates.map((c, i) => `
            <div class="suggest-item">
                <div><strong>${esc(c.name)}</strong><small>Seen in ${c.months.size} months · about ${fmt(c.lastAmt)} each time${c.cat ? ' · ' + esc(c.cat) : ''}</small></div>
                <button class="btn" style="padding: 6px 12px; font-size: 0.78rem;" onclick="trackCandidate(${i})">Track monthly</button>
            </div>`).join('') : '<div class="empty-note">No untracked repeating charges found.</div>';
    }

    function renderUpcoming7() {
        const list = document.getElementById('ov-upcoming');
        const foot = document.getElementById('ov-upcoming-foot');
        if (!list) return;
        const f = buildForecast(7);
        if (!f) { list.innerHTML = '<div class="ov-empty">Forecast is not available for this year.</div>'; foot.innerHTML = ''; return; }
        const shown = f.events.slice(0, 6);
        list.innerHTML = shown.length ? shown.map(e => `
            <div class="ov-up-row">
                <span class="ov-up-date ${e.overdue ? 'late' : ''}">${e.overdue ? 'Overdue' : esc(fmtDay(e.date))}</span>
                <span class="ov-up-desc" title="${esc(e.desc)}">${esc(e.desc)}</span>
                <span class="ov-up-amt ${e.amount < 0 ? 'text-danger' : 'text-success'}">${esc(signedMoney(e.amount))}</span>
            </div>`).join('') : '<div class="ov-empty">Nothing due in the next 7 days 🎉</div>';
        foot.innerHTML = (f.events.length > shown.length ? `<span>+${f.events.length - shown.length} more</span>` : '') +
            `<span>Out ${esc(fmt(Math.abs(f.totalOut)))} · In ${esc(fmt(f.totalIn))}</span><span>Balance in 7 days: <strong class="${f.endBalance < 0 ? 'text-danger' : ''}">${esc(fmt(f.endBalance))}</strong></span>`;
    }

    function renderGoalsCard() {
        const list = document.getElementById('ov-goals');
        if (!list) return;
        if (!savingsGoals.length) {
            list.innerHTML = '<div class="ov-empty">No goals yet. <button type="button" class="ov-link" onclick="showView(\'goals\')">Add one</button></div>';
            return;
        }
        list.innerHTML = savingsGoals.slice(0, 3).map(g => {
            const target = Number(g.target) || 0, saved = Number(g.saved) || 0;
            const pct = target > 0 ? Math.min(100, saved / target * 100) : 0;
            return `<div class="ov-goal">
                <div class="ov-goal-top"><span title="${esc(g.name)}">${esc(g.name)}</span><span>${pct.toFixed(0)}%</span></div>
                <small>${esc(fmt(saved))} of ${esc(fmt(target))}${g.deadline ? ' · by ' + esc(toAUFormat(g.deadline)) : ''}</small>
                <div class="progress-bar-bg"><div class="progress-bar-fill ${pct >= 100 ? 'success-fill' : ''}" style="width: ${pct}%"></div></div>
            </div>`;
        }).join('') + (savingsGoals.length > 3 ? `<div class="ov-empty" style="padding-bottom:0;">+${savingsGoals.length - 3} more goal${savingsGoals.length - 3 === 1 ? '' : 's'}</div>` : '');
    }


/* ---------- INVESTMENTS ----------
   Anything whose category name contains "invest" counts:
   - an expense line (debit) with an "Investment..." category = money put in
   - a credit line with an "Investment Return..." category   = money coming back */
const INVEST_RE = /invest/i;

function investMonth(key) {
    const out = { put: [], ret: [], putTotal: 0, retTotal: 0 };
    const ds = datasets[key];
    ((ds && ds.data) || []).forEach(t => {
        if (isRolloverTx(t)) return;
        const d = parseFloat(t.debit) || 0, c = parseFloat(t.credit) || 0;
        const paid = String(t.paid || '').toLowerCase() === 'yes';
        if (d > 0 && INVEST_RE.test(t.cost || '')) { out.put.push({ t, amt: d, paid }); out.putTotal += d; }
        if (c > 0 && INVEST_RE.test(t.creditCat || '')) { out.ret.push({ t, amt: c, paid }); out.retTotal += c; }
    });
    return out;
}

function investGroup(lines) {
    const m = new Map();
    lines.forEach(l => {
        const label = String(l.t.desc || '').trim() || '(no description)';
        const k = label.toLowerCase();
        const g = m.get(k) || { label, amt: 0 };
        g.amt += l.amt;
        m.set(k, g);
    });
    return m;
}

function ivGoMonth(i) {
    const name = rawMonthNames[i];
    const dd = document.getElementById('month-dropdown');
    if (dd) dd.value = name;
    switchMonth(name);
}

function renderInvestments() {
    const box = document.getElementById('iv-body');
    if (!box) return;
    const key = activeMonthKey;
    const mName = rawMonthNames.find(m => key.startsWith(m));
    if (!mName) { box.innerHTML = ''; return; }
    const yr = parseInt(key.slice(mName.length), 10), mIdx = rawMonthNames.indexOf(mName);
    const prevDate = new Date(yr, mIdx - 1, 1), prevKey = monthKeyOfDate(prevDate);
    const curLabel = SHORT_MONTHS[mIdx] + ' ' + yr, prevLabel = SHORT_MONTHS[prevDate.getMonth()] + ' ' + prevDate.getFullYear();
    const curFull = new Date(yr, mIdx, 1).toLocaleString('en-AU', { month: 'long' });
    const prevFull = prevDate.toLocaleString('en-AU', { month: 'long' });
    document.getElementById('iv-sub').textContent = `${curLabel} against ${prevLabel}`;

    const cur = investMonth(key), prev = investMonth(prevKey);
    const months = rawMonthNames.map((n, i) => ({ i, ...investMonth(n + yr) }));
    const yPut = months.reduce((a, m) => a + m.putTotal, 0), yRet = months.reduce((a, m) => a + m.retTotal, 0);

    if (!yPut && !yRet && !cur.put.length && !cur.ret.length && !prev.put.length && !prev.ret.length && !investEverPut()) {
        box.innerHTML = `<div class="card"><div class="empty-note">Nothing is recorded as an investment yet.<br>Add a transaction with the category <strong>Investment</strong> (money you put in) and it will show up here, with a running total of how much you have invested.</div></div>`;
        return;
    }

    // running total of everything ever put in (all years) up to and including a month
    const ym = k => { const m = rawMonthNames.find(n => k.startsWith(n)); return m ? parseInt(k.slice(m.length), 10) * 12 + rawMonthNames.indexOf(m) : null; };
    const allPut = Object.keys(datasets).map(k => ({ v: ym(k), put: investMonth(k).putTotal })).filter(x => x.v !== null);
    const cumTo = (y, mi) => allPut.reduce((a, x) => a + (x.v <= y * 12 + mi ? x.put : 0), 0);
    const T = { cur: cumTo(yr, mIdx), prev: cumTo(yr, mIdx - 1) };
    const td = T.cur - T.prev, tPct = mvPct(T.cur, T.prev);
    const avgTo = i => { const xs = months.slice(0, i + 1).filter(m => m.putTotal > 0); return xs.length ? xs.reduce((a, m) => a + m.putTotal, 0) / xs.length : 0; };
    const A = { cur: avgTo(mIdx), prev: mIdx > 0 ? avgTo(mIdx - 1) : 0 };
    const ad = A.cur - A.prev, aPct = mvPct(A.cur, A.prev);

    const P = { cur: cur.putTotal, prev: prev.putTotal };
    const R = { cur: cur.retTotal, prev: prev.retTotal };
    const pd = P.cur - P.prev, rd = R.cur - R.prev;
    const pPct = mvPct(P.cur, P.prev), rPct = mvPct(R.cur, R.prev);

    // headline: the running total first, then what this month added
    let heroCls = 'flat', heroIc = '＝', heroTxt;
    if (!T.cur) heroTxt = `Nothing has been put into investments up to the end of ${esc(curFull)}.`;
    else {
        heroCls = P.cur > 0 ? 'down' : 'flat'; heroIc = P.cur > 0 ? '▲' : '＝';
        let add = P.cur > 0 ? `${esc(curFull)} added <strong>${fmt(P.cur)}</strong>` : `Nothing was added in ${esc(curFull)}`;
        if (P.cur > 0 && P.prev > 0 && Math.abs(pd) >= 0.005) add += `, ${fmt(Math.abs(pd))} ${pd > 0 ? 'more' : 'less'} than ${esc(prevFull)}`;
        else if (P.cur > 0 && P.prev > 0) add += `, the same as ${esc(prevFull)}`;
        heroTxt = `You have invested <strong>${fmt(T.cur)}</strong> in total so far. ${add}${tPct === null || P.cur <= 0 ? '' : `, which grew the total by ${tPct.toFixed(1)}%`}.`;
    }

    const kpi = (label, icon, o, d, pct, tone, help, desc, prevLabelTxt) => `
        <div class="card mv-kpi">
            <div class="mv-kpi-top"><span>${label}<button type="button" class="help" data-help="${esc(help)}" aria-label="What is ${esc(label)}?">?</button></span><span aria-hidden="true">${icon}</span></div>
            <div class="mv-kpi-val">${fmt(o.cur)}</div>
            <div class="iv-desc">${esc(desc)}</div>
            <div class="mv-kpi-delta">${mvPill(d, pct, tone)}<span class="mv-amt ${tone}">${Math.abs(d) < 0.005 ? '' : (d > 0 ? '+' : '−') + fmt(Math.abs(d))}</span></div>
            <div class="mv-kpi-prev">${esc(prevLabelTxt || prevFull)}: ${fmt(o.prev)}</div>
        </div>`;

    // this year
    const best = months.reduce((b, m) => (m.putTotal > b.putTotal ? m : b), { putTotal: 0, i: 0 });
    const yPct = yPut > 0 ? (yRet / yPut) * 100 : null;
    const yearStats = `
        <div class="annual-grid iv-year">
            <div class="stat-card"><span class="stat-card-title">Put in · ${yr}<button type="button" class="help" data-help="All the money you have put into investments in ${yr}, January to December, paid or planned." aria-label="What is Put in this year?">?</button></span><span class="stat-card-value">${fmt(yPut)}</span><span class="iv-desc">Added to your investments this year.</span></div>
            <div class="stat-card"><span class="stat-card-title">Biggest month<button type="button" class="help" data-help="The month of ${yr} when you put the most money into investments." aria-label="What is Biggest month?">?</button></span><span class="stat-card-value">${best.putTotal ? fmt(best.putTotal) : '—'}</span><span class="iv-desc">${best.putTotal ? esc(new Date(yr, best.i, 1).toLocaleString('en-AU', { month: 'long' })) + ' was your biggest month.' : 'No money put in yet this year.'}</span></div>
            <div class="stat-card"><span class="stat-card-title">Returns · ${yr}<button type="button" class="help" data-help="Cash that came back to you from investments in ${yr} (dividends, interest, sales). Only lines with the category Investment Return count. It does not include what your investments are worth today." aria-label="What are Returns this year?">?</button></span><span class="stat-card-value text-success">${fmt(yRet)}</span><span class="iv-desc">Cash that came back this year.</span></div>
            <div class="stat-card"><span class="stat-card-title">Returns as % of put in<button type="button" class="help" data-help="Returns divided by Put in. For example, put in $1,000 and $68 came back as cash: 6.8%. It is only a rough guide, because it does not know what your investments are worth today." aria-label="What is Returns as a percentage?">?</button></span><span class="stat-card-value">${yPct === null ? '—' : yPct.toFixed(1) + '%'}</span><span class="iv-desc">Cash back for every $100 put in.</span></div>
        </div>`;

    // growth chart: total invested over the year (running total)
    const t0 = startOfToday(), thisStart = new Date(t0.getFullYear(), t0.getMonth(), 1);
    const pts = months.filter(m => new Date(yr, m.i, 1) <= thisStart || m.putTotal > 0)
        .map(m => ({ i: m.i, v: cumTo(yr, m.i), add: m.putTotal }));
    const baseV = cumTo(yr, -1);
    let growth = '<div class="empty-note">Nothing to show for this year yet.</div>';
    if (pts.length) {
        // draw at the real card width so the chart keeps a modest height on wide screens
        const W = Math.max(320, Math.min(960, Math.round((box.clientWidth || 640) - 44))), H = W < 500 ? 220 : 240;
        const pl = 58, pr = 18, pt = 22, pb = 30, iw = W - pl - pr, ih = H - pt - pb;
        const maxV = Math.max(100, ...pts.map(q => q.v));
        const step = mvNiceStep(maxV, 4), tickN = Math.ceil(maxV / step), top = tickN * step;
        const x = i => pl + (i / 11) * iw, y = v => pt + (1 - v / top) * ih;
        let grid = '', xl = '';
        for (let k = 0; k <= tickN; k++) { const v = k * step, yy = y(v); grid += `<line class="mv-grid-line" x1="${pl}" x2="${W - pr}" y1="${yy.toFixed(1)}" y2="${yy.toFixed(1)}"/><text class="mv-axis" x="${pl - 8}" y="${(yy + 4).toFixed(1)}" text-anchor="end">${top >= 10000 ? fmtCompact.format(v) : fmt(v).replace('.00', '')}</text>`; }
        for (let k = 0; k < 12; k++) xl += `<text class="mv-axis" x="${x(k).toFixed(1)}" y="${H - 8}" text-anchor="middle">${SHORT_MONTHS[k]}</text>`;
        const line = pts.map((q, n) => (n ? 'L' : 'M') + x(q.i).toFixed(1) + ',' + y(q.v).toFixed(1)).join('');
        const area = line + `L${x(pts[pts.length - 1].i).toFixed(1)},${y(0).toFixed(1)}L${x(pts[0].i).toFixed(1)},${y(0).toFixed(1)}Z`;
        const dots = pts.map(q => {
            const sel = q.i === mIdx, before = q.i === mIdx - 1;
            const tip = `${SHORT_MONTHS[q.i]} ${yr}: ${fmt(q.v)} invested in total` + (q.add > 0 ? ` (${signedMoney(q.add)} this month)` : ' (nothing added this month)');
            return `<circle class="iv-dot${sel ? ' sel' : ''}${before ? ' before' : ''}" cx="${x(q.i).toFixed(1)}" cy="${y(q.v).toFixed(1)}" r="${sel ? 7 : 4.5}" onclick="ivGoMonth(${q.i})"><title>${esc(tip)}</title></circle>`;
        }).join('');
        const selPt = pts.find(q => q.i === mIdx);
        const selLbl = selPt ? `<text class="iv-val" x="${Math.min(W - pr - 30, Math.max(pl + 30, x(mIdx))).toFixed(1)}" y="${(y(selPt.v) - 14).toFixed(1)}" text-anchor="middle">${fmt(selPt.v)}</text>` : '';
        const endV = pts[pts.length - 1].v, gained = endV - baseV;
        growth = `
            <div class="iv-grow"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Total invested over ${yr}: from ${esc(fmt(baseV))} to ${esc(fmt(endV))}">${grid}${xl}<path class="iv-area" d="${area}"/><path class="iv-line" d="${line}"/>${dots}${selLbl}</svg></div>
            <div class="iv-grow-sum"><span>Start of ${yr}: <strong>${fmt(baseV)}</strong></span><span>Now: <strong>${fmt(endV)}</strong></span><span class="${gained > 0 ? 'text-success' : ''}">Added in ${yr}: <strong>${gained > 0 ? '+' : ''}${fmt(gained)}</strong></span></div>`;
    }

    // month by month bars (money put in; returns lighter)
    const maxV = Math.max(1, ...months.map(m => Math.max(m.putTotal, m.retTotal)));
    const decPrev = investMonth('december' + (yr - 1));
    const chg = (c, p) => {
        if (!c && !p) return { t: '', cls: '' };
        if (!p) return { t: 'new', cls: 'up' };
        const pc = ((c - p) / p) * 100;
        if (Math.abs(pc) < 0.05) return { t: '=', cls: '' };
        const big = Math.abs(pc) >= 1000;
        return { t: (pc > 0 ? '+' : '−') + (big ? '999+' : Math.abs(pc).toFixed(0)) + '%', cls: pc > 0 ? 'up' : 'down' };
    };
    const chart = months.map(m => {
        const before = m.i > 0 ? months[m.i - 1] : decPrev;
        const beforeName = SHORT_MONTHS[(m.i + 11) % 12];
        const future = new Date(yr, m.i, 1) > thisStart;
        const c = future ? { t: '', cls: '' } : chg(m.putTotal, before.putTotal);
        const tip = `${SHORT_MONTHS[m.i]} ${yr}: put in ${fmt(m.putTotal)}, returns ${fmt(m.retTotal)}.` + (future ? '' : ` Against ${beforeName}: put in ${signedMoney(m.putTotal - before.putTotal)}, returns ${signedMoney(m.retTotal - before.retTotal)}.`);
        const hIn = m.putTotal ? Math.max(3, (m.putTotal / maxV) * 100) : 0, hOut = m.retTotal ? Math.max(3, (m.retTotal / maxV) * 100) : 0;
        return `<button type="button" class="iv-col${m.i === mIdx ? ' now' : ''}${m.i === mIdx - 1 ? ' before' : ''}" title="${esc(tip)}" aria-label="${esc(tip)}. Open this month." onclick="ivGoMonth(${m.i})">
            <span class="iv-bars"><span class="iv-bar in" style="height:${hIn}%"></span><span class="iv-bar out" style="height:${hOut}%"></span></span>
            <span class="iv-lbl">${SHORT_MONTHS[m.i]}</span><span class="iv-chg ${c.cls}">${c.t || '&nbsp;'}</span></button>`;
    }).join('');

    const cmpItem = (label, o, d, pct, tone) => `
        <div class="iv-cmp-item"><span class="iv-cmp-lbl">${label}</span>
            <span class="iv-cmp-nums"><strong>${fmt(o.cur)}</strong> <span class="iv-vs">in ${esc(curFull)}</span> · ${fmt(o.prev)} <span class="iv-vs">in ${esc(prevFull)}</span></span>
            <span class="iv-cmp-delta">${mvPill(d, pct, tone)}<span class="mv-amt ${tone}">${Math.abs(d) < 0.005 ? '' : (d > 0 ? '+' : '−') + fmt(Math.abs(d))}</span></span></div>`;
    const cmpStrip = `<div class="iv-cmp"><div class="iv-cmp-head">${esc(curFull)} against ${esc(prevFull)}</div>
        ${cmpItem('Put in', P, pd, pPct, mvTone(pd, true))}${cmpItem('Returns', R, rd, rPct, mvTone(rd, true))}</div>`;

    // by investment (grouped by description) for this month against last month
    const rowsFor = (curLines, prevLines) => {
        const a = investGroup(curLines), b = investGroup(prevLines);
        const rows = [...new Set([...a.keys(), ...b.keys()])].map(k => {
            const c = a.get(k), p = b.get(k);
            return { label: (c || p).label, cur: c ? c.amt : 0, prev: p ? p.amt : 0 };
        }).map(r => ({ ...r, diff: r.cur - r.prev })).sort((x, y) => Math.max(y.cur, y.prev) - Math.max(x.cur, x.prev));
        if (!rows.length) return '<div class="empty-note">Nothing in either month.</div>';
        const mx = Math.max(1, ...rows.map(r => Math.max(r.cur, r.prev)));
        return rows.map(r => {
            const isNew = r.prev === 0, gone = r.cur === 0, tone = Math.abs(r.diff) < 0.005 ? 'flat' : (r.diff > 0 ? 'good' : 'flat');
            const pill = Math.abs(r.diff) < 0.005 ? '<span class="mv-pill flat">No change</span>'
                : isNew ? '<span class="mv-pill new">New</span>'
                : `<span class="mv-pill ${r.diff > 0 ? 'good' : 'flat'}">${r.diff > 0 ? '▲' : '▼'} ${gone ? '100' : Math.abs((r.diff / r.prev) * 100).toFixed(0)}%</span>`;
            return `
            <div class="mv-cat">
                <div class="mv-cat-top"><span class="mv-cat-name" title="${esc(r.label)}">${esc(r.label)}</span>
                    <span class="mv-cat-right"><span class="mv-amt ${tone}">${Math.abs(r.diff) < 0.005 ? '' : (r.diff > 0 ? '+' : '−') + fmt(Math.abs(r.diff))}</span>${pill}</span></div>
                <div class="mv-bars">
                    <div class="mv-bar-row"><div class="mv-track"><div class="mv-fill now" style="width:${((r.cur / mx) * 100).toFixed(1)}%"></div></div><span class="mv-bar-val now">${fmt(r.cur)}</span></div>
                    <div class="mv-bar-row"><div class="mv-track"><div class="mv-fill prev" style="width:${((r.prev / mx) * 100).toFixed(1)}%"></div></div><span class="mv-bar-val">${fmt(r.prev)}</span></div>
                </div>
            </div>`;
        }).join('');
    };

    const lineRows = (label, m) => {
        const all = [...m.put.map(l => ({ ...l, kind: 'put' })), ...m.ret.map(l => ({ ...l, kind: 'ret' }))]
            .sort((a, b) => String(a.t.date).localeCompare(String(b.t.date)));
        if (!all.length) return `<tr class="iv-month-row"><td colspan="5">${esc(label)}</td></tr><tr><td colspan="5" class="iv-none">No investment lines.</td></tr>`;
        return `<tr class="iv-month-row"><td colspan="5">${esc(label)}</td></tr>` + all.map(l => `
            <tr><td>${esc(l.t.date)}</td><td>${esc(l.t.desc)}</td>
            <td class="col-num">${l.kind === 'put' ? fmt(l.amt) : ''}</td>
            <td class="col-num text-success">${l.kind === 'ret' ? fmt(l.amt) : ''}</td>
            <td>${l.paid ? '<span class="mv-pill good">Paid</span>' : '<span class="mv-pill flat">Planned</span>'}</td></tr>`).join('');
    };

    box.innerHTML = `
        <div class="card mv-hero"><span class="mv-hero-ic ${heroCls}" aria-hidden="true">${heroIc}</span><div class="mv-hero-text">${heroTxt}</div></div>
        <div class="mv-kpis">
            ${kpi('Total invested', '🏦', T, td, tPct, mvTone(td, true),
                'Everything you have ever put into investments, added together, up to the end of this month. It grows every time you put more in.',
                'All the money you have put in so far.')}
            ${kpi('Put in this month', '📈', P, pd, pPct, mvTone(pd, true),
                'The money you moved into investments this month (shares, ETFs, crypto and so on). It adds up every expense line with the category Investment, paid or planned.',
                `Added in ${curFull}.`)}
            ${kpi('Average per month', '📊', A, ad, aPct, mvTone(ad, true),
                `Your ${yr} money put in so far, divided by the months where you put something in. It shows your usual monthly amount.`,
                `Your usual amount in ${yr}.`)}
        </div>
        ${yearStats}
        <div class="card" style="margin-bottom:16px">
            <div class="card-header"><h2>Total invested · ${yr}</h2><span style="font-size:0.76rem;color:var(--text-muted)">Running total. Click a dot to open that month</span></div>
            ${growth}
        </div>
        <div class="mv-grid">
            <div class="card">
                <div class="card-header"><h2>Put in each month · ${yr}</h2><span style="font-size:0.76rem;color:var(--text-muted)">Click a month to open it</span></div>
                <div class="iv-chart" role="group" aria-label="Investments by month">${chart}</div>
                <div class="mv-legend"><span><i style="border-color:var(--iv-in)"></i>Put in</span><span><i style="border-color:var(--iv-out)"></i>Returns</span><span><i class="iv-sw now"></i>${esc(curFull)}</span><span><i class="iv-sw before"></i>Month before</span></div>
                <div class="iv-note-small">The % under each month is how much “Put in” changed compared with the month before it.</div>
                ${cmpStrip}
            </div>
            <div class="card">
                <div class="card-header"><h2>By investment</h2><span style="font-size:0.76rem;color:var(--text-muted)">${esc(curFull)} ▪ ${esc(prevFull)}</span></div>
                <div class="mv-legend" style="margin:0 0 14px"><span><i style="border-color:var(--mv-now)"></i>${esc(curLabel)}</span><span><i style="border-color:var(--mv-prev)"></i>${esc(prevLabel)}</span></div>
                <div class="iv-sect">Put in</div>
                <div class="mv-cats">${rowsFor(cur.put, prev.put)}</div>
                <div class="iv-sect">Returns</div>
                <div class="mv-cats">${rowsFor(cur.ret, prev.ret)}</div>
            </div>
        </div>
        <div class="card" style="margin-top:16px">
            <div class="card-header"><h2>Investment lines</h2></div>
            <div class="table-container-clean iv-scroll"><table class="iv-table">
                <thead><tr><th>Date</th><th>Description</th><th class="col-num">Put in</th><th class="col-num">Returns</th><th>Status</th></tr></thead>
                <tbody>${lineRows(curFull + ' ' + yr, cur)}${lineRows(prevFull + ' ' + prevDate.getFullYear(), prev)}</tbody>
            </table></div>
        </div>
        <div class="mv-note">Counts every line you have entered, paid or planned. Any category with “invest” in its name counts: <strong>Investment</strong> for money put in and <strong>Investment Return</strong> for money coming back. Lines are grouped by description, so keep the same description each month to compare like with like.</div>`;
}

// true if any month of any year has an investment line (used for the empty page)
function investEverPut() {
    return Object.keys(datasets).some(k => { const m = investMonth(k); return m.put.length || m.ret.length; });
}
