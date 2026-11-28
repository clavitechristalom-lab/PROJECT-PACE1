<?php

namespace App\Http\Controllers;

use App\Models\BranchProfile;
use App\Models\Payment;
use App\Models\SystemLog;
use App\Models\User;
use App\Services\NotificationService;
use App\Services\PaymentSettlementService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CashierWalkInController extends Controller
{
    private function formatWalkInPayment(Payment $p): array
    {
        $inst = $p->installmentAccount;
        $saleObj = $inst?->sale ?: $p->sale;
        $deposit = $p->ewalletDeposit;
        $cust = $inst?->customer ?: ($saleObj?->customer ?: $deposit?->customer);

        $custName = $cust ? trim("{$cust->first_name} {$cust->last_name}") : 'Walk-In Customer';
        $accNo = $inst ? $inst->account_no : ($saleObj ? $saleObj->invoice_no : ($deposit?->transaction_reference ?: 'Walk-In Order'));

        $linkedItems = $saleObj && $saleObj->items ? $saleObj->items : collect();
        $productName = $linkedItems->map(fn($it) => $it->product?->product_name)->filter()->implode(', ');
        if ($productName === '' && !empty($deposit?->gateway_response['metadata']['product_name'])) {
            $productName = $deposit->gateway_response['metadata']['product_name'];
        }
        if ($productName === '' && !empty($deposit?->gateway_response['items'])) {
            $productName = collect($deposit->gateway_response['items'])->pluck('product_name')->filter()->implode(', ');
        }

        $branchId = PaymentSettlementService::resolvePaymentBranchId($p);
        $branchName = PaymentSettlementService::resolvePaymentBranchName($p);

        $isCollectorRemittance = $p->cash_channel === 'collector' || !empty($p->collector_id);

        $collectorUser = $p->collector;
        $collectorEmp = $collectorUser?->employee;
        $collectorName = $collectorUser
            ? ($collectorEmp ? trim("{$collectorEmp->first_name} {$collectorEmp->last_name}") : $collectorUser->username)
            : null;

        $cashierUser = $p->receivedBy ?: $p->confirmedBy;
        $cashierEmp = $cashierUser?->employee;
        $cashierName = $cashierUser
            ? ($cashierEmp ? trim("{$cashierEmp->first_name} {$cashierEmp->last_name}") : $cashierUser->username)
            : null;

        $approvedByUser = $p->confirmedBy;
        $approvedByEmp = $approvedByUser?->employee;
        $approvedByName = $approvedByUser
            ? ($approvedByEmp ? trim("{$approvedByEmp->first_name} {$approvedByEmp->last_name}") : $approvedByUser->username)
            : null;

        $rawStatus = (string) ($p->status ?: Payment::STATUS_PENDING);
        $lowerStatus = strtolower(trim($rawStatus));
        if ($isCollectorRemittance && in_array($lowerStatus, ['collected by collector', 'collected_by_collector'], true)) {
            $displayStatus = Payment::STATUS_COLLECTED_BY_COLLECTOR;
            $canConfirm = true;
        } elseif (in_array($lowerStatus, ['pending store admin approval', 'pending_store_admin_approval'], true)) {
            $displayStatus = Payment::STATUS_PENDING_STORE_APPROVAL;
            $canConfirm = false;
        } elseif (!$isCollectorRemittance && in_array($lowerStatus, ['pending', 'pending_store', 'pending store', 'pending verification'], true)) {
            $displayStatus = 'Pending';
            $canConfirm = true;
        } elseif ($lowerStatus === strtolower(Payment::STATUS_CONFIRMED_CASHIER)) {
            $displayStatus = Payment::STATUS_CONFIRMED_CASHIER;
            $canConfirm = false;
        } else {
            $displayStatus = $rawStatus;
            $canConfirm = false;
        }

        $notesLower = strtolower((string) $p->notes);
        $cashierForwarded = ($p->receivedBy && $p->receivedBy->isCashier())
            || str_contains($notesLower, 'sent to store admin');
        $isAwaitingStoreAdmin = in_array($lowerStatus, ['pending store admin approval', 'pending_store_admin_approval'], true);
        $isSentToStoreAdmin = $isAwaitingStoreAdmin
            || ($isCollectorRemittance && in_array($lowerStatus, ['completed', 'rejected'], true) && $cashierForwarded);

        $fin = $inst ? $inst->financialBreakdown() : null;
        $isInstFullyPaid = $inst && ($inst->isFullyPaid() || ($fin && (float) $fin['balance'] <= 0));
        if ($isInstFullyPaid) {
            $canConfirm = false;
        }
        $schedules = $inst && $inst->relationLoaded('paymentSchedules') ? $inst->paymentSchedules : collect();
        $totalTerms = $inst ? (int) ($inst->number_of_installments ?: $schedules->count()) : 0;
        $termsPaid = $schedules->filter(fn($s) => strtolower((string) $s->status) === 'paid' || (float) $s->balance_due <= 0.01)->count();
        $nextSchedule = $schedules->where('balance_due', '>', 0)->sortBy('installment_no')->first();

        return [
            'payment_id' => $p->payment_id,
            'installment_id' => $p->installment_id,
            'sale_id' => $p->sale_id ?? $inst?->sale_id,
            'reference_no' => $p->reference_no ?: $p->receipt_no,
            'receipt_no' => $p->receipt_no,
            'receipt_reference' => $p->receipt_reference,
            'official_receipt_no' => $p->receipt_reference,
            'account_no' => $accNo,
            'customer_id' => $cust?->customer_id,
            'customer_code' => $cust?->customer_code,
            'customer_name' => $custName,
            'customer_phone' => $cust?->phone ?: '',
            'customer_address' => $cust?->address ?: '',
            'product_name' => $productName ?: ($inst ? 'Installment Settlement' : 'Cash Store Payment'),
            'payment_type' => $p->payment_type ?: ($p->installment_id ? 'installment' : 'product_cash'),
            'amount' => (float) $p->amount,
            'cash_tendered' => $p->cash_tendered !== null ? (float) $p->cash_tendered : null,
            'change_due' => $p->change_due !== null ? (float) $p->change_due : null,
            'remaining_balance' => $fin ? (float) $fin['balance'] : 0.0,
            'total_paid' => $fin ? (float) $fin['paid'] : (float) $p->amount,
            'total_payable' => $inst ? (float) $inst->total_payable : (float) $p->amount,
            'down_payment' => $inst ? (float) $inst->down_payment : 0.0,
            'installment_amount' => $inst ? (float) $inst->installment_amount : (float) $p->amount,
            'installment_details' => $inst ? [
                'installment_id' => $inst->installment_id,
                'account_no' => $inst->account_no,
                'status' => $inst->status,
                'product_name' => $productName ?: 'Installment Item',
                'total_payable' => round((float) ($inst->total_payable ?? 0), 2),
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
            'payment_method' => $p->payment_method,
            'cash_channel' => $p->cash_channel ?: 'store',
            'is_collector_remittance' => $isCollectorRemittance,
            'collector_id' => $p->collector_id ? (int) $p->collector_id : null,
            'collector_name' => $collectorName,
            'collector_code' => $collectorEmp?->employee_code,
            'collector_confirmed_at' => $p->collector_confirmed_at ? $p->collector_confirmed_at->toIso8601String() : null,
            'collector_remarks' => $p->collector_remarks,
            'payment_date' => $p->payment_date,
            'status' => $displayStatus,
            'raw_status' => $rawStatus,
            'can_confirm' => $canConfirm,
            'sent_to_store_admin' => $isSentToStoreAdmin,
            'awaiting_store_admin' => $isAwaitingStoreAdmin,
            'cashier_name' => $cashierName,
            'cashier_code' => $cashierEmp?->employee_code,
            'received_by' => $cashierName,
            'approved_by_name' => in_array($lowerStatus, ['completed', 'rejected'], true) ? $approvedByName : null,
            'confirmed_at' => $p->confirmed_at ? $p->confirmed_at->toIso8601String() : null,
            'notes' => $p->notes,
            'proof_of_payment' => $p->proof_of_payment
                ? (str_starts_with($p->proof_of_payment, 'http') ? $p->proof_of_payment : asset('storage/' . ltrim($p->proof_of_payment, '/')))
                : null,
            'branch_id' => $branchId,
            'branch_name' => $branchName,
        ];
    }

    private function baseScopedQuery(int $branchId)
    {
        $query = Payment::with([
            'installmentAccount:installment_id,account_no,customer_id,sale_id,total_payable,down_payment,installment_amount,number_of_installments,start_date,status',
            'installmentAccount.customer:customer_id,customer_code,first_name,last_name,phone,address,branch_id,branch',
            'installmentAccount.customer.branch:id,name',
            'installmentAccount.sale:sale_id,invoice_no,processed_by,branch_id',
            'installmentAccount.sale.branch:id,name',
            'installmentAccount.sale.processedBy:user_id,username,employee_id',
            'installmentAccount.sale.processedBy.employee:employee_id,first_name,last_name,branch_id',
            'installmentAccount.sale.items:sale_item_id,sale_id,product_id,quantity',
            'installmentAccount.sale.items.product:product_id,product_name,product_code',
            'installmentAccount.paymentSchedules:schedule_id,installment_id,installment_no,due_date,amount_due,amount_paid,balance_due,status',
            'installmentAccount.payments:payment_id,installment_id,amount,status,reference_no,notes',
            'sale:sale_id,invoice_no,customer_id,processed_by,branch_id',
            'sale.customer:customer_id,customer_code,first_name,last_name,phone,address,branch_id,branch',
            'sale.customer.branch:id,name',
            'sale.branch:id,name',
            'sale.items:sale_item_id,sale_id,product_id,quantity',
            'sale.items.product:product_id,product_name,product_code',
            'ewalletDeposit:deposit_id,payment_id,transaction_reference,customer_id,payment_type,gateway_response',
            'ewalletDeposit.customer:customer_id,customer_code,first_name,last_name,phone,address,branch_id,branch',
            'ewalletDeposit.customer.branch:id,name',
            'collector:user_id,username,employee_id',
            'collector.employee:employee_id,employee_code,first_name,last_name,branch_id',
            'confirmedBy:user_id,username,employee_id,role',
            'confirmedBy.employee:employee_id,employee_code,first_name,last_name,branch_id',
            'receivedBy:user_id,username,employee_id,role',
            'receivedBy.employee:employee_id,employee_code,first_name,last_name,branch_id,position,department',
        ])
            ->where(function ($q) {
                $q->where(function ($storeQ) {
                    $storeQ->where('payment_method', 'Cash')
                        ->whereNull('collector_id')
                        ->where(function ($ch) {
                            $ch->where('cash_channel', 'store')
                                ->orWhere(function ($legacy) {
                                    $legacy->whereNull('cash_channel')
                                        ->where(function ($sub) {
                                            $sub->whereIn('status', ['Pending', 'pending_store', Payment::STATUS_CONFIRMED_CASHIER])
                                                ->orWhere('reference_no', 'like', 'REF-CASH-%');
                                        });
                                });
                        });
                })->orWhere(function ($collQ) {
                    $collQ->whereIn('payment_method', ['Cash', 'GCash', 'Maya', 'Online Bank'])
                        ->where('cash_channel', 'collector')
                        ->whereIn('status', [
                            Payment::STATUS_COLLECTED_BY_COLLECTOR,
                            'collected_by_collector',
                            Payment::STATUS_PENDING_STORE_APPROVAL,
                            'pending_store_admin_approval',
                            Payment::STATUS_COMPLETED,
                            Payment::STATUS_REJECTED,
                            'rejected',
                        ]);
                });
            });

        PaymentSettlementService::scopeQueryToBranch($query, $branchId);

        return $query;
    }

    public function index(Request $request)
    {
        $user = $request->user();
        if (!$user || !$user->isCashier()) {
            return response()->json([
                'success' => false,
                'message' => '403 Forbidden: Access restricted to Cashier employees.',
            ], 403);
        }

        $branchId = $user->employee?->branch_id ? (int) $user->employee->branch_id : null;
        if (!$branchId) {
            return response()->json([
                'success' => true,
                'payments' => [],
                'summary' => [
                    'total_received_today' => 0.0,
                    'confirmed_count_today' => 0,
                    'pending_walkins_count' => 0,
                    'pending_walkins_amount' => 0.0,
                ],
                'branch' => null,
            ]);
        }

        $allWalkIns = $this->baseScopedQuery($branchId)
            ->orderByDesc('payment_date')
            ->orderByDesc('payment_id')
            ->get();

        $today = now()->toDateString();
        $receivedToday = 0.0;
        $confirmedCountToday = 0;
        $pendingWalkInsCount = 0;
        $pendingWalkInsAmount = 0.0;
        $pendingCollectorCount = 0;
        $pendingCollectorAmount = 0.0;
        $awaitingAdminCount = 0;
        $awaitingAdminAmount = 0.0;

        foreach ($allWalkIns as $item) {
            $amt = (float) $item->amount;
            $st = strtolower(trim((string) $item->status));
            $isColl = $item->cash_channel === 'collector' || !empty($item->collector_id);
            $instCleared = $item->installmentAccount && $item->installmentAccount->isFullyPaid();

            if ($isColl && in_array($st, ['collected by collector', 'collected_by_collector'], true)) {
                if (!$instCleared) {
                    $pendingWalkInsCount++;
                    $pendingWalkInsAmount += $amt;
                    $pendingCollectorCount++;
                    $pendingCollectorAmount += $amt;
                }
            } elseif (!$isColl && in_array($st, ['pending', 'pending_store', 'pending store', 'pending verification'], true)) {
                if (!$instCleared) {
                    $pendingWalkInsCount++;
                    $pendingWalkInsAmount += $amt;
                }
            } elseif (in_array($st, ['pending store admin approval', 'pending_store_admin_approval'], true)) {
                $awaitingAdminCount++;
                $awaitingAdminAmount += $amt;
                $confirmDate = $item->confirmed_at
                    ? $item->confirmed_at->copy()->timezone(config('app.timezone'))->toDateString()
                    : ($item->payment_date ?: null);
                $processedByThisCashier = ((int) ($item->received_by ?? 0) === (int) $user->user_id)
                    || ((int) ($item->confirmed_by ?? 0) === (int) $user->user_id);
                if ($confirmDate === $today && $processedByThisCashier) {
                    $receivedToday += $amt;
                    $confirmedCountToday++;
                }
            } elseif (in_array($st, [strtolower(Payment::STATUS_CONFIRMED_CASHIER), 'completed'], true)) {
                $confirmDate = $item->confirmed_at
                    ? $item->confirmed_at->copy()->timezone(config('app.timezone'))->toDateString()
                    : ($item->payment_date ?: null);
                $processedByThisCashier = ((int) ($item->confirmed_by ?? 0) === (int) $user->user_id)
                    || ((int) ($item->received_by ?? 0) === (int) $user->user_id);

                if ($confirmDate === $today && $processedByThisCashier) {
                    $receivedToday += $amt;
                    $confirmedCountToday++;
                }
            }
        }

        $mapped = $allWalkIns->map(fn($p) => $this->formatWalkInPayment($p));

        $sentToAdminRows = $mapped->filter(fn($row) => !empty($row['sent_to_store_admin']));
        $sentToAdminCount = $sentToAdminRows->count();
        $sentToAdminAmount = round((float) $sentToAdminRows->sum('amount'), 2);

        $statusFilter = trim((string) $request->query('status', 'All'));
        if ($statusFilter !== '' && $statusFilter !== 'All') {
            $needle = strtolower($statusFilter);
            $mapped = $mapped->filter(function ($row) use ($needle) {
                $rowSt = strtolower((string) $row['status']);
                if ($needle === 'pending') {
                    return $row['can_confirm'] === true;
                }
                if ($needle === 'confirmed') {
                    return $rowSt === strtolower(Payment::STATUS_CONFIRMED_CASHIER) || $rowSt === 'completed';
                }
                if (in_array($needle, ['sent to store admin', 'sent_to_store_admin'], true)) {
                    return !empty($row['sent_to_store_admin']);
                }
                if ($needle === 'pending store admin approval') {
                    return $rowSt === strtolower(Payment::STATUS_PENDING_STORE_APPROVAL);
                }
                return $rowSt === $needle
                    || strtolower((string) $row['raw_status']) === $needle;
            });
        }

        $search = trim((string) $request->query('search', ''));
        if ($search !== '') {
            $q = strtolower($search);
            $mapped = $mapped->filter(function ($row) use ($q) {
                return str_contains(strtolower((string) $row['reference_no']), $q)
                    || str_contains(strtolower((string) $row['receipt_no']), $q)
                    || str_contains(strtolower((string) ($row['receipt_reference'] ?? '')), $q)
                    || str_contains(strtolower((string) $row['account_no']), $q)
                    || str_contains(strtolower((string) ($row['customer_code'] ?? '')), $q)
                    || str_contains(strtolower((string) $row['customer_name']), $q)
                    || str_contains(strtolower((string) ($row['collector_name'] ?? '')), $q)
                    || str_contains(strtolower((string) $row['product_name']), $q);
            });
        }

        $branchName = $user->employee?->branch_name ?: BranchProfile::getNameById($branchId);

        return response()->json([
            'success' => true,
            'payments' => $mapped->values(),
            'summary' => [
                'total_received_today' => round($receivedToday, 2),
                'confirmed_count_today' => $confirmedCountToday,
                'pending_walkins_count' => $pendingWalkInsCount,
                'pending_walkins_amount' => round($pendingWalkInsAmount, 2),
                'pending_collector_count' => $pendingCollectorCount,
                'pending_collector_amount' => round($pendingCollectorAmount, 2),
                'awaiting_admin_count' => $awaitingAdminCount,
                'awaiting_admin_amount' => round($awaitingAdminAmount, 2),
                'sent_to_admin_count' => $sentToAdminCount,
                'sent_to_admin_amount' => $sentToAdminAmount,
            ],
            'branch' => [
                'branch_id' => $branchId,
                'branch_name' => $branchName,
            ],
        ]);
    }

    public function confirm(Request $request, int $id)
    {
        $user = $request->user();
        if (!$user || !$user->isCashier()) {
            return response()->json([
                'success' => false,
                'message' => '403 Forbidden: Only Cashier employees can receive counter or collector cash payments.',
            ], 403);
        }

        $branchId = $user->employee?->branch_id ? (int) $user->employee->branch_id : null;
        if (!$branchId) {
            return response()->json([
                'success' => false,
                'message' => '403 Forbidden: Cashier account has no assigned store branch.',
            ], 403);
        }

        $validated = $request->validate([
            'cash_tendered' => 'nullable|numeric|min:0.01',
            'official_receipt_no' => 'nullable|string|max:100',
            'notes' => 'nullable|string|max:500',
        ]);

        $rawTendered = isset($validated['cash_tendered']) && $validated['cash_tendered'] !== '' && $validated['cash_tendered'] !== null
            ? round((float) $validated['cash_tendered'], 2)
            : null;
        $orNumber = !empty($validated['official_receipt_no']) ? trim((string) $validated['official_receipt_no']) : null;
        $noteInput = !empty($validated['notes']) ? trim((string) $validated['notes']) : null;

        return DB::transaction(function () use ($id, $user, $branchId, $rawTendered, $orNumber, $noteInput, $request) {
            $payment = Payment::with([
                'installmentAccount.customer.branch',
                'installmentAccount.sale.branch',
                'installmentAccount.sale.processedBy.employee',
                'installmentAccount.sale.items.product',
                'installmentAccount.paymentSchedules',
                'installmentAccount.payments',
                'sale.customer.branch',
                'sale.branch',
                'sale.items.product',
                'ewalletDeposit.customer.branch',
                'collector.employee',
                'confirmedBy.employee',
                'receivedBy.employee',
            ])->lockForUpdate()->findOrFail($id);

            $isCollectorRemittance = $payment->cash_channel === 'collector' || !empty($payment->collector_id);
            $allowedMethods = $isCollectorRemittance
                ? ['Cash', 'GCash', 'Maya', 'Online Bank']
                : ['Cash'];

            if (!in_array($payment->payment_method, $allowedMethods, true)) {
                return response()->json([
                    'success' => false,
                    'message' => $isCollectorRemittance
                        ? '403 Forbidden: Unsupported collector remittance payment method.'
                        : '403 Forbidden: Cashiers can only process Cash walk-in payments.',
                ], 403);
            }

            $paymentBranchId = PaymentSettlementService::resolvePaymentBranchId($payment);
            if (!$paymentBranchId || (int) $paymentBranchId !== $branchId) {
                return response()->json([
                    'success' => false,
                    'message' => '403 Forbidden: This cash payment belongs to another store branch.',
                ], 403);
            }

            $currentStatus = strtolower(trim((string) $payment->status));
            if ($isCollectorRemittance) {
                if (!in_array($currentStatus, ['collected by collector', 'collected_by_collector'], true)) {
                    return response()->json([
                        'success' => false,
                        'message' => "Collector payment {$payment->receipt_no} is already processed ({$payment->status}).",
                    ], 422);
                }
            } else {
                if (!in_array($currentStatus, ['pending', 'pending_store', 'pending store', 'pending verification'], true)) {
                    return response()->json([
                        'success' => false,
                        'message' => "Payment {$payment->receipt_no} is already processed ({$payment->status}).",
                    ], 422);
                }
            }

            $amountDue = round((float) $payment->amount, 2);
            if ($isCollectorRemittance) {
                $cashTendered = $rawTendered ?? ($payment->cash_tendered !== null ? round((float) $payment->cash_tendered, 2) : $amountDue);
            } else {
                if ($rawTendered === null) {
                    return response()->json([
                        'success' => false,
                        'message' => 'Cash tendered is required for walk-in counter payments.',
                    ], 422);
                }
                $cashTendered = $rawTendered;
            }
            if ($cashTendered < $amountDue) {
                return response()->json([
                    'success' => false,
                    'message' => 'Cash tendered (₱' . number_format($cashTendered, 2) . ') cannot be less than amount due (₱' . number_format($amountDue, 2) . ').',
                ], 422);
            }

            if ($payment->installmentAccount) {
                $currentFin = $payment->installmentAccount->financialBreakdown();
                if ($payment->installmentAccount->isFullyPaid() || (float) $currentFin['balance'] <= 0) {
                    return response()->json([
                        'success' => false,
                        'message' => "Installment account {$payment->installmentAccount->account_no} is already Fully Paid.",
                    ], 422);
                }
            }

            $changeDue = round($cashTendered - $amountDue, 2);
            $cashierName = $user->employee
                ? trim("{$user->employee->first_name} {$user->employee->last_name}")
                : $user->username;
            $cashierCode = $user->employee?->employee_code ?: '';
            $finalOr = $orNumber ?: $payment->receipt_reference;

            if ($isCollectorRemittance) {
                $collectorUser = $payment->collector;
                $collectorEmp = $collectorUser?->employee;
                $collectorName = $collectorUser
                    ? ($collectorEmp ? trim("{$collectorEmp->first_name} {$collectorEmp->last_name}") : $collectorUser->username)
                    : 'Collector';

                $noteParts = array_filter([
                    trim((string) $payment->notes),
                    "Received by Cashier: {$cashierName}" . ($cashierCode ? " ({$cashierCode})" : '') . " — Sent to Store Admin for Approval",
                    $orNumber && $orNumber !== $payment->receipt_reference ? "Cashier OR #: {$orNumber}" : null,
                    'Cash Received: ₱' . number_format($cashTendered, 2) . ($changeDue > 0 ? ' | Change: ₱' . number_format($changeDue, 2) : ''),
                    $noteInput ? "Cashier Note: {$noteInput}" : null,
                ]);

                $payment->status = Payment::STATUS_PENDING_STORE_APPROVAL;
                $payment->received_by = $user->user_id;
                $payment->confirmed_by = $user->user_id;
                $payment->confirmed_at = now();
                $payment->cash_tendered = $cashTendered;
                $payment->change_due = $changeDue;
                if ($orNumber) {
                    $payment->receipt_reference = $orNumber;
                }
                $payment->notes = implode(' | ', $noteParts);
                $payment->save();

                if ($payment->ewalletDeposit) {
                    $gateway = $payment->ewalletDeposit->gateway_response ?? [];
                    $gateway['cashier_received_by'] = $cashierName;
                    $gateway['cashier_received_at'] = $payment->confirmed_at->toIso8601String();
                    $payment->ewalletDeposit->status = 'pending_store_admin_approval';
                    $payment->ewalletDeposit->gateway_response = $gateway;
                    $payment->ewalletDeposit->save();
                }

                $inst = $payment->installmentAccount;
                $cust = $inst?->customer ?: ($payment->sale?->customer ?: $payment->ewalletDeposit?->customer);
                $custName = $cust ? trim("{$cust->first_name} {$cust->last_name}") : 'Customer';
                $accLabel = $inst?->account_no ?: ($payment->sale?->invoice_no ?: ($payment->reference_no ?: $payment->receipt_no));
                $items = $inst?->sale?->items ?: ($payment->sale?->items ?: collect());
                $productName = $items->map(fn($it) => $it->product?->product_name)->filter()->implode(', ') ?: 'Installment Item';
                $fin = $inst ? $inst->financialBreakdown() : null;
                $balLabel = $fin ? ' | Balance: ₱' . number_format((float) $fin['balance'], 2) : '';

                SystemLog::create([
                    'user_id' => $user->user_id,
                    'action' => 'CASHIER_FORWARDED_TO_STORE_ADMIN',
                    'module' => 'Payments',
                    'description' => "Cashier {$cashierName} ({$cashierCode}) received collector cash {$payment->receipt_no} (₱" . number_format($amountDue, 2) . ") from Collector {$collectorName} for {$accLabel} ({$custName}, {$productName}" . ($finalOr ? ", OR #: {$finalOr}" : '') . ") and forwarded it to Store Admin for final approval.",
                    'ip_address' => $request->ip(),
                    'user_agent' => $request->userAgent(),
                ]);

                NotificationService::sendToStoreAdmins([
                    'type' => 'cashier_remittance_pending_approval',
                    'title' => 'Collector Payment Received by Cashier — Pending Approval',
                    'message' => "Cashier {$cashierName} received ₱" . number_format($amountDue, 2) . " from Collector {$collectorName} for {$accLabel} ({$custName} • {$productName}{$balLabel}" . ($finalOr ? ", OR #: {$finalOr}" : '') . "). Ready for Store Admin approval.",
                    'module' => 'Payments',
                    'related_id' => $payment->payment_id,
                    'related_type' => 'App\Models\Payment',
                    'action_url' => "/payments?id={$payment->payment_id}",
                    'priority' => 'high',
                ], (string) $branchId);

                if ($payment->collector_id) {
                    NotificationService::sendToUser((int) $payment->collector_id, [
                        'type' => 'cashier_received_collector_cash',
                        'title' => 'Cash Received by Cashier — Sent to Store Admin',
                        'message' => "Cashier {$cashierName} received your collected payment {$payment->receipt_no} (₱" . number_format($amountDue, 2) . " for {$accLabel}) and sent it to Store Admin for approval.",
                        'module' => 'Payments',
                        'related_id' => $payment->payment_id,
                        'related_type' => Payment::class,
                        'action_url' => '/employee/collect-cash',
                        'priority' => 'normal',
                    ]);
                }

                PaymentSettlementService::invalidatePaymentCaches(['payments', 'installments', 'customers', 'dashboard', 'notifications', 'transactions']);

                \App\Services\RealtimeBroadcaster::dispatch(new \App\Events\CashPaymentWorkflowUpdated([
                    'payment_id' => $payment->payment_id,
                    'receipt_no' => $payment->receipt_no,
                    'reference_no' => $payment->reference_no,
                    'account_no' => $accLabel,
                    'customer_name' => $custName,
                    'amount' => (float) $amountDue,
                    'status' => $payment->status,
                    'cash_channel' => 'collector',
                    'stage' => 'cashier_received',
                    'collector_id' => $payment->collector_id ? (int) $payment->collector_id : null,
                    'cashier_id' => (int) $user->user_id,
                    'actor_user_id' => (int) $user->user_id,
                    'toast_title' => 'Cashier Forwarded Payment to Store Admin',
                    'toast_message' => "Cashier {$cashierName} received ₱" . number_format($amountDue, 2) . " for {$accLabel} — ready for Store Admin approval.",
                ], (int) $branchId, $cust?->customer_id ? (int) $cust->customer_id : null, array_filter([(int) $user->user_id, $payment->collector_id ? (int) $payment->collector_id : null])));

                return response()->json([
                    'success' => true,
                    'forwarded_to_store_admin' => true,
                    'message' => "Collector payment {$payment->receipt_no} received by Cashier {$cashierName} and sent to Store Admin for approval.",
                    'payment' => $this->formatWalkInPayment($payment->fresh([
                        'installmentAccount.customer.branch',
                        'installmentAccount.sale.branch',
                        'installmentAccount.sale.items.product',
                        'installmentAccount.paymentSchedules',
                        'installmentAccount.payments',
                        'sale.customer.branch',
                        'sale.branch',
                        'sale.items.product',
                        'ewalletDeposit.customer.branch',
                        'collector.employee',
                        'confirmedBy.employee',
                        'receivedBy.employee',
                    ])),
                ]);
            }

            $noteParts = array_filter([
                trim((string) $payment->notes),
                "Cashier: {$cashierName}" . ($cashierCode ? " ({$cashierCode})" : ''),
                $orNumber ? "OR #: {$orNumber}" : null,
                'Cash Tendered: ₱' . number_format($cashTendered, 2) . ' | Change Due: ₱' . number_format($changeDue, 2),
                $noteInput ? "Note: {$noteInput}" : null,
            ]);

            $payment->status = Payment::STATUS_CONFIRMED_CASHIER;
            $payment->cash_channel = 'store';
            $payment->received_by = $user->user_id;
            $payment->confirmed_by = $user->user_id;
            $payment->confirmed_at = now();
            $payment->cash_tendered = $cashTendered;
            $payment->change_due = $changeDue;
            if ($orNumber) {
                $payment->receipt_reference = $orNumber;
            }
            $payment->notes = implode(' | ', $noteParts);
            $payment->save();

            $deposit = PaymentSettlementService::syncDepositForConfirmedPayment($payment, $user, $orNumber);
            $settlement = PaymentSettlementService::applyConfirmedInstallmentSettlement($payment, $user);

            $cust = $payment->installmentAccount?->customer ?: ($payment->sale?->customer ?: $deposit?->customer);
            $custName = $settlement['customer_name'] ?? ($cust ? trim("{$cust->first_name} {$cust->last_name}") : 'Walk-In Customer');
            $accLabel = $settlement['account_no'] ?? ($payment->sale?->invoice_no ?: ($payment->reference_no ?: $payment->receipt_no));

            SystemLog::create([
                'user_id' => $user->user_id,
                'action' => 'CASHIER_WALKIN_CONFIRMED',
                'module' => 'Payments',
                'description' => "Cashier {$cashierName} ({$cashierCode}) confirmed walk-in cash payment {$payment->receipt_no} for {$accLabel} ({$custName}) — Amount Due: ₱" . number_format($amountDue, 2) . ", Tendered: ₱" . number_format($cashTendered, 2) . ", Change: ₱" . number_format($changeDue, 2) . ($orNumber ? " [OR #: {$orNumber}]" : ''),
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ]);

            NotificationService::sendToStoreAdmins([
                'type' => 'cashier_walkin_confirmed',
                'title' => 'Walk-In Cash Payment Confirmed by Cashier',
                'message' => "Cashier {$cashierName} confirmed ₱" . number_format($amountDue, 2) . " for {$accLabel} ({$custName})." . ($settlement ? ' New balance: ₱' . number_format((float) $settlement['balance'], 2) . '.' : ''),
                'module' => 'Payments',
                'related_id' => $payment->payment_id,
                'related_type' => 'App\Models\Payment',
                'action_url' => "/payments?id={$payment->payment_id}",
                'priority' => 'normal',
            ], (string) $branchId);

            $targetCustomerId = $settlement['customer_id'] ?? $cust?->customer_id ?? $deposit?->customer_id;
            if ($targetCustomerId) {
                NotificationService::sendToCustomer($targetCustomerId, [
                    'type' => 'payment_received',
                    'title' => 'Walk-In Cash Payment Confirmed',
                    'message' => "Your cash payment of ₱" . number_format($amountDue, 2) . " ({$payment->receipt_no}) was received by Cashier {$cashierName}." . ($settlement ? ' Remaining balance: ₱' . number_format((float) $settlement['balance'], 2) . '.' : ''),
                    'module' => 'Payments',
                    'related_id' => $payment->payment_id,
                    'related_type' => 'App\Models\Payment',
                    'action_url' => '/customer/dashboard?tab=statements',
                    'priority' => 'high',
                ]);
            }

            PaymentSettlementService::invalidatePaymentCaches(['payments', 'installments', 'sales', 'customers', 'dashboard', 'reports', 'notifications', 'transactions']);

            \App\Services\RealtimeBroadcaster::dispatch(new \App\Events\CashPaymentWorkflowUpdated([
                'payment_id' => $payment->payment_id,
                'receipt_no' => $payment->receipt_no,
                'reference_no' => $payment->reference_no,
                'account_no' => $accLabel,
                'customer_name' => $custName,
                'amount' => (float) $amountDue,
                'status' => $payment->status,
                'cash_channel' => 'store',
                'stage' => 'cashier_confirmed_walkin',
                'cashier_id' => (int) $user->user_id,
                'actor_user_id' => (int) $user->user_id,
                'toast_title' => 'Walk-In Cash Payment Confirmed',
                'toast_message' => "Cashier {$cashierName} received ₱" . number_format($amountDue, 2) . " for {$accLabel} ({$custName}).",
            ], (int) $branchId, $targetCustomerId ? (int) $targetCustomerId : null, [(int) $user->user_id]));

            if ($payment->installment_id) {
                \App\Services\RealtimeBroadcaster::dispatch(new \App\Events\InstallmentScheduleUpdated([
                    'installment_id' => $payment->installment_id,
                    'payment_id' => $payment->payment_id,
                    'amount' => (float) $amountDue,
                    'status' => $settlement['status'] ?? null,
                    'balance' => $settlement['balance'] ?? null,
                    'actor_user_id' => (int) $user->user_id,
                ], (int) $branchId, $targetCustomerId ? (int) $targetCustomerId : null));
            }

            return response()->json([
                'success' => true,
                'message' => "Walk-in cash payment {$payment->receipt_no} confirmed & received by Cashier {$cashierName}.",
                'payment' => $this->formatWalkInPayment($payment->fresh([
                    'installmentAccount.customer.branch',
                    'installmentAccount.sale.branch',
                    'installmentAccount.sale.items.product',
                    'installmentAccount.paymentSchedules',
                    'installmentAccount.payments',
                    'sale.customer.branch',
                    'sale.branch',
                    'sale.items.product',
                    'ewalletDeposit.customer.branch',
                    'collector.employee',
                    'confirmedBy.employee',
                    'receivedBy.employee',
                ])),
                'account' => $settlement,
            ]);
        });
    }
}
