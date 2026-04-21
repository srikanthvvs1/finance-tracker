"""
FinTrack Local Server  (Google Sheets backend + Google Form expense sync)
─────────────────────────────────────────────────────────────────────────
A lightweight Flask server that:
  1. Serves the static front-end (index.html, script.js, style.css)
  2. Persists all data to a Google Sheet via gspread
  3. Proxies live price requests to Yahoo Finance & mfapi.in (no CORS issues)
  4. Syncs expenses submitted via Google Form (FormExpenses → Expenses)

Run:  python server_gsheets_form.py
Open: http://localhost:5000
"""

import os
import sys
import threading
import time
import hashlib
from datetime import date, datetime
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import gspread
from google.oauth2.service_account import Credentials
import requests as http_requests   # avoid clash with flask.request

# ─── Config ─────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent
CONFIG_DIR = BASE_DIR / "config"

# Load settings from config/gsheets.env
_env_file = CONFIG_DIR / "gsheets.env"
if _env_file.exists():
    for line in _env_file.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, val = line.split("=", 1)
            os.environ.setdefault(key.strip(), val.strip())

CREDS_FILE = CONFIG_DIR / os.environ.get("GSHEETS_CREDS_FILE", "credentials.json")
SPREADSHEET_ID = os.environ.get("GSHEETS_SPREADSHEET_ID", "")

if not CREDS_FILE.exists():
    raise FileNotFoundError(
        f"Credentials file not found: {CREDS_FILE}\n"
        f"Place your service account JSON in config/ and update config/gsheets.env"
    )
if not SPREADSHEET_ID:
    raise ValueError(
        "GSHEETS_SPREADSHEET_ID not set.\n"
        "Add it to config/gsheets.env or set it as an environment variable."
    )

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
        print("    Loading credentials...")
        creds = Credentials.from_service_account_file(str(CREDS_FILE), scopes=SCOPES)
        print("    Authorizing gspread...")
        _gc = gspread.authorize(creds)
        print("    Opening spreadsheet...")
        _sh = _gc.open_by_key(SPREADSHEET_ID)
        print("    Connected!")
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

# ─── FormExpenses column definitions ────────────────────────────
# Google Form auto-fills: Timestamp, Expense Date, Amount, Category, Description, PaymentMode
FORM_SHEET_NAME = "FormExpenses"

# Valid categories and payment modes (for validation / normalisation)
_VALID_CATEGORIES = {"food", "grocery", "travel", "housing", "health",
                     "entertainment", "utilities", "shopping", "other"}
_VALID_PAYMENTS = {"card", "debit", "cash", "transfer", "upi"}


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
#  FORM EXPENSE SYNC
# ═══════════════════════════════════════════════════════════════

_sync_lock = threading.Lock()
_last_sync_result = {"synced": 0, "errors": [], "timestamp": None}


def _ensure_form_sheet():
    """Create the FormExpenses worksheet if it doesn't exist.
    Note: If using Google Form, the form auto-creates this sheet.
    This is a fallback for manual setup."""
    sh = _get_spreadsheet()
    existing = [ws.title for ws in sh.worksheets()]
    if FORM_SHEET_NAME not in existing:
        form_cols = ["Timestamp", "Expense Date", "Amount", "Category", "Description", "PaymentMode"]
        sh.add_worksheet(title=FORM_SHEET_NAME, rows=200, cols=len(form_cols))
        ws = sh.worksheet(FORM_SHEET_NAME)
        ws.update(range_name="A1", values=[form_cols])
        print(f"  [+] Created worksheet: {FORM_SHEET_NAME}")


