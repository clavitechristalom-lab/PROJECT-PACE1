<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Product;
use App\Models\InstallmentAccount;
use App\Models\Payment;
use App\Models\PaymentSchedule;
use Illuminate\Support\Facades\DB;

class CustomerDashboardController extends Controller
{
    /**
     * Helper to resolve customer ID for authenticated customer user
     */
    public static function resolveCustomerId($user)
    {
        if (!$user) return null;
        if (!empty($user->customer_id)) return $user->customer_id;
        if ($user->customer?->customer_id) {
            $user->customer_id = $user->customer->customer_id;
            try { $user->saveQuietly(); } catch (\Throwable $e) {}
            return $user->customer->customer_id;
        }

        $cust = \App\Models\Customer::where(function ($q) use ($user) {
            if (!empty($user->email)) {
                $q->orWhere('email', $user->email);
            }
            if (!empty($user->phone_number)) {
                $q->orWhere('phone', $user->phone_number);
            }
            if (!empty($user->username)) {
                $q->orWhere('email', $user->username)
                  ->orWhere('phone', $user->username)
                  ->orWhere('customer_code', $user->username);
            }
        })->first();

        if ($cust) {
            $user->customer_id = $cust->customer_id;
            try { $user->saveQuietly(); } catch (\Throwable $e) {}
            return $cust->customer_id;
        }

        return null;
    }

