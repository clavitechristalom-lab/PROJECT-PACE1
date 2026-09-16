<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BranchProfile extends Model
{
    protected $fillable = [
        'name',
        'location',
        'manager_id',
        'contact_number',
        'status',
        'color',
        'image_url',
    ];

    public function manager()
    {
        return $this->belongsTo(User::class, 'manager_id', 'user_id');
    }

    public function employees()
    {
        return $this->hasMany(Employee::class, 'branch_id', 'id');
    }

    public function customers()
    {
        return $this->hasMany(Customer::class, 'branch_id', 'id');
    }

    public function sales()
    {
        return $this->hasMany(SaleTransaction::class, 'branch_id', 'id');
    }
}