def _normalise_category(raw):
    """Normalise a category string from the form to match app categories."""
    if not raw:
        return "other"
    cleaned = str(raw).strip().lower().replace(" ", "_")
    if cleaned in _VALID_CATEGORIES:
        return cleaned
    # Fuzzy match common form labels
    _aliases = {
        "food & dining": "food", "dining": "food",
        "groceries": "grocery", "grocery": "grocery", "vegetables": "grocery",
        "transport": "travel", "transportation": "travel", "cab": "travel",
        "rent": "housing", "home": "housing",
        "medical": "health", "medicine": "health", "pharmacy": "health",
        "bills": "utilities", "electricity": "utilities", "internet": "utilities",
        "movies": "entertainment", "games": "entertainment",
        "clothes": "shopping", "amazon": "shopping",
    }
    return _aliases.get(cleaned, "other")


def _normalise_payment(raw):
    """Normalise a payment mode string from the form."""
    if not raw:
        return "card"
    cleaned = str(raw).strip().lower().replace(" ", "_")
    if cleaned in _VALID_PAYMENTS:
        return cleaned
    _aliases = {
        "credit card": "card", "credit": "card", "cc": "card",
        "debit card": "debit", "dc": "debit",
        "bank transfer": "transfer", "neft": "transfer", "imps": "transfer",
        "google pay": "upi", "gpay": "upi", "phonepe": "upi", "paytm": "upi",
    }
    return _aliases.get(cleaned, "card")


