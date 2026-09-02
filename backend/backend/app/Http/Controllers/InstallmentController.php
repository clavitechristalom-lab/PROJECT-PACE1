<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\InstallmentAccount;
use App\Models\PaymentSchedule;
use App\Models\Payment;
use App\Models\SaleTransaction;
use App\Models\SaleItem;
use App\Models\Customer;
use App\Models\Product;
use App\Models\SystemLog;
use Illuminate\Support\Facades\DB;
use App\Services\NotificationService;

class InstallmentController extends Controller
{
    /**
     * Helper to format an InstallmentAccount instance consistently.
     */
    private function formatAccount($inst, $today)
    {
        $paid = (float)$inst->payments->sum('amount') + (float)$inst->down_payment;
        $totalPayable = (float)$inst->total_payable;
        $balance = max(0, round($totalPayable - $paid, 2));

        // Determine branch
        $branch = 'Main Branch';
        if ($inst->sale && $inst->sale->processedBy && $inst->sale->processedBy->employee) {
            $branch = $inst->sale->processedBy->employee->branch ?: 'Main Branch';
        }

        // Next Due Schedule
        $nextSchedule = $inst->paymentSchedules
            ->where('balance_due', '>', 0)
            ->sortBy('due_date')
            ->first();

        // Check if there are overdue schedules
        $hasOverdue = $inst->paymentSchedules
            ->where('due_date', '<', $today)
            ->where('balance_due', '>', 0)
            ->isNotEmpty();

        // Computed Status
        $computedStatus = $inst->status;
        if ($balance <= 0) {
            $computedStatus = 'Completed';
        } elseif ($hasOverdue) {
            $computedStatus = 'Overdue';
        } elseif ($computedStatus === 'Overdue' && !$hasOverdue) {
            $computedStatus = 'Active';
        }

        // Product name extraction
        $productName = 'Multiple / Custom Items';
        if ($inst->sale && $inst->sale->items && $inst->sale->items->isNotEmpty()) {
            $firstItem = $inst->sale->items->first();
            $productName = $firstItem->product ? $firstItem->product->product_name : 'Appliance / Furniture';
            if ($inst->sale->items->count() > 1) {
                $productName .= ' (+' . ($inst->sale->items->count() - 1) . ' more)';
            }
        }

        // Days overdue calculation
        $daysOverdue = 0;
        if ($hasOverdue) {
            $earliestOverdue = $inst->paymentSchedules
                ->where('due_date', '<', $today)
                ->where('balance_due', '>', 0)
                ->sortBy('due_date')
                ->first();
            if ($earliestOverdue) {
                $dueTime = strtotime($earliestOverdue->due_date);
                $nowTime = strtotime($today);
                $daysOverdue = max(0, (int)(($nowTime - $dueTime) / 86400));
            }
        }

        return [
            'installment_id' => $inst->installment_id,
            'account_no' => $inst->account_no,
            'customer_id' => $inst->customer_id,
            'customer_name' => $inst->customer ? "{$inst->customer->first_name} {$inst->customer->last_name}" : 'Customer',
            'customer_phone' => $inst->customer ? $inst->customer->phone : '',
            'customer_email' => $inst->customer ? $inst->customer->email : '',
            'customer_address' => $inst->customer ? $inst->customer->address : '',
            'product_name' => $productName,
            'branch' => $branch,
            'sale_id' => $inst->sale_id,
            'invoice_no' => $inst->sale ? $inst->sale->invoice_no : 'N/A',
            'start_date' => $inst->start_date,
            'principal_amount' => (float)$inst->principal_amount,
            'down_payment' => (float)$inst->down_payment,
            'financed_amount' => max(0, (float)$inst->principal_amount - (float)$inst->down_payment),
            'interest_rate' => (float)$inst->interest_rate,
            'interest_amount' => (float)$inst->interest_amount,
            'total_payable' => $totalPayable,
            'installment_amount' => (float)$inst->installment_amount,
            'number_of_installments' => (int)$inst->number_of_installments,
            'frequency' => $inst->frequency ?: 'Monthly',
            'paid' => round($paid, 2),
            'balance' => $balance,
            'progress_percentage' => $totalPayable > 0 ? min(100, round(($paid / $totalPayable) * 100, 1)) : 0,
            'next_due_date' => $nextSchedule ? $nextSchedule->due_date : null,
            'next_amount_due' => $nextSchedule ? (float)$nextSchedule->balance_due : 0,
            'days_overdue' => $daysOverdue,
            'payment_status' => $balance <= 0 ? 'Paid in Full' : ($hasOverdue ? 'Overdue' : ($paid > 0 ? 'Partially Paid' : 'Unpaid')),
            'status' => $computedStatus,
            'notes' => $inst->notes,
        ];
    }

