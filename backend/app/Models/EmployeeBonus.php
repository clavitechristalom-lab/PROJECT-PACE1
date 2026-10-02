<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class EmployeeBonus extends Model
{
    protected $table = 'employee_bonuses';
    protected $fillable = ['employee_id', 'name', 'amount', 'status', 'date_given'];

    protected $casts = [
        'amount' => 'decimal:2',
        'date_given' => 'date',
    ];

    public function employee()
    {
        return $this->belongsTo(Employee::class, 'employee_id', 'employee_id');
    }
}
