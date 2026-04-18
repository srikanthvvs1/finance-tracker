"""
FinTrack Local Server
─────────────────────
A lightweight Flask server that:
  1. Serves the static front-end (index.html, script.js, style.css)
  2. Persists all data to an Excel file (data.xlsx) via openpyxl
  3. Proxies live price requests to Yahoo Finance & mfapi.in (no CORS issues)

Run:  python server.py
Open: http://localhost:5000
"""

import json
import os
import shutil
import tempfile
import threading
import time
from datetime import date, datetime
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import openpyxl
import requests

# ─── Config (override via environment variables) ────────────────────
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get("FINTRACK_DATA_DIR", str(BASE_DIR)))
DATA_FILE = DATA_DIR / "data.xlsx"
_file_lock = threading.Lock()

STATIC_DIR = BASE_DIR / "static"
app = Flask(__name__, static_folder=str(STATIC_DIR), static_url_path="")
CORS(app)


# ═══════════════════════════════════════════════════════════════
#  EXCEL HELPERS  (atomic writes via temp-file + rename)
# ═══════════════════════════════════════════════════════════════

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


def _safe_delete(path, retries=5):
    """Delete a file with retries (handles OneDrive / antivirus locks)."""
    for i in range(retries):
        try:
            path.unlink(missing_ok=True)
            return
        except PermissionError:
            time.sleep(0.3 * (i + 1))
    # Last resort
    path.unlink(missing_ok=True)


def _safe_save(wb):
    """Save workbook via temp file + rename to avoid corruption."""
    fd, tmp_path = tempfile.mkstemp(suffix=".xlsx", dir=str(DATA_DIR))
    os.close(fd)
    try:
        wb.save(tmp_path)
        wb.close()
        # Retry rename in case of OneDrive lock
        for i in range(5):
            try:
                shutil.move(tmp_path, str(DATA_FILE))
                return
            except PermissionError:
                time.sleep(0.3 * (i + 1))
        shutil.move(tmp_path, str(DATA_FILE))
    except Exception:
        # Clean up temp file on failure
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


