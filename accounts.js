window.__build = window.__build || {}; window.__build['accounts.js'] = '2026-11-27-financial-audit-2';
/* ACCOUNTS: several separate accounts (e.g. Day by Day, Savings, Other bank), a switcher in the header,
   transfers between accounts, and the "All Accounts" overview page.
   How it works: the rest of the app always works on the ACTIVE account through the shared variables (datasets, categories, ...).
   When you switch account, those variables are saved into the old account and filled from the new one.
   Part of the Financial Movement Dashboard. Plain script (not a module). */

const ACCT_DEFAULT_CATS = [
    "Supermarket", "Rent", "Electricity", "Internet", "Phone Plan", "Fuel", "Car", "Health", "Entertainment",
    "Coffee", "Lunch", "Fast Food", "Clothing", "Gift", "Online Shop", "Bank Fee", "Credit Card", "Investment", "Miscellaneous"
];
const ACCT_DEFAULT_CREDIT = ["Wages", "Starting Balance", "Other Credits", "Refund", "Transfer", "Investment Return", "Interest"];

let accounts = [];            // [{ id, name, data: { categories, creditCategories, datasets, ... } }]
let activeAccountId = '';

function acctNewId() { return 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function getAcctState() {
    return { categories, creditCategories, datasets, categoryBudgets, enableBudgetRollover, recurringTemplates, autoCategorizationMap, savingsGoals, subscriptions, schedules, autoApplyRecurring, autoPostSchedules, recurringApplied, investGoal };
}
function setAcctState(s) {
    categories = s.categories; creditCategories = s.creditCategories; datasets = s.datasets; categoryBudgets = s.categoryBudgets;
    enableBudgetRollover = s.enableBudgetRollover; recurringTemplates = s.recurringTemplates; autoCategorizationMap = s.autoCategorizationMap;
    savingsGoals = s.savingsGoals; subscriptions = s.subscriptions; schedules = s.schedules; autoApplyRecurring = s.autoApplyRecurring; autoPostSchedules = s.autoPostSchedules !== false; recurringApplied = s.recurringApplied; investGoal = s.investGoal;
}
// fills anything missing so an account always has every field the app expects
function cleanAcctData(d) {
    d = (d && typeof d === 'object') ? d : {};
    return {
        categories: Array.isArray(d.categories) ? d.categories : ACCT_DEFAULT_CATS.slice(),
        creditCategories: Array.isArray(d.creditCategories) ? d.creditCategories : ACCT_DEFAULT_CREDIT.slice(),
        datasets: (d.datasets && typeof d.datasets === 'object') ? d.datasets : {},
        categoryBudgets: (d.categoryBudgets && typeof d.categoryBudgets === 'object') ? d.categoryBudgets : {},
        enableBudgetRollover: !!d.enableBudgetRollover,
        recurringTemplates: Array.isArray(d.recurringTemplates) ? d.recurringTemplates : [],
        autoCategorizationMap: (d.autoCategorizationMap && typeof d.autoCategorizationMap === 'object') ? d.autoCategorizationMap : {},
        savingsGoals: Array.isArray(d.savingsGoals) ? d.savingsGoals : [],
        subscriptions: Array.isArray(d.subscriptions) ? d.subscriptions : [],
        schedules: Array.isArray(d.schedules) ? d.schedules : [],
        autoApplyRecurring: !!d.autoApplyRecurring,
        autoPostSchedules: d.autoPostSchedules !== false,
        recurringApplied: (d.recurringApplied && typeof d.recurringApplied === 'object' && !Array.isArray(d.recurringApplied)) ? d.recurringApplied : {},
        investGoal: cleanInvestGoal(d.investGoal)
    };
}
function blankAcctData() {
    const ds = {};
    allYears.forEach((yr, yi) => rawMonthNames.forEach((m, i) => {
        ds[m + yr] = {
            title: m.charAt(0).toUpperCase() + m.slice(1) + ' ' + yr,
            data: [{ date: `01/${String(i + 1).padStart(2, '0')}/${yr}`, desc: (i === 0 && yi === 0) ? 'Starting Balance' : 'Previous Period Balance', cost: '', creditCat: 'Starting Balance', type: '', credit: 0, debit: 0, method: 'Previous Balance', paid: 'YES' }]
        };
    }));
    const d = cleanAcctData({});
    d.datasets = ds;
    return d;
}

function activeAccount() { return accounts.find(a => a.id === activeAccountId) || null; }
function activeAccountName() { const a = activeAccount(); return a ? a.name : ''; }
function activeAcctType() { const a = activeAccount(); return a && a.type === 'savings' ? 'savings' : 'everyday'; }
const SAVINGS_HIDDEN_VIEWS = ['budgets', 'forecast', 'subscriptions'];

// Savings & Investing accounts: menu order and hidden pages change, and the Dashboard shows savings figures
function applyAccountLook() {
    const sav = activeAcctType() === 'savings';
    document.body.classList.toggle('acct-savings', sav);
    const nav = document.querySelector('#sidebar .nav');
    if (!nav) return;
    const groups = [...nav.querySelectorAll('.nav-group')];
    const planning = groups.find(g => g.querySelector('.nav-sub[data-view="forecast"]'));
    const savingsGrp = groups.find(g => g.querySelector('.nav-sub[data-view="investments"]'));
    const budgetsBtn = nav.querySelector('.nav-item[data-view="budgets"]');
    if (planning) planning.classList.toggle('nav-hidden', sav);
    if (budgetsBtn) budgetsBtn.classList.toggle('nav-hidden', sav);
    if (savingsGrp && planning) {
        if (sav) { const first = nav.querySelector('.nav-item[data-view="dashboard"]'); if (first && first.nextElementSibling !== savingsGrp) nav.insertBefore(savingsGrp, first.nextElementSibling); }
        else if (planning.nextElementSibling !== savingsGrp) nav.insertBefore(savingsGrp, planning.nextElementSibling);
    }
}

// make sure at least one account exists (the first one holds everything that was in the dashboard before accounts)
function ensureAccounts() {
    if (accounts.length && activeAccount()) return;
    if (!accounts.length) { accounts = [{ id: acctNewId(), name: 'Day by Day', type: 'everyday', data: getAcctState() }]; }
    activeAccountId = accounts[0].id;
}
let acctSwapDepth = 0, saveAfterSwap = false;   // > 0 while another account's data is temporarily loaded (withAccount)
function captureActiveAccount() {
    if (acctSwapDepth > 0) return;   // the live data belongs to another account right now: never save it as the active one
    ensureAccounts();
    const a = activeAccount();
    if (a) a.data = getAcctState();
    reconcileTransfers();
}
function applyAccount(id) {
    const a = accounts.find(x => x.id === id) || accounts[0];
    activeAccountId = a.id;
    a.data = cleanAcctData(a.data);
    Object.values(a.data.datasets || {}).forEach(m => ((m && m.data) || []).forEach(t => { if (t) { delete t.xferSkip; delete t.xferNo; } }));   // old "never ask again" marks
    setAcctState(a.data);
    normalizeVault();
    a.data = getAcctState();
}

// reads the saved vault (new format with accounts, or the older single-account format)
function loadAccountsFromVault(p) {
    if (p && Number(p.lastBackup) > vaultLastBackup) { vaultLastBackup = Number(p.lastBackup); if (typeof updateBackupUi === 'function') updateBackupUi(); }
    const good = p && Array.isArray(p.accounts) ? p.accounts.filter(a => a && a.id && a.data && typeof a.data === 'object') : [];
    if (good.length) {
        accounts = good.map(a => ({ id: String(a.id), name: String(a.name || 'Account'), type: a.type === 'savings' ? 'savings' : 'everyday', data: a.data }));
        activeAccountId = accounts.some(a => a.id === p.activeAccountId) ? p.activeAccountId : accounts[0].id;
    } else {
        let legacy;
        if (p && Array.isArray(p.categories)) {
            legacy = {
                categories: p.categories, creditCategories: p.creditCategories || creditCategories,
                datasets: (p.datasets && typeof p.datasets === 'object') ? p.datasets : datasets,
                categoryBudgets: p.categoryBudgets || {}, enableBudgetRollover: p.enableBudgetRollover || false,
                recurringTemplates: p.recurringTemplates || recurringTemplates, autoCategorizationMap: p.autoCategorizationMap || autoCategorizationMap,
                savingsGoals: p.savingsGoals, investGoal: p.investGoal, subscriptions: p.subscriptions, schedules: p.schedules,
                autoApplyRecurring: p.autoApplyRecurring, autoPostSchedules: p.autoPostSchedules !== false, recurringApplied: p.recurringApplied
            };
        } else {
            legacy = { categories, creditCategories, datasets: p, categoryBudgets: {}, enableBudgetRollover: false, recurringTemplates, autoCategorizationMap };
        }
        accounts = [{ id: acctNewId(), name: 'Day by Day', type: 'everyday', data: legacy }];
        activeAccountId = accounts[0].id;
    }
    applyAccount(activeAccountId);
}

// run something against another account without leaving the current one
function withAccount(id, fn) {
    if (id === activeAccountId) return fn();
    captureActiveAccount();
    const home = activeAccount();
    const other = accounts.find(a => a.id === id);
    if (!other) return null;
    other.data = cleanAcctData(other.data);
    setAcctState(other.data);
    normalizeVault();
    acctSwapDepth++;
    try { return fn(); }
    finally {
        other.data = getAcctState(); setAcctState(home.data);
        acctSwapDepth--;
        if (acctSwapDepth === 0 && saveAfterSwap) { saveAfterSwap = false; saveToSupabase(); }   // a save asked for mid-swap happens now, with the right data
    }
}

function updateAccountUi() {
    const sel = document.getElementById('account-dropdown');
    if (!sel) return;
    ensureAccounts();
    sel.innerHTML = accounts.map(a => `<option value="${esc(a.id)}">${a.type === 'savings' ? '💰' : '🏦'} ${esc(a.name)}</option>`).join('') +
        '<option value="__all">📊 All accounts overview</option><option value="__new">➕ New account…</option>';
    sel.value = currentView === 'accounts' ? '__all' : activeAccountId;
    applyAccountLook();
}
function onAccountDropdown(v) {
    if (v === '__all') { showView('accounts'); return; }
    if (v === '__new') { addAccount(); updateAccountUi(); return; }
    switchAccount(v);
}

function switchAccount(id) {
    if (!accounts.some(a => a.id === id)) return;
    if (id === activeAccountId) { if (currentView === 'accounts') showView('dashboard'); else updateAccountUi(); return; }
    captureActiveAccount();
    applyAccount(id);
    selectedTx.clear(); ledgerCat = ''; currentFilter = 'all'; subCandidates = []; globalHits = [];
    const s = document.getElementById('search-input'); if (s) s.value = '';
    document.querySelectorAll('.filter-pills .pill').forEach((p, i) => p.classList.toggle('active', i === 0));
    ensureYearDatasetsExist(selectedYear);
    document.getElementById('budget-rollover-toggle').checked = enableBudgetRollover;
    syncRolloverBalances();
    const schedAdded = autoPostSchedulesDue();
    sortTransactions();
    saveToSupabase();
    let go = currentView === 'accounts' ? 'dashboard' : currentView;
    if (activeAcctType() === 'savings') go = 'investments';
    showView(go);
    showToast('Now viewing: ' + activeAccountName() + (schedAdded ? ' · ' + schedAdded + ' scheduled line' + (schedAdded === 1 ? '' : 's') + ' added as Pending' : ''));
}

function addAccount() {
    const name = String(prompt('Name for the new account (for example: Savings, Other bank):') || '').trim();
    if (!name) return;
    if (accounts.some(a => a.name.toLowerCase() === name.toLowerCase())) { showToast('You already have an account called "' + name + '"', true); return; }
    const openStr = prompt('Opening balance of "' + name + '" today in dollars (optional, for example 1500). Leave empty to start at $0:', '');
    const open = parseFloat(String(openStr || '').replace(/[$,\s]/g, '')) || 0;
    const data = blankAcctData();
    if (open > 0) {
        const n = new Date(), key = monthKeyOfDate(n);
        const dd = String(n.getDate()).padStart(2, '0') + '/' + String(n.getMonth() + 1).padStart(2, '0') + '/' + n.getFullYear();
        if (data.datasets[key]) data.datasets[key].data.push({ date: dd, desc: 'Opening balance', cost: '', creditCat: 'Other Credits', type: '', credit: open, debit: 0, method: 'Transfer', paid: 'Yes' });
    }
    captureActiveAccount();
    const isSav = confirm('Is "' + name + '" a Savings & Investing account?\n\nOK = Savings & Investing (opens on the Investments page, the Dashboard shows savings figures, and Budgets/Forecast are tucked away)\nCancel = Everyday account (the normal dashboard)');
    const acct = { id: acctNewId(), name, type: isSav ? 'savings' : 'everyday', data };
    accounts.push(acct);
    switchAccount(acct.id);
}
function renameAccount(id) {
    const a = accounts.find(x => x.id === id); if (!a) return;
    const name = String(prompt('New name for this account:', a.name) || '').trim();
    if (!name || name === a.name) return;
    if (accounts.some(x => x.id !== id && x.name.toLowerCase() === name.toLowerCase())) { showToast('That name is already used', true); return; }
    a.name = name;
    saveToSupabase(); updateAccountUi(); renderApp();
    showToast('Renamed to ' + name);
}
function deleteAccount(id) {
    const a = accounts.find(x => x.id === id); if (!a) return;
    if (accounts.length < 2) { showToast('You need at least one account', true); return; }
    if (!confirm('Delete the account "' + a.name + '" and ALL of its transactions, budgets and goals?\n\nThis cannot be undone. (Tip: download an Encrypted Backup first from the Options menu.)')) return;
    captureActiveAccount();
    const wasActive = id === activeAccountId;
    accounts = accounts.filter(x => x.id !== id);
    if (wasActive) { activeAccountId = ''; switchAccountAfterDelete(); }
    else { saveToSupabase(); updateAccountUi(); renderApp(); }
    showToast('Deleted "' + a.name + '"');
}
function switchAccountAfterDelete() {
    applyAccount(accounts[0].id);
    selectedTx.clear(); ledgerCat = ''; subCandidates = [];
    ensureYearDatasetsExist(selectedYear);
    document.getElementById('budget-rollover-toggle').checked = enableBudgetRollover;
    syncRolloverBalances(); sortTransactions(); saveToSupabase();
    showView(activeAcctType() === 'savings' && SAVINGS_HIDDEN_VIEWS.includes(currentView) ? 'investments' : currentView);
}

/* ---------- TRANSFERS ---------- */
function transferTargets() { return accounts.filter(a => a.id !== activeAccountId); }
/* A "linked transfer": the sending line (in this account) carries  xfer = { to: accountId, id }.
   The receiving line (in the other account) carries  xferFrom = { from: accountId, id }  and is kept in step automatically:
   amount, date, paid/pending and description follow the sending line, and it disappears if the sending line is deleted. */
function newLinkId() { return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function matchAccountFor(desc) {
    const dl = String(desc || '').toLowerCase();
    return accounts.filter(a => a.id !== activeAccountId && a.name.trim().length >= 3 && dl.includes(a.name.trim().toLowerCase()))
        .sort((x, y) => y.name.length - x.name.length)[0] || null;
}
// ONE window inside the page for three cases:
//   ask    - a debit that mentions another account's name: "add it there as well?"
//   manual - the 🔗 button on a line: pick any account
//   unlink - the 🔗 button on a line that is already linked
let pendingLink = null;
// lines you said "No" to during this visit (never saved, so after a reload it can ask again)
const declinedLinks = new WeakSet();
const linkQueue = [];   // several lines marked paid at once are asked one after another
function nextLinkOffer() {
    while (linkQueue.length && !pendingLink) { if (offerTransferLink(linkQueue.shift())) return; }
}
function cancelTransferLink() {
    document.getElementById('link-modal').style.display = 'none';
    pendingLink = null;
    linkQueue.length = 0;
}
function showLinkWindow(title, text, yesLabel, noLabel, pickList, pickDefault) {
    document.getElementById('link-modal-title').textContent = title;
    document.getElementById('link-modal-text').textContent = text;
    document.getElementById('link-modal-yes').textContent = yesLabel;
    document.getElementById('link-modal-no').textContent = noLabel;
    const pick = document.getElementById('link-modal-pick');
    pick.style.display = pickList ? '' : 'none';
    if (pickList) {
        const sel = document.getElementById('link-modal-select');
        sel.innerHTML = pickList.map(a => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('');
        if (pickDefault) sel.value = pickDefault;
    }
    document.getElementById('link-modal').style.display = 'flex';
}
function offerTransferLink(tx) {
    if (!tx || tx.xfer || tx.xferFrom || declinedLinks.has(tx) || isRolloverTx(tx)) return false;
    const amt = parseFloat(tx.debit) || 0;
    if (!(amt > 0)) return false;
    const m = matchAccountFor(tx.desc);
    if (!m) return false;
    if (pendingLink) { if (!linkQueue.includes(tx)) linkQueue.push(tx); return true; }
    pendingLink = { mode: 'ask', tx, m };
    showLinkWindow('Send to another account?', 'This looks like money going to your "' + m.name + '" account. Add ' + fmt(amt) + ' to "' + m.name + '" as well? It will stay in step with this line (paid or pending, amount and date).', 'Yes, also add to ' + m.name, 'No, keep it only here', null);
    return true;
}
// a linked line was switched to Pending: keep the copy in step (Pending there too) or unlink it
function askUnlinkOnPending(tx) {
    if (!tx || !tx.xfer || pendingLink) return false;
    const to = accounts.find(a => a.id === tx.xfer.to);
    pendingLink = { mode: 'unlink', tx };
    showLinkWindow('This line is linked to ' + (to ? to.name : 'another account'), 'It is now Pending, so its copy in "' + (to ? to.name : 'that account') + '" becomes Pending too. Do you want to keep them linked, or unlink and remove the copy from "' + (to ? to.name : 'that account') + '"?', 'Unlink (remove the copy)', 'Keep linked', null);
    return true;
}
// the 🔗 button on a ledger line
function openLinkPicker(index) {
    const tx = datasets[activeMonthKey] && datasets[activeMonthKey].data[index];
    if (!tx || isRolloverTx(tx) || tx.xferFrom) return;
    if (tx.xfer) {
        const to = accounts.find(a => a.id === tx.xfer.to);
        pendingLink = { mode: 'unlink', tx };
        showLinkWindow('Linked to another account', 'This line is linked to "' + (to ? to.name : 'another account') + '". Its copy there follows this line. Unlink it? The copy in "' + (to ? to.name : 'that account') + '" will be removed.', 'Unlink', 'Keep it linked', null);
        return;
    }
    const others = transferTargets();
    if (!others.length) { showToast('Add a second account first (Account menu at the top > New account)', true); return; }
    if (!((parseFloat(tx.debit) || 0) > 0)) { showToast('Only money going out (a debit) can be sent to another account', true); return; }
    const m = matchAccountFor(tx.desc);
    pendingLink = { mode: 'manual', tx };
    showLinkWindow('Also record in another account', 'Choose the account that receives ' + fmt(parseFloat(tx.debit) || 0) + '. It will be added there as money received and stay in step with this line (paid or pending, amount and date).', 'Add to that account', 'Cancel', others, m ? m.id : others[0].id);
}
function answerTransferLink(yes) {
    document.getElementById('link-modal').style.display = 'none';
    const p = pendingLink; pendingLink = null;
    if (!p) return;
    if (p.mode === 'unlink') {
        if (yes) { delete p.tx.xfer; reconcileTransfers(); showToast('Unlinked. Switch it to Paid again to link it.'); }
    } else if (yes) {
        const destId = p.mode === 'manual' ? document.getElementById('link-modal-select').value : p.m.id;
        const dest = accounts.find(a => a.id === destId);
        if (!dest) return;
        p.tx.xfer = { to: dest.id, id: newLinkId() };
        reconcileTransfers();
        showToast('Also recorded in ' + dest.name);
    } else if (p.mode === 'ask') declinedLinks.add(p.tx);
    renderApp();
    saveToSupabase();
    nextLinkOffer();
}
function isMirrorLine(tx) { return !!(tx && tx.xferFrom); }
function blockMirrorEdit(tx) {
    if (!isMirrorLine(tx)) return false;
    const from = accounts.find(a => a.id === tx.xferFrom.from);
    showToast('This line is a copy of a transfer from ' + (from ? from.name : 'another account') + '. Change it there.', true);
    renderApp();
    return true;
}
function ensureYearIn(ds, yr) {
    rawMonthNames.forEach((m, i) => {
        const k = m + yr;
        if (ds[k]) return;
        ds[k] = { title: m.charAt(0).toUpperCase() + m.slice(1) + ' ' + yr, data: [{ date: `01/${String(i + 1).padStart(2, '0')}/${yr}`, desc: i === 0 ? 'Starting Balance' : 'Previous Period Balance', cost: '', creditCat: 'Starting Balance', type: '', credit: 0, debit: 0, method: 'Previous Balance', paid: 'YES' }] };
    });
}
let reconciling = false;
function reconcileTransfers() {
    if (reconciling || acctSwapDepth > 0 || accounts.length < 1) return false;
    reconciling = true;
    let changed = false;
    try {
        const act = activeAccount();
        if (act) act.data = getAcctState();
        const byId = new Map(accounts.map(a => [a.id, a]));
        const eachDs = (a, fn) => { const d = a.data && a.data.datasets; if (d) Object.keys(d).forEach(k => { if (d[k] && Array.isArray(d[k].data)) fn(d[k]); }); };
        const mirrors = new Map();
        const extraMirrors = [];
        accounts.forEach(a => eachDs(a, ds => ds.data.forEach(t => {
            if (!t || !t.xferFrom || !t.xferFrom.id) return;
            if (mirrors.has(t.xferFrom.id)) extraMirrors.push({ ds, t });   // a second copy of the same transfer would double the money
            else mirrors.set(t.xferFrom.id, { ds, t });
        })));
        extraMirrors.forEach(x => { const i = x.ds.data.indexOf(x.t); if (i >= 0) { x.ds.data.splice(i, 1); changed = true; } });
        const seen = new Set();
        accounts.forEach(a => eachDs(a, ds => ds.data.slice().forEach(t => {
            if (!t || !t.xfer || !t.xfer.id) return;
            if (seen.has(t.xfer.id)) { t.xfer = { to: t.xfer.to, id: newLinkId() }; changed = true; }   // a copied line gets its own link
            const id = t.xfer.id;
            seen.add(id);
            const dest = byId.get(t.xfer.to);
            if (!dest || dest.id === a.id) { delete t.xfer; changed = true; return; }
            const d = parseTxDate(t.date);
            if (!d) return;
            const yr = String(d.getFullYear()), key = rawMonthNames[d.getMonth()] + yr;
            if (!dest.data.datasets) dest.data.datasets = {};
            ensureYearIn(dest.data.datasets, yr);
            if (!Array.isArray(dest.data.creditCategories)) dest.data.creditCategories = [];
            if (!dest.data.creditCategories.includes('Transfer')) dest.data.creditCategories.push('Transfer');
            const baseDesc = String(t.desc || '').replace(/^From .+? - /, '');
            const want = { date: t.date, desc: 'From ' + a.name + ' - ' + baseDesc, credit: parseFloat(t.debit) || 0, paid: t.paid };
            const m = mirrors.get(id);
            const target = dest.data.datasets[key];
            if (!m) {
                target.data.push({ date: want.date, desc: want.desc, cost: '', creditCat: 'Transfer', type: '', credit: want.credit, debit: 0, method: 'Transfer', paid: want.paid, xferFrom: { from: a.id, id } });
                target.data.sort((x, y) => parseDateString(x.date) - parseDateString(y.date));
                changed = true;
            } else {
                if (m.ds !== target) {
                    m.ds.data.splice(m.ds.data.indexOf(m.t), 1);
                    target.data.push(m.t);
                    target.data.sort((x, y) => parseDateString(x.date) - parseDateString(y.date));
                    changed = true;
                }
                ['date', 'desc', 'credit', 'paid'].forEach(f => { if (m.t[f] !== want[f]) { m.t[f] = want[f]; changed = true; } });
                if (m.t.debit) { m.t.debit = 0; changed = true; }
                m.t.xferFrom = { from: a.id, id };
            }
        })));
        // receiving lines whose sending line is gone
        mirrors.forEach((m, id) => {
            if (!seen.has(id)) { const i = m.ds.data.indexOf(m.t); if (i >= 0) { m.ds.data.splice(i, 1); changed = true; } }
        });
    } finally { reconciling = false; }
    return changed;
}
// the person deleted the receiving line: stop linking, so it is not re-created
function unlinkTransferSource(linkId) {
    accounts.forEach(a => { const d = a.data && a.data.datasets; if (d) Object.keys(d).forEach(k => ((d[k] && d[k].data) || []).forEach(t => { if (t && t.xfer && t.xfer.id === linkId) { delete t.xfer; declinedLinks.add(t); } })); });
}

/* ---------- ALL ACCOUNTS PAGE ---------- */
function renderAccountsView() {
    const body = document.getElementById('acct-body'), sub = document.getElementById('acct-sub');
    if (!body) return;
    captureActiveAccount();
    const now = new Date(), yr = String(now.getFullYear()), key = monthKeyOfDate(now);
    const rows = accounts.map(a => {
        const r = withAccount(a.id, () => {
            ensureYearDatasetsExist(yr);
            syncRolloverBalances(yr);
            return { bal: cashBalanceFor(key) || 0, proj: calculateProjectedBalanceForMonth(key) };
        }) || { bal: 0, proj: 0 };
        return { a, bal: r.bal, proj: r.proj };
    });
    const total = rows.reduce((s, r) => s + r.bal, 0), totalProj = rows.reduce((s, r) => s + r.proj, 0);
    sub.textContent = accounts.length + (accounts.length === 1 ? ' account' : ' accounts') + ' · balances as at ' + SHORT_MONTHS[now.getMonth()] + ' ' + now.getFullYear();
    const tone = v => v < 0 ? ' text-danger' : '';
    body.innerHTML =
        '<div class="acct-total"><small>Total across all accounts</small><b class="' + tone(total).trim() + '">' + fmt(total) + '</b>' +
        '<span>After pending bills and income: <b class="' + tone(totalProj).trim() + '">' + fmt(totalProj) + '</b></span></div>' +
        '<div class="acct-list">' + rows.map(r =>
            '<div class="acct-row' + (r.a.id === activeAccountId ? ' is-active' : '') + '">' +
            '<div class="acct-name"><b>' + esc(r.a.name) + '</b><span class="acct-type">' + (r.a.type === 'savings' ? 'Savings & Investing' : 'Everyday') + '</span>' + (r.a.id === activeAccountId ? '<em>in use</em>' : '') + '</div>' +
            '<div class="acct-fig"><small>Balance now</small><b class="' + tone(r.bal).trim() + '">' + fmt(r.bal) + '</b></div>' +
            '<div class="acct-fig"><small>After pending</small><b class="' + tone(r.proj).trim() + '">' + fmt(r.proj) + '</b></div>' +
            '<div class="acct-btns"><button type="button" class="btn btn-secondary" onclick="switchAccount(\'' + r.a.id + '\')">Open</button>' +
            '<button type="button" class="btn btn-secondary" onclick="renameAccount(\'' + r.a.id + '\')">Rename</button>' +
            (accounts.length > 1 ? '<button type="button" class="btn btn-secondary" onclick="deleteAccount(\'' + r.a.id + '\')">Delete</button>' : '') +
            '</div></div>').join('') + '</div>' +
        '<div style="margin-top:16px"><button type="button" class="btn btn-primary" onclick="addAccount()">➕ Add account</button></div>' +
        '<p class="acct-note">Each account has its own transactions, categories, budgets and goals. To move money between accounts, add a new transaction and choose the type <b>Transfer to another account</b>. For a line you already have, click the <b>🔗</b> button on that line (money-out lines only).</p>';
}

/* ---------- SAVINGS DASHBOARD (replaces the spending cards on a Savings & Investing account) ---------- */
function renderSavingsDashboard() {
    const box = document.getElementById('ov-savings');
    if (!box) return;
    const key = activeMonthKey;
    const mName = rawMonthNames.find(m => key.startsWith(m));
    if (!mName || !datasets[key]) { box.innerHTML = ''; return; }
    const yr = parseInt(key.slice(mName.length), 10), mIdx = rawMonthNames.indexOf(mName);
    const prevKey = monthKeyOfDate(new Date(yr, mIdx - 1, 1));
    document.getElementById('ov-month').innerText = currentMonthLabel();
    const cash = cashBalanceFor(key) || 0;
    const invested = investedThrough(yr, mIdx);
    const putNow = investMonth(key).putTotal;
    const hasPrev = !!datasets[prevKey];
    const putPrev = hasPrev ? investMonth(prevKey).putTotal : 0;
    const diff = putNow - putPrev, pct = mvPct(putNow, putPrev);
    const tone = mvTone(diff, true);
    const trend = !hasPrev ? '<div class="ov-trend flat">' + OV_ICON.flat + '<span>No month before to compare</span></div>'
        : '<div class="ov-trend ' + tone + '">' + OV_ICON[diff > 0.005 ? 'up' : (diff < -0.005 ? 'down' : 'flat')] + '<span>' +
          (Math.abs(diff) < 0.005 ? 'Same as last month' : (diff > 0 ? '+' : '-') + fmt(Math.abs(diff)) + ' vs last month' + (pct === null ? '' : ' (' + (pct >= 0 ? '+' : '') + pct.toFixed(0) + '%)')) + '</span></div>';
    const card = (title, val, extra, cls) => '<div class="stat-card"><div class="ov-stat-top"><span class="stat-card-title">' + title + '</span></div><div class="stat-card-value ' + (cls || '') + '">' + val + '</div>' + (extra || '') + '</div>';
    let goals = '';
    if (savingsGoals.length) {
        goals = savingsGoals.map(g => {
            const target = Number(g.target) || 0, saved = Number(g.saved) || 0, p = target > 0 ? Math.min(100, saved / target * 100) : 0;
            return '<div class="ov-goal"><div class="ov-goal-top"><span>' + esc(g.name) + '</span><span>' + p.toFixed(0) + '%</span></div><small>' + esc(fmt(saved)) + ' of ' + esc(fmt(target)) + (g.deadline ? ' · by ' + esc(toAUFormat(g.deadline)) : '') + '</small><div class="progress-bar-bg"><div class="progress-bar-fill ' + (p >= 100 ? 'success-fill' : '') + '" style="width:' + p + '%"></div></div></div>';
        }).join('');
    } else goals = '<div class="ov-empty">No savings goals yet. <button type="button" class="ov-link" onclick="showView(\'goals\')">Add one</button></div>';
    let ig = '';
    if (investGoal && investGoal.target > 0) {
        const p = Math.min(100, invested / investGoal.target * 100);
        ig = '<div class="ov-goal"><div class="ov-goal-top"><span>Investment goal</span><span>' + p.toFixed(0) + '%</span></div><small>' + esc(fmt(invested)) + ' of ' + esc(fmt(investGoal.target)) + (investGoal.date ? ' · by ' + esc(toAUFormat(investGoal.date)) : '') + '</small><div class="progress-bar-bg"><div class="progress-bar-fill ' + (p >= 100 ? 'success-fill' : '') + '" style="width:' + p + '%"></div></div></div>';
    }
    box.innerHTML =
        '<div class="ov-stats">' +
        card('Total in this account', fmt(cash), '<div class="ov-trend flat">' + OV_ICON.flat + '<span>What is in the account now (paid lines)</span></div>', cash < 0 ? 'text-danger' : '') +
        card('Put in so far', fmt(invested), '<div class="ov-trend flat">' + OV_ICON.flat + '<span>Money received, up to ' + esc(currentMonthLabel()) + '</span></div>') +
        card('Interest &amp; returns so far', fmt(returnsThrough(yr, mIdx)), '<div class="ov-trend flat">' + OV_ICON.flat + '<span>Interest and investment returns</span></div>', 'text-success') +
        card('Put in this month', fmt(putNow), trend) +
        '</div>' +
        '<div class="sav-grid"><div class="sav-panel"><h3>Savings goals</h3>' + goals + '<button type="button" class="btn btn-secondary" onclick="showView(\'goals\')">Manage goals</button></div>' +
        '<div class="sav-panel"><h3>Investments</h3>' + (ig || '<div class="ov-empty">No investment goal set. You can set one on the Investments page.</div>') +
        '<div class="sav-links"><button type="button" class="btn btn-secondary" onclick="showView(\'investments\')">Open Investments</button><button type="button" class="btn btn-secondary" onclick="showView(\'networth\')">Net Worth</button></div></div></div>';
}


/* ---------- SIDEBAR: balance of every account (click one to open it) ---------- */
let sideAcctTimer = null;
function scheduleSideAccounts() { clearTimeout(sideAcctTimer); sideAcctTimer = setTimeout(renderSideAccounts, 250); }
function renderSideAccounts() {
    const box = document.getElementById('side-accts');
    if (!box) return;
    if (!accounts.length || typeof masterKey === 'undefined' || !masterKey) { box.innerHTML = ''; return; }
    captureActiveAccount();
    const now = new Date(), yr = String(now.getFullYear()), key = monthKeyOfDate(now);
    const rows = accounts.map(a => {
        const bal = withAccount(a.id, () => { ensureYearDatasetsExist(yr); syncRolloverBalances(yr); return cashBalanceFor(key) || 0; }) || 0;
        return { a, bal };
    });
    const cls = v => v < 0 ? ' neg' : '';
    const group = (title, list) => {
        if (!list.length) return '';
        const sub = list.reduce((s, r) => s + r.bal, 0);
        return '<div class="sa-group"><div class="sa-head"><span>' + title + '</span><b class="' + cls(sub).trim() + '">' + fmt(sub) + '</b></div>' +
            list.map(r => '<button type="button" class="sa-row' + (r.a.id === activeAccountId && currentView !== 'accounts' ? ' is-active' : '') + '" onclick="switchAccount(\'' + r.a.id + '\')" title="Open ' + esc(r.a.name) + '"><span>' + esc(r.a.name) + '</span><b class="' + cls(r.bal).trim() + '">' + fmt(r.bal) + '</b></button>').join('') + '</div>';
    };
    const total = rows.reduce((s, r) => s + r.bal, 0);
    box.innerHTML =
        '<button type="button" class="sa-total' + (currentView === 'accounts' ? ' is-active' : '') + '" onclick="showView(\'accounts\')" title="Open the All Accounts page"><span>All accounts</span><b class="' + cls(total).trim() + '">' + fmt(total) + '</b></button>' +
        group('Everyday', rows.filter(r => r.a.type !== 'savings')) +
        group('Savings &amp; Investing', rows.filter(r => r.a.type === 'savings')) +
        '<button type="button" class="sa-add" onclick="closeSidebar(); addAccount(); updateAccountUi();">+ Add account</button>';
}
