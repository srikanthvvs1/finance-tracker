# FinTrack — Architecture & Data Flow

## Table of Contents
1. [Overview](#overview)
2. [Architecture Comparison](#architecture-comparison)
3. [File Structure](#file-structure)
4. [Data Model](#data-model)
5. [Server (server.py)](#server-serverpy)
6. [Frontend (script.js)](#frontend-scriptjs)
7. [Data Flow Diagrams](#data-flow-diagrams)
8. [CORS Problem Explained](#cors-problem-explained)
9. [Live Price Fetching](#live-price-fetching)
10. [How to Run](#how-to-run)

---

## Overview

FinTrack is a personal finance tracker built with:
- **Frontend:** HTML5 + CSS3 + Vanilla JavaScript + Chart.js
- **Backend:** Python Flask server
- **Storage:** Excel file (`data.xlsx`) via openpyxl
- **Price APIs:** Yahoo Finance (stocks) + mfapi.in (mutual funds)
- **Currency:** Indian Rupees (₹) with `en-IN` locale

---

## Architecture Comparison

### v1 — Pure Client-Side (No Server)

```
┌──────────────────────────────────────────────────────────────┐
│  Browser (file://index.html)                                 │
│                                                              │
│  script.js                                                   │
│  ┌──────────────────┐                                        │
│  │ const expenses = │ ← Data hardcoded in JS file            │
│  │   [{...}, {...}] │                                        │
│  │ const investments│ ← Lives only in RAM                    │
│  │   = [{...}]      │                                        │
│  └────────┬─────────┘                                        │
│           │                                                  │
│           │  fetch() ──→ mfapi.in        ✅ (CORS-safe)     │
│           │  fetch() ──→ Yahoo Finance   ❌ (CORS blocked)  │
│           │  fetch() ──→ CORS Proxies    ❌ (unreliable)    │
│           │                                                  │
│  Problems:                                                   │
│  ⚠️  Data lost on every page refresh                         │
│  ⚠️  Stock prices can't be fetched (CORS)                    │
│  ⚠️  No export capability                                    │
└──────────────────────────────────────────────────────────────┘
```

**Data lifecycle in v1:**
```
Page Load             User Adds Stock          Page Refresh
    │                      │                       │
    ▼                      ▼                       ▼
const investments =   investments.push({     const investments =
  [{AAPL}, {MSFT}]     name: "RELIANCE"       [{AAPL}, {MSFT}]
                      })
                                              ↑ RELIANCE is GONE
RAM: [AAPL, MSFT]    RAM: [AAPL,MSFT,REL]   RAM: [AAPL, MSFT]
```

### v2 — Local Server + Excel Storage (Current)

```
┌─────────────────────┐          ┌─────────────────────────────┐
│  Browser            │          │  Python Flask Server (:5000) │
│  localhost:5000     │          │                              │
│                     │  REST    │  ┌─────────────────────┐    │
│  script.js          │  JSON    │  │  REST API Endpoints │    │
│  ┌───────────────┐  │ ◄──────►│  │                     │    │
│  │ let expenses  │  │          │  │ GET  /api/expenses  │    │
│  │ let investments│  │          │  │ POST /api/expenses  │    │
│  │ (loaded from  │  │          │  │ GET  /api/investments│    │
│  │  server)      │  │          │  │ POST /api/investments│    │
│  └───────────────┘  │          │  │ GET  /api/savings-* │    │
│                     │          │  │ POST /api/savings-* │    │
│  On every add/      │  POST    │  │ GET  /api/emergency │    │
│  delete/edit ───────┼────────► │  │ POST /api/emergency │    │
│                     │          │  │                     │    │
│  Refresh Prices ────┼────────► │  │ /api/price/stock/:t─┼────┼──► Yahoo Finance
│                     │          │  │ /api/price/mf/:code─┼────┼──► mfapi.in
│                     │          │  └──────────┬──────────┘    │
│  📥 Export Excel ───┼────────► │  /api/export │              │
│                     │          │        ┌─────▼─────┐        │
│                     │          │        │ data.xlsx │        │
│                     │          │        │  6 sheets │        │
│                     │          │        └───────────┘        │
└─────────────────────┘          └─────────────────────────────┘
```

**Key differences:**

| Aspect              | v1 (No Server)                  | v2 (With Server)                    |
|----------------------|---------------------------------|-------------------------------------|
| Data storage         | JS `const` arrays in RAM        | `data.xlsx` on disk                 |
| On page refresh      | All changes lost                | Data persists                       |
| Stock prices         | CORS blocked                    | Server proxies (no CORS)            |
| MF prices            | Direct fetch (worked)           | Server proxy (also works)           |
| URL                  | `file://index.html`             | `http://localhost:5000`             |
| Export               | Not possible                    | Download Excel anytime              |
| Offline fallback     | Always offline                  | Falls back to mock data             |
| Dependencies         | None (just open HTML)           | Python, Flask, openpyxl             |

---

## File Structure

```
finance-tracker/
├── index.html          UI markup — sidebar, sections, modals
├── style.css           All styling — layout, cards, charts, debug panel
├── script.js           Frontend logic — rendering, events, API calls, charts
├── server.py           Python Flask backend — REST API + Excel I/O + price proxy
├── requirements.txt    Python dependencies (flask, flask-cors, openpyxl, requests)
├── data.xlsx           Auto-generated Excel file (6 sheets of data)
└── ARCHITECTURE.md     This document
```

---

## Data Model

### data.xlsx Sheet Structure

```
┌─────────────────────────────────────────────────────────────┐
│  data.xlsx                                                   │
│                                                              │
│  Sheet 1: Expenses                                           │
│  ┌────┬────────────┬─────────────┬──────────┬────────┬──────┐│
│  │ id │ date       │ description │ category │payment │amount││
│  ├────┼────────────┼─────────────┼──────────┼────────┼──────┤│
│  │ 1  │ 2026-04-01 │ Monthly Rent│ housing  │transfer│ 1200 ││
│  └────┴────────────┴─────────────┴──────────┴────────┴──────┘│
│                                                              │
│  Sheet 2: Investments                                        │
│  ┌────┬───────┬──────┬──────────┬─────┬────────┬────────────┐│
│  │ id │ asset │ name │ category │units│buyPrice│currentPrice││
│  │    │       │      │          │     │        │            ││
│  │ +  │ date, marketCap, riskLevel, ticker, schemeCode      ││
│  └────┴───────┴──────┴──────────┴─────┴────────┴────────────┘│
│                                                              │
│  Sheet 3: Transactions                                       │
│  ┌──────────────┬────────────┬────────┬───────┬─────────┐    │
│  │ investmentId │ date       │ action │ units │ price   │    │
│  ├──────────────┼────────────┼────────┼───────┼─────────┤    │
│  │ 1            │ 2025-06-15 │ BUY    │ 30    │ 150.00  │    │
│  │ 1            │ 2026-01-05 │ SELL   │ 10    │ 190.00  │    │
│  └──────────────┴────────────┴────────┴───────┴─────────┘    │
│                                                              │
│  Sheet 4: SavingsHistory                                     │
│  ┌──────────┬────────┬──────────┬───────┐                    │
│  │ month    │ income │ expenses │ saved │                    │
│  └──────────┴────────┴──────────┴───────┘                    │
│                                                              │
│  Sheet 5: SavingsGoals                                       │
│  ┌────┬──────┬──────┬────────┬─────────┬──────────┐          │
│  │ id │ name │ icon │ target │ current │ deadline │          │
│  └────┴──────┴──────┴────────┴─────────┴──────────┘          │
│                                                              │
│  Sheet 6: EmergencyFund                                      │
│  ┌────────┬─────────┐                                        │
│  │ target │ current │                                        │
│  └────────┴─────────┘                                        │
└─────────────────────────────────────────────────────────────┘
```

### Investment Categories

```
investments[]
    │
    ├── marketCategories (tradable, have charts)
    │   ├── stocks          → ticker field   → Yahoo Finance
    │   ├── mutual_funds    → schemeCode     → mfapi.in
    │   └── foreign_stocks  → ticker field   → Yahoo Finance
    │
    └── otherCategories (manual price entry)
        ├── gold
        ├── ppf
        ├── nps
        └── fixed_deposit
```

---

## Server (server.py)

The server is a **thin layer** — no business logic, just storage and proxying.

### Responsibilities

```
server.py
    │
    ├── Serve static files (index.html, script.js, style.css)
    │       GET / → index.html
    │
    ├── CRUD API for all data
    │       GET  /api/expenses         → read Expenses sheet
    │       POST /api/expenses         → overwrite Expenses sheet
    │       GET  /api/investments      → read Investments + Transactions
    │       POST /api/investments      → overwrite both sheets
    │       (same pattern for savings-history, savings-goals, emergency-fund)
    │
    ├── Price proxy (solves CORS)
    │       GET /api/price/stock/AAPL  → Python fetches Yahoo Finance
    │       GET /api/price/mf/119551   → Python fetches mfapi.in
    │
    └── Export
            GET /api/export            → download data.xlsx
```

### How Excel Read/Write Works

```
Browser POST /api/investments  ──→  server.py
                                        │
                                   _file_lock (threading.Lock)
                                        │
                                   openpyxl.load_workbook("data.xlsx")
                                        │
                                   delete rows 2..N in Investments sheet
                                   delete rows 2..N in Transactions sheet
                                        │
                                   append new rows from JSON body
                                        │
                                   save to temp file (tmpXXXX.xlsx)
                                        │
                                   shutil.move(temp → data.xlsx)
                                        │  ↑ atomic rename prevents
                                        │    corruption from OneDrive
                                   return {"ok": true}
```

### Concurrency Protection

```
Request A (save expenses) ──┐
                            │  _file_lock
Request B (save investments)│  (only one at a time)
                            │
                     ┌──────▼──────┐
                     │  data.xlsx  │
                     └─────────────┘

Without the lock:  Two writes at the same time → corrupted ZIP file
With the lock:     Requests queue up → safe sequential writes
```

---

## Frontend (script.js)

### Internal Structure

```
script.js
│
├── DATA LAYER
│   ├── let expenses = []
│   ├── let investments = []
│   ├── let savingsHistory = []
│   ├── let savingsGoals = []
│   ├── let emergencyFund = {}
│   └── MOCK_* constants (fallback data)
│
├── API LAYER
│   ├── apiGet(path)           → fetch GET
│   ├── apiPost(path, body)    → fetch POST
│   ├── loadAllData()          → load all from server (or mocks)
│   ├── saveExpenses()         → POST /api/expenses
│   ├── saveInvestments()      → POST /api/investments
│   ├── saveSavingsGoals()     → POST /api/savings-goals
│   ├── saveSavingsHistory()   → POST /api/savings-history
│   └── saveEmergencyFund()    → POST /api/emergency-fund
│
├── PRICE LAYER
│   ├── priceProviders{}       → per-category async fetchers
│   │   ├── mutual_funds()     → server proxy → mfapi.in fallback
│   │   ├── stocks()           → server proxy → Yahoo direct → CORS proxies
│   │   └── foreign_stocks()   → reuses stocks()
│   ├── refreshAllPrices()     → fetch all in parallel
│   ├── refreshAndRender()     → button handler
│   ├── logDebug()             → collects per-attempt details
│   └── renderDebugLog()       → shows debug panel
│
├── RENDER LAYER
│   ├── renderExpensesTable()
│   ├── renderInvestmentsTable()
│   ├── renderStocksSection()      → summary cards + 3 charts + holdings
│   ├── renderOtherSection()       → other investments section
│   ├── renderDashboardCards()     → Total Wealth, Income, Expenses, Savings
│   ├── renderSavingsTable()
│   ├── renderGoals()
│   ├── renderEmergencyFund()
│   ├── renderRecentTransactions()
│   ├── renderInvestmentSnapshot()
│   └── initCharts()               → 5 Chart.js instances
│
├── EVENT LAYER
│   ├── Form submissions (expense, investment, goal, emergency fund)
│   ├── Delete buttons (expense, investment, goal)
│   ├── Clear all buttons
│   ├── Trade modal (buy/sell)
│   ├── Category tab filters
│   ├── Refresh Prices button
│   ├── Navigation (sidebar clicks)
│   └── Export Excel button
│
└── INIT (DOMContentLoaded)
    ├── await loadAllData()
    ├── Update server status badge
    ├── Render all sections
    └── Initialize charts
```

---

## Data Flow Diagrams

### 1. App Startup

```
DOMContentLoaded
       │
       ▼
  loadAllData()
       │
       ├── fetch GET /api/expenses ─────────┐
       ├── fetch GET /api/investments ──────┤
       ├── fetch GET /api/savings-history ──┤ Promise.all()
       ├── fetch GET /api/savings-goals ────┤
       └── fetch GET /api/emergency-fund ───┘
                                            │
              ┌─────────────────────────────┤
              │ Server UP                   │ Server DOWN
              ▼                             ▼
     expenses = server data        expenses = MOCK_EXPENSES
     investments = server data     investments = MOCK_INVESTMENTS
     serverAvailable = true        serverAvailable = false
              │                             │
              ├─────────────────────────────┘
              ▼
     If server had empty sheets:
       POST mock data to seed Excel
              │
              ▼
     renderExpensesTable()
     renderInvestmentsTable()
     renderDashboardCards()
     initCharts()
     ... (all render functions)
```

### 2. User Adds an Expense

```
User fills form → clicks Submit
       │
       ▼
  expenseForm 'submit' handler
       │
       ▼
  expenses.push({
    id: Date.now(),
    date: "2026-04-16",
    description: "Coffee",
    category: "food",
    payment: "card",
    amount: 5.50
  })
       │
       ├──► saveExpenses()
       │         │
       │         ▼  (if serverAvailable)
       │    POST /api/expenses
       │    body: entire expenses[] array
       │         │
       │         ▼  server.py
       │    _write_sheet("Expenses", ...)
       │    → overwrites Expenses sheet in data.xlsx
       │
       ├──► renderExpensesTable()    → update expenses table
       ├──► renderRecentTransactions() → update dashboard
       ├──► renderDashboardCards()   → recalculate totals
       └──► initCharts()            → redraw charts
```

### 3. User Clicks "Refresh Prices"

```
Click "🔄 Refresh Prices"
       │
       ▼
  priceDebugLog = []  (clear old logs)
       │
       ▼
  refreshAllPrices()
       │
       ▼  For each investment in parallel:
  ┌────────────────────────────────────────────────────────┐
  │  Investment: AAPL (category: stocks, ticker: "AAPL")   │
  │       │                                                │
  │       ▼  Strategy 1: Server proxy                      │
  │  fetch /api/price/stock/AAPL                           │
  │       │                                                │
  │       ▼  server.py                                     │
  │  requests.get("https://query1.finance.yahoo.com/       │
  │    v8/finance/chart/AAPL?interval=1d&range=1d",        │
  │    headers={"User-Agent": "Mozilla/5.0"})              │
  │       │                                                │
  │       ▼  ✅ Returns price: 266.37                      │
  │  logDebug("AAPL", "Server proxy", "success", "₹266")  │
  │  return 266.37                                         │
  └────────────────────────────────────────────────────────┘
  ┌────────────────────────────────────────────────────────┐
  │  Investment: VOO (category: mutual_funds, code: 120505)│
  │       │                                                │
  │       ▼  Strategy 1: Server proxy                      │
  │  fetch /api/price/mf/120505                            │
  │       │                                                │
  │       ▼  server.py                                     │
  │  requests.get("https://api.mfapi.in/mf/120505")       │
  │       │                                                │
  │       ▼  ✅ Returns nav: 104.79                        │
  │  return 104.79                                         │
  └────────────────────────────────────────────────────────┘
  ┌────────────────────────────────────────────────────────┐
  │  Investment: PPF (category: ppf)                       │
  │       │                                                │
  │       ▼  Skipped (no live API for PPF)                 │
  │  skipped++                                             │
  └────────────────────────────────────────────────────────┘
       │
       ▼  After all complete:
  saveInvestments()    → persist updated prices to Excel
  renderStocksSection() → re-render with new prices
  renderDashboardCards() → recalculate Total Wealth
  renderDebugLog()     → show what happened in debug panel
       │
       ▼
  Toast: "✅ 5 updated · ⏭️ 4 manual"
```

### 4. Price Fetching Strategy (with fallbacks)

```
priceProviders.stocks(inv)  [inv.ticker = "RELIANCE.NS"]
       │
       ▼  Strategy 1: Local server proxy
  fetch("http://localhost:5000/api/price/stock/RELIANCE.NS")
       │
       ├── ✅ Success? → return price (DONE)
       │
       ├── ❌ Server down? → continue to Strategy 2
       │
       ▼  Strategy 2: Direct Yahoo fetch
  fetch("https://query1.finance.yahoo.com/v8/finance/chart/RELIANCE.NS")
       │
       ├── ✅ Success? → return price (DONE)
       │
       ├── ❌ CORS blocked? → continue to Strategy 3
       │
       ▼  Strategy 3: CORS Proxy rotation (8s timeout each)
       │
       ├── api.codetabs.com/v1/proxy?quest=...
       │   ├── ✅ Success? → return price (DONE)
       │   └── ❌ "Too Many Requests" → next proxy
       │
       ├── api.allorigins.win/raw?url=...
       │   ├── ✅ Success? → return price (DONE)
       │   └── ❌ Timeout → next proxy
       │
       └── corsproxy.io/?...
           ├── ✅ Success? → return price (DONE)
           └── ❌ 403 Forbidden → return null (FAILED)
```

---

## CORS Problem Explained

### What is CORS?

```
CORS = Cross-Origin Resource Sharing

A browser security policy that blocks a webpage from calling
APIs on different domains UNLESS the API says "I allow this".

The API must respond with:
   Access-Control-Allow-Origin: *

If this header is missing → browser blocks the response.
```

### Why it matters for FinTrack

```
                     CORS WALL
                        ║
  Browser               ║          Internet
  (localhost:5000)      ║
                        ║
  fetch(mfapi.in) ──────╬────→  mfapi.in
                        ║       Response headers:
                        ║       Access-Control-Allow-Origin: * ← ✅
                        ║       Browser: "OK, I'll allow it"
                        ║
  fetch(yahoo.com) ─────╬────→  Yahoo Finance
                        ║       Response headers:
                        ║       (no CORS header) ← ❌
                        ║       Browser: "BLOCKED!"
                        ║
                        ║
  BUT: Python has no CORS restrictions!
                        ║
  fetch(localhost) ─────╬────→  server.py ──→ Yahoo Finance
       same origin!     ║       (Python requests library)
       no CORS needed   ║       No browser = No CORS wall
                        ║       ✅ Always works
```

### Why the server solves it

```
Without server:   Browser ──✕──→ Yahoo (CORS blocked)

With server:      Browser ──→ localhost:5000/api/price/stock/AAPL
                                     │
                              server.py (Python)
                                     │
                              requests.get(yahoo.com)
                                     │  ← Python is NOT a browser
                                     │    No CORS restriction
                                     ▼
                              Yahoo responds with price
                                     │
                              server returns JSON to browser
                                     │
                              Browser gets price ✅
```

---

## Live Price Fetching

### Supported APIs

| Category       | API                    | Method              | Status    |
|----------------|------------------------|---------------------|-----------|
| Stocks         | Yahoo Finance v8/chart | Server proxy        | ✅ Works  |
| Mutual Funds   | mfapi.in               | Server proxy/direct | ✅ Works  |
| Foreign Stocks | Yahoo Finance v8/chart | Server proxy        | ✅ Works  |
| Gold           | —                      | Manual entry        | No API    |
| PPF            | —                      | Manual entry        | No API    |
| NPS            | —                      | Manual entry        | No API    |
| Fixed Deposit  | —                      | Manual entry        | No API    |

### Yahoo Finance Ticker Format

| Stock            | Ticker Format  |
|------------------|----------------|
| US stocks        | `AAPL`, `MSFT` |
| Indian stocks    | `RELIANCE.NS`  |
| BSE stocks       | `RELIANCE.BO`  |
| UK stocks        | `VOD.L`        |
| Crypto           | `BTC-USD`      |

---

## How to Run

### First Time Setup
```bash
cd finance-tracker
pip install flask flask-cors openpyxl requests
```

### Start the Server
```bash
python server.py
```
Output:
```
✅ Created fresh data.xlsx
FinTrack server running at http://localhost:5000
```

### Open the App
Navigate to **http://localhost:5000** in your browser.

### What Happens on First Launch
1. Server creates `data.xlsx` with empty sheets
2. Browser loads page, calls all GET endpoints
3. Server returns empty arrays
4. `script.js` detects empty data → seeds with mock data
5. Mock data is POSTed back to server → saved to Excel
6. Subsequent refreshes load from Excel (mock data persists)

### Without the Server
Open `index.html` directly as a file — app works with mock data but:
- No persistence (data lost on refresh)
- Stock prices won't fetch (CORS)
- Export button won't work
