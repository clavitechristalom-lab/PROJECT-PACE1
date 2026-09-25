<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Employee;
use App\Models\Attendance;
use App\Models\Payroll;
use App\Models\PayrollPeriod;
use App\Models\SaleTransaction;
use App\Models\Product;
use App\Models\InstallmentAccount;
use App\Models\Report;
use Illuminate\Support\Facades\DB;
use App\Services\NotificationService;

class ReportController extends Controller
{
    /**
     * Employee Report: Total, Active, Inactive, by Department, Branch, Position.
     */
    public function employees(Request $request)
    {
        $user = $request->user();
        $query = Employee::query();

        // Role scoping
        if ($user && $user->role === 'Employee') {
            $query->where('employee_id', $user->employee_id);
        } elseif ($user && in_array($user->role, ['Store Administrator', 'Store Admin'])) {
            $branchId = $user->employee ? $user->employee->branch_id : -1;
            $query->where('branch_id', $branchId);
        } elseif ($request->filled('branch_id') && $request->query('branch_id') !== 'All') {
            $query->where('branch_id', $request->query('branch_id'));
        }

        if ($request->filled('department') && $request->query('department') !== 'All') {
            $query->where('department', $request->query('department'));
        }

        if ($request->filled('position') && $request->query('position') !== 'All') {
            $query->where('position', $request->query('position'));
        }

        if ($request->filled('status') && $request->query('status') !== 'All') {
            $query->where('status', $request->query('status'));
        }

        if ($request->filled('search')) {
            $s = $request->query('search');
            $query->where(function ($q) use ($s) {
                $q->where('first_name', 'like', "%{$s}%")
                  ->orWhere('last_name', 'like', "%{$s}%")
                  ->orWhere('employee_code', 'like', "%{$s}%");
            });
        }

        $allEmployees = $query->with('branch')->orderBy('employee_id')->get();

        $totalEmployees = $allEmployees->count();
        $activeEmployees = $allEmployees->where('status', 'Active')->count();
        $inactiveEmployees = $allEmployees->where('status', 'Inactive')->count();
        $verifiedEmployees = $allEmployees->where('account_verified', true)->count();

        // Aggregations
        $byDepartment = $allEmployees->groupBy('department')->map(function ($group, $dept) {
            return ['department' => $dept ?: 'Unassigned', 'count' => $group->count()];
        })->values();

        $byBranch = $allEmployees->groupBy(function($emp) {
            return $emp->branch ? $emp->branch->name : 'Unassigned Branch';
        })->map(function ($group, $branchName) {
            return ['branch' => $branchName, 'count' => $group->count()];
        })->values();

        $byPosition = $allEmployees->groupBy('position')->map(function ($group, $pos) {
            return ['position' => $pos ?: 'General', 'count' => $group->count()];
        })->values();

        $employeesList = $allEmployees->map(function ($emp) {
            return [
                'employee_id' => $emp->employee_id,
                'employee_code' => $emp->employee_code,
                'name' => "{$emp->first_name} {$emp->last_name}",
                'department' => $emp->department,
                'position' => $emp->position,
                'branch' => $emp->branch ? $emp->branch->name : 'Unassigned',
                'pay_type' => $emp->pay_type,
                'basic_salary' => (float)$emp->basic_salary,
                'status' => $emp->status,
                'verified' => (bool)$emp->account_verified,
                'hire_date' => $emp->hire_date,
            ];
        });

        return response()->json([
            'total_employees' => $totalEmployees,
            'active_employees' => $activeEmployees,
            'inactive_employees' => $inactiveEmployees,
            'verified_employees' => $verifiedEmployees,
            'by_department' => $byDepartment,
            'by_branch' => $byBranch,
            'by_position' => $byPosition,
            'employees' => $employeesList,
        ]);
    }

