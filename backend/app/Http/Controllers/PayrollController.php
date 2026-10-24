<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Payroll;
use App\Models\PayrollPeriod;
use App\Models\PayrollDeduction;
use App\Models\Employee;
use App\Models\EmployeeAllowance;
use App\Models\EmployeeBonus;
use App\Models\EmployeeDeduction;
use App\Models\EmployeeLoan;
use App\Models\Attendance;
use App\Models\SystemLog;
use Illuminate\Support\Facades\DB;
use App\Services\NotificationService;
use App\Services\AttendanceSchedule;
use Illuminate\Support\Facades\Cache;

class PayrollController extends Controller
{
    /**
     * List payroll records with role-based scoping and filters.
     */
    public function index(Request $request)
    {
        $user = $request->user();

        // 1-2s Performance Cache: bypass if exporting CSV
        if (!$request->boolean('export_csv')) {
            $fp = SyncController::computeFingerprint();
            $cacheKey = 'pace_payr_idx_' . md5(json_encode([
                'u' => $user ? $user->user_id : 0,
                'r' => $user ? $user->role : '',
                'b' => $request->query('branch', ''),
                'bid' => $request->query('branch_id', ''),
                'p' => $request->query('period_id', ''),
                's' => $request->query('status', ''),
                'df' => $request->query('from_date', ''),
                'dt' => $request->query('to_date', ''),
            ])) . '_' . $fp;

            $cached = Cache::get($cacheKey);
            if ($cached !== null) {
                return response()->json($cached);
            }
        }

        $query = Payroll::with(['employee.branch', 'period', 'deductions', 'approvedBy.employee'])
            ->whereHas('employee', function ($eq) {
                $eq->payrollEligible();
            });

        // Role-based Access Control
        if ($user && $user->role === 'Employee') {
            $query->where('employee_id', $user->employee_id);
        } elseif ($user && in_array($user->role, ['Store Administrator', 'Store Admin'])) {
            $branchId = $user->employee ? $user->employee->branch_id : null;
            $branchName = $user->employee ? ($user->employee->branch_name ?? $user->employee->branch) : null;
            $query->whereHas('employee', function ($eq) use ($branchId, $branchName) {
                $eq->where(function ($sub) use ($branchId, $branchName) {
                    if ($branchId) $sub->where('branch_id', $branchId);
                    if ($branchName) {
                        $sub->orWhere('branch', $branchName)
                            ->orWhereHas('branchProfile', fn($bq) => $bq->where('name', $branchName));
                    }
                });
            });
        } elseif ($request->filled('branch') && $request->query('branch') !== 'All' && $request->query('branch') !== 'all') {
            $branch = $request->query('branch');
            $query->whereHas('employee', function ($eq) use ($branch) {
                if (is_numeric($branch)) {
                    $eq->where('branch_id', $branch);
                } else {
                    $eq->where(function ($sub) use ($branch) {
                        $sub->where('branch', $branch)
                            ->orWhereHas('branchProfile', fn($bq) => $bq->where('name', $branch));
                    });
                }
            });
        } elseif ($request->filled('branch_id') && $request->query('branch_id') !== 'All' && $request->query('branch_id') !== 'all') {
            $branchId = $request->query('branch_id');
            $query->whereHas('employee', function ($eq) use ($branchId) {
                $eq->where('branch_id', $branchId);
            });
        }

        // Additional Filters
        if ($request->filled('period_id') && $request->query('period_id') !== 'All') {
            $query->where('period_id', $request->query('period_id'));
        } elseif ($request->filled('period_name') && $request->query('period_name') !== 'All') {
            $pName = $request->query('period_name');
            $query->whereHas('period', function ($pq) use ($pName) {
                $pq->where('period_name', $pName);
            });
        }

        if ($request->filled('employee_id')) {
            $query->where('employee_id', $request->query('employee_id'));
        }

        if ($request->filled('status') && $request->query('status') !== 'All') {
            $query->where('status', $request->query('status'));
        }

        if ($request->filled('from_date')) {
            $query->whereHas('period', function ($q) use ($request) {
                $q->where('start_date', '>=', $request->from_date)
                  ->orWhere('end_date', '>=', $request->from_date);
            });
        }

        if ($request->filled('to_date')) {
            $query->whereHas('period', function ($q) use ($request) {
                $q->where('start_date', '<=', $request->to_date)
                  ->orWhere('end_date', '<=', $request->to_date);
            });
        }

        if ($request->filled('department') && $request->query('department') !== 'All') {
            $dept = $request->query('department');
            $query->whereHas('employee', function ($eq) use ($dept) {
                $eq->where('department', $dept);
            });
        }

        $records = $query->orderByDesc('payroll_id')->get()->map(function ($p) {
            $emp = $p->employee;
            $approver = $p->approvedBy;
            $approverName = $approver ? ($approver->employee ? "{$approver->employee->first_name} {$approver->employee->last_name}" : $approver->username) : '';

            return [
                'payroll_id' => $p->payroll_id,
                'period_id' => $p->period_id,
                'period_name' => $p->period ? $p->period->period_name : "Period #{$p->period_id}",
                'period_dates' => $p->period ? "{$p->period->start_date} to {$p->period->end_date}" : '',
                'pay_date' => $p->period ? $p->period->pay_date : null,
                'employee_id' => $p->employee_id,
                'employee_name' => $emp ? "{$emp->first_name} {$emp->last_name}" : 'Employee',
                'employee_code' => $emp ? $emp->employee_code : '',
                'position' => $emp ? $emp->position : '',
                'department' => $emp ? $emp->department : '',
                'branch' => $emp ? ($emp->branch_name ?? (is_object($emp->branch) ? $emp->branch->name : ((string)$emp->branch ?: ''))) : '',
                'branch_id' => $emp ? $emp->branch_id : null,
                'basic_salary' => (float)$p->basic_salary,
                'regular_hours' => (float)$p->regular_hours,
                'overtime_hours' => (float)$p->overtime_hours,
                'overtime_pay' => (float)$p->overtime_pay,
                'allowance' => (float)$p->allowance,
                'gross_pay' => (float)$p->gross_pay,
                'total_deductions' => (float)$p->total_deductions,
                'net_pay' => (float)$p->net_pay,
                'status' => $p->status,
                'approved_by' => $approverName,
                'notes' => $p->notes,
            ];
        });

        $periods = PayrollPeriod::orderByDesc('period_id')->get();

        // Calculate eligible employees and check for any missing from this period
        $eligibleQuery = Employee::payrollEligible()->with('branchProfile');
        if ($user && in_array($user->role, ['Store Administrator', 'Store Admin'])) {
            $branchId = $user->employee ? $user->employee->branch_id : null;
            $branchName = $user->employee ? ($user->employee->branch_name ?? $user->employee->branch) : null;
            if ($branchId || $branchName) {
                $eligibleQuery->where(function ($sub) use ($branchId, $branchName) {
                    if ($branchId) $sub->where('branch_id', $branchId);
                    if ($branchName) {
                        $sub->orWhere('branch', $branchName)
                            ->orWhereHas('branchProfile', fn($bq) => $bq->where('name', $branchName));
                    }
                });
            }
        } elseif ($request->filled('branch') && $request->query('branch') !== 'All' && $request->query('branch') !== 'all') {
            $branch = $request->query('branch');
            $eligibleQuery->where(function ($eq) use ($branch) {
                if (is_numeric($branch)) {
                    $eq->where('branch_id', $branch);
                } else {
                    $eq->where(function ($sub) use ($branch) {
                        $sub->where('branch', $branch)
                            ->orWhereHas('branchProfile', fn($bq) => $bq->where('name', $branch));
                    });
                }
            });
        } elseif ($request->filled('branch_id') && $request->query('branch_id') !== 'All' && $request->query('branch_id') !== 'all') {
            $eligibleQuery->where('branch_id', $request->query('branch_id'));
        }

        $allEligible = $eligibleQuery->get(['employee_id', 'employee_code', 'first_name', 'last_name', 'position', 'branch_id', 'branch']);
        $totalEligibleCount = $allEligible->count();

        // Identify eligible employees who don't have a payroll generated for this period yet
        $targetPeriodId = $request->query('period_id');
        $unprocessedEmployees = [];
        if ($targetPeriodId && $targetPeriodId !== 'All') {
            $existingEmpIds = Payroll::where('period_id', $targetPeriodId)
                ->pluck('employee_id')
                ->all();

            $unprocessedEmployees = $allEligible->whereNotIn('employee_id', $existingEmpIds)->values()->map(function ($e) {
                return [
                    'employee_id' => $e->employee_id,
                    'employee_code' => $e->employee_code,
                    'employee_name' => "{$e->first_name} {$e->last_name}",
                    'position' => $e->position,
                    'branch' => $e->branch_name ?: ((string)$e->branch ?: 'Unassigned'),
                ];
            })->all();
        }

        $res = [
            'payroll' => $records,
            'periods' => $periods,
            'total' => $records->count(),
            'eligible_count' => $totalEligibleCount,
            'unprocessed_count' => count($unprocessedEmployees),
            'unprocessed_employees' => $unprocessedEmployees,
        ];

        if (isset($cacheKey)) {
            Cache::put($cacheKey, $res, 2);
        }

        return response()->json($res);
    }

