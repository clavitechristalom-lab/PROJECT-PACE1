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
     * Display a listing of customer statements.
     */
    public function index(Request $request): JsonResponse
    {
        $query = Statement::with(['customer:customer_id,customer_code,first_name,middle_name,last_name,email,phone,address']);

        // Filter by customer
        if ($request->filled('customer_id')) {
            $query->where('customer_id', $request->customer_id);
        }

        // Filter by exact statement number
        if ($request->filled('statement_number')) {
            $query->where('statement_number', $request->statement_number);
        }

        // Filter by date range
        if ($request->filled('start_date')) {
            $query->where('start_date', '>=', $request->start_date);
        }
        if ($request->filled('end_date')) {
            $query->where('end_date', '<=', $request->end_date);
        }

        // Search by customer name, customer code, or statement number
        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('statement_number', 'like', "%{$search}%")
                  ->orWhereHas('customer', function ($cq) use ($search) {
                      $cq->where('customer_code', 'like', "%{$search}%")
                         ->orWhere('first_name', 'like', "%{$search}%")
                         ->orWhere('last_name', 'like', "%{$search}%");
                  });
            });
        }

        $perPage = (int)$request->input('per_page', 15);
        $statements = $query->orderBy('end_date', 'desc')
                            ->orderBy('id', 'desc')
                            ->paginate($perPage);

        return response()->json([
            'success' => true,
            'data'    => $statements->items(),
            'meta'    => [
                'current_page' => $statements->currentPage(),
                'last_page'    => $statements->lastPage(),
                'per_page'     => $statements->perPage(),
                'total'        => $statements->total(),
            ],
        ]);
    }

    /**
     * Store a newly created statement in the database.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'customer_id'      => 'required|exists:customers,customer_id',
            'statement_number' => 'nullable|string|max:50|unique:statements,statement_number',
            'start_date'       => 'required|date',
            'end_date'         => 'required|date|after_or_equal:start_date',
            'opening_balance'  => 'nullable|numeric|min:0',
            'total_charges'    => 'nullable|numeric|min:0',
            'total_payments'   => 'nullable|numeric|min:0',
            'closing_balance'  => 'nullable|numeric',
            'due_date'         => 'nullable|date|after_or_equal:end_date',
        ]);

        return DB::transaction(function () use ($validated) {
            $openingBalance = (float)($validated['opening_balance'] ?? 0.00);
            $totalCharges   = (float)($validated['total_charges'] ?? 0.00);
            $totalPayments  = (float)($validated['total_payments'] ?? 0.00);

            // Compute closing balance if not explicitly supplied
            $closingBalance = isset($validated['closing_balance']) && $validated['closing_balance'] !== null
                ? (float)$validated['closing_balance']
                : round($openingBalance + $totalCharges - $totalPayments, 2);

            // Statement number auto-generation if not supplied
            $statementNumber = !empty($validated['statement_number'])
                ? $validated['statement_number']
                : Statement::generateStatementNumber();

            $statement = Statement::create([
                'customer_id'      => $validated['customer_id'],
                'statement_number' => $statementNumber,
                'start_date'       => $validated['start_date'],
                'end_date'         => $validated['end_date'],
                'opening_balance'  => $openingBalance,
                'total_charges'    => $totalCharges,
                'total_payments'   => $totalPayments,
                'closing_balance'  => $closingBalance,
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
            'statement_number' => ['sometimes', 'required', 'string', 'max:50', Rule::unique('statements', 'statement_number')->ignore($id)],
            'start_date'       => 'sometimes|required|date',
            'end_date'         => 'sometimes|required|date|after_or_equal:start_date',
            'opening_balance'  => 'nullable|numeric|min:0',
            'total_charges'    => 'nullable|numeric|min:0',
            'total_payments'   => 'nullable|numeric|min:0',
            'closing_balance'  => 'nullable|numeric',
            'due_date'         => 'nullable|date|after_or_equal:end_date',
        ]);

        return DB::transaction(function () use ($statement, $validated) {
            $openingBalance = array_key_exists('opening_balance', $validated) ? (float)($validated['opening_balance'] ?? 0) : (float)$statement->opening_balance;
            $totalCharges   = array_key_exists('total_charges', $validated) ? (float)($validated['total_charges'] ?? 0) : (float)$statement->total_charges;
            $totalPayments  = array_key_exists('total_payments', $validated) ? (float)($validated['total_payments'] ?? 0) : (float)$statement->total_payments;

            $closingBalance = isset($validated['closing_balance']) && $validated['closing_balance'] !== null
                ? (float)$validated['closing_balance']
                : round($openingBalance + $totalCharges - $totalPayments, 2);

            $statement->update(array_merge($validated, [
                'opening_balance' => $openingBalance,
                'total_charges'   => $totalCharges,
                'total_payments'  => $totalPayments,
                'closing_balance' => $closingBalance,
            ]));

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

