<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class PaymentSchedule extends Model
{
    protected $primaryKey = 'schedule_id';
    protected $table = 'payment_schedule';

    protected $fillable = [
        'installment_id', 'installment_no', 'due_date', 'amount_due', 
        'amount_paid', 'balance_due', 'status', 'paid_date', 'notes'
    ];

    // Relationships
    public function installmentAccount()
    {
        return $this->belongsTo(InstallmentAccount::class, 'installment_id', 'installment_id');
    }

    public function payments()
    {
        return $this->hasMany(Payment::class, 'schedule_id', 'schedule_id');
    }
}