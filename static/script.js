/* ============================================================
   DATA ARRAYS  (loaded exclusively from server / Excel)
   ============================================================ */

let expenses = [];
let investments = [];
let savingsHistory = [];
let savingsGoals = [];
let emergencyFund = { target: 0, current: 0, contributions: [] };

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
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}`);
  return res.json();
}

/* ── Load all data from server (Excel is the single source of truth) ── */
async function loadAllData() {
  try {
    const [exp, inv, sh, sg, ef] = await Promise.all([
      apiGet('/expenses'),
      apiGet('/investments'),
      apiGet('/savings-history'),
      apiGet('/savings-goals'),
      apiGet('/emergency-fund'),
    ]);
    expenses       = exp;
    investments    = inv;
    savingsHistory = sh;
    savingsGoals   = sg;
    emergencyFund  = ef;
    serverAvailable = true;
    console.log(`✅ Data loaded from Excel — ${exp.length} expenses, ${inv.length} investments, ${sh.length} savings months, ${sg.length} goals`);
  } catch (e) {
    console.warn('⚠️ Server unavailable — start it with: python server.py', e.message);
    expenses       = [];
    investments    = [];
    savingsHistory = [];
    savingsGoals   = [];
    emergencyFund  = { target: 0, current: 0, contributions: [] };
    serverAvailable = false;
  }
}

/* ── Save helpers (fire-and-forget, log errors) ────────────── */
function saveExpenses()       { if (serverAvailable) apiPost('/expenses', expenses).catch(e => console.error('Save expenses failed:', e)); }
function saveInvestments()    { if (serverAvailable) apiPost('/investments', investments).catch(e => console.error('Save investments failed:', e)); }
function saveSavingsHistory() { if (serverAvailable) apiPost('/savings-history', savingsHistory).catch(e => console.error('Save savings history failed:', e)); }
function saveSavingsGoals()   { if (serverAvailable) apiPost('/savings-goals', savingsGoals).catch(e => console.error('Save goals failed:', e)); }
function saveEmergencyFund()  { if (serverAvailable) apiPost('/emergency-fund', { target: emergencyFund.target, contributions: emergencyFund.contributions }).catch(e => console.error('Save emergency fund failed:', e)); }


/* ============================================================
   CATEGORY CONFIGURATION
   ============================================================ */
const categoryConfig = {
  food:          { label: 'Food',          icon: '🍔', cls: 'cat-food'          },
  travel:        { label: 'Travel',        icon: '✈️',  cls: 'cat-travel'        },
  housing:       { label: 'Housing',       icon: '🏠', cls: 'cat-housing'       },
  health:        { label: 'Health',        icon: '⚕️',  cls: 'cat-health'        },
  entertainment: { label: 'Entertainment', icon: '🎬', cls: 'cat-entertainment' },
  utilities:     { label: 'Utilities',     icon: '⚡', cls: 'cat-utilities'     },
  shopping:      { label: 'Shopping',      icon: '🛍️', cls: 'cat-shopping'      },
  other:         { label: 'Other',         icon: '📦', cls: 'cat-other'         },
};

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

const fmtDate = (d) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const todayISO = () => new Date().toISOString().split('T')[0];


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

    /* Strategy 2: Direct mfapi.in (CORS-safe) */
    try {
      const url = `https://api.mfapi.in/mf/${inv.schemeCode}`;
      logDebug(label, 'mfapi.in', 'pending', url);
      const res = await fetch(url);
      if (!res.ok) { logDebug(label, 'mfapi.in', 'error', `HTTP ${res.status}`); return null; }
      const data = await res.json();
      const nav = parseFloat(data.data?.[0]?.nav) || null;
      logDebug(label, 'mfapi.in', nav ? 'success' : 'error', nav ? `NAV ₹${nav}` : 'NAV parse failed');
      return nav;
    } catch (e) { logDebug(label, 'mfapi.in', 'error', e.message || String(e)); return null; }
  },

  /* ── Stocks — Local server proxy → Yahoo direct → CORS proxies ── */
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

    /* Strategy 2: Direct Yahoo fetch (may work from http://localhost) */
    const yUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(inv.ticker)}?interval=1d&range=1d`;
    try {
      logDebug(label, 'Yahoo (direct)', 'pending', yUrl);
      const res = await fetch(yUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (res.ok) {
        const data = await res.json();
        const price = data.chart?.result?.[0]?.meta?.regularMarketPrice;
        if (price) { logDebug(label, 'Yahoo (direct)', 'success', `₹${price}`); return price; }
        logDebug(label, 'Yahoo (direct)', 'error', 'Price missing in response');
      } else {
        logDebug(label, 'Yahoo (direct)', 'error', `HTTP ${res.status}`);
      }
    } catch (e) { logDebug(label, 'Yahoo (direct)', 'error', e.message || 'CORS/Network error'); }

    /* Strategy 3: Free CORS proxies (last resort) */
    const proxyNames = ['codetabs', 'allorigins', 'corsproxy.io'];
    const proxies = [
      `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(yUrl)}`,
      `https://api.allorigins.win/raw?url=${encodeURIComponent(yUrl)}`,
      `https://corsproxy.io/?${encodeURIComponent(yUrl)}`,
    ];
    for (let i = 0; i < proxies.length; i++) {
      const proxyUrl = proxies[i];
      const pName = proxyNames[i];
      try {
        logDebug(label, pName, 'pending', proxyUrl.substring(0, 80) + '…');
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(proxyUrl, { signal: controller.signal });
        clearTimeout(timeout);
        if (!res.ok) { logDebug(label, pName, 'error', `HTTP ${res.status}`); continue; }
        const text = await res.text();
        if (text.includes('Too Many')) { logDebug(label, pName, 'error', 'Rate limited (Too Many Requests)'); continue; }
        if (text.length < 50) { logDebug(label, pName, 'error', `Response too short (${text.length} bytes)`); continue; }
        const data = JSON.parse(text);
        const price = data.chart?.result?.[0]?.meta?.regularMarketPrice;
        if (price) { logDebug(label, pName, 'success', `₹${price}`); return price; }
        logDebug(label, pName, 'error', 'Price missing in parsed JSON');
      } catch (e) {
        const msg = e.name === 'AbortError' ? 'Timeout (8s)' : (e.message || String(e));
        logDebug(label, pName, 'error', msg);
        continue;
      }
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
  if (updated > 0) saveInvestments();
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
  savings:     ['Savings',     'Your savings goals and history'],
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
  const monthSel   = document.getElementById('headerMonthSelector');
  const addBtn     = document.getElementById('addEntryBtn');
  const refreshBtn = document.getElementById('headerRefreshBtn');
  const refreshSt  = document.getElementById('headerRefreshStatus');
  if (monthSel)   monthSel.style.display   = (isInvPage || isDocPage) ? 'none' : '';
  if (addBtn)     addBtn.style.display     = (isInvPage || isDocPage) ? 'none' : '';
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
  document.getElementById(id)?.classList.add('open');
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
  openModal('investmentModal');
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
  document.getElementById(id)?.querySelector('form')?.reset();
  /* Reset investment modal dynamic state */
  if (id === 'investmentModal') {
    const dyn = document.getElementById('invDynamicFields');
    if (dyn) dyn.style.display = 'none';
    /* Unhide all type options */
    document.getElementById('invType')?.querySelectorAll('option').forEach(o => o.hidden = false);
  }
}

