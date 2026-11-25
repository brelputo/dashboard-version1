window.__build = window.__build || {}; window.__build['budgets.js'] = '2026-11-25-q';
/* BUDGETS: budgets, categories and budget alerts.
   Part of the Financial Movement Dashboard. Plain script (not a module): functions here are shared with the other js files. */

    function setCategoryCreationType(type) {
        activeCreationType = type;
        document.getElementById('type-pill-expense').classList.toggle('active', type === 'expense');
        document.getElementById('type-pill-credit').className = type === 'credit' ? 'pill active' : 'pill';
    }

    function renderBudgetHealth(catMap, projBal, transactions) {
        let totalBudget = 0, spentBudgeted = 0;
        const alerts = [];
        categories.forEach(cat => {
            const base = getCategoryBudgetForMonth(cat, activeMonthKey);
            if (!(base > 0)) return;
            const limit = base + getCategoryRolloverCarryover(cat, activeMonthKey);
            const spent = catMap[cat] || 0;
            totalBudget += limit;
            spentBudgeted += spent;
            const pct = (spent / limit) * 100;
            if (pct >= 80) alerts.push({ cat, spent, limit, pct, over: spent > limit });
        });
        alerts.sort((a, b) => b.pct - a.pct);
        const left = totalBudget - spentBudgeted;
        document.getElementById('bh-budget').innerText = fmt(totalBudget);
        document.getElementById('bh-spent').innerText = fmt(spentBudgeted);
        const leftEl = document.getElementById('bh-left');
        leftEl.innerText = totalBudget > 0 ? fmt(left) : '--';
        leftEl.className = totalBudget > 0 ? (left < 0 ? 'text-danger' : 'text-success') : '';
        const income = transactions.filter(t => !isRolloverTx(t)).reduce((a, t) => a + (parseFloat(t.credit) || 0), 0);
        const spend = transactions.reduce((a, t) => a + (parseFloat(t.debit) || 0), 0);
        const rateEl = document.getElementById('bh-rate');
        if (income > 0) {
            const rate = ((income - spend) / income) * 100;
            rateEl.innerText = rate.toFixed(1) + '%';
            rateEl.className = rate >= 0 ? 'text-success' : 'text-danger';
        } else {
            rateEl.innerText = '--';
            rateEl.className = '';
        }
        const now = new Date();
        const isCurrent = activeMonthKey === rawMonthNames[now.getMonth()] + now.getFullYear();
        const daysEl = document.getElementById('bh-days');
        const dailyEl = document.getElementById('bh-daily');
        if (isCurrent) {
            const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
            const daysLeft = daysInMonth - now.getDate() + 1;
            daysEl.innerText = String(daysLeft);
            dailyEl.innerText = projBal > 0 ? fmt(projBal / daysLeft) : fmt(0);
            dailyEl.className = projBal > 0 ? '' : 'text-danger';
        } else {
            daysEl.innerText = '--';
            dailyEl.innerText = '--';
            dailyEl.className = '';
        }
        const box = document.getElementById('bh-alerts');
        if (totalBudget <= 0) {
            box.innerHTML = '<div class="alert-item">No budget limits set yet. Add limits in Manage Categories to get alerts.</div>';
        } else if (!alerts.length) {
            box.innerHTML = '<div class="alert-item ok"><span>All budgets are on track</span><strong>✓</strong></div>';
        } else {
            box.innerHTML = alerts.map(a => `
                <div class="alert-item ${a.over ? 'over' : ''}">
                    <span>${esc(a.cat)}: ${fmt(a.spent)} of ${fmt(a.limit)}</span>
                    <strong>${a.over ? 'Over by ' + fmt(a.spent - a.limit) : a.pct.toFixed(0) + '%'}</strong>
                </div>`).join('');
        }
    }

    function currentMonthLabel() {
        return selectedMonthName.charAt(0).toUpperCase() + selectedMonthName.slice(1) + ' ' + selectedYear;
    }

    function budgetMonthProgress() {
        const p = ovParseKey(activeMonthKey);
        if (!p) return 0;
        const dim = new Date(p.year, p.idx + 1, 0).getDate();
        const today = startOfToday();
        const monthStart = new Date(p.year, p.idx, 1);
        const monthEnd = new Date(p.year, p.idx, dim);
        if (today >= monthStart && today <= monthEnd) return today.getDate() / dim;
        if (today > monthEnd) return 1;
        return 0;
    }

    function isCurrentViewedMonth() {
        const p = ovParseKey(activeMonthKey);
        if (!p) return false;
        const today = startOfToday();
        return p.year === today.getFullYear() && p.idx === today.getMonth();
    }

    function daysLeftInViewedMonth() {
        const p = ovParseKey(activeMonthKey);
        if (!p) return 0;
        const dim = new Date(p.year, p.idx + 1, 0).getDate();
        if (!isCurrentViewedMonth()) return 0;
        return dim - startOfToday().getDate() + 1;
    }

    function getBudgetRows() {
        const txs = (datasets[activeMonthKey] && datasets[activeMonthKey].data) || [];
        const spentMap = {};
        txs.forEach(t => {
            const d = parseFloat(t.debit) || 0;
            if (t.cost && d > 0) spentMap[t.cost] = (spentMap[t.cost] || 0) + d;
        });
        const progress = budgetMonthProgress();
        return [...categories].sort().map(cat => {
            const base = getCategoryBudgetForMonth(cat, activeMonthKey);
            if (!(base > 0)) return null;
            const carry = getCategoryRolloverCarryover(cat, activeMonthKey);
            const limit = base + carry;
            const spent = spentMap[cat] || 0;
            const pct = limit > 0 ? (spent / limit) * 100 : 0;
            const pacePct = progress > 0 ? limit * progress : null;
            const proj = progress > 0 && progress < 1 ? spent / progress : spent;
            return { cat, carry, limit, spent, left: limit - spent, pct, pacePct, proj };
        }).filter(Boolean);
    }

    function setBudgetSort(mode) {
        budgetSort = mode;
        document.querySelectorAll('#bg-sort-pills .pill').forEach(p => p.classList.toggle('active', p.dataset.sort === mode));
        renderBudgets();
    }

    function budgetPaceVerdict(r) {
        if (r.spent > r.limit) {
            return { cls: 'bad', text: `Over by ${fmt(r.spent - r.limit)}` };
        }
        if (r.pacePct === null) {
            return { cls: null, text: null };
        }
        const diff = r.spent - r.pacePct;
        if (diff > r.limit * 0.1) {
            return { cls: 'warn', text: `Fast pace · on track for ${fmt(r.proj)} by month end` };
        }
        if (diff < -r.limit * 0.1) {
            return { cls: 'good', text: `Ahead of pace · ${fmt(Math.max(0, r.pacePct - r.spent))} under where you should be` };
        }
        return { cls: 'good', text: 'On pace' };
    }

    function renderBudgets() {
        const grid = document.getElementById('budgets-grid');
        if (!grid) return;
        const rows = getBudgetRows();
        const progress = budgetMonthProgress();
        const current = isCurrentViewedMonth();
        const daysLeft = daysLeftInViewedMonth();

        document.getElementById('budgets-month').innerText = currentMonthLabel();

        const sumEl = document.getElementById('bg-summary');
        if (sumEl) {
            const totalLimits = rows.reduce((a, r) => a + r.limit, 0);
            const totalSpent = rows.reduce((a, r) => a + r.spent, 0);
            const totalLeft = totalLimits - totalSpent;
            const overCount = rows.filter(r => r.spent > r.limit).length;
            document.getElementById('bg-sum-limits').innerText = fmt(totalLimits);
            document.getElementById('bg-sum-count').innerText = `${rows.length} budget${rows.length === 1 ? '' : 's'} this month`;
            const spentEl = document.getElementById('bg-sum-spent');
            spentEl.innerText = fmt(totalSpent);
            spentEl.className = totalSpent > 0 ? 'text-danger' : '';
            document.getElementById('bg-sum-days').innerText = current ? `Day ${startOfToday().getDate()} of the month` : 'Full month';
            const leftEl = document.getElementById('bg-sum-left');
            leftEl.innerText = fmt(totalLeft);
            leftEl.className = totalLeft < 0 ? 'text-danger' : 'text-success';
            document.getElementById('bg-sum-daily').innerText = current && daysLeft > 0 && totalLeft > 0
                ? `${fmt(totalLeft / daysLeft)} a day keeps you on plan` : (current && daysLeft > 0 ? 'Nothing left to spend' : '');
            const overEl = document.getElementById('bg-sum-over');
            overEl.innerText = overCount ? `${overCount} categor${overCount === 1 ? 'y' : 'ies'}` : 'None 🎉';
            overEl.className = overCount ? 'text-danger' : '';
            const warnFast = rows.filter(r => budgetPaceVerdict(r).cls === 'warn').length;
            document.getElementById('bg-sum-pace').innerText = current
                ? (overCount ? 'Fix the red cards first' : warnFast ? `${warnFast} running fast for the month so far` : 'All on pace')
                : 'Pace is only shown for the current month';
        }

        const paceNote = document.getElementById('bg-pace-note');
        if (paceNote) {
            paceNote.innerText = current && progress > 0
                ? `Tick on each bar = where you should be by today (day ${startOfToday().getDate()}).`
                : '';
        }

        if (!rows.length) {
            grid.innerHTML = renderBudgetEmptyState();
            return;
        }

        const sorted = [...rows];
        if (budgetSort === 'name') sorted.sort((a, b) => a.cat.localeCompare(b.cat));
        else if (budgetSort === 'size') sorted.sort((a, b) => b.limit - a.limit);
        else sorted.sort((a, b) => {
            const aRisk = a.spent > a.limit ? 2 : (a.pct >= 80 ? 1 : 0);
            const bRisk = b.spent > b.limit ? 2 : (b.pct >= 80 ? 1 : 0);
            return bRisk - aRisk || b.pct - a.pct;
        });

        grid.innerHTML = sorted.map(r => {
            const over = r.spent > r.limit;
            const state = over ? 'over' : (r.pct >= 80 ? 'warn' : '');
            const fill = over ? 'over-budget' : (r.pct >= 80 ? 'warn' : '');
            const v = budgetPaceVerdict(r);
            const tick = r.pacePct !== null && !over
                ? `<div class="pace-tick" style="left: calc(${Math.min(100, (r.pacePct / r.limit) * 100).toFixed(1)}% - 1px)" title="Where you should be by today"></div>`
                : '';
            const paceLine = v.text
                ? `<div class="pace-line"><span class="verdict ${v.cls}">${v.cls === 'good' ? '✓' : '⚡'}</span><span>${esc(v.text)}</span></div>`
                : '';
            const safeDaily = current && daysLeft > 0 && r.left > 0 ? `${fmt(r.left / daysLeft)}/day` : null;
            return `
                <div class="budget-card ${over ? 'is-over' : ''}">
                    <div class="budget-top">
                        <button type="button" class="cat-link budget-name" data-open-cat="${esc(r.cat)}" title="See every ${esc(r.cat)} line in Transactions">${esc(r.cat)}</button>
                        <span class="budget-badge ${state}">${Math.round(r.pct)}% Spent</span>
                    </div>
                    <div class="budget-sub">
                        <span class="budget-limit">Limit: <strong>${fmt(r.limit)}</strong>${r.carry > 0 ? ` <span class="budget-roll">(incl. ${fmt(r.carry)} rollover)</span>` : ''}${safeDaily ? ` · <span style="color: var(--success);">${safeDaily} safe</span>` : ''}</span>
                        <span class="budget-actions">
                            <button type="button" class="step-btn" title="Reduce limit by $10" aria-label="Reduce limit by $10" onclick="stepBudget('${esc(r.cat)}', -10)">−</button>
                            <button type="button" class="step-btn" title="Raise limit by $10" aria-label="Raise limit by $10" onclick="stepBudget('${esc(r.cat)}', 10)">+</button>
                            <button type="button" class="btn-transfer" data-name="${esc(r.cat)}" onclick="openBudgetModal(this.dataset.name)" title="Edit budget">✏️</button>
                            <button type="button" class="btn-danger" data-name="${esc(r.cat)}" onclick="removeBudget(this.dataset.name)" title="Remove budget">✕</button>
                        </span>
                    </div>
                    <div class="budget-amounts">
                        <span>Spent: ${fmt(r.spent)}</span>
                        <span class="${over ? 'text-danger' : ''}">${over ? 'Over: ' + fmt(r.spent - r.limit) : 'Left: ' + fmt(r.left)}</span>
                    </div>
                    <div class="progress-bar-bg">${tick}<div class="progress-bar-fill ${fill}" style="width: ${Math.min(100, r.pct).toFixed(1)}%"></div></div>
                    ${paceLine}
                </div>`;
        }).join('');
    }

    function renderBudgetEmptyState() {
        const txs = (datasets[activeMonthKey] && datasets[activeMonthKey].data) || [];
        const spentMap = {};
        txs.forEach(t => {
            const d = parseFloat(t.debit) || 0;
            if (t.cost && d > 0) spentMap[t.cost] = (spentMap[t.cost] || 0) + d;
        });
        const unbudgeted = Object.keys(spentMap)
            .filter(c => !(getCategoryBudgetForMonth(c, activeMonthKey) > 0))
            .map(c => ({ c, spent: spentMap[c] }))
            .sort((a, b) => b.spent - a.spent)
            .slice(0, 8);
        const inner = unbudgeted.length
            ? `<p style="margin-bottom: 4px; font-size: 0.84rem; color: var(--text-muted);">No budgets set for ${esc(currentMonthLabel())} yet. You spent the most here — click one to budget it:</p>
               <div class="budget-empty-grid">${unbudgeted.map(u => `
                    <button type="button" class="budget-empty-item" onclick="openBudgetModal('${esc(u.c)}')">
                        <div><strong>${esc(u.c)}</strong><small>${esc(fmt(u.spent))} spent this month</small></div>
                        <span style="color: var(--accent); font-weight: 700;">Set budget →</span>
                    </button>`).join('')}</div>`
            : `<p style="font-size: 0.84rem; color: var(--text-muted);">No budgets set for ${esc(currentMonthLabel())} yet. Click "+ New Budget" to set a monthly limit for a category.</p>`;
        return `<div class="empty-goals" style="font-style: normal;">${inner}</div>`;
    }

    function stepBudget(cat, delta) {
        const cur = getCategoryBudgetForMonth(cat, activeMonthKey);
        const next = Math.round((cur + delta) * 100) / 100;
        if (next <= 0) {
            showToast(delta < 0 ? `That would remove the budget — use ✕ instead` : 'Enter a limit above $0', true);
            return;
        }
        updateCategoryBudget(cat, next);
    }

    function categoryAvg3mo(cat) {
        const p = ovParseKey(activeMonthKey);
        if (!p) return null;
        const vals = [];
        for (let k = 1; k <= 3; k++) {
            const r = spendByCategory(monthKeyOfDate(new Date(p.year, p.idx - k, 1)), 0);
            if (r.map[cat] !== undefined) vals.push(r.map[cat]);
        }
        if (!vals.length) return null;
        return vals.reduce((a, b) => a + b, 0) / vals.length;
    }

    function openBudgetModal(cat) {
        if (!categories.length) { showToast('Add an expense category first', true); return; }
        editingBudgetCat = cat || null;
        const sel = document.getElementById('bm-cat');
        const sorted = [...categories].sort();
        sel.innerHTML = sorted.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
        document.getElementById('budget-modal-title').innerText = editingBudgetCat ? 'Edit Budget' : 'New Budget';
        document.getElementById('bm-note').innerText = 'Budget for ' + currentMonthLabel();
        if (editingBudgetCat) { sel.value = editingBudgetCat; sel.disabled = true; }
        else {
            sel.disabled = false;
            const free = sorted.find(c => !(getCategoryBudgetForMonth(c, activeMonthKey) > 0));
            sel.value = free || sorted[0];
        }
        onBudgetCatChange();
        document.getElementById('budget-modal').style.display = 'flex';
        setTimeout(() => { document.getElementById(editingBudgetCat ? 'bm-limit' : 'bm-cat').focus(); }, 50);
    }

    function onBudgetCatChange() {
        const cat = document.getElementById('bm-cat').value;
        const cur = getCategoryBudgetForMonth(cat, activeMonthKey);
        document.getElementById('bm-limit').value = cur > 0 ? Number(cur).toFixed(2) : '';
        const hint = document.getElementById('bm-avg-hint');
        if (!cat) { hint.style.display = 'none'; return; }
        const avg = categoryAvg3mo(cat);
        if (avg && avg > 0) {
            document.getElementById('bm-avg-val').innerText = fmt(avg);
            hint.style.display = 'flex';
        } else {
            hint.style.display = 'none';
        }
    }

    function useAvgAsBudget() {
        const cat = document.getElementById('bm-cat').value;
        const avg = categoryAvg3mo(cat);
        if (avg && avg > 0) {
            document.getElementById('bm-limit').value = (Math.ceil(avg / 10) * 10).toFixed(2);
        }
    }

    function closeBudgetModal() {
        const m = document.getElementById('budget-modal');
        if (m) m.style.display = 'none';
        editingBudgetCat = null;
    }

    function saveBudgetFromModal() {
        const cat = document.getElementById('bm-cat').value;
        const limit = parseFloat(document.getElementById('bm-limit').value);
        if (!cat) { showToast('Pick a category', true); return; }
        if (!(limit > 0)) { showToast('Enter a limit above $0', true); document.getElementById('bm-limit').focus(); return; }
        updateCategoryBudget(cat, limit);
        closeBudgetModal();
        renderCategoryManagement();
    }

    function removeBudget(cat) {
        if (!confirm(`Remove the budget for "${cat}"?`)) return;
        updateCategoryBudget(cat, 0);
        renderCategoryManagement();
        showToast(`Budget removed for ${cat}`);
    }

    function ovBudgetAlerts(txs) {
        const spent = {};
        txs.forEach(t => { const d = parseFloat(t.debit) || 0; if (t.cost && d > 0) spent[t.cost] = (spent[t.cost] || 0) + d; });
        const out = [];
        categories.forEach(cat => {
            const base = getCategoryBudgetForMonth(cat, activeMonthKey);
            if (!(base > 0)) return;
            const limit = base + getCategoryRolloverCarryover(cat, activeMonthKey);
            const s = spent[cat] || 0;
            const pct = limit > 0 ? (s / limit) * 100 : 0;
            if (pct >= 80) out.push({ cat, spent: s, limit, pct, over: s > limit });
        });
        return out.sort((a, b) => b.pct - a.pct);
    }

    function renderBudgetStrip(txs) {
        const el = document.getElementById('ov-alerts');
        if (!el) return;
        const a = ovBudgetAlerts(txs);
        if (!a.length) { el.style.display = 'none'; el.innerHTML = ''; return; }
        el.style.display = 'flex';
        const warn = OV_SVG('<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path>');
        el.innerHTML = `<span class="ov-alert-title">${warn}Budget alerts</span>` +
            a.slice(0, 4).map(x => `<button type="button" class="ov-alert-chip ${x.over ? 'over' : ''}" onclick="showView('budgets')" title="${esc(x.cat)}: ${esc(fmt(x.spent))} of ${esc(fmt(x.limit))}">${esc(x.cat)} · ${x.over ? 'over by ' + esc(fmt(x.spent - x.limit)) : Math.round(x.pct) + '%'}</button>`).join('') +
            (a.length > 4 ? `<span class="ov-alert-more">+${a.length - 4} more</span>` : '');
    }

    function isBudgetKeyFor(bKey, name) {
        if (bKey === name) return true;
        if (!bKey.startsWith(name + '_')) return false;
        return /^(january|february|march|april|may|june|july|august|september|october|november|december)\d{4}$/.test(bKey.slice(name.length + 1));
    }

    function toggleBudgetRollover(checked) {
        enableBudgetRollover = checked;
        calculateMetrics();
        saveToSupabase();
        showToast(checked ? "Budget rollover enabled!" : "Budget rollover disabled.");
    }

    function getCategoryBudgetForMonth(catName, monthKey) {
        let monthlyKey = `${catName}_${monthKey}`;
        if (categoryBudgets[monthlyKey] !== undefined) return categoryBudgets[monthlyKey];
        return categoryBudgets[catName] || 0;
    }

    function getCategoryRolloverCarryover(catName, monthKey) {
        if (!enableBudgetRollover) return 0;
        const p = ovParseKey(monthKey);
        if (!p) return 0;
        const firstYear = parseInt(allYears[0], 10);
        const target = p.year * 12 + p.idx;
        let accumulatedExtra = 0;
        for (let t = firstYear * 12; t < target; t++) {
            const mKey = rawMonthNames[((t % 12) + 12) % 12] + Math.floor(t / 12);
            const baseLimit = getCategoryBudgetForMonth(catName, mKey);
            if (baseLimit > 0) {
                const mtxs = datasets[mKey] ? datasets[mKey].data || [] : [];
                const spent = mtxs.filter(x => x.cost === catName && String(x.paid || '').toLowerCase() === 'yes').reduce((a, x) => a + (parseFloat(x.debit) || 0), 0);
                const leftover = (baseLimit + accumulatedExtra) - spent;
                accumulatedExtra = Math.max(0, leftover);
            }
        }
        return accumulatedExtra;
    }

    function renderCategoryManagement() {
        const tbody = document.getElementById('manage-categories-tbody');
        tbody.innerHTML = '';
        let combinedList = [];
        [...categories].sort().forEach(c => combinedList.push({ name: c, type: 'Expense' }));
        [...creditCategories].sort().forEach(c => combinedList.push({ name: c, type: 'Credit' }));
        combinedList.forEach((item) => {
            let isExpense = item.type === 'Expense';
            let limitVal = isExpense ? getCategoryBudgetForMonth(item.name, activeMonthKey) : '';
            let tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-weight: 500;">${esc(item.name)}</td>
                <td style="text-align: center;"><span class="pill" style="padding: 2px 4px; font-size: 0.6rem; background: ${isExpense ? 'rgba(37,99,235,0.15)' : 'rgba(16,185,129,0.15)'}; color: ${isExpense ? '#60a5fa' : '#34d399'}; border-color: ${isExpense ? 'rgba(37,99,235,0.3)' : 'rgba(16,185,129,0.3)'};">${item.type}</span></td>
                <td>${isExpense ? `<input type="number" step="10" placeholder="No limit" value="${limitVal > 0 ? Number(limitVal).toFixed(2) : ''}" data-name="${esc(item.name)}" onchange="updateCategoryBudget(this.dataset.name, parseFloat(this.value)||0)" style="height: 28px; padding: 2px 4px; font-size: 0.75rem;">` : '<span style="color:var(--text-muted); font-size:0.7rem; text-align:right; display:block;">N/A</span>'}</td>
                <td style="text-align: right; padding-right: 8px;">
                    <div class="btn-action-row" style="justify-content: flex-end;">
                        <button class="btn-transfer" data-name="${esc(item.name)}" data-type="${item.type}" onclick="renameCategory(this.dataset.name, this.dataset.type)" title="Rename Category">✏️</button>
                        <button class="btn-danger" data-name="${esc(item.name)}" data-type="${item.type}" onclick="deleteCategory(this.dataset.name, this.dataset.type)" title="Delete Category">✕</button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    function updateCategoryBudget(catName, limitValue) {
        let monthlyKey = `${catName}_${activeMonthKey}`;
        if (limitValue <= 0) {
            delete categoryBudgets[monthlyKey];
            delete categoryBudgets[catName];
        } else {
            categoryBudgets[monthlyKey] = limitValue;
            categoryBudgets[catName] = limitValue;
        }
        calculateMetrics();
        renderBudgets();
        saveToSupabase();
        showToast(`Budget limit updated for ${catName}`);
    }

    function addNewCategory() {
        const inputEl = document.getElementById('new-category-input');
        const val = inputEl.value.trim();
        if (!val) return;
        if (activeCreationType === 'expense') {
            if (categories.map(c => c.toLowerCase()).includes(val.toLowerCase())) {
                alert('This expense category already exists.');
                return;
            }
            categories.push(val);
            showToast(`Expense category "${val}" added!`);
        } else {
            if (creditCategories.map(c => c.toLowerCase()).includes(val.toLowerCase())) {
                alert('This credit category already exists.');
                return;
            }
            creditCategories.push(val);
            showToast(`Credit category "${val}" added!`);
        }
        inputEl.value = '';
        renderApp();
        saveToSupabase();
    }

    function renameCategory(oldName, type) {
        const newName = prompt(`Enter new name for ${type.toLowerCase()} category "${oldName}":`, oldName);
        if (!newName || newName.trim() === '' || newName === oldName) return;
        const trimmed = newName.trim();
        if (type === 'Expense') {
            if (categories.some(c => c !== oldName && c.toLowerCase() === trimmed.toLowerCase())) {
                alert('An expense category with this name already exists.');
                return;
            }
            const idx = categories.indexOf(oldName);
            if (idx !== -1) categories[idx] = trimmed;
            Object.keys(autoCategorizationMap).forEach(k => { if (autoCategorizationMap[k] === oldName) autoCategorizationMap[k] = trimmed; });
            recurringTemplates.forEach(t => { if (t.category === oldName) t.category = trimmed; });
            subscriptions.forEach(s => { if (s.category === oldName) s.category = trimmed; });
            Object.keys(categoryBudgets).forEach(bKey => {
                if (bKey === oldName) {
                    categoryBudgets[trimmed] = categoryBudgets[oldName];
                    delete categoryBudgets[oldName];
                } else if (isBudgetKeyFor(bKey, oldName)) {
                    let newBKey = trimmed + bKey.slice(oldName.length);
                    categoryBudgets[newBKey] = categoryBudgets[bKey];
                    delete categoryBudgets[bKey];
                }
            });
            Object.keys(datasets).forEach(mKey => {
                if (datasets[mKey] && datasets[mKey].data) {
                    datasets[mKey].data.forEach(tx => { if (tx.cost === oldName) tx.cost = trimmed; });
                }
            });
        } else {
            if (creditCategories.some(c => c !== oldName && c.toLowerCase() === trimmed.toLowerCase())) {
                alert('A credit category with this name already exists.');
                return;
            }
            const idx = creditCategories.indexOf(oldName);
            if (idx !== -1) creditCategories[idx] = trimmed;
            Object.keys(datasets).forEach(mKey => {
                if (datasets[mKey] && datasets[mKey].data) {
                    datasets[mKey].data.forEach(tx => { if (tx.creditCat === oldName) tx.creditCat = trimmed; });
                }
            });
        }
        renderApp();
        saveToSupabase();
        showToast(`Renamed to "${trimmed}" successfully!`);
    }

    function deleteCategory(catName, type) {
        if (!confirm(`Are you sure you want to delete ${type.toLowerCase()} category "${catName}"?`)) return;
        if (type === 'Expense') {
            categories = categories.filter(c => c !== catName);
            Object.keys(categoryBudgets).forEach(bKey => {
                if (isBudgetKeyFor(bKey, catName)) delete categoryBudgets[bKey];
            });
            Object.keys(datasets).forEach(mKey => {
                if (datasets[mKey] && datasets[mKey].data) {
                    datasets[mKey].data.forEach(tx => { if (tx.cost === catName) tx.cost = ""; });
                }
            });
        } else {
            creditCategories = creditCategories.filter(c => c !== catName);
            Object.keys(datasets).forEach(mKey => {
                if (datasets[mKey] && datasets[mKey].data) {
                    datasets[mKey].data.forEach(tx => { if (tx.creditCat === catName) tx.creditCat = ""; });
                }
            });
        }
        renderApp();
        saveToSupabase();
        showToast(`Category "${catName}" deleted`);
    }