    /**
     * Get active payroll-eligible employees corresponding strictly to active staff users.
     *
     * @param Request $request
     * @return \Illuminate\Http\JsonResponse
     */
    public function eligibleEmployees(Request $request)
    {
        $user = $request->user();
        $query = Employee::payrollEligible()->with(['branchProfile', 'user']);

        // Role-based Access Control
        if ($user && in_array($user->role, ['Store Administrator', 'Store Admin'])) {
            $branchId = $user->employee ? $user->employee->branch_id : null;
            $branchName = $user->employee ? ($user->employee->branch_name ?? $user->employee->branch) : null;
            if ($branchId || $branchName) {
                $query->where(function ($sub) use ($branchId, $branchName) {
                    if ($branchId) $sub->where('branch_id', $branchId);
                    if ($branchName) {
                        $sub->orWhere('branch', $branchName)
                            ->orWhereHas('branchProfile', fn($bq) => $bq->where('name', $branchName));
                    }
                });
            }
        } elseif ($request->filled('branch') && $request->query('branch') !== 'All' && $request->query('branch') !== 'all') {
            $branch = $request->query('branch');
            $query->where(function ($eq) use ($branch) {
                if (is_numeric($branch)) {
                    $eq->where('branch_id', $branch);
                } else {
                    $eq->where(function ($sub) use ($branch) {
                        $sub->where('branch', $branch)
                            ->orWhereHas('branchProfile', fn($bq) => $bq->where('name', $branch));
                    });
                }
            });
        } elseif ($request->filled('branch_id') && $request->query('branch_id') !== 'All' && $request->query('branch_id') !== 'all') {
            $query->where('branch_id', $request->query('branch_id'));
        }

        if ($request->filled('search')) {
            $s = $request->query('search');
            $query->where(function ($q) use ($s) {
                $q->where('first_name', 'like', "%{$s}%")
                  ->orWhere('last_name', 'like', "%{$s}%")
                  ->orWhere('employee_code', 'like', "%{$s}%")
                  ->orWhereHas('user', function ($uq) use ($s) {
                      $uq->where('username', 'like', "%{$s}%")
                         ->orWhere('email', 'like', "%{$s}%");
                  });
            });
        }

        $employees = $query->orderBy('first_name')->get()->map(function ($emp) {
            $u = $emp->user;
            return [
                'employee_id'   => $emp->employee_id,
                'employee_code' => $emp->employee_code ?: ('EMP-' . str_pad($emp->employee_id, 3, '0', STR_PAD_LEFT)),
                'first_name'    => $emp->first_name,
                'last_name'     => $emp->last_name,
                'full_name'     => "{$emp->first_name} {$emp->last_name}",
                'username'      => $u ? $u->username : null,
                'email'         => $emp->email ?: ($u ? $u->email : null),
                'role'          => $u ? $u->role : ($emp->position ?: 'Employee'),
                'position'      => $emp->position ?: ($u ? $u->role : 'Staff'),
                'department'    => $emp->department ?: 'Sales & Operations',
                'branch_id'     => $emp->branch_id,
                'branch_name'   => $emp->branch_name ?: ($emp->branch ? (is_object($emp->branch) ? $emp->branch->name : (string)$emp->branch) : 'Unassigned'),
                'basic_salary'  => (float)$emp->basic_salary,
                'daily_rate'    => (float)$emp->daily_rate,
                'hourly_rate'   => (float)$emp->hourly_rate,
                'pay_type'      => $emp->pay_type ?: 'Cash',
                'status'        => $emp->status,
                'user_id'       => $u ? $u->user_id : null,
            ];
        });

        return response()->json([
            'success'   => true,
            'count'     => $employees->count(),
            'employees' => $employees,
        ]);
    }