def _ensure_workbook():
    """Create the Excel file with headers, formatting, and seed data if it doesn't exist."""
    if DATA_FILE.exists():
        try:
            wb = _open_workbook(retries=8, delay=1.0)
            # Check schema — recreate if SavingsHistory columns changed
            if "SavingsHistory" in wb.sheetnames:
                ws = wb["SavingsHistory"]
                headers = [c.value for c in next(ws.iter_rows(min_row=1, max_row=1))]
                if headers != SAVINGS_HIST_COLS:
                    wb.close()
                    print("[!] SavingsHistory schema changed -- recreating...")
                    _safe_delete(DATA_FILE)
                else:
                    wb.close()
                    return  # file is valid
            else:
                wb.close()
        except PermissionError:
            print("[!] data.xlsx locked by another process -- waiting...")
            time.sleep(3)
            try:
                _safe_delete(DATA_FILE)
            except PermissionError:
                print("[!] Still locked. Please close Excel/OneDrive and retry.")
                return
        except Exception:
            print("[!] data.xlsx is corrupted -- recreating...")
            _safe_delete(DATA_FILE)

    from openpyxl.styles import Font, Alignment, PatternFill, Border, Side

    wb = openpyxl.Workbook()
    wb.remove(wb.active)

    header_font = Font(name="Calibri", bold=True, size=11, color="FFFFFF")
    header_fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
    header_align = Alignment(horizontal="center", vertical="center", wrap_text=True)
    thin_border = Border(
        left=Side(style="thin"), right=Side(style="thin"),
        top=Side(style="thin"), bottom=Side(style="thin"),
    )
    data_font = Font(name="Calibri", size=10)
    num_fmt_currency = '#,##0.00'
    num_fmt_int = '#,##0'

    def _create_sheet(name, cols, widths=None):
        ws = wb.create_sheet(name)
        ws.append(cols)
        for c_idx, col in enumerate(cols, 1):
            cell = ws.cell(row=1, column=c_idx)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = header_align
            cell.border = thin_border
        if widths:
            for c_idx, w in enumerate(widths, 1):
                ws.column_dimensions[openpyxl.utils.get_column_letter(c_idx)].width = w
        ws.freeze_panes = "A2"
        ws.auto_filter.ref = ws.dimensions
        return ws

    # ── Expenses Sheet ──────────────────────────────────────────
    ws_exp = _create_sheet("Expenses", EXPENSE_COLS,
                           widths=[12, 14, 35, 16, 14, 14])
    seed_expenses = [
        # Historical months (representative monthly expenses)
        [101, date(2025,5,1),  "Monthly Rent",       "housing",       "transfer", 22000.00],
        [102, date(2025,5,5),  "Groceries",          "food",          "upi",      4500.00],
        [103, date(2025,5,10), "Electricity Bill",    "utilities",     "transfer", 1400.00],
        [104, date(2025,5,15), "Dining Out",          "food",          "card",     2100.00],
        [105, date(2025,5,20), "Uber Rides",          "travel",        "upi",      1200.00],
        [106, date(2025,5,25), "Amazon Shopping",     "shopping",      "card",     3800.00],
        [107, date(2025,5,28), "Gym + Pharmacy",      "health",        "upi",      2000.00],
        [108, date(2025,5,30), "Netflix + Spotify",   "entertainment", "card",     499.00],
        [109, date(2025,5,30), "Internet + Phone",    "utilities",     "transfer", 1500.00],

        [201, date(2025,6,1),  "Monthly Rent",       "housing",       "transfer", 22000.00],
        [202, date(2025,6,5),  "Groceries",          "food",          "upi",      4200.00],
        [203, date(2025,6,12), "Electricity Bill",    "utilities",     "transfer", 1350.00],
        [204, date(2025,6,18), "Restaurant",          "food",          "card",     1800.00],
        [205, date(2025,6,22), "Travel Tickets",      "travel",        "card",     3200.00],
        [206, date(2025,6,28), "Health Checkup",      "health",        "upi",      2500.00],
        [207, date(2025,6,30), "Subscriptions",       "entertainment", "card",     499.00],
        [208, date(2025,6,30), "Utilities",           "utilities",     "transfer", 1500.00],

        [301, date(2025,7,1),  "Monthly Rent",       "housing",       "transfer", 22000.00],
        [302, date(2025,7,6),  "Groceries",          "food",          "upi",      5200.00],
        [303, date(2025,7,10), "Electricity Bill",    "utilities",     "transfer", 1800.00],
        [304, date(2025,7,15), "Swiggy Orders",       "food",          "upi",      2800.00],
        [305, date(2025,7,20), "Weekend Trip",         "travel",        "card",     5500.00],
        [306, date(2025,7,25), "Clothes Shopping",     "shopping",      "card",     4200.00],
        [307, date(2025,7,30), "Subscriptions",       "entertainment", "card",     499.00],
        [308, date(2025,7,30), "Utilities + Phone",   "utilities",     "transfer", 1500.00],

        [401, date(2025,8,1),  "Monthly Rent",       "housing",       "transfer", 22000.00],
        [402, date(2025,8,5),  "Groceries",          "food",          "upi",      4800.00],
        [403, date(2025,8,10), "Electricity Bill",    "utilities",     "transfer", 1500.00],
        [404, date(2025,8,16), "Dining + Food",       "food",          "card",     2400.00],
        [405, date(2025,8,22), "Cab Rides",           "travel",        "upi",      1800.00],
        [406, date(2025,8,28), "Pharmacy",            "health",        "upi",      1200.00],
        [407, date(2025,8,30), "Subscriptions",       "entertainment", "card",     499.00],
        [408, date(2025,8,30), "Internet + Phone",    "utilities",     "transfer", 1500.00],

        [501, date(2025,9,1),  "Monthly Rent",       "housing",       "transfer", 22000.00],
        [502, date(2025,9,4),  "Groceries",          "food",          "upi",      4000.00],
        [503, date(2025,9,10), "Electricity Bill",    "utilities",     "transfer", 1300.00],
        [504, date(2025,9,14), "Restaurant Bills",    "food",          "card",     1600.00],
        [505, date(2025,9,20), "Train Tickets",       "travel",        "card",     2100.00],
        [506, date(2025,9,26), "Gym Membership",      "health",        "transfer", 1500.00],
        [507, date(2025,9,30), "Subscriptions",       "entertainment", "card",     499.00],
        [508, date(2025,9,30), "Utilities",           "utilities",     "transfer", 1500.00],

        [601, date(2025,10,1),  "Monthly Rent",      "housing",       "transfer", 23000.00],
        [602, date(2025,10,5),  "Groceries",         "food",          "upi",      4600.00],
        [603, date(2025,10,10), "Electricity Bill",   "utilities",     "transfer", 1400.00],
        [604, date(2025,10,15), "Diwali Shopping",    "shopping",      "card",     8000.00],
        [605, date(2025,10,20), "Food Orders",        "food",          "upi",      2200.00],
        [606, date(2025,10,30), "Subscriptions",      "entertainment", "card",     499.00],
        [607, date(2025,10,30), "Utilities",          "utilities",     "transfer", 1500.00],

        [701, date(2025,11,1),  "Monthly Rent",      "housing",       "transfer", 23000.00],
        [702, date(2025,11,5),  "Groceries",         "food",          "upi",      5000.00],
        [703, date(2025,11,10), "Electricity Bill",   "utilities",     "transfer", 1600.00],
        [704, date(2025,11,15), "Restaurant",         "food",          "card",     2500.00],
        [705, date(2025,11,20), "Flight Tickets",     "travel",        "card",     6500.00],
        [706, date(2025,11,25), "Winter Clothes",     "shopping",      "card",     3500.00],
        [707, date(2025,11,30), "Subscriptions",      "entertainment", "card",     499.00],
        [708, date(2025,11,30), "Utilities",          "utilities",     "transfer", 1500.00],

        [801, date(2025,12,1),  "Monthly Rent",      "housing",       "transfer", 23000.00],
        [802, date(2025,12,5),  "Groceries",         "food",          "upi",      5500.00],
        [803, date(2025,12,10), "Electricity Bill",   "utilities",     "transfer", 1500.00],
        [804, date(2025,12,15), "Christmas Dinner",   "food",          "card",     3000.00],
        [805, date(2025,12,20), "New Year Trip",      "travel",        "card",     8000.00],
        [806, date(2025,12,25), "Gifts Shopping",     "shopping",      "card",     5000.00],
        [807, date(2025,12,28), "Health Checkup",     "health",        "upi",      3000.00],
        [808, date(2025,12,30), "Subscriptions",      "entertainment", "card",     499.00],
        [809, date(2025,12,30), "Utilities",          "utilities",     "transfer", 1500.00],

        [901, date(2026,1,1),  "Monthly Rent",       "housing",       "transfer", 25000.00],
        [902, date(2026,1,5),  "Groceries",          "food",          "upi",      4800.00],
        [903, date(2026,1,10), "Electricity Bill",    "utilities",     "transfer", 1400.00],
        [904, date(2026,1,15), "Dining Out",          "food",          "card",     1800.00],
        [905, date(2026,1,20), "Metro Pass",          "travel",        "upi",      1200.00],
        [906, date(2026,1,28), "Pharmacy",            "health",        "upi",      1300.00],
        [907, date(2026,1,30), "Subscriptions",       "entertainment", "card",     499.00],
        [908, date(2026,1,30), "Utilities",           "utilities",     "transfer", 1500.00],

        [1001, date(2026,2,1),  "Monthly Rent",      "housing",       "transfer", 25000.00],
        [1002, date(2026,2,5),  "Groceries",         "food",          "upi",      4200.00],
        [1003, date(2026,2,10), "Electricity Bill",   "utilities",     "transfer", 1300.00],
        [1004, date(2026,2,14), "Valentine Dinner",   "food",          "card",     2500.00],
        [1005, date(2026,2,20), "Uber Rides",         "travel",        "upi",      900.00],
        [1006, date(2026,2,28), "Subscriptions",      "entertainment", "card",     499.00],
        [1007, date(2026,2,28), "Utilities",          "utilities",     "transfer", 1500.00],

        [1101, date(2026,3,1),  "Monthly Rent",      "housing",       "transfer", 25000.00],
        [1102, date(2026,3,5),  "Groceries",         "food",          "upi",      4500.00],
        [1103, date(2026,3,10), "Electricity Bill",   "utilities",     "transfer", 1500.00],
        [1104, date(2026,3,15), "Holi Party",         "food",          "card",     2000.00],
        [1105, date(2026,3,20), "Train Tickets",      "travel",        "card",     1800.00],
        [1106, date(2026,3,25), "Gym Renewal",        "health",        "transfer", 1500.00],
        [1107, date(2026,3,30), "Subscriptions",      "entertainment", "card",     499.00],
        [1108, date(2026,3,30), "Utilities",          "utilities",     "transfer", 1500.00],

        # Current month — April 2026
        [1,  date(2026,4,1),  "Monthly Rent",          "housing",       "transfer", 25000.00],
        [2,  date(2026,4,2),  "Grocery – BigBasket",   "food",          "upi",      3200.00],
        [3,  date(2026,4,3),  "Swiggy – Dinner",       "food",          "upi",      450.00],
        [4,  date(2026,4,4),  "Train Ticket – Mumbai",  "travel",       "card",     1850.00],
        [5,  date(2026,4,5),  "Netflix + Spotify",      "entertainment","card",     499.00],
        [6,  date(2026,4,6),  "Apollo Pharmacy",        "health",       "upi",      780.00],
        [7,  date(2026,4,7),  "Electricity Bill",       "utilities",    "transfer", 1650.00],
        [8,  date(2026,4,8),  "Team Lunch",             "food",         "card",     1200.00],
        [9,  date(2026,4,9),  "Amazon – Headphones",    "shopping",     "card",     2499.00],
        [10, date(2026,4,10), "Uber Rides",             "travel",       "upi",      680.00],
        [11, date(2026,4,11), "Phone Bill – Airtel",    "utilities",    "transfer", 599.00],
        [12, date(2026,4,12), "Dinner – Restaurant",    "food",         "card",     1550.00],
        [13, date(2026,4,13), "Internet Bill – ACT",    "utilities",    "transfer", 999.00],
        [14, date(2026,4,14), "Gym Membership",         "health",       "transfer", 1500.00],
        [15, date(2026,4,15), "Zara – Clothes",         "shopping",     "card",     3800.00],
    ]
    for row in seed_expenses:
        ws_exp.append(row)
    for r in range(2, len(seed_expenses) + 2):
        ws_exp.cell(row=r, column=2).number_format = DATE_FMT
        ws_exp.cell(row=r, column=6).number_format = num_fmt_currency

    # ── Investments Sheet ───────────────────────────────────────
    ws_inv = _create_sheet("Investments", INVESTMENT_COLS,
                           widths=[14, 14, 28, 18, 12, 16, 16, 14, 12, 12, 16, 14])
    seed_investments = [
        [1,  "RELIANCE",  "Reliance Industries",       "stocks",        50,  2450.00, 2850.00, date(2025,6,15), "large",  "moderate", "RELIANCE.NS",  None],
        [2,  "TCS",       "Tata Consultancy Services",  "stocks",        30,  3400.00, 3780.00, date(2025,7,20), "large",  "low",      "TCS.NS",       None],
        [3,  "INFY",      "Infosys Ltd",               "stocks",        40,  1500.00, 1620.00, date(2025,8,10), "large",  "low",      "INFY.NS",      None],
        [4,  "HDFCBANK",  "HDFC Bank Ltd",             "stocks",        25,  1650.00, 1740.00, date(2025,9,5),  "large",  "low",      "HDFCBANK.NS",  None],
        [5,  "BAJFINANCE","Bajaj Finance Ltd",         "stocks",        15,  6800.00, 7250.00, date(2025,5,1),  "large",  "high",     "BAJFINANCE.NS",None],
        [6,  "AAPL",      "Apple Inc.",                "foreign_stocks",10,  14500.00,18900.00,date(2025,6,15), "large",  "moderate", "AAPL",         None],
        [7,  "MSFT",      "Microsoft Corp.",           "foreign_stocks", 8,  28000.00,32500.00,date(2025,8,10), "large",  "low",      "MSFT",         None],
        [8,  "HDFC-MF",   "HDFC Mid-Cap Opp Fund",    "mutual_funds",  200, 105.00,  128.50,  date(2025,3,1),  "mid",    "moderate", None,           "118989"],
        [9,  "PARAG-MF",  "Parag Parikh Flexi Cap",   "mutual_funds",  150, 55.00,   68.40,   date(2025,5,20), "large",  "moderate", None,           "122639"],
        [10, "AXIS-MF",   "Axis Small Cap Fund",      "mutual_funds",  300, 72.00,   84.20,   date(2025,4,10), "small",  "high",     None,           "125354"],
        [11, "GOLD-SGB",  "Sovereign Gold Bond 2025",  "gold",          10,  5800.00, 7200.00, date(2025,1,10), None,     None,       None,           None],
        [12, "GOLD-PHY",  "Physical Gold 24K",         "gold",          20,  6100.00, 7200.00, date(2024,11,20),None,     None,       None,           None],
        [13, "PPF-SBI",   "PPF – State Bank",          "ppf",           1,   150000,  168750,  date(2024,4,1),  None,     None,       None,           None],
        [14, "NPS-TIER1", "NPS Tier-1 Equity",         "nps",           500, 42.00,   52.60,   date(2024,4,1),  None,     None,       None,           None],
        [15, "FD-SBI",    "SBI FD 3yr @7.1%",          "fixed_deposit", 1,   300000,  321300,  date(2025,1,15), None,     None,       None,           None],
        [16, "FD-HDFC",   "HDFC FD 2yr @7.0%",        "fixed_deposit", 1,   200000,  214000,  date(2025,6,1),  None,     None,       None,           None],
    ]
    for row in seed_investments:
        ws_inv.append(row)
    for r in range(2, len(seed_investments) + 2):
        ws_inv.cell(row=r, column=5).number_format = num_fmt_int
        ws_inv.cell(row=r, column=6).number_format = num_fmt_currency
        ws_inv.cell(row=r, column=7).number_format = num_fmt_currency
        ws_inv.cell(row=r, column=8).number_format = DATE_FMT

    # ── Transactions Sheet ──────────────────────────────────────
    ws_txn = _create_sheet("Transactions", TRANSACTION_COLS,
                           widths=[14, 14, 10, 12, 16])
    seed_transactions = [
        # Stocks
        [1,  date(2025,6,15), "BUY",  30, 2400.00],
        [1,  date(2025,9,10), "BUY",  30, 2500.00],
        [1,  date(2026,1,5),  "SELL", 10, 2700.00],
        [2,  date(2025,7,20), "BUY",  30, 3400.00],
        [3,  date(2025,8,10), "BUY",  40, 1500.00],
        [4,  date(2025,9,5),  "BUY",  25, 1650.00],
        [5,  date(2025,5,1),  "BUY",  20, 6500.00],
        [5,  date(2025,11,15),"SELL",  5, 7100.00],
        # Foreign Stocks
        [6,  date(2025,6,15), "BUY",  10, 14500.00],
        [7,  date(2025,8,10), "BUY",   8, 28000.00],
        # Mutual Funds
        [8,  date(2025,3,1),  "BUY", 100, 100.00],
        [8,  date(2025,7,15), "BUY", 100, 110.00],
        [9,  date(2025,5,20), "BUY", 150,  55.00],
        [10, date(2025,4,10), "BUY", 300,  72.00],
        # Gold
        [11, date(2025,1,10), "BUY",  10, 5800.00],
        [12, date(2024,11,20),"BUY",  20, 6100.00],
        # PPF, NPS, FD
        [13, date(2024,4,1),  "BUY",   1, 150000],
        [14, date(2024,4,1),  "BUY", 500,  42.00],
        [15, date(2025,1,15), "BUY",   1, 300000],
        [16, date(2025,6,1),  "BUY",   1, 200000],
    ]
    for row in seed_transactions:
        ws_txn.append(row)
    for r in range(2, len(seed_transactions) + 2):
        ws_txn.cell(row=r, column=2).number_format = DATE_FMT
        ws_txn.cell(row=r, column=4).number_format = num_fmt_int
        ws_txn.cell(row=r, column=5).number_format = num_fmt_currency

    # ── Savings Goals Sheet ─────────────────────────────────────
    ws_sg = _create_sheet("SavingsGoals", SAVINGS_GOAL_COLS,
                          widths=[12, 24, 8, 16, 16, 14])
    seed_goals = [
        [1, "Emergency Fund",     "🏥", 500000, 350000, date(2026,12,31)],
        [2, "Vacation – Japan",   "✈️",  300000, 180000, date(2026,9,1)],
        [3, "New Laptop",         "💻", 150000, 150000, date(2026,6,1)],
        [4, "Home Down Payment",  "🏠", 2500000, 650000, date(2028,12,31)],
        [5, "Wedding Fund",       "💍", 1500000, 420000, date(2027,6,1)],
    ]
    for row in seed_goals:
        ws_sg.append(row)
    for r in range(2, len(seed_goals) + 2):
        ws_sg.cell(row=r, column=4).number_format = num_fmt_currency
        ws_sg.cell(row=r, column=5).number_format = num_fmt_currency
        ws_sg.cell(row=r, column=6).number_format = DATE_FMT

    # ── Emergency Fund Sheet (target only, row 1 = header, row 2 = target value) ──
    ws_ef = _create_sheet("EmergencyFund", EMERGENCY_COLS,
                          widths=[16])
    ws_ef.append([500000])
    ws_ef.cell(row=2, column=1).number_format = num_fmt_currency

    # ── Emergency Fund Contributions Sheet ──────────────────────
    ws_efc = _create_sheet("EFContributions", EMERGENCY_CONTRIB_COLS,
                           widths=[12, 14, 16, 30])
    seed_ef_contribs = [
        [1, date(2025, 5, 5),  25000, "Initial deposit"],
        [2, date(2025, 6, 5),  25000, "Monthly contribution"],
        [3, date(2025, 7, 5),  30000, "Monthly contribution"],
        [4, date(2025, 8, 5),  25000, "Monthly contribution"],
        [5, date(2025, 9, 5),  25000, "Monthly contribution"],
        [6, date(2025, 10, 5), 30000, "Monthly contribution"],
        [7, date(2025, 11, 5), 25000, "Monthly contribution"],
        [8, date(2025, 12, 5), 30000, "Bonus month extra"],
        [9, date(2026, 1, 5),  25000, "Monthly contribution"],
        [10, date(2026, 2, 5), 35000, "Tax refund added"],
        [11, date(2026, 3, 5), 50000, "Salary hike bump"],
        [12, date(2026, 4, 5), 25000, "Monthly contribution"],
    ]
    for row in seed_ef_contribs:
        ws_efc.append(row)
    for r in range(2, len(seed_ef_contribs) + 2):
        ws_efc.cell(row=r, column=2).number_format = DATE_FMT
        ws_efc.cell(row=r, column=3).number_format = num_fmt_currency

    # ── Savings History Sheet (computed from other sheets' seed data) ──
    ws_sh = _create_sheet("SavingsHistory", SAVINGS_HIST_COLS,
                          widths=[14, 16, 16, 16, 16, 16])

    # Pre-compute per-month expenses from seed_expenses
    _exp_by_month = {}
    for row in seed_expenses:
        d = row[1]  # date object
        key = f"{d:%b %Y}"  # e.g. "May 2025"
        _exp_by_month[key] = _exp_by_month.get(key, 0) + row[5]

    # Pre-compute per-month investment outflows from seed_transactions (BUY only)
    _inv_by_month = {}
    for row in seed_transactions:
        if row[2] == "BUY":
            d = row[1]
            key = f"{d:%b %Y}"
            _inv_by_month[key] = _inv_by_month.get(key, 0) + (row[3] * row[4])  # units * price

    # Pre-compute per-month EF contributions from seed_ef_contribs
    _ef_by_month = {}
    for row in seed_ef_contribs:
        d = row[1]
        key = f"{d:%b %Y}"
        _ef_by_month[key] = _ef_by_month.get(key, 0) + row[2]

    seed_incomes = {
        "May 2025": 85000, "Jun 2025": 85000, "Jul 2025": 87000,
        "Aug 2025": 87000, "Sep 2025": 87000, "Oct 2025": 90000,
        "Nov 2025": 90000, "Dec 2025": 90000, "Jan 2026": 90000,
        "Feb 2026": 92000, "Mar 2026": 92000, "Apr 2026": 95000,
    }
    for label, income in seed_incomes.items():
        exp = _exp_by_month.get(label, 0)
        inv = _inv_by_month.get(label, 0)
        ef  = _ef_by_month.get(label, 0)
        net = income - exp - inv - ef
        ws_sh.append([label, income, exp, inv, ef, net])
    for r in range(2, len(seed_incomes) + 2):
        for c in range(2, 7):  # columns B-F
            ws_sh.cell(row=r, column=c).number_format = num_fmt_currency

    _safe_save(wb)
    print("[OK] Created data.xlsx with seed data (6 sheets)")


