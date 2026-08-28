/* ============================================================
   DATA ARRAYS  (loaded exclusively from server / Excel)
   ============================================================ */

let expenses = [];
let incomeTransactions = [];
let investments = [];
let savingsHistory = [];
let savingsGoals = [];
let emergencyFund = { target: 0, current: 0, contributions: [] };
let budgets = [];
let recurringBills = [];
let netWorthHistory = [];
let automaticNetWorthHistory = [];
let cashFlowSettings = [];
let accounts = [];
let transfers = [];
let recurringRules = [];
let recurringOccurrences = [];
let reconciliationAdjustments = [];
let emergencyAllocations = [];

/* ── Server API base URL (relative — works on any host/port) ── */
const API_BASE = '/api';
let serverAvailable = false;

/* ── API helpers ───────────────────────────────────────────── */
async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json();
}
async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(payload.error || `POST ${path} failed (${res.status})`);
    error.status = res.status;
    throw error;
  }
  return payload;
}

/* ── Load all data from server (Excel is the single source of truth) ── */
async function loadAllData() {
  try {
    const [exp, incomeRows, inv, sh, sg, ef, budgetRows, billRows, netWorthRows, automaticNetWorthRows, cashFlowRows, accountRows, transferRows, ruleRows, occurrenceRows, adjustmentRows, emergencyAllocationRows] = await Promise.all([
      apiGet('/expenses'),
      apiGet('/income-transactions'),
      apiGet('/investments'),
      apiGet('/savings-history'),
      apiGet('/savings-goals'),
      apiGet('/emergency-fund'),
      apiGet('/budgets'),
      apiGet('/recurring-bills'),
      apiGet('/net-worth'),
      apiGet('/net-worth-auto').catch(error => {
        console.warn('Automatic net-worth history is unavailable until the server restarts:', error.message);
        return [];
      }),
      apiGet('/cash-flow'),
      apiGet('/accounts'),
      apiGet('/transfers'),
      apiGet('/recurring-rules'),
      apiGet('/recurring-occurrences'),
      apiGet('/reconciliation-adjustments'),
      apiGet('/emergency-allocations'),
    ]);
    expenses       = exp;
    incomeTransactions = incomeRows;
    investments    = inv;
    savingsHistory = sh;
    savingsGoals   = sg;
    emergencyFund  = ef;
    budgets = budgetRows;
    recurringBills = billRows;
    netWorthHistory = netWorthRows;
    automaticNetWorthHistory = automaticNetWorthRows;
    cashFlowSettings = cashFlowRows;
    accounts = accountRows;
    transfers = transferRows;
    recurringRules = ruleRows;
    recurringOccurrences = occurrenceRows;
    reconciliationAdjustments = adjustmentRows;
    emergencyAllocations = emergencyAllocationRows;
    serverAvailable = true;
    console.log(`✅ Data loaded from Excel — ${exp.length} expenses, ${inv.length} investments, ${sh.length} savings months, ${sg.length} goals`);
  } catch (e) {
    console.warn('⚠️ Server unavailable — start it with: python server.py', e.message);
    expenses       = [];
    incomeTransactions = [];
    investments    = [];
    savingsHistory = [];
    savingsGoals   = [];
    emergencyFund  = { target: 0, current: 0, contributions: [] };
    budgets = [];
    recurringBills = [];
    netWorthHistory = [];
    automaticNetWorthHistory = [];
    cashFlowSettings = [];
    accounts = [];
    transfers = [];
    recurringRules = [];
    recurringOccurrences = [];
    reconciliationAdjustments = [];
    emergencyAllocations = [];
    serverAvailable = false;
  }
}

/* ── Save helpers (fire-and-forget, log errors) ────────────── */
function saveExpenses(rows = expenses) {
  if (!serverAvailable) throw new Error('FinTrack server is offline. Start it and refresh before changing expenses.');
  return apiPost('/expenses', rows);
}
function saveIncomeTransactions() { if (serverAvailable) return apiPost('/income-transactions', incomeTransactions); }
function saveInvestments(rows = investments) {
  if (!serverAvailable) throw new Error('FinTrack server is offline. Start it and refresh before changing investments.');
  return apiPost('/investments', rows);
}
function saveSavingsHistory() { if (serverAvailable) apiPost('/savings-history', savingsHistory).catch(e => console.error('Save savings history failed:', e)); }
function saveSavingsGoals()   { if (serverAvailable) apiPost('/savings-goals', savingsGoals).catch(e => console.error('Save goals failed:', e)); }
function saveEmergencyFund() {
  if (!serverAvailable) throw new Error('FinTrack server is offline. Start it and refresh before changing the emergency target.');
  return apiPost('/emergency-fund', { target: emergencyFund.target, contributions: emergencyFund.contributions });
}
function saveBudgets()        { if (serverAvailable) return apiPost('/budgets', budgets); }
function saveRecurringBills() { if (serverAvailable) return apiPost('/recurring-bills', recurringBills); }
function saveNetWorth()       { if (serverAvailable) return apiPost('/net-worth', netWorthHistory); }
function saveAutomaticNetWorth() { if (serverAvailable) return apiPost('/net-worth-auto', automaticNetWorthHistory); }
function saveCashFlow()       { if (serverAvailable) return apiPost('/cash-flow', cashFlowSettings); }
function saveAccounts(rows = accounts) {
  if (!serverAvailable) {
    throw new Error('FinTrack server is offline. Start the server and refresh before adding accounts.');
  }
  return apiPost('/accounts', rows);
}
function saveTransfers()      { if (serverAvailable) return apiPost('/transfers', transfers); }
function saveRecurringRules() { if (serverAvailable) return apiPost('/recurring-rules', recurringRules); }
function saveReconciliationAdjustments() { if (serverAvailable) return apiPost('/reconciliation-adjustments', reconciliationAdjustments); }
function saveEmergencyAllocations(rows = emergencyAllocations) {
  if (!serverAvailable) throw new Error('FinTrack server is offline. Start it and refresh before changing emergency allocations.');
  return apiPost('/emergency-allocations', rows);
}

/* ── Sync form expenses (Google Form → main Expenses sheet) ── */
async function syncFormExpenses() {
  try {
    const res = await apiPost('/sync-form-expenses', {});
    if (res.synced > 0) {
      console.log(`📋 Synced ${res.synced} expense(s) from Google Form`);
      // Re-fetch expenses and re-render affected sections
      expenses = await apiGet('/expenses');
      renderExpensesTable();
      renderRecentTransactions();
      renderDashboardCards();
      renderSavingsCards();
      renderSavingsTable();
      renderPlanning();
      initCharts();
      if (typeof updateMonthDisplay === 'function') updateMonthDisplay();
      // Show toast notification
      showSyncToast(res.synced);
    }
    if (res.errors && res.errors.length > 0) {
      console.warn('Form sync warnings:', res.errors);
    }
  } catch (e) {
    // Silently ignore — server might not have FormExpenses sheet yet
    console.debug('Form sync skipped:', e.message);
  }
}

function showSyncToast(count) {
  let toast = document.getElementById('syncToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'syncToast';
    toast.style.cssText = 'position:fixed;bottom:24px;right:24px;background:#0f172a;color:#fff;padding:12px 20px;border-radius:10px;font-size:0.9rem;z-index:9999;opacity:0;transition:opacity 0.3s;box-shadow:0 4px 12px rgba(0,0,0,0.3);';
    document.body.appendChild(toast);
  }
  toast.textContent = `📋 Synced ${count} expense${count > 1 ? 's' : ''} from Google Form`;
  toast.style.opacity = '1';
  setTimeout(() => { toast.style.opacity = '0'; }, 4000);
}


/* ============================================================
   CATEGORY CONFIGURATION
   ============================================================ */
const categoryConfig = {
  food:          { label: 'Food & Takeaway', icon: '🍔', cls: 'cat-food'          },
  grocery:       { label: 'Grocery',       icon: '🛒', cls: 'cat-grocery'       },
  vegetables_fruits: { label: 'Vegetables & Fruits', icon: '🥦', cls: 'cat-vegetables-fruits' },
  travel:        { label: 'Travel',        icon: '✈️',  cls: 'cat-travel'        },
  commute:       { label: 'Commute',       icon: '🚌', cls: 'cat-commute'       },
  housing:       { label: 'Housing',       icon: '🏠', cls: 'cat-housing'       },
  parents_fund:  { label: 'Parents Fund',  icon: '👪', cls: 'cat-parents-fund'  },
  health:        { label: 'Health',        icon: '⚕️',  cls: 'cat-health'        },
  personal_care: { label: 'Personal Care', icon: '💇', cls: 'cat-personal-care' },
  subscriptions: { label: 'Subscriptions & Software', icon: '💻', cls: 'cat-subscriptions' },
  entertainment: { label: 'Entertainment', icon: '🎬', cls: 'cat-entertainment' },
  utilities:     { label: 'Utilities',     icon: '⚡', cls: 'cat-utilities'     },
  shopping:      { label: 'Shopping',      icon: '🛍️', cls: 'cat-shopping'      },
  other:         { label: 'Other',         icon: '📦', cls: 'cat-other'         },
};

const fixedExpenseCategories = new Set(['housing', 'subscriptions']);
const fixedExpensePatterns = [
  /\brent\b/i, /\blease\b/i, /\bemi\b/i, /\bmortgage\b/i,
  /\bsubscription\b/i, /\bmembership\b/i, /\binsurance\b/i,
  /\bschool fees?\b/i, /\btuition fees?\b/i, /\bannual charges?\b/i,
  /\bbroadband\b/i, /\binternet\b/i, /\bwifi\b/i,
];

function inferExpenseNature(category, description = '') {
  if (fixedExpenseCategories.has(String(category || '').toLowerCase())) return 'fixed';
  return fixedExpensePatterns.some(pattern => pattern.test(String(description || '')))
    ? 'fixed'
    : 'variable';
}

function getExpenseNature(expense) {
  const saved = String(expense?.expenseNature || '').toLowerCase();
  return ['fixed', 'variable'].includes(saved)
    ? saved
    : inferExpenseNature(expense?.category, expense?.description);
}

const expenseNatureLabels = { fixed: 'Fixed', variable: 'Variable', all: 'All' };

const typeLabels = {
  stocks: 'Stocks', mutual_funds: 'Mutual Funds', gold: 'Gold',
  foreign_stocks: 'Foreign Stocks', ppf: 'PPF', nps: 'NPS',
  fixed_deposit: 'Fixed Deposit',
};

const investCategoryConfig = {
  mutual_funds:   { label: 'Mutual Funds',   icon: '📊', cls: 'inv-cat-mf',    tradable: true  },
  stocks:         { label: 'Stocks',          icon: '📈', cls: 'inv-cat-stock',  tradable: true  },
  gold:           { label: 'Gold',            icon: '🥇', cls: 'inv-cat-gold',   tradable: false },
  foreign_stocks: { label: 'Foreign Stocks',  icon: '🌍', cls: 'inv-cat-fs',     tradable: true  },
  ppf:            { label: 'PPF',             icon: '🏛️',  cls: 'inv-cat-ppf',    tradable: false },
  nps:            { label: 'NPS',             icon: '👴', cls: 'inv-cat-nps',    tradable: false },
  fixed_deposit:  { label: 'Fixed Deposit',   icon: '🏦', cls: 'inv-cat-fd',     tradable: false },
};

const payLabels = {
  card: 'Credit Card', debit: 'Debit Card',
  cash: 'Cash', transfer: 'Bank Transfer',
};


/* ============================================================
   UTILITY HELPERS
   ============================================================ */
const fmt = (n) =>
  '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtNav = (n) =>
  '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 4, maximumFractionDigits: 4 });

const fmtInvestmentUnitPrice = (inv, value) =>
  ['mutual_funds', 'nps'].includes(inv?.category) ? fmtNav(value) : fmt(value);

function compactMutualFundName(inv) {
  const fullName = String(inv?.name || inv?.asset || 'Mutual fund').trim();
  return fullName
    .replace(/\s*-\s*(?:direct\s+(?:plan|option)|growth\s+option|growth)\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim() || fullName;
}

const fmtDate = (d) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const todayISO = () => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
};

function defaultBlankDateInputs(root = document) {
  const inputs = [];
  if (root?.matches?.('input[type="date"]')) inputs.push(root);
  root?.querySelectorAll?.('input[type="date"]').forEach(input => inputs.push(input));
  const today = todayISO();
  inputs.forEach(input => {
    if (!input.value) input.value = today;
  });
}

function setAccountSaveStatus(message, state = '') {
  const node = document.getElementById('accountSaveStatus');
  if (!node) return;
  node.textContent = message;
  node.className = `account-save-status ${state}`.trim();
}

let mfCatalogStatus = { count: 0, lastRefreshed: null };
let mfSearchTimer = null;
let mfSearchResults = [];

function setMfSearchStatus(message, state = '') {
  const node = document.getElementById('invMfSearchStatus');
  if (!node) return;
  node.textContent = message;
  node.className = `mf-search-status ${state}`.trim();
}

function mfCatalogStatusText() {
  if (!mfCatalogStatus.count) return 'No local catalogue yet. Refresh when online, or enter the fund details manually.';
  const updated = mfCatalogStatus.lastRefreshed
    ? new Date(mfCatalogStatus.lastRefreshed).toLocaleString()
    : 'date unavailable';
  return `${Number(mfCatalogStatus.count).toLocaleString('en-IN')} schemes available offline · updated ${updated}`;
}

async function loadMfCatalogStatus(autoRefreshEmpty = false) {
  if (!serverAvailable) return;
  try {
    mfCatalogStatus = await apiGet('/mutual-funds/catalog/status');
    setMfSearchStatus(mfCatalogStatusText(), mfCatalogStatus.count ? 'success' : 'warning');
    if (autoRefreshEmpty && !mfCatalogStatus.count) {
      setMfSearchStatus('Downloading the mutual-fund catalogue in the background…');
      apiPost('/mutual-funds/catalog/refresh', {}).then(result => {
        mfCatalogStatus = result;
        setMfSearchStatus(mfCatalogStatusText(), 'success');
      }).catch(() => setMfSearchStatus(
        'Offline — catalogue download postponed. Manual fund entry is still available.', 'warning'
      ));
    }
  } catch (_error) {
    setMfSearchStatus('Catalogue status unavailable. Manual fund entry is still available.', 'warning');
  }
}

function renderMfSearchResults(items) {
  mfSearchResults = items || [];
  const container = document.getElementById('invMfSearchResults');
  if (!container) return;
  container.innerHTML = mfSearchResults.map((item, index) => `
    <button type="button" class="mf-scheme-result" role="option" data-mf-result="${index}">
      <strong>${escHtml(item.schemeName)}</strong>
      <span>${escHtml(item.fundHouse || item.schemeCategory || 'Mutual fund')} · Scheme ${escHtml(String(item.schemeCode))}</span>
    </button>`).join('');
}

async function selectMutualFundScheme(item) {
  if (!item) return;
  document.getElementById('invSchemeCode').value = String(item.schemeCode);
  document.getElementById('invMfSearch').value = item.schemeName;
  document.getElementById('invAsset').value = `MF-${item.schemeCode}`;
  document.getElementById('invName').value = item.schemeName;
  renderMfSearchResults([]);
  setMfSearchStatus(`Selected ${item.schemeName}. Checking the latest NAV…`, 'success');
  try {
    const nav = await apiGet(`/price/mf/${encodeURIComponent(item.schemeCode)}`);
    if (Number(nav.nav) > 0) document.getElementById('invCurrPrice').value = Number(nav.nav);
    const source = nav.offline || nav.cached ? 'saved NAV' : 'latest NAV';
    setMfSearchStatus(
      `Selected · ${source} ${fmtNav(nav.nav)}${nav.date ? ` as of ${nav.date}` : ''}`,
      nav.offline ? 'warning' : 'success'
    );
  } catch (_error) {
    setMfSearchStatus('Scheme selected. NAV is unavailable offline; enter the current NAV manually.', 'warning');
  }
}

async function searchMutualFundSchemes(query) {
  const value = String(query || '').trim();
  if (value.length < 2) {
    renderMfSearchResults([]);
    setMfSearchStatus(mfCatalogStatusText(), mfCatalogStatus.count ? 'success' : 'warning');
    return;
  }
  setMfSearchStatus('Searching the local catalogue…');
  try {
    const result = await apiGet(`/mutual-funds/search?q=${encodeURIComponent(value)}&limit=25`);
    mfCatalogStatus = { count: result.count, lastRefreshed: result.lastRefreshed };
    renderMfSearchResults(result.items || []);
    if (result.items?.length) {
      setMfSearchStatus(`${result.items.length} matching schemes · ${mfCatalogStatusText()}`, 'success');
    } else {
      setMfSearchStatus(
        mfCatalogStatus.count
          ? 'No cached match. Refresh the catalogue when online or enter fund details manually.'
          : 'No local catalogue is available. Refresh when online or enter fund details manually.',
        'warning'
      );
    }
  } catch (_error) {
    renderMfSearchResults([]);
    setMfSearchStatus('Offline search unavailable. Enter fund details and NAV manually.', 'warning');
  }
}


/* ============================================================
   LIVE PRICE PROVIDERS  (plug-and-play — swap any provider)
   ============================================================
   Each provider is an async function:
     (investment) => number | null
   Return the latest price per unit, or null if unavailable.
   To switch APIs, just replace the function body.
   ------------------------------------------------------------ */

/* Debug log — collects per-fetch attempt details for the debug panel */
let priceDebugLog = [];
function logDebug(ticker, source, status, detail) {
  const ts = new Date().toLocaleTimeString();
  priceDebugLog.push({ ts, ticker, source, status, detail });
}

const priceProviders = {

  /* ── Mutual Funds ─────────────────────────────────────────── */
  async mutual_funds(inv) {
    if (!inv.schemeCode) return null;
    const label = inv.name || inv.schemeCode;

    /* Strategy 1: Local server proxy (no CORS issues) */
    if (serverAvailable) {
      try {
        logDebug(label, 'Server proxy', 'pending', `/api/price/mf/${inv.schemeCode}`);
        const res = await fetch(`${API_BASE}/price/mf/${inv.schemeCode}`);
        if (res.ok) {
          const data = await res.json();
          if (data.nav) { logDebug(label, 'Server proxy', 'success', `NAV ₹${data.nav}`); return data.nav; }
        }
        logDebug(label, 'Server proxy', 'error', `HTTP ${res.status}`);
      } catch (e) { logDebug(label, 'Server proxy', 'error', e.message); }
    }

    return null;
  },

  /* ── Stocks — local server proxy ── */
  async stocks(inv) {
    if (!inv.ticker) return null;
    const label = inv.ticker;

    /* Strategy 1: Local server proxy (Python fetches Yahoo directly — best!) */
    if (serverAvailable) {
      try {
        const proxyUrl = `${API_BASE}/price/stock/${encodeURIComponent(inv.ticker)}`;
        logDebug(label, 'Server proxy', 'pending', proxyUrl);
        const res = await fetch(proxyUrl);
        if (res.ok) {
          const data = await res.json();
          if (data.price) { logDebug(label, 'Server proxy', 'success', `₹${data.price}`); return data.price; }
          logDebug(label, 'Server proxy', 'error', data.error || 'No price in response');
        } else {
          const err = await res.json().catch(() => ({}));
          logDebug(label, 'Server proxy', 'error', err.error || `HTTP ${res.status}`);
        }
      } catch (e) { logDebug(label, 'Server proxy', 'error', e.message); }
    }

    return null;
  },

  /* ── Foreign Stocks — same Yahoo Finance path ─────────────── */
  async foreign_stocks(inv) {
    return priceProviders.stocks(inv);        // reuse stocks provider
  },

  /* ── Gold — no reliable free CORS API (manual entry) ──────── */
  async gold(_inv) { return null; },

  /* ── PPF / NPS / FD — no live API (manual entry) ──────────── */
  async ppf()           { return null; },
  async nps()           { return null; },
  async fixed_deposit() { return null; },
};

/**
 * Refresh live prices for all investments that have a provider.
 * Returns { updated: number, failed: number, total: number }
 */
async function refreshAllPrices() {
  let updated = 0, failed = 0, skipped = 0;
  const tasks = investments.map(async inv => {
    const provider = priceProviders[inv.category];
    if (!provider) return;
    /* Skip items without a lookup key */
    if (inv.category === 'mutual_funds' && !inv.schemeCode) { skipped++; return; }
    if (['stocks', 'foreign_stocks'].includes(inv.category) && !inv.ticker) { skipped++; return; }
    if (['ppf', 'nps', 'fixed_deposit', 'gold'].includes(inv.category)) { skipped++; return; }
    const price = await provider(inv);
    if (price !== null && price > 0) {
      inv.currentPrice = price;
      updated++;
    } else {
      failed++;
    }
  });
  await Promise.all(tasks);
  /* Persist updated prices to Excel */
  if (updated > 0) saveInvestments().catch(error => console.error('Save investments failed:', error));
  return { updated, failed, skipped, total: investments.length };
}

/**
 * Refresh + re-render all investment views.
 * Shows a small status toast when done.
 */
async function refreshAndRender() {
  const btn = document.getElementById('btnRefreshPrices');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Fetching…'; }

  const result = await refreshAllPrices();

  if (btn) { btn.disabled = false; btn.textContent = '🔄 Refresh Prices'; }

  renderInvestmentsTable();
  renderInvestmentSnapshot();

  showPriceToast(`✅ ${result.updated} updated` +
    (result.failed ? ` · ❌ ${result.failed} failed` : '') +
    (result.skipped ? ` · ⏭️ ${result.skipped} manual` : ''));

  /* Update debug panel if it exists (stocks section) */
  renderDebugLog();
}

/* Lightweight toast notification */
function showPriceToast(msg) {
  let toast = document.getElementById('priceToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'priceToast';
    toast.className = 'price-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

/* Render debug log entries into the stocks section debug panel */
function renderDebugLog() {
  const body = document.getElementById('debugLogBody');
  if (!body) return;
  if (priceDebugLog.length === 0) {
    body.innerHTML = '<em>No fetch attempts yet. Click Refresh Prices.</em>';
    return;
  }
  const statusIcon = { success: '✅', error: '❌', pending: '⏳' };
  const rows = priceDebugLog.map(e =>
    `<div class="debug-row debug-${e.status}">` +
      `<span class="debug-ts">${e.ts}</span>` +
      `<span class="debug-ticker">${e.ticker}</span>` +
      `<span class="debug-source">${e.source}</span>` +
      `<span class="debug-icon">${statusIcon[e.status] || '❓'}</span>` +
      `<span class="debug-detail">${e.detail}</span>` +
    `</div>`
  ).join('');
  body.innerHTML = rows;
  body.scrollTop = body.scrollHeight;
}


/* ============================================================
   NAVIGATION
   ============================================================ */
const sectionMeta = {
  dashboard:   ['Dashboard',   'Overview of your finances'],
  expenses:    ['Expenses',    'Track and manage your spending'],
  investments: ['Investments', 'Monitor your investment portfolio'],
  savings:     ['Income & Flow', 'Monthly income, spending, investing and retained cash'],
  planning:    ['Accounts', 'Balances and every movement between your financial accounts'],
  stocks:      ['Stocks & Mutual Funds', 'Detailed portfolio analytics'],
  otherinv:    ['Other Investments', 'Gold, PPF, NPS & Fixed Deposits'],
  documents:   ['Documents',   'Salary slips, tax, insurance & more'],
};

function navigateTo(section) {
  document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  document.getElementById('section-' + section)?.classList.add('active');
  document.querySelector(`.nav-item[data-section="${section}"]`)?.classList.add('active');

  const [title, subtitle] = sectionMeta[section] || ['', ''];
  const titleEl = document.getElementById('pageTitle');
  const subtitleEl = document.getElementById('pageSubtitle');

  /* For sub-pages (stocks, otherinv), show ← back arrow inline with title */
  const isSubPage = (section === 'stocks' || section === 'otherinv');
  if (isSubPage && titleEl) {
    titleEl.innerHTML = `<span class="back-arrow" id="headerBackBtn">←</span> ${title}`;
    document.getElementById('headerBackBtn')?.addEventListener('click', () => navigateTo('investments'));
  } else if (titleEl) {
    titleEl.textContent = title;
  }
  if (subtitleEl) subtitleEl.textContent = subtitle;

  /* Swap header-right contents based on section */
  const isInvPage = (section === 'investments' || isSubPage);
  const isDocPage = (section === 'documents');
  const isPlanningPage = (section === 'planning');
  const isFlowPage = (section === 'savings');
  const monthSel   = document.getElementById('headerMonthSelector');
  const addBtn     = document.getElementById('addEntryBtn');
  const refreshBtn = document.getElementById('headerRefreshBtn');
  const refreshSt  = document.getElementById('headerRefreshStatus');
  if (monthSel)   monthSel.style.display   = (isInvPage || isDocPage) ? 'none' : '';
  if (addBtn)     addBtn.style.display     = (isInvPage || isDocPage || isPlanningPage || isFlowPage) ? 'none' : '';
  if (refreshBtn) refreshBtn.style.display = isInvPage ? '' : 'none';
  if (refreshSt)  refreshSt.style.display  = isInvPage ? '' : 'none';

  if (isDocPage) renderDocuments();
}

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', e => { e.preventDefault(); navigateTo(item.dataset.section); });
});

document.querySelectorAll('.view-all').forEach(link => {
  link.addEventListener('click', e => { e.preventDefault(); navigateTo(link.dataset.section); });
});

document.getElementById('dashboardActionItems')?.addEventListener('click', () => {
  navigateTo('planning');
  document.getElementById('recurringAutomationCard')?.scrollIntoView({ behavior: 'smooth' });
});


/* ============================================================
   CONTEXT-AWARE "ADD ENTRY" BUTTON
   ============================================================ */
document.getElementById('addEntryBtn')?.addEventListener('click', () => {
  const section = document.querySelector('.content-section.active')?.id?.replace('section-', '');
  if (section === 'stocks')         openInvestmentModal('market');
  else if (section === 'otherinv')   openInvestmentModal('other');
  else if (section === 'investments') openInvestmentModal('all');
  else if (section === 'savings')    openModal('goalModal');
  else openModal('expenseModal'); // dashboard or expenses
});


/* ============================================================
   MODAL HELPERS
   ============================================================ */
function openModal(id) {
  const modal = document.getElementById(id);
  defaultBlankDateInputs(modal);
  modal?.classList.add('open');
  if (id === 'expenseModal' && !_editingExpenseId) {
    setExpenseFormStatus();
    const select = document.getElementById('expAccount');
    if (select && !select.value) select.value = String(defaultAccountId('spending') || '');
  }
}

function setExpenseFormStatus(message = '') {
  const status = document.getElementById('expenseFormStatus');
  if (!status) return;
  status.textContent = message;
  status.classList.toggle('success', Boolean(message));
}

/**
 * Open the investment modal, optionally filtering the type dropdown.
 * filter: 'market' | 'other' | 'all' (default)
 */
function openInvestmentModal(filter) {
  const sel = document.getElementById('invType');
  if (sel) {
    sel.querySelectorAll('option').forEach(opt => {
      if (!opt.value) return;                                  // keep placeholder
      if (filter === 'market')      opt.hidden = !marketCategories.includes(opt.value);
      else if (filter === 'other')  opt.hidden = !otherCategories.includes(opt.value);
      else                          opt.hidden = false;
    });
  }
  const accountSelect = document.getElementById('invAccount');
  if (accountSelect && !accountSelect.value) {
    accountSelect.value = String(defaultAccountId('investment') || '');
  }
  openModal('investmentModal');
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
  document.getElementById(id)?.querySelector('form')?.reset();
  /* Reset expense modal edit state */
  if (id === 'expenseModal') {
    _editingExpenseId = null;
    setExpenseFormStatus();
    const modal = document.getElementById('expenseModal');
    modal.querySelector('.modal-header h2').textContent = 'Add Expense';
    modal.querySelector('button[type="submit"]').textContent = 'Add Expense';
  }
  /* Reset investment modal dynamic state */
  if (id === 'investmentModal') {
    const dyn = document.getElementById('invDynamicFields');
    if (dyn) dyn.style.display = 'none';
    renderMfSearchResults([]);
    setMfSearchStatus(mfCatalogStatusText(), mfCatalogStatus.count ? 'success' : 'warning');
    /* Unhide all type options */
    document.getElementById('invType')?.querySelectorAll('option').forEach(o => o.hidden = false);
  }
}

document.querySelectorAll('.modal-close, .btn-secondary[data-modal]').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.modal));
});

document.addEventListener('reset', event => {
  // Native reset values are applied after the reset event has fired.
  setTimeout(() => defaultBlankDateInputs(event.target), 0);
});

document.addEventListener('focusin', event => {
  if (event.target?.matches?.('input[type="date"]') && !event.target.value) {
    event.target.value = todayISO();
  }
});

/* ============================================================
   RENDER: RECENT TRANSACTIONS (Dashboard widget)
   ============================================================ */
function renderRecentTransactions() {
  const el = document.getElementById('recentTransactions');
  if (!el) return;
  const range = dashboardPeriodRange();
  const activity = [
    ...expenses.filter(row => dateInRange(row.date, range)).map(row => ({ ...row, activityType: 'expense' })),
    ...incomeTransactions.filter(row => dateInRange(row.date, range)).map(row => ({ ...row, activityType: 'income' })),
  ].sort((a, b) => String(b.date).localeCompare(String(a.date)) || Number(b.id || 0) - Number(a.id || 0)).slice(0, 7);
  if (!activity.length) {
    el.innerHTML = '<p class="inv-panel-empty">No income or expenses in this period.</p>';
    return;
  }
  el.innerHTML = activity.map(t => {
    const isIncome = t.activityType === 'income';
    const cat = isIncome ? { cls: 'cat-income', icon: '₹', label: incomeSourceLabel(t.source) }
      : (categoryConfig[t.category] || categoryConfig.other);
    return `
      <div class="transaction-item">
        <div class="txn-icon ${cat.cls}">${cat.icon}</div>
        <div class="txn-info">
          <div class="txn-desc">${escHtml(t.description || cat.label)}</div>
          <div class="txn-date">${fmtDate(t.date)} &bull; ${cat.label}${isIncome ? ` &bull; ${escHtml(accountName(t.accountId))}` : ''}</div>
        </div>
        <div class="txn-amount ${isIncome ? 'positive' : 'negative'}">${isIncome ? '+' : '-'}${fmt(t.amount)}</div>
      </div>`;
  }).join('');
}


/* ============================================================
   RENDER: INVESTMENT SNAPSHOT (Dashboard widget)
   ============================================================ */
function renderInvestmentSnapshot() {
  const el = document.getElementById('investmentSnapshot');
  if (!el) return;

  el.innerHTML = investments.slice(0, 5).map(inv => {
    const metrics = investmentMetrics(inv);
    const value = metrics.currentValue;
    const gainPct = (metrics.costBasis > 0
      ? (metrics.currentValue - metrics.costBasis) / metrics.costBasis * 100
      : 0).toFixed(1);
    const isPos   = parseFloat(gainPct) >= 0;
    return `
      <div class="inv-item">
        <div class="inv-ticker">${escHtml(inv.asset)}</div>
        <div class="inv-info">
          <div class="inv-name">${escHtml(inv.name)}</div>
          <div class="inv-type">${(typeLabels[inv.category] || inv.category).toUpperCase()}</div>
        </div>
        <div class="inv-perf">
          <div class="inv-value">${fmt(value)}</div>
          <div class="inv-return ${isPos ? 'positive' : 'negative'}">${isPos ? '+' : ''}${gainPct}%</div>
        </div>
      </div>`;
  }).join('');
}