document.querySelectorAll('.modal-close, .btn-secondary[data-modal]').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.modal));
});

document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.remove('open');
  });
});


/* ============================================================
   RENDER: RECENT TRANSACTIONS (Dashboard widget)
   ============================================================ */
function renderRecentTransactions() {
  const el = document.getElementById('recentTransactions');
  if (!el) return;

  const recent = expensesForMonth().slice(-5).reverse();
  el.innerHTML = recent.map(t => {
    const cat = categoryConfig[t.category] || categoryConfig.other;
    return `
      <div class="transaction-item">
        <div class="txn-icon ${cat.cls}">${cat.icon}</div>
        <div class="txn-info">
          <div class="txn-desc">${escHtml(t.description)}</div>
          <div class="txn-date">${fmtDate(t.date)} &bull; ${cat.label}</div>
        </div>
        <div class="txn-amount negative">-${fmt(t.amount)}</div>
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
    const value   = inv.units * inv.currentPrice;
    const gainPct = ((inv.currentPrice - inv.buyPrice) / inv.buyPrice * 100).toFixed(1);
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
let expGroupByMonth = true;

function getFilteredExpenses() {
  return expenses.filter(e => {
    const [y, m] = e.date.split('-');
    if (expFilterCat  !== 'all' && e.category !== expFilterCat)  return false;
    if (expFilterYear !== 'all' && y           !== expFilterYear) return false;
    if (expFilterMonth!== 'all' && m           !== expFilterMonth)return false;
    return true;
  }).sort((a, b) => a.date.localeCompare(b.date));
}

function buildExpenseRow(exp) {
  const cat = categoryConfig[exp.category] || categoryConfig.other;
  return `
    <tr>
      <td>${fmtDate(exp.date)}</td>
      <td>${escHtml(exp.description)}</td>
      <td><span class="cat-badge ${cat.cls}">${cat.icon} ${cat.label}</span></td>
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
          <td colspan="6">📅 ${monthName} &nbsp;—&nbsp; ${groups[key].length} transaction${groups[key].length > 1 ? 's' : ''}</td>
        </tr>
        ${rows}
        <tr class="month-subtotal">
          <td colspan="4" style="text-align:right;">Month Total</td>
          <td style="color:var(--danger);">-${fmt(groupTotal)}</td>
          <td></td>
        </tr>`;
    }).join('');

  } else {
    // --- Flat list view (or filtered to specific month/year) ---
    tbody.innerHTML = filtered.length
      ? filtered.map(buildExpenseRow).join('')
      : `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted);">No expenses found for selected filters.</td></tr>`;
  }

  updateExpenseSummaryStrip(filtered);
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
  const count    = filtered.length;
  const avgDay   = count ? total / 30 : 0;
  const largest  = filtered.reduce((max, e) => e.amount > max.amount ? e : max, { amount: 0, category: '' });
  const largestCat = largest.amount ? (categoryConfig[largest.category]?.label || 'Other') : '-';

  document.getElementById('stripTotal')  .textContent = fmt(total);
  document.getElementById('stripCount')  .textContent = count;
  document.getElementById('stripAvg')    .textContent = fmt(avgDay);
  document.getElementById('stripLargest').textContent = largest.amount
    ? `${fmt(largest.amount)} (${largestCat})`
    : '-';

  /* Run-rate forecast: projected month-end spend */
  const today = new Date();
  const isCurrentMonth = (expFilterMonth === 'all' || parseInt(expFilterMonth) === today.getMonth() + 1)
                      && (expFilterYear === 'all' || parseInt(expFilterYear) === today.getFullYear());
  const forecastEl = document.getElementById('stripForecast');
  if (forecastEl) {
    if (isCurrentMonth && today.getDate() > 1) {
      const dayOfMonth = today.getDate();
      const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
      const projected = Math.round(total / dayOfMonth * daysInMonth);
      forecastEl.textContent = `~${fmt(projected)}`;
    } else {
      forecastEl.textContent = fmt(total);
    }
  }
}

// Event delegation — delete expense rows
document.getElementById('expensesTableBody')?.addEventListener('click', e => {
  const btn = e.target.closest('.action-btn.delete');
  if (!btn) return;
  const id = parseInt(btn.dataset.id);
  if (confirm('Delete this expense entry?')) {
    const idx = expenses.findIndex(x => x.id === id);
    if (idx !== -1) {
      expenses.splice(idx, 1);
      saveExpenses();
      refreshDashboard();
    }
  }
});

// Clear all buttons
document.getElementById('clearExpensesBtn')?.addEventListener('click', () => {
  if (confirm('Clear ALL expense entries? This cannot be undone.')) {
    expenses.length = 0;
    saveExpenses();
    refreshDashboard();
  }
});

