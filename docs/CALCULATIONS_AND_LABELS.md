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

### 3.2 Monthly Income

**Meaning:** income entered for the selected calendar month in
`SavingsHistory`.

```text
Monthly Income = income value saved for the selected month
```

Clicking the amount lets you create or edit the selected month’s income. An
active account with Purpose = Salary is required, and the income is assigned to
that account.

The “vs last month” amount is:

```text
Selected month income - previous month income
```

Why it is necessary: monthly income is the denominator for savings,
investment, and spending rates.

Important: income is currently stored as one monthly amount. In the account
ledger it is represented on the first day of that month even if salary was
actually credited on the 28th–31st.

### 3.3 Monthly Expenses

**Meaning:** sum of expense records dated within the selected month.

```text
Monthly Expenses = Σ expense amount for selected YYYY-MM
```

The percentage comparison is:

```text
Expense change %
= (selected month expenses - previous month expenses)
  ÷ previous month expenses × 100
```

If the previous month is zero, the displayed change defaults to 0.0%.

Why it is necessary: this is actual recorded spending, not a budget or
forecast.

### 3.4 Net Savings

**Meaning:** the selected month’s income not used by recorded outflows.

```text
Net Savings
= Monthly Income
- Monthly Expenses
- Investment BUY and DEPOSIT amounts
- Emergency-fund contributions
```

```text
Savings Rate % = Net Savings ÷ Monthly Income × 100
Investment Rate % = Investment BUY/DEPOSIT amount ÷ Monthly Income × 100
```

Example:

```text
Income                  ₹1,00,000
Expenses                  ₹40,000
Investments               ₹30,000
Emergency contribution     ₹5,000
Net Savings               ₹25,000
Savings Rate                  25%
Investment Rate               30%
```

Why it is necessary: an investment is not an expense, but it still uses cash
from the month’s income. Subtracting it here distinguishes money still
unallocated from money deliberately invested.

Negative Net Savings means recorded outflows exceeded recorded income for the
month. This can be valid if earlier savings funded the difference.

### 3.5 Action items

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

### 3.6 Your monthly financial direction

This sentence combines:

- the selected month’s Savings Rate;
- the percentage by which spending is higher or lower than the previous month;
  and
- the number of active accounts feeding FinTrack.

It is a summary of entered data, not financial advice.

### 3.7 Income Breakdown

The doughnut divides the selected month into:

- each expense category;
- Investments: BUY and DEPOSIT transactions;
- Emergency Fund contributions; and
- Unallocated: income remaining after those items.

```text
Total allocated
= category expenses + investments + emergency contributions

Unallocated = max(0, income - total allocated)

Slice % of income = slice amount ÷ income × 100
```

If outflows exceed income, Unallocated is zero and the other slices can total
more than 100% of income.

Why it is necessary: it shows where the selected month’s income was directed,
not merely where expenses were spent.

### 3.8 Savings Rate Trend

For each saved income month within the last 12 months ending at the selected
month:

```text
Monthly Savings Rate
= (income - expenses - investments - emergency contributions)
  ÷ income × 100
```

Months without a saved income row are omitted.

Why it is necessary: one month can be unusual; the trend shows whether retained
income is improving or declining.

### 3.9 Net-Worth History

This chart uses saved rows from the legacy `NetWorth` worksheet:

```text
Snapshot assets
= cash + bank + investments + retirement + other assets

Snapshot liabilities
= loans + credit cards + other liabilities

Snapshot net worth = snapshot assets - snapshot liabilities
```

This is different from the Dashboard Net Worth card:

- the card is calculated live from accounts and holdings;
- the chart uses manually saved historical snapshots.

Why it is necessary: today’s account balances cannot reconstruct what every
asset was worth in an earlier month.

### 3.10 Recent Transactions

Shows up to five expense records from the selected month, most recently added
first. Each row displays description, date, category, and negative amount.

Why it is necessary: it provides a quick check of the latest recorded spending.

