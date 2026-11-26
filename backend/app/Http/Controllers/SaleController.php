<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\SaleTransaction;
use App\Models\SaleItem;
use App\Models\Product;
use App\Models\Customer;
use App\Models\InstallmentAccount;
use App\Models\PaymentSchedule;
use App\Models\Payment;
use App\Models\SystemLog;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;
use App\Services\AgentContributionService;
use App\Services\NotificationService;

class SaleController extends Controller
{
    public function agents(Request $request)
    {
        $user = $request->user();
        $branchId = $request->filled('branch_id') && is_numeric($request->query('branch_id'))
            ? (int) $request->query('branch_id')
            : null;

        $agents = AgentContributionService::eligibleAgentsQuery($user, $branchId)
            ->get()
            ->map(fn ($emp) => AgentContributionService::formatAgent($emp))
            ->values();

        return response()->json([
            'agents' => $agents,
            'total' => $agents->count(),
        ]);
    }

    public function index(Request $request)
    {
        $user = $request->user();

        // 1-2s Performance Cache: bypass if exporting CSV
        if (!$request->boolean('export_csv')) {
            $cacheKey = 'pace_sales_idx_' . md5(json_encode([
                'u' => $user ? $user->user_id : 0,
                'r' => $user ? $user->role : '',
                'b' => $request->query('branch', ''),
                's' => $request->query('search', ''),
                'st' => $request->query('status', ''),
                'pm' => $request->query('payment_method', ''),
                'df' => $request->query('date_from', ''),
                'dt' => $request->query('date_to', ''),
                'v' => Cache::get('pace_sales_cache_v', 0),
            ]));

            $cached = Cache::get($cacheKey);
            if ($cached !== null) {
                return response()->json($cached);
            }
        }

        $query = SaleTransaction::with([
            'customer:customer_id,first_name,last_name,phone,email',
            'processedBy:user_id,username,employee_id',
            'processedBy.employee:employee_id,first_name,last_name',
            'agent:employee_id,employee_code,first_name,last_name,position'
        ])->select([
            'sale_id',
            'invoice_no',
            'customer_id',
            'processed_by',
            'has_agent',
            'agent_id',
            'appliances_agent_contribution',
            'furniture_agent_contribution',
            'total_agent_contribution',
            'branch_id',
            'sale_date',
            'payment_method',
            'subtotal',
            'discount_amount',
            'total_amount',
            'amount_paid',
            'balance_due',
            'status',
            'notes',
            'created_at'
        ]);

        // Branch / Role scoping
        if ($user && $user->role === 'Customer') {
            $custId = CustomerDashboardController::resolveCustomerId($user);
            $query->where('customer_id', $custId ?: -1);
        } elseif ($user && in_array($user->role, ['Store Administrator', 'Store Admin', 'Employee'], true)) {
            $userBranch = $user->employee ? $user->employee->branch_id : null;
            if ($userBranch) {
                $query->where(function($q) use ($userBranch, $user) {
                    $q->where('branch_id', $userBranch)
                      ->orWhere('processed_by', $user->user_id);
                });
            } else {
                $query->where('processed_by', $user->user_id);
            }
        }

        if ($request->filled('search')) {
            $s = $request->query('search');
            $query->where(function ($q) use ($s) {
                $q->where('invoice_no', 'like', "%{$s}%")
                  ->orWhereHas('customer', function ($cq) use ($s) {
                      $cq->where('first_name', 'like', "%{$s}%")
                         ->orWhere('last_name', 'like', "%{$s}%");
                  });
            });
        }

        if ($request->filled('status') && $request->query('status') !== 'All') {
            $query->where('status', $request->query('status'));
        }

        if ($request->filled('payment_method') && $request->query('payment_method') !== 'All') {
            $query->where('payment_method', $request->query('payment_method'));
        }

        if ($request->filled('date_from')) {
            $query->whereDate('sale_date', '>=', $request->query('date_from'));
        }
        if ($request->filled('date_to')) {
            $query->whereDate('sale_date', '<=', $request->query('date_to'));
        }

        if ($request->filled('branch') && $request->query('branch') !== 'All') {
            $branch = $request->query('branch');
            $query->where('branch_id', $branch);
        }

        if ($request->boolean('export_csv')) {
            SystemLog::create([
                'user_id' => $user ? $user->user_id : null,
                'action' => 'EXPORT',
                'module' => 'Sales',
                'description' => 'Exported Sales Transactions to CSV',
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ]);

            return $this->exportCsv(
                'sales_transactions_export_' . date('Y-m-d') . '.csv',
                ['Transaction ID', 'Invoice No', 'Transaction Date', 'Customer Name', 'Processed By', 'Payment Method', 'Subtotal', 'Discount', 'Total Amount', 'Amount Paid', 'Balance Due', 'Status', 'Notes', 'Created Date'],
                $query->orderByDesc('sale_date'),
                function ($s) {
                    return [
                        $s->sale_id,
                        $s->invoice_no,
                        $s->sale_date,
                        $s->customer ? "{$s->customer->first_name} {$s->customer->last_name}" : 'Walk-in',
                        $s->processedBy ? ($s->processedBy->employee ? "{$s->processedBy->employee->first_name} {$s->processedBy->employee->last_name}" : $s->processedBy->username) : 'Staff',
                        $s->payment_method,
                        $s->subtotal,
                        $s->discount_amount,
                        $s->total_amount,
                        $s->amount_paid,
                        $s->balance_due,
                        $s->status,
                        $s->notes,
                        $s->created_at ? $s->created_at->format('Y-m-d H:i:s') : ''
                    ];
                }
            );
        }

        $sales = $query->orderByDesc('sale_date')->get()->map(function ($s) {
            return [
                'sale_id' => $s->sale_id,
                'invoice_no' => $s->invoice_no,
                'customer_id' => $s->customer_id,
                'customer_name' => $s->customer ? "{$s->customer->first_name} {$s->customer->last_name}" : 'Walk-in',
                'processed_by' => $s->processedBy ? ($s->processedBy->employee ? "{$s->processedBy->employee->first_name} {$s->processedBy->employee->last_name}" : $s->processedBy->username) : 'Staff',
                'has_agent' => (bool) $s->has_agent,
                'agent_id' => $s->agent_id ? (int) $s->agent_id : null,
                'assigned_agent_id' => $s->agent_id ? (int) $s->agent_id : null,
                'agent_name' => $s->agent ? trim("{$s->agent->first_name} {$s->agent->last_name}") : null,
                'agent_code' => $s->agent?->employee_code,
                'appliances_agent_contribution' => (float) ($s->appliances_agent_contribution ?? 0),
                'furniture_agent_contribution' => (float) ($s->furniture_agent_contribution ?? 0),
                'total_agent_contribution' => (float) ($s->total_agent_contribution ?? 0),
                'sale_date' => date('Y-m-d', strtotime($s->sale_date)),
                'payment_method' => $s->payment_method,
                'subtotal' => (float)$s->subtotal,
                'discount_amount' => (float)$s->discount_amount,
                'total_amount' => (float)$s->total_amount,
                'amount_paid' => (float)$s->amount_paid,
                'balance_due' => (float)$s->balance_due,
                'status' => $s->status,
                'notes' => $s->notes,
            ];
        });

        $payload = [
            'sales' => $sales,
            'total' => $sales->count(),
        ];

        if (isset($cacheKey)) {
            Cache::put($cacheKey, $payload, 30);
        }

        return response()->json($payload);
    }

