<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class PayrollDeduction extends Model
{
    protected $primaryKey = 'deduction_id';
    protected $table = 'payroll_deductions';
    public $timestamps = true;

    protected $fillable = [
        'payroll_id', 'deduction_type', 'amount', 'notes'
    ];

    protected $appends = ['description'];

    public function getDescriptionAttribute()
    {
        return $this->notes ?: "{$this->deduction_type} Contribution";
    }

    // Relationships
    public function payroll()
    {
        return $this->belongsTo(Payroll::class, 'payroll_id', 'payroll_id');
    }

    protected static function booted()
    {
        $syncParent = function ($deduction) {
            try {
                if ($deduction->payroll_id && \Illuminate\Support\Facades\Schema::hasTable('payslips')) {
                    $payroll = Payroll::find($deduction->payroll_id);
                    if ($payroll) {
                        Payslip::syncFromPayroll($payroll);
                    }
                }
            } catch (\Throwable $e) {}
        };

        static::saved($syncParent);
        static::deleted($syncParent);
    }
}
