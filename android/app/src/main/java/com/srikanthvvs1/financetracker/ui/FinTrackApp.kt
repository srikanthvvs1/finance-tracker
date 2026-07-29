package com.srikanthvvs1.financetracker.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ReceiptLong
import androidx.compose.material.icons.automirrored.outlined.ShowChart
import androidx.compose.material.icons.outlined.AccountBalance
import androidx.compose.material.icons.outlined.Dashboard
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.srikanthvvs1.financetracker.data.FinanceRepository
import com.srikanthvvs1.financetracker.data.FinanceSnapshot
import com.srikanthvvs1.financetracker.data.ImportSummary
import com.srikanthvvs1.financetracker.data.Investment
import com.srikanthvvs1.financetracker.data.InvestmentAction
import com.srikanthvvs1.financetracker.data.Account
import com.srikanthvvs1.financetracker.data.AccountTransfer
import com.srikanthvvs1.financetracker.data.Expense
import com.srikanthvvs1.financetracker.data.InvestmentTransaction
import com.srikanthvvs1.financetracker.domain.FinancialFlow
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.math.BigDecimal
import java.text.NumberFormat
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.util.Locale

private data class Destination(val label: String, val icon: ImageVector)
private val destinations = listOf(
    Destination("Dashboard", Icons.Outlined.Dashboard),
    Destination("Accounts", Icons.Outlined.AccountBalance),
    Destination("Expenses", Icons.AutoMirrored.Outlined.ReceiptLong),
    Destination("Investments", Icons.AutoMirrored.Outlined.ShowChart),
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FinTrackApp() {
    val context = LocalContext.current
    val repository = remember { FinanceRepository(context) }
    val scope = rememberCoroutineScope()
    var selected by remember { mutableIntStateOf(0) }
    var snapshot by remember { mutableStateOf(repository.snapshot()) }
    var sourceName by remember { mutableStateOf(repository.sourceName()) }
    var importing by remember { mutableStateOf(false) }
    var importMessage by remember { mutableStateOf<String?>(null) }
    val workbookPicker = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenDocument(),
    ) { uri ->
        if (uri != null) {
            importing = true
            importMessage = null
            scope.launch {
                val result = runCatching {
                    withContext(Dispatchers.IO) { repository.importWorkbook(uri) }
                }
                result.onSuccess { summary ->
                    snapshot = withContext(Dispatchers.IO) { repository.snapshot() }
                    sourceName = repository.sourceName()
                    importMessage = summary.message()
                }.onFailure { error ->
                    importMessage = error.message ?: "Import failed."
                }
                importing = false
            }
        }
    }

    Scaffold(
        topBar = { TopAppBar(title = { Text("FinTrack") }) },
        bottomBar = {
            NavigationBar {
                destinations.forEachIndexed { index, destination ->
                    NavigationBarItem(
                        selected = selected == index,
                        onClick = { selected = index },
                        icon = { Icon(destination.icon, contentDescription = destination.label) },
                        label = { Text(destination.label) },
                    )
                }
            }
        },
    ) { padding ->
        when (selected) {
            0 -> DashboardScreen(
                snapshot = snapshot,
                sourceName = sourceName,
                importing = importing,
                importMessage = importMessage,
                onImport = {
                    workbookPicker.launch(
                        arrayOf(
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        ),
                    )
                },
                padding = padding,
            )
            1 -> AccountsScreen(
                snapshot = snapshot,
                padding = padding,
                onAddAccount = {
                    repository.addAccount(it)
                    snapshot = repository.snapshot()
                },
                onAddTransfer = {
                    repository.addTransfer(it)
                    snapshot = repository.snapshot()
                },
                onDeleteTransfer = {
                    repository.deleteTransfer(it)
                    snapshot = repository.snapshot()
                },
            )
            2 -> ExpensesScreen(
                snapshot = snapshot,
                padding = padding,
                onAddExpense = {
                    repository.addExpense(it)
                    snapshot = repository.snapshot()
                },
                onDeleteExpense = {
                    repository.deleteExpense(it)
                    snapshot = repository.snapshot()
                },
            )
            else -> InvestmentsScreen(
                snapshot = snapshot,
                padding = padding,
                onAddInvestment = {
                    repository.addInvestment(it)
                    snapshot = repository.snapshot()
                },
                onAddTransaction = {
                    repository.addInvestmentTransaction(it)
                    snapshot = repository.snapshot()
                },
            )
        }
    }
}

