package com.srikanthvvs1.financetracker.data

import java.math.BigDecimal
import java.time.LocalDate

enum class AccountPurpose { SALARY, INVESTMENT, SPENDING, SAVINGS, OTHER }
enum class InvestmentAction { BUY, SELL, DEPOSIT, INTEREST, WITHDRAWAL, ADJUSTMENT }

data class Account(
    val id: Long,
    val name: String,
    val bank: String?,
    val purpose: AccountPurpose,
    val openingBalance: BigDecimal,
    val statementBalance: BigDecimal,
    val includeNetWorth: Boolean = true,
    val active: Boolean = true,
)

data class Expense(
    val id: Long,
    val date: LocalDate,
    val description: String,
    val category: String,
    val payment: String?,
    val amount: BigDecimal,
    val accountId: Long,
)

data class AccountTransfer(
    val id: Long,
    val date: LocalDate,
    val fromAccountId: Long,
    val toAccountId: Long,
    val amount: BigDecimal,
    val note: String?,
)

data class Investment(
    val id: Long,
    val asset: String,
    val name: String,
    val category: String,
    val currentPrice: BigDecimal,
    val transactions: List<InvestmentTransaction>,
    val units: BigDecimal = BigDecimal.ZERO,
    val buyPrice: BigDecimal = BigDecimal.ZERO,
    val ticker: String? = null,
    val schemeCode: String? = null,
)

data class InvestmentTransaction(
    val investmentId: Long,
    val date: LocalDate,
    val action: InvestmentAction,
    val units: BigDecimal,
    val price: BigDecimal,
    val accountId: Long?,
) {
    val amount: BigDecimal get() = units.multiply(price)
}

data class MonthlyIncome(val month: String, val amount: BigDecimal, val accountId: Long)

data class FinanceSnapshot(
    val accounts: List<Account> = emptyList(),
    val expenses: List<Expense> = emptyList(),
    val transfers: List<AccountTransfer> = emptyList(),
    val investments: List<Investment> = emptyList(),
    val income: List<MonthlyIncome> = emptyList(),
)
