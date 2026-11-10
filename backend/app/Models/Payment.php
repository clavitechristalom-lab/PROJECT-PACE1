<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class Payment extends Model
{
    protected $primaryKey = 'payment_id';
    protected $table = 'payments';
    public $timestamps = false; // As per your SQL, this table only has a "created_at" timestamp

    protected $fillable = [
        'installment_id', 'schedule_id', 'receipt_no', 'payment_date', 
        'amount', 'payment_method', 'reference_no', 'received_by', 'notes',
        'status', 'proof_of_payment'
    ];

    // Relationships
    public function installmentAccount()
    {
        return $this->belongsTo(InstallmentAccount::class, 'installment_id', 'installment_id');
    }

    public function paymentSchedule()
    {
        return $this->belongsTo(PaymentSchedule::class, 'schedule_id', 'schedule_id');
    }

    public function receivedBy()
    {
        return $this->belongsTo(User::class, 'received_by', 'user_id');
    }

    protected static function booted()
    {
        static::saved(function ($payment) {
            try {
                if ($payment->installment_id && \Illuminate\Support\Facades\Schema::hasTable('statements')) {
                    $inst = InstallmentAccount::find($payment->installment_id);
                    if ($inst && $inst->customer_id) {
                        Statement::syncCustomerStatements((int)$inst->customer_id);
                    }
                }
            } catch (\Throwable $e) {}
        });
    }
}