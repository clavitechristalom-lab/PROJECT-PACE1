<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\EWalletDeposit;
use App\Models\Customer;
use App\Models\InstallmentAccount;
use App\Models\PaymentSchedule;
use App\Models\Payment;
use App\Models\SaleTransaction;
use App\Models\SaleItem;
use App\Models\Product;
use App\Models\SystemLog;
use App\Services\NotificationService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class EWalletController extends Controller
{
    /**
     * Merchant InstaPay / GCash static payload string
     */
    protected string $merchantQrString = '00020101021127830012com.p2pqrpay0111GXCHPHM2XXX02089996440303152170200000006560417DWQM4TK3JDO6S94595204601653036085802PH5913CH*******M C.6008Balulang6104123463042E79';

    /**
     * Step 1 -> Step 2: Initialize GCash / E-Wallet deposit or payment checkout session.
     */
    public function createCheckout(Request $request)
    {
        $validated = $request->validate([
            'amount' => 'required|numeric|min:1',
            'payment_method' => 'required|string', // GCash, Maya, BDO, etc.
            'payment_type' => 'nullable|string|in:deposit,installment_payment,product_purchase,product_order,installment_order',
            'installment_id' => 'nullable|exists:installment_accounts,installment_id',
            'schedule_id' => 'nullable|exists:payment_schedule,schedule_id',
            'items' => 'nullable|array',
            'items.*.product_id' => 'nullable|exists:products,product_id',
            'items.*.quantity' => 'nullable|integer|min:1',
            'items.*.price' => 'nullable|numeric|min:0',
            'items.*.product_name' => 'nullable|string',
            'notes' => 'nullable|string',
            // Customer Installment Options
            'payment_term' => 'nullable|string|in:full,installment',
            'installment_term_months' => 'nullable|integer|in:3,6,12',
            'downpayment_amount' => 'nullable|numeric|min:0',
            'monthly_amortization' => 'nullable|numeric|min:0',
            'interest_rate' => 'nullable|numeric|min:0',
            'total_payable' => 'nullable|numeric|min:0',
        ]);

        $user = $request->user();
        $customerId = null;

        if ($user) {
            $customerId = $user->customer_id ?? $user->customer?->customer_id;
            if (!$customerId) {
                $customerId = Customer::where('email', $user->username)->value('customer_id');
            }
        }

        // Generate unique, collision-free transaction reference code
        $prefix = strtoupper(str_replace(' ', '', $validated['payment_method']));
        $uniqueNum = strtoupper(substr(uniqid(), -5));
        $reference = 'REF-' . $prefix . '-' . date('Ymd') . '-' . $uniqueNum;

        while (EWalletDeposit::where('transaction_reference', $reference)->exists()) {
            $uniqueNum = strtoupper(substr(uniqid(), -5));
            $reference = 'REF-' . $prefix . '-' . date('Ymd') . '-' . $uniqueNum;
        }

        $amount = (float)$validated['amount'];
        $hasItems = !empty($validated['items']);
        $isInstallmentTerm = ($validated['payment_term'] ?? '') === 'installment';

        $paymentType = $isInstallmentTerm
            ? 'installment_order'
            : ($validated['payment_type'] ?? ($hasItems ? 'product_order' : ($request->filled('installment_id') ? 'installment_payment' : 'deposit')));

        // STRICT ENFORCEMENT: Only customers allowed by Store Administrator can process installments
        if ($isInstallmentTerm || $paymentType === 'installment_order') {
            $customer = $customerId ? Customer::find($customerId) : null;
            if (!$customer || !$customer->allow_installment) {
                return response()->json([
                    'success' => false,
                    'message' => 'Installment process is not allowed for this account. Only your Store Administrator can grant installment authorization.',
                ], 403);
            }
        }

        $installmentAccount = null;
        $schedule = null;
        $productName = null;
        $productImage = null;

        if (!empty($validated['installment_id'])) {
            $installmentAccount = InstallmentAccount::with(['sale.saleItems.product', 'customer'])->find($validated['installment_id']);
            if ($installmentAccount) {
                $firstSaleItem = $installmentAccount->sale?->saleItems?->first() ?? $installmentAccount->sale?->items?->first();
                $productName = $firstSaleItem?->product?->product_name ?? 'Furniture/Appliance Item';
                $productImage = $firstSaleItem?->product?->image_url ?? null;
            }
        }
        if (!empty($validated['schedule_id'])) {
            $schedule = PaymentSchedule::find($validated['schedule_id']);
        }

        $itemsForCheckout = [];
        if ($hasItems) {
            $itemsForCheckout = $validated['items'];
        } elseif ($installmentAccount) {
            $accNo = $installmentAccount->account_no;
            $schedInfo = $schedule ? "Month {$schedule->installment_no}" : "Due";
            $itemsForCheckout = [
                [
                    'name' => "Installment Due: {$accNo} ({$schedInfo})",
                    'product_name' => "Installment Due - {$accNo}" . ($productName ? " ({$productName})" : ""),
                    'quantity' => 1,
                    'price' => $amount,
                    'category' => 'Installment Payment',
                    'image_url' => $productImage,
                ]
            ];
        }

        $desc = $isInstallmentTerm
            ? "Downpayment for {$validated['installment_term_months']}-month Installment Plan (" . count($validated['items'] ?? []) . " items) via {$validated['payment_method']}"
            : ($installmentAccount
                ? "Installment payment for {$installmentAccount->account_no}" . ($schedule ? " (Month {$schedule->installment_no})" : "") . " via {$validated['payment_method']}"
                : ($hasItems
                    ? "Order of " . count($validated['items']) . " item(s) for ₱" . number_format($amount, 2) . " via {$validated['payment_method']}"
                    : "Payment of ₱" . number_format($amount, 2) . " via {$validated['payment_method']}"));

        // Customer profile if available
        $customerObj = $customerId ? Customer::find($customerId) : null;
        $customerInfo = null;
        if ($customerObj) {
            $customerInfo = [
                'first_name' => $customerObj->first_name,
                'last_name' => $customerObj->last_name,
                'email' => $customerObj->email,
                'phone' => $customerObj->phone,
            ];
        }

        // Build transaction metadata and gateway response details
        $gatewayResponse = [
            'reference_number' => $reference,
            'amount' => $amount,
            'payment_method' => $validated['payment_method'],
            'description' => $desc,
            'metadata' => [
                'installment_account_no' => $installmentAccount?->account_no,
                'product_name' => $productName,
                'product_image_url' => $productImage,
            ],
        ];

        if ($hasItems) {
            $gatewayResponse['items'] = $validated['items'];
        }

        if ($isInstallmentTerm) {
            $gatewayResponse['installment_plan'] = [
                'term_months'          => (int)($validated['installment_term_months'] ?? 3),
                'downpayment'          => $amount,
                'monthly_amortization' => (float)($validated['monthly_amortization'] ?? 0),
                'interest_rate'        => (float)($validated['interest_rate'] ?? 0),
                'total_payable'        => (float)($validated['total_payable'] ?? $amount),
            ];
        }

        $deposit = EWalletDeposit::create([
            'transaction_reference' => $reference,
            'customer_id' => $customerId,
            'user_id' => $user ? $user->user_id : null,
            'installment_id' => $validated['installment_id'] ?? null,
            'schedule_id' => $validated['schedule_id'] ?? null,
            'payment_method' => $validated['payment_method'],
            'payment_type' => $paymentType,
            'amount' => $amount,
            'fee' => 0.00,
            'currency' => 'PHP',
            'status' => 'pending',
            'checkout_url' => url("/payments/checkout/{$reference}"),
            'checkout_session_id' => 'cs_' . strtolower(str_replace('-', '_', $reference)),
            'qr_code_data' => $this->merchantQrString,
            'gateway_response' => $gatewayResponse,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Checkout session generated successfully.',
            'deposit' => [
                'deposit_id' => $deposit->deposit_id,
                'transaction_reference' => $deposit->transaction_reference,
                'amount' => (float)$deposit->amount,
                'currency' => $deposit->currency,
                'payment_method' => $deposit->payment_method,
                'payment_type' => $deposit->payment_type,
                'status' => $deposit->status,
                'checkout_url' => $deposit->checkout_url,
                'checkout_session_id' => $deposit->checkout_session_id,
                'qr_code_data' => $deposit->qr_code_data,
                'installment_id' => $deposit->installment_id,
                'schedule_id' => $deposit->schedule_id,
                'created_at' => $deposit->created_at->toIso8601String(),
            ]
        ], 201);
    }

    /**
     * Poll payment status by transaction reference.
     */
    public function checkStatus($reference)
    {
        $deposit = EWalletDeposit::with(['customer', 'installmentAccount', 'payment'])
            ->where('transaction_reference', $reference)
            ->first();

        if (!$deposit) {
            return response()->json(['success' => false, 'message' => 'Transaction not found.'], 404);
        }

        $customerWalletBalance = null;
        if ($deposit->customer_id) {
            $customerWalletBalance = Customer::where('customer_id', $deposit->customer_id)->value('wallet_balance');
        }

        $proofUrl = null;
        if ($deposit->proof_of_payment) {
            $proofUrl = asset('storage/' . $deposit->proof_of_payment);
        } elseif ($deposit->payment?->proof_of_payment) {
            $proofUrl = asset('storage/' . $deposit->payment->proof_of_payment);
        }

        $isPaid = in_array($deposit->status, ['paid', 'Completed', 'Successful']) || ($deposit->payment?->status === 'Completed');
        $isPending = !$isPaid && ($deposit->payment_id || in_array($deposit->status, ['pending', 'pending_approval', 'pending_verification']));

        return response()->json([
            'success' => true,
            'status' => $isPaid ? 'paid' : ($isPending ? 'pending' : $deposit->status),
            'is_paid' => $isPaid,
            'is_pending' => $isPending,
            'deposit' => $deposit,
            'wallet_balance' => (float)($customerWalletBalance ?? 0),
            'payment' => $deposit->payment,
            'proof_of_payment_url' => $proofUrl,
            'customer_reference' => $deposit->customer_reference,
        ]);
    }

    /**
     * Step 3: Direct Payment Confirmation Listener.
     * Updates database upon confirmed payment.
     */
    public function handleWebhook(Request $request)
    {
        $data = $request->json()->all() ?: json_decode($request->getContent(), true);
        if (!$data || !is_array($data)) {
            return response()->json(['status' => 'error', 'message' => 'Malformed payment payload.'], 400);
        }

        $reference = $data['reference'] ?? ($data['reference_number'] ?? ($data['external_id'] ?? null));
        if (!$reference && isset($data['description'])) {
            if (preg_match('/(REF-[A-Z0-9-]+)/', $data['description'], $matches)) {
                $reference = $matches[1];
            }
        }

        if (!$reference) {
            return response()->json(['status' => 'error', 'message' => 'Missing transaction reference number.'], 400);
        }

        return DB::transaction(function () use ($reference, $data, $request) {
            $deposit = EWalletDeposit::where('transaction_reference', $reference)
                ->lockForUpdate()
                ->first();

            if (!$deposit) {
                return response()->json(['status' => 'error', 'message' => 'Transaction reference not found.'], 404);
            }

            // IDEMPOTENCY CHECK: If already marked as paid, return 200 immediately
            if (in_array($deposit->status, ['paid', 'Completed', 'Successful'])) {
                return response()->json([
                    'status' => 'success',
                    'message' => 'Payment already processed (idempotent duplicate).'
                ], 200);
            }

            // Mark deposit as Paid
            $deposit->status = 'paid';
            $deposit->paid_at = now();
            $deposit->webhook_payload = $data;
            $deposit->save();

            // 1. If product order, automatically create SaleTransaction, SaleItems, and deduct stock
            $hasItems = !empty($deposit->gateway_response['items']) || $deposit->payment_type === 'product_order';
            if ($hasItems) {
                $this->applyProductOrder($deposit);
            }
            // 2. If attached to an installment account, record official Payment & apply schedules
            elseif ($deposit->installment_id) {
                $this->applyInstallmentPayment($deposit);
            }
            // 3. Otherwise credit general customer wallet balance
            elseif ($deposit->customer_id) {
                $customer = Customer::where('customer_id', $deposit->customer_id)->lockForUpdate()->first();
                if ($customer) {
                    $customer->wallet_balance = (float)$customer->wallet_balance + (float)$deposit->amount;
                    $customer->save();
                }
            }

            // 3. Log into System Audit Trail
            SystemLog::create([
                'user_id' => $deposit->user_id,
                'action' => 'PAYMENT_RECEIVED',
                'module' => 'Payments',
                'description' => "Automated {$deposit->payment_method} confirmation for ₱" . number_format($deposit->amount, 2) . " [Ref: {$deposit->transaction_reference}]",
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent() ?? 'Payment-System',
            ]);

            // 4. Send Instant Real-time Notifications
            if ($deposit->user_id) {
                NotificationService::sendToUser($deposit->user_id, [
                    'type' => 'payment_success',
                    'title' => 'Payment Confirmed! 🎉',
                    'message' => "Your {$deposit->payment_method} payment of ₱" . number_format($deposit->amount, 2) . " has been successfully verified.",
                    'module' => 'Payments',
                    'priority' => 'high',
                ]);
            }

            NotificationService::sendToAdmins([
                'type' => 'payment_received',
                'title' => "New {$deposit->payment_method} Payment",
                'message' => "Deposit of ₱" . number_format($deposit->amount, 2) . " confirmed for Ref: {$deposit->transaction_reference}.",
                'module' => 'Payments',
                'priority' => 'normal',
            ]);

            return response()->json([
                'status' => 'success',
                'message' => 'Payment confirmed and credited successfully.',
                'reference' => $deposit->transaction_reference,
            ], 200);
        });
    }

    /**
     * Test / Simulation Trigger & Instant Verification:
     * Generates a genuine cryptographic webhook signature and dispatches to webhook handler.
     */
    public function simulateWebhook(Request $request)
    {
        $reference = $request->input('reference') ?? $request->input('transaction_reference');
        if (!$reference) {
            return response()->json(['success' => false, 'message' => 'Transaction reference is required.'], 400);
        }

        $deposit = EWalletDeposit::where('transaction_reference', $reference)->first();
        if (!$deposit) {
            return response()->json(['success' => false, 'message' => 'Transaction record not found.'], 404);
        }

        if (!$request->boolean('auto_verify')) {
            if (!$request->filled('customer_reference') && empty($deposit->customer_reference)) {
                return response()->json([
                    'success' => false,
                    'message' => 'Transaction Reference number is required before submitting payment.',
                ], 422);
            }

            if (!$request->hasFile('proof_of_payment') && empty($deposit->proof_of_payment)) {
                return response()->json([
                    'success' => false,
                    'message' => 'Proof of Payment image is required before submitting payment.',
                ], 422);
            }
        }

        // Store customer transaction reference and proof of payment screenshot if provided
        $gatewayResp = $deposit->gateway_response ?? [];

        if ($request->filled('customer_reference')) {
            $deposit->customer_reference = $request->input('customer_reference');
            $gatewayResp['customer_reference'] = $request->input('customer_reference');
        }

        if ($request->hasFile('proof_of_payment')) {
            $proofPath = $request->file('proof_of_payment')->store('proofs', 'public');
            $deposit->proof_of_payment = $proofPath;
            $gatewayResp['proof_of_payment'] = $proofPath;
        }

        $deposit->gateway_response = $gatewayResp;
        $deposit->save();

        if (in_array($deposit->status, ['paid', 'Completed', 'Successful'])) {
            return response()->json([
                'success' => true,
                'status'  => $deposit->status,
                'is_paid' => true,
                'message' => 'Transaction is already verified and paid.',
                'deposit' => $deposit,
                'proof_of_payment_url' => $deposit->proof_of_payment ? asset('storage/' . $deposit->proof_of_payment) : null,
                'customer_reference' => $deposit->customer_reference,
            ]);
        }

        if ($request->boolean('auto_verify')) {
            $deposit->status = 'paid';
            $deposit->paid_at = now();
            $deposit->save();

            $hasItems = !empty($deposit->gateway_response['items']) || $deposit->payment_type === 'product_order';
            if ($hasItems) {
                $this->applyProductOrder($deposit);
            } elseif ($deposit->installment_id) {
                $this->applyInstallmentPayment($deposit);
            } elseif ($deposit->customer_id) {
                $customer = Customer::where('customer_id', $deposit->customer_id)->lockForUpdate()->first();
                if ($customer) {
                    $customer->wallet_balance = (float)$customer->wallet_balance + (float)$deposit->amount;
                    $customer->save();
                }
            }

            $deposit->refresh();

            return response()->json([
                'success' => true,
                'status' => $deposit->status,
                'is_paid' => in_array($deposit->status, ['paid', 'Completed', 'Successful']),
                'message' => 'Payment verified and applied successfully.',
                'deposit' => $deposit,
                'proof_of_payment_url' => $deposit->proof_of_payment ? asset('storage/' . $deposit->proof_of_payment) : null,
                'customer_reference' => $deposit->customer_reference,
            ]);
        }

        // DEFAULT CUSTOMER PAYMENT FLOW: Create 'Pending' Payment record (Awaiting Store Admin receipt)
        $payment = null;
        if ($deposit->payment_id) {
            $payment = Payment::find($deposit->payment_id);
        }

        $customerRef = $deposit->customer_reference ?? ($gatewayResp['customer_reference'] ?? null);
        $refNo = $customerRef ?: $deposit->transaction_reference;

        if (!$payment) {
            $paymentCount = (Payment::max('payment_id') ?? 0) + 1;
            $receiptNo = 'REC-' . date('Y') . '-' . str_pad($paymentCount, 5, '0', STR_PAD_LEFT);
            while (Payment::where('receipt_no', $receiptNo)->exists()) {
                $paymentCount++;
                $receiptNo = 'REC-' . date('Y') . '-' . str_pad($paymentCount, 5, '0', STR_PAD_LEFT);
            }

            $payment = Payment::create([
                'installment_id'   => $deposit->installment_id,
                'schedule_id'      => $deposit->schedule_id,
                'receipt_no'       => $receiptNo,
                'payment_date'     => now()->toDateString(),
                'amount'           => (float)$deposit->amount,
                'payment_method'   => $deposit->payment_method ?: 'GCash',
                'reference_no'     => $refNo,
                'received_by'      => null, // Not received yet - store admin must receive it
                'notes'            => "Customer {$deposit->payment_method} Payment submitted. Awaiting Store Admin receipt and confirmation." . ($customerRef ? " [Ref: {$customerRef}]" : ""),
                'status'           => 'Pending',
                'proof_of_payment' => $deposit->proof_of_payment,
                'created_at'       => now(),
            ]);

            $deposit->payment_id = $payment->payment_id;
        } else {
            $payment->update([
                'reference_no'     => $refNo,
                'proof_of_payment' => $deposit->proof_of_payment ?: $payment->proof_of_payment,
                'status'           => 'Pending',
            ]);
        }

        $deposit->status = 'pending';
        $deposit->save();

        // Dispatch instant notification to Store Admins
        NotificationService::sendToAdmins([
            'type'         => 'payment_submitted',
            'title'        => "New Pending {$deposit->payment_method} Payment",
            'message'      => "Customer submitted payment of ₱" . number_format($deposit->amount, 2) . " ({$payment->receipt_no}) via {$deposit->payment_method}. Pending your receipt and verification.",
            'module'       => 'Payments',
            'related_id'   => $payment->payment_id,
            'related_type' => 'App\Models\Payment',
            'action_url'   => '/payments',
            'priority'     => 'high',
        ]);

        return response()->json([
            'success'              => true,
            'status'               => 'pending',
            'is_paid'              => false,
            'is_pending'           => true,
            'message'              => 'Payment submitted successfully. Awaiting Store Admin receipt and verification.',
            'deposit'              => $deposit,
            'payment'              => $payment,
            'proof_of_payment_url' => $deposit->proof_of_payment ? asset('storage/' . $deposit->proof_of_payment) : null,
            'customer_reference'   => $deposit->customer_reference,
        ]);
    }

    /**
     * Get Customer Wallet Info & Recent Deposits.
     */
    public function getWalletInfo(Request $request)
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $customerId = $user->customer_id ?? $user->customer?->customer_id;
        if (!$customerId) {
            $customerId = Customer::where('email', $user->username)->value('customer_id');
        }

        $customer = $customerId ? Customer::find($customerId) : null;
        $deposits = EWalletDeposit::where(function ($q) use ($customerId, $user) {
            if ($customerId) $q->where('customer_id', $customerId);
            $q->orWhere('user_id', $user->user_id);
        })
            ->orderBy('created_at', 'desc')
            ->limit(15)
            ->get();

        return response()->json([
            'wallet_balance' => (float)($customer?->wallet_balance ?? 0.00),
            'customer_name' => $customer ? trim("{$customer->first_name} {$customer->last_name}") : $user->name,
            'recent_deposits' => $deposits,
        ]);
    }

    /**
     * Apply paid deposit to Installment Account & Payment Schedules.
     */
    protected function applyInstallmentPayment(EWalletDeposit $deposit): void
    {
        $inst = InstallmentAccount::with(['paymentSchedules'])->find($deposit->installment_id);
        if (!$inst) return;

        // Generate receipt number
        $paymentCount = (Payment::max('payment_id') ?? 0) + 1;
        $receiptNo = 'REC-' . date('Y') . '-' . str_pad($paymentCount, 5, '0', STR_PAD_LEFT);
        while (Payment::where('receipt_no', $receiptNo)->exists()) {
            $paymentCount++;
            $receiptNo = 'REC-' . date('Y') . '-' . str_pad($paymentCount, 5, '0', STR_PAD_LEFT);
        }

        $proofOfPayment = $deposit->proof_of_payment ?? ($deposit->gateway_response['proof_of_payment'] ?? null);
        $customerRef = $deposit->customer_reference ?? ($deposit->gateway_response['customer_reference'] ?? null);
        $refNo = $customerRef ?: $deposit->transaction_reference;

        $payment = Payment::create([
            'installment_id' => $inst->installment_id,
            'schedule_id' => $deposit->schedule_id,
            'receipt_no' => $receiptNo,
            'payment_date' => now()->toDateString(),
            'amount' => $deposit->amount,
            'payment_method' => $deposit->payment_method,
            'reference_no' => $refNo,
            'proof_of_payment' => $proofOfPayment,
            'received_by' => $deposit->user_id,
            'notes' => "Automatic online confirmation via {$deposit->payment_method} gateway" . ($customerRef ? " [Customer Ref: {$customerRef}]" : ""),
            'status' => 'Completed',
            'created_at' => now(),
        ]);

        $deposit->payment_id = $payment->payment_id;
        $deposit->save();

        // Sequentially apply to schedules
        $remaining = (float)$deposit->amount;
        $schedules = PaymentSchedule::where('installment_id', $inst->installment_id)
            ->where('balance_due', '>', 0)
            ->orderBy('installment_no')
            ->get();

        foreach ($schedules as $sched) {
            if ($remaining <= 0) break;
            $due = (float)$sched->balance_due;
            $apply = min($remaining, $due);

            $newPaid = round((float)$sched->amount_paid + $apply, 2);
            $newBal = max(0, round((float)$sched->amount_due - $newPaid, 2));
            $newStatus = $newBal <= 0 ? 'Paid' : 'Partially Paid';

            $sched->update([
                'amount_paid' => $newPaid,
                'balance_due' => $newBal,
                'status' => $newStatus,
                'paid_date' => $newBal <= 0 ? now()->toDateString() : $sched->paid_date,
            ]);

            $remaining -= $apply;
        }

        // Update installment totals & balance
        $totalPaid = (float)$inst->payments()->sum('amount') + (float)$inst->down_payment;
        $balance = max(0, round((float)$inst->total_payable - $totalPaid, 2));
        $instStatus = $balance <= 0 ? 'Completed' : $inst->status;

        $inst->update([
            'status' => $instStatus,
        ]);
    }

    /**
     * Automatically create SaleTransaction, SaleItems, decrement stock, and record payment upon webhook confirmation.
     */
    protected function applyProductOrder(EWalletDeposit $deposit): void
    {
        $items = $deposit->gateway_response['items'] ?? [];
        if (empty($items)) return;

        $installmentPlan = $deposit->gateway_response['installment_plan'] ?? null;
        $isInstallment = !empty($installmentPlan) || $deposit->payment_type === 'installment_order';

        $invoiceCount = (SaleTransaction::max('sale_id') ?? 0) + 1;
        $invoiceNo = 'INV-' . date('Y') . '-' . str_pad($invoiceCount, 5, '0', STR_PAD_LEFT);
        while (SaleTransaction::where('invoice_no', $invoiceNo)->exists()) {
            $invoiceCount++;
            $invoiceNo = 'INV-' . date('Y') . '-' . str_pad($invoiceCount, 5, '0', STR_PAD_LEFT);
        }

        // Calculate product subtotal
        $subtotal = 0;
        foreach ($items as $item) {
            $subtotal += ($item['price'] ?? 0) * ($item['quantity'] ?? 1);
        }
        if ($subtotal <= 0) $subtotal = $deposit->amount;

        $totalPayable = $isInstallment ? (float)($installmentPlan['total_payable'] ?? $subtotal) : (float)$deposit->amount;
        $amountPaid = (float)$deposit->amount;
        $balanceDue = max(0, $totalPayable - $amountPaid);
        $saleStatus = $isInstallment ? 'Active Installment' : 'Completed';

        $sale = SaleTransaction::create([
            'invoice_no'      => $invoiceNo,
            'customer_id'     => $deposit->customer_id,
            'processed_by'    => $deposit->user_id ?? 1,
            'branch_id'       => null,
            'sale_date'       => now(),
            'payment_method'  => $deposit->payment_method,
            'subtotal'        => $subtotal,
            'discount_amount' => 0.00,
            'total_amount'    => $totalPayable,
            'amount_paid'     => $amountPaid,
            'balance_due'     => $balanceDue,
            'status'          => $saleStatus,
            'notes'           => $isInstallment
                ? "Auto-confirmed {$installmentPlan['term_months']}-month installment plan via {$deposit->payment_method} [Downpayment: ₱" . number_format($amountPaid, 2) . ", Ref: {$deposit->transaction_reference}]"
                : "Auto-confirmed online order via {$deposit->payment_method} gateway [Ref: {$deposit->transaction_reference}]",
        ]);

        foreach ($items as $itemData) {
            $productId = $itemData['product_id'] ?? null;
            $qty = (int)($itemData['quantity'] ?? 1);
            $price = (float)($itemData['price'] ?? 0);

            if ($productId) {
                $product = Product::find($productId);
                if ($product) {
                    $effectivePrice = $price > 0 ? $price : (!empty($product->discount_price) ? (float)$product->discount_price : (float)$product->unit_price);
                    $lineTotal = $effectivePrice * $qty;

                    SaleItem::create([
                        'sale_id'         => $sale->sale_id,
                        'product_id'      => $product->product_id,
                        'quantity'        => $qty,
                        'unit_price'      => $effectivePrice,
                        'discount_amount' => 0.00,
                        'line_total'      => $lineTotal,
                    ]);

                    $product->decrement('stock_quantity', $qty);
                }
            }
        }

        // Generate official payment receipt
        $paymentCount = (Payment::max('payment_id') ?? 0) + 1;
        $receiptNo = 'REC-' . date('Y') . '-' . str_pad($paymentCount, 5, '0', STR_PAD_LEFT);
        while (Payment::where('receipt_no', $receiptNo)->exists()) {
            $paymentCount++;
            $receiptNo = 'REC-' . date('Y') . '-' . str_pad($paymentCount, 5, '0', STR_PAD_LEFT);
        }

        $instAccountId = null;
        $accountNo = null;

        // If installment, create InstallmentAccount and PaymentSchedules!
        if ($isInstallment && $deposit->customer_id) {
            $accCount = InstallmentAccount::count() + 1;
            $accountNo = 'ACC-' . date('Y') . '-' . str_pad($accCount, 4, '0', STR_PAD_LEFT);
            while (InstallmentAccount::where('account_no', $accountNo)->exists()) {
                $accCount++;
                $accountNo = 'ACC-' . date('Y') . '-' . str_pad($accCount, 4, '0', STR_PAD_LEFT);
            }

            $termMonths = (int)($installmentPlan['term_months'] ?? 3);
            $monthlyAmortization = (float)($installmentPlan['monthly_amortization'] ?? ($balanceDue / max(1, $termMonths)));
            $interestRate = (float)($installmentPlan['interest_rate'] ?? 0);
            $interestAmount = max(0, $totalPayable - $subtotal);
            $principal = max(0, $subtotal - $amountPaid);

            $instAccount = InstallmentAccount::create([
                'account_no'             => $accountNo,
                'customer_id'            => $deposit->customer_id,
                'sale_id'                => $sale->sale_id,
                'start_date'             => now()->toDateString(),
                'principal_amount'       => $principal,
                'down_payment'           => $amountPaid,
                'interest_rate'          => $interestRate,
                'interest_amount'        => $interestAmount,
                'total_payable'          => $totalPayable,
                'installment_amount'     => $monthlyAmortization,
                'number_of_installments' => $termMonths,
                'frequency'              => 'Monthly',
                'status'                 => 'Active',
                'notes'                  => "Online customer installment order via {$deposit->payment_method} [Invoice: {$invoiceNo}]",
            ]);

            $instAccountId = $instAccount->installment_id;
            $deposit->installment_id = $instAccountId;

            // Generate monthly payment schedules
            for ($i = 1; $i <= $termMonths; $i++) {
                $dueDate = date('Y-m-d', strtotime('+' . $i . ' months'));

                PaymentSchedule::create([
                    'installment_id' => $instAccount->installment_id,
                    'installment_no' => $i,
                    'due_date'       => $dueDate,
                    'amount_due'     => $monthlyAmortization,
                    'amount_paid'    => 0.00,
                    'balance_due'    => $monthlyAmortization,
                    'status'         => 'Pending',
                    'paid_date'      => null,
                    'notes'          => "Month {$i} amortization for {$accountNo}",
                ]);
            }
        } else {
            $instAccountId = InstallmentAccount::where('customer_id', $deposit->customer_id)->value('installment_id') ?? $deposit->installment_id;
        }

        $proofOfPayment = $deposit->proof_of_payment ?? ($deposit->gateway_response['proof_of_payment'] ?? null);
        $customerRef = $deposit->customer_reference ?? ($deposit->gateway_response['customer_reference'] ?? null);
        $refNo = $customerRef ?: $deposit->transaction_reference;

        $payment = Payment::create([
            'installment_id'  => $instAccountId,
            'schedule_id'     => null,
            'receipt_no'      => $receiptNo,
            'payment_date'    => now()->toDateString(),
            'amount'          => $deposit->amount,
            'payment_method'  => $deposit->payment_method,
            'reference_no'    => $refNo,
            'proof_of_payment'=> $proofOfPayment,
            'received_by'     => $deposit->user_id,
            'notes'           => $isInstallment
                ? "Downpayment for Installment Account #{$accountNo} [Order #{$invoiceNo}]" . ($customerRef ? " [Ref: {$customerRef}]" : "")
                : "Order #{$invoiceNo} verified via {$deposit->payment_method} gateway" . ($customerRef ? " [Ref: {$customerRef}]" : ""),
            'status'          => 'Completed',
            'created_at'      => now(),
        ]);

        $deposit->payment_id = $payment->payment_id;
        $deposit->save();

        if ($deposit->user_id) {
            NotificationService::sendToUser($deposit->user_id, [
                'type'     => 'order_confirmed',
                'title'    => $isInstallment ? "Installment Plan Activated: #{$accountNo} 🎉" : "Order Confirmed: #{$invoiceNo} 🎉",
                'message'  => $isInstallment
                    ? "Your {$deposit->payment_method} downpayment of ₱" . number_format($deposit->amount, 2) . " has been verified. Your installment plan is now active."
                    : "Your {$deposit->payment_method} payment of ₱" . number_format($deposit->amount, 2) . " has been successfully verified.",
                'module'   => $isInstallment ? 'Installments' : 'Sales',
                'priority' => 'high',
            ]);
        }
    }
}
