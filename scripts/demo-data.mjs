export function demoData() {
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 2);
  const dueDate = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-02`;
  return {
    version: 2,
    settings: { paydayDay: 10, creditClosingDay: 15, creditPaymentDay: 2, openingDate: date,
      openingBankBalance: 15000, openingCashBalance: 400,
      budgets: { groceries: 1800, fuel: 400, transport: 200, home: 300, health: 200, leisure: 600, other: 500 } },
    obligations: [{ id: 'demo-phone', name: 'טלפון · דוגמה', amount: 100, method: 'debit', category: 'home', dueDay: 12 }],
    debts: [{ id: 'demo-loan', name: 'הלוואה · דוגמה', balance: 12000, monthlyPayment: 1000, dueDay: 15 }],
    transactions: [{ id: 'demo-card', type: 'expense', name: 'קניות · דוגמה', amount: 200, category: 'groceries', method: 'credit', date, creditDueDate: dueDate, budgeted: true }],
    creditPayments: [{ id: 'demo-old-bill', dueDate, amount: 3500, status: 'pending', paidDate: '', expenseIds: [], amountMode: 'remainder' }],
    surplusActions: [], deletedTransactionIds: [], deletedObligationIds: [], deletedDebtIds: [], processedTelegramUpdates: [], telegramChatId: null,
  };
}