# Columns that hold date values (written as Excel dates, read back as ISO strings)
DATE_COLUMNS = {"date", "deadline"}
DATE_FMT = "YYYY-MM-DD"   # Excel custom number format


def _to_date(val):
    """Convert an ISO date string (e.g. '2026-04-01') to a datetime.date for Excel."""
    if isinstance(val, (date, datetime)):
        return val
    if isinstance(val, str) and len(val) >= 10:
        try:
            return datetime.strptime(val[:10], "%Y-%m-%d").date()
        except ValueError:
            pass
    return val


def _from_date(val):
    """Convert a datetime.date/datetime read from Excel back to an ISO string."""
    if isinstance(val, datetime):
        return val.strftime("%Y-%m-%d")
    if isinstance(val, date):
        return val.isoformat()
    return val


def _open_workbook(read_only=False, retries=5, delay=0.5):
    """Open data.xlsx with retries to handle transient OneDrive / antivirus locks."""
    for attempt in range(retries):
        try:
            return openpyxl.load_workbook(str(DATA_FILE), read_only=read_only)
        except PermissionError:
            if attempt < retries - 1:
                time.sleep(delay * (attempt + 1))
            else:
                raise


def _read_sheet(sheet_name, columns):
    """Read an entire sheet into a list of dicts."""
    with _file_lock:
        wb = _open_workbook(read_only=True)
        ws = wb[sheet_name]
        rows = []
        for row in ws.iter_rows(min_row=2, values_only=True):
            obj = {}
            for i, col in enumerate(columns):
                val = row[i] if i < len(row) else None
                if col in DATE_COLUMNS:
                    val = _from_date(val)
                obj[col] = val
            rows.append(obj)
        wb.close()
    return rows


