using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ZLics.InstallmentEngine.Models;

public class InstallmentAccount
{
    [Key]
    public int Id { get; set; }

    [Required]
    public int SaleId { get; set; }

    [Required]
    public int CustomerId { get; set; }

    [Column(TypeName = "decimal(18,2)")]
    public decimal TotalCashPrice { get; set; }

    [Column(TypeName = "decimal(18,2)")]
    public decimal DownPayment { get; set; }

    [Column(TypeName = "decimal(5,2)")]
    public decimal InterestRate { get; set; } // Monthly or annual interest rate percentage (e.g. 3.00%)

    [Column(TypeName = "decimal(18,2)")]
    public decimal TotalFinancedAmount { get; set; } // TotalCashPrice - DownPayment

    public int TotalTermsMonths { get; set; } // e.g. 3, 6, 12, 24

    [Column(TypeName = "decimal(18,2)")]
    public decimal MonthlyAmortization { get; set; }

    [Required]
    [MaxLength(30)]
    public string Status { get; set; } = "Active"; // Active, Completed, Defaulted, Suspended

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }

    // Navigation Properties
    public virtual ICollection<InstallmentSchedule> Schedules { get; set; } = new List<InstallmentSchedule>();
    public virtual ICollection<InstallmentPayment> Payments { get; set; } = new List<InstallmentPayment>();
}