// Clear all investments
document.getElementById('clearInvestmentsBtn')?.addEventListener('click', () => {
  if (confirm('Clear ALL investment holdings? This cannot be undone.')) {
    investments.length = 0;
    saveInvestments();
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

document.getElementById('filterGroupBy')?.addEventListener('change', e => {
  expGroupByMonth = e.target.value === 'month';
  renderExpensesTable();
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
  stocks:        { asset:'Stock Ticker <small class="hint">(.NS auto-added)</small>',  assetPh:'e.g. RELIANCE, TCS',  name:'Company Name', namePh:'e.g. Reliance Industries',  units:'Shares',        buy:'Buy Price (₹ / share)',   curr:'Current Price (₹ / share)' },
  foreign_stocks:{ asset:'Stock Ticker',  assetPh:'e.g. AAPL, MSFT',    name:'Company Name', namePh:'e.g. Apple Inc.',           units:'Shares',        buy:'Buy Price (₹ / share)',   curr:'Current Price (₹ / share)' },
  mutual_funds:  { asset:'Fund Code',     assetPh:'e.g. HDFC-TOP100',   name:'Fund Name',    namePh:'e.g. HDFC Top 100 Fund',   units:'Units',         buy:'Buy NAV (₹)',             curr:'Current NAV (₹)' },
  gold:          { asset:'Gold Type',     assetPh:'e.g. PHYSICAL, SGB', name:'Description',  namePh:'e.g. Physical Gold 24K',   units:'Quantity (g)',   buy:'Buy Price (₹ / g)',       curr:'Current Price (₹ / g)' },
  ppf:           { asset:'Account ID',    assetPh:'e.g. PPF-SBI',       name:'Account Name', namePh:'e.g. PPF – State Bank',    units:'Installments',  buy:'Amount per Install (₹)',  curr:'Current Value (₹)' },
  nps:           { asset:'Account ID',    assetPh:'e.g. NPS-TIER1',     name:'Account Name', namePh:'e.g. NPS Tier-1',          units:'Units',         buy:'Buy NAV (₹)',             curr:'Current NAV (₹)' },
  fixed_deposit: { asset:'FD Reference',  assetPh:'e.g. SBI-FD-2025',   name:'Description',  namePh:'e.g. SBI FD 3yr @7.1%',   units:'Deposits',      buy:'Principal (₹)',           curr:'Maturity Value (₹)' },
};

/* Show/hide fields + update labels when investment type changes */
document.getElementById('invType')?.addEventListener('change', e => {
  const cat = e.target.value;
  const dynFields = document.getElementById('invDynamicFields');
  if (dynFields) dynFields.style.display = cat ? '' : 'none';
  if (!cat) return;

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

  /* Market cap & risk fields */
  const mktFields = document.getElementById('invMarketFields');
  if (mktFields) mktFields.style.display = marketCategories.includes(cat) ? '' : 'none';

  /* MF scheme-code field */
  const schemeGroup = document.getElementById('invSchemeGroup');
  if (schemeGroup) schemeGroup.style.display = cat === 'mutual_funds' ? '' : 'none';
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
  renderDashboardCards();
  initCharts();
  navigateTo(activeSection);
}

/* ============================================================
   RENDER: INVESTMENTS — Two-Tile Layout
   ============================================================ */
const marketCategories = ['stocks', 'foreign_stocks', 'mutual_funds'];
const otherCategories  = ['gold', 'ppf', 'nps', 'fixed_deposit'];
const tradableCategories = ['stocks', 'foreign_stocks', 'mutual_funds'];

/* Build transaction log HTML for a holding */
function buildTxnLog(inv) {
  const txns = inv.transactions || [];
  if (txns.length === 0) return '<div class="txn-empty">No transaction history.</div>';

  let totalBought = 0, totalSold = 0, totalBuyCost = 0, totalSellRevenue = 0;
  txns.forEach(t => {
    if (t.action === 'BUY')  { totalBought += t.units; totalBuyCost += t.units * t.price; }
    if (t.action === 'SELL') { totalSold   += t.units; totalSellRevenue += t.units * t.price; }
  });

  const rows = txns.map(t => {
    const total = t.units * t.price;
    const isBuy = t.action === 'BUY';
    return `<tr>
      <td>${fmtDate(t.date)}</td>
      <td><span class="txn-badge ${isBuy ? 'txn-buy' : 'txn-sell'}">${t.action}</span></td>
      <td>${t.units}</td>
      <td>${fmt(t.price)}</td>
      <td style="font-weight:600">${fmt(total)}</td>
    </tr>`;
  }).join('');

  const summaryParts = [`${txns.length} transaction${txns.length !== 1 ? 's' : ''}`];
  if (totalBought > 0) summaryParts.push(`Bought: ${totalBought} units (${fmt(totalBuyCost)})`);
  if (totalSold > 0)   summaryParts.push(`Sold: ${totalSold} units (${fmt(totalSellRevenue)})`);
  summaryParts.push(`Net: ${totalBought - totalSold} units held`);

  return `
    <table class="txn-table">
      <thead><tr><th>Date</th><th>Action</th><th>Units</th><th>Price</th><th>Total</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="txn-summary">${summaryParts.join('  ·  ')}</div>
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
    const grpInvested = grp.reduce((s, i) => s + i.units * i.buyPrice, 0);
    const grpCurrent  = grp.reduce((s, i) => s + i.units * i.currentPrice, 0);
    const grpGain     = grpCurrent - grpInvested;
    const grpPct      = grpInvested > 0 ? (grpGain / grpInvested * 100).toFixed(1) : '0.0';
    const isPos       = grpGain >= 0;

    const rows = grp.map(inv => {
      const invested   = inv.units * inv.buyPrice;
      const currentVal = inv.units * inv.currentPrice;
      const gain       = currentVal - invested;
      const gainPct    = invested > 0 ? (gain / invested * 100).toFixed(2) : '0.00';
      const isP        = gain >= 0;
      const txnCount   = (inv.transactions || []).length;
      return `
        <tr class="holding-row" data-inv-id="${inv.id}" title="Click to view transaction history">
          <td><strong>${escHtml(inv.asset)}</strong><br><small style="color:var(--text-muted)">${escHtml(inv.name)}</small></td>
          <td>${inv.units}</td>
          <td>${fmt(inv.buyPrice)}</td>
          <td>${fmt(inv.currentPrice)}</td>
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
          <thead><tr><th>Asset</th><th>Units</th><th>Buy Price</th><th>Current Price</th><th>Invested</th><th>Current Value</th><th>Gain / Loss</th><th>Return %</th><th>Actions</th></tr></thead>
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
    const grpInvested = grp.reduce((s, i) => s + i.units * i.buyPrice, 0);
    const grpCurrent  = grp.reduce((s, i) => s + i.units * i.currentPrice, 0);
    const grpGain     = grpCurrent - grpInvested;
    const grpPct      = grpInvested > 0 ? (grpGain / grpInvested * 100).toFixed(1) : '0.0';
    const isPos       = grpGain >= 0;

    const holdingCards = grp.map(inv => {
      const invested   = inv.units * inv.buyPrice;
      const currentVal = inv.units * inv.currentPrice;
      const gain       = currentVal - invested;
      const gainPct    = invested > 0 ? (gain / invested * 100).toFixed(1) : '0.0';
      const isP        = gain >= 0;
      const txnCount   = (inv.transactions || []).length;
      return `
        <div class="otile-holding">
          <div class="otile-row holding-row" data-inv-id="${inv.id}" title="Click to view transaction history">
            <div class="otile-name"><strong>${escHtml(inv.asset)}</strong><small>${escHtml(inv.name)}</small></div>
            <div class="otile-actions">
              ${txnCount > 0 ? '<span class="txn-count">📋' + txnCount + '</span>' : ''}
              <button class="action-btn delete" title="Delete" data-id="${inv.id}">🗑️</button>
            </div>
          </div>
          <div class="otile-stats">
            <div><span>Units</span><strong>${inv.units}</strong></div>
            <div><span>Invested</span><strong>${fmt(invested)}</strong></div>
            <div><span>Current</span><strong>${fmt(currentVal)}</strong></div>
            <div><span>P&L</span><strong class="${isP ? 'gain-positive' : 'gain-negative'}">${isP ? '+' : ''}${fmt(gain)} (${isP ? '+' : ''}${gainPct}%)</strong></div>
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
  const invested = items.reduce((s, i) => s + i.units * i.buyPrice, 0);
  const current  = items.reduce((s, i) => s + i.units * i.currentPrice, 0);
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
    const val = i.units * i.currentPrice;
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
  const totalInvested = investments.reduce((s, i) => s + i.units * i.buyPrice, 0);
  const totalCurrent  = investments.reduce((s, i) => s + i.units * i.currentPrice, 0);
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
      if (confirm('Delete this investment?')) {
        const idx = investments.findIndex(x => x.id === id);
        if (idx !== -1) { investments.splice(idx, 1); saveInvestments(); renderAfterInvestmentChange(); }
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
}

/* ============================================================
   TRADE MODAL (BUY / SELL)
   ============================================================ */
function openTradeModal(action, inv) {
  const modal = document.getElementById('tradeModal');
  if (!modal) return;

  document.getElementById('tradeAction').textContent = action === 'buy' ? 'Buy More' : 'Sell';
  document.getElementById('tradeAssetName').textContent = `${inv.asset} — ${inv.name}`;
  document.getElementById('tradeCurrentUnits').textContent = inv.units;
  document.getElementById('tradeCurrentValue').textContent = fmt(inv.units * inv.currentPrice);

  const form = document.getElementById('tradeForm');
  form.dataset.action = action;
  form.dataset.invId  = inv.id;
  form.reset();

  // Set max units for sell
  const unitsInput = document.getElementById('tradeUnits');
  if (action === 'sell') {
    unitsInput.max = inv.units;
  } else {
    unitsInput.removeAttribute('max');
  }

  modal.classList.add('open');
}

document.getElementById('tradeForm')?.addEventListener('submit', e => {
  e.preventDefault();
  const form   = e.target;
  const action = form.dataset.action;
  const id     = parseInt(form.dataset.invId);
  const units  = parseFloat(document.getElementById('tradeUnits').value);
  const price  = parseFloat(document.getElementById('tradePrice').value);

  const inv = investments.find(x => x.id === id);
  if (!inv) return;

  if (action === 'buy') {
    // Weighted average buy price
    const totalOldCost = inv.units * inv.buyPrice;
    const newCost      = units * price;
    inv.units    = inv.units + units;
    inv.buyPrice = (totalOldCost + newCost) / inv.units;
  } else {
    // Sell — reduce units
    if (units > inv.units) { alert('Cannot sell more units than you hold.'); return; }
    inv.units -= units;
    if (inv.units <= 0) {
      const idx = investments.findIndex(x => x.id === id);
      if (idx !== -1) investments.splice(idx, 1);
    }
  }

  // Record the transaction
  if (!inv.transactions) inv.transactions = [];
  inv.transactions.push({ date: todayISO(), action: action.toUpperCase(), units, price });

  saveInvestments();
  renderAfterInvestmentChange();
  closeModal('tradeModal');
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

  el('savIncomeChange',   income > 0 ? `${MONTHS[currentMonthIdx]} ${currentYear}` : 'Click income card on dashboard to set');
  cls('savIncomeChange',  income > 0 ? 'card-change positive' : 'card-change');

  el('savExpensesChange', `${expRate}% of income`);
  cls('savExpensesChange', 'card-change negative');

  el('savInvestedChange', `${invRate}% of income`);
  cls('savInvestedChange', 'card-change positive');

  el('savNetSavedChange', `${saveRate}% savings rate`);
  cls('savNetSavedChange', parseFloat(saveRate) >= 0 ? 'card-change positive' : 'card-change negative');
}

function renderSavingsTable() {
  const tbody = document.getElementById('savingsTableBody');
  if (!tbody) return;

  tbody.innerHTML = savingsHistory.map((row, idx) => {
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
        <td style="color:var(--success); font-weight:600; cursor:pointer;" class="editable-income" data-idx="${idx}" title="Click to edit">${fmt(income)} ✏️</td>
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

  /* Editable income cells */
  tbody.querySelectorAll('.editable-income').forEach(td => {
    td.addEventListener('click', () => {
      const idx = parseInt(td.dataset.idx);
      const row = savingsHistory[idx];
      if (!row) return;
      const input = prompt(`Set income for ${row.month}:`, row.income || 0);
      if (input === null) return;
      const val = parseFloat(input);
      if (isNaN(val) || val < 0) return;
      row.income = val;
      if (serverAvailable) {
        fetch(`${API_BASE}/savings-history/${encodeURIComponent(row.month)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ income: val }),
        }).catch(e => console.error('Patch income failed:', e));
      }
      renderSavingsTable();
      refreshDashboard();
    });
  });
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
let stocksRiskChart = null;
let stocksCapChart  = null;
let stocksCategoryChart = null;
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

  /* --- Risk distribution by value --- */
  const riskBuckets = { low: 0, moderate: 0, high: 0 };
  items.forEach(i => {
    const val = i.units * i.currentPrice;
    const risk = i.riskLevel || 'moderate';
    riskBuckets[risk] = (riskBuckets[risk] || 0) + val;
  });

  /* --- Market cap distribution by value --- */
  const capBuckets = { large: 0, mid: 0, small: 0 };
  items.forEach(i => {
    const val = i.units * i.currentPrice;
    const cap = i.marketCap || 'large';
    capBuckets[cap] = (capBuckets[cap] || 0) + val;
  });

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

  /* --- Three analytics charts row --- */
  const chartsHTML = `
    <div class="stk-charts-row">
      <div class="chart-card stk-chart-card">
        <div class="chart-header">
          <h3>Risk Profile</h3>
          <span class="chart-subtitle">By current value</span>
        </div>
        <div class="chart-container"><canvas id="stocksRiskChart"></canvas></div>
      </div>
      <div class="chart-card stk-chart-card">
        <div class="chart-header">
          <h3>Market Cap Split</h3>
          <span class="chart-subtitle">Large · Mid · Small</span>
        </div>
        <div class="chart-container"><canvas id="stocksCapChart"></canvas></div>
      </div>
      <div class="chart-card stk-chart-card">
        <div class="chart-header">
          <h3>Category Breakdown</h3>
          <span class="chart-subtitle">Stocks · MF · Foreign</span>
        </div>
        <div class="chart-container"><canvas id="stocksCategoryChart"></canvas></div>
      </div>
    </div>
  `;

  /* --- Stocks: Growth Comparison + Invested vs Current charts --- */
  const stockItems = items.filter(i => i.category === 'stocks' || i.category === 'foreign_stocks');
  const mfItems    = items.filter(i => i.category === 'mutual_funds');

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
            <h3>Growth Comparison — All Mutual Funds</h3>
            <span class="chart-subtitle">Value over last 12 months</span>
          </div>
          <div class="chart-container tall"><canvas id="mfGrowthCompareChart"></canvas></div>
          <div class="chart-custom-legend" id="mfGrowthLegend"></div>
        </div>
        <div class="chart-card stk-chart-card wide-chart-card">
          <div class="chart-header">
            <h3>Invested vs Current — Mutual Funds</h3>
            <span class="chart-subtitle">Total invested vs value over 12 months</span>
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

  el.innerHTML = summaryHTML + chartsHTML + stocksCompareChartsHTML + mfCompareChartsHTML +
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

  /* --- Render the three charts --- */
  renderStocksCharts(riskBuckets, capBuckets, catBuckets);

  /* --- Render comparison charts for stocks and mutual funds --- */
  renderStocksCompareCharts(stockItems);
  renderMFCompareCharts(mfItems);
}

