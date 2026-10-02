<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Employee;
use App\Models\Customer;
use App\Models\Product;
use App\Models\SaleTransaction;
use App\Models\InstallmentAccount;
use App\Models\Payroll;
use App\Models\PayrollPeriod;
use App\Models\Attendance;
use App\Models\Payment;
use App\Models\User;
use App\Models\SystemLog;
use Illuminate\Support\Facades\Auth;

class SearchController extends Controller
{
    public function search(Request $request)
    {
        $q = trim($request->query('q', ''));
        if (strlen($q) < 2) {
            return response()->json([
                'success' => true,
                'query' => $q,
                'total' => 0,
                'results' => [],
                'grouped' => [],
            ]);
        }

        $user = $request->user();
        if (!$user) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized',
            ], 401);
        }

        $role = $user->role;
        $isAdmin = ($role === 'Administrator');
        $isStoreAdmin = in_array($role, ['Store Administrator', 'Store Admin']);
        $isEmployee = ($role === 'Employee');
        $userBranch = ($user && $user->employee && $user->employee->branch_id) ? $user->employee->branch_id : null;

        $results = [];

        // ─── 0. SYSTEM NAVIGATION MODULE SHORTCUTS ──────────────────────────────
        $modules = [
            ['title' => 'Dashboard', 'subtitle' => 'System Overview & Analytics', 'keywords' => ['dashboard', 'home', 'stats', 'analytics', 'overview', 'kpi'], 'route' => $isEmployee ? '/employee/dashboard' : '/dashboard', 'icon' => '📊', 'module' => 'Navigation', 'roles' => ['Administrator', 'Store Administrator', 'Employee']],
            ['title' => 'Products & Inventory', 'subtitle' => 'Stock Management, Appliances & Furniture', 'keywords' => ['product', 'products', 'inventory', 'stock', 'appliances', 'furniture', 'items', 'catalog'], 'route' => '/products', 'icon' => '📦', 'module' => 'Navigation', 'roles' => ['Administrator', 'Store Administrator']],
            ['title' => 'Customer Management', 'subtitle' => 'Client Profiles & Credit Ledger', 'keywords' => ['customer', 'customers', 'client', 'clients', 'debtor', 'borrower', 'accounts'], 'route' => '/customers', 'icon' => '👤', 'module' => 'Navigation', 'roles' => ['Administrator', 'Store Administrator']],
            ['title' => 'Sales Transactions', 'subtitle' => 'Cash & Invoiced Transactions Ledger', 'keywords' => ['sale', 'sales', 'transaction', 'transactions', 'pos', 'cashier', 'order', 'orders'], 'route' => '/transactions', 'icon' => '💳', 'module' => 'Navigation', 'roles' => ['Administrator', 'Store Administrator']],
            ['title' => 'Installment', 'subtitle' => 'Active Loans, Terms & Payment Schedules', 'keywords' => ['installment', 'installments', 'loan', 'loans', 'credit', 'amortization', 'monthly plan'], 'route' => '/installments', 'icon' => '📑', 'module' => 'Navigation', 'roles' => ['Administrator', 'Store Administrator']],
            ['title' => 'Payment Records', 'subtitle' => 'Official Receipts & Collections', 'keywords' => ['payment', 'payments', 'receipt', 'receipts', 'collection', 'collections', 'cash in'], 'route' => '/payments', 'icon' => '💵', 'module' => 'Navigation', 'roles' => ['Administrator', 'Store Administrator']],
            ['title' => 'Employee Management', 'subtitle' => 'Personnel Profiles, QR Badges & PINs', 'keywords' => ['employee', 'employees', 'staff', 'personnel', 'hr', 'worker', 'workers', 'team', 'qr badge'], 'route' => '/employees', 'icon' => '👥', 'module' => 'Navigation', 'roles' => ['Administrator']],
            ['title' => 'Attendance Records', 'subtitle' => 'Time In, Time Out & Verification Station', 'keywords' => ['attendance', 'time in', 'time out', 'timesheet', 'clock in', 'clock out', 'tardy', 'present', 'absent', 'punch', 'qr scanner', 'terminal'], 'route' => $isEmployee ? '/employee/attendance' : '/attendance', 'icon' => '⏱️', 'module' => 'Navigation', 'roles' => ['Administrator', 'Store Administrator', 'Employee']],
            ['title' => 'Payroll & Payslips', 'subtitle' => 'Salary Periods, 13th Month & Contributions', 'keywords' => ['payroll', 'payslip', 'payslips', 'salary', 'compensation', 'wage', 'wages', '13th month', 'deductions', 'sss', 'philhealth', 'pagibig'], 'route' => $isEmployee ? '/employee/payroll' : '/payroll', 'icon' => '💰', 'module' => 'Navigation', 'roles' => ['Administrator', 'Employee']],
            ['title' => 'Reports & Audits', 'subtitle' => 'Financial Summaries & Export Center', 'keywords' => ['report', 'reports', 'export', 'summary', 'audit', 'financial report', 'sales report'], 'route' => '/reports', 'icon' => '📈', 'module' => 'Navigation', 'roles' => ['Administrator', 'Store Administrator']],
            ['title' => 'User Management', 'subtitle' => 'System Accounts, Passwords & Permissions', 'keywords' => ['user', 'users', 'account', 'accounts', 'login', 'admin account', 'permission', 'roles'], 'route' => '/users', 'icon' => '🔑', 'module' => 'Navigation', 'roles' => ['Administrator']],
            ['title' => 'System Audit Logs', 'subtitle' => 'Activity Tracking & Security Trail', 'keywords' => ['log', 'logs', 'audit', 'system log', 'history', 'security log', 'activity'], 'route' => '/system-logs', 'icon' => '📜', 'module' => 'Navigation', 'roles' => ['Administrator']],
            ['title' => 'Database Backup & Restore', 'subtitle' => 'SQL Dumps, Snapshots & Archives', 'keywords' => ['backup', 'backups', 'restore', 'database backup', 'dump', 'sql archive'], 'route' => '/backups', 'icon' => '💾', 'module' => 'Navigation', 'roles' => ['Administrator']],
            ['title' => 'System Settings', 'subtitle' => 'Company Configuration & Operational Rules', 'keywords' => ['settings', 'configuration', 'config', 'preference', 'preferences', 'company info', 'cutoff'], 'route' => '/settings', 'icon' => '⚙️', 'module' => 'Navigation', 'roles' => ['Administrator']],
        ];

        $lowerQ = strtolower($q);
        foreach ($modules as $mod) {
            if (!in_array($role, $mod['roles'])) continue;
            $matched = (stripos($mod['title'], $q) !== false) || (stripos($mod['subtitle'], $q) !== false);
            if (!$matched) {
                foreach ($mod['keywords'] as $kw) {
                    if (stripos($kw, $lowerQ) !== false || stripos($lowerQ, $kw) !== false) {
                        $matched = true;
                        break;
                    }
                }
            }
            if ($matched) {
                $results[] = [
                    'id' => 'nav_' . md5($mod['route']),
                    'record_id' => null,
                    'type' => 'navigation',
                    'module' => 'Navigation',
                    'title' => $mod['title'],
                    'subtitle' => $mod['subtitle'],
                    'description' => "Open {$mod['title']} page",
                    'url' => $mod['route'],
                    'route' => $mod['route'],
                    'icon' => $mod['icon'],
                ];
            }
        }

        // ─── 1. EMPLOYEES (Admins & Store Admins) ──────────────────────────────────
        if ($isAdmin || $isStoreAdmin) {
            $empQuery = Employee::query();
            if (!$isAdmin) {
                $empQuery->where('branch_id', $userBranch);
            }
            $employees = $empQuery->where(function($query) use ($q) {
                $query->where('first_name', 'like', "%{$q}%")
                      ->orWhere('middle_name', 'like', "%{$q}%")
                      ->orWhere('last_name', 'like', "%{$q}%")
                      ->orWhere('employee_code', 'like', "%{$q}%")
                      ->orWhere('position', 'like', "%{$q}%")
                      ->orWhere('department', 'like', "%{$q}%")
                      ->orwhere('branch_id', 'like', "%{$q}%")
                      ->orWhere('phone', 'like', "%{$q}%")
                      ->orWhere('email', 'like', "%{$q}%")
                      ->orWhere('tin_number', 'like', "%{$q}%")
                      ->orWhere('sss_number', 'like', "%{$q}%")
                      ->orWhere('address', 'like', "%{$q}%")
                      ->orWhereRaw("CONCAT(first_name, ' ', last_name) LIKE ?", ["%{$q}%"])
                      ->orWhereRaw("CONCAT(first_name, ' ', middle_name, ' ', last_name) LIKE ?", ["%{$q}%"]);
            })
            ->limit(6)
            ->get();

            foreach ($employees as $emp) {
                $isVer = (bool)($emp->account_verified || $emp->information_verified);
                $results[] = [
                    'id' => 'emp_' . $emp->employee_id,
                    'record_id' => $emp->employee_id,
                    'type' => 'employee',
                    'module' => 'Employees',
                    'title' => trim("{$emp->first_name} {$emp->last_name}"),
                    'subtitle' => "{$emp->employee_code} · {$emp->position} · {$emp->department}",
                    'description' => "Branch: ' . ($emp->branch ? $emp->branch->name : 'Unassigned') . ' · " . ($isVer ? 'Verified' : 'Not Verified') . " · Status: {$emp->status}",
                    'url' => "/employees?id={$emp->employee_id}",
                    'route' => "/employees?id={$emp->employee_id}",
                    'icon' => 'employee',
                ];
            }
        }

        // ─── 2. CUSTOMERS (Admins & Store Admins) ───────────────────────────────
        if ($isAdmin || $isStoreAdmin) {
            $customers = Customer::where(function($query) use ($q) {
                $query->where('first_name', 'like', "%{$q}%")
                      ->orWhere('middle_name', 'like', "%{$q}%")
                      ->orWhere('last_name', 'like', "%{$q}%")
                      ->orWhere('customer_code', 'like', "%{$q}%")
                      ->orWhere('phone', 'like', "%{$q}%")
                      ->orWhere('email', 'like', "%{$q}%")
                      ->orWhere('address', 'like', "%{$q}%")
                      ->orWhereRaw("CONCAT(first_name, ' ', last_name) LIKE ?", ["%{$q}%"]);
            })
            ->limit(6)
            ->get();

            foreach ($customers as $cust) {
                $fullName = trim("{$cust->first_name} {$cust->middle_name} {$cust->last_name}");
                $results[] = [
                    'id' => 'cust_' . $cust->customer_id,
                    'record_id' => $cust->customer_id,
                    'type' => 'customer',
                    'module' => 'Customers',
                    'title' => $fullName,
                    'subtitle' => "Customer Code: {$cust->customer_code}",
                    'description' => "Phone: " . ($cust->phone ?: 'None') . " · " . ($cust->address ?: 'No address on file'),
                    'url' => "/customers?id={$cust->customer_id}",
                    'route' => "/customers?id={$cust->customer_id}",
                    'icon' => '👤',
                ];
            }
        }

        // ─── 3. PRODUCTS & INVENTORY (Admins & Store Admins) ────────────────────
        if ($isAdmin || $isStoreAdmin) {
            $products = Product::where(function($query) use ($q) {
                $query->where('product_name', 'like', "%{$q}%")
                      ->orWhere('product_code', 'like', "%{$q}%")
                      ->orWhere('category', 'like', "%{$q}%")
                      ->orWhere('brand', 'like', "%{$q}%")
                      ->orWhere('description', 'like', "%{$q}%");
            })
            ->limit(6)
            ->get();

            foreach ($products as $prod) {
                $results[] = [
                    'id' => 'prod_' . $prod->product_id,
                    'record_id' => $prod->product_id,
                    'type' => 'product',
                    'module' => 'Products',
                    'title' => $prod->product_name,
                    'subtitle' => "Code: {$prod->product_code} · {$prod->category}",
                    'description' => "Brand: " . ($prod->brand ?: 'Standard') . " · Price: ₱" . number_format($prod->unit_price, 2) . " · Stock: {$prod->stock_quantity}",
                    'url' => "/products?id={$prod->product_id}",
                    'route' => "/products?id={$prod->product_id}",
                    'icon' => '📦',
                ];
            }
        }

        // ─── 4. SALES TRANSACTIONS (Admins & Store Admins) ───────────────────────
        if ($isAdmin || $isStoreAdmin) {
            $salesQuery = SaleTransaction::with('customer');
            if (!$isAdmin) {
                $salesQuery->whereHas('processedBy.employee', fn($eq) => $eq->where('branch_id', $userBranch));
            }
            $sales = $salesQuery->where(function($query) use ($q) {
                $query->where('invoice_no', 'like', "%{$q}%")
                      ->orWhere('payment_method', 'like', "%{$q}%")
                      ->orWhere('status', 'like', "%{$q}%")
                      ->orWhereHas('customer', function($sub) use ($q) {
                          $sub->where('first_name', 'like', "%{$q}%")
                              ->orWhere('last_name', 'like', "%{$q}%")
                              ->orWhere('customer_code', 'like', "%{$q}%");
                      });
            })
            ->limit(6)
            ->get();

            foreach ($sales as $sale) {
                $custName = $sale->customer ? trim("{$sale->customer->first_name} {$sale->customer->last_name}") : 'Walk-in Customer';
                $results[] = [
                    'id' => 'sale_' . $sale->sale_id,
                    'record_id' => $sale->sale_id,
                    'type' => 'sale',
                    'module' => 'Sales',
                    'title' => "Invoice #{$sale->invoice_no}",
                    'subtitle' => "Customer: {$custName} · ₱" . number_format($sale->total_amount, 2),
                    'description' => "Method: {$sale->payment_method} · Date: {$sale->sale_date} · Status: {$sale->status}",
                    'url' => "/transactions?id={$sale->sale_id}",
                    'route' => "/transactions?id={$sale->sale_id}",
                    'icon' => '💳',
                ];
            }
        }

        // ─── 5. INSTALLMENT ACCOUNTS (Admins & Store Admins) ────────────────────
        if ($isAdmin || $isStoreAdmin) {
            $instQuery = InstallmentAccount::with('customer');
            if (!$isAdmin) {
                $instQuery->whereHas('sale.processedBy.employee', fn($eq) => $eq->where('branch_id', $userBranch));
            }
            $installments = $instQuery->where(function($query) use ($q) {
                $query->where('account_no', 'like', "%{$q}%")
                      ->orWhere('status', 'like', "%{$q}%")
                      ->orWhereHas('customer', function($sub) use ($q) {
                          $sub->where('first_name', 'like', "%{$q}%")
                              ->orWhere('last_name', 'like', "%{$q}%")
                              ->orWhere('customer_code', 'like', "%{$q}%");
                      });
            })
            ->limit(6)
            ->get();

            foreach ($installments as $inst) {
                $custName = $inst->customer ? trim("{$inst->customer->first_name} {$inst->customer->last_name}") : 'N/A';
                $results[] = [
                    'id' => 'inst_' . $inst->installment_id,
                    'record_id' => $inst->installment_id,
                    'type' => 'installment',
                    'module' => 'Installments',
                    'title' => "Account #{$inst->account_no}",
                    'subtitle' => "Customer: {$custName}",
                    'description' => "Total: ₱" . number_format($inst->total_payable, 2) . " · Monthly: ₱" . number_format($inst->installment_amount, 2) . " · Status: {$inst->status}",
                    'url' => "/installments?id={$inst->installment_id}",
                    'route' => "/installments?id={$inst->installment_id}",
                    'icon' => '📑',
                ];
            }
        }

        // ─── 6. PAYMENTS & RECEIPTS (Admins & Store Admins) ─────────────────────
        if ($isAdmin || $isStoreAdmin) {
            $paymentQuery = Payment::with(['installmentAccount.customer']);
            if (!$isAdmin) {
                $paymentQuery->whereHas('installmentAccount.sale.processedBy.employee', fn($eq) => $eq->where('branch_id', $userBranch));
            }
            $payments = $paymentQuery->where(function($query) use ($q) {
                $query->where('receipt_no', 'like', "%{$q}%")
                      ->orWhere('reference_no', 'like', "%{$q}%")
                      ->orWhere('payment_method', 'like', "%{$q}%")
                      ->orWhereHas('installmentAccount', function($sub) use ($q) {
                          $sub->where('account_no', 'like', "%{$q}%")
                              ->orWhereHas('customer', function($c) use ($q) {
                                  $c->where('first_name', 'like', "%{$q}%")
                                    ->orWhere('last_name', 'like', "%{$q}%");
                              });
                      });
            })
            ->limit(6)
            ->get();

            foreach ($payments as $pay) {
                $cust = $pay->installmentAccount?->customer;
                $custName = $cust ? trim("{$cust->first_name} {$cust->last_name}") : 'Customer';
                $results[] = [
                    'id' => 'pay_rec_' . $pay->payment_id,
                    'record_id' => $pay->payment_id,
                    'type' => 'payment',
                    'module' => 'Payments',
                    'title' => "Payment Receipt #{$pay->receipt_no}",
                    'subtitle' => "₱" . number_format($pay->amount, 2) . " ({$pay->payment_method})",
                    'description' => "Customer: {$custName} · Account: " . ($pay->installmentAccount?->account_no ?: 'N/A') . " · Date: {$pay->payment_date}",
                    'url' => "/payments?id={$pay->payment_id}",
                    'route' => "/payments?id={$pay->payment_id}",
                    'icon' => '💵',
                ];
            }
        }

        // ─── 7. ATTENDANCE RECORDS ──────────────────────────────────────────────
        $attendanceQuery = Attendance::with('employee');
        if ($isAdmin) {
            // All attendances across business
        } elseif ($isStoreAdmin) {
            $attendanceQuery->whereHas('employee', fn($eq) => $eq->where('branch_id', $userBranch));
        } else {
            // Employee role: own records only
            $attendanceQuery->where('employee_id', $user->employee_id ?: 0);
        }

        $attendanceQuery->where(function($query) use ($q, $isAdmin, $isStoreAdmin) {
            $query->where('attendance_date', 'like', "%{$q}%")
                  ->orWhere('status', 'like', "%{$q}%")
                  ->orWhere('verification_method', 'like', "%{$q}%");
            if ($isAdmin || $isStoreAdmin) {
                $query->orWhereHas('employee', function($sub) use ($q) {
                    $sub->where('first_name', 'like', "%{$q}%")
                        ->orWhere('last_name', 'like', "%{$q}%")
                        ->orWhere('employee_code', 'like', "%{$q}%");
                });
            }
        });

        $attendances = $attendanceQuery->latest('attendance_date')->limit(6)->get();
        foreach ($attendances as $att) {
            $emp = $att->employee;
            $empName = $emp ? trim("{$emp->first_name} {$emp->last_name} ({$emp->employee_code})") : 'Employee';
            $results[] = [
                'id' => 'att_' . $att->attendance_id,
                'record_id' => $att->attendance_id,
                'type' => 'attendance',
                'module' => 'Attendance',
                'title' => "Attendance: {$att->attendance_date}",
                'subtitle' => ($isAdmin || $isStoreAdmin) ? $empName : "Your Attendance Record",
                'description' => "Status: {$att->status} · Time In: " . ($att->time_in ?: 'None') . " · Time Out: " . ($att->time_out ?: 'None'),
                'url' => ($isAdmin || $isStoreAdmin) ? "/attendance?id={$att->attendance_id}" : "/employee/attendance",
                'route' => ($isAdmin || $isStoreAdmin) ? "/attendance?id={$att->attendance_id}" : "/employee/attendance",
                'icon' => '⏱️',
            ];
        }

        // ─── 8. PAYROLL & PAYSLIPS ──────────────────────────────────────────────
        $payrollQuery = Payroll::with(['employee', 'payrollPeriod']);
        if ($isAdmin) {
            // All payrolls
        } elseif ($isStoreAdmin) {
            $payrollQuery->whereHas('employee', fn($eq) => $eq->where('branch_id', $userBranch));
        } else {
            // Employee: own payslips only
            $payrollQuery->where('employee_id', $user->employee_id ?: 0);
        }

        $payrollQuery->where(function($query) use ($q, $isAdmin, $isStoreAdmin) {
            $query->where('status', 'like', "%{$q}%")
                  ->orWhereHas('payrollPeriod', function($sub) use ($q) {
                      $sub->where('period_name', 'like', "%{$q}%");
                  });
            if ($isAdmin || $isStoreAdmin) {
                $query->orWhereHas('employee', function($sub) use ($q) {
                    $sub->where('first_name', 'like', "%{$q}%")
                        ->orWhere('last_name', 'like', "%{$q}%")
                        ->orWhere('employee_code', 'like', "%{$q}%");
                });
            }
        });

        $payrolls = $payrollQuery->latest('payroll_id')->limit(6)->get();
        foreach ($payrolls as $pay) {
            $emp = $pay->employee;
            $empName = $emp ? trim("{$emp->first_name} {$emp->last_name} ({$emp->employee_code})") : 'Employee';
            $periodName = $pay->payrollPeriod?->period_name ?: 'Regular Period';
            $results[] = [
                'id' => 'pay_' . $pay->payroll_id,
                'record_id' => $pay->payroll_id,
                'type' => 'payroll',
                'module' => 'Payroll',
                'title' => "Payslip: {$periodName}",
                'subtitle' => ($isAdmin || $isStoreAdmin) ? "Employee: {$empName}" : "Your Payslip Record",
                'description' => "Net Pay: ₱" . number_format($pay->net_pay, 2) . " · Basic: ₱" . number_format($pay->basic_pay, 2) . " · Status: {$pay->status}",
                'url' => $isAdmin ? "/payroll?id={$pay->payroll_id}" : "/employee/payroll",
                'route' => $isAdmin ? "/payroll?id={$pay->payroll_id}" : "/employee/payroll",
                'icon' => '💰',
            ];
        }

        // ─── 9. USERS (Administrator Only) ──────────────────────────────────────
        if ($isAdmin) {
            $users = User::with('employee')
                ->where(function($query) use ($q) {
                    $query->where('username', 'like', "%{$q}%")
                          ->orWhere('role', 'like', "%{$q}%")
                          ->orWhereHas('employee', function($sub) use ($q) {
                              $sub->where('first_name', 'like', "%{$q}%")
                                  ->orWhere('last_name', 'like', "%{$q}%")
                                  ->orWhere('employee_code', 'like', "%{$q}%");
                          });
                })
                ->limit(5)
                ->get();

            foreach ($users as $u) {
                $empName = $u->employee ? trim("{$u->employee->first_name} {$u->employee->last_name} ({$u->employee->employee_code})") : 'System Account';
                $results[] = [
                    'id' => 'usr_' . $u->user_id,
                    'record_id' => $u->user_id,
                    'type' => 'user',
                    'module' => 'Users',
                    'title' => "@{$u->username}",
                    'subtitle' => "Role: {$u->role} · {$empName}",
                    'description' => "Status: " . ($u->is_active ? 'Active' : 'Inactive') . " · " . ($u->account_verified ? '✓ Verified' : '⚠ Not Verified') . " · User ID: {$u->user_id}",
                    'url' => "/users?id={$u->user_id}",
                    'route' => "/users?id={$u->user_id}",
                    'icon' => '🔑',
                ];
            }
        }

        // ─── 10. SYSTEM LOGS (Administrator Only) ───────────────────────────────
        if ($isAdmin) {
            $logs = SystemLog::with('user')
                ->where(function($query) use ($q) {
                    $query->where('action', 'like', "%{$q}%")
                          ->orWhere('module', 'like', "%{$q}%")
                          ->orWhere('description', 'like', "%{$q}%")
                          ->orWhere('ip_address', 'like', "%{$q}%");
                })
                ->latest('created_at')
                ->limit(5)
                ->get();

            foreach ($logs as $log) {
                $results[] = [
                    'id' => 'log_' . ($log->id ?? $log->log_id ?? 1),
                    'record_id' => ($log->id ?? $log->log_id ?? 1),
                    'type' => 'system_log',
                    'module' => 'System Logs',
                    'title' => "Log: {$log->module} ({$log->action})",
                    'subtitle' => substr($log->description, 0, 60) . (strlen($log->description) > 60 ? '...' : ''),
                    'description' => "Date: {$log->created_at} · IP: {$log->ip_address}",
                    'url' => "/system-logs?search=" . urlencode($log->module),
                    'route' => "/system-logs?search=" . urlencode($log->module),
                    'icon' => '📜',
                ];
            }
        }

        // Group results by module for seamless category browsing
        $grouped = [];
        foreach ($results as $res) {
            $mod = $res['module'];
            if (!isset($grouped[$mod])) {
                $grouped[$mod] = [];
            }
            $grouped[$mod][] = $res;
        }

        return response()->json([
            'success' => true,
            'query' => $q,
            'total' => count($results),
            'results' => $results,
            'grouped' => $grouped,
        ]);
    }
}

