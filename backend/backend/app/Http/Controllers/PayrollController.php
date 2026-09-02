<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Payroll;
use App\Models\PayrollPeriod;
use App\Models\PayrollDeduction;
use App\Models\Employee;
use App\Models\Attendance;
use App\Models\SystemLog;
use Illuminate\Support\Facades\DB;
use App\Services\NotificationService;

class PayrollController extends Controller
{
    /**
     * List payroll records with role-based scoping and filters.
     */
    public function index(Request $request)
    {
        $user = $request->user();
        $query = Payroll::with(['employee', 'period', 'deductions', 'approvedBy.employee']);

        // Role-based Access Control
        if ($user && $user->role === 'Employee') {
            $query->where('employee_id', $user->employee_id);
        } elseif ($user && in_array($user->role, ['Store Administrator', 'Store Admin'])) {
            $branch = $user->employee ? $user->employee->branch : 'Main Branch';
            $query->whereHas('employee', function ($eq) use ($branch) {
                $eq->where('branch', $branch);
            });
        } elseif ($request->filled('branch') && $request->query('branch') !== 'All') {
            $branch = $request->query('branch');
            $query->whereHas('employee', function ($eq) use ($branch) {
                $eq->where('branch', $branch);
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
                'employee_id' => $p->employee_id,
                'employee_name' => $emp ? "{$emp->first_name} {$emp->last_name}" : 'Employee',
                'employee_code' => $emp ? $emp->employee_code : '',
                'position' => $emp ? $emp->position : '',
                'department' => $emp ? $emp->department : '',
                'branch' => $emp ? $emp->branch : '',
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
            ];
        });

        $periods = PayrollPeriod::orderByDesc('period_id')->get();

        return response()->json([
            'payroll' => $records,
            'periods' => $periods,
            'total' => $records->count(),
        ]);
    }