    /**
     * Attendance Report: Present, Absent, Late, Overtime, Undertime with date/branch filters.
     */
    public function attendance(Request $request)
    {
        $user = $request->user();
        $query = Attendance::with('employee');

        // Role scoping
        if ($user && $user->role === 'Employee') {
            $query->where('employee_id', $user->employee_id);
        } elseif ($user && in_array($user->role, ['Store Administrator', 'Store Admin'])) {
            $branch = $user->employee ? $user->employee->branch_id : null;
            $query->whereHas('employee', function ($eq) use ($branch) {
                $eq->where('branch_id', $branch);
            });
        } elseif ($request->filled('branch') && $request->query('branch') !== 'All') {
            $branch = $request->query('branch');
            $query->whereHas('employee', function ($eq) use ($branch) {
                $eq->where('branch_id', $branch);
            });
        }

        if ($request->filled('date_from')) {
            $query->where('attendance_date', '>=', $request->query('date_from'));
        }
        if ($request->filled('date_to')) {
            $query->where('attendance_date', '<=', $request->query('date_to'));
        }
        if ($request->filled('department') && $request->query('department') !== 'All') {
            $dept = $request->query('department');
            $query->whereHas('employee', function ($eq) use ($dept) {
                $eq->where('department', $dept);
            });
        }
        if ($request->filled('status') && $request->query('status') !== 'All') {
            $query->where('status', $request->query('status'));
        }
        if ($request->filled('employee_id')) {
            $query->where('employee_id', $request->query('employee_id'));
        }

        $records = $query->orderByDesc('attendance_date')->get();

        $present = $records->where('status', 'Present')->count();
        $late = $records->where('status', 'Late')->count();
        $absent = $records->where('status', 'Absent')->count();
        $halfDay = $records->where('status', 'Half Day')->count();
        $totalHours = (float)$records->sum('total_hours');
        $totalOT = (float)$records->sum('overtime_hours');

        // Trend aggregation
        $trend = $records->groupBy('attendance_date')->map(function ($dayRecords, $date) {
            return [
                'date' => $date,
                'present' => $dayRecords->where('status', 'Present')->count(),
                'late' => $dayRecords->where('status', 'Late')->count(),
                'absent' => $dayRecords->where('status', 'Absent')->count(),
                'total_hours' => (float)$dayRecords->sum('total_hours'),
            ];
        })->values()->take(14);

        $attendanceList = $records->map(function ($a) {
            $emp = $a->employee;
            $regular = max(0, (float)$a->total_hours - (float)$a->overtime_hours);
            return [
                'attendance_id' => $a->attendance_id,
                'employee_id' => $a->employee_id,
                'employee_name' => $emp ? "{$emp->first_name} {$emp->last_name}" : 'Employee',
                'employee_code' => $emp ? $emp->employee_code : '',
                'department' => $emp ? $emp->department : '',
                'branch' => $emp && $emp->branch ? $emp->branch->name : '',
                'attendance_date' => $a->attendance_date,
                'time_in' => $a->time_in ? date('H:i', strtotime($a->time_in)) : '—',
                'time_out' => $a->time_out ? date('H:i', strtotime($a->time_out)) : '—',
                'regular_hours' => round($regular, 2),
                'overtime_hours' => (float)$a->overtime_hours,
                'total_hours' => (float)$a->total_hours,
                'status' => $a->status,
                'verification_method' => $a->verification_method ?? 'QR + PIN',
            ];
        });

        return response()->json([
            'total_records' => $records->count(),
            'present_count' => $present,
            'late_count' => $late,
            'absent_count' => $absent,
            'half_day_count' => $halfDay,
            'total_hours' => round($totalHours, 2),
            'total_overtime' => round($totalOT, 2),
            'trend' => $trend,
            'attendance' => $attendanceList,
        ]);
    }

