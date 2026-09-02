<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Customer;
use App\Models\SystemLog;

class CustomerController extends Controller
{
    public function index(Request $request)
    {
        $query = Customer::with(['installmentAccounts.payments', 'saleTransactions']);

        if ($request->filled('search')) {
            $s = $request->query('search');
            $query->where(function ($q) use ($s) {
                $q->where('first_name', 'like', "%{$s}%")
                  ->orWhere('last_name', 'like', "%{$s}%")
                  ->orWhere('customer_code', 'like', "%{$s}%")
                  ->orWhere('phone', 'like', "%{$s}%")
                  ->orWhere('email', 'like', "%{$s}%");
            });
        }

        if ($request->filled('status') && $request->query('status') !== 'All') {
            $query->where('status', $request->query('status'));
        }

        if ($request->boolean('export_csv')) {
            $user = $request->user();
            if ($user && in_array($user->role, ['Store Administrator', 'Store Admin'])) {
                $branch = $user->employee ? $user->employee->branch : 'Main Branch';
                $query->whereHas('saleTransactions.processedBy.employee', function($eq) use ($branch) {
                    $eq->where('branch', $branch);
                });
            }

            SystemLog::create([
                'user_id' => $user ? $user->user_id : null,
                'action' => 'EXPORT',
                'module' => 'Customers',
                'description' => 'Exported Customers to CSV',
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ]);

            return $this->exportCsv(
                'customers_export_' . date('Y-m-d') . '.csv',
                ['Customer ID', 'Customer Code', 'First Name', 'Middle Name', 'Last Name', 'Phone', 'Email', 'Address', 'Status', 'Notes', 'Created Date'],
                $query->orderBy('customer_id'),
                function ($c) {
                    return [
                        $c->customer_id,
                        $c->customer_code,
                        $c->first_name,
                        $c->middle_name,
                        $c->last_name,
                        $c->phone,
                        $c->email,
                        $c->address,
                        $c->status,
                        $c->notes,
                        $c->created_at ? $c->created_at->format('Y-m-d H:i:s') : ''
                    ];
                }
            );
        }

        $customers = $query->orderBy('customer_id')->get()->map(function ($c) {
            $activeInsts = $c->installmentAccounts->whereIn('status', ['Active', 'Overdue'])->count();
            
            $totalBalance = 0;
            foreach ($c->installmentAccounts->whereIn('status', ['Active', 'Overdue']) as $inst) {
                $paid = (float)$inst->payments->sum('amount') + (float)$inst->down_payment;
                $balance = max(0, (float)$inst->total_payable - $paid);
                $totalBalance += $balance;
            }

            return [
                'customer_id' => $c->customer_id,
                'customer_code' => $c->customer_code,
                'first_name' => $c->first_name,
                'middle_name' => $c->middle_name,
                'last_name' => $c->last_name,
                'phone' => $c->phone,
                'email' => $c->email,
                'address' => $c->address,
                'status' => $c->status,
                'notes' => $c->notes,
                'active_installments' => $activeInsts,
                'balance' => $totalBalance,
            ];
        });

        return response()->json([
            'customers' => $customers,
            'total' => $customers->count(),
        ]);
    }

