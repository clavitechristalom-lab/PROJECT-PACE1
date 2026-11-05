<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Payslip extends Model
{
    use HasFactory;

    protected $table = 'payslips';
    protected $primaryKey = 'id';

    /**
     * The attributes that are mass assignable.
     *
     * @var array<int, string>
     */
    protected $fillable = [
        'employee_id',
        'pay_period_start',
        'pay_period_end',
        'basic_salary',
        'allowances',
        'deductions',
        'net_pay',
        'status',
    ];

    /**
     * The attributes that should be cast.
     *
     * @var array<string, string>
     */
    protected $casts = [
        'pay_period_start' => 'date',
        'pay_period_end'   => 'date',
        'basic_salary'     => 'decimal:2',
        'allowances'       => 'decimal:2',
        'deductions'       => 'decimal:2',
        'net_pay'          => 'decimal:2',
    ];

    /**
     * Bootstrap model events (e.g. auto-calculating net pay before saving).
     */
    protected static function booted()
    {
        static::saving(function ($payslip) {
            // Automatically calculate net_pay if not explicitly provided
            if ($payslip->net_pay === null || $payslip->net_pay === '') {
                $basic = (float)($payslip->basic_salary ?? 0);
                $allowances = (float)($payslip->allowances ?? 0);
                $deductions = (float)($payslip->deductions ?? 0);
                $payslip->net_pay = round($basic + $allowances - $deductions, 2);
            }
        });
    }

    /**
     * Get the employee that owns the payslip.
     */
    public function employee()
    {
        return $this->belongsTo(Employee::class, 'employee_id', 'employee_id');
    }

    /**
     * Scope a query to only include payslips of a given status.
     */
    public function scopeStatus($query, $status)
    {
        return $query->where('status', $status);
    }

    /**
     * Scope a query to filter payslips for a specific employee.
     */
    public function scopeForEmployee($query, $employeeId)
    {
        return $query->where('employee_id', $employeeId);
    }
}

