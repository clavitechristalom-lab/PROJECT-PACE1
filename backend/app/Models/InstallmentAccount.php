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

    public function customer()
    {
        return $this->belongsTo(Customer::class, 'customer_id', 'customer_id');
    }

    public function sale()
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