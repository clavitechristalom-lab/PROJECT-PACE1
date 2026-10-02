<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class PayrollDeduction extends Model
{
    protected $primaryKey = 'deduction_id';
    protected $table = 'payroll_deductions';
    public $timestamps = false; // As per your SQL, this table only has a "created_at" timestamp

    protected $fillable = [
        'payroll_id', 'deduction_type', 'description', 'amount'
    ];

    // Relationships
    public function payroll()
    {
        return $this->belongsTo(Payroll::class, 'payroll_id', 'payroll_id');
    }
}