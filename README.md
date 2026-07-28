# FinTrack — Personal Finance Tracker

FinTrack is a local-first personal finance application for recording expenses,
monitoring investments, planning monthly cash flow, and understanding whether
your financial position is improving.

Your main financial data stays in a local Excel workbook named `data.xlsx`.
Google Sheets is optional and is used only as an expense inbox: expenses
submitted through a Google Form are imported into the local workbook when the
server starts.

FinTrack starts with an empty workbook. It does not create sample or dummy
financial records.

## Contents

1. [What FinTrack helps you answer](#what-fintrack-helps-you-answer)
2. [Installation and startup](#installation-and-startup)
3. [How data is stored](#how-data-is-stored)
4. [Dashboard](#dashboard)
5. [Expenses](#expenses)
6. [Investments](#investments)
7. [Savings](#savings)
8. [Financial Plan](#financial-plan)
9. [Documents](#documents)
10. [Google Sheets expense sync](#google-sheets-expense-sync)
11. [Financial glossary](#financial-glossary)
12. [Calculations](#calculations)
13. [Project structure](#project-structure)
14. [Troubleshooting](#troubleshooting)

## What FinTrack helps you answer

FinTrack is designed to answer five practical questions:

- Where did my money go this month?
- How much of my income did I save and invest?
- Am I staying within my category budgets?
- What bills and commitments are still coming?
- Is my net worth moving in the right direction?

The header month selector controls the month used by the dashboard, expenses,
savings, budgets, snapshots, and forecasts.

## Installation and startup

### Requirements

- Windows, macOS, or Linux
- Python 3.10 or newer
- Internet access for Google Sheets sync and live market prices
- A modern web browser

### Install dependencies

Open PowerShell or a terminal in the project folder:

```powershell
cd D:\svaddep\programming\finance-tracker
python3 -m pip install -r requirements.txt
```

If your installation uses `python` instead of `python3`, use:

```powershell
python -m pip install -r requirements.txt
```

### Start FinTrack

```powershell
python3 .\server.py
```

Then open:

```text
http://localhost:5000
```

On Windows, you can also double-click `start.bat`. It detects Python, installs
missing dependencies, creates a desktop shortcut, starts the server, and opens
the application.

## How data is stored

FinTrack uses one canonical server: `server.py`.

| Data | Storage location |
|---|---|
| Expenses | `data.xlsx` → `Expenses` |
| Investments | `data.xlsx` → `Investments` and `Transactions` |
| Income and savings history | `data.xlsx` → `SavingsHistory` |
| Savings goals | `data.xlsx` → `SavingsGoals` |
| Emergency fund | `data.xlsx` → `EmergencyFund` and `EFContributions` |
| Monthly budgets | `data.xlsx` → `Budgets` |
| Recurring bills | `data.xlsx` → `RecurringBills` |
| Net-worth snapshots | `data.xlsx` → `NetWorth` |
| Cash-flow settings | `data.xlsx` → `CashFlow` |
| Account labels and reconciliation balances | `data.xlsx` → `Accounts` |
| Internal account transfers | `data.xlsx` → `Transfers` |
| Uploaded documents | Local `documents/` directory |
| Incoming Google Form expenses | Google Sheet → `FormExpenses` |

`data.xlsx` is the source of truth. Do not edit it in Excel while FinTrack is
saving data, because Windows or OneDrive may temporarily lock the file.

Use **Export Excel** in the sidebar to download a copy of the workbook.

## Dashboard

The Dashboard is a summary of the selected month and your current tracked
financial position.

### Summary cards

- **Net Worth** — assets minus liabilities from the selected month's saved
  net-worth snapshot. If no snapshot exists yet, the card temporarily shows
  the current tracked investment value.
- **Monthly Income** — income recorded for the selected month. Click the value
  to create or update it.
- **Monthly Expenses** — total expense transactions dated in the selected
  month.
- **Net Savings** — income remaining after expenses, investment purchases, and
  emergency-fund contributions.

Savings goals and the emergency fund are allocations, not additional assets.
They are therefore not added to Net Worth, which prevents the same money from
being counted twice.

### Financial direction summary

The sentence below the cards combines several signals into plain language:

- current savings rate;
- spending change from the previous month;
- remaining or exceeded budget;
- upcoming recurring bills; and
- a warning when forecast cash falls below the chosen safety balance.

It is a summary of entered data, not financial advice.

### Income Breakdown

The doughnut chart divides the selected month's income into:

- expense categories;
- investments purchased during the month;
- emergency-fund contributions; and
- **Unallocated**, which is income not assigned to any of those uses.

If income has not been entered, expense categories can still appear, but their
percentage of income cannot be calculated.

### Savings Rate Trend

Shows the percentage of income retained after expenses, investments, and
emergency contributions for up to the last 12 months.

A negative savings rate means total outflows were greater than recorded income.

### Net-Worth History

Shows assets minus liabilities from your saved monthly snapshots. The chart
does not manufacture historical investment prices or estimate goal balances.

### Recent Transactions and Investment Snapshot

- **Recent Transactions** shows the latest expense entries.
- **Investment Snapshot** shows selected holdings, their current value, and
  unrealised gain or loss.

## Expenses

The Expenses section records and explains spending.

### Expense fields

- **Date** — when the payment occurred.
- **Description** — merchant, bill, or purpose of the payment.
- **Category** — the type of spending.
- **Payment Method** — how the expense was paid.
- **Amount** — money spent.

### Expense categories

| Category | Meaning |
|---|---|
| Food | Restaurants, delivery, snacks, and eating outside |
| Grocery | Food and household items purchased for home |
| Travel | Public transport, fuel, taxis, tickets, and trips |
| Housing | Rent, maintenance, and home-related costs |
| Health | Medical visits, medicine, fitness, and healthcare |
| Entertainment | Movies, games, events, and leisure subscriptions |
| Utilities | Electricity, water, internet, phone, and similar bills |
| Shopping | Clothing, electronics, and non-routine purchases |
| Other | Spending that does not fit another category |

### Payment methods

- **Credit Card** — payment borrowed from the card issuer and paid later.
- **Debit Card** — payment taken directly from a bank account.
- **Cash** — physical currency.
- **Bank Transfer** — account-to-account transfer such as NEFT or IMPS.
- **UPI** — instant bank payment through a UPI application.

### Charts and summary values

- **Expense Trend** shows totals and category composition for the last 12
  months. Therefore, it can show older spending even when the table is empty
  for the currently selected month.
- **Category Split** shows the selected month's spending by category.
- **Total This Month** is the sum of filtered expenses.
- **Transactions** is the number of filtered expense records.
- **Average Per Day** is the filtered total divided by 30.
- **Largest Expense** is the highest single filtered transaction.
- **Projected Month-End** estimates spending at the current daily pace.

Filters affect the expense table and summary strip. The 12-month trend remains
a historical chart.

## Investments

The Investments section tracks holdings and BUY/SELL transactions. Prices are
informational and may be delayed or unavailable.

### Main investment terms

- **Asset / Ticker** — the market identifier of a security. Indian NSE tickers
  normally end in `.NS`; US tickers generally have no suffix.
- **Scheme Code** — the identifier used to look up an Indian mutual fund on
  `mfapi.in`.
- **Units** — shares, mutual-fund units, grams, or another quantity currently
  held.
- **Buy Price** — average acquisition price per unit.
- **Current Price** — latest known price or NAV per unit.
- **Invested Value / Cost Basis** — units held multiplied by average buy price.
- **Current Value** — units held multiplied by current price.
- **Gain / Loss (P&L)** — current value minus invested value.
- **Return %** — gain or loss divided by invested value.
- **Holding** — one asset currently owned.

### Portfolio terms

- **Portfolio** — all investments tracked together.
- **Asset Allocation** — how the portfolio is divided among stocks, mutual
  funds, gold, retirement products, and deposits.
- **Market Capitalisation** — company size based on total market value. FinTrack
  uses Large, Mid, and Small Cap labels.
- **Risk Level** — a user-selected Low, Moderate, or High classification. It is
  descriptive and is not calculated by FinTrack.
- **Unrealised P&L** — gain or loss on investments still held.
- **Realised P&L** — sale proceeds minus the moving-average cost of units sold.
  Fully sold holdings remain available so their transaction history is not lost.
- **NAV** — Net Asset Value per unit of a mutual fund.
- **Weighted Average Buy Price** — the combined average unit cost after
  purchasing more units at a different price.

### Supported investment groups

- Indian stocks
- Foreign stocks
- Mutual funds
- Gold
- Public Provident Fund (PPF)
- National Pension System (NPS)
- Fixed deposits (FD)

Stock prices are requested through the local server from Yahoo Finance. Mutual
fund NAVs are requested from `mfapi.in`. Both requests go through the local
server; browser-side public CORS proxies are not used. Gold, PPF, NPS, and
fixed-deposit values are entered manually.

PPF and fixed deposits are transaction-based balance accounts. Their supported
transactions are:

- **DEPOSIT** - money contributed by you;
- **INTEREST** - interest credited by the institution;
- **WITHDRAWAL** - money removed from the account; and
- **ADJUSTMENT** - a correction required to reconcile a statement.

FinTrack derives total principal, interest earned, withdrawals, and current
balance from these entries. Use the plus button on a balance-account card to
add the next dated transaction. Only DEPOSIT entries count as monthly
investment outflow; credited interest does not reduce monthly savings.

Mutual funds, stocks, NPS units, and Gold ETFs are unit-based holdings. For an
existing SIP, enter its transaction history or one opening BUY using current
units and remaining cost basis.

## Savings

The Savings section explains how recorded income was allocated and tracks
specific reserves.

### Monthly values

- **Income** — money received during the month.
- **Expenses** — total spending during the month.
- **Invested** — cost of BUY transactions and PPF/FD DEPOSIT transactions
  during the month.
- **Emergency** — contributions made to the emergency fund.
- **Net Saved** — income left after all four outflow types above.
- **Savings Rate** — net saved as a percentage of income.
- **Invest Rate** — investment purchases as a percentage of income.

### Savings Goals

A savings goal is money reserved for a specific future purpose.

- **Target** — total amount required.
- **Current** — amount already assigned to the goal.
- **Deadline** — intended completion date.
- **Progress** — current amount divided by target.

Goal balances show allocation progress but are not added to Dashboard Net
Worth, preventing money held in an account or investment from being counted
twice.

### Emergency Fund

An emergency fund is accessible money reserved for unexpected events such as
medical costs, urgent repairs, or loss of income.

- **Target** — desired emergency reserve.
- **Current** — sum of recorded emergency-fund contributions.
- **Contribution** — an amount added on a particular date.
- **Coverage Months** — current emergency fund divided by average essential
  monthly expenses over the latest three selected months. It appears in the
  Financial Plan summary.

## Financial Plan

The Financial Plan section converts historical records into forward-looking
information for the selected month.

### Accounts and Internal Transfers

Accounts are optional labels for where money is held. Store only a friendly
name, bank name, purpose, and balances - never an account number, password,
PIN, OTP, or banking credential.

Each account has:

- **Purpose** - Salary, Investment, Spending, Savings, or Other;
- **Opening Balance** - starting point before account-attributed tracker
  activity;
- **Tracked Balance** - opening balance plus attributed income and incoming
  transfers, minus attributed expenses, investments, and outgoing transfers;
- **Latest Bank Balance** - the balance manually copied from the bank; and
- **Difference** - bank balance minus tracked balance, used for reconciliation.

An internal transfer decreases one tracked account and increases another. It
does not change income, expenses, savings, or net worth.

Example:

```text
Salary credited to Axis        = Income assigned to Axis Salary
Axis to SBI                     = Internal transfer
SBI mutual-fund SIP             = Investment BUY funded by SBI Investment
Axis to Kotak                   = Internal transfer
Kotak grocery payment           = Expense paid from Kotak Spending
```

New income defaults to the active Salary account, new expenses default to the
active Spending account, and new investment contributions default to the
active Investment account. These assignments can be changed in their forms.
Existing historical records remain unassigned until deliberately reconciled.

### Budget Used

A **budget** is the maximum amount you plan to spend in a category during one
month.

- **Spent** comes from actual expense transactions in that category.
- **Remaining** is category budget minus category spending.
- **Budget Used %** is total monthly spending divided by total monthly budget.
- A yellow bar means usage is approaching the limit.
- A red bar means spending is greater than the budget.

**Copy Previous Month** duplicates the previous month's category limits into
the selected month. It replaces any budgets already entered for that month.

### Recurring Bills

A recurring bill is a payment expected repeatedly, such as rent, internet, an
EMI, insurance, or a subscription.

- **Amount** is the expected payment.
- **Due Day** is the day number within each month.
- **Upcoming Bills** totals active bills whose due day has not passed in the
  selected period.
- **Included in category budget** means the bill is already covered by that
  category's remaining budget and will not be subtracted a second time.

Recurring bills are commitments used by the forecast. They do not
automatically create expense transactions, because an expected bill and a paid
expense are different records.

The forecast subtracts Remaining Budget plus only those upcoming bills marked
as not included in a category budget.

### Net-Worth Snapshot

**Net Worth** measures what you own minus what you owe at one point in time.

Assets entered in a snapshot:

- **Cash** — physical or immediately available cash.
- **Bank Balances** — money in savings or current accounts.
- **Investments** — current value of investments.
- **EPF / PPF / NPS** — retirement and long-term savings balances.
- **Other Assets** — other assets you choose to include.

Liabilities entered in a snapshot:

- **Loans** — outstanding home, vehicle, education, personal, or other loans.
- **Credit Cards** — unpaid card balances.
- **Other Liabilities** — other money owed.

Formula:

```text
Net Worth = Total Assets − Total Liabilities
```

Save one snapshot each month to see direction over time. A rising net worth
normally indicates improving financial position, but asset values and debt
changes should be reviewed separately.

### Cash-Flow Forecast

Cash flow describes money expected to enter and leave during a period.

- **Opening Available Cash** — available cash at the beginning of the selected
  month.
- **Other Expected Income** — expected income not included in Monthly Income.
- **Safety Balance** — minimum cash balance you want to preserve.
- **Remaining Budget** — budget not yet spent.
- **Forecast Balance** — estimated cash remaining after planned outflows.

FinTrack calculates:

```text
Forecast Balance
= Opening Available Cash
+ Monthly Income
+ Other Expected Income
− Remaining Budget
− Upcoming Bills
```

A warning appears when Forecast Balance is below Safety Balance.

This is a planning estimate. It is only as accurate as the income, budgets,
bills, and opening cash entered.

## Documents

The Documents section stores financial files locally.

- **Category** groups related files, such as Tax, Insurance, Salary Slips,
  Investments, or Bank Statements.
- **Year** separates documents by financial or calendar year.
- **Upload** copies a selected file into `documents/<category>/<year>/`.
- **Download** opens or saves a stored file.
- **Delete** permanently removes the selected document.

Documents are not stored in Google Drive by the current version.

### Local server and backup settings

FinTrack listens only on `127.0.0.1` and runs with Flask debug mode disabled by
default. Optional environment variables are:

```env
FINTRACK_DATA_DIR=D:\path\to\finance-data
FINTRACK_BACKUP_KEEP=20
FINTRACK_HOST=127.0.0.1
PORT=5000
FLASK_DEBUG=false
```

Before each workbook update, FinTrack creates a timestamped recovery copy in
`backups/` and retains the newest configured number. Workbook schema upgrades
add or reorder known columns without deleting existing rows. An unreadable
workbook is moved into `backups/` before a fresh workbook is created.

## Google Sheets expense sync

Google Sheets is optional. FinTrack continues to work locally when Google is
not configured or the internet is unavailable.

### Configuration

1. Create a Google Cloud project.
2. Enable the Google Sheets API.
3. Create a service account and download its JSON key.
4. Put the key inside `config/`.
5. Copy `config/gsheets.env.example` to `config/gsheets.env`.
6. Set the existing configuration values:

   ```env
   GSHEETS_CREDS_FILE=your-credentials-file.json
   GSHEETS_SPREADSHEET_ID=your-spreadsheet-id
   ```

7. Share the spreadsheet with the service account's `client_email`.
8. Use `config/setup_form.gs` to create the Google Form and `FormExpenses`
   worksheet.

See [Google Sheets expense inbox setup](docs/GOOGLE_SERVICE_ACCOUNT.md) for
detailed instructions.

### Sync behaviour

When FinTrack starts:

1. It reads rows from `FormExpenses`.
2. It validates dates and amounts.
3. It normalises category and payment names.
4. It checks local expenses for duplicates.
5. It writes new expenses to `data.xlsx`.
6. It removes successfully handled or duplicate inbox rows.

Invalid rows remain in Google Sheets so they can be corrected. A failed Google
connection does not stop the local server.

## Financial glossary

| Term | Plain-language meaning |
|---|---|
| Asset | Something you own that has financial value |
| Liability | Money you owe |
| Net Worth | Total assets minus total liabilities |
| Income | Money received |
| Expense | Money spent |
| Cash Flow | Movement of money in and out |
| Budget | Planned spending limit |
| Savings | Income retained instead of spent or invested |
| Investment | Money placed into an asset with the expectation of future value or income |
| Principal | Original amount invested or borrowed |
| Interest | Cost of borrowing or return paid on savings/deposits |
| EMI | Equated Monthly Instalment; a regular loan payment |
| SIP | Systematic Investment Plan; a recurring mutual-fund investment |
| P&L | Profit and Loss |
| Cost Basis | Total purchase cost of an investment currently held |
| NAV | Per-unit value of a mutual fund |
| Portfolio | Collection of investments |
| Diversification | Spreading money across assets to reduce concentration |
| Liquidity | How quickly an asset can be converted into usable cash |
| Emergency Fund | Accessible reserve for unexpected needs |
| Savings Rate | Percentage of income remaining after tracked outflows |
| Investment Rate | Percentage of income used for investments |
| Market Cap | Market value used to describe company size |
| Unrealised Gain/Loss | Change in value of an asset not yet sold |
| Realised Gain/Loss | Profit or loss completed through a sale |
| Forecast | Estimate based on expected future inputs |

## Calculations

### Dashboard

```text
Investment Current Value = Σ (Units × Current Price)
Net Worth = Snapshot Assets − Snapshot Liabilities

Monthly Expenses = Σ selected-month expense amounts

Net Savings
= Monthly Income
− Monthly Expenses
− Monthly Investment BUY Outflow
− Monthly Emergency Contributions

Savings Rate = Net Savings ÷ Monthly Income × 100
```

### Investments

```text
Invested Value = Remaining Units × Moving-Average Buy Price
Current Value = Units × Current Price
Gain/Loss = Current Value − Invested Value
Return % = Gain/Loss ÷ Invested Value × 100

On SELL:
Cost Removed = Units Sold × Moving-Average Buy Price
Realised Gain/Loss = Sale Proceeds − Cost Removed

Weighted Average Buy Price
= ((Old Units × Old Average Price) + (New Units × New Price))
  ÷ Total Units
```

### Savings goals and emergency fund

```text
Goal Progress % = Current Goal Amount ÷ Goal Target × 100
Emergency Progress % = Current Emergency Fund ÷ Emergency Target × 100
```

Displayed progress is capped at 100%, although the stored amount can be greater
than the target.

### Budget and forecast

```text
Budget Used % = Actual Monthly Expenses ÷ Total Monthly Budget × 100
Remaining Budget = max(0, Total Monthly Budget − Actual Monthly Expenses)

Forecast Balance
= Opening Cash + Monthly Income + Other Income
− Remaining Budget − Upcoming Bills Not Included in Budget
```

## Project structure

```text
finance-tracker/
├── server.py                    Flask API and local workbook handling
├── requirements.txt             Python dependencies
├── start.bat                    Windows launcher
├── data.xlsx                    Generated local finance data (gitignored)
├── backups/                     Local recovery copies (gitignored)
├── documents/                   Uploaded local documents (gitignored)
├── static/
│   ├── index.html               Application structure
│   ├── script.js                UI behaviour and calculations
│   └── style.css                Application styling
├── config/
│   ├── gsheets.env.example      Google Sheets configuration template
│   └── setup_form.gs            Optional Google Form setup
└── docs/
    └── GOOGLE_SERVICE_ACCOUNT.md
```

## Troubleshooting

### `ModuleNotFoundError: No module named 'flask'`

Install the project dependencies with the same Python command used to run the
server:

```powershell
python3 -m pip install -r requirements.txt
```

### `python` is not recognised

Try:

```powershell
python3 --version
```

or:

```powershell
py --version
```

Use whichever command succeeds for installation and startup.

### Dashboard is empty

- Confirm `server.py` is running.
- Check that the selected month contains data.
- Click Monthly Income to enter income.
- Add expenses manually or verify Google Sheets sync.
- Hard-refresh the browser with `Ctrl+F5` after restarting the server.

### Expense table is empty but Expense Trend is visible

The table can be filtered to one month while Expense Trend always covers the
last 12 months. Axes and a zero line can also appear when there are no expense
records.

### Google Sheets sync is skipped

- Confirm `config/gsheets.env` exists.
- Confirm the credentials filename and spreadsheet ID are correct.
- Share the spreadsheet with the service-account email.
- Confirm the worksheet is named `FormExpenses`.
- Check internet access.

### `data.xlsx` is locked

Close the workbook in Excel and wait for OneDrive or antivirus scanning to
finish, then restart FinTrack.

## License

This project is intended for personal and educational use.
