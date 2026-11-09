import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export const loginKey = 'card-login';
export const syncKey = 'card-sync';
export const otpKey = 'card-otp';

export const cardCompanies = {
  max: { label: 'מקס', digits: false },
  visaCal: { label: 'כאל', digits: false },
  isracard: { label: 'ישראכרט', digits: true },
  amex: { label: 'אמקס', digits: true },
};

export function cardSyncToken(secret) {
  return createHmac('sha256', secret).update('card-sync').digest('base64url');
}

export function sameToken(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function keyFrom(secret, salt) {
  return scryptSync(secret, salt, 32);
}

export function encryptCard(payload, secret) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(secret, salt), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  return {
    salt: salt.toString('base64url'),
    iv: iv.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
    data: data.toString('base64url'),
  };
}

export function decryptCard(blob, secret) {
  const salt = Buffer.from(blob.salt, 'base64url');
  const iv = Buffer.from(blob.iv, 'base64url');
  const decipher = createDecipheriv('aes-256-gcm', keyFrom(secret, salt), iv);
  decipher.setAuthTag(Buffer.from(blob.tag, 'base64url'));
  const json = Buffer.concat([decipher.update(Buffer.from(blob.data, 'base64url')), decipher.final()]).toString('utf8');
  return JSON.parse(json);
}

export function safeCardError(code) {
  if (code === 'INVALID_PASSWORD') return 'הסיסמה לא התקבלה. צריך לשמור אותה מחדש.';
  if (code === 'CHANGE_PASSWORD') return 'האתר של הכרטיס מבקש להחליף סיסמה.';
  if (code === 'TIMEOUT') return 'המשיכה לקחה יותר מדי זמן. אפשר לנסות שוב.';
  if (code === 'TWO_FACTOR') return 'נשלח קוד לטלפון. צריך לשלוח לבוט רק את הספרות.';
  if (code === 'MISSING') return 'עדיין אין סיסמה שמורה. שומרים אותה פעם אחת בהגדרות האתר, לא בטלגרם.';
  return 'המשיכה לא הצליחה. אפשר לנסות שוב.';
}

function isoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function creditDueDate(purchaseDate, settings = {}) {
  const purchase = new Date(`${purchaseDate}T12:00:00`);
  const closingDay = Number(settings.creditClosingDay) || 15;
  const paymentDay = Number(settings.creditPaymentDay) || 15;
  const monthLength = new Date(purchase.getFullYear(), purchase.getMonth() + 1, 0).getDate();
  let close = new Date(purchase.getFullYear(), purchase.getMonth(), Math.min(closingDay, monthLength), 12);
  if (purchase.getDate() > closingDay) {
    const nextLength = new Date(purchase.getFullYear(), purchase.getMonth() + 2, 0).getDate();
    close = new Date(purchase.getFullYear(), purchase.getMonth() + 1, Math.min(closingDay, nextLength), 12);
  }
  const paymentLength = new Date(close.getFullYear(), close.getMonth() + 1, 0).getDate();
  const payment = new Date(close.getFullYear(), close.getMonth(), Math.min(paymentDay, paymentLength), 12);
  if (payment > close) return isoDate(payment);
  const nextLength = new Date(close.getFullYear(), close.getMonth() + 2, 0).getDate();
  return isoDate(new Date(close.getFullYear(), close.getMonth() + 1, Math.min(paymentDay, nextLength), 12));
}

export function cardTransactionsToBudget(rows, { company, settings, existing = [], deletedIds = [] } = {}) {
  const deleted = new Set(deletedIds);
  const have = new Set(existing.map(item => item.id));
  const manual = existing.filter(item => item.type === 'expense' && item.method === 'credit' && !String(item.id).startsWith('card-'));
  const added = [];
  for (const tx of rows || []) {
    const amount = Number(tx.chargedAmount);
    if (!Number.isFinite(amount) || amount === 0) continue;
    const date = String(tx.date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const description = String(tx.description || tx.memo || 'עסקת אשראי').replace(/\s+/g, ' ').trim().slice(0, 80) || 'עסקת אשראי';
    const installment = tx.installments?.number ? `-n${tx.installments.number}` : '';
    const raw = tx.identifier != null && String(tx.identifier).length
      ? `${company}-${tx.identifier}${installment}`
      : createHash('sha256').update(`${company}|${date}|${amount}|${description}`).digest('hex').slice(0, 24);
    const id = `card-${raw}`.slice(0, 100);
    const abs = Math.round(Math.abs(amount) * 100) / 100;
    if (abs < 0.01 || abs > 1_000_000 || deleted.has(id) || have.has(id)) continue;
    if (amount > 0 && manual.some(item => item.date === date && Math.abs(Number(item.amount) - abs) < 0.001)) continue;
    if (amount > 0) {
      added.push({
        id, type: 'expense', name: description, amount: abs, category: 'other', method: 'credit',
        date, budgeted: true, creditDueDate: creditDueDate(date, settings),
      });
    } else {
      added.push({ id, type: 'income', name: `זיכוי ${description}`.slice(0, 100), amount: abs, date, budgeted: true });
    }
    have.add(id);
  }
  return added;
}

export function publicCardStatus(login, sync) {
  return {
    connected: Boolean(login?.secret),
    company: login?.company && cardCompanies[login.company] ? login.company : null,
    running: sync?.status === 'running' && Date.now() - Number(sync.startedAt) < 12 * 60 * 1000,
    needsOtp: Boolean(sync?.needsOtp) && Date.now() - Number(sync.startedAt) < 10 * 60 * 1000,
    lastSync: sync?.lastSync || null,
    lastError: sync?.lastError || '',
    lastAdded: Number(sync?.lastAdded) || 0,
  };
}
