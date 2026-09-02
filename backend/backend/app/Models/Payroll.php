<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class Payroll extends Model
{
    protected $primaryKey = 'payroll_id';
    protected $table = 'payroll';

    protected $fillable = [
        'period_id', 'employee_id', 'basic_salary', 'regular_hours', 'overtime_hours',
        'overtime_pay', 'allowance', 'gross_pay', 'total_deductions', 'net_pay',
        'status', 'generated_by', 'approved_by', 'generated_at', 'approved_at', 'notes'
    ];

    public function period()
    {
        return $this->belongsTo(PayrollPeriod::class, 'period_id', 'period_id');
    }

    public function payrollPeriod()
    {
        return $this->belongsTo(PayrollPeriod::class, 'period_id', 'period_id');
    }

    public function employee()
    {
        return $this->belongsTo(Employee::class, 'employee_id', 'employee_id');
    }

    public function generatedBy()
    {
        return $this->belongsTo(User::class, 'generated_by', 'user_id');
    }

    public function approvedBy()
    {
        return $this->belongsTo(User::class, 'approved_by', 'user_id');
    }

    public function deductions()
    {
        return $this->hasMany(PayrollDeduction::class, 'payroll_id', 'payroll_id');
    }
}