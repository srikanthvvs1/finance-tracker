"""
FinTrack Local Server  (Google Sheets backend)
───────────────────────────────────────────────
A lightweight Flask server that:
  1. Serves the static front-end (index.html, script.js, style.css)
  2. Persists all data to a Google Sheet via gspread
  3. Proxies live price requests to Yahoo Finance & mfapi.in (no CORS issues)

Run:  python server.py
Open: http://localhost:5000
"""

import os
import threading
import time
from datetime import date, datetime
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import gspread
from google.oauth2.service_account import Credentials
import requests as http_requests   # avoid clash with flask.request

# ─── Config ─────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent
CREDS_FILE = BASE_DIR / "config" / "fintrack-493517-0fc9cad0c9c8.json"
SPREADSHEET_ID = "179J-FOXHWPz0g19NJy0GxS-SYxRvClS4-IsL6hW7-2U"

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

STATIC_DIR = BASE_DIR / "static"
app = Flask(__name__, static_folder=str(STATIC_DIR), static_url_path="")
CORS(app)

# ─── Thread-safe gspread client ─────────────────────────────────
_gs_lock = threading.Lock()
_gc = None
_sh = None


def _get_spreadsheet():
    """Return the cached gspread Spreadsheet object (thread-safe)."""
    global _gc, _sh
    if _sh is not None:
        return _sh
    with _gs_lock:
        if _sh is not None:
            return _sh
        creds = Credentials.from_service_account_file(str(CREDS_FILE), scopes=SCOPES)
        _gc = gspread.authorize(creds)
        _sh = _gc.open_by_key(SPREADSHEET_ID)
        return _sh


def _ws(name):
    """Get a worksheet by name."""
    return _get_spreadsheet().worksheet(name)


# ─── Column definitions (same as before) ────────────────────────
EXPENSE_COLS = ["id", "date", "description", "category", "payment", "amount"]
INVESTMENT_COLS = [
    "id", "asset", "name", "category", "units", "buyPrice",
    "currentPrice", "date", "marketCap", "riskLevel", "ticker", "schemeCode",
]
TRANSACTION_COLS = ["investmentId", "date", "action", "units", "price"]
SAVINGS_HIST_COLS = ["month", "income", "expenses", "invested", "emergency", "net_saved"]
SAVINGS_GOAL_COLS = ["id", "name", "icon", "target", "current", "deadline"]
EMERGENCY_COLS = ["target"]
EMERGENCY_CONTRIB_COLS = ["id", "date", "amount", "note"]

# Numeric columns that should be cast to float/int on read
_NUMERIC = {"id", "investmentId", "amount", "units", "buyPrice", "currentPrice",
            "price", "target", "current", "income", "expenses", "invested",
            "emergency", "net_saved"}
_INT_COLS = {"id", "investmentId"}


# ═══════════════════════════════════════════════════════════════
#  GOOGLE SHEETS HELPERS
# ═══════════════════════════════════════════════════════════════

def _parse_num(val):
    """Try to parse a string as a number, return original if not possible."""
    if val is None or val == "":
        return 0
    if isinstance(val, (int, float)):
        return val
    try:
        s = str(val).replace(",", "")
        if "." in s:
            return float(s)
        return int(s)
    except (ValueError, TypeError):
        return val


def _read_sheet(sheet_name, columns):
    """Read an entire sheet into a list of dicts, with retry."""
    for attempt in range(3):
        try:
            ws = _ws(sheet_name)
            rows = ws.get_all_values()
            if not rows:
                return []
            # Skip header row
            header = rows[0]
            result = []
            for row in rows[1:]:
                obj = {}
                for i, col in enumerate(columns):
                    val = row[i] if i < len(row) else None
                    if col in _NUMERIC:
                        val = _parse_num(val)
                        if col in _INT_COLS:
                            val = int(val) if val else 0
                    obj[col] = val if val != "" else None
                result.append(obj)
            return result
        except gspread.exceptions.APIError as e:
            if e.response.status_code == 429 and attempt < 2:
                time.sleep(2 * (attempt + 1))
            else:
                raise


def _write_sheet(sheet_name, columns, rows):
    """Overwrite a worksheet (header + data) in one batch call."""
    for attempt in range(3):
        try:
            ws = _ws(sheet_name)
            # Build values: header row + data rows
            values = [columns]
            for obj in rows:
                row_vals = []
                for c in columns:
                    v = obj.get(c)
                    if v is None:
                        v = ""
                    elif isinstance(v, (date, datetime)):
                        v = v.isoformat()[:10]
                    else:
                        v = str(v) if not isinstance(v, (int, float)) else v
                    row_vals.append(v)
                values.append(row_vals)
            ws.clear()
            if values:
                ws.update(range_name="A1", values=values)
            return
        except gspread.exceptions.APIError as e:
            if e.response.status_code == 429 and attempt < 2:
                time.sleep(2 * (attempt + 1))
            else:
                raise


def _write_sheets(sheet_data):
    """Write multiple sheets."""
    for sheet_name, columns, rows in sheet_data:
        _write_sheet(sheet_name, columns, rows)


# ═══════════════════════════════════════════════════════════════
#  SEED DATA  (only if sheets are empty)
# ═══════════════════════════════════════════════════════════════