### 3.11 Investment Snapshot

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
| Category | Food, Grocery, Travel, Housing, Health, Entertainment, Utilities, Shopping, or Other | Drives category charts and analysis |
| Payment Method | UPI, credit card, debit card, cash, or bank transfer | Describes the payment rail; it does not choose the account |
| Paid From Account | Account whose balance is affected | Connects spending to the account ledger |

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
Category monthly amount = Σ expense amount in that category and month
Monthly total = Σ all expense amounts in that month
Transaction count = number of expense rows in that month
```

Stacked bars show categories, and the line shows the total.

Why it is necessary: it separates a general increase in spending from an
increase caused by one category.

### 4.3 Category Split

Uses expenses in the globally selected month:

```text
Category amount = Σ selected-month expenses in category
Category share % = category amount ÷ all selected-month expenses × 100
```

Why it is necessary: it identifies the categories responsible for the month’s
spending.

### 4.4 Summary strip

**Total This Month**

```text
Total = Σ expense amounts matching the Expenses table filters
```

Despite the label, selecting All Years or All Months makes this a total of the
filtered period.

**Transactions**

```text
Transactions = number of filtered expense records
```

**Avg Per Day**

For a selected current month:

```text
Average per day = filtered total ÷ today’s day number
```

For a selected past month:

```text
Average per day = filtered total ÷ days in that month
```

For a broad date range:

```text
Average per day
= filtered total ÷ inclusive days between earliest and latest filtered entry
```

**Largest Expense**

The highest single filtered expense and its category.

**Projected Month-End**

For the current month:

```text
Projected Month-End
= spending so far ÷ elapsed day number × days in month
```

For a non-current period, it displays the filtered total rather than a
projection.

Why these labels are necessary: total shows scale, count shows frequency,
average shows pace, largest shows concentration, and projection warns about the
likely month-end result.

### 4.5 Filters

- **Year** limits the table and summary strip to a year.
- **Month** limits them to a calendar month.
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
| Asset Ticker / Code | Short identifier such as RELIANCE or a fund code |
| Asset Name | Human-readable company, scheme, or deposit name |
| MF Scheme Code | Code used to request the latest NAV from mfapi.in |
| Market Cap | Descriptive classification for market investments |
| Risk Level | User-selected descriptive risk label |
| Units / Shares | Quantity initially acquired |
| Buy Price | Initial price or NAV per unit |
| Current Price | Latest stored price or NAV per unit |
| Purchase Date | Date of the initial transaction |
| Investment Account | MF, Demat, PPF, NPS, gold, or FD account that contains the holding |
| Paid From Account | Bank/cash account that funded the purchase |

Initial unit-based investment:

```text
Initial purchase amount = units × buy price
```

That amount reduces the funding account. The holding’s current value is counted
inside the selected investment account.

### 5.5 Summary cards

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

### 5.6 Portfolio Allocation

```text
Category allocation value = Σ current values in that investment category
```

Why it is necessary: it shows concentration across stocks, mutual funds, gold,
PPF, NPS, and FD.

### 5.7 Holdings Value chart

For each month-end in the 12 months ending at the selected month, transactions
up to that date determine units and cost basis.

Important: historical positions are valued using the holding’s *currently
stored* price. The chart does not fetch historical market prices or historical
NAVs. Therefore it is a position/cost history comparison, not a true historical
market-value chart.

### 5.8 Stocks & Mutual Funds and Other Investments tiles

Each tile shows:

```text
Invested = remaining cost basis for holdings in the tile
Current Value = current values for those holdings
P&L = current value - invested
Holdings = number of stored holding records
```

Category pills show current value for each category inside the tile.

### 5.9 Holding table labels

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

### 5.10 Buy More and Sell

**Buy More** adds a dated BUY transaction:

```text
Purchase amount = units × price
Funding account effect = -purchase amount
Holding units and cost basis increase
```

**Sell** adds a dated SELL transaction:

```text
Sale proceeds = units × price
Receiving account effect = +sale proceeds
Holding units and cost basis decrease using moving-average cost
```

FinTrack prevents selling more units than are currently held.

### 5.11 Current price and NAV

Price refresh updates the holding’s current stored price:

- stocks use the Yahoo Finance price endpoint;
- mutual funds use the current/latest entry from mfapi.in when a scheme code is
  available.

Current price affects valuation and unrealised gain. It does not create a cash
transaction.

## 6. Income and Flow

### 6.1 This Month Income

Same monthly income used by the Dashboard.

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
| Income | User-entered monthly income |
| Expenses | Sum of actual expense entries for the month |
| Invested | Sum of BUY and DEPOSIT amounts for the month |
| Emergency | Sum of legacy emergency-fund contributions for the month |
| Net Saved | Income − Expenses − Invested − Emergency |
| Savings Rate | Net Saved ÷ Income × 100 |
| Invest Rate | Invested ÷ Income × 100 |

Income is editable from the table. The other calculated columns come from their
underlying transactions.

Why it is necessary: editing one source value should recalculate the whole
month rather than storing multiple inconsistent copies.

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
+ received SELL/WITHDRAWAL transactions
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

## 9. Account ledger

### 9.1 Account selector

Chooses which account’s linked activity is displayed.

### 9.2 Period filter

- **This month:** dates within the globally selected month.
- **Financial year:** 1 April through 31 March containing the selected month.
- **All time:** every included entry on or after the account’s tracking start
  date.

### 9.3 Transaction type filter

- **Income:** monthly income entries.
- **Expenses:** expense records.
- **Transfers:** transfer in and transfer out.
- **Investments:** purchases, deposits, sales, withdrawals, and interest.
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
| Accounts | Account setup, starting position, current bank/card comparison |
| Transfers | Two-sided internal account movements |
| ReconciliationAdjustments | Dated signed corrections with reasons and creation time |
| Expenses | Expense records and paying account |
| Investments | Holding identity, category, current price, and investment account |
| Transactions | BUY, SELL, DEPOSIT, INTEREST, WITHDRAWAL, and investment ADJUSTMENT history |
| SavingsHistory | Monthly income and assigned salary account |
| RecurringRules | SIP/deposit schedule definitions |
| RecurringOccurrences | Pending, confirmed, and skipped scheduled events |
| EmergencyFund / EFContributions | Legacy emergency-fund data |
| NetWorth | Legacy monthly net-worth snapshots |
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

1. Income is stored monthly, not as individual dated salary credits. The
   account ledger places monthly income on the first day of the month.
2. Dashboard Net Worth is live and account-based, but Net-Worth History uses
   separate legacy snapshots.
3. The Holdings Value chart filters transactions historically but values those
   historical units using the currently stored price; it is not true historical
   valuation.
4. Current mutual-fund NAV can be refreshed, but recurring confirmation does
   not yet automatically retrieve historical NAV for the due date.
5. Current bank/card balance is manually entered. FinTrack does not connect to
   a bank statement feed.
6. The displayed Unexplained Gap is absolute. The Review Account Balance dialog
   identifies whether FinTrack is lower or higher.
7. “Total Invested” means remaining cost basis, not total contributions ever
   made. Sold or withdrawn cost is removed.
8. Realised sale gains are shown in a holding’s transaction summary but are not
   added to the investment headline Total Gain/Loss.
9. Legacy budget, recurring-bill, emergency-fund, net-worth snapshot, and
   cash-flow worksheets remain supported, but their input panels are hidden in
   the account-centered interface.
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
