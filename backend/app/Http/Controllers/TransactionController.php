<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\SaleTransaction;
use App\Models\Payment;
use App\Models\InstallmentAccount;
use Illuminate\Support\Facades\DB;

class TransactionController extends Controller
{
    private function detectChannelAndProvider($method, $notes = '', $ref = '')
    {
        $m = strtolower(trim($method . ' ' . $notes . ' ' . $ref));

        // 1. E-Wallet Check
        if (str_contains($m, 'gcash')) {
            return ['channel' => 'ewallet', 'provider' => 'GCash', 'badge_color' => '#005CE6'];
        }
        if (str_contains($m, 'maya') || str_contains($m, 'paymaya')) {
            return ['channel' => 'ewallet', 'provider' => 'Maya', 'badge_color' => '#00D632'];
        }
        if (str_contains($m, 'grabpay')) {
            return ['channel' => 'ewallet', 'provider' => 'GrabPay', 'badge_color' => '#00B14F'];
        }
        if (str_contains($m, 'shopeepay')) {
            return ['channel' => 'ewallet', 'provider' => 'ShopeePay', 'badge_color' => '#EE4D2D'];
        }
        if (str_contains($m, 'e-wallet') || str_contains($m, 'ewallet')) {
            return ['channel' => 'ewallet', 'provider' => 'E-Wallet', 'badge_color' => '#2563eb'];
        }

        // 2. Online Banking Check
        if (str_contains($m, 'bdo')) {
            return ['channel' => 'online_bank', 'provider' => 'BDO Online', 'badge_color' => '#003366'];
        }
        if (str_contains($m, 'bpi')) {
            return ['channel' => 'online_bank', 'provider' => 'BPI Online', 'badge_color' => '#B30838'];
        }
        if (str_contains($m, 'unionbank') || str_contains($m, 'ubp')) {
            return ['channel' => 'online_bank', 'provider' => 'UnionBank', 'badge_color' => '#FF7900'];
        }
        if (str_contains($m, 'metrobank')) {
            return ['channel' => 'online_bank', 'provider' => 'Metrobank', 'badge_color' => '#0A3B8C'];
        }
        if (str_contains($m, 'landbank')) {
            return ['channel' => 'online_bank', 'provider' => 'Landbank', 'badge_color' => '#008542'];
        }
        if (str_contains($m, 'rcbc')) {
            return ['channel' => 'online_bank', 'provider' => 'RCBC', 'badge_color' => '#004B87'];
        }
        if (str_contains($m, 'bank') || str_contains($m, 'transfer') || str_contains($m, 'instapay') || str_contains($m, 'pesonet') || str_contains($m, 'check')) {
            return ['channel' => 'online_bank', 'provider' => 'Bank Transfer', 'badge_color' => '#4338ca'];
        }

        // 3. Installment Check
        if (str_contains($m, 'installment')) {
            return ['channel' => 'installment', 'provider' => 'Installment', 'badge_color' => '#0284c7'];
        }

        // 4. Default to Cash
        return ['channel' => 'cash', 'provider' => 'Cash', 'badge_color' => '#16a34a'];
    }

