<?php

namespace App\Services;

use App\Events\InstallmentCompleted;
use App\Http\Controllers\SyncController;
use App\Models\BranchProfile;
use App\Models\Customer;
use App\Models\EWalletDeposit;
use App\Models\InstallmentAccount;
use App\Models\Payment;
use App\Models\PaymentSchedule;
use App\Models\Product;
use App\Models\SaleItem;
use App\Models\SaleTransaction;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class PaymentSettlementService
{
    public static function scopeQueryToBranch(Builder $query, int $branchId): void
    {
        $query->where(function ($q) use ($branchId) {
            $q->whereHas('installmentAccount', function ($iq) use ($branchId) {
                $iq->whereHas('sale', fn($sq) => $sq->where('branch_id', $branchId))
                    ->orWhereHas('customer', fn($cq) => $cq->where('branch_id', $branchId))
                    ->orWhereHas('sale.processedBy.employee', fn($eq) => $eq->where('branch_id', $branchId));
            })->orWhereHas('sale', function ($sq) use ($branchId) {
                $sq->where('branch_id', $branchId)
                    ->orWhereHas('customer', fn($cq) => $cq->where('branch_id', $branchId))
                    ->orWhereHas('processedBy.employee', fn($eq) => $eq->where('branch_id', $branchId));
            })->orWhereHas('ewalletDeposit.customer', function ($cq) use ($branchId) {
                $cq->where('branch_id', $branchId);
            });
        });
    }

    public static function resolvePaymentBranchId(Payment $payment): ?int
    {
        $candidates = [
            $payment->installmentAccount?->sale?->branch_id,
            $payment->installmentAccount?->customer?->branch_id,
            $payment->installmentAccount?->sale?->processedBy?->employee?->branch_id,
            $payment->sale?->branch_id,
            $payment->sale?->customer?->branch_id,
            $payment->sale?->processedBy?->employee?->branch_id,
            $payment->ewalletDeposit?->customer?->branch_id,
            $payment->collector?->employee?->branch_id,
            $payment->receivedBy?->employee?->branch_id,
        ];

        foreach ($candidates as $branchId) {
            if (!empty($branchId)) {
                return (int) $branchId;
            }
        }

        return null;
    }

    public static function resolvePaymentBranchName(Payment $payment): string
    {
        $branchId = self::resolvePaymentBranchId($payment);
        $extractBranchName = static function ($record): ?string {
            if (!$record) {
                return null;
            }
            if (!empty($record->branch_name)) {
                return (string) $record->branch_name;
            }
            if (is_object($record->branch ?? null) && !empty($record->branch->name)) {
                return (string) $record->branch->name;
            }
            if (is_string($record->branch ?? null) && $record->branch !== '') {
                return $record->branch;
            }
            return null;
        };

        $name = $payment->installmentAccount?->sale?->branch?->name
            ?? $payment->sale?->branch?->name
            ?? $extractBranchName($payment->installmentAccount?->customer)
            ?? $extractBranchName($payment->ewalletDeposit?->customer)
            ?? $extractBranchName($payment->collector?->employee)
            ?? $extractBranchName($payment->receivedBy?->employee);

        if (!$name && $branchId) {
            $name = BranchProfile::getNameById($branchId);
        }

        return $name ?: 'Main Branch';
    }

    public static function applyConfirmedInstallmentSettlement(Payment $payment, ?User $verifier = null): ?array
    {
        $inst = $payment->installment_id
            ? InstallmentAccount::with(['customer', 'sale.branch', 'sale.processedBy.employee', 'paymentSchedules'])->lockForUpdate()->find($payment->installment_id)
            : null;

        if (!$inst) {
            if ($payment->sale_id) {
                $sale = SaleTransaction::lockForUpdate()->find($payment->sale_id);
                if ($sale) {
                    $newSalePaid = min((float) $sale->total_amount, round((float) $sale->amount_paid + (float) $payment->amount, 2));
                    $newSaleBal = max(0, round((float) $sale->total_amount - $newSalePaid, 2));
                    $sale->update([
                        'amount_paid' => $newSalePaid,
                        'balance_due' => $newSaleBal,
                        'status' => $newSaleBal <= 0 ? 'Completed' : 'Partially Paid',
                    ]);
                }
            }
            return null;
        }

        $wasAlreadyFullyPaid = strtolower(trim((string) $inst->status)) === strtolower(InstallmentAccount::STATUS_FULLY_PAID)
            && $inst->completed_at !== null;

        $payAmount = (float) $payment->amount;
        $payDate = $payment->payment_date ?: now()->toDateString();
        $remainingPayment = $payAmount;

        $payment->loadMissing('ewalletDeposit');
        $gwResp = is_array($payment->ewalletDeposit?->gateway_response) ? $payment->ewalletDeposit->gateway_response : [];
        $selectedScheduleIds = array_values(array_unique(array_filter(array_map(
            'intval',
            is_array($gwResp['selected_schedule_ids'] ?? null)
                ? $gwResp['selected_schedule_ids']
                : ($payment->schedule_id ? [(int) $payment->schedule_id] : [])
        ))));

        $allUnpaidSchedules = PaymentSchedule::where('installment_id', $inst->installment_id)
            ->where('balance_due', '>', 0)
            ->orderBy('installment_no')
            ->get();

        if (!empty($selectedScheduleIds)) {
            $prioritized = $allUnpaidSchedules->filter(fn ($s) => in_array((int) $s->schedule_id, $selectedScheduleIds, true));
            $others = $allUnpaidSchedules->reject(fn ($s) => in_array((int) $s->schedule_id, $selectedScheduleIds, true));
            $schedules = $prioritized->concat($others)->values();
        } else {
            $schedules = $allUnpaidSchedules;
        }

        $primaryScheduleId = null;

        foreach ($schedules as $sched) {
            if ($remainingPayment <= 0) {
                break;
            }

            $dueOnSchedule = (float) $sched->balance_due;
            $applyToSched = min($remainingPayment, $dueOnSchedule);

            $newPaid = round((float) $sched->amount_paid + $applyToSched, 2);
            $newBal = max(0, round((float) $sched->amount_due - $newPaid, 2));
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
            $payment->schedule_id = $primaryScheduleId;
            $payment->save();
        }

        $inst->unsetRelation('payments');
        $fin = $inst->financialBreakdown();
        $newTotalPaid = $fin['paid'];
        $newBalance = $fin['balance'];

        $verifierUser = $verifier ?: ($payment->confirmedBy ?: $payment->receivedBy);
        $verifierId = $verifierUser?->user_id ?? $payment->confirmed_by ?? $payment->received_by;
        $verifierName = $verifierUser
            ? ($verifierUser->employee
                ? trim("{$verifierUser->employee->first_name} {$verifierUser->employee->last_name}")
                : $verifierUser->username)
            : 'Store Administrator';

        $justCompleted = false;
        $completedAt = $inst->completed_at;
        $customerStanding = $inst->customer_standing;
        $agentContributionStatus = $inst->agent_contribution_status;
        $nextDueDate = null;

        if ($newBalance <= 0.0) {
            $newBalance = 0.00;
            $newAccStatus = InstallmentAccount::STATUS_FULLY_PAID;
            PaymentSchedule::where('installment_id', $inst->installment_id)
                ->update([
                    'balance_due' => 0.00,
                    'amount_paid' => DB::raw('amount_due'),
                    'status' => 'Paid',
                    'paid_date' => DB::raw("IFNULL(paid_date, '{$payDate}')"),
                ]);

            $completedAt = $inst->completed_at ?: now();
            $customerStanding = InstallmentAccount::STANDING_CLEARED;
            if ($inst->has_agent) {
                $agentContributionStatus = InstallmentAccount::AGENT_CONTRIBUTION_SETTLED;
            }
            $justCompleted = !$wasAlreadyFullyPaid;
        } else {
            $nextSched = PaymentSchedule::where('installment_id', $inst->installment_id)
                ->where('balance_due', '>', 0)
                ->orderBy('due_date')
                ->first();
            $nextDueDate = $nextSched?->due_date;

            $hasOverdue = PaymentSchedule::where('installment_id', $inst->installment_id)
                ->where('due_date', '<', date('Y-m-d'))
                ->where('balance_due', '>', 0)
                ->exists();
            $newAccStatus = $hasOverdue ? 'Overdue' : 'Active';
        }

        $instUpdates = ['status' => $newAccStatus];
        if (Schema::hasColumn('installment_accounts', 'remaining_balance')) {
            $instUpdates['remaining_balance'] = $newBalance;
        }
        if (Schema::hasColumn('installment_accounts', 'next_due_date')) {
            $instUpdates['next_due_date'] = $nextDueDate;
        }
        if ($newBalance <= 0.0) {
            if (Schema::hasColumn('installment_accounts', 'completed_at')) {
                $instUpdates['completed_at'] = $completedAt;
            }
            if (Schema::hasColumn('installment_accounts', 'customer_standing')) {
                $instUpdates['customer_standing'] = $customerStanding;
            }
            if (Schema::hasColumn('installment_accounts', 'completed_verified_by') && $verifierId) {
                $instUpdates['completed_verified_by'] = $verifierId;
            }
            if ($inst->has_agent && Schema::hasColumn('installment_accounts', 'agent_contribution_status')) {
                $instUpdates['agent_contribution_status'] = $agentContributionStatus;
            }
        }
        $inst->update($instUpdates);

        if ($inst->sale_id) {
            $sale = SaleTransaction::find($inst->sale_id);
            if ($sale) {
                $newSalePaid = min((float) $sale->total_amount, round($newTotalPaid, 2));
                $newSaleBal = max(0, round((float) $sale->total_amount - $newSalePaid, 2));
                $sale->update([
                    'amount_paid' => $newSalePaid,
                    'balance_due' => $newSaleBal,
                    'status' => $newSaleBal <= 0 ? 'Completed' : 'Partially Paid',
                ]);
            }
        }

        $customerName = $inst->customer ? trim("{$inst->customer->first_name} {$inst->customer->last_name}") : 'Customer';
        $branchId = self::resolvePaymentBranchId($payment)
            ?? $inst->sale?->branch_id
            ?? $inst->customer?->branch_id
            ?? $inst->sale?->processedBy?->employee?->branch_id;

        if ($justCompleted) {
            $employeeIds = array_filter([
                $payment->collector_id ? (int) $payment->collector_id : null,
                $payment->received_by ? (int) $payment->received_by : null,
                $payment->confirmed_by ? (int) $payment->confirmed_by : null,
                $verifierId ? (int) $verifierId : null,
            ]);

            if ($inst->customer_id) {
                NotificationService::sendToCustomer((int) $inst->customer_id, [
                    'type' => 'installment_completed',
                    'title' => 'Installment Fully Paid — Cleared',
                    'message' => "Congratulations! Your installment account {$inst->account_no} is now Fully Paid (₱0.00 balance). Your Certificate of Full Payment and Final Statement of Account are ready.",
                    'module' => 'Installments',
                    'related_id' => $inst->installment_id,
                    'related_type' => InstallmentAccount::class,
                    'action_url' => '/customer/dashboard?tab=installments',
                    'priority' => 'high',
                ]);
            }

            if ($branchId) {
                NotificationService::sendToStoreAdmins([
                    'type' => 'installment_completed',
                    'title' => 'Installment Contract Fully Paid',
                    'message' => "Account {$inst->account_no} ({$customerName}) has reached ₱0.00 balance and transitioned to Fully Paid. Verified by {$verifierName}.",
                    'module' => 'Installments',
                    'related_id' => $inst->installment_id,
                    'related_type' => InstallmentAccount::class,
                    'action_url' => "/installments?id={$inst->installment_id}",
                    'priority' => 'high',
                ], (string) $branchId);
            }

            RealtimeBroadcaster::dispatch(new InstallmentCompleted([
                'installment_id' => (int) $inst->installment_id,
                'account_no' => $inst->account_no,
                'customer_id' => $inst->customer_id ? (int) $inst->customer_id : null,
                'customer_name' => $customerName,
                'payment_id' => (int) $payment->payment_id,
                'receipt_no' => $payment->receipt_no,
                'status' => InstallmentAccount::STATUS_FULLY_PAID,
                'remaining_balance' => 0.00,
                'total_paid' => round($newTotalPaid, 2),
                'completed_at' => $completedAt ? $completedAt->toIso8601String() : now()->toIso8601String(),
                'next_due_date' => null,
                'customer_standing' => $customerStanding,
                'agent_contribution_status' => $agentContributionStatus,
                'verified_by' => $verifierName,
                'actor_user_id' => $verifierId ? (int) $verifierId : null,
                'toast_title' => 'Installment Fully Paid',
                'toast_message' => "Account {$inst->account_no} ({$customerName}) is now Fully Paid & Cleared.",
            ], $branchId ? (int) $branchId : null, $inst->customer_id ? (int) $inst->customer_id : null, $employeeIds));
        }

        return [
            'installment_id' => $inst->installment_id,
            'account_no' => $inst->account_no,
            'paid' => $newTotalPaid,
            'balance' => $newBalance,
            'remaining_balance' => $newBalance,
            'status' => $newAccStatus,
            'completed_at' => $completedAt ? $completedAt->toIso8601String() : null,
            'next_due_date' => $nextDueDate,
            'customer_standing' => $customerStanding,
            'agent_contribution_status' => $agentContributionStatus,
            'just_completed' => $justCompleted,
            'verified_by' => $verifierName,
            'customer_id' => $inst->customer_id,
            'customer_name' => $customerName,
        ];
    }

    public static function syncDepositForConfirmedPayment(Payment $payment, User $actor, ?string $receiptRef = null): ?EWalletDeposit
    {
        $deposit = EWalletDeposit::where('payment_id', $payment->payment_id)
            ->when($payment->reference_no, fn($q) => $q->orWhere('transaction_reference', $payment->reference_no))
            ->first();

        if (!$deposit) {
            return null;
        }

        $gateway = $deposit->gateway_response ?? [];
        if ($receiptRef) {
            $deposit->customer_reference = $receiptRef;
            $gateway['receipt_reference'] = $receiptRef;
        }
        $deposit->status = 'paid';
        $deposit->paid_at = now();
        $deposit->gateway_response = $gateway;
        $deposit->save();

        $hasItems = !empty($gateway['items']) && $deposit->payment_type === 'product_order';
        if ($hasItems && !$payment->installment_id && !$payment->sale_id) {
            $items = $gateway['items'];
            $subtotal = 0.0;
            foreach ($items as $item) {
                $subtotal += ((float) ($item['price'] ?? 0)) * ((int) ($item['quantity'] ?? 1));
            }
            if ($subtotal <= 0) {
                $subtotal = (float) $payment->amount;
            }

            $invoiceCount = (SaleTransaction::max('sale_id') ?? 0) + 1;
            $invoiceNo = 'INV-' . date('Y') . '-' . str_pad($invoiceCount, 5, '0', STR_PAD_LEFT);
            while (SaleTransaction::where('invoice_no', $invoiceNo)->exists()) {
                $invoiceCount++;
                $invoiceNo = 'INV-' . date('Y') . '-' . str_pad($invoiceCount, 5, '0', STR_PAD_LEFT);
            }

            $customer = $deposit->customer_id ? Customer::find($deposit->customer_id) : null;
            $branchId = $actor->employee?->branch_id ?? $customer?->branch_id;

            $sale = SaleTransaction::create([
                'invoice_no' => $invoiceNo,
                'customer_id' => $deposit->customer_id,
                'processed_by' => $actor->user_id,
                'branch_id' => $branchId,
                'sale_date' => now(),
                'payment_method' => 'Cash',
                'subtotal' => $subtotal,
                'discount_amount' => 0.00,
                'total_amount' => (float) $payment->amount,
                'amount_paid' => (float) $payment->amount,
                'balance_due' => 0.00,
                'status' => 'Completed',
                'notes' => "Walk-in Cash order confirmed by Cashier [{$actor->username}] [Ref: {$deposit->transaction_reference}]",
            ]);

            foreach ($items as $itemData) {
                $productId = $itemData['product_id'] ?? null;
                $qty = max(1, (int) ($itemData['quantity'] ?? 1));
                if ($productId) {
                    $product = Product::lockForUpdate()->find($productId);
                    if ($product) {
                        $unitPrice = (float) ($itemData['price'] ?? ($product->discount_price ?: $product->unit_price));
                        SaleItem::create([
                            'sale_id' => $sale->sale_id,
                            'product_id' => $product->product_id,
                            'quantity' => $qty,
                            'unit_price' => $unitPrice,
                            'discount_amount' => 0.00,
                            'line_total' => round($unitPrice * $qty, 2),
                        ]);
                        if ($product->stock_quantity > 0) {
                            $product->decrement('stock_quantity', min($product->stock_quantity, $qty));
                        }
                    }
                }
            }

            $payment->sale_id = $sale->sale_id;
            $payment->save();
        }

        return $deposit;
    }

    public static function invalidatePaymentCaches(array $modules = ['payments', 'installments', 'sales', 'customers', 'dashboard', 'reports', 'transactions']): void
    {
        Cache::increment('pace_pay_cache_v');
        Cache::increment('pace_inst_cache_v');
        Cache::increment('pace_sales_cache_v');
        SyncController::invalidateFingerprint($modules);
    }
}