/* ============================================================
   EXPENSES FILTERS STATE
   ============================================================ */
let expFilterCat    = 'all';
let expFilterYear   = String(new Date().getFullYear());
let expFilterMonth  = String(new Date().getMonth() + 1).padStart(2, '0');
let expFilterNature = 'all';
let expGroupByMonth = true;

function savedExpenseChartNature() {
  try {
    const saved = localStorage.getItem('fintrackExpenseChartNature');
    return ['fixed', 'variable', 'all'].includes(saved) ? saved : 'variable';
  } catch (_error) {
    return 'variable';
  }
}

let expenseChartNature = savedExpenseChartNature();

function syncExpenseNatureControls() {
  document.querySelectorAll('[data-expense-chart-nature]').forEach(select => {
    select.value = expenseChartNature;
  });
  const tableNature = document.getElementById('filterExpenseNature');
  if (tableNature) tableNature.value = expFilterNature;
}

function getFilteredExpenses(ignoreNature = false) {
  return expenses.filter(e => {
    const [y, m] = e.date.split('-');
    if (expFilterCat  !== 'all' && e.category !== expFilterCat)  return false;
    if (expFilterYear !== 'all' && y           !== expFilterYear) return false;
    if (expFilterMonth!== 'all' && m           !== expFilterMonth)return false;
    if (!ignoreNature && expFilterNature !== 'all' && getExpenseNature(e) !== expFilterNature) return false;
    return true;
  }).sort((a, b) => a.date.localeCompare(b.date));
}

function buildExpenseRow(exp) {
  const cat = categoryConfig[exp.category] || categoryConfig.other;
  const nature = getExpenseNature(exp);
  return `
    <tr>
      <td>${fmtDate(exp.date)}</td>
      <td>${escHtml(exp.description)}</td>
      <td><span class="cat-badge ${cat.cls}">${cat.icon} ${cat.label}</span></td>
      <td><span class="expense-nature-badge expense-nature-${nature}">${expenseNatureLabels[nature]}</span></td>
      <td>${payLabels[exp.payment] || exp.payment}</td>
      <td style="font-weight:600; color:var(--danger);">-${fmt(exp.amount)}</td>
      <td>
        <button class="action-btn edit"   title="Edit"   data-id="${exp.id}">✏️</button>
        <button class="action-btn delete" title="Delete" data-id="${exp.id}">🗑️</button>
      </td>
    </tr>`;
}

/* ============================================================
   RENDER: EXPENSES TABLE
   ============================================================ */
function renderExpensesTable() {
  const tbody = document.getElementById('expensesTableBody');
  if (!tbody) return;

  const filtered = getFilteredExpenses();

  if (expGroupByMonth && expFilterYear === 'all' && expFilterMonth === 'all') {
    // --- Grouped by month view ---
    const groups = {};
    filtered.forEach(e => {
      const key = e.date.slice(0, 7); // YYYY-MM
      if (!groups[key]) groups[key] = [];
      groups[key].push(e);
    });

    const sortedKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a)); // newest first

    tbody.innerHTML = sortedKeys.map(key => {
      const [yr, mo] = key.split('-');
      const monthName = new Date(yr, parseInt(mo) - 1, 1)
        .toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
      const groupTotal = groups[key].reduce((s, e) => s + e.amount, 0);
      const rows = groups[key].map(buildExpenseRow).join('');
      return `
        <tr class="month-group-header">
          <td colspan="7">📅 ${monthName} &nbsp;—&nbsp; ${groups[key].length} transaction${groups[key].length > 1 ? 's' : ''}</td>
        </tr>
        ${rows}
        <tr class="month-subtotal">
          <td colspan="5" style="text-align:right;">Month Total</td>
          <td style="color:var(--danger);">-${fmt(groupTotal)}</td>
          <td></td>
        </tr>`;
    }).join('');

  } else {
    // --- Flat list view (or filtered to specific month/year) ---
    tbody.innerHTML = filtered.length
      ? filtered.map(buildExpenseRow).join('')
      : `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted);">No expenses found for selected filters.</td></tr>`;
  }

  updateExpenseSummaryStrip(getFilteredExpenses(true));
  renderExpenseCategoryBreakdown();
  populateYearDropdown();
}

/* Populate year dropdown from current expenses data */
function populateYearDropdown() {
  const sel = document.getElementById('filterYear');
  if (!sel) return;
  const years = [...new Set(expenses.map(e => e.date.slice(0, 4)))].sort((a,b) => b-a);
  sel.innerHTML = `<option value="all" ${expFilterYear === 'all' ? 'selected' : ''}>All Years</option>` +
    years.map(y => `<option value="${y}" ${y === expFilterYear ? 'selected' : ''}>${y}</option>`).join('');
  /* Also sync month dropdown */
  const moSel = document.getElementById('filterMonth');
  if (moSel) moSel.value = expFilterMonth;
}

function updateExpenseSummaryStrip(filtered) {
  const total    = filtered.reduce((s, e) => s + e.amount, 0);
  const fixed    = filtered.filter(e => getExpenseNature(e) === 'fixed').reduce((s, e) => s + e.amount, 0);
  const variableRows = filtered.filter(e => getExpenseNature(e) === 'variable');
  const variable = variableRows.reduce((s, e) => s + e.amount, 0);
  const count    = filtered.length;
  const today = new Date();
  let periodDays = 0;
  if (expFilterMonth !== 'all' && expFilterYear !== 'all') {
    const month = Number(expFilterMonth);
    const year = Number(expFilterYear);
    const isCurrent = month === today.getMonth() + 1 && year === today.getFullYear();
    periodDays = isCurrent ? today.getDate() : new Date(year, month, 0).getDate();
  } else if (variableRows.length) {
    const dates = variableRows.map(row => new Date(row.date)).filter(d => !Number.isNaN(d.valueOf()));
    periodDays = dates.length
      ? Math.max(1, Math.ceil((Math.max(...dates) - Math.min(...dates)) / 86400000) + 1)
      : 0;
  }
  const avgDay = periodDays ? variable / periodDays : 0;
  const largest = variableRows.reduce(
    (max, e) => e.amount > max.amount ? e : max,
    { amount: 0, category: '' },
  );
  const largestCat = largest.amount ? (categoryConfig[largest.category]?.label || 'Other') : '-';

  document.getElementById('stripTotal')  .textContent = fmt(total);
  document.getElementById('stripFixed')  .textContent = fmt(fixed);
  document.getElementById('stripVariable').textContent = fmt(variable);
  document.getElementById('stripCount')  .textContent = count;
  document.getElementById('stripAvg')    .textContent = fmt(avgDay);
  document.getElementById('stripLargest').textContent = largest.amount
    ? `${fmt(largest.amount)} (${largestCat})`
    : '-';

  /* Variable-spending run rate; fixed commitments must not inflate the pace. */
  const isCurrentMonth = expFilterMonth === String(today.getMonth() + 1).padStart(2, '0')
                      && expFilterYear === String(today.getFullYear());
  const forecastEl = document.getElementById('stripForecast');
  if (forecastEl) {
    if (isCurrentMonth && today.getDate() > 1) {
      const dayOfMonth = today.getDate();
      const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
      const projected = Math.round(variable / dayOfMonth * daysInMonth);
      forecastEl.textContent = `~${fmt(projected)}`;
    } else {
      forecastEl.textContent = '-';
    }
  }
}

// Track expense being edited (null = add mode)
let _editingExpenseId = null;

function openExpenseModalForEdit(id) {
  const exp = expenses.find(x => x.id === id);
  if (!exp) return;
  _editingExpenseId = id;
  const form = document.getElementById('expenseForm');
  form.date.value        = exp.date;
  form.amount.value      = exp.amount;
  form.description.value = exp.description;
  form.category.value    = exp.category;
  form.expenseNature.value = getExpenseNature(exp);
  form.payment.value     = exp.payment || 'upi';
  form.accountId.value   = exp.accountId || '';
  // Update modal title & button
  const modal = document.getElementById('expenseModal');
  setExpenseFormStatus();
  modal.querySelector('.modal-header h2').textContent = 'Edit Expense';
  modal.querySelector('button[type="submit"]').textContent = 'Save Changes';
  openModal('expenseModal');
}

// Event delegation — edit / delete expense rows
document.getElementById('expensesTableBody')?.addEventListener('click', e => {
  const editBtn = e.target.closest('.action-btn.edit');
  if (editBtn) {
    openExpenseModalForEdit(parseInt(editBtn.dataset.id));
    return;
  }
  const btn = e.target.closest('.action-btn.delete');
  if (!btn) return;
  const id = parseInt(btn.dataset.id);
  if (confirm('Delete this expense entry?')) {
    const idx = expenses.findIndex(x => x.id === id);
    if (idx !== -1) {
      expenses.splice(idx, 1);
      saveExpenses().catch(error => console.error('Save expenses failed:', error));
      refreshDashboard();
    }
  }
});

// Deleting every expense is deliberately harder than deleting one row. The
// local array is not changed until the server has saved and returned the empty
// Expenses worksheet.
document.getElementById('clearExpensesBtn')?.addEventListener('click', () => {
  if (!expenses.length) {
    alert('There are no expense entries to delete.');
    return;
  }
  const total = expenses.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  document.getElementById('clearExpensesCount').textContent =
    `${expenses.length} expense${expenses.length === 1 ? '' : 's'}`;
  document.getElementById('clearExpensesTotal').textContent = fmt(total);
  const confirmation = document.getElementById('clearExpensesConfirmation');
  const deleteButton = document.getElementById('confirmClearExpensesBtn');
  confirmation.value = '';
  deleteButton.disabled = true;
  deleteButton.textContent = 'Delete All Expenses';
  openModal('clearExpensesModal');
  setTimeout(() => confirmation.focus(), 0);
});

document.getElementById('clearExpensesConfirmation')?.addEventListener('input', event => {
  document.getElementById('confirmClearExpensesBtn').disabled =
    event.target.value.trim() !== 'DELETE';
});

document.getElementById('clearExpensesForm')?.addEventListener('submit', async event => {
  event.preventDefault();
  const confirmation = document.getElementById('clearExpensesConfirmation');
  const deleteButton = document.getElementById('confirmClearExpensesBtn');
  if (confirmation.value.trim() !== 'DELETE') return;
  deleteButton.disabled = true;
  deleteButton.textContent = 'Deleting...';
  try {
    await saveExpenses([]);
    expenses = await apiGet('/expenses');
    refreshDashboard();
    closeModal('clearExpensesModal');
  } catch (error) {
    alert(`Expenses were not deleted.\n\n${error.message}`);
  } finally {
    deleteButton.textContent = 'Delete All Expenses';
    deleteButton.disabled = confirmation.value.trim() !== 'DELETE';
  }
});

// Clear all investments
document.getElementById('clearInvestmentsBtn')?.addEventListener('click', () => {
  if (confirm('Clear ALL investment holdings? This cannot be undone.')) {
    investments.length = 0;
    saveInvestments().catch(error => console.error('Save investments failed:', error));
    renderInvestmentsTable();
    renderInvestmentSnapshot();
  }
});

document.getElementById('clearGoalsBtn')?.addEventListener('click', () => {
  if (confirm('Clear ALL savings goals? This cannot be undone.')) {
    savingsGoals.length = 0;
    saveSavingsGoals();
    renderGoals();
  }
});

// Category tab filter
document.querySelectorAll('.cat-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    expFilterCat = tab.dataset.category;
    renderExpensesTable();
  });
});

// Year / Month / GroupBy filter change — also sync month navigator
document.getElementById('filterYear')?.addEventListener('change', e => {
  expFilterYear = e.target.value;
  if (expFilterYear !== 'all') {
    currentYear = parseInt(expFilterYear);
    updateMonthDisplay();
  }
  refreshDashboard();
});

document.getElementById('filterMonth')?.addEventListener('change', e => {
  expFilterMonth = e.target.value;
  if (expFilterMonth !== 'all') {
    currentMonthIdx = parseInt(expFilterMonth) - 1;
    updateMonthDisplay();
  }
  refreshDashboard();
});

document.getElementById('filterExpenseNature')?.addEventListener('change', e => {
  expFilterNature = e.target.value;
  renderExpensesTable();
});

document.getElementById('filterGroupBy')?.addEventListener('change', e => {
  expGroupByMonth = e.target.value === 'month';
  renderExpensesTable();
});

document.querySelectorAll('[data-expense-chart-nature]').forEach(select => {
  select.addEventListener('change', event => {
    expenseChartNature = event.target.value;
    try {
      localStorage.setItem('fintrackExpenseChartNature', expenseChartNature);
    } catch (_error) { /* Browser storage is optional. */ }
    syncExpenseNatureControls();
    renderExpenseCategoryBreakdown();
    initCharts();
  });
});

document.getElementById('expCategory')?.addEventListener('change', event => {
  const nature = document.getElementById('expNature');
  if (nature) {
    nature.value = inferExpenseNature(event.target.value, document.getElementById('expDesc')?.value);
  }
});


/* ============================================================
   INVESTMENT TILE SELECTION (click to switch panel)
   ============================================================ */
document.querySelectorAll('.inv-tile-card').forEach(card => {
  card.addEventListener('click', () => {
    const panel = card.dataset.invPanel;
    if (panel === 'market') {
      renderStocksSection();
      navigateTo('stocks');
    } else if (panel === 'other') {
      renderOtherSection();
      navigateTo('otherinv');
    }
  });
});

/* Refresh live prices */
document.getElementById('btnRefreshPrices')?.addEventListener('click', () => refreshAndRender());

/* Header Refresh Prices button (visible on investment pages) */
document.getElementById('headerRefreshBtn')?.addEventListener('click', async () => {
  const btn = document.getElementById('headerRefreshBtn');
  const status = document.getElementById('headerRefreshStatus');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Fetching…'; }
  if (status) status.textContent = '';
  priceDebugLog = [];
  const result = await refreshAllPrices();
  if (btn) { btn.disabled = false; btn.textContent = '🔄 Refresh Prices'; }
  if (status) {
    status.textContent = `✅ ${result.updated} updated` +
      (result.failed ? ` · ❌ ${result.failed} failed` : '') +
      (result.skipped ? ` · ⏭️ ${result.skipped} manual` : '');
  }
  renderAfterInvestmentChange();
});

/* ---- Per-category label / placeholder config ---- */
const invFieldCfg = {
  stocks:        { asset:'Stock Ticker <small class="hint">(.NS auto-added)</small>',  assetPh:'Ticker symbol',  name:'Company Name', namePh:'Company name',  units:'Shares',        buy:'Buy Price (₹ / share)',   curr:'Current Price (₹ / share)' },
  foreign_stocks:{ asset:'Stock Ticker',  assetPh:'e.g. AAPL, MSFT',    name:'Company Name', namePh:'e.g. Apple Inc.',           units:'Shares',        buy:'Buy Price (₹ / share)',   curr:'Current Price (₹ / share)' },
  mutual_funds:  { asset:'Fund Code',     assetPh:'e.g. HDFC-TOP100',   name:'Fund Name',    namePh:'e.g. HDFC Top 100 Fund',   units:'Units',         buy:'Buy NAV (₹)',             curr:'Current NAV (₹)' },
  gold:          { asset:'Gold Type',     assetPh:'e.g. PHYSICAL, SGB', name:'Description',  namePh:'e.g. Physical Gold 24K',   units:'Quantity (g)',   buy:'Buy Price (₹ / g)',       curr:'Current Price (₹ / g)' },
  ppf:           { asset:'Account ID',    assetPh:'e.g. PPF-SBI',       name:'Account Name', namePh:'e.g. PPF – State Bank',    units:'Account',       buy:'Total Deposited (₹)',     curr:'Current Balance (₹)' },
  nps:           { asset:'Account ID',    assetPh:'e.g. NPS-TIER1',     name:'Account Name', namePh:'e.g. NPS Tier-1',          units:'Units',         buy:'Buy NAV (₹)',             curr:'Current NAV (₹)' },
  fixed_deposit: { asset:'FD Reference',  assetPh:'e.g. SBI-FD-2025',   name:'Description',  namePh:'e.g. SBI FD 3yr @7.1%',   units:'Deposits',      buy:'Principal (₹)',           curr:'Current Balance (₹)' },
};

const incomeSourceConfig = {
  salary: 'Salary', bonus: 'Bonus', freelance: 'Freelance', business: 'Business',
  interest: 'Interest', dividend: 'Dividend', rent: 'Rent received', gift: 'Gift',
  other: 'Other income',
};

function incomeSourceLabel(source) {
  return incomeSourceConfig[String(source || 'other').toLowerCase()] || 'Other income';
}

const investmentAccountTypeByCategory = {
  stocks: 'demat', foreign_stocks: 'demat', mutual_funds: 'mutual_fund',
  gold: 'gold', ppf: 'ppf', nps: 'nps', fixed_deposit: 'fixed_deposit',
};

function populateCompatibleInvestmentAccounts(category) {
  const select = document.getElementById('invContainerAccount');
  if (!select) return;
  const requiredType = investmentAccountTypeByCategory[category];
  const previous = select.value;
  const matching = activeAccounts().filter(account =>
    String(account.type || '').trim().toLowerCase() === requiredType
  );
  const typeName = accountTypeLabels[requiredType] || 'compatible investment';
  select.innerHTML = matching.length
    ? '<option value="">Select investment account</option>' + matching.map(account =>
      `<option value="${account.id}">${escHtml(account.name)}</option>`
    ).join('')
    : `<option value="" selected disabled>No ${escHtml(typeName)} account found — add one under Accounts</option>`;
  if (matching.some(account => String(account.id) === previous)) select.value = previous;
  else if (matching.length === 1) select.value = String(matching[0].id);
  select.setCustomValidity(matching.length ? '' : `Create a ${typeName} account under Accounts before adding this investment.`);
  const help = document.getElementById('invContainerHelp');
  if (help) help.textContent = matching.length
    ? `The holding's current value will be shown in this ${typeName} account.`
    : `No compatible account exists. Create a ${typeName} account in Accounts first.`;
}

function updateInvestmentEntryMode() {
  const form = document.getElementById('investmentForm');
  if (!form) return;
  const category = document.getElementById('invType')?.value || '';
  const prior = form.querySelector('input[name="entryMode"]:checked')?.value === 'prior';
  const balanceAccount = balanceCategories.includes(category);
  const fundingGroup = document.getElementById('invFundingAccountGroup');
  const fundingSelect = document.getElementById('invAccount');
  if (fundingGroup) fundingGroup.style.display = prior ? 'none' : '';
  if (fundingSelect) {
    fundingSelect.required = !prior;
    if (prior) fundingSelect.value = '';
    else if (!fundingSelect.value) fundingSelect.value = String(defaultAccountId('investment') || '');
  }
  const currentGroup = document.getElementById('invCurrPriceGroup');
  const currentInput = document.getElementById('invCurrPrice');
  if (currentGroup) currentGroup.style.display = balanceAccount && !prior ? 'none' : '';
  if (currentInput) currentInput.required = !(balanceAccount && !prior);
  const help = document.getElementById('invEntryModeHelp');
  if (help) help.textContent = prior
    ? 'This creates an opening position. It will not debit a salary, savings, or other funding account.'
    : 'This purchase or deposit will debit the selected funding account.';
  const dateLabel = document.getElementById('invDateLabel');
  if (dateLabel) dateLabel.textContent = prior ? 'Position As Of Date' : 'Purchase Date';
  const cfg = invFieldCfg[category] || {};
  const buyLabel = document.getElementById('invBuyPriceLabel');
  const currentLabel = document.getElementById('invCurrPriceLabel');
  if (buyLabel) buyLabel.innerHTML = balanceAccount
    ? (prior ? 'Principal / Cost Basis (₹)' : 'Deposit Amount (₹)')
    : (prior ? 'Average Cost (₹ per unit)' : (cfg.buy || 'Buy Price (₹)'));
  if (currentLabel) currentLabel.innerHTML = balanceAccount
    ? 'Current Balance (₹)'
    : (cfg.curr || 'Current Price (₹)');
}

/* Show/hide fields + update labels when investment type changes */
document.getElementById('invType')?.addEventListener('change', e => {
  const cat = e.target.value;
  const dynFields = document.getElementById('invDynamicFields');
  if (dynFields) dynFields.style.display = cat ? '' : 'none';
  if (!cat) return;

  populateCompatibleInvestmentAccounts(cat);

  /* Update labels & placeholders */
  const cfg = invFieldCfg[cat] || {};
  const setLabel = (id, txt) => { const el = document.getElementById(id); if (el) el.innerHTML = txt; };
  const setPh    = (id, txt) => { const el = document.getElementById(id); if (el) el.placeholder = txt; };
  setLabel('invAssetLabel',    cfg.asset || 'Asset Code');
  setPh   ('invAsset',         cfg.assetPh || '');
  setLabel('invNameLabel',     cfg.name  || 'Name');
  setPh   ('invName',          cfg.namePh  || '');
  setLabel('invUnitsLabel',    cfg.units || 'Units');
  setLabel('invBuyPriceLabel', cfg.buy   || 'Buy Price (₹)');
  setLabel('invCurrPriceLabel',cfg.curr  || 'Current Price (₹)');

  /* MF scheme-code field */
  const schemeGroup = document.getElementById('invSchemeGroup');
  if (schemeGroup) schemeGroup.style.display = cat === 'mutual_funds' ? '' : 'none';
  if (cat === 'mutual_funds') loadMfCatalogStatus(false);

  const isBalanceAccount = ['ppf', 'fixed_deposit'].includes(cat);
  const unitsGroup = document.getElementById('invUnitsGroup');
  const unitsInput = document.getElementById('invUnits');
  if (unitsGroup) unitsGroup.style.display = isBalanceAccount ? 'none' : '';
  if (unitsInput) {
    unitsInput.required = !isBalanceAccount;
    unitsInput.value = isBalanceAccount ? '1' : '';
  }
  updateInvestmentEntryMode();
});

document.querySelectorAll('input[name="entryMode"]').forEach(input => {
  input.addEventListener('change', updateInvestmentEntryMode);
});

document.getElementById('invMfSearch')?.addEventListener('input', event => {
  document.getElementById('invSchemeCode').value = '';
  clearTimeout(mfSearchTimer);
  mfSearchTimer = setTimeout(() => searchMutualFundSchemes(event.target.value), 300);
});

document.getElementById('invMfSearchResults')?.addEventListener('click', event => {
  const button = event.target.closest('[data-mf-result]');
  if (!button) return;
  selectMutualFundScheme(mfSearchResults[Number(button.dataset.mfResult)]);
});

document.getElementById('refreshMfCatalogBtn')?.addEventListener('click', async () => {
  const button = document.getElementById('refreshMfCatalogBtn');
  if (button) { button.disabled = true; button.textContent = 'Refreshing…'; }
  setMfSearchStatus('Downloading scheme metadata for offline search…');
  try {
    const result = await apiPost('/mutual-funds/catalog/refresh', {});
    mfCatalogStatus = result;
    setMfSearchStatus(mfCatalogStatusText(), 'success');
    const query = document.getElementById('invMfSearch')?.value;
    if (query?.trim()) await searchMutualFundSchemes(query);
  } catch (_error) {
    setMfSearchStatus('Refresh failed. The existing offline catalogue is still available.', 'warning');
  } finally {
    if (button) { button.disabled = false; button.textContent = 'Refresh catalogue'; }
  }
});

document.getElementById('invBuyPrice')?.addEventListener('input', event => {
  const category = document.getElementById('invType')?.value;
  const prior = document.querySelector('input[name="entryMode"]:checked')?.value === 'prior';
  if (balanceCategories.includes(category) && !prior) {
    document.getElementById('invCurrPrice').value = event.target.value;
  }
});

/* Re-render whichever investment detail view is currently active */
function refreshActiveInvestmentView() {
  const active = document.querySelector('.content-section.active')?.id;
  if (active === 'section-stocks')   renderStocksSection();
  if (active === 'section-otherinv') renderOtherSection();
}

/**
 * Run all renders after an investment mutation (add / delete / trade)
 * while preserving the currently active section.
 */
function renderAfterInvestmentChange() {
  const activeSection = document.querySelector('.content-section.active')?.id?.replace('section-', '') || 'dashboard';
  renderInvestmentsTable();
  renderInvestmentSnapshot();
  refreshActiveInvestmentView();
  renderPlanning();
  renderDashboardCards();
  initCharts();
  navigateTo(activeSection);
}

/* ============================================================
   RENDER: INVESTMENTS — Two-Tile Layout
   ============================================================ */
const marketCategories = ['stocks', 'foreign_stocks', 'mutual_funds'];
const otherCategories  = ['gold', 'ppf', 'nps', 'fixed_deposit'];
const tradableCategories = ['stocks', 'foreign_stocks', 'mutual_funds', 'gold'];
const balanceCategories = ['ppf', 'fixed_deposit'];

function transactionGrossAmount(tx) {
  return Number(tx?.units || 0) * Number(tx?.price || 0);
}

function transactionCashAmount(tx) {
  const gross = transactionGrossAmount(tx);
  const charges = Math.max(0, Number(tx?.charges || 0));
  return ['SELL', 'WITHDRAWAL'].includes(tx?.action)
    ? Math.max(0, gross - charges)
    : gross + (tx?.action === 'BUY' ? charges : 0);
}

function transactionCashDate(tx) {
  return String(tx?.settlementDate || tx?.date || '');
}

/**
 * Calculate holdings using moving-average cost. SELL proceeds reduce units at
 * average cost; they never reduce cost basis at the market selling price.
 */
function investmentMetrics(inv, cutoffDate = null) {
  if (balanceCategories.includes(inv.category)) {
    if (cutoffDate && inv.date && new Date(inv.date) > cutoffDate) {
      return { units: 0, costBasis: 0, currentValue: 0, realizedGain: 0 };
    }
    const accountTransactions = [...(inv.transactions || [])]
      .filter(tx => !cutoffDate || new Date(tx.date) <= cutoffDate)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    if (accountTransactions.length) {
      let deposits = 0;
      let interest = 0;
      let withdrawals = 0;
      let adjustments = 0;
      for (const tx of accountTransactions) {
        const amount = Number(tx.units || 0) * Number(tx.price || 0);
        if (tx.action === 'DEPOSIT') deposits += amount;
        if (tx.action === 'INTEREST') interest += amount;
        if (tx.action === 'WITHDRAWAL') withdrawals += amount;
        if (tx.action === 'ADJUSTMENT') adjustments += amount;
      }
      return {
        units: 1,
        costBasis: Math.max(0, deposits - withdrawals),
        currentValue: deposits + interest - withdrawals + adjustments,
        realizedGain: interest,
        deposits,
        interest,
        withdrawals,
        adjustments,
      };
    }
    return {
      units: 1,
      costBasis: Number(inv.buyPrice || 0),
      currentValue: Number(inv.currentPrice || 0),
      realizedGain: 0,
    };
  }
  let units = 0;
  let costBasis = 0;
  let realizedGain = 0;
  const allTxns = [...(inv.transactions || [])];
  const txns = allTxns
    .filter(tx => !cutoffDate || new Date(tx.date) <= cutoffDate)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  for (const tx of txns) {
    const quantity = Number(tx.units || 0);
    const price = Number(tx.price || 0);
    const charges = Math.max(0, Number(tx.charges || 0));
    if (tx.action === 'BUY') {
      units += quantity;
      costBasis += quantity * price + charges;
    } else if (tx.action === 'SELL' && units > 0) {
      const sold = Math.min(quantity, units);
      const averageCost = costBasis / units;
      realizedGain += sold * price - charges - sold * averageCost;
      units -= sold;
      costBasis -= sold * averageCost;
    }
  }
  if (!allTxns.length) {
    units = Number(inv.units || 0);
    costBasis = units * Number(inv.buyPrice || 0);
  }
  if (Math.abs(units) < 1e-9) units = 0;
  if (Math.abs(costBasis) < 1e-6) costBasis = 0;
  return {
    units,
    costBasis,
    currentValue: units * Number(inv.currentPrice || 0),
    realizedGain,
  };
}

function portfolioTotals(items = investments) {
  return items.reduce((totals, inv) => {
    const metrics = investmentMetrics(inv);
    totals.costBasis += metrics.costBasis;
    totals.currentValue += metrics.currentValue;
    totals.realizedGain += metrics.realizedGain;
    return totals;
  }, { costBasis: 0, currentValue: 0, realizedGain: 0 });
}

/* Build transaction log HTML for a holding */
function buildTxnLog(inv) {
  const txns = inv.transactions || [];
  if (txns.length === 0) return '<div class="txn-empty">No transaction history.</div>';

  if (balanceCategories.includes(inv.category)) {
    const metrics = investmentMetrics(inv);
    const rows = [...txns].sort((a, b) => String(b.date).localeCompare(String(a.date))).map(tx => {
      const amount = Number(tx.units || 0) * Number(tx.price || 0);
      const opening = String(tx.source || '').toLowerCase() === 'opening';
      const isOutflow = tx.action === 'WITHDRAWAL' || amount < 0;
      const actionLabel = opening
        ? (tx.action === 'DEPOSIT' ? 'OPENING PRINCIPAL'
          : tx.action === 'INTEREST' ? 'OPENING INTEREST'
            : 'OPENING VALUE')
        : tx.action;
      return `<tr>
        <td>${fmtDate(tx.date)}</td>
        <td><span class="txn-badge ${opening ? 'txn-opening' : isOutflow ? 'txn-sell' : 'txn-buy'}">${escHtml(actionLabel)}</span></td>
        <td style="font-weight:600" class="${isOutflow ? 'gain-negative' : ''}">${isOutflow ? '-' : '+'}${fmt(Math.abs(amount))}</td>
        <td>${opening ? 'Opening position · no bank debit' : escHtml(accountName(tx.accountId))}</td>
      </tr>`;
    }).join('');
    return `
      <table class="txn-table">
        <thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Account</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="txn-summary">
        <div><span>Transactions</span><strong>${txns.length}</strong></div>
        <div><span>Deposited</span><strong>${fmt(metrics.deposits || 0)}</strong></div>
        <div><span>Interest</span><strong class="gain-positive">${fmt(metrics.interest || 0)}</strong></div>
        <div><span>Balance</span><strong>${fmt(metrics.currentValue)}</strong></div>
      </div>`;
  }

  let totalBought = 0, totalSold = 0, totalBuyCost = 0, totalSellRevenue = 0;
  txns.forEach(t => {
    if (t.action === 'BUY')  { totalBought += t.units; totalBuyCost += transactionCashAmount(t); }
    if (t.action === 'SELL') { totalSold   += t.units; totalSellRevenue += transactionCashAmount(t); }
  });

  const rows = txns.map(t => {
    const total = transactionCashAmount(t);
    const charges = Math.max(0, Number(t.charges || 0));
    const isBuy = t.action === 'BUY';
    const opening = String(t.source || '').toLowerCase() === 'opening';
    return `<tr>
      <td>${fmtDate(t.date)}</td>
      <td>${t.settlementDate && t.settlementDate !== t.date ? fmtDate(t.settlementDate) : '—'}</td>
      <td><span class="txn-badge ${opening ? 'txn-opening' : isBuy ? 'txn-buy' : 'txn-sell'}">${opening ? 'OPENING POSITION' : t.action}</span></td>
      <td>${t.units}</td>
      <td>${fmtInvestmentUnitPrice(inv, t.price)}</td>
      <td>${charges > 0 ? fmt(charges) : '—'}</td>
      <td style="font-weight:600">${fmt(total)}</td>
      <td>${opening ? 'No bank debit' : escHtml(accountName(t.accountId))}</td>
    </tr>`;
  }).join('');

  const includesOpening = txns.some(tx => String(tx.source || '').toLowerCase() === 'opening');
  const realizedGain = investmentMetrics(inv).realizedGain;
  const summaryMetrics = [
    `<div><span>Transactions</span><strong>${txns.length}</strong></div>`,
    totalBought > 0 ? `<div><span>Bought</span><strong>${totalBought} units · ${fmt(totalBuyCost)}</strong></div>` : '',
    totalSold > 0 ? `<div><span>Sold</span><strong>${totalSold} units · ${fmt(totalSellRevenue)}</strong></div>` : '',
    totalSold > 0 ? `<div><span>Realised P&amp;L</span><strong class="${realizedGain >= 0 ? 'gain-positive' : 'gain-negative'}">${realizedGain >= 0 ? '+' : ''}${fmt(realizedGain)}</strong></div>` : '',
    `<div><span>Units Held</span><strong>${totalBought - totalSold}</strong></div>`,
  ].filter(Boolean).join('');

  return `
    <table class="txn-table">
      <thead><tr><th>Trade Date</th><th>Credit Date</th><th>Action</th><th>Units</th><th>Price/NAV</th><th>Charges</th><th>Net Amount</th><th>Account</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="txn-summary">${summaryMetrics}</div>
    ${includesOpening ? '<div class="txn-summary-note">Includes prior opening position.</div>' : ''}
  `;
}

