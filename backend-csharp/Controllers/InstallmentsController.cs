using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ZLics.InstallmentEngine.Data;
using ZLics.InstallmentEngine.DTOs;
using ZLics.InstallmentEngine.Services;
using ZLics.InstallmentEngine.Workers;

namespace ZLics.InstallmentEngine.Controllers;

[ApiController]
[Route("api/[controller]")]
public class InstallmentsController : ControllerBase
{
    private readonly IInstallmentPaymentService _paymentService;
    private readonly AppDbContext _context;
    private readonly ILogger<InstallmentsController> _logger;

    public InstallmentsController(
        IInstallmentPaymentService paymentService,
        AppDbContext context,
        ILogger<InstallmentsController> logger)
    {
        _paymentService = paymentService;
        _context = context;
        _logger = logger;
    }

    /// <summary>
    /// Previews agreement calculations and projected amortization schedule before booking.
    /// </summary>
    [HttpPost("preview-agreement")]
    public ActionResult<AgreementPreviewDto> PreviewAgreement([FromBody] CreateAgreementDto dto)
    {
        if (!ModelState.IsValid)
        {
            return BadRequest(ModelState);
        }

        var preview = _paymentService.PreviewAgreement(dto);
        return Ok(preview);
    }

    /// <summary>
    /// POS & Agreement Generator: Generates master InstallmentAccount and staggered schedules.
    /// </summary>
    [HttpPost("generate-agreement")]
    public async Task<IActionResult> GenerateAgreement([FromBody] CreateAgreementDto dto, CancellationToken cancellationToken)
    {
        if (!ModelState.IsValid)
        {
            return BadRequest(ModelState);
        }

        try
        {
            var account = await _paymentService.CreateInstallmentAgreementAsync(dto, cancellationToken);
            return CreatedAtAction(nameof(GetAccountDetails), new { id = account.Id }, new
            {
                message = "Installment agreement and schedules successfully generated.",
                account
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to generate installment agreement.");
            return StatusCode(500, new { error = "Internal server error occurred while creating installment agreement.", details = ex.Message });
        }
    }

    /// <summary>
    /// Waterfall Payment Engine: Strictly allocates payments (Penalties -> Interest -> Principal).
    /// Prevents race conditions using transactional locking.
    /// </summary>
    [HttpPost("process-payment")]
    public async Task<ActionResult<PaymentReceiptDto>> ProcessPayment([FromBody] ProcessPaymentDto dto, CancellationToken cancellationToken)
    {
        if (!ModelState.IsValid)
        {
            return BadRequest(ModelState);
        }

        try
        {
            var receipt = await _paymentService.ProcessPaymentWaterfallAsync(dto, cancellationToken);
            return Ok(new
            {
                success = true,
                message = "Payment processed successfully through Waterfall Engine.",
                receipt
            });
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { error = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Payment processing failed for Account #{AccountId}", dto.InstallmentAccountId);
            return StatusCode(500, new { error = "Payment processing failed due to a server error.", details = ex.Message });
        }
    }

    /// <summary>
    /// Retrieves master installment account with all staggered schedules and payment history.
    /// </summary>
    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetAccountDetails(int id, CancellationToken cancellationToken)
    {
        var account = await _paymentService.GetAccountWithDetailsAsync(id, cancellationToken);
        if (account == null)
        {
            return NotFound(new { error = $"Installment account #{id} not found." });
        }

        var totalPaid = account.Schedules.Sum(s => s.AmountPaid + s.PenaltyPaid);
        var totalBalance = account.Schedules.Sum(s => s.RemainingPenalty + s.RemainingAmortization);
        var totalPayable = account.Schedules.Sum(s => s.AmountDue + s.PenaltyAssessed);

        return Ok(new
        {
            account.Id,
            account.SaleId,
            account.CustomerId,
            account.TotalCashPrice,
            account.DownPayment,
            account.InterestRate,
            account.TotalFinancedAmount,
            account.TotalTermsMonths,
            account.MonthlyAmortization,
            account.Status,
            account.CreatedAt,
            Summary = new
            {
                TotalPayable = totalPayable,
                TotalPaid = totalPaid,
                RemainingBalance = totalBalance,
                ProgressPercentage = totalPayable > 0 ? Math.Round((totalPaid / totalPayable) * 100, 1) : 0,
                PaidTermsCount = account.Schedules.Count(s => s.Status == "Paid"),
                RemainingTermsCount = account.Schedules.Count(s => s.Status != "Paid")
            },
            Schedules = account.Schedules.Select(s => new
            {
                s.Id,
                s.InstallmentNumber,
                s.DueDate,
                s.AmountDue,
                s.PrincipalDue,
                s.InterestDue,
                s.AmountPaid,
                s.PenaltyAssessed,
                s.PenaltyPaid,
                s.RemainingPenalty,
                s.RemainingAmortization,
                TotalRemaining = s.TotalRemaining,
                s.Status,
                s.PaidDate
            }),
            Payments = account.Payments.Select(p => new
            {
                p.Id,
                p.AmountPaid,
                p.PenaltyCovered,
                p.InterestCovered,
                p.PrincipalCovered,
                p.PaymentMethod,
                p.ReferenceNumber,
                p.PaymentDate,
                p.Notes
            })
        });
    }

    /// <summary>
    /// Returns all installment accounts for a given customer.
    /// </summary>
    [HttpGet("customer/{customerId:int}")]
    public async Task<IActionResult> GetCustomerInstallments(int customerId, CancellationToken cancellationToken)
    {
        var accounts = await _context.InstallmentAccounts
            .Include(a => a.Schedules)
            .Where(a => a.CustomerId == customerId)
            .OrderByDescending(a => a.CreatedAt)
            .ToListAsync(cancellationToken);

        var result = accounts.Select(a => new
        {
            a.Id,
            a.SaleId,
            a.TotalCashPrice,
            a.DownPayment,
            a.InterestRate,
            a.TotalFinancedAmount,
            a.TotalTermsMonths,
            a.MonthlyAmortization,
            a.Status,
            a.CreatedAt,
            TotalPaid = a.Schedules.Sum(s => s.AmountPaid + s.PenaltyPaid),
            RemainingBalance = a.Schedules.Sum(s => s.RemainingPenalty + s.RemainingAmortization),
            TotalPayable = a.Schedules.Sum(s => s.AmountDue + s.PenaltyAssessed),
            NextDueSchedule = a.Schedules
                .Where(s => s.Status != "Paid")
                .OrderBy(s => s.DueDate)
                .Select(s => new { s.Id, s.InstallmentNumber, s.DueDate, s.AmountDue, s.TotalRemaining, s.Status })
                .FirstOrDefault()
        });

        return Ok(result);
    }

    /// <summary>
    /// Explicit on-demand trigger to invoke the penalty assessment scanner immediately.
    /// </summary>
    [HttpPost("trigger-penalty-scan")]
    public async Task<IActionResult> TriggerPenaltyScan([FromServices] PenaltyAssessmentWorker worker, CancellationToken cancellationToken)
    {
        int assessed = await worker.AssessOverduePenaltiesAsync(cancellationToken);
        return Ok(new { success = true, overduePenaltiesAssessed = assessed, scannedAt = DateTime.UtcNow });
    }
}

