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
     * Get summary metrics for the customer dashboard
     */
    public function getDashboard(Request $request)
    {
        $user = $request->user();
        if (!$user || $user->role !== 'Customer' || !$user->customer_id) {
            return response()->json(['message' => 'Unauthorized or missing customer profile'], 403);
        }

        $customerId = $user->customer_id;

        // Products metrics
        $totalProducts = Product::count();
        $furnitureCount = Product::where('category', 'Furniture')->count();
        $applianceCount = Product::where('category', 'Appliances')->count();
        $outOfStockCount = Product::where('stock_quantity', '<=', 0)->count();
        // Since there is no is_sale column, we'll use a placeholder for Sale Items or check if cost < price (just a dummy metric)
        $saleItemCount = Product::where('status', 'Active')->count(); // Placeholder for "sale items"

        // Financial metrics for this customer
        $activeInstallments = InstallmentAccount::where('customer_id', $customerId)
            ->whereIn('status', ['Active', 'Pending'])
            ->get();
            
        $monthlyPayment = $activeInstallments->sum('installment_amount');
        
        // Calculate remaining credit balance
        $totalPayable = $activeInstallments->sum('total_payable');
        $totalPaid = Payment::whereIn('installment_id', $activeInstallments->pluck('installment_id'))
            ->where('status', 'Completed')
            ->sum('amount');
        $totalCreditBalance = max(0, $totalPayable - $totalPaid);

        // Overdue count
        $overdueCount = PaymentSchedule::whereIn('installment_id', $activeInstallments->pluck('installment_id'))
            ->where('due_date', '<', now()->format('Y-m-d'))
            ->where('status', 'Pending')
            ->count();

        return response()->json([
            'metrics' => [
                'total_products' => $totalProducts,
                'furniture_count' => $furnitureCount,
                'appliance_count' => $applianceCount,
                'monthly_payment' => $monthlyPayment,
                'total_credit_balance' => $totalCreditBalance,
                'sale_items_count' => $saleItemCount,
                'out_of_stock_count' => $outOfStockCount,
                'overdue_count' => $overdueCount
            ]
        ]);
    }

    /**
     * Get installment ledgers for the authenticated customer
     */
    public function getInstallments(Request $request)
    {
        $user = $request->user();
        if (!$user || $user->role !== 'Customer' || !$user->customer_id) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $installments = InstallmentAccount::with(['sale.items.product', 'payments' => function($q) {
            $q->where('status', 'Completed');
        }, 'paymentSchedules'])
            ->where('customer_id', $user->customer_id)
            ->orderBy('created_at', 'desc')
            ->get();

        $formatted = $installments->map(function ($inst) {
            $productName = 'Multiple Items';
            if ($inst->sale && $inst->sale->items->count() === 1) {
                $productName = $inst->sale->items->first()->product->product_name ?? 'Unknown';
            } elseif ($inst->sale && $inst->sale->items->count() > 1) {
                $productName = $inst->sale->items->first()->product->product_name . ' + others';
            }

            $paidAmount = $inst->payments->sum('amount');
            $balance = max(0, $inst->total_payable - $paidAmount);
            
            $nextDue = $inst->paymentSchedules
                ->where('status', 'Pending')
                ->where('due_date', '>=', now()->format('Y-m-d'))
                ->sortBy('due_date')
                ->first();

            return [
                'account_no' => $inst->account_no,
                'product' => $productName,
                'purchase_date' => $inst->start_date,
                'total_amount' => $inst->total_payable,
                'monthly_payment' => $inst->installment_amount,
                'paid_amount' => $paidAmount,
                'balance' => $balance,
                'next_due_date' => $nextDue ? $nextDue->due_date : null,
                'status' => $inst->status,
                'installment_id' => $inst->installment_id
            ];
        });

        return response()->json([
            'installments' => $formatted
        ]);
    }
}
