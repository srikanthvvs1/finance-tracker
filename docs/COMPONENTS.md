# FinTrack — Components & Technical Glossary

A complete reference for every UI component, financial term, chart, and interactive feature in the FinTrack personal finance tracker.

---

## Table of Contents

1. [App Sections](#1-app-sections)
2. [Financial Terms Glossary](#2-financial-terms-glossary)
3. [Charts](#3-charts)
4. [Data Categories](#4-data-categories)
5. [Summary Cards & Metrics](#5-summary-cards--metrics)
6. [Interactive Features](#6-interactive-features)
7. [Investment Categories Explained](#7-investment-categories-explained)
8. [Savings Features](#8-savings-features)
9. [Technical Details](#9-technical-details)

---

## 1. App Sections

### Dashboard

The landing page — a high-level overview of your entire financial picture.

| Component | Description |
|---|---|
| **Total Wealth card** | Combined net worth across all assets |
| **Monthly Income card** | Gross income for the current month |
| **Monthly Expenses card** | Total spending for the current month |
| **Net Savings card** | Income minus expenses, with savings rate % |
| **Expense Breakdown chart** | Doughnut chart showing spending by category |
| **Savings vs Expenses chart** | Line chart comparing saved vs spent over 6 months |
| **Recent Transactions** | Last 5 expenses with date, description, category badge, and amount |
| **Investment Snapshot** | Top 5 holdings showing asset, category, invested, current value, and return % |

### Expenses

Track and manage all your spending.

| Component | Description |
|---|---|
| **Year & Month filters** | Dropdowns to filter expenses by time period |
| **Group By toggle** | Switch between flat list and month-grouped view |
| **Category tabs** | Filter pills: All, Food, Travel, Housing, Health, Entertainment, Utilities, Shopping, Other |
| **Summary strip** | 4 mini-metrics: Total This Month, Transactions count, Avg Per Day, Largest Expense |
| **Expense table** | Columns: Date, Description, Category, Payment Method, Amount, Actions (Delete) |
| **Month group headers** | When grouped, shows month name + subtotal row |

### Investments

Monitor your full investment portfolio.

| Component | Description |
|---|---|
| **Total Invested card** | Sum of all cost basis (units × buy price) |
| **Current Value card** | Sum of all live valuations (units × current price) |
| **Total Gain/Loss card** | Unrealized P&L (current − invested), color-coded green/red |
| **Overall Return card** | Weighted average return as a percentage |
| **Portfolio Allocation chart** | Doughnut showing distribution across investment categories |
| **Portfolio Performance chart** | Line chart of portfolio value over 12 months |
| **Stocks & MF tile** | Clickable card showing invested, current value, P&L, holdings count — opens the dedicated Stocks & MF section |
| **Other Investments tile** | Card showing same metrics for Gold, PPF, NPS, FD |
| **Other Investments panel** | Always-visible detail panel with card-based view of non-tradable holdings |

### Stocks & Mutual Funds

Dedicated deep-dive section for market-linked holdings.

| Component | Description |
|---|---|
| **Back button** | Returns to the Investments section |
| **4 Summary cards** | Total Invested, Current Value, Unrealized P&L (with return %), Holdings count |
| **Risk Profile chart** | Doughnut: Low / Moderate / High risk distribution by current value |
| **Market Cap Split chart** | Doughnut: Large Cap / Mid Cap / Small Cap distribution |
| **Category Breakdown chart** | Doughnut: Stocks / Mutual Funds / Foreign Stocks split |
| **Holdings table** | Grouped by sub-category, with Buy/Sell/Delete actions per holding |

### Savings

Track savings goals, emergency fund, and monthly savings history.

| Component | Description |
|---|---|
| **Total Savings card** | Liquid + fixed deposit savings total |
| **This Month card** | Amount saved this month, compared to last month |
| **Savings Rate card** | Percentage of income saved (target: 30%) |
| **Annual Goal card** | Yearly savings target with remaining amount |
| **Savings History chart** | Grouped bar chart: Income / Expenses / Saved over 12 months |
| **Savings Goals grid** | Goal cards with icon, name, deadline, progress bar, % complete |
| **Emergency Fund card** | Shield icon, saved/target/remaining stats, progress bar, update button |
| **Monthly Savings Log** | Table: Month, Income, Expenses, Saved, Savings Rate, Cumulative |

---

## 2. Financial Terms Glossary

| Term | Meaning |
|---|---|
| **P&L (Profit & Loss)** | The difference between what you paid and what your investment is currently worth. Positive = profit, negative = loss. |
| **Unrealized P&L** | Gains or losses that exist on paper but haven't been locked in by selling. They're "unrealized" because you still hold the asset. |
| **Total Invested** | Your cost basis — the total principal amount you put in (units × buy price). |
| **Current Value** | What your holdings are worth right now at live market prices (units × current price). |
| **Gain / Loss** | `(Current Price − Buy Price) × Units`. The profit or loss on a single holding. |
| **Return %** | `(Gain / Invested) × 100`. How much your investment has grown as a percentage. |
| **Overall Return** | The weighted average return percentage across your entire portfolio. |
| **Portfolio Allocation** | How your money is distributed across different investment categories. |
| **Market Cap (Capitalization)** | The total market value of a company's shares. Used to classify companies by size. |
| **Large Cap** | Companies with very high market value (e.g., Apple, Microsoft). Generally stable, lower risk. |
| **Mid Cap** | Medium-sized companies. Balance of growth potential and stability. |
| **Small Cap** | Smaller companies with higher growth potential but also higher risk and volatility. |
| **Risk Level** | A rating of how volatile/risky an investment is — Low, Moderate, or High. |
| **Risk Profile** | The overall distribution of your portfolio across different risk levels. |
| **Buy Price** | The price per unit at which you originally purchased the asset. |
| **Current Price** | The latest market price per unit of the asset. |
| **Weighted Average Price** | When you buy more of an asset at a different price, the system recalculates your average buy price weighted by units. |
| **Holdings** | The individual investment positions you own. Each stock, fund, or asset is one holding. |
| **Units / Shares** | The quantity of an asset you own (e.g., 50 shares of Apple). |
| **Tradable** | Assets you can buy more of or sell (stocks, mutual funds, foreign stocks). |
| **Non-tradable** | Assets that can only be added or deleted, not traded (gold bonds, PPF, NPS, FD). |
| **Savings Rate** | `(Saved / Income) × 100`. The percentage of your income that you save. A rate above 30% is considered healthy. |
| **Cumulative Savings** | A running total of how much you've saved over time. |
| **Emergency Fund** | A reserve of liquid cash kept for unexpected expenses (medical, job loss, repairs). Not an investment — it's meant to be easily accessible. |
| **ETF (Exchange-Traded Fund)** | A fund that tracks an index (like S&P 500) and trades on stock exchanges like a regular stock. Example: VOO, VTI. |
| **Net Savings** | Income minus expenses. What's left after all spending. |
| **Principal** | The original amount of money invested, before any returns. |
| **Live Valuation** | The current worth of your holdings based on the latest market prices. |
| **Cost Basis** | Same as Total Invested — the total amount you originally paid for your holdings. |

---

## 3. Charts

| # | Chart | Type | Section | What It Shows |
|---|---|---|---|---|
| 1 | Expense Breakdown | **Doughnut** | Dashboard | How your spending is split across categories (Food, Travel, Housing, etc.) |
| 2 | Savings vs Expenses Trend | **Line** (filled) | Dashboard | 6-month comparison of money saved vs money spent |
| 3 | Portfolio Allocation | **Doughnut** | Investments | How your investments are distributed across categories |
| 4 | Portfolio Performance | **Line** (filled) | Investments | Your total portfolio value over the last 12 months |
| 5 | Monthly Savings History | **Grouped Bar** | Savings | Side-by-side bars for Income, Expenses, and Saved per month |
| 6 | Risk Profile | **Doughnut** | Stocks & MF | Distribution of your market holdings by risk level (Low/Moderate/High) |
| 7 | Market Cap Split | **Doughnut** | Stocks & MF | Distribution by company size (Large/Mid/Small Cap) |
| 8 | Category Breakdown | **Doughnut** | Stocks & MF | Split between Stocks, Mutual Funds, and Foreign Stocks |

---

## 4. Data Categories

### Expense Categories

| Icon | Category | Examples |
|---|---|---|
| 🍔 | Food | Groceries, restaurants, coffee |
| ✈️ | Travel | Flights, hotels, fuel |
| 🏠 | Housing | Rent, maintenance, furniture |
| ⚕️ | Health | Doctor visits, medicine, gym |
| 🎬 | Entertainment | Movies, streaming, events |
| ⚡ | Utilities | Electricity, internet, phone |
| 🛍️ | Shopping | Clothing, electronics, gadgets |
| 📦 | Other | Anything that doesn't fit above |

### Payment Methods

| Method | Description |
|---|---|
| Credit Card | Spend now, pay later (monthly billing cycle) |
| Debit Card | Directly debited from your bank account |
| Cash | Physical currency |
| Bank Transfer | UPI, NEFT, IMPS, wire transfer |

### Investment Categories

| Icon | Category | Type | Description |
|---|---|---|---|
| 📈 | Stocks | Tradable | Equity shares in domestic companies |
| 📊 | Mutual Funds | Tradable | Pooled funds / ETFs tracking market indices |
| 🌍 | Foreign Stocks | Tradable | Shares in companies listed on foreign exchanges |
| 🥇 | Gold | Non-tradable | Sovereign Gold Bonds (SGB) — government-backed gold |
| 🏛️ | PPF | Non-tradable | Public Provident Fund — long-term govt savings |
| 👴 | NPS | Non-tradable | National Pension System — retirement savings |
| 🏦 | Fixed Deposit | Non-tradable | Bank FD — locked deposit at fixed interest rate |

### Risk Levels

| Level | Color | Meaning |
|---|---|---|
| **Low** | 🟢 Green | Stable, predictable returns (e.g., large-cap index funds) |
| **Moderate** | 🟡 Amber | Some volatility, balanced risk/reward (e.g., diversified stocks) |
| **High** | 🔴 Red | Volatile, potential for big gains or losses (e.g., growth stocks) |

### Market Cap Classifications

| Size | Color | Meaning |
|---|---|---|
| **Large Cap** | 🟣 Indigo | Major companies — stable, well-established |
| **Mid Cap** | 🔵 Blue | Growing companies — moderate risk, good potential |
| **Small Cap** | 🔷 Cyan | Emerging companies — higher risk, higher potential |

---

## 5. Summary Cards & Metrics

### Dashboard

| Card | Value | Meaning |
|---|---|---|
| 💼 Total Wealth | ₹124,500 | Everything you own — investments + savings |
| 💵 Monthly Income | ₹6,500 | What you earned this month |
| 💸 Monthly Expenses | ₹3,240 | What you spent this month |
| 🏦 Net Savings | ₹3,260 | Income − Expenses |

### Investments

| Card | Formula | Meaning |
|---|---|---|
| 💰 Total Invested | Σ(units × buyPrice) | Total money you've put in |
| 📈 Current Value | Σ(units × currentPrice) | What it's all worth now |
| ✅ Total Gain/Loss | Current − Invested | How much you've made (or lost) |
| % Overall Return | (Gain ÷ Invested) × 100 | Percentage growth |

### Stocks & MF (market holdings only)

| Card | What | Why |
|---|---|---|
| Total Invested | Cost basis for stocks/MF/foreign | How much you put into market assets |
| Current Value | Live valuation | What the market says it's worth |
| Unrealized P&L | Gain/loss + return % | Paper profit/loss, not yet realized |
| Holdings | Count | How many positions you hold |

### Savings

| Card | Value | Meaning |
|---|---|---|
| 🏦 Total Savings | ₹25,750 | Liquid cash + fixed deposits |
| 📅 This Month | ₹3,260 | Saved this month, vs last month |
| % Savings Rate | 50.2% | Portion of income saved (30%+ is healthy) |
| 🎯 Annual Goal | ₹36,000 | Your target for the year |

### Expense Summary Strip

| Metric | Meaning |
|---|---|
| Total This Month | Sum of all expenses in the filtered period |
| Transactions | Number of expense entries |
| Avg Per Day | Total ÷ 30 |
| Largest Expense | Biggest single expense + its category |

---

## 6. Interactive Features

### Navigation
- **Sidebar** — 4 main sections: Dashboard, Expenses, Investments, Savings
- **"+ Add Entry" button** — Context-aware: opens the appropriate modal based on which section you're viewing
- **Month navigator** — Previous/next buttons to cycle through months
- **"View All" links** — On dashboard widgets, navigate to full sections
- **Stocks tile click** — Opens the dedicated Stocks & MF detail section
- **Back button** — Returns from Stocks & MF back to Investments

### Modals (Pop-up Forms)
| Modal | Fields | Opens From |
|---|---|---|
| **Add Expense** | Date, Amount, Description, Category, Payment, Notes | "+ Add Entry" on Dashboard/Expenses |
| **Add Investment** | Ticker, Name, Category, Market Cap*, Risk Level*, Units, Buy Price, Current Price, Date | "+ Add Entry" on Investments/Stocks |
| **Buy/Sell Trade** | Units, Price per unit (pre-filled with current holdings info) | Buy 🛒 or Sell 💰 buttons on tradable holdings |
| **Add Savings Goal** | Name, Target, Saved So Far, Target Date, Icon | "+ Add Entry" on Savings |
| **Update Emergency Fund** | Target Amount, Current Amount | "Update" button on emergency fund card |

*Market Cap and Risk Level fields only appear when the selected category is Stocks, Mutual Funds, or Foreign Stocks.

### Actions
| Action | Icon | What It Does |
|---|---|---|
| **Buy More** | 🛒 | Opens trade modal to add units at a new price. Recalculates weighted average buy price. |
| **Sell** | 💰 | Opens trade modal to sell units. Reduces holding (removes it if all units sold). |
| **Delete** | 🗑️ | Removes the item entirely after confirmation. |
| **Clear All** | 🗑️ Clear All | Removes ALL items in that section after confirmation. |

### Filters (Expenses only)
| Filter | Options |
|---|---|
| Year | 2024, 2025, 2026 |
| Month | All, January–December |
| Category tabs | All + 8 expense categories |
| Group by | Month (grouped with subtotals) or Flat List |

---

## 7. Investment Categories Explained

### Stocks (📈)
Shares of ownership in a company. When you buy a stock, you own a tiny piece of that company. If the company does well, the stock price goes up, and you profit. Examples in the app: **AAPL** (Apple), **MSFT** (Microsoft).

### Mutual Funds (📊)
A pool of money collected from many investors, managed by a fund manager who invests it in a diversified portfolio. **ETFs** (Exchange-Traded Funds) are a type of mutual fund that trades on stock exchanges like a regular stock. Examples: **VOO** (tracks S&P 500 index), **VTI** (tracks the total US stock market).

### Foreign Stocks (🌍)
Stocks listed on exchanges outside your home country. Example: **TSLA** (Tesla) is listed on the US NASDAQ exchange. Currency fluctuations add an extra layer of risk/reward.

### Gold — Sovereign Gold Bonds (🥇)
Government securities denominated in grams of gold. You invest in gold without physically owning it. The government pays you interest, and the value moves with gold prices. Lower risk than stocks, good for diversification.

### PPF — Public Provident Fund (🏛️)
A long-term savings scheme by the Indian government. Fixed interest rate (currently ~7.1%), 15-year lock-in period, tax-free returns. Very safe, guaranteed by the government. Good for conservative, long-term savings.

### NPS — National Pension System (👴)
A voluntary retirement savings scheme in India. Your money is invested in a mix of equity, bonds, and government securities. Returns are market-linked (not fixed). Partial withdrawal allowed; main corpus available at retirement (age 60).

### Fixed Deposit (🏦)
You deposit a lump sum with a bank for a fixed period at a guaranteed interest rate. Very low risk. Example: **SBI FD at 7.1%**. Money is locked until maturity (early withdrawal has penalties).

---

## 8. Savings Features

### Emergency Fund 🛡️
A reserve of **liquid cash** (easily accessible money) kept for unexpected expenses — medical emergencies, car repairs, job loss, etc. Financial advisors recommend keeping 3–6 months of expenses as an emergency fund.

- **Not an investment** — it's meant to be safe and instantly available, not to grow.
- **Tracked separately** from investments, inside the Savings section.
- **Shows**: Amount saved, target amount, remaining, progress bar, and % funded.
- **Update button** opens a modal to change target/current amounts.

### Savings Goals 🎯
Named financial targets you're working toward. Each goal has:
- **Name** — What you're saving for (e.g., "Vacation – Japan")
- **Icon** — Visual identifier (🏠🚗✈️🎓🏥💍💻🎯)
- **Target amount** — How much you need
- **Current amount** — How much you've saved so far
- **Deadline** — Target date to reach the goal
- **Progress bar** — Visual indicator of % complete
- Goals at 100% show "✅ Goal reached!" with a celebratory purple gradient

### Savings Rate
The percentage of your income that you save: `(Saved ÷ Income) × 100`

| Rate | Assessment |
|---|---|
| 50%+ | Excellent |
| 30–50% | Good (above target) |
| 20–30% | Average |
| Below 20% | Needs improvement |

The app uses **30%** as the target threshold.

### Monthly Savings Log
A table tracking your financial flow month by month:
- **Income** — What you earned
- **Expenses** — What you spent
- **Saved** — What's left (income − expenses)
- **Savings Rate** — Saved as a percentage of income
- **Cumulative Savings** — Running total of all savings over time

---

## 9. Technical Details

| Detail | Value |
|---|---|
| **Currency** | Indian Rupee (₹), formatted with `en-IN` locale |
| **Date format** | US English (e.g., "Apr 12, 2026") |
| **Font** | Inter (Google Fonts) |
| **Charts library** | Chart.js v4.4.0 (loaded via CDN) |
| **Framework** | None — vanilla HTML, CSS, JavaScript |
| **Data storage** | Client-side only (in-memory arrays, no backend yet) |
| **XSS protection** | `escHtml()` function escapes all user-supplied text before rendering |
| **Responsive breakpoints** | 1200px (2-col cards), 960px (1-col charts/tiles), 768px (sidebar collapses) |
| **Color palette** | Indigo, Emerald, Amber, Red, Blue, Pink, Cyan, Slate |