    /**
     * Show single payslip with strict security checks.
     *
     * @param Request $request
     * @param int|string $id
     * @return \Illuminate\Http\JsonResponse
     */
    public function show(Request $request, int|string $id)
    {
        $user = $request->user();
        $payroll = Payroll::with(['employee.branch', 'period', 'deductions', 'approvedBy.employee'])->findOrFail($id);

        // Security check
        if ($user && $user->role === 'Employee' && $payroll->employee_id != $user->employee_id) {
            return response()->json(['message' => 'Unauthorized access to payslip.'], 403);
        }

        if ($user && in_array($user->role, ['Store Administrator', 'Store Admin'])) {
            $userBranch = $user->employee ? $user->employee->branch_id : null;
            $empBranch = $payroll->employee ? $payroll->employee->branch_id : '';
            if ($userBranch && $empBranch && (int)$userBranch !== (int)$empBranch) {
                return response()->json(['message' => 'Unauthorized access to employee payslip outside your branch.'], 403);
            }
        }

        return response()->json([
            'record' => $this->formatPayslipRecord($payroll),
        ]);
    }

    /**
     * Dedicated personal payroll records for logged-in employee.
     */
    public function mePayroll(Request $request)
    {
        $user = $request->user();
        if (!$user || !$user->employee_id) {
            return response()->json(['payroll' => [], 'total' => 0, 'summary' => null]);
        }

        $query = Payroll::with(['employee.branch', 'period', 'deductions', 'approvedBy.employee'])
            ->where('employee_id', $user->employee_id);

        if ($request->filled('period_id')) {
            $query->where('period_id', $request->period_id);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('from_date')) {
            $query->whereHas('period', function ($q) use ($request) {
                $q->where('start_date', '>=', $request->from_date)
                  ->orWhere('end_date', '>=', $request->from_date);
            });
        }

        if ($request->filled('to_date')) {
            $query->whereHas('period', function ($q) use ($request) {
                $q->where('start_date', '<=', $request->to_date)
                  ->orWhere('end_date', '<=', $request->to_date);
            });
        }

        $records = $query->orderByDesc('payroll_id')
            ->get()
            ->map(function ($p) {
                return [
                    'payroll_id' => $p->payroll_id,
                    'period_id' => $p->period_id,
                    'employee_name' => $p->employee ? $p->employee->first_name . ' ' . $p->employee->last_name : 'Employee',
                    'employee_code' => $p->employee ? $p->employee->employee_code : 'EMP-000',
                    'department' => $p->employee ? $p->employee->department : '',
                    'position' => $p->employee ? $p->employee->position : '',
                    'period_name' => $p->period ? $p->period->period_name : "Period #{$p->period_id}",
                    'period_dates' => $p->period ? "{$p->period->start_date} to {$p->period->end_date}" : '',
                    'pay_date' => $p->period ? $p->period->pay_date : null,
                    'basic_salary' => (float)$p->basic_salary,
                    'regular_hours' => (float)$p->regular_hours,
                    'overtime_hours' => (float)$p->overtime_hours,
                    'overtime_pay' => (float)$p->overtime_pay,
                    'allowance' => (float)$p->allowance,
                    'gross_pay' => (float)$p->gross_pay,
                    'total_deductions' => (float)$p->total_deductions,
                    'net_pay' => (float)$p->net_pay,
                    'status' => $p->status,
                    'notes' => $p->notes,
                ];
            });

        $latest = $records->first();

        return response()->json([
            'payroll' => $records,
            'total' => $records->count(),
            'latest' => $latest,
        ]);
    }

    /**
     * Fetch a specific payslip for the logged-in employee (Security: verifies ownership).
     *
     * @param Request $request
     * @param int|string $id
     * @return \Illuminate\Http\JsonResponse
     */
    public function mePayslip(Request $request, int|string $id)
    {
        $user = $request->user();
        if (!$user || !$user->employee_id) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $payroll = Payroll::with(['employee.branch', 'period', 'deductions', 'approvedBy.employee'])
            ->where('employee_id', $user->employee_id)
            ->where('payroll_id', $id)
            ->first();

        if (!$payroll) {
            return response()->json(['message' => 'Payslip not found or unauthorized access'], 404);
        }

        return response()->json([
            'record' => $this->formatPayslipRecord($payroll),
        ]);
    }

    /**
     * Format a Payroll model into a complete, standardized payslip payload.
     */
    private function formatPayslipRecord(Payroll $payroll): array
    {
        $emp = $payroll->employee;
        $approver = $payroll->approvedBy;
        $approverName = $approver
            ? ($approver->employee ? "{$approver->employee->first_name} {$approver->employee->last_name}" : $approver->username)
            : 'System';

        $deductions = $payroll->deductions->map(function ($d) {
            $desc = !empty($d->notes) ? $d->notes : "{$d->deduction_type} Contribution";
            return [
                'deduction_id' => $d->deduction_id,
                'payroll_id' => $d->payroll_id,
                'deduction_type' => $d->deduction_type,
                'description' => $desc,
                'amount' => (float)$d->amount,
            ];
        });

        $monthlyRate = $emp && (float)$emp->basic_salary > 0 ? (float)$emp->basic_salary : 0;
        $dailyRate = $emp && (float)$emp->daily_rate > 0 ? (float)$emp->daily_rate : ($monthlyRate > 0 ? round($monthlyRate / 26, 2) : 0);
        $hourlyRate = $emp && (float)$emp->hourly_rate > 0 ? (float)$emp->hourly_rate : ($dailyRate > 0 ? round($dailyRate / 8, 2) : 0);

        return [
            'payroll_id' => $payroll->payroll_id,
            'period_id' => $payroll->period_id,
            'period_name' => $payroll->period ? $payroll->period->period_name : "Period #{$payroll->period_id}",
            'period_dates' => $payroll->period ? "{$payroll->period->start_date} to {$payroll->period->end_date}" : '',
            'pay_date' => $payroll->period ? ($payroll->period->pay_date ?: $payroll->period->end_date) : null,
            'employee_id' => $emp ? $emp->employee_id : $payroll->employee_id,
            'employee_code' => $emp ? $emp->employee_code : 'EMP-000',
            'employee_name' => $emp ? "{$emp->first_name} {$emp->last_name}" : 'Employee',
            'department' => $emp ? ($emp->department ?: 'General') : 'General',
            'position' => $emp ? ($emp->position ?: 'Staff') : 'Staff',
            'branch' => $emp ? ($emp->branch_name ?? (is_object($emp->branch) ? $emp->branch->name : ((string)$emp->branch ?: null))) : null,
            'pay_type' => $emp ? ($emp->pay_type ?: 'Cash') : 'Cash',
            'monthly_rate' => $monthlyRate,
            'daily_rate' => $dailyRate,
            'hourly_rate' => $hourlyRate,
            'basic_salary' => (float)$payroll->basic_salary,
            'regular_hours' => (float)$payroll->regular_hours,
            'overtime_hours' => (float)$payroll->overtime_hours,
            'overtime_pay' => (float)$payroll->overtime_pay,
            'allowance' => (float)$payroll->allowance,
            'gross_pay' => (float)$payroll->gross_pay,
            'total_deductions' => (float)$payroll->total_deductions,
            'net_pay' => (float)$payroll->net_pay,
            'status' => $payroll->status,
            'approved_by' => $approverName,
            'notes' => $payroll->notes,
            'deductions' => $deductions,
        ];
    }