def _ensure_worksheets():
    """Create worksheets and seed data if the spreadsheet is empty."""
    sh = _get_spreadsheet()
    existing = [ws.title for ws in sh.worksheets()]

    needed = {
        "Expenses":       (EXPENSE_COLS, 200, len(EXPENSE_COLS)),
        "Investments":    (INVESTMENT_COLS, 50, len(INVESTMENT_COLS)),
        "Transactions":   (TRANSACTION_COLS, 100, len(TRANSACTION_COLS)),
        "SavingsGoals":   (SAVINGS_GOAL_COLS, 20, len(SAVINGS_GOAL_COLS)),
        "EmergencyFund":  (EMERGENCY_COLS, 5, len(EMERGENCY_COLS)),
        "EFContributions":(EMERGENCY_CONTRIB_COLS, 50, len(EMERGENCY_CONTRIB_COLS)),
        "SavingsHistory": (SAVINGS_HIST_COLS, 30, len(SAVINGS_HIST_COLS)),
    }

    created_any = False
    for name, (cols, rows_hint, cols_hint) in needed.items():
        if name not in existing:
            sh.add_worksheet(title=name, rows=rows_hint, cols=cols_hint)
            ws = sh.worksheet(name)
            ws.update(range_name="A1", values=[cols])
            created_any = True
            print(f"  [+] Created worksheet: {name}")

    # Remove default "Sheet1" if our sheets exist
    if "Sheet1" in existing and len(existing) > 1:
        try:
            sh.del_worksheet(sh.worksheet("Sheet1"))
        except Exception:
            pass

    # Check if Expenses sheet has data (beyond header)
    ws_exp = sh.worksheet("Expenses")
    all_vals = ws_exp.get_all_values()
    if len(all_vals) <= 1:
        _seed_all_data()
    elif created_any:
        print("  [i] Some worksheets created but Expenses has data -- skipping seed")
    else:
        print("  [OK] Google Sheet already has data")


