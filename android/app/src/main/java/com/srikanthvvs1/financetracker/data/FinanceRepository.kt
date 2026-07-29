package com.srikanthvvs1.financetracker.data

import android.content.Context
import android.net.Uri

class FinanceRepository(context: Context) {
    private val applicationContext = context.applicationContext
    private val database = FinanceDatabase(applicationContext)

    fun snapshot(): FinanceSnapshot = database.loadSnapshot()
    fun sourceName(): String? = database.sourceName()

    fun importWorkbook(uri: Uri): ImportSummary {
        val tables = XlsxReader(applicationContext.contentResolver).read(uri)
        val sourceName = applicationContext.contentResolver.query(
            uri,
            arrayOf(android.provider.OpenableColumns.DISPLAY_NAME),
            null,
            null,
            null,
        )?.use { cursor ->
            if (cursor.moveToFirst()) cursor.getString(0) else "data.xlsx"
        } ?: "data.xlsx"
        return database.replaceFromWorkbook(tables, sourceName)
    }

    fun addAccount(account: Account) = database.addAccount(account)
    fun addExpense(expense: Expense) = database.addExpense(expense)
    fun addTransfer(transfer: AccountTransfer) = database.addTransfer(transfer)
    fun addInvestment(investment: Investment) = database.addInvestment(investment)
    fun addInvestmentTransaction(transaction: InvestmentTransaction) =
        database.addInvestmentTransaction(transaction)
    fun deleteExpense(id: Long) = database.deleteExpense(id)
    fun deleteTransfer(id: Long) = database.deleteTransfer(id)
}