    /**
     * List all installment accounts with role/branch scoping and real-time balance calculations.
     */
    public function index(Request $request)
    {
        $user = $request->user();
        $today = date('Y-m-d');

        // Automatically update overdue schedule statuses for accurate live data
        PaymentSchedule::where('due_date', '<', $today)
            ->where('balance_due', '>', 0)
            ->whereIn('status', ['Pending', 'Partially Paid'])
            ->update(['status' => 'Overdue']);

        $query = InstallmentAccount::with([
            'customer',
            'sale.processedBy.employee',
            'sale.items.product',
            'payments',
            'paymentSchedules'
        ]);

        // Branch scoping for Store Administrator
        if ($user && in_array($user->role, ['Store Administrator', 'Store Admin'])) {
            $userBranch = $user->employee ? $user->employee->branch : 'Main Branch';
            $query->where(function ($q) use ($userBranch) {
                $q->whereHas('sale.processedBy.employee', function ($eq) use ($userBranch) {
                    $eq->where('branch', $userBranch);
                });
            });
        } elseif ($request->filled('branch') && $request->query('branch') !== 'All') {
            $branch = $request->query('branch');
            $query->whereHas('sale.processedBy.employee', function ($eq) use ($branch) {
                $eq->where('branch', $branch);
            });
        }

        if ($request->filled('search')) {
            $s = trim($request->query('search'));
            $query->where(function ($q) use ($s) {
                $q->where('account_no', 'like', "%{$s}%")
                  ->orWhereHas('customer', function ($cq) use ($s) {
                      $cq->where('first_name', 'like', "%{$s}%")
                         ->orWhere('last_name', 'like', "%{$s}%")
                         ->orWhere('customer_code', 'like', "%{$s}%")
                         ->orWhere('phone', 'like', "%{$s}%");
                  })
                  ->orWhereHas('sale', function ($sq) use ($s) {
                      $sq->where('invoice_no', 'like', "%{$s}%");
                  })
                  ->orWhereHas('sale.items.product', function ($pq) use ($s) {
                      $pq->where('product_name', 'like', "%{$s}%")
                         ->orWhere('product_code', 'like', "%{$s}%");
                  });
            });
        }

        if ($request->filled('status') && $request->query('status') !== 'All') {
            $query->where('status', $request->query('status'));
        }

        if ($request->filled('date_from')) {
            $query->where('start_date', '>=', $request->query('date_from'));
        }
        if ($request->filled('date_to')) {
            $query->where('start_date', '<=', $request->query('date_to'));
        }

        if ($request->boolean('export_csv')) {
            SystemLog::create([
                'user_id' => $user ? $user->user_id : null,
                'action' => 'EXPORT',
                'module' => 'Installments',
                'description' => 'Exported Installment Accounts to CSV',
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ]);

            return $this->exportCsv(
                'installments_export_' . date('Y-m-d') . '.csv',
                ['Installment ID', 'Account No', 'Customer Name', 'Transaction ID', 'Principal Amount', 'Down Payment', 'Financed Amount', 'Interest Rate', 'Interest Amount', 'Total Payable', 'Installment Amount', 'Frequency', 'Paid', 'Balance', 'Status', 'Branch', 'Created Date'],
                $query->orderByDesc('installment_id'),
                function ($inst) use ($today) {
                    $f = $this->formatAccount($inst, $today);
                    return [
                        $f['installment_id'],
                        $f['account_no'],
                        $f['customer_name'],
                        $f['invoice_no'],
                        $f['principal_amount'],
                        $f['down_payment'],
                        $f['financed_amount'],
                        $f['interest_rate'],
                        $f['interest_amount'],
                        $f['total_payable'],
                        $f['installment_amount'],
                        $f['frequency'],
                        $f['paid'],
                        $f['balance'],
                        $f['status'],
                        $f['branch'],
                        $inst->created_at ? $inst->created_at->format('Y-m-d H:i:s') : ''
                    ];
                }
            );
        }

        $allAccounts = $query->orderByDesc('installment_id')->get();
        $installments = $allAccounts->map(function ($inst) use ($today) {
            return $this->formatAccount($inst, $today);
        });

        // Compute summary metrics for Installment Monitoring
        $totalFinanced = (float)$installments->sum('total_payable');
        $totalPaid = (float)$installments->sum('paid');
        $totalOutstanding = (float)$installments->sum('balance');
        $activeCount = $installments->where('status', 'Active')->count();
        $overdueCount = $installments->where('status', 'Overdue')->count();
        $completedCount = $installments->where('status', 'Completed')->count();
        $pendingCount = $installments->where('status', 'Pending')->count();

        return response()->json([
            'installments' => $installments,
            'total' => $installments->count(),
            'summary' => [
                'total_financed' => $totalFinanced,
                'total_paid' => $totalPaid,
                'total_outstanding' => $totalOutstanding,
                'active_accounts' => $activeCount,
                'overdue_accounts' => $overdueCount,
                'completed_accounts' => $completedCount,
                'pending_accounts' => $pendingCount,
            ]
        ]);
    }

