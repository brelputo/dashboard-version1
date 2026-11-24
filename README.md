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