def _seed_all_data():
    """Populate all worksheets with seed data."""
    print("  [*] Seeding data to Google Sheet...")

    # ── Expenses ────────────────────────────────────────────────
    seed_expenses = [
        [101, "2025-05-01", "Monthly Rent",       "housing",       "transfer", 22000],
        [102, "2025-05-05", "Groceries",          "food",          "upi",      4500],
        [103, "2025-05-10", "Electricity Bill",    "utilities",     "transfer", 1400],
        [104, "2025-05-15", "Dining Out",          "food",          "card",     2100],
        [105, "2025-05-20", "Uber Rides",          "travel",        "upi",      1200],
        [106, "2025-05-25", "Amazon Shopping",     "shopping",      "card",     3800],
        [107, "2025-05-28", "Gym + Pharmacy",      "health",        "upi",      2000],
        [108, "2025-05-30", "Netflix + Spotify",   "entertainment", "card",     499],
        [109, "2025-05-30", "Internet + Phone",    "utilities",     "transfer", 1500],

        [201, "2025-06-01", "Monthly Rent",       "housing",       "transfer", 22000],
        [202, "2025-06-05", "Groceries",          "food",          "upi",      4200],
        [203, "2025-06-12", "Electricity Bill",    "utilities",     "transfer", 1350],
        [204, "2025-06-18", "Restaurant",          "food",          "card",     1800],
        [205, "2025-06-22", "Travel Tickets",      "travel",        "card",     3200],
        [206, "2025-06-28", "Health Checkup",      "health",        "upi",      2500],
        [207, "2025-06-30", "Subscriptions",       "entertainment", "card",     499],
        [208, "2025-06-30", "Utilities",           "utilities",     "transfer", 1500],

        [301, "2025-07-01", "Monthly Rent",       "housing",       "transfer", 22000],
        [302, "2025-07-06", "Groceries",          "food",          "upi",      5200],
        [303, "2025-07-10", "Electricity Bill",    "utilities",     "transfer", 1800],
        [304, "2025-07-15", "Swiggy Orders",       "food",          "upi",      2800],
        [305, "2025-07-20", "Weekend Trip",         "travel",        "card",     5500],
        [306, "2025-07-25", "Clothes Shopping",     "shopping",      "card",     4200],
        [307, "2025-07-30", "Subscriptions",       "entertainment", "card",     499],
        [308, "2025-07-30", "Utilities + Phone",   "utilities",     "transfer", 1500],

        [401, "2025-08-01", "Monthly Rent",       "housing",       "transfer", 22000],
        [402, "2025-08-05", "Groceries",          "food",          "upi",      4800],
        [403, "2025-08-10", "Electricity Bill",    "utilities",     "transfer", 1500],
        [404, "2025-08-16", "Dining + Food",       "food",          "card",     2400],
        [405, "2025-08-22", "Cab Rides",           "travel",        "upi",      1800],
        [406, "2025-08-28", "Pharmacy",            "health",        "upi",      1200],
        [407, "2025-08-30", "Subscriptions",       "entertainment", "card",     499],
        [408, "2025-08-30", "Internet + Phone",    "utilities",     "transfer", 1500],

        [501, "2025-09-01", "Monthly Rent",       "housing",       "transfer", 22000],
        [502, "2025-09-04", "Groceries",          "food",          "upi",      4000],
        [503, "2025-09-10", "Electricity Bill",    "utilities",     "transfer", 1300],
        [504, "2025-09-14", "Restaurant Bills",    "food",          "card",     1600],
        [505, "2025-09-20", "Train Tickets",       "travel",        "card",     2100],
        [506, "2025-09-26", "Gym Membership",      "health",        "transfer", 1500],
        [507, "2025-09-30", "Subscriptions",       "entertainment", "card",     499],
        [508, "2025-09-30", "Utilities",           "utilities",     "transfer", 1500],

        [601, "2025-10-01", "Monthly Rent",       "housing",       "transfer", 23000],
        [602, "2025-10-05", "Groceries",          "food",          "upi",      4600],
        [603, "2025-10-10", "Electricity Bill",    "utilities",     "transfer", 1400],
        [604, "2025-10-15", "Diwali Shopping",     "shopping",      "card",     8000],
        [605, "2025-10-20", "Food Orders",         "food",          "upi",      2200],
        [606, "2025-10-30", "Subscriptions",       "entertainment", "card",     499],
        [607, "2025-10-30", "Utilities",           "utilities",     "transfer", 1500],

        [701, "2025-11-01", "Monthly Rent",       "housing",       "transfer", 23000],
        [702, "2025-11-05", "Groceries",          "food",          "upi",      5000],
        [703, "2025-11-10", "Electricity Bill",    "utilities",     "transfer", 1600],
        [704, "2025-11-15", "Restaurant",          "food",          "card",     2500],
        [705, "2025-11-20", "Flight Tickets",      "travel",        "card",     6500],
        [706, "2025-11-25", "Winter Clothes",      "shopping",      "card",     3500],
        [707, "2025-11-30", "Subscriptions",       "entertainment", "card",     499],
        [708, "2025-11-30", "Utilities",           "utilities",     "transfer", 1500],

        [801, "2025-12-01", "Monthly Rent",       "housing",       "transfer", 23000],
        [802, "2025-12-05", "Groceries",          "food",          "upi",      5500],
        [803, "2025-12-10", "Electricity Bill",    "utilities",     "transfer", 1500],
        [804, "2025-12-15", "Christmas Dinner",    "food",          "card",     3000],
        [805, "2025-12-20", "New Year Trip",       "travel",        "card",     8000],
        [806, "2025-12-25", "Gifts Shopping",      "shopping",      "card",     5000],
        [807, "2025-12-28", "Health Checkup",      "health",        "upi",      3000],
        [808, "2025-12-30", "Subscriptions",       "entertainment", "card",     499],
        [809, "2025-12-30", "Utilities",           "utilities",     "transfer", 1500],

        [901, "2026-01-01", "Monthly Rent",       "housing",       "transfer", 25000],
        [902, "2026-01-05", "Groceries",          "food",          "upi",      4800],
        [903, "2026-01-10", "Electricity Bill",    "utilities",     "transfer", 1400],
        [904, "2026-01-15", "Dining Out",          "food",          "card",     1800],
        [905, "2026-01-20", "Metro Pass",          "travel",        "upi",      1200],
        [906, "2026-01-28", "Pharmacy",            "health",        "upi",      1300],
        [907, "2026-01-30", "Subscriptions",       "entertainment", "card",     499],
        [908, "2026-01-30", "Utilities",           "utilities",     "transfer", 1500],

        [1001, "2026-02-01", "Monthly Rent",      "housing",       "transfer", 25000],
        [1002, "2026-02-05", "Groceries",         "food",          "upi",      4200],
        [1003, "2026-02-10", "Electricity Bill",   "utilities",     "transfer", 1300],
        [1004, "2026-02-14", "Valentine Dinner",   "food",          "card",     2500],
        [1005, "2026-02-20", "Uber Rides",         "travel",        "upi",      900],
        [1006, "2026-02-28", "Subscriptions",      "entertainment", "card",     499],
        [1007, "2026-02-28", "Utilities",          "utilities",     "transfer", 1500],

        [1101, "2026-03-01", "Monthly Rent",      "housing",       "transfer", 25000],
        [1102, "2026-03-05", "Groceries",         "food",          "upi",      4500],
        [1103, "2026-03-10", "Electricity Bill",   "utilities",     "transfer", 1500],
        [1104, "2026-03-15", "Holi Party",         "food",          "card",     2000],
        [1105, "2026-03-20", "Train Tickets",      "travel",        "card",     1800],
        [1106, "2026-03-25", "Gym Renewal",        "health",        "transfer", 1500],
        [1107, "2026-03-30", "Subscriptions",      "entertainment", "card",     499],
        [1108, "2026-03-30", "Utilities",          "utilities",     "transfer", 1500],

        # Current month — April 2026
        [1,  "2026-04-01", "Monthly Rent",          "housing",       "transfer", 25000],
        [2,  "2026-04-02", "Grocery - BigBasket",   "food",          "upi",      3200],
        [3,  "2026-04-03", "Swiggy - Dinner",       "food",          "upi",      450],
        [4,  "2026-04-04", "Train Ticket - Mumbai",  "travel",       "card",     1850],
        [5,  "2026-04-05", "Netflix + Spotify",      "entertainment","card",     499],
        [6,  "2026-04-06", "Apollo Pharmacy",        "health",       "upi",      780],
        [7,  "2026-04-07", "Electricity Bill",       "utilities",    "transfer", 1650],
        [8,  "2026-04-08", "Team Lunch",             "food",         "card",     1200],
        [9,  "2026-04-09", "Amazon - Headphones",    "shopping",     "card",     2499],
        [10, "2026-04-10", "Uber Rides",             "travel",       "upi",      680],
        [11, "2026-04-11", "Phone Bill - Airtel",    "utilities",    "transfer", 599],
        [12, "2026-04-12", "Dinner - Restaurant",    "food",         "card",     1550],
        [13, "2026-04-13", "Internet Bill - ACT",    "utilities",    "transfer", 999],
        [14, "2026-04-14", "Gym Membership",         "health",       "transfer", 1500],
        [15, "2026-04-15", "Zara - Clothes",         "shopping",     "card",     3800],
    ]
    values = [EXPENSE_COLS] + seed_expenses
    _ws("Expenses").clear()
    _ws("Expenses").update(range_name="A1", values=values)
    print("    Expenses seeded")

    # ── Investments ─────────────────────────────────────────────
    seed_investments = [
        [1,  "RELIANCE",  "Reliance Industries",       "stocks",        50,  2450, 2850, "2025-06-15", "large",  "moderate", "RELIANCE.NS",  ""],
        [2,  "TCS",       "Tata Consultancy Services",  "stocks",        30,  3400, 3780, "2025-07-20", "large",  "low",      "TCS.NS",       ""],
        [3,  "INFY",      "Infosys Ltd",               "stocks",        40,  1500, 1620, "2025-08-10", "large",  "low",      "INFY.NS",      ""],
        [4,  "HDFCBANK",  "HDFC Bank Ltd",             "stocks",        25,  1650, 1740, "2025-09-05", "large",  "low",      "HDFCBANK.NS",  ""],
        [5,  "BAJFINANCE","Bajaj Finance Ltd",         "stocks",        15,  6800, 7250, "2025-05-01", "large",  "high",     "BAJFINANCE.NS",""],
        [6,  "AAPL",      "Apple Inc.",                "foreign_stocks",10,  14500,18900,"2025-06-15", "large",  "moderate", "AAPL",         ""],
        [7,  "MSFT",      "Microsoft Corp.",           "foreign_stocks", 8,  28000,32500,"2025-08-10", "large",  "low",      "MSFT",         ""],
        [8,  "HDFC-MF",   "HDFC Mid-Cap Opp Fund",    "mutual_funds",  200, 105,  128.5, "2025-03-01", "mid",    "moderate", "",             "118989"],
        [9,  "PARAG-MF",  "Parag Parikh Flexi Cap",   "mutual_funds",  150, 55,   68.4,  "2025-05-20", "large",  "moderate", "",             "122639"],
        [10, "AXIS-MF",   "Axis Small Cap Fund",      "mutual_funds",  300, 72,   84.2,  "2025-04-10", "small",  "high",     "",             "125354"],
        [11, "GOLD-SGB",  "Sovereign Gold Bond 2025",  "gold",          10,  5800, 7200,  "2025-01-10", "",       "",         "",             ""],
        [12, "GOLD-PHY",  "Physical Gold 24K",         "gold",          20,  6100, 7200,  "2024-11-20", "",       "",         "",             ""],
        [13, "PPF-SBI",   "PPF - State Bank",          "ppf",           1,   150000,168750,"2024-04-01","",       "",         "",             ""],
        [14, "NPS-TIER1", "NPS Tier-1 Equity",         "nps",           500, 42,   52.6,  "2024-04-01", "",       "",         "",             ""],
        [15, "FD-SBI",    "SBI FD 3yr @7.1%",          "fixed_deposit", 1,   300000,321300,"2025-01-15","",       "",         "",             ""],
        [16, "FD-HDFC",   "HDFC FD 2yr @7.0%",        "fixed_deposit", 1,   200000,214000,"2025-06-01","",       "",         "",             ""],
    ]
    values = [INVESTMENT_COLS] + seed_investments
    _ws("Investments").clear()
    _ws("Investments").update(range_name="A1", values=values)
    print("    Investments seeded")

    # ── Transactions ────────────────────────────────────────────
    seed_transactions = [
        [1,  "2025-06-15", "BUY",  30, 2400],
        [1,  "2025-09-10", "BUY",  30, 2500],
        [1,  "2026-01-05", "SELL", 10, 2700],
        [2,  "2025-07-20", "BUY",  30, 3400],
        [3,  "2025-08-10", "BUY",  40, 1500],
        [4,  "2025-09-05", "BUY",  25, 1650],
        [5,  "2025-05-01", "BUY",  20, 6500],
        [5,  "2025-11-15", "SELL",  5, 7100],
        [6,  "2025-06-15", "BUY",  10, 14500],
        [7,  "2025-08-10", "BUY",   8, 28000],
        [8,  "2025-03-01", "BUY", 100, 100],
        [8,  "2025-07-15", "BUY", 100, 110],
        [9,  "2025-05-20", "BUY", 150,  55],
        [10, "2025-04-10", "BUY", 300,  72],
        [11, "2025-01-10", "BUY",  10, 5800],
        [12, "2024-11-20", "BUY",  20, 6100],
        [13, "2024-04-01", "BUY",   1, 150000],
        [14, "2024-04-01", "BUY", 500,  42],
        [15, "2025-01-15", "BUY",   1, 300000],
        [16, "2025-06-01", "BUY",   1, 200000],
    ]
    values = [TRANSACTION_COLS] + seed_transactions
    _ws("Transactions").clear()
    _ws("Transactions").update(range_name="A1", values=values)
    print("    Transactions seeded")

    # ── Savings Goals ───────────────────────────────────────────
    seed_goals = [
        [1, "Emergency Fund",     "\U0001f3e5", 500000,  350000, "2026-12-31"],
        [2, "Vacation - Japan",   "\u2708\ufe0f", 300000, 180000, "2026-09-01"],
        [3, "New Laptop",         "\U0001f4bb", 150000,  150000, "2026-06-01"],
        [4, "Home Down Payment",  "\U0001f3e0", 2500000, 650000, "2028-12-31"],
        [5, "Wedding Fund",       "\U0001f48d", 1500000, 420000, "2027-06-01"],
    ]
    values = [SAVINGS_GOAL_COLS] + seed_goals
    _ws("SavingsGoals").clear()
    _ws("SavingsGoals").update(range_name="A1", values=values)
    print("    SavingsGoals seeded")

    # ── Emergency Fund ──────────────────────────────────────────
    _ws("EmergencyFund").clear()
    _ws("EmergencyFund").update(range_name="A1", values=[EMERGENCY_COLS, [500000]])
    print("    EmergencyFund seeded")

    # ── EF Contributions ────────────────────────────────────────
    seed_ef_contribs = [
        [1,  "2025-05-05", 25000, "Initial deposit"],
        [2,  "2025-06-05", 25000, "Monthly contribution"],
        [3,  "2025-07-05", 30000, "Monthly contribution"],
        [4,  "2025-08-05", 25000, "Monthly contribution"],
        [5,  "2025-09-05", 25000, "Monthly contribution"],
        [6,  "2025-10-05", 30000, "Monthly contribution"],
        [7,  "2025-11-05", 25000, "Monthly contribution"],
        [8,  "2025-12-05", 30000, "Bonus month extra"],
        [9,  "2026-01-05", 25000, "Monthly contribution"],
        [10, "2026-02-05", 35000, "Tax refund added"],
        [11, "2026-03-05", 50000, "Salary hike bump"],
        [12, "2026-04-05", 25000, "Monthly contribution"],
    ]
    values = [EMERGENCY_CONTRIB_COLS] + seed_ef_contribs
    _ws("EFContributions").clear()
    _ws("EFContributions").update(range_name="A1", values=values)
    print("    EFContributions seeded")

    # ── Savings History ─────────────────────────────────────────
    # Pre-compute from seed data
    _exp_by_month = {}
    for row in seed_expenses:
        d = row[1]  # date string "YYYY-MM-DD"
        mo = datetime.strptime(d, "%Y-%m-%d")
        key = mo.strftime("%b %Y")
        _exp_by_month[key] = _exp_by_month.get(key, 0) + row[5]

    _inv_by_month = {}
    for row in seed_transactions:
        if row[2] == "BUY":
            d = row[1]
            mo = datetime.strptime(d, "%Y-%m-%d")
            key = mo.strftime("%b %Y")
            _inv_by_month[key] = _inv_by_month.get(key, 0) + (row[3] * row[4])

    _ef_by_month = {}
    for row in seed_ef_contribs:
        d = row[1]
        mo = datetime.strptime(d, "%Y-%m-%d")
        key = mo.strftime("%b %Y")
        _ef_by_month[key] = _ef_by_month.get(key, 0) + row[2]

    seed_incomes = {
        "May 2025": 85000, "Jun 2025": 85000, "Jul 2025": 87000,
        "Aug 2025": 87000, "Sep 2025": 87000, "Oct 2025": 90000,
        "Nov 2025": 90000, "Dec 2025": 90000, "Jan 2026": 90000,
        "Feb 2026": 92000, "Mar 2026": 92000, "Apr 2026": 95000,
    }
    seed_history = []
    for label, income in seed_incomes.items():
        exp = _exp_by_month.get(label, 0)
        inv = _inv_by_month.get(label, 0)
        ef  = _ef_by_month.get(label, 0)
        net = income - exp - inv - ef
        seed_history.append([label, income, exp, inv, ef, net])

    values = [SAVINGS_HIST_COLS] + seed_history
    _ws("SavingsHistory").clear()
    _ws("SavingsHistory").update(range_name="A1", values=values)
    print("    SavingsHistory seeded")

    print("  [OK] All seed data written to Google Sheet")