def _write_sheet(sheet_name, columns, rows):
    """Overwrite a single sheet."""
    with _file_lock:
        wb = _open_workbook()
        ws = wb[sheet_name]
        ws.delete_rows(2, ws.max_row)
        for obj in rows:
            vals = []
            for c in columns:
                v = obj.get(c)
                if c in DATE_COLUMNS:
                    v = _to_date(v)
                vals.append(v)
            ws.append(vals)
        # Apply date format to date columns
        date_col_indices = [i + 1 for i, c in enumerate(columns) if c in DATE_COLUMNS]
        for r in range(2, ws.max_row + 1):
            for ci in date_col_indices:
                ws.cell(row=r, column=ci).number_format = DATE_FMT
        _safe_save(wb)


def _write_sheets(sheet_data):
    """Write multiple sheets atomically in one lock."""
    with _file_lock:
        wb = _open_workbook()
        for sheet_name, columns, rows in sheet_data:
            ws = wb[sheet_name]
            ws.delete_rows(2, ws.max_row)
            for obj in rows:
                vals = []
                for c in columns:
                    v = obj.get(c)
                    if c in DATE_COLUMNS:
                        v = _to_date(v)
                    vals.append(v)
                ws.append(vals)
            # Apply date format
            date_col_indices = [i + 1 for i, c in enumerate(columns) if c in DATE_COLUMNS]
            for r in range(2, ws.max_row + 1):
                for ci in date_col_indices:
                    ws.cell(row=r, column=ci).number_format = DATE_FMT
        _safe_save(wb)

