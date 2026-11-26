<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class SaleTransaction extends Model
{
    protected $primaryKey = 'sale_id';
    protected $table = 'sale_transactions';

    protected $fillable = [
        'invoice_no', 'customer_id', 'processed_by', 'has_agent', 'agent_id',
        'appliances_agent_contribution', 'furniture_agent_contribution', 'total_agent_contribution',
        'sale_date', 'payment_method', 'subtotal', 'discount_amount', 'total_amount',
        'amount_paid', 'balance_due', 'status', 'notes', 'branch_id'
    ];

    protected $casts = [
        'has_agent' => 'boolean',
        'appliances_agent_contribution' => 'decimal:2',
        'furniture_agent_contribution' => 'decimal:2',
        'total_agent_contribution' => 'decimal:2',
    ];

    public function customer()
    {
        return $this->belongsTo(Customer::class, 'customer_id', 'customer_id');
    }

    public function processedBy()
    {
        return $this->belongsTo(User::class, 'processed_by', 'user_id');
    }

    public function agent()
    {
        return $this->belongsTo(Employee::class, 'agent_id', 'employee_id');
    }

    public function items()
    {
        return $this->hasMany(SaleItem::class, 'sale_id', 'sale_id');
    }

    public function saleItems()
    {
        return $this->hasMany(SaleItem::class, 'sale_id', 'sale_id');
    }

    public function installmentAccount()
    {
        return $this->hasOne(InstallmentAccount::class, 'sale_id', 'sale_id');
    }

    public function branch()
    {
        return $this->belongsTo(BranchProfile::class, 'branch_id', 'id');
    }

    protected static function booted()
    {
        static::saved(function ($sale) {
            try {
                if ($sale->customer_id && \Illuminate\Support\Facades\Schema::hasTable('statements')) {
                    Statement::syncCustomerStatements((int)$sale->customer_id);
                }
            } catch (\Throwable $e) {}
        });
    }
}