# ═══════════════════════════════════════════════════════════════
#  STATIC FILE SERVING
# ═══════════════════════════════════════════════════════════════

@app.route("/")
def index():
    return send_from_directory(str(STATIC_DIR), "index.html")


# ═══════════════════════════════════════════════════════════════
#  API: USER INFO
# ═══════════════════════════════════════════════════════════════

@app.route("/api/user-info")
def user_info():
    """Return the OS full display name and data source info."""
    fullname = None
    try:
        import ctypes
        GetUserNameExW = ctypes.windll.secur32.GetUserNameExW
        NameDisplay = 3
        buf = ctypes.create_unicode_buffer(256)
        size = ctypes.pointer(ctypes.c_ulong(256))
        if GetUserNameExW(NameDisplay, buf, size):
            fullname = buf.value
    except Exception:
        pass
    if not fullname:
        fullname = os.environ.get("USERNAME") or os.environ.get("USER") or "User"
    return jsonify({
        "username": fullname,
        "initials": "".join(w[0].upper() for w in fullname.split() if w)[:2] or fullname[:2].upper(),
        "dataDir": f"Google Sheet ({SPREADSHEET_ID[:12]}…)",
    })


# ═══════════════════════════════════════════════════════════════
#  API: EXPENSES
# ═══════════════════════════════════════════════════════════════