# ═══════════════════════════════════════════════════════════════
#  STATIC FILE SERVING
# ═══════════════════════════════════════════════════════════════

@app.route("/")
def index():
    return send_from_directory(str(STATIC_DIR), "index.html")


# ═══════════════════════════════════════════════════════════════
#  API: USER INFO & CONFIG
# ═══════════════════════════════════════════════════════════════

@app.route("/api/user-info")
def user_info():
    """Return the OS full display name and current data directory."""
    fullname = None
    # Try Windows API for display name (e.g. "John Doe")
    try:
        import ctypes
        GetUserNameExW = ctypes.windll.secur32.GetUserNameExW
        NameDisplay = 3  # EXTENDED_NAME_FORMAT → NameDisplay
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
        "dataDir": str(DATA_DIR),
    })


# ═══════════════════════════════════════════════════════════════
#  API: EXPENSES
# ═══════════════════════════════════════════════════════════════

@app.route("/api/expenses", methods=["GET"])
def get_expenses():
    rows = _read_sheet("Expenses", EXPENSE_COLS)
    # Ensure numeric types
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

    # Ensure numeric types
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

# ── Helper: compute derived savings columns from other sheets ──
_MONTH_ABBREVS = ["Jan","Feb","Mar","Apr","May","Jun",
                  "Jul","Aug","Sep","Oct","Nov","Dec"]

