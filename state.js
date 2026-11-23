/* STATE: settings, default data and the values the whole app shares. Loaded first.
   Part of the Financial Movement Dashboard. Plain script (not a module): functions here are shared with the other js files. */

    /* ------------------------------------------------------------------
       DATABASE SAFETY NOTE (checked 23 Nov 2026)
       The key below is a "publishable" key. It is meant to be visible in the page, so seeing it here is normal and not a leak.
       What keeps your data safe is the lock inside Supabase, and it was checked and is CORRECT:
         - Table: user_finances, with Row Level Security (RLS) switched ON.
         - One rule called "own row only", for logged-in users, covering everything (ALL):
             using: auth.uid() = user_id   and   check: auth.uid() = user_id
           so you can only read or change your own row, and nobody else can.
         - Column user_id has the default auth.uid(), so new rows get your ID automatically.
       Your financial data is also encrypted in the browser with your vault passphrase before it is saved.
       If you ever create a new table or a new Supabase project, set up the same lock again before using it.
       Re-check: Supabase > SQL Editor > run  select rowsecurity from pg_tables where tablename = 'user_finances';  (it must say true).
       ------------------------------------------------------------------ */
    const SUPABASE_URL = "https://utozececqvxippnerfrl.supabase.co";
    const SUPABASE_KEY = "sb_publishable_fAgjUuJkZ4LPA7LLucfe3g_UAfpW88K";
    let supabaseClient = null;
    let masterKey = '';

    let categories = [
        "Lunch", "Subaru", "Toll", "Internet", "Coffee", "Butcher Shop", "Car", 
        "Credit Card", "Barber Shop", "Investment", "Spotify", "Rent", 
        "Fuel - Subaru", "Phone Plan", "Entertainment", "Miscellaneous", 
        "Sweets", "Electronics", "Parking", "Fast Food", "Corolla", 
        "Motorcycle", "Lottery Shop", "Electricity", "Gustavo", 
        "Pizzeria", "Health", "Supermarket", "Bank Fee", "Clothing", 
        "Gift", "Online Shop", "Wages"
    ];

    let creditCategories = [
        "Wages", "Starting Balance", "Other Credits", "Refund", "Transfer", "Investment Return"
    ];

    let categoryBudgets = {}; 
    let enableBudgetRollover = false;
    let recurringTemplates = [
        { desc: "Rent", category: "Rent", amount: 1200 },
        { desc: "Vodafone", category: "Phone Plan", amount: 53 },
        { desc: "Internet", category: "Internet", amount: 79 }
    ];
    let autoCategorizationMap = {
        "aldi": "Supermarket",
        "coles": "Supermarket",
        "woolworths": "Supermarket",
        "tasman": "Butcher Shop",
        "vodafone": "Phone Plan",
        "spotify": "Spotify",
        "netflix": "Entertainment"
    };

    let activeCreationType = 'expense';

    const rawMonthNames = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
    const allYears = ["2025", "2026", "2027", "2028", "2029", "2030"];
    let selectedYear = "2026";
    let selectedMonthName = "september"; 
    let activeMonthKey = "september2026";
    let lastMonthName = "september";
    let savingsGoals = [];
    let subscriptions = [];
    let forecastDays = 30;
    let subCandidates = [];
    let currentFilter = 'all';
    let ledgerCat = ''; // exact expense category chosen by clicking a row in Cost Breakdown ('' = show all)
    let budgetSort = 'risk';

    function createDefaultDatasetForYear(yr) {
        let res = {};
        rawMonthNames.forEach((m, idx) => {
            let fullMonthTitle = m.charAt(0).toUpperCase() + m.slice(1) + " " + yr;
            let mKey = m + yr;
            let dayStr = "01";
            let monthNumStr = String(idx + 1).padStart(2, '0');
            
            if (mKey === "september2026") {
                res[mKey] = {
                    title: "September 2026",
                    data: [
                        { date: "30/08/2026", desc: "Previous Period Balance", cost: "", creditCat: "Starting Balance", type: "", credit: 2113.98, debit: 0, method: "Previous Balance", paid: "YES" },
                        { date: "17/09/2026", desc: "Aldi", cost: "Supermarket", creditCat: "", type: "Variable", credit: 0, debit: 39.58, method: "Debit", paid: "Yes" },
                        { date: "17/09/2026", desc: "Tasman", cost: "Butcher Shop", creditCat: "", type: "Variable", credit: 0, debit: 5.62, method: "Debit", paid: "Yes" },
                        { date: "18/09/2026", desc: "Vodafone", cost: "Phone Plan", creditCat: "", type: "Fixed", credit: 0, debit: 53.00, method: "Debit", paid: "NO" },
                        { date: "20/09/2026", desc: "Pay Will for RWC", cost: "Car", creditCat: "", type: "Variable", credit: 0, debit: 450.00, method: "Transfer", paid: "NO" },
                        { date: "20/09/2026", desc: "Fuel - Corolla", cost: "Corolla", creditCat: "", type: "Fixed", credit: 0, debit: 50.00, method: "Debit", paid: "Yes" },
                        { date: "20/09/2026", desc: "Oil for Corolla", cost: "Car", creditCat: "", type: "Variable", credit: 0, debit: 49.99, method: "Debit", paid: "NO" },
                        { date: "23/09/2026", desc: "Wages", cost: "", creditCat: "Wages", type: "Fixed", credit: 2247.23, debit: 0, method: "ComBank", paid: "NO" }
                    ]
                };
            } else {
                res[mKey] = {
                    title: fullMonthTitle,
                    data: [{ date: `${dayStr}/${monthNumStr}/${yr}`, desc: idx === 0 ? "Starting Balance" : "Previous Period Balance", cost: "", creditCat: "Starting Balance", type: "", credit: 1000.00, debit: 0, method: "Previous Balance", paid: "YES" }]
                };
            }
        });
        return res;
    }

    let datasets = createDefaultDatasetForYear("2026");

    const moneyFmt = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });
    const VAULT_PREFIX = 'v2:';
    const PBKDF2_ITERATIONS = 310000;
    let vaultKey = null;
    let vaultSalt = null;

    const hasSubtle = () => !!(window.crypto && crypto.subtle);

    const IDLE_MS = 10 * 60 * 1000;
    let idleTimer = null;
    // ==========================================
    // ACCOUNT: sign-in client, password reset, Security dialog
    // ==========================================
    let authClient = null;
    let activeAcctEmail = '';

    let changingPass = false;
    const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const fmtCompact = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', notation: 'compact', maximumFractionDigits: 1 });

    const SUB_CYCLES = {
        weekly:      { label: 'Weekly',      perYear: 52, tol: 3 },
        fortnightly: { label: 'Fortnightly', perYear: 26, tol: 6 },
        monthly:     { label: 'Monthly',     perYear: 12, tol: 12 },
        quarterly:   { label: 'Quarterly',   perYear: 4,  tol: 20 },
        yearly:      { label: 'Yearly',      perYear: 1,  tol: 30 }
    };

    let currentView = 'dashboard';
    const VIEWS = {
        dashboard:     { pane: 'dashboard-view',     month: true },
        transactions:  { pane: 'transactions-view',  month: true },
        budgets:       { pane: 'budgets-view',       month: true },
        trend:         { pane: 'monthly-trend-view', month: true },
        annual:        { pane: 'annual-view',        month: false },
        goals:         { pane: 'goals-view',         month: false },
        subscriptions: { pane: 'subs-view',          month: false },
        investments:   { pane: 'invest-view',        month: true },
        multiyear:     { pane: 'multi-year-view',    month: false, year: false },
        forecast:      { pane: 'forecast-view',      month: false, year: false }
    };

    let editingBudgetCat = null;
    let txmCatTouched = false;
    const OV_PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#64748b'];
    const OV_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const OV_SVG = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
    const OV_ICON = {
        up: OV_SVG('<path d="m22 7-8.5 8.5-5-5L2 17"></path><path d="M16 7h6v6"></path>'),
        down: OV_SVG('<path d="m22 17-8.5-8.5-5 5L2 7"></path><path d="M16 17h6v-6"></path>'),
        flat: OV_SVG('<path d="M5 12h14"></path>'),
        in: OV_SVG('<path d="M12 5v14"></path><path d="m19 12-7 7-7-7"></path>'),
        out: OV_SVG('<path d="M12 19V5"></path><path d="m5 12 7-7 7 7"></path>')
    };

    let autoApplyRecurring = false;
    let recurringApplied = {};
    let globalHits = [];

    let dueWindowDays = 5;
    let dueItems = [];
    const selectedTx = new Set();
    let visibleSel = [];
    let lastSelIdx = null;

    let toastTimer = null;
    let quietSaveTimer = null;
    let unlocking = false;

    let saveTimer = null;
    let saving = false;
    let lastSyncedCipher = null;

    let mvMode = 'same';
    const mvSum = (arr, upTo) => { let t = 0; for (let d = 1; d <= Math.min(upTo, arr.length - 1); d++) t += arr[d]; return t; };
    let mvChartState = null, mvLastWidth = 0;
