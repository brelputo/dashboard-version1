# Financial Movement Dashboard — audit and test notes

Build: `2026-11-27-financial-audit-2`

## Fixes included

- Initial account opening balances are treated as manual opening capital, not income.
- Existing transaction categories missing from the saved category lists are restored to those lists so they remain selectable.
- Date parsers reject impossible calendar dates rather than silently rolling them into another month.
- Weekly/fortnightly schedule posting checks the actual occurrence date, so an earlier payment in the same month does not suppress later occurrences.
- Schedule matching distinguishes income, expense and transfer schedules.
- Manual and automatic schedule posting avoid adding an occurrence already present in the ledger.
- Scheduled transactions are sorted in their own month.
- Rollover balances refresh when the vault opens, when the selected month changes, and after adding, deleting, moving, resetting or undoing transactions that can affect a cleared balance.
- Automatic schedule posting is on by default; it can be switched off on the Schedules page.

## Run the regression tests

From this folder, with Node.js installed:

```bash
node --check state.js
node --check helpers.js
node --check accounts.js
node --check vault.js
node --check ledger.js
node --check budgets.js
node --check planning.js
node --check views.js
node --check startup.js
node test_finance.js
```

## Scope and limitations

The regression suite covers financial calculations, paid/pending handling, rollover propagation, opening-balance classification, strict date parsing, schedule recurrence and deduplication, schedule direction matching, linked transfer mirrors, and rollover refresh after delete/move/reset/undo.

The supplied JSON backup was also loaded into the dashboard logic and audited in memory. No cloud account was connected, no Supabase data was changed, and the backup file is not included in this ZIP.

A full browser end-to-end test, live Supabase authentication/sync test, and verification against live bank balances have not been performed. Therefore this build has passed the checks listed above, but cannot honestly be described as guaranteed bug-free in every browser or live environment.
