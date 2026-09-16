<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class EmployeeLoan extends Model
{
    protected $table = 'employee_loans';
    protected $fillable = ['employee_id', 'name', 'total_amount', 'monthly_deduction', 'amount_paid', 'status'];

    protected $casts = [
        'total_amount' => 'decimal:2',
        'monthly_deduction' => 'decimal:2',
        'amount_paid' => 'decimal:2',
    ];

    public function employee()
    {
        return $this->belongsTo(Employee::class, 'employee_id', 'employee_id');
    }
}
