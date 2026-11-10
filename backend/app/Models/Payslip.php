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
        'payroll_id',
        'employee_id',
        'code',
        'employee_name',
        'branch',
        'payout_method',
        'weekly_base_pay',
        'total_work_hours',
        'total_absences',
        'total_late',
        'total_undertime',
        'total_deductions',
        'final_take_home_pay',
        'status',
        'actions',
        'absence_deduction',
        'late_deduction',
        'undertime_deduction',
        'pay_period_start',
        'pay_period_end',
        'basic_salary',
        'allowances',
        'deductions',
        'net_pay',
        'proof_of_payment',
    ];

    /**
     * The attributes that should be cast.
     *
     * @var array<string, string>
     */
    protected $casts = [
        'pay_period_start'    => 'date',
        'pay_period_end'      => 'date',
        'weekly_base_pay'     => 'decimal:2',
        'total_work_hours'    => 'decimal:2',
        'total_absences'      => 'decimal:2',
        'total_late'          => 'integer',
        'total_undertime'     => 'decimal:2',
        'total_deductions'    => 'decimal:2',
        'final_take_home_pay' => 'decimal:2',
        'absence_deduction'   => 'decimal:2',
        'late_deduction'      => 'decimal:2',
        'undertime_deduction' => 'decimal:2',
        'basic_salary'        => 'decimal:2',
        'allowances'          => 'decimal:2',
        'deductions'          => 'decimal:2',
        'net_pay'             => 'decimal:2',
    ];

    /**
     * Bootstrap model events (auto-populates employee metadata and calculates net/take-home pay).
     */
    protected static function booted()
    {
        static::saving(function ($payslip) {
            // Auto-populate employee fields if missing
            if ($payslip->employee_id && (empty($payslip->code) || empty($payslip->employee_name) || empty($payslip->branch))) {
                $emp = Employee::with('branchProfile')->find($payslip->employee_id);
                if ($emp) {
                    if (empty($payslip->code)) {
                        $payslip->code = $emp->employee_code ?: ('EMP-' . str_pad((string)$emp->employee_id, 3, '0', STR_PAD_LEFT));
                    }
                    if (empty($payslip->employee_name)) {
                        $payslip->employee_name = trim("{$emp->first_name} {$emp->last_name}");
                    }
                    if (empty($payslip->branch)) {
                        $payslip->branch = $emp->branch_name ?: ($emp->branchProfile ? $emp->branchProfile->name : ((string)$emp->branch ?: 'Unassigned'));
                    }
                    if (empty($payslip->payout_method)) {
                        $payslip->payout_method = $emp->pay_type ?: 'Cash';
                    }
                }
            }

            // Synchronize weekly_base_pay and basic_salary cleanly (preserve exact ₱0.00 when zero-hours/no-work)
            $hasExplicitBase = ($payslip->weekly_base_pay !== null && (float)$payslip->weekly_base_pay > 0)
                || ($payslip->basic_salary !== null && (float)$payslip->basic_salary > 0);
            $base = $hasExplicitBase
                ? (float)($payslip->weekly_base_pay > 0 ? $payslip->weekly_base_pay : $payslip->basic_salary)
                : 0.0;
            if ((float)$payslip->weekly_base_pay <= 0 && $base > 0) {
                $payslip->weekly_base_pay = $base;
            }
            if ((float)$payslip->basic_salary <= 0 && $base > 0) {
                $payslip->basic_salary = $base;
            }

            // Synchronize total_deductions and deductions
            $totalDed = (float)($payslip->total_deductions ?: $payslip->deductions ?: 0);
            if ($totalDed <= 0 && $base > 0) {
                $totalDed = round(
                    (float)($payslip->absence_deduction ?? 0) +
                    (float)($payslip->late_deduction ?? 0) +
                    (float)($payslip->undertime_deduction ?? 0),
                    2
                );
            }
            $payslip->total_deductions = $totalDed;
            $payslip->deductions = $totalDed;

            // Synchronize final_take_home_pay and net_pay (never turn explicit 0 net_pay into non-zero on Zero Hours)
            $allowances = (float)($payslip->allowances ?? 0);
            $isZeroNet = ((float)$payslip->net_pay === 0.0 && $payslip->payroll_id !== null && $base <= 0);
            if ($isZeroNet) {
                $takeHome = 0.0;
            } else {
                $takeHome = (float)($payslip->final_take_home_pay ?: $payslip->net_pay ?: 0);
                if ($takeHome <= 0 && $base > 0 && $totalDed <= 0 && (float)$payslip->net_pay !== 0.0) {
                    $takeHome = max(0, round($base + $allowances - $totalDed, 2));
                }
            }
            $payslip->final_take_home_pay = $takeHome;
            $payslip->net_pay = $takeHome;

            // Compute default actions string based on status
            if (empty($payslip->actions)) {
                $st = strtolower((string)$payslip->status);
                if ($st === 'draft') {
                    $payslip->actions = 'View | Slip | Approve';
                } elseif ($st === 'approved' || $st === 'issued') {
                    $payslip->actions = 'View | Slip | Pay';
                } else {
                    $payslip->actions = !empty($payslip->proof_of_payment) ? 'View | Slip | View Proof' : 'View | Slip';
                }
            }
        });
    }

    /**
     * Synchronize a single Payroll model instance into the payslips table.
     */
    public static function syncFromPayroll(Payroll $p): ?self
    {
        if (!$p->employee_id) {
            return null;
        }

        $p->loadMissing(['employee.branchProfile', 'period', 'deductions']);
        $emp = $p->employee;
        if (!$emp) {
            return null;
        }

        $meta = [];
        if (!empty($p->notes)) {
            $decoded = json_decode($p->notes, true);
            if (is_array($decoded)) {
                $meta = $decoded;
            }
        }

        $absenceDed = (float)$p->deductions->whereIn('deduction_type', [
            'Absence', 'Absences', 'Unexcused Absence', 'Half Day', 'Half-Day Deduction',
            'Excuse Letter', 'Sick Leave', 'Important Matter', 'Maternity Leave', 'Vacation Leave'
        ])->sum('amount');
        if ($absenceDed <= 0 && isset($meta['absence_deduction'])) {
            $absenceDed = (float)$meta['absence_deduction'];
        }
        $absenceDays = (float)($meta['absence_days'] ?? 0);

        $lateDed = (float)$p->deductions->whereIn('deduction_type', [
            'Late Penalty', 'Late / Undertime', 'Tardiness', 'Late'
        ])->sum('amount');
        if ($lateDed <= 0 && isset($meta['late_penalty'])) {
            $lateDed = (float)$meta['late_penalty'];
        }
        $lateMinutes = (int)($meta['late_minutes'] ?? 0);

        $undertimeDed = (float)$p->deductions->where('deduction_type', 'Undertime')->sum('amount');
        if ($undertimeDed <= 0 && isset($meta['undertime_deduction'])) {
            $undertimeDed = (float)$meta['undertime_deduction'];
        }
        $undertimeMinutes = (float)($meta['undertime_minutes'] ?? 0);

        $workHours = (float)($meta['work_hours'] ?? $p->regular_hours ?? 0);
        $paidLeaveDays = (float)($meta['paid_leave_days'] ?? 0);
        $isZeroHours = !empty($meta['zero_hours']) || ((float)$p->basic_salary === 0.0 && $workHours <= 0 && $paidLeaveDays <= 0);

        $weeklyBasePay = $isZeroHours
            ? 0.00
            : (isset($meta['weekly_base_pay']) ? (float)$meta['weekly_base_pay'] : (float)$p->basic_salary);
        $totalDeductions = $isZeroHours ? 0.00 : (float)($p->total_deductions ?? 0);
        $finalTakeHomePay = $isZeroHours ? 0.00 : (float)($p->net_pay ?? max(0, $weeklyBasePay - $totalDeductions));
        if ($isZeroHours) {
            $absenceDed = 0.00;
            $lateDed = 0.00;
            $lateMinutes = 0;
            $undertimeDed = 0.00;
            $undertimeMinutes = 0.0;
        }

        $branchName = $emp->branch_name
            ?: ($emp->branchProfile ? $emp->branchProfile->name : ((string)$emp->branch ?: 'Unassigned'));

        $rawMethod = $p->payout_method ?: ($emp->pay_type ?: 'Cash');
        if ($rawMethod === 'E-Wallet' && !empty($emp->ewallet_provider)) {
            $payoutDisplay = "E-Wallet ({$emp->ewallet_provider})";
        } elseif ($rawMethod === 'Online Bank' && !empty($emp->bank_name)) {
            $payoutDisplay = "Bank ({$emp->bank_name})";
        } else {
            $payoutDisplay = $rawMethod;
        }

        $status = ucfirst(strtolower($p->status ?: 'Draft'));
        $stLower = strtolower($status);
        if ($stLower === 'draft') {
            $actions = 'View | Slip | Approve';
        } elseif ($stLower === 'approved') {
            $actions = 'View | Slip | Pay';
        } else {
            $actions = !empty($p->proof_of_payment) ? 'View | Slip | View Proof' : 'View | Slip';
        }

        return self::updateOrCreate(
            ['payroll_id' => $p->payroll_id],
            [
                'employee_id'         => $p->employee_id,
                'code'                => $emp->employee_code ?: ('EMP-' . str_pad((string)$emp->employee_id, 3, '0', STR_PAD_LEFT)),
                'employee_name'       => trim("{$emp->first_name} {$emp->last_name}"),
                'branch'              => $branchName,
                'payout_method'       => $payoutDisplay,
                'weekly_base_pay'     => $weeklyBasePay,
                'total_work_hours'    => $workHours,
                'total_absences'      => $absenceDays,
                'total_late'          => $lateMinutes,
                'total_undertime'     => $undertimeMinutes,
                'total_deductions'    => $totalDeductions,
                'final_take_home_pay' => $finalTakeHomePay,
                'status'              => $status,
                'actions'             => $actions,
                'absence_deduction'   => $absenceDed,
                'late_deduction'      => $lateDed,
                'undertime_deduction' => $undertimeDed,
                'pay_period_start'    => $p->period ? $p->period->start_date : null,
                'pay_period_end'      => $p->period ? $p->period->end_date : null,
                'basic_salary'        => $isZeroHours ? 0.00 : (float)$p->basic_salary,
                'allowances'          => $isZeroHours ? 0.00 : (float)($p->allowance ?? 0),
                'deductions'          => $totalDeductions,
                'net_pay'             => $finalTakeHomePay,
                'proof_of_payment'    => $p->proof_of_payment,
            ]
        );
    }

    /**
     * Synchronize all existing Payroll records into the payslips table.
     */
    public static function syncAllFromPayroll(): void
    {
        $payrolls = Payroll::with(['employee.branchProfile', 'period', 'deductions'])->get();
        foreach ($payrolls as $p) {
            self::syncFromPayroll($p);
        }
    }

    /**
     * Get the employee that owns the payslip.
     */
    public function employee()
    {
        return $this->belongsTo(Employee::class, 'employee_id', 'employee_id');
    }

    /**
     * Get the payroll record associated with the payslip.
     */
    public function payroll()
    {
        return $this->belongsTo(Payroll::class, 'payroll_id', 'payroll_id');
    }

    public function scopeStatus($query, $status)
    {
        return $query->where('status', $status);
    }

    public function scopeForEmployee($query, $employeeId)
    {
        return $query->where('employee_id', $employeeId);
    }
}
