/* ============================================================
   MOCK DATA  (will be replaced by backend calls later)
   ============================================================ */

const expenses = [
  { id: 1,  date: '2026-04-01', description: 'Monthly Rent',          category: 'housing',       payment: 'transfer', amount: 1200.00 },
  { id: 2,  date: '2026-04-03', description: 'Grocery Store',         category: 'food',          payment: 'debit',    amount: 142.50 },
  { id: 3,  date: '2026-04-05', description: 'Flight Tickets – NYC',  category: 'travel',        payment: 'card',     amount: 380.00 },
  { id: 4,  date: '2026-04-07', description: 'Netflix + Spotify',     category: 'entertainment', payment: 'card',     amount: 26.00 },
  { id: 5,  date: '2026-04-08', description: 'Doctor Visit + Meds',   category: 'health',        payment: 'card',     amount: 95.00 },
  { id: 6,  date: '2026-04-09', description: 'Electricity Bill',      category: 'utilities',     payment: 'transfer', amount: 78.00 },
  { id: 7,  date: '2026-04-10', description: 'Lunch with Team',       category: 'food',          payment: 'card',     amount: 62.00 },
  { id: 8,  date: '2026-04-11', description: 'Amazon – Headphones',   category: 'shopping',      payment: 'card',     amount: 134.99 },
  { id: 9,  date: '2026-04-11', description: 'Uber Rides',            category: 'travel',        payment: 'card',     amount: 48.00 },
  { id: 10, date: '2026-04-12', description: 'Phone Bill',            category: 'utilities',     payment: 'transfer', amount: 55.00 },
  { id: 11, date: '2026-04-12', description: 'Dinner – Restaurant',   category: 'food',          payment: 'card',     amount: 88.51 },
  { id: 12, date: '2026-04-12', description: 'Internet Bill',         category: 'utilities',     payment: 'transfer', amount: 65.00 },
  { id: 13, date: '2026-04-12', description: 'Gym Membership',        category: 'health',        payment: 'card',     amount: 65.00 },
];

const investments = [
  { id: 1, asset: 'AAPL',  name: 'Apple Inc.',               type: 'stock',  units: 50,   buyPrice: 160.00,  currentPrice: 195.40  },
  { id: 2, asset: 'VOO',   name: 'Vanguard S&P 500 ETF',     type: 'etf',    units: 30,   buyPrice: 380.00,  currentPrice: 445.20  },
  { id: 3, asset: 'MSFT',  name: 'Microsoft Corp.',          type: 'stock',  units: 20,   buyPrice: 290.00,  currentPrice: 342.50  },
  { id: 4, asset: 'BTC',   name: 'Bitcoin',                  type: 'crypto', units: 0.5,  buyPrice: 42000.00,currentPrice: 68500.00},
  { id: 5, asset: 'VTI',   name: 'Vanguard Total Market ETF',type: 'etf',    units: 25,   buyPrice: 210.00,  currentPrice: 238.75  },
];

const savingsHistory = [
  { month: 'May 2025',  income: 6000, expenses: 3800, saved: 2200 },
  { month: 'Jun 2025',  income: 6000, expenses: 3500, saved: 2500 },
  { month: 'Jul 2025',  income: 6200, expenses: 4100, saved: 2100 },
  { month: 'Aug 2025',  income: 6200, expenses: 3600, saved: 2600 },
  { month: 'Sep 2025',  income: 6200, expenses: 3200, saved: 3000 },
  { month: 'Oct 2025',  income: 6500, expenses: 3400, saved: 3100 },
  { month: 'Nov 2025',  income: 6500, expenses: 3900, saved: 2600 },
  { month: 'Dec 2025',  income: 6500, expenses: 4500, saved: 2000 },
  { month: 'Jan 2026',  income: 6500, expenses: 3300, saved: 3200 },
  { month: 'Feb 2026',  income: 6500, expenses: 3100, saved: 3400 },
  { month: 'Mar 2026',  income: 6500, expenses: 3450, saved: 3050 },
  { month: 'Apr 2026',  income: 6500, expenses: 3240, saved: 3260 },
];

const savingsGoals = [
  { id: 1, name: 'Emergency Fund',    icon: '🏥', target: 20000, current: 15000, deadline: '2026-12-31' },
  { id: 2, name: 'Vacation – Japan',  icon: '✈️', target: 5000,  current: 3200,  deadline: '2026-09-01' },
  { id: 3, name: 'New Laptop',        icon: '💻', target: 2500,  current: 2500,  deadline: '2026-06-01' },
  { id: 4, name: 'Home Down Payment', icon: '🏠', target: 80000, current: 22000, deadline: '2028-12-31' },
  { id: 5, name: 'Wedding Fund',      icon: '💍', target: 25000, current: 8500,  deadline: '2027-06-01' },
];


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
  stock: 'Stock', etf: 'ETF', crypto: 'Crypto',
  bond: 'Bond', real_estate: 'Real Estate', other: 'Other',
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
   NAVIGATION
   ============================================================ */