    /**
     * Payroll Report: Basic Salary, Overtime, Allowances, Gross, Deductions, Net.
     */
    public function payroll(Request $request)
    {
        $user = $request->user();
        $query = Payroll::with(['employee', 'period', 'deductions']);

        // Role scoping
        if ($user && $user->role === 'Employee') {
            $query->where('employee_id', $user->employee_id);
        } elseif ($user && in_array($user->role, ['Store Administrator', 'Store Admin'])) {
            $branchId = $user->employee ? $user->employee->branch_id : -1;
            $query->whereHas('employee', function ($eq) use ($branchId) {
                $eq->where('branch_id', $branchId);
            });
        } elseif ($request->filled('branch_id') && $request->query('branch_id') !== 'All') {
            $branchId = $request->query('branch_id');
            $query->whereHas('employee', function ($eq) use ($branchId) {
                $eq->where('branch_id', $branchId);
            });
        }

        if ($request->filled('period_id') && $request->query('period_id') !== 'All') {
            $query->where('period_id', $request->query('period_id'));
        }
        if ($request->filled('department') && $request->query('department') !== 'All') {
            $dept = $request->query('department');
            $query->whereHas('employee', function ($eq) use ($dept) {
                $eq->where('department', $dept);
            });
        }
        if ($request->filled('status') && $request->query('status') !== 'All') {
            $query->where('status', $request->query('status'));
        }
        if ($request->filled('employee_id')) {
            $query->where('employee_id', $request->query('employee_id'));
        }

        $payrolls = $query->orderByDesc('payroll_id')->get();

        $totalBasic = (float)$payrolls->sum('basic_salary');
        $totalOvertime = (float)$payrolls->sum('overtime_pay');
        $totalAllowance = (float)$payrolls->sum('allowance');
        $totalGross = (float)$payrolls->sum('gross_pay');
        $totalDeds = (float)$payrolls->sum('total_deductions');
        $totalNet = (float)$payrolls->sum('net_pay');

        $list = $payrolls->map(function ($p) {
            $emp = $p->employee;
            return [
                'payroll_id' => $p->payroll_id,
                'employee_id' => $p->employee_id,
                'employee_name' => $emp ? "{$emp->first_name} {$emp->last_name}" : 'Employee',
                'employee_code' => $emp ? $emp->employee_code : '',
                'department' => $emp ? $emp->department : '',
                'branch' => $emp && $emp->branch ? $emp->branch->name : '',
                'period_name' => $p->period ? $p->period->period_name : "Period #{$p->period_id}",
                'basic_salary' => (float)$p->basic_salary,
                'overtime_pay' => (float)$p->overtime_pay,
                'allowance' => (float)$p->allowance,
                'gross_pay' => (float)$p->gross_pay,
                'total_deductions' => (float)$p->total_deductions,
                'net_pay' => (float)$p->net_pay,
                'status' => $p->status,
            ];
        });

        $periods = PayrollPeriod::orderByDesc('period_id')->get();

        return response()->json([
            'total_records' => $payrolls->count(),
            'total_basic' => round($totalBasic, 2),
            'total_overtime' => round($totalOvertime, 2),
            'total_allowance' => round($totalAllowance, 2),
            'total_gross' => round($totalGross, 2),
            'total_deductions' => round($totalDeds, 2),
            'total_net' => round($totalNet, 2),
            'periods' => $periods,
            'payrolls' => $list,
        ]);
    }

    /**
     * Sales Report
     */
    public function sales(Request $request)
    {
        $dateFrom = $request->query('date_from');
        $dateTo = $request->query('date_to');

        $query = SaleTransaction::with('customer');

        $user = $request->user();
        if ($user && in_array($user->role, ['Store Administrator', 'Store Admin'])) {
            $branchId = $user->employee ? $user->employee->branch_id : -1;
            $query->where('branch_id', $branchId);
        } elseif ($request->filled('branch_id') && $request->query('branch_id') !== 'All') {
            $query->where('branch_id', $request->query('branch_id'));
        }

        if ($dateFrom) {
            $query->whereDate('sale_date', '>=', $dateFrom);
        }
        if ($dateTo) {
            $query->whereDate('sale_date', '<=', $dateTo);
        }

        $sales = $query->orderByDesc('sale_date')->get();

        $totalSales = (float)$sales->sum('total_amount');
        $cashSales = (float)$sales->where('payment_method', 'Cash')->sum('total_amount');
        $installSales = (float)$sales->where('payment_method', 'Installment')->sum('total_amount');
        $avgTransaction = $sales->count() > 0 ? $totalSales / $sales->count() : 0;

        $trend = DB::table('sale_transactions')
            ->selectRaw("DATE_FORMAT(sale_date, '%b') as month, MONTH(sale_date) as month_num, SUM(total_amount) as sales, COUNT(sale_id) as transactions")
            ->groupBy('month', 'month_num')
            ->orderBy('month_num')
            ->get();

        $salesList = $sales->map(function ($s) {
            return [
                'sale_id' => $s->sale_id,
                'invoice_no' => $s->invoice_no,
                'customer_name' => $s->customer ? "{$s->customer->first_name} {$s->customer->last_name}" : 'Walk-in',
                'sale_date' => date('Y-m-d', strtotime($s->sale_date)),
                'payment_method' => $s->payment_method,
                'total_amount' => (float)$s->total_amount,
                'status' => $s->status,
            ];
        });

        return response()->json([
            'total_sales' => $totalSales,
            'cash_sales' => $cashSales,
            'installment_sales' => $installSales,
            'avg_transaction' => $avgTransaction,
            'trend' => $trend,
            'sales' => $salesList,
        ]);
    }

