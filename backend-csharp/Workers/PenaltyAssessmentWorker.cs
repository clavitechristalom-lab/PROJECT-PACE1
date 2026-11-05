using Microsoft.EntityFrameworkCore;
using ZLics.InstallmentEngine.Data;

namespace ZLics.InstallmentEngine.Workers;

/// <summary>
/// Background cron / hosted service executing daily to evaluate overdue schedules,
/// transition their statuses to 'Overdue', and apply late payment penalties.
/// </summary>
public class PenaltyAssessmentWorker : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<PenaltyAssessmentWorker> _logger;
    private readonly TimeSpan _checkInterval = TimeSpan.FromHours(24); // Daily cycle

    // Standard store policy: 5% penalty on remaining unpaid monthly amortization
    private const decimal LATE_PENALTY_PERCENTAGE = 0.05m; 
    private const decimal MINIMUM_PENALTY_AMOUNT = 50.00m; // ₱50.00 minimum late charge

    public PenaltyAssessmentWorker(IServiceScopeFactory scopeFactory, ILogger<PenaltyAssessmentWorker> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("PenaltyAssessmentWorker initiated. Running daily background scans for overdue installment schedules...");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await AssessOverduePenaltiesAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Unexpected error occurred during overdue penalty assessment cycle.");
            }

            try
            {
                // Delay until next day's run or token cancellation
                await Task.Delay(_checkInterval, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }

        _logger.LogInformation("PenaltyAssessmentWorker gracefully stopped.");
    }

    public async Task<int> AssessOverduePenaltiesAsync(CancellationToken cancellationToken)
    {
        using var scope = _scopeFactory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var today = DateTime.UtcNow.Date;

        // Query schedules that are past their due date, not fully paid, and haven't had penalties assessed yet for the current month
        var overdueSchedules = await context.InstallmentSchedules
            .Include(s => s.InstallmentAccount)
            .Where(s => s.DueDate < today && s.Status != "Paid" && s.InstallmentAccount.Status == "Active")
            .ToListAsync(cancellationToken);

        if (!overdueSchedules.Any())
        {
            _logger.LogInformation("Overdue check complete. Zero active overdue schedules detected today.");
            return 0;
        }

        int penaltiesAssessedCount = 0;
        decimal totalPenaltiesAdded = 0m;

        foreach (var schedule in overdueSchedules)
        {
            var unpaidAmortization = Math.Max(0, schedule.AmountDue - schedule.AmountPaid);

            // Mark status as Overdue
            if (schedule.Status != "Overdue")
            {
                schedule.Status = "Overdue";
            }

            // Only assess penalty if no penalty has been assessed yet, or assess incremental late charge
            if (schedule.PenaltyAssessed == 0 && unpaidAmortization > 0)
            {
                var penalty = Math.Max(MINIMUM_PENALTY_AMOUNT, Math.Round(unpaidAmortization * LATE_PENALTY_PERCENTAGE, 2));
                schedule.PenaltyAssessed += penalty;
                penaltiesAssessedCount++;
                totalPenaltiesAdded += penalty;

                _logger.LogWarning("Assessed late penalty of ₱{Penalty} on Schedule #{ScheduleId} (Account #{AccountId}, Due: {DueDate:yyyy-MM-dd}).",
                    penalty, schedule.Id, schedule.InstallmentAccountId, schedule.DueDate);
            }
        }

        if (penaltiesAssessedCount > 0)
        {
            await context.SaveChangesAsync(cancellationToken);
            _logger.LogInformation("Assessed penalties on {Count} schedules totaling ₱{Total:N2}.",
                penaltiesAssessedCount, totalPenaltiesAdded);
        }

        return penaltiesAssessedCount;
    }
}

