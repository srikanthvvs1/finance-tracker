# Google Sheets expense inbox setup

FinTrack keeps its authoritative data in local `data.xlsx`. A Google service
account is used only to read incoming expense rows from Google Sheets and remove
rows after they have been safely written locally.

## Setup

1. Create a project in Google Cloud Console.
2. Enable the Google Sheets API.
3. Create a service account and download its JSON key.
4. Put the key in `config/`. It is ignored by Git.
5. Create or select the spreadsheet used by the expense form.
6. Share that spreadsheet as Editor with the service account's `client_email`.
7. Copy `config/gsheets.env.example` to `config/gsheets.env` and fill in:

   ```env
   GSHEETS_CREDS_FILE=your-key.json
   GSHEETS_SPREADSHEET_ID=your-spreadsheet-id
   ```

The spreadsheet ID is the value between `/d/` and `/edit` in its URL. The
worksheet must use these headers:

```text
Timestamp | Expense Date | Amount | Category | Description | PaymentMode
```

The Apps Script in `config/setup_form.gs` can create the form and worksheet.
Its category list includes `food`, `grocery`, `travel`, `housing`, `health`,
`personal_care`, `subscriptions`, `entertainment`, `utilities`, `shopping`, and
`other`.

## Sync behavior

At server startup, FinTrack:

1. Reads all rows from the configured worksheet.
2. Validates and normalizes each expense.
3. Skips expenses already present in local `data.xlsx`.
4. Writes new expenses to local `data.xlsx`.
5. Removes successfully handled or duplicate rows from Google Sheets.

Invalid rows remain in Google Sheets for correction. If Google is unavailable or
configuration is missing, the local server still starts normally and reports that
the optional sync was skipped.

Use `POST /api/sync-form-expenses` to trigger another pull while the server is
running. `GET /api/sync-form-expenses` returns the latest sync result.

## Security

Never commit `config/gsheets.env` or service-account JSON keys. Both are covered
by the repository's `.gitignore`.
