using Microsoft.EntityFrameworkCore;
using ZLics.InstallmentEngine.Data;
using ZLics.InstallmentEngine.DTOs;
using ZLics.InstallmentEngine.Models;

namespace ZLics.InstallmentEngine.Services;

public class InstallmentPaymentService : IInstallmentPaymentService
{
    private readonly AppDbContext _context;
    private readonly ILogger<InstallmentPaymentService> _logger;

    public InstallmentPaymentService(AppDbContext context, ILogger<InstallmentPaymentService> logger)
    {
        _context = context;
        _logger = logger;
    }

    public AgreementPreviewDto PreviewAgreement(CreateAgreementDto dto)
    {
        var financedAmount = Math.Max(0, dto.TotalCashPrice - dto.DownPayment);
        var totalTerms = Math.Max(1, dto.TotalTermsMonths);
        
        // Simple Add-on Interest: Total Financed * (MonthlyRate / 100) * Terms
        var totalInterest = Math.Round(financedAmount * (dto.MonthlyInterestRate / 100.0m) * totalTerms, 2);
        var totalPayable = financedAmount + totalInterest;
        var rawAmortization = totalTerms > 0 ? totalPayable / totalTerms : 0;
        var monthlyAmortization = Math.Round(rawAmortization, 2);

        var preview = new AgreementPreviewDto
        {
            TotalCashPrice = dto.TotalCashPrice,
            DownPayment = dto.DownPayment,
            TotalFinancedAmount = financedAmount,
            MonthlyInterestRate = dto.MonthlyInterestRate,
            TotalTermsMonths = totalTerms,
            TotalInterest = totalInterest,
            TotalPayable = totalPayable,
            MonthlyAmortization = monthlyAmortization
        };

        var basePrincipalPerMonth = Math.Round(financedAmount / totalTerms, 2);
        var baseInterestPerMonth = Math.Round(totalInterest / totalTerms, 2);
        var startDate = dto.FirstDueDate ?? DateTime.UtcNow.Date.AddDays(30);

        decimal runningBalance = totalPayable;
        decimal accumulatedPrincipal = 0m;
        decimal accumulatedInterest = 0m;

        for (int i = 1; i <= totalTerms; i++)
        {
            decimal pDue = basePrincipalPerMonth;
            decimal iDue = baseInterestPerMonth;

            // Handle cent rounding variance on the last installment
            if (i == totalTerms)
            {
                pDue = financedAmount - accumulatedPrincipal;
                iDue = totalInterest - accumulatedInterest;
            }

            accumulatedPrincipal += pDue;
            accumulatedInterest += iDue;
            var installmentTotal = pDue + iDue;
            runningBalance = Math.Max(0, runningBalance - installmentTotal);

            preview.ProjectedSchedules.Add(new SchedulePreviewItemDto
            {
                InstallmentNumber = i,
                DueDate = startDate.AddMonths(i - 1),
                PrincipalDue = pDue,
                InterestDue = iDue,
                MonthlyAmortization = installmentTotal,
                RemainingBalanceAfterPayment = runningBalance
            });
        }

        return preview;
    }

    public async Task<InstallmentAccount> CreateInstallmentAgreementAsync(CreateAgreementDto dto, CancellationToken cancellationToken = default)
    {
        var preview = PreviewAgreement(dto);

        var account = new InstallmentAccount
        {
            SaleId = dto.SaleId,
            CustomerId = dto.CustomerId,
            TotalCashPrice = dto.TotalCashPrice,
            DownPayment = dto.DownPayment,
            InterestRate = dto.MonthlyInterestRate,
            TotalFinancedAmount = preview.TotalFinancedAmount,
            TotalTermsMonths = preview.TotalTermsMonths,
            MonthlyAmortization = preview.MonthlyAmortization,
            Status = "Active",
            CreatedAt = DateTime.UtcNow
        };

        foreach (var item in preview.ProjectedSchedules)
        {
            account.Schedules.Add(new InstallmentSchedule
            {
                InstallmentNumber = item.InstallmentNumber,
                DueDate = item.DueDate,
                AmountDue = item.MonthlyAmortization,
                PrincipalDue = item.PrincipalDue,
                InterestDue = item.InterestDue,
                AmountPaid = 0.00m,
                PenaltyAssessed = 0.00m,
                PenaltyPaid = 0.00m,
                Status = "Pending"
            });
        }

        _context.InstallmentAccounts.Add(account);
        await _context.SaveChangesAsync(cancellationToken);

        _logger.LogInformation("Generated InstallmentAccount #{AccountId} with {Count} schedule rows for Customer #{CustomerId}.",
            account.Id, account.Schedules.Count, dto.CustomerId);

        return account;
    }

