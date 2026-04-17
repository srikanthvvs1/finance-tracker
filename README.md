# 💰 FinTrack — Personal Finance Tracker

A modern, single-page personal finance dashboard built with vanilla HTML, CSS, and JavaScript. Track expenses, monitor investments, and manage savings goals — all in one place.

---

## Table of Contents

1. [App Sections](#app-sections)
   - [Dashboard](#1-dashboard)
   - [Expenses](#2-expenses)
   - [Investments](#3-investments--stocks--mutual-funds)
   - [Savings](#4-savings)
   - [Documents](#5-documents)
2. [Features](#features)
3. [Tech Stack](#tech-stack)
4. [Getting Started](#getting-started)
5. [Server Options](#two-server-options)
6. [Portable Deployment](#portable-deployment)
7. [Google Sheets Setup](#google-sheets-setup)
8. [Live Price Integration](#live-price-integration)
9. [How Values Are Calculated](#how-values-are-calculated)
10. [Project Structure](#project-structure)
11. [Future Improvements](#future-improvements)
12. [License](#license)

---

## App Sections

### 1. Dashboard

The central overview of your financial health. Shows:

- **Summary Cards** — Total Wealth, Monthly Income, Monthly Expenses, Net Savings
- **Income Breakdown** (donut chart) — Expenses split by category for the selected month
- **Savings Rate Trend** (line chart) — % of income saved over the last 12 months
- **Wealth Accumulation** (stacked area chart) — Investments + Savings Goals + Emergency Fund growth over 12 months
- **Recent Transactions** — Last 5 expenses with category, amount, and date
- **Investment Snapshot** — Top holdings with current value and gain/loss

Click on any summary card's income value to edit monthly income inline.

### 2. Expenses

Full expense tracking with analytics:

- **Expense Trend** (line + bar chart) — Monthly spending over last 12 months with per-category breakdown
- **Category Split** (donut chart) — Proportional spending by category for the selected month
- **Summary Strip** — Total, transaction count, average per day, and top category at a glance
- **Expense Table** — All transactions with date, description, category, payment method, and amount
- **Add Expense** — Quick-add form with category and payment method selection
- **Categories** — Food 🍔, Travel ✈️, Housing 🏠, Health ⚕️, Entertainment 🎬, Utilities ⚡, Shopping 🛍️, Other 📦
- **Payment Methods** — Credit Card, Debit Card, Cash, Bank Transfer, UPI
- **Month Navigation** — Browse expenses by month with the header month selector

### 3. Investments — Stocks & Mutual Funds

Comprehensive investment portfolio management:

- **Summary Cards** — Total Invested, Current Value, Unrealized P&L, Holdings count
- **Risk Profile** (donut) — Portfolio split by Low / Moderate / High risk
- **Market Cap Split** (donut) — Large Cap / Mid Cap / Small Cap distribution
- **Category Breakdown** (donut) — Stocks vs Mutual Funds vs Foreign Stocks
- **Stocks — Performance Analysis**
  - **Growth Comparison** (line chart) — Each stock's value trajectory over 12 months
  - **Invested vs Current** (line chart) — Aggregated cost basis vs market value over time
  - Custom scrollable HTML legend — click to toggle individual stocks on/off
- **Mutual Funds — Performance Analysis**
  - **Growth Comparison** (line chart) — Each fund's value trajectory over 12 months
  - **Invested vs Current** (line chart) — Aggregated cost basis vs NAV-based value over time
- **All Holdings Table** — Grouped by Mutual Funds → Stocks → Foreign Stocks, each showing:
  - Asset name, Units, Buy Price, Current Price, Invested, Current Value, Gain/Loss, Return %
  - Expandable transaction history (BUY/SELL log with running totals)
  - Action buttons: 🛒 Buy More, 💰 Sell, 🗑️ Delete
- **Refresh Prices** — One-click live price fetch from Yahoo Finance (stocks) and mfapi.in (mutual funds)
- **Debug Panel** — Toggle price fetch logs for troubleshooting
- **Other Investments** — Gold (SGB, Physical), PPF, NPS, Fixed Deposits with card-based layout

### 4. Savings

Track savings progress and financial goals:

- **Summary Cards** — Monthly Income, Expenses, Invested, Net Saved for the selected month
- **Monthly Allocation** (100% stacked bar) — Last 12 months showing % of income going to expenses, investments, emergency fund, and savings
- **Savings Goals Grid** — Visual cards for each goal with:
  - Name, icon, target amount, current progress
  - Progress bar with percentage
  - Deadline tracking
  - Add contribution / Edit / Delete actions
- **Emergency Fund** — Dedicated tracker with:
  - Target vs current with progress bar
  - Contribution history table (date, amount, note)
  - Add contribution button
- **Income Editing** — Click income values to update for any month

### 5. Documents

Organize and manage your financial documents:

- **5 Categories** — Salary Slips, Tax, Insurance, Investments, Bank Statements
- **Year-Based Organization** — Filter by year (2024, 2025, 2026)
- **Drag & Drop Upload** — Drop files directly or browse to upload
- **Auto-Rename** — Files saved as `DocumentName_DD_Mon_YYYY.ext` with duplicate handling
- **File Browser** — Table view with name, size, modified date
- **Download & Delete** — One-click actions for each file

## Features

- **5 Sections** — Dashboard, Expenses, Investments, Savings, Documents with sidebar navigation
- **Dual Backend** — Local Excel (`server.py`) or Google Sheets (`server_gsheets.py`)
- **Live Prices** — Auto-fetch stock prices (Yahoo Finance) and MF NAVs (mfapi.in)
- **15+ Charts** — Powered by Chart.js — donuts, lines, stacked bars, area charts
- **Transaction Tracking** — Full BUY/SELL history with running P&L per holding
- **Savings Goals** — Set targets with deadlines, track progress, manage contributions
- **Emergency Fund** — Dedicated tracker with contribution history
- **Month Selector** — Navigate between months to review historical data
- **Portable** — Copy folder to any machine, double-click `start.bat` to run
- **Taskbar Pinnable** — Auto-creates desktop shortcut on first launch
- **System Username** — Displays your Windows full name in the sidebar

## Tech Stack

| Layer   | Technology                |
|---------|---------------------------|
| Markup  | HTML5                     |
| Styling | CSS3 (custom properties, flexbox, grid) |
| Logic   | Vanilla JavaScript (ES6+) |
| Charts  | Chart.js 4.4              |
| Fonts   | Google Fonts — Inter       |

## Getting Started

### Quick Start (Recommended)

Double-click **`start.bat`** — it auto-detects Python, installs dependencies, creates a desktop shortcut, starts the server, and opens the browser.

### Manual Start

```bash
cd finance-tracker
pip install -r requirements.txt
python server.py
# Open http://localhost:5000
```

### Two Server Options

| Server | Data Storage | Command |
|--------|-------------|---------|
| `server.py` | Local Excel file (`data.xlsx`) | `python server.py` |
| `server_gsheets.py` | Google Sheets (cloud) | `python server_gsheets.py` |

#### `server.py` — Local Excel Backend

- Stores all data in a single `data.xlsx` file using **openpyxl**
- File lives in the same folder as the app (portable — copy and go)
- Atomic writes via temp-file + rename to prevent corruption
- Thread-safe with file locking for concurrent access
- Auto-creates `data.xlsx` with seed data (sample expenses, investments, goals) on first run
- Handles OneDrive / antivirus file locks with automatic retries
- **No internet or account needed** — fully offline
- Environment variable `FINTRACK_DATA_DIR` can override the data folder location

#### `server_gsheets.py` — Google Sheets Backend

- Stores all data in a **Google Sheet** via the `gspread` library
- Data accessible from any device via Google Sheets (view/edit in browser)
- Requires a **Google Cloud service account** JSON credentials file
- Uses batch reads/writes to minimize API calls
- Thread-safe with a shared gspread client
- **Requires internet** — the app talks to Google APIs
- Ideal for syncing data across multiple machines

#### Shared Features (Both Servers)

- Flask server on `http://localhost:5000` with CORS enabled
- Serves the static frontend (HTML/JS/CSS)
- **Price proxy APIs** — fetches live stock prices (Yahoo Finance) and mutual fund NAVs (mfapi.in) server-side, avoiding browser CORS issues
- **User info API** — displays your Windows full name in the sidebar
- **Export API** — download `data.xlsx` from the browser
- Identical API endpoints — the frontend works with either server without changes

## Portable Deployment

Copy the entire `finance-tracker` folder to any Windows machine with Python 3.10+ installed. On first launch, `start.bat` will:

1. Auto-detect Python on PATH
2. Install required packages from `requirements.txt`
3. Create a Desktop shortcut (right-click → **Pin to taskbar**)
4. Start the server and open the browser

Data (`data.xlsx`) is stored in the same folder — everything travels together.

## Google Sheets Setup

To use `server_gsheets.py` with a different Google account:

1. **Create a service account** in [Google Cloud Console](https://console.cloud.google.com/) → download the JSON key file
2. **Drop the JSON file** into the `finance-tracker` folder
3. **Update these two lines** in `server_gsheets.py`:
   ```python
   CREDS_FILE = BASE_DIR / "your-credentials-file.json"
   SPREADSHEET_ID = "your-spreadsheet-id-here"
   ```
4. **Create a Google Sheet** → share it (Editor) with the service account email (found in the JSON under `client_email`)
5. The **Spreadsheet ID** is in the sheet URL: `docs.google.com/spreadsheets/d/<THIS_PART>/edit`

## Project Structure

```
finance-tracker/
├── static/                  # Frontend source
│   ├── index.html
│   ├── script.js
│   └── style.css
├── config/                  # Configuration & credentials
│   └── fintrack-*.json      # Google Sheets service account key
├── docs/                    # Documentation
│   ├── ARCHITECTURE.md
│   └── COMPONENTS.md
├── server.py                # Flask server (local Excel backend)
├── server_gsheets.py        # Flask server (Google Sheets backend)
├── requirements.txt         # Python dependencies
├── start.bat                # One-click launcher (Windows)
├── README.md
├── .gitignore
├── data.xlsx                # Auto-generated at runtime
├── documents/               # Auto-created at runtime
│   ├── salary_slips/
│   ├── tax/
│   ├── insurance/
│   ├── investments/
│   └── bank_statements/
└── bkp/                     # Backup of earlier versions
```

## Screenshots

> Open `index.html` in a browser to see the dashboard with summary cards, recent transactions, investment snapshot, and savings goals.

## Future Improvements

- Dark mode toggle
- Export data to CSV / PDF
- Mobile-responsive layout refinements

## Live Price Integration

FinTrack includes a **plug-and-play price provider system** that fetches live prices for stocks and mutual funds. Each category maps to a swappable async provider in the `priceProviders` object.

### Supported Providers

| Category | API | CORS Proxy | Lookup Key | API Key |
|---|---|---|---|---|
| Mutual Funds | [mfapi.in](https://www.mfapi.in/) | None (direct) | `schemeCode` | None |
| Stocks | [Yahoo Finance](https://finance.yahoo.com/) | [api.codetabs.com](https://api.codetabs.com) | `ticker` | None |
| Foreign Stocks | Yahoo Finance (same) | api.codetabs.com | `ticker` | None |
| Gold | [metals.dev](https://metals.dev/) | None (direct) | — | Free tier |
| PPF / NPS / FD | Manual entry | — | — | — |

### Yahoo Ticker Format

| Market | Format | Example |
|--------|--------|---------|
| NSE India | `SYMBOL.NS` | `RELIANCE.NS`, `TCS.NS`, `INFY.NS` |
| BSE India | `SYMBOL.BO` | `RELIANCE.BO`, `HDFCBANK.BO` |
| US Stocks | `SYMBOL` | `AAPL`, `MSFT`, `TSLA` |

### How It Works

1. Add a **Yahoo Ticker** (e.g. `RELIANCE.NS`, `TCS.BO`) or **MF Scheme Code** (e.g. `119551`) when creating an investment
2. Click **🔄 Refresh Prices** on the Investments page
3. Live prices are fetched in parallel and the UI updates with a toast notification

### Swapping a Provider

Replace any function in the `priceProviders` object in `script.js`:

```js
// Example: switch mutual funds to a different API
priceProviders.mutual_funds = async (inv) => {
  const res = await fetch(`https://your-api.com/nav/${inv.schemeCode}`);
  const data = await res.json();
  return data.nav;
};
```

Each provider receives the full investment object and must return `number | null`.

## How Values Are Calculated

### Dashboard

| Metric | Formula |
|--------|---------|
| **Total Wealth** | `Investment Current Value + Emergency Fund + Savings Goals Current` |
| **Monthly Income** | `savingsHistory[currentMonth].income` (from data) |
| **Monthly Expenses** | `Σ expenses[i].amount` (sum of all expenses for the month) |
| **Net Savings** | `Monthly Income − Monthly Expenses` |
| **Savings Rate** | `(Net Savings / Monthly Income) × 100` |

### Investments

| Metric | Formula |
|--------|---------|
| **Total Invested** | `Σ (units × buyPrice)` for all investments |
| **Current Value** | `Σ (units × currentPrice)` for all investments |
| **Total Gain / Loss** | `Current Value − Total Invested` |
| **Overall Return %** | `(Total Gain / Total Invested) × 100` |
| **Per-holding P&L** | `(units × currentPrice) − (units × buyPrice)` |
| **Per-holding Gain %** | `((currentPrice − buyPrice) / buyPrice) × 100` |
| **Weighted Avg Buy Price** | `(oldUnits × oldBuyPrice + newUnits × newPrice) / totalUnits` (on new BUY) |

### Savings

| Metric | Formula |
|--------|---------|
| **Goal Progress %** | `min(100, round(current / target × 100))` |
| **Emergency Fund %** | `min(100, round(current / target × 100))` |
| **Cumulative Savings** | Running total of `savingsHistory[i].saved` |

### Charts — Data Sources

| Chart | Section | Type | Source |
|-------|---------|------|--------|
| Income Breakdown | Dashboard | Donut | `expenses[]` grouped by `category` |
| Savings Rate Trend | Dashboard | Line | `savingsHistory[]` — savings % over 12 months |
| Wealth Accumulation | Dashboard | Stacked Area | `investments[]` + `savingsGoals[]` + `emergencyFund` over 12 months |
| Expense Trend | Expenses | Line + Bar | `expenses[]` monthly totals over 12 months |
| Category Split | Expenses | Donut | `expenses[]` grouped by `category` for selected month |
| Portfolio Allocation | Investments | Donut | `investments[]` grouped by `category` |
| Portfolio Performance | Investments | Line | `investments[].transactions` rolled up by month |
| Risk Profile | Stocks & MF | Donut | `investments[]` grouped by `riskLevel` |
| Market Cap Split | Stocks & MF | Donut | `investments[]` grouped by `marketCap` |
| Category Breakdown | Stocks & MF | Donut | `investments[]` — stocks vs MF vs foreign |
| Stocks Growth Comparison | Stocks & MF | Multi-line | Per-stock value trajectory over 12 months |
| Stocks Invested vs Current | Stocks & MF | Area | Aggregated cost basis vs market value over 12 months |
| MF Growth Comparison | Stocks & MF | Multi-line | Per-fund value trajectory over 12 months |
| MF Invested vs Current | Stocks & MF | Area | Aggregated cost basis vs NAV value over 12 months |
| Other Category | Other Investments | Donut | `investments[]` — gold vs PPF vs NPS vs FD |
| Monthly Allocation | Savings | 100% Stacked Bar | `savingsHistory[]` — % split of income over 12 months |

## License

This project is for personal/educational use.