/* Build a table for tradable holdings, grouped by sub-category */
function buildMarketPanel(items) {
  if (items.length === 0) {
    return '<div class="inv-panel-empty">No holdings yet. Click "+ Add Investment" to get started.</div>';
  }

  const subGroups = {};
  items.forEach(inv => {
    if (!subGroups[inv.category]) subGroups[inv.category] = [];
    subGroups[inv.category].push(inv);
  });

  const subLabels = { stocks: '📈 Stocks', foreign_stocks: '🌍 Foreign Stocks', mutual_funds: '📊 Mutual Funds' };
  const order = ['mutual_funds', 'stocks', 'foreign_stocks'];

  return order.filter(k => subGroups[k]).map(cat => {
    const grp = subGroups[cat];
    const grpTotals = portfolioTotals(grp);
    const grpInvested = grpTotals.costBasis;
    const grpCurrent = grpTotals.currentValue;
    const grpGain     = grpCurrent - grpInvested;
    const grpPct      = grpInvested > 0 ? (grpGain / grpInvested * 100).toFixed(1) : '0.0';
    const isPos       = grpGain >= 0;

    const rows = grp.map(inv => {
      const metrics = investmentMetrics(inv);
      const invested = metrics.costBasis;
      const currentVal = metrics.currentValue;
      const gain       = currentVal - invested;
      const gainPct    = invested > 0 ? (gain / invested * 100).toFixed(2) : '0.00';
      const isP        = gain >= 0;
      const txnCount   = (inv.transactions || []).length;
      const isMutualFund = inv.category === 'mutual_funds';
      const holdingName = isMutualFund ? (inv.name || inv.asset) : inv.asset;
      const holdingDetail = isMutualFund
        ? `Scheme code: ${inv.schemeCode || String(inv.asset || '').replace(/^MF-/i, '')}`
        : inv.name;
      return `
        <tr class="holding-row" data-inv-id="${inv.id}" title="Click to view transaction history">
          <td><strong>${escHtml(holdingName)}</strong>${inv.entryMode === 'prior' ? '<span class="opening-position-badge">Prior position</span>' : ''}<br><small style="color:var(--text-muted)">${escHtml(holdingDetail)}</small></td>
          <td>${inv.units}</td>
          <td>${fmtInvestmentUnitPrice(inv, inv.buyPrice)}</td>
          <td>${fmtInvestmentUnitPrice(inv, inv.currentPrice)}</td>
          <td style="font-weight:600;">${fmt(invested)}</td>
          <td style="font-weight:600;">${fmt(currentVal)}</td>
          <td class="${isP ? 'gain-positive' : 'gain-negative'}">${isP ? '+' : ''}${fmt(gain)}</td>
          <td class="${isP ? 'gain-positive' : 'gain-negative'}">${isP ? '+' : ''}${gainPct}%</td>
          <td>
            ${txnCount > 0 ? '<span class="txn-count" title="' + txnCount + ' transactions">📋' + txnCount + '</span>' : ''}
            <button class="action-btn buy-btn"  title="Buy More" data-id="${inv.id}">🛒</button>
            <button class="action-btn sell-btn"  title="Sell"     data-id="${inv.id}">💰</button>
            <button class="action-btn delete" title="Delete"   data-id="${inv.id}">🗑️</button>
          </td>
        </tr>
        <tr class="txn-expand-row" id="txn-row-${inv.id}">
          <td colspan="9">
            <div class="txn-log">${buildTxnLog(inv)}</div>
          </td>
        </tr>`;
    }).join('');

    return `
      <div class="inv-sub-group">
        <div class="inv-sub-header">
          <span class="inv-sub-label">${subLabels[cat] || cat}</span>
          <span class="inv-sub-summary">${fmt(grpCurrent)} <span class="${isPos ? 'gain-positive' : 'gain-negative'}">(${isPos ? '+' : ''}${grpPct}%)</span></span>
        </div>
        <table class="data-table">
          <thead><tr><th>Holding</th><th>Units</th><th>Buy Price</th><th>Current Price</th><th>Invested</th><th>Current Value</th><th>Gain / Loss</th><th>Return %</th><th>Actions</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }).join('');
}

/* Build body for other investments, grouped by sub-category */
function buildOtherPanel(items) {
  if (items.length === 0) {
    return '<div class="inv-panel-empty">No holdings yet. Click "+ Add Investment" to get started.</div>';
  }

  const subGroups = {};
  items.forEach(inv => {
    if (!subGroups[inv.category]) subGroups[inv.category] = [];
    subGroups[inv.category].push(inv);
  });

  const subLabels = { gold: '🥇 Gold', ppf: '🏛️ PPF', nps: '👴 NPS', fixed_deposit: '🏦 Fixed Deposit' };
  const order = ['gold', 'ppf', 'nps', 'fixed_deposit'];

  return order.filter(k => subGroups[k]).map(cat => {
    const grp = subGroups[cat];
    const grpTotals = portfolioTotals(grp);
    const grpInvested = grpTotals.costBasis;
    const grpCurrent = grpTotals.currentValue;
    const grpGain     = grpCurrent - grpInvested;
    const grpPct      = grpInvested > 0 ? (grpGain / grpInvested * 100).toFixed(1) : '0.0';
    const isPos       = grpGain >= 0;

    const holdingCards = grp.map(inv => {
      const metrics = investmentMetrics(inv);
      const invested = metrics.costBasis;
      const currentVal = metrics.currentValue;
      const gain       = currentVal - invested;
      const gainPct    = invested > 0 ? (gain / invested * 100).toFixed(1) : '0.0';
      const isP        = gain >= 0;
      const txnCount   = (inv.transactions || []).length;
      return `
        <div class="otile-holding">
          <div class="otile-row holding-row" data-inv-id="${inv.id}" title="Click to view transaction history">
            <div class="otile-name"><strong>${escHtml(inv.asset)}${inv.entryMode === 'prior' ? '<span class="opening-position-badge">Prior position</span>' : ''}</strong><small>${escHtml(inv.name)}</small></div>
            <div class="otile-actions">
              ${txnCount > 0 ? '<span class="txn-count">📋' + txnCount + '</span>' : ''}
              ${tradableCategories.includes(inv.category) ? `<button class="action-btn buy-btn" title="Buy More" data-id="${inv.id}">🛒</button><button class="action-btn sell-btn" title="Sell" data-id="${inv.id}">💰</button>` : ''}
              ${balanceCategories.includes(inv.category) ? `<button class="action-btn balance-btn" title="Add account transaction" data-id="${inv.id}">➕</button>` : ''}
              <button class="action-btn delete" title="Delete" data-id="${inv.id}">🗑️</button>
            </div>
          </div>
          <div class="otile-stats metric-blocks">
            ${balanceCategories.includes(inv.category) ? `
              <div><span>Deposited</span><strong>${fmt(metrics.deposits ?? invested)}</strong></div>
              <div><span>Interest</span><strong class="gain-positive">${fmt(metrics.interest ?? gain)}</strong></div>
              <div><span>Withdrawn</span><strong>${fmt(metrics.withdrawals || 0)}</strong></div>
              <div><span>Current Balance</span><strong>${fmt(currentVal)}</strong></div>
            ` : `
              <div><span>Units</span><strong>${inv.units}</strong></div>
              <div><span>Invested</span><strong>${fmt(invested)}</strong></div>
              <div><span>Current</span><strong>${fmt(currentVal)}</strong></div>
              <div><span>P&L</span><strong class="${isP ? 'gain-positive' : 'gain-negative'}">${isP ? '+' : ''}${fmt(gain)} (${isP ? '+' : ''}${gainPct}%)</strong></div>
            `}
          </div>
          <div class="txn-expand-card" id="txn-card-${inv.id}">
            <div class="txn-log">${buildTxnLog(inv)}</div>
          </div>
        </div>`;
    }).join('');

    return `
      <div class="inv-sub-group">
        <div class="inv-sub-header">
          <span class="inv-sub-label">${subLabels[cat] || cat}</span>
          <span class="inv-sub-summary">${fmt(grpCurrent)} <span class="${isPos ? 'gain-positive' : 'gain-negative'}">(${isPos ? '+' : ''}${grpPct}%)</span></span>
        </div>
        <div class="otile-holdings-list">${holdingCards}</div>
      </div>`;
  }).join('');
}

/* Populate tile card stats */
function updateTileCardStats(items, prefix) {
  const totals = portfolioTotals(items);
  const invested = totals.costBasis;
  const current = totals.currentValue;
  const gain     = current - invested;
  const isPos    = gain >= 0;

  const elInv  = document.getElementById(prefix + 'Invested');
  const elCur  = document.getElementById(prefix + 'Current');
  const elGain = document.getElementById(prefix + 'Gain');
  const elCnt  = document.getElementById(prefix + 'Count');
  if (elInv)  elInv.textContent  = fmt(invested);
  if (elCur)  elCur.textContent  = fmt(current);
  if (elGain) { elGain.textContent = (isPos ? '+' : '') + fmt(gain); elGain.className = isPos ? 'gain-positive' : 'gain-negative'; }
  if (elCnt)  elCnt.textContent  = items.length + ' holding' + (items.length !== 1 ? 's' : '');
}

function renderInvestmentsTable() {
  const marketItems = investments.filter(i => marketCategories.includes(i.category));
  const otherItems  = investments.filter(i => otherCategories.includes(i.category));

  // Update tile card summaries
  updateTileCardStats(marketItems, 'tileMkt');
  updateTileCardStats(otherItems, 'tileOth');

  // Render category pills on tiles
  renderTilePills(marketItems, 'tileMktPills', { stocks: '📈 Stocks', mutual_funds: '📊 Mutual Funds', foreign_stocks: '🌍 Foreign' });
  renderTilePills(otherItems,  'tileOthPills',  { gold: '🥇 Gold', ppf: '🏛️ PPF', nps: '👴 NPS', fixed_deposit: '🏦 FD' });

  updateInvestmentSummaryCards();
}

/* Render per-category pills inside a tile */
function renderTilePills(items, containerId, labelMap) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const buckets = {};
  items.forEach(i => {
    const val = investmentMetrics(i).currentValue;
    buckets[i.category] = (buckets[i.category] || 0) + val;
  });

  el.innerHTML = Object.keys(labelMap).map(cat => {
    const val = buckets[cat] || 0;
    if (val === 0) return '';
    return `<span class="inv-pill">${labelMap[cat]} <strong>${fmt(val)}</strong></span>`;
  }).join('');
}

/* Update the 4 summary cards dynamically */
function updateInvestmentSummaryCards() {
  const totals = portfolioTotals();
  const totalInvested = totals.costBasis;
  const totalCurrent = totals.currentValue;
  const totalGain     = totalCurrent - totalInvested;
  const overallReturn = totalInvested > 0 ? (totalGain / totalInvested * 100).toFixed(1) : '0.0';

  const elInvested = document.getElementById('invTotalInvested');
  const elCurrent  = document.getElementById('invTotalCurrent');
  const elGain     = document.getElementById('invTotalGain');
  const elReturn   = document.getElementById('invOverallReturn');
  if (elInvested) elInvested.textContent = fmt(totalInvested);
  if (elCurrent)  elCurrent.textContent  = fmt(totalCurrent);
  if (elGain)     { elGain.textContent = (totalGain >= 0 ? '+' : '') + fmt(totalGain); elGain.className = 'card-value ' + (totalGain >= 0 ? 'gain-positive' : 'gain-negative'); }
  if (elReturn)   elReturn.textContent   = (totalGain >= 0 ? '+' : '') + overallReturn + '%';
}

/* Bind Buy, Sell, Edit, Delete actions */
function bindInvestmentActions(container) {
  // Expand/collapse transaction log on row click
  container.querySelectorAll('.holding-row').forEach(row => {
    row.addEventListener('click', e => {
      // Don't expand if clicking a button
      if (e.target.closest('.action-btn') || e.target.closest('button')) return;
      const id = row.dataset.invId;
      // Table row expand
      const txnRow = document.getElementById('txn-row-' + id);
      if (txnRow) {
        txnRow.classList.toggle('open');
        row.classList.toggle('expanded');
        return;
      }
      // Card expand
      const txnCard = document.getElementById('txn-card-' + id);
      if (txnCard) {
        txnCard.classList.toggle('open');
        row.classList.toggle('expanded');
      }
    });
  });

  // Delete
  container.querySelectorAll('.action-btn.delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.id);
      if (emergencyAllocations.some(row => row.sourceType === 'investment' && Number(row.sourceId) === id)) {
        alert('This holding is assigned to the Emergency Reserve. Remove its allocation before deleting the holding.');
        return;
      }
      if (confirm('Delete this investment?')) {
        const idx = investments.findIndex(x => x.id === id);
        if (idx !== -1) { investments.splice(idx, 1); saveInvestments().catch(error => console.error('Save investments failed:', error)); renderAfterInvestmentChange(); }
      }
    });
  });

  // Buy More
  container.querySelectorAll('.buy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.id);
      const inv = investments.find(x => x.id === id);
      if (!inv) return;
      openTradeModal('buy', inv);
    });
  });

  // Sell
  container.querySelectorAll('.sell-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.id);
      const inv = investments.find(x => x.id === id);
      if (!inv) return;
      openTradeModal('sell', inv);
    });
  });

  container.querySelectorAll('.balance-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const inv = investments.find(x => x.id === Number(btn.dataset.id));
      if (!inv) return;
      const form = document.getElementById('accountTransactionForm');
      form.dataset.invId = inv.id;
      form.reset();
      document.getElementById('accountTransactionName').textContent = inv.name;
      document.getElementById('accountTransactionDate').value = todayISO();
      document.getElementById('accountTransactionAccount').value =
        String(defaultAccountId('investment') || '');
      updateBalanceTransactionRouting();
      openModal('accountTransactionModal');
    });
  });
}

function updateBalanceTransactionRouting() {
  const action = document.getElementById('accountTransactionType')?.value || 'DEPOSIT';
  const group = document.getElementById('accountTransactionAccountGroup');
  const select = document.getElementById('accountTransactionAccount');
  const label = document.getElementById('accountTransactionAccountLabel');
  const help = document.getElementById('accountTransactionAccountHelp');
  const requiresCashAccount = ['DEPOSIT', 'WITHDRAWAL'].includes(action);
  if (group) group.hidden = !requiresCashAccount;
  if (select) {
    select.required = requiresCashAccount;
    if (!requiresCashAccount) select.value = '';
  }
  if (label) label.textContent = action === 'WITHDRAWAL' ? 'Receiving Account' : 'Funding Account';
  if (help) help.textContent = action === 'WITHDRAWAL'
    ? 'The withdrawal will credit this account.'
    : 'The deposit will debit this account.';
}

document.getElementById('accountTransactionType')?.addEventListener('change', updateBalanceTransactionRouting);

document.getElementById('accountTransactionForm')?.addEventListener('submit', async event => {
  event.preventDefault();
  const inv = investments.find(x => x.id === Number(event.target.dataset.invId));
  if (!inv) return;
  const action = document.getElementById('accountTransactionType').value;
  const transaction = {
    date: document.getElementById('accountTransactionDate').value,
    action,
    units: 1,
    price: Number(document.getElementById('accountTransactionAmount').value),
    accountId: ['DEPOSIT', 'WITHDRAWAL'].includes(action)
      ? Number(document.getElementById('accountTransactionAccount').value) || null
      : null,
    source: 'connected',
  };
  if (!transaction.date || !Number.isFinite(transaction.price) || transaction.price <= 0) return;
  inv.transactions = inv.transactions || [];
  inv.transactions.push(transaction);
  const metrics = investmentMetrics(inv);
  if (metrics.currentValue < 0) {
    inv.transactions.pop();
    alert('This transaction would make the account balance negative.');
    return;
  }
  inv.units = 1;
  const previousBuyPrice = inv.buyPrice;
  const previousCurrentPrice = inv.currentPrice;
  inv.buyPrice = metrics.costBasis;
  inv.currentPrice = metrics.currentValue;
  const submitButton = event.submitter || event.target.querySelector('button[type="submit"]');
  if (submitButton) submitButton.disabled = true;
  try {
    await saveInvestments();
    investments = await apiGet('/investments');
    renderAfterInvestmentChange();
    closeModal('accountTransactionModal');
  } catch (error) {
    inv.transactions.pop();
    inv.buyPrice = previousBuyPrice;
    inv.currentPrice = previousCurrentPrice;
    alert(`Transaction was not saved.\n\n${error.message}`);
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
});

/* ============================================================
   TRADE MODAL (BUY / SELL)
   ============================================================ */
function openSettlementAccountModal(accountId) {
  const investmentAccount = accounts.find(row => Number(row.id) === Number(accountId));
  if (!investmentAccount || !['demat', 'mutual_fund'].includes(investmentAccount.type)) return;
  populateAccountSelectors();
  document.getElementById('settlementInvestmentAccountId').value = investmentAccount.id;
  document.getElementById('settlementAccountDescription').textContent =
    `${investmentAccount.name} will use this bank for redemptions and broker-cash withdrawals.`;
  document.getElementById('settlementBankAccount').value =
    String(investmentAccount.settlementAccountId || '');
  openModal('settlementAccountModal');
}

function setTradeFieldVisibility(id, visible) {
  const node = document.getElementById(id);
  if (node) node.hidden = !visible;
}

function updateTradeRedemptionMode() {
  const form = document.getElementById('tradeForm');
  if (!form) return;
  const amountMode = form.dataset.action === 'sell'
    && form.dataset.category === 'mutual_funds'
    && document.getElementById('tradeSellMode').value === 'amount';
  setTradeFieldVisibility('tradeUnitsGroup', !amountMode);
  setTradeFieldVisibility('tradeAmountGroup', amountMode);
  document.getElementById('tradeUnits').required = !amountMode;
  document.getElementById('tradeAmount').required = amountMode;
  updateTradeProceedsPreview();
}

function tradeFormAmounts() {
  const form = document.getElementById('tradeForm');
  const price = Number(document.getElementById('tradePrice').value || 0);
  const amountMode = form?.dataset.action === 'sell'
    && form.dataset.category === 'mutual_funds'
    && document.getElementById('tradeSellMode').value === 'amount';
  const enteredAmount = Number(document.getElementById('tradeAmount').value || 0);
  const units = amountMode && price > 0
    ? enteredAmount / price
    : Number(document.getElementById('tradeUnits').value || 0);
  const gross = amountMode ? enteredAmount : units * price;
  const charges = Math.max(0, Number(document.getElementById('tradeCharges').value || 0));
  return { units, price, gross, charges, net: Math.max(0, gross - charges) };
}

function updateTradeProceedsPreview() {
  const form = document.getElementById('tradeForm');
  const preview = document.getElementById('tradeProceedsPreview');
  if (!form || !preview || form.dataset.action !== 'sell') return;
  const amounts = tradeFormAmounts();
  preview.hidden = false;
  preview.innerHTML = `
    <span>Gross proceeds <strong>${fmt(amounts.gross)}</strong></span>
    <span>Charges <strong>-${fmt(amounts.charges)}</strong></span>
    <span>Net proceeds <strong>${fmt(amounts.net)}</strong></span>`;
}

function openTradeModal(action, inv) {
  const modal = document.getElementById('tradeModal');
  if (!modal) return;

  const containerAccount = accounts.find(row => Number(row.id) === Number(inv.containerAccountId));
  const settlementAccount = linkedSettlementAccount(containerAccount);
  if (action === 'sell' && inv.category === 'mutual_funds' && !settlementAccount) {
    alert('Link this mutual-fund account to its settlement bank before recording a redemption.');
    if (containerAccount) openSettlementAccountModal(containerAccount.id);
    return;
  }
  if (action === 'sell' && ['stocks', 'foreign_stocks'].includes(inv.category) && !containerAccount) {
    alert('Link this holding to a Demat / Brokerage account before recording a sale.');
    return;
  }

  document.getElementById('tradeAction').textContent = action === 'buy'
    ? 'Buy More'
    : inv.category === 'mutual_funds' ? 'Redeem Mutual Fund' : 'Sell';
  document.getElementById('tradeAssetName').textContent = `${inv.asset} — ${inv.name}`;
  const metrics = investmentMetrics(inv);
  document.getElementById('tradeCurrentUnits').textContent = metrics.units;
  document.getElementById('tradeCurrentValue').textContent = fmt(metrics.currentValue);

  const form = document.getElementById('tradeForm');
  form.dataset.action = action;
  form.dataset.invId  = inv.id;
  form.dataset.category = inv.category;
  form.reset();
  document.getElementById('tradeDate').value = todayISO();
  document.getElementById('tradeSettlementDate').value = todayISO();
  document.getElementById('tradeSettlementDate').min = todayISO();
  document.getElementById('tradeCharges').value = '0';
  document.getElementById('tradePrice').value = Number(inv.currentPrice || 0) || '';

  // Set max units for sell
  const unitsInput = document.getElementById('tradeUnits');
  if (action === 'sell') {
    unitsInput.max = metrics.units;
  } else {
    unitsInput.removeAttribute('max');
  }

  const isSell = action === 'sell';
  const isMfSell = isSell && inv.category === 'mutual_funds';
  const isStockSell = isSell && ['stocks', 'foreign_stocks'].includes(inv.category);
  setTradeFieldVisibility('tradeSellModeGroup', isMfSell);
  setTradeFieldVisibility('tradeSettlementDateGroup', isSell);
  setTradeFieldVisibility('tradeChargesGroup', isSell);
  setTradeFieldVisibility('tradeAccountGroup', !isSell || (!isMfSell && !isStockSell));
  setTradeFieldVisibility('tradeSettlementDestination', isMfSell || isStockSell);
  setTradeFieldVisibility('tradeProceedsPreview', isSell);
  document.getElementById('tradeDateLabel').textContent = isSell ? 'Sale / Redemption Date' : 'Purchase Date';
  document.getElementById('tradePriceLabel').textContent = inv.category === 'mutual_funds'
    ? 'Applicable NAV (₹)' : 'Price per Unit (₹)';
  document.getElementById('tradeSettlementDateLabel').textContent = isMfSell
    ? 'Bank Credit Date' : 'Broker Settlement Date';
  document.getElementById('tradeSettlementDate').required = isSell;
  document.getElementById('tradeSellMode').value = 'units';

  const accountSelect = document.getElementById('tradeAccount');
  if (!isSell) {
    const fundingAccounts = eligibleSettlementAccounts();
    if (containerAccount?.type === 'demat' && brokerCashBalance(containerAccount) > 0) {
      fundingAccounts.unshift(containerAccount);
    }
    accountSelect.innerHTML = '<option value="">Select funding account</option>' + fundingAccounts.map(account =>
      `<option value="${account.id}">${escHtml(account.name)}${account.type === 'demat' ? ` · Broker cash ${fmt(brokerCashBalance(account))}` : ''}</option>`
    ).join('');
    accountSelect.value = String(defaultAccountId('investment') || '');
    accountSelect.required = true;
  } else {
    accountSelect.required = !isMfSell && !isStockSell;
  }

  const destination = document.getElementById('tradeSettlementDestination');
  if (isMfSell) {
    destination.innerHTML = `<strong>Credits ${escHtml(settlementAccount.name)}</strong><span>Net redemption proceeds will reach this linked bank on the credit date.</span>`;
  } else if (isStockSell) {
    destination.innerHTML = `<strong>Credits ${escHtml(containerAccount.name)} broker cash</strong><span>Withdraw this available cash to ${escHtml(settlementAccount?.name || 'a linked bank account')} after settlement.</span>`;
  }
  updateTradeRedemptionMode();
  updateTradeProceedsPreview();

  modal.classList.add('open');
}

document.getElementById('tradeSellMode')?.addEventListener('change', updateTradeRedemptionMode);
['tradeUnits', 'tradeAmount', 'tradePrice', 'tradeCharges'].forEach(id => {
  document.getElementById(id)?.addEventListener('input', updateTradeProceedsPreview);
});
document.getElementById('tradeDate')?.addEventListener('change', event => {
  const settlementInput = document.getElementById('tradeSettlementDate');
  settlementInput.min = event.target.value;
  if (settlementInput.value < event.target.value) settlementInput.value = event.target.value;
});

document.getElementById('tradeForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const form   = e.target;
  const action = form.dataset.action;
  const id     = parseInt(form.dataset.invId);
  const { units, price, gross, charges } = tradeFormAmounts();

  const inv = investments.find(x => x.id === id);
  if (!inv) return;

  const before = investmentMetrics(inv);
  if (!Number.isFinite(units) || units <= 0 || !Number.isFinite(price) || price <= 0) return;
  if (action === 'sell' && units > before.units + 1e-9) {
    alert('Cannot sell more units than you hold.');
    return;
  }
  if (action === 'sell' && charges > gross) {
    alert('Charges cannot exceed the sale proceeds.');
    return;
  }
  const containerAccount = accounts.find(row => Number(row.id) === Number(inv.containerAccountId));
  const settlementAccount = linkedSettlementAccount(containerAccount);
  const accountId = action === 'buy'
    ? Number(document.getElementById('tradeAccount').value) || null
    : inv.category === 'mutual_funds'
      ? settlementAccount?.id || null
      : ['stocks', 'foreign_stocks'].includes(inv.category)
        ? containerAccount?.id || null
        : Number(document.getElementById('tradeAccount').value) || null;
  if (!accountId) {
    alert('Select or configure the account connected to this transaction.');
    return;
  }
  if (action === 'buy') {
    const fundingAccount = accounts.find(row => Number(row.id) === Number(accountId));
    const available = !fundingAccount ? 0 : fundingAccount.type === 'demat'
      ? brokerCashBalance(fundingAccount)
      : trackedAccountBalance(fundingAccount);
    if (fundingAccount && !isLiabilityAccount(fundingAccount) && available + 0.005 < gross) {
      alert(`${fundingAccount.name} has only ${fmt(Math.max(0, available))} available for this purchase.`);
      return;
    }
  }
  if (!inv.transactions) inv.transactions = [];
  const transaction = {
    date: document.getElementById('tradeDate').value,
    action: action.toUpperCase(), units, price, accountId,
    source: 'connected',
    settlementDate: action === 'sell' ? document.getElementById('tradeSettlementDate').value : '',
    charges: action === 'sell' ? charges : 0,
  };
  inv.transactions.push(transaction);
  const after = investmentMetrics(inv);
  const previousUnits = inv.units;
  const previousBuyPrice = inv.buyPrice;
  inv.units = after.units;
  inv.buyPrice = after.units > 0 ? after.costBasis / after.units : 0;

  const submitButton = e.submitter || form.querySelector('button[type="submit"]');
  if (submitButton) submitButton.disabled = true;
  try {
    await saveInvestments();
    investments = await apiGet('/investments');
    renderAfterInvestmentChange();
    closeModal('tradeModal');
  } catch (error) {
    inv.transactions.pop();
    inv.units = previousUnits;
    inv.buyPrice = previousBuyPrice;
    alert(`Transaction was not saved.\n\n${error.message}`);
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
});


/* ============================================================
   RENDER: SAVINGS TABLE
   ============================================================ */
/* ============================================================
   RENDER: SAVINGS SECTION CARDS (dynamic)
   ============================================================ */
function renderSavingsCards() {
  const md = buildMonthData(currentMonthIdx, currentYear);
  const income   = md?.income   || 0;
  const exp      = md?.expenses || 0;
  const inv      = md?.invested || 0;
  const saved    = md?.saved    || 0;
  const saveRate = income > 0 ? (saved / income * 100).toFixed(1) : '0.0';
  const invRate  = income > 0 ? (inv / income * 100).toFixed(1) : '0.0';
  const expRate  = income > 0 ? (exp / income * 100).toFixed(1) : '0.0';

  const el = (id, txt) => { const e = document.getElementById(id); if (e) e.textContent = txt; };
  const cls = (id, c) => { const e = document.getElementById(id); if (e) e.className = 'card-change ' + c; };

  el('savIncome',   fmt(income));
  el('savExpenses', fmt(exp));
  el('savInvested', fmt(inv));
  el('savNetSaved', fmt(saved));

  el('savIncomeChange',   income > 0 ? `${MONTHS[currentMonthIdx]} ${currentYear}` : 'Add an income transaction from the dashboard');
  cls('savIncomeChange',  income > 0 ? 'card-change positive' : 'card-change');

  el('savExpensesChange', `${expRate}% of income`);
  cls('savExpensesChange', 'card-change negative');

  el('savInvestedChange', `${invRate}% of income`);
  cls('savInvestedChange', 'card-change positive');

  el('savNetSavedChange', `${saveRate}% savings rate`);
  cls('savNetSavedChange', parseFloat(saveRate) >= 0 ? 'card-change positive' : 'card-change negative');
}

function renderIncomeTransactions() {
  const tbody = document.getElementById('incomeTransactionsBody');
  if (!tbody) return;
  const rows = [...incomeTransactions].sort((a, b) => String(b.date).localeCompare(String(a.date)) || Number(b.id) - Number(a.id));
  tbody.innerHTML = rows.length ? rows.map(row => `
    <tr>
      <td>${fmtDate(row.date)}</td>
      <td>${incomeSourceLabel(row.source)}</td>
      <td>${escHtml(row.description || incomeSourceLabel(row.source))}</td>
      <td>${escHtml(accountName(row.accountId))}</td>
      <td style="color:var(--success);font-weight:700;">+${fmt(row.amount)}</td>
      <td><button class="action-btn delete" type="button" data-delete-income="${row.id}" title="Delete income">&#128465;</button></td>
    </tr>`).join('') : '<tr><td colspan="6" class="empty-state">No income transactions recorded.</td></tr>';
  tbody.querySelectorAll('[data-delete-income]').forEach(button => {
    button.addEventListener('click', async () => {
      if (!confirm('Delete this income credit? The receiving account balance will also decrease.')) return;
      const id = Number(button.dataset.deleteIncome);
      const previous = incomeTransactions;
      incomeTransactions = incomeTransactions.filter(row => Number(row.id) !== id);
      try {
        await saveIncomeTransactions();
        if (serverAvailable) savingsHistory = await apiGet('/savings-history');
        refreshDashboard();
        renderIncomeTransactions();
      } catch (error) {
        incomeTransactions = previous;
        alert(`Income could not be deleted: ${error.message}`);
      }
    });
  });
}

function renderSavingsTable() {
  const tbody = document.getElementById('savingsTableBody');
  if (!tbody) return;

  tbody.innerHTML = savingsHistory.map(row => {
    /* Parse month label → mIdx, yr */
    const parts = row.month.split(' ');
    const short = parts[0]; // "Apr"
    const yr    = parseInt(parts[1]);
    const mIdx  = MONTHS.findIndex(m => m.startsWith(short));

    const monthExpenses = mIdx >= 0 ? expensesForYM(mIdx, yr).reduce((s, e) => s + e.amount, 0) : 0;
    const monthInvested = mIdx >= 0 ? investmentOutflowForYM(mIdx, yr) : 0;
    const monthEF       = mIdx >= 0 ? efContribForYM(mIdx, yr) : 0;
    const income = row.income || 0;
    const saved = income - monthExpenses - monthInvested - monthEF;
    const saveRate = income > 0 ? (saved / income * 100).toFixed(1) : '0.0';
    const invRate  = income > 0 ? (monthInvested / income * 100).toFixed(1) : '0.0';
    const isGood   = parseFloat(saveRate) >= 30;

    return `
      <tr>
        <td style="font-weight:500;">${row.month}</td>
        <td style="color:var(--success); font-weight:600;">${fmt(income)}</td>
        <td style="color:var(--danger);">-${fmt(monthExpenses)}</td>
        <td style="color:var(--warning); font-weight:600;">-${fmt(monthInvested)}</td>
        <td style="color:var(--primary);">-${fmt(monthEF)}</td>
        <td style="font-weight:700;">${fmt(saved)}</td>
        <td>
          <span style="color:${isGood ? 'var(--success)' : 'var(--warning)'}; font-weight:600;">
            ${saveRate}%
          </span>
        </td>
        <td style="font-weight:600; color:var(--primary);">${invRate}%</td>
      </tr>`;
  }).join('');

}


/* ============================================================
   RENDER: SAVINGS GOALS
   ============================================================ */
function renderGoals() {
  const el = document.getElementById('goalsGrid');
  if (!el) return;

  el.innerHTML = savingsGoals.map(goal => {
    const pct      = Math.min(100, Math.round(goal.current / goal.target * 100));
    const complete = pct >= 100;
    return `
      <div class="goal-card">
        <div class="goal-top">
          <span class="goal-icon">${goal.icon}</span>
          <div style="flex:1">
            <div class="goal-title">${escHtml(goal.name)}</div>
            <div class="goal-deadline">Target: ${fmtDate(goal.deadline)}</div>
          </div>
          <button class="action-btn delete goal-delete" title="Delete Goal" data-id="${goal.id}">🗑️</button>
        </div>
        <div class="goal-amounts">
          <span class="goal-saved">${fmt(goal.current)}</span>
          <span class="goal-target">of ${fmt(goal.target)}</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill ${complete ? 'complete' : ''}" style="width:${pct}%"></div>
        </div>
        <div class="goal-percent">${complete ? '✅ Goal reached!' : pct + '% complete'}</div>
      </div>`;
  }).join('');

  // Delete individual goal
  el.querySelectorAll('.goal-delete').forEach(btn => {
    btn.addEventListener('click', e => {
      const id = parseInt(btn.dataset.id);
      if (confirm('Delete this savings goal?')) {
        const idx = savingsGoals.findIndex(g => g.id === id);
        if (idx !== -1) { savingsGoals.splice(idx, 1); saveSavingsGoals(); renderGoals(); renderDashboardCards(); }
      }
    });
  });
}

/* ============================================================
   RENDER: EMERGENCY FUND CARD
   ============================================================ */
/** Compute cumulative EF balance up to (and including) given month */
function efBalanceUpTo(mIdx, yr) {
  const cutoff = new Date(yr, mIdx + 1, 0); // last day of month
  return (emergencyFund.contributions || [])
    .filter(c => new Date(c.date) <= cutoff)
    .reduce((s, c) => s + c.amount, 0);
}

/** Compute EF contribution total for a specific month */
function efContribForYM(mIdx, yr) {
  const ym = `${yr}-${String(mIdx + 1).padStart(2, '0')}`;
  return (emergencyFund.contributions || [])
    .filter(c => c.date.slice(0, 7) === ym)
    .reduce((s, c) => s + c.amount, 0);
}

function renderEmergencyFund() {
  const el = document.getElementById('emergencyFundCard');
  if (!el) return;

  const contribs = emergencyFund.contributions || [];
  const pct      = emergencyFund.target > 0 ? Math.min(100, Math.round(emergencyFund.current / emergencyFund.target * 100)) : 0;
  const complete = pct >= 100;
  const remaining = Math.max(0, emergencyFund.target - emergencyFund.current);

  /* This month's contribution */
  const thisMonthAmt = efContribForYM(currentMonthIdx, currentYear);

  /* Months of expenses covered */
  let avgMonthlyExp = 0;
  let expMonthCount = 0;
  for (let off = 0; off < 6; off++) {
    let mI = currentMonthIdx - off;
    let yr = currentYear;
    while (mI < 0) { mI += 12; yr--; }
    const mExp = expensesForYM(mI, yr).reduce((s, e) => s + e.amount, 0);
    if (mExp > 0) { avgMonthlyExp += mExp; expMonthCount++; }
  }
  avgMonthlyExp = expMonthCount > 0 ? avgMonthlyExp / expMonthCount : 0;
  const monthsCovered = avgMonthlyExp > 0 ? (emergencyFund.current / avgMonthlyExp).toFixed(1) : '∞';

  /* Sort contributions newest first for display */
  const sorted = [...contribs].sort((a, b) => b.date.localeCompare(a.date));

  el.innerHTML = `
    <div class="ef-header">
      <div class="ef-icon">🛡️</div>
      <div class="ef-title-wrap">
        <h3>Emergency Fund</h3>
        <p>Liquid cash for unexpected expenses</p>
      </div>
      <button class="btn-primary btn-sm" id="editEFTargetBtn" title="Edit target">⚙️ Target</button>
    </div>
    <div class="ef-amounts">
      <div class="ef-stat">
        <span>Saved</span>
        <strong class="gain-positive">${fmt(emergencyFund.current)}</strong>
      </div>
      <div class="ef-stat">
        <span>Target</span>
        <strong>${fmt(emergencyFund.target)}</strong>
      </div>
      <div class="ef-stat">
        <span>Remaining</span>
        <strong>${complete ? '✅ Done' : fmt(remaining)}</strong>
      </div>
      <div class="ef-stat">
        <span>This Month</span>
        <strong style="color:var(--primary);">${thisMonthAmt > 0 ? '+' + fmt(thisMonthAmt) : '₹0'}</strong>
      </div>
      <div class="ef-stat">
        <span>Covers</span>
        <strong style="color:#8b5cf6;">${monthsCovered} months</strong>
      </div>
    </div>
    <div class="progress-bar ef-progress">
      <div class="progress-fill ${complete ? 'complete' : ''}" style="width:${pct}%"></div>
    </div>
    <div class="ef-footer">
      <span class="ef-pct">${pct}% funded · ${contribs.length} contributions</span>
      <div style="display:flex; gap:8px;">
        ${sorted.length ? `<button class="btn-outline btn-sm" id="toggleEFContribs">Show History ▾</button>` : ''}
        <button class="btn-primary btn-sm" id="addEFContribBtn">+ Add Contribution</button>
      </div>
    </div>

    ${sorted.length ? `
    <div id="efContribCollapse" class="ef-contrib-collapse">
      <table class="data-table" style="margin-top:12px; font-size:0.85rem;">
        <thead><tr><th>Date</th><th>Amount</th><th>Note</th><th>Running</th><th></th></tr></thead>
        <tbody>
          ${sorted.map((c, i) => {
            const running = contribs.filter(x => x.date <= c.date).reduce((s, x) => s + x.amount, 0);
            return `<tr>
              <td>${fmtDate(c.date)}</td>
              <td style="font-weight:600; color:var(--success);">+${fmt(c.amount)}</td>
              <td>${escHtml(c.note || '')}</td>
              <td style="color:var(--text-muted);">${fmt(running)}</td>
              <td><button class="action-btn delete ef-delete-contrib" data-id="${c.id}" title="Delete">🗑️</button></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>` : '<p style="color:var(--text-muted); padding:12px 0; text-align:center;">No contributions yet. Start by adding one!</p>'}
  `;

  /* Edit target button */
  document.getElementById('editEFTargetBtn')?.addEventListener('click', () => {
    const val = prompt('Emergency Fund Target (₹):', emergencyFund.target);
    if (val !== null && !isNaN(parseFloat(val))) {
      emergencyFund.target = parseFloat(val);
      saveEmergencyFund();
      renderEmergencyFund();
      renderDashboardCards();
    }
  });

  /* Add contribution button */
  document.getElementById('addEFContribBtn')?.addEventListener('click', () => {
    document.getElementById('efContribDate').value = new Date().toISOString().slice(0, 10);
    document.getElementById('efContribAmount').value = '';
    document.getElementById('efContribNote').value = '';
    openModal('emergencyFundModal');
  });

  /* Toggle contribution history */
  const toggleBtn = document.getElementById('toggleEFContribs');
  const collapseEl = document.getElementById('efContribCollapse');
  if (toggleBtn && collapseEl) {
    toggleBtn.addEventListener('click', () => {
      const open = collapseEl.classList.toggle('open');
      toggleBtn.textContent = open ? 'Hide History ▴' : 'Show History ▾';
    });
  }

  /* Delete contribution buttons */
  el.querySelectorAll('.ef-delete-contrib').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.id);
      if (!confirm('Delete this contribution?')) return;
      emergencyFund.contributions = emergencyFund.contributions.filter(c => c.id !== id);
      emergencyFund.current = emergencyFund.contributions.reduce((s, c) => s + c.amount, 0);
      saveEmergencyFund();
      renderEmergencyFund();
      renderDashboardCards();
      initCharts();
    });
  });
}