const sectionMeta = {
  dashboard:   ['Dashboard',   'Overview of your finances'],
  expenses:    ['Expenses',    'Track and manage your spending'],
  investments: ['Investments', 'Monitor your investment portfolio'],
  savings:     ['Savings',     'Your savings goals and history'],
};

function navigateTo(section) {
  document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  document.getElementById('section-' + section)?.classList.add('active');
  document.querySelector(`.nav-item[data-section="${section}"]`)?.classList.add('active');

  const [title, subtitle] = sectionMeta[section] || ['', ''];
  document.getElementById('pageTitle').textContent    = title;
  document.getElementById('pageSubtitle').textContent = subtitle;
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
  if (section === 'investments') openModal('investmentModal');
  else if (section === 'savings') openModal('goalModal');
  else openModal('expenseModal'); // dashboard or expenses
});

document.getElementById('addExpenseBtn')?.addEventListener('click',    () => openModal('expenseModal'));
document.getElementById('addInvestmentBtn')?.addEventListener('click', () => openModal('investmentModal'));
document.getElementById('addGoalBtn')?.addEventListener('click',       () => openModal('goalModal'));


/* ============================================================
   MODAL HELPERS
   ============================================================ */
function openModal(id) {
  document.getElementById(id)?.classList.add('open');
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
  document.getElementById(id)?.querySelector('form')?.reset();
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

  const recent = expenses.slice(-5).reverse();
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

  el.innerHTML = investments.map(inv => {
    const value   = inv.units * inv.currentPrice;
    const gainPct = ((inv.currentPrice - inv.buyPrice) / inv.buyPrice * 100).toFixed(1);
    const isPos   = parseFloat(gainPct) >= 0;
    return `
      <div class="inv-item">
        <div class="inv-ticker">${escHtml(inv.asset)}</div>
        <div class="inv-info">
          <div class="inv-name">${escHtml(inv.name)}</div>
          <div class="inv-type">${(typeLabels[inv.type] || inv.type).toUpperCase()}</div>
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
let expFilterYear   = 'all';
let expFilterMonth  = 'all';
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
  populateYearDropdown();
}

/* Populate year dropdown from current expenses data */
function populateYearDropdown() {
  const sel = document.getElementById('filterYear');
  if (!sel) return;
  const years = [...new Set(expenses.map(e => e.date.slice(0, 4)))].sort((a,b) => b-a);
  const current = sel.value;
  sel.innerHTML = '<option value="all">All Years</option>' +
    years.map(y => `<option value="${y}" ${y === current ? 'selected' : ''}>${y}</option>`).join('');
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
      renderExpensesTable();
      renderRecentTransactions();
    }
  }
});

// Event delegation — delete investment rows
document.getElementById('investmentsTableBody')?.addEventListener('click', e => {
  const btn = e.target.closest('.action-btn.delete');
  if (!btn) return;
  const id = parseInt(btn.dataset.id);
  if (confirm('Delete this investment?')) {
    const idx = investments.findIndex(x => x.id === id);
    if (idx !== -1) {
      investments.splice(idx, 1);
      renderInvestmentsTable();
      renderInvestmentSnapshot();
    }
  }
});

// Clear all buttons
document.getElementById('clearExpensesBtn')?.addEventListener('click', () => {
  if (confirm('Clear ALL expense entries? This cannot be undone.')) {
    expenses.length = 0;
    renderExpensesTable();
    renderRecentTransactions();
  }
});

document.getElementById('clearInvestmentsBtn')?.addEventListener('click', () => {
  if (confirm('Clear ALL investment holdings? This cannot be undone.')) {
    investments.length = 0;
    renderInvestmentsTable();
    renderInvestmentSnapshot();
  }
});

document.getElementById('clearGoalsBtn')?.addEventListener('click', () => {
  if (confirm('Clear ALL savings goals? This cannot be undone.')) {
    savingsGoals.length = 0;
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

// Year / Month / GroupBy filter change
document.getElementById('filterYear')?.addEventListener('change', e => {
  expFilterYear = e.target.value;
  renderExpensesTable();
});

document.getElementById('filterMonth')?.addEventListener('change', e => {
  expFilterMonth = e.target.value;
  renderExpensesTable();
});

document.getElementById('filterGroupBy')?.addEventListener('change', e => {
  expGroupByMonth = e.target.value === 'month';
  renderExpensesTable();
});


/* ============================================================
   RENDER: INVESTMENTS TABLE
   ============================================================ */
function renderInvestmentsTable() {
  const tbody = document.getElementById('investmentsTableBody');
  if (!tbody) return;

  tbody.innerHTML = investments.map(inv => {
    const invested   = inv.units * inv.buyPrice;
    const currentVal = inv.units * inv.currentPrice;
    const gain       = currentVal - invested;
    const gainPct    = (gain / invested * 100).toFixed(2);
    const isPos      = gain >= 0;
    return `
      <tr>
        <td>
          <strong>${escHtml(inv.asset)}</strong><br>
          <small style="color:var(--text-muted)">${escHtml(inv.name)}</small>
        </td>
        <td>${typeLabels[inv.type] || inv.type}</td>
        <td>${inv.units}</td>
        <td>${fmt(inv.buyPrice)}</td>
        <td>${fmt(inv.currentPrice)}</td>
        <td style="font-weight:600;">${fmt(currentVal)}</td>
        <td class="${isPos ? 'gain-positive' : 'gain-negative'}">${isPos ? '+' : ''}${fmt(gain)}</td>
        <td class="${isPos ? 'gain-positive' : 'gain-negative'}">${isPos ? '+' : ''}${gainPct}%</td>
        <td>
          <button class="action-btn edit"   title="Edit"   data-id="${inv.id}">✏️</button>
          <button class="action-btn delete" title="Delete" data-id="${inv.id}">🗑️</button>
        </td>
      </tr>`;
  }).join('');
}


/* ============================================================
   RENDER: SAVINGS TABLE
   ============================================================ */
function renderSavingsTable() {
  const tbody = document.getElementById('savingsTableBody');
  if (!tbody) return;

  let cumulative = 0;
  tbody.innerHTML = savingsHistory.map(row => {
    cumulative += row.saved;
    const rate   = (row.saved / row.income * 100).toFixed(1);
    const isGood = parseFloat(rate) >= 30;
    return `
      <tr>
        <td style="font-weight:500;">${row.month}</td>
        <td style="color:var(--success); font-weight:600;">${fmt(row.income)}</td>
        <td style="color:var(--danger);">-${fmt(row.expenses)}</td>
        <td style="font-weight:700;">${fmt(row.saved)}</td>
        <td>
          <span style="color:${isGood ? 'var(--success)' : 'var(--warning)'}; font-weight:600;">
            ${rate}%
          </span>
        </td>
        <td style="font-weight:600;">${fmt(cumulative)}</td>
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
        if (idx !== -1) { savingsGoals.splice(idx, 1); renderGoals(); }
      }
    });
  });
}