@Composable
private fun DashboardScreen(
    snapshot: FinanceSnapshot,
    sourceName: String?,
    importing: Boolean,
    importMessage: String?,
    onImport: () -> Unit,
    padding: PaddingValues,
) {
    val invested = snapshot.investments.sumOf { investmentCost(it) }
    val currentValue = snapshot.investments.sumOf { investmentValue(it) }
    val income = currentMonthIncome(snapshot)
    val expenses = currentMonthExpenses(snapshot)
    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(padding),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Text("Your financial flow", style = MaterialTheme.typography.headlineSmall)
            Text(
                sourceName?.let { "Local data imported from $it" }
                    ?: "Import data.xlsx to restore your desktop history.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(12.dp))
            Button(onClick = onImport, enabled = !importing) {
                if (importing) {
                    CircularProgressIndicator(
                        modifier = Modifier.height(20.dp),
                        strokeWidth = 2.dp,
                    )
                } else {
                    Text(if (sourceName == null) "Import data.xlsx" else "Replace from data.xlsx")
                }
            }
            importMessage?.let {
                Spacer(Modifier.height(8.dp))
                Text(it, color = MaterialTheme.colorScheme.primary)
            }
        }
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                SummaryCard("Portfolio value", money(currentValue), Modifier.weight(1f))
                SummaryCard("Invested cost", money(invested), Modifier.weight(1f))
            }
        }
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                SummaryCard("Monthly income", money(income), Modifier.weight(1f))
                SummaryCard("Monthly expenses", money(expenses), Modifier.weight(1f))
            }
        }
        item {
            SummaryCard(
                "Connected records",
                "${snapshot.accounts.size} accounts · ${snapshot.investments.size} investments · " +
                    "${snapshot.investments.sumOf { it.transactions.size }} investment transactions",
                Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
private fun AccountsScreen(
    snapshot: FinanceSnapshot,
    padding: PaddingValues,
    onAddAccount: (Account) -> Unit,
    onAddTransfer: (AccountTransfer) -> Unit,
    onDeleteTransfer: (Long) -> Unit,
) {
    var showAccountDialog by remember { mutableStateOf(false) }
    var showTransferDialog by remember { mutableStateOf(false) }
    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(padding),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            Text("Accounts & transfers", style = MaterialTheme.typography.headlineMedium)
            Text(
                "Every income, expense, transfer and investment changes its linked account.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = { showAccountDialog = true }) { Text("Add account") }
                Button(
                    onClick = { showTransferDialog = true },
                    enabled = snapshot.accounts.size >= 2,
                ) { Text("Record transfer") }
            }
        }
        items(snapshot.accounts) { account ->
            RecordCard(
                title = account.name,
                subtitle = "${account.bank.orEmpty()} · ${account.purpose.name.lowercase()}",
                value = money(FinancialFlow.trackedBalance(snapshot, account.id)),
                detail = "Bank statement ${money(account.statementBalance)}",
            )
        }
        if (snapshot.transfers.isNotEmpty()) {
            item { Text("Recent transfers", style = MaterialTheme.typography.titleLarge) }
            items(snapshot.transfers.take(25)) { transfer ->
                val names = snapshot.accounts.associate { it.id to it.name }
                RecordCard(
                    title = "${names[transfer.fromAccountId]} → ${names[transfer.toAccountId]}",
                    subtitle = "${transfer.date} · ${transfer.note.orEmpty()}",
                    value = money(transfer.amount),
                    detail = "Internal transfer—not income or expense",
                    onDelete = { onDeleteTransfer(transfer.id) },
                )
            }
        }
    }
    if (showAccountDialog) {
        AddAccountDialog(
            onDismiss = { showAccountDialog = false },
            onSave = {
                onAddAccount(it)
                showAccountDialog = false
            },
        )
    }
    if (showTransferDialog) {
        AddTransferDialog(
            accounts = snapshot.accounts,
            onDismiss = { showTransferDialog = false },
            onSave = {
                onAddTransfer(it)
                showTransferDialog = false
            },
        )
    }
}

