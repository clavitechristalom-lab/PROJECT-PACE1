<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class InstallmentAccount extends Model
{
    protected $primaryKey = 'installment_id';
    protected $table = 'installment_accounts';

    protected $fillable = [
        'account_no', 'customer_id', 'sale_id', 'start_date', 'principal_amount',
        'down_payment', 'interest_rate', 'interest_amount', 'total_payable',
        'installment_amount', 'number_of_installments', 'frequency', 'status', 'notes'
    ];

    protected $appends = ['total_paid', 'balance', 'remaining_balance'];

    public function getTotalPaidAttribute(): float
    {
        $payments = $this->relationLoaded('payments')
            ? $this->payments
            : $this->payments()->get();

        $completedPayments = $payments->filter(function ($p) {
            return !in_array($p->status, ['Pending Verification', 'Rejected']);
        });

        $paymentsSum = (float) $completedPayments->sum('amount');

        $hasDownpaymentRow = $completedPayments->contains(function ($p) {
            $ref = strtoupper((string) ($p->reference_no ?? ''));
            $notes = strtolower((string) ($p->notes ?? ''));
            return str_starts_with($ref, 'DOWNPAYMENT')
                || str_contains($notes, 'downpayment')
                || str_contains($notes, 'down payment');
        });

        $downPaymentToAdd = $hasDownpaymentRow ? 0.0 : (float) $this->down_payment;
        return round($paymentsSum + $downPaymentToAdd, 2);
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

    public function paymentSchedules()
    {
        return $this->hasMany(PaymentSchedule::class, 'installment_id', 'installment_id');
    }

    public function payments()
    {
        return $this->hasMany(Payment::class, 'installment_id', 'installment_id');
    }
}
