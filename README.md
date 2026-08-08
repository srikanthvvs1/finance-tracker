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

For a field-by-field explanation of every visible section, including formulas,
worked examples, account sign rules, and reconciliation behavior, read
[FinTrack Calculations and Label Guide](docs/CALCULATIONS_AND_LABELS.md).

## Contents

1. [What FinTrack helps you answer](#what-fintrack-helps-you-answer)
2. [Installation and startup](#installation-and-startup)
3. [How data is stored](#how-data-is-stored)
4. [Transaction routing model](#transaction-routing-model)
5. [Dashboard](#dashboard)
6. [Expenses](#expenses)
7. [Investments](#investments)
8. [Savings](#savings)
9. [Accounts](#accounts)
10. [Documents](#documents)
11. [Google Sheets expense sync](#google-sheets-expense-sync)
12. [Financial glossary](#financial-glossary)
13. [Calculations](#calculations)
14. [Project structure](#project-structure)
15. [Troubleshooting](#troubleshooting)

## What FinTrack helps you answer

FinTrack is designed to answer five practical questions:

- Where did my money go this month?
- How much of my income did I save and invest?
- Am I staying within my category budgets?
- What bills and commitments are still coming?
- Is my net worth moving in the right direction?

The header month selector controls month-based expense, savings, budget,
snapshot, and forecast views. The Dashboard has its own reporting-period
selector and defaults to the Indian financial year to date (April–March).

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
.\start_server.cmd
```

The start script runs one hidden server, records its verified PID, and exits
with an error if port 5000 already has a listener. Stop that managed server
with:

```powershell
.\stop_server.cmd
```

Server output is written under `logs/`; runtime PID state is stored under
`.runtime/`. Both folders are excluded from Git.

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
| Dated income credits and their receiving accounts | `data.xlsx` → `IncomeTransactions` |
| Derived monthly savings summaries | `data.xlsx` → `SavingsHistory` |
| Savings goals | `data.xlsx` → `SavingsGoals` |
| Emergency reserve target and asset designations | `data.xlsx` → `EmergencyFund` and `EmergencyAllocations` |
| Historical emergency contributions | `data.xlsx` → `EFContributions` (preserved for compatibility) |
| Monthly budgets | `data.xlsx` → `Budgets` |
| Recurring bills | `data.xlsx` → `RecurringBills` |
| Automatic net-worth snapshots | `data.xlsx` → `NetWorthAuto` |
| Manual net-worth history and overrides | `data.xlsx` → `NetWorth` |
| Cash-flow settings | `data.xlsx` → `CashFlow` |
| Account labels and reconciliation balances | `data.xlsx` → `Accounts` |
| Internal account transfers | `data.xlsx` → `Transfers` |
| Dated balance corrections and their reasons | `data.xlsx` → `ReconciliationAdjustments` |
| Recurring investment rules | `data.xlsx` → `RecurringRules` |
| Generated recurring reviews | `data.xlsx` → `RecurringOccurrences` |
| Uploaded documents | Local `documents/` directory |
| Incoming Google Form expenses | Google Sheet → `FormExpenses` |

`data.xlsx` is the source of truth. Do not edit it in Excel while FinTrack is
saving data, because Windows or OneDrive may temporarily lock the file.

Use **Export Excel** in the sidebar to download a copy of the workbook.

## Transaction routing model

FinTrack uses double-sided routing wherever money moves between two accounts.
Every normal transaction has a dated source, destination, or both; reports are
then derived from those same records. This keeps the account ledger, investment
holding, dashboard totals, and net worth connected.

| Action | Source / debit | Destination / credit | Reporting effect |
|---|---|---|---|
| Income or salary | External payer | Selected bank, cash, or wallet account | Increases income and that account balance |
| Expense paid from an asset | Selected bank, cash, or wallet account | Merchant / external payee | Decreases the account and increases expenses |
| Credit-card purchase | Credit-card account | Merchant / external payee | Increases the amount owed and increases expenses |
| Internal transfer | Selected source account | Selected destination account | Changes both balances; never counts as income or expense |
| MF, stock, gold, NPS, PPF, or FD purchase/deposit | Funding bank/cash account, or available Demat broker cash | Compatible investment account and holding | Decreases funding cash and increases investment cost/value |
| Prior investment / opening position | No funding account | Investment account and holding only | Establishes history without a bank debit or current-period investment outflow |
| Mutual-fund redemption | Mutual-fund holding | MF account's linked settlement bank | Reduces units on the redemption date and credits net proceeds on the bank-credit date |
| Stock sale | Stock holding | Demat broker cash | Reduces shares on the trade date and adds net broker cash on the settlement date |
| Broker-cash withdrawal | Demat broker cash | Demat account's linked settlement bank | Internal transfer only; does not count as income |
| PPF / FD interest | Institution | PPF / FD balance | Increases investment value; does not debit a bank or count as a new deposit |
| PPF / FD withdrawal | PPF / FD balance | Selected bank, cash, or wallet account | Decreases the investment balance and credits the receiving account |
| Reconciliation adjustment | Explicit balance correction | Selected account | Corrects only that account; not income, spending, or investment activity |

### The account chain

A practical connected setup looks like this:

```text
Salary payer -> Salary bank
Salary bank -> Spending bank                 (internal transfer)
Salary bank -> Investment bank               (internal transfer)
Spending bank -> Merchant                    (expense)
Investment bank -> Mutual Fund account       (BUY / SIP)
Investment bank -> Demat account + holding   (stock BUY)
Investment bank -> PPF or FD account         (DEPOSIT)
Mutual Fund account -> Linked bank           (redemption)
Stock holding -> Demat broker cash -> Linked bank
```

Create separate accounts for each real place money or value is held: banks,
cash, cards, brokerage/Demat, mutual-fund platform, PPF, NPS, and each FD that
needs its own balance history. Multiple schemes may share one mutual-fund
platform account; each scheme remains a separate holding. Multiple stocks may
likewise share one Demat account.

Mutual Fund and Demat accounts each store one linked settlement bank. Link them
to the bank actually registered with the platform. FinTrack prevents a new MF
redemption from being routed to a different bank and prevents a stock sale from
skipping Demat broker cash. Changing the link affects future transactions only;
it does not rewrite old transaction account IDs.

### Dates, prices, NAV, and charges

An investment sale can have two dates:

- **Trade / redemption date** changes units, cost basis, and realised P&L.
- **Settlement / bank-credit date** changes the cash account or broker-cash
  balance.

For an MF SIP, use the NAV belonging to the actual allotment/transaction date,
even if the pending occurrence is confirmed later. FinTrack attempts to fetch
that historical NAV; it remains editable before confirmation. For stocks, enter
the executed trade price. Charges are added to BUY cost basis and deducted from
SELL/redemption proceeds.

```text
Gross sale proceeds = Units sold x Sale price or NAV
Net cash proceeds   = Gross sale proceeds - Charges
BUY cash outflow    = Units bought x Buy price or NAV + Charges
```

Do not add a second manual transfer for an MF redemption: the redemption itself
credits the linked bank. For a stock sale, do not transfer the sale amount from
the bank; first record the sale into Demat broker cash, then use **Withdraw
broker cash** when the broker pays it to the linked bank. Available broker cash
may instead fund a later stock BUY without touching the bank.

### Recurring investments

A recurring rule is a schedule, not a transaction. When a SIP or deposit is
due, FinTrack creates one pending occurrence. Confirming it creates the real
investment transaction and debits its funding account; skipping it records no
money movement. If FinTrack was closed for several months, it generates each
missing occurrence when it next starts, without duplicates. Editing a rule's
amount changes future pending occurrences and does not rewrite confirmed
history.

### Route safeguards

- Income can be credited only to an active non-investment asset account.
- Expenses cannot be paid directly from an MF, Demat, PPF, NPS, gold, or FD
  container. Select the real bank/card/cash account used for payment.
- Connected investment BUY/DEPOSIT transactions require an asset funding
  account or available Demat broker cash; a card or loan cannot fund them.
- Investment WITHDRAWAL transactions require a receiving asset account.
- Opening positions have no funding-account debit. Use them only for holdings
  that existed before their FinTrack start date.
- Internal transfers affect both account balances and never inflate income,
  expenses, or investment contributions.

Google Form expenses follow the same rules. On import, FinTrack assigns them to
the active account whose purpose is **Spending**; review that account before
using the form. A form response becomes a normal local expense in `data.xlsx`
and is included in the account ledger, dashboard, and category reports.

## Dashboard

The Dashboard combines current net worth with flows from a selected reporting
period. Choose financial year to date, selected month, calendar year, all time,
or a custom date range.

### Summary cards

- **Net Worth** — current tracked asset and investment-account balances minus
  credit-card and loan balances. Unassigned legacy holdings are also included.
- **Income Received** — dated income credits from every source in the period.
- **Expenses** — categorized expense transactions in the period.
- **Invested** — connected BUY and DEPOSIT cash contributions in the period;
  prior/opening positions are excluded.
- **Available Surplus** — income minus expenses, investments, and legacy
  emergency-fund contributions.

Savings goals and the emergency fund are allocations, not additional assets.
They are therefore not added to Net Worth, which prevents the same money from
being counted twice.

### Financial direction summary

The sentence below the cards combines account-linked signals into plain language:

- current savings rate;
- spending change from the previous month;
- number of active accounts feeding the view.

It is a summary of entered data, not financial advice.

### Money Allocation and Income Sources

The Money Allocation chart divides period income into:

- expense categories;
- investments purchased during the month;
- emergency-fund contributions; and
- **Unallocated**, which is income not assigned to any of those uses.

Legend percentages show each slice's share of **total allocation**, so they
remain available even when no income is recorded for the period. The tooltip
also shows percentage of income when period income exists; otherwise it says
that income is not recorded.

The Income Sources chart groups actual credits by salary, bonus, freelance,
business, interest, dividend, rent, gift, and other income.

Use **Add Income** to record the actual credit date, source, description,
amount, and receiving account. The transaction immediately updates that
account's ledger and balance.

### Monthly Money Flow

Compares income, expenses, investments, and available surplus across the last
12 months ending at the header-selected month.

A negative savings rate means total outflows were greater than recorded income.

### Net-Worth History

Shows assets minus liabilities from automatically captured monthly snapshots.
A manual snapshot overrides the automatic value for the same month. The chart
does not manufacture historical investment prices or estimate goal balances.

### Expense Categories, Recent Activity, and Investment Snapshot

- **Expense Categories** defaults to Variable spending so rent and other fixed
  commitments do not overwhelm controllable categories. Use the
  **Variable / Fixed / All** selector; clicking a category opens the matching
  category and nature in Expenses. Fixed and Variable totals remain visible
  below the chart regardless of the selected chart view.
- **Recent Income & Expenses** combines the latest period credits and spending.
- **Investment Snapshot** shows selected holdings, their current value, and
  unrealised gain or loss.

## Expenses

The Expenses section records and explains spending.

### Expense fields

- **Date** — when the payment occurred.
- **Description** — merchant, bill, or purpose of the payment.
- **Category** — the type of spending.
- **Expense Nature** — **Fixed** for recurring commitments such as rent,
  subscriptions, EMI, or insurance; **Variable** for spending that changes with
  usage or choice. This is independent of Category.
- **Payment Method** — how the expense was paid.
- **Amount** — money spent.

### Expense categories

| Category | Meaning |
|---|---|
| Food & Takeaway | Restaurants, delivery, snacks, and eating outside |
| Grocery | Packaged food, staples, cleaning supplies, and other household items purchased for home |
| Vegetables & Fruits | Fresh vegetables, fruits, and produce purchased for home |
| Travel | Public transport, fuel, taxis, tickets, and trips |
| Housing | Rent, maintenance, and home-related costs |
| Parents Fund | Money provided to parents or support for their household expenses |
| Health | Medical visits, medicine, fitness, and healthcare |
| Personal Care | Haircuts, salon visits, grooming, cosmetics, and toiletries |
| Subscriptions & Software | ChatGPT, cloud storage, antivirus, and productivity software |
| Entertainment | Movies, games, events, and leisure subscriptions |
| Utilities | Electricity, water, internet, phone, and similar bills |
| Shopping | Clothing, electronics, and non-routine purchases |
| Other | Spending that does not fit another category |

On the first start after this upgrade, an existing Grocery row is reclassified
only when its description begins with `Vegetable`, `Vegetables`, `Veggie`,
`Veggies`, `Fruit`, `Fruits`, or `Produce`. Other Grocery rows remain unchanged.
This changes reporting classification only; its amount, date, paying account,
and ledger effect do not change.

### Payment methods

- **Credit Card** — payment borrowed from the card issuer and paid later.
- **Debit Card** — payment taken directly from a bank account.
- **Cash** — physical currency.
- **Bank Transfer** — account-to-account transfer such as NEFT or IMPS.
- **UPI** — instant bank payment through a UPI application.

### Charts and summary values

- **Expense Trend** uses the synchronized **Variable / Fixed / All** selector.
  Variable or Fixed shows that nature's 12-month line; All shows stacked Fixed
  and Variable bars with a combined total line. Therefore, it can show older
  spending even when the table is empty for the currently selected month.
- **Category Split** defaults to Variable spending for the selected month. Use
  its **Variable / Fixed / All** selector to change the population.
- **Total Expenses** is Fixed Expenses plus Variable Expenses for the selected
  year, month, and category filters.
- **Fixed Expenses** and **Variable Expenses** remain visible side by side even
  when the Nature filter limits the transaction table.
- **Transactions** is the number of filtered expense records.
- **Variable Avg / Day** divides only Variable expenses by the applicable
  elapsed or period days; Fixed expenses do not inflate the daily pace.
- **Largest Variable Expense** is the highest single Variable transaction.
- **Variable Projected Month-End** projects only Variable spending for the
  specifically selected current month. It displays a dash for other periods.

Year, month, and category filters affect the table and summary strip. The Nature
filter limits the table, while the summary keeps both nature totals visible for
comparison. The 12-month trend remains a historical chart.

## Investments

The Investments section tracks holdings and BUY/SELL transactions. Prices are
informational and may be delayed or unavailable.

### Main investment terms

- **Asset / Ticker** — the market identifier of a security. Indian NSE tickers
  normally end in `.NS`; US tickers generally have no suffix.
- **Scheme Code** — the MFapi identifier stored automatically when a user
  selects a mutual fund from the searchable scheme catalogue.
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

### Offline mutual-fund search and NAVs

When Mutual Funds is selected in Add Investment, type part of the fund name,
AMC, plan, and option. Choose the exact Direct/Regular and Growth/IDCW result.
FinTrack fills the fund name and stores its scheme code automatically.

Scheme metadata is cached in `cache/market_data.sqlite`, not `data.xlsx`.
The catalogue is downloaded automatically when it is empty and can be updated
with **Refresh catalogue**. Once downloaded, name searches work without an
internet connection.

NAVs are cached only for schemes FinTrack has requested. If an online NAV
request fails, FinTrack uses the last saved NAV and displays its date. If no
catalogue or NAV is available, fund details, units, and NAV can still be entered
manually; account and ledger calculations are never blocked by internet access.

### Selling, redemption, and settlement

Link each Mutual Fund or Demat / Brokerage account to the bank account that
receives its settlements. Mutual-fund redemptions credit that linked bank on
the entered bank-credit date. Stock sales first create broker cash inside the
Demat account; use **Withdraw broker cash** to prepare an internal transfer to
the linked bank, or reuse the cash for a later purchase.

The sale form records the trade/redemption date, settlement/credit date,
applicable price or NAV, charges, gross proceeds, and net proceeds. Mutual funds
can be redeemed by units or amount. Charges reduce both the cash received and
realised P&L.

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

When creating a holding that already existed before FinTrack, choose **Prior
investment / opening position**. Enter the units or principal, remaining cost
basis, current value, and an as-of date. The opening position is linked to its
MF, Demat, PPF, NPS, gold, or FD account but does not debit a salary, savings,
or other funding account and does not count as this month's investment outflow.
Later transactions use the normal connected-account flow.

For a new PPF/FD deposit, FinTrack records only the deposited principal.
Expected maturity value is not treated as interest already received; add an
INTEREST transaction only when the institution actually credits it.

Mutual funds, stocks, NPS units, and Gold ETFs are unit-based holdings. For an
existing SIP, use a prior opening position with current units and remaining
average cost, then record future BUY transactions normally.

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

An emergency reserve is a purpose assigned to assets you already own. It is not
a second account and does not create money. Use **Allocate Asset** in Accounts
to designate an existing bank/cash balance, FD, mutual fund, or another holding.
Existing holdings can be marked at any time without changing their units, cost
basis, transactions, gain/loss, account balance, or net worth.

- **Target** — desired usable emergency reserve.
- **Total Emergency Reserve** — all designated allocations, including locked
  or restricted assets.
- **Target Gap** — target minus total emergency reserve, never below zero.
- **Available Now** — cash or account value that can be used immediately.
- **Needs Redemption** — an investment that must first be withdrawn or sold.
- **Locked / Restricted** — designated value that is difficult or restricted to
  access. It remains included in target progress and coverage.
- **Entire current value** — the allocation automatically follows the asset's
  current FinTrack value.
- **Fixed amount** — only the chosen amount is reserved. If the asset later
  falls below it, the effective allocation is capped at the asset's current
  value.
- **Coverage Months** — total emergency reserve divided by the average essential
  monthly expenses over the latest three selected months.

Historical rows in `EFContributions` are preserved for old reports, but they are
not treated as current reserve until the actual assets holding that money are
allocated. This avoids double-counting balances that are already present in an
account or investment.

## Accounts

Accounts are the foundation of FinTrack. Income, expenses, transfers, and
investment transactions are assigned to accounts so balances describe where
money is held and how it moved.

### Accounts and Internal Transfers

Store only a friendly name, institution, purpose, and optional masked
identifier - never an account number, password, PIN, OTP, or banking
credential.

Each account has:

- **Type** - savings/current bank, cash, credit card, wallet, store account,
  Demat, mutual fund, gold, PPF, NPS, fixed deposit, loan, or other;
- **Classification** - asset, liability, or investment, derived from its type;
- **Purpose** - Salary, Investment, Spending, Savings, or Other;
- **Tracking Start Date** - the date from which FinTrack includes linked
  activity for that account;
- **Starting Balance** - the real balance already present at the start of that
  date;
- **FinTrack-calculated Balance** - starting balance plus every linked money
  movement from the tracking start date;
- **Current Bank/Card Balance** - the latest balance manually copied from the
  institution; and
- **Unexplained Gap** - the amount still missing from, or extra in, FinTrack.

For asset accounts, incoming money increases the balance and outgoing money
decreases it. For credit cards and loans, charges increase the amount owed and
payments reduce it. An internal transfer updates both accounts without being
classified as income or spending.

The Internal Transfers tile can be filtered by the header-selected month,
calendar year, or financial year. The filtered list remains scrollable and the
filter does not alter any ledger calculation.

Example:

```text
Salary credited to Axis        = Income assigned to Axis Salary
Axis to SBI                     = Internal transfer
SBI mutual-fund SIP             = Investment BUY funded by SBI Investment
Axis to Kotak                   = Internal transfer
Kotak grocery payment           = Expense paid from Kotak Spending
```

Use **Review balance** on an account to reconcile it:

1. Enter the current balance shown by the bank or card.
2. If FinTrack started after the account already contained money, save the
   correct tracking start date and balance at the start of that date.
3. If an old transaction cannot be recovered, add a dated exceptional
   adjustment with a reason. FinTrack keeps it in the account ledger and in the
   `ReconciliationAdjustments` worksheet with its creation time.

Starting positions are account setup data. Adjustments are explicit ledger
corrections and should not be used for ordinary income, expenses, transfers, or
investments.

New income requires an active Salary account. Expenses require a paying
account. Investment purchases require both a funding account and a compatible
investment account: Demat for stocks, mutual-fund account for funds, or the
matching PPF, NPS, gold, or fixed-deposit account. Creating a new investment
account automatically links compatible unassigned legacy holdings.

### Recurring investments and catch-up

Recurring rules automate expected SIP and other periodic investment
contributions without requiring FinTrack to remain running. A rule stores the
holding, funding account, frequency, due day, expected amount, and start date.

Whenever FinTrack opens, it calculates every scheduled date through today and
creates missing occurrences as **Pending**. Each occurrence uses `rule ID +
scheduled date`, so reopening the application does not create duplicates.

Pending occurrences appear under **Accounts → Recurring Investments** and in
the Dashboard **Action items** count. Confirmation asks for the actual date,
amount, NAV or price, and allotted units before creating the real investment
transaction. Skipping records the occurrence without changing balances. Rules
can be paused and resumed.

```text
Recurring rule = expected movement
Confirmed occurrence = actual ledger and investment transaction
```

### Legacy planning data

Budget, recurring-bill, manual net-worth snapshot, and cash-flow forecast
worksheets remain readable through the API for backward compatibility, but
their forms are no longer shown in the account-centered interface.

### Budget Used (legacy)

A **budget** is the maximum amount you plan to spend in a category during one
month.

- **Spent** comes from actual expense transactions in that category.
- **Remaining** is category budget minus category spending.
- **Budget Used %** is total monthly spending divided by total monthly budget.
- A yellow bar means usage is approaching the limit.
- A red bar means spending is greater than the budget.

**Copy Previous Month** duplicates the previous month's category limits into
the selected month. It replaces any budgets already entered for that month.

### Recurring Bills (legacy)

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

### Net-Worth Snapshots

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

FinTrack automatically updates the current month from connected accounts and
holdings. When a new month begins, the previous monthly observation remains in
the history. Use the manual form only to import older months or override an
automatic month. A rising net worth normally indicates improving financial
position, but asset values and debt changes should be reviewed separately.

### Cash-Flow Forecast (legacy)

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

## Documents (legacy)

The Documents section stores financial files locally.

- **Category** groups related files, such as Tax, Insurance, Salary Slips,
  Investments, or Bank Statements.
- **Year** separates documents by financial or calendar year.
- **Upload** copies a selected file into `documents/<category>/<year>/`.
- **Download** opens or saves a stored file.
- **Delete** permanently removes the selected document.

The Documents interface is hidden in the account-centered version. Existing
files and API endpoints are preserved. Documents are not stored in Google
Drive by the current version.

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
3. It normalises category, expense nature, and payment names. If an older form
   has no Expense Nature question, FinTrack infers an editable default.
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
Net Sale Proceeds = (Units Sold × Sale Price) − Charges
Realised Gain/Loss = Net Sale Proceeds − Cost Removed

Weighted Average Buy Price
= ((Old Units × Old Average Price) + (New Units × New Price) + BUY Charges)
  ÷ Total Units
```

### Savings goals and emergency fund

```text
Goal Progress % = Current Goal Amount ÷ Goal Target × 100

Source Value = FinTrack account balance or holding current value
Requested Allocation = Source Value, for Entire current value mode
Requested Allocation = Fixed Amount, for Fixed amount mode
Effective Allocation = min(Requested Allocation, Source Value)
Total Emergency Reserve = Available Now + Needs Redemption + Locked / Restricted
Emergency Gap = max(0, Emergency Target - Total Emergency Reserve)
Emergency Progress % = Total Emergency Reserve ÷ Emergency Target × 100
Coverage Months = Total Emergency Reserve ÷ Average Essential Monthly Expenses
```

Displayed progress is capped at 100%. Locked allocations remain separately
identified but are included in progress and coverage. Allocating an asset
changes only its purpose tag; it creates no ledger entry and has no net-worth
effect.

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
├── start_server.cmd             Managed background-server launcher
├── start_server.ps1             Launcher implementation and PID verification
├── stop_server.cmd              Managed-server stop command
├── stop_server.ps1              Stop implementation and ownership check
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
- Check that the Dashboard reporting period contains data.
- Use **Add Income** to record a dated credit and receiving account.
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
