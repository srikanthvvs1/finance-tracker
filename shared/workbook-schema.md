# FinTrack portable workbook contract

`data.xlsx` is the portable exchange format shared by the desktop and Android
applications. Android uses a local database while running and imports/exports
this exact workbook structure.

## Identity and compatibility

- File name: `data.xlsx`
- Current schema version: `1`
- Dates: ISO `YYYY-MM-DD`
- Months: `MMM YYYY` (for example, `Jul 2026`)
- Money: decimal numbers in INR; never formatted strings
- IDs: stable integers preserved during import and export
- Empty optional relationships: blank cells, never zero

## Sheets

| Sheet | Required columns |
|---|---|
| Expenses | id, date, description, category, payment, amount, accountId |
| Investments | id, asset, name, category, units, buyPrice, currentPrice, date, marketCap, riskLevel, ticker, schemeCode |
| Transactions | investmentId, date, action, units, price, accountId |
| SavingsHistory | month, income, expenses, invested, emergency, net_saved, accountId |
| SavingsGoals | id, name, icon, target, current, deadline |
| EmergencyFund | target |
| EmergencyContributions | id, date, amount, note |
| Budgets | month, category, amount |
| RecurringBills | id, name, category, amount, dueDay, frequency, active, includedInBudget |
| NetWorth | month, cash, bank, investments, retirement, otherAssets, loans, creditCards, otherLiabilities |
| CashFlow | month, openingBalance, otherIncome, safetyBalance |
| Accounts | id, name, bank, purpose, openingBalance, statementBalance, includeNetWorth, active |
| Transfers | id, date, fromAccountId, toAccountId, amount, note |

## Connected cash-flow rules

- Income credits its `accountId`.
- Expenses debit their `accountId`.
- Transfers debit `fromAccountId` and credit `toAccountId`.
- BUY and DEPOSIT investment transactions debit their `accountId`.
- SELL and WITHDRAWAL transactions credit their `accountId`.
- INTEREST and ADJUSTMENT change investment value but not bank cash.
- Internal transfers never count as income, expense, or investment.

Import validates the complete workbook before replacing local data. Export
writes a new document and never modifies the selected source workbook in place.
