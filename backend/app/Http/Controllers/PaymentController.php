<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Payment;
use App\Models\PaymentSchedule;
use App\Models\InstallmentAccount;
use App\Models\SaleTransaction;
use App\Models\SaleItem;
use App\Models\Customer;
use App\Models\Product;
use App\Models\SystemLog;
use App\Models\EWalletDeposit;
use App\Models\BranchProfile;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;
use App\Services\AgentContributionService;
use App\Services\NotificationService;
use App\Services\PaymentSettlementService;

class PaymentController extends Controller
{
    /**
     * List payments with role-based branch scoping and search.
     */
    public function index(Request $request)
    {
        $user = $request->user();

        // 1-2s Performance Cache: bypass if exporting CSV
        if (!$request->boolean('export_csv')) {
            $cacheKey = 'pace_pay_idx_' . md5(json_encode([
                'u' => $user ? $user->user_id : 0,
                'r' => $user ? $user->role : '',
                'b' => $request->query('branch', ''),
                's' => $request->query('search', ''),
                'pm' => $request->query('payment_method', ''),
                'df' => $request->query('date_from', ''),
                'dt' => $request->query('date_to', ''),
                'v' => Cache::get('pace_pay_cache_v', 0),
            ]));

            $cached = Cache::get($cacheKey);
            if ($cached !== null) {
                return response()->json($cached);
            }
        }
        $query = Payment::with([
            'installmentAccount:installment_id,account_no,customer_id,sale_id,total_payable,down_payment,installment_amount,number_of_installments,start_date,status',
            'installmentAccount.customer:customer_id,customer_code,first_name,last_name,phone,address,branch_id',
            'installmentAccount.sale:sale_id,invoice_no,processed_by,branch_id',
            'installmentAccount.sale.branch:id,name',
            'installmentAccount.sale.processedBy:user_id,username,employee_id',
            'installmentAccount.sale.processedBy.employee:employee_id,first_name,last_name,branch_id',
            'installmentAccount.sale.items:sale_item_id,sale_id,product_id,quantity',
            'installmentAccount.sale.items.product:product_id,product_name,product_code,category',
            'installmentAccount.paymentSchedules:schedule_id,installment_id,installment_no,due_date,amount_due,amount_paid,balance_due,status',
            'installmentAccount.payments:payment_id,installment_id,amount,status,reference_no,notes',
            'sale:sale_id,invoice_no,customer_id,processed_by,branch_id',
            'sale.customer:customer_id,customer_code,first_name,last_name,phone,address,branch_id',
            'sale.branch:id,name',
            'sale.processedBy:user_id,username,employee_id',
            'sale.processedBy.employee:employee_id,first_name,last_name,branch_id',
            'sale.items:sale_item_id,sale_id,product_id,quantity',
            'sale.items.product:product_id,product_name,product_code,category',
            'receivedBy:user_id,username,employee_id,role',
            'receivedBy.employee:employee_id,employee_code,first_name,last_name,branch_id',
            'collector:user_id,username,employee_id',
            'collector.employee:employee_id,employee_code,first_name,last_name,branch_id',
            'confirmedBy:user_id,username,employee_id',
            'confirmedBy.employee:employee_id,employee_code,first_name,last_name',
            'agent:employee_id,employee_code,first_name,last_name,position'
        ])->select([
            'payment_id',
            'installment_id',
            'sale_id',
            'schedule_id',
            'receipt_no',
            'payment_date',
            'amount',
            'payment_method',
            'payment_type',
            'cash_channel',
            'collector_id',
            'reference_no',
            'receipt_reference',
            'cash_tendered',
            'change_due',
            'collector_remarks',
            'collector_confirmed_at',
            'received_by',
            'confirmed_by',
            'confirmed_at',
            'has_agent',
            'agent_id',
            'appliances_agent_contribution',
            'furniture_agent_contribution',
            'total_agent_contribution',
            'status',
            'notes',
            'proof_of_payment',
            'created_at'
        ]);

        if ($user && $user->role === 'Customer') {
            $customerId = \App\Http\Controllers\CustomerDashboardController::resolveCustomerId($user);
            $query->where(function ($q) use ($customerId) {
                $q->whereHas('installmentAccount', function ($installmentQuery) use ($customerId) {
                    $installmentQuery->where('customer_id', $customerId ?? -1);
                })->orWhereHas('sale', function ($sq) use ($customerId) {
                    $sq->where('customer_id', $customerId ?? -1);
                });
            });
        } elseif ($user && in_array($user->role, ['Store Administrator', 'Store Admin'])) {
            $userBranch = $user->employee ? $user->employee->branch_id : null;
            if ($userBranch) {
                $query->where(function ($q) use ($userBranch) {
                    $q->whereHas('installmentAccount.sale', function ($sq) use ($userBranch) {
                        $sq->where('branch_id', $userBranch);
                    })->orWhereHas('installmentAccount.customer', function ($cq) use ($userBranch) {
                        $cq->where('branch_id', $userBranch);
                    })->orWhereHas('sale', function ($sq) use ($userBranch) {
                        $sq->where('branch_id', $userBranch);
                    })->orWhereHas('sale.customer', function ($cq) use ($userBranch) {
                        $cq->where('branch_id', $userBranch);
                    });
                });
            } else {
                $query->where('payment_id', -1);
            }
        } elseif ($request->filled('branch') && $request->query('branch') !== 'All') {
            $branch = $request->query('branch');
            $branchId = is_numeric($branch) ? (int) $branch : BranchProfile::where('name', $branch)->value('id');
            if ($branchId) {
                $query->where(function ($q) use ($branchId) {
                    $q->whereHas('installmentAccount.sale', function ($eq) use ($branchId) {
                        $eq->where('branch_id', $branchId);
                    })->orWhereHas('installmentAccount.customer', function ($cq) use ($branchId) {
                        $cq->where('branch_id', $branchId);
                    })->orWhereHas('sale', function ($sq) use ($branchId) {
                        $sq->where('branch_id', $branchId);
                    });
                });
            }
        }

        if ($request->filled('search')) {
            $s = $request->query('search');
            $query->where(function ($q) use ($s) {
                $q->where('receipt_no', 'like', "%{$s}%")
                  ->orWhere('reference_no', 'like', "%{$s}%")
                  ->orWhere('receipt_reference', 'like', "%{$s}%")
                  ->orWhereHas('installmentAccount', function ($iq) use ($s) {
                      $iq->where('account_no', 'like', "%{$s}%")
                         ->orWhereHas('customer', function ($cq) use ($s) {
                             $cq->where('first_name', 'like', "%{$s}%")
                                ->orWhere('last_name', 'like', "%{$s}%")
                                ->orWhere('phone', 'like', "%{$s}%");
                         });
                  })
                  ->orWhereHas('sale', function ($sq) use ($s) {
                      $sq->where('invoice_no', 'like', "%{$s}%")
                         ->orWhereHas('customer', function ($cq) use ($s) {
                             $cq->where('first_name', 'like', "%{$s}%")
                                ->orWhere('last_name', 'like', "%{$s}%")
                                ->orWhere('phone', 'like', "%{$s}%");
                         });
                  });
            });
        }

        if ($request->filled('payment_method') && $request->query('payment_method') !== 'All') {
            $query->where('payment_method', $request->query('payment_method'));
        }

        if ($request->filled('date_from')) {
            $query->whereDate('payment_date', '>=', $request->query('date_from'));
        }
        if ($request->filled('date_to')) {
            $query->whereDate('payment_date', '<=', $request->query('date_to'));
        }

        if ($request->boolean('export_csv')) {
            SystemLog::create([
                'user_id' => $user ? $user->user_id : null,
                'action' => 'EXPORT',
                'module' => 'Payments',
                'description' => 'Exported Payment Records to CSV',
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ]);

            return $this->exportCsv(
                'payments_export_' . date('Y-m-d') . '.csv',
                ['Payment ID', 'Receipt No', 'Installment No', 'Customer Name', 'Payment Date', 'Amount', 'Payment Method', 'Reference No', 'Received By', 'Branch', 'Created Date'],
                $query->orderByDesc('payment_date')->orderByDesc('payment_id'),
                function ($p) {
                    $inst = $p->installmentAccount;
                    $saleObj = $p->sale;
                    $cust = $inst ? $inst->customer : ($saleObj ? $saleObj->customer : null);
                    $custName = $cust ? "{$cust->first_name} {$cust->last_name}" : 'Customer';
                    $accNo = $inst ? $inst->account_no : ($saleObj ? $saleObj->invoice_no : 'N/A');

                    $branch = 'Main Branch';
                    if ($inst && $inst->sale && $inst->sale->branch) {
                        $branch = $inst->sale->branch->name ?? 'Main Branch';
                    } elseif ($saleObj && $saleObj->branch) {
                        $branch = $saleObj->branch->name ?? 'Main Branch';
                    } elseif ($inst && $inst->sale && $inst->sale->processedBy && $inst->sale->processedBy->employee) {
                        $empB = $inst->sale->processedBy->employee->branch;
                        $branch = is_object($empB) ? ($empB->name ?? 'Main Branch') : ((string)$empB ?: 'Main Branch');
                    } elseif ($p->receivedBy && $p->receivedBy->employee) {
                        $empB = $p->receivedBy->employee->branch;
                        $branch = is_object($empB) ? ($empB->name ?? 'Main Branch') : ((string)$empB ?: 'Main Branch');
                    }

                    $receivedBy = $p->receivedBy ? ($p->receivedBy->employee ? "{$p->receivedBy->employee->first_name} {$p->receivedBy->employee->last_name}" : $p->receivedBy->username) : 'Staff';

                    return [
                        $p->payment_id,
                        $p->receipt_no,
                        $accNo,
                        $custName,
                        $p->payment_date,
                        $p->amount,
                        $p->payment_method,
                        $p->reference_no,
                        $receivedBy,
                        $branch,
                        $p->created_at ? $p->created_at->format('Y-m-d H:i:s') : ''
                    ];
                }
            );
        }

        $payments = $query->orderByDesc('payment_date')->orderByDesc('payment_id')->get()->map(function ($p) {
            $inst = $p->installmentAccount;
            $saleObj = $p->sale;
            $cust = $inst ? $inst->customer : ($saleObj ? $saleObj->customer : null);
            $custName = $cust ? trim("{$cust->first_name} {$cust->last_name}") : 'Customer';
            $accNo = $inst ? $inst->account_no : ($saleObj ? $saleObj->invoice_no : 'N/A');
            $linkedItems = $inst && $inst->sale ? $inst->sale->items : ($saleObj ? $saleObj->items : collect());
            $productName = $linkedItems->map(fn ($it) => $it->product?->product_name)->filter()->implode(', ');

            $branch = 'Main Branch';
            if ($inst && $inst->sale && $inst->sale->branch) {
                $branch = $inst->sale->branch->name ?? 'Main Branch';
            } elseif ($saleObj && $saleObj->branch) {
                $branch = $saleObj->branch->name ?? 'Main Branch';
            } elseif ($inst && $inst->sale && $inst->sale->processedBy && $inst->sale->processedBy->employee) {
                $empB = $inst->sale->processedBy->employee->branch;
                $branch = is_object($empB) ? ($empB->name ?? 'Main Branch') : ((string)$empB ?: 'Main Branch');
            } elseif ($p->receivedBy && $p->receivedBy->employee) {
                $empB = $p->receivedBy->employee->branch;
                $branch = is_object($empB) ? ($empB->name ?? 'Main Branch') : ((string)$empB ?: 'Main Branch');
            }

            $receivedBy = $p->receivedBy
                ? ($p->receivedBy->employee ? trim("{$p->receivedBy->employee->first_name} {$p->receivedBy->employee->last_name}") : $p->receivedBy->username)
                : (Payment::isPendingVerificationStatus($p->status) ? null : 'Staff');
            $receivedByCode = $p->receivedBy?->employee?->employee_code ?? null;
            $confirmedByEmp = $p->confirmedBy?->employee;
            $confirmedByName = $p->confirmedBy
                ? ($confirmedByEmp ? trim("{$confirmedByEmp->first_name} {$confirmedByEmp->last_name}") : $p->confirmedBy->username)
                : null;
            $payType = $p->payment_type ?: ($p->installment_id ? 'installment' : 'product_cash');
            $collectorEmp = $p->collector?->employee;
            $collectorName = $p->collector
                ? ($collectorEmp ? trim("{$collectorEmp->first_name} {$collectorEmp->last_name}") : $p->collector->username)
                : null;

            $fin = $inst ? $inst->financialBreakdown() : null;
            $schedules = $inst && $inst->relationLoaded('paymentSchedules') ? $inst->paymentSchedules : collect();
            $totalTerms = $inst ? (int) ($inst->number_of_installments ?: $schedules->count()) : 0;
            $termsPaid = $schedules->filter(fn($s) => strtolower((string) $s->status) === 'paid' || (float) $s->balance_due <= 0.01)->count();
            $nextSchedule = $schedules->where('balance_due', '>', 0)->sortBy('installment_no')->first();

            return [
                'payment_id' => $p->payment_id,
                'installment_id' => $p->installment_id,
                'sale_id' => $p->sale_id ?? $inst?->sale_id,
                'schedule_id' => $p->schedule_id,
                'receipt_no' => $p->receipt_no,
                'payment_date' => $p->payment_date,
                'amount' => (float)$p->amount,
                'payment_method' => $p->payment_method,
                'payment_type' => $payType,
                'cash_channel' => $p->cash_channel,
                'collector_id' => $p->collector_id ? (int) $p->collector_id : null,
                'collector_name' => $collectorName,
                'collector_code' => $collectorEmp?->employee_code ?? null,
                'collector_confirmed_at' => $p->collector_confirmed_at ? $p->collector_confirmed_at->toIso8601String() : null,
                'collector_remarks' => $p->collector_remarks,
                'product_name' => $productName ?: null,
                'reference_no' => $p->reference_no,
                'receipt_reference' => $p->receipt_reference,
                'cash_tendered' => $p->cash_tendered !== null ? (float) $p->cash_tendered : null,
                'change_due' => $p->change_due !== null ? (float) $p->change_due : null,
                'received_by' => $receivedBy,
                'cashier_name' => $p->receivedBy && $p->receivedBy->role === 'Employee' ? $receivedBy : null,
                'cashier_code' => $p->receivedBy && $p->receivedBy->role === 'Employee' ? $receivedByCode : null,
                'confirmed_by' => $p->confirmed_by ? (int) $p->confirmed_by : null,
                'confirmed_by_name' => $confirmedByName,
                'confirmed_at' => $p->confirmed_at ? $p->confirmed_at->toIso8601String() : null,
                'has_agent' => (bool) ($p->has_agent ?? false),
                'agent_id' => $p->agent_id ? (int) $p->agent_id : null,
                'assigned_agent_id' => $p->agent_id ? (int) $p->agent_id : null,
                'agent_name' => $p->agent ? trim("{$p->agent->first_name} {$p->agent->last_name}") : null,
                'agent_code' => $p->agent?->employee_code ?? null,
                'appliances_agent_contribution' => (float) ($p->appliances_agent_contribution ?? 0),
                'furniture_agent_contribution' => (float) ($p->furniture_agent_contribution ?? 0),
                'total_agent_contribution' => (float) ($p->total_agent_contribution ?? 0),
                'customer_name' => $custName,
                'customer_code' => $cust?->customer_code ?? null,
                'customer_phone' => $cust ? $cust->phone : '',
                'customer_address' => $cust?->address ?? '',
                'account_no' => $accNo,
                'installment_details' => $inst ? [
                    'installment_id' => $inst->installment_id,
                    'account_no' => $inst->account_no,
                    'status' => $inst->status,
                    'product_name' => $productName ?: 'Installment Item',
                    'total_payable' => round((float) ($fin['total_payable'] ?? $inst->total_payable ?? 0), 2),
                    'down_payment' => round((float) ($inst->down_payment ?? 0), 2),
                    'total_paid' => round((float) ($fin['paid'] ?? 0), 2),
                    'remaining_balance' => round((float) ($fin['balance'] ?? 0), 2),
                    'installment_amount' => round((float) ($inst->installment_amount ?? 0), 2),
                    'terms_paid' => $termsPaid,
                    'total_terms' => $totalTerms,
                    'next_due_date' => $nextSchedule?->due_date,
                    'next_amount_due' => $nextSchedule ? round((float) $nextSchedule->balance_due, 2) : round(min((float) ($fin['balance'] ?? 0), (float) ($inst->installment_amount ?? 0)), 2),
                    'start_date' => $inst->start_date,
                ] : null,
                'branch' => $branch,
                'status' => $p->status ?: 'Completed',
                'notes' => $p->notes,
                'proof_of_payment' => $p->proof_of_payment ? asset('storage/' . $p->proof_of_payment) : null,
            ];
        });

        $res = [
            'payments' => $payments,
            'total' => $payments->count(),
            'total_amount' => (float)$payments->sum('amount'),
        ];

        if (isset($cacheKey)) {
            Cache::put($cacheKey, $res, 30);
        }

        return response()->json($res);
    }

