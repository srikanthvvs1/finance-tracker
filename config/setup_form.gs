/**
 * FinTrack — Google Form Auto-Setup Script
 * ──────────────────────────────────────────
 * Run this ONCE from your FinTrack Google Sheet:
 *   1. Open FinTrack spreadsheet
 *   2. Extensions → Apps Script
 *   3. Delete any existing code, paste this entire file
 *   4. Click ▶ Run → createExpenseForm()
 *   5. Authorize when prompted (first run only)
 *
 * This creates a Google Form linked to a "FormExpenses" sheet
 * in your spreadsheet with the exact columns the server expects.
 */

function createExpenseForm() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // ── 1. Create the Google Form ─────────────────────────────
  const form = FormApp.create('FinTrack — Add Expense');
  form.setDescription('Quick expense entry from phone. Syncs to FinTrack when server starts.');
  form.setConfirmationMessage('✅ Expense saved! It will sync next time you open FinTrack.');
  form.setAllowResponseEdits(false);
  form.setCollectEmail(false);

  // ── 2. Add form fields (order must match FormExpenses columns) ──

  // ExpenseDate — date picker
  const dateItem = form.addDateItem();
  dateItem.setTitle('Expense Date');
  dateItem.setHelpText('When did you spend this?');
  dateItem.setRequired(true);

  // Amount — number
  const amountItem = form.addTextItem();
  amountItem.setTitle('Amount');
  amountItem.setHelpText('Amount in ₹ (just the number, e.g. 450)');
  amountItem.setRequired(true);
  amountItem.setValidation(
    FormApp.createTextValidation()
      .setHelpText('Enter a valid number')
      .requireNumber()
      .build()
  );

  // Category — dropdown
  const categoryItem = form.addListItem();
  categoryItem.setTitle('Category');
  categoryItem.setRequired(true);
  categoryItem.setChoices([
    categoryItem.createChoice('food'),
    categoryItem.createChoice('travel'),
    categoryItem.createChoice('housing'),
    categoryItem.createChoice('health'),
    categoryItem.createChoice('entertainment'),
    categoryItem.createChoice('utilities'),
    categoryItem.createChoice('shopping'),
    categoryItem.createChoice('other'),
  ]);

  // Description — short text
  const descItem = form.addTextItem();
  descItem.setTitle('Description');
  descItem.setHelpText('Brief note (e.g. "Swiggy dinner", "Uber to office")');
  descItem.setRequired(true);

  // PaymentMode — dropdown
  const paymentItem = form.addListItem();
  paymentItem.setTitle('PaymentMode');
  paymentItem.setRequired(true);
  paymentItem.setChoices([
    paymentItem.createChoice('upi'),
    paymentItem.createChoice('card'),
    paymentItem.createChoice('debit'),
    paymentItem.createChoice('cash'),
    paymentItem.createChoice('transfer'),
  ]);

  // ── 3. Link form responses to this spreadsheet ────────────
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  // Wait for Sheets to create the response sheet
  SpreadsheetApp.flush();
  Utilities.sleep(2000);

  // ── 4. Rename the auto-created response sheet to "FormExpenses" ──
  // Google creates a sheet named "Form Responses 1" by default
  const sheets = ss.getSheets();
  let responseSheet = null;
  for (let i = 0; i < sheets.length; i++) {
    const name = sheets[i].getName();
    if (name.startsWith('Form Responses')) {
      responseSheet = sheets[i];
      break;
    }
  }

  if (responseSheet) {
    responseSheet.setName('FormExpenses');

    Logger.log('✅ Form created and linked!');
    Logger.log('📋 Form URL (bookmark this on phone): ' + form.getPublishedUrl());
    Logger.log('✏️ Edit URL (to modify form later): ' + form.getEditUrl());
  } else {
    // If auto-rename failed, create FormExpenses manually
    Logger.log('⚠️ Could not find auto-created response sheet.');
    Logger.log('   Manually rename "Form Responses 1" to "FormExpenses"');
    Logger.log('   Then add "Processed" and "ProcessedAt" as columns G and H');
    Logger.log('📋 Form URL: ' + form.getPublishedUrl());
    Logger.log('✏️ Edit URL: ' + form.getEditUrl());
  }

  // ── 6. Show the form URL in a dialog ──────────────────────
  const ui = SpreadsheetApp.getUi();
  ui.alert(
    'FinTrack Form Created! 🎉',
    'Form URL (bookmark on phone):\n\n' +
    form.getPublishedUrl() + '\n\n' +
    'The "FormExpenses" sheet is now linked.\n' +
    'Check Apps Script logs (View → Logs) for all URLs.',
    ui.ButtonSet.OK
  );
}


/**
 * Optional: Run this to check the current form link status.
 */
function checkFormSetup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets().map(s => s.getName());
  const hasFormSheet = sheets.includes('FormExpenses');

  Logger.log('Sheets in spreadsheet: ' + sheets.join(', '));
  Logger.log('FormExpenses sheet exists: ' + hasFormSheet);

  if (hasFormSheet) {
    const ws = ss.getSheetByName('FormExpenses');
    const headers = ws.getRange(1, 1, 1, ws.getLastColumn()).getValues()[0];
    Logger.log('FormExpenses headers: ' + headers.join(' | '));
    const dataRows = Math.max(0, ws.getLastRow() - 1);
    Logger.log('Data rows: ' + dataRows);
  }
}
