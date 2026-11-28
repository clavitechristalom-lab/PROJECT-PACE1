<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class InstallmentAccount extends Model
{
    public const STATUS_FULLY_PAID = 'Fully Paid';
    public const STANDING_CLEARED = 'Cleared / Good Standing';
    public const AGENT_CONTRIBUTION_SETTLED = 'Settled';

    public const COMPLETED_STATUSES = [
        'Fully Paid',
        'Completed',
        'Complete Payment',
    ];

    protected $primaryKey = 'installment_id';
    protected $table = 'installment_accounts';

    protected $fillable = [
        'account_no', 'customer_id', 'sale_id', 'has_agent', 'agent_id',
        'appliances_agent_contribution', 'furniture_agent_contribution', 'total_agent_contribution',
        'agent_contribution_status', 'start_date', 'principal_amount', 'down_payment',
        'interest_rate', 'interest_amount', 'total_payable', 'remaining_balance',
        'installment_amount', 'number_of_installments', 'frequency', 'status',
        'completed_at', 'next_due_date', 'customer_standing', 'completed_verified_by', 'notes'
    ];

    protected $casts = [
        'has_agent' => 'boolean',
        'appliances_agent_contribution' => 'decimal:2',
        'furniture_agent_contribution' => 'decimal:2',
        'total_agent_contribution' => 'decimal:2',
        'remaining_balance' => 'decimal:2',
        'completed_at' => 'datetime',
        'next_due_date' => 'date:Y-m-d',
    ];

    protected $appends = ['total_paid', 'balance', 'remaining_balance'];

    public function financialBreakdown(): array
    {
        $payments = $this->relationLoaded('payments')
            ? $this->payments
            : $this->payments()->get();

        $completedPayments = $payments->filter(function ($p) {
            return Payment::isSettledStatus($p->status);
        });

        $pendingPayments = $payments->filter(function ($p) {
            return Payment::isPendingVerificationStatus($p->status);
        });

        $hasDownpaymentRow = $completedPayments->contains(function ($p) {
            $ref = strtoupper((string) ($p->reference_no ?? ''));
            $notes = strtolower((string) ($p->notes ?? ''));
            return str_starts_with($ref, 'DOWNPAYMENT')
                || str_contains($notes, 'downpayment')
                || str_contains($notes, 'down payment');
        });

        $paymentsSum = (float) $completedPayments->sum('amount');
        $downPaymentToAdd = $hasDownpaymentRow ? 0.0 : (float) $this->down_payment;
        $paid = round($paymentsSum + $downPaymentToAdd, 2);
        $totalPayable = (float) $this->total_payable;
        $balance = max(0, round($totalPayable - $paid, 2));

        return [
            'paid' => $paid,
            'balance' => $balance,
            'pending_amount' => round((float) $pendingPayments->sum('amount'), 2),
            'pending_count' => $pendingPayments->count(),
            'completed_payments_count' => $completedPayments->count(),
        ];
    }

    public function isFullyPaid(): bool
    {
        $st = strtolower(trim((string) $this->status));
        if (in_array($st, ['fully paid', 'completed', 'complete payment'], true)) {
            return true;
        }
        return (float) $this->total_payable > 0 && $this->balance <= 0.0;
    }

    public function getTotalPaidAttribute(): float
    {
        return $this->financialBreakdown()['paid'];
    }

    public function getBalanceAttribute(): float
    {
        return max(0, round((float) $this->total_payable - $this->total_paid, 2));
    }

    public function getRemainingBalanceAttribute(): float
    {
        if (in_array(strtolower(trim((string) $this->status)), ['fully paid', 'completed', 'complete payment'], true)) {
            return 0.0;
        }
        return $this->balance;
    }

    public function syncCompletionStatus(?int $verifiedByUserId = null): bool
    {
        if ((float) $this->total_payable > 0 && $this->balance <= 0) {
            $wasCompleted = strtolower(trim((string) $this->status)) === strtolower(self::STATUS_FULLY_PAID)
                && $this->completed_at !== null
                && $this->next_due_date === null
                && $this->customer_standing === self::STANDING_CLEARED;

            if (!$wasCompleted) {
                $this->remaining_balance = 0.00;
                $this->status = self::STATUS_FULLY_PAID;
                $this->completed_at = $this->completed_at ?: now();
                $this->next_due_date = null;
                $this->customer_standing = self::STANDING_CLEARED;
                if ($this->has_agent) {
                    $this->agent_contribution_status = self::AGENT_CONTRIBUTION_SETTLED;
                }
                if ($verifiedByUserId && !$this->completed_verified_by) {
                    $this->completed_verified_by = $verifiedByUserId;
                }
                $this->saveQuietly();
                return true;
            }
        }
        return false;
    }

    public function customer()
    {
        return $this->belongsTo(Customer::class, 'customer_id', 'customer_id');
    }

    public function sale()
    {
        return $this->belongsTo(SaleTransaction::class, 'sale_id', 'sale_id');
    }

    public function saleTransaction()
    {
        return $this->belongsTo(SaleTransaction::class, 'sale_id', 'sale_id');
    }

    public function agent()
    {
        return $this->belongsTo(Employee::class, 'agent_id', 'employee_id');
    }

    public function completedVerifiedBy()
    {
        return $this->belongsTo(User::class, 'completed_verified_by', 'user_id');
    }

    public function paymentSchedules()
    {
        return $this->hasMany(PaymentSchedule::class, 'installment_id', 'installment_id');
    }

    public function payments()
    {
        return $this->hasMany(Payment::class, 'installment_id', 'installment_id');
    }

    public function ewalletDeposits()
    {
        return $this->hasMany(EWalletDeposit::class, 'installment_id', 'installment_id');
    }

    protected static function booted()
    {
        static::saved(function ($installment) {
            try {
                if ($installment->customer_id && \Illuminate\Support\Facades\Schema::hasTable('statements')) {
                    Statement::syncCustomerStatements((int) $installment->customer_id);
                }
            } catch (\Throwable $e) {}
        });
    }
}