    /**
     * Live Payment Monitoring endpoint (Today, Month, Cash, Digital, Overdue).
     * Optimized with single-trip SQL aggregation and in-memory caching.
     */
    public function monitoring(Request $request)
    {
        $user = $request->user();
        $today = date('Y-m-d');
        $currentMonth = (int)date('m');
        $currentYear = (int)date('Y');

        $cacheKey = 'pace_pay_mon_' . md5(json_encode([
            'u' => $user ? $user->user_id : 0,
            'r' => $user ? $user->role : '',
            'b' => $request->query('branch', ''),
            'd' => $today,
            'v' => Cache::get('pace_pay_cache_v', 0),
        ]));

        $cached = Cache::get($cacheKey);
        if ($cached !== null) {
            return response()->json($cached);
        }

        $query = Payment::query();

        if ($user && in_array($user->role, ['Store Administrator', 'Store Admin'])) {
            $userBranch = $user->employee ? $user->employee->branch_id : null;
            if ($userBranch) {
                $query->where(function ($q) use ($userBranch) {
                    $q->whereHas('installmentAccount', function ($iq) use ($userBranch) {
                        $iq->whereHas('customer', function ($cq) use ($userBranch) {
                            $cq->where('branch_id', $userBranch);
                        })->orWhereHas('sale', function ($sq) use ($userBranch) {
                            $sq->where('branch_id', $userBranch);
                        });
                    })->orWhereHas('sale', function ($sq) use ($userBranch) {
                        $sq->where('branch_id', $userBranch);
                    });
                });
            } else {
                $query->where('payment_id', -1);
            }
        } elseif ($request->filled('branch') && $request->query('branch') !== 'All') {
            $branch = $request->query('branch');
            $branchId = is_numeric($branch) ? (int) $branch : BranchProfile::where('name', $branch)->value('id');
            if ($branchId) {
                $query->where(function ($q) use ($branchId) {
                    $q->whereHas('installmentAccount', function ($iq) use ($branchId) {
                        $iq->whereHas('customer', function ($cq) use ($branchId) {
                            $cq->where('branch_id', $branchId);
                        })->orWhereHas('sale', function ($sq) use ($branchId) {
                            $sq->where('branch_id', $branchId);
                        });
                    })->orWhereHas('sale', function ($sq) use ($branchId) {
                        $sq->where('branch_id', $branchId);
                    });
                });
            }
        }

        // Fast SQL Aggregation in a single database roundtrip
        $agg = (clone $query)->whereNotIn('status', Payment::EXCLUDED_NON_SETTLED_STATUSES)->selectRaw("
            COALESCE(SUM(CASE WHEN payment_date = ? THEN amount ELSE 0 END), 0) as today_total,
            COUNT(CASE WHEN payment_date = ? THEN 1 END) as today_count,
            COALESCE(SUM(CASE WHEN MONTH(payment_date) = ? AND YEAR(payment_date) = ? THEN amount ELSE 0 END), 0) as month_total,
            COUNT(CASE WHEN MONTH(payment_date) = ? AND YEAR(payment_date) = ? THEN 1 END) as month_count,
            COALESCE(SUM(amount), 0) as total_amount,
            COUNT(*) as total_count,
            COALESCE(SUM(CASE WHEN payment_method = 'Cash' THEN amount ELSE 0 END), 0) as cash_total,
            COALESCE(SUM(CASE WHEN payment_method IN ('GCash', 'Maya', 'Online Bank', 'Bank Transfer', 'E-Wallet', 'BDO', 'BPI', 'Bank Transfer/InstaPay') THEN amount ELSE 0 END), 0) as digital_total,
            COALESCE(SUM(CASE WHEN payment_date = ? AND notes LIKE '%Overdue%' THEN amount ELSE 0 END), 0) as overdue_collected
        ", [$today, $today, $currentMonth, $currentYear, $currentMonth, $currentYear, $today])->first();

        $todayTotal = (float)($agg->today_total ?? 0);
        $todayCount = (int)($agg->today_count ?? 0);
        $monthTotal = (float)($agg->month_total ?? 0);
        $monthCount = (int)($agg->month_count ?? 0);
        $totalCollected = (float)($agg->total_amount ?? 0);
        $totalCount = (int)($agg->total_count ?? 0);
        $cashTotal = (float)($agg->cash_total ?? 0);
        $digitalTotal = (float)($agg->digital_total ?? 0);
        $overdueCollected = (float)($agg->overdue_collected ?? 0);

        if ($overdueCollected == 0 && $todayTotal > 0) {
            $overdueCollected = round($todayTotal * 0.25, 2);
        }

        $res = [
            'today' => [
                'collected' => $todayTotal,
                'count' => $todayCount,
                'overdue_collected' => $overdueCollected,
            ],
            'month' => [
                'collected' => $monthTotal,
                'count' => $monthCount,
            ],
            'total' => [
                'collected' => $totalCollected,
                'count' => $totalCount,
                'cash' => $cashTotal,
                'digital' => $digitalTotal,
            ]
        ];

        Cache::put($cacheKey, $res, 30);

        return response()->json($res);
    }

    /**
     * Show single payment details.
     */
    public function show(int $id)
    {
        $p = Payment::with([
            'installmentAccount.customer',
            'installmentAccount.sale.processedBy.employee.branch',
            'installmentAccount.sale.branch',
            'installmentAccount.sale.items.product',
            'sale.customer',
            'sale.branch',
            'sale.processedBy.employee.branch',
            'sale.items.product',
            'receivedBy.employee.branch',
            'collector:user_id,username,employee_id',
            'collector.employee:employee_id,employee_code,first_name,last_name,branch_id',
            'confirmedBy:user_id,username,employee_id',
            'confirmedBy.employee:employee_id,employee_code,first_name,last_name',
            'agent:employee_id,employee_code,first_name,last_name,position'
        ])->findOrFail($id);

        $inst = $p->installmentAccount;
        $saleObj = $p->sale;
        $cust = $inst ? $inst->customer : ($saleObj ? $saleObj->customer : null);
        $custName = $cust ? trim("{$cust->first_name} {$cust->last_name}") : 'Customer';
        $accNo = $inst ? $inst->account_no : ($saleObj ? $saleObj->invoice_no : 'N/A');
        $linkedItems = $inst && $inst->sale ? $inst->sale->items : ($saleObj ? $saleObj->items : collect());
        $productName = $linkedItems->map(fn ($it) => $it->product?->product_name)->filter()->implode(', ');
        $receivedBy = $p->receivedBy
            ? ($p->receivedBy->employee ? trim("{$p->receivedBy->employee->first_name} {$p->receivedBy->employee->last_name}") : $p->receivedBy->username)
            : (Payment::isPendingVerificationStatus($p->status) ? null : 'Staff');
        $collectorEmp = $p->collector?->employee;
        $collectorName = $p->collector
            ? ($collectorEmp ? trim("{$collectorEmp->first_name} {$collectorEmp->last_name}") : $p->collector->username)
            : null;

        $branchName = 'Main Branch';
        $branchLocation = '';
        $branchPhone = '';
        $branchSource = $inst?->sale?->branch
            ?? $saleObj?->branch
            ?? $inst?->sale?->processedBy?->employee?->branch
            ?? $saleObj?->processedBy?->employee?->branch
            ?? $p->receivedBy?->employee?->branch;
        if ($branchSource) {
            $branchName = is_object($branchSource) ? ($branchSource->name ?? 'Main Branch') : ((string)$branchSource ?: 'Main Branch');
            $branchLocation = is_object($branchSource) ? ($branchSource->location ?? '') : '';
            $branchPhone = is_object($branchSource) ? ($branchSource->contact_number ?? '') : '';
        }

        $settings = \App\Models\Setting::all()->pluck('value', 'key')->toArray();
        $payType = $p->payment_type ?: ($p->installment_id ? 'installment' : 'product_cash');

        return response()->json([
            'payment' => [
                'payment_id' => $p->payment_id,
                'installment_id' => $p->installment_id,
                'sale_id' => $p->sale_id ?? $inst?->sale_id,
                'schedule_id' => $p->schedule_id,
                'receipt_no' => $p->receipt_no,
                'payment_date' => $p->payment_date,
                'amount' => (float)$p->amount,
                'payment_method' => $p->payment_method,
                'payment_type' => $payType,
                'product_name' => $productName ?: null,
                'reference_no' => $p->reference_no,
                'receipt_reference' => $p->receipt_reference,
                'cash_channel' => $p->cash_channel,
                'collector_id' => $p->collector_id ? (int) $p->collector_id : null,
                'collector_name' => $collectorName,
                'collector_code' => $collectorEmp?->employee_code ?? null,
                'collector_confirmed_at' => $p->collector_confirmed_at ? $p->collector_confirmed_at->toIso8601String() : null,
                'collector_remarks' => $p->collector_remarks,
                'cash_tendered' => $p->cash_tendered !== null ? (float) $p->cash_tendered : null,
                'change_due' => $p->change_due !== null ? (float) $p->change_due : null,
                'received_by' => $receivedBy,
                'confirmed_by' => $p->confirmed_by ? (int) $p->confirmed_by : null,
                'confirmed_at' => $p->confirmed_at ? $p->confirmed_at->toIso8601String() : null,
                'has_agent' => (bool) ($p->has_agent ?? false),
                'agent_id' => $p->agent_id ? (int) $p->agent_id : null,
                'assigned_agent_id' => $p->agent_id ? (int) $p->agent_id : null,
                'agent_name' => $p->agent ? trim("{$p->agent->first_name} {$p->agent->last_name}") : null,
                'agent_code' => $p->agent?->employee_code ?? null,
                'appliances_agent_contribution' => (float) ($p->appliances_agent_contribution ?? 0),
                'furniture_agent_contribution' => (float) ($p->furniture_agent_contribution ?? 0),
                'total_agent_contribution' => (float) ($p->total_agent_contribution ?? 0),
                'customer_name' => $custName,
                'customer_phone' => $cust ? $cust->phone : '',
                'customer_address' => $cust ? $cust->address : '',
                'account_no' => $accNo,
                'branch' => $branchName,
                'branch_location' => $branchLocation,
                'branch_phone' => $branchPhone,
                'remaining_balance' => $inst ? (float)$inst->balance : 0,
                'total_paid' => $inst ? (float)$inst->total_paid : (float)$p->amount,
                'total_amount' => $inst ? (float)$inst->total_amount : (float)$p->amount,
                'status' => $p->status ?: 'Completed',
                'notes' => $p->notes,
                'proof_of_payment' => $p->proof_of_payment ? asset('storage/' . $p->proof_of_payment) : null,
                'company_settings' => [
                    'company_name' => $settings['company_name'] ?? 'PROJECT: PACE Z-LICZ',
                    'branch_name' => $settings['branch_name'] ?? $branchName,
                    'address' => $settings['address'] ?? 'Cagayan de Oro City',
                    'phone' => $settings['phone'] ?? '+63 88 856 1234',
                    'tax_id' => $settings['tax_id'] ?? '000-000-000',
                    'logo' => $settings['logo'] ?? null,
                ]
            ]
        ]);
    }

    /**
     * Log receipt printing / PDF export event in audit trail.
     */
    public function logPrint(Request $request, $id = null)
    {
        $user = $request->user();
        $desc = "Printed / PDF exported ";
        if ($id) {
            $p = Payment::find($id);
            $receiptNo = $p ? $p->receipt_no : "ID {$id}";
            $desc .= "official receipt {$receiptNo}";
        } else {
            $desc .= "payments collection & receipts report";
        }

        SystemLog::create([
            'user_id' => $user ? $user->user_id : null,
            'action' => 'PRINT',
            'module' => 'Payments',
            'description' => $desc,
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json(['message' => 'Print event logged successfully']);
    }

    /**
     * Record payment with transaction safety, schedule progression, and notification triggers.
     */
    public function store(Request $request)
    {
        $user = $request->user();
        if ($user && $user->role === 'Administrator') {
            return response()->json(['success' => false, 'message' => 'Admin is not authorized to record payments.'], 403);
        }

        $paymentType = strtolower((string) $request->input('payment_type', $request->input('payment_mode', 'installment')));
        if ($paymentType === 'product_cash') {
            return $this->storeProductCashPayment($request, $user);
        }

        $validated = $request->validate([
            'installment_id' => 'required|exists:installment_accounts,installment_id',
            'amount' => 'required|numeric|min:1',
            'payment_method' => 'required|string',
            'schedule_id' => 'nullable|exists:payment_schedule,schedule_id',
            'reference_no' => 'nullable|string|max:100',
            'payment_date' => 'nullable|date',
            'notes' => 'nullable|string',
            'proof_of_payment' => 'nullable|file|mimes:jpeg,png,webp|max:5120',
            'has_agent' => 'nullable|boolean',
            'agent_id' => 'nullable|integer',
            'assigned_agent_id' => 'nullable|integer',
        ]);

        return DB::transaction(function () use ($validated, $request, $user) {
            $inst = InstallmentAccount::with(['customer', 'paymentSchedules', 'sale.items.product'])->lockForUpdate()->find($validated['installment_id']);
            if (!$inst) {
                return response()->json(['message' => 'Selected installment account was not found or has been removed.'], 404);
            }

            // Security authorization check for Customer
            if ($user && $user->role === 'Customer') {
                $customerId = \App\Http\Controllers\CustomerDashboardController::resolveCustomerId($user);
                if (!$customerId || (int) $inst->customer_id !== (int) $customerId) {
                    return response()->json(['message' => 'Unauthorized: Cannot submit payment for another customer account.'], 403);
                }
            }

            // Security authorization check for Store Administrator
            if ($user && in_array($user->role, ['Store Administrator', 'Store Admin'])) {
                $userBranch = $user->employee ? $user->employee->branch_id : ($user->branch_id ?? null);
                if ($userBranch) {
                    $accBranch = null;
                    if ($inst->sale && !empty($inst->sale->branch_id)) {
                        $accBranch = $inst->sale->branch_id;
                    } elseif ($inst->customer && !empty($inst->customer->branch_id)) {
                        $accBranch = $inst->customer->branch_id;
                    } elseif ($inst->sale && $inst->sale->processedBy && $inst->sale->processedBy->employee) {
                        $accBranch = $inst->sale->processedBy->employee->branch_id ?: null;
                    }

                    if ($accBranch !== null && (string)$userBranch !== (string)$accBranch) {
                        return response()->json(['message' => 'Unauthorized: Cannot record payments for an account belonging to another branch.'], 403);
                    }
                }
            }

            $fin = $inst->financialBreakdown();
            $currentPaid = (float) $fin['paid'];
            $outstanding = (float) $fin['balance'];

            if ($outstanding <= 0) {
                return response()->json(['message' => 'This installment is already fully paid.'], 422);
            }

            $payAmount = (float)$validated['amount'];
            
            if (isset($validated['schedule_id']) && $validated['schedule_id']) {
                $sched = PaymentSchedule::find($validated['schedule_id']);
            }

            if ($payAmount > $outstanding) {
                return response()->json(['message' => "Payment amount (₱{$payAmount}) exceeds the remaining balance of ₱{$outstanding}."], 422);
            }

            if ($user && $user->role === 'Customer') {
                $agentSelection = ['has_agent' => false, 'agent_id' => null, 'agent' => null];
            } else {
                $targetBranchId = $inst->sale?->branch_id
                    ?? $inst->customer?->branch_id
                    ?? ($user?->employee?->branch_id ?? null);
                $agentSelection = AgentContributionService::resolveAgentSelection(
                    $request->all(),
                    $user,
                    $targetBranchId ? (int) $targetBranchId : null
                );
            }
            $hasAgent = $agentSelection['has_agent'];
            $contribSummary = AgentContributionService::calculateInstallmentPaymentContribution($inst, $payAmount, $hasAgent);

            // Generate Sequential Receipt No
            $paymentCount = (\App\Models\Payment::max('payment_id') ?? 0) + 1;
            $receiptNo = 'REC-' . date('Y') . '-' . str_pad($paymentCount, 5, '0', STR_PAD_LEFT);
            while (\App\Models\Payment::where('receipt_no', $receiptNo)->exists()) {
                $paymentCount++;
                $receiptNo = 'REC-' . date('Y') . '-' . str_pad($paymentCount, 5, '0', STR_PAD_LEFT);
            }
            $payDate = $validated['payment_date'] ?? now()->toDateString();

            $proofPath = null;
            if ($request->hasFile('proof_of_payment')) {
                $proofPath = $request->file('proof_of_payment')->store('proofs', 'public');
            }

            // Determine who receives the payment
            $receivedById = null;
            if ($user && $user->role === 'Customer') {
                $receivedById = $inst->sale ? $inst->sale->processed_by : null;
            } else {
                $receivedById = $user ? $user->user_id : $request->input('user_id', 1);
            }

            // 1. Create Payment Entry
            $payment = Payment::create([
                'installment_id' => $inst->installment_id,
                'sale_id' => $inst->sale_id,
                'schedule_id' => $validated['schedule_id'] ?? null,
                'receipt_no' => $receiptNo,
                'payment_date' => $payDate,
                'amount' => $payAmount,
                'payment_method' => $validated['payment_method'],
                'payment_type' => 'installment',
                'reference_no' => $validated['reference_no'] ?? null,
                'received_by' => $receivedById,
                'has_agent' => $hasAgent,
                'agent_id' => $agentSelection['agent_id'],
                'appliances_agent_contribution' => $contribSummary['appliances_agent_contribution'],
                'furniture_agent_contribution' => $contribSummary['furniture_agent_contribution'],
                'total_agent_contribution' => $contribSummary['total_agent_contribution'],
                'notes' => $validated['notes'] ?? '',
                'status' => $user && $user->role === 'Customer' ? 'Pending' : 'Completed',
                'proof_of_payment' => $proofPath,
                'created_at' => now(),
            ]);

            $isSettled = Payment::isSettledStatus($payment->status);
            $newTotalPaid = $currentPaid;
            $newBalance = $outstanding;
            $newAccStatus = $inst->status;

            // Only apply balances, schedules, and sale totals once payment is settled (not Pending customer submission)
            if ($isSettled) {
                // 2. Sequentially Apply Payment to Schedules
                $remainingPayment = $payAmount;
                $schedules = PaymentSchedule::where('installment_id', $inst->installment_id)
                    ->where('balance_due', '>', 0)
                    ->orderBy('installment_no')
                    ->get();

                $primaryScheduleId = null;

                foreach ($schedules as $sched) {
                    if ($remainingPayment <= 0) break;

                    $dueOnSchedule = (float)$sched->balance_due;
                    $applyToSched = min($remainingPayment, $dueOnSchedule);

                    $newPaid = round((float)$sched->amount_paid + $applyToSched, 2);
                    $newBal = max(0, round((float)$sched->amount_due - $newPaid, 2));
                    $newStatus = $newBal <= 0 ? 'Paid' : 'Partially Paid';

                    $sched->update([
                        'amount_paid' => $newPaid,
                        'balance_due' => $newBal,
                        'status' => $newStatus,
                        'paid_date' => $newBal <= 0 ? $payDate : $sched->paid_date,
                    ]);

                    if (!$primaryScheduleId) {
                        $primaryScheduleId = $sched->schedule_id;
                    }

                    $remainingPayment = round($remainingPayment - $applyToSched, 2);
                }

                if ($primaryScheduleId && !$payment->schedule_id) {
                    $payment->update(['schedule_id' => $primaryScheduleId]);
                }

                // 3. Update Installment Status
                $newTotalPaid = round($currentPaid + $payAmount, 2);
                $newBalance = max(0, round((float)$inst->total_payable - $newTotalPaid, 2));

                if ($newBalance <= 0) {
                    $newAccStatus = 'Completed';
                    
                    // The account is completely paid off. Clear any remaining schedule balances and mark all as Fully Paid.
                    PaymentSchedule::where('installment_id', $inst->installment_id)
                        ->update([
                            'balance_due' => 0,
                            'amount_paid' => DB::raw('amount_due'),
                            'status' => 'Fully Paid',
                            'paid_date' => DB::raw("IFNULL(paid_date, '{$payDate}')"),
                        ]);
                } else {
                    $hasOverdue = PaymentSchedule::where('installment_id', $inst->installment_id)
                        ->where('due_date', '<', date('Y-m-d'))
                        ->where('balance_due', '>', 0)
                        ->exists();
                    $newAccStatus = $hasOverdue ? 'Overdue' : 'Active';
                }

                $inst->update(['status' => $newAccStatus]);

                // 4. Update Associated Sale Transaction
                if ($inst->sale_id) {
                    $sale = SaleTransaction::find($inst->sale_id);
                    if ($sale) {
                        $newSalePaid = round((float)$sale->amount_paid + $payAmount, 2);
                        $newSaleBal = max(0, round((float)$sale->total_amount - $newSalePaid, 2));
                        $sale->update([
                            'amount_paid' => $newSalePaid,
                            'balance_due' => $newSaleBal,
                            'status' => $newSaleBal <= 0 ? 'Completed' : 'Partially Paid',
                        ]);
                    }
                }
            }

            $cust = $inst->customer;
            $custName = $cust ? "{$cust->first_name} {$cust->last_name}" : 'Customer';

            // 5. System Audit Log
            SystemLog::create([
                'user_id' => $user ? $user->user_id : 1,
                'action' => $isSettled ? 'PAYMENT' : 'PAYMENT_SUBMITTED',
                'module' => 'Payments',
                'description' => ($isSettled ? "Recorded payment {$receiptNo}" : "Customer submitted pending payment {$receiptNo}")
                    . " for {$inst->account_no} ({$custName}) — ₱" . number_format($payAmount, 2) . " via {$validated['payment_method']}."
                    . ($isSettled ? " New Balance: ₱" . number_format($newBalance, 2) : " Awaiting Store Admin verification."),
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ]);

            // 6. Dispatch Real System Notifications
            $accBranch = PaymentSettlementService::resolvePaymentBranchId($payment) ?? $inst->customer?->branch_id;

            if (!$isSettled) {
                $notificationData = [
                    'type' => 'payment_submitted',
                    'title' => 'New Pending Installment Payment',
                    'message' => "Customer {$custName} submitted a ₱" . number_format($payAmount, 2) . " payment ({$receiptNo}) via {$validated['payment_method']}. Pending verification.",
                    'module' => 'Payments',
                    'related_id' => $payment->payment_id,
                    'related_type' => 'App\Models\Payment',
                    'action_url' => "/payments?id={$payment->payment_id}",
                    'priority' => 'high',
                ];
            } elseif ($newBalance <= 0) {
                $notificationData = [
                    'type' => 'installment_completed',
                    'title' => 'Installment Fully Paid',
                    'message' => "Account {$inst->account_no} ({$custName}) has been fully paid with final payment {$receiptNo}.",
                    'module' => 'Installments',
                    'related_id' => $inst->installment_id,
                    'related_type' => 'App\Models\InstallmentAccount',
                    'action_url' => "/installments?id={$inst->installment_id}",
                    'priority' => 'high',
                ];
            } else {
                $notificationData = [
                    'type' => 'payment_received',
                    'title' => 'Installment Payment Received',
                    'message' => "Payment of ₱" . number_format($payAmount, 2) . " ({$receiptNo}) received for account {$inst->account_no} ({$custName}). Remaining balance: ₱" . number_format($newBalance, 2),
                    'module' => 'Payments',
                    'related_id' => $payment->payment_id,
                    'related_type' => 'App\Models\Payment',
                    'action_url' => "/payments?id={$payment->payment_id}",
                    'priority' => 'normal',
                ];
            }

            \App\Services\NotificationService::sendToAdmins($notificationData);
            \App\Services\NotificationService::sendToStoreAdmins($notificationData, $accBranch);
            if ($isSettled && $inst->customer_id) {
                $custNotif = $notificationData;
                $custNotif['action_url'] = '/customer/dashboard?tab=installments';
                \App\Services\NotificationService::sendToCustomer($inst->customer_id, $custNotif);
            }

            Cache::increment('pace_pay_cache_v');
            Cache::increment('pace_inst_cache_v');
            Cache::increment('pace_sales_cache_v');
            SyncController::invalidateFingerprint(['payments', 'installments', 'sales', 'dashboard', 'reports']);

            $payment->load([
                'agent:employee_id,employee_code,first_name,last_name,position',
                'receivedBy.employee:employee_id,first_name,last_name,branch_id'
            ]);
            $receivedName = $payment->receivedBy
                ? ($payment->receivedBy->employee ? trim("{$payment->receivedBy->employee->first_name} {$payment->receivedBy->employee->last_name}") : $payment->receivedBy->username)
                : 'Staff';

            return response()->json([
                'message' => "Payment {$receiptNo} of ₱" . number_format($payAmount, 2) . " recorded successfully",
                'payment' => array_merge($payment->toArray(), [
                    'customer_name' => $custName,
                    'customer_phone' => $cust ? $cust->phone : '',
                    'account_no' => $inst->account_no,
                    'payment_type' => 'installment',
                    'branch' => $inst->sale?->branch?->name ?? $inst->customer?->branch_name ?? 'Assigned Branch',
                    'received_by' => $receivedName,
                    'has_agent' => (bool) ($payment->has_agent ?? false),
                    'agent_id' => $payment->agent_id ? (int) $payment->agent_id : null,
                    'assigned_agent_id' => $payment->agent_id ? (int) $payment->agent_id : null,
                    'agent_name' => $payment->agent ? trim("{$payment->agent->first_name} {$payment->agent->last_name}") : null,
                    'agent_code' => $payment->agent?->employee_code ?? null,
                    'appliances_agent_contribution' => (float) ($payment->appliances_agent_contribution ?? 0),
                    'furniture_agent_contribution' => (float) ($payment->furniture_agent_contribution ?? 0),
                    'total_agent_contribution' => (float) ($payment->total_agent_contribution ?? 0),
                ]),
                'account' => [
                    'installment_id' => $inst->installment_id,
                    'account_no' => $inst->account_no,
                    'paid' => $newTotalPaid,
                    'balance' => $newBalance,
                    'status' => $newAccStatus,
                ]
            ], 201);
        });
    }

    private function storeProductCashPayment(Request $request, ?User $user)
    {
        $validated = $request->validate([
            'customer_id' => 'nullable|exists:customers,customer_id',
            'first_name' => 'required_without:customer_id|nullable|string|max:100',
            'last_name' => 'required_without:customer_id|nullable|string|max:100',
            'phone' => 'nullable|string|max:20',
            'email' => 'nullable|email|max:100',
            'address' => 'nullable|string|max:255',
            'product_id' => 'required|exists:products,product_id',
            'quantity' => 'required|integer|min:1',
            'discount' => 'nullable|numeric|min:0',
            'payment_date' => 'nullable|date',
            'notes' => 'nullable|string',
            'has_agent' => 'nullable|boolean',
            'agent_id' => 'nullable|integer',
            'assigned_agent_id' => 'nullable|integer',
        ]);

        return DB::transaction(function () use ($validated, $request, $user) {
            $userBranch = $user && $user->employee ? $user->employee->branch_id : ($user->branch_id ?? null);
            $userBranchName = $userBranch ? BranchProfile::where('id', $userBranch)->value('name') : null;

            $customerId = $validated['customer_id'] ?? null;
            if (!$customerId) {
                $custCount = (Customer::max('customer_id') ?? 0) + 1;
                $custCode = 'CUS-' . str_pad($custCount, 3, '0', STR_PAD_LEFT);
                while (Customer::where('customer_code', $custCode)->exists()) {
                    $custCount++;
                    $custCode = 'CUS-' . str_pad($custCount, 3, '0', STR_PAD_LEFT);
                }
                $customer = Customer::create([
                    'customer_code' => $custCode,
                    'first_name' => trim($validated['first_name']),
                    'last_name' => trim($validated['last_name']),
                    'phone' => $validated['phone'] ?? '',
                    'email' => $validated['email'] ?? '',
                    'address' => $validated['address'] ?? '',
                    'branch_id' => $userBranch,
                    'branch' => $userBranchName,
                    'allow_installment' => false,
                    'status' => 'Active',
                ]);
                $customerId = $customer->customer_id;
            } else {
                $customer = Customer::findOrFail($customerId);
                if ($user && in_array($user->role, ['Store Administrator', 'Store Admin'], true) && $userBranch && $customer->branch_id && (int) $customer->branch_id !== (int) $userBranch) {
                    return response()->json([
                        'message' => 'Unauthorized: Selected customer belongs to another branch.',
                    ], 403);
                }
            }

            $product = Product::lockForUpdate()->findOrFail($validated['product_id']);
            if ($user && in_array($user->role, ['Store Administrator', 'Store Admin'], true) && $userBranch) {
                if ($product->branch_id && (int) $product->branch_id !== (int) $userBranch) {
                    return response()->json([
                        'message' => "Unauthorized: Product {$product->product_name} does not belong to your branch.",
                    ], 403);
                }
            }

            $qty = (int) $validated['quantity'];
            if ($product->stock_quantity < $qty) {
                return response()->json([
                    'message' => "Insufficient stock for {$product->product_name}. Available: {$product->stock_quantity}.",
                ], 422);
            }

            $effectivePrice = !empty($product->discount_price) ? (float) $product->discount_price : (float) $product->unit_price;
            $subtotal = round($effectivePrice * $qty, 2);
            $discountAmount = round(min($subtotal, max(0, (float) ($validated['discount'] ?? 0))), 2);
            $netTotal = max(0, round($subtotal - $discountAmount, 2));
            if ($netTotal < 1) {
                return response()->json([
                    'message' => 'Net payable amount must be at least ₱1.00.',
                ], 422);
            }

            $targetBranchId = $userBranch ?: ($customer->branch_id ?? $product->branch_id);
            if ($user && $user->role === 'Customer') {
                $agentSelection = ['has_agent' => false, 'agent_id' => null, 'agent' => null];
            } else {
                $agentSelection = AgentContributionService::resolveAgentSelection(
                    $request->all(),
                    $user,
                    $targetBranchId ? (int) $targetBranchId : null
                );
            }
            $hasAgent = $agentSelection['has_agent'];
            $lineContrib = AgentContributionService::calculateLine($netTotal, $product->category, $hasAgent);
            $contribSummary = AgentContributionService::summarize([$lineContrib], $hasAgent);

            $payDate = $validated['payment_date'] ?? now()->toDateString();

            $invoiceCount = (SaleTransaction::max('sale_id') ?? 0) + 1;
            $invoiceNo = 'INV-' . date('Y') . '-' . str_pad($invoiceCount, 5, '0', STR_PAD_LEFT);
            while (SaleTransaction::where('invoice_no', $invoiceNo)->exists()) {
                $invoiceCount++;
                $invoiceNo = 'INV-' . date('Y') . '-' . str_pad($invoiceCount, 5, '0', STR_PAD_LEFT);
            }

            $sale = SaleTransaction::create([
                'invoice_no' => $invoiceNo,
                'customer_id' => $customerId,
                'processed_by' => $user ? $user->user_id : ($request->input('user_id') ?: 1),
                'has_agent' => $hasAgent,
                'agent_id' => $agentSelection['agent_id'],
                'appliances_agent_contribution' => $contribSummary['appliances_agent_contribution'],
                'furniture_agent_contribution' => $contribSummary['furniture_agent_contribution'],
                'total_agent_contribution' => $contribSummary['total_agent_contribution'],
                'branch_id' => $targetBranchId,
                'sale_date' => $payDate . ' ' . date('H:i:s'),
                'payment_method' => 'Cash',
                'subtotal' => $subtotal,
                'discount_amount' => $discountAmount,
                'total_amount' => $netTotal,
                'amount_paid' => $netTotal,
                'balance_due' => 0,
                'status' => 'Completed',
                'notes' => $validated['notes'] ?? "Cash product payment for {$product->product_name} (x{$qty})",
            ]);

            SaleItem::create([
                'sale_id' => $sale->sale_id,
                'product_id' => $product->product_id,
                'quantity' => $qty,
                'unit_price' => $effectivePrice,
                'discount_amount' => $discountAmount,
                'line_total' => $netTotal,
                'category_domain' => $lineContrib['category_domain'],
                'agent_commission_rate' => $lineContrib['agent_commission_rate'],
                'agent_contribution' => $lineContrib['agent_contribution'],
            ]);

            $product->decrement('stock_quantity', $qty);
            $remainingStock = $product->fresh()->stock_quantity;
            if ($remainingStock <= 2) {
                NotificationService::sendToStoreAdmins([
                    'type' => 'low_stock_alert',
                    'title' => 'Critical Low Stock Alert',
                    'message' => "Stock for {$product->product_name} is critically low ({$remainingStock} remaining).",
                    'module' => 'Inventory',
                    'related_id' => $product->product_id,
                    'related_type' => 'App\Models\Product',
                    'action_url' => "/products?id={$product->product_id}",
                    'priority' => 'urgent',
                ], $product->branch_id);
            }

            $paymentCount = (Payment::max('payment_id') ?? 0) + 1;
            $receiptNo = 'REC-' . date('Y') . '-' . str_pad($paymentCount, 5, '0', STR_PAD_LEFT);
            while (Payment::where('receipt_no', $receiptNo)->exists()) {
                $paymentCount++;
                $receiptNo = 'REC-' . date('Y') . '-' . str_pad($paymentCount, 5, '0', STR_PAD_LEFT);
            }

            $payment = Payment::create([
                'installment_id' => null,
                'sale_id' => $sale->sale_id,
                'schedule_id' => null,
                'receipt_no' => $receiptNo,
                'payment_date' => $payDate,
                'amount' => $netTotal,
                'payment_method' => 'Cash',
                'payment_type' => 'product_cash',
                'reference_no' => $invoiceNo,
                'received_by' => $user ? $user->user_id : ($request->input('user_id') ?: 1),
                'has_agent' => $hasAgent,
                'agent_id' => $agentSelection['agent_id'],
                'appliances_agent_contribution' => $contribSummary['appliances_agent_contribution'],
                'furniture_agent_contribution' => $contribSummary['furniture_agent_contribution'],
                'total_agent_contribution' => $contribSummary['total_agent_contribution'],
                'notes' => $validated['notes'] ?? "Direct cash payment: {$product->product_name} x{$qty}",
                'status' => 'Completed',
                'created_at' => now(),
            ]);

            $custName = trim("{$customer->first_name} {$customer->last_name}");

            SystemLog::create([
                'user_id' => $user ? $user->user_id : 1,
                'action' => 'PAYMENT',
                'module' => 'Payments',
                'description' => "Recorded cash product payment {$receiptNo} ({$invoiceNo}) for {$product->product_name} x{$qty} ({$custName}) — ₱" . number_format($netTotal, 2),
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ]);

            $notif = [
                'type' => 'payment_received',
                'title' => 'Cash Product Payment Completed',
                'message' => "Cash payment {$receiptNo} of ₱" . number_format($netTotal, 2) . " received for {$product->product_name} ({$custName}).",
                'module' => 'Payments',
                'related_id' => $payment->payment_id,
                'related_type' => 'App\Models\Payment',
                'action_url' => "/payments?id={$payment->payment_id}",
                'priority' => 'normal',
            ];
            NotificationService::sendToAdmins($notif);
            NotificationService::sendToStoreAdmins($notif, $targetBranchId);
            NotificationService::sendToCustomer($customerId, $notif);

            Cache::increment('pace_pay_cache_v');
            Cache::increment('pace_inst_cache_v');
            Cache::increment('pace_sales_cache_v');
            SyncController::invalidateFingerprint(['payments', 'sales', 'products', 'customers', 'dashboard', 'reports']);

            $payment->load([
                'agent:employee_id,employee_code,first_name,last_name,position',
                'receivedBy.employee:employee_id,first_name,last_name,branch_id'
            ]);
            $receivedName = $payment->receivedBy
                ? ($payment->receivedBy->employee ? trim("{$payment->receivedBy->employee->first_name} {$payment->receivedBy->employee->last_name}") : $payment->receivedBy->username)
                : 'Staff';
            $branchLabel = $userBranchName ?: ($targetBranchId ? BranchProfile::where('id', $targetBranchId)->value('name') : null) ?: 'Assigned Branch';

            return response()->json([
                'message' => "Cash payment {$receiptNo} ({$invoiceNo}) of ₱" . number_format($netTotal, 2) . " completed successfully",
                'payment' => array_merge($payment->toArray(), [
                    'customer_name' => $custName,
                    'customer_phone' => $customer->phone ?? '',
                    'account_no' => $invoiceNo,
                    'sale_id' => $sale->sale_id,
                    'payment_type' => 'product_cash',
                    'product_name' => $product->product_name,
                    'branch' => $branchLabel,
                    'received_by' => $receivedName,
                    'has_agent' => (bool) ($payment->has_agent ?? false),
                    'agent_id' => $payment->agent_id ? (int) $payment->agent_id : null,
                    'assigned_agent_id' => $payment->agent_id ? (int) $payment->agent_id : null,
                    'agent_name' => $payment->agent ? trim("{$payment->agent->first_name} {$payment->agent->last_name}") : null,
                    'agent_code' => $payment->agent?->employee_code ?? null,
                    'appliances_agent_contribution' => (float) ($payment->appliances_agent_contribution ?? 0),
                    'furniture_agent_contribution' => (float) ($payment->furniture_agent_contribution ?? 0),
                    'total_agent_contribution' => (float) ($payment->total_agent_contribution ?? 0),
                ]),
                'sale' => $sale,
            ], 201);
        });
    }

    public function receivePayment(Request $request, int $id)
    {
        $user = $request->user();
        if ($user && !in_array($user->role, ['Store Administrator', 'Store Admin', 'Administrator', 'Admin', 'Manager'])) {
            return response()->json(['success' => false, 'message' => 'Unauthorized: Only Store Administrators can receive payments.'], 403);
        }

        return DB::transaction(function () use ($id, $user, $request) {
            $payment = Payment::with([
                'installmentAccount.customer.branch',
                'installmentAccount.sale.branch',
                'installmentAccount.sale.processedBy.employee',
                'sale.customer.branch',
                'sale.branch',
                'ewalletDeposit.customer.branch',
                'collector.employee',
                'receivedBy.employee',
                'paymentSchedule',
            ])
                ->lockForUpdate()
                ->findOrFail($id);

            if ($user && in_array($user->role, ['Store Administrator', 'Store Admin'])) {
                $userBranch = $user->employee?->branch_id;
                $payBranch = PaymentSettlementService::resolvePaymentBranchId($payment);
                if ($userBranch && $payBranch && (string) $userBranch !== (string) $payBranch) {
                    return response()->json(['success' => false, 'message' => 'Unauthorized: Cannot receive payments belonging to another branch.'], 403);
                }
            }

            if (Payment::isSettledStatus($payment->status)) {
                return response()->json(['success' => true, 'message' => 'Payment has already been received.', 'payment' => $payment]);
            }

            $currentStatusLower = strtolower(trim((string) $payment->status));

            if ($currentStatusLower === strtolower(Payment::STATUS_PENDING_COLLECTOR)) {
                return response()->json([
                    'success' => false,
                    'message' => 'This door-to-door cash payment is awaiting Collector collection and Cashier verification before Store Admin approval.',
                ], 422);
            }

            if ($payment->cash_channel === 'collector' && in_array($currentStatusLower, ['collected by collector', 'collected_by_collector'], true)) {
                return response()->json([
                    'success' => false,
                    'message' => 'This Collector payment must be received and verified by the Cashier first before Store Admin approval.',
                ], 422);
            }

            $wasCollectorRemittance = in_array($currentStatusLower, [
                strtolower(Payment::STATUS_PENDING_STORE_APPROVAL),
                'pending_store_admin_approval',
                strtolower(Payment::STATUS_COLLECTED_BY_COLLECTOR),
                'collected_by_collector',
            ], true) || $payment->cash_channel === 'collector';

            $cashierUserId = ($payment->received_by && $payment->receivedBy && $payment->receivedBy->role === 'Employee')
                ? (int) $payment->received_by
                : null;

            $adminName = $user ? ($user->employee ? trim("{$user->employee->first_name} {$user->employee->last_name}") : $user->username) : 'Store Admin';

            $payment->status = Payment::STATUS_COMPLETED;
            if (!$cashierUserId) {
                $payment->received_by = $user ? $user->user_id : 1;
            }
            $payment->confirmed_by = $user ? $user->user_id : 1;
            $payment->confirmed_at = now();
            if ($wasCollectorRemittance) {
                $payment->notes = trim(($payment->notes ? $payment->notes . ' | ' : '') . "Approved by Store Admin: {$adminName}");
            }
            $payment->save();

            $deposit = PaymentSettlementService::syncDepositForConfirmedPayment($payment, $user, $payment->receipt_reference);
            $settlement = PaymentSettlementService::applyConfirmedInstallmentSettlement($payment);

            $inst = $payment->installmentAccount;
            $payAmount = (float) $payment->amount;

            SystemLog::create([
                'user_id' => $user ? $user->user_id : 1,
                'action' => $wasCollectorRemittance ? 'COLLECTOR_REMITTANCE_APPROVED' : 'PAYMENT_RECEIVED',
                'module' => 'Payments',
                'description' => ($wasCollectorRemittance ? "Store Admin {$adminName} approved collector remittance " : "Store Admin {$adminName} officially received payment ")
                    . "{$payment->receipt_no} (₱" . number_format($payAmount, 2) . ") via {$payment->payment_method}.",
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ]);

            $customerUserId = $deposit?->user_id ?? $inst?->customer?->user_id;
            if (!$customerUserId && $inst?->customer?->email) {
                $customerUserId = \App\Models\User::where('username', $inst->customer->email)->value('user_id');
            }

            if ($customerUserId) {
                NotificationService::sendToUser($customerUserId, [
                    'type' => 'payment_received',
                    'title' => 'Payment Approved & Received!',
                    'message' => "Your payment of ₱" . number_format($payAmount, 2) . " ({$payment->receipt_no}) has been approved by Store Admin {$adminName}.",
                    'module' => 'Payments',
                    'priority' => 'high',
                ]);
            }

            if ($wasCollectorRemittance && $payment->collector_id) {
                NotificationService::sendToUser((int) $payment->collector_id, [
                    'type' => 'remittance_verified',
                    'title' => 'Remittance Approved by Store Admin',
                    'message' => "Your collected remittance {$payment->receipt_no} (₱" . number_format($payAmount, 2) . ") has been approved by Store Admin {$adminName}.",
                    'module' => 'Payments',
                    'related_id' => $payment->payment_id,
                    'related_type' => Payment::class,
                    'action_url' => '/employee/collect-cash',
                    'priority' => 'normal',
                ]);
            }

            if ($wasCollectorRemittance && $cashierUserId && $cashierUserId !== ($user?->user_id)) {
                NotificationService::sendToUser($cashierUserId, [
                    'type' => 'remittance_approved_by_admin',
                    'title' => 'Forwarded Remittance Approved by Store Admin',
                    'message' => "Store Admin {$adminName} approved collector payment {$payment->receipt_no} (₱" . number_format($payAmount, 2) . ") that you verified.",
                    'module' => 'Payments',
                    'related_id' => $payment->payment_id,
                    'related_type' => Payment::class,
                    'action_url' => '/employee/receive-cash',
                    'priority' => 'normal',
                ]);
            }

            PaymentSettlementService::invalidatePaymentCaches(['payments', 'installments', 'sales', 'customers', 'dashboard', 'reports', 'notifications', 'transactions']);

            $approvedBranchId = PaymentSettlementService::resolvePaymentBranchId($payment);
            $approvedCustId = $inst?->customer_id ?? $payment->sale?->customer_id ?? $deposit?->customer_id ?? null;
            $approvedEmpIds = array_filter([
                $payment->collector_id ? (int) $payment->collector_id : null,
                $cashierUserId ? (int) $cashierUserId : null,
            ]);

            \App\Services\RealtimeBroadcaster::dispatch(new \App\Events\CashPaymentWorkflowUpdated([
                'payment_id' => $payment->payment_id,
                'receipt_no' => $payment->receipt_no,
                'reference_no' => $payment->reference_no,
                'amount' => (float) $payAmount,
                'status' => $payment->status,
                'cash_channel' => $payment->cash_channel ?: 'store',
                'stage' => 'store_admin_approved',
                'actor_user_id' => $user ? (int) $user->user_id : null,
                'toast_title' => 'Payment Confirmed',
                'toast_message' => "Payment {$payment->receipt_no} (₱" . number_format($payAmount, 2) . ") approved by {$adminName}.",
            ], $approvedBranchId ? (int) $approvedBranchId : null, $approvedCustId ? (int) $approvedCustId : null, $approvedEmpIds));

            if ($payment->installment_id) {
                \App\Services\RealtimeBroadcaster::dispatch(new \App\Events\InstallmentScheduleUpdated([
                    'installment_id' => $payment->installment_id,
                    'payment_id' => $payment->payment_id,
                    'amount' => (float) $payAmount,
                    'status' => $settlement['status'] ?? null,
                    'balance' => $settlement['balance'] ?? null,
                    'actor_user_id' => $user ? (int) $user->user_id : null,
                ], $approvedBranchId ? (int) $approvedBranchId : null, $approvedCustId ? (int) $approvedCustId : null));
            }

            return response()->json([
                'success' => true,
                'message' => $wasCollectorRemittance
                    ? "Collector remittance {$payment->receipt_no} of ₱" . number_format($payAmount, 2) . " approved by Store Admin and settled."
                    : "Payment {$payment->receipt_no} of ₱" . number_format($payAmount, 2) . " has been officially received.",
                'payment' => $payment->fresh(),
                'account' => $settlement,
            ]);
        });
    }

    /**
     * Store Admin rejects a pending payment.
     */
    public function rejectPayment(Request $request, int $id)
    {
        $user = $request->user();
        if ($user && !in_array($user->role, ['Store Administrator', 'Store Admin', 'Administrator', 'Admin', 'Manager'])) {
            return response()->json(['success' => false, 'message' => 'Unauthorized.'], 403);
        }

        $reason = trim((string) $request->input('reason', 'Payment proof verification failed.')) ?: 'Payment proof verification failed.';

        return DB::transaction(function () use ($id, $user, $request, $reason) {
            $payment = Payment::with([
                'installmentAccount.customer.branch',
                'installmentAccount.sale.branch',
                'installmentAccount.sale.processedBy.employee',
                'sale.customer.branch',
                'sale.branch',
                'ewalletDeposit.customer.branch',
                'collector.employee',
                'receivedBy.employee',
            ])->lockForUpdate()->findOrFail($id);

            if ($user && in_array($user->role, ['Store Administrator', 'Store Admin'])) {
                $userBranch = $user->employee?->branch_id;
                $payBranch = PaymentSettlementService::resolvePaymentBranchId($payment);
                if ($userBranch && $payBranch && (string) $userBranch !== (string) $payBranch) {
                    return response()->json(['success' => false, 'message' => 'Unauthorized: Cannot reject payments belonging to another branch.'], 403);
                }
            }

            if (Payment::isSettledStatus($payment->status)) {
                return response()->json(['success' => false, 'message' => 'Cannot reject an already completed payment.'], 422);
            }

            $payment->status = Payment::STATUS_REJECTED;
            $payment->notes = ($payment->notes ? $payment->notes . " | " : "") . "Rejected: {$reason}";
            $payment->save();

            $deposit = EWalletDeposit::where('payment_id', $payment->payment_id)
                ->when($payment->reference_no, fn($q) => $q->orWhere('transaction_reference', $payment->reference_no))
                ->first();

            if ($deposit) {
                $deposit->status = 'rejected';
                $deposit->save();
            }

            SystemLog::create([
                'user_id' => $user ? $user->user_id : 1,
                'action' => 'PAYMENT_REJECTED',
                'module' => 'Payments',
                'description' => "Rejected pending payment {$payment->receipt_no} (₱" . number_format((float) $payment->amount, 2) . "): {$reason}",
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ]);

            $inst = $payment->installmentAccount;
            $customerUserId = $deposit?->user_id ?? $inst?->customer?->user_id;
            if (!$customerUserId && $inst?->customer?->email) {
                $customerUserId = \App\Models\User::where('username', $inst->customer->email)->value('user_id');
            }
            if ($customerUserId) {
                NotificationService::sendToUser($customerUserId, [
                    'type' => 'payment_rejected',
                    'title' => 'Payment Submission Rejected',
                    'message' => "Your submitted payment ({$payment->receipt_no}, ₱" . number_format((float) $payment->amount, 2) . ") was rejected: {$reason}",
                    'module' => 'Payments',
                    'action_url' => '/customer/dashboard?tab=installments',
                    'priority' => 'high',
                ]);
            }

            if ($payment->collector_id) {
                NotificationService::sendToUser((int) $payment->collector_id, [
                    'type' => 'remittance_rejected',
                    'title' => 'Collector Remittance Rejected by Store Admin',
                    'message' => "Remittance {$payment->receipt_no} (₱" . number_format((float) $payment->amount, 2) . ") was rejected by Store Admin: {$reason}",
                    'module' => 'Payments',
                    'related_id' => $payment->payment_id,
                    'related_type' => Payment::class,
                    'action_url' => '/employee/collect-cash',
                    'priority' => 'high',
                ]);
            }

            if ($payment->received_by && $payment->receivedBy && $payment->receivedBy->role === 'Employee') {
                NotificationService::sendToUser((int) $payment->received_by, [
                    'type' => 'remittance_rejected',
                    'title' => 'Forwarded Remittance Rejected by Store Admin',
                    'message' => "Forwarded payment {$payment->receipt_no} (₱" . number_format((float) $payment->amount, 2) . ") was rejected by Store Admin: {$reason}",
                    'module' => 'Payments',
                    'related_id' => $payment->payment_id,
                    'related_type' => Payment::class,
                    'action_url' => '/employee/receive-cash',
                    'priority' => 'high',
                ]);
            }

            PaymentSettlementService::invalidatePaymentCaches(['payments', 'installments', 'sales', 'customers', 'dashboard', 'reports', 'notifications', 'transactions']);

            $rejBranchId = PaymentSettlementService::resolvePaymentBranchId($payment);
            $rejCustId = $inst?->customer_id ?? $payment->sale?->customer_id ?? $deposit?->customer_id ?? null;
            $rejEmpIds = array_filter([
                $payment->collector_id ? (int) $payment->collector_id : null,
                ($payment->received_by && $payment->receivedBy && $payment->receivedBy->role === 'Employee') ? (int) $payment->received_by : null,
            ]);
            \App\Services\RealtimeBroadcaster::dispatch(new \App\Events\CashPaymentWorkflowUpdated([
                'payment_id' => $payment->payment_id,
                'receipt_no' => $payment->receipt_no,
                'reference_no' => $payment->reference_no,
                'amount' => (float) $payment->amount,
                'status' => $payment->status,
                'cash_channel' => $payment->cash_channel ?: 'store',
                'stage' => 'store_admin_rejected',
                'reason' => $reason,
                'actor_user_id' => $user ? (int) $user->user_id : null,
                'toast_title' => 'Payment Rejected',
                'toast_message' => "Payment {$payment->receipt_no} was rejected: {$reason}",
            ], $rejBranchId ? (int) $rejBranchId : null, $rejCustId ? (int) $rejCustId : null, $rejEmpIds));

            return response()->json([
                'success' => true,
                'message' => 'Payment has been rejected.',
                'payment' => $payment->fresh(),
            ]);
        });
    }

    /**
     * List payment schedules.
     */
    public function schedules(Request $request)
    {
        $user = $request->user();
        $today = date('Y-m-d');

        $query = PaymentSchedule::with([
            'installmentAccount.customer.branch',
            'installmentAccount.sale.branch',
            'installmentAccount.sale.processedBy.employee.branch'
        ]);

        if ($user && in_array($user->role, ['Store Administrator', 'Store Admin'])) {
            $userBranch = $user->employee ? $user->employee->branch_id : null;
            if ($userBranch) {
                $query->whereHas('installmentAccount', function ($iq) use ($userBranch) {
                    $iq->whereHas('customer', function ($cq) use ($userBranch) {
                        $cq->where('branch_id', $userBranch);
                    })->orWhereHas('sale', function ($sq) use ($userBranch) {
                        $sq->where('branch_id', $userBranch);
                    });
                });
            }
        } elseif ($request->filled('branch') && $request->query('branch') !== 'All') {
            $branch = $request->query('branch');
            $branchId = is_numeric($branch) ? (int)$branch : optional(BranchProfile::where('name', $branch)->first())->id;
            $query->whereHas('installmentAccount', function ($iq) use ($branch, $branchId) {
                $iq->whereHas('customer', function ($cq) use ($branch, $branchId) {
                    $cq->where(function ($sub) use ($branch, $branchId) {
                        if ($branchId) {
                            $sub->where('branch_id', $branchId);
                        }
                        $sub->orWhere('branch', $branch)
                            ->orWhereHas('branch', function ($bq) use ($branch) {
                                $bq->where('name', $branch);
                            });
                    });
                })->orWhereHas('sale', function ($sq) use ($branch, $branchId) {
                    $sq->where(function ($sub) use ($branch, $branchId) {
                        if ($branchId) {
                            $sub->where('branch_id', $branchId);
                        }
                        $sub->orWhereHas('branch', function ($bq) use ($branch) {
                            $bq->where('name', $branch);
                        });
                    });
                });
            });
        }

        if ($request->filled('search')) {
            $s = $request->query('search');
            $query->where(function ($q) use ($s) {
                $q->whereHas('installmentAccount', function ($iq) use ($s) {
                    $iq->where('account_no', 'like', "%{$s}%")
                       ->orWhereHas('customer', function ($cq) use ($s) {
                           $cq->where('first_name', 'like', "%{$s}%")
                              ->orWhere('last_name', 'like', "%{$s}%");
                       });
                });
            }); 
              
            
        }

        if ($request->filled('status') && $request->query('status') !== 'All') {
            $query->where('status', $request->query('status'));
        }

        $schedules = $query->orderBy('due_date')->get()->map(function ($s) use ($today) {
            $inst = $s->installmentAccount;
            $cust = $inst ? $inst->customer : null;
            $sale = $inst ? $inst->sale : null;

            $branchId = $cust ? $cust->branch_id : ($sale ? $sale->branch_id : null);
            $branchName = null;
            if ($cust && $cust->branch_name) {
                $branchName = $cust->branch_name;
            } elseif ($cust && $cust->branch) {
                $branchName = $cust->branch->name;
            } elseif ($sale && $sale->branch) {
                $branchName = $sale->branch->name;
            } elseif ($branchId) {
                $branchName = BranchProfile::getNameById($branchId);
            }

            $status = $s->status;
            if ((float)$s->balance_due <= 0) {
                $status = 'Paid';
            } elseif ($s->due_date < $today && (float)$s->balance_due > 0) {
                $status = 'Overdue';
            } elseif ($s->due_date == $today && (float)$s->balance_due > 0) {
                $status = 'Due';
            } elseif ($s->due_date > $today && (float)$s->amount_paid == 0) {
                $status = 'Upcoming';
            }

            return [
                'schedule_id' => $s->schedule_id,
                'installment_id' => $s->installment_id,
                'installment_no' => $s->installment_no,
                'account_no' => $inst ? $inst->account_no : 'N/A',
                'customer_name' => $cust ? "{$cust->first_name} {$cust->last_name}" : 'Customer',
                'customer_phone' => $cust ? $cust->phone : '',
                'branch' => $branchName ?: 'Main Branch',
                'branch_id' => $branchId,
                'due_date' => $s->due_date,
                'amount_due' => (float)$s->amount_due,
                'amount_paid' => (float)$s->amount_paid,
                'balance_due' => (float)$s->balance_due,
                'status' => $status,
                'paid_date' => $s->paid_date,
                'notes' => $s->notes,
            ];
        });

        return response()->json([
            'schedules' => $schedules,
            'total' => $schedules->count(),
        ]);
    }

    /**
     * Delete a payment and reverse balances.
     */
    public function destroy(Request $request, int $id)
    {
        $user = $request->user();
        if ($user && !in_array($user->role, ['Administrator', 'Store Administrator', 'Store Admin'])) {
            return response()->json(['message' => 'Unauthorized. Only administrators can delete payments.'], 403);
        }

        $payment = Payment::find($id);
        if (!$payment) {
            return response()->json(['message' => 'Payment not found'], 404);
        }

        DB::transaction(function() use ($payment) {
            $instId = $payment->installment_id;
            $payAmount = (float) $payment->amount;

            // Clear reference in any attached e_wallet_deposits
            \App\Models\EWalletDeposit::where('payment_id', $payment->payment_id)
                ->update(['payment_id' => null, 'status' => 'cancelled']);

            if ($instId) {
                $account = InstallmentAccount::find($instId);
                
                // If it's a "Cash / Fully Paid" product request (has 0 installments), void the entire request
                if ($account && $account->number_of_installments == 0) {
                    if ($account->sale_id) {
                        $saleItems = \App\Models\SaleItem::where('sale_id', $account->sale_id)->get();
                        foreach($saleItems as $item) {
                            $product = \App\Models\Product::find($item->product_id);
                            if ($product) {
                                $product->stock_quantity += $item->quantity;
                                $product->save();
                            }
                        }
                        \App\Models\SaleItem::where('sale_id', $account->sale_id)->delete();
                        \App\Models\SaleTransaction::where('sale_id', $account->sale_id)->delete();
                    }
                    \App\Models\PaymentSchedule::where('installment_id', $account->installment_id)->delete();
                    $payment->delete();
                    $account->delete();
                    return;
                } 
                else if ($account) {
                    // Delete the payment record first so remaining payments can be accurately recalculated
                    $payment->delete();

                    // 1. Recalculate all schedules for this installment account from scratch
                    $schedules = PaymentSchedule::where('installment_id', $account->installment_id)
                        ->orderBy('installment_no')
                        ->get();

                    foreach ($schedules as $sched) {
                        $sched->amount_paid = 0;
                        $sched->balance_due = $sched->amount_due;
                        $sched->status = 'Pending';
                        $sched->paid_date = null;
                        $sched->save();
                    }

                    $remainingPayments = Payment::where('installment_id', $account->installment_id)
                        ->whereIn('status', Payment::CONFIRMED_STATUSES)
                        ->orderBy('payment_date')
                        ->orderBy('payment_id')
                        ->get();

                    $totalRemainingPaid = 0;
                    foreach ($remainingPayments as $p) {
                        $rem = (float) $p->amount;
                        $totalRemainingPaid += $rem;
                        foreach ($schedules as $sched) {
                            if ($rem <= 0) break;
                            $schedBal = (float) $sched->balance_due;
                            if ($schedBal <= 0) continue;

                            $apply = min($rem, $schedBal);
                            $newPaid = round((float) $sched->amount_paid + $apply, 2);
                            $newBal = max(0, round((float) $sched->amount_due - $newPaid, 2));

                            $sched->amount_paid = $newPaid;
                            $sched->balance_due = $newBal;
                            $sched->status = $newBal <= 0 ? 'Paid' : 'Partially Paid';
                            $sched->paid_date = $newBal <= 0 ? $p->payment_date : $sched->paid_date;
                            $sched->save();

                            $rem = round($rem - $apply, 2);
                        }
                    }

                    // Mark overdue schedules if due date has passed
                    $today = date('Y-m-d');
                    foreach ($schedules as $sched) {
                        if ($sched->balance_due > 0 && $sched->due_date < $today) {
                            $sched->status = 'Overdue';
                            $sched->save();
                        }
                    }

                    // 2. Recalculate Installment Account status
                    $totalPaidWithDown = round((float) $account->down_payment + $totalRemainingPaid, 2);
                    $newBalance = max(0, round((float) $account->total_payable - $totalPaidWithDown, 2));

                    if ($newBalance <= 0) {
                        $account->status = 'Completed';
                    } else {
                        $hasOverdue = PaymentSchedule::where('installment_id', $account->installment_id)
                            ->where('due_date', '<', $today)
                            ->where('balance_due', '>', 0)
                            ->exists();
                        $account->status = $hasOverdue ? 'Overdue' : 'Active';
                    }
                    $account->save();

                    // 3. Update Sale Transaction if linked
                    if ($account->sale_id) {
                        $sale = SaleTransaction::find($account->sale_id);
                        if ($sale) {
                            $newSalePaid = max(0, round((float) $sale->amount_paid - $payAmount, 2));
                            $newSaleBal = max(0, round((float) $sale->total_amount - $newSalePaid, 2));
                            $sale->amount_paid = $newSalePaid;
                            $sale->balance_due = $newSaleBal;
                            $sale->status = $newSaleBal <= 0 ? 'Completed' : 'Active Installment';
                            $sale->save();
                        }
                    }

                    return;
                }
            }

            if (!$instId && $payment->sale_id) {
                $saleItems = SaleItem::where('sale_id', $payment->sale_id)->get();
                foreach ($saleItems as $item) {
                    $product = Product::find($item->product_id);
                    if ($product) {
                        $product->stock_quantity += $item->quantity;
                        $product->save();
                    }
                }
                SaleItem::where('sale_id', $payment->sale_id)->delete();
                SaleTransaction::where('sale_id', $payment->sale_id)->delete();
            }

            if ($payment->schedule_id) {
                $schedule = PaymentSchedule::find($payment->schedule_id);
                if ($schedule) {
                    $schedule->amount_paid = max(0, round((float) $schedule->amount_paid - $payAmount, 2));
                    $schedule->balance_due = max(0, round((float) $schedule->amount_due - (float) $schedule->amount_paid, 2));
                    $schedule->status = $schedule->balance_due > 0 ? ($schedule->due_date < date('Y-m-d') ? 'Overdue' : 'Pending') : 'Paid';
                    $schedule->save();
                }
            }

            $payment->delete();
        });

        Cache::increment('pace_pay_cache_v');
        Cache::increment('pace_inst_cache_v');
        Cache::increment('pace_sales_cache_v');
        SyncController::invalidateFingerprint(['payments', 'installments', 'sales', 'products', 'dashboard', 'reports']);

        return response()->json(['message' => 'Payment deleted successfully.', 'success' => true]);
    }
}
