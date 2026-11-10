<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;

class Statement extends Model
{
    use HasFactory;

    protected $table = 'statements';
    protected $primaryKey = 'id';

    /**
     * The attributes that are mass assignable.
     *
     * @var array<int, string>
     */
    protected $fillable = [
        'customer_id',
        'date',
        'reference_no',
        'description',
        'type',
        'channel_method',
        'amount',
        'reference',
        'payment_method',
        'category',
        'account_no',
        'status',
        'statement_number',
        'start_date',
        'end_date',
        'opening_balance',
        'total_charges',
        'total_payments',
        'closing_balance',
        'due_date',
    ];

    /**
     * The attributes that should be cast.
     *
     * @var array<string, string>
     */
    protected $casts = [
        'date'            => 'date:Y-m-d',
        'start_date'      => 'date:Y-m-d',
        'end_date'        => 'date:Y-m-d',
        'due_date'        => 'date:Y-m-d',
        'amount'          => 'decimal:2',
        'opening_balance' => 'decimal:2',
        'total_charges'   => 'decimal:2',
        'total_payments'  => 'decimal:2',
        'closing_balance' => 'decimal:2',
    ];

    /**
     * Bootstrap model events.
     */
    protected static function booted()
    {
        static::saving(function ($statement) {
            // Ensure date defaults to start_date or today
            if (empty($statement->date)) {
                $statement->date = $statement->start_date ?: now()->toDateString();
            }

            // Synchronize reference_no, reference, and statement_number
            $ref = $statement->reference_no ?: ($statement->reference ?: $statement->statement_number);
            if (empty($ref)) {
                $ref = self::generateStatementNumber();
            }
            $statement->reference_no = $ref;
            $statement->reference = $ref;
            if (empty($statement->statement_number)) {
                $statement->statement_number = $ref;
            }

            // Synchronize channel_method and payment_method
            $channel = $statement->channel_method ?: ($statement->payment_method ?: 'Standard');
            $statement->channel_method = $channel;
            $statement->payment_method = $channel;

            // Default description
            if (empty($statement->description)) {
                $statement->description = $statement->type === 'Payment' ? 'Customer Payment' : 'Product Purchase';
            }

            // Synchronize category based on type
            if (empty($statement->category)) {
                $t = strtolower((string)$statement->type);
                $statement->category = (in_array($t, ['payment', 'down payment', 'credit'])) ? 'Credit' : 'Debit';
            }

            // Synchronize amount and closing_balance
            $amt = (float)($statement->amount ?? 0);
            if ($amt <= 0 && (float)($statement->closing_balance ?? 0) > 0) {
                $statement->amount = (float)$statement->closing_balance;
            }
            if ($statement->closing_balance === null || $statement->closing_balance === '') {
                $opening = (float)($statement->opening_balance ?? 0);
                $charges = (float)($statement->total_charges ?? 0);
                $payments = (float)($statement->total_payments ?? 0);
                $calc = round($opening + $charges - $payments, 2);
                $statement->closing_balance = $calc != 0 ? $calc : (float)($statement->amount ?? 0);
            }
        });
    }

    /**
     * Helper to generate a unique reference/statement number.
     */
    public static function generateStatementNumber(): string
    {
        $prefix = 'SOA-' . date('Ym') . '-';
        for ($i = 0; $i < 10; $i++) {
            $candidate = $prefix . str_pad((string)mt_rand(1, 9999), 4, '0', STR_PAD_LEFT);
            if (!self::where('reference_no', $candidate)->exists()) {
                return $candidate;
            }
        }

        return $prefix . strtoupper(substr(uniqid(), -4));
    }

