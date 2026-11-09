import { INCOME, KEPT, LOCKED, classifyExpense, money, planWindow } from '/shared/plan.js';
import { FUND_IDS, MOVEABLE_IDS, TARGET_IDS, monthView, proposedClose, balancesFromDeposits, fundingStatus, canTransfer, canUseFund, closingAllowed, dayPace, makeEntry } from '/shared/plan-ledger.js';
import { cardGroups } from '/shared/budget.js';

const e = value => String(value ?? '').replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const cur = value => new Intl.NumberFormat('he-IL',{style:'currency',currency:'ILS',minimumFractionDigits:0,maximumFractionDigits:2}).format(Number(value) || 0);
const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jerusalem',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
let chosenMonth = today().slice(0,7);
let snapshot = null;
let revision = '';
let busy = false;
const login = document.querySelector('#login');
const app = document.querySelector('#app');
const planItems = [...LOCKED,...KEPT];
const allNames = Object.fromEntries([['free','כסף חופשי'],['reserve','רזרבה כללית'],...planItems.map(x=>[x.id,x.name])]);
const byId = id => allNames[id] || id;
const selectOptions = (items, current) => items.map(id=>'<option value="'+e(id)+'"'+(id===current?' selected':'')+'>'+e(byId(id))+'</option>').join('');
const alertMsg = text => { const node=document.querySelector('#status');node.textContent=text||'';node.hidden=!text; };
function calcCreditDue(date, settings) {
  const d=new Date(date+'T12:00:00');
  const closing=Math.max(1,Math.min(28,Number(settings?.creditClosingDay)||15));
  const paying=Math.max(1,Math.min(28,Number(settings?.creditPaymentDay)||2));
  const closeMonth=d.getDate()>closing?d.getMonth()+1:d.getMonth();
  const closingDate=new Date(d.getFullYear(),closeMonth,closing,12);
  const payment=new Date(closingDate.getFullYear(),closingDate.getMonth(),paying,12);
  if(payment<=closingDate) payment.setMonth(payment.getMonth()+1);
  return [payment.getFullYear(),String(payment.getMonth()+1).padStart(2,'0'),String(payment.getDate()).padStart(2,'0')].join('-');
}
async function fetchLatest() {
  const r=await fetch('/api/budget',{credentials:'same-origin',cache:'no-store'});
  if(r.status===401){login.hidden=false;app.hidden=true;throw Error('יש להתחבר מחדש');}
  if(!r.ok)throw Error('לא ניתן לקרוא את הנתונים');
  const data=await r.json();
  if(data?.version!==2||!Array.isArray(data.transactions))throw Error('יש לפתוח תחילה את מסך התזרים ולהגדיר את התקציב.');
  const version=r.headers.get('x-budget-revision')||r.headers.get('etag')||data._rev;
  if(!version)throw Error('גרסת השרת אינה זמינה');
  delete data._rev;
  data.planEvents=Array.isArray(data.planEvents)?data.planEvents:[];
  return {data,version};
}
async function load() {
  try {
    const latest=await fetchLatest();snapshot=latest.data;revision=latest.version;
    login.hidden=true;app.hidden=false;alertMsg('');render();
  }catch(error){alertMsg(error.message);if(!snapshot){app.hidden=true;login.hidden=false;document.querySelector('#login-error').textContent=error.message;}}
}
async function saveEdit(mutator) {
  if(busy){alertMsg('השמירה הקודמת עדיין מתבצעת…');return;}
  busy=true;alertMsg('שומר לענן…');
  try {
    for(let attempt=0;attempt<4;attempt++){
      const latest=await fetchLatest();
      const next=structuredClone(latest.data);
      const result=mutator(next);
      if(result===false)throw Error('הפעולה אינה אפשרית לפי היתרות הנוכחיות');
      const response=await fetch('/api/budget',{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Budget-Revision':latest.version},body:JSON.stringify(next)});
      if(response.status===409)continue;
      if(!response.ok)throw Error('השמירה לא אושרה ('+response.status+'). בדוק את הנתונים ורענן לפני ניסיון נוסף.');
      const saved=await response.json();
      revision=response.headers.get('x-budget-revision')||response.headers.get('etag')||saved._rev||'';
      delete saved._rev;
      snapshot=saved;render();alertMsg('נשמר בהצלחה ✓');
      return;
    }
    throw Error('היו שינויים ממכשיר אחר. רענן ובדוק שוב לפני ביצוע הפעולה.');
  }catch(error){alertMsg(error.message);}
  finally{busy=false;}
}
function boxLine(item, balances) {
  const percent=item.budget>0?Math.max(0,Math.min(100,item.used/item.budget*100)):0;
  const extra=item.sink?'<div class="meta">בפיקדון מאושר: '+cur(balances[item.id]||0)+'</div>':'';
  return '<div class="line"><div class="row"><span class="name">'+e(item.name)+'</span><b class="'+(item.left<0?'bad':'')+'">'+cur(item.left)+'</b></div><div class="meta">נוצלו '+cur(item.used)+' מתוך '+cur(item.budget)+'</div><div class="tiny"><i class="'+(item.left<0?'over':'')+'" style="width:'+percent+'%"></i></div>'+extra+'</div>';
}
function render(){
  const opened=new Set([...document.querySelectorAll('#app details[open]')].map(node=>node.id||node.querySelector('form')?.id).filter(Boolean));
  const [year,month]=chosenMonth.split('-').map(Number);
  const view=monthView(snapshot,year,month), funds=balancesFromDeposits(snapshot);
  const pace=dayPace(view.safeFreeLeft,(today()>view.window.start?today():view.window.start),view.window.end);
  const full=view.lockedSum+view.keptSum+view.freeBudget;
  document.querySelector('#month-select').value=chosenMonth;
  document.querySelector('#banner').innerHTML=new Date(today()+'T12:00:00').getDay()===0?'<div class="banner">יום ראשון: כדאי לעשות התאמה שבועית של העסקאות והחיובים.</div>':'';
  document.querySelector('#hero').innerHTML='<div class="kicker">כמה באמת פנוי לי?</div><div class="amount '+(view.safeFreeLeft<0?'bad':'')+'">'+cur(view.safeFreeLeft)+'</div><div class="sub">מתוך '+cur(view.freeBudget)+' חופשי, במסגרת חודשית של '+cur(INCOME)+'. '+(view.closed?'החודש נסגר.':'')+'</div>'+
  '<div class="bar"><i style="width:'+(view.lockedSum/full*100)+'%;background:#8b93a1"></i><i style="width:'+(view.keptSum/full*100)+'%;background:#e4b56a"></i><i style="width:'+(view.freeBudget/full*100)+'%;background:#8dcea8"></i></div>'+
  '<div class="legend"><span>מחויב '+cur(view.lockedSum)+'</span><span>לשמור '+cur(view.keptSum)+'</span><span>חופשי '+cur(view.freeBudget)+'</span></div>'+
  '<div class="stats"><div class="stat"><small>קצב ליום</small><strong>'+cur(pace.daily)+'</strong></div><div class="stat"><small>ל־7 ימים</small><strong>'+cur(pace.weekly)+'</strong></div><div class="stat"><small>רזרבה בפיקדון</small><strong>'+cur(funds.balances.reserve)+'</strong></div></div>'+
  (!view.funding.found?'<p class="note">הכנסה שמממנת את החודש עדיין לא אומתה. יש לבדוק בתזרים.</p>':'')+
  (view.over.length?'<p class="note bad">יש חריגה של '+cur(view.deficits)+' בקטגוריות. הסכום כבר הופחת מהכסף הפנוי הבטוח; העבר תקציב כדי לאזן.</p>':'')+
  '<p class="note">המספר הוא מסגרת תכנון. יש לוודא בנפרד כיסוי לחיובי אשראי, להלוואות ולטסט הקרוב.</p>';
  document.querySelector('#kept').innerHTML=view.lines.filter(x=>KEPT.some(item=>item.id===x.id)).map(x=>boxLine(x,funds.balances)).join('');
  document.querySelector('#locked').innerHTML=view.lines.filter(x=>LOCKED.some(item=>item.id===x.id)).map(x=>boxLine(x,funds.balances)).join('');
  document.querySelector('#rows').innerHTML=view.rows.length?view.rows.map(item=>'<div class="buy"><div><strong>'+e(item.name)+'</strong><div class="meta">'+e(item.date)+' · '+cur(item.amount)+' · '+e(item.method||'')+(item.fundPaid?' · שולם מקרן':'')+'</div></div><select data-id="'+e(item.id)+'" '+(view.closed?'disabled':'')+'>'+selectOptions(['free',...KEPT.map(x=>x.id),...LOCKED.map(x=>x.id)],item.plan)+'</select></div>').join(''):'<p class="note">עדיין לא נרשמו הוצאות לחודש הזה.</p>';
  document.querySelectorAll('#rows select').forEach(select=>select.addEventListener('change',async()=>{const id=select.dataset.id,plan=select.value;await saveEdit(data=>{const tx=data.transactions.find(x=>x.id===id);if(!tx||monthView(data,...tx.date.slice(0,7).split('-').map(Number)).closed)return false;tx.plan=plan;});}));
  renderActions(view,funds);renderFunds(view,funds);renderClose(view,funds);renderCashflow();
  document.querySelectorAll('#app details').forEach(node=>{if(opened.has(node.id||node.querySelector('form')?.id))node.open=true;});
  document.querySelectorAll('#app form').forEach(form=>{form.querySelectorAll('input,select').forEach((field,index)=>{if(!field.id)field.id=form.id+'-field-'+index;const label=field.previousElementSibling;if(label?.tagName==='LABEL')label.htmlFor=field.id;});});
  document.querySelectorAll('#rows select').forEach(field=>field.setAttribute('aria-label','קטגוריה להוצאה'));
}
function renderActions(view,funds){
  const purchaseDate=today()<view.window.start?view.window.start:today()>view.window.end?view.window.end:today();
  const hasClosed=view.closed;
  document.querySelector('#actions').innerHTML='<h2>הוצאה חדשה</h2><p class="note">הוצאה נרשמת ביום הקנייה, בלי קשר ליום חיוב הכרטיס. אם האשראי מסתנכרן אוטומטית, אין להזין את אותה קנייה פעמיים.</p>'+
  '<form id="quick-expense"><label>מה קנית?</label><input required name="name" maxlength="100" placeholder="ארוחה, סופר, טיול…"><div class="duo"><div><label>סכום ₪</label><input required name="amount" type="number" min="0.01" step="0.01"></div><div><label>אמצעי תשלום</label><select name="method"><option value="debit">דיירקט</option><option value="cash">מזומן</option><option value="credit">אשראי</option><option value="bank">העברה</option></select></div></div>'+
  '<label>לאיזו קטגוריה?</label><select name="plan">'+selectOptions(['free',...KEPT.map(x=>x.id),...LOCKED.map(x=>x.id)],'free')+'</select>'+
  '<div class="duo"><div><label>יום הקנייה</label><input type="date" name="date" required value="'+purchaseDate+'"></div><div><label>תאריך חיוב אשראי (רק אם משלמים באשראי)</label><input type="date" name="due" value="'+calcCreditDue(purchaseDate,snapshot.settings)+'"></div></div>'+
  '<button class="action" type="submit">רשום הוצאה</button></form><hr><h2>העברה בין קטגוריות</h2><p class="note">העברה תקציבית בלבד. לא מעבירים כסף בבנק.</p>'+
  '<form id="transfer"><div class="duo"><div><label>מאיזו קטגוריה</label><select name="from">'+selectOptions(MOVEABLE_IDS,'free')+'</select></div><div><label>לאיזו קטגוריה</label><select name="to">'+selectOptions(TARGET_IDS,'food')+'</select></div></div><label>כמה ₪</label><input required name="amount" type="number" min="0.01" step="0.01"><button class="action" '+(hasClosed?'disabled':'')+'>העבר בתקציב</button></form>';
  document.querySelector('#quick-expense [name="date"]').addEventListener('change',ev=>{if(!ev.target.value)return;const due=document.querySelector('#quick-expense [name="due"]');due.value=calcCreditDue(ev.target.value,snapshot.settings);});
  document.querySelector('#quick-expense').addEventListener('submit',async ev=>{
    ev.preventDefault();const data=new FormData(ev.currentTarget),date=String(data.get('date')),amount=Number(data.get('amount')),method=String(data.get('method')),plan=String(data.get('plan'));
    if(!Number.isFinite(amount)||amount<=0||!date||!String(data.get('name')).trim()){alertMsg('בדוק את פרטי ההוצאה');return;}
    const due=String(data.get('due'));if(method==='credit'&&!due){alertMsg('בחר תאריך חיוב אשראי');return;}
    const id=ev.currentTarget.dataset.expenseId||crypto.randomUUID();ev.currentTarget.dataset.expenseId=id;
    await saveEdit(state=>{const [yy,mm]=date.slice(0,7).split('-').map(Number);if(monthView(state,yy,mm).closed)return false;
      const tx={id,type:'expense',name:String(data.get('name')).trim(),amount,date,method,
        category:plan==='food'?'groceries':plan==='charge'?'fuel':plan==='health'?'health':'other',plan,budgeted:true};
      if(method==='credit')tx.creditDueDate=due;
      const existing=state.transactions.find(item=>item.id===id);
      if(existing)return ['name','amount','date','method','plan','creditDueDate'].every(key=>existing[key]===tx[key]);
      state.transactions.push(tx);
    });
  });
  document.querySelector('#transfer').addEventListener('submit',async ev=>{
    ev.preventDefault();const form=new FormData(ev.currentTarget),from=String(form.get('from')),to=String(form.get('to')),amount=money(form.get('amount'));
    await saveEdit(state=>{const date=view.window.start;if(!canTransfer(state,date,from,to,amount))return false;
      state.planEvents.push(makeEntry('transfer',{date,from,to,amount}));
    });
  });
}
function renderFunds(view,funds){
  const titles=FUND_IDS.map(id=>'<div class="line"><div class="row"><span>'+e(byId(id))+'</span><strong>'+cur(funds.balances[id]||0)+'</strong></div>'+(funds.awaitingDeposit[id]?'<div class="meta">ממתין לאישור הפקדה: '+cur(funds.awaitingDeposit[id])+'</div>':'')+'</div>').join('');
  const reversed=new Set((snapshot.planEvents||[]).filter(ev=>ev.kind==='fundUseReversal').map(ev=>ev.fundUseId));
  const uses=(snapshot.planEvents||[]).filter(ev=>ev.kind==='fundUse'&&!reversed.has(ev.id));
  const available=(snapshot.transactions||[]).filter(tx=>tx.type==='expense'&&!uses.some(ev=>ev.expenseId===tx.id)).slice(-80).reverse();
  document.querySelector('#funds').innerHTML='<h2>פיקדונות וקרנות שנצברו</h2><p class="note">מוצגות יתרות שאישרת שהן קיימות בפועל. לא כולל הפקדות מתוכננות שעדיין לא בוצעו.</p>'+titles+
  '<details><summary>יש לי כבר יתרה בפיקדון שעדיין לא הוזנה</summary><form id="opening"><label>פיקדון</label><select name="fund">'+selectOptions(FUND_IDS,'reserve')+'</select><label>יתרה התחלתית מאומתת ₪</label><input name="amount" required type="number" min="0.01" step="0.01"><button class="action" type="submit">קבע יתרת פתיחה</button><p class="note">הכנס רק כסף שקיים בפועל בפיקדון, פעם אחת לכל קרן.</p></form></details>'+
  '<details><summary>שילמתי הוצאה מקרן שכבר נצברה</summary><form id="fund-use"><label>הוצאה שכבר נרשמה</label><select name="expense">'+available.map(tx=>'<option value="'+e(tx.id)+'">'+e(tx.date+' · '+tx.name+' · '+cur(tx.amount))+'</option>').join('')+'</select><label>מאיזה פיקדון?</label><select name="fund">'+selectOptions(FUND_IDS.filter(id=>id!=='reserve'),'vacation')+'</select><button class="action" '+(!available.length?'disabled':'')+'>שייך הוצאה לקרן</button><p class="note">היתרה בקרן תפחת, והקנייה לא תחויב שוב מהתקציב החודשי. אם שילמת באשראי יש לדאוג לכיסוי בעו״ש לפני החיוב.</p></form></details>'+
  '<details><summary>לתקן שיוך שגוי לקרן</summary><p class="note">הביטול יגדיל מחדש את יתרת הקרן ויחייב מחדש את קטגוריית ההוצאה. אם כבר העברת כסף בבנק, תקן גם שם.</p>'+uses.map(ev=>{const tx=(snapshot.transactions||[]).find(x=>x.id===ev.expenseId);return '<div class="line row"><span>'+e((tx?.name||'עסקה')+' · '+cur(ev.amount))+'</span><button class="minor-action" data-reverse-use="'+e(ev.id)+'">בטל שיוך</button></div>';}).join('')+'</details>'+'<details><summary>העברתי כסף בין שני פיקדונות</summary><form id="fund-move"><div class="duo"><div><label>מקור</label><select name="from">'+selectOptions(FUND_IDS,'reserve')+'</select></div><div><label>יעד</label><select name="to">'+selectOptions(FUND_IDS,'vacation')+'</select></div></div><label>סכום ₪</label><input name="amount" required type="number" min="0.01" step="0.01"><button class="action">רשום העברה שכבר ביצעתי</button></form></details>';
  document.querySelectorAll('[data-reverse-use]').forEach(button=>button.addEventListener('click',async()=>{
    const id=button.dataset.reverseUse;
    if(!window.confirm('לבטל את מימון העסקה מהקרן? יש לוודא שתיקנת גם כל העברה בנקאית שכבר ביצעת.'))return;
    await saveEdit(state=>{const use=state.planEvents.find(x=>x.id===id&&x.kind==='fundUse');if(!use||state.planEvents.some(x=>x.kind==='fundUseReversal'&&x.fundUseId===id))return false;
      const tx=state.transactions.find(x=>x.id===use.expenseId);if(!tx)return false;const [y,m]=tx.date.slice(0,7).split('-').map(Number);if(monthView(state,y,m).closed)return false;
      state.planEvents.push(makeEntry('fundUseReversal',{date:today(),fundUseId:id}));
    });
  }));
  document.querySelector('#opening').addEventListener('submit',async ev=>{ev.preventDefault();const f=new FormData(ev.currentTarget),id=String(f.get('fund')),amount=money(f.get('amount'));await saveEdit(state=>{if(!Number.isFinite(amount)||amount<=0||!FUND_IDS.includes(id)||state.planEvents.some(x=>x.kind==='fundOpening'&&x.fundId===id))return false;state.planEvents.push(makeEntry('fundOpening',{date:today(),fundId:id,amount}));});});
  document.querySelector('#fund-use').addEventListener('submit',async ev=>{ev.preventDefault();const f=new FormData(ev.currentTarget),expenseId=String(f.get('expense')),fundId=String(f.get('fund'));await saveEdit(state=>{const tx=state.transactions.find(x=>x.id===expenseId);if(!tx||!canUseFund(state,fundId,Number(tx.amount),expenseId))return false;state.planEvents.push(makeEntry('fundUse',{date:today(),fundId,expenseId,amount:money(tx.amount)}));});});
  document.querySelector('#fund-move').addEventListener('submit',async ev=>{ev.preventDefault();const f=new FormData(ev.currentTarget),from=String(f.get('from')),to=String(f.get('to')),amount=money(f.get('amount'));await saveEdit(state=>{if(!FUND_IDS.includes(from)||!FUND_IDS.includes(to)||from===to||!Number.isFinite(amount)||amount<=0||amount>(balancesFromDeposits(state).balances[from]||0))return false;state.planEvents.push(makeEntry('fundMove',{date:today(),from,to,amount}));});});
}
function renderClose(view,funds){
  const preview=proposedClose(snapshot,...chosenMonth.split('-').map(Number));
  const closing=(snapshot.planEvents||[]).find(ev=>ev.kind==='close'&&ev.month===chosenMonth);
  const confirmed=closing&&(snapshot.planEvents||[]).some(ev=>ev.kind==='depositConfirmed'&&ev.closeId===closing.id);
  const rows=Object.entries(closing?closing.allocations:preview.allocations).filter(([,v])=>Number(v)>0);
  document.querySelector('#closing').innerHTML='<h2>סגירת חודש והפקדות לפיקדונות</h2>'+
    '<p class="note">המערכת מחשבת כמה נשאר בכל קרן אחרי קניות והעברות. היא אינה מעבירה כסף בבנק בעצמה.</p>'+
    rows.map(([id,value])=>'<div class="line row"><span>'+e(byId(id))+'</span><strong>'+cur(value)+'</strong></div>').join('')+
    '<hr><div class="row"><strong>סה״כ להפקדה לפי הרישום</strong><strong>'+cur(rows.reduce((s,x)=>s+Number(x[1]),0))+'</strong></div>'+
    (closing?(confirmed?'<p class="ok-note">ההפקדות סומנו כבוצעו בפועל ✓</p>':
    '<p class="note">החודש נסגר, אבל ההפקדות עדיין לא אומתו. ודא שיש מספיק כסף בעו״ש אחרי חיובים קרובים.</p><button id="confirm-deposit" class="action">ביצעתי את ההפקדות בפיקדונות</button>'):
    '<button id="close-month" class="action" '+(!closingAllowed(snapshot,...chosenMonth.split('-').map(Number),today())?'disabled':'')+'>סגור חודש והכן הפקדות</button>')+
    (!view.closed&&today()<=view.window.end?'<p class="note">סגירה זמינה רק לאחר סוף החודש, ורק אם אין חריגה שלא טופלה.</p>':'');
  document.querySelector('#close-month')?.addEventListener('click',async()=>await saveEdit(state=>{const [y,m]=chosenMonth.split('-').map(Number);if(!closingAllowed(state,y,m,today()))return false;const close=proposedClose(state,y,m);state.planEvents.push(makeEntry('close',{date:today(),month:chosenMonth,allocations:close.allocations}));}));
  document.querySelector('#confirm-deposit')?.addEventListener('click',async()=>{if(!window.confirm('מאשר שהעברת בפועל את כל הסכומים לפיקדונות הנקובים? פעולה זו אינה מעבירה כסף בבנק.'))return;await saveEdit(state=>{const close=state.planEvents.find(x=>x.kind==='close'&&x.month===chosenMonth);if(!close||state.planEvents.some(x=>x.kind==='depositConfirmed'&&x.closeId===close.id))return false;state.planEvents.push(makeEntry('depositConfirmed',{date:today(),closeId:close.id}));});});
}
function renderCashflow(){
  const groups=cardGroups({creditPayments:snapshot.creditPayments||[],transactions:snapshot.transactions||[]}).filter(g=>g.dueDate>=today());
  const bank=Number(snapshot.settings?.openingBankBalance)||0;
  const [year,month]=chosenMonth.split('-').map(Number);
  const funding=fundingStatus(snapshot,year,month);
  const funds=balancesFromDeposits(snapshot);
  const fundingLine=!funding.found
    ? '<p class="note bad">לא נמצאה ברישום משכורת של '+e(funding.salaryMonth)+'. התקציב הוא עדיין יעד תכנון ולא מימון מאומת. יש לרשום משכורת במסך התזרים.</p>'
    : '<div class="line row"><span>משכורת שמממנת את החודש ('+e(funding.salaryMonth)+')</span><strong>'+cur(funding.received)+'</strong></div>'+
      (funding.uncovered>0?'<div class="line"><p class="note bad">חסר '+cur(funding.uncovered)+' למימון המסגרת. הפער כבר הופחת מהסכום הפנוי הבטוח.</p><button class="action" id="top-up" '+(funds.balances.reserve<funding.uncovered?'disabled':'')+'>השלמתי '+cur(funding.uncovered)+' מהרזרבה לעו״ש</button></div>':'')+
      (funding.excessToDeposit>0?'<div class="line"><p class="note">משכורת גבוהה מהמתוכנן. עודף להפקדה לרזרבה: '+cur(funding.excessToDeposit)+'</p><button class="action" id="deposit-excess">הפקדתי את עודף המשכורת לרזרבה</button></div>':'')+
      (funding.uncovered===0&&funding.excessToDeposit===0?'<p class="ok-note">מימון המשכורת תואם את הכלל שקבענו ✓</p>':'');
  document.querySelector('#control').innerHTML='<h2>המשכורת ובקרת תזרים</h2><p class="note">תקציב אינו יתרת בנק. את דצמבר מממנת משכורת נובמבר, וכן הלאה. אל תעביר כסף אם חיובים קרובים אינם מכוסים.</p>'+
  fundingLine+'<hr><h2>אשראי שעדיין עומד לרדת</h2>'+
  (groups.length?groups.slice(0,4).map(g=>'<div class="row line"><span>חיוב '+e(g.dueDate)+'</span><b>'+cur(g.amount)+'</b></div>').join(''):'<p class="note">אין חיובי אשראי צפויים ברישום. ודא שלא חסרים נתונים.</p>')+
  '<p class="note">יתרת פתיחה בתזרים: '+cur(bank)+'. היא אינה בהכרח יתרת העו״ש העדכנית. האתר לא מבצע העברות בנקאיות.</p><a class="backlink" href="/">פתח את התזרים / רשום משכורת</a>';
  document.querySelector('#top-up')?.addEventListener('click',async()=>{
    const amount=funding.uncovered;
    if(!window.confirm('רק אחרי שהעברת בפועל '+cur(amount)+' מפיקדון הרזרבה לעו״ש, אשר כאן. מאשר שבוצע?'))return;
    await saveEdit(state=>{const v=fundingStatus(state,year,month),reserve=balancesFromDeposits(state).balances.reserve;
      if(v.uncovered!==amount||reserve<amount)return false;
      state.planEvents.push(makeEntry('reserveTopUp',{date:today(),budgetMonth:chosenMonth,amount}));
    });
  });
  document.querySelector('#deposit-excess')?.addEventListener('click',async()=>{
    const amount=funding.excessToDeposit;
    if(!window.confirm('רק אחרי שהעברת בפועל '+cur(amount)+' לעודף הרזרבה בפיקדון, אשר כאן. מאשר שבוצע?'))return;
    await saveEdit(state=>{const v=fundingStatus(state,year,month);if(v.excessToDeposit!==amount)return false;
      state.planEvents.push(makeEntry('salaryExcess',{date:today(),budgetMonth:chosenMonth,amount}));
    });
  });
}
document.querySelector('#month-select').addEventListener('change',ev=>{if(/^\d{4}-(0[1-9]|1[0-2])$/.test(ev.target.value)){chosenMonth=ev.target.value;if(snapshot)render();}});
login.addEventListener('submit',async ev=>{ev.preventDefault();try{const r=await fetch('/api/session',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:new FormData(login).get('key')})});document.querySelector('#login-error').textContent=r.ok?'':'קוד הכניסה לא מתאים';if(r.ok)await load();}catch{document.querySelector('#login-error').textContent='לא ניתן להתחבר';}});
load();


window.addEventListener('focus',()=>{if(!busy&&snapshot&&!document.querySelector('#app input:focus,#app select:focus'))void load();});