    /**
     * Create a new Customer Installment Account.
     */
    public function store(Request $request)
    {
        $user = $request->user();
        $today = date('Y-m-d');

        $validated = $request->validate([
            'customer_id' => 'nullable|exists:customers,customer_id',
            'first_name' => 'required_without:customer_id|nullable|string|max:100',
            'last_name' => 'required_without:customer_id|nullable|string|max:100',
            'phone' => 'nullable|string|max:20',
            'email' => 'nullable|email|max:100',
            'address' => 'nullable|string|max:255',

            'product_id' => 'nullable|exists:products,product_id',
            'product_name' => 'nullable|string|max:255',
            'principal_amount' => 'required|numeric|min:1',
            'down_payment' => 'nullable|numeric|min:0',
            'interest_rate' => 'nullable|numeric|min:0',
            'interest_amount' => 'nullable|numeric|min:0',
            'total_payable' => 'required|numeric|min:1',
            'installment_amount' => 'required|numeric|min:1',
            'number_of_installments' => 'required|integer|min:1|max:60',
            'frequency' => 'nullable|string|in:Monthly,Bi-weekly,Weekly',
            'start_date' => 'required|date',
            'due_date' => 'nullable|date',
            'status' => 'nullable|string|in:Active,Pending,Completed,Overdue,Cancelled',
            'notes' => 'nullable|string',
        ]);

        return DB::transaction(function () use ($validated, $request, $user, $today) {
            // 1. Resolve or Create Customer
            $customerId = $validated['customer_id'] ?? null;
            if (!$customerId) {
                $custCount = Customer::count() + 1;
                $custCode = 'CUST-' . date('Y') . '-' . str_pad($custCount, 4, '0', STR_PAD_LEFT);
                $customer = Customer::create([
                    'customer_code' => $custCode,
                    'first_name' => $validated['first_name'],
                    'last_name' => $validated['last_name'],
                    'phone' => $validated['phone'] ?? '',
                    'email' => $validated['email'] ?? '',
                    'address' => $validated['address'] ?? '',
                    'status' => 'Active',
                ]);
                $customerId = $customer->customer_id;
            } else {
                $customer = Customer::findOrFail($customerId);
                // Optionally update contact details if provided
                if (!empty($validated['phone']) || !empty($validated['address'])) {
                    $customer->update(array_filter([
                        'phone' => $validated['phone'] ?? null,
                        'address' => $validated['address'] ?? null,
                        'email' => $validated['email'] ?? null,
                    ]));
                }
            }

            $principal = (float)$validated['principal_amount'];
            $downPayment = isset($validated['down_payment']) ? (float)$validated['down_payment'] : 0.00;
            $interestRate = isset($validated['interest_rate']) ? (float)$validated['interest_rate'] : 0.00;
            $interestAmount = isset($validated['interest_amount']) ? (float)$validated['interest_amount'] : ($principal * ($interestRate / 100));
            $totalPayable = isset($validated['total_payable']) ? (float)$validated['total_payable'] : ($principal + $interestAmount);
            $numInstallments = (int)$validated['number_of_installments'];
            $frequency = $validated['frequency'] ?? 'Monthly';
            $startDate = $validated['start_date'] ?? $today;
            $status = $validated['status'] ?? 'Active';
            $notes = $validated['notes'] ?? '';

            // Calculate installment amount if missing
            $installmentAmount = isset($validated['installment_amount']) ? (float)$validated['installment_amount'] : round(($totalPayable - $downPayment) / $numInstallments, 2);

            // 2. Create Sale Transaction
            $saleCount = SaleTransaction::count() + 1;
            $invoiceNo = 'INV-' . date('Y') . '-' . str_pad($saleCount, 5, '0', STR_PAD_LEFT);

            $sale = SaleTransaction::create([
                'invoice_no' => $invoiceNo,
                'customer_id' => $customerId,
                'processed_by' => $user ? $user->user_id : 1,
                'sale_date' => $startDate . ' ' . date('H:i:s'),
                'payment_method' => 'Installment',
                'subtotal' => $principal,
                'discount_amount' => 0.00,
                'total_amount' => $totalPayable,
                'amount_paid' => $downPayment,
                'balance_due' => max(0, $totalPayable - $downPayment),
                'status' => ($downPayment >= $totalPayable) ? 'completed' : 'partially_paid',
                'notes' => "Installment financing agreement ({$numInstallments} {$frequency} terms). " . $notes,
            ]);

            // 3. Attach Sale Line Item
            $productId = $validated['product_id'] ?? null;
            if ($productId) {
                $product = Product::find($productId);
                if ($product) {
                    SaleItem::create([
                        'sale_id' => $sale->sale_id,
                        'product_id' => $productId,
                        'quantity' => 1,
                        'unit_price' => $principal,
                        'discount_amount' => 0.00,
                        'line_total' => $principal,
                    ]);
                    // Update product stock if available
                    if ($product->stock_quantity > 0) {
                        $product->decrement('stock_quantity', 1);
                    }
                }
            } else {
                // Attach first product or generic
                $firstProd = Product::first();
                if ($firstProd) {
                    SaleItem::create([
                        'sale_id' => $sale->sale_id,
                        'product_id' => $firstProd->product_id,
                        'quantity' => 1,
                        'unit_price' => $principal,
                        'discount_amount' => 0.00,
                        'line_total' => $principal,
                    ]);
                }
            }

            // 4. Create Installment Account
            $accountCount = InstallmentAccount::count() + 1;
            $accountNo = 'ACC-' . date('Y') . '-' . str_pad($accountCount, 5, '0', STR_PAD_LEFT);

            $account = InstallmentAccount::create([
                'account_no' => $accountNo,
                'customer_id' => $customerId,
                'sale_id' => $sale->sale_id,
                'start_date' => $startDate,
                'principal_amount' => $principal,
                'down_payment' => $downPayment,
                'interest_rate' => $interestRate,
                'interest_amount' => $interestAmount,
                'total_payable' => $totalPayable,
                'installment_amount' => $installmentAmount,
                'number_of_installments' => $numInstallments,
                'frequency' => $frequency,
                'status' => $status,
                'notes' => $notes,
            ]);

            // 5. Generate Payment Schedule entries
            $firstDueDate = $validated['due_date'] ?? date('Y-m-d', strtotime($startDate . ' +1 month'));
            $daysStep = ($frequency === 'Weekly') ? 7 : (($frequency === 'Bi-weekly') ? 14 : 30);

            for ($i = 1; $i <= $numInstallments; $i++) {
                if ($i === 1) {
                    $schedDueDate = $firstDueDate;
                } else {
                    $schedDueDate = date('Y-m-d', strtotime($firstDueDate . ' +' . (($i - 1) * $daysStep) . ' days'));
                }

                PaymentSchedule::create([
                    'installment_id' => $account->installment_id,
                    'installment_no' => $i,
                    'due_date' => $schedDueDate,
                    'amount_due' => $installmentAmount,
                    'amount_paid' => 0.00,
                    'balance_due' => $installmentAmount,
                    'status' => 'Pending',
                ]);
            }

            // 6. Record Down Payment Receipt if paid upfront
            if ($downPayment > 0) {
                $payCount = Payment::count() + 1;
                $receiptNo = 'REC-' . date('Y') . '-' . str_pad($payCount, 5, '0', STR_PAD_LEFT);

                Payment::create([
                    'installment_id' => $account->installment_id,
                    'schedule_id' => null,
                    'receipt_no' => $receiptNo,
                    'payment_date' => $startDate,
                    'amount' => $downPayment,
                    'payment_method' => 'Cash',
                    'reference_no' => 'DOWNPAYMENT-' . $accountNo,
                    'received_by' => $user ? $user->user_id : 1,
                    'notes' => 'Initial down payment collected upon account activation',
                    'created_at' => now(),
                ]);
            }

            // 7. System Audit Log
            $custFullName = "{$customer->first_name} {$customer->last_name}";
            SystemLog::create([
                'user_id' => $user ? $user->user_id : 1,
                'action' => 'CREATE',
                'module' => 'Installments',
                'description' => "Created new customer installment account {$accountNo} for {$custFullName} (Total: ₱" . number_format($totalPayable, 2) . ", Down: ₱" . number_format($downPayment, 2) . ", {$numInstallments} Mos)",
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ]);

            // 8. Notification
            NotificationService::sendToAdmins([
                'type' => 'installment_created',
                'title' => 'New Installment Account Created',
                'message' => "Account {$accountNo} created for {$custFullName} — ₱" . number_format($totalPayable, 2) . " ({$numInstallments} {$frequency} terms).",
                'module' => 'Installments',
                'related_id' => $account->installment_id,
                'related_type' => 'App\Models\InstallmentAccount',
                'action_url' => "/installments?id={$account->installment_id}",
                'priority' => 'normal',
            ]);

            // Load fresh relationships for formatting
            $account->load([
                'customer',
                'sale.processedBy.employee',
                'sale.items.product',
                'payments',
                'paymentSchedules'
            ]);

            $formatted = $this->formatAccount($account, $today);

            return response()->json([
                'message' => "Customer Installment Account {$accountNo} created successfully",
                'account' => $formatted,
            ], 201);
        });
    }