    /**
     * Inventory Valuation Report
     */
    public function inventory()
    {
        $products = Product::all();

        $lowStock = $products->filter(fn($p) => $p->stock_quantity === 1)->count();
        $outOfStock = $products->where('stock_quantity', '<=', 0)->count();
        $totalValue = (float)$products->reduce(fn($carry, $p) => $carry + ($p->unit_price * $p->stock_quantity), 0);

        return response()->json([
            'total_products' => $products->count(),
            'low_stock_count' => $lowStock,
            'out_of_stock_count' => $outOfStock,
            'total_value' => $totalValue,
            'products' => $products,
        ]);
    }

    /**
     * Installments Monitoring Report
     */
    public function installments()
    {
        $accounts = InstallmentAccount::with(['customer', 'payments'])->get();

        $active = $accounts->where('status', 'Active')->count();
        $overdue = $accounts->where('status', 'Overdue')->count();
        $completed = $accounts->where('status', 'Completed')->count();

        $list = $accounts->map(function ($acc) {
            $paid = (float)$acc->payments->sum('amount') + (float)$acc->down_payment;
            $balance = max(0, (float)$acc->total_payable - $paid);

            return [
                'installment_id' => $acc->installment_id,
                'account_no' => $acc->account_no,
                'customer_name' => $acc->customer ? "{$acc->customer->first_name} {$acc->customer->last_name}" : 'Customer',
                'total_payable' => (float)$acc->total_payable,
                'paid' => $paid,
                'balance' => $balance,
                'frequency' => $acc->frequency,
                'status' => $acc->status,
            ];
        });

        $totalBalance = $list->whereIn('status', ['Active', 'Overdue'])->sum('balance');

        return response()->json([
            'active_accounts' => $active,
            'overdue_accounts' => $overdue,
            'completed_accounts' => $completed,
            'total_balance' => $totalBalance,
            'accounts' => $list,
        ]);
    }

    /**
     * Reports CRUD
     */
    public function index(Request $request)
    {
        $user = $request->user();
        $query = Report::with(['branch', 'createdBy.employee', 'reviewedBy.employee']);

        if ($user && in_array($user->role, ['Store Administrator', 'Store Admin'])) {
            $branchId = $user->employee ? $user->employee->branch_id : -1;
            $query->where('branch_id', $branchId);
        } elseif ($request->filled('branch_id') && $request->query('branch_id') !== 'All') {
            $query->where('branch_id', $request->query('branch_id'));
        }

        if ($request->filled('status') && $request->query('status') !== 'All') {
            $query->where('status', $request->query('status'));
        }

        if ($request->filled('report_type') && $request->query('report_type') !== 'All') {
            $query->where('report_type', $request->query('report_type'));
        }

        $reports = $query->orderByDesc('report_id')->get()->map(function ($r) {
            return [
                'report_id' => $r->report_id,
                'report_title' => $r->report_title,
                'report_type' => $r->report_type,
                'branch_id' => $r->branch_id,
                'branch_name' => $r->branch ? $r->branch->name : null,
                'week_start' => $r->week_start ? $r->week_start->format('Y-m-d') : null,
                'week_end' => $r->week_end ? $r->week_end->format('Y-m-d') : null,
                'status' => $r->status,
                'created_by_name' => $r->createdBy ? ($r->createdBy->employee ? "{$r->createdBy->employee->first_name} {$r->createdBy->employee->last_name}" : $r->createdBy->username) : null,
                'created_at' => $r->created_at->format('Y-m-d H:i:s'),
                'submitted_at' => $r->submitted_at ? $r->submitted_at->format('Y-m-d H:i:s') : null,
                'reviewed_by_name' => $r->reviewedBy ? ($r->reviewedBy->employee ? "{$r->reviewedBy->employee->first_name} {$r->reviewedBy->employee->last_name}" : $r->reviewedBy->username) : null,
                'reviewed_at' => $r->reviewed_at ? $r->reviewed_at->format('Y-m-d H:i:s') : null,
            ];
        });

        return response()->json([
            'success' => true,
            'reports' => $reports,
        ]);
    }

