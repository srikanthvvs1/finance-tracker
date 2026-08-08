# FinTrack Calculations and Label Guide

This document explains what every important FinTrack label means, where its
data comes from, how it is calculated, why it is useful, and what changes it.
It describes the behavior of the application as it exists today.

## Contents

1. [The core accounting model](#1-the-core-accounting-model)
2. [Global month controls](#2-global-month-controls)
3. [Dashboard](#3-dashboard)
4. [Expenses](#4-expenses)
5. [Investments](#5-investments)
6. [Income and Flow](#6-income-and-flow)
7. [Accounts](#7-accounts)
8. [Internal transfers](#8-internal-transfers)
9. [Account ledger](#9-account-ledger)
10. [Review Account Balance](#10-review-account-balance)
11. [Recurring investments](#11-recurring-investments)
12. [Workbook storage](#12-workbook-storage)
13. [Complete examples](#13-complete-examples)
14. [Important current limitations](#14-important-current-limitations)

## 1. The core accounting model

### 1.1 Accounts are the foundation

FinTrack is account-centered. Money should always have a location:

- a salary or savings bank account;
- a spending account or wallet;
- a credit card or loan;
- an investment account such as a mutual-fund account, Demat account, PPF,
  NPS, or fixed deposit; or
- cash or another explicitly created account.

This is necessary because recording only an expense or an investment amount
explains *what* happened, but not *where the money came from* or *where it went*.

### 1.2 Asset, liability, and investment accounts

| Classification | Examples | What a positive balance means |
|---|---|---|
| Asset | Bank, cash, wallet | Money available or owned |
| Liability | Credit card, loan | Money owed |
| Investment | MF, Demat, PPF, NPS, FD | Current value of linked holdings |

The account type selected when creating an account determines its
classification.

### 1.3 Sign rules

For an asset account:

```text
Starting balance
+ income
+ transfers received
+ investment sale/withdrawal proceeds received
- expenses
- transfers sent
- investment purchases/deposits funded
+ signed reconciliation adjustments
= FinTrack-calculated balance
```

For a liability account such as a credit card:

```text
Starting amount owed
+ purchases charged to the card
+ transfers sent or cash advances
- payments transferred into the card
+ signed reconciliation adjustments
= FinTrack-calculated amount owed
```

For an investment account:

```text
Starting balance
+ current value of every holding linked to that account
+ signed reconciliation adjustments
= FinTrack-calculated investment-account value
```

Linked holdings are counted inside their investment account. A holding without
an investment account is included separately in Dashboard Net Worth so it is
not lost.

### 1.4 Why transfers are not income or expenses

Moving ₹20,000 from Axis to SBI changes the location of the money but not the
amount you own:

```text
Axis: -₹20,000
SBI:  +₹20,000
Net position change: ₹0
```

Treating this as an expense and income would overstate both spending and
earnings.

### 1.5 Avoiding double counting

A mutual-fund purchase has two linked effects:

```text
Funding bank account: -purchase amount
Mutual-fund account:   +value of acquired holding
```

The holding value is counted through the linked MF account. It is not added a
second time as an unassigned investment.

## 2. Global month controls

The month and year shown in the header control the period used by:

- Dashboard monthly cards;
- Dashboard Income Breakdown;
- Savings Rate Trend ending month;
- Expenses Category Split;
- Expense Trend ending month;
- Income and Flow cards and charts;
- the default Account Ledger “This month” filter; and
- recurring and planning summaries that depend on the selected month.

The left and right arrows move one calendar month backward or forward.

Why it is necessary: one shared period prevents the Dashboard from showing
July while another monthly chart silently shows June.

The Expenses table also has its own Year, Month, Category, and View filters.
Those filters affect the table and summary strip. The Category Split chart
continues to follow the global month control.

## 3. Dashboard

### 3.1 Net Worth

**Meaning:** the current account-led financial position.

```text
Net Worth
= sum of active asset-account balances
+ sum of active investment-account balances
- sum of active liability balances
+ current value of legacy holdings not linked to an investment account
```

Example:

```text
Cash and bank accounts            ₹1,50,000
Investment accounts               ₹2,00,000
Unlinked legacy holding              ₹20,000
Credit-card amount owed             ₹30,000
Net Worth                         ₹3,40,000
```

Why it is necessary: it answers “What do I own after subtracting what I owe?”
It is a present-position value, not monthly income and not lifetime profit.

The subtitle “Calculated from N active accounts” tells you how many active
accounts feed the account portion of this value.

### 3.2 Reporting period

Dashboard flow cards and period charts share one filter:

- **Financial year to date:** April 1 of the current Indian financial year
  through today;
- **Selected month:** the month in the header navigator;
- **Calendar year:** January 1 through December 31 of the header year;
- **All time:** every recorded date; or
- **Custom range:** inclusive From and To dates.

Net Worth is always an as-of-today position and therefore does not change when
the flow period changes.

### 3.3 Income Received

Income is a dated transaction stored in `IncomeTransactions`:

```text
Income Received = Σ income amount where start date ≤ credit date ≤ end date
```

Every row has a source, description, amount, and receiving account. Adding the
row credits that account on the actual received date. Sources include salary,
bonus, freelance, business, interest, dividend, rent, gift, and other income.

Example:

```text
31 Jul 2026  Salary      Axis Salary       ₹2,34,256.22
15 Aug 2026  Freelance   Axis Salary         ₹15,000.00
FY-to-date Income Received                  ₹2,49,256.22
```

Existing legacy monthly income is migrated once to a salary transaction dated
on the last calendar day of its month. This matches the common 28th–31st salary
credit pattern and prevents double counting.

Why it is necessary: multiple sources and receiving accounts cannot be
reconciled accurately using one manually typed monthly total.

### 3.4 Expenses

**Meaning:** sum of expense records dated within the selected Dashboard period.

```text
Expenses = Σ expense amount where start date ≤ expense date ≤ end date
```

The subtitle shows `Expenses ÷ Income Received × 100` when income is positive.

Why it is necessary: this is actual recorded spending, not a budget or
forecast.

### 3.5 Invested and Available Surplus

**Invested** is cash contributed during the selected period:

```text
Invested
= Σ connected or recurring BUY and DEPOSIT transaction amounts in the period
```

Transactions whose source is `opening` are excluded. Their value belongs in
Net Worth, but they are not new contributions made during the reporting period.

**Available Surplus** is period income not used by recorded outflows:

```text
Available Surplus
= Income Received
- Expenses
- Investment BUY and DEPOSIT amounts
- Emergency-fund contributions
```

```text
Surplus Rate % = Available Surplus ÷ Income Received × 100
Investment Rate % = Invested ÷ Income Received × 100
```

Example:

```text
Income                  ₹1,00,000
Expenses                  ₹40,000
Investments               ₹30,000
Emergency contribution     ₹5,000
Available Surplus          ₹25,000
Surplus Rate                  25%
Investment Rate               30%
```

Why it is necessary: an investment is not an expense, but it still uses cash
from the month’s income. Subtracting it here distinguishes money still
unallocated from money deliberately invested.

Negative Available Surplus means recorded outflows exceeded recorded income for the
month. This can be valid if earlier savings funded the difference.

### 3.6 Action items

**Meaning:** number of generated recurring-investment occurrences whose status
is `pending`.

```text
Action item count = number of RecurringOccurrences with status = pending
```

Clicking the card opens Accounts, where pending items can be confirmed or
skipped.

Why it is necessary: recurring rules are expectations, not real transactions.
Review prevents an expected SIP from changing balances when the debit did not
actually happen.

### 3.7 Your financial direction

This sentence states what percentage of period income remains after recorded
expenses and investments. When the result is negative it explains that earlier
balances or missing income funded the difference.

It is a summary of entered data, not financial advice.

### 3.8 Money Allocation

The doughnut divides the selected Dashboard period into:

- each expense category;
- Investments: BUY and DEPOSIT transactions;
- Emergency Fund contributions; and
- Unallocated: income remaining after those items.

```text
Total allocated
= category expenses + investments + emergency contributions

Unallocated = max(0, income - total allocated)

Slice % of allocation = slice amount ÷ total allocated slices × 100

Slice % of income = slice amount ÷ income × 100, when income > 0
```

If outflows exceed income, Unallocated is zero and the other slices can total
more than 100% of income. The visible legend always uses percentage of
allocation and therefore remains defined and totals approximately 100% even
when period income is zero. The tooltip includes percentage of income only when
income has been recorded.

Why it is necessary: it shows where the selected month’s income was directed,
not merely where expenses were spent.

### 3.9 Income Sources

The doughnut groups dated credits by their `source` field:

```text
Source total = Σ income credits with that source in the selected period
```

Why it is necessary: salary, freelance work, interest, dividends, and other
sources can be understood independently without losing the receiving-account
trail.

### 3.10 Monthly Money Flow

For each of the last 12 calendar months ending at the header-selected month,
the grouped chart shows Income, Expenses, and Invested. A line shows:

```text
Monthly Surplus = Income - Expenses - Invested - Emergency contributions
```

Months with no activity remain visible as zero, which prevents gaps from making
the trend look better than it is.

### 3.11 Expense Categories

This horizontal bar chart defaults to **Variable** and ranks expense categories
in the Dashboard period. Its selector supports Variable, Fixed, and All:

```text
Category spend
= Σ expenses matching category, selected nature, and Dashboard date range
```

Clicking a bar opens the Expenses section with both that category and nature
selected. The choice is remembered locally in the browser. This default keeps a
large rent payment from obscuring controllable categories without removing rent
from total expenses. Fixed and Variable period totals remain visible below the
chart regardless of its selected view.

### 3.12 Net-Worth History

This chart merges monthly rows from two worksheets:

- `NetWorthAuto` contains the current-month snapshot calculated automatically
  from live accounts, liabilities, and holdings;
- `NetWorth` contains optional manual history and overrides.

If both worksheets contain the same month, the manual `NetWorth` row wins.

```text
Snapshot assets
= cash + bank + investments + retirement + other assets

Snapshot liabilities
= loans + credit cards + other liabilities

Snapshot net worth = snapshot assets - snapshot liabilities
```

The Dashboard Net Worth card is always live. The current automatic snapshot is
updated when FinTrack loads and when recorded balances change. When the month
changes, the previous monthly row remains as history and a new current-month
row begins.

Why it is necessary: saving the observed value each month creates a genuine
growth series. Today’s account balances cannot reconstruct what every asset
was worth in an earlier month.

The chart displays Assets, Liabilities, and Net Worth as separate series.

### 3.13 Recent Income and Expenses

Shows up to seven dated income and expense records from the Dashboard period,
newest first. Income is positive and includes its receiving account; expenses
are negative and include their category.

Why it is necessary: it provides a quick check of the latest recorded spending.

### 3.14 Investment Snapshot

Shows up to the first five stored holdings with:

```text
Current Value = units currently held × current stored price

Return %
= (current value - remaining cost basis)
  ÷ remaining cost basis × 100
```

Why it is necessary: it gives a compact view of current portfolio value and
unrealised movement without opening the full Investments section.

## 4. Expenses

### 4.1 Add Expense fields

| Label | Meaning and effect | Why it is necessary |
|---|---|---|
| Date | Actual payment date; determines month and ledger order | Places spending in the correct reporting period |
| Amount | Positive amount spent | Drives expense totals and debits the selected account |
| Description | Merchant or purpose | Makes the transaction identifiable |
| Category | Food & Takeaway, Grocery, Vegetables & Fruits, Travel, Housing, Parents Fund, Health, Personal Care, Subscriptions & Software, Entertainment, Utilities, Shopping, or Other | Drives category charts and analysis |
| Expense Nature | Fixed or Variable | Separates recurring commitments from spending that changes with usage or choice |
| Payment Method | UPI, credit card, debit card, cash, or bank transfer | Describes the payment rail; it does not choose the account |
| Paid From Account | Account whose balance is affected | Connects spending to the account ledger |

During the category upgrade, an existing Grocery row moves to Vegetables &
Fruits only when its description starts with an unmistakable produce label such
as Vegetable, Veggies, Fruit, or Produce. The category reclassification does
not alter the date, amount, expense nature, paying account, or ledger effect.
Ambiguous Grocery rows remain Grocery.

The account selection—not the Payment Method—controls the balance. For example,
selecting Payment Method = UPI and Paid From Account = Axis debits Axis.

For a bank/cash/wallet account:

```text
Account effect = -expense amount
```

For a credit-card account:

```text
Amount owed effect = +expense amount
```

### 4.2 Expense Trend

For each of the 12 months ending at the globally selected month:

```text
Fixed monthly amount = Σ fixed expense amounts in that month
Variable monthly amount = Σ variable expense amounts in that month
Monthly total = Σ all expense amounts in that month
Transaction count = number of expense rows in that month
```

The selector is synchronized with the expense-category pie chart and Dashboard
expense-category chart:

- **Variable** shows only the Variable monthly line and Variable transaction
  count.
- **Fixed** shows only the Fixed monthly line and Fixed transaction count.
- **All** shows stacked Fixed and Variable bars, the combined total line, and
  the total transaction count.

Why it is necessary: it shows whether a spending increase came from recurring
commitments or controllable variable activity.

### 4.3 Category Split

Uses expenses in the globally selected month and defaults to Variable. The
selector can show Fixed or All:

```text
Category amount = Σ selected-month expenses matching selected nature and category
Category share % = category amount ÷ all selected-month expenses matching selected nature × 100
```

Why it is necessary: it identifies the categories responsible for the month’s
spending without allowing rent to dominate the default controllable-spending
view. Fixed and All remain one click away.

### 4.4 Summary strip

**Total Expenses**

```text
Total Expenses = Fixed Expenses + Variable Expenses
Fixed Expenses = Σ fixed amounts matching Year, Month, and Category
Variable Expenses = Σ variable amounts matching Year, Month, and Category
```

The Nature table filter does not hide either summary amount; this keeps the two
types directly comparable. Selecting All Years or All Months broadens the
summary period.

**Transactions**

```text
Transactions = number of filtered expense records
```

**Variable Avg / Day**

For a selected current month:

```text
Variable average per day = filtered Variable expenses ÷ today’s day number
```

For a selected past month:

```text
Variable average per day = filtered Variable expenses ÷ days in that month
```

For a broad date range:

```text
Variable average per day
= filtered Variable expenses
  ÷ inclusive days between earliest and latest filtered Variable entry
```

**Largest Variable Expense**

The highest single filtered Variable expense and its category. Fixed expenses
such as rent or regular parental support are excluded.

**Variable Projected Month-End**

For the current month:

```text
Variable Projected Month-End
= Variable spending so far ÷ elapsed day number × days in month
```

The projection is shown only when one specific current month is selected. For a
past month or broad period, it displays a dash because a run-rate projection
would be misleading.

Why these labels are necessary: total shows scale, count shows frequency,
variable average shows controllable pace, largest shows the biggest variable
purchase, and the variable-only projection warns about the likely discretionary
month-end result without repeatedly extrapolating fixed commitments.

### 4.5 Filters

- **Year** limits the table and summary strip to a year.
- **Month** limits them to a calendar month.
- **Nature** limits the table to Fixed, Variable, or All. The summary strip still
  displays both nature totals for comparison.
- **View: Group by Month** groups an all-period view and adds month subtotals.
- **View: Flat List** shows one continuous list.
- **Category tabs** limit the table and summary strip to one category.

Filters do not delete or alter data.

## 5. Investments

### 5.1 Two kinds of investment calculation

FinTrack uses different calculations for:

1. unit-based holdings: stocks, foreign stocks, mutual funds, gold, and NPS;
2. balance-based holdings: PPF and fixed deposits.

### 5.2 Unit-based holdings

For every BUY:

```text
Units held += bought units
Cost basis += bought units × buy price
```

For every SELL, FinTrack uses moving-average cost:

```text
Average cost before sale = cost basis ÷ units held
Cost removed = units sold × average cost
Realised gain = units sold × (sale price - average cost)
Units held -= units sold
Cost basis -= cost removed
```

Current position:

```text
Current Value = units held × current stored price
Unrealised Gain/Loss = current value - remaining cost basis
Return % = unrealised gain/loss ÷ remaining cost basis × 100
```

Example:

```text
BUY 10 units @ ₹100         Cost ₹1,000
BUY  5 units @ ₹120         Cost   ₹600
Units held                         15
Cost basis                     ₹1,600
Average cost                  ₹106.67

Current price                    ₹130
Current value                  ₹1,950
Unrealised gain                  ₹350
Return                         21.88%
```

If 3 units are then sold at ₹140:

```text
Cost removed = 3 × ₹106.67 ≈ ₹320
Realised gain = 3 × (₹140 - ₹106.67) ≈ ₹100
Remaining units = 12
Remaining cost basis ≈ ₹1,280
```

Why moving-average cost is necessary: selling units should remove their cost,
not their selling value. Otherwise the remaining cost basis and gain would be
incorrect.

### 5.3 Balance-based holdings: PPF and FD

Transaction types have these effects:

```text
Deposited = Σ DEPOSIT amounts
Interest = Σ INTEREST amounts
Withdrawn = Σ WITHDRAWAL amounts
Adjustments = signed Σ ADJUSTMENT amounts

Cost Basis = max(0, Deposited - Withdrawn)
Current Balance = Deposited + Interest - Withdrawn + Adjustments
Displayed Gain/Loss = Current Balance - Cost Basis
```

Example:

```text
Deposits       ₹1,00,000
Interest           ₹8,000
Withdrawal        ₹20,000
Adjustment          -₹500
Current Balance    ₹87,500
Cost Basis         ₹80,000
Displayed gain      ₹7,500
```

Why it is necessary: PPF and FD are naturally understood as account balances,
not exchange-traded units.

### 5.4 Add Investment fields

| Label | Meaning |
|---|---|
| Investment Type | Selects calculation type and compatible investment account |
| How should this investment enter FinTrack? | Chooses a connected purchase/deposit or a prior opening position |
| Asset Ticker / Code | Short identifier such as RELIANCE or a fund code |
| Asset Name | Human-readable company, scheme, or deposit name |
| Find Mutual Fund Scheme | Searches the local catalogue by fund/AMC/plan/option and stores the selected MFapi scheme code automatically |
| Market Cap | Descriptive classification for market investments |
| Risk Level | User-selected descriptive risk label |
| Units / Shares | Quantity initially acquired |
| Buy Price / Average Cost | Purchase price for a new transaction or remaining average cost for a prior position |
| Current Price | Latest stored price or NAV per unit |
| Purchase Date / Position As Of Date | Transaction date for a new purchase or cutover date for a prior position |
| Investment Account | MF, Demat, PPF, NPS, gold, or FD account that contains the holding |
| Paid From Account | Bank/cash account funding a new purchase; hidden for a prior position |

Initial unit-based investment:

```text
Initial purchase amount = units × buy price
```

That amount reduces the funding account. The holding’s current value is counted
inside the selected investment account.

### 5.5 Prior investments / opening positions

Use **Prior investment / opening position** for a holding that existed before
the user began connected account tracking.

For a unit-based holding, enter:

- units currently held;
- remaining average cost per unit;
- current price/NAV; and
- the date on which this becomes the FinTrack opening position.

```text
Opening cost basis = current units × remaining average cost
Opening current value = current units × current price
Funding-account effect = ₹0
Monthly invested effect = ₹0
```

For an existing PPF or FD, enter:

- principal/remaining cost basis;
- current statement balance; and
- the position as-of date.

FinTrack stores the principal and any difference required to establish the
opening current balance as explicit opening-position records. For PPF, a
positive difference is opening accumulated interest. For FD, the difference
remains an opening-value adjustment unless interest is explicitly credited.
Neither record debits a bank account.

```text
Opening principal = entered principal/cost basis
PPF opening accumulated interest = current balance - opening principal
Opening current balance = principal + opening interest/value adjustment
```

Opening-position transactions carry `source = opening`, appear clearly in the
holding and investment-account history, and never count as the selected
month's new investment outflow. Later BUY, SELL, DEPOSIT, INTEREST, and
WITHDRAWAL transactions use normal connected accounts.

Why it is necessary: historical holdings establish what the user already owns;
they are not purchases made from today's bank balance. This avoids fake bank
offsets and prevents historical contributions from distorting current-month
savings.

### 5.6 Summary cards

**Total Invested**

```text
Total Invested = Σ remaining cost basis of all holdings
```

This is not lifetime contributions because cost basis is reduced when units or
principal are sold/withdrawn.

**Current Value**

```text
Current Value = Σ current value/current balance of all holdings
```

**Total Gain / Loss**

```text
Total Gain/Loss = total current value - total remaining cost basis
```

Realised gains from completed sales are not added to this headline value.

**Overall Return**

```text
Overall Return %
= total gain/loss ÷ total remaining cost basis × 100
```

This is a cost-weighted portfolio return, not the arithmetic average of each
holding’s return.

Why these labels are necessary: cost answers how much principal remains
invested; value answers what it is worth now; gain and return show the
difference in rupees and percentage.

### 5.7 Portfolio Allocation

```text
Category allocation value = Σ current values in that investment category
```

Why it is necessary: it shows concentration across stocks, mutual funds, gold,
PPF, NPS, and FD.

### 5.8 Holdings Value chart

For each month-end in the 12 months ending at the selected month, transactions
up to that date determine units and cost basis.

Important: historical positions are valued using the holding’s *currently
stored* price. The chart does not fetch historical market prices or historical
NAVs. Therefore it is a position/cost history comparison, not a true historical
market-value chart.

### 5.9 Stocks & Mutual Funds and Other Investments tiles

Each tile shows:

```text
Invested = remaining cost basis for holdings in the tile
Current Value = current values for those holdings
P&L = current value - invested
Holdings = number of stored holding records
```

Category pills show current value for each category inside the tile.

### 5.10 Holding table labels

| Label | Calculation |
|---|---|
| Units | Current units after BUY minus SELL |
| Buy Price | Stored average purchase price |
| Current Price | Latest stored price or NAV |
| Invested | Remaining moving-average cost basis |
| Current Value | Current units × current price |
| Gain / Loss | Current value − invested |
| Return % | Gain/loss ÷ invested × 100 |

The expanded transaction history shows each BUY or SELL:

```text
Transaction Total = units × transaction price
```

It also shows total bought units/cost, sold units/revenue, realised P&L, and net
units held.

### 5.11 Buy More and Sell

**Buy More** adds a dated BUY transaction:

```text
Purchase amount = units × price
Funding account effect = -purchase amount
Holding units and cost basis increase
```

**Sell / Redeem** adds a dated SELL transaction. Gross and net proceeds are
kept separate:

```text
Gross proceeds = units × sale price or applicable NAV
Net proceeds = gross proceeds - charges / exit load / taxes
Realised P&L = net proceeds - moving-average cost removed
Holding units and cost basis decrease using moving-average cost
```

For a mutual fund, the net proceeds credit the bank linked to the MF account on
the entered Bank Credit Date. A user can redeem by units or by amount. When an
amount is entered, `units redeemed = amount ÷ applicable NAV`.

For stocks, the net proceeds first credit the linked Demat / Brokerage account
as broker cash on the settlement date. They do not immediately appear in the
bank account. **Withdraw broker cash** prepares an internal transfer from the
Demat account to its linked settlement bank. Broker cash can also fund a later
purchase without a false bank movement.

FinTrack prevents selling more units than are currently held, prevents charges
from exceeding proceeds, and prevents withdrawing or reinvesting more broker
cash than is available.

### 5.12 Linked settlement account and broker cash

Demat and mutual-fund accounts can store one **Linked Settlement Account**.
This is normally the registered bank account used by the broker, Demat account,
or mutual-fund folio. It is an account relationship only; linking it does not
move money.

```text
MF redemption: MF holding → linked bank
Stock sale: stock holding → Demat broker cash
Broker withdrawal: Demat broker cash → linked bank (internal transfer)
```

Broker cash is derived from the Demat cash ledger:

```text
Broker cash
= Demat starting cash
+ transfers into Demat
+ net stock-sale proceeds assigned to Demat
- purchases funded from Demat
- transfers withdrawn from Demat
+ reconciliation adjustments
```

Why it is necessary: stock-sale proceeds may remain available with the broker
and be reinvested without ever reaching the bank, while mutual-fund redemption
proceeds normally credit the registered bank directly.

### 5.13 Current price and NAV

Price refresh updates the holding’s current stored price:

- stocks use the Yahoo Finance price endpoint;
- mutual funds use the current/latest entry from mfapi.in when a scheme code is
  available.

Current price affects valuation and unrealised gain. It does not create a cash
transaction.

### 5.14 Offline mutual-fund catalogue

The mutual-fund picker searches scheme metadata stored in the local SQLite
cache at `cache/market_data.sqlite`. The cache contains identifiers and names,
not every scheme's complete NAV history, and therefore does not enlarge the
user's `data.xlsx` workbook.

- On an empty cache, FinTrack attempts a background catalogue download.
- **Refresh catalogue** explicitly updates the cache when internet is available.
- Offline searches use the last successfully downloaded catalogue.
- Selecting a scheme fills its name/code and requests the latest NAV.
- A successful NAV response is cached with its NAV date.
- If that request later fails, the saved NAV is returned with an offline status.
- With no matching cached scheme, manual fund name, units, cost NAV, and current
  NAV remain available; the scheme can be verified later.

Why it is necessary: internet availability should affect price freshness, not
the ability to record or inspect the user's own financial transactions.

## 6. Income and Flow

### 6.1 This Month Income

Sum of `IncomeTransactions` whose credit date falls in the header-selected
month. Use **Add Income** to record another source. The Income Transactions
table provides the audit trail and allows an incorrect credit to be deleted;
deletion also removes it from the receiving account balance.

### 6.2 This Month Expenses

```text
This Month Expenses = Σ expenses dated in selected month
Expense % of income = expenses ÷ income × 100
```

### 6.3 Invested This Month

```text
Invested This Month
= Σ BUY and DEPOSIT transaction amounts dated in selected month

Investment % of income = invested ÷ income × 100
```

SELL and WITHDRAWAL transactions are not counted as monthly investment outflow.

### 6.4 Net Saved

```text
Net Saved
= income - expenses - invested - emergency contributions

Savings Rate = net saved ÷ income × 100
```

### 6.5 Monthly Allocation

For every saved income month in the 12-month window:

```text
Expense % = expenses ÷ income × 100
Invested % = investments ÷ income × 100
Emergency % = emergency contributions ÷ income × 100
Unallocated % = max(0, net saved) ÷ income × 100
```

The line uses the absolute monthly income amount.

Why it is necessary: it compares allocation behavior between months even when
income changes.

### 6.6 Monthly Savings Log

| Column | Calculation |
|---|---|
| Month | Month stored in `SavingsHistory` |
| Income | Sum of dated income credits in the month |
| Expenses | Sum of actual expense entries for the month |
| Invested | Sum of BUY and DEPOSIT amounts for the month |
| Emergency | Sum of legacy emergency-fund contributions for the month |
| Net Saved | Income − Expenses − Invested − Emergency |
| Savings Rate | Net Saved ÷ Income × 100 |
| Invest Rate | Invested ÷ Income × 100 |

Every column is derived from its underlying dated transactions. `SavingsHistory`
is retained as the monthly summary layer, not as a second editable income
source.

Why it is necessary: one source of truth prevents a monthly total and its
account credits from disagreeing.

## 7. Accounts

### 7.1 Top account totals

**Cash & Bank**

```text
Cash & Bank = Σ FinTrack balances of active non-investment asset accounts
```

**Investment Accounts**

```text
Investment Accounts = Σ FinTrack values of active investment accounts
```

**Amount Owed**

```text
Amount Owed = Σ FinTrack balances of active liability accounts
```

**Net Position**

```text
Net Position = Cash & Bank + Investment Accounts - Amount Owed
```

Why these labels are necessary: they separate spendable money, invested money,
and debt before combining them.

### 7.2 Add Account fields

| Label | Meaning and purpose |
|---|---|
| Account label | Friendly unique name such as Axis Salary or SBI Investment |
| Institution | Bank, broker, AMC, post office, or provider |
| Account type | Determines asset, liability, or investment behavior |
| Purpose | Helps FinTrack select defaults for Salary, Investment, Spending, or Savings |
| Tracking start date | Earliest date from which linked activity is included |
| Balance at tracking start | Real balance/amount owed already present at the start of that date |
| Current bank/card balance | Latest manually observed external balance |
| Credit limit | Reference limit for credit-card/loan accounts; it does not alter the balance |

Never store an account number, password, PIN, OTP, or banking credential.

For an investment account, normally keep the starting balance at zero when all
opening holdings have been entered in Investments. Entering both an investment
account starting balance and the same opening holdings would count that value
twice.

### 7.3 FinTrack-calculated balance

For an asset account:

```text
FinTrack balance
= starting balance
+ monthly income assigned to account
- expenses assigned to account
- transfers sent
+ transfers received
- funded BUY/DEPOSIT transactions
+ net received SELL/WITHDRAWAL transactions on their settlement/credit date
+ reconciliation adjustments
```

Only transactions on or after the account’s Tracking Start Date are included.

For an investment account, the linked holdings’ current values are added.

For a liability, transaction directions are reversed so purchases increase the
amount owed and payments reduce it.

### 7.4 Current bank balance / Current statement amount owed

This is manually entered from the bank, card, or provider. FinTrack does not
derive it.

Why it is necessary: it is the independent real-world number used to test
whether the tracker is complete.

Until this value is entered, it defaults to zero and the Unexplained Gap is not
a useful reconciliation result.

### 7.5 Unexplained gap

```text
Signed gap = current bank/card value - FinTrack-calculated value
Displayed unexplained gap = absolute value of signed gap
```

- Positive signed gap: money/value is missing from FinTrack.
- Negative signed gap: FinTrack contains more money/value than the institution
  shows.
- Zero: the account reconciles.

Example:

```text
FinTrack calculates       ₹56,256.22
Bank shows               ₹4,55,628.00
Signed gap               ₹3,99,371.78
Displayed gap            ₹3,99,371.78
```

This suggests that an opening balance or an old inflow is missing. It does not
automatically mean the difference is income.

### 7.6 Emergency Reserve

The Emergency Reserve card designates part or all of assets already recorded in
FinTrack. It does not create an account, transfer money, add an investment
transaction, or change net worth.

| Label | Calculation and purpose |
|---|---|
| Total Emergency Reserve | **Available Now + Needs Redemption + Locked / Restricted**; this is the amount used for progress and coverage |
| Target | Desired total emergency reserve entered by the user |
| Target Gap | `max(0, Target - Total Emergency Reserve)` |
| Available Now | Effective allocations that can be spent immediately, normally bank, cash, or wallet balances |
| Needs Redemption | Effective allocations that require a withdrawal or sale, such as an FD or mutual fund |
| Locked / Restricted | Designated value that is difficult or restricted to access, such as PPF/NPS; it remains included in the target and coverage |
| Allocate Asset | Links an existing account or holding to the emergency purpose without changing that asset |

For every allocation:

```text
Source Value = current FinTrack balance, for an account
Source Value = units × current price/NAV, for a holding

Requested Allocation = Source Value, for Entire current value mode
Requested Allocation = entered amount, for Fixed amount mode

Effective Allocation = min(Requested Allocation, Source Value)
```

**Entire current value** follows future balance or market-value changes.
**Fixed amount** keeps the requested amount constant, but cannot claim more than
the asset currently contains. Each account or holding can be allocated only
once, preventing duplicate designation of the same value.

```text
Total Emergency Reserve
= Σ Available Now + Σ Needs Redemption + Σ Locked / Restricted
Target Gap = max(0, Target - Total Emergency Reserve)
Progress % = min(100, Total Emergency Reserve ÷ Target × 100)
Coverage Months = Total Emergency Reserve ÷ average essential monthly expenses
```

Essential monthly expenses are the average of Food, Grocery, Vegetables &
Fruits, Travel, Housing, Parents Fund, Health, and Utilities over the latest
three months relative to the selected month. If that average is zero, coverage
displays **Not set**.

Legacy `EFContributions` rows remain in historical monthly allocation and
savings calculations for compatibility. Their accumulated balance is not added
to the live Emergency Reserve; allocate the real account or holding that
contains the money instead. This prevents the same wealth from being counted
twice.

## 8. Internal transfers

### 8.1 Fields

- **Date:** when money moved.
- **From account:** account debited.
- **To account:** account credited or liability paid.
- **Amount:** positive transfer amount.
- **Purpose:** optional explanation.

Asset-to-asset example:

```text
Transfer Axis → SBI ₹25,000
Axis effect: -₹25,000
SBI effect:  +₹25,000
Income effect: ₹0
Expense effect: ₹0
Net-position effect: ₹0
```

Credit-card payment example:

```text
Transfer Axis Bank → Credit Card ₹10,000
Axis bank balance:   -₹10,000
Credit-card amount owed: -₹10,000
```

Why it is necessary: one transfer entry keeps both account ledgers synchronized
and avoids separately entering a debit and credit.

### 8.2 Period filter

The Internal Transfers tile can show transfers for:

- **Selected month:** the month and year in the header navigator;
- **Calendar year:** January through December of the header year; or
- **Financial year:** 1 April through 31 March containing the selected month.

All matching transfers are sorted newest first inside the fixed-height,
scrollable list. Changing this filter affects display only; it never changes
account balances or transfer records.

## 9. Account ledger

### 9.1 Account selector

Chooses which account’s linked activity is displayed.

### 9.2 Period filter

- **This month:** dates within the globally selected month.
- **Financial year:** 1 April through 31 March containing the selected month.
- **All time:** every included entry on or after the account’s tracking start
  date.

### 9.3 Transaction type filter

- **Income:** individual dated income credits.
- **Expenses:** expense records.
- **Transfers:** transfer in and transfer out.
- **Investments:** purchases, deposits, sales, withdrawals, and interest.
- **Opening positions:** prior holdings introduced without a funding-account movement.
- **Adjustments:** account reconciliation corrections.

### 9.4 Sort and search

- **Newest first / Oldest first** changes display order only.
- **Search transactions** matches transaction type and description.

### 9.5 Money in

```text
Money in = Σ positive ledger amounts visible after all filters
```

### 9.6 Money out

```text
Money out = absolute value of Σ negative ledger amounts visible after filters
```

### 9.7 Net movement

```text
Net movement = Money in - Money out
```

These three values describe the filtered period, not necessarily the account’s
entire history.

### 9.8 FinTrack balance

Shows the current calculated account balance using all included transactions,
regardless of the ledger’s period/type/search filters.

Why it is necessary: filtering the table should not make the actual account
balance appear to change.

### 9.9 Ledger table columns

| Column | Meaning |
|---|---|
| Date | Effective transaction date |
| Transaction | Income, Expense, Transfer, Investment, or Adjustment subtype |
| Details | Merchant, holding, source/destination account, or adjustment reason |
| Money In | Positive effect on the selected account |
| Money Out | Negative effect on the selected account |
| Balance | Starting balance plus every ledger entry through that row |

For a normal bank account, the last all-time running balance should match the
FinTrack balance.

For a market-linked investment account, the ledger running balance reflects
transaction amounts/cost movements, while the FinTrack balance uses current
holding values. Market movement can therefore make them differ.

## 10. Review Account Balance

### 10.1 FinTrack calculates

The balance derived from starting position and linked records.

### 10.2 Your bank/card shows

The manually entered real-world balance.

### 10.3 Unexplained gap

The absolute difference between those two values. The dialog also indicates
whether value is missing from or extra in FinTrack.

### 10.4 Update actual balance

Use this whenever checking a fresh statement or banking app balance. It changes
only the comparison number; it does not alter the ledger.

### 10.5 Correct starting position

Use this when the account already contained money or debt before tracking
began.

Fields:

- **Tracking start date:** first date whose transactions FinTrack should use.
- **Balance at the start of that date:** real balance before that date’s new
  tracked activity.

Example:

```text
Tracking starts: 1 July
Balance already in Axis at start of 1 July: ₹3,99,371.78
July salary and transactions: recorded normally
```

Why it is necessary: pre-existing money is neither July salary nor a fake
transfer. It is the account’s starting position.

### 10.6 Add exceptional adjustment

Use only when the real balance is known but the missing original transaction
cannot reasonably be recovered.

```text
New FinTrack balance = old FinTrack balance + signed adjustment
```

- positive adjustment increases an asset/investment balance or amount owed;
- negative adjustment decreases it.

Every adjustment stores:

- account;
- effective date;
- signed amount;
- reason; and
- creation timestamp.

It appears in the Account Ledger and can be filtered as Adjustments.

Why it is necessary: a transparent correction is safer than silently changing
history. Ordinary income, expenses, transfers, and investments should still be
entered using their normal transaction types.

## 11. Recurring investments

### 11.1 Rule fields

| Label | Meaning |
|---|---|
| Rule name | Human-readable SIP/deposit name |
| Investment holding | Holding that will receive the confirmed transaction |
| Paid from account | Funding account that will be debited |
| Frequency | Monthly, quarterly, or yearly |
| Due day | Scheduled calendar day |
| Expected amount | Default expected contribution |
| Start date | First date from which schedules can be generated |

If a due day does not exist in a month, the last day of that month is used.
For example, day 31 becomes 28 or 29 in February.

### 11.2 Catch-up when the server was not running

Whenever FinTrack opens or **Check now** is used:

1. it generates every scheduled date from the rule’s start date through today;
2. each occurrence uses `rule ID + scheduled date` as its unique ID;
3. existing occurrences are not duplicated; and
4. missing occurrences become Pending.

Why it is necessary: a local server can be off for months without losing the
expected review dates.

### 11.3 Expected amount versus real transaction

The rule amount is only a default expectation. It does not change any account
or holding balance.

```text
Recurring rule = expectation
Pending occurrence = review task
Confirmed occurrence = actual investment and ledger transaction
```

### 11.4 Confirm

Confirmation records:

- actual transaction date;
- actual amount;
- NAV or purchase price; and
- units allotted.

For a unit-based investment:

```text
Actual amount ≈ units × NAV/price
```

FinTrack allows a tolerance of the larger of ₹1 or 0.1% of the actual amount.

For PPF/FD, confirmation creates a DEPOSIT with:

```text
Units = 1
Price = actual deposit amount
```

Confirmation debits the funding account and updates the holding.

The scheduled date remains the reference date for the pending item. The current
interface defaults the confirmation date to that scheduled date, but allows it
to be edited.

### 11.5 Skip

Marks the occurrence `skipped` and creates no investment or account
transaction.

Why it is necessary: a missed SIP should remain historically visible without
pretending money moved.

### 11.6 Pause / Resume

- **Pause:** stops new pending occurrences from being generated.
- **Resume:** allows generation again according to the original schedule.

Existing confirmed or skipped occurrences are retained.

### 11.7 NAV behavior

The current price refresh obtains the latest mutual-fund NAV for valuation.
Recurring confirmation currently asks for the purchase NAV/price and units.
It does not yet automatically fetch the historical NAV for the scheduled date.

Therefore, if a SIP was deducted on the 7th and confirmed on the 17th, keep the
actual transaction date as the 7th and enter the NAV/units allotted for the
7th unless the transaction statement shows a different effective date.

## 12. Workbook storage

`data.xlsx` is the source of truth.

| Worksheet | Main responsibility |
|---|---|
| Accounts | Account setup, starting position, current bank/card comparison, and MF/Demat settlement-bank link |
| IncomeTransactions | Dated income source, description, amount, and receiving account |
| Transfers | Two-sided internal account movements |
| ReconciliationAdjustments | Dated signed corrections with reasons and creation time |
| Expenses | Expense records, category, fixed/variable nature, and paying account |
| Investments | Holding identity, category, current price, and investment account |
| Transactions | BUY, SELL, DEPOSIT, INTEREST, WITHDRAWAL, and investment ADJUSTMENT history, including source, settlement date, and charges |
| SavingsHistory | Derived monthly income, expense, investment, emergency, and surplus summary |
| RecurringRules | SIP/deposit schedule definitions |
| RecurringOccurrences | Pending, confirmed, and skipped scheduled events |
| EmergencyFund | Emergency-reserve target |
| EmergencyAllocations | Links existing accounts/holdings to a full or fixed emergency amount and its liquidity |
| EFContributions | Historical emergency contributions retained for compatibility; not part of live reserve value |
| NetWorth | Optional manual monthly net-worth history and overrides |
| NetWorthAuto | Automatically captured monthly account-based net worth |
| Budgets / RecurringBills / CashFlow | Legacy planning data retained for compatibility |

Why separate worksheets are necessary: an account is a long-lived entity,
while an expense, transfer, or investment trade is an event. Keeping them
separate permits recalculation and audit without duplicating balances.

Do not keep `data.xlsx` open in Excel while FinTrack is saving. FinTrack creates
rolling backups before workbook writes and schema migrations.

## 13. Complete examples

### 13.1 New July tracking with money already in Axis

Suppose Axis had ₹3,99,371.78 at the start of 1 July.

July activity:

```text
Starting balance             ₹3,99,371.78
Salary income                +₹1,00,000.00
Transfer to SBI                -₹40,000.00
Expenses from Axis             -₹25,000.00
FinTrack balance             ₹4,34,371.78
```

If the bank shows ₹4,32,371.78:

```text
Signed gap = ₹4,32,371.78 - ₹4,34,371.78 = -₹2,000
```

First search for a missing ₹2,000 expense or transfer. If the original event
cannot be recovered, add a `-₹2,000` exceptional adjustment with a clear reason.

### 13.2 Mutual-fund SIP

```text
SIP amount                         ₹10,000
NAV on effective transaction date  ₹50
Units allotted                     200
```

Effects:

```text
Funding bank account             -₹10,000
MF holding units                     +200
MF cost basis                    +₹10,000
```

If current NAV becomes ₹55:

```text
Current value = 200 × ₹55 = ₹11,000
Unrealised gain = ₹11,000 - ₹10,000 = ₹1,000
Return = ₹1,000 ÷ ₹10,000 × 100 = 10%
```

### 13.3 Credit-card purchase and payment

```text
Opening amount owed               ₹12,000
New card expenses                  +₹8,000
Payment from bank                 -₹15,000
Closing amount owed                ₹5,000
```

The ₹15,000 payment is an internal transfer from the bank account to the credit
card. It is not another expense because the purchases were already categorized
when charged.

### 13.4 Why account net position remains correct after investing

Before purchase:

```text
Bank balance                     ₹1,00,000
MF value                                  ₹0
Net position                     ₹1,00,000
```

After investing ₹20,000 at unchanged NAV:

```text
Bank balance                       ₹80,000
MF current value                   ₹20,000
Net position                     ₹1,00,000
```

If the MF later rises to ₹22,000:

```text
Net position = ₹80,000 + ₹22,000 = ₹1,02,000
```

The ₹2,000 increase is investment value movement, not salary or a transfer.

## 14. Important current limitations

These are current implementation details that matter when interpreting values:

1. Dashboard Net Worth is live and account-based. Net-Worth History records one
   automatic observation per month; it cannot recreate months from before the
   automatic snapshots existed without manual history.
2. The Holdings Value chart filters transactions historically but values those
   historical units using the currently stored price; it is not true historical
   valuation.
3. Current mutual-fund NAV can be refreshed, but recurring confirmation does
   not yet automatically retrieve historical NAV for the due date.
4. Current bank/card balance is manually entered. FinTrack does not connect to
   a bank statement feed.
6. The displayed Unexplained Gap is absolute. The Review Account Balance dialog
   identifies whether FinTrack is lower or higher.
7. “Total Invested” means remaining cost basis, not total contributions ever
   made. Sold or withdrawn cost is removed.
8. Realised sale gains are shown in a holding’s transaction summary but are not
   added to the investment headline Total Gain/Loss.
9. Legacy budget, recurring-bill, emergency-contribution, net-worth snapshot,
   and cash-flow worksheets remain supported. Their old input panels are hidden;
   the asset-linked Emergency Reserve is available in Accounts.
10. The current bank/card comparison does not yet store a separate “balance as
    of” date. Update it when performing a reconciliation so it represents the
    latest balance being compared.

When a displayed number is surprising, check in this order:

1. selected month and filters;
2. account assignment;
3. transaction date;
4. transaction type and sign;
5. tracking start date and starting balance;
6. linked investment account;
7. current price/NAV; and
8. reconciliation adjustments.
