package com.srikanthvvs1.financetracker.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.srikanthvvs1.financetracker.data.Account
import com.srikanthvvs1.financetracker.data.AccountPurpose
import com.srikanthvvs1.financetracker.data.AccountTransfer
import com.srikanthvvs1.financetracker.data.Expense
import com.srikanthvvs1.financetracker.data.Investment
import com.srikanthvvs1.financetracker.data.InvestmentAction
import com.srikanthvvs1.financetracker.data.InvestmentTransaction
import java.math.BigDecimal
import java.time.LocalDate

@Composable
fun AddAccountDialog(onDismiss: () -> Unit, onSave: (Account) -> Unit) {
    var name by remember { mutableStateOf("") }
    var bank by remember { mutableStateOf("") }
    var purpose by remember { mutableStateOf(AccountPurpose.OTHER) }
    var opening by remember { mutableStateOf("") }
    var statement by remember { mutableStateOf("") }
    EntryDialog("Add account", onDismiss, {
        onSave(
            Account(
                id = newId(),
                name = name.trim(),
                bank = bank.trim().ifBlank { null },
                purpose = purpose,
                openingBalance = opening.moneyOrZero(),
                statementBalance = statement.moneyOrZero(),
            ),
        )
    }, name.isNotBlank()) {
        FormTextField(name, { name = it }, "Account name")
        FormTextField(bank, { bank = it }, "Bank")
        ChoiceField(
            label = "Purpose",
            value = purpose,
            options = AccountPurpose.entries,
            display = { it.name.lowercase().replaceFirstChar(Char::uppercase) },
            onSelect = { purpose = it },
        )
        FormTextField(opening, { opening = it }, "Opening balance")
        FormTextField(statement, { statement = it }, "Latest bank balance")
    }
}

@Composable
fun AddTransferDialog(
    accounts: List<Account>,
    onDismiss: () -> Unit,
    onSave: (AccountTransfer) -> Unit,
) {
    var from by remember { mutableStateOf(accounts.first()) }
    var to by remember { mutableStateOf(accounts.first { it.id != from.id }) }
    var date by remember { mutableStateOf(LocalDate.now().toString()) }
    var amount by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }
    EntryDialog("Record internal transfer", onDismiss, {
        onSave(
            AccountTransfer(
                newId(), LocalDate.parse(date), from.id, to.id,
                amount.money(), note.trim().ifBlank { null },
            ),
        )
    }, from.id != to.id && date.validDate() && amount.positiveMoney()) {
        FormTextField(date, { date = it }, "Date (YYYY-MM-DD)")
        ChoiceField("From account", from, accounts, { it.name }, {
            from = it
            if (to.id == it.id) to = accounts.first { account -> account.id != it.id }
        })
        ChoiceField("To account", to, accounts.filter { it.id != from.id }, { it.name }, { to = it })
        FormTextField(amount, { amount = it }, "Amount")
        FormTextField(note, { note = it }, "Note")
    }
}

@Composable
fun AddExpenseDialog(
    accounts: List<Account>,
    onDismiss: () -> Unit,
    onSave: (Expense) -> Unit,
) {
    val categories = listOf(
        "food", "grocery", "travel", "housing", "health", "entertainment",
        "utilities", "shopping", "education", "other",
    )
    var description by remember { mutableStateOf("") }
    var date by remember { mutableStateOf(LocalDate.now().toString()) }
    var amount by remember { mutableStateOf("") }
    var category by remember { mutableStateOf("other") }
    var payment by remember { mutableStateOf("UPI") }
    var account by remember {
        mutableStateOf(accounts.firstOrNull { it.purpose == AccountPurpose.SPENDING } ?: accounts.first())
    }
    EntryDialog("Add expense", onDismiss, {
        onSave(
            Expense(
                newId(), LocalDate.parse(date), description.trim(), category,
                payment.trim().ifBlank { null }, amount.money(), account.id,
            ),
        )
    }, description.isNotBlank() && date.validDate() && amount.positiveMoney()) {
        FormTextField(description, { description = it }, "Description")
        FormTextField(date, { date = it }, "Date (YYYY-MM-DD)")
        FormTextField(amount, { amount = it }, "Amount")
        ChoiceField("Category", category, categories, { it.replaceFirstChar(Char::uppercase) }, { category = it })
        FormTextField(payment, { payment = it }, "Payment method")
        ChoiceField("Paying account", account, accounts, { it.name }, { account = it })
    }
}