    /**
     * Resolve or initialize realistic Monthly, Daily, and Hourly rates for an employee.
     * Standard Philippine store workmonth = 26 days (8 hours/day).
     */
    private function resolveEmployeeRates(Employee $emp): array
    {
        $monthlyBasic = (float)$emp->basic_salary;
        $dailyRate = (float)$emp->daily_rate;
        $hourlyRate = (float)$emp->hourly_rate;

        if ($monthlyBasic <= 0 && $dailyRate > 0) {
            $monthlyBasic = round($dailyRate * 26, 2);
        } elseif ($monthlyBasic <= 0 && $hourlyRate > 0) {
            $monthlyBasic = round($hourlyRate * 8 * 26, 2);
        } elseif ($monthlyBasic <= 0) {
            $pos = strtolower((string)$emp->position);
            $monthlyBasic = str_contains($pos, 'store admin') ? 15600.00 : 13000.00;
        }

        if ($dailyRate <= 0) {
            $dailyRate = round($monthlyBasic / 26, 2);
        }
        if ($hourlyRate <= 0) {
            $hourlyRate = round($dailyRate / 8, 2);
        }

        // Persist default rates if missing on employee record so directory and payslips stay consistent
        if ((float)$emp->basic_salary <= 0 || (float)$emp->daily_rate <= 0 || (float)$emp->hourly_rate <= 0) {
            $emp->update([
                'basic_salary' => $monthlyBasic,
                'daily_rate' => $dailyRate,
                'hourly_rate' => $hourlyRate,
            ]);
        }

        return [$monthlyBasic, $dailyRate, $hourlyRate];
    }

