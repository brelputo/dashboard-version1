const fs=require('fs'), vm=require('vm'), assert=require('assert');
const ctx={console, Intl, Date, Math, Number, String, Object, Array, Set, Map, JSON, parseFloat, parseInt, isNaN, isFinite, RegExp, Promise, Uint8Array, TextEncoder, TextDecoder, crypto:require('crypto').webcrypto, window:{__build:{}}, localStorage:{getItem(){return null},setItem(){}}, saveToSupabase(){}, setInterval(){}, activeAcctType(){return 'everyday'}, document:{getElementById(){return null},addEventListener(){}}};
vm.createContext(ctx);
for (const f of ['state.js','helpers.js','ledger.js','planning.js','vault.js','budgets.js']) vm.runInContext(fs.readFileSync(require('path').join(__dirname,f),'utf8'),ctx,{filename:f});
const run=(s)=>vm.runInContext(s,ctx);
run('saveToSupabase = function(){};');
assert.equal(run("getMonthFinancials('september2026').opening"),2113.98);
assert.equal(run("getMonthFinancials('september2026').paidExpense"),95.20);
assert.equal(run("getMonthFinancials('september2026').currentBalance"),2018.78);
assert.equal(run("getMonthFinancials('september2026').pendingExpense"),552.99);
assert.equal(run("getMonthFinancials('september2026').pendingIncome"),2247.23);
assert.equal(run("getMonthFinancials('september2026').projectedBalance"),3713.02);
run("syncRolloverBalances('2026')");
assert.equal(run("getMonthFinancials('october2026').opening"),2018.78);
assert.equal(run("getMonthFinancials('november2026').opening"),2018.78);
run("syncRolloverBalances('2027')");
assert.equal(run("getMonthFinancials('january2027').opening"),2018.78);
run("datasets.october2026.data.find(isRolloverTx).credit=1234.56; datasets.october2026.data.find(isRolloverTx).manual=true; syncRolloverBalances('2026')");
assert.equal(run("getMonthFinancials('october2026').opening"),1234.56);
// Robust status and cent arithmetic
assert.equal(run("txIsPaid({paid:'yes'})"),true);
assert.equal(run("txIsPaid({})"),false);
assert.equal(run("moneyCents(0.1)+moneyCents(0.2)"),30);
// pending transaction changes projected but not cleared balance
run("datasets.october2026.data.push({date:'05/10/2026',desc:'test',credit:0,debit:0.1,paid:'NO'})");
assert.equal(run("getMonthFinancials('october2026').currentBalance"),1234.56);
assert.equal(run("getMonthFinancials('october2026').carriedPending"),1694.24);
assert.equal(run("getMonthFinancials('october2026').projectedBalance"),2928.7); // 1234.56 - 0.10 + 1694.24 carried from September
assert.equal(run("getMonthFinancials('september2026').carriedPending"),0);
run("datasets.october2026.data.push({date:'10/10/2026',desc:'Transfer to savings',credit:0,debit:100,paid:'YES',xfer:{id:'test-link'}})");
assert.equal(run("getMonthFinancials('october2026').paidExpense"),100); // no new paid expense besides opening transfer test
assert.equal(run("getMonthFinancials('october2026').reportExpense"),0.1);
assert.equal(run("getMonthFinancials('october2026').currentBalance"),1134.56);
assert.equal(run("isReportableTx({debit:100,xfer:{id:'x'}})"),false);
assert.equal(run("datasets.january2026.data[0].credit"),0);
assert.equal(run("getMonthFinancials('january2026').opening"),0);
run("delete datasets.september2026.data.find(isRolloverTx).manual; normalizeVault()");
assert.equal(run("datasets.september2026.data.find(isRolloverTx).manual"),true);
run("datasets.january2026.data=[{date:'01/01/2026',desc:'Starting Balance',credit:1000,debit:0,paid:'YES',method:'Previous Balance',manual:true},{date:'02/01/2026',desc:'Investment deposit',cost:'Investment',credit:0,debit:100,paid:'YES'},{date:'03/01/2026',desc:'Investment pending',cost:'Investment',credit:0,debit:50,paid:'NO'},{date:'04/01/2026',desc:'Investment return',creditCat:'Investment Return',credit:10,debit:0,paid:'YES'},{date:'05/01/2026',desc:'Pending return',creditCat:'Investment Return',credit:20,debit:0,paid:'NO'},{date:'06/01/2026',desc:'Interest',creditCat:'Interest',credit:4,debit:0,paid:'YES'},{date:'07/01/2026',desc:'Paid expense',debit:100,credit:0,paid:'YES'}]");
assert.equal(run("investMonth('january2026').putTotal"),150);
assert.equal(run("investMonth('january2026').paidPutTotal"),100);
assert.equal(run("investMonth('january2026').retTotal"),30);
assert.equal(run("investMonth('january2026').paidRetTotal"),10);
assert.equal(run("investedThrough(2026,0)"),100);
assert.equal(run("returnsThrough(2026,0)"),10);
assert.equal(run("interestMonth('january2026').interest"),4);
// paying the old September lines removes them from the carry and lifts the cleared opening, total stays consistent
run("datasets.september2026.data.forEach(t=>{ if(!isRolloverTx(t)) t.paid='YES'; }); datasets.october2026.data.find(isRolloverTx).manual=false; syncRolloverBalances('2026')");
assert.equal(run("getMonthFinancials('october2026').carriedPending"),-30); // only the unpaid January test lines (-50 +20) remain
assert.equal(run("getMonthFinancials('october2026').opening"),3713.02);
// an empty year in the middle must not drop the balance
run("syncRolloverBalances('2027'); syncRolloverBalances('2028')");
assert.equal(run("getMonthFinancials('january2028').opening"),run("getMonthFinancials('december2027').currentBalance"));
assert.ok(run("getMonthFinancials('january2028').opening")>0);
// linked transfer in a budgeted category counts toward that budget, others do not
run("categoryBudgets={Investment:600}; categories=['Investment','Food']; activeMonthKey='october2026'");
assert.equal(run("isBudgetSpendTx({cost:'Investment',debit:500,xfer:{id:'a'}}, 'october2026')"),true);
assert.equal(run("isBudgetSpendTx({cost:'Food',debit:50,xfer:{id:'a'}}, 'october2026')"),false);
assert.equal(run("isBudgetSpendTx({cost:'Food',debit:50}, 'october2026')"),true);
assert.equal(run("isBudgetSpendTx({desc:'Previous Period Balance',cost:'Investment',debit:5}, 'october2026')"),false);
// moneyCents tolerates typed formats
assert.equal(run("moneyCents('1,200.50')"),120050);
assert.equal(run("moneyCents('$15')"),1500);
assert.equal(run("moneyCents('abc')"),0);
console.log('PASS: seeded opening balance; paid vs pending; projected balance; rollover; zero-start; cents; missing paid status');