@app.route("/api/expenses", methods=["GET"])
def get_expenses():
    rows = _read_sheet("Expenses", EXPENSE_COLS)
    for r in rows:
        r["id"] = int(r["id"]) if r["id"] else 0
        r["amount"] = float(r["amount"]) if r["amount"] else 0
    return jsonify(rows)


@app.route("/api/expenses", methods=["POST"])
def save_expenses():
    data = request.get_json(force=True)
    if not isinstance(data, list):
        return jsonify({"error": "Expected array"}), 400
    _write_sheet("Expenses", EXPENSE_COLS, data)
    return jsonify({"ok": True, "count": len(data)})


# ═══════════════════════════════════════════════════════════════
#  API: INVESTMENTS  (includes nested transactions)
# ═══════════════════════════════════════════════════════════════

@app.route("/api/investments", methods=["GET"])
def get_investments():
    invs = _read_sheet("Investments", INVESTMENT_COLS)
    txns = _read_sheet("Transactions", TRANSACTION_COLS)

    for r in invs:
        r["id"] = int(r["id"]) if r["id"] else 0
        r["units"] = float(r["units"]) if r["units"] else 0
        r["buyPrice"] = float(r["buyPrice"]) if r["buyPrice"] else 0
        r["currentPrice"] = float(r["currentPrice"]) if r["currentPrice"] else 0
        r["transactions"] = []

    inv_map = {r["id"]: r for r in invs}
    for t in txns:
        inv_id = int(t["investmentId"]) if t["investmentId"] else 0
        if inv_id in inv_map:
            inv_map[inv_id]["transactions"].append({
                "date": t["date"],
                "action": t["action"],
                "units": float(t["units"]) if t["units"] else 0,
                "price": float(t["price"]) if t["price"] else 0,
            })

    return jsonify(invs)