    public function show($id)
    {
        $customer = Customer::with([
            'saleTransactions' => function ($q) {
                $q->orderByDesc('sale_date');
            },
            'installmentAccounts' => function ($q) {
                $q->with(['payments', 'paymentSchedules', 'sale'])->orderByDesc('installment_id');
            }
        ])->findOrFail($id);

        $sales = $customer->saleTransactions->map(function ($s) {
            return [
                'sale_id' => $s->sale_id,
                'invoice_no' => $s->invoice_no,
                'sale_date' => date('Y-m-d', strtotime($s->sale_date)),
                'payment_method' => $s->payment_method,
                'total_amount' => (float)$s->total_amount,
                'amount_paid' => (float)$s->amount_paid,
                'balance_due' => (float)$s->balance_due,
                'status' => $s->status,
            ];
        });

        $installments = $customer->installmentAccounts->map(function ($inst) {
            $paid = (float)$inst->payments->sum('amount') + (float)$inst->down_payment;
            $balance = max(0, (float)$inst->total_payable - $paid);

            return [
                'installment_id' => $inst->installment_id,
                'account_no' => $inst->account_no,
                'invoice_no' => $inst->sale ? $inst->sale->invoice_no : 'N/A',
                'start_date' => $inst->start_date,
                'principal_amount' => (float)$inst->principal_amount,
                'down_payment' => (float)$inst->down_payment,
                'interest_rate' => (float)$inst->interest_rate,
                'interest_amount' => (float)$inst->interest_amount,
                'total_payable' => (float)$inst->total_payable,
                'installment_amount' => (float)$inst->installment_amount,
                'number_of_installments' => $inst->number_of_installments,
                'frequency' => $inst->frequency,
                'paid' => $paid,
                'balance' => $balance,
                'status' => $inst->status,
            ];
        });

        $allPayments = [];
        foreach ($customer->installmentAccounts as $inst) {
            foreach ($inst->payments as $p) {
                $allPayments[] = [
                    'payment_id' => $p->payment_id,
                    'installment_id' => $p->installment_id,
                    'receipt_no' => $p->receipt_no,
                    'payment_date' => $p->payment_date,
                    'amount' => (float)$p->amount,
                    'payment_method' => $p->payment_method,
                    'reference_no' => $p->reference_no,
                    'received_by' => $p->receivedBy ? $p->receivedBy->username : 'System',
                    'notes' => $p->notes,
                ];
            }
        }

        $activeInsts = $installments->whereIn('status', ['Active', 'Overdue'])->count();
        $totalBalance = $installments->whereIn('status', ['Active', 'Overdue'])->sum('balance');
        $lifetimeSpend = $customer->saleTransactions->sum('total_amount');
        $lastPurchase = $customer->saleTransactions->max('sale_date');

        return response()->json([
            'customer' => [
                'customer_id' => $customer->customer_id,
                'customer_code' => $customer->customer_code,
                'first_name' => $customer->first_name,
                'middle_name' => $customer->middle_name,
                'last_name' => $customer->last_name,
                'phone' => $customer->phone,
                'email' => $customer->email,
                'address' => $customer->address,
                'status' => $customer->status,
                'notes' => $customer->notes,
                'active_installments' => $activeInsts,
                'balance' => $totalBalance,
                'lifetime_spend' => (float)$lifetimeSpend,
                'last_purchase' => $lastPurchase ? date('M d, Y', strtotime($lastPurchase)) : null,
            ],
            'sales' => $sales,
            'installments' => $installments,
            'payments' => $allPayments,
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'customer_code' => 'nullable|string|unique:customers,customer_code',
            'first_name' => 'required|string|max:255',
            'middle_name' => 'nullable|string|max:255',
            'last_name' => 'required|string|max:255',
            'phone' => 'required|string|max:50',
            'email' => 'nullable|email|max:255',
            'address' => 'nullable|string',
            'status' => 'required|string|in:Active,Inactive',
            'notes' => 'nullable|string',
        ]);

        if (empty($validated['customer_code'])) {
            $count = Customer::count() + 1;
            $validated['customer_code'] = 'CUS-' . str_pad($count, 3, '0', STR_PAD_LEFT);
        }

        $customer = Customer::create($validated);

        SystemLog::create([
            'user_id' => $request->input('user_id', 1),
            'action' => 'CREATE',
            'module' => 'Customers',
            'description' => "Created new customer: {$customer->first_name} {$customer->last_name} ({$customer->customer_code})",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json([
            'message' => 'Customer created successfully',
            'customer' => $customer,
        ], 201);
    }

    public function update(Request $request, $id)
    {
        $customer = Customer::findOrFail($id);

        $validated = $request->validate([
            'customer_code' => "required|string|unique:customers,customer_code,{$id},customer_id",
            'first_name' => 'required|string|max:255',
            'middle_name' => 'nullable|string|max:255',
            'last_name' => 'required|string|max:255',
            'phone' => 'required|string|max:50',
            'email' => 'nullable|email|max:255',
            'address' => 'nullable|string',
            'status' => 'required|string|in:Active,Inactive',
            'notes' => 'nullable|string',
        ]);

        $customer->update($validated);

        SystemLog::create([
            'user_id' => $request->input('user_id', 1),
            'action' => 'UPDATE',
            'module' => 'Customers',
            'description' => "Updated customer: {$customer->first_name} {$customer->last_name} ({$customer->customer_code})",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json([
            'message' => 'Customer updated successfully',
            'customer' => $customer,
        ]);
    }

    public function destroy(Request $request, $id)
    {
        $customer = Customer::findOrFail($id);
        $name = "{$customer->first_name} {$customer->last_name}";
        $code = $customer->customer_code;

        $customer->delete();

        SystemLog::create([
            'user_id' => $request->input('user_id', 1),
            'action' => 'DELETE',
            'module' => 'Customers',
            'description' => "Deleted customer: {$name} ({$code})",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json(['message' => 'Customer deleted successfully']);
    }
}
