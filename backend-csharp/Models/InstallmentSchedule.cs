using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ZLics.InstallmentEngine.Models;

public class InstallmentSchedule
{
    [Key]
    public int Id { get; set; }

    [Required]
    public int InstallmentAccountId { get; set; }

    public int InstallmentNumber { get; set; } // 1, 2, 3 ... N

    public DateTime DueDate { get; set; }

    [Column(TypeName = "decimal(18,2)")]
    public decimal AmountDue { get; set; } // PrincipalDue + InterestDue

    [Column(TypeName = "decimal(18,2)")]
    public decimal PrincipalDue { get; set; }

    [Column(TypeName = "decimal(18,2)")]
    public decimal InterestDue { get; set; }

    [Column(TypeName = "decimal(18,2)")]
    public decimal AmountPaid { get; set; } = 0.00m;

    [Column(TypeName = "decimal(18,2)")]
    public decimal PenaltyAssessed { get; set; } = 0.00m;

    [Column(TypeName = "decimal(18,2)")]
    public decimal PenaltyPaid { get; set; } = 0.00m;

    [Required]
    [MaxLength(20)]
    public string Status { get; set; } = "Pending"; // Pending, Partial, Paid, Overdue

    public DateTime? PaidDate { get; set; }

    // Navigation Property
    [ForeignKey(nameof(InstallmentAccountId))]
    public virtual InstallmentAccount InstallmentAccount { get; set; } = null!;

    // Helper computed properties
    [NotMapped]
    public decimal RemainingPenalty => Math.Max(0, PenaltyAssessed - PenaltyPaid);

    [NotMapped]
    public decimal RemainingAmortization => Math.Max(0, AmountDue - AmountPaid);

    [NotMapped]
    public decimal TotalRemaining => RemainingPenalty + RemainingAmortization;

    [NotMapped]
    public bool IsFullyPaid => RemainingPenalty <= 0 && RemainingAmortization <= 0;
}