@app.route("/api/investments", methods=["POST"])
def save_investments():
    data = request.get_json(force=True)
    if not isinstance(data, list):
        return jsonify({"error": "Expected array"}), 400

    inv_rows = []
    txn_rows = []
    for inv in data:
        inv_rows.append({c: inv.get(c) for c in INVESTMENT_COLS})
        for txn in inv.get("transactions", []):
            txn_rows.append({
                "investmentId": inv["id"],
                "date": txn.get("date"),
                "action": txn.get("action"),
                "units": txn.get("units"),
                "price": txn.get("price"),
            })

    _write_sheets([
        ("Investments", INVESTMENT_COLS, inv_rows),
        ("Transactions", TRANSACTION_COLS, txn_rows),
    ])
    return jsonify({"ok": True, "count": len(inv_rows)})


# ═══════════════════════════════════════════════════════════════
#  API: SAVINGS HISTORY
# ═══════════════════════════════════════════════════════════════

_MONTH_ABBREVS = ["Jan","Feb","Mar","Apr","May","Jun",
                  "Jul","Aug","Sep","Oct","Nov","Dec"]

def _parse_month_label(label):
    """'Apr 2026' -> (2026, 4) or None."""
    parts = (label or "").split()
    if len(parts) != 2:
        return None
    try:
        mi = _MONTH_ABBREVS.index(parts[0]) + 1
        yr = int(parts[1])
        return yr, mi
    except (ValueError, IndexError):
        return None


def _compute_derived_savings(rows):
    """Enrich savings-history rows with expenses/invested/emergency/net_saved."""
    exp_map = {}
    for e in _read_sheet("Expenses", EXPENSE_COLS):
        d = str(e.get("date") or "")
        key = d[:7]
        exp_map[key] = exp_map.get(key, 0) + (float(e["amount"]) if e["amount"] else 0)

    inv_map = {}
    for t in _read_sheet("Transactions", TRANSACTION_COLS):
        if (str(t.get("action") or "")).upper() == "BUY":
            d = str(t.get("date") or "")
            key = d[:7]
            units = float(t["units"]) if t["units"] else 0
            price = float(t["price"]) if t["price"] else 0
            inv_map[key] = inv_map.get(key, 0) + units * price

    ef_map = {}
    for c in _read_sheet("EFContributions", EMERGENCY_CONTRIB_COLS):
        d = str(c.get("date") or "")
        key = d[:7]
        ef_map[key] = ef_map.get(key, 0) + (float(c["amount"]) if c["amount"] else 0)

    for r in rows:
        parsed = _parse_month_label(r.get("month"))
        if not parsed:
            continue
        yr, mi = parsed
        ym = f"{yr}-{mi:02d}"
        income  = float(r["income"]) if r["income"] else 0
        exp     = exp_map.get(ym, 0)
        inv     = inv_map.get(ym, 0)
        ef      = ef_map.get(ym, 0)
        r["income"]    = income
        r["expenses"]  = exp
        r["invested"]  = inv
        r["emergency"] = ef
        r["net_saved"] = income - exp - inv - ef
    return rows


