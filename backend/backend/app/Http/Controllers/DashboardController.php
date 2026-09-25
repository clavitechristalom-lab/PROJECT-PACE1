<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Employee;
use App\Models\Customer;
use App\Models\Product;
use App\Models\SaleTransaction;
use App\Models\SaleItem;
use App\Models\InstallmentAccount;
use App\Models\PaymentSchedule;
use App\Models\Payment;
use App\Models\Payroll;
use App\Models\Attendance;
use App\Models\SystemLog;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    /**
     * Top-level Business Monitoring & Dashboard statistics.
     */
    public function stats(Request $request)
    {
        $user = $request->user();
        $role = $user ? $user->role : $request->query('role', 'Administrator');
        $employeeId = $user && $user->employee_id ? $user->employee_id : $request->query('employee_id');

        $isStoreAdmin = in_array($role, ['Store Administrator', 'Store Admin']);
        $branch = ($isStoreAdmin && $user && $user->employee) ? ($user->employee->branch_id ?: null) : ($request->query('branch', 'All'));

        $today = date('Y-m-d');
        $currentMonth = date('m');
        $currentYear = date('Y');

        // Automatically sync overdue schedules in database
        PaymentSchedule::where('due_date', '<', $today)
            ->where('balance_due', '>', 0)
            ->whereIn('status', ['Pending', 'Partially Paid'])
            ->update(['status' => 'Overdue']);

        // 1. Sales Queries
        $salesQuery = SaleTransaction::query();
        if ($isStoreAdmin || ($branch !== 'All' && !empty($branch))) {
            $b = $isStoreAdmin ? ($user->employee ? $user->employee->branch_id : null) : $branch;
            $salesQuery->whereHas('processedBy.employee', function ($eq) use ($b) {
                $eq->where('branch_id', $b);
            });
        }
        $totalSales = (float)(clone $salesQuery)->sum('total_amount');
        $salesCount = (clone $salesQuery)->count();

        // Month / Today Sales
        $todaySales = (float)(clone $salesQuery)->whereDate('sale_date', $today)->sum('total_amount');
        $monthSales = (float)(clone $salesQuery)->whereMonth('sale_date', $currentMonth)->whereYear('sale_date', $currentYear)->sum('total_amount');

        // 2. Collections (Payments + Down Payments)
        $paymentQuery = Payment::query();
        if ($isStoreAdmin || ($branch !== 'All' && !empty($branch))) {
            $b = $isStoreAdmin ? ($user->employee ? $user->employee->branch_id : null) : $branch;
            $paymentQuery->where(function ($q) use ($b) {
                $q->whereHas('installmentAccount.sale.processedBy.employee', function ($eq) use ($b) {
                    $eq->where('branch_id', $b);
                })->orWhereHas('receivedBy.employee', function ($eq) use ($b) {
                    $eq->where('branch_id', $b);
                });
            });
        }
        $totalCollections = (float)(clone $paymentQuery)->sum('amount');
        $todayCollections = (float)(clone $paymentQuery)->whereDate('payment_date', $today)->sum('amount');
        $monthCollections = (float)(clone $paymentQuery)->whereMonth('payment_date', $currentMonth)->whereYear('payment_date', $currentYear)->sum('amount');

        // 3. Installment & Outstanding Balance
        $instQuery = InstallmentAccount::with('payments');
        if ($isStoreAdmin || ($branch !== 'All' && !empty($branch))) {
            $b = $isStoreAdmin ? ($user->employee ? $user->employee->branch_id : null) : $branch;
            $instQuery->whereHas('sale.processedBy.employee', function ($eq) use ($b) {
                $eq->where('branch_id', $b);
            });
        }
        $allInsts = (clone $instQuery)->get();
        $totalInstallmentSales = (float)$allInsts->sum('total_payable');
        
        $totalPaidSum = $allInsts->reduce(function ($carry, $inst) {
            return $carry + (float)$inst->payments->sum('amount') + (float)$inst->down_payment;
        }, 0);
        $totalOutstandingBalance = max(0, round($totalInstallmentSales - $totalPaidSum, 2));

        $activeInstallments = $allInsts->where('status', 'Active')->count();
        $overdueInstallments = $allInsts->where('status', 'Overdue')->count();
        $completedInstallments = $allInsts->where('status', 'Completed')->count();

        // 4. Products & Stock
        $totalProducts = Product::count();
        $lowStockProducts = Product::where('stock_quantity', 1)->where('stock_quantity', '>', 0)->count();
        $outOfStockProducts = Product::where('stock_quantity', '<=', 0)->count();

        // 5. Customers & Branches
        $totalCustomers = Customer::count();
        $branchesList = \App\Models\BranchProfile::pluck('name')->toArray();
        if (empty($branchesList)) {
            $branchesList = ['Main Branch', 'North Branch', 'South Branch'];
        }
        $totalBranches = count($branchesList);

        // 6. Employees & Attendance
        $empQuery = Employee::query();
        if ($isStoreAdmin) {
            $empQuery->where('branch_id', $branch);
        }
        $totalEmployees = $empQuery->count();
        $activeEmployees = (clone $empQuery)->where('status', 'Active')->count();

        $attQuery = Attendance::with('employee')->where('attendance_date', $today);
        if ($isStoreAdmin) {
            $attQuery->whereHas('employee', function ($eq) use ($branch) {
                $eq->where('branch_id', $branch);
            });
        }
        $todayAttendance = $attQuery->get();
        if ($todayAttendance->isEmpty()) {
            $latestDate = Attendance::max('attendance_date') ?? $today;
            $fallbackQuery = Attendance::with('employee')->where('attendance_date', $latestDate);
            if ($isStoreAdmin) {
                $fallbackQuery->whereHas('employee', function ($eq) use ($branch) {
                    $eq->where('branch_id', $branch);
                });
            }
            $todayAttendance = $fallbackQuery->get();
        }

        $presentToday = $todayAttendance->where('status', 'Present')->count();
        $lateToday = $todayAttendance->where('status', 'Late')->count();
        $absentToday = $todayAttendance->where('status', 'Absent')->count();
        $totalPresentAndLate = $presentToday + $lateToday;

        // 7. Payroll & Unverified Accounts
        $payrollQuery = Payroll::query();
        if ($isStoreAdmin) {
            $payrollQuery->whereHas('employee', function ($eq) use ($branch) {
                $eq->where('branch_id', $branch);
            });
        }
        $lastClosedPayroll = (float)(clone $payrollQuery)->where('status', 'Paid')->sum('net_pay');
        $pendingPayrollCount = (clone $payrollQuery)->where('status', 'Draft')->count();

        $unverifiedCount = User::where('account_verified', false)->count();

        // 8. Employee Specific
        $myAttendanceToday = null;
        $myLatestPayroll = null;
        $myRecentAttendance = [];
        if ($employeeId) {
            $myAttendanceToday = Attendance::where('employee_id', $employeeId)->where('attendance_date', $today)->first();
            if (!$myAttendanceToday) {
                $latestDate = Attendance::where('employee_id', $employeeId)->max('attendance_date');
                if ($latestDate) {
                    $myAttendanceToday = Attendance::where('employee_id', $employeeId)->where('attendance_date', $latestDate)->first();
                }
            }
            $myLatestPayroll = Payroll::with('period')->where('employee_id', $employeeId)->orderByDesc('payroll_id')->first();
            $myRecentAttendance = Attendance::where('employee_id', $employeeId)->orderByDesc('attendance_date')->take(7)->get()->map(function ($a) {
                $regular = max(0, (float)$a->total_hours - (float)$a->overtime_hours);
                return [
                    'attendance_id' => $a->attendance_id,
                    'attendance_date' => $a->attendance_date,
                    'time_in' => $a->time_in ? date('h:i A', strtotime($a->time_in)) : '—',
                    'time_out' => $a->time_out ? date('h:i A', strtotime($a->time_out)) : '—',
                    'regular_hours' => round($regular, 2),
                    'overtime_hours' => (float)$a->overtime_hours,
                    'total_hours' => (float)$a->total_hours,
                    'status' => $a->status,
                ];
            });
        }

        return response()->json([
            // Core Business Monitoring Metrics
            'total_sales' => $totalSales,
            'today_sales' => $todaySales,
            'monthly_sales' => $monthSales,
            'sales_count' => $salesCount,

            'total_collections' => $totalCollections,
            'today_collections' => $todayCollections,
            'monthly_collections' => $monthCollections,

            'total_installment_sales' => $totalInstallmentSales,
            'total_outstanding_balance' => $totalOutstandingBalance,
            'active_installments' => $activeInstallments,
            'overdue_installments' => $overdueInstallments,
            'completed_installments' => $completedInstallments,

            'total_customers' => $totalCustomers,
            'total_products' => $totalProducts,
            'low_stock_products' => $lowStockProducts,
            'out_of_stock_products' => $outOfStockProducts,
            'total_branches' => $totalBranches,
            'branches' => $branchesList,

            'total_employees' => $totalEmployees,
            'active_employees' => $activeEmployees,
            'present_today' => $presentToday,
            'late_today' => $lateToday,
            'absent_today' => $absentToday,
            'total_present' => $totalPresentAndLate,
            'attendance_ratio' => "{$totalPresentAndLate}/{$activeEmployees}",

            'net_payroll' => $lastClosedPayroll,
            'pending_payroll' => $pendingPayrollCount,
            'pending_account_verification' => $unverifiedCount,
            'branch' => $isStoreAdmin ? $branch : ($branch !== 'All' ? $branch : 'All Branches'),

            // Employee Specific
            'my_attendance_today' => $myAttendanceToday ? [
                'attendance_id' => $myAttendanceToday->attendance_id,
                'attendance_date' => $myAttendanceToday->attendance_date,
                'time_in' => $myAttendanceToday->time_in ? date('h:i A', strtotime($myAttendanceToday->time_in)) : '—',
                'time_out' => $myAttendanceToday->time_out ? date('h:i A', strtotime($myAttendanceToday->time_out)) : '—',
                'regular_hours' => round(max(0, (float)$myAttendanceToday->total_hours - (float)$myAttendanceToday->overtime_hours), 2),
                'overtime_hours' => (float)$myAttendanceToday->overtime_hours,
                'total_hours' => (float)$myAttendanceToday->total_hours,
                'status' => $myAttendanceToday->status,
            ] : null,
            'my_latest_payroll' => $myLatestPayroll ? [
                'period_name' => $myLatestPayroll->period ? $myLatestPayroll->period->period_name : "Period #{$myLatestPayroll->period_id}",
                'basic_salary' => (float)$myLatestPayroll->basic_salary,
                'gross_pay' => (float)$myLatestPayroll->gross_pay,
                'total_deductions' => (float)$myLatestPayroll->total_deductions,
                'net_pay' => (float)$myLatestPayroll->net_pay,
                'status' => $myLatestPayroll->status,
            ] : null,
            'my_recent_attendance' => $myRecentAttendance,
        ]);
    }

    /**
     * Filterable Business Performance (Today, This Week, This Month, This Year, Custom Date).
     */
    public function businessPerformance(Request $request)
    {
        $user = $request->user();
        $timeframe = $request->query('timeframe', 'this_month');
        $dateFrom = $request->query('date_from');
        $dateTo = $request->query('date_to');
        $branch = $request->query('branch', 'All');

        $isStoreAdmin = $user && in_array($user->role, ['Store Administrator', 'Store Admin']);
        if ($isStoreAdmin) {
            $branch = $user->employee ? ($user->employee->branch_id ?: null) : null;
        }

        // Calculate Date Range based on timeframe
        $now = now();
        if ($timeframe === 'today') {
            $startDate = $now->toDateString();
            $endDate = $now->toDateString();
        } elseif ($timeframe === 'this_week') {
            $startDate = $now->startOfWeek()->toDateString();
            $endDate = $now->endOfWeek()->toDateString();
        } elseif ($timeframe === 'this_month') {
            $startDate = $now->startOfMonth()->toDateString();
            $endDate = $now->endOfMonth()->toDateString();
        } elseif ($timeframe === 'this_year') {
            $startDate = $now->startOfYear()->toDateString();
            $endDate = $now->endOfYear()->toDateString();
        } elseif ($timeframe === 'custom' && $dateFrom && $dateTo) {
            $startDate = $dateFrom;
            $endDate = $dateTo;
        } else {
            $startDate = $now->startOfMonth()->toDateString();
            $endDate = $now->endOfMonth()->toDateString();
        }

        // 1. Sales Performance
        $salesQuery = SaleTransaction::whereDate('sale_date', '>=', $startDate)
            ->whereDate('sale_date', '<=', $endDate);

        if ($branch !== 'All' && !empty($branch)) {
            $salesQuery->whereHas('processedBy.employee', function ($eq) use ($branch) {
                $eq->where('branch_id', $branch);
            });
        }

        $sales = $salesQuery->get();
        $transactionsCount = $sales->count();
        $grossSales = (float)$sales->sum('subtotal') ?: (float)$sales->sum('total_amount');
        $discounts = (float)$sales->sum('discount_amount');
        $netSales = (float)$sales->sum('total_amount');
        $cashSales = (float)$sales->where('payment_method', 'Cash')->sum('total_amount');
        $installmentSales = (float)$sales->where('payment_method', 'Installment')->sum('total_amount');

        // 2. Collections Performance
        $paymentQuery = Payment::whereDate('payment_date', '>=', $startDate)
            ->whereDate('payment_date', '<=', $endDate);

        if ($branch !== 'All' && !empty($branch)) {
            $paymentQuery->where(function ($q) use ($branch) {
                $q->whereHas('installmentAccount.sale.processedBy.employee', function ($eq) use ($branch) {
                    $eq->where('branch_id', $branch);
                })->orWhereHas('receivedBy.employee', function ($eq) use ($branch) {
                    $eq->where('branch_id', $branch);
                });
            });
        }

        $payments = $paymentQuery->get();
        $paymentsCount = $payments->count();
        $totalCollected = (float)$payments->sum('amount');
        $cashCollections = (float)$payments->where('payment_method', 'Cash')->sum('amount');
        $digitalCollections = (float)$payments->whereIn('payment_method', ['GCash', 'Maya', 'Bank Transfer', 'E-Wallet'])->sum('amount');
        $overdueCollected = (float)$payments->where('notes', 'like', '%Overdue%')->sum('amount');

        // 3. Installment in Range
        $instQuery = InstallmentAccount::with('payments');
        if ($branch !== 'All' && !empty($branch)) {
            $instQuery->whereHas('sale.processedBy.employee', function ($eq) use ($branch) {
                $eq->where('branch_id', $branch);
            });
        }
        $allInsts = $instQuery->get();
        $totalInstPayable = (float)$allInsts->sum('total_payable');
        $totalInstPaid = $allInsts->reduce(function ($carry, $inst) {
            return $carry + (float)$inst->payments->sum('amount') + (float)$inst->down_payment;
        }, 0);
        $totalOutstanding = max(0, round($totalInstPayable - $totalInstPaid, 2));

        $overdueAccounts = $allInsts->where('status', 'Overdue')->count();

        return response()->json([
            'timeframe' => $timeframe,
            'date_range' => ['start' => $startDate, 'end' => $endDate],
            'branch' => $branch,
            'sales' => [
                'transactions' => $transactionsCount,
                'gross_sales' => $grossSales,
                'discounts' => $discounts,
                'net_sales' => $netSales,
                'cash_sales' => $cashSales,
                'installment_sales' => $installmentSales,
            ],
            'collections' => [
                'payments_count' => $paymentsCount,
                'total_collected' => $totalCollected,
                'cash_collections' => $cashCollections,
                'digital_collections' => $digitalCollections,
                'overdue_collected' => $overdueCollected,
            ],
            'installments' => [
                'total_accounts' => $allInsts->count(),
                'total_financed' => $totalInstPayable,
                'total_paid' => $totalInstPaid,
                'outstanding_balance' => $totalOutstanding,
                'overdue_accounts' => $overdueAccounts,
            ]
        ]);
    }

    /**
     * Branch Business Performance Comparison (Admin).
     */
    public function branchComparison(Request $request)
    {
        $branchProfiles = \App\Models\BranchProfile::all();
        $branches = $branchProfiles->pluck('name')->toArray();

        $comparison = [];
        foreach ($branchProfiles as $bp) {
            $branchId = $bp->id;
            $branch = $bp->name;
            // Sales
            $sales = (float)SaleTransaction::whereHas('processedBy.employee', function ($eq) use ($branchId) {
                $eq->where('branch_id', $branchId);
            })->sum('total_amount');

            // Collections
            $collections = (float)Payment::whereHas('installmentAccount.sale.processedBy.employee', function ($eq) use ($branchId) {
                $eq->where('branch_id', $branchId);
            })->sum('amount');

            // Installment
            $insts = InstallmentAccount::with('payments')->whereHas('sale.processedBy.employee', function ($eq) use ($branchId) {
                $eq->where('branch_id', $branchId);
            })->get();

            $instSales = (float)$insts->sum('total_payable');
            $instPaid = $insts->reduce(fn($c, $i) => $c + (float)$i->payments->sum('amount') + (float)$i->down_payment, 0);
            $outstanding = max(0, round($instSales - $instPaid, 2));
            $overdueCount = $insts->where('status', 'Overdue')->count();

            // Find Store Administrator assigned to this branch
            $manager = \App\Models\User::where('role', 'Store Administrator')
                ->whereHas('employee', function ($q) use ($bp) {
                    $q->where('branch_id', $bp->id);
                })->first();

            $comparison[] = [
                'id' => $bp->id,
                'branch' => $branch,
                'location' => $bp->location,
                'manager' => $manager ? $manager->username : null,
                'contact' => $bp->contact_number,
                'status' => $bp->status,
                'color' => $bp->color,
                'image' => $bp->image_url,
                'sales' => $sales,
                'collections' => $collections,
                'installment_sales' => $instSales,
                'outstanding_balance' => $outstanding,
                'overdue_accounts' => $overdueCount,
            ];
        }

        return response()->json([
            'branches' => $comparison,
        ]);
    }

    /**
     * Real-time Business Monitoring Alerts.
     */
    public function alerts(Request $request)
    {
        $user = $request->user();
        $isStoreAdmin = $user && in_array($user->role, ['Store Administrator', 'Store Admin']);
        $branch = $isStoreAdmin ? ($user->employee ? $user->employee->branch_id : null) : 'All';

        $alerts = [];

        // 1. Low Stock Alert
        $lowStock = Product::where('stock_quantity', 1)
            ->where('stock_quantity', '>', 0)
            ->get();
        if ($lowStock->count() > 0) {
            $alerts[] = [
                'id' => 'low_stock',
                'type' => 'warning',
                'title' => 'Low Inventory Alert',
                'message' => "{$lowStock->count()} product(s) are below configured reorder levels.",
                'action_url' => '/products',
            ];
        }

        // 2. Out of Stock Alert
        $outOfStock = Product::where('stock_quantity', '<=', 0)->get();
        if ($outOfStock->count() > 0) {
            $alerts[] = [
                'id' => 'out_of_stock',
                'type' => 'danger',
                'title' => 'Stock Depletion Warning',
                'message' => "{$outOfStock->count()} product(s) are completely out of stock.",
                'action_url' => '/products',
            ];
        }

        // 3. Overdue Installments Alert
        $instQuery = InstallmentAccount::where('status', 'Overdue');
        if ($isStoreAdmin) {
            $instQuery->whereHas('sale.processedBy.employee', fn($eq) => $eq->where('branch_id', $branch));
        }
        $overdueCount = $instQuery->count();
        if ($overdueCount > 0) {
            $alerts[] = [
                'id' => 'overdue_installments',
                'type' => 'danger',
                'title' => 'Overdue Installment',
                'message' => "{$overdueCount} installment(s) have past-due schedules.",
                'action_url' => '/installments?tab=overdue',
            ];
        }

        // 4. Unverified Accounts Alert (Admin)
        if (!$isStoreAdmin) {
            $unverifiedUsers = User::where('account_verified', false)->count();
            if ($unverifiedUsers > 0) {
                $alerts[] = [
                    'id' => 'unverified_users',
                    'type' => 'info',
                    'title' => 'Pending Account Verifications',
                    'message' => "{$unverifiedUsers} user account(s) are awaiting Administrator verification.",
                    'action_url' => '/users',
                ];
            }
        }

        return response()->json([
            'alerts' => $alerts,
        ]);
    }

    /**
     * Database-driven Charts data.
     */
    public function charts()
    {
        // Monthly Sales & Collections Trend
        $salesTrend = DB::table('sale_transactions')
            ->leftJoin('sale_items', 'sale_transactions.sale_id', '=', 'sale_items.sale_id')
            ->selectRaw("DATE_FORMAT(sale_transactions.sale_date, '%b') as month, MONTH(sale_transactions.sale_date) as month_num, SUM(sale_transactions.total_amount) as sales, COUNT(DISTINCT sale_transactions.sale_id) as transactions, SUM(sale_items.quantity) as units_sold")
            ->groupBy('month', 'month_num')
            ->orderBy('month_num')
            ->get();

        $collectionsTrend = DB::table('payments')
            ->selectRaw("DATE_FORMAT(payment_date, '%b') as month, MONTH(payment_date) as month_num, SUM(amount) as collections")
            ->groupBy('month', 'month_num')
            ->orderBy('month_num')
            ->get();

        // Merge Trends
        $combinedTrend = [];
        $months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        foreach ($months as $idx => $m) {
            $mNum = $idx + 1;
            $s = $salesTrend->firstWhere('month_num', $mNum);
            $c = $collectionsTrend->firstWhere('month_num', $mNum);
            if ($s || $c) {
                $combinedTrend[] = [
                    'month' => $m,
                    'sales' => $s ? (float)$s->sales : 0,
                    'collections' => $c ? (float)$c->collections : 0,
                    'transactions' => $s ? (int)$s->transactions : 0,
                    'units_sold' => $s ? (int)$s->units_sold : 0,
                ];
            }
        }

        // Installment Status Distribution
        $activeInst = InstallmentAccount::where('status', 'Active')->count();
        $overdueInst = InstallmentAccount::where('status', 'Overdue')->count();
        $completedInst = InstallmentAccount::where('status', 'Completed')->count();
        $installmentStatus = [
            ['name' => 'Active', 'value' => $activeInst, 'color' => '#16a34a'],
            ['name' => 'Overdue', 'value' => $overdueInst, 'color' => '#dc2626'],
            ['name' => 'Completed', 'value' => $completedInst, 'color' => '#2563eb'],
        ];

        // Branch Sales Distribution
        $branchSales = DB::table('sale_transactions')
            ->join('users', 'sale_transactions.processed_by', '=', 'users.user_id')
            ->join('employees', 'users.employee_id', '=', 'employees.employee_id')
            ->leftJoin('branch_profiles', 'employees.branch_id', '=', 'branch_profiles.id')
            ->selectRaw("COALESCE(branch_profiles.name, 'Main Branch') as branch, SUM(sale_transactions.total_amount) as total_sales")
            ->groupBy('branch_profiles.name')
            ->get();

        return response()->json([
            'sales_trend' => $combinedTrend,
            'installment_status' => $installmentStatus,
            'branch_sales' => $branchSales,
        ]);
    }

    /**
     * Recent Activities, Sales, and Low Stock.
     */
    public function recent()
    {
        $recentSales = SaleTransaction::with(['customer', 'processedBy.employee'])
            ->orderByDesc('sale_date')
            ->take(6)
            ->get()
            ->map(function ($s) {
                $emp = $s->processedBy ? $s->processedBy->employee : null;
                return [
                    'sale_id' => $s->sale_id,
                    'invoice_no' => $s->invoice_no,
                    'customer_name' => $s->customer ? "{$s->customer->first_name} {$s->customer->last_name}" : 'Walk-in',
                    'branch' => $emp && $emp->branch ? $emp->branch->name : null,
                    'sale_date' => date('Y-m-d', strtotime($s->sale_date)),
                    'payment_method' => $s->payment_method,
                    'total_amount' => (float)$s->total_amount,
                    'status' => $s->status,
                ];
            });

        $overdueInstallments = InstallmentAccount::with(['customer', 'payments', 'sale.processedBy.employee'])
            ->where('status', 'Overdue')
            ->orderByDesc('installment_id')
            ->take(6)
            ->get()
            ->map(function ($inst) {
                $paid = (float)$inst->payments->sum('amount') + (float)$inst->down_payment;
                $balance = max(0, (float)$inst->total_payable - $paid);
                $emp = $inst->sale && $inst->sale->processedBy ? $inst->sale->processedBy->employee : null;
                return [
                    'installment_id' => $inst->installment_id,
                    'account_no' => $inst->account_no,
                    'customer_name' => $inst->customer ? "{$inst->customer->first_name} {$inst->customer->last_name}" : 'Customer',
                    'customer_phone' => $inst->customer ? $inst->customer->phone : '',
                    'branch' => $emp && $emp->branch ? $emp->branch->name : null,
                    'total_payable' => (float)$inst->total_payable,
                    'paid' => $paid,
                    'balance' => $balance,
                    'status' => $inst->status,
                ];
            });

        $lowStock = Product::where('stock_quantity', 1)
            ->orderBy('stock_quantity')
            ->take(6)
            ->get();

        $recentActivity = SystemLog::with('user')
            ->orderByDesc('id')
            ->take(8)
            ->get()
            ->map(function ($log) {
                return [
                    'id' => $log->id,
                    'action' => $log->action,
                    'module' => $log->module,
                    'description' => $log->description,
                    'time' => $log->created_at ? $log->created_at->diffForHumans() : 'Just now',
                    'user' => $log->user ? $log->user->username : 'System',
                ];
            });

        return response()->json([
            'recent_sales' => $recentSales,
            'overdue_installments' => $overdueInstallments,
            'low_stock' => $lowStock,
            'recent_activity' => $recentActivity,
        ]);
    }
}

