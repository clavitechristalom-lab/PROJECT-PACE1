<?php

namespace App\Http\Controllers;

use App\Models\Statement;
use App\Models\Customer;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class StatementController extends Controller
{
    /**
     * Display a listing of customer statements with all 6 UI table columns.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        // Sync existing customer transactions into statements table if empty
        if (Statement::count() === 0) {
            Statement::syncAllFromTransactions();
        } elseif ($request->filled('customer_id')) {
            Statement::syncCustomerStatements((int)$request->customer_id);
        } elseif ($user && $user->role === 'Customer') {
            $custId = CustomerDashboardController::resolveCustomerId($user);
            if ($custId) {
                Statement::syncCustomerStatements((int)$custId);
            }
        }

        $query = Statement::with(['customer:customer_id,customer_code,first_name,middle_name,last_name,email,phone,address,branch_id,branch']);

        // Role-based Relationship Scoping:
        // 1. Customer: strictly own statements
        // 2. Store Admin / Employee: scoped to customers in assigned branch
        // 3. Administrator: global access across all branches
        if ($user && $user->role === 'Customer') {
            $custId = CustomerDashboardController::resolveCustomerId($user);
            $query->where('customer_id', $custId ?: 0);
        } elseif ($user && in_array($user->role, ['Store Administrator', 'Store Admin', 'Employee'])) {
            $branchId = $user->employee ? $user->employee->branch_id : null;
            $branchName = $user->employee ? ($user->employee->branch_name ?? $user->employee->branch) : null;
            if ($branchId || $branchName) {
                $query->whereHas('customer', function ($cq) use ($branchId, $branchName) {
                    $cq->where(function ($sub) use ($branchId, $branchName) {
                        if ($branchId) $sub->where('branch_id', $branchId);
                        if ($branchName) {
                            $sub->orWhere('branch', $branchName)
                                ->orWhereHas('branchProfile', fn($bq) => $bq->where('name', $branchName));
                        }
                    });
                });
            }
        }

        // Filter by customer
        if ($request->filled('customer_id')) {
            $query->where('customer_id', $request->customer_id);
        }

        // Filter by Type (Purchase, Payment, Down Payment, Debit, Credit)
        if ($request->filled('type') && $request->type !== 'All' && $request->type !== 'all') {
            $type = $request->type;
            $query->where(function ($q) use ($type) {
                $q->where('type', $type)->orWhere('category', $type);
            });
        }

        // Filter by Channel / Method
        if ($request->filled('channel_method')) {
            $query->where('channel_method', $request->channel_method);
        }

        // Filter by exact reference number
        if ($request->filled('reference_no')) {
            $query->where('reference_no', $request->reference_no);
        }

        // Filter by date range
        if ($request->filled('start_date')) {
            $query->where('date', '>=', $request->start_date);
        }
        if ($request->filled('end_date')) {
            $query->where('date', '<=', $request->end_date);
        }

        // Search by Reference #, Description, Account No, or Customer Name
        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('reference_no', 'like', "%{$search}%")
                  ->orWhere('description', 'like', "%{$search}%")
                  ->orWhere('channel_method', 'like', "%{$search}%")
                  ->orWhere('account_no', 'like', "%{$search}%")
                  ->orWhereHas('customer', function ($cq) use ($search) {
                      $cq->where('customer_code', 'like', "%{$search}%")
                         ->orWhere('first_name', 'like', "%{$search}%")
                         ->orWhere('last_name', 'like', "%{$search}%");
                  });
            });
        }

        $perPage = (int)$request->input('per_page', 15);
        $statements = $query->orderBy('date', 'desc')
                            ->orderBy('id', 'desc')
                            ->paginate($perPage);

        return response()->json([
            'success'    => true,
            'statements' => $statements->items(),
            'data'       => $statements->items(),
            'meta'       => [
                'current_page' => $statements->currentPage(),
                'last_page'    => $statements->lastPage(),
                'per_page'     => $statements->perPage(),
                'total'        => $statements->total(),
            ],
        ]);
    }

    /**
     * Store a newly created statement entry in the database.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'customer_id'      => 'required|exists:customers,customer_id',
            'date'             => 'nullable|date',
            'reference_no'     => 'nullable|string|max:100|unique:statements,reference_no',
            'reference'        => 'nullable|string|max:100',
            'description'      => 'nullable|string|max:255',
            'type'             => 'nullable|string|max:50',
            'channel_method'   => 'nullable|string|max:100',
            'payment_method'   => 'nullable|string|max:100',
            'amount'           => 'nullable|numeric|min:0',
            'category'         => 'nullable|string|in:Debit,Credit',
            'account_no'       => 'nullable|string|max:100',
            'status'           => 'nullable|string|max:50',
            'statement_number' => 'nullable|string|max:100',
            'start_date'       => 'nullable|date',
            'end_date'         => 'nullable|date|after_or_equal:start_date',
            'opening_balance'  => 'nullable|numeric|min:0',
            'total_charges'    => 'nullable|numeric|min:0',
            'total_payments'   => 'nullable|numeric|min:0',
            'closing_balance'  => 'nullable|numeric',
            'due_date'         => 'nullable|date',
        ]);

        return DB::transaction(function () use ($validated) {
            $dateVal    = $validated['date'] ?? $validated['start_date'] ?? now()->toDateString();
            $refNo      = $validated['reference_no'] ?? $validated['reference'] ?? $validated['statement_number'] ?? Statement::generateStatementNumber();
            $typeVal    = $validated['type'] ?? 'Purchase';
            $channelVal = $validated['channel_method'] ?? $validated['payment_method'] ?? 'Standard';
            $catVal     = $validated['category'] ?? (in_array(strtolower($typeVal), ['payment', 'down payment', 'credit']) ? 'Credit' : 'Debit');

            $opening = (float)($validated['opening_balance'] ?? 0.00);
            $charges = (float)($validated['total_charges'] ?? 0.00);
            $payments = (float)($validated['total_payments'] ?? 0.00);
            $closing = isset($validated['closing_balance']) && $validated['closing_balance'] !== null
                ? (float)$validated['closing_balance']
                : round($opening + $charges - $payments, 2);

            $amountVal = isset($validated['amount']) && $validated['amount'] !== null
                ? (float)$validated['amount']
                : ($closing > 0 ? $closing : ($charges > 0 ? $charges : $payments));

            $statement = Statement::create([
                'customer_id'      => $validated['customer_id'],
                'date'             => $dateVal,
                'reference_no'     => $refNo,
                'description'      => $validated['description'] ?? ($catVal === 'Credit' ? 'Customer Payment' : 'Product Purchase'),
                'type'             => $typeVal,
                'channel_method'   => $channelVal,
                'amount'           => $amountVal,
                'reference'        => $refNo,
                'payment_method'   => $channelVal,
                'category'         => $catVal,
                'account_no'       => $validated['account_no'] ?? null,
                'status'           => $validated['status'] ?? 'Completed',
                'statement_number' => $refNo,
                'start_date'       => $validated['start_date'] ?? $dateVal,
                'end_date'         => $validated['end_date'] ?? $dateVal,
                'opening_balance'  => $opening,
                'total_charges'    => $charges > 0 ? $charges : ($catVal === 'Debit' ? $amountVal : 0.00),
                'total_payments'   => $payments > 0 ? $payments : ($catVal === 'Credit' ? $amountVal : 0.00),
                'closing_balance'  => $closing,
                'due_date'         => $validated['due_date'] ?? null,
            ]);

            $statement->load(['customer:customer_id,customer_code,first_name,middle_name,last_name,email,phone']);

            return response()->json([
                'success' => true,
                'message' => 'Customer statement created successfully.',
                'data'    => $statement,
            ], 201);
        });
    }

    /**
     * Display the specified statement.
     */
    public function show(int $id): JsonResponse
    {
        $statement = Statement::with(['customer'])->find($id);

        if (!$statement) {
            return response()->json([
                'success' => false,
                'message' => 'Statement not found.',
            ], 404);
        }

        return response()->json([
            'success' => true,
            'data'    => $statement,
        ]);
    }

    /**
     * Update the specified statement in the database.
     */
    public function update(Request $request, int $id): JsonResponse
    {
        $statement = Statement::find($id);

        if (!$statement) {
            return response()->json([
                'success' => false,
                'message' => 'Statement not found.',
            ], 404);
        }

        $validated = $request->validate([
            'customer_id'      => 'sometimes|required|exists:customers,customer_id',
            'date'             => 'nullable|date',
            'reference_no'     => ['nullable', 'string', 'max:100', Rule::unique('statements', 'reference_no')->ignore($id)],
            'reference'        => 'nullable|string|max:100',
            'description'      => 'nullable|string|max:255',
            'type'             => 'nullable|string|max:50',
            'channel_method'   => 'nullable|string|max:100',
            'payment_method'   => 'nullable|string|max:100',
            'amount'           => 'nullable|numeric|min:0',
            'category'         => 'nullable|string|in:Debit,Credit',
            'account_no'       => 'nullable|string|max:100',
            'status'           => 'nullable|string|max:50',
            'statement_number' => 'nullable|string|max:100',
            'start_date'       => 'nullable|date',
            'end_date'         => 'nullable|date|after_or_equal:start_date',
            'opening_balance'  => 'nullable|numeric|min:0',
            'total_charges'    => 'nullable|numeric|min:0',
            'total_payments'   => 'nullable|numeric|min:0',
            'closing_balance'  => 'nullable|numeric',
            'due_date'         => 'nullable|date',
        ]);

        return DB::transaction(function () use ($statement, $validated) {
            $statement->update($validated);
            $statement->load(['customer']);

            return response()->json([
                'success' => true,
                'message' => 'Statement updated successfully.',
                'data'    => $statement,
            ]);
        });
    }

    /**
     * Remove the specified statement from the database.
     */
    public function destroy(int $id): JsonResponse
    {
        $statement = Statement::find($id);

        if (!$statement) {
            return response()->json([
                'success' => false,
                'message' => 'Statement not found.',
            ], 404);
        }

        $statement->delete();

        return response()->json([
            'success' => true,
            'message' => 'Statement deleted successfully.',
        ]);
    }
}