@Composable
private fun ExpensesScreen(
    snapshot: FinanceSnapshot,
    padding: PaddingValues,
    onAddExpense: (Expense) -> Unit,
    onDeleteExpense: (Long) -> Unit,
) {
    var showDialog by remember { mutableStateOf(false) }
    val accountNames = snapshot.accounts.associate { it.id to it.name }
    DataList(
        title = "Expenses",
        subtitle = "${snapshot.expenses.size} locally stored expenses",
        emptyMessage = "No expenses exist in the imported workbook.",
        padding = padding,
        items = snapshot.expenses,
        actions = {
            Button(onClick = { showDialog = true }, enabled = snapshot.accounts.isNotEmpty()) {
                Text("Add expense")
            }
        },
    ) { expense ->
        RecordCard(
            title = expense.description,
            subtitle = "${expense.date} · ${expense.category}",
            value = "-${money(expense.amount)}",
            detail = accountNames[expense.accountId] ?: "Unknown account",
            onDelete = { onDeleteExpense(expense.id) },
        )
    }
    if (showDialog) {
        AddExpenseDialog(
            accounts = snapshot.accounts,
            onDismiss = { showDialog = false },
            onSave = {
                onAddExpense(it)
                showDialog = false
            },
        )
    }
}

@Composable
private fun InvestmentsScreen(
    snapshot: FinanceSnapshot,
    padding: PaddingValues,
    onAddInvestment: (Investment) -> Unit,
    onAddTransaction: (InvestmentTransaction) -> Unit,
) {
    var showHoldingDialog by remember { mutableStateOf(false) }
    var showTransactionDialog by remember { mutableStateOf(false) }
    DataList(
        title = "Investments",
        subtitle = "${snapshot.investments.size} holdings · " +
            "${snapshot.investments.sumOf { it.transactions.size }} transactions",
        emptyMessage = "No investments imported.",
        padding = padding,
        items = snapshot.investments,
        actions = {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = { showHoldingDialog = true }) { Text("Add holding") }
                Button(
                    onClick = { showTransactionDialog = true },
                    enabled = snapshot.investments.isNotEmpty() && snapshot.accounts.isNotEmpty(),
                ) { Text("Add transaction") }
            }
        },
    ) { investment ->
        val value = investmentValue(investment)
        val cost = investmentCost(investment)
        RecordCard(
            title = investment.name,
            subtitle = "${investment.category.replace('_', ' ')} · " +
                "${investment.transactions.size} transactions",
            value = money(value),
            detail = "Invested ${money(cost)} · ${signedMoney(value - cost)}",
        )
    }
    if (showHoldingDialog) {
        AddInvestmentDialog(
            accounts = snapshot.accounts,
            onDismiss = { showHoldingDialog = false },
            onSave = {
                onAddInvestment(it)
                showHoldingDialog = false
            },
        )
    }
    if (showTransactionDialog) {
        AddInvestmentTransactionDialog(
            investments = snapshot.investments,
            accounts = snapshot.accounts,
            onDismiss = { showTransactionDialog = false },
            onSave = {
                onAddTransaction(it)
                showTransactionDialog = false
            },
        )
    }
}