/* ============================================================
   RENDER: STOCKS & MUTUAL FUNDS — DEDICATED SECTION
   ============================================================ */
let stocksGrowthCompareChart = null;
let stocksInvVsCurChart = null;
let mfGrowthCompareChart = null;
let mfInvVsCurChart = null;

function renderStocksSection() {
  const items = investments.filter(i => marketCategories.includes(i.category));

  const totalInvested = items.reduce((s, i) => s + i.units * i.buyPrice, 0);
  const totalCurrent  = items.reduce((s, i) => s + i.units * i.currentPrice, 0);
  const totalGain     = totalCurrent - totalInvested;
  const returnPct     = totalInvested > 0 ? (totalGain / totalInvested * 100).toFixed(1) : '0.0';
  const isPos         = totalGain >= 0;

  /* --- Category split: stocks vs mutual_funds vs foreign_stocks --- */
  const catBuckets = { stocks: 0, mutual_funds: 0, foreign_stocks: 0 };
  items.forEach(i => {
    const val = i.units * i.currentPrice;
    catBuckets[i.category] = (catBuckets[i.category] || 0) + val;
  });

  /* --- Summary cards --- */
  const el = document.getElementById('stocksSectionBody');
  if (!el) return;

  const summaryHTML = `
    <div class="cards-grid">
      <div class="summary-card invest-total">
        <div class="card-icon">💰</div>
        <div class="card-content">
          <span class="card-label">Total Invested</span>
          <span class="card-value">${fmt(totalInvested)}</span>
          <span class="card-change">Market holdings</span>
        </div>
      </div>
      <div class="summary-card invest-value">
        <div class="card-icon">📈</div>
        <div class="card-content">
          <span class="card-label">Current Value</span>
          <span class="card-value">${fmt(totalCurrent)}</span>
          <span class="card-change positive">Live valuation</span>
        </div>
      </div>
      <div class="summary-card invest-gain">
        <div class="card-icon">${isPos ? '✅' : '⚠️'}</div>
        <div class="card-content">
          <span class="card-label">Unrealized P&amp;L</span>
          <span class="card-value ${isPos ? 'gain-positive' : 'gain-negative'}">${isPos ? '+' : ''}${fmt(totalGain)}</span>
          <span class="card-change">${isPos ? '+' : ''}${returnPct}% return</span>
        </div>
      </div>
      <div class="summary-card invest-month">
        <div class="card-icon">📊</div>
        <div class="card-content">
          <span class="card-label">Holdings</span>
          <span class="card-value">${items.length}</span>
          <span class="card-change">Across ${Object.keys(catBuckets).filter(k => catBuckets[k] > 0).length} categories</span>
        </div>
      </div>
    </div>
  `;

  /* --- Stocks: Growth Comparison + Invested vs Current charts --- */
  const stockItems = items.filter(i => i.category === 'stocks' || i.category === 'foreign_stocks');
  const mfItems    = items.filter(i => i.category === 'mutual_funds');
  const mfTotals = portfolioTotals(mfItems);

  const stocksCompareChartsHTML = stockItems.length > 0 ? `
    <div class="stk-compare-section">
      <h3 class="compare-section-title">📈 Stocks — Performance Analysis</h3>
      <div class="stk-charts-row stk-charts-row-2col">
        <div class="chart-card stk-chart-card wide-chart-card">
          <div class="chart-header">
            <h3>Growth Comparison — All Stocks</h3>
            <span class="chart-subtitle">Value over last 12 months</span>
          </div>
          <div class="chart-container tall"><canvas id="stocksGrowthCompareChart"></canvas></div>
          <div class="chart-custom-legend" id="stocksGrowthLegend"></div>
        </div>
        <div class="chart-card stk-chart-card wide-chart-card">
          <div class="chart-header">
            <h3>Invested vs Current — Stocks</h3>
            <span class="chart-subtitle">Total invested vs value over 12 months</span>
          </div>
          <div class="chart-container tall"><canvas id="stocksInvVsCurChart"></canvas></div>
        </div>
      </div>
    </div>
  ` : '';

  const mfCompareChartsHTML = mfItems.length > 0 ? `
    <div class="stk-compare-section">
      <h3 class="compare-section-title">📊 Mutual Funds — Performance Analysis</h3>
      <div class="stk-charts-row stk-charts-row-2col">
        <div class="chart-card stk-chart-card wide-chart-card">
          <div class="chart-header">
            <h3>Current Value by Mutual Fund</h3>
            <span class="chart-subtitle">Latest NAV × units · Total ${fmt(mfTotals.currentValue)}</span>
          </div>
          <div class="chart-container tall"><canvas id="mfGrowthCompareChart"></canvas></div>
        </div>
        <div class="chart-card stk-chart-card wide-chart-card">
          <div class="chart-header">
            <h3>Invested vs Current — Mutual Funds</h3>
            <span class="chart-subtitle">Invested ${fmt(mfTotals.costBasis)} · Current ${fmt(mfTotals.currentValue)}</span>
          </div>
          <div class="chart-container tall"><canvas id="mfInvVsCurChart"></canvas></div>
        </div>
      </div>
    </div>
  ` : '';

  /* --- Holdings table --- */
  const holdingsHTML = buildMarketPanel(items);

  /* --- Debug panel (below holdings) --- */
  const debugPanelHTML = `
    <div id="priceDebugPanel" class="debug-panel" style="display:none;">
      <div class="debug-header">
        <h4>🔍 Price Fetch Debug Log</h4>
        <button class="btn btn-sm" id="btnClearDebug">Clear</button>
      </div>
      <div id="debugLogBody" class="debug-log-body"><em>Click Refresh Prices to see fetch attempts…</em></div>
    </div>
  `;

  el.innerHTML = summaryHTML + stocksCompareChartsHTML + mfCompareChartsHTML +
    '<div class="table-card full-width" style="margin-top:8px;">' +
      '<div class="table-header">' +
        '<h3>All Holdings</h3>' +
        '<div class="table-header-actions">' +
          '<span id="stocksRefreshStatus" class="refresh-status"></span>' +
          '<button class="btn-primary btn-sm" id="btnStocksRefresh">🔄 Refresh Prices</button>' +
          '<button class="btn btn-sm" id="btnToggleDebug">🐞</button>' +
          '<button class="btn-primary btn-sm" id="btnAddStockHolding">+ Add Investment</button>' +
        '</div>' +
      '</div>' +
      holdingsHTML +
      debugPanelHTML +
    '</div>';

  bindInvestmentActions(el);

  /* --- Wire add-investment button --- */
  document.getElementById('btnAddStockHolding')?.addEventListener('click', () => openInvestmentModal('market'));

  /* --- Wire refresh button --- */
  document.getElementById('btnStocksRefresh')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnStocksRefresh');
    const status = document.getElementById('stocksRefreshStatus');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Fetching…'; }
    if (status) status.textContent = '';
    priceDebugLog = [];   // clear previous log
    const result = await refreshAllPrices();
    if (btn) { btn.disabled = false; btn.textContent = '🔄 Refresh Prices'; }
    if (status) {
      status.textContent = `✅ ${result.updated} updated` +
        (result.failed ? ` · ❌ ${result.failed} failed` : '') +
        (result.skipped ? ` · ⏭️ ${result.skipped} manual` : '');
    }
    renderDebugLog();
    renderStocksSection();   // re-render with new prices
    renderDashboardCards();
    initCharts();
    navigateTo('stocks');
  });

  /* --- Wire debug toggle --- */
  document.getElementById('btnToggleDebug')?.addEventListener('click', () => {
    const panel = document.getElementById('priceDebugPanel');
    const btn = document.getElementById('btnToggleDebug');
    if (!panel) return;
    const visible = panel.style.display !== 'none';
    panel.style.display = visible ? 'none' : 'block';
    if (btn) btn.textContent = visible ? '🐞 Show Debug Log' : '🐞 Hide Debug Log';
  });
  document.getElementById('btnClearDebug')?.addEventListener('click', () => {
    priceDebugLog = [];
    renderDebugLog();
  });

  /* Re-populate debug log if it has entries */
  renderDebugLog();

  /* --- Render comparison charts for stocks and mutual funds --- */
  renderStocksCompareCharts(stockItems);
  renderMFCompareCharts(mfItems);
}

/* ============================================================
   HELPER: Build monthly value timeline for a set of holdings
   ============================================================ */
function buildMonthlyTimeline(items) {
  const now = new Date();
  const months = [];
  for (let m = 11; m >= 0; m--) {
    const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
    months.push({ key: d.toISOString().slice(0, 7), label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }) });
  }

  const datasets = items.map(inv => {
    const txns = (inv.transactions && inv.transactions.length > 0)
      ? inv.transactions.slice().sort((a, b) => a.date.localeCompare(b.date))
      : [{ date: inv.date, action: 'BUY', units: inv.units, price: inv.buyPrice }];

    return months.map((mo, idx) => {
      const [monthYear, monthNumber] = mo.key.split('-').map(Number);
      const monthEnd = new Date(monthYear, monthNumber, 0, 23, 59, 59);
      const monthMetrics = investmentMetrics(inv, monthEnd);
      const unitsHeld = monthMetrics.units;
      const totalCost = monthMetrics.costBasis;
      if (unitsHeld <= 0) return { invested: 0, value: 0 };

      const isCurrentMonth = idx === months.length - 1;
      if (isCurrentMonth) {
        return { invested: totalCost, value: unitsHeld * inv.currentPrice };
      }
      /* For past months, interpolate value between invested and current proportionally */
      const purchaseMonth = txns[0].date.slice(0, 7);
      const totalMonths = months.length - 1;
      const monthsSincePurchase = months.findIndex(m => m.key >= purchaseMonth);
      const elapsed = idx - monthsSincePurchase;
      const span = totalMonths - monthsSincePurchase;
      if (span <= 0 || elapsed < 0) return { invested: totalCost, value: totalCost };
      const ratio = elapsed / span;
      const currentVal = unitsHeld * inv.currentPrice;
      return { invested: totalCost, value: totalCost + (currentVal - totalCost) * ratio };
    });
  });

  return { months, datasets };
}

const lineChartColors = [
  '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6',
  '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6', '#f97316',
  '#84cc16', '#a855f7', '#22d3ee', '#e11d48', '#eab308'
];

/* ── Custom HTML legend (scrollable, click-to-toggle) ───────── */
function buildHtmlLegend(chart, containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '';
  chart.data.datasets.forEach((ds, i) => {
    const item = document.createElement('span');
    item.className = 'legend-item' + (chart.isDatasetVisible(i) ? '' : ' legend-hidden');
    const swatch = document.createElement('span');
    swatch.className = 'legend-swatch';
    swatch.style.background = ds.borderColor;
    item.appendChild(swatch);
    item.appendChild(document.createTextNode(ds.label));
    item.addEventListener('click', () => {
      chart.setDatasetVisibility(i, !chart.isDatasetVisible(i));
      chart.update();
      item.classList.toggle('legend-hidden');
    });
    el.appendChild(item);
  });
}

/* ============================================================
   RENDER: STOCKS — 12-MONTH GROWTH LINE CHARTS
   ============================================================ */
function renderStocksCompareCharts(stockItems) {
  if (stocksGrowthCompareChart) { stocksGrowthCompareChart.destroy(); stocksGrowthCompareChart = null; }
  if (stocksInvVsCurChart)      { stocksInvVsCurChart.destroy();      stocksInvVsCurChart = null; }
  if (stockItems.length === 0) return;

  const { months, datasets } = buildMonthlyTimeline(stockItems);
  const monthLabels = months.map(m => m.label);

  const amtTickCallback = v => '₹' + (v >= 100000 ? (v/100000).toFixed(1) + 'L' : v >= 1000 ? (v/1000).toFixed(0) + 'K' : v);

  /* Chart 1: Growth lines — each stock's value over 12 months */
  const growthCtx = document.getElementById('stocksGrowthCompareChart')?.getContext('2d');
  if (growthCtx) {
    stocksGrowthCompareChart = new Chart(growthCtx, {
      type: 'line',
      data: {
        labels: monthLabels,
        datasets: stockItems.map((inv, i) => ({
          label: inv.asset,
          data: datasets[i].map(d => d.value),
          borderColor: lineChartColors[i % lineChartColors.length],
          backgroundColor: lineChartColors[i % lineChartColors.length] + '18',
          tension: 0.35,
          pointRadius: 3,
          pointHoverRadius: 6,
          borderWidth: 2.5,
          fill: false
        }))
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmt(ctx.parsed.y)}` } }
        },
        scales: {
          y: { title: { display: true, text: 'Value (₹)' }, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { callback: amtTickCallback } },
          x: { grid: { display: false } }
        }
      }
    });
    buildHtmlLegend(stocksGrowthCompareChart, 'stocksGrowthLegend');
  }

  /* Chart 2: Invested vs Current value over 12 months (aggregated) */
  const ivcCtx = document.getElementById('stocksInvVsCurChart')?.getContext('2d');
  if (ivcCtx) {
    const aggInvested = months.map((_, mi) => datasets.reduce((s, ds) => s + ds[mi].invested, 0));
    const aggValue    = months.map((_, mi) => datasets.reduce((s, ds) => s + ds[mi].value, 0));

    stocksInvVsCurChart = new Chart(ivcCtx, {
      type: 'line',
      data: {
        labels: monthLabels,
        datasets: [
          { label: 'Total Invested', data: aggInvested, borderColor: '#6366f1', backgroundColor: '#6366f120', tension: 0.3, pointRadius: 3, borderWidth: 2.5, fill: true, borderDash: [6, 3] },
          { label: 'Current Value',  data: aggValue,    borderColor: '#10b981', backgroundColor: '#10b98120', tension: 0.3, pointRadius: 3, borderWidth: 2.5, fill: true }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', labels: { usePointStyle: true, padding: 12, font: { size: 12 } } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmt(ctx.parsed.y)}` } }
        },
        scales: {
          y: { title: { display: true, text: 'Amount (₹)' }, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { callback: amtTickCallback } },
          x: { grid: { display: false } }
        }
      }
    });
  }
}

/* ============================================================
   RENDER: MUTUAL FUNDS — ACTUAL VALUE SNAPSHOT CHARTS
   ============================================================ */
function renderMFCompareCharts(mfItems) {
  if (mfGrowthCompareChart) { mfGrowthCompareChart.destroy(); mfGrowthCompareChart = null; }
  if (mfInvVsCurChart)      { mfInvVsCurChart.destroy();      mfInvVsCurChart = null; }
  if (mfItems.length === 0) return;

  const rows = mfItems.map(inv => {
    const metrics = investmentMetrics(inv);
    return {
      inv,
      label: compactMutualFundName(inv),
      fullName: inv.name || inv.asset,
      invested: metrics.costBasis,
      current: metrics.currentValue,
    };
  }).sort((a, b) => b.current - a.current);
  const fundLabels = rows.map(row => row.label);
  const amtTickCallback = v => '₹' + (v >= 100000 ? (v/100000).toFixed(1) + 'L' : v >= 1000 ? (v/1000).toFixed(0) + 'K' : v);

  /* Chart 1: actual current value of each fund at its latest saved NAV */
  const growthCtx = document.getElementById('mfGrowthCompareChart')?.getContext('2d');
  if (growthCtx) {
    mfGrowthCompareChart = new Chart(growthCtx, {
      type: 'bar',
      data: {
        labels: fundLabels,
        datasets: [{
          label: 'Current Value',
          data: rows.map(row => row.current),
          backgroundColor: rows.map((_, i) => lineChartColors[i % lineChartColors.length] + 'CC'),
          borderColor: rows.map((_, i) => lineChartColors[i % lineChartColors.length]),
          borderWidth: 1.5,
          borderRadius: 5,
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: items => rows[items[0]?.dataIndex]?.fullName || '',
              label: ctx => ` Current Value: ${fmt(ctx.parsed.x)}`,
            }
          }
        },
        scales: {
          x: { title: { display: true, text: 'Current Value (₹)' }, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { callback: amtTickCallback }, beginAtZero: true },
          y: { grid: { display: false }, ticks: { autoSkip: false, font: { size: 11 } } }
        }
      }
    });
  }

  /* Chart 2: actual cost basis and current value for every fund */
  const ivcCtx = document.getElementById('mfInvVsCurChart')?.getContext('2d');
  if (ivcCtx) {
    mfInvVsCurChart = new Chart(ivcCtx, {
      type: 'bar',
      data: {
        labels: fundLabels,
        datasets: [
          { label: 'Invested', data: rows.map(row => row.invested), borderColor: '#8b5cf6', backgroundColor: '#8b5cf6B8', borderWidth: 1.5, borderRadius: 4 },
          { label: 'Current Value', data: rows.map(row => row.current), borderColor: '#06b6d4', backgroundColor: '#06b6d4B8', borderWidth: 1.5, borderRadius: 4 }
        ]
      },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', labels: { usePointStyle: true, padding: 12, font: { size: 12 } } },
          tooltip: {
            callbacks: {
              title: items => rows[items[0]?.dataIndex]?.fullName || '',
              label: ctx => ` ${ctx.dataset.label}: ${fmt(ctx.parsed.x)}`,
            }
          }
        },
        scales: {
          x: { title: { display: true, text: 'Amount (₹)' }, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { callback: amtTickCallback }, beginAtZero: true },
          y: { grid: { display: false }, ticks: { autoSkip: false, font: { size: 11 } } }
        }
      }
    });
  }
}


/* ============================================================
   RENDER: OTHER INVESTMENTS — DEDICATED SECTION
   ============================================================ */
let otherCategoryChart = null;

function renderOtherSection() {
  const items = investments.filter(i => otherCategories.includes(i.category));

  const totalInvested = items.reduce((s, i) => s + i.units * i.buyPrice, 0);
  const totalCurrent  = items.reduce((s, i) => s + i.units * i.currentPrice, 0);
  const totalGain     = totalCurrent - totalInvested;
  const returnPct     = totalInvested > 0 ? (totalGain / totalInvested * 100).toFixed(1) : '0.0';
  const isPos         = totalGain >= 0;

  /* Category split */
  const catBuckets = {};
  const catLabels  = { gold: '🥇 Gold', ppf: '🏛️ PPF', nps: '👴 NPS', fixed_deposit: '🏦 Fixed Deposit' };
  items.forEach(i => {
    catBuckets[i.category] = (catBuckets[i.category] || 0) + i.units * i.currentPrice;
  });

  const el = document.getElementById('otherInvSectionBody');
  if (!el) return;

  const summaryHTML = `
    <div class="cards-grid">
      <div class="summary-card invest-total">
        <div class="card-icon">💰</div>
        <div class="card-content">
          <span class="card-label">Total Invested</span>
          <span class="card-value">${fmt(totalInvested)}</span>
          <span class="card-change">Principal amount</span>
        </div>
      </div>
      <div class="summary-card invest-value">
        <div class="card-icon">📈</div>
        <div class="card-content">
          <span class="card-label">Current Value</span>
          <span class="card-value">${fmt(totalCurrent)}</span>
          <span class="card-change positive">Live valuation</span>
        </div>
      </div>
      <div class="summary-card invest-gain">
        <div class="card-icon">${isPos ? '✅' : '⚠️'}</div>
        <div class="card-content">
          <span class="card-label">Unrealized P&amp;L</span>
          <span class="card-value ${isPos ? 'gain-positive' : 'gain-negative'}">${isPos ? '+' : ''}${fmt(totalGain)}</span>
          <span class="card-change">${isPos ? '+' : ''}${returnPct}% return</span>
        </div>
      </div>
      <div class="summary-card invest-month">
        <div class="card-icon">📊</div>
        <div class="card-content">
          <span class="card-label">Holdings</span>
          <span class="card-value">${items.length}</span>
          <span class="card-change">Across ${Object.keys(catBuckets).length} categories</span>
        </div>
      </div>
    </div>
  `;

  const chartHTML = `
    <div class="charts-row">
      <div class="chart-card">
        <div class="chart-header">
          <h3>Category Breakdown</h3>
          <span class="chart-subtitle">By current value</span>
        </div>
        <div class="chart-container"><canvas id="otherCategoryChart"></canvas></div>
      </div>
    </div>
  `;

  const holdingsHTML = buildOtherPanel(items);

  el.innerHTML = summaryHTML + chartHTML +
    '<div class="table-card full-width" style="margin-top:8px;">' +
      '<div class="table-header">' +
        '<h3>All Holdings</h3>' +
        '<div class="table-header-actions">' +
          '<button class="btn-primary btn-sm" id="btnAddOtherHolding">+ Add Investment</button>' +
        '</div>' +
      '</div>' +
      holdingsHTML +
    '</div>';

  bindInvestmentActions(el);

  /* --- Wire add-investment button --- */
  document.getElementById('btnAddOtherHolding')?.addEventListener('click', () => openInvestmentModal('other'));

  /* Render chart */
  if (otherCategoryChart) { otherCategoryChart.destroy(); otherCategoryChart = null; }
  const ctx = document.getElementById('otherCategoryChart')?.getContext('2d');
  if (ctx) {
    const labels = Object.keys(catBuckets).map(k => catLabels[k] || k);
    const data   = Object.values(catBuckets);
    otherCategoryChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: ['#f59e0b', '#6366f1', '#3b82f6', '#10b981'],
          borderWidth: 2, borderColor: '#fff'
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '65%',
        plugins: {
          legend: { position: 'bottom', labels: { padding: 14, usePointStyle: true, font: { size: 12 } } },
          tooltip: { callbacks: { label: ctx2 => ' ' + ctx2.label + ': ' + fmt(ctx2.raw) } }
        }
      }
    });
  }
}


