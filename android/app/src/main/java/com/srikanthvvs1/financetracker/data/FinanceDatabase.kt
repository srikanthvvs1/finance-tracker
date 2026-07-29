package com.srikanthvvs1.financetracker.data

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONObject
import java.math.BigDecimal

data class ImportSummary(
    val accounts: Int,
    val expenses: Int,
    val transfers: Int,
    val investments: Int,
    val transactions: Int,
    val incomeMonths: Int,
)

class FinanceDatabase(context: Context) :
    SQLiteOpenHelper(context, "fintrack.db", null, DATABASE_VERSION) {

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """CREATE TABLE accounts(
                id INTEGER PRIMARY KEY, name TEXT NOT NULL, bank TEXT, purpose TEXT NOT NULL,
                opening_balance TEXT NOT NULL, statement_balance TEXT NOT NULL,
                include_net_worth INTEGER NOT NULL, active INTEGER NOT NULL)""",
        )
        db.execSQL(
            """CREATE TABLE expenses(
                id INTEGER PRIMARY KEY, date TEXT NOT NULL, description TEXT NOT NULL,
                category TEXT NOT NULL, payment TEXT, amount TEXT NOT NULL,
                account_id INTEGER NOT NULL)""",
        )
        db.execSQL(
            """CREATE TABLE transfers(
                id INTEGER PRIMARY KEY, date TEXT NOT NULL, from_account_id INTEGER NOT NULL,
                to_account_id INTEGER NOT NULL, amount TEXT NOT NULL, note TEXT)""",
        )
        db.execSQL(
            """CREATE TABLE investments(
                id INTEGER PRIMARY KEY, asset TEXT NOT NULL, name TEXT NOT NULL,
                category TEXT NOT NULL, units TEXT NOT NULL, buy_price TEXT NOT NULL,
                current_price TEXT NOT NULL, ticker TEXT, scheme_code TEXT)""",
        )
        db.execSQL(
            """CREATE TABLE investment_transactions(
                row_id INTEGER PRIMARY KEY AUTOINCREMENT, investment_id INTEGER NOT NULL,
                date TEXT NOT NULL, action TEXT NOT NULL, units TEXT NOT NULL,
                price TEXT NOT NULL, account_id INTEGER)""",
        )
        db.execSQL(
            """CREATE TABLE income_history(
                month TEXT PRIMARY KEY, amount TEXT NOT NULL, account_id INTEGER NOT NULL)""",
        )
        db.execSQL(
            """CREATE TABLE workbook_rows(
                sheet_name TEXT NOT NULL, row_index INTEGER NOT NULL, json TEXT NOT NULL,
                PRIMARY KEY(sheet_name, row_index))""",
        )
        db.execSQL(
            """CREATE TABLE metadata(
                key TEXT PRIMARY KEY, value TEXT NOT NULL)""",
        )
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        if (oldVersion != newVersion) {
            listOf(
                "accounts", "expenses", "transfers", "investments",
                "investment_transactions", "income_history", "workbook_rows", "metadata",
            ).forEach { db.execSQL("DROP TABLE IF EXISTS $it") }
            onCreate(db)
        }
    }

    fun replaceFromWorkbook(tables: Map<String, WorkbookTable>, sourceName: String): ImportSummary {
        validate(tables)
        val db = writableDatabase
        db.beginTransaction()
        try {
            listOf(
                "accounts", "expenses", "transfers", "investments",
                "investment_transactions", "income_history", "workbook_rows", "metadata",
            ).forEach { db.delete(it, null, null) }

            tables.getValue("Accounts").rows.forEach { row ->
                db.insertOrThrow("accounts", null, ContentValues().apply {
                    put("id", row.long("id"))
                    put("name", row.text("name"))
                    put("bank", row.text("bank"))
                    put("purpose", row.text("purpose"))
                    put("opening_balance", row.decimal("openingBalance").toPlainString())
                    put("statement_balance", row.decimal("statementBalance").toPlainString())
                    put("include_net_worth", row.boolean("includeNetWorth").asInt())
                    put("active", row.boolean("active").asInt())
                })
            }
            tables.getValue("Expenses").rows.forEach { row ->
                val accountId = row.longOrNull("accountId")
                    ?: throw WorkbookValidationException("Every expense must be assigned to an account.")
                db.insertOrThrow("expenses", null, ContentValues().apply {
                    put("id", row.long("id"))
                    put("date", XlsxReader.excelDate(row.text("date")).toString())
                    put("description", row.text("description"))
                    put("category", row.text("category"))
                    put("payment", row.text("payment"))
                    put("amount", row.decimal("amount").toPlainString())
                    put("account_id", accountId)
                })
            }
            tables.getValue("Transfers").rows.forEach { row ->
                db.insertOrThrow("transfers", null, ContentValues().apply {
                    put("id", row.long("id"))
                    put("date", XlsxReader.excelDate(row.text("date")).toString())
                    put("from_account_id", row.long("fromAccountId"))
                    put("to_account_id", row.long("toAccountId"))
                    put("amount", row.decimal("amount").toPlainString())
                    put("note", row.text("note"))
                })
            }
            tables.getValue("Investments").rows.forEach { row ->
                db.insertOrThrow("investments", null, ContentValues().apply {
                    put("id", row.long("id"))
                    put("asset", row.text("asset"))
                    put("name", row.text("name"))
                    put("category", row.text("category"))
                    put("units", row.decimal("units").toPlainString())
                    put("buy_price", row.decimal("buyPrice").toPlainString())
                    put("current_price", row.decimal("currentPrice").toPlainString())
                    put("ticker", row.text("ticker"))
                    put("scheme_code", row.text("schemeCode"))
                })
            }
            tables.getValue("Transactions").rows.forEach { row ->
                db.insertOrThrow("investment_transactions", null, ContentValues().apply {
                    put("investment_id", row.long("investmentId"))
                    put("date", XlsxReader.excelDate(row.text("date")).toString())
                    put("action", row.text("action").uppercase())
                    put("units", row.decimal("units").toPlainString())
                    put("price", row.decimal("price").toPlainString())
                    row.longOrNull("accountId")?.let { put("account_id", it) }
                })
            }
            tables.getValue("SavingsHistory").rows.forEach { row ->
                val accountId = row.longOrNull("accountId") ?: return@forEach
                db.insertOrThrow("income_history", null, ContentValues().apply {
                    put("month", row.text("month"))
                    put("amount", row.decimal("income").toPlainString())
                    put("account_id", accountId)
                })
            }
            tables.forEach { (sheetName, table) ->
                table.rows.forEachIndexed { index, row ->
                    db.insertOrThrow("workbook_rows", null, ContentValues().apply {
                        put("sheet_name", sheetName)
                        put("row_index", index + 2)
                        put("json", JSONObject(row).toString())
                    })
                }
            }
            db.insertOrThrow("metadata", null, ContentValues().apply {
                put("key", "source_name")
                put("value", sourceName)
            })
            db.insertOrThrow("metadata", null, ContentValues().apply {
                put("key", "imported_at")
                put("value", System.currentTimeMillis().toString())
            })
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
        return ImportSummary(
            accounts = tables.getValue("Accounts").rows.size,
            expenses = tables.getValue("Expenses").rows.size,
            transfers = tables.getValue("Transfers").rows.size,
            investments = tables.getValue("Investments").rows.size,
            transactions = tables.getValue("Transactions").rows.size,
            incomeMonths = tables.getValue("SavingsHistory").rows.size,
        )
    }

    fun loadSnapshot(): FinanceSnapshot {
        val db = readableDatabase
        val accounts = db.rawQuery("SELECT * FROM accounts ORDER BY id", null).use { cursor ->
            buildList {
                while (cursor.moveToNext()) add(
                    Account(
                        id = cursor.long("id"),
                        name = cursor.string("name"),
                        bank = cursor.stringOrNull("bank"),
                        purpose = AccountPurpose.valueOf(cursor.string("purpose").uppercase()),
                        openingBalance = cursor.decimal("opening_balance"),
                        statementBalance = cursor.decimal("statement_balance"),
                        includeNetWorth = cursor.int("include_net_worth") != 0,
                        active = cursor.int("active") != 0,
                    ),
                )
            }
        }
        val expenses = db.rawQuery("SELECT * FROM expenses ORDER BY date DESC", null).use { cursor ->
            buildList {
                while (cursor.moveToNext()) add(
                    Expense(
                        cursor.long("id"), java.time.LocalDate.parse(cursor.string("date")),
                        cursor.string("description"), cursor.string("category"),
                        cursor.stringOrNull("payment"), cursor.decimal("amount"),
                        cursor.long("account_id"),
                    ),
                )
            }
        }
        val transfers = db.rawQuery("SELECT * FROM transfers ORDER BY date DESC", null).use { cursor ->
            buildList {
                while (cursor.moveToNext()) add(
                    AccountTransfer(
                        cursor.long("id"), java.time.LocalDate.parse(cursor.string("date")),
                        cursor.long("from_account_id"), cursor.long("to_account_id"),
                        cursor.decimal("amount"), cursor.stringOrNull("note"),
                    ),
                )
            }
        }
        val transactionsByInvestment = db.rawQuery(
            "SELECT * FROM investment_transactions ORDER BY date",
            null,
        ).use { cursor ->
            buildList {
                while (cursor.moveToNext()) add(
                    InvestmentTransaction(
                        cursor.long("investment_id"), java.time.LocalDate.parse(cursor.string("date")),
                        InvestmentAction.valueOf(cursor.string("action")),
                        cursor.decimal("units"), cursor.decimal("price"),
                        cursor.longOrNull("account_id"),
                    ),
                )
            }.groupBy { it.investmentId }
        }
        val investments = db.rawQuery("SELECT * FROM investments ORDER BY name", null).use { cursor ->
            buildList {
                while (cursor.moveToNext()) {
                    val id = cursor.long("id")
                    add(
                        Investment(
                            id = id,
                            asset = cursor.string("asset"),
                            name = cursor.string("name"),
                            category = cursor.string("category"),
                            currentPrice = cursor.decimal("current_price"),
                            transactions = transactionsByInvestment[id].orEmpty(),
                            units = cursor.decimal("units"),
                            buyPrice = cursor.decimal("buy_price"),
                            ticker = cursor.stringOrNull("ticker"),
                            schemeCode = cursor.stringOrNull("scheme_code"),
                        ),
                    )
                }
            }
        }
        val income = db.rawQuery("SELECT * FROM income_history ORDER BY month", null).use { cursor ->
            buildList {
                while (cursor.moveToNext()) add(
                    MonthlyIncome(
                        cursor.string("month"), cursor.decimal("amount"), cursor.long("account_id"),
                    ),
                )
            }
        }
        return FinanceSnapshot(accounts, expenses, transfers, investments, income)
    }

    fun sourceName(): String? = readableDatabase.rawQuery(
        "SELECT value FROM metadata WHERE key='source_name'",
        null,
    ).use { cursor -> if (cursor.moveToFirst()) cursor.getString(0) else null }

    fun addAccount(account: Account) {
        writableDatabase.insertOrThrow("accounts", null, ContentValues().apply {
            put("id", account.id)
            put("name", account.name)
            put("bank", account.bank)
            put("purpose", account.purpose.name.lowercase())
            put("opening_balance", account.openingBalance.toPlainString())
            put("statement_balance", account.statementBalance.toPlainString())
            put("include_net_worth", account.includeNetWorth.asInt())
            put("active", account.active.asInt())
        })
    }

    fun addExpense(expense: Expense) {
        require(accountExists(expense.accountId)) { "Select a valid paying account." }
        writableDatabase.insertOrThrow("expenses", null, ContentValues().apply {
            put("id", expense.id)
            put("date", expense.date.toString())
            put("description", expense.description)
            put("category", expense.category)
            put("payment", expense.payment)
            put("amount", expense.amount.toPlainString())
            put("account_id", expense.accountId)
        })
    }

    fun addTransfer(transfer: AccountTransfer) {
        require(transfer.fromAccountId != transfer.toAccountId) {
            "Transfer accounts must be different."
        }
        require(accountExists(transfer.fromAccountId) && accountExists(transfer.toAccountId)) {
            "Select valid transfer accounts."
        }
        writableDatabase.insertOrThrow("transfers", null, ContentValues().apply {
            put("id", transfer.id)
            put("date", transfer.date.toString())
            put("from_account_id", transfer.fromAccountId)
            put("to_account_id", transfer.toAccountId)
            put("amount", transfer.amount.toPlainString())
            put("note", transfer.note)
        })
    }

    fun addInvestment(investment: Investment) {
        writableDatabase.insertOrThrow("investments", null, ContentValues().apply {
            put("id", investment.id)
            put("asset", investment.asset)
            put("name", investment.name)
            put("category", investment.category)
            put("units", investment.units.toPlainString())
            put("buy_price", investment.buyPrice.toPlainString())
            put("current_price", investment.currentPrice.toPlainString())
            put("ticker", investment.ticker)
            put("scheme_code", investment.schemeCode)
        })
        investment.transactions.forEach(::addInvestmentTransaction)
    }

    fun addInvestmentTransaction(transaction: InvestmentTransaction) {
        transaction.accountId?.let {
            require(accountExists(it)) { "Select a valid settlement account." }
        }
        writableDatabase.insertOrThrow("investment_transactions", null, ContentValues().apply {
            put("investment_id", transaction.investmentId)
            put("date", transaction.date.toString())
            put("action", transaction.action.name)
            put("units", transaction.units.toPlainString())
            put("price", transaction.price.toPlainString())
            transaction.accountId?.let { put("account_id", it) }
        })
    }

    fun deleteExpense(id: Long) {
        writableDatabase.delete("expenses", "id=?", arrayOf(id.toString()))
    }

    fun deleteTransfer(id: Long) {
        writableDatabase.delete("transfers", "id=?", arrayOf(id.toString()))
    }

    private fun accountExists(id: Long): Boolean = readableDatabase.rawQuery(
        "SELECT 1 FROM accounts WHERE id=?",
        arrayOf(id.toString()),
    ).use { it.moveToFirst() }

    private fun validate(tables: Map<String, WorkbookTable>) {
        REQUIRED_COLUMNS.forEach { (sheet, required) ->
            val table = tables[sheet]
                ?: throw WorkbookValidationException("Required worksheet '$sheet' is missing.")
            val missing = required - table.headers.toSet()
            if (missing.isNotEmpty()) {
                throw WorkbookValidationException(
                    "Worksheet '$sheet' is missing columns: ${missing.joinToString()}.",
                )
            }
        }
        val accountIds = tables.getValue("Accounts").rows.map { it.long("id") }.toSet()
        tables.getValue("Transactions").rows.forEach { row ->
            row.longOrNull("accountId")?.let {
                if (it !in accountIds) throw WorkbookValidationException(
                    "An investment transaction refers to unknown account $it.",
                )
            }
        }
    }

    companion object {
        private const val DATABASE_VERSION = 1
        private val REQUIRED_COLUMNS = mapOf(
            "Expenses" to setOf("id", "date", "description", "category", "payment", "amount", "accountId"),
            "Investments" to setOf(
                "id", "asset", "name", "category", "units", "buyPrice", "currentPrice",
                "date", "marketCap", "riskLevel", "ticker", "schemeCode",
            ),
            "Transactions" to setOf("investmentId", "date", "action", "units", "price", "accountId"),
            "SavingsHistory" to setOf("month", "income", "expenses", "invested", "emergency", "net_saved", "accountId"),
            "Accounts" to setOf(
                "id", "name", "bank", "purpose", "openingBalance", "statementBalance",
                "includeNetWorth", "active",
            ),
            "Transfers" to setOf("id", "date", "fromAccountId", "toAccountId", "amount", "note"),
        )
    }
}

