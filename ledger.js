/* LEDGER: the Transactions page, the New Transaction window, recurring bills, due-soon alerts and row selection.
   Part of the Financial Movement Dashboard. Plain script (not a module): functions here are shared with the other js files. */

    function exportCSV() {
        const key = lastMonthName + selectedYear;
        if (!datasets[key]) return;
        const rows = [['Date', 'Description', 'Expense Category', 'Credit Category', 'Type', 'Credit', 'Debit', 'Method', 'Paid']];
        datasets[key].data.forEach(t => rows.push([
            t.date, t.desc, t.cost, t.creditCat, t.type,
            (parseFloat(t.credit) || 0).toFixed(2), (parseFloat(t.debit) || 0).toFixed(2), t.method, t.paid
        ]));
        const csv = rows.map(r => r.map(v => {
            let x = String(v ?? '');
            if (/^[=+\-@]/.test(x) && isNaN(Number(x))) x = "'" + x;
            return '"' + x.replace(/"/g, '""') + '"';
        }).join(',')).join('\r\n');
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `finance_${key}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showToast('CSV exported');
    }

    function populateTxnModalCategories() {
        const type = document.getElementById('tm-type').value;
        const list = type === 'credit' ? creditCategories : categories;
        document.getElementById('tm-cat').innerHTML =
            '<option value="">-- None --</option>' + [...list].sort().map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    }
    function onTxnTypeChange() {
        txmCatTouched = false;
        populateTxnModalCategories();
        onTxnDescInput();
    }
    function onTxnDescInput() {
        if (txmCatTouched || document.getElementById('tm-type').value !== 'expense') return;
        const d = document.getElementById('tm-desc').value.toLowerCase().trim();
        let hit = '';
        if (d) {
            for (const k in autoCategorizationMap) {
                if (k && d.includes(k) && categories.includes(autoCategorizationMap[k])) { hit = autoCategorizationMap[k]; break; }
            }
        }
        document.getElementById('tm-cat').value = hit;
    }
    function openTransactionModal() {
        if (!datasets[activeMonthKey]) ensureYearDatasetsExist(selectedYear);
        document.getElementById('tm-desc').value = '';
        document.getElementById('tm-amount').value = '';
        document.getElementById('tm-type').value = 'expense';
        document.getElementById('tm-paid').checked = false;
        const dateEl = document.getElementById('tm-date');
        dateEl.min = allYears[0] + '-01-01';
        dateEl.max = allYears[allYears.length - 1] + '-12-31';
        dateEl.value = toISOFormat(getDefaultDateString(activeMonthKey));
        txmCatTouched = false;
        populateTxnModalCategories();
        updateTxnModalSummary();
        document.getElementById('txn-modal').style.display = 'flex';
        setTimeout(() => document.getElementById('tm-desc').focus(), 50);
    }
    function closeTransactionModal() {
        const m = document.getElementById('txn-modal');
        if (m) m.style.display = 'none';
        document.getElementById('tm-desc').value = '';
        document.getElementById('tm-amount').value = '';
    }

    function saveTransactionFromModal() {
        const desc = document.getElementById('tm-desc').value.trim();
        const amount = parseFloat(document.getElementById('tm-amount').value);
        const type = document.getElementById('tm-type').value;
        const cat = document.getElementById('tm-cat').value;
        const iso = document.getElementById('tm-date').value;
        if (!desc) { showToast('Add a description', true); document.getElementById('tm-desc').focus(); return; }
        if (!(amount > 0)) { showToast('Enter an amount above $0', true); document.getElementById('tm-amount').focus(); return; }
        const d = parseIso(iso);
        if (!d) { showToast('Pick a date', true); document.getElementById('tm-date').focus(); return; }
        const yr = String(d.getFullYear());
        if (!allYears.includes(yr)) { showToast(`Pick a date between ${allYears[0]} and ${allYears[allYears.length - 1]}`, true); return; }
        ensureYearDatasetsExist(yr);
        const monthName = rawMonthNames[d.getMonth()];
        const key = monthName + yr;
        const isExpense = type === 'expense';
        const tx = {
            date: toAUFormat(iso), desc,
            cost: isExpense ? cat : '', creditCat: isExpense ? '' : cat,
            type: isExpense ? 'Variable' : '',
            credit: isExpense ? 0 : amount, debit: isExpense ? amount : 0,
            method: isExpense ? 'Debit' : 'Transfer', paid: document.getElementById('tm-paid').checked ? 'Yes' : 'NO'
        };
        datasets[key].data.push(tx);
        const again = !!(document.getElementById('tm-again') || {}).checked;
        if (!again) closeTransactionModal();
        currentFilter = 'all';
        document.getElementById('search-input').value = '';
        document.querySelectorAll('.filter-pills .pill').forEach((p, i) => p.classList.toggle('active', i === 0));
        const moved = key !== activeMonthKey;
        selectedYear = yr;
        document.getElementById('year-dropdown').value = yr;
        selectedMonthName = monthName;
        lastMonthName = monthName;
        document.getElementById('month-dropdown').value = monthName;
        activeMonthKey = key;
        sortTransactions();
        renderApp();
        saveToSupabase();
        const idx = datasets[key].data.indexOf(tx);
        requestAnimationFrame(() => {
            const row = document.querySelector(`#txn-tbody tr[data-idx="${idx}"]`);
            if (!row) return;
            row.scrollIntoView({ block: 'center', behavior: 'smooth' });
            row.classList.add('row-flash');
            setTimeout(() => row.classList.remove('row-flash'), 2600);
        });
        if (again) {
            resetTxnModalForAnother();
            showToast(moved ? `Added to ${currentMonthLabel()} · ready for the next one` : 'Added · ready for the next one');
        } else {
            showToast(moved ? `Transaction added to ${currentMonthLabel()}` : 'Transaction added');
        }
    }

    function closeAllModals() { closeRecurringModal(); closeTransactionModal(); closeBudgetModal(); closeSecurityModal(); }

    function periodSummaryFor(monthKey) {
        const ds = datasets[monthKey];
        const txs = ds && Array.isArray(ds.data) ? ds.data : [];
        const num = v => parseFloat(v) || 0;
        const state = t => String(t.paid || '').toLowerCase();
        const prevBal = txs.filter(isRolloverTx).reduce((a, t) => a + num(t.credit), 0);
        const paidCredits = txs.filter(t => !isRolloverTx(t) && state(t) === 'yes' && num(t.credit) > 0).reduce((a, t) => a + num(t.credit), 0);
        const debitsPaid = txs.filter(t => state(t) === 'yes' && num(t.debit) > 0).reduce((a, t) => a + num(t.debit), 0);
        const creditsRcvd = prevBal + paidCredits;
        const debitsToPay = txs.filter(t => state(t) === 'no' && num(t.debit) > 0).reduce((a, t) => a + num(t.debit), 0);
        return { creditsRcvd, debitsPaid, debitsToPay, currBal: creditsRcvd - debitsPaid };
    }

    function renderTxSummary() {
        const el = document.getElementById('tx-curr-bal');
        if (!el) return;
        const s = periodSummaryFor(activeMonthKey);
        document.getElementById('tx-credits-rcvd').innerText = fmt(s.creditsRcvd);
        document.getElementById('tx-debits-paid').innerText = fmt(s.debitsPaid);
        const txToPay = document.getElementById('tx-debits-topay');
        txToPay.innerText = fmt(s.debitsToPay);
        txToPay.className = s.debitsToPay > 0 ? 'text-danger' : '';
        el.innerText = fmt(s.currBal);
        el.classList.toggle('text-danger', s.currBal < 0);
        document.getElementById('tx-ps-month').innerText = currentMonthLabel();
    }

    function updateTxnModalSummary() {
        const d = parseIso(document.getElementById('tm-date').value);
        const key = d ? rawMonthNames[d.getMonth()] + d.getFullYear() : activeMonthKey;
        const s = periodSummaryFor(key);
        const p = ovParseKey(key);
        document.getElementById('tm-sum-month').innerText = p ? rawMonthNames[p.idx].charAt(0).toUpperCase() + rawMonthNames[p.idx].slice(1) + ' ' + p.year : '';
        document.getElementById('tm-sum-cr').innerText = fmt(s.creditsRcvd);
        document.getElementById('tm-sum-db').innerText = fmt(s.debitsPaid);
        const tmToPay = document.getElementById('tm-sum-topay');
        tmToPay.innerText = fmt(s.debitsToPay);
        tmToPay.className = s.debitsToPay > 0 ? 'text-danger' : '';
        const bal = document.getElementById('tm-sum-bal');
        bal.innerText = fmt(s.currBal);
        bal.classList.toggle('text-danger', s.currBal < 0);
    }

    function togglePaid(index) {
        const ds = datasets[activeMonthKey];
        const tx = ds && ds.data[index];
        if (!tx) return;
        const wasPaid = String(tx.paid || '').toLowerCase() === 'yes';
        tx.paid = wasPaid ? 'NO' : 'Yes';
        renderApp();
        saveToSupabase();
        showToast(wasPaid ? 'Marked as Pending' : 'Marked as Paid');
    }

    function markDueAsPaid() {
        const key = activeMonthKey;
        const ds = datasets[key];
        if (!ds) return;
        const today = startOfToday();
        const changed = ds.data.filter(t => {
            if (isRolloverTx(t) || String(t.paid || '').toLowerCase() !== 'no') return false;
            const d = parseTxDate(t.date);
            return d && d <= today;
        });
        if (!changed.length) { showToast('Nothing pending up to today'); return; }
        changed.forEach(t => { t.paid = 'Yes'; });
        renderApp();
        saveToSupabase();
        showToast(`Marked ${changed.length} line${changed.length === 1 ? '' : 's'} as paid`, false, {
            label: 'Undo',
            fn: () => {
                changed.forEach(t => { t.paid = 'NO'; });
                renderApp();
                saveToSupabase();
                showToast('Undone');
            }
        });
    }

    function flashLedgerRow(idx) {
        requestAnimationFrame(() => {
            const row = document.querySelector(`#txn-tbody tr[data-idx="${idx}"]`);
            if (!row) return;
            row.scrollIntoView({ block: 'center', behavior: 'smooth' });
            row.classList.add('row-flash');
            setTimeout(() => row.classList.remove('row-flash'), 2600);
        });
    }

    function goToMonth(key) {
        const p = ovParseKey(key);
        if (!p || !allYears.includes(String(p.year))) return false;
        selectedYear = String(p.year);
        document.getElementById('year-dropdown').value = selectedYear;
        ensureYearDatasetsExist(selectedYear);
        selectedMonthName = rawMonthNames[p.idx];
        lastMonthName = selectedMonthName;
        document.getElementById('month-dropdown').value = selectedMonthName;
        activeMonthKey = key;
        sortTransactions();
        return true;
    }

    function renderGlobalSearch() {
        const box = document.getElementById('global-results');
        if (!box) return;
        const all = document.getElementById('search-all');
        const term = String((document.getElementById('search-input') || {}).value || '').trim().toLowerCase();
        if (!(all && all.checked) || !term) { box.style.display = 'none'; box.innerHTML = ''; globalHits = []; return; }
        const hits = [];
        Object.keys(datasets).forEach(k => {
            const ds = datasets[k];
            if (!ds || !Array.isArray(ds.data)) return;
            ds.data.forEach(t => {
                if (isRolloverTx(t)) return;
                const hay = [t.desc, t.cost, t.creditCat, t.date, t.method, t.debit, t.credit].join(' ').toLowerCase();
                if (hay.includes(term)) hits.push({ k, t });
            });
        });
        hits.sort((a, b) => parseDateString(b.t.date) - parseDateString(a.t.date));
        globalHits = hits.slice(0, 100);
        box.style.display = 'block';
        if (!hits.length) {
            box.innerHTML = '<div class="gr-head">No matches in any month.</div>';
            return;
        }
        box.innerHTML = `<div class="gr-head"><strong>${hits.length} match${hits.length === 1 ? '' : 'es'}</strong> across all months. Click one to open it.</div>
            <div class="gr-list">${globalHits.map((h, n) => {
                const net = (parseFloat(h.t.credit) || 0) - (parseFloat(h.t.debit) || 0);
                return `<button type="button" class="gr-row" onclick="jumpToHit(${n})" title="Open ${esc(monthLabelOfKey(h.k))}">
                    <span class="gr-date">${esc(h.t.date)}</span>
                    <span>${esc(h.t.desc || '(no description)')}</span>
                    <span class="gr-cat gr-month">${esc(h.t.cost || h.t.creditCat || '—')}</span>
                    <span class="gr-amt ${net >= 0 ? 'text-success' : 'text-danger'}">${net >= 0 ? '+' : '-'}${fmt(Math.abs(net))}</span>
                </button>`;
            }).join('')}</div>`;
    }

    function jumpToHit(n) {
        const h = globalHits[n];
        if (!h || !goToMonth(h.k)) return;
        document.getElementById('search-input').value = '';
        document.getElementById('search-all').checked = false;
        currentFilter = 'all';
        document.querySelectorAll('.filter-pills .pill').forEach((p, i) => p.classList.toggle('active', i === 0));
        renderApp();
        flashLedgerRow(datasets[h.k].data.indexOf(h.t));
    }

    function copyFromPreviousMonth(mode) {
        const key = activeMonthKey;
        const prevKey = ovShiftKey(key, -1);
        const src = datasets[prevKey];
        const here = datasets[key];
        const p = ovParseKey(key);
        if (!src || !Array.isArray(src.data) || !here || !p) { showToast('No data in the previous month', true); return; }
        const lines = src.data.filter(t => !isRolloverTx(t) && (mode === 'all' || t.type === 'Fixed'));
        if (!lines.length) { showToast(mode === 'all' ? 'Nothing to copy from the previous month' : 'No Fixed lines in the previous month', true); return; }
        const daysInMonth = new Date(p.year, p.idx + 1, 0).getDate();
        const same = (a, b) => String(a.desc || '').trim().toLowerCase() === String(b.desc || '').trim().toLowerCase()
            && Math.abs((parseFloat(a.debit) || 0) - (parseFloat(b.debit) || 0)) < 0.005
            && Math.abs((parseFloat(a.credit) || 0) - (parseFloat(b.credit) || 0)) < 0.005;
        const addedTx = [];
        let skipped = 0;
        lines.forEach(t => {
            if (here.data.some(x => same(x, t))) { skipped++; return; }
            const copy = JSON.parse(JSON.stringify(t));
            const old = parseTxDate(t.date);
            const day = Math.min(old ? old.getDate() : 1, daysInMonth);
            copy.date = `${String(day).padStart(2, '0')}/${String(p.idx + 1).padStart(2, '0')}/${p.year}`;
            copy.paid = 'NO';
            here.data.push(copy);
            addedTx.push(copy);
        });
        if (!addedTx.length) { showToast('Those lines are already in this month'); return; }
        sortTransactions();
        renderApp();
        saveToSupabase();
        showToast(`Copied ${addedTx.length} line${addedTx.length === 1 ? '' : 's'} from ${monthLabelOfKey(prevKey)}${skipped ? ` (${skipped} already here)` : ''}`, false, {
            label: 'Undo',
            fn: () => {
                if (datasets[key]) datasets[key].data = datasets[key].data.filter(x => !addedTx.includes(x));
                renderApp();
                saveToSupabase();
                showToast('Undone');
            }
        });
    }

    function autoApplyRecurringDue() {
        if (!autoApplyRecurring || !recurringTemplates.length) return 0;
        const today = startOfToday();
        const yr = String(today.getFullYear());
        if (!allYears.includes(yr)) return 0;
        ensureYearDatasetsExist(yr);
        const key = monthKeyOfDate(today);
        const ds = datasets[key];
        if (!ds) return 0;
        const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
        const done = recurringApplied[key] || (recurringApplied[key] = []);
        let added = 0, touched = false;
        recurringTemplates.forEach(t => {
            const day = Math.min(Math.max(parseInt(t.day, 10) || 1, 1), daysInMonth);
            if (day > today.getDate()) return;
            const amt = parseFloat(t.amount) || 0;
            const sig = `${String(t.desc || '').trim().toLowerCase()}|${amt.toFixed(2)}|${day}`;
            if (done.includes(sig)) return;
            done.push(sig);
            touched = true;
            const exists = ds.data.some(x => String(x.desc || '').trim().toLowerCase() === String(t.desc || '').trim().toLowerCase()
                && Math.abs((parseFloat(x.debit) || 0) - amt) < 0.005);
            if (exists) return;
            ds.data.push({
                date: `${String(day).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${yr}`,
                desc: t.desc, cost: t.category || '', creditCat: '', type: 'Fixed', credit: 0, debit: amt, method: 'Debit', paid: 'NO'
            });
            added++;
        });
        if (added) ds.data.sort((a, b) => parseDateString(a.date) - parseDateString(b.date));
        if (touched) saveToSupabase();
        return added;
    }

    function toggleAutoRecurring(checked) {
        autoApplyRecurring = !!checked;
        saveToSupabase();
        if (autoApplyRecurring) {
            const n = autoApplyRecurringDue();
            if (n) { renderApp(); showToast(`Auto-add is on · added ${n} bill${n === 1 ? '' : 's'} due`); return; }
        }
        showToast(autoApplyRecurring ? 'Recurring bills will be added when due' : 'Auto-add turned off');
    }

    function resetTxnModalForAnother() {
        document.getElementById('tm-desc').value = '';
        document.getElementById('tm-amount').value = '';
        document.getElementById('tm-cat').value = '';
        document.getElementById('tm-paid').checked = false;
        txmCatTouched = false;
        updateTxnModalSummary();
        setTimeout(() => document.getElementById('tm-desc').focus(), 30);
    }

    function collectDueSoon(days) {
        const today = startOfToday();
        const end = addDays(today, days);
        const items = [];
        for (let off = -12; off <= 1; off++) {
            const key = monthKeyOfDate(new Date(today.getFullYear(), today.getMonth() + off, 1));
            const ds = datasets[key];
            if (!ds || !Array.isArray(ds.data)) continue;
            ds.data.forEach(t => {
                if (isRolloverTx(t) || String(t.paid || '').toLowerCase() !== 'no') return;
                const net = (parseFloat(t.credit) || 0) - (parseFloat(t.debit) || 0);
                if (net >= 0) return;
                const d = parseTxDate(t.date);
                if (!d || d > end) return;
                items.push({ kind: 'ledger', tx: t, date: d, desc: t.desc || '(no description)', amount: net, late: d < today, days: daysBetween(today, d) });
            });
        }
        subscriptions.forEach(sub => {
            if (!sub.active) return;
            subOccurrencesBetween(sub, today, end).forEach(d => {
                if (ledgerHasSubOccurrence(sub, d)) return;
                items.push({ kind: 'sub', date: d, desc: sub.name, amount: -Math.abs(Number(sub.amount) || 0), late: false, days: daysBetween(today, d) });
            });
        });
        items.sort((a, b) => (a.date - b.date) || (a.amount - b.amount));
        return items;
    }

    function dueRowClass(tx, today, end) {
        if (isRolloverTx(tx) || String(tx.paid || '').toLowerCase() !== 'no') return '';
        if ((parseFloat(tx.debit) || 0) - (parseFloat(tx.credit) || 0) <= 0) return '';
        const d = parseTxDate(tx.date);
        if (!d) return '';
        if (d < today) return 'due-late';
        return d <= end ? 'due-soon' : '';
    }

    function dueWhenLabel(it) {
        if (it.late) { const n = -it.days; return n === 1 ? '1 day late' : `${n} days late`; }
        if (it.days === 0) return 'Today';
        if (it.days === 1) return 'Tomorrow';
        return fmtDayLong(it.date);
    }

    function renderDueSoon() {
        dueItems = collectDueSoon(dueWindowDays);
        const count = dueItems.length;
        const late = dueItems.filter(x => x.late).length;
        const soon = count - late;
        const total = dueItems.reduce((a, x) => a + Math.abs(x.amount), 0);
        let html = '';
        if (count) {
            const warn = OV_SVG('<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path>');
            const parts = [];
            if (late) parts.push(`${late} overdue`);
            if (soon) parts.push(`${soon} due in the next ${dueWindowDays} days`);
            const rows = dueItems.slice(0, 5).map((it, n) => `
                <div class="due-row ${it.late ? 'late' : (it.days <= 1 ? 'urgent' : '')}">
                    <span class="due-when">${esc(dueWhenLabel(it))}</span>
                    <span class="due-desc" title="${esc(it.desc)}">${esc(it.desc)}${it.kind === 'sub' ? '<em>subscription</em>' : ''}</span>
                    <span class="due-amt">${esc(fmt(Math.abs(it.amount)))}</span>
                    ${it.kind === 'ledger' ? `<button type="button" class="due-paid" onclick="dueMarkPaid(${n})" title="Mark as paid">✓ Paid</button>` : '<span></span>'}
                </div>`).join('');
            html = `<div class="due-banner ${late ? 'has-late' : ''}" role="alert">
                <div class="due-head">
                    <span class="due-title">${warn}${esc(parts.join(' · '))}</span>
                    <span class="due-total">${esc(fmt(total))}</span>
                </div>
                ${rows}
                <div class="due-foot">
                    ${count > 5 ? `<span>+${count - 5} more</span>` : ''}
                    <button type="button" class="ov-link" onclick="showView('transactions')">Open ledger</button>
                    <button type="button" class="ov-link" onclick="showView('forecast')">Forecast</button>
                    <button type="button" class="ov-link" onclick="cycleDueDays()">Change window (${dueWindowDays} days)</button>
                </div>
            </div>`;
        }
        ['ov-due', 'tx-due'].forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = html; });
        ['nav-due-dash', 'nav-due-tx'].forEach(id => {
            const b = document.getElementById(id);
            if (!b) return;
            b.hidden = !count;
            b.innerText = String(count);
            b.classList.toggle('late', late > 0);
            b.title = count ? `${count} due soon${late ? ', ' + late + ' overdue' : ''}` : '';
        });
    }

    function dueMarkPaid(n) {
        const it = dueItems[n];
        if (!it || it.kind !== 'ledger') return;
        it.tx.paid = 'Yes';
        renderApp();
        saveToSupabase();
        showToast(`Marked "${it.desc}" as paid`, false, {
            label: 'Undo',
            fn: () => { it.tx.paid = 'NO'; renderApp(); saveToSupabase(); showToast('Undone'); }
        });
    }

    function syncDueDaysLabel() {
        const b = document.getElementById('due-days-btn');
        if (b) b.textContent = `⏰ Due-soon alert: ${dueWindowDays} days`;
    }
    function cycleDueDays() {
        const opts = [3, 5, 7, 14];
        dueWindowDays = opts[(opts.indexOf(dueWindowDays) + 1) % opts.length];
        try { localStorage.setItem('dashboard_due_days', String(dueWindowDays)); } catch (_) { }
        syncDueDaysLabel();
        renderApp();
        showToast(`Due-soon alert: next ${dueWindowDays} days`);
    }
    function onRowSelect(ev, index) {
        const ds = datasets[activeMonthKey];
        const tx = ds && ds.data[index];
        if (!tx || isRolloverTx(tx)) return;
        const on = !!ev.target.checked;
        if (ev.shiftKey && lastSelIdx !== null && visibleSel.includes(lastSelIdx) && visibleSel.includes(index)) {
            const a = visibleSel.indexOf(lastSelIdx), b = visibleSel.indexOf(index);
            visibleSel.slice(Math.min(a, b), Math.max(a, b) + 1).forEach(i => {
                const t = ds.data[i];
                if (t) { if (on) selectedTx.add(t); else selectedTx.delete(t); }
            });
        } else if (on) selectedTx.add(tx); else selectedTx.delete(tx);
        lastSelIdx = index;
        refreshSelectionUI();
    }

    function toggleSelectAll(checked) {
        const ds = datasets[activeMonthKey];
        if (!ds) return;
        visibleSel.forEach(i => {
            const t = ds.data[i];
            if (t) { if (checked) selectedTx.add(t); else selectedTx.delete(t); }
        });
        lastSelIdx = null;
        refreshSelectionUI();
    }

    function clearSelection() {
        selectedTx.clear();
        lastSelIdx = null;
        refreshSelectionUI();
    }

    function refreshSelectionUI() {
        const ds = datasets[activeMonthKey];
        const data = ds ? ds.data : [];
        const n = selectedTx.size;
        let out = 0, inn = 0, hidden = 0;
        selectedTx.forEach(t => {
            out += parseFloat(t.debit) || 0;
            inn += parseFloat(t.credit) || 0;
            if (!visibleSel.includes(data.indexOf(t))) hidden++;
        });
        const bar = document.getElementById('sel-bar');
        if (bar) bar.hidden = n === 0;
        const count = document.getElementById('sel-count');
        if (count) count.innerText = `${n} selected${hidden ? ` (${hidden} hidden by the filter)` : ''}`;
        const sum = document.getElementById('sel-sum');
        if (sum) sum.innerText = n ? `Out ${fmt(out)} · In ${fmt(inn)}` : '';
        const all = document.getElementById('sel-all');
        if (all) {
            const vis = visibleSel.map(i => data[i]).filter(Boolean);
            const picked = vis.filter(t => selectedTx.has(t)).length;
            all.checked = vis.length > 0 && picked === vis.length;
            all.indeterminate = picked > 0 && picked < vis.length;
        }
        const tbody = document.getElementById('txn-tbody');
        if (tbody) {
            Array.from(tbody.children).forEach(row => {
                const t = data[parseInt(row.dataset && row.dataset.idx, 10)];
                const on = !!t && selectedTx.has(t);
                const box = row.querySelector ? row.querySelector('.row-sel') : null;
                if (box) box.checked = on;
                row.classList.toggle('row-selected', on);
            });
        }
    }

    function lineMatches(a, b) {
        return String(a.desc || '').trim().toLowerCase() === String(b.desc || '').trim().toLowerCase()
            && Math.abs((parseFloat(a.debit) || 0) - (parseFloat(b.debit) || 0)) < 0.005
            && Math.abs((parseFloat(a.credit) || 0) - (parseFloat(b.credit) || 0)) < 0.005;
    }

    function copySelectedToNextMonth() {
        const key = activeMonthKey;
        const ds = datasets[key];
        const picked = ds ? ds.data.filter(t => selectedTx.has(t) && !isRolloverTx(t)) : [];
        if (!picked.length) { showToast('Tick the lines you want to copy first', true); return; }
        const nextKey = ovShiftKey(key, 1);
        const p = ovParseKey(nextKey);
        if (!p || !allYears.includes(String(p.year))) { showToast(`There is no month after ${monthLabelOfKey(key)} to copy into`, true); return; }
        ensureYearDatasetsExist(String(p.year));
        const target = datasets[nextKey];
        if (!target || !Array.isArray(target.data)) { showToast('Could not open the next month', true); return; }
        const daysInMonth = new Date(p.year, p.idx + 1, 0).getDate();
        const added = [];
        let skipped = 0;
        picked.forEach(t => {
            if (target.data.some(x => lineMatches(x, t))) { skipped++; return; }
            const copy = JSON.parse(JSON.stringify(t));
            const old = parseTxDate(t.date);
            const day = Math.min(old ? old.getDate() : 1, daysInMonth);
            copy.date = `${String(day).padStart(2, '0')}/${String(p.idx + 1).padStart(2, '0')}/${p.year}`;
            copy.paid = 'NO';
            target.data.push(copy);
            added.push(copy);
        });
        const label = monthLabelOfKey(nextKey);
        if (!added.length) { showToast(`Those lines are already in ${label}`); return; }
        target.data.sort((a, b) => parseDateString(a.date) - parseDateString(b.date));
        clearSelection();
        renderApp();
        saveToSupabase();
        showToast(`Copied ${added.length} line${added.length === 1 ? '' : 's'} to ${label} as Pending${skipped ? ` (${skipped} already there)` : ''}`, false, {
            label: 'Undo',
            fn: () => {
                if (datasets[nextKey]) datasets[nextKey].data = datasets[nextKey].data.filter(x => !added.includes(x));
                renderApp();
                saveToSupabase();
                showToast('Undone');
            }
        });
    }

    function syncRolloverBalances(yr = selectedYear, depth = 0) {
        let changed = false;
        const prevYr = String(parseInt(yr, 10) - 1);
        const prevDec = datasets['december' + prevYr];
        const carryFromPrevYear = depth < 6 && allYears.includes(prevYr) && prevDec && Array.isArray(prevDec.data) && prevDec.data.some(t => !isRolloverTx(t));
        if (carryFromPrevYear && syncRolloverBalances(prevYr, depth + 1)) changed = true;
        ensureYearDatasetsExist(yr);
        const monthKeys = getMonthKeysOrderForYear(yr);
        for (let i = carryFromPrevYear ? 0 : 1; i < monthKeys.length; i++) {
            const prevKey = i === 0 ? 'december' + prevYr : monthKeys[i - 1];
            const currKey = monthKeys[i];
            const prevProj = parseFloat(calculateProjectedBalanceForMonth(prevKey).toFixed(2));
            const currData = datasets[currKey].data;
            const rolloverItem = currData.find(t => isRolloverTx(t));
            if (rolloverItem) {
                if (rolloverItem.credit !== prevProj) {
                    rolloverItem.credit = prevProj;
                    changed = true;
                }
            } else {
                currData.unshift({
                    date: `01/${String(i + 1).padStart(2, '0')}/${yr}`,
                    desc: "Previous Period Balance",
                    cost: "", creditCat: "Starting Balance", type: "",
                    credit: prevProj, debit: 0, method: "Previous Balance", paid: "YES"
                });
                changed = true;
            }
        }
        if (depth === 0 && changed) saveToSupabase();
        return changed;
    }

    function calculateProjectedBalanceForMonth(monthKey) {
        if (!datasets[monthKey] || !datasets[monthKey].data) return 0;
        let transactions = datasets[monthKey].data;
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
        return currBal + creditsRecv - debitsPay;
    }

    function sortTransactions() {
        if (datasets[activeMonthKey] && datasets[activeMonthKey].data) {
            datasets[activeMonthKey].data.sort((a, b) => parseDateString(a.date) - parseDateString(b.date));
        }
    }

    function sortTransactionsByDateManual() {
        sortTransactions();
        renderApp();
        saveToSupabase();
        showToast("Transactions sorted by date!");
    }

    // Click a category in Cost Breakdown: jump to Transactions showing only that category (this month)
    function openCategoryInLedger(cat) {
        ledgerCat = cat;
        currentFilter = 'all';
        document.querySelectorAll('.filter-pills .pill').forEach((p, i) => p.classList.toggle('active', i === 0));
        const s = document.getElementById('search-input'); if (s) s.value = '';
        const all = document.getElementById('search-all'); if (all) all.checked = false;
        showView('transactions');
    }
    function clearCategoryFilter() {
        ledgerCat = '';
        renderApp();
    }

    function setFilter(filterType, element) {
        currentFilter = filterType;
        document.querySelectorAll('.filter-pills .pill').forEach(p => p.classList.remove('active'));
        element.classList.add('active');
        renderApp();
    }

    function openRecurringModal() {
        document.getElementById('recurring-modal').style.display = 'flex';
        document.getElementById('rec-auto').checked = autoApplyRecurring;
        populateRecurringCategoryDropdown();
        renderRecurringTable();
    }
    function closeRecurringModal() {
        document.getElementById('recurring-modal').style.display = 'none';
    }
    function populateRecurringCategoryDropdown() {
        const select = document.getElementById('rec-cat');
        if (!select) return;
        select.innerHTML = '<option value="">-- Expense Cat --</option>' + [...categories].sort().map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    }

    function addRecurringTemplate() {
        const desc = document.getElementById('rec-desc').value.trim();
        const cat = document.getElementById('rec-cat').value;
        const amount = parseFloat(document.getElementById('rec-amount').value) || 0;
        if (!desc || amount <= 0) { alert('Please enter a description and valid amount.'); return; }
        const day = Math.min(31, Math.max(1, parseInt(document.getElementById('rec-day').value, 10) || 1));
        recurringTemplates.push({ desc, category: cat, amount, day });
        document.getElementById('rec-desc').value = '';
        document.getElementById('rec-amount').value = '';
        document.getElementById('rec-day').value = '';
        renderRecurringTable();
        saveToSupabase();
        showToast("Recurring template added!");
    }

    function deleteRecurringTemplate(index) {
        recurringTemplates.splice(index, 1);
        renderRecurringTable();
        saveToSupabase();
    }

    function renderRecurringTable() {
        const tbody = document.getElementById('recurring-tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        recurringTemplates.forEach((t, index) => {
            let tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${esc(t.desc)}</td>
                <td>${esc(t.category || '--')}</td>
                <td style="text-align: center;">${esc(String(t.day || 1))}</td>
                <td class="col-num">${fmt(t.amount)}</td>
                <td style="text-align: center;"><button class="btn-danger" onclick="deleteRecurringTemplate(${index})">✕</button></td>
            `;
            tbody.appendChild(tr);
        });
    }

    function applyRecurringToActiveMonth() {
        if (!datasets[activeMonthKey]) ensureYearDatasetsExist(selectedYear);
        let txs = datasets[activeMonthKey].data;
        let monthNum = rawMonthNames.indexOf(selectedMonthName) + 1;
        let monthNumStr = String(monthNum).padStart(2, '0');
        let added = 0, skipped = 0;
        recurringTemplates.forEach(t => {
            const amt = parseFloat(t.amount) || 0;
            const already = txs.some(x => String(x.desc || '').trim().toLowerCase() === String(t.desc || '').trim().toLowerCase()
                && Math.abs((parseFloat(x.debit) || 0) - amt) < 0.005);
            if (already) { skipped++; return; }
            txs.push({
                date: `${String(Math.min(Math.max(parseInt(t.day, 10) || 1, 1), new Date(parseInt(selectedYear, 10), monthNum, 0).getDate())).padStart(2, '0')}/${monthNumStr}/${selectedYear}`,
                desc: t.desc, cost: t.category || '', creditCat: "", type: "Fixed", credit: 0, debit: amt, method: "Debit", paid: "NO"
            });
            added++;
        });
        sortTransactions();
        renderApp();
        saveToSupabase();
        closeRecurringModal();
        showToast(added ? `Added ${added} recurring item${added === 1 ? '' : 's'}${skipped ? ` (${skipped} already in this month)` : ''}` : 'All recurring items are already in this month');
    }

    function renderTransactions() {
        const tbody = document.getElementById('txn-tbody');
        tbody.innerHTML = '';
        if (!datasets[activeMonthKey]) ensureYearDatasetsExist(selectedYear);
        let transactions = datasets[activeMonthKey].data;
        const searchInput = document.getElementById('search-input');
        const searchAllBox = document.getElementById('search-all');
        const searchTerm = (searchAllBox && searchAllBox.checked) ? '' : (searchInput ? searchInput.value.toLowerCase() : '');
        const sortedCats = [...categories].sort();
        const sortedCredits = [...creditCategories].sort();
        const dueToday = startOfToday();
        const dueEnd = addDays(dueToday, dueWindowDays);
        visibleSel = [];
        if (selectedTx.size) {
            const here = new Set(datasets[activeMonthKey].data);
            selectedTx.forEach(t => { if (!here.has(t)) selectedTx.delete(t); });
        }
        transactions.forEach((tx, index) => {
            let cVal = parseFloat(tx.credit) || 0;
            let dVal = parseFloat(tx.debit) || 0;
            if (searchTerm && !String(tx.desc || '').toLowerCase().includes(searchTerm) && !String(tx.cost || '').toLowerCase().includes(searchTerm) && !String(tx.date || '').includes(searchTerm)) {
                return;
            }
            if (ledgerCat && String(tx.cost || '') !== ledgerCat) return;
            if (currentFilter === 'cleared' && tx.paid.toLowerCase() !== 'yes') return;
            if (currentFilter === 'pending' && tx.paid.toUpperCase() !== 'NO') return;
            if (currentFilter === 'credits' && cVal <= 0) return;
            if (currentFilter === 'debits' && dVal <= 0) return;
            let isYes = tx.paid.toLowerCase() === 'yes';
            let isoDate = toISOFormat(tx.date);
            if (!isRolloverTx(tx)) visibleSel.push(index);
            let tr = document.createElement('tr');
            tr.dataset.idx = index;
            if (selectedTx.has(tx)) tr.classList.add('row-selected');
            const dueCls = dueRowClass(tx, dueToday, dueEnd);
            if (dueCls) tr.classList.add(dueCls);
            tr.innerHTML = `
                <td class="col-sel">${isRolloverTx(tx) ? '' : `<input type="checkbox" class="row-sel" aria-label="Select this line" ${selectedTx.has(tx) ? 'checked' : ''} onclick="onRowSelect(event, ${index})">`}</td>
                <td><input type="date" class="col-date" aria-label="Date" value="${isoDate}" onchange="updateTxDate(${index}, this.value)"></td>
                <td><input type="text" class="col-desc" aria-label="Description" value="${esc(tx.desc)}" onchange="updateTxDesc(${index}, this.value)"></td>
                <td>
                    <select class="col-cat" aria-label="Expense category" onchange="updateTx(${index}, 'cost', this.value)">
                        <option value="">-- None --</option>
                        ${sortedCats.map(c => `<option value="${esc(c)}" ${tx.cost === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
                    </select>
                </td>
                <td>
                    <select class="col-cat" aria-label="Credit category" onchange="updateTx(${index}, 'creditCat', this.value)">
                        <option value="">-- None --</option>
                        ${sortedCredits.map(c => `<option value="${esc(c)}" ${tx.creditCat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
                    </select>
                </td>
                <td>
                    <select class="col-type" aria-label="Type" onchange="updateTx(${index}, 'type', this.value)">
                        <option value="">--</option>
                        <option value="Fixed" ${tx.type === 'Fixed' ? 'selected' : ''}>Fixed</option>
                        <option value="Variable" ${tx.type === 'Variable' ? 'selected' : ''}>Variable</option>
                    </select>
                </td>
                <td><input type="text" inputmode="decimal" autocomplete="off" class="col-num" aria-label="Credit amount" value="${Number(tx.credit) ? '$' + Number(tx.credit).toFixed(2) : ''}" oninput="moneyInput(this)" onchange="updateTx(${index}, 'credit', parseMoney(this.value)); moneyBlur(this)"></td>
                <td><input type="text" inputmode="decimal" autocomplete="off" class="col-num" aria-label="Debit amount" value="${tx.debit > 0 ? '$' + Number(tx.debit).toFixed(2) : ''}" oninput="moneyInput(this)" onchange="updateTx(${index}, 'debit', parseMoney(this.value)); moneyBlur(this)"></td>
                <td><input type="text" class="col-method" aria-label="Payment method" value="${esc(tx.method)}" onchange="updateTx(${index}, 'method', this.value)"></td>
                <td class="col-paid">
                    <label class="paid-toggle" title="${isYes ? 'Paid — click to mark as Pending' : 'Pending — click to mark as Paid'}">
                        <input type="checkbox" aria-label="Paid status" ${isYes ? 'checked' : ''} onchange="handlePaidChange(${index}, this.checked ? 'Yes' : 'NO')">
                        <span class="pt-track"><span class="pt-knob"></span></span>
                    </label>
                </td>
                <td class="col-action">
                    <div class="btn-action-row">
                        ${isRolloverTx(tx) ? '' : `<button class="btn-transfer" onclick="transferToNextMonth(${index})" title="Move this line to the next month as Pending">➡️</button>`}
                        <button class="btn-copy" onclick="duplicateTransaction(${index})" title="Copy line">📋</button>
                        <button class="btn-danger" onclick="deleteTx(${index})" title="Delete">✕</button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
        if (!tbody.children.length) {
            tbody.innerHTML = '<tr class="empty-state"><td colspan="11">No transactions found for this view.</td></tr>';
        }
        renderLedgerFooter();
        renderGlobalSearch();
        refreshSelectionUI();
    }

    function renderLedgerFooter() {
        const tfoot = document.getElementById('txn-tfoot');
        if (!tfoot || !datasets[activeMonthKey]) return;
        let totalCreditSum = 0, totalDebitSum = 0;
        datasets[activeMonthKey].data.forEach(t => {
            if (ledgerCat && String(t.cost || '') !== ledgerCat) return;
            totalCreditSum += parseFloat(t.credit) || 0;
            totalDebitSum += parseFloat(t.debit) || 0;
        });
        const chip = document.getElementById('cat-chip');
        if (chip) {
            chip.style.display = ledgerCat ? '' : 'none';
            chip.textContent = ledgerCat ? 'Category: ' + ledgerCat + '  ✕' : '';
        }
        tfoot.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: right; font-weight: 700; color: var(--text-muted);">${ledgerCat ? esc(ledgerCat) + ' Totals:' : 'Ledger Totals:'}</td>
                <td class="col-num text-success">${fmt(totalCreditSum)}</td>
                <td class="col-num text-danger">${fmt(totalDebitSum)}</td>
                <td colspan="3" style="text-align: right; padding-right: 8px;">
                    <button class="btn" style="padding: 4px 10px; font-size: 0.75rem;" onclick="openTransactionModal()">+ Add Transaction</button>
                </td>
            </tr>
        `;
    }

    function offerInlineUndo(rowLabel, tx, field, oldValue) {
        if (!tx) return;
        if (String(tx[field]) === String(oldValue)) return;
        showToast(`Edited ${rowLabel}`, false, {
            label: 'Undo',
            fn: () => {
                tx[field] = oldValue;
                renderApp();
                saveToSupabase();
                showToast('Edit undone');
            }
        });
    }

    function updateTxDesc(index, descVal) {
        const tx = datasets[activeMonthKey].data[index];
        const oldDesc = tx['desc'];
        tx['desc'] = descVal;
        let lowerDesc = descVal.toLowerCase();
        for (let keyword in autoCategorizationMap) {
            if (lowerDesc.includes(keyword)) {
                let suggestedCat = autoCategorizationMap[keyword];
                if (!tx['cost'] && categories.includes(suggestedCat)) {
                    tx['cost'] = suggestedCat;
                    showToast(`🧠 Auto-tagged as "${suggestedCat}"`);
                    break;
                }
            }
        }
        renderTransactions();
        calculateMetrics();
        saveToSupabase();
        offerInlineUndo('description', tx, 'desc', oldDesc);
    }

    function transferToNextMonth(index) {
        const key = activeMonthKey;
        const ds = datasets[key];
        const txToMove = ds && ds.data[index];
        if (!txToMove) return;
        if (isRolloverTx(txToMove)) {
            alert("System rollover balance lines cannot be transferred directly.");
            return;
        }
        const nextKey = ovShiftKey(key, 1);
        const p = ovParseKey(nextKey);
        if (!p || !allYears.includes(String(p.year))) {
            showToast(`There is no month after ${monthLabelOfKey(key)} to move this into`, true);
            return;
        }
        ensureYearDatasetsExist(String(p.year));
        const target = datasets[nextKey];
        if (!target || !Array.isArray(target.data)) { showToast('Could not open the next month', true); return; }
        const daysInMonth = new Date(p.year, p.idx + 1, 0).getDate();
        const copy = JSON.parse(JSON.stringify(txToMove));
        const old = parseTxDate(txToMove.date);
        const day = Math.min(old ? old.getDate() : 1, daysInMonth);
        copy.date = `${String(day).padStart(2, '0')}/${String(p.idx + 1).padStart(2, '0')}/${p.year}`;
        copy.paid = 'NO';
        ds.data.splice(index, 1);
        target.data.push(copy);
        target.data.sort((a, b) => parseDateString(a.date) - parseDateString(b.date));
        renderApp();
        saveToSupabase();
        showToast(`Moved to ${monthLabelOfKey(nextKey)} as Pending`, false, {
            label: 'Undo',
            fn: () => {
                if (!datasets[nextKey] || !datasets[key]) return;
                datasets[nextKey].data = datasets[nextKey].data.filter(x => x !== copy);
                datasets[key].data.splice(Math.min(index, datasets[key].data.length), 0, txToMove);
                sortTransactions();
                renderApp();
                saveToSupabase();
                showToast('Moved back');
            }
        });
    }

    function duplicateTransaction(index) {
        let txToCopy = datasets[activeMonthKey].data[index];
        let newTx = JSON.parse(JSON.stringify(txToCopy));
        newTx.paid = "NO";
        datasets[activeMonthKey].data.splice(index + 1, 0, newTx);
        renderApp();
        saveToSupabase();
        showToast("Transaction duplicated!");
    }

    function handlePaidChange(index, value) {
        datasets[activeMonthKey].data[index]['paid'] = value;
        calculateMetrics();
        renderTransactions();
        saveToSupabase();
        showToast(value.toLowerCase() === 'yes' ? 'Marked as Paid' : 'Marked as Pending');
    }

    function updateTxDate(index, isoDateVal) {
        if (!isoDateVal) return;
        const fromKey = activeMonthKey;
        const ds = datasets[fromKey];
        const tx = ds && ds.data[index];
        if (!tx) return;
        const d = parseIso(isoDateVal);
        if (!d) { showToast('That date could not be read', true); return; }
        const yr = String(d.getFullYear());
        if (!allYears.includes(yr)) {
            showToast(`Pick a date between ${allYears[0]} and ${allYears[allYears.length - 1]}`, true);
            renderTransactions();
            return;
        }
        const oldDate = tx.date;
        tx.date = toAUFormat(isoDateVal);
        const monthName = rawMonthNames[d.getMonth()];
        const toKey = monthName + yr;
        if (toKey !== fromKey) {
            ensureYearDatasetsExist(yr);
            ds.data.splice(index, 1);
            datasets[toKey].data.push(tx);
            datasets[toKey].data.sort((a, b) => parseDateString(a.date) - parseDateString(b.date));
            selectedYear = yr;
            document.getElementById('year-dropdown').value = yr;
            selectedMonthName = monthName;
            lastMonthName = monthName;
            document.getElementById('month-dropdown').value = monthName;
            activeMonthKey = toKey;
            renderApp();
            saveToSupabase();
            showToast(`Moved to ${monthLabelOfKey(toKey)} (new date)`, false, {
                label: 'Undo',
                fn: () => {
                    if (!datasets[toKey] || !datasets[fromKey]) return;
                    datasets[toKey].data = datasets[toKey].data.filter(x => x !== tx);
                    tx.date = oldDate;
                    datasets[fromKey].data.push(tx);
                    const p = ovParseKey(fromKey);
                    selectedYear = String(p.year);
                    document.getElementById('year-dropdown').value = selectedYear;
                    selectedMonthName = rawMonthNames[p.idx];
                    lastMonthName = selectedMonthName;
                    document.getElementById('month-dropdown').value = selectedMonthName;
                    activeMonthKey = fromKey;
                    renderApp();
                    saveToSupabase();
                    showToast('Moved back');
                }
            });
        } else {
            sortTransactions();
            renderApp();
            saveToSupabase();
        }
    }

    function updateTx(index, field, value) {
        const tx = datasets[activeMonthKey].data[index];
        const oldValue = tx[field];
        tx[field] = value;
        if (field === 'cost' && value) {
            let desc = tx['desc'].toLowerCase().trim();
            if (desc && desc.length > 2 && !autoCategorizationMap[desc]) {
                autoCategorizationMap[desc] = value;
            }
        }
        calculateMetrics();
        renderLedgerFooter();
        saveToSupabase();
        const labels = { cost: 'category', creditCat: 'credit category', type: 'type', debit: 'amount', credit: 'amount', method: 'method' };
        offerInlineUndo(labels[field] || field, tx, field, oldValue);
    }

    function deleteTx(index) {
        const key = activeMonthKey;
        const ds = datasets[key];
        const tx = ds && ds.data[index];
        if (!tx) return;
        ds.data.splice(index, 1);
        renderApp();
        saveToSupabase();
        showToast(`Deleted "${tx.desc || 'line'}"`, false, {
            label: 'Undo',
            fn: () => {
                if (!datasets[key]) return;
                datasets[key].data.splice(Math.min(index, datasets[key].data.length), 0, tx);
                renderApp();
                saveToSupabase();
                showToast('Restored');
            }
        });
    }

    function resetMonthData() {
        if (!confirm(`Reset all changes for ${selectedMonthName.toUpperCase()} ${selectedYear}?`)) return;
        const key = activeMonthKey;
        const backup = JSON.parse(JSON.stringify(datasets[key] || { title: monthLabelOfKey(key), data: [] }));
        const monthNum = String(rawMonthNames.indexOf(selectedMonthName) + 1).padStart(2, '0');
        datasets[key] = {
            title: monthLabelOfKey(key),
            data: [{ date: `01/${monthNum}/${selectedYear}`, desc: selectedMonthName === 'january' ? 'Starting Balance' : 'Previous Period Balance', cost: '', creditCat: 'Starting Balance', type: '', credit: 0, debit: 0, method: 'Previous Balance', paid: 'YES' }]
        };
        sortTransactions();
        renderApp();
        saveToSupabase();
        showToast('Month reset', false, {
            label: 'Undo',
            fn: () => { datasets[key] = backup; renderApp(); saveToSupabase(); showToast('Month restored'); }
        });
    }
