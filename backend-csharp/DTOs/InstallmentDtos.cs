using System.ComponentModel.DataAnnotations;

namespace ZLics.InstallmentEngine.DTOs;

public class CreateAgreementDto
{
    [Required]
    public int SaleId { get; set; }

    [Required]
    public int CustomerId { get; set; }

    [Range(0.01, double.MaxValue, ErrorMessage = "Total cash price must be greater than zero.")]
    public decimal TotalCashPrice { get; set; }

    [Range(0.0, double.MaxValue, ErrorMessage = "Down payment cannot be negative.")]
    public decimal DownPayment { get; set; }

    [Range(0.0, 100.0, ErrorMessage = "Interest rate must be between 0% and 100%.")]
    public decimal MonthlyInterestRate { get; set; } = 3.00m; // standard 3% per month

    [Range(1, 60, ErrorMessage = "Term length must be between 1 and 60 months.")]
    public int TotalTermsMonths { get; set; } = 6; // e.g., 3, 6, 12, 24

    public DateTime? FirstDueDate { get; set; } // Defaults to 30 days from creation
}

public class ProcessPaymentDto
{
    [Required]
    public int InstallmentAccountId { get; set; }

    public int? TargetScheduleId { get; set; }

    [Range(0.01, double.MaxValue, ErrorMessage = "Payment amount must be greater than zero.")]
    public decimal AmountPaid { get; set; }

    [Required]
    [MaxLength(50)]
    public string PaymentMethod { get; set; } = "Cash"; // "Cash", "GCash", "Maya", "Bank Transfer"

    [MaxLength(100)]
    public string? ReferenceNumber { get; set; }

    public int ReceivedByUserId { get; set; } = 1;

    public string? Notes { get; set; }
}

public class PaymentReceiptDto
{
    public int PaymentId { get; set; }
    public int InstallmentAccountId { get; set; }
    public decimal TotalAmountPaid { get; set; }
    public decimal TotalPenaltyCovered { get; set; }
    public decimal TotalInterestCovered { get; set; }
    public decimal TotalPrincipalCovered { get; set; }
    public decimal ExcessUnallocatedAmount { get; set; }
    public decimal RemainingAccountBalance { get; set; }
    public string AccountStatus { get; set; } = string.Empty;
    public string PaymentMethod { get; set; } = string.Empty;
    public string? ReferenceNumber { get; set; }
    public DateTime PaymentDate { get; set; }
    public List<ScheduleAllocationBreakdownDto> Allocations { get; set; } = new();
}

public class ScheduleAllocationBreakdownDto
{
    public int ScheduleId { get; set; }
    public int InstallmentNumber { get; set; }
    public DateTime DueDate { get; set; }
    public decimal PenaltyPaid { get; set; }
    public decimal InterestPaid { get; set; }
    public decimal PrincipalPaid { get; set; }
    public decimal TotalAllocated { get; set; }
    public decimal RemainingScheduleBalance { get; set; }
    public string NewStatus { get; set; } = string.Empty;
}

public class AgreementPreviewDto
{
    public decimal TotalCashPrice { get; set; }
    public decimal DownPayment { get; set; }
    public decimal TotalFinancedAmount { get; set; }
    public decimal MonthlyInterestRate { get; set; }
    public int TotalTermsMonths { get; set; }
    public decimal TotalInterest { get; set; }
    public decimal TotalPayable { get; set; }
    public decimal MonthlyAmortization { get; set; }
    public List<SchedulePreviewItemDto> ProjectedSchedules { get; set; } = new();
}

public class SchedulePreviewItemDto
{
    public int InstallmentNumber { get; set; }
    public DateTime DueDate { get; set; }
    public decimal PrincipalDue { get; set; }
    public decimal InterestDue { get; set; }
    public decimal MonthlyAmortization { get; set; }
    public decimal RemainingBalanceAfterPayment { get; set; }
}

