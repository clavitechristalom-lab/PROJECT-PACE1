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
use App\Services\NotificationService;

class SaleController extends Controller
{
    public function index(Request $request)
    {
        $query = SaleTransaction::with(['customer', 'processedBy', 'items.product']);

        $user = $request->user();

        // Branch scoping for Store Administrator — use branch_id directly on sale_transactions
        if ($user && in_array($user->role, ['Store Administrator', 'Store Admin'])) {
            $userBranch = $user->employee ? $user->employee->branch_id : null;
            if ($userBranch) {
                $query->where('branch_id', $userBranch);
            } else {
                $query->where('sale_id', -1); // No branch — return empty
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
            $user = $request->user();
            if ($user && in_array($user->role, ['Store Administrator', 'Store Admin'])) {
                $branch = $user->employee ? $user->employee->branch_id : null;
                $query->whereHas('processedBy.employee', function($eq) use ($branch) {
                    $eq->where('branch_id', $branch);
                });
            }

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

        return response()->json([
            'sales' => $sales,
            'total' => $sales->count(),
        ]);
    }

    public function show($id)
    {
        $sale = SaleTransaction::with(['customer', 'processedBy.employee', 'items.product', 'installmentAccount'])->findOrFail($id);

        $items = $sale->items->map(function ($item) {
            return [
                'sale_item_id' => $item->sale_item_id,
                'product_id' => $item->product_id,
                'product_name' => $item->product ? $item->product->product_name : 'Item',
                'product_code' => $item->product ? $item->product->product_code : '',
                'quantity' => $item->quantity,
                'unit_price' => (float)$item->unit_price,
                'discount_amount' => (float)$item->discount_amount,
                'line_total' => (float)$item->line_total,
            ];
        });

        return response()->json([
            'sale' => [
                'sale_id' => $sale->sale_id,
                'invoice_no' => $sale->invoice_no,
                'customer_id' => $sale->customer_id,
                'customer_name' => $sale->customer ? "{$sale->customer->first_name} {$sale->customer->last_name}" : 'Walk-in',
                'processed_by' => $sale->processedBy ? ($sale->processedBy->employee ? "{$sale->processedBy->employee->first_name} {$sale->processedBy->employee->last_name}" : $sale->processedBy->username) : 'Staff',
                'sale_date' => date('Y-m-d', strtotime($sale->sale_date)),
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
        if ($request->user() && $request->user()->role === 'Administrator') {
            return response()->json(['success' => false, 'message' => 'Admin is not authorized to create sales.'], 403);
        }

        $validated = $request->validate([
            'customer_id' => 'required|exists:customers,customer_id',
            'payment_method' => 'required|in:Cash,Installment',
            'items' => 'required|array|min:1',
            'items.*.product_id' => 'required|exists:products,product_id',
            'items.*.quantity' => 'required|integer|min:1',
            'items.*.discount' => 'nullable|numeric|min:0',
            'down_payment' => 'nullable|numeric|min:0',
            'interest_rate' => 'nullable|numeric|min:0',
            'number_of_installments' => 'nullable|integer|in:3,6,12,18',
            'frequency' => 'nullable|string|in:Weekly,Biweekly,Monthly',
            'notes' => 'nullable|string',
        ]);

        return DB::transaction(function () use ($validated, $request) {
            $subtotal = 0;
            $totalDiscount = 0;

            $user = $request->user();
            $userBranch = $user && $user->employee ? $user->employee->branch_id : null;

            // Calculate totals and check stock
            foreach ($validated['items'] as $itemData) {
                $product = Product::lockForUpdate()->findOrFail($itemData['product_id']);
                
                // Enforce Branch Security
                if ($user && in_array($user->role, ['Store Administrator', 'Store Admin'])) {
                    if ($product->branch_id != $userBranch) {
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

                $effectivePrice = !empty($product->discount_price) ? $product->discount_price : $product->unit_price;
                $itemSubtotal = $effectivePrice * $itemData['quantity'];
                $itemDiscount = $itemData['discount'] ?? 0;
                $subtotal += $itemSubtotal;
                $totalDiscount += $itemDiscount;
            }

            $totalAmount = max(0, $subtotal - $totalDiscount);
            $payMethod = $validated['payment_method'];

            $amountPaid = $payMethod === 'Cash' ? $totalAmount : (float)($validated['down_payment'] ?? 0);
            $balanceDue = max(0, $totalAmount - $amountPaid);
            $status = $payMethod === 'Cash' ? 'Completed' : ($amountPaid > 0 ? 'Partially Paid' : 'Pending');

            $invoiceCount = SaleTransaction::count() + 1;
            $invoiceNo = 'INV-' . date('Y') . '-' . str_pad($invoiceCount, 3, '0', STR_PAD_LEFT);

            $sale = SaleTransaction::create([
                'invoice_no'      => $invoiceNo,
                'customer_id'     => $validated['customer_id'],
                'processed_by'    => $request->user() ? $request->user()->user_id : $request->input('user_id', 1),
                'branch_id'       => $request->user() && $request->user()->employee ? $request->user()->employee->branch_id : null,
                'sale_date'       => now(),
                'payment_method'  => $payMethod,
                'subtotal'        => $subtotal,
                'discount_amount' => $totalDiscount,
                'total_amount'    => $totalAmount,
                'amount_paid'     => $amountPaid,
                'balance_due'     => $balanceDue,
                'status'          => $status,
                'notes'           => $validated['notes'] ?? '',
            ]);

            // Create items and reduce stock
            foreach ($validated['items'] as $itemData) {
                $product = Product::findOrFail($itemData['product_id']);
                $itemDisc = $itemData['discount'] ?? 0;
                $effectivePrice = !empty($product->discount_price) ? $product->discount_price : $product->unit_price;
                $lineTotal = ($effectivePrice * $itemData['quantity']) - $itemDisc;

                SaleItem::create([
                    'sale_id' => $sale->sale_id,
                    'product_id' => $product->product_id,
                    'quantity' => $itemData['quantity'],
                    'unit_price' => $effectivePrice,
                    'discount_amount' => $itemDisc,
                    'line_total' => $lineTotal,
                ]);

                $product->decrement('stock_quantity', $itemData['quantity']);
            }

            // If Installment, create or update account and schedule
            if ($payMethod === 'Installment') {
                $downPayment = (float)($validated['down_payment'] ?? 0);
                $interestRate = (float)($validated['interest_rate'] ?? 0);
                $numInstallments = (int)($validated['number_of_installments'] ?? 12);
                $frequency = $validated['frequency'] ?? 'Monthly';

                $principal = max(0, $totalAmount - $downPayment);
                $interestAmount = $principal * ($interestRate / 100);
                $totalPayable = $principal + $interestAmount;
                $installmentAmount = $numInstallments > 0 ? $totalPayable / $numInstallments : $totalPayable;

                $instAccount = InstallmentAccount::where('customer_id', $validated['customer_id'])
                    ->whereIn('status', ['Active', 'Pending'])
                    ->first();

                if ($instAccount) {
                    // Update existing account
                    $instAccount->principal_amount += $principal;
                    $instAccount->down_payment += $downPayment;
                    $instAccount->interest_amount += $interestAmount;
                    $instAccount->total_payable += $totalPayable;
                    $instAccount->number_of_installments += $numInstallments;
                    $instAccount->installment_amount += $installmentAmount; // Aggregate representation
                    $instAccount->save();

                    // Get the last schedule to know where to append
                    $lastSchedule = PaymentSchedule::where('installment_id', $instAccount->installment_id)
                        ->orderBy('installment_no', 'desc')
                        ->first();
                    
                    $startNo = $lastSchedule ? $lastSchedule->installment_no : 0;
                    $lastDate = $lastSchedule ? $lastSchedule->due_date : now()->toDateString();
                } else {
                    // Create new account
                    $accCount = InstallmentAccount::count() + 1;
                    $accountNo = 'ACC-' . str_pad($accCount, 4, '0', STR_PAD_LEFT);

                    $instAccount = InstallmentAccount::create([
                        'account_no' => $accountNo,
                        'customer_id' => $validated['customer_id'],
                        'sale_id' => $sale->sale_id,
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
                for ($i = 1; $i <= $numInstallments; $i++) {
                    $nextNo = $startNo + $i;
                    
                    $dueDate = match ($instAccount->frequency) {
                        'Weekly' => date('Y-m-d', strtotime($lastDate . ' + ' . $i . ' weeks')),
                        'Biweekly' => date('Y-m-d', strtotime($lastDate . ' + ' . ($i * 2) . ' weeks')),
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
            }

            $customer = Customer::find($validated['customer_id']);
            $custName = $customer ? "{$customer->first_name} {$customer->last_name}" : 'Customer';

            SystemLog::create([
                'user_id' => $request->input('user_id', 1),
                'action' => 'CREATE',
                'module' => 'Sales',
                'description' => "Created invoice {$sale->invoice_no} for {$custName} — ₱" . number_format($totalAmount, 2),
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ]);

            // Notify Store Admins & Admins about completed Sale
            NotificationService::sendToStoreAdmins([
                'type' => 'sale_created',
                'title' => 'New Sales Transaction',
                'message' => "Invoice {$sale->invoice_no} completed for {$custName} (₱" . number_format($totalAmount, 2) . ").",
                'module' => 'Sales',
                'related_id' => $sale->sale_id,
                'related_type' => 'App\Models\SaleTransaction',
                'action_url' => "/sales?id={$sale->sale_id}",
                'priority' => 'normal',
            ]);

            return response()->json([
                'message' => 'Sale created successfully',
                'sale' => $sale,
            ], 201);
        });
    }
}

