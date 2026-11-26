<?php

namespace App\Services;

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

    public static function applyConfirmedInstallmentSettlement(Payment $payment): ?array
    {
        $inst = $payment->installment_id
            ? InstallmentAccount::with(['customer', 'sale', 'paymentSchedules'])->lockForUpdate()->find($payment->installment_id)
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

        $payAmount = (float) $payment->amount;
        $payDate = $payment->payment_date ?: now()->toDateString();
        $remainingPayment = $payAmount;

        $schedules = PaymentSchedule::where('installment_id', $inst->installment_id)
            ->where('balance_due', '>', 0)
            ->orderBy('installment_no')
            ->get();

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

        if ($newBalance <= 0) {
            $newAccStatus = 'Completed';
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

        return [
            'installment_id' => $inst->installment_id,
            'account_no' => $inst->account_no,
            'paid' => $newTotalPaid,
            'balance' => $newBalance,
            'status' => $newAccStatus,
            'customer_id' => $inst->customer_id,
            'customer_name' => $inst->customer ? trim("{$inst->customer->first_name} {$inst->customer->last_name}") : 'Customer',
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
