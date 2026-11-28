<?php

namespace App\Http\Controllers;

use App\Models\BranchProfile;
use App\Models\EWalletDeposit;
use App\Models\InstallmentAccount;
use App\Models\Payment;
use App\Models\PaymentSchedule;
use App\Models\SystemLog;
use App\Models\User;
use App\Services\AgentContributionService;
use App\Services\NotificationService;
use App\Services\PaymentSettlementService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CollectorCollectionController extends Controller
{
    private function formatCollectorPayment(Payment $p): array
    {
        $inst = $p->installmentAccount;
        $saleObj = $inst?->sale ?: $p->sale;
        $deposit = $p->ewalletDeposit;
        $cust = $inst?->customer ?: ($saleObj?->customer ?: $deposit?->customer);

        $custName = $cust ? trim("{$cust->first_name} {$cust->last_name}") : 'Customer';
        $accNo = $inst ? $inst->account_no : ($saleObj ? $saleObj->invoice_no : 'N/A');

        $linkedItems = $saleObj && $saleObj->items ? $saleObj->items : collect();
        $productName = $linkedItems->map(fn($it) => $it->product?->product_name)->filter()->implode(', ');
        if ($productName === '' && !empty($deposit?->gateway_response['metadata']['product_name'])) {
            $productName = $deposit->gateway_response['metadata']['product_name'];
        }

        $branchId = PaymentSettlementService::resolvePaymentBranchId($p);
        $branchName = PaymentSettlementService::resolvePaymentBranchName($p);

        $collectorUser = $p->collector;
        $collectorEmp = $collectorUser?->employee;
        $collectorName = $collectorEmp
            ? trim("{$collectorEmp->first_name} {$collectorEmp->last_name}")
            : ($collectorUser?->username ?: null);

        $cashierUser = ($p->receivedBy && $p->receivedBy->isCashier()) ? $p->receivedBy : null;
        $cashierEmp = $cashierUser?->employee;
        $cashierName = $cashierUser
            ? ($cashierEmp ? trim("{$cashierEmp->first_name} {$cashierEmp->last_name}") : $cashierUser->username)
            : null;

        $confirmedUser = $p->confirmedBy ?: $p->receivedBy;
        $confirmedEmp = $confirmedUser?->employee;
        $confirmedByName = $confirmedUser
            ? ($confirmedEmp ? trim("{$confirmedEmp->first_name} {$confirmedEmp->last_name}") : $confirmedUser->username)
            : null;

        $rawStatus = (string) ($p->status ?: Payment::STATUS_PENDING);
        $lowerStatus = strtolower(trim($rawStatus));
        if (in_array($lowerStatus, ['pending', 'pending_collector', 'pending collector'], true)) {
            $displayStatus = 'Pending';
            $canCollect = true;
        } elseif (in_array($lowerStatus, ['collected by collector', 'collected_by_collector'], true)) {
            $displayStatus = Payment::STATUS_COLLECTED_BY_COLLECTOR;
            $canCollect = false;
        } elseif (in_array($lowerStatus, ['pending store admin approval', 'pending_store_admin_approval'], true)) {
            $displayStatus = Payment::STATUS_PENDING_STORE_APPROVAL;
            $canCollect = false;
        } else {
            $displayStatus = $rawStatus;
            $canCollect = false;
        }

        $notesLower = strtolower((string) $p->notes);
        $isPendingPickup = $canCollect;
        $isAwaitingCashier = in_array($lowerStatus, ['collected by collector', 'collected_by_collector'], true);
        $isAwaitingStoreAdmin = in_array($lowerStatus, ['pending store admin approval', 'pending_store_admin_approval'], true);
        $isCompleted = in_array($lowerStatus, ['completed', strtolower(Payment::STATUS_CONFIRMED_CASHIER)], true);
        $isRejected = $lowerStatus === 'rejected';
        $wasCollectedByCollector = !$isPendingPickup && (
            $isAwaitingCashier
            || $isAwaitingStoreAdmin
            || $isCompleted
            || $isRejected
            || !empty($p->collector_confirmed_at)
        );
        $cashierForwarded = $cashierUser !== null || str_contains($notesLower, 'sent to store admin');
        $isSentToStoreAdmin = $isAwaitingStoreAdmin
            || (($isCompleted || $isRejected) && $cashierForwarded);

        $fin = $inst ? $inst->financialBreakdown() : null;
        if ($inst && ($inst->isFullyPaid() || ($fin && (float) $fin['balance'] <= 0))) {
            $canCollect = false;
            $isPendingPickup = false;
        }

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
            'customer_name' => $custName,
            'customer_phone' => $cust?->phone ?: '',
            'customer_address' => $cust?->address ?: '',
            'product_name' => $productName ?: 'Installment Item',
            'amount' => (float) $p->amount,
            'remaining_balance' => $fin ? (float) $fin['balance'] : 0.0,
            'installment_amount' => $inst ? (float) $inst->installment_amount : (float) $p->amount,
            'payment_method' => $p->payment_method,
            'cash_channel' => $p->cash_channel ?: 'collector',
            'payment_date' => $p->payment_date,
            'status' => $displayStatus,
            'raw_status' => $rawStatus,
            'can_collect' => $canCollect,
            'collected_by_collector' => $wasCollectedByCollector,
            'awaiting_cashier' => $isAwaitingCashier,
            'sent_to_store_admin' => $isSentToStoreAdmin,
            'awaiting_store_admin' => $isAwaitingStoreAdmin,
            'is_completed' => $isCompleted,
            'collector_id' => $p->collector_id ? (int) $p->collector_id : null,
            'collector_name' => $collectorName,
            'collector_code' => $collectorEmp?->employee_code,
            'collector_confirmed_at' => $p->collector_confirmed_at ? $p->collector_confirmed_at->toIso8601String() : null,
            'cashier_name' => $cashierName,
            'cashier_code' => $cashierEmp?->employee_code,
            'confirmed_at' => $p->confirmed_at ? $p->confirmed_at->toIso8601String() : null,
            'confirmed_by' => $confirmedByName,
            'approved_by_name' => ($isCompleted || $isRejected) ? $confirmedByName : null,
            'collector_remarks' => $p->collector_remarks,
            'notes' => $p->notes,
            'proof_of_payment' => $p->proof_of_payment
                ? (str_starts_with($p->proof_of_payment, 'http') ? $p->proof_of_payment : asset('storage/' . ltrim($p->proof_of_payment, '/')))
                : null,
            'branch_id' => $branchId,
            'branch_name' => $branchName,
        ];
    }

    private function baseScopedQuery(User $user, int $branchId)
    {
        $query = Payment::with([
            'installmentAccount:installment_id,account_no,customer_id,sale_id,total_payable,down_payment,installment_amount,status',
            'installmentAccount.customer:customer_id,first_name,last_name,phone,address,branch_id,branch',
            'installmentAccount.customer.branch:id,name',
            'installmentAccount.sale:sale_id,invoice_no,processed_by,branch_id',
            'installmentAccount.sale.branch:id,name',
            'installmentAccount.sale.processedBy:user_id,username,employee_id',
            'installmentAccount.sale.processedBy.employee:employee_id,first_name,last_name,branch_id',
            'installmentAccount.sale.items:sale_item_id,sale_id,product_id,quantity',
            'installmentAccount.sale.items.product:product_id,product_name,product_code',
            'installmentAccount.payments:payment_id,installment_id,amount,status,reference_no,notes',
            'sale:sale_id,invoice_no,customer_id,processed_by,branch_id',
            'sale.customer:customer_id,first_name,last_name,phone,address,branch_id,branch',
            'sale.customer.branch:id,name',
            'sale.branch:id,name',
            'sale.items:sale_item_id,sale_id,product_id,quantity',
            'sale.items.product:product_id,product_name,product_code',
            'ewalletDeposit:deposit_id,payment_id,transaction_reference,customer_id,gateway_response',
            'ewalletDeposit.customer:customer_id,first_name,last_name,phone,address,branch_id,branch',
            'ewalletDeposit.customer.branch:id,name',
            'collector:user_id,username,employee_id',
            'collector.employee:employee_id,employee_code,first_name,last_name,branch_id',
            'collector.employee.branch:id,name',
            'confirmedBy:user_id,username,employee_id,role',
            'confirmedBy.employee:employee_id,employee_code,first_name,last_name',
            'receivedBy:user_id,username,employee_id,role',
            'receivedBy.employee:employee_id,employee_code,first_name,last_name,position,department',
        ])
            ->whereIn('payment_method', ['Cash', 'GCash', 'Maya', 'Online Bank'])
            ->where(function ($q) {
                $q->where('cash_channel', 'collector')
                    ->orWhereNotNull('collector_id');
            })
            ->where('collector_id', $user->user_id);

        PaymentSettlementService::scopeQueryToBranch($query, $branchId);

        return $query;
    }

    public function index(Request $request)
    {
        $user = $request->user();
        if (!$user || !$user->isCollector()) {
            return response()->json([
                'success' => false,
                'message' => '403 Forbidden: Access restricted to Collector employees.',
            ], 403);
        }

        $branchId = $user->employee?->branch_id ? (int) $user->employee->branch_id : null;
        if (!$branchId) {
            return response()->json([
                'success' => true,
                'collections' => [],
                'summary' => [
                    'total_assigned_pending' => 0.0,
                    'pending_count' => 0,
                    'total_collected_today' => 0.0,
                    'collected_today_count' => 0,
                    'pending_remittance' => 0.0,
                    'pending_remittance_count' => 0,
                ],
                'branch' => null,
            ]);
        }

        $allAssigned = $this->baseScopedQuery($user, $branchId)
            ->orderByDesc('payment_date')
            ->orderByDesc('payment_id')
            ->get();

        $today = now()->toDateString();
        $pendingAmount = 0.0;
        $pendingCount = 0;
        $collectedTodayAmount = 0.0;
        $collectedTodayCount = 0;
        $remittanceAmount = 0.0;
        $remittanceCount = 0;

        foreach ($allAssigned as $item) {
            $amt = (float) $item->amount;
            $st = strtolower(trim((string) $item->status));
            $instCleared = $item->installmentAccount && $item->installmentAccount->isFullyPaid();

            if (in_array($st, ['pending', 'pending_collector', 'pending collector'], true)) {
                if (!$instCleared) {
                    $pendingAmount += $amt;
                    $pendingCount++;
                }
            } elseif (in_array($st, ['collected by collector', 'collected_by_collector', 'pending store admin approval', 'pending_store_admin_approval'], true)) {
                $remittanceAmount += $amt;
                $remittanceCount++;
                $collectedDate = $item->collector_confirmed_at
                    ? $item->collector_confirmed_at->copy()->timezone(config('app.timezone'))->toDateString()
                    : ($item->payment_date ?: null);
                if ($collectedDate === $today) {
                    $collectedTodayAmount += $amt;
                    $collectedTodayCount++;
                }
            } elseif (in_array($st, ['completed', 'confirmed / received by cashier'], true)) {
                $collectedDate = $item->collector_confirmed_at
                    ? $item->collector_confirmed_at->copy()->timezone(config('app.timezone'))->toDateString()
                    : ($item->payment_date ?: null);
                if ($collectedDate === $today) {
                    $collectedTodayAmount += $amt;
                    $collectedTodayCount++;
                }
            }
        }

        $mapped = $allAssigned->map(fn($p) => $this->formatCollectorPayment($p));

        $collectedRows = $mapped->filter(fn($row) => !empty($row['collected_by_collector']));
        $sentToAdminRows = $mapped->filter(fn($row) => !empty($row['sent_to_store_admin']));
        $awaitingAdminRows = $mapped->filter(fn($row) => !empty($row['awaiting_store_admin']));
        $completedRows = $mapped->filter(fn($row) => !empty($row['is_completed']));

        $statusFilter = trim((string) $request->query('status', 'All'));
        if ($statusFilter !== '' && $statusFilter !== 'All') {
            $needle = strtolower($statusFilter);
            $mapped = $mapped->filter(function ($row) use ($needle) {
                $rowStatus = strtolower((string) $row['status']);
                $rowRaw = strtolower((string) $row['raw_status']);
                if (in_array($needle, ['pending', 'pending_collector', 'pending collector'], true)) {
                    return !empty($row['can_collect']);
                }
                if (in_array($needle, ['collected by collector', 'collected_by_collector'], true)) {
                    return !empty($row['collected_by_collector']);
                }
                if (in_array($needle, ['pending store admin approval', 'pending_store_admin_approval', 'sent to store admin', 'sent_to_store_admin'], true)) {
                    return !empty($row['sent_to_store_admin']);
                }
                if ($needle === 'completed') {
                    return !empty($row['is_completed']);
                }
                return $rowStatus === $needle || $rowRaw === $needle;
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
                    || str_contains(strtolower((string) $row['customer_name']), $q)
                    || str_contains(strtolower((string) $row['product_name']), $q);
            });
        }

        $branchName = $user->employee?->branch_name ?: BranchProfile::getNameById($branchId);

        return response()->json([
            'success' => true,
            'collections' => $mapped->values(),
            'summary' => [
                'total_assigned_pending' => round($pendingAmount, 2),
                'pending_count' => $pendingCount,
                'total_collected_today' => round($collectedTodayAmount, 2),
                'collected_today_count' => $collectedTodayCount,
                'pending_remittance' => round($remittanceAmount, 2),
                'pending_remittance_count' => $remittanceCount,
                'collected_by_collector_count' => $collectedRows->count(),
                'collected_by_collector_amount' => round((float) $collectedRows->sum('amount'), 2),
                'sent_to_admin_count' => $sentToAdminRows->count(),
                'sent_to_admin_amount' => round((float) $sentToAdminRows->sum('amount'), 2),
                'awaiting_admin_count' => $awaitingAdminRows->count(),
                'awaiting_admin_amount' => round((float) $awaitingAdminRows->sum('amount'), 2),
                'completed_count' => $completedRows->count(),
                'completed_amount' => round((float) $completedRows->sum('amount'), 2),
            ],
            'branch' => [
                'branch_id' => $branchId,
                'branch_name' => $branchName,
            ],
        ]);
    }

    public function collect(Request $request, int $id)
    {
        $user = $request->user();
        if (!$user || !$user->isCollector()) {
            return response()->json([
                'success' => false,
                'message' => '403 Forbidden: Only Collector employees can mark door-to-door collections.',
            ], 403);
        }

        $branchId = $user->employee?->branch_id ? (int) $user->employee->branch_id : null;
        if (!$branchId) {
            return response()->json([
                'success' => false,
                'message' => '403 Forbidden: Collector account has no assigned store branch.',
            ], 403);
        }

        $validated = $request->validate([
            'official_receipt_no' => 'required|string|max:100',
            'remarks' => 'nullable|string|max:500',
        ]);

        $orNumber = trim($validated['official_receipt_no']);
        $remarks = isset($validated['remarks']) ? trim((string) $validated['remarks']) : null;

        return DB::transaction(function () use ($id, $user, $branchId, $orNumber, $remarks, $request) {
            $payment = Payment::with([
                'installmentAccount.customer.branch',
                'installmentAccount.sale.branch',
                'installmentAccount.sale.processedBy.employee',
                'installmentAccount.sale.items.product',
                'installmentAccount.payments',
                'sale.customer.branch',
                'sale.branch',
                'sale.items.product',
                'ewalletDeposit.customer.branch',
                'collector.employee',
                'confirmedBy.employee',
                'receivedBy.employee',
            ])->lockForUpdate()->findOrFail($id);

            if (!in_array($payment->payment_method, ['Cash', 'GCash', 'Maya', 'Online Bank'], true) || $payment->cash_channel !== 'collector') {
                return response()->json([
                    'success' => false,
                    'message' => '403 Forbidden: Collectors can only process assigned door-to-door collector payments.',
                ], 403);
            }

            if ((int) $payment->collector_id !== (int) $user->user_id) {
                return response()->json([
                    'success' => false,
                    'message' => '403 Forbidden: This collection is assigned to a different Collector.',
                ], 403);
            }

            $paymentBranchId = PaymentSettlementService::resolvePaymentBranchId($payment);
            if ($paymentBranchId && (int) $paymentBranchId !== $branchId) {
                return response()->json([
                    'success' => false,
                    'message' => '403 Forbidden: This payment belongs to another store branch.',
                ], 403);
            }

            $currentStatus = strtolower(trim((string) $payment->status));
            if (!in_array($currentStatus, ['pending', 'pending_collector', 'pending collector'], true)) {
                return response()->json([
                    'success' => false,
                    'message' => "Payment {$payment->receipt_no} has already been processed ({$payment->status}).",
                ], 422);
            }

            if ($payment->installmentAccount && $payment->installmentAccount->isFullyPaid()) {
                return response()->json([
                    'success' => false,
                    'message' => "Installment account {$payment->installmentAccount->account_no} is already Fully Paid.",
                ], 422);
            }

            $collectorName = $user->employee
                ? trim("{$user->employee->first_name} {$user->employee->last_name}")
                : $user->username;
            $collectorCode = $user->employee?->employee_code ?: '';

            $noteParts = array_filter([
                trim((string) $payment->notes),
                "Collected by Collector: {$collectorName}" . ($collectorCode ? " ({$collectorCode})" : '') . " | OR #: {$orNumber}",
                $remarks ? "Remarks: {$remarks}" : null,
            ]);

            $payment->status = Payment::STATUS_COLLECTED_BY_COLLECTOR;
            $payment->receipt_reference = $orNumber;
            $payment->collector_confirmed_at = now();
            $payment->collector_remarks = $remarks;
            $payment->notes = implode(' | ', $noteParts);
            $payment->save();

            $deposit = EWalletDeposit::where('payment_id', $payment->payment_id)
                ->when($payment->reference_no, fn($q) => $q->orWhere('transaction_reference', $payment->reference_no))
                ->first();

            if ($deposit) {
                $gateway = $deposit->gateway_response ?? [];
                $gateway['receipt_reference'] = $orNumber;
                $gateway['collector_confirmed_at'] = $payment->collector_confirmed_at->toIso8601String();
                if ($remarks) {
                    $gateway['collector_remarks'] = $remarks;
                }
                $deposit->customer_reference = $orNumber;
                $deposit->status = 'collected_by_collector';
                $deposit->gateway_response = $gateway;
                $deposit->save();
            }

            $inst = $payment->installmentAccount;
            $cust = $inst?->customer ?: ($payment->sale?->customer ?: $deposit?->customer);
            $custName = $cust ? trim("{$cust->first_name} {$cust->last_name}") : 'Customer';
            $accLabel = $inst?->account_no ?: ($payment->sale?->invoice_no ?: ($payment->reference_no ?: $payment->receipt_no));
            $items = $inst?->sale?->items ?: ($payment->sale?->items ?: collect());
            $productName = $items->map(fn($it) => $it->product?->product_name)->filter()->implode(', ') ?: 'Installment Item';
            $fin = $inst ? $inst->financialBreakdown() : null;
            $balLabel = $fin ? ' | Balance: ₱' . number_format((float) $fin['balance'], 2) : '';

            SystemLog::create([
                'user_id' => $user->user_id,
                'action' => 'COLLECTOR_CASH_COLLECTED',
                'module' => 'Payments',
                'description' => "Collector {$collectorName} ({$collectorCode}) collected door-to-door cash ₱" . number_format((float) $payment->amount, 2) . " for {$accLabel} ({$custName}, {$productName}) [OR #: {$orNumber}]. Sent to Cashier for receipt & Store Admin approval.",
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ]);

            $this->notifyBranchCashiers($branchId, [
                'type' => 'collector_remittance_to_cashier',
                'title' => 'Collector Payment Sent to Cashier',
                'message' => "Collector {$collectorName} collected ₱" . number_format((float) $payment->amount, 2) . " for {$accLabel} ({$custName} • {$productName}{$balLabel}, OR #: {$orNumber}). Receive cash and forward to Store Admin for approval.",
                'module' => 'Payments',
                'related_id' => $payment->payment_id,
                'related_type' => 'App\Models\Payment',
                'action_url' => '/employee/receive-cash',
                'priority' => 'high',
            ]);

            if ($cust?->customer_id) {
                NotificationService::sendToCustomer($cust->customer_id, [
                    'type' => 'payment_collected_by_collector',
                    'title' => 'Door-to-Door Cash Collected',
                    'message' => "Collector {$collectorName} received your cash payment of ₱" . number_format((float) $payment->amount, 2) . " (OR #: {$orNumber}). Sent to Cashier and Store Admin for final approval.",
                    'module' => 'Payments',
                    'related_id' => $payment->payment_id,
                    'related_type' => 'App\Models\Payment',
                    'action_url' => '/customer/dashboard?tab=statements',
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
                'amount' => (float) $payment->amount,
                'status' => $payment->status,
                'cash_channel' => 'collector',
                'stage' => 'collector_collected',
                'collector_id' => (int) $user->user_id,
                'actor_user_id' => (int) $user->user_id,
                'toast_title' => 'Collector Cash Collected',
                'toast_message' => "Collector {$collectorName} collected ₱" . number_format((float) $payment->amount, 2) . " for {$accLabel} (OR #: {$orNumber}).",
            ], (int) $branchId, $cust?->customer_id ? (int) $cust->customer_id : null, [(int) $user->user_id]));

            return response()->json([
                'success' => true,
                'message' => "Cash collection {$payment->receipt_no} recorded (OR #: {$orNumber}) and sent to Cashier for receipt & Store Admin approval.",
                'collection' => $this->formatCollectorPayment($payment->fresh([
                    'installmentAccount.customer.branch',
                    'installmentAccount.sale.branch',
                    'installmentAccount.sale.items.product',
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
        });
    }

    private function notifyBranchCashiers(int $branchId, array $payload): void
    {
        $cashierUserIds = User::where('role', 'Employee')
            ->whereHas('employee', function ($q) use ($branchId) {
                $q->where('branch_id', $branchId)
                    ->where(function ($sub) {
                        $sub->whereRaw("LOWER(COALESCE(position, '')) LIKE '%cashier%'")
                            ->orWhereRaw("LOWER(COALESCE(department, '')) LIKE '%cashier%'");
                    });
            })
            ->pluck('user_id');

        foreach ($cashierUserIds as $cashierUid) {
            NotificationService::sendToUser((int) $cashierUid, $payload);
        }
    }

    public function installmentAccounts(Request $request)
    {
        $user = $request->user();
        if (!$user || !$user->isCollector()) {
            return response()->json([
                'success' => false,
                'message' => '403 Forbidden: Access restricted to Collector employees.',
            ], 403);
        }

        $branchId = $user->employee?->branch_id ? (int) $user->employee->branch_id : null;
        if (!$branchId) {
            return response()->json([
                'success' => true,
                'accounts' => [],
                'branch' => null,
            ]);
        }

        $query = InstallmentAccount::with([
            'customer:customer_id,customer_code,first_name,last_name,phone,email,address,branch_id,branch',
            'customer.branch:id,name',
            'sale:sale_id,invoice_no,processed_by,branch_id,has_agent,agent_id',
            'sale.branch:id,name',
            'sale.items:sale_item_id,sale_id,product_id,quantity,unit_price,line_total',
            'sale.items.product:product_id,product_name,product_code,category',
            'sale.processedBy:user_id,employee_id',
            'sale.processedBy.employee:employee_id,branch_id',
            'paymentSchedules:schedule_id,installment_id,installment_no,due_date,amount_due,amount_paid,balance_due,status',
            'payments:payment_id,installment_id,receipt_no,receipt_reference,payment_date,amount,payment_method,status,reference_no,notes,created_at',
            'agent:employee_id,employee_code,first_name,last_name',
        ])
            ->whereIn('status', ['Active', 'Overdue'])
            ->whereNotIn('status', InstallmentAccount::COMPLETED_STATUSES)
            ->where(function ($q) use ($branchId) {
                $q->whereHas('customer', fn($cq) => $cq->where('branch_id', $branchId))
                    ->orWhereHas('sale', fn($sq) => $sq->where('branch_id', $branchId))
                    ->orWhereHas('sale.processedBy.employee', fn($eq) => $eq->where('branch_id', $branchId));
            });

        $search = trim((string) $request->query('search', ''));
        if ($search !== '') {
            $q = $search;
            $query->where(function ($sub) use ($q) {
                $sub->where('account_no', 'like', "%{$q}%")
                    ->orWhereHas('customer', function ($cq) use ($q) {
                        $cq->where('first_name', 'like', "%{$q}%")
                            ->orWhere('last_name', 'like', "%{$q}%")
                            ->orWhere('phone', 'like', "%{$q}%")
                            ->orWhere('address', 'like', "%{$q}%");
                    })
                    ->orWhereHas('sale.items.product', fn($pq) => $pq->where('product_name', 'like', "%{$q}%"));
            });
        }

        $todayStr = now()->toDateString();
        $defaultBranchName = $user->employee?->branch_name ?: BranchProfile::getNameById($branchId);

        $accounts = $query->orderByDesc('installment_id')->get()->map(function ($inst) use ($todayStr, $defaultBranchName) {
            $fin = $inst->financialBreakdown();
            $balance = (float) $fin['balance'];
            if ($balance <= 0) {
                return null;
            }

            $cust = $inst->customer;
            $custName = $cust ? trim("{$cust->first_name} {$cust->last_name}") : 'Customer';
            $items = $inst->sale?->items ?? collect();
            $productName = $items->map(fn($it) => $it->product?->product_name)->filter()->implode(', ');

            $sortedSchedules = $inst->paymentSchedules->sortBy('installment_no')->values();
            $nextSchedule = $sortedSchedules->first(fn($s) => (float) $s->balance_due > 0.01);

            $overdueSchedules = $sortedSchedules->filter(function ($s) use ($todayStr) {
                if ((float) $s->balance_due <= 0.01) {
                    return false;
                }
                $st = strtolower((string) $s->status);
                return $st === 'overdue' || (!empty($s->due_date) && substr((string) $s->due_date, 0, 10) < $todayStr);
            });
            $overdueCount = $overdueSchedules->count();
            $overdueAmount = round((float) $overdueSchedules->sum('balance_due'), 2);

            $nextDue = $nextSchedule ? (float) $nextSchedule->balance_due : min($balance, (float) $inst->installment_amount);
            $totalTerms = (int) ($inst->number_of_installments ?: $sortedSchedules->count());
            $termsPaid = $sortedSchedules->filter(fn($s) => strtolower((string) $s->status) === 'paid' || (float) $s->balance_due <= 0.01)->count();

            $formattedItems = $items->map(fn($it) => [
                'sale_item_id' => $it->sale_item_id,
                'product_name' => $it->product?->product_name ?: 'Installment Item',
                'product_code' => $it->product?->product_code ?: '',
                'category' => $it->product?->category ?: '',
                'quantity' => (int) ($it->quantity ?: 1),
                'unit_price' => round((float) ($it->unit_price ?? 0), 2),
                'line_total' => round((float) ($it->line_total ?? 0), 2),
            ])->values()->all();

            $formattedSchedules = $sortedSchedules->map(function ($s) use ($todayStr) {
                $bal = round((float) $s->balance_due, 2);
                $st = strtolower((string) $s->status);
                $isOverdue = $bal > 0.01 && ($st === 'overdue' || (!empty($s->due_date) && substr((string) $s->due_date, 0, 10) < $todayStr));
                return [
                    'schedule_id' => $s->schedule_id,
                    'installment_no' => (int) $s->installment_no,
                    'due_date' => $s->due_date,
                    'amount_due' => round((float) $s->amount_due, 2),
                    'amount_paid' => round((float) $s->amount_paid, 2),
                    'balance_due' => $bal,
                    'status' => $isOverdue ? 'Overdue' : ($s->status ?: ($bal <= 0.01 ? 'Paid' : 'Pending')),
                    'is_overdue' => $isOverdue,
                ];
            })->values()->all();

            $recentPayments = $inst->payments
                ->sortByDesc('payment_id')
                ->take(5)
                ->map(fn($pm) => [
                    'payment_id' => $pm->payment_id,
                    'receipt_no' => $pm->receipt_no,
                    'receipt_reference' => $pm->receipt_reference,
                    'payment_date' => $pm->payment_date,
                    'amount' => round((float) $pm->amount, 2),
                    'payment_method' => $pm->payment_method,
                    'status' => $pm->status ?: 'Completed',
                ])->values()->all();

            $resolvedBranch = $inst->sale?->branch?->name
                ?: ($cust?->branch_name ?: $defaultBranchName);

            return [
                'installment_id' => $inst->installment_id,
                'account_no' => $inst->account_no,
                'invoice_no' => $inst->sale?->invoice_no ?: '',
                'branch_name' => $resolvedBranch ?: 'Branch',
                'customer_id' => $cust?->customer_id,
                'customer_code' => $cust?->customer_code ?: '',
                'customer_name' => $custName,
                'customer_phone' => $cust?->phone ?: '',
                'customer_email' => $cust?->email ?: '',
                'customer_address' => $cust?->address ?: '',
                'product_name' => $productName ?: 'Installment Item',
                'items' => $formattedItems,
                'status' => $inst->status,
                'principal_amount' => round((float) ($inst->principal_amount ?? 0), 2),
                'interest_rate' => round((float) ($inst->interest_rate ?? 0), 2),
                'interest_amount' => round((float) ($inst->interest_amount ?? 0), 2),
                'frequency' => $inst->frequency ?: 'Monthly',
                'total_payable' => round((float) ($fin['total_payable'] ?? $inst->total_payable ?? 0), 2),
                'down_payment' => round((float) ($inst->down_payment ?? 0), 2),
                'total_paid' => round((float) ($fin['paid'] ?? 0), 2),
                'installment_amount' => (float) $inst->installment_amount,
                'terms_paid' => $termsPaid,
                'total_terms' => $totalTerms,
                'next_due_date' => $nextSchedule?->due_date,
                'next_installment_no' => $nextSchedule?->installment_no,
                'start_date' => $inst->start_date,
                'next_amount_due' => round($nextDue, 2),
                'overdue_count' => $overdueCount,
                'overdue_amount' => $overdueAmount,
                'balance' => round($balance, 2),
                'pending_amount' => round((float) $fin['pending_amount'], 2),
                'pending_count' => (int) ($fin['pending_count'] ?? 0),
                'completed_payments_count' => (int) ($fin['completed_payments_count'] ?? 0),
                'notes' => $inst->notes ?: '',
                'schedules' => $formattedSchedules,
                'recent_payments' => $recentPayments,
                'has_agent' => (bool) ($inst->has_agent ?? $inst->sale?->has_agent ?? false),
                'agent_id' => $inst->agent_id ?: ($inst->sale?->agent_id ?: null),
                'agent_name' => $inst->agent ? trim("{$inst->agent->first_name} {$inst->agent->last_name}") : null,
                'agent_code' => $inst->agent?->employee_code ?: null,
            ];
        })->filter()->values();

        return response()->json([
            'success' => true,
            'accounts' => $accounts,
            'branch' => [
                'branch_id' => $branchId,
                'branch_name' => $user->employee?->branch_name ?: BranchProfile::getNameById($branchId),
            ],
        ]);
    }

    public function customerPay(Request $request)
    {
        $user = $request->user();
        if (!$user || !$user->isCollector()) {
            return response()->json([
                'success' => false,
                'message' => '403 Forbidden: Only Collector employees can record customer door-to-door payments.',
            ], 403);
        }

        $branchId = $user->employee?->branch_id ? (int) $user->employee->branch_id : null;
        if (!$branchId) {
            return response()->json([
                'success' => false,
                'message' => '403 Forbidden: Collector account has no assigned store branch.',
            ], 403);
        }

        $validated = $request->validate([
            'installment_id' => 'required|integer|exists:installment_accounts,installment_id',
            'amount' => 'required|numeric|min:0.01',
            'payment_method' => 'nullable|string|in:Cash,GCash,Maya,Online Bank',
            'official_receipt_no' => 'required|string|max:100',
            'reference_no' => 'nullable|string|max:100',
            'cash_tendered' => 'nullable|numeric|min:0.01',
            'payment_date' => 'nullable|date',
            'remarks' => 'nullable|string|max:500',
            'proof_of_payment' => 'required|image|max:5120',
        ]);

        $paymentMethod = !empty($validated['payment_method']) ? trim($validated['payment_method']) : 'Cash';
        $isCashMethod = $paymentMethod === 'Cash';
        $payAmount = round((float) $validated['amount'], 2);
        $orNumber = trim($validated['official_receipt_no']);
        $customRefNo = !empty($validated['reference_no']) ? trim((string) $validated['reference_no']) : null;
        $remarks = !empty($validated['remarks']) ? trim((string) $validated['remarks']) : null;
        $payDate = !empty($validated['payment_date']) ? $validated['payment_date'] : now()->toDateString();
        $cashTendered = $isCashMethod && isset($validated['cash_tendered']) && $validated['cash_tendered'] !== '' && $validated['cash_tendered'] !== null
            ? round((float) $validated['cash_tendered'], 2)
            : null;

        if ($isCashMethod && $cashTendered !== null && $cashTendered < $payAmount) {
            return response()->json([
                'success' => false,
                'message' => 'Cash tendered (₱' . number_format($cashTendered, 2) . ') cannot be less than amount collected (₱' . number_format($payAmount, 2) . ').',
            ], 422);
        }

        $changeDue = ($isCashMethod && $cashTendered !== null) ? round($cashTendered - $payAmount, 2) : null;
        $proofPath = $request->hasFile('proof_of_payment')
            ? $request->file('proof_of_payment')->store('proofs', 'public')
            : null;

        return DB::transaction(function () use ($validated, $user, $branchId, $paymentMethod, $isCashMethod, $payAmount, $orNumber, $customRefNo, $remarks, $payDate, $cashTendered, $changeDue, $proofPath, $request) {
            $inst = InstallmentAccount::with([
                'customer',
                'sale.branch',
                'sale.processedBy.employee',
                'sale.items.product',
                'payments',
            ])->lockForUpdate()->findOrFail($validated['installment_id']);

            $accBranchId = $inst->sale?->branch_id
                ?? $inst->customer?->branch_id
                ?? $inst->sale?->processedBy?->employee?->branch_id;

            if (!$accBranchId || (int) $accBranchId !== $branchId) {
                return response()->json([
                    'success' => false,
                    'message' => '403 Forbidden: Selected customer installment belongs to another store branch.',
                ], 403);
            }

            $fin = $inst->financialBreakdown();
            $outstanding = round((float) $fin['balance'], 2);
            if ($inst->isFullyPaid() || $outstanding <= 0) {
                return response()->json([
                    'success' => false,
                    'message' => "Installment account {$inst->account_no} is already Fully Paid.",
                ], 422);
            }

            if ($payAmount > ($outstanding + 0.01)) {
                return response()->json([
                    'success' => false,
                    'message' => 'Amount collected (₱' . number_format($payAmount, 2) . ') exceeds outstanding balance of ₱' . number_format($outstanding, 2) . '.',
                ], 422);
            }

            $nextSchedule = PaymentSchedule::where('installment_id', $inst->installment_id)
                ->where('balance_due', '>', 0)
                ->orderBy('installment_no')
                ->first();

            $paymentCount = (Payment::max('payment_id') ?? 0) + 1;
            $receiptNo = 'REC-' . date('Y') . '-' . str_pad($paymentCount, 5, '0', STR_PAD_LEFT);
            while (Payment::where('receipt_no', $receiptNo)->exists()) {
                $paymentCount++;
                $receiptNo = 'REC-' . date('Y') . '-' . str_pad($paymentCount, 5, '0', STR_PAD_LEFT);
            }

            $refPrefix = match ($paymentMethod) {
                'GCash' => 'REF-GCASH-',
                'Maya' => 'REF-MAYA-',
                'Online Bank' => 'REF-BANK-',
                default => 'REF-CASH-',
            };
            $refNo = $customRefNo ?: ($refPrefix . date('Ymd') . '-' . strtoupper(substr(uniqid(), -5)));
            while (Payment::where('reference_no', $refNo)->exists()) {
                $refNo = $refPrefix . date('Ymd') . '-' . strtoupper(substr(uniqid(), -5));
            }

            $collectorName = $user->employee
                ? trim("{$user->employee->first_name} {$user->employee->last_name}")
                : $user->username;
            $collectorCode = $user->employee?->employee_code ?: '';

            $hasAgent = (bool) ($inst->has_agent ?? $inst->sale?->has_agent ?? false);
            $agentId = $inst->agent_id ?: ($inst->sale?->agent_id ?: null);
            $contribSummary = AgentContributionService::calculateInstallmentPaymentContribution($inst, $payAmount, $hasAgent && !empty($agentId));

            $noteParts = array_filter([
                "Collected in field by Collector: {$collectorName}" . ($collectorCode ? " ({$collectorCode})" : '') . " | Method: {$paymentMethod} | OR #: {$orNumber}",
                !$isCashMethod && $customRefNo ? "Transaction Ref: {$customRefNo}" : null,
                $isCashMethod && $cashTendered !== null ? 'Cash Tendered: ₱' . number_format($cashTendered, 2) . ' | Change Due: ₱' . number_format($changeDue ?? 0, 2) : null,
                $remarks ? "Remarks: {$remarks}" : null,
            ]);

            $payment = Payment::create([
                'installment_id' => $inst->installment_id,
                'sale_id' => $inst->sale_id,
                'schedule_id' => $nextSchedule?->schedule_id,
                'receipt_no' => $receiptNo,
                'payment_date' => $payDate,
                'amount' => $payAmount,
                'payment_method' => $paymentMethod,
                'payment_type' => 'installment',
                'cash_channel' => 'collector',
                'collector_id' => $user->user_id,
                'reference_no' => $refNo,
                'receipt_reference' => $orNumber,
                'cash_tendered' => $cashTendered,
                'change_due' => $changeDue,
                'collector_confirmed_at' => now(),
                'collector_remarks' => $remarks,
                'received_by' => null,
                'has_agent' => $hasAgent && !empty($agentId),
                'agent_id' => $hasAgent ? $agentId : null,
                'appliances_agent_contribution' => $contribSummary['appliances_agent_contribution'],
                'furniture_agent_contribution' => $contribSummary['furniture_agent_contribution'],
                'total_agent_contribution' => $contribSummary['total_agent_contribution'],
                'notes' => implode(' | ', $noteParts),
                'proof_of_payment' => $proofPath,
                'status' => Payment::STATUS_COLLECTED_BY_COLLECTOR,
                'created_at' => now(),
            ]);

            $cust = $inst->customer;
            $custName = $cust ? trim("{$cust->first_name} {$cust->last_name}") : 'Customer';
            $items = $inst->sale?->items ?? collect();
            $productName = $items->map(fn($it) => $it->product?->product_name)->filter()->implode(', ') ?: 'Installment Item';

            SystemLog::create([
                'user_id' => $user->user_id,
                'action' => 'COLLECTOR_CUSTOMER_PAY',
                'module' => 'Payments',
                'description' => "Collector {$collectorName} ({$collectorCode}) recorded customer {$paymentMethod} payment {$payment->receipt_no} of ₱" . number_format($payAmount, 2) . " for {$inst->account_no} ({$custName}, {$productName}) [OR #: {$orNumber}]. Sent to Cashier for verification & Store Admin approval.",
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ]);

            $this->notifyBranchCashiers($branchId, [
                'type' => 'collector_remittance_to_cashier',
                'title' => "Customer Pay ({$paymentMethod}) — Sent to Cashier",
                'message' => "Collector {$collectorName} collected ₱" . number_format($payAmount, 2) . " via {$paymentMethod} for {$inst->account_no} ({$custName} • {$productName} | Balance: ₱" . number_format($outstanding, 2) . ", OR #: {$orNumber}). Verify and send to Store Admin for approval.",
                'module' => 'Payments',
                'related_id' => $payment->payment_id,
                'related_type' => 'App\Models\Payment',
                'action_url' => '/employee/receive-cash',
                'priority' => 'high',
            ]);

            if ($cust?->customer_id) {
                NotificationService::sendToCustomer($cust->customer_id, [
                    'type' => 'payment_collected_by_collector',
                    'title' => "{$paymentMethod} Payment Recorded",
                    'message' => "Collector {$collectorName} recorded your {$paymentMethod} payment of ₱" . number_format($payAmount, 2) . " (OR #: {$orNumber}). Sent to Cashier and Store Admin for final approval.",
                    'module' => 'Payments',
                    'related_id' => $payment->payment_id,
                    'related_type' => 'App\Models\Payment',
                    'action_url' => '/customer/dashboard?tab=statements',
                    'priority' => 'normal',
                ]);
            }

            PaymentSettlementService::invalidatePaymentCaches(['payments', 'installments', 'customers', 'dashboard', 'notifications', 'transactions']);

            \App\Services\RealtimeBroadcaster::dispatch(new \App\Events\CashPaymentWorkflowUpdated([
                'payment_id' => $payment->payment_id,
                'receipt_no' => $payment->receipt_no,
                'reference_no' => $payment->reference_no,
                'account_no' => $inst->account_no,
                'customer_name' => $custName,
                'amount' => (float) $payAmount,
                'payment_method' => $paymentMethod,
                'status' => $payment->status,
                'cash_channel' => 'collector',
                'stage' => 'collector_collected',
                'collector_id' => (int) $user->user_id,
                'actor_user_id' => (int) $user->user_id,
                'toast_title' => "Customer Pay ({$paymentMethod}) Sent to Cashier",
                'toast_message' => "Collector {$collectorName} collected ₱" . number_format($payAmount, 2) . " via {$paymentMethod} for {$inst->account_no} (OR #: {$orNumber}).",
            ], (int) $branchId, $cust?->customer_id ? (int) $cust->customer_id : null, [(int) $user->user_id]));

            return response()->json([
                'success' => true,
                'message' => "Customer {$paymentMethod} payment {$payment->receipt_no} recorded (OR #: {$orNumber}) and sent to Cashier for receipt & Store Admin approval.",
                'collection' => $this->formatCollectorPayment($payment->fresh([
                    'installmentAccount.customer.branch',
                    'installmentAccount.sale.branch',
                    'installmentAccount.sale.items.product',
                    'installmentAccount.payments',
                    'sale.customer.branch',
                    'sale.branch',
                    'sale.items.product',
                    'ewalletDeposit.customer.branch',
                    'collector.employee',
                    'confirmedBy.employee',
                    'receivedBy.employee',
                ])),
            ], 201);
        });
    }
}