    public function show(Request $request, $id)
    {
        $sale = SaleTransaction::with([
            'customer',
            'processedBy.employee',
            'agent.branch',
            'branch',
            'items.product',
            'installmentAccount.paymentSchedules' => fn($q) => $q->orderBy('installment_no'),
        ])->findOrFail($id);

        $user = $request->user();
        if ($user && $user->role === 'Customer') {
            $custId = CustomerDashboardController::resolveCustomerId($user);
            if ((int) $sale->customer_id !== (int) $custId) {
                return response()->json(['message' => 'Unauthorized access to sale record.'], 403);
            }
        } elseif ($user && in_array($user->role, ['Store Administrator', 'Store Admin', 'Employee'], true)) {
            $userBranch = $user->employee ? $user->employee->branch_id : null;
            if ($userBranch && $sale->branch_id && (int) $sale->branch_id !== (int) $userBranch) {
                return response()->json(['message' => 'Unauthorized access to sale from another branch.'], 403);
            }
        }

        $sysSettings = \App\Models\Setting::whereIn('key', [
            'company_name', 'name', 'tax_id', 'address', 'phone', 'email'
        ])->pluck('value', 'key');

        $companyName = $sysSettings['company_name'] ?? $sysSettings['name'] ?? 'Z-LICZ APPLIANCES';
        $branchProfile = $sale->branch;

        $items = $sale->items->map(function ($item) {
            return [
                'sale_item_id' => $item->sale_item_id,
                'product_id' => $item->product_id,
                'product_name' => $item->product ? $item->product->product_name : 'Item',
                'product_code' => $item->product ? ($item->product->product_code ?? '') : '',
                'brand' => $item->product ? ($item->product->brand ?? '') : '',
                'category' => $item->product ? ($item->product->category ?? '') : '',
                'category_domain' => $item->category_domain ?: AgentContributionService::resolveCategoryDomain($item->product?->category),
                'agent_commission_rate' => (float) ($item->agent_commission_rate ?? 0),
                'agent_contribution' => (float) ($item->agent_contribution ?? 0),
                'quantity' => (float)$item->quantity == (int)$item->quantity ? (int)$item->quantity : (float)$item->quantity,
                'unit_price' => (float)$item->unit_price,
                'discount_amount' => (float)$item->discount_amount,
                'line_total' => (float)$item->line_total,
            ];
        });

        $cust = $sale->customer;
        $processedByName = $sale->processedBy
            ? ($sale->processedBy->employee
                ? trim("{$sale->processedBy->employee->first_name} {$sale->processedBy->employee->last_name}")
                : $sale->processedBy->username)
            : 'Staff';

        return response()->json([
            'sale' => [
                'sale_id' => $sale->sale_id,
                'invoice_no' => $sale->invoice_no,
                'customer_id' => $sale->customer_id,
                'customer_name' => $cust ? trim("{$cust->first_name} {$cust->last_name}") : 'Walk-in Customer',
                'customer_code' => $cust?->customer_code ?? '',
                'customer_phone' => $cust?->phone ?? '',
                'customer_email' => $cust?->email ?? '',
                'customer_address' => $cust?->address ?? '',
                'processed_by' => $processedByName,
                'has_agent' => (bool) $sale->has_agent,
                'agent_id' => $sale->agent_id ? (int) $sale->agent_id : null,
                'assigned_agent_id' => $sale->agent_id ? (int) $sale->agent_id : null,
                'agent_name' => $sale->agent ? trim("{$sale->agent->first_name} {$sale->agent->last_name}") : null,
                'agent_code' => $sale->agent?->employee_code ?? null,
                'agent_position' => $sale->agent?->position ?? null,
                'appliances_agent_contribution' => (float) ($sale->appliances_agent_contribution ?? 0),
                'furniture_agent_contribution' => (float) ($sale->furniture_agent_contribution ?? 0),
                'total_agent_contribution' => (float) ($sale->total_agent_contribution ?? 0),
                'branch_id' => $sale->branch_id,
                'branch_name' => $branchProfile?->name ?? '',
                'branch_location' => $branchProfile?->location ?? ($sysSettings['address'] ?? ''),
                'branch_contact' => $branchProfile?->contact_number ?? ($sysSettings['phone'] ?? ''),
                'company_name' => $companyName,
                'company_tax_id' => $sysSettings['tax_id'] ?? '',
                'company_email' => $sysSettings['email'] ?? '',
                'sale_date' => date('Y-m-d', strtotime($sale->sale_date)),
                'sale_datetime' => date('M d, Y h:i A', strtotime($sale->sale_date)),
                'payment_method' => $sale->payment_method,
                'subtotal' => (float)$sale->subtotal,
                'discount_amount' => (float)$sale->discount_amount,
                'total_amount' => (float)$sale->total_amount,
                'amount_paid' => (float)$sale->amount_paid,
                'balance_due' => (float)$sale->balance_due,
                'status' => $sale->status,
                'notes' => $sale->notes,
            ],
            'items' => $items,
            'installment_account' => $sale->installmentAccount,
        ]);
    }

