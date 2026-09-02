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
use Illuminate\Support\Facades\DB;

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
            $branch = $user->employee ? $user->employee->branch : 'Main Branch';
            $query->where('branch', $branch);
        } elseif ($request->filled('branch') && $request->query('branch') !== 'All') {
            $query->where('branch', $request->query('branch'));
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

        $allEmployees = $query->orderBy('employee_id')->get();

        $totalEmployees = $allEmployees->count();
        $activeEmployees = $allEmployees->where('status', 'Active')->count();
        $inactiveEmployees = $allEmployees->where('status', 'Inactive')->count();
        $verifiedEmployees = $allEmployees->where('account_verified', true)->count();

        // Aggregations
        $byDepartment = $allEmployees->groupBy('department')->map(function ($group, $dept) {
            return ['department' => $dept ?: 'Unassigned', 'count' => $group->count()];
        })->values();

        $byBranch = $allEmployees->groupBy('branch')->map(function ($group, $branch) {
            return ['branch' => $branch ?: 'Main Branch', 'count' => $group->count()];
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
                'branch' => $emp->branch,
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
                'branch' => $emp ? $emp->branch : '',
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
                'branch' => $emp ? $emp->branch : '',
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

        $lowStock = $products->filter(fn($p) => $p->stock_quantity > 0 && $p->stock_quantity <= $p->reorder_level)->count();
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
}