    public function show(Request $request, $id)
    {
        $user = $request->user();
        $report = Report::with(['branch', 'createdBy.employee', 'reviewedBy.employee'])->findOrFail($id);

        if ($user && in_array($user->role, ['Store Administrator', 'Store Admin'])) {
            $branchId = $user->employee ? $user->employee->branch_id : -1;
            if ($report->branch_id != $branchId) {
                return response()->json(['message' => 'Unauthorized branch access.'], 403);
            }
        }

        return response()->json([
            'success' => true,
            'report' => [
                'report_id' => $report->report_id,
                'report_title' => $report->report_title,
                'report_type' => $report->report_type,
                'branch_id' => $report->branch_id,
                'branch_name' => $report->branch ? $report->branch->name : null,
                'week_start' => $report->week_start ? $report->week_start->format('Y-m-d') : null,
                'week_end' => $report->week_end ? $report->week_end->format('Y-m-d') : null,
                'status' => $report->status,
                'content' => $report->content,
                'notes' => $report->notes,
                'created_by_name' => $report->createdBy ? ($report->createdBy->employee ? "{$report->createdBy->employee->first_name} {$report->createdBy->employee->last_name}" : $report->createdBy->username) : null,
                'created_at' => $report->created_at->format('Y-m-d H:i:s'),
                'submitted_at' => $report->submitted_at ? $report->submitted_at->format('Y-m-d H:i:s') : null,
                'reviewed_by_name' => $report->reviewedBy ? ($report->reviewedBy->employee ? "{$report->reviewedBy->employee->first_name} {$report->reviewedBy->employee->last_name}" : $report->reviewedBy->username) : null,
                'reviewed_at' => $report->reviewed_at ? $report->reviewed_at->format('Y-m-d H:i:s') : null,
            ],
        ]);
    }

    public function store(Request $request)
    {
        $user = $request->user();
        if (!$user || !in_array($user->role, ['Store Administrator', 'Store Admin'])) {
            return response()->json(['message' => 'Only Store Admins can create reports.'], 403);
        }

        $branchId = $user->employee ? $user->employee->branch_id : null;
        if (!$branchId) {
            return response()->json(['message' => 'You are not assigned to a branch.'], 422);
        }

        $validated = $request->validate([
            'report_title' => 'required|string|max:255',
            'report_type' => 'required|string|in:Weekly Store Report,Product / Inventory Report',
            'week_start' => 'nullable|date',
            'week_end' => 'nullable|date|after_or_equal:week_start',
            'notes' => 'nullable|string',
        ]);

        // Generate content payload server-side
        $content = [];
        if ($validated['report_type'] === 'Weekly Store Report') {
            $dateFrom = $validated['week_start'] ?? date('Y-m-d', strtotime('-7 days'));
            $dateTo = $validated['week_end'] ?? date('Y-m-d');
            
            // Generate real attendance summary for the branch in this period
            $attendances = Attendance::whereHas('employee', function($q) use ($branchId) {
                $q->where('branch_id', $branchId);
            })->whereBetween('attendance_date', [$dateFrom, $dateTo])->get();
            
            $content['attendance_summary'] = [
                'total_records' => $attendances->count(),
                'present' => $attendances->where('status', 'Present')->count(),
                'absent' => $attendances->where('status', 'Absent')->count(),
                'late' => $attendances->where('status', 'Late')->count(),
                'total_hours' => round($attendances->sum('total_hours'), 2),
                'overtime_hours' => round($attendances->sum('overtime_hours'), 2),
            ];
            
            $content['employee_summary'] = [
                'total_employees' => Employee::where('branch_id', $branchId)->count(),
                'active_employees' => Employee::where('branch_id', $branchId)->where('status', 'Active')->count(),
            ];
        } else if ($validated['report_type'] === 'Product / Inventory Report') {
            $products = Product::all();
            $content['inventory_summary'] = [
                'total_products' => $products->count(),
                'in_stock' => $products->where('stock_quantity', '>', 0)->count(),
                'low_stock' => $products->filter(fn($p) => $p->stock_quantity === 1)->count(),
                'out_of_stock' => $products->where('stock_quantity', '<=', 0)->count(),
            ];
        }

        $report = Report::create([
            'report_title' => $validated['report_title'],
            'report_type' => $validated['report_type'],
            'branch_id' => $branchId,
            'week_start' => $validated['week_start'] ?? null,
            'week_end' => $validated['week_end'] ?? null,
            'created_by' => $user->user_id,
            'status' => 'DRAFT',
            'content' => $content,
            'notes' => $validated['notes'] ?? null,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Report draft created successfully.',
            'report_id' => $report->report_id,
        ]);
    }

