import { cardCompanies } from './card.js';

export function credentialsFor(company, secret) {
  if (cardCompanies[company]?.digits) return { id: secret.idNumber, card6Digits: secret.card6Digits, password: secret.password };
  return { username: secret.idNumber, password: secret.password };
}

export async function pullCardTransactions(login, { since, otpCodeRetriever }) {
  const chromiumModule = await import('@sparticuz/chromium');
  const chromium = chromiumModule.default || chromiumModule;
  if (typeof chromium.setGraphicsMode === 'function' || 'setGraphicsMode' in chromium) chromium.setGraphicsMode = false;
  const { CompanyTypes, createScraper } = await import('israeli-bank-scrapers');
  const scraper = createScraper({
    companyId: CompanyTypes[login.company],
    startDate: since,
    timeout: 90000,
    executablePath: await chromium.executablePath(),
    args: chromium.args,
    headless: true,
    otpCodeRetriever,
  });
  const result = await scraper.scrape(credentialsFor(login.company, login));
  if (!result?.success) throw Object.assign(new Error('sync failed'), { code: result?.errorType || 'GENERIC' });
  return (result.accounts || []).flatMap(account => account.txns || []);
}
