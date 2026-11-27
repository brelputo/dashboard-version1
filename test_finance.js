const fs=require('fs'), vm=require('vm'), assert=require('assert');
const ctx={console, Intl, Date, Math, Number, String, Object, Array, Set, Map, JSON, parseFloat, parseInt, isNaN, isFinite, RegExp, Promise, Uint8Array, TextEncoder, TextDecoder, crypto:require('crypto').webcrypto, window:{__build:{}}, localStorage:{getItem(){return null},setItem(){}}, saveToSupabase(){}, setInterval(){}, activeAcctType(){return 'everyday'}, document:{getElementById(){return null},addEventListener(){}}};
vm.createContext(ctx);
for (const f of ['state.js','helpers.js','ledger.js','planning.js','vault.js','budgets.js','accounts.js']) vm.runInContext(fs.readFileSync(require('path').join(__dirname,f),'utf8'),ctx,{filename:f});
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
// Opening balances created for new accounts are capital, not reportable income.
run("datasets.november2026.data=[{date:'24/11/2026',desc:'Opening balance',credit:19387.58,debit:0,method:'Transfer',paid:'Yes'}]; normalizeVault()");
assert.equal(run("isRolloverTx(datasets.november2026.data[0])"),true);
assert.equal(run("datasets.november2026.data[0].manual"),true);
assert.equal(run("getMonthFinancials('november2026').paidIncome"),0);
assert.equal(run("getMonthFinancials('november2026').opening"),19387.58);
assert.equal(run("cleanAcctData({}).autoPostSchedules"),true);
assert.equal(run("cleanAcctData({autoPostSchedules:false}).autoPostSchedules"),false);   // switching it off is remembered
run("datasets.october2026.data.push({date:'04/10/2026',desc:'One-off income',credit:450,debit:0,creditCat:'Extra Job',paid:'YES'}); normalizeVault()");
assert.equal(run("creditCategories.includes('Extra Job')"),true);
// Calendar parsers reject impossible dates instead of rolling them into another month.
assert.equal(run("parseTxDate('31/02/2026')"),null);
assert.equal(run("parseIso('2026-02-31')"),null);
// A prior weekly occurrence in the same month must not suppress the next occurrence.
run("startOfToday=()=>new Date(2026,10,27); accounts=[{id:'main',name:'Main',type:'everyday',data:getAcctState()}]; activeAccountId='main'; activeMonthKey='november2026'; autoPostSchedules=true; schedules=[{id:'weekly-gym',name:'Gym',amount:50,kind:'out',cycle:'weekly',nextDate:'2026-11-20',anchor:20,category:'Gym',active:true}]; datasets.november2026.data=[{date:'20/11/2026',desc:'Gym',cost:'Gym',credit:0,debit:50,paid:'NO'}]");
assert.equal(run("autoPostSchedulesDue()"),1);
assert.equal(run("datasets.november2026.data.filter(t=>t.desc==='Gym').length"),2);
assert.equal(run("datasets.november2026.data.some(t=>t.desc==='Gym' && t.date==='27/11/2026' && t.paid==='NO')"),true);
// Same-named income and expense schedules are distinct.
run("schedules=[{id:'income-pay',name:'Pay',kind:'in',amount:100,cycle:'monthly',nextDate:'2026-12-01',active:true}]");
assert.equal(run("findScheduleForTx({desc:'Pay',credit:0,debit:100})"),null);
// Scheduled transfers create exactly one pending mirror in the destination account.
run("datasets.november2026.data=[]; accounts=[{id:'main',name:'Main',type:'everyday',data:getAcctState()},{id:'savings',name:'Savings',type:'savings',data:cleanAcctData({})}]; activeAccountId='main'; activeMonthKey='november2026'; schedules=[{id:'transfer-once',name:'Move savings',amount:100,kind:'transfer',cycle:'once',nextDate:'2026-11-27',toAccount:'savings',active:true}]");
assert.equal(run("autoPostSchedulesDue()"),1);
assert.equal(run("datasets.november2026.data.filter(t=>t.xfer && t.xfer.to==='savings').length"),1);
assert.equal(run("accounts.find(a=>a.id==='savings').data.datasets.november2026.data.filter(t=>t.xferFrom).length"),1);
// Deleting or moving a cleared transaction must immediately refresh later month openings; Undo restores them.
run("accounts=[{id:'main',name:'Main',type:'everyday',data:getAcctState()}]; activeAccountId='main'; activeMonthKey='november2026'; selectedYear='2026'; renderApp=()=>{}; window._toastOpts=null; showToast=(m,e,o)=>{window._toastOpts=o}; datasets.november2026.data=[{date:'01/11/2026',desc:'Previous Period Balance',credit:1000,debit:0,method:'Previous Balance',paid:'YES',manual:true},{date:'10/11/2026',desc:'Paid expense',credit:0,debit:100,paid:'YES'}]; datasets.december2026.data=[{date:'01/12/2026',desc:'Previous Period Balance',credit:900,debit:0,method:'Previous Balance',paid:'YES'}]; deleteTx(1)");
assert.equal(run("getMonthFinancials('december2026').opening"),1000);
run("window._toastOpts.fn()");
assert.equal(run("getMonthFinancials('december2026').opening"),900);
run("transferToNextMonth(1)");
assert.equal(run("getMonthFinancials('december2026').opening"),1000);
assert.equal(run("getMonthFinancials('december2026').pendingExpense"),100);
run("window._toastOpts.fn()");
assert.equal(run("getMonthFinancials('december2026').opening"),900);
run("datasets.october2026.data=[{date:'01/10/2026',desc:'Previous Period Balance',credit:700,debit:0,method:'Previous Balance',paid:'YES',manual:true}]; datasets.november2026.data=[{date:'01/11/2026',desc:'Previous Period Balance',credit:1000,debit:0,method:'Previous Balance',paid:'YES',manual:true},{date:'10/11/2026',desc:'Paid expense',credit:0,debit:100,paid:'YES'}]; datasets.december2026.data=[{date:'01/12/2026',desc:'Previous Period Balance',credit:900,debit:0,method:'Previous Balance',paid:'YES'}]; selectedMonthName='november'; confirm=()=>true; resetMonthData()");
assert.equal(run("getMonthFinancials('november2026').opening"),700);
assert.equal(run("getMonthFinancials('december2026').opening"),700);
run("window._toastOpts.fn()");
assert.equal(run("getMonthFinancials('december2026').opening"),900);
// Rollover must use cleared balance; unpaid earlier bills are carried separately.
run("Object.keys(datasets).filter(k=>k.endsWith('2026') && k!=='november2026' && k!=='december2026').forEach(k=>datasets[k].data.forEach(t=>{if(!isRolloverTx(t))t.paid='YES'})); datasets.november2026.data=[{date:'01/11/2026',desc:'Previous Period Balance',credit:1976.66,debit:0,method:'Previous Balance',paid:'YES',manual:true},{date:'10/11/2026',desc:'Income',credit:4494.40,debit:0,paid:'YES'},{date:'11/11/2026',desc:'Paid expenses',credit:0,debit:3791.99,paid:'YES'},{date:'20/11/2026',desc:'Unpaid expense',credit:0,debit:1051.99,paid:'NO'}]; datasets.december2026.data=[{date:'01/12/2026',desc:'Previous Period Balance',credit:1627.08,debit:0,method:'Previous Balance',paid:'YES'},{date:'06/12/2026',desc:'Future bills',credit:0,debit:1769.76,paid:'NO'}]; syncRolloverBalances('2026')");
assert.equal(run("getMonthFinancials('december2026').opening"),2679.07);
assert.equal(run("getMonthFinancials('december2026').carriedPending"),-1051.99);
assert.equal(run("getMonthFinancials('december2026').projectedBalance"),-142.68);
run("syncRolloverBalances('2027')");
assert.equal(run("getMonthFinancials('january2027').opening"),2679.07);
console.log('PASS: financials; paid/pending; rollovers; opening-balance classification; strict dates; weekly schedules; schedule direction; linked transfer mirrors');