    /**
     * Generate payroll for open period by calculating actual attendance records.
     * Enforces "No Work, No Pay" (attendance-based earnings, tardiness/undertime deductions,
     * overtime at 125%, statutory contributions, and non-destructive draft loan calculations).
     */
    public function generate(Request $request)
    {
        $user = $request->user();
        $periodId = $request->input('period_id');
        $targetEmployeeId = $request->input('employee_id');
        $recalculate = $request->boolean('recalculate', true) || $request->boolean('force', false);
        $requireAttendance = $request->boolean('require_attendance', true);

        // 1. Resolve or Auto-create Payroll Period
        if ($periodId && $periodId !== 'auto' && $periodId !== 'all') {
            $period = PayrollPeriod::find($periodId);
        } else {
            $period = PayrollPeriod::where('status', 'Open')
                ->where('period_name', 'NOT LIKE', '%13th Month%')
                ->latest('period_id')
                ->first()
                ?: PayrollPeriod::where('period_name', 'NOT LIKE', '%13th Month%')->latest('period_id')->first();
        }

        // Auto-initialize current semi-monthly period if none exists
        if (!$period) {
            $day = (int) date('j');
            $year = date('Y');
            $month = date('m');
            $monthName = date('M');

            if ($day <= 15) {
                $startDate = "{$year}-{$month}-01";
                $endDate = "{$year}-{$month}-15";
                $payDate = "{$year}-{$month}-15";
                $periodName = "{$monthName} 01-15, {$year} (1st Half)";
            } else {
                $lastDay = date('t');
                $startDate = "{$year}-{$month}-16";
                $endDate = "{$year}-{$month}-{$lastDay}";
                $payDate = "{$year}-{$month}-{$lastDay}";
                $periodName = "{$monthName} 16-{$lastDay}, {$year} (2nd Half)";
            }

            $period = PayrollPeriod::create([
                'period_name' => $periodName,
                'start_date'  => $startDate,
                'end_date'    => $endDate,
                'pay_date'    => $payDate,
                'status'      => 'Open',
                'created_by'  => $user ? $user->user_id : null,
            ]);
        }

        // 2. Resolve Active Eligible Employees (Store Administrator and Employee only)
        $empQuery = Employee::payrollEligible();

        // If Store Admin generates, scope to their branch
        if ($user && in_array($user->role, ['Store Administrator', 'Store Admin'])) {
            $branchId = $user->employee ? $user->employee->branch_id : null;
            $branchName = $user->employee ? ($user->employee->branch_name ?? $user->employee->branch) : null;
            if ($branchId || $branchName) {
                $empQuery->where(function ($sub) use ($branchId, $branchName) {
                    if ($branchId) $sub->where('branch_id', $branchId);
                    if ($branchName) {
                        $sub->orWhere('branch', $branchName)
                            ->orWhereHas('branchProfile', fn($bq) => $bq->where('name', $branchName));
                    }
                });
            }
        } elseif ($request->filled('branch') && $request->input('branch') !== 'All' && $request->input('branch') !== 'all') {
            $branch = $request->input('branch');
            $empQuery->where(function ($eq) use ($branch) {
                if (is_numeric($branch)) {
                    $eq->where('branch_id', $branch);
                } else {
                    $eq->where(function ($sub) use ($branch) {
                        $sub->where('branch', $branch)
                            ->orWhereHas('branchProfile', fn($bq) => $bq->where('name', $branch));
                    });
                }
            });
        } elseif ($request->filled('branch_id') && $request->input('branch_id') !== 'All' && $request->input('branch_id') !== 'all') {
            $empQuery->where('branch_id', $request->input('branch_id'));
        }

        // If specific employee target was passed
        if (!empty($targetEmployeeId) && $targetEmployeeId !== 'all') {
            $empQuery->where('employee_id', $targetEmployeeId);
        }

        $activeEmployees = $empQuery->get();

        if ($activeEmployees->isEmpty()) {
            return response()->json([
                'message' => 'No active eligible employees found to generate payroll for.',
                'count' => 0
            ], 422);
        }

        $generatedCount = 0;
        $updatedCount = 0;
        $skippedCount = 0;
        $noAttendanceCount = 0;

        DB::transaction(function () use (
            $activeEmployees,
            $period,
            $user,
            $request,
            $recalculate,
            $requireAttendance,
            &$generatedCount,
            &$updatedCount,
            &$skippedCount,
            &$noAttendanceCount
        ) {
            foreach ($activeEmployees as $emp) {
                // Ensure employee has valid salary rates
                [$monthlyBasic, $dailyRate, $hourlyRate] = $this->resolveEmployeeRates($emp);

                // Check if payroll record already exists for this period
                $existingPayroll = Payroll::where('period_id', $period->period_id)
                    ->where('employee_id', $emp->employee_id)
                    ->first();

                if ($existingPayroll) {
                    // Do not overwrite finalized/approved/paid payroll unless explicitly forced
                    if (in_array($existingPayroll->status, ['Approved', 'Paid']) && !$request->boolean('force', false)) {
                        $skippedCount++;
                        continue;
                    }
                }

                // 1. Retrieve Employee Attendance Records within the period dates
                $attendances = Attendance::where('employee_id', $emp->employee_id)
                    ->whereBetween('attendance_date', [$period->start_date, $period->end_date])
                    ->get();

                $validAttendances = $attendances->filter(function ($a) {
                    return $a->status !== 'Absent' && (!empty($a->time_in) || (float)$a->total_hours > 0);
                });

                // Enforce "No Work, No Pay" if employee has 0 attendance in the period
                if ($validAttendances->isEmpty()) {
                    if ($existingPayroll && $recalculate) {
                        PayrollDeduction::where('payroll_id', $existingPayroll->payroll_id)->delete();
                        $existingPayroll->delete();
                    }
                    if ($requireAttendance) {
                        $noAttendanceCount++;
                        continue;
                    }
                }

                if ($existingPayroll) {
                    if ($recalculate) {
                        PayrollDeduction::where('payroll_id', $existingPayroll->payroll_id)->delete();
                        $existingPayroll->delete();
                        $updatedCount++;
                    } else {
                        $skippedCount++;
                        continue;
                    }
                } else {
                    $generatedCount++;
                }

                // 2. Compute Actual Days Worked, Regular Hours, Overtime Hours, and Late/Undertime Hours
                $daysWorked = 0.0;
                $regularHours = 0.0;
                $overtimeHours = 0.0;
                $lateUndertimeHours = 0.0;

                if ($validAttendances->isEmpty() && !$requireAttendance) {
                    // Fixed semi-monthly fallback only when require_attendance is explicitly disabled
                    $daysWorked = 13.0;
                    $regularHours = 104.0;
                    $overtimeHours = 0.0;
                    $lateUndertimeHours = 0.0;
                } else {
                    foreach ($validAttendances as $att) {
                        $dateStr = $att->attendance_date instanceof \DateTimeInterface
                            ? $att->attendance_date->format('Y-m-d')
                            : substr((string)$att->attendance_date, 0, 10);

                        $isHalfDay = ($att->status === 'Half Day');
                        $daysWorked += $isHalfDay ? 0.5 : 1.0;
                        $scheduledDayHours = $isHalfDay ? 4.0 : 8.0;

                        $dayReg = 0.0;
                        $dayOt = 0.0;

                        if (!empty($att->time_in) && !empty($att->time_out)) {
                            $computed = AttendanceSchedule::computeHours($att);
                            $dayReg = (float)$computed['regular'];
                            $dayOt = (float)$computed['overtime'];

                            if ($dayReg <= 0 && $att->status !== 'Absent') {
                                if ((float)$att->total_hours > 0) {
                                    $dayOt = (float)$att->overtime_hours;
                                    $dayReg = max(0, round((float)$att->total_hours - $dayOt, 2));
                                } else {
                                    $dayReg = ($att->status === 'Late') ? 7.0 : $scheduledDayHours;
                                }
                            }
                        } elseif ((float)$att->total_hours > 0) {
                            $dayOt = (float)$att->overtime_hours;
                            $dayReg = max(0, round((float)$att->total_hours - $dayOt, 2));
                        } else {
                            // Employee has verified TIME_IN, shift still open / no TIME_OUT recorded yet
                            if ($isHalfDay) {
                                $dayReg = 4.0;
                            } elseif ($att->status === 'Present') {
                                $dayReg = 8.0;
                            } else {
                                // Late status
                                $lateMins = AttendanceSchedule::lateMinutes($dateStr, $att->time_in);
                                if ($lateMins > 0 && $lateMins <= 240) {
                                    $dayReg = max(4.0, round(8.0 - ($lateMins / 60), 2));
                                } else {
                                    // Afternoon/evening arrival: credit 7.0h regular with 1.0h tardiness deduction
                                    $dayReg = 7.0;
                                }
                            }
                        }

                        $regularHours += $dayReg;
                        $overtimeHours += $dayOt;
                        $lateUndertimeHours += max(0, round($scheduledDayHours - $dayReg, 2));
                    }
                }

                $regularHours = round($regularHours, 2);
                $overtimeHours = round($overtimeHours, 2);
                $lateUndertimeHours = round($lateUndertimeHours, 2);

                // 3. Compute Base Pay, Late/Undertime Deduction, Overtime Pay, and Allowances
                // Base pay for days attended (capped at semi-monthly base salary for 13+ days)
                $semiMonthlyCap = round($monthlyBasic / 2, 2);
                $periodBasePay = $daysWorked >= 13
                    ? $semiMonthlyCap
                    : round($daysWorked * $dailyRate, 2);

                $lateUndertimeDeduction = round($lateUndertimeHours * $hourlyRate, 2);
                $earnedBasicPay = max(0, round($periodBasePay - $lateUndertimeDeduction, 2));

                // Overtime Pay (125% of hourly rate per Philippine Labor Code)
                $overtimePay = round($overtimeHours * $hourlyRate * 1.25, 2);

                // Active Allowances + Pending Bonuses
                $empAllowances = (float) EmployeeAllowance::where('employee_id', $emp->employee_id)
                    ->where('is_active', true)
                    ->sum('amount');
                $empBonuses = (float) EmployeeBonus::where('employee_id', $emp->employee_id)
                    ->where('status', 'Pending')
                    ->sum('amount');

                $allowance = round($empAllowances + $empBonuses, 2);
                $gross = round($periodBasePay + $allowance + $overtimePay, 2);

                // 4. Compute Statutory Deductions (based on actual earned basic pay)
                $sss = round($earnedBasicPay * 0.045, 2);
                $philhealth = round($earnedBasicPay * 0.025, 2);
                $pagibig = $earnedBasicPay > 0 ? min(100.00, round($earnedBasicPay * 0.02, 2)) : 0.00;

                // Custom Deductions
                $empDeductions = EmployeeDeduction::where('employee_id', $emp->employee_id)
                    ->where('is_active', true)
                    ->get();
                $customDeductionsSum = (float) $empDeductions->sum('amount');

                // Active Loans (Semi-monthly amortization = monthly_deduction / 2; balance updated only when Paid)
                $empLoans = EmployeeLoan::where('employee_id', $emp->employee_id)
                    ->where('status', 'Active')
                    ->get();
                $loanDeductionsSum = 0.0;
                $loanDeductionsArray = [];

                $availableAfterMandatory = max(0, $gross - ($lateUndertimeDeduction + $sss + $philhealth + $pagibig + $customDeductionsSum));

                foreach ($empLoans as $loan) {
                    $remaining = max(0, (float)$loan->total_amount - (float)$loan->amount_paid);
                    $semiMonthlyAmort = round((float)$loan->monthly_deduction / 2, 2);
                    if ($semiMonthlyAmort <= 0) {
                        $semiMonthlyAmort = (float)$loan->monthly_deduction;
                    }
                    $deduct = min($semiMonthlyAmort, $remaining, $availableAfterMandatory - $loanDeductionsSum);
                    $deduct = max(0, round($deduct, 2));

                    if ($deduct > 0) {
                        $loanDeductionsSum += $deduct;
                        $loanDeductionsArray[] = [
                            'loan' => $loan,
                            'amount' => $deduct
                        ];
                    }
                }

                $totalDeds = round(
                    $lateUndertimeDeduction + $sss + $philhealth + $pagibig + $customDeductionsSum + $loanDeductionsSum,
                    2
                );
                $net = max(0, round($gross - $totalDeds, 2));

                // 5. Create Payroll Entry
                $payroll = Payroll::create([
                    'period_id' => $period->period_id,
                    'employee_id' => $emp->employee_id,
                    'basic_salary' => $periodBasePay,
                    'regular_hours' => $regularHours,
                    'overtime_hours' => $overtimeHours,
                    'overtime_pay' => $overtimePay,
                    'allowance' => $allowance,
                    'gross_pay' => $gross,
                    'total_deductions' => $totalDeds,
                    'net_pay' => $net,
                    'status' => 'Draft',
                    'generated_by' => $user ? $user->user_id : null,
                    'generated_at' => now(),
                    'notes' => "Days worked: {$daysWorked}d | Regular: {$regularHours}h | Late/UT: {$lateUndertimeHours}h",
                ]);

                // 6. Record Itemized Deductions
                if ($lateUndertimeDeduction > 0) {
                    PayrollDeduction::create([
                        'payroll_id' => $payroll->payroll_id,
                        'deduction_type' => 'Late / Undertime',
                        'amount' => $lateUndertimeDeduction,
                        'notes' => "Late / Undertime ({$lateUndertimeHours}h)",
                    ]);
                }

                if ($sss > 0) {
                    PayrollDeduction::create([
                        'payroll_id' => $payroll->payroll_id,
                        'deduction_type' => 'SSS',
                        'amount' => $sss,
                        'notes' => 'SSS Contribution (4.5%)',
                    ]);
                }

                if ($philhealth > 0) {
                    PayrollDeduction::create([
                        'payroll_id' => $payroll->payroll_id,
                        'deduction_type' => 'PhilHealth',
                        'amount' => $philhealth,
                        'notes' => 'PhilHealth Contribution (2.5%)',
                    ]);
                }

                if ($pagibig > 0) {
                    PayrollDeduction::create([
                        'payroll_id' => $payroll->payroll_id,
                        'deduction_type' => 'Pag-IBIG',
                        'amount' => $pagibig,
                        'notes' => 'Pag-IBIG Contribution (2%)',
                    ]);
                }

                foreach ($empDeductions as $ded) {
                    if ((float)$ded->amount > 0) {
                        PayrollDeduction::create([
                            'payroll_id' => $payroll->payroll_id,
                            'deduction_type' => 'Custom',
                            'amount' => $ded->amount,
                            'notes' => $ded->name,
                        ]);
                    }
                }

                foreach ($loanDeductionsArray as $ld) {
                    $loan = $ld['loan'];
                    $amt = $ld['amount'];
                    PayrollDeduction::create([
                        'payroll_id' => $payroll->payroll_id,
                        'deduction_type' => 'Loan',
                        'amount' => $amt,
                        'notes' => "{$loan->name} (Loan #{$loan->id})",
                    ]);
                }
            }

            $totalProcessed = $generatedCount + $updatedCount;

            if ($totalProcessed > 0) {
                SystemLog::create([
                    'user_id' => $user ? $user->user_id : null,
                    'action' => 'GENERATE',
                    'module' => 'Payroll',
                    'description' => "Generated payroll for {$period->period_name} ({$totalProcessed} employees processed, {$noAttendanceCount} skipped with no attendance)",
                    'ip_address' => $request->ip(),
                    'user_agent' => $request->userAgent(),
                ]);
            }
        });

        $totalProcessed = $generatedCount + $updatedCount;

        if ($totalProcessed === 0 && $noAttendanceCount > 0) {
            return response()->json([
                'success' => false,
                'message' => "No payroll generated for {$period->period_name}: {$noAttendanceCount} employee(s) had 0 attendance records in this period (No Work, No Pay).",
                'count' => 0,
                'no_attendance_count' => $noAttendanceCount,
                'period' => $period,
            ], 422);
        }

        // Send real notification to Administrators
        if ($totalProcessed > 0) {
            NotificationService::sendToAdmins([
                'type' => 'payroll_generated',
                'title' => 'Payroll Generated',
                'message' => "Payroll for {$period->period_name} has been processed for {$totalProcessed} employee(s) and awaits approval.",
                'module' => 'Payroll',
                'related_id' => $period->period_id,
                'related_type' => 'App\Models\PayrollPeriod',
                'action_url' => '/payroll',
                'priority' => 'normal',
            ]);
        }

        $skipNote = $noAttendanceCount > 0
            ? " ({$noAttendanceCount} employee(s) with no attendance skipped under No Work, No Pay)"
            : "";

        return response()->json([
            'success' => true,
            'message' => "Payroll successfully generated for {$period->period_name}: {$totalProcessed} employee(s) processed{$skipNote}.",
            'count' => $totalProcessed,
            'generated_count' => $generatedCount,
            'updated_count' => $updatedCount,
            'skipped_count' => $skippedCount,
            'no_attendance_count' => $noAttendanceCount,
            'period' => $period,
            'total_employees' => $activeEmployees->count(),
        ]);
    }