def _normalise_date(raw):
    """Parse various date formats from the form into YYYY-MM-DD."""
    if not raw:
        return date.today().isoformat()
    s = str(raw).strip()
    # Try common formats
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y",
                "%Y/%m/%d", "%d %b %Y", "%d %B %Y"):
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            continue
    # If it's a Google Sheets timestamp like "4/21/2026 14:30:00"
    for fmt in ("%m/%d/%Y %H:%M:%S", "%d/%m/%Y %H:%M:%S",
                "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            continue
    return date.today().isoformat()


def _generate_record_id(timestamp, amount, description):
    """Generate a stable hash to detect duplicates."""
    raw = f"{timestamp}|{amount}|{description}"
    return hashlib.md5(raw.encode()).hexdigest()[:12]


def _sync_form_expenses():
    """
    Read all rows from FormExpenses, append new ones to Expenses,
    then clear FormExpenses (keep header).  Returns (synced_count, errors).

    Flow:
      1. Read all FormExpenses rows (1 API call)
      2. If empty → return (total: 1 call)
      3. Read Expenses to get max ID + build duplicate hashes (1 API call)
      4. Transform + deduplicate (in-memory)
      5. Append new expenses to Expenses sheet (1 API call)
      6. Clear FormExpenses data rows, keep header (1 API call, background)
    Total: 4 API calls max.  FormExpenses stays near-empty forever.

    Safety:
      - If step 5 succeeds but step 6 fails → next sync re-reads same rows
        → duplicate hash check skips them → no double-counting
      - If step 5 fails → step 6 never runs → rows are still in FormExpenses
    """
    with _sync_lock:
        global _last_sync_result
        errors = []

        try:
            ws_form = _ws(FORM_SHEET_NAME)

            # ── 1. Read all FormExpenses rows (1 API call) ───────
            all_rows = ws_form.get_all_values()
            if len(all_rows) <= 1:
                _last_sync_result = {"synced": 0, "errors": [], "timestamp": datetime.now().isoformat()}
                return 0, []

            header = all_rows[0]
            col_idx = {}
            for i, h in enumerate(header):
                col_idx[h.strip()] = i

            data_rows = []  # (row_number_1based, entry_dict)
            for row_num, row in enumerate(all_rows[1:], start=2):
                entry = {}
                for col_name, idx in col_idx.items():
                    entry[col_name] = row[idx] if idx < len(row) else ""
                data_rows.append((row_num, entry))

            if not data_rows:
                _last_sync_result = {"synced": 0, "errors": [], "timestamp": datetime.now().isoformat()}
                return 0, []

            print(f"  [SYNC] Found {len(data_rows)} form row(s) to process")

            # ── 2. Read Expenses to get max ID + duplicate hashes (1 API call)
            existing_expenses = _read_sheet("Expenses", EXPENSE_COLS)
            max_id = 0
            existing_hashes = set()
            for e in existing_expenses:
                eid = int(e["id"]) if e["id"] else 0
                if eid > max_id:
                    max_id = eid
                h = _generate_record_id(
                    str(e.get("date", "")),
                    str(e.get("amount", "")),
                    str(e.get("description", ""))
                )
                existing_hashes.add(h)

            # ── 3. Transform + deduplicate (in-memory) ───────────
            new_expenses = []
            now_iso = datetime.now().isoformat()

            for row_num, entry in data_rows:
                try:
                    amount_raw = entry.get("Amount", "0")
                    amount = float(str(amount_raw).replace(",", "")) if amount_raw else 0
                    if amount <= 0:
                        errors.append(f"Row {row_num}: invalid amount '{amount_raw}'")
                        continue

                    expense_date = _normalise_date(
                        entry.get("Expense Date") or entry.get("ExpenseDate")
                        or entry.get("Timestamp", "")
                    )
                    description = str(entry.get("Description", "")).strip() or "Form entry"
                    category = _normalise_category(entry.get("Category", ""))
                    payment = _normalise_payment(entry.get("PaymentMode", ""))

                    # Duplicate check
                    rec_hash = _generate_record_id(expense_date, str(amount), description)
                    if rec_hash in existing_hashes:
                        errors.append(f"Row {row_num}: duplicate — skipped")
                        continue
                    existing_hashes.add(rec_hash)

                    max_id += 1
                    new_expenses.append({
                        "id": max_id,
                        "date": expense_date,
                        "description": description,
                        "category": category,
                        "payment": payment,
                        "amount": amount,
                    })

                except Exception as ex:
                    errors.append(f"Row {row_num}: {str(ex)}")

            # ── 4. Append to Expenses sheet (1 API call) ─────────
            if new_expenses:
                ws_exp = _ws("Expenses")
                append_rows = []
                for obj in new_expenses:
                    append_rows.append([
                        obj["id"], obj["date"], obj["description"],
                        obj["category"], obj["payment"], obj["amount"],
                    ])
                ws_exp.append_rows(append_rows, value_input_option="USER_ENTERED")

            # ── 5. Clear FormExpenses (keep header) ──────────────
            # Only clear after successful append (or if all were duplicates)
            if len(all_rows) > 1:
                ws_form.delete_rows(2, len(all_rows))

            synced = len(new_expenses)
            _last_sync_result = {
                "synced": synced,
                "errors": errors,
                "timestamp": now_iso,
            }

            if synced > 0:
                print(f"  [SYNC] ✅ Imported {synced} expense(s) from Google Form")
            if errors:
                for err in errors:
                    print(f"  [SYNC] ⚠  {err}")

            return synced, errors

        except Exception as ex:
            err_msg = f"Form sync failed: {str(ex)}"
            print(f"  [SYNC] ❌ {err_msg}")
            _last_sync_result = {"synced": 0, "errors": [err_msg], "timestamp": datetime.now().isoformat()}
            return 0, [err_msg]


def _background_sync():
    """Run form sync in a background thread (non-blocking startup)."""
    try:
        _sync_form_expenses()
    except Exception as ex:
        print(f"  [SYNC] ❌ Background sync error: {ex}")


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
#  API: FORM EXPENSE SYNC
# ═══════════════════════════════════════════════════════════════

@app.route("/api/sync-form-expenses", methods=["POST"])
def api_sync_form_expenses():
    """Trigger form expense sync and return the result."""
    synced, errors = _sync_form_expenses()
    return jsonify({
        "synced": synced,
        "errors": errors,
        "timestamp": _last_sync_result.get("timestamp"),
    })


@app.route("/api/sync-form-expenses", methods=["GET"])
def api_sync_status():
    """Return the result of the last sync (from background or manual)."""
    return jsonify(_last_sync_result)


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
#  API: EXPORT / DOWNLOAD EXCEL
# ═══════════════════════════════════════════════════════════════

@app.route("/api/export")
def export_excel():
    """Download all Google Sheets data as an Excel file."""
    import openpyxl, io as _io
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    sh = _get_spreadsheet()
    for ws in sh.worksheets():
        rows = ws.get_all_values()
        xl_ws = wb.create_sheet(title=ws.title)
        for row in rows:
            xl_ws.append(row)
    buf = _io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    from flask import send_file
    return send_file(buf, download_name="FinTrack_data.xlsx", as_attachment=True,
                     mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")


# ═══════════════════════════════════════════════════════════════
#  API: DOCUMENTS  (Google Drive backend)
# ═══════════════════════════════════════════════════════════════

DEFAULT_DOC_CATEGORIES = ["salary_slips", "tax", "insurance", "investments", "bank_statements"]
DRIVE_PARENT_FOLDER_NAME = "Finances"
DRIVE_DOCS_FOLDER_NAME = "FinTrack_Documents"

import re, io, shutil
from werkzeug.utils import secure_filename
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload, MediaIoBaseDownload
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request as AuthRequest
import pickle


def _valid_category(name):
    """Check category name is safe (prevents path traversal)."""
    return bool(re.match(r'^[a-z][a-z0-9_]{0,49}$', name))

_drive_service = None
_drive_folder_cache = {}   # (parent_id, name) → folder_id

# Categories cache to avoid N+1 Drive API calls on every page load
import time as _time
_categories_cache = None      # dict: {cat_name: [years...]}
_categories_cache_ts = 0      # timestamp of last fetch
_CATEGORIES_CACHE_TTL = 60    # seconds

# OAuth2 client secret file for Drive (user credentials)
OAUTH_CLIENT_FILE = CONFIG_DIR / os.environ.get("DRIVE_OAUTH_CLIENT_FILE", "client_secret.json")
OAUTH_TOKEN_FILE = CONFIG_DIR / "drive_token.pickle"

DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive"]


def _get_drive():
    """Return a cached Google Drive API service using OAuth2 user credentials."""
    global _drive_service
    if _drive_service is not None:
        return _drive_service
    with _gs_lock:
        if _drive_service is not None:
            return _drive_service

        creds = None

        # Load cached token
        if OAUTH_TOKEN_FILE.exists():
            with open(OAUTH_TOKEN_FILE, "rb") as f:
                creds = pickle.load(f)

        # Refresh or run OAuth flow
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(AuthRequest())
        elif not creds or not creds.valid:
            if not OAUTH_CLIENT_FILE.exists():
                raise FileNotFoundError(
                    f"OAuth client secret not found: {OAUTH_CLIENT_FILE}\n"
                    f"Create a Desktop OAuth Client ID in Google Cloud Console,\n"
                    f"download the JSON, and save it to config/client_secret.json"
                )
            flow = InstalledAppFlow.from_client_secrets_file(
                str(OAUTH_CLIENT_FILE), scopes=DRIVE_SCOPES
            )
            creds = flow.run_local_server(port=0)

        # Save token for next time
        with open(OAUTH_TOKEN_FILE, "wb") as f:
            pickle.dump(creds, f)

        _drive_service = build("drive", "v3", credentials=creds, cache_discovery=False)
        return _drive_service


def _reset_drive():
    """Reset the cached Drive service (e.g. after SSL errors)."""
    global _drive_service
    _drive_service = None


import ssl as _ssl
from functools import wraps as _wraps

def _drive_retry(func):
    """Decorator: retry once on transient SSL/connection errors by resetting the Drive service."""
    @_wraps(func)
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except (_ssl.SSLError, ConnectionError, OSError):
            _reset_drive()
            return func(*args, **kwargs)
    return wrapper


def _find_or_create_folder(name, parent_id=None):
    """Find a folder by name under parent, or create it. Cached."""
    cache_key = (parent_id, name)
    if cache_key in _drive_folder_cache:
        return _drive_folder_cache[cache_key]

    drive = _get_drive()
    q = f"name='{name}' and mimeType='application/vnd.google-apps.folder' and trashed=false"
    if parent_id:
        q += f" and '{parent_id}' in parents"

    results = drive.files().list(q=q, fields="files(id,name)", pageSize=1).execute()
    files = results.get("files", [])

    if files:
        fid = files[0]["id"]
    else:
        meta = {"name": name, "mimeType": "application/vnd.google-apps.folder"}
        if parent_id:
            meta["parents"] = [parent_id]
        folder = drive.files().create(body=meta, fields="id").execute()
        fid = folder["id"]

    _drive_folder_cache[cache_key] = fid
    return fid


def _get_finance_folder():
    """Get (or create) the top-level Finance folder in Drive."""
    return _find_or_create_folder(DRIVE_PARENT_FOLDER_NAME)


def _get_doc_folder(category, year):
    """Get (or create) the Drive folder: Finance/FinTrack_Documents/<category>/<year>"""
    finance_id = _get_finance_folder()
    docs_id = _find_or_create_folder(DRIVE_DOCS_FOLDER_NAME, finance_id)
    cat_id = _find_or_create_folder(category, docs_id)
    year_id = _find_or_create_folder(year, cat_id)
    return year_id


def _move_spreadsheet_to_finance():
    """Move the FinTrack spreadsheet into the Finance folder if not already there."""
    drive = _get_drive()
    finance_id = _get_finance_folder()
    # Check current parents
    f = drive.files().get(fileId=SPREADSHEET_ID, fields="parents").execute()
    current_parents = f.get("parents", [])
    if finance_id not in current_parents:
        prev = ",".join(current_parents)
        drive.files().update(
            fileId=SPREADSHEET_ID,
            addParents=finance_id,
            removeParents=prev,
            fields="id,parents"
        ).execute()
        print(f"  Moved spreadsheet into Drive/{DRIVE_PARENT_FOLDER_NAME}/")


def _find_folder(name, parent_id):
    """Find a folder by name under parent. Returns folder ID or None."""
    cache_key = (parent_id, name)
    if cache_key in _drive_folder_cache:
        return _drive_folder_cache[cache_key]
    drive = _get_drive()
    q = f"name='{name}' and mimeType='application/vnd.google-apps.folder' and trashed=false"
    if parent_id:
        q += f" and '{parent_id}' in parents"
    results = drive.files().list(q=q, fields="files(id)", pageSize=1).execute()
    files = results.get("files", [])
    if files:
        fid = files[0]["id"]
        _drive_folder_cache[cache_key] = fid
        return fid
    return None


def _get_docs_root_id():
    """Get the FinTrack_Documents folder ID."""
    finance_id = _get_finance_folder()
    return _find_or_create_folder(DRIVE_DOCS_FOLDER_NAME, finance_id)


def _ensure_drive_folders():
    """Pre-create the default folder tree in Drive."""
    for cat in DEFAULT_DOC_CATEGORIES:
        for yr in range(2024, datetime.now().year + 1):
            _get_doc_folder(cat, str(yr))


@app.route("/api/documents/<category>/<year>")
@_drive_retry
def list_documents(category, year):
    """List all documents in a Drive category/year folder."""
    if not _valid_category(category):
        return jsonify({"error": "Invalid category"}), 400
    if not re.match(r'^\d{4}$', year):
        return jsonify({"error": "Invalid year"}), 400

    drive = _get_drive()
    folder_id = _get_doc_folder(category, year)
    q = f"'{folder_id}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'"
    results = drive.files().list(
        q=q, fields="files(id,name,size,modifiedTime)", orderBy="name"
    ).execute()

    files = []
    for f in results.get("files", []):
        files.append({
            "name": f["name"],
            "size": int(f.get("size", 0)),
            "modified": f.get("modifiedTime", "")[:16].replace("T", " "),
            "driveId": f["id"],
        })
    return jsonify(files)


@app.route("/api/documents/<category>/<year>/upload", methods=["POST"])
@_drive_retry
def upload_document(category, year):
    """Upload files to Google Drive category/year folder."""
    if not _valid_category(category):
        return jsonify({"error": "Invalid category"}), 400
    if not re.match(r'^\d{4}$', year):
        return jsonify({"error": "Invalid year"}), 400

    drive = _get_drive()
    folder_id = _get_doc_folder(category, year)

    uploaded = []
    for f in request.files.getlist("files"):
        if not f.filename:
            continue
        new_name = secure_filename(f.filename)

        # Check for duplicates in Drive folder
        stem = Path(new_name).stem
        ext = Path(new_name).suffix
        q = f"name='{new_name}' and '{folder_id}' in parents and trashed=false"
        existing = drive.files().list(q=q, fields="files(id)", pageSize=1).execute().get("files", [])
        counter = 1
        while existing:
            new_name = f"{stem}_{counter}{ext}"
            q = f"name='{new_name}' and '{folder_id}' in parents and trashed=false"
            existing = drive.files().list(q=q, fields="files(id)", pageSize=1).execute().get("files", [])
            counter += 1

        file_meta = {"name": new_name, "parents": [folder_id]}
        content = f.read()
        media = MediaIoBaseUpload(io.BytesIO(content), mimetype=f.content_type or "application/octet-stream")
        drive.files().create(body=file_meta, media_body=media, fields="id").execute()
        uploaded.append(new_name)

    return jsonify({"ok": True, "uploaded": uploaded, "count": len(uploaded)})


@app.route("/api/documents/<category>/<year>/<filename>")
@_drive_retry
def download_document(category, year, filename):
    """Download a file from Google Drive."""
    if not _valid_category(category):
        return jsonify({"error": "Invalid category"}), 400
    if not re.match(r'^\d{4}$', year):
        return jsonify({"error": "Invalid year"}), 400

    safe_name = secure_filename(filename)
    drive = _get_drive()
    folder_id = _get_doc_folder(category, year)
    q = f"name='{safe_name}' and '{folder_id}' in parents and trashed=false"
    results = drive.files().list(q=q, fields="files(id,name,mimeType)", pageSize=1).execute()
    files = results.get("files", [])
    if not files:
        return jsonify({"error": "File not found"}), 404

    file_id = files[0]["id"]
    req = drive.files().get_media(fileId=file_id)
    buf = io.BytesIO()
    downloader = MediaIoBaseDownload(buf, req)
    done = False
    while not done:
        _, done = downloader.next_chunk()

    buf.seek(0)
    from flask import send_file
    as_download = request.args.get("download") is not None
    return send_file(buf, download_name=safe_name, as_attachment=as_download)


@app.route("/api/documents/<category>/<year>/<filename>", methods=["DELETE"])
@_drive_retry
def delete_document(category, year, filename):
    """Move a file to Drive trash."""
    if not _valid_category(category):
        return jsonify({"error": "Invalid category"}), 400
    if not re.match(r'^\d{4}$', year):
        return jsonify({"error": "Invalid year"}), 400

    safe_name = secure_filename(filename)
    drive = _get_drive()
    folder_id = _get_doc_folder(category, year)
    q = f"name='{safe_name}' and '{folder_id}' in parents and trashed=false"
    results = drive.files().list(q=q, fields="files(id)", pageSize=1).execute()
    files = results.get("files", [])
    if not files:
        return jsonify({"error": "File not found"}), 404

    drive.files().update(fileId=files[0]["id"], body={"trashed": True}).execute()
    return jsonify({"ok": True, "deleted": safe_name})


def _invalidate_categories_cache():
    """Clear the categories cache so next request re-fetches from Drive."""
    global _categories_cache, _categories_cache_ts
    _categories_cache = None
    _categories_cache_ts = 0


@_drive_retry
def _fetch_categories():
    """Fetch categories from Drive, with in-memory caching."""
    global _categories_cache, _categories_cache_ts
    now = _time.time()
    if _categories_cache is not None and (now - _categories_cache_ts) < _CATEGORIES_CACHE_TTL:
        return _categories_cache

    drive = _get_drive()
    docs_id = _get_docs_root_id()
    # List all category subfolders under FinTrack_Documents
    q = f"'{docs_id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false"
    results = drive.files().list(q=q, fields="files(id,name)").execute()
    cats = {}
    for folder in sorted(results.get("files", []), key=lambda f: f["name"]):
        cat_name = folder["name"]
        if not _valid_category(cat_name):
            continue
        cat_id = folder["id"]
        _drive_folder_cache[(docs_id, cat_name)] = cat_id
        # List year subfolders
        yq = f"'{cat_id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false"
        yr_results = drive.files().list(q=yq, fields="files(name)").execute()
        years = sorted([f["name"] for f in yr_results.get("files", []) if f["name"].isdigit()], reverse=True)
        cats[cat_name] = years

    _categories_cache = cats
    _categories_cache_ts = now
    return cats


@app.route("/api/documents/categories")
def doc_categories():
    """Return available categories and years (discovered from Drive)."""
    return jsonify(_fetch_categories())


@app.route("/api/documents/categories", methods=["POST"])
@_drive_retry
def create_doc_category():
    """Create a new document category folder in Drive."""
    data = request.get_json(silent=True) or {}
    raw = data.get("name", "").strip().lower().replace(" ", "_")
    raw = re.sub(r'[^a-z0-9_]', '', raw)
    if not _valid_category(raw):
        return jsonify({"error": "Invalid name. Use letters, numbers, underscores."}), 400
    docs_id = _get_docs_root_id()
    if _find_folder(raw, docs_id) is not None:
        return jsonify({"error": "Category already exists"}), 409
    cat_id = _find_or_create_folder(raw, docs_id)
    # Create current year subfolder
    _find_or_create_folder(str(datetime.now().year), cat_id)
    _invalidate_categories_cache()
    return jsonify({"ok": True, "category": raw})


@app.route("/api/documents/categories/<category>", methods=["DELETE"])
@_drive_retry
def delete_doc_category(category):
    """Delete an empty document category from Drive (moves to trash)."""
    if not _valid_category(category):
        return jsonify({"error": "Invalid category"}), 400
    drive = _get_drive()
    docs_id = _get_docs_root_id()
    cat_id = _find_folder(category, docs_id)
    if cat_id is None:
        return jsonify({"error": "Category not found"}), 404
    # Check if any non-folder files exist under category tree
    q = f"'{cat_id}' in parents and trashed=false"
    children = drive.files().list(q=q, fields="files(id,mimeType,name)").execute().get("files", [])
    for child in children:
        if child["mimeType"] != "application/vnd.google-apps.folder":
            return jsonify({"error": "Category is not empty. Delete all files first."}), 400
        # Check year subfolders for files too
        sq = f"'{child['id']}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'"
        sub_files = drive.files().list(q=sq, fields="files(id)", pageSize=1).execute().get("files", [])
        if sub_files:
            return jsonify({"error": "Category is not empty. Delete all files first."}), 400
    drive.files().update(fileId=cat_id, body={"trashed": True}).execute()
    _drive_folder_cache.pop((docs_id, category), None)
    _invalidate_categories_cache()
    return jsonify({"ok": True, "deleted": category})


@app.route("/api/documents/categories/<category>/years", methods=["POST"])
@_drive_retry
def create_doc_year(category):
    """Create a year folder inside a category in Drive."""
    if not _valid_category(category):
        return jsonify({"error": "Invalid category"}), 400
    docs_id = _get_docs_root_id()
    cat_id = _find_folder(category, docs_id)
    if cat_id is None:
        return jsonify({"error": "Category not found"}), 404
    data = request.get_json(silent=True) or {}
    year = str(data.get("year", "")).strip()
    if not re.match(r'^\d{4}$', year):
        return jsonify({"error": "Invalid year"}), 400
    if _find_folder(year, cat_id) is not None:
        return jsonify({"error": "Year already exists"}), 409
    _find_or_create_folder(year, cat_id)
    _invalidate_categories_cache()
    return jsonify({"ok": True, "category": category, "year": year})


# ═══════════════════════════════════════════════════════════════
#  STARTUP
# ═══════════════════════════════════════════════════════════════

import atexit as _atexit
import signal as _signal

_UP_FILE = BASE_DIR / "server_gsheets_form.up_running"

def _create_up_file():
    _UP_FILE.write_text(str(os.getpid()))

def _remove_up_file():
    _UP_FILE.unlink(missing_ok=True)

def _sigint_handler(sig, frame):
    _remove_up_file()
    raise SystemExit(0)

_atexit.register(_remove_up_file)
_signal.signal(_signal.SIGINT, _sigint_handler)


def _check_already_running():
    """If another instance is running, offer to kill it."""
    if not _UP_FILE.exists():
        return
    pid_str = _UP_FILE.read_text().strip()

    # Check if the PID is actually alive
    if pid_str.isdigit():
        pid = int(pid_str)
        import subprocess
        result = subprocess.run(
            ["tasklist", "/FI", f"PID eq {pid}", "/FO", "CSV", "/NH"],
            capture_output=True, text=True
        )
        if f'"{pid}"' not in result.stdout:
            # Stale marker — process is dead
            _remove_up_file()
            return

        print(f"\n  ⚠  Server already running (PID {pid}).")
        choice = input("     Kill it and restart? [y/N]: ").strip().lower()
        if choice in ("y", "yes"):
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(pid)],
                           capture_output=True)
            _remove_up_file()
            print("     Killed. Restarting...\n")
        else:
            print("     Aborted.")
            raise SystemExit(0)
    else:
        # Old format marker without PID — just clean up
        _remove_up_file()


