<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class Customer extends Model
{
    protected $primaryKey = 'customer_id';
    protected $table = 'customers';

    protected $fillable = [
        'customer_code', 'first_name', 'middle_name', 'last_name', 
        'phone', 'email', 'address', 'status', 'notes'
    ];

    // Relationships
    public function saleTransactions()
    {
        return $this->hasMany(SaleTransaction::class, 'customer_id', 'customer_id');
    }

    public function installmentAccounts()
    {
        return $this->hasMany(InstallmentAccount::class, 'customer_id', 'customer_id');
    }
}