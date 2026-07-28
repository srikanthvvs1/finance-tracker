"""
FinTrack Local Server
─────────────────────
A lightweight Flask server that:
  1. Serves the static front-end (index.html, script.js, style.css)
  2. Persists all data to an Excel file (data.xlsx) via openpyxl
  3. Proxies live price requests to Yahoo Finance & mfapi.in (no CORS issues)
  4. Imports new expense entries from a Google Sheets inbox at startup

Run:  python server.py
Open: http://localhost:5000
"""

import hashlib
import os
import re
import shutil
import tempfile
import threading
import time
from datetime import date, datetime
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory
import openpyxl
import requests
import gspread
from google.oauth2.service_account import Credentials

# ─── Config (override via environment variables) ────────────────────
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get("FINTRACK_DATA_DIR", str(BASE_DIR)))
DATA_FILE = DATA_DIR / "data.xlsx"
BACKUP_DIR = DATA_DIR / "backups"
BACKUP_KEEP = max(3, int(os.environ.get("FINTRACK_BACKUP_KEEP", "20")))
_file_lock = threading.Lock()

CONFIG_DIR = BASE_DIR / "config"
_env_file = CONFIG_DIR / "gsheets.env"
if _env_file.exists():
    for line in _env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip())

GSHEETS_CREDS_FILE = CONFIG_DIR / os.environ.get("GSHEETS_CREDS_FILE", "credentials.json")
GSHEETS_SPREADSHEET_ID = os.environ.get("GSHEETS_SPREADSHEET_ID", "")
FORM_SHEET_NAME = "FormExpenses"
GSHEETS_SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
]
_sync_lock = threading.Lock()
_last_sync_result = {"synced": 0, "errors": [], "timestamp": None}

STATIC_DIR = BASE_DIR / "static"
app = Flask(__name__, static_folder=str(STATIC_DIR), static_url_path="")


# ═══════════════════════════════════════════════════════════════
#  EXCEL HELPERS  (atomic writes via temp-file + rename)
# ═══════════════════════════════════════════════════════════════

EXPENSE_COLS = ["id", "date", "description", "category", "payment", "amount", "accountId"]
INVESTMENT_COLS = [
    "id", "asset", "name", "category", "units", "buyPrice",
    "currentPrice", "date", "marketCap", "riskLevel", "ticker", "schemeCode",
]
TRANSACTION_COLS = ["investmentId", "date", "action", "units", "price", "accountId"]
SAVINGS_HIST_COLS = [
    "month", "income", "expenses", "invested", "emergency", "net_saved", "accountId",
]
SAVINGS_GOAL_COLS = ["id", "name", "icon", "target", "current", "deadline"]
EMERGENCY_COLS = ["target"]
EMERGENCY_CONTRIB_COLS = ["id", "date", "amount", "note"]
BUDGET_COLS = ["month", "category", "amount"]
RECURRING_BILL_COLS = [
    "id", "name", "category", "amount", "dueDay", "frequency", "active",
    "includedInBudget",
]
NET_WORTH_COLS = [
    "month", "cash", "bank", "investments", "retirement", "otherAssets",
    "loans", "creditCards", "otherLiabilities",
]
CASH_FLOW_COLS = ["month", "openingBalance", "otherIncome", "safetyBalance"]
ACCOUNT_COLS = [
    "id", "name", "bank", "purpose", "openingBalance", "statementBalance",
    "includeNetWorth", "active",
]
TRANSFER_COLS = ["id", "date", "fromAccountId", "toAccountId", "amount", "note"]

PLANNING_SHEETS = {
    "Budgets": BUDGET_COLS,
    "RecurringBills": RECURRING_BILL_COLS,
    "NetWorth": NET_WORTH_COLS,
    "CashFlow": CASH_FLOW_COLS,
    "Accounts": ACCOUNT_COLS,
    "Transfers": TRANSFER_COLS,
}


