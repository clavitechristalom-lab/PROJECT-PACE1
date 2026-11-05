using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ZLics.InstallmentEngine.Models;

public class InstallmentPayment
{
    [Key]
    public int Id { get; set; }

    [Required]
    public int InstallmentAccountId { get; set; }

    public int? ScheduleId { get; set; } // Specific schedule targeted, or null if master allocation

    [Column(TypeName = "decimal(18,2)")]
    public decimal AmountPaid { get; set; }

    [Required]
    [MaxLength(50)]
    public string PaymentMethod { get; set; } = "Cash"; // Cash, GCash, Maya, Bank Transfer

    [MaxLength(100)]
    public string? ReferenceNumber { get; set; }

    public int ReceivedByUserId { get; set; }

    public DateTime PaymentDate { get; set; } = DateTime.UtcNow;

    // Breakdown recorded for audit and receipts
    [Column(TypeName = "decimal(18,2)")]
    public decimal PenaltyCovered { get; set; } = 0.00m;

    [Column(TypeName = "decimal(18,2)")]
    public decimal InterestCovered { get; set; } = 0.00m;

    [Column(TypeName = "decimal(18,2)")]
    public decimal PrincipalCovered { get; set; } = 0.00m;

    [MaxLength(255)]
    public string? Notes { get; set; }

    // Navigation Properties
    [ForeignKey(nameof(InstallmentAccountId))]
    public virtual InstallmentAccount InstallmentAccount { get; set; } = null!;

    [ForeignKey(nameof(ScheduleId))]
    public virtual InstallmentSchedule? Schedule { get; set; }
}

