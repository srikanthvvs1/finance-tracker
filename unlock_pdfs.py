#!/usr/bin/env python3
"""Bulk-unlock password-protected PDFs in the documents/ folder (or Google Drive).

Usage:
    set PDF_PASSWORD=yourpassword
    python unlock_pdfs.py                  # unlock local documents/
    python unlock_pdfs.py --drive          # unlock PDFs in Google Drive
    python unlock_pdfs.py --dry-run        # preview without changes
"""
import os, sys, argparse
from pathlib import Path

try:
    import pikepdf
except ImportError:
    sys.exit("pikepdf not installed. Run: pip install pikepdf")

BASE_DIR = Path(__file__).resolve().parent
DOCS_DIR = BASE_DIR / "documents"
CONFIG_DIR = BASE_DIR / "config"


def get_password():
    pw = os.environ.get("PDF_PASSWORD", "").strip()
    if not pw:
        import getpass
        pw = getpass.getpass("PDF password: ")
    return pw


def unlock_local(password, dry_run=False):
    """Unlock all password-protected PDFs under documents/."""
    unlocked = 0
    skipped = 0
    failed = 0

    for pdf_path in sorted(DOCS_DIR.rglob("*.pdf")):
        rel = pdf_path.relative_to(BASE_DIR)
        try:
            # Try opening without password — if it works, it's not encrypted
            with pikepdf.open(pdf_path) as _:
                skipped += 1
                continue
        except pikepdf.PasswordError:
            pass

        # It's encrypted — try with password
        try:
            with pikepdf.open(pdf_path, password=password) as pdf:
                if dry_run:
                    print(f"  [DRY-RUN] Would unlock: {rel}")
                    unlocked += 1
                    continue
                # Save to temp, then replace original
                tmp = pdf_path.with_suffix(".tmp.pdf")
                pdf.save(tmp)
            # Replace original
            pdf_path.unlink()
            tmp.rename(pdf_path)
            print(f"  [OK] Unlocked: {rel}")
            unlocked += 1
        except pikepdf.PasswordError:
            print(f"  [FAIL] Wrong password: {rel}")
            failed += 1
        except Exception as e:
            print(f"  [FAIL] {rel}: {e}")
            failed += 1

    print(f"\nDone. Unlocked: {unlocked}, Already unlocked: {skipped}, Failed: {failed}")
    return unlocked, skipped, failed


def unlock_drive(password, dry_run=False):
    """Unlock all password-protected PDFs in Google Drive FinTrack_Documents."""
    import io, pickle
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaIoBaseDownload, MediaIoBaseUpload
    from google.auth.transport.requests import Request as AuthRequest

    token_file = CONFIG_DIR / "drive_token.pickle"
    if not token_file.exists():
        sys.exit("No Drive token found. Run server_gsheets.py first to authenticate.")

    with open(token_file, "rb") as f:
        creds = pickle.load(f)
    if creds.expired and creds.refresh_token:
        creds.refresh(AuthRequest())

    drive = build("drive", "v3", credentials=creds, cache_discovery=False)

    # Find FinTrack_Documents folder
    q = "name='FinTrack_Documents' and mimeType='application/vnd.google-apps.folder' and trashed=false"
    docs_root = drive.files().list(q=q, fields="files(id)").execute().get("files", [])
    if not docs_root:
        sys.exit("FinTrack_Documents folder not found in Drive.")

    # Find all PDFs recursively
    def find_pdfs(folder_id, path=""):
        q = f"'{folder_id}' in parents and trashed=false"
        items = drive.files().list(q=q, fields="files(id,name,mimeType)").execute().get("files", [])
        for item in items:
            if item["mimeType"] == "application/vnd.google-apps.folder":
                yield from find_pdfs(item["id"], f"{path}/{item['name']}")
            elif item["name"].lower().endswith(".pdf"):
                yield item["id"], f"{path}/{item['name']}"

    unlocked = 0
    skipped = 0
    failed = 0

    for file_id, rel_path in find_pdfs(docs_root[0]["id"], "FinTrack_Documents"):
        # Download
        req = drive.files().get_media(fileId=file_id)
        buf = io.BytesIO()
        dl = MediaIoBaseDownload(buf, req)
        done = False
        while not done:
            _, done = dl.next_chunk()
        buf.seek(0)

        # Check if encrypted
        try:
            with pikepdf.open(buf) as _:
                skipped += 1
                continue
        except pikepdf.PasswordError:
            pass

        # Decrypt
        buf.seek(0)
        try:
            with pikepdf.open(buf, password=password) as pdf:
                if dry_run:
                    print(f"  [DRY-RUN] Would unlock: {rel_path}")
                    unlocked += 1
                    continue
                out = io.BytesIO()
                pdf.save(out)
                out.seek(0)

            # Upload back (update in place)
            media = MediaIoBaseUpload(out, mimetype="application/pdf")
            drive.files().update(fileId=file_id, media_body=media).execute()
            print(f"  [OK] Unlocked: {rel_path}")
            unlocked += 1
        except pikepdf.PasswordError:
            print(f"  [FAIL] Wrong password: {rel_path}")
            failed += 1
        except Exception as e:
            print(f"  [FAIL] {rel_path}: {e}")
            failed += 1

    print(f"\nDone. Unlocked: {unlocked}, Already unlocked: {skipped}, Failed: {failed}")
    return unlocked, skipped, failed


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Unlock password-protected PDFs")
    parser.add_argument("--drive", action="store_true", help="Unlock PDFs in Google Drive")
    parser.add_argument("--dry-run", action="store_true", help="Preview without making changes")
    args = parser.parse_args()

    password = get_password()

    if args.drive:
        print("Scanning Google Drive for encrypted PDFs...\n")
        unlock_drive(password, dry_run=args.dry_run)
    else:
        if not DOCS_DIR.exists():
            sys.exit(f"Documents folder not found: {DOCS_DIR}")
        print(f"Scanning {DOCS_DIR} for encrypted PDFs...\n")
        unlock_local(password, dry_run=args.dry_run)