def _ensure_planning_sheets(wb):
    """Add newly introduced planning sheets without touching existing user data."""
    from openpyxl.styles import Font, Alignment, PatternFill, Border, Side

    changed = False
    for sheet_name, columns in PLANNING_SHEETS.items():
        if sheet_name in wb.sheetnames:
            continue
        ws = wb.create_sheet(sheet_name)
        ws.append(columns)
        for cell in ws[1]:
            cell.font = Font(name="Calibri", bold=True, size=11, color="FFFFFF")
            cell.fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
            cell.border = Border(
                left=Side(style="thin"), right=Side(style="thin"),
                top=Side(style="thin"), bottom=Side(style="thin"),
            )
        ws.freeze_panes = "A2"
        ws.auto_filter.ref = ws.dimensions
        changed = True
    return changed


def _migrate_sheet_schema(wb, sheet_name, columns):
    """Reorder/add known columns without discarding existing rows."""
    if sheet_name not in wb.sheetnames:
        return False
    ws = wb[sheet_name]
    existing = [cell.value for cell in ws[1]]
    if existing == columns:
        return False
    positions = {str(name): index for index, name in enumerate(existing) if name}
    values = list(ws.iter_rows(min_row=2, values_only=True))
    migrated = [
        [row[positions[col]] if col in positions and positions[col] < len(row) else None
         for col in columns]
        for row in values
    ]
    ws.delete_rows(1, ws.max_row)
    ws.append(columns)
    for row in migrated:
        ws.append(row)
    return True


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


def _backup_workbook():
    """Create a timestamped rolling backup before modifying data.xlsx."""
    if not DATA_FILE.exists():
        return None
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    destination = BACKUP_DIR / f"data_{stamp}.xlsx"
    shutil.copy2(DATA_FILE, destination)
    backups = sorted(BACKUP_DIR.glob("data_*.xlsx"), key=lambda path: path.stat().st_mtime)
    for old_backup in backups[:-BACKUP_KEEP]:
        old_backup.unlink(missing_ok=True)
    return destination