function renderStocksCharts(riskBuckets, capBuckets, catBuckets) {
  // Destroy old instances
  if (stocksRiskChart)     { stocksRiskChart.destroy();     stocksRiskChart = null; }
  if (stocksCapChart)      { stocksCapChart.destroy();      stocksCapChart = null; }
  if (stocksCategoryChart) { stocksCategoryChart.destroy();  stocksCategoryChart = null; }

  const donutOpts = {
    responsive: true, maintainAspectRatio: false,
    cutout: '65%',
    plugins: {
      legend: { position: 'bottom', labels: { padding: 14, usePointStyle: true, font: { size: 12 } } },
      tooltip: { callbacks: { label: ctx => ' ' + ctx.label + ': ' + fmt(ctx.raw) } }
    }
  };

  /* Risk Profile */
  const riskCtx = document.getElementById('stocksRiskChart')?.getContext('2d');
  if (riskCtx) {
    stocksRiskChart = new Chart(riskCtx, {
      type: 'doughnut',
      data: {
        labels: ['Low Risk', 'Moderate', 'High Risk'],
        datasets: [{
          data: [riskBuckets.low, riskBuckets.moderate, riskBuckets.high],
          backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
          borderWidth: 2, borderColor: '#fff'
        }]
      },
      options: donutOpts
    });
  }

  /* Market Cap */
  const capCtx = document.getElementById('stocksCapChart')?.getContext('2d');
  if (capCtx) {
    stocksCapChart = new Chart(capCtx, {
      type: 'doughnut',
      data: {
        labels: ['Large Cap', 'Mid Cap', 'Small Cap'],
        datasets: [{
          data: [capBuckets.large, capBuckets.mid, capBuckets.small],
          backgroundColor: ['#6366f1', '#3b82f6', '#06b6d4'],
          borderWidth: 2, borderColor: '#fff'
        }]
      },
      options: donutOpts
    });
  }

  /* Category Breakdown */
  const catCtx = document.getElementById('stocksCategoryChart')?.getContext('2d');
  if (catCtx) {
    stocksCategoryChart = new Chart(catCtx, {
      type: 'doughnut',
      data: {
        labels: ['Stocks', 'Mutual Funds', 'Foreign Stocks'],
        datasets: [{
          data: [catBuckets.stocks, catBuckets.mutual_funds, catBuckets.foreign_stocks],
          backgroundColor: ['#6366f1', '#10b981', '#f59e0b'],
          borderWidth: 2, borderColor: '#fff'
        }]
      },
      options: donutOpts
    });
  }
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
      const moEnd = mo.key + '-31';
      let unitsHeld = 0;
      let totalCost = 0;
      for (const t of txns) {
        if (t.date.slice(0, 7) > mo.key) break;
        if (t.action === 'BUY')  { unitsHeld += t.units; totalCost += t.units * t.price; }
        if (t.action === 'SELL') { unitsHeld -= t.units; totalCost -= t.units * t.price; }
      }
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
   RENDER: MUTUAL FUNDS — 12-MONTH GROWTH LINE CHARTS
   ============================================================ */
function renderMFCompareCharts(mfItems) {
  if (mfGrowthCompareChart) { mfGrowthCompareChart.destroy(); mfGrowthCompareChart = null; }
  if (mfInvVsCurChart)      { mfInvVsCurChart.destroy();      mfInvVsCurChart = null; }
  if (mfItems.length === 0) return;

  const { months, datasets } = buildMonthlyTimeline(mfItems);
  const monthLabels = months.map(m => m.label);

  const amtTickCallback = v => '₹' + (v >= 100000 ? (v/100000).toFixed(1) + 'L' : v >= 1000 ? (v/1000).toFixed(0) + 'K' : v);

  /* Chart 1: Growth lines — each MF's value over 12 months */
  const growthCtx = document.getElementById('mfGrowthCompareChart')?.getContext('2d');
  if (growthCtx) {
    mfGrowthCompareChart = new Chart(growthCtx, {
      type: 'line',
      data: {
        labels: monthLabels,
        datasets: mfItems.map((inv, i) => ({
          label: inv.asset.length > 18 ? inv.asset.substring(0, 18) + '…' : inv.asset,
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
    buildHtmlLegend(mfGrowthCompareChart, 'mfGrowthLegend');
  }

  /* Chart 2: Invested vs Current value over 12 months (aggregated) */
  const ivcCtx = document.getElementById('mfInvVsCurChart')?.getContext('2d');
  if (ivcCtx) {
    const aggInvested = months.map((_, mi) => datasets.reduce((s, ds) => s + ds[mi].invested, 0));
    const aggValue    = months.map((_, mi) => datasets.reduce((s, ds) => s + ds[mi].value, 0));

    mfInvVsCurChart = new Chart(ivcCtx, {
      type: 'line',
      data: {
        labels: monthLabels,
        datasets: [
          { label: 'Total Invested', data: aggInvested, borderColor: '#8b5cf6', backgroundColor: '#8b5cf620', tension: 0.3, pointRadius: 3, borderWidth: 2.5, fill: true, borderDash: [6, 3] },
          { label: 'Current Value',  data: aggValue,    borderColor: '#06b6d4', backgroundColor: '#06b6d420', tension: 0.3, pointRadius: 3, borderWidth: 2.5, fill: true }
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
      if (tx.date && tx.date.startsWith(ym) && tx.action === 'BUY') {
        total += tx.units * tx.price;
      }
    });
  });
  return total;
}

function renderDashboardCards() {
  /* Investment current value */
  const invValue = investments.reduce((s, i) => s + i.units * i.currentPrice, 0);

  /* Emergency fund + savings goals current */
  const efValue   = emergencyFund.current || 0;
  const goalValue = savingsGoals.reduce((s, g) => s + g.current, 0);

  /* Total Wealth = investments + emergency fund + goals */
  const totalWealth = invValue + efValue + goalValue;

  /* Selected month data */
  const curRow  = savingsRowForMonth(currentMonthIdx, currentYear);
  const prevMIdx = currentMonthIdx === 0 ? 11 : currentMonthIdx - 1;
  const prevYr   = currentMonthIdx === 0 ? currentYear - 1 : currentYear;
  const prevRow  = savingsRowForMonth(prevMIdx, prevYr);

  const monthlyIncome   = curRow?.income || 0;
  const monthlyExpenses = expensesForMonth().reduce((s, e) => s + e.amount, 0);
  const monthlyInvested = investmentOutflowForYM(currentMonthIdx, currentYear);
  const monthlyEF       = efContribForYM(currentMonthIdx, currentYear);
  const netSavings      = monthlyIncome - monthlyExpenses - monthlyInvested - monthlyEF;
  const savingsRate     = monthlyIncome > 0 ? (netSavings / monthlyIncome * 100).toFixed(1) : '0.0';

  /* Prev month comparison — compute from expenses array */
  const prevMonthExp = expensesForYM(prevMIdx, prevYr).reduce((s, e) => s + e.amount, 0);
  const expChange    = prevMonthExp > 0 ? ((monthlyExpenses - prevMonthExp) / prevMonthExp * 100).toFixed(1) : '0.0';
  const incChange    = prevRow?.income ? monthlyIncome - prevRow.income : 0;
  const invPct       = monthlyIncome > 0 ? (monthlyInvested / monthlyIncome * 100).toFixed(1) : '0.0';

  const el = (id, txt) => { const e = document.getElementById(id); if (e) e.textContent = txt; };
  const cls = (id, c) => { const e = document.getElementById(id); if (e) e.className = 'card-change ' + c; };

  el('dashWealth',   fmt(totalWealth));
  el('dashIncome',   fmt(monthlyIncome));
  el('dashExpenses', fmt(monthlyExpenses));
  el('dashSavings',  fmt(netSavings));

  el('dashWealthChange',   `${invValue > 0 ? 'Portfolio ' + fmt(invValue) : ''}`);
  cls('dashWealthChange',  'card-change positive');

  el('dashIncomeChange',   incChange >= 0 ? `+${fmt(incChange)} vs last month` : `${fmt(incChange)} vs last month`);
  cls('dashIncomeChange',  incChange >= 0 ? 'card-change positive' : 'card-change negative');

  el('dashExpensesChange', `${expChange >= 0 ? '+' : ''}${expChange}% vs last month`);
  cls('dashExpensesChange', parseFloat(expChange) <= 0 ? 'card-change positive' : 'card-change negative');

  el('dashSavingsChange',  `${savingsRate}% save · ${invPct}% invested`);
  cls('dashSavingsChange', parseFloat(savingsRate) >= 0 ? 'card-change positive' : 'card-change negative');

  /* Click-to-edit income */
  const incEl = document.getElementById('dashIncome');
  if (incEl && !incEl.dataset.bound) {
    incEl.dataset.bound = '1';
    incEl.style.cursor = 'pointer';
    incEl.title = 'Click to edit monthly income';
    incEl.addEventListener('click', () => {
      const current = curRow?.income || 0;
      const input = prompt(`Set income for ${MONTHS[currentMonthIdx]} ${currentYear}:`, current);
      if (input === null) return;
      const val = parseFloat(input);
      if (isNaN(val) || val < 0) return;
      /* Update local data */
      const row = savingsRowForMonth(currentMonthIdx, currentYear);
      const monthLabel = `${MONTHS[currentMonthIdx].slice(0, 3)} ${currentYear}`;
      if (row) {
        row.income = val;
      } else {
        savingsHistory.push({ month: monthLabel, income: val });
      }
      /* Save to server */
      if (serverAvailable) {
        fetch(`${API_BASE}/savings-history/${encodeURIComponent(monthLabel)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ income: val }),
        }).catch(e => console.error('Patch income failed:', e));
      }
      refreshDashboard();
    });
  }
}


/* ============================================================
   CHARTS  (Chart.js 4)
   ============================================================ */
// Chart palette
const PALETTE = ['#6366f1','#10b981','#f59e0b','#ef4444','#3b82f6','#ec4899','#06b6d4','#94a3b8'];

/* Track dashboard chart instances so we can destroy & recreate */
let chartExpense = null, chartSavTrend = null, chartPortfolio = null, chartPerformance = null, chartSavHist = null, chartWealth = null, chartExpTrend = null, chartExpCatPie = null;

/** Build enriched month data: { month, income, expenses, invested, saved } for a given mIdx/yr */
function buildMonthData(mIdx, yr) {
  const row = savingsRowForMonth(mIdx, yr);
  if (!row) return null;
  const monthExpenses = expensesForYM(mIdx, yr).reduce((s, e) => s + e.amount, 0);
  const monthInvested = investmentOutflowForYM(mIdx, yr);
  const monthEF       = efContribForYM(mIdx, yr);
  return {
    month: row.month,
    income: row.income || 0,
    expenses: monthExpenses,
    invested: monthInvested,
    efContrib: monthEF,
    saved: (row.income || 0) - monthExpenses - monthInvested - monthEF,
  };
}

function initCharts() {

  /* Destroy previous instances */
  [chartExpense, chartSavTrend, chartPortfolio, chartPerformance, chartSavHist, chartWealth, chartExpTrend].forEach(c => { if (c) c.destroy(); });
  chartExpense = chartSavTrend = chartPortfolio = chartPerformance = chartSavHist = chartWealth = chartExpTrend = null;

  /* ---- 1. Expense + Investment Breakdown (donut) — selected month ---- */
  const expCtx = document.getElementById('expenseChart')?.getContext('2d');
  if (expCtx) {
    const monthExp = expensesForMonth();
    const catTotals = {};
    monthExp.forEach(e => { catTotals[e.category] = (catTotals[e.category] || 0) + e.amount; });
    /* Add investment outflow + EF contribution + unallocated slices for full income breakdown */
    const monthInvested = investmentOutflowForYM(currentMonthIdx, currentYear);
    if (monthInvested > 0) catTotals['_investments'] = monthInvested;
    const monthEFContrib = efContribForYM(currentMonthIdx, currentYear);
    if (monthEFContrib > 0) catTotals['_emergency'] = monthEFContrib;
    const curRow = savingsRowForMonth(currentMonthIdx, currentYear);
    const income = curRow?.income || 0;
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

    chartExpense = new Chart(expCtx, {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: '#fff', hoverOffset: 6 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => {
                const pctOfTotal  = Math.round(ctx.raw / total * 100);
                const pctOfIncome = income > 0 ? (ctx.raw / income * 100).toFixed(1) : '—';
                return ` ${ctx.label}: ${fmt(ctx.raw)}  (${pctOfTotal}% of spend · ${pctOfIncome}% of income)`;
              },
            },
          },
        },
        cutout: '64%',
      },
    });

    // Custom legend with % of income
    const legendEl = document.getElementById('expenseLegend');
    if (legendEl) {
      legendEl.innerHTML = keys.map((k, i) => {
        const lbl = labelMap[k] || k;
        const pct = income > 0 ? (catTotals[k] / income * 100).toFixed(1) : '—';
        return `<div class="legend-item">
          <div class="legend-dot" style="background:${colors[i]}"></div>
          <span>${lbl} <small style="color:#94a3b8">(${pct}%)</small></span>
        </div>`;
      }).join('');
    }
  }

  /* ---- 2. Savings Rate % Trend (line) — last 12 months ending at selected ---- */
  const savCtx = document.getElementById('savingsChart')?.getContext('2d');
  if (savCtx) {
    const last12 = [];
    for (let offset = 11; offset >= 0; offset--) {
      let mI = currentMonthIdx - offset;
      let yr = currentYear;
      while (mI < 0) { mI += 12; yr--; }
      const md = buildMonthData(mI, yr);
      if (md) last12.push(md);
    }
    const rates = last12.map(r => r.income > 0 ? +(r.saved / r.income * 100).toFixed(1) : 0);
    chartSavTrend = new Chart(savCtx, {
      type: 'line',
      data: {
        labels: last12.map(r => r.month.split(' ')[0]),
        datasets: [{
          label: 'Savings Rate %',
          data: rates,
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99,102,241,0.10)',
          fill: true, tension: 0.4,
          pointBackgroundColor: rates.map(r => r >= 0 ? '#6366f1' : '#ef4444'),
          pointRadius: 4,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => `${ctx.raw}%` } },
        },
        scales: {
          y: { grid: { color: '#f1f5f9' }, ticks: { callback: v => v + '%' } },
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
      const val = inv.units * inv.currentPrice;
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
        let netUnits = 0, costBasis = 0;
        (inv.transactions || []).forEach(tx => {
          if (new Date(tx.date) <= cutoff) {
            if (tx.action === 'BUY')  { netUnits += tx.units; costBasis += tx.units * tx.price; }
            if (tx.action === 'SELL') { netUnits -= tx.units; costBasis -= tx.units * tx.price; }
          }
        });
        if (netUnits > 0) {
          invested += costBasis;
          current  += netUnits * inv.currentPrice;
        }
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

  /* ---- 6. Wealth Accumulation (stacked area) ---- */
  const wealthCtx = document.getElementById('wealthChart')?.getContext('2d');
  if (wealthCtx) {
    const wLabels = [], wInvData = [], wGoalsData = [], wEFData = [];
    const now = new Date();
    const curYM = now.getFullYear() * 12 + now.getMonth(); // current real month

    for (let offset = 11; offset >= 0; offset--) {
      let mI = currentMonthIdx - offset;
      let yr = currentYear;
      while (mI < 0) { mI += 12; yr--; }
      const row = savingsRowForMonth(mI, yr);
      if (!row) continue;

      const cutoff = new Date(yr, mI + 1, 0);           // last day of this month
      const thisYM = yr * 12 + mI;
      const isCurrent = thisYM >= curYM;                 // current or future month

      /* Investment value: cost basis for past months, current market value for current month */
      let invVal = 0;
      investments.forEach(inv => {
        let netUnits = 0, costBasis = 0;
        (inv.transactions || []).forEach(tx => {
          if (new Date(tx.date) <= cutoff) {
            if (tx.action === 'BUY')  { netUnits += tx.units; costBasis += tx.units * tx.price; }
            if (tx.action === 'SELL') { netUnits -= tx.units; costBasis -= tx.units * tx.price; }
          }
        });
        if (netUnits > 0) {
          invVal += isCurrent ? (netUnits * inv.currentPrice) : costBasis;
        }
      });

      /* Goals: scale linearly toward current value for past months */
      const goalCurrent = savingsGoals.reduce((s, g) => s + g.current, 0);
      const monthsFromNow = curYM - thisYM;
      const progressFactor = monthsFromNow <= 0 ? 1 : Math.max(0.1, 1 - monthsFromNow * 0.07);
      const goalVal = Math.round(goalCurrent * progressFactor);

      /* Emergency Fund: use actual cumulative contributions */
      const efVal = efBalanceUpTo(mI, yr);

      wLabels.push(row.month.replace(' 20', " '"));
      wInvData.push(invVal);
      wGoalsData.push(goalVal);
      wEFData.push(efVal);
    }

    chartWealth = new Chart(wealthCtx, {
      type: 'line',
      data: {
        labels: wLabels,
        datasets: [
          {
            label: 'Investments', data: wInvData,
            borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.25)',
            fill: 'origin', tension: 0.4, pointRadius: 3, borderWidth: 2, order: 3,
          },
          {
            label: 'Savings Goals', data: wGoalsData,
            borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.2)',
            fill: '-1', tension: 0.4, pointRadius: 3, borderWidth: 2, order: 2,
          },
          {
            label: 'Emergency Fund', data: wEFData,
            borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.2)',
            fill: '-1', tension: 0.4, pointRadius: 3, borderWidth: 2, order: 1,
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
              label: ctx => ` ${ctx.dataset.label}: ${fmt(ctx.raw)}`,
              afterBody(items) {
                const idx = items[0]?.dataIndex;
                if (idx == null) return '';
                const total = wInvData[idx] + wGoalsData[idx] + wEFData[idx];
                return `\n  Total Wealth: ${fmt(total)}`;
              },
            },
          },
        },
        scales: {
          y: {
            stacked: true,
            grid: { color: '#f1f5f9' },
            ticks: { callback: v => '₹' + (v / 1000).toFixed(0) + 'k' },
            title: { display: true, text: 'Wealth (₹)', font: { size: 11 } },
          },
          x: { grid: { display: false } },
        },
      },
    });
  }

  /* Update expense chart subtitle */
  const subEl = document.getElementById('expenseChartSubtitle');
  if (subEl) subEl.textContent = `${MONTHS[currentMonthIdx]} ${currentYear}`;

  /* ---- 7. Expense Trend (line + bar, last 12 months) ---- */
  const expTrendCtx = document.getElementById('expenseTrendChart')?.getContext('2d');
  if (expTrendCtx) {
    const etLabels = [], etTotals = [], etCounts = [];
    const catSeries = {};  // category -> array of amounts
    for (let i = 11; i >= 0; i--) {
      let mI = currentMonthIdx - i, yr = currentYear;
      while (mI < 0)  { mI += 12; yr--; }
      while (mI > 11) { mI -= 12; yr++; }
      const label = `${MONTHS[mI].slice(0, 3)} ${String(yr).slice(2)}`;
      etLabels.push(label);
      const mExp = expensesForYM(mI, yr);
      etTotals.push(mExp.reduce((s, e) => s + e.amount, 0));
      etCounts.push(mExp.length);
      // per-category breakdown
      const catMap = {};
      mExp.forEach(e => { catMap[e.category] = (catMap[e.category] || 0) + e.amount; });
      for (const cat of Object.keys(categoryConfig)) {
        if (!catSeries[cat]) catSeries[cat] = [];
        catSeries[cat].push(catMap[cat] || 0);
      }
    }
    // Stacked bar datasets for categories
    const barDatasets = Object.entries(catSeries)
      .filter(([, vals]) => vals.some(v => v > 0))
      .map(([cat, vals], idx) => ({
        label: categoryConfig[cat]?.label || cat,
        data: vals,
        backgroundColor: (PALETTE[Object.keys(categoryConfig).indexOf(cat)] || '#94a3b8') + 'CC',
        stack: 'cats',
        type: 'bar',
        order: 2,
        barPercentage: 0.7,
        categoryPercentage: 0.8,
      }));
    // Total line overlay
    const lineDataset = {
      label: 'Total',
      data: etTotals,
      borderColor: '#ef4444',
      backgroundColor: 'rgba(239,68,68,0.08)',
      borderWidth: 2.5,
      pointRadius: 4,
      pointBackgroundColor: '#ef4444',
      tension: 0.3,
      fill: true,
      type: 'line',
      order: 1,
      yAxisID: 'y',
    };
    chartExpTrend = new Chart(expTrendCtx, {
      data: {
        labels: etLabels,
        datasets: [...barDatasets, lineDataset],
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
                return idx != null ? `${etCounts[idx]} transactions` : '';
              },
            },
          },
        },
        scales: {
          y: {
            stacked: true,
            ticks: { callback: v => v >= 1000 ? (v / 1000).toFixed(0) + 'K' : v },
            title: { display: true, text: 'Amount (\u20b9)' },
          },
          x: { stacked: true, grid: { display: false } },
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
  const monthExp = expensesForYM(currentMonthIdx, currentYear);
  const curRow = savingsRowForMonth(currentMonthIdx, currentYear);
  const income = curRow?.income || 0;

  const periodLabel = `${MONTHS[currentMonthIdx]} ${currentYear}`;
  const total = monthExp.reduce((s, e) => s + e.amount, 0);
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

  chartExpCatPie = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
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
  renderSavingsTable();
  renderExpensesTable();
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

document.getElementById('expenseForm')?.addEventListener('submit', e => {
  e.preventDefault();
  const form = e.target;
  expenses.push({
    id:          Date.now(),
    date:        form.date.value,
    description: form.description.value.trim(),
    category:    form.category.value,
    payment:     form.payment.value,
    amount:      parseFloat(form.amount.value),
  });
  saveExpenses();
  refreshDashboard();
  closeModal('expenseModal');
});

document.getElementById('investmentForm')?.addEventListener('submit', e => {
  e.preventDefault();
  const form = e.target;
  const cat  = form.type.value;
  const inv  = {
    id:           Date.now(),
    asset:        form.asset.value.trim().toUpperCase(),
    name:         form.querySelector('#invName').value.trim() || form.asset.value.trim(),
    category:     cat,
    units:        parseFloat(form.units.value),
    buyPrice:     parseFloat(form.buyPrice.value),
    currentPrice: parseFloat(form.currentPrice.value),
    date:         form.date.value,
  };
  if (marketCategories.includes(cat)) {
    inv.marketCap = form.querySelector('#invMarketCap')?.value || 'large';
    inv.riskLevel = form.querySelector('#invRiskLevel')?.value || 'moderate';
  }
  /* Auto-derive ticker from asset code for price lookups */
  const asset = inv.asset;
  if (cat === 'stocks') {
    inv.ticker = asset.includes('.') ? asset : asset + '.NS';    // default to NSE
  } else if (cat === 'foreign_stocks') {
    inv.ticker = asset;                                          // user enters full ticker e.g. AAPL
  }
  const scheme = form.querySelector('#invSchemeCode')?.value.trim();
  if (scheme) inv.schemeCode = scheme;

  inv.transactions = [{ date: inv.date, action: 'BUY', units: inv.units, price: inv.buyPrice }];
  investments.push(inv);
  saveInvestments();
  renderAfterInvestmentChange();
  closeModal('investmentModal');
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
  document.querySelectorAll('input[type="date"]').forEach(el => { el.value = today; });

  // Load data from server (or fall back to mocks)
  await loadAllData();

  // Show server status badge
  const badge = document.getElementById('serverBadge');
  if (badge) {
    badge.textContent = serverAvailable ? '🟢 Server' : '🟡 Offline';
    badge.title = serverAvailable ? 'Data saved to data.xlsx' : 'Server offline — data resets on refresh';
  }

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
  renderRecentTransactions();
  renderInvestmentSnapshot();
  renderExpensesTable();
  renderInvestmentsTable();
  renderSavingsCards();
  renderSavingsTable();
  renderGoals();
  renderEmergencyFund();
  renderDashboardCards();

  // Charts
  initCharts();

  // Documents browser
  initDocumentEvents();

  // Month display
  updateMonthDisplay();
});