def _parse_month_label(label):
    """'Apr 2026' → (2026, 4) or None."""
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
    """Enrich savings-history rows with expenses/invested/emergency/net_saved
       computed from the Expenses, Transactions, and EFContributions sheets."""
    # Expenses by YYYY-MM
    exp_map = {}
    for e in _read_sheet("Expenses", EXPENSE_COLS):
        d = e.get("date") or ""
        key = d[:7]  # "YYYY-MM"
        exp_map[key] = exp_map.get(key, 0) + (float(e["amount"]) if e["amount"] else 0)

    # Investment outflows (BUY transactions) by YYYY-MM
    inv_map = {}
    for t in _read_sheet("Transactions", TRANSACTION_COLS):
        if (t.get("action") or "").upper() == "BUY":
            d = t.get("date") or ""
            key = d[:7]
            units = float(t["units"]) if t["units"] else 0
            price = float(t["price"]) if t["price"] else 0
            inv_map[key] = inv_map.get(key, 0) + units * price

    # EF contributions by YYYY-MM
    ef_map = {}
    for c in _read_sheet("EFContributions", EMERGENCY_CONTRIB_COLS):
        d = c.get("date") or ""
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
    # Recompute derived columns before writing
    data = _compute_derived_savings(data)
    _write_sheet("SavingsHistory", SAVINGS_HIST_COLS, data)
    return jsonify({"ok": True, "count": len(data)})


