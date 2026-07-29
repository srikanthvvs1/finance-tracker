package com.srikanthvvs1.financetracker.domain

import com.srikanthvvs1.financetracker.data.Account
import com.srikanthvvs1.financetracker.data.AccountPurpose
import com.srikanthvvs1.financetracker.data.AccountTransfer
import com.srikanthvvs1.financetracker.data.FinanceSnapshot
import com.srikanthvvs1.financetracker.data.Investment
import com.srikanthvvs1.financetracker.data.InvestmentAction
import com.srikanthvvs1.financetracker.data.InvestmentTransaction
import com.srikanthvvs1.financetracker.data.MonthlyIncome
import java.math.BigDecimal
import java.time.LocalDate
import org.junit.Assert.assertEquals
import org.junit.Test

class FinancialFlowTest {
    @Test
    fun salaryTransferAndSipConnectAllAccounts() {
        val axis = Account(1, "Axis Salary", "Axis", AccountPurpose.SALARY, bd("0"), bd("0"))
        val sbi = Account(2, "SBI Investment", "SBI", AccountPurpose.INVESTMENT, bd("0"), bd("0"))
        val sip = InvestmentTransaction(
            10, LocalDate.of(2026, 7, 1), InvestmentAction.BUY,
            bd("100"), bd("100"), sbi.id,
        )
        val snapshot = FinanceSnapshot(
            accounts = listOf(axis, sbi),
            income = listOf(MonthlyIncome("Jul 2026", bd("50000"), axis.id)),
            transfers = listOf(
                AccountTransfer(1, LocalDate.of(2026, 7, 1), axis.id, sbi.id, bd("10000"), "SIP"),
            ),
            investments = listOf(Investment(10, "MF", "Fund", "mutual_funds", bd("110"), listOf(sip))),
        )
        assertEquals(bd("40000"), FinancialFlow.trackedBalance(snapshot, axis.id))
        assertEquals(bd("0"), FinancialFlow.trackedBalance(snapshot, sbi.id))
    }

    private fun bd(value: String) = BigDecimal(value)
}