    /**
     * Dedicated Overdue Installment Monitoring endpoint.
     */
    public function overdue(Request $request)
    {
        $user = $request->user();
        $today = date('Y-m-d');

        // Refresh overdue schedules
        PaymentSchedule::where('due_date', '<', $today)
            ->where('balance_due', '>', 0)
            ->whereIn('status', ['Pending', 'Partially Paid'])
            ->update(['status' => 'Overdue']);

        $query = InstallmentAccount::with([
            'customer',
            'sale.processedBy.employee',
            'sale.items.product',
            'payments',
            'paymentSchedules' => function ($q) use ($today) {
                $q->where('due_date', '<', $today)->where('balance_due', '>', 0)->orderBy('due_date');
            }
        ])->whereHas('paymentSchedules', function ($q) use ($today) {
            $q->where('due_date', '<', $today)->where('balance_due', '>', 0);
        });

        // Store Admin branch scoping
        if ($user && in_array($user->role, ['Store Administrator', 'Store Admin'])) {
            $userBranch = $user->employee ? $user->employee->branch : 'Main Branch';
            $query->whereHas('sale.processedBy.employee', function ($eq) use ($userBranch) {
                $eq->where('branch', $userBranch);
            });
        } elseif ($request->filled('branch') && $request->query('branch') !== 'All') {
            $branch = $request->query('branch');
            $query->whereHas('sale.processedBy.employee', function ($eq) use ($branch) {
                $eq->where('branch', $branch);
            });
        }

        if ($request->filled('search')) {
            $s = trim($request->query('search'));
            $query->where(function ($q) use ($s) {
                $q->where('account_no', 'like', "%{$s}%")
                  ->orWhereHas('customer', function ($cq) use ($s) {
                      $cq->where('first_name', 'like', "%{$s}%")
                         ->orWhere('last_name', 'like', "%{$s}%")
                         ->orWhere('phone', 'like', "%{$s}%");
                  });
            });
        }

        $overdueList = $query->get()->map(function ($inst) use ($today) {
            $paid = (float)$inst->payments->sum('amount') + (float)$inst->down_payment;
            $balance = max(0, round((float)$inst->total_payable - $paid, 2));

            $earliestOverdue = $inst->paymentSchedules->first();
            $dueTime = $earliestOverdue ? strtotime($earliestOverdue->due_date) : strtotime($today);
            $nowTime = strtotime($today);
            $daysOverdue = max(1, (int)(($nowTime - $dueTime) / 86400));

            $totalOverdueAmount = (float)$inst->paymentSchedules->sum('balance_due');

            $branch = 'Main Branch';
            if ($inst->sale && $inst->sale->processedBy && $inst->sale->processedBy->employee) {
                $branch = $inst->sale->processedBy->employee->branch ?: 'Main Branch';
            }

            $productName = 'Appliance / Furniture';
            if ($inst->sale && $inst->sale->items && $inst->sale->items->isNotEmpty()) {
                $firstItem = $inst->sale->items->first();
                $productName = $firstItem->product ? $firstItem->product->product_name : 'Appliance / Furniture';
            }

            return [
                'installment_id' => $inst->installment_id,
                'account_no' => $inst->account_no,
                'customer_name' => $inst->customer ? "{$inst->customer->first_name} {$inst->customer->last_name}" : 'Customer',
                'customer_phone' => $inst->customer ? $inst->customer->phone : '—',
                'customer_address' => $inst->customer ? $inst->customer->address : '—',
                'product_name' => $productName,
                'branch' => $branch,
                'due_date' => $earliestOverdue ? $earliestOverdue->due_date : $today,
                'amount_due' => $earliestOverdue ? (float)$earliestOverdue->amount_due : 0,
                'amount_paid' => $earliestOverdue ? (float)$earliestOverdue->amount_paid : 0,
                'overdue_balance' => $totalOverdueAmount,
                'total_outstanding' => $balance,
                'days_overdue' => $daysOverdue,
                'status' => 'Overdue',
            ];
        })->sortByDesc('days_overdue')->values();

        $totalOverdueSum = (float)$overdueList->sum('overdue_balance');

        return response()->json([
            'overdue_accounts' => $overdueList,
            'total_count' => $overdueList->count(),
            'total_overdue_amount' => $totalOverdueSum,
        ]);
    }

