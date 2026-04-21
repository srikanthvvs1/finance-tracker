"""One-time script: parse expense text and upload to Google Sheets Expenses tab."""
import os, gspread
from pathlib import Path
from google.oauth2.service_account import Credentials

# ─── Config ─────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent
CONFIG_DIR = BASE_DIR / "config"
_env_file = CONFIG_DIR / "gsheets.env"
if _env_file.exists():
    for line in _env_file.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, val = line.split("=", 1)
            os.environ.setdefault(key.strip(), val.strip())

CREDS_FILE = CONFIG_DIR / os.environ.get("GSHEETS_CREDS_FILE", "credentials.json")
SPREADSHEET_ID = os.environ.get("GSHEETS_SPREADSHEET_ID", "")
SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

# ─── Category mapping ───────────────────────────────────────────
CATEGORY_MAP = {
    "entertainment": "entertainment",
    "grocery": "food",
    "food (outside)": "food",
    "travel": "travel",
    "shopping": "shopping",
    "other": "other",
    "health": "health",
    "utilities": "utilities",
    "housing": "housing",
}

# ─── Raw expense text ───────────────────────────────────────────
CONTENT = """29/03/2026
Entertainment
- Movie - 592

Grocery
- Vegetables - 320
- Ice cream (Zepto) - 281

Food (Outside)
- Movie snacks - 200
- Zomato - 437

Travel
- Bus - 3689

Shopping
- Shopping - 4797

Other
- Iron - 108


31/03/2026
Health
- Sunscreen - 398

Travel
- Uber - 184


01/04/2025
Travel
- TSRTC - 100
- Train tickets - 814
- Uber - 120

Utilities
- Internet - 217

Other
- Hyd-Bgl - 4000


06/04/2025
Food (Outside)
- Lunch - 215

Grocery
- Mangoes - 214
- Vegetables - 90


07/04/2025
Grocery
- Zepto - 162

Utilities
- WiFi - 3714

Other
- Office (BF) - 55


08/04/2025
Entertainment
- Pub - 2964

Travel
- Uber - 200


09/04/2025
Grocery
- Vegetables - 287
- DMart - 1451

Other
- Lunch Box - 370


10/04/2025
Grocery
- Zepto - 126
- Eggs - 165
- Watermelon - 76

Food (Outside)
- Lunch - 48

Shopping
- Furniture - 10500

Travel
- Petrol - 408

Utilities
- Oil can - 350


11/04/2025
Travel
- Petrol - 408

Grocery
- Mango/curd - 275
- Ice cream - 380
- Vegetables - 296

Other
- AI Subscription - 1999

Shopping
- Steel Bowl - 820


12/04/2025
Grocery
- Reliance Mart - 657
- Chicken - 496
- Vegetables - 1291
- Zepto - 688

Shopping
- Street Shopping - 944


13/04/2025
Grocery
- Zepto - 105
- Water - 35

Entertainment
- Entertainment - 250

Utilities
- Electricity - 1224
- Water bill - 200


15/04/2025
Utilities
- Electricity - 1224
- Water bill - 200

Grocery
- Nekta - 649
- Vegetables - 214
- Wine - 760

Other
- Movie - 476


16/04/2025
Shopping
- Pooja Items - 1100


17/04/2025
Grocery
- Fruits - 440

Other
- Flowers - 210
- Sweets - 160


18/04/2025
Health
- Hair cut - 100

Other
- Varamahalakshmi frame - 7000
- Reliance grocery - 2861


19/04/2025
Housing
- Rent - 28861

Travel
- Petrol - 514
- Petrol - 103
"""

# ─── Parser ─────────────────────────────────────────────────────
def parse_expenses(text):
    """Parse the structured expense text into list of dicts."""
    expenses = []
    current_date = None
    current_category = None

    for line in text.strip().splitlines():
        line = line.strip()
        if not line:
            continue

        # Check if it's a date line (dd/mm/yyyy)
        parts = line.split("/")
        if len(parts) == 3 and all(p.isdigit() for p in parts):
            d, m, y = parts
            current_date = f"{y}-{m.zfill(2)}-{d.zfill(2)}"
            current_category = None
            continue

        # Check if it's a category line (no leading dash)
        if not line.startswith("-"):
            cat_key = line.lower().strip()
            if cat_key in CATEGORY_MAP:
                current_category = CATEGORY_MAP[cat_key]
            else:
                print(f"  WARNING: Unknown category '{line}', defaulting to 'other'")
                current_category = "other"
            continue

        # It's an expense line: "- Description - Amount"
        if line.startswith("- ") and current_date and current_category:
            # Split from the RIGHT to find amount after last " - "
            rest = line[2:]  # remove "- " prefix
            last_dash = rest.rfind(" - ")
            if last_dash == -1:
                print(f"  WARNING: Can't parse line: {line}")
                continue
            description = rest[:last_dash].strip()
            amount_str = rest[last_dash + 3:].strip()
            try:
                amount = float(amount_str.replace(",", ""))
            except ValueError:
                print(f"  WARNING: Invalid amount '{amount_str}' in: {line}")
                continue

            expenses.append({
                "date": current_date,
                "description": description,
                "category": current_category,
                "payment": "upi",  # default
                "amount": amount,
            })

    return expenses


# ─── Main ───────────────────────────────────────────────────────
if __name__ == "__main__":
    print("Parsing expenses...")
    expenses = parse_expenses(CONTENT)
    print(f"  Parsed {len(expenses)} expenses")

    # Sort by date
    expenses.sort(key=lambda e: e["date"])

    # Assign IDs
    for i, e in enumerate(expenses, start=1):
        e["id"] = i

    # Preview
    print("\nPreview (first 5):")
    for e in expenses[:5]:
        print(f"  {e['id']:3d} | {e['date']} | {e['category']:15s} | {e['description']:30s} | {e['amount']}")
    print(f"  ... and {len(expenses) - 5} more")
    print(f"\nTotal amount: {sum(e['amount'] for e in expenses):,.0f}")

    # Connect to Google Sheets
    print("\nConnecting to Google Sheets...")
    creds = Credentials.from_service_account_file(str(CREDS_FILE), scopes=SCOPES)
    gc = gspread.authorize(creds)
    sh = gc.open_by_key(SPREADSHEET_ID)
    ws = sh.worksheet("Expenses")
    print("  Connected!")

    # Clear existing data (keep header)
    print("Clearing existing expense data...")
    all_vals = ws.get_all_values()
    if len(all_vals) > 1:
        ws.delete_rows(2, len(all_vals))
        print(f"  Deleted {len(all_vals) - 1} old rows")
    else:
        print("  No existing data to clear")

    # Build rows
    rows = []
    for e in expenses:
        rows.append([e["id"], e["date"], e["description"], e["category"], e["payment"], e["amount"]])

    # Upload
    print(f"Uploading {len(rows)} expenses...")
    ws.append_rows(rows, value_input_option="USER_ENTERED")
    print("  Done! ✓")
