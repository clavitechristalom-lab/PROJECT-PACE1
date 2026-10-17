<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class Customer extends Model
{
    protected $primaryKey = 'customer_id';
    protected $table = 'customers';

    protected $fillable = [
        'customer_code', 'first_name', 'middle_name', 'last_name', 
        'phone', 'email', 'address', 'status', 'notes', 'branch_id', 'branch',
        'gender', 'date_of_birth', 'marital_status',
        'allow_installment', 'installment_allowed_at', 'installment_allowed_by', 'installment_notes'
    ];

    protected $casts = [
        'allow_installment' => 'boolean',
        'installment_allowed_at' => 'datetime',
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

    public function user()
    {
        return $this->hasOne(User::class, 'customer_id', 'customer_id');
    }

    public function branch()
    {
        return $this->belongsTo(BranchProfile::class, 'branch_id', 'id');
    }

    public function branchProfile()
    {
        return $this->belongsTo(BranchProfile::class, 'branch_id', 'id');
    }

    public function getBranchNameAttribute()
    {
        if ($this->relationLoaded('branch') && $this->getRelation('branch') instanceof BranchProfile) {
            return $this->getRelation('branch')->name;
        }
        if ($this->relationLoaded('branchProfile') && $this->getRelation('branchProfile') instanceof BranchProfile) {
            return $this->getRelation('branchProfile')->name;
        }
        if (!empty($this->attributes['branch'])) {
            return (string)$this->attributes['branch'];
        }
        if (!empty($this->branch_id)) {
            $bp = BranchProfile::find($this->branch_id);
            return $bp ? $bp->name : null;
        }
        return null;
    }

    public function installmentAllowedByUser()
    {
        return $this->belongsTo(User::class, 'installment_allowed_by', 'user_id');
    }
}