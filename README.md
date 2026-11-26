# Financial Movement Dashboard

Open `index.html` (or the GitHub Pages address) to use it. All files live in the same folder, no sub-folders.

| File | What is inside |
|---|---|
| `index.html` | The page itself: login screen, buttons, windows and layout. |
| `style.css` | All the colours, glass effects and spacing. |
| `state.js` | Settings and default data shared by the whole app. |
| `helpers.js` | Small tools: dollar format, dates, pop-up messages, theme and glass switch, `$` typing in the ledger. |
| `accounts.js` | Several accounts: the switcher at the top, adding/renaming/deleting accounts, transfers between them and the All Accounts page. |
| `vault.js` | Sign-in, encryption, cloud saving (Supabase), lock/unlock, backups and import. |
| `ledger.js` | Transactions page, New Transaction window (with Paid switch), recurring bills, due-soon alerts. |
| `budgets.js` | Budgets, categories and budget alerts. |
| `planning.js` | Savings goals, subscriptions, the cash-flow forecast, the Investments page (with its goal), the Interest page and the Net Worth page. |
| `views.js` | Navigation, Dashboard overview, Annual, Year in Review, Multi-Year and Month vs Last Month pages, and the printed report. |
| `startup.js` | Things that run once when the page opens. |

Do not reorder the `<script>` lines at the bottom of `index.html`.
After uploading a new version, press Ctrl + Shift + R (Cmd + Shift + R on Mac) once.


## Optional: keep the two outside libraries in this folder
The dashboard uses two free libraries (Supabase and CryptoJS). By default it loads them from the internet. If you also put these two files next to index.html, it uses them from your own folder instead, so it keeps working even if the internet host is down:

| File to save | Where to get it (open the link, then press Ctrl + S) |
| --- | --- |
| `supabase.js` | https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.2 |
| `crypto-js.min.js` | https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js |

The sidebar shows "libraries: from this folder" when both are being used. If a file is missing or broken, the page quietly uses the internet copy instead.


## Financial accuracy update — 26 November 2026

This build centralises month-level cash calculations in `getMonthFinancials()` and applies these rules consistently:

- Opening balances are carried separately from income. The September 2026 opening balance of $2,113.98 is retained as a manual starting point.
- Newly created months and years start at $0 rather than an artificial $1,000.
- Automatic monthly rollovers use the previous month's cleared (paid) closing balance. Pending transactions affect the projected balance, not the cleared opening balance of the next month.
- A manually edited opening balance is preserved; clearing its amount returns it to automatic rollover. A compatibility migration marks the original September 2026 seeded opening row as manual when older cloud data is loaded, so the $2,113.98 seed is not overwritten.
- Money totals are accumulated in integer cents to avoid floating-point rounding drift.
- Missing or inconsistent Paid values are handled safely; only an explicit `YES` is treated as paid.
- Net Worth cash uses the same cleared-balance calculation as the ledger. Investment cost basis includes paid contributions only; the Investments page continues to show paid and planned activity separately.
- Budget rollover carryover accounts for committed expenses (paid and pending), consistent with budget usage displays.

The update does not connect to or modify the live Supabase database. Back up the encrypted data before deploying, then check the September 2026 opening balance and the October/November rollover figures after sign-in.

- Linked transfers remain in account balances and cash-flow projections, but are excluded from income, spending, budget and performance reporting so moving money between your own accounts is not treated as earning or spending.


### Calculation conventions

- **Cleared/current balance:** opening balance plus paid credits less paid debits. Linked transfers are included because they change this account's balance.
- **Projected balance:** cleared balance plus pending credits less pending debits.
- **Income and spending performance:** includes entered (paid and pending) non-transfer transactions; linked transfers are excluded to avoid counting movement between your own accounts as income or spending.
- **Investment page:** displays entered activity (including pending) so planned deposits/returns remain visible. Net Worth's investment cost-basis figure uses paid contributions only. Current market values, asset valuations, and liabilities are not available unless entered separately; Net Worth is therefore not a complete balance sheet.
- **Interest rate:** an estimate from paid interest credits and recorded paid daily movements, beginning with the first month containing interest.

Regression checks run for the seeded September balance, paid/pending separation, monthly and cross-year rollover, manual opening-balance preservation, zero defaults, cent rounding, missing Paid values, linked-transfer reporting treatment, paid vs pending investment amounts, and interest recognition. JavaScript syntax and ZIP integrity checks also passed. Live browser, Supabase, and full end-to-end UI tests still need to be performed in the user's environment.