/* ============================================================
   DASHBOARD SUMMARY CARDS  (computed from live data)
   ============================================================ */
/** Get expenses for a specific month index + year */
function expensesForYM(mIdx, yr) {
  const ym = `${yr}-${String(mIdx + 1).padStart(2, '0')}`;
  return expenses.filter(e => e.date && e.date.startsWith(ym));
}

/** Get total investment BUY outflow for a specific month (from transactions embedded in investments) */
function investmentOutflowForYM(mIdx, yr) {
  const ym = `${yr}-${String(mIdx + 1).padStart(2, '0')}`;
  let total = 0;
  investments.forEach(inv => {
    (inv.transactions || []).forEach(tx => {
      if (tx.date && tx.date.startsWith(ym) && ['BUY', 'DEPOSIT'].includes(tx.action)
          && String(tx.source || 'connected').toLowerCase() !== 'opening') {
        total += tx.units * tx.price;
      }
    });
  });
  return total;
}

function incomeForYM(mIdx, yr) {
  const ym = `${yr}-${String(mIdx + 1).padStart(2, '0')}`;
  return incomeTransactions.filter(row => row.date && row.date.startsWith(ym))
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);
}

function dashboardPeriodRange() {
  const mode = document.getElementById('dashboardPeriod')?.value || 'fytd';
  const today = todayISO();
  if (mode === 'month') {
    const month = String(currentMonthIdx + 1).padStart(2, '0');
    const lastDay = new Date(currentYear, currentMonthIdx + 1, 0).getDate();
    return { start: `${currentYear}-${month}-01`, end: `${currentYear}-${month}-${lastDay}`, label: `${MONTHS[currentMonthIdx]} ${currentYear}` };
  }
  if (mode === 'year') return { start: `${currentYear}-01-01`, end: `${currentYear}-12-31`, label: `Calendar year ${currentYear}` };
  if (mode === 'all') return { start: '0000-01-01', end: '9999-12-31', label: 'All recorded activity' };
  if (mode === 'custom') {
    const start = document.getElementById('dashboardDateFrom')?.value || `${currentYear}-01-01`;
    const end = document.getElementById('dashboardDateTo')?.value || today;
    return { start: start <= end ? start : end, end: start <= end ? end : start, label: `${fmtDate(start <= end ? start : end)} - ${fmtDate(start <= end ? end : start)}` };
  }
  const now = new Date();
  const fyYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return { start: `${fyYear}-04-01`, end: today, label: `FY ${fyYear}-${String(fyYear + 1).slice(2)} to date` };
}

const dateInRange = (value, range) => Boolean(value && value >= range.start && value <= range.end);

function investmentOutflowForRange(range) {
  let total = 0;
  investments.forEach(inv => (inv.transactions || []).forEach(tx => {
    if (dateInRange(tx.date, range) && ['BUY', 'DEPOSIT'].includes(tx.action)
        && String(tx.source || 'connected').toLowerCase() !== 'opening') {
      total += Number(tx.units || 0) * Number(tx.price || 0);
    }
  }));
  return total;
}

function dashboardPeriodData() {
  const range = dashboardPeriodRange();
  const periodIncome = incomeTransactions.filter(row => dateInRange(row.date, range));
  const periodExpenses = expenses.filter(row => dateInRange(row.date, range));
  const income = periodIncome.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const spent = periodExpenses.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const invested = investmentOutflowForRange(range);
  const emergency = (emergencyFund.contributions || []).filter(row => dateInRange(row.date, range))
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);
  return { range, periodIncome, periodExpenses, income, spent, invested, emergency, surplus: income - spent - invested - emergency };
}

function currentNetWorth() {
  let total = 0;
  activeAccounts().forEach(account => {
    const balance = trackedAccountBalance(account);
    total += isLiabilityAccount(account) ? -balance : balance;
  });
  investments.filter(inv => !inv.containerAccountId).forEach(inv => {
    total += investmentMetrics(inv).currentValue;
  });
  return total;
}

function renderDashboardCards() {
  const data = dashboardPeriodData();
  const netWorth = currentNetWorth();
  const savingsRate = data.income > 0 ? data.surplus / data.income * 100 : 0;
  const expenseRate = data.income > 0 ? data.spent / data.income * 100 : 0;
  const investmentRate = data.income > 0 ? data.invested / data.income * 100 : 0;
  const setText = (id, value) => { const node = document.getElementById(id); if (node) node.textContent = value; };
  const setClass = (id, state) => { const node = document.getElementById(id); if (node) node.className = `card-change ${state}`; };

  setText('dashboardPeriodLabel', data.range.label);
  setText('dashWealth', fmt(netWorth));
  setText('dashIncome', fmt(data.income));
  setText('dashExpenses', fmt(data.spent));
  setText('dashInvested', fmt(data.invested));
  setText('dashSavings', fmt(data.surplus));
  setText('dashWealthChange', `As of today - ${activeAccounts().length} active accounts`);
  setText('dashIncomeChange', `${data.periodIncome.length} credit${data.periodIncome.length === 1 ? '' : 's'} in period`);
  setText('dashExpensesChange', `${expenseRate.toFixed(1)}% of income`);
  setText('dashInvestedChange', `${investmentRate.toFixed(1)}% of income - opening positions excluded`);
  setText('dashSavingsChange', `${savingsRate.toFixed(1)}% of income remains`);
  setClass('dashWealthChange', netWorth >= 0 ? 'positive' : 'negative');
  setClass('dashIncomeChange', data.income > 0 ? 'positive' : '');
  setClass('dashExpensesChange', '');
  setClass('dashInvestedChange', '');
  setClass('dashSavingsChange', data.surplus >= 0 ? 'positive' : 'negative');
}


/* ============================================================
   CHARTS  (Chart.js 4)
   ============================================================ */
// Chart palette
const PALETTE = ['#6366f1','#10b981','#f59e0b','#ef4444','#3b82f6','#ec4899','#06b6d4','#94a3b8'];

/* Track dashboard chart instances so we can destroy & recreate */
let chartExpense = null, chartIncomeSources = null, chartDashboardExpenseCategories = null,
  chartSavTrend = null, chartPortfolio = null, chartPerformance = null,
  chartSavHist = null, chartWealth = null, chartExpTrend = null, chartExpCatPie = null;

/** Build enriched month data: { month, income, expenses, invested, saved } for a given mIdx/yr */
function buildMonthData(mIdx, yr) {
  const row = savingsRowForMonth(mIdx, yr);
  const monthExpenses = expensesForYM(mIdx, yr).reduce((s, e) => s + e.amount, 0);
  const monthInvested = investmentOutflowForYM(mIdx, yr);
  const monthEF       = efContribForYM(mIdx, yr);
  const monthIncome   = incomeForYM(mIdx, yr);
  return {
    month: row?.month || `${MONTHS[mIdx].slice(0, 3)} ${yr}`,
    income: monthIncome,
    expenses: monthExpenses,
    invested: monthInvested,
    efContrib: monthEF,
    saved: monthIncome - monthExpenses - monthInvested - monthEF,
  };
}