private fun Map<String, String>.text(key: String) = get(key).orEmpty().trim()
private fun Map<String, String>.decimal(key: String) =
    text(key).takeIf(String::isNotBlank)?.let(::BigDecimal) ?: BigDecimal.ZERO
private fun Map<String, String>.long(key: String) =
    longOrNull(key) ?: throw WorkbookValidationException("Required value '$key' is missing.")
private fun Map<String, String>.longOrNull(key: String) =
    text(key).takeIf(String::isNotBlank)?.toDoubleOrNull()?.toLong()
private fun Map<String, String>.boolean(key: String) =
    text(key).lowercase() in setOf("true", "1", "yes")
private fun Boolean.asInt() = if (this) 1 else 0

private fun android.database.Cursor.index(name: String) = getColumnIndexOrThrow(name)
private fun android.database.Cursor.string(name: String) = getString(index(name))
private fun android.database.Cursor.stringOrNull(name: String) =
    index(name).let { if (isNull(it)) null else getString(it) }
private fun android.database.Cursor.long(name: String) = getLong(index(name))
private fun android.database.Cursor.longOrNull(name: String) =
    index(name).let { if (isNull(it)) null else getLong(it) }
private fun android.database.Cursor.int(name: String) = getInt(index(name))
private fun android.database.Cursor.decimal(name: String) = BigDecimal(string(name))