    public function store(Request $request)
    {
        if ($request->user() && in_array($request->user()->role, ['Administrator', 'Customer'], true)) {
            return response()->json(['success' => false, 'message' => 'Your role is not authorized to create POS sales.'], 403);
        }

        $validated = $request->validate([
            'customer_id' => 'required|exists:customers,customer_id',
            'payment_method' => 'required|in:Cash,GCash,Maya,Bank Account,Installment',
            'sale_date' => 'nullable|date',
            'has_agent' => 'nullable|boolean',
            'agent_id' => 'nullable|integer',
            'assigned_agent_id' => 'nullable|integer',
            'items' => 'required|array|min:1',
            'items.*.product_id' => 'required|exists:products,product_id',
            'items.*.quantity' => 'required|integer|min:1',
            'items.*.discount' => 'nullable|numeric|min:0',
            'down_payment' => 'nullable|numeric|min:0',
            'interest_rate' => 'nullable|numeric|min:0',
            'number_of_installments' => 'nullable|integer|in:3,6,12,18,24',
            'frequency' => 'nullable|string|in:Weekly,Biweekly,Monthly',
            'notes' => 'nullable|string',
        ]);

        return DB::transaction(function () use ($validated, $request) {
            $subtotal = 0;
            $totalDiscount = 0;

            $user = $request->user();
            $userBranch = $user && $user->employee ? $user->employee->branch_id : null;
            $customer = Customer::findOrFail($validated['customer_id']);
            $targetBranchId = $userBranch ?: ($customer->branch_id ? (int) $customer->branch_id : null);
            $agentSelection = AgentContributionService::resolveAgentSelection($request->all(), $user, $targetBranchId);
            $hasAgent = $agentSelection['has_agent'];

            $preparedItems = [];

            foreach ($validated['items'] as $itemData) {
                $product = Product::lockForUpdate()->findOrFail($itemData['product_id']);

                if ($user && in_array($user->role, ['Store Administrator', 'Store Admin'])) {
                    if ($product->branch_id && $product->branch_id != $userBranch) {
                        return response()->json([
                            'message' => "Unauthorized: Product {$product->product_name} does not belong to your branch."
                        ], 403);
                    }
                }

                if ($product->stock_quantity < $itemData['quantity']) {
                    return response()->json([
                        'message' => "Insufficient stock for product {$product->product_name}. Available: {$product->stock_quantity}"
                    ], 422);
                }

                $qty = (int) $itemData['quantity'];
                $effectivePrice = !empty($product->discount_price) ? (float) $product->discount_price : (float) $product->unit_price;
                $itemSubtotal = round($effectivePrice * $qty, 2);
                $itemDiscount = round(min($itemSubtotal, max(0, (float) ($itemData['discount'] ?? 0))), 2);
                $lineTotal = max(0, round($itemSubtotal - $itemDiscount, 2));
                $contribution = AgentContributionService::calculateLine($lineTotal, $product->category, $hasAgent);

                $subtotal += $itemSubtotal;
                $totalDiscount += $itemDiscount;

                $preparedItems[] = [
                    'product' => $product,
                    'quantity' => $qty,
                    'unit_price' => $effectivePrice,
                    'discount_amount' => $itemDiscount,
                    'line_total' => $lineTotal,
                    'contribution' => $contribution,
                ];
            }

            $contributionSummary = AgentContributionService::summarize(
                array_column($preparedItems, 'contribution'),
                $hasAgent
            );

            $totalAmount = max(0, round($subtotal - $totalDiscount, 2));
            $payMethod = $validated['payment_method'];

            $amountPaid = $payMethod === 'Cash'
                ? $totalAmount
                : min($totalAmount, (float)($validated['down_payment'] ?? 0));
            $balanceDue = max(0, $totalAmount - $amountPaid);
            $status = ($payMethod === 'Cash' || $balanceDue <= 0)
                ? 'Completed'
                : ($amountPaid > 0 ? 'Partially Paid' : 'Pending');

            $invoiceCount = SaleTransaction::count() + 1;
            $invoiceNo = 'INV-' . date('Y') . '-' . str_pad($invoiceCount, 3, '0', STR_PAD_LEFT);
            while (SaleTransaction::where('invoice_no', $invoiceNo)->exists()) {
                $invoiceCount++;
                $invoiceNo = 'INV-' . date('Y') . '-' . str_pad($invoiceCount, 3, '0', STR_PAD_LEFT);
            }

            $saleDate = !empty($validated['sale_date'])
                ? \Carbon\Carbon::parse($validated['sale_date'])->setTimeFrom(now())
                : now();

            $sale = SaleTransaction::create([
                'invoice_no' => $invoiceNo,
                'customer_id' => $validated['customer_id'],
                'processed_by' => $user ? $user->user_id : ($request->input('user_id') && \App\Models\User::where('user_id', $request->input('user_id'))->exists() ? $request->input('user_id') : \App\Models\User::value('user_id')),
                'has_agent' => $hasAgent,
                'agent_id' => $agentSelection['agent_id'],
                'appliances_agent_contribution' => $contributionSummary['appliances_agent_contribution'],
                'furniture_agent_contribution' => $contributionSummary['furniture_agent_contribution'],
                'total_agent_contribution' => $contributionSummary['total_agent_contribution'],
                'branch_id' => $targetBranchId,
                'sale_date' => $saleDate,
                'payment_method' => $payMethod,
                'subtotal' => $subtotal,
                'discount_amount' => $totalDiscount,
                'total_amount' => $totalAmount,
                'amount_paid' => $amountPaid,
                'balance_due' => $balanceDue,
                'status' => $status,
                'notes' => $validated['notes'] ?? '',
            ]);

            foreach ($preparedItems as $prepared) {
                $product = $prepared['product'];
                $contrib = $prepared['contribution'];

                SaleItem::create([
                    'sale_id' => $sale->sale_id,
                    'product_id' => $product->product_id,
                    'quantity' => $prepared['quantity'],
                    'unit_price' => $prepared['unit_price'],
                    'discount_amount' => $prepared['discount_amount'],
                    'line_total' => $prepared['line_total'],
                    'category_domain' => $contrib['category_domain'],
                    'agent_commission_rate' => $contrib['agent_commission_rate'],
                    'agent_contribution' => $contrib['agent_contribution'],
                ]);

                $product->decrement('stock_quantity', $prepared['quantity']);

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
            }

            if ($payMethod === 'Installment') {
                $downPayment = min($totalAmount, max(0, (float)($validated['down_payment'] ?? 0)));
                $interestRate = (float)($validated['interest_rate'] ?? 0);
                $numInstallments = (int)($validated['number_of_installments'] ?? 12);
                $frequency = $validated['frequency'] ?? 'Monthly';

                $principal = $totalAmount;
                $financedBase = max(0, $principal - $downPayment);
                $interestAmount = round($financedBase * ($interestRate / 100), 2);
                $totalPayable = round($principal + $interestAmount, 2);
                $installmentAmount = $numInstallments > 0
                    ? round(max(0, $totalPayable - $downPayment) / $numInstallments, 2)
                    : max(0, round($totalPayable - $downPayment, 2));

                $instAccount = InstallmentAccount::where('customer_id', $validated['customer_id'])
                    ->whereIn('status', ['Active', 'Pending'])
                    ->first();

                if ($instAccount) {
                    $instAccount->principal_amount = round((float) $instAccount->principal_amount + $principal, 2);
                    $instAccount->down_payment = round((float) $instAccount->down_payment + $downPayment, 2);
                    $instAccount->interest_amount = round((float) $instAccount->interest_amount + $interestAmount, 2);
                    $instAccount->total_payable = round((float) $instAccount->total_payable + $totalPayable, 2);
                    $instAccount->number_of_installments += $numInstallments;
                    $instAccount->installment_amount = round((float) $instAccount->installment_amount + $installmentAmount, 2);
                    $instAccount->appliances_agent_contribution = round((float) $instAccount->appliances_agent_contribution + $contributionSummary['appliances_agent_contribution'], 2);
                    $instAccount->furniture_agent_contribution = round((float) $instAccount->furniture_agent_contribution + $contributionSummary['furniture_agent_contribution'], 2);
                    $instAccount->total_agent_contribution = round((float) $instAccount->total_agent_contribution + $contributionSummary['total_agent_contribution'], 2);
                    if ($hasAgent && !$instAccount->has_agent) {
                        $instAccount->has_agent = true;
                        $instAccount->agent_id = $agentSelection['agent_id'];
                    }
                    $instAccount->save();

                    $lastSchedule = PaymentSchedule::where('installment_id', $instAccount->installment_id)
                        ->orderBy('installment_no', 'desc')
                        ->first();
                    
                    $startNo = $lastSchedule ? $lastSchedule->installment_no : 0;
                    $lastDate = $lastSchedule ? $lastSchedule->due_date : now()->toDateString();
                } else {
                    $accCount = (InstallmentAccount::max('installment_id') ?? 0) + 1;
                    $accountNo = 'ACC-' . str_pad($accCount, 4, '0', STR_PAD_LEFT);
                    while (InstallmentAccount::where('account_no', $accountNo)->exists()) {
                        $accCount++;
                        $accountNo = 'ACC-' . str_pad($accCount, 4, '0', STR_PAD_LEFT);
                    }

                    $instAccount = InstallmentAccount::create([
                        'account_no' => $accountNo,
                        'customer_id' => $validated['customer_id'],
                        'sale_id' => $sale->sale_id,
                        'has_agent' => $hasAgent,
                        'agent_id' => $agentSelection['agent_id'],
                        'appliances_agent_contribution' => $contributionSummary['appliances_agent_contribution'],
                        'furniture_agent_contribution' => $contributionSummary['furniture_agent_contribution'],
                        'total_agent_contribution' => $contributionSummary['total_agent_contribution'],
                        'start_date' => now()->toDateString(),
                        'principal_amount' => $principal,
                        'down_payment' => $downPayment,
                        'interest_rate' => $interestRate,
                        'interest_amount' => $interestAmount,
                        'total_payable' => $totalPayable,
                        'installment_amount' => $installmentAmount,
                        'number_of_installments' => $numInstallments,
                        'frequency' => $frequency,
                        'status' => 'Active',
                        'notes' => '',
                    ]);
                    
                    $startNo = 0;
                    $lastDate = now()->toDateString();
                }

                // Generate new payment schedules appended
                $scheduleFrequency = $instAccount->frequency ?: $frequency;
                for ($i = 1; $i <= $numInstallments; $i++) {
                    $nextNo = $startNo + $i;
                    
                    $dueDate = match ($scheduleFrequency) {
                        'Weekly' => date('Y-m-d', strtotime($lastDate . ' + ' . $i . ' weeks')),
                        'Biweekly', 'Bi-weekly' => date('Y-m-d', strtotime($lastDate . ' + ' . ($i * 2) . ' weeks')),
                        default => date('Y-m-d', strtotime($lastDate . ' + ' . $i . ' months')),
                    };

                    PaymentSchedule::create([
                        'installment_id' => $instAccount->installment_id,
                        'installment_no' => $nextNo,
                        'due_date' => $dueDate,
                        'amount_due' => $installmentAmount,
                        'amount_paid' => 0,
                        'balance_due' => $installmentAmount,
                        'status' => 'Pending',
                        'paid_date' => null,
                        'notes' => "Added from Sale {$sale->invoice_no}",
                    ]);
                }

                if ($downPayment > 0) {
                    $payCount = (Payment::max('payment_id') ?? 0) + 1;
                    $receiptNo = 'REC-' . date('Y') . '-' . str_pad($payCount, 5, '0', STR_PAD_LEFT);
                    while (Payment::where('receipt_no', $receiptNo)->exists()) {
                        $payCount++;
                        $receiptNo = 'REC-' . date('Y') . '-' . str_pad($payCount, 5, '0', STR_PAD_LEFT);
                    }

                    Payment::create([
                        'installment_id' => $instAccount->installment_id,
                        'sale_id' => $sale->sale_id,
                        'schedule_id' => null,
                        'receipt_no' => $receiptNo,
                        'payment_date' => now()->toDateString(),
                        'amount' => $downPayment,
                        'payment_method' => 'Cash',
                        'reference_no' => 'DOWNPAYMENT-' . $instAccount->account_no,
                        'received_by' => $sale->processed_by,
                        'status' => 'Completed',
                        'notes' => "Initial down payment for Sale {$sale->invoice_no}",
                        'created_at' => now(),
                    ]);
                }
            }

            $customer = Customer::find($validated['customer_id']);
            $custName = $customer ? "{$customer->first_name} {$customer->last_name}" : 'Customer';

            SystemLog::create([
                'user_id' => $user ? $user->user_id : $request->input('user_id'),
                'action' => 'CREATE',
                'module' => 'Sales',
                'description' => "Created invoice {$sale->invoice_no} for {$custName} — ₱" . number_format($totalAmount, 2),
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ]);

            // Notify Admins, Store Admins, and Customer about completed Sale
            $saleNotif = [
                'type' => 'sale_created',
                'title' => 'New Sales Transaction',
                'message' => "Invoice {$sale->invoice_no} completed for {$custName} (₱" . number_format($totalAmount, 2) . ").",
                'module' => 'Sales',
                'related_id' => $sale->sale_id,
                'related_type' => 'App\Models\SaleTransaction',
                'action_url' => "/sales?id={$sale->sale_id}",
                'priority' => 'normal',
            ];

            NotificationService::sendToAdmins($saleNotif);
            NotificationService::sendToStoreAdmins($saleNotif, $targetBranchId);

            if ($validated['customer_id']) {
                NotificationService::sendToCustomer($validated['customer_id'], [
                    'type' => 'sale_created',
                    'title' => 'Purchase Confirmed',
                    'message' => "Your invoice {$sale->invoice_no} has been processed successfully (₱" . number_format($totalAmount, 2) . ").",
                    'module' => 'Sales',
                    'related_id' => $sale->sale_id,
                    'related_type' => 'App\Models\SaleTransaction',
                    'action_url' => '/customer/dashboard',
                    'priority' => 'high',
                ]);
            }

            Cache::increment('pace_sales_cache_v');
            Cache::increment('pace_inst_cache_v');
            SyncController::invalidateFingerprint(['sales', 'installments', 'products', 'customers', 'payments', 'dashboard', 'reports']);
            $sale->load('agent:employee_id,employee_code,first_name,last_name,position');

            $saleBranchId = $targetBranchId ? (int) $targetBranchId : ($sale->branch_id ? (int) $sale->branch_id : null);
            $saleCustId = !empty($validated['customer_id']) ? (int) $validated['customer_id'] : null;

            \App\Services\RealtimeBroadcaster::dispatch(new \App\Events\SalesTransactionCreated([
                'sale_id' => $sale->sale_id,
                'invoice_no' => $sale->invoice_no,
                'customer_name' => $custName,
                'total_amount' => (float) $totalAmount,
                'payment_method' => $sale->payment_method,
                'actor_user_id' => $user ? (int) $user->user_id : null,
                'toast_title' => 'New Sales Transaction',
                'toast_message' => "Invoice {$sale->invoice_no} for {$custName} (₱" . number_format($totalAmount, 2) . ").",
            ], $saleBranchId, $saleCustId));

            \App\Services\RealtimeBroadcaster::dispatch(new \App\Events\InventoryStockUpdated([
                'sale_id' => $sale->sale_id,
                'action' => 'sale_deduction',
                'actor_user_id' => $user ? (int) $user->user_id : null,
            ], $saleBranchId ? [$saleBranchId] : []));

            if (isset($instAccount) && $instAccount) {
                \App\Services\RealtimeBroadcaster::dispatch(new \App\Events\InstallmentContractCreated([
                    'installment_id' => $instAccount->installment_id,
                    'account_no' => $instAccount->account_no,
                    'customer_name' => $custName,
                    'total_payable' => (float) $instAccount->total_payable,
                    'status' => $instAccount->status,
                    'actor_user_id' => $user ? (int) $user->user_id : null,
                ], $saleBranchId, $saleCustId));
            }

            return response()->json([
                'message' => 'Sale created successfully',
                'sale' => $sale,
            ], 201);
        });
    }
}