    public async Task<PaymentReceiptDto> ProcessPaymentWaterfallAsync(ProcessPaymentDto dto, CancellationToken cancellationToken = default)
    {
        if (dto.AmountPaid <= 0)
        {
            throw new ArgumentException("Payment amount must be greater than zero.", nameof(dto.AmountPaid));
        }

        // Open an explicit transaction with row locking to prevent concurrent payment race conditions
        await using var transaction = await _context.Database.BeginTransactionAsync(System.Data.IsolationLevel.RepeatableRead, cancellationToken);

        try
        {
            var account = await _context.InstallmentAccounts
                .Include(a => a.Schedules)
                .FirstOrDefaultAsync(a => a.Id == dto.InstallmentAccountId, cancellationToken);

            if (account == null)
            {
                throw new KeyNotFoundException($"Installment account #{dto.InstallmentAccountId} not found.");
            }

            if (account.Status == "Completed")
            {
                throw new InvalidOperationException($"Installment account #{dto.InstallmentAccountId} is already fully paid and completed.");
            }

            // Get all schedules that still have an outstanding balance (penalties or amortization)
            // Ordered chronologically by InstallmentNumber
            var unpaidSchedules = account.Schedules
                .Where(s => s.Status != "Paid" || (s.PenaltyAssessed - s.PenaltyPaid) > 0 || (s.AmountDue - s.AmountPaid) > 0)
                .OrderBy(s => s.InstallmentNumber)
                .ToList();

            if (!unpaidSchedules.Any())
            {
                account.Status = "Completed";
                account.UpdatedAt = DateTime.UtcNow;
                await _context.SaveChangesAsync(cancellationToken);
                await transaction.CommitAsync(cancellationToken);

                return new PaymentReceiptDto
                {
                    InstallmentAccountId = account.Id,
                    TotalAmountPaid = 0,
                    RemainingAccountBalance = 0,
                    AccountStatus = "Completed",
                    PaymentDate = DateTime.UtcNow
                };
            }

            decimal paymentPool = dto.AmountPaid;
            decimal totalPenaltyAllocated = 0m;
            decimal totalInterestAllocated = 0m;
            decimal totalPrincipalAllocated = 0m;

            var breakdowns = new List<ScheduleAllocationBreakdownDto>();
            var paymentDate = DateTime.UtcNow;

            // =========================================================================
            // WATERFALL ALLOCATION ENGINE
            // Sequence: Penalties First -> Interest Second -> Principal Last
            // =========================================================================
            foreach (var schedule in unpaidSchedules)
            {
                if (paymentPool <= 0) break;

                decimal schedPenaltyPaid = 0m;
                decimal schedInterestPaid = 0m;
                decimal schedPrincipalPaid = 0m;

                // 1. PENALTIES FIRST
                decimal unpaidPenalty = Math.Max(0, schedule.PenaltyAssessed - schedule.PenaltyPaid);
                if (unpaidPenalty > 0 && paymentPool > 0)
                {
                    schedPenaltyPaid = Math.Min(paymentPool, unpaidPenalty);
                    schedule.PenaltyPaid += schedPenaltyPaid;
                    paymentPool -= schedPenaltyPaid;
                    totalPenaltyAllocated += schedPenaltyPaid;
                }

                // 2. INTEREST SECOND
                // Calculate portion of AmountPaid that went to interest vs principal
                decimal currentInterestPaid = Math.Min(schedule.InterestDue, schedule.AmountPaid);
                decimal unpaidInterest = Math.Max(0, schedule.InterestDue - currentInterestPaid);

                if (unpaidInterest > 0 && paymentPool > 0)
                {
                    schedInterestPaid = Math.Min(paymentPool, unpaidInterest);
                    schedule.AmountPaid += schedInterestPaid;
                    paymentPool -= schedInterestPaid;
                    totalInterestAllocated += schedInterestPaid;
                }

                // 3. PRINCIPAL LAST
                decimal currentPrincipalPaid = Math.Max(0, schedule.AmountPaid - schedule.InterestDue);
                decimal unpaidPrincipal = Math.Max(0, schedule.PrincipalDue - currentPrincipalPaid);

                if (unpaidPrincipal > 0 && paymentPool > 0)
                {
                    schedPrincipalPaid = Math.Min(paymentPool, unpaidPrincipal);
                    schedule.AmountPaid += schedPrincipalPaid;
                    paymentPool -= schedPrincipalPaid;
                    totalPrincipalAllocated += schedPrincipalPaid;
                }

                // Evaluate Schedule Status
                decimal remainingSchedPenalty = Math.Max(0, schedule.PenaltyAssessed - schedule.PenaltyPaid);
                decimal remainingSchedAmortization = Math.Max(0, schedule.AmountDue - schedule.AmountPaid);

                if (remainingSchedPenalty <= 0 && remainingSchedAmortization <= 0)
                {
                    schedule.Status = "Paid";
                    schedule.PaidDate = paymentDate;
                }
                else if (schedule.AmountPaid > 0 || schedule.PenaltyPaid > 0)
                {
                    schedule.Status = "Partial";
                }
                else if (schedule.DueDate < DateTime.UtcNow.Date)
                {
                    schedule.Status = "Overdue";
                }
                else
                {
                    schedule.Status = "Pending";
                }

                decimal totalAllocatedToSchedule = schedPenaltyPaid + schedInterestPaid + schedPrincipalPaid;
                if (totalAllocatedToSchedule > 0)
                {
                    breakdowns.Add(new ScheduleAllocationBreakdownDto
                    {
                        ScheduleId = schedule.Id,
                        InstallmentNumber = schedule.InstallmentNumber,
                        DueDate = schedule.DueDate,
                        PenaltyPaid = schedPenaltyPaid,
                        InterestPaid = schedInterestPaid,
                        PrincipalPaid = schedPrincipalPaid,
                        TotalAllocated = totalAllocatedToSchedule,
                        RemainingScheduleBalance = remainingSchedPenalty + remainingSchedAmortization,
                        NewStatus = schedule.Status
                    });
                }
            }

            // Create Master Payment Audit Row
            var paymentRecord = new InstallmentPayment
            {
                InstallmentAccountId = account.Id,
                ScheduleId = dto.TargetScheduleId ?? breakdowns.FirstOrDefault()?.ScheduleId,
                AmountPaid = dto.AmountPaid - paymentPool, // Actual amount ingested into schedules
                PenaltyCovered = totalPenaltyAllocated,
                InterestCovered = totalInterestAllocated,
                PrincipalCovered = totalPrincipalAllocated,
                PaymentMethod = dto.PaymentMethod,
                ReferenceNumber = dto.ReferenceNumber,
                ReceivedByUserId = dto.ReceivedByUserId,
                PaymentDate = paymentDate,
                Notes = dto.Notes
            };

            _context.InstallmentPayments.Add(paymentRecord);

            // Check if all schedules are settled
            bool allSchedulesPaid = account.Schedules.All(s => s.Status == "Paid" && s.IsFullyPaid);
            if (allSchedulesPaid)
            {
                account.Status = "Completed";
                _logger.LogInformation("InstallmentAccount #{AccountId} successfully settled and marked COMPLETED.", account.Id);
            }
            account.UpdatedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);

            // Compute overall remaining balance
            decimal remainingAccountBalance = account.Schedules.Sum(s => s.RemainingPenalty + s.RemainingAmortization);

            _logger.LogInformation("Waterfall payment applied to Account #{AccountId}. Paid: {Paid}, Penalty: {Pen}, Interest: {Int}, Principal: {Prin}, Remaining: {Rem}",
                account.Id, dto.AmountPaid - paymentPool, totalPenaltyAllocated, totalInterestAllocated, totalPrincipalAllocated, remainingAccountBalance);

            return new PaymentReceiptDto
            {
                PaymentId = paymentRecord.Id,
                InstallmentAccountId = account.Id,
                TotalAmountPaid = paymentRecord.AmountPaid,
                TotalPenaltyCovered = totalPenaltyAllocated,
                TotalInterestCovered = totalInterestAllocated,
                TotalPrincipalCovered = totalPrincipalAllocated,
                ExcessUnallocatedAmount = paymentPool,
                RemainingAccountBalance = remainingAccountBalance,
                AccountStatus = account.Status,
                PaymentMethod = dto.PaymentMethod,
                ReferenceNumber = dto.ReferenceNumber,
                PaymentDate = paymentDate,
                Allocations = breakdowns
            };
        }
        catch (Exception ex)
        {
            await transaction.RollbackAsync(cancellationToken);
            _logger.LogError(ex, "Transaction rolled back during Waterfall Payment processing for Account #{AccountId}", dto.InstallmentAccountId);
            throw;
        }
    }

    public async Task<InstallmentAccount?> GetAccountWithDetailsAsync(int accountId, CancellationToken cancellationToken = default)
    {
        return await _context.InstallmentAccounts
            .Include(a => a.Schedules.OrderBy(s => s.InstallmentNumber))
            .Include(a => a.Payments.OrderByDescending(p => p.PaymentDate))
            .FirstOrDefaultAsync(a => a.Id == accountId, cancellationToken);
    }
}