@Composable
private fun <T> DataList(
    title: String,
    subtitle: String,
    emptyMessage: String,
    padding: PaddingValues,
    items: List<T>,
    actions: @Composable () -> Unit = {},
    row: @Composable (T) -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(padding),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            Text(title, style = MaterialTheme.typography.headlineMedium)
            Text(subtitle, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(6.dp))
            actions()
            Spacer(Modifier.height(6.dp))
            HorizontalDivider()
        }
        if (items.isEmpty()) item { Text(emptyMessage) }
        else items(items) { row(it) }
    }
}

@Composable
private fun SummaryCard(title: String, value: String, modifier: Modifier = Modifier) {
    Card(modifier = modifier) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(title, style = MaterialTheme.typography.labelLarge)
            Text(value, style = MaterialTheme.typography.titleMedium)
        }
    }
}

@Composable
private fun RecordCard(
    title: String,
    subtitle: String,
    value: String,
    detail: String,
    onDelete: (() -> Unit)? = null,
) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                Text(value, style = MaterialTheme.typography.titleMedium)
            }
            Text(subtitle, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(
                detail,
                color = if (detail.startsWith("+")) Color(0xFF087F5B)
                else MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodySmall,
            )
            onDelete?.let {
                androidx.compose.material3.TextButton(onClick = it) { Text("Delete") }
            }
        }
    }
}

private fun investmentValue(investment: Investment): BigDecimal {
    if (investment.category in setOf("ppf", "fixed_deposit")) {
        return investment.transactions.fold(BigDecimal.ZERO) { total, transaction ->
            when (transaction.action) {
                InvestmentAction.DEPOSIT,
                InvestmentAction.INTEREST,
                InvestmentAction.ADJUSTMENT -> total + transaction.amount
                InvestmentAction.WITHDRAWAL -> total - transaction.amount
                else -> total
            }
        }
    }
    val units = investment.transactions.fold(BigDecimal.ZERO) { total, transaction ->
        when (transaction.action) {
            InvestmentAction.BUY -> total + transaction.units
            InvestmentAction.SELL -> total - transaction.units
            else -> total
        }
    }.takeIf { investment.transactions.isNotEmpty() } ?: investment.units
    return units.multiply(investment.currentPrice)
}

private fun investmentCost(investment: Investment): BigDecimal =
    investment.transactions.fold(BigDecimal.ZERO) { total, transaction ->
        when (transaction.action) {
            InvestmentAction.BUY, InvestmentAction.DEPOSIT -> total + transaction.amount
            InvestmentAction.WITHDRAWAL -> total - transaction.amount
            else -> total
        }
    }.takeIf { investment.transactions.isNotEmpty() }
        ?: investment.units.multiply(investment.buyPrice)

private fun currentMonthIncome(snapshot: FinanceSnapshot): BigDecimal {
    val key = YearMonth.now().format(DateTimeFormatter.ofPattern("MMM uuuu", Locale.ENGLISH))
    return snapshot.income.firstOrNull { it.month == key }?.amount ?: BigDecimal.ZERO
}

private fun currentMonthExpenses(snapshot: FinanceSnapshot): BigDecimal {
    val month = YearMonth.now()
    return snapshot.expenses.filter { YearMonth.from(it.date) == month }
        .fold(BigDecimal.ZERO) { total, expense -> total + expense.amount }
}

private val currencyFormat = NumberFormat.getCurrencyInstance(Locale.forLanguageTag("en-IN")).apply {
    maximumFractionDigits = 0
}
private fun money(value: BigDecimal): String = currencyFormat.format(value)
private fun signedMoney(value: BigDecimal): String =
    "${if (value.signum() >= 0) "+" else "-"}${money(value.abs())}"
private fun ImportSummary.message() =
    "Imported $accounts accounts, $investments investments, $transactions transactions, " +
        "$expenses expenses and $transfers transfers."
