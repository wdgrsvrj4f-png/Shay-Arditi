import { INCOME, KEPT, LOCKED, classifyExpense, money, planWindow } from '/shared/plan.js';
import { FUND_IDS, MOVEABLE_IDS, TARGET_IDS, monthView, proposedClose, balancesFromDeposits, canTransfer, canUseFund, closingAllowed, dayPace, makeEntry } from '/shared/plan-ledger.js';
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
  }catch(error){alertMsg(error.message);}
}
async function saveEdit(mutator) {
  if(busy)return;
  busy=true;alertMsg('שומר לענן…');
  try {
    for(let attempt=0;attempt<4;attempt++){
      const latest=await fetchLatest();
      const next=structuredClone(latest.data);
      const result=mutator(next);
      if(result===false)throw Error('הפעולה אינה אפשרית לפי היתרות הנוכחיות');
      const response=await fetch('/api/budget',{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Budget-Revision':latest.version},body:JSON.stringify(next)});
      if(response.status===409)continue;
      if(!response.ok)throw Error('השמירה נכשלה ('+response.status+'). אין שינוי בנתונים.');
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
  const [year,month]=chosenMonth.split('-').map(Number);
  const view=monthView(snapshot,year,month), funds=balancesFromDeposits(snapshot);
  const pace=dayPace(view.safeFreeLeft,(today()>view.window.start?today():view.window.start),view.window.end);
  const full=view.lockedSum+view.keptSum+view.freeBudget;
  const purchaseDate=today()<view.window.start?view.window.start:today()>view.window.end?view.window.end:today();
  document.querySelector('#month-select').value=chosenMonth;
  document.querySelector('#banner').innerHTML=new Date(today()+'T12:00:00').getDay()===0?'<div class="banner">יום ראשון: כדאי לעשות התאמה שבועית של העסקאות והחיובים.</div>':'';
  document.querySelector('#hero').innerHTML='<div class="kicker">כמה באמת פנוי לי?</div><div class="amount '+(view.safeFreeLeft<0?'bad':'')+'">'+cur(view.safeFreeLeft)+'</div><div class="sub">מתוך '+cur(view.freeBudget)+' חופשי, במסגרת חודשית של '+cur(INCOME)+'. '+(view.closed?'החודש נסגר.':'')+'</div>'+
  '<div class="bar"><i style="width:'+(view.lockedSum/full*100)+'%;background:#8b93a1"></i><i style="width:'+(view.keptSum/full*100)+'%;background:#e4b56a"></i><i style="width:'+(view.freeBudget/full*100)+'%;background:#8dcea8"></i></div>'+
  '<div class="legend"><span>מחויב '+cur(view.lockedSum)+'</span><span>לשמור '+cur(view.keptSum)+'</span><span>חופשי '+cur(view.freeBudget)+'</span></div>'+
  '<div class="stats"><div class="stat"><small>קצב ליום</small><strong>'+cur(pace.daily)+'</strong></div><div class="stat"><small>ל־7 ימים</small><strong>'+cur(pace.weekly)+'</strong></div><div class="stat"><small>רזרבה בפיקדון</small><strong>'+cur(funds.balances.reserve)+'</strong></div></div>'+
  (view.window.partial?'<p class="note">נובמבר הוא חודש מעבר יחסי בלבד. לא סוגרים אותו בהפקדות אוטומטיות.</p>':'')+
  (view.over.length?'<p class="note bad">יש חריגה של '+cur(view.deficits)+' בקטגוריות. הסכום כבר הופחת מהכסף הפנוי הבטוח; העבר תקציב כדי לאזן.</p>':'')+
  '<p class="note">המספר הוא מסגרת תכנון. יש לוודא בנפרד כיסוי לחיובי אשראי, להלוואות ולטסט הקרוב.</p>';
  document.querySelector('#ask').innerHTML='<h2>אפשר להרשות לעצמי?</h2><label for="wish">כמה אני רוצה להוציא?</label><input id="wish" inputmode="decimal" type="number" min="0" value="120"><div id="answer"></div>';
  document.querySelector('#wish').addEventListener('input',evt=>{const cost=Math.max(0,Number(evt.target.value)||0),left=money(view.safeFreeLeft-cost),newPace=dayPace(left,(today()>view.window.start?today():view.window.start),view.window.end);document.querySelector('#answer').innerHTML='<div class="check"><div class="row"><span>יישאר אחרי ההוצאה</span><strong class="'+(left<0?'bad':'')+'">'+cur(left)+'</strong></div><div class="meta">ממוצע חדש ליום: '+cur(newPace.daily)+'. '+(left<0?'חורג מהתקציב.':'הסכום נכנס למסגרת, אם יתר הקטגוריות מכוסות.')+'</div></div>';});
  document.querySelector('#wish').dispatchEvent(new Event('input'));
  document.querySelector('#kept').innerHTML=view.lines.filter(x=>KEPT.some(item=>item.id===x.id)).map(x=>boxLine(x,funds.balances)).join('');
  document.querySelector('#locked').innerHTML=view.lines.filter(x=>LOCKED.some(item=>item.id===x.id)).map(x=>boxLine(x,funds.balances)).join('');
  document.querySelector('#rows').innerHTML=view.rows.length?view.rows.map(item=>'<div class="buy"><div><strong>'+e(item.name)+'</strong><div class="meta">'+e(item.date)+' · '+cur(item.amount)+' · '+e(item.method||'')+(item.fundPaid?' · שולם מקרן':'')+'</div></div><select data-id="'+e(item.id)+'" '+(view.closed?'disabled':'')+'>'+selectOptions(['free',...KEPT.map(x=>x.id),...LOCKED.map(x=>x.id)],item.plan)+'</select></div>').join(''):'<p class="note">עדיין לא נרשמו הוצאות לחודש הזה.</p>';
  document.querySelectorAll('#rows select').forEach(select=>select.addEventListener('change',async()=>{const id=select.dataset.id,plan=select.value;await saveEdit(data=>{const tx=data.transactions.find(x=>x.id===id);if(!tx)return false;tx.plan=plan;});}));
  renderActions(view,funds);renderFunds(view,funds);renderClose(view,funds);renderCashflow();
}
function renderActions(view,funds){
  const hasClosed=view.closed;
  document.querySelector('#actions').innerHTML='<h2>הוצאה חדשה</h2><p class="note">הוצאה נרשמת ביום הקנייה, בלי קשר ליום חיוב הכרטיס. אם האשראי מסתנכרן אוטומטית, אין להזין את אותה קנייה פעמיים.</p>'+
  '<form id="quick-expense"><label>מה קנית?</label><input required name="name" maxlength="100" placeholder="ארוחה, סופר, טיול…"><div class="duo"><div><label>סכום ₪</label><input required name="amount" type="number" min="0.01" step="0.01"></div><div><label>אמצעי תשלום</label><select name="method"><option value="debit">דיירקט</option><option value="cash">מזומן</option><option value="credit">אשראי</option><option value="bank">העברה</option></select></div></div>'+
  '<label>לאיזו קטגוריה?</label><select name="plan">'+selectOptions(['free',...KEPT.map(x=>x.id),...LOCKED.map(x=>x.id)],'free')+'</select>'+
  '<div class="duo"><div><label>יום הקנייה</label><input type="date" name="date" required value="'+purchaseDate+'"></div><div><label>תאריך חיוב אשראי (רק אם משלמים באשראי)</label><input type="date" name="due" value="'+calcCreditDue(purchaseDate,snapshot.settings)+'"></div></div>'+
  '<button class="action" type="submit">רשום הוצאה</button></form><hr><h2>העברה בין קטגוריות</h2><p class="note">העברה תקציבית בלבד. לא מעבירים כסף בבנק.</p>'+
  '<form id="transfer"><div class="duo"><div><label>מאיזו קטגוריה</label><select name="from">'+selectOptions(MOVEABLE_IDS,'free')+'</select></div><div><label>לאיזו קטגוריה</label><select name="to">'+selectOptions(TARGET_IDS,'food')+'</select></div></div><label>כמה ₪</label><input required name="amount" type="number" min="0.01" step="0.01"><button class="action" '+(hasClosed?'disabled':'')+'>העבר בתקציב</button></form>';
  document.querySelector('#quick-expense').addEventListener('submit',async ev=>{
    ev.preventDefault();const data=new FormData(ev.currentTarget),date=String(data.get('date')),amount=Number(data.get('amount')),method=String(data.get('method')),plan=String(data.get('plan'));
    if(!Number.isFinite(amount)||amount<=0||!date){alertMsg('בדוק את פרטי ההוצאה');return;}
    const due=String(data.get('due'));if(method==='credit'&&!due){alertMsg('בחר תאריך חיוב אשראי');return;}
    const id=crypto.randomUUID();
    await saveEdit(state=>{const [yy,mm]=date.slice(0,7).split('-').map(Number);if(monthView(state,yy,mm).closed||state.transactions.some(tx=>tx.id===id))return false;
      const tx={id,type:'expense',name:String(data.get('name')).trim(),amount,date,method,
        category:plan==='food'?'groceries':plan==='charge'?'fuel':plan==='health'?'health':'other',plan,budgeted:true};
      if(method==='credit')tx.creditDueDate=due;
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
  const available=(snapshot.transactions||[]).filter(tx=>tx.type==='expense'&&!snapshot.planEvents.some(ev=>ev.kind==='fundUse'&&ev.expenseId===tx.id)).slice(-80).reverse();
  document.querySelector('#funds').innerHTML='<h2>פיקדונות וקרנות שנצברו</h2><p class="note">מוצגות יתרות שאישרת שהן קיימות בפועל. לא כולל הפקדות מתוכננות שעדיין לא בוצעו.</p>'+titles+
  '<details><summary>יש לי כבר יתרה בפיקדון שעדיין לא הוזנה</summary><form id="opening"><label>פיקדון</label><select name="fund">'+selectOptions(FUND_IDS,'reserve')+'</select><label>יתרה התחלתית מאומתת ₪</label><input name="amount" required type="number" min="0.01" step="0.01"><button class="action" type="submit">קבע יתרת פתיחה</button><p class="note">הכנס רק כסף שקיים בפועל בפיקדון, פעם אחת לכל קרן.</p></form></details>'+
  '<details><summary>שילמתי הוצאה מקרן שכבר נצברה</summary><form id="fund-use"><label>הוצאה שכבר נרשמה</label><select name="expense">'+available.map(tx=>'<option value="'+e(tx.id)+'">'+e(tx.date+' · '+tx.name+' · '+cur(tx.amount))+'</option>').join('')+'</select><label>מאיזה פיקדון?</label><select name="fund">'+selectOptions(FUND_IDS.filter(id=>id!=='reserve'),'vacation')+'</select><button class="action" '+(!available.length?'disabled':'')+'>שייך הוצאה לקרן</button><p class="note">היתרה בקרן תפחת, והקנייה לא תחויב שוב מהתקציב החודשי. אם שילמת באשראי יש לדאוג לכיסוי בעו״ש לפני החיוב.</p></form></details>'+
  '<details><summary>העברתי כסף בין שני פיקדונות</summary><form id="fund-move"><div class="duo"><div><label>מקור</label><select name="from">'+selectOptions(FUND_IDS,'reserve')+'</select></div><div><label>יעד</label><select name="to">'+selectOptions(FUND_IDS,'vacation')+'</select></div></div><label>סכום ₪</label><input name="amount" required type="number" min="0.01" step="0.01"><button class="action">רשום העברה שכבר ביצעתי</button></form></details>';
  document.querySelector('#opening').addEventListener('submit',async ev=>{ev.preventDefault();const f=new FormData(ev.currentTarget),id=String(f.get('fund')),amount=money(f.get('amount'));await saveEdit(state=>{if(!Number.isFinite(amount)||amount<=0||!FUND_IDS.includes(id)||state.planEvents.some(x=>x.kind==='fundOpening'&&x.fundId===id))return false;state.planEvents.push(makeEntry('fundOpening',{date:today(),fundId:id,amount}));});});
  document.querySelector('#fund-use').addEventListener('submit',async ev=>{ev.preventDefault();const f=new FormData(ev.currentTarget),expenseId=String(f.get('expense')),fundId=String(f.get('fund'));await saveEdit(state=>{const tx=state.transactions.find(x=>x.id===expenseId);if(!tx||!canUseFund(state,fundId,Number(tx.amount),expenseId))return false;state.planEvents.push(makeEntry('fundUse',{date:today(),fundId,expenseId,amount:money(tx.amount)}));});});
  document.querySelector('#fund-move').addEventListener('submit',async ev=>{ev.preventDefault();const f=new FormData(ev.currentTarget),from=String(f.get('from')),to=String(f.get('to')),amount=money(f.get('amount'));await saveEdit(state=>{if(!FUND_IDS.includes(from)||!FUND_IDS.includes(to)||from===to||amount<=0||amount>(balancesFromDeposits(state).balances[from]||0))return false;state.planEvents.push(makeEntry('fundMove',{date:today(),from,to,amount}));});});
}
function renderClose(view,funds){
  const preview=proposedClose(snapshot,...chosenMonth.split('-').map(Number));
  const closing=(snapshot.planEvents||[]).find(ev=>ev.kind==='close'&&ev.month===chosenMonth);
  const confirmed=closing&&(snapshot.planEvents||[]).some(ev=>ev.kind==='depositConfirmed'&&ev.closeId===closing.id);
  const rows=Object.entries(closing?closing.allocations:preview.allocations).filter(([,v])=>Number(v)>0);
  document.querySelector('#closing').innerHTML='<h2>סגירת חודש והפקדות לפיקדונות</h2>'+
    (view.window.partial?'<p class="note">נובמבר הוא חודש מעבר. לא מופקות בו הפקדות אוטומטיות כדי לא לסמן כסף ישן כחיסכון חדש.</p>':
    '<p class="note">המערכת מחשבת כמה נשאר בכל קרן אחרי קניות והעברות. היא אינה מעבירה כסף בבנק בעצמה.</p>')+
    rows.map(([id,value])=>'<div class="line row"><span>'+e(byId(id))+'</span><strong>'+cur(value)+'</strong></div>').join('')+
    '<hr><div class="row"><strong>סה״כ להפקדה לפי הרישום</strong><strong>'+cur(rows.reduce((s,x)=>s+Number(x[1]),0))+'</strong></div>'+
    (view.window.partial?'':closing?(confirmed?'<p class="ok-note">ההפקדות סומנו כבוצעו בפועל ✓</p>':
    '<p class="note">החודש נסגר, אבל ההפקדות עדיין לא אומתו. ודא שיש מספיק כסף בעו״ש אחרי חיובים קרובים.</p><button id="confirm-deposit" class="action">ביצעתי את ההפקדות בפיקדונות</button>'):
    '<button id="close-month" class="action" '+(!closingAllowed(snapshot,...chosenMonth.split('-').map(Number),today())?'disabled':'')+'>סגור חודש והכן הפקדות</button>')+
    (!view.closed&&today()<=view.window.end?'<p class="note">סגירה זמינה רק לאחר סוף החודש, ורק אם אין חריגה שלא טופלה.</p>':'');
  document.querySelector('#close-month')?.addEventListener('click',async()=>await saveEdit(state=>{const [y,m]=chosenMonth.split('-').map(Number);if(!closingAllowed(state,y,m,today()))return false;const close=proposedClose(state,y,m);state.planEvents.push(makeEntry('close',{date:today(),month:chosenMonth,allocations:close.allocations}));}));
  document.querySelector('#confirm-deposit')?.addEventListener('click',async()=>{if(!window.confirm('מאשר שהעברת בפועל את כל הסכומים לפיקדונות הנקובים? פעולה זו אינה מעבירה כסף בבנק.'))return;await saveEdit(state=>{const close=state.planEvents.find(x=>x.kind==='close'&&x.month===chosenMonth);if(!close||state.planEvents.some(x=>x.kind==='depositConfirmed'&&x.closeId===close.id))return false;state.planEvents.push(makeEntry('depositConfirmed',{date:today(),closeId:close.id}));});});
}
function renderCashflow(){
  const groups=cardGroups({creditPayments:snapshot.creditPayments||[],transactions:snapshot.transactions||[]}).filter(g=>g.dueDate>=today());
  const bank=Number(snapshot.settings?.openingBankBalance)||0;
  document.querySelector('#control').innerHTML='<h2>בקרת תזרים לפני העברה לפיקדון</h2><p class="note">תקציב אינו יתרת בנק. אל תעביר כסף אם תשלומי האשראי או ההלוואות אינם מכוסים.</p>'+
  (groups.length?groups.slice(0,4).map(g=>'<div class="row line"><span>אשראי צפוי '+e(g.dueDate)+'</span><b>'+cur(g.amount)+'</b></div>').join(''):'<p class="note">אין חיובי אשראי צפויים ברישום. ודא שלא חסרים נתונים.</p>')+
  '<p class="note">יתרת הפתיחה השמורה בתזרים: '+cur(bank)+'. היא אינה בהכרח יתרת העו״ש העדכנית. האפליקציה לא מבצעת העברות בנקאיות.</p><a class="backlink" href="/">פתח את מסך התזרים</a>';
}
document.querySelector('#month-select').addEventListener('change',ev=>{if(/^\d{4}-\d{2}$/.test(ev.target.value)){chosenMonth=ev.target.value;if(snapshot)render();}});
login.addEventListener('submit',async ev=>{ev.preventDefault();try{const r=await fetch('/api/session',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:new FormData(login).get('key')})});document.querySelector('#login-error').textContent=r.ok?'':'קוד הכניסה לא מתאים';if(r.ok)await load();}catch{document.querySelector('#login-error').textContent='לא ניתן להתחבר';}});
load();