@app.route("/api/savings-history/<month_label>", methods=["PATCH"])
def patch_savings_month(month_label):
    """Update or create income for a single month, e.g. 'Apr 2026'."""
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
    # Save target
    _write_sheet("EmergencyFund", EMERGENCY_COLS, [{"target": data.get("target", 500000)}])
    # Save contributions
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
#  API: PRICE PROXY  (solves CORS — Python fetches directly)
# ═══════════════════════════════════════════════════════════════

@app.route("/api/price/stock/<ticker>")
def proxy_stock_price(ticker):
    """Proxy Yahoo Finance chart API for a given ticker."""
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?interval=1d&range=1d"
    headers = {"User-Agent": "Mozilla/5.0"}
    try:
        resp = requests.get(url, headers=headers, timeout=15)
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
    """Proxy mfapi.in for mutual fund NAV."""
    url = f"https://api.mfapi.in/mf/{scheme_code}"
    try:
        resp = requests.get(url, timeout=10)
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
#  API: EXPORT / DOWNLOAD EXCEL
# ═══════════════════════════════════════════════════════════════

@app.route("/api/export")
def export_excel():
    """Download the data.xlsx file."""
    return send_from_directory(str(BASE_DIR), "data.xlsx",
                               as_attachment=True,
                               download_name="FinTrack_data.xlsx")


# ═══════════════════════════════════════════════════════════════
#  API: DOCUMENTS
# ═══════════════════════════════════════════════════════════════

DOCS_DIR = BASE_DIR / "documents"
DEFAULT_DOC_CATEGORIES = ["salary_slips", "tax", "insurance", "investments", "bank_statements"]

import re
from werkzeug.utils import secure_filename


def _valid_category(name):
    """Check category name is safe (prevents path traversal)."""
    return bool(re.match(r'^[a-z][a-z0-9_]{0,49}$', name))


def _ensure_doc_dirs():
    """Create default documents folder structure on first run."""
    for cat in DEFAULT_DOC_CATEGORIES:
        for yr in range(2024, datetime.now().year + 1):
            (DOCS_DIR / cat / str(yr)).mkdir(parents=True, exist_ok=True)


