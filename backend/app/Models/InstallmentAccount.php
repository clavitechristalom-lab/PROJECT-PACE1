<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class InstallmentAccount extends Model
{
    protected $primaryKey = 'installment_id';
    protected $table = 'installment_accounts';

    protected $fillable = [
        'account_no', 'customer_id', 'sale_id', 'has_agent', 'agent_id',
        'appliances_agent_contribution', 'furniture_agent_contribution', 'total_agent_contribution',
        'start_date', 'principal_amount', 'down_payment', 'interest_rate', 'interest_amount',
        'total_payable', 'installment_amount', 'number_of_installments', 'frequency', 'status', 'notes'
    ];

    protected $casts = [
        'has_agent' => 'boolean',
        'appliances_agent_contribution' => 'decimal:2',
        'furniture_agent_contribution' => 'decimal:2',
        'total_agent_contribution' => 'decimal:2',
    ];

    protected $appends = ['total_paid', 'balance', 'remaining_balance'];

    /**
     * Canonical financial breakdown: counts only confirmed/completed payments,
     * avoids double-counting down payment, and tracks pending verifications separately.
     */
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
        return $this->balance;
    }

    public function syncCompletionStatus(): bool
    {
        if ((float) $this->total_payable > 0 && $this->balance <= 0) {
            if ($this->status !== 'Complete Payment') {
                $this->status = 'Complete Payment';
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
                    Statement::syncCustomerStatements((int)$installment->customer_id);
                }
            } catch (\Throwable $e) {}
        });
    }
}
