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
use Illuminate\Support\Facades\Cache;

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

        $fingerprint = SyncController::computeFingerprint('dashboard');
        $cacheKey = "dash_stats_{$role}_{$branch}_{$employeeId}_{$fingerprint}";

        $result = Cache::remember($cacheKey, 2, function () use ($user, $role, $employeeId, $isStoreAdmin, $branch, $today, $currentMonth, $currentYear) {
            // Automatically sync overdue schedules in database (throttled to once every 5 minutes to prevent table locks)
            if (Cache::add('sync_overdue_schedules_dash', true, 300)) {
                PaymentSchedule::where('due_date', '<', $today)
                    ->where('balance_due', '>', 0)
                    ->whereIn('status', ['Pending', 'Partially Paid'])
                    ->update(['status' => 'Overdue']);
            }

            // 1. Sales Queries (Single Aggregated Query)
            $salesQuery = SaleTransaction::query();
            if ($isStoreAdmin || ($branch !== 'All' && !empty($branch))) {
                $b = $isStoreAdmin ? ($user->employee ? $user->employee->branch_id : null) : $branch;
                if ($b) {
                    $salesQuery->where(function($q) use ($b, $user) {
                        $q->where('branch_id', $b)
                          ->orWhere('processed_by', $user->user_id);
                    });
                } else {
                    $salesQuery->where('processed_by', $user->user_id);
                }
            }

            $todayStart = "{$today} 00:00:00";
            $todayEnd = "{$today} 23:59:59";
            $monthStart = "{$currentYear}-{$currentMonth}-01 00:00:00";

            $salesAgg = (clone $salesQuery)->selectRaw("
                COALESCE(SUM(total_amount), 0) as total_sales,
                COUNT(*) as sales_count,
                COALESCE(SUM(CASE WHEN sale_date >= ? AND sale_date <= ? THEN total_amount ELSE 0 END), 0) as today_sales,
                COALESCE(SUM(CASE WHEN sale_date >= ? THEN total_amount ELSE 0 END), 0) as month_sales
            ", [$todayStart, $todayEnd, $monthStart])->first();

            $totalSales = (float)($salesAgg->total_sales ?? 0);
            $salesCount = (int)($salesAgg->sales_count ?? 0);
            $todaySales = (float)($salesAgg->today_sales ?? 0);
            $monthSales = (float)($salesAgg->month_sales ?? 0);

            // 2. Collections (Single Aggregated Query)
            $paymentQuery = Payment::query();
            if ($isStoreAdmin || ($branch !== 'All' && !empty($branch))) {
                $b = $isStoreAdmin ? ($user->employee ? $user->employee->branch_id : null) : $branch;
                if ($b) {
                    $paymentQuery->where(function ($q) use ($b, $user) {
                        $q->whereHas('installmentAccount.sale', function ($eq) use ($b, $user) {
                            $eq->where('branch_id', $b)->orWhere('processed_by', $user->user_id);
                        })->orWhereHas('receivedBy.employee', function ($eq) use ($b) {
                            $eq->where('branch_id', $b);
                        })->orWhere('received_by', $user->user_id);
                    });
                } else {
                    $paymentQuery->where(function ($q) use ($user) {
                        $q->whereHas('installmentAccount.sale', function ($eq) use ($user) {
                            $eq->where('processed_by', $user->user_id);
                        })->orWhere('received_by', $user->user_id);
                    });
                }
            }

            $payAgg = (clone $paymentQuery)->selectRaw("
                COALESCE(SUM(amount), 0) as total_collections,
                COALESCE(SUM(CASE WHEN payment_date >= ? AND payment_date <= ? THEN amount ELSE 0 END), 0) as today_collections,
                COALESCE(SUM(CASE WHEN payment_date >= ? THEN amount ELSE 0 END), 0) as month_collections
            ", [$todayStart, $todayEnd, $monthStart])->first();

            $totalCollections = (float)($payAgg->total_collections ?? 0);
            $todayCollections = (float)($payAgg->today_collections ?? 0);
            $monthCollections = (float)($payAgg->month_collections ?? 0);

            // 3. Installment & Outstanding Balance (Single Aggregated Query)
            $instQuery = InstallmentAccount::query();
            if ($isStoreAdmin || ($branch !== 'All' && !empty($branch))) {
                $b = $isStoreAdmin ? ($user->employee ? $user->employee->branch_id : null) : $branch;
                if ($b) {
                    $instQuery->whereHas('sale', function ($eq) use ($b, $user) {
                        $eq->where('branch_id', $b)
                          ->orWhere('processed_by', $user->user_id);
                    });
                } else {
                    $instQuery->whereHas('sale', function ($eq) use ($user) {
                        $eq->where('processed_by', $user->user_id);
                    });
                }
            }

            $instAgg = (clone $instQuery)->selectRaw("
                COALESCE(SUM(total_payable), 0) as total_installment_sales,
                COALESCE(SUM(down_payment), 0) as total_down_payment,
                COUNT(CASE WHEN status = 'Active' THEN 1 END) as active_installments,
                COUNT(CASE WHEN status = 'Overdue' THEN 1 END) as overdue_installments,
                COUNT(CASE WHEN status = 'Completed' THEN 1 END) as completed_installments
            ")->first();

            $totalInstallmentSales = (float)($instAgg->total_installment_sales ?? 0);
            $totalDownPayment = (float)($instAgg->total_down_payment ?? 0);
            $activeInstallments = (int)($instAgg->active_installments ?? 0);
            $overdueInstallments = (int)($instAgg->overdue_installments ?? 0);
            $completedInstallments = (int)($instAgg->completed_installments ?? 0);

            // High-performance outstanding balance without full model hydration
            $totalPaidCollections = (float)Payment::whereIn('installment_id', (clone $instQuery)->select('installment_id'))->sum('amount');
            $totalOutstandingBalance = max(0, round($totalInstallmentSales - ($totalPaidCollections + $totalDownPayment), 2));

            // 4. Products & Stock (Single Query)
            $prodAgg = DB::table('products')->selectRaw("
                COUNT(*) as total,
                COUNT(CASE WHEN stock_quantity = 1 THEN 1 END) as low_stock,
                COUNT(CASE WHEN stock_quantity <= 0 THEN 1 END) as out_of_stock
            ")->first();
            $totalProducts = (int)($prodAgg->total ?? 0);
            $lowStockProducts = (int)($prodAgg->low_stock ?? 0);
            $outOfStockProducts = (int)($prodAgg->out_of_stock ?? 0);

            // 5. Customers & Branches
            $totalCustomers = Customer::count();
            $branchesList = \App\Models\BranchProfile::pluck('name')->toArray();
            $totalBranches = count($branchesList);

            // 6. Employees & Attendance
            $empQuery = Employee::query();
            if ($isStoreAdmin) {
                $empQuery->where('branch_id', $branch);
            }
            $totalEmployees = $empQuery->count();
            $activeEmployees = (clone $empQuery)->where('status', 'Active')->count();

            $attQuery = Attendance::where('attendance_date', $today);
            if ($isStoreAdmin) {
                $attQuery->whereHas('employee', function ($eq) use ($branch) {
                    $eq->where('branch_id', $branch);
                });
            }
            $attAgg = (clone $attQuery)->selectRaw("
                COUNT(CASE WHEN status = 'Present' THEN 1 END) as present_today,
                COUNT(CASE WHEN status = 'Late' THEN 1 END) as late_today,
                COUNT(CASE WHEN status = 'Absent' THEN 1 END) as absent_today
            ")->first();

            $presentToday = (int)($attAgg->present_today ?? 0);
            $lateToday = (int)($attAgg->late_today ?? 0);
            $absentToday = (int)($attAgg->absent_today ?? 0);
            $totalPresentAndLate = $presentToday + $lateToday;

            // 7. Payroll & Unverified Accounts
            $payrollQuery = Payroll::query();
            if ($isStoreAdmin) {
                $payrollQuery->whereHas('employee', function ($eq) use ($branch) {
                    $eq->where('branch_id', $branch);
                });
            }
            $payrollAgg = (clone $payrollQuery)->selectRaw("
                COALESCE(SUM(CASE WHEN status = 'Paid' THEN net_pay ELSE 0 END), 0) as last_closed_payroll,
                COUNT(CASE WHEN status = 'Draft' THEN 1 END) as pending_payroll_count
            ")->first();
            $lastClosedPayroll = (float)($payrollAgg->last_closed_payroll ?? 0);
            $pendingPayrollCount = (int)($payrollAgg->pending_payroll_count ?? 0);

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

        return [
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
        ];
        });

        return response()->json($result);
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

        $fingerprint = SyncController::computeFingerprint('dashboard');
        $cacheKey = "dash_perf_{$timeframe}_{$startDate}_{$endDate}_{$branch}_{$fingerprint}";

        $result = Cache::remember($cacheKey, 2, function () use ($user, $isStoreAdmin, $branch, $startDate, $endDate, $timeframe) {
            // 1. Sales Performance
            $salesQuery = SaleTransaction::whereDate('sale_date', '>=', $startDate)
                ->whereDate('sale_date', '<=', $endDate);

        if ($isStoreAdmin || ($branch !== 'All' && !empty($branch))) {
            $b = $isStoreAdmin ? ($user->employee ? $user->employee->branch_id : null) : $branch;
            if ($b) {
                $salesQuery->where(function($q) use ($b, $user) {
                    $q->where('branch_id', $b)
                      ->orWhere('processed_by', $user->user_id);
                });
            } else {
                $salesQuery->where('processed_by', $user->user_id);
            }
        }

        $sales = $salesQuery->get();
        $transactionsCount = $sales->count();
        $grossSales = (float)$sales->sum('subtotal') ?: (float)$sales->sum('total_amount');
        $discounts = (float)$sales->sum('discount_amount');
        $netSales = (float)$sales->sum('total_amount');
        $cashSales = (float)$sales->whereIn('payment_method', ['Cash', 'GCash', 'Maya', 'Bank Account'])->sum('total_amount');
        $installmentSales = (float)$sales->where('payment_method', 'Installment')->sum('total_amount');

        // 2. Collections Performance
        $paymentQuery = Payment::whereDate('payment_date', '>=', $startDate)
            ->whereDate('payment_date', '<=', $endDate);

        if ($isStoreAdmin || ($branch !== 'All' && !empty($branch))) {
            $b = $isStoreAdmin ? ($user->employee ? $user->employee->branch_id : null) : $branch;
            if ($b) {
                $paymentQuery->where(function ($q) use ($b, $user) {
                    $q->whereHas('installmentAccount.sale', function ($eq) use ($b, $user) {
                        $eq->where('branch_id', $b)->orWhere('processed_by', $user->user_id);
                    })->orWhereHas('receivedBy.employee', function ($eq) use ($b) {
                        $eq->where('branch_id', $b);
                    })->orWhere('received_by', $user->user_id);
                });
            } else {
                $paymentQuery->where(function ($q) use ($user) {
                    $q->whereHas('installmentAccount.sale', function ($eq) use ($user) {
                        $eq->where('processed_by', $user->user_id);
                    })->orWhere('received_by', $user->user_id);
                });
            }
        }

        $payments = $paymentQuery->get();
        $paymentsCount = $payments->count();
        $totalCollected = (float)$payments->sum('amount');
        $cashCollections = (float)$payments->where('payment_method', 'Cash')->sum('amount');
        $digitalCollections = (float)$payments->whereIn('payment_method', ['GCash', 'Maya', 'Bank Transfer', 'E-Wallet'])->sum('amount');
        $overdueCollected = (float)$payments->where('notes', 'like', '%Overdue%')->sum('amount');

        // 3. Installment in Range
        $instQuery = InstallmentAccount::query();
        if ($isStoreAdmin || ($branch !== 'All' && !empty($branch))) {
            $b = $isStoreAdmin ? ($user->employee ? $user->employee->branch_id : null) : $branch;
            if ($b) {
                $instQuery->whereHas('sale', function ($eq) use ($b, $user) {
                    $eq->where('branch_id', $b)
                      ->orWhere('processed_by', $user->user_id);
                });
            } else {
                $instQuery->whereHas('sale', function ($eq) use ($user) {
                    $eq->where('processed_by', $user->user_id);
                });
            }
        }
        $totalInstPayable = (float)(clone $instQuery)->sum('total_payable');
        $overdueAccounts = (clone $instQuery)->where('status', 'Overdue')->count();
        $instCount = (clone $instQuery)->count();

        $instSummaries = (clone $instQuery)->select('installment_id', 'total_payable', 'down_payment')->get();
        $instIds = $instSummaries->pluck('installment_id')->toArray();
        $paidMap = empty($instIds) ? [] : Payment::whereIn('installment_id', $instIds)
            ->groupBy('installment_id')
            ->selectRaw('installment_id, SUM(amount) as paid')
            ->pluck('paid', 'installment_id')
            ->toArray();

        $totalInstPaid = 0;
        foreach ($instSummaries as $inst) {
            $totalInstPaid += (float)($paidMap[$inst->installment_id] ?? 0) + (float)$inst->down_payment;
        }
        $totalOutstanding = max(0, round($totalInstPayable - $totalInstPaid, 2));

        return [
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
                'total_accounts' => $instCount,
                'total_financed' => $totalInstPayable,
                'total_paid' => $totalInstPaid,
                'outstanding_balance' => $totalOutstanding,
                'overdue_accounts' => $overdueAccounts,
            ]
        ];
        });

        return response()->json($result);
    }

    /**
     * Branch Business Performance Comparison (Admin).
     */
    public function branchComparison(Request $request)
    {
        $fingerprint = SyncController::computeFingerprint('dashboard');
        return \Illuminate\Support\Facades\Cache::remember("pace_dash_branch_comp_{$fingerprint}", 2, function () {
            $branchProfiles = \App\Models\BranchProfile::all();

            // 1. Batch aggregate sales by branch in 1 single query
            $salesByBranch = DB::table('sale_transactions')
                ->selectRaw('branch_id, SUM(total_amount) as total_sales')
                ->whereNotNull('branch_id')
                ->groupBy('branch_id')
                ->pluck('total_sales', 'branch_id');

            // 2. Batch aggregate collections by branch in 1 single query
            $collectionsByBranch = DB::table('payments')
                ->join('installment_accounts', 'payments.installment_id', '=', 'installment_accounts.installment_id')
                ->join('sale_transactions', 'installment_accounts.sale_id', '=', 'sale_transactions.sale_id')
                ->selectRaw('sale_transactions.branch_id, SUM(payments.amount) as total_collections')
                ->whereNotNull('sale_transactions.branch_id')
                ->groupBy('sale_transactions.branch_id')
                ->pluck('total_collections', 'branch_id');

            // 3. Batch aggregate installments by branch in 1 single query
            $instByBranch = DB::table('installment_accounts')
                ->join('sale_transactions', 'installment_accounts.sale_id', '=', 'sale_transactions.sale_id')
                ->selectRaw("
                    sale_transactions.branch_id,
                    SUM(installment_accounts.total_payable) as total_inst_sales,
                    SUM(installment_accounts.down_payment) as total_down_payment,
                    COUNT(CASE WHEN installment_accounts.status = 'Overdue' THEN 1 END) as overdue_accounts
                ")
                ->whereNotNull('sale_transactions.branch_id')
                ->groupBy('sale_transactions.branch_id')
                ->get()
                ->keyBy('branch_id');

            // 4. Batch fetch store managers in 1 query
            $managers = \App\Models\User::where('role', 'Store Administrator')
                ->with('employee:employee_id,branch_id')
                ->get()
                ->filter(fn($u) => $u->employee && $u->employee->branch_id)
                ->keyBy('employee.branch_id');

            $comparison = [];
            foreach ($branchProfiles as $bp) {
                $bId = $bp->id;
                $sales = (float)($salesByBranch[$bId] ?? 0);
                $collections = (float)($collectionsByBranch[$bId] ?? 0);
                $instData = $instByBranch[$bId] ?? null;
                $instSales = (float)($instData->total_inst_sales ?? 0);
                $downPayment = (float)($instData->total_down_payment ?? 0);
                $outstanding = max(0, round($instSales - ($collections + $downPayment), 2));
                $overdueCount = (int)($instData->overdue_accounts ?? 0);
                $mgr = $managers[$bId] ?? null;

                $comparison[] = [
                    'id' => $bp->id,
                    'branch' => $bp->name,
                    'location' => $bp->location,
                    'manager' => $mgr ? $mgr->username : null,
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
        });
    }

    /**
     * Real-time Business Monitoring Alerts.
     */
    public function alerts(Request $request)
    {
        $user = $request->user();
        $isStoreAdmin = $user && in_array($user->role, ['Store Administrator', 'Store Admin']);
        $branch = $isStoreAdmin ? ($user->employee ? $user->employee->branch_id : null) : 'All';
        $fingerprint = SyncController::computeFingerprint('dashboard');
        $cacheKey = "pace_dash_alerts_" . ($isStoreAdmin ? "store_{$branch}" : "admin") . "_{$fingerprint}";

        $data = \Illuminate\Support\Facades\Cache::remember($cacheKey, 2, function () use ($isStoreAdmin, $branch, $user) {
            $alerts = [];

            // 1 & 2. Stock Alerts (Single Aggregated Query)
            $stockAgg = DB::table('products')->selectRaw("
                COUNT(CASE WHEN stock_quantity <= 1 AND stock_quantity > 0 THEN 1 END) as low_stock,
                COUNT(CASE WHEN stock_quantity <= 0 THEN 1 END) as out_of_stock
            ")->first();

            $lowStockCount = (int)($stockAgg->low_stock ?? 0);
            if ($lowStockCount > 0) {
                $alerts[] = [
                    'id' => 'low_stock',
                    'type' => 'warning',
                    'title' => 'Low Inventory Alert',
                    'message' => "{$lowStockCount} product(s) are below configured reorder levels.",
                    'action_url' => '/products',
                ];
            }

            $outOfStockCount = (int)($stockAgg->out_of_stock ?? 0);
            if ($outOfStockCount > 0) {
                $alerts[] = [
                    'id' => 'out_of_stock',
                    'type' => 'danger',
                    'title' => 'Stock Depletion Warning',
                    'message' => "{$outOfStockCount} product(s) are completely out of stock.",
                    'action_url' => '/products',
                ];
            }

            // 3. Overdue Installments Alert
            $instQuery = InstallmentAccount::where('status', 'Overdue');
            if ($isStoreAdmin) {
                if ($branch) {
                    $instQuery->whereHas('sale', function ($eq) use ($branch, $user) {
                        $eq->where('branch_id', $branch)->orWhere('processed_by', $user->user_id);
                    });
                } else {
                    $instQuery->whereHas('sale', function ($eq) use ($user) {
                        $eq->where('processed_by', $user->user_id);
                    });
                }
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

            return [
                'alerts' => $alerts,
            ];
        });

        return response()->json($data);
    }

    /**
     * Database-driven Charts data.
     */
    public function charts()
    {
        $fingerprint = SyncController::computeFingerprint('dashboard');
        return \Illuminate\Support\Facades\Cache::remember("pace_dash_charts_{$fingerprint}", 2, function () {
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
                
                $combinedTrend[] = [
                    'month' => $m,
                    'sales' => $s ? (float)$s->sales : 0,
                    'collections' => $c ? (float)$c->collections : 0,
                    'transactions' => $s ? (int)$s->transactions : 0,
                    'units_sold' => $s ? (int)$s->units_sold : 0,
                ];
            }

            // Installment Status Distribution (Single Aggregated Query)
            $instStatusAgg = InstallmentAccount::selectRaw("
                COUNT(CASE WHEN status = 'Active' THEN 1 END) as active,
                COUNT(CASE WHEN status = 'Overdue' THEN 1 END) as overdue,
                COUNT(CASE WHEN status = 'Completed' THEN 1 END) as completed
            ")->first();

            $installmentStatus = [
                ['name' => 'Active', 'value' => (int)($instStatusAgg->active ?? 0), 'color' => '#16a34a'],
                ['name' => 'Overdue', 'value' => (int)($instStatusAgg->overdue ?? 0), 'color' => '#dc2626'],
                ['name' => 'Completed', 'value' => (int)($instStatusAgg->completed ?? 0), 'color' => '#2563eb'],
            ];

            // Branch Sales Distribution
            $branchSales = DB::table('sale_transactions')
                ->join('users', 'sale_transactions.processed_by', '=', 'users.user_id')
                ->join('employees', 'users.employee_id', '=', 'employees.employee_id')
                ->leftJoin('branch_profiles', 'employees.branch_id', '=', 'branch_profiles.id')
                ->selectRaw("COALESCE(branch_profiles.name, 'Unassigned') as branch, SUM(sale_transactions.total_amount) as total_sales")
                ->groupBy('branch_profiles.name')
                ->get();

            return response()->json([
                'sales_trend' => $combinedTrend,
                'installment_status' => $installmentStatus,
                'branch_sales' => $branchSales,
            ]);
        });
    }

    /**
     * Recent Activities, Sales, and Low Stock.
     */
    public function recent()
    {
        $fingerprint = SyncController::computeFingerprint('dashboard');
        $cacheKey = "dash_recent_{$fingerprint}";

        $result = Cache::remember($cacheKey, 2, function () {
            $recentSales = SaleTransaction::with([
                    'customer:customer_id,first_name,last_name',
                    'processedBy:user_id,employee_id',
                    'processedBy.employee:employee_id,branch_id',
                    'processedBy.employee.branch:id,name'
                ])
                ->select('sale_id', 'invoice_no', 'customer_id', 'processed_by', 'sale_date', 'payment_method', 'total_amount', 'status')
                ->orderByDesc('sale_date')
                ->take(6)
                ->get()
                ->map(function ($s) {
                    $emp = $s->processedBy ? $s->processedBy->employee : null;
                    return [
                        'sale_id' => $s->sale_id,
                        'invoice_no' => $s->invoice_no,
                        'customer_name' => $s->customer ? "{$s->customer->first_name} {$s->customer->last_name}" : 'Walk-in',
                        'branch' => $emp ? ($emp->branch_name ?? (is_object($emp->branch) ? $emp->branch->name : ((string)$emp->branch ?: null))) : null,
                        'sale_date' => date('Y-m-d', strtotime($s->sale_date)),
                        'payment_method' => $s->payment_method,
                        'total_amount' => (float)$s->total_amount,
                        'status' => $s->status,
                    ];
                });

            $overdueInstallments = InstallmentAccount::with([
                    'customer:customer_id,first_name,last_name,phone',
                    'payments:payment_id,installment_id,amount',
                    'sale:sale_id,processed_by',
                    'sale.processedBy:user_id,employee_id',
                    'sale.processedBy.employee:employee_id,branch_id',
                    'sale.processedBy.employee.branch:id,name'
                ])
                ->select('installment_id', 'account_no', 'customer_id', 'sale_id', 'total_payable', 'down_payment', 'status')
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
                        'branch' => $emp ? ($emp->branch_name ?? (is_object($emp->branch) ? $emp->branch->name : ((string)$emp->branch ?: null))) : null,
                        'total_payable' => (float)$inst->total_payable,
                        'paid' => $paid,
                        'balance' => $balance,
                        'status' => $inst->status,
                    ];
                });

            $lowStock = Product::select('product_id', 'product_name', 'brand', 'category', 'stock_quantity', 'unit_price')
                ->where('stock_quantity', 1)
                ->orderBy('stock_quantity')
                ->take(6)
                ->get();

            $recentActivity = SystemLog::with('user:user_id,username')
                ->select('id', 'action', 'module', 'description', 'created_at', 'user_id')
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

            return [
                'recent_sales' => $recentSales,
                'overdue_installments' => $overdueInstallments,
                'low_stock' => $lowStock,
                'recent_activity' => $recentActivity,
            ];
        });

        return response()->json($result);
    }
}

