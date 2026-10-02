<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class PayrollPeriod extends Model
{
    protected $primaryKey = 'period_id';
    protected $table = 'payroll_periods';

    protected $fillable = [
        'period_name', 'start_date', 'end_date', 'pay_date', 
        'status', 'created_by'
    ];

    // Relationships
    public function createdBy()
    {
        return $this->belongsTo(User::class, 'created_by', 'user_id');
    }

    public function payrolls()
    {
        return $this->hasMany(Payroll::class, 'period_id', 'period_id');
    }
}