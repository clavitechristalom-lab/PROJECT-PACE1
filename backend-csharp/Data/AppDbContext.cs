using Microsoft.EntityFrameworkCore;
using ZLics.InstallmentEngine.Models;

namespace ZLics.InstallmentEngine.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    public virtual DbSet<InstallmentAccount> InstallmentAccounts { get; set; } = null!;
    public virtual DbSet<InstallmentSchedule> InstallmentSchedules { get; set; } = null!;
    public virtual DbSet<InstallmentPayment> InstallmentPayments { get; set; } = null!;

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // InstallmentAccount config
        modelBuilder.Entity<InstallmentAccount>(entity =>
        {
            entity.ToTable("InstallmentAccounts");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.CustomerId);
            entity.HasIndex(e => e.SaleId);
            entity.HasIndex(e => e.Status);

            entity.Property(e => e.TotalCashPrice).HasPrecision(18, 2);
            entity.Property(e => e.DownPayment).HasPrecision(18, 2);
            entity.Property(e => e.InterestRate).HasPrecision(5, 2);
            entity.Property(e => e.TotalFinancedAmount).HasPrecision(18, 2);
            entity.Property(e => e.MonthlyAmortization).HasPrecision(18, 2);
            entity.Property(e => e.Status).HasMaxLength(30).IsRequired();

            entity.HasMany(e => e.Schedules)
                  .WithOne(s => s.InstallmentAccount)
                  .HasForeignKey(s => s.InstallmentAccountId)
                  .OnDelete(DeleteBehavior.Cascade);

            entity.HasMany(e => e.Payments)
                  .WithOne(p => p.InstallmentAccount)
                  .HasForeignKey(p => p.InstallmentAccountId)
                  .OnDelete(DeleteBehavior.Restrict);
        });

        // InstallmentSchedule config
        modelBuilder.Entity<InstallmentSchedule>(entity =>
        {
            entity.ToTable("InstallmentSchedules");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.InstallmentAccountId, e.InstallmentNumber }).IsUnique();
            entity.HasIndex(e => e.DueDate);
            entity.HasIndex(e => e.Status);

            entity.Property(e => e.AmountDue).HasPrecision(18, 2);
            entity.Property(e => e.PrincipalDue).HasPrecision(18, 2);
            entity.Property(e => e.InterestDue).HasPrecision(18, 2);
            entity.Property(e => e.AmountPaid).HasPrecision(18, 2);
            entity.Property(e => e.PenaltyAssessed).HasPrecision(18, 2);
            entity.Property(e => e.PenaltyPaid).HasPrecision(18, 2);
            entity.Property(e => e.Status).HasMaxLength(20).IsRequired();
        });

        // InstallmentPayment config
        modelBuilder.Entity<InstallmentPayment>(entity =>
        {
            entity.ToTable("InstallmentPayments");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.InstallmentAccountId);
            entity.HasIndex(e => e.PaymentDate);
            entity.HasIndex(e => e.ReferenceNumber);

            entity.Property(e => e.AmountPaid).HasPrecision(18, 2);
            entity.Property(e => e.PenaltyCovered).HasPrecision(18, 2);
            entity.Property(e => e.InterestCovered).HasPrecision(18, 2);
            entity.Property(e => e.PrincipalCovered).HasPrecision(18, 2);
            entity.Property(e => e.PaymentMethod).HasMaxLength(50).IsRequired();
            entity.Property(e => e.ReferenceNumber).HasMaxLength(100);
        });
    }
}