    /**
     * Show single payslip with strict security checks.
     */
    public function show(Request $request, $id)
    {
        $user = $request->user();
        $payroll = Payroll::with(['employee', 'period', 'deductions', 'approvedBy.employee'])->findOrFail($id);

        // Security check
        if ($user && $user->role === 'Employee' && $payroll->employee_id != $user->employee_id) {
            return response()->json(['message' => 'Unauthorized access to payslip.'], 403);
        }

        if ($user && in_array($user->role, ['Store Administrator', 'Store Admin'])) {
            $userBranch = $user->employee ? $user->employee->branch : 'Main Branch';
            $empBranch = $payroll->employee ? $payroll->employee->branch : '';
            if ($userBranch !== $empBranch) {
                return response()->json(['message' => 'Unauthorized access to employee payslip outside your branch.'], 403);
            }
        }

        $emp = $payroll->employee;
        $approver = $payroll->approvedBy;
        $approverName = $approver ? ($approver->employee ? "{$approver->employee->first_name} {$approver->employee->last_name}" : $approver->username) : '';

        $deductions = $payroll->deductions->map(function ($d) {
            return [
                'deduction_id' => $d->deduction_id,
                'payroll_id' => $d->payroll_id,
                'deduction_type' => $d->deduction_type,
                'description' => $d->notes ?? "{$d->deduction_type} Contribution",
                'amount' => (float)$d->amount,
            ];
        });

        return response()->json([
            'record' => [
                'payroll_id' => $payroll->payroll_id,
                'period_id' => $payroll->period_id,
                'period_name' => $payroll->period ? $payroll->period->period_name : "Period #{$payroll->period_id}",
                'period_dates' => $payroll->period ? "{$payroll->period->start_date} to {$payroll->period->end_date}" : '',
                'employee_id' => $payroll->employee_id,
                'employee_name' => $emp ? "{$emp->first_name} {$emp->last_name}" : 'Employee',
                'employee_code' => $emp ? $emp->employee_code : '',
                'position' => $emp ? $emp->position : '',
                'department' => $emp ? $emp->department : '',
                'branch' => $emp ? $emp->branch : '',
                'pay_type' => $emp ? $emp->pay_type : 'Monthly',
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
                'deductions' => $deductions,
            ]
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

        $records = Payroll::with(['period', 'deductions', 'approvedBy.employee'])
            ->where('employee_id', $user->employee_id)
            ->orderByDesc('payroll_id')
            ->get()
            ->map(function ($p) {
                return [
                    'payroll_id' => $p->payroll_id,
                    'period_id' => $p->period_id,
                    'period_name' => $p->period ? $p->period->period_name : "Period #{$p->period_id}",
                    'period_dates' => $p->period ? "{$p->period->start_date} to {$p->period->end_date}" : '',
                    'basic_salary' => (float)$p->basic_salary,
                    'regular_hours' => (float)$p->regular_hours,
                    'overtime_hours' => (float)$p->overtime_hours,
                    'overtime_pay' => (float)$p->overtime_pay,
                    'allowance' => (float)$p->allowance,
                    'gross_pay' => (float)$p->gross_pay,
                    'total_deductions' => (float)$p->total_deductions,
                    'net_pay' => (float)$p->net_pay,
                    'status' => $p->status,
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
     * Generate payroll for open period by calculating actual attendance records.
     */
    public function generate(Request $request)
    {
        $user = $request->user();
        $periodId = $request->input('period_id');

        if ($periodId) {
            $period = PayrollPeriod::find($periodId);
        } else {
            $period = PayrollPeriod::where('status', 'Open')->latest('period_id')->first() ?: PayrollPeriod::latest('period_id')->first();
        }

        if (!$period) {
            return response()->json(['message' => 'No active payroll period found. Please create one first.'], 422);
        }

        $empQuery = Employee::where('status', 'Active');

        // If Store Admin generates, scope to their branch
        if ($user && in_array($user->role, ['Store Administrator', 'Store Admin'])) {
            $branch = $user->employee ? $user->employee->branch : 'Main Branch';
            $empQuery->where('branch', $branch);
        }

        $activeEmployees = $empQuery->get();
        $generatedCount = 0;

        \Illuminate\Support\Facades\DB::transaction(function () use ($activeEmployees, $period, $user, $request, &$generatedCount) {
            foreach ($activeEmployees as $emp) {
                // Check if record already exists for this period
                $existingPayroll = Payroll::where('period_id', $period->period_id)->where('employee_id', $emp->employee_id)->first();
                if ($existingPayroll) continue;

                // 1. Retrieve Employee Attendance Records within the period dates
                $attendances = Attendance::where('employee_id', $emp->employee_id)
                    ->whereBetween('attendance_date', [$period->start_date, $period->end_date])
                    ->get();

                $totalHours = (float)$attendances->sum('total_hours');
                $overtimeHours = (float)$attendances->sum('overtime_hours');
                $regularHours = max(0, round($totalHours - $overtimeHours, 2));

                // Default standard semi-monthly hours (80h) if attendance is not yet logged
                if ($attendances->isEmpty()) {
                    $regularHours = 80.0;
                    $overtimeHours = 0.0;
                }

                // 2. Determine Hourly / Daily / Monthly Rate
                $basicSalary = (float)$emp->basic_salary;
                $hourlyRate = (float)$emp->hourly_rate;
                if ($hourlyRate <= 0 && $basicSalary > 0) {
                    $hourlyRate = round($basicSalary / 160, 2);
                }
                if ($hourlyRate <= 0) $hourlyRate = 100.0;

                // Overtime Pay (125% rate)
                $overtimePay = round($overtimeHours * $hourlyRate * 1.25, 2);

                // 3. Compute Base Pay for Period
                $periodBasePay = round($basicSalary / 2, 2); // Default semi-monthly

                if ($emp->pay_type === 'Daily' && $emp->daily_rate > 0) {
                    $daysWorked = $attendances->whereIn('status', ['Present', 'Late'])->count() ?: 10;
                    $periodBasePay = round($daysWorked * $emp->daily_rate, 2);
                } elseif ($emp->pay_type === 'Hourly' && $hourlyRate > 0) {
                    $periodBasePay = round($regularHours * $hourlyRate, 2);
                }

                $allowance = 1000.00;
                $gross = round($periodBasePay + $allowance + $overtimePay, 2);

                // 4. Compute Standard Statutory Deductions
                $sss = round($periodBasePay * 0.045, 2);
                $philhealth = round($periodBasePay * 0.025, 2);
                $pagibig = 100.00;
                $totalDeds = round($sss + $philhealth + $pagibig, 2);
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
                    'generated_by' => $user ? $user->user_id : 1,
                    'generated_at' => now(),
                ]);

                PayrollDeduction::create([
                    'payroll_id' => $payroll->payroll_id,
                    'deduction_type' => 'SSS',
                    'amount' => $sss,
                    'notes' => 'SSS Contribution',
                ]);
                PayrollDeduction::create([
                    'payroll_id' => $payroll->payroll_id,
                    'deduction_type' => 'PhilHealth',
                    'amount' => $philhealth,
                    'notes' => 'PhilHealth Contribution',
                ]);
                PayrollDeduction::create([
                    'payroll_id' => $payroll->payroll_id,
                    'deduction_type' => 'Pag-IBIG',
                    'amount' => $pagibig,
                    'notes' => 'Pag-IBIG Contribution',
                ]);

                $generatedCount++;
            }

            SystemLog::create([
                'user_id' => $user ? $user->user_id : 1,
                'action' => 'GENERATE',
                'module' => 'Payroll',
                'description' => "Generated payroll for {$period->period_name} ({$generatedCount} employees processed)",
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ]);
        });

        // Send real notification to Administrators
        NotificationService::sendToAdmins([
            'type' => 'payroll_generated',
            'title' => 'Payroll Generated',
            'message' => "Payroll for {$period->period_name} has been generated ({$generatedCount} records processed) and awaits approval.",
            'module' => 'Payroll',
            'related_id' => $period->period_id,
            'related_type' => 'App\Models\PayrollPeriod',
            'action_url' => '/payroll',
            'priority' => 'normal',
        ]);

        return response()->json([
            'message' => "Payroll generated successfully for {$period->period_name}",
            'count' => $generatedCount,
        ]);
    }

    /**
     * Generate 13th Month Pay
     */
    public function generate13thMonth(Request $request)
    {
        $user = $request->user();
        $period = PayrollPeriod::where('status', 'Open')->latest('period_id')->first() ?: PayrollPeriod::latest('period_id')->first();

        if (!$period) {
            return response()->json(['message' => 'No active payroll period found. Please create one first.'], 422);
        }

        $activeEmployees = Employee::where('status', 'Active')->get();
        $generatedCount = 0;

        \Illuminate\Support\Facades\DB::transaction(function () use ($activeEmployees, $period, $user, $request, &$generatedCount) {
            foreach ($activeEmployees as $emp) {
                $thirteenthMonthPay = (float)$emp->basic_salary;
                $gross = $thirteenthMonthPay;
                $net = $gross; // No deductions

                $payroll = Payroll::create([
                    'period_id' => $period->period_id,
                    'employee_id' => $emp->employee_id,
                    'basic_salary' => $thirteenthMonthPay,
                    'regular_hours' => 0,
                    'overtime_hours' => 0,
                    'overtime_pay' => 0,
                    'allowance' => 0,
                    'gross_pay' => $gross,
                    'total_deductions' => 0,
                    'net_pay' => $net,
                    'status' => 'Draft',
                    'generated_by' => $user ? $user->user_id : 1,
                    'generated_at' => now(),
                ]);

                $generatedCount++;
            }

            SystemLog::create([
                'user_id' => $user ? $user->user_id : 1,
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
            'message' => "13th Month Pay for {$period->period_name} has been generated ({$generatedCount} records processed).",
            'module' => 'Payroll',
            'related_id' => $period->period_id,
            'related_type' => 'App\Models\PayrollPeriod',
            'action_url' => '/payroll',
            'priority' => 'normal',
        ]);

        return response()->json([
            'message' => "13th Month Pay generated successfully for {$period->period_name}",
            'count' => $generatedCount,
        ]);
    }

    /**
     * Approve payroll entry
     */
    public function approve(Request $request, $id)
    {
        $user = $request->user();
        $payroll = Payroll::with(['employee', 'period'])->findOrFail($id);
        $payroll->update([
            'status' => 'Approved',
            'approved_by' => $user ? $user->user_id : 1,
            'approved_at' => now(),
        ]);

        $periodName = $payroll->period ? $payroll->period->period_name : 'Payroll Period';

        // Real notification to Employee
        NotificationService::sendToEmployeeUser($payroll->employee_id, [
            'type' => 'payroll_approved',
            'title' => 'Payroll Approved',
            'message' => "Your {$periodName} payroll has been approved by Administrator.",
            'module' => 'Payroll',
            'related_id' => $payroll->payroll_id,
            'related_type' => 'App\Models\Payroll',
            'action_url' => '/payroll',
            'priority' => 'normal',
        ]);

        return response()->json(['message' => 'Payroll approved successfully', 'payroll' => $payroll]);
    }

    /**
     * Mark payroll as Paid
     */
    public function markPaid(Request $request, $id)
    {
        $payroll = Payroll::with(['employee', 'period'])->findOrFail($id);
        $payroll->update([
            'status' => 'Paid',
        ]);

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

    public function periods()
    {
        $periods = PayrollPeriod::with('createdBy')->orderByDesc('period_id')->get()->map(function ($p) {
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
        $validated['created_by'] = $user ? $user->user_id : 1;

        $period = PayrollPeriod::create($validated);

        SystemLog::create([
            'user_id' => $user ? $user->user_id : 1,
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

    public function closePeriod(Request $request, $id)
    {
        $period = PayrollPeriod::findOrFail($id);
        $period->update(['status' => 'Closed']);

        return response()->json(['message' => 'Payroll period closed successfully', 'period' => $period]);
    }
}