@app.route("/api/savings-history", methods=["GET"])
def get_savings_history():
    rows = _read_sheet("SavingsHistory", SAVINGS_HIST_COLS)
    rows = _compute_derived_savings(rows)
    return jsonify(rows)


@app.route("/api/savings-history", methods=["POST"])
def save_savings_history():
    data = request.get_json(force=True)
    if not isinstance(data, list):
        return jsonify({"error": "Expected array"}), 400
    data = _compute_derived_savings(data)
    _write_sheet("SavingsHistory", SAVINGS_HIST_COLS, data)
    return jsonify({"ok": True, "count": len(data)})


@app.route("/api/savings-history/<month_label>", methods=["PATCH"])
def patch_savings_month(month_label):
    """Update or create income for a single month."""
    body = request.get_json(force=True)
    income = body.get("income")
    if income is None:
        return jsonify({"error": "income required"}), 400
    rows = _read_sheet("SavingsHistory", SAVINGS_HIST_COLS)
    found = False
    for r in rows:
        if r["month"] == month_label:
            r["income"] = income
            found = True
            break
    if not found:
        rows.append({"month": month_label, "income": income})
    rows = _compute_derived_savings(rows)
    _write_sheet("SavingsHistory", SAVINGS_HIST_COLS, rows)
    return jsonify({"ok": True, "month": month_label, "income": income})


# ═══════════════════════════════════════════════════════════════
#  API: SAVINGS GOALS
# ═══════════════════════════════════════════════════════════════

@app.route("/api/savings-goals", methods=["GET"])
def get_savings_goals():
    rows = _read_sheet("SavingsGoals", SAVINGS_GOAL_COLS)
    for r in rows:
        r["id"] = int(r["id"]) if r["id"] else 0
        r["target"] = float(r["target"]) if r["target"] else 0
        r["current"] = float(r["current"]) if r["current"] else 0
    return jsonify(rows)


@app.route("/api/savings-goals", methods=["POST"])
def save_savings_goals():
    data = request.get_json(force=True)
    if not isinstance(data, list):
        return jsonify({"error": "Expected array"}), 400
    _write_sheet("SavingsGoals", SAVINGS_GOAL_COLS, data)
    return jsonify({"ok": True, "count": len(data)})


# ═══════════════════════════════════════════════════════════════
#  API: EMERGENCY FUND
# ═══════════════════════════════════════════════════════════════

@app.route("/api/emergency-fund", methods=["GET"])
def get_emergency_fund():
    rows = _read_sheet("EmergencyFund", EMERGENCY_COLS)
    target = float(rows[0]["target"]) if rows and rows[0]["target"] else 500000

    contribs = _read_sheet("EFContributions", EMERGENCY_CONTRIB_COLS)
    contrib_list = []
    for c in contribs:
        contrib_list.append({
            "id":     int(c["id"]) if c["id"] else 0,
            "date":   str(c["date"]) if c["date"] else "",
            "amount": float(c["amount"]) if c["amount"] else 0,
            "note":   str(c["note"]) if c["note"] else "",
        })
    current = sum(c["amount"] for c in contrib_list)
    return jsonify({"target": target, "current": current, "contributions": contrib_list})


@app.route("/api/emergency-fund", methods=["POST"])
def save_emergency_fund():
    data = request.get_json(force=True)
    _write_sheet("EmergencyFund", EMERGENCY_COLS, [{"target": data.get("target", 500000)}])
    contribs = data.get("contributions", [])
    rows = []
    for c in contribs:
        rows.append({
            "id":     c.get("id", 0),
            "date":   c.get("date", ""),
            "amount": c.get("amount", 0),
            "note":   c.get("note", ""),
        })
    _write_sheet("EFContributions", EMERGENCY_CONTRIB_COLS, rows)
    return jsonify({"ok": True})


# ═══════════════════════════════════════════════════════════════
#  API: PRICE PROXY  (Yahoo Finance + mfapi.in)
# ═══════════════════════════════════════════════════════════════