    public function update(Request $request, $id)
    {
        $user = $request->user();
        $report = Report::findOrFail($id);

        if ($user && in_array($user->role, ['Store Administrator', 'Store Admin'])) {
            $branchId = $user->employee ? $user->employee->branch_id : -1;
            if ($report->branch_id != $branchId) {
                return response()->json(['message' => 'Unauthorized.'], 403);
            }
        }

        if ($report->status !== 'DRAFT') {
            return response()->json(['message' => 'Only DRAFT reports can be edited.'], 422);
        }

        $validated = $request->validate([
            'report_title' => 'required|string|max:255',
            'week_start' => 'nullable|date',
            'week_end' => 'nullable|date|after_or_equal:week_start',
            'notes' => 'nullable|string',
        ]);

        $report->update([
            'report_title' => $validated['report_title'],
            'week_start' => $validated['week_start'] ?? null,
            'week_end' => $validated['week_end'] ?? null,
            'notes' => $validated['notes'] ?? null,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Report draft updated successfully.',
        ]);
    }

    public function submit(Request $request, $id)
    {
        $user = $request->user();
        $report = Report::with('branch')->findOrFail($id);

        if ($user && in_array($user->role, ['Store Administrator', 'Store Admin'])) {
            $branchId = $user->employee ? $user->employee->branch_id : -1;
            if ($report->branch_id != $branchId) {
                return response()->json(['message' => 'Unauthorized.'], 403);
            }
        }

        if ($report->status !== 'DRAFT') {
            return response()->json(['message' => 'Report is already submitted or reviewed.'], 422);
        }

        $report->update([
            'status' => 'SUBMITTED',
            'submitted_at' => now(),
        ]);

        // Send notification to admin
        $storeAdminName = $user->employee ? trim("{$user->employee->first_name} {$user->employee->last_name}") : $user->username;
        $branchName = $report->branch ? $report->branch->name : 'Unknown Branch';
        
        $admins = \App\Models\User::where('role', 'Administrator')->where('is_active', true)->get();
        foreach ($admins as $admin) {
            NotificationService::sendToUser($admin->user_id, [
                'type' => 'report_submission',
                'title' => 'New Report Submitted',
                'message' => "Weekly report '{$report->report_title}' submitted by {$storeAdminName} for {$branchName}.",
                'module' => 'Reports',
                'related_id' => $report->report_id,
                'related_type' => 'App\Models\Report',
                'action_url' => '/dashboard',
                'priority' => 'normal',
            ]);
        }

        return response()->json([
            'success' => true,
            'message' => 'Report submitted successfully.',
        ]);
    }

    public function review(Request $request, $id)
    {
        $user = $request->user();
        if (!$user || $user->role !== 'Administrator') {
            return response()->json(['message' => 'Only Administrators can review reports.'], 403);
        }

        $report = Report::findOrFail($id);

        if ($report->status !== 'SUBMITTED') {
            return response()->json(['message' => 'Report must be SUBMITTED before it can be reviewed.'], 422);
        }

        $report->update([
            'status' => 'REVIEWED',
            'reviewed_by' => $user->user_id,
            'reviewed_at' => now(),
        ]);

        // Notify store admin
        NotificationService::sendToUser($report->created_by, [
            'type' => 'report_review',
            'title' => 'Report Reviewed',
            'message' => "Your report '{$report->report_title}' has been reviewed by Administrator.",
            'module' => 'Reports',
            'related_id' => $report->report_id,
            'related_type' => 'App\Models\Report',
            'action_url' => '/reports',
            'priority' => 'normal',
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Report marked as reviewed successfully.',
        ]);
    }
}