    public function index(Request $request)
    {
        $search = $request->query('search');
        $type = $request->query('type', 'All'); // All, Sale, Payment
        $channelFilter = $request->query('channel', 'All'); // All, ewallet, online_bank, cash, installment
        $paymentMethod = $request->query('payment_method', 'All');
        $status = $request->query('status', 'All');
        $dateFrom = $request->query('date_from');
        $dateTo = $request->query('date_to');

        $transactions = collect();

        // 1. Fetch Sales Transactions
        if ($type === 'All' || $type === 'Sale') {
            $salesQuery = SaleTransaction::with(['customer', 'processedBy.employee', 'items.product']);

            if ($search) {
                $salesQuery->where(function ($q) use ($search) {
                    $q->where('invoice_no', 'like', "%{$search}%")
                      ->orWhere('payment_method', 'like', "%{$search}%")
                      ->orWhere('notes', 'like', "%{$search}%")
                      ->orWhereHas('customer', function ($cq) use ($search) {
                          $cq->where('first_name', 'like', "%{$search}%")
                             ->orWhere('last_name', 'like', "%{$search}%")
                             ->orWhere('customer_code', 'like', "%{$search}%");
                      });
                });
            }

            if ($paymentMethod !== 'All') {
                $salesQuery->where('payment_method', $paymentMethod);
            }

            if ($status !== 'All') {
                $salesQuery->where('status', $status);
            }

            if ($dateFrom) {
                $salesQuery->whereDate('sale_date', '>=', $dateFrom);
            }
            if ($dateTo) {
                $salesQuery->whereDate('sale_date', '<=', $dateTo);
            }

            $sales = $salesQuery->get()->map(function ($s) {
                $cust = $s->customer;
                $staff = $s->processedBy ? ($s->processedBy->employee ? "{$s->processedBy->employee->first_name} {$s->processedBy->employee->last_name}" : $s->processedBy->username) : 'Staff';
                $detection = $this->detectChannelAndProvider($s->payment_method, $s->notes ?? '');

                return [
                    'id' => 'SALE-' . $s->sale_id,
                    'raw_id' => $s->sale_id,
                    'type' => 'Sale Invoice',
                    'category' => 'sales',
                    'channel' => $detection['channel'],
                    'provider' => $detection['provider'],
                    'badge_color' => $detection['badge_color'],
                    'reference_code' => $s->invoice_no,
                    'date' => date('Y-m-d', strtotime($s->sale_date)),
                    'timestamp' => strtotime($s->sale_date),
                    'customer_id' => $s->customer_id,
                    'customer_name' => $cust ? "{$cust->first_name} {$cust->last_name}" : 'Walk-in Customer',
                    'customer_code' => $cust ? $cust->customer_code : '—',
                    'amount' => (float)$s->total_amount,
                    'amount_paid' => (float)$s->amount_paid,
                    'balance_due' => (float)$s->balance_due,
                    'payment_method' => $s->payment_method,
                    'reference_no' => $s->notes ?? '',
                    'status' => $s->status ?? 'Completed',
                    'processed_by' => $staff,
                    'items_count' => $s->items->count(),
                    'notes' => $s->notes ?? '',
                    'items' => $s->items->map(function ($item) {
                        return [
                            'product_name' => $item->product ? $item->product->product_name : 'Product',
                            'product_code' => $item->product ? $item->product->product_code : '',
                            'quantity' => $item->quantity,
                            'unit_price' => (float)$item->unit_price,
                            'discount' => (float)$item->discount,
                            'total_price' => (float)$item->total_price,
                        ];
                    }),
                ];
            });

            $transactions = $transactions->concat($sales);
        }

        // 2. Fetch Installment Payments
        if ($type === 'All' || $type === 'Payment') {
            $paymentsQuery = Payment::with(['installmentAccount.customer', 'receivedBy.employee']);

            if ($search) {
                $paymentsQuery->where(function ($q) use ($search) {
                    $q->where('receipt_no', 'like', "%{$search}%")
                      ->orWhere('reference_no', 'like', "%{$search}%")
                      ->orWhere('payment_method', 'like', "%{$search}%")
                      ->orWhere('notes', 'like', "%{$search}%")
                      ->orWhereHas('installmentAccount', function ($iq) use ($search) {
                          $iq->where('account_no', 'like', "%{$search}%")
                             ->orWhereHas('customer', function ($cq) use ($search) {
                                 $cq->where('first_name', 'like', "%{$search}%")
                                    ->orWhere('last_name', 'like', "%{$search}%")
                                    ->orWhere('customer_code', 'like', "%{$search}%");
                             });
                      });
                });
            }

            if ($paymentMethod !== 'All') {
                $paymentsQuery->where('payment_method', $paymentMethod);
            }

            if ($dateFrom) {
                $paymentsQuery->whereDate('payment_date', '>=', $dateFrom);
            }
            if ($dateTo) {
                $paymentsQuery->whereDate('payment_date', '<=', $dateTo);
            }

            $payments = $paymentsQuery->get()->map(function ($p) {
                $inst = $p->installmentAccount;
                $cust = $inst ? $inst->customer : null;
                $staff = $p->receivedBy ? ($p->receivedBy->employee ? "{$p->receivedBy->employee->first_name} {$p->receivedBy->employee->last_name}" : $p->receivedBy->username) : 'Staff';
                $detection = $this->detectChannelAndProvider($p->payment_method, $p->notes ?? '', $p->reference_no ?? '');

                return [
                    'id' => 'PAY-' . $p->payment_id,
                    'raw_id' => $p->payment_id,
                    'type' => 'Installment Payment',
                    'category' => 'payment',
                    'channel' => $detection['channel'],
                    'provider' => $detection['provider'],
                    'badge_color' => $detection['badge_color'],
                    'reference_code' => $p->receipt_no,
                    'account_no' => $inst ? $inst->account_no : 'N/A',
                    'installment_id' => $p->installment_id,
                    'date' => date('Y-m-d', strtotime($p->payment_date)),
                    'timestamp' => strtotime($p->payment_date),
                    'customer_id' => $cust ? $cust->customer_id : null,
                    'customer_name' => $cust ? "{$cust->first_name} {$cust->last_name}" : 'Customer',
                    'customer_code' => $cust ? $cust->customer_code : '—',
                    'amount' => (float)$p->amount,
                    'amount_paid' => (float)$p->amount,
                    'balance_due' => 0.00,
                    'payment_method' => $p->payment_method,
                    'reference_no' => $p->reference_no ?? '',
                    'status' => 'Completed',
                    'processed_by' => $staff,
                    'items_count' => 1,
                    'notes' => $p->notes ?? '',
                    'items' => [],
                ];
            });

            $transactions = $transactions->concat($payments);
        }

        // Apply channel filter if specified
        if ($channelFilter !== 'All') {
            $transactions = $transactions->filter(function ($t) use ($channelFilter) {
                return $t['channel'] === $channelFilter;
            })->values();
        }

        // Sort descending by date/timestamp
        $sortedTransactions = $transactions->sortByDesc('timestamp')->values();

        // Summary Calculations
        $allTx = $transactions;
        $totalCount = $sortedTransactions->count();
        $totalSalesSum = $sortedTransactions->where('category', 'sales')->sum('amount');
        $totalPaymentsSum = $sortedTransactions->where('category', 'payment')->sum('amount');
        $totalVolume = $totalSalesSum + $totalPaymentsSum;

        // Channel breakdowns
        $ewalletTx = $sortedTransactions->where('channel', 'ewallet');
        $onlineBankTx = $sortedTransactions->where('channel', 'online_bank');
        $cashTx = $sortedTransactions->where('channel', 'cash');
        $installmentTx = $sortedTransactions->where('channel', 'installment');

        return response()->json([
            'transactions' => $sortedTransactions,
            'summary' => [
                'total_count' => $totalCount,
                'total_volume' => (float)$totalVolume,
                'total_sales' => (float)$totalSalesSum,
                'total_payments' => (float)$totalPaymentsSum,
                'ewallet_total' => (float)$ewalletTx->sum('amount'),
                'ewallet_count' => $ewalletTx->count(),
                'online_bank_total' => (float)$onlineBankTx->sum('amount'),
                'online_bank_count' => $onlineBankTx->count(),
                'cash_collected' => (float)$cashTx->sum('amount'),
                'cash_count' => $cashTx->count(),
                'installment_volume' => (float)$installmentTx->sum('amount'),
                'installment_count' => $installmentTx->count(),
                'average_transaction' => $totalCount > 0 ? (float)($totalVolume / $totalCount) : 0.0,
            ],
        ]);
    }
}