function initCharts() {

  syncExpenseNatureControls();

  /* Destroy previous instances */
  [chartExpense, chartIncomeSources, chartDashboardExpenseCategories, chartSavTrend,
    chartPortfolio, chartPerformance, chartSavHist, chartWealth, chartExpTrend].forEach(c => { if (c) c.destroy(); });
  chartExpense = chartIncomeSources = chartDashboardExpenseCategories = chartSavTrend =
    chartPortfolio = chartPerformance = chartSavHist = chartWealth = chartExpTrend = null;

  /* ---- 1. Money allocation for the selected dashboard period ---- */
  const expCtx = document.getElementById('expenseChart')?.getContext('2d');
  if (expCtx) {
    const periodData = dashboardPeriodData();
    const periodLabel = periodData.range.label;
    const subtitleEl = document.getElementById('expenseChartSubtitle');
    if (subtitleEl) subtitleEl.textContent = periodLabel;
    const catTotals = {};
    periodData.periodExpenses.forEach(e => { catTotals[e.category] = (catTotals[e.category] || 0) + Number(e.amount || 0); });
    if (periodData.invested > 0) catTotals['_investments'] = periodData.invested;
    if (periodData.emergency > 0) catTotals['_emergency'] = periodData.emergency;
    const income = periodData.income;
    const totalAllocated = Object.values(catTotals).reduce((a, b) => a + b, 0);
    const unallocated = Math.max(0, income - totalAllocated);
    if (unallocated > 0) catTotals['_unallocated'] = unallocated;
    const labelMap = { ...Object.fromEntries(Object.entries(categoryConfig).map(([k, v]) => [k, v.label])), _investments: 'Investments', _emergency: 'Emergency Fund', _unallocated: 'Unallocated' };
    const colorMap = { _investments: '#f59e0b', _emergency: '#8b5cf6', _unallocated: '#10b981' };
    const keys   = Object.keys(catTotals);
    const labels = keys.map(k => labelMap[k] || k);
    const data   = Object.values(catTotals);
    const colors = keys.map((k, i) => colorMap[k] || PALETTE[i % PALETTE.length]);
    const total  = data.reduce((a, b) => a + b, 0);
    const hasBreakdownData = total > 0;

    chartExpense = new Chart(expCtx, {
      type: 'doughnut',
      data: {
        labels: hasBreakdownData ? labels : ['No activity'],
        datasets: [{
          data: hasBreakdownData ? data : [1],
          backgroundColor: hasBreakdownData ? colors : ['#e2e8f0'],
          borderWidth: 2, borderColor: '#fff', hoverOffset: hasBreakdownData ? 6 : 0,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: hasBreakdownData,
            callbacks: {
              label: ctx => {
                const pctOfTotal = (ctx.raw / total * 100).toFixed(1);
                const incomeContext = income > 0
                  ? ` · ${(ctx.raw / income * 100).toFixed(1)}% of income`
                  : ' · income not recorded';
                return ` ${ctx.label}: ${fmt(ctx.raw)}  (${pctOfTotal}% of allocation${incomeContext})`;
              },
            },
          },
        },
        cutout: '64%',
      },
    });

    // The legend always shows allocation share, even when period income is zero.
    const legendEl = document.getElementById('expenseLegend');
    if (legendEl) {
      if (!hasBreakdownData) {
        legendEl.innerHTML = `<div class="chart-empty-message">No income or transactions recorded for ${periodLabel}.</div>`;
      } else legendEl.innerHTML = keys.map((k, i) => {
        const lbl = labelMap[k] || k;
        const pct = (catTotals[k] / total * 100).toFixed(1);
        return `<div class="legend-item">
          <div class="legend-dot" style="background:${colors[i]}"></div>
          <span>${lbl} <small style="color:#94a3b8">(${pct}%)</small></span>
        </div>`;
      }).join('');
    }
  }

  /* ---- 2. Income received by source ---- */
  const incomeSourceCtx = document.getElementById('incomeSourceChart')?.getContext('2d');
  if (incomeSourceCtx) {
    const periodData = dashboardPeriodData();
    const sourceTotals = {};
    periodData.periodIncome.forEach(row => {
      const source = String(row.source || 'other').toLowerCase();
      sourceTotals[source] = (sourceTotals[source] || 0) + Number(row.amount || 0);
    });
    const keys = Object.keys(sourceTotals);
    const hasData = keys.length > 0;
    const colors = keys.map((_, index) => PALETTE[index % PALETTE.length]);
    chartIncomeSources = new Chart(incomeSourceCtx, {
      type: 'doughnut',
      data: {
        labels: hasData ? keys.map(incomeSourceLabel) : ['No income'],
        datasets: [{
          data: hasData ? keys.map(key => sourceTotals[key]) : [1],
          backgroundColor: hasData ? colors : ['#e2e8f0'],
          borderColor: '#fff', borderWidth: 2,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '64%',
        plugins: {
          legend: { display: false },
          tooltip: { enabled: hasData, callbacks: { label: ctx => ` ${ctx.label}: ${fmt(ctx.raw)}` } },
        },
      },
    });
    const legend = document.getElementById('incomeSourceLegend');
    if (legend) legend.innerHTML = hasData ? keys.map((key, index) => `
      <div class="legend-item"><div class="legend-dot" style="background:${colors[index]}"></div>
      <span>${incomeSourceLabel(key)} <small style="color:#94a3b8">${fmt(sourceTotals[key])}</small></span></div>`).join('')
      : '<div class="chart-empty-message">Add an income credit to see source totals.</div>';
  }

  /* ---- 3. Monthly money flow — last 12 months ending at selected month ---- */
  const savCtx = document.getElementById('savingsChart')?.getContext('2d');
  if (savCtx) {
    const last12 = [];
    for (let offset = 11; offset >= 0; offset--) {
      let mI = currentMonthIdx - offset;
      let yr = currentYear;
      while (mI < 0) { mI += 12; yr--; }
      last12.push(buildMonthData(mI, yr));
    }
    chartSavTrend = new Chart(savCtx, {
      type: 'bar',
      data: {
        labels: last12.map(r => r.month),
        datasets: [
          { label: 'Income', data: last12.map(r => r.income), backgroundColor: '#10b981', borderRadius: 4 },
          { label: 'Expenses', data: last12.map(r => r.expenses), backgroundColor: '#ef4444', borderRadius: 4 },
          { label: 'Invested', data: last12.map(r => r.invested), backgroundColor: '#f59e0b', borderRadius: 4 },
          { label: 'Surplus', data: last12.map(r => r.saved), type: 'line', borderColor: '#6366f1', backgroundColor: '#6366f1', tension: 0.3, pointRadius: 3, borderWidth: 2 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 12 } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmt(ctx.raw)}` } },
        },
        scales: {
          y: { grid: { color: '#f1f5f9' }, ticks: { callback: v => '₹' + (v / 1000).toFixed(0) + 'k' } },
          x: { grid: { display: false } },
        },
      },
    });
  }

  /* ---- 3. Portfolio Allocation (donut) ---- */
  const portCtx = document.getElementById('portfolioChart')?.getContext('2d');
  if (portCtx) {
    const typeTotals = {};
    investments.forEach(inv => {
      const val = investmentMetrics(inv).currentValue;
      typeTotals[inv.category] = (typeTotals[inv.category] || 0) + val;
    });
    chartPortfolio = new Chart(portCtx, {
      type: 'doughnut',
      data: {
        labels: Object.keys(typeTotals).map(k => typeLabels[k] || k),
        datasets: [{ data: Object.values(typeTotals), backgroundColor: PALETTE, borderWidth: 2, borderColor: '#fff', hoverOffset: 6 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { font: { size: 11 }, boxWidth: 12 } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${fmt(ctx.raw)}` } },
        },
        cutout: '58%',
      },
    });
  }

  /* ---- 4. Portfolio Performance (Invested vs Current Value) — 12 months ending at selected ---- */
  const perfCtx = document.getElementById('performanceChart')?.getContext('2d');
  if (perfCtx) {
    const selEnd = new Date(currentYear, currentMonthIdx + 1, 0); // last day of selected month
    const monthLabels = [];
    const investedData = [];
    const currentData  = [];

    for (let m = 11; m >= 0; m--) {
      const d = new Date(currentYear, currentMonthIdx - m, 1);
      const label = d.toLocaleString('default', { month: 'short', year: '2-digit' });
      const cutoff = new Date(d.getFullYear(), d.getMonth() + 1, 0);

      let invested = 0, current = 0;
      investments.forEach(inv => {
        const metrics = investmentMetrics(inv, cutoff);
        invested += metrics.costBasis;
        current += metrics.currentValue;
      });

      monthLabels.push(label);
      investedData.push(invested);
      currentData.push(current);
    }

    chartPerformance = new Chart(perfCtx, {
      type: 'line',
      data: {
        labels: monthLabels,
        datasets: [
          {
            label: 'Invested', data: investedData,
            borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.08)',
            fill: true, tension: 0.4, pointBackgroundColor: '#6366f1', pointRadius: 3,
            borderWidth: 2,
          },
          {
            label: 'Current Value', data: currentData,
            borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.08)',
            fill: true, tension: 0.4, pointBackgroundColor: '#10b981', pointRadius: 3,
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { font: { size: 11 }, boxWidth: 14, usePointStyle: true } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmt(ctx.raw)}` } },
        },
        scales: {
          y: { grid: { color: '#f1f5f9' }, ticks: { callback: v => '₹' + (v / 1000).toFixed(0) + 'k' } },
          x: { grid: { display: false } },
        },
      },
    });
  }

  /* ---- 5. Monthly Allocation (100% stacked bar + income line on 2nd axis) ---- */
  const savHistCtx = document.getElementById('savingsHistoryChart')?.getContext('2d');
  if (savHistCtx) {
    const last12 = [];
    for (let offset = 11; offset >= 0; offset--) {
      let mI = currentMonthIdx - offset;
      let yr = currentYear;
      while (mI < 0) { mI += 12; yr--; }
      const md = buildMonthData(mI, yr);
      if (md) last12.push(md);
    }
    /* Compute percentages of income for each bucket */
    const pctOf = (val, inc) => inc > 0 ? +(val / inc * 100).toFixed(1) : 0;
    const expPct   = last12.map(r => pctOf(r.expenses, r.income));
    const invPct   = last12.map(r => pctOf(r.invested, r.income));
    const efPct    = last12.map(r => pctOf(r.efContrib, r.income));
    const unallPct = last12.map(r => pctOf(Math.max(0, r.saved), r.income));

    chartSavHist = new Chart(savHistCtx, {
      type: 'bar',
      data: {
        labels: last12.map(r => r.month.replace(' 20', " '")),
        datasets: [
          {
            label: 'Expenses %', data: expPct,
            backgroundColor: 'rgba(239,68,68,0.8)', borderRadius: 2,
            yAxisID: 'y', stack: 'pct', order: 2,
          },
          {
            label: 'Invested %', data: invPct,
            backgroundColor: 'rgba(245,158,11,0.8)', borderRadius: 2,
            yAxisID: 'y', stack: 'pct', order: 2,
          },
          {
            label: 'Emergency %', data: efPct,
            backgroundColor: 'rgba(139,92,246,0.7)', borderRadius: 2,
            yAxisID: 'y', stack: 'pct', order: 2,
          },
          {
            label: 'Unallocated %', data: unallPct,
            backgroundColor: 'rgba(16,185,129,0.65)', borderRadius: 2,
            yAxisID: 'y', stack: 'pct', order: 2,
          },
          {
            label: 'Income', data: last12.map(r => r.income),
            type: 'line', yAxisID: 'y1',
            borderColor: '#6366f1', backgroundColor: 'transparent',
            tension: 0.4, pointRadius: 4, borderWidth: 2.5, pointBackgroundColor: '#6366f1', order: 0,
          },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', labels: { font: { size: 11 }, boxWidth: 14, usePointStyle: false } },
          tooltip: {
            callbacks: {
              label(ctx) {
                if (ctx.dataset.yAxisID === 'y1') return ` Income: ${fmt(ctx.raw)}`;
                const idx = ctx.dataIndex;
                const abs = ctx.dataset.label.includes('Expense') ? last12[idx].expenses
                          : ctx.dataset.label.includes('Invest')  ? last12[idx].invested
                          : ctx.dataset.label.includes('Emergency') ? last12[idx].efContrib
                          : Math.max(0, last12[idx].saved);
                return ` ${ctx.dataset.label.replace(' %', '')}: ${ctx.raw}% (${fmt(abs)})`;
              },
            },
          },
        },
        scales: {
          y: {
            stacked: true, position: 'left',
            max: 100, min: 0,
            grid: { color: '#f1f5f9' },
            ticks: { callback: v => v + '%', stepSize: 20 },
            title: { display: true, text: '% of Income', font: { size: 11 } },
          },
          y1: {
            position: 'right', grid: { drawOnChartArea: false },
            ticks: { callback: v => '₹' + (v / 1000).toFixed(0) + 'k' },
            title: { display: true, text: 'Income (₹)', font: { size: 11 } },
          },
          x: { stacked: true, grid: { display: false } },
        },
      },
    });
  }

  /* ---- Dashboard expense categories for the selected period ---- */
  const dashboardExpenseCtx = document.getElementById('dashboardExpenseCategoryChart')?.getContext('2d');
  if (dashboardExpenseCtx) {
    const periodData = dashboardPeriodData();
    const natureRows = periodData.periodExpenses.filter(row =>
      expenseChartNature === 'all' || getExpenseNature(row) === expenseChartNature
    );
    const totals = {};
    natureRows.forEach(row => {
      totals[row.category] = (totals[row.category] || 0) + Number(row.amount || 0);
    });
    const keys = Object.keys(totals).sort((a, b) => totals[b] - totals[a]);
    const natureLabel = expenseNatureLabels[expenseChartNature];
    const chartTotal = natureRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const fixedTotal = periodData.periodExpenses
      .filter(row => getExpenseNature(row) === 'fixed')
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const variableTotal = periodData.periodExpenses
      .filter(row => getExpenseNature(row) === 'variable')
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const title = document.getElementById('dashboardExpenseCategoryTitle');
    const subtitle = document.getElementById('dashboardExpenseCategorySubtitle');
    if (title) title.textContent = `${natureLabel} Expense Categories`;
    if (subtitle) subtitle.textContent = `${periodData.range.label} · ${fmt(chartTotal)}`;
    const fixedTotalEl = document.getElementById('dashboardFixedExpenses');
    const variableTotalEl = document.getElementById('dashboardVariableExpenses');
    if (fixedTotalEl) fixedTotalEl.textContent = fmt(fixedTotal);
    if (variableTotalEl) variableTotalEl.textContent = fmt(variableTotal);
    chartDashboardExpenseCategories = new Chart(dashboardExpenseCtx, {
      type: 'bar',
      data: {
        labels: keys.length
          ? keys.map(key => categoryConfig[key]?.label || key)
          : [`No ${natureLabel.toLowerCase()} expenses`],
        datasets: [{
          label: `${natureLabel} spending`, data: keys.length ? keys.map(key => totals[key]) : [0],
          backgroundColor: keys.length
            ? keys.map((_, index) => PALETTE[index % PALETTE.length])
            : ['#e2e8f0'],
          borderRadius: 5,
        }],
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { enabled: keys.length > 0, callbacks: { label: ctx => ` ${fmt(ctx.raw)}` } },
        },
        scales: {
          x: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { callback: value => '₹' + (value / 1000).toFixed(0) + 'k' } },
          y: { grid: { display: false } },
        },
        onClick: (_event, elements) => {
          if (!elements.length || !keys[elements[0].index]) return;
          expFilterCat = keys[elements[0].index];
          expFilterNature = expenseChartNature;
          document.querySelectorAll('.cat-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.category === expFilterCat);
          });
          syncExpenseNatureControls();
          navigateTo('expenses');
          renderExpensesTable();
        },
      },
    });
  }

  /* ---- Net-worth history from actual saved snapshots ---- */
  const wealthCtx = document.getElementById('wealthChart')?.getContext('2d');
  if (wealthCtx) {
    const snapshots = combinedNetWorthHistory();
    const snapshotsByMonth = new Map(snapshots.map(row => [String(row.month), row]));
    const wealthTimeline = [];
    for (let offset = 11; offset >= 0; offset--) {
      let monthIndex = currentMonthIdx - offset;
      let year = currentYear;
      while (monthIndex < 0) { monthIndex += 12; year--; }
      while (monthIndex > 11) { monthIndex -= 12; year++; }
      const month = `${MONTHS[monthIndex].slice(0, 3)} ${year}`;
      wealthTimeline.push({ month, snapshot: snapshotsByMonth.get(month) || null });
    }
    const firstRecordedIndex = wealthTimeline.findIndex(item => item.snapshot);
    const recordedCount = wealthTimeline.filter(item => item.snapshot).length;
    const isBaseline = recordedCount === 1;
    const timelineValue = getter => wealthTimeline.map((item, index) => {
      if (item.snapshot) return getter(item.snapshot);
      return firstRecordedIndex >= 0 && index < firstRecordedIndex ? 0 : null;
    });
    const wealthSubtitle = document.getElementById('wealthChartSubtitle');
    if (wealthSubtitle) {
      const firstMonth = firstRecordedIndex >= 0 ? wealthTimeline[firstRecordedIndex].month : '';
      wealthSubtitle.textContent = firstMonth
        ? `12-month view · zero baseline before tracking began in ${firstMonth}`
        : '12-month view · no net-worth snapshot recorded yet';
    }
    const wLabels = wealthTimeline.map(item => String(item.month).replace(' 20', " '"));
    const wNetWorthData = timelineValue(netWorthValue);
    const wAssets = timelineValue(row => ['cash', 'bank', 'investments', 'retirement', 'otherAssets']
      .reduce((sum, key) => sum + Number(row[key] || 0), 0));
    const wLiabilities = timelineValue(row => ['loans', 'creditCards', 'otherLiabilities']
      .reduce((sum, key) => sum + Number(row[key] || 0), 0));

    chartWealth = new Chart(wealthCtx, {
      type: 'line',
      data: {
        labels: wLabels,
        datasets: [
          {
            label: 'Assets', data: wAssets,
            borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.08)',
            fill: true, tension: 0.4, pointBackgroundColor: '#10b981',
            pointRadius: isBaseline ? 5 : 3, borderWidth: 2,
          },
          {
            label: 'Liabilities', data: wLiabilities,
            borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.08)',
            fill: true, tension: 0.4, pointBackgroundColor: '#ef4444',
            pointRadius: isBaseline ? 5 : 3, borderWidth: 2,
          },
          {
            label: 'Net Worth', data: wNetWorthData,
            borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.10)',
            fill: true, tension: 0.4, pointBackgroundColor: '#6366f1',
            pointRadius: isBaseline ? 6 : 3, borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', labels: { font: { size: 11 }, boxWidth: 14, usePointStyle: true } },
          tooltip: {
            callbacks: {
              label: ctx => {
                const beforeTracking = firstRecordedIndex >= 0 && ctx.dataIndex < firstRecordedIndex;
                return beforeTracking
                  ? ` ${ctx.dataset.label}: ${fmt(0)} (before tracking began)`
                  : ` ${ctx.dataset.label}: ${fmt(ctx.raw)}`;
              },
            },
          },
        },
        scales: {
          y: {
            grid: { color: '#f1f5f9' },
            ticks: { callback: v => '₹' + (v / 1000).toFixed(0) + 'k' },
            title: { display: true, text: 'Net Worth (₹)', font: { size: 11 } },
          },
          x: { grid: { display: false } },
        },
      },
    });
  }

  /* Update expense chart subtitle */
  const subEl = document.getElementById('expenseChartSubtitle');
  if (subEl) subEl.textContent = dashboardPeriodRange().label;

  /* ---- 7. Expense Trend (line + bar, last 12 months) ---- */
  const expTrendCtx = document.getElementById('expenseTrendChart')?.getContext('2d');
  if (expTrendCtx) {
    const etLabels = [], etTotals = [], etFixed = [], etVariable = [];
    const etCounts = [], etFixedCounts = [], etVariableCounts = [];
    for (let i = 11; i >= 0; i--) {
      let mI = currentMonthIdx - i, yr = currentYear;
      while (mI < 0)  { mI += 12; yr--; }
      while (mI > 11) { mI -= 12; yr++; }
      const label = `${MONTHS[mI].slice(0, 3)} ${String(yr).slice(2)}`;
      etLabels.push(label);
      const mExp = expensesForYM(mI, yr);
      etTotals.push(mExp.reduce((s, e) => s + e.amount, 0));
      etFixed.push(mExp.filter(e => getExpenseNature(e) === 'fixed').reduce((s, e) => s + e.amount, 0));
      etVariable.push(mExp.filter(e => getExpenseNature(e) === 'variable').reduce((s, e) => s + e.amount, 0));
      etCounts.push(mExp.length);
      etFixedCounts.push(mExp.filter(e => getExpenseNature(e) === 'fixed').length);
      etVariableCounts.push(mExp.filter(e => getExpenseNature(e) === 'variable').length);
    }
    const allBarDatasets = [
      {
        label: 'Fixed', data: etFixed, backgroundColor: '#8b5cf6CC', stack: 'nature',
        type: 'bar', order: 2, barPercentage: 0.7, categoryPercentage: 0.8,
      },
      {
        label: 'Variable', data: etVariable, backgroundColor: '#f59e0bCC', stack: 'nature',
        type: 'bar', order: 2, barPercentage: 0.7, categoryPercentage: 0.8,
      },
    ];
    const trendLine = (label, data, color, fill) => ({
      label,
      data,
      borderColor: color,
      backgroundColor: fill,
      borderWidth: 2.5,
      pointRadius: 4,
      pointBackgroundColor: color,
      tension: 0.3,
      fill: true,
      type: 'line',
      order: 1,
      yAxisID: 'y',
      stack: 'total',
    });
    const natureLabel = expenseNatureLabels[expenseChartNature];
    const selectedData = expenseChartNature === 'fixed' ? etFixed : etVariable;
    const selectedCounts = expenseChartNature === 'fixed' ? etFixedCounts
      : expenseChartNature === 'variable' ? etVariableCounts : etCounts;
    const selectedColor = expenseChartNature === 'fixed' ? '#8b5cf6' : '#f59e0b';
    const selectedFill = expenseChartNature === 'fixed'
      ? 'rgba(139,92,246,0.10)'
      : 'rgba(245,158,11,0.10)';
    const trendDatasets = expenseChartNature === 'all'
      ? [...allBarDatasets, trendLine('Total', etTotals, '#ef4444', 'rgba(239,68,68,0.08)')]
      : [trendLine(`${natureLabel} spending`, selectedData, selectedColor, selectedFill)];
    const title = document.getElementById('expenseTrendTitle');
    const subtitle = document.getElementById('expenseTrendSubtitle');
    if (title) title.textContent = expenseChartNature === 'all'
      ? 'All Expense Trend'
      : `${natureLabel} Expense Trend`;
    if (subtitle) subtitle.textContent = expenseChartNature === 'all'
      ? 'Fixed + variable spending — last 12 months'
      : `${natureLabel} spending — last 12 months`;
    chartExpTrend = new Chart(expTrendCtx, {
      data: {
        labels: etLabels,
        datasets: trendDatasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: true, position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } },
          tooltip: {
            callbacks: {
              label: ctx => `${ctx.dataset.label}: ${fmt(ctx.parsed.y)}`,
              footer: items => {
                const idx = items[0]?.dataIndex;
                return idx != null ? `${selectedCounts[idx]} transactions` : '';
              },
            },
          },
        },
        scales: {
          y: {
            stacked: expenseChartNature === 'all',
            ticks: { callback: v => v >= 1000 ? (v / 1000).toFixed(0) + 'K' : v },
            title: { display: true, text: 'Amount (\u20b9)' },
          },
          x: { stacked: expenseChartNature === 'all', grid: { display: false } },
        },
      },
    });
  }
}


/* Expense-only category breakdown for the Expenses section */
function renderExpenseCategoryBreakdown() {
  const ctx = document.getElementById('expCatPieChart')?.getContext('2d');
  const labelEl = document.getElementById('expCatBreakdownMonth');
  if (!ctx) return;

  if (chartExpCatPie) { chartExpCatPie.destroy(); chartExpCatPie = null; }

  /* Always use the month navigator so it stays synced */
  const monthExp = expensesForYM(currentMonthIdx, currentYear).filter(row =>
    expenseChartNature === 'all' || getExpenseNature(row) === expenseChartNature
  );

  const periodLabel = `${MONTHS[currentMonthIdx]} ${currentYear}`;
  const total = monthExp.reduce((s, e) => s + e.amount, 0);
  const natureLabel = expenseNatureLabels[expenseChartNature];
  const titleEl = document.getElementById('expenseCategorySplitTitle');
  if (titleEl) titleEl.textContent = expenseChartNature === 'all'
    ? 'All Spending by Category'
    : `${natureLabel} Spending by Category`;
  if (labelEl) labelEl.textContent = `${periodLabel} · ${fmt(total)}`;

  /* Aggregate by category */
  const catTotals = {};
  monthExp.forEach(e => { catTotals[e.category] = (catTotals[e.category] || 0) + e.amount; });
  const sorted = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);
  const catKeys = Object.keys(categoryConfig);

  const labels = sorted.map(([cat]) => {
    const cfg = categoryConfig[cat] || { icon: '📦', label: cat };
    return `${cfg.icon} ${cfg.label}`;
  });
  const data = sorted.map(([, amt]) => amt);
  const colors = sorted.map(([cat]) => PALETTE[catKeys.indexOf(cat)] || '#94a3b8');
  const hasData = total > 0;

  chartExpCatPie = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: hasData ? labels : [`No ${natureLabel.toLowerCase()} expenses`],
      datasets: [{
        data: hasData ? data : [1],
        backgroundColor: hasData ? colors : ['#e2e8f0'],
        borderWidth: 2,
        borderColor: '#fff',
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '55%',
      plugins: {
        legend: {
          position: 'right',
          labels: { boxWidth: 10, font: { size: 11 }, padding: 8 },
        },
        tooltip: {
          enabled: hasData,
          callbacks: {
            label: ctx => {
              const val = ctx.parsed;
              const pct = total > 0 ? (val / total * 100).toFixed(1) : '0.0';
              return ` ${ctx.label}: ${fmt(val)} (${pct}%)`;
            },
          },
        },
      },
    },
  });
}


/* ============================================================
   FINANCIAL PLANNING
   ============================================================ */
function planningMonthKey(mIdx = currentMonthIdx, yr = currentYear) {
  return `${MONTHS[mIdx].slice(0, 3)} ${yr}`;
}

function activeAccounts() {
  return accounts.filter(row => row.active !== false && String(row.active).toLowerCase() !== 'false');
}

function defaultAccountId(purpose) {
  return activeAccounts().find(row => row.purpose === purpose)?.id || null;
}

function accountName(accountId) {
  return accounts.find(row => Number(row.id) === Number(accountId))?.name || 'Unassigned';
}

const accountTypeLabels = {
  bank_savings: 'Savings Bank', bank_current: 'Current Bank', cash: 'Cash',
  credit_card: 'Credit Card', wallet: 'Wallet', store: 'Store Account',
  demat: 'Demat / Brokerage', mutual_fund: 'Mutual Fund', gold: 'Gold', ppf: 'PPF',
  nps: 'NPS', fixed_deposit: 'Fixed Deposit', loan: 'Loan', other: 'Other',
};

function isLiabilityAccount(account) {
  return account?.classification === 'liability'
    || ['credit_card', 'loan'].includes(account?.type);
}

function isInvestmentAccount(account) {
  return account?.classification === 'investment'
    || ['demat', 'mutual_fund', 'gold', 'ppf', 'nps', 'fixed_deposit'].includes(account?.type);
}

function investmentCategoriesForAccountType(type) {
  return {
    demat: ['stocks', 'foreign_stocks'],
    mutual_fund: ['mutual_funds'],
    gold: ['gold'],
    ppf: ['ppf'],
    nps: ['nps'],
    fixed_deposit: ['fixed_deposit'],
  }[type] || [];
}

function eligibleSettlementAccounts() {
  return activeAccounts().filter(account => !isInvestmentAccount(account) && !isLiabilityAccount(account));
}

function eligibleExpenseAccounts() {
  return activeAccounts().filter(account =>
    !isInvestmentAccount(account)
    && (!isLiabilityAccount(account) || account.type === 'credit_card')
  );
}

function linkedSettlementAccount(accountOrId) {
  const account = typeof accountOrId === 'object'
    ? accountOrId
    : accounts.find(row => Number(row.id) === Number(accountOrId));
  return accounts.find(row => Number(row.id) === Number(account?.settlementAccountId)) || null;
}

function brokerCashBalance(accountOrId) {
  const account = typeof accountOrId === 'object'
    ? accountOrId
    : accounts.find(row => Number(row.id) === Number(accountOrId));
  if (!account || account.type !== 'demat') return 0;
  const id = Number(account.id);
  const openingDate = String(account.openingDate || '');
  const included = value => !openingDate || !value || String(value) >= openingDate;
  let cash = Number(account.openingBalance || 0);
  transfers.forEach(row => {
    if (!included(row.date)) return;
    if (Number(row.fromAccountId) === id) cash -= Number(row.amount || 0);
    if (Number(row.toAccountId) === id) cash += Number(row.amount || 0);
  });
  investments.forEach(inv => (inv.transactions || []).forEach(tx => {
    const cashDate = transactionCashDate(tx);
    if (Number(tx.accountId) !== id || !included(cashDate)) return;
    const amount = transactionCashAmount(tx);
    if (['BUY', 'DEPOSIT'].includes(tx.action)) cash -= amount;
    if (['SELL', 'WITHDRAWAL'].includes(tx.action)) cash += amount;
  }));
  reconciliationAdjustments.forEach(row => {
    if (Number(row.accountId) === id && included(row.date)) cash += Number(row.amount || 0);
  });
  return Math.abs(cash) < 0.005 ? 0 : cash;
}

function updateAccountSettlementField() {
  const type = document.getElementById('accountType')?.value;
  const select = document.getElementById('accountSettlementAccount');
  if (!select) return;
  const visible = ['demat', 'mutual_fund'].includes(type);
  select.hidden = !visible;
  select.required = false;
  if (!visible) select.value = '';
}

function prepareBrokerCashWithdrawal(accountId) {
  const account = accounts.find(row => Number(row.id) === Number(accountId));
  const destination = linkedSettlementAccount(account);
  const cash = brokerCashBalance(account);
  if (!destination) {
    alert('Link a settlement bank before withdrawing broker cash.');
    openSettlementAccountModal(accountId);
    return;
  }
  if (cash <= 0.005) {
    alert('There is no available broker cash to withdraw.');
    return;
  }
  populateAccountSelectors();
  document.getElementById('transferDate').value = todayISO();
  document.getElementById('transferFrom').value = String(account.id);
  document.getElementById('transferTo').value = String(destination.id);
  document.getElementById('transferAmount').value = cash.toFixed(2);
  document.getElementById('transferNote').value = `${account.name} broker cash withdrawal`;
  document.getElementById('transfersCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.getElementById('transferAmount')?.focus({ preventScroll: true });
}

function populateAccountSelectors() {
  const configs = {
    incomeAccount: 'salary',
    expAccount: 'spending',
    invAccount: 'investment',
    tradeAccount: 'investment',
    accountTransactionAccount: 'investment',
    accountSettlementAccount: null,
    settlementBankAccount: null,
    transferFrom: null,
    transferTo: null,
    invContainerAccount: null,
  };
  Object.entries(configs).forEach(([id, preferredPurpose]) => {
    const select = document.getElementById(id);
    if (!select) return;
    const previous = select.value;
    const placeholder = id.startsWith('transfer')
      ? (id === 'transferFrom' ? 'From account' : 'To account')
      : ['accountSettlementAccount', 'settlementBankAccount'].includes(id)
        ? 'Select linked bank account'
      : (id === 'incomeAccount' ? 'Select credited account'
        : id === 'expAccount' ? 'Select paying account'
        : id === 'tradeAccount' ? 'Select settlement account'
          : 'Select funding account');
    const selectable = ['accountSettlementAccount', 'settlementBankAccount'].includes(id)
      ? eligibleSettlementAccounts()
      : id === 'invContainerAccount'
      ? activeAccounts().filter(isInvestmentAccount)
      : id === 'incomeAccount'
        ? activeAccounts().filter(account => !isInvestmentAccount(account) && !isLiabilityAccount(account))
        : id === 'expAccount'
          ? eligibleExpenseAccounts()
        : ['invAccount', 'tradeAccount', 'accountTransactionAccount'].includes(id)
          ? activeAccounts().filter(account => !isInvestmentAccount(account) && !isLiabilityAccount(account))
          : activeAccounts();
    select.innerHTML = `<option value="">${id === 'invContainerAccount' ? 'Select investment account' : placeholder}</option>` + selectable
      .map(row => `<option value="${row.id}">${escHtml(row.name)}${row.bank ? ` · ${escHtml(row.bank)}` : ''}</option>`)
      .join('');
    const preferred = previous || defaultAccountId(preferredPurpose);
    if (preferred) select.value = String(preferred);
  });
}

function trackedAccountBalance(account) {
  const id = Number(account.id);
  const liability = isLiabilityAccount(account);
  const openingDate = String(account.openingDate || '');
  const included = value => !openingDate || !value || String(value) >= openingDate;
  let balance = Number(account.openingBalance || 0);
  incomeTransactions.forEach(row => {
    if (Number(row.accountId) === id && included(row.date)) {
      balance += (liability ? -1 : 1) * Number(row.amount || 0);
    }
  });
  expenses.forEach(row => {
    if (Number(row.accountId) === id && included(row.date)) {
      balance += (liability ? 1 : -1) * Number(row.amount || 0);
    }
  });
  transfers.forEach(row => {
    if (!included(row.date)) return;
    if (Number(row.fromAccountId) === id) balance += (liability ? 1 : -1) * Number(row.amount || 0);
    if (Number(row.toAccountId) === id) balance += (liability ? -1 : 1) * Number(row.amount || 0);
  });
  investments.forEach(inv => (inv.transactions || []).forEach(tx => {
    const cashDate = transactionCashDate(tx);
    if (Number(tx.accountId) !== id || !included(cashDate)) return;
    const amount = transactionCashAmount(tx);
    if (['BUY', 'DEPOSIT'].includes(tx.action)) balance += (liability ? 1 : -1) * amount;
    if (['SELL', 'WITHDRAWAL'].includes(tx.action)) balance += (liability ? -1 : 1) * amount;
  }));
  if (isInvestmentAccount(account)) {
    investments.filter(inv => Number(inv.containerAccountId) === id).forEach(inv => {
      balance += investmentMetrics(inv).currentValue;
    });
  }
  reconciliationAdjustments.forEach(row => {
    if (Number(row.accountId) === id && included(row.date)) {
      balance += Number(row.amount || 0);
    }
  });
  return balance;
}

function accountLedgerEntries(accountId) {
  const id = Number(accountId);
  const accountForDate = accounts.find(row => Number(row.id) === id);
  const openingDate = String(accountForDate?.openingDate || '');
  const included = value => !openingDate || !value || String(value) >= openingDate;
  const entries = [];
  incomeTransactions.forEach(row => {
    if (Number(row.accountId) === id && Number(row.amount || 0) !== 0
        && included(row.date)) {
      entries.push({
        date: row.date,
        type: 'Income',
        description: row.description || incomeSourceLabel(row.source),
        amount: Number(row.amount || 0),
      });
    }
  });
  expenses.forEach(row => {
    if (Number(row.accountId) === id && included(row.date)) {
      entries.push({
        date: row.date,
        type: 'Expense',
        description: row.description || row.category || 'Expense',
        amount: -Number(row.amount || 0),
      });
    }
  });
  transfers.forEach(row => {
    if (!included(row.date)) return;
    if (Number(row.fromAccountId) === id) {
      entries.push({
        date: row.date,
        type: 'Transfer out',
        description: `To ${accountName(row.toAccountId)}${row.note ? ` · ${row.note}` : ''}`,
        amount: -Number(row.amount || 0),
      });
    }
    if (Number(row.toAccountId) === id) {
      entries.push({
        date: row.date,
        type: 'Transfer in',
        description: `From ${accountName(row.fromAccountId)}${row.note ? ` · ${row.note}` : ''}`,
        amount: Number(row.amount || 0),
      });
    }
  });
  investments.forEach(inv => (inv.transactions || []).forEach(tx => {
    const cashDate = transactionCashDate(tx);
    if (Number(tx.accountId) !== id || !included(cashDate)) return;
    const amount = transactionCashAmount(tx);
    if (['BUY', 'DEPOSIT'].includes(tx.action)) {
      entries.push({
        date: cashDate,
        type: 'Investment',
        description: `${tx.action === 'BUY' ? 'Bought' : 'Deposited to'} ${inv.name || inv.asset}`,
        amount: -amount,
      });
    }
    if (['SELL', 'WITHDRAWAL'].includes(tx.action)) {
      entries.push({
        date: cashDate,
        type: 'Investment return',
        description: `${tx.action === 'SELL' ? 'Sold' : 'Withdrew from'} ${inv.name || inv.asset}`,
        amount,
      });
    }
  }));
  investments.filter(inv => Number(inv.containerAccountId) === id)
    .forEach(inv => (inv.transactions || []).forEach(tx => {
      const opening = String(tx.source || '').toLowerCase() === 'opening';
      if (!included(tx.date) && !opening) return;
      const amount = Number(tx.units || 0) * Number(tx.price || 0);
      if (opening) {
        const openingDetail = tx.action === 'ADJUSTMENT'
          ? 'opening value adjustment'
          : tx.action === 'INTEREST' ? 'opening interest' : 'prior holding';
        entries.push({
          date: tx.date,
          type: 'Opening position',
          description: `${inv.name || inv.asset || 'Investment holding'} · ${openingDetail}`,
          amount,
        });
        return;
      }
      if (['BUY', 'DEPOSIT', 'INTEREST'].includes(tx.action)) {
        entries.push({
          date: tx.date,
          type: tx.action === 'INTEREST' ? 'Investment return' : 'Investment in',
          description: inv.name || inv.asset || 'Investment holding',
          amount,
        });
      }
      if (['SELL', 'WITHDRAWAL'].includes(tx.action)) {
        entries.push({
          date: tx.date,
          type: 'Investment out',
          description: inv.name || inv.asset || 'Investment holding',
          amount: -amount,
        });
      }
      if (tx.action === 'ADJUSTMENT') {
        entries.push({
          date: tx.date,
          type: 'Investment adjustment',
          description: inv.name || inv.asset || 'Investment holding',
          amount,
        });
      }
    }));
  const account = accountForDate;
  if (isLiabilityAccount(account)) {
    entries.forEach(entry => { entry.amount *= -1; });
  }
  reconciliationAdjustments.forEach(row => {
    if (Number(row.accountId) === id && included(row.date)) {
      entries.push({
        date: row.date,
        type: 'Reconciliation adjustment',
        description: row.reason || 'Balance correction',
        amount: Number(row.amount || 0),
      });
    }
  });
  return entries.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

function monthKeyToISO(month) {
  const match = String(month || '').match(/^([A-Za-z]{3})\s+(\d{4})$/);
  if (!match) return '';
  const monthIndex = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(match[1]);
  return monthIndex < 0 ? '' : `${match[2]}-${String(monthIndex + 1).padStart(2, '0')}-01`;
}

function numericValue(id) {
  return Number(document.getElementById(id)?.value || 0);
}

function currentBudgetRows() {
  const key = planningMonthKey();
  return budgets.filter(row => row.month === key);
}

function currentCashFlowRow() {
  return cashFlowSettings.find(row => row.month === planningMonthKey()) || null;
}

function netWorthValue(row) {
  if (!row) return 0;
  const assets = ['cash', 'bank', 'investments', 'retirement', 'otherAssets']
    .reduce((sum, key) => sum + Number(row[key] || 0), 0);
  const liabilities = ['loans', 'creditCards', 'otherLiabilities']
    .reduce((sum, key) => sum + Number(row[key] || 0), 0);
  return assets - liabilities;
}

const netWorthAmountFields = [
  'cash', 'bank', 'investments', 'retirement', 'otherAssets',
  'loans', 'creditCards', 'otherLiabilities',
];

function combinedNetWorthHistory() {
  const byMonth = new Map();
  automaticNetWorthHistory.forEach(row => {
    if (row?.month) byMonth.set(row.month, { ...row, snapshotSource: 'automatic' });
  });
  // A user-entered snapshot is an explicit override for the same month.
  netWorthHistory.forEach(row => {
    if (row?.month) byMonth.set(row.month, { ...row, snapshotSource: 'manual' });
  });
  return [...byMonth.values()].sort((a, b) =>
    monthKeyToISO(a.month).localeCompare(monthKeyToISO(b.month))
  );
}

function buildAutomaticNetWorthSnapshot() {
  const now = new Date();
  const snapshot = {
    month: `${MONTHS[now.getMonth()].slice(0, 3)} ${now.getFullYear()}`,
    asOf: todayISO(),
    cash: 0,
    bank: 0,
    investments: 0,
    retirement: 0,
    otherAssets: 0,
    loans: 0,
    creditCards: 0,
    otherLiabilities: 0,
  };

  activeAccounts().forEach(account => {
    const balance = trackedAccountBalance(account);
    if (isLiabilityAccount(account)) {
      if (account.type === 'credit_card') snapshot.creditCards += balance;
      else if (account.type === 'loan') snapshot.loans += balance;
      else snapshot.otherLiabilities += balance;
      return;
    }
    if (isInvestmentAccount(account)) {
      if (['ppf', 'nps'].includes(account.type)) snapshot.retirement += balance;
      else snapshot.investments += balance;
      return;
    }
    if (['cash', 'wallet'].includes(account.type)) snapshot.cash += balance;
    else if (['bank_savings', 'bank_current'].includes(account.type)) snapshot.bank += balance;
    else snapshot.otherAssets += balance;
  });

  // Holdings without a container account are not represented by an account,
  // so include them separately. Container-linked holdings are already in the
  // corresponding investment account balance.
  investments.filter(inv => !inv.containerAccountId).forEach(inv => {
    const value = investmentMetrics(inv).currentValue;
    if (['ppf', 'nps'].includes(inv.category)) snapshot.retirement += value;
    else snapshot.investments += value;
  });
  return snapshot;
}

function automaticSnapshotMatches(left, right) {
  return Boolean(left && right && left.month === right.month && left.asOf === right.asOf
    && netWorthAmountFields.every(key =>
      Math.abs(Number(left[key] || 0) - Number(right[key] || 0)) < 0.005
    ));
}

async function captureAutomaticNetWorthSnapshot(renderAfterSave = true) {
  if (!serverAvailable) return false;
  const snapshot = buildAutomaticNetWorthSnapshot();
  const index = automaticNetWorthHistory.findIndex(row => row.month === snapshot.month);
  const previous = index >= 0 ? { ...automaticNetWorthHistory[index] } : null;
  if (automaticSnapshotMatches(previous, snapshot)) return false;

  if (index >= 0) automaticNetWorthHistory[index] = snapshot;
  else automaticNetWorthHistory.push(snapshot);
  try {
    await saveAutomaticNetWorth();
    if (renderAfterSave) {
      renderNetWorthHistoryList();
      initCharts();
    }
    return true;
  } catch (error) {
    if (index >= 0) automaticNetWorthHistory[index] = previous;
    else automaticNetWorthHistory.pop();
    console.error('Automatic net-worth snapshot failed:', error);
    return false;
  }
}

let automaticNetWorthTimer = null;
function scheduleAutomaticNetWorthSnapshot() {
  if (!serverAvailable) return;
  clearTimeout(automaticNetWorthTimer);
  automaticNetWorthTimer = setTimeout(() => captureAutomaticNetWorthSnapshot(), 350);
}

function recurringRuleName(ruleId) {
  return recurringRules.find(rule => Number(rule.id) === Number(ruleId))?.name || 'Recurring investment';
}

function pendingRecurringOccurrences() {
  return recurringOccurrences
    .filter(row => String(row.status || '').toLowerCase() === 'pending')
    .sort((a, b) => String(a.scheduledDate).localeCompare(String(b.scheduledDate)));
}

async function generateRecurringOccurrences() {
  if (!serverAvailable) return;
  await apiPost('/recurring-occurrences/generate', {});
  recurringOccurrences = await apiGet('/recurring-occurrences');
  renderRecurringAutomation();
  renderDashboardActionItems();
}

function renderDashboardActionItems() {
  const count = pendingRecurringOccurrences().length;
  const text = document.getElementById('dashboardActionItemsText');
  const card = document.getElementById('dashboardActionItems');
  if (text) text.textContent = count
    ? `${count} recurring transaction${count === 1 ? '' : 's'} waiting for review.`
    : 'No pending recurring transactions.';
  if (card) card.classList.toggle('forecast-warning', count > 0);
}

function renderRecurringAutomation() {
  const investmentSelect = document.getElementById('recurringInvestment');
  if (investmentSelect) {
    const previous = investmentSelect.value;
    investmentSelect.innerHTML = '<option value="">Investment holding</option>'
      + investments.map(inv =>
        `<option value="${inv.id}">${escHtml(inv.name || inv.asset)} · ${escHtml(accountName(inv.containerAccountId))}</option>`
      ).join('');
    investmentSelect.value = previous;
  }
  const accountSelect = document.getElementById('recurringFromAccount');
  if (accountSelect) {
    const previous = accountSelect.value;
    accountSelect.innerHTML = '<option value="">Paid from account</option>'
      + activeAccounts().filter(account => !isInvestmentAccount(account) && !isLiabilityAccount(account)).map(account =>
        `<option value="${account.id}">${escHtml(account.name)}</option>`
      ).join('');
    accountSelect.value = previous || String(defaultAccountId('investment') || '');
  }
  const ruleList = document.getElementById('recurringRuleList');
  if (ruleList) {
    ruleList.innerHTML = recurringRules.length ? recurringRules.map(rule => {
      const inv = investments.find(item => Number(item.id) === Number(rule.investmentId));
      const active = rule.active !== false && String(rule.active).toLowerCase() !== 'false';
      return `<div class="planning-row simple">
        <div><strong>${escHtml(rule.name)}</strong>
          <span>${escHtml(inv?.name || 'Missing holding')} · ${rule.frequency} on day ${rule.day} · ${fmt(rule.amount)}</span></div>
        <button class="btn-secondary compact-btn" data-recurring-toggle="${rule.id}" type="button">${active ? 'Pause' : 'Resume'}</button>
      </div>`;
    }).join('') : '<p class="planning-empty">No recurring investment rules configured.</p>';
  }
  const pendingList = document.getElementById('recurringPendingList');
  if (pendingList) {
    const pending = pendingRecurringOccurrences();
    const pendingHeader = document.getElementById('recurringPendingHeader');
    if (pendingHeader) pendingHeader.style.display = pending.length ? '' : 'none';
    pendingList.style.display = pending.length ? 'grid' : 'none';
    pendingList.innerHTML = pending.length ? pending.map(row => {
      const rule = recurringRules.find(item => Number(item.id) === Number(row.ruleId));
      return `<div class="planning-row simple">
        <div><strong>${escHtml(recurringRuleName(row.ruleId))}</strong>
          <span>Due ${fmtDate(row.scheduledDate)} · ${fmt(Number(rule?.amount || 0))}</span></div>
        <button class="btn-primary compact-btn" data-recurring-confirm="${escHtml(row.id)}" type="button">Confirm</button>
        <button class="btn-secondary compact-btn" data-recurring-skip="${escHtml(row.id)}" type="button">Skip</button>
      </div>`;
    }).join('') : '';
  }
}

function emergencySourceKey(sourceType, sourceId) {
  return `${sourceType}:${Number(sourceId)}`;
}

function emergencySourceDetails(sourceType, sourceId) {
  const id = Number(sourceId);
  if (sourceType === 'account') {
    const account = accounts.find(row => Number(row.id) === id);
    if (!account) return null;
    return {
      sourceType: 'account', sourceId: id, source: account,
      name: account.name,
      detail: `${accountTypeLabels[account.type] || 'Account'} · ${account.bank || 'Institution not specified'}`,
      value: Math.max(0, trackedAccountBalance(account)),
      defaultLiquidity: 'immediate',
    };
  }
  if (sourceType === 'investment') {
    const investment = investments.find(row => Number(row.id) === id);
    if (!investment) return null;
    return {
      sourceType: 'investment', sourceId: id, source: investment,
      name: investment.name || investment.asset,
      detail: `${typeLabels[investment.category] || investment.category} · ${accountName(investment.containerAccountId)}`,
      value: Math.max(0, investmentMetrics(investment).currentValue),
      defaultLiquidity: ['ppf', 'nps'].includes(investment.category) ? 'locked' : 'redeemable',
    };
  }
  return null;
}

function emergencyAllocationSummary() {
  const rows = emergencyAllocations.map(allocation => {
    const details = emergencySourceDetails(allocation.sourceType, allocation.sourceId);
    const sourceValue = Math.max(0, Number(details?.value || 0));
    const requested = allocation.allocationMode === 'full'
      ? sourceValue
      : Math.max(0, Number(allocation.amount || 0));
    const effective = Math.min(requested, sourceValue);
    return { ...allocation, details, sourceValue, requested, effective };
  });
  const totals = rows.reduce((result, row) => {
    if (row.liquidity === 'immediate') result.immediate += row.effective;
    else if (row.liquidity === 'redeemable') result.redeemable += row.effective;
    else result.locked += row.effective;
    return result;
  }, { immediate: 0, redeemable: 0, locked: 0 });
  const target = Math.max(0, Number(emergencyFund.target || 0));
  const liquid = totals.immediate + totals.redeemable;
  const counted = liquid + totals.locked;
  return {
    rows, ...totals, liquid, counted, target,
    designated: counted,
    gap: Math.max(0, target - counted),
    progress: target > 0 ? Math.min(100, counted / target * 100) : 0,
  };
}

const emergencyLiquidityLabels = {
  immediate: 'Available Now',
  redeemable: 'Needs Redemption',
  locked: 'Locked / Restricted',
};

function populateEmergencySourceSelect(editingId = 0) {
  const select = document.getElementById('emergencyAllocationSource');
  if (!select) return;
  const assigned = new Set(emergencyAllocations
    .filter(row => Number(row.id) !== Number(editingId))
    .map(row => emergencySourceKey(row.sourceType, row.sourceId)));
  const assetAccounts = activeAccounts()
    .filter(account => !isInvestmentAccount(account) && !isLiabilityAccount(account))
    .filter(account => !assigned.has(emergencySourceKey('account', account.id)));
  const holdings = investments
    .filter(investment => !assigned.has(emergencySourceKey('investment', investment.id)));
  const accountOptions = assetAccounts.map(account => {
    const details = emergencySourceDetails('account', account.id);
    return `<option value="account:${account.id}">${escHtml(details.name)} · ${fmt(details.value)}</option>`;
  }).join('');
  const investmentOptions = holdings.map(investment => {
    const details = emergencySourceDetails('investment', investment.id);
    return `<option value="investment:${investment.id}">${escHtml(details.name)} · ${fmt(details.value)}</option>`;
  }).join('');
  select.innerHTML = '<option value="">Select an existing asset</option>'
    + (accountOptions ? `<optgroup label="Cash and bank accounts">${accountOptions}</optgroup>` : '')
    + (investmentOptions ? `<optgroup label="Investment holdings">${investmentOptions}</optgroup>` : '');
}

function updateEmergencyAllocationMode() {
  const mode = document.getElementById('emergencyAllocationMode')?.value || 'full';
  const group = document.getElementById('emergencyAllocationAmountGroup');
  const input = document.getElementById('emergencyAllocationAmount');
  if (group) group.hidden = mode !== 'amount';
  if (input) input.required = mode === 'amount';
  updateEmergencyAllocationPreview();
}

function updateEmergencyAllocationPreview() {
  const preview = document.getElementById('emergencyAllocationPreview');
  const sourceValue = document.getElementById('emergencyAllocationSource')?.value || '';
  if (!preview || !sourceValue.includes(':')) {
    if (preview) preview.textContent = 'Select an asset to see its current value.';
    return;
  }
  const [sourceType, rawId] = sourceValue.split(':');
  const details = emergencySourceDetails(sourceType, Number(rawId));
  if (!details) {
    preview.textContent = 'This asset is no longer available.';
    return;
  }
  const mode = document.getElementById('emergencyAllocationMode')?.value || 'full';
  const requested = mode === 'full'
    ? details.value
    : Math.max(0, numericValue('emergencyAllocationAmount'));
  const effective = Math.min(requested, details.value);
  preview.innerHTML = `Current value: <strong>${fmt(details.value)}</strong> · Emergency allocation: <strong>${fmt(effective)}</strong>${requested > details.value ? ' · capped at current value' : ''}`;
}

function openEmergencyAllocationModal(allocationId = 0) {
  const allocation = emergencyAllocations.find(row => Number(row.id) === Number(allocationId));
  const form = document.getElementById('emergencyAllocationForm');
  if (!form) return;
  form.reset();
  document.getElementById('emergencyAllocationId').value = allocation?.id || '';
  document.getElementById('emergencyAllocationTitle').textContent = allocation
    ? 'Edit Emergency Allocation'
    : 'Allocate Emergency Asset';
  populateEmergencySourceSelect(allocation?.id || 0);
  if (allocation) {
    document.getElementById('emergencyAllocationSource').value =
      emergencySourceKey(allocation.sourceType, allocation.sourceId);
    document.getElementById('emergencyAllocationMode').value = allocation.allocationMode;
    document.getElementById('emergencyAllocationAmount').value = allocation.amount || '';
    document.getElementById('emergencyAllocationLiquidity').value = allocation.liquidity;
    document.getElementById('emergencyAllocationNote').value = allocation.note || '';
  }
  updateEmergencyAllocationMode();
  openModal('emergencyAllocationModal');
}

function renderEmergencyReserve() {
  const summary = emergencyAllocationSummary();
  const setText = (id, value) => {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
  };
  setText('emergencyReserveUsable', fmt(summary.counted));
  setText('emergencyReserveTarget', fmt(summary.target));
  setText('emergencyReserveGap', summary.gap > 0 ? fmt(summary.gap) : summary.target > 0 ? 'Funded' : fmt(0));
  setText('emergencyReserveImmediate', fmt(summary.immediate));
  setText('emergencyReserveRedeemable', fmt(summary.redeemable));
  setText('emergencyReserveLocked', fmt(summary.locked));
  const progress = document.getElementById('emergencyReserveProgress');
  if (progress) {
    progress.style.width = `${summary.progress}%`;
    progress.classList.toggle('complete', summary.target > 0 && summary.gap <= 0.005);
  }
  setText('emergencyReserveProgressText', summary.target > 0
    ? `${summary.progress.toFixed(0)}% funded · ${fmt(summary.gap)} remaining`
    : 'Set a target to measure progress');
  const targetInput = document.getElementById('emergencyTargetInput');
  if (targetInput && document.activeElement !== targetInput) {
    targetInput.value = summary.target || '';
  }
  const list = document.getElementById('emergencyAllocationList');
  if (!list) return;
  const legacyNotice = Number(emergencyFund.current || 0) > 0
    ? `<p class="planning-help reserve-legacy-note">Legacy contribution balance ${fmt(emergencyFund.current)} is preserved for history but is not counted until the real assets holding it are allocated here.</p>`
    : '';
  list.innerHTML = legacyNotice + (summary.rows.length ? summary.rows.map(row => {
    const details = row.details;
    const sourceName = details?.name || 'Missing asset';
    const sourceDetail = details?.detail || `${row.sourceType} ${row.sourceId}`;
    const amountLabel = row.allocationMode === 'full' ? 'Entire current value' : `Fixed at ${fmt(row.requested)}`;
    const capped = row.requested > row.sourceValue + 0.005;
    return `<div class="emergency-allocation-row">
      <div class="reserve-source-name"><strong>${escHtml(sourceName)}</strong><span>${escHtml(sourceDetail)}${row.note ? ` · ${escHtml(row.note)}` : ''}</span></div>
      <div class="reserve-row-value"><span>Current value</span><strong>${fmt(row.sourceValue)}</strong></div>
      <div class="reserve-row-value"><span>${escHtml(amountLabel)}</span><strong>${fmt(row.effective)}${capped ? ' capped' : ''}</strong></div>
      <span class="reserve-liquidity-badge reserve-liquidity-${row.liquidity}">${escHtml(emergencyLiquidityLabels[row.liquidity] || row.liquidity)}</span>
      <div class="reserve-row-actions">
        <button class="btn-secondary compact-btn" data-emergency-edit="${row.id}" type="button">Edit</button>
        <button class="planning-delete" data-emergency-delete="${row.id}" type="button" title="Remove allocation">×</button>
      </div>
    </div>`;
  }).join('') : '<p class="planning-empty">No assets allocated yet. Choose an existing bank balance, FD, mutual fund, or other holding.</p>');
}

function planningMetrics() {
  const rows = currentBudgetRows();
  const budgetTotal = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const spent = expensesForMonth().reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const today = new Date();
  const isCurrentCalendarMonth = currentMonthIdx === today.getMonth() && currentYear === today.getFullYear();
  const fromDay = isCurrentCalendarMonth ? today.getDate() : 1;
  const upcomingBills = recurringBills.filter(bill =>
    bill.active !== false && String(bill.active).toLowerCase() !== 'false' &&
    Number(bill.dueDay || 0) >= fromDay
  );
  const upcomingBillTotal = upcomingBills
    .filter(bill => bill.includedInBudget !== true && String(bill.includedInBudget).toLowerCase() !== 'true')
    .reduce((sum, bill) => sum + Number(bill.amount || 0), 0);
  const flow = currentCashFlowRow();
  const income = incomeForYM(currentMonthIdx, currentYear);
  const remainingBudget = Math.max(0, budgetTotal - spent);
  const forecast = flow
    ? Number(flow.openingBalance || 0) + Number(income) + Number(flow.otherIncome || 0)
      - remainingBudget - upcomingBillTotal
    : 0;
  const latestSnapshot = combinedNetWorthHistory().at(-1);
  const essentialCategories = new Set(['food', 'grocery', 'vegetables_fruits', 'travel', 'commute', 'housing', 'parents_fund', 'health', 'utilities']);
  let essentialTotal = 0;
  for (let offset = 0; offset < 3; offset++) {
    const date = new Date(currentYear, currentMonthIdx - offset, 1);
    essentialTotal += expensesForYM(date.getMonth(), date.getFullYear())
      .filter(row => essentialCategories.has(row.category))
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);
  }
  const essentialMonthlyAverage = essentialTotal / 3;
  const emergencyReserve = emergencyAllocationSummary();
  const emergencyCoverage = essentialMonthlyAverage > 0
    ? emergencyReserve.counted / essentialMonthlyAverage
    : null;
  return {
    rows, budgetTotal, spent, upcomingBills, upcomingBillTotal,
    remainingBudget, flow, forecast, latestSnapshot,
    netWorth: netWorthValue(latestSnapshot),
    emergencyCoverage, emergencyReserve,
  };
}

function renderFinancialSummary() {
  const text = document.getElementById('financialSummaryText');
  if (!text) return;
  const data = dashboardPeriodData();
  const messages = [];
  if (!data.income && !data.spent && !data.invested) {
    messages.push(`No financial activity is recorded for ${data.range.label}.`);
  } else {
    const rate = data.income > 0 ? data.surplus / data.income * 100 : 0;
    messages.push(`${data.range.label}: ${rate.toFixed(1)}% of income remains after recorded expenses and investments.`);
    if (data.surplus < 0) messages.push('The shortfall was funded from earlier balances or unrecorded income.');
  }
  text.textContent = messages.join(' ');
}

function renderNetWorthHistoryList() {
  const history = document.getElementById('netWorthHistory');
  if (!history) return;
  const recent = combinedNetWorthHistory().slice(-6).reverse();
  history.innerHTML = recent.length ? recent.map(row => {
    const detail = row.snapshotSource === 'manual'
      ? 'Manual snapshot'
      : `Automatic · as of ${row.asOf ? fmtDate(row.asOf) : row.month}`;
    return `<div class="planning-row simple">
      <div><strong>${escHtml(row.month)}</strong><span>${escHtml(detail)}</span></div>
      <strong>${fmt(netWorthValue(row))}</strong>
    </div>`;
  }).join('') : '<p class="planning-empty">No net-worth snapshots yet.</p>';
}

function renderPlanning() {
  const metrics = planningMetrics();
  const setText = (id, value) => {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
  };
  const accountTotals = activeAccounts().reduce((totals, account) => {
    const balance = trackedAccountBalance(account);
    if (isLiabilityAccount(account)) totals.liabilities += balance;
    else if (isInvestmentAccount(account)) totals.investments += balance;
    else totals.assets += balance;
    return totals;
  }, { assets: 0, investments: 0, liabilities: 0 });
  setText('accountAssetTotal', fmt(accountTotals.assets));
  setText('accountInvestmentTotal', fmt(accountTotals.investments));
  setText('accountLiabilityTotal', fmt(accountTotals.liabilities));
  setText('accountNetPosition', fmt(
    accountTotals.assets + accountTotals.investments - accountTotals.liabilities
  ));
  renderEmergencyReserve();
  renderRecurringAutomation();
  renderDashboardActionItems();
  setText('planBudgetUsed', metrics.budgetTotal > 0 ? `${(metrics.spent / metrics.budgetTotal * 100).toFixed(0)}%` : 'Not set');
  setText('planUpcomingBills', fmt(metrics.upcomingBillTotal));
  setText('planNetWorth', fmt(metrics.netWorth));
  setText('planForecast', metrics.flow ? fmt(metrics.forecast) : 'Not set');
  setText('planEmergencyCoverage', metrics.emergencyCoverage === null
    ? 'Not set'
    : `${metrics.emergencyCoverage.toFixed(1)} months`);
  populateAccountSelectors();

  const ledgerSelect = document.getElementById('ledgerAccountSelect');
  if (ledgerSelect) {
    const previous = ledgerSelect.value;
    ledgerSelect.innerHTML = activeAccounts()
      .map(row => `<option value="${row.id}">${escHtml(row.name)}</option>`).join('');
    const selectedId = activeAccounts().some(row => String(row.id) === previous)
      ? previous
      : String(defaultAccountId('investment') || activeAccounts()[0]?.id || '');
    ledgerSelect.value = selectedId;
    renderAccountLedger(selectedId);
  }

  const accountList = document.getElementById('accountList');
  if (accountList) {
    accountList.innerHTML = activeAccounts().length ? activeAccounts().map(account => {
      const tracked = trackedAccountBalance(account);
      const statement = Number(account.statementBalance || 0);
      const difference = statement - tracked;
      const liability = isLiabilityAccount(account);
      const supportsSettlement = ['demat', 'mutual_fund'].includes(account.type);
      const settlementAccount = linkedSettlementAccount(account);
      const brokerCash = brokerCashBalance(account);
      const balanceLabel = liability ? 'FinTrack-calculated amount owed' : 'FinTrack-calculated balance';
      const statementLabel = liability ? 'Current statement amount owed' : 'Current bank balance';
      return `<div class="planning-row">
        <div class="planning-row-main">
          <strong>${escHtml(account.name)}</strong>
          <span>${escHtml(accountTypeLabels[account.type] || 'Account')} · ${escHtml(account.bank || 'Institution not specified')} · ${escHtml(account.purpose)}</span>
          ${supportsSettlement ? `<span class="account-settlement-detail">Settlement bank: <strong>${escHtml(settlementAccount?.name || 'Not linked')}</strong>${account.type === 'demat' ? ` · Broker cash: <strong>${fmt(brokerCash)}</strong>` : ''}</span>` : ''}
        </div>
        <div class="account-balance-line">
          <div class="account-metric">
            <span>${balanceLabel}</span>
            <strong>${fmt(tracked)}</strong>
          </div>
          <div class="account-metric">
            <span>${statementLabel}</span>
            <strong>${fmt(statement)}</strong>
          </div>
          <div class="account-metric ${Math.abs(difference) < 0.01 ? 'gain-positive' : 'forecast-warning'}">
            <span>Unexplained gap</span>
            <strong>${fmt(Math.abs(difference))}</strong>
          </div>
        </div>
        ${supportsSettlement ? `<button class="btn-secondary compact-btn" data-account-settlement="${account.id}" type="button">${settlementAccount ? 'Change linked bank' : 'Link settlement bank'}</button>` : ''}
        ${account.type === 'demat' && brokerCash > 0.005 ? `<button class="btn-primary compact-btn" data-broker-withdraw="${account.id}" type="button">Withdraw ${fmt(brokerCash)}</button>` : ''}
        <button class="btn-secondary compact-btn" data-account-review="${account.id}" type="button">Review balance</button>
        <button class="planning-delete" data-account-id="${account.id}" title="Remove account">×</button>
      </div>`;
    }).join('') : '<p class="planning-empty">No accounts configured. Add labels such as Salary, Investment, and Spending.</p>';
  }

  const transferList = document.getElementById('transferList');
  if (transferList) {
    const period = document.getElementById('transferPeriodFilter')?.value || 'month';
    const fyStartYear = currentMonthIdx >= 3 ? currentYear : currentYear - 1;
    const periodStart = period === 'month'
      ? `${selectedYM()}-01`
      : period === 'year' ? `${currentYear}-01-01` : `${fyStartYear}-04-01`;
    const periodEnd = period === 'month'
      ? `${selectedYM()}-${new Date(currentYear, currentMonthIdx + 1, 0).getDate()}`
      : period === 'year' ? `${currentYear}-12-31` : `${fyStartYear + 1}-03-31`;
    const periodLabel = period === 'month'
      ? `${MONTHS[currentMonthIdx]} ${currentYear}`
      : period === 'year' ? `calendar year ${currentYear}` : `FY ${fyStartYear}-${String(fyStartYear + 1).slice(2)}`;
    const filteredTransfers = transfers
      .filter(row => row.date && row.date >= periodStart && row.date <= periodEnd)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)) || Number(b.id || 0) - Number(a.id || 0));
    const status = document.getElementById('transferFilterStatus');
    if (status) status.textContent = `Transfers are not income or expenses. Showing ${filteredTransfers.length} for ${periodLabel}.`;
    transferList.innerHTML = filteredTransfers.length ? filteredTransfers.map(row => `
      <div class="planning-row simple">
        <div><strong>${escHtml(accountName(row.fromAccountId))} → ${escHtml(accountName(row.toAccountId))}</strong>
          <span>${fmtDate(row.date)}${row.note ? ` · ${escHtml(row.note)}` : ''}</span></div>
        <strong>${fmt(Number(row.amount || 0))}</strong>
        <button class="planning-delete" data-transfer-id="${row.id}" title="Remove transfer">×</button>
      </div>`).join('') : `<p class="planning-empty">No internal transfers recorded for ${periodLabel}.</p>`;
  }

  const budgetList = document.getElementById('budgetList');
  if (budgetList) {
    budgetList.innerHTML = metrics.rows.length ? metrics.rows.map(row => {
      const spent = expensesForMonth().filter(e => e.category === row.category)
        .reduce((sum, e) => sum + Number(e.amount || 0), 0);
      const amount = Number(row.amount || 0);
      const pct = amount > 0 ? Math.min(100, spent / amount * 100) : 0;
      return `<div class="planning-row">
        <div class="planning-row-main"><strong>${categoryConfig[row.category]?.label || row.category}</strong><span>${fmt(spent)} of ${fmt(amount)}</span></div>
        <div class="budget-progress"><span style="width:${pct}%;background:${spent > amount ? '#ef4444' : pct >= 80 ? '#f59e0b' : '#10b981'}"></span></div>
        <button class="planning-delete" data-budget-category="${row.category}" title="Remove budget">×</button>
      </div>`;
    }).join('') : '<p class="planning-empty">No budgets set for this month.</p>';
  }

  const billList = document.getElementById('billList');
  if (billList) {
    const activeBills = recurringBills.filter(row => row.active !== false && String(row.active).toLowerCase() !== 'false');
    billList.innerHTML = activeBills.length ? activeBills
      .sort((a, b) => Number(a.dueDay) - Number(b.dueDay))
      .map(row => `<div class="planning-row simple">
        <div><strong>${escHtml(String(row.name || 'Bill'))}</strong><span>Due day ${Number(row.dueDay)} · ${row.category}${row.includedInBudget === true || String(row.includedInBudget).toLowerCase() === 'true' ? ' · covered by budget' : ''}</span></div>
        <strong>${fmt(Number(row.amount || 0))}</strong>
        <button class="planning-delete" data-bill-id="${row.id}" title="Remove bill">×</button>
      </div>`).join('') : '<p class="planning-empty">No recurring bills configured.</p>';
  }

  renderNetWorthHistoryList();

  const forecast = document.getElementById('cashFlowForecast');
  if (forecast) {
    forecast.innerHTML = metrics.flow ? `
      <div class="forecast-equation">
        <span>Opening cash <strong>${fmt(Number(metrics.flow.openingBalance || 0))}</strong></span>
        <span>Income + other <strong>+${fmt(incomeForYM(currentMonthIdx, currentYear) + Number(metrics.flow.otherIncome || 0))}</strong></span>
        <span>Remaining budget <strong>-${fmt(metrics.remainingBudget)}</strong></span>
        <span>Upcoming bills <strong>-${fmt(metrics.upcomingBillTotal)}</strong></span>
        <span class="${metrics.forecast < Number(metrics.flow.safetyBalance || 0) ? 'forecast-warning' : 'forecast-good'}">Projected balance <strong>${fmt(metrics.forecast)}</strong></span>
      </div>` : '<p class="planning-empty">Enter opening cash to create this month’s forecast.</p>';
  }

  const netWorthForm = document.getElementById('netWorthForm');
  const monthSnapshot = netWorthHistory.find(row => row.month === planningMonthKey())
    || automaticNetWorthHistory.find(row => row.month === planningMonthKey());
  if (netWorthForm && !netWorthForm.contains(document.activeElement)) {
    const snapshotInputs = {
      nwCash: 'cash', nwBank: 'bank', nwInvestments: 'investments',
      nwRetirement: 'retirement', nwOtherAssets: 'otherAssets', nwLoans: 'loans',
      nwCards: 'creditCards', nwOtherLiabilities: 'otherLiabilities',
    };
    Object.entries(snapshotInputs).forEach(([id, key]) => {
      const input = document.getElementById(id);
      if (input) input.value = monthSnapshot?.[key] || '';
    });
  }
  const cashForm = document.getElementById('cashFlowForm');
  if (cashForm && !cashForm.contains(document.activeElement)) {
    const fields = { cfOpening: 'openingBalance', cfOtherIncome: 'otherIncome', cfSafety: 'safetyBalance' };
    Object.entries(fields).forEach(([id, key]) => {
      const input = document.getElementById(id);
      if (input) input.value = metrics.flow?.[key] || '';
    });
  }
  renderFinancialSummary();
  scheduleAutomaticNetWorthSnapshot();
}

function renderAccountLedger(accountId) {
  const account = accounts.find(row => Number(row.id) === Number(accountId));
  const summary = document.getElementById('accountLedgerSummary');
  const list = document.getElementById('accountLedgerList');
  if (!summary || !list) return;
  if (!account) {
    summary.innerHTML = '';
    list.innerHTML = '<p class="planning-empty">Add an account to see its connected cash flow.</p>';
    return;
  }
  const period = document.getElementById('ledgerPeriodFilter')?.value || 'month';
  const typeFilter = document.getElementById('ledgerTypeFilter')?.value || 'all';
  const sortOrder = document.getElementById('ledgerSortOrder')?.value || 'desc';
  const search = (document.getElementById('ledgerSearch')?.value || '').trim().toLowerCase();
  const allEntries = accountLedgerEntries(account.id)
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  let runningBalance = Number(account.openingBalance || 0);
  allEntries.forEach(row => {
    runningBalance += Number(row.amount || 0);
    row.balanceAfter = runningBalance;
  });
  const monthStart = `${currentYear}-${String(currentMonthIdx + 1).padStart(2, '0')}-01`;
  const nextMonthIndex = (currentMonthIdx + 1) % 12;
  const nextMonthYear = currentMonthIdx === 11 ? currentYear + 1 : currentYear;
  const monthEnd = `${nextMonthYear}-${String(nextMonthIndex + 1).padStart(2, '0')}-01`;
  const financialYearStartYear = currentMonthIdx >= 3 ? currentYear : currentYear - 1;
  const fyStart = `${financialYearStartYear}-04-01`;
  const fyEnd = `${financialYearStartYear + 1}-04-01`;
  const entryGroup = row => {
    const type = String(row.type || '').toLowerCase();
    if (type.includes('income')) return 'income';
    if (type.includes('expense')) return 'expense';
    if (type.includes('transfer')) return 'transfer';
    if (type.includes('opening')) return 'opening';
    if (type.includes('adjustment')) return 'adjustment';
    return 'investment';
  };
  const visibleEntries = allEntries.filter(row => {
    const date = String(row.date || '');
    if (period === 'month' && !(date >= monthStart && date < monthEnd)) return false;
    if (period === 'fy' && !(date >= fyStart && date < fyEnd)) return false;
    if (typeFilter !== 'all' && entryGroup(row) !== typeFilter) return false;
    if (search && !`${row.type} ${row.description}`.toLowerCase().includes(search)) return false;
    return true;
  });
  const credits = visibleEntries.filter(row => row.amount > 0)
    .reduce((sum, row) => sum + row.amount, 0);
  const debits = visibleEntries.filter(row => row.amount < 0)
    .reduce((sum, row) => sum - row.amount, 0);
  const netMovement = credits - debits;
  summary.innerHTML = `
    <span><span>Money in</span><strong class="gain-positive">+${fmt(credits)}</strong></span>
    <span><span>Money out</span><strong class="gain-negative">-${fmt(debits)}</strong></span>
    <span><span>Net movement</span><strong class="${netMovement >= 0 ? 'gain-positive' : 'gain-negative'}">${netMovement >= 0 ? '+' : '-'}${fmt(Math.abs(netMovement))}</strong></span>
    <span><span>FinTrack balance</span><strong>${fmt(trackedAccountBalance(account))}</strong></span>`;
  const ordered = sortOrder === 'asc' ? visibleEntries : [...visibleEntries].reverse();
  list.innerHTML = ordered.length ? `
    <div class="ledger-table-wrap">
      <table class="data-table ledger-table">
        <thead><tr>
          <th>Date</th><th>Transaction</th><th>Details</th>
          <th>Money In</th><th>Money Out</th><th>Balance</th>
        </tr></thead>
        <tbody>${ordered.map(row => `<tr>
          <td>${fmtDate(row.date)}</td>
          <td><span class="ledger-type ledger-type-${entryGroup(row)}">${escHtml(row.type)}</span></td>
          <td>${escHtml(row.description)}</td>
          <td class="ledger-money gain-positive">${row.amount > 0 ? fmt(row.amount) : '—'}</td>
          <td class="ledger-money gain-negative">${row.amount < 0 ? fmt(-row.amount) : '—'}</td>
          <td class="ledger-money">${fmt(row.balanceAfter)}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>` : '<p class="planning-empty">No transactions match the selected filters.</p>';
}

let reconciliationAccountId = null;

function reconciliationAccount() {
  return accounts.find(row => Number(row.id) === Number(reconciliationAccountId));
}

function updateReconciliationPreview() {
  const account = reconciliationAccount();
  if (!account) return;
  const calculated = trackedAccountBalance(account);
  const actualInput = document.getElementById('reconcileStatementBalance');
  const actual = actualInput ? Number(actualInput.value || 0) : Number(account.statementBalance || 0);
  const gap = actual - calculated;
  document.getElementById('reconcileCalculated').textContent = fmt(calculated);
  document.getElementById('reconcileActual').textContent = fmt(actual);
  document.getElementById('reconcileGap').textContent = Math.abs(gap) < 0.01
    ? fmt(0)
    : `${fmt(Math.abs(gap))} ${gap > 0 ? 'missing from FinTrack' : 'extra in FinTrack'}`;

  const proposedDate = document.getElementById('reconcileOpeningDate')?.value;
  const proposedOpening = numericValue('reconcileOpeningBalance');
  const proposedAccount = { ...account, openingDate: proposedDate, openingBalance: proposedOpening };
  const proposedBalance = trackedAccountBalance(proposedAccount);
  const openingPreview = document.getElementById('openingPositionPreview');
  if (openingPreview) {
    openingPreview.textContent = `New FinTrack balance: ${fmt(proposedBalance)} · Remaining gap: ${fmt(Math.abs(actual - proposedBalance))}`;
  }
  const adjustment = numericValue('reconcileAdjustmentAmount');
  const adjustmentPreview = document.getElementById('adjustmentPreview');
  if (adjustmentPreview) {
    adjustmentPreview.textContent = `New FinTrack balance: ${fmt(calculated + adjustment)} · Remaining gap: ${fmt(Math.abs(actual - calculated - adjustment))}`;
  }
}

function openReconciliation(accountId) {
  const account = accounts.find(row => Number(row.id) === Number(accountId));
  if (!account) return;
  reconciliationAccountId = account.id;
  document.getElementById('reconcileAccountName').textContent = account.name;
  document.getElementById('reconcileStatementBalance').value = Number(account.statementBalance || 0);
  document.getElementById('reconcileOpeningDate').value = account.openingDate || todayISO();
  document.getElementById('reconcileOpeningBalance').value = Number(account.openingBalance || 0);
  document.getElementById('reconcileAdjustmentDate').value = todayISO();
  document.getElementById('reconcileAdjustmentAmount').value =
    (Number(account.statementBalance || 0) - trackedAccountBalance(account)).toFixed(2);
  document.getElementById('reconcileAdjustmentReason').value = '';
  updateReconciliationPreview();
  openModal('reconciliationModal');
}

function initPlanningEvents() {
  document.getElementById('addEmergencyAllocationBtn')?.addEventListener('click', () => {
    openEmergencyAllocationModal();
  });
  document.getElementById('emergencyAllocationMode')?.addEventListener('change', updateEmergencyAllocationMode);
  document.getElementById('emergencyAllocationAmount')?.addEventListener('input', updateEmergencyAllocationPreview);
  document.getElementById('emergencyAllocationSource')?.addEventListener('change', event => {
    const [sourceType, rawId] = String(event.target.value || '').split(':');
    const details = emergencySourceDetails(sourceType, Number(rawId));
    if (details) document.getElementById('emergencyAllocationLiquidity').value = details.defaultLiquidity;
    updateEmergencyAllocationPreview();
  });
  document.getElementById('emergencyTargetForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const target = numericValue('emergencyTargetInput');
    if (!Number.isFinite(target) || target < 0) return;
    const previousTarget = emergencyFund.target;
    const submitButton = event.submitter || event.target.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    emergencyFund.target = target;
    try {
      await saveEmergencyFund();
      emergencyFund = await apiGet('/emergency-fund');
      renderPlanning();
      showPriceToast('Emergency-fund target saved');
    } catch (error) {
      emergencyFund.target = previousTarget;
      renderEmergencyReserve();
      alert(`Emergency target was not saved.\n\n${error.message}`);
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
  document.getElementById('emergencyAllocationForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const sourceValue = document.getElementById('emergencyAllocationSource').value;
    const [sourceType, rawId] = String(sourceValue || '').split(':');
    const sourceId = Number(rawId);
    const details = emergencySourceDetails(sourceType, sourceId);
    const allocationMode = document.getElementById('emergencyAllocationMode').value;
    const amount = allocationMode === 'amount' ? numericValue('emergencyAllocationAmount') : 0;
    const liquidity = document.getElementById('emergencyAllocationLiquidity').value;
    if (!details || details.value <= 0) {
      alert('Choose an existing asset with a positive current value.');
      return;
    }
    if (allocationMode === 'amount' && (amount <= 0 || amount > details.value + 0.005)) {
      alert(`Enter an allocation between ${fmt(0.01)} and the current value of ${fmt(details.value)}.`);
      return;
    }
    const existingId = Number(document.getElementById('emergencyAllocationId').value || 0);
    const row = {
      id: existingId || Math.max(0, ...emergencyAllocations.map(item => Number(item.id || 0))) + 1,
      sourceType,
      sourceId,
      allocationMode,
      amount,
      liquidity,
      note: document.getElementById('emergencyAllocationNote').value.trim(),
      updatedAt: new Date().toISOString(),
    };
    const nextRows = existingId
      ? emergencyAllocations.map(item => Number(item.id) === existingId ? row : item)
      : [...emergencyAllocations, row];
    const submitButton = event.submitter || event.target.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    try {
      await saveEmergencyAllocations(nextRows);
      emergencyAllocations = await apiGet('/emergency-allocations');
      closeModal('emergencyAllocationModal');
      renderPlanning();
      showPriceToast('Emergency allocation saved');
    } catch (error) {
      alert(`Emergency allocation was not saved.\n\n${error.message}`);
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
  document.getElementById('emergencyAllocationList')?.addEventListener('click', async event => {
    const editId = Number(event.target.dataset.emergencyEdit || 0);
    if (editId) {
      openEmergencyAllocationModal(editId);
      return;
    }
    const deleteId = Number(event.target.dataset.emergencyDelete || 0);
    if (!deleteId) return;
    if (!confirm('Remove this emergency allocation? The underlying account or investment will not be changed.')) return;
    const nextRows = emergencyAllocations.filter(row => Number(row.id) !== deleteId);
    try {
      await saveEmergencyAllocations(nextRows);
      emergencyAllocations = await apiGet('/emergency-allocations');
      renderPlanning();
    } catch (error) {
      alert(`Emergency allocation was not removed.\n\n${error.message}`);
    }
  });
  document.getElementById('ledgerAccountSelect')?.addEventListener('change', event => {
    renderAccountLedger(event.target.value);
  });
  ['ledgerPeriodFilter', 'ledgerTypeFilter', 'ledgerSortOrder'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
      renderAccountLedger(document.getElementById('ledgerAccountSelect')?.value);
    });
  });
  document.getElementById('transferPeriodFilter')?.addEventListener('change', renderPlanning);
  document.getElementById('ledgerSearch')?.addEventListener('input', () => {
    renderAccountLedger(document.getElementById('ledgerAccountSelect')?.value);
  });
  ['reconcileStatementBalance', 'reconcileOpeningDate', 'reconcileOpeningBalance',
    'reconcileAdjustmentAmount'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', updateReconciliationPreview);
  });
  document.getElementById('statementBalanceForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const account = reconciliationAccount();
    if (!account) return;
    account.statementBalance = numericValue('reconcileStatementBalance');
    await saveAccounts();
    renderPlanning();
    document.getElementById('reconcileAdjustmentAmount').value =
      (Number(account.statementBalance || 0) - trackedAccountBalance(account)).toFixed(2);
    updateReconciliationPreview();
    showPriceToast('Current bank/card balance updated');
  });
  document.getElementById('openingPositionForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const account = reconciliationAccount();
    const openingDate = document.getElementById('reconcileOpeningDate').value;
    if (!account || !openingDate) return;
    account.openingDate = openingDate;
    account.openingBalance = numericValue('reconcileOpeningBalance');
    await saveAccounts();
    renderPlanning();
    document.getElementById('reconcileAdjustmentAmount').value =
      (Number(account.statementBalance || 0) - trackedAccountBalance(account)).toFixed(2);
    updateReconciliationPreview();
    showPriceToast('Tracking start position saved');
  });
  document.getElementById('reconciliationAdjustmentForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const account = reconciliationAccount();
    const date = document.getElementById('reconcileAdjustmentDate').value;
    const amount = numericValue('reconcileAdjustmentAmount');
    const reason = document.getElementById('reconcileAdjustmentReason').value.trim();
    if (!account || !date || !reason || amount === 0) return;
    reconciliationAdjustments.push({
      id: Date.now(),
      accountId: Number(account.id),
      date,
      amount,
      reason,
      createdAt: new Date().toISOString(),
    });
    await saveReconciliationAdjustments();
    event.target.reset();
    document.getElementById('reconcileAdjustmentDate').value = todayISO();
    renderPlanning();
    updateReconciliationPreview();
    showPriceToast('Reconciliation adjustment added');
  });
  document.getElementById('checkRecurringBtn')?.addEventListener('click', async () => {
    await generateRecurringOccurrences();
  });
  document.getElementById('recurringRuleForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    recurringRules.push({
      id: Math.max(0, ...recurringRules.map(row => Number(row.id || 0))) + 1,
      name: document.getElementById('recurringName').value.trim(),
      type: 'sip',
      frequency: document.getElementById('recurringFrequency').value,
      day: numericValue('recurringDay'),
      amount: numericValue('recurringAmount'),
      fromAccountId: Number(document.getElementById('recurringFromAccount').value),
      investmentId: Number(document.getElementById('recurringInvestment').value),
      startDate: document.getElementById('recurringStartDate').value,
      endDate: '',
      active: true,
    });
    await saveRecurringRules();
    event.target.reset();
    document.getElementById('recurringStartDate').value = todayISO();
    await generateRecurringOccurrences();
    renderPlanning();
  });
  document.getElementById('recurringAutomationCard')?.addEventListener('click', async event => {
    const toggleId = Number(event.target.dataset.recurringToggle);
    if (toggleId) {
      const rule = recurringRules.find(row => Number(row.id) === toggleId);
      if (!rule) return;
      rule.active = !(rule.active !== false && String(rule.active).toLowerCase() !== 'false');
      await saveRecurringRules();
      if (rule.active) await generateRecurringOccurrences();
      renderPlanning();
      return;
    }
    const skipId = event.target.dataset.recurringSkip;
    if (skipId) {
      await apiPost(`/recurring-occurrences/${encodeURIComponent(skipId)}/action`, { action: 'skip' });
      recurringOccurrences = await apiGet('/recurring-occurrences');
      renderPlanning();
      return;
    }
    const confirmId = event.target.dataset.recurringConfirm;
    if (!confirmId) return;
    const occurrence = recurringOccurrences.find(row => String(row.id) === confirmId);
    const rule = recurringRules.find(row => Number(row.id) === Number(occurrence?.ruleId));
    const inv = investments.find(row => Number(row.id) === Number(rule?.investmentId));
    if (!occurrence || !rule || !inv) return;
    const actualDate = prompt('Actual transaction date:', occurrence.scheduledDate);
    if (!actualDate) return;
    const amount = Number(prompt('Actual invested amount:', rule.amount));
    if (!Number.isFinite(amount) || amount <= 0) return;
    const isBalanceHolding = ['ppf', 'fixed_deposit'].includes(inv.category);
    const price = isBalanceHolding
      ? amount
      : Number(prompt('Actual NAV / purchase price:', inv.currentPrice || inv.buyPrice || 0));
    if (!Number.isFinite(price) || price <= 0) return;
    const units = isBalanceHolding
      ? 1
      : Number(prompt('Units allotted:', (amount / price).toFixed(6)));
    if (!Number.isFinite(units) || units <= 0) return;
    await apiPost(`/recurring-occurrences/${encodeURIComponent(confirmId)}/action`, {
      action: 'confirm', actualDate, actualAmount: amount, price, units,
    });
    [investments, recurringOccurrences] = await Promise.all([
      apiGet('/investments'), apiGet('/recurring-occurrences'),
    ]);
    renderAfterInvestmentChange();
  });
  document.getElementById('accountForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const accountType = document.getElementById('accountType').value;
    const classification = ['credit_card', 'loan'].includes(accountType)
      ? 'liability'
      : ['demat', 'mutual_fund', 'gold', 'ppf', 'nps', 'fixed_deposit'].includes(accountType)
        ? 'investment'
        : 'asset';
    const newAccount = {
      id: Math.max(0, ...accounts.map(row => Number(row.id || 0))) + 1,
      name: document.getElementById('accountName').value.trim(),
      bank: document.getElementById('accountBank').value.trim(),
      type: accountType,
      classification,
      purpose: document.getElementById('accountPurpose').value,
      currency: 'INR',
      openingDate: document.getElementById('accountOpeningDate').value,
      openingBalance: numericValue('accountOpeningBalance'),
      statementBalance: numericValue('accountStatementBalance'),
      creditLimit: numericValue('accountCreditLimit'),
      settlementAccountId: Number(document.getElementById('accountSettlementAccount').value) || null,
      includeNetWorth: true,
      active: true,
    };
    const compatibleCategories = investmentCategoriesForAccountType(accountType);
    const nextInvestments = investments.map(inv => {
      if (!inv.containerAccountId && compatibleCategories.includes(inv.category)) {
        return { ...inv, containerAccountId: newAccount.id };
      }
      return inv;
    });
    const linkedExistingHoldings = nextInvestments.some((inv, index) =>
      Number(inv.containerAccountId || 0) !== Number(investments[index]?.containerAccountId || 0)
    );
    const nextAccounts = [...accounts, newAccount];
    const submitButton = event.submitter || event.target.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    setAccountSaveStatus('Saving to data.xlsx…', 'saving');
    try {
      await saveAccounts(nextAccounts);
      const persistedAccounts = await apiGet('/accounts');
      const wasVerified = persistedAccounts.some(
        row => Number(row.id) === Number(newAccount.id)
      );
      if (!wasVerified) throw new Error('The account was not found after saving. Please try again.');
      accounts = persistedAccounts;

      if (linkedExistingHoldings) {
        try {
          await apiPost('/investments', nextInvestments);
          investments = await apiGet('/investments');
        } catch (linkError) {
          event.target.reset();
          document.getElementById('accountOpeningDate').value = todayISO();
          updateAccountSettlementField();
          setAccountSaveStatus(
            `${newAccount.name} was saved, but existing holdings were not linked: ${linkError.message}`,
            'error'
          );
          renderPlanning();
          alert(`Account saved, but existing holdings could not be linked.\n\n${linkError.message}`);
          return;
        }
      }

      event.target.reset();
      document.getElementById('accountOpeningDate').value = todayISO();
      updateAccountSettlementField();
      setAccountSaveStatus(`${newAccount.name} saved to data.xlsx.`, 'success');
      renderPlanning();
    } catch (error) {
      setAccountSaveStatus(`Not saved: ${error.message}`, 'error');
      alert(`Account was not saved.\n\n${error.message}`);
    } finally {
      if (submitButton) submitButton.disabled = !serverAvailable;
    }
  });

  document.getElementById('accountType')?.addEventListener('change', updateAccountSettlementField);

  document.getElementById('settlementAccountForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const accountId = Number(document.getElementById('settlementInvestmentAccountId').value);
    const settlementAccountId = Number(document.getElementById('settlementBankAccount').value);
    const account = accounts.find(row => Number(row.id) === accountId);
    if (!account || !settlementAccountId) return;
    const previous = account.settlementAccountId || null;
    account.settlementAccountId = settlementAccountId;
    const submitButton = event.submitter || event.target.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    try {
      await saveAccounts();
      accounts = await apiGet('/accounts');
      closeModal('settlementAccountModal');
      renderPlanning();
    } catch (error) {
      account.settlementAccountId = previous;
      alert(`Settlement account was not saved.\n\n${error.message}`);
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });

  document.getElementById('transferForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const fromAccountId = Number(document.getElementById('transferFrom').value);
    const toAccountId = Number(document.getElementById('transferTo').value);
    const amount = numericValue('transferAmount');
    if (!fromAccountId || !toAccountId || fromAccountId === toAccountId || amount <= 0) {
      alert('Choose two different accounts and enter a positive amount.');
      return;
    }
    const sourceAccount = accounts.find(row => Number(row.id) === fromAccountId);
    if (sourceAccount?.type === 'demat' && brokerCashBalance(sourceAccount) + 0.005 < amount) {
      alert(`${sourceAccount.name} has only ${fmt(Math.max(0, brokerCashBalance(sourceAccount)))} available as broker cash.`);
      return;
    }
    if (sourceAccount && !isLiabilityAccount(sourceAccount)
        && trackedAccountBalance(sourceAccount) < amount) {
      alert(`${sourceAccount.name} does not have enough tracked balance for this transfer.`);
      return;
    }
    transfers.push({
      id: Math.max(0, ...transfers.map(row => Number(row.id || 0))) + 1,
      date: document.getElementById('transferDate').value,
      fromAccountId,
      toAccountId,
      amount,
      note: document.getElementById('transferNote').value.trim(),
    });
    await saveTransfers();
    event.target.reset();
    document.getElementById('transferDate').value = todayISO();
    renderPlanning();
  });

  document.getElementById('budgetForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const category = document.getElementById('budgetCategory').value;
    const amount = numericValue('budgetAmount');
    if (!category || amount <= 0) return;
    const month = planningMonthKey();
    const existing = budgets.find(row => row.month === month && row.category === category);
    if (existing) existing.amount = amount;
    else budgets.push({ month, category, amount });
    await saveBudgets();
    event.target.reset();
    renderPlanning();
  });

  document.getElementById('billForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    recurringBills.push({
      id: Math.max(0, ...recurringBills.map(row => Number(row.id || 0))) + 1,
      name: document.getElementById('billName').value.trim(),
      category: document.getElementById('billCategory').value,
      amount: numericValue('billAmount'),
      dueDay: numericValue('billDueDay'),
      frequency: 'monthly',
      active: true,
      includedInBudget: document.getElementById('billIncludedInBudget').checked,
    });
    await saveRecurringBills();
    event.target.reset();
    renderPlanning();
  });

  document.getElementById('netWorthForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const snapshot = {
      month: planningMonthKey(), cash: numericValue('nwCash'), bank: numericValue('nwBank'),
      investments: numericValue('nwInvestments'), retirement: numericValue('nwRetirement'),
      otherAssets: numericValue('nwOtherAssets'), loans: numericValue('nwLoans'),
      creditCards: numericValue('nwCards'), otherLiabilities: numericValue('nwOtherLiabilities'),
    };
    const index = netWorthHistory.findIndex(row => row.month === snapshot.month);
    if (index >= 0) netWorthHistory[index] = snapshot;
    else netWorthHistory.push(snapshot);
    await saveNetWorth();
    renderPlanning();
    initCharts();
  });

  document.getElementById('cashFlowForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const row = {
      month: planningMonthKey(), openingBalance: numericValue('cfOpening'),
      otherIncome: numericValue('cfOtherIncome'), safetyBalance: numericValue('cfSafety'),
    };
    const index = cashFlowSettings.findIndex(item => item.month === row.month);
    if (index >= 0) cashFlowSettings[index] = row;
    else cashFlowSettings.push(row);
    await saveCashFlow();
    renderPlanning();
  });

  document.getElementById('budgetList')?.addEventListener('click', async event => {
    const category = event.target.dataset.budgetCategory;
    if (!category) return;
    budgets = budgets.filter(row => !(row.month === planningMonthKey() && row.category === category));
    await saveBudgets();
    renderPlanning();
  });

  document.getElementById('copyPreviousBudgetBtn')?.addEventListener('click', async () => {
    let previousMonth = currentMonthIdx - 1;
    let previousYear = currentYear;
    if (previousMonth < 0) { previousMonth = 11; previousYear--; }
    const previousKey = planningMonthKey(previousMonth, previousYear);
    const currentKey = planningMonthKey();
    const previousRows = budgets.filter(row => row.month === previousKey);
    if (!previousRows.length) {
      alert(`No budgets found for ${previousKey}.`);
      return;
    }
    budgets = budgets.filter(row => row.month !== currentKey);
    budgets.push(...previousRows.map(row => ({ ...row, month: currentKey })));
    await saveBudgets();
    renderPlanning();
  });

  document.getElementById('billList')?.addEventListener('click', async event => {
    const id = Number(event.target.dataset.billId);
    if (!id) return;
    recurringBills = recurringBills.filter(row => Number(row.id) !== id);
    await saveRecurringBills();
    renderPlanning();
  });

  document.getElementById('accountList')?.addEventListener('click', async event => {
    const settlementId = Number(event.target.dataset.accountSettlement);
    if (settlementId) {
      openSettlementAccountModal(settlementId);
      return;
    }
    const withdrawalId = Number(event.target.dataset.brokerWithdraw);
    if (withdrawalId) {
      prepareBrokerCashWithdrawal(withdrawalId);
      return;
    }
    const reviewId = Number(event.target.dataset.accountReview);
    if (reviewId) {
      openReconciliation(reviewId);
      return;
    }
    const id = Number(event.target.dataset.accountId);
    if (!id) return;
    const referenced = expenses.some(row => Number(row.accountId) === id)
      || incomeTransactions.some(row => Number(row.accountId) === id)
      || transfers.some(row => Number(row.fromAccountId) === id || Number(row.toAccountId) === id)
      || investments.some(inv => Number(inv.containerAccountId) === id
        || (inv.transactions || []).some(tx => Number(tx.accountId) === id))
      || accounts.some(row => Number(row.settlementAccountId) === id)
      || reconciliationAdjustments.some(row => Number(row.accountId) === id)
      || recurringRules.some(row => Number(row.fromAccountId) === id)
      || emergencyAllocations.some(row => row.sourceType === 'account' && Number(row.sourceId) === id);
    if (referenced) {
      alert('This account is used by existing records. Reassign them before removing it.');
      return;
    }
    accounts = accounts.filter(row => Number(row.id) !== id);
    await saveAccounts();
    renderPlanning();
  });

  document.getElementById('transferList')?.addEventListener('click', async event => {
    const id = Number(event.target.dataset.transferId);
    if (!id) return;
    transfers = transfers.filter(row => Number(row.id) !== id);
    await saveTransfers();
    renderPlanning();
  });
}


