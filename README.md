# Financial Movement Dashboard

Open `index.html` (or the GitHub Pages address) to use it. All files live in the same folder, no sub-folders.

| File | What is inside |
|---|---|
| `index.html` | The page itself: login screen, buttons, windows and layout. |
| `style.css` | All the colours, glass effects and spacing. |
| `state.js` | Settings and default data shared by the whole app. |
| `helpers.js` | Small tools: dollar format, dates, pop-up messages, theme and glass switch, `$` typing in the ledger. |
| `vault.js` | Sign-in, encryption, cloud saving (Supabase), lock/unlock, backups and import. |
| `ledger.js` | Transactions page, New Transaction window (with Paid switch), recurring bills, due-soon alerts. |
| `budgets.js` | Budgets, categories and budget alerts. |
| `planning.js` | Savings goals, subscriptions and the cash-flow forecast. |
| `views.js` | Navigation, Dashboard overview, Annual, Multi-Year and Month vs Last Month pages. |
| `startup.js` | Things that run once when the page opens. |

Do not reorder the `<script>` lines at the bottom of `index.html`.
After uploading a new version, press Ctrl + Shift + R (Cmd + Shift + R on Mac) once.