    /**
     * Generate 13th Month Pay using Philippine DOLE standard formula:
     * 13th Month Pay = (Total Basic Salary Earned During the Year) / 12
     */
    public function generate13thMonth(Request $request)
    {
        $user = $request->user();
        $year = date('Y');
        $periodName = "13th Month Pay {$year}";

        // Use a dedicated 13th Month PayrollPeriod so it never collides with regular semi-monthly periods
        $period = PayrollPeriod::firstOrCreate(
            ['period_name' => $periodName],
            [
                'start_date' => "{$year}-01-01",
                'end_date'   => "{$year}-12-31",
                'pay_date'   => "{$year}-12-24",
                'status'     => 'Open',
                'created_by' => $user ? $user->user_id : null,
            ]
        );

        $empQuery = Employee::payrollEligible();
        if ($user && in_array($user->role, ['Store Administrator', 'Store Admin'])) {
            $branchId = $user->employee ? $user->employee->branch_id : null;
            $branchName = $user->employee ? ($user->employee->branch_name ?? $user->employee->branch) : null;
            if ($branchId || $branchName) {
                $empQuery->where(function ($sub) use ($branchId, $branchName) {
                    if ($branchId) $sub->where('branch_id', $branchId);
                    if ($branchName) {
                        $sub->orWhere('branch', $branchName)
                            ->orWhereHas('branchProfile', fn($bq) => $bq->where('name', $branchName));
                    }
                });
            }
        } elseif ($request->filled('branch') && $request->input('branch') !== 'All' && $request->input('branch') !== 'all') {
            $branch = $request->input('branch');
            $empQuery->where(function ($eq) use ($branch) {
                if (is_numeric($branch)) {
                    $eq->where('branch_id', $branch);
                } else {
                    $eq->where(function ($sub) use ($branch) {
                        $sub->where('branch', $branch)
                            ->orWhereHas('branchProfile', fn($bq) => $bq->where('name', $branch));
                    });
                }
            });
        } elseif ($request->filled('branch_id') && $request->input('branch_id') !== 'All' && $request->input('branch_id') !== 'all') {
            $empQuery->where('branch_id', $request->input('branch_id'));
        }

        $activeEmployees = $empQuery->get();
        if ($activeEmployees->isEmpty()) {
            return response()->json(['message' => 'No active eligible employees found.'], 422);
        }

        $generatedCount = 0;

        DB::transaction(function () use ($activeEmployees, $period, $year, $user, $request, &$generatedCount) {
            foreach ($activeEmployees as $emp) {
                [$monthlyBasic] = $this->resolveEmployeeRates($emp);

                $existing = Payroll::where('period_id', $period->period_id)
                    ->where('employee_id', $emp->employee_id)
                    ->first();

                if ($existing && in_array($existing->status, ['Approved', 'Paid'])) {
                    continue;
                }
                if ($existing) {
                    PayrollDeduction::where('payroll_id', $existing->payroll_id)->delete();
                    $existing->delete();
                }

                // Sum actual basic salary earned in regular payroll periods during the calendar year
                $regularPayrolls = Payroll::with('deductions')
                    ->where('employee_id', $emp->employee_id)
                    ->where('period_id', '!=', $period->period_id)
                    ->whereHas('period', function ($q) use ($year) {
                        $q->whereYear('start_date', $year);
                    })
                    ->get();

                $totalBasicEarnedInYear = 0.0;
                foreach ($regularPayrolls as $rp) {
                    $lateUtDed = (float) $rp->deductions->where('deduction_type', 'Late / Undertime')->sum('amount');
                    $totalBasicEarnedInYear += max(0, (float)$rp->basic_salary - $lateUtDed);
                }

                if ($totalBasicEarnedInYear > 0) {
                    // DOLE Formula: Total Basic Salary Earned in the Year / 12
                    $thirteenthMonthPay = round($totalBasicEarnedInYear / 12, 2);
                } else {
                    // Fallback: Pro-rated by hire_date in current year
                    $monthsWorked = 12;
                    if (!empty($emp->hire_date)) {
                        $hireCarbon = \Carbon\Carbon::parse($emp->hire_date);
                        if ($hireCarbon->year == (int)$year) {
                            $monthsWorked = max(1, 12 - $hireCarbon->month + 1);
                        } elseif ($hireCarbon->year > (int)$year) {
                            $monthsWorked = 1;
                        }
                    }
                    $thirteenthMonthPay = round(($monthlyBasic * $monthsWorked) / 12, 2);
                }

                Payroll::create([
                    'period_id' => $period->period_id,
                    'employee_id' => $emp->employee_id,
                    'basic_salary' => $thirteenthMonthPay,
                    'regular_hours' => 0,
                    'overtime_hours' => 0,
                    'overtime_pay' => 0,
                    'allowance' => 0,
                    'gross_pay' => $thirteenthMonthPay,
                    'total_deductions' => 0,
                    'net_pay' => $thirteenthMonthPay,
                    'status' => 'Draft',
                    'generated_by' => $user ? $user->user_id : null,
                    'generated_at' => now(),
                    'notes' => "13th Month Pay (DOLE Standard Computation)",
                ]);

                $generatedCount++;
            }

            SystemLog::create([
                'user_id' => $user ? $user->user_id : null,
                'action' => 'GENERATE',
                'module' => 'Payroll',
                'description' => "Generated 13th Month Pay for {$period->period_name} ({$generatedCount} employees processed)",
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ]);
        });

        NotificationService::sendToAdmins([
            'type' => 'payroll_generated',
            'title' => '13th Month Pay Generated',
            'message' => "13th Month Pay ({$period->period_name}) has been generated ({$generatedCount} records processed).",
            'module' => 'Payroll',
            'related_id' => $period->period_id,
            'related_type' => 'App\Models\PayrollPeriod',
            'action_url' => '/payroll',
            'priority' => 'normal',
        ]);

        return response()->json([
            'message' => "13th Month Pay generated successfully for {$period->period_name} ({$generatedCount} employees)",
            'count' => $generatedCount,
            'period' => $period,
        ]);
    }