/* ============================================================
   MONTH NAVIGATION
   ============================================================ */
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];
let currentMonthIdx = new Date().getMonth();  // auto-detect current month
let currentYear     = new Date().getFullYear();

/** Return "YYYY-MM" for the currently selected month */
function selectedYM() {
  return `${currentYear}-${String(currentMonthIdx + 1).padStart(2, '0')}`;
}

/** Return expenses filtered to the selected month */
function expensesForMonth() {
  const ym = selectedYM();
  return expenses.filter(e => e.date && e.date.startsWith(ym));
}

/** Return the savingsHistory row whose month label matches, e.g. "Apr 2026" */
function savingsRowForMonth(mIdx, yr) {
  const short = MONTHS[mIdx].slice(0, 3); // "Jan", "Feb", etc.
  return savingsHistory.find(r => r.month && r.month.startsWith(short) && r.month.includes(String(yr)));
}

function updateMonthDisplay() {
  document.getElementById('currentMonth').textContent = `${MONTHS[currentMonthIdx]} ${currentYear}`;
}

/** Sync expense filter dropdowns to match the current month navigator.
 *  If user has chosen 'all', don't overwrite that choice. */
function syncExpFiltersToNav() {
  if (expFilterYear  !== 'all') expFilterYear  = String(currentYear);
  if (expFilterMonth !== 'all') expFilterMonth = String(currentMonthIdx + 1).padStart(2, '0');
}