@Composable
fun AddInvestmentDialog(
    accounts: List<Account>,
    onDismiss: () -> Unit,
    onSave: (Investment) -> Unit,
) {
    val categories = listOf(
        "mutual_funds", "stocks", "foreign_stocks", "gold", "ppf", "nps", "fixed_deposit",
    )
    var name by remember { mutableStateOf("") }
    var asset by remember { mutableStateOf("") }
    var category by remember { mutableStateOf("mutual_funds") }
    var date by remember { mutableStateOf(LocalDate.now().toString()) }
    var units by remember { mutableStateOf("") }
    var price by remember { mutableStateOf("") }
    var currentPrice by remember { mutableStateOf("") }
    var account by remember {
        mutableStateOf(accounts.firstOrNull { it.purpose == AccountPurpose.INVESTMENT } ?: accounts.firstOrNull())
    }
    val balanceAccount = category in setOf("ppf", "fixed_deposit")
    val canSave = name.isNotBlank() && asset.isNotBlank() && date.validDate() &&
        units.positiveMoney() && price.positiveMoney() && currentPrice.positiveMoney() &&
        account != null
    EntryDialog("Add investment holding", onDismiss, {
        val id = newId()
        val action = if (balanceAccount) InvestmentAction.DEPOSIT else InvestmentAction.BUY
        val actualUnits = if (balanceAccount) BigDecimal.ONE else units.money()
        val transactionPrice = if (balanceAccount) price.money().multiply(units.money()) else price.money()
        onSave(
            Investment(
                id = id,
                asset = asset.trim(),
                name = name.trim(),
                category = category,
                currentPrice = if (balanceAccount) currentPrice.money().multiply(units.money())
                    else currentPrice.money(),
                transactions = listOf(
                    InvestmentTransaction(
                        id, LocalDate.parse(date), action, actualUnits,
                        transactionPrice, account!!.id,
                    ),
                ),
                units = actualUnits,
                buyPrice = transactionPrice,
            ),
        )
    }, canSave) {
        FormTextField(name, { name = it }, "Investment name")
        FormTextField(asset, { asset = it }, "Asset code")
        ChoiceField(
            "Category", category, categories,
            { it.replace('_', ' ').replaceFirstChar(Char::uppercase) },
            { category = it },
        )
        FormTextField(date, { date = it }, "Date (YYYY-MM-DD)")
        FormTextField(units, { units = it }, if (balanceAccount) "Enter 1" else "Units")
        FormTextField(price, { price = it }, if (balanceAccount) "Deposit amount" else "Purchase NAV/price")
        FormTextField(
            currentPrice,
            { currentPrice = it },
            if (balanceAccount) "Current balance" else "Current NAV/price",
        )
        if (accounts.isNotEmpty()) {
            ChoiceField("Funding account", account!!, accounts, { it.name }, { account = it })
        }
    }
}

@Composable
fun AddInvestmentTransactionDialog(
    investments: List<Investment>,
    accounts: List<Account>,
    onDismiss: () -> Unit,
    onSave: (InvestmentTransaction) -> Unit,
) {
    var investment by remember { mutableStateOf(investments.first()) }
    val balanceAccount = investment.category in setOf("ppf", "fixed_deposit")
    val validActions = if (balanceAccount) {
        listOf(
            InvestmentAction.DEPOSIT, InvestmentAction.INTEREST,
            InvestmentAction.WITHDRAWAL, InvestmentAction.ADJUSTMENT,
        )
    } else {
        listOf(InvestmentAction.BUY, InvestmentAction.SELL)
    }
    var action by remember { mutableStateOf(validActions.first()) }
    var date by remember { mutableStateOf(LocalDate.now().toString()) }
    var units by remember { mutableStateOf(if (balanceAccount) "1" else "") }
    var price by remember { mutableStateOf("") }
    var account by remember {
        mutableStateOf(accounts.firstOrNull { it.purpose == AccountPurpose.INVESTMENT } ?: accounts.first())
    }
    val accountRequired = action !in setOf(InvestmentAction.INTEREST, InvestmentAction.ADJUSTMENT)
    EntryDialog("Add investment transaction", onDismiss, {
        onSave(
            InvestmentTransaction(
                investment.id, LocalDate.parse(date), action,
                if (balanceAccount) BigDecimal.ONE else units.money(),
                price.money(), if (accountRequired) account.id else null,
            ),
        )
    }, date.validDate() && units.positiveMoney() && price.positiveMoney()) {
        ChoiceField("Holding", investment, investments, { it.name }) {
            investment = it
            val isBalance = it.category in setOf("ppf", "fixed_deposit")
            action = if (isBalance) InvestmentAction.DEPOSIT else InvestmentAction.BUY
            units = if (isBalance) "1" else ""
        }
        ChoiceField("Action", action, validActions, { it.name }, { action = it })
        FormTextField(date, { date = it }, "Date (YYYY-MM-DD)")
        if (!balanceAccount) FormTextField(units, { units = it }, "Units")
        FormTextField(price, { price = it }, if (balanceAccount) "Amount" else "NAV/price")
        if (accountRequired) ChoiceField("Settlement account", account, accounts, { it.name }, { account = it })
    }
}

@Composable
private fun EntryDialog(
    title: String,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit,
    confirmEnabled: Boolean,
    content: @Composable () -> Unit,
) {
    var error by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                content()
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            Button(
                enabled = confirmEnabled,
                onClick = {
                    runCatching(onConfirm).onFailure {
                        error = it.message ?: "Could not save this entry."
                    }
                },
            ) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
private fun FormTextField(value: String, onValueChange: (String) -> Unit, label: String) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        singleLine = true,
        modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
private fun <T> ChoiceField(
    label: String,
    value: T,
    options: List<T>,
    display: (T) -> String,
    onSelect: (T) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    Column {
        Text(label, style = MaterialTheme.typography.labelMedium)
        OutlinedButton(onClick = { expanded = true }, modifier = Modifier.fillMaxWidth()) {
            Text(display(value))
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            options.forEach { option ->
                DropdownMenuItem(
                    text = { Text(display(option)) },
                    onClick = {
                        onSelect(option)
                        expanded = false
                    },
                )
            }
        }
    }
}

private fun String.money() = BigDecimal(trim())
private fun String.moneyOrZero() = trim().takeIf(String::isNotEmpty)?.let(::BigDecimal) ?: BigDecimal.ZERO
private fun String.positiveMoney() = runCatching { money() > BigDecimal.ZERO }.getOrDefault(false)
private fun String.validDate() = runCatching { LocalDate.parse(this) }.isSuccess
private fun newId() = System.currentTimeMillis()
