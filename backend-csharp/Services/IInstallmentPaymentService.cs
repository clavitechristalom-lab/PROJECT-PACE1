using ZLics.InstallmentEngine.DTOs;
using ZLics.InstallmentEngine.Models;

namespace ZLics.InstallmentEngine.Services;

public interface IInstallmentPaymentService
{
    /// <summary>
    /// Previews agreement calculations and projected schedules without committing to the database.
    /// </summary>
    AgreementPreviewDto PreviewAgreement(CreateAgreementDto dto);

    /// <summary>
    /// Creates a master InstallmentAccount and generates staggered InstallmentSchedule rows.
    /// </summary>
    Task<InstallmentAccount> CreateInstallmentAgreementAsync(CreateAgreementDto dto, CancellationToken cancellationToken = default);

    /// <summary>
    /// Strictly allocates incoming payments via Waterfall Order:
    /// Penalties First -> Interest Second -> Principal Last.
    /// Updates schedule statuses (Pending, Partial, Paid) and checks for master account completion.
    /// Runs inside a database transaction to prevent race conditions.
    /// </summary>
    Task<PaymentReceiptDto> ProcessPaymentWaterfallAsync(ProcessPaymentDto dto, CancellationToken cancellationToken = default);

    /// <summary>
    /// Retrieves master account details with all staggered schedules and historical payments.
    /// </summary>
    Task<InstallmentAccount?> GetAccountWithDetailsAsync(int accountId, CancellationToken cancellationToken = default);
}