/** Re-render all month-sensitive dashboard components */
function refreshDashboard() {
  syncExpFiltersToNav();
  renderRecentTransactions();
  renderDashboardCards();
  renderSavingsCards();
  renderIncomeTransactions();
  renderSavingsTable();
  renderExpensesTable();
  renderPlanning();
  initCharts();
}

document.getElementById('prevMonth')?.addEventListener('click', () => {
  currentMonthIdx--;
  if (currentMonthIdx < 0) { currentMonthIdx = 11; currentYear--; }
  updateMonthDisplay();
  refreshDashboard();
});

document.getElementById('nextMonth')?.addEventListener('click', () => {
  currentMonthIdx++;
  if (currentMonthIdx > 11) { currentMonthIdx = 0; currentYear++; }
  updateMonthDisplay();
  refreshDashboard();
});


/* ============================================================
   FORM SUBMISSIONS  (front-end only — appends to local array)
   ============================================================ */

function openIncomeModal() {
  const available = activeAccounts().filter(account => !isInvestmentAccount(account) && !isLiabilityAccount(account));
  if (!available.length) {
    alert('Add an active bank, cash, or wallet account before recording income.');
    navigateTo('planning');
    return;
  }
  populateAccountSelectors();
  const dateInput = document.getElementById('incomeDate');
  if (dateInput) dateInput.value = todayISO();
  openModal('incomeModal');
}

document.getElementById('btnAddIncome')?.addEventListener('click', openIncomeModal);
document.getElementById('btnAddIncomeFromSavings')?.addEventListener('click', openIncomeModal);
document.getElementById('dashIncome')?.addEventListener('click', openIncomeModal);

document.getElementById('dashboardPeriod')?.addEventListener('change', event => {
  const custom = event.target.value === 'custom';
  const fields = document.getElementById('dashboardCustomDates');
  if (fields) fields.hidden = !custom;
  renderDashboardCards();
  renderRecentTransactions();
  renderFinancialSummary();
  initCharts();
});

['dashboardDateFrom', 'dashboardDateTo'].forEach(id => {
  document.getElementById(id)?.addEventListener('change', () => {
    renderDashboardCards();
    renderRecentTransactions();
    renderFinancialSummary();
    initCharts();
  });
});

document.getElementById('incomeForm')?.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.target;
  incomeTransactions.push({
    id: Date.now(),
    date: form.date.value,
    source: form.source.value,
    description: form.description.value.trim(),
    amount: Number(form.amount.value),
    accountId: Number(form.accountId.value),
  });
  try {
    await saveIncomeTransactions();
    if (serverAvailable) savingsHistory = await apiGet('/savings-history');
    form.reset();
    closeModal('incomeModal');
    refreshDashboard();
  } catch (error) {
    incomeTransactions.pop();
    alert(`Income could not be saved: ${error.message}`);
  }
});

document.getElementById('expenseForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target;
  const isEditing = _editingExpenseId != null;
  setExpenseFormStatus();
  const previousExpenses = expenses.map(row => ({ ...row }));
  if (isEditing) {
    // Edit mode — update existing expense
    const exp = expenses.find(x => x.id === _editingExpenseId);
    if (exp) {
      exp.date        = form.date.value;
      exp.description = form.description.value.trim();
      exp.category    = form.category.value;
      exp.expenseNature = form.expenseNature.value;
      exp.payment     = form.payment.value;
      exp.amount      = parseFloat(form.amount.value);
      exp.accountId   = Number(form.accountId.value) || null;
    }
  } else {
    // Add mode — create new expense
    expenses.push({
      id:          Date.now(),
      date:        form.date.value,
      description: form.description.value.trim(),
      category:    form.category.value,
      expenseNature: form.expenseNature.value,
      payment:     form.payment.value,
      amount:      parseFloat(form.amount.value),
      accountId:   Number(form.accountId.value) || null,
    });
  }
  const submitButton = e.submitter || form.querySelector('button[type="submit"]');
  if (submitButton) submitButton.disabled = true;
  try {
    await saveExpenses();
    expenses = await apiGet('/expenses');
    refreshDashboard();
    if (isEditing) {
      closeModal('expenseModal');
    } else {
      form.reset();
      defaultBlankDateInputs(form);
      const accountSelect = form.elements.accountId;
      if (accountSelect) accountSelect.value = String(defaultAccountId('spending') || '');
      setExpenseFormStatus('Expense added successfully. You can add another expense or close this window.');
      form.elements.amount?.focus();
    }
  } catch (error) {
    expenses = previousExpenses;
    alert(`Expense was not saved.\n\n${error.message}`);
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
});

document.getElementById('investmentForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target;
  const cat  = form.type.value;
  const entryMode = form.querySelector('input[name="entryMode"]:checked')?.value || 'connected';
  const isPrior = entryMode === 'prior';
  const isBalanceAccount = balanceCategories.includes(cat);
  const buyPrice = parseFloat(form.buyPrice.value);
  const currentPrice = isBalanceAccount && !isPrior
    ? buyPrice
    : parseFloat(form.currentPrice.value);
  const inv  = {
    id:           Date.now(),
    asset:        form.asset.value.trim().toUpperCase(),
    name:         form.querySelector('#invName').value.trim() || form.asset.value.trim(),
    category:     cat,
    units:        isBalanceAccount ? 1 : parseFloat(form.units.value),
    buyPrice,
    currentPrice,
    date:         form.date.value,
    containerAccountId: Number(document.getElementById('invContainerAccount').value) || null,
    entryMode,
  };
  /* Auto-derive ticker from asset code for price lookups */
  const asset = inv.asset;
  if (cat === 'stocks') {
    inv.ticker = asset.includes('.') ? asset : asset + '.NS';    // default to NSE
  } else if (cat === 'foreign_stocks') {
    inv.ticker = asset;                                          // user enters full ticker e.g. AAPL
  }
  const scheme = form.querySelector('#invSchemeCode')?.value.trim();
  if (scheme) inv.schemeCode = scheme;

  if (isBalanceAccount) {
    const accountId = isPrior ? null : Number(document.getElementById('invAccount').value) || null;
    inv.transactions = [{
      date: inv.date, action: 'DEPOSIT', units: 1, price: inv.buyPrice, accountId,
      source: isPrior ? 'opening' : 'connected',
    }];
    const openingValueAdjustment = inv.currentPrice - inv.buyPrice;
    if (isPrior && Math.abs(openingValueAdjustment) >= 0.01) {
      inv.transactions.push({
        date: inv.date,
        action: cat === 'ppf' && openingValueAdjustment > 0 ? 'INTEREST' : 'ADJUSTMENT',
        units: 1, price: openingValueAdjustment,
        accountId: null, source: 'opening',
      });
    }
  } else {
    inv.transactions = [{
      date: inv.date, action: 'BUY', units: inv.units, price: inv.buyPrice,
      accountId: isPrior ? null : Number(document.getElementById('invAccount').value) || null,
      source: isPrior ? 'opening' : 'connected',
    }];
  }
  investments.push(inv);
  const submitButton = e.submitter || form.querySelector('button[type="submit"]');
  if (submitButton) submitButton.disabled = true;
  try {
    await saveInvestments();
    investments = await apiGet('/investments');
    renderAfterInvestmentChange();
    form.reset();
    closeModal('investmentModal');
  } catch (error) {
    investments = investments.filter(row => Number(row.id) !== Number(inv.id));
    alert(`Investment was not saved.\n\n${error.message}`);
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
});

document.getElementById('goalForm')?.addEventListener('submit', e => {
  e.preventDefault();
  const form = e.target;
  savingsGoals.push({
    id:       Date.now(),
    name:     form.name.value.trim(),
    icon:     form.icon.value,
    target:   parseFloat(form.target.value),
    current:  parseFloat(form.current.value) || 0,
    deadline: form.date.value,
  });
  saveSavingsGoals();
  renderGoals();
  renderDashboardCards();
  closeModal('goalModal');
});

/* Emergency Fund — add contribution form */
document.getElementById('emergencyFundForm')?.addEventListener('submit', e => {
  e.preventDefault();
  const form = e.target;
  const newContrib = {
    id:     Date.now(),
    date:   form.efContribDate.value,
    amount: parseFloat(form.efContribAmount.value) || 0,
    note:   form.efContribNote.value.trim(),
  };
  if (newContrib.amount <= 0) return;
  emergencyFund.contributions.push(newContrib);
  emergencyFund.current = emergencyFund.contributions.reduce((s, c) => s + c.amount, 0);
  saveEmergencyFund();
  renderEmergencyFund();
  renderDashboardCards();
  renderPlanning();
  initCharts();
  closeModal('emergencyFundModal');
});


/* ============================================================
   SECURITY: HTML ESCAPE HELPER
   Prevents XSS when rendering user-supplied text into the DOM.
   ============================================================ */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}


/* ============================================================
   DOCUMENTS BROWSER
   ============================================================ */
const DEFAULT_CAT_ICONS = {
  salary_slips: '📄', tax: '🧾', insurance: '🛡️',
  investments: '📈', bank_statements: '🏦',
};

function catLabel(key) {
  const icon = DEFAULT_CAT_ICONS[key] || '📁';
  const name = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return `${icon} ${name}`;
}

let docCurrentCat = null;
let docCurrentYear = String(new Date().getFullYear());

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

async function renderDocuments() {
  if (!serverAvailable) return;

  // Fetch categories/years if cache is empty, then always render tabs/years
  if (!Object.keys(docCategoriesCache).length) {
    await fetchDocCategories();
  }
  renderCategoryTabs();
  renderYearButtons();

  const titleEl = document.getElementById('docListTitle');
  const countEl = document.getElementById('docCount');
  const bodyEl  = document.getElementById('docListBody');
  if (!titleEl || !bodyEl) return;

  if (!docCurrentCat) {
    titleEl.textContent = 'No categories yet';
    bodyEl.innerHTML = '<p class="inv-panel-empty">Create a category to get started.</p>';
    if (countEl) countEl.textContent = '';
    return;
  }

  titleEl.textContent = `${catLabel(docCurrentCat)} — ${docCurrentYear}`;

  try {
    const files = await apiGet(`/documents/${docCurrentCat}/${docCurrentYear}`);
    countEl.textContent = `${files.length} file${files.length !== 1 ? 's' : ''}`;

    if (files.length === 0) {
      bodyEl.innerHTML = '<p class="inv-panel-empty">No documents yet. Upload files above.</p>';
      return;
    }

    bodyEl.innerHTML = `
      <table class="data-table">
        <thead><tr><th>File Name</th><th>Size</th><th>Modified</th><th>Actions</th></tr></thead>
        <tbody>
          ${files.map(f => {
            const url = `${API_BASE}/documents/${docCurrentCat}/${docCurrentYear}/${encodeURIComponent(f.name)}`;
            const viewable = /\.(pdf|png|jpe?g|gif|webp|svg|txt|csv)$/i.test(f.name);
            return `
            <tr>
              <td><strong>${escHtml(f.name)}</strong></td>
              <td>${formatFileSize(f.size)}</td>
              <td>${f.modified}</td>
              <td>
                ${viewable ? `<a href="${url}" class="action-btn" title="View" target="_blank">👁️</a>` : ''}
                <a href="${url}?download" class="action-btn" title="Download" download>📥</a>
                <button class="action-btn delete doc-delete-btn" title="Delete" data-name="${escHtml(f.name)}">🗑️</button>
              </td>
            </tr>
          `}).join('')}
        </tbody>
      </table>
    `;

    bodyEl.querySelectorAll('.doc-delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const name = btn.dataset.name;
        if (!confirm(`Delete "${name}"?`)) return;
        try {
          await fetch(`${API_BASE}/documents/${docCurrentCat}/${docCurrentYear}/${encodeURIComponent(name)}`, { method: 'DELETE' });
          renderDocuments();
        } catch (e) { console.error('Delete failed:', e); }
      });
    });
  } catch (e) {
    bodyEl.innerHTML = '<p class="inv-panel-empty">Failed to load documents.</p>';
  }
}

let docCategoriesCache = {};   // { category: [year, ...] }

async function fetchDocCategories() {
  if (!serverAvailable) return;
  try {
    docCategoriesCache = await apiGet('/documents/categories');
    // Auto-select first category if current is invalid
    const cats = Object.keys(docCategoriesCache);
    if (!docCurrentCat || !cats.includes(docCurrentCat)) {
      docCurrentCat = cats.length ? cats[0] : null;
    }
  } catch (e) { /* ignore */ }
}

function renderCategoryTabs() {
  const container = document.getElementById('docTabs');
  if (!container) return;

  const cats = Object.keys(docCategoriesCache);

  const tabsHtml = cats.map(key =>
    `<button class="doc-tab${key === docCurrentCat ? ' active' : ''}" data-doc-cat="${key}">${catLabel(key)}</button>`
  ).join('');

  const addBtn = '<button class="doc-tab doc-add-btn" id="addCategoryBtn" title="Add category">＋</button>';

  container.innerHTML = tabsHtml + addBtn;

  // Tab click handlers
  container.querySelectorAll('.doc-tab[data-doc-cat]').forEach(tab => {
    tab.addEventListener('click', () => {
      container.querySelectorAll('.doc-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      docCurrentCat = tab.dataset.docCat;
      renderYearButtons();
      renderDocuments();
    });
    // Right-click to delete
    tab.addEventListener('contextmenu', e => {
      e.preventDefault();
      const cat = tab.dataset.docCat;
      if (!confirm(`Delete category "${catLabel(cat)}"?\n\nOnly works if the category is empty (no files).`)) return;
      fetch(`${API_BASE}/documents/categories/${cat}`, { method: 'DELETE' })
        .then(r => r.json())
        .then(async data => {
          if (data.ok) {
            docCategoriesCache = {};
            await fetchDocCategories();
            renderCategoryTabs();
            renderYearButtons();
            renderDocuments();
          } else {
            alert(data.error || 'Failed to delete category');
          }
        })
        .catch(() => alert('Failed to delete category'));
    });
  });

  // Add category button
  document.getElementById('addCategoryBtn')?.addEventListener('click', async () => {
    const name = prompt('New category name (e.g. "Medical Records"):');
    if (!name || !name.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/documents/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        docCurrentCat = data.category;
        docCategoriesCache = {};
        await fetchDocCategories();
        renderCategoryTabs();
        renderYearButtons();
        renderDocuments();
      } else {
        alert(data.error || 'Failed to create category');
      }
    } catch (e) { alert('Failed to create category'); }
  });
}

function renderYearButtons() {
  const container = document.getElementById('docYearFilter');
  if (!container) return;

  const years = (docCurrentCat && docCategoriesCache[docCurrentCat]) || [];
  const currentYear = String(new Date().getFullYear());

  // If current selection not in list, default to current year or first available
  if (years.length && !years.includes(docCurrentYear)) {
    docCurrentYear = years.includes(currentYear) ? currentYear : years[0];
  }

  const btnsHtml = years.map(yr =>
    `<button class="doc-year-btn${yr === docCurrentYear ? ' active' : ''}" data-doc-year="${yr}">${yr}</button>`
  ).join('');

  const addBtn = docCurrentCat
    ? '<button class="doc-year-btn doc-add-btn" id="addYearBtn" title="Add year">＋</button>'
    : '';

  container.innerHTML = btnsHtml + addBtn;

  container.querySelectorAll('.doc-year-btn[data-doc-year]').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.doc-year-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      docCurrentYear = btn.dataset.docYear;
      renderDocuments();
    });
  });

  // Add year button
  document.getElementById('addYearBtn')?.addEventListener('click', async () => {
    const year = prompt('Year to add (e.g. 2023):', String(new Date().getFullYear()));
    if (!year || !/^\d{4}$/.test(year.trim())) {
      if (year !== null) alert('Please enter a valid 4-digit year.');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/documents/categories/${docCurrentCat}/years`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: year.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        docCurrentYear = year.trim();
        docCategoriesCache = {};
        await fetchDocCategories();
        renderYearButtons();
        renderDocuments();
      } else {
        alert(data.error || 'Failed to create year folder');
      }
    } catch (e) { alert('Failed to create year folder'); }
  });
}

function initDocumentEvents() {
  // File upload — drag & drop
  const dropZone = document.getElementById('docDropZone');
  const fileInput = document.getElementById('docFileInput');

  if (dropZone) {
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      if (e.dataTransfer.files.length > 0) uploadFiles(e.dataTransfer.files);
    });
  }

  if (fileInput) {
    fileInput.addEventListener('change', () => {
      if (fileInput.files.length > 0) uploadFiles(fileInput.files);
      fileInput.value = '';
    });
  }
}

async function uploadFiles(fileList) {
  const formData = new FormData();
  for (const f of fileList) {
    formData.append('files', f);
  }
  try {
    const res = await fetch(`${API_BASE}/documents/${docCurrentCat}/${docCurrentYear}/upload`, {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();
    if (data.ok) {
      console.log(`✅ Uploaded ${data.count} file(s):`, data.uploaded);
      await fetchDocCategories();
      renderYearButtons();
      renderDocuments();
    }
  } catch (e) {
    console.error('Upload failed:', e);
    alert('Upload failed. Is the server running?');
  }
}


/* ============================================================
   INITIALISE
   ============================================================ */
document.addEventListener('DOMContentLoaded', async () => {
  // Set today's date as default in date inputs
  const today = todayISO();
  defaultBlankDateInputs();
  const dashboardFrom = document.getElementById('dashboardDateFrom');
  const dashboardTo = document.getElementById('dashboardDateTo');
  if (dashboardFrom) dashboardFrom.value = today;
  if (dashboardTo) dashboardTo.value = today;

  // Load data from the local server
  await loadAllData();
  if (serverAvailable) {
    await generateRecurringOccurrences();
    await captureAutomaticNetWorthSnapshot(false);
    loadMfCatalogStatus(true);
  }

  // Show server status badge
  const badge = document.getElementById('serverBadge');
  if (badge) {
    badge.textContent = serverAvailable ? '🟢 Server' : '🟡 Offline';
    badge.title = serverAvailable ? 'Data saved to data.xlsx' : 'Server offline — data resets on refresh';
  }
  const accountSubmit = document.querySelector('#accountForm button[type="submit"]');
  if (accountSubmit) accountSubmit.disabled = !serverAvailable;
  setAccountSaveStatus(
    serverAvailable
      ? 'Ready — new accounts are saved directly to data.xlsx.'
      : 'Server offline — start it and refresh before adding accounts.',
    serverAvailable ? '' : 'error'
  );

  // Fetch and display system username
  if (serverAvailable) {
    try {
      const info = await apiGet('/user-info');
      const nameEl = document.getElementById('userName');
      const avatarEl = document.getElementById('userAvatar');
      if (nameEl && info.username) nameEl.textContent = info.username;
      if (avatarEl && info.initials) avatarEl.textContent = info.initials;
    } catch (e) { /* ignore — keeps default */ }
  }

  // Export Excel button
  document.getElementById('btnExportExcel')?.addEventListener('click', () => {
    if (serverAvailable) {
      window.open(`${API_BASE}/export`, '_blank');
    } else {
      alert('Server is not running. Start it with: python server.py');
    }
  });

  // Render all data
  populateAccountSelectors();
  updateAccountSettlementField();
  renderRecentTransactions();
  renderInvestmentSnapshot();
  renderExpensesTable();
  renderInvestmentsTable();
  renderSavingsCards();
  renderIncomeTransactions();
  renderSavingsTable();
  renderPlanning();
  initPlanningEvents();
  renderDashboardCards();

  // Charts
  initCharts();

  // Month display
  updateMonthDisplay();

  // Sync form expenses in background (non-blocking)
  if (serverAvailable) {
    syncFormExpenses();
  }
});