@app.route("/api/documents/<category>/<year>")
def list_documents(category, year):
    """List all documents in a category/year folder."""
    if not _valid_category(category):
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
    if not _valid_category(category):
        return jsonify({"error": "Invalid category"}), 400
    if not re.match(r'^\d{4}$', year):
        return jsonify({"error": "Invalid year"}), 400

    folder = DOCS_DIR / category / year
    folder.mkdir(parents=True, exist_ok=True)

    uploaded = []
    for f in request.files.getlist("files"):
        if not f.filename:
            continue
        new_name = secure_filename(f.filename)
        stem = Path(new_name).stem
        ext = Path(new_name).suffix
        dest = folder / new_name
        # Avoid overwrite — append counter
        counter = 1
        while dest.exists():
            new_name = f"{stem}_{counter}{ext}"
            dest = folder / new_name
            counter += 1
        f.save(str(dest))
        uploaded.append(new_name)

    return jsonify({"ok": True, "uploaded": uploaded, "count": len(uploaded)})


@app.route("/api/documents/<category>/<year>/<filename>")
def download_document(category, year, filename):
    """Download a specific document."""
    if not _valid_category(category):
        return jsonify({"error": "Invalid category"}), 400
    if not re.match(r'^\d{4}$', year):
        return jsonify({"error": "Invalid year"}), 400
    safe_name = secure_filename(filename)
    folder = DOCS_DIR / category / year
    file_path = folder / safe_name
    if not file_path.exists() or not file_path.is_file():
        return jsonify({"error": "File not found"}), 404
    return send_from_directory(str(folder), safe_name,
                               as_attachment=request.args.get("download") is not None)


@app.route("/api/documents/<category>/<year>/<filename>", methods=["DELETE"])
def delete_document(category, year, filename):
    """Delete a specific document."""
    if not _valid_category(category):
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
    """Return available categories and years (discovered from disk)."""
    cats = {}
    if DOCS_DIR.exists():
        for d in sorted(DOCS_DIR.iterdir()):
            if d.is_dir() and not d.name.startswith('.') and _valid_category(d.name):
                years = sorted([y.name for y in d.iterdir() if y.is_dir() and y.name.isdigit()], reverse=True)
                cats[d.name] = years
    return jsonify(cats)


@app.route("/api/documents/categories", methods=["POST"])
def create_doc_category():
    """Create a new document category folder."""
    data = request.get_json(silent=True) or {}
    raw = data.get("name", "").strip().lower().replace(" ", "_")
    raw = re.sub(r'[^a-z0-9_]', '', raw)
    if not _valid_category(raw):
        return jsonify({"error": "Invalid name. Use letters, numbers, underscores."}), 400
    cat_dir = DOCS_DIR / raw
    if cat_dir.exists():
        return jsonify({"error": "Category already exists"}), 409
    (cat_dir / str(datetime.now().year)).mkdir(parents=True, exist_ok=True)
    return jsonify({"ok": True, "category": raw})


@app.route("/api/documents/categories/<category>", methods=["DELETE"])
def delete_doc_category(category):
    """Delete an empty document category."""
    if not _valid_category(category):
        return jsonify({"error": "Invalid category"}), 400
    cat_dir = DOCS_DIR / category
    if not cat_dir.exists():
        return jsonify({"error": "Category not found"}), 404
    for root, dirs, files in os.walk(str(cat_dir)):
        if files:
            return jsonify({"error": "Category is not empty. Delete all files first."}), 400
    shutil.rmtree(str(cat_dir))
    return jsonify({"ok": True, "deleted": category})


@app.route("/api/documents/categories/<category>/years", methods=["POST"])
def create_doc_year(category):
    """Create a year folder inside a category."""
    if not _valid_category(category):
        return jsonify({"error": "Invalid category"}), 400
    cat_dir = DOCS_DIR / category
    if not cat_dir.is_dir():
        return jsonify({"error": "Category not found"}), 404
    data = request.get_json(silent=True) or {}
    year = str(data.get("year", "")).strip()
    if not re.match(r'^\d{4}$', year):
        return jsonify({"error": "Invalid year"}), 400
    yr_dir = cat_dir / year
    if yr_dir.exists():
        return jsonify({"error": "Year already exists"}), 409
    yr_dir.mkdir(parents=True, exist_ok=True)
    return jsonify({"ok": True, "category": category, "year": year})


# ═══════════════════════════════════════════════════════════════
#  STARTUP
# ═══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    _ensure_workbook()
    _ensure_doc_dirs()
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_DEBUG", "true").lower() in ("1", "true", "yes")
    print(f"\n  FinTrack server running at http://localhost:{port}\n")
    app.run(host="0.0.0.0", port=port, debug=debug)