    /**
     * Approve payroll entry
     *
     * @param Request $request
     * @param int|string $id
     * @return \Illuminate\Http\JsonResponse
     */
    public function approve(Request $request, int|string $id)
    {
        $user = $request->user();
        $payroll = Payroll::with(['employee', 'period'])->findOrFail($id);

        if ($payroll->status === 'Paid') {
            return response()->json(['message' => 'This payroll is already marked as Paid.'], 422);
        }

        $payroll->update([
            'status' => 'Approved',
            'approved_by' => $user ? $user->user_id : null,
            'approved_at' => now(),
        ]);

        $periodName = $payroll->period ? $payroll->period->period_name : 'Payroll Period';

        // Real notification to Employee
        NotificationService::sendToEmployeeUser($payroll->employee_id, [
            'type' => 'payroll_approved',
            'title' => 'Payroll Approved',
            'message' => "Your {$periodName} payroll has been approved.",
            'module' => 'Payroll',
            'related_id' => $payroll->payroll_id,
            'related_type' => 'App\Models\Payroll',
            'action_url' => '/payroll',
            'priority' => 'normal',
        ]);

        return response()->json(['message' => 'Payroll approved successfully', 'payroll' => $payroll]);
    }

    /**
     * Mark payroll as Paid and apply loan/bonus settlements.
     *
     * @param Request $request
     * @param int|string $id
     * @return \Illuminate\Http\JsonResponse
     */
    public function markPaid(Request $request, int|string $id)
    {
        $payroll = Payroll::with(['employee', 'period', 'deductions'])->findOrFail($id);

        if ($payroll->status === 'Paid') {
            return response()->json(['message' => 'Payroll is already marked as Paid.'], 422);
        }

        DB::transaction(function () use ($payroll, $request) {
            $user = $request->user();
            $payroll->update([
                'status' => 'Paid',
                'approved_by' => $payroll->approved_by ?: ($user ? $user->user_id : null),
                'approved_at' => $payroll->approved_at ?: now(),
            ]);

            // Settle Loan Amortizations now that the payroll is actually Paid
            $loanDeductions = $payroll->deductions->where('deduction_type', 'Loan');
            foreach ($loanDeductions as $ld) {
                $loan = null;
                if ($ld->notes && preg_match('/Loan #(\d+)/', $ld->notes, $matches)) {
                    $loan = EmployeeLoan::find((int)$matches[1]);
                }
                if (!$loan) {
                    $cleanName = trim(str_replace(' Deduction', '', (string)$ld->notes));
                    $loan = EmployeeLoan::where('employee_id', $payroll->employee_id)
                        ->where('status', 'Active')
                        ->where('name', $cleanName)
                        ->first();
                }
                if ($loan && $loan->status === 'Active') {
                    $loan->amount_paid = min((float)$loan->total_amount, round((float)$loan->amount_paid + (float)$ld->amount, 2));
                    if ($loan->amount_paid >= (float)$loan->total_amount) {
                        $loan->status = 'Paid';
                    }
                    $loan->save();
                }
            }

            // Mark any Pending bonuses included in this period as Paid
            if ((float)$payroll->allowance > 0) {
                EmployeeBonus::where('employee_id', $payroll->employee_id)
                    ->where('status', 'Pending')
                    ->update(['status' => 'Paid']);
            }
        });

        $periodName = $payroll->period ? $payroll->period->period_name : 'Payroll Period';

        // Real notification to Employee
        NotificationService::sendToEmployeeUser($payroll->employee_id, [
            'type' => 'payroll_released',
            'title' => 'Payroll Released',
            'message' => "Your {$periodName} payroll is now available and marked as Paid.",
            'module' => 'Payroll',
            'related_id' => $payroll->payroll_id,
            'related_type' => 'App\Models\Payroll',
            'action_url' => '/payroll',
            'priority' => 'normal',
        ]);

        return response()->json(['message' => 'Payroll marked as Paid', 'payroll' => $payroll]);
    }

