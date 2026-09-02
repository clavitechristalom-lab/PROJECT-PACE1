<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class SaleTransaction extends Model
{
    protected $primaryKey = 'sale_id';
    protected $table = 'sale_transactions';

    protected $fillable = [
        'invoice_no', 'customer_id', 'processed_by', 'sale_date', 'payment_method',
        'subtotal', 'discount_amount', 'total_amount', 'amount_paid', 'balance_due',
        'status', 'notes'
    ];

    public function customer()
    {
        return $this->belongsTo(Customer::class, 'customer_id', 'customer_id');
    }

    public function processedBy()
    {
        return $this->belongsTo(User::class, 'processed_by', 'user_id');
    }

    public function items()
    {
        return $this->hasMany(SaleItem::class, 'sale_id', 'sale_id');
    }

    public function installmentAccount()
    {
        return $this->hasOne(InstallmentAccount::class, 'sale_id', 'sale_id');
    }
}