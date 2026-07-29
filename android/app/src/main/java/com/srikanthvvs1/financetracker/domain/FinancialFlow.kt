package com.srikanthvvs1.financetracker.domain

import com.srikanthvvs1.financetracker.data.FinanceSnapshot
import com.srikanthvvs1.financetracker.data.InvestmentAction
import java.math.BigDecimal

object FinancialFlow {
    fun trackedBalance(snapshot: FinanceSnapshot, accountId: Long): BigDecimal {
        val opening = snapshot.accounts.firstOrNull { it.id == accountId }
            ?.openingBalance ?: BigDecimal.ZERO
        val income = snapshot.income.filter { it.accountId == accountId }
            .fold(BigDecimal.ZERO) { total, row -> total + row.amount }
        val expenses = snapshot.expenses.filter { it.accountId == accountId }
            .fold(BigDecimal.ZERO) { total, row -> total + row.amount }
        val transferNet = snapshot.transfers.fold(BigDecimal.ZERO) { total, row ->
            when (accountId) {
                row.fromAccountId -> total - row.amount
                row.toAccountId -> total + row.amount
                else -> total
            }
        }
        val investmentNet = snapshot.investments.flatMap { it.transactions }
            .filter { it.accountId == accountId }
            .fold(BigDecimal.ZERO) { total, transaction ->
                when (transaction.action) {
                    InvestmentAction.BUY, InvestmentAction.DEPOSIT -> total - transaction.amount
                    InvestmentAction.SELL, InvestmentAction.WITHDRAWAL -> total + transaction.amount
                    InvestmentAction.INTEREST, InvestmentAction.ADJUSTMENT -> total
                }
            }
        return opening + income - expenses + transferNet + investmentNet
    }
}