    /**
     * Get summary metrics for the customer dashboard
     */
    public function getDashboard(Request $request)
    {
        $user = $request->user();
        if (!$user || $user->role !== 'Customer') {
            return response()->json(['message' => 'Unauthorized or missing customer profile'], 403);
        }

        $customerId = self::resolveCustomerId($user);

        // Products metrics scoped by branch (with fallback to all active products)
        $branchId = null;
        if ($customerId) {
            $customer = \App\Models\Customer::find($customerId);
            if ($customer) {
                $branchId = $customer->branch_id;
            }
        }

        $prodQuery = Product::query();
        if ($branchId && Product::where('branch_id', $branchId)->exists()) {
            $prodQuery->where('branch_id', $branchId);
        }

        $prodStats = (clone $prodQuery)->selectRaw("
            COUNT(*) as total,
            COUNT(CASE WHEN stock_quantity <= 0 THEN 1 END) as out_of_stock,
            COUNT(CASE WHEN status = 'Active' AND discount_price IS NOT NULL THEN 1 END) as sale_items
        ")->first();

        $totalProducts = (int)($prodStats->total ?? 0);
        $outOfStockCount = (int)($prodStats->out_of_stock ?? 0);
        $saleItemCount = (int)($prodStats->sale_items ?? 0);

        $categories = (clone $prodQuery)->select('category', \Illuminate\Support\Facades\DB::raw('count(*) as count'))
            ->groupBy('category')
            ->get()
            ->map(function ($row) {
                $hier = \App\Services\CategoryFramework::resolveHierarchy($row->category);
                return [
                    'category' => $row->category,
                    'count' => (int) $row->count,
                    'main_category' => $hier['main_category'],
                    'category_group' => $hier['category_group'],
                    'subcategory' => $hier['subcategory'],
                ];
            });

        // Financial metrics for this customer
        if ($customerId) {
            $activeInstallments = InstallmentAccount::where('customer_id', $customerId)
                ->whereIn('status', ['Active', 'Pending'])
                ->get();
                
            $monthlyPayment = $activeInstallments->sum('installment_amount');
            
            // Calculate remaining credit balance
            $activeInstallments->load('paymentSchedules');
            $totalCreditBalance = $activeInstallments->reduce(function ($carry, $inst) {
                if ($inst->status === 'Pending') {
                    return $carry + (float)$inst->total_payable;
                }
                $paid = (float)$inst->payments->sum('amount');
                return $carry + max(0, round($inst->total_payable - $paid, 2));
            }, 0);

            // Overdue count
            $overdueCount = PaymentSchedule::whereIn('installment_id', $activeInstallments->pluck('installment_id'))
                ->where('due_date', '<', now()->format('Y-m-d'))
                ->where('status', 'Pending')
                ->count();
            $walletBalance = (float)(\App\Models\Customer::where('customer_id', $customerId)->value('wallet_balance') ?? 0);
        } else {
            $monthlyPayment = 0;
            $totalCreditBalance = 0;
            $overdueCount = 0;
            $walletBalance = 0;
        }

        // Resolve Store Admin contact number for the customer's branch
        $storeAdminPhone = null;
        $storeAdminName = null;
        $branchProfile = $branchId ? \App\Models\BranchProfile::with('manager.employee')->find($branchId) : null;

        $storeAdminQuery = \App\Models\User::with('employee')
            ->whereIn('role', [\App\Models\User::ROLE_STORE_ADMIN, 'Store Admin'])
            ->where('is_active', true);

        $storeAdminUser = null;
        if ($branchId) {
            $storeAdminUser = (clone $storeAdminQuery)
                ->whereHas('employee', function ($q) use ($branchId) {
                    $q->where('branch_id', $branchId);
                })
                ->first();
        }
        if (!$storeAdminUser && $branchProfile?->manager) {
            $storeAdminUser = $branchProfile->manager;
        }
        if (!$storeAdminUser) {
            $storeAdminUser = $storeAdminQuery->first();
        }

        if ($storeAdminUser) {
            $storeAdminPhone = $storeAdminUser->employee?->phone ?: $storeAdminUser->phone_number;
            $empName = $storeAdminUser->employee
                ? trim("{$storeAdminUser->employee->first_name} {$storeAdminUser->employee->last_name}")
                : '';
            $storeAdminName = $empName ?: ($storeAdminUser->username ?: null);
        }

        if (!$storeAdminPhone && $branchId) {
            $managerEmp = \App\Models\Employee::where('branch_id', $branchId)
                ->where('position', \App\Models\Employee::POSITION_MANAGER)
                ->whereNotNull('phone')
                ->where('phone', '!=', '')
                ->first();
            if ($managerEmp) {
                $storeAdminPhone = $managerEmp->phone;
                $storeAdminName = trim("{$managerEmp->first_name} {$managerEmp->last_name}") ?: $storeAdminName;
            }
        }

        if (!$storeAdminPhone && !empty($branchProfile?->contact_number)) {
            $storeAdminPhone = $branchProfile->contact_number;
        }

        return response()->json([
            'metrics' => [
                'total_products' => $totalProducts,
                'categories' => $categories,
                'monthly_payment' => $monthlyPayment,
                'total_credit_balance' => $totalCreditBalance,
                'sale_items_count' => $saleItemCount,
                'out_of_stock_count' => $outOfStockCount,
                'overdue_count' => $overdueCount,
                'wallet_balance' => $walletBalance,
                'allow_installment' => (bool)(\App\Models\Customer::where('customer_id', $customerId)->value('allow_installment') ?? false),
                'store_admin_phone' => $storeAdminPhone,
                'store_admin_name' => $storeAdminName,
            ]
        ]);
    }

    /**
     * Get installment ledgers for the authenticated customer
     */
    public function getInstallments(Request $request)
    {
        $user = $request->user();
        if (!$user || $user->role !== 'Customer') {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $customerId = self::resolveCustomerId($user);

        if (!$customerId) {
            return response()->json(['installments' => []]);
        }

        $installments = InstallmentAccount::with(['sale.items.product', 'payments', 'paymentSchedules'])
            ->where('customer_id', $customerId)
            ->orderBy('created_at', 'desc')
            ->get();

        $formatted = $installments->map(function ($inst) {
            $productName = 'Unknown Product';
            $imageUrl = null;
            if ($inst->sale && $inst->sale->items && $inst->sale->items->count() > 0) {
                $firstItem = $inst->sale->items->first();
                $productName = $inst->sale->items->count() === 1
                    ? ($firstItem->product?->product_name ?? 'Unknown Product')
                    : ($firstItem->product ? $firstItem->product->product_name . ' (+' . ($inst->sale->items->count() - 1) . ' items)' : 'Multiple Items');
                $imageUrl = $firstItem->product?->image_url ?? $firstItem->product?->image ?? null;
            }

            $paidAmount = (float)$inst->payments->sum('amount');
            $balance = max(0, round($inst->total_payable - $paidAmount, 2));
            
            $nextDue = $inst->paymentSchedules
                ->where('status', 'Pending')
                ->where('due_date', '>=', now()->format('Y-m-d'))
                ->sortBy('due_date')
                ->first();

            return [
                'account_no' => $inst->account_no,
                'product' => $productName,
                'purchase_date' => $inst->start_date,
                'total_amount' => $inst->principal_amount + $inst->interest_amount,
                'monthly_payment' => $inst->installment_amount,
                'paid_amount' => $paidAmount,
                'balance' => $balance,
                'next_due_date' => $nextDue ? $nextDue->due_date : null,
                'status' => $inst->status,
                'image_url' => $imageUrl,
                'installment_id' => $inst->installment_id,
                'payment_method' => $inst->sale?->payment_method ?? 'Installment',
                'updated_at' => $inst->updated_at,
                'payments' => $inst->payments->map(function ($p) {
                    return [
                        'payment_id' => $p->payment_id,
                        'receipt_no' => $p->receipt_no,
                        'payment_date' => $p->payment_date,
                        'amount' => (float)$p->amount,
                        'payment_method' => $p->payment_method,
                        'reference_no' => $p->reference_no,
                        'status' => $p->status,
                        'notes' => $p->notes,
                    ];
                }),
                'paymentSchedules' => $inst->paymentSchedules->map(function ($s) use ($balance) {
                    if ($balance <= 0) {
                        $s->balance_due = 0;
                        $s->status = 'Paid';
                        $s->amount_paid = max((float)$s->amount_paid, (float)$s->amount_due);
                    }
                    return $s;
                })
            ];
        });

        return response()->json([
            'installments' => $formatted
        ]);
    }

    public function requestProduct(Request $request)
    {
        $user = $request->user();
        if (!$user || $user->role !== 'Customer') {
            return response()->json(['message' => 'Unauthorized or missing customer profile'], 403);
        }

        $customerId = self::resolveCustomerId($user);

        $validated = $request->validate([
            'product_id' => 'required|exists:products,product_id',
            'amount' => 'required|numeric|min:0',
            'payment_method' => 'required|string',
            'reference_no' => 'nullable|string|max:100',
            'proof_of_payment' => 'nullable|file|mimes:jpeg,png,webp|max:5120',
        ]);

        $product = Product::find($validated['product_id']);
        if (!$product) {
            return response()->json([
                'message' => 'The selected product is unavailable or no longer exists.'
            ], 404);
        }
        
        if ($product->stock_quantity <= 0) {
            return response()->json([
                'message' => 'OUT OF STOCK THIS PRODUCT'
            ], 422);
        }

        $actualPrice = $product->discount_price > 0 ? $product->discount_price : $product->unit_price;

        $isFullPayment = $validated['amount'] >= $actualPrice;

        if (!$isFullPayment) {
            $customer = \App\Models\Customer::find($customerId);
            if (!$customer || !$customer->allow_installment) {
                return response()->json([
                    'message' => 'Installment is not permitted for your account. Only your Store Administrator can allow the installment process.',
                ], 403);
            }
        }

        return DB::transaction(function () use ($validated, $customerId, $product, $actualPrice, $isFullPayment, $request) {
            $sale = \App\Models\SaleTransaction::create([
                'invoice_no'      => 'REQ-' . date('Ymd') . '-' . rand(1000, 9999),
                'customer_id'     => $customerId,
                'processed_by'    => $request->user()->user_id,
                'branch_id'       => $product->branch_id,
                'sale_date'       => now(),
                'payment_method'  => $isFullPayment ? 'Cash' : 'Installment',
                'subtotal'        => $actualPrice,
                'discount_amount' => 0,
                'total_amount'    => $actualPrice,
                'amount_paid'     => $validated['amount'],
                'balance_due'     => max(0, $actualPrice - $validated['amount']),
                'status'          => 'Pending',
                'notes'           => 'Customer requested product via dashboard.',
            ]);

            \App\Models\SaleItem::create([
                'sale_id'         => $sale->sale_id,
                'product_id'      => $product->product_id,
                'quantity'        => 1,
                'unit_price'      => $actualPrice,
                'discount_amount' => 0,
                'line_total'      => $actualPrice,
            ]);

            // Automatically deduct stock for online payments (GCash, Maya, Bank Account)
            $onlineMethods = ['gcash', 'maya', 'bank account', 'bank transfer'];
            if (in_array(strtolower($validated['payment_method']), $onlineMethods) || $isFullPayment) {
                $product->stock_quantity = max(0, $product->stock_quantity - 1);
                $product->save();
            }

            // Create the InstallmentAccount for this request
            $accCount = InstallmentAccount::count() + 1;
            $accountNo = 'REQ-' . str_pad($accCount, 4, '0', STR_PAD_LEFT);
            
            $instAccount = InstallmentAccount::create([
                'account_no' => $accountNo,
                'sale_id' => $sale->sale_id,
                'customer_id' => $customerId,
                'start_date' => now()->toDateString(),
                'principal_amount' => $actualPrice,
                'down_payment' => $validated['amount'],
                'interest_rate' => 0,
                'interest_amount' => 0,
                'total_payable' => max(0, $actualPrice - $validated['amount']),
                'installment_amount' => 0,
                'number_of_installments' => 0,
                'frequency' => 'Monthly',
                'status' => $isFullPayment ? 'Completed' : 'Pending',
                'notes' => $isFullPayment ? "Fully paid via {$validated['payment_method']}" : 'Pending approval for new product request',
            ]);

            $scheduleId = null;
            if ($isFullPayment) {
                $schedule = \App\Models\PaymentSchedule::create([
                    'installment_id' => $instAccount->installment_id,
                    'installment_no' => 1,
                    'due_date' => now()->toDateString(),
                    'amount_due' => $actualPrice,
                    'amount_paid' => $validated['amount'],
                    'balance_due' => 0,
                    'status' => 'Fully Paid',
                    'paid_date' => now()->toDateString(),
                    'notes' => 'Full Payment',
                ]);
                $scheduleId = $schedule->schedule_id;
            }

            // Save payment if any
            if ($validated['amount'] > 0) {
                $paymentCount = (\App\Models\Payment::max('payment_id') ?? 0) + 1;
                $receiptNo = 'REC-' . date('Y') . '-' . str_pad($paymentCount, 5, '0', STR_PAD_LEFT);
                while (\App\Models\Payment::where('receipt_no', $receiptNo)->exists()) {
                    $paymentCount++;
                    $receiptNo = 'REC-' . date('Y') . '-' . str_pad($paymentCount, 5, '0', STR_PAD_LEFT);
                }
                
                $payment = new Payment([
                    'receipt_no'     => $receiptNo,
                    'amount'         => $validated['amount'],
                    'payment_date'   => now(),
                    'payment_method' => $validated['payment_method'],
                    'reference_no'   => $validated['reference_no'] ?? null,
                    'notes'          => $isFullPayment ? "{$validated['payment_method']} payment for product" : 'Downpayment for product request',
                    'received_by'    => null,
                    'status'         => $isFullPayment ? 'Completed' : 'Pending',
                ]);


                if ($request->hasFile('proof_of_payment')) {
                    $path = $request->file('proof_of_payment')->store('payments', 'public');
                    $payment->proof_of_payment = $path;
                }
                
                $payment->installment_id = $instAccount->installment_id;
                $payment->schedule_id = $scheduleId;
                $payment->save();

                if ($isFullPayment) {
                    $sale->payment_method = $validated['payment_method'];
                    $sale->status = 'Completed';
                    $sale->save();

                    $notifData = [
                        'type' => 'payment_received',
                        'title' => "{$validated['payment_method']} Payment Automatically Processed",
                        'message' => "Customer {$request->user()->first_name} {$request->user()->last_name} has fully paid (₱" . number_format($validated['amount'], 2) . ") via {$validated['payment_method']} for the product {$product->product_name}.",
                        'module' => 'Sales',
                        'related_id' => $sale->sale_id,
                        'related_type' => 'App\Models\SaleTransaction',
                        'action_url' => "/sales?id={$sale->sale_id}",
                        'priority' => 'high',
                    ];

                    \App\Services\NotificationService::sendToAdmins($notifData);
                    \App\Services\NotificationService::sendToStoreAdmins($notifData, $product->branch_id);
                }
            }

            return response()->json([
                'success' => true,
                'message' => 'Product request submitted successfully.',
            ]);
        });
    }

    /**
     * Customer submits an application/request to Store Admin for installment eligibility.
     */
    public function requestInstallment(Request $request)
    {
        $user = $request->user();
        if (!$user || $user->role !== 'Customer') {
            return response()->json(['message' => 'Unauthorized or missing customer profile'], 403);
        }

        $customerId = self::resolveCustomerId($user);
        if (!$customerId) {
            return response()->json(['message' => 'Customer account could not be found.'], 404);
        }

        $customer = \App\Models\Customer::findOrFail($customerId);

        if ($customer->allow_installment) {
            return response()->json([
                'success' => true,
                'message' => 'Your account is already authorized for installment purchases.'
            ]);
        }

        $notes = $request->input('notes', 'Customer applied for installment approval via dashboard.');

        // Update customer installment notes
        $customer->installment_notes = $notes;
        $customer->save();

        // Send alert to Store Administrators of the branch
        $notifData = [
            'type' => 'installment_request',
            'title' => 'Customer Installment Request',
            'message' => "Customer {$customer->first_name} {$customer->last_name} ({$customer->customer_code}) has requested authorization for installment purchases.",
            'module' => 'Installments',
            'related_id' => $customer->customer_id,
            'related_type' => 'App\Models\Customer',
            'action_url' => "/customers?search={$customer->customer_code}",
            'priority' => 'high',
        ];

        \App\Services\NotificationService::sendToAdmins($notifData);
        if ($customer->branch_id) {
            \App\Services\NotificationService::sendToStoreAdmins($notifData, $customer->branch_id);
        }

        \App\Models\SystemLog::create([
            'user_id' => $user->user_id,
            'action' => 'INSTALLMENT_REQUEST_SUBMITTED',
            'module' => 'Installments',
            'description' => "Customer {$customer->first_name} {$customer->last_name} requested Store Admin installment approval.",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Installment request submitted successfully. Your Store Administrator has been notified to review and allow your account.',
        ]);
    }

    /**
     * Get Statement of Account ledger, summary, and items for the authenticated customer
     */
    public function getStatements(Request $request)
    {
        $user = $request->user();
        if (!$user || $user->role !== 'Customer') {
            return response()->json(['message' => 'Unauthorized or missing customer profile'], 403);
        }

        $customerId = self::resolveCustomerId($user);
        if (!$customerId) {
            return response()->json([
                'customer' => null,
                'summary' => [
                    'total_purchases' => 0,
                    'total_paid' => 0,
                    'total_balance' => 0,
                    'active_accounts_count' => 0,
                    'next_due_date' => null,
                    'next_due_amount' => 0,
                ],
                'statements' => [],
                'installments' => [],
            ]);
        }

        $customer = \App\Models\Customer::with(['branch', 'branchProfile'])->find($customerId);

        // Fetch sales transactions
        $sales = \App\Models\SaleTransaction::with(['items.product', 'branch'])
            ->where('customer_id', $customerId)
            ->orderBy('sale_date', 'desc')
            ->get();

        // Fetch installment accounts with full relationships
        $installments = InstallmentAccount::with(['sale.items.product', 'payments', 'paymentSchedules', 'customer'])
            ->where('customer_id', $customerId)
            ->orderBy('created_at', 'desc')
            ->get();

        // Fetch all direct payments
        $payments = Payment::whereHas('installmentAccount', function ($q) use ($customerId) {
            $q->where('customer_id', $customerId);
        })->orderBy('payment_date', 'desc')
          ->get();

        // Fetch e-wallet deposits
        $ewalletDeposits = \App\Models\EWalletDeposit::where('customer_id', $customerId)
            ->where('status', 'Completed')
            ->orderBy('created_at', 'desc')
            ->get();

        $statementItems = collect();

        try {
            if (\Illuminate\Support\Facades\Schema::hasTable('statements')) {
                \App\Models\Statement::syncCustomerStatements((int)$customerId);
            }
        } catch (\Throwable $e) {}

        // 1. Map Sales (Invoices / Purchases)
        foreach ($sales as $sale) {
            $productNames = $sale->items->map(function ($it) {
                return $it->product ? $it->product->product_name : 'Item';
            })->filter()->implode(', ');

            $desc = $productNames ?: ($sale->notes ?: 'Product Purchase');
            $refVal = $sale->invoice_no ?: ('INV-' . $sale->sale_id);
            $chanVal = $sale->payment_method ?: 'Sale';
            $statementItems->push([
                'id' => 'SALE-' . $sale->sale_id,
                'date' => date('Y-m-d', strtotime($sale->sale_date)),
                'raw_date' => strtotime($sale->sale_date),
                'reference_no' => $refVal,
                'reference' => $refVal,
                'type' => 'Purchase',
                'category' => 'Debit',
                'description' => $desc,
                'channel_method' => $chanVal,
                'payment_method' => $chanVal,
                'amount' => (float)$sale->total_amount,
                'status' => $sale->status ?: 'Completed',
                'account_no' => $sale->invoice_no,
            ]);
        }

        // 2. Map Installments Purchases (if not already represented in sales)
        foreach ($installments as $inst) {
            $alreadyAdded = $statementItems->contains(function ($item) use ($inst) {
                return $inst->sale && $item['reference'] === $inst->sale->invoice_no;
            });

            if (!$alreadyAdded && (float)$inst->total_payable > 0) {
                $productName = 'Installment Purchase';
                if ($inst->sale && $inst->sale->items && $inst->sale->items->count() > 0) {
                    $productName = $inst->sale->items->map(fn($it) => $it->product?->product_name ?? 'Item')->implode(', ');
                }

                $statementItems->push([
                    'id' => 'INST-' . $inst->installment_id,
                    'date' => date('Y-m-d', strtotime($inst->start_date ?: $inst->created_at)),
                    'raw_date' => strtotime($inst->start_date ?: $inst->created_at),
                    'reference_no' => $inst->account_no,
                    'reference' => $inst->account_no,
                    'type' => 'Purchase',
                    'category' => 'Debit',
                    'description' => $productName,
                    'channel_method' => 'Installment Plan',
                    'payment_method' => 'Installment Plan',
                    'amount' => (float)($inst->principal_amount + $inst->interest_amount),
                    'status' => $inst->status,
                    'account_no' => $inst->account_no,
                ]);
            }

            // Down Payment record if non-zero and not explicitly in payments table
            if ((float)$inst->down_payment > 0) {
                $hasDownpaymentPayment = $inst->payments->contains(function ($p) {
                    $notes = strtolower($p->notes ?? '');
                    return str_contains($notes, 'downpayment') || str_contains($notes, 'down payment');
                });

                if (!$hasDownpaymentPayment) {
                    $dpRef = 'DP-' . $inst->account_no;
                    $statementItems->push([
                        'id' => 'DOWN-' . $inst->installment_id,
                        'date' => date('Y-m-d', strtotime($inst->start_date ?: $inst->created_at)),
                        'raw_date' => strtotime($inst->start_date ?: $inst->created_at),
                        'reference_no' => $dpRef,
                        'reference' => $dpRef,
                        'type' => 'Down Payment',
                        'category' => 'Credit',
                        'description' => 'Down payment for ' . $inst->account_no,
                        'channel_method' => 'Down Payment',
                        'payment_method' => 'Down Payment',
                        'amount' => (float)$inst->down_payment,
                        'status' => 'Completed',
                        'account_no' => $inst->account_no,
                    ]);
                }
            }
        }

        // 3. Map Payments
        $seenReceipts = [];
        foreach ($payments as $payment) {
            $key = ($payment->receipt_no ?: ('PAY-' . $payment->payment_id));
            if (isset($seenReceipts[$key])) continue;
            $seenReceipts[$key] = true;

            $instAcc = $payment->installmentAccount;
            $desc = $payment->notes ?: ($instAcc ? "Payment for {$instAcc->account_no}" : "Payment Received");
            $payRef = $payment->receipt_no ?: ('REC-' . $payment->payment_id);
            $payChan = $payment->payment_method ?: 'Payment';

            $statementItems->push([
                'id' => 'PAY-' . $payment->payment_id,
                'date' => date('Y-m-d', strtotime($payment->payment_date ?: $payment->created_at)),
                'raw_date' => strtotime($payment->payment_date ?: $payment->created_at),
                'reference_no' => $payRef,
                'reference' => $payRef,
                'type' => 'Payment',
                'category' => 'Credit',
                'description' => $desc,
                'channel_method' => $payChan,
                'payment_method' => $payChan,
                'amount' => (float)$payment->amount,
                'status' => $payment->status ?: 'Completed',
                'account_no' => $instAcc ? $instAcc->account_no : '—',
            ]);
        }

        // 4. Map E-Wallet deposits (if not already captured in payments)
        foreach ($ewalletDeposits as $ew) {
            if ($ew->payment_id && isset($seenReceipts['PAY-' . $ew->payment_id])) continue;
            if ($ew->transaction_reference && isset($seenReceipts[$ew->transaction_reference])) continue;

            $ewRef = $ew->transaction_reference ?: ('EWAL-' . $ew->deposit_id);
            $ewChan = $ew->payment_method ?: 'E-Wallet';
            $statementItems->push([
                'id' => 'EWAL-' . $ew->deposit_id,
                'date' => date('Y-m-d', strtotime($ew->paid_at ?: $ew->created_at)),
                'raw_date' => strtotime($ew->paid_at ?: $ew->created_at),
                'reference_no' => $ewRef,
                'reference' => $ewRef,
                'type' => 'Payment',
                'category' => 'Credit',
                'description' => "E-Wallet Payment ({$ewChan})",
                'channel_method' => $ewChan,
                'payment_method' => $ewChan,
                'amount' => (float)$ew->amount,
                'status' => 'Completed',
                'account_no' => $ew->customer_reference ?: 'E-Wallet',
            ]);
        }

        // Sort descending by date
        $sortedStatements = $statementItems->sortByDesc('raw_date')->values();

        // Calculate Totals & Summary
        $totalPurchases = $statementItems->where('type', 'Purchase')->sum('amount');
        if ($totalPurchases == 0) {
            $totalPurchases = $installments->sum(fn($i) => (float)($i->principal_amount + $i->interest_amount));
        }

        $totalPaid = $statementItems->whereIn('type', ['Payment', 'Down Payment'])->sum('amount');
        $totalBalance = max(0, round($totalPurchases - $totalPaid, 2));

        // Find next due date from schedules
        $allSchedules = $installments->flatMap->paymentSchedules;
        $nextPending = $allSchedules->where('status', 'Pending')
            ->where('due_date', '>=', now()->format('Y-m-d'))
            ->sortBy('due_date')
            ->first();

        $branchName = $customer ? ($customer->branch_name ?? $customer->branch?->name) : null;

        return response()->json([
            'customer' => $customer ? [
                'customer_id' => $customer->customer_id,
                'customer_code' => $customer->customer_code,
                'name' => trim("{$customer->first_name} " . ($customer->middle_name ? "{$customer->middle_name} " : "") . "{$customer->last_name}"),
                'email' => $customer->email,
                'phone' => $customer->phone,
                'address' => $customer->address,
                'branch_name' => $branchName,
                'wallet_balance' => (float)($customer->wallet_balance ?? 0),
            ] : null,
            'summary' => [
                'total_purchases' => (float)$totalPurchases,
                'total_paid' => (float)$totalPaid,
                'total_balance' => (float)$totalBalance,
                'active_accounts_count' => $installments->whereIn('status', ['Active', 'Pending'])->count(),
                'next_due_date' => $nextPending ? $nextPending->due_date : null,
                'next_due_amount' => $nextPending ? (float)($nextPending->balance_due ?? $nextPending->amount_due) : 0,
            ],
            'statements' => $sortedStatements,
            'accounts' => $installments->map(function ($inst) {
                return [
                    'account_no' => $inst->account_no,
                    'product' => $inst->sale?->items?->first()?->product?->product_name ?? 'Product',
                    'status' => $inst->status,
                    'total_payable' => (float)$inst->total_payable,
                    'total_paid' => (float)$inst->total_paid,
                    'balance' => (float)$inst->balance,
                    'installment_amount' => (float)$inst->installment_amount,
                ];
            }),
        ]);
    }
}