/* ============================================================
   CHARTS  (Chart.js 4)
   ============================================================ */
// Chart palette
const PALETTE = ['#6366f1','#10b981','#f59e0b','#ef4444','#3b82f6','#ec4899','#06b6d4','#94a3b8'];

function initCharts() {

  /* ---- 1. Expense Breakdown (donut) ---- */
  const expCtx = document.getElementById('expenseChart')?.getContext('2d');
  if (expCtx) {
    const catTotals = {};
    expenses.forEach(e => { catTotals[e.category] = (catTotals[e.category] || 0) + e.amount; });
    const labels = Object.keys(catTotals).map(k => categoryConfig[k]?.label || k);
    const data   = Object.values(catTotals);
    const total  = data.reduce((a, b) => a + b, 0);

    new Chart(expCtx, {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: PALETTE, borderWidth: 2, borderColor: '#fff', hoverOffset: 6 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.label}: ${fmt(ctx.raw)}  (${Math.round(ctx.raw / total * 100)}%)`,
            },
          },
        },
        cutout: '64%',
      },
    });

    // Custom legend
    const legendEl = document.getElementById('expenseLegend');
    if (legendEl) {
      legendEl.innerHTML = labels.map((l, i) => `
        <div class="legend-item">
          <div class="legend-dot" style="background:${PALETTE[i]}"></div>
          <span>${l}</span>
        </div>`).join('');
    }
  }

  /* ---- 2. Savings vs Expenses Trend (line) ---- */
  const savCtx = document.getElementById('savingsChart')?.getContext('2d');
  if (savCtx) {
    const last6 = savingsHistory.slice(-6);
    new Chart(savCtx, {
      type: 'line',
      data: {
        labels: last6.map(r => r.month.split(' ')[0]),
        datasets: [
          {
            label: 'Saved', data: last6.map(r => r.saved),
            borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.10)',
            fill: true, tension: 0.4, pointBackgroundColor: '#6366f1', pointRadius: 4,
          },
          {
            label: 'Expenses', data: last6.map(r => r.expenses),
            borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.06)',
            fill: true, tension: 0.4, pointBackgroundColor: '#ef4444', pointRadius: 4,
          },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top', labels: { font: { size: 11 }, boxWidth: 12 } } },
        scales: {
          y: { beginAtZero: false, grid: { color: '#f1f5f9' }, ticks: { callback: v => '$' + v.toLocaleString() } },
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
      typeTotals[inv.type] = (typeTotals[inv.type] || 0) + val;
    });
    new Chart(portCtx, {
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

  /* ---- 4. Portfolio Performance (line) ---- */
  const perfCtx = document.getElementById('performanceChart')?.getContext('2d');
  if (perfCtx) {
    const months = ['May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr'];
    const values = [72000,74500,71000,76000,79500,82000,80000,85000,88000,92000,96000,98750];
    new Chart(perfCtx, {
      type: 'line',
      data: {
        labels: months,
        datasets: [{
          label: 'Portfolio Value', data: values,
          borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.10)',
          fill: true, tension: 0.4, pointBackgroundColor: '#10b981', pointRadius: 3,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { grid: { color: '#f1f5f9' }, ticks: { callback: v => '$' + (v / 1000).toFixed(0) + 'k' } },
          x: { grid: { display: false } },
        },
      },
    });
  }

  /* ---- 5. Monthly Savings History (grouped bar) ---- */
  const savHistCtx = document.getElementById('savingsHistoryChart')?.getContext('2d');
  if (savHistCtx) {
    new Chart(savHistCtx, {
      type: 'bar',
      data: {
        labels: savingsHistory.map(r => r.month.replace(' 20', " '")),
        datasets: [
          { label: 'Income',   data: savingsHistory.map(r => r.income),   backgroundColor: 'rgba(99,102,241,0.75)',  borderRadius: 4 },
          { label: 'Expenses', data: savingsHistory.map(r => r.expenses), backgroundColor: 'rgba(239,68,68,0.75)',   borderRadius: 4 },
          { label: 'Saved',    data: savingsHistory.map(r => r.saved),    backgroundColor: 'rgba(16,185,129,0.85)',  borderRadius: 4 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top', labels: { font: { size: 11 }, boxWidth: 14 } } },
        scales: {
          y: { grid: { color: '#f1f5f9' }, ticks: { callback: v => '₹' + v.toLocaleString('en-IN') } },
          x: { grid: { display: false } },
        },
      },
    });
  }
}


/* ============================================================
   MONTH NAVIGATION
   ============================================================ */
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];
let currentMonthIdx = 3;  // April
let currentYear     = 2026;

function updateMonthDisplay() {
  document.getElementById('currentMonth').textContent = `${MONTHS[currentMonthIdx]} ${currentYear}`;
}

document.getElementById('prevMonth')?.addEventListener('click', () => {
  currentMonthIdx--;
  if (currentMonthIdx < 0) { currentMonthIdx = 11; currentYear--; }
  updateMonthDisplay();
});

document.getElementById('nextMonth')?.addEventListener('click', () => {
  currentMonthIdx++;
  if (currentMonthIdx > 11) { currentMonthIdx = 0; currentYear++; }
  updateMonthDisplay();
});


/* ============================================================
   FORM SUBMISSIONS  (front-end only — appends to local array)
   ============================================================ */

document.getElementById('expenseForm')?.addEventListener('submit', e => {
  e.preventDefault();
  const form = e.target;
  expenses.push({
    id:          expenses.length + 1,
    date:        form.date.value,
    description: form.description.value.trim(),
    category:    form.category.value,
    payment:     form.payment.value,
    amount:      parseFloat(form.amount.value),
  });
  renderExpensesTable();
  renderRecentTransactions();
  closeModal('expenseModal');
});

document.getElementById('investmentForm')?.addEventListener('submit', e => {
  e.preventDefault();
  const form = e.target;
  investments.push({
    id:           investments.length + 1,
    asset:        form.asset.value.trim().toUpperCase(),
    name:         form.asset.value.trim(),
    type:         form.type.value,
    units:        parseFloat(form.units.value),
    buyPrice:     parseFloat(form.buyPrice.value),
    currentPrice: parseFloat(form.currentPrice.value),
  });
  renderInvestmentsTable();
  renderInvestmentSnapshot();
  closeModal('investmentModal');
});

document.getElementById('goalForm')?.addEventListener('submit', e => {
  e.preventDefault();
  const form = e.target;
  savingsGoals.push({
    id:       savingsGoals.length + 1,
    name:     form.name.value.trim(),
    icon:     form.icon.value,
    target:   parseFloat(form.target.value),
    current:  parseFloat(form.current.value) || 0,
    deadline: form.date.value,
  });
  renderGoals();
  closeModal('goalModal');
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
   INITIALISE
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  // Set today's date as default in date inputs
  const today = todayISO();
  document.querySelectorAll('input[type="date"]').forEach(el => { el.value = today; });

  // Render all data
  renderRecentTransactions();
  renderInvestmentSnapshot();
  renderExpensesTable();
  renderInvestmentsTable();
  renderSavingsTable();
  renderGoals();

  // Charts
  initCharts();

  // Month display
  updateMonthDisplay();
});