def _ensure_workbook():
    """Create an empty Excel file with formatted sheets if it does not exist."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if DATA_FILE.exists():
        try:
            wb = _open_workbook(retries=8, delay=1.0)
            # Upgrade known sheets in place; never delete user data for a schema change.
            changed = _ensure_planning_sheets(wb)
            schemas = {
                "Expenses": EXPENSE_COLS,
                "Investments": INVESTMENT_COLS,
                "Transactions": TRANSACTION_COLS,
                "SavingsGoals": SAVINGS_GOAL_COLS,
                "EmergencyFund": EMERGENCY_COLS,
                "EFContributions": EMERGENCY_CONTRIB_COLS,
                "SavingsHistory": SAVINGS_HIST_COLS,
                **PLANNING_SHEETS,
            }
            for sheet_name, columns in schemas.items():
                changed = _migrate_sheet_schema(wb, sheet_name, columns) or changed
            if changed:
                _backup_workbook()
                _safe_save(wb)
                print("[OK] Migrated workbook schema without deleting existing data")
            else:
                wb.close()
            return
        except PermissionError:
            print("[!] data.xlsx is locked. Close Excel/OneDrive and restart FinTrack.")
            return
        except Exception as exc:
            BACKUP_DIR.mkdir(parents=True, exist_ok=True)
            stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            quarantined = BACKUP_DIR / f"data_unreadable_{stamp}.xlsx"
            shutil.move(str(DATA_FILE), str(quarantined))
            print(f"[!] Workbook could not be opened ({exc}). Preserved it as {quarantined.name}.")

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

    # Create empty, formatted sheets. User data is added through the app or expense sync.
    _create_sheet("Expenses", EXPENSE_COLS, widths=[12, 14, 35, 16, 14, 14])
    _create_sheet("Investments", INVESTMENT_COLS, widths=[14, 14, 28, 18, 12, 16, 16, 14, 12, 12, 16, 14])
    _create_sheet("Transactions", TRANSACTION_COLS, widths=[14, 14, 10, 12, 16])
    _create_sheet("SavingsGoals", SAVINGS_GOAL_COLS, widths=[12, 24, 8, 16, 16, 14])
    _create_sheet("EmergencyFund", EMERGENCY_COLS, widths=[16])
    _create_sheet("EFContributions", EMERGENCY_CONTRIB_COLS, widths=[12, 14, 16, 30])
    _create_sheet("SavingsHistory", SAVINGS_HIST_COLS, widths=[14, 16, 16, 16, 16, 16])
    _create_sheet("Budgets", BUDGET_COLS, widths=[14, 18, 16])
    _create_sheet("RecurringBills", RECURRING_BILL_COLS, widths=[12, 28, 18, 16, 12, 14, 12])
    _create_sheet("NetWorth", NET_WORTH_COLS, widths=[14, 16, 16, 16, 16, 16, 16, 16, 18])
    _create_sheet("CashFlow", CASH_FLOW_COLS, widths=[14, 18, 16, 18])
    _create_sheet("Accounts", ACCOUNT_COLS, widths=[12, 24, 18, 18, 18, 18, 18, 12])
    _create_sheet("Transfers", TRANSFER_COLS, widths=[12, 14, 18, 18, 16, 30])

    _safe_save(wb)
    print("[OK] Created empty data.xlsx workbook")

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
        _backup_workbook()
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
        _backup_workbook()
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
#  GOOGLE SHEETS EXPENSE INBOX → LOCAL EXCEL
# ═══════════════════════════════════════════════════════════════

_VALID_CATEGORIES = {
    "food", "grocery", "travel", "housing", "health",
    "entertainment", "utilities", "shopping", "other",
}
_VALID_PAYMENTS = {"card", "debit", "cash", "transfer", "upi"}


def _normalise_category(raw):
    cleaned = str(raw or "").strip().lower().replace(" ", "_")
    if cleaned in _VALID_CATEGORIES:
        return cleaned
    return {
        "food_&_dining": "food", "dining": "food", "groceries": "grocery",
        "transport": "travel", "transportation": "travel", "cab": "travel",
        "rent": "housing", "home": "housing", "medical": "health",
        "medicine": "health", "pharmacy": "health", "bills": "utilities",
        "electricity": "utilities", "internet": "utilities",
        "movies": "entertainment", "games": "entertainment",
        "clothes": "shopping", "amazon": "shopping",
    }.get(cleaned, "other")


def _normalise_payment(raw):
    cleaned = str(raw or "").strip().lower().replace(" ", "_")
    if cleaned in _VALID_PAYMENTS:
        return cleaned
    return {
        "credit_card": "card", "credit": "card", "cc": "card",
        "debit_card": "debit", "dc": "debit", "bank_transfer": "transfer",
        "neft": "transfer", "imps": "transfer", "google_pay": "upi",
        "gpay": "upi", "phonepe": "upi", "paytm": "upi",
    }.get(cleaned, "card")


def _normalise_form_date(raw):
    value = str(raw or "").strip()
    for fmt in (
        "%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y", "%Y/%m/%d",
        "%d %b %Y", "%d %B %Y", "%m/%d/%Y %H:%M:%S",
        "%d/%m/%Y %H:%M:%S", "%Y-%m-%d %H:%M:%S",
    ):
        try:
            return datetime.strptime(value, fmt).date().isoformat()
        except ValueError:
            continue
    return date.today().isoformat()


def _expense_fingerprint(expense):
    amount = float(expense.get("amount") or 0)
    raw = "|".join((
        str(expense.get("date") or ""),
        f"{amount:.2f}",
        str(expense.get("description") or "").strip().casefold(),
    ))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _open_form_worksheet():
    """Connect lazily so local operation does not depend on Google being available."""
    if not GSHEETS_SPREADSHEET_ID:
        raise RuntimeError("GSHEETS_SPREADSHEET_ID is not configured")
    if not GSHEETS_CREDS_FILE.exists():
        raise RuntimeError(f"Google credentials not found: {GSHEETS_CREDS_FILE}")
    credentials = Credentials.from_service_account_file(
        str(GSHEETS_CREDS_FILE), scopes=GSHEETS_SCOPES
    )
    spreadsheet = gspread.authorize(credentials).open_by_key(GSHEETS_SPREADSHEET_ID)
    return spreadsheet.worksheet(FORM_SHEET_NAME)


def _sync_form_expenses():
    """Move valid, unseen expense-inbox rows from Google Sheets into data.xlsx."""
    global _last_sync_result
    with _sync_lock:
        errors = []
        timestamp = datetime.now().isoformat()
        try:
            worksheet = _open_form_worksheet()
            sheet_rows = worksheet.get_all_values()
            if len(sheet_rows) <= 1:
                _last_sync_result = {"synced": 0, "errors": [], "timestamp": timestamp}
                return 0, []

            header = {name.strip(): index for index, name in enumerate(sheet_rows[0])}

            def field(row, *names):
                for name in names:
                    index = header.get(name)
                    if index is not None and index < len(row):
                        return row[index]
                return ""

            local_expenses = _read_sheet("Expenses", EXPENSE_COLS)
            account_rows = _read_sheet("Accounts", ACCOUNT_COLS)
            default_spending_account = next(
                (
                    int(row["id"]) for row in account_rows
                    if row.get("id") and str(row.get("purpose") or "").lower() == "spending"
                    and row.get("active") is not False
                ),
                None,
            )
            existing = {_expense_fingerprint(item) for item in local_expenses}
            next_id = max((int(item.get("id") or 0) for item in local_expenses), default=0)
            additions = []
            processed_rows = []

            for sheet_row_number, row in enumerate(sheet_rows[1:], start=2):
                try:
                    amount_text = str(field(row, "Amount")).replace(",", "").strip()
                    amount = float(amount_text)
                    if amount <= 0:
                        raise ValueError("amount must be greater than zero")
                    item = {
                        "date": _normalise_form_date(
                            field(row, "Expense Date", "ExpenseDate", "Timestamp")
                        ),
                        "description": str(field(row, "Description")).strip() or "Form entry",
                        "category": _normalise_category(field(row, "Category")),
                        "payment": _normalise_payment(field(row, "PaymentMode", "Payment Mode")),
                        "amount": amount,
                        "accountId": default_spending_account,
                    }
                    fingerprint = _expense_fingerprint(item)
                    if fingerprint not in existing:
                        next_id += 1
                        item["id"] = next_id
                        additions.append(item)
                        existing.add(fingerprint)
                    processed_rows.append(sheet_row_number)
                except (TypeError, ValueError) as exc:
                    errors.append(f"Row {sheet_row_number}: {exc}")

            if additions:
                _write_sheet("Expenses", EXPENSE_COLS, local_expenses + additions)

            # Clear only successfully imported or duplicate rows. Invalid rows remain visible.
            for row_number in reversed(processed_rows):
                worksheet.delete_rows(row_number)

            _last_sync_result = {
                "synced": len(additions), "errors": errors, "timestamp": timestamp
            }
            return len(additions), errors
        except Exception as exc:
            errors.append(f"Google Sheets sync failed: {exc}")
            _last_sync_result = {"synced": 0, "errors": errors, "timestamp": timestamp}
            return 0, errors

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
        r["accountId"] = int(r["accountId"]) if r.get("accountId") else None
    return jsonify(rows)


@app.route("/api/expenses", methods=["POST"])
def save_expenses():
    data = request.get_json(force=True)
    if not isinstance(data, list):
        return jsonify({"error": "Expected array"}), 400
    _write_sheet("Expenses", EXPENSE_COLS, data)
    return jsonify({"ok": True, "count": len(data)})


@app.route("/api/sync-form-expenses", methods=["POST"])
def api_sync_form_expenses():
    """Manually pull new expense-inbox rows into the local workbook."""
    synced, errors = _sync_form_expenses()
    status = 200 if not errors or synced else 502
    return jsonify({
        "synced": synced,
        "errors": errors,
        "timestamp": _last_sync_result["timestamp"],
    }), status


@app.route("/api/sync-form-expenses", methods=["GET"])
def api_sync_status():
    return jsonify(_last_sync_result)


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
                "accountId": int(t["accountId"]) if t.get("accountId") else None,
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
        if not isinstance(inv, dict) or not inv.get("id") or not inv.get("category"):
            return jsonify({"error": "Each investment requires id and category"}), 400
        try:
            units = float(inv.get("units") or 0)
            buy_price = float(inv.get("buyPrice") or 0)
            current_price = float(inv.get("currentPrice") or 0)
        except (TypeError, ValueError):
            return jsonify({"error": "Investment amounts must be numeric"}), 400
        if min(units, buy_price, current_price) < 0:
            return jsonify({"error": "Investment amounts cannot be negative"}), 400
        inv_rows.append({c: inv.get(c) for c in INVESTMENT_COLS})
        for txn in inv.get("transactions", []):
            action = str(txn.get("action") or "").upper()
            try:
                txn_units = float(txn.get("units") or 0)
                txn_price = float(txn.get("price") or 0)
            except (TypeError, ValueError):
                return jsonify({"error": "Transaction units and price must be numeric"}), 400
            valid_actions = {
                "BUY", "SELL", "DEPOSIT", "INTEREST", "WITHDRAWAL", "ADJUSTMENT",
            }
            if action not in valid_actions or txn_units <= 0 or txn_price < 0:
                return jsonify({"error": "Invalid investment transaction"}), 400
            txn_rows.append({
                "investmentId": inv["id"],
                "date": txn.get("date"),
                "action": action,
                "units": txn_units,
                "price": txn_price,
                "accountId": txn.get("accountId"),
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
        if (t.get("action") or "").upper() in {"BUY", "DEPOSIT"}:
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
    account_id = body.get("accountId")
    if income is None:
        return jsonify({"error": "income required"}), 400
    rows = _read_sheet("SavingsHistory", SAVINGS_HIST_COLS)
    found = False
    for r in rows:
        if r["month"] == month_label:
            r["income"] = income
            if account_id is not None:
                r["accountId"] = account_id
            found = True
            break
    if not found:
        rows.append({"month": month_label, "income": income, "accountId": account_id})
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
    target = float(rows[0]["target"]) if rows and rows[0]["target"] else 0

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
    _write_sheet("EmergencyFund", EMERGENCY_COLS, [{"target": data.get("target", 0)}])
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
#  API: FINANCIAL PLANNING
# ═══════════════════════════════════════════════════════════════

def _planning_response(sheet_name, columns):
    return jsonify(_read_sheet(sheet_name, columns))


def _save_planning_rows(sheet_name, columns):
    data = request.get_json(force=True)
    if not isinstance(data, list):
        return jsonify({"error": "Expected array"}), 400
    cleaned = [{column: row.get(column) for column in columns} for row in data if isinstance(row, dict)]
    _write_sheet(sheet_name, columns, cleaned)
    return jsonify({"ok": True, "count": len(cleaned)})


@app.route("/api/budgets", methods=["GET"])
def get_budgets():
    return _planning_response("Budgets", BUDGET_COLS)


@app.route("/api/budgets", methods=["POST"])
def save_budgets():
    return _save_planning_rows("Budgets", BUDGET_COLS)


@app.route("/api/recurring-bills", methods=["GET"])
def get_recurring_bills():
    return _planning_response("RecurringBills", RECURRING_BILL_COLS)


@app.route("/api/recurring-bills", methods=["POST"])
def save_recurring_bills():
    return _save_planning_rows("RecurringBills", RECURRING_BILL_COLS)


@app.route("/api/net-worth", methods=["GET"])
def get_net_worth():
    return _planning_response("NetWorth", NET_WORTH_COLS)


@app.route("/api/net-worth", methods=["POST"])
def save_net_worth():
    return _save_planning_rows("NetWorth", NET_WORTH_COLS)


@app.route("/api/cash-flow", methods=["GET"])
def get_cash_flow():
    return _planning_response("CashFlow", CASH_FLOW_COLS)


@app.route("/api/cash-flow", methods=["POST"])
def save_cash_flow():
    return _save_planning_rows("CashFlow", CASH_FLOW_COLS)


@app.route("/api/accounts", methods=["GET"])
def get_accounts():
    rows = _read_sheet("Accounts", ACCOUNT_COLS)
    for row in rows:
        row["id"] = int(row["id"]) if row.get("id") else 0
        row["openingBalance"] = float(row["openingBalance"] or 0)
        row["statementBalance"] = float(row["statementBalance"] or 0)
    return jsonify(rows)


@app.route("/api/accounts", methods=["POST"])
def save_accounts():
    data = request.get_json(force=True)
    if not isinstance(data, list):
        return jsonify({"error": "Expected array"}), 400
    cleaned = []
    valid_purposes = {"salary", "investment", "spending", "savings", "other"}
    for row in data:
        if not isinstance(row, dict) or not row.get("id") or not str(row.get("name") or "").strip():
            return jsonify({"error": "Each account requires id and name"}), 400
        purpose = str(row.get("purpose") or "other").lower()
        if purpose not in valid_purposes:
            return jsonify({"error": "Invalid account purpose"}), 400
        try:
            opening = float(row.get("openingBalance") or 0)
            statement = float(row.get("statementBalance") or 0)
        except (TypeError, ValueError):
            return jsonify({"error": "Account balances must be numeric"}), 400
        cleaned.append({
            **{column: row.get(column) for column in ACCOUNT_COLS},
            "name": str(row["name"]).strip(),
            "bank": str(row.get("bank") or "").strip(),
            "purpose": purpose,
            "openingBalance": opening,
            "statementBalance": statement,
        })
    _write_sheet("Accounts", ACCOUNT_COLS, cleaned)
    return jsonify({"ok": True, "count": len(cleaned)})


@app.route("/api/transfers", methods=["GET"])
def get_transfers():
    rows = _read_sheet("Transfers", TRANSFER_COLS)
    for row in rows:
        row["id"] = int(row["id"]) if row.get("id") else 0
        row["fromAccountId"] = int(row["fromAccountId"]) if row.get("fromAccountId") else None
        row["toAccountId"] = int(row["toAccountId"]) if row.get("toAccountId") else None
        row["amount"] = float(row["amount"] or 0)
    return jsonify(rows)


@app.route("/api/transfers", methods=["POST"])
def save_transfers():
    data = request.get_json(force=True)
    if not isinstance(data, list):
        return jsonify({"error": "Expected array"}), 400
    account_ids = {
        int(row["id"]) for row in _read_sheet("Accounts", ACCOUNT_COLS) if row.get("id")
    }
    cleaned = []
    for row in data:
        try:
            from_id = int(row.get("fromAccountId"))
            to_id = int(row.get("toAccountId"))
            amount = float(row.get("amount") or 0)
        except (TypeError, ValueError, AttributeError):
            return jsonify({"error": "Invalid transfer"}), 400
        if (from_id == to_id or from_id not in account_ids or to_id not in account_ids
                or amount <= 0 or not row.get("date")):
            return jsonify({"error": "Transfer requires different accounts, date, and positive amount"}), 400
        cleaned.append({
            "id": row.get("id"),
            "date": row.get("date"),
            "fromAccountId": from_id,
            "toAccountId": to_id,
            "amount": amount,
            "note": str(row.get("note") or "").strip(),
        })
    _write_sheet("Transfers", TRANSFER_COLS, cleaned)
    return jsonify({"ok": True, "count": len(cleaned)})


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
    return send_from_directory(str(DATA_FILE.parent), DATA_FILE.name,
                               as_attachment=True,
                               download_name="FinTrack_data.xlsx")


# ═══════════════════════════════════════════════════════════════
#  API: DOCUMENTS
# ═══════════════════════════════════════════════════════════════

DOCS_DIR = BASE_DIR / "documents"
DEFAULT_DOC_CATEGORIES = ["salary_slips", "tax", "insurance", "investments", "bank_statements"]

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
    synced, sync_errors = _sync_form_expenses()
    if synced:
        print(f"[OK] Imported {synced} new expense(s) from Google Sheets")
    elif sync_errors:
        print(f"[!] Google Sheets expense sync skipped: {sync_errors[0]}")
    port = int(os.environ.get("PORT", 5000))
    host = os.environ.get("FINTRACK_HOST", "127.0.0.1")
    debug = os.environ.get("FLASK_DEBUG", "false").lower() in ("1", "true", "yes")
    print(f"\n  FinTrack server running at http://localhost:{port}\n")
    app.run(host=host, port=port, debug=debug, use_reloader=False)