    /**
     * List all payroll periods.
     *
     * @return \Illuminate\Http\JsonResponse
     */
    public function periods()
    {
        $periods = PayrollPeriod::with('createdBy.employee')->orderByDesc('period_id')->get()->map(function ($p) {
            return [
                'period_id' => $p->period_id,
                'period_name' => $p->period_name,
                'start_date' => $p->start_date,
                'end_date' => $p->end_date,
                'pay_date' => $p->pay_date,
                'status' => $p->status,
                'created_by' => $p->createdBy ? ($p->createdBy->employee ? "{$p->createdBy->employee->first_name} {$p->createdBy->employee->last_name}" : $p->createdBy->username) : 'System',
            ];
        });

        return response()->json(['periods' => $periods]);
    }

    public function storePeriod(Request $request)
    {
        $validated = $request->validate([
            'period_name' => 'required|string|max:255',
            'start_date' => 'required|date',
            'end_date' => 'required|date|after_or_equal:start_date',
            'pay_date' => 'nullable|date',
            'status' => 'required|string|in:Open,Closed,Processing',
        ]);

        $user = $request->user();
        $validated['created_by'] = $user ? $user->user_id : null;

        $period = PayrollPeriod::create($validated);

        SystemLog::create([
            'user_id' => $user ? $user->user_id : null,
            'action' => 'CREATE',
            'module' => 'Payroll',
            'description' => "Created new payroll period: {$period->period_name}",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json([
            'message' => 'Payroll period created successfully',
            'period' => $period,
        ], 201);
    }

    /**
     * Close payroll period
     *
     * @param Request $request
     * @param int|string $id
     * @return \Illuminate\Http\JsonResponse
     */
    public function closePeriod(Request $request, int|string $id)
    {
        $period = PayrollPeriod::findOrFail($id);
        $period->update(['status' => 'Closed']);

        return response()->json(['message' => 'Payroll period closed successfully', 'period' => $period]);
    }
}