    /**
     * Show single installment account with purchase details, items, schedules, and payment history.
     */
    public function show(Request $request, $id)
    {
        $user = $request->user();
        $today = date('Y-m-d');

        $account = InstallmentAccount::with([
            'customer',
            'sale.processedBy.employee',
            'sale.items.product',
            'paymentSchedules' => function ($q) {
                $q->orderBy('installment_no');
            },
            'payments.receivedBy.employee'
        ])->findOrFail($id);

        // Security check for Store Administrator
        if ($user && in_array($user->role, ['Store Administrator', 'Store Admin'])) {
            $userBranch = $user->employee ? $user->employee->branch : 'Main Branch';
            $accBranch = 'Main Branch';
            if ($account->sale && $account->sale->processedBy && $account->sale->processedBy->employee) {
                $accBranch = $account->sale->processedBy->employee->branch ?: 'Main Branch';
            }
            if ($userBranch !== $accBranch) {
                return response()->json(['message' => 'Unauthorized access to installment account in another branch.'], 403);
            }
        }

        $paid = (float)$account->payments->sum('amount') + (float)$account->down_payment;
        $totalPayable = (float)$account->total_payable;
        $balance = max(0, round($totalPayable - $paid, 2));

        // Branch
        $branch = 'Main Branch';
        if ($account->sale && $account->sale->processedBy && $account->sale->processedBy->employee) {
            $branch = $account->sale->processedBy->employee->branch ?: 'Main Branch';
        }

        // Sale Items
        $saleItems = [];
        if ($account->sale && $account->sale->items) {
            $saleItems = $account->sale->items->map(function ($item) {
                return [
                    'product_id' => $item->product_id,
                    'product_code' => $item->product ? $item->product->product_code : 'SKU',
                    'product_name' => $item->product ? $item->product->product_name : 'Product',
                    'category' => $item->product ? $item->product->category : '',
                    'quantity' => (float)$item->quantity,
                    'unit_price' => (float)$item->unit_price,
                    'discount_amount' => (float)$item->discount_amount,
                    'line_total' => (float)$item->line_total,
                ];
            });
        }

        // Payment Schedules
        $schedules = $account->paymentSchedules->map(function ($s) use ($today) {
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
                'due_date' => $s->due_date,
                'amount_due' => (float)$s->amount_due,
                'amount_paid' => (float)$s->amount_paid,
                'balance_due' => (float)$s->balance_due,
                'status' => $status,
                'paid_date' => $s->paid_date,
                'notes' => $s->notes,
            ];
        });

