<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class Payment extends Model
{
    public const STATUS_COMPLETED = 'Completed';
    public const STATUS_CONFIRMED_CASHIER = 'Confirmed / Received by Cashier';
    public const STATUS_PENDING_STORE_APPROVAL = 'Pending Store Admin Approval';
    public const STATUS_COLLECTED_BY_COLLECTOR = 'Collected by Collector';
    public const STATUS_PENDING_COLLECTOR = 'pending_collector';
    public const STATUS_PENDING = 'Pending';
    public const STATUS_REJECTED = 'Rejected';

    public const CONFIRMED_STATUSES = [
        self::STATUS_COMPLETED,
        self::STATUS_CONFIRMED_CASHIER,
    ];

    public const EXCLUDED_NON_SETTLED_STATUSES = [
        'pending',
        'pending_collector',
        'pending collector',
        'pending_store',
        'pending store',
        'pending verification',
        'pending approval',
        'pending store admin approval',
        'pending_store_admin_approval',
        'collected by collector',
        'collected_by_collector',
        'rejected',
        'failed',
        'cancelled',
        'voided',
    ];

    protected $primaryKey = 'payment_id';
    protected $table = 'payments';
    public $timestamps = false;

    protected $fillable = [
        'installment_id', 'sale_id', 'schedule_id', 'receipt_no', 'payment_date',
        'amount', 'cash_tendered', 'change_due', 'payment_method', 'payment_type',
        'cash_channel', 'collector_id', 'reference_no', 'receipt_reference',
        'received_by', 'has_agent', 'agent_id', 'appliances_agent_contribution',
        'furniture_agent_contribution', 'total_agent_contribution',
        'notes', 'collector_remarks', 'status', 'collector_confirmed_at',
        'confirmed_by', 'confirmed_at', 'proof_of_payment'
    ];

    protected $casts = [
        'has_agent' => 'boolean',
        'cash_tendered' => 'decimal:2',
        'change_due' => 'decimal:2',
        'appliances_agent_contribution' => 'decimal:2',
        'furniture_agent_contribution' => 'decimal:2',
        'total_agent_contribution' => 'decimal:2',
        'collector_confirmed_at' => 'datetime',
        'confirmed_at' => 'datetime',
    ];

    public static function isSettledStatus(?string $status): bool
    {
        $st = strtolower(trim((string) ($status ?? 'completed')));
        return !in_array($st, self::EXCLUDED_NON_SETTLED_STATUSES, true);
    }

    public static function isPendingVerificationStatus(?string $status): bool
    {
        $st = strtolower(trim((string) ($status ?? '')));
        return in_array($st, [
            'pending',
            'pending_collector',
            'pending collector',
            'pending_store',
            'pending store',
            'pending verification',
            'pending approval',
            'pending store admin approval',
            'pending_store_admin_approval',
            'collected by collector',
            'collected_by_collector',
        ], true);
    }

    public function collector()
    {
        return $this->belongsTo(User::class, 'collector_id', 'user_id');
    }

    public function confirmedBy()
    {
        return $this->belongsTo(User::class, 'confirmed_by', 'user_id');
    }

    public function ewalletDeposit()
    {
        return $this->hasOne(EWalletDeposit::class, 'payment_id', 'payment_id');
    }

    public function installmentAccount()
    {
        return $this->belongsTo(InstallmentAccount::class, 'installment_id', 'installment_id');
    }

    public function sale()
    {
        return $this->belongsTo(SaleTransaction::class, 'sale_id', 'sale_id');
    }

    public function paymentSchedule()
    {
        return $this->belongsTo(PaymentSchedule::class, 'schedule_id', 'schedule_id');
    }

    public function receivedBy()
    {
        return $this->belongsTo(User::class, 'received_by', 'user_id');
    }

    public function agent()
    {
        return $this->belongsTo(Employee::class, 'agent_id', 'employee_id');
    }

    protected static function booted()
    {
        static::saved(function ($payment) {
            try {
                if (\Illuminate\Support\Facades\Schema::hasTable('statements')) {
                    if ($payment->installment_id) {
                        $inst = InstallmentAccount::find($payment->installment_id);
                        if ($inst && $inst->customer_id) {
                            Statement::syncCustomerStatements((int)$inst->customer_id);
                        }
                    } elseif ($payment->sale_id) {
                        $sale = SaleTransaction::find($payment->sale_id);
                        if ($sale && $sale->customer_id) {
                            Statement::syncCustomerStatements((int)$sale->customer_id);
                        }
                    }
                }
            } catch (\Throwable $e) {}
        });
    }
}