@app.route("/api/price/stock/<ticker>")
def proxy_stock_price(ticker):
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?interval=1d&range=1d"
    headers = {"User-Agent": "Mozilla/5.0"}
    try:
        resp = http_requests.get(url, headers=headers, timeout=15, verify=True)
        if resp.status_code != 200:
            return jsonify({"error": f"Yahoo returned {resp.status_code}"}), 502
        data = resp.json()
        meta = data.get("chart", {}).get("result", [{}])[0].get("meta", {})
        price = meta.get("regularMarketPrice")
        return jsonify({
            "price": price,
            "name": meta.get("longName") or meta.get("shortName"),
            "currency": meta.get("currency"),
            "high": meta.get("regularMarketDayHigh"),
            "low": meta.get("regularMarketDayLow"),
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 502


@app.route("/api/price/mf/<scheme_code>")
def proxy_mf_price(scheme_code):
    url = f"https://api.mfapi.in/mf/{scheme_code}"
    try:
        resp = http_requests.get(url, timeout=10)
        if resp.status_code != 200:
            return jsonify({"error": f"MFAPI returned {resp.status_code}"}), 502
        data = resp.json()
        nav_entry = (data.get("data") or [{}])[0]
        return jsonify({
            "nav": float(nav_entry.get("nav", 0)),
            "date": nav_entry.get("date"),
            "name": data.get("meta", {}).get("scheme_name"),
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 502


# ═══════════════════════════════════════════════════════════════
#  API: DOCUMENTS
# ═══════════════════════════════════════════════════════════════

DOCS_DIR = BASE_DIR / "documents"
DOC_CATEGORIES = ["salary_slips", "tax", "insurance", "investments", "bank_statements"]

import re
from werkzeug.utils import secure_filename


def _ensure_doc_dirs():
    """Create documents folder structure if missing."""
    for cat in DOC_CATEGORIES:
        for yr in range(2024, datetime.now().year + 1):
            (DOCS_DIR / cat / str(yr)).mkdir(parents=True, exist_ok=True)


@app.route("/api/documents/<category>/<year>")
def list_documents(category, year):
    """List all documents in a category/year folder."""
    if category not in DOC_CATEGORIES:
        return jsonify({"error": "Invalid category"}), 400
    if not re.match(r'^\d{4}$', year):
        return jsonify({"error": "Invalid year"}), 400

    folder = DOCS_DIR / category / year
    if not folder.exists():
        return jsonify([])

    files = []
    for f in sorted(folder.iterdir()):
        if f.is_file() and not f.name.startswith('.'):
            stat = f.stat()
            files.append({
                "name": f.name,
                "size": stat.st_size,
                "modified": datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M"),
            })
    return jsonify(files)


@app.route("/api/documents/<category>/<year>/upload", methods=["POST"])
def upload_document(category, year):
    """Upload one or more files to a category/year folder."""
    if category not in DOC_CATEGORIES:
        return jsonify({"error": "Invalid category"}), 400
    if not re.match(r'^\d{4}$', year):
        return jsonify({"error": "Invalid year"}), 400

    folder = DOCS_DIR / category / year
    folder.mkdir(parents=True, exist_ok=True)

    uploaded = []
    for f in request.files.getlist("files"):
        if not f.filename:
            continue
        orig = secure_filename(f.filename)
        stem = Path(orig).stem
        ext = Path(orig).suffix
        today = datetime.now()
        new_name = f"{stem}_{today:%d_%b_%Y}{ext}"
        dest = folder / new_name
        counter = 1
        while dest.exists():
            new_name = f"{stem}_{today:%d_%b_%Y}_{counter}{ext}"
            dest = folder / new_name
            counter += 1
        f.save(str(dest))
        uploaded.append(new_name)

    return jsonify({"ok": True, "uploaded": uploaded, "count": len(uploaded)})


@app.route("/api/documents/<category>/<year>/<filename>")
def download_document(category, year, filename):
    """Download a specific document."""
    if category not in DOC_CATEGORIES:
        return jsonify({"error": "Invalid category"}), 400
    if not re.match(r'^\d{4}$', year):
        return jsonify({"error": "Invalid year"}), 400
    safe_name = secure_filename(filename)
    folder = DOCS_DIR / category / year
    file_path = folder / safe_name
    if not file_path.exists() or not file_path.is_file():
        return jsonify({"error": "File not found"}), 404
    return send_from_directory(str(folder), safe_name, as_attachment=True)


@app.route("/api/documents/<category>/<year>/<filename>", methods=["DELETE"])
def delete_document(category, year, filename):
    """Delete a specific document."""
    if category not in DOC_CATEGORIES:
        return jsonify({"error": "Invalid category"}), 400
    if not re.match(r'^\d{4}$', year):
        return jsonify({"error": "Invalid year"}), 400
    safe_name = secure_filename(filename)
    folder = DOCS_DIR / category / year
    file_path = folder / safe_name
    if not file_path.exists() or not file_path.is_file():
        return jsonify({"error": "File not found"}), 404
    file_path.unlink()
    return jsonify({"ok": True, "deleted": safe_name})


@app.route("/api/documents/categories")
def doc_categories():
    """Return available categories and years."""
    cats = {}
    for cat in DOC_CATEGORIES:
        cat_dir = DOCS_DIR / cat
        years = []
        if cat_dir.exists():
            years = sorted([d.name for d in cat_dir.iterdir() if d.is_dir() and d.name.isdigit()], reverse=True)
        cats[cat] = years
    return jsonify(cats)


# ═══════════════════════════════════════════════════════════════
#  STARTUP
# ═══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    print("\n  Connecting to Google Sheets...")
    _ensure_worksheets()
    _ensure_doc_dirs()
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_DEBUG", "true").lower() in ("1", "true", "yes")
    print(f"\n  FinTrack server running at http://localhost:{port}\n")
    app.run(host="0.0.0.0", port=port, debug=debug)