        // Next Payment
        $nextSchedule = $schedules->firstWhere('balance_due', '>', 0);

        // Payments History
        $payments = $account->payments->map(function ($p) {
            $receivedName = 'Staff';
            if ($p->receivedBy) {
                $receivedName = $p->receivedBy->employee 
                    ? "{$p->receivedBy->employee->first_name} {$p->receivedBy->employee->last_name}" 
                    : $p->receivedBy->username;
            }

            return [
                'payment_id' => $p->payment_id,
                'installment_id' => $p->installment_id,
                'schedule_id' => $p->schedule_id,
                'receipt_no' => $p->receipt_no,
                'payment_date' => $p->payment_date,
                'amount' => (float)$p->amount,
                'payment_method' => $p->payment_method,
                'reference_no' => $p->reference_no,
                'received_by' => $receivedName,
                'status' => 'Completed',
                'notes' => $p->notes,
            ];
        });

        return response()->json([
            'account' => [
                'installment_id' => $account->installment_id,
                'account_no' => $account->account_no,
                'customer_id' => $account->customer_id,
                'customer_name' => $account->customer ? "{$account->customer->first_name} {$account->customer->last_name}" : 'Customer',
                'customer_phone' => $account->customer ? $account->customer->phone : '—',
                'customer_email' => $account->customer ? $account->customer->email : '—',
                'customer_address' => $account->customer ? $account->customer->address : '—',
                'branch' => $branch,
                'sale_id' => $account->sale_id,
                'invoice_no' => $account->sale ? $account->sale->invoice_no : 'N/A',
                'sale_date' => $account->sale ? $account->sale->sale_date : $account->start_date,
                'start_date' => $account->start_date,
                'principal_amount' => (float)$account->principal_amount,
                'down_payment' => (float)$account->down_payment,
                'financed_amount' => max(0, (float)$account->principal_amount - (float)$account->down_payment),
                'interest_rate' => (float)$account->interest_rate,
                'interest_amount' => (float)$account->interest_amount,
                'total_payable' => $totalPayable,
                'installment_amount' => (float)$account->installment_amount,
                'number_of_installments' => (int)$account->number_of_installments,
                'frequency' => $account->frequency ?: 'Monthly',
                'paid' => round($paid, 2),
                'balance' => $balance,
                'progress_percentage' => $totalPayable > 0 ? min(100, round(($paid / $totalPayable) * 100, 1)) : 0,
                'status' => $balance <= 0 ? 'Completed' : $account->status,
                'notes' => $account->notes,
            ],
            'next_payment' => $nextSchedule ? [
                'due_date' => $nextSchedule['due_date'],
                'amount_due' => $nextSchedule['balance_due'],
                'status' => $nextSchedule['status'],
                'installment_no' => $nextSchedule['installment_no'],
            ] : null,
            'sale_items' => $saleItems,
            'schedules' => $schedules,
            'payments' => $payments,
        ]);
    }

    /**
     * Update installment account details or status.
     */
    public function update(Request $request, $id)
    {
        $user = $request->user();
        $account = InstallmentAccount::with('customer')->findOrFail($id);

        $validated = $request->validate([
            'status' => 'nullable|string|in:Active,Pending,Overdue,Completed,Cancelled,Defaulted,Repossessed',
            'notes' => 'nullable|string',
            'phone' => 'nullable|string|max:20',
            'address' => 'nullable|string|max:255',
            'installment_amount' => 'nullable|numeric|min:1',
        ]);

        if (isset($validated['status'])) {
            $account->status = $validated['status'];
        }
        if (isset($validated['notes'])) {
            $account->notes = $validated['notes'];
        }
        if (isset($validated['installment_amount'])) {
            $account->installment_amount = (float)$validated['installment_amount'];
        }
        $account->save();

        if ($account->customer && (!empty($validated['phone']) || !empty($validated['address']))) {
            $account->customer->update(array_filter([
                'phone' => $validated['phone'] ?? null,
                'address' => $validated['address'] ?? null,
            ]));
        }

        SystemLog::create([
            'user_id' => $user ? $user->user_id : 1,
            'action' => 'UPDATE',
            'module' => 'Installments',
            'description' => "Updated installment account {$account->account_no} (Status: {$account->status})",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        $account->load([
            'customer',
            'sale.processedBy.employee',
            'sale.items.product',
            'payments',
            'paymentSchedules'
        ]);

        return response()->json([
            'message' => "Installment account {$account->account_no} updated successfully",
            'account' => $this->formatAccount($account, date('Y-m-d')),
        ]);
    }

    /**
     * Delete an installment account and its associated schedules/payments safely.
     */
    public function destroy(Request $request, $id)
    {
        $user = $request->user();
        $account = InstallmentAccount::with(['sale', 'payments', 'paymentSchedules'])->findOrFail($id);

        return DB::transaction(function () use ($account, $user, $request) {
            $accountNo = $account->account_no;

            // Delete payments
            Payment::where('installment_id', $account->installment_id)->delete();

            // Delete payment schedules
            PaymentSchedule::where('installment_id', $account->installment_id)->delete();

            // Delete associated sale items & transaction if created for this installment
            if ($account->sale_id) {
                SaleItem::where('sale_id', $account->sale_id)->delete();
                SaleTransaction::where('sale_id', $account->sale_id)->delete();
            }

            // Delete account
            $account->delete();

            SystemLog::create([
                'user_id' => $user ? $user->user_id : 1,
                'action' => 'DELETE',
                'module' => 'Installments',
                'description' => "Deleted installment account {$accountNo}",
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ]);

            return response()->json([
                'message' => "Installment account {$accountNo} deleted successfully",
                'installment_id' => (int)$account->installment_id,
            ]);
        });
    }
}
