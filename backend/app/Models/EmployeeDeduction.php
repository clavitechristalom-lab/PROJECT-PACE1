<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class EmployeeDeduction extends Model
{
    protected $table = 'employee_deductions';
    protected $fillable = ['employee_id', 'name', 'amount', 'is_active'];

    protected $casts = [
        'is_active' => 'boolean',
        'amount' => 'decimal:2',
    ];

    public function employee()
    {
        return $this->belongsTo(Employee::class, 'employee_id', 'employee_id');
    }
}