    /**
     * Synchronize all transactions (Sales, Installments, Downpayments, Payments, E-Wallet)
     * for a specific customer into the statements database table.
     */
    public static function syncCustomerStatements(int $customerId): Collection
    {
        $sales = SaleTransaction::with(['items.product'])
            ->where('customer_id', $customerId)
            ->orderBy('sale_date', 'desc')
            ->get();

        $installments = InstallmentAccount::with(['sale.items.product', 'payments'])
            ->where('customer_id', $customerId)
            ->orderBy('created_at', 'desc')
            ->get();

        $payments = Payment::whereHas('installmentAccount', function ($q) use ($customerId) {
            $q->where('customer_id', $customerId);
        })->orderBy('payment_date', 'desc')
          ->get();

        $ewalletDeposits = EWalletDeposit::where('customer_id', $customerId)
            ->where('status', 'Completed')
            ->orderBy('created_at', 'desc')
            ->get();

        $synced = collect();

        // 1. Sales (Purchases / Debits)
        foreach ($sales as $sale) {
            $productNames = $sale->items->map(fn($it) => $it->product ? $it->product->product_name : 'Item')
                ->filter()
                ->implode(', ');
            $desc = $productNames ?: ($sale->notes ?: 'Product Purchase');
            $refNo = $sale->invoice_no ?: ('INV-' . $sale->sale_id);
            $dateStr = $sale->sale_date ? date('Y-m-d', strtotime($sale->sale_date)) : now()->toDateString();
            $channel = $sale->payment_method ?: 'Sale';
            $amt = (float)$sale->total_amount;

            $rec = self::updateOrCreate(
                ['reference_no' => $refNo],
                [
                    'customer_id'      => $customerId,
                    'date'             => $dateStr,
                    'description'      => $desc,
                    'type'             => 'Purchase',
                    'channel_method'   => $channel,
                    'amount'           => $amt,
                    'reference'        => $refNo,
                    'payment_method'   => $channel,
                    'category'         => 'Debit',
                    'account_no'       => $sale->invoice_no,
                    'status'           => $sale->status ?: 'Completed',
                    'statement_number' => $refNo,
                    'start_date'       => $dateStr,
                    'end_date'         => $dateStr,
                    'total_charges'    => $amt,
                    'closing_balance'  => $amt,
                ]
            );
            $synced->push($rec);
        }

        // 2. Installment Accounts & Down Payments
        foreach ($installments as $inst) {
            $alreadyInSales = $sales->contains(fn($s) => $inst->sale && $s->invoice_no === $inst->sale->invoice_no);

            if (!$alreadyInSales && (float)$inst->total_payable > 0) {
                $productName = 'Installment Purchase';
                if ($inst->sale && $inst->sale->items && $inst->sale->items->count() > 0) {
                    $productName = $inst->sale->items->map(fn($it) => $it->product?->product_name ?? 'Item')->implode(', ');
                }
                $refNo = $inst->account_no ?: ('INST-' . $inst->installment_id);
                $dateStr = date('Y-m-d', strtotime($inst->start_date ?: $inst->created_at));
                $amt = (float)($inst->principal_amount + $inst->interest_amount);

                $rec = self::updateOrCreate(
                    ['reference_no' => $refNo],
                    [
                        'customer_id'      => $customerId,
                        'date'             => $dateStr,
                        'description'      => $productName,
                        'type'             => 'Purchase',
                        'channel_method'   => 'Installment Plan',
                        'amount'           => $amt,
                        'reference'        => $refNo,
                        'payment_method'   => 'Installment Plan',
                        'category'         => 'Debit',
                        'account_no'       => $inst->account_no,
                        'status'           => $inst->status ?: 'Active',
                        'statement_number' => $refNo,
                        'start_date'       => $dateStr,
                        'end_date'         => $dateStr,
                        'total_charges'    => $amt,
                        'closing_balance'  => (float)$inst->balance,
                    ]
                );
                $synced->push($rec);
            }

            if ((float)$inst->down_payment > 0) {
                $hasDpPayment = $inst->payments->contains(function ($p) {
                    $notes = strtolower($p->notes ?? '');
                    return str_contains($notes, 'downpayment') || str_contains($notes, 'down payment');
                });

                if (!$hasDpPayment) {
                    $refNo = 'DP-' . ($inst->account_no ?: $inst->installment_id);
                    $dateStr = date('Y-m-d', strtotime($inst->start_date ?: $inst->created_at));
                    $amt = (float)$inst->down_payment;

                    $rec = self::updateOrCreate(
                        ['reference_no' => $refNo],
                        [
                            'customer_id'      => $customerId,
                            'date'             => $dateStr,
                            'description'      => 'Down payment for ' . $inst->account_no,
                            'type'             => 'Down Payment',
                            'channel_method'   => 'Down Payment',
                            'amount'           => $amt,
                            'reference'        => $refNo,
                            'payment_method'   => 'Down Payment',
                            'category'         => 'Credit',
                            'account_no'       => $inst->account_no,
                            'status'           => 'Completed',
                            'statement_number' => $refNo,
                            'start_date'       => $dateStr,
                            'end_date'         => $dateStr,
                            'total_payments'   => $amt,
                            'closing_balance'  => 0.00,
                        ]
                    );
                    $synced->push($rec);
                }
            }
        }

        // 3. Direct / Installment Payments (Credits)
        $seenReceipts = [];
        foreach ($payments as $payment) {
            $refNo = $payment->receipt_no ?: ('REC-' . $payment->payment_id);
            if (isset($seenReceipts[$refNo])) continue;
            $seenReceipts[$refNo] = true;

            $instAcc = $payment->installmentAccount;
            $desc = $payment->notes ?: ($instAcc ? "Payment for {$instAcc->account_no}" : 'Payment Received');
            $dateStr = date('Y-m-d', strtotime($payment->payment_date ?: $payment->created_at));
            $channel = $payment->payment_method ?: 'Payment';
            $amt = (float)$payment->amount;

            $rec = self::updateOrCreate(
                ['reference_no' => $refNo],
                [
                    'customer_id'      => $customerId,
                    'date'             => $dateStr,
                    'description'      => $desc,
                    'type'             => 'Payment',
                    'channel_method'   => $channel,
                    'amount'           => $amt,
                    'reference'        => $refNo,
                    'payment_method'   => $channel,
                    'category'         => 'Credit',
                    'account_no'       => $instAcc ? $instAcc->account_no : '—',
                    'status'           => $payment->status ?: 'Completed',
                    'statement_number' => $refNo,
                    'start_date'       => $dateStr,
                    'end_date'         => $dateStr,
                    'total_payments'   => $amt,
                    'closing_balance'  => $instAcc ? (float)$instAcc->balance : 0.00,
                ]
            );
            $synced->push($rec);
        }

        // 4. E-Wallet Deposits (if not already captured in payments)
        foreach ($ewalletDeposits as $ew) {
            if ($ew->payment_id && $payments->contains('payment_id', $ew->payment_id)) continue;
            $refNo = $ew->transaction_reference ?: ('EWAL-' . $ew->deposit_id);
            if (isset($seenReceipts[$refNo])) continue;
            $seenReceipts[$refNo] = true;

            $dateStr = date('Y-m-d', strtotime($ew->paid_at ?: $ew->created_at));
            $channel = $ew->payment_method ?: 'E-Wallet';
            $amt = (float)$ew->amount;

            $rec = self::updateOrCreate(
                ['reference_no' => $refNo],
                [
                    'customer_id'      => $customerId,
                    'date'             => $dateStr,
                    'description'      => "E-Wallet Payment ({$channel})",
                    'type'             => 'Payment',
                    'channel_method'   => $channel,
                    'amount'           => $amt,
                    'reference'        => $refNo,
                    'payment_method'   => $channel,
                    'category'         => 'Credit',
                    'account_no'       => $ew->customer_reference ?: 'E-Wallet',
                    'status'           => 'Completed',
                    'statement_number' => $refNo,
                    'start_date'       => $dateStr,
                    'end_date'         => $dateStr,
                    'total_payments'   => $amt,
                    'closing_balance'  => 0.00,
                ]
            );
            $synced->push($rec);
        }

        return $synced;
    }

    /**
     * Synchronize all existing customers' transactions into the statements table.
     */
    public static function syncAllFromTransactions(): void
    {
        $customerIds = Customer::pluck('customer_id');
        foreach ($customerIds as $customerId) {
            self::syncCustomerStatements((int)$customerId);
        }
    }

    /**
     * Get the customer that owns the statement.
     */
    public function customer()
    {
        return $this->belongsTo(Customer::class, 'customer_id', 'customer_id');
    }

    /**
     * Scope a query to filter statements for a specific customer.
     */
    public function scopeForCustomer($query, $customerId)
    {
        return $query->where('customer_id', $customerId);
    }
}