def _kill_server():
    """Kill a running server using the PID from the up file."""
    if not _UP_FILE.exists():
        print("  Server is not running.")
        return
    pid_str = _UP_FILE.read_text().strip()
    if not pid_str.isdigit():
        _remove_up_file()
        print("  Stale marker removed.")
        return
    pid = int(pid_str)
    import subprocess
    result = subprocess.run(
        ["tasklist", "/FI", f"PID eq {pid}", "/FO", "CSV", "/NH"],
        capture_output=True, text=True
    )
    if f'"{pid}"' not in result.stdout:
        _remove_up_file()
        print("  Server is not running (stale marker removed).")
        return
    subprocess.run(["taskkill", "/F", "/T", "/PID", str(pid)], capture_output=True)
    _remove_up_file()
    print(f"  Server (PID {pid}) killed.")


if __name__ == "__main__":
    if "--kill" in sys.argv:
        _kill_server()
        raise SystemExit(0)

    # Flask debug reloader spawns a child process — skip PID check and
    # heavy init for the reloader child (WERKZEUG_RUN_MAIN is set in child)
    _is_reloader_child = os.environ.get("WERKZEUG_RUN_MAIN") == "true"

    if not _is_reloader_child:
        _check_already_running()
        print("\n  Connecting to Google Sheets...")
        _ensure_worksheets()
        _ensure_form_sheet()
        print("  Setting up Google Drive folders...")
        _move_spreadsheet_to_finance()
        _ensure_drive_folders()
        _fetch_categories()  # pre-warm cache
        port = int(os.environ.get("PORT", 5000))
        debug = os.environ.get("FLASK_DEBUG", "true").lower() in ("1", "true", "yes")
        _create_up_file()

        # Start form sync in background thread (non-blocking)
        print("  Syncing form expenses in background...")
        sync_thread = threading.Thread(target=_background_sync, daemon=True)
        sync_thread.start()

        print(f"\n  FinTrack server running at http://localhost:{port}\n")
    else:
        port = int(os.environ.get("PORT", 5000))
        debug = os.environ.get("FLASK_DEBUG", "true").lower() in ("1", "true", "yes")

    app.run(host="0.0.0.0", port=port, debug=debug